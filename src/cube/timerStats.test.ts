import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLast20Analytics,
  computeSessionStats,
  computeWcaAverage,
  createSeedRecords,
  exportRecordsToCsv,
  formatPreciseTime,
  generateWcaScrambleString,
  getEffectiveTimeMs,
  type SolveRecord,
} from './timerStats';
import type { PuzzleType } from './types';

function makeRec(id: string, timeMs: number, penalty: 'none' | '+2' | 'dnf' = 'none', idx = 1): SolveRecord {
  return {
    id,
    puzzleType: '3x3',
    timeMs,
    penalty,
    scramble: "R U R' U'",
    source: 'stopwatch',
    timestamp: 1000 * idx,
  };
}

test('getEffectiveTimeMs handles none, +2 penalty, and DNF accurately', () => {
  assert.equal(getEffectiveTimeMs(makeRec('1', 12340, 'none')), 12340);
  assert.equal(getEffectiveTimeMs(makeRec('2', 12340, '+2')), 14340);
  assert.equal(getEffectiveTimeMs(makeRec('3', 12340, 'dnf')), null);
});

test('formatPreciseTime formats sub-minute, multi-minute, and null values cleanly', () => {
  assert.equal(formatPreciseTime(12480), '12.48');
  assert.equal(formatPreciseTime(64220), '1:04.22');
  assert.equal(formatPreciseTime(null, 'DNF'), 'DNF');
});

test('computeWcaAverage drops single best and single worst in Ao5', () => {
  // Times: 10s, 12s, 14s, 16s, 20s -> drops 10s and 20s -> mean of (12, 14, 16) = 14s
  const recs = [10000, 12000, 14000, 16000, 20000].map((t, i) => makeRec(String(i), t, 'none', i));
  assert.equal(computeWcaAverage(recs, 5), 14000);
});

test('computeWcaAverage counts 1 DNF as dropped worst and 2 DNFs as DNF average', () => {
  const oneDnf = [
    makeRec('1', 10000, 'none', 1),
    makeRec('2', 12000, 'none', 2),
    makeRec('3', 15000, 'none', 3),
    makeRec('4', 18000, 'none', 4),
    makeRec('5', 11000, 'dnf', 5),
  ];
  // Drops 10s (best) and DNF (worst) -> mean of (12, 15, 18) = 15s
  assert.equal(computeWcaAverage(oneDnf, 5), 15000);

  const twoDnfs = [...oneDnf.slice(0, 3), makeRec('4', 18000, 'dnf', 4), makeRec('5', 11000, 'dnf', 5)];
  assert.equal(computeWcaAverage(twoDnfs, 5), Number.POSITIVE_INFINITY);
});

test('computeSessionStats calculates PB, mean, Ao5, trend delta, and histogram totals', () => {
  const times = [20000, 19000, 18000, 16000, 15000, 14000];
  const recs = times.map((t, i) => makeRec(`r${i}`, t, 'none', i + 1));
  const stats = computeSessionStats(recs);

  assert.equal(stats.totalCount, 6);
  assert.equal(stats.validCount, 6);
  assert.equal(stats.bestSingleMs, 14000);
  assert.equal(stats.worstSingleMs, 20000);
  assert.equal(stats.sessionMeanMs, 17000);
  // Last 5: [19, 18, 16, 15, 14] -> drops 14 & 19 -> mean(15, 16, 18) = 16333.333...
  assert.ok(stats.currentAo5Ms !== null && Math.abs(stats.currentAo5Ms - 16333.333) < 1);
  // Trend: recent3 mean (15000) - early3 mean (19000) = -4000ms faster
  assert.equal(stats.trendDeltaMs, -4000);

  const histTotal = stats.histogram.reduce((sum, b) => sum + b.count, 0);
  assert.equal(histTotal, 6);
});

test('generateWcaScrambleString produces valid scrambles without consecutive duplicate faces', () => {
  const puzzles: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];
  for (const p of puzzles) {
    const scramble = generateWcaScrambleString(p, 999);
    const tokens = scramble.split(' ');
    assert.ok(tokens.length >= 10, `${p} scramble should have >= 10 moves`);
    for (let i = 1; i < tokens.length; i++) {
      const prevBase = tokens[i - 1].replace(/['2]/g, '');
      const currBase = tokens[i].replace(/['2]/g, '');
      assert.notEqual(prevBase, currBase, `No consecutive duplicate faces in ${p}: ${scramble}`);
    }
  }
});

test('exportRecordsToCsv serializes header and rows cleanly', () => {
  const csv = exportRecordsToCsv([makeRec('1', 15230, '+2', 1)]);
  assert.ok(csv.includes('Solve #,Puzzle,Effective Time (s)'));
  assert.ok(csv.includes('1,3x3,17.23,15230,+2'));
});

test('computeLast20Analytics slices strictly to the latest 20 chronological solves', () => {
  const recs: SolveRecord[] = Array.from({ length: 25 }, (_, i) => ({
    ...makeRec(`s-${i + 1}`, 25000 - i * 400, 'none', i + 1),
    moves: 70 - i,
  }));
  const analytics = computeLast20Analytics(recs);

  assert.equal(analytics.totalSessionCount, 25);
  assert.equal(analytics.windowCount, 20);
  assert.equal(analytics.points.length, 20);
  assert.equal(analytics.points[0].overallSolveNumber, 6);
  assert.equal(analytics.points[19].overallSolveNumber, 25);
  assert.equal(analytics.bestTimeMs, 25000 - 24 * 400);
  assert.equal(analytics.bestMoves, 70 - 24);
  assert.ok(analytics.timeDeltaMs !== null && analytics.timeDeltaMs < 0);
  assert.ok(analytics.movesDelta !== null && analytics.movesDelta < 0);
});

test('computeLast20Analytics handles missing move counts, +2 penalties, DNFs, and TPS accurately', () => {
  const recs: SolveRecord[] = [
    { ...makeRec('a', 20000, 'none', 1), moves: 60 }, // 20s, 60mv -> 3.0 TPS
    { ...makeRec('b', 16000, '+2', 2), moves: 54 },   // 18s, 54mv -> 3.0 TPS
    { ...makeRec('c', 15000, 'none', 3) },            // 15s, no moves
    { ...makeRec('d', 14000, 'dnf', 4), moves: 50 },  // DNF, 50mv (fewest moves)
  ];
  const analytics = computeLast20Analytics(recs);

  assert.equal(analytics.validTimeCount, 3);
  assert.equal(analytics.solvesWithMovesCount, 3);
  assert.equal(analytics.bestTimeMs, 15000);
  assert.equal(analytics.bestMoves, 50);
  assert.ok(analytics.avgTps !== null && Math.abs(analytics.avgTps - 3.0) < 0.001);
  assert.equal(analytics.points[2].moves, null);
  assert.equal(analytics.points[3].effectiveMs, null);
  assert.equal(analytics.points[3].isFewestMoves, true);
});

test('createSeedRecords includes 20 3x3 solves with populated move counts', () => {
  const seeded = createSeedRecords();
  const threeByThree = seeded.filter((r) => r.puzzleType === '3x3');
  assert.equal(threeByThree.length, 20);
  assert.ok(threeByThree.every((r) => typeof r.moves === 'number' && r.moves > 0));
});
