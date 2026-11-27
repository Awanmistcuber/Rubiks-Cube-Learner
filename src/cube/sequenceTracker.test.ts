import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotation } from './cubeLogic.ts';
import {
  advanceSequenceStep,
  clearSequenceWrongState,
  createSequenceTracker,
  evaluateSequenceMove,
  getNextExpectedToken,
  parseNotationSequenceInput,
  restoreSequenceHalfTurn,
  stepBackSequence,
} from './sequenceTracker.ts';

test('evaluateSequenceMove marks correct moves green and advances immediately', () => {
  let tracker = createSequenceTracker(['U', 'D', 'L', 'F', 'R']);
  assert.equal(getNextExpectedToken(tracker), 'U');

  const uMove = parseNotation('U', '3x3')!;
  tracker = evaluateSequenceMove(tracker, uMove, '3x3');
  assert.equal(tracker.currentIndex, 1);
  assert.deepEqual(tracker.statuses, ['correct', 'pending', 'pending', 'pending', 'pending']);
  assert.equal(getNextExpectedToken(tracker), 'D');
  assert.equal(tracker.lastWrongNotation, null);
});

test('evaluateSequenceMove marks wrong move red without advancing and recovers on correct move', () => {
  let tracker = createSequenceTracker(['R', 'U', "R'", "U'"]);
  tracker = evaluateSequenceMove(tracker, parseNotation('R', '3x3')!, '3x3');
  assert.equal(tracker.currentIndex, 1);
  assert.equal(tracker.statuses[0], 'correct');

  // Perform wrong move F instead of U
  tracker = evaluateSequenceMove(tracker, parseNotation('F', '3x3')!, '3x3');
  assert.equal(tracker.currentIndex, 1);
  assert.equal(tracker.statuses[1], 'wrong');
  assert.equal(tracker.lastWrongNotation, 'F');
  assert.equal(tracker.expectedOnWrong, 'U');
  assert.equal(getNextExpectedToken(tracker), 'U');

  // Undo clears wrong indicator back to pending
  const cleared = clearSequenceWrongState(tracker);
  assert.equal(cleared.statuses[1], 'pending');
  assert.equal(cleared.lastWrongNotation, null);

  // Performing U marks index 1 correct and advances to R'
  tracker = evaluateSequenceMove(cleared, parseNotation('U', '3x3')!, '3x3');
  assert.equal(tracker.currentIndex, 2);
  assert.equal(tracker.statuses[1], 'correct');
  assert.equal(getNextExpectedToken(tracker), "R'");
});

test('evaluateSequenceMove supports 180-degree double turns via single U2 or two U turns', () => {
  // Single U2
  let t1 = createSequenceTracker(['U2', 'R']);
  t1 = evaluateSequenceMove(t1, parseNotation('U2', '3x3')!, '3x3');
  assert.equal(t1.currentIndex, 1);
  assert.equal(t1.statuses[0], 'correct');

  // Two quarter turns U + U
  let t2 = createSequenceTracker(['U2', 'R']);
  t2 = evaluateSequenceMove(t2, parseNotation('U', '3x3')!, '3x3');
  assert.equal(t2.currentIndex, 0);
  assert.ok(t2.halfTurnDirection !== null);
  assert.equal(t2.statuses[0], 'pending');

  t2 = evaluateSequenceMove(t2, parseNotation('U', '3x3')!, '3x3');
  assert.equal(t2.currentIndex, 1);
  assert.equal(t2.statuses[0], 'correct');
  assert.equal(t2.halfTurnDirection, null);
});

test('parseNotationSequenceInput normalizes faces, slices M/E/S, and rotations x/y/z', () => {
  const res = parseNotationSequenceInput("u d l f r m e' s2 X y' Z2 badToken", '3x3');
  assert.deepEqual(res.tokens, ['U', 'D', 'L', 'F', 'R', 'M', "E'", 'S2', 'x', "y'", 'z2']);
  assert.deepEqual(res.invalidTokens, ['badToken']);
});

test('advanceSequenceStep marks step correct and advances cursor', () => {
  let tracker = createSequenceTracker(['R', 'U']);
  tracker = advanceSequenceStep(tracker);
  assert.equal(tracker.currentIndex, 1);
  assert.deepEqual(tracker.statuses, ['correct', 'pending']);
});

test('stepBackSequence and restoreSequenceHalfTurn trace back cleanly without losing notation steps', () => {
  let tracker = createSequenceTracker(['D2', 'U2', 'R']);
  tracker = advanceSequenceStep(tracker);
  tracker = advanceSequenceStep(tracker);
  assert.equal(tracker.currentIndex, 2);
  assert.deepEqual(tracker.statuses, ['correct', 'correct', 'pending']);

  // Undo step 2 -> returns cleanly to index 1 with all 3 tokens preserved
  tracker = stepBackSequence(tracker);
  assert.equal(tracker.currentIndex, 1);
  assert.deepEqual(tracker.tokens, ['D2', 'U2', 'R']);
  assert.deepEqual(tracker.statuses, ['correct', 'pending', 'pending']);
  assert.equal(getNextExpectedToken(tracker), 'U2');

  // Undo step 1 -> returns cleanly to index 0 with D2 active again
  tracker = stepBackSequence(tracker);
  assert.equal(tracker.currentIndex, 0);
  assert.deepEqual(tracker.tokens, ['D2', 'U2', 'R']);
  assert.deepEqual(tracker.statuses, ['pending', 'pending', 'pending']);
  assert.equal(getNextExpectedToken(tracker), 'D2');

  // Half-turn undo restores halfTurnDirection cleanly
  tracker = evaluateSequenceMove(tracker, parseNotation('D', '3x3')!, '3x3');
  assert.ok(tracker.halfTurnDirection !== null);
  tracker = restoreSequenceHalfTurn(tracker, null);
  assert.equal(tracker.halfTurnDirection, null);
  assert.equal(tracker.currentIndex, 0);
});

