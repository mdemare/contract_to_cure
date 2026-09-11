// player_action_utils.js

import { loadGameState, CITIES } from './game_state.js';
import { promptHandLimit } from './hand_limit_prompt.js';

let endTurnEventsModule = null;

// Function to initialize modules (call this at startup)
export async function initializeModules() {
  endTurnEventsModule = await import('./end_turn_events.js');
}

function resultIncludesHandLimitPrompt(result) {
  return Boolean(
    result.exceeded_hand_limit ||
    result.end_turn_events?.some(event => event.exceeded_hand_limit)
  );
}

async function handleSuccessfulAPIRequest(result, successMessage, eventData) {
  const promptPendingHandLimit = !resultIncludesHandLimitPrompt(result);

  // Update game state FIRST
  if (result.game_state) {
    await loadGameState(result.game_state, { promptPendingHandLimit });
  } else {
    await loadGameState(null, { promptPendingHandLimit });
  }

  // THEN handle hand limit with updated state
  if (result.exceeded_hand_limit) {
    const { player_index, discard_count } = result.exceeded_hand_limit;

    await promptHandLimit(player_index, discard_count);
  }

  // Check for end of turn events
  if (result.end_turn && result.end_turn_events) {
    // Load endTurnEventsModule if not already loaded
    if (!endTurnEventsModule) {
      endTurnEventsModule = await import('./end_turn_events.js');
    }

    await endTurnEventsModule.handleEndOfTurnEvents(result.end_turn_events);
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
    // Get CSRF token from meta tag
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    // Make the API call
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify(requestData)
    });

    // Process the response
    if (response.ok) {
      // Try to parse JSON
      const result = await response.json();
      if(!result) { throw new Error("no result")}
      if (result.status === 'success') {
        await handleSuccessfulAPIRequest(result, successMessage, eventData)
      } else if (result.status === 'action_unavailable') {
        // Action was not available, reload game state to ensure UI is in sync
        if (result.game_state) {
          await loadGameState(result.game_state);
        }
        showInvalidActionMessage(result.message);
      } else if (result.status === 'card_required' && endpoint === '/move') {
        // Handle operations expert special move card selection
        if (result.movement_type === 'operations_expert_special') {
          dispatchMovementCardRequired(result.movement_type, requestData);
        } else if (result.movement_type === 'flight_choice') {
          dispatchMovementCardRequired(result.movement_type, requestData);
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

function dispatchMovementCardRequired(movementType, requestData) {
  document.dispatchEvent(new CustomEvent('movementCardRequired', {
    detail: {
      movementType,
      playerIndex: requestData.player_index,
      destination: requestData.destination
    }
  }));
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
