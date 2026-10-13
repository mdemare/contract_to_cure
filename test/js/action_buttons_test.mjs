import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal DOM: just the end-of-turn buttons and the action bar.
function fakeButton(id) {
  const classes = new Set(['action-btn']);
  return {
    id,
    style: { display: 'none' },
    dataset: {},
    disabled: false,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    addEventListener() {},
    removeAttribute() {}
  };
}

const buttons = ['draw-cards-btn', 'infect-cities-btn'].map(fakeButton);
const byId = Object.fromEntries(buttons.map(button => [button.id, button]));

globalThis.window = {};
globalThis.document = {
  addEventListener() {},
  dispatchEvent() {},
  getElementById: id => byId[id] ?? null,
  querySelector: () => null,
  querySelectorAll: selector => {
    if (!selector.startsWith('.action-btn')) return [];
    const excluded = [...selector.matchAll(/:not\(#([\w-]+)\)/g)].map(match => match[1]);
    return buttons.filter(button => !excluded.includes(button.id));
  }
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
console.log = () => {};

const [actionButtons, gameStateModule] = await Promise.all([
  import('../../public/js/action_buttons.js'),
  import('../../public/js/game_state.js')
]);

function stateInPhase(phase) {
  return {
    players: [{ role: 'medic', location: 'Atlanta', hand: [] }],
    gameStatus: { currentPlayerIndex: 0, actions_remaining: 0, phase },
    researchStations: { locations: ['Atlanta'], available: 5 },
    decks: { discardPile: [] }
  };
}

async function showPhase(phase) {
  await gameStateModule.loadGameState(stateInPhase(phase), { promptPendingHandLimit: false, showGameOver: false });
  actionButtons.updateButtonStates();
}

for (const [returnPhase, buttonId] of [['infect_cities', 'infect-cities-btn'], ['draw_cards', 'draw-cards-btn']]) {
  test(`the ${buttonId} is enabled when a hand-limit discard returns to ${returnPhase}`, async () => {
    await showPhase('pending_discard');
    assert.equal(byId[buttonId].style.display, 'none');

    await showPhase(returnPhase);

    const button = byId[buttonId];
    assert.equal(button.style.display, 'flex');
    assert.equal(button.disabled, false);
    assert.equal(button.classList.contains('disabled'), false);
  });
}
