// Import dependencies
import { getCurrentGameState, loadGameState } from './game_state.js';
import { createSimpleElement } from './dom.js';
import { completeForecast } from './action_card_requests.js';
import { registerHandLimitHandler } from './hand_limit_prompt.js';
import { decorateGameCard } from './card_visuals.js';

let cardModalId = 0;

function updateSelectableCardStates(cards, selectedCards, count) {
  const selectionFull = selectedCards.size >= count;

  cards.forEach(card => {
    const cardIndex = Number(card.dataset.cardIndex);
    const selected = selectedCards.has(cardIndex);
    const permanentlyDisabled = card.dataset.permanentlyDisabled === 'true';
    const unavailable = permanentlyDisabled || (selectionFull && !selected);

    card.classList.toggle('selected', selected);
    card.classList.toggle('is-unavailable', unavailable);
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-disabled', String(unavailable));
    card.disabled = unavailable;
  });
}

/**
 * Creates a selectable card element for the card selection modal
 *
 * @param {Object} cardObj - Card data from the game state
 * @param {number} index - The index of the card
 * @param {Set} selectedCards - Set to track selected card indices
 * @param {number} count - Number of cards that need to be selected
 * @param {HTMLElement} confirmButton - The confirm button to enable/disable
 * @param {Function} selectionComplete - Function to call when selection is complete
 * @param {HTMLElement[]} selectableCards - All cards in this selection surface
 * @returns {HTMLElement} The created card element
 */
function createSelectableCard(cardObj, index, selectedCards, count, confirmButton, selectionComplete, selectableCards) {
  if(typeof index !== 'number') { throw new Error("index must be an number")}

  const card = createSimpleElement('button', 'selectable-card');
  card.type = 'button';
  card.setAttribute('aria-pressed', 'false');
  card.dataset.permanentlyDisabled = String(Boolean(cardObj.disabled));

  // Determine card type and color
  if (cardObj.type == 'action') {
    card.classList.add('action');
  } else if (cardObj.type == 'epidemic') {
    card.classList.add('epidemic');
  } else {
    card.classList.add('city');
    if (cardObj.color) card.classList.add(cardObj.color);
  }

  const presentation = decorateGameCard(card, cardObj);
  card.setAttribute(
    'aria-label',
    `${presentation.name}, ${presentation.typeLabel}, ${presentation.familyLabel}`
  );

  // Add data attribute for card index
  card.dataset.cardIndex = index;

  // Add click handler for card selection
  card.addEventListener('click', () => {
    // If count is 1, select and confirm immediately
    if (count === 1) {
      selectedCards.clear(); // Clear any previous selection
      selectedCards.add(index);
      updateSelectableCardStates(selectableCards, selectedCards, count);
      selectionComplete([index]); // Call selection complete with the index
      return;
    }

    // Otherwise, toggle selection state for multi-select mode
    if (selectedCards.has(index)) {
      selectedCards.delete(index);
    } else {
      // Only allow selection if under the count limit
      if (selectedCards.size < count) {
        selectedCards.add(index);
      }
    }

    updateSelectableCardStates(selectableCards, selectedCards, count);

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
  const previouslyFocused = document.activeElement;
  // Create modal backdrop
  const modalBackdrop = createSimpleElement('div', 'modal-backdrop');

  // Create modal content
  const modalContent = createSimpleElement('div', ['modal-content', 'card-selection-modal']);
  const modalId = ++cardModalId;
  modalContent.setAttribute('role', 'dialog');
  modalContent.setAttribute('aria-modal', 'true');
  modalContent.setAttribute('aria-labelledby', `card-modal-title-${modalId}`);

  // Add title
  const modalTitle = createSimpleElement('h3', null, customTitle || `Select ${count} Card${count !== 1 ? 's' : ''}`);
  modalTitle.id = `card-modal-title-${modalId}`;
  modalContent.appendChild(modalTitle);

  // Add instructions
  const instructions = createSimpleElement('p', 'modal-instructions',
    `Please select ${count} card${count !== 1 ? 's' : ''}.`);
  modalContent.appendChild(instructions);

  // Create card selection container
  const cardSelectionContainer = createSimpleElement('div', 'card-selection-container');

  // Track selected cards
  const selectedCards = new Set();
  const selectableCards = [];

  // Add button container - only if count > 1
  const buttonContainer = createSimpleElement('div', 'modal-buttons');

  // Add cancel button
  if (!hideCancel) {
    const cancelButton = createSimpleElement('button', 'cancel-btn', 'Cancel');
    cancelButton.type = 'button';
    cancelButton.addEventListener('click', () => {
      closeModal();
    });
    buttonContainer.appendChild(cancelButton);
  }

  // Add confirm button - only if count > 1
  let confirmButton;
  if (count > 1) {
    confirmButton = createSimpleElement('button', ['confirm-btn', 'disabled'], 'Confirm Selection');
    confirmButton.type = 'button';
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

  // Function to handle selection completion
  function selectionComplete(selectedIndices) {
    if (!selectedIndices.every(item => typeof item === 'number')) { throw new Error("must be indices")}
    closeModal();
    completionFunction(selectedIndices);
  }

  // Create card elements for selection
  cards.forEach((cardObj, idx) => {
    // for selections that are not from a single player's hand such as action cards, we use the array index
    const index = useArrayIndex ? idx : cardObj.index
    const card = createSelectableCard(
      cardObj,
      index,
      selectedCards,
      count,
      confirmButton,
      selectionComplete,
      selectableCards
    );
    selectableCards.push(card);
    cardSelectionContainer.appendChild(card);
  });

  updateSelectableCardStates(selectableCards, selectedCards, count);

  modalContent.appendChild(cardSelectionContainer);
  modalContent.appendChild(buttonContainer);

  // Assemble and show the modal
  modalBackdrop.appendChild(modalContent);
  document.body.appendChild(modalBackdrop);

  const firstAvailableCard = selectableCards.find(card => !card.disabled);
  if (firstAvailableCard) firstAvailableCard.focus();

  function handleModalKeydown(event) {
    if (event.key === 'Escape' && !hideCancel) closeModal();
  }
  document.addEventListener('keydown', handleModalKeydown);

  // Function to close the modal
  function closeModal() {
    document.removeEventListener('keydown', handleModalKeydown);
    if (modalBackdrop.parentNode) {
      document.body.removeChild(modalBackdrop);
    }
    if (previouslyFocused?.focus) previouslyFocused.focus();
  }
}

/**
 * Shows a modal with infection discard cards for Resilient Population
 * @param {Array} infectionCards - Array of infection cards from the discard pile
 * @param {Function} completionFunction - Function to call when a card is selected
 */
export function showResilientPopulationModal(infectionCards, completionFunction) {
  const previouslyFocused = document.activeElement;
  // Create modal backdrop
  const modalBackdrop = createSimpleElement('div', 'modal-backdrop');

  // Create modal content with resilient population styling
  const modalContent = createSimpleElement('div', ['modal-content', 'card-selection-modal', 'resilient-population-modal']);
  const modalId = ++cardModalId;
  modalContent.setAttribute('role', 'dialog');
  modalContent.setAttribute('aria-modal', 'true');
  modalContent.setAttribute('aria-labelledby', `card-modal-title-${modalId}`);

  // Add title
  const modalTitle = createSimpleElement('h3', null, 'Remove City from Infection Discard Pile');
  modalTitle.id = `card-modal-title-${modalId}`;
  modalContent.appendChild(modalTitle);

  // Add instructions
  const instructions = createSimpleElement('p', 'modal-instructions',
    'Select a city to permanently remove from the game. This city will no longer be infected.');
  modalContent.appendChild(instructions);

  // Create card selection container with specialized class
  const cardSelectionContainer = createSimpleElement('div', 'infection-selection-container');

  // Track selected cards (only one in this case)
  const selectedCards = new Set();

  // Add button container
  const buttonContainer = createSimpleElement('div', 'modal-buttons');

  // Function to handle selection completion
  function selectionComplete(selectedCity) {
    closeModal();
    completionFunction(selectedCity);
  }

  // Create card elements for selection
  infectionCards.forEach((cardObj, idx) => {
    const card = createSimpleElement('button', ['selectable-card', 'infection-card', cardObj.color]);
    card.type = 'button';
    const presentation = decorateGameCard(card, { ...cardObj, type: 'infection' });
    card.setAttribute('aria-label', `${presentation.name}, ${presentation.familyLabel}`);

    // Add click handler
    card.addEventListener('click', () => {
      selectedCards.clear(); // Clear any previous selection
      selectionComplete(cardObj.name); // Complete with the city name
    });

    cardSelectionContainer.appendChild(card);
  });

  const cancelButton = createSimpleElement('button', 'cancel-btn', 'Cancel');
  cancelButton.type = 'button';
  cancelButton.addEventListener('click', closeModal);
  buttonContainer.appendChild(cancelButton);

  modalContent.appendChild(cardSelectionContainer);
  modalContent.appendChild(buttonContainer);

  // Assemble and show the modal
  modalBackdrop.appendChild(modalContent);
  document.body.appendChild(modalBackdrop);

  cardSelectionContainer.querySelector('.selectable-card')?.focus();
  document.addEventListener('keydown', handleModalKeydown);

  function handleModalKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  // Function to close the modal
  function closeModal() {
    document.removeEventListener('keydown', handleModalKeydown);
    if (modalBackdrop.parentNode) {
      document.body.removeChild(modalBackdrop);
    }
    if (previouslyFocused?.focus) previouslyFocused.focus();
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
  if (!player) {
    console.error(`Player data not available for hand limit check, index ${playerIndex}`);
    if (completionCallback) completionCallback();
    return;
  }
  if (!player.hand) {
    console.error('Player HAND not available for hand limit check');
    console.error(player);
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
    // Convert selected indices to card names
    const selectedCardNames = selectedIndices.map(index => player.hand[index].name);
    
    // Make API call to discard the selected cards
    try {
      const response = await fetch('/discard_cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
        },
        body: JSON.stringify({
          player_index: playerIndex,
          card_names: selectedCardNames
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

registerHandLimitHandler((playerIndex, discardCount) => new Promise(resolve => {
  handleHandLimitCheck(playerIndex, discardCount, resolve);
}));

/**
 * Shows a modal with the top infection cards for Forecast
 * Allows cards to be reordered by dragging
 * @param {Array} cards - Array of infection cards from the top of the deck
 */
export function showForecastModal(cards) {
  const previouslyFocused = document.activeElement;
  // Create modal backdrop
  const modalBackdrop = createSimpleElement('div', 'modal-backdrop');

  // Create modal content with forecast styling
  const modalContent = createSimpleElement('div', ['modal-content', 'card-selection-modal', 'forecast-modal']);
  const modalId = ++cardModalId;
  modalContent.setAttribute('role', 'dialog');
  modalContent.setAttribute('aria-modal', 'true');
  modalContent.setAttribute('aria-labelledby', `card-modal-title-${modalId}`);

  // Add title
  const modalTitle = createSimpleElement('h3', null, 'Forecast: Reorder Infection Cards');
  modalTitle.id = `card-modal-title-${modalId}`;
  modalContent.appendChild(modalTitle);

  // Add instructions
  const instructions = createSimpleElement('p', 'modal-instructions',
    'Drag cards or use Earlier and Later. Position 1 will be drawn next.');
  modalContent.appendChild(instructions);

  // Create container for the cards
  const cardContainer = createSimpleElement('div', ['forecast-cards-container', 'draggable-container']);

  // Create reorderable cards
  cards.forEach((card, index) => {
    const cardElement = createSimpleElement('div', ['forecast-card', 'draggable-card', card.color]);
    cardElement.dataset.cityName = card.name;
    cardElement.draggable = true;

    // Add number indicating position in the deck (1 is top card)
    const positionIndicator = createSimpleElement('div', 'card-position', String(index + 1));
    cardElement.appendChild(positionIndicator);

    decorateGameCard(cardElement, { ...card, type: 'infection' });

    const cardControls = createSimpleElement('div', 'forecast-card-controls');
    const earlierButton = createSimpleElement('button', 'forecast-move-button', 'Earlier');
    const laterButton = createSimpleElement('button', 'forecast-move-button', 'Later');
    earlierButton.type = 'button';
    laterButton.type = 'button';
    earlierButton.setAttribute('aria-label', `Move ${card.name} earlier`);
    laterButton.setAttribute('aria-label', `Move ${card.name} later`);
    earlierButton.addEventListener('click', () => moveCard(cardElement, -1));
    laterButton.addEventListener('click', () => moveCard(cardElement, 1));
    cardControls.appendChild(earlierButton);
    cardControls.appendChild(laterButton);
    cardElement.appendChild(cardControls);

    // Set up drag handlers
    cardElement.addEventListener('dragstart', dragStart);
    cardElement.addEventListener('dragover', dragOver);
    cardElement.addEventListener('drop', drop);
    cardElement.addEventListener('dragenter', dragEnter);
    cardElement.addEventListener('dragleave', dragLeave);

    cardContainer.appendChild(cardElement);
  });

  modalContent.appendChild(cardContainer);

  // Add button container
  const buttonContainer = createSimpleElement('div', 'modal-buttons');

  // Add confirm button
  const confirmButton = createSimpleElement('button', 'confirm-btn', 'Confirm Order');
  confirmButton.type = 'button';
  confirmButton.addEventListener('click', () => {
    const cardOrder = Array.from(cardContainer.children).map(card => card.dataset.cityName);
    closeModal();
    completeForecast(cardOrder);
  });
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
    if (previouslyFocused?.focus) previouslyFocused.focus();
  }

  // Drag and drop functions
  let draggedCard = null;

  function moveCard(card, direction) {
    const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
    if (!sibling) return;

    if (direction < 0) {
      cardContainer.insertBefore(card, sibling);
    } else {
      cardContainer.insertBefore(sibling, card);
    }
    updatePositionIndicators();
  }

  function dragStart(e) {
    draggedCard = this;
    setTimeout(() => this.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  }

  function dragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function dragEnter(e) {
    this.classList.add('drag-over');
  }

  function dragLeave(e) {
    this.classList.remove('drag-over');
  }

  function drop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');

    // Don't do anything if dropping onto the same card
    if (draggedCard === this) return false;

    // Get the positions in the container
    const cards = Array.from(cardContainer.children);
    const fromIndex = cards.indexOf(draggedCard);
    const toIndex = cards.indexOf(this);

    // Reorder the elements
    if (fromIndex < toIndex) {
      cardContainer.insertBefore(draggedCard, this.nextSibling);
    } else {
      cardContainer.insertBefore(draggedCard, this);
    }

    // Update position indicators
    updatePositionIndicators();

    return false;
  }

  function updatePositionIndicators() {
    const cards = Array.from(cardContainer.children);
    cards.forEach((card, index) => {
      const positionIndicator = card.querySelector('.card-position');
      if (positionIndicator) {
        positionIndicator.textContent = String(index + 1);
      }

      const controls = card.querySelectorAll('.forecast-move-button');
      if (controls[0]) controls[0].disabled = index === 0;
      if (controls[1]) controls[1].disabled = index === cards.length - 1;
    });
  }

  updatePositionIndicators();
  cardContainer.querySelector('.forecast-move-button:not(:disabled)')?.focus();
}
