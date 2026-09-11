const DISEASE_COLORS = new Set(['blue', 'yellow', 'black', 'red']);

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Translate API card data into the labels and hooks shared by every card UI.
 * Disease color is always paired with text so color is never the only cue.
 */
export function getCardPresentation(card = {}) {
  const rawType = String(card.type || 'city').toLowerCase();
  const color = DISEASE_COLORS.has(String(card.color).toLowerCase())
    ? String(card.color).toLowerCase()
    : null;

  let type = rawType;
  if (rawType === 'action') type = 'event';
  if (rawType === 'epidemic') type = 'epidemic';

  const labels = {
    city: 'City',
    event: 'Event',
    epidemic: 'Epidemic',
    infection: 'Infection'
  };
  const typeLabel = labels[type] || titleCase(type);
  const familyLabel = color
    ? `${titleCase(color)} disease`
    : type === 'event'
      ? 'Special event'
      : type === 'epidemic'
        ? 'Player deck hazard'
        : typeLabel;

  return {
    type,
    typeLabel,
    familyLabel,
    color,
    name: String(card.name || 'Unknown card').replace(/^Action:\s*/i, '')
  };
}

/**
 * Add the common visual vocabulary to an otherwise purpose-specific card.
 */
export function decorateGameCard(element, card, { name } = {}) {
  const presentation = getCardPresentation(card);
  const displayName = name || presentation.name;

  element.classList.add('game-card', `game-card--${presentation.type}`);
  if (presentation.color) {
    element.classList.add(`game-card--${presentation.color}`);
  }
  element.dataset.cardType = presentation.type;

  const typeLabel = document.createElement('span');
  typeLabel.classList.add('game-card__type');
  typeLabel.textContent = presentation.typeLabel;

  const cardName = document.createElement('span');
  cardName.classList.add('card-name', 'game-card__name');
  cardName.textContent = displayName;

  const familyLabel = document.createElement('span');
  familyLabel.classList.add('game-card__family');
  familyLabel.textContent = presentation.familyLabel;

  element.appendChild(typeLabel);
  element.appendChild(cardName);
  element.appendChild(familyLabel);
  element.title = `${displayName} — ${presentation.typeLabel}, ${presentation.familyLabel}`;

  return presentation;
}
