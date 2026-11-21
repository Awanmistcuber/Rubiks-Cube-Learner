import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  HelpCircle,
  PanelRightOpen,
  Pause,
  RotateCcw,
  Shuffle,
  StepForward,
  Undo2,
  Wand2,
  X,
} from 'lucide-react';
import { CURRICULUM } from '../cube/curriculum';
import { getActiveMethodProgress, type MethodSolvePlan } from '../cube/methodSolver';
import {
  buildMiniBarTooltipSteps,
  describeNotationToken,
  hasSeenMiniBarTour,
  markMiniBarTourSeen,
} from '../cube/miniBarOnboarding';
import type { SequenceTrackerState } from '../cube/sequenceTracker';
import type {
  CubeMove,
  DockTab,
  LessonStep,
  PuzzleType,
  ThemePalette,
} from '../cube/types';

interface CompactNotationBarProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  activeTab: DockTab;
  isBusy: boolean;
  isAutoSolving: boolean;
  isSolved: boolean;
  canUndo: boolean;
  hintMove: CubeMove | null;
  activeMethodPlan: MethodSolvePlan | null;
  activeLessonId: string;
  lessonTracker: SequenceTrackerState;
  playTracker: SequenceTrackerState;
  playTrackerLabel: string;
  onExpandControls: () => void;
  onScramble: () => void;
  onHint: () => void;
  onUndo: () => void;
  onStepSolveMove: () => void;
  onAutoSolve: () => void;
  onPauseAutoSolve: () => void;
  onManualMove: (notation: string) => void;
  onStageLesson: (lesson: LessonStep) => void;
  onStepLesson: (lesson: LessonStep) => void;
}

export const CompactNotationBar: React.FC<CompactNotationBarProps> = ({
  theme,
  puzzleType,
  activeTab,
  isBusy,
  isAutoSolving,
  isSolved,
  canUndo,
  hintMove,
  activeMethodPlan,
  activeLessonId,
  lessonTracker,
  playTracker,
  playTrackerLabel,
  onExpandControls,
  onScramble,
  onHint,
  onUndo,
  onStepSolveMove,
  onAutoSolve,
  onPauseAutoSolve,
  onManualMove,
  onStageLesson,
  onStepLesson,
}) => {
  const ribbonRef = useRef<HTMLDivElement | null>(null);

  // Interactive first-session onboarding tooltip state (auto-opens on first session; replayable via ? button)
  const [tourOpen, setTourOpen] = useState<boolean>(() => !hasSeenMiniBarTour());
  const [tourStepIdx, setTourStepIdx] = useState<number>(0);

  // Instant hover/focus inspector tooltip for any individual notation marker chip
  const [inspectedMarker, setInspectedMarker] = useState<{
    token: string;
    status: string;
    isCurrent: boolean;
    isHalf: boolean;
  } | null>(null);

  const allLessons = CURRICULUM[puzzleType] ?? CURRICULUM['3x3'];
  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? allLessons[0];
  const isLearnContext = activeTab === 'learn' && Boolean(activeLesson);
  const tracker = isLearnContext ? lessonTracker : playTracker;
  const hasTokens = tracker.tokens.length > 0;
  const methodProgress = !isLearnContext
    ? getActiveMethodProgress(activeMethodPlan, playTracker.currentIndex)
    : null;

  const tourSteps = useMemo(
    () =>
      buildMiniBarTooltipSteps({
        activeTab,
        isLearnContext,
        lessonTitle: activeLesson?.title,
        activeMethodPlan,
        tracker,
        playTrackerLabel,
        isSolved,
      }),
    [activeLesson?.title, activeMethodPlan, activeTab, isLearnContext, isSolved, playTrackerLabel, tracker]
  );

  const activeTourStep = tourOpen ? tourSteps[Math.min(tourStepIdx, tourSteps.length - 1)] : null;

  const dismissTour = () => {
    markMiniBarTourSeen();
    setTourOpen(false);
  };

  useEffect(() => {
    if (!tourOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        markMiniBarTourSeen();
        setTourOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [tourOpen]);

  useEffect(() => {
    const container = ribbonRef.current;
    if (!container) return;
    const activeChip = container.querySelector<HTMLElement>('[data-step-active="true"]');
    if (activeChip) {
      activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [tracker.currentIndex, activeTab, tracker.tokens.length]);

  const isDark = theme.isDark;
  const correctColors = isDark
    ? { bg: 'rgba(34, 197, 94, 0.22)', border: '#22C55E', text: '#4ADE80' }
    : { bg: '#DCFCE7', border: '#16A34A', text: '#15803D' };
  const wrongColors = isDark
    ? { bg: 'rgba(239, 68, 68, 0.24)', border: '#EF4444', text: '#FCA5A5' }
    : { bg: '#FEE2E2', border: '#DC2626', text: '#B91C1C' };

  const completedCount = Math.min(tracker.currentIndex, tracker.tokens.length);
  const isSequenceDone = hasTokens && tracker.currentIndex >= tracker.tokens.length;

  let contextLabel = 'Free Play';
  let contextDetail = hintMove ? `Next: ${hintMove.notation}` : isSolved ? 'Cube Ready' : 'Scrambled';

  if (isLearnContext && activeLesson) {
    contextLabel = `Learn · ${activeLesson.title}`;
    contextDetail = `${completedCount}/${tracker.tokens.length}`;
  } else if (activeMethodPlan && methodProgress?.phase) {
    contextLabel = methodProgress.isComplete
      ? `${activeMethodPlan.methodName} Complete`
      : `${activeMethodPlan.methodName} · ${methodProgress.phase.shortName}`;
    contextDetail = methodProgress.isComplete
      ? `${tracker.tokens.length}/${tracker.tokens.length}`
      : `${methodProgress.subStep ? methodProgress.subStep.label : methodProgress.phase.algorithmName} · ${completedCount}/${tracker.tokens.length}`;
  } else if (hasTokens) {
    contextLabel = playTrackerLabel;
    contextDetail = `${completedCount}/${tracker.tokens.length}`;
  }

  // Dynamic positioning classes for the anchored interactive tooltip popover
  const popoverPositionClass =
    activeTourStep?.anchor === 'left'
      ? 'left-2.5 sm:left-4'
      : activeTourStep?.anchor === 'right'
        ? 'right-2.5 sm:right-4'
        : 'left-1/2 -translate-x-1/2';

  const caretPositionClass =
    activeTourStep?.anchor === 'left'
      ? 'left-6'
      : activeTourStep?.anchor === 'right'
        ? 'right-8'
        : 'left-1/2 -translate-x-1/2';

  const spotlightStyle = (stepId: 'context' | 'markers' | 'actions'): React.CSSProperties | undefined =>
    activeTourStep?.id === stepId
      ? {
          boxShadow: `0 0 0 2px ${theme.ui.accent}`,
          borderRadius: '10px',
        }
      : undefined;

  return (
    <div
      data-testid="compact-notation-bar"
      role="region"
      aria-label="Active notations and quick controls"
      className="relative shrink-0 w-full border-t px-2.5 sm:px-4 py-2 kubi-safe-bottom flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-3 gap-y-1.5 z-20"
      style={{
        backgroundColor: theme.ui.surface,
        borderColor: theme.ui.border,
      }}
    >
      {/* Interactive Context-Aware First-Session Tooltip Popover */}
      {activeTourStep && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label={`Notation guide: ${activeTourStep.title}`}
          data-testid="minibar-tour-tooltip"
          data-tour-step={activeTourStep.id}
          className={`absolute bottom-full mb-2.5 z-40 w-[min(348px,calc(100vw-20px))] rounded-2xl border p-3.5 animate-kubi-enter ${popoverPositionClass}`}
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.accent,
            boxShadow: theme.ui.shadow,
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <HelpCircle className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
              <h3
                className="font-display text-xs sm:text-sm font-bold truncate"
                style={{ color: theme.ui.text }}
              >
                {activeTourStep.title}
              </h3>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="font-mono-tabular text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  backgroundColor: theme.ui.accentSoft,
                  color: theme.ui.accent,
                }}
              >
                {tourStepIdx + 1}/{tourSteps.length}
              </span>
              <button
                type="button"
                data-testid="minibar-tour-close-btn"
                onClick={dismissTour}
                aria-label="Dismiss notation guide"
                className="w-6 h-6 rounded-md border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                  color: theme.ui.muted,
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Context-aware explanation */}
          <p className="text-xs leading-relaxed" style={{ color: theme.ui.muted }}>
            {activeTourStep.body}
          </p>

          {/* Visual Marker Color & Symbol Legend */}
          {activeTourStep.showMarkerLegend && (
            <div
              className="mt-2.5 pt-2 border-t flex flex-wrap items-center gap-1.5"
              style={{ borderColor: theme.ui.border }}
              data-testid="minibar-marker-legend"
            >
              <span
                className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
                style={{
                  backgroundColor: theme.ui.accent,
                  borderColor: theme.ui.accent,
                  color: theme.ui.accentFg,
                }}
              >
                R Next
              </span>
              <span
                className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
                style={{
                  backgroundColor: correctColors.bg,
                  borderColor: correctColors.border,
                  color: correctColors.text,
                }}
              >
                <Check className="w-3 h-3" />
                Done
              </span>
              <span
                className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
                style={{
                  backgroundColor: wrongColors.bg,
                  borderColor: wrongColors.border,
                  color: wrongColors.text,
                }}
              >
                <X className="w-3 h-3" />
                Wrong
              </span>
              <span
                className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                  color: theme.ui.text,
                }}
              >
                U2 ½ Half
              </span>
            </div>
          )}

          {/* Live Dynamic Token Callout */}
          {activeTourStep.exampleCallout && (
            <div
              className="mt-2 px-2.5 py-1.5 rounded-lg border text-[11px] leading-snug font-medium"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              {activeTourStep.exampleCallout}
            </div>
          )}

          {/* Interactive Stepper Controls */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={dismissTour}
              className="text-[11px] font-medium cursor-pointer hover:underline"
              style={{ color: theme.ui.muted }}
            >
              Skip tips
            </button>

            <div className="flex items-center gap-1.5">
              {tourStepIdx > 0 && (
                <button
                  type="button"
                  data-testid="minibar-tour-prev-btn"
                  onClick={() => setTourStepIdx((i) => Math.max(0, i - 1))}
                  className="h-7 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.text,
                  }}
                >
                  <ChevronLeft className="w-3 h-3" />
                  <span>Back</span>
                </button>
              )}

              {tourStepIdx < tourSteps.length - 1 ? (
                <button
                  type="button"
                  data-testid="minibar-tour-next-btn"
                  onClick={() => setTourStepIdx((i) => Math.min(tourSteps.length - 1, i + 1))}
                  className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-0.5 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.accent,
                    color: theme.ui.accentFg,
                  }}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="minibar-tour-done-btn"
                  onClick={dismissTour}
                  className="h-7 px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.accent,
                    color: theme.ui.accentFg,
                  }}
                >
                  <Check className="w-3 h-3" />
                  <span>Got it</span>
                </button>
              )}
            </div>
          </div>

          {/* Downward Pointer Caret */}
          <span
            aria-hidden="true"
            className={`absolute -bottom-[6px] w-3 h-3 rotate-45 border-r border-b ${caretPositionClass}`}
            style={{
              backgroundColor: theme.ui.surface,
              borderColor: theme.ui.accent,
            }}
          />
        </div>
      )}

      {/* Hover/Focus Live Micro-Tooltip for Individual Notation Chips (when tour is dismissed) */}
      {!tourOpen && inspectedMarker && (
        <div
          role="tooltip"
          data-testid="minibar-marker-hover-tooltip"
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-30 max-w-[min(360px,calc(100vw-20px))] px-3 py-1.5 rounded-xl border text-[11px] font-medium flex items-center gap-2 pointer-events-none animate-kubi-enter"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            color: theme.ui.text,
            boxShadow: theme.ui.shadow,
          }}
        >
          <span
            className="font-mono-tabular font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor:
                inspectedMarker.status === 'correct'
                  ? correctColors.bg
                  : inspectedMarker.status === 'wrong'
                    ? wrongColors.bg
                    : inspectedMarker.isCurrent
                      ? theme.ui.accent
                      : theme.ui.surfaceSubtle,
              color:
                inspectedMarker.status === 'correct'
                  ? correctColors.text
                  : inspectedMarker.status === 'wrong'
                    ? wrongColors.text
                    : inspectedMarker.isCurrent
                      ? theme.ui.accentFg
                      : theme.ui.text,
            }}
          >
            {inspectedMarker.token}
          </span>
          <span className="truncate">
            {describeNotationToken(inspectedMarker.token)}
            {inspectedMarker.status === 'correct'
              ? ' (Done ✓)'
              : inspectedMarker.status === 'wrong'
                ? ' (Wrong — Undo to retry)'
                : inspectedMarker.isHalf
                  ? ' (Halfway — 1 more 90° turn)'
                  : inspectedMarker.isCurrent
                    ? ' (Click to turn)'
                    : ''}
          </span>
        </div>
      )}

      {/* 1. Context Status & Feedback */}
      <div
        className="order-1 flex items-center gap-2 min-w-0 flex-1 lg:flex-initial lg:max-w-[290px] px-1 py-0.5 transition-shadow"
        style={spotlightStyle('context')}
      >
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-xs font-semibold truncate"
              style={{ color: theme.ui.text }}
              data-testid="mini-bar-context"
            >
              {contextLabel}
            </span>
            <span
              className="text-[11px] font-mono-tabular shrink-0"
              style={{ color: theme.ui.muted }}
            >
              {contextDetail}
            </span>
          </div>

          {tracker.lastWrongNotation && (
            <span
              role="status"
              data-testid="mini-bar-wrong-feedback"
              className="text-[11px] font-mono-tabular font-semibold truncate"
              style={{ color: wrongColors.text }}
            >
              Wrong {tracker.lastWrongNotation} · Need {tracker.expectedOnWrong}
            </span>
          )}

          {!tracker.lastWrongNotation && isSequenceDone && (
            <span
              role="status"
              className="text-[11px] font-semibold inline-flex items-center gap-1"
              style={{ color: correctColors.text }}
            >
              <Check className="w-3 h-3 shrink-0" />
              <span>Sequence Complete</span>
            </span>
          )}
        </div>
      </div>

      {/* 2. Quick Solving Actions + Guide Replay + Show Controls */}
      <div
        className="order-2 lg:order-3 flex items-center gap-1 sm:gap-1.5 shrink-0 p-0.5 transition-shadow"
        style={spotlightStyle('actions')}
      >
        {!hasTokens && !isLearnContext && (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={onScramble}
              className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Scramble</span>
            </button>
            <button
              type="button"
              disabled={isBusy || isSolved}
              onClick={onHint}
              aria-label="Step Hint"
              title="Show 3D guide arrow"
              className="h-8 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <Compass className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
              <span className="hidden sm:inline">Hint</span>
            </button>
          </>
        )}

        {isLearnContext && activeLesson && isSequenceDone && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onStageLesson(activeLesson)}
            className="h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
            style={{
              backgroundColor: theme.ui.accentSoft,
              borderColor: theme.ui.accent,
              color: theme.ui.accent,
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Stage</span>
          </button>
        )}

        {hasTokens && !isSequenceDone && (
          <button
            type="button"
            data-testid="mini-bar-step-btn"
            disabled={isBusy}
            onClick={() => {
              if (isLearnContext && activeLesson) {
                onStepLesson(activeLesson);
              } else if (activeMethodPlan) {
                onStepSolveMove();
              } else {
                const nextToken = tracker.tokens[tracker.currentIndex];
                if (nextToken) onManualMove(nextToken);
              }
            }}
            aria-label="Perform next step"
            title="Perform next move"
            className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
            style={{
              backgroundColor: theme.ui.accent,
              color: theme.ui.accentFg,
            }}
          >
            <StepForward className="w-3.5 h-3.5" />
            <span>Step</span>
          </button>
        )}

        {!isLearnContext && activeMethodPlan && !isSolved && (
          isAutoSolving ? (
            <button
              type="button"
              onClick={onPauseAutoSolve}
              aria-label="Pause auto-solve"
              className="h-8 px-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: theme.ui.accentSoft,
                borderColor: theme.ui.accent,
                color: theme.ui.accent,
              }}
            >
              <Pause className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pause</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={onAutoSolve}
              aria-label="Auto-solve with current method"
              title="Auto-Solve"
              className="h-8 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Solve</span>
            </button>
          )
        )}

        {canUndo && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onUndo}
            aria-label="Undo last move"
            title="Undo (Ctrl+Z)"
            className="h-8 w-8 rounded-lg border inline-flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
            style={{
              backgroundColor: tracker.lastWrongNotation ? wrongColors.bg : theme.ui.surfaceSubtle,
              borderColor: tracker.lastWrongNotation ? wrongColors.border : theme.ui.border,
              color: tracker.lastWrongNotation ? wrongColors.text : theme.ui.text,
            }}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-testid="minibar-tour-trigger"
          aria-pressed={tourOpen}
          onClick={(e) => {
            e.currentTarget.blur();
            if (tourOpen) {
              dismissTour();
            } else {
              setTourStepIdx(0);
              setTourOpen(true);
            }
          }}
          aria-label={tourOpen ? 'Hide notation guide tooltips' : 'Show notation guide tooltips'}
          title="How to read notation markers"
          className="h-8 w-8 rounded-lg border inline-flex items-center justify-center cursor-pointer shrink-0"
          style={{
            backgroundColor: tourOpen ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
            borderColor: tourOpen ? theme.ui.accent : theme.ui.border,
            color: tourOpen ? theme.ui.accent : theme.ui.muted,
          }}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          data-testid="mini-bar-show-controls-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            onExpandControls();
          }}
          aria-label="Show studio controls panel"
          title="Show Controls (H)"
          className="h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
            color: theme.ui.text,
          }}
        >
          <ChevronUp className="w-3.5 h-3.5 lg:hidden" style={{ color: theme.ui.accent }} />
          <PanelRightOpen className="w-3.5 h-3.5 hidden lg:block" style={{ color: theme.ui.accent }} />
          <span>Controls</span>
        </button>
      </div>

      {/* 3. Live Color-Coded Notation Ribbon — Row 2 on Mobile/Tablet, Center Flex Strip on Desktop */}
      {hasTokens && (
        <div
          ref={ribbonRef}
          data-testid="mini-bar-notation-ribbon"
          className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto kubi-scroll-x py-0.5 px-0.5 transition-shadow"
          style={spotlightStyle('markers')}
        >
          {tracker.tokens.map((token, idx) => {
            const status = tracker.statuses[idx] ?? 'pending';
            const isCurrent = idx === tracker.currentIndex;
            const isHalf = isCurrent && tracker.halfTurnDirection !== null && status !== 'wrong';

            let backgroundColor = theme.ui.surfaceSubtle;
            let borderColor = theme.ui.border;
            let color = theme.ui.text;

            if (status === 'correct') {
              backgroundColor = correctColors.bg;
              borderColor = correctColors.border;
              color = correctColors.text;
            } else if (status === 'wrong') {
              backgroundColor = wrongColors.bg;
              borderColor = wrongColors.border;
              color = wrongColors.text;
            } else if (isCurrent) {
              backgroundColor = theme.ui.accent;
              borderColor = theme.ui.accent;
              color = theme.ui.accentFg;
            }

            return (
              <button
                key={`mini-${idx}`}
                type="button"
                disabled={isBusy}
                onMouseEnter={() =>
                  setInspectedMarker({ token, status, isCurrent, isHalf })
                }
                onMouseLeave={() => setInspectedMarker(null)}
                onFocus={() =>
                  setInspectedMarker({ token, status, isCurrent, isHalf })
                }
                onBlur={() => setInspectedMarker(null)}
                onClick={() => {
                  if (isCurrent) {
                    if (isLearnContext && activeLesson) onStepLesson(activeLesson);
                    else if (activeMethodPlan) onStepSolveMove();
                    else onManualMove(token);
                  } else {
                    setInspectedMarker({ token, status, isCurrent, isHalf });
                  }
                }}
                aria-label={`${token}: ${describeNotationToken(token)}`}
                data-step-index={idx}
                data-step-status={status}
                data-step-active={isCurrent ? 'true' : 'false'}
                className="font-mono-tabular text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 inline-flex items-center gap-1 transition-all duration-150 disabled:opacity-55 cursor-pointer"
                style={{
                  backgroundColor,
                  borderColor,
                  color,
                }}
              >
                {status === 'correct' && <Check className="w-3 h-3 shrink-0" aria-hidden="true" />}
                {status === 'wrong' && <X className="w-3 h-3 shrink-0" aria-hidden="true" />}
                <span>{token}</span>
                {isHalf && (
                  <span className="text-[10px] opacity-85 font-bold" aria-label="half turn completed">
                    ½
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
