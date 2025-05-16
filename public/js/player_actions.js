// player_actions.js
import { getCurrentGameState, getCurrentLocation, getCurrentPlayer } from './game_state.js';
import { getActionCardSource, completeAirlift } from './action_cards.js';
import { showHandSelectionModal, showGeneralCardSelectionModal } from './select_cards.js';
import { processAPIRequest, getCityColor, showSuccessMessage, showErrorMessage, showInvalidActionMessage } from './player_action_utils.js'

let selectedPlayerIndex = null;

export function setSelectedPlayerIndex(index) {
  selectedPlayerIndex = index;
}

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
  const hasCityCard = currentPlayer.hand.some(card => card.name == currentLocation);

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
  const cityName = event.currentTarget.dataset.cityName;
  if (!cityName) { return; }

  // Get the current player
  const currentPlayer = getCurrentPlayer();

  // Import action buttons to get current mode
  const actionButtons = await import('./action_buttons.js');

  switch (actionButtons.getCurrentMode()) {
    case 'governmentGrant':
      // Reset the mode after handling the action
      actionButtons.resetMode();

      // Check if there's already a research station here
      const hasStation = getCurrentGameState().researchStations?.locations?.includes(cityName);

      if (hasStation) {
        showInvalidActionMessage(`${cityName} already has a research station.`);
      } else {
        // Call the action card API with the selected city
        await useGovernmentGrant(cityName);
      }
      return;

    case 'airlift':
      completeAirlift(cityName);
      return;

    case 'moveSelectedPlayer':
      // Get the selected player index
      if (selectedPlayerIndex !== null) {
        // Reset the mode after handling the action
        actionButtons.resetMode();

        // Move the selected player to the clicked city
        await movePlayer(selectedPlayerIndex, cityName);
      }
      return;

    default:
      // Standard move or treat action
      if (cityName === currentPlayer.location) {
        await treatDisease();
      } else {
        await movePlayer(currentPlayer.index, cityName);
      }
      return;
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
  currentPlayer.hand.forEach(cardObj => {
    // Skip event cards or epidemic cards
    if (cardObj.type == 'city') {
      cardsByColor[cardObj.color].push(cardObj);
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
    let selectableCards = colorCards.map(cardObj => cardObj.index)
    if (colorCards.length == cardsNeeded) {
      cureWithIndices(selectableCards, selectedColor);
    } else {
      showGeneralCardSelectionModal(cardsNeeded, colorCards, (indices) => { cureWithIndices(indices, selectedColor) }, {customTitle: `Select ${cardsNeeded} ${selectedColor} cards to cure the disease`});
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

export async function useAirlift(cityName, playerIndex) {
  try {
    // Get the card source and verify it exists
    const airliftSource = getActionCardSource();
    if (!airliftSource) {
      showErrorMessage("Error: Airlift card source information is missing");
      return;
    }

    // Use the action card
    await useActionCard('Airlift', {city: cityName, player_index: playerIndex})

    // Show success message
    showSuccessMessage(`Airlift to ${cityName} performed`)
  } catch (error) {
    showErrorMessage(`Error using Airlift: ${error.message}`)
  }
}
// Use Government Grant action card
export async function useQuietNight() {
  try {
    // Get the card source info from the action_buttons module
    // Use the action card
    await useActionCard('One Quiet Night', {});

    // Show success message
    showSuccessMessage("Tonight everything is quiet");
  } catch (error) {
    showErrorMessage(`Error using One Quiet Night: ${error.message}`);
  }
}

// Use Government Grant action card
async function useGovernmentGrant(cityName) {
  try {
    // Get the card source info from the action_buttons module
    const governmentGrantSource = getActionCardSource();

    if (!governmentGrantSource) {
      showErrorMessage("Error: Government Grant card source information is missing");
      return;
    }

    // Use the action card
    await useActionCard('Government Grant', {city: cityName});

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

// Make these functions exportable so player_action_utils.js can call them
export async function handleOperationsExpertMove(playerIndex, destination) {
  const gameState = getCurrentGameState();
  const currentPlayer = gameState.players[playerIndex];
  // Get all city cards from player's hand
  const cityCards = currentPlayer.hand.filter(cardObj => cardObj.type === 'city');

  // Show card selection modal
  showGeneralCardSelectionModal(1, cityCards, async (selectedIndices) => {
    // Re-submit the move with the selected card
    const moveData = {
      player_index: playerIndex,
      destination: destination,
      card_index: selectedIndices[0]
    }

    // Process the move action with the selected card
    await processAPIRequest(
      '/move',
      moveData,
      `Moved to ${destination}`,
      'Move failed',
      { playerIndex, destination }
    );
  }, {});
}

// Make this function exportable
export async function handleFlightChoice(playerIndex, destination) {
  const gameState = getCurrentGameState();
  const currentPlayer = gameState.players[playerIndex];
  const currentLocation = currentPlayer.location;

  // Find the indices of the current location card and destination card in hand
  const flightCardIndices = currentPlayer.hand
    .filter(cardObj => {
      return cardObj.name === currentLocation || cardObj.name === destination
    })

  // Extract just the indices for the modal
  const selectionIndices = flightCardIndices.map(card => card.index);

  // Show card selection modal
  // Called from hand limit exceeded, and direct flight or charter
  showHandSelectionModal(1, selectionIndices, async (selectedIndices) => {
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

/**
 * Use an action card
 * @param {string} cardName - The name of the action card
 * @param {string} cityName - The city to apply the action to (optional)
 */
export async function useActionCard(cardName, actionCardData = {}) {
  // Get success message based on the card type
  let successMessage = `Used ${cardName}`;
  actionCardData.card = cardName

  try {
    // Process the action card request
    await processAPIRequest(
      '/action_card',
      actionCardData,
      successMessage,
      'Failed to use action card'
    );
  } catch (error) {
    console.error('Error using action card:', error);
  }
}
