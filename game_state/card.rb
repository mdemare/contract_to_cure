# Card class for both player and infection cards
class Card
  attr_reader :type, :name, :color

  def initialize(type, name, color = nil)
    @type = type # :city, :event, :epidemic
    @name = name
    @color = color # Only for city cards
  end

  def description
    desc = { type: type, name: name, color: color }
    desc.delete(:color) unless type == :city
    desc
  end
end
