import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMove,
  createSolvedCube,
  getPuzzleSize,
  invertMove,
  isCubeSolved,
} from './cubeLogic';
import {
  getPatternMoves,
  getPatternPreviewGrid,
  hexNumberToCss,
  simulatePatternCubieStates,
  STICKER_PATTERN_TEMPLATES,
} from './patternTemplates';
import type { FaceKey, PuzzleType } from './types';

const ALL_FACES: FaceKey[] = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const ALL_PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];

test('solved template uses zero moves and leaves every puzzle solved', () => {
  for (const puzzle of ALL_PUZZLES) {
    assert.equal(getPatternMoves('solved', puzzle).length, 0);
    const state = simulatePatternCubieStates(puzzle, 'solved');
    assert.equal(isCubeSolved(state, puzzle), true);
  }
});

test('every custom template preserves exact WCA sticker counts (N^2 per color) and physical cubie structure', () => {
  const customTemplates = STICKER_PATTERN_TEMPLATES.filter((t) => t.id !== 'solved');

  for (const tpl of customTemplates) {
    for (const puzzle of ALL_PUZZLES) {
      const size = getPuzzleSize(puzzle);
      const expectedPerColor = size * size;
      const moves = getPatternMoves(tpl.id, puzzle);
      assert.ok(moves.length > 0, `${tpl.id} on ${puzzle} must have >= 1 legal move`);
      assert.equal(
        moves.length,
        tpl.movesByPuzzle[puzzle].length,
        `${tpl.id} on ${puzzle}: every notation token must parse cleanly`
      );

      const solved = createSolvedCube(puzzle);
      const patterned = simulatePatternCubieStates(puzzle, tpl.id);
      assert.equal(patterned.length, solved.length);

      // 1. Exact N^2 stickers of each of the 6 WCA colors (never violates color counts!)
      const colorCounts: Record<FaceKey, number> = {
        px: 0,
        nx: 0,
        py: 0,
        ny: 0,
        pz: 0,
        nz: 0,
      };
      for (const cubie of patterned) {
        for (const color of Object.values(cubie.stickers) as FaceKey[]) {
          colorCounts[color] += 1;
        }
      }
      for (const fk of ALL_FACES) {
        assert.equal(
          colorCounts[fk],
          expectedPerColor,
          `${tpl.id} on ${puzzle}: expected ${expectedPerColor} stickers of ${fk}, got ${colorCounts[fk]}`
        );
      }

      // 2. Physical cubie multiset invariant: every cubie keeps its exact original set of sticker colors
      for (let i = 0; i < patterned.length; i++) {
        const origColors = Object.values(solved[i].stickers).sort();
        const nextColors = Object.values(patterned[i].stickers).sort();
        assert.deepEqual(
          nextColors,
          origColors,
          `${tpl.id} on ${puzzle}: cubie ${i} must never change its physical sticker colors`
        );
      }

      // 3. Reversibility invariant: applying inverse moves returns cleanly to solved state
      let reversed = patterned;
      for (let i = moves.length - 1; i >= 0; i--) {
        reversed = applyMove(reversed, invertMove(moves[i]));
      }
      assert.equal(
        isCubeSolved(reversed, puzzle),
        true,
        `${tpl.id} on ${puzzle} must be 100% legally solvable back to solved`
      );

      // 4. Pattern must actually differ from solved state
      assert.equal(
        isCubeSolved(patterned, puzzle),
        false,
        `${tpl.id} on ${puzzle} must produce a visible non-solved pattern`
      );
    }
  }
});

test('3x3 checkerboard, h-stripes, v-stripes, cross, center-dot, cube-in-cube, and superflip produce authentic face layouts', () => {
  // Checkerboard: alternating opposite colors on Front (pz: Green / Blue)
  const cb = getPatternPreviewGrid('checkerboard', 'pz', '3x3');
  assert.deepEqual(cb, [
    ['pz', 'nz', 'pz'],
    ['nz', 'pz', 'nz'],
    ['pz', 'nz', 'pz'],
  ]);

  // H-Stripes: crisp horizontal center band on Front (pz) and Right (px)
  const hs = getPatternPreviewGrid('h-stripes', 'pz', '3x3');
  assert.deepEqual(hs, [
    ['pz', 'pz', 'pz'],
    ['nz', 'nz', 'nz'],
    ['pz', 'pz', 'pz'],
  ]);

  // V-Stripes: crisp vertical center pillar on Front (pz)
  const vs = getPatternPreviewGrid('v-stripes', 'pz', '3x3');
  assert.deepEqual(vs, [
    ['pz', 'nz', 'pz'],
    ['pz', 'nz', 'pz'],
    ['pz', 'nz', 'pz'],
  ]);

  // Center Dots (6-Spot): all 8 outer stickers identical, single center cap distinct
  const cd = getPatternPreviewGrid('center-dot', 'pz', '3x3');
  const outer = cd[0][0];
  assert.notEqual(cd[1][1], outer);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) continue;
      assert.equal(cd[r][c], outer, `center-dot outer tile (${r},${c}) must match`);
    }
  }

  // Plus Cross: center row & center col share the cross color distinct from the 4 corners
  const cr = getPatternPreviewGrid('cross', 'pz', '3x3');
  const cornerColor = cr[0][0];
  const crossColor = cr[1][1];
  assert.notEqual(cornerColor, crossColor);
  assert.equal(cr[0][2], cornerColor);
  assert.equal(cr[2][0], cornerColor);
  assert.equal(cr[2][2], cornerColor);
  assert.equal(cr[0][1], crossColor);
  assert.equal(cr[1][0], crossColor);
  assert.equal(cr[1][2], crossColor);
  assert.equal(cr[2][1], crossColor);

  // Superflip: all 4 corners + center stay pz, while all 4 edges are flipped to adjacent colors
  const sf = getPatternPreviewGrid('superflip', 'pz', '3x3');
  assert.equal(sf[0][0], 'pz');
  assert.equal(sf[0][2], 'pz');
  assert.equal(sf[1][1], 'pz');
  assert.equal(sf[2][0], 'pz');
  assert.equal(sf[2][2], 'pz');
  assert.notEqual(sf[0][1], 'pz');
  assert.notEqual(sf[1][0], 'pz');
  assert.notEqual(sf[1][2], 'pz');
  assert.notEqual(sf[2][1], 'pz');

  // Cube in Cube: 3 distinct colors visible on Front face (pz)
  const cic = getPatternPreviewGrid('cube-in-cube', 'pz', '3x3');
  assert.equal(new Set(cic.flat()).size, 3);
});

test('hexNumberToCss formats 24-bit color numbers cleanly', () => {
  assert.equal(hexNumberToCss(0x008f4c), '#008f4c');
  assert.equal(hexNumberToCss(0xf7f7f4), '#f7f7f4');
});
