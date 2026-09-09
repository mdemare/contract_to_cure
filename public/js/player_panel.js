// player_panel.js
import { getCurrentGameState } from './game_state.js';
import { createSimpleElement } from './dom.js';
import { createPlayerRosterContainer, renderPlayerRoster } from './player_roster.js';

// DOM elements
let playerPanel;
let playerList;
let playerRoster;
let panelToggleBtn;
let scrollHint;
let lastCurrentPlayerIndex;

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
  playerRoster = document.querySelector('.player-roster');
  if (!playerList || !playerRoster) { throw new Error("don't call initializePlayerPanel until the DOM is loaded") }
  panelToggleBtn = document.querySelector('.player-panel-toggle');
  scrollHint = document.querySelector('.player-panel-scroll-hint');

  // Add event listener to toggle button
  panelToggleBtn.addEventListener('click', togglePlayerPanel);
  playerList.addEventListener('scroll', updateScrollAffordance);
  window.addEventListener('resize', scheduleScrollAffordanceUpdate);

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
  panel.id = 'player-panel';
  panel.setAttribute('aria-labelledby', 'player-panel-title');

  // Create toggle button as a separate element (not inside the panel)
  const toggleBtn = createSimpleElement('button', 'player-panel-toggle');
  toggleBtn.setAttribute('aria-label', 'Toggle player panel');
  toggleBtn.setAttribute('aria-expanded', 'true'); // Initially expanded
  toggleBtn.setAttribute('aria-controls', 'player-panel');

  // Add text to the toggle button
  const toggleText = createSimpleElement('span', null, 'Players');
  toggleBtn.appendChild(toggleText);

  // Create header
  const header = createSimpleElement('div', 'player-panel-header');
  const title = createSimpleElement('h2', null, 'Players');
  title.id = 'player-panel-title';
  header.appendChild(title);

  // Keep production metadata outside the roster that is replaced on updates.
  const gitHashData = document.body.getAttribute('data-git-hash');
  const { listContainer } = createPlayerRosterContainer(gitHashData);

  const hint = createSimpleElement('div', 'player-panel-scroll-hint', 'Scroll for more ↓');
  hint.setAttribute('aria-hidden', 'true');
  hint.hidden = true;

  // Assemble the panel
  panel.appendChild(header);
  panel.appendChild(listContainer);
  panel.appendChild(hint);

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

  if (!isHidden) scheduleScrollAffordanceUpdate();
}

// Update the player panel with current game state
export function updatePlayerPanel(providedGameState) {
  if (!playerList || !playerRoster) {throw new Error('player panel not yet initialized')}
  // Use the provided game state or get the current one
  const gameState = providedGameState || getCurrentGameState();

  if (!gameState || !gameState.players || !Array.isArray(gameState.players)) {
    return;
  }

  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex ?? 0;
  const currentPlayerChanged = currentPlayerIndex !== lastCurrentPlayerIndex;

  renderPlayerRoster(playerRoster, gameState);
  scheduleScrollAffordanceUpdate();

  if (currentPlayerChanged) {
    const currentPlayer = playerRoster.querySelector('.player-item.current');
    currentPlayer?.scrollIntoView({ block: 'nearest' });
    lastCurrentPlayerIndex = currentPlayerIndex;
  }
}

function scheduleScrollAffordanceUpdate() {
  window.requestAnimationFrame(updateScrollAffordance);
}

function updateScrollAffordance() {
  if (!playerPanel || !playerList || !scrollHint) return;

  const hasMoreBelow = playerList.scrollHeight - playerList.scrollTop - playerList.clientHeight > 2;
  playerPanel.classList.toggle('can-scroll', hasMoreBelow);
  scrollHint.hidden = !hasMoreBelow;
}
