import { applyMove, createSolvedCube, isCubeSolved, parseAlgorithm, parseNotation } from './cubeLogic';
import { solveCubeWithMethod } from './methodSolver';
import type { CubeMove, CubieState, FaceKey, SolveMethodId } from './types';

export type WcaFace = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';

export type ScannedFaces = Record<WcaFace, WcaFace[]>;

export type RgbTriplet = [number, number, number];

export type ScannedRgbFaces = Partial<Record<WcaFace, RgbTriplet[]>>;

export type SmartHintAlgorithmId = 'kociemba' | SolveMethodId;

export interface SmartHintOption {
  id: SmartHintAlgorithmId;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  moves: string[];
  moveCount: number;
  nextMove: string | null;
  stageLabel?: string;
  solveTimeMs?: number;
}

export interface MovePhysicalInstruction {
  notation: string;
  face: WcaFace;
  faceLabel: string;
  colorName: string;
  colorHex: string;
  turnLabel: string;
  direction: 'cw' | 'ccw' | 'double';
  summary: string;
}

export interface FaceScanGuide {
  face: WcaFace;
  title: string;
  colorName: string;
  hex: string;
  holdInstruction: string;
  topHint: string;
}

export const SCAN_FACE_ORDER: WcaFace[] = ['U', 'R', 'F', 'D', 'L', 'B'];

export const WCA_FACE_META: Record<WcaFace, FaceScanGuide> = {
  U: {
    face: 'U',
    title: 'Top (U)',
    colorName: 'White',
    hex: '#F8FAFC',
    holdInstruction: 'Point the White center toward the camera with Blue at the top edge.',
    topHint: 'Blue on top · Green on bottom',
  },
  R: {
    face: 'R',
    title: 'Right (R)',
    colorName: 'Red',
    hex: '#DC2626',
    holdInstruction: 'Point the Red center toward the camera with White at the top edge.',
    topHint: 'White on top · Green on left',
  },
  F: {
    face: 'F',
    title: 'Front (F)',
    colorName: 'Green',
    hex: '#16A34A',
    holdInstruction: 'Point the Green center toward the camera with White at the top edge.',
    topHint: 'White on top · Red on right',
  },
  D: {
    face: 'D',
    title: 'Bottom (D)',
    colorName: 'Yellow',
    hex: '#FACC15',
    holdInstruction: 'Point the Yellow center toward the camera with Green at the top edge.',
    topHint: 'Green on top · Blue on bottom',
  },
  L: {
    face: 'L',
    title: 'Left (L)',
    colorName: 'Orange',
    hex: '#EA580C',
    holdInstruction: 'Point the Orange center toward the camera with White at the top edge.',
    topHint: 'White on top · Green on right',
  },
  B: {
    face: 'B',
    title: 'Back (B)',
    colorName: 'Blue',
    hex: '#2563EB',
    holdInstruction: 'Point the Blue center toward the camera with White at the top edge.',
    topHint: 'White on top · Red on left',
  },
};

export const WCA_TO_FACEKEY: Record<WcaFace, FaceKey> = {
  U: 'py',
  D: 'ny',
  R: 'px',
  L: 'nx',
  F: 'pz',
  B: 'nz',
};

export const FACEKEY_TO_WCA: Record<FaceKey, WcaFace> = {
  py: 'U',
  ny: 'D',
  px: 'R',
  nx: 'L',
  pz: 'F',
  nz: 'B',
};

// ============================================================================
// Perceptual CIELAB Color Classification & Camera Grid Sampling
// ============================================================================

export type LabTriplet = [number, number, number];

export function rgbToLab([r, g, b]: RgbTriplet): LabTriplet {
  const sr = r / 255;
  const sg = g / 255;
  const sb = b / 255;

  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const rl = lin(sr);
  const gl = lin(sg);
  const bl = lin(sb);

  // sRGB D65 -> XYZ
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a: LabTriplet, b: LabTriplet): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.hypot(dl, da, db);
}

// Canonical WCA sticker RGB references under neutral daylight
const CANONICAL_WCA_RGB: Record<WcaFace, RgbTriplet> = {
  U: [242, 244, 246], // White
  D: [245, 214, 38],  // Yellow
  R: [198, 34, 34],   // Red
  L: [242, 118, 22],  // Orange
  F: [24, 158, 72],   // Green
  B: [26, 86, 206],   // Blue
};

const CANONICAL_WCA_LAB: Record<WcaFace, LabTriplet> = {
  U: rgbToLab(CANONICAL_WCA_RGB.U),
  D: rgbToLab(CANONICAL_WCA_RGB.D),
  R: rgbToLab(CANONICAL_WCA_RGB.R),
  L: rgbToLab(CANONICAL_WCA_RGB.L),
  F: rgbToLab(CANONICAL_WCA_RGB.F),
  B: rgbToLab(CANONICAL_WCA_RGB.B),
};

export function classifyRgbToWcaFace(
  rgb: RgbTriplet,
  calibratedCenters?: Partial<Record<WcaFace, LabTriplet>>
): WcaFace {
  const lab = rgbToLab(rgb);

  // If all 6 centers are calibrated from the user's real camera lighting, match directly in CIELAB
  const hasFullCalibration =
    calibratedCenters &&
    SCAN_FACE_ORDER.every((f) => Boolean(calibratedCenters[f]));

  if (hasFullCalibration && calibratedCenters) {
    let bestFace: WcaFace = 'U';
    let bestDist = Infinity;
    for (const face of SCAN_FACE_ORDER) {
      const ref = calibratedCenters[face]!;
      // Slightly de-emphasize luminance (L*) compared to chroma (a*, b*) so shadows don't confuse colors
      const dl = (lab[0] - ref[0]) * 0.65;
      const da = lab[1] - ref[1];
      const db = lab[2] - ref[2];
      const d = Math.hypot(dl, da, db);
      if (d < bestDist) {
        bestDist = d;
        bestFace = face;
      }
    }
    return bestFace;
  }

  // Otherwise use chroma-weighted CIELAB + HSV white/orange disambiguation
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const val = max / 255;

  // Crisp low-saturation bright pixels are White (U) even under warm tungsten room lights
  if (sat < 0.24 && val > 0.42) {
    return 'U';
  }

  let bestFace: WcaFace = 'U';
  let bestDist = Infinity;
  for (const face of SCAN_FACE_ORDER) {
    const ref = calibratedCenters?.[face] ?? CANONICAL_WCA_LAB[face];
    const dl = (lab[0] - ref[0]) * 0.72;
    const da = lab[1] - ref[1];
    const db = lab[2] - ref[2];
    const d = Math.hypot(dl, da, db);
    if (d < bestDist) {
      bestDist = d;
      bestFace = face;
    }
  }
  return bestFace;
}

/**
 * Samples 9 robust sticker RGB values from the centered square reticle of a video/photo frame,
 * trimming specular highlights and dark seam edges inside each cell patch.
 */
export function sampleGridFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  reticleScale = 0.62
): RgbTriplet[] {
  const side = Math.min(width, height) * reticleScale;
  const startX = (width - side) / 2;
  const startY = (height - side) / 2;
  const cell = side / 3;
  const results: RgbTriplet[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = startX + (col + 0.5) * cell;
      const cy = startY + (row + 0.5) * cell;
      const radius = Math.max(2, Math.floor(cell * 0.18));

      const samples: { r: number; g: number; b: number; lum: number }[] = [];
      for (let dy = -radius; dy <= radius; dy += 2) {
        for (let dx = -radius; dx <= radius; dx += 2) {
          const px = Math.min(width - 1, Math.max(0, Math.round(cx + dx)));
          const py = Math.min(height - 1, Math.max(0, Math.round(cy + dy)));
          const idx = (py * width + px) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          samples.push({ r, g, b, lum: 0.299 * r + 0.587 * g + 0.114 * b });
        }
      }

      if (samples.length === 0) {
        results.push([240, 240, 240]);
        continue;
      }

      // Trimmed mean (drop darkest 20% seam shadows and brightest 20% glare reflections)
      samples.sort((a, b) => a.lum - b.lum);
      const lo = Math.floor(samples.length * 0.2);
      const hi = Math.max(lo + 1, Math.ceil(samples.length * 0.8));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      const count = hi - lo;
      for (let i = lo; i < hi; i++) {
        sr += samples[i].r;
        sg += samples[i].g;
        sb += samples[i].b;
      }
      results.push([Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)]);
    }
  }

  return results;
}

/**
 * Re-classifies all camera-captured faces once multiple/all 6 centers are scanned so
 * lighting shifts (warm lamps, cool LEDs, shadows) automatically white-balance against
 * the physical cube's actual 6 center stickers.
 */
export function recalibrateScannedFaces(
  rgbFaces: ScannedRgbFaces,
  currentFaces: ScannedFaces
): ScannedFaces {
  const calibratedCenters: Partial<Record<WcaFace, LabTriplet>> = {};
  for (const face of SCAN_FACE_ORDER) {
    const faceRgbs = rgbFaces[face];
    if (faceRgbs && faceRgbs.length === 9) {
      calibratedCenters[face] = rgbToLab(faceRgbs[4]);
    }
  }

  const next: ScannedFaces = {
    U: [...currentFaces.U],
    R: [...currentFaces.R],
    F: [...currentFaces.F],
    D: [...currentFaces.D],
    L: [...currentFaces.L],
    B: [...currentFaces.B],
  };

  for (const face of SCAN_FACE_ORDER) {
    const faceRgbs = rgbFaces[face];
    if (!faceRgbs || faceRgbs.length !== 9) continue;
    next[face] = faceRgbs.map((rgb, idx) =>
      idx === 4 ? face : classifyRgbToWcaFace(rgb, calibratedCenters)
    );
  }
  return next;
}

// ============================================================================
// 54-Sticker Kociemba URFDLB <-> CubieState[] Exact Bidirectional Mapping
// ============================================================================

/**
 * Returns the 3D cubie grid coordinate [x, y, z] for sticker index 0..8 (row-major)
 * on a given WCA face in standard Kociemba URFDLB orientation.
 */
export function getStickerGridPos(face: WcaFace, index: number): [number, number, number] {
  const row = Math.floor(index / 3); // 0 = top, 1 = mid, 2 = bottom
  const col = index % 3;             // 0 = left, 1 = mid, 2 = right
  const a = col - 1;                 // -1, 0, +1
  const b = 1 - row;                 // +1, 0, -1

  switch (face) {
    case 'U':
      return [a, 1, row - 1];
    case 'D':
      return [a, -1, 1 - row];
    case 'F':
      return [a, b, 1];
    case 'B':
      return [-a, b, -1];
    case 'R':
      return [1, b, 1 - col];
    case 'L':
      return [-1, b, col - 1];
  }
}

export function createSolvedScannedFaces(): ScannedFaces {
  return {
    U: Array(9).fill('U'),
    R: Array(9).fill('R'),
    F: Array(9).fill('F'),
    D: Array(9).fill('D'),
    L: Array(9).fill('L'),
    B: Array(9).fill('B'),
  };
}

export function scannedFacesToFacelets(faces: ScannedFaces): string {
  return SCAN_FACE_ORDER.map((f) => faces[f].join('')).join('');
}

export function faceletsToScannedFaces(facelets: string): ScannedFaces | null {
  const clean = facelets.trim().toUpperCase();
  if (clean.length !== 54 || !/^[URFDLB]{54}$/.test(clean)) return null;
  const result = {} as ScannedFaces;
  SCAN_FACE_ORDER.forEach((face, fi) => {
    result[face] = clean.slice(fi * 9, fi * 9 + 9).split('') as WcaFace[];
  });
  return result;
}

export function cubieStatesToScannedFaces(cubies: CubieState[]): ScannedFaces {
  // Normalize colors relative to live center stickers in case cube was rotated
  const centerColorToFace = new Map<FaceKey, WcaFace>();
  for (const face of SCAN_FACE_ORDER) {
    const fk = WCA_TO_FACEKEY[face];
    const [cx, cy, cz] = getStickerGridPos(face, 4);
    const centerCubie = cubies.find(
      (c) => c.pos[0] === cx && c.pos[1] === cy && c.pos[2] === cz
    );
    const stickerColor = centerCubie?.stickers[fk] ?? fk;
    centerColorToFace.set(stickerColor, face);
  }

  const faces = createSolvedScannedFaces();
  for (const face of SCAN_FACE_ORDER) {
    const fk = WCA_TO_FACEKEY[face];
    const arr: WcaFace[] = [];
    for (let i = 0; i < 9; i++) {
      const [x, y, z] = getStickerGridPos(face, i);
      const cubie = cubies.find((c) => c.pos[0] === x && c.pos[1] === y && c.pos[2] === z);
      const colorFk = cubie?.stickers[fk] ?? fk;
      arr.push(centerColorToFace.get(colorFk) ?? FACEKEY_TO_WCA[colorFk]);
    }
    faces[face] = arr;
  }
  return faces;
}

export function cubieStatesToFacelets(cubies: CubieState[]): string {
  return scannedFacesToFacelets(cubieStatesToScannedFaces(cubies));
}

// ============================================================================
// Mathematical 3x3 Physical Solvability Validator (Counts, Pieces, Twist, Flip, Parity)
// ============================================================================

// Standard Kociemba corner & edge facelet indices in the 54-char URFDLB string
// U: 0..8, R: 9..17, F: 18..26, D: 27..35, L: 36..44, B: 45..53
const CORNER_FACELETS: readonly [number, number, number][] = [
  [8, 9, 20],   // URF
  [6, 18, 38],  // UFL
  [0, 36, 47],  // ULB
  [2, 45, 11],  // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];

const CORNER_COLORS: readonly [WcaFace, WcaFace, WcaFace][] = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];

const EDGE_FACELETS: readonly [number, number][] = [
  [5, 10],  // UR
  [7, 19],  // UF
  [3, 37],  // UL
  [1, 46],  // UB
  [32, 16], // DR
  [28, 25], // DF
  [30, 43], // DL
  [34, 52], // DB
  [23, 12], // FR
  [21, 41], // FL
  [50, 39], // BL
  [48, 14], // BR
];

const EDGE_COLORS: readonly [WcaFace, WcaFace][] = [
  ['U', 'R'],
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['D', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R'],
];

function permutationParity(perm: number[]): number {
  let inversions = 0;
  for (let i = 0; i < perm.length; i++) {
    for (let j = i + 1; j < perm.length; j++) {
      if (perm[i] > perm[j]) inversions++;
    }
  }
  return inversions % 2;
}

export interface CubeValidationResult {
  valid: boolean;
  isSolved: boolean;
  error?: string;
  counts: Record<WcaFace, number>;
  facelets: string;
}

export function validateScannedCube(faces: ScannedFaces): CubeValidationResult {
  const facelets = scannedFacesToFacelets(faces);
  const counts: Record<WcaFace, number> = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 };

  for (let i = 0; i < facelets.length; i++) {
    const ch = facelets[i] as WcaFace;
    if (ch in counts) counts[ch]++;
  }

  // 1. Center stickers must match canonical face slots
  for (const face of SCAN_FACE_ORDER) {
    if (faces[face][4] !== face) {
      return {
        valid: false,
        isSolved: false,
        counts,
        facelets,
        error: `Center sticker on ${WCA_FACE_META[face].title} must be ${WCA_FACE_META[face].colorName}.`,
      };
    }
  }

  // 2. Exactly 9 stickers of each color
  const over = SCAN_FACE_ORDER.filter((f) => counts[f] > 9);
  const under = SCAN_FACE_ORDER.filter((f) => counts[f] < 9);
  if (over.length > 0 || under.length > 0) {
    const overStr = over.map((f) => `${WCA_FACE_META[f].colorName} (${counts[f]}/9)`).join(', ');
    const underStr = under.map((f) => `${WCA_FACE_META[f].colorName} (${counts[f]}/9)`).join(', ');
    return {
      valid: false,
      isSolved: false,
      counts,
      facelets,
      error: `Sticker count mismatch — too many: ${overStr || 'none'}; missing: ${underStr || 'none'}. Tap any sticker in the net to fix.`,
    };
  }

  // 3. Validate all 8 corners (existence, uniqueness, orientation twist sum)
  const cornerPerm: number[] = [];
  let cornerTwistSum = 0;
  const seenCorners = new Set<number>();

  for (let i = 0; i < 8; i++) {
    const [i0, i1, i2] = CORNER_FACELETS[i];
    const c0 = facelets[i0] as WcaFace;
    const c1 = facelets[i1] as WcaFace;
    const c2 = facelets[i2] as WcaFace;

    let ori = -1;
    if (c0 === 'U' || c0 === 'D') ori = 0;
    else if (c1 === 'U' || c1 === 'D') ori = 1;
    else if (c2 === 'U' || c2 === 'D') ori = 2;

    if (ori === -1) {
      return {
        valid: false,
        isSolved: false,
        counts,
        facelets,
        error: `Corner #${i + 1} is missing a White or Yellow sticker. Check your corner colors.`,
      };
    }

    const col0 = [c0, c1, c2][ori];
    const col1 = [c0, c1, c2][(ori + 1) % 3];
    const col2 = [c0, c1, c2][(ori + 2) % 3];

    let found = -1;
    for (let j = 0; j < 8; j++) {
      if (
        CORNER_COLORS[j][0] === col0 &&
        CORNER_COLORS[j][1] === col1 &&
        CORNER_COLORS[j][2] === col2
      ) {
        found = j;
        break;
      }
    }

    if (found === -1 || seenCorners.has(found)) {
      return {
        valid: false,
        isSolved: false,
        counts,
        facelets,
        error: `Invalid or duplicate corner piece (${WCA_FACE_META[c0].colorName}-${WCA_FACE_META[c1].colorName}-${WCA_FACE_META[c2].colorName}). Double-check the adjacent face orientation.`,
      };
    }

    seenCorners.add(found);
    cornerPerm.push(found);
    cornerTwistSum += ori;
  }

  // 4. Validate all 12 edges (existence, uniqueness, orientation flip sum)
  const edgePerm: number[] = [];
  let edgeFlipSum = 0;
  const seenEdges = new Set<number>();

  for (let i = 0; i < 12; i++) {
    const [i0, i1] = EDGE_FACELETS[i];
    const e0 = facelets[i0] as WcaFace;
    const e1 = facelets[i1] as WcaFace;

    let found = -1;
    let flip = 0;
    for (let j = 0; j < 12; j++) {
      if (EDGE_COLORS[j][0] === e0 && EDGE_COLORS[j][1] === e1) {
        found = j;
        flip = 0;
        break;
      }
      if (EDGE_COLORS[j][0] === e1 && EDGE_COLORS[j][1] === e0) {
        found = j;
        flip = 1;
        break;
      }
    }

    if (found === -1 || seenEdges.has(found)) {
      return {
        valid: false,
        isSolved: false,
        counts,
        facelets,
        error: `Invalid or duplicate edge piece (${WCA_FACE_META[e0].colorName}-${WCA_FACE_META[e1].colorName}). Verify that face orientation matches the guide.`,
      };
    }

    seenEdges.add(found);
    edgePerm.push(found);
    edgeFlipSum += flip;
  }

  // 5. Fundamental Rubik's Cube group-theory invariants
  if (cornerTwistSum % 3 !== 0) {
    return {
      valid: false,
      isSolved: false,
      counts,
      facelets,
      error: 'Corner twist parity error — one corner appears twisted or misread under glare.',
    };
  }

  if (edgeFlipSum % 2 !== 0) {
    return {
      valid: false,
      isSolved: false,
      counts,
      facelets,
      error: 'Edge flip parity error — one edge appears flipped or two stickers were swapped.',
    };
  }

  if (permutationParity(cornerPerm) !== permutationParity(edgePerm)) {
    return {
      valid: false,
      isSolved: false,
      counts,
      facelets,
      error: 'Permutation parity error — two edges or corners appear swapped. Re-check Red/Orange and White/Yellow stickers.',
    };
  }

  const solvedFacelets = scannedFacesToFacelets(createSolvedScannedFaces());
  return {
    valid: true,
    isSolved: facelets === solvedFacelets,
    counts,
    facelets,
  };
}

/**
 * Reconstructs a full, exact 3x3 CubieState[] array from validated scanned faces so
 * both ThreeCubeEngine and Kubi Studio's state-based solvers (CFOP, Beginner, Roux, ZZ)
 * operate directly on the scanned physical cube.
 */
export function scannedFacesToCubieStates(faces: ScannedFaces): CubieState[] {
  const baseCubies = createSolvedCube('3x3');

  // Map grid position key -> sticker map
  const posStickers = new Map<string, Partial<Record<FaceKey, FaceKey>>>();
  for (const face of SCAN_FACE_ORDER) {
    const faceKey = WCA_TO_FACEKEY[face];
    for (let i = 0; i < 9; i++) {
      const [x, y, z] = getStickerGridPos(face, i);
      const key = `${x},${y},${z}`;
      const map = posStickers.get(key) ?? {};
      map[faceKey] = WCA_TO_FACEKEY[faces[face][i]];
      posStickers.set(key, map);
    }
  }

  // Assign each cubie its scanned stickers and matching home coordinates based on sticker color set
  const colorSetToHome = new Map<string, [number, number, number]>();
  for (const c of baseCubies) {
    const sig = Object.values(c.stickers).sort().join(',');
    colorSetToHome.set(sig, [...c.home]);
  }

  return baseCubies.map((c) => {
    const key = `${c.pos[0]},${c.pos[1]},${c.pos[2]}`;
    const stickers = posStickers.get(key) ?? { ...c.stickers };
    const sig = Object.values(stickers).sort().join(',');
    const home = colorSetToHome.get(sig) ?? [...c.home];
    return {
      ...c,
      home,
      pos: [...c.pos],
      stickers,
      dimensions: [...c.dimensions],
      homeCenter: [...c.pos],
      rotMatrix: [...c.rotMatrix],
    };
  });
}

// ============================================================================
// Multi-Algorithm Local Hints & Human-Readable Next-Move Instructions
// ============================================================================

export function describeMoveInstruction(notation: string): MovePhysicalInstruction {
  const trimmed = notation.trim();
  const baseChar = trimmed[0]?.toUpperCase() ?? 'R';
  const face: WcaFace = (['U', 'R', 'F', 'D', 'L', 'B'].includes(baseChar)
    ? baseChar
    : 'R') as WcaFace;
  const meta = WCA_FACE_META[face];

  const isDouble = trimmed.includes('2');
  const isPrime = trimmed.includes("'");
  const direction: 'cw' | 'ccw' | 'double' = isDouble ? 'double' : isPrime ? 'ccw' : 'cw';

  const turnLabel = isDouble
    ? '180° Half Turn'
    : isPrime
      ? '90° Counter-Clockwise'
      : '90° Clockwise';

  const isWide = trimmed.includes('w') || (trimmed[0] >= 'a' && trimmed[0] <= 'z');
  const isSlice = ['M', 'E', 'S'].includes(baseChar);
  const isRot = ['x', 'y', 'z'].includes(trimmed[0] ?? '');

  const plainFaceName = meta.title.replace(/\s*\([URFDLB]\)$/, '');

  let summary: string;
  if (isRot) {
    summary = `Rotate the whole cube around the ${trimmed[0].toUpperCase()} axis (${turnLabel.toLowerCase()}).`;
  } else if (isSlice) {
    summary = `Turn the center ${baseChar} slice ${turnLabel.toLowerCase()}.`;
  } else if (isWide) {
    summary = `Turn the ${plainFaceName} (${meta.colorName}) + middle layers together ${turnLabel.toLowerCase()}.`;
  } else {
    summary = `Turn the ${plainFaceName} (${meta.colorName}) face ${turnLabel.toLowerCase()}.`;
  }

  return {
    notation: trimmed,
    face,
    faceLabel: isRot ? `Cube ${trimmed[0].toUpperCase()}` : isSlice ? `${baseChar} Slice` : meta.title,
    colorName: meta.colorName,
    colorHex: meta.hex,
    turnLabel,
    direction,
    summary,
  };
}

/**
 * Computes deterministic solutions across all 4 built-in speedcubing / basic algorithms
 * (CFOP, Beginner LBL, Roux, ZZ/ZOLL) directly from the scanned physical 3x3 cubie state.
 */
export function computeBasicAlgorithmHints(cubies: CubieState[]): SmartHintOption[] {
  if (isCubeSolved(cubies, '3x3')) {
    return [];
  }

  const methods: { id: SolveMethodId; name: string; shortName: string; badge: string; desc: string }[] = [
    {
      id: 'cfop',
      name: 'CFOP (Fridrich)',
      shortName: 'CFOP',
      badge: 'Speedcubing',
      desc: 'Cross → F2L Pairs → OLL → PLL',
    },
    {
      id: 'beginner',
      name: 'Beginner (Layer-by-Layer)',
      shortName: 'Beginner',
      badge: 'Easy Steps',
      desc: 'Classic intuitive 7-stage layer-by-layer solve',
    },
    {
      id: 'roux',
      name: 'Roux Blockbuilding',
      shortName: 'Roux',
      badge: 'Low Moves',
      desc: 'First Block → Second Block → CMLL → LSE',
    },
    {
      id: 'zz',
      name: 'ZZ / ZOLL',
      shortName: 'ZZ',
      badge: 'Rotationless',
      desc: 'EOLine → ZZF2L → ZOLL → EPLL',
    },
  ];

  const options: SmartHintOption[] = [];

  for (const m of methods) {
    const plan = solveCubeWithMethod(cubies, m.id, '3x3', []);
    const moves = plan.allMoves.map((mv) => mv.notation);
    const firstNonEmptyPhase = plan.phases.find((p) => p.moves.length > 0);
    options.push({
      id: m.id,
      name: m.name,
      shortName: m.shortName,
      badge: m.badge,
      description: m.desc,
      moves,
      moveCount: moves.length,
      nextMove: moves[0] ?? null,
      stageLabel: firstNonEmptyPhase ? firstNonEmptyPhase.name : undefined,
    });
  }

  return options;
}

export function applyNotationToScannedFaces(faces: ScannedFaces, notation: string): ScannedFaces {
  const move = parseNotation(notation, '3x3');
  if (!move) return faces;
  const cubies = scannedFacesToCubieStates(faces);
  const nextCubies = applyMove(cubies, move);
  return cubieStatesToScannedFaces(nextCubies);
}

export interface SampleScanPreset {
  id: string;
  label: string;
  scramble: string;
}

export const SAMPLE_SCAN_PRESETS: SampleScanPreset[] = [
  {
    id: 'quick-6',
    label: 'Quick 6-Move Case',
    scramble: "R U R' U' F' U",
  },
  {
    id: 't-perm',
    label: 'T-Perm (PLL)',
    scramble: "R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  {
    id: 'wca-14',
    label: '14-Move Scramble',
    scramble: "R U2 F' D L2 B' U R2 F D' L U' B2 R'",
  },
];

export function buildScannedFacesFromScramble(scramble: string): ScannedFaces {
  const moves: CubeMove[] = parseAlgorithm(scramble, '3x3');
  let cubies = createSolvedCube('3x3');
  for (const mv of moves) {
    cubies = applyMove(cubies, mv);
  }
  return cubieStatesToScannedFaces(cubies);
}
