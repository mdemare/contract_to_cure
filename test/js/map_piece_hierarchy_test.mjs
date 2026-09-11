import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MAP_WIDTH } from '../../public/js/constants.js';
import { renderDiseaseCubeCanvas } from '../../public/js/disease_cube_canvas.js';

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

  assert.equal(svg.children.length, 2);
  assert.deepEqual(Object.fromEntries(svg.children[0].attributes), {
    x1: '100',
    y1: '135',
    x2: '0',
    y2: '185',
    'stroke-dasharray': '5,3',
    'stroke-linecap': 'round'
  });
});

test('right wraparound connection intersects the map edge in normalized coordinates', () => {
  const svg = new FakeElement('svg');

  renderConnection(svg, 3800, 400, { x: 100, y: 300 });

  assert.equal(svg.children.length, 2);
  assert.deepEqual(Object.fromEntries(svg.children[0].attributes), {
    x1: '3800',
    y1: '235',
    x2: '3900',
    y2: '185',
    'stroke-dasharray': '5,3',
    'stroke-linecap': 'round'
  });
});

test('cube bitmap covers Cape Town and boundary orbits through short-height pans, resize, and rerender', async t => {
  const cities = JSON.parse(await readFile(new URL('../../public/cities.json', import.meta.url)));
  const map = Object.fromEntries(['Cape Town', 'Santiago', 'Sydney'].map(name => [
    name, { ...cities[name], cubes: 3 }
  ]));
  Object.assign(map, {
    Northwest: { x: 0, y: 165, color: 'blue', cubes: 3 },
    Southeast: { x: MAP_WIDTH, y: 465, color: 'red', cubes: 3 }
  });
  const originalGlobals = Object.fromEntries(
    ['window', 'matchMedia', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame']
      .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])
  );
  t.after(() => {
    for (const [name, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  let resize;
  let disconnected = 0;
  let motionChanged;
  const frames = new Map();
  let frameId = 0;
  const motionQuery = {
    matches: true,
    addEventListener: (_event, callback) => { motionChanged = callback; },
    removeEventListener: () => { motionChanged = null; }
  };
  globalThis.window = { devicePixelRatio: 3 };
  globalThis.matchMedia = () => motionQuery;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnected++; }
  };
  globalThis.requestAnimationFrame = callback => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = id => frames.delete(id);

  t.mock.method(document, 'createElement', tagName => {
    const element = new FakeElement(tagName);
    if (tagName !== 'canvas') return element;
    const context = {
      centers: [],
      corners: [],
      save() {},
      restore() {},
      setTransform(...transform) { this.transform = transform; },
      clearRect() { this.centers = []; this.corners = []; },
      translate(x, y) { this.center = { x, y }; this.centers.push(this.center); },
      rotate(angle) { this.angle = angle; },
      fillRect(x, y, width, height) {
        for (const dx of [x, x + width]) {
          for (const dy of [y, y + height]) {
            this.corners.push({
              x: this.center.x + dx * Math.cos(this.angle) - dy * Math.sin(this.angle),
              y: this.center.y + dx * Math.sin(this.angle) + dy * Math.cos(this.angle)
            });
          }
        }
      }
    };
    element.getContext = () => context;
    return element;
  });

  const mapInner = new FakeElement('div');
  mapInner.clientWidth = MAP_WIDTH * 3;
  mapInner.clientHeight = 300;
  let canvas = renderDiseaseCubeCanvas(mapInner, map);

  function verifySurface() {
    const context = canvas.getContext('2d');
    const width = parseFloat(canvas.style.width);
    const height = parseFloat(canvas.style.height);
    const left = parseFloat(canvas.style.left);
    const top = parseFloat(canvas.style.top);
    const ratio = Math.min(window.devicePixelRatio, 2);
    for (const { x, y } of context.corners) {
      assert.ok(x >= 6 && x <= canvas.width / ratio - 6, 'rotated cube and shadow fit horizontally');
      assert.ok(y >= 6 && y <= canvas.height / ratio - 6, 'rotated cube and shadow fit vertically');
    }
    assert.equal(canvas.width, Math.round(width * ratio));
    assert.equal(canvas.height, Math.round(height * ratio));
    assert.deepEqual(context.transform, [ratio, 0, 0, ratio, 0, 0]);
    assert.equal(context.centers.length, Object.keys(map).length * 9);
    assert.equal(canvas.getAttribute('aria-hidden'), 'true');
    Object.values(map).forEach((city, cityIndex) => {
      for (let panel = 0; panel < 3; panel++) {
        const centers = context.centers.slice(cityIndex * 9 + panel * 3, cityIndex * 9 + panel * 3 + 3);
        for (const [index, center] of centers.entries()) {
          const x = center.x + left;
          const y = center.y + top;
          assert.ok(Math.abs(Math.hypot(x - city.x - panel * MAP_WIDTH, y - city.y + 165) - 18) < 1e-8);
          const firstPanel = context.centers[cityIndex * 9 + index];
          assert.ok(Math.abs(center.x - firstPanel.x - panel * MAP_WIDTH) < 1e-8);
          assert.equal(center.y, firstPanel.y);
          // Pan each city into both a short desktop and a mobile viewport.
          for (const viewportWidth of [1000, 375]) {
            const screenX = x + viewportWidth / 2 - city.x - panel * MAP_WIDTH;
            const screenY = y + mapInner.clientHeight / 2 - (city.y - 165);
            assert.ok(screenX > 0 && screenX < viewportWidth);
            assert.ok(screenY > 0 && screenY < mapInner.clientHeight);
          }
        }
      }
    });
    // The reported pan puts Cape Town at Y=165 with every cube still visible.
    for (const center of context.centers.slice(0, 3)) {
      assert.ok(center.y + top - 300 > 140 && center.y + top - 300 < 190);
    }
  }

  verifySurface();
  for (const height of [180, 700, 300]) {
    mapInner.clientHeight = height;
    window.devicePixelRatio = height === 700 ? 1.25 : 2;
    resize();
    verifySurface();
  }
  canvas = renderDiseaseCubeCanvas(mapInner, map);
  assert.equal(disconnected, 1);
  verifySurface();

  motionQuery.matches = false;
  motionChanged();
  for (const elapsed of [0, 1000, 9000]) {
    const [id, callback] = frames.entries().next().value;
    frames.delete(id);
    callback(elapsed);
    verifySurface();
  }
  canvas = renderDiseaseCubeCanvas(mapInner, map);
  assert.equal(frames.size, 1, 'rerender cancels the previous animation');
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(9000);
  verifySurface();
  renderDiseaseCubeCanvas(mapInner, {});
  assert.equal(frames.size, 0, 'empty maps stop animating');
});
