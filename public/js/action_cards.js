// action_cards.js
// Handles all action card related functionality, including button creation,
// displaying cards in a modal, and handling specific action card behaviors.
import { getCurrentGameState } from './game_state.js';
import { showGeneralCardSelectionModal } from './select_cards.js';
import { toggleMode } from './action_buttons.js';
import { useQuietNight } from './player_actions.js';

// Store the current action card source for Government Grant
let currentActionCardSource = null;

/**
 * Create and add the Action Cards button to the action buttons panel
 * This button will show event cards from all players' hands
 */
export function initActionCardsButton() {
  // Check if the button already exists
  if (document.getElementById('action-cards-btn')) {
    return;
  }

  // Create the button element as a card
  const actionCardsBtn = document.createElement('div');
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
      player.hand.forEach((cardObj, cardIndex) => {
        if (cardObj.type === 'action') {
          actionCards.push(cardObj);
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
    const cardName = actionCards[selectedIndex].name;
    const cardSource = actionCardSources[selectedIndex];

    // Log the selected card
    console.log(`Selected action card: ${cardName}`);

    // Handle different action cards
    switch(cardName) {
      case 'Airlift':
        console.log('Airlift card selected');
        break;
      case 'Resilient Population':
        console.log('Resilient Population card selected');
        break;
      case 'Government Grant':
        console.log('Government Grant card selected');
        handleGovernmentGrant(cardSource);
        break;
      case 'Forecast':
        console.log('Forecast card selected');
        break;
      case 'One Quiet Night':
        console.log('One Quiet Night card selected');
        useQuietNight();
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
export function updateActionCardsButtonState(gameState) {
  if (!gameState || !gameState.players) {
    return;
  }

  const actionCardsBtn = document.getElementById('action-cards-btn');
  if (!actionCardsBtn) {
    return;
  }

  const hasActionCards = gameState.players.some(player =>
    player.hand?.some(card => card.type === 'action')
  );
  // Show/hide the button based on whether action cards are available
  actionCardsBtn.style.display = hasActionCards ? 'inline-flex' : 'none';
}

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
