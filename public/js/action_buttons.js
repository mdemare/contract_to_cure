// action_buttons.js
import { getCurrentGameState } from './game_state.js';
import { treatDisease, pass, cureDisease, setSelectedPlayerIndex } from './player_actions.js';
import { initShareKnowledge, updateShareKnowledgeButtonState } from './share_knowledge.js';
import { initActionCardsButton, updateActionCardsButtonState } from './action_cards.js';
import { hidePlayerSelectionPanel, isDispatcher, showPlayerSelectionPanel } from './player_selection.js';
import { updatePlayerHand } from './player_hand.js';

// Game mode state to track which action is currently selected
let currentMode = null;
// This could go in action_buttons.js or another initialization file
document.addEventListener('playerSelectedForMove', (event) => {
  toggleMode('moveSelectedPlayer');
  setSelectedPlayerIndex(event.detail.playerIndex);
});

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

  passBtn.addEventListener('click', handlePassAction);

  // Create and add Action Cards button if not already present
  initActionCardsButton();

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
