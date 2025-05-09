// Import dependencies
import { getCurrentGameState } from '/js/game_state.js';
import { getCityColor } from '/js/player_actions.js';

// Function to show a card selection modal
export function showCardSelectionModal(count, cardIndices, completionFunction, customTitle, playerIndex) {
  // Get current game state to show player's cards
  const gameState = getCurrentGameState();
  if (!gameState) {
    return;
  }

  // Use specified player index or default to current player
  const currentPlayerIndex = playerIndex !== undefined ? playerIndex : gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer || !currentPlayer.hand || !Array.isArray(currentPlayer.hand)) {
    return;
  }

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

  // Create card elements for selection
  currentPlayer.hand.forEach((cardName, index) => {
    if (cardIndices && !cardIndices.includes(index)) { return }

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
      // Toggle selection state
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

    cardSelectionContainer.appendChild(card);
  });

  modalContent.appendChild(cardSelectionContainer);

  // Add button container
  const buttonContainer = document.createElement('div');
  buttonContainer.classList.add('modal-buttons');

  // Add cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.classList.add('cancel-btn');
  cancelButton.addEventListener('click', () => {
    closeModal();
  });

  // Add confirm button
  const confirmButton = document.createElement('button');
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

  buttonContainer.appendChild(cancelButton);
  buttonContainer.appendChild(confirmButton);
  modalContent.appendChild(buttonContainer);

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

  // Get all card indices
  const cardIndices = player.hand.map((_, index) => index);

  // Show card selection modal
  showCardSelectionModal(discardCount, cardIndices, async (selectedIndices) => {
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
