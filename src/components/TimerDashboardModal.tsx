import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Box,
  Check,
  Copy,
  Download,
  RefreshCw,
  Search,
  Timer,
  Trash2,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import { cubeAudio } from '../cube/audio';
import type { BackupImportMode } from '../cube/backup';
import { PUZZLE_META } from '../cube/curriculum';
import {
  generateDailyScramble,
  getNextUtcMidnightMs,
  getOrCreateClientId,
  getUtcDateKey,
  loadLocalDailyEntries,
  loadPlayerName,
  mergeDailyEntries,
  patchLocalDailyEntry,
  savePlayerName,
  upsertLocalDailyEntry,
  type DailyChallengeResponse,
  type DailyLeaderboardEntry,
} from '../cube/dailyChallenge';
import {
  computeSessionStats,
  exportRecordsToCsv,
  formatPreciseTime,
  formatRecordTime,
  generateWcaScrambleString,
  type SolvePenalty,
  type SolveRecord,
} from '../cube/timerStats';
import type { PuzzleType, ThemePalette } from '../cube/types';
import {
  DistributionHistogramChart,
  PuzzleComparisonChart,
  SolveProgressionChart,
} from './AnalyticsCharts';
import { DailyChallengeEntryCard, DailyChallengePanel } from './DailyChallengePanel';

export type TimerDashboardTab = 'stopwatch' | 'dashboard' | 'daily';

interface TimerDashboardModalProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  initialTab: TimerDashboardTab;
  records: SolveRecord[];
  customThemesCount: number;
  onClose: () => void;
  onSelectPuzzle: (p: PuzzleType) => void;
  onAddRecord: (rec: SolveRecord) => void;
  onUpdatePenalty: (id: string, penalty: SolvePenalty) => void;
  onDeleteRecord: (id: string) => void;
  onClearPuzzleRecords: (puzzle: PuzzleType) => void;
  onRestoreDemoRecords: () => void;
  onExportBackupJson: () => { ok: boolean; message: string };
  onImportBackupJson: (rawText: string, mode: BackupImportMode) => { ok: boolean; message: string };
  onApplyScrambleTo3D: (puzzle: PuzzleType, scramble: string) => void;
  onPlayDailyIn3D: (puzzle: PuzzleType, scramble: string, dateKey: string) => void;
}

const PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];

type StopwatchPhase = 'idle' | 'inspection' | 'holding' | 'ready' | 'running';

export const TimerDashboardModal: React.FC<TimerDashboardModalProps> = ({
  theme,
  puzzleType,
  initialTab,
  records,
  customThemesCount,
  onClose,
  onSelectPuzzle,
  onAddRecord,
  onUpdatePenalty,
  onDeleteRecord,
  onClearPuzzleRecords,
  onRestoreDemoRecords,
  onExportBackupJson,
  onImportBackupJson,
  onApplyScrambleTo3D,
  onPlayDailyIn3D,
}) => {
  const [viewTab, setViewTab] = useState<TimerDashboardTab>(initialTab);
  const [scramble, setScramble] = useState<string>(() => generateWcaScrambleString(puzzleType));
  const [copied, setCopied] = useState(false);
  const [useInspection, setUseInspection] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'stopwatch' | 'virtual3d'>('all');
  const [backupFeedback, setBackupFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleDashboardImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setBackupFeedback(onImportBackupJson(text, 'merge'));
    } catch {
      setBackupFeedback({ ok: false, message: 'Unable to read the selected JSON file.' });
    }
  };

  // Shared Daily Challenge & Global Leaderboard state
  const [clientId] = useState<string>(() => getOrCreateClientId());
  const [playerName, setPlayerName] = useState<string>(() => loadPlayerName());
  const [dailyData, setDailyData] = useState<DailyChallengeResponse | null>(null);
  const [dailyLoading, setDailyLoading] = useState<boolean>(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  // Stopwatch state
  const [phase, setPhase] = useState<StopwatchPhase>('idle');
  const [displayMs, setDisplayMs] = useState(0);
  const [inspectionSec, setInspectionSec] = useState(15);
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null);

  const phaseRef = useRef<StopwatchPhase>('idle');
  const startTimeRef = useRef(0);
  const holdTimerRef = useRef<number | null>(null);
  const inspectionStartRef = useRef(0);
  const rafRef = useRef<number>(0);
  const scrambleRef = useRef(scramble);
  const puzzleRef = useRef(puzzleType);

  phaseRef.current = phase;
  scrambleRef.current = scramble;
  puzzleRef.current = puzzleType;

  // Regenerate scramble when switching puzzle configurations
  useEffect(() => {
    setScramble(generateWcaScrambleString(puzzleType));
    setLastLoggedId(null);
  }, [puzzleType]);

  // Fetch Daily Challenge & Global Leaderboard whenever puzzle changes (merged with localStorage/cookie cache)
  const fetchDailyChallenge = useCallback(async () => {
    setDailyLoading(true);
    setDailyError(null);
    const localEntries = loadLocalDailyEntries();
    try {
      const res = await fetch(
        `/api/daily-challenge?puzzle=${encodeURIComponent(puzzleType)}&clientId=${encodeURIComponent(clientId)}`
      );
      if (!res.ok) throw new Error('Unable to load Daily Challenge leaderboard.');
      const json = (await res.json()) as DailyChallengeResponse;
      const merged = mergeDailyEntries(json.leaderboard, localEntries, json.dateKey, puzzleType);
      setDailyData({
        ...json,
        leaderboard: merged,
        totalParticipants: merged.length,
        userEntry: merged.find((r) => r.clientId === clientId) ?? json.userEntry,
      });
    } catch {
      // Fallback cleanly to localStorage + cookie persistence if network is unavailable
      const dateKey = getUtcDateKey();
      const merged = mergeDailyEntries([], localEntries, dateKey, puzzleType);
      setDailyData({
        dateKey,
        puzzleType,
        scramble: generateDailyScramble(dateKey, puzzleType),
        nextResetMs: getNextUtcMidnightMs(),
        totalParticipants: merged.length,
        leaderboard: merged,
        userEntry: merged.find((r) => r.clientId === clientId) ?? null,
      });
    } finally {
      setDailyLoading(false);
    }
  }, [clientId, puzzleType]);

  useEffect(() => {
    void fetchDailyChallenge();
  }, [fetchDailyChallenge]);

  const handleChangePlayerName = useCallback((nextName: string) => {
    const clean = savePlayerName(nextName);
    setPlayerName(clean);
  }, []);

  const handleSubmitDailySolve = useCallback(
    async (payload: {
      puzzleType: PuzzleType;
      timeMs: number;
      penalty: SolvePenalty;
      source: 'stopwatch' | 'virtual3d';
      scramble: string;
    }): Promise<{ entryId: string | null; improved: boolean; rank: number | null }> => {
      const dateKey = dailyData?.dateKey ?? getUtcDateKey();
      const fallbackEntry: DailyLeaderboardEntry = {
        id: `dc-local-${Date.now().toString(36)}`,
        dateKey,
        puzzleType: payload.puzzleType,
        clientId,
        playerName,
        timeMs: payload.timeMs,
        penalty: payload.penalty,
        source: payload.source,
        submittedAt: Date.now(),
      };

      try {
        const res = await fetch('/api/daily-challenge/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            puzzleType: payload.puzzleType,
            clientId,
            playerName,
            timeMs: payload.timeMs,
            penalty: payload.penalty,
            source: payload.source,
          }),
        });
        if (!res.ok) throw new Error('Failed to post solve to Daily Challenge leaderboard.');
        const json = (await res.json()) as DailyChallengeResponse & {
          entry?: DailyLeaderboardEntry;
          improved?: boolean;
        };
        const persistedEntry = json.entry ?? fallbackEntry;
        const localEntries = upsertLocalDailyEntry(persistedEntry);
        const merged = mergeDailyEntries(json.leaderboard, localEntries, json.dateKey, payload.puzzleType);
        const userEntry = merged.find((r) => r.clientId === clientId) ?? json.userEntry;
        setDailyData({
          ...json,
          leaderboard: merged,
          totalParticipants: merged.length,
          userEntry,
        });
        setDailyError(null);
        return {
          entryId: persistedEntry.id,
          improved: json.improved ?? true,
          rank: userEntry?.rank ?? null,
        };
      } catch {
        // Persist in localStorage & cookie so user's Daily Challenge attempt is never lost
        const localEntries = upsertLocalDailyEntry(fallbackEntry);
        const merged = mergeDailyEntries(dailyData?.leaderboard ?? [], localEntries, dateKey, payload.puzzleType);
        const userEntry = merged.find((r) => r.clientId === clientId) ?? null;
        setDailyData({
          dateKey,
          puzzleType: payload.puzzleType,
          scramble: dailyData?.scramble ?? generateDailyScramble(dateKey, payload.puzzleType),
          nextResetMs: dailyData?.nextResetMs ?? getNextUtcMidnightMs(),
          totalParticipants: merged.length,
          leaderboard: merged,
          userEntry,
        });
        return {
          entryId: fallbackEntry.id,
          improved: true,
          rank: userEntry?.rank ?? null,
        };
      }
    },
    [clientId, dailyData, playerName]
  );

  const handlePatchDailyEntry = useCallback(
    async (entryId: string, patch: { penalty?: SolvePenalty; playerName?: string }) => {
      patchLocalDailyEntry(entryId, patch);
      try {
        const res = await fetch(`/api/daily-challenge/entry/${encodeURIComponent(entryId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            ...patch,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as DailyChallengeResponse;
          const localEntries = loadLocalDailyEntries();
          const merged = mergeDailyEntries(json.leaderboard, localEntries, json.dateKey, json.puzzleType);
          setDailyData({
            ...json,
            leaderboard: merged,
            totalParticipants: merged.length,
            userEntry: merged.find((r) => r.clientId === clientId) ?? json.userEntry,
          });
          return;
        }
      } catch {
        // fall through to local re-rank
      }
      if (dailyData) {
        const localEntries = loadLocalDailyEntries();
        const merged = mergeDailyEntries([], localEntries, dailyData.dateKey, dailyData.puzzleType);
        setDailyData({
          ...dailyData,
          leaderboard: merged,
          totalParticipants: merged.length,
          userEntry: merged.find((r) => r.clientId === clientId) ?? null,
        });
      }
    },
    [clientId, dailyData]
  );

  // Filtered puzzle records & stats
  const puzzleRecords = useMemo(
    () => records.filter((r) => r.puzzleType === puzzleType),
    [records, puzzleType]
  );

  const stats = useMemo(() => computeSessionStats(puzzleRecords), [puzzleRecords]);

  const allPuzzleComparison = useMemo(
    () =>
      PUZZLES.map((p) => {
        const subset = records.filter((r) => r.puzzleType === p);
        const s = computeSessionStats(subset);
        return {
          puzzleType: p,
          count: s.totalCount,
          bestMs: s.bestSingleMs,
          meanMs: s.sessionMeanMs,
        };
      }),
    [records]
  );

  const latestRecord = useMemo(() => {
    if (lastLoggedId) {
      return puzzleRecords.find((r) => r.id === lastLoggedId) ?? null;
    }
    if (puzzleRecords.length === 0) return null;
    return [...puzzleRecords].sort((a, b) => b.timestamp - a.timestamp)[0];
  }, [lastLoggedId, puzzleRecords]);

  // Live 60fps stopwatch animation loop
  useEffect(() => {
    const tick = () => {
      if (phaseRef.current === 'running') {
        setDisplayMs(performance.now() - startTimeRef.current);
        rafRef.current = requestAnimationFrame(tick);
      } else if (phaseRef.current === 'inspection') {
        const elapsed = (performance.now() - inspectionStartRef.current) / 1000;
        const remaining = Math.max(0, Math.ceil(15 - elapsed));
        setInspectionSec(remaining);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (phase === 'running' || phase === 'inspection') {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const stopStopwatch = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    const finalMs = Math.max(10, Math.round(performance.now() - startTimeRef.current));
    setDisplayMs(finalMs);
    setPhase('idle');
    cubeAudio.playTurnClick(true);

    const newRecord: SolveRecord = {
      id: `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      puzzleType: puzzleRef.current,
      timeMs: finalMs,
      penalty: 'none',
      scramble: scrambleRef.current,
      source: 'stopwatch',
      timestamp: Date.now(),
    };
    onAddRecord(newRecord);
    setLastLoggedId(newRecord.id);
    setScramble(generateWcaScrambleString(puzzleRef.current));
  }, [onAddRecord]);

  const startStopwatch = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    startTimeRef.current = performance.now();
    setDisplayMs(0);
    setPhase('running');
    cubeAudio.playUiTick();
  }, []);

  const handlePadToggleClick = useCallback(() => {
    if (phaseRef.current === 'running') {
      stopStopwatch();
    } else if (phaseRef.current === 'inspection') {
      startStopwatch();
    } else if (useInspection) {
      inspectionStartRef.current = performance.now();
      setInspectionSec(15);
      setPhase('inspection');
      cubeAudio.playUiTick();
    } else {
      startStopwatch();
    }
  }, [startStopwatch, stopStopwatch, useInspection]);

  // Laptop Spacebar Stackmat Hold-to-Ready + Any-Key Stop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (phaseRef.current === 'running') {
          stopStopwatch();
        } else {
          onClose();
        }
        return;
      }

      if (viewTab !== 'stopwatch') return;

      if (phaseRef.current === 'running') {
        e.preventDefault();
        stopStopwatch();
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (phaseRef.current === 'idle' && useInspection) {
          inspectionStartRef.current = performance.now();
          setInspectionSec(15);
          setPhase('inspection');
          return;
        }
        setPhase('holding');
        holdTimerRef.current = window.setTimeout(() => {
          setPhase('ready');
          cubeAudio.playUiTick();
        }, 280);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (viewTab !== 'stopwatch' || e.code !== 'Space') return;
      e.preventDefault();
      if (holdTimerRef.current) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (phaseRef.current === 'ready') {
        startStopwatch();
      } else if (phaseRef.current === 'holding') {
        setPhase('idle');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, [onClose, startStopwatch, stopStopwatch, useInspection, viewTab]);

  const handleCopyScramble = () => {
    navigator.clipboard?.writeText(scramble).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleExportCsv = () => {
    const csv = exportRecordsToCsv(puzzleRecords);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubi-${puzzleType}-solves.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredTableRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...puzzleRecords]
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((r) => {
        if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
        if (!q) return true;
        return (
          r.scramble.toLowerCase().includes(q) ||
          formatRecordTime(r).toLowerCase().includes(q)
        );
      });
  }, [puzzleRecords, searchQuery, sourceFilter]);

  const timerAccentColor =
    phase === 'ready'
      ? '#16A34A'
      : phase === 'holding'
        ? '#D97706'
        : phase === 'inspection'
          ? theme.ui.accent
          : theme.ui.text;

  const trendText =
    stats.trendDeltaMs === null
      ? `${stats.validCount} valid solves`
      : stats.trendDeltaMs < 0
        ? `${(Math.abs(stats.trendDeltaMs) / 1000).toFixed(2)}s faster recently`
        : `+${(stats.trendDeltaMs / 1000).toFixed(2)}s vs early solves`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Speedcube Stopwatch and Timing Analytics Dashboard"
      className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-5"
      style={{ backgroundColor: 'rgba(10, 12, 16, 0.56)' }}
    >
      <div
        className="w-full max-w-[1120px] max-h-[94dvh] rounded-2xl border flex flex-col overflow-hidden animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        {/* Top Studio Workspace Header */}
        <div
          className="px-3 sm:px-5 py-2.5 sm:py-3 border-b flex flex-wrap items-center justify-between gap-2 sm:gap-2.5 shrink-0"
          style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surfaceSubtle }}
        >
          {/* Left: View Switcher */}
          <div
            role="tablist"
            aria-label="Timing workspace views"
            className="order-1 flex items-center gap-0.5 sm:gap-1 p-1 rounded-xl border min-w-0"
            style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surface }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === 'stopwatch'}
              onClick={() => setViewTab('stopwatch')}
              className="h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: viewTab === 'stopwatch' ? theme.ui.accent : 'transparent',
                color: viewTab === 'stopwatch' ? theme.ui.accentFg : theme.ui.muted,
              }}
            >
              <Timer className="w-4 h-4 shrink-0" />
              <span className="max-[370px]:hidden">Stopwatch</span>
              <span className="hidden max-[370px]:inline">Timer</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === 'dashboard'}
              onClick={() => setViewTab('dashboard')}
              className="h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: viewTab === 'dashboard' ? theme.ui.accent : 'transparent',
                color: viewTab === 'dashboard' ? theme.ui.accentFg : theme.ui.muted,
              }}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Stats</span>
              <span className="hidden sm:inline">Dashboard & Graphs</span>
            </button>
            <button
              type="button"
              role="tab"
              data-testid="tab-daily-challenge"
              aria-selected={viewTab === 'daily'}
              onClick={() => setViewTab('daily')}
              className="h-9 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: viewTab === 'daily' ? theme.ui.accent : 'transparent',
                color: viewTab === 'daily' ? theme.ui.accentFg : theme.ui.muted,
              }}
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Daily</span>
              <span className="hidden sm:inline">Daily Challenge</span>
            </button>
          </div>

          {/* Center: Configuration Selector (full-width row on phone, inline center on tablet/desktop) */}
          <div
            className="order-3 lg:order-2 w-full lg:w-auto flex items-center justify-between lg:justify-start gap-1 p-1 rounded-xl border"
            style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surface }}
          >
            {PUZZLES.map((p) => {
              const active = p === puzzleType;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSelectPuzzle(p)}
                  aria-pressed={active}
                  className="flex-1 lg:flex-initial h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: active ? theme.ui.accentSoft : 'transparent',
                    color: active ? theme.ui.accent : theme.ui.muted,
                  }}
                >
                  {PUZZLE_META[p].shortLabel}
                </button>
              );
            })}
          </div>

          {/* Right: Close back to 3D Studio (always anchored top-right on mobile, tablet & desktop) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stopwatch and return to 3D cube"
            className="order-2 lg:order-3 h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            style={{
              backgroundColor: theme.ui.surface,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">3D Cube</span>
          </button>
        </div>

        {/* Scrollable Workspace Body */}
        <div className="flex-1 overflow-y-auto kubi-scroll p-3.5 sm:p-6">
          {/* ==================== VIEW 1: BUILT-IN STOPWATCH ==================== */}
          {viewTab === 'stopwatch' && (
            <div className="max-w-3xl mx-auto flex flex-col gap-5">
              {/* WCA Scramble Bar */}
              <div
                className="rounded-xl border p-4"
                style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-semibold" style={{ color: theme.ui.muted }}>
                    WCA Scramble · {PUZZLE_META[puzzleType].label}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setScramble(generateWcaScrambleString(puzzleType))}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">New</span>
                      <span className="hidden sm:inline">New Scramble</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyScramble}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onApplyScrambleTo3D(puzzleType, scramble)}
                      className="h-8 px-2.5 sm:px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.accent,
                        color: theme.ui.accentFg,
                      }}
                    >
                      <Box className="w-3.5 h-3.5 shrink-0" />
                      <span>Apply to 3D</span>
                    </button>
                  </div>
                </div>

                <p
                  data-testid="wca-scramble-text"
                  className="font-mono-tabular text-sm sm:text-base font-medium leading-relaxed tracking-wide select-text"
                  style={{ color: theme.ui.text }}
                >
                  {scramble}
                </p>
              </div>

              {/* Main Tactile Stopwatch Stage */}
              <div
                className="rounded-2xl border p-6 sm:p-8 flex flex-col items-center text-center"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor:
                    phase === 'ready'
                      ? '#16A34A'
                      : phase === 'running'
                        ? theme.ui.accent
                        : theme.ui.border,
                }}
              >
                <div className="flex items-center justify-between w-full mb-4 text-xs">
                  <span style={{ color: theme.ui.muted }}>
                    {phase === 'running'
                      ? 'Solving — Press Space or Tap Stop'
                      : phase === 'ready'
                        ? 'Ready — Release Space to Start'
                        : phase === 'holding'
                          ? 'Keep holding Space...'
                          : phase === 'inspection'
                            ? '15s WCA Inspection — Tap or Hold Space when ready'
                            : 'Hold Space (Laptop) or Tap Start (Touch)'}
                  </span>

                  <button
                    type="button"
                    onClick={() => setUseInspection((v) => !v)}
                    aria-pressed={useInspection}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium cursor-pointer whitespace-nowrap"
                    style={{
                      backgroundColor: useInspection ? theme.ui.accentSoft : theme.ui.surface,
                      borderColor: useInspection ? theme.ui.accent : theme.ui.border,
                      color: useInspection ? theme.ui.accent : theme.ui.muted,
                    }}
                  >
                    15s Inspection: {useInspection ? 'On' : 'Off'}
                  </button>
                </div>

                {/* Large Precision Centisecond Readout */}
                <div
                  data-testid="stopwatch-readout"
                  className="font-mono-tabular text-6xl sm:text-7xl md:text-8xl font-semibold tracking-tight my-3 sm:my-5 transition-colors duration-150"
                  style={{ color: timerAccentColor }}
                >
                  {phase === 'inspection'
                    ? `${inspectionSec}s`
                    : phase === 'idle' && lastLoggedId && latestRecord && latestRecord.id === lastLoggedId
                      ? formatRecordTime(latestRecord)
                      : formatPreciseTime(displayMs, '0.00')}
                </div>

                {/* Big Touch & Mouse Primary Start/Stop Button */}
                <button
                  type="button"
                  data-testid="stopwatch-toggle-btn"
                  onClick={handlePadToggleClick}
                  className="mt-2 h-13 px-10 rounded-xl font-semibold text-sm sm:text-base transition-transform duration-150 active:scale-[0.98] cursor-pointer"
                  style={{
                    backgroundColor: phase === 'running' ? '#DC2626' : theme.ui.accent,
                    color: '#FFFFFF',
                  }}
                >
                  {phase === 'running'
                    ? 'Stop Timer'
                    : phase === 'inspection'
                      ? 'Start Solve Now'
                      : useInspection
                        ? 'Start Inspection'
                        : 'Start Stopwatch'}
                </button>

                {/* Instant Post-Solve Penalty Controls for Latest Solve */}
                {latestRecord && phase === 'idle' && (
                  <div
                    className="mt-6 pt-4 border-t w-full flex flex-wrap items-center justify-between gap-2 text-xs"
                    style={{ borderColor: theme.ui.border }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ color: theme.ui.muted }}>Latest Solve:</span>
                      <span
                        data-testid="latest-solve-time"
                        className="font-mono-tabular font-semibold text-sm"
                        style={{ color: theme.ui.text }}
                      >
                        {formatRecordTime(latestRecord)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(['none', '+2', 'dnf'] as const).map((pen) => {
                        const active = latestRecord.penalty === pen;
                        return (
                          <button
                            key={pen}
                            type="button"
                            onClick={() => onUpdatePenalty(latestRecord.id, pen)}
                            className="h-8 px-3 rounded-lg border font-mono-tabular text-xs font-semibold cursor-pointer"
                            style={{
                              backgroundColor: active ? theme.ui.accentSoft : theme.ui.surface,
                              borderColor: active ? theme.ui.accent : theme.ui.border,
                              color: active ? theme.ui.accent : theme.ui.text,
                            }}
                          >
                            {pen === 'none' ? 'OK' : pen.toUpperCase()}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        aria-label="Delete latest solve"
                        onClick={() => {
                          onDeleteRecord(latestRecord.id);
                          setLastLoggedId(null);
                          setDisplayMs(0);
                        }}
                        className="h-8 w-8 rounded-lg border flex items-center justify-center cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.muted,
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Clean Live Session Metrics Strip */}
              <div
                className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x rounded-xl border"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                }}
              >
                {[
                  { label: 'Best Single', value: formatPreciseTime(stats.bestSingleMs) },
                  { label: 'Current Ao5', value: formatPreciseTime(stats.currentAo5Ms) },
                  { label: 'Current Ao12', value: formatPreciseTime(stats.currentAo12Ms) },
                  { label: 'Session Mean', value: formatPreciseTime(stats.sessionMeanMs) },
                  { label: 'Solves', value: `${stats.validCount}/${stats.totalCount}` },
                ].map((metric, idx) => (
                  <div
                    key={metric.label}
                    className={`p-3 sm:p-3.5 text-center ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
                    style={{ borderColor: theme.ui.border }}
                  >
                    <div className="text-[11px] font-medium" style={{ color: theme.ui.muted }}>
                      {metric.label}
                    </div>
                    <div
                      className="font-mono-tabular text-base sm:text-lg font-bold mt-0.5"
                      style={{ color: theme.ui.text }}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== VIEW 2: ANALYTICS DASHBOARD & GRAPHS ==================== */}
          {viewTab === 'dashboard' && (
            <div className="flex flex-col gap-5">
              {/* Global Daily Challenge Leaderboard Entry Point */}
              <DailyChallengeEntryCard
                theme={theme}
                puzzleType={puzzleType}
                data={dailyData}
                loading={dailyLoading}
                onOpenDailyLeaderboard={() => setViewTab('daily')}
                onPlayDailyIn3D={onPlayDailyIn3D}
              />

              {/* 4-Column KPI Summary Strip (Single Elevation, Clean Hairline Dividers) */}
              <div
                className="grid grid-cols-2 lg:grid-cols-4 gap-3"
                data-testid="dashboard-kpi-strip"
              >
                {[
                  {
                    label: 'Personal Best',
                    value: formatPreciseTime(stats.bestSingleMs),
                    sub: `${PUZZLE_META[puzzleType].label} single`,
                    highlight: true,
                  },
                  {
                    label: 'Current Ao5',
                    value: formatPreciseTime(stats.currentAo5Ms),
                    sub: `Best Ao5: ${formatPreciseTime(stats.bestAo5Ms)}`,
                    highlight: false,
                  },
                  {
                    label: 'Current Ao12',
                    value: formatPreciseTime(stats.currentAo12Ms),
                    sub: `Best Ao12: ${formatPreciseTime(stats.bestAo12Ms)}`,
                    highlight: false,
                  },
                  {
                    label: 'Session Mean',
                    value: formatPreciseTime(stats.sessionMeanMs),
                    sub: trendText,
                    highlight: false,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border p-4"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                    }}
                  >
                    <div className="text-xs font-medium" style={{ color: theme.ui.muted }}>
                      {kpi.label}
                    </div>
                    <div
                      className="font-mono-tabular text-2xl sm:text-3xl font-bold mt-1"
                      style={{ color: kpi.highlight ? theme.ui.accent : theme.ui.text }}
                    >
                      {kpi.value}
                    </div>
                    <div className="text-[11px] mt-1 truncate" style={{ color: theme.ui.muted }}>
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Primary Graph: Solve Progression & Rolling Ao5/Ao12 */}
              <SolveProgressionChart
                theme={theme}
                series={stats.series}
                puzzleLabel={PUZZLE_META[puzzleType].label}
              />

              {/* Secondary Graphs Row: Distribution Histogram + Cross-Cube Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DistributionHistogramChart theme={theme} bins={stats.histogram} />
                <PuzzleComparisonChart
                  theme={theme}
                  rows={allPuzzleComparison}
                  activePuzzle={puzzleType}
                  onSelectPuzzle={onSelectPuzzle}
                />
              </div>

              {/* High-Density Solve Log & Controls */}
              <div
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
              >
                <div
                  className="p-3.5 border-b flex flex-wrap items-center justify-between gap-2.5"
                  style={{ borderColor: theme.ui.border }}
                >
                  <div>
                    <h3 className="font-display text-sm font-semibold" style={{ color: theme.ui.text }}>
                      Solve History ({puzzleRecords.length})
                    </h3>
                    <p className="text-xs" style={{ color: theme.ui.muted }}>
                      Click any scramble to replay it on the 3D cube or adjust WCA penalties
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search
                        className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: theme.ui.muted }}
                      />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter scrambles..."
                        aria-label="Filter solve history"
                        className="h-9 pl-8 pr-3 rounded-lg border text-xs outline-none w-40 sm:w-48"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      />
                    </div>

                    <select
                      aria-label="Filter by solve source"
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value as 'all' | 'stopwatch' | 'virtual3d')}
                      className="h-9 px-2.5 rounded-lg border text-xs font-medium outline-none cursor-pointer"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <option value="all">All Sources</option>
                      <option value="stopwatch">Stopwatch</option>
                      <option value="virtual3d">3D Cube</option>
                    </select>

                    <button
                      type="button"
                      disabled={puzzleRecords.length === 0}
                      onClick={handleExportCsv}
                      className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>CSV</span>
                    </button>

                    <button
                      type="button"
                      data-testid="dashboard-export-json-btn"
                      onClick={() => setBackupFeedback(onExportBackupJson())}
                      title={`Export ${customThemesCount} custom themes & ${records.length} solves as JSON`}
                      className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Backup JSON</span>
                    </button>

                    <button
                      type="button"
                      data-testid="dashboard-import-json-btn"
                      onClick={() => backupFileInputRef.current?.click()}
                      title="Import custom themes and solve records from a JSON backup"
                      className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.surface,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>Import JSON</span>
                    </button>

                    <input
                      ref={backupFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      data-testid="dashboard-import-json-input"
                      aria-label="Import backup JSON file into Timing Dashboard"
                      onChange={(e) => void handleDashboardImportFile(e)}
                      className="hidden"
                    />

                    {puzzleRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onClearPuzzleRecords(puzzleType)}
                        className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.muted,
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                {backupFeedback && (
                  <div
                    role={backupFeedback.ok ? 'status' : 'alert'}
                    data-testid="dashboard-backup-feedback"
                    className="px-3.5 py-2 border-b flex items-center justify-between gap-2 text-xs font-medium"
                    style={{
                      backgroundColor: backupFeedback.ok ? theme.ui.accentSoft : 'rgba(220, 38, 38, 0.08)',
                      borderColor: theme.ui.border,
                      color: backupFeedback.ok ? theme.ui.text : '#DC2626',
                    }}
                  >
                    <span>{backupFeedback.message}</span>
                    <button
                      type="button"
                      onClick={() => setBackupFeedback(null)}
                      aria-label="Dismiss backup notice"
                      className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {filteredTableRecords.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-medium" style={{ color: theme.ui.text }}>
                      No solves logged for {PUZZLE_META[puzzleType].label}
                    </p>
                    <p className="text-xs mt-1 mb-4" style={{ color: theme.ui.muted }}>
                      Time your physical cube in the Stopwatch or solve a scrambled 3D cube to build your performance charts.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewTab('stopwatch')}
                        className="h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
                        style={{ backgroundColor: theme.ui.accent, color: theme.ui.accentFg }}
                      >
                        Start First Solve
                      </button>
                      <button
                        type="button"
                        onClick={onRestoreDemoRecords}
                        className="h-9 px-4 rounded-lg border text-xs font-medium cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        Load Sample Data
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto kubi-scroll">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr
                          className="border-b text-[11px] font-semibold"
                          style={{ borderColor: theme.ui.border, color: theme.ui.muted }}
                        >
                          <th className="py-2.5 px-3.5">#</th>
                          <th className="py-2.5 px-3">Time</th>
                          <th className="py-2.5 px-3 hidden sm:table-cell">Mode</th>
                          <th className="py-2.5 px-3 hidden sm:table-cell">Scramble</th>
                          <th className="py-2.5 px-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: theme.ui.border }}>
                        {filteredTableRecords.map((rec, idx) => {
                          const solveNum = filteredTableRecords.length - idx;
                          return (
                            <tr
                              key={rec.id}
                              className="text-xs"
                              style={{ borderColor: theme.ui.border }}
                            >
                              <td
                                className="py-2.5 px-3.5 font-mono-tabular"
                                style={{ color: theme.ui.muted }}
                              >
                                {solveNum}
                              </td>
                              <td
                                className="py-2.5 px-3 font-mono-tabular font-semibold whitespace-nowrap"
                                style={{
                                  color: rec.penalty === 'dnf' ? '#DC2626' : theme.ui.text,
                                }}
                              >
                                {formatRecordTime(rec)}
                              </td>
                              <td
                                className="py-2.5 px-3 hidden sm:table-cell whitespace-nowrap"
                                style={{ color: theme.ui.muted }}
                              >
                                {rec.source === 'virtual3d' ? '3D Cube' : 'Stopwatch'}
                              </td>
                              <td
                                className="py-2.5 px-3 hidden sm:table-cell font-mono-tabular text-[11px] max-w-[260px] truncate"
                                style={{ color: theme.ui.muted }}
                                title={rec.scramble}
                              >
                                {rec.scramble}
                              </td>
                              <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdatePenalty(rec.id, rec.penalty === '+2' ? 'none' : '+2')
                                    }
                                    className="h-7 px-2 rounded border font-mono-tabular text-[11px] font-semibold cursor-pointer"
                                    style={{
                                      backgroundColor:
                                        rec.penalty === '+2' ? theme.ui.accentSoft : theme.ui.surface,
                                      borderColor:
                                        rec.penalty === '+2' ? theme.ui.accent : theme.ui.border,
                                      color:
                                        rec.penalty === '+2' ? theme.ui.accent : theme.ui.muted,
                                    }}
                                  >
                                    +2
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdatePenalty(rec.id, rec.penalty === 'dnf' ? 'none' : 'dnf')
                                    }
                                    className="h-7 px-2 rounded border font-mono-tabular text-[11px] font-semibold cursor-pointer"
                                    style={{
                                      backgroundColor:
                                        rec.penalty === 'dnf' ? theme.ui.accentSoft : theme.ui.surface,
                                      borderColor:
                                        rec.penalty === 'dnf' ? theme.ui.accent : theme.ui.border,
                                      color:
                                        rec.penalty === 'dnf' ? '#DC2626' : theme.ui.muted,
                                    }}
                                  >
                                    DNF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onApplyScrambleTo3D(rec.puzzleType, rec.scramble)}
                                    aria-label={`Apply solve ${solveNum} scramble to 3D cube`}
                                    title="Apply scramble to 3D cube"
                                    className="h-7 px-2 rounded border text-[11px] font-medium cursor-pointer"
                                    style={{
                                      backgroundColor: theme.ui.surface,
                                      borderColor: theme.ui.border,
                                      color: theme.ui.text,
                                    }}
                                  >
                                    3D
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteRecord(rec.id)}
                                    aria-label={`Delete solve ${solveNum}`}
                                    className="h-7 w-7 rounded border inline-flex items-center justify-center cursor-pointer"
                                    style={{
                                      backgroundColor: theme.ui.surface,
                                      borderColor: theme.ui.border,
                                      color: theme.ui.muted,
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== VIEW 3: DAILY CHALLENGE & GLOBAL LEADERBOARD ==================== */}
          {viewTab === 'daily' && (
            <DailyChallengePanel
              theme={theme}
              puzzleType={puzzleType}
              clientId={clientId}
              playerName={playerName}
              data={dailyData}
              loading={dailyLoading}
              error={dailyError}
              onChangePlayerName={handleChangePlayerName}
              onRefresh={() => void fetchDailyChallenge()}
              onSubmitDailySolve={handleSubmitDailySolve}
              onPatchDailyEntry={handlePatchDailyEntry}
              onAddLocalRecord={onAddRecord}
              onUpdateLocalPenalty={onUpdatePenalty}
              onPlayDailyIn3D={onPlayDailyIn3D}
            />
          )}
        </div>
      </div>
    </div>
  );
};
