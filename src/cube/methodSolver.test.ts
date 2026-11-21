import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMove, createSolvedCube, generateScramble, isCubeSolved, parseAlgorithm } from './cubeLogic';
import {
  countBadZZEdges,
  getActiveMethodProgress,
  getGoalColorsFromCenters,
  isDCrossSolved,
  isF2LSolved,
  isFirstLayerSolved,
  isOLLSolved,
  isRouxFirstBlockSolved,
  isRouxSecondBlockSolved,
  isTopCrossOriented,
  isUCornersSolved,
  isZZEOLineSolved,
  solveCubeWithMethod,
} from './methodSolver';
import type { CubeMove, CubieState, SolveMethodId } from './types';

function applySeq(start: CubieState[], moves: readonly CubeMove[]): CubieState[] {
  let s = start;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

function scrambleWithSeed(seed: number, extraTokens: string[] = []): CubieState[] {
  let state = createSolvedCube('3x3');
  const scr = generateScramble('3x3', seed);
  state = applySeq(state, scr);
  if (extraTokens.length) {
    state = applySeq(state, parseAlgorithm(extraTokens, '3x3'));
  }
  return state;
}

const TEST_SEEDS = Array.from({ length: 30 }, (_, i) => 101 + i * 7919);

test('Beginner (LBL) solves 30 random scrambles and satisfies every intermediate layer invariant', () => {
  for (const seed of TEST_SEEDS) {
    const start = scrambleWithSeed(seed);
    const goal = getGoalColorsFromCenters(start);
    const plan = solveCubeWithMethod(start, 'beginner', '3x3');

    assert.equal(plan.isStateBased, true, `seed ${seed}: must use state-based solver`);
    assert.equal(plan.phases.length, 7, `seed ${seed}: Beginner has 7 phases`);

    let cur = start;
    // Stage 1: Cross
    cur = applySeq(cur, plan.phases[0].moves);
    assert.equal(isDCrossSolved(cur, goal), true, `seed ${seed}: D-cross solved after stage 1`);

    // Stage 2: First layer corners
    cur = applySeq(cur, plan.phases[1].moves);
    assert.equal(isFirstLayerSolved(cur, goal), true, `seed ${seed}: First layer solved after stage 2`);

    // Stage 3: Middle layer edges
    cur = applySeq(cur, plan.phases[2].moves);
    assert.equal(isF2LSolved(cur, goal), true, `seed ${seed}: F2L solved after stage 3`);

    // Stage 4: Top cross
    cur = applySeq(cur, plan.phases[3].moves);
    assert.equal(isTopCrossOriented(cur, goal), true, `seed ${seed}: Top cross oriented after stage 4`);

    // Remaining stages -> fully solved
    cur = applySeq(cur, plan.phases[4].moves);
    cur = applySeq(cur, plan.phases[5].moves);
    cur = applySeq(cur, plan.phases[6].moves);
    assert.equal(isCubeSolved(cur, '3x3'), true, `seed ${seed}: Cube fully solved at end of Beginner`);
  }
});

test('CFOP solves 30 random scrambles with verified Cross → F2L → OLL → PLL invariants', () => {
  for (const seed of TEST_SEEDS) {
    const start = scrambleWithSeed(seed);
    const goal = getGoalColorsFromCenters(start);
    const plan = solveCubeWithMethod(start, 'cfop', '3x3');

    assert.equal(plan.isStateBased, true, `seed ${seed}: must use state-based CFOP`);
    assert.equal(plan.phases.length, 4, `seed ${seed}: CFOP has 4 phases`);

    let cur = start;
    cur = applySeq(cur, plan.phases[0].moves);
    assert.equal(isDCrossSolved(cur, goal), true, `seed ${seed}: Cross solved`);

    cur = applySeq(cur, plan.phases[1].moves);
    assert.equal(isF2LSolved(cur, goal), true, `seed ${seed}: F2L solved`);

    cur = applySeq(cur, plan.phases[2].moves);
    assert.equal(isOLLSolved(cur, goal), true, `seed ${seed}: OLL solved`);

    cur = applySeq(cur, plan.phases[3].moves);
    assert.equal(isCubeSolved(cur, '3x3'), true, `seed ${seed}: PLL finishes cube`);
  }
});

test('Roux solves 30 random scrambles with verified 1st Block → 2nd Block → CMLL → LSE invariants', () => {
  for (const seed of TEST_SEEDS) {
    const start = scrambleWithSeed(seed);
    const goal = getGoalColorsFromCenters(start);
    const plan = solveCubeWithMethod(start, 'roux', '3x3');

    assert.equal(plan.isStateBased, true, `seed ${seed}: must use state-based Roux`);
    assert.equal(plan.phases.length, 4, `seed ${seed}: Roux has 4 phases`);

    let cur = start;
    cur = applySeq(cur, plan.phases[0].moves);
    assert.equal(isRouxFirstBlockSolved(cur, goal), true, `seed ${seed}: First Block solved`);

    cur = applySeq(cur, plan.phases[1].moves);
    assert.equal(isRouxSecondBlockSolved(cur, goal), true, `seed ${seed}: Second Block solved`);

    cur = applySeq(cur, plan.phases[2].moves);
    assert.equal(isRouxSecondBlockSolved(cur, goal), true, `seed ${seed}: CMLL preserves blocks`);
    assert.equal(isUCornersSolved(cur, goal), true, `seed ${seed}: CMLL solves U corners`);

    cur = applySeq(cur, plan.phases[3].moves);
    assert.equal(isCubeSolved(cur, '3x3'), true, `seed ${seed}: LSE finishes cube`);
  }
});

test('ZZ / ZOLL solves 30 random scrambles with verified EOLine → ZZF2L → ZOLL → EPLL invariants', () => {
  for (const seed of TEST_SEEDS) {
    const start = scrambleWithSeed(seed);
    const goal = getGoalColorsFromCenters(start);
    const plan = solveCubeWithMethod(start, 'zz', '3x3');

    assert.equal(plan.isStateBased, true, `seed ${seed}: must use state-based ZZ/ZOLL`);
    assert.equal(plan.phases.length, 4, `seed ${seed}: ZZ has 4 phases`);

    let cur = start;
    cur = applySeq(cur, plan.phases[0].moves);
    assert.equal(countBadZZEdges(cur, goal), 0, `seed ${seed}: 0 bad edges after EOLine`);
    assert.equal(isZZEOLineSolved(cur, goal), true, `seed ${seed}: EOLine solved`);

    cur = applySeq(cur, plan.phases[1].moves);
    assert.equal(isF2LSolved(cur, goal), true, `seed ${seed}: ZZF2L solves F2L`);
    assert.equal(isTopCrossOriented(cur, goal), true, `seed ${seed}: Top cross automatically oriented after ZZF2L`);

    cur = applySeq(cur, plan.phases[2].moves);
    assert.equal(isOLLSolved(cur, goal), true, `seed ${seed}: ZOLL solves OLL`);
    assert.equal(isF2LSolved(cur, goal), true, `seed ${seed}: ZOLL preserves F2L`);

    cur = applySeq(cur, plan.phases[3].moves);
    assert.equal(isCubeSolved(cur, '3x3'), true, `seed ${seed}: EPLL finishes cube`);
  }
});

test('All 4 methods solve rotated & middle-sliced cubes (M, E, S, x, y, z) and Mirror Blocks', () => {
  const methods: SolveMethodId[] = ['beginner', 'cfop', 'roux', 'zz'];
  const rotatedState = scrambleWithSeed(4242, ['x', 'M', "y'", 'E', 'z', "S'"]);

  for (const m of methods) {
    const plan = solveCubeWithMethod(rotatedState, m, '3x3');
    assert.equal(plan.isStateBased, true, `${m} state-based on rotated cube`);
    const finalState = applySeq(rotatedState, plan.allMoves);
    assert.equal(isCubeSolved(finalState, '3x3'), true, `${m} solves x/y/z/M/E/S scrambled cube`);
  }

  // Mirror Blocks isomorphism check
  let mirrorState = createSolvedCube('mirror');
  mirrorState = applySeq(mirrorState, generateScramble('mirror', 9001));
  const mirrorPlan = solveCubeWithMethod(mirrorState, 'cfop', 'mirror');
  assert.equal(mirrorPlan.isStateBased, true);
  assert.equal(isCubeSolved(applySeq(mirrorState, mirrorPlan.allMoves), 'mirror'), true);
});

test('getActiveMethodProgress tracks phase boundaries and sub-steps accurately', () => {
  const start = scrambleWithSeed(777);
  const plan = solveCubeWithMethod(start, 'cfop', '3x3');

  const p0 = getActiveMethodProgress(plan, 0);
  assert.equal(p0.isComplete, false);
  assert.ok(p0.phase !== null);

  const midF2L = plan.phases[1].startMoveIndex;
  const pF2L = getActiveMethodProgress(plan, midF2L);
  assert.equal(pF2L.phase?.id, 'cfop-f2l');

  const done = getActiveMethodProgress(plan, plan.totalMoves);
  assert.equal(done.isComplete, true);
  assert.equal(done.completedPhaseCount, plan.phases.length);
});
