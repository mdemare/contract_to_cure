import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
  addEventListener() {},
  querySelector() { return null; }
};

const { checkGameOver, defeatReasonText } = await import('../../public/js/game_over.js');

test('end-turn game-over reasons become defeat messages', () => {
  assert.equal(defeatReasonText('no_player_cards'), 'You ran out of player cards.');
  assert.equal(defeatReasonText('too_many_outbreaks'), 'Too many outbreaks occurred.');
  assert.equal(defeatReasonText('no_cubes'), 'You ran out of disease cubes.');
  assert.equal(defeatReasonText(undefined), null);
});

function fakeElement() {
  return {
    textContent: '',
    style: {},
    offsetWidth: 0,
    classList: { add() {}, remove() {} }
  };
}

// Shows the dialog for a lost game with the given JSON fields and reason
// code, and returns the defeat reason it displays.
function shownDefeatReason({ outbreaks = 0, decks, diseaseCubes = {} }, reasonCode) {
  const elements = {};
  const saved = globalThis.document;
  globalThis.document = {
    querySelector(selector) { return (elements[selector] ??= fakeElement()); },
    getElementById(id) { return (elements[id] ??= fakeElement()); }
  };
  try {
    const gameState = { gameStatus: { gameOver: true, turn: 3, outbreaks }, diseaseCubes, decks };
    checkGameOver(gameState, reasonCode);
  } finally {
    globalThis.document = saved;
  }
  return elements['.game-over-reason'].textContent;
}

test('a known reason code becomes the defeat message', () => {
  assert.equal(shownDefeatReason({ outbreaks: 8 }, 'no_cubes'), 'You ran out of disease cubes.');
});

test('an unknown reason code with 8 outbreaks falls back to too many outbreaks', () => {
  assert.equal(shownDefeatReason({ outbreaks: 8 }, 'mystery'), 'Too many outbreaks occurred.');
});

test('an unknown reason code otherwise shows the generic defeat message', () => {
  const state = {
    outbreaks: 2,
    decks: { playerDeck: 0, discardPile: [], infectionDiscardPile: [] },
    diseaseCubes: { blue: { cured: false, eradicated: false, inSupply: 0, onBoard: [] } }
  };
  assert.equal(shownDefeatReason(state, 'mystery'), 'The pandemic spread beyond control.');
  assert.equal(shownDefeatReason(state, null), 'The pandemic spread beyond control.');
});
