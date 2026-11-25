import test from 'node:test';
import assert from 'node:assert/strict';
import Cube from 'cubejs';
import { applyMove, createSolvedCube, isCubeSolved, parseAlgorithm } from './cubeLogic';
import {
  applyNotationToScannedFaces,
  buildScannedFacesFromScramble,
  classifyRgbToWcaFace,
  computeBasicAlgorithmHints,
  createSolvedScannedFaces,
  cubieStatesToFacelets,
  describeMoveInstruction,
  recalibrateScannedFaces,
  rgbToLab,
  SAMPLE_SCAN_PRESETS,
  scannedFacesToCubieStates,
  scannedFacesToFacelets,
  validateScannedCube,
  type ScannedRgbFaces,
} from './cubeScanner';

// Initialize Kociemba solver once for deterministic round-trip verification
Cube.initSolver();

test('Kociemba URFDLB mapping round-trips every WCA scramble and solves back to 100% solved state', () => {
  const scrambles = [
    "R U R' U'",
    "R U R' U' R' F R2 U' R' U' R U R' F'",
    "R U2 F' D L2 B' U R2 F D' L U' B2 R'",
    "F B' L2 D' R U' B2 D2 L F' R2 U",
  ];

  for (const scramble of scrambles) {
    let cubies = createSolvedCube('3x3');
    for (const mv of parseAlgorithm(scramble, '3x3')) {
      cubies = applyMove(cubies, mv);
    }

    const faces = buildScannedFacesFromScramble(scramble);
    const validation = validateScannedCube(faces);
    assert.equal(validation.valid, true, `Scramble ${scramble} should validate: ${validation.error}`);
    assert.equal(validation.facelets, cubieStatesToFacelets(cubies));

    // Solve via real Kociemba Two-Phase Algorithm!
    const kociembaCube = Cube.fromString(validation.facelets);
    const solutionStr = kociembaCube.solve().trim();
    const solutionMoves = parseAlgorithm(solutionStr, '3x3');
    assert.ok(solutionMoves.length > 0 && solutionMoves.length <= 24, `Expected near-optimal Kociemba solution, got ${solutionMoves.length} moves`);

    // Apply Kociemba moves back onto reconstructed CubieState[] and verify 100% solved!
    let reconstructed = scannedFacesToCubieStates(faces);
    for (const mv of solutionMoves) {
      reconstructed = applyMove(reconstructed, mv);
    }
    assert.equal(
      isCubeSolved(reconstructed, '3x3'),
      true,
      `Kociemba solution "${solutionStr}" must solve scramble "${scramble}"`
    );
  }
});

test('all basic algorithms (CFOP, Beginner, Roux, ZZ) solve scanned physical cubes cleanly', () => {
  const faces = buildScannedFacesFromScramble(SAMPLE_SCAN_PRESETS[2].scramble);
  const cubies = scannedFacesToCubieStates(faces);
  const hints = computeBasicAlgorithmHints(cubies);

  assert.equal(hints.length, 4);
  for (const opt of hints) {
    assert.ok(opt.nextMove, `Expected nextMove for ${opt.id}`);
    assert.ok(opt.moveCount > 0, `Expected positive moveCount for ${opt.id}`);

    let state = cubies;
    for (const mv of parseAlgorithm(opt.moves.join(' '), '3x3')) {
      state = applyMove(state, mv);
    }
    assert.equal(isCubeSolved(state, '3x3'), true, `Method ${opt.id} must completely solve scanned cube`);
  }
});

test('validateScannedCube catches sticker count errors, corner twist parity, edge flip parity, and permutation parity', () => {
  // 1. Sticker count error
  const badCount = createSolvedScannedFaces();
  badCount.U[0] = 'R';
  const rCount = validateScannedCube(badCount);
  assert.equal(rCount.valid, false);
  assert.match(rCount.error ?? '', /count mismatch/i);

  // 2. Single twisted corner (UFR corner twisted clockwise)
  const twisted = createSolvedScannedFaces();
  // U[8] (U), R[0] (R), F[2] (F) -> rotate U->R->F->U
  twisted.U[8] = 'F';
  twisted.R[0] = 'U';
  twisted.F[2] = 'R';
  const rTwist = validateScannedCube(twisted);
  assert.equal(rTwist.valid, false);
  assert.match(rTwist.error ?? '', /twist parity/i);

  // 3. Single flipped edge (UF edge swapped U[7] <-> F[1])
  const flipped = createSolvedScannedFaces();
  flipped.U[7] = 'F';
  flipped.F[1] = 'U';
  const rFlip = validateScannedCube(flipped);
  assert.equal(rFlip.valid, false);
  assert.match(rFlip.error ?? '', /flip parity/i);

  // 4. Single edge swap (permutation parity error: swap UF and UR edges)
  const swapped = createSolvedScannedFaces();
  swapped.F[1] = 'R';
  swapped.R[1] = 'F';
  const rParity = validateScannedCube(swapped);
  assert.equal(rParity.valid, false);
  assert.match(rParity.error ?? '', /permutation parity/i);
});

test('CIELAB classifier and 6-center dynamic white-balance recalibration accurately distinguish all 6 WCA colors', () => {
  assert.equal(classifyRgbToWcaFace([240, 242, 245]), 'U');
  assert.equal(classifyRgbToWcaFace([248, 215, 30]), 'D');
  assert.equal(classifyRgbToWcaFace([195, 28, 32]), 'R');
  assert.equal(classifyRgbToWcaFace([245, 118, 18]), 'L');
  assert.equal(classifyRgbToWcaFace([22, 160, 70]), 'F');
  assert.equal(classifyRgbToWcaFace([24, 82, 210]), 'B');

  // Warm tungsten lighting tint: calibrate using 6 centers sampled under warm light
  const warmCenters: Record<'U' | 'R' | 'F' | 'D' | 'L' | 'B', [number, number, number]> = {
    U: [248, 228, 198],
    D: [250, 205, 42],
    R: [195, 42, 32],
    L: [244, 128, 34],
    F: [42, 152, 74],
    B: [38, 92, 182],
  };

  const rgbFaces: ScannedRgbFaces = {
    U: Array(9).fill(warmCenters.U),
    R: Array(9).fill(warmCenters.R),
    F: Array(9).fill(warmCenters.F),
    D: Array(9).fill(warmCenters.D),
    L: Array(9).fill(warmCenters.L),
    B: Array(9).fill(warmCenters.B),
  };
  // Put an orange sticker on the U face under warm lighting
  rgbFaces.U = [...rgbFaces.U!];
  rgbFaces.U[0] = [240, 125, 36];

  const calibrated = recalibrateScannedFaces(rgbFaces, createSolvedScannedFaces());
  assert.equal(calibrated.U[0], 'L');
  assert.equal(calibrated.U[4], 'U');
  assert.equal(calibrated.U[8], 'U');
  assert.ok(rgbToLab(warmCenters.U)[0] > 85);
});

test('applyNotationToScannedFaces and describeMoveInstruction produce accurate next-step feedback', () => {
  const faces = buildScannedFacesFromScramble("R");
  const solvedAfterInv = applyNotationToScannedFaces(faces, "R'");
  assert.equal(
    scannedFacesToFacelets(solvedAfterInv),
    scannedFacesToFacelets(createSolvedScannedFaces())
  );

  const instr = describeMoveInstruction("R'");
  assert.equal(instr.face, 'R');
  assert.equal(instr.direction, 'ccw');
  assert.match(instr.summary, /Right \(Red\).*counter-clockwise/i);

  const instr2 = describeMoveInstruction('U2');
  assert.equal(instr2.direction, 'double');
  assert.match(instr2.turnLabel, /180/);
});
