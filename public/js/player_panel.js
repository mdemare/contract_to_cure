// player_panel.js
import { getCurrentGameState } from './game_state.js';
import { getCityColor } from './player_actions.js';

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

  // Update after any action completes
  document.addEventListener('actionComplete', () => {
    updatePlayerPanel(getCurrentGameState());
  });

  // Restore hidden state from localStorage if needed
  const savedHiddenState = localStorage.getItem('playerPanelHidden');
  if (savedHiddenState === 'true' && !playerPanel.classList.contains('hidden')) {
    playerPanel.classList.add('hidden');
    panelToggleBtn.setAttribute('aria-expanded', 'false');
  }
}

// Initialize module
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get initial game state (waiting for it to be loaded first)
    const gameState = getCurrentGameState();
    if (gameState) {
      initializePlayerPanel(gameState);
    } else {
      // If game state isn't loaded yet, wait for it
      document.addEventListener('gameStateLoaded', (e) => {
        initializePlayerPanel(e.detail.gameState);
      }, { once: true });
    }
  } catch (error) {
    console.error('Error initializing player panel:', error);
  }
});

// Create the player panel DOM structure
function createPlayerPanel() {
  // Create panel container
  const panel = document.createElement('div');
  panel.className = 'player-panel';

  // Create toggle button as a separate element (not inside the panel)
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'player-panel-toggle';
  toggleBtn.setAttribute('aria-label', 'Toggle player panel');
  toggleBtn.setAttribute('aria-expanded', 'true'); // Initially expanded

  // Add text to the toggle button
  const toggleText = document.createElement('span');
  toggleText.textContent = 'Players';
  toggleBtn.appendChild(toggleText);

  // Create header
  const header = document.createElement('div');
  header.className = 'player-panel-header';
  header.textContent = 'Players';

  // Create player list container
  const listContainer = document.createElement('div');
  listContainer.className = 'player-list';

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
  const playerItem = document.createElement('div');
  playerItem.className = `player-item ${isCurrent ? 'current' : ''}`;

  // Create player header with role and name
  const playerHeader = document.createElement('div');
  playerHeader.className = 'player-header';

  const roleName = String(player.role).toLowerCase();
  const roleText = formatRoleText(player.role);

  // Create pawn indicator
  const pawnElement = document.createElement('div');
  pawnElement.className = `player-pawn ${roleName.replace(' ', '-')}`;

  // Create player name/role text
  const nameElement = document.createElement('div');
  nameElement.className = 'player-name';
  nameElement.textContent = roleText; // Use the role name instead of "Player X"

  const roleElement = document.createElement('div');
  roleElement.className = 'player-role';
  roleElement.textContent = `Player ${player.index + 1}`; // Move player number to the subtitle

  // Create current player indicator
  const currentIndicator = document.createElement('div');
  currentIndicator.className = 'current-player-indicator';

  // Assemble header
  playerHeader.appendChild(pawnElement);
  playerHeader.appendChild(nameElement);
  playerHeader.appendChild(currentIndicator);

  // Create hand preview
  const handPreview = document.createElement('div');
  handPreview.className = 'player-hand-preview';

  // Add cards to hand preview
  if (player.hand && Array.isArray(player.hand)) {
    player.hand.forEach(cardName => {
      const cardElement = createCardPreview(cardName);
      handPreview.appendChild(cardElement);
    });
  }

  // Assemble player item
  playerItem.appendChild(playerHeader);
  playerItem.appendChild(handPreview);

  return playerItem;
}

// Create a card preview element
function createCardPreview(cardName) {
  const cardElement = document.createElement('div');

  // Determine card type and style
  if (cardName.startsWith('Action:')) {
    cardElement.className = 'hand-card-preview event';
    cardElement.textContent = cardName.replace('Action:', '').trim();
  } else if (cardName === 'Epidemic') {
    cardElement.className = 'hand-card-preview epidemic';
    cardElement.textContent = 'Epidemic';
  } else {
    // It's a city card
    const cityColor = getCityColor(cardName);
    cardElement.className = `hand-card-preview ${cityColor || ''}`;
    cardElement.textContent = cardName;
  }

  return cardElement;
}

// Format role text to be more readable (copied from current_player.js)
function formatRoleText(role) {
  if (!role) return 'Player';

  // Convert to string and split by capitals
  const words = String(role)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return words;
}
