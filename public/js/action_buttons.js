// action_buttons.js
import { getCurrentGameState } from './game_state.js';
import { getCityColor, treatDisease, pass, cureDisease } from './player_actions.js';
import { initShareKnowledge, updateShareKnowledgeButtonState } from './share_knowledge.js';
import { showGeneralCardSelectionModal } from './select_cards.js';

// Game mode state to track which action is currently selected
let currentMode = null;

// Initialize the action buttons
export function initActionButtons() {
  // Get button elements
  const moveBtn = document.getElementById('move-btn');
  const treatBtn = document.getElementById('treat-btn');
  const cureBtn = document.getElementById('cure-btn');
  const shareBtn = document.getElementById('share-btn');
  const passBtn = document.getElementById('pass-btn');

  // Add click event listeners
  moveBtn.addEventListener('click', () => toggleMode('move'));
  treatBtn.addEventListener('click', () => treatDisease());
  cureBtn.addEventListener('click', () => cureDisease());
  shareBtn.addEventListener('click', () => toggleMode('trade'));
  // Build button is handled by player_actions.js
  // Share button is handled by share_knowledge.js

  passBtn.addEventListener('click', handlePassAction);

  // Create and add Action Cards button if not already present
  createActionCardsButton();

  // Initialize share knowledge functionality
  initShareKnowledge();

  // Update button states based on current game state
  updateButtonStates();

  // Initial hand update
  updatePlayerHand(getCurrentGameState());
}

// Toggle action mode when a button is clicked
export function toggleMode(mode) {
  // If the mode is already active, deactivate it
  if (currentMode === mode) {
    resetMode();
    return;
  }

  // Set the new mode
  currentMode = mode;

  // Update UI to show active mode
  updateActiveModeUI();

  console.log(`Mode switched to: ${mode}`);
}

// Reset the current mode
export function resetMode() {
  currentMode = null;
  updateActiveModeUI();

  // Dispatch event to notify that the mode has been reset
  const modeResetEvent = new CustomEvent('actionModeReset');
  document.dispatchEvent(modeResetEvent);
}

// Update UI to highlight the active mode button
function updateActiveModeUI() {
  // Remove active class from all buttons
  const buttons = document.querySelectorAll('.action-btn');
  buttons.forEach(button => {
    button.classList.remove('active');
  });

  // Add active class to the current mode button
  if (currentMode) {
    const activeButton = document.getElementById(`${currentMode}-btn`);
    if (activeButton) {
      activeButton.classList.add('active');
    }
  }
}

// Update button states based on game state
export function updateButtonStates() {
  const gameState = getCurrentGameState();

  if (!gameState) return;

  // Determine which actions are available based on game state
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) return;

  // Check for build station action availability
  const buildBtn = document.getElementById('build-btn');
  if (buildBtn) {
    // Check if player has the city card matching their location
    const currentLocation = currentPlayer.location;
    const hasCityCard = currentPlayer.hand.includes(currentLocation);

    // Check if there's already a research station at this location
    const hasStation = gameState.researchStations &&
                      gameState.researchStations.locations &&
                      gameState.researchStations.locations.includes(currentLocation);

    // Enable/disable the build button based on conditions
    if (hasCityCard && !hasStation) {
      buildBtn.classList.remove('disabled');
      buildBtn.disabled = false;
    } else {
      buildBtn.classList.add('disabled');
      buildBtn.disabled = true;
    }
  }

  // Update share knowledge button state
  updateShareKnowledgeButtonState();

  // Update action cards button visibility
  updateActionCardsButtonState(gameState);

  // For now, all other buttons are enabled
  enableAllButtons();
}

// Handler for pass action
function handlePassAction() {
  pass();
}

// Helper functions for game actions
function disableAllButtons() {
  const buttons = document.querySelectorAll('.action-btn');
  buttons.forEach(button => {
    button.classList.add('disabled');
    button.disabled = true;
  });
}

function enableAllButtons() {
  const buttons = document.querySelectorAll('.action-btn');
  buttons.forEach(button => {
    button.classList.remove('disabled');
    button.disabled = false;
  });
}

function enableSpecificButtons(buttonIds) {
  // First disable all buttons
  disableAllButtons();

  // Then enable only the specified buttons
  buttonIds.forEach(id => {
    const button = document.getElementById(id);
    if (button) {
      button.classList.remove('disabled');
      button.disabled = false;
    }
  });
}

// Get the current action mode
export function getCurrentMode() {
  return currentMode;
}

// Export helper functions for use in other modules
export { disableAllButtons, enableAllButtons, enableSpecificButtons };

/**
 * Create and add the Action Cards button to the action buttons panel
 * This button will show event cards from all players' hands
 */
function createActionCardsButton() {
  // Check if the button already exists
  if (document.getElementById('action-cards-btn')) {
    return;
  }

  // Create the button element as a card
  const actionCardsBtn = document.createElement('button');
  actionCardsBtn.id = 'action-cards-btn';
  actionCardsBtn.className = 'action-btn action-cards special-action';

  // Create a card header
  const cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';
  cardHeader.textContent = 'EVENT';

  // Create the icon element
  const iconElement = document.createElement('i');

  // Create the span for button text (card title)
  const textSpan = document.createElement('span');
  textSpan.textContent = 'View Actions';

  // Assemble the button with card-like structure
  actionCardsBtn.appendChild(cardHeader);
  actionCardsBtn.appendChild(iconElement);
  actionCardsBtn.appendChild(textSpan);

  // Add click event listener
  actionCardsBtn.addEventListener('click', handleActionCardsClick);

  // Initially hide the button
  actionCardsBtn.style.display = 'none';

  // Add to the far right of the action buttons panel
  const actionButtons = document.querySelector('.action-buttons');
  if (actionButtons) {
    actionButtons.appendChild(actionCardsBtn);
  }
}

/**
 * Handle click on the Action Cards button
 * Collect all action cards from all players and show them in a modal
 */
function handleActionCardsClick() {
  const gameState = getCurrentGameState();
  if (!gameState || !gameState.players) {
    return;
  }

  // Collect all action cards from all players
  const actionCards = [];
  const actionCardSources = [];

  gameState.players.forEach((player, playerIndex) => {
    if (player.hand) {
      player.hand.forEach((cardName, cardIndex) => {
        if (cardName.startsWith('Action:')) {
          actionCards.push(cardName);
          actionCardSources.push({ playerIndex, cardIndex });
        }
      });
    }
  });

  // If no action cards found, do nothing
  if (actionCards.length === 0) {
    console.log('No action cards available');
    return;
  }

  // Show the modal with action cards and handle the selected card
  showGeneralCardSelectionModal(1, actionCards, (selectedIndices) => {
    const selectedIndex = selectedIndices[0];
    const cardName = actionCards[selectedIndex];
    const cardSource = actionCardSources[selectedIndex];

    // Log the selected card
    console.log(`Selected action card: ${cardName}`);

    // Handle different action cards
    switch(cardName) {
      case 'Action:Airlift':
        console.log('Airlift card selected');
        break;
      case 'Action:Resilient Population':
        console.log('Resilient Population card selected');
        break;
      case 'Action:Government Grant':
        console.log('Government Grant card selected');
        handleGovernmentGrant(cardSource);
        break;
      case 'Action:Forecast':
        console.log('Forecast card selected');
        break;
      case 'Action:One Quiet Night':
        console.log('One Quiet Night card selected');
        break;
      default:
        console.log('Unknown action card type');
    }
  }, 'Select Action Card');
}

/**
 * Update the visibility of the Action Cards button
 * @param {Object} gameState - The current game state
 */
function updateActionCardsButtonState(gameState) {
  if (!gameState || !gameState.players) {
    return;
  }

  const actionCardsBtn = document.getElementById('action-cards-btn');
  if (!actionCardsBtn) {
    return;
  }

  // Check if any player has action cards
  let hasActionCards = false;

  for (const player of gameState.players) {
    if (player.hand) {
      for (const cardName of player.hand) {
        if (cardName.startsWith('Action:')) {
          hasActionCards = true;
          break;
        }
      }
    }
    if (hasActionCards) break;
  }

  // Show/hide the button based on whether action cards are available
  actionCardsBtn.style.display = hasActionCards ? 'inline-flex' : 'none';
}

// Store the current action card source for Government Grant
let currentActionCardSource = null;

/**
 * Get the current action card source
 * @returns {Object|null} The source of the action card
 */
export function getActionCardSource() {
  return currentActionCardSource;
}

/**
 * Handle Government Grant action card
 * Allows player to build a research station in any city without using a city card
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
function handleGovernmentGrant(cardSource) {
  // Close the card selection modal
  if (document.querySelector('.modal-backdrop')) {
    document.body.removeChild(document.querySelector('.modal-backdrop'));
  }

  // Store the card source for later use
  currentActionCardSource = cardSource;

  // Add notification at the top of the page
  const notification = document.createElement('div');
  notification.id = 'action-notification';
  notification.textContent = 'Choose a city to build a research station';
  notification.classList.add('action-notification');
  document.body.insertBefore(notification, document.body.firstChild);

  // Set the mode to government grant
  toggleMode('governmentGrant');
}

/**
 * Use an action card
 * @param {string} cardName - The name of the action card
 * @param {string} cityName - The city to apply the action to
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
export async function useActionCard(cardName, cityName, cardSource) {
  try {
    const response = await fetch('/action_card', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        card: cardName,
        city: cityName,
        player_index: cardSource.playerIndex,
        card_index: cardSource.cardIndex
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`Used ${cardName} on ${cityName}`, data);

      // Refresh game state
      const gameStateResponse = await fetch('/game_state.json');
      if (gameStateResponse.ok) {
        await gameStateResponse.json();
      }
    } else {
      console.error('Error using action card:', await response.text());
    }
  } catch (error) {
    console.error('Error using action card:', error);
  }
}

// Function to update player hand
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

// Handle card clicks
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
