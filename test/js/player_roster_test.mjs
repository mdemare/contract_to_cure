import assert from 'node:assert/strict';
import test from 'node:test';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...classes) {
    classes.forEach(className => this.values.add(className));
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.hidden = false;
    this.listeners = {};
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }

  set innerHTML(value) {
    assert.equal(value, '');
    this.children = [];
    this._textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  click() {
    this.listeners.click?.();
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const matches = [];

    for (const child of this.children) {
      if (className && child.classList.contains(className)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }

    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

globalThis.document = {
  createElement: tagName => new FakeElement(tagName)
};

const { createPlayerRosterContainer, renderPlayerRoster } = await import('../../public/js/player_roster.js');

function largeHand(playerIndex) {
  return Array.from({ length: 12 }, (_, cardIndex) => ({
    type: 'city',
    color: ['blue', 'yellow', 'black', 'red'][cardIndex % 4],
    name: `Player ${playerIndex + 1} City ${cardIndex + 1}`
  }));
}

test('maximum-size roster keeps summaries visible and large hands available on demand', () => {
  const roles = ['medic', 'scientist', 'operations_expert', 'quarantine_specialist'];
  const gameState = {
    gameStatus: { currentPlayerIndex: 2 },
    players: roles.map((role, index) => ({
      index,
      role,
      location: ['Wuhan', 'Paris', 'Atlanta', 'Tokyo'][index],
      hand: largeHand(index)
    }))
  };
  const container = new FakeElement('div');
  const expandedPlayers = new Set();
  let toggles = 0;

  renderPlayerRoster(container, gameState, expandedPlayers, () => { toggles += 1; });

  assert.equal(container.children.length, 4);
  for (const [index, item] of container.children.entries()) {
    const summary = item.querySelector('.player-summary');
    const details = item.querySelector('.player-hand-details');

    assert.equal(summary.tagName, 'BUTTON');
    assert.equal(summary.getAttribute('aria-expanded'), 'false');
    assert.equal(summary.textContent.includes(`Player ${index + 1}`), true);
    assert.equal(summary.textContent.includes('12 cards'), true);
    assert.equal(summary.textContent.includes(index === 2 ? 'Current turn' : 'Waiting'), true);
    assert.equal(details.hidden, true);
  }

  const currentItem = container.children[2];
  assert.equal(currentItem.getAttribute('aria-current'), 'true');
  assert.equal(currentItem.textContent.includes('Operations Expert'), true);
  assert.equal(currentItem.textContent.includes('Atlanta'), true);

  const currentSummary = currentItem.querySelector('.player-summary');
  const currentDetails = currentItem.querySelector('.player-hand-details');
  currentSummary.click();

  assert.equal(currentSummary.getAttribute('aria-expanded'), 'true');
  assert.equal(currentDetails.hidden, false);
  assert.equal(currentDetails.querySelectorAll('.hand-card-preview').length, 12);
  assert.equal(currentDetails.textContent.includes('Player 3 City 12'), true);
  assert.equal(expandedPlayers.has(2), true);
  assert.equal(toggles, 1);

  renderPlayerRoster(container, gameState, expandedPlayers);
  assert.equal(container.children[2].querySelector('.player-hand-details').hidden, false);
});

test('production commit hash remains outside repeated roster renders', () => {
  const gameState = {
    gameStatus: { currentPlayerIndex: 0 },
    players: [{ index: 0, role: 'medic', location: 'Atlanta', hand: [] }]
  };
  const { listContainer, rosterContainer } = createPlayerRosterContainer('abc123');
  const gitHash = listContainer.querySelector('.git-hash-display');

  assert.equal(gitHash.textContent, 'abc123');
  assert.equal(rosterContainer.getAttribute('role'), 'list');
  assert.equal(gitHash.getAttribute('role'), null);

  renderPlayerRoster(rosterContainer, gameState);
  renderPlayerRoster(rosterContainer, gameState);

  assert.equal(listContainer.querySelector('.git-hash-display'), gitHash);
  assert.equal(rosterContainer.querySelectorAll('.player-item').length, 1);
});
