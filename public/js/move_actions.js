// move_actions.js
import { getCurrentGameState, loadGameState } from './game_state.js';
import { getCurrentMode } from './action_buttons.js';

// Map click handler - initialize city click events
export function initMoveActions() {
  console.log('Initializing move actions module...');

  // Initial setup of city click handlers
  console.log('Setting up initial city click handlers');
  setupCityClickHandlers();

  console.log('Adding event listeners for map updates and action modes');

  // Re-attach handlers whenever the map is updated
  document.addEventListener('mapUpdated', () => {
    console.log('Map updated event received - refreshing city click handlers');
    setupCityClickHandlers();
  });

  // Listen for action mode changes
  document.addEventListener('actionModeChanged', (event) => {
    console.log('Action mode changed:', event.detail);
    // If move mode is activated, highlight valid destinations
    if (event.detail.mode === 'move') {
      console.log('Move mode activated - highlighting valid destinations');
      highlightValidDestinations();
    } else {
      // Remove highlights if not in move mode
      console.log('Non-move mode activated - clearing highlights');
      clearDestinationHighlights();
    }
  });

  // Listen for action mode reset
  document.addEventListener('actionModeReset', () => {
    console.log('Action mode reset - clearing highlights');
    // Remove highlights when mode is reset
    clearDestinationHighlights();
  });

  console.log('Move actions initialization complete!');

  // Debug message to help diagnose if code is loaded
  window.moveActionsInitialized = true;
}

// Set up click event handlers for all city elements
function setupCityClickHandlers() {
  const cityElements = document.querySelectorAll('.city');
  console.log(`Setting up click handlers for ${cityElements.length} city elements`);

  if (cityElements.length === 0) {
    console.warn('No city elements found for attaching click handlers!');
  }

  cityElements.forEach((cityElement, index) => {
    // Log first few cities for debugging
    if (index < 5) {
      console.log(`City ${index}:`, cityElement.dataset.cityName, cityElement);
    }

    // Remove existing click handlers to prevent duplicates
    cityElement.removeEventListener('click', handleCityClick);

    // Add new click handler
    cityElement.addEventListener('click', handleCityClick);
  });

  console.log('Click handlers setup complete');
}

// Highlight valid destination cities for the current player
function highlightValidDestinations() {
  const gameState = getCurrentGameState();
  if (!gameState) return;

  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) return;

  // Clear any existing highlights first
  clearDestinationHighlights();

  // Highlight cities the player can move to (all cities with cards in hand)
  currentPlayer.hand.forEach(cardName => {
    // Only highlight city cards, not event cards
    if (!cardName.startsWith('Action:')) {
      highlightCity(cardName, 'valid-destination');
    }
  });
}

// Highlight a specific city with a class
function highlightCity(cityName, className) {
  const cityElements = document.querySelectorAll(`.city[data-city-name="${cityName}"]`);
  cityElements.forEach(element => {
    element.classList.add(className);
  });
}

// Clear all destination highlights
function clearDestinationHighlights() {
  const highlightedCities = document.querySelectorAll('.city.valid-destination');
  highlightedCities.forEach(element => {
    element.classList.remove('valid-destination');
  });
}

// Handle a city click event
async function handleCityClick(event) {
  // Get the clicked city's name
  const cityElement = event.currentTarget;
  const cityName = cityElement.dataset.cityName;

  // Debug log
  console.log('City clicked:', cityName, 'Element:', cityElement);

  // Get the current action mode
  const currentMode = getCurrentMode();

  // Debug log action mode
  console.log('Current action mode:', currentMode);

  // Only process city clicks if in move mode or no mode selected
  // (default behavior will be to move when directly clicking cities)
  if (currentMode && currentMode !== 'move') {
    console.log('Ignoring click - not in move mode');
    return;
  }

  // Get the clicked city's name
  console.log('Processing click for city:', cityName);

  if (!cityName) {
    console.error('City name not found in clicked element');
    return;
  }

  // Get the current game state
  const gameState = getCurrentGameState();
  if (!gameState) {
    console.error('Cannot handle city click: Game state not loaded');
    return;
  }

  // Get the current player
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) {
    console.error('Current player not found in game state');
    return;
  }

  // Debug current player info
  console.log('Current player:', currentPlayerIndex, currentPlayer);
  console.log('Current player location:', currentPlayer.location);
  console.log('Current player hand:', currentPlayer.hand);

  // Check if the clicked city is the current city (for treat disease)
  if (cityName === currentPlayer.location) {
    console.log('Clicked on current location - treating disease');
    await treatDisease(currentPlayerIndex, cityName);
    return;
  }

  // Check if the player has a card for this city (direct flight)
  const canDirectFlight = currentPlayer.hand.includes(cityName);
  console.log('Can direct flight to', cityName, ':', canDirectFlight);

  // Check if the city is adjacent (drive/ferry)
  const isAdjacent = await isCityAdjacent(currentPlayer.location, cityName);
  console.log('Is adjacent city:', isAdjacent);

  if (isAdjacent) {
    console.log('Attempting drive/ferry to adjacent city:', cityName);
    await moveDriveFerry(currentPlayerIndex, cityName);
  } else if (canDirectFlight) {
    console.log('Attempting direct flight to', cityName);
    // Try to move to the city using direct flight
    await moveDirectFlight(currentPlayerIndex, cityName);
  } else {
    console.log('Cannot move - city is not adjacent and player has no city card');
    // If they don't have the card, inform the user
    showInvalidMoveMessage(cityName);
  }
}

// Helper function to check if a city is adjacent to another
async function isCityAdjacent(fromCity, toCity) {
  try {
    // Load cities data to get connections
    const citiesResponse = await fetch('cities.json');
    if (!citiesResponse.ok) {
      console.error('Failed to load cities data');
      return false;
    }

    const citiesData = await citiesResponse.json();

    // Check if the cities exist in the data
    if (!citiesData[fromCity] || !citiesData[toCity]) {
      console.error('City not found in data:', !citiesData[fromCity] ? fromCity : toCity);
      return false;
    }

    // Check if toCity is in the connections array of fromCity
    const connections = citiesData[fromCity].connections;
    return connections.includes(toCity);
  } catch (error) {
    console.error('Error checking adjacent cities:', error);
    return false;
  }
}

// Move to an adjacent city using drive/ferry
async function moveDriveFerry(playerIndex, destination) {
  try {
    console.log('moveDriveFerry called with:', 'playerIndex:', playerIndex, 'destination:', destination);

    // Prepare the request data
    const moveData = {
      player_index: playerIndex,
      destination: destination
    };
    console.log('Request payload:', moveData);

    console.log('Sending API request to /move_drive_ferry...');
    // Make the API call to move_drive_ferry
    const response = await fetch('/move_drive_ferry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(moveData)
    });

    console.log('API response status:', response.status, response.statusText);

    // Parse the response
    const result = await response.json();
    console.log('API response data:', result);

    if (result.status === 'success') {
      console.log('Move successful:', result.message);

      console.log('Refreshing game state...');
      // Refresh the game state
      await loadGameState();
      console.log('Game state refreshed');

      // Dispatch a custom event to notify that a move was made
      console.log('Dispatching playerMoved event');
      const moveEvent = new CustomEvent('playerMoved', {
        detail: {
          playerIndex: playerIndex,
          destination: destination,
          success: true,
          moveType: 'drive_ferry'
        }
      });
      document.dispatchEvent(moveEvent);

      // Show success message
      showSuccessMessage(result.message);
    } else {
      console.error(`Drive/Ferry failed: ${result.message}`);
      console.log('Failed move details:', { playerIndex, destination });
      showErrorMessage(result.message);
    }
  } catch (error) {
    console.error('Error during drive/ferry operation:', error);
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Move to an adjacent city using drive/ferry
async function moveDirectFlight(playerIndex, destination) {
  try {
    console.log('moveDirectFlight called with:', 'playerIndex:', playerIndex, 'destination:', destination);

    // Prepare the request data
    const moveData = {
      player_index: playerIndex,
      destination: destination
    };
    console.log('Request payload:', moveData);

    console.log('Sending API request to /move_drive_ferry...');
    // Make the API call to move_drive_ferry
    const response = await fetch('/move_direct_flight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(moveData)
    });

    console.log('API response status:', response.status, response.statusText);

    // Parse the response
    const result = await response.json();
    console.log('API response data:', result);

    if (result.status === 'success') {
      console.log('Move successful:', result.message);

      console.log('Refreshing game state...');
      // Refresh the game state
      await loadGameState();
      console.log('Game state refreshed');

      // Dispatch a custom event to notify that a move was made
      console.log('Dispatching playerMoved event');
      const moveEvent = new CustomEvent('playerMoved', {
        detail: {
          playerIndex: playerIndex,
          destination: destination,
          success: true,
          moveType: 'direct_flight'
        }
      });
      document.dispatchEvent(moveEvent);

      // Show success message
      showSuccessMessage(result.message);
    } else {
      console.error(`Direct Flight failed: ${result.message}`);
      console.log('Failed move details:', { playerIndex, destination });
      showErrorMessage(result.message);
    }
  } catch (error) {
    console.error('Error during direct flight operation:', error);
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Treat disease at the current location
async function treatDisease(playerIndex, cityName) {
  try {
    console.log('treatDisease called with:', 'playerIndex:', playerIndex, 'cityName:', cityName);

    // Placeholder: In a real implementation, we'd determine the disease color to treat
    // For now, we'll use 'blue' as a default or determine it from the city data
    let diseaseColor = await getCityColor(cityName) || 'blue';

    // Prepare the request data
    const treatData = {
      player_index: playerIndex,
      city: cityName,
      color: diseaseColor
    };
    console.log('Request payload:', treatData);

    console.log('Sending API request to /treat...');
    // Make the API call to treat
    const response = await fetch('/treat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(treatData)
    });

    console.log('API response status:', response.status, response.statusText);

    // Handle API response based on status
    if (response.ok) {
      try {
        // Try to parse JSON
        const result = await response.json();
        console.log('API response data:', result);

        if (result.status === 'success') {
          console.log('Treatment successful:', result.message);

          // Refresh the game state
          console.log('Refreshing game state...');
          await loadGameState();
          console.log('Game state refreshed');

          // Show success message
          showSuccessMessage(result.message || `Treated ${diseaseColor} disease in ${cityName}`);
        } else {
          console.error(`Treatment failed: ${result.message}`);
          showErrorMessage(result.message);
        }
      } catch (parseError) {
        // If JSON parsing fails, handle as success anyway since response was ok
        console.log('No JSON response but status was OK');
        console.log('Refreshing game state...');
        await loadGameState();
        showSuccessMessage(`Treated ${diseaseColor} disease in ${cityName}`);
      }
    } else {
      console.error(`Treatment failed: ${response.status} ${response.statusText}`);
      showErrorMessage(`Treatment failed (${response.status}). The backend might not be implemented yet.`);
    }
  } catch (error) {
    console.error('Error during disease treatment:', error);
    showErrorMessage(`Network error: ${error.message}`);
  }
}

// Helper function to get a city's color
async function getCityColor(cityName) {
  try {
    // Load cities data
    const citiesResponse = await fetch('cities.json');
    if (!citiesResponse.ok) {
      console.error('Failed to load cities data');
      return null;
    }

    const citiesData = await citiesResponse.json();

    // Check if the city exists and get its color
    if (citiesData[cityName] && citiesData[cityName].color) {
      return citiesData[cityName].color;
    }

    console.error('City color not found:', cityName);
    return null;
  } catch (error) {
    console.error('Error getting city color:', error);
    return null;
  }
}

// Display a success message to the user
function showSuccessMessage(message) {
  // For now, just log to console
  console.log(`Move successful: ${message}`);

  // In a real implementation, we'd show a nice UI notification
  // Create a temporary notification
  showNotification(message, 'success');
}

// Display an error message to the user
function showErrorMessage(message) {
  // Log to console
  console.error(`Move failed: ${message}`);

  // Show notification
  showNotification(`Move failed: ${message}`, 'error');
}

// Display invalid move message
function showInvalidMoveMessage(cityName) {
  const message = `Cannot move to ${cityName} - this city is not adjacent to your current location and you don't have this city card for a direct flight`;
  console.log(message);

  // Show notification
  showNotification(message, 'warning');
}

// Helper function to show a temporary notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.classList.add('game-notification', type);
  notification.textContent = message;

  // Append to body
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');

    // Remove from DOM after fade animation
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}
