// game_state.js
import { renderPandemicCities } from './map.js';
import { updatePlayerPanel } from './player_panel.js';
import { updateCurrentPlayer } from './current_player.js';
import { CITIES } from './game_state.js';
import { updateButtonStates } from './action_buttons.js';

// Define color keys for disease tracking
const COLOR_KEYS = ['blue', 'yellow', 'black', 'red'];

/**
 * Update player hand display
 * @param {Object} gameState - The current game state
 */
export function updatePlayerHand(gameState) {
  const handContainer = document.querySelector('.player-hand');
  if (!handContainer) return;

  // Clear existing cards
  handContainer.innerHTML = '';

  // Get current player
  if (!gameState || !gameState.gameStatus) return;

  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer || !currentPlayer.hand) return;

  // Create card elements
  currentPlayer.hand.forEach((cardObj, index) => {
    const card = document.createElement('div');
    card.classList.add('hand-card');
    const cardName = cardObj.name

    // Determine card type and color
    if (cardObj.type === 'action') {
      card.classList.add('action');
      card.title = 'Action Card';
    } else if (cardObj.type === 'event') {
      card.classList.add('epidemic');
      card.title = 'Epidemic!';
    } else {
      // City card - find the color
      card.classList.add('city-card');
      card.classList.add(cardObj.color);
      card.title = `City: ${cardName}`;
    }

    // Create card name element
    const cardNameElement = document.createElement('span');
    cardNameElement.classList.add('card-name');
    cardNameElement.textContent = cardName;
    card.appendChild(cardNameElement);

    // Add data attribute for card index
    card.dataset.cardIndex = index;

    handContainer.appendChild(card);
  });
}

// Update the game UI with the new state
export function updateGameUI(gameState) {
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
    updatePlayerPanel(gameState);
    updatePlayerHand(gameState);
    updateButtonStates()
    updateCurrentPlayer(gameState);
    updateMapState(gameState);
  } catch (error) {
    console.error('Error updating game UI:', error);
  }
}

// Update the cure status UI
export function updateCureStatus(gameState) {
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
export async function updateMapState(gameState) {
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
