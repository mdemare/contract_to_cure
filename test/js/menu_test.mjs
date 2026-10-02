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

const { restartGame } = await import('../../public/js/menu.js');

test('successful menu restart reloads state once and dismisses the game-over dialog', async () => {
  let stateReloads = 0;
  let request;

  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { success: true };
      }
    };
  };

  const restarted = await restartGame(async () => {
    stateReloads += 1;
  });

  assert.equal(restarted, true);
  assert.equal(stateReloads, 1);
  assert.equal(gameOverDialog.style.display, 'none');
  assert.deepEqual(request, {
    url: '/restart_game',
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token'
      },
      credentials: 'same-origin'
    }
  });
});

test('menu restart conflict refreshes from the conflict state and keeps the game', async () => {
  const persistedState = { gameStatus: { phase: 'player_actions', gameOver: true } };
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
    restartGame(async gameState => {
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
