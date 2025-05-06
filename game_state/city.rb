class City
  include GameStateConfig

  attr_reader :name, :color, :connections, :disease_cubes
  attr_accessor :has_research_station

  def initialize(name, color, connections = [])
    @name = name
    @color = color
    @connections = connections
    @disease_cubes = 0 # Simple counter instead of hash
    @has_research_station = false
  end

  def disease_cubes=(value)
    raise "Illegal value #{value}" unless [0,1,2,3].include?(value)
    @disease_cubes = value
  end
end
