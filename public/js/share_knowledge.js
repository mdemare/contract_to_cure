// share_knowledge.js
import { getCurrentGameState } from './game_state.js';
import { executeShareKnowledge, getCityColor } from './player_actions.js';

// State to track which players can share knowledge
let applicableCards = [];
let eligiblePlayers = [];
let activeModalBackdrop = null;

// Initialize the share knowledge functionality
export function initShareKnowledge() {
  // Set up event listener for the share knowledge button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', handleShareKnowledgeClick);
  }

  // Update share knowledge button state based on game state
  updateShareKnowledgeButtonState();
}

// Update the share knowledge button state based on the current game state
export function updateShareKnowledgeButtonState() {
  const gameState = getCurrentGameState();
  const shareBtn = document.getElementById('share-btn');

  if (!gameState || !shareBtn) return;

  // Get current player
  const currentPlayerIndex = gameState.gameStatus.currentPlayerIndex;
  const currentPlayer = gameState.players[currentPlayerIndex];

  if (!currentPlayer) return;

  // Check if there are other players in the same location
  const playersInSameLocation = getPlayersInSameLocation(gameState, currentPlayer.location);

  // Get applicable cards that can be shared
  // Store the state for later use
  applicableCards = getApplicableCards(gameState, currentPlayerIndex, playersInSameLocation);
  console.log("applicableCards")
  console.log(applicableCards)
  eligiblePlayers = playersInSameLocation;

  // Enable or disable the button based on whether sharing is possible
  if (playersInSameLocation.length > 0 && applicableCards.length > 0) {
    shareBtn.classList.remove('disabled');
    shareBtn.disabled = false;
  } else {
    shareBtn.classList.add('disabled');
    shareBtn.disabled = true;
  }
}

// Get all players in the same location as the current player
function getPlayersInSameLocation(gameState, location) {
  const result = [];

  gameState.players.forEach((player, index) => {
    // Only include other players (not the current player)
    if (player.location === location && index !== gameState.gameStatus.currentPlayerIndex) {
      result.push({
        index: index,
        role: player.role,
        hand: player.hand
      });
    }
  });

  return result;
}

// Get applicable cards that can be shared between the current player and other players in the same location
function getApplicableCards(gameState, currentPlayerIndex, playersInSameLocation) {
  const result = [];
  const currentPlayer = gameState.players[currentPlayerIndex];
  const currentLocation = currentPlayer.location;

  // Check if current player has the current location card (they can give it)
  const currentLocationCardIndex = currentPlayer.hand.indexOf(currentLocation);
  if (currentLocationCardIndex !== -1) {
    result.push({
      cardName: currentLocation,
      action: 'give',
      playerIndex: currentPlayerIndex,
      cardIndex: currentLocationCardIndex
    });
  }

  // Check if any other player has the current location card (current player can take it)
  playersInSameLocation.forEach(player => {
    const locationCardIndex = player.hand.indexOf(currentLocation);

    // Check if player has the current location card
    if (locationCardIndex !== -1) {
      result.push({
        cardName: currentLocation,
        action: 'take',
        playerIndex: player.index,
        cardIndex: locationCardIndex
      });
    }

    // If the other player is a Researcher, they can give any card from their hand
    if (player.role === 'researcher') {
      player.hand.forEach((cardName, index) => {
        // Skip the current location card as it's already been added
        if (cardName !== currentLocation) {
          // Skip non-city cards (like Event or Epidemic cards)
          if (!cardName.startsWith('Action:') && cardName !== 'Epidemic') {
            result.push({
              cardName: cardName,
              action: 'take',
              playerIndex: player.index,
              cardIndex: index,
              fromResearcher: true
            });
          }
        }
      });
    }
  });

  // If the current player is a Researcher, they can give any card from their hand
  console.log("ROLE:"+currentPlayer.role)
  if (currentPlayer.role === 'researcher') {
    currentPlayer.hand.forEach((cardName, index) => {
      // Skip the current location card as it's already been added
      if (cardName !== currentLocation && currentLocationCardIndex !== index) {
        // Skip non-city cards (like Event or Epidemic cards)
        if (!cardName.startsWith('Action:') && cardName !== 'Epidemic') {
          result.push({
            cardName: cardName,
            action: 'give',
            playerIndex: currentPlayerIndex,
            cardIndex: index,
            fromResearcher: true
          });
        }
      }
    });
  }

  return result;
}

// Handle share knowledge button click
function handleShareKnowledgeClick() {
  // If no applicable cards or eligible players, do nothing
  if (applicableCards.length === 0 || eligiblePlayers.length === 0) {
    return;
  }

  // Create and show the share knowledge modal
  showShareKnowledgeModal(applicableCards, eligiblePlayers);
}

// Close the share knowledge modal
function closeShareModal() {
  if (activeModalBackdrop) {
    document.body.removeChild(activeModalBackdrop);
    activeModalBackdrop = null;
  }
}

// Create and show the share knowledge modal
function showShareKnowledgeModal(cards, players) {
  // Create modal backdrop
  const modalBackdrop = document.createElement('div');
  modalBackdrop.classList.add('modal-backdrop');

  // Store reference to the modal backdrop
  activeModalBackdrop = modalBackdrop;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.classList.add('modal-content');

  // Add title
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'Share Knowledge';
  modalContent.appendChild(modalTitle);

  // Add cards list
  const cardsList = document.createElement('div');
  cardsList.classList.add('share-cards-list');

  // Group cards by action (give/take)
  const giveCards = cards.filter(card => card.action === 'give');
  const takeCards = cards.filter(card => card.action === 'take');

  // Add section for cards to give (if any)
  if (giveCards.length > 0) {
    const giveSection = document.createElement('div');
    giveSection.classList.add('share-section');

    const giveTitle = document.createElement('h4');
    giveTitle.textContent = 'Cards you can give:';
    giveSection.appendChild(giveTitle);

    giveCards.forEach(card => {
      const cardElement = createCardElement(card, players);
      giveSection.appendChild(cardElement);
    });

    cardsList.appendChild(giveSection);
  }

  // Add section for cards to take (if any)
  if (takeCards.length > 0) {
    const takeSection = document.createElement('div');
    takeSection.classList.add('share-section');

    const takeTitle = document.createElement('h4');
    takeTitle.textContent = 'Cards you can take:';
    takeSection.appendChild(takeTitle);

    takeCards.forEach(card => {
      const cardElement = createCardElement(card, players);
      takeSection.appendChild(cardElement);
    });

    cardsList.appendChild(takeSection);
  }

  modalContent.appendChild(cardsList);

  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Cancel';
  closeButton.classList.add('cancel-btn');
  closeButton.addEventListener('click', () => {
    closeShareModal();
  });

  modalContent.appendChild(closeButton);

  // Add modal to page
  modalBackdrop.appendChild(modalContent);
  document.body.appendChild(modalBackdrop);
}

async function shareKnowledge(cityName, otherPlayerIndex, action) {
  let currentPlayerIndex = getCurrentGameState().gameStatus.currentPlayerIndex;
  let givingPlayerIndex, receivingPlayerIndex;

  if (action === 'give') {
    givingPlayerIndex = currentPlayerIndex;
    receivingPlayerIndex = otherPlayerIndex;
  } else { // action === 'take'
    givingPlayerIndex = otherPlayerIndex;
    receivingPlayerIndex = currentPlayerIndex;
  }

  try {
    // Execute the share knowledge action
    await executeShareKnowledge(cityName, givingPlayerIndex, receivingPlayerIndex);

    // Always close the modal after sharing a card
    closeShareModal();

    // Reset any active mode
    resetActiveMode();

    return true;
  } catch (error) {
    showErrorMessage(`Failed to share knowledge: ${error.message}`);
    return false;
  }
}

// Reset any active mode
function resetActiveMode() {
  // Dispatch event to notify that the mode has been reset
  const modeResetEvent = new CustomEvent('actionModeReset');
  document.dispatchEvent(modeResetEvent);
}

// Create a card element for the share knowledge modal
function createCardElement(card, players) {
  const cardElement = document.createElement('div');
  cardElement.classList.add('share-card');

  // Add city color
  const cityColor = getCityColor(card.cardName);
  if (cityColor) {
    cardElement.classList.add(cityColor);
  }

  // Card name
  const cardName = document.createElement('div');
  cardName.classList.add('card-name');
  cardName.textContent = card.cardName;

  // Card action
  const actionBadge = document.createElement('span');
  actionBadge.classList.add('action-badge');
  actionBadge.textContent = card.action.toUpperCase();

  // Add player name if it's a take action
  let playerName = '';
  if (card.action === 'take') {
    const player = players.find(p => p.index === card.playerIndex);
    if (player) {
      playerName = player.role || `Player ${card.playerIndex + 1}`;
    }
  }

  // Add researcher note if applicable
  if (card.fromResearcher) {
    cardName.textContent += ' (Researcher)';
  }

  // Create button to execute the share
  const shareButton = document.createElement('button');
  shareButton.classList.add('share-btn');

  if (card.action === 'give') {
    // For give actions, we need to show the player to give to
    shareButton.textContent = 'Give to...';

    // If there's more than one eligible player, show dropdown
    if (players.length > 1) {
      const playerList = document.createElement('div');
      playerList.classList.add('player-dropdown');
      playerList.style.display = 'none';

      players.forEach(player => {
        const playerOption = document.createElement('div');
        playerOption.classList.add('player-option');
        playerOption.textContent = player.role || `Player ${player.index + 1}`;
        playerOption.addEventListener('click', async () => {
          await shareKnowledge(card.cardName, player.index, 'give');
          playerList.style.display = 'none';
        });
        playerList.appendChild(playerOption);
      });

      shareButton.addEventListener('click', (e) => {
        e.stopPropagation();
        // Toggle dropdown
        playerList.style.display = playerList.style.display === 'none' ? 'block' : 'none';
      });

      cardElement.appendChild(playerList);
    } else if (players.length === 1) {
      // If there's only one player, direct action
      shareButton.textContent = `Give to ${players[0].role || 'Player ' + (players[0].index + 1)}`;
      shareButton.addEventListener('click', async () => {
        await shareKnowledge(card.cardName, players[0].index, 'give');
      });
    }
  } else {
    // For take actions, direct action with the player shown
    shareButton.textContent = `Take from ${playerName}`;
    shareButton.addEventListener('click', async () => {
      await shareKnowledge(card.cardName, card.playerIndex, 'take');
    });
  }

  // Assemble card
  cardElement.appendChild(cardName);
  cardElement.appendChild(actionBadge);
  cardElement.appendChild(shareButton);

  return cardElement;
}

// Display notifications to the user
function showSuccessMessage(message) {
  showNotification(message, 'success');
}

function showErrorMessage(message) {
  showNotification(`Action failed: ${message}`, 'error');
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.classList.add('share-notification', type);
  notification.textContent = message;

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
