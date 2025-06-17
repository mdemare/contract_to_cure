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

    player_index = params[:player_index].to_i
    destination = params[:destination]
    card_name = params[:card_name]

    # Validate required parameters
    unless player_index && destination
      return render json: { status: 'error', message: 'Missing required parameters' }, status: 422
    end

    # Perform the move and get result
    result = game_state.move(player_index, destination, card_name)
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

    color = params[:color].to_sym
    card_names = params[:card_names]

    result = game_state.cure_disease(color, card_names)
    render_game_result(result)
  end

  # Retrieve action card endpoint for contingency planner
  def retrieve
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    action_card_name = params[:action_card_name]

    # Validate required parameters
    unless action_card_name
      return render json: { status: 'error', message: 'Missing required parameters' }, status: 422
    end

    # Perform the action and get result
    result = game_state.retrieve(action_card_name)
    render_game_result(result)
  end

  # Share knowledge endpoint
  def share_knowledge
    return render(json: game_state.check_action, status: 422) if game_state.check_action

    giving_player_index = params[:giving_player_index].to_i
    receiving_player_index = params[:receiving_player_index].to_i
    city_name = params[:city_name]

    # Validate required parameters
    unless giving_player_index && receiving_player_index && city_name
      return render json: { status: 'error', message: 'Missing required parameters' }, status: 422
    end

    # Perform the action and get result
    result = game_state.share_knowledge(giving_player_index, receiving_player_index, city_name)
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
    player_index = params[:player_index].to_i
    card_names = params[:card_names]

    # Validate required parameters
    unless player_index.is_a?(Integer) && card_names.is_a?(Array)
      return render json: { status: 'error', message: 'Missing required parameters' }, status: 422
    end

    # Discard each card by name
    discarded_count = 0
    card_names.each do |card_name|
      if game_state.discard_player_card_by_name(player_index, card_name)
        discarded_count += 1
      end
    end

    game_state.save_game_state

    # Return success response
    render json: { status: 'success', message: "Successfully discarded #{discarded_count} card(s)" }
  end

  # Action card endpoint
  def action_card
    card_name = params[:card]
    city_name = params[:city]

    # Validate required parameters
    return render json: { status: 'error', message: 'Missing required parameters' } unless card_name

    # Special handling for Forecast
    if game_state.forecast_active
      # Only allow Forecast with card_order when forecast is active
      if card_name == 'Forecast' && params[:card_order]
        result = game_state.apply_forecast(params[:card_order])
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
               game_state.use_airlift(params[:player_index].to_i, city_name)
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

  def render_game_result(result)
    if result[:success] == false
      render json: result, status: 422
    else
      render json: result
    end
  end
end
