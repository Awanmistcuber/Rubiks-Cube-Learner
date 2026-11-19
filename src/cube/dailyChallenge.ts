import type { SolvePenalty } from './timerStats';
import { getEffectiveTimeMs } from './timerStats';
import type { PuzzleType } from './types';

export interface DailyLeaderboardEntry {
  id: string;
  dateKey: string;
  puzzleType: PuzzleType;
  clientId: string;
  playerName: string;
  timeMs: number;
  penalty: SolvePenalty;
  source: 'stopwatch' | 'virtual3d';
  moves?: number;
  submittedAt: number;
}

export interface RankedDailyEntry extends DailyLeaderboardEntry {
  rank: number | null;
  effectiveMs: number | null;
}

export interface DailyChallengeResponse {
  dateKey: string;
  puzzleType: PuzzleType;
  scramble: string;
  nextResetMs: number;
  totalParticipants: number;
  leaderboard: RankedDailyEntry[];
  userEntry: RankedDailyEntry | null;
}

export const CLIENT_ID_STORAGE_KEY = 'kubi_daily_client_id_v1';
export const PLAYER_NAME_STORAGE_KEY = 'kubi_daily_player_name_v1';

/**
 * Returns the canonical UTC date string (YYYY-MM-DD) shared by all users globally.
 */
export function getUtcDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns epoch milliseconds of the next 00:00:00 UTC boundary.
 */
export function getNextUtcMidnightMs(nowMs: number = Date.now()): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Formats a remaining duration in milliseconds as HH:MM:SS.
 */
export function formatUtcCountdown(remainingMs: number): string {
  const clamped = Math.max(0, Math.floor(remainingMs / 1000));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * FNV-1a 32-bit string hash for deterministic daily seeding.
 */
export function hashStringFnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32 deterministic PRNG returning values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ScrambleFaceSpec {
  symbol: string;
  axis: 'x' | 'y' | 'z';
}

const FACES_2X2: ScrambleFaceSpec[] = [
  { symbol: 'U', axis: 'y' },
  { symbol: 'R', axis: 'x' },
  { symbol: 'F', axis: 'z' },
];

const FACES_3X3: ScrambleFaceSpec[] = [
  { symbol: 'U', axis: 'y' },
  { symbol: 'D', axis: 'y' },
  { symbol: 'L', axis: 'x' },
  { symbol: 'R', axis: 'x' },
  { symbol: 'F', axis: 'z' },
  { symbol: 'B', axis: 'z' },
];

const FACES_4X4: ScrambleFaceSpec[] = [
  ...FACES_3X3,
  { symbol: 'Uw', axis: 'y' },
  { symbol: 'Rw', axis: 'x' },
  { symbol: 'Fw', axis: 'z' },
];

const MODIFIERS = ['', "'", '2'] as const;

/**
 * Generates a deterministic, shared WCA-style scramble fixed for a given UTC date and cube type.
 * Every user worldwide gets the exact same sequence on the same UTC calendar day.
 */
export function generateDailyScramble(dateKey: string, puzzleType: PuzzleType): string {
  const seed = hashStringFnv1a(`kubi-daily-v1:${dateKey}:${puzzleType}`);
  const rng = mulberry32(seed);

  const length = puzzleType === '2x2' ? 11 : puzzleType === '4x4' ? 32 : 20;
  const pool = puzzleType === '2x2' ? FACES_2X2 : puzzleType === '4x4' ? FACES_4X4 : FACES_3X3;

  const tokens: string[] = [];
  let prevSymbol = '';
  let prevAxis: 'x' | 'y' | 'z' | '' = '';
  let prevPrevAxis: 'x' | 'y' | 'z' | '' = '';

  for (let i = 0; i < length; i += 1) {
    const candidates = pool.filter((spec) => {
      if (spec.symbol === prevSymbol) return false;
      // Avoid redundant same-axis triplets like R L R or U D U
      if (spec.axis === prevAxis && prevAxis === prevPrevAxis) return false;
      // For 2x2, avoid consecutive turns on the exact same axis
      if (puzzleType === '2x2' && spec.axis === prevAxis) return false;
      return true;
    });

    const pick = candidates[Math.floor(rng() * candidates.length)];
    const mod = MODIFIERS[Math.floor(rng() * MODIFIERS.length)];
    tokens.push(`${pick.symbol}${mod}`);

    prevPrevAxis = prevAxis;
    prevAxis = pick.axis;
    prevSymbol = pick.symbol;
  }

  return tokens.join(' ');
}

/**
 * Sanitizes a user's cuber handle for safe leaderboard display and storage.
 */
export function sanitizePlayerName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
  return cleaned;
}

/**
 * Ranks daily leaderboard entries by effective WCA time ascending (with +2 applied).
 * DNF entries are placed at the end with rank = null.
 * Ties are broken by earlier submission timestamp.
 */
export function rankDailyEntries(entries: DailyLeaderboardEntry[]): RankedDailyEntry[] {
  const withEffective = entries.map((entry) => ({
    ...entry,
    effectiveMs: getEffectiveTimeMs({ timeMs: entry.timeMs, penalty: entry.penalty }),
    rank: null as number | null,
  }));

  withEffective.sort((a, b) => {
    if (a.effectiveMs === null && b.effectiveMs === null) {
      return a.submittedAt - b.submittedAt;
    }
    if (a.effectiveMs === null) return 1;
    if (b.effectiveMs === null) return -1;
    if (a.effectiveMs !== b.effectiveMs) {
      return a.effectiveMs - b.effectiveMs;
    }
    return a.submittedAt - b.submittedAt;
  });

  let currentRank = 1;
  return withEffective.map((entry) => {
    if (entry.effectiveMs === null) {
      return { ...entry, rank: null };
    }
    const ranked = { ...entry, rank: currentRank };
    currentRank += 1;
    return ranked;
  });
}

/* ============================================================================
   DUAL LOCAL STORAGE + COOKIE PERSISTENCE HELPERS
   ============================================================================ */

export const DAILY_ENTRIES_STORAGE_KEY = 'kubi_daily_entries_v1';
export const STUDIO_PREFS_STORAGE_KEY = 'kubi_studio_prefs_v1';

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year

export function parseCookieString(cookieStr: string, name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = cookieStr.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return trimmed.slice(prefix.length);
      }
    }
  }
  return null;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
  return parseCookieString(document.cookie, name);
}

export function writeCookie(name: string, value: string, maxAgeSec = COOKIE_MAX_AGE_SEC): void {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; SameSite=Lax`;
  } catch {
    // ignore cookie restrictions in sandboxed environments
  }
}

export function getOrCreateClientId(): string {
  try {
    const fromStorage = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    const fromCookie = readCookie('kubi_client_id');
    const existing = fromStorage && fromStorage.length >= 8 ? fromStorage : fromCookie;
    if (existing && existing.length >= 8) {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, existing);
      writeCookie('kubi_client_id', existing);
      return existing;
    }
    const generated = `cuber-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
    writeCookie('kubi_client_id', generated);
    return generated;
  } catch {
    const fromCookie = readCookie('kubi_client_id');
    if (fromCookie && fromCookie.length >= 8) return fromCookie;
    const fallback = `cuber-session-${Math.random().toString(36).slice(2, 10)}`;
    writeCookie('kubi_client_id', fallback);
    return fallback;
  }
}

export function loadPlayerName(): string {
  try {
    const raw = localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? readCookie('kubi_player_name');
    if (raw) {
      const clean = sanitizePlayerName(raw);
      if (clean.length >= 2) {
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, clean);
        writeCookie('kubi_player_name', clean);
        return clean;
      }
    }
  } catch {
    const raw = readCookie('kubi_player_name');
    if (raw) {
      const clean = sanitizePlayerName(raw);
      if (clean.length >= 2) return clean;
    }
  }
  return 'Guest Cuber';
}

export function savePlayerName(name: string): string {
  const clean = sanitizePlayerName(name) || 'Guest Cuber';
  try {
    localStorage.setItem(PLAYER_NAME_STORAGE_KEY, clean);
  } catch {
    // ignore storage restrictions
  }
  writeCookie('kubi_player_name', clean);
  return clean;
}

export function loadStudioPref(key: 'theme' | 'puzzle'): string | null {
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (typeof parsed[key] === 'string') return parsed[key];
    }
  } catch {
    // fallback to cookie
  }
  return readCookie(`kubi_${key}`);
}

export function saveStudioPref(key: 'theme' | 'puzzle', value: string): void {
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[key] = value;
    localStorage.setItem(STUDIO_PREFS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage restrictions
  }
  writeCookie(`kubi_${key}`, value);
}

export function loadLocalDailyEntries(): DailyLeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(DAILY_ENTRIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DailyLeaderboardEntry =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.dateKey === 'string' &&
        typeof item.puzzleType === 'string' &&
        typeof item.clientId === 'string' &&
        typeof item.timeMs === 'number'
    );
  } catch {
    return [];
  }
}

export function saveLocalDailyEntries(entries: DailyLeaderboardEntry[]): void {
  try {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const trimmed = entries.filter((e) => e.submittedAt >= cutoff).slice(-500);
    localStorage.setItem(DAILY_ENTRIES_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage restrictions
  }
}

export function upsertLocalDailyEntry(entry: DailyLeaderboardEntry): DailyLeaderboardEntry[] {
  const existing = loadLocalDailyEntries();
  const idx = existing.findIndex(
    (e) =>
      e.dateKey === entry.dateKey &&
      e.puzzleType === entry.puzzleType &&
      e.clientId === entry.clientId
  );

  if (idx >= 0) {
    const prev = existing[idx];
    const prevEff = getEffectiveTimeMs({ timeMs: prev.timeMs, penalty: prev.penalty });
    const nextEff = getEffectiveTimeMs({ timeMs: entry.timeMs, penalty: entry.penalty });
    const shouldReplace =
      prev.id === entry.id ||
      (nextEff !== null && (prevEff === null || nextEff <= prevEff));
    existing[idx] = shouldReplace ? entry : { ...prev, playerName: entry.playerName };
  } else {
    existing.push(entry);
  }

  saveLocalDailyEntries(existing);
  // Mirror latest daily completion metadata to a lightweight cookie
  writeCookie(
    'kubi_daily_last',
    JSON.stringify({
      d: entry.dateKey,
      p: entry.puzzleType,
      t: entry.timeMs,
      pen: entry.penalty,
    })
  );
  return existing;
}

export function patchLocalDailyEntry(
  entryId: string,
  patch: { penalty?: SolvePenalty; playerName?: string }
): void {
  const existing = loadLocalDailyEntries();
  const idx = existing.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  existing[idx] = {
    ...existing[idx],
    ...(patch.penalty !== undefined ? { penalty: patch.penalty } : {}),
    ...(patch.playerName !== undefined ? { playerName: patch.playerName } : {}),
  };
  saveLocalDailyEntries(existing);
}

/**
 * Merges server leaderboard entries with locally cached daily entries (by clientId)
 * so solves stored in localStorage/cookies remain visible even if the server restarts.
 */
export function mergeDailyEntries(
  serverEntries: DailyLeaderboardEntry[],
  localEntries: DailyLeaderboardEntry[],
  dateKey: string,
  puzzleType: PuzzleType
): RankedDailyEntry[] {
  const byClient = new Map<string, DailyLeaderboardEntry>();
  for (const e of localEntries) {
    if (e.dateKey === dateKey && e.puzzleType === puzzleType) {
      byClient.set(e.clientId, e);
    }
  }
  for (const e of serverEntries) {
    if (e.dateKey === dateKey && e.puzzleType === puzzleType) {
      byClient.set(e.clientId, e);
    }
  }
  return rankDailyEntries(Array.from(byClient.values()));
}

