// player_action_utils.js
import { getCurrentGameState, loadGameState, CITIES } from './game_state.js';

// Avoid circular dependencies by using dynamic imports
let endTurnEventsModule = null;
let selectCardsModule = null;

// Function to initialize modules (call this at startup)
export async function initializeModules() {
  endTurnEventsModule = await import('./end_turn_events.js');
  selectCardsModule = await import('./select_cards.js');
}

async function handleSuccessfulAPIRequest(result, successMessage, eventData) {
  // Check if we need to handle hand limit
  if (result.exceeded_hand_limit) {
    const { player_index, discard_count } = result.exceeded_hand_limit;
    const gameState = getCurrentGameState();
    if (player_index) {
      console.log(`${gameState.players[player_index].role} exceeded hand limit`)
    } else {
      console.error(`result does not contain player_index - ${result}`)
    }

    // Load selectCardsModule if not already loaded
    if (!selectCardsModule) {
      selectCardsModule = await import('./select_cards.js');
    }

    // Handle hand limit exceeded
    await new Promise(resolve => {
      selectCardsModule.handleHandLimitCheck(player_index, discard_count, resolve);
    });
  }

  // Check for end of turn events
  if (result.end_turn && result.end_turn_events) {
    // Load endTurnEventsModule if not already loaded
    if (!endTurnEventsModule) {
      endTurnEventsModule = await import('./end_turn_events.js');
    }

    await endTurnEventsModule.handleEndOfTurnEvents(result.end_turn_events);
  }

  // Use the game state directly from the response
  if (result.game_state) {
    // Update the game state in game_state.js module
    await loadGameState(result.game_state);
  } else {
    // Fallback to loading game state if not provided in response
    await loadGameState();
  }

  // Dispatch event if provided
  if (eventData) {
    const moveEvent = new CustomEvent('playerMoved', {
      detail: {
        playerIndex: eventData.playerIndex,
        destination: eventData.destination,
        success: true,
        moveType: eventData.moveType,
        endTurn: result.end_turn || false
      }
    });
    document.dispatchEvent(moveEvent);
  }

  // Show success message
  showSuccessMessage(result.message || successMessage);
}

// Generic handler for API requests and responses
export async function processAPIRequest(endpoint, requestData, successMessage, failurePrefix, eventData = null) {
  try {
    // Make the API call
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    // Process the response
    if (response.ok) {
      // Try to parse JSON
      const result = await response.json();
      if(!result) { throw new Error("no result")}
      if (result.status === 'success') {
        handleSuccessfulAPIRequest(result, successMessage, eventData)
      } else if (result.status === 'card_required' && endpoint === '/move') {
        // Handle operations expert special move card selection
        if (result.movement_type === 'operations_expert_special') {
          handleOperationsExpertMove(requestData.player_index, requestData.destination);
        } else if (result.movement_type === 'flight_choice') {
          handleFlightChoice(requestData.player_index, requestData.destination);
        } else {
          // Handle other card selection scenarios if needed
          showErrorMessage(result.message);
        }
      } else {
        showErrorMessage(result.message);
      }
    } else {
      showErrorMessage(`${failurePrefix} (${response.status}). The backend might not be implemented yet.`);
    }
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Helper functions for operations expert and flight choice movements
async function handleOperationsExpertMove(playerIndex, destination) {
  // Dynamically import player_actions to avoid circular dependency
  const playerActionsModule = await import('./player_actions.js');

  // Call the function from player_actions
  if (playerActionsModule.handleOperationsExpertMove) {
    playerActionsModule.handleOperationsExpertMove(playerIndex, destination);
  } else {
    showErrorMessage("Operations Expert move handler not implemented");
  }
}

async function handleFlightChoice(playerIndex, destination) {
  console.log(`handleFlightChoice(${playerIndex}, ${destination})`)
  // Dynamically import player_actions to avoid circular dependency
  const playerActionsModule = await import('./player_actions.js');

  // Call the function from player_actions
  if (playerActionsModule.handleFlightChoice) {
    playerActionsModule.handleFlightChoice(playerIndex, destination);
  } else {
    showErrorMessage("Flight choice handler not implemented");
  }
}

// Helper function to get a city's color
export function getCityColor(cityName) {
  // Use existing CITIES object instead of fetching cities.json
  if (CITIES[cityName] && CITIES[cityName].color) {
    return CITIES[cityName].color;
  }
  console.error("No color found for "+cityName)
  return null;
}

// Display a notification to the user
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.classList.add('game-notification', type);
  notification.textContent = message;

  // Append to body
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');

    // Remove from DOM after fade animation
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

// Display a success message to the user
export function showSuccessMessage(message) {
  showNotification(message, 'success');
}

// Display an error message to the user
export function showErrorMessage(message) {
  showNotification(`Action failed: ${message}`, 'error');
}

// Display invalid move message
export function showInvalidActionMessage(message) {
  showNotification(message, 'warning');
}
