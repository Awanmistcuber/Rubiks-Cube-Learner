import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove,
  computeMoveFromSwipe,
  computeSolutionFromHistory,
  createSolvedCube,
  generateScramble,
  isCubeSolved,
  parseAlgorithm,
  parseNotation,
  simplifyMoves,
} from './cubeLogic';
import type { PuzzleType } from './types';

test('createSolvedCube generates expected surface cubie counts and starts solved', () => {
  const cases: { type: PuzzleType; expectedCount: number }[] = [
    { type: '2x2', expectedCount: 8 },
    { type: '3x3', expectedCount: 26 },
    { type: '4x4', expectedCount: 56 },
    { type: 'mirror', expectedCount: 26 },
  ];

  for (const { type, expectedCount } of cases) {
    const cubies = createSolvedCube(type);
    assert.equal(cubies.length, expectedCount, `${type} should have ${expectedCount} surface cubies`);
    assert.equal(isCubeSolved(cubies, type), true, `${type} should start solved`);
  }
});

test('applying any single quarter turn 4 times returns cube to solved state', () => {
  const moves = ['R', 'L', 'U', 'D', 'F', 'B'];
  for (const puzzle of ['2x2', '3x3', '4x4', 'mirror'] as PuzzleType[]) {
    for (const token of moves) {
      let state = createSolvedCube(puzzle);
      const move = parseNotation(token, puzzle);
      assert.ok(move, `Failed to parse ${token} for ${puzzle}`);

      state = applyMove(state, move);
      assert.equal(isCubeSolved(state, puzzle), false, `${puzzle} after ${token} should not be solved`);

      state = applyMove(state, move);
      state = applyMove(state, move);
      state = applyMove(state, move);
      assert.equal(isCubeSolved(state, puzzle), true, `${puzzle} after 4x ${token} must be solved`);
    }
  }
});

test('group theory invariant: Sexy Move (R U R\' U\') repeated 6 times restores 3x3 identity', () => {
  let state = createSolvedCube('3x3');
  const sexy = parseAlgorithm("R U R' U'", '3x3');
  assert.equal(sexy.length, 4);

  for (let rep = 0; rep < 6; rep++) {
    for (const m of sexy) {
      state = applyMove(state, m);
    }
    if (rep < 5) {
      assert.equal(isCubeSolved(state, '3x3'), false);
    }
  }
  assert.equal(isCubeSolved(state, '3x3'), true);
});

test('scramble and computed solution return solved state across all 4 puzzle types', () => {
  for (const puzzle of ['2x2', '3x3', '4x4', 'mirror'] as PuzzleType[]) {
    let state = createSolvedCube(puzzle);
    const scramble = generateScramble(puzzle, 1337);
    assert.ok(scramble.length >= 9);

    for (const m of scramble) {
      state = applyMove(state, m);
    }
    assert.equal(isCubeSolved(state, puzzle), false, `${puzzle} should be scrambled`);

    const solution = computeSolutionFromHistory(scramble, puzzle);
    for (const m of solution) {
      state = applyMove(state, m);
    }
    assert.equal(isCubeSolved(state, puzzle), true, `${puzzle} solution must solve cube`);
  }
});

test('simplifyMoves cancels inverses and merges consecutive turns on same slice', () => {
  const moves = parseAlgorithm("R R' U U F F F", '3x3');
  const simplified = simplifyMoves(moves, '3x3');
  assert.deepEqual(
    simplified.map((m) => m.notation),
    ['U2', "F'"]
  );
});

test('computeMoveFromSwipe maps front-face upward swipe on right column to R move', () => {
  const move = computeMoveFromSwipe([1, 0, 1], [0, 0, 1], [0, 1, 0], '3x3');
  assert.ok(move);
  assert.equal(move.axis, 'x');
  assert.equal(move.notation, 'R');
  assert.deepEqual(move.layers, [1]);
});

test('computeMoveFromSwipe maps front-face leftward swipe on top row to U move', () => {
  const move = computeMoveFromSwipe([0, 1, 1], [0, 0, 1], [-1, 0, 0], '3x3');
  assert.ok(move);
  assert.equal(move.axis, 'y');
  assert.equal(move.notation, 'U');
  assert.deepEqual(move.layers, [1]);
});

test('center slice notations M, E, S work on 3x3/4x4/mirror and are null on 2x2', () => {
  for (const slice of ['M', 'E', 'S']) {
    assert.equal(parseNotation(slice, '2x2'), null, `${slice} should not parse on 2x2`);
  }

  for (const puzzle of ['3x3', '4x4', 'mirror'] as PuzzleType[]) {
    for (const slice of ['M', "M'", 'E', "E'", 'S', "S'"]) {
      let state = createSolvedCube(puzzle);
      const move = parseNotation(slice, puzzle);
      assert.ok(move, `Failed to parse ${slice} on ${puzzle}`);
      state = applyMove(state, move);
      assert.equal(isCubeSolved(state, puzzle), false, `${puzzle} after ${slice} should be scrambled`);
      for (let i = 0; i < 3; i++) {
        state = applyMove(state, move);
      }
      assert.equal(isCubeSolved(state, puzzle), true, `${puzzle} after 4x ${slice} must return solved`);
    }
  }
});

test('whole-cube rotations x, y, z preserve solved state and simplify cleanly across all puzzles', () => {
  for (const puzzle of ['2x2', '3x3', '4x4', 'mirror'] as PuzzleType[]) {
    for (const rot of ['x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2']) {
      const move = parseNotation(rot, puzzle);
      assert.ok(move, `Failed to parse ${rot} on ${puzzle}`);
      const solved = createSolvedCube(puzzle);
      const rotated = applyMove(solved, move);
      assert.equal(isCubeSolved(rotated, puzzle), true, `${puzzle} after ${rot} must remain solved`);
    }
  }

  const simplified = simplifyMoves(parseAlgorithm("x x y y' z z z", '3x3'), '3x3');
  assert.deepEqual(
    simplified.map((m) => m.notation),
    ['x2', "z'"]
  );
  assert.equal(parseNotation('xw', '3x3'), null);
  assert.equal(parseNotation('Mw', '3x3'), null);
});

