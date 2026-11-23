import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArenaEngine,
  computeRoundWinner,
  isValidRoomCode,
  normalizeRoomCode,
} from './arenaEngine';

test('normalizeRoomCode and isValidRoomCode sanitize user room inputs', () => {
  assert.equal(normalizeRoomCode(' ab-12 cd '), 'AB12CD');
  assert.equal(isValidRoomCode('kubi42'), true);
  assert.equal(isValidRoomCode('ab'), false);
  assert.equal(isValidRoomCode(''), false);
});

test('Private room creation enforces strict 2-player maximum capacity', () => {
  const engine = new ArenaEngine();
  const created = engine.createPrivateRoom('p1', '3x3', {
    name: 'Alex',
    camEnabled: true,
    micEnabled: true,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const code = created.data.room.roomCode;
  assert.equal(code.length, 6);
  assert.equal(created.data.room.players.length, 1);
  assert.equal(created.data.room.players[0].seat, 0);
  assert.ok(created.data.room.currentScramble.length > 10);

  // Second player joins successfully
  const joined = engine.joinPrivateRoom('p2', code.toLowerCase(), {
    name: 'Maya',
    camEnabled: false,
    micEnabled: true,
  });
  assert.equal(joined.ok, true);
  if (!joined.ok) return;
  assert.equal(joined.data.room.players.length, 2);
  assert.equal(joined.data.room.players[1].seat, 1);
  assert.equal(engine.getPeerPlayerId('p1'), 'p2');
  assert.equal(engine.getPeerPlayerId('p2'), 'p1');

  // Third player is rejected cleanly because room holds at most 2 people
  const third = engine.joinPrivateRoom('p3', code, { name: 'Sam' });
  assert.equal(third.ok, false);
  if (!third.ok) {
    assert.equal(third.code, 'ROOM_FULL');
  }
});

test('Random online matchmaking pairs waiting cubers by puzzle event FIFO', () => {
  const engine = new ArenaEngine();

  const q1 = engine.joinMatchmaking('p1', '3x3', { name: 'CuberOne', camEnabled: true });
  assert.equal(q1.matched, false);
  if (!q1.matched) {
    assert.equal(q1.queueSize, 1);
    assert.equal(q1.queueCounts['3x3'], 1);
  }

  // Different puzzle event stays separate
  const q2 = engine.joinMatchmaking('p2', '2x2', { name: 'TwoByTwo' });
  assert.equal(q2.matched, false);
  if (!q2.matched) {
    assert.equal(q2.queueCounts['2x2'], 1);
    assert.equal(q2.queueCounts['3x3'], 1);
  }

  // Second 3x3 player immediately pairs with p1 into a live matchmaking room
  const q3 = engine.joinMatchmaking('p3', '3x3', { name: 'CuberTwo', camEnabled: false });
  assert.equal(q3.matched, true);
  if (q3.matched) {
    assert.equal(q3.peerId, 'p1');
    assert.equal(q3.room.mode, 'matchmaking');
    assert.equal(q3.room.puzzleType, '3x3');
    assert.equal(q3.room.players.length, 2);
    assert.equal(q3.room.players[0].playerId, 'p1');
    assert.equal(q3.room.players[1].playerId, 'p3');
    assert.equal(engine.getQueueCounts()['3x3'], 0);
  }
});

test('Independent timers, +2/DNF penalties, round win tally, and Next Round sync accurately', () => {
  let now = 10000;
  const engine = new ArenaEngine({ now: () => now });
  const created = engine.createPrivateRoom('p1', '3x3', { name: 'Alex' });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const code = created.data.room.roomCode;
  const round1Scramble = created.data.room.currentScramble;
  engine.joinPrivateRoom('p2', code, { name: 'Maya' });

  // Both start independently
  const r1Start = engine.updateTimerPhase('p1', 'running');
  assert.equal(r1Start.ok, true);
  now += 2500;
  const r2Start = engine.updateTimerPhase('p2', 'running');
  assert.equal(r2Start.ok, true);

  // p1 finishes in 11.20s, p2 finishes in 12.10s -> p1 wins Round 1
  const f1 = engine.finishTimer('p1', 11200, 'none');
  assert.equal(f1.ok, true);
  if (f1.ok) {
    // Round history waits until both players finish
    assert.equal(f1.data.history.length, 0);
  }

  const f2 = engine.finishTimer('p2', 12100, 'none');
  assert.equal(f2.ok, true);
  if (f2.ok) {
    assert.equal(f2.data.history.length, 1);
    assert.equal(f2.data.history[0].winnerPlayerId, 'p1');
    assert.equal(f2.data.players.find((p) => p.playerId === 'p1')?.wins, 1);
    assert.equal(f2.data.players.find((p) => p.playerId === 'p2')?.wins, 0);
  }

  // p1 applies a +2 penalty (11.20 + 2 = 13.20 > 12.10) -> winner flips cleanly to p2!
  const pen = engine.updatePenalty('p1', '+2');
  assert.equal(pen.ok, true);
  if (pen.ok) {
    assert.equal(pen.data.history[0].winnerPlayerId, 'p2');
    assert.equal(pen.data.players.find((p) => p.playerId === 'p1')?.wins, 0);
    assert.equal(pen.data.players.find((p) => p.playerId === 'p2')?.wins, 1);
  }

  // Next round generates fresh shared scramble and resets both timers to idle
  const next = engine.advanceRound('p1');
  assert.equal(next.ok, true);
  if (next.ok) {
    assert.equal(next.data.roundNumber, 2);
    assert.notEqual(next.data.currentScramble, round1Scramble);
    assert.equal(next.data.players[0].timerPhase, 'idle');
    assert.equal(next.data.players[1].timerPhase, 'idle');
    assert.equal(next.data.players[0].currentTimeMs, null);
  }
});

test('computeRoundWinner handles DNF vs valid and double-DNF ties', () => {
  const singleDnf = computeRoundWinner(
    {
      a: { playerId: 'a', name: 'A', timeMs: 9000, penalty: 'dnf', effectiveMs: null },
      b: { playerId: 'b', name: 'B', timeMs: 14500, penalty: 'none', effectiveMs: 14500 },
    },
    ['a', 'b']
  );
  assert.equal(singleDnf, 'b');

  const doubleDnf = computeRoundWinner(
    {
      a: { playerId: 'a', name: 'A', timeMs: 9000, penalty: 'dnf', effectiveMs: null },
      b: { playerId: 'b', name: 'B', timeMs: 14500, penalty: 'dnf', effectiveMs: null },
    },
    ['a', 'b']
  );
  assert.equal(doubleDnf, 'tie');
});

test('Disconnecting removes players from queues and cleans up empty rooms', () => {
  const engine = new ArenaEngine();
  engine.joinMatchmaking('q1', '4x4', { name: 'Waiter' });
  assert.equal(engine.getQueueCounts()['4x4'], 1);

  const discQ = engine.disconnectPlayer('q1');
  assert.equal(discQ.removedFromQueue, '4x4');
  assert.equal(engine.getQueueCounts()['4x4'], 0);

  const created = engine.createPrivateRoom('h1', '3x3', { name: 'Host' });
  assert.equal(created.ok, true);
  assert.equal(engine.getActiveRoomCount(), 1);
  if (created.ok) {
    engine.joinPrivateRoom('g1', created.data.room.roomCode, { name: 'Guest' });
  }

  // Host leaves -> guest remains promoted to seat 0
  const hostLeft = engine.disconnectPlayer('h1');
  assert.equal(hostLeft.remainingRoom?.players.length, 1);
  assert.equal(hostLeft.remainingRoom?.players[0].playerId, 'g1');
  assert.equal(hostLeft.remainingRoom?.players[0].seat, 0);

  // Guest leaves -> room deleted cleanly
  const guestLeft = engine.disconnectPlayer('g1');
  assert.equal(guestLeft.remainingRoom, null);
  assert.equal(engine.getActiveRoomCount(), 0);
});
