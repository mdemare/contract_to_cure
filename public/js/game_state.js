// game_state.js
import { updateGameUI } from './ui.js';
import { showPlayerSelectionPanel, hidePlayerSelectionPanel } from './player_selection.js';
import { setSelectedPlayerIndex } from './player_actions.js';

// Global variable to store the current game state
let currentGameState = null;
// Game mode state to track which action is currently selected
let currentMode = null;
export let CITIES = null;

// Get the current action mode
export function getCurrentMode() {
  return currentMode;
}

document.addEventListener('playerSelectedForMove', (event) => {
  if (currentMode === 'airlift') {
    handleAirliftPlayerSelected();
  } else {
    toggleMode('moveSelectedPlayer');
    setSelectedPlayerIndex(event.detail.playerIndex);
  }
});

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

/**
 * Check if current player is the Dispatcher
 * @returns {boolean} True if current player is the Dispatcher
 */
export function isDispatcher() {
  const gameState = getCurrentGameState();
  if (!gameState || !gameState.players || !gameState.gameStatus) return false;

  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  return currentPlayer && currentPlayer.role &&
         String(currentPlayer.role).toLowerCase() === 'dispatcher';
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

export async function loadCities() {
  const jsonUrl = '/cities.json';

  try {
    // Load cities data
    const response = await fetch(jsonUrl);
    if (!response.ok) {
      throw new Error(`Failed to load cities: ${response.status} ${response.statusText}`);
    }
    // Parse the cities data
    CITIES = await response.json();
  } catch (error) {
    console.error('Error loading cities:', error);
    document.querySelector('.map-container').innerHTML =
      `<div class="error-message">Failed to initialize game state: ${error.message}</div>`;
  }
}

// Then update the loadGameState function to add game over check
export async function loadGameState(providedGameState = null) {
  try {
    let gameState;

    if (providedGameState) {
      // Use the provided game state directly
      gameState = providedGameState;
    } else {
      // Fetch the game state from the server
      const response = await fetch('/game_state.json');

      if (!response.ok) {
        throw new Error(`Failed to load game state: ${response.status} ${response.statusText}`);
      }

      gameState = await response.json();
    }

    currentGameState = gameState;

    // Update the UI with the new game state
    updateGameUI(gameState);

    return gameState;
  } catch (error) {
    console.error('Error loading game state:', error);
    document.querySelector('.map-container').innerHTML =
      `<div class="error-message">Failed to load game state: ${error.message}</div>`;
    return null;
  }
}

// Export the current game state
export function getCurrentGameState() {
  return currentGameState;
}

/**
 * Get the current player object
 * @returns {Object} The current player object
 * @throws {Error} If game state is not loaded or current player cannot be found
 * @description This function is guaranteed to return a valid player object or throw an error
 */
export function getCurrentPlayer() {
  if (!currentGameState || !currentGameState.gameStatus) {
    throw new Error('Game state not loaded or invalid');
  }

  const currentPlayerIndex = currentGameState.gameStatus.currentPlayerIndex;
  const currentPlayer = currentGameState.players.find(player => player.index === currentPlayerIndex);

  if (!currentPlayer) {
    throw new Error('Current player not found');
  }

  return currentPlayer;
}

/**
 * Get the current player's location
 * @returns {string} The city name where the current player is located
 * @throws {Error} If game state is not loaded or current player cannot be found
 * @description This function is guaranteed to return a valid location or throw an error
 */
export function getCurrentLocation() {
  const currentPlayer = getCurrentPlayer();

  if (!currentPlayer.location) {
    throw new Error('Current player location is undefined');
  }

  return currentPlayer.location;
}
