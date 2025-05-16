// player_panel.js
import { getCurrentGameState } from './game_state.js';
import { createSimpleElement } from './dom.js';

// DOM elements
let playerPanel;
let playerList;
let panelToggleBtn;

// Initialize the player panel
export function initializePlayerPanel(gameState) {
  console.log("Initializing player panel");

  // Create the panel if it doesn't exist
  if (!document.querySelector('.player-panel')) {
    createPlayerPanel();
  }

  // Cache DOM elements
  playerPanel = document.querySelector('.player-panel');
  playerList = document.querySelector('.player-list');
  if (!playerList) { throw new Error("don't call initializePlayerPanel until the DOM is loaded") }
  panelToggleBtn = document.querySelector('.player-panel-toggle');

  // Add event listener to toggle button
  panelToggleBtn.addEventListener('click', togglePlayerPanel);

  // Load initial player data with the provided game state
  updatePlayerPanel(gameState);

  // Set up event listeners for updates (consistent with other modules)
  document.addEventListener('mapUpdated', () => {
    updatePlayerPanel(getCurrentGameState());
  });

  // Update when a player moves
  document.addEventListener('playerMoved', () => {
    updatePlayerPanel(getCurrentGameState());
  });

  // Restore hidden state from localStorage if needed
  const savedHiddenState = localStorage.getItem('playerPanelHidden');
  if (savedHiddenState === 'true' && !playerPanel.classList.contains('hidden')) {
    playerPanel.classList.add('hidden');
    panelToggleBtn.setAttribute('aria-expanded', 'false');
  }
}

// Create the player panel DOM structure
function createPlayerPanel() {
  // Create panel container
  const panel = createSimpleElement('div', 'player-panel');

  // Create toggle button as a separate element (not inside the panel)
  const toggleBtn = createSimpleElement('button', 'player-panel-toggle');
  toggleBtn.setAttribute('aria-label', 'Toggle player panel');
  toggleBtn.setAttribute('aria-expanded', 'true'); // Initially expanded

  // Add text to the toggle button
  const toggleText = createSimpleElement('span', null, 'Players');
  toggleBtn.appendChild(toggleText);

  // Create header
  const header = createSimpleElement('div', 'player-panel-header', 'Players');

  // Create player list container
  const listContainer = createSimpleElement('div', 'player-list');

  // Assemble the panel
  panel.appendChild(header);
  panel.appendChild(listContainer);

  // Add both elements to the document (toggle button is outside the panel)
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}

// Toggle the player panel visibility
function togglePlayerPanel() {
  // Toggle the class
  playerPanel.classList.toggle('hidden');

  // Update the toggle button's accessibility attributes
  const isHidden = playerPanel.classList.contains('hidden');
  panelToggleBtn.setAttribute('aria-expanded', !isHidden);

  // Save preference in localStorage
  localStorage.setItem('playerPanelHidden', isHidden);
}

// Update the player panel with current game state
export function updatePlayerPanel(providedGameState) {
  if (!playerList) {throw new Error('playerList not yet initialized')}
  // Use the provided game state or get the current one
  const gameState = providedGameState || getCurrentGameState();

  if (!gameState || !gameState.players || !Array.isArray(gameState.players)) {
    return;
  }

  // Clear current list
  if (playerList) {
    playerList.innerHTML = '';
  }

  // Get current player index
  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex || 0;

  // Create player items
  gameState.players.forEach((player, index) => {
    if (!player || !player.role) return;

    const playerItem = createPlayerItem(player, index === currentPlayerIndex);
    playerList.appendChild(playerItem);
  });
}

// Create a player item element
function createPlayerItem(player, isCurrent) {
  const playerItem = createSimpleElement('div', ['player-item', isCurrent && 'current'].filter(Boolean));

  // Create player header with role and name
  const playerHeader = createSimpleElement('div', 'player-header');

  const roleName = String(player.role).toLowerCase();
  const roleText = formatRoleText(player.role);

  // Create pawn indicator
  const pawnElement = createSimpleElement('div', ['player-pawn', roleName.replace(' ', '-')]);

  // Create player name/role text
  const nameElement = createSimpleElement('div', 'player-name', roleText);
  const roleElement = createSimpleElement('div', 'player-role', `Player ${player.index + 1}`);

  // Create current player indicator
  const currentIndicator = createSimpleElement('div', 'current-player-indicator');

  // Assemble header
  playerHeader.appendChild(pawnElement);
  playerHeader.appendChild(nameElement);
  playerHeader.appendChild(currentIndicator);

  // Create hand preview
  const handPreview = createSimpleElement('div', 'player-hand-preview');

  // Add cards to hand preview
  if (player.hand && Array.isArray(player.hand)) {
    player.hand.forEach(cardObj => {
      const cardElement = createCardPreview(cardObj);
      handPreview.appendChild(cardElement);
    });
  }

  // Assemble player item
  playerItem.appendChild(playerHeader);
  playerItem.appendChild(handPreview);

  return playerItem;
}

const typeToClassMap = {
  'action': 'event',
  'event': 'epidemic'
};

// Create a card preview element
function createCardPreview(cardObj) {
  if (!cardObj) { throw new Error("cardObj is undefined") }

  // Use the appropriate class from the map or the card's color
  const cardClasses = ["hand-card-preview", `${typeToClassMap[cardObj.type] || cardObj.color}`];
  return createSimpleElement('div', cardClasses, cardObj.name);
}

// Format role text to be more readable (copied from current_player.js)
function formatRoleText(role) {
  if (!role) return 'Player'

  // Convert to string and split by capitals
  const words = String(role)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  return words;
}
