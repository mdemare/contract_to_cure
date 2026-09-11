// Ordinary player actions that are independent of map destination selection
// and event-card workflows.
import {
  getCurrentGameState,
  getCurrentLocation,
  getCurrentPlayer
} from './game_state.js';
import { showGeneralCardSelectionModal } from './select_cards.js';
import {
  getCityColor,
  processAPIRequest,
  showErrorMessage,
  showInvalidActionMessage
} from './player_action_utils.js';

export function initBuildStation() {
  const buildButton = document.getElementById('build-btn');
  if (buildButton) {
    buildButton.addEventListener('click', handleBuildStationClick);
  }
}

async function handleBuildStationClick() {
  const gameState = getCurrentGameState();
  const currentPlayer = getCurrentPlayer();
  const currentLocation = currentPlayer.location;
  const hasStation = gameState.researchStations?.locations?.includes(currentLocation);

  if (gameState.researchStations?.available <= 0) {
    showInvalidActionMessage('Maximum number of research stations reached.');
    return;
  }

  if (hasStation) {
    showInvalidActionMessage(`${currentLocation} already has a research station.`);
    return;
  }

  const hasCityCard = currentPlayer.hand.some(card => card.name == currentLocation);
  if (!hasCityCard && currentPlayer.role !== 'operations_expert') {
    showInvalidActionMessage(`You need the ${currentLocation} city card to build a research station here.`);
    return;
  }

  await buildResearchStation();
}

async function buildResearchStation() {
  try {
    await processAPIRequest(
      '/build_research_station',
      {},
      'Built a research station',
      'Failed to build research station'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

export async function cureDisease() {
  const gameState = getCurrentGameState();
  const currentPlayer = getCurrentPlayer();
  const cardsByColor = { blue: [], yellow: [], black: [], red: [] };

  currentPlayer.hand.forEach(card => {
    if (card.type === 'city') {
      cardsByColor[card.color].push(card);
    }
  });

  const atResearchStation = gameState.researchStations?.locations?.includes(currentPlayer.location);
  if (!atResearchStation) {
    showInvalidActionMessage('You must be at a research station to discover a cure');
    return;
  }

  const cardsNeeded = currentPlayer.role === 'scientist' ? 4 : 5;
  let selectedColor = null;
  let colorCards = null;

  for (const [color, cards] of Object.entries(cardsByColor)) {
    if (!gameState.diseaseCubes[color].cured && cards.length >= cardsNeeded) {
      selectedColor = color;
      colorCards = cards;
      break;
    }
  }

  if (!selectedColor || !colorCards) {
    showInvalidActionMessage(`You need ${cardsNeeded} cards of the same color to discover a cure`);
    return;
  }

  const cureWithCards = cards => {
    processAPIRequest(
      '/cure_disease',
      { color: selectedColor, card_names: cards.map(card => card.name) },
      `Discovered a cure for ${selectedColor} disease!`,
      'Failed to discover cure'
    );
  };

  if (colorCards.length === cardsNeeded) {
    cureWithCards(colorCards);
    return;
  }

  showGeneralCardSelectionModal(
    cardsNeeded,
    colorCards,
    selectedIndices => {
      const selectedCards = selectedIndices.map(arrayIndex => colorCards[arrayIndex]);
      cureWithCards(selectedCards);
    },
    { customTitle: `Select ${cardsNeeded} ${selectedColor} cards to cure the disease`, useArrayIndex: true }
  );
}

export async function pass() {
  try {
    await processAPIRequest('/pass', {}, 'Passed for the rest of the turn', 'Pass failed');
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

export async function treatDisease() {
  try {
    const cityName = getCurrentLocation();
    const diseaseColor = getCityColor(cityName);

    await processAPIRequest(
      '/treat',
      {},
      `Treated ${diseaseColor} disease in ${cityName}`,
      'Treatment failed'
    );
  } catch (error) {
    showErrorMessage(error.message);
  }
}

export async function executeShareKnowledge(cityName, givingPlayerIndex, receivingPlayerIndex) {
  try {
    await processAPIRequest(
      '/share_knowledge',
      {
        city_name: cityName,
        giving_player_index: givingPlayerIndex,
        receiving_player_index: receivingPlayerIndex
      },
      `Share cards in ${cityName}`,
      'Failed to share cards'
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}
