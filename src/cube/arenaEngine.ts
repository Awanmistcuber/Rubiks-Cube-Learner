import { sanitizePlayerName } from './dailyChallenge.ts';
import {
  generateWcaScrambleString,
  getEffectiveTimeMs,
  type SolvePenalty,
} from './timerStats.ts';
import type { PuzzleType } from './types.ts';

export type ArenaTimerPhase = 'idle' | 'holding' | 'armed' | 'running' | 'finished';
export type ArenaRoomMode = 'private' | 'matchmaking';

export interface ArenaPlayerState {
  playerId: string;
  name: string;
  seat: 0 | 1;
  connected: boolean;
  camEnabled: boolean;
  micEnabled: boolean;
  timerPhase: ArenaTimerPhase;
  timerStartedAt: number | null;
  currentTimeMs: number | null;
  currentPenalty: SolvePenalty;
  wins: number;
}

export interface ArenaRoundPlayerResult {
  playerId: string;
  name: string;
  timeMs: number;
  penalty: SolvePenalty;
  effectiveMs: number | null;
}

export interface ArenaRoundRecord {
  roundNumber: number;
  scramble: string;
  results: Record<string, ArenaRoundPlayerResult>;
  winnerPlayerId: string | 'tie' | null;
  completedAt: number;
}

export interface ArenaRoomSnapshot {
  roomCode: string;
  mode: ArenaRoomMode;
  puzzleType: PuzzleType;
  roundNumber: number;
  currentScramble: string;
  players: ArenaPlayerState[];
  history: ArenaRoundRecord[];
  serverTimeMs: number;
  createdAt: number;
}

export interface ArenaPlayerProfile {
  name: string;
  camEnabled?: boolean;
  micEnabled?: boolean;
}

export type ArenaClientMessage =
  | {
      type: 'room:create';
      puzzleType: PuzzleType;
      name: string;
      camEnabled?: boolean;
      micEnabled?: boolean;
    }
  | {
      type: 'room:join';
      roomCode: string;
      name: string;
      camEnabled?: boolean;
      micEnabled?: boolean;
    }
  | { type: 'room:leave' }
  | {
      type: 'matchmaking:join';
      puzzleType: PuzzleType;
      name: string;
      camEnabled?: boolean;
      micEnabled?: boolean;
    }
  | { type: 'matchmaking:leave' }
  | { type: 'media:status'; camEnabled: boolean; micEnabled: boolean }
  | { type: 'timer:phase'; phase: 'idle' | 'holding' | 'armed' | 'running' }
  | { type: 'timer:finish'; timeMs: number; penalty?: SolvePenalty }
  | { type: 'timer:penalty'; penalty: SolvePenalty; roundNumber?: number }
  | { type: 'round:next' }
  | { type: 'room:puzzle'; puzzleType: PuzzleType }
  | { type: 'webrtc:signal'; signalType: 'offer' | 'answer' | 'ice'; payload: unknown }
  | { type: 'ping' };

export type ArenaRoomEventKind =
  | 'created'
  | 'joined'
  | 'matched'
  | 'updated'
  | 'next_round'
  | 'opponent_left';

export type ArenaServerMessage =
  | {
      type: 'welcome';
      playerId: string;
      queueCounts: Record<PuzzleType, number>;
      activeRooms: number;
    }
  | {
      type: 'queue:status';
      queued: boolean;
      puzzleType: PuzzleType | null;
      queueSize: number;
      queueCounts: Record<PuzzleType, number>;
    }
  | {
      type: 'room:state';
      room: ArenaRoomSnapshot;
      event?: ArenaRoomEventKind;
    }
  | { type: 'room:left'; reason?: string }
  | {
      type: 'webrtc:signal';
      fromPlayerId: string;
      signalType: 'offer' | 'answer' | 'ice';
      payload: unknown;
    }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; serverTimeMs: number };

export const VALID_ARENA_PUZZLES = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);
export const VALID_ARENA_PENALTIES = new Set<SolvePenalty>(['none', '+2', 'dnf']);
export const MAX_ROOM_PLAYERS = 2;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeRoomCode(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function isValidRoomCode(raw: string): boolean {
  const clean = normalizeRoomCode(raw);
  return /^[A-Z0-9]{4,8}$/.test(clean);
}

export function generateRoomCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function computeRoundWinner(
  results: Record<string, ArenaRoundPlayerResult>,
  playerIds: string[]
): string | 'tie' | null {
  if (playerIds.length < 2) return null;
  const r0 = results[playerIds[0]];
  const r1 = results[playerIds[1]];
  if (!r0 || !r1) return null;

  const e0 = r0.effectiveMs;
  const e1 = r1.effectiveMs;

  if (e0 === null && e1 === null) return 'tie';
  if (e0 === null) return r1.playerId;
  if (e1 === null) return r0.playerId;
  if (e0 === e1) return 'tie';
  return e0 < e1 ? r0.playerId : r1.playerId;
}

interface QueueEntry {
  playerId: string;
  name: string;
  puzzleType: PuzzleType;
  camEnabled: boolean;
  micEnabled: boolean;
  joinedAt: number;
}

interface InternalRoom {
  roomCode: string;
  mode: ArenaRoomMode;
  puzzleType: PuzzleType;
  roundNumber: number;
  currentScramble: string;
  players: ArenaPlayerState[];
  history: ArenaRoundRecord[];
  createdAt: number;
}

export type ArenaActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export class ArenaEngine {
  private rooms = new Map<string, InternalRoom>();
  private playerRoom = new Map<string, string>();
  private queues = new Map<PuzzleType, QueueEntry[]>([
    ['2x2', []],
    ['3x3', []],
    ['4x4', []],
    ['mirror', []],
  ]);
  private nowFn: () => number;
  private rngFn: () => number;

  constructor(options?: { now?: () => number; rng?: () => number }) {
    this.nowFn = options?.now ?? (() => Date.now());
    this.rngFn = options?.rng ?? Math.random;
  }

  getQueueCounts(): Record<PuzzleType, number> {
    return {
      '2x2': this.queues.get('2x2')?.length ?? 0,
      '3x3': this.queues.get('3x3')?.length ?? 0,
      '4x4': this.queues.get('4x4')?.length ?? 0,
      mirror: this.queues.get('mirror')?.length ?? 0,
    };
  }

  getActiveRoomCount(): number {
    return this.rooms.size;
  }

  getRoomForPlayer(playerId: string): ArenaRoomSnapshot | null {
    const code = this.playerRoom.get(playerId);
    if (!code) return null;
    const room = this.rooms.get(code);
    return room ? this.toSnapshot(room) : null;
  }

  getPeerPlayerId(playerId: string): string | null {
    const code = this.playerRoom.get(playerId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;
    const peer = room.players.find((p) => p.playerId !== playerId);
    return peer ? peer.playerId : null;
  }

  getRoomPlayerIds(roomCode: string): string[] {
    const room = this.rooms.get(normalizeRoomCode(roomCode));
    return room ? room.players.map((p) => p.playerId) : [];
  }

  private allocateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 24; attempt++) {
      const code = generateRoomCode(this.rngFn);
      if (!this.rooms.has(code)) return code;
    }
    return `${generateRoomCode(this.rngFn).slice(0, 4)}${String(this.nowFn() % 100).padStart(2, '0')}`;
  }

  private sanitizeName(raw: string): string {
    return sanitizePlayerName(raw) || 'Guest Cuber';
  }

  private createSeat(
    playerId: string,
    seat: 0 | 1,
    profile: ArenaPlayerProfile
  ): ArenaPlayerState {
    return {
      playerId,
      name: this.sanitizeName(profile.name),
      seat,
      connected: true,
      camEnabled: Boolean(profile.camEnabled),
      micEnabled: Boolean(profile.micEnabled),
      timerPhase: 'idle',
      timerStartedAt: null,
      currentTimeMs: null,
      currentPenalty: 'none',
      wins: 0,
    };
  }

  private toSnapshot(room: InternalRoom): ArenaRoomSnapshot {
    return {
      roomCode: room.roomCode,
      mode: room.mode,
      puzzleType: room.puzzleType,
      roundNumber: room.roundNumber,
      currentScramble: room.currentScramble,
      players: room.players.map((p) => ({ ...p })),
      history: room.history.map((h) => ({
        ...h,
        results: Object.fromEntries(
          Object.entries(h.results).map(([k, v]) => [k, { ...v }])
        ),
      })),
      serverTimeMs: this.nowFn(),
      createdAt: room.createdAt,
    };
  }

  private recalculateWins(room: InternalRoom): void {
    const tallies = new Map<string, number>();
    for (const p of room.players) {
      tallies.set(p.playerId, 0);
    }
    for (const rec of room.history) {
      if (rec.winnerPlayerId && rec.winnerPlayerId !== 'tie') {
        tallies.set(rec.winnerPlayerId, (tallies.get(rec.winnerPlayerId) ?? 0) + 1);
      }
    }
    for (const p of room.players) {
      p.wins = tallies.get(p.playerId) ?? 0;
    }
  }

  private syncCurrentRoundHistory(room: InternalRoom): void {
    if (room.players.length < 2) return;
    const allFinished = room.players.every(
      (p) => p.timerPhase === 'finished' && p.currentTimeMs !== null
    );
    if (!allFinished) return;

    const results: Record<string, ArenaRoundPlayerResult> = {};
    for (const p of room.players) {
      const timeMs = p.currentTimeMs!;
      results[p.playerId] = {
        playerId: p.playerId,
        name: p.name,
        timeMs,
        penalty: p.currentPenalty,
        effectiveMs: getEffectiveTimeMs({ timeMs, penalty: p.currentPenalty }),
      };
    }

    const winnerPlayerId = computeRoundWinner(
      results,
      room.players.map((p) => p.playerId)
    );

    const existingIdx = room.history.findIndex((h) => h.roundNumber === room.roundNumber);
    const record: ArenaRoundRecord = {
      roundNumber: room.roundNumber,
      scramble: room.currentScramble,
      results,
      winnerPlayerId,
      completedAt:
        existingIdx >= 0 ? room.history[existingIdx].completedAt : this.nowFn(),
    };

    if (existingIdx >= 0) {
      room.history[existingIdx] = record;
    } else {
      room.history.push(record);
      if (room.history.length > 100) {
        room.history = room.history.slice(-100);
      }
    }

    this.recalculateWins(room);
  }

  leaveMatchmaking(playerId: string): { removed: boolean; puzzleType: PuzzleType | null } {
    for (const [puzzle, list] of this.queues.entries()) {
      const idx = list.findIndex((e) => e.playerId === playerId);
      if (idx >= 0) {
        list.splice(idx, 1);
        return { removed: true, puzzleType: puzzle };
      }
    }
    return { removed: false, puzzleType: null };
  }

  createPrivateRoom(
    playerId: string,
    puzzleType: PuzzleType,
    profile: ArenaPlayerProfile
  ): ArenaActionResult<{ room: ArenaRoomSnapshot; affectedPreviousRoom: ArenaRoomSnapshot | null }> {
    const safePuzzle: PuzzleType = VALID_ARENA_PUZZLES.has(puzzleType) ? puzzleType : '3x3';
    this.leaveMatchmaking(playerId);
    const prev = this.leaveRoom(playerId);

    const roomCode = this.allocateUniqueRoomCode();
    const room: InternalRoom = {
      roomCode,
      mode: 'private',
      puzzleType: safePuzzle,
      roundNumber: 1,
      currentScramble: generateWcaScrambleString(safePuzzle),
      players: [this.createSeat(playerId, 0, profile)],
      history: [],
      createdAt: this.nowFn(),
    };

    this.rooms.set(roomCode, room);
    this.playerRoom.set(playerId, roomCode);

    return {
      ok: true,
      data: {
        room: this.toSnapshot(room),
        affectedPreviousRoom: prev.remainingRoom,
      },
    };
  }

  joinPrivateRoom(
    playerId: string,
    rawRoomCode: string,
    profile: ArenaPlayerProfile
  ): ArenaActionResult<{ room: ArenaRoomSnapshot; affectedPreviousRoom: ArenaRoomSnapshot | null }> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    if (!isValidRoomCode(roomCode)) {
      return {
        ok: false,
        code: 'INVALID_ROOM_CODE',
        message: 'Enter a valid 6-character room code.',
      };
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${roomCode}" was not found or has ended.`,
      };
    }

    // Idempotent rejoin if player is already seated in this room
    const existingSeat = room.players.find((p) => p.playerId === playerId);
    if (existingSeat) {
      existingSeat.name = this.sanitizeName(profile.name);
      existingSeat.connected = true;
      if (typeof profile.camEnabled === 'boolean') existingSeat.camEnabled = profile.camEnabled;
      if (typeof profile.micEnabled === 'boolean') existingSeat.micEnabled = profile.micEnabled;
      return {
        ok: true,
        data: { room: this.toSnapshot(room), affectedPreviousRoom: null },
      };
    }

    if (room.players.length >= MAX_ROOM_PLAYERS) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: `Room "${roomCode}" is full (2/2 players).`,
      };
    }

    this.leaveMatchmaking(playerId);
    const prev = this.leaveRoom(playerId);

    const occupiedSeats = new Set(room.players.map((p) => p.seat));
    const nextSeat: 0 | 1 = occupiedSeats.has(0) ? 1 : 0;
    room.players.push(this.createSeat(playerId, nextSeat, profile));
    room.players.sort((a, b) => a.seat - b.seat);
    this.playerRoom.set(playerId, roomCode);

    return {
      ok: true,
      data: {
        room: this.toSnapshot(room),
        affectedPreviousRoom: prev.remainingRoom,
      },
    };
  }

  joinMatchmaking(
    playerId: string,
    puzzleType: PuzzleType,
    profile: ArenaPlayerProfile
  ):
    | {
        matched: true;
        room: ArenaRoomSnapshot;
        peerId: string;
        affectedPreviousRoom: ArenaRoomSnapshot | null;
      }
    | {
        matched: false;
        puzzleType: PuzzleType;
        queueSize: number;
        queueCounts: Record<PuzzleType, number>;
        affectedPreviousRoom: ArenaRoomSnapshot | null;
      } {
    const safePuzzle: PuzzleType = VALID_ARENA_PUZZLES.has(puzzleType) ? puzzleType : '3x3';
    this.leaveMatchmaking(playerId);
    const prev = this.leaveRoom(playerId);

    const queue = this.queues.get(safePuzzle) ?? [];
    this.queues.set(safePuzzle, queue);

    // Pair immediately with the earliest waiting opponent for the same puzzle
    const opponentIdx = queue.findIndex((entry) => entry.playerId !== playerId);
    if (opponentIdx >= 0) {
      const opponent = queue.splice(opponentIdx, 1)[0];
      const roomCode = this.allocateUniqueRoomCode();
      const room: InternalRoom = {
        roomCode,
        mode: 'matchmaking',
        puzzleType: safePuzzle,
        roundNumber: 1,
        currentScramble: generateWcaScrambleString(safePuzzle),
        players: [
          this.createSeat(opponent.playerId, 0, {
            name: opponent.name,
            camEnabled: opponent.camEnabled,
            micEnabled: opponent.micEnabled,
          }),
          this.createSeat(playerId, 1, profile),
        ],
        history: [],
        createdAt: this.nowFn(),
      };

      this.rooms.set(roomCode, room);
      this.playerRoom.set(opponent.playerId, roomCode);
      this.playerRoom.set(playerId, roomCode);

      return {
        matched: true,
        room: this.toSnapshot(room),
        peerId: opponent.playerId,
        affectedPreviousRoom: prev.remainingRoom,
      };
    }

    queue.push({
      playerId,
      name: this.sanitizeName(profile.name),
      puzzleType: safePuzzle,
      camEnabled: Boolean(profile.camEnabled),
      micEnabled: Boolean(profile.micEnabled),
      joinedAt: this.nowFn(),
    });

    return {
      matched: false,
      puzzleType: safePuzzle,
      queueSize: queue.length,
      queueCounts: this.getQueueCounts(),
      affectedPreviousRoom: prev.remainingRoom,
    };
  }

  leaveRoom(playerId: string): {
    leftRoomCode: string | null;
    remainingRoom: ArenaRoomSnapshot | null;
    remainingPlayerIds: string[];
  } {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { leftRoomCode: null, remainingRoom: null, remainingPlayerIds: [] };
    }
    this.playerRoom.delete(playerId);

    const room = this.rooms.get(code);
    if (!room) {
      return { leftRoomCode: code, remainingRoom: null, remainingPlayerIds: [] };
    }

    room.players = room.players.filter((p) => p.playerId !== playerId);

    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { leftRoomCode: code, remainingRoom: null, remainingPlayerIds: [] };
    }

    // Keep remaining competitor in seat 0 so if a new challenger joins, WebRTC offerer is deterministic
    room.players[0].seat = 0;

    return {
      leftRoomCode: code,
      remainingRoom: this.toSnapshot(room),
      remainingPlayerIds: room.players.map((p) => p.playerId),
    };
  }

  disconnectPlayer(playerId: string): {
    removedFromQueue: PuzzleType | null;
    remainingRoom: ArenaRoomSnapshot | null;
    remainingPlayerIds: string[];
  } {
    const q = this.leaveMatchmaking(playerId);
    const r = this.leaveRoom(playerId);
    return {
      removedFromQueue: q.removed ? q.puzzleType : null,
      remainingRoom: r.remainingRoom,
      remainingPlayerIds: r.remainingPlayerIds,
    };
  }

  updateMediaStatus(
    playerId: string,
    camEnabled: boolean,
    micEnabled: boolean
  ): ArenaRoomSnapshot | null {
    const code = this.playerRoom.get(playerId);
    if (!code) return null;
    const room = this.rooms.get(code);
    if (!room) return null;
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) return null;

    player.camEnabled = Boolean(camEnabled);
    player.micEnabled = Boolean(micEnabled);
    return this.toSnapshot(room);
  }

  updateTimerPhase(
    playerId: string,
    phase: 'idle' | 'holding' | 'armed' | 'running'
  ): ArenaActionResult<ArenaRoomSnapshot> {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join a competition room first.' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' };
    }
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { ok: false, code: 'NOT_SEATED', message: 'Player is not seated in this room.' };
    }

    // Do not overwrite an already completed round solve until advancing to next round
    if (player.timerPhase === 'finished') {
      return { ok: true, data: this.toSnapshot(room) };
    }

    player.timerPhase = phase;
    player.timerStartedAt = phase === 'running' ? this.nowFn() : null;
    return { ok: true, data: this.toSnapshot(room) };
  }

  finishTimer(
    playerId: string,
    rawTimeMs: number,
    rawPenalty: SolvePenalty = 'none'
  ): ArenaActionResult<ArenaRoomSnapshot> {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join a competition room first.' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' };
    }
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { ok: false, code: 'NOT_SEATED', message: 'Player is not seated in this room.' };
    }

    const timeMs = Math.round(Number(rawTimeMs));
    if (!Number.isFinite(timeMs) || timeMs < 50 || timeMs > 3600000) {
      return {
        ok: false,
        code: 'INVALID_TIME',
        message: 'Solve time must be between 0.05s and 60 minutes.',
      };
    }

    const penalty: SolvePenalty = VALID_ARENA_PENALTIES.has(rawPenalty) ? rawPenalty : 'none';
    player.timerPhase = 'finished';
    player.timerStartedAt = null;
    player.currentTimeMs = timeMs;
    player.currentPenalty = penalty;

    this.syncCurrentRoundHistory(room);
    return { ok: true, data: this.toSnapshot(room) };
  }

  updatePenalty(
    playerId: string,
    rawPenalty: SolvePenalty,
    targetRoundNumber?: number
  ): ArenaActionResult<ArenaRoomSnapshot> {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join a competition room first.' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' };
    }
    const player = room.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { ok: false, code: 'NOT_SEATED', message: 'Player is not seated in this room.' };
    }
    if (!VALID_ARENA_PENALTIES.has(rawPenalty)) {
      return { ok: false, code: 'INVALID_PENALTY', message: 'Invalid penalty value.' };
    }

    const roundNum = targetRoundNumber ?? room.roundNumber;
    if (roundNum === room.roundNumber && player.timerPhase === 'finished' && player.currentTimeMs !== null) {
      player.currentPenalty = rawPenalty;
      this.syncCurrentRoundHistory(room);
    } else {
      const record = room.history.find((h) => h.roundNumber === roundNum);
      if (record && record.results[playerId]) {
        const prev = record.results[playerId];
        record.results[playerId] = {
          ...prev,
          penalty: rawPenalty,
          effectiveMs: getEffectiveTimeMs({ timeMs: prev.timeMs, penalty: rawPenalty }),
        };
        record.winnerPlayerId = computeRoundWinner(
          record.results,
          Object.keys(record.results)
        );
        this.recalculateWins(room);
      }
    }

    return { ok: true, data: this.toSnapshot(room) };
  }

  advanceRound(playerId: string): ArenaActionResult<ArenaRoomSnapshot> {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join a competition room first.' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' };
    }

    // Prevent interrupting an active running solve
    if (room.players.some((p) => p.timerPhase === 'running')) {
      return {
        ok: false,
        code: 'SOLVE_IN_PROGRESS',
        message: 'Wait for active solve to finish before advancing to the next scramble.',
      };
    }

    room.roundNumber += 1;
    room.currentScramble = generateWcaScrambleString(room.puzzleType);
    for (const p of room.players) {
      p.timerPhase = 'idle';
      p.timerStartedAt = null;
      p.currentTimeMs = null;
      p.currentPenalty = 'none';
    }

    return { ok: true, data: this.toSnapshot(room) };
  }

  changeRoomPuzzle(
    playerId: string,
    puzzleType: PuzzleType
  ): ArenaActionResult<ArenaRoomSnapshot> {
    const code = this.playerRoom.get(playerId);
    if (!code) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'Join a competition room first.' };
    }
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room no longer exists.' };
    }
    if (!VALID_ARENA_PUZZLES.has(puzzleType)) {
      return { ok: false, code: 'INVALID_PUZZLE', message: 'Unsupported puzzle event.' };
    }
    if (room.players.some((p) => p.timerPhase === 'running')) {
      return {
        ok: false,
        code: 'SOLVE_IN_PROGRESS',
        message: 'Wait for active solve to finish before switching events.',
      };
    }

    room.puzzleType = puzzleType;
    room.currentScramble = generateWcaScrambleString(puzzleType);
    for (const p of room.players) {
      p.timerPhase = 'idle';
      p.timerStartedAt = null;
      p.currentTimeMs = null;
      p.currentPenalty = 'none';
    }

    return { ok: true, data: this.toSnapshot(room) };
  }
}
