import assert from 'node:assert/strict';
import test from 'node:test';

const userName = { textContent: '' };
const userEmail = { textContent: '' };
const authInfo = {
  style: {},
  querySelector: selector => ({ '.user-name-menu': userName, '.user-email': userEmail })[selector]
};
const login = { style: {} };
const logout = { style: {} };
const loadedEvents = [];

globalThis.window = {};
globalThis.document = {
  body: { appendChild() {} },
  createElement: () => ({ classList: { add() {} } }),
  addEventListener() {},
  dispatchEvent: event => loadedEvents.push(event),
  getElementById: id => ({
    'auth-info-menu': authInfo,
    'login-menu-btn': login,
    'logout-menu-btn': logout
  })[id] ?? null,
  querySelector(selector) {
    if (selector === 'meta[name="csrf-token"]') {
      return { content: 'csrf-token', getAttribute: () => 'csrf-token' };
    }
    return null;
  }
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.setTimeout = () => 0;
console.warn = () => {};

const { loadGameState, getCurrentGameState } = await import('../../public/js/game_state.js');
const { processAPIRequest } = await import('../../public/js/player_action_utils.js');
const { restartGame } = await import('../../public/js/menu.js');

const firstUser = { uid: '1', name: 'Alice', email: 'alice@example.com' };
const laterUser = { uid: '2', name: 'Bob', email: 'bob@example.com' };
const snapshot = turn => ({ gameStatus: { phase: 'player_actions', game_over: false, turn } });
const jsonResponse = (status, body) => ({
  status, ok: status >= 200 && status < 300, json: async () => body
});

function assertIdentity(user) {
  assert.equal(window.currentUser, user);
  assert.equal(authInfo.style.display, user ? 'block' : 'none');
  assert.equal(login.style.display, user ? 'none' : 'block');
  assert.equal(logout.style.display, user ? 'block' : 'none');
  if (user) {
    assert.equal(userName.textContent, user.name);
    assert.equal(userEmail.textContent, user.email);
  }
}

async function bootstrap(user) {
  const state = { ...snapshot(1), current_user: user };
  globalThis.fetch = async url => {
    assert.equal(url, '/game_state.json');
    return jsonResponse(200, state);
  };
  assert.equal(await loadGameState(), state);
  assertIdentity(user);
}

test('GET bootstrap applies explicit identity, sign-out, and a later user', async () => {
  await bootstrap(firstUser);
  await bootstrap(null);
  await bootstrap(laterUser);
});

for (const path of ['action', 'restart', 'conflict']) {
  test(`${path} applies the game-only snapshot and preserves session identity`, async () => {
    await bootstrap(firstUser);
    const state = snapshot(2);
    loadedEvents.length = 0;
    globalThis.fetch = async url => {
      assert.equal(url, path === 'restart' ? '/restart_game' : '/treat');
      return jsonResponse(path === 'conflict' ? 409 : 200, {
        success: path !== 'conflict',
        status: path === 'conflict' ? 'conflict' : 'success',
        game_state: state
      });
    };

    if (path === 'restart') {
      assert.equal(await restartGame('normal'), true);
    } else {
      assert.equal(await processAPIRequest('/treat', {}, 'Treated', 'Failed'), path === 'action');
    }

    assert.equal(getCurrentGameState(), state);
    assert.equal(loadedEvents.length, 1);
    assert.equal(loadedEvents[0].type, 'gameStateLoaded');
    assert.equal(loadedEvents[0].detail.gameState, state);
    assertIdentity(firstUser);

    await loadGameState({ ...snapshot(3), current_user: null });
    assertIdentity(null);
    await loadGameState({ ...snapshot(4), current_user: laterUser });
    assertIdentity(laterUser);
  });
}
