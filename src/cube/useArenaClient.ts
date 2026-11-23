import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArenaClientMessage,
  ArenaRoomSnapshot,
  ArenaServerMessage,
} from './arenaEngine';
import type { SolvePenalty } from './timerStats';
import type { PuzzleType } from './types';

export type ArenaConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';
export type WebRtcStatus = 'idle' | 'connecting' | 'connected' | 'fallback';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

function buildArenaWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/arena`;
}

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
  camEnabled: boolean;
  micEnabled: boolean;
  remoteAudioMuted: boolean;
  mediaNotice: string | null;
  webrtcStatus: WebRtcStatus;
  initMedia: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleRemoteAudioMuted: () => void;

  // Room & Matchmaking actions
  createRoom: (puzzleType: PuzzleType, name: string) => void;
  joinRoom: (roomCode: string, name: string) => void;
  leaveRoom: () => void;
  startMatchmaking: (puzzleType: PuzzleType, name: string) => void;
  cancelMatchmaking: () => void;
  sendTimerPhase: (phase: 'idle' | 'holding' | 'armed' | 'running') => void;
  sendTimerFinish: (timeMs: number, penalty?: SolvePenalty) => void;
  sendTimerPenalty: (penalty: SolvePenalty, roundNumber?: number) => void;
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
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
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
    pendingIceRef.current = [];
    setRemoteStream(null);
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

  const attachLocalTracksToPc = useCallback((pc: RTCPeerConnection, stream: MediaStream | null) => {
    if (!stream) return;
    const senders = pc.getSenders();
    for (const track of stream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        existing.replaceTrack(track).catch(() => {});
      } else {
        pc.addTrack(track, stream);
      }
    }
  }, []);

  const ensurePeerConnection = useCallback(
    (peerId: string): RTCPeerConnection | null => {
      if (typeof RTCPeerConnection === 'undefined') {
        setWebrtcStatus('fallback');
        return null;
      }

      if (pcRef.current && activePeerIdRef.current === peerId) {
        return pcRef.current;
      }

      closePeerConnection();
      activePeerIdRef.current = peerId;
      setWebrtcStatus('connecting');

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Always receive opponent's video/audio even if local user is in audio-only or avatar fallback mode
      const stream = localStreamRef.current;
      const hasLocalVideo = Boolean(stream?.getVideoTracks().length);
      const hasLocalAudio = Boolean(stream?.getAudioTracks().length);

      if (stream) {
        attachLocalTracksToPc(pc, stream);
      }
      if (!hasLocalVideo) {
        try {
          pc.addTransceiver('video', { direction: 'recvonly' });
        } catch {
          // ignore browser differences
        }
      }
      if (!hasLocalAudio) {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch {
          // ignore browser differences
        }
      }

      const incomingStream = new MediaStream();
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else if (event.track) {
          incomingStream.addTrack(event.track);
          setRemoteStream(new MediaStream(incomingStream.getTracks()));
        }
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
          setWebrtcStatus('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          setWebrtcStatus('fallback');
        } else if (state === 'connecting' || state === 'checking' || state === 'new') {
          setWebrtcStatus('connecting');
        }
      };

      pc.onconnectionstatechange = syncConnState;
      pc.oniceconnectionstatechange = syncConnState;

      return pc;
    },
    [attachLocalTracksToPc, closePeerConnection, sendMessage]
  );

  const negotiateOffer = useCallback(
    async (peerId: string) => {
      const pc = ensurePeerConnection(peerId);
      if (!pc) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'webrtc:signal',
          signalType: 'offer',
          payload: pc.localDescription,
        });
      } catch {
        setWebrtcStatus('fallback');
      }
    },
    [ensurePeerConnection, sendMessage]
  );

  const handleIncomingSignal = useCallback(
    async (fromPlayerId: string, signalType: 'offer' | 'answer' | 'ice', payload: unknown) => {
      const pc = ensurePeerConnection(fromPlayerId);
      if (!pc) return;

      try {
        if (signalType === 'offer' && payload && typeof payload === 'object') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload as RTCSessionDescriptionInit));
          // Flush buffered ICE candidates
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
    [ensurePeerConnection, sendMessage]
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
      } catch {
        setLocalStream(null);
        setCamEnabled(false);
        setMicEnabled(false);
        setMediaNotice('Camera & microphone off — competing in avatar + live timer mode.');
        sendMessage({ type: 'media:status', camEnabled: false, micEnabled: false });
      }
    }
  }, [sendMessage]);

  const toggleCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const videoTracks = stream?.getVideoTracks() ?? [];

    if (videoTracks.length > 0) {
      const next = !camEnabledRef.current;
      for (const track of videoTracks) {
        track.enabled = next;
      }
      setCamEnabled(next);
      sendMessage({ type: 'media:status', camEnabled: next, micEnabled: micEnabledRef.current });
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
        ...(localStreamRef.current?.getAudioTracks() ?? []),
        newTrack,
      ]);
      localStreamRef.current = combined;
      setLocalStream(combined);
      setCamEnabled(true);
      setMediaNotice(null);
      sendMessage({ type: 'media:status', camEnabled: true, micEnabled: micEnabledRef.current });

      if (pcRef.current && activePeerIdRef.current) {
        attachLocalTracksToPc(pcRef.current, combined);
        await negotiateOffer(activePeerIdRef.current);
      }
    } catch {
      setMediaNotice('Camera permission declined — staying in avatar mode.');
    }
  }, [attachLocalTracksToPc, negotiateOffer, sendMessage]);

  const toggleMic = useCallback(async () => {
    const stream = localStreamRef.current;
    const audioTracks = stream?.getAudioTracks() ?? [];

    if (audioTracks.length > 0) {
      const next = !micEnabledRef.current;
      for (const track of audioTracks) {
        track.enabled = next;
      }
      setMicEnabled(next);
      sendMessage({ type: 'media:status', camEnabled: camEnabledRef.current, micEnabled: next });
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
        ...(localStreamRef.current?.getVideoTracks() ?? []),
        newTrack,
      ]);
      localStreamRef.current = combined;
      setLocalStream(combined);
      setMicEnabled(true);
      setMediaNotice(null);
      sendMessage({ type: 'media:status', camEnabled: camEnabledRef.current, micEnabled: true });

      if (pcRef.current && activePeerIdRef.current) {
        attachLocalTracksToPc(pcRef.current, combined);
        await negotiateOffer(activePeerIdRef.current);
      }
    } catch {
      setMediaNotice('Microphone permission declined.');
    }
  }, [attachLocalTracksToPc, negotiateOffer, sendMessage]);

  const toggleRemoteAudioMuted = useCallback(() => {
    setRemoteAudioMuted((prev) => !prev);
  }, []);

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

    const connect = () => {
      if (disposed) return;
      setConnectionState(reconnectAttemptRef.current > 0 ? 'reconnecting' : 'connecting');

      const ws = new WebSocket(buildArenaWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
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

            if (!peer) {
              closePeerConnection();
            } else if (activePeerIdRef.current !== peer.playerId) {
              // Deterministic WebRTC initiation: seat 0 initiates offer, seat 1 prepares to answer
              ensurePeerConnection(peer.playerId);
              if (me && me.seat === 0) {
                negotiateOffer(peer.playerId);
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
        wsRef.current = null;
        setConnectionState('reconnecting');
        const delay = Math.min(8000, 1000 * Math.pow(2, reconnectAttemptRef.current));
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        if (disposed) return;
        setConnectionState('reconnecting');
      };
    };

    connect();
    // Initialize optional local media preview immediately with graceful fallback
    initMedia();

    return () => {
      disposed = true;
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
    requestNextRound,
    changeRoomPuzzle,
  };
}
