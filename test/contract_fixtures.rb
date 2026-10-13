require 'json'
require 'yaml'
require 'fileutils'

# Records and replays the language-neutral API contract fixtures in
# testdata/contract. Every scenario starts from a fixed save that is built
# here without any randomness, so the fixtures don't depend on Ruby's RNG
# (except restart_game, which deals a new random game; see the README).
#
# Mixed into a TestHelper subclass: it uses Rack::Test and the test Redis key.
module ContractFixtures
  ROOT = File.expand_path('../testdata/contract', __dir__)
  STATES_DIR = File.join(ROOT, 'states')
  SCENARIOS_DIR = File.join(ROOT, 'scenarios')
  RNG_SEED = 20_261_013
  JSON_HEADERS = { 'Content-Type' => 'application/json' }.freeze

  CITY_COLORS = JSON.parse(File.read(File.expand_path('../public/cities.json', __dir__)))
                    .transform_values { |data| data['color'].to_sym }.freeze

  # Starting saves. Each variant changes the base game; supply counts are
  # recomputed from the board afterwards, so variants only move cubes.
  STATES = {
    'base' => ->(_game) {},
    'base_after_concurrent_move' => lambda do |game|
      game.players[0].location = 'Hong Kong'
      set(game, :actions_remaining, 3)
    end,
    'no_cubes_here' => ->(game) { game.cities['Wuhan'].disease_cubes = 0 },
    'scientist_in_beijing' => ->(game) { game.players[0].location = 'Beijing' },
    'scientist_in_bangkok' => ->(game) { game.players[0].location = 'Bangkok' },
    'share_hand_limit' => lambda do |game|
      game.players[1].hand = city_cards('Lagos', 'Cairo', 'Kinshasa', 'Lima', 'Riyadh', 'Baghdad', 'Kolkata')
    end,
    'draw_phase' => ->(game) { draw_phase(game) },
    'draw_phase_actions_left' => lambda do |game|
      draw_phase(game)
      set(game, :actions_remaining, 2)
    end,
    'draw_phase_epidemic' => lambda do |game|
      draw_phase(game)
      # The epidemic is drawn first. Its bottom infection card is Bangkok,
      # which already has a cube, so it outbreaks. The infection discard is
      # empty, so intensify only shuffles Bangkok and the result is fixed.
      game.player_deck.push(Card.new(:epidemic, 'Event:Epidemic'))
      game.infection_deck[0] = city_card('Bangkok')
      game.infection_discard.clear
    end,
    'draw_phase_hand_limit' => lambda do |game|
      draw_phase(game)
      game.players[0].hand.concat(city_cards('Kyoto', 'Manila'))
    end,
    'draw_phase_last_player_card' => lambda do |game|
      draw_phase(game)
      set(game, :player_deck, city_cards('Istanbul'))
    end,
    'infect_phase' => lambda do |game|
      set(game, :actions_remaining, 0)
      set(game, :phase, 'infect_cities')
    end,
    'infect_phase_quiet_night' => lambda do |game|
      set(game, :actions_remaining, 0)
      set(game, :phase, 'infect_cities')
      set(game, :quiet_night, true)
    end,
    'pending_discard' => lambda do |game|
      game.players[1].hand = city_cards('Lagos', 'Cairo', 'Mexico City', 'Los Angeles', 'Buenos Aires', 'Riyadh',
                                        'Baghdad') + [Card.new(:action, 'One Quiet Night')]
      set(game, :phase, 'pending_discard')
      set(game, :pending_hand_limit, { player_index: 1, discard_count: 1, return_phase: 'player_actions' })
    end,
    'forecast_active' => lambda do |game|
      game.player_discard.push(Card.new(:action, 'Forecast'))
      game.players[0].hand.push(Card.new(:action, 'Airlift'))
      set(game, :forecast_active, true)
      set(game, :forecast_cards, game.infection_deck.first(6).map(&:name))
    end,
    'event_cards' => lambda do |game|
      game.players[0].hand.push(Card.new(:action, 'Airlift'), Card.new(:action, 'Forecast'))
      game.players[1].hand.push(Card.new(:action, 'Government Grant'), Card.new(:action, 'One Quiet Night'))
      game.players[2].hand.push(Card.new(:action, 'Resilient Population'))
    end,
    'contingency_planner' => lambda do |game|
      replace_role(game, 0, :contingency_planner)
      game.player_discard.push(Card.new(:action, 'Airlift'))
    end,
    'contingency_planner_hand_limit' => lambda do |game|
      replace_role(game, 0, :contingency_planner)
      game.players[0].hand.concat(city_cards('Kyoto', 'Manila'))
      game.player_discard.push(Card.new(:action, 'Airlift'))
    end,
    'contingency_planner_retrieved' => lambda do |game|
      replace_role(game, 0, :contingency_planner)
      airlift = Card.new(:action, 'Airlift')
      airlift.retrieved = true
      game.players[0].hand.push(airlift)
    end,
    'operations_expert_at_station' => lambda do |game|
      set(game, :current_player_idx, 3)
      game.players[3].location = 'Wuhan'
    end,
    'operations_expert_away' => ->(game) { set(game, :current_player_idx, 3) }
  }.freeze

  # A save from before forecast_active, operations_expert_move_used and
  # difficulty_level were stored. Its cards have no retrieved flag (only
  # retrieved cards ever carry one).
  LEGACY_STATE = 'legacy_save'.freeze
  LEGACY_REMOVED_KEYS = %i[forecast_active forecast_cards operations_expert_move_used difficulty_level].freeze

  SCENARIOS = [
    # game_state.json
    ['state', 'base', 'GET', '/game_state.json', nil, 'Read the client JSON view'],
    ['state_legacy_save', LEGACY_STATE, 'GET', '/game_state.json', nil,
     'Read an older save; read-only requests never write the filled-in defaults'],

    # move
    ['move_drive', 'base', 'POST', '/move', { player_index: 0, destination: 'Bangkok' }, 'Drive to a connected city'],
    ['move_legacy_save', LEGACY_STATE, 'POST', '/move', { player_index: 0, destination: 'Bangkok' },
     'Move in an older save; the write adds the defaulted fields (difficulty falls back to heroic)'],
    ['move_card_required_flight_choice', 'base', 'POST', '/move', { player_index: 0, destination: 'Paris' },
     'Holding both the current and destination city cards: card_required with HTTP 200'],
    ['move_direct_flight', 'base', 'POST', '/move', { player_index: 0, destination: 'Paris', card_name: 'Paris' },
     'Direct flight by discarding the destination card'],
    ['move_charter_flight', 'base', 'POST', '/move', { player_index: 0, destination: 'Paris', card_name: 'Wuhan' },
     'Charter flight by discarding the current city card'],
    ['move_card_mismatch', 'base', 'POST', '/move', { player_index: 0, destination: 'Paris', card_name: 'Seoul' },
     'Card name matches neither city'],
    ['move_dispatcher_other_pawn_rejected', 'base', 'POST', '/move', { player_index: 1, destination: 'Bangkok' },
     'A non-dispatcher cannot move another pawn'],
    ['move_unknown_destination', 'base', 'POST', '/move', { player_index: 0, destination: 'Atlantis' },
     'Unknown city: game-logic error with success false'],
    ['move_missing_parameters', 'base', 'POST', '/move', {}, 'Schema failure: Missing required parameters'],
    ['move_invalid_parameters', 'base', 'POST', '/move', { player_index: 'abc', destination: 'Bangkok' },
     'Schema failure: Invalid parameters'],
    ['move_out_of_phase', 'draw_phase', 'POST', '/move', { player_index: 0, destination: 'Bangkok' },
     'check_action error (no success key)'],
    ['move_pending_discard', 'pending_discard', 'POST', '/move', { player_index: 0, destination: 'Bangkok' },
     'Actions are blocked while a hand-limit discard is pending'],
    ['move_forecast_active', 'forecast_active', 'POST', '/move', { player_index: 0, destination: 'Bangkok' },
     'Blocked by an unfinished Forecast'],
    ['move_conflict', 'base', 'POST', '/move', { player_index: 0, destination: 'Bangkok' },
     'Another request commits first: 409 with the current game state', 'base_after_concurrent_move'],
    ['move_operations_expert_card_required', 'operations_expert_at_station', 'POST', '/move',
     { player_index: 3, destination: 'Lima' }, 'Operations Expert special move needs a card: card_required'],
    ['move_operations_expert_special', 'operations_expert_at_station', 'POST', '/move',
     { player_index: 3, destination: 'Lima', card_name: 'Kyiv' }, 'Operations Expert special move'],

    # treat
    ['treat', 'base', 'POST', '/treat', nil, 'Treat one cube'],
    ['treat_no_cubes', 'no_cubes_here', 'POST', '/treat', nil, 'action_unavailable with HTTP 422'],
    ['treat_out_of_phase', 'infect_phase', 'POST', '/treat', nil, 'check_action error'],

    # cure_disease
    ['cure_disease', 'base', 'POST', '/cure_disease',
     { color: 'red', card_names: %w[Wuhan Beijing Shanghai Seoul] }, 'Scientist cures with four cards'],
    ['cure_disease_wrong_cards', 'base', 'POST', '/cure_disease',
     { color: 'blue', card_names: %w[Wuhan Beijing Shanghai Seoul] }, 'Cards do not match the color'],
    ['cure_disease_missing_parameters', 'base', 'POST', '/cure_disease', { color: 'red' }, 'Schema failure'],

    # retrieve
    ['retrieve', 'contingency_planner', 'POST', '/retrieve', { action_card_name: 'Airlift' },
     'Contingency Planner takes an event card from the discard pile'],
    ['retrieve_hand_limit', 'contingency_planner_hand_limit', 'POST', '/retrieve', { action_card_name: 'Airlift' },
     'The Contingency Planner goes over seven cards: pending discard'],
    ['retrieve_city_card', 'contingency_planner', 'POST', '/retrieve', { action_card_name: 'Havana' },
     'Only event cards can be retrieved'],
    ['retrieve_not_contingency_planner', 'base', 'POST', '/retrieve', { action_card_name: 'Airlift' },
     'Only the Contingency Planner can retrieve'],
    ['retrieve_missing_parameters', 'contingency_planner', 'POST', '/retrieve', {}, 'Schema failure'],

    # share_knowledge
    ['share_knowledge', 'base', 'POST', '/share_knowledge',
     { giving_player_index: 0, receiving_player_index: 1, city_name: 'Wuhan' }, 'Give the current city card'],
    ['share_knowledge_hand_limit', 'share_hand_limit', 'POST', '/share_knowledge',
     { giving_player_index: 0, receiving_player_index: 1, city_name: 'Wuhan' },
     'The receiver goes over seven cards: pending discard'],
    ['share_knowledge_not_same_city', 'base', 'POST', '/share_knowledge',
     { giving_player_index: 0, receiving_player_index: 2, city_name: 'Wuhan' }, 'Players are in different cities'],
    ['share_knowledge_missing_parameters', 'base', 'POST', '/share_knowledge', { giving_player_index: 0 },
     'Schema failure'],

    # pass
    ['pass', 'base', 'POST', '/pass', nil, 'Pass ends the action phase'],
    ['pass_out_of_phase', 'draw_phase', 'POST', '/pass', nil, 'check_action error'],

    # draw_cards
    ['draw_cards', 'draw_phase', 'POST', '/draw_cards', nil, 'Draw two city cards'],
    ['draw_cards_epidemic', 'draw_phase_epidemic', 'POST', '/draw_cards', nil,
     'Epidemic: infection rate, bottom card with outbreak, intensify'],
    ['draw_cards_hand_limit', 'draw_phase_hand_limit', 'POST', '/draw_cards', nil,
     'The second draw goes over the hand limit: pending discard'],
    ['draw_cards_player_deck_runs_out', 'draw_phase_last_player_card', 'POST', '/draw_cards', nil,
     'Game over (no player cards): end_turn_events is null and the phase stays draw_cards'],
    ['draw_cards_actions_left', 'draw_phase_actions_left', 'POST', '/draw_cards', nil,
     'Draw phase with actions left: bare success, nothing changes'],
    ['draw_cards_out_of_phase', 'base', 'POST', '/draw_cards', nil, 'Wrong phase'],
    ['draw_cards_pending_discard', 'pending_discard', 'POST', '/draw_cards', nil, 'Pending hand-limit discard'],
    ['draw_cards_forecast_active', 'forecast_active', 'POST', '/draw_cards', nil, 'Blocked by an unfinished Forecast'],

    # infect_cities
    ['infect_cities', 'infect_phase', 'POST', '/infect_cities', nil, 'Infect two cities and start the next turn'],
    ['infect_cities_quiet_night', 'infect_phase_quiet_night', 'POST', '/infect_cities', nil,
     'One Quiet Night skips infection'],
    ['infect_cities_out_of_phase', 'draw_phase', 'POST', '/infect_cities', nil, 'Wrong phase'],
    ['infect_cities_pending_discard', 'pending_discard', 'POST', '/infect_cities', nil, 'Pending hand-limit discard'],

    # build_research_station
    ['build_research_station', 'scientist_in_beijing', 'POST', '/build_research_station', nil,
     'Build by discarding the city card'],
    ['build_research_station_operations_expert', 'operations_expert_away', 'POST', '/build_research_station', nil,
     'Operations Expert builds without a card'],
    ['build_research_station_without_card', 'scientist_in_bangkok', 'POST', '/build_research_station', nil,
     'Missing city card'],
    ['build_research_station_already_exists', 'base', 'POST', '/build_research_station', nil,
     'A station is already there'],

    # discard_cards
    ['discard_cards', 'pending_discard', 'POST', '/discard_cards', { player_index: 1, card_names: ['Riyadh'] },
     'Resolve the pending discard'],
    ['discard_cards_wrong_count', 'pending_discard', 'POST', '/discard_cards',
     { player_index: 1, card_names: %w[Riyadh Baghdad] }, 'Must discard exactly the excess'],
    ['discard_cards_wrong_player', 'pending_discard', 'POST', '/discard_cards',
     { player_index: 0, card_names: ['Wuhan'] }, 'Only the player over the limit may discard'],
    ['discard_cards_missing_card', 'pending_discard', 'POST', '/discard_cards',
     { player_index: 1, card_names: ['Tokyo'] }, 'Card not in hand'],
    ['discard_cards_not_pending', 'base', 'POST', '/discard_cards', { player_index: 0, card_names: ['Wuhan'] },
     'No discard is pending'],
    ['discard_cards_invalid_parameters', 'pending_discard', 'POST', '/discard_cards',
     { player_index: 1, card_names: 'Riyadh' }, 'Schema failure: card_names is not an array'],

    # action_card
    ['action_card_airlift', 'event_cards', 'POST', '/action_card', { card: 'Airlift', player_index: 1, city: 'Paris' },
     'Airlift another player'],
    ['action_card_airlift_unknown_city', 'event_cards', 'POST', '/action_card',
     { card: 'Airlift', player_index: 0, city: 'Atlantis' }, 'Airlift to an unknown city'],
    ['action_card_one_quiet_night', 'event_cards', 'POST', '/action_card', { card: 'One Quiet Night' },
     'Sets quiet_night (saved, not in the JSON view)'],
    ['action_card_resilient_population', 'event_cards', 'POST', '/action_card',
     { card: 'Resilient Population', city: 'Cairo' }, 'Remove a card from the infection discard pile'],
    ['action_card_resilient_population_not_in_discard', 'event_cards', 'POST', '/action_card',
     { card: 'Resilient Population', city: 'Tokyo' }, 'City not in the infection discard pile'],
    ['action_card_government_grant', 'event_cards', 'POST', '/action_card', { card: 'Government Grant', city: 'Tokyo' },
     'Build a station anywhere'],
    ['action_card_government_grant_existing_station', 'event_cards', 'POST', '/action_card',
     { card: 'Government Grant', city: 'Wuhan' }, 'Station already exists'],
    ['action_card_forecast', 'event_cards', 'POST', '/action_card', { card: 'Forecast' },
     'Forecast, step 1: shows the first six cards of the infection deck array (the bottom of the draw pile)'],
    ['action_card_forecast_apply', 'forecast_active', 'POST', '/action_card',
     { card: 'Forecast', card_order: %w[Mumbai Kabul Tehran Houston Chicago Montreal] },
     'Forecast, step 2: reorder; the response is the bare JSON view'],
    ['action_card_forecast_invalid_order', 'forecast_active', 'POST', '/action_card',
     { card: 'Forecast', card_order: ['Paris'] }, 'Not a permutation: error with HTTP 200'],
    ['action_card_forecast_blocked', 'forecast_active', 'POST', '/action_card',
     { card: 'Airlift', player_index: 0, city: 'Paris' }, 'Other event cards during Forecast: error with HTTP 200'],
    ['action_card_retrieved_card_leaves_game', 'contingency_planner_retrieved', 'POST', '/action_card',
     { card: 'Airlift', player_index: 0, city: 'Paris' }, 'A retrieved event card is not discarded after use'],
    ['action_card_resolves_pending_discard', 'pending_discard', 'POST', '/action_card', { card: 'One Quiet Night' },
     'Playing an event card can resolve a pending discard'],
    ['action_card_not_held', 'base', 'POST', '/action_card', { card: 'Airlift', player_index: 0, city: 'Paris' },
     'Nobody holds the card'],
    ['action_card_unknown', 'base', 'POST', '/action_card', { card: 'Epidemic' }, 'Unknown card: HTTP 500'],
    ['action_card_missing_parameters', 'base', 'POST', '/action_card', {}, 'Schema failure'],

    # restart_game
    ['restart_game', 'base', 'POST', '/restart_game', {},
     'New random game, same difficulty (after.yaml depends on the Ruby RNG)'],
    ['restart_game_difficulty', 'base', 'POST', '/restart_game', { difficulty_level: 'introductory' },
     'New random game with a new difficulty (after.yaml depends on the Ruby RNG)'],
    ['restart_game_invalid_difficulty', 'base', 'POST', '/restart_game', { difficulty_level: 'nightmare' },
     'Schema failure'],
    ['restart_game_forecast_active', 'forecast_active', 'POST', '/restart_game', {},
     'Even restart is blocked by an unfinished Forecast']
  ].map do |name, state, method, path, body, description, concurrent_state|
    { name:, state:, method:, path:, body:, description:, concurrent_state: }
  end.freeze

  class << self
    def set(game, name, value)
      game.instance_variable_set(:"@#{name}", value)
    end

    def city_card(name)
      Card.new(:city, name, CITY_COLORS.fetch(name))
    end

    def city_cards(*names)
      names.map { |name| city_card(name) }
    end

    def draw_phase(game)
      set(game, :actions_remaining, 0)
      set(game, :phase, 'draw_cards')
    end

    def replace_role(game, index, role)
      old = game.players[index]
      player = Player.new(role, index, old.location)
      player.hand = old.hand
      game.players[index] = player
    end

    def build_states
      states = STATES.to_h { |name, variant| [name, build_state(variant)] }
      states[LEGACY_STATE] = legacy_state(states.fetch('base'))
      states
    end

    private

    def build_state(variant)
      game = base_game
      variant.call(game)
      GameStateConfig::COLORS.each do |color|
        on_board = game.cities.values.select { |city| city.color == color }.sum(&:disease_cubes)
        game.disease_cubes[color] = GameStateConfig::MAX_DISEASE_CUBES_PER_COLOR - on_board
      end
      set(game, :current_player, game.players[game.current_player_idx])
      game.serialized_state
    end

    def legacy_state(base_yaml)
      state = YAML.load(base_yaml, permitted_classes: [Symbol])
      LEGACY_REMOVED_KEYS.each { |key| state[:game_status].delete(key) }
      state.to_yaml
    end

    def base_game
      game = GameState.allocate
      cities = game.send(:init_cities)
      { 'Wuhan' => 2, 'Bangkok' => 1, 'Paris' => 3, 'Lagos' => 1, 'Cairo' => 2 }.each do |name, cubes|
        cities[name].disease_cubes = cubes
      end

      players = [
        [:scientist, 'Wuhan', %w[Wuhan Beijing Shanghai Seoul Paris]],
        [:medic, 'Wuhan', %w[Lagos Cairo]],
        [:dispatcher, 'London', %w[London Lima]],
        [:operations_expert, 'Paris', %w[Tokyo Kyiv]]
      ].each_with_index.map do |(role, location, hand), index|
        player = Player.new(role, index, location)
        player.hand = city_cards(*hand)
        player
      end

      {
        players_count: players.size,
        difficulty_level: :normal,
        cities:,
        players:,
        current_player_idx: 0,
        actions_remaining: 4,
        phase: 'player_actions',
        pending_hand_limit: nil,
        turn: 1,
        game_over: false,
        game_over_reason: nil,
        outbreak_count: 0,
        infection_rate_marker: 0,
        infection_rate: GameStateConfig::INFECTION_RATE_TRACK[0],
        quiet_night: nil,
        forecast_active: false,
        forecast_cards: nil,
        operations_expert_move_used: false,
        disease_cubes: GameStateConfig::COLORS.to_h { |color| [color, 0] },
        cures: GameStateConfig::COLORS.to_h { |color| [color, false] },
        research_stations: ['Wuhan'],
        # Draws pop from the end of each deck.
        player_deck: city_cards('Santiago', 'Sydney', 'Moscow', 'Rome', 'Kinshasa', 'Delhi', 'Istanbul'),
        player_discard: city_cards('Havana'),
        infection_deck: city_cards('Montreal', 'Chicago', 'Houston', 'Tehran', 'Kabul', 'Mumbai', 'Jakarta',
                                   'Sao Paulo', 'Nairobi', 'Stockholm'),
        infection_discard: city_cards('Wuhan', 'Bangkok', 'Paris', 'Lagos', 'Cairo')
      }.each { |name, value| set(game, name, value) }
      game
    end
  end


  private

  def contract_state_path(state_name)
    "states/#{state_name}.yaml"
  end

  def read_contract_file(relative_path)
    File.read(File.join(ROOT, relative_path))
  end

  def contract_request(scenario)
    {
      'method' => scenario[:method],
      'path' => scenario[:path],
      'headers' => scenario[:body].nil? ? {} : JSON_HEADERS,
      'body' => scenario[:body]
    }
  end

  # Replays one request from a saved state and returns the scenario document
  # (as written to scenario.json) and the save left in Redis afterwards.
  def run_contract_request(name:, description:, request:, save_before:, concurrent_save: nil, states: nil)
    before = states ? states.fetch(state_name(save_before)) : read_contract_file(save_before)
    concurrent = concurrent_save && (states ? states.fetch(state_name(concurrent_save)) : read_contract_file(concurrent_save))
    @redis.set(@test_redis_key, before)
    clear_cookies

    previous_seed = srand(RNG_SEED)
    begin
      with_concurrent_save(concurrent) { perform_contract_request(request) }
    ensure
      srand(previous_seed)
    end

    after = @redis.get(@test_redis_key)
    document = {
      'name' => name,
      'description' => description,
      'save_before' => save_before
    }
    document['concurrent_save'] = concurrent_save if concurrent_save
    document['request'] = request
    document['response'] = {
      'status' => last_response.status,
      'content_type' => last_response.content_type,
      'body' => JSON.parse(last_response.body)
    }
    document['save_after'] = after == before ? 'unchanged' : "scenarios/#{name}/after.yaml"
    [document, after]
  end

  def state_name(path)
    File.basename(path, '.yaml')
  end

  def perform_contract_request(request)
    env = request['headers'].transform_keys { |header| header.upcase.tr('-', '_') }
    body = request['body'].nil? ? nil : JSON.generate(request['body'])
    case request['method']
    when 'GET' then get(request['path'], nil, env)
    when 'POST' then post(request['path'], body, env)
    else raise ArgumentError, "Unsupported method #{request['method']}"
    end
  end

  # Writes another request's save right after this request loads the game, so
  # its commit sees a changed value and gets a 409.
  def with_concurrent_save(concurrent)
    return yield unless concurrent

    original_load = GameState.method(:load_from_redis)
    redis = @redis
    redis_key = @test_redis_key
    written = false
    GameState.define_singleton_method(:load_from_redis) do |*args|
      original_load.call(*args).tap do
        unless written
          written = true
          redis.set(redis_key, concurrent)
        end
      end
    end
    yield
  ensure
    GameState.define_singleton_method(:load_from_redis, original_load) if concurrent
  end

  def contract_json(document)
    "#{JSON.pretty_generate(document)}\n"
  end

  def record_contract_fixtures
    states = ContractFixtures.build_states
    FileUtils.rm_rf([STATES_DIR, SCENARIOS_DIR])
    FileUtils.mkdir_p(STATES_DIR)
    states.each { |name, yaml| File.write(File.join(STATES_DIR, "#{name}.yaml"), yaml) }

    SCENARIOS.each do |scenario|
      document, after = run_contract_request(
        name: scenario[:name],
        description: scenario[:description],
        request: contract_request(scenario),
        save_before: contract_state_path(scenario[:state]),
        concurrent_save: scenario[:concurrent_state] && contract_state_path(scenario[:concurrent_state]),
        states:
      )
      directory = File.join(SCENARIOS_DIR, scenario[:name])
      FileUtils.mkdir_p(directory)
      File.write(File.join(directory, 'scenario.json'), contract_json(document))
      File.write(File.join(directory, 'after.yaml'), after) unless document['save_after'] == 'unchanged'
    end
  end
end
