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
    this.style = {};
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
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

const {
  createCityOnPanel,
  getCityLabelSide,
  prepareMapWithGameState
} = await import('../../public/js/map.js');

const rawMap = {
  London: { x: 100, y: 200, color: 'blue' },
  Paris: { x: 150, y: 200, color: 'blue' },
  Atlanta: { x: 400, y: 300, color: 'blue' }
};

test('map presentation identifies the current pawn and city without mutating players', () => {
  const players = [
    { index: 0, role: 'medic', location: 'Atlanta' },
    { index: 1, role: 'scientist', location: 'Atlanta' },
    { index: 2, role: 'operations_expert', location: 'Atlanta' },
    { index: 3, role: 'researcher', location: 'Paris' }
  ];
  const gameState = {
    gameStatus: { currentPlayerIndex: 2 },
    players,
    diseaseCubes: { blue: { onBoard: { Atlanta: 3 } } },
    researchStations: { locations: ['Atlanta'] }
  };

  const prepared = prepareMapWithGameState(rawMap, gameState);

  assert.equal(prepared.Atlanta.isCurrentCity, true);
  assert.equal(prepared.Atlanta.cubes, 3);
  assert.equal(prepared.Atlanta.hasStation, true);
  assert.deepEqual(
    prepared.Atlanta.pawns.map(pawn => [pawn.playerIndex, pawn.isCurrent]),
    [[2, true], [0, false], [1, false]]
  );
  assert.equal(players.some(player => Object.hasOwn(player, 'order')), false);
});

test('dense city labels point away from each other', () => {
  assert.equal(getCityLabelSide('London', rawMap), 'left');
  assert.equal(getCityLabelSide('Paris', rawMap), 'right');
  assert.equal(getCityLabelSide('Atlanta', rawMap), 'center');
});

test('one, two, and three cube cities expose both pieces and a numeric count', () => {
  for (const cubeCount of [1, 2, 3]) {
    const city = createCityOnPanel({
      ...rawMap.Atlanta,
      cubes: cubeCount,
      pawns: [],
      hasStation: false,
      isCurrentCity: false
    }, 'Atlanta', 0);

    assert.equal(city.querySelectorAll('.cube').length, cubeCount);
    assert.equal(city.querySelector('.cube-count-badge').textContent, String(cubeCount));
    assert.match(city.getAttribute('aria-label'), new RegExp(`${cubeCount} disease cube`));
  }
});

test('a piece-heavy city keeps every pawn and cube individually represented', () => {
  const city = createCityOnPanel({
    ...rawMap.Atlanta,
    cubes: 3,
    hasStation: true,
    isCurrentCity: true,
    labelSide: 'left',
    pawns: [
      { role: 'operations_expert', playerIndex: 2, isCurrent: true },
      { role: 'medic', playerIndex: 0, isCurrent: false },
      { role: 'scientist', playerIndex: 1, isCurrent: false },
      { role: 'researcher', playerIndex: 3, isCurrent: false }
    ]
  }, 'Atlanta', 1);

  assert.equal(city.tagName, 'BUTTON');
  assert.equal(city.type, 'button');
  assert.equal(city.style.left, '1700px');
  assert.equal(city.getAttribute('aria-current'), 'location');
  assert.match(city.getAttribute('aria-label'), /3 disease cubes/);
  assert.match(city.getAttribute('aria-label'), /4 pawns/);
  assert.equal(city.dataset.labelSide, 'left');
  assert.equal(city.querySelectorAll('.dot').length, 1);
  assert.equal(city.querySelectorAll('.research-station').length, 1);
  assert.equal(city.querySelectorAll('.cube').length, 3);
  assert.equal(city.querySelector('.cube-count-badge').textContent, '3');
  assert.equal(city.querySelectorAll('.pawn').length, 4);
  assert.equal(city.querySelectorAll('.is-current-pawn').length, 1);
});
