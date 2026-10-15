// Executes action-card requests. Selection and modal workflows live in
// action_cards.js and select_cards.js.
import { loadGameState } from './game_state.js';
import { clearActionCardSource, getActionCardSource } from './action_card_state.js';
import {
  GameConflictError,
  handleGameConflict,
  isGameConflict,
  parseRejectionBody,
  processAPIRequest,
  showErrorMessage,
  showSuccessMessage
} from './player_action_utils.js';

export async function actionCardRequest(payload, fallbackErrorMessage) {
  const response = await fetch('/action_card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content')
    },
    body: JSON.stringify(payload)
  });

  if (isGameConflict(response)) {
    await handleGameConflict(response);
    throw new GameConflictError();
  }

  // Error bodies may be HTML (e.g. a 502 page); only a 422 carries a message.
  if (!response.ok) {
    const rejection = await parseRejectionBody(response);
    throw new Error(rejection?.message || fallbackErrorMessage);
  }

  // Every rejection is a 422, so a 200 body is a success.
  return response.json();
}

export async function completeForecast(cardOrder) {
  const request = actionCardRequest(
    { card: 'Forecast', card_order: cardOrder },
    'Failed to apply Forecast card order'
  );
  clearActionCardSource();

  try {
    const data = await request;

    if (data.status === 'success') {
      await loadGameState();
      return true;
    } else {
      showErrorMessage(data.message || 'Failed to apply Forecast card order');
    }
  } catch (error) {
    if (error instanceof GameConflictError) return false;
    console.error('Error applying Forecast card order:', error);
    showErrorMessage(error.message || 'Error applying Forecast card order. Please try again.');
  }
  return false;
}

export async function useResilientPopulation(cityName) {
  try {
    if (!getActionCardSource()) {
      showErrorMessage('Error: Resilient Population card source information is missing');
      return;
    }

    if (!(await useActionCard('Resilient Population', { city: cityName }))) return;
    showSuccessMessage(`Removed ${cityName} from the infection discard pile`);
  } catch (error) {
    showErrorMessage(`Error using Resilient Population: ${error.message}`);
  }
}

export async function useAirlift(cityName, playerIndex) {
  try {
    if (!getActionCardSource()) {
      showErrorMessage('Error: Airlift card source information is missing');
      return;
    }

    if (!(await useActionCard('Airlift', { city: cityName, player_index: playerIndex }))) return;
    showSuccessMessage(`Airlift to ${cityName} performed`);
  } catch (error) {
    showErrorMessage(`Error using Airlift: ${error.message}`);
  }
}

export async function useQuietNight() {
  try {
    if (!(await useActionCard('One Quiet Night'))) return;
    showSuccessMessage('Tonight everything is quiet');
  } catch (error) {
    showErrorMessage(`Error using One Quiet Night: ${error.message}`);
  }
}

export async function useGovernmentGrant(cityName) {
  try {
    if (!getActionCardSource()) {
      showErrorMessage('Error: Government Grant card source information is missing');
      return;
    }

    if (!(await useActionCard('Government Grant', { city: cityName }))) return;
    showSuccessMessage(`Built a research station in ${cityName} using Government Grant`);

    document.getElementById('action-notification')?.remove();
  } catch (error) {
    showErrorMessage(`Error using Government Grant: ${error.message}`);
  }
}

// Resolves true only when the server applied the card.
export async function useActionCard(cardName, actionCardData = {}) {
  try {
    return await processAPIRequest(
      '/action_card',
      { ...actionCardData, card: cardName },
      `Used ${cardName}`,
      'Failed to use action card'
    );
  } catch (error) {
    console.error('Error using action card:', error);
    return false;
  }
}
