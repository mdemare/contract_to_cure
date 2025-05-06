// end_turn_events.js
import { getCurrentGameState } from './game_state.js';

// Function to handle end of turn events
export function handleEndOfTurnEvents(endTurnData) {
  if (!endTurnData || !endTurnData.events || !Array.isArray(endTurnData.events)) {
    console.error('Invalid end turn data:', endTurnData);
    return;
  }

  // Filter draw card events
  const drawCardEvents = endTurnData.events.filter(event => event.type === 'draw_card');

  // Animate drawing each card with a delay between them
  if (drawCardEvents.length > 0) {
    animateCardDraws(drawCardEvents);
  }
}

// Function to animate card draws
function animateCardDraws(drawEvents) {
  // Create a container for the animation if it doesn't exist
  let animContainer = document.querySelector('.card-draw-animation-container');
  if (!animContainer) {
    animContainer = document.createElement('div');
    animContainer.classList.add('card-draw-animation-container');
    document.body.appendChild(animContainer);
  } else {
    // Clear any existing animations
    animContainer.innerHTML = '';
  }

  // Add player info text before the cards
  const playerInfo = document.createElement('div');
  playerInfo.classList.add('player-info');
  playerInfo.textContent = 'Drawing Cards';
  animContainer.appendChild(playerInfo);

  // Create all card elements at once for horizontal layout
  drawEvents.forEach(event => {
    const cardElement = createCardElement(event);
    animContainer.appendChild(cardElement);
  });

  // Make container visible
  animContainer.style.display = 'flex';

  // Animate each card with a delay
  drawEvents.forEach((event, index) => {
    setTimeout(() => {
      const cardElements = document.querySelectorAll('.animated-card');
      if (cardElements[index]) {
        cardElements[index].classList.add('drawn');

        // Play sound effect
        playCardDrawSound();

        // If this is the last card, set a timer to hide the animation
        if (index === drawEvents.length - 1) {
          setTimeout(() => {
            animContainer.style.display = 'none';
          }, 2000); // 2 seconds after last card is drawn
        }
      }
    }, index * 1500); // 1.5 second delay between cards
  });
}

// Function to create a card element
function createCardElement(drawEvent) {
  const { player, card } = drawEvent;

  // Create the card element
  const cardElement = document.createElement('div');
  cardElement.classList.add('animated-card');

  // Add appropriate class based on card type
  if (card.type === 'city') {
    cardElement.classList.add('city-card', card.color);
  } else if (card.type === 'event') {
    cardElement.classList.add('event-card');
  } else if (card.type === 'epidemic') {
    cardElement.classList.add('epidemic-card');
  }

  // Card content
  const cardHeader = document.createElement('div');
  cardHeader.classList.add('card-header');
  cardHeader.textContent = card.type === 'city' ? 'City' : card.type;

  const cardTitle = document.createElement('div');
  cardTitle.classList.add('card-title');
  cardTitle.textContent = card.name;

  cardElement.appendChild(cardHeader);
  cardElement.appendChild(cardTitle);

  return cardElement;
}

// Play a card draw sound effect
function playCardDrawSound() {
  // In a real implementation, you would add sound effects
  console.log('Card draw sound played');
}
