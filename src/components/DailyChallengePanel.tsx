import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  Check,
  Clock,
  Copy,
  Globe,
  RefreshCw,
  Trophy,
  User,
} from 'lucide-react';
import { cubeAudio } from '../cube/audio';
import { PUZZLE_META } from '../cube/curriculum';
import {
  formatUtcCountdown,
  generateDailyScramble,
  getNextUtcMidnightMs,
  getUtcDateKey,
  sanitizePlayerName,
  type DailyChallengeResponse,
} from '../cube/dailyChallenge';
import {
  formatPreciseTime,
  formatRecordTime,
  type SolvePenalty,
  type SolveRecord,
} from '../cube/timerStats';
import type { PuzzleType, ThemePalette } from '../cube/types';

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

function useUtcCountdown(nextResetMs: number): string {
  const [countdown, setCountdown] = useState(() => formatUtcCountdown(nextResetMs - Date.now()));

  useEffect(() => {
    setCountdown(formatUtcCountdown(nextResetMs - Date.now()));
    const id = window.setInterval(() => {
      setCountdown(formatUtcCountdown(nextResetMs - Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, [nextResetMs]);

  return countdown;
}

/* ============================================================================
   1. DASHBOARD ENTRY POINT CARD (Displayed prominently inside Analytics Dashboard)
   ============================================================================ */

interface DailyChallengeEntryCardProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  data: DailyChallengeResponse | null;
  loading: boolean;
  onOpenDailyLeaderboard: () => void;
  onPlayDailyIn3D: (puzzle: PuzzleType, scramble: string, dateKey: string) => void;
}

export const DailyChallengeEntryCard: React.FC<DailyChallengeEntryCardProps> = ({
  theme,
  puzzleType,
  data,
  loading,
  onOpenDailyLeaderboard,
  onPlayDailyIn3D,
}) => {
  const fallbackDateKey = getUtcDateKey();
  const dateKey = data?.dateKey ?? fallbackDateKey;
  const scramble = data?.scramble ?? generateDailyScramble(dateKey, puzzleType);
  const nextResetMs = data?.nextResetMs ?? getNextUtcMidnightMs();
  const countdown = useUtcCountdown(nextResetMs);

  const leader = data?.leaderboard.find((e) => e.rank === 1) ?? null;
  const userEntry = data?.userEntry ?? null;
  const participants = data?.totalParticipants ?? 0;

  return (
    <section
      data-testid="daily-challenge-entry-card"
      aria-label="Daily Challenge Global Leaderboard Entry Point"
      className="rounded-xl border p-4 sm:p-5"
      style={{
        backgroundColor: theme.ui.surfaceSubtle,
        borderColor: theme.ui.border,
      }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Identity + Shared Fixed Scramble Preview */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-display text-sm sm:text-base font-bold" style={{ color: theme.ui.text }}>
              <Trophy className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
              Daily Challenge · {PUZZLE_META[puzzleType].label}
            </span>
            <span className="font-mono-tabular text-xs font-medium" style={{ color: theme.ui.muted }}>
              {dateKey} UTC
            </span>
            <span
              className="inline-flex items-center gap-1 font-mono-tabular text-xs"
              style={{ color: theme.ui.muted }}
              data-testid="daily-countdown"
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Resets in {countdown}
            </span>
          </div>

          <p
            data-testid="daily-entry-scramble"
            className="font-mono-tabular text-xs sm:text-sm font-medium mt-2 truncate"
            style={{ color: theme.ui.text }}
            title={scramble}
          >
            {scramble}
          </p>

          {/* Unboxed Global Snapshot Readouts */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span style={{ color: theme.ui.muted }}>
              <Globe className="w-3.5 h-3.5 inline mr-1 align-[-2px]" />
              {loading && !data ? (
                'Syncing global board...'
              ) : leader ? (
                <>
                  Global #1:{' '}
                  <strong className="font-mono-tabular" style={{ color: theme.ui.text }}>
                    {formatRecordTime({ timeMs: leader.timeMs, penalty: leader.penalty })}
                  </strong>{' '}
                  by {leader.playerName}
                </>
              ) : (
                'Global #1 open — set today’s benchmark'
              )}
            </span>

            <span className="font-mono-tabular" style={{ color: theme.ui.muted }}>
              {participants} {participants === 1 ? 'cuber' : 'cubers'} today
            </span>

            {userEntry && (
              <span className="font-mono-tabular font-semibold" style={{ color: theme.ui.accent }}>
                Your Rank: {userEntry.rank ? `#${userEntry.rank}` : 'DNF'} (
                {formatRecordTime({ timeMs: userEntry.timeMs, penalty: userEntry.penalty })})
              </span>
            )}
          </div>
        </div>

        {/* Right: Direct Entry Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="open-global-leaderboard-btn"
            onClick={() => {
              cubeAudio.playUiTick();
              onOpenDailyLeaderboard();
            }}
            className="h-10 px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: theme.ui.accent,
              color: theme.ui.accentFg,
            }}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span>Global Leaderboard</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>

          <button
            type="button"
            data-testid="play-daily-3d-btn"
            onClick={() => {
              cubeAudio.playUiTick();
              onPlayDailyIn3D(puzzleType, scramble, dateKey);
            }}
            className="h-10 px-3 sm:px-3.5 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: theme.ui.surface,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <Box className="w-4 h-4 shrink-0" />
            <span className="sm:hidden">3D</span>
            <span className="hidden sm:inline">Play in 3D</span>
          </button>
        </div>
      </div>
    </section>
  );
};

/* ============================================================================
   2. FULL DAILY CHALLENGE & GLOBAL LEADERBOARD PANEL
   ============================================================================ */

type DailyTimerPhase = 'idle' | 'inspection' | 'holding' | 'ready' | 'running';

interface DailyChallengePanelProps {
  theme: ThemePalette;
  puzzleType: PuzzleType;
  clientId: string;
  playerName: string;
  data: DailyChallengeResponse | null;
  loading: boolean;
  error: string | null;
  onChangePlayerName: (nextName: string) => void;
  onRefresh: () => void;
  onSubmitDailySolve: (payload: {
    puzzleType: PuzzleType;
    timeMs: number;
    penalty: SolvePenalty;
    source: 'stopwatch' | 'virtual3d';
    scramble: string;
    localRecordId?: string;
  }) => Promise<{ entryId: string | null; improved: boolean; rank: number | null }>;
  onPatchDailyEntry: (entryId: string, patch: { penalty?: SolvePenalty; playerName?: string }) => Promise<void>;
  onAddLocalRecord: (rec: SolveRecord) => void;
  onUpdateLocalPenalty: (id: string, penalty: SolvePenalty) => void;
  onPlayDailyIn3D: (puzzle: PuzzleType, scramble: string, dateKey: string) => void;
}

export const DailyChallengePanel: React.FC<DailyChallengePanelProps> = ({
  theme,
  puzzleType,
  clientId,
  playerName,
  data,
  loading,
  error,
  onChangePlayerName,
  onRefresh,
  onSubmitDailySolve,
  onPatchDailyEntry,
  onAddLocalRecord,
  onUpdateLocalPenalty,
  onPlayDailyIn3D,
}) => {
  const fallbackDateKey = getUtcDateKey();
  const dateKey = data?.dateKey ?? fallbackDateKey;
  const scramble = data?.scramble ?? generateDailyScramble(dateKey, puzzleType);
  const nextResetMs = data?.nextResetMs ?? getNextUtcMidnightMs();
  const countdown = useUtcCountdown(nextResetMs);

  const [copied, setCopied] = useState(false);
  const [nameDraft, setNameDraft] = useState(playerName);
  const [useInspection, setUseInspection] = useState(false);
  const [phase, setPhase] = useState<DailyTimerPhase>('idle');
  const [displayMs, setDisplayMs] = useState(0);
  const [inspectionSec, setInspectionSec] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<{
    localId: string;
    serverEntryId: string | null;
    timeMs: number;
    penalty: SolvePenalty;
    improved: boolean;
    rank: number | null;
  } | null>(null);

  const phaseRef = useRef<DailyTimerPhase>('idle');
  const startTimeRef = useRef(0);
  const holdTimerRef = useRef<number | null>(null);
  const inspectionStartRef = useRef(0);
  const rafRef = useRef(0);
  const puzzleRef = useRef(puzzleType);
  const scrambleRef = useRef(scramble);

  phaseRef.current = phase;
  puzzleRef.current = puzzleType;
  scrambleRef.current = scramble;

  useEffect(() => {
    setNameDraft(playerName);
  }, [playerName]);

  useEffect(() => {
    setLastAttempt(null);
    setDisplayMs(0);
    setPhase('idle');
  }, [puzzleType]);

  // 60fps animation frame for stopwatch / inspection
  useEffect(() => {
    const tick = () => {
      if (phaseRef.current === 'running') {
        setDisplayMs(performance.now() - startTimeRef.current);
        rafRef.current = requestAnimationFrame(tick);
      } else if (phaseRef.current === 'inspection') {
        const elapsed = (performance.now() - inspectionStartRef.current) / 1000;
        setInspectionSec(Math.max(0, Math.ceil(15 - elapsed)));
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    if (phase === 'running' || phase === 'inspection') {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const stopDailyTimer = useCallback(async () => {
    if (phaseRef.current !== 'running') return;
    const finalMs = Math.max(100, Math.round(performance.now() - startTimeRef.current));
    setDisplayMs(finalMs);
    setPhase('idle');
    cubeAudio.playTurnClick(true);

    const localId = `dc-sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onAddLocalRecord({
      id: localId,
      puzzleType: puzzleRef.current,
      timeMs: finalMs,
      penalty: 'none',
      scramble: scrambleRef.current,
      source: 'stopwatch',
      timestamp: Date.now(),
    });

    setSubmitting(true);
    try {
      const result = await onSubmitDailySolve({
        puzzleType: puzzleRef.current,
        timeMs: finalMs,
        penalty: 'none',
        source: 'stopwatch',
        scramble: scrambleRef.current,
        localRecordId: localId,
      });
      setLastAttempt({
        localId,
        serverEntryId: result.entryId,
        timeMs: finalMs,
        penalty: 'none',
        improved: result.improved,
        rank: result.rank,
      });
    } finally {
      setSubmitting(false);
    }
  }, [onAddLocalRecord, onSubmitDailySolve]);

  const startDailyTimer = useCallback(() => {
    startTimeRef.current = performance.now();
    setDisplayMs(0);
    setLastAttempt(null);
    setPhase('running');
    cubeAudio.playUiTick();
  }, []);

  const beginInspection = useCallback(() => {
    inspectionStartRef.current = performance.now();
    setInspectionSec(15);
    setPhase('inspection');
    cubeAudio.playUiTick();
  }, []);

  // Spacebar WCA timer controls (ignored while typing handle)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      if (phaseRef.current === 'running') {
        e.preventDefault();
        void stopDailyTimer();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (e.repeat) return;
        if (phaseRef.current === 'idle' || phaseRef.current === 'inspection') {
          setPhase('holding');
          if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
          holdTimerRef.current = window.setTimeout(() => {
            if (phaseRef.current === 'holding') {
              setPhase('ready');
              cubeAudio.playUiTick();
            }
          }, 260);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (phaseRef.current === 'ready') {
        startDailyTimer();
      } else if (phaseRef.current === 'holding') {
        setPhase('idle');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    };
  }, [startDailyTimer, stopDailyTimer]);

  const handlePadClick = () => {
    if (phase === 'running') {
      void stopDailyTimer();
    } else if (phase === 'inspection') {
      startDailyTimer();
    } else if (useInspection) {
      beginInspection();
    } else {
      startDailyTimer();
    }
  };

  const handlePenaltyChange = async (nextPenalty: SolvePenalty) => {
    if (!lastAttempt) return;
    setLastAttempt((prev) => (prev ? { ...prev, penalty: nextPenalty } : null));
    onUpdateLocalPenalty(lastAttempt.localId, nextPenalty);
    if (lastAttempt.serverEntryId) {
      await onPatchDailyEntry(lastAttempt.serverEntryId, { penalty: nextPenalty });
    }
  };

  const handleCommitName = async () => {
    const clean = sanitizePlayerName(nameDraft) || 'Guest Cuber';
    setNameDraft(clean);
    onChangePlayerName(clean);
    if (data?.userEntry) {
      await onPatchDailyEntry(data.userEntry.id, { playerName: clean });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scramble);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const timerColor =
    phase === 'ready'
      ? '#16A34A'
      : phase === 'holding'
        ? '#D97706'
        : phase === 'inspection'
          ? inspectionSec <= 3
            ? '#DC2626'
            : '#D97706'
          : theme.ui.text;

  const leaderboard = data?.leaderboard ?? [];
  const userEntry = data?.userEntry ?? null;

  return (
    <div className="flex flex-col gap-5" data-testid="daily-challenge-panel">
      {/* Shared Fixed Daily Scramble & Handle Header */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b" style={{ borderColor: theme.ui.border }}>
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="font-display text-base sm:text-lg font-bold flex items-center gap-2" style={{ color: theme.ui.text }}>
                <Trophy className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
                Daily Challenge · {PUZZLE_META[puzzleType].label}
              </h2>
              <span className="font-mono-tabular text-xs font-semibold" style={{ color: theme.ui.accent }}>
                {dateKey} UTC
              </span>
            </div>
            <p className="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" style={{ color: theme.ui.muted }}>
              <span>Identical fixed WCA scramble shared by every player worldwide today.</span>
              <span className="font-mono-tabular">Resets in {countdown}</span>
            </p>
          </div>

          {/* Cuber Handle Input */}
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="daily-handle-input" className="text-xs font-medium whitespace-nowrap" style={{ color: theme.ui.muted }}>
              <User className="w-3.5 h-3.5 inline mr-1 align-[-2px]" />
              Handle
            </label>
            <input
              id="daily-handle-input"
              data-testid="daily-handle-input"
              type="text"
              maxLength={24}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void handleCommitName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Your cuber handle"
              className="h-9 px-3 rounded-lg border text-xs font-medium outline-none w-40 sm:w-44"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            />
          </div>
        </div>

        {/* Fixed Daily Scramble Sequence + Actions */}
        <div className="pt-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p
            data-testid="daily-fixed-scramble"
            className="font-mono-tabular text-sm sm:text-base font-semibold leading-relaxed tracking-wide select-text"
            style={{ color: theme.ui.text }}
          >
            {scramble}
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopy()}
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
              data-testid="daily-solve-3d-btn"
              onClick={() => {
                cubeAudio.playUiTick();
                onPlayDailyIn3D(puzzleType, scramble, dateKey);
              }}
              className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              <Box className="w-3.5 h-3.5 shrink-0" />
              <span>Solve on 3D Cube</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Daily Official Stopwatch (Left) + Global Leaderboard (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Official Daily Attempt Stopwatch */}
        <div
          className="lg:col-span-5 rounded-xl border p-5 flex flex-col items-center text-center"
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
          <div className="w-full flex items-center justify-between gap-2 text-xs mb-3">
            <span className="font-semibold" style={{ color: theme.ui.text }}>
              Official Daily Timer
            </span>
            <button
              type="button"
              onClick={() => setUseInspection((v) => !v)}
              aria-pressed={useInspection}
              className="h-7 px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: useInspection ? theme.ui.accentSoft : theme.ui.surface,
                borderColor: useInspection ? theme.ui.accent : theme.ui.border,
                color: useInspection ? theme.ui.accent : theme.ui.muted,
              }}
            >
              15s Inspection: {useInspection ? 'On' : 'Off'}
            </button>
          </div>

          <p className="text-[11px]" style={{ color: theme.ui.muted }}>
            {phase === 'running'
              ? 'Solving — Press Space or Tap Stop to submit'
              : phase === 'ready'
                ? 'Release Space to start'
                : phase === 'holding'
                  ? 'Hold Space...'
                  : 'Scramble your cube above, then hold Space or tap Start'}
          </p>

          <div
            data-testid="daily-stopwatch-readout"
            className="font-mono-tabular text-5xl sm:text-6xl font-semibold tracking-tight my-4 transition-colors duration-150"
            style={{ color: timerColor }}
          >
            {phase === 'inspection'
              ? `${inspectionSec}s`
              : phase === 'idle' && lastAttempt
                ? formatRecordTime({ timeMs: lastAttempt.timeMs, penalty: lastAttempt.penalty })
                : formatPreciseTime(displayMs, '0.00')}
          </div>

          <button
            type="button"
            data-testid="daily-stopwatch-toggle-btn"
            disabled={submitting}
            onClick={handlePadClick}
            className="h-11 px-7 rounded-xl text-sm font-semibold transition-transform duration-150 active:scale-[0.98] cursor-pointer disabled:opacity-60"
            style={{
              backgroundColor: phase === 'running' ? '#DC2626' : theme.ui.accent,
              color: '#FFFFFF',
            }}
          >
            {submitting
              ? 'Posting to Leaderboard...'
              : phase === 'running'
                ? 'Stop & Submit'
                : phase === 'inspection'
                  ? 'Start Solve Now'
                  : useInspection
                    ? 'Start Inspection'
                    : 'Start Daily Solve'}
          </button>

          {lastAttempt && phase === 'idle' && (
            <div
              className="mt-5 pt-4 border-t w-full flex flex-col gap-2.5 text-xs"
              style={{ borderColor: theme.ui.border }}
            >
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: theme.ui.muted }}>
                  {lastAttempt.improved
                    ? lastAttempt.rank
                      ? `Ranked #${lastAttempt.rank} globally today`
                      : 'Submitted to daily board'
                    : 'Saved locally (your faster daily PB stays #1 slot)'}
                </span>
                <span className="font-mono-tabular font-semibold" style={{ color: theme.ui.text }}>
                  {formatRecordTime({ timeMs: lastAttempt.timeMs, penalty: lastAttempt.penalty })}
                </span>
              </div>

              <div className="flex items-center justify-center gap-1.5">
                {(['none', '+2', 'dnf'] as const).map((pen) => {
                  const active = lastAttempt.penalty === pen;
                  return (
                    <button
                      key={pen}
                      type="button"
                      onClick={() => void handlePenaltyChange(pen)}
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
              </div>
            </div>
          )}
        </div>

        {/* Right: Global Leaderboard Table */}
        <div
          className="lg:col-span-7 rounded-xl border overflow-hidden"
          style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between gap-2"
            style={{ borderColor: theme.ui.border }}
          >
            <div>
              <h3 className="font-display text-sm font-semibold flex items-center gap-1.5" style={{ color: theme.ui.text }}>
                <Globe className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
                Global Leaderboard ({data?.totalParticipants ?? 0})
              </h3>
              <p className="text-[11px]" style={{ color: theme.ui.muted }}>
                Best valid attempt per cuber for {dateKey} UTC · {PUZZLE_META[puzzleType].shortLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh global leaderboard"
              className="h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Personal Standing Banner */}
          {userEntry && (
            <div
              data-testid="daily-user-standing"
              className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2 text-xs"
              style={{
                backgroundColor: theme.ui.accentSoft,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <span className="font-semibold">
                Your Standing:{' '}
                <span className="font-mono-tabular" style={{ color: theme.ui.accent }}>
                  {userEntry.rank ? `#${userEntry.rank} of ${data?.totalParticipants ?? 1}` : 'DNF'}
                </span>
              </span>
              <span className="font-mono-tabular font-semibold">
                {formatRecordTime({ timeMs: userEntry.timeMs, penalty: userEntry.penalty })} ·{' '}
                {userEntry.source === 'virtual3d' ? '3D Cube' : 'Stopwatch'}
              </span>
            </div>
          )}

          {error ? (
            <div className="p-6 text-center">
              <p className="text-xs font-medium" style={{ color: '#DC2626' }}>
                {error}
              </p>
              <button
                type="button"
                onClick={onRefresh}
                className="mt-3 h-8 px-3 rounded-lg border text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor: theme.ui.border,
                  color: theme.ui.text,
                }}
              >
                Retry Connection
              </button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center" data-testid="daily-leaderboard-empty">
              <p className="text-sm font-semibold" style={{ color: theme.ui.text }}>
                No global times posted yet for {PUZZLE_META[puzzleType].label} today
              </p>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: theme.ui.muted }}>
                Complete today’s fixed scramble with the Official Daily Timer or on the 3D Cube to claim the #1 global spot.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto kubi-scroll">
              <table className="w-full text-left border-collapse text-xs" data-testid="daily-leaderboard-table">
                <thead>
                  <tr className="border-b" style={{ borderColor: theme.ui.border, color: theme.ui.muted }}>
                    <th className="py-2.5 pl-4 pr-2 font-medium w-14">Rank</th>
                    <th className="py-2.5 px-2 font-medium">Cuber</th>
                    <th className="py-2.5 px-2 font-medium">Time</th>
                    <th className="py-2.5 px-2 font-medium hidden sm:table-cell">Mode</th>
                    <th className="py-2.5 pl-2 pr-4 font-medium text-right">Posted</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: theme.ui.border }}>
                  {leaderboard.map((row) => {
                    const isMe = row.clientId === clientId;
                    const rankColor =
                      row.rank === 1
                        ? '#D97706'
                        : row.rank === 2
                          ? theme.ui.text
                          : row.rank === 3
                            ? '#B45309'
                            : theme.ui.muted;

                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderColor: theme.ui.border,
                          backgroundColor: isMe ? theme.ui.accentSoft : 'transparent',
                        }}
                      >
                        <td className="py-2.5 pl-4 pr-2 font-mono-tabular font-bold" style={{ color: rankColor }}>
                          {row.rank ? `#${row.rank}` : '—'}
                        </td>
                        <td className="py-2.5 px-2 font-semibold" style={{ color: theme.ui.text }}>
                          <span>{row.playerName}</span>
                          {isMe && (
                            <span className="ml-1.5 font-normal text-[11px]" style={{ color: theme.ui.accent }}>
                              (You)
                            </span>
                          )}
                        </td>
                        <td
                          className="py-2.5 px-2 font-mono-tabular font-bold"
                          style={{ color: row.penalty === 'dnf' ? '#DC2626' : theme.ui.text }}
                        >
                          {formatRecordTime({ timeMs: row.timeMs, penalty: row.penalty })}
                        </td>
                        <td className="py-2.5 px-2 hidden sm:table-cell" style={{ color: theme.ui.muted }}>
                          {row.source === 'virtual3d' ? '3D Cube' : 'Stopwatch'}
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-right font-mono-tabular" style={{ color: theme.ui.muted }}>
                          {formatRelativeTime(row.submittedAt)}
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
    </div>
  );
};
