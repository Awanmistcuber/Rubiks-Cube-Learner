import {
  normalizeHexColor,
  sanitizeThemeName,
  type CustomThemeRecord,
} from './customThemes';
import type { SolvePenalty, SolveRecord } from './timerStats';
import type { FaceKey, PuzzleType, ThemeId } from './types';

export const BACKUP_SCHEMA_VERSION = 1;

export interface KubiBackupPayload {
  app: 'kubi-studio';
  schemaVersion: 1;
  exportedAt: string;
  activeThemeId?: string;
  customThemes: CustomThemeRecord[];
  solveRecords: SolveRecord[];
}

export type BackupImportMode = 'merge' | 'replace';

export type ParseBackupResult =
  | {
      ok: true;
      payload: KubiBackupPayload;
      skippedThemes: number;
      skippedRecords: number;
    }
  | {
      ok: false;
      error: string;
    };

export interface MergeBackupResult {
  customThemes: CustomThemeRecord[];
  solveRecords: SolveRecord[];
  addedThemes: number;
  updatedThemes: number;
  addedRecords: number;
}

const VALID_BASE_THEMES = new Set<ThemeId>(['atelier', 'monolith', 'pastel', 'graphite']);
const VALID_PUZZLES = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);
const VALID_PENALTIES = new Set<SolvePenalty>(['none', '+2', 'dnf']);

const DEFAULT_FACE_HEX: Record<FaceKey, string> = {
  py: '#F7F7F4',
  ny: '#EBB600',
  pz: '#008F4C',
  nz: '#0E4EC7',
  px: '#C91E1E',
  nx: '#EB5A10',
};

export function createBackupPayload(params: {
  customThemes: CustomThemeRecord[];
  solveRecords: SolveRecord[];
  activeThemeId?: string;
  exportedAt?: Date;
}): KubiBackupPayload {
  return {
    app: 'kubi-studio',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: (params.exportedAt ?? new Date()).toISOString(),
    activeThemeId: params.activeThemeId,
    customThemes: params.customThemes.map((t) => ({
      ...t,
      faceHexColors: { ...t.faceHexColors },
    })),
    solveRecords: params.solveRecords.map((r) => ({ ...r })),
  };
}

export function serializeBackupJson(payload: KubiBackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function getBackupFilename(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `kubi-studio-backup-${y}-${m}-${d}.json`;
}

export function triggerJsonDownload(jsonContent: string, filename: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeCustomTheme(raw: unknown, fallbackIdx: number): CustomThemeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.faceHexColors || typeof obj.faceHexColors !== 'object') return null;

  const rawFaces = obj.faceHexColors as Record<string, unknown>;
  const faceHexColors: Record<FaceKey, string> = {
    py: normalizeHexColor(typeof rawFaces.py === 'string' ? rawFaces.py : '', DEFAULT_FACE_HEX.py),
    ny: normalizeHexColor(typeof rawFaces.ny === 'string' ? rawFaces.ny : '', DEFAULT_FACE_HEX.ny),
    pz: normalizeHexColor(typeof rawFaces.pz === 'string' ? rawFaces.pz : '', DEFAULT_FACE_HEX.pz),
    nz: normalizeHexColor(typeof rawFaces.nz === 'string' ? rawFaces.nz : '', DEFAULT_FACE_HEX.nz),
    px: normalizeHexColor(typeof rawFaces.px === 'string' ? rawFaces.px : '', DEFAULT_FACE_HEX.px),
    nx: normalizeHexColor(typeof rawFaces.nx === 'string' ? rawFaces.nx : '', DEFAULT_FACE_HEX.nx),
  };

  const baseThemeId: ThemeId =
    typeof obj.baseThemeId === 'string' && VALID_BASE_THEMES.has(obj.baseThemeId as ThemeId)
      ? (obj.baseThemeId as ThemeId)
      : 'atelier';

  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  const id = rawId.length > 0 && rawId.length <= 64 ? rawId : `custom-imp-${Date.now().toString(36)}-${fallbackIdx}`;

  const name = sanitizeThemeName(typeof obj.name === 'string' ? obj.name : '') || `Imported Theme ${fallbackIdx + 1}`;
  const accentHex = normalizeHexColor(typeof obj.accentHex === 'string' ? obj.accentHex : '', '#E04F26');
  const chassisHex = normalizeHexColor(typeof obj.chassisHex === 'string' ? obj.chassisHex : '', '#16171B');
  const createdAt =
    typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) && obj.createdAt > 0
      ? Math.round(obj.createdAt)
      : Date.now();

  return {
    id,
    name,
    baseThemeId,
    accentHex,
    chassisHex,
    faceHexColors,
    createdAt,
  };
}

function sanitizeSolveRecord(raw: unknown, fallbackIdx: number): SolveRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.puzzleType !== 'string' || !VALID_PUZZLES.has(obj.puzzleType as PuzzleType)) {
    return null;
  }
  if (typeof obj.timeMs !== 'number' || !Number.isFinite(obj.timeMs) || obj.timeMs <= 0) {
    return null;
  }

  const penalty: SolvePenalty =
    typeof obj.penalty === 'string' && VALID_PENALTIES.has(obj.penalty as SolvePenalty)
      ? (obj.penalty as SolvePenalty)
      : 'none';

  const source: 'stopwatch' | 'virtual3d' = obj.source === 'virtual3d' ? 'virtual3d' : 'stopwatch';
  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  const id = rawId.length > 0 && rawId.length <= 80 ? rawId : `rec-imp-${Date.now().toString(36)}-${fallbackIdx}`;
  const scramble = typeof obj.scramble === 'string' ? obj.scramble.trim().slice(0, 260) : '';
  const timestamp =
    typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp) && obj.timestamp > 0
      ? Math.round(obj.timestamp)
      : Date.now();

  const record: SolveRecord = {
    id,
    puzzleType: obj.puzzleType as PuzzleType,
    timeMs: Math.round(obj.timeMs),
    penalty,
    scramble,
    source,
    timestamp,
  };

  if (typeof obj.moves === 'number' && Number.isFinite(obj.moves) && obj.moves >= 0) {
    record.moves = Math.round(obj.moves);
  }

  return record;
}

/**
 * Parses and strictly validates a Kubi Studio backup JSON string.
 */
export function parseBackupJson(rawText: string): ParseBackupResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Backup file is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'Invalid JSON file. Please choose a valid Kubi Studio backup.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Backup JSON must be an object containing customThemes or solveRecords.' };
  }

  const obj = parsed as Record<string, unknown>;
  const hasThemesArray = Array.isArray(obj.customThemes);
  const hasRecordsArray = Array.isArray(obj.solveRecords);

  if (!hasThemesArray && !hasRecordsArray) {
    return {
      ok: false,
      error: 'Unrecognized backup format. Missing customThemes and solveRecords arrays.',
    };
  }

  const customThemes: CustomThemeRecord[] = [];
  let skippedThemes = 0;
  if (hasThemesArray) {
    (obj.customThemes as unknown[]).forEach((entry, i) => {
      const clean = sanitizeCustomTheme(entry, i);
      if (clean) customThemes.push(clean);
      else skippedThemes++;
    });
  }

  const solveRecords: SolveRecord[] = [];
  let skippedRecords = 0;
  if (hasRecordsArray) {
    (obj.solveRecords as unknown[]).forEach((entry, i) => {
      const clean = sanitizeSolveRecord(entry, i);
      if (clean) solveRecords.push(clean);
      else skippedRecords++;
    });
  }

  const isOfficialEnvelope = obj.app === 'kubi-studio';
  if (!isOfficialEnvelope && customThemes.length === 0 && solveRecords.length === 0) {
    return {
      ok: false,
      error: 'No valid custom themes or solve records were found in this JSON file.',
    };
  }

  const activeThemeId =
    typeof obj.activeThemeId === 'string' && obj.activeThemeId.trim().length > 0
      ? obj.activeThemeId.trim()
      : undefined;

  return {
    ok: true,
    payload: {
      app: 'kubi-studio',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      activeThemeId,
      customThemes,
      solveRecords,
    },
    skippedThemes,
    skippedRecords,
  };
}

/**
 * Combines existing local state with imported backup data using either 'merge' (deduplicated) or 'replace'.
 */
export function mergeBackupData(
  existing: {
    customThemes: CustomThemeRecord[];
    solveRecords: SolveRecord[];
  },
  incoming: KubiBackupPayload,
  mode: BackupImportMode = 'merge'
): MergeBackupResult {
  if (mode === 'replace') {
    const nextThemes = incoming.customThemes.slice(0, 24);
    const nextRecords = [...incoming.solveRecords]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-1000);
    return {
      customThemes: nextThemes,
      solveRecords: nextRecords,
      addedThemes: nextThemes.length,
      updatedThemes: 0,
      addedRecords: nextRecords.length,
    };
  }

  // Merge custom themes by ID
  const themeMap = new Map<string, CustomThemeRecord>();
  for (const t of existing.customThemes) {
    themeMap.set(t.id, t);
  }
  let addedThemes = 0;
  let updatedThemes = 0;
  for (const t of incoming.customThemes) {
    if (themeMap.has(t.id)) {
      updatedThemes++;
    } else {
      addedThemes++;
    }
    themeMap.set(t.id, t);
  }
  const mergedThemes = Array.from(themeMap.values()).slice(0, 24);

  // Merge solve records by ID
  const recordMap = new Map<string, SolveRecord>();
  for (const r of existing.solveRecords) {
    recordMap.set(r.id, r);
  }
  let addedRecords = 0;
  for (const r of incoming.solveRecords) {
    if (!recordMap.has(r.id)) {
      addedRecords++;
    }
    recordMap.set(r.id, r);
  }
  const mergedRecords = Array.from(recordMap.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-1000);

  return {
    customThemes: mergedThemes,
    solveRecords: mergedRecords,
    addedThemes,
    updatedThemes,
    addedRecords,
  };
}
