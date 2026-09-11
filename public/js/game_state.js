// game_state.js
import { updateAuthUI } from './auth.js';
import { promptHandLimit } from './hand_limit_prompt.js';

export { getCurrentMode, resetMode, toggleMode } from './action_mode.js';

// Global variable to store the current game state
let currentGameState = null;
export let CITIES = null;
let pendingHandLimitPromptKey = null;
let pendingHandLimitPromptActive = false;

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

function pendingHandLimitKey(gameState, pendingHandLimit) {
  const player = gameState.players?.[pendingHandLimit.player_index];
  const handSize = player?.hand?.length ?? 'unknown';
  return [
    pendingHandLimit.player_index,
    pendingHandLimit.discard_count,
    pendingHandLimit.return_phase,
    handSize
  ].join(':');
}

export async function promptPendingHandLimitIfNeeded(gameState = currentGameState) {
  const pendingHandLimit = gameState?.gameStatus?.pending_hand_limit;
  if (!pendingHandLimit || gameState.gameStatus.phase !== 'pending_discard') {
    pendingHandLimitPromptKey = null;
    return;
  }

  const promptKey = pendingHandLimitKey(gameState, pendingHandLimit);
  if (pendingHandLimitPromptActive || pendingHandLimitPromptKey === promptKey) {
    return;
  }

  pendingHandLimitPromptKey = promptKey;
  pendingHandLimitPromptActive = true;

  try {
    await promptHandLimit(
      pendingHandLimit.player_index,
      pendingHandLimit.discard_count
    );
  } finally {
    pendingHandLimitPromptActive = false;
  }
}

// Then update the loadGameState function to add game over check
export async function loadGameState(providedGameState = null, { promptPendingHandLimit = true } = {}) {
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
    
    // Update authentication UI
    if (gameState.current_user) {
      updateAuthUI(gameState.current_user);
    } else {
      updateAuthUI(null);
    }

    document.dispatchEvent(new CustomEvent('gameStateLoaded', {
      detail: { gameState }
    }));

    if (promptPendingHandLimit) {
      promptPendingHandLimitIfNeeded(gameState).catch(error => {
        console.error('Error prompting pending hand-limit discard:', error);
      });
    }

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
