import { loadCities, prepareMapForRendering, renderPandemicCities } from './map.js';
import { initScrolling } from './scrolling.js';
import { loadGameState, startGameStateRefresh } from './game_state.js';
import { initActionButtons } from './action_buttons.js';

// Function to zoom the map
function zoomMap(factor) {
  const mapInner = document.querySelector('.map-inner');
  if (!mapInner) return;

  // Get the current transform values
  const transform = mapInner.style.transform;
  const translateMatch = transform.match(/translate\((-?\d+\.?\d*)px/);
  const scaleMatch = transform.match(/scale\((\d+\.?\d*)\)/);

  const translateX = translateMatch ? parseFloat(translateMatch[1]) : -1300;
  const translateY = 0; // Y is fixed at 0 for horizontal scrolling
  const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  const newScale = currentScale * factor;

  // Limit scale to reasonable bounds
  if (newScale >= 0.5 && newScale <= 2) {
    mapInner.style.transform = `translate(${translateX}px, 0px) scale(${newScale})`;
  }
}

// Function to reset map view
function resetMapView() {
  const mapInner = document.querySelector('.map-inner');
  if (!mapInner) return;

  // Reset to center position and scale 1
  mapInner.style.transform = 'translate(-1300px) scale(1)';
}

// Function to update game status panel
function updateGameStatus(status) {
  document.getElementById('turn-counter').textContent = status.currentTurn;
  document.getElementById('outbreak-counter').textContent = status.outbreaks;

  // Update cure status
  const cureElements = {
    blue: document.getElementById('blue-cure'),
    yellow: document.getElementById('yellow-cure'),
    black: document.getElementById('black-cure'),
    red: document.getElementById('red-cure')
  };

  for (const [color, cured] of Object.entries(status.cures)) {
    const element = cureElements[color];
    if (element) {
      element.classList.toggle('cured', cured);
      element.textContent = cured ? 'CURED' : 'Not Cured';
    }
  }

  // Update card counts
  document.getElementById('player-cards').textContent = status.playerDeck;
  document.getElementById('infection-cards').textContent = status.infectionDeck;
}

// Initialize the pandemic map
async function initializePandemicMap() {
  // Define path to JSON file
  const jsonUrl = 'cities.json';

  try {
    // Load cities data
    const cities = await loadCities(jsonUrl);

    if (cities) {
      // Prepare the map data for rendering
      const renderableMap = prepareMapForRendering(cities);

      // Render the cities
      renderPandemicCities(renderableMap);

      // Initialize the scrolling functionality
      initScrolling();

      // Setup zoom controls
      document.getElementById('zoom-in').addEventListener('click', function() {
        zoomMap(1.1);
      });

      document.getElementById('zoom-out').addEventListener('click', function() {
        zoomMap(0.9);
      });

      document.getElementById('reset-view').addEventListener('click', function() {
        resetMapView();
      });

      // Load the game state from the server
      await loadGameState();

      // Initialize action buttons
      initActionButtons();

      // Start periodic refresh of game state (every 1000 seconds)
      startGameStateRefresh(1000000);
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
