import { createSimpleElement } from './dom.js';

const typeToClassMap = {
  'action': 'event',
  'event': 'epidemic'
};

/**
 * Create the scrollable player-list shell and its independently rendered
 * roster. Production metadata belongs to the shell so roster updates cannot
 * remove it.
 */
export function createPlayerRosterContainer(gitHashData) {
  const listContainer = createSimpleElement('div', 'player-list');

  if (gitHashData && gitHashData.trim()) {
    listContainer.appendChild(createSimpleElement('div', 'git-hash-display', gitHashData));
  }

  const rosterContainer = createSimpleElement('div', 'player-roster');
  rosterContainer.setAttribute('role', 'list');
  rosterContainer.setAttribute('aria-label', 'Players in turn order');
  listContainer.appendChild(rosterContainer);

  return { listContainer, rosterContainer };
}

/**
 * Render the roster with every player's complete hand visible.
 *
 * @param {HTMLElement} container
 * @param {Object} gameState
 */
export function renderPlayerRoster(container, gameState) {
  container.innerHTML = '';

  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex ?? 0;

  gameState.players.forEach((player, rosterIndex) => {
    if (!player || !player.role) return;

    const playerIndex = Number.isInteger(player.index) ? player.index : rosterIndex;
    container.appendChild(createPlayerItem(player, playerIndex, playerIndex === currentPlayerIndex));
  });
}

/**
 * Create one roster row with an always-visible card list.
 */
export function createPlayerItem(player, playerIndex, isCurrent) {
  const playerNumber = playerIndex + 1;
  const roleName = String(player.role).toLowerCase();
  const roleText = formatRoleText(player.role);
  const cards = Array.isArray(player.hand) ? player.hand : [];
  const cardCountText = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
  const detailsId = `player-${playerIndex}-hand`;
  const summaryId = `player-${playerIndex}-summary`;

  const playerItem = createSimpleElement('div', ['player-item', isCurrent && 'current'].filter(Boolean));
  playerItem.setAttribute('role', 'listitem');
  playerItem.dataset.playerIndex = playerIndex;
  if (isCurrent) playerItem.setAttribute('aria-current', 'true');

  const summary = createSimpleElement('div', 'player-summary');
  summary.id = summaryId;

  const pawnElement = createSimpleElement('span', ['player-pawn', roleName.replaceAll('_', '-')]);
  pawnElement.setAttribute('aria-hidden', 'true');

  const identity = createSimpleElement('span', 'player-identity');
  const title = createSimpleElement('span', 'player-title');
  title.appendChild(createSimpleElement('span', 'player-position', `Player ${playerNumber}`));
  title.appendChild(createSimpleElement('span', 'player-name', roleText));
  identity.appendChild(title);
  if (player.location) {
    identity.appendChild(createSimpleElement('span', 'player-location', player.location));
  }

  const state = createSimpleElement('span', 'player-state');
  state.appendChild(createSimpleElement(
    'span',
    ['turn-status', isCurrent ? 'active' : 'waiting'],
    isCurrent ? 'Current turn' : 'Waiting'
  ));
  state.appendChild(createSimpleElement('span', 'card-count', cardCountText));

  summary.appendChild(pawnElement);
  summary.appendChild(identity);
  summary.appendChild(state);

  const handDetails = createSimpleElement('div', 'player-hand-details');
  handDetails.id = detailsId;
  handDetails.setAttribute('aria-labelledby', summaryId);

  const handList = createSimpleElement('ul', 'player-hand-preview');
  if (cards.length === 0) {
    handList.appendChild(createSimpleElement('li', 'empty-hand', 'No cards'));
  } else {
    cards.forEach(card => handList.appendChild(createCardPreview(card)));
  }
  handDetails.appendChild(handList);

  playerItem.appendChild(summary);
  playerItem.appendChild(handDetails);

  return playerItem;
}

function createCardPreview(card) {
  if (!card) throw new Error('card is undefined');

  const cardClass = typeToClassMap[card.type] || card.color;
  return createSimpleElement('li', ['hand-card-preview', cardClass], card.name);
}

function formatRoleText(role) {
  if (!role) return 'Player';

  return String(role)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
