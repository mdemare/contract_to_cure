// game_state.js
import { renderPandemicCities } from './map.js';

// Define color keys for disease tracking
const COLOR_KEYS = ['blue', 'yellow', 'black', 'red'];

// Global variable to store the current game state
let currentGameState = null;

// Load the game state from the server
export async function loadGameState() {
  try {
    const response = await fetch('/game_state.json');

    if (!response.ok) {
      throw new Error(`Failed to load game state: ${response.status} ${response.statusText}`);
    }

    const gameState = await response.json();
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

// Update the game UI with the new state
function updateGameUI(gameState) {
  try {
    // Check if we have valid game state data
    if (!gameState || !gameState.gameStatus) {
      console.error('Invalid game state data:', gameState);
      return;
    }

    // Update turn counter
    if (gameState.gameStatus.turn !== undefined) {
      document.getElementById('turn-counter').textContent = gameState.gameStatus.turn;
    }

    // Update outbreak counter
    if (gameState.gameStatus.outbreaks !== undefined) {
      document.getElementById('outbreak-counter').textContent = gameState.gameStatus.outbreaks;
    }

    // Update player cards count
    if (gameState.decks && gameState.decks.playerDeck && Array.isArray(gameState.decks.playerDeck.draw)) {
      document.getElementById('player-cards').textContent = gameState.decks.playerDeck.draw.length;
    }

    // Update infection cards count
    if (gameState.decks && gameState.decks.infectionDeck && Array.isArray(gameState.decks.infectionDeck.draw)) {
      document.getElementById('infection-cards').textContent = gameState.decks.infectionDeck.draw.length;
    }

    // Update cure status
    updateCureStatus(gameState);

    // Update player hand
    updatePlayerHand(gameState);

    // Update the map with the new state
    updateMapState(gameState);
  } catch (error) {
    console.error('Error updating game UI:', error);
  }
}

// Update the cure status UI
function updateCureStatus(gameState) {
  // Update cure status for each disease color
  COLOR_KEYS.forEach(color => {
    const cureElement = document.getElementById(`${color}-cure`);

    // Check if the color exists in the game state
    if (gameState.diseaseCubes && gameState.diseaseCubes[color]) {
      const diseaseInfo = gameState.diseaseCubes[color];

      if (cureElement) {
        if (diseaseInfo.cured) {
          cureElement.textContent = diseaseInfo.eradicated ? 'ERADICATED' : 'CURED';
          cureElement.classList.add('cured');
        } else {
          cureElement.textContent = 'Not Cured';
          cureElement.classList.remove('cured');
        }
      }
    }
  });
}

// Update the map with disease cubes, research stations, and player pawns
async function updateMapState(gameState) {
  // First load the cities data
  const jsonUrl = 'cities.json';

  try {
    // Fetch the cities data
    const response = await fetch(jsonUrl);

    if (!response.ok) {
      throw new Error(`Failed to load cities: ${response.status} ${response.statusText}`);
    }

    // Parse the cities data
    const citiesData = await response.json();

    // Prepare the map data with the current game state
    const updatedMap = prepareMapWithGameState(citiesData, gameState);

    // Render the updated map
    renderPandemicCities(updatedMap);

  } catch (error) {
    console.error('Error updating map state:', error);
  }
}

// Prepare the map data with the current game state
function prepareMapWithGameState(citiesData, gameState) {
  const updatedMap = {};

  // First, initialize all cities with their basic data
  for (const [cityName, cityData] of Object.entries(citiesData)) {
    updatedMap[cityName] = {
      ...cityData,
      cubes: {},          // Will be populated with disease cubes
      pawns: [],          // Will be populated with player pawns
      hasStation: false   // Will be set if the city has a research station
    };

    // Initialize empty cubes for all colors
    COLOR_KEYS.forEach(color => {
      updatedMap[cityName].cubes[color] = 0;
    });
  }

  // Add disease cubes
  if (gameState.diseaseCubes) {
    COLOR_KEYS.forEach(color => {
      const diseaseInfo = gameState.diseaseCubes[color];
      if (diseaseInfo && diseaseInfo.onBoard) {
        Object.entries(diseaseInfo.onBoard).forEach(([cityName, cubeCount]) => {
          if (updatedMap[cityName]) {
            updatedMap[cityName].cubes[color] = cubeCount;
          }
        });
      }
    });
  }

  // Add research stations
  if (gameState.researchStations && Array.isArray(gameState.researchStations.locations)) {
    gameState.researchStations.locations.forEach(cityName => {
      if (updatedMap[cityName]) {
        updatedMap[cityName].hasStation = true;
      }
    });
  }

  // Add player pawns
  if (gameState.players && Array.isArray(gameState.players)) {
    gameState.players.forEach((player, index) => {
      if (player && player.location) {
        const cityName = player.location;
        if (updatedMap[cityName]) {
          // Use the player's role or index as an identifier
          const pawnIdentifier = player.role ? String(player.role).toLowerCase() : `player${index}`;
          updatedMap[cityName].pawns.push(pawnIdentifier);
        }
      }
    });
  }

  return updatedMap;
}

// Export the current game state
export function getCurrentGameState() {
  return currentGameState;
}
