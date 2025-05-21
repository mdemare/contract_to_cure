// dom_helpers.js

/**
 * Creates a card element based on the event data
 * @param {Object} event - The event data
 * @returns {HTMLElement} The card element
 */
export function createCardElement(event) {
  // Using switch case for clarity and easier extension
  switch (event.type) {
    case 'draw_card':
      return createDrawCardElement(event);
    case 'outbreak':
      return createOutbreakCardElement(event);
    case 'infect_city':
      return createInfectionCardElement(event);
    case 'increase_infection_rate':
      return createInfectionRateElement(event);
    case 'infect_new_city':
      return createNewInfectionElement(event);
    case 'header':
      return createHeaderElement(event);
    case 'quiet_night':
      return createQuietNightElement(event);
    case 'resilient_population':
      return createResilientPopulationElement(event);
    case 'wait_infect_cities':
      return createWaitInfectElement(event);
    default:
      return createUnknownEventElement(event);
  }
}
/**
 * Creates a draw card element
 * @param {Object} event - The draw card event data
 * @returns {HTMLElement} The draw card element
 */
function createDrawCardElement(event) {
  const { player, card } = event;

  // Determine the classes to add
  const classes = ['animated-card'];
  if (card.type === 'city') {
    classes.push('city-card', `card-${card.color}`);
  } else if (card.type === 'action') {
    classes.push('card-event');
  } else if (card.type === 'epidemic') {
    classes.push('card-epidemic');
  }

  // Create the card element with the determined classes
  const cardElement = createSimpleElement('div', classes);

  // Add card content
  appendCardContent(cardElement, card.type === 'city' ? 'City' : card.type, formatCardTitle(card));

  return cardElement;
}

/**
 * Creates an outbreak card element
 * @param {Object} event - The outbreak event data
 * @returns {HTMLElement} The outbreak card element
 */
function createOutbreakCardElement(event) {
  const { city, color } = event;
  const cardElement = createSimpleElement('div', ['animated-card', 'infection-card', color]);

  appendCardContent(cardElement, 'Outbreak', city);

  return cardElement;
}

/**
 * Creates an infection card element
 * @param {Object} event - The infection event data
 * @returns {HTMLElement} The infection card element
 */
function createInfectionCardElement(event) {
  const { city, color } = event;
  const cardElement = createSimpleElement('div', ['animated-card', 'infection-card', color]);

  appendCardContent(cardElement, 'Infection', city);

  return cardElement;
}

/**
 * Creates a quiet night element
 * @param {Object} event - The quiet night event data
 * @returns {HTMLElement} The quiet night element
 */
function createQuietNightElement(event) {
  // Create the base card element with quiet night styling
  const cardElement = createSimpleElement('div', ['animated-card', 'quiet-night-event']);

  // Add card header
  const cardHeader = createSimpleElement('div', 'card-header', 'Quiet Night');
  cardElement.appendChild(cardHeader);

  // Add card title - this could be empty or contain text like "No infections this turn"
  const cardTitle = createSimpleElement('div', 'card-title', 'No infections this turn');
  cardElement.appendChild(cardTitle);

  // Add additional detail element for more context
  const cardDetail = createSimpleElement('div', 'card-detail', 'Cities remain calm');

  // Style using object format
  Object.assign(cardDetail.style, {
    textAlign: 'center',
    fontSize: '14px',
    marginTop: '10px',
    color: '#7a4cb5',
    fontStyle: 'italic'
  });
  cardElement.appendChild(cardDetail);

  return cardElement;
}

/**
 * Creates a wait infect element
 * @param {Object} event - The wait infect event data
 * @returns {HTMLElement} The wait infect element
 */
function createWaitInfectElement(event) {
  // Create the base card element with wait infect styling
  const cardElement = createSimpleElement('div', ['animated-card', 'wait-infect-event']);

  // Add card header
  const cardHeader = createSimpleElement('div', 'card-header', 'Infection Phase');
  cardElement.appendChild(cardHeader);

  // Add card title
  const cardTitle = createSimpleElement('div', 'card-title', 'Press "Infect Cities" to continue');
  cardElement.appendChild(cardTitle);

  // Add additional detail element for more context
  const cardDetail = createSimpleElement('div', 'card-detail', 'Cities need to be infected');

  // Style using object format
  Object.assign(cardDetail.style, {
    textAlign: 'center',
    fontSize: '14px',
    marginTop: '10px',
    color: '#d32f2f',
    fontStyle: 'italic'
  });
  cardElement.appendChild(cardDetail);

  return cardElement;
}

/**
 * Creates an infection rate element
 * @param {Object} event - The infection rate event data
 * @returns {HTMLElement} The infection rate element
 */
function createInfectionRateElement(event) {
  const { new_rate } = event;
  const cardElement = createSimpleElement('div', ['animated-card', 'epidemic-event']);

  appendCardContent(cardElement, 'Epidemic Effect', `Infection Rate Increased to ${new_rate}`);

  return cardElement;
}

/**
 * Creates a new infection element
 * @param {Object} event - The new infection event data
 * @returns {HTMLElement} The new infection element
 */
function createNewInfectionElement(event) {
  const { city, color, count, epidemic } = event;

  const classes = ['animated-card', 'infection-card', color];
  if (epidemic) {
    classes.push('epidemic-infection');
  }

  const cardElement = createSimpleElement('div', classes);

  // Card content - directly append elements without local variables
  cardElement.appendChild(createSimpleElement('div', 'card-header', epidemic ? 'Epidemic Infection' : 'Infection'));
  cardElement.appendChild(createSimpleElement('div', 'card-title', city));
  cardElement.appendChild(createSimpleElement('div', 'card-detail', `${count} disease cube${count !== 1 ? 's' : ''}`));

  return cardElement;
}

/**
 * Creates a Resilient Population element
 * @param {Object} event - The resilient population event data
 * @returns {HTMLElement} The resilient population element
 */
function createResilientPopulationElement(event) {
  // Create the base card element with resilient population styling
  const cardElement = createSimpleElement('div', ['animated-card', 'resilient-population-event']);

  // Add card header
  const cardHeader = createSimpleElement('div', 'card-header', 'Resilient Population');
  cardElement.appendChild(cardHeader);

  // Add card title with the removed city if available
  const titleText = event.city ? `${event.city} removed from game` : 'City removed from game';
  const cardTitle = createSimpleElement('div', 'card-title', titleText);
  cardElement.appendChild(cardTitle);

  // Add additional detail element for more context
  const cardDetail = createSimpleElement('div', 'card-detail', 'Population now immune');

  // Style using object format
  Object.assign(cardDetail.style, {
    textAlign: 'center',
    fontSize: '14px',
    marginTop: '10px',
    color: '#ff8c42',
    fontStyle: 'italic'
  });
  cardElement.appendChild(cardDetail);

  return cardElement;
}

/**
 * Creates a header element
 * @param {Object} event - The header event data
 * @returns {HTMLElement} The header element
 */
function createHeaderElement(event) {
  const header = createSimpleElement('div', 'event-header', event.message);

  // Add specific data attributes for styling based on header type
  if (event.message.includes('Drawing Player Cards')) {
    header.setAttribute('data-type', 'player');
  } else if (event.message.includes('Infecting Cities')) {
    header.setAttribute('data-type', 'infection');
  } else if (event.message.includes('Epidemic')) {
    header.setAttribute('data-type', 'epidemic');
  } else if (event.message.includes('Quiet Night')) {
    header.setAttribute('data-type', 'quiet');
  } else if (event.message.includes('Resilient Population')) {
    header.setAttribute('data-type', 'resilient');
  }

  return header;
}

/**
 * Creates an unknown event element
 * @param {Object} event - The unknown event data
 * @returns {HTMLElement} The unknown event element
 */
/**
 * Creates a simple element with the given classes and text content
 * @param {string} elementType - The HTML element type to create
 * @param {string|Array} classes - CSS classes to add to the element
 * @param {string} textContent - Text content for the element
 * @returns {HTMLElement} The created element
 */
export function createSimpleElement(elementType, classes, textContent) {
  const element = document.createElement(elementType);

  if(classes) {
    const classesArr = Array.isArray(classes) ? classes : classes.split(" ")
    try {element.classList.add(...classesArr) } catch {
      console.log(classes)
      throw new Error("")
    }
  }

  if (textContent) {
    element.textContent = textContent;
  }

  return element;
}

function createUnknownEventElement(event) {
  console.warn('Unknown event type:', event.type, event);

  // Create a generic event card for unknown events using the helper function
  return createSimpleElement('div', ['animated-card', 'unknown-event'], `Unknown event: ${event.type}`);
}

/**
 * Helper function to format card title
 * @param {Object} card - The card data
 * @returns {string} The formatted card title
 */
function formatCardTitle(card) {
  // Remove "Event:" prefix if present in epidemic cards
  if (card.type === 'epidemic' && card.name.startsWith('Event:')) {
    return card.name.replace('Event:', '');
  }
  return card.name;
}

/**
 * Helper function to append header and title content to a card element
 * @param {HTMLElement} cardElement - The card element
 * @param {string} headerText - The header text
 * @param {string} titleText - The title text
 */
function appendCardContent(cardElement, headerText, titleText) {
  const cardHeader = createSimpleElement('div', 'card-header', headerText);
  const cardTitle = createSimpleElement('div', 'card-title', titleText);

  cardElement.appendChild(cardHeader);
  cardElement.appendChild(cardTitle);
}
