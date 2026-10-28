import assert from 'node:assert/strict';
import test from 'node:test';

const {
  actionRisk,
  outbreakRisk,
  supplyRisk,
  formatPhase,
  updateGameStatus
} = await import('../../public/js/game_status.js');

test('action warnings grow more urgent as actions run out', () => {
  assert.equal(actionRisk(4), 'normal');
  assert.equal(actionRisk(2), 'normal');
  assert.equal(actionRisk(1), 'warning');
  assert.equal(actionRisk(0), 'critical');
});

function diseaseHUD(capacity) {
  const attributes = new Map([['aria-valuemax', String(capacity)]]);
  const properties = new Map();
  const meter = {
    getAttribute: name => attributes.get(name),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    style: { setProperty: (name, value) => properties.set(name, value) }
  };
  const cubes = {};
  const warning = {};
  const item = { dataset: {}, querySelector: () => warning };
  const elements = { 'blue-cubes': cubes, 'blue-cube-meter': meter };
  globalThis.document = {
    getElementById: id => elements[id],
    querySelector: selector => selector === '.cure-item.blue' ? item : null
  };
  return { attributes, properties, cubes, item, warning };
}

test('disease HUD preserves supply totals, meter bounds, clamping and risk labels', () => {
  const hud = diseaseHUD(24);
  try {
    for (const [supply, risk, label, percent] of [
      [24, 'normal', 'Stable', 100], [8, 'warning', 'Low', 100 / 3],
      [3, 'critical', 'Critical', 12.5], [0, 'critical', 'Critical', 0],
      [25, 'normal', 'Stable', 100], [-1, 'critical', 'Critical', 0]
    ]) {
      const count = Math.max(0, supply);
      updateGameStatus({ gameStatus: {}, diseaseCubes: { blue: { inSupply: supply } } });
      assert.equal(hud.cubes.textContent, `${count} of 24 cubes`);
      assert.equal(hud.attributes.get('aria-valuemax'), '24');
      assert.equal(hud.attributes.get('aria-valuenow'), String(count));
      assert.equal(hud.attributes.get('aria-label'), `${count} of 24 blue disease cubes remaining, ${label.toLowerCase()}`);
      assert.ok(Math.abs(parseFloat(hud.properties.get('--meter-value')) - percent) < 1e-10);
      assert.equal(hud.item.dataset.risk, risk);
      assert.equal(hud.warning.textContent, risk === 'normal' ? '' : label);
    }
  } finally {
    delete globalThis.document;
  }
});

test('disease HUD uses the rendered capacity for totals, accessible labels and percentages', () => {
  const hud = diseaseHUD(30);
  try {
    for (const [supply, percent] of [[15, '50%'], [30, '100%'], [31, '100%']]) {
      updateGameStatus({ gameStatus: {}, diseaseCubes: { blue: { inSupply: supply } } });
      assert.equal(hud.cubes.textContent, `${supply} of 30 cubes`);
      assert.equal(hud.attributes.get('aria-valuemax'), '30');
      assert.equal(hud.attributes.get('aria-valuenow'), String(supply));
      assert.equal(hud.attributes.get('aria-label'), `${supply} of 30 blue disease cubes remaining, stable`);
      assert.equal(hud.properties.get('--meter-value'), percent);
    }
  } finally {
    delete globalThis.document;
  }
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
