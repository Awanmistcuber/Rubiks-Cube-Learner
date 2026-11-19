export type PuzzleType = '2x2' | '3x3' | '4x4' | 'mirror';

export type Axis = 'x' | 'y' | 'z';

export type FaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

export type ThemeId = 'atelier' | 'monolith' | 'pastel' | 'graphite';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type DockTab = 'play' | 'learn' | 'lab' | 'coach';

export interface CubeMove {
  axis: Axis;
  /** Layer indices in integer coordinates relative to center (e.g., -1, 0, 1 for 3x3; -1.5, -0.5, 0.5, 1.5 for 4x4) */
  layers: number[];
  /** +1 = +90deg right-hand rule around positive axis, -1 = -90deg */
  direction: 1 | -1;
  /** Number of 90-degree quarter turns (1 or 2) */
  turns: 1 | 2;
  /** WCA notation string, e.g. "R", "U'", "F2", "Rw" */
  notation: string;
}

export interface CubieState {
  id: number;
  /** Home/solved coordinates */
  home: [number, number, number];
  /** Current grid coordinates */
  pos: [number, number, number];
  /** Current face color keys mapped to current world-space normals */
  stickers: Partial<Record<FaceKey, FaceKey>>;
  /** Dimension scale [sx, sy, sz] — uniform 1 for standard cubes, varied for Mirror Blocks */
  dimensions: [number, number, number];
  /** Visual offset center for asymmetric Mirror Blocks */
  homeCenter: [number, number, number];
  /** Tracked orientation matrix (3x3 row-major integer rotation) for Mirror Blocks & orientation checks */
  rotMatrix: [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
}

export interface LessonStep {
  id: string;
  stageNumber: number;
  title: string;
  subtitle: string;
  goal: string;
  tip: string;
  /** Moves applied from solved state to stage this exact case on the 3D cube */
  setupMoves: string[];
  /** Algorithm moves the learner steps through or plays */
  algorithm: string[];
  /** Short cue for each move in the algorithm */
  moveNotes?: string[];
}

export interface AlgorithmPreset {
  id: string;
  name: string;
  category: 'Trigger' | 'OLL' | 'PLL' | 'Pattern' | 'Parity';
  puzzleTypes: PuzzleType[];
  notation: string[];
  description: string;
}

export interface SolveSnapshot {
  puzzleType: PuzzleType;
  moves: number;
  elapsedMs: number;
  bestMs: number | null;
  isNewRecord: boolean;
  dailyChallenge?: {
    dateKey: string;
    rank: number | null;
    totalParticipants: number;
  };
}

export interface ThemePalette {
  id: ThemeId;
  name: string;
  tag: string;
  isDark: boolean;
  ui: {
    bg: string;
    surface: string;
    surfaceSubtle: string;
    surfaceHover: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentFg: string;
    accentSoft: string;
    shadow: string;
    swatchPreview: [string, string, string];
  };
  scene: {
    background: number;
    fogColor: number;
    fogDensity: number;
    keyLightColor: number;
    keyLightIntensity: number;
    hemiSkyColor: number;
    hemiGroundColor: number;
    hemiIntensity: number;
    rimLightColor: number;
    rimLightIntensity: number;
    chassisColor: number;
    chassisRoughness: number;
    chassisMetalness: number;
    coreMetalColor: number;
    tileRoughness: number;
    tileMetalness: number;
    tileClearcoat: number;
    mirrorColor: number;
    mirrorAccentColor: number;
    particleColor: number;
    ringColor: number;
    shadowOpacity: number;
    faceColors: Record<FaceKey, number>;
  };
}
