// end_turn_events.js
import { createCardElement, createSimpleElement } from './dom.js';

/**
 * Creates a header container element
 * @returns {HTMLElement} The header container element
 */
function createHeaderContainer() {
  const headerContainer = createSimpleElement('div', 'header-container');
  Object.assign(headerContainer.style, {
    position: 'absolute',
    top: '100px',
    left: '0',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    zIndex: '10'
  });
  return headerContainer;
}

/**
 * Creates and returns an animation container or retrieves the existing one
 * @returns {HTMLElement} The animation container element
 */
function getAnimContainer() {
  let animContainer = document.querySelector('.card-draw-animation-container');
  if (!animContainer) {
    animContainer = createSimpleElement('div', 'card-draw-animation-container');
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
      }, 600);
    }, 1200); // 2 seconds after last card is drawn
    return;
  }

  // Get the event to animate
  const eventToAnimate = eventStack.shift();
  const cardElement = createCardElement(eventToAnimate);

  // Handle headers differently than cards
  if (eventToAnimate.type === 'header') {
    handleHeaderAnimation(animContainer, cardElement, eventStack);
  } else {
    handleCardAnimation(animContainer, cardElement, eventStack);
  }
}

// Function to handle header animations
function handleHeaderAnimation(animContainer, cardElement, eventStack) {
  // Don't clear the container, just manage what's inside
  // First, remove any existing headers
  const existingHeaders = animContainer.querySelectorAll('.event-header');
  existingHeaders.forEach(header => header.remove());

  // Create a dedicated header container if it doesn't exist
  let headerContainer = animContainer.querySelector('.header-container');
  if (!headerContainer) {
    headerContainer = createHeaderContainer();
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
  }, 1000);
}

/**
 * Creates a cards wrapper element
 * @returns {HTMLElement} The cards wrapper element
 */
function createCardsWrapper() {
  const cardsWrapper = createSimpleElement('div', 'cards-wrapper');
  Object.assign(cardsWrapper.style, {
    display: 'flex',
    position: 'relative',
    width: '100%',
    justifyContent: 'center'
  });
  return cardsWrapper;
}

// Function to handle card animations
function handleCardAnimation(animContainer, cardElement, eventStack) {
  // Create a wrapper div to hold the cards in a fixed position
  // This prevents cards from moving when new ones are added
  let cardsWrapper = animContainer.querySelector('.cards-wrapper');
  if (!cardsWrapper) {
    cardsWrapper = createCardsWrapper();
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
