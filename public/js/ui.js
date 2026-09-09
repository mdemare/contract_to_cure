// game_state.js
import { prepareMapWithGameState, renderPandemicCities } from './map.js';
import { updatePlayerPanel } from './player_panel.js';
import { updateCurrentPlayer } from './current_player.js';
import { CITIES } from './game_state.js';
import { updateButtonStates } from './action_buttons.js';
import { updateGameStatus } from './game_status.js';

// Define color keys for disease tracking
const COLOR_KEYS = ['blue', 'yellow', 'black', 'red'];

/**
 * Update player hand display
 * @param {Object} gameState - The current game state
 */
export function updatePlayerHand(gameState) {
  const handContainer = document.querySelector('.player-hand');
  if (!handContainer) return;

  // Clear existing cards
  handContainer.innerHTML = '';

  // Get current player
  if (!gameState || !gameState.gameStatus) return;

  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer || !currentPlayer.hand) return;

  // Create card elements
  currentPlayer.hand.forEach((cardObj, index) => {
    const card = document.createElement('div');
    card.classList.add('hand-card');
    const cardName = cardObj.name

    // Determine card type and color
    if (cardObj.type === 'action') {
      card.classList.add('action');
      card.title = 'Action Card';
    } else if (cardObj.type === 'event') {
      card.classList.add('epidemic');
      card.title = 'Epidemic!';
    } else {
      // City card - find the color
      card.classList.add('city-card');
      card.classList.add(cardObj.color);
      card.title = `City: ${cardName}`;
    }

    // Create card name element
    const cardNameElement = document.createElement('span');
    cardNameElement.classList.add('card-name');
    cardNameElement.textContent = cardName;
    card.appendChild(cardNameElement);

    // Add data attribute for card index
    card.dataset.cardIndex = index;

    handContainer.appendChild(card);
  });
}

// Update the game UI with the new state
export function updateGameUI(gameState) {
  try {
    // Check if we have valid game state data
    if (!gameState || !gameState.gameStatus) {
      console.error('Invalid game state data:', gameState);
      return;
    }

    updateGameStatus(gameState);
    updatePlayerPanel(gameState);
    updatePlayerHand(gameState);
    updateButtonStates()
    updateCurrentPlayer(gameState);
    updateMapState(gameState);
  } catch (error) {
    console.error('Error updating game UI:', error);
  }
}

// Update the cure status UI
export function updateCureStatus(gameState) {
  updateGameStatus(gameState);
}

// Update the map with disease cubes, research stations, and player pawns
export async function updateMapState(gameState) {
  if(CITIES === undefined) { throw new Error("Cities not loaded")}
  try {
    // Prepare the map data with the current game state
    const updatedMap = prepareMapWithGameState(CITIES, gameState);

    // Render the updated map
    renderPandemicCities(updatedMap);

  } catch (error) {
    console.error('Error updating map state:', error);
  }
}
