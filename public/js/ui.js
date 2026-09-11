// game_state.js
import { prepareMapWithGameState, renderPandemicCities } from './map.js';
import { updatePlayerPanel } from './player_panel.js';
import { updateCurrentPlayer } from './current_player.js';
import { CITIES } from './game_state.js';
import { updateButtonStates } from './action_buttons.js';
import { updateGameStatus } from './game_status.js';
import { decorateGameCard } from './card_visuals.js';

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

  const handCount = document.getElementById('active-hand-count');
  if (handCount) handCount.textContent = '0 cards';

  // Get current player
  if (!gameState || !gameState.gameStatus) return;

  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer || !currentPlayer.hand) return;

  const cardCount = currentPlayer.hand.length;
  if (handCount) handCount.textContent = `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`;
  handContainer.setAttribute('aria-label', `Current player's hand, ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`);

  if (cardCount === 0) {
    const emptyHand = document.createElement('span');
    emptyHand.classList.add('player-hand-empty');
    emptyHand.textContent = 'No cards in hand';
    handContainer.appendChild(emptyHand);
    return;
  }

  // Create card elements
  currentPlayer.hand.forEach((cardObj, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.classList.add('hand-card');
    card.setAttribute('aria-pressed', 'false');

    // Determine card type and color
    if (cardObj.type === 'action') {
      card.classList.add('action');
    } else if (cardObj.type === 'epidemic') {
      card.classList.add('epidemic');
    } else {
      card.classList.add('city-card');
      if (cardObj.color) card.classList.add(cardObj.color);
    }

    const presentation = decorateGameCard(card, cardObj);
    card.setAttribute(
      'aria-label',
      `${presentation.name}, ${presentation.typeLabel}, ${presentation.familyLabel}. Press to keep card expanded.`
    );

    // Add data attribute for card index
    card.dataset.cardIndex = index;

    card.addEventListener('click', () => {
      const willExpand = !card.classList.contains('is-expanded');
      handContainer.querySelectorAll('.hand-card.is-expanded').forEach(otherCard => {
        if (otherCard !== card) {
          otherCard.classList.remove('is-expanded');
          otherCard.setAttribute('aria-pressed', 'false');
        }
      });
      card.classList.toggle('is-expanded', willExpand);
      card.setAttribute('aria-pressed', String(willExpand));
    });

    card.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        card.classList.remove('is-expanded');
        card.setAttribute('aria-pressed', 'false');
        card.blur();
      }
    });

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

    updateGameStatus(gameState);
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
  updateGameStatus(gameState);
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
