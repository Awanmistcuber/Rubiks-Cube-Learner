import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, createSolvedCube, isCubeSolved, parseAlgorithm } from './cubeLogic';
import {
  buildColorCalibration,
  createSolvedScannedFaces,
  recalibrateScannedFaces,
  sampleGridFromRgba,
  type RgbTriplet,
  type ScannedRgbFaces,
} from './cubeScanner';
import { solveCubeWithMethod } from './methodSolver';
import {
  computeBasicAlgorithmHintsAsync,
  recalibrateScannedFacesAsync,
  sampleAndClassifyFaceAsync,
  solveCubeWithMethodAsync,
} from './cubeWorkerClient';

function buildScrambled3x3(alg: string) {
  let cubies = createSolvedCube('3x3');
  for (const move of parseAlgorithm(alg, '3x3')) {
    cubies = applyMove(cubies, move);
  }
  return cubies;
}

test('solveCubeWithMethodAsync matches solveCubeWithMethod across all 4 methods', async () => {
  const scrambled = buildScrambled3x3("R U R' F' D2 L B' U2 R2 F");
  for (const method of ['beginner', 'cfop', 'roux', 'zz'] as const) {
    const syncPlan = solveCubeWithMethod(scrambled, method, '3x3', []);
    const asyncPlan = await solveCubeWithMethodAsync(scrambled, method, '3x3', []);
    assert.equal(asyncPlan.methodId, syncPlan.methodId);
    assert.equal(asyncPlan.totalMoves, syncPlan.totalMoves);
    assert.deepEqual(
      asyncPlan.allMoves.map((m) => m.notation),
      syncPlan.allMoves.map((m) => m.notation)
    );

    let verify = scrambled;
    for (const move of asyncPlan.allMoves) {
      verify = applyMove(verify, move);
    }
    assert.equal(isCubeSolved(verify, '3x3'), true, `${method} async plan must solve cube`);
  }
});

test('computeBasicAlgorithmHintsAsync returns all 4 local methods cleanly', async () => {
  const scrambled = buildScrambled3x3("R U R' U' F' U F");
  const hints = await computeBasicAlgorithmHintsAsync(scrambled);
  assert.equal(hints.length, 4);
  assert.deepEqual(
    hints.map((h) => h.id),
    ['cfop', 'beginner', 'roux', 'zz']
  );
  for (const option of hints) {
    assert.ok(option.moveCount > 0, `${option.id} should have solution moves`);
    assert.equal(option.nextMove, option.moves[0]);
  }
});

test('sampleAndClassifyFaceAsync preserves orange vs red distinction and matches sync sampler', async () => {
  const size = 90;
  const rgba = new Uint8ClampedArray(size * size * 4);
  // Fill entire frame with vibrant orange RGB (235, 118, 22)
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = 235;
    rgba[i * 4 + 1] = 118;
    rgba[i * 4 + 2] = 22;
    rgba[i * 4 + 3] = 255;
  }

  const syncRgbs = sampleGridFromRgba(rgba, size, size, 0.62);
  const asyncResult = await sampleAndClassifyFaceAsync(rgba, size, size, 0.62);

  assert.deepEqual(asyncResult.rgbs, syncRgbs);
  assert.equal(asyncResult.facesGrid.length, 9);
  for (const face of asyncResult.facesGrid) {
    assert.equal(face, 'L', 'Orange sticker should classify as L (Orange), not R (Red)');
  }
});

test('recalibrateScannedFacesAsync matches recalibrateScannedFaces exactly', async () => {
  const fillFace = (rgb: RgbTriplet): RgbTriplet[] => Array.from({ length: 9 }, () => rgb);
  const rgbFaces: ScannedRgbFaces = {
    U: fillFace([236, 238, 240]),
    R: fillFace([202, 34, 40]),
    F: fillFace([24, 156, 72]),
    D: fillFace([238, 206, 28]),
    L: fillFace([238, 114, 20]),
    B: fillFace([28, 86, 206]),
  };
  const base = createSolvedScannedFaces();
  const cal = buildColorCalibration(rgbFaces);
  assert.ok(cal.centers.L && cal.centers.R);

  const syncResult = recalibrateScannedFaces(rgbFaces, base);
  const asyncResult = await recalibrateScannedFacesAsync(rgbFaces, base);
  assert.deepEqual(asyncResult, syncResult);
});
