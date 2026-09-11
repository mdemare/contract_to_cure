import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MAP_WIDTH } from '../../public/js/constants.js';

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
  createElement: tagName => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName)
};

const {
  createCityOnPanel,
  getCityLabelBounds,
  getCityPieceBounds,
  layoutCityLabels,
  prepareMapWithGameState,
  renderConnection
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

function rectanglesOverlap(left, right) {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

test('dense city labels avoid labels, markers, and live pieces', async () => {
  const cityMap = JSON.parse(await readFile(new URL('../../public/cities.json', import.meta.url)));
  const preparedMap = prepareMapWithGameState(cityMap, {
    gameStatus: { currentPlayerIndex: 0 },
    players: [
      { index: 0, role: 'operations_expert', location: 'Kolkata' },
      { index: 1, role: 'contingency_planner', location: 'Kolkata' }
    ],
    diseaseCubes: {
      blue: { onBoard: { London: 2, Paris: 1 } },
      yellow: { onBoard: { Nairobi: 3 } },
      black: { onBoard: { Baghdad: 3, Kabul: 3, Delhi: 2 } }
    },
    researchStations: { locations: ['Istanbul', 'Kolkata'] }
  });
  const layouts = layoutCityLabels(preparedMap);
  const cityNames = Object.keys(preparedMap);
  const overlaps = [];

  for (let index = 0; index < cityNames.length; index++) {
    const cityName = cityNames[index];
    const bounds = getCityLabelBounds(cityName, preparedMap[cityName], layouts[cityName]);

    for (const otherName of cityNames.slice(index + 1)) {
      const otherBounds = getCityLabelBounds(otherName, preparedMap[otherName], layouts[otherName]);
      if (rectanglesOverlap(bounds, otherBounds)) overlaps.push([cityName, otherName]);
    }

    for (const city of Object.values(preparedMap)) {
      const markerSize = city.hasStation ? 20 : 18;
      const markerBounds = {
        x: city.x - markerSize / 2,
        y: city.y - markerSize / 2,
        width: markerSize,
        height: markerSize
      };
      if (rectanglesOverlap(bounds, markerBounds)) overlaps.push([cityName, 'marker']);

      for (const pieceBounds of getCityPieceBounds(city)) {
        if (rectanglesOverlap(bounds, pieceBounds)) overlaps.push([cityName, 'piece']);
      }
    }
  }

  assert.deepEqual(overlaps, []);
  assert.ok(new Set(Object.values(layouts)).size >= 3);

  for (const [cityName, position] of Object.entries(layouts)) {
    const bounds = getCityLabelBounds(cityName, preparedMap[cityName], position);
    assert.ok(bounds.x >= 4, `${cityName} label crosses the left panel edge`);
    assert.ok(bounds.x + bounds.width <= MAP_WIDTH - 4, `${cityName} label crosses the right panel edge`);
    assert.ok(bounds.y >= 169, `${cityName} label crosses the top map edge`);
  }
});

test('one, two, and three cube cities expose their canvas-rendered pieces accessibly', () => {
  for (const cubeCount of [1, 2, 3]) {
    const city = createCityOnPanel({
      ...rawMap.Atlanta,
      cubes: cubeCount,
      pawns: [],
      hasStation: false,
      isCurrentCity: false
    }, 'Atlanta', 0);

    assert.equal(city.querySelectorAll('.cube').length, 0);
    assert.equal(city.querySelector('.cube-count-badge'), null);
    assert.match(city.getAttribute('aria-label'), new RegExp(`${cubeCount} disease cube`));
  }
});

test('research stations change the city marker instead of adding a separate icon', () => {
  const stationCity = createCityOnPanel({
    ...rawMap.Atlanta,
    cubes: 0,
    pawns: [],
    hasStation: true,
    isCurrentCity: false
  }, 'Atlanta', 0);
  const regularCity = createCityOnPanel({
    ...rawMap.Paris,
    cubes: 0,
    pawns: [],
    hasStation: false,
    isCurrentCity: false
  }, 'Paris', 0);

  assert.equal(stationCity.classList.contains('has-station'), true);
  assert.equal(stationCity.querySelectorAll('.dot').length, 1);
  assert.equal(stationCity.querySelectorAll('.research-station').length, 0);
  assert.match(stationCity.getAttribute('aria-label'), /research station/);
  assert.equal(regularCity.classList.contains('has-station'), false);
});

test('a piece-heavy city keeps pawn details and canvas cube counts accessible', () => {
  const city = createCityOnPanel({
    ...rawMap.Atlanta,
    cubes: 3,
    hasStation: true,
    isCurrentCity: true,
    labelPosition: 'left',
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
  assert.equal(city.dataset.labelPosition, 'left');
  assert.equal(city.classList.contains('has-station'), true);
  assert.equal(city.querySelectorAll('.dot').length, 1);
  assert.equal(city.querySelectorAll('.research-station').length, 0);
  assert.equal(city.querySelectorAll('.cube').length, 0);
  assert.equal(city.querySelector('.cube-count-badge'), null);
  assert.equal(city.querySelectorAll('.pawn').length, 4);
  assert.equal(city.querySelectorAll('.is-current-pawn').length, 1);
});

test('left wraparound connection intersects the map edge in normalized coordinates', () => {
  const svg = new FakeElement('svg');

  renderConnection(svg, 100, 300, { x: 1200, y: 400 });

  assert.equal(svg.children.length, 1);
  assert.deepEqual(Object.fromEntries(svg.children[0].attributes), {
    x1: '100',
    y1: '135',
    x2: '0',
    y2: '185',
    stroke: '#aaa',
    'stroke-width': '2',
    'stroke-dasharray': '5,3',
    'stroke-linecap': 'round'
  });
});

test('right wraparound connection intersects the map edge in normalized coordinates', () => {
  const svg = new FakeElement('svg');

  renderConnection(svg, 3800, 400, { x: 100, y: 300 });

  assert.equal(svg.children.length, 1);
  assert.deepEqual(Object.fromEntries(svg.children[0].attributes), {
    x1: '3800',
    y1: '235',
    x2: '3900',
    y2: '185',
    stroke: '#aaa',
    'stroke-width': '2',
    'stroke-dasharray': '5,3',
    'stroke-linecap': 'round'
  });
});
