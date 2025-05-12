// player_actions.js
import { getCurrentGameState, loadGameState, CITIES, getCurrentLocation, getCurrentPlayer } from './game_state.js';
import { handleEndOfTurnEvents } from './end_turn_events.js';
import { showCardSelectionModal, showGeneralCardSelectionModal, handleHandLimitCheck } from './select_cards.js';

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

  // Get current player
  const currentPlayer = getCurrentPlayer();

  // Get current location
  const currentLocation = currentPlayer.location;

  // Check if there's already a research station at this location
  const hasStation = gameState.researchStations &&
                    gameState.researchStations.locations &&
                    gameState.researchStations.locations.includes(currentLocation);

  if (hasStation) {
    showInvalidActionMessage(`${currentLocation} already has a research station.`);
    return;
  }

  // Check if player has the city card
  const hasCityCard = currentPlayer.hand.includes(currentLocation);

  if (!hasCityCard && currentPlayer.role !== 'operations_expert') {
    showInvalidActionMessage(`You need the ${currentLocation} city card to build a research station here.`);
    return;
  }

  // All checks passed, proceed with building the station
  await buildResearchStation(currentPlayer.index, currentLocation);
}

// Handle a city click event
async function handleCityClick(event) {
  // Get the clicked city's name
  const cityElement = event.currentTarget;
  const cityName = cityElement.dataset.cityName;

  if (!cityName) {
    return;
  }

  // Get the current player
  const currentPlayer = getCurrentPlayer();

  // Check if we're in Government Grant mode
  const actionButtons = await import('./action_buttons.js');
  if (actionButtons.getCurrentMode() === 'governmentGrant') {
    // Reset the mode after handling the action
    actionButtons.resetMode();

    // Check if there's already a research station here
    const gameState = getCurrentGameState();
    const hasStation = gameState.researchStations &&
                      gameState.researchStations.locations &&
                      gameState.researchStations.locations.includes(cityName);

    if (hasStation) {
      showInvalidActionMessage(`${cityName} already has a research station.`);
      return;
    }

    // Call the action card API with the selected city
    await useGovernmentGrant(cityName);
    return;
  }

  // Check if the clicked city is the current city (for treat disease)
  if (cityName === currentPlayer.location) {
    await treatDisease();
  } else {
    await movePlayer(currentPlayer.index, cityName);
  }
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

// Cure disease action
export async function cureDisease() {
  const gameState = getCurrentGameState();
  const currentPlayer = getCurrentPlayer();

  // Group cards by color
  const cardsByColor = {};

  // Initialize card collection for each color
  ['blue', 'yellow', 'black', 'red'].forEach(color => {
    cardsByColor[color] = [];
  });

  // Process each card in the player's hand
  currentPlayer.hand.forEach((cardName, index) => {
    // Skip event cards or epidemic cards
    if (cardName.startsWith('Action:') || cardName === 'Epidemic') {
      return;
    }

    // Get the city color
    const cityColor = getCityColor(cardName);
    if (cityColor) {
      // Add card info to the appropriate color group
      cardsByColor[cityColor].push({
        name: cardName,
        index: index
      });
    }
  });

  // Check if player is at a research station
  const atResearchStation = gameState.researchStations &&
                            gameState.researchStations.locations &&
                            gameState.researchStations.locations.includes(currentPlayer.location);

  if (!atResearchStation) {
    showInvalidActionMessage("You must be at a research station to discover a cure");
    return;
  }

  // Calculate cards needed for cure (5 for normal players, 4 for scientists)
  const cardsNeeded = currentPlayer.role === 'scientist' ? 4 : 5;

  // Find a color with enough cards
  let selectedColor = null;
  let colorCards = null;

  let cureWithIndices = (cardIndices, selectedColor) => {
    try {
      processAPIRequest(
        '/cure_disease',
        {color: selectedColor, card_indices: cardIndices},
        `Discovered a cure for ${selectedColor} disease!`,
        'Failed to discover cure'
      );
    } catch (error) {
      showErrorMessage(`Network error: ${error.message}`);
    }
  }

  for (const [color, cards] of Object.entries(cardsByColor)) {
    // Skip if this disease is already cured
    if (gameState.diseaseCubes[color].cured) {
      continue;
    }

    if (cards.length >= cardsNeeded) {
      selectedColor = color;
      colorCards = cards;
      break
    }
  }

  if (!selectedColor || !colorCards || colorCards.length < cardsNeeded) {
    showInvalidActionMessage(`You need ${cardsNeeded} cards of the same color to discover a cure`);
  } else {
    let selectableCards = colorCards.map(card => card.index)
    if (colorCards.length == cardsNeeded) {
      cureWithIndices(selectableCards, selectedColor);
    } else {
      showGeneralCardSelectionModal(cardsNeeded, colorCards, (indices) => { cureWithIndices(indices, selectedColor) });
    }
  }
}

// Treat disease at the current location
export async function pass() {
  try {
    // Process the treat action
    await processAPIRequest(
      '/pass',
      {},
      "Passed for the rest of the turn",
      'Pass failed'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Treat disease at the current location
export async function treatDisease() {
  try {
    // Get the current player's location (will throw if unavailable)
    const cityName = getCurrentLocation();

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
    // Handle errors from getCurrentLocation or network errors
    showErrorMessage(error.message);
  }
}

// Build a research station
async function buildResearchStation() {
  try {
    // Process the build action
    await processAPIRequest(
      '/build_research_station',
      {},
      `Built a research station`,
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
        // Check if we need to handle hand limit
        if (result.exceeded_hand_limit) {
          const { player_index, discard_count } = result.exceeded_hand_limit;

          // Handle hand limit exceeded
          await new Promise(resolve => {
            handleHandLimitCheck(player_index, discard_count, resolve);
          });
        }

        // Check for end of turn events
        if (result.end_turn && result.end_turn_events) {
          handleEndOfTurnEvents(result.end_turn_events);
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

// Use Government Grant action card
async function useGovernmentGrant(cityName) {
  try {
    // Get the card source info from the action_buttons module
    const actionButtonsModule = await import('./action_buttons.js');
    const governmentGrantSource = actionButtonsModule.getActionCardSource();

    if (!governmentGrantSource) {
      showErrorMessage("Error: Government Grant card source information is missing");
      return;
    }

    // Use the action card
    await actionButtonsModule.useActionCard(
      'Action:Government Grant',
      cityName,
      governmentGrantSource
    );

    // Show success message
    showSuccessMessage(`Built a research station in ${cityName} using Government Grant`);

    // Remove action notification
    const notification = document.getElementById('action-notification');
    if (notification) {
      notification.remove();
    }
  } catch (error) {
    showErrorMessage(`Error using Government Grant: ${error.message}`);
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
function showInvalidActionMessage(message) {
  showNotification(message, 'warning');
}

// Handle Operations Expert special move that requires a city card
async function handleOperationsExpertMove(playerIndex, destination) {
  const gameState = getCurrentGameState();
  const currentPlayer = gameState.players[playerIndex];

  // Get all city cards from player's hand
  const cityCards = currentPlayer.hand
    .map((cardName, index) => {
      // Skip non-city cards
      if (cardName.startsWith('Action:') || cardName === 'Epidemic') {
        return null;
      }
      return cardName;
    })
    .filter(index => index !== null);

  // Show card selection modal
  showGeneralCardSelectionModal(1, cityCards, async (selectedIndices) => {
    // Re-submit the move with the selected card
    const moveData = {
      player_index: playerIndex,
      destination: destination,
      card_index: selectedIndices[0]
    };

    // Process the move action with the selected card
    await processAPIRequest(
      '/move',
      moveData,
      `Moved to ${destination}`,
      'Move failed',
      { playerIndex, destination }
    );
  });
}

// Handle flight choice when player has both current location and destination cards
async function handleFlightChoice(playerIndex, destination) {
  const gameState = getCurrentGameState();
  const currentPlayer = gameState.players[playerIndex];
  const currentLocation = currentPlayer.location;

  // Find the indices of the current location card and destination card in hand
  const flightCardIndices = currentPlayer.hand
    .map((cardName, index) => {
      // We only want the current location or destination city cards
      if (cardName === currentLocation || cardName === destination) {
        return {
          index: index,
          name: cardName
        };
      }
      return null;
    })
    .filter(card => card !== null);

  // Extract just the indices for the modal
  const selectionIndices = flightCardIndices.map(card => card.index);

  // Show card selection modal
  showCardSelectionModal(1, selectionIndices, async (selectedIndices) => {
    // Re-submit the move with the selected card
    const moveData = {
      player_index: playerIndex,
      destination: destination,
      card_index: selectedIndices[0]
    };

    // Process the move action with the selected card
    await processAPIRequest(
      '/move',
      moveData,
      `Moved to ${destination}`,
      'Move failed',
      {
        playerIndex,
        destination,
        moveType: 'flight'
      }
    );
  }, "Choose a card to discard for flight");
}
