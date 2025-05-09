// end_turn_events.js
import { handleHandLimitCheck } from './select_cards.js';

// Function to get or create animation container
function getAnimContainer() {
  let animContainer = document.querySelector('.card-draw-animation-container');
  if (!animContainer) {
    animContainer = document.createElement('div');
    animContainer.classList.add('card-draw-animation-container');
    document.body.appendChild(animContainer);
  } else {
    // Clear any existing animations, but in a controlled way
    // We want to make sure we don't disrupt the DOM when other animations are ongoing
    const allCards = animContainer.querySelectorAll('.animated-card, .cards-wrapper, .header-container');
    allCards.forEach(elem => elem.remove());
  }
  return animContainer;
}

// Function to animate card draws
function startAnimationSequence(events) {
  // Get the animation container
  const animContainer = getAnimContainer();

  // Make container visible
  animContainer.style.display = 'flex';
  // Start the animation stack
  animateCardStack(animContainer, events.map((x) => x));
}

// Function to handle end of turn events
export function handleEndOfTurnEvents(endTurnData) {
  if (!endTurnData || !endTurnData.events || !Array.isArray(endTurnData.events)) {
    console.error('Invalid end turn data:', endTurnData);
    return;
  }

  // Group events by type and add headers
  const animationEvents = endTurnData.events.reduce((result, event) => {
    // First event of each type gets a header
    if (event.type === 'draw_card' && !result.hasPlayerHeader) {
      result.events.push({ type: 'header', message: 'Drawing Player Cards' });
      result.hasPlayerHeader = true;
    } else if (event.type === 'infect_city' && !result.hasInfectionHeader) {
      result.events.push({ type: 'header', message: 'Infecting Cities' });
      result.hasInfectionHeader = true;
    } else if ((event.type === 'increase_infection_rate' || event.type === 'infect_new_city') && !result.hasEpidemicHeader) {
      result.events.push({ type: 'header', message: 'Epidemic' });
      result.hasEpidemicHeader = true;
    }

    // Add the current event
    result.events.push(event);
    return result;
  }, { events: [], hasPlayerHeader: false, hasInfectionHeader: false, hasEpidemicHeader: false });

  // Special case: if there are no infection events but we have other events, add a "Quiet Night" header
  if (!animationEvents.hasInfectionHeader) {
    animationEvents.events.push({ type: 'header', message: 'A Quiet Night' });
  }

  // Start the animation sequence with all grouped events
  startAnimationSequence(animationEvents.events);
}

// Animate cards using a stack-based approach with staggered entry
function animateCardStack(animContainer, eventStack) {
  if (eventStack.length == 0) {
    // All cards have been animated
    setTimeout(() => {
      // Fade out animation for the container
      animContainer.style.opacity = '0';
      setTimeout(() => {
        animContainer.style.display = 'none';
        animContainer.style.opacity = '1'; // Reset for next time
      }, 800);
    }, 2000); // 2 seconds after last card is drawn
    return;
  }

  // Get the event to animate
  const eventToAnimate = eventStack.shift();
  const cardElement = createCardElement(eventToAnimate);

  // Handle headers differently than cards
  if (eventToAnimate.type === 'header') {
    // Don't clear the container, just manage what's inside
    // First, remove any existing headers
    const existingHeaders = animContainer.querySelectorAll('.event-header');
    existingHeaders.forEach(header => header.remove());

    // Create a dedicated header container if it doesn't exist
    let headerContainer = animContainer.querySelector('.header-container');
    if (!headerContainer) {
      headerContainer = document.createElement('div');
      headerContainer.classList.add('header-container');
      headerContainer.style.position = 'absolute';
      headerContainer.style.top = '100px';
      headerContainer.style.left = '0';
      headerContainer.style.width = '100%';
      headerContainer.style.display = 'flex';
      headerContainer.style.justifyContent = 'center';
      headerContainer.style.zIndex = '10';
      animContainer.appendChild(headerContainer);
    }

    // Add header to the dedicated container
    headerContainer.appendChild(cardElement);

    // Add drawing class with a small delay for a nice entrance effect
    setTimeout(() => {
      cardElement.classList.add('drawn');
    }, 50);

    // Longer delay after headers for readability
    setTimeout(() => {
      animateCardStack(animContainer, eventStack);
    }, 1500);
  } else {
    // Create a wrapper div to hold the cards in a fixed position
    // This prevents cards from moving when new ones are added
    let cardsWrapper = animContainer.querySelector('.cards-wrapper');
    if (!cardsWrapper) {
      cardsWrapper = document.createElement('div');
      cardsWrapper.classList.add('cards-wrapper');
      cardsWrapper.style.display = 'flex';
      cardsWrapper.style.position = 'relative';
      cardsWrapper.style.width = '100%';
      cardsWrapper.style.justifyContent = 'center';
      animContainer.appendChild(cardsWrapper);
    }

    // Position the new card absolutely to prevent pushing existing cards
    cardElement.style.position = 'absolute';
    // Calculate offset based on number of cards already shown (excluding headers)
    const cardCount = cardsWrapper.querySelectorAll('.animated-card').length;
    const offsetX = cardCount * 100; // Increased spacing to 100px between cards for less overlap
    cardElement.style.left = `calc(50% + ${offsetX}px - 90px)`; // Center offset

    // For cards, add to container first without the drawn class
    cardsWrapper.appendChild(cardElement);

    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      // Forces browser to recognize the element before animating it
      void cardElement.offsetWidth;

      // Add the drawn class to trigger the animation
      cardElement.classList.add('drawn');

      // Schedule the next card animation after this one completes
      setTimeout(() => {
        animateCardStack(animContainer, eventStack);
      }, 1000); // 1 second delay between cards
    });
  }
}

// Function to create a card element
function createCardElement(event) {
  // Using switch case for clarity and easier extension
  switch (event.type) {
    case 'draw_card': {
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
      // Remove "Event:" prefix if present in epidemic cards
      if (card.type === 'epidemic' && card.name.startsWith('Event:')) {
        cardTitle.textContent = card.name.replace('Event:', '');
      } else {
        cardTitle.textContent = card.name;
      }

      cardElement.appendChild(cardHeader);
      cardElement.appendChild(cardTitle);

      return cardElement;
    }

    case 'infect_city': {
      // Create an infection card with the new styling
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

    case 'increase_infection_rate': {
      const { new_rate } = event;

      const cardElement = document.createElement('div');
      cardElement.classList.add('animated-card', 'epidemic-event');

      // Card content
      const cardHeader = document.createElement('div');
      cardHeader.classList.add('card-header');
      cardHeader.textContent = 'Epidemic Effect';

      const cardTitle = document.createElement('div');
      cardTitle.classList.add('card-title');
      cardTitle.textContent = `Infection Rate Increased to ${new_rate}`;

      cardElement.appendChild(cardHeader);
      cardElement.appendChild(cardTitle);

      return cardElement;
    }

    case 'infect_new_city': {
      const { city, color, count, epidemic } = event;

      const cardElement = document.createElement('div');
      cardElement.classList.add('animated-card', 'infection-card', color);

      if (epidemic) {
        cardElement.classList.add('epidemic-infection');
      }

      // Card content
      const cardHeader = document.createElement('div');
      cardHeader.classList.add('card-header');
      cardHeader.textContent = epidemic ? 'Epidemic Infection' : 'Infection';

      const cardTitle = document.createElement('div');
      cardTitle.classList.add('card-title');
      cardTitle.textContent = city;

      const cardDetail = document.createElement('div');
      cardDetail.classList.add('card-detail');
      cardDetail.textContent = `${count} disease cube${count !== 1 ? 's' : ''}`;

      cardElement.appendChild(cardHeader);
      cardElement.appendChild(cardTitle);
      cardElement.appendChild(cardDetail);

      return cardElement;
    }

    case 'header': {
      const header = document.createElement('div');
      header.classList.add('event-header');
      header.textContent = event.message;

      // Add specific data attributes for styling based on header type
      if (event.message.includes('Drawing Player Cards')) {
        header.setAttribute('data-type', 'player');
      } else if (event.message.includes('Infecting Cities')) {
        header.setAttribute('data-type', 'infection');
      } else if (event.message.includes('Epidemic')) {
        header.setAttribute('data-type', 'epidemic');
      } else if (event.message.includes('Quiet Night')) {
        header.setAttribute('data-type', 'quiet');
      }

      return header;
    }

    default:
      console.warn('Unknown event type:', event.type, event);

      // Create a generic event card for unknown events
      const unknownCard = document.createElement('div');
      unknownCard.classList.add('animated-card', 'unknown-event');
      unknownCard.textContent = `Unknown event: ${event.type}`;
      return unknownCard;
  }
}
