import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PUZZLE_META } from '../cube/curriculum';
import { THEME_LIST } from '../cube/themes';
import type { PuzzleType, ThemePalette } from '../cube/types';

interface TitleScreenProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  onSelectPuzzle: (p: PuzzleType) => void;
  onSelectTheme: (t: string) => void;
  onStart: () => void;
}

const PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];

export const TitleScreen: React.FC<TitleScreenProps> = ({
  theme,
  puzzleType,
  onSelectPuzzle,
  onSelectTheme,
  onStart,
}) => {
  const activeMeta = PUZZLE_META[puzzleType];

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between px-4 sm:px-8 lg:px-12 kubi-safe-top kubi-safe-bottom">
      {/* Top minimal theme swatches — right aligned, zero navbar chrome */}
      <div className="flex items-center justify-end pointer-events-none">
        <div
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-xl border"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
          }}
        >
          <span className="text-xs font-medium pr-1" style={{ color: theme.ui.muted }}>
            Theme
          </span>
          {THEME_LIST.map((t) => {
            const active = t.id === theme.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                aria-label={`Select ${t.name} theme`}
                aria-pressed={active}
                title={t.name}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: t.ui.swatchPreview[0],
                  border: active ? `2px solid ${theme.ui.accent}` : `1px solid ${theme.ui.border}`,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: t.ui.swatchPreview[2] }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Main focal lockup anchored over bottom space on portrait mobile/tablet, left calm space on landscape tablet/desktop */}
      <div className="mt-auto mb-3 lg:my-auto max-w-md w-full mx-auto lg:mx-0 pointer-events-none">
        <div
          className="pointer-events-auto rounded-2xl p-5 sm:p-7 border animate-kubi-enter max-h-[calc(100dvh-108px)] overflow-y-auto kubi-scroll"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
            boxShadow: theme.ui.shadow,
          }}
        >
          {/* Bespoke inline SVG Isometric Emblem + Wordmark Lockup */}
          <div className="flex items-center gap-3.5 mb-4">
            <svg
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              {/* Top diamond */}
              <polygon
                points="22,3 39,12.5 22,22 5,12.5"
                fill={theme.ui.accent}
                stroke={theme.ui.text}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              {/* Left facet */}
              <polygon
                points="5,12.5 22,22 22,41 5,31.5"
                fill={theme.ui.surfaceSubtle}
                stroke={theme.ui.text}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              {/* Right facet */}
              <polygon
                points="39,12.5 22,22 22,41 39,31.5"
                fill={theme.ui.text}
                fillOpacity="0.14"
                stroke={theme.ui.text}
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              {/* Precision internal cube cut lines */}
              <path
                d="M13.5 7.75L30.5 17.25M30.5 7.75L13.5 17.25M13.5 17.25V36.25M30.5 17.25V36.25M5 22L22 31.5L39 22"
                stroke={theme.ui.text}
                strokeWidth="1.1"
                strokeOpacity="0.45"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <h1
                className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-none"
                style={{ color: theme.ui.text, textWrap: 'balance' }}
              >
                Kubi Studio
              </h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: theme.ui.muted }}>
                Interactive 3D Twist Puzzle Lab
              </p>
            </div>
          </div>

          <p
            className="text-sm sm:text-[15px] leading-relaxed mb-5"
            style={{ color: theme.ui.muted }}
          >
            Learn to solve 2×2, 3×3, 4×4, and Mirror cubes step by step with magnetic 3D physics,
            visual layer guides, and exploded-core inspection.
          </p>

          {/* Interactive Puzzle Preview Selector */}
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium" style={{ color: theme.ui.text }}>
                Select Puzzle
              </span>
              <span style={{ color: theme.ui.muted }}>
                {activeMeta.difficulty} · {activeMeta.pieces}
              </span>
            </div>
            <div
              className="grid grid-cols-4 gap-1.5 p-1 rounded-xl border"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
              }}
            >
              {PUZZLES.map((p) => {
                const isSelected = p === puzzleType;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSelectPuzzle(p)}
                    aria-pressed={isSelected}
                    className="h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 whitespace-nowrap focus-visible:outline-2"
                    style={{
                      backgroundColor: isSelected ? theme.ui.surface : 'transparent',
                      color: isSelected ? theme.ui.text : theme.ui.muted,
                      boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {PUZZLE_META[p].shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Start CTA */}
          <button
            type="button"
            data-start="true"
            onClick={onStart}
            className="w-full h-12 px-6 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-transform duration-150 active:scale-[0.985] hover:brightness-105 cursor-pointer"
            style={{
              backgroundColor: theme.ui.accent,
              color: theme.ui.accentFg,
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.14)',
            }}
          >
            <span>Start Studio</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Single flat, borderless inline control hint line in bottom safe margin */}
      <div className="flex items-center justify-center lg:justify-start pointer-events-none text-center lg:text-left">
        <p
          className="text-[11px] sm:text-xs tracking-wide font-medium"
          style={{ color: theme.ui.muted }}
        >
          <span className="lg:hidden">Swipe Cube to Turn · Drag Space to Orbit · Pinch to Zoom</span>
          <span className="hidden lg:inline">
            Drag Cube to Turn · Drag Space to Orbit · U D L R F B Keys · Enter to Start
          </span>
        </p>
      </div>
    </div>
  );
};
