import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Link2,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  Search,
  Swords,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { cubeAudio } from '../cube/audio';
import {
  ARENA_CHAT_PRESETS,
  isValidRoomCode,
  normalizeRoomCode,
  type ArenaPlayerState,
  type ArenaTimerPhase,
} from '../cube/arenaEngine';
import { PUZZLE_META } from '../cube/curriculum';
import { loadPlayerName, savePlayerName } from '../cube/dailyChallenge';
import {
  formatPreciseTime,
  formatRecordTime,
  type SolvePenalty,
} from '../cube/timerStats';
import type { PuzzleType, ThemePalette } from '../cube/types';
import { useArenaClient } from '../cube/useArenaClient';

interface ArenaModalProps {
  theme: ThemePalette;
  initialPuzzle: PuzzleType;
  initialRoomCode?: string | null;
  onClose: () => void;
}

const PUZZLES: PuzzleType[] = ['2x2', '3x3', '4x4', 'mirror'];
const HOLD_TO_ARM_MS = 280;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function buildInviteUrl(roomCode: string): string {
  if (typeof window === 'undefined') return `?room=${roomCode}`;
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
}

const CHAT_EMOJI_PRESETS = ARENA_CHAT_PRESETS.filter((p) => p.kind === 'emoji');
const CHAT_TEXT_PRESETS = ARENA_CHAT_PRESETS.filter((p) => p.kind === 'text');

interface ReactionBubble {
  id: string;
  text: string;
  kind: 'text' | 'emoji';
}

interface VideoFeedBoxProps {
  stream: MediaStream | null;
  fallbackFrame?: string | null;
  camOn: boolean;
  micOn: boolean;
  isLocal?: boolean;
  muted: boolean;
  mirrored?: boolean;
  name: string;
  subtitle: string;
  theme: ThemePalette;
  reactionBubble?: ReactionBubble | null;
  overlayControls?: React.ReactNode;
  testId?: string;
}

const VideoFeedBox: React.FC<VideoFeedBoxProps> = ({
  stream,
  fallbackFrame = null,
  camOn,
  micOn,
  isLocal = false,
  muted,
  mirrored = false,
  name,
  subtitle,
  theme,
  reactionBubble = null,
  overlayControls,
  testId,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [videoHasFrame, setVideoHasFrame] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const hasLiveVideoTrack = Boolean(
    stream && stream.getVideoTracks().some((t) => t.readyState === 'live')
  );
  const hasLiveAudioTrack = Boolean(
    stream && stream.getAudioTracks().some((t) => t.readyState === 'live')
  );
  const canRenderVideoElement = camOn && hasLiveVideoTrack;
  const showFallbackImage = camOn && Boolean(fallbackFrame) && !videoHasFrame;
  const showAvatar = !camOn || (!hasLiveVideoTrack && !fallbackFrame);

  // Reset decoded frame state when source stream or camera state changes
  useEffect(() => {
    setVideoHasFrame(false);
  }, [stream, camOn]);

  // Always keep <video> muted so Chrome/Safari/Edge autoplay NEVER stalls on a black frame.
  // Remote audio is routed through the dedicated <audio> element below.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && canRenderVideoElement) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.muted = true;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream, canRenderVideoElement]);

  // Dedicated remote audio playback with graceful autoplay-unlock prompt if browser blocks audio
  useEffect(() => {
    const el = audioRef.current;
    if (!el || isLocal) return;
    if (stream && hasLiveAudioTrack) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      el.muted = muted;
      if (muted) {
        setAudioBlocked(false);
        return;
      }
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => setAudioBlocked(false))
          .catch(() => setAudioBlocked(true));
      }
    } else {
      el.srcObject = null;
      setAudioBlocked(false);
    }
  }, [stream, hasLiveAudioTrack, isLocal, muted]);

  const handleUnlockAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = false;
    el.play()
      .then(() => setAudioBlocked(false))
      .catch(() => {});
  };

  const handleVideoFrameCheck = (el: HTMLVideoElement) => {
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      setVideoHasFrame(true);
    }
  };

  return (
    <div
      data-testid={testId}
      className="relative w-full aspect-video max-h-[240px] lg:max-h-[280px] rounded-xl overflow-hidden border flex items-center justify-center"
      style={{
        backgroundColor: '#121318',
        borderColor: theme.ui.border,
      }}
    >
      {canRenderVideoElement && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          onLoadedMetadata={(e) => {
            e.currentTarget.play().catch(() => {});
            handleVideoFrameCheck(e.currentTarget);
          }}
          onLoadedData={(e) => handleVideoFrameCheck(e.currentTarget)}
          onPlaying={(e) => handleVideoFrameCheck(e.currentTarget)}
          onResize={(e) => handleVideoFrameCheck(e.currentTarget)}
          className={`w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''} ${
            showFallbackImage ? 'opacity-0 absolute inset-0' : 'opacity-100'
          }`}
        />
      )}

      {showFallbackImage && fallbackFrame && (
        <img
          data-testid={testId ? `${testId}-fallback-img` : undefined}
          src={fallbackFrame}
          alt={`${name} live camera feed`}
          className="w-full h-full object-cover"
        />
      )}

      {showAvatar && (
        <div className="flex flex-col items-center justify-center gap-2 px-4 pb-10 text-center">
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-display text-xl sm:text-2xl font-bold border"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderColor: 'rgba(255,255,255,0.16)',
              color: '#F4F4F6',
            }}
          >
            {getInitials(name)}
          </div>
          <p className="text-[11px] font-medium" style={{ color: 'rgba(244,244,246,0.72)' }}>
            {camOn
              ? 'Connecting camera...'
              : micOn
                ? 'Audio Only · Camera Off'
                : 'Avatar Mode · Camera & Mic Off'}
          </p>
        </div>
      )}

      {/* Dedicated remote audio element (prevents autoplay policy from blocking video frames) */}
      {!isLocal && <audio ref={audioRef} autoPlay playsInline muted={muted} className="hidden" />}

      {/* One-tap audio unlock if browser autoplay policy paused remote audio */}
      {!isLocal && audioBlocked && !muted && (
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            handleUnlockAudio();
          }}
          className="absolute top-2.5 left-2.5 z-10 h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer border"
          style={{
            backgroundColor: 'rgba(18, 19, 24, 0.85)',
            borderColor: 'rgba(255, 255, 255, 0.25)',
            color: '#FFFFFF',
          }}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Enable Audio</span>
        </button>
      )}

      {/* Ephemeral Quick-Chat / Emoji Reaction Toast on Competitor Pane */}
      {reactionBubble && (
        <div
          key={reactionBubble.id}
          data-testid={testId ? `${testId}-reaction` : undefined}
          className={`pointer-events-none absolute top-2.5 right-2.5 z-10 max-w-[78%] rounded-xl border px-3 py-1.5 shadow-lg ${
            reactionBubble.kind === 'emoji' ? 'text-2xl leading-none py-1.5 px-2.5' : 'text-xs font-semibold'
          }`}
          style={{
            backgroundColor: 'rgba(18, 19, 24, 0.86)',
            borderColor: 'rgba(255, 255, 255, 0.22)',
            color: '#FFFFFF',
          }}
        >
          {reactionBubble.text}
        </div>
      )}

      {/* Measured contrast scrim for video/avatar overlay legibility */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 px-3 py-2.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{name}</div>
          <div className="text-[11px] text-white/75 truncate">{subtitle}</div>
        </div>
        {overlayControls && (
          <div className="flex items-center gap-1.5 shrink-0">{overlayControls}</div>
        )}
      </div>
    </div>
  );
};

export const ArenaModal: React.FC<ArenaModalProps> = ({
  theme,
  initialPuzzle,
  initialRoomCode,
  onClose,
}) => {
  const arena = useArenaClient(true);

  const [playerName, setPlayerName] = useState<string>(() => loadPlayerName() || 'Speedcuber');
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleType>(initialPuzzle);
  const [joinCodeInput, setJoinCodeInput] = useState<string>(() =>
    initialRoomCode ? normalizeRoomCode(initialRoomCode) : ''
  );
  const [copiedFlag, setCopiedFlag] = useState<'code' | 'link' | 'scramble' | null>(null);
  const [queueElapsedSec, setQueueElapsedSec] = useState(0);

  // Independent local Spacebar / touch timer state
  const [localPhase, setLocalPhase] = useState<ArenaTimerPhase>('idle');
  const [localElapsedMs, setLocalElapsedMs] = useState(0);
  const [opponentLiveMs, setOpponentLiveMs] = useState<number>(0);

  // Ephemeral chat/emoji reaction bubbles over competitor video panes
  const [reactionByPlayer, setReactionByPlayer] = useState<Record<string, ReactionBubble | null>>({});
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const reactionTimersRef = useRef<Record<string, number>>({});
  const chatFeedRef = useRef<HTMLDivElement | null>(null);

  const localPhaseRef = useRef<ArenaTimerPhase>('idle');
  const holdTimerRef = useRef<number | null>(null);
  const runStartPerfRef = useRef<number>(0);
  const lastRoundKeyRef = useRef<string>('');
  const spaceDownRef = useRef<boolean>(false);

  localPhaseRef.current = localPhase;

  const { room, playerId, sendTimerPhase, sendTimerFinish } = arena;

  const mySeat: ArenaPlayerState | null = useMemo(
    () => room?.players.find((p) => p.playerId === playerId) ?? null,
    [room, playerId]
  );

  const opponentSeat: ArenaPlayerState | null = useMemo(
    () => room?.players.find((p) => p.playerId !== playerId) ?? null,
    [room, playerId]
  );

  const currentRoundRecord = useMemo(() => {
    if (!room) return null;
    return room.history.find((h) => h.roundNumber === room.roundNumber) ?? null;
  }, [room]);

  // Reset local timer state whenever a new room or new round starts
  useEffect(() => {
    if (!room) {
      lastRoundKeyRef.current = '';
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setLocalPhase('idle');
      setLocalElapsedMs(0);
      return;
    }

    const roundKey = `${room.roomCode}:${room.roundNumber}:${room.currentScramble}`;
    if (lastRoundKeyRef.current !== roundKey) {
      lastRoundKeyRef.current = roundKey;
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setLocalPhase('idle');
      setLocalElapsedMs(0);
    }
  }, [room]);

  // Surface fresh preset chat / emoji messages as floating reaction bubbles on competitor panes
  const roomChat = room?.chat;
  useEffect(() => {
    if (!room) {
      seenChatIdsRef.current.clear();
      setReactionByPlayer({});
      for (const timerId of Object.values(reactionTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      reactionTimersRef.current = {};
      return;
    }

    if (!roomChat || roomChat.length === 0) return;

    const freshMessages = roomChat.filter((m) => !seenChatIdsRef.current.has(m.id));
    if (freshMessages.length === 0) return;

    for (const msg of freshMessages) {
      seenChatIdsRef.current.add(msg.id);
      const pid = msg.playerId;
      setReactionByPlayer((prev) => ({
        ...prev,
        [pid]: { id: msg.id, text: msg.text, kind: msg.kind },
      }));
      if (reactionTimersRef.current[pid]) {
        window.clearTimeout(reactionTimersRef.current[pid]);
      }
      reactionTimersRef.current[pid] = window.setTimeout(() => {
        setReactionByPlayer((prev) =>
          prev[pid]?.id === msg.id ? { ...prev, [pid]: null } : prev
        );
      }, 3200);
    }

    if (chatFeedRef.current) {
      chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
    }
  }, [room, roomChat]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(reactionTimersRef.current)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  // Matchmaking elapsed wait counter
  useEffect(() => {
    if (!arena.queuedPuzzle) {
      setQueueElapsedSec(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setQueueElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [arena.queuedPuzzle]);

  // Local high-precision timer loop while running
  useEffect(() => {
    if (localPhase !== 'running') return;
    let rafId = 0;
    const tick = () => {
      setLocalElapsedMs(Math.max(0, Math.round(performance.now() - runStartPerfRef.current)));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [localPhase]);

  // Opponent live synchronized clock while opponent is running
  useEffect(() => {
    if (!opponentSeat || opponentSeat.timerPhase !== 'running' || !opponentSeat.timerStartedAt) {
      setOpponentLiveMs(opponentSeat?.currentTimeMs ?? 0);
      return;
    }
    let rafId = 0;
    const startedAt = opponentSeat.timerStartedAt;
    const offset = arena.serverClockOffsetMs;
    const tick = () => {
      const approxServerNow = Date.now() + offset;
      setOpponentLiveMs(Math.max(0, Math.round(approxServerNow - startedAt)));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    opponentSeat?.timerPhase,
    opponentSeat?.timerStartedAt,
    opponentSeat?.currentTimeMs,
    arena.serverClockOffsetMs,
  ]);

  const inRoom = Boolean(room);

  const handleTimerPressStart = useCallback(() => {
    if (!inRoom) return;
    const phase = localPhaseRef.current;

    if (phase === 'running') {
      // Immediate stop on press!
      const finalMs = Math.max(50, Math.round(performance.now() - runStartPerfRef.current));
      setLocalElapsedMs(finalMs);
      setLocalPhase('finished');
      localPhaseRef.current = 'finished';
      cubeAudio.playUiTick();
      sendTimerFinish(finalMs, 'none');
      return;
    }

    if (phase === 'idle') {
      setLocalPhase('holding');
      localPhaseRef.current = 'holding';
      sendTimerPhase('holding');
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        if (localPhaseRef.current === 'holding') {
          setLocalPhase('armed');
          localPhaseRef.current = 'armed';
          cubeAudio.playUiTick();
          sendTimerPhase('armed');
        }
      }, HOLD_TO_ARM_MS);
    }
  }, [inRoom, sendTimerFinish, sendTimerPhase]);

  const handleTimerPressEnd = useCallback(() => {
    if (!inRoom) return;
    const phase = localPhaseRef.current;

    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (phase === 'holding') {
      setLocalPhase('idle');
      localPhaseRef.current = 'idle';
      sendTimerPhase('idle');
    } else if (phase === 'armed') {
      runStartPerfRef.current = performance.now();
      setLocalElapsedMs(0);
      setLocalPhase('running');
      localPhaseRef.current = 'running';
      sendTimerPhase('running');
    }
  }, [inRoom, sendTimerPhase]);

  // Global Spacebar controls while seated inside an active match room (never torn down on room:state broadcasts)
  useEffect(() => {
    if (!inRoom) return;

    const isEditable = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isEditable(e.target)) return;
      e.preventDefault();
      if (e.repeat || spaceDownRef.current) return;
      spaceDownRef.current = true;
      handleTimerPressStart();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (!spaceDownRef.current) return;
      e.preventDefault();
      spaceDownRef.current = false;
      handleTimerPressEnd();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      spaceDownRef.current = false;
    };
  }, [inRoom, handleTimerPressStart, handleTimerPressEnd]);

  // Persist player display name smoothly
  const handleNameChange = (val: string) => {
    const trimmed = val.slice(0, 20);
    setPlayerName(trimmed);
    if (trimmed.trim().length >= 2) {
      savePlayerName(trimmed.trim());
    }
  };

  const triggerCopy = async (kind: 'code' | 'link' | 'scramble', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFlag(kind);
      window.setTimeout(() => setCopiedFlag((prev) => (prev === kind ? null : prev)), 1800);
    } catch {
      // ignore clipboard permissions error
    }
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(joinCodeInput);
    if (!isValidRoomCode(normalized)) {
      return;
    }
    cubeAudio.playUiTick();
    arena.joinRoom(normalized, playerName.trim() || 'Speedcuber');
  };

  const bothFinished = Boolean(
    room &&
      room.players.length === 2 &&
      room.players.every((p) => p.timerPhase === 'finished')
  );
  const anyRunning = Boolean(
    room && room.players.some((p) => p.timerPhase === 'running')
  );

  // Compute session averages for both players from room history
  const computeMeanMs = (pid: string | undefined): number | null => {
    if (!room || !pid) return null;
    const valid = room.history
      .map((h) => h.results[pid]?.effectiveMs ?? null)
      .filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
  };

  const myMeanMs = computeMeanMs(mySeat?.playerId);
  const opponentMeanMs = computeMeanMs(opponentSeat?.playerId);

  const localDisplayTime = useMemo(() => {
    if (mySeat?.timerPhase === 'finished' && mySeat.currentTimeMs !== null) {
      return formatRecordTime({
        timeMs: mySeat.currentTimeMs,
        penalty: mySeat.currentPenalty,
      });
    }
    return formatPreciseTime(localElapsedMs, '0.00');
  }, [mySeat?.timerPhase, mySeat?.currentTimeMs, mySeat?.currentPenalty, localElapsedMs]);

  const localPhaseCopy =
    localPhase === 'holding'
      ? 'Keep holding...'
      : localPhase === 'armed'
        ? 'Release to start'
        : localPhase === 'running'
          ? 'Solving — tap Space or pad to stop'
          : mySeat?.timerPhase === 'finished'
            ? 'Round finished'
            : 'Hold Space or press & hold pad to start';

  const localTimerColor =
    localPhase === 'holding'
      ? '#D97706'
      : localPhase === 'armed'
        ? '#16A34A'
        : mySeat?.currentPenalty === 'dnf'
          ? '#DC2626'
          : theme.ui.text;

  const opponentDisplayTime = useMemo(() => {
    if (!opponentSeat) return '—';
    if (opponentSeat.timerPhase === 'finished' && opponentSeat.currentTimeMs !== null) {
      return formatRecordTime({
        timeMs: opponentSeat.currentTimeMs,
        penalty: opponentSeat.currentPenalty,
      });
    }
    if (opponentSeat.timerPhase === 'running') {
      return formatPreciseTime(opponentLiveMs, '0.00');
    }
    return '0.00';
  }, [opponentSeat, opponentLiveMs]);

  const opponentPhaseLabel = !opponentSeat
    ? 'Open seat'
    : opponentSeat.timerPhase === 'holding'
      ? 'Holding...'
      : opponentSeat.timerPhase === 'armed'
        ? 'Armed & ready'
        : opponentSeat.timerPhase === 'running'
          ? 'Solving live'
          : opponentSeat.timerPhase === 'finished'
            ? 'Finished'
            : 'Scrambling / ready';

  const connectionLabel =
    arena.connectionState === 'connected'
      ? 'Server Connected'
      : arena.connectionState === 'waking'
        ? 'Waking Server (~30s)...'
        : arena.connectionState === 'offline'
          ? 'Backend Not Configured'
          : arena.connectionState === 'reconnecting'
            ? 'Reconnecting...'
            : 'Connecting...';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="1v1 Live Speedcubing Arena"
      data-testid="arena-modal"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ backgroundColor: theme.ui.bg, color: theme.ui.text }}
    >
      {/* Top Bar — Clean 3-Zone Tournament Header */}
      <header
        className="shrink-0 w-full border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-4 kubi-safe-top"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Swords className="w-5 h-5 shrink-0" style={{ color: theme.ui.accent }} />
          <h2 className="font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            1v1 Live Arena
          </h2>
          <span
            className="hidden sm:inline text-xs font-medium whitespace-nowrap"
            style={{
              color:
                arena.connectionState === 'connected'
                  ? '#16A34A'
                  : arena.connectionState === 'offline'
                    ? '#DC2626'
                    : arena.connectionState === 'waking'
                      ? '#D97706'
                      : theme.ui.muted,
            }}
            data-testid="arena-connection-status"
          >
            · {connectionLabel}
          </span>
        </div>

        {/* Center Live Match Score (visible only when inside a room) */}
        {room && mySeat && (
          <div
            data-testid="arena-scoreboard"
            className="hidden md:flex items-center gap-3 font-display text-base font-bold tabular-nums whitespace-nowrap"
          >
            <span className="truncate max-w-[140px]">{mySeat.name}</span>
            <span style={{ color: theme.ui.accent }}>{mySeat.wins}</span>
            <span style={{ color: theme.ui.muted }}>—</span>
            <span style={{ color: theme.ui.text }}>{opponentSeat?.wins ?? 0}</span>
            <span className="truncate max-w-[140px]" style={{ color: theme.ui.muted }}>
              {opponentSeat?.name ?? 'Waiting...'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {room && (
            <button
              type="button"
              data-testid="arena-leave-room-btn"
              onClick={() => {
                cubeAudio.playUiTick();
                arena.leaveRoom();
              }}
              className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: theme.ui.surfaceSubtle,
                borderColor: theme.ui.border,
                color: theme.ui.text,
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Room</span>
            </button>
          )}
          <button
            type="button"
            data-testid="arena-close-btn"
            onClick={() => {
              cubeAudio.playUiTick();
              onClose();
            }}
            className="h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: theme.ui.surfaceSubtle,
              borderColor: theme.ui.border,
              color: theme.ui.text,
            }}
          >
            <X className="w-3.5 h-3.5" />
            <span>3D Cube</span>
          </button>
        </div>
      </header>

      {/* Inline Error Banner */}
      {arena.errorMessage && (
        <div
          role="alert"
          data-testid="arena-error-banner"
          className="shrink-0 px-4 sm:px-6 py-2.5 border-b flex items-center justify-between gap-3 text-xs font-medium"
          style={{
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
            borderColor: 'rgba(220, 38, 38, 0.25)',
            color: '#DC2626',
          }}
        >
          <span>{arena.errorMessage}</span>
          <button
            type="button"
            onClick={arena.clearError}
            className="underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto kubi-scroll">
        {!room ? (
          /* ===================== LOBBY VIEW ===================== */
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="mb-6">
              <h3
                className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Head-to-Head Online Speedcubing
              </h3>
              <p className="text-sm mt-1.5" style={{ color: theme.ui.muted }}>
                Solve a shared WCA scramble side-by-side over live video &amp; audio with
                independent Spacebar timers and a continuous win tally.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Camera/Audio Preview & Profile */}
              <section
                className="lg:col-span-5 rounded-2xl border p-4 sm:p-5 flex flex-col gap-4"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor: theme.ui.border,
                }}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-sm font-semibold">Camera &amp; Audio Check</h4>
                  <span className="text-xs" style={{ color: theme.ui.muted }}>
                    Optional · Fallback ready
                  </span>
                </div>

                <VideoFeedBox
                  stream={arena.localStream}
                  camOn={arena.camEnabled}
                  micOn={arena.micEnabled}
                  isLocal={true}
                  muted={true}
                  mirrored={true}
                  name={playerName.trim() || 'Speedcuber'}
                  subtitle={
                    arena.camEnabled
                      ? arena.micEnabled
                        ? 'Camera & Mic Ready'
                        : 'Camera Ready · Mic Muted'
                      : arena.micEnabled
                        ? 'Audio Only Mode'
                        : 'Avatar + Timer Mode'
                  }
                  theme={theme}
                  testId="lobby-local-video"
                  overlayControls={
                    <>
                      <button
                        type="button"
                        data-testid="lobby-toggle-cam-btn"
                        onClick={() => arena.toggleCamera()}
                        aria-label={arena.camEnabled ? 'Turn camera off' : 'Turn camera on'}
                        aria-pressed={arena.camEnabled}
                        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style={{
                          backgroundColor: arena.camEnabled
                            ? 'rgba(255,255,255,0.2)'
                            : 'rgba(220,38,38,0.85)',
                          color: '#FFFFFF',
                        }}
                      >
                        {arena.camEnabled ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <VideoOff className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="lobby-toggle-mic-btn"
                        onClick={() => arena.toggleMic()}
                        aria-label={arena.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                        aria-pressed={arena.micEnabled}
                        className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style={{
                          backgroundColor: arena.micEnabled
                            ? 'rgba(255,255,255,0.2)'
                            : 'rgba(220,38,38,0.85)',
                          color: '#FFFFFF',
                        }}
                      >
                        {arena.micEnabled ? (
                          <Mic className="w-4 h-4" />
                        ) : (
                          <MicOff className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  }
                />

                {arena.mediaNotice && (
                  <p className="text-xs leading-relaxed" style={{ color: theme.ui.muted }}>
                    {arena.mediaNotice}
                  </p>
                )}

                <div className="space-y-3 pt-1">
                  <div>
                    <label
                      htmlFor="arena-player-name"
                      className="block text-xs font-medium mb-1.5"
                      style={{ color: theme.ui.text }}
                    >
                      Competitor Name
                    </label>
                    <input
                      id="arena-player-name"
                      type="text"
                      maxLength={20}
                      value={playerName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Enter your cuber handle"
                      className="w-full h-10 px-3 rounded-xl border text-sm outline-none"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium">Puzzle Event</span>
                      <span style={{ color: theme.ui.muted }}>
                        {PUZZLE_META[selectedPuzzle].label}
                      </span>
                    </div>
                    <div
                      className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      {PUZZLES.map((p) => {
                        const active = p === selectedPuzzle;
                        const waiting = arena.queueCounts[p] ?? 0;
                        return (
                          <button
                            key={p}
                            type="button"
                            disabled={arena.queuedPuzzle !== null}
                            onClick={() => {
                              cubeAudio.playUiTick();
                              setSelectedPuzzle(p);
                            }}
                            aria-pressed={active}
                            className="h-9 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                            style={{
                              backgroundColor: active ? theme.ui.surface : 'transparent',
                              color: active ? theme.ui.text : theme.ui.muted,
                              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                            }}
                          >
                            {PUZZLE_META[p].shortLabel}
                            {waiting > 0 ? ` (${waiting})` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Right Column: Matchmaking & Private 2-Player Room */}
              <section
                className="lg:col-span-7 rounded-2xl border p-5 sm:p-6 flex flex-col gap-6"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor: theme.ui.border,
                }}
              >
                {/* Option 1: Random Online Matchmaking */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="font-display text-lg font-bold">Random Online Matchmaking</h4>
                    <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
                      {arena.queueCounts[selectedPuzzle] > 0
                        ? `${arena.queueCounts[selectedPuzzle]} waiting for ${PUZZLE_META[selectedPuzzle].shortLabel}`
                        : `Instant pair · ${PUZZLE_META[selectedPuzzle].shortLabel}`}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm mb-4" style={{ color: theme.ui.muted }}>
                    Automatically connect with another online speedcuber solving{' '}
                    {PUZZLE_META[selectedPuzzle].label}.
                  </p>

                  {arena.queuedPuzzle ? (
                    <div
                      data-testid="arena-matchmaking-searching"
                      className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.accent,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <RefreshCw
                          className="w-5 h-5 animate-spin shrink-0"
                          style={{ color: theme.ui.accent }}
                        />
                        <div>
                          <div className="text-sm font-semibold">
                            Searching for {PUZZLE_META[arena.queuedPuzzle].shortLabel} opponent...
                          </div>
                          <div
                            className="text-xs font-mono-tabular"
                            style={{ color: theme.ui.muted }}
                          >
                            Wait time {String(Math.floor(queueElapsedSec / 60)).padStart(2, '0')}:
                            {String(queueElapsedSec % 60).padStart(2, '0')} · {arena.queueSize} in
                            queue
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="arena-cancel-matchmaking-btn"
                        onClick={() => {
                          cubeAudio.playUiTick();
                          arena.cancelMatchmaking();
                        }}
                        className="h-9 px-3.5 rounded-lg border text-xs font-semibold whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        Cancel Search
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="arena-find-match-btn"
                      disabled={arena.connectionState !== 'connected'}
                      onClick={() => {
                        cubeAudio.playUiTick();
                        arena.startMatchmaking(selectedPuzzle, playerName.trim() || 'Speedcuber');
                      }}
                      className="w-full h-12 px-5 rounded-xl font-semibold text-sm sm:text-base inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      style={{
                        backgroundColor: theme.ui.accent,
                        color: theme.ui.accentFg,
                      }}
                    >
                      <Search className="w-4 h-4" />
                      <span>Find Random Opponent ({PUZZLE_META[selectedPuzzle].shortLabel})</span>
                    </button>
                  )}
                </div>

                <hr style={{ borderColor: theme.ui.border }} />

                {/* Option 2: Private 2-Player Room */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-display text-lg font-bold">Private 2-Player Room</h4>
                      <span className="text-xs font-medium" style={{ color: theme.ui.muted }}>
                        Max 2 competitors
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm" style={{ color: theme.ui.muted }}>
                      Create an invite-only head-to-head room and share the 6-character code, or
                      join a friend&apos;s room below.
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="arena-create-room-btn"
                    disabled={arena.connectionState !== 'connected'}
                    onClick={() => {
                      cubeAudio.playUiTick();
                      arena.createRoom(selectedPuzzle, playerName.trim() || 'Speedcuber');
                    }}
                    className="w-full h-11 px-4 rounded-xl border font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    style={{
                      backgroundColor: theme.ui.surfaceSubtle,
                      borderColor: theme.ui.border,
                      color: theme.ui.text,
                    }}
                  >
                    <Users className="w-4 h-4" style={{ color: theme.ui.accent }} />
                    <span>Create Private Room ({PUZZLE_META[selectedPuzzle].shortLabel})</span>
                  </button>

                  <form onSubmit={handleJoinSubmit} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      data-testid="arena-join-code-input"
                      aria-label="Private room code"
                      maxLength={8}
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(normalizeRoomCode(e.target.value))}
                      placeholder="Room code (e.g. 7H4K9P)"
                      className={`flex-1 h-11 px-3.5 rounded-xl border text-sm font-mono-tabular uppercase outline-none placeholder:tracking-normal placeholder:normal-case ${joinCodeInput.length > 0 ? 'tracking-[0.18em]' : 'tracking-normal'}`}
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    />
                    <button
                      type="submit"
                      data-testid="arena-join-room-btn"
                      disabled={
                        arena.connectionState !== 'connected' || !isValidRoomCode(joinCodeInput)
                      }
                      className="h-11 px-5 rounded-xl font-semibold text-sm whitespace-nowrap cursor-pointer disabled:opacity-45"
                      style={{
                        backgroundColor: theme.ui.text,
                        color: theme.ui.bg,
                      }}
                    >
                      Join Room
                    </button>
                  </form>
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* ===================== LIVE 1v1 COMPETITION STAGE ===================== */
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
            {/* Shared Common Scramble & Round Controls Bar */}
            <section
              data-testid="arena-scramble-bar"
              className="rounded-2xl border p-3.5 sm:p-4 flex flex-col gap-3"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold" style={{ color: theme.ui.accent }}>
                    Round {room.roundNumber}
                  </span>
                  <span style={{ color: theme.ui.muted }}>·</span>
                  <span className="font-medium">{PUZZLE_META[room.puzzleType].label}</span>
                  <span style={{ color: theme.ui.muted }}>·</span>
                  <span className="font-mono-tabular font-semibold" data-testid="arena-room-code">
                    {room.mode === 'private' ? `Room ${room.roomCode}` : `Match ${room.roomCode}`}
                  </span>
                  <span style={{ color: theme.ui.muted }}>
                    ({room.players.length}/2 players)
                  </span>
                </div>

                {/* Mobile inline score summary */}
                <div className="flex md:hidden items-center gap-1.5 font-display text-sm font-bold tabular-nums">
                  <span>{mySeat?.wins ?? 0}</span>
                  <span style={{ color: theme.ui.muted }}>—</span>
                  <span>{opponentSeat?.wins ?? 0}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {room.mode === 'private' && (
                    <>
                      <button
                        type="button"
                        data-testid="arena-copy-code-btn"
                        onClick={() => triggerCopy('code', room.roomCode)}
                        className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        {copiedFlag === 'code' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedFlag === 'code' ? 'Copied' : 'Copy Code'}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="arena-copy-link-btn"
                        onClick={() => triggerCopy('link', buildInviteUrl(room.roomCode))}
                        className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        {copiedFlag === 'link' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedFlag === 'link' ? 'Link Copied' : 'Invite Link'}</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    data-testid="arena-next-round-btn"
                    disabled={anyRunning}
                    onClick={() => {
                      cubeAudio.playUiTick();
                      arena.requestNextRound();
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
                    style={{
                      backgroundColor: bothFinished ? theme.ui.accent : theme.ui.surfaceSubtle,
                      color: bothFinished ? theme.ui.accentFg : theme.ui.text,
                      border: bothFinished ? 'none' : `1px solid ${theme.ui.border}`,
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{bothFinished ? 'Next Round' : 'New Scramble'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p
                  data-testid="arena-common-scramble"
                  className="font-mono-tabular text-sm sm:text-base lg:text-lg font-semibold tracking-wide leading-snug break-words"
                >
                  {room.currentScramble}
                </p>
                <button
                  type="button"
                  onClick={() => triggerCopy('scramble', room.currentScramble)}
                  aria-label="Copy scramble"
                  className="h-8 px-2.5 rounded-lg border text-xs font-medium shrink-0 inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                    color: theme.ui.muted,
                  }}
                >
                  {copiedFlag === 'scramble' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </section>

            {/* Side-by-Side 50/50 Competitor Panes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              {/* LEFT PANE: LOCAL COMPETITOR (YOU) */}
              <section
                data-testid="arena-local-pane"
                className="rounded-2xl border p-4 flex flex-col gap-3.5"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor:
                    currentRoundRecord?.winnerPlayerId === mySeat?.playerId
                      ? '#16A34A'
                      : theme.ui.border,
                }}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-display text-sm font-bold truncate">
                      {mySeat?.name ?? playerName} (You)
                    </span>
                    {currentRoundRecord?.winnerPlayerId === mySeat?.playerId && (
                      <span className="font-semibold text-emerald-600 whitespace-nowrap">
                        · Round Winner
                      </span>
                    )}
                    {currentRoundRecord?.winnerPlayerId === 'tie' && (
                      <span className="font-semibold whitespace-nowrap" style={{ color: theme.ui.muted }}>
                        · Tie Round
                      </span>
                    )}
                  </div>
                  <span className="font-mono-tabular shrink-0" style={{ color: theme.ui.muted }}>
                    Wins: <strong style={{ color: theme.ui.text }}>{mySeat?.wins ?? 0}</strong>
                    {myMeanMs !== null ? ` · Mean ${formatPreciseTime(myMeanMs)}` : ''}
                  </span>
                </div>

                <VideoFeedBox
                  stream={arena.localStream}
                  camOn={arena.camEnabled}
                  micOn={arena.micEnabled}
                  isLocal={true}
                  muted={true}
                  mirrored={true}
                  name={`${mySeat?.name ?? playerName} (You)`}
                  subtitle={
                    arena.camEnabled
                      ? arena.micEnabled
                        ? 'Live Camera & Mic'
                        : 'Live Camera · Mic Muted'
                      : arena.micEnabled
                        ? 'Audio Only'
                        : 'Avatar Mode'
                  }
                  theme={theme}
                  reactionBubble={mySeat ? reactionByPlayer[mySeat.playerId] ?? null : null}
                  testId="arena-local-video"
                  overlayControls={
                    <>
                      <button
                        type="button"
                        data-testid="stage-toggle-cam-btn"
                        onClick={() => arena.toggleCamera()}
                        aria-label={arena.camEnabled ? 'Turn camera off' : 'Turn camera on'}
                        aria-pressed={arena.camEnabled}
                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                        style={{
                          backgroundColor: arena.camEnabled
                            ? 'rgba(255,255,255,0.2)'
                            : 'rgba(220,38,38,0.85)',
                          color: '#FFFFFF',
                        }}
                      >
                        {arena.camEnabled ? (
                          <Video className="w-4 h-4" />
                        ) : (
                          <VideoOff className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="stage-toggle-mic-btn"
                        onClick={() => arena.toggleMic()}
                        aria-label={arena.micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                        aria-pressed={arena.micEnabled}
                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                        style={{
                          backgroundColor: arena.micEnabled
                            ? 'rgba(255,255,255,0.2)'
                            : 'rgba(220,38,38,0.85)',
                          color: '#FFFFFF',
                        }}
                      >
                        {arena.micEnabled ? (
                          <Mic className="w-4 h-4" />
                        ) : (
                          <MicOff className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  }
                />

                {/* Independent Local Precision Timer Pad */}
                <button
                  type="button"
                  data-testid="arena-local-timer-pad"
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.pointerType === 'mouse') return;
                    e.currentTarget.blur();
                    handleTimerPressStart();
                  }}
                  onPointerUp={() => handleTimerPressEnd()}
                  onPointerCancel={() => handleTimerPressEnd()}
                  className="flex-1 min-h-[142px] rounded-xl border p-4 flex flex-col items-center justify-center gap-1.5 select-none transition-colors cursor-pointer"
                  style={{
                    backgroundColor:
                      localPhase === 'armed'
                        ? 'rgba(22, 163, 74, 0.08)'
                        : localPhase === 'holding'
                          ? 'rgba(217, 119, 6, 0.08)'
                          : theme.ui.surfaceSubtle,
                    borderColor:
                      localPhase === 'armed'
                        ? '#16A34A'
                        : localPhase === 'holding'
                          ? '#D97706'
                          : theme.ui.border,
                    touchAction: 'manipulation',
                  }}
                >
                  <span
                    data-testid="arena-local-timer-value"
                    className="font-mono-tabular font-bold tracking-tight leading-none"
                    style={{
                      fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
                      color: localTimerColor,
                    }}
                  >
                    {localDisplayTime}
                  </span>
                  <span
                    data-testid="arena-local-timer-phase"
                    className="text-xs font-medium"
                    style={{ color: theme.ui.muted }}
                  >
                    {localPhaseCopy}
                  </span>
                </button>

                {/* Penalty Controls (visible when local player finishes the round) */}
                <div className="flex items-center justify-between gap-2 min-h-[34px]">
                  <span className="text-xs" style={{ color: theme.ui.muted }}>
                    {mySeat?.timerPhase === 'finished'
                      ? 'Adjust penalty for this round'
                      : 'Independent start — solve whenever ready'}
                  </span>
                  {mySeat?.timerPhase === 'finished' && (
                    <div className="flex items-center gap-1">
                      {(['none', '+2', 'dnf'] as SolvePenalty[]).map((pen) => {
                        const active = mySeat.currentPenalty === pen;
                        return (
                          <button
                            key={pen}
                            type="button"
                            data-testid={`arena-penalty-${pen}`}
                            onClick={() => {
                              cubeAudio.playUiTick();
                              arena.sendTimerPenalty(pen, room.roundNumber);
                            }}
                            aria-pressed={active}
                            className="h-8 px-2.5 rounded-lg border text-xs font-semibold cursor-pointer"
                            style={{
                              backgroundColor: active ? theme.ui.accent : theme.ui.surfaceSubtle,
                              borderColor: active ? theme.ui.accent : theme.ui.border,
                              color: active ? theme.ui.accentFg : theme.ui.text,
                            }}
                          >
                            {pen === 'none' ? 'OK' : pen.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* RIGHT PANE: OPPONENT COMPETITOR */}
              <section
                data-testid="arena-opponent-pane"
                className="rounded-2xl border p-4 flex flex-col gap-3.5"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor:
                    opponentSeat && currentRoundRecord?.winnerPlayerId === opponentSeat.playerId
                      ? '#16A34A'
                      : theme.ui.border,
                }}
              >
                {!opponentSeat ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl border flex items-center justify-center"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      <Users className="w-6 h-6" style={{ color: theme.ui.accent }} />
                    </div>
                    <div>
                      <h4 className="font-display text-lg font-bold">
                        Waiting for Opponent (1/2)
                      </h4>
                      <p className="text-xs sm:text-sm mt-1 max-w-sm" style={{ color: theme.ui.muted }}>
                        Share this room code or invite link with another speedcuber. Their live
                        video, audio, and timer will appear here as soon as they join.
                      </p>
                    </div>
                    <div
                      className="px-5 py-3 rounded-xl border font-mono-tabular text-2xl font-bold tracking-[0.22em]"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      {room.roomCode}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => triggerCopy('code', room.roomCode)}
                        className="h-9 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedFlag === 'code' ? 'Code Copied' : 'Copy Code'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerCopy('link', buildInviteUrl(room.roomCode))}
                        className="h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.accent,
                          color: theme.ui.accentFg,
                        }}
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{copiedFlag === 'link' ? 'Link Copied' : 'Copy Invite Link'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          data-testid="arena-opponent-name"
                          className="font-display text-sm font-bold truncate"
                        >
                          {opponentSeat.name}
                        </span>
                        {currentRoundRecord?.winnerPlayerId === opponentSeat.playerId && (
                          <span className="font-semibold text-emerald-600 whitespace-nowrap">
                            · Round Winner
                          </span>
                        )}
                      </div>
                      <span
                        className="font-mono-tabular shrink-0"
                        style={{ color: theme.ui.muted }}
                      >
                        Wins:{' '}
                        <strong style={{ color: theme.ui.text }}>{opponentSeat.wins}</strong>
                        {opponentMeanMs !== null
                          ? ` · Mean ${formatPreciseTime(opponentMeanMs)}`
                          : ''}
                      </span>
                    </div>

                    <VideoFeedBox
                      stream={arena.remoteStream}
                      fallbackFrame={arena.remoteFallbackFrame}
                      camOn={opponentSeat.camEnabled}
                      micOn={opponentSeat.micEnabled}
                      isLocal={false}
                      muted={arena.remoteAudioMuted}
                      mirrored={false}
                      name={opponentSeat.name}
                      subtitle={
                        arena.webrtcStatus === 'connected'
                          ? opponentSeat.camEnabled
                            ? 'Live P2P Video & Audio'
                            : opponentSeat.micEnabled
                              ? 'Live P2P Audio'
                              : 'Connected · Avatar Mode'
                          : opponentSeat.camEnabled && arena.remoteFallbackFrame
                            ? 'Live Video Stream · Timers Synced'
                            : arena.webrtcStatus === 'fallback'
                              ? 'Timers Synced · Connecting Relay'
                              : 'Connecting Live Media...'
                      }
                      theme={theme}
                      reactionBubble={reactionByPlayer[opponentSeat.playerId] ?? null}
                      testId="arena-opponent-video"
                      overlayControls={
                        <button
                          type="button"
                          data-testid="stage-mute-opponent-btn"
                          onClick={() => arena.toggleRemoteAudioMuted()}
                          aria-label={
                            arena.remoteAudioMuted
                              ? 'Unmute opponent audio'
                              : 'Mute opponent audio'
                          }
                          aria-pressed={arena.remoteAudioMuted}
                          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{
                            backgroundColor: arena.remoteAudioMuted
                              ? 'rgba(220,38,38,0.85)'
                              : 'rgba(255,255,255,0.2)',
                            color: '#FFFFFF',
                          }}
                        >
                          {arena.remoteAudioMuted ? (
                            <VolumeX className="w-4 h-4" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      }
                    />

                    {/* Opponent Independent Live Timer Display */}
                    <div
                      data-testid="arena-opponent-timer-box"
                      className="flex-1 min-h-[142px] rounded-xl border p-4 flex flex-col items-center justify-center gap-1.5"
                      style={{
                        backgroundColor:
                          opponentSeat.timerPhase === 'armed'
                            ? 'rgba(22, 163, 74, 0.08)'
                            : theme.ui.surfaceSubtle,
                        borderColor:
                          opponentSeat.timerPhase === 'armed' ? '#16A34A' : theme.ui.border,
                      }}
                    >
                      <span
                        data-testid="arena-opponent-timer-value"
                        className="font-mono-tabular font-bold tracking-tight leading-none"
                        style={{
                          fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)',
                          color:
                            opponentSeat.timerPhase === 'armed'
                              ? '#16A34A'
                              : opponentSeat.currentPenalty === 'dnf'
                                ? '#DC2626'
                                : theme.ui.text,
                        }}
                      >
                        {opponentDisplayTime}
                      </span>
                      <span
                        data-testid="arena-opponent-timer-phase"
                        className="text-xs font-medium"
                        style={{ color: theme.ui.muted }}
                      >
                        {opponentPhaseLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 min-h-[34px] text-xs">
                      <span style={{ color: theme.ui.muted }}>
                        {opponentSeat.micEnabled ? 'Mic On' : 'Mic Muted'} ·{' '}
                        {opponentSeat.camEnabled ? 'Camera On' : 'Camera Off'}
                      </span>
                      <span style={{ color: theme.ui.muted }}>
                        {bothFinished ? 'Both finished — ready for Next Round' : 'Live synced'}
                      </span>
                    </div>
                  </>
                )}
              </section>
            </div>

            {/* Compact Quick Chat & Emoji Bar */}
            <section
              data-testid="arena-quick-chat"
              className="rounded-2xl border p-3.5 sm:p-4 flex flex-col gap-3"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
              }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 shrink-0" style={{ color: theme.ui.accent }} />
                  <span className="font-display font-semibold">Quick Chat</span>
                </div>
                <span className="hidden sm:inline" style={{ color: theme.ui.muted }}>
                  Tap a quick phrase or emoji · Spacebar timer stays active
                </span>
              </div>

              {/* Compact live message log */}
              <div
                ref={chatFeedRef}
                data-testid="arena-chat-feed"
                className="max-h-[104px] overflow-y-auto kubi-scroll rounded-xl border px-3 py-2 flex flex-col gap-1.5 text-xs"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.border,
                }}
              >
                {room.chat.length === 0 ? (
                  <p className="py-1" style={{ color: theme.ui.muted }}>
                    No messages yet — send a quick phrase or emoji below.
                  </p>
                ) : (
                  room.chat.map((msg) => {
                    const isMe = msg.playerId === mySeat?.playerId;
                    return (
                      <div key={msg.id} className="flex items-baseline gap-2 leading-snug">
                        <span
                          className="font-semibold shrink-0"
                          style={{ color: isMe ? theme.ui.accent : theme.ui.text }}
                        >
                          {isMe ? `${msg.senderName} (You)` : msg.senderName}:
                        </span>
                        <span className={msg.kind === 'emoji' ? 'text-base leading-none' : ''}>
                          {msg.text}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Preset Emojis + Quick Cubing Phrases */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Emoji reactions">
                  {CHAT_EMOJI_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`arena-chat-btn-${preset.id}`}
                      aria-label={`Send ${preset.label} reaction`}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        cubeAudio.playUiTick();
                        arena.sendChatPreset(preset.id);
                      }}
                      className="h-9 w-9 rounded-lg border text-base inline-flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick chat phrases">
                  {CHAT_TEXT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`arena-chat-btn-${preset.id}`}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        cubeAudio.playUiTick();
                        arena.sendChatPreset(preset.id);
                      }}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-transform active:scale-[0.98] cursor-pointer shrink-0"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.text,
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Bottom Compact Round History Table */}
            <section
              data-testid="arena-round-history"
              className="rounded-2xl border overflow-hidden"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
              }}
            >
              <div
                className="px-4 py-2.5 border-b flex items-center justify-between text-xs"
                style={{ borderColor: theme.ui.border }}
              >
                <span className="font-display font-semibold">Round History</span>
                <span style={{ color: theme.ui.muted }}>
                  {room.history.length} completed round{room.history.length === 1 ? '' : 's'}
                </span>
              </div>

              {room.history.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs" style={{ color: theme.ui.muted }}>
                  Complete Round 1 on both timers to log head-to-head split times and update the
                  live win tally.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr
                        className="border-b"
                        style={{
                          borderColor: theme.ui.border,
                          color: theme.ui.muted,
                        }}
                      >
                        <th className="py-2 px-4 font-medium w-16">Round</th>
                        <th className="py-2 px-4 font-medium">Scramble</th>
                        <th className="py-2 px-4 font-medium text-right whitespace-nowrap">
                          {mySeat?.name ?? 'You'}
                        </th>
                        <th className="py-2 px-4 font-medium text-right whitespace-nowrap">
                          {opponentSeat?.name ?? 'Opponent'}
                        </th>
                        <th className="py-2 px-4 font-medium text-right whitespace-nowrap">
                          Winner
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...room.history].reverse().map((rec) => {
                        const myRes = mySeat ? rec.results[mySeat.playerId] : undefined;
                        const oppRes = opponentSeat
                          ? rec.results[opponentSeat.playerId]
                          : undefined;
                        const winnerName =
                          rec.winnerPlayerId === 'tie'
                            ? 'Tie'
                            : rec.winnerPlayerId === mySeat?.playerId
                              ? `${mySeat?.name} (You)`
                              : opponentSeat?.name ?? 'Opponent';

                        return (
                          <tr
                            key={rec.roundNumber}
                            className="border-b last:border-b-0"
                            style={{ borderColor: theme.ui.border }}
                          >
                            <td className="py-2.5 px-4 font-mono-tabular font-semibold">
                              #{rec.roundNumber}
                            </td>
                            <td
                              className="py-2.5 px-4 font-mono-tabular max-w-[280px] truncate"
                              style={{ color: theme.ui.muted }}
                              title={rec.scramble}
                            >
                              {rec.scramble}
                            </td>
                            <td className="py-2.5 px-4 font-mono-tabular text-right font-semibold">
                              {myRes ? formatRecordTime(myRes) : '—'}
                            </td>
                            <td className="py-2.5 px-4 font-mono-tabular text-right font-semibold">
                              {oppRes ? formatRecordTime(oppRes) : '—'}
                            </td>
                            <td
                              className="py-2.5 px-4 text-right font-semibold whitespace-nowrap"
                              style={{
                                color:
                                  rec.winnerPlayerId === mySeat?.playerId
                                    ? '#16A34A'
                                    : rec.winnerPlayerId === 'tie'
                                      ? theme.ui.muted
                                      : theme.ui.text,
                              }}
                            >
                              {winnerName}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
