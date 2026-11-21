import React from 'react';
import { Keyboard, X } from 'lucide-react';
import type { PuzzleType, ThemePalette } from '../cube/types';

interface ShortcutsHelpOverlayProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  isBusy: boolean;
  onTryMove: (notation: string) => void;
  onClose: () => void;
}

const FACE_SHORTCUTS = [
  { key: 'U', label: 'Up (Top)' },
  { key: 'D', label: 'Down (Bottom)' },
  { key: 'L', label: 'Left Face' },
  { key: 'R', label: 'Right Face' },
  { key: 'F', label: 'Front Face' },
  { key: 'B', label: 'Back Face' },
] as const;

const SLICE_SHORTCUTS = [
  { key: 'M', label: 'Middle', hint: 'L dir' },
  { key: 'E', label: 'Equator', hint: 'D dir' },
  { key: 'S', label: 'Standing', hint: 'F dir' },
] as const;

const ROTATION_SHORTCUTS = [
  { key: 'x', label: 'Tilt X', hint: 'R dir' },
  { key: 'y', label: 'Spin Y', hint: 'U dir' },
  { key: 'z', label: 'Roll Z', hint: 'F dir' },
] as const;

export const ShortcutsHelpOverlay: React.FC<ShortcutsHelpOverlayProps> = ({
  theme,
  puzzleType,
  isBusy,
  onTryMove,
  onClose,
}) => {
  const is2x2 = puzzleType === '2x2';

  return (
    <aside
      role="region"
      aria-label="Keyboard shortcuts reference"
      data-testid="shortcuts-help-overlay"
      className="fixed top-[60px] sm:top-[72px] right-2 sm:right-5 z-30 w-[calc(100vw-16px)] max-w-[316px] max-h-[calc(100dvh-160px)] overflow-y-auto kubi-scroll rounded-2xl border p-3.5 animate-kubi-enter"
      style={{
        backgroundColor: theme.ui.surface,
        borderColor: theme.ui.border,
        boxShadow: theme.ui.shadow,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2 border-b" style={{ borderColor: theme.ui.border }}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
            <h2 className="font-display text-sm font-bold tracking-tight" style={{ color: theme.ui.text }}>
              Keyboard Shortcuts
            </h2>
          </div>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: theme.ui.muted }}>
            Hold <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>Shift</kbd> for prime (&apos;) · Click any key to turn
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="close-shortcuts-btn"
          aria-label="Close keyboard shortcuts"
          className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
            color: theme.ui.muted,
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1. Outer Faces */}
      <div className="py-2 border-b" style={{ borderColor: theme.ui.border }}>
        <div className="text-[11px] font-semibold mb-1.5" style={{ color: theme.ui.muted }}>
          Outer Faces
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {FACE_SHORTCUTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              disabled={isBusy}
              onClick={() => onTryMove(key)}
              aria-label={`Try ${key} (${label})`}
              className="h-8 px-2 rounded-lg border flex items-center gap-2 text-left transition-transform duration-150 active:scale-[0.98] disabled:opacity-45 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
              }}
            >
              <kbd
                className="w-5 h-5 rounded border font-mono-tabular text-[11px] font-bold flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor: theme.ui.border,
                  color: theme.ui.text,
                }}
              >
                {key}
              </kbd>
              <span className="text-xs font-medium truncate" style={{ color: theme.ui.text }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Center Slices (M, E, S) */}
      <div className="py-2 border-b" style={{ borderColor: theme.ui.border }}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-semibold" style={{ color: theme.ui.muted }}>
            Center Slices
          </span>
          {is2x2 && (
            <span className="text-[10px]" style={{ color: theme.ui.muted }}>
              3×3 &amp; 4×4 only
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {SLICE_SHORTCUTS.map(({ key, label, hint }) => (
            <button
              key={key}
              type="button"
              disabled={isBusy || is2x2}
              onClick={() => onTryMove(key)}
              aria-label={`Try ${key} (${label})`}
              className="py-1.5 px-1.5 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-[0.98] disabled:opacity-40 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
              }}
            >
              <kbd
                className="font-mono-tabular text-xs font-bold leading-none"
                style={{ color: theme.ui.accent }}
              >
                {key}
              </kbd>
              <span className="text-[11px] font-medium leading-tight" style={{ color: theme.ui.text }}>
                {label}
              </span>
              <span className="text-[10px] leading-tight" style={{ color: theme.ui.muted }}>
                {hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Whole-Cube Rotations (x, y, z) */}
      <div className="py-2 border-b" style={{ borderColor: theme.ui.border }}>
        <div className="text-[11px] font-semibold mb-1.5" style={{ color: theme.ui.muted }}>
          Cube Rotations
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ROTATION_SHORTCUTS.map(({ key, label, hint }) => (
            <button
              key={key}
              type="button"
              disabled={isBusy}
              onClick={() => onTryMove(key)}
              aria-label={`Try ${key} (${label})`}
              className="py-1.5 px-1.5 rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-transform duration-150 active:scale-[0.98] disabled:opacity-45 cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
              }}
            >
              <kbd
                className="font-mono-tabular text-xs font-bold leading-none"
                style={{ color: theme.ui.text }}
              >
                {key}
              </kbd>
              <span className="text-[11px] font-medium leading-tight" style={{ color: theme.ui.text }}>
                {label}
              </span>
              <span className="text-[10px] leading-tight" style={{ color: theme.ui.muted }}>
                {hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Studio Controls Footer */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 text-[11px]" style={{ color: theme.ui.muted }}>
        <span>
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>Ctrl+Z</kbd> /{' '}
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>⌫</kbd> Undo
        </span>
        <span>
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>T</kbd> Timer
        </span>
        <span>
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>V</kbd> Mute
        </span>
        <span>
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>H</kbd> Dock
        </span>
        <span>
          <kbd className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>?</kbd> Help
        </span>
      </div>
    </aside>
  );
};
