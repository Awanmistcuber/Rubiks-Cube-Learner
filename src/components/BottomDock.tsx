import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Compass,
  Gamepad2,
  Globe,
  Grid3X3,
  Headphones,
  Layers,
  Loader2,
  Music,
  Palette,
  PanelRightClose,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Send,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  Undo2,
  VolumeX,
  Wand2,
  Waves,
  X,
} from 'lucide-react';
import { AMBIENT_SOUNDSCAPES } from '../cube/audio';
import { buildApiUrl } from '../cube/backendConfig';
import { ALGORITHM_PRESETS, CURRICULUM } from '../cube/curriculum';
import { buildThemePaletteFromCustom, type CustomThemeRecord } from '../cube/customThemes';
import {
  getActiveMethodProgress,
  SOLVE_METHOD_LIST,
  SOLVE_METHODS,
  type MethodSolvePlan,
} from '../cube/methodSolver';
import {
  getPatternPreviewGrid,
  hexNumberToCss,
  STICKER_PATTERN_TEMPLATES,
  type StickerPatternId,
} from '../cube/patternTemplates';
import type { SequenceTrackerState } from '../cube/sequenceTracker';
import { THEME_LIST } from '../cube/themes';
import type {
  AmbientSoundscapeId,
  CubeMove,
  DockTab,
  LessonStep,
  PuzzleType,
  SolveMethodId,
  ThemePalette,
} from '../cube/types';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../i18n/i18n';
import { useI18n } from '../i18n/I18nContext';

interface BottomDockProps {
  theme: ThemePalette;
  customThemes: CustomThemeRecord[];
  soundscape: AmbientSoundscapeId;
  ambientVolume: number;
  spatialAudioEnabled: boolean;
  puzzleType: PuzzleType;
  activeTab: DockTab;
  collapsed: boolean;
  isBusy: boolean;
  isAutoSolving: boolean;
  isSolved: boolean;
  canUndo: boolean;
  hintMove: CubeMove | null;
  explodeAmount: number;
  turnSpeed: number;
  activePatternId: StickerPatternId;
  selectedMethod: SolveMethodId;
  activeMethodPlan: MethodSolvePlan | null;
  activeLessonId: string;
  lessonTracker: SequenceTrackerState;
  playTracker: SequenceTrackerState;
  playTrackerLabel: string;
  hasLastScramble: boolean;
  recentNotations: string[];
  onSetTab: (tab: DockTab) => void;
  onToggleCollapse: () => void;
  onScramble: () => void;
  onUndo: () => void;
  onHint: () => void;
  onOpenSmartHint: () => void;
  onStepSolveMove: () => void;
  onAutoSolve: () => void;
  onPauseAutoSolve: () => void;
  onSelectMethod: (method: SolveMethodId) => void;
  onReplanMethod: () => void;
  onResetCube: () => void;
  onManualMove: (notation: string) => void;
  onTrackPlaySequence: (rawInput: string) => { ok: boolean; message?: string };
  onPracticeScrambleManually: () => void;
  onResetPlayTracker: () => void;
  onClearPlayTracker: () => void;
  onExplodeChange: (v: number) => void;
  onSpeedChange: (v: number) => void;
  onSelectTheme: (themeKey: string) => void;
  onOpenPaletteStudio: () => void;
  onExportSnapshot: () => void;
  onSelectSoundscape: (s: AmbientSoundscapeId) => void;
  onAmbientVolumeChange: (v: number) => void;
  onToggleSpatialAudio: () => void;
  onApplyPattern: (patternId: StickerPatternId) => void;
  onRunAlgorithm: (notations: string[]) => void;
  onSelectLesson: (lesson: LessonStep) => void;
  onStageLesson: (lesson: LessonStep) => void;
  onStepLesson: (lesson: LessonStep) => void;
  onPlayLesson: (lesson: LessonStep) => void;
}

const FACE_KEYS = ['U', 'D', 'L', 'R', 'F', 'B'] as const;
const SLICE_KEYS = ['M', 'E', 'S'] as const;
const ROTATION_KEYS = ['x', 'y', 'z'] as const;

const COACH_PROMPTS = [
  'Explain my next move visually',
  'How do I build speedcube fingertricks?',
  'Why does 4×4 parity happen?',
  'How do you read Mirror Blocks heights?',
];

export const BottomDock: React.FC<BottomDockProps> = ({
  theme,
  customThemes,
  soundscape,
  ambientVolume,
  spatialAudioEnabled,
  puzzleType,
  activeTab,
  collapsed,
  isBusy,
  isAutoSolving,
  isSolved,
  canUndo,
  hintMove,
  explodeAmount,
  turnSpeed,
  activePatternId,
  selectedMethod,
  activeMethodPlan,
  activeLessonId,
  lessonTracker,
  playTracker,
  playTrackerLabel,
  hasLastScramble,
  recentNotations,
  onSetTab,
  onToggleCollapse,
  onScramble,
  onUndo,
  onHint,
  onOpenSmartHint,
  onStepSolveMove,
  onAutoSolve,
  onPauseAutoSolve,
  onSelectMethod,
  onReplanMethod,
  onResetCube,
  onManualMove,
  onTrackPlaySequence,
  onPracticeScrambleManually,
  onResetPlayTracker,
  onClearPlayTracker,
  onExplodeChange,
  onSpeedChange,
  onSelectTheme,
  onOpenPaletteStudio,
  onExportSnapshot,
  onSelectSoundscape,
  onAmbientVolumeChange,
  onToggleSpatialAudio,
  onApplyPattern,
  onRunAlgorithm,
  onSelectLesson,
  onStageLesson,
  onStepLesson,
  onPlayLesson,
}) => {
  const { locale, setLocale, t } = useI18n();
  const [counterClockwise, setCounterClockwise] = useState(false);
  const [sequenceInput, setSequenceInput] = useState('');
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const [lessonMethodFilter, setLessonMethodFilter] = useState<'all' | SolveMethodId>('all');
  const sequenceInputRef = useRef<HTMLInputElement | null>(null);
  const playRibbonRef = useRef<HTMLDivElement | null>(null);
  const learnRibbonRef = useRef<HTMLDivElement | null>(null);

  const [coachQuery, setCoachQuery] = useState('');
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const allLessons = CURRICULUM[puzzleType] ?? CURRICULUM['3x3'];
  const hasMethodTaggedLessons = allLessons.some((l) => Boolean(l.method));
  const lessons =
    hasMethodTaggedLessons && lessonMethodFilter !== 'all'
      ? allLessons.filter((l) => l.method === lessonMethodFilter)
      : allLessons;
  const activeLesson =
    allLessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? allLessons[0];
  const presets = ALGORITHM_PRESETS.filter((p) => p.puzzleTypes.includes(puzzleType));
  const lessonStepIndex = lessonTracker.currentIndex;

  const supportsMultiMethod = puzzleType === '3x3' || puzzleType === 'mirror';
  const methodProgress = getActiveMethodProgress(activeMethodPlan, playTracker.currentIndex);

  // Smoothly keep the active move box visible strictly inside the notation ribbon
  // (never use scrollIntoView, which can scroll ancestor panels or the page horizontally on mobile)
  useEffect(() => {
    const container = activeTab === 'play' ? playRibbonRef.current : learnRibbonRef.current;
    if (!container) return;
    const activeChip = container.querySelector<HTMLElement>('[data-step-active="true"]');
    if (!activeChip) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = activeChip.getBoundingClientRect();
    const chipLeftInScroll = chipRect.left - containerRect.left + container.scrollLeft;
    const targetLeft = Math.max(
      0,
      chipLeftInScroll - (container.clientWidth - chipRect.width) / 2
    );
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [activeTab, playTracker.currentIndex, lessonTracker.currentIndex]);

  const isDark = theme.isDark;
  const correctColors = isDark
    ? { bg: 'rgba(34, 197, 94, 0.22)', border: '#22C55E', text: '#4ADE80' }
    : { bg: '#DCFCE7', border: '#16A34A', text: '#15803D' };
  const wrongColors = isDark
    ? { bg: 'rgba(239, 68, 68, 0.24)', border: '#EF4444', text: '#FCA5A5' }
    : { bg: '#FEE2E2', border: '#DC2626', text: '#B91C1C' };

  const renderNotationRibbon = (
    tracker: SequenceTrackerState,
    keyPrefix: string,
    testId: string,
    ribbonRef: React.RefObject<HTMLDivElement | null>
  ) => {
    return (
      <div
        ref={ribbonRef}
        className="flex items-center gap-1.5 overflow-x-auto kubi-scroll-x pt-0.5 pb-0.5"
        data-testid={testId}
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
            <span
              key={`${keyPrefix}-${idx}`}
              data-step-index={idx}
              data-step-status={status}
              data-step-active={isCurrent ? 'true' : 'false'}
              className="font-mono-tabular text-xs font-semibold px-2.5 py-1.5 rounded-lg border shrink-0 inline-flex items-center gap-1 transition-all duration-150"
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
            </span>
          );
        })}
      </div>
    );
  };

  const submitCoachQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || coachLoading) return;
    setCoachLoading(true);
    setCoachError(null);
    setCoachAnswer(null);

    try {
      const res = await fetch(buildApiUrl('/api/coach/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          puzzleType,
          moveHistory: recentNotations,
          nextHint: hintMove?.notation ?? null,
          isSolved,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCoachError(data.error || 'Could not reach Solve Coach right now.');
      } else {
        setCoachAnswer(data.answer);
      }
    } catch {
      setCoachError('Network error reaching Solve Coach. Built-in lessons and auto-solver remain active.');
    } finally {
      setCoachLoading(false);
    }
  };

  if (collapsed) return null;

  return (
    <aside
      data-testid="studio-control-panel"
      aria-label="Studio controls panel"
      className="kubi-studio-panel z-20"
      style={{
        backgroundColor: theme.ui.surface,
        borderColor: theme.ui.border,
      }}
    >
      {/* Sticky Panel Header Tabs + Collapse Button */}
      <div
        className="shrink-0 flex items-center justify-between gap-1.5 px-2.5 py-1.5 sm:py-2 border-b"
        style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surfaceSubtle }}
      >
        <div
          className="flex items-center gap-0.5 flex-1 min-w-0"
          role="tablist"
          aria-label="Studio modes"
        >
          {(
            [
              { id: 'play', label: t('dock.tab.play'), icon: Gamepad2 },
              { id: 'learn', label: t('dock.tab.learn'), icon: BookOpen },
              { id: 'lab', label: t('dock.tab.lab'), icon: SlidersHorizontal },
              { id: 'coach', label: t('dock.tab.coach'), icon: Sparkles },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSetTab(id)}
                className="h-8 sm:h-9 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 whitespace-nowrap cursor-pointer flex-1 min-w-0"
                style={{
                  backgroundColor: active ? theme.ui.surface : 'transparent',
                  color: active ? theme.ui.text : theme.ui.muted,
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hintMove && (
            <div
              className="hidden sm:flex items-center gap-1 px-2 h-8 rounded-lg border text-[11px]"
              data-testid="next-guide-move"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
              }}
            >
              <Compass className="w-3 h-3 shrink-0" style={{ color: theme.ui.accent }} />
              <span
                className="font-mono-tabular font-semibold"
                style={{ color: theme.ui.accent }}
              >
                {hintMove.notation}
              </span>
            </div>
          )}

          <button
            type="button"
            tabIndex={-1}
            data-testid="panel-collapse-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCollapse();
            }}
            aria-expanded={!collapsed}
            aria-label="Hide controls panel"
            title="Hide controls (H)"
            className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: theme.ui.surface,
              borderColor: theme.ui.border,
              color: theme.ui.muted,
            }}
          >
            <ChevronDown className="w-4 h-4 lg:hidden" />
            <PanelRightClose className="w-3.5 h-3.5 hidden lg:block" />
          </button>
        </div>
      </div>

      {/* Independent Scrollable Panel Content */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden kubi-scroll p-2.5 sm:p-3.5 kubi-safe-bottom">
        {/* 1. PLAY & SOLVE TAB */}
        {activeTab === 'play' && (
          <div className="flex flex-col gap-3">
            {/* Primary Solving Action Rows — 4 primary actions on 1 single row across phone, tablet & laptop */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 w-full min-w-0">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={onScramble}
                  className="h-9 flex-auto min-w-0 px-1.5 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: theme.ui.accent,
                    color: theme.ui.accentFg,
                  }}
                >
                  <Shuffle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('dock.scramble')}</span>
                </button>

                <button
                  type="button"
                  disabled={isBusy || isSolved}
                  onClick={onHint}
                  aria-label="Step Hint"
                  title="Show 3D guide arrow for next move"
                  className="h-9 flex-auto min-w-0 px-1.5 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-medium border flex items-center justify-center gap-1 transition-colors duration-150 disabled:opacity-45 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.text,
                  }}
                >
                  <Compass className="w-3.5 h-3.5 shrink-0" style={{ color: theme.ui.accent }} />
                  <span className="truncate">{t('dock.hint')}</span>
                </button>

                <button
                  type="button"
                  data-testid="dock-open-smart-hint-btn"
                  onClick={onOpenSmartHint}
                  aria-label="Scan physical cube with camera for Smart Hint"
                  title="Scan physical 3×3 cube via camera (Kociemba + basic hints)"
                  className="h-9 flex-auto min-w-0 px-1.5 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-semibold border flex items-center justify-center gap-1 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: theme.ui.accentSoft,
                    borderColor: theme.ui.accent,
                    color: theme.ui.accent,
                  }}
                >
                  <ScanLine className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('dock.scanCube')}</span>
                </button>

                {isAutoSolving ? (
                  <button
                    type="button"
                    data-testid="play-pause-solve-btn"
                    onClick={onPauseAutoSolve}
                    className="h-9 flex-auto min-w-0 px-1.5 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-semibold border flex items-center justify-center gap-1 transition-colors duration-150 cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: theme.ui.accentSoft,
                      borderColor: theme.ui.accent,
                      color: theme.ui.accent,
                    }}
                  >
                    <Pause className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('dock.pause')}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="play-auto-solve-btn"
                    disabled={isBusy || isSolved}
                    onClick={onAutoSolve}
                    className="h-9 flex-auto min-w-0 px-1.5 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-medium border flex items-center justify-center gap-1 transition-colors duration-150 disabled:opacity-45 cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  >
                    <Wand2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t('dock.autoSolve')}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5 w-full">
                <button
                  type="button"
                  data-testid="play-undo-btn"
                  disabled={isBusy || !canUndo}
                  onClick={onUndo}
                  aria-label="Undo last move"
                  title="Undo (Ctrl+Z)"
                  className="h-8 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.text,
                  }}
                >
                  <Undo2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('dock.undo')}</span>
                </button>

                <button
                  type="button"
                  data-testid="play-reset-btn"
                  disabled={isBusy && !isAutoSolving}
                  onClick={onResetCube}
                  aria-label="Reset cube to solved state"
                  title="Reset cube"
                  className="h-8 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.muted,
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('dock.reset')}</span>
                </button>
              </div>
            </div>

                {/* Multi-Method Solver Selector & Live Stage Flow Stepper */}
                <div
                  className="flex flex-col gap-1.5 pt-2 border-t"
                  style={{ borderColor: theme.ui.border }}
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <div
                      className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto kubi-scroll-x"
                      role="group"
                      aria-label="Solving method"
                      data-testid="solve-method-selector"
                    >
                      <span
                        className="text-[11px] font-medium mr-0.5 shrink-0 hidden xl:inline"
                        style={{ color: theme.ui.muted }}
                      >
                        Method
                      </span>
                      {supportsMultiMethod ? (
                        SOLVE_METHOD_LIST.map((m) => {
                          const active = selectedMethod === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              data-testid={`method-btn-${m.id}`}
                              disabled={isBusy}
                              aria-pressed={active}
                              onClick={() => onSelectMethod(m.id)}
                              title={m.tagline}
                              className="h-7 px-2 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                              style={{
                                backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                                borderColor: active ? theme.ui.accent : theme.ui.border,
                                color: active ? theme.ui.accent : theme.ui.muted,
                              }}
                            >
                              {m.shortName}
                            </button>
                          );
                        })
                      ) : (
                        <span
                          className="text-[11px] font-medium px-2 py-1 rounded-lg border whitespace-nowrap"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.muted,
                          }}
                        >
                          {puzzleType === '2x2' ? '2×2 Staged Ortega Flow' : '4×4 Staged Reduction Flow'}
                        </span>
                      )}
                    </div>

                    {!isSolved && activeMethodPlan && (
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          data-testid="replan-method-btn"
                          disabled={isBusy}
                          onClick={onReplanMethod}
                          title="Recalculate solve plan from current cube state"
                          className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap shrink-0"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.muted,
                          }}
                        >
                          <RefreshCw className="w-3 h-3 shrink-0" />
                          <span>Re-plan</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {isSolved && supportsMultiMethod && (
                    <span
                      className="text-[11px] truncate"
                      style={{ color: theme.ui.muted }}
                    >
                      {SOLVE_METHODS[selectedMethod].stageSummary}
                    </span>
                  )}

                  {/* Live Method Flow Stepper — shows exact stage & sub-algorithm progress */}
                  {activeMethodPlan && activeMethodPlan.phases.length > 0 && (
                    <div
                      className="flex flex-col gap-1.5 p-2 rounded-xl border"
                      data-testid="method-flow-bar"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      <div className="flex items-center gap-1 overflow-x-auto kubi-scroll-x pb-0.5">
                        {activeMethodPlan.phases.map((phase, idx) => {
                          const isSkipped = phase.moves.length === 0;
                          const isCompleted =
                            isSkipped ||
                            methodProgress.isComplete ||
                            playTracker.currentIndex >= phase.endMoveIndex;
                          const isCurrent =
                            !methodProgress.isComplete &&
                            !isSkipped &&
                            methodProgress.phaseIndex === idx;
                          const doneInPhase = isCompleted
                            ? phase.moves.length
                            : isCurrent
                              ? Math.max(0, playTracker.currentIndex - phase.startMoveIndex)
                              : 0;

                          let bg = theme.ui.surface;
                          let border = theme.ui.border;
                          let text = theme.ui.muted;
                          if (isCurrent) {
                            bg = theme.ui.accent;
                            border = theme.ui.accent;
                            text = theme.ui.accentFg;
                          } else if (isCompleted) {
                            bg = correctColors.bg;
                            border = correctColors.border;
                            text = correctColors.text;
                          }

                          return (
                            <React.Fragment key={phase.id}>
                              {idx > 0 && (
                                <ChevronRight
                                  className="w-3 h-3 shrink-0 opacity-45"
                                  style={{ color: theme.ui.muted }}
                                  aria-hidden="true"
                                />
                              )}
                              <div
                                data-phase-id={phase.id}
                                data-phase-status={
                                  isCurrent ? 'active' : isCompleted ? 'completed' : 'upcoming'
                                }
                                title={`${phase.name}: ${phase.algorithmName}`}
                                className="px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors duration-150"
                                style={{
                                  backgroundColor: bg,
                                  borderColor: border,
                                  color: text,
                                }}
                              >
                                {isCompleted && !isCurrent && (
                                  <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                                )}
                                <span>{phase.shortName}</span>
                                <span className="font-mono-tabular text-[10px] opacity-85">
                                  {isSkipped
                                    ? 'Skip'
                                    : isCurrent
                                      ? `${doneInPhase}/${phase.moves.length}`
                                      : `${phase.moves.length}`}
                                </span>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Active Stage & Algorithm Insight Cue */}
                      {methodProgress.phase && (
                        <div
                          className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[11px]"
                          data-testid="method-flow-active-detail"
                        >
                          <span className="font-semibold" style={{ color: theme.ui.text }}>
                            {methodProgress.isComplete ? (
                              <span style={{ color: correctColors.text }}>
                                {activeMethodPlan.methodName} Complete
                              </span>
                            ) : (
                              <>
                                <span style={{ color: theme.ui.accent }}>
                                  {methodProgress.phase.name}
                                </span>
                                {' · '}
                                <span>
                                  {methodProgress.subStep
                                    ? methodProgress.subStep.label
                                    : methodProgress.phase.algorithmName}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="truncate max-w-full" style={{ color: theme.ui.muted }}>
                            {methodProgress.phase.description}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Live Scramble / Sequence Notation Tracker */}
                <div className="flex flex-col gap-1.5 pt-2 border-t" style={{ borderColor: theme.ui.border }}>
                  <div className="flex items-center gap-1.5">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const res = onTrackPlaySequence(sequenceInput);
                        if (!res.ok) {
                          setSequenceError(res.message ?? 'Enter valid WCA moves (e.g. U D L F R)');
                        } else {
                          setSequenceError(null);
                          sequenceInputRef.current?.blur();
                        }
                      }}
                      className="flex items-center gap-1.5 flex-1 min-w-0"
                    >
                      <input
                        ref={sequenceInputRef}
                        type="text"
                        data-testid="play-sequence-input"
                        value={sequenceInput}
                        onChange={(e) => {
                          setSequenceInput(e.target.value);
                          if (sequenceError) setSequenceError(null);
                        }}
                        placeholder="Track scramble or moves (e.g. U D L F R M E S x y z)"
                        aria-label="Track notation sequence"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border font-mono-tabular text-xs outline-none"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: sequenceError ? wrongColors.border : theme.ui.border,
                          color: theme.ui.text,
                        }}
                      />
                      <button
                        type="submit"
                        data-testid="play-sequence-submit"
                        disabled={isBusy || !sequenceInput.trim()}
                        className="h-8 px-2.5 rounded-lg border text-xs font-semibold shrink-0 disabled:opacity-45 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.accentSoft,
                          borderColor: theme.ui.accent,
                          color: theme.ui.accent,
                        }}
                      >
                        Track
                      </button>
                    </form>

                    {hasLastScramble && activeMethodPlan !== null && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={onPracticeScrambleManually}
                        title="Reset cube and practice executing this scramble step-by-step"
                        className="hidden sm:inline-flex h-8 px-2.5 rounded-lg border text-[11px] font-semibold items-center shrink-0 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        Practice Scramble
                      </button>
                    )}

                    {playTracker.tokens.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid="play-sequence-undo-btn"
                          disabled={isBusy || !canUndo}
                          onClick={onUndo}
                          aria-label="Undo last move"
                          title="Undo last move (Ctrl+Z)"
                          className="h-8 w-8 rounded-lg border flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: canUndo ? theme.ui.text : theme.ui.muted,
                          }}
                        >
                          <Undo2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSequenceInput('');
                            setSequenceError(null);
                            onClearPlayTracker();
                          }}
                          aria-label="Clear tracked sequence"
                          title="Clear sequence"
                          className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.muted,
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {sequenceError && (
                    <p
                      role="alert"
                      className="text-[11px] font-medium"
                      style={{ color: wrongColors.text }}
                    >
                      {sequenceError}
                    </p>
                  )}

                  {playTracker.tokens.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-medium" style={{ color: theme.ui.muted }}>
                          {playTrackerLabel} · {Math.min(playTracker.currentIndex, playTracker.tokens.length)}/
                          {playTracker.tokens.length}
                        </span>

                        {playTracker.lastWrongNotation ? (
                          <span
                            role="status"
                            data-testid="play-sequence-feedback"
                            className="font-mono-tabular font-semibold inline-flex items-center gap-1.5"
                            style={{ color: wrongColors.text }}
                          >
                            <span>
                              Wrong: {playTracker.lastWrongNotation} · Expected {playTracker.expectedOnWrong}
                            </span>
                            {canUndo && (
                              <button
                                type="button"
                                onClick={onUndo}
                                className="underline cursor-pointer"
                                style={{ color: wrongColors.text }}
                              >
                                Undo
                              </button>
                            )}
                          </span>
                        ) : playTracker.currentIndex >= playTracker.tokens.length ? (
                          <span
                            role="status"
                            data-testid="play-sequence-feedback"
                            className="font-semibold inline-flex items-center gap-1"
                            style={{ color: correctColors.text }}
                          >
                            <Check className="w-3 h-3" />
                            <span>Sequence Complete</span>
                          </span>
                        ) : (
                          <span className="font-mono-tabular" style={{ color: theme.ui.muted }}>
                            Next: <strong style={{ color: theme.ui.accent }}>{playTracker.tokens[playTracker.currentIndex]}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        {!isSolved &&
                          (activeMethodPlan !== null ||
                            (playTrackerLabel !== 'Sequence' && playTrackerLabel !== 'Scramble')) && (
                            <button
                              type="button"
                              data-testid="play-step-move-btn"
                              disabled={isBusy || isSolved}
                              onClick={onStepSolveMove}
                              aria-label="Step next move"
                              title="Execute one move of the solving sequence"
                              className="h-8 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition-colors duration-150 active:scale-[0.97] disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                              style={{
                                backgroundColor: theme.ui.surfaceSubtle,
                                borderColor: theme.ui.border,
                                color: theme.ui.text,
                              }}
                            >
                              <StepForward
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: theme.ui.accent }}
                              />
                              <span>Step</span>
                            </button>
                          )}
                        <div className="flex-1 min-w-0">
                          {renderNotationRibbon(
                            playTracker,
                            'play-seq',
                            'play-sequence-ribbon',
                            playRibbonRef
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Touch-Friendly WCA Face, Center Slice (M/E/S) & Cube Rotation (x/y/z) Pad */}
                <div className="flex flex-col gap-2 pt-2.5 border-t" style={{ borderColor: theme.ui.border }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
                      Manual Turns &amp; Rotations
                    </span>
                    <button
                      type="button"
                      onClick={() => setCounterClockwise((prev) => !prev)}
                      aria-pressed={counterClockwise}
                      aria-label="Toggle clockwise or prime direction"
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: counterClockwise ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                        borderColor: counterClockwise ? theme.ui.accent : theme.ui.border,
                        color: counterClockwise ? theme.ui.accent : theme.ui.muted,
                      }}
                    >
                      {counterClockwise ? "Prime (')" : 'Clockwise'}
                    </button>
                  </div>

                  {/* Outer Faces Grid (6 equal buttons) */}
                  <div className="grid grid-cols-6 gap-1.5">
                    {FACE_KEYS.map((face) => {
                      const notation = counterClockwise ? `${face}'` : face;
                      return (
                        <button
                          key={face}
                          type="button"
                          data-testid={`move-btn-${face}`}
                          disabled={isBusy}
                          onClick={() => onManualMove(notation)}
                          aria-label={`Turn ${notation} face`}
                          className="h-9 rounded-lg border font-mono-tabular text-xs sm:text-sm font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.text,
                          }}
                        >
                          {notation}
                        </button>
                      );
                    })}
                  </div>

                  {/* Center Slices (M/E/S) + Cube Rotations (x/y/z) + 4x4 Wide Turns */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {puzzleType !== '2x2' && (
                      <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-[132px]">
                        {SLICE_KEYS.map((slice) => {
                          const notation = counterClockwise ? `${slice}'` : slice;
                          return (
                            <button
                              key={slice}
                              type="button"
                              data-testid={`move-btn-${slice}`}
                              disabled={isBusy}
                              onClick={() => onManualMove(notation)}
                              aria-label={`Turn ${notation} center slice`}
                              title={`Center slice ${notation} (${slice})`}
                              className="h-8 rounded-lg border font-mono-tabular text-xs font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer"
                              style={{
                                backgroundColor: theme.ui.surfaceSubtle,
                                borderColor: theme.ui.border,
                                color: theme.ui.accent,
                              }}
                            >
                              {notation}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-[132px]">
                      {ROTATION_KEYS.map((rot) => {
                        const notation = counterClockwise ? `${rot}'` : rot;
                        return (
                          <button
                            key={rot}
                            type="button"
                            data-testid={`move-btn-${rot}`}
                            disabled={isBusy}
                            onClick={() => onManualMove(notation)}
                            aria-label={`Rotate whole cube ${notation}`}
                            title={`Whole-cube rotation ${notation} (${rot.toUpperCase()})`}
                            className="h-8 rounded-lg border font-mono-tabular text-xs font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer"
                            style={{
                              backgroundColor: theme.ui.surfaceSubtle,
                              borderColor: theme.ui.border,
                              color: theme.ui.muted,
                            }}
                          >
                            {notation}
                          </button>
                        );
                      })}
                    </div>

                    {puzzleType === '4x4' && (
                      <div className="grid grid-cols-2 gap-1.5 shrink-0">
                        {(['Rw', 'Uw'] as const).map((wide) => {
                          const notation = counterClockwise ? `${wide}'` : wide;
                          return (
                            <button
                              key={wide}
                              type="button"
                              disabled={isBusy}
                              onClick={() => onManualMove(notation)}
                              aria-label={`Turn ${notation} wide layer`}
                              className="h-8 px-2.5 rounded-lg border font-mono-tabular text-xs font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer"
                              style={{
                                backgroundColor: theme.ui.surfaceSubtle,
                                borderColor: theme.ui.border,
                                color: theme.ui.accent,
                              }}
                            >
                              {notation}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. LEARN CURRICULUM TAB */}
            {activeTab === 'learn' && activeLesson && (
              <div className="flex flex-col gap-2.5">
                {/* Method Filter Bar (3x3 method-curated algorithms) */}
                {hasMethodTaggedLessons && (
                  <div
                    className="flex items-center gap-1 overflow-x-auto kubi-scroll-x"
                    role="group"
                    aria-label="Filter lessons by solving method"
                    data-testid="learn-method-filters"
                  >
                    {(
                      [
                        { id: 'all', label: 'All Methods' },
                        ...SOLVE_METHOD_LIST.map((m) => ({ id: m.id, label: m.shortName })),
                      ] as const
                    ).map((item) => {
                      const selected = lessonMethodFilter === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`learn-filter-${item.id}`}
                          onClick={() => {
                            setLessonMethodFilter(item.id);
                            const nextList =
                              item.id === 'all'
                                ? allLessons
                                : allLessons.filter((l) => l.method === item.id);
                            if (nextList.length > 0 && !nextList.some((l) => l.id === activeLesson.id)) {
                              onSelectLesson(nextList[0]);
                            }
                          }}
                          className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: selected ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                            borderColor: selected ? theme.ui.accent : theme.ui.border,
                            color: selected ? theme.ui.accent : theme.ui.muted,
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Lesson Stage Selector */}
                <div className="flex items-center gap-1.5 overflow-x-auto kubi-scroll-x pb-0.5">
                  {lessons.map((lesson) => {
                    const selected = lesson.id === activeLesson.id;
                    const prefix = lesson.stageNumber < 10 ? `0${lesson.stageNumber}` : String(lesson.stageNumber);
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => onSelectLesson(lesson)}
                        className="h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        style={{
                          backgroundColor: selected ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                          borderColor: selected ? theme.ui.accent : theme.ui.border,
                          color: selected ? theme.ui.accent : theme.ui.muted,
                        }}
                      >
                        {prefix}. {lesson.title}
                      </button>
                    );
                  })}
                </div>

                {/* Active Lesson Details & Algorithm Strip */}
                <div className="flex flex-col gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3
                        className="font-display text-sm sm:text-base font-semibold truncate"
                        style={{ color: theme.ui.text }}
                      >
                        {activeLesson.title}
                      </h3>
                      <span className="text-xs font-mono-tabular shrink-0" style={{ color: theme.ui.muted }}>
                        Step {Math.min(lessonStepIndex, activeLesson.algorithm.length)}/{activeLesson.algorithm.length}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.ui.muted }}>
                      {activeLesson.moveNotes?.[lessonStepIndex]
                        ? `Next: ${activeLesson.moveNotes[lessonStepIndex]} — ${activeLesson.tip}`
                        : activeLesson.goal}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onStageLesson(activeLesson)}
                      className="h-9 px-3 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      Stage Case
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || lessonStepIndex >= activeLesson.algorithm.length}
                      onClick={() => onStepLesson(activeLesson)}
                      className="h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <StepForward className="w-3.5 h-3.5" />
                      <span>Step</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onPlayLesson(activeLesson)}
                      className="h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.accent,
                        color: theme.ui.accentFg,
                      }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Play Demo</span>
                    </button>
                  </div>
                </div>

                {/* Live Interactive WCA Notation Ribbon (Green = Correct, Red = Wrong) */}
                <div className="flex flex-col gap-1 pt-0.5">
                  {lessonTracker.lastWrongNotation && (
                    <div
                      role="status"
                      data-testid="learn-sequence-feedback"
                      className="text-xs font-mono-tabular font-semibold flex items-center justify-between gap-2"
                      style={{ color: wrongColors.text }}
                    >
                      <span>
                        Wrong move: {lessonTracker.lastWrongNotation} · Expected {lessonTracker.expectedOnWrong}
                      </span>
                      {canUndo && (
                        <button
                          type="button"
                          onClick={onUndo}
                          className="underline text-xs cursor-pointer"
                          style={{ color: wrongColors.text }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                  {!lessonTracker.lastWrongNotation &&
                    lessonTracker.tokens.length > 0 &&
                    lessonTracker.currentIndex >= lessonTracker.tokens.length && (
                      <div
                        role="status"
                        data-testid="learn-sequence-feedback"
                        className="text-xs font-semibold inline-flex items-center gap-1"
                        style={{ color: correctColors.text }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Algorithm Complete — click Stage Case to practice again</span>
                      </div>
                    )}
                  {renderNotationRibbon(
                    lessonTracker.tokens.length > 0
                      ? lessonTracker
                      : {
                          tokens: activeLesson.algorithm,
                          currentIndex: 0,
                          statuses: activeLesson.algorithm.map(() => 'pending'),
                          halfTurnDirection: null,
                          lastWrongNotation: null,
                          expectedOnWrong: null,
                        },
                    activeLesson.id,
                    'learn-sequence-ribbon',
                    learnRibbonRef
                  )}
                </div>
              </div>
            )}

            {/* 3. LAB & FIGMA THEMES TAB */}
            {activeTab === 'lab' && (
              <div className="flex flex-col gap-3.5">
                {/* Sliders Row: Exploded Core + Turn Speed */}
                <div className="grid grid-cols-1 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-1.5" style={{ color: theme.ui.text }}>
                        <Layers className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
                        {t('dock.explodedCore')}
                      </span>
                      <span className="font-mono-tabular" style={{ color: theme.ui.muted }}>
                        {Math.round(explodeAmount * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={explodeAmount}
                      onChange={(e) => onExplodeChange(parseFloat(e.target.value))}
                      aria-label={t('dock.explodedCore')}
                      className="kubi-slider w-full"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium" style={{ color: theme.ui.text }}>
                        {t('dock.animationTempo')}
                      </span>
                      <span className="font-mono-tabular" style={{ color: theme.ui.muted }}>
                        {turnSpeed.toFixed(1)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={2.0}
                      step={0.1}
                      value={turnSpeed}
                      onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                      aria-label={t('dock.animationTempo')}
                      className="kubi-slider w-full"
                    />
                  </label>
                </div>

                {/* Custom Sticker Pattern Templates */}
                <div
                  className="pt-2.5 border-t"
                  style={{ borderColor: theme.ui.border }}
                  data-testid="lab-pattern-templates"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className="text-xs font-medium inline-flex items-center gap-1.5 truncate"
                      style={{ color: theme.ui.muted }}
                    >
                      <Grid3X3
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: activePatternId !== 'solved' ? theme.ui.accent : theme.ui.muted }}
                      />
                      <span>{t('dock.patternTemplates')}</span>
                    </span>
                    {activePatternId !== 'solved' && (
                      <button
                        type="button"
                        data-testid="pattern-reset-btn"
                        disabled={isBusy}
                        onClick={() => onApplyPattern('solved')}
                        className="h-6 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-45 shrink-0"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t('dock.reset')}</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STICKER_PATTERN_TEMPLATES.map((tpl) => {
                      const active = tpl.id === activePatternId;
                      const previewGrid = getPatternPreviewGrid(tpl.id, 'pz', puzzleType);
                      const gridSize = previewGrid.length;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          data-testid={`pattern-btn-${tpl.id}`}
                          aria-pressed={active}
                          disabled={isBusy}
                          title={tpl.description}
                          onClick={() => onApplyPattern(tpl.id)}
                          className="h-10 px-2 rounded-lg border flex items-center gap-2 text-left transition-colors disabled:opacity-45 cursor-pointer"
                          style={{
                            backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                            borderColor: active ? theme.ui.accent : theme.ui.border,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="w-6 h-6 rounded-[5px] p-[2px] grid gap-[1.5px] shrink-0 border"
                            style={{
                              gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
                              backgroundColor: hexNumberToCss(theme.scene.chassisColor),
                              borderColor: theme.ui.border,
                            }}
                          >
                            {previewGrid.flatMap((row, rIdx) =>
                              row.map((faceKey, cIdx) => (
                                <span
                                  key={`${rIdx}-${cIdx}`}
                                  className="rounded-[1.5px]"
                                  style={{
                                    backgroundColor: hexNumberToCss(theme.scene.faceColors[faceKey]),
                                  }}
                                />
                              ))
                            )}
                          </span>
                          <span className="min-w-0 flex-1 flex flex-col leading-tight">
                            <span
                              className="text-xs font-semibold truncate"
                              style={{ color: active ? theme.ui.accent : theme.ui.text }}
                            >
                              {tpl.name}
                            </span>
                            <span
                              className="text-[10px] truncate"
                              style={{ color: theme.ui.muted }}
                            >
                              {tpl.tag}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Figma Community & Custom Themes + Ambient Soundscapes */}
                <div className="grid grid-cols-1 gap-3.5 pt-2.5 border-t" style={{ borderColor: theme.ui.border }}>
                  {/* Studio & Custom Figma Themes */}
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-xs font-medium truncate" style={{ color: theme.ui.muted }}>
                        {t('dock.studioThemes')}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-testid="lab-export-snapshot-btn"
                          onClick={onExportSnapshot}
                          aria-label="Export high-resolution cube screenshot"
                          title="Export High-Res Cube PNG"
                          className="h-7 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.text,
                          }}
                        >
                          <Camera className="w-3 h-3 shrink-0" />
                          <span>PNG</span>
                        </button>
                        <button
                          type="button"
                          data-testid="open-palette-studio-btn"
                          onClick={onOpenPaletteStudio}
                          className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          style={{
                            backgroundColor: theme.ui.accentSoft,
                            color: theme.ui.accent,
                          }}
                        >
                          <Palette className="w-3 h-3 shrink-0" />
                          <span>{t('dock.stickers')}</span>
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 max-h-[126px] overflow-y-auto kubi-scroll pr-0.5">
                      {[...THEME_LIST, ...customThemes.map(buildThemePaletteFromCustom)].map((t) => {
                        const active = t.id === theme.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => onSelectTheme(t.id)}
                            aria-pressed={active}
                            className="h-9 px-2.5 rounded-lg border flex items-center gap-2 text-left transition-colors cursor-pointer"
                            style={{
                              backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                              borderColor: active ? theme.ui.accent : theme.ui.border,
                            }}
                          >
                            <span
                              className="w-4 h-4 rounded-md border shrink-0 flex items-center justify-center"
                              style={{
                                backgroundColor: t.ui.swatchPreview[0],
                                borderColor: theme.ui.border,
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: t.ui.swatchPreview[2] }}
                              />
                            </span>
                            <span
                              className="text-xs font-semibold truncate"
                              style={{ color: theme.ui.text }}
                            >
                              {t.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3D Spatial Mechanical Audio Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
                      <AudioLines
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: spatialAudioEnabled ? theme.ui.accent : theme.ui.muted }}
                      />
                      <span>{t('settings.spatialAudio')}</span>
                    </span>
                    <button
                      type="button"
                      data-testid="lab-spatial-audio-toggle"
                      aria-pressed={spatialAudioEnabled}
                      onClick={onToggleSpatialAudio}
                      className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors shrink-0"
                      style={{
                        backgroundColor: spatialAudioEnabled ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                        borderColor: spatialAudioEnabled ? theme.ui.accent : theme.ui.border,
                        color: spatialAudioEnabled ? theme.ui.accent : theme.ui.muted,
                      }}
                    >
                      {spatialAudioEnabled ? t('settings.spatialAudioOn') : t('settings.spatialAudioOff')}
                    </button>
                  </div>

                  {/* Ambient Focus Soundscapes */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
                        <Headphones className="w-3.5 h-3.5" style={{ color: soundscape !== 'off' ? theme.ui.accent : theme.ui.muted }} />
                        {t('dock.ambientSoundscapes')}
                      </span>
                      {soundscape !== 'off' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="range"
                            min={0.05}
                            max={1}
                            step={0.05}
                            value={ambientVolume}
                            onChange={(e) => onAmbientVolumeChange(parseFloat(e.target.value))}
                            aria-label="Ambient soundscape volume"
                            className="kubi-slider w-16"
                          />
                          <span className="font-mono-tabular text-[10px]" style={{ color: theme.ui.muted }}>
                            {Math.round(ambientVolume * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5" data-testid="dock-soundscapes-menu">
                      {AMBIENT_SOUNDSCAPES.map((scape) => {
                        const active = scape.id === soundscape;
                        const Icon =
                          scape.id === 'rainy'
                            ? CloudRain
                            : scape.id === 'lofi'
                              ? Music
                              : scape.id === 'whitenoise'
                                ? Waves
                                : VolumeX;
                        return (
                          <button
                            key={scape.id}
                            type="button"
                            data-testid={`soundscape-${scape.id}`}
                            aria-pressed={active}
                            onClick={() => onSelectSoundscape(scape.id)}
                            title={scape.description}
                            className="h-9 px-2.5 rounded-lg border flex items-center gap-1.5 text-left transition-colors cursor-pointer"
                            style={{
                              backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                              borderColor: active ? theme.ui.accent : theme.ui.border,
                              color: active ? theme.ui.accent : theme.ui.text,
                            }}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-xs font-semibold truncate">{scape.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* UI Language Selector */}
                <div
                  className="pt-2.5 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: theme.ui.border }}
                >
                  <label
                    htmlFor="lab-language-select"
                    className="text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                    style={{ color: theme.ui.muted }}
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: theme.ui.accent }} />
                    <span>{t('dock.language')}</span>
                  </label>
                  <select
                    id="lab-language-select"
                    data-testid="lab-language-select"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as SupportedLocale)}
                    aria-label={t('dock.language')}
                    className="h-8 px-2.5 rounded-lg border text-xs font-semibold outline-none cursor-pointer"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  >
                    {SUPPORTED_LOCALES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.nativeName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Compact Move Algorithms Strip */}
                <div className="flex items-center gap-1.5 pt-2 border-t overflow-x-auto kubi-scroll-x" style={{ borderColor: theme.ui.border }}>
                  <span className="text-[11px] font-medium shrink-0 mr-1" style={{ color: theme.ui.muted }}>
                    {t('dock.algorithms')}
                  </span>
                  {presets.slice(0, 4).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={isBusy}
                      onClick={() => onRunAlgorithm(preset.notation)}
                      title={preset.description}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4. DEEP-THINKING SOLVE COACH TAB */}
            {activeTab === 'coach' && (
              <div className="flex flex-col gap-2.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitCoachQuestion(coachQuery);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={coachQuery}
                    onChange={(e) => setCoachQuery(e.target.value)}
                    placeholder={t('dock.coachPlaceholder')}
                    aria-label="Ask Solve Coach"
                    className="flex-1 h-10 px-3.5 rounded-xl border text-xs sm:text-sm outline-none"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  />
                  <button
                    type="submit"
                    disabled={coachLoading || !coachQuery.trim()}
                    aria-label="Send question to Solve Coach"
                    className="h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 disabled:opacity-45 cursor-pointer shrink-0"
                    style={{
                      backgroundColor: theme.ui.accent,
                      color: theme.ui.accentFg,
                    }}
                  >
                    {coachLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{t('dock.ask')}</span>
                  </button>
                </form>

                {/* Quick Prompt Triggers */}
                {!coachAnswer && !coachError && !coachLoading && (
                  <div className="flex items-center gap-1.5 overflow-x-auto kubi-scroll-x pb-0.5">
                    {COACH_PROMPTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setCoachQuery(q);
                          submitCoachQuestion(q);
                        }}
                        className="h-8 px-2.5 rounded-lg border text-xs whitespace-nowrap shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.muted,
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {coachLoading && (
                  <div className="text-xs py-2 flex items-center gap-2" style={{ color: theme.ui.muted }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: theme.ui.accent }} />
                    <span>{t('dock.coachThinking')}</span>
                  </div>
                )}

                {coachError && (
                  <div
                    role="alert"
                    className="text-xs p-2.5 rounded-xl border leading-relaxed"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.muted,
                    }}
                  >
                    {coachError}
                  </div>
                )}

                {coachAnswer && (
                  <div
                    className="text-xs sm:text-[13px] p-3 rounded-xl border leading-relaxed max-h-56 overflow-y-auto kubi-scroll whitespace-pre-wrap"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  >
                    {coachAnswer}
                  </div>
                )}
              </div>
            )}
          </div>
    </aside>
  );
};
