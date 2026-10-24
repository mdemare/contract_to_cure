import { chooseNewGameDifficulty, gameDifficulty } from './difficulty.js';

let menuOpen = false;

function getCurrentUser() {
  return window.currentUser || null;
}

function initializeMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  const newGameBtn = document.getElementById('new-game-btn');
  const loginBtn = document.getElementById('login-menu-btn');
  const logoutBtn = document.getElementById('logout-menu-btn');

  if (!menuToggle || !dropdownMenu) return;

  menuToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener('click', function(e) {
    if (menuOpen && !dropdownMenu.contains(e.target) && !menuToggle.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && menuOpen) {
      closeMenu();
    }
  });

  if (newGameBtn) {
    newGameBtn.addEventListener('click', () => handleNewGame());
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

function toggleMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  
  menuOpen = !menuOpen;
  
  if (menuOpen) {
    menuToggle.classList.add('active');
    dropdownMenu.classList.add('show');
    menuToggle.setAttribute('aria-expanded', 'true');
  } else {
    menuToggle.classList.remove('active');
    dropdownMenu.classList.remove('show');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
}

function closeMenu() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  
  menuOpen = false;
  menuToggle.classList.remove('active');
  dropdownMenu.classList.remove('show');
  menuToggle.setAttribute('aria-expanded', 'false');
}

// Starts a new game with the given difficulty, or the current one when none is given.
export async function restartGame(difficulty, loadState = async gameState => {
  const { loadGameState } = await import('./game_state.js');
  return loadGameState(gameState);
}) {
  const response = await fetch('/restart_game', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
    },
    body: JSON.stringify(difficulty ? { difficulty_level: difficulty } : {}),
    credentials: 'same-origin'
  });

  if (response.status === 409) {
    const { GameConflictError, handleGameConflict } = await import('./player_action_utils.js');
    await handleGameConflict(response, { loadState });
    throw new GameConflictError();
  }

  if (!response.ok) {
    throw new Error('Failed to restart game');
  }

  const data = await response.json();
  if (!data.success) return false;

  await loadState(data.game_state || null);

  const gameOverDialog = document.querySelector('.game-over-dialog');
  if (gameOverDialog) {
    gameOverDialog.style.display = 'none';
  }

  return true;
}

async function currentGameState() {
  const { getCurrentGameState } = await import('./game_state.js');
  return getCurrentGameState();
}

// New Game: asks for a difficulty, defaulting to the current one, and restarts with it.
export async function handleNewGame({ choose = chooseNewGameDifficulty, getState = currentGameState, restart = restartGame } = {}) {
  closeMenu();

  const difficulty = await choose(gameDifficulty(await getState()));
  if (!difficulty) return;

  try {
    if (!await restart(difficulty)) {
      alert('Failed to start new game. Please try again.');
    }
  } catch (error) {
    // Conflicts are already reported with the refreshed game state.
    if (error.name === 'GameConflictError') return;
    console.error('Error restarting game:', error);
    alert('An error occurred while starting a new game.');
  }
}

export function handleLogin() {
  closeMenu();
  window.location = '/login';
}

function handleLogout() {
  closeMenu();
  
  fetch('/logout', {
    method: 'DELETE',
    headers: {
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content
    },
    credentials: 'same-origin'
  })
  .then(response => {
    if (response.ok) {
      window.location.reload();
    } else {
      alert('Failed to logout. Please try again.');
    }
  })
  .catch(error => {
    console.error('Logout error:', error);
    alert('An error occurred during logout.');
  });
}

function updateMenuAuthUI() {
  const authInfo = document.getElementById('auth-info-menu');
  const loginBtn = document.getElementById('login-menu-btn');
  const logoutBtn = document.getElementById('logout-menu-btn');
  
  const currentUser = getCurrentUser();
  
  if (currentUser) {
    if (authInfo) {
      authInfo.style.display = 'block';
      const userName = authInfo.querySelector('.user-name-menu');
      const userEmail = authInfo.querySelector('.user-email');
      if (userName) userName.textContent = currentUser.name || 'User';
      if (userEmail) userEmail.textContent = currentUser.email || '';
    }
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
  } else {
    if (authInfo) authInfo.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initializeMenu();
  updateMenuAuthUI();
});

window.updateMenuAuthUI = updateMenuAuthUI;
