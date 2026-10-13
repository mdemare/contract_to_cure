# API contract fixtures

These fixtures freeze what the Rails backend does today, request by request. They
are the parity spec for the Go port (epic cc-368): the Go backend should pass every
scenario here before it replaces Rails.

`test/test_contract_fixtures.rb` replays every scenario against Rails on each
`make check`. After an intended behavior change, re-record them with
`bundle exec rake contract:record` and review the diff.

## Layout

- `states/<name>.yaml`: saved games, byte for byte as Rails stores them in Redis.
  They are built in `test/contract_fixtures.rb` without randomness: fixed roles,
  hands, decks and cubes.
- `scenarios/<name>/scenario.json`: one request and its response.
  - `save_before`: the state that is in Redis when the request starts.
  - `concurrent_save` (only in `move_conflict`): a save that another request
    commits right after this request has loaded the game.
  - `request`: `method`, `path`, `headers` and the JSON `body`. A `null` body
    means the request is sent with no body.
  - `response`: HTTP `status`, `content_type` and the parsed JSON `body`.
  - `save_after`: `"unchanged"` when Redis still holds `save_before` byte for byte.
    Otherwise it is the path of the `after.yaml` that Redis holds after the request.
- `scenarios/<name>/after.yaml`: the save after the request, when it changed.

## Replaying a scenario

1. SET the game key to the `save_before` file's contents.
2. If there is a `concurrent_save`, overwrite the key with it right after the
   request has first read the game.
3. Send the request. Compare the status, the content type and the body. Key order
   matters, and so do `null` values versus missing keys.
4. Compare Redis with `save_after`. While Rails and Go must read each other's
   saves (cc-376), compare the YAML exactly. If the save format changes later,
   compare the decoded values instead.

The Rails test seeds Ruby's RNG with `20261013` before each request. Only the two
`restart_game` scenarios with a 200 response depend on it: they deal a new random
game, so for those compare the shape of `after.yaml` (deck sizes, epidemic count
for the difficulty, 9 infected cities, 4 players with hands), not its contents.
Every other scenario is fully deterministic.

## Known quirks the port must keep

Responses
- Errors from `check_action` (any player action outside the `player_actions`
  phase, including during `pending_discard`) are `{status, message}` with HTTP 422
  and no `success` key (`move_out_of_phase`, `pass_out_of_phase`,
  `move_pending_discard`).
- Inside `/action_card`, while a Forecast is active, playing another card or a
  wrong `card_order` returns `{status: "error", message}` with **HTTP 200**
  (`action_card_forecast_blocked`, `action_card_forecast_invalid_order`).
  Finishing the Forecast returns the bare JSON view with no `status` key
  (`action_card_forecast_apply`).
- Every other endpoint except `GET /game_state.json` is blocked with HTTP 422 while a
  Forecast is active, including `/restart_game` and `/draw_cards`
  (`*_forecast_active`).
- `card_required` is `success: false` but HTTP 200, with `movement_type` and,
  for a flight choice, `options` (`move_card_required_flight_choice`,
  `move_operations_expert_card_required`).
- An untreatable city returns `status: "action_unavailable"` with HTTP 422 and
  includes `game_state` (`treat_no_cubes`).
- An unknown event card returns HTTP 500 (`action_card_unknown`).
- A schema failure returns 422 with only "Missing required parameters" or
  "Invalid parameters".
- `/draw_cards` and `/infect_cities` in their phase but with actions left return
  just `{status: "success"}` and change nothing (`draw_cards_actions_left`).
  Otherwise the body is `success, status, message: null, end_turn,
  end_turn_events, game_state`.
- A 409 conflict returns `success: false, status: "conflict"` and the
  *concurrent* game state, and Redis keeps the other request's save
  (`move_conflict`).
- `GET /game_state.json` adds `current_user`. It is `null` here because tests
  bypass authentication without a user.
- `restart_game` does not return a `game_state`.
- Every JSON response has `Content-Type: application/json; charset=utf-8`.

Game logic
- An epidemic that outbreaks emits the `outbreak` event twice: once from
  `trigger_outbreak`, and once more because `handle_epidemic` appends what
  `add_disease_cubes` returns (`draw_cards_epidemic`).
- When the game ends during `/draw_cards` or `/infect_cities`, `end_turn_events`
  is `{game_over: true, reason, events}` with the events up to the game over, and
  the phase stays where it was (`draw_cards_player_deck_runs_out`). `reason` is
  `no_player_cards`, `too_many_outbreaks` or `no_cubes`.
- Draws pop from the *end* of each deck array, and an epidemic takes the *first*
  infection card. Forecast also looks at, and reorders, the *first* six cards of
  the infection deck array, which is the bottom of the draw pile. Reordered cards are
  saved with type `infection`; all other infection cards have type `city`
  (`action_card_forecast`, `action_card_forecast_apply`).
- Playing a retrieved event card removes it from the game, not to the discard pile
  (`action_card_retrieved_card_leaves_game`).
- A successful event card resolves a pending hand-limit discard once the hand is
  back to 7 (`action_card_resolves_pending_discard`).
- `quiet_night` is saved but not shown in the JSON view. `infect_cities` with it
  set skips infection, clears it, and still starts the next turn
  (`action_card_one_quiet_night`, `infect_cities_quiet_night`).

JSON view and saves
- `gameStatus` mixes camelCase with the snake_case fields `actions_remaining`,
  `pending_hand_limit`, `forecast_active`, `forecast_cards` and
  `operations_expert_move_used`. The game-over reason, `quiet_night` and the deck
  order are not exposed. Hands are sorted by card type and then color. In these
  fixtures cards that tie keep their saved order, so a stable sort matches them.
- Saves use Ruby symbol keys (`:game_status:`) and symbol values (`:city`,
  `:red`). `retrieved: true` is written only for retrieved cards.
- An older save without `forecast_active`, `forecast_cards`,
  `operations_expert_move_used` or `difficulty_level` loads with `false`/`nil`
  defaults and the configured default difficulty (`heroic`). A read-only request
  leaves the save untouched (`state_legacy_save`); the next write stores the
  defaults (`move_legacy_save`).

## Not captured here

- A missing or undecodable save starts a new random game. Existing Ruby tests
  cover this (Q13-cc).
- Authentication (401 responses): see `test/test_api_authentication.rb` and cc-378.
- Redis connection errors.

## Scenarios

### `GET /game_state.json`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `state` | `base` | Read the client JSON view |
| `state_legacy_save` | `legacy_save` | Read an older save; read-only requests never write the filled-in defaults |

### `POST /move`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `move_drive` | `base` | Drive to a connected city |
| `move_legacy_save` | `legacy_save` | Move in an older save; the write adds the defaulted fields (difficulty falls back to heroic) |
| `move_card_required_flight_choice` | `base` | Holding both the current and destination city cards: card_required with HTTP 200 |
| `move_direct_flight` | `base` | Direct flight by discarding the destination card |
| `move_charter_flight` | `base` | Charter flight by discarding the current city card |
| `move_card_mismatch` | `base` | Card name matches neither city |
| `move_dispatcher_other_pawn_rejected` | `base` | A non-dispatcher cannot move another pawn |
| `move_unknown_destination` | `base` | Unknown city: game-logic error with success false |
| `move_missing_parameters` | `base` | Schema failure: Missing required parameters |
| `move_invalid_parameters` | `base` | Schema failure: Invalid parameters |
| `move_out_of_phase` | `draw_phase` | check_action error (no success key) |
| `move_pending_discard` | `pending_discard` | Actions are blocked while a hand-limit discard is pending |
| `move_forecast_active` | `forecast_active` | Blocked by an unfinished Forecast |
| `move_conflict` | `base` (concurrent: `base_after_concurrent_move`) | Another request commits first: 409 with the current game state |
| `move_operations_expert_card_required` | `operations_expert_at_station` | Operations Expert special move needs a card: card_required |
| `move_operations_expert_special` | `operations_expert_at_station` | Operations Expert special move |

### `POST /treat`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `treat` | `base` | Treat one cube |
| `treat_no_cubes` | `no_cubes_here` | action_unavailable with HTTP 422 |
| `treat_out_of_phase` | `infect_phase` | check_action error |

### `POST /cure_disease`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `cure_disease` | `base` | Scientist cures with four cards |
| `cure_disease_wrong_cards` | `base` | Cards do not match the color |
| `cure_disease_missing_parameters` | `base` | Schema failure |

### `POST /retrieve`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `retrieve` | `contingency_planner` | Contingency Planner takes an event card from the discard pile |
| `retrieve_hand_limit` | `contingency_planner_hand_limit` | The Contingency Planner goes over seven cards: pending discard |
| `retrieve_city_card` | `contingency_planner` | Only event cards can be retrieved |
| `retrieve_not_contingency_planner` | `base` | Only the Contingency Planner can retrieve |
| `retrieve_missing_parameters` | `contingency_planner` | Schema failure |

### `POST /share_knowledge`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `share_knowledge` | `base` | Give the current city card |
| `share_knowledge_hand_limit` | `share_hand_limit` | The receiver goes over seven cards: pending discard |
| `share_knowledge_not_same_city` | `base` | Players are in different cities |
| `share_knowledge_missing_parameters` | `base` | Schema failure |

### `POST /pass`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `pass` | `base` | Pass ends the action phase |
| `pass_out_of_phase` | `draw_phase` | check_action error |

### `POST /draw_cards`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `draw_cards` | `draw_phase` | Draw two city cards |
| `draw_cards_epidemic` | `draw_phase_epidemic` | Epidemic: infection rate, bottom card with outbreak, intensify |
| `draw_cards_hand_limit` | `draw_phase_hand_limit` | The second draw goes over the hand limit: pending discard |
| `draw_cards_player_deck_runs_out` | `draw_phase_last_player_card` | Game over (no player cards): end_turn_events has game_over, reason no_player_cards and the draw event; the phase stays draw_cards |
| `draw_cards_actions_left` | `draw_phase_actions_left` | Draw phase with actions left: bare success, nothing changes |
| `draw_cards_out_of_phase` | `base` | Wrong phase |
| `draw_cards_pending_discard` | `pending_discard` | Pending hand-limit discard |
| `draw_cards_forecast_active` | `forecast_active` | Blocked by an unfinished Forecast |

### `POST /infect_cities`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `infect_cities` | `infect_phase` | Infect two cities and start the next turn |
| `infect_cities_quiet_night` | `infect_phase_quiet_night` | One Quiet Night skips infection |
| `infect_cities_out_of_phase` | `draw_phase` | Wrong phase |
| `infect_cities_pending_discard` | `pending_discard` | Pending hand-limit discard |

### `POST /build_research_station`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `build_research_station` | `scientist_in_beijing` | Build by discarding the city card |
| `build_research_station_operations_expert` | `operations_expert_away` | Operations Expert builds without a card |
| `build_research_station_without_card` | `scientist_in_bangkok` | Missing city card |
| `build_research_station_already_exists` | `base` | A station is already there |

### `POST /discard_cards`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `discard_cards` | `pending_discard` | Resolve the pending discard |
| `discard_cards_wrong_count` | `pending_discard` | Must discard exactly the excess |
| `discard_cards_wrong_player` | `pending_discard` | Only the player over the limit may discard |
| `discard_cards_missing_card` | `pending_discard` | Card not in hand |
| `discard_cards_not_pending` | `base` | No discard is pending |
| `discard_cards_invalid_parameters` | `pending_discard` | Schema failure: card_names is not an array |

### `POST /action_card`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `action_card_airlift` | `event_cards` | Airlift another player |
| `action_card_airlift_unknown_city` | `event_cards` | Airlift to an unknown city |
| `action_card_one_quiet_night` | `event_cards` | Sets quiet_night (saved, not in the JSON view) |
| `action_card_resilient_population` | `event_cards` | Remove a card from the infection discard pile |
| `action_card_resilient_population_not_in_discard` | `event_cards` | City not in the infection discard pile |
| `action_card_government_grant` | `event_cards` | Build a station anywhere |
| `action_card_government_grant_existing_station` | `event_cards` | Station already exists |
| `action_card_forecast` | `event_cards` | Forecast, step 1: shows the first six cards of the infection deck array (the bottom of the draw pile) |
| `action_card_forecast_apply` | `forecast_active` | Forecast, step 2: reorder; the response is the bare JSON view |
| `action_card_forecast_invalid_order` | `forecast_active` | Not a permutation: error with HTTP 200 |
| `action_card_forecast_blocked` | `forecast_active` | Other event cards during Forecast: error with HTTP 200 |
| `action_card_retrieved_card_leaves_game` | `contingency_planner_retrieved` | A retrieved event card is not discarded after use |
| `action_card_resolves_pending_discard` | `pending_discard` | Playing an event card can resolve a pending discard |
| `action_card_not_held` | `base` | Nobody holds the card |
| `action_card_unknown` | `base` | Unknown card: HTTP 500 |
| `action_card_missing_parameters` | `base` | Schema failure |

### `POST /restart_game`

| Scenario | Starting save | What it pins down |
|---|---|---|
| `restart_game` | `base` | New random game, same difficulty (after.yaml depends on the Ruby RNG) |
| `restart_game_difficulty` | `base` | New random game with a new difficulty (after.yaml depends on the Ruby RNG) |
| `restart_game_invalid_difficulty` | `base` | Schema failure |
| `restart_game_forecast_active` | `forecast_active` | Even restart is blocked by an unfinished Forecast |
Run options: --seed 54893

# Running:



Finished in 0.001002s, 0.0000 runs/s, 0.0000 assertions/s.
0 runs, 0 assertions, 0 failures, 0 errors, 0 skips
