import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal DOM: records notifications, dispatched events, and the game-over overlay.
function fakeElement() {
  const classes = new Set();
  return {
    style: {},
    textContent: '',
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

const notifications = [];
const dispatchedEvents = [];
const overlay = fakeElement();
const statElements = {
  'turns-stat': fakeElement(),
  'outbreaks-stat': fakeElement(),
  'cures-stat': fakeElement()
};

globalThis.window = {};
globalThis.document = {
  body: {
    appendChild(element) {
      const type = ['success', 'error', 'warning', 'info'].find(name => element.classList.contains(name));
      notifications.push({ type, message: element.textContent });
    }
  },
  createElement: () => fakeElement(),
  addEventListener() {},
  dispatchEvent(event) { dispatchedEvents.push(event); },
  getElementById: id => statElements[id] ?? null,
  querySelector(selector) {
    if (selector === 'meta[name="csrf-token"]') return { getAttribute: () => 'csrf-token', content: 'csrf-token' };
    if (selector === '.game-over-overlay') return overlay;
    if (selector.startsWith('.game-over-')) return fakeElement();
    return null;
  },
  querySelectorAll: () => []
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
// Notifications fade out on timers; keep tests from waiting on them.
globalThis.setTimeout = () => 0;
console.warn = () => {};
console.error = () => {};

const [utils, gameState, actionCardState, actionCardRequests, selectCards, gameOver] = await Promise.all([
  import('../../public/js/player_action_utils.js'),
  import('../../public/js/game_state.js'),
  import('../../public/js/action_card_state.js'),
  import('../../public/js/action_card_requests.js'),
  import('../../public/js/select_cards.js'),
  import('../../public/js/game_over.js')
]);

const staleState = {
  gameStatus: { phase: 'player_actions', currentPlayerIndex: 0, actionsRemaining: 4 },
  players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: [] }]
};
const persistedState = {
  gameStatus: { phase: 'player_actions', currentPlayerIndex: 0, actionsRemaining: 3 },
  players: [{ index: 0, role: 'medic', location: 'Chicago', hand: [] }]
};

function conflictBody(state = persistedState) {
  return { success: false, status: 'conflict', message: 'Game changed', game_state: state };
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

// Routes fetches by URL and records every request.
function mockFetch(routes) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch ${url}`);
    return route();
  };
  return requests;
}

async function reset() {
  notifications.length = 0;
  dispatchedEvents.length = 0;
  globalThis.fetch = async () => { throw new Error('fetch not mocked'); };
  await gameState.loadGameState(structuredClone(staleState));
  dispatchedEvents.length = 0;
}

function conflictNotifications() {
  return notifications.filter(n => n.message === utils.GAME_CONFLICT_MESSAGE);
}

test('processAPIRequest refreshes from the conflict game_state and shows a retry message', async () => {
  await reset();
  const requests = mockFetch({ '/move': () => jsonResponse(409, conflictBody()) });

  const succeeded = await utils.processAPIRequest(
    '/move',
    { player_index: 0, destination: 'Chicago' },
    'Moved to Chicago',
    'move failed',
    { playerIndex: 0, destination: 'Chicago' }
  );

  assert.equal(succeeded, false);
  assert.deepEqual(requests.map(r => r.url), ['/move']);
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.deepEqual(notifications, [{ type: 'warning', message: utils.GAME_CONFLICT_MESSAGE }]);
  assert.deepEqual(dispatchedEvents.map(e => e.type), ['gameStateLoaded']);
});

test('a conflict without a usable body reloads the persisted game state', async () => {
  await reset();
  const requests = mockFetch({
    '/treat': () => jsonResponse(409, new SyntaxError('Unexpected end of JSON input')),
    '/game_state.json': () => jsonResponse(200, persistedState)
  });

  const succeeded = await utils.processAPIRequest('/treat', {}, 'Treated', 'Treatment failed');

  assert.equal(succeeded, false);
  assert.deepEqual(requests.map(r => r.url), ['/treat', '/game_state.json']);
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.equal(conflictNotifications().length, 1);
});

test('non-conflict failures keep the generic message and leave local state alone', async () => {
  await reset();
  mockFetch({ '/pass': () => jsonResponse(500, { status: 'error' }) });

  const succeeded = await utils.processAPIRequest('/pass', {}, 'Passed', 'Pass failed');

  assert.equal(succeeded, false);
  assert.deepEqual(gameState.getCurrentGameState(), staleState);
  assert.equal(conflictNotifications().length, 0);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Pass failed \(500\)/);
});

test('processAPIRequest resolves true on success', async () => {
  await reset();
  mockFetch({
    '/pass': () => jsonResponse(200, { success: true, status: 'success', message: 'Passed', game_state: persistedState })
  });

  assert.equal(await utils.processAPIRequest('/pass', {}, 'Passed', 'Pass failed'), true);
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.deepEqual(notifications, [{ type: 'success', message: 'Passed' }]);
});

test('event cards report only the conflict, not their success message', async () => {
  await reset();
  actionCardState.setActionCardSource({ playerIndex: 0, cardIndex: 0 });
  mockFetch({ '/action_card': () => jsonResponse(409, conflictBody()) });

  await actionCardRequests.useAirlift('Chicago', 0);

  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.deepEqual(notifications, [{ type: 'warning', message: utils.GAME_CONFLICT_MESSAGE }]);
});

test('actionCardRequest refreshes state and rejects with GameConflictError', async () => {
  await reset();
  mockFetch({ '/action_card': () => jsonResponse(409, conflictBody()) });

  await assert.rejects(
    actionCardRequests.actionCardRequest({ card: 'Forecast' }, 'Failed to use Forecast card'),
    utils.GameConflictError
  );
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.equal(conflictNotifications().length, 1);
});

test('Forecast completion stays retryable after a conflict without an error notification', async () => {
  await reset();
  mockFetch({ '/action_card': () => jsonResponse(409, conflictBody()) });

  const completed = await actionCardRequests.completeForecast(['Paris', 'Tokyo']);

  assert.equal(completed, false);
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.deepEqual(notifications, [{ type: 'warning', message: utils.GAME_CONFLICT_MESSAGE }]);
});

test('hand-limit discard rejects on conflict so the mandatory dialog can retry', async () => {
  await reset();
  const requests = mockFetch({ '/discard_cards': () => jsonResponse(409, conflictBody()) });

  await assert.rejects(
    selectCards.submitHandLimitDiscard(0, ['Paris']),
    error => error instanceof utils.GameConflictError && /game changed/.test(error.message)
  );
  assert.deepEqual(requests.map(r => r.url), ['/discard_cards']);
  assert.deepEqual(gameState.getCurrentGameState(), persistedState);
  assert.equal(conflictNotifications().length, 1);
});

test('hand-limit discard still reloads state on success', async () => {
  await reset();
  const requests = mockFetch({
    '/discard_cards': () => jsonResponse(200, { success: true, status: 'success' }),
    '/game_state.json': () => jsonResponse(200, persistedState)
  });

  await selectCards.submitHandLimitDiscard(0, ['Paris']);

  assert.deepEqual(requests.map(r => r.url), ['/discard_cards', '/game_state.json']);
  assert.deepEqual(JSON.parse(requests[0].options.body), { player_index: 0, card_names: ['Paris'] });
  assert.equal(conflictNotifications().length, 0);
});

test('game-over restart conflict refreshes state and restores the dialog without reloading', async () => {
  await reset();
  let reloaded = false;
  globalThis.window.location = { reload() { reloaded = true; } };
  overlay.classList.add('visible');
  const overState = structuredClone(persistedState);
  overState.gameStatus.gameOver = true;
  mockFetch({ '/restart_game': () => jsonResponse(409, conflictBody(overState)) });

  await gameOver.restartGame();

  assert.equal(reloaded, false);
  assert.deepEqual(gameState.getCurrentGameState(), overState);
  assert.equal(overlay.classList.contains('visible'), true);
  assert.equal(overlay.style.display, 'flex');
  assert.deepEqual(notifications, [{ type: 'warning', message: utils.GAME_CONFLICT_MESSAGE }]);
});
