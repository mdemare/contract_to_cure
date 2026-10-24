import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal DOM: records the game-over overlay and its text.
function fakeElement() {
  const classes = new Set();
  return {
    style: {},
    textContent: '',
    innerHTML: '',
    offsetWidth: 0,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    appendChild() {},
    setAttribute() {},
    remove() {}
  };
}

const overlay = fakeElement();
const dialogElements = {
  '.game-over-overlay': overlay,
  '.game-over-title': fakeElement(),
  '.game-over-subtitle': fakeElement(),
  '.game-over-reason': fakeElement()
};
const statElements = {
  'turns-stat': fakeElement(),
  'outbreaks-stat': fakeElement(),
  'cures-stat': fakeElement()
};

globalThis.window = {};
globalThis.document = {
  body: { appendChild() {} },
  createElement: () => fakeElement(),
  addEventListener() {},
  dispatchEvent() {},
  getElementById: id => statElements[id] ?? null,
  querySelector(selector) {
    if (selector === 'meta[name="csrf-token"]') return { getAttribute: () => 'csrf-token' };
    return dialogElements[selector] ?? null;
  },
  querySelectorAll: () => []
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.setTimeout = () => 0;
console.warn = () => {};
console.error = () => {};

const [utils, gameState] = await Promise.all([
  import('../../public/js/player_action_utils.js'),
  import('../../public/js/game_state.js')
]);

function diseaseCubes(curedColors = []) {
  return Object.fromEntries(['blue', 'yellow', 'black', 'red'].map(color =>
    [color, { cured: curedColors.includes(color), eradicated: false, inSupply: 24 }]
  ));
}

function finishedState({ reason, cured = [] }) {
  return {
    gameStatus: {
      phase: 'infect_cities', current_player_index: 0, turn: 7, outbreaks: 3,
      game_over: true, game_over_reason: reason
    },
    players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: [] }],
    diseaseCubes: diseaseCubes(cured)
  };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function resetOverlay() {
  overlay.classList.remove('visible', 'victory');
  overlay.style.display = 'none';
  dialogElements['.game-over-title'].textContent = '';
  dialogElements['.game-over-reason'].textContent = '';
}

test('reloading a finished game shows the game-over overlay with the saved reason', async () => {
  resetOverlay();
  globalThis.fetch = async url => {
    assert.equal(url, '/game_state.json');
    return jsonResponse(200, finishedState({ reason: 'no_cubes' }));
  };

  await gameState.loadGameState();

  assert.equal(overlay.classList.contains('visible'), true);
  assert.equal(overlay.style.display, 'flex');
  assert.equal(dialogElements['.game-over-title'].textContent, 'Game Over');
  assert.equal(dialogElements['.game-over-reason'].textContent, 'You ran out of disease cubes.');
});

test('discovering the fourth cure shows the victory overlay', async () => {
  resetOverlay();
  const won = finishedState({ reason: 'victory', cured: ['blue', 'yellow', 'black', 'red'] });
  won.gameStatus.phase = 'player_actions';
  globalThis.fetch = async url => {
    assert.equal(url, '/cure_disease');
    return jsonResponse(200, { status: 'success', message: 'Cured', game_state: won });
  };

  const succeeded = await utils.processAPIRequest('/cure_disease', { color: 'red' }, 'Cured', 'cure failed');

  assert.equal(succeeded, true);
  assert.equal(overlay.classList.contains('visible'), true);
  assert.equal(overlay.classList.contains('victory'), true);
  assert.equal(dialogElements['.game-over-title'].textContent, 'Victory!');
});

test('a game-over state can be loaded without the overlay until end-turn animations finish', async () => {
  resetOverlay();

  await gameState.loadGameState(finishedState({ reason: 'no_player_cards' }), { showGameOver: false });

  assert.equal(overlay.classList.contains('visible'), false);
});

test('an unfinished game shows no overlay', async () => {
  resetOverlay();
  const state = finishedState({ reason: null });
  state.gameStatus.game_over = false;

  await gameState.loadGameState(state);

  assert.equal(overlay.classList.contains('visible'), false);
});

test('a state with the camelCase gameStatus keys from before cc-492 still loads', async () => {
  resetOverlay();
  globalThis.fetch = async () => jsonResponse(200, {
    gameStatus: {
      phase: 'infect_cities', currentPlayerIndex: 0, turn: 7, outbreaks: 3,
      gameOver: true, gameOverReason: 'no_cubes', infectionRate: 2, infectionRatePosition: 0
    },
    players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: [] }],
    diseaseCubes: diseaseCubes()
  });

  const loaded = await gameState.loadGameState();

  assert.equal(gameState.getCurrentPlayer().role, 'medic');
  assert.equal(loaded.gameStatus.infection_rate, 2);
  assert.equal(loaded.gameStatus.infection_rate_position, 0);
  assert.equal(overlay.classList.contains('visible'), true);
  assert.equal(dialogElements['.game-over-reason'].textContent, 'You ran out of disease cubes.');
});
