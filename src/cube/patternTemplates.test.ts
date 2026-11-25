import assert from 'node:assert/strict';
import test from 'node:test';
import { createSolvedCube, isCubeSolved } from './cubeLogic';
import {
  applyPatternToCubieStates,
  getPatternPreviewGrid,
  getStickerGridCoords,
  hexNumberToCss,
  OPPOSITE_FACE,
  resolvePatternStickerColor,
  STICKER_PATTERN_TEMPLATES,
  type StickerPatternId,
} from './patternTemplates';
import type { FaceKey, PuzzleType } from './types';

const ALL_FACES = new Set<FaceKey>(['px', 'nx', 'py', 'ny', 'pz', 'nz']);
const ALL_PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];

test('solved template restores uniform solved stickers across all puzzle sizes', () => {
  for (const puzzle of ALL_PUZZLES) {
    const solved = createSolvedCube(puzzle);
    const painted = applyPatternToCubieStates(solved, puzzle, 'solved');
    assert.equal(painted.length, solved.length);
    assert.equal(isCubeSolved(painted, puzzle), true, `${puzzle} should remain solved`);
  }
});

test('checkerboard produces alternating base and opposite colors on every face', () => {
  for (const puzzle of ['2x2', '3x3', '4x4'] as PuzzleType[]) {
    const solved = createSolvedCube(puzzle);
    const painted = applyPatternToCubieStates(solved, puzzle, 'checkerboard');
    const size = puzzle === '2x2' ? 2 : puzzle === '4x4' ? 4 : 3;

    for (const cubie of painted) {
      for (const [face, color] of Object.entries(cubie.stickers) as [FaceKey, FaceKey][]) {
        const { row, col } = getStickerGridCoords(cubie.pos, face, size);
        const expected = (row + col) % 2 === 1 ? OPPOSITE_FACE[face] : face;
        assert.equal(
          color,
          expected,
          `${puzzle} face=${face} (${row},${col}) expected ${expected}, got ${color}`
        );
      }
    }
  }
});

test('every custom non-solved template produces valid, multi-color stickers on all 6 faces', () => {
  const customPatterns = STICKER_PATTERN_TEMPLATES.filter((t) => t.id !== 'solved');

  for (const template of customPatterns) {
    for (const puzzle of ALL_PUZZLES) {
      const base = createSolvedCube(puzzle);
      const painted = applyPatternToCubieStates(base, puzzle, template.id);
      assert.equal(painted.length, base.length);

      const faceColorsSeen = new Map<FaceKey, Set<FaceKey>>();

      for (let i = 0; i < painted.length; i++) {
        const origKeys = Object.keys(base[i].stickers).sort();
        const nextKeys = Object.keys(painted[i].stickers).sort();
        assert.deepEqual(nextKeys, origKeys, 'must preserve exact exterior sticker keys');

        for (const face of nextKeys as FaceKey[]) {
          const color = painted[i].stickers[face];
          assert.ok(color && ALL_FACES.has(color), `valid FaceKey color for ${template.id}`);
          if (!faceColorsSeen.has(face)) faceColorsSeen.set(face, new Set());
          faceColorsSeen.get(face)!.add(color);
        }
      }

      assert.equal(faceColorsSeen.size, 6, `${template.id} on ${puzzle} covers all 6 faces`);
      for (const [face, colors] of faceColorsSeen.entries()) {
        assert.ok(
          colors.size >= 2,
          `${template.id} on ${puzzle} face ${face} should contain at least 2 distinct colors`
        );
      }
    }
  }
});

test('cross, stripes, center-dot, cube-in-cube, and diagonal match exact 3x3 layouts', () => {
  const check3x3 = (pattern: StickerPatternId, expectedMask: number[][]) => {
    const grid = getPatternPreviewGrid(pattern, 'pz', 3);
    assert.equal(grid.length, 3);
    for (let r = 0; r < 3; r++) {
      assert.equal(grid[r].length, 3);
      for (let c = 0; c < 3; c++) {
        const isBase = grid[r][c] === 'pz';
        assert.equal(
          isBase ? 0 : 1,
          expectedMask[r][c],
          `${pattern} at (${r},${c}) mask mismatch`
        );
      }
    }
  };

  check3x3('cross', [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ]);

  check3x3('h-stripes', [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ]);

  check3x3('v-stripes', [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ]);

  check3x3('center-dot', [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ]);

  check3x3('diagonal', [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);

  // Cube in Cube uses 3 distinct colors on 3x3
  const cicGrid = getPatternPreviewGrid('cube-in-cube', 'pz', 3);
  const uniqueCic = new Set(cicGrid.flat());
  assert.equal(uniqueCic.size, 3);
  assert.equal(cicGrid[0][2], resolvePatternStickerColor('cube-in-cube', 'pz', 0, 2, 3));
});

test('hexNumberToCss formats 24-bit color numbers with leading zeros', () => {
  assert.equal(hexNumberToCss(0x008f4c), '#008f4c');
  assert.equal(hexNumberToCss(0xf7f7f4), '#f7f7f4');
  assert.equal(hexNumberToCss(0x000000), '#000000');
});
