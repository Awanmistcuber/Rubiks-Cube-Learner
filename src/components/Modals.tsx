import React from 'react';
import {
  Award,
  BookOpen,
  CloudRain,
  Headphones,
  Home,
  Music,
  Palette,
  Play,
  RotateCcw,
  Shuffle,
  Trophy,
  VolumeX,
  Waves,
} from 'lucide-react';
import { AMBIENT_SOUNDSCAPES } from '../cube/audio';
import { PUZZLE_META } from '../cube/curriculum';
import { buildThemePaletteFromCustom, type CustomThemeRecord } from '../cube/customThemes';
import { THEME_LIST } from '../cube/themes';
import type { AmbientSoundscapeId, SolveSnapshot, ThemePalette } from '../cube/types';
import { formatTimer } from './TopHud';

interface PauseModalProps {
  theme: ThemePalette;
  customThemes: CustomThemeRecord[];
  soundscape: AmbientSoundscapeId;
  ambientVolume: number;
  onResume: () => void;
  onRestart: () => void;
  onSelectTheme: (themeKey: string) => void;
  onOpenPaletteStudio: () => void;
  onSelectSoundscape: (s: AmbientSoundscapeId) => void;
  onAmbientVolumeChange: (v: number) => void;
  onBackToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  theme,
  customThemes,
  soundscape,
  ambientVolume,
  onResume,
  onRestart,
  onSelectTheme,
  onOpenPaletteStudio,
  onSelectSoundscape,
  onAmbientVolumeChange,
  onBackToTitle,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.48)' }}
    >
      <div
        className="w-full max-w-sm max-h-[92vh] overflow-y-auto kubi-scroll rounded-2xl border p-6 animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        <h2
          id="pause-title"
          className="font-display text-2xl font-bold tracking-tight"
          style={{ color: theme.ui.text }}
        >
          Studio Paused
        </h2>
        <p className="text-xs sm:text-sm mt-1 mb-5" style={{ color: theme.ui.muted }}>
          Your cube state and solve timer are safely frozen.
        </p>

        {/* Quick Theme Switcher (Built-in + Custom Figma Palettes) */}
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
              Studio Theme
            </span>
            <button
              type="button"
              onClick={onOpenPaletteStudio}
              className="text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              style={{ color: theme.ui.accent }}
            >
              <Palette className="w-3 h-3" />
              <span>Custom Stickers</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto kubi-scroll pr-0.5">
            {[...THEME_LIST, ...customThemes.map(buildThemePaletteFromCustom)].map((t) => {
              const active = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTheme(t.id)}
                  className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 cursor-pointer"
                  style={{
                    backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                    borderColor: active ? theme.ui.accent : theme.ui.border,
                    color: theme.ui.text,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.ui.swatchPreview[2] }}
                  />
                  <span className="truncate">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ambient Soundscapes Settings */}
        <div className="mb-5 pt-3 border-t" style={{ borderColor: theme.ui.border }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: theme.ui.muted }}>
              <Headphones className="w-3.5 h-3.5" style={{ color: soundscape !== 'off' ? theme.ui.accent : theme.ui.muted }} />
              Ambient Soundscape
            </span>
            {soundscape !== 'off' && (
              <span className="font-mono-tabular text-[11px]" style={{ color: theme.ui.muted }}>
                {Math.round(ambientVolume * 100)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5" data-testid="settings-soundscapes-menu">
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
                  aria-pressed={active}
                  onClick={() => onSelectSoundscape(scape.id)}
                  className="h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                    borderColor: active ? theme.ui.accent : theme.ui.border,
                    color: active ? theme.ui.accent : theme.ui.text,
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{scape.shortLabel}</span>
                </button>
              );
            })}
          </div>
          {soundscape !== 'off' && (
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={ambientVolume}
              onChange={(e) => onAmbientVolumeChange(parseFloat(e.target.value))}
              aria-label="Ambient soundscape volume"
              className="kubi-slider w-full mt-2.5"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: theme.ui.accent,
              color: theme.ui.accentFg,
            }}
          >
            <Play className="w-4 h-4" />
            <span>Resume</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full h-10 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset Puzzle</span>
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="w-full h-10 rounded-xl border font-medium text-sm flex items-center justify-center gap-2 cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              borderColor: theme.ui.border,
              color: theme.ui.muted,
            }}
          >
            <Home className="w-4 h-4" />
            <span>Back to Title</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface VictoryModalProps {
  theme: ThemePalette;
  snapshot: SolveSnapshot;
  onPlayAgain: () => void;
  onOpenLessons: () => void;
  onOpenDailyLeaderboard?: () => void;
  onDismiss: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  theme,
  snapshot,
  onPlayAgain,
  onOpenLessons,
  onOpenDailyLeaderboard,
  onDismiss,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.45)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 sm:p-7 animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: theme.ui.accentSoft, color: theme.ui.accent }}
          >
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="victory-title"
              className="font-display text-2xl font-bold tracking-tight leading-tight"
              style={{ color: theme.ui.text }}
            >
              Cube Solved
            </h2>
            <p className="text-xs" style={{ color: theme.ui.muted }}>
              {PUZZLE_META[snapshot.puzzleType].label}
              {snapshot.isNewRecord ? ' · New Personal Best' : ''}
            </p>
          </div>
        </div>

        {/* 3 Mastery Stat Readouts */}
        <div
          className="grid grid-cols-3 gap-2 my-5 p-3 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
        >
          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              Clear Time
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.text }}>
              {formatTimer(snapshot.elapsedMs)}
            </div>
          </div>

          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              Moves
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.text }}>
              {snapshot.moves}
            </div>
          </div>

          <div>
            <div className="text-[11px]" style={{ color: theme.ui.muted }}>
              Best Time
            </div>
            <div className="font-mono-tabular text-base font-bold mt-0.5" style={{ color: theme.ui.accent }}>
              {snapshot.bestMs !== null ? formatTimer(snapshot.bestMs) : formatTimer(snapshot.elapsedMs)}
            </div>
          </div>
        </div>

        {snapshot.dailyChallenge && (
          <div
            className="mb-4 px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: theme.ui.accentSoft,
              borderColor: theme.ui.accent,
              color: theme.ui.text,
            }}
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Trophy className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
              Daily {snapshot.dailyChallenge.dateKey} Submitted
            </span>
            <span className="font-mono-tabular font-bold" style={{ color: theme.ui.accent }}>
              {snapshot.dailyChallenge.rank
                ? `Global #${snapshot.dailyChallenge.rank} of ${snapshot.dailyChallenge.totalParticipants}`
                : 'Recorded'}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {snapshot.dailyChallenge && onOpenDailyLeaderboard ? (
            <button
              type="button"
              onClick={onOpenDailyLeaderboard}
              className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Trophy className="w-4 h-4" />
              <span>View Global Leaderboard</span>
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="w-full h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Shuffle className="w-4 h-4" />
              <span>New Scramble</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenLessons}
              className="h-10 rounded-xl border font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <BookOpen className="w-4 h-4" />
              <span>Lessons</span>
            </button>

            <button
              type="button"
              onClick={onDismiss}
              className="h-10 rounded-xl border font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                borderColor: theme.ui.border,
                color: theme.ui.muted,
              }}
            >
              <span>Inspect Cube</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
