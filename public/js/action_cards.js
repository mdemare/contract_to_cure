// action_cards.js
// Handles all action card related functionality, including button creation,
// displaying cards in a modal, and handling specific action card behaviors.
import { getCurrentGameState } from './game_state.js';
import { resetMode, toggleMode, getCurrentMode } from './action_mode.js';
import { showGeneralCardSelectionModal, showForecastModal } from './select_cards.js';
import {
  actionCardRequest,
  useAirlift,
  useQuietNight,
  useResilientPopulation
} from './action_card_requests.js';
import {
  clearActionCardSource,
  setActionCardSource
} from './action_card_state.js';
import { createSimpleElement } from './dom.js';
import { showPlayerSelectionPanel, getSelectedPlayerIndex } from './player_selection.js';
import { showErrorMessage } from './player_action_utils.js'

export { completeForecast } from './action_card_requests.js';
export { getActionCardSource } from './action_card_state.js';

function closeCardSelectionModal() {
  const modalBackdrop = document.querySelector('.modal-backdrop');
  if (modalBackdrop) {
    document.body.removeChild(modalBackdrop);
  }
}

function setCurrentActionCardSource(cardSource) {
  closeCardSelectionModal();
  setActionCardSource(cardSource);
}

function showActionNotification(message) {
  const existingNotification = document.getElementById('action-notification');
  if (existingNotification) {
    existingNotification.textContent = message;
    return;
  }

  const notification = createSimpleElement('div', 'action-notification', message);
  notification.id = 'action-notification';
  document.body.insertBefore(notification, document.body.firstChild);
}

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
  const actionCardsBtn = createSimpleElement('button', ['action-btn', 'action-cards', 'special-action']);
  actionCardsBtn.id = 'action-cards-btn';
  actionCardsBtn.type = 'button';

  // Create a card header
  const cardHeader = createSimpleElement('div', 'card-header', 'EVENT');

  // Create the icon element
  const iconElement = createSimpleElement('i');

  // Create the span for button text (card title)
  const textSpan = createSimpleElement('span', null, 'View Actions');

  // Assemble the button with card-like structure
  actionCardsBtn.appendChild(cardHeader);
  actionCardsBtn.appendChild(iconElement);
  actionCardsBtn.appendChild(textSpan);

  // Add click event listener
  actionCardsBtn.addEventListener('click', handleActionCardsClick);

  // Initially hide the button
  actionCardsBtn.style.display = 'none';

  // Add to the far right of the action buttons panel
  const phaseActions = document.querySelector('.phase-actions');
  if (phaseActions) {
    phaseActions.appendChild(actionCardsBtn);
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
        handleAirlift(cardSource);
        break;
      case 'Forecast':
        console.log('Forecast card selected');
        handleForecast(cardSource);
        break;
      case 'Resilient Population':
        console.log('Resilient Population card selected');
        handleResilientPopulation(cardSource);
        break;
      case 'Government Grant':
        console.log('Government Grant card selected');
        handleGovernmentGrant(cardSource);
        break;
      case 'One Quiet Night':
        console.log('One Quiet Night card selected');
        useQuietNight(); // Maybe rename to handleQuietNight for consistency
        break;
      default:
        console.log('Unknown action card type');
    }
  },
  {customTitle: 'Select Action Card', useArrayIndex: true});
}

/**
 * Handle Forecast action card
 * Allows player to examine and reorder the top 6 cards of the infection deck
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
function handleForecast(cardSource) {
  setCurrentActionCardSource(cardSource);

  actionCardRequest({ card: 'Forecast' }, 'Failed to use Forecast card')
    .then(data => {
    if (data.status === 'success' && data.type === 'forecast_view') {
      // Show the cards in a reorderable modal
      showForecastModal(data.cards);
    } else {
      // Show error message
      showErrorMessage(data.message || "Failed to use Forecast card");
    }
  })
  .catch(error => {
    console.error('Error using Forecast card:', error);
    showErrorMessage(error.message || "Error using Forecast card. Please try again.");
  });
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
 * Handle Resilient Population action card
 * Allows removal of a card from the infection discard pile
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
function handleResilientPopulation(cardSource) {
  setCurrentActionCardSource(cardSource);

  const gameState = getCurrentGameState();

  // Show infection discard pile for selection
  console.log(gameState.decks)
  const infectionDiscard = gameState.decks.infectionDiscardPile
  if (!infectionDiscard || infectionDiscard.length === 0) {
    showErrorMessage("No cards in the infection discard pile");
    return;
  }

  // Show card selection modal
  showGeneralCardSelectionModal(1, infectionDiscard, (selectedIndices) => {
    const selectedIndex = selectedIndices[0];
    const cityName = infectionDiscard[selectedIndex].name;
    completeResilientPopulation(cityName);
  }, {customTitle: 'Select a city to remove from the game', useArrayIndex: true});
}

/**
 * Complete Resilient Population action
 * @param {string} cityName - The name of the city to remove
 */
function completeResilientPopulation(cityName) {
  useResilientPopulation(cityName);

  // Reset the action card source
  clearActionCardSource();
}

/**
 * Handle Government Grant action card
 * Allows player to build a research station in any city without using a city card
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
function handleGovernmentGrant(cardSource) {
  setCurrentActionCardSource(cardSource);
  showActionNotification('Choose a city to build a research station');

  // Set the mode to government grant
  toggleMode('governmentGrant');
}

/**
 * Handle Airlift action card
 * Allows player to move any pawn to any city on the board
 * @param {Object} cardSource - The source of the card (player index and card index)
 */
function handleAirlift(cardSource) {
  setCurrentActionCardSource(cardSource);
  showActionNotification('Select a player to airlift');

  // Set the mode to airlift
  toggleMode('airlift');

  // Show the player selection panel
  showPlayerSelectionPanel();
}

// Add this function to handle the second part of Airlift after player selection
export function handleAirliftPlayerSelected() {
  // Update the notification
  const notification = document.getElementById('action-notification');
  if (notification) {
    notification.textContent = 'Select destination city for airlift';
  }
}

// Add this function to complete the Airlift action
export function completeAirlift(cityName) {
  const selectedPlayer = getSelectedPlayerIndex();

  if (selectedPlayer === null) {
    console.error('No player selected for airlift');
    return;
  }

  useAirlift(cityName, selectedPlayer)

  resetMode();

  // Remove action notification
  const notification = document.getElementById('action-notification');
  if (notification) {
    notification.remove();
  }
  // Reset the action card source
  clearActionCardSource();
}

document.addEventListener('playerSelectedForMove', () => {
  if (getCurrentMode() === 'airlift') {
    handleAirliftPlayerSelected();
  }
});
