import type { SequenceTrackerState } from './sequenceTracker';
import type { MethodSolvePlan } from './methodSolver';
import { getActiveMethodProgress } from './methodSolver';
import type { DockTab } from './types';

export const MINI_BAR_TOUR_STORAGE_KEY = 'kubi_minibar_tour_seen_v1';

export type MiniBarTooltipStepId = 'context' | 'markers' | 'actions';

export interface MiniBarTooltipStep {
  id: MiniBarTooltipStepId;
  anchor: 'left' | 'center' | 'right';
  title: string;
  body: string;
  exampleCallout?: string;
  showMarkerLegend?: boolean;
}

const BASE_MOVE_DESCRIPTIONS: Record<string, string> = {
  U: 'Top (Up) face',
  D: 'Bottom (Down) face',
  L: 'Left face',
  R: 'Right face',
  F: 'Front face',
  B: 'Back face',
  M: 'Middle slice (same direction as L)',
  E: 'Equatorial slice (same direction as D)',
  S: 'Standing slice (same direction as F)',
  x: 'whole cube around X-axis (like R)',
  y: 'whole cube around Y-axis (like U)',
  z: 'whole cube around Z-axis (like F)',
  Rw: 'Right two layers (wide R)',
  Uw: 'Top two layers (wide U)',
  Lw: 'Left two layers (wide L)',
  Dw: 'Bottom two layers (wide D)',
  Fw: 'Front two layers (wide F)',
  Bw: 'Back two layers (wide B)',
};

/**
 * Translates any WCA notation token (e.g. "R'", "U2", "M", "x'") into a plain-English
 * explanation for learners reading Mini-Bar markers.
 */
export function describeNotationToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return 'Turn the highlighted layer.';

  const match = /^([UDLRFBMESxyz]w?)(['2]?)$/.exec(trimmed);
  if (!match) {
    return `Perform ${trimmed} as shown by the 3D guide arrow.`;
  }

  const [, base, suffix] = match;
  const target = BASE_MOVE_DESCRIPTIONS[base] ?? `${base} layer`;
  const isWholeCube = base === 'x' || base === 'y' || base === 'z';
  const verb = isWholeCube ? 'Rotate' : 'Turn';

  if (suffix === "'") {
    return `${verb} ${target} 90° counter-clockwise (prime ').`;
  }
  if (suffix === '2') {
    return `${verb} ${target} 180° (double turn — shows ½ after one 90° turn).`;
  }
  return `${verb} ${target} 90° clockwise.`;
}

export interface MiniBarTourContext {
  activeTab: DockTab;
  isLearnContext: boolean;
  lessonTitle?: string;
  activeMethodPlan: MethodSolvePlan | null;
  tracker: SequenceTrackerState;
  playTrackerLabel: string;
  isSolved: boolean;
}

/**
 * Builds interactive, context-aware Mini-Bar tooltip steps tailored to the learner's
 * live solving state (Learn lesson, Method Flow plan, Tracked scramble, or Free Play).
 */
export function buildMiniBarTooltipSteps(ctx: MiniBarTourContext): MiniBarTooltipStep[] {
  const hasTokens = ctx.tracker.tokens.length > 0;
  const completedCount = Math.min(ctx.tracker.currentIndex, ctx.tracker.tokens.length);
  const currentToken = hasTokens ? ctx.tracker.tokens[ctx.tracker.currentIndex] ?? null : null;
  const methodProgress = !ctx.isLearnContext
    ? getActiveMethodProgress(ctx.activeMethodPlan, ctx.tracker.currentIndex)
    : null;

  // 1. Context Badge Step
  let contextTitle = 'Live Solve Context';
  let contextBody =
    'This status readout tracks your current mode and step progress while the main controls stay out of your way.';

  if (ctx.isLearnContext && ctx.lessonTitle) {
    contextTitle = 'Lesson Progress';
    contextBody = `You are practicing "${ctx.lessonTitle}" (${completedCount}/${ctx.tracker.tokens.length}). Watch this counter advance automatically as you turn the cube.`;
  } else if (ctx.activeMethodPlan && methodProgress?.phase) {
    contextTitle = `${ctx.activeMethodPlan.methodName} Method Stage`;
    contextBody = `Shows your live stage (${methodProgress.phase.name}) and exact sub-algorithm so you always know what part of the solve you are in.`;
  } else if (hasTokens) {
    contextTitle = `${ctx.playTrackerLabel} Progress`;
    contextBody = `Tracks every move in your active sequence (${completedCount}/${ctx.tracker.tokens.length}) in real time as you drag layers or use keys.`;
  }

  // 2. Notation Markers Step
  let markersTitle = 'Reading Notation Markers';
  let markersBody =
    'Each box is one move. Follow the highlighted box from left to right—colors update live as you turn the cube.';
  let exampleCallout: string | undefined;

  if (ctx.tracker.lastWrongNotation) {
    markersTitle = 'Fixing a Red Marker';
    markersBody = `Red (×) flags an off-sequence turn (${ctx.tracker.lastWrongNotation}). Tap Undo or perform the reverse move, then follow the highlighted box.`;
    if (ctx.tracker.expectedOnWrong) {
      exampleCallout = `Expected ${ctx.tracker.expectedOnWrong}: ${describeNotationToken(ctx.tracker.expectedOnWrong)}`;
    }
  } else if (currentToken) {
    markersTitle = 'How to Read Notation Markers';
    markersBody =
      'Highlighted = next move (click it to perform). Green ✓ = correct move. Red × = wrong move. A prime (\') means counter-clockwise, and 2 means 180°.';
    exampleCallout = `Next (${currentToken}): ${describeNotationToken(currentToken)}`;
  } else if (hasTokens) {
    markersTitle = 'Sequence Completed';
    markersBody =
      'All markers turned green ✓! You completed every move in this sequence. Tap Stage or Scramble to practice another run.';
  } else {
    markersTitle = 'Start Tracking Notations';
    markersBody =
      'Tap Scramble to generate a guided solve sequence—color-coded move boxes (green ✓, active highlight, red ×) will appear right here.';
    exampleCallout = "Tip: R = 90° clockwise · R' = 90° counter-clockwise · R2 = 180° double turn.";
  }

  // 3. Quick Controls Step
  let actionsTitle = 'One-Tap Controls';
  let actionsBody =
    'Tap Step to animate the next move, Undo to reverse a mistake, or Controls (shortcut H) anytime to reopen the full studio panel.';

  if (!hasTokens && !ctx.isLearnContext) {
    actionsTitle = 'Quick Mini-Bar Actions';
    actionsBody =
      'Use Scramble or Hint directly from here while keeping the full 3D cube unobstructed, or tap Controls (H) to open all methods and lessons.';
  } else if (!ctx.isLearnContext && ctx.activeMethodPlan && !ctx.isSolved) {
    actionsTitle = 'Step, Auto-Solve & Restore';
    actionsBody =
      'Tap Step for a single move, Solve to watch the active method run live, Undo to revert a wrong turn, or Controls (H) to expand the panel.';
  }

  return [
    {
      id: 'markers',
      anchor: 'center',
      title: markersTitle,
      body: markersBody,
      exampleCallout,
      showMarkerLegend: true,
    },
    {
      id: 'context',
      anchor: 'left',
      title: contextTitle,
      body: contextBody,
    },
    {
      id: 'actions',
      anchor: 'right',
      title: actionsTitle,
      body: actionsBody,
    },
  ];
}

export function hasSeenMiniBarTour(): boolean {
  try {
    return localStorage.getItem(MINI_BAR_TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markMiniBarTourSeen(): void {
  try {
    localStorage.setItem(MINI_BAR_TOUR_STORAGE_KEY, '1');
  } catch {
    // ignore storage restrictions
  }
}
