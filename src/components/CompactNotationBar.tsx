import React, { useEffect, useRef } from 'react';
import {
  Check,
  ChevronUp,
  Compass,
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

  const allLessons = CURRICULUM[puzzleType] ?? CURRICULUM['3x3'];
  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? allLessons[0];
  const isLearnContext = activeTab === 'learn' && Boolean(activeLesson);
  const tracker = isLearnContext ? lessonTracker : playTracker;
  const hasTokens = tracker.tokens.length > 0;
  const methodProgress = !isLearnContext
    ? getActiveMethodProgress(activeMethodPlan, playTracker.currentIndex)
    : null;

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

  return (
    <div
      data-testid="compact-notation-bar"
      role="region"
      aria-label="Active notations and quick controls"
      className="shrink-0 w-full border-t px-2.5 sm:px-4 py-2 kubi-safe-bottom flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-3 gap-y-1.5 z-20"
      style={{
        backgroundColor: theme.ui.surface,
        borderColor: theme.ui.border,
      }}
    >
      {/* 1. Context Status & Feedback */}
      <div className="order-1 flex items-center gap-2 min-w-0 flex-1 lg:flex-initial lg:max-w-[290px]">
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

      {/* 2. Quick Solving Actions + Show Controls */}
      <div className="order-2 lg:order-3 flex items-center gap-1 sm:gap-1.5 shrink-0">
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
          className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto kubi-scroll-x py-0.5"
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
                disabled={isBusy || !isCurrent}
                onClick={() => {
                  if (!isCurrent) return;
                  if (isLearnContext && activeLesson) onStepLesson(activeLesson);
                  else if (activeMethodPlan) onStepSolveMove();
                  else onManualMove(token);
                }}
                data-step-index={idx}
                data-step-status={status}
                data-step-active={isCurrent ? 'true' : 'false'}
                className="font-mono-tabular text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 inline-flex items-center gap-1 transition-all duration-150 disabled:cursor-default cursor-pointer"
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
