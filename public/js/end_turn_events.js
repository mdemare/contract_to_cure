// end_turn_events.js
import { getCurrentGameState } from './game_state.js';

// Function to handle end of turn events
export function handleEndOfTurnEvents(endTurnData) {
  if (!endTurnData || !endTurnData.events || !Array.isArray(endTurnData.events)) {
    console.error('Invalid end turn data:', endTurnData);
    return;
  }

  // Filter card events by type
  const drawCardEvents = endTurnData.events.filter(event => event.type === 'draw_card');
  const infectCardEvents = endTurnData.events.filter(event => event.type === 'infect_city');

  // First animate drawing player cards
  if (drawCardEvents.length > 0) {
    animateCardDraws(drawCardEvents, 'player', () => {
      // After player cards are drawn, animate infection cards
      if (infectCardEvents.length > 0) {
        setTimeout(() => {
          animateCardDraws(infectCardEvents, 'infection');
        }, 1000); // 1 second delay between player cards and infection cards
      }
    });
  } else if (infectCardEvents.length > 0) {
    // If no player cards but infection cards exist
    animateCardDraws(infectCardEvents, 'infection');
  }
}

// Function to animate card draws
function animateCardDraws(drawEvents, cardType, completionCallback) {
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
  playerInfo.textContent = cardType === 'player' ? 'Drawing Player Cards' : 'Infecting Cities';
  animContainer.appendChild(playerInfo);

  // Create all card elements at once for horizontal layout
  drawEvents.forEach(event => {
    const cardElement = createCardElement(event, cardType);
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

        // If this is the last card and no callback is provided, set a timer to hide the animation
        if (index === drawEvents.length - 1) {
          if (completionCallback) {
            setTimeout(() => {
              completionCallback();
              animContainer.style.display = 'none';
            }, 1500);
          } else {
            setTimeout(() => {
              animContainer.style.display = 'none';
            }, 2000); // 2 seconds after last card is drawn
          }
        }
      }
    }, index * 1200); // 1.2 second delay between cards
  });
}

// Function to create a card element
function createCardElement(event, cardType) {
  if (cardType === 'player') {
    const { player, card } = event;

    // Create the card element with card-base class from cards.css
    const cardElement = document.createElement('div');
    cardElement.classList.add('animated-card', 'card-base');

    // Add appropriate class based on card type
    if (card.type === 'city') {
      cardElement.classList.add('city-card', `card-${card.color}`);
    } else if (card.type === 'event') {
      cardElement.classList.add('card-event');
    } else if (card.type === 'epidemic') {
      cardElement.classList.add('card-epidemic');
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
  } else if (cardType === 'infection') {
    // Create an infection card (keeping the original styling)
    const { city, color } = event;

    const cardElement = document.createElement('div');
    cardElement.classList.add('animated-card', 'infection-card', color);

    // Card content
    const cardHeader = document.createElement('div');
    cardHeader.classList.add('card-header');
    cardHeader.textContent = 'Infection';

    const cardTitle = document.createElement('div');
    cardTitle.classList.add('card-title');
    cardTitle.textContent = city;

    cardElement.appendChild(cardHeader);
    cardElement.appendChild(cardTitle);

    return cardElement;
  }
}
