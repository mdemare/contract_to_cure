// Difficulty levels the backend accepts as difficulty_level on POST /restart_game.
import { createSimpleElement } from './dom.js';
import { openCardModal } from './modal_focus.js';

export const DIFFICULTY_LEVELS = [
  { value: 'introductory', label: 'Introductory', epidemics: 4 },
  { value: 'normal', label: 'Normal', epidemics: 5 },
  { value: 'heroic', label: 'Heroic', epidemics: 6 }
];

// The backend's default for games that never chose one.
export const DEFAULT_DIFFICULTY = 'heroic';

export function isDifficulty(value) {
  return DIFFICULTY_LEVELS.some(level => level.value === value);
}

export function difficultyLabel(value) {
  return DIFFICULTY_LEVELS.find(level => level.value === value)?.label || 'Unknown';
}

// The difficulty of a game state, or the default when it is missing.
export function gameDifficulty(gameState) {
  const value = gameState?.gameStatus?.difficulty_level;
  return isDifficulty(value) ? value : DEFAULT_DIFFICULTY;
}

// A <select> of the difficulty levels with the given one selected.
export function createDifficultySelect(selected = DEFAULT_DIFFICULTY) {
  const select = createSimpleElement('select', 'difficulty-select');
  for (const level of DIFFICULTY_LEVELS) {
    const option = createSimpleElement('option', null, `${level.label} (${level.epidemics} epidemics)`);
    option.value = level.value;
    select.appendChild(option);
  }
  select.value = isDifficulty(selected) ? selected : DEFAULT_DIFFICULTY;
  return select;
}

// Asks for confirmation and a difficulty before a new game. Resolves to the
// chosen difficulty, or null when the player cancels.
export function chooseNewGameDifficulty(current) {
  return new Promise(resolve => {
    const backdrop = createSimpleElement('div', 'modal-backdrop');
    const dialog = createSimpleElement('div', ['modal-content', 'card-selection-modal', 'new-game-modal']);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'new-game-modal-title');

    const title = createSimpleElement('h3', null, 'Start a New Game?');
    title.id = 'new-game-modal-title';
    dialog.appendChild(title);
    dialog.appendChild(createSimpleElement('p', 'modal-instructions',
      'Your current progress will be lost.'));

    const label = createSimpleElement('label', 'difficulty-choice', 'Difficulty ');
    const select = createDifficultySelect(current);
    label.appendChild(select);
    dialog.appendChild(label);

    const buttons = createSimpleElement('div', 'modal-buttons');
    const cancel = createSimpleElement('button', 'cancel-btn', 'Cancel');
    const start = createSimpleElement('button', 'confirm-btn', 'Start New Game');
    cancel.type = 'button';
    start.type = 'button';
    buttons.appendChild(cancel);
    buttons.appendChild(start);
    dialog.appendChild(buttons);
    backdrop.appendChild(dialog);

    const finish = choice => {
      closeModal();
      resolve(choice);
    };
    cancel.addEventListener('click', () => finish(null));
    start.addEventListener('click', () => finish(select.value));

    const closeModal = openCardModal(backdrop, dialog, {
      initialFocus: select,
      onCancel: () => finish(null)
    });
  });
}
