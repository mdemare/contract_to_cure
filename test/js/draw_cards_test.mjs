import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Minimal DOM: records notifications and lets the draw animation run.
function fakeElement(tagName = 'div') {
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(),
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    offsetWidth: 0,
    children: [],
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child) { this.children.push(child); return child; },
    addEventListener() {},
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    remove() {}
  };
}

const notifications = [];
globalThis.window = {};
globalThis.document = {
  body: {
    appendChild(child) {
      if (child.classList.contains('game-notification')) notifications.push(child);
      return child;
    }
  },
  createElement: tagName => fakeElement(tagName),
  addEventListener() {},
  dispatchEvent() {},
  getElementById: () => null,
  querySelector(selector) {
    if (selector === 'meta[name="csrf-token"]') return { getAttribute: () => 'csrf-token' };
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
// Run animation delays immediately; notification fade-out timers are skipped.
globalThis.setTimeout = (callback, ms) => {
  if (ms < 3000) queueMicrotask(callback);
  return 0;
};
globalThis.requestAnimationFrame = callback => { queueMicrotask(callback); return 0; };
console.warn = () => {};
console.error = () => {};

const [utils, gameState] = await Promise.all([
  import('../../public/js/player_action_utils.js'),
  import('../../public/js/game_state.js')
]);

const scenario = JSON.parse(readFileSync(
  new URL('../../testdata/contract/scenarios/draw_cards/scenario.json', import.meta.url)
));

test('drawing cards with the contract response refreshes the state without an error', async () => {
  const response = scenario.response;
  globalThis.fetch = async url => {
    assert.equal(url, '/draw_cards');
    return { status: response.status, ok: true, json: async () => structuredClone(response.body) };
  };

  const succeeded = await utils.processAPIRequest('/draw_cards', {}, 'Cards drawn', 'Draw failed');

  assert.deepEqual(notifications.filter(n => n.classList.contains('error')).map(n => n.textContent), []);
  assert.equal(succeeded, true);
  assert.equal(gameState.getCurrentGameState().gameStatus.phase, 'infect_cities');
});
