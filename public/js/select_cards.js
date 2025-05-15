// Import dependencies
import { getCurrentGameState, getCurrentPlayer } from '/js/game_state.js';
import { getCityColor } from '/js/player_actions.js';

/**
 * Creates a selectable card element for the card selection modal
 *
 * @param {string} cardName - The name of the card
 * @param {number} index - The index of the card
 * @param {Set} selectedCards - Set to track selected card indices
 * @param {number} count - Number of cards that need to be selected
 * @param {HTMLElement} confirmButton - The confirm button to enable/disable
 * @param {Function} selectionComplete - Function to call when selection is complete
 * @returns {HTMLElement} The created card element
 */
function createSelectableCard(cardName, index, selectedCards, count, confirmButton, selectionComplete) {
  if (typeof cardName !== "string") { throw new Error("card name is not a string") }
  const card = document.createElement('div');
  card.classList.add('selectable-card');

  // Determine card type and color
  if (cardName.startsWith('Action:')) {
    card.classList.add('action');
  } else if (cardName === 'Epidemic') {
    card.classList.add('epidemic');
  } else {
    // City card - find the color
    card.classList.add('city');
    const cityColor = getCityColor(cardName);
    if (cityColor) {
      card.classList.add(cityColor);
    }
  }

  // Create card content
  const cardNameElement = document.createElement('div');
  cardNameElement.classList.add('card-name');
  cardNameElement.textContent = cardName.replace('Action:', '');
  card.appendChild(cardNameElement);

  // Add data attribute for card index
  card.dataset.cardIndex = index;

  // Add click handler for card selection
  card.addEventListener('click', () => {
    // If count is 1, select and confirm immediately
    if (count === 1) {
      selectedCards.clear(); // Clear any previous selection
      selectedCards.add(index);
      selectionComplete([index]); // Call selection complete with the index
      return;
    }

    // Otherwise, toggle selection state for multi-select mode
    if (selectedCards.has(index)) {
      selectedCards.delete(index);
      card.classList.remove('selected');
    } else {
      // Only allow selection if under the count limit
      if (selectedCards.size < count) {
        selectedCards.add(index);
        card.classList.add('selected');
      }
    }

    // Enable/disable confirm button based on selection count
    if (selectedCards.size === count) {
      confirmButton.disabled = false;
      confirmButton.classList.remove('disabled');
    } else {
      confirmButton.disabled = true;
      confirmButton.classList.add('disabled');
    }
  });

  return card;
}

// Function to show a card selection modal
export function showHandSelectionModal(count, cardIndices, completionFunction, customTitle, playerIndex) {

  // Get current game state to show player's cards
  const gameState = getCurrentGameState();

  // Use specified player index or default to current player
  const index = playerIndex !== undefined ? playerIndex : gameState.gameStatus.currentPlayerIndex;
  const player = gameState.players[index];

  if (!player || !player.hand || !Array.isArray(player.hand)) {
    return;
  }
  const cards = cardIndices.map((idx) => player.hand[idx])
  showGeneralCardSelectionModal(count, cards, completionFunction, customTitle);
}

export function showGeneralCardSelectionModal(count, cards, completionFunction, customTitle) {
  if (typeof cards[0] !== "string") { throw new Error("cards should be names, not objects") }
  // Create modal backdrop
  const modalBackdrop = document.createElement('div');
  modalBackdrop.classList.add('modal-backdrop');

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.classList.add('modal-content', 'card-selection-modal');

  // Add title
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = customTitle || `Select ${count} Card${count !== 1 ? 's' : ''}`;
  modalContent.appendChild(modalTitle);

  // Add instructions
  const instructions = document.createElement('p');
  instructions.classList.add('modal-instructions');
  instructions.textContent = customTitle
    ? `Please select ${count} card${count !== 1 ? 's' : ''} from your hand.`
    : `Please select ${count} card${count !== 1 ? 's' : ''} from your hand.`;
  modalContent.appendChild(instructions);

  // Create card selection container
  const cardSelectionContainer = document.createElement('div');
  cardSelectionContainer.classList.add('card-selection-container');

  // Track selected cards
  const selectedCards = new Set();

  // Add button container - only if count > 1
  const buttonContainer = document.createElement('div');
  buttonContainer.classList.add('modal-buttons');

  // Add cancel button - always included
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.classList.add('cancel-btn');
  cancelButton.addEventListener('click', () => {
    closeModal();
  });
  buttonContainer.appendChild(cancelButton);

  // Add confirm button - only if count > 1
  let confirmButton;
  if (count > 1) {
    confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirm Selection';
    confirmButton.classList.add('confirm-btn', 'disabled');
    confirmButton.disabled = true;
    confirmButton.addEventListener('click', () => {
      if (selectedCards.size === count) {
        const selectedIndices = Array.from(selectedCards);
        closeModal();
        completionFunction(selectedIndices);
      }
    });
    buttonContainer.appendChild(confirmButton);
  } else {
    // For count = 1, we still need a placeholder confirmButton to pass to createSelectableCard
    confirmButton = document.createElement('button');
  }

  modalContent.appendChild(buttonContainer);

  // Function to handle selection completion
  function selectionComplete(selectedIndices) {
    closeModal();
    completionFunction(selectedIndices);
  }

  // Create card elements for selection
  cards.forEach((name, index) => {
    const card = createSelectableCard(name, index, selectedCards, count, confirmButton, selectionComplete);
    cardSelectionContainer.appendChild(card);
  });

  modalContent.appendChild(cardSelectionContainer);

  // Assemble and show the modal
  modalBackdrop.appendChild(modalContent);
  document.body.appendChild(modalBackdrop);

  // Function to close the modal
  function closeModal() {
    if (modalBackdrop.parentNode) {
      document.body.removeChild(modalBackdrop);
    }
  }
}

// Function to handle hand limit checks and discard cards
export function handleHandLimitCheck(playerIndex, discardCount, completionCallback) {
  const gameState = getCurrentGameState();
  if (!gameState) {
    console.error('Game state not available for hand limit check');
    if (completionCallback) completionCallback();
    return;
  }

  const player = gameState.players[playerIndex];
  if (!player || !player.hand) {
    console.error('Player data not available for hand limit check');
    if (completionCallback) completionCallback();
    return;
  }

  // Get player name/role for the message
  const playerName = player.role;

  // Create title for the modal
  const title = `${playerName} must discard ${discardCount} card${discardCount > 1 ? 's' : ''} (Hand limit: 7)`;

  console.log(title)

  // Get all card indices
  const cardIndices = player.hand.map((_, index) => index);

  // Show card selection modal
  showHandSelectionModal(discardCount, cardIndices, async (selectedIndices) => {
    // Make API call to discard the selected cards
    try {
      const response = await fetch('/discard_cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          player_index: playerIndex,
          card_indices: selectedIndices
        })
      });

      if (response.ok) {
        // Refresh game state after discard
        const gameStateResponse = await fetch('/game_state.json');
        if (gameStateResponse.ok) {
          await gameStateResponse.json(); // This will update the game state through the event listeners
        }

        // Show success message
        const notification = document.createElement('div');
        notification.classList.add('game-notification', 'success');
        notification.textContent = `${playerName} discarded ${discardCount} card${discardCount > 1 ? 's' : ''}`;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.classList.add('fade-out');
          setTimeout(() => {
            notification.remove();
          }, 500);
        }, 3000);
      }
    } catch (error) {
      console.error('Error discarding cards:', error);
    }

    // Call completion callback
    if (completionCallback) completionCallback();
  }, title, playerIndex);
}
