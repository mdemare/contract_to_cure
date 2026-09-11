// action_buttons.js - updated with retrieve card functionality and draw cards button
import { toggleMode } from './action_mode.js';
import { getCurrentGameState } from './game_state.js';
import { cureDisease, pass, treatDisease } from './ordinary_player_actions.js';
import { initShareKnowledge, updateShareKnowledgeButtonState } from './share_knowledge.js';
import { initActionCardsButton, updateActionCardsButtonState } from './action_cards.js';
import { initRetrieveCard, updateRetrieveButtonState } from './retrieve_card.js';
import { processAPIRequest, showSuccessMessage, showErrorMessage } from './player_action_utils.js';
import { handleEndOfTurnEvents } from './end_turn_events.js';

let actionBarResizeObserver;

function initializeActionBarLayout() {
  const actionBar = document.querySelector('.action-buttons');
  if (!actionBar) return;

  const updateActionBarHeight = () => {
    const height = Math.ceil(actionBar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--action-bar-height', `${height}px`);
  };

  updateActionBarHeight();

  if ('ResizeObserver' in window) {
    actionBarResizeObserver = new ResizeObserver(updateActionBarHeight);
    actionBarResizeObserver.observe(actionBar);
  } else {
    window.addEventListener('resize', updateActionBarHeight);
  }
}

// Initialize the action buttons
export function initActionButtons() {
  // Get button elements
  const moveBtn = document.getElementById('move-btn');
  const treatBtn = document.getElementById('treat-btn');
  const cureBtn = document.getElementById('cure-btn');
  const shareBtn = document.getElementById('share-btn');
  const passBtn = document.getElementById('pass-btn');
  const drawCardsBtn = document.getElementById('draw-cards-btn');
  const infectCitiesBtn = document.getElementById('infect-cities-btn');

  // Add click event listeners
  moveBtn.addEventListener('click', () => toggleMode('move'));
  treatBtn.addEventListener('click', () => treatDisease());
  cureBtn.addEventListener('click', () => cureDisease());
  shareBtn.addEventListener('click', () => toggleMode('trade'));
  // Build button is handled by ordinary_player_actions.js
  passBtn.addEventListener('click', handlePassAction);

  // Add draw cards button event listener
  if (drawCardsBtn) {
    drawCardsBtn.addEventListener('click', handleDrawCardsAction);
  } else {
    console.error('Draw cards button not found in the DOM');
  }

  // Add infect cities button event listener
  if (infectCitiesBtn) {
    infectCitiesBtn.addEventListener('click', handleInfectCitiesAction);
  } else {
    console.error('Infect cities button not found in the DOM');
  }

  // Create and add Action Cards button if not already present
  initActionCardsButton();

  // Initialize share knowledge functionality
  initShareKnowledge();

  // Initialize retrieve card functionality
  initRetrieveCard();

  // Update button states based on current game state
  updateButtonStates();

  initializeActionBarLayout();
}

// Update button states based on game state
export function updateButtonStates() {
  const gameState = getCurrentGameState();

  if (!gameState) return;

  // Determine which actions are available based on game state
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];
  const actionsRemaining = gameState.gameStatus.actions_remaining;
  const phase = gameState.gameStatus.phase
  console.log(`phase = ${phase}`)

  const actionBar = document.querySelector('.action-buttons');
  if (actionBar) {
    actionBar.dataset.phase = phase;
  }

  if (!currentPlayer) return;

  // Check for no actions remaining, show draw cards button and hide action buttons
  const drawCardsBtn = document.getElementById('draw-cards-btn');
  const infectCitiesBtn = document.getElementById('infect-cities-btn');
  const actionButtonsList = document.querySelectorAll('.action-btn');

  // Get action cards button separately as it should be available in all phases
  const actionCardsBtn = document.getElementById('action-cards-btn');

  if (phase === 'pending_discard') {
    actionButtonsList.forEach(button => {
      if (button.id !== 'action-cards-btn') {
        button.style.display = 'none';
        button.classList.add('disabled');
        button.disabled = true;
      }
    });
    drawCardsBtn.style.display = 'none';
    infectCitiesBtn.style.display = 'none';
    updateActionCardsButtonState(gameState);
    updateRetrieveButtonState();
    return;
  }
  
  if (phase === 'player_actions') {
    // Show all other action buttons
    actionButtonsList.forEach(button => {
      button.style.display = 'flex';
    });
    drawCardsBtn.style.display = 'none';
    infectCitiesBtn.style.display = 'none';
  } else {
    // Hide all other action buttons except action cards
    actionButtonsList.forEach(button => {
      if (button.id !== 'action-cards-btn') {
        button.style.display = 'none';
      }
    });

    if (phase === 'draw_cards') {
      drawCardsBtn.style.display = 'flex';
    } else {
      infectCitiesBtn.style.display = 'flex';
    }
  }
  
  // Always show action cards button if any player has event cards
  if (actionCardsBtn) {
    const hasEventCards = gameState.players.some(player => 
      player.hand.some(card => card.type === 'action')
    );
    actionCardsBtn.style.display = hasEventCards ? 'flex' : 'none';
  }

  updateBuildButtonState(gameState, currentPlayer);

  // Update share knowledge button state
  updateShareKnowledgeButtonState();

  // Update action cards button visibility
  updateActionCardsButtonState(gameState);

  // Update retrieve card button visibility
  updateRetrieveButtonState();

  // For now, all other buttons are enabled if actions remaining
  if (actionsRemaining > 0) {
    enableAllButtons();
  }
}

// Handler for pass action
function handlePassAction() {
  pass();
}

// Handler for continue action
async function handleDrawCardsAction() {
  try {
    await processAPIRequest(
      '/draw_cards',
      {},
      'Continuing to next phase',
      'Failed to continue to next phase'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Handler for infect cities action
async function handleInfectCitiesAction() {
  try {
    // Get CSRF token from meta tag
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    // Process the API request with custom handling for animation continuation
    const response = await fetch('/infect_cities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({})
    });

    if (response.ok) {
      const result = await response.json();

      if (result.status === 'success') {
        await handleEndOfTurnEvents(result.end_turn_events)

        const gameStateModule = await import('./game_state.js');
        // Update game state
        if (result.game_state) {
          await gameStateModule.loadGameState(result.game_state);
        } else {
          await gameStateModule.loadGameState();
        }

        showSuccessMessage(result.message || 'Cities infected');
      } else {
        showErrorMessage(result.message || 'Failed to infect cities');
      }
    } else {
      showErrorMessage(`Failed to infect cities (${response.status}). The backend might not be implemented yet.`);
    }
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Helper functions for game actions
export function disableAllButtons() {
  const buttons = document.querySelectorAll('.action-btn');
  buttons.forEach(button => {
    button.classList.add('disabled');
    button.disabled = true;
  });
}

export function enableAllButtons() {
  const buttons = document.querySelectorAll('.action-btn:not(#draw-cards-btn):not(#infect-cities-btn)');
  buttons.forEach(button => {
    if (button.dataset.disabledReason) {
      return;
    }

    button.classList.remove('disabled');
    button.disabled = false;
  });
}

export function enableSpecificButtons(buttonIds) {
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

function updateBuildButtonState(gameState, currentPlayer) {
  const buildBtn = document.getElementById('build-btn');
  if (!buildBtn) {
    return;
  }

  const currentLocation = currentPlayer.location;
  const hasCityCard = currentPlayer.hand.some(card => {
    if (typeof card === 'string') {
      return card === currentLocation;
    }

    return card.type === 'city' && card.name === currentLocation;
  });
  const isOperationsExpert = currentPlayer.role === 'operations_expert';
  const researchStations = gameState.researchStations;
  const hasStation = researchStations?.locations?.includes(currentLocation);
  const stationsAvailable = researchStations?.available;

  if (stationsAvailable <= 0) {
    disableButtonWithReason(buildBtn, 'Maximum number of research stations reached.');
  } else if (hasStation) {
    disableButtonWithReason(buildBtn, `${currentLocation} already has a research station.`);
  } else if (!hasCityCard && !isOperationsExpert) {
    disableButtonWithReason(buildBtn, `You need the ${currentLocation} city card to build a research station here.`);
  } else {
    enableButton(buildBtn);
  }
}

function disableButtonWithReason(button, reason) {
  button.classList.add('disabled');
  button.disabled = true;
  button.title = reason;
  button.dataset.disabledReason = reason;
}

function enableButton(button) {
  button.classList.remove('disabled');
  button.disabled = false;
  button.removeAttribute('title');
  delete button.dataset.disabledReason;
}
