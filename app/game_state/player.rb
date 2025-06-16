# Player class for tracking player-specific data
class Player
  attr_reader :role, :role_abilities, :index
  attr_accessor :location, :hand

  # Alias for compatibility with tests
  alias_method :cards, :hand
  alias_method :cards=, :hand=

  ROLE_NAMES = {
    medic: "Medic",
    scientist: "Scientist",
    researcher: "Researcher",
    operations_expert: "Operations Expert",
    dispatcher: "Dispatcher",
    contingency_planner: "Contingency Planner",
    quarantine_specialist: "Quarantine Specialist"
  }.freeze

  def initialize(role, index, location = 'Wuhan')
    @role = role
    @index = index
    @location = location
    @hand = []
    @role_abilities = set_role_abilities(role)
  end

  def city_cards
    @hand.select { it.type == :city }
  end

  def sorted_hand
    @hand.sort_by { [it.type, it.color] }
  end

  def role_name
    ROLE_NAMES[role]
  end

  private

  def set_role_abilities(role)
    case role
    when :medic
      { description: 'Remove all cubes of a single color when treating a disease. Automatically remove cubes of cured diseases in your location.' }
    when :scientist
      { description: 'You need only 4 cards of the same color to discover a cure.' }
    when :researcher
      { description: 'You may give a player cards from your hand for one action per card.' }
    when :operations_expert
      { description: 'You may build a research station in your location without discarding a city card. Once per turn, you may move from a research station to any city by discarding any city card.' }
    when :dispatcher
      { description: "Move other players' pawns as if they were your own. Move any pawn to a city with another pawn." }
    when :contingency_planner
      { description: 'You may take an action card from the discard pile and use it. Remove it from the game afterward.' }
    when :quarantine_specialist
      { description: 'Prevent disease cubes in your location and all connected cities.' }
    else
      { description: 'Unknown role' }
    end
  end
end
