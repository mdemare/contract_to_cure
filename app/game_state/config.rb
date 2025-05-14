module GameStateConfig
  COLORS = %i[blue yellow black red].freeze
  ROLES = %i[medic scientist researcher operations_expert dispatcher contingency_planner
             quarantine_specialist].freeze
  INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4].freeze
  MAX_OUTBREAKS = 8
  MAX_DISEASE_CUBES_PER_COLOR = 24
  CARDS_PER_PLAYER = { 2 => 4, 3 => 3, 4 => 2 }.freeze
  INITIAL_RESEARCH_STATIONS = 1
  MAX_RESEARCH_STATIONS = 6
  CARDS_NEEDED_FOR_CURE = { scientist: 4, default: 5 }.freeze
end
