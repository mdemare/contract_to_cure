// Update the current player indicator
export function updateCurrentPlayer(gameState) {
  if (!gameState || !gameState.players || !Array.isArray(gameState.players)) {
    return;
  }

  // Find the current player based on turn index
  const currentPlayerIndex = gameState.gameStatus?.currentPlayerIndex || 0;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer || !currentPlayer.role) {
    return;
  }

  // Get the DOM elements
  const pawnElement = document.getElementById('current-player-pawn');
  const labelElement = document.getElementById('current-player-label');

  if (!pawnElement || !labelElement) {
    return;
  }

  // Update the pawn color based on role
  const roleName = String(currentPlayer.role).toLowerCase();
  const roleText = formatRoleText(currentPlayer.role);

  // Remove all role classes first
  pawnElement.className = 'current-player-pawn';

  // Add the current role class
  pawnElement.classList.add(roleName.replaceAll('_', '-'));

  // Update the label text
  labelElement.textContent = roleText;

  // If you want to show player name as well, you can do:
  // labelElement.textContent = `${roleText}${currentPlayer.name ? ` (${currentPlayer.name})` : ''}`;
}

// Format role text to be more readable
function formatRoleText(role) {
  if (!role) return 'Current Player';

  // Convert to string and split by capitals
  const words = String(role)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return words;
}

// Initialize current player display when the game state loads
export function initializeCurrentPlayer(gameState) {
  updateCurrentPlayer(gameState);
}
