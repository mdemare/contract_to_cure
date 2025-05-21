// action_buttons.js - updated with retrieve card functionality and draw cards button
import { getCurrentGameState } from './game_state.js';
import { treatDisease, pass, cureDisease, setSelectedPlayerIndex } from './player_actions.js';
import { initShareKnowledge, updateShareKnowledgeButtonState } from './share_knowledge.js';
import { handleAirliftPlayerSelected, initActionCardsButton, updateActionCardsButtonState } from './action_cards.js';
import { hidePlayerSelectionPanel, isDispatcher, showPlayerSelectionPanel } from './player_selection.js';
import { updatePlayerHand } from './player_hand.js';
import { initRetrieveCard, updateRetrieveButtonState } from './retrieve_card.js';
import { processAPIRequest, showSuccessMessage, showErrorMessage } from './player_action_utils.js';
import { continueAnimationAfterInfect } from './end_turn_events.js';

// Game mode state to track which action is currently selected
let currentMode = null;

document.addEventListener('playerSelectedForMove', (event) => {
  if (currentMode !== 'airlift') {
    toggleMode('moveSelectedPlayer');
    setSelectedPlayerIndex(event.detail.playerIndex);
  } else {
    // Handle airlift player selection
    handleAirliftPlayerSelected();
  }
});

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
  // Build button is handled by player_actions.js
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

  console.log(`Set mode to ${mode}`)
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

  // Also reset selected player when mode is reset
  hidePlayerSelectionPanel();

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

    // Handle Dispatcher move mode - show player selection
    if (currentMode === 'move' && isDispatcher()) {
      showPlayerSelectionPanel();
    } else {
      hidePlayerSelectionPanel();
    }
  } else {
    hidePlayerSelectionPanel();
  }
}

// Update button states based on game state
export function updateButtonStates() {
  const gameState = getCurrentGameState();

  if (!gameState) return;

  // Determine which actions are available based on game state
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];
  const actionsRemaining = gameState.gameStatus.actions_remaining;

  if (!currentPlayer) return;

  // Check for no actions remaining, show draw cards button and hide action buttons
  const drawCardsBtn = document.getElementById('draw-cards-btn');
  const infectCitiesBtn = document.getElementById('infect-cities-btn');
  const actionButtonsList = document.querySelectorAll('.action-btn:not(#draw-cards-btn):not(#infect-cities-btn)');

  // Hide infect cities button by default - it will be shown only when needed
  if (infectCitiesBtn) {
    infectCitiesBtn.style.display = 'none';
  }

  if (actionsRemaining <= 0) {
    // Hide all other action buttons
    actionButtonsList.forEach(button => {
      button.style.display = 'none';
    });

    // Show draw cards button
    if (drawCardsBtn) {
      drawCardsBtn.style.display = 'flex';
    }
  } else {
    // Show action buttons
    actionButtonsList.forEach(button => {
      button.style.display = 'flex';
    });

    // Hide draw cards button
    if (drawCardsBtn) {
      drawCardsBtn.style.display = 'none';
    }
  }

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
    // First hide the infect cities button
    const infectCitiesBtn = document.getElementById('infect-cities-btn');
    if (infectCitiesBtn) {
      infectCitiesBtn.style.display = 'none';
    }

    // Process the API request with custom handling for animation continuation
    const response = await fetch('/infect_cities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (response.ok) {
      const result = await response.json();

      if (result.status === 'success') {
        // Continue animations with new events
        await continueAnimationAfterInfect(result.end_turn_events);

        // Update game state
        if (result.game_state) {
          const gameStateModule = await import('./game_state.js');
          await gameStateModule.loadGameState(result.game_state);
        } else {
          const gameStateModule = await import('./game_state.js');
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

// Get the current action mode
export function getCurrentMode() {
  return currentMode;
}
