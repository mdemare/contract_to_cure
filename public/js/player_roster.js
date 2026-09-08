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
 * Render the compact roster while keeping hand details available on demand.
 *
 * @param {HTMLElement} container
 * @param {Object} gameState
 * @param {Set<number>} expandedPlayers
 * @param {Function} onToggle
 */
export function renderPlayerRoster(container, gameState, expandedPlayers = new Set(), onToggle = () => {}) {
  container.innerHTML = '';

  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex ?? 0;

  gameState.players.forEach((player, rosterIndex) => {
    if (!player || !player.role) return;

    const playerIndex = Number.isInteger(player.index) ? player.index : rosterIndex;
    container.appendChild(createPlayerItem(
      player,
      playerIndex,
      rosterIndex === currentPlayerIndex,
      expandedPlayers,
      onToggle
    ));
  });
}

/**
 * Create one roster row. The summary is deliberately a button so hands work
 * equally well with a keyboard, pointer, or touch screen.
 */
export function createPlayerItem(player, playerIndex, isCurrent, expandedPlayers = new Set(), onToggle = () => {}) {
  const playerNumber = playerIndex + 1;
  const roleName = String(player.role).toLowerCase();
  const roleText = formatRoleText(player.role);
  const cards = Array.isArray(player.hand) ? player.hand : [];
  const cardCountText = `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`;
  const detailsId = `player-${playerIndex}-hand`;
  const summaryId = `player-${playerIndex}-summary`;
  const isExpanded = expandedPlayers.has(playerIndex);

  const playerItem = createSimpleElement('div', ['player-item', isCurrent && 'current'].filter(Boolean));
  playerItem.setAttribute('role', 'listitem');
  playerItem.dataset.playerIndex = playerIndex;
  if (isCurrent) playerItem.setAttribute('aria-current', 'true');

  const summary = createSimpleElement('button', 'player-summary');
  summary.type = 'button';
  summary.id = summaryId;
  summary.setAttribute('aria-controls', detailsId);
  summary.setAttribute('aria-expanded', String(isExpanded));

  const pawnElement = createSimpleElement('span', ['player-pawn', roleName.replaceAll('_', '-')]);
  pawnElement.setAttribute('aria-hidden', 'true');

  const identity = createSimpleElement('span', 'player-identity');
  identity.appendChild(createSimpleElement('span', 'player-position', `Player ${playerNumber}`));
  identity.appendChild(createSimpleElement('span', 'player-name', roleText));
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

  const disclosure = createSimpleElement('span', 'player-hand-action', isExpanded ? 'Hide hand' : 'Show hand');
  const chevron = createSimpleElement('span', 'player-disclosure-icon', '⌄');
  chevron.setAttribute('aria-hidden', 'true');
  state.appendChild(disclosure);
  state.appendChild(chevron);

  summary.appendChild(pawnElement);
  summary.appendChild(identity);
  summary.appendChild(state);

  const handDetails = createSimpleElement('div', 'player-hand-details');
  handDetails.id = detailsId;
  handDetails.setAttribute('aria-labelledby', summaryId);
  handDetails.hidden = !isExpanded;

  const handList = createSimpleElement('ul', 'player-hand-preview');
  if (cards.length === 0) {
    handList.appendChild(createSimpleElement('li', 'empty-hand', 'No cards'));
  } else {
    cards.forEach(card => handList.appendChild(createCardPreview(card)));
  }
  handDetails.appendChild(handList);

  summary.addEventListener('click', () => {
    const shouldExpand = summary.getAttribute('aria-expanded') !== 'true';
    summary.setAttribute('aria-expanded', String(shouldExpand));
    handDetails.hidden = !shouldExpand;
    disclosure.textContent = shouldExpand ? 'Hide hand' : 'Show hand';

    if (shouldExpand) {
      expandedPlayers.add(playerIndex);
    } else {
      expandedPlayers.delete(playerIndex);
    }

    onToggle();
  });

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
