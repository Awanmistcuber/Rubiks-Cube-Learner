import React from 'react';
import {
  BarChart3,
  Camera,
  Keyboard,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PUZZLE_META } from '../cube/curriculum';
import type { PuzzleType, ThemePalette } from '../cube/types';

interface TopHudProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  moveCount: number;
  elapsedMs: number;
  isSolved: boolean;
  hasScrambled: boolean;
  activeDailyDateKey?: string | null;
  isMuted: boolean;
  dockCollapsed: boolean;
  shortcutsOpen: boolean;
  onSelectPuzzle: (p: PuzzleType) => void;
  onOpenStopwatch: () => void;
  onOpenDashboard: () => void;
  onExportSnapshot: () => void;
  onResetCamera: () => void;
  onToggleMute: () => void;
  onToggleDock: () => void;
  onToggleShortcuts: () => void;
  onPause: () => void;
}

const PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];

export function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export const TopHud: React.FC<TopHudProps> = ({
  theme,
  puzzleType,
  moveCount,
  elapsedMs,
  isSolved,
  hasScrambled,
  activeDailyDateKey,
  isMuted,
  dockCollapsed,
  shortcutsOpen,
  onSelectPuzzle,
  onOpenStopwatch,
  onOpenDashboard,
  onExportSnapshot,
  onResetCamera,
  onToggleMute,
  onToggleDock,
  onToggleShortcuts,
  onPause,
}) => {
  const statusLabel = activeDailyDateKey
    ? `Daily · ${activeDailyDateKey}`
    : isSolved
      ? hasScrambled
        ? 'Solved'
        : 'Ready'
      : 'In Progress';

  return (
    <header
      data-testid="studio-top-hud"
      className="relative z-20 shrink-0 w-full border-b px-2.5 sm:px-3.5 lg:px-4 pb-1.5 sm:pb-2 kubi-safe-top flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-1.5 sm:gap-2"
      style={{
        backgroundColor: theme.ui.surface,
        borderColor: theme.ui.border,
      }}
    >
      {/* Row 1 (Mobile) / Left Cluster (sm+): Puzzle Selector + Tabular Stats */}
      <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 min-w-0 shrink-0">
        {/* Puzzle Type Switcher */}
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-xl border shrink-0"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          {PUZZLES.map((p) => {
            const active = p === puzzleType;
            return (
              <button
                key={p}
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectPuzzle(p);
                }}
                aria-label={`Switch to ${PUZZLE_META[p].label}`}
                aria-pressed={active}
                className="h-7 sm:h-8 px-2 max-[380px]:px-1.5 sm:px-2 lg:px-2.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: active ? theme.ui.accent : 'transparent',
                  color: active ? theme.ui.accentFg : theme.ui.muted,
                }}
              >
                {PUZZLE_META[p].shortLabel}
              </button>
            );
          })}
        </div>

        {/* Desktop/Tablet Inline Numeric Readouts — shrink-0 prevents Time 00:00.0 from ever clipping or overlapping */}
        <div
          data-testid="hud-stats-box"
          className="hidden sm:flex items-center gap-2 lg:gap-3 px-2.5 lg:px-3 py-1.5 rounded-xl border shrink-0 whitespace-nowrap"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          <div className="flex items-baseline gap-1 lg:gap-1.5 shrink-0">
            <span className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
              Moves
            </span>
            <span
              className="font-mono-tabular text-xs lg:text-sm font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="move-count-desktop"
            >
              {moveCount}
            </span>
          </div>

          <span className="w-px h-3.5 shrink-0" style={{ backgroundColor: theme.ui.border }} aria-hidden="true" />

          <div className="flex items-baseline gap-1 lg:gap-1.5 shrink-0">
            <span className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
              Time
            </span>
            <span
              className="font-mono-tabular text-xs lg:text-sm font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="timer-display-desktop"
            >
              {formatTimer(elapsedMs)}
            </span>
          </div>

          <span className="hidden lg:inline-block w-px h-3.5 shrink-0" style={{ backgroundColor: theme.ui.border }} aria-hidden="true" />

          <span
            className="hidden lg:inline text-xs font-medium whitespace-nowrap shrink-0"
            style={{ color: activeDailyDateKey || isSolved ? theme.ui.accent : theme.ui.muted }}
            data-testid="solve-status-desktop"
          >
            {statusLabel}
          </span>
        </div>

        {/* Mobile Compact Right Utility Icons (Row 1) */}
        <div className="flex sm:hidden items-center gap-1 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenStopwatch();
            }}
            aria-label="Open Speedcube Stopwatch"
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: theme.ui.accentSoft,
              borderColor: theme.ui.border,
              color: theme.ui.accent,
            }}
          >
            <Timer className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenDashboard();
            }}
            aria-label="Open Timing Dashboard and Graphs"
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <BarChart3 className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: isMuted ? theme.ui.muted : theme.ui.text,
            }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleShortcuts();
            }}
            aria-label={shortcutsOpen ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts'}
            aria-pressed={shortcutsOpen}
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: shortcutsOpen ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
              borderColor: shortcutsOpen ? theme.ui.accent : theme.ui.border,
              color: shortcutsOpen ? theme.ui.accent : theme.ui.text,
            }}
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause studio"
            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Row 2: Compact Moves / Time / Status + Quick Camera Reset & Panel Toggle */}
      <div className="flex sm:hidden items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[11px]" style={{ color: theme.ui.muted }}>
              Moves
            </span>
            <span
              className="font-mono-tabular text-xs font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="move-count"
            >
              {moveCount}
            </span>
          </div>
          <span className="w-px h-3" style={{ backgroundColor: theme.ui.border }} aria-hidden="true" />
          <div className="flex items-baseline gap-1">
            <span className="text-[11px]" style={{ color: theme.ui.muted }}>
              Time
            </span>
            <span
              className="font-mono-tabular text-xs font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="timer-display"
            >
              {formatTimer(elapsedMs)}
            </span>
          </div>
          <span
            className="text-[11px] font-medium truncate"
            style={{ color: activeDailyDateKey || isSolved ? theme.ui.accent : theme.ui.muted }}
            data-testid="solve-status"
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCamera();
            }}
            aria-label="Reset camera view"
            title="Reset camera view"
            className="h-7 w-7 rounded-lg border flex items-center justify-center cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            aria-label={dockCollapsed ? 'Show controls panel' : 'Hide controls panel'}
            className="h-7 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: dockCollapsed ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
              borderColor: dockCollapsed ? theme.ui.accent : theme.ui.border,
              color: dockCollapsed ? theme.ui.accent : theme.ui.text,
            }}
          >
            {dockCollapsed ? (
              <>
                <PanelRightOpen className="w-3.5 h-3.5" />
                <span>Show</span>
              </>
            ) : (
              <>
                <PanelRightClose className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Desktop/Tablet Right Cluster: Icon-only Stopwatch/Stats on tablet (640px-1023px), labeled at lg+ */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0 ml-auto">
        <div
          data-testid="hud-timer-cluster"
          className="flex items-center gap-0.5 p-0.5 rounded-xl border shrink-0"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenStopwatch();
            }}
            aria-label="Open Speedcube Stopwatch"
            title="Stopwatch & Scrambles (T)"
            className="h-8 px-2 lg:px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: theme.ui.accentSoft,
              color: theme.ui.accent,
            }}
          >
            <Timer className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Stopwatch</span>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenDashboard();
            }}
            aria-label="Open Timing Dashboard and Graphs"
            title="Timing Dashboard & Graphs"
            className="h-8 px-2 lg:px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Stats</span>
          </button>
        </div>

        <div
          className="flex items-center gap-0.5 p-0.5 rounded-xl border shrink-0"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-export-snapshot-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onExportSnapshot();
            }}
            aria-label="Export high-resolution cube screenshot"
            title="Export High-Res Cube PNG"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <Camera className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCamera();
            }}
            aria-label="Reset camera view"
            title="Reset camera view"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
            title={isMuted ? 'Unmute audio (V)' : 'Mute audio (V)'}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: isMuted ? theme.ui.muted : theme.ui.text }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="toggle-shortcuts-btn"
            aria-pressed={shortcutsOpen}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleShortcuts();
            }}
            aria-label={shortcutsOpen ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts'}
            title="Keyboard shortcuts (?)"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{
              backgroundColor: shortcutsOpen ? theme.ui.accentSoft : 'transparent',
              color: shortcutsOpen ? theme.ui.accent : theme.ui.text,
            }}
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="hud-toggle-panel-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            aria-label={dockCollapsed ? 'Show studio controls panel' : 'Hide studio controls panel'}
            title={dockCollapsed ? 'Show controls (H)' : 'Hide controls (H)'}
            className="h-8 px-1.5 xl:px-2 rounded-lg flex items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: dockCollapsed ? theme.ui.accentSoft : 'transparent',
              color: dockCollapsed ? theme.ui.accent : theme.ui.text,
            }}
          >
            {dockCollapsed ? (
              <>
                <PanelRightOpen className="w-4 h-4" />
                <span className="hidden xl:inline">Show</span>
              </>
            ) : (
              <>
                <PanelRightClose className="w-4 h-4" />
                <span className="hidden xl:inline">Hide</span>
              </>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause studio"
            title="Pause (Esc or P)"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
