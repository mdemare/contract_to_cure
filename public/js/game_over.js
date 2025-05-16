// game_over.js
import { createSimpleElement } from './dom.js';

// Initialize game over functionality
export function initGameOver() {
  // Create the game over overlay if it doesn't exist
  if (!document.querySelector('.game-over-overlay')) {
    createGameOverDialog();
  }

  // Add button event listeners
  setupGameOverButtons();
}

// Create the game over dialog HTML
function createGameOverDialog() {
  const overlay = createSimpleElement('div', 'game-over-overlay');
  const modal = createSimpleElement('div', 'game-over-modal');

  // Game over title and subtitle
  const title = createSimpleElement('h1', 'game-over-title', 'Game Over');
  const subtitle = createSimpleElement('h2', 'game-over-subtitle', 'The pandemic has overwhelmed humanity');
  modal.appendChild(title);
  modal.appendChild(subtitle);

  // Reason for game over
  const reason = createSimpleElement('div', 'game-over-reason');
  modal.appendChild(reason);

  // Animation container
  const animContainer = createSimpleElement('div', 'animation-container');
  modal.appendChild(animContainer);

  // Stats section
  const statsContainer = createSimpleElement('div', 'game-over-stats');

  // Turns stat
  const turnsStat = createSimpleElement('div', 'stat-item');
  const turnsValue = createSimpleElement('div', 'stat-value', '0');
  turnsValue.id = 'turns-stat';
  const turnsLabel = createSimpleElement('div', 'stat-label', 'Turns');
  turnsStat.appendChild(turnsValue);
  turnsStat.appendChild(turnsLabel);

  // Outbreaks stat
  const outbreaksStat = createSimpleElement('div', 'stat-item');
  const outbreaksValue = createSimpleElement('div', 'stat-value', '0');
  outbreaksValue.id = 'outbreaks-stat';
  const outbreaksLabel = createSimpleElement('div', 'stat-label', 'Outbreaks');
  outbreaksStat.appendChild(outbreaksValue);
  outbreaksStat.appendChild(outbreaksLabel);

  // Cures stat
  const curesStat = createSimpleElement('div', 'stat-item');
  const curesValue = createSimpleElement('div', 'stat-value', '0');
  curesValue.id = 'cures-stat';
  const curesLabel = createSimpleElement('div', 'stat-label', 'Cures Discovered');
  curesStat.appendChild(curesValue);
  curesStat.appendChild(curesLabel);

  // Add all stats to container
  statsContainer.appendChild(turnsStat);
  statsContainer.appendChild(outbreaksStat);
  statsContainer.appendChild(curesStat);
  modal.appendChild(statsContainer);

  // Buttons
  const buttonsContainer = createSimpleElement('div', 'game-over-buttons');
  const restartButton = createSimpleElement('button', ['game-over-button', 'restart-button'], 'Restart Game');
  const menuButton = createSimpleElement('button', ['game-over-button', 'menu-button'], 'Main Menu');

  buttonsContainer.appendChild(restartButton);
  buttonsContainer.appendChild(menuButton);
  modal.appendChild(buttonsContainer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Set up event listeners for the game over buttons
function setupGameOverButtons() {
  // Add event listener for the restart button
  document.addEventListener('click', function(event) {
    if (event.target.classList.contains('restart-button')) {
      // Reset game state and hide dialog
      restartGame();
    } else if (event.target.classList.contains('menu-button')) {
      // Return to main menu
      window.location.href = '/'; // Assuming main menu is at root
    }
  });
}

// Restart the game
function restartGame() {
  // Hide the game over dialog
  hideGameOverDialog();

  // Make API call to restart the game
  fetch('/restart_game', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Failed to restart game');
    }
    return response.json();
  })
  .then(data => {
    // Reload the page to refresh the game state
    window.location.reload();
  })
  .catch(error => {
    console.error('Error restarting game:', error);
    // Show an error message
    showNotification('Failed to restart game: ' + error.message, 'error');
  });
}

// Check if the game is over and show dialog if needed
export function checkGameOver(gameState) {
  if (!gameState) return;

  // If gameOver flag is true, show the game over dialog
  if (gameState.gameStatus && gameState.gameStatus.gameOver === true) {
    showGameOverDialog(gameState);
  }
}

// Show the game over dialog with appropriate content
function showGameOverDialog(gameState) {
  const overlay = document.querySelector('.game-over-overlay');
  if (!overlay) return;

  // Get game statistics
  const turns = gameState.gameStatus.turn || 0;
  const outbreaks = gameState.gameStatus.outbreaks || 0;
  const curesDiscovered = countCuresDiscovered(gameState);

  // Determine if victory or defeat
  const isVictory = curesDiscovered >= 4; // Victory if all 4 cures discovered

  // Update dialog content
  const title = document.querySelector('.game-over-title');
  const subtitle = document.querySelector('.game-over-subtitle');
  const reason = document.querySelector('.game-over-reason');

  if (isVictory) {
    overlay.classList.add('victory');
    title.textContent = 'Victory!';
    subtitle.textContent = 'Humanity has been saved';
    reason.textContent = 'All diseases have been cured. The world can breathe a sigh of relief.';
    createVictoryAnimation();
  } else {
    overlay.classList.remove('victory');
    title.textContent = 'Game Over';
    subtitle.textContent = 'The pandemic has overwhelmed humanity';

    // Determine defeat reason
    let defeatReason = '';
    if (gameState.gameStatus.defeatReason) {
      defeatReason = gameState.gameStatus.defeatReason;
    } else if (outbreaks >= 8) {
      defeatReason = 'Too many outbreaks occurred.';
    } else if (gameState.decks && gameState.decks.playerDeck && gameState.decks.playerDeck.length === 0) {
      defeatReason = 'You ran out of player cards.';
    } else if (gameState.diseaseCubes) {
      // Check if any disease cubes ran out
      const colors = ['blue', 'yellow', 'black', 'red'];
      for (const color of colors) {
        if (gameState.diseaseCubes[color] &&
            gameState.diseaseCubes[color].remaining === 0) {
          defeatReason = `You ran out of ${color} disease cubes.`;
          break;
        }
      }
    }

    if (!defeatReason) {
      defeatReason = 'The pandemic spread beyond control.';
    }

    reason.textContent = defeatReason;
  }

  // Update statistics
  document.getElementById('turns-stat').textContent = turns;
  document.getElementById('outbreaks-stat').textContent = outbreaks;
  document.getElementById('cures-stat').textContent = curesDiscovered;

  // Show the dialog
  overlay.style.display = 'flex'; // Make it visible first

  // Trigger reflow to ensure the transition works
  void overlay.offsetWidth;

  // Add visible class to fade in
  overlay.classList.add('visible');
}

// Hide the game over dialog
function hideGameOverDialog() {
  const overlay = document.querySelector('.game-over-overlay');
  if (overlay) {
    overlay.classList.remove('visible');

    // Wait for the transition to complete before setting display: none
    setTimeout(() => {
      if (!overlay.classList.contains('visible')) {
        overlay.style.display = 'none';
      }
    }, 500); // Match this to the transition duration in CSS
  }
}

// Count how many cures have been discovered
function countCuresDiscovered(gameState) {
  let count = 0;
  if (gameState.diseaseCubes) {
    const colors = ['blue', 'yellow', 'black', 'red'];
    for (const color of colors) {
      if (gameState.diseaseCubes[color] &&
          gameState.diseaseCubes[color].cured) {
        count++;
      }
    }
  }
  return count;
}

// Create confetti animation for victory
function createVictoryAnimation() {
  const container = document.querySelector('.animation-container');
  if (!container) return;

  // Clear any existing particles
  container.innerHTML = '';

  // Create particles for confetti effect
  const colors = ['#3b90ff', '#ffd700', '#444', '#ff5e5e', '#4caf50'];

  for (let i = 0; i < 50; i++) {
    const particle = createSimpleElement('div', 'particle');

    // Random position, color, and delay
    const left = Math.random() * 100;
    const delay = Math.random() * 2;
    const color = colors[Math.floor(Math.random() * colors.length)];

    particle.style.left = `${left}%`;
    particle.style.backgroundColor = color;
    particle.style.animationDelay = `${delay}s`;

    container.appendChild(particle);
  }
}

// Display a notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = createSimpleElement('div', ['game-notification', type], message);

  // Append to body
  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');

    // Remove from DOM after fade animation
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}
