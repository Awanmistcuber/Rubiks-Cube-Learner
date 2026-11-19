import type { PuzzleType } from './types';

export type SolvePenalty = 'none' | '+2' | 'dnf';

export interface SolveRecord {
  id: string;
  puzzleType: PuzzleType;
  timeMs: number;
  penalty: SolvePenalty;
  scramble: string;
  source: 'stopwatch' | 'virtual3d';
  moves?: number;
  timestamp: number;
}

export interface ProgressionPoint {
  index: number;
  effectiveMs: number | null;
  ao5Ms: number | null;
  ao12Ms: number | null;
  isPB: boolean;
  record: SolveRecord;
}

export interface HistogramBin {
  label: string;
  minMs: number;
  maxMs: number;
  count: number;
}

export interface SessionStats {
  totalCount: number;
  validCount: number;
  dnfCount: number;
  bestSingleMs: number | null;
  worstSingleMs: number | null;
  sessionMeanMs: number | null;
  currentAo5Ms: number | null;
  bestAo5Ms: number | null;
  currentAo12Ms: number | null;
  bestAo12Ms: number | null;
  trendDeltaMs: number | null;
  series: ProgressionPoint[];
  histogram: HistogramBin[];
}

export function getEffectiveTimeMs(record: Pick<SolveRecord, 'timeMs' | 'penalty'>): number | null {
  if (record.penalty === 'dnf') return null;
  return record.penalty === '+2' ? record.timeMs + 2000 : record.timeMs;
}

/**
 * Formats milliseconds into crisp WCA centisecond timing (e.g. "12.48", "1:04.22", "DNF", "—").
 */
export function formatPreciseTime(ms: number | null, fallback = '—'): string {
  if (ms === null || !Number.isFinite(ms)) return fallback;
  const clamped = Math.max(0, Math.round(ms));
  const totalCentis = Math.floor(clamped / 10);
  const centis = totalCentis % 100;
  const totalSec = Math.floor(totalCentis / 100);
  const secs = totalSec % 60;
  const mins = Math.floor(totalSec / 60);

  if (mins > 0) {
    return `${mins}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }
  return `${secs}.${String(centis).padStart(2, '0')}`;
}

export function formatRecordTime(record: Pick<SolveRecord, 'timeMs' | 'penalty'>): string {
  if (record.penalty === 'dnf') return 'DNF';
  const eff = getEffectiveTimeMs(record);
  const base = formatPreciseTime(eff);
  return record.penalty === '+2' ? `${base}+` : base;
}

/**
 * Computes WCA trimmed average of N (drops 1 best and 1 worst).
 * - If fewer than N solves, returns null.
 * - If 2 or more DNFs exist in the window, returns Infinity (signaling DNF average).
 * - If 1 DNF exists, it counts as the single dropped worst solve.
 */
export function computeWcaAverage(windowRecords: SolveRecord[], windowSize: number): number | null {
  if (windowRecords.length < windowSize) return null;
  const slice = windowRecords.slice(-windowSize);
  const values: number[] = [];
  let dnfs = 0;

  for (const r of slice) {
    const eff = getEffectiveTimeMs(r);
    if (eff === null) {
      dnfs++;
    } else {
      values.push(eff);
    }
  }

  if (dnfs >= 2) return Number.POSITIVE_INFINITY; // DNF average

  values.sort((a, b) => a - b);
  // Drop best (index 0) and worst (either the 1 DNF or highest numeric value)
  const trimmed = dnfs === 1 ? values.slice(1) : values.slice(1, values.length - 1);
  if (trimmed.length === 0) return null;

  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  return sum / trimmed.length;
}

export function computeHistogram(validTimes: number[], bucketCount = 6): HistogramBin[] {
  if (validTimes.length === 0) return [];
  const minVal = Math.min(...validTimes);
  const maxVal = Math.max(...validTimes);

  if (Math.abs(maxVal - minVal) < 250) {
    const startSec = Math.floor(minVal / 1000);
    return [
      {
        label: `${startSec}–${startSec + 1}s`,
        minMs: startSec * 1000,
        maxMs: (startSec + 1) * 1000,
        count: validTimes.length,
      },
    ];
  }

  const count = Math.min(bucketCount, Math.max(4, Math.ceil(Math.sqrt(validTimes.length) + 1)));
  const span = maxVal - minVal;
  const step = Math.max(500, Math.ceil(span / count / 500) * 500);
  const start = Math.floor(minVal / 500) * 500;

  const bins: HistogramBin[] = [];
  let cursor = start;
  while (cursor <= maxVal || bins.length < 4) {
    const next = cursor + step;
    const labelStart = (cursor / 1000).toFixed(step % 1000 === 0 ? 0 : 1);
    const labelEnd = (next / 1000).toFixed(step % 1000 === 0 ? 0 : 1);
    bins.push({
      label: `${labelStart}–${labelEnd}s`,
      minMs: cursor,
      maxMs: next,
      count: 0,
    });
    cursor = next;
    if (bins.length >= 8) break;
  }

  for (const t of validTimes) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      const isLast = i === bins.length - 1;
      if (t >= bins[i].minMs && (t < bins[i].maxMs || isLast)) {
        bins[i].count++;
        placed = true;
        break;
      }
    }
    if (!placed && bins.length > 0) {
      bins[bins.length - 1].count++;
    }
  }

  return bins;
}

/**
 * Computes complete session analytics, rolling Ao5/Ao12 series, PB tracking, and histogram bins.
 * Expects records in chronological order (oldest -> newest).
 */
export function computeSessionStats(records: SolveRecord[]): SessionStats {
  const ordered = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const validTimes: number[] = [];
  let dnfCount = 0;
  let runningBest: number | null = null;
  let bestAo5Ms: number | null = null;
  let bestAo12Ms: number | null = null;

  const series: ProgressionPoint[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const rec = ordered[i];
    const eff = getEffectiveTimeMs(rec);
    let isPB = false;

    if (eff === null) {
      dnfCount++;
    } else {
      validTimes.push(eff);
      if (runningBest === null || eff < runningBest) {
        runningBest = eff;
        isPB = true;
      }
    }

    const prefix = ordered.slice(0, i + 1);
    const ao5Raw = computeWcaAverage(prefix, 5);
    const ao12Raw = computeWcaAverage(prefix, 12);

    const ao5Ms = ao5Raw !== null && Number.isFinite(ao5Raw) ? ao5Raw : null;
    const ao12Ms = ao12Raw !== null && Number.isFinite(ao12Raw) ? ao12Raw : null;

    if (ao5Ms !== null && (bestAo5Ms === null || ao5Ms < bestAo5Ms)) {
      bestAo5Ms = ao5Ms;
    }
    if (ao12Ms !== null && (bestAo12Ms === null || ao12Ms < bestAo12Ms)) {
      bestAo12Ms = ao12Ms;
    }

    series.push({
      index: i + 1,
      effectiveMs: eff,
      ao5Ms,
      ao12Ms,
      isPB,
      record: rec,
    });
  }

  const bestSingleMs = validTimes.length > 0 ? Math.min(...validTimes) : null;
  const worstSingleMs = validTimes.length > 0 ? Math.max(...validTimes) : null;
  const sessionMeanMs =
    validTimes.length > 0
      ? validTimes.reduce((acc, v) => acc + v, 0) / validTimes.length
      : null;

  const currentAo5Raw = computeWcaAverage(ordered, 5);
  const currentAo12Raw = computeWcaAverage(ordered, 12);

  // Trend delta: average of last 3 valid solves minus first 3 valid solves (negative = faster)
  let trendDeltaMs: number | null = null;
  if (validTimes.length >= 6) {
    const early = validTimes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const recent = validTimes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    trendDeltaMs = recent - early;
  }

  return {
    totalCount: ordered.length,
    validCount: validTimes.length,
    dnfCount,
    bestSingleMs,
    worstSingleMs,
    sessionMeanMs,
    currentAo5Ms:
      currentAo5Raw !== null && Number.isFinite(currentAo5Raw) ? currentAo5Raw : null,
    bestAo5Ms,
    currentAo12Ms:
      currentAo12Raw !== null && Number.isFinite(currentAo12Raw) ? currentAo12Raw : null,
    bestAo12Ms,
    trendDeltaMs,
    series,
    histogram: computeHistogram(validTimes),
  };
}

/**
 * Generates an official-style WCA scramble notation string for any puzzle configuration.
 * Avoids consecutive same-face moves and redundant parallel-axis cancellations (e.g. R L R).
 */
export function generateWcaScrambleString(puzzleType: PuzzleType, seed?: number): string {
  const config: Record<PuzzleType, { length: number; faces: string[] }> = {
    '2x2': { length: 10, faces: ['U', 'R', 'F'] },
    '3x3': { length: 20, faces: ['U', 'D', 'L', 'R', 'F', 'B'] },
    '4x4': { length: 28, faces: ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Rw', 'Fw'] },
    mirror: { length: 18, faces: ['U', 'D', 'L', 'R', 'F', 'B'] },
  };

  const { length, faces } = config[puzzleType];
  const modifiers = ['', "'", '2'];

  const faceAxis = (f: string): string => {
    const base = f[0];
    if (base === 'U' || base === 'D') return 'y';
    if (base === 'L' || base === 'R') return 'x';
    return 'z';
  };

  let state = seed ?? Math.floor(Math.random() * 2147483647) + 1;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };

  const out: string[] = [];
  let prevFace = '';
  let prevAxis = '';
  let prevPrevAxis = '';

  while (out.length < length) {
    const face = faces[Math.floor(rand() * faces.length)];
    const axis = faceAxis(face);
    if (face === prevFace) continue;
    if (axis === prevAxis && axis === prevPrevAxis) continue;
    // Prevent immediate opposite face repeat in 2-move cycle
    if (axis === prevAxis && out.length >= 2 && out[out.length - 2].startsWith(face[0])) continue;

    const mod = modifiers[Math.floor(rand() * modifiers.length)];
    out.push(`${face}${mod}`);
    prevPrevAxis = prevAxis;
    prevAxis = axis;
    prevFace = face;
  }

  return out.join(' ');
}

export function exportRecordsToCsv(records: SolveRecord[]): string {
  const header = ['Solve #', 'Puzzle', 'Effective Time (s)', 'Raw (ms)', 'Penalty', 'Source', 'Scramble', 'Timestamp'];
  const ordered = [...records].sort((a, b) => a.timestamp - b.timestamp);
  const rows = ordered.map((r, idx) => {
    const eff = getEffectiveTimeMs(r);
    const effSec = eff === null ? 'DNF' : (eff / 1000).toFixed(2);
    return [
      String(idx + 1),
      r.puzzleType,
      effSec,
      String(Math.round(r.timeMs)),
      r.penalty,
      r.source,
      `"${r.scramble.replace(/"/g, '""')}"`,
      new Date(r.timestamp).toISOString(),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

const STORAGE_KEY = 'kubi_solve_records_v1';

/**
 * Deterministic initial seed session so the analytics dashboard and graphs display
 * meaningful multi-cube progression immediately on first launch.
 */
export function createSeedRecords(): SolveRecord[] {
  const now = Date.now();
  const min = 60_000;

  const entries: { puzzle: PuzzleType; times: number[]; pen?: Record<number, SolvePenalty> }[] = [
    {
      puzzle: '3x3',
      times: [21840, 19620, 20410, 18290, 17450, 18910, 16820, 15940, 16310, 14860],
      pen: { 5: '+2' },
    },
    {
      puzzle: '2x2',
      times: [7420, 6810, 6190, 5840, 6320, 5180],
    },
    {
      puzzle: '4x4',
      times: [78400, 74210, 71890, 68540, 65120],
    },
    {
      puzzle: 'mirror',
      times: [49200, 44810, 41950, 38640],
    },
  ];

  const records: SolveRecord[] = [];
  let seed = 4201;

  for (const group of entries) {
    group.times.forEach((t, idx) => {
      seed += 137;
      records.push({
        id: `seed-${group.puzzle}-${idx + 1}`,
        puzzleType: group.puzzle,
        timeMs: t,
        penalty: group.pen?.[idx] ?? 'none',
        scramble: generateWcaScrambleString(group.puzzle, seed),
        source: 'stopwatch',
        timestamp: now - (30 - idx * 2) * min - (group.puzzle === '3x3' ? 0 : 120 * min),
      });
    });
  }

  return records;
}

export function loadSolveRecords(): SolveRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = createSeedRecords();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createSeedRecords();
    return parsed as SolveRecord[];
  } catch {
    return createSeedRecords();
  }
}

export function saveSolveRecords(records: SolveRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota restrictions
  }
}
