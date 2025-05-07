// player_actions.js
import { getCurrentGameState, loadGameState, CITIES } from './game_state.js';
import { getCurrentMode } from './action_buttons.js';
import { handleEndOfTurnEvents } from './end_turn_events.js';

// Map click handler - initialize city click events
export function initMoveActions() {
  setupCityClickHandlers();

  // Re-attach handlers whenever the map is updated
  document.addEventListener('mapUpdated', () => {
    setupCityClickHandlers();
  });

  // Initialize build station button
  initBuildStation();
}

// Set up click event handlers for all city elements
function setupCityClickHandlers() {
  const cityElements = document.querySelectorAll('.city');

  cityElements.forEach((cityElement) => {
    // Remove existing click handlers to prevent duplicates
    cityElement.removeEventListener('click', handleCityClick);

    // Add new click handler
    cityElement.addEventListener('click', handleCityClick);
  });
}

// Initialize the build station functionality
function initBuildStation() {
  // Set up event listener for the build station button
  const buildBtn = document.getElementById('build-btn');
  if (buildBtn) {
    buildBtn.addEventListener('click', handleBuildStationClick);
  }
}

// Handle build station button click
async function handleBuildStationClick() {
  // Get current game state
  const gameState = getCurrentGameState();
  if (!gameState) return;

  // Get current player
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) return;

  // Get current location
  const currentLocation = currentPlayer.location;

  // Check if there's already a research station at this location
  const hasStation = gameState.researchStations &&
                    gameState.researchStations.locations &&
                    gameState.researchStations.locations.includes(currentLocation);

  if (hasStation) {
    showInvalidMoveMessage(`${currentLocation} already has a research station.`);
    return;
  }

  // Check if player has the city card
  const hasCityCard = currentPlayer.hand.includes(currentLocation);

  if (!hasCityCard && currentPlayer.role !== 'operations_expert') {
    showInvalidMoveMessage(`You need the ${currentLocation} city card to build a research station here.`);
    return;
  }

  // All checks passed, proceed with building the station
  await buildResearchStation(currentPlayerIndex, currentLocation);
}

// Handle a city click event
async function handleCityClick(event) {
  // Get the clicked city's name
  const cityElement = event.currentTarget;
  const cityName = cityElement.dataset.cityName;

  // Get the current action mode
  const currentMode = getCurrentMode();

  // Only process city clicks if in move mode or no mode selected
  // (default behavior will be to move when directly clicking cities)
  if (currentMode && currentMode !== 'move') {
    return;
  }

  if (!cityName) {
    return;
  }

  // Get the current game state
  const gameState = getCurrentGameState();
  if (!gameState) {
    return;
  }

  // Get the current player
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) {
    return;
  }

  // Check if the clicked city is the current city (for treat disease)
  if (cityName === currentPlayer.location) {
    await treatDisease(cityName);
    return;
  }

  // Check if the player has a card for this city (direct flight)
  const canDirectFlight = currentPlayer.hand.includes(cityName);

  // Check if the city is adjacent (drive/ferry)
  const isAdjacent = isCityAdjacent(currentPlayer.location, cityName);

  await movePlayer(currentPlayerIndex, cityName);
}

// Helper function to check if a city is adjacent to another
function isCityAdjacent(fromCity, toCity) {
  // Check if the cities exist in the data
  if (!CITIES[fromCity] || !CITIES[toCity]) {
    return false;
  }

  // Check if toCity is in the connections array of fromCity
  const connections = CITIES[fromCity].connections;
  return connections.includes(toCity);
}

// Unified movement function that handles different move types
async function movePlayer(playerIndex, destination) {
  try {
    // Prepare the request data
    const moveData = {
      player_index: playerIndex,
      destination: destination
    };

    // Process the move action
    await processAPIRequest(
      '/move',
      moveData,
      `Moved to ${destination}`,
      `move failed`,
      { playerIndex, destination }
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Treat disease at the current location
async function treatDisease(cityName) {
  try {
    // Get the city's color
    let diseaseColor = getCityColor(cityName);

    // Process the treat action
    await processAPIRequest(
      '/treat',
      {},
      `Treated ${diseaseColor} disease in ${cityName}`,
      'Treatment failed'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Build a research station
async function buildResearchStation(playerIndex, cityName) {
  try {
    // Prepare the request data
    const buildData = {
      player_index: playerIndex,
      card_name: cityName
    };

    // Process the build action
    await processAPIRequest(
      '/build_research_station',
      buildData,
      `Built a research station in ${cityName}`,
      'Failed to build research station'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Execute the share knowledge action
export async function executeShareKnowledge(cityName, givingPlayerIndex, receivingPlayerIndex) {
  try {
    // Prepare the request data
    const shareData = {
      city_name: cityName,
      giving_player_index: givingPlayerIndex,
      receiving_player_index: receivingPlayerIndex
    };

    // Process the build action
    await processAPIRequest(
      '/share_knowledge',
      shareData,
      `Share cards in ${cityName}`,
      'Failed to share cards'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Generic handler for API requests and responses
async function processAPIRequest(endpoint, requestData, successMessage, failurePrefix, eventData = null) {
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

      if (result.status === 'success') {
        // Check for end of turn events
        if (result.end_turn && result.end_turn_events) {
          handleEndOfTurnEvents(result.end_turn_events);
        }

        // Refresh the game state
        await loadGameState();

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

// Helper function to get a city's color
export function getCityColor(cityName) {
  // Use existing CITIES object instead of fetching cities.json
  if (CITIES[cityName] && CITIES[cityName].color) {
    return CITIES[cityName].color;
  }
  console.log("No color found for "+cityName)
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
function showSuccessMessage(message) {
  showNotification(message, 'success');
}

// Display an error message to the user
function showErrorMessage(message) {
  showNotification(`Action failed: ${message}`, 'error');
}

// Display invalid move message
function showInvalidMoveMessage(message) {
  showNotification(message, 'warning');
}
