// action_buttons.js
import { getCurrentGameState } from './game_state.js';

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
  moveBtn.addEventListener('click', handleMoveAction);
  treatBtn.addEventListener('click', handleTreatAction);
  cureBtn.addEventListener('click', handleCureAction);
  tradeBtn.addEventListener('click', handleTradeAction);
  buildBtn.addEventListener('click', handleBuildAction);
  skipBtn.addEventListener('click', handleSkipAction);

  // Update button states based on current game state
  updateButtonStates();
}

// Update button states based on game state
export function updateButtonStates() {
  const gameState = getCurrentGameState();

  if (!gameState) return;

  // Determine which actions are available based on game state
  // For now, all buttons are enabled
  // This will be expanded when implementing actual game logic
}

// Handler functions for each action
function handleMoveAction() {
  console.log('Move action clicked');
  // Will implement actual move logic later
}

function handleTreatAction() {
  console.log('Treat disease action clicked');
  // Will implement actual treat disease logic later
}

function handleCureAction() {
  console.log('Find cure action clicked');
  // Will implement actual cure logic later
}

function handleTradeAction() {
  console.log('Share knowledge action clicked');
  // Will implement actual share knowledge logic later
}

function handleBuildAction() {
  console.log('Build station action clicked');
  // Will implement actual build station logic later
}

function handleSkipAction() {
  console.log('Skip action clicked');
  // Will implement actual skip action logic later
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

// Export helper functions for use in other modules
export { disableAllButtons, enableAllButtons, enableSpecificButtons };
