import assert from 'node:assert/strict';
import test from 'node:test';

const {
  actionRisk,
  outbreakRisk,
  supplyRisk,
  formatPhase
} = await import('../../public/js/game_status.js');

test('action warnings grow more urgent as actions run out', () => {
  assert.equal(actionRisk(4), 'normal');
  assert.equal(actionRisk(2), 'normal');
  assert.equal(actionRisk(1), 'warning');
  assert.equal(actionRisk(0), 'critical');
});

test('outbreak warnings account for the eight-outbreak loss threshold', () => {
  assert.equal(outbreakRisk(4), 'normal');
  assert.equal(outbreakRisk(5), 'warning');
  assert.equal(outbreakRisk(7), 'critical');
  assert.equal(outbreakRisk(8), 'critical');
});

test('cube supply warnings grow more urgent as supply is depleted', () => {
  assert.equal(supplyRisk(24), 'normal');
  assert.equal(supplyRisk(8), 'warning');
  assert.equal(supplyRisk(3), 'critical');
  assert.equal(supplyRisk(0), 'critical');
});

test('machine phase names become readable labels', () => {
  assert.equal(formatPhase('player_actions'), 'Player Actions');
  assert.equal(formatPhase('draw_cards'), 'Draw Cards');
  assert.equal(formatPhase('pending_discard'), 'Pending Discard');
});
