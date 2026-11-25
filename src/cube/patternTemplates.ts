import { getLayerCoordinates, getPuzzleSize } from './cubeLogic';
import type { CubieState, FaceKey, PuzzleType } from './types';

export type StickerPatternId =
  | 'solved'
  | 'checkerboard'
  | 'h-stripes'
  | 'v-stripes'
  | 'cross'
  | 'center-dot'
  | 'cube-in-cube'
  | 'diagonal';

export interface StickerPatternTemplate {
  id: StickerPatternId;
  name: string;
  tag: string;
  description: string;
}

export const STICKER_PATTERN_TEMPLATES: readonly StickerPatternTemplate[] = [
  {
    id: 'solved',
    name: 'Classic Solved',
    tag: 'Solid',
    description: 'Uniform standard face colors on every side.',
  },
  {
    id: 'checkerboard',
    name: 'Checkerboard',
    tag: '2-Tone',
    description: 'Alternating opposite-face tiles across all six sides.',
  },
  {
    id: 'h-stripes',
    name: 'H-Stripes',
    tag: 'Bands',
    description: 'Contrasting horizontal bands wrapped across every face.',
  },
  {
    id: 'v-stripes',
    name: 'V-Stripes',
    tag: 'Pillars',
    description: 'Vertical column stripes running top to bottom.',
  },
  {
    id: 'cross',
    name: 'Plus Cross',
    tag: 'Cross',
    description: 'Bold centered plus cross in opposite face colors.',
  },
  {
    id: 'center-dot',
    name: 'Center Dots',
    tag: '6-Spot',
    description: 'Iconic contrasting center spot on every face.',
  },
  {
    id: 'cube-in-cube',
    name: 'Cube in Cube',
    tag: 'Nested',
    description: 'Three-tone nested corner optical illusion.',
  },
  {
    id: 'diagonal',
    name: 'Diagonal',
    tag: 'Slash',
    description: 'Crisp diagonal stripe cutting across each face.',
  },
] as const;

export const OPPOSITE_FACE: Record<FaceKey, FaceKey> = {
  px: 'nx',
  nx: 'px',
  py: 'ny',
  ny: 'py',
  pz: 'nz',
  nz: 'pz',
};

/**
 * High-contrast adjacent accent colors paired with each base face
 * so multi-tone patterns pop clearly across all Studio & custom palettes.
 */
export const PRIMARY_ACCENT_FACE: Record<FaceKey, FaceKey> = {
  py: 'nz', // White -> Blue
  ny: 'pz', // Yellow -> Green
  pz: 'py', // Green -> White
  nz: 'ny', // Blue -> Yellow
  px: 'py', // Red -> White
  nx: 'ny', // Orange -> Yellow
};

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
 * Resolves the target FaceKey color for a single sticker at (row, col) on a given face.
 */
export function resolvePatternStickerColor(
  patternId: StickerPatternId,
  face: FaceKey,
  row: number,
  col: number,
  size: number
): FaceKey {
  const opp = OPPOSITE_FACE[face];
  const primary = PRIMARY_ACCENT_FACE[face];

  switch (patternId) {
    case 'solved':
      return face;

    case 'checkerboard':
      return (row + col) % 2 === 1 ? opp : face;

    case 'h-stripes':
      return row % 2 === 1 ? primary : face;

    case 'v-stripes':
      return col % 2 === 1 ? primary : face;

    case 'cross': {
      if (size === 2) {
        return row === 1 || col === 0 ? opp : face;
      }
      if (size === 4) {
        const inMiddleRow = row === 1 || row === 2;
        const inMiddleCol = col === 1 || col === 2;
        return inMiddleRow || inMiddleCol ? opp : face;
      }
      const mid = Math.floor(size / 2);
      return row === mid || col === mid ? opp : face;
    }

    case 'center-dot': {
      if (size === 2) {
        return row === 0 && col === 0 ? primary : face;
      }
      if (size === 4) {
        const isCenter = (row === 1 || row === 2) && (col === 1 || col === 2);
        return isCenter ? primary : face;
      }
      const mid = Math.floor(size / 2);
      return row === mid && col === mid ? primary : face;
    }

    case 'cube-in-cube': {
      // Converge nested rings at the (+x,+y,+z) corner for (py,pz,px)
      // and at the (-x,-y,-z) corner for (ny,nz,nx), cycling the 3 corner colors
      // so the nested 2x2 and 1x1 cubes read as true 3D solids.
      const max = size - 1;
      const distFromCorner =
        face === 'pz'
          ? Math.max(row, max - col)
          : face === 'px'
            ? Math.max(row, col)
            : face === 'py' || face === 'nz'
              ? Math.max(max - row, max - col)
              : Math.max(max - row, col); // nx, ny

      const cycle1: Record<FaceKey, FaceKey> = {
        py: 'pz',
        pz: 'px',
        px: 'py',
        ny: 'nz',
        nz: 'nx',
        nx: 'ny',
      };
      const cycle2: Record<FaceKey, FaceKey> = {
        py: 'px',
        pz: 'py',
        px: 'pz',
        ny: 'nx',
        nz: 'ny',
        nx: 'nz',
      };

      if (size === 2) {
        return distFromCorner === 0 ? cycle1[face] : face;
      }
      if (size === 4) {
        if (distFromCorner <= 1) return cycle2[face];
        if (distFromCorner === 2) return cycle1[face];
        return face;
      }
      // 3x3 iconic Cube-in-a-Cube-in-a-Cube
      if (distFromCorner === 0) return cycle2[face];
      if (distFromCorner === 1) return cycle1[face];
      return face;
    }

    case 'diagonal':
      return row === col ? opp : face;
  }
}

/**
 * Returns a new array of CubieStates with stickers repainted according to the chosen template.
 * Intended to be applied on a solved cube layout so every face displays the full crisp pattern.
 */
export function applyPatternToCubieStates(
  cubies: CubieState[],
  puzzleType: PuzzleType,
  patternId: StickerPatternId
): CubieState[] {
  const size = getPuzzleSize(puzzleType);

  return cubies.map((cubie) => {
    const nextStickers: Partial<Record<FaceKey, FaceKey>> = {};
    for (const face of Object.keys(cubie.stickers) as FaceKey[]) {
      const { row, col } = getStickerGridCoords(cubie.pos, face, size);
      nextStickers[face] = resolvePatternStickerColor(patternId, face, row, col, size);
    }
    return {
      ...cubie,
      stickers: nextStickers,
    };
  });
}

/**
 * Builds a 2D preview matrix (default 3x3 on the front face) for rendering UI swatch icons.
 */
export function getPatternPreviewGrid(
  patternId: StickerPatternId,
  face: FaceKey = 'pz',
  size = 3
): FaceKey[][] {
  const grid: FaceKey[][] = [];
  for (let row = 0; row < size; row++) {
    const line: FaceKey[] = [];
    for (let col = 0; col < size; col++) {
      line.push(resolvePatternStickerColor(patternId, face, row, col, size));
    }
    grid.push(line);
  }
  return grid;
}

export function hexNumberToCss(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}
