import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canonicalRouteId, projectDestinations, createRouteController } from '../../public/js/route_context.js';
import { MAP_WIDTH } from '../../public/js/constants.js';
import { createCityOnPanel, renderConnections } from '../../public/js/map.js';

const cities = {
  A: { x: 100, y: 300, connections: ['B'], color: 'blue' },
  B: { x: 250, y: 400, connections: ['A'], color: 'blue' },
  C: { x: 1200, y: 350, connections: ['D'], color: 'red' },
  D: { x: 80, y: 450, connections: ['C'], color: 'red' }
};
const card = name => ({ name, type: 'city' });
function game(role = 'medic', hand = []) {
  return {
    players: [{ index: 0, role, location: 'A', hand }, { index: 1, role: 'operations_expert', location: 'C', hand: [card('D')] }],
    researchStations: { locations: ['A', 'C'] },
    gameStatus: { currentPlayerIndex: 0, phase: 'player_actions', actions_remaining: 4, operations_expert_move_used: false }
  };
}
const project = state => projectDestinations(cities, state, 0, 0);

test('canonical IDs are undirected and collision safe', () => {
  assert.equal(canonicalRouteId('B', 'A'), canonicalRouteId('A', 'B'));
  assert.notEqual(canonicalRouteId('A-B', 'C'), canonicalRouteId('A', 'B-C'));
});

test('drive, station shuttle, direct/charter types retain backend ordering and exclude source', () => {
  const state = game('medic', [card('A'), card('B')]);
  const before = JSON.stringify(state);
  const result = project(state);
  assert.equal(result.source, 'A');
  assert.deepEqual(result.destinations.get('B'), ['drive / ferry', 'direct flight', 'charter flight']);
  assert.deepEqual(result.destinations.get('C'), ['shuttle flight', 'charter flight']);
  assert.deepEqual(result.destinations.get('D'), ['charter flight']);
  assert.equal(result.destinations.has('A'), false);
  assert.equal(result.destinations.has('Unknown'), false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(project(game()).destinations.has('D'), false);
  assert.deepEqual(project(game('medic', [card('D')])).destinations.get('D'), ['direct flight']);
  assert.equal(project(game('medic', [{ name: 'D', type: 'action' }])).destinations.has('D'), false);
});

test('Dispatcher uses selected source and acting hand, gathers to other pawns only', () => {
  const state = game('dispatcher', [card('B')]);
  const result = projectDestinations(cities, state, 0, 1);
  assert.equal(result.source, 'C');
  assert.deepEqual(result.destinations.get('A'), ['shuttle flight', 'Dispatcher gather']);
  assert.deepEqual(result.destinations.get('B'), ['direct flight']);
  assert.deepEqual(result.destinations.get('D'), ['drive / ferry']);
  assert.equal(result.destinations.has('C'), false);
  assert.equal(projectDestinations(cities, state, 0, null).source, null);
  assert.equal(projectDestinations(cities, game(), 0, 1).source, null);
  assert.equal(projectDestinations(cities, state, 9, 1).source, null);
});

test('Expert requires own pawn, station, city card, and unused special move', () => {
  const state = game('operations_expert', [card('D')]);
  assert.deepEqual(project(state).destinations.get('D'), ['Operations Expert station move', 'direct flight']);
  assert.deepEqual(project(state).destinations.get('B'), ['drive / ferry', 'Operations Expert station move']);
  state.gameStatus.operations_expert_move_used = true;
  assert.equal(project(state).destinations.has('D'), false); // Backend precedence, tracked in cc-230.
  assert.deepEqual(project(state).destinations.get('B'), ['drive / ferry']);
  assert.deepEqual(project(state).destinations.get('C'), ['shuttle flight']);
  state.researchStations.locations = [];
  assert.deepEqual(project(state).destinations.get('D'), ['direct flight']);
  assert.equal(project(game('operations_expert')).destinations.has('D'), false);
});

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    const values = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => values.add(name)),
      remove: (...names) => names.forEach(name => values.delete(name)),
      contains: name => values.has(name)
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  get firstChild() { return this.children[0]; }
  removeChild(child) { this.children = this.children.filter(item => item !== child); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.classList.contains(selector.slice(1)) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
}
function board() {
  const root = new Element('div');
  const svg = root.appendChild(new Element('svg'));
  globalThis.document = {
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    querySelector: () => svg
  };
  renderConnections(cities);
  for (const [name, data] of Object.entries(cities)) {
    for (let panel = 0; panel < 3; panel++) root.appendChild(createCityOnPanel(data, name, panel));
  }
  return root;
}
const has = (element, name) => element.classList.contains(name);
const routes = root => root.querySelectorAll('.board-route');
const targets = root => root.querySelectorAll('.city');

test('all three copies and both wrapped segments carry shared identity and endpoint metadata', () => {
  const root = board();
  const ordinary = routes(root).filter(line => line.dataset.routeId === canonicalRouteId('A', 'B'));
  const wrapped = routes(root).filter(line => line.dataset.routeId === canonicalRouteId('C', 'D'));
  assert.equal(ordinary.length, 3);
  assert.equal(wrapped.length, 4);
  assert.equal(wrapped.filter(line => line.getAttribute('stroke-dasharray') === '5,3').length, 2);
  assert.deepEqual(ordinary.map(line => Number(line.getAttribute('x1'))), [100, 100 + MAP_WIDTH, 100 + 2 * MAP_WIDTH]);
  for (const line of wrapped) assert.deepEqual([line.dataset.routeFrom, line.dataset.routeTo], ['C', 'D']);
});

test('hover/focus synchronize logical routes and endpoints; flights do not invent routes', () => {
  const root = board();
  const announcements = [];
  const controller = createRouteController(root, value => announcements.push(value));
  controller.update({ cities, state: game(), mode: 'move' });
  assert.equal(targets(root).filter(city => has(city, 'move-source')).length, 3);
  assert.equal(targets(root).filter(city => has(city, 'move-valid')).length, 6);
  controller.hover('B');
  assert.equal(routes(root).filter(line => has(line, 'route-hovered')).length, 3);
  assert.equal(targets(root).filter(city => has(city, 'move-hovered')).length, 6);
  controller.hover('C');
  assert.equal(routes(root).filter(line => has(line, 'route-hovered')).length, 0);
  assert.equal(targets(root).filter(city => has(city, 'move-hovered')).length, 6);
  controller.focus('D');
  assert.equal(routes(root).filter(line => has(line, 'route-focused')).length, 0);
  assert.equal(targets(root).filter(city => has(city, 'move-focused')).length, 3);
  assert.equal(routes(root).filter(line => has(line, 'route-dimmed')).length, 4);
  controller.focus('B');
  assert.equal(routes(root).filter(line => has(line, 'route-focused')).length, 3);
  assert.match(targets(root).find(city => city.dataset.cityName === 'B').getAttribute('aria-label'), /Valid destination: drive \/ ferry/);
  assert.match(announcements[0], /player 1, medic, from A. 2 valid destinations/);
});

test('redraw reapplies active emphasis including wrapped copies without reannouncing', () => {
  const root = board();
  const announcements = [];
  const controller = createRouteController(root, value => announcements.push(value));
  controller.update({ cities, state: game('dispatcher'), mode: 'move', pawnIndex: null });
  assert.equal(targets(root).some(city => has(city, 'move-source')), false);
  assert.equal(announcements.at(-1), 'Select a pawn to move.');
  controller.update({ mode: 'moveSelectedPlayer', pawnIndex: 1 });
  controller.focus('D');
  root.children = board().children;
  controller.redraw();
  assert.equal(routes(root).filter(line => has(line, 'route-focused')).length, 4);
  assert.equal(targets(root).filter(city => has(city, 'move-source')).length, 3);
  assert.equal(announcements.length, 2);
});

test('action switches, cancellation, blocking, phase, exhaustion and game over fully reset', () => {
  const root = board();
  const announcements = [];
  const controller = createRouteController(root, value => announcements.push(value));
  const cases = [
    { mode: null }, { mode: 'trade' }, { mode: 'airlift' }, { mode: 'governmentGrant' },
    { blocked: true },
    ...[{ phase: 'draw_cards' }, { phase: 'pending_discard' }, { phase: 'infect_cities' },
      { actions_remaining: 0 }, { gameOver: true }, { pending_hand_limit: {} }].map(status => {
      const state = game(); Object.assign(state.gameStatus, status); return { state };
    })
  ];
  for (const change of cases) {
    controller.update({ cities, state: game(), mode: 'move', blocked: false });
    controller.hover('B'); controller.focus('B');
    controller.update(change);
    for (const city of targets(root)) {
      for (const name of ['source', 'valid', 'invalid', 'hovered', 'focused']) assert.equal(has(city, `move-${name}`), false);
      assert.equal(city.getAttribute('aria-label'), city.dataset.baseDescription);
    }
    for (const line of routes(root)) {
      for (const name of ['dimmed', 'adjacent', 'hovered', 'focused']) assert.equal(has(line, `route-${name}`), false);
    }
    assert.equal(announcements.at(-1), '');
  }
});

test('returned game state recomputes source, clears transient state, and announces changed choices', () => {
  const root = board();
  const announcements = [];
  const controller = createRouteController(root, value => announcements.push(value));
  const state = game();
  controller.update({ cities, state, mode: 'move' });
  controller.hover('B');
  state.players[0].location = 'B';
  state.gameStatus.actions_remaining = 3;
  controller.update({ state });
  assert.equal(targets(root).filter(city => has(city, 'move-source')).every(city => city.dataset.cityName === 'B'), true);
  assert.equal(targets(root).some(city => has(city, 'move-hovered')), false);
  assert.match(announcements.at(-1), /from B. 1 valid destinations/);
  controller.update({ state });
  assert.equal(announcements.length, 2);
});

test('native keyboard targets, decorative layering, non-color cues and reduced motion remain explicit', async () => {
  const root = board();
  for (const city of targets(root)) { assert.equal(city.tagName, 'button'); assert.equal(city.type, 'button'); }
  assert.equal(targets(root).filter(city => city.tabIndex === 0).length, Object.keys(cities).length);
  const css = await readFile(new URL('../../public/css/map.css', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../../public/js/map.js', import.meta.url), 'utf8');
  assert.match(renderer, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(css, /\.connections-layer\s*\{[^}]*pointer-events: none;[^}]*z-index: 5;/s);
  assert.match(css, /\.map-inner \.city\s*\{[^}]*overflow: visible;[^}]*z-index: 10;/s);
  assert.match(css, /\.city.move-source \.dot::after\s*\{[^}]*double/s);
  assert.match(css, /\.city.move-valid \.dot::after\s*\{[^}]*solid/s);
  assert.match(css, /\.city.move-invalid \.dot::before\s*\{[^}]*rotate\(-45deg\)/s);
  assert.match(css, /\.city.move-focused\s*\{[^}]*outline: 3px solid/s);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.board-route[\s\S]*transition: none/);
});

test('mode notifications explicitly carry previous and current modes', async () => {
  const events = [];
  globalThis.CustomEvent = class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } };
  globalThis.document = {
    querySelectorAll: () => [], getElementById: () => null,
    dispatchEvent: event => events.push(event)
  };
  const { toggleMode, resetMode } = await import('../../public/js/action_mode.js');
  toggleMode('move');
  toggleMode('airlift');
  resetMode();
  assert.deepEqual(events.filter(event => event.type === 'actionModeChanged').map(event => event.detail), [
    { previousMode: null, mode: 'move' },
    { previousMode: 'move', mode: 'airlift' },
    { previousMode: 'airlift', mode: null }
  ]);
});
