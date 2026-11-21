import { parseNotation } from './cubeLogic.ts';
import type { CubeMove, PuzzleType } from './types';

export type SequenceStepStatus = 'pending' | 'correct' | 'wrong';

export interface SequenceTrackerState {
  tokens: string[];
  currentIndex: number;
  statuses: SequenceStepStatus[];
  halfTurnDirection: 1 | -1 | null;
  lastWrongNotation: string | null;
  expectedOnWrong: string | null;
}

export function createSequenceTracker(tokens: string[]): SequenceTrackerState {
  const cleanTokens = tokens.map((t) => t.trim()).filter(Boolean);
  return {
    tokens: cleanTokens,
    currentIndex: 0,
    statuses: cleanTokens.map(() => 'pending'),
    halfTurnDirection: null,
    lastWrongNotation: null,
    expectedOnWrong: null,
  };
}

/**
 * Normalizes a user-entered notation sequence string (e.g. "u d l f r" or "R U R' U' M E S x y z")
 * into valid WCA tokens for the active puzzle.
 */
export function parseNotationSequenceInput(
  rawInput: string,
  puzzleType: PuzzleType
): { tokens: string[]; invalidTokens: string[] } {
  const rawTokens = rawInput
    .replace(/[’`]/g, "'")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  const invalidTokens: string[] = [];

  for (const raw of rawTokens) {
    let normalized = raw;
    const first = raw[0];
    if (first && 'udlrfbmes'.includes(first)) {
      normalized = first.toUpperCase() + raw.slice(1);
    } else if (first && 'XYZ'.includes(first)) {
      normalized = first.toLowerCase() + raw.slice(1);
    }

    const parsed = parseNotation(normalized, puzzleType);
    if (parsed) {
      tokens.push(parsed.notation);
    } else {
      invalidTokens.push(raw);
    }
  }

  return { tokens, invalidTokens };
}

function sameAxisAndLayers(a: CubeMove, b: CubeMove): boolean {
  if (a.axis !== b.axis || a.layers.length !== b.layers.length) return false;
  const sa = [...a.layers].sort((x, y) => x - y);
  const sb = [...b.layers].sort((x, y) => x - y);
  return sa.every((v, i) => Math.abs(v - sb[i]) < 0.01);
}

/**
 * Evaluates a user-performed CubeMove against the current expected step in a sequence tracker.
 * - Exact match marks the box 'correct' (green) and advances currentIndex immediately.
 * - Double turns (e.g. U2) accept either a single U2 move or two consecutive 90° turns in the same direction.
 * - Wrong moves mark the current expected box 'wrong' (red) and record lastWrongNotation without advancing.
 */
export function evaluateSequenceMove(
  state: SequenceTrackerState,
  performedMove: CubeMove,
  puzzleType: PuzzleType
): SequenceTrackerState {
  if (state.tokens.length === 0 || state.currentIndex >= state.tokens.length) {
    return state;
  }

  const expectedToken = state.tokens[state.currentIndex];
  const expected = parseNotation(expectedToken, puzzleType);
  if (!expected) {
    return state;
  }

  const sameSlice = sameAxisAndLayers(expected, performedMove);

  if (expected.turns === 1) {
    const isExactMatch =
      sameSlice && performedMove.turns === 1 && performedMove.direction === expected.direction;

    if (isExactMatch) {
      const nextStatuses = [...state.statuses];
      nextStatuses[state.currentIndex] = 'correct';
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        statuses: nextStatuses,
        halfTurnDirection: null,
        lastWrongNotation: null,
        expectedOnWrong: null,
      };
    }

    const nextStatuses = [...state.statuses];
    nextStatuses[state.currentIndex] = 'wrong';
    return {
      ...state,
      statuses: nextStatuses,
      halfTurnDirection: null,
      lastWrongNotation: performedMove.notation,
      expectedOnWrong: expectedToken,
    };
  }

  // Expected move is a 180-degree double turn (e.g. U2, R2, M2, x2)
  if (sameSlice && performedMove.turns === 2 && state.halfTurnDirection === null) {
    const nextStatuses = [...state.statuses];
    nextStatuses[state.currentIndex] = 'correct';
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      statuses: nextStatuses,
      halfTurnDirection: null,
      lastWrongNotation: null,
      expectedOnWrong: null,
    };
  }

  if (sameSlice && performedMove.turns === 1) {
    if (state.halfTurnDirection === null) {
      // Completed first 90-degree half of the double turn
      const nextStatuses = [...state.statuses];
      nextStatuses[state.currentIndex] = 'pending';
      return {
        ...state,
        statuses: nextStatuses,
        halfTurnDirection: performedMove.direction,
        lastWrongNotation: null,
        expectedOnWrong: null,
      };
    }

    if (state.halfTurnDirection === performedMove.direction) {
      // Completed second 90-degree half -> full 180° match!
      const nextStatuses = [...state.statuses];
      nextStatuses[state.currentIndex] = 'correct';
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        statuses: nextStatuses,
        halfTurnDirection: null,
        lastWrongNotation: null,
        expectedOnWrong: null,
      };
    }

    // Opposite 90-degree turn cancels back to 0° cleanly without flagging an error
    const nextStatuses = [...state.statuses];
    nextStatuses[state.currentIndex] = 'pending';
    return {
      ...state,
      statuses: nextStatuses,
      halfTurnDirection: null,
      lastWrongNotation: null,
      expectedOnWrong: null,
    };
  }

  const nextStatuses = [...state.statuses];
  nextStatuses[state.currentIndex] = 'wrong';
  return {
    ...state,
    statuses: nextStatuses,
    lastWrongNotation: performedMove.notation,
    expectedOnWrong: expectedToken,
  };
}

/**
 * Clears a 'wrong' marker on the current step (e.g., when user clicks Undo after a wrong move).
 */
export function clearSequenceWrongState(state: SequenceTrackerState): SequenceTrackerState {
  if (state.currentIndex >= state.tokens.length) return state;
  if (state.statuses[state.currentIndex] !== 'wrong' && !state.lastWrongNotation) return state;
  const nextStatuses = [...state.statuses];
  nextStatuses[state.currentIndex] = 'pending';
  return {
    ...state,
    statuses: nextStatuses,
    lastWrongNotation: null,
    expectedOnWrong: null,
  };
}

/**
 * Advances one step programmatically (used by the Learn tab Step button).
 */
export function advanceSequenceStep(state: SequenceTrackerState): SequenceTrackerState {
  if (state.currentIndex >= state.tokens.length) return state;
  const nextStatuses = [...state.statuses];
  nextStatuses[state.currentIndex] = 'correct';
  return {
    ...state,
    currentIndex: state.currentIndex + 1,
    statuses: nextStatuses,
    halfTurnDirection: null,
    lastWrongNotation: null,
    expectedOnWrong: null,
  };
}

/**
 * Marks all steps in the sequence complete (used by Play Demo).
 */
export function completeSequenceAll(state: SequenceTrackerState): SequenceTrackerState {
  return {
    ...state,
    currentIndex: state.tokens.length,
    statuses: state.tokens.map(() => 'correct'),
    halfTurnDirection: null,
    lastWrongNotation: null,
    expectedOnWrong: null,
  };
}

export function getNextExpectedToken(state: SequenceTrackerState): string | null {
  if (state.currentIndex < 0 || state.currentIndex >= state.tokens.length) return null;
  return state.tokens[state.currentIndex];
}
