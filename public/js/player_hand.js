// player_hand.js
// Handles displaying and interacting with the player's hand of
import { getCityColor } from './player_actions.js';
import { getCurrentMode, updateButtonStates } from './action_buttons.js';

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
  currentPlayer.hand.forEach((cardName, index) => {
    const card = document.createElement('div');
    card.classList.add('hand-card');

    // Determine card type and color
    if (cardName.startsWith('Action:')) {
      card.classList.add('action');
      card.title = 'Action Card';
    } else if (cardName === 'Epidemic') {
      card.classList.add('epidemic');
      card.title = 'Epidemic!';
    } else {
      // City card - find the color
      card.classList.add('city-card');
      const cityColor = getCityColor(cardName);
      if (cityColor) {
        card.classList.add(cityColor);
      }
      card.title = `City: ${cardName}`;
    }

    // Create card name element
    const cardNameElement = document.createElement('span');
    cardNameElement.classList.add('card-name');
    cardNameElement.textContent = cardName.replace('Action:', '');
    card.appendChild(cardNameElement);

    // Add data attribute for card index
    card.dataset.cardIndex = index;

    // Add click handler for potential card interactions
    card.addEventListener('click', () => handleCardClick(index, cardName));

    handContainer.appendChild(card);
  });

  // After updating the hand, update the button states
  updateButtonStates();
}

/**
 * Handle card clicks in player hand
 * @param {number} cardIndex - The index of the clicked card
 * @param {string} cardName - The name of the clicked card
 */
function handleCardClick(cardIndex, cardName) {
  console.log(`Card clicked: ${cardName} (index: ${cardIndex})`);

  // Check if we're in a mode that uses cards
  const mode = getCurrentMode();

  if (mode === 'cure') {
    // Could implement card selection for cure action
    console.log('Selecting card for cure action');
  } else if (mode === 'trade') {
    // Could implement card selection for trading
    console.log('Selecting card for trade');
  } else if (mode === 'move') {
    // Could implement direct flight if clicking on city card
    if (!cardName.startsWith('Action:') && cardName !== 'Epidemic') {
      console.log(`Using ${cardName} for direct flight`);
      // Implement direct flight here
    }
  }
}
