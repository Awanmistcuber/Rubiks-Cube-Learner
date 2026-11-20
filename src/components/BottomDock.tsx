import React, { useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Gamepad2,
  Headphones,
  Layers,
  Loader2,
  Music,
  Palette,
  Play,
  RotateCcw,
  Send,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  StepForward,
  Undo2,
  VolumeX,
  Wand2,
  Waves,
} from 'lucide-react';
import { AMBIENT_SOUNDSCAPES } from '../cube/audio';
import { ALGORITHM_PRESETS, CURRICULUM } from '../cube/curriculum';
import { buildThemePaletteFromCustom, type CustomThemeRecord } from '../cube/customThemes';
import { THEME_LIST } from '../cube/themes';
import type {
  AmbientSoundscapeId,
  CubeMove,
  DockTab,
  LessonStep,
  PuzzleType,
  ThemePalette,
} from '../cube/types';

interface BottomDockProps {
  theme: ThemePalette;
  customThemes: CustomThemeRecord[];
  soundscape: AmbientSoundscapeId;
  ambientVolume: number;
  puzzleType: PuzzleType;
  activeTab: DockTab;
  collapsed: boolean;
  isBusy: boolean;
  isSolved: boolean;
  canUndo: boolean;
  hintMove: CubeMove | null;
  explodeAmount: number;
  turnSpeed: number;
  activeLessonId: string;
  lessonStepIndex: number;
  recentNotations: string[];
  onSetTab: (tab: DockTab) => void;
  onToggleCollapse: () => void;
  onScramble: () => void;
  onUndo: () => void;
  onHint: () => void;
  onAutoSolve: () => void;
  onResetCube: () => void;
  onManualMove: (notation: string) => void;
  onExplodeChange: (v: number) => void;
  onSpeedChange: (v: number) => void;
  onSelectTheme: (themeKey: string) => void;
  onOpenPaletteStudio: () => void;
  onExportSnapshot: () => void;
  onSelectSoundscape: (s: AmbientSoundscapeId) => void;
  onAmbientVolumeChange: (v: number) => void;
  onRunAlgorithm: (notations: string[]) => void;
  onSelectLesson: (lesson: LessonStep) => void;
  onStageLesson: (lesson: LessonStep) => void;
  onStepLesson: (lesson: LessonStep) => void;
  onPlayLesson: (lesson: LessonStep) => void;
}

const FACE_KEYS = ['U', 'D', 'L', 'R', 'F', 'B'] as const;

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
  puzzleType,
  activeTab,
  collapsed,
  isBusy,
  isSolved,
  canUndo,
  hintMove,
  explodeAmount,
  turnSpeed,
  activeLessonId,
  lessonStepIndex,
  recentNotations,
  onSetTab,
  onToggleCollapse,
  onScramble,
  onUndo,
  onHint,
  onAutoSolve,
  onResetCube,
  onManualMove,
  onExplodeChange,
  onSpeedChange,
  onSelectTheme,
  onOpenPaletteStudio,
  onExportSnapshot,
  onSelectSoundscape,
  onAmbientVolumeChange,
  onRunAlgorithm,
  onSelectLesson,
  onStageLesson,
  onStepLesson,
  onPlayLesson,
}) => {
  const [counterClockwise, setCounterClockwise] = useState(false);
  const [coachQuery, setCoachQuery] = useState('');
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const lessons = CURRICULUM[puzzleType] ?? CURRICULUM['3x3'];
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0];
  const presets = ALGORITHM_PRESETS.filter((p) => p.puzzleTypes.includes(puzzleType));

  const submitCoachQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || coachLoading) return;
    setCoachLoading(true);
    setCoachError(null);
    setCoachAnswer(null);

    try {
      const res = await fetch('/api/coach/analyze', {
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

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 pointer-events-none flex flex-col items-center px-2.5 sm:px-4 kubi-safe-bottom">
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggleCollapse();
        }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand control dock' : 'Collapse control dock'}
        className="pointer-events-auto mb-1.5 h-8 px-3.5 rounded-t-xl rounded-b-lg border text-xs font-medium flex items-center gap-1.5 transition-transform duration-150 hover:brightness-95 cursor-pointer"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          color: theme.ui.muted,
          boxShadow: theme.ui.shadow,
        }}
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Unified Collapsible Bottom Control Dock */}
      {!collapsed && (
        <div
          className="pointer-events-auto w-full max-w-[820px] rounded-2xl border overflow-hidden animate-kubi-enter"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
          }}
        >
          {/* Dock Header Tabs */}
          <div
            className="flex items-center justify-between gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 border-b"
            style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surfaceSubtle }}
          >
            <div className="flex items-center gap-0.5 sm:gap-1 w-full sm:w-auto justify-between sm:justify-start" role="tablist" aria-label="Studio modes">
              {(
                [
                  { id: 'play', label: 'Play & Solve', shortLabel: 'Play', icon: Gamepad2 },
                  { id: 'learn', label: 'Learn', shortLabel: 'Learn', icon: BookOpen },
                  { id: 'lab', label: 'Lab & Themes', shortLabel: 'Lab', icon: SlidersHorizontal },
                  { id: 'coach', label: 'Solve Coach', shortLabel: 'Coach', icon: Sparkles },
                ] as const
              ).map(({ id, label, shortLabel, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSetTab(id)}
                    className="h-9 px-2.5 sm:px-3 rounded-lg text-xs sm:text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer flex-1 sm:flex-initial"
                    style={{
                      backgroundColor: active ? theme.ui.surface : 'transparent',
                      color: active ? theme.ui.text : theme.ui.muted,
                      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="sm:hidden">{shortLabel}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </div>

            {hintMove && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs pr-1 shrink-0">
                <Compass className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
                <span style={{ color: theme.ui.muted }}>Next</span>
                <span
                  className="font-mono-tabular font-semibold"
                  style={{ color: theme.ui.accent }}
                >
                  {hintMove.notation}
                </span>
              </div>
            )}
          </div>

          {/* Tab Panel Content — bounded height ensures landscape phones & small mobiles never clip TopHud */}
          <div className="p-2.5 sm:p-4 max-h-[54dvh] sm:max-h-[48dvh] overflow-y-auto kubi-scroll">
            {/* 1. PLAY & SOLVE TAB */}
            {activeTab === 'play' && (
              <div className="flex flex-col gap-2.5">
                {/* Action Row — Single clean horizontal strip on desktop, tablet, and compact 360px phones */}
                <div className="flex items-center justify-between gap-1 sm:gap-2">
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onScramble}
                      className="h-9 sm:h-10 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 sm:gap-1.5 transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.accent,
                        color: theme.ui.accentFg,
                      }}
                    >
                      <Shuffle className="w-3.5 h-3.5 shrink-0" />
                      <span>Scramble</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isSolved}
                      onClick={onHint}
                      className="h-9 sm:h-10 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium border flex items-center gap-1 sm:gap-1.5 transition-colors duration-150 disabled:opacity-45 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Compass className="w-3.5 h-3.5 shrink-0" style={{ color: theme.ui.accent }} />
                      <span className="sm:hidden">Hint</span>
                      <span className="hidden sm:inline">Step Hint</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isSolved}
                      onClick={onAutoSolve}
                      className="h-9 sm:h-10 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium border flex items-center gap-1 sm:gap-1.5 transition-colors duration-150 disabled:opacity-45 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Wand2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">Solve</span>
                      <span className="hidden sm:inline">Auto-Solve</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy || !canUndo}
                      onClick={onUndo}
                      aria-label="Undo last move"
                      className="h-9 sm:h-10 w-8 sm:w-auto sm:px-3 rounded-xl text-xs sm:text-sm font-medium border flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Undo</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={onResetCube}
                      aria-label="Reset cube to solved state"
                      className="h-9 sm:h-10 w-8 sm:w-auto sm:px-3 rounded-xl text-xs sm:text-sm font-medium border flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.muted,
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Reset</span>
                    </button>
                  </div>
                </div>

                {/* Touch-Friendly WCA Face Turn Pad — fits all 6 faces + direction cleanly on 390px */}
                <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t" style={{ borderColor: theme.ui.border }}>
                  <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto kubi-scroll-x py-0.5 flex-1">
                    {FACE_KEYS.map((face) => {
                      const notation = counterClockwise ? `${face}'` : face;
                      return (
                        <button
                          key={face}
                          type="button"
                          disabled={isBusy}
                          onClick={() => onManualMove(notation)}
                          aria-label={`Turn ${notation} face`}
                          className="min-w-[40px] sm:min-w-[44px] flex-1 sm:flex-initial h-10 px-1.5 sm:px-2.5 rounded-lg border font-mono-tabular text-xs sm:text-sm font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer shrink-0"
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
                    {puzzleType === '4x4' && (
                      <>
                        {(['Rw', 'Uw'] as const).map((wide) => {
                          const notation = counterClockwise ? `${wide}'` : wide;
                          return (
                            <button
                              key={wide}
                              type="button"
                              disabled={isBusy}
                              onClick={() => onManualMove(notation)}
                              aria-label={`Turn ${notation} wide layer`}
                              className="min-w-[44px] h-10 px-2 rounded-lg border font-mono-tabular text-xs font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-40 cursor-pointer shrink-0"
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
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCounterClockwise((prev) => !prev)}
                    aria-pressed={counterClockwise}
                    aria-label="Toggle clockwise or prime direction"
                    className="h-10 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: counterClockwise ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                      borderColor: counterClockwise ? theme.ui.accent : theme.ui.border,
                      color: counterClockwise ? theme.ui.accent : theme.ui.muted,
                    }}
                  >
                    <span className="sm:hidden">{counterClockwise ? "CCW '" : 'CW'}</span>
                    <span className="hidden sm:inline">{counterClockwise ? "Prime (')" : 'Clockwise'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. LEARN CURRICULUM TAB */}
            {activeTab === 'learn' && activeLesson && (
              <div className="flex flex-col gap-3">
                {/* Lesson Stage Selector */}
                <div className="flex items-center gap-1.5 overflow-x-auto kubi-scroll-x pb-0.5">
                  {lessons.map((lesson) => {
                    const selected = lesson.id === activeLesson.id;
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
                        0{lesson.stageNumber}. {lesson.title}
                      </button>
                    );
                  })}
                </div>

                {/* Active Lesson Details & Algorithm Strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <h3
                        className="font-display text-sm sm:text-base font-semibold truncate"
                        style={{ color: theme.ui.text }}
                      >
                        {activeLesson.title}
                      </h3>
                      <span className="text-xs shrink-0" style={{ color: theme.ui.muted }}>
                        Step {Math.min(lessonStepIndex, activeLesson.algorithm.length)}/{activeLesson.algorithm.length}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: theme.ui.muted }}>
                      {activeLesson.moveNotes?.[lessonStepIndex]
                        ? `Next: ${activeLesson.moveNotes[lessonStepIndex]} — ${activeLesson.tip}`
                        : activeLesson.goal}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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

                {/* Steppable WCA Notation Ribbon */}
                <div className="flex items-center gap-1.5 overflow-x-auto kubi-scroll pt-1">
                  {activeLesson.algorithm.map((token, idx) => {
                    const isCurrent = idx === lessonStepIndex;
                    const isDone = idx < lessonStepIndex;
                    return (
                      <span
                        key={`${activeLesson.id}-${idx}`}
                        className="font-mono-tabular text-xs font-semibold px-2.5 py-1.5 rounded-lg border shrink-0 transition-all duration-150"
                        style={{
                          backgroundColor: isCurrent
                            ? theme.ui.accent
                            : isDone
                              ? theme.ui.accentSoft
                              : theme.ui.surfaceSubtle,
                          borderColor: isCurrent || isDone ? theme.ui.accent : theme.ui.border,
                          color: isCurrent
                            ? theme.ui.accentFg
                            : isDone
                              ? theme.ui.accent
                              : theme.ui.text,
                        }}
                      >
                        {token}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. LAB & FIGMA THEMES TAB */}
            {activeTab === 'lab' && (
              <div className="flex flex-col gap-3.5">
                {/* Sliders Row: Exploded Core + Turn Speed */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-1.5" style={{ color: theme.ui.text }}>
                        <Layers className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
                        Exploded Core View
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
                      aria-label="Exploded Core View"
                      className="kubi-slider w-full"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium" style={{ color: theme.ui.text }}>
                        Animation Tempo
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
                      aria-label="Animation Tempo"
                      className="kubi-slider w-full"
                    />
                  </label>
                </div>

                {/* Figma Community & Custom Themes + Ambient Soundscapes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor: theme.ui.border }}>
                  {/* Studio & Custom Figma Themes */}
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-2">
                      <span className="text-xs font-medium truncate" style={{ color: theme.ui.muted }}>
                        Studio &amp; Custom Themes
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
                          <span>Stickers</span>
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

                  {/* Ambient Focus Soundscapes */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
                        <Headphones className="w-3.5 h-3.5" style={{ color: soundscape !== 'off' ? theme.ui.accent : theme.ui.muted }} />
                        Ambient Soundscapes
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

                {/* Compact Patterns & Algorithms Strip */}
                <div className="flex items-center gap-1.5 pt-2 border-t overflow-x-auto kubi-scroll-x" style={{ borderColor: theme.ui.border }}>
                  <span className="text-[11px] font-medium shrink-0 mr-1" style={{ color: theme.ui.muted }}>
                    Patterns
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
                    placeholder="Ask about algorithms, F2L intuition, parity, or your current cube..."
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
                    <span>Ask</span>
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
                    <span>Thinking through cube geometry and move theory...</span>
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
                    className="text-xs sm:text-[13px] p-3 rounded-xl border leading-relaxed max-h-32 overflow-y-auto kubi-scroll whitespace-pre-wrap"
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
        </div>
      )}
    </div>
  );
};
