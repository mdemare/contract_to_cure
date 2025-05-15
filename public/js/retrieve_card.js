// retrieve_card.js
import { getCurrentGameState, getCurrentPlayer } from './game_state.js';
import { showGeneralCardSelectionModal } from './select_cards.js';
import { processAPIRequest, showErrorMessage } from './player_action_utils.js';
import { resetMode } from './action_buttons.js';

// Function to extract action cards from discard pile
function getDiscardedActionCards(gameState) {
  // Check if there's a discard pile
  if (!gameState || !gameState.decks.discardPile || !Array.isArray(gameState.decks.discardPile)) {
    return [];
  }

  // Filter out all action cards from the discard pile
  return gameState.decks.discardPile.filter(card => card && card.type == 'action');
}

// Initialize the retrieve card functionality
export function initRetrieveCard() {
  // Set up event listener for the retrieve card button
  const retrieveBtn = document.getElementById('retrieve-btn');
  if (retrieveBtn) {
    retrieveBtn.addEventListener('click', handleRetrieveCardClick);
  }
}

// Update the state of the retrieve button based on game state
export function updateRetrieveButtonState() {
  const gameState = getCurrentGameState();
  if (!gameState) return;

  const retrieveBtn = document.getElementById('retrieve-btn');
  if (!retrieveBtn) return;

  const currentPlayer = getCurrentPlayer();

  // Show the button only for the Contingency Planner
  if (currentPlayer && currentPlayer.role === 'contingency_planner') {
    retrieveBtn.style.display = 'flex';

    // Get discarded action cards
    const discardedActionCards = getDiscardedActionCards(gameState);

    // Enable the button only if there are discarded action cards and the player doesn't already have a stored card
    const hasStoredCard = currentPlayer.contingencyCard !== null &&
                          currentPlayer.contingencyCard !== undefined &&
                          currentPlayer.contingencyCard !== "";

    if (discardedActionCards.length > 0 && !hasStoredCard) {
      retrieveBtn.disabled = false;
      retrieveBtn.classList.remove('disabled');
    } else {
      retrieveBtn.disabled = true;
      retrieveBtn.classList.add('disabled');
    }
  } else {
    // Hide the button for other roles
    retrieveBtn.style.display = 'none';
  }
}

// Handle retrieve card button click
async function handleRetrieveCardClick() {
  // Reset any active mode
  resetMode();

  const gameState = getCurrentGameState();

  // Verify player is Contingency Planner
  const currentPlayer = getCurrentPlayer();
  if (currentPlayer.role !== 'contingency_planner') {
    showErrorMessage('Only the Contingency Planner can retrieve action cards');
    return;
  }

  // Get discarded action cards
  const discardedActionCards = getDiscardedActionCards(gameState);

  if (discardedActionCards.length === 0) {
    showErrorMessage('No action cards available to retrieve');
    return;
  }

  // Show card selection modal with discarded action cards

  showGeneralCardSelectionModal(
    1, // Select just one card
    discardedActionCards,
    (selectedCards) => {
      // The selected card is the full action card name
      if (selectedCards && selectedCards.length > 0) {
        let chosenCardName = discardedActionCards[selectedCards[0]].name
        retrieveActionCard(chosenCardName);
      }
    },
    'Choose an action card to retrieve'
  );
}

// Call the API to retrieve an action card
async function retrieveActionCard(actionCardName) {
  try {
    // Prepare the request data
    const retrieveData = {
      action_card_name: actionCardName
    };

    // Process the retrieve action
    await processAPIRequest(
      '/retrieve',
      retrieveData,
      `Retrieved ${actionCardName}`,
      'Failed to retrieve action card'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}
