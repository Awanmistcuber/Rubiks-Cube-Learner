import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Swords, Trash2, Trophy } from 'lucide-react';
import {
  computeArenaStats,
  type ArenaMatchRecord,
} from '../cube/arenaHistory';
import { PUZZLE_META } from '../cube/curriculum';
import { formatPreciseTime, formatRecordTime } from '../cube/timerStats';
import type { PuzzleType, ThemePalette } from '../cube/types';
import { useI18n } from '../i18n/I18nContext';

interface ArenaMatchHistoryDashboardProps {
  theme: ThemePalette;
  records: ArenaMatchRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onGoToLobby: () => void;
}

const PUZZLE_FILTERS: Array<PuzzleType | 'all'> = ['all', '2x2', '3x3', '4x4', 'mirror'];

function formatMatchDate(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

export const ArenaMatchHistoryDashboard: React.FC<ArenaMatchHistoryDashboardProps> = ({
  theme,
  records,
  onDeleteRecord,
  onClearAll,
  onGoToLobby,
}) => {
  const { locale, t } = useI18n();
  const [puzzleFilter, setPuzzleFilter] = useState<PuzzleType | 'all'>('all');
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const filteredRecords = useMemo(
    () =>
      puzzleFilter === 'all'
        ? records
        : records.filter((r) => r.puzzleType === puzzleFilter),
    [records, puzzleFilter]
  );

  const stats = useMemo(
    () => computeArenaStats(records, puzzleFilter),
    [records, puzzleFilter]
  );

  return (
    <div
      data-testid="arena-match-history-dashboard"
      className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col gap-5"
    >
      {/* Header & Puzzle Filter Strip */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            {t('history.title')}
          </h3>
          <p className="text-xs sm:text-sm mt-1" style={{ color: theme.ui.muted }}>
            {t('history.subtitle')}
          </p>
        </div>

        <div
          className="inline-flex items-center gap-0.5 p-1 rounded-xl border self-start sm:self-auto overflow-x-auto max-w-full"
          style={{
            backgroundColor: theme.ui.surfaceSubtle,
            borderColor: theme.ui.border,
          }}
          role="tablist"
          aria-label="Filter match history by puzzle"
        >
          {PUZZLE_FILTERS.map((pf) => {
            const active = pf === puzzleFilter;
            return (
              <button
                key={pf}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`history-filter-${pf}`}
                onClick={() => setPuzzleFilter(pf)}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: active ? theme.ui.surface : 'transparent',
                  color: active ? theme.ui.text : theme.ui.muted,
                  boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {pf === 'all' ? t('history.allPuzzles') : PUZZLE_META[pf].shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Crisp KPI Summary Cells */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          data-testid="history-kpi-winloss"
          className="rounded-2xl border p-4 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
          }}
        >
          <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
            {t('history.winsLosses')}
          </span>
          <div className="font-mono-tabular text-2xl sm:text-3xl font-bold tracking-tight leading-none mt-1">
            <span style={{ color: '#16A34A' }}>{stats.wins}W</span>
            <span className="mx-1.5 text-lg font-normal" style={{ color: theme.ui.muted }}>
              –
            </span>
            <span style={{ color: stats.losses > 0 ? '#DC2626' : theme.ui.text }}>
              {stats.losses}L
            </span>
          </div>
          <span className="text-[11px] font-medium mt-1" style={{ color: theme.ui.muted }}>
            {stats.winRatePct !== null
              ? t('history.winRate', { rate: stats.winRatePct })
              : t('history.noDecided')}
          </span>
        </div>

        <div
          data-testid="history-kpi-avg"
          className="rounded-2xl border p-4 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
          }}
        >
          <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
            {t('history.avgSolveTime')}
          </span>
          <div className="font-mono-tabular text-2xl sm:text-3xl font-bold tracking-tight leading-none mt-1">
            {stats.overallAvgMs !== null ? formatPreciseTime(stats.overallAvgMs) : '—'}
          </div>
          <span className="text-[11px] font-medium mt-1" style={{ color: theme.ui.muted }}>
            {t('history.roundsCount', { count: stats.totalRoundsPlayed })}
          </span>
        </div>

        <div
          data-testid="history-kpi-best"
          className="rounded-2xl border p-4 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
          }}
        >
          <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
            {t('history.bestSingle')}
          </span>
          <div
            className="font-mono-tabular text-2xl sm:text-3xl font-bold tracking-tight leading-none mt-1"
            style={{ color: theme.ui.accent }}
          >
            {stats.bestSingleMs !== null ? formatPreciseTime(stats.bestSingleMs) : '—'}
          </div>
          <span className="text-[11px] font-medium mt-1" style={{ color: theme.ui.muted }}>
            {puzzleFilter === 'all' ? t('history.allPuzzles') : PUZZLE_META[puzzleFilter].label}
          </span>
        </div>

        <div
          data-testid="history-kpi-matches"
          className="rounded-2xl border p-4 flex flex-col justify-between gap-1"
          style={{
            backgroundColor: theme.ui.surface,
            borderColor: theme.ui.border,
          }}
        >
          <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
            {t('history.matchesStreak')}
          </span>
          <div className="font-mono-tabular text-2xl sm:text-3xl font-bold tracking-tight leading-none mt-1">
            {stats.totalMatches}
          </div>
          <span
            className="text-[11px] font-medium mt-1"
            style={{ color: stats.currentWinStreak > 0 ? '#16A34A' : theme.ui.muted }}
          >
            {t('history.streakLabel', { streak: stats.currentWinStreak })}
          </span>
        </div>
      </div>

      {/* Match History List */}
      <section
        className="rounded-2xl border overflow-hidden"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2"
          style={{ borderColor: theme.ui.border }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
            <h4 className="font-display text-sm font-bold truncate">
              {t('history.recentMatches')} ({filteredRecords.length})
            </h4>
          </div>

          {records.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    data-testid="history-confirm-clear-btn"
                    onClick={() => {
                      setConfirmClear(false);
                      onClearAll();
                    }}
                    className="h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                    }}
                  >
                    {t('history.confirmClear')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  >
                    {t('history.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-testid="history-clear-btn"
                  onClick={() => setConfirmClear(true)}
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.muted,
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('history.clearAll')}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {filteredRecords.length === 0 ? (
          <div
            data-testid="history-empty-state"
            className="px-6 py-12 flex flex-col items-center justify-center text-center gap-3"
          >
            <div
              className="w-12 h-12 rounded-2xl border flex items-center justify-center"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
              }}
            >
              <Swords className="w-5 h-5" style={{ color: theme.ui.accent }} />
            </div>
            <div>
              <p className="font-display text-base font-bold">{t('history.emptyTitle')}</p>
              <p className="text-xs sm:text-sm mt-1 max-w-md" style={{ color: theme.ui.muted }}>
                {t('history.emptyBody')}
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToLobby}
              className="mt-1 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
              style={{
                backgroundColor: theme.ui.accent,
                color: theme.ui.accentFg,
              }}
            >
              {t('history.startMatch')}
            </button>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: theme.ui.border }}>
            {filteredRecords.map((rec) => {
              const isExpanded = expandedMatchId === rec.id;
              const outcomeColor =
                rec.outcome === 'win'
                  ? '#16A34A'
                  : rec.outcome === 'loss'
                    ? '#DC2626'
                    : theme.ui.muted;
              const outcomeLabel =
                rec.outcome === 'win'
                  ? t('history.outcomeWin')
                  : rec.outcome === 'loss'
                    ? t('history.outcomeLoss')
                    : t('history.outcomeDraw');

              return (
                <div
                  key={rec.id}
                  data-testid={`history-match-row-${rec.roomCode}`}
                  className="transition-colors"
                  style={{ borderColor: theme.ui.border }}
                >
                  <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
                    {/* Left / Mobile Top: Outcome, Opponent, Puzzle & Date */}
                    <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:flex-1">
                      <span
                        className="w-14 sm:w-16 shrink-0 text-center font-mono-tabular text-[11px] font-bold py-1 px-1.5 rounded-md border"
                        style={{
                          color: outcomeColor,
                          borderColor: outcomeColor,
                          backgroundColor:
                            rec.outcome === 'win'
                              ? 'rgba(22, 163, 74, 0.08)'
                              : rec.outcome === 'loss'
                                ? 'rgba(220, 38, 38, 0.08)'
                                : theme.ui.surfaceSubtle,
                        }}
                      >
                        {outcomeLabel}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-display text-sm font-bold truncate">
                            vs {rec.opponentName}
                          </span>
                          <span
                            className="text-[11px] font-mono-tabular font-semibold shrink-0"
                            style={{ color: theme.ui.accent }}
                          >
                            {PUZZLE_META[rec.puzzleType].shortLabel}
                          </span>
                        </div>
                        <div
                          className="text-[11px] flex items-center gap-1.5 mt-0.5 truncate"
                          style={{ color: theme.ui.muted }}
                        >
                          <span className="truncate">{formatMatchDate(rec.updatedAt, locale)}</span>
                          <span className="shrink-0">·</span>
                          <span className="shrink-0">
                            {t('history.roundsCount', { count: rec.roundsPlayed })}
                          </span>
                          <span className="shrink-0">·</span>
                          <span className="font-mono-tabular shrink-0">{rec.roomCode}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right / Mobile Bottom: Score, Avg Times, Expand & Delete */}
                    <div
                      className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0"
                      style={{ borderColor: theme.ui.border }}
                    >
                      <div className="flex sm:block items-baseline gap-2.5 sm:text-right min-w-0">
                        <div className="font-mono-tabular text-base font-bold leading-none shrink-0">
                          <span>{rec.myWins}</span>
                          <span className="mx-1 font-normal" style={{ color: theme.ui.muted }}>
                            –
                          </span>
                          <span>{rec.opponentWins}</span>
                        </div>
                        <div
                          className="text-[11px] sm:text-[10px] sm:mt-1 font-mono-tabular truncate"
                          style={{ color: theme.ui.muted }}
                        >
                          {t('history.youAvg')}:{' '}
                          <strong style={{ color: theme.ui.text }}>
                            {rec.myAvgMs !== null ? formatPreciseTime(rec.myAvgMs) : '—'}
                          </strong>
                          {rec.opponentAvgMs !== null && (
                            <>
                              {' · '}
                              {t('history.oppAvg')}: {formatPreciseTime(rec.opponentAvgMs)}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {rec.rounds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedMatchId(isExpanded ? null : rec.id)}
                            aria-expanded={isExpanded}
                            aria-label="Toggle round details"
                            className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
                            style={{
                              backgroundColor: theme.ui.surfaceSubtle,
                              borderColor: theme.ui.border,
                              color: theme.ui.text,
                            }}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(rec.id)}
                          aria-label={t('history.deleteMatch')}
                          className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: theme.ui.surfaceSubtle,
                            borderColor: theme.ui.border,
                            color: theme.ui.muted,
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Round-by-Round Split Breakdown */}
                  {isExpanded && rec.rounds.length > 0 && (
                    <div
                      className="px-4 pb-3 pt-1 border-t overflow-x-auto"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr
                            className="border-b"
                            style={{ borderColor: theme.ui.border, color: theme.ui.muted }}
                          >
                            <th className="py-1.5 pr-3 font-medium">#</th>
                            <th className="py-1.5 px-3 font-medium text-right">{rec.playerName}</th>
                            <th className="py-1.5 px-3 font-medium text-right">{rec.opponentName}</th>
                            <th className="py-1.5 pl-3 font-medium text-right">Scramble</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rec.rounds.map((rd) => (
                            <tr
                              key={rd.roundNumber}
                              className="border-b last:border-b-0"
                              style={{ borderColor: theme.ui.border }}
                            >
                              <td className="py-1.5 pr-3 font-mono-tabular font-semibold">
                                #{rd.roundNumber}
                              </td>
                              <td
                                className="py-1.5 px-3 font-mono-tabular text-right font-semibold"
                                style={{ color: rd.winner === 'me' ? '#16A34A' : theme.ui.text }}
                              >
                                {rd.myTimeMs !== null
                                  ? formatRecordTime({ timeMs: rd.myTimeMs, penalty: rd.myPenalty })
                                  : '—'}
                              </td>
                              <td
                                className="py-1.5 px-3 font-mono-tabular text-right font-semibold"
                                style={{
                                  color: rd.winner === 'opponent' ? '#DC2626' : theme.ui.text,
                                }}
                              >
                                {rd.opponentTimeMs !== null
                                  ? formatRecordTime({
                                      timeMs: rd.opponentTimeMs,
                                      penalty: rd.opponentPenalty,
                                    })
                                  : '—'}
                              </td>
                              <td
                                className="py-1.5 pl-3 font-mono-tabular text-right max-w-[220px] truncate"
                                style={{ color: theme.ui.muted }}
                                title={rd.scramble}
                              >
                                {rd.scramble}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
