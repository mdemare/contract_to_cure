// events.js
import { prepareMapForRendering, renderPandemicCities } from './map.js';
import { initScrolling } from './scrolling.js';
import { loadCities, loadGameState, CITIES } from './game_state.js';
import { initActionButtons } from './action_buttons.js';
import { initMoveActions } from './player_actions.js';
import { initializeCurrentPlayer } from './current_player.js';
import { initShareKnowledge } from './share_knowledge.js';
import { initGameOver } from './game_over.js';

// Initialize the pandemic map
async function initializePandemicMap() {
  try {
    console.log('Initializing Pandemic game...');

    // First load cities data
    await loadCities();

    if (CITIES) {
      // Prepare the map data for rendering
      const renderableMap = prepareMapForRendering(CITIES);

      // Render the cities
      renderPandemicCities(renderableMap);

      // Initialize the scrolling functionality
      initScrolling();

      initGameOver();

      // Load the game state from the server
      await loadGameState();

      // Initialize current player display
      initializeCurrentPlayer();

      // Initialize action buttons
      initActionButtons();

      // Initialize move actions (includes build station functionality)
      initMoveActions();

      // Initialize share knowledge functionality
      // (This is actually already called from within initActionButtons,
      // but we include it here for clarity and in case that changes in the future)
      initShareKnowledge();

      console.log('Game initialization complete.');
    }
  } catch (error) {
    console.error('Error initializing map:', error);
    document.querySelector('.map-container').innerHTML =
      `<div class="error-message">Failed to initialize map: ${error.message}</div>`;
  }
}

// Setup DOM event listeners when the document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the map
  initializePandemicMap();
});
