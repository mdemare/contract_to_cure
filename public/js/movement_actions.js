// Handles city clicks and movement-specific follow-up selections.
import { initRouteHighlights } from './route_highlights.js';
import { getCurrentMode, resetMode, toggleMode } from './action_mode.js';
import { completeAirlift } from './action_cards.js';
import { useGovernmentGrant } from './action_card_requests.js';
import {
  getCurrentGameState,
  getCurrentPlayer,
  isDispatcher
} from './game_state.js';
import { initBuildStation, treatDisease } from './ordinary_player_actions.js';
import { showGeneralCardSelectionModal, showHandSelectionModal } from './select_cards.js';
import {
  processAPIRequest,
  showErrorMessage,
  showInvalidActionMessage
} from './player_action_utils.js';

let selectedPlayerIndex = null;

export function setSelectedPlayerIndex(index) {
  selectedPlayerIndex = index;
  document.dispatchEvent(new CustomEvent('movePawnChanged', { detail: { playerIndex: index } }));
}

export function initMoveActions() {
  initRouteHighlights();
  setupCityClickHandlers();
  document.addEventListener('mapUpdated', setupCityClickHandlers);
  initBuildStation();
}

function setupCityClickHandlers() {
  document.querySelectorAll('.city').forEach(cityElement => {
    cityElement.removeEventListener('click', handleCityClick);
    cityElement.addEventListener('click', handleCityClick);
  });
}

async function handleCityClick(event) {
  const cityName = event.currentTarget.dataset.cityName;
  if (!cityName) return;

  const gameState = getCurrentGameState();
  if (gameState.gameStatus.actions_remaining === 0 &&
      ['draw_cards', 'infect_cities'].includes(gameState.gameStatus.phase)) {
    return;
  }

  const currentPlayer = getCurrentPlayer();
  const mode = getCurrentMode();

  if (gameState.gameStatus.phase === 'pending_discard' &&
      mode !== 'governmentGrant' && mode !== 'airlift') {
    return;
  }

  if (mode === 'move' && isDispatcher()) return;

  switch (mode) {
    case 'governmentGrant':
      resetMode();
      if (gameState.researchStations?.locations?.includes(cityName)) {
        showInvalidActionMessage(`${cityName} already has a research station.`);
      } else {
        await useGovernmentGrant(cityName);
      }
      return;
    case 'airlift':
      completeAirlift(cityName);
      return;
    case 'moveSelectedPlayer':
      if (!isDispatcher()) {
        resetMode();
        showInvalidActionMessage("Only the Dispatcher can move another player's pawn.");
        return;
      }

      if (selectedPlayerIndex !== null) {
        const pawnIndex = selectedPlayerIndex;
        resetMode();
        await movePlayer(pawnIndex, cityName);
      }
      return;
    default:
      if (cityName === currentPlayer.location) {
        await treatDisease();
      } else {
        await movePlayer(currentPlayer.index, cityName);
      }
  }
}

async function movePlayer(playerIndex, destination) {
  try {
    await processAPIRequest(
      '/move',
      { player_index: playerIndex, destination },
      `Moved to ${destination}`,
      'move failed',
      { playerIndex, destination }
    );
  } catch (error) {
    showErrorMessage(`Network error: ${error.message}`);
  }
}

export async function handleOperationsExpertMove(playerIndex, destination) {
  const currentPlayer = getCurrentGameState().players[playerIndex];
  const cityCards = currentPlayer.hand.filter(card => card.type === 'city');

  showGeneralCardSelectionModal(1, cityCards, async selectedIndices => {
    const selectedCard = cityCards.find(card => card.index === selectedIndices[0]);
    if (!selectedCard) {
      showErrorMessage('Selected card not found');
      return;
    }

    await processAPIRequest(
      '/move',
      {
        player_index: playerIndex,
        destination,
        card_name: selectedCard.name
      },
      `Moved to ${destination}`,
      'Move failed',
      { playerIndex, destination }
    );
  }, {});
}

export async function handleFlightChoice(playerIndex, destination) {
  const currentPlayer = getCurrentPlayer();
  const source = getCurrentGameState().players[playerIndex].location;
  const flightCards = currentPlayer.hand.filter(card =>
    card.name === source || card.name === destination
  );

  showHandSelectionModal(
    1,
    flightCards.map(card => card.index),
    async selectedIndices => {
      const selectedCard = currentPlayer.hand.find(card => card.index === selectedIndices[0]);
      if (!selectedCard) {
        showErrorMessage('Selected card not found');
        return;
      }

      await processAPIRequest(
        '/move',
        {
          player_index: playerIndex,
          destination,
          card_name: selectedCard.name
        },
        `Moved to ${destination}`,
        'Move failed',
        { playerIndex, destination, moveType: 'flight' }
      );
    },
    { customTitle: 'Choose a card to discard for flight' }
  );
}

document.addEventListener('playerSelectedForMove', event => {
  if (getCurrentMode() === 'airlift') return;

  toggleMode('moveSelectedPlayer');
  setSelectedPlayerIndex(event.detail.playerIndex);
});

document.addEventListener('actionModeChanged', event => {
  if (event.detail.mode !== 'moveSelectedPlayer') selectedPlayerIndex = null;
});

document.addEventListener('movementCardRequired', event => {
  resetMode();
  const { movementType, playerIndex, destination } = event.detail;
  if (movementType === 'operations_expert_special') {
    handleOperationsExpertMove(playerIndex, destination);
  } else if (movementType === 'flight_choice') {
    handleFlightChoice(playerIndex, destination);
  }
});
