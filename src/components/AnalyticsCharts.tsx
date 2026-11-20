import React, { useState } from 'react';
import { PUZZLE_META } from '../cube/curriculum';
import {
  formatPreciseTime,
  formatRecordTime,
  type HistogramBin,
  type Last20Analytics,
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

interface Last20MoveTimeChartProps {
  theme: ThemePalette;
  analytics: Last20Analytics;
  puzzleLabel: string;
  onStartSolve?: () => void;
  onRestoreDemo?: () => void;
}

export const Last20MoveTimeChart: React.FC<Last20MoveTimeChartProps> = ({
  theme,
  analytics,
  puzzleLabel,
  onStartSolve,
  onRestoreDemo,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [showTime, setShowTime] = useState(true);
  const [showMoves, setShowMoves] = useState(true);

  const { points } = analytics;
  const hasAnyTime = analytics.validTimeCount > 0;
  const hasAnyMoves = analytics.solvesWithMovesCount > 0;

  if (points.length === 0 || (!hasAnyTime && !hasAnyMoves)) {
    return (
      <div
        data-testid="analytics-line-chart-empty"
        className="rounded-xl border p-8 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
      >
        <p className="text-sm font-semibold" style={{ color: theme.ui.text }}>
          No recent solves to chart for {puzzleLabel}
        </p>
        <p className="text-xs mt-1 mb-4 max-w-md" style={{ color: theme.ui.muted }}>
          Complete solves on the 3D Cube or Stopwatch to compare solve times and move counts across your last 20 solves.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onStartSolve && (
            <button
              type="button"
              onClick={onStartSolve}
              className="h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
              style={{ backgroundColor: theme.ui.accent, color: theme.ui.accentFg }}
            >
              Start First Solve
            </button>
          )}
          {onRestoreDemo && (
            <button
              type="button"
              onClick={onRestoreDemo}
              className="h-9 px-4 rounded-lg border text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              Load Sample Data
            </button>
          )}
        </div>
      </div>
    );
  }

  const width = 880;
  const height = 292;
  const padL = 60;
  const padR = 56;
  const padT = 26;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const validTimes = points.map((p) => p.effectiveMs).filter((v): v is number => v !== null);
  const validMoves = points.map((p) => p.moves).filter((v): v is number => v !== null);

  const rawMinTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
  const rawMaxTime = validTimes.length > 0 ? Math.max(...validTimes) : 10000;
  const timeSpan = Math.max(1500, rawMaxTime - rawMinTime);
  const minTime = Math.max(0, rawMinTime - timeSpan * 0.14);
  const maxTime = rawMaxTime + timeSpan * 0.14;

  const rawMinMoves = validMoves.length > 0 ? Math.min(...validMoves) : 0;
  const rawMaxMoves = validMoves.length > 0 ? Math.max(...validMoves) : 60;
  const moveSpan = Math.max(8, rawMaxMoves - rawMinMoves);
  const minMoves = Math.max(0, Math.floor(rawMinMoves - moveSpan * 0.16));
  const maxMoves = Math.ceil(rawMaxMoves + moveSpan * 0.16);

  const xFor = (idx: number) => {
    if (points.length === 1) return padL + plotW / 2;
    return padL + (idx / (points.length - 1)) * plotW;
  };

  const yForTime = (ms: number) => {
    const ratio = (ms - minTime) / Math.max(1, maxTime - minTime);
    return padT + plotH * (1 - ratio);
  };

  const yForMoves = (mv: number) => {
    const ratio = (mv - minMoves) / Math.max(1, maxMoves - minMoves);
    return padT + plotH * (1 - ratio);
  };

  const buildPath = (
    extractor: (idx: number) => number | null,
    yMapper: (val: number) => number
  ): string => {
    let d = '';
    let drawing = false;
    points.forEach((_, idx) => {
      const val = extractor(idx);
      if (val === null) {
        drawing = false;
        return;
      }
      const x = xFor(idx).toFixed(1);
      const y = yMapper(val).toFixed(1);
      d += drawing ? ` L ${x} ${y}` : ` M ${x} ${y}`;
      drawing = true;
    });
    return d.trim();
  };

  const timePath = showTime && hasAnyTime ? buildPath((i) => points[i].effectiveMs, yForTime) : '';
  const movesPath = showMoves && hasAnyMoves ? buildPath((i) => points[i].moves, yForMoves) : '';

  let timeAreaPath = '';
  if (timePath) {
    const validWithIdx = points
      .map((p, idx) => ({ p, idx }))
      .filter((item) => item.p.effectiveMs !== null);
    if (validWithIdx.length >= 2) {
      const first = validWithIdx[0];
      const last = validWithIdx[validWithIdx.length - 1];
      timeAreaPath =
        `${timePath} L ${xFor(last.idx).toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
        `L ${xFor(first.idx).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
    }
  }

  const timeColor = theme.ui.accent;
  const movesColor = theme.isDark ? '#2DD4BF' : '#0D9488';

  const gridRatios = [0, 0.33, 0.66, 1];
  const inspectedIdx = hoveredIdx !== null && points[hoveredIdx] ? hoveredIdx : points.length - 1;
  const inspected = points[inspectedIdx];

  const colWidth = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const toggleTime = () => {
    if (showTime && !showMoves) return;
    setShowTime((v) => !v);
  };

  const toggleMoves = () => {
    if (showMoves && !showTime) return;
    setShowMoves((v) => !v);
  };

  // Pick clean, non-overlapping X-axis tick indices
  const xTickIndices: number[] = [];
  if (points.length > 0) {
    const step = points.length <= 6 ? 1 : points.length <= 12 ? 2 : 4;
    for (let i = 0; i < points.length; i += step) {
      xTickIndices.push(i);
    }
    if (xTickIndices[xTickIndices.length - 1] !== points.length - 1) {
      xTickIndices.push(points.length - 1);
    }
  }

  return (
    <div
      data-testid="analytics-line-chart"
      className="rounded-xl border p-3.5 sm:p-4"
      style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
    >
      {/* Header + Live Inspected Readout + Interactive Series Toggles */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 mb-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm sm:text-base font-semibold" style={{ color: theme.ui.text }}>
            Solve Time &amp; Move Count — Last {points.length} {points.length === 1 ? 'Solve' : 'Solves'}
          </h3>
          <p
            data-testid="analytics-inspected-readout"
            className="text-xs font-mono-tabular mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
            style={{ color: theme.ui.muted }}
          >
            <span>Solve #{inspected.overallSolveNumber}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: theme.ui.text }}>
              {formatRecordTime(inspected.record)}
            </span>
            <span aria-hidden="true">·</span>
            <span style={{ color: inspected.moves !== null ? movesColor : theme.ui.muted }}>
              {inspected.moves !== null ? `${inspected.moves} moves` : 'No moves logged'}
            </span>
            {inspected.tps !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span>{inspected.tps.toFixed(2)} TPS</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{inspected.record.source === 'virtual3d' ? '3D Cube' : 'Stopwatch'}</span>
          </p>
        </div>

        {/* Interactive Legend Series Toggles */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="toggle-series-time"
            aria-pressed={showTime}
            onClick={toggleTime}
            className="h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-opacity"
            style={{
              backgroundColor: showTime ? theme.ui.surface : 'transparent',
              borderColor: showTime ? timeColor : theme.ui.border,
              color: showTime ? theme.ui.text : theme.ui.muted,
              opacity: showTime ? 1 : 0.6,
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
              style={{ backgroundColor: timeColor }}
            />
            <span>Solve Time (s)</span>
          </button>

          <button
            type="button"
            data-testid="toggle-series-moves"
            aria-pressed={showMoves}
            onClick={toggleMoves}
            className="h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-opacity"
            style={{
              backgroundColor: showMoves ? theme.ui.surface : 'transparent',
              borderColor: showMoves ? movesColor : theme.ui.border,
              color: showMoves ? theme.ui.text : theme.ui.muted,
              opacity: showMoves ? 1 : 0.6,
            }}
          >
            <span
              className="w-2.5 h-2.5 inline-block shrink-0 rotate-45"
              style={{ backgroundColor: movesColor }}
            />
            <span>Move Count</span>
          </button>
        </div>
      </div>

      {/* Dual-Axis SVG Line Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block overflow-visible select-none"
        role="img"
        aria-label={`Dual-axis line chart of solve times and move counts over the last ${points.length} solves for ${puzzleLabel}`}
      >
        {/* Axis Titles */}
        {showTime && hasAnyTime && (
          <text
            x={padL - 8}
            y={11}
            textAnchor="end"
            fill={timeColor}
            fontSize="11"
            fontWeight="600"
            fontFamily="JetBrains Mono, monospace"
          >
            TIME
          </text>
        )}
        {showMoves && hasAnyMoves && (
          <text
            x={width - padR + 8}
            y={11}
            textAnchor="start"
            fill={movesColor}
            fontSize="11"
            fontWeight="600"
            fontFamily="JetBrains Mono, monospace"
          >
            MOVES
          </text>
        )}

        {/* Horizontal Gridlines & Left/Right Y-Axis Labels */}
        {gridRatios.map((ratio, idx) => {
          const y = padT + plotH * (1 - ratio);
          const timeVal = minTime + (maxTime - minTime) * ratio;
          const moveVal = Math.round(minMoves + (maxMoves - minMoves) * ratio);
          return (
            <g key={idx}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke={theme.ui.border}
                strokeWidth="1"
                strokeDasharray={idx === 0 ? undefined : '3 4'}
              />
              {showTime && hasAnyTime && (
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={theme.ui.muted}
                  fontSize="11.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatPreciseTime(timeVal)}
                </text>
              )}
              {showMoves && hasAnyMoves && (
                <text
                  x={width - padR + 8}
                  y={y + 4}
                  textAnchor="start"
                  fill={movesColor}
                  fontSize="11.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {moveVal}
                </text>
              )}
            </g>
          );
        })}

        {/* Vertical Crosshair Guide on Active/Hovered Solve */}
        <line
          x1={xFor(inspectedIdx)}
          y1={padT}
          x2={xFor(inspectedIdx)}
          y2={padT + plotH}
          stroke={theme.ui.border}
          strokeWidth="1.2"
          strokeDasharray="3 3"
        />

        {/* Subtle Area Fill under Solve Time */}
        {timeAreaPath && (
          <path
            d={timeAreaPath}
            fill={timeColor}
            fillOpacity={theme.isDark ? '0.10' : '0.07'}
          />
        )}

        {/* Solve Time Polyline */}
        {timePath && (
          <path
            data-testid="analytics-time-line"
            d={timePath}
            fill="none"
            stroke={timeColor}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Move Count Polyline */}
        {movesPath && (
          <path
            data-testid="analytics-moves-line"
            d={movesPath}
            fill="none"
            stroke={movesColor}
            strokeWidth="2.2"
            strokeDasharray={showTime ? '6 3' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive Column Hit Targets & Dual Series Markers */}
        {points.map((pt, idx) => {
          const cx = xFor(idx);
          const isActive = idx === inspectedIdx;
          const timeY = pt.effectiveMs !== null ? yForTime(pt.effectiveMs) : null;
          const moveY = pt.moves !== null ? yForMoves(pt.moves) : null;
          const hitX = Math.max(padL - 8, cx - colWidth / 2);
          const hitW = Math.max(20, colWidth);

          return (
            <g
              key={pt.record.id}
              data-testid={`analytics-point-${idx + 1}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setHoveredIdx(idx)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={hitX}
                y={padT}
                width={hitW}
                height={plotH}
                fill="transparent"
              />

              {/* Solve Time Circle Marker */}
              {showTime && timeY !== null && (
                <>
                  {pt.isBestTime && (
                    <circle
                      cx={cx}
                      cy={timeY}
                      r={isActive ? 8.5 : 7}
                      fill="none"
                      stroke={timeColor}
                      strokeWidth="1.4"
                      strokeOpacity="0.65"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={timeY}
                    r={isActive ? 5.2 : 3.6}
                    fill={timeColor}
                    stroke={theme.ui.surface}
                    strokeWidth="1.6"
                  />
                </>
              )}

              {/* DNF Indicator */}
              {showTime && pt.effectiveMs === null && (
                <circle
                  cx={cx}
                  cy={padT + 10}
                  r={isActive ? 4.8 : 3.4}
                  fill="#DC2626"
                  stroke={theme.ui.surface}
                  strokeWidth="1.5"
                />
              )}

              {/* Move Count Rotated Diamond Marker (distinct shape from Solve Time circle) */}
              {showMoves && moveY !== null && (
                <rect
                  x={cx - (isActive ? 4.6 : 3.4)}
                  y={moveY - (isActive ? 4.6 : 3.4)}
                  width={isActive ? 9.2 : 6.8}
                  height={isActive ? 9.2 : 6.8}
                  rx="1"
                  transform={`rotate(45 ${cx} ${moveY})`}
                  fill={movesColor}
                  stroke={theme.ui.surface}
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}

        {/* X-Axis Solve Number Labels */}
        {xTickIndices.map((idx) => {
          const pt = points[idx];
          const cx = xFor(idx);
          const anchor =
            idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={pt.record.id}
              x={cx}
              y={height - 8}
              textAnchor={anchor}
              fill={theme.ui.muted}
              fontSize="11.5"
              fontFamily="JetBrains Mono, monospace"
            >
              #{pt.overallSolveNumber}
            </text>
          );
        })}
      </svg>

      {!hasAnyMoves && (
        <p className="text-[11px] mt-2" style={{ color: theme.ui.muted }}>
          Tip: 3D Cube solves automatically track move counts. For physical Stopwatch solves, enter move counts in the table below to plot both lines together.
        </p>
      )}
    </div>
  );
};
