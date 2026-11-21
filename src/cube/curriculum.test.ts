import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMove, createSolvedCube, isCubeSolved, parseAlgorithm } from './cubeLogic';
import { ALGORITHM_PRESETS, CURRICULUM } from './curriculum';
import type { PuzzleType } from './types';

test('Every curriculum lesson setupMoves + algorithm solves cleanly across all puzzles', () => {
  const puzzles: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];
  for (const puzzle of puzzles) {
    const lessons = CURRICULUM[puzzle];
    assert.ok(lessons.length > 0, `${puzzle} has lessons`);

    for (const lesson of lessons) {
      let state = createSolvedCube(puzzle);
      const setup = parseAlgorithm(lesson.setupMoves, puzzle);
      assert.equal(
        setup.length,
        lesson.setupMoves.length,
        `${lesson.id}: all setup moves parse cleanly`
      );
      for (const m of setup) state = applyMove(state, m);

      assert.equal(
        isCubeSolved(state, puzzle),
        false,
        `${lesson.id}: setupMoves must produce an unsolved state`
      );

      const alg = parseAlgorithm(lesson.algorithm, puzzle);
      assert.equal(
        alg.length,
        lesson.algorithm.length,
        `${lesson.id}: all algorithm moves parse cleanly`
      );
      for (const m of alg) state = applyMove(state, m);

      assert.equal(
        isCubeSolved(state, puzzle),
        true,
        `${lesson.id}: setupMoves + algorithm must return puzzle to solved`
      );
    }
  }
});

test('3x3 curriculum covers all 4 solving methods (Beginner, CFOP, Roux, ZZ/ZOLL)', () => {
  const methods = new Set(CURRICULUM['3x3'].map((l) => l.method));
  assert.equal(methods.has('beginner'), true);
  assert.equal(methods.has('cfop'), true);
  assert.equal(methods.has('roux'), true);
  assert.equal(methods.has('zz'), true);
});

test('All Algorithm Presets parse cleanly for every listed puzzle type', () => {
  for (const preset of ALGORITHM_PRESETS) {
    for (const puzzle of preset.puzzleTypes) {
      const parsed = parseAlgorithm(preset.notation, puzzle);
      assert.equal(
        parsed.length,
        preset.notation.length,
        `Preset ${preset.id} parses cleanly for ${puzzle}`
      );
    }
  }
});
