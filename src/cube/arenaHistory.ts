import type { ArenaRoomSnapshot } from './arenaEngine';
import type { SolvePenalty } from './timerStats';
import type { PuzzleType } from './types';

export type ArenaMode = ArenaRoomSnapshot['mode'];

export const ARENA_HISTORY_STORAGE_KEY = 'kubi_arena_match_history_v1';
const MAX_STORED_MATCHES = 200;

export type ArenaMatchOutcome = 'win' | 'loss' | 'draw';

export interface ArenaMatchRoundSummary {
  roundNumber: number;
  scramble: string;
  myTimeMs: number | null;
  myPenalty: SolvePenalty;
  myEffectiveMs: number | null;
  opponentTimeMs: number | null;
  opponentPenalty: SolvePenalty;
  opponentEffectiveMs: number | null;
  winner: 'me' | 'opponent' | 'tie';
}

export interface ArenaMatchRecord {
  id: string;
  roomCode: string;
  mode: ArenaMode;
  puzzleType: PuzzleType;
  playerName: string;
  opponentName: string;
  myWins: number;
  opponentWins: number;
  ties: number;
  roundsPlayed: number;
  myAvgMs: number | null;
  myBestMs: number | null;
  opponentAvgMs: number | null;
  outcome: ArenaMatchOutcome;
  startedAt: number;
  updatedAt: number;
  rounds: ArenaMatchRoundSummary[];
}

export interface ArenaHistoryAggregateStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRatePct: number | null;
  totalRoundsPlayed: number;
  totalRoundsWon: number;
  totalRoundsLost: number;
  overallAvgMs: number | null;
  bestSingleMs: number | null;
  currentWinStreak: number;
}

const VALID_PUZZLES = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);
const VALID_MODES = new Set<ArenaMode>(['private', 'matchmaking']);
const VALID_PENALTIES = new Set<SolvePenalty>(['none', '+2', 'dnf']);
const VALID_OUTCOMES = new Set<ArenaMatchOutcome>(['win', 'loss', 'draw']);

/**
 * Derive a persistent ArenaMatchRecord from a live ArenaRoomSnapshot once at least
 * one round has been completed by both players.
 */
export function buildMatchRecordFromRoom(
  room: ArenaRoomSnapshot,
  myPlayerId: string,
  sessionKey: string,
  startedAtMs?: number
): ArenaMatchRecord | null {
  if (!room.history || room.history.length === 0) {
    return null;
  }

  const me = room.players.find((p) => p.playerId === myPlayerId);
  const opponent = room.players.find((p) => p.playerId !== myPlayerId);
  if (!me) return null;

  // Infer opponent playerId even if opponent already disconnected after finishing rounds
  let oppId = opponent?.playerId ?? null;
  if (!oppId) {
    for (const round of room.history) {
      const other = Object.keys(round.results).find((pid) => pid !== myPlayerId);
      if (other) {
        oppId = other;
        break;
      }
    }
  }

  let myWins = 0;
  let opponentWins = 0;
  let ties = 0;
  const myValidTimes: number[] = [];
  const oppValidTimes: number[] = [];

  const rounds: ArenaMatchRoundSummary[] = room.history.map((rec) => {
    const myRes = rec.results[myPlayerId];
    const oppRes = oppId ? rec.results[oppId] : undefined;

    if (myRes?.effectiveMs !== null && typeof myRes?.effectiveMs === 'number') {
      myValidTimes.push(myRes.effectiveMs);
    }
    if (oppRes?.effectiveMs !== null && typeof oppRes?.effectiveMs === 'number') {
      oppValidTimes.push(oppRes.effectiveMs);
    }

    let winner: 'me' | 'opponent' | 'tie' = 'tie';
    if (rec.winnerPlayerId === myPlayerId) {
      winner = 'me';
      myWins += 1;
    } else if (rec.winnerPlayerId && rec.winnerPlayerId !== 'tie') {
      winner = 'opponent';
      opponentWins += 1;
    } else {
      ties += 1;
    }

    return {
      roundNumber: rec.roundNumber,
      scramble: rec.scramble,
      myTimeMs: myRes ? myRes.timeMs : null,
      myPenalty: myRes ? myRes.penalty : 'none',
      myEffectiveMs: myRes ? myRes.effectiveMs : null,
      opponentTimeMs: oppRes ? oppRes.timeMs : null,
      opponentPenalty: oppRes ? oppRes.penalty : 'none',
      opponentEffectiveMs: oppRes ? oppRes.effectiveMs : null,
      winner,
    };
  });

  const myAvgMs =
    myValidTimes.length > 0
      ? Math.round(myValidTimes.reduce((sum, v) => sum + v, 0) / myValidTimes.length)
      : null;
  const myBestMs = myValidTimes.length > 0 ? Math.min(...myValidTimes) : null;
  const opponentAvgMs =
    oppValidTimes.length > 0
      ? Math.round(oppValidTimes.reduce((sum, v) => sum + v, 0) / oppValidTimes.length)
      : null;

  const outcome: ArenaMatchOutcome =
    myWins > opponentWins ? 'win' : myWins < opponentWins ? 'loss' : 'draw';

  const latestRoundTs = room.history[room.history.length - 1]?.completedAt ?? Date.now();
  const earliestRoundTs = room.history[0]?.completedAt ?? latestRoundTs;

  return {
    id: sessionKey,
    roomCode: room.roomCode,
    mode: room.mode,
    puzzleType: room.puzzleType,
    playerName: me.name,
    opponentName: opponent?.name ?? 'Opponent',
    myWins,
    opponentWins,
    ties,
    roundsPlayed: rounds.length,
    myAvgMs,
    myBestMs,
    opponentAvgMs,
    outcome,
    startedAt: startedAtMs ?? earliestRoundTs,
    updatedAt: latestRoundTs,
    rounds,
  };
}

/**
 * Insert or update a match record by ID, keeping records sorted newest-first
 * and bounded to MAX_STORED_MATCHES.
 */
export function upsertArenaMatchRecord(
  records: readonly ArenaMatchRecord[],
  next: ArenaMatchRecord
): ArenaMatchRecord[] {
  const existing = records.find((r) => r.id === next.id);
  const merged: ArenaMatchRecord = existing
    ? {
        ...next,
        // Preserve opponent's real name if they later disconnected before match ended
        opponentName:
          next.opponentName === 'Opponent' && existing.opponentName !== 'Opponent'
            ? existing.opponentName
            : next.opponentName,
        startedAt: Math.min(existing.startedAt, next.startedAt),
      }
    : next;

  const filtered = records.filter((r) => r.id !== merged.id);
  return [merged, ...filtered]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_MATCHES);
}

/**
 * Aggregate lifetime 1v1 Arena match stats (wins, losses, win rate, average solve time,
 * best single, and current win streak), optionally filtered by puzzle type.
 */
export function computeArenaStats(
  records: readonly ArenaMatchRecord[],
  puzzleFilter: PuzzleType | 'all' = 'all'
): ArenaHistoryAggregateStats {
  const scoped =
    puzzleFilter === 'all' ? records : records.filter((r) => r.puzzleType === puzzleFilter);

  const sorted = [...scoped].sort((a, b) => b.updatedAt - a.updatedAt);

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let totalRoundsPlayed = 0;
  let totalRoundsWon = 0;
  let totalRoundsLost = 0;
  const allValidSolveTimes: number[] = [];

  for (const match of sorted) {
    if (match.outcome === 'win') wins += 1;
    else if (match.outcome === 'loss') losses += 1;
    else draws += 1;

    totalRoundsPlayed += match.roundsPlayed;
    totalRoundsWon += match.myWins;
    totalRoundsLost += match.opponentWins;

    if (match.rounds.length > 0) {
      for (const rd of match.rounds) {
        if (rd.myEffectiveMs !== null && Number.isFinite(rd.myEffectiveMs)) {
          allValidSolveTimes.push(rd.myEffectiveMs);
        }
      }
    } else if (match.myAvgMs !== null && Number.isFinite(match.myAvgMs)) {
      allValidSolveTimes.push(match.myAvgMs);
    }
  }

  let currentWinStreak = 0;
  for (const match of sorted) {
    if (match.outcome === 'win') {
      currentWinStreak += 1;
    } else {
      break;
    }
  }

  const decidedMatches = wins + losses;
  const winRatePct =
    decidedMatches > 0 ? Math.round((wins / decidedMatches) * 100) : null;

  const overallAvgMs =
    allValidSolveTimes.length > 0
      ? Math.round(allValidSolveTimes.reduce((s, v) => s + v, 0) / allValidSolveTimes.length)
      : null;

  const bestSingleMs =
    allValidSolveTimes.length > 0 ? Math.min(...allValidSolveTimes) : null;

  return {
    totalMatches: sorted.length,
    wins,
    losses,
    draws,
    winRatePct,
    totalRoundsPlayed,
    totalRoundsWon,
    totalRoundsLost,
    overallAvgMs,
    bestSingleMs,
    currentWinStreak,
  };
}

function sanitizeStoredRecord(raw: unknown): ArenaMatchRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    typeof obj.roomCode !== 'string' ||
    !VALID_PUZZLES.has(obj.puzzleType as PuzzleType) ||
    !VALID_MODES.has(obj.mode as ArenaMode) ||
    !VALID_OUTCOMES.has(obj.outcome as ArenaMatchOutcome)
  ) {
    return null;
  }

  const roundsRaw = Array.isArray(obj.rounds) ? obj.rounds : [];
  const rounds: ArenaMatchRoundSummary[] = roundsRaw
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .map((r, idx) => ({
      roundNumber: typeof r.roundNumber === 'number' ? r.roundNumber : idx + 1,
      scramble: typeof r.scramble === 'string' ? r.scramble : '',
      myTimeMs: typeof r.myTimeMs === 'number' && Number.isFinite(r.myTimeMs) ? r.myTimeMs : null,
      myPenalty: VALID_PENALTIES.has(r.myPenalty as SolvePenalty) ? (r.myPenalty as SolvePenalty) : 'none',
      myEffectiveMs:
        typeof r.myEffectiveMs === 'number' && Number.isFinite(r.myEffectiveMs)
          ? r.myEffectiveMs
          : null,
      opponentTimeMs:
        typeof r.opponentTimeMs === 'number' && Number.isFinite(r.opponentTimeMs)
          ? r.opponentTimeMs
          : null,
      opponentPenalty: VALID_PENALTIES.has(r.opponentPenalty as SolvePenalty)
        ? (r.opponentPenalty as SolvePenalty)
        : 'none',
      opponentEffectiveMs:
        typeof r.opponentEffectiveMs === 'number' && Number.isFinite(r.opponentEffectiveMs)
          ? r.opponentEffectiveMs
          : null,
      winner: r.winner === 'me' || r.winner === 'opponent' ? r.winner : 'tie',
    }));

  return {
    id: obj.id,
    roomCode: obj.roomCode,
    mode: obj.mode as ArenaMode,
    puzzleType: obj.puzzleType as PuzzleType,
    playerName: typeof obj.playerName === 'string' ? obj.playerName : 'You',
    opponentName: typeof obj.opponentName === 'string' ? obj.opponentName : 'Opponent',
    myWins: typeof obj.myWins === 'number' ? Math.max(0, Math.round(obj.myWins)) : 0,
    opponentWins:
      typeof obj.opponentWins === 'number' ? Math.max(0, Math.round(obj.opponentWins)) : 0,
    ties: typeof obj.ties === 'number' ? Math.max(0, Math.round(obj.ties)) : 0,
    roundsPlayed:
      typeof obj.roundsPlayed === 'number' ? Math.max(0, Math.round(obj.roundsPlayed)) : rounds.length,
    myAvgMs:
      typeof obj.myAvgMs === 'number' && Number.isFinite(obj.myAvgMs) ? Math.round(obj.myAvgMs) : null,
    myBestMs:
      typeof obj.myBestMs === 'number' && Number.isFinite(obj.myBestMs)
        ? Math.round(obj.myBestMs)
        : null,
    opponentAvgMs:
      typeof obj.opponentAvgMs === 'number' && Number.isFinite(obj.opponentAvgMs)
        ? Math.round(obj.opponentAvgMs)
        : null,
    outcome: obj.outcome as ArenaMatchOutcome,
    startedAt: typeof obj.startedAt === 'number' ? obj.startedAt : Date.now(),
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    rounds,
  };
}

export function loadArenaMatchHistory(): ArenaMatchRecord[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ARENA_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeStoredRecord)
      .filter((r): r is ArenaMatchRecord => r !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_MATCHES);
  } catch {
    return [];
  }
}

export function saveArenaMatchHistory(records: readonly ArenaMatchRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      ARENA_HISTORY_STORAGE_KEY,
      JSON.stringify(records.slice(0, MAX_STORED_MATCHES))
    );
  } catch {
    // ignore storage quota errors
  }
}

export function deleteArenaMatchRecord(id: string): ArenaMatchRecord[] {
  const next = loadArenaMatchHistory().filter((r) => r.id !== id);
  saveArenaMatchHistory(next);
  return next;
}

export function clearArenaMatchHistory(): ArenaMatchRecord[] {
  saveArenaMatchHistory([]);
  return [];
}
