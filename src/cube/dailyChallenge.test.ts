import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatUtcCountdown,
  generateDailyScramble,
  getNextUtcMidnightMs,
  getUtcDateKey,
  mergeDailyEntries,
  parseCookieString,
  rankDailyEntries,
  sanitizePlayerName,
  type DailyLeaderboardEntry,
} from './dailyChallenge.ts';
import type { PuzzleType } from './types.ts';

test('generateDailyScramble is strictly deterministic for a given UTC date and puzzle', () => {
  const puzzles: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];
  for (const puzzle of puzzles) {
    const first = generateDailyScramble('2026-11-19', puzzle);
    const second = generateDailyScramble('2026-11-19', puzzle);
    assert.equal(first, second, `Expected identical daily scramble for ${puzzle}`);

    const nextDay = generateDailyScramble('2026-11-20', puzzle);
    assert.notEqual(first, nextDay, `Expected different scramble on next UTC day for ${puzzle}`);
  }
});

test('generateDailyScramble obeys WCA lengths and never repeats consecutive faces', () => {
  const expectedCounts: Record<PuzzleType, number> = {
    '2x2': 11,
    '3x3': 20,
    '4x4': 32,
    mirror: 20,
  };

  for (const [puzzle, expectedLen] of Object.entries(expectedCounts) as [PuzzleType, number][]) {
    const scramble = generateDailyScramble('2026-11-19', puzzle);
    const tokens = scramble.split(' ');
    assert.equal(tokens.length, expectedLen, `Expected ${expectedLen} moves for ${puzzle}`);

    for (let i = 1; i < tokens.length; i += 1) {
      const prevFace = tokens[i - 1].replace(/['2]/g, '');
      const currFace = tokens[i].replace(/['2]/g, '');
      assert.notEqual(prevFace, currFace, `Consecutive duplicate face ${currFace} in ${puzzle}`);
    }
  }
});

test('rankDailyEntries sorts by effective time including +2 penalties and places DNFs last', () => {
  const entries: DailyLeaderboardEntry[] = [
    {
      id: 'e1',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'c1',
      playerName: 'FastWithPenalty',
      timeMs: 12000,
      penalty: '+2', // effective 14000
      source: 'stopwatch',
      submittedAt: 1000,
    },
    {
      id: 'e2',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'c2',
      playerName: 'CleanWinner',
      timeMs: 13200,
      penalty: 'none', // effective 13200
      source: 'virtual3d',
      submittedAt: 2000,
    },
    {
      id: 'e3',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'c3',
      playerName: 'PoppedCube',
      timeMs: 9000,
      penalty: 'dnf', // null
      source: 'stopwatch',
      submittedAt: 500,
    },
    {
      id: 'e4',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'c4',
      playerName: 'TiedEarlier',
      timeMs: 14000,
      penalty: 'none', // effective 14000, submitted earlier than e1
      source: 'stopwatch',
      submittedAt: 800,
    },
  ];

  const ranked = rankDailyEntries(entries);
  assert.deepEqual(
    ranked.map((r) => ({ id: r.id, rank: r.rank, effectiveMs: r.effectiveMs })),
    [
      { id: 'e2', rank: 1, effectiveMs: 13200 },
      { id: 'e4', rank: 2, effectiveMs: 14000 },
      { id: 'e1', rank: 3, effectiveMs: 14000 },
      { id: 'e3', rank: null, effectiveMs: null },
    ]
  );
});

test('UTC date key, next midnight calculation, and countdown formatting are exact', () => {
  const sampleDate = new Date('2026-11-19T22:30:15.000Z');
  assert.equal(getUtcDateKey(sampleDate), '2026-11-19');
  const nextMidnight = getNextUtcMidnightMs(sampleDate.getTime());
  assert.equal(new Date(nextMidnight).toISOString(), '2026-11-20T00:00:00.000Z');
  assert.equal(formatUtcCountdown(nextMidnight - sampleDate.getTime()), '01:29:45');
  assert.equal(formatUtcCountdown(-500), '00:00:00');
});

test('sanitizePlayerName strips unsafe characters and limits length', () => {
  assert.equal(sanitizePlayerName('  Alex   <Speed>  '), 'Alex Speed');
  assert.equal(sanitizePlayerName('A'.repeat(40)).length, 24);
  assert.equal(sanitizePlayerName('   '), '');
});

test('parseCookieString decodes cookies cleanly and mergeDailyEntries deduplicates by clientId', () => {
  const header = 'kubi_theme=monolith; kubi_player_name=Speed%20Cuber; other=123';
  assert.equal(parseCookieString(header, 'kubi_theme'), 'monolith');
  assert.equal(parseCookieString(header, 'kubi_player_name'), 'Speed Cuber');
  assert.equal(parseCookieString(header, 'missing'), null);

  const local: DailyLeaderboardEntry[] = [
    {
      id: 'local-1',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'me',
      playerName: 'Me',
      timeMs: 15000,
      penalty: 'none',
      source: 'stopwatch',
      submittedAt: 1000,
    },
  ];
  const server: DailyLeaderboardEntry[] = [
    {
      id: 'srv-2',
      dateKey: '2026-11-19',
      puzzleType: '3x3',
      clientId: 'rival',
      playerName: 'Rival',
      timeMs: 12000,
      penalty: 'none',
      source: 'virtual3d',
      submittedAt: 900,
    },
  ];
  const merged = mergeDailyEntries(server, local, '2026-11-19', '3x3');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].clientId, 'rival');
  assert.equal(merged[0].rank, 1);
  assert.equal(merged[1].clientId, 'me');
  assert.equal(merged[1].rank, 2);
});
