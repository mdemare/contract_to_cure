// player_selection.js
// Manages the Dispatcher-specific player selection panel and player button creation/handling.

import { getCurrentGameState, resetMode, getCurrentMode } from './game_state.js';
import { createSimpleElement } from './dom.js';

// Store the selected player index for dispatcher move action
let selectedPlayerIndex = null;

/**
 * Create and show the player selection panel
 */
export function showPlayerSelectionPanel() {
  // Check if panel already exists
  let playerSelectionPanel = document.getElementById('player-selection-panel');
  if (playerSelectionPanel) {
    playerSelectionPanel.style.display = 'flex';
    return;
  }

  // Create the panel
  playerSelectionPanel = createSimpleElement('div', 'player-selection-panel');
  playerSelectionPanel.id = 'player-selection-panel';

  // Add instruction text
  const instructionText = createSimpleElement('div', 'selection-instruction', 'Select player to move');
  playerSelectionPanel.appendChild(instructionText);

  // Create container for player buttons
  const buttonContainer = createSimpleElement('div', 'player-buttons-container');

  // Add player buttons based on game state
  const gameState = getCurrentGameState();
  if (gameState && gameState.players) {
    gameState.players.forEach((player, index) => {
      const playerButton = createPlayerButton(player, index);
      buttonContainer.appendChild(playerButton);
    });
  }

  playerSelectionPanel.appendChild(buttonContainer);

  // Add cancel button
  const cancelButton = createSimpleElement('button', 'cancel-button', '✕');
  cancelButton.addEventListener('click', resetMode);
  playerSelectionPanel.appendChild(cancelButton);

  // Add to the action buttons panel
  const actionButtonsPanel = document.querySelector('.action-buttons');
  actionButtonsPanel.appendChild(playerSelectionPanel);
}

/**
 * Create a player button for selection
 * @param {Object} player - The player object
 * @param {number} playerIndex - The index of the player
 * @returns {HTMLElement} The player button element
 */
function createPlayerButton(player, playerIndex) {
  if (!player || !player.role) return createSimpleElement('div');

  const playerButton = createSimpleElement('button', 'player-select-btn');

  // Add role class for styling
  const roleName = String(player.role).toLowerCase();
  playerButton.classList.add(roleName.replace(' ', '-'));

  // Add player pawn
  const playerPawn = createSimpleElement('div', ['player-pawn', roleName.replace(' ', '-')]);
  playerButton.appendChild(playerPawn);

  // Add player role text
  const playerRole = createSimpleElement('span', 'player-role', formatRoleText(player.role));
  playerButton.appendChild(playerRole);

  // Add click handler for player selection
  playerButton.addEventListener('click', () => handlePlayerSelection(playerIndex));

  return playerButton;
}

/**
 * Format role text to be more readable
 * @param {string} role - The role name
 * @returns {string} Formatted role name
 */
function formatRoleText(role) {
  if (!role) return 'Player';

  // Convert to string and split by capitals
  const words = String(role)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return words;
}

/**
 * Handle player selection
 * @param {number} playerIndex - The index of the selected player
 */
function handlePlayerSelection(playerIndex) {
  // Store selected player index
  selectedPlayerIndex = playerIndex;

  // Update instruction text
  const instructionText = document.querySelector('.selection-instruction');
  if (instructionText) {
    instructionText.textContent = 'Select destination';
  }

  // Don't hide the panel for airlift mode
  if (getCurrentMode() !== 'airlift') {
    hidePlayerSelectionPanel();
  }

  // Dispatch event to notify that a player has been selected for movement
  const playerSelectedEvent = new CustomEvent('playerSelectedForMove', {
    detail: { playerIndex }
  });
  document.dispatchEvent(playerSelectedEvent);
}

/**
 * Hide the player selection panel
 */
export function hidePlayerSelectionPanel() {
  const playerSelectionPanel = document.getElementById('player-selection-panel');
  if (playerSelectionPanel) {
    playerSelectionPanel.style.display = 'none';

    // Reset selected player
    selectedPlayerIndex = null;

    // Show all action buttons again
    const buttons = document.querySelectorAll('.action-btn');
    buttons.forEach(button => {
      button.style.display = 'flex';
    });
  }
}

/**
 * Get the selected player index
 * @returns {number|null} The index of the selected player
 */
export function getSelectedPlayerIndex() {
  return selectedPlayerIndex;
}

/**
 * Set the current mode to move a selected player
 * Helper function to avoid circular imports
 */
export function setMoveSelectedPlayerMode() {
  // Access directly through window to avoid circular dependency
  window.gameState = window.gameState || {};
  window.gameState.currentMode = 'moveSelectedPlayer';
}
