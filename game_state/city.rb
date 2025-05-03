require_relative 'config'

# City class for tracking city-specific data
class City
  include GameStateConfig

  attr_reader :name, :color, :connections
  attr_accessor :disease_cubes, :has_research_station

  def initialize(name, color, connections = [])
    @name = name
    @color = color
    @connections = connections
    @disease_cubes = {}
    COLORS.each { |color_symbol| @disease_cubes[color_symbol] = 0 }
    @has_research_station = false
  end

  def add_connection(city_name)
    @connections << city_name unless @connections.include?(city_name)
  end
end
