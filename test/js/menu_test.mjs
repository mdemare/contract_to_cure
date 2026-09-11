import assert from 'node:assert/strict';
import test from 'node:test';

const gameOverDialog = { style: { display: 'flex' } };

globalThis.document = {
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
