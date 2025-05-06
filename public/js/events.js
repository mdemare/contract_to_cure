// events.js
import { loadCities, loadGameState } from './game_state.js';
import { initActionButtons } from './action_buttons.js';
import { initMoveActions } from './player_actions.js';
import { initializeCurrentPlayer } from './current_player.js';

// Initialize the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing Pandemic game...');

  // First load cities data
  await loadCities();

  // Then load initial game state
  await loadGameState();

  // Initialize current player display
  initializeCurrentPlayer();

  // Initialize action buttons
  initActionButtons();

  // Initialize move actions (includes build station functionality)
  initMoveActions();

  console.log('Game initialization complete.');
});
