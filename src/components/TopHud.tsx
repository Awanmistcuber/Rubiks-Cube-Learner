import React from 'react';
import { BarChart3, Camera, Eye, EyeOff, Keyboard, Pause, RotateCcw, Timer, Volume2, VolumeX } from 'lucide-react';
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
  return (
    <div className="fixed top-0 left-0 right-0 z-20 pointer-events-none px-2 sm:px-5 pb-2 kubi-safe-top flex items-start justify-between gap-1.5 sm:gap-2">
      {/* Top-Left Cluster: Compact Puzzle Selector + Unboxed Tabular Stats */}
      <div className="pointer-events-auto flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 min-w-0">
        <div
          className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
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
                className="h-8 sm:h-9 px-2 max-[380px]:px-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
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

        {/* Clean Unboxed Numeric Readouts (Zero Pills) */}
        <div
          className="flex items-center gap-3 px-3 sm:px-3.5 py-2 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
              Moves
            </span>
            <span
              className="font-mono-tabular text-sm sm:text-base font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="move-count"
            >
              {moveCount}
            </span>
          </div>

          <span className="w-px h-3.5" style={{ backgroundColor: theme.ui.border }} aria-hidden="true" />

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
              Time
            </span>
            <span
              className="font-mono-tabular text-sm sm:text-base font-semibold"
              style={{ color: theme.ui.text }}
              data-testid="timer-display"
            >
              {formatTimer(elapsedMs)}
            </span>
          </div>

          <span className="hidden md:inline-block w-px h-3.5" style={{ backgroundColor: theme.ui.border }} aria-hidden="true" />

          <span
            className="hidden md:inline text-xs font-medium"
            style={{ color: activeDailyDateKey || isSolved ? theme.ui.accent : theme.ui.muted }}
            data-testid="solve-status"
          >
            {activeDailyDateKey
              ? `Daily · ${activeDailyDateKey}`
              : isSolved
                ? hasScrambled
                  ? 'Solved'
                  : 'Ready'
                : 'In Progress'}
          </span>
        </div>
      </div>

      {/* Top-Right Cluster: Stopwatch/Dashboard Launcher + Square Tactile Utility Controls */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 shrink-0">
        <div
          className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
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
            className="h-8 sm:h-10 px-1.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: theme.ui.accentSoft,
              color: theme.ui.accent,
            }}
          >
            <Timer className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Stopwatch</span>
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
            className="h-8 sm:h-10 px-1.5 sm:px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Stats</span>
          </button>
        </div>

        <div
          className="flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
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
            className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-lg items-center justify-center transition-colors duration-150 cursor-pointer"
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
            className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-lg items-center justify-center transition-colors duration-150 cursor-pointer"
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
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: isMuted ? theme.ui.muted : theme.ui.text }}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            aria-label={dockCollapsed ? 'Show bottom controls' : 'Hide bottom controls'}
            title={dockCollapsed ? 'Show controls (H)' : 'Hide controls (H)'}
            className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-lg items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            {dockCollapsed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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
            className="w-7 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
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
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause studio"
            title="Pause (Esc or P)"
            className="w-7 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-colors duration-150 cursor-pointer"
            style={{ color: theme.ui.text }}
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
