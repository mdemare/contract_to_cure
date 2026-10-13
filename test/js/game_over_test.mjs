import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
  addEventListener() {},
  querySelector() { return null; }
};

const { defeatReasonText } = await import('../../public/js/game_over.js');

test('end-turn game-over reasons become defeat messages', () => {
  assert.equal(defeatReasonText('no_player_cards'), 'You ran out of player cards.');
  assert.equal(defeatReasonText('too_many_outbreaks'), 'Too many outbreaks occurred.');
  assert.equal(defeatReasonText('no_cubes'), 'You ran out of disease cubes.');
  assert.equal(defeatReasonText(undefined), null);
});
