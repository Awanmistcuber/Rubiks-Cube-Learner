import {
  applyMove,
  createSolvedCube,
  getLayerCoordinates,
  getPuzzleSize,
  parseAlgorithm,
} from './cubeLogic';
import type { CubeMove, CubieState, FaceKey, PuzzleType } from './types';

export type StickerPatternId =
  | 'solved'
  | 'checkerboard'
  | 'h-stripes'
  | 'v-stripes'
  | 'cross'
  | 'center-dot'
  | 'cube-in-cube'
  | 'superflip';

export interface StickerPatternTemplate {
  id: StickerPatternId;
  name: string;
  tag: string;
  description: string;
  /** Authentic legal WCA move sequences per puzzle size (preserves exact physical cubie & color invariants). */
  movesByPuzzle: Record<PuzzleType, readonly string[]>;
}

// Verified authentic 3x3 WCA pattern algorithms (100% legal, solvable, exact 9 stickers per color)
const MOVES_3X3_CHECKERBOARD = ['M2', 'E2', 'S2'] as const;
const MOVES_3X3_H_STRIPES = ['E2'] as const;
const MOVES_3X3_V_STRIPES = ['M2'] as const;
// Classic 4-Crosses (creates crisp + crosses on F, R, B, L with contrasting rings on U, D)
const MOVES_3X3_CROSS = ['U', 'F', "B'", 'L2', 'U2', 'L2', "F'", 'B', 'U2', 'L2', 'U'] as const;
// Classic 6-Spot / Center Dots (swaps all 6 center caps cleanly)
const MOVES_3X3_CENTER_DOT = ['M', "E'", "M'", 'E'] as const;
// Classic Cube in a Cube in a Cube anchored right at the camera-facing (+x,+y,+z) URF corner
const MOVES_3X3_CUBE_IN_CUBE = [
  "U'", "L'", "U'", "F'", 'R2', "B'", 'R', 'F', 'U', 'B2', 'U', "B'", 'L', "U'", 'F', 'U', 'R', "F'",
] as const;
// World-famous 20-move Superflip (all 12 edges flipped in place across all 6 faces)
const MOVES_3X3_SUPERFLIP = [
  'U', 'R2', 'F', 'B', 'R', 'B2', 'R', 'U2', 'L', 'B2', 'R', "U'", "D'", 'R2', 'F', "R'", 'L', 'B2', 'U2', 'F2',
] as const;

export const STICKER_PATTERN_TEMPLATES: readonly StickerPatternTemplate[] = [
  {
    id: 'solved',
    name: 'Classic Solved',
    tag: 'Solid',
    description: 'Clean solved WCA state with uniform colors on every side.',
    movesByPuzzle: {
      '2x2': [],
      '3x3': [],
      '4x4': [],
      mirror: [],
    },
  },
  {
    id: 'checkerboard',
    name: 'Checkerboard',
    tag: '2-Tone',
    description: 'Authentic 6-face opposite checkerboard via legal slice half-turns.',
    movesByPuzzle: {
      '2x2': ['R2', 'F2', 'U2'],
      '3x3': MOVES_3X3_CHECKERBOARD,
      '4x4': ['L2', 'Rw2', 'R2', 'D2', 'Uw2', 'U2', 'B2', 'Fw2', 'F2'],
      mirror: MOVES_3X3_CHECKERBOARD,
    },
  },
  {
    id: 'h-stripes',
    name: 'H-Stripes',
    tag: 'Bands',
    description: 'Contrasting horizontal equatorial bands across all four side faces.',
    movesByPuzzle: {
      '2x2': ['U2'],
      '3x3': MOVES_3X3_H_STRIPES,
      '4x4': ['D2', 'Uw2', 'U2'],
      mirror: MOVES_3X3_H_STRIPES,
    },
  },
  {
    id: 'v-stripes',
    name: 'V-Stripes',
    tag: 'Pillars',
    description: 'Vertical center column stripes wrapping Front, Top, Back, and Bottom.',
    movesByPuzzle: {
      '2x2': ['R2'],
      '3x3': MOVES_3X3_V_STRIPES,
      '4x4': ['L2', 'Rw2', 'R2'],
      mirror: MOVES_3X3_V_STRIPES,
    },
  },
  {
    id: 'cross',
    name: 'Plus Cross',
    tag: '4-Cross',
    description: 'Classic legal 3×3 Cross algorithm preserving all 9 stickers per color.',
    movesByPuzzle: {
      '2x2': ['R2', 'U2', 'R2'],
      '3x3': MOVES_3X3_CROSS,
      '4x4': MOVES_3X3_CROSS,
      mirror: MOVES_3X3_CROSS,
    },
  },
  {
    id: 'center-dot',
    name: 'Center Dots',
    tag: '6-Spot',
    description: 'Iconic 6-Spot pattern cycling every face center cap via legal M/E turns.',
    movesByPuzzle: {
      '2x2': ['R', 'U', "R'", 'F2', 'U2', 'F2'],
      '3x3': MOVES_3X3_CENTER_DOT,
      '4x4': MOVES_3X3_CENTER_DOT,
      mirror: MOVES_3X3_CENTER_DOT,
    },
  },
  {
    id: 'cube-in-cube',
    name: 'Cube in Cube',
    tag: 'Nested',
    description: 'Authentic Cube-in-a-Cube-in-a-Cube nested corner optical illusion.',
    movesByPuzzle: {
      '2x2': ['F', 'R', 'U', "R'", "U'", "F'"],
      '3x3': MOVES_3X3_CUBE_IN_CUBE,
      '4x4': MOVES_3X3_CUBE_IN_CUBE,
      mirror: MOVES_3X3_CUBE_IN_CUBE,
    },
  },
  {
    id: 'superflip',
    name: 'Superflip',
    tag: 'Edges',
    description: 'Famous 20-move God’s Number pattern flipping all 12 edges in place.',
    movesByPuzzle: {
      '2x2': ['R', 'U2', "R'", "U'", 'R', "U'", "R'", 'F2'],
      '3x3': MOVES_3X3_SUPERFLIP,
      '4x4': MOVES_3X3_SUPERFLIP,
      mirror: MOVES_3X3_SUPERFLIP,
    },
  },
] as const;

export function getPatternTemplate(patternId: StickerPatternId): StickerPatternTemplate {
  return (
    STICKER_PATTERN_TEMPLATES.find((t) => t.id === patternId) ?? STICKER_PATTERN_TEMPLATES[0]
  );
}

/**
 * Returns the parsed legal CubeMove sequence that transforms a solved puzzle into the pattern.
 */
export function getPatternMoves(
  patternId: StickerPatternId,
  puzzleType: PuzzleType
): CubeMove[] {
  const tpl = getPatternTemplate(patternId);
  const tokens = tpl.movesByPuzzle[puzzleType] ?? [];
  if (tokens.length === 0) return [];
  return parseAlgorithm([...tokens], puzzleType);
}

function coordToIndex(value: number, coords: number[]): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dist = Math.abs(coords[i] - value);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Maps a cubie's 3D grid position onto its 2D (row, col) coordinates (0..size-1)
 * when looking directly at the given exterior face.
 */
export function getStickerGridCoords(
  pos: [number, number, number],
  face: FaceKey,
  size: number
): { row: number; col: number } {
  const coords = getLayerCoordinates(size);
  const ix = coordToIndex(pos[0], coords);
  const iy = coordToIndex(pos[1], coords);
  const iz = coordToIndex(pos[2], coords);
  const max = size - 1;

  switch (face) {
    case 'pz': // Front (+z): top is +y, right is +x
      return { row: max - iy, col: ix };
    case 'nz': // Back (-z): top is +y, right is -x
      return { row: max - iy, col: max - ix };
    case 'px': // Right (+x): top is +y, right is -z
      return { row: max - iy, col: max - iz };
    case 'nx': // Left (-x): top is +y, right is +z
      return { row: max - iy, col: iz };
    case 'py': // Up (+y): top is -z, right is +x
      return { row: iz, col: ix };
    case 'ny': // Down (-y): top is +z, right is +x
      return { row: max - iz, col: ix };
  }
}

/**
 * Simulates the legal move sequence on a fresh solved cube and returns the resulting CubieState[].
 * Guaranteed to satisfy all physical cubie & WCA color conservation invariants.
 */
export function simulatePatternCubieStates(
  puzzleType: PuzzleType,
  patternId: StickerPatternId
): CubieState[] {
  let state = createSolvedCube(puzzleType);
  const moves = getPatternMoves(patternId, puzzleType);
  for (const move of moves) {
    state = applyMove(state, move);
  }
  return state;
}

const previewCache = new Map<string, FaceKey[][]>();

/**
 * Builds a 2D preview matrix by simulating the exact legal move sequence on a virtual cube,
 * guaranteeing 1:1 visual match with the 3D Rubik's Cube.
 */
export function getPatternPreviewGrid(
  patternId: StickerPatternId,
  face: FaceKey = 'pz',
  puzzleType: PuzzleType = '3x3'
): FaceKey[][] {
  const cacheKey = `${patternId}:${face}:${puzzleType}`;
  const cached = previewCache.get(cacheKey);
  if (cached) return cached;

  const size = getPuzzleSize(puzzleType);
  const state = simulatePatternCubieStates(puzzleType, patternId);
  const grid: FaceKey[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => face)
  );

  for (const cubie of state) {
    const color = cubie.stickers[face];
    if (!color) continue;
    const { row, col } = getStickerGridCoords(cubie.pos, face, size);
    grid[row][col] = color;
  }

  previewCache.set(cacheKey, grid);
  return grid;
}

export function hexNumberToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}
