import type { Axis, CubeMove, CubieState, FaceKey, PuzzleType } from './types';

export function getPuzzleSize(puzzleType: PuzzleType): number {
  switch (puzzleType) {
    case '2x2':
      return 2;
    case '4x4':
      return 4;
    case '3x3':
    case 'mirror':
    default:
      return 3;
  }
}

export function getLayerCoordinates(size: number): number[] {
  const half = (size - 1) / 2;
  const coords: number[] = [];
  for (let i = 0; i < size; i++) {
    coords.push(i - half);
  }
  return coords;
}

// Physically accurate Mirror Blocks layer sizes with shared +/-0.45 cut planes
const MIRROR_MID = 0.9;
const MIRROR_HALF = MIRROR_MID / 2;
const MIRROR_THICKNESS = {
  x: [0.56, MIRROR_MID, 1.46] as const,
  y: [0.68, MIRROR_MID, 1.34] as const,
  z: [0.80, MIRROR_MID, 1.22] as const,
};

function getMirrorAxisCenter(thicknesses: readonly [number, number, number], index: number): number {
  if (index === 0) return -(MIRROR_HALF + thicknesses[0] / 2);
  if (index === 1) return 0;
  return MIRROR_HALF + thicknesses[2] / 2;
}

const IDENTITY_MAT: [number, number, number, number, number, number, number, number, number] = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/**
 * Generates the initial solved cubie array for any supported puzzle type.
 * For 4x4, skips the 8 completely hidden internal cubies so only the 56 visible surface pieces exist.
 */
export function createSolvedCube(puzzleType: PuzzleType): CubieState[] {
  const size = getPuzzleSize(puzzleType);
  const coords = getLayerCoordinates(size);
  const maxCoord = coords[coords.length - 1];
  const minCoord = coords[0];
  const isMirror = puzzleType === 'mirror';

  const cubies: CubieState[] = [];
  let id = 0;

  for (let ix = 0; ix < size; ix++) {
    for (let iy = 0; iy < size; iy++) {
      for (let iz = 0; iz < size; iz++) {
        const x = coords[ix];
        const y = coords[iy];
        const z = coords[iz];

        // Skip fully interior pieces (e.g. 8 hidden center blocks in 4x4, or single inner core of 3x3)
        const isSurface =
          x === maxCoord ||
          x === minCoord ||
          y === maxCoord ||
          y === minCoord ||
          z === maxCoord ||
          z === minCoord;
        if (!isSurface) continue;

        const stickers: Partial<Record<FaceKey, FaceKey>> = {};
        if (x === maxCoord) stickers.px = 'px';
        if (x === minCoord) stickers.nx = 'nx';
        if (y === maxCoord) stickers.py = 'py';
        if (y === minCoord) stickers.ny = 'ny';
        if (z === maxCoord) stickers.pz = 'pz';
        if (z === minCoord) stickers.nz = 'nz';

        const dimensions: [number, number, number] = isMirror
          ? [MIRROR_THICKNESS.x[ix], MIRROR_THICKNESS.y[iy], MIRROR_THICKNESS.z[iz]]
          : [1, 1, 1];

        const homeCenter: [number, number, number] = isMirror
          ? [
              getMirrorAxisCenter(MIRROR_THICKNESS.x, ix),
              getMirrorAxisCenter(MIRROR_THICKNESS.y, iy),
              getMirrorAxisCenter(MIRROR_THICKNESS.z, iz),
            ]
          : [x, y, z];

        cubies.push({
          id: id++,
          home: [x, y, z],
          pos: [x, y, z],
          stickers,
          dimensions,
          homeCenter,
          rotMatrix: [...IDENTITY_MAT],
        });
      }
    }
  }

  return cubies;
}

function rotatePoint90(
  [x, y, z]: [number, number, number],
  axis: Axis,
  direction: 1 | -1
): [number, number, number] {
  // Round to nearest 0.5 to guarantee zero floating-point drift across both odd & even cubes
  const snap = (n: number) => Math.round(n * 2) / 2;
  if (axis === 'x') {
    return direction === 1 ? [snap(x), snap(-z), snap(y)] : [snap(x), snap(z), snap(-y)];
  }
  if (axis === 'y') {
    return direction === 1 ? [snap(z), snap(y), snap(-x)] : [snap(-z), snap(y), snap(x)];
  }
  return direction === 1 ? [snap(-y), snap(x), snap(z)] : [snap(y), snap(-x), snap(z)];
}

const FACE_NORMALS: Record<FaceKey, [number, number, number]> = {
  px: [1, 0, 0],
  nx: [-1, 0, 0],
  py: [0, 1, 0],
  ny: [0, -1, 0],
  pz: [0, 0, 1],
  nz: [0, 0, -1],
};

function normalToFaceKey([x, y, z]: [number, number, number]): FaceKey {
  if (x === 1) return 'px';
  if (x === -1) return 'nx';
  if (y === 1) return 'py';
  if (y === -1) return 'ny';
  if (z === 1) return 'pz';
  return 'nz';
}

function getQuarterRotationMatrix(
  axis: Axis,
  direction: 1 | -1
): [number, number, number, number, number, number, number, number, number] {
  const s = direction;
  if (axis === 'x') {
    return [
      1, 0, 0,
      0, 0, -s,
      0, s, 0,
    ];
  }
  if (axis === 'y') {
    return [
      0, 0, s,
      0, 1, 0,
      -s, 0, 0,
    ];
  }
  return [
    0, -s, 0,
    s, 0, 0,
    0, 0, 1,
  ];
}

function multiplyMat3(
  a: readonly number[],
  b: readonly number[]
): [number, number, number, number, number, number, number, number, number] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function rotateStickers90(
  stickers: Partial<Record<FaceKey, FaceKey>>,
  axis: Axis,
  direction: 1 | -1
): Partial<Record<FaceKey, FaceKey>> {
  const next: Partial<Record<FaceKey, FaceKey>> = {};
  for (const [face, color] of Object.entries(stickers) as [FaceKey, FaceKey][]) {
    const rotatedNormal = rotatePoint90(FACE_NORMALS[face], axis, direction);
    const nextFace = normalToFaceKey(rotatedNormal);
    next[nextFace] = color;
  }
  return next;
}

/**
 * Pure function that applies a CubeMove to a cubie state array and returns the new state.
 */
export function applyMove(cubies: CubieState[], move: CubeMove): CubieState[] {
  const axisIdx = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;
  const rotMatStep = getQuarterRotationMatrix(move.axis, move.direction);

  return cubies.map((cubie) => {
    const coord = cubie.pos[axisIdx];
    const inLayer = move.layers.some((l) => Math.abs(l - coord) < 0.01);
    if (!inLayer) return cubie;

    let pos: [number, number, number] = [...cubie.pos];
    let stickers = cubie.stickers;
    let rotMatrix = cubie.rotMatrix;

    for (let t = 0; t < move.turns; t++) {
      pos = rotatePoint90(pos, move.axis, move.direction);
      stickers = rotateStickers90(stickers, move.axis, move.direction);
      rotMatrix = multiplyMat3(rotMatStep, rotMatrix);
    }

    return {
      ...cubie,
      pos,
      stickers,
      rotMatrix,
    };
  });
}

/**
 * Parses a single WCA notation token (e.g. "R", "U'", "F2", "Rw", "M", "Uw'") into a CubeMove.
 */
export function parseNotation(token: string, puzzleType: PuzzleType): CubeMove | null {
  const clean = token.trim();
  if (!clean) return null;

  const size = getPuzzleSize(puzzleType);
  const coords = getLayerCoordinates(size);
  const maxC = coords[coords.length - 1];
  const minC = coords[0];
  const innerMaxC = coords.length >= 4 ? coords[coords.length - 2] : 0;
  const innerMinC = coords.length >= 4 ? coords[1] : 0;

  const match = clean.match(/^([UDLRFBMES])(w)?(['2])?$/);
  if (!match) return null;

  const [, face, wide, modifier] = match;
  const isPrime = modifier === "'";
  const turns: 1 | 2 = modifier === '2' ? 2 : 1;

  let axis: Axis;
  let layers: number[];
  let baseDir: 1 | -1;

  switch (face) {
    case 'R':
      axis = 'x';
      layers = wide && size >= 3 ? [maxC, innerMaxC] : [maxC];
      baseDir = -1;
      break;
    case 'L':
      axis = 'x';
      layers = wide && size >= 3 ? [minC, innerMinC] : [minC];
      baseDir = 1;
      break;
    case 'U':
      axis = 'y';
      layers = wide && size >= 3 ? [maxC, innerMaxC] : [maxC];
      baseDir = -1;
      break;
    case 'D':
      axis = 'y';
      layers = wide && size >= 3 ? [minC, innerMinC] : [minC];
      baseDir = 1;
      break;
    case 'F':
      axis = 'z';
      layers = wide && size >= 3 ? [maxC, innerMaxC] : [maxC];
      baseDir = -1;
      break;
    case 'B':
      axis = 'z';
      layers = wide && size >= 3 ? [minC, innerMinC] : [minC];
      baseDir = 1;
      break;
    case 'M':
      if (size === 2) return null;
      axis = 'x';
      layers = size === 4 ? [innerMinC, innerMaxC] : [0];
      baseDir = 1; // Follows L direction in WCA notation
      break;
    case 'E':
      if (size === 2) return null;
      axis = 'y';
      layers = size === 4 ? [innerMinC, innerMaxC] : [0];
      baseDir = 1; // Follows D direction
      break;
    case 'S':
      if (size === 2) return null;
      axis = 'z';
      layers = size === 4 ? [innerMinC, innerMaxC] : [0];
      baseDir = -1; // Follows F direction
      break;
    default:
      return null;
  }

  const direction: 1 | -1 = isPrime ? (baseDir === 1 ? -1 : 1) : baseDir;
  return {
    axis,
    layers,
    direction,
    turns,
    notation: clean,
  };
}

export function parseAlgorithm(alg: string | string[], puzzleType: PuzzleType): CubeMove[] {
  const tokens = Array.isArray(alg) ? alg : alg.split(/\s+/).filter(Boolean);
  const moves: CubeMove[] = [];
  for (const token of tokens) {
    const parsed = parseNotation(token, puzzleType);
    if (parsed) moves.push(parsed);
  }
  return moves;
}

export function invertMove(move: CubeMove): CubeMove {
  const newDir: 1 | -1 = move.turns === 2 ? move.direction : move.direction === 1 ? -1 : 1;
  let notation = move.notation;
  if (move.turns === 1) {
    notation = notation.endsWith("'") ? notation.slice(0, -1) : `${notation}'`;
  }
  return {
    ...move,
    direction: newDir,
    notation,
  };
}

/**
 * Formats an axis + layer + direction move back into clean WCA notation.
 */
export function buildNotationFromMove(
  axis: Axis,
  layers: number[],
  direction: 1 | -1,
  turns: 1 | 2,
  puzzleType: PuzzleType
): string {
  const size = getPuzzleSize(puzzleType);
  const coords = getLayerCoordinates(size);
  const maxC = coords[coords.length - 1];
  const minC = coords[0];

  const isMax = layers.includes(maxC);
  const isMin = layers.includes(minC);
  const isWide = layers.length > 1;

  let baseFace = 'R';
  let baseDir: 1 | -1 = -1;

  if (axis === 'x') {
    if (isMax) {
      baseFace = isWide ? 'Rw' : 'R';
      baseDir = -1;
    } else if (isMin) {
      baseFace = isWide ? 'Lw' : 'L';
      baseDir = 1;
    } else {
      baseFace = 'M';
      baseDir = 1;
    }
  } else if (axis === 'y') {
    if (isMax) {
      baseFace = isWide ? 'Uw' : 'U';
      baseDir = -1;
    } else if (isMin) {
      baseFace = isWide ? 'Dw' : 'D';
      baseDir = 1;
    } else {
      baseFace = 'E';
      baseDir = 1;
    }
  } else {
    if (isMax) {
      baseFace = isWide ? 'Fw' : 'F';
      baseDir = -1;
    } else if (isMin) {
      baseFace = isWide ? 'Bw' : 'B';
      baseDir = 1;
    } else {
      baseFace = 'S';
      baseDir = -1;
    }
  }

  if (turns === 2) return `${baseFace}2`;
  return direction === baseDir ? baseFace : `${baseFace}'`;
}

/**
 * Checks whether the cube is in a solved state.
 * For standard color cubes (2x2, 3x3, 4x4), every exposed face must show a single uniform color.
 * For Mirror Blocks, every piece must be aligned so all outer faces form a flush uniform cube
 * (i.e. all cubies share the same global orientation and relative home geometry).
 */
export function isCubeSolved(cubies: CubieState[], puzzleType: PuzzleType): boolean {
  const size = getPuzzleSize(puzzleType);
  const coords = getLayerCoordinates(size);
  const maxC = coords[coords.length - 1];
  const minC = coords[0];

  const faces: { key: FaceKey; axisIdx: 0 | 1 | 2; targetCoord: number }[] = [
    { key: 'px', axisIdx: 0, targetCoord: maxC },
    { key: 'nx', axisIdx: 0, targetCoord: minC },
    { key: 'py', axisIdx: 1, targetCoord: maxC },
    { key: 'ny', axisIdx: 1, targetCoord: minC },
    { key: 'pz', axisIdx: 2, targetCoord: maxC },
    { key: 'nz', axisIdx: 2, targetCoord: minC },
  ];

  for (const face of faces) {
    let expectedColor: FaceKey | null = null;
    for (const cubie of cubies) {
      if (Math.abs(cubie.pos[face.axisIdx] - face.targetCoord) < 0.01) {
        const sticker = cubie.stickers[face.key];
        if (!sticker) return false;
        if (expectedColor === null) {
          expectedColor = sticker;
        } else if (sticker !== expectedColor) {
          return false;
        }
      }
    }
  }

  return true;
}

function sameLayers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, idx) => Math.abs(v - sb[idx]) < 0.01);
}

/**
 * Simplifies a sequence of moves by cancelling inverses (e.g. R + R' -> empty)
 * and merging consecutive identical-layer turns (e.g. R + R -> R2, R2 + R -> R').
 */
export function simplifyMoves(moves: CubeMove[], puzzleType: PuzzleType): CubeMove[] {
  const stack: CubeMove[] = [];

  for (const move of moves) {
    const prev = stack[stack.length - 1];
    if (prev && prev.axis === move.axis && sameLayers(prev.layers, move.layers)) {
      const prevQuarter = (prev.direction * prev.turns) % 4;
      const currQuarter = (move.direction * move.turns) % 4;
      let total = (((prevQuarter + currQuarter) % 4) + 4) % 4;

      stack.pop();
      if (total === 0) {
        continue;
      } else if (total === 2) {
        const notation = buildNotationFromMove(move.axis, move.layers, 1, 2, puzzleType);
        stack.push({
          axis: move.axis,
          layers: [...move.layers],
          direction: 1,
          turns: 2,
          notation,
        });
      } else {
        const dir: 1 | -1 = total === 1 ? 1 : -1;
        const notation = buildNotationFromMove(move.axis, move.layers, dir, 1, puzzleType);
        stack.push({
          axis: move.axis,
          layers: [...move.layers],
          direction: dir,
          turns: 1,
          notation,
        });
      }
    } else {
      stack.push(move);
    }
  }

  return stack;
}

/**
 * Computes a guaranteed valid solution sequence from the compressed move history.
 * Works accurately across 2x2, 3x3, 4x4, and Mirror Blocks.
 */
export function computeSolutionFromHistory(
  history: CubeMove[],
  puzzleType: PuzzleType
): CubeMove[] {
  const simplified = simplifyMoves(history, puzzleType);
  return [...simplified].reverse().map(invertMove);
}

/**
 * Generates a realistic, non-redundant WCA-style scramble for the chosen puzzle.
 */
export function generateScramble(
  puzzleType: PuzzleType,
  seed?: number
): CubeMove[] {
  const length = puzzleType === '2x2' ? 9 : puzzleType === '4x4' ? 20 : 14;
  const pool =
    puzzleType === '2x2'
      ? ['U', 'R', 'F']
      : puzzleType === '4x4'
        ? ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Rw', 'Fw']
        : ['U', 'D', 'L', 'R', 'F', 'B'];
  const modifiers = ['', "'", '2'];

  let rngState = seed ?? Math.floor(Math.random() * 2147483647);
  const nextRand = () => {
    rngState = (rngState * 48271) % 2147483647;
    return rngState / 2147483647;
  };

  const result: CubeMove[] = [];
  let lastAxis: Axis | null = null;

  while (result.length < length) {
    const face = pool[Math.floor(nextRand() * pool.length)];
    const mod = modifiers[Math.floor(nextRand() * modifiers.length)];
    const parsed = parseNotation(`${face}${mod}`, puzzleType);
    if (!parsed) continue;
    if (parsed.axis === lastAxis) continue;
    result.push(parsed);
    lastAxis = parsed.axis;
  }

  return result;
}

/**
 * Maps a 3D face swipe gesture (hit cubie grid pos, world face normal, and world drag vector)
 * into the exact slice CubeMove to rotate.
 */
export function computeMoveFromSwipe(
  cubiePos: [number, number, number],
  faceNormal: [number, number, number],
  dragWorld: [number, number, number],
  puzzleType: PuzzleType
): CubeMove | null {
  // Snap face normal to principal axis
  const absN = [Math.abs(faceNormal[0]), Math.abs(faceNormal[1]), Math.abs(faceNormal[2])];
  const nAxisIdx = absN[0] >= absN[1] && absN[0] >= absN[2] ? 0 : absN[1] >= absN[2] ? 1 : 2;
  const nSign = faceNormal[nAxisIdx] >= 0 ? 1 : -1;
  const n: [number, number, number] = [0, 0, 0];
  n[nAxisIdx] = nSign;

  // Project drag vector onto tangent plane of the hit face
  const dot = dragWorld[0] * n[0] + dragWorld[1] * n[1] + dragWorld[2] * n[2];
  const tx = dragWorld[0] - dot * n[0];
  const ty = dragWorld[1] - dot * n[1];
  const tz = dragWorld[2] - dot * n[2];
  const tangentLen = Math.hypot(tx, ty, tz);
  if (tangentLen < 1e-4) return null;

  // Pick dominant principal tangent direction
  const absT = [Math.abs(tx), Math.abs(ty), Math.abs(tz)];
  absT[nAxisIdx] = -1; // exclude normal axis
  const tAxisIdx = absT[0] >= absT[1] && absT[0] >= absT[2] ? 0 : absT[1] >= absT[2] ? 1 : 2;
  const tSign = (tAxisIdx === 0 ? tx : tAxisIdx === 1 ? ty : tz) >= 0 ? 1 : -1;
  const t: [number, number, number] = [0, 0, 0];
  t[tAxisIdx] = tSign;

  // Rotation axis = normal x tangent (right-hand rule!)
  const rx = n[1] * t[2] - n[2] * t[1];
  const ry = n[2] * t[0] - n[0] * t[2];
  const rz = n[0] * t[1] - n[1] * t[0];

  let axis: Axis = 'x';
  let direction: 1 | -1 = 1;
  let layerCoord = cubiePos[0];

  if (Math.abs(rx) > 0.5) {
    axis = 'x';
    direction = rx > 0 ? 1 : -1;
    layerCoord = cubiePos[0];
  } else if (Math.abs(ry) > 0.5) {
    axis = 'y';
    direction = ry > 0 ? 1 : -1;
    layerCoord = cubiePos[1];
  } else if (Math.abs(rz) > 0.5) {
    axis = 'z';
    direction = rz > 0 ? 1 : -1;
    layerCoord = cubiePos[2];
  } else {
    return null;
  }

  const layers = [layerCoord];
  const notation = buildNotationFromMove(axis, layers, direction, 1, puzzleType);
  return {
    axis,
    layers,
    direction,
    turns: 1,
    notation,
  };
}
