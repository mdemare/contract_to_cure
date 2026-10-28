// game_state.js
import { updateAuthFromResponse } from './auth.js';
import { promptHandLimit } from './hand_limit_prompt.js';
import { checkGameOver } from './game_over.js';

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

  const currentPlayerIndex = gameState.gameStatus.current_player_index;
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

// Servers before cc-492 sent these gameStatus keys in camelCase. A page loaded
// from such a server may still be open during a deploy, and vice versa, so
// copy the old names to the snake_case ones the readers use.
// TODO: remove once every server sends snake_case.
const LEGACY_GAME_STATUS_KEYS = {
  gameOver: 'game_over',
  gameOverReason: 'game_over_reason',
  infectionRate: 'infection_rate',
  infectionRatePosition: 'infection_rate_position',
  currentPlayerIndex: 'current_player_index'
};

export function normalizeGameStatusKeys(gameState) {
  const status = gameState?.gameStatus;
  if (!status) return gameState;
  for (const [legacy, key] of Object.entries(LEGACY_GAME_STATUS_KEYS)) {
    if (legacy in status && !(key in status)) status[key] = status[legacy];
  }
  return gameState;
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

// Callers that still have end-turn events to animate pass showGameOver: false;
// handleEndOfTurnEvents shows the overlay once the animations have played.
export async function loadGameState(providedGameState = null, { promptPendingHandLimit = true, showGameOver = true } = {}) {
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

    normalizeGameStatusKeys(gameState);
    currentGameState = gameState;
    
    updateAuthFromResponse(gameState);

    document.dispatchEvent(new CustomEvent('gameStateLoaded', {
      detail: { gameState }
    }));

    if (promptPendingHandLimit) {
      promptPendingHandLimitIfNeeded(gameState).catch(error => {
        console.error('Error prompting pending hand-limit discard:', error);
      });
    }

    if (showGameOver) {
      checkGameOver(gameState, gameState.gameStatus?.game_over_reason);
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

  const currentPlayerIndex = currentGameState.gameStatus.current_player_index;
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
