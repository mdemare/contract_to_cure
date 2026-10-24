import assert from 'node:assert/strict';
import test from 'node:test';

const { DIFFICULTY_LEVELS, difficultyLabel, gameDifficulty } = await import('../../public/js/difficulty.js');

test('the difficulty levels match the backend and its epidemic counts', () => {
  assert.deepEqual(DIFFICULTY_LEVELS.map(level => [level.value, level.epidemics]),
    [['introductory', 4], ['normal', 5], ['heroic', 6]]);
});

test('difficulty levels get readable labels', () => {
  assert.equal(difficultyLabel('introductory'), 'Introductory');
  assert.equal(difficultyLabel('normal'), 'Normal');
  assert.equal(difficultyLabel('heroic'), 'Heroic');
  assert.equal(difficultyLabel('legendary'), 'Unknown');
});

test('a game state without a valid difficulty falls back to heroic', () => {
  assert.equal(gameDifficulty({ gameStatus: { difficulty_level: 'normal' } }), 'normal');
  assert.equal(gameDifficulty({ gameStatus: { difficulty_level: 'legendary' } }), 'heroic');
  assert.equal(gameDifficulty({ gameStatus: {} }), 'heroic');
  assert.equal(gameDifficulty(null), 'heroic');
});
