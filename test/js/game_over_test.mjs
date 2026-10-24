import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = {
  addEventListener() {},
  querySelector() { return null; }
};

const { checkGameOver, defeatReasonText, restartGame } = await import('../../public/js/game_over.js');

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
  return showDialog({ outbreaks, decks, diseaseCubes }, reasonCode)['.game-over-reason'].textContent;
}

// Shows the dialog for a lost game and returns the elements it touched.
function showDialog({ outbreaks = 0, decks, diseaseCubes = {}, difficulty_level }, reasonCode) {
  const elements = {};
  const saved = globalThis.document;
  globalThis.document = {
    querySelector(selector) { return (elements[selector] ??= fakeElement()); },
    getElementById(id) { return (elements[id] ??= fakeElement()); }
  };
  try {
    const gameState = { gameStatus: { game_over: true, turn: 3, outbreaks, difficulty_level }, diseaseCubes, decks };
    checkGameOver(gameState, reasonCode);
  } finally {
    globalThis.document = saved;
  }
  return elements;
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

test('the game-over dialog offers the current difficulty for the next game', () => {
  for (const level of ['introductory', 'normal', 'heroic']) {
    const elements = showDialog({ difficulty_level: level }, 'no_cubes');
    assert.equal(elements['.game-over-overlay .difficulty-select'].value, level);
  }
  assert.equal(showDialog({}, 'no_cubes')['.game-over-overlay .difficulty-select'].value, 'heroic');
});

test('Restart Game sends the difficulty chosen in the game-over dialog', async () => {
  for (const difficulty of ['introductory', 'normal', 'heroic']) {
    const select = { value: difficulty };
    const saved = globalThis.document;
    globalThis.document = {
      querySelector(selector) {
        if (selector === '.game-over-overlay .difficulty-select') return select;
        if (selector === 'meta[name="csrf-token"]') return { getAttribute: () => 'csrf-token' };
        return null;
      }
    };
    let request;
    let reloaded = false;
    globalThis.window = { location: { reload() { reloaded = true; } } };
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, async json() { return { success: true, game_state: {} }; } };
    };
    try {
      await restartGame();
    } finally {
      globalThis.document = saved;
    }

    assert.equal(request.url, '/restart_game');
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { difficulty_level: difficulty });
    assert.equal(reloaded, true);
  }
});

// A minimal DOM in which initGameOver builds the real dialog.
function fakeDialogDocument() {
  const listeners = [];
  let overlay = null;
  const createElement = tag => {
    const classes = new Set();
    return {
      tag,
      children: [],
      style: {},
      textContent: '',
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name)
      },
      appendChild(child) { this.children.push(child); return child; }
    };
  };
  const document = {
    createElement,
    body: { appendChild(child) { overlay = child; return child; } },
    addEventListener(type, listener) { if (type === 'click') listeners.push(listener); },
    querySelector(selector) { return selector === '.game-over-overlay' ? overlay : null; },
    click(target) { listeners.forEach(listener => listener({ target })); }
  };
  return { document, overlay: () => overlay };
}

function findAll(element, predicate, found = []) {
  if (predicate(element)) found.push(element);
  for (const child of element.children ?? []) findAll(child, predicate, found);
  return found;
}

test('the second game-over button closes the overlay so the finished board can be viewed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { initGameOver } = await import('../../public/js/game_over.js');
  const fake = fakeDialogDocument();
  const saved = globalThis.document;
  globalThis.document = fake.document;
  globalThis.window = { location: { href: 'http://localhost/' } };
  try {
    initGameOver();
    const overlay = fake.overlay();
    overlay.classList.add('visible');
    overlay.style.display = 'flex';

    const buttons = findAll(overlay, el => el.tag === 'button');
    assert.deepEqual(buttons.map(b => b.textContent), ['Restart Game', 'View Board']);
    fake.document.click(buttons[1]);
    t.mock.timers.tick(500);

    assert.equal(overlay.classList.contains('visible'), false);
    assert.equal(overlay.style.display, 'none');
    assert.equal(globalThis.window.location.href, 'http://localhost/');
  } finally {
    globalThis.document = saved;
  }
});
