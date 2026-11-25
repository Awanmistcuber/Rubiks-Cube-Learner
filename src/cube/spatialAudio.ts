import type { CubeMove, PuzzleType } from './types';

export type Vec3 = [number, number, number];

export type TurnAcousticKind = 'outer' | 'wide' | 'slice' | 'rotation';

export interface SpatialListenerPose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
}

export interface TurnAcousticInput {
  move: CubeMove;
  puzzleType: PuzzleType;
  unitScale: number;
  explodeAmount: number;
  /** Effective turn speed multiplier (approx 0.5 - 2.6) */
  turnSpeed: number;
  cubeWorldPos: Vec3;
  layerWorldPos: Vec3;
  listener: SpatialListenerPose;
  /** 0 for single 90° turn or first half of 180° turn; 1 for second lock-in of 180° turn */
  clickIndex?: 0 | 1;
}

export interface SpatialAcousticProfile {
  /** World-space position fed to Web Audio HRTF PannerNode */
  pannerPosition: Vec3;
  /** Horizontal stereo angle in radians relative to listener forward (+ = right, - = left) */
  azimuthRad: number;
  /** Vertical elevation angle in radians relative to listener forward (+ = up, - = down) */
  elevationRad: number;
  /** Normalized pan scalar in [-1, 1] for fallback stereo panning */
  stereoPan: number;
  /** Raw camera-to-cube distance in Three.js world units */
  cameraDistance: number;
  /** Acoustic near-field distance in meters */
  acousticDistance: number;
  /** Chassis body acoustic shadow factor in [0, 0.72] (0 = front face, higher = back/occluded face) */
  occlusionFactor: number;
  /** Primary ABS/core cavity resonance frequency (Hz) */
  bodyFreqHz: number;
  /** Magnetic detent snap bandpass center frequency (Hz) */
  clickFreqHz: number;
  /** Secondary spring/core or alloy overtone frequency (Hz) */
  overtoneFreqHz: number;
  /** Occlusion-aware lowpass cutoff (Hz) */
  filterCutoffHz: number;
  /** Bandpass Q sharpness */
  filterQ: number;
  /** Cavity knock gain */
  bodyGain: number;
  /** Detent snap transient gain */
  snapGain: number;
  /** Initial plastic-on-plastic friction slide gain */
  slideGain: number;
  /** Overtone/metallic ring blend [0..1] */
  metallicMix: number;
  /** Body resonance decay time (seconds) */
  decaySec: number;
  /** Classified physical turn kind */
  turnKind: TurnAcousticKind;
  /** Original move notation for diagnostics/testing */
  notation: string;
}

export const SPATIAL_AUDIO_STORAGE_KEY = 'kubi_spatial_audio_v1';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize3(a: Vec3, fallback: Vec3): Vec3 {
  const l = len3(a);
  if (l < 1e-6) return fallback;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function getPuzzleLayerCount(puzzleType: PuzzleType): number {
  if (puzzleType === '2x2') return 2;
  if (puzzleType === '4x4') return 4;
  return 3;
}

export function classifyTurnKind(move: CubeMove, puzzleType: PuzzleType): TurnAcousticKind {
  const size = getPuzzleLayerCount(puzzleType);
  if (move.layers.length >= size) return 'rotation';

  const avg =
    move.layers.length > 0
      ? move.layers.reduce((sum, l) => sum + l, 0) / move.layers.length
      : 0;

  if (Math.abs(avg) < 0.01) return 'slice';
  if (move.layers.length > 1) return 'wide';
  if (size === 4 && Math.abs(move.layers[0]) < 1.0) return 'slice';
  return 'outer';
}

/**
 * Computes the physical centroid of the rotating layer in cubeRoot local coordinates,
 * accounting for puzzle scale and exploded core separation.
 */
export function computeLayerLocalCenter(
  move: CubeMove,
  puzzleType: PuzzleType,
  unitScale: number,
  explodeAmount: number
): Vec3 {
  const kind = classifyTurnKind(move, puzzleType);
  if (kind === 'rotation' || move.layers.length === 0) {
    return [0, 0, 0];
  }

  const avg = move.layers.reduce((sum, l) => sum + l, 0) / move.layers.length;
  if (Math.abs(avg) < 0.01) {
    return [0, 0, 0];
  }

  const explodeBoost = Math.sign(avg) * clamp(explodeAmount, 0, 1) * 0.72;
  const offset = avg * unitScale + explodeBoost;

  if (move.axis === 'x') return [offset, 0, 0];
  if (move.axis === 'y') return [0, offset, 0];
  return [0, 0, offset];
}

interface PuzzleMaterialAcoustics {
  bodyHz: number;
  clickHz: number;
  overtoneHz: number;
  decaySec: number;
  metallicMix: number;
  resonanceQ: number;
}

const PUZZLE_ACOUSTICS: Record<PuzzleType, PuzzleMaterialAcoustics> = {
  '2x2': {
    bodyHz: 378,
    clickHz: 2880,
    overtoneHz: 4220,
    decaySec: 0.044,
    metallicMix: 0.08,
    resonanceQ: 2.35,
  },
  '3x3': {
    bodyHz: 306,
    clickHz: 2380,
    overtoneHz: 3560,
    decaySec: 0.052,
    metallicMix: 0.12,
    resonanceQ: 2.65,
  },
  '4x4': {
    bodyHz: 242,
    clickHz: 1920,
    overtoneHz: 2880,
    decaySec: 0.064,
    metallicMix: 0.15,
    resonanceQ: 2.2,
  },
  mirror: {
    bodyHz: 276,
    clickHz: 2710,
    overtoneHz: 4680,
    decaySec: 0.068,
    metallicMix: 0.5,
    resonanceQ: 3.85,
  },
};

function computeAxisPitchRatio(move: CubeMove): number {
  const avg =
    move.layers.length > 0
      ? move.layers.reduce((sum, l) => sum + l, 0) / move.layers.length
      : 0;
  const sign = avg > 0.01 ? 1 : avg < -0.01 ? -1 : 0;

  // Natural physical tension & resonant pitch variance across faces + CW/CCW direction
  let ratio = 1.0;
  if (move.axis === 'x') {
    ratio = sign > 0 ? 1.045 : sign < 0 ? 0.945 : 1.015;
  } else if (move.axis === 'y') {
    ratio = sign > 0 ? 1.095 : sign < 0 ? 0.895 : 0.985;
  } else {
    ratio = sign > 0 ? 1.02 : sign < 0 ? 0.925 : 1.05;
  }

  // Slight tactile timbral difference between clockwise and prime fingertricks
  const dirShift = move.direction > 0 ? 1.015 : 0.985;
  return ratio * dirShift;
}

/**
 * Computes a complete, deterministic 3D spatial and physical synthesis profile
 * for any cube turn relative to the live 3D camera/listener pose.
 */
export function computeTurnAcousticProfile(input: TurnAcousticInput): SpatialAcousticProfile {
  const {
    move,
    puzzleType,
    unitScale,
    explodeAmount,
    turnSpeed,
    cubeWorldPos,
    layerWorldPos,
    listener,
    clickIndex = 0,
  } = input;

  const turnKind = classifyTurnKind(move, puzzleType);
  const clampedExplode = clamp(explodeAmount, 0, 1);
  const speedNorm = clamp(turnSpeed, 0.5, 2.6);

  // Build orthonormal right-handed listener basis
  const fwd = normalize3(listener.forward, [0, 0, -1]);
  const upHint = normalize3(listener.up, [0, 1, 0]);
  const right = normalize3(cross3(fwd, upHint), [1, 0, 0]);
  const up = normalize3(cross3(right, fwd), [0, 1, 0]);

  const camToCube = sub3(cubeWorldPos, listener.position);
  const cameraDistance = Math.max(0.5, len3(camToCube));
  const camToCubeDir = normalize3(camToCube, fwd);

  // Exact world-space offset from cube core to rotating layer centroid
  const layerOffset = sub3(layerWorldPos, cubeWorldPos);

  const relRight = dot3(layerOffset, right);
  const relUp = dot3(layerOffset, up);
  const relDepth = dot3(layerOffset, fwd);

  // Map Three.js viewing distance (typically ~7.8–18.8 world units) into an intimate
  // close-field studio listening space (~0.6–2.6m) so left/right/up/down/front/back turns
  // produce unmistakable, natural 3D stereo localization while preserving zoom distance cues.
  const acousticDistance = clamp(cameraDistance * 0.145, 0.58, 2.75);
  const stereoSpread = clamp(acousticDistance * 0.62, 0.48, 1.42);

  const acousticCubePos = add3(listener.position, scale3(camToCubeDir, acousticDistance));
  const pannerPosition = add3(acousticCubePos, scale3(layerOffset, stereoSpread));

  const effectiveDepth = Math.max(0.28, acousticDistance + relDepth * stereoSpread);
  const azimuthRad = Math.atan2(relRight * stereoSpread, effectiveDepth);
  const elevationRad = Math.atan2(relUp * stereoSpread, effectiveDepth);
  const stereoPan = clamp(Math.sin(azimuthRad) * 1.15, -0.95, 0.95);

  // Acoustic body occlusion: faces turning behind the cube core (relDepth > 0) are muffled
  // by the cube chassis; exploding the core opens air gaps and reduces occlusion.
  const layerRadiusRef = Math.max(0.55, unitScale * 1.15);
  const depthNorm = clamp(relDepth / layerRadiusRef, -1, 1);
  const occlusionFactor =
    depthNorm <= 0
      ? 0
      : clamp(depthNorm * 0.68 * (1 - clampedExplode * 0.45), 0, 0.72);

  // Physical synthesis baseline from puzzle material & face orientation
  const mat = PUZZLE_ACOUSTICS[puzzleType];
  const axisPitch = computeAxisPitchRatio(move);

  let bodyFreqHz = mat.bodyHz * axisPitch;
  let clickFreqHz = mat.clickHz * axisPitch;
  let overtoneFreqHz = mat.overtoneHz * axisPitch;
  let decaySec = mat.decaySec;
  let metallicMix = mat.metallicMix;
  let filterQ = mat.resonanceQ;

  let bodyGain = 0.15;
  let snapGain = 0.135;
  let slideGain = 0.034;

  if (turnKind === 'wide') {
    bodyFreqHz *= 0.84;
    clickFreqHz *= 0.88;
    overtoneFreqHz *= 0.9;
    decaySec *= 1.18;
    bodyGain = 0.19;
    snapGain = 0.15;
    slideGain = 0.048;
  } else if (turnKind === 'slice') {
    bodyFreqHz *= 1.07;
    clickFreqHz *= 1.15;
    overtoneFreqHz *= 1.14;
    decaySec *= 1.05;
    metallicMix = clamp(metallicMix + 0.14, 0, 0.9);
    filterQ *= 1.12;
    bodyGain = 0.125;
    snapGain = 0.155;
    slideGain = 0.056;
  } else if (turnKind === 'rotation') {
    // Whole-cube rotation: low palm-reposition tactile thud + gentle handling whoosh
    bodyFreqHz *= 0.56;
    clickFreqHz *= 0.48;
    overtoneFreqHz *= 0.55;
    decaySec *= 1.38;
    metallicMix *= 0.25;
    filterQ = 1.3;
    bodyGain = 0.105;
    snapGain = 0.028;
    slideGain = 0.046;
  }

  // Exploded view opens cavity resonance slightly (brighter, airier, less dense body thump)
  if (clampedExplode > 0.01) {
    bodyFreqHz *= 1 + clampedExplode * 0.08;
    bodyGain *= 1 - clampedExplode * 0.18;
    metallicMix = clamp(metallicMix + clampedExplode * 0.14, 0, 0.92);
  }

  // Velocity kinematics: faster speedcube flicks create brighter, higher-energy transients
  const speedBrightness = 1 + (speedNorm - 1) * 0.11;
  const speedEnergy = clamp(0.82 + speedNorm * 0.2, 0.75, 1.32);
  clickFreqHz *= speedBrightness;
  bodyGain *= speedEnergy;
  snapGain *= speedEnergy;
  slideGain *= clamp(0.78 + speedNorm * 0.22, 0.72, 1.25);

  // Double turn (180°) second detent snap has a crisp slight harmonic lift
  if (clickIndex === 1) {
    bodyFreqHz *= 1.055;
    clickFreqHz *= 1.06;
    snapGain *= 1.1;
  }

  // Elevation adds subtle pinna brightness above vs slight warmth below; occlusion muffles highs
  const elevationFactor = 1 + clamp(elevationRad, -0.7, 0.7) * 0.12;
  const baseCutoff = (turnKind === 'rotation' ? 2400 : 6400) * speedBrightness * elevationFactor;
  const filterCutoffHz = clamp(baseCutoff * (1 - occlusionFactor * 0.72), 950, 8800);

  return {
    pannerPosition,
    azimuthRad,
    elevationRad,
    stereoPan,
    cameraDistance,
    acousticDistance,
    occlusionFactor,
    bodyFreqHz: Math.round(bodyFreqHz * 10) / 10,
    clickFreqHz: Math.round(clickFreqHz * 10) / 10,
    overtoneFreqHz: Math.round(overtoneFreqHz * 10) / 10,
    filterCutoffHz: Math.round(filterCutoffHz),
    filterQ: Math.round(filterQ * 100) / 100,
    bodyGain: Math.round(bodyGain * 1000) / 1000,
    snapGain: Math.round(snapGain * 1000) / 1000,
    slideGain: Math.round(slideGain * 1000) / 1000,
    metallicMix: Math.round(metallicMix * 1000) / 1000,
    decaySec: Math.round(decaySec * 1000) / 1000,
    turnKind,
    notation: move.notation,
  };
}

export function loadSpatialAudioPref(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!store) return true;
    const raw = store.getItem(SPATIAL_AUDIO_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false' && raw !== '0';
  } catch {
    return true;
  }
}

export function saveSpatialAudioPref(
  enabled: boolean,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    if (!store) return;
    store.setItem(SPATIAL_AUDIO_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage quota / privacy restrictions
  }
}
