import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArenaClientMessage,
  ArenaRoomSnapshot,
  ArenaServerMessage,
} from './arenaEngine';
import type { SolvePenalty } from './timerStats';
import type { PuzzleType } from './types';
import { getBackendConfig } from './backendConfig';

export type ArenaConnectionState =
  | 'connecting'
  | 'waking'
  | 'connected'
  | 'reconnecting'
  | 'offline';
export type WebRtcStatus = 'idle' | 'connecting' | 'connected' | 'fallback';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const FALLBACK_FRAME_INTERVAL_MS = 180;
const FALLBACK_FRAME_WIDTH = 320;
const FALLBACK_FRAME_HEIGHT = 180;
const FALLBACK_FRAME_QUALITY = 0.55;
const FALLBACK_FRAME_MAX_BYTES = 46000;
const WS_KEEPALIVE_INTERVAL_MS = 25000;

export interface UseArenaClientResult {
  connectionState: ArenaConnectionState;
  playerId: string | null;
  room: ArenaRoomSnapshot | null;
  queuedPuzzle: PuzzleType | null;
  queueSize: number;
  queueCounts: Record<PuzzleType, number>;
  errorMessage: string | null;
  clearError: () => void;
  serverClockOffsetMs: number;

  // Media & WebRTC state
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteFallbackFrame: string | null;
  camEnabled: boolean;
  micEnabled: boolean;
  remoteAudioMuted: boolean;
  mediaNotice: string | null;
  webrtcStatus: WebRtcStatus;
  initMedia: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleRemoteAudioMuted: () => void;

  // Room, Chat & Matchmaking actions
  createRoom: (puzzleType: PuzzleType, name: string) => void;
  joinRoom: (roomCode: string, name: string) => void;
  leaveRoom: () => void;
  startMatchmaking: (puzzleType: PuzzleType, name: string) => void;
  cancelMatchmaking: () => void;
  sendTimerPhase: (phase: 'idle' | 'holding' | 'armed' | 'running') => void;
  sendTimerFinish: (timeMs: number, penalty?: SolvePenalty) => void;
  sendTimerPenalty: (penalty: SolvePenalty, roundNumber?: number) => void;
  sendChatPreset: (presetId: string) => void;
  requestNextRound: () => void;
  changeRoomPuzzle: (puzzleType: PuzzleType) => void;
}

export function useArenaClient(active: boolean): UseArenaClientResult {
  const [connectionState, setConnectionState] = useState<ArenaConnectionState>('connecting');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<ArenaRoomSnapshot | null>(null);
  const [queuedPuzzle, setQueuedPuzzle] = useState<PuzzleType | null>(null);
  const [queueSize, setQueueSize] = useState(0);
  const [queueCounts, setQueueCounts] = useState<Record<PuzzleType, number>>({
    '2x2': 0,
    '3x3': 0,
    '4x4': 0,
    mirror: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);

  // Media & WebRTC
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteFallbackFrame, setRemoteFallbackFrame] = useState<string | null>(null);
  const [camEnabled, setCamEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [remoteAudioMuted, setRemoteAudioMuted] = useState(false);
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [webrtcStatus, setWebrtcStatus] = useState<WebRtcStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const playerIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const camEnabledRef = useRef(false);
  const micEnabledRef = useRef(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const activePeerIdRef = useRef<string | null>(null);
  const isPoliteRef = useRef<boolean>(false);
  const makingOfferRef = useRef<boolean>(false);
  const iceRestartedRef = useRef<boolean>(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  const mediaInitializedRef = useRef(false);

  playerIdRef.current = playerId;
  camEnabledRef.current = camEnabled;
  micEnabledRef.current = micEnabled;

  const sendMessage = useCallback((msg: ArenaClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }, []);

  const rebuildRemoteStream = useCallback(() => {
    const liveTracks = Array.from(remoteTracksRef.current.values()).filter(
      (t) => t.readyState === 'live'
    );
    if (liveTracks.length === 0) {
      setRemoteStream(null);
      return;
    }
    // Always construct a fresh MediaStream instance so React reliably re-renders video/audio bindings
    setRemoteStream(new MediaStream(liveTracks));
  }, []);

  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore teardown errors
      }
      pcRef.current = null;
    }
    activePeerIdRef.current = null;
    isPoliteRef.current = false;
    makingOfferRef.current = false;
    iceRestartedRef.current = false;
    pendingIceRef.current = [];
    remoteTracksRef.current.clear();
    setRemoteStream(null);
    setRemoteFallbackFrame(null);
    setWebrtcStatus('idle');
  }, []);

  const stopLocalMedia = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      localStreamRef.current = null;
    }
    mediaInitializedRef.current = false;
    setLocalStream(null);
    setCamEnabled(false);
    setMicEnabled(false);
  }, []);

  /**
   * Bind local video and audio tracks onto bidirectional sendrecv transceivers.
   * Uses replaceTrack on existing transceivers so toggling camera/mic on after
   * initial connection immediately streams without creating conflicting m-lines.
   */
  const attachLocalTracksToPc = useCallback(
    async (
      pc: RTCPeerConnection,
      stream: MediaStream | null,
      createMissing = false
    ): Promise<boolean> => {
      let needsRenegotiation = false;
      const transceivers = pc.getTransceivers();

      for (const kind of ['video', 'audio'] as const) {
        const track =
          kind === 'video'
            ? stream?.getVideoTracks().find((t) => t.readyState === 'live') ?? null
            : stream?.getAudioTracks().find((t) => t.readyState === 'live') ?? null;

        const existing = transceivers.find(
          (t) => t.receiver.track?.kind === kind || t.sender.track?.kind === kind
        );

        if (existing) {
          const currentDir = existing.currentDirection;
          const attachingNewTrack = Boolean(track && existing.sender.track !== track);
          if (existing.direction !== 'sendrecv') {
            try {
              existing.direction = 'sendrecv';
              needsRenegotiation = true;
            } catch {
              // ignore browser restrictions on closed/stopped transceivers
            }
          }
          if (attachingNewTrack && currentDir !== 'sendrecv' && currentDir !== 'sendonly') {
            needsRenegotiation = true;
          }
          if (existing.sender.track !== track) {
            await existing.sender.replaceTrack(track).catch(() => {});
          }
        } else if (createMissing || track) {
          try {
            if (track && stream) {
              pc.addTransceiver(track, { direction: 'sendrecv', streams: [stream] });
            } else {
              pc.addTransceiver(kind, { direction: 'sendrecv' });
            }
            needsRenegotiation = true;
          } catch {
            if (track && stream) {
              try {
                pc.addTrack(track, stream);
                needsRenegotiation = true;
              } catch {
                // ignore
              }
            }
          }
        }
      }

      return needsRenegotiation;
    },
    []
  );

  const negotiateOfferRef = useRef<(peerId: string, iceRestart?: boolean) => Promise<void>>(
    async () => {}
  );

  const ensurePeerConnection = useCallback(
    (peerId: string, isOfferer: boolean): RTCPeerConnection | null => {
      if (typeof RTCPeerConnection === 'undefined') {
        setWebrtcStatus('fallback');
        return null;
      }

      if (pcRef.current && activePeerIdRef.current === peerId) {
        return pcRef.current;
      }

      closePeerConnection();
      activePeerIdRef.current = peerId;
      isPoliteRef.current = !isOfferer;
      iceRestartedRef.current = false;
      setWebrtcStatus('connecting');

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Offerer creates bidirectional sendrecv transceivers for both video and audio upfront.
      // Answerer binds tracks right after setRemoteDescription(offer) so m-lines always match 1:1.
      if (isOfferer) {
        attachLocalTracksToPc(pc, localStreamRef.current, true);
      }

      pc.ontrack = (event) => {
        const track = event.track;
        if (!track) return;

        remoteTracksRef.current.set(track.id, track);
        rebuildRemoteStream();

        track.onunmute = () => {
          remoteTracksRef.current.set(track.id, track);
          rebuildRemoteStream();
        };
        track.onmute = () => {
          rebuildRemoteStream();
        };
        track.onended = () => {
          remoteTracksRef.current.delete(track.id);
          rebuildRemoteStream();
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendMessage({
            type: 'webrtc:signal',
            signalType: 'ice',
            payload: event.candidate.toJSON(),
          });
        }
      };

      const syncConnState = () => {
        const state: string = pc.connectionState || pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          iceRestartedRef.current = false;
          setWebrtcStatus('connected');
        } else if (state === 'failed') {
          if (!iceRestartedRef.current && !isPoliteRef.current && activePeerIdRef.current) {
            iceRestartedRef.current = true;
            negotiateOfferRef.current(activePeerIdRef.current, true);
          } else {
            setWebrtcStatus('fallback');
          }
        } else if (state === 'disconnected') {
          setWebrtcStatus('fallback');
        } else if (state === 'connecting' || state === 'checking' || state === 'new') {
          setWebrtcStatus('connecting');
        }
      };

      pc.onconnectionstatechange = syncConnState;
      pc.oniceconnectionstatechange = syncConnState;

      return pc;
    },
    [attachLocalTracksToPc, closePeerConnection, rebuildRemoteStream, sendMessage]
  );

  const negotiateOffer = useCallback(
    async (peerId: string, iceRestart = false) => {
      const pc = ensurePeerConnection(peerId, !isPoliteRef.current);
      if (!pc) return;
      if (makingOfferRef.current) return;
      if (pc.signalingState !== 'stable') return;

      makingOfferRef.current = true;
      try {
        await attachLocalTracksToPc(pc, localStreamRef.current, true);
        const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'webrtc:signal',
          signalType: 'offer',
          payload: pc.localDescription,
        });
      } catch {
        setWebrtcStatus('fallback');
      } finally {
        makingOfferRef.current = false;
      }
    },
    [attachLocalTracksToPc, ensurePeerConnection, sendMessage]
  );

  negotiateOfferRef.current = negotiateOffer;

  const handleIncomingSignal = useCallback(
    async (fromPlayerId: string, signalType: 'offer' | 'answer' | 'ice', payload: unknown) => {
      const pc = ensurePeerConnection(fromPlayerId, false);
      if (!pc) return;

      try {
        if (signalType === 'offer' && payload && typeof payload === 'object') {
          const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
          if (offerCollision) {
            if (!isPoliteRef.current) {
              // Impolite peer ignores colliding offer; polite peer will accept ours
              return;
            }
            await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
          }

          await pc.setRemoteDescription(
            new RTCSessionDescription(payload as RTCSessionDescriptionInit)
          );

          // Bind local camera/mic into the incoming offer's transceivers BEFORE creating answer
          await attachLocalTracksToPc(pc, localStreamRef.current, false);

          for (const cand of pendingIceRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingIceRef.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendMessage({
            type: 'webrtc:signal',
            signalType: 'answer',
            payload: pc.localDescription,
          });
        } else if (signalType === 'answer' && payload && typeof payload === 'object') {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(
              new RTCSessionDescription(payload as RTCSessionDescriptionInit)
            );
            for (const cand of pendingIceRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            pendingIceRef.current = [];
          }
        } else if (signalType === 'ice' && payload && typeof payload === 'object') {
          const cand = payload as RTCIceCandidateInit;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          } else {
            pendingIceRef.current.push(cand);
          }
        }
      } catch {
        setWebrtcStatus('fallback');
      }
    },
    [attachLocalTracksToPc, ensurePeerConnection, sendMessage]
  );

  const syncTracksToActivePeer = useCallback(
    async (stream: MediaStream | null) => {
      const pc = pcRef.current;
      const peerId = activePeerIdRef.current;
      if (!pc || !peerId) return;
      const needsRenegotiation = await attachLocalTracksToPc(pc, stream, false);
      if (needsRenegotiation && pc.signalingState === 'stable') {
        await negotiateOffer(peerId);
      }
    },
    [attachLocalTracksToPc, negotiateOffer]
  );

  const initMedia = useCallback(async () => {
    if (mediaInitializedRef.current && localStreamRef.current) return;
    mediaInitializedRef.current = true;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Camera & mic unavailable in this browser — competing in avatar + timer mode.');
      setCamEnabled(false);
      setMicEnabled(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCamEnabled(true);
      setMicEnabled(true);
      setMediaNotice(null);
      sendMessage({ type: 'media:status', camEnabled: true, micEnabled: true });
      await syncTracksToActivePeer(stream);
      return;
    } catch {
      // Progressive fallback: try audio-only if camera is absent or blocked
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setCamEnabled(false);
        setMicEnabled(true);
        setMediaNotice('No camera detected — competing in audio-only + avatar mode.');
        sendMessage({ type: 'media:status', camEnabled: false, micEnabled: true });
        await syncTracksToActivePeer(audioStream);
      } catch {
        setLocalStream(null);
        setCamEnabled(false);
        setMicEnabled(false);
        setMediaNotice('Camera & microphone off — competing in avatar + live timer mode.');
        sendMessage({ type: 'media:status', camEnabled: false, micEnabled: false });
      }
    }
  }, [sendMessage, syncTracksToActivePeer]);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const videoTracks = stream?.getVideoTracks().filter((t) => t.readyState === 'live') ?? [];

    if (videoTracks.length > 0) {
      const next = !camEnabledRef.current;
      for (const track of videoTracks) {
        track.enabled = next;
      }
      setCamEnabled(next);
      sendMessage({ type: 'media:status', camEnabled: next, micEnabled: micEnabledRef.current });
      if (next && pcRef.current) {
        await syncTracksToActivePeer(stream);
      }
      return;
    }

    // Request camera track dynamically if user initially entered without video
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Camera is not available on this device.');
      return;
    }
    try {
      const vidStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' },
        audio: false,
      });
      const newTrack = vidStream.getVideoTracks()[0];
      if (!newTrack) return;

      const combined = new MediaStream([
        ...(localStreamRef.current?.getAudioTracks().filter((t) => t.readyState === 'live') ?? []),
        newTrack,
      ]);
      localStreamRef.current = combined;
      setLocalStream(combined);
      setCamEnabled(true);
      setMediaNotice(null);
      sendMessage({ type: 'media:status', camEnabled: true, micEnabled: micEnabledRef.current });
      await syncTracksToActivePeer(combined);
    } catch {
      setMediaNotice('Camera permission declined — staying in avatar mode.');
    }
  }, [sendMessage, syncTracksToActivePeer]);

  const toggleMic = useCallback(async () => {
    const stream = localStreamRef.current;
    const audioTracks = stream?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];

    if (audioTracks.length > 0) {
      const next = !micEnabledRef.current;
      for (const track of audioTracks) {
        track.enabled = next;
      }
      setMicEnabled(next);
      sendMessage({ type: 'media:status', camEnabled: camEnabledRef.current, micEnabled: next });
      if (next && pcRef.current) {
        await syncTracksToActivePeer(stream);
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaNotice('Microphone is not available on this device.');
      return;
    }
    try {
      const audStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const newTrack = audStream.getAudioTracks()[0];
      if (!newTrack) return;

      const combined = new MediaStream([
        ...(localStreamRef.current?.getVideoTracks().filter((t) => t.readyState === 'live') ?? []),
        newTrack,
      ]);
      localStreamRef.current = combined;
      setLocalStream(combined);
      setMicEnabled(true);
      setMediaNotice(null);
      sendMessage({ type: 'media:status', camEnabled: camEnabledRef.current, micEnabled: true });
      await syncTracksToActivePeer(combined);
    } catch {
      setMediaNotice('Microphone permission declined.');
    }
  }, [sendMessage, syncTracksToActivePeer]);

  const toggleRemoteAudioMuted = useCallback(() => {
    setRemoteAudioMuted((prev) => !prev);
  }, []);

  // Automatic WebSocket video-frame relay while native WebRTC P2P is connecting or blocked by strict NAT.
  // Automatically pauses as soon as native WebRTC P2P reaches 'connected'.
  const hasOpponentInRoom = Boolean(room && room.players.length === 2);
  useEffect(() => {
    if (!active || !hasOpponentInRoom || !camEnabled || !localStream) {
      return;
    }
    if (webrtcStatus === 'connected') {
      return;
    }
    const videoTracks = localStream.getVideoTracks().filter((t) => t.readyState === 'live');
    if (videoTracks.length === 0) return;

    const captureVideo = document.createElement('video');
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.autoplay = true;
    captureVideo.srcObject = new MediaStream(videoTracks);
    captureVideo.play().catch(() => {});

    const canvas = document.createElement('canvas');
    canvas.width = FALLBACK_FRAME_WIDTH;
    canvas.height = FALLBACK_FRAME_HEIGHT;
    const ctx = canvas.getContext('2d');

    const intervalId = window.setInterval(() => {
      if (!ctx || captureVideo.readyState < 2 || captureVideo.videoWidth === 0) return;
      try {
        ctx.drawImage(captureVideo, 0, 0, FALLBACK_FRAME_WIDTH, FALLBACK_FRAME_HEIGHT);
        const dataUrl = canvas.toDataURL('image/jpeg', FALLBACK_FRAME_QUALITY);
        if (dataUrl.length <= FALLBACK_FRAME_MAX_BYTES) {
          sendMessage({ type: 'webrtc:frame', dataUrl });
        }
      } catch {
        // ignore transient canvas capture issues
      }
    }, FALLBACK_FRAME_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      captureVideo.srcObject = null;
    };
  }, [active, hasOpponentInRoom, camEnabled, localStream, webrtcStatus, sendMessage]);

  // WebSocket lifecycle + automatic reconnect while Arena modal is open
  useEffect(() => {
    if (!active) {
      closePeerConnection();
      stopLocalMedia();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      setRoom(null);
      setQueuedPuzzle(null);
      setErrorMessage(null);
      return;
    }

    let disposed = false;
    let keepAliveTimer: number | null = null;
    let wakeHintTimer: number | null = null;
    const backend = getBackendConfig();

    const clearSocketTimers = () => {
      if (keepAliveTimer !== null) {
        window.clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (wakeHintTimer !== null) {
        window.clearTimeout(wakeHintTimer);
        wakeHintTimer = null;
      }
    };

    if (backend.needsExternalBackend || !backend.arenaWsUrl) {
      setConnectionState('offline');
      setErrorMessage(
        'GitHub Pages hosts static files only. Deploy the included Render WebSocket backend (render.yaml) and set VITE_BACKEND_URL in GitHub Repository Variables to enable live 1v1 matches.'
      );
      initMedia();
      return () => {
        disposed = true;
        closePeerConnection();
        stopLocalMedia();
      };
    }

    const wsUrl = backend.arenaWsUrl;

    // Warm up free-tier Render instance via /api/health so cold starts wake immediately
    if (backend.isExternalBackend && backend.healthUrl) {
      fetch(backend.healthUrl, { mode: 'cors', cache: 'no-store' }).catch(() => {});
    }

    const connect = () => {
      if (disposed) return;
      clearSocketTimers();
      setConnectionState(
        reconnectAttemptRef.current > 0
          ? backend.isExternalBackend && reconnectAttemptRef.current <= 3
            ? 'waking'
            : 'reconnecting'
          : 'connecting'
      );

      if (backend.isExternalBackend) {
        wakeHintTimer = window.setTimeout(() => {
          if (!disposed && wsRef.current?.readyState !== WebSocket.OPEN) {
            setConnectionState('waking');
          }
        }, 2200);
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        clearSocketTimers();
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setErrorMessage(null);

        // Keep WebSocket warm across reverse proxies (Render / Cloudflare / Cloud Run)
        keepAliveTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // ignore transient ping error
            }
          }
        }, WS_KEEPALIVE_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (disposed) return;
        let msg: ArenaServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ArenaServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'welcome': {
            setPlayerId(msg.playerId);
            playerIdRef.current = msg.playerId;
            setQueueCounts(msg.queueCounts);
            break;
          }
          case 'queue:status': {
            setQueuedPuzzle(msg.queued ? msg.puzzleType : null);
            setQueueSize(msg.queueSize);
            setQueueCounts(msg.queueCounts);
            break;
          }
          case 'room:state': {
            setServerClockOffsetMs(msg.room.serverTimeMs - Date.now());
            setRoom(msg.room);
            setQueuedPuzzle(null);
            setErrorMessage(null);

            const me = msg.room.players.find((p) => p.playerId === playerIdRef.current);
            const peer = msg.room.players.find((p) => p.playerId !== playerIdRef.current);

            if (
              me &&
              (msg.event === 'created' || msg.event === 'joined' || msg.event === 'matched') &&
              (me.camEnabled !== camEnabledRef.current || me.micEnabled !== micEnabledRef.current)
            ) {
              sendMessage({
                type: 'media:status',
                camEnabled: camEnabledRef.current,
                micEnabled: micEnabledRef.current,
              });
            }

            if (!peer) {
              closePeerConnection();
            } else {
              if (!peer.camEnabled) {
                setRemoteFallbackFrame(null);
              }
              if (activePeerIdRef.current !== peer.playerId) {
                // Deterministic WebRTC initiation: seat 0 creates offer, seat 1 answers politely
                const isOfferer = Boolean(me && me.seat === 0);
                ensurePeerConnection(peer.playerId, isOfferer);
                if (isOfferer) {
                  negotiateOffer(peer.playerId);
                }
              }
            }
            break;
          }
          case 'room:left': {
            setRoom(null);
            closePeerConnection();
            break;
          }
          case 'webrtc:signal': {
            handleIncomingSignal(msg.fromPlayerId, msg.signalType, msg.payload);
            break;
          }
          case 'webrtc:frame': {
            if (msg.fromPlayerId === activePeerIdRef.current && typeof msg.dataUrl === 'string') {
              setRemoteFallbackFrame(msg.dataUrl);
            }
            break;
          }
          case 'error': {
            setErrorMessage(msg.message);
            break;
          }
          case 'pong': {
            setServerClockOffsetMs(msg.serverTimeMs - Date.now());
            break;
          }
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        clearSocketTimers();
        wsRef.current = null;
        const nextState: ArenaConnectionState =
          backend.isExternalBackend && reconnectAttemptRef.current < 3 ? 'waking' : 'reconnecting';
        setConnectionState(nextState);
        const delay = Math.min(8000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        if (disposed) return;
        setConnectionState(
          backend.isExternalBackend && reconnectAttemptRef.current < 3 ? 'waking' : 'reconnecting'
        );
      };
    };

    connect();
    // Initialize optional local media preview immediately with graceful fallback
    initMedia();

    return () => {
      disposed = true;
      clearSocketTimers();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      closePeerConnection();
      stopLocalMedia();
    };
  }, [
    active,
    closePeerConnection,
    ensurePeerConnection,
    handleIncomingSignal,
    initMedia,
    negotiateOffer,
    sendMessage,
    stopLocalMedia,
  ]);

  const createRoom = useCallback(
    (puzzleType: PuzzleType, name: string) => {
      setErrorMessage(null);
      const sent = sendMessage({
        type: 'room:create',
        puzzleType,
        name,
        camEnabled: camEnabledRef.current,
        micEnabled: micEnabledRef.current,
      });
      if (!sent) {
        setErrorMessage('Still connecting to the competition server. Please try again.');
      }
    },
    [sendMessage]
  );

  const joinRoom = useCallback(
    (roomCode: string, name: string) => {
      setErrorMessage(null);
      const sent = sendMessage({
        type: 'room:join',
        roomCode,
        name,
        camEnabled: camEnabledRef.current,
        micEnabled: micEnabledRef.current,
      });
      if (!sent) {
        setErrorMessage('Still connecting to the competition server. Please try again.');
      }
    },
    [sendMessage]
  );

  const leaveRoom = useCallback(() => {
    sendMessage({ type: 'room:leave' });
    setRoom(null);
    closePeerConnection();
  }, [closePeerConnection, sendMessage]);

  const startMatchmaking = useCallback(
    (puzzleType: PuzzleType, name: string) => {
      setErrorMessage(null);
      const sent = sendMessage({
        type: 'matchmaking:join',
        puzzleType,
        name,
        camEnabled: camEnabledRef.current,
        micEnabled: micEnabledRef.current,
      });
      if (!sent) {
        setErrorMessage('Still connecting to the competition server. Please try again.');
      }
    },
    [sendMessage]
  );

  const cancelMatchmaking = useCallback(() => {
    sendMessage({ type: 'matchmaking:leave' });
    setQueuedPuzzle(null);
  }, [sendMessage]);

  const sendTimerPhase = useCallback(
    (phase: 'idle' | 'holding' | 'armed' | 'running') => {
      sendMessage({ type: 'timer:phase', phase });
    },
    [sendMessage]
  );

  const sendTimerFinish = useCallback(
    (timeMs: number, penalty: SolvePenalty = 'none') => {
      sendMessage({ type: 'timer:finish', timeMs, penalty });
    },
    [sendMessage]
  );

  const sendTimerPenalty = useCallback(
    (penalty: SolvePenalty, roundNumber?: number) => {
      sendMessage({ type: 'timer:penalty', penalty, roundNumber });
    },
    [sendMessage]
  );

  const sendChatPreset = useCallback(
    (presetId: string) => {
      sendMessage({ type: 'chat:send', presetId });
    },
    [sendMessage]
  );

  const requestNextRound = useCallback(() => {
    sendMessage({ type: 'round:next' });
  }, [sendMessage]);

  const changeRoomPuzzle = useCallback(
    (puzzleType: PuzzleType) => {
      sendMessage({ type: 'room:puzzle', puzzleType });
    },
    [sendMessage]
  );

  return {
    connectionState,
    playerId,
    room,
    queuedPuzzle,
    queueSize,
    queueCounts,
    errorMessage,
    clearError: () => setErrorMessage(null),
    serverClockOffsetMs,
    localStream,
    remoteStream,
    remoteFallbackFrame,
    camEnabled,
    micEnabled,
    remoteAudioMuted,
    mediaNotice,
    webrtcStatus,
    initMedia,
    toggleCamera,
    toggleMic,
    toggleRemoteAudioMuted,
    createRoom,
    joinRoom,
    leaveRoom,
    startMatchmaking,
    cancelMatchmaking,
    sendTimerPhase,
    sendTimerFinish,
    sendTimerPenalty,
    sendChatPreset,
    requestNextRound,
    changeRoomPuzzle,
  };
}
