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

const gameState = await import('../../public/js/game_state.js');

function city(name) {
  return { name, type: 'city', color: 'blue' };
}

function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
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

// Let the async submission, state refresh, and dialog close settle.
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function reset(state) {
  document.body.children.forEach(child => { child.parentNode = null; });
  document.body.children = [];
  await gameState.loadGameState(structuredClone(state), { promptPendingHandLimit: false });
}

// Exercise the live event-card menu and general picker together.
async function openResilientPopulation(t) {
  const phaseActions = document.body.appendChild(new FakeElement('div'));
  t.mock.method(document, 'getElementById', id =>
    document.body.descendants().find(element => element.id === id) ?? null);
  const querySelector = document.querySelector;
  t.mock.method(document, 'querySelector', selector =>
    selector === '.phase-actions' ? phaseActions : querySelector(selector));
  const { initActionCardsButton } = await import('../../public/js/action_cards.js');
  initActionCardsButton();
  document.getElementById('action-cards-btn').click();
  clickCard(openDialogs()[0], 'Resilient Population');
  assert.equal(openDialogs().length, 1);
  const dialog = openDialogs()[0];
  assert.equal(dialog.descendants().some(element => element.classList.contains('card-selection-container')), true);
  return dialog;
}

function resilientPopulationState() {
  return {
    gameStatus: { phase: 'player_actions', current_player_index: 0 },
    players: [{ index: 0, hand: [
      city('Atlanta'),
      { name: 'Resilient Population', type: 'action', index: 7 }
    ] }],
    // Indexes deliberately differ from positions: the workflow must use array positions.
    decks: { infectionDiscardPile: [
      { ...city('Paris'), index: 12 },
      { ...city('London'), index: 25 }
    ] }
  };
}

test('Resilient Population menu selection submits the chosen city and refreshes state', async t => {
  await reset(resilientPopulationState());
  const refreshed = resilientPopulationState();
  refreshed.players[0].hand.pop();
  refreshed.decks.infectionDiscardPile.pop();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return jsonResponse(200, url === '/action_card' ? { status: 'success' } : refreshed);
  };
  const loaded = t.mock.method(document, 'dispatchEvent');
  const dialog = await openResilientPopulation(t);
  assert.deepEqual(cardNames(dialog), ['Paris', 'London']);
  clickCard(dialog, 'London');
  await settle();

  assert.equal(openDialogs().length, 0);
  assert.deepEqual(requests.map(request => request.url), ['/action_card', '/game_state.json']);
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), { city: 'London', card: 'Resilient Population' });
  assert.deepEqual(gameState.getCurrentGameState(), refreshed);
  assert.equal(loaded.mock.calls.some(call =>
    call.arguments[0].type === 'gameStateLoaded' && call.arguments[0].detail.gameState === refreshed), true);
});

for (const cancel of ['button', 'Escape']) {
  test(`Resilient Population ${cancel} cancellation closes the general picker without submitting`, async t => {
    const state = resilientPopulationState();
    await reset(state);
    const requests = [];
    globalThis.fetch = async url => { requests.push(url); };
    const listeners = t.mock.method(document, 'addEventListener');
    const dialog = await openResilientPopulation(t);
    if (cancel === 'button') {
      dialog.descendants().find(element => element.classList.contains('cancel-btn')).click();
    } else {
      const keydown = listeners.mock.calls.find(call => call.arguments[0] === 'keydown').arguments[1];
      keydown({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    }
    assert.equal(openDialogs().length, 0);
    assert.deepEqual(requests, []);
    assert.deepEqual(gameState.getCurrentGameState(), state);
  });
}
