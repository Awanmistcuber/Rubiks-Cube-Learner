import test from 'node:test';
import assert from 'node:assert/strict';
import type { ArenaRoomSnapshot } from './arenaEngine';
import {
  buildMatchRecordFromRoom,
  computeArenaStats,
  upsertArenaMatchRecord,
  type ArenaMatchRecord,
} from './arenaHistory';

function makeRoomSnapshot(overrides?: Partial<ArenaRoomSnapshot>): ArenaRoomSnapshot {
  return {
    roomCode: 'AB12CD',
    mode: 'private',
    puzzleType: '3x3',
    roundNumber: 2,
    currentScramble: "R U R' U'",
    createdAt: 500,
    players: [
      {
        playerId: 'p1',
        name: 'Alice',
        seat: 0,
        connected: true,
        wins: 2,
        camEnabled: true,
        micEnabled: true,
        timerPhase: 'finished',
        timerStartedAt: null,
        currentTimeMs: 11200,
        currentPenalty: 'none',
      },
      {
        playerId: 'p2',
        name: 'Bob',
        seat: 1,
        connected: true,
        wins: 0,
        camEnabled: true,
        micEnabled: true,
        timerPhase: 'finished',
        timerStartedAt: null,
        currentTimeMs: 14500,
        currentPenalty: 'none',
      },
    ],
    history: [
      {
        roundNumber: 1,
        scramble: 'R U F',
        completedAt: 1000,
        winnerPlayerId: 'p1',
        results: {
          p1: { playerId: 'p1', name: 'Alice', timeMs: 12000, penalty: 'none', effectiveMs: 12000 },
          p2: { playerId: 'p2', name: 'Bob', timeMs: 13500, penalty: 'none', effectiveMs: 13500 },
        },
      },
      {
        roundNumber: 2,
        scramble: 'L D B',
        completedAt: 2000,
        winnerPlayerId: 'p1',
        results: {
          p1: { playerId: 'p1', name: 'Alice', timeMs: 10000, penalty: '+2', effectiveMs: 12000 },
          p2: { playerId: 'p2', name: 'Bob', timeMs: 14000, penalty: 'dnf', effectiveMs: null },
        },
      },
    ],
    chat: [],
    serverTimeMs: 2500,
    ...overrides,
  };
}

test('buildMatchRecordFromRoom computes wins, losses, average solve time, and outcome accurately', () => {
  const room = makeRoomSnapshot();
  const rec = buildMatchRecordFromRoom(room, 'p1', 'AB12CD-1000', 1000);
  assert.ok(rec);
  assert.equal(rec.roomCode, 'AB12CD');
  assert.equal(rec.opponentName, 'Bob');
  assert.equal(rec.myWins, 2);
  assert.equal(rec.opponentWins, 0);
  assert.equal(rec.outcome, 'win');
  assert.equal(rec.myAvgMs, 12000);
  assert.equal(rec.myBestMs, 12000);
  assert.equal(rec.opponentAvgMs, 13500);
  assert.equal(rec.roundsPlayed, 2);

  // Returns null if no completed rounds yet
  const emptyRoom = makeRoomSnapshot({ history: [] });
  assert.equal(buildMatchRecordFromRoom(emptyRoom, 'p1', 'AB12CD-empty'), null);
});

test('upsertArenaMatchRecord updates same match session in place and preserves opponent name if opponent left', () => {
  const room1 = makeRoomSnapshot();
  const initial = buildMatchRecordFromRoom(room1, 'p1', 'AB12CD-1000', 1000)!;
  let list = upsertArenaMatchRecord([], initial);
  assert.equal(list.length, 1);

  // Simulate opponent leaving after Round 2
  const afterLeave = makeRoomSnapshot({
    players: [room1.players[0]],
  });
  const updated = buildMatchRecordFromRoom(afterLeave, 'p1', 'AB12CD-1000', 1000)!;
  list = upsertArenaMatchRecord(list, updated);
  assert.equal(list.length, 1);
  assert.equal(list[0].opponentName, 'Bob');
});

test('computeArenaStats calculates wins, losses, win rate, streak, overall average, and puzzle filtering', () => {
  const m1: ArenaMatchRecord = {
    id: 'm1',
    roomCode: 'AAAAAA',
    mode: 'matchmaking',
    puzzleType: '3x3',
    playerName: 'Alice',
    opponentName: 'Op1',
    myWins: 2,
    opponentWins: 1,
    ties: 0,
    roundsPlayed: 3,
    myAvgMs: 11000,
    myBestMs: 10000,
    opponentAvgMs: 12000,
    outcome: 'win',
    startedAt: 3000,
    updatedAt: 3000,
    rounds: [
      {
        roundNumber: 1,
        scramble: 'R',
        myTimeMs: 10000,
        myPenalty: 'none',
        myEffectiveMs: 10000,
        opponentTimeMs: 12000,
        opponentPenalty: 'none',
        opponentEffectiveMs: 12000,
        winner: 'me',
      },
      {
        roundNumber: 2,
        scramble: 'U',
        myTimeMs: 12000,
        myPenalty: 'none',
        myEffectiveMs: 12000,
        opponentTimeMs: 11000,
        opponentPenalty: 'none',
        opponentEffectiveMs: 11000,
        winner: 'opponent',
      },
    ],
  };

  const m2: ArenaMatchRecord = {
    ...m1,
    id: 'm2',
    puzzleType: '2x2',
    myWins: 0,
    opponentWins: 2,
    outcome: 'loss',
    updatedAt: 2000,
    rounds: [
      {
        roundNumber: 1,
        scramble: 'F',
        myTimeMs: 5000,
        myPenalty: 'none',
        myEffectiveMs: 5000,
        opponentTimeMs: 4000,
        opponentPenalty: 'none',
        opponentEffectiveMs: 4000,
        winner: 'opponent',
      },
    ],
  };

  const allStats = computeArenaStats([m2, m1], 'all');
  assert.equal(allStats.totalMatches, 2);
  assert.equal(allStats.wins, 1);
  assert.equal(allStats.losses, 1);
  assert.equal(allStats.winRatePct, 50);
  assert.equal(allStats.currentWinStreak, 1);
  assert.equal(allStats.bestSingleMs, 5000);
  // (10000 + 12000 + 5000) / 3 = 9000
  assert.equal(allStats.overallAvgMs, 9000);

  const stats3x3 = computeArenaStats([m2, m1], '3x3');
  assert.equal(stats3x3.totalMatches, 1);
  assert.equal(stats3x3.wins, 1);
  assert.equal(stats3x3.winRatePct, 100);
  assert.equal(stats3x3.overallAvgMs, 11000);
});
