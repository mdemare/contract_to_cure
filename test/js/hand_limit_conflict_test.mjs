import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal DOM that can render, click, and close card selection dialogs.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.textContent = '';
    this.disabled = false;
    this.tabIndex = this.tagName === 'BUTTON' ? 0 : -1;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => (force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name),
      contains: name => classes.has(name)
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node === document.body;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  click() { (this.listeners.click || []).forEach(listener => listener({ target: this })); }
  focus() { document.activeElement = this; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest() { return null; }
  matches(selector) { return selector === ':disabled' && this.disabled; }
  getClientRects() { return [{}]; }

  descendants() {
    return this.children.flatMap(child => [child, ...child.descendants()]);
  }

  querySelectorAll(selector) {
    return this.descendants().filter(element =>
      selector.split(',').some(part => element.tagName === part.trim().toUpperCase()));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

globalThis.window = {};
globalThis.document = {
  body: new FakeElement('body'),
  activeElement: null,
  createElement: tagName => new FakeElement(tagName),
  addEventListener() {},
  removeEventListener() {},
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
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ visibility: 'visible' });
globalThis.setTimeout = () => 0;
console.warn = () => {};
console.error = () => {};

const [gameState, selectCards] = await Promise.all([
  import('../../public/js/game_state.js'),
  import('../../public/js/select_cards.js')
]);

function city(name) {
  return { name, type: 'city', color: 'blue' };
}

const eightCards = ['Atlanta', 'Chicago', 'Montreal', 'New York', 'Washington', 'London', 'Madrid', 'Paris']
  .map(city);

function pendingState(hand, discardCount = hand.length - 7) {
  return {
    gameStatus: {
      phase: 'pending_discard',
      current_player_index: 0,
      pending_hand_limit: { player_index: 0, discard_count: discardCount, return_phase: 'draw_cards' }
    },
    players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: hand.map((card, index) => ({ ...card, index })) }]
  };
}

const resolvedState = {
  gameStatus: { phase: 'draw_cards', current_player_index: 0, pending_hand_limit: null },
  players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: eightCards.slice(1) }]
};

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function conflictWith(state) {
  return jsonResponse(409, { success: false, status: 'conflict', message: 'Game changed', game_state: state });
}

function openDialogs() {
  return document.body.children.filter(element => element.classList.contains('modal-backdrop'));
}

function cardNames(dialog) {
  return dialog.descendants()
    .filter(element => element.classList.contains('selectable-card'))
    .map(card => card.descendants().find(child => child.classList.contains('card-name')).textContent);
}

function clickCard(dialog, name) {
  dialog.descendants()
    .filter(element => element.classList.contains('selectable-card'))
    .find(card => card.descendants().some(child =>
      child.classList.contains('card-name') && child.textContent === name))
    .click();
}

// Lets the async submission, conflict refresh, and dialog close settle.
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function reset(state) {
  document.body.children.forEach(child => { child.parentNode = null; });
  document.body.children = [];
  await gameState.loadGameState(structuredClone(state), { promptPendingHandLimit: false });
}

test('mandatory discard closes and completes when a conflict shows the discard was already resolved', async () => {
  await reset(pendingState(eightCards));
  globalThis.fetch = async () => conflictWith(resolvedState);
  let completed = 0;

  selectCards.handleHandLimitCheck(0, 1, () => { completed++; });
  assert.equal(openDialogs().length, 1);
  clickCard(openDialogs()[0], 'Paris');
  await settle();

  assert.equal(openDialogs().length, 0);
  assert.equal(completed, 1);
});

test('mandatory discard rebuilds from the refreshed hand when the pending discard changed', async () => {
  await reset(pendingState(eightCards));
  const refreshedHand = [...eightCards.slice(1), city('Essen'), city('Milan')];
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push(JSON.parse(options.body));
    return requests.length === 1
      ? conflictWith(pendingState(refreshedHand))
      : jsonResponse(200, { success: true, status: 'success' });
  };
  let completed = 0;

  selectCards.handleHandLimitCheck(0, 1, () => { completed++; });
  clickCard(openDialogs()[0], 'Atlanta');
  await settle();

  assert.equal(openDialogs().length, 1);
  assert.equal(completed, 0);
  const rebuilt = openDialogs()[0];
  assert.deepEqual(cardNames(rebuilt), refreshedHand.map(card => card.name));
  assert.match(rebuilt.descendants().find(element => element.tagName === 'H3').textContent, /discard 2 cards/);
});

test('mandatory discard stays open for retry when the refreshed discard is unchanged', async () => {
  await reset(pendingState(eightCards));
  globalThis.fetch = async () => conflictWith(pendingState(eightCards));
  let completed = 0;

  selectCards.handleHandLimitCheck(0, 1, () => { completed++; });
  clickCard(openDialogs()[0], 'Paris');
  await settle();

  assert.equal(openDialogs().length, 1);
  assert.equal(completed, 0);
  assert.deepEqual(cardNames(openDialogs()[0]), eightCards.map(card => card.name));
});

function assertNotificationLifecycle(t, message, type, cssClass = 'game-notification') {
  const notifications = document.body.children.filter(element => element.classList.contains(cssClass));
  assert.equal(notifications.length, 1);
  const notification = notifications[0];
  assert.equal(notification.textContent, message);
  assert.equal(notification.tagName, 'DIV');
  assert.equal(notification.classList.contains(type), true);
  assert.equal(notification.children.length, 0);
  t.mock.timers.tick(2999);
  assert.equal(notification.classList.contains('fade-out'), false);
  assert.equal(notification.isConnected, true);
  t.mock.timers.tick(1);
  assert.equal(notification.classList.contains('fade-out'), true);
  t.mock.timers.tick(499);
  assert.equal(notification.isConnected, true);
  t.mock.timers.tick(1);
  assert.equal(notification.isConnected, false);
}

test('action message helpers preserve text, severity, reporting and lifetime', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = t.mock.method(console, 'error');
  const warnings = t.mock.method(console, 'warn');
  const { showErrorMessage, showInvalidActionMessage, showSuccessMessage } =
    await import('../../public/js/player_action_utils.js');
  for (const [show, message, type] of [
    [showErrorMessage, 'Action failed: <b>Rejected</b>', 'error'],
    [showInvalidActionMessage, '<b>Rejected</b>', 'warning'],
    [showSuccessMessage, '<b>Rejected</b>', 'success']
  ]) {
    await reset(resolvedState);
    show('<b>Rejected</b>');
    assertNotificationLifecycle(t, message, type);
  }
  assert.deepEqual(errors.mock.calls.map(call => call.arguments), [['Action failed: <b>Rejected</b>']]);
  assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [['<b>Rejected</b>']]);
});

test('game-over restart failure preserves its notification and reporting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = t.mock.method(console, 'error');
  await reset(resolvedState);
  globalThis.fetch = async () => jsonResponse(500, {});
  const { restartGame } = await import('../../public/js/game_over.js');
  await restartGame();
  const message = 'Failed to restart game: Failed to restart game';
  assertNotificationLifecycle(t, message, 'error');
  assert.equal(errors.mock.calls.filter(call => call.arguments[0] === message).length, 1);
  assert.equal(errors.mock.calls[0].arguments[0], 'Error restarting game:');
  assert.equal(errors.mock.calls.length, 2);
});

test('successful mandatory discard preserves singular/plural success text and lifetime without reporting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = t.mock.method(console, 'error');
  const warnings = t.mock.method(console, 'warn');
  for (const count of [1, 2]) {
    await reset(pendingState([...eightCards, city('Essen')], count));
    globalThis.fetch = async url => jsonResponse(200, url === '/game_state.json' ? resolvedState : {});
    let completed = 0;
    selectCards.handleHandLimitCheck(0, count, () => { completed++; });
    const dialog = openDialogs()[0];
    clickCard(dialog, 'Paris');
    if (count === 2) {
      clickCard(dialog, 'Essen');
      dialog.descendants().find(element => element.classList.contains('confirm-btn')).click();
    }
    await settle();
    assert.equal(completed, 1);
    assert.equal(openDialogs().length, 0);
    assertNotificationLifecycle(t, `medic discarded ${count} card${count > 1 ? 's' : ''}`, 'success');
  }
  assert.equal(errors.mock.calls.length, 0);
  assert.equal(warnings.mock.calls.length, 0);
});

test('share-knowledge workflow errors preserve their separate CSS class and reporting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = t.mock.method(console, 'error');
  await reset(resolvedState);
  globalThis.fetch = async url => jsonResponse(200,
    url === '/cities.json' ? { Paris: { color: 'blue' } } :
      { status: 'success', game_state: resolvedState, message: 'Shared Paris' });
  await gameState.loadCities();
  const { showShareKnowledgeModal } = await import('../../public/js/share_knowledge.js');
  errors.mock.resetCalls();
  // A failure notifying listeners after a successful share reaches the share-specific catch.
  t.mock.method(document, 'dispatchEvent', event => {
    if (event.type === 'actionModeReset') throw new Error('<b>Listener failed</b>');
  });
  showShareKnowledgeModal([{ cardName: 'Paris', action: 'give' }], [{ index: 1, role: 'scientist' }]);
  openDialogs()[0].descendants().find(element => element.classList.contains('share-btn')).click();
  await settle();
  const message = 'Action failed: Failed to share knowledge: <b>Listener failed</b>';
  assertNotificationLifecycle(t, message, 'error', 'share-notification');
  assert.deepEqual(errors.mock.calls.map(call => call.arguments), [[message]]);
});
