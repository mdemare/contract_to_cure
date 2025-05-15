// player_hand.js
// Handles displaying and interacting with the player's hand of
import { getCityColor } from './player_action_utils.js';
import { updateButtonStates } from './action_buttons.js';

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

  // After updating the hand, update the button states
  updateButtonStates();
}
