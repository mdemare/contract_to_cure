// Import dependencies
import { getCurrentGameState } from '/js/game_state.js';
import { getCityColor } from './player_action_utils.js';
import { createSimpleElement } from './dom.js';
import { loadGameState } from './game_state.js';

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
function createSelectableCard(cardObj, index, selectedCards, count, confirmButton, selectionComplete) {
  if(typeof index !== 'number') { throw new Error("index must be an number")}
  const cardName = cardObj.name;

  const card = createSimpleElement('div', 'selectable-card');

  // Determine card type and color
  if (cardObj.type == 'action') {
    card.classList.add('action');
  } else if (cardObj.type == 'event') {
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
  const cardNameElement = createSimpleElement('div', 'card-name', cardName.replace('Action:', ''));
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
export function showHandSelectionModal(count, cardIndices, completionFunction, {customTitle, playerIndex, hideCancel = false}) {

  // Get current game state to show player's cards
  const gameState = getCurrentGameState();

  // Use specified player index or default to current player
  const index = playerIndex !== undefined ? playerIndex : gameState.gameStatus.currentPlayerIndex;
  const player = gameState.players[index];

  if (!player || !player.hand || !Array.isArray(player.hand)) {
    return;
  }
  const cards = cardIndices.map((idx) => player.hand[idx])
  showGeneralCardSelectionModal(count, cards, completionFunction, {customTitle, hideCancel});
}

export function showGeneralCardSelectionModal(count, cards, completionFunction, {customTitle, useArrayIndex = false, hideCancel = false}) {
  // Create modal backdrop
  const modalBackdrop = createSimpleElement('div', 'modal-backdrop');

  // Create modal content
  const modalContent = createSimpleElement('div', ['modal-content', 'card-selection-modal']);

  // Add title
  const modalTitle = createSimpleElement('h3', null, customTitle || `Select ${count} Card${count !== 1 ? 's' : ''}`);
  modalContent.appendChild(modalTitle);

  // Add instructions
  const instructions = createSimpleElement('p', 'modal-instructions',
    `Please select ${count} card${count !== 1 ? 's' : ''} from your hand.`);
  modalContent.appendChild(instructions);

  // Create card selection container
  const cardSelectionContainer = createSimpleElement('div', 'card-selection-container');

  // Track selected cards
  const selectedCards = new Set();

  // Add button container - only if count > 1
  const buttonContainer = createSimpleElement('div', 'modal-buttons');

  // Add cancel button
  if (!hideCancel) {
    const cancelButton = createSimpleElement('button', 'cancel-btn', 'Cancel');
    cancelButton.addEventListener('click', () => {
      closeModal();
    });
    buttonContainer.appendChild(cancelButton);
  }

  // Add confirm button - only if count > 1
  let confirmButton;
  if (count > 1) {
    confirmButton = createSimpleElement('button', ['confirm-btn', 'disabled'], 'Confirm Selection');
    confirmButton.disabled = true;
    confirmButton.addEventListener('click', () => {
      if (selectedCards.size === count) {
        const selectedIndices = Array.from(selectedCards);
        closeModal();
        if (!selectedIndices.every(item => typeof item === 'number')) { throw new Error("must be indices")}
        completionFunction(selectedIndices);
      }
    });
    buttonContainer.appendChild(confirmButton);
  } else {
    // For count = 1, we still need a placeholder confirmButton to pass to createSelectableCard
    confirmButton = createSimpleElement('button');
  }

  modalContent.appendChild(buttonContainer);

  // Function to handle selection completion
  function selectionComplete(selectedIndices) {
    if (!selectedIndices.every(item => typeof item === 'number')) { throw new Error("must be indices")}
    closeModal();
    completionFunction(selectedIndices);
  }

  // Create card elements for selection
  cards.forEach((cardObj, idx) => {
    console.log(`cardObj ${cardObj}, idx = ${idx}, cardObj.index = ${cardObj.index}`)
    // for selections that are not from a single player's hand such as action cards, we use the array index
    const index = useArrayIndex ? idx : cardObj.index
    const card = createSelectableCard(cardObj, index, selectedCards, count, confirmButton, selectionComplete);
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

/**
 * Handles the situation when a player exceeds their hand limit (7 cards).
 * Shows a modal allowing the player to select cards to discard and processes the discard action.
 *
 * @async
 * @param {number} playerIndex - The index of the player who needs to discard cards
 * @param {number} discardCount - The number of cards the player needs to discard
 * @param {Function} completionCallback - Callback function to execute after discard is complete
 *
 * @description
 * This function performs the following actions:
 * 1. Retrieves the current game state to access player data
 * 2. Creates a custom modal title indicating the required discard action
 * 3. Shows a card selection modal allowing the player to select which cards to discard
 * 4. Once cards are selected, sends a POST request to the server to discard the cards
 * 5. Refreshes the game state after the discard action
 * 6. Displays a success notification to inform the player
 * 7. Executes the completion callback to signal that the discard process is complete
 *
 * The function includes error handling for situations where the game state is unavailable
 * or the player data cannot be accessed. The modal forces the player to make a selection
 * (the cancel button is hidden) since resolving the hand limit is mandatory.
 *
 * @example
 * // When a player draws a card and exceeds the hand limit
 * handleHandLimitCheck(2, 1, () => {
 *   console.log('Discard complete, continuing with game flow');
 * });
 *
 * @returns {void}
 * @throws {Error} If the network request fails when discarding cards
 */
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
  const customTitle = `${playerName} must discard ${discardCount} card${discardCount > 1 ? 's' : ''} (Hand limit: 7)`;

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
        loadGameState();

        // Show success message
        const notification = createSimpleElement('div', ['game-notification', 'success'],
          `${playerName} discarded ${discardCount} card${discardCount > 1 ? 's' : ''}`);
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
  }, {customTitle, playerIndex, hideCancel: true});
}
