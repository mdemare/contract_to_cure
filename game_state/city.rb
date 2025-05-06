class City
  include GameStateConfig

  attr_reader :name, :color, :connections
  attr_accessor :disease_cubes, :has_research_station

  def initialize(name, color, connections = [])
    @name = name
    @color = color
    @connections = connections
    @disease_cubes = 0 # Simple counter instead of hash
    @has_research_station = false
  end
end
