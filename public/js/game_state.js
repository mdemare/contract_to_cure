// game_state.js
import { renderPandemicCities } from './map.js';
import { updatePlayerHand } from './player_hand.js';
import { updatePlayerPanel } from './player_panel.js';
import { updateCurrentPlayer } from './current_player.js';
import { checkGameOver } from './game_over.js';

// Define color keys for disease tracking
const COLOR_KEYS = ['blue', 'yellow', 'black', 'red'];

// Global variable to store the current game state
let currentGameState = null;
export let CITIES = null;

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

    // Check if the game is over
    checkGameOver(gameState);

    document.dispatchEvent(new CustomEvent('gameStateLoaded', {
      detail: { gameState: gameState }
    }));

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

    // Update actions counter
    if (gameState.gameStatus.actions_remaining !== undefined) {
      document.getElementById('action-counter').textContent = gameState.gameStatus.actions_remaining;
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
    if (gameState.decks && gameState.decks.playerDeck) {
      document.getElementById('player-cards').textContent = gameState.decks.playerDeck;
    }

    // Update infection cards count
    if (gameState.decks && gameState.decks.infectionDeck) {
      document.getElementById('infection-cards').textContent = gameState.decks.infectionDeck;
    }

    updateCureStatus(gameState);
    console.log("updatePlayerPanel")
    updatePlayerPanel(gameState);
    updatePlayerHand(gameState);
    updateCurrentPlayer(gameState);
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
  if(CITIES === undefined) { throw new Error("Cities not loaded")}
  try {
    // Prepare the map data with the current game state
    const updatedMap = prepareMapWithGameState(CITIES, gameState);

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
    updatedMap[cityName].cubes = 0;
  }

  // Add disease cubes
  if (gameState.diseaseCubes) {
    COLOR_KEYS.forEach(color => {
      const diseaseInfo = gameState.diseaseCubes[color];
      if (diseaseInfo && diseaseInfo.onBoard) {
        Object.entries(diseaseInfo.onBoard).forEach(([cityName, cubeCount]) => {
          if (updatedMap[cityName]) {
            updatedMap[cityName].cubes = cubeCount;
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
    let nrPlayers = gameState.players.length;
    let orderedPlayers = gameState.players.map(item => item);
    orderedPlayers.forEach((pl,idx) => { pl.order = (nrPlayers + pl.index - gameState.gameStatus.currentPlayerIndex) % nrPlayers });
    orderedPlayers.sort((a, b) => a.order - b.order).forEach((player, idx) => {
      if (player && player.location) {
        const cityName = player.location;
        if (updatedMap[cityName]) {
          // Use the player's role or index as an identifier
          const pawnIdentifier = String(player.role).toLowerCase();
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
