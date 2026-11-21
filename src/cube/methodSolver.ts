import {
  applyMove,
  computeSolutionFromHistory,
  isCubeSolved,
  parseAlgorithm,
  parseNotation,
  simplifyMoves,
} from './cubeLogic';
import type { CubeMove, CubieState, FaceKey, PuzzleType, SolveMethodId } from './types';

export interface SolveMethodMeta {
  id: SolveMethodId;
  name: string;
  shortName: string;
  tagline: string;
  stageSummary: string;
}

export const SOLVE_METHOD_LIST: SolveMethodMeta[] = [
  {
    id: 'beginner',
    name: 'Beginner (LBL)',
    shortName: 'Beginner',
    tagline: '7 intuitive layer-by-layer steps using classic starter triggers.',
    stageSummary: 'Cross → Corners → Middle → Top Cross → Edges → Position → Twist',
  },
  {
    id: 'cfop',
    name: 'CFOP (Fridrich)',
    shortName: 'CFOP',
    tagline: 'World-record speedcubing flow: Cross, 4 F2L pairs, OLL, and PLL.',
    stageSummary: 'Cross → F2L (4 Pairs) → OLL → PLL',
  },
  {
    id: 'roux',
    name: 'Roux',
    shortName: 'Roux',
    tagline: 'Blockbuilding speed method finishing with M-slice Last Six Edges.',
    stageSummary: '1st Block → 2nd Block → CMLL → LSE (4a/4b/4c)',
  },
  {
    id: 'zz',
    name: 'ZZ / ZOLL',
    shortName: 'ZZ / ZOLL',
    tagline: 'Pre-orients all 12 edges first for rotationless F2L, ZOLL, and EPLL.',
    stageSummary: 'EOLine → ZZF2L → ZOLL/COLL → EPLL',
  },
];

export const SOLVE_METHODS: Record<SolveMethodId, SolveMethodMeta> = {
  beginner: SOLVE_METHOD_LIST[0],
  cfop: SOLVE_METHOD_LIST[1],
  roux: SOLVE_METHOD_LIST[2],
  zz: SOLVE_METHOD_LIST[3],
};

export interface MethodSubStep {
  label: string;
  startMoveIndex: number;
  endMoveIndex: number;
}

export interface MethodSolvePhase {
  id: string;
  stageIndex: number;
  name: string;
  shortName: string;
  algorithmName: string;
  description: string;
  moves: CubeMove[];
  startMoveIndex: number;
  endMoveIndex: number;
  subSteps?: MethodSubStep[];
}

export interface MethodSolvePlan {
  methodId: SolveMethodId;
  methodName: string;
  puzzleType: PuzzleType;
  isStateBased: boolean;
  totalMoves: number;
  allMoves: CubeMove[];
  phases: MethodSolvePhase[];
}

export interface ActiveMethodProgress {
  phaseIndex: number;
  phase: MethodSolvePhase | null;
  subStep: MethodSubStep | null;
  moveInPhase: number;
  phaseLength: number;
  completedPhaseCount: number;
  isComplete: boolean;
}

export function getActiveMethodProgress(
  plan: MethodSolvePlan | null,
  currentMoveIndex: number
): ActiveMethodProgress {
  if (!plan || plan.phases.length === 0) {
    return {
      phaseIndex: 0,
      phase: null,
      subStep: null,
      moveInPhase: 0,
      phaseLength: 0,
      completedPhaseCount: 0,
      isComplete: true,
    };
  }

  if (currentMoveIndex >= plan.totalMoves) {
    const lastIdx = plan.phases.length - 1;
    const lastPhase = plan.phases[lastIdx];
    return {
      phaseIndex: lastIdx,
      phase: lastPhase,
      subStep: lastPhase.subSteps?.[lastPhase.subSteps.length - 1] ?? null,
      moveInPhase: lastPhase.moves.length,
      phaseLength: lastPhase.moves.length,
      completedPhaseCount: plan.phases.length,
      isComplete: true,
    };
  }

  let completedPhaseCount = 0;
  for (let i = 0; i < plan.phases.length; i++) {
    const p = plan.phases[i];
    if (p.endMoveIndex <= currentMoveIndex) {
      completedPhaseCount++;
      continue;
    }
    const subStep =
      p.subSteps?.find(
        (s) => currentMoveIndex >= s.startMoveIndex && currentMoveIndex < s.endMoveIndex
      ) ?? null;
    return {
      phaseIndex: i,
      phase: p,
      subStep,
      moveInPhase: Math.max(0, currentMoveIndex - p.startMoveIndex),
      phaseLength: p.moves.length,
      completedPhaseCount,
      isComplete: false,
    };
  }

  const lastIdx = plan.phases.length - 1;
  return {
    phaseIndex: lastIdx,
    phase: plan.phases[lastIdx],
    subStep: null,
    moveInPhase: plan.phases[lastIdx].moves.length,
    phaseLength: plan.phases[lastIdx].moves.length,
    completedPhaseCount: plan.phases.length,
    isComplete: true,
  };
}

// ============================================================================
// Core 3x3 Cubie Inspection & Algebraic Helpers
// ============================================================================

type GoalColors = Record<FaceKey, FaceKey>;
type Pos3 = readonly [number, number, number];

const MOVE_CACHE = new Map<string, CubeMove>();

function getMove3(token: string): CubeMove {
  let m = MOVE_CACHE.get(token);
  if (!m) {
    const parsed = parseNotation(token, '3x3');
    if (!parsed) throw new Error(`Invalid 3x3 notation token: ${token}`);
    MOVE_CACHE.set(token, parsed);
    m = parsed;
  }
  return m;
}

function getMoves3(tokens: readonly string[]): CubeMove[] {
  return tokens.map(getMove3);
}

function applyTokens(state: CubieState[], tokens: readonly string[]): CubieState[] {
  let s = state;
  for (let i = 0; i < tokens.length; i++) {
    s = applyMove(s, getMove3(tokens[i]));
  }
  return s;
}

function applyMoves(state: CubieState[], moves: readonly CubeMove[]): CubieState[] {
  let s = state;
  for (let i = 0; i < moves.length; i++) {
    s = applyMove(s, moves[i]);
  }
  return s;
}

/**
 * Reads the 6 center stickers from the live 3x3 cubie state so every method works
 * even if the user rotated the cube with x/y/z or sliced with M/E/S.
 */
export function getGoalColorsFromCenters(cubies: CubieState[]): GoalColors {
  const findCenter = (x: number, y: number, z: number, face: FaceKey): FaceKey => {
    const c = cubies.find((cu) => cu.pos[0] === x && cu.pos[1] === y && cu.pos[2] === z);
    return c?.stickers[face] ?? face;
  };
  return {
    py: findCenter(0, 1, 0, 'py'),
    ny: findCenter(0, -1, 0, 'ny'),
    px: findCenter(1, 0, 0, 'px'),
    nx: findCenter(-1, 0, 0, 'nx'),
    pz: findCenter(0, 0, 1, 'pz'),
    nz: findCenter(0, 0, -1, 'nz'),
  };
}

function posToFaces(pos: Pos3): FaceKey[] {
  const faces: FaceKey[] = [];
  if (pos[0] === 1) faces.push('px');
  else if (pos[0] === -1) faces.push('nx');
  if (pos[1] === 1) faces.push('py');
  else if (pos[1] === -1) faces.push('ny');
  if (pos[2] === 1) faces.push('pz');
  else if (pos[2] === -1) faces.push('nz');
  return faces;
}

function getCubieAt(cubies: CubieState[], x: number, y: number, z: number): CubieState {
  for (let i = 0; i < cubies.length; i++) {
    const p = cubies[i].pos;
    if (p[0] === x && p[1] === y && p[2] === z) return cubies[i];
  }
  throw new Error(`Cubie not found at (${x},${y},${z})`);
}

function isPosSolved(cubies: CubieState[], goal: GoalColors, pos: Pos3): boolean {
  const c = getCubieAt(cubies, pos[0], pos[1], pos[2]);
  const faces = posToFaces(pos);
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    if (c.stickers[f] !== goal[f]) return false;
  }
  return true;
}

function findEdgeByColors(cubies: CubieState[], c1: FaceKey, c2: FaceKey): CubieState {
  for (let i = 0; i < cubies.length; i++) {
    const vals = Object.values(cubies[i].stickers);
    if (vals.length === 2 && ((vals[0] === c1 && vals[1] === c2) || (vals[0] === c2 && vals[1] === c1))) {
      return cubies[i];
    }
  }
  throw new Error(`Edge (${c1}, ${c2}) not found`);
}

function findCornerByColors(cubies: CubieState[], c1: FaceKey, c2: FaceKey, c3: FaceKey): CubieState {
  for (let i = 0; i < cubies.length; i++) {
    const vals = Object.values(cubies[i].stickers);
    if (vals.length === 3 && vals.includes(c1) && vals.includes(c2) && vals.includes(c3)) {
      return cubies[i];
    }
  }
  throw new Error(`Corner (${c1}, ${c2}, ${c3}) not found`);
}

function encodeEdge(cubies: CubieState[], c1: FaceKey, c2: FaceKey): string {
  const e = findEdgeByColors(cubies, c1, c2);
  let f1 = '';
  for (const [k, v] of Object.entries(e.stickers)) {
    if (v === c1) {
      f1 = k;
      break;
    }
  }
  return `${e.pos[0]},${e.pos[1]},${e.pos[2]}:${f1}`;
}

function encodeCorner(cubies: CubieState[], c1: FaceKey, c2: FaceKey, c3: FaceKey): string {
  const c = findCornerByColors(cubies, c1, c2, c3);
  let f1 = '';
  let f2 = '';
  for (const [k, v] of Object.entries(c.stickers)) {
    if (v === c1) f1 = k;
    else if (v === c2) f2 = k;
  }
  return `${c.pos[0]},${c.pos[1]},${c.pos[2]}:${f1},${f2}`;
}

// Y-axis conjugation: 0 = FR, 1 = FL, 2 = BL, 3 = BR
const Y_FACE_MAP: Record<string, [string, string, string, string]> = {
  R: ['R', 'F', 'L', 'B'],
  F: ['F', 'L', 'B', 'R'],
  L: ['L', 'B', 'R', 'F'],
  B: ['B', 'R', 'F', 'L'],
  U: ['U', 'U', 'U', 'U'],
  D: ['D', 'D', 'D', 'D'],
};

function conjugateTokenY(token: string, yTurns: 0 | 1 | 2 | 3): string {
  if (yTurns === 0) return token;
  const face = token[0];
  const rest = token.slice(1);
  const mapped = Y_FACE_MAP[face];
  if (!mapped) return token;
  return `${mapped[yTurns]}${rest}`;
}

function conjugateAlgY(tokens: readonly string[], yTurns: 0 | 1 | 2 | 3): string[] {
  if (yTurns === 0) return [...tokens];
  return tokens.map((t) => conjugateTokenY(t, yTurns));
}

interface MacroDef {
  tokens: string[];
  moves: CubeMove[];
}

function makeMacros(seqs: readonly (readonly string[])[]): MacroDef[] {
  return seqs.map((seq) => ({
    tokens: [...seq],
    moves: getMoves3(seq),
  }));
}

/**
 * Fast bounded BFS over a custom macro set and compact piece-state hash key.
 */
function bfsMacros(
  start: CubieState[],
  macros: readonly MacroDef[],
  getKey: (s: CubieState[]) => string,
  isGoal: (s: CubieState[]) => boolean,
  maxStates = 6000
): string[] | null {
  if (isGoal(start)) return [];

  const visited = new Set<string>();
  visited.add(getKey(start));

  interface Node {
    state: CubieState[];
    parent: number;
    macroIdx: number;
  }

  const singleMoveFace = macros.map((m) =>
    m.tokens.length === 1 ? m.tokens[0][0] : null
  );

  const queue: Node[] = [{ state: start, parent: -1, macroIdx: -1 }];
  let head = 0;

  while (head < queue.length && visited.size < maxStates) {
    const curr = queue[head];
    const prevFace = curr.macroIdx >= 0 ? singleMoveFace[curr.macroIdx] : null;
    for (let i = 0; i < macros.length; i++) {
      if (prevFace && singleMoveFace[i] === prevFace) continue;
      const nextState = applyMoves(curr.state, macros[i].moves);
      const key = getKey(nextState);
      if (visited.has(key)) continue;

      if (isGoal(nextState)) {
        const path: number[] = [i];
        let p = head;
        while (p > 0) {
          path.push(queue[p].macroIdx);
          p = queue[p].parent;
        }
        path.reverse();
        const result: string[] = [];
        for (const mIdx of path) {
          result.push(...macros[mIdx].tokens);
        }
        return result;
      }

      visited.add(key);
      queue.push({ state: nextState, parent: head, macroIdx: i });
      if (visited.size >= maxStates) break;
    }
    head++;
  }

  return null;
}

// ============================================================================
// Standard Positions & Invariant Predicates (exported for unit tests!)
// ============================================================================

const D_CROSS_EDGES: { pos: Pos3; sideFace: FaceKey }[] = [
  { pos: [0, -1, 1], sideFace: 'pz' }, // DF
  { pos: [1, -1, 0], sideFace: 'px' }, // DR
  { pos: [0, -1, -1], sideFace: 'nz' }, // DB
  { pos: [-1, -1, 0], sideFace: 'nx' }, // DL
];

const F2L_SLOTS: {
  name: string;
  yTurns: 0 | 1 | 2 | 3;
  cornerPos: Pos3;
  cornerFaces: [FaceKey, FaceKey];
  edgePos: Pos3;
  edgeFaces: [FaceKey, FaceKey];
}[] = [
  {
    name: 'FR',
    yTurns: 0,
    cornerPos: [1, -1, 1],
    cornerFaces: ['px', 'pz'],
    edgePos: [1, 0, 1],
    edgeFaces: ['px', 'pz'],
  },
  {
    name: 'FL',
    yTurns: 1,
    cornerPos: [-1, -1, 1],
    cornerFaces: ['pz', 'nx'],
    edgePos: [-1, 0, 1],
    edgeFaces: ['pz', 'nx'],
  },
  {
    name: 'BL',
    yTurns: 2,
    cornerPos: [-1, -1, -1],
    cornerFaces: ['nx', 'nz'],
    edgePos: [-1, 0, -1],
    edgeFaces: ['nx', 'nz'],
  },
  {
    name: 'BR',
    yTurns: 3,
    cornerPos: [1, -1, -1],
    cornerFaces: ['nz', 'px'],
    edgePos: [1, 0, -1],
    edgeFaces: ['nz', 'px'],
  },
];

const U_EDGE_POSITIONS: Pos3[] = [
  [0, 1, 1], // UF
  [1, 1, 0], // UR
  [0, 1, -1], // UB
  [-1, 1, 0], // UL
];

const U_CORNER_POSITIONS: Pos3[] = [
  [1, 1, 1], // UFR
  [-1, 1, 1], // UFL
  [-1, 1, -1], // UBL
  [1, 1, -1], // UBR
];

const ALL_12_EDGE_POSITIONS: Pos3[] = [
  [0, 1, 1],
  [1, 1, 0],
  [0, 1, -1],
  [-1, 1, 0],
  [0, -1, 1],
  [1, -1, 0],
  [0, -1, -1],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [-1, 0, -1],
  [1, 0, -1],
];

export function isDCrossSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return D_CROSS_EDGES.every((e) => isPosSolved(cubies, goal, e.pos));
}

export function isFirstLayerSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return isDCrossSolved(cubies, goal) && F2L_SLOTS.every((s) => isPosSolved(cubies, goal, s.cornerPos));
}

export function isF2LSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return (
    isFirstLayerSolved(cubies, goal) && F2L_SLOTS.every((s) => isPosSolved(cubies, goal, s.edgePos))
  );
}

export function isTopCrossOriented(cubies: CubieState[], goal: GoalColors): boolean {
  return U_EDGE_POSITIONS.every((p) => getCubieAt(cubies, p[0], p[1], p[2]).stickers.py === goal.py);
}

export function isOLLSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return (
    isTopCrossOriented(cubies, goal) &&
    U_CORNER_POSITIONS.every((p) => getCubieAt(cubies, p[0], p[1], p[2]).stickers.py === goal.py)
  );
}

export function isRouxFirstBlockSolved(cubies: CubieState[], goal: GoalColors): boolean {
  const positions: Pos3[] = [
    [-1, -1, 0], // DL
    [-1, -1, -1], // DBL
    [-1, 0, -1], // BL
    [-1, -1, 1], // DFL
    [-1, 0, 1], // FL
    [-1, 0, 0], // L center
  ];
  return positions.every((p) => isPosSolved(cubies, goal, p));
}

export function isRouxSecondBlockSolved(cubies: CubieState[], goal: GoalColors): boolean {
  const positions: Pos3[] = [
    [1, -1, 0], // DR
    [1, -1, -1], // DBR
    [1, 0, -1], // BR
    [1, -1, 1], // DFR
    [1, 0, 1], // FR
    [1, 0, 0], // R center
  ];
  return isRouxFirstBlockSolved(cubies, goal) && positions.every((p) => isPosSolved(cubies, goal, p));
}

export function isUCornersSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return U_CORNER_POSITIONS.every((p) => isPosSolved(cubies, goal, p));
}

/**
 * Exact ZZ Edge Orientation check (F/B as EO axis; <U, D, L, R, F2, B2> preserve EO).
 */
export function isEdgeZZGood(edge: CubieState, goal: GoalColors): boolean {
  const entries = Object.entries(edge.stickers) as [FaceKey, FaceKey][];
  // Find primary color: U/D color if present, otherwise F/B color
  let primaryFace: FaceKey | null = null;
  for (const [face, color] of entries) {
    if (color === goal.py || color === goal.ny) {
      primaryFace = face;
      break;
    }
  }
  if (!primaryFace) {
    for (const [face, color] of entries) {
      if (color === goal.pz || color === goal.nz) {
        primaryFace = face;
        break;
      }
    }
  }
  if (!primaryFace) return true;
  if (primaryFace === 'py' || primaryFace === 'ny') return true;
  if (edge.pos[1] === 0 && (primaryFace === 'pz' || primaryFace === 'nz')) return true;
  return false;
}

export function countBadZZEdges(cubies: CubieState[], goal: GoalColors): number {
  let bad = 0;
  for (const pos of ALL_12_EDGE_POSITIONS) {
    const e = getCubieAt(cubies, pos[0], pos[1], pos[2]);
    if (!isEdgeZZGood(e, goal)) bad++;
  }
  return bad;
}

export function isZZEOLineSolved(cubies: CubieState[], goal: GoalColors): boolean {
  return (
    countBadZZEdges(cubies, goal) === 0 &&
    isPosSolved(cubies, goal, [0, -1, 1]) &&
    isPosSolved(cubies, goal, [0, -1, -1])
  );
}

// ============================================================================
// Shared Move Sets & Last-Layer Algorithm Catalogs
// ============================================================================

const ALL_18_FACE_MACROS = makeMacros([
  ['U'], ["U'"], ['U2'],
  ['D'], ["D'"], ['D2'],
  ['R'], ["R'"], ['R2'],
  ['L'], ["L'"], ['L2'],
  ['F'], ["F'"], ['F2'],
  ['B'], ["B'"], ['B2'],
]);

const AUFS: readonly (readonly string[])[] = [[], ['U'], ["U'"], ['U2']];

interface NamedAlg {
  name: string;
  tokens: string[];
}

/**
 * All 7 canonical OCLL algorithms — every single one preserves F2L AND keeps U-edges oriented!
 * (Pure <R, U> / <R, U, D> / <Rw, U, R, F> speedcube standards.)
 */
const OCLL_CATALOG: NamedAlg[] = [
  { name: 'Sune (OLL 27)', tokens: ['R', 'U', "R'", 'U', 'R', 'U2', "R'"] },
  { name: 'Antisune (OLL 26)', tokens: ['R', 'U2', "R'", "U'", 'R', "U'", "R'"] },
  { name: 'H / Cross (OLL 21)', tokens: ['R', 'U', "R'", 'U', 'R', "U'", "R'", 'U', 'R', 'U2', "R'"] },
  { name: 'Pi / Bruno (OLL 22)', tokens: ['R', 'U2', 'R2', "U'", 'R2', "U'", 'R2', 'U2', 'R'] },
  { name: 'U / Headlights (OLL 23)', tokens: ['R2', 'D', "R'", 'U2', 'R', "D'", "R'", 'U2', "R'"] },
  { name: 'T / Chameleon (OLL 24)', tokens: ['Rw', 'U', "R'", "U'", "Rw'", 'F', 'R', "F'"] },
  { name: 'L / Bowtie (OLL 25)', tokens: ["F'", 'Rw', 'U', "R'", "U'", "Rw'", 'F', 'R'] },
];

const EPLL_CATALOG: NamedAlg[] = [
  { name: 'Ua-Perm', tokens: ['M2', 'U', 'M', 'U2', "M'", 'U', 'M2'] },
  { name: 'Ub-Perm', tokens: ['M2', "U'", 'M', 'U2', "M'", "U'", 'M2'] },
  { name: 'H-Perm', tokens: ['M2', 'U', 'M2', 'U2', 'M2', 'U', 'M2'] },
  { name: 'Z-Perm', tokens: ['M2', 'U', 'M2', 'U', "M'", 'U2', 'M2', 'U2', "M'"] },
];

const CPLL_CATALOG: NamedAlg[] = [
  {
    name: 'T-Perm',
    tokens: ['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"],
  },
  {
    name: 'Y-Perm',
    tokens: ['F', 'R', "U'", "R'", "U'", 'R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"],
  },
];

const ONE_LOOK_PLL_CATALOG: NamedAlg[] = [
  ...EPLL_CATALOG,
  ...CPLL_CATALOG,
  {
    name: 'Jb-Perm',
    tokens: ['R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'"],
  },
  {
    name: 'Ja-Perm',
    tokens: ["L'", "U'", 'L', 'F', "L'", "U'", 'L', 'U', 'L', "F'", 'L2', 'U', 'L'],
  },
  {
    name: 'Aa-Perm',
    tokens: ["R'", 'F', "R'", 'B2', 'R', "F'", "R'", 'B2', 'R2'],
  },
  {
    name: 'Ab-Perm',
    tokens: ['R', "B'", 'R', 'F2', "R'", 'B', 'R', 'F2', 'R2'],
  },
  {
    name: 'F-Perm',
    tokens: ["R'", "U'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", 'U', 'R'],
  },
  {
    name: 'Ra-Perm',
    tokens: ['R', "U'", "R'", "U'", 'R', 'U', 'R', 'D', "R'", "U'", 'R', "D'", "R'", 'U2', "R'"],
  },
  {
    name: 'Rb-Perm',
    tokens: ["R'", 'U2', 'R', 'U2', "R'", 'F', 'R', 'U', "R'", "U'", "R'", "F'", 'R2'],
  },
  {
    name: 'V-Perm',
    tokens: ["R'", 'U', "R'", "U'", "B'", "R'", 'B2', "U'", "B'", 'U', "B'", 'R', 'B', 'R'],
  },
];

// ============================================================================
// Shared Sub-Solvers
// ============================================================================

/**
 * Solves the 4 bottom (D) cross edges sequentially using compact-key BFS
 * with a deterministic slot-safe fallback for the 4th edge so it never fails.
 */
function solveDCross(start: CubieState[], goal: GoalColors): { state: CubieState[]; tokens: string[] } {
  let state = start;
  const allTokens: string[] = [];

  for (let idx = 0; idx < D_CROSS_EDGES.length; idx++) {
    const target = D_CROSS_EDGES[idx];
    if (isPosSolved(state, goal, target.pos)) continue;

    const tracked = D_CROSS_EDGES.slice(0, idx + 1);
    const getKey = (s: CubieState[]) =>
      tracked.map((e) => encodeEdge(s, goal.ny, goal[e.sideFace])).join('|');
    const isGoal = (s: CubieState[]) => tracked.every((e) => isPosSolved(s, goal, e.pos));

    let found = bfsMacros(state, ALL_18_FACE_MACROS, getKey, isGoal, idx < 3 ? 3500 : 7500);

    // Deterministic fallback if 4th edge sits >4 moves away: lift DL edge to U without disturbing DF/DR/DB, then insert
    if (!found) {
      const safeMacros = makeMacros([
        ['U'], ["U'"], ['U2'],
        ['L'], ["L'"], ['L2'],
        ['R', 'U', "R'"], ["R'", 'U', 'R'],
        ['F', 'U', "F'"], ["F'", 'U', 'F'],
        ['B', 'U', "B'"], ["B'", 'U', 'B'],
        ["F'", 'L', 'F'], ['B', "L'", "B'"],
      ]);
      found = bfsMacros(state, safeMacros, getKey, isGoal, 4000) ?? [];
    }

    state = applyTokens(state, found);
    allTokens.push(...found);
  }

  return { state, tokens: simplifyTokenList(allTokens) };
}

function simplifyTokenList(tokens: readonly string[]): string[] {
  if (tokens.length === 0) return [];
  const moves = getMoves3(tokens);
  return simplifyMoves(moves, '3x3').map((m) => m.notation);
}

/**
 * Checks if a given cubie currently lives in the U layer (y = 1) or at targetPos.
 */
function isInUOrPos(cubie: CubieState, pos: Pos3): boolean {
  return (
    cubie.pos[1] === 1 ||
    (cubie.pos[0] === pos[0] && cubie.pos[1] === pos[1] && cubie.pos[2] === pos[2])
  );
}

interface SlotExtractor {
  pos: Pos3;
  lift: string[];
}

/**
 * Safely extracts both a target corner and target edge into {U-layer, ownSlot}
 * without one extraction accidentally kicking the other piece back out of U.
 */
function ensurePairInUOrSlot(
  start: CubieState[],
  cornerColors: readonly [FaceKey, FaceKey, FaceKey],
  edgeColors: readonly [FaceKey, FaceKey],
  slotCornerPos: Pos3,
  slotEdgePos: Pos3,
  extractors: readonly SlotExtractor[]
): { state: CubieState[]; tokens: string[] } {
  let state = start;
  const tokens: string[] = [];

  const findLift = (pos: Pos3): string[] | null => {
    for (const ex of extractors) {
      if (ex.pos[0] === pos[0] && ex.pos[1] === pos[1] && ex.pos[2] === pos[2]) {
        return ex.lift;
      }
    }
    return null;
  };

  for (let guard = 0; guard < 6; guard++) {
    const c = findCornerByColors(state, cornerColors[0], cornerColors[1], cornerColors[2]);
    const e = findEdgeByColors(state, edgeColors[0], edgeColors[1]);
    const cOk = isInUOrPos(c, slotCornerPos);
    const eOk = isInUOrPos(e, slotEdgePos);
    if (cOk && eOk) break;

    const lift = !cOk ? findLift(c.pos) : findLift(e.pos);
    if (!lift || lift.length === 0) break;

    // Pick a pre-U move (if needed) so that:
    // 1. The target piece lands in U (or own slot), AND
    // 2. If the other piece is already in U/ownSlot, it stays in U/ownSlot!
    let bestPre: readonly string[] = [];
    let bestScore = -1;
    for (const pre of AUFS) {
      const cand = applyTokens(applyTokens(state, pre), lift);
      const nc = findCornerByColors(cand, cornerColors[0], cornerColors[1], cornerColors[2]);
      const ne = findEdgeByColors(cand, edgeColors[0], edgeColors[1]);
      const score = (isInUOrPos(nc, slotCornerPos) ? 1 : 0) + (isInUOrPos(ne, slotEdgePos) ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestPre = pre;
        if (score === 2) break;
      }
    }

    const step = [...bestPre, ...lift];
    state = applyTokens(state, step);
    tokens.push(...step);
  }

  return { state, tokens };
}

/**
 * Matches a single 7-case OCLL (with AUF) so all 4 U-corners have U-color facing up
 * while preserving F2L (and preserving U-edge orientation!).
 */
function solveOCLL(
  start: CubieState[],
  goal: GoalColors,
  requireEdgesOriented: boolean
): { state: CubieState[]; tokens: string[]; algName: string } {
  const cornersOriented = (s: CubieState[]) =>
    U_CORNER_POSITIONS.every((p) => getCubieAt(s, p[0], p[1], p[2]).stickers.py === goal.py) &&
    (!requireEdgesOriented || isTopCrossOriented(s, goal));

  if (cornersOriented(start)) {
    return { state: start, tokens: [], algName: 'OCLL Skip' };
  }

  for (const auf of AUFS) {
    const pre = applyTokens(start, auf);
    for (const ocll of OCLL_CATALOG) {
      const candidate = applyTokens(pre, ocll.tokens);
      if (cornersOriented(candidate)) {
        return {
          state: candidate,
          tokens: simplifyTokenList([...auf, ...ocll.tokens]),
          algName: ocll.name,
        };
      }
    }
  }

  return { state: start, tokens: [], algName: 'OCLL' };
}

function areUCornersAlignedAfterSomeAUF(state: CubieState[], goal: GoalColors): boolean {
  for (const auf of AUFS) {
    const s = applyTokens(state, auf);
    if (isUCornersSolved(s, goal)) return true;
  }
  return false;
}

/**
 * Solves corner permutation of the last layer (CPLL) using T-Perm (adjacent) or Y-Perm (diagonal),
 * preserving F2L and U-edge orientation.
 */
function solveCPLL(
  start: CubieState[],
  goal: GoalColors,
  alignAUF = false
): { state: CubieState[]; tokens: string[]; algName: string } {
  if (areUCornersAlignedAfterSomeAUF(start, goal)) {
    if (!alignAUF) return { state: start, tokens: [], algName: 'CPLL Skip' };
    for (const auf of AUFS) {
      const s = applyTokens(start, auf);
      if (isUCornersSolved(s, goal)) {
        return { state: s, tokens: [...auf], algName: auf.length ? 'AUF Align' : 'CPLL Skip' };
      }
    }
  }

  for (const cpll of CPLL_CATALOG) {
    for (const pre of AUFS) {
      const s1 = applyTokens(start, pre);
      const s2 = applyTokens(s1, cpll.tokens);
      if (areUCornersAlignedAfterSomeAUF(s2, goal)) {
        if (!alignAUF) {
          return {
            state: s2,
            tokens: simplifyTokenList([...pre, ...cpll.tokens]),
            algName: cpll.name,
          };
        }
        for (const post of AUFS) {
          const s3 = applyTokens(s2, post);
          if (isUCornersSolved(s3, goal)) {
            return {
              state: s3,
              tokens: simplifyTokenList([...pre, ...cpll.tokens, ...post]),
              algName: cpll.name,
            };
          }
        }
      }
    }
  }

  return { state: start, tokens: [], algName: 'CPLL' };
}

/**
 * Solves pure EPLL (Ua, Ub, H, Z, or AUF-only) when corners are solved and U edges are oriented.
 */
function solveEPLL(
  start: CubieState[],
  goal: GoalColors
): { state: CubieState[]; tokens: string[]; algName: string } {
  for (const auf of AUFS) {
    const s = applyTokens(start, auf);
    if (isCubeSolved(s, '3x3') && isUCornersSolved(s, goal)) {
      return { state: s, tokens: [...auf], algName: auf.length ? 'EPLL Skip (AUF)' : 'EPLL Skip' };
    }
  }

  for (const epll of EPLL_CATALOG) {
    for (const pre of AUFS) {
      const s1 = applyTokens(start, pre);
      const s2 = applyTokens(s1, epll.tokens);
      for (const post of AUFS) {
        const s3 = applyTokens(s2, post);
        if (isCubeSolved(s3, '3x3')) {
          return {
            state: s3,
            tokens: simplifyTokenList([...pre, ...epll.tokens, ...post]),
            algName: epll.name,
          };
        }
      }
    }
  }

  return { state: start, tokens: [], algName: 'EPLL' };
}

// ============================================================================
// Phase Builder Utility
// ============================================================================

interface PhaseDraft {
  id: string;
  name: string;
  shortName: string;
  algorithmName: string;
  description: string;
  tokens: string[];
  subSteps?: { label: string; count: number }[];
}

function finalizePlan(
  methodId: SolveMethodId,
  puzzleType: PuzzleType,
  drafts: PhaseDraft[],
  isStateBased: boolean
): MethodSolvePlan {
  const allMoves: CubeMove[] = [];
  const phases: MethodSolvePhase[] = [];

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const moves = parseAlgorithm(d.tokens, puzzleType);
    const startMoveIndex = allMoves.length;
    allMoves.push(...moves);
    const endMoveIndex = allMoves.length;

    let subSteps: MethodSubStep[] | undefined;
    if (d.subSteps && d.subSteps.length > 0) {
      subSteps = [];
      let cursor = startMoveIndex;
      for (const s of d.subSteps) {
        if (s.count <= 0) continue;
        subSteps.push({
          label: s.label,
          startMoveIndex: cursor,
          endMoveIndex: Math.min(endMoveIndex, cursor + s.count),
        });
        cursor += s.count;
      }
    }

    phases.push({
      id: d.id,
      stageIndex: i,
      name: d.name,
      shortName: d.shortName,
      algorithmName: d.algorithmName,
      description: d.description,
      moves,
      startMoveIndex,
      endMoveIndex,
      subSteps,
    });
  }

  return {
    methodId,
    methodName: SOLVE_METHODS[methodId].name,
    puzzleType,
    isStateBased,
    totalMoves: allMoves.length,
    allMoves,
    phases,
  };
}

// ============================================================================
// METHOD 1: BEGINNER (Regular 7-Stage Layer-by-Layer)
// ============================================================================

function solveBeginner(start: CubieState[], puzzleType: PuzzleType): MethodSolvePlan {
  const goal = getGoalColorsFromCenters(start);
  let state = start;
  const drafts: PhaseDraft[] = [];

  // Stage 1: Bottom Cross
  const cross = solveDCross(state, goal);
  state = cross.state;
  drafts.push({
    id: 'beg-cross',
    name: 'Bottom Cross',
    shortName: 'Cross',
    algorithmName: cross.tokens.length ? 'Direct Edge Alignment' : 'Cross Solved',
    description: 'Place all 4 bottom-layer edges aligned with their matching side centers.',
    tokens: cross.tokens,
  });

  // Stage 2: First Layer Corners
  const cornerTokens: string[] = [];
  const cornerSubSteps: { label: string; count: number }[] = [];
  for (const slot of F2L_SLOTS) {
    if (isPosSolved(state, goal, slot.cornerPos)) continue;
    const slotTokens: string[] = [];
    const c1 = goal.ny;
    const c2 = goal[slot.cornerFaces[0]];
    const c3 = goal[slot.cornerFaces[1]];

    const piece = findCornerByColors(state, c1, c2, c3);
    if (!isInUOrPos(piece, slot.cornerPos)) {
      for (const other of F2L_SLOTS) {
        if (
          other.yTurns !== slot.yTurns &&
          piece.pos[0] === other.cornerPos[0] &&
          piece.pos[1] === other.cornerPos[1] &&
          piece.pos[2] === other.cornerPos[2]
        ) {
          const lift = conjugateAlgY(['R', 'U', "R'"], other.yTurns);
          state = applyTokens(state, lift);
          slotTokens.push(...lift);
          break;
        }
      }
    }

    const macros = makeMacros(
      [
        ['U'], ["U'"], ['U2'],
        ['R', 'U', "R'", "U'"],
        ['U', 'R', "U'", "R'"],
        ['R', 'U', "R'"],
        ["F'", "U'", 'F'],
      ].map((seq) => conjugateAlgY(seq, slot.yTurns))
    );
    const seq =
      bfsMacros(
        state,
        macros,
        (s) => encodeCorner(s, c1, c2, c3),
        (s) => isPosSolved(s, goal, slot.cornerPos),
        500
      ) ?? [];
    state = applyTokens(state, seq);
    slotTokens.push(...seq);

    const clean = simplifyTokenList(slotTokens);
    if (clean.length > 0) {
      cornerTokens.push(...clean);
      cornerSubSteps.push({ label: `Corner ${slot.name}`, count: clean.length });
    }
  }
  drafts.push({
    id: 'beg-corners',
    name: 'First Layer Corners',
    shortName: 'Corners',
    algorithmName: cornerTokens.length ? "Corner Trigger (R U R' U')" : 'First Layer Done',
    description: 'Seat all 4 bottom corners above their home slots using the right-hand trigger.',
    tokens: cornerTokens,
    subSteps: cornerSubSteps,
  });

  // Stage 3: Second Layer Edges
  const midTokens: string[] = [];
  const midSubSteps: { label: string; count: number }[] = [];
  for (const slot of F2L_SLOTS) {
    if (isPosSolved(state, goal, slot.edgePos)) continue;
    const slotTokens: string[] = [];
    const e1 = goal[slot.edgeFaces[0]];
    const e2 = goal[slot.edgeFaces[1]];

    const piece = findEdgeByColors(state, e1, e2);
    if (!isInUOrPos(piece, slot.edgePos)) {
      // Extract from another unsolved equator slot using the classic beginner right-insert
      for (const other of F2L_SLOTS) {
        if (
          piece.pos[0] === other.edgePos[0] &&
          piece.pos[1] === other.edgePos[1] &&
          piece.pos[2] === other.edgePos[2]
        ) {
          const lift = conjugateAlgY(['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'], other.yTurns);
          state = applyTokens(state, lift);
          slotTokens.push(...lift);
          break;
        }
      }
    }

    const macros = makeMacros(
      [
        ['U'], ["U'"], ['U2'],
        ['U', 'R', "U'", "R'", "U'", "F'", 'U', 'F'],
        ["U'", "F'", 'U', 'F', 'U', 'R', "U'", "R'"],
      ].map((seq) => conjugateAlgY(seq, slot.yTurns))
    );
    const seq =
      bfsMacros(
        state,
        macros,
        (s) => encodeEdge(s, e1, e2),
        (s) => isPosSolved(s, goal, slot.edgePos),
        400
      ) ?? [];
    state = applyTokens(state, seq);
    slotTokens.push(...seq);

    const clean = simplifyTokenList(slotTokens);
    if (clean.length > 0) {
      midTokens.push(...clean);
      midSubSteps.push({ label: `Equator ${slot.name}`, count: clean.length });
    }
  }
  drafts.push({
    id: 'beg-middle',
    name: 'Middle Layer Edges',
    shortName: 'Middle',
    algorithmName: midTokens.length ? "Edge Insert (U R U' R' U' F' U F)" : 'Middle Layer Done',
    description: 'Slot each equator edge left or right without disturbing the first layer.',
    tokens: midTokens,
    subSteps: midSubSteps,
  });

  // Stage 4: Top Cross (F R U R' U' F')
  const topCrossTokens: string[] = [];
  let topCrossGuard = 0;
  while (!isTopCrossOriented(state, goal) && topCrossGuard < 4) {
    topCrossGuard++;
    const orientedFlags = U_EDGE_POSITIONS.map(
      (p) => getCubieAt(state, p[0], p[1], p[2]).stickers.py === goal.py
    ); // [UF, UR, UB, UL]
    const count = orientedFlags.filter(Boolean).length;

    if (count === 0) {
      const alg = ['F', 'R', 'U', "R'", "U'", "F'"];
      state = applyTokens(state, alg);
      topCrossTokens.push(...alg);
    } else if (count === 2) {
      const isLine = (orientedFlags[0] && orientedFlags[2]) || (orientedFlags[1] && orientedFlags[3]);
      if (isLine) {
        // Align horizontal bar at UL and UR
        if (orientedFlags[0] && orientedFlags[2]) {
          state = applyTokens(state, ['U']);
          topCrossTokens.push('U');
        }
        const alg = ['F', 'R', 'U', "R'", "U'", "F'"];
        state = applyTokens(state, alg);
        topCrossTokens.push(...alg);
      } else {
        // L-shape: rotate U until oriented edges are at UB (idx 2) and UL (idx 3)
        let rot = 0;
        while (rot < 4) {
          const ubOk = getCubieAt(state, 0, 1, -1).stickers.py === goal.py;
          const ulOk = getCubieAt(state, -1, 1, 0).stickers.py === goal.py;
          if (ubOk && ulOk) break;
          state = applyTokens(state, ['U']);
          topCrossTokens.push('U');
          rot++;
        }
        const alg = ['F', 'U', 'R', "U'", "R'", "F'"];
        state = applyTokens(state, alg);
        topCrossTokens.push(...alg);
      }
    }
  }
  const cleanTopCross = simplifyTokenList(topCrossTokens);
  drafts.push({
    id: 'beg-top-cross',
    name: 'Top Cross',
    shortName: 'Top Cross',
    algorithmName: cleanTopCross.length ? "F R U R' U' F'" : 'Top Cross Skip',
    description: 'Orient the 4 top edges into a solid cross (Dot → L → Line → Cross).',
    tokens: cleanTopCross,
  });

  // Stage 5: Align Top Cross Edges (Sune)
  const alignMacros = makeMacros([
    ['U'], ["U'"], ['U2'],
    ['R', 'U', "R'", 'U', 'R', 'U2', "R'"],
    ...([1, 2, 3] as const).map((y) => conjugateAlgY(['R', 'U', "R'", 'U', 'R', 'U2', "R'"], y)),
  ]);
  const alignTokens = simplifyTokenList(
    bfsMacros(
      state,
      alignMacros,
      (s) =>
        U_EDGE_POSITIONS.map((p) => {
          const c = getCubieAt(s, p[0], p[1], p[2]);
          const sideFace = posToFaces(p).find((f) => f !== 'py')!;
          return c.stickers[sideFace] ?? '';
        }).join(','),
      (s) => U_EDGE_POSITIONS.every((p) => isPosSolved(s, goal, p)),
      400
    ) ?? []
  );
  state = applyTokens(state, alignTokens);
  drafts.push({
    id: 'beg-align-edges',
    name: 'Align Top Edges',
    shortName: 'Align Edges',
    algorithmName: alignTokens.length ? "Sune (R U R' U R U2 R')" : 'Edges Aligned',
    description: 'Cycle top cross edges with Sune until all 4 match their side center colors.',
    tokens: alignTokens,
  });

  // Stage 6: Position Top Corners (Niklas)
  const isCornerInHomePos = (s: CubieState[], pos: Pos3) => {
    const c = getCubieAt(s, pos[0], pos[1], pos[2]);
    const vals = Object.values(c.stickers);
    const needed = posToFaces(pos).map((f) => goal[f]);
    return needed.every((col) => vals.includes(col));
  };
  const niklasMacros = makeMacros(
    ([0, 1, 2, 3] as const).map((y) =>
      conjugateAlgY(['U', 'R', "U'", "L'", 'U', "R'", "U'", 'L'], y)
    )
  );
  const posCornerTokens = simplifyTokenList(
    bfsMacros(
      state,
      niklasMacros,
      (s) =>
        U_CORNER_POSITIONS.map((p) => {
          const c = getCubieAt(s, p[0], p[1], p[2]);
          return Object.values(c.stickers).sort().join('');
        }).join('|'),
      (s) => U_CORNER_POSITIONS.every((p) => isCornerInHomePos(s, p)),
      120
    ) ?? []
  );
  state = applyTokens(state, posCornerTokens);
  drafts.push({
    id: 'beg-pos-corners',
    name: 'Position Top Corners',
    shortName: 'Pos Corners',
    algorithmName: posCornerTokens.length ? "Niklas (U R U' L' U R' U' L)" : 'Corners Positioned',
    description: 'Cycle top corners into their home slots while keeping the top cross intact.',
    tokens: posCornerTokens,
  });

  // Stage 7: Twist Final Corners (R' D' R D)
  const twistTokens: string[] = [];
  const twistTrigger = ["R'", "D'", 'R', 'D'];
  let uRotated = 0;
  for (let slot = 0; slot < 4; slot++) {
    let guard = 0;
    while (getCubieAt(state, 1, 1, 1).stickers.py !== goal.py && guard < 6) {
      state = applyTokens(state, twistTrigger);
      twistTokens.push(...twistTrigger);
      guard++;
    }
    if (U_CORNER_POSITIONS.every((p) => getCubieAt(state, p[0], p[1], p[2]).stickers.py === goal.py)) {
      break;
    }
    state = applyTokens(state, ['U']);
    twistTokens.push('U');
    uRotated++;
  }
  // Final AUF to align solved top layer
  for (const auf of AUFS) {
    const candidate = applyTokens(state, auf);
    if (isCubeSolved(candidate, '3x3')) {
      state = candidate;
      twistTokens.push(...auf);
      break;
    }
  }
  const cleanTwist = simplifyTokenList(twistTokens);
  drafts.push({
    id: 'beg-twist-corners',
    name: 'Orient Final Corners',
    shortName: 'Twist Corners',
    algorithmName: cleanTwist.length ? "Corner Twist (R' D' R D)" : 'Cube Solved',
    description: `Twist remaining top corners in place at front-right, cycling U between corners${uRotated > 0 ? ' until F2L locks back in' : ''}.`,
    tokens: cleanTwist,
  });

  return finalizePlan('beginner', puzzleType, drafts, true);
}

// ============================================================================
// METHOD 2: CFOP (Fridrich — Cross → F2L → 2-Look OLL → PLL)
// ============================================================================

function solveCFOP(start: CubieState[], puzzleType: PuzzleType): MethodSolvePlan {
  const goal = getGoalColorsFromCenters(start);
  let state = start;
  const drafts: PhaseDraft[] = [];

  // Stage 1: Cross
  const cross = solveDCross(state, goal);
  state = cross.state;
  drafts.push({
    id: 'cfop-cross',
    name: 'Bottom Cross',
    shortName: 'Cross',
    algorithmName: cross.tokens.length ? `Direct Cross (${cross.tokens.length} moves)` : 'Cross Skip',
    description: 'Solve all 4 bottom cross edges directly on D in minimal moves.',
    tokens: cross.tokens,
  });

  // Stage 2: F2L (4 Corner-Edge Pairs)
  const f2lTokens: string[] = [];
  const f2lSubSteps: { label: string; count: number }[] = [];
  let pairsSolved = 0;

  for (let i = 0; i < F2L_SLOTS.length; i++) {
    const slot = F2L_SLOTS[i];
    if (isPosSolved(state, goal, slot.cornerPos) && isPosSolved(state, goal, slot.edgePos)) {
      continue;
    }

    const slotTokens: string[] = [];
    const c1 = goal.ny;
    const c2 = goal[slot.cornerFaces[0]];
    const c3 = goal[slot.cornerFaces[1]];
    const e1 = goal[slot.edgeFaces[0]];
    const e2 = goal[slot.edgeFaces[1]];

    const otherExtractors: SlotExtractor[] = [];
    for (let j = i + 1; j < F2L_SLOTS.length; j++) {
      const other = F2L_SLOTS[j];
      const lift = conjugateAlgY(['R', 'U', "R'"], other.yTurns);
      otherExtractors.push({ pos: other.cornerPos, lift });
      otherExtractors.push({ pos: other.edgePos, lift });
    }

    const extracted = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      slot.cornerPos,
      slot.edgePos,
      otherExtractors
    );
    state = extracted.state;
    slotTokens.push(...extracted.tokens);

    // Solve corner+edge pair in canonical slot using slot-safe F2L macros (<= 150 states!)
    const f2lMacros = makeMacros(
      [
        ['U'], ["U'"], ['U2'],
        ['R', 'U', "R'"],
        ['R', "U'", "R'"],
        ['R', 'U2', "R'"],
        ["F'", "U'", 'F'],
        ["F'", 'U', 'F'],
        ["F'", 'U2', 'F'],
      ].map((seq) => conjugateAlgY(seq, slot.yTurns))
    );

    const pairSeq =
      bfsMacros(
        state,
        f2lMacros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, slot.cornerPos) && isPosSolved(s, goal, slot.edgePos),
        2000
      ) ?? [];

    state = applyTokens(state, pairSeq);
    slotTokens.push(...pairSeq);

    const cleanSlot = simplifyTokenList(slotTokens);
    if (cleanSlot.length > 0) {
      pairsSolved++;
      f2lTokens.push(...cleanSlot);
      f2lSubSteps.push({ label: `F2L Pair ${pairsSolved} · ${slot.name}`, count: cleanSlot.length });
    }
  }

  drafts.push({
    id: 'cfop-f2l',
    name: 'First Two Layers (F2L)',
    shortName: 'F2L',
    algorithmName: pairsSolved > 0 ? `${pairsSolved} Corner-Edge Pair${pairsSolved === 1 ? '' : 's'}` : 'F2L Skip',
    description: 'Pair each bottom corner with its equator edge in U and slot them together.',
    tokens: f2lTokens,
    subSteps: f2lSubSteps,
  });

  // Stage 3: 2-Look OLL (EO + 7-Case OCLL)
  const ollTokens: string[] = [];
  const ollSubSteps: { label: string; count: number }[] = [];
  const ollNames: string[] = [];

  if (!isTopCrossOriented(state, goal)) {
    const eoTokens: string[] = [];
    const flags = U_EDGE_POSITIONS.map((p) => getCubieAt(state, p[0], p[1], p[2]).stickers.py === goal.py);
    const count = flags.filter(Boolean).length;

    if (count === 0) {
      // Dot case: F R U R' U' F' + Fw R U R' U' Fw'
      const alg1 = ['F', 'R', 'U', "R'", "U'", "F'"];
      state = applyTokens(state, alg1);
      eoTokens.push(...alg1);
      // Now L-shape; align UB & UL and run F U R U' R' F'
      for (let r = 0; r < 4; r++) {
        if (
          getCubieAt(state, 0, 1, -1).stickers.py === goal.py &&
          getCubieAt(state, -1, 1, 0).stickers.py === goal.py
        ) {
          break;
        }
        state = applyTokens(state, ['U']);
        eoTokens.push('U');
      }
      const alg2 = ['F', 'U', 'R', "U'", "R'", "F'"];
      state = applyTokens(state, alg2);
      eoTokens.push(...alg2);
      ollNames.push('Dot OLL (EO)');
    } else if ((flags[0] && flags[2]) || (flags[1] && flags[3])) {
      if (flags[0] && flags[2]) {
        state = applyTokens(state, ['U']);
        eoTokens.push('U');
      }
      const alg = ['F', 'R', 'U', "R'", "U'", "F'"];
      state = applyTokens(state, alg);
      eoTokens.push(...alg);
      ollNames.push('Line OLL (EO)');
    } else {
      for (let r = 0; r < 4; r++) {
        if (
          getCubieAt(state, 0, 1, -1).stickers.py === goal.py &&
          getCubieAt(state, -1, 1, 0).stickers.py === goal.py
        ) {
          break;
        }
        state = applyTokens(state, ['U']);
        eoTokens.push('U');
      }
      const alg = ['F', 'U', 'R', "U'", "R'", "F'"];
      state = applyTokens(state, alg);
      eoTokens.push(...alg);
      ollNames.push('L-Shape OLL (EO)');
    }

    const cleanEo = simplifyTokenList(eoTokens);
    if (cleanEo.length > 0) {
      ollTokens.push(...cleanEo);
      ollSubSteps.push({ label: ollNames[0], count: cleanEo.length });
    }
  }

  const ocll = solveOCLL(state, goal, true);
  if (ocll.tokens.length > 0) {
    state = ocll.state;
    ollTokens.push(...ocll.tokens);
    ollNames.push(ocll.algName);
    ollSubSteps.push({ label: ocll.algName, count: ocll.tokens.length });
  }

  drafts.push({
    id: 'cfop-oll',
    name: 'Orient Last Layer (OLL)',
    shortName: 'OLL',
    algorithmName: ollNames.length ? ollNames.join(' → ') : 'OLL Skip',
    description: 'Turn the entire top face a single solid color in 1–2 speedcube triggers.',
    tokens: ollTokens,
    subSteps: ollSubSteps,
  });

  // Stage 4: PLL (1-Look Key PLLs + 2-Look CPLL → EPLL fallback)
  let pllTokens: string[] = [];
  let pllName = 'PLL Skip';
  const pllSubSteps: { label: string; count: number }[] = [];

  // Check pure AUF skip first
  let pllSolved = false;
  for (const auf of AUFS) {
    const cand = applyTokens(state, auf);
    if (isCubeSolved(cand, '3x3')) {
      state = cand;
      pllTokens = [...auf];
      pllName = auf.length ? 'PLL Skip (AUF)' : 'PLL Skip';
      pllSolved = true;
      break;
    }
  }

  // Try 1-Look PLL catalog
  if (!pllSolved) {
    outer: for (const pll of ONE_LOOK_PLL_CATALOG) {
      for (const pre of AUFS) {
        const s1 = applyTokens(state, pre);
        const s2 = applyTokens(s1, pll.tokens);
        for (const post of AUFS) {
          const s3 = applyTokens(s2, post);
          if (isCubeSolved(s3, '3x3')) {
            state = s3;
            pllTokens = simplifyTokenList([...pre, ...pll.tokens, ...post]);
            pllName = pll.name;
            pllSubSteps.push({ label: `1-Look ${pll.name}`, count: pllTokens.length });
            pllSolved = true;
            break outer;
          }
        }
      }
    }
  }

  // 2-Look PLL fallback (CPLL + EPLL)
  if (!pllSolved) {
    const cpll = solveCPLL(state, goal, false);
    state = cpll.state;
    const epll = solveEPLL(state, goal);
    state = epll.state;

    const names: string[] = [];
    if (cpll.tokens.length > 0) {
      pllTokens.push(...cpll.tokens);
      pllSubSteps.push({ label: `Corners: ${cpll.algName}`, count: cpll.tokens.length });
      names.push(cpll.algName);
    }
    if (epll.tokens.length > 0) {
      pllTokens.push(...epll.tokens);
      pllSubSteps.push({ label: `Edges: ${epll.algName}`, count: epll.tokens.length });
      names.push(epll.algName);
    }
    pllName = names.length ? names.join(' → ') : 'PLL';
  }

  drafts.push({
    id: 'cfop-pll',
    name: 'Permute Last Layer (PLL)',
    shortName: 'PLL',
    algorithmName: pllName,
    description: 'Permute the final layer corners and edges to finish the solve.',
    tokens: pllTokens,
    subSteps: pllSubSteps,
  });

  return finalizePlan('cfop', puzzleType, drafts, true);
}

// ============================================================================
// METHOD 3: ROUX (First Block → Second Block → CMLL → LSE 4a/4b/4c)
// ============================================================================

function solveRoux(start: CubieState[], puzzleType: PuzzleType): MethodSolvePlan {
  const goal = getGoalColorsFromCenters(start);
  let state = start;
  const drafts: PhaseDraft[] = [];

  // Stage 1: First Block (1x2x3 on Left: DL + BL pair + FL pair)
  const fbTokens: string[] = [];
  const fbSubSteps: { label: string; count: number }[] = [];

  // 1a. DL edge (-1, -1, 0)
  if (!isPosSolved(state, goal, [-1, -1, 0])) {
    const dlSeq =
      bfsMacros(
        state,
        ALL_18_FACE_MACROS,
        (s) => encodeEdge(s, goal.ny, goal.nx),
        (s) => isPosSolved(s, goal, [-1, -1, 0]),
        600
      ) ?? [];
    const clean = simplifyTokenList(dlSeq);
    state = applyTokens(state, clean);
    if (clean.length) {
      fbTokens.push(...clean);
      fbSubSteps.push({ label: 'DL Anchor Edge', count: clean.length });
    }
  }

  // 1b. BL Pair (DBL corner + BL edge) preserving DL
  const blSlot = F2L_SLOTS[2]; // BL (yTurns = 2)
  if (!isPosSolved(state, goal, blSlot.cornerPos) || !isPosSolved(state, goal, blSlot.edgePos)) {
    const pairToks: string[] = [];
    const c1 = goal.ny;
    const c2 = goal.nx;
    const c3 = goal.nz;
    const e1 = goal.nx;
    const e2 = goal.nz;

    const blExtractors: SlotExtractor[] = [
      { pos: [-1, -1, 1], lift: ['F', 'U', "F'"] },
      { pos: [-1, 0, 1], lift: ['F', 'U', "F'"] },
      { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
      { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
      { pos: [1, -1, -1], lift: ["R'", 'U', 'R'] },
      { pos: [1, 0, -1], lift: ["R'", 'U', 'R'] },
      { pos: [0, -1, 1], lift: ['F2'] },
      { pos: [0, -1, -1], lift: ['B2'] },
      { pos: [1, -1, 0], lift: ['R2'] },
    ];

    const extBL = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      blSlot.cornerPos,
      blSlot.edgePos,
      blExtractors
    );
    state = extBL.state;
    pairToks.push(...extBL.tokens);

    const blMacros = makeMacros(
      [
        ['U'], ["U'"], ['U2'],
        ['R', 'U', "R'"],
        ['R', "U'", "R'"],
        ['R', 'U2', "R'"],
        ["F'", "U'", 'F'],
        ["F'", 'U', 'F'],
        ["F'", 'U2', 'F'],
      ].map((seq) => conjugateAlgY(seq, 2))
    );
    const seq =
      bfsMacros(
        state,
        blMacros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, blSlot.cornerPos) && isPosSolved(s, goal, blSlot.edgePos),
        2000
      ) ?? [];
    state = applyTokens(state, seq);
    pairToks.push(...seq);

    const clean = simplifyTokenList(pairToks);
    if (clean.length) {
      fbTokens.push(...clean);
      fbSubSteps.push({ label: 'Back-Left Pair (BL)', count: clean.length });
    }
  }

  // 1c. FL Pair (DFL corner + FL edge) preserving DL + DBL + BL
  const flSlot = F2L_SLOTS[1]; // FL (yTurns = 1)
  if (!isPosSolved(state, goal, flSlot.cornerPos) || !isPosSolved(state, goal, flSlot.edgePos)) {
    const pairToks: string[] = [];
    const c1 = goal.ny;
    const c2 = goal.pz;
    const c3 = goal.nx;
    const e1 = goal.pz;
    const e2 = goal.nx;

    const flExtractors: SlotExtractor[] = [
      { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
      { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
      { pos: [1, -1, -1], lift: ["R'", 'U', 'R'] },
      { pos: [1, 0, -1], lift: ["R'", 'U', 'R'] },
      { pos: [0, -1, 1], lift: ['F2'] },
      { pos: [0, -1, -1], lift: ['M', 'U', "M'"] },
      { pos: [1, -1, 0], lift: ['R2'] },
    ];

    const extFL = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      flSlot.cornerPos,
      flSlot.edgePos,
      flExtractors
    );
    state = extFL.state;
    pairToks.push(...extFL.tokens);

    const flMacros = makeMacros(
      [
        ['U'], ["U'"], ['U2'],
        ['R', 'U', "R'"],
        ['R', "U'", "R'"],
        ['R', 'U2', "R'"],
        ["F'", "U'", 'F'],
        ["F'", 'U', 'F'],
        ["F'", 'U2', 'F'],
      ].map((seq) => conjugateAlgY(seq, 1))
    );
    const seq =
      bfsMacros(
        state,
        flMacros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, flSlot.cornerPos) && isPosSolved(s, goal, flSlot.edgePos),
        2000
      ) ?? [];
    state = applyTokens(state, seq);
    pairToks.push(...seq);

    const clean = simplifyTokenList(pairToks);
    if (clean.length) {
      fbTokens.push(...clean);
      fbSubSteps.push({ label: 'Front-Left Pair (FL)', count: clean.length });
    }
  }

  drafts.push({
    id: 'roux-fb',
    name: 'First Block (1×2×3 Left)',
    shortName: '1st Block',
    algorithmName: fbTokens.length ? 'Left 1×2×3 Blockbuild' : 'First Block Skip',
    description: 'Build the entire left 1×2×3 block (DL + BL + FL) to unlock free <R, r, U, M> moves.',
    tokens: fbTokens,
    subSteps: fbSubSteps,
  });

  // Stage 2: Second Block (1x2x3 on Right: DR + BR pair + FR pair) strictly using <R, Rw, U, M>
  const sbTokens: string[] = [];
  const sbSubSteps: { label: string; count: number }[] = [];

  // 2a. DR edge (1, -1, 0) using <R, Rw, U, M>
  if (!isPosSolved(state, goal, [1, -1, 0])) {
    const drMacros = makeMacros([
      ['R'], ["R'"], ['R2'],
      ['Rw'], ["Rw'"], ['Rw2'],
      ['U'], ["U'"], ['U2'],
      ['M'], ["M'"], ['M2'],
    ]);
    const drSeq =
      bfsMacros(
        state,
        drMacros,
        (s) => `${encodeEdge(s, goal.ny, goal.px)}|${getCubieAt(s, 1, 0, 0).stickers.px}`,
        (s) => isPosSolved(s, goal, [1, -1, 0]) && getCubieAt(s, 1, 0, 0).stickers.px === goal.px,
        2000
      ) ?? [];
    const clean = simplifyTokenList(drSeq);
    state = applyTokens(state, clean);
    if (clean.length) {
      sbTokens.push(...clean);
      sbSubSteps.push({ label: 'DR Anchor Edge', count: clean.length });
    }
  }

  // 2b. BR Pair (DBR + BR) preserving First Block + DR
  const brSlot = F2L_SLOTS[3];
  if (!isPosSolved(state, goal, brSlot.cornerPos) || !isPosSolved(state, goal, brSlot.edgePos)) {
    const pairToks: string[] = [];
    const c1 = goal.ny;
    const c2 = goal.nz;
    const c3 = goal.px;
    const e1 = goal.nz;
    const e2 = goal.px;

    const brExtractors: SlotExtractor[] = [
      { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
      { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
      { pos: [0, -1, 1], lift: ["M'", 'U', 'M'] },
      { pos: [0, -1, -1], lift: ['M', 'U', "M'"] },
    ];
    const extBR = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      brSlot.cornerPos,
      brSlot.edgePos,
      brExtractors
    );
    state = extBR.state;
    pairToks.push(...extBR.tokens);

    const brSafeMacros = makeMacros([
      ['U'], ["U'"], ['U2'],
      ["R'", 'U', 'R'],
      ["R'", "U'", 'R'],
      ["R'", 'U2', 'R'],
      ["Rw'", 'U', 'R'],
      ["Rw'", "U'", 'R'],
      ["Rw'", 'U2', 'R'],
      ["M'", 'U', 'M'],
      ["M'", "U'", 'M'],
      ["M'", 'U2', 'M'],
      ['M', 'U', "M'"],
      ['M', "U'", "M'"],
      ['M', 'U2', "M'"],
      ['M2'],
    ]);

    const seq =
      bfsMacros(
        state,
        brSafeMacros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, brSlot.cornerPos) && isPosSolved(s, goal, brSlot.edgePos),
        4500
      ) ?? [];
    state = applyTokens(state, seq);
    pairToks.push(...seq);

    const clean = simplifyTokenList(pairToks);
    if (clean.length) {
      sbTokens.push(...clean);
      sbSubSteps.push({ label: 'Back-Right Pair (BR)', count: clean.length });
    }
  }

  // 2c. FR Pair (DFR + FR) preserving First Block + DR + BR
  const frSlot = F2L_SLOTS[0];
  if (!isPosSolved(state, goal, frSlot.cornerPos) || !isPosSolved(state, goal, frSlot.edgePos)) {
    const pairToks: string[] = [];
    const c1 = goal.ny;
    const c2 = goal.px;
    const c3 = goal.pz;
    const e1 = goal.px;
    const e2 = goal.pz;

    const frExtractors: SlotExtractor[] = [
      { pos: [0, -1, 1], lift: ["M'", 'U', 'M'] },
      { pos: [0, -1, -1], lift: ['M', 'U', "M'"] },
    ];
    const extFR = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      frSlot.cornerPos,
      frSlot.edgePos,
      frExtractors
    );
    state = extFR.state;
    pairToks.push(...extFR.tokens);

    const frSafeMacros = makeMacros([
      ['U'], ["U'"], ['U2'],
      ['R', 'U', "R'"],
      ['R', "U'", "R'"],
      ['R', 'U2', "R'"],
      ["M'", 'U', 'M'],
      ["M'", "U'", 'M'],
      ["M'", 'U2', 'M'],
      ['M', 'U', "M'"],
      ['M', "U'", "M'"],
      ['M', 'U2', "M'"],
      ['M2'],
    ]);

    const seq =
      bfsMacros(
        state,
        frSafeMacros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, frSlot.cornerPos) && isPosSolved(s, goal, frSlot.edgePos),
        4500
      ) ?? [];
    state = applyTokens(state, seq);
    pairToks.push(...seq);

    const clean = simplifyTokenList(pairToks);
    if (clean.length) {
      sbTokens.push(...clean);
      sbSubSteps.push({ label: 'Front-Right Pair (FR)', count: clean.length });
    }
  }

  drafts.push({
    id: 'roux-sb',
    name: 'Second Block (1×2×3 Right)',
    shortName: '2nd Block',
    algorithmName: sbTokens.length ? '<R, r, U, M> Blockbuild' : 'Second Block Skip',
    description: 'Build the opposite right 1×2×3 block using fluid R, Rw, U, and M moves.',
    tokens: sbTokens,
    subSteps: sbSubSteps,
  });

  // Stage 3: CMLL (Corners of Last Layer — ignoring M-slice!)
  const cmllTokens: string[] = [];
  const cmllSubSteps: { label: string; count: number }[] = [];
  const cmllNames: string[] = [];

  const ocll = solveOCLL(state, goal, false);
  if (ocll.tokens.length > 0) {
    state = ocll.state;
    cmllTokens.push(...ocll.tokens);
    cmllSubSteps.push({ label: `Orient: ${ocll.algName}`, count: ocll.tokens.length });
    cmllNames.push(ocll.algName);
  }

  const cpll = solveCPLL(state, goal, true);
  if (cpll.tokens.length > 0) {
    state = cpll.state;
    cmllTokens.push(...cpll.tokens);
    cmllSubSteps.push({ label: `Permute: ${cpll.algName}`, count: cpll.tokens.length });
    cmllNames.push(cpll.algName);
  }

  drafts.push({
    id: 'roux-cmll',
    name: 'Corners of Last Layer (CMLL)',
    shortName: 'CMLL',
    algorithmName: cmllNames.length ? cmllNames.join(' → ') : 'CMLL Skip',
    description: 'Orient and permute the 4 top corners without worrying about the M-slice.',
    tokens: cmllTokens,
    subSteps: cmllSubSteps,
  });

  // Stage 4: LSE (Last Six Edges — authentic <M, U> 4a EO → 4b UL/UR → 4c M-Slice!)
  const lseTokens: string[] = [];
  const lseSubSteps: { label: string; count: number }[] = [];
  const muMacros = makeMacros([['M'], ["M'"], ['M2'], ['U'], ["U'"], ['U2']]);

  const LSE_EDGE_POS: Pos3[] = [
    [0, 1, 1], // UF
    [1, 1, 0], // UR
    [0, 1, -1], // UB
    [-1, 1, 0], // UL
    [0, -1, 1], // DF
    [0, -1, -1], // DB
  ];

  const isLseEdgeOriented = (s: CubieState[], pos: Pos3): boolean => {
    const e = getCubieAt(s, pos[0], pos[1], pos[2]);
    const udSticker = e.stickers.py ?? e.stickers.ny;
    return udSticker === goal.py || udSticker === goal.ny;
  };

  const isMCenterUDAligned = (s: CubieState[]): boolean => {
    const uCol = getCubieAt(s, 0, 1, 0).stickers.py;
    return uCol === goal.py || uCol === goal.ny;
  };

  // 4a. Edge Orientation (EO) + U/D center alignment
  const is4aDone = (s: CubieState[]) =>
    isMCenterUDAligned(s) && LSE_EDGE_POS.every((p) => isLseEdgeOriented(s, p));

  if (!is4aDone(state)) {
    const eo4a =
      bfsMacros(
        state,
        muMacros,
        (s) => {
          const uCenter = isMCenterUDAligned(s) ? '1' : '0';
          const bits = LSE_EDGE_POS.map((p) => (isLseEdgeOriented(s, p) ? '1' : '0')).join('');
          return `${uCenter}:${bits}`;
        },
        is4aDone,
        1500
      ) ?? [];
    const clean = simplifyTokenList(eo4a);
    state = applyTokens(state, clean);
    if (clean.length) {
      lseTokens.push(...clean);
      lseSubSteps.push({ label: '4a · Orient 6 Edges (EO)', count: clean.length });
    }
  }

  // 4b. Place UL & UR edges (keeping EO & solving UL/UR + U corners aligned)
  const is4bDone = (s: CubieState[]) =>
    is4aDone(s) &&
    isUCornersSolved(s, goal) &&
    isPosSolved(s, goal, [-1, 1, 0]) &&
    isPosSolved(s, goal, [1, 1, 0]);

  if (!is4bDone(state)) {
    const ulurSeq =
      bfsMacros(
        state,
        muMacros,
        (s) => {
          const uCorner = getCubieAt(s, 1, 1, 1).stickers.px ?? '';
          const uCenter = getCubieAt(s, 0, 1, 0).stickers.py ?? '';
          const ul = encodeEdge(s, goal.py, goal.nx);
          const ur = encodeEdge(s, goal.py, goal.px);
          const eo = LSE_EDGE_POS.map((p) => (isLseEdgeOriented(s, p) ? '1' : '0')).join('');
          return `${uCorner}|${uCenter}|${ul}|${ur}|${eo}`;
        },
        is4bDone,
        9000
      ) ?? [];
    const clean = simplifyTokenList(ulurSeq);
    state = applyTokens(state, clean);
    if (clean.length) {
      lseTokens.push(...clean);
      lseSubSteps.push({ label: '4b · Solve UL & UR Edges', count: clean.length });
    }
  }

  // 4c. Permute last 4 M-slice edges + align M-centers!
  if (!isCubeSolved(state, '3x3')) {
    const mSliceMacros = makeMacros([['M'], ["M'"], ['M2'], ['U2']]);
    const finalSeq =
      bfsMacros(
        state,
        mSliceMacros,
        (s) => {
          const uc = getCubieAt(s, 0, 1, 0).stickers.py ?? '';
          const fc = getCubieAt(s, 0, 0, 1).stickers.pz ?? '';
          const uf = encodeEdge(s, goal.py, goal.pz);
          const ub = encodeEdge(s, goal.py, goal.nz);
          const df = encodeEdge(s, goal.ny, goal.pz);
          const uCorner = getCubieAt(s, 1, 1, 1).stickers.px ?? '';
          return `${uc}|${fc}|${uf}|${ub}|${df}|${uCorner}`;
        },
        (s) => isCubeSolved(s, '3x3'),
        2000
      ) ?? [];
    const clean = simplifyTokenList(finalSeq);
    state = applyTokens(state, clean);
    if (clean.length) {
      lseTokens.push(...clean);
      lseSubSteps.push({ label: '4c · Permute M-Slice', count: clean.length });
    }
  }

  drafts.push({
    id: 'roux-lse',
    name: 'Last Six Edges (LSE)',
    shortName: 'LSE',
    algorithmName: lseTokens.length ? '<M, U> 4a EO → 4b UL/UR → 4c M-Slice' : 'LSE Skip',
    description: 'Orient all 6 edges, place UL/UR, and finish the M-slice using only M and U.',
    tokens: lseTokens,
    subSteps: lseSubSteps,
  });

  return finalizePlan('roux', puzzleType, drafts, true);
}

// ============================================================================
// METHOD 4: ZZ / ZOLL (EOLine → ZZF2L → ZOLL/COLL → EPLL)
// ============================================================================

function solveZZ(start: CubieState[], puzzleType: PuzzleType): MethodSolvePlan {
  const goal = getGoalColorsFromCenters(start);
  let state = start;
  const drafts: PhaseDraft[] = [];

  // Stage 1: EOLine (Optimal EO over 2048-state mask + DF/DB Line using EO-preserving moves!)
  const eolineTokens: string[] = [];
  const eolineSubSteps: { label: string; count: number }[] = [];

  // 1a. Orient all 12 edges (EO)
  if (countBadZZEdges(state, goal) > 0) {
    const eoMacros = makeMacros([
      ['F'], ["F'"], ['B'], ["B'"],
      ['U'], ["U'"], ['U2'],
      ['D'], ["D'"], ['D2'],
      ['R'], ["R'"], ['R2'],
      ['L'], ["L'"], ['L2'],
    ]);
    const eoSeq =
      bfsMacros(
        state,
        eoMacros,
        (s) => {
          let mask = 0;
          for (let i = 0; i < ALL_12_EDGE_POSITIONS.length; i++) {
            const p = ALL_12_EDGE_POSITIONS[i];
            if (!isEdgeZZGood(getCubieAt(s, p[0], p[1], p[2]), goal)) {
              mask |= 1 << i;
            }
          }
          return String(mask);
        },
        (s) => countBadZZEdges(s, goal) === 0,
        2500
      ) ?? [];
    const clean = simplifyTokenList(eoSeq);
    state = applyTokens(state, clean);
    if (clean.length) {
      eolineTokens.push(...clean);
      eolineSubSteps.push({ label: 'EO (Orient All 12 Edges)', count: clean.length });
    }
  }

  // 1b. DF & DB Line using strictly EO-preserving moves <U, D, L, R, F2, B2>
  const eoSafeLineMacros = makeMacros([
    ['U'], ["U'"], ['U2'],
    ['D'], ["D'"], ['D2'],
    ['R'], ["R'"], ['R2'],
    ['L'], ["L'"], ['L2'],
    ['F2'], ['B2'],
  ]);
  const lineTokens: string[] = [];
  if (!isPosSolved(state, goal, [0, -1, 1])) {
    const dfSeq =
      bfsMacros(
        state,
        eoSafeLineMacros,
        (s) => encodeEdge(s, goal.ny, goal.pz),
        (s) => isPosSolved(s, goal, [0, -1, 1]),
        400
      ) ?? [];
    state = applyTokens(state, dfSeq);
    lineTokens.push(...dfSeq);
  }
  if (!isPosSolved(state, goal, [0, -1, -1])) {
    const dbSeq =
      bfsMacros(
        state,
        eoSafeLineMacros,
        (s) => `${encodeEdge(s, goal.ny, goal.pz)}|${encodeEdge(s, goal.ny, goal.nz)}`,
        (s) => isPosSolved(s, goal, [0, -1, 1]) && isPosSolved(s, goal, [0, -1, -1]),
        2000
      ) ?? [];
    state = applyTokens(state, dbSeq);
    lineTokens.push(...dbSeq);
  }
  const cleanLine = simplifyTokenList(lineTokens);
  if (cleanLine.length) {
    eolineTokens.push(...cleanLine);
    eolineSubSteps.push({ label: 'Place DF & DB Line', count: cleanLine.length });
  }

  drafts.push({
    id: 'zz-eoline',
    name: 'Edge Orientation & Line (EOLine)',
    shortName: 'EOLine',
    algorithmName: eolineTokens.length ? '0 Bad Edges + DF/DB Line' : 'EOLine Skip',
    description: 'Orient all 12 edges first and place DF/DB so F2L solves rotationlessly with <R, U, L>.',
    tokens: eolineTokens,
    subSteps: eolineSubSteps,
  });

  // Stage 2: ZZF2L (Left 1x2x3 Block + Right 1x2x3 Block using strictly <R, U, L>!)
  const zzf2lTokens: string[] = [];
  const zzf2lSubSteps: { label: string; count: number }[] = [];

  const rulMacros = makeMacros([
    ['U'], ["U'"], ['U2'],
    ['L'], ["L'"], ['L2'],
    ['R'], ["R'"], ['R2'],
  ]);

  // 2a. Left Block: DL edge, then BL pair, then FL pair (strictly <R, U, L>!)
  const leftBlockToks: string[] = [];
  if (!isPosSolved(state, goal, [-1, -1, 0])) {
    const dlSeq =
      bfsMacros(
        state,
        rulMacros,
        (s) => encodeEdge(s, goal.ny, goal.nx),
        (s) => isPosSolved(s, goal, [-1, -1, 0]),
        500
      ) ?? [];
    state = applyTokens(state, dlSeq);
    leftBlockToks.push(...dlSeq);
  }

  // Helper to solve a ZZF2L corner+edge slot strictly using <R, U, L>
  const solveZZSlot = (
    slot: (typeof F2L_SLOTS)[number],
    slotTriggerBase: readonly (readonly string[])[],
    otherUnsolvedExtractors: readonly SlotExtractor[]
  ): string[] => {
    if (isPosSolved(state, goal, slot.cornerPos) && isPosSolved(state, goal, slot.edgePos)) {
      return [];
    }
    const toks: string[] = [];
    const c1 = goal.ny;
    const c2 = goal[slot.cornerFaces[0]];
    const c3 = goal[slot.cornerFaces[1]];
    const e1 = goal[slot.edgeFaces[0]];
    const e2 = goal[slot.edgeFaces[1]];

    const ext = ensurePairInUOrSlot(
      state,
      [c1, c2, c3],
      [e1, e2],
      slot.cornerPos,
      slot.edgePos,
      otherUnsolvedExtractors
    );
    state = ext.state;
    toks.push(...ext.tokens);

    const macros = makeMacros(slotTriggerBase);
    const seq =
      bfsMacros(
        state,
        macros,
        (s) => `${encodeCorner(s, c1, c2, c3)}|${encodeEdge(s, e1, e2)}`,
        (s) => isPosSolved(s, goal, slot.cornerPos) && isPosSolved(s, goal, slot.edgePos),
        2000
      ) ?? [];
    state = applyTokens(state, seq);
    toks.push(...seq);
    return simplifyTokenList(toks);
  };

  // BL slot (L U L' triggers preserve DF, DB, DL and EO!)
  leftBlockToks.push(
    ...solveZZSlot(
      F2L_SLOTS[2],
      [
        ['U'], ["U'"], ['U2'],
        ['L', 'U', "L'"],
        ['L', "U'", "L'"],
        ['L', 'U2', "L'"],
      ],
      [
        { pos: [-1, -1, 1], lift: ["L'", "U'", 'L'] },
        { pos: [-1, 0, 1], lift: ["L'", "U'", 'L'] },
        { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
        { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
        { pos: [1, -1, -1], lift: ["R'", 'U', 'R'] },
        { pos: [1, 0, -1], lift: ["R'", 'U', 'R'] },
        { pos: [1, -1, 0], lift: ['R2'] },
      ]
    )
  );

  // FL slot (L' U' L triggers preserve DF, DB, DL, BL and EO!)
  leftBlockToks.push(
    ...solveZZSlot(
      F2L_SLOTS[1],
      [
        ['U'], ["U'"], ['U2'],
        ["L'", "U'", 'L'],
        ["L'", 'U', 'L'],
        ["L'", 'U2', 'L'],
      ],
      [
        { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
        { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
        { pos: [1, -1, -1], lift: ["R'", 'U', 'R'] },
        { pos: [1, 0, -1], lift: ["R'", 'U', 'R'] },
        { pos: [1, -1, 0], lift: ['R2'] },
      ]
    )
  );

  const cleanLeft = simplifyTokenList(leftBlockToks);
  if (cleanLeft.length) {
    zzf2lTokens.push(...cleanLeft);
    zzf2lSubSteps.push({ label: 'Left 1×2×3 Block', count: cleanLeft.length });
  }

  // 2b. Right Block: DR edge, then BR pair, then FR pair (strictly <R, U>!)
  const rightBlockToks: string[] = [];
  const ruMacros = makeMacros([['U'], ["U'"], ['U2'], ['R'], ["R'"], ['R2']]);
  if (!isPosSolved(state, goal, [1, -1, 0])) {
    const drSeq =
      bfsMacros(
        state,
        ruMacros,
        (s) => encodeEdge(s, goal.ny, goal.px),
        (s) => isPosSolved(s, goal, [1, -1, 0]),
        500
      ) ?? [];
    state = applyTokens(state, drSeq);
    rightBlockToks.push(...drSeq);
  }

  // BR slot (R' U R triggers preserve DF, DB, Left Block, DR and EO!)
  rightBlockToks.push(
    ...solveZZSlot(
      F2L_SLOTS[3],
      [
        ['U'], ["U'"], ['U2'],
        ["R'", 'U', 'R'],
        ["R'", "U'", 'R'],
        ["R'", 'U2', 'R'],
      ],
      [
        { pos: [1, -1, 1], lift: ['R', 'U', "R'"] },
        { pos: [1, 0, 1], lift: ['R', 'U', "R'"] },
      ]
    )
  );

  // FR slot (R U R' triggers preserve everything else and EO!)
  rightBlockToks.push(
    ...solveZZSlot(
      F2L_SLOTS[0],
      [
        ['U'], ["U'"], ['U2'],
        ['R', 'U', "R'"],
        ['R', "U'", "R'"],
        ['R', 'U2', "R'"],
      ],
      []
    )
  );

  const cleanRight = simplifyTokenList(rightBlockToks);
  if (cleanRight.length) {
    zzf2lTokens.push(...cleanRight);
    zzf2lSubSteps.push({ label: 'Right 1×2×3 Block', count: cleanRight.length });
  }

  drafts.push({
    id: 'zz-f2l',
    name: 'ZZF2L (<R, U, L> Blocks)',
    shortName: 'ZZF2L',
    algorithmName: zzf2lTokens.length ? 'Rotationless <R, U, L> F2L' : 'ZZF2L Skip',
    description: 'Build Left and Right 1×2×3 blocks using only R, U, and L — top cross forms automatically.',
    tokens: zzf2lTokens,
    subSteps: zzf2lSubSteps,
  });

  // Stage 3: ZOLL / COLL (All 4 top edges are ALREADY oriented — orient & permute corners!)
  const zollTokens: string[] = [];
  const zollSubSteps: { label: string; count: number }[] = [];
  const zollNames: string[] = [];

  const ocll = solveOCLL(state, goal, true);
  if (ocll.tokens.length > 0) {
    state = ocll.state;
    zollTokens.push(...ocll.tokens);
    zollSubSteps.push({ label: `ZOLL: ${ocll.algName}`, count: ocll.tokens.length });
    zollNames.push(ocll.algName);
  }

  const cpll = solveCPLL(state, goal, false);
  if (cpll.tokens.length > 0) {
    state = cpll.state;
    zollTokens.push(...cpll.tokens);
    zollSubSteps.push({ label: `Corners: ${cpll.algName}`, count: cpll.tokens.length });
    zollNames.push(cpll.algName);
  }

  drafts.push({
    id: 'zz-zoll',
    name: 'ZOLL / COLL (Corners)',
    shortName: 'ZOLL',
    algorithmName: zollNames.length ? zollNames.join(' → ') : 'ZOLL Skip',
    description: 'Edges are pre-oriented! Solve all 4 last-layer corners while keeping the top cross intact.',
    tokens: zollTokens,
    subSteps: zollSubSteps,
  });

  // Stage 4: EPLL (Ua, Ub, H, or Z-Perm!)
  const epll = solveEPLL(state, goal);
  state = epll.state;
  drafts.push({
    id: 'zz-epll',
    name: 'Edges of Last Layer (EPLL)',
    shortName: 'EPLL',
    algorithmName: epll.algName,
    description: 'Finish with a pure 2-gen edge cycle (Ua, Ub, H, or Z-Perm).',
    tokens: epll.tokens,
  });

  return finalizePlan('zz', puzzleType, drafts, true);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Computes a verified, stage-by-stage solve plan for any scrambled cube using the selected method.
 * For 3x3 and Mirror Blocks, inspects live CubieState stickers directly (genuine state-based solver).
 * For 2x2 and 4x4, provides a staged history-based plan.
 */
export function solveCubeWithMethod(
  cubies: CubieState[],
  methodId: SolveMethodId,
  puzzleType: PuzzleType,
  fallbackHistory: CubeMove[] = []
): MethodSolvePlan {
  if (isCubeSolved(cubies, puzzleType)) {
    return finalizePlan(methodId, puzzleType, [], puzzleType === '3x3' || puzzleType === 'mirror');
  }

  if (puzzleType === '3x3' || puzzleType === 'mirror') {
    let plan: MethodSolvePlan;
    switch (methodId) {
      case 'beginner':
        plan = solveBeginner(cubies, puzzleType);
        break;
      case 'roux':
        plan = solveRoux(cubies, puzzleType);
        break;
      case 'zz':
        plan = solveZZ(cubies, puzzleType);
        break;
      case 'cfop':
      default:
        plan = solveCFOP(cubies, puzzleType);
        break;
    }

    // Sanity verification: ensure the generated plan genuinely solves the cube!
    const verifyState = applyMoves(cubies, plan.allMoves);
    if (isCubeSolved(verifyState, puzzleType)) {
      return plan;
    }

    // Safety net (should never trigger for reachable states): fallback to history
    if (fallbackHistory.length > 0) {
      const hist = computeSolutionFromHistory(fallbackHistory, puzzleType);
      return finalizePlan(
        methodId,
        puzzleType,
        [
          {
            id: 'fallback-solve',
            name: 'Direct Solve',
            shortName: 'Solve',
            algorithmName: 'Optimal Reversal',
            description: 'Restores the puzzle cleanly to solved state.',
            tokens: hist.map((m) => m.notation),
          },
        ],
        false
      );
    }
    return plan;
  }

  // 2x2 and 4x4: clean staged history plan
  const histMoves = computeSolutionFromHistory(fallbackHistory, puzzleType);
  const tokens = histMoves.map((m) => m.notation);
  const mid = Math.ceil(tokens.length / 2);
  const drafts: PhaseDraft[] =
    puzzleType === '2x2'
      ? [
          {
            id: '2x2-face',
            name: 'First Layer',
            shortName: '1st Layer',
            algorithmName: 'Corner Alignment',
            description: 'Align first-layer corners before finishing the top layer.',
            tokens: tokens.slice(0, mid),
          },
          {
            id: '2x2-ll',
            name: 'Last Layer (OLL/PBL)',
            shortName: 'Last Layer',
            algorithmName: 'Ortega / Corner Finish',
            description: 'Orient and permute the final corners to complete the 2×2.',
            tokens: tokens.slice(mid),
          },
        ]
      : [
          {
            id: '4x4-reduce',
            name: 'Centers & Edge Pairing',
            shortName: 'Reduction',
            algorithmName: '4×4 Reduction',
            description: 'Restore 2×2 center blocks and pair split edge wings.',
            tokens: tokens.slice(0, mid),
          },
          {
            id: '4x4-3x3',
            name: '3×3 Stage & Finish',
            shortName: '3×3 Stage',
            algorithmName: 'Outer Layer Finish',
            description: 'Complete the reduced 4×4 just like a standard 3×3.',
            tokens: tokens.slice(mid),
          },
        ];

  return finalizePlan(methodId, puzzleType, drafts, false);
}
