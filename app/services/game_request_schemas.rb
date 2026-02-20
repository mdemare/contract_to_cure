require 'dry/schema'

module GameRequestSchemas
  MOVE = Dry::Schema.Params do
    required(:player_index).filled(:integer)
    required(:destination).filled(:string)
    optional(:card_name).maybe(:string)
  end

  CURE_DISEASE = Dry::Schema.Params do
    required(:color).filled(:string)
    required(:card_names).filled(:array).each(:string)
  end

  RETRIEVE = Dry::Schema.Params do
    required(:action_card_name).filled(:string)
  end

  SHARE_KNOWLEDGE = Dry::Schema.Params do
    required(:giving_player_index).filled(:integer)
    required(:receiving_player_index).filled(:integer)
    required(:city_name).filled(:string)
  end

  DISCARD_CARDS = Dry::Schema.Params do
    required(:player_index).filled(:integer)
    required(:card_names).filled(:array).each(:string)
  end

  ACTION_CARD = Dry::Schema.Params do
    required(:card).filled(:string)
    optional(:city).maybe(:string)
    optional(:player_index).maybe(:integer)
    optional(:card_order).filled(:array).each(:string)
  end
end
