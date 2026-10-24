import assert from 'node:assert/strict';
import test from 'node:test';

const gameOverDialog = { style: { display: 'flex' } };
const notifications = [];

globalThis.document = {
  body: {
    appendChild(element) {
      notifications.push(element);
    }
  },
  createElement() {
    const classes = [];
    return {
      textContent: '',
      classList: { add: (...names) => classes.push(...names), contains: name => classes.includes(name) }
    };
  },
  addEventListener() {},
  querySelector(selector) {
    if (selector === 'meta[name="csrf-token"]') return { content: 'csrf-token' };
    if (selector === '.game-over-dialog') return gameOverDialog;
    return null;
  }
};
globalThis.window = {};

const { restartGame, handleNewGame, handleLogin } = await import('../../public/js/menu.js');

test('successful menu restart reloads state once and dismisses the game-over dialog', async () => {
  let stateReloads = 0;
  let loadedState;
  let request;
  const newGame = { gameStatus: { phase: 'player_actions', turn: 1 } };

  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { success: true, status: 'success', message: 'Game restarted successfully', game_state: newGame };
      }
    };
  };

  const restarted = await restartGame('normal', async gameState => {
    stateReloads += 1;
    loadedState = gameState;
  });

  assert.equal(restarted, true);
  assert.equal(stateReloads, 1);
  assert.equal(loadedState, newGame);
  assert.equal(gameOverDialog.style.display, 'none');
  assert.deepEqual(request, {
    url: '/restart_game',
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token'
      },
      body: '{"difficulty_level":"normal"}',
      credentials: 'same-origin'
    }
  });
});

test('menu restart without a difficulty sends an empty body, keeping the current one', async () => {
  let body;
  globalThis.fetch = async (url, options) => {
    body = options.body;
    return { ok: true, async json() { return { success: true, game_state: {} }; } };
  };

  assert.equal(await restartGame(undefined, async () => {}), true);
  assert.equal(body, '{}');
});

// Stubs the menu elements closeMenu touches.
function stubMenuElements() {
  const menuToggle = { classList: { remove() {} }, setAttribute() {} };
  const dropdownMenu = { classList: { remove() {} } };
  document.getElementById = id => ({ 'menu-toggle': menuToggle, 'dropdown-menu': dropdownMenu })[id] || null;
}

for (const [current, chosen] of [['introductory', 'heroic'], ['heroic', 'introductory'], ['normal', 'normal']]) {
  test(`New Game offers the current ${current} difficulty and restarts with the chosen ${chosen}`, async () => {
    stubMenuElements();
    const offered = [];
    let body;
    globalThis.fetch = async (url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, async json() { return { success: true, game_state: {} }; } };
    };

    await handleNewGame({
      getState: async () => ({ gameStatus: { difficulty_level: current } }),
      choose: async offeredDifficulty => {
        offered.push(offeredDifficulty);
        return chosen;
      },
      restart: difficulty => restartGame(difficulty, async () => {})
    });

    assert.deepEqual(offered, [current]);
    assert.deepEqual(body, { difficulty_level: chosen });
  });
}

test('New Game defaults to heroic when the state has no difficulty', async () => {
  stubMenuElements();
  const offered = [];
  await handleNewGame({
    getState: async () => ({ gameStatus: {} }),
    choose: async difficulty => {
      offered.push(difficulty);
      return null;
    },
    restart: async () => assert.fail('restarted')
  });
  assert.deepEqual(offered, ['heroic']);
});

test('cancelling the New Game dialog does not restart', async () => {
  stubMenuElements();
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
  };

  await handleNewGame({ getState: async () => null, choose: async () => null });

  assert.equal(fetched, false);
});

test('menu restart conflict refreshes from the conflict state and keeps the game', async () => {
  const persistedState = { gameStatus: { phase: 'player_actions', game_over: true } };
  const loadedStates = [];
  gameOverDialog.style.display = 'flex';
  notifications.length = 0;
  globalThis.setTimeout = () => 0;
  console.warn = () => {};

  globalThis.fetch = async () => ({
    ok: false,
    status: 409,
    async json() {
      return { success: false, status: 'conflict', message: 'Game changed', game_state: persistedState };
    }
  });

  await assert.rejects(
    restartGame('heroic', async gameState => {
      loadedStates.push(gameState);
      return gameState;
    }),
    { name: 'GameConflictError' }
  );

  assert.deepEqual(loadedStates, [persistedState]);
  assert.equal(gameOverDialog.style.display, 'flex');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].classList.contains('warning'), true);
  assert.match(notifications[0].textContent, /game changed/i);
});

test('menu login navigates to GET /login instead of posting a form', () => {
  const menuToggle = { classList: { remove() {} }, setAttribute() {} };
  const dropdownMenu = { classList: { remove() {} } };
  document.getElementById = id => ({ 'menu-toggle': menuToggle, 'dropdown-menu': dropdownMenu })[id] || null;
  window.location = '/';
  notifications.length = 0;

  handleLogin();

  assert.equal(window.location, '/login');
  assert.equal(notifications.length, 0);
});
