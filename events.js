// Enable drag scrolling for the map container
function enableDragScroll(container, mapController) {
  let isDown = false;
  let startX;
  let startOffset;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    container.classList.add('grabbing');
    startX = e.pageX - container.offsetLeft;
    startOffset = globalMapOffset;
    e.preventDefault();
  });

  container.addEventListener('mouseleave', () => {
    isDown = false;
    container.classList.remove('grabbing');
  });

  container.addEventListener('mouseup', () => {
    isDown = false;
    container.classList.remove('grabbing');
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walkX = (x - startX); // How far the mouse has moved

    // Update the map offset directly
    const newOffset = startOffset + walkX;
    updateMapOffset(newOffset);
  });
}

// Function to zoom the map
function zoomMap(factor) {
  const mapInner = document.querySelector('.map-inner');
  if (!mapInner) return;

  const currentScale = parseFloat(mapInner.dataset.scale || 1);
  const newScale = currentScale * factor;

  // Limit scale to reasonable bounds
  if (newScale >= 0.5 && newScale <= 2) {
    mapInner.style.transform = `scale(${newScale})`;
    mapInner.dataset.scale = newScale;
  }
}

// Function to reset map view
function resetMapView() {
  const mapInner = document.querySelector('.map-inner');
  if (!mapInner) return;

  mapInner.style.transform = 'scale(1)';
  mapInner.dataset.scale = 1;
  updateMapOffset(200);
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

      // Store map data globally
      pandemicMapData = renderableMap;

      // Render the cities with an initial offset
      renderPandemicCities(renderableMap, globalMapOffset);

      // Make sure drag scrolling is explicitly enabled
      const mapContainer = document.querySelector('.map-container');
      enableDragScroll(mapContainer);

      // Add event listener for scroll control with arrow keys
      document.addEventListener('keydown', function(e) {
        const SCROLL_AMOUNT = 10;
        if (e.key === 'ArrowLeft') {
          updateMapOffset(globalMapOffset + SCROLL_AMOUNT);
        } else if (e.key === 'ArrowRight') {
          updateMapOffset(globalMapOffset - SCROLL_AMOUNT);
        }
      });

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
    }
  } catch (error) {
    console.error('Error initializing map:', error);
    document.querySelector('.map-container').innerHTML =
      `<div class="error-message">Failed to initialize map: ${error.message}</div>`;
  }

  // Update game status panel with sample data
  updateGameStatus({
    currentTurn: 1,
    outbreaks: 0,
    cures: { blue: false, yellow: false, black: false, red: false },
    playerDeck: 35,
    infectionDeck: 42
  });
}

// Setup DOM event listeners when the document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the map
  initializePandemicMap();
});
