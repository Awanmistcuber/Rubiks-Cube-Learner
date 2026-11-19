import React, { useState } from 'react';
import { PUZZLE_META } from '../cube/curriculum';
import {
  formatPreciseTime,
  formatRecordTime,
  type HistogramBin,
  type ProgressionPoint,
} from '../cube/timerStats';
import type { PuzzleType, ThemePalette } from '../cube/types';

interface ProgressionChartProps {
  theme: ThemePalette;
  series: ProgressionPoint[];
  puzzleLabel: string;
}

export const SolveProgressionChart: React.FC<ProgressionChartProps> = ({
  theme,
  series,
  puzzleLabel,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const validPoints = series.filter((p) => p.effectiveMs !== null);
  if (series.length === 0 || validPoints.length === 0) {
    return (
      <div
        className="h-56 rounded-xl border flex flex-col items-center justify-center text-center p-6"
        style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
      >
        <p className="text-sm font-medium" style={{ color: theme.ui.text }}>
          No timing trend yet for {puzzleLabel}
        </p>
        <p className="text-xs mt-1" style={{ color: theme.ui.muted }}>
          Complete solves in the Stopwatch or 3D Cube to plot your progression curve and rolling Ao5.
        </p>
      </div>
    );
  }

  const width = 860;
  const height = 240;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals: number[] = [];
  for (const p of series) {
    if (p.effectiveMs !== null) allVals.push(p.effectiveMs);
    if (p.ao5Ms !== null) allVals.push(p.ao5Ms);
    if (p.ao12Ms !== null) allVals.push(p.ao12Ms);
  }

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const span = Math.max(1500, rawMax - rawMin);
  const minY = Math.max(0, rawMin - span * 0.14);
  const maxY = rawMax + span * 0.14;

  const xFor = (idx: number) => {
    if (series.length === 1) return padL + plotW / 2;
    return padL + (idx / (series.length - 1)) * plotW;
  };

  const yFor = (ms: number) => {
    const ratio = (ms - minY) / Math.max(1, maxY - minY);
    return padT + plotH * (1 - ratio);
  };

  const buildPath = (extractor: (p: ProgressionPoint) => number | null): string => {
    let d = '';
    let drawing = false;
    series.forEach((p, idx) => {
      const val = extractor(p);
      if (val === null) {
        drawing = false;
        return;
      }
      const x = xFor(idx).toFixed(1);
      const y = yFor(val).toFixed(1);
      d += drawing ? ` L ${x} ${y}` : ` M ${x} ${y}`;
      drawing = true;
    });
    return d.trim();
  };

  const singlePath = buildPath((p) => p.effectiveMs);
  const ao5Path = buildPath((p) => p.ao5Ms);
  const ao12Path = buildPath((p) => p.ao12Ms);

  // Build subtle area fill under single times
  let areaPath = '';
  const validWithCoords = series
    .map((p, idx) => ({ p, idx }))
    .filter((item) => item.p.effectiveMs !== null);
  if (validWithCoords.length >= 2) {
    const first = validWithCoords[0];
    const last = validWithCoords[validWithCoords.length - 1];
    areaPath =
      `${singlePath} L ${xFor(last.idx).toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
      `L ${xFor(first.idx).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
  }

  // 4 clean horizontal gridlines
  const gridTicks = [0, 0.33, 0.66, 1].map((t) => {
    const ms = minY + (maxY - minY) * t;
    return { ms, y: yFor(ms) };
  });

  const inspected = hoveredIdx !== null ? series[hoveredIdx] : series[series.length - 1];
  const ao5Color = theme.isDark ? '#34D399' : '#0D9488';
  const ao12Color = theme.isDark ? '#FBBF24' : '#B45309';

  return (
    <div
      className="rounded-xl border p-3.5 sm:p-4"
      style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
    >
      {/* Header + Legend + Active Point Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-display text-sm font-semibold" style={{ color: theme.ui.text }}>
            Solve Time Progression
          </h3>
          <p className="text-xs" style={{ color: theme.ui.muted }}>
            {inspected
              ? `Solve #${inspected.index} · ${formatRecordTime(inspected.record)}${
                  inspected.ao5Ms !== null ? ` · Ao5 ${formatPreciseTime(inspected.ao5Ms)}` : ''
                }${inspected.isPB ? ' · Personal Best' : ''}`
              : 'Hover or tap any point to inspect'}
          </p>
        </div>

        <div className="flex items-center gap-3.5 text-[11px] font-medium" style={{ color: theme.ui.muted }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: theme.ui.accent }} />
            Single
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: ao5Color }} />
            Ao5
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: ao12Color }} />
            Ao12
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block overflow-visible"
        role="img"
        aria-label={`Solve time progression chart for ${puzzleLabel}`}
      >
        {/* Horizontal Gridlines & Y Labels */}
        {gridTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={tick.y}
              x2={width - padR}
              y2={tick.y}
              stroke={theme.ui.border}
              strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
            <text
              x={padL - 8}
              y={tick.y + 4}
              textAnchor="end"
              fill={theme.ui.muted}
              fontSize="12"
              fontFamily="JetBrains Mono, monospace"
            >
              {formatPreciseTime(tick.ms)}
            </text>
          </g>
        ))}

        {/* Area Fill */}
        {areaPath && (
          <path d={areaPath} fill={theme.ui.accent} fillOpacity={theme.isDark ? '0.11' : '0.08'} />
        )}

        {/* Single Times Line */}
        {singlePath && (
          <path
            d={singlePath}
            fill="none"
            stroke={theme.ui.accent}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Rolling Ao5 Trend Line */}
        {ao5Path && (
          <path
            d={ao5Path}
            fill="none"
            stroke={ao5Color}
            strokeWidth="2"
            strokeDasharray="5 3"
            strokeLinecap="round"
          />
        )}

        {/* Rolling Ao12 Trend Line */}
        {ao12Path && (
          <path
            d={ao12Path}
            fill="none"
            stroke={ao12Color}
            strokeWidth="1.6"
            strokeDasharray="2 3"
            strokeLinecap="round"
          />
        )}

        {/* Interactive Data Points */}
        {series.map((p, idx) => {
          const cx = xFor(idx);
          const cy = p.effectiveMs !== null ? yFor(p.effectiveMs) : padT + 10;
          const active = hoveredIdx === idx;
          return (
            <g
              key={p.record.id}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setHoveredIdx(idx)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              {p.isPB && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 8 : 6.5}
                  fill="none"
                  stroke={theme.ui.accent}
                  strokeWidth="1.5"
                  strokeOpacity="0.65"
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={active ? 5 : 3.5}
                fill={p.effectiveMs === null ? '#DC2626' : theme.ui.accent}
                stroke={theme.ui.surface}
                strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* X Axis Solve Index Labels */}
        {series.length > 0 && (
          <>
            <text
              x={padL}
              y={height - 6}
              fill={theme.ui.muted}
              fontSize="12"
              fontFamily="JetBrains Mono, monospace"
            >
              #1
            </text>
            {series.length > 2 && (
              <text
                x={padL + plotW / 2}
                y={height - 6}
                textAnchor="middle"
                fill={theme.ui.muted}
                fontSize="12"
                fontFamily="JetBrains Mono, monospace"
              >
                #{Math.ceil(series.length / 2)}
              </text>
            )}
            {series.length > 1 && (
              <text
                x={width - padR}
                y={height - 6}
                textAnchor="end"
                fill={theme.ui.muted}
                fontSize="12"
                fontFamily="JetBrains Mono, monospace"
              >
                #{series.length}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
};

interface DistributionChartProps {
  theme: ThemePalette;
  bins: HistogramBin[];
}

export const DistributionHistogramChart: React.FC<DistributionChartProps> = ({ theme, bins }) => {
  if (bins.length === 0) {
    return (
      <div
        className="rounded-xl border p-4 flex flex-col justify-center items-center h-52 text-center"
        style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
      >
        <p className="text-xs font-medium" style={{ color: theme.ui.muted }}>
          Time distribution appears after your first valid solve.
        </p>
      </div>
    );
  }

  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  return (
    <div
      className="rounded-xl border p-3.5 sm:p-4 flex flex-col justify-between h-full"
      style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
    >
      <div className="mb-3">
        <h3 className="font-display text-sm font-semibold" style={{ color: theme.ui.text }}>
          Time Distribution
        </h3>
        <p className="text-xs" style={{ color: theme.ui.muted }}>
          Solve frequency by speed bracket
        </p>
      </div>

      <div className="flex items-end gap-2 h-36 pt-4">
        {bins.map((bin, idx) => {
          const pct = Math.max(6, Math.round((bin.count / maxCount) * 100));
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
              <span
                className="font-mono-tabular text-[11px] font-semibold"
                style={{ color: bin.count > 0 ? theme.ui.text : theme.ui.muted }}
              >
                {bin.count}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full rounded-t-md transition-all duration-200"
                  style={{
                    height: `${bin.count === 0 ? 4 : pct}%`,
                    backgroundColor: bin.count > 0 ? theme.ui.accent : theme.ui.border,
                    opacity: bin.count > 0 ? 0.88 : 0.45,
                  }}
                />
              </div>
              <span
                className="font-mono-tabular text-[10px] truncate w-full text-center"
                style={{ color: theme.ui.muted }}
                title={bin.label}
              >
                {bin.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ComparisonRow {
  puzzleType: PuzzleType;
  count: number;
  bestMs: number | null;
  meanMs: number | null;
}

interface ComparisonChartProps {
  theme: ThemePalette;
  rows: ComparisonRow[];
  activePuzzle: PuzzleType;
  onSelectPuzzle: (p: PuzzleType) => void;
}

export const PuzzleComparisonChart: React.FC<ComparisonChartProps> = ({
  theme,
  rows,
  activePuzzle,
  onSelectPuzzle,
}) => {
  const maxMean = Math.max(
    1000,
    ...rows.map((r) => r.meanMs ?? r.bestMs ?? 0)
  );

  return (
    <div
      className="rounded-xl border p-3.5 sm:p-4 flex flex-col justify-between h-full"
      style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
    >
      <div className="mb-3">
        <h3 className="font-display text-sm font-semibold" style={{ color: theme.ui.text }}>
          All Configurations
        </h3>
        <p className="text-xs" style={{ color: theme.ui.muted }}>
          Personal best & mean across cube types
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const isCurrent = row.puzzleType === activePuzzle;
          const barPct = row.meanMs ? Math.max(8, Math.round((row.meanMs / maxMean) * 100)) : 0;
          const pbPct = row.bestMs ? Math.max(5, Math.round((row.bestMs / maxMean) * 100)) : 0;
          return (
            <button
              key={row.puzzleType}
              type="button"
              onClick={() => onSelectPuzzle(row.puzzleType)}
              className="text-left rounded-lg p-2 border transition-colors cursor-pointer"
              style={{
                backgroundColor: isCurrent ? theme.ui.surface : 'transparent',
                borderColor: isCurrent ? theme.ui.accent : theme.ui.border,
              }}
            >
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold" style={{ color: theme.ui.text }}>
                  {PUZZLE_META[row.puzzleType].label}
                </span>
                <span className="font-mono-tabular" style={{ color: theme.ui.muted }}>
                  PB <strong style={{ color: theme.ui.text }}>{formatPreciseTime(row.bestMs)}</strong>
                  {' · '}
                  Avg {formatPreciseTime(row.meanMs)}
                </span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden relative"
                style={{ backgroundColor: theme.ui.border }}
              >
                {barPct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: theme.ui.accent,
                      opacity: 0.35,
                    }}
                  />
                )}
                {pbPct > 0 && (
                  <div
                    className="h-full rounded-full absolute top-0 left-0"
                    style={{
                      width: `${pbPct}%`,
                      backgroundColor: theme.ui.accent,
                    }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
