class GameController < ApplicationController
  # Get game state as JSON
  def state
    state_data = game_state.to_json_state
    state_data['current_user'] = current_user
    render json: state_data
  end

  # Move action endpoint
  def move
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    validated = validate_request(GameRequestSchemas::MOVE, %i[player_index destination card_name])
    return if performed?

    # Perform the move and get result
    result = game_state.move(validated[:player_index], validated[:destination], validated[:card_name])
    render_game_result(result)
  end

  # Treat disease endpoint
  def treat
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    result = game_state.treat_disease
    render_game_result(result)
  end

  # Cure disease endpoint
  def cure_disease
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    validated = validate_request(GameRequestSchemas::CURE_DISEASE, %i[color card_names])
    return if performed?

    result = game_state.cure_disease(validated[:color].to_sym, validated[:card_names])
    render_game_result(result)
  end

  # Retrieve action card endpoint for contingency planner
  def retrieve
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    validated = validate_request(GameRequestSchemas::RETRIEVE, [:action_card_name])
    return if performed?

    # Perform the action and get result
    result = game_state.retrieve(validated[:action_card_name])
    render_game_result(result)
  end

  # Share knowledge endpoint
  def share_knowledge
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    validated = validate_request(
      GameRequestSchemas::SHARE_KNOWLEDGE,
      %i[giving_player_index receiving_player_index city_name]
    )
    return if performed?

    # Perform the action and get result
    result = game_state.share_knowledge(
      validated[:giving_player_index],
      validated[:receiving_player_index],
      validated[:city_name]
    )
    render_game_result(result)
  end

  # Pass action endpoint
  def pass
    result = game_state.pass
    render_game_result(result)
  end

  # Draw cards endpoint
  def draw_cards
    if game_state.actions_remaining.zero?
      response = game_state.after_action_response(nil, {})
      response[:end_turn_events] = game_state.draw_cards
      response[:game_state] = game_state.to_json_state
      render json: response
    else
      render json: { status: "success" }
    end
  end

  # Infect cities endpoint
  def infect_cities
    if game_state.actions_remaining.zero?
      response = game_state.after_action_response(nil, {})
      response[:end_turn_events] = game_state.infect_cities
      response[:game_state] = game_state.to_json_state
      render json: response
    else
      render json: { status: "success" }
    end
  end

  # Build research station endpoint
  def build_research_station
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    result = game_state.build_research_station
    render_game_result(result)
  end

  # Discard card endpoint for hand limit
  def discard_cards
    validated = validate_request(GameRequestSchemas::DISCARD_CARDS, %i[player_index card_names])
    return if performed?

    # Discard each card by name
    discarded_count = 0
    validated[:card_names].each do |card_name|
      if game_state.discard_player_card_by_name(validated[:player_index], card_name)
        discarded_count += 1
      end
    end

    game_state.save_game_state

    # Return success response
    render json: { status: 'success', message: "Successfully discarded #{discarded_count} card(s)" }
  end

  # Action card endpoint
  def action_card
    validated = validate_request(GameRequestSchemas::ACTION_CARD, %i[card city player_index card_order])
    return if performed?

    card_name = validated[:card]
    city_name = validated[:city]

    # Special handling for Forecast
    if game_state.forecast_active
      # Only allow Forecast with card_order when forecast is active
      if card_name == 'Forecast' && validated[:card_order]
        result = game_state.apply_forecast(validated[:card_order])
        return render json: result
      end

      return render json: {
        status: 'error',
        message: 'Cannot perform action while Forecast is active. Please complete the Forecast action first.'
      }
    end

    # Normal action card processing when forecast is not active
    result = case card_name
             when 'Airlift'
               game_state.use_airlift(validated[:player_index], city_name)
             when 'One Quiet Night'
               game_state.quiet_night!
             when 'Resilient Population'
               # Remove a card from the infection discard pile by city name
               game_state.use_resilient_population(city_name)
             when 'Government Grant'
               # Add a research station to the specified city without using a city card
               game_state.use_government_grant(city_name)
             when 'Forecast'
               # Initial Forecast call
               game_state.use_forecast
             # Add cases for other action cards as they are implemented
             else
               return render json: { status: 'error', message: "Unknown action card: #{card_name}" }, status: 500
    end

    render_game_result(result)
  end

  # Restart game endpoint
  def restart_game
    # Extract difficulty level from request if provided, otherwise use current difficulty
    difficulty_level = params[:difficulty_level]&.to_sym

    # Restart the game and return result
    result = game_state.reset_game(difficulty_level)

    render_game_result(result)
  end

  private

  def validate_request(schema, keys)
    raw_params = params.to_unsafe_h.slice(*keys.map(&:to_s))
    result = schema.call(raw_params)

    return result.to_h if result.success?

    render json: { status: 'error', message: validation_error_message(result.errors.to_h) }, status: 422
    nil
  end

  def validation_error_message(errors)
    return 'Missing required parameters' if missing_parameter_error?(errors)

    'Invalid parameters'
  end

  def missing_parameter_error?(value)
    case value
    when Hash
      value.values.any? { |nested| missing_parameter_error?(nested) }
    when Array
      value.any? { |nested| nested == 'is missing' || missing_parameter_error?(nested) }
    else
      value == 'is missing'
    end
  end

  def render_game_result(result)
    if result[:success] == false
      # Handle card_required responses with 200 status instead of 422
      if result[:status] == 'card_required'
        render json: result
      else
        render json: result, status: 422
      end
    else
      render json: result
    end
  end
end
