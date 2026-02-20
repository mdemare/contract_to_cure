require 'dry/schema'

module GameParamsValidator
  MoveSchema = Dry::Schema.Params do
    required(:player_index).filled(:integer, gteq?: 0)
    required(:destination).filled(:string)
    optional(:card_name).maybe(:string)
  end

  RetrieveSchema = Dry::Schema.Params do
    required(:action_card_name).filled(:string)
  end

  CureDiseaseSchema = Dry::Schema.Params do
    required(:color).filled(:string)
    required(:card_names).filled(:array).each(:string)
  end

  ShareKnowledgeSchema = Dry::Schema.Params do
    required(:giving_player_index).filled(:integer, gteq?: 0)
    required(:receiving_player_index).filled(:integer, gteq?: 0)
    required(:city_name).filled(:string)
  end

  DiscardCardsSchema = Dry::Schema.Params do
    required(:player_index).filled(:integer, gteq?: 0)
    required(:card_names).filled(:array).each(:string)
  end

  ActionCardSchema = Dry::Schema.Params do
    required(:card).filled(:string)
    optional(:city).maybe(:string)
    optional(:player_index).maybe(:integer, gteq?: 0)
    optional(:card_order).maybe(:array).each(:string)
  end

  RestartGameSchema = Dry::Schema.Params do
    optional(:difficulty_level).maybe(:string, included_in?: %w[introductory normal heroic])
  end

  module_function

  def validate_move(input)
    MoveSchema.call(input)
  end

  def validate_retrieve(input)
    RetrieveSchema.call(input)
  end

  def validate_cure_disease(input)
    CureDiseaseSchema.call(input)
  end

  def validate_share_knowledge(input)
    ShareKnowledgeSchema.call(input)
  end

  def validate_discard_cards(input)
    DiscardCardsSchema.call(input)
  end

  def validate_action_card(input)
    ActionCardSchema.call(input)
  end

  def validate_restart_game(input)
    RestartGameSchema.call(input)
  end
end
