// action_buttons.js
import { getCurrentGameState } from './game_state.js';

// Game mode state to track which action is currently selected
let currentMode = null;

// Initialize the action buttons
export function initActionButtons() {
  // Get button elements
  const moveBtn = document.getElementById('move-btn');
  const treatBtn = document.getElementById('treat-btn');
  const cureBtn = document.getElementById('cure-btn');
  const tradeBtn = document.getElementById('trade-btn');
  const buildBtn = document.getElementById('build-btn');
  const skipBtn = document.getElementById('skip-btn');

  // Add click event listeners
  moveBtn.addEventListener('click', () => toggleMode('move'));
  treatBtn.addEventListener('click', () => toggleMode('treat'));
  cureBtn.addEventListener('click', () => toggleMode('cure'));
  tradeBtn.addEventListener('click', () => toggleMode('trade'));
  buildBtn.addEventListener('click', () => toggleMode('build'));
  skipBtn.addEventListener('click', handleSkipAction);

  // Update button states based on current game state
  updateButtonStates();

  // Listen for player moved events to reset the mode
  document.addEventListener('playerMoved', () => {
    resetMode();
    updateButtonStates();
  });
}

// Toggle action mode when a button is clicked
function toggleMode(mode) {
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

  // Dispatch event to notify that the mode has changed
  const modeChangedEvent = new CustomEvent('actionModeChanged', {
    detail: { mode: mode }
  });
  document.dispatchEvent(modeChangedEvent);
}

// Reset the current mode
function resetMode() {
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

  // In a real implementation, we'd check the player's available actions
  // For now, all buttons are enabled
  enableAllButtons();
}

// Handler for skip action
function handleSkipAction() {
  console.log('Skip action clicked');
  // Reset the current mode
  resetMode();

  // In a full implementation, we'd send a skip action to the server
  // and then update the game state
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
