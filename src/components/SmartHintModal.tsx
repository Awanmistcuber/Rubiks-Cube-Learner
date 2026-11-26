import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Box,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  Compass,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Sparkles,
  SwitchCamera,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { cubeAudio } from '../cube/audio';
import { buildApiUrl } from '../cube/backendConfig';
import {
  applyNotationToScannedFaces,
  buildColorCalibration,
  buildScannedFacesFromScramble,
  classifyRgbToWcaFace,
  computeBasicAlgorithmHints,
  createSolvedScannedFaces,
  describeMoveInstruction,
  recalibrateScannedFaces,
  SAMPLE_SCAN_PRESETS,
  sampleGridFromRgba,
  SCAN_FACE_ORDER,
  scannedFacesToCubieStates,
  validateScannedCube,
  WCA_FACE_META,
  type ColorCalibration,
  type RgbTriplet,
  type ScannedFaces,
  type ScannedRgbFaces,
  type SmartHintAlgorithmId,
  type SmartHintOption,
  type WcaFace,
} from '../cube/cubeScanner';
import type { CubieState, ThemePalette } from '../cube/types';

interface SmartHintModalProps {
  theme: ThemePalette;
  onClose: () => void;
  onSyncToStudio: (cubies: CubieState[], moves: string[], methodLabel: string) => void;
}

const NET_SLOTS: { face: WcaFace; gridCol: number; gridRow: number }[] = [
  { face: 'U', gridCol: 2, gridRow: 1 },
  { face: 'L', gridCol: 1, gridRow: 2 },
  { face: 'F', gridCol: 2, gridRow: 2 },
  { face: 'R', gridCol: 3, gridRow: 2 },
  { face: 'B', gridCol: 4, gridRow: 2 },
  { face: 'D', gridCol: 2, gridRow: 3 },
];

const RETICLE_BOX_FRACTION = 0.62;

function cloneScannedFaces(faces: ScannedFaces): ScannedFaces {
  return {
    U: [...faces.U],
    R: [...faces.R],
    F: [...faces.F],
    D: [...faces.D],
    L: [...faces.L],
    B: [...faces.B],
  };
}

export const SmartHintModal: React.FC<SmartHintModalProps> = ({
  theme,
  onClose,
  onSyncToStudio,
}) => {
  const [activeView, setActiveView] = useState<'scan' | 'solution'>('scan');
  const [faces, setFaces] = useState<ScannedFaces>(() => createSolvedScannedFaces());
  const [rawRgbs, setRawRgbs] = useState<ScannedRgbFaces>({});
  const [capturedFaces, setCapturedFaces] = useState<Record<WcaFace, boolean>>({
    U: false,
    R: false,
    F: false,
    D: false,
    L: false,
    B: false,
  });
  const [activeFace, setActiveFace] = useState<WcaFace>('F');
  const [selectedBrush, setSelectedBrush] = useState<WcaFace>('F');

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<WcaFace[] | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [uploadedBase64, setUploadedBase64] = useState<string | null>(null);

  // AI Vision scan state
  const [aiScanning, setAiScanning] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Solver & Smart Hint state
  const [kociembaLoading, setKociembaLoading] = useState(false);
  const [kociembaError, setKociembaError] = useState<string | null>(null);
  const [kociembaOption, setKociembaOption] = useState<SmartHintOption | null>(null);
  const [basicOptions, setBasicOptions] = useState<SmartHintOption[]>([]);
  const [selectedAlgoId, setSelectedAlgoId] = useState<SmartHintAlgorithmId>('kociemba');
  const [solutionBaseFaces, setSolutionBaseFaces] = useState<ScannedFaces>(() => createSolvedScannedFaces());
  const [currentStepIdx, setCurrentStepIdx] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const sampleTimerRef = useRef<number | null>(null);

  // Progressive color calibration built from whichever physical face centers have been scanned so far
  const liveCalibration = useMemo(() => buildColorCalibration(rawRgbs), [rawRgbs]);
  const liveCalibrationRef = useRef<ColorCalibration>(liveCalibration);
  liveCalibrationRef.current = liveCalibration;

  const validation = useMemo(() => validateScannedCube(faces), [faces]);

  const stopCamera = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      window.clearInterval(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setLivePreview(null);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Extract a centered square crop from the active video stream into the offscreen canvas
  const sampleCurrentVideoFrame = useCallback((): {
    facesGrid: WcaFace[];
    rgbs: RgbTriplet[];
    cropDataUrl: string;
  } | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    let canvas = sampleCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      sampleCanvasRef.current = canvas;
    }

    const size = 360;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Center-crop square region matching object-cover display
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const minDim = Math.min(vw, vh);
    const sx = (vw - minDim) / 2;
    const sy = (vh - minDim) / 2;

    ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size);
    const rgbs = sampleGridFromRgba(imgData.data, size, size, RETICLE_BOX_FRACTION);
    const facesGrid = rgbs.map((rgb) => classifyRgbToWcaFace(rgb, liveCalibrationRef.current));

    // Also render cropped reticle-only JPEG for optional AI Vision Read
    const cropCanvas = document.createElement('canvas');
    const cropSize = 384;
    cropCanvas.width = cropSize;
    cropCanvas.height = cropSize;
    const cropCtx = cropCanvas.getContext('2d');
    if (cropCtx) {
      const boxPx = minDim * (RETICLE_BOX_FRACTION + 0.14);
      const cx = (vw - boxPx) / 2;
      const cy = (vh - boxPx) / 2;
      cropCtx.drawImage(video, cx, cy, boxPx, boxPx, 0, 0, cropSize, cropSize);
    }

    return {
      facesGrid,
      rgbs,
      cropDataUrl: cropCanvas.toDataURL('image/jpeg', 0.82),
    };
  }, []);

  const startCamera = useCallback(
    async (mode: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setCameraError(null);
      setAiStatusMsg(null);
      setUploadedPreviewUrl(null);
      setUploadedBase64(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported in this browser. Upload a cube photo or use a sample scramble below.');
        return;
      }

      setCameraStarting(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);

        // Live 6Hz color sampling preview inside the 3x3 reticle
        sampleTimerRef.current = window.setInterval(() => {
          const result = sampleCurrentVideoFrame();
          if (result) {
            setLivePreview(result.facesGrid);
          }
        }, 170);
      } catch (err: unknown) {
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow camera access, upload a photo, or try a sample scramble below.'
            : 'No live camera detected. You can upload face photos, paint stickers on the 2D net, or try a sample scramble below.';
        setCameraError(msg);
      } finally {
        setCameraStarting(false);
      }
    },
    [facingMode, sampleCurrentVideoFrame, stopCamera]
  );

  const handleToggleFacingMode = () => {
    cubeAudio.playUiTick();
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraActive) {
      void startCamera(next);
    }
  };

  const advanceToNextFace = useCallback(
    (justCaptured: WcaFace, nextCapturedMap: Record<WcaFace, boolean>) => {
      const idx = SCAN_FACE_ORDER.indexOf(justCaptured);
      for (let offset = 1; offset <= SCAN_FACE_ORDER.length; offset++) {
        const candidate = SCAN_FACE_ORDER[(idx + offset) % SCAN_FACE_ORDER.length];
        if (!nextCapturedMap[candidate]) {
          setActiveFace(candidate);
          return;
        }
      }
    },
    []
  );

  const commitCapturedFace = useCallback(
    (targetFace: WcaFace, detectedStickers: WcaFace[], rgbs?: RgbTriplet[]) => {
      const normalized = [...detectedStickers];
      // Lock center sticker to canonical face slot
      normalized[4] = targetFace;

      if (rgbs) {
        setRawRgbs((prevRgbs) => {
          const nextRgbs: ScannedRgbFaces = { ...prevRgbs, [targetFace]: rgbs };
          const sampledFacesCount = SCAN_FACE_ORDER.filter((f) => Boolean(nextRgbs[f])).length;
          setFaces((prevFaces) => {
            const updatedFaces = { ...prevFaces, [targetFace]: normalized };
            // Progressively recalibrate as soon as 2+ centers are scanned (and balance 9/9 once all 6 are captured)
            return sampledFacesCount >= 2
              ? recalibrateScannedFaces(nextRgbs, updatedFaces)
              : updatedFaces;
          });
          return nextRgbs;
        });
      } else {
        setFaces((prev) => ({ ...prev, [targetFace]: normalized }));
      }
      setCapturedFaces((prev) => {
        const nextMap = { ...prev, [targetFace]: true };
        advanceToNextFace(targetFace, nextMap);
        return nextMap;
      });
    },
    [advanceToNextFace]
  );

  const handleCaptureFace = () => {
    const sampled = sampleCurrentVideoFrame();
    if (!sampled) {
      setCameraError('Camera stream is warming up. Wait a moment and tap Capture again.');
      return;
    }
    cubeAudio.playUiTick();
    setAiStatusMsg({
      ok: true,
      text: `Captured ${WCA_FACE_META[activeFace].title} face via real-time CIELAB color sampling.`,
    });
    commitCapturedFace(activeFace, sampled.facesGrid, sampled.rgbs);
  };

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopCamera();
    setCameraError(null);
    setAiStatusMsg(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      setUploadedPreviewUrl(dataUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 384;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const imgData = ctx.getImageData(0, 0, size, size);
        const sampledRgbs = sampleGridFromRgba(imgData.data, size, size, RETICLE_BOX_FRACTION);
        const sampledFaces = sampledRgbs.map((rgb) =>
          classifyRgbToWcaFace(rgb, liveCalibrationRef.current)
        );
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.84);
        setUploadedBase64(compressedBase64);

        cubeAudio.playUiTick();
        commitCapturedFace(activeFace, sampledFaces, sampledRgbs);
        setAiStatusMsg({
          ok: true,
          text: `Sampled ${WCA_FACE_META[activeFace].title} from uploaded photo. Tap any sticker on the net to fine-tune, or run AI Vision Read.`,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleAiVisionScan = async () => {
    if (aiScanning) return;
    let imageDataUrl: string | null = null;
    if (cameraActive) {
      const frame = sampleCurrentVideoFrame();
      imageDataUrl = frame?.cropDataUrl ?? null;
    } else if (uploadedBase64) {
      imageDataUrl = uploadedBase64;
    }

    if (!imageDataUrl) {
      setAiStatusMsg({
        ok: false,
        text: 'Start the camera or upload a photo of the current face before running AI Vision Read.',
      });
      return;
    }

    cubeAudio.playUiTick();
    setAiScanning(true);
    setAiStatusMsg(null);

    try {
      const res = await fetch(buildApiUrl('/api/smart-hint/scan-face'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          mimeType: 'image/jpeg',
          expectedCenter: activeFace,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiStatusMsg({
          ok: false,
          text: data.error || 'AI Vision could not read this face. Use instant capture or tap stickers to edit.',
        });
      } else if (Array.isArray(data.stickers) && data.stickers.length === 9) {
        const stickers = data.stickers as WcaFace[];
        commitCapturedFace(activeFace, stickers);
        setAiStatusMsg({
          ok: true,
          text: `AI Vision read ${WCA_FACE_META[activeFace].title} (${data.confidence ?? 'high'} confidence).`,
        });
      }
    } catch {
      setAiStatusMsg({
        ok: false,
        text: 'Could not reach AI Vision server. Real-time local camera sampling still works offline.',
      });
    } finally {
      setAiScanning(false);
    }
  };

  const handleRecalibrateLighting = () => {
    const sampledCount = Object.keys(rawRgbs).length;
    if (sampledCount === 0) return;
    cubeAudio.playUiTick();
    setFaces((prev) => recalibrateScannedFaces(rawRgbs, prev));
    setAiStatusMsg({
      ok: true,
      text: `Auto-balanced colors using ${sampledCount} scanned center reference${sampledCount === 1 ? '' : 's'}.`,
    });
  };

  const handleApplySamplePreset = (scramble: string, label: string) => {
    cubeAudio.playUiTick();
    const presetFaces = buildScannedFacesFromScramble(scramble);
    setFaces(presetFaces);
    setRawRgbs({});
    setCapturedFaces({ U: true, R: true, F: true, D: true, L: true, B: true });
    setAiStatusMsg({
      ok: true,
      text: `Loaded "${label}" physical state. Tap Analyze & Suggest Best Move to run Kociemba + basic solvers.`,
    });
  };

  const handleResetNet = () => {
    cubeAudio.playUiTick();
    setFaces(createSolvedScannedFaces());
    setRawRgbs({});
    setCapturedFaces({ U: false, R: false, F: false, D: false, L: false, B: false });
    setAiStatusMsg(null);
  };

  const handlePaintSticker = (face: WcaFace, index: number) => {
    if (index === 4) return; // Center stickers are fixed WCA orientation anchors
    cubeAudio.playUiTick();
    setFaces((prev) => {
      const updated = [...prev[face]];
      updated[index] = selectedBrush;
      return { ...prev, [face]: updated };
    });
    setCapturedFaces((prev) => ({ ...prev, [face]: true }));
  };

  // Run both Kociemba Two-Phase Optimal Solver (server) + 4 Local Basic Algorithms (CFOP, Beginner, Roux, ZZ)
  const handleAnalyzeCube = async () => {
    if (!validation.valid || validation.isSolved) return;
    cubeAudio.playUiTick();
    stopCamera();

    const snapshotFaces = cloneScannedFaces(faces);
    setSolutionBaseFaces(snapshotFaces);
    setCurrentStepIdx(0);
    setKociembaError(null);
    setKociembaOption(null);

    // 1. Compute all 4 local algorithms immediately (zero latency!)
    const cubies = scannedFacesToCubieStates(snapshotFaces);
    const localHints = computeBasicAlgorithmHints(cubies);
    setBasicOptions(localHints);
    setSelectedAlgoId('kociemba');
    setActiveView('solution');

    // 2. Request Kociemba Two-Phase Optimal solve from server
    setKociembaLoading(true);
    try {
      const res = await fetch(buildApiUrl('/api/smart-hint/solve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facelets: validation.facelets }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKociembaError(data.error || 'Kociemba solver could not solve this state.');
        // Switch automatically to CFOP if Kociemba failed
        if (localHints.length > 0) setSelectedAlgoId(localHints[0].id);
      } else {
        const moves: string[] = Array.isArray(data.moves) ? data.moves : [];
        setKociembaOption({
          id: 'kociemba',
          name: 'Kociemba Two-Phase',
          shortName: 'Kociemba',
          badge: 'Optimal',
          description: 'Near-optimal shortest path (≤ 20–22 moves HTM)',
          moves,
          moveCount: moves.length,
          nextMove: moves[0] ?? null,
          solveTimeMs: typeof data.solveTimeMs === 'number' ? data.solveTimeMs : undefined,
        });
      }
    } catch {
      setKociembaError('Kociemba server unreachable — showing local CFOP, Beginner, Roux & ZZ solutions.');
      if (localHints.length > 0) setSelectedAlgoId(localHints[0].id);
    } finally {
      setKociembaLoading(false);
    }
  };

  // Build ordered list of all algorithm options (Kociemba first, then CFOP, Beginner, Roux, ZZ)
  const allOptions = useMemo(() => {
    const list: SmartHintOption[] = [];
    if (kociembaOption) list.push(kociembaOption);
    list.push(...basicOptions);
    return list;
  }, [kociembaOption, basicOptions]);

  const activeOption = useMemo(() => {
    return allOptions.find((o) => o.id === selectedAlgoId) ?? allOptions[0] ?? null;
  }, [allOptions, selectedAlgoId]);

  // Compute live 2D faces after applying completed steps [0 .. currentStepIdx - 1]
  const liveSolutionFaces = useMemo(() => {
    if (!activeOption || currentStepIdx <= 0) return solutionBaseFaces;
    let cur = solutionBaseFaces;
    const limit = Math.min(currentStepIdx, activeOption.moves.length);
    for (let i = 0; i < limit; i++) {
      cur = applyNotationToScannedFaces(cur, activeOption.moves[i]);
    }
    return cur;
  }, [activeOption, currentStepIdx, solutionBaseFaces]);

  const remainingMoves = useMemo(() => {
    if (!activeOption) return [];
    return activeOption.moves.slice(currentStepIdx);
  }, [activeOption, currentStepIdx]);

  const currentNextMove = remainingMoves[0] ?? null;
  const currentInstruction = useMemo(
    () => (currentNextMove ? describeMoveInstruction(currentNextMove) : null),
    [currentNextMove]
  );

  const handleSelectAlgorithm = (algoId: SmartHintAlgorithmId) => {
    cubeAudio.playUiTick();
    setSelectedAlgoId(algoId);
    setCurrentStepIdx(0);
  };

  const handleMarkStepDone = () => {
    if (!activeOption || currentStepIdx >= activeOption.moves.length) return;
    cubeAudio.playUiTick();
    setCurrentStepIdx((prev) => prev + 1);
  };

  const handleStepBack = () => {
    if (currentStepIdx <= 0) return;
    cubeAudio.playUiTick();
    setCurrentStepIdx((prev) => Math.max(0, prev - 1));
  };

  const handleSyncToStudioClick = () => {
    if (!activeOption) return;
    cubeAudio.playUiTick();
    stopCamera();
    const cubies = scannedFacesToCubieStates(liveSolutionFaces);
    const label = `Smart Hint · ${activeOption.shortName}`;
    onSyncToStudio(cubies, remainingMoves, label);
  };

  const capturedCount = SCAN_FACE_ORDER.filter((f) => capturedFaces[f]).length;
  const hasRawRgbSamples = Object.keys(rawRgbs).length > 0;
  const activeFaceMeta = WCA_FACE_META[activeFace];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{
        backgroundColor: theme.isDark ? 'rgba(8, 10, 16, 0.78)' : 'rgba(24, 24, 27, 0.48)',
        backdropFilter: 'blur(8px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Smart Hint Physical Cube Scanner"
      data-testid="smart-hint-modal"
    >
      <div
        className="w-full max-w-5xl max-h-[94dvh] rounded-2xl border flex flex-col overflow-hidden animate-kubi-enter"
        style={{
          backgroundColor: theme.ui.surface,
          borderColor: theme.ui.border,
          boxShadow: theme.ui.shadow,
        }}
      >
        {/* Top Modal Header */}
        <div
          className="shrink-0 px-4 sm:px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2.5"
          style={{ borderColor: theme.ui.border, backgroundColor: theme.ui.surfaceSubtle }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: theme.ui.accentSoft, color: theme.ui.accent }}
            >
              <ScanLine className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight truncate" style={{ color: theme.ui.text }}>
                Smart Hint · Physical Cube Scanner
              </h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: theme.ui.muted }}>
                Scan your 3×3 cube via camera for Kociemba Optimal &amp; CFOP / Beginner / Roux / ZZ next moves
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher */}
            <div
              className="flex items-center p-0.5 rounded-xl border"
              style={{ backgroundColor: theme.ui.surface, borderColor: theme.ui.border }}
            >
              <button
                type="button"
                data-testid="smart-hint-tab-scan"
                onClick={() => {
                  cubeAudio.playUiTick();
                  setActiveView('scan');
                }}
                className="h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  backgroundColor: activeView === 'scan' ? theme.ui.accent : 'transparent',
                  color: activeView === 'scan' ? theme.ui.accentFg : theme.ui.muted,
                }}
              >
                1. Scan Cube
              </button>
              <button
                type="button"
                data-testid="smart-hint-tab-solution"
                disabled={allOptions.length === 0 && !kociembaLoading}
                onClick={() => {
                  cubeAudio.playUiTick();
                  setActiveView('solution');
                }}
                className="h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
                style={{
                  backgroundColor: activeView === 'solution' ? theme.ui.accent : 'transparent',
                  color: activeView === 'solution' ? theme.ui.accentFg : theme.ui.muted,
                }}
              >
                2. Smart Hint
              </button>
            </div>

            <button
              type="button"
              data-testid="smart-hint-close-btn"
              onClick={() => {
                cubeAudio.playUiTick();
                stopCamera();
                onClose();
              }}
              aria-label="Close Smart Hint Scanner"
              className="w-8 h-8 rounded-xl border flex items-center justify-center transition-colors cursor-pointer"
              style={{
                backgroundColor: theme.ui.surface,
                borderColor: theme.ui.border,
                color: theme.ui.muted,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto kubi-scroll p-3.5 sm:p-5">
          {activeView === 'scan' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              {/* LEFT: Live Camera Viewfinder + Guided 6-Face Strip + Sample Presets */}
              <div className="lg:col-span-6 flex flex-col gap-3">
                {/* Active Face Scanning Cue */}
                <div
                  className="px-3 py-2 rounded-xl border flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-4 h-4 rounded-md border shrink-0"
                      style={{
                        backgroundColor: activeFaceMeta.hex,
                        borderColor: 'rgba(0,0,0,0.22)',
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight" style={{ color: theme.ui.text }}>
                        Face {activeFaceMeta.title} · {activeFaceMeta.colorName} Center
                      </div>
                      <div className="text-[11px] leading-tight truncate" style={{ color: theme.ui.muted }}>
                        {activeFaceMeta.holdInstruction}
                      </div>
                    </div>
                  </div>
                  <span
                    className="font-mono-tabular text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0"
                    style={{
                      backgroundColor: theme.ui.surface,
                      borderColor: theme.ui.border,
                      color: theme.ui.accent,
                    }}
                  >
                    {capturedCount}/6 scanned
                  </span>
                </div>

                {/* Camera / Photo Viewfinder */}
                <div
                  className="relative w-full aspect-[4/3] rounded-2xl border overflow-hidden flex items-center justify-center"
                  style={{
                    backgroundColor: '#0E1117',
                    borderColor: theme.ui.border,
                  }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                  />

                  {!cameraActive && uploadedPreviewUrl && (
                    <img
                      src={uploadedPreviewUrl}
                      alt="Uploaded cube face preview"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {!cameraActive && !uploadedPreviewUrl && (
                    <div className="flex flex-col items-center justify-center text-center px-6 py-4 gap-2.5 z-10">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center border"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          borderColor: 'rgba(255,255,255,0.14)',
                          color: '#FFFFFF',
                        }}
                      >
                        <Camera className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Point Camera at Your 3×3 Cube</p>
                        <p className="text-xs text-zinc-400 mt-0.5 max-w-xs">
                          Align each face inside the 3×3 reticle to capture all 6 sides, or upload face photos.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                        <button
                          type="button"
                          data-testid="smart-hint-start-camera-btn"
                          disabled={cameraStarting}
                          onClick={() => void startCamera(facingMode)}
                          className="h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          style={{
                            backgroundColor: theme.ui.accent,
                            color: theme.ui.accentFg,
                          }}
                        >
                          {cameraStarting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Camera className="w-3.5 h-3.5" />
                          )}
                          <span>{cameraStarting ? 'Starting…' : 'Start Camera'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => uploadInputRef.current?.click()}
                          className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 cursor-pointer text-white bg-white/10 border-white/20 hover:bg-white/15"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Photo</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3x3 Reticle Alignment Overlay (active during live camera or uploaded photo) */}
                  {(cameraActive || uploadedPreviewUrl) && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div
                        className="aspect-square grid grid-cols-3 grid-rows-3 gap-1.5 p-1.5 rounded-xl border-2"
                        style={{
                          height: `${Math.round(RETICLE_BOX_FRACTION * 100)}%`,
                          borderColor: 'rgba(255,255,255,0.88)',
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.36)',
                        }}
                      >
                        {Array.from({ length: 9 }).map((_, idx) => {
                          const detected = idx === 4 ? activeFace : livePreview?.[idx] ?? faces[activeFace][idx];
                          const swatch = WCA_FACE_META[detected];
                          return (
                            <div
                              key={idx}
                              className="rounded-lg border flex items-center justify-center relative"
                              style={{
                                borderColor:
                                  idx === 4 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                                backgroundColor: 'rgba(0,0,0,0.12)',
                              }}
                            >
                              <span
                                className="w-5 h-5 rounded-full border-2 shadow-sm flex items-center justify-center text-[9px] font-bold"
                                style={{
                                  backgroundColor: swatch.hex,
                                  borderColor: '#FFFFFF',
                                  color: detected === 'U' || detected === 'D' ? '#111827' : '#FFFFFF',
                                }}
                              >
                                {detected}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top-Right Camera Flip Control */}
                  {cameraActive && (
                    <button
                      type="button"
                      onClick={handleToggleFacingMode}
                      aria-label="Switch front or rear camera"
                      title="Switch camera"
                      className="absolute top-2.5 right-2.5 h-8 px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer bg-black/65 text-white border border-white/20 hover:bg-black/80"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>Flip</span>
                    </button>
                  )}
                </div>

                {/* Hidden Photo File Input */}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUploadPhoto}
                  className="hidden"
                />

                {/* Camera & Capture Action Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {cameraActive ? (
                    <>
                      <button
                        type="button"
                        data-testid="smart-hint-capture-btn"
                        onClick={handleCaptureFace}
                        className="h-9 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer flex-1 justify-center"
                        style={{
                          backgroundColor: theme.ui.accent,
                          color: theme.ui.accentFg,
                        }}
                      >
                        <ScanLine className="w-3.5 h-3.5" />
                        <span>Capture {activeFaceMeta.title}</span>
                      </button>

                      <button
                        type="button"
                        data-testid="smart-hint-ai-scan-btn"
                        disabled={aiScanning}
                        onClick={() => void handleAiVisionScan()}
                        title="Use Gemini Vision for glare or tough lighting"
                        className="h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        style={{
                          backgroundColor: theme.ui.accentSoft,
                          borderColor: theme.ui.accent,
                          color: theme.ui.accent,
                        }}
                      >
                        {aiScanning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>{aiScanning ? 'Reading…' : 'AI Vision Read'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={stopCamera}
                        aria-label="Stop camera"
                        title="Stop camera"
                        className="h-9 w-9 rounded-xl border flex items-center justify-center cursor-pointer shrink-0"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.muted,
                        }}
                      >
                        <CameraOff className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void startCamera(facingMode)}
                        className="h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        <Camera className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
                        <span>Live Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="h-9 px-3 rounded-xl text-xs font-medium border flex items-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Face Photo</span>
                      </button>

                      {uploadedBase64 && (
                        <button
                          type="button"
                          data-testid="smart-hint-ai-scan-btn"
                          disabled={aiScanning}
                          onClick={() => void handleAiVisionScan()}
                          className="h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          style={{
                            backgroundColor: theme.ui.accentSoft,
                            borderColor: theme.ui.accent,
                            color: theme.ui.accent,
                          }}
                        >
                          {aiScanning ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          <span>AI Vision Read</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Camera / AI Status Banner */}
                {(cameraError || aiStatusMsg) && (
                  <div
                    className="px-3 py-2 rounded-xl border text-xs flex items-start gap-2"
                    style={{
                      backgroundColor: cameraError || (aiStatusMsg && !aiStatusMsg.ok)
                        ? theme.isDark
                          ? 'rgba(239, 68, 68, 0.14)'
                          : '#FEF2F2'
                        : theme.isDark
                          ? 'rgba(34, 197, 94, 0.14)'
                          : '#F0FDF4',
                      borderColor: cameraError || (aiStatusMsg && !aiStatusMsg.ok)
                        ? 'rgba(220, 38, 38, 0.38)'
                        : 'rgba(22, 163, 74, 0.38)',
                      color: cameraError || (aiStatusMsg && !aiStatusMsg.ok)
                        ? theme.isDark
                          ? '#FCA5A5'
                          : '#B91C1C'
                        : theme.isDark
                          ? '#86EFAC'
                          : '#15803D',
                    }}
                  >
                    {cameraError || (aiStatusMsg && !aiStatusMsg.ok) ? (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{cameraError || aiStatusMsg?.text}</span>
                  </div>
                )}

                {/* Guided 6-Face Selector */}
                <div className="grid grid-cols-6 gap-1.5">
                  {SCAN_FACE_ORDER.map((face) => {
                    const meta = WCA_FACE_META[face];
                    const isSelected = activeFace === face;
                    const isCaptured = capturedFaces[face];
                    return (
                      <button
                        key={face}
                        type="button"
                        data-testid={`smart-hint-face-btn-${face}`}
                        onClick={() => {
                          cubeAudio.playUiTick();
                          setActiveFace(face);
                        }}
                        className="py-1.5 px-1 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer relative"
                        style={{
                          backgroundColor: isSelected ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                          borderColor: isSelected ? theme.ui.accent : theme.ui.border,
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-md border"
                          style={{
                            backgroundColor: meta.hex,
                            borderColor: 'rgba(0,0,0,0.22)',
                          }}
                        />
                        <span
                          className="font-mono-tabular text-[11px] font-bold"
                          style={{ color: isSelected ? theme.ui.accent : theme.ui.text }}
                        >
                          {face}
                        </span>
                        {isCaptured && (
                          <span
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: '#16A34A', color: '#FFFFFF' }}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Quick Sample Physical Scrambles (test immediately without a physical cube) */}
                <div
                  className="px-3 py-2.5 rounded-xl border flex flex-col gap-1.5"
                  style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold" style={{ color: theme.ui.text }}>
                      No physical cube nearby? Load a sample scan:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_SCAN_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`smart-hint-preset-${preset.id}`}
                        onClick={() => handleApplySamplePreset(preset.scramble, preset.label)}
                        className="h-7 px-2.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surface,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Interactive 2D Cube Net + Tap-to-Correct Color Brush + Validation + Solve CTA */}
              <div className="lg:col-span-6 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.ui.text }}>
                      Scanned 2D Cube Net · Tap Any Sticker to Edit
                    </h3>
                    <p className="text-[11px]" style={{ color: theme.ui.muted }}>
                      Pick a color swatch below, then tap any outer sticker to correct glare misreads.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {hasRawRgbSamples && (
                      <button
                        type="button"
                        onClick={handleRecalibrateLighting}
                        title="Auto-balance colors using scanned centers"
                        className="h-7 px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.surfaceSubtle,
                          borderColor: theme.ui.border,
                          color: theme.ui.text,
                        }}
                      >
                        <Wand2 className="w-3 h-3" style={{ color: theme.ui.accent }} />
                        <span>Auto-Balance</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleResetNet}
                      title="Reset cube net to solved"
                      className="h-7 px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: theme.ui.surfaceSubtle,
                        borderColor: theme.ui.border,
                        color: theme.ui.muted,
                      }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Color Brush Selector with Live 9/9 Counts */}
                <div className="grid grid-cols-6 gap-1.5">
                  {SCAN_FACE_ORDER.map((colorFace) => {
                    const meta = WCA_FACE_META[colorFace];
                    const count = validation.counts[colorFace];
                    const countOk = count === 9;
                    const active = selectedBrush === colorFace;
                    return (
                      <button
                        key={colorFace}
                        type="button"
                        data-testid={`smart-hint-brush-${colorFace}`}
                        onClick={() => {
                          cubeAudio.playUiTick();
                          setSelectedBrush(colorFace);
                        }}
                        className="p-1.5 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all"
                        style={{
                          backgroundColor: active ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                          borderColor: active ? theme.ui.accent : theme.ui.border,
                        }}
                      >
                        <span
                          className="w-5 h-5 rounded-md border shadow-xs"
                          style={{
                            backgroundColor: meta.hex,
                            borderColor: 'rgba(0,0,0,0.24)',
                          }}
                        />
                        <span
                          className="font-mono-tabular text-[10px] font-semibold"
                          style={{
                            color: countOk
                              ? theme.isDark
                                ? '#86EFAC'
                                : '#15803D'
                              : '#DC2626',
                          }}
                        >
                          {count}/9
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Unfolded 2D 3x3 Cross Net */}
                <div
                  className="p-3 sm:p-4 rounded-2xl border flex items-center justify-center"
                  style={{
                    backgroundColor: theme.ui.surfaceSubtle,
                    borderColor: theme.ui.border,
                  }}
                >
                  <div className="grid grid-cols-4 grid-rows-3 gap-2 sm:gap-2.5 w-full max-w-[360px]">
                    {NET_SLOTS.map(({ face, gridCol, gridRow }) => {
                      const isFaceActive = activeFace === face;
                      return (
                        <div
                          key={face}
                          style={{ gridColumn: gridCol, gridRow }}
                          onClick={() => setActiveFace(face)}
                          className="p-1 rounded-xl border transition-all"
                          data-testid={`smart-hint-net-face-${face}`}
                        >
                          <div
                            className="grid grid-cols-3 gap-1 p-1 rounded-lg"
                            style={{
                              backgroundColor: theme.isDark ? '#181B22' : '#E5E7EB',
                              outline: isFaceActive ? `2px solid ${theme.ui.accent}` : 'none',
                            }}
                          >
                            {faces[face].map((stickerColor, idx) => {
                              const swatch = WCA_FACE_META[stickerColor];
                              const isCenter = idx === 4;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  disabled={isCenter}
                                  aria-label={`${WCA_FACE_META[face].title} sticker ${idx + 1}: ${swatch.colorName}`}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    handlePaintSticker(face, idx);
                                  }}
                                  className="aspect-square rounded-[4px] border flex items-center justify-center transition-transform active:scale-90 cursor-pointer disabled:cursor-default"
                                  style={{
                                    backgroundColor: swatch.hex,
                                    borderColor: 'rgba(0,0,0,0.22)',
                                  }}
                                >
                                  {isCenter && (
                                    <span
                                      className="text-[9px] font-bold leading-none select-none"
                                      style={{
                                        color:
                                          face === 'U' || face === 'D'
                                            ? 'rgba(17,24,39,0.72)'
                                            : 'rgba(255,255,255,0.88)',
                                      }}
                                    >
                                      {face}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Real-Time Solvability Validation Banner */}
                <div
                  data-testid="smart-hint-validation"
                  className="px-3.5 py-2.5 rounded-xl border text-xs flex items-start gap-2"
                  style={{
                    backgroundColor: !validation.valid
                      ? theme.isDark
                        ? 'rgba(239, 68, 68, 0.14)'
                        : '#FEF2F2'
                      : validation.isSolved
                        ? theme.ui.surfaceSubtle
                        : theme.isDark
                          ? 'rgba(34, 197, 94, 0.14)'
                          : '#F0FDF4',
                    borderColor: !validation.valid
                      ? 'rgba(220, 38, 38, 0.42)'
                      : validation.isSolved
                        ? theme.ui.border
                        : 'rgba(22, 163, 74, 0.42)',
                    color: !validation.valid
                      ? theme.isDark
                        ? '#FCA5A5'
                        : '#B91C1C'
                      : validation.isSolved
                        ? theme.ui.muted
                        : theme.isDark
                          ? '#86EFAC'
                          : '#15803D',
                  }}
                >
                  {!validation.valid ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    {!validation.valid ? (
                      <span>{validation.error}</span>
                    ) : validation.isSolved ? (
                      <span>Cube is currently in the solved state. Scan your scrambled physical cube or load a sample scan to get Smart Hints.</span>
                    ) : (
                      <span className="font-medium">
                        Valid solvable 3×3 state verified (all 8 corners, 12 edges &amp; parity checks passed). Ready for Kociemba Optimal + Multi-Algorithm analysis!
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Analyze CTA */}
                <button
                  type="button"
                  data-testid="smart-hint-solve-btn"
                  disabled={!validation.valid || validation.isSolved}
                  onClick={() => void handleAnalyzeCube()}
                  className="h-11 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed mt-auto"
                  style={{
                    backgroundColor: theme.ui.accent,
                    color: theme.ui.accentFg,
                  }}
                >
                  <Compass className="w-4 h-4" />
                  <span>Analyze &amp; Suggest Best Move</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* VIEW 2: SMART HINT MULTI-ALGORITHM NEXT-MOVE ADVISOR */
            <div className="flex flex-col gap-4">
              {/* Hero Next-Move Card */}
              <div
                data-testid="smart-hint-next-move-card"
                className="p-4 sm:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
                style={{
                  backgroundColor: theme.ui.surfaceSubtle,
                  borderColor: theme.ui.accent,
                }}
              >
                {kociembaLoading && !activeOption ? (
                  <div className="flex items-center gap-3 py-4">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.ui.accent }} />
                    <div>
                      <div className="text-sm font-bold" style={{ color: theme.ui.text }}>
                        Computing Kociemba Two-Phase Optimal Solution…
                      </div>
                      <div className="text-xs" style={{ color: theme.ui.muted }}>
                        Searching pruning tables for the shortest possible next move.
                      </div>
                    </div>
                  </div>
                ) : currentInstruction && activeOption ? (
                  <>
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Giant WCA Next Move Tile */}
                      <div
                        className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-sm"
                        style={{
                          backgroundColor: currentInstruction.colorHex,
                          borderColor: 'rgba(0,0,0,0.22)',
                          color:
                            currentInstruction.face === 'U' || currentInstruction.face === 'D'
                              ? '#111827'
                              : '#FFFFFF',
                        }}
                      >
                        <span
                          data-testid="smart-hint-hero-notation"
                          className="font-mono-tabular text-3xl sm:text-4xl font-black leading-none"
                        >
                          {currentInstruction.notation}
                        </span>
                        <span className="mt-1 opacity-85">
                          {currentInstruction.direction === 'double' ? (
                            <RefreshCw className="w-4 h-4" />
                          ) : currentInstruction.direction === 'ccw' ? (
                            <RotateCcw className="w-4 h-4" />
                          ) : (
                            <RotateCw className="w-4 h-4" />
                          )}
                        </span>
                      </div>

                      <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                            style={{
                              backgroundColor: theme.ui.accent,
                              color: theme.ui.accentFg,
                            }}
                          >
                            {activeOption.name} · {activeOption.badge}
                          </span>
                          {activeOption.stageLabel && (
                            <span
                              className="text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                              style={{
                                backgroundColor: theme.ui.surface,
                                borderColor: theme.ui.border,
                                color: theme.ui.muted,
                              }}
                            >
                              Stage: {activeOption.stageLabel}
                            </span>
                          )}
                          {typeof activeOption.solveTimeMs === 'number' && (
                            <span
                              className="font-mono-tabular text-[11px] font-medium"
                              style={{ color: theme.ui.muted }}
                            >
                              {activeOption.solveTimeMs} ms
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-bold leading-snug" style={{ color: theme.ui.text }}>
                          {currentInstruction.summary}
                        </h3>

                        <p className="text-xs font-medium" style={{ color: theme.ui.muted }}>
                          Move <strong style={{ color: theme.ui.text }}>{currentStepIdx + 1}</strong> of{' '}
                          <strong style={{ color: theme.ui.text }}>{activeOption.moveCount}</strong> ·{' '}
                          {remainingMoves.length} {remainingMoves.length === 1 ? 'move' : 'moves'} remaining to solve
                        </p>
                      </div>
                    </div>

                    {/* Step-Through & 3D Sync Actions */}
                    <div className="flex flex-wrap md:flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid="smart-hint-step-next-btn"
                        onClick={handleMarkStepDone}
                        className="h-10 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: theme.ui.accent,
                          color: theme.ui.accentFg,
                        }}
                      >
                        <Check className="w-4 h-4" />
                        <span>Mark Move Done → Next</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid="smart-hint-sync-3d-btn"
                          onClick={handleSyncToStudioClick}
                          className="h-9 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer flex-1"
                          style={{
                            backgroundColor: theme.ui.surface,
                            borderColor: theme.ui.border,
                            color: theme.ui.text,
                          }}
                        >
                          <Box className="w-3.5 h-3.5" style={{ color: theme.ui.accent }} />
                          <span>Sync to 3D Studio</span>
                        </button>

                        {currentStepIdx > 0 && (
                          <button
                            type="button"
                            onClick={handleStepBack}
                            aria-label="Previous step"
                            title="Undo last step"
                            className="h-9 w-9 rounded-xl border flex items-center justify-center cursor-pointer"
                            style={{
                              backgroundColor: theme.ui.surface,
                              borderColor: theme.ui.border,
                              color: theme.ui.muted,
                            }}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full py-2">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(22, 163, 74, 0.16)', color: '#16A34A' }}
                      >
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold" style={{ color: theme.ui.text }}>
                          Physical Cube Solved!
                        </h3>
                        <p className="text-xs" style={{ color: theme.ui.muted }}>
                          You completed every suggested move in {activeOption?.name ?? 'Smart Hint'}.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        cubeAudio.playUiTick();
                        setActiveView('scan');
                      }}
                      className="h-9 px-3.5 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: theme.ui.accent,
                        color: theme.ui.accentFg,
                      }}
                    >
                      Scan Another Cube
                    </button>
                  </div>
                )}
              </div>

              {/* Algorithm Comparison Switcher (Kociemba Two-Phase + CFOP + Beginner + Roux + ZZ) */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.ui.text }}>
                    Compare Solving Algorithms (Shortest vs. Human-Friendly)
                  </h4>
                  {kociembaError && (
                    <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      {kociembaError}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {/* Kociemba Loading Placeholder Card */}
                  {kociembaLoading && !kociembaOption && (
                    <div
                      className="p-2.5 rounded-xl border flex flex-col justify-between gap-2"
                      style={{
                        backgroundColor: theme.ui.accentSoft,
                        borderColor: theme.ui.accent,
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold" style={{ color: theme.ui.accent }}>
                          Kociemba
                        </span>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: theme.ui.accent }} />
                      </div>
                      <div className="text-[11px]" style={{ color: theme.ui.muted }}>
                        Finding optimal path…
                      </div>
                    </div>
                  )}

                  {allOptions.map((opt) => {
                    const isSelected = activeOption?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`smart-hint-algo-${opt.id}`}
                        onClick={() => handleSelectAlgorithm(opt.id)}
                        className="p-2.5 rounded-xl border text-left flex flex-col justify-between gap-1.5 transition-all cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? theme.ui.accentSoft : theme.ui.surfaceSubtle,
                          borderColor: isSelected ? theme.ui.accent : theme.ui.border,
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-xs font-bold truncate"
                            style={{ color: isSelected ? theme.ui.accent : theme.ui.text }}
                          >
                            {opt.shortName}
                          </span>
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                            style={{
                              backgroundColor: isSelected ? theme.ui.accent : theme.ui.surface,
                              color: isSelected ? theme.ui.accentFg : theme.ui.muted,
                            }}
                          >
                            {opt.badge}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-1">
                          <span
                            className="font-mono-tabular text-sm font-black"
                            style={{ color: theme.ui.text }}
                          >
                            {opt.moveCount} <span className="text-[10px] font-medium opacity-75">moves</span>
                          </span>
                          {opt.nextMove && (
                            <span
                              className="font-mono-tabular text-[11px] font-bold"
                              style={{ color: theme.ui.accent }}
                            >
                              Next: {opt.nextMove}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] leading-tight line-clamp-1" style={{ color: theme.ui.muted }}>
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Row: Full Move Sequence + Compact Live 2D Net State */}
              {activeOption && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Full Move Sequence */}
                  <div
                    className="lg:col-span-8 p-3.5 rounded-2xl border flex flex-col gap-2"
                    style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold" style={{ color: theme.ui.text }}>
                        Full {activeOption.name} Sequence ({activeOption.moveCount} moves)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          cubeAudio.playUiTick();
                          setActiveView('scan');
                        }}
                        className="text-[11px] font-semibold cursor-pointer"
                        style={{ color: theme.ui.accent }}
                      >
                        ← Edit / Rescan Cube
                      </button>
                    </div>
                    <div
                      data-testid="smart-hint-move-sequence"
                      className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto kubi-scroll pr-1"
                    >
                      {activeOption.moves.map((mv, idx) => {
                        const isDone = idx < currentStepIdx;
                        const isCurrent = idx === currentStepIdx;
                        return (
                          <button
                            key={`${mv}-${idx}`}
                            type="button"
                            onClick={() => {
                              cubeAudio.playUiTick();
                              setCurrentStepIdx(idx);
                            }}
                            className="font-mono-tabular text-xs font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 cursor-pointer transition-colors"
                            style={{
                              backgroundColor: isCurrent
                                ? theme.ui.accent
                                : isDone
                                  ? theme.isDark
                                    ? 'rgba(34, 197, 94, 0.2)'
                                    : '#DCFCE7'
                                  : theme.ui.surface,
                              borderColor: isCurrent
                                ? theme.ui.accent
                                : isDone
                                  ? '#16A34A'
                                  : theme.ui.border,
                              color: isCurrent
                                ? theme.ui.accentFg
                                : isDone
                                  ? theme.isDark
                                    ? '#86EFAC'
                                    : '#15803D'
                                  : theme.ui.text,
                            }}
                          >
                            {isDone && <Check className="w-3 h-3" />}
                            <span>{mv}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live Miniature 2D Cube State Preview */}
                  <div
                    className="lg:col-span-4 p-3 rounded-2xl border flex flex-col items-center justify-center gap-2"
                    style={{ backgroundColor: theme.ui.surfaceSubtle, borderColor: theme.ui.border }}
                  >
                    <span className="text-[11px] font-semibold" style={{ color: theme.ui.muted }}>
                      Live Cube State (After Step {currentStepIdx})
                    </span>
                    <div className="grid grid-cols-4 grid-rows-3 gap-1 w-full max-w-[200px]">
                      {NET_SLOTS.map(({ face, gridCol, gridRow }) => (
                        <div
                          key={face}
                          style={{ gridColumn: gridCol, gridRow }}
                          className="grid grid-cols-3 gap-0.5 p-0.5 rounded bg-black/15"
                        >
                          {liveSolutionFaces[face].map((c, idx) => (
                            <span
                              key={idx}
                              className="aspect-square rounded-[2px]"
                              style={{ backgroundColor: WCA_FACE_META[c].hex }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
