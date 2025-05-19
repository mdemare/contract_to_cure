// end_turn_events.js
import { createCardElement, createSimpleElement } from './dom.js';

/**
 * Creates a Promise that resolves after the specified delay
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise} Promise that resolves after the delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    if (eventToAnimate.exceeded_hand_limit) {
      const nrCardsToDiscard = eventToAnimate.discard_count;
      const playerIndex = eventToAnimate.player_index;

      // First handle the card animation
      handleCardAnimation(animContainer, cardElement, [], false); // Pass empty array to prevent recursion

      // Import the select_cards module dynamically to avoid circular dependencies
      import('./select_cards.js').then(selectCardsModule => {
        // After animation completes, show the discard dialog
        setTimeout(() => {
          // Use the handleHandLimitCheck with a callback that continues the animation sequence
          selectCardsModule.handleHandLimitCheck(playerIndex, nrCardsToDiscard, () => {
            // Continue with the remaining animation stack after player has discarded
            animateCardStack(animContainer, eventStack);
          });
        }, 1200); // Give enough time for the card animation to complete
      }).catch(error => {
        console.error('Failed to import select_cards module:', error);
        // Continue with remaining animations even if there's an error
        animateCardStack(animContainer, eventStack);
      });
    } else {
      handleCardAnimation(animContainer, cardElement, eventStack);
    }
  }
}

/**
 * Handles header animation with Promise-based delays
 * @param {HTMLElement} animContainer - The animation container
 * @param {HTMLElement} cardElement - The card element to animate
 * @param {Array} eventStack - Remaining events to animate
 * @returns {Promise} Promise that resolves when animation completes
 */
async function handleHeaderAnimation(animContainer, cardElement, eventStack) {
  // Existing setup code stays the same
  const existingHeaders = animContainer.querySelectorAll('.event-header');
  existingHeaders.forEach(header => header.remove());

  let headerContainer = animContainer.querySelector('.header-container');
  if (!headerContainer) {
    headerContainer = createHeaderContainer();
    animContainer.appendChild(headerContainer);
  }

  headerContainer.appendChild(cardElement);

  // Replace setTimeout with await delay
  await delay(50);
  cardElement.classList.add('drawn');

  // Replace the recursive setTimeout with await delay
  await delay(1000);

  // Return to original behavior for now (will be updated in next phase)
  animateCardStack(animContainer, eventStack);
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

/**
 * Handles card animation with Promise-based delays
 * @param {HTMLElement} animContainer - The animation container
 * @param {HTMLElement} cardElement - The card element to animate
 * @param {Array} eventStack - Remaining events to animate
 * @param {boolean} continueAnimation - Whether to continue animation
 * @returns {Promise} Promise that resolves when animation completes
 */
async function handleCardAnimation(animContainer, cardElement, eventStack, continueAnimation = true) {
  // Existing setup code stays the same
  let cardsWrapper = animContainer.querySelector('.cards-wrapper');
  if (!cardsWrapper) {
    cardsWrapper = createCardsWrapper();
    animContainer.appendChild(cardsWrapper);
  }

  cardElement.style.position = 'absolute';
  const cardCount = cardsWrapper.querySelectorAll('.animated-card').length;

  const isInfectionCard = cardElement.classList.contains('infection-card');
  const offsetX = cardCount * 100;

  if (isInfectionCard) {
    cardElement.style.left = `calc(50% + ${offsetX}px - 125px)`;
    cardElement.style.transitionDuration = '1.2s';
  } else {
    cardElement.style.left = `calc(50% + ${offsetX}px - 90px)`;
  }

  cardsWrapper.appendChild(cardElement);

  // Force browser to recognize element (keep this synchronous)
  void cardElement.offsetWidth;
  cardElement.classList.add('drawn');

  // Replace setTimeout with await delay, but keep original behavior for now
  if (continueAnimation) {
    await delay(1000);
    animateCardStack(animContainer, eventStack);
  }
}
