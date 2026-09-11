import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
  addEventListener() {},
  dispatchEvent() {},
  getElementById() { return null; },
  querySelectorAll() { return []; }
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const [movementActions, ordinaryActions, actionCardRequests, playerActions] = await Promise.all([
  import('../../public/js/movement_actions.js'),
  import('../../public/js/ordinary_player_actions.js'),
  import('../../public/js/action_card_requests.js'),
  import('../../public/js/player_actions.js')
]);

test('player action boundaries import independently and remain available through the facade', () => {
  const expectedExports = [
    [movementActions, ['handleFlightChoice', 'handleOperationsExpertMove', 'initMoveActions', 'setSelectedPlayerIndex']],
    [ordinaryActions, ['cureDisease', 'executeShareKnowledge', 'pass', 'treatDisease']],
    [actionCardRequests, ['useActionCard', 'useAirlift', 'useGovernmentGrant', 'useQuietNight', 'useResilientPopulation']]
  ];

  for (const [owner, names] of expectedExports) {
    for (const name of names) {
      assert.equal(typeof owner[name], 'function');
      assert.equal(playerActions[name], owner[name]);
    }
  }
});
