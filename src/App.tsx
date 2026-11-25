import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { ArenaModal } from './components/ArenaModal';
import { BottomDock } from './components/BottomDock';
import { CompactNotationBar } from './components/CompactNotationBar';
import { PauseModal, VictoryModal } from './components/Modals';
import { PaletteStudioModal } from './components/PaletteStudioModal';
import { ShortcutsHelpOverlay } from './components/ShortcutsHelpOverlay';
import { TimerDashboardModal, type TimerDashboardTab } from './components/TimerDashboardModal';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { cubeAudio, loadAmbientPrefs, saveAmbientPrefs } from './cube/audio';
import { buildApiUrl } from './cube/backendConfig';
import {
  computeSolutionFromHistory,
  generateScramble,
  invertMove,
  parseAlgorithm,
  parseNotation,
  simplifyMoves,
} from './cube/cubeLogic';
import { CURRICULUM } from './cube/curriculum';
import {
  createBackupPayload,
  getBackupFilename,
  mergeBackupData,
  parseBackupJson,
  serializeBackupJson,
  triggerJsonDownload,
  type BackupImportMode,
} from './cube/backup';
import {
  loadCustomThemes,
  resolveThemePalette,
  saveCustomThemes,
  type CustomThemeRecord,
} from './cube/customThemes';
import {
  getOrCreateClientId,
  loadPlayerName,
  loadStudioPref,
  readCookie,
  saveStudioPref,
  upsertLocalDailyEntry,
  writeCookie,
  type DailyChallengeResponse,
} from './cube/dailyChallenge';
import {
  advanceSequenceStep,
  clearSequenceWrongState,
  completeSequenceAll,
  createSequenceTracker,
  evaluateSequenceMove,
  getNextExpectedToken,
  parseNotationSequenceInput,
  type SequenceTrackerState,
} from './cube/sequenceTracker';
import {
  SOLVE_METHODS,
  solveCubeWithMethod,
  type MethodSolvePlan,
} from './cube/methodSolver';
import type { StickerPatternId } from './cube/patternTemplates';
import { buildInternalViewHref, parseInitialSeoRoute, syncDocumentSeo, type SeoViewId } from './cube/seo';
import { buildSnapshotFilename, triggerPngDownload } from './cube/snapshot';
import { ThreeCubeEngine } from './cube/ThreeCubeEngine';
import {
  createSeedRecords,
  loadSolveRecords,
  saveSolveRecords,
  type SolvePenalty,
  type SolveRecord,
} from './cube/timerStats';
import type {
  AmbientSoundscapeId,
  CubeMove,
  DockTab,
  GameState,
  LessonStep,
  PuzzleType,
  SolveMethodId,
  SolveSnapshot,
  ThemePalette,
} from './cube/types';

function readBestTime(puzzle: PuzzleType): number | null {
  try {
    const raw = localStorage.getItem(`kubi_best_${puzzle}`) ?? readCookie(`kubi_best_${puzzle}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    const raw = readCookie(`kubi_best_${puzzle}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}

function writeBestTime(puzzle: PuzzleType, ms: number) {
  const val = String(Math.round(ms));
  try {
    localStorage.setItem(`kubi_best_${puzzle}`, val);
  } catch {
    // ignore storage restrictions
  }
  writeCookie(`kubi_best_${puzzle}`, val);
}

const VALID_PUZZLES_SET = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);
const VALID_METHODS_SET = new Set<SolveMethodId>(['beginner', 'cfop', 'roux', 'zz']);

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ThreeCubeEngine | null>(null);

  const [initialSeoRoute] = useState(() =>
    typeof window !== 'undefined'
      ? parseInitialSeoRoute(window.location.search)
      : { view: 'home' as SeoViewId, autoStart: false }
  );

  // Core UI state (restored from URL deep-link, localStorage + cookies)
  const [gameState, setGameState] = useState<GameState>(() =>
    initialSeoRoute.autoStart ? 'playing' : 'title'
  );
  const [puzzleType, setPuzzleType] = useState<PuzzleType>(() => {
    if (initialSeoRoute.puzzle && VALID_PUZZLES_SET.has(initialSeoRoute.puzzle)) {
      return initialSeoRoute.puzzle;
    }
    const saved = loadStudioPref('puzzle') as PuzzleType | null;
    return saved && VALID_PUZZLES_SET.has(saved) ? saved : '3x3';
  });
  const [customThemes, setCustomThemes] = useState<CustomThemeRecord[]>(() => loadCustomThemes());
  const [themeKey, setThemeKey] = useState<string>(() => loadStudioPref('theme') || 'atelier');
  const [previewPalette, setPreviewPalette] = useState<ThemePalette | null>(null);
  const [paletteStudioOpen, setPaletteStudioOpen] = useState(false);

  // Ambient Focus Soundscapes (persisted to localStorage + cookies)
  const [initialAmbient] = useState(() => loadAmbientPrefs());
  const [soundscape, setSoundscape] = useState<AmbientSoundscapeId>(initialAmbient.soundscape);
  const [ambientVolume, setAmbientVolume] = useState<number>(initialAmbient.volume);

  const [activeTab, setActiveTab] = useState<DockTab>(() =>
    initialSeoRoute.view === 'tutorials' ? 'learn' : 'play'
  );
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [turnSpeed, setTurnSpeed] = useState(1.1);
  const [activePatternId, setActivePatternId] = useState<StickerPatternId>('solved');

  // Gameplay & Solve tracking
  const [moveCount, setMoveCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isSolved, setIsSolved] = useState(true);
  const [hasScrambled, setHasScrambled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [hintMove, setHintMove] = useState<CubeMove | null>(null);
  const [recentNotations, setRecentNotations] = useState<string[]>([]);
  const [victorySnapshot, setVictorySnapshot] = useState<SolveSnapshot | null>(null);
  const [snapshotToast, setSnapshotToast] = useState<{ ok: boolean; message: string } | null>(null);
  const snapshotToastTimerRef = useRef<number | null>(null);

  // Built-in Stopwatch, Timing Analytics & 1v1 Live Arena state
  const [timerModalTab, setTimerModalTab] = useState<TimerDashboardTab | null>(() => {
    if (initialSeoRoute.view === 'timer') return 'stopwatch';
    if (initialSeoRoute.view === 'daily') return 'daily';
    return null;
  });
  const [arenaOpen, setArenaOpen] = useState<boolean>(
    () => initialSeoRoute.view === 'arena' || Boolean(initialSeoRoute.roomCode)
  );
  const [arenaInviteRoomCode, setArenaInviteRoomCode] = useState<string | null>(
    () => initialSeoRoute.roomCode ?? null
  );
  const [solveRecords, setSolveRecords] = useState<SolveRecord[]>(() => loadSolveRecords());
  const [activeDailyDateKey, setActiveDailyDateKey] = useState<string | null>(null);

  // Curriculum Lesson, Multi-Method Solver & Play Sequence Trackers
  const [selectedMethod, setSelectedMethod] = useState<SolveMethodId>(() => {
    const saved = loadStudioPref('method') as SolveMethodId | null;
    return saved && VALID_METHODS_SET.has(saved) ? saved : 'cfop';
  });
  const [activeMethodPlan, setActiveMethodPlan] = useState<MethodSolvePlan | null>(null);
  const [isAutoSolving, setIsAutoSolving] = useState(false);

  const [activeLessonId, setActiveLessonId] = useState<string>(CURRICULUM['3x3'][0].id);
  const [lessonTracker, setLessonTracker] = useState<SequenceTrackerState>(() =>
    createSequenceTracker(CURRICULUM['3x3'][0].algorithm)
  );
  const [playTracker, setPlayTracker] = useState<SequenceTrackerState>(() =>
    createSequenceTracker([])
  );
  const [playTrackerLabel, setPlayTrackerLabel] = useState<string>('Sequence');
  const [hasLastScramble, setHasLastScramble] = useState(false);

  // Mutable refs for 60Hz engine callbacks (never tear down WebGL!)
  const historyRef = useRef<CubeMove[]>([]);
  const currentScrambleRef = useRef<string>('');
  const lastScrambleTokensRef = useRef<string[]>([]);
  const selectedMethodRef = useRef<SolveMethodId>(selectedMethod);
  const activeMethodPlanRef = useRef<MethodSolvePlan | null>(activeMethodPlan);
  const lessonTrackerRef = useRef<SequenceTrackerState>(lessonTracker);
  const playTrackerRef = useRef<SequenceTrackerState>(playTracker);
  const playTrackerLabelRef = useRef<string>(playTrackerLabel);
  const isUndoingWrongRef = useRef<boolean>(false);
  const isSteppingMethodRef = useRef<boolean>(false);
  const activeDailyRef = useRef<{ dateKey: string; puzzleType: PuzzleType; scramble: string } | null>(null);
  const timerModalOpenRef = useRef<boolean>(false);
  const arenaOpenRef = useRef<boolean>(false);
  const paletteStudioOpenRef = useRef<boolean>(false);
  const shortcutsOpenRef = useRef<boolean>(false);
  const puzzleRef = useRef<PuzzleType>(puzzleType);
  const gameStateRef = useRef<GameState>(gameState);
  const hasScrambledRef = useRef(false);
  const timerRunningRef = useRef(false);
  const timerStartRef = useRef(0);
  const elapsedAccumRef = useRef(0);
  const moveCountRef = useRef(0);
  const isScramblingRef = useRef(false);
  const isAutoSolvingRef = useRef(false);
  const activeTabRef = useRef<DockTab>(activeTab);

  puzzleRef.current = puzzleType;
  gameStateRef.current = gameState;
  activeTabRef.current = activeTab;
  selectedMethodRef.current = selectedMethod;
  activeMethodPlanRef.current = activeMethodPlan;
  playTrackerLabelRef.current = playTrackerLabel;
  timerModalOpenRef.current = timerModalTab !== null;
  arenaOpenRef.current = arenaOpen;
  paletteStudioOpenRef.current = paletteStudioOpen;
  shortcutsOpenRef.current = shortcutsOpen;

  useEffect(() => {
    saveSolveRecords(solveRecords);
  }, [solveRecords]);

  const savedTheme = useMemo(
    () => resolveThemePalette(themeKey, customThemes),
    [themeKey, customThemes]
  );
  const theme = previewPalette ?? savedTheme;

  // Sync CSS theme variables, body state, and dynamic SEO title/meta/canonical
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    let activeSeoView: SeoViewId = 'home';
    if (arenaOpen) {
      activeSeoView = 'arena';
    } else if (timerModalTab === 'daily') {
      activeSeoView = 'daily';
    } else if (timerModalTab === 'stopwatch' || timerModalTab === 'analytics') {
      activeSeoView = 'timer';
    } else if (gameState !== 'title') {
      activeSeoView = activeTab === 'learn' ? 'tutorials' : 'solver';
    }
    syncDocumentSeo(activeSeoView);
  }, [gameState, activeTab, timerModalTab, arenaOpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--kubi-bg', theme.ui.bg);
    root.style.setProperty('--kubi-surface', theme.ui.surface);
    root.style.setProperty('--kubi-surface-subtle', theme.ui.surfaceSubtle);
    root.style.setProperty('--kubi-border', theme.ui.border);
    root.style.setProperty('--kubi-text', theme.ui.text);
    root.style.setProperty('--kubi-muted', theme.ui.muted);
    root.style.setProperty('--kubi-accent', theme.ui.accent);
    root.style.setProperty('--kubi-accent-fg', theme.ui.accentFg);
    engineRef.current?.applyTheme(theme);
  }, [theme]);

  // Arm restored ambient soundscape smoothly after first user interaction (browser autoplay-safe)
  useEffect(() => {
    cubeAudio.setAmbientVolume(ambientVolume);
    if (soundscape === 'off') return;
    if (cubeAudio.getSoundscape() === soundscape) return;

    const unlock = () => {
      cubeAudio.setAmbientVolume(ambientVolume);
      cubeAudio.setSoundscape(soundscape);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ambientVolume, soundscape]);

  // Smooth solve timer tick (10Hz throttled React update while actively solving)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (timerRunningRef.current && gameStateRef.current === 'playing') {
        const total = elapsedAccumRef.current + (performance.now() - timerStartRef.current);
        setElapsedMs(total);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // Mount Three.js engine ONCE in isolated ref container
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new ThreeCubeEngine(
      mount,
      {
        onMoveApplied: (move, solvedNow, isFromQueue) => {
          // Track full move history for guaranteed accurate Undo & Hint/Auto-Solve
          const nextHistory = simplifyMoves([...historyRef.current, move], puzzleRef.current);
          historyRef.current = nextHistory;
          setRecentNotations(nextHistory.slice(-24).map((m) => m.notation));

          if (!isScramblingRef.current) {
            if (!isFromQueue || isAutoSolvingRef.current) {
              moveCountRef.current += 1;
              setMoveCount(moveCountRef.current);
            }
            if (hasScrambledRef.current && !timerRunningRef.current && !solvedNow) {
              timerRunningRef.current = true;
              timerStartRef.current = performance.now();
            }
          }

          setIsSolved(solvedNow);

          // Live sequence & method-flow tracking in Learn, Play & Solve, and Auto-Solve!
          let handledGuideArrow = false;
          if (
            !isScramblingRef.current &&
            (isAutoSolvingRef.current ||
              isSteppingMethodRef.current ||
              (isFromQueue && activeTabRef.current === 'play' && activeMethodPlanRef.current !== null))
          ) {
            isSteppingMethodRef.current = false;
            if (playTrackerRef.current.tokens.length > 0) {
              const nextTracker = advanceSequenceStep(playTrackerRef.current);
              playTrackerRef.current = nextTracker;
              setPlayTracker(nextTracker);

              if (!isAutoSolvingRef.current) {
                const nextToken = getNextExpectedToken(nextTracker);
                if (nextToken) {
                  const nextMove = parseNotation(nextToken, puzzleRef.current);
                  setHintMove(nextMove);
                  engine.showGuideArrow(nextMove);
                } else {
                  setHintMove(null);
                  engine.clearGuideArrow();
                }
                handledGuideArrow = true;
              }
            }
          } else if (!isFromQueue && !isScramblingRef.current) {
            if (activeTabRef.current === 'learn' && lessonTrackerRef.current.tokens.length > 0) {
              const nextTracker = isUndoingWrongRef.current
                ? clearSequenceWrongState(lessonTrackerRef.current)
                : evaluateSequenceMove(lessonTrackerRef.current, move, puzzleRef.current);
              isUndoingWrongRef.current = false;
              lessonTrackerRef.current = nextTracker;
              setLessonTracker(nextTracker);

              const nextToken = getNextExpectedToken(nextTracker);
              if (nextToken) {
                const nextMove = parseNotation(nextToken, puzzleRef.current);
                setHintMove(nextMove);
                engine.showGuideArrow(nextMove);
              } else {
                setHintMove(null);
                engine.clearGuideArrow();
              }
              handledGuideArrow = true;
            } else if (activeTabRef.current === 'play' && playTrackerRef.current.tokens.length > 0) {
              const nextTracker = isUndoingWrongRef.current
                ? clearSequenceWrongState(playTrackerRef.current)
                : evaluateSequenceMove(playTrackerRef.current, move, puzzleRef.current);
              isUndoingWrongRef.current = false;
              playTrackerRef.current = nextTracker;
              setPlayTracker(nextTracker);

              // Auto-advance the 3D guide arrow for active method plans, tracked sequences, & scramble practice
              const nextToken = getNextExpectedToken(nextTracker);
              if (nextToken) {
                const nextMove = parseNotation(nextToken, puzzleRef.current);
                setHintMove(nextMove);
                if (playTrackerLabelRef.current !== 'Solve Guide' || activeMethodPlanRef.current !== null) {
                  engine.showGuideArrow(nextMove);
                }
              } else {
                setHintMove(null);
                engine.clearGuideArrow();
              }
              handledGuideArrow = true;
            } else {
              isUndoingWrongRef.current = false;
            }
          }

          // Clear standalone hint arrow once the cube is solved
          if (solvedNow && !handledGuideArrow) {
            engine.clearGuideArrow();
            setHintMove(null);
          }

          // Trigger Victory celebration when a scrambled cube is solved in Play mode!
          if (solvedNow && hasScrambledRef.current && !isScramblingRef.current) {
            const finalElapsed = timerRunningRef.current
              ? elapsedAccumRef.current + (performance.now() - timerStartRef.current)
              : elapsedAccumRef.current;
            timerRunningRef.current = false;
            elapsedAccumRef.current = finalElapsed;
            setElapsedMs(finalElapsed);

            const prevBest = readBestTime(puzzleRef.current);
            const qualifiesForRecord = !isAutoSolvingRef.current && finalElapsed > 200;
            const isNewRecord = qualifiesForRecord && (prevBest === null || finalElapsed < prevBest);
            if (isNewRecord) {
              writeBestTime(puzzleRef.current, finalElapsed);
            }

            if (qualifiesForRecord) {
              const virtualRec: SolveRecord = {
                id: `v3d-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                puzzleType: puzzleRef.current,
                timeMs: Math.round(finalElapsed),
                penalty: 'none',
                scramble: currentScrambleRef.current || '3D Scramble',
                source: 'virtual3d',
                moves: moveCountRef.current,
                timestamp: Date.now(),
              };
              setSolveRecords((prev) => [...prev, virtualRec]);
            }

            const dailyRun = activeDailyRef.current;
            const isValidDailyRun =
              qualifiesForRecord && dailyRun !== null && dailyRun.puzzleType === puzzleRef.current;

            const snapshot: SolveSnapshot = {
              puzzleType: puzzleRef.current,
              moves: moveCountRef.current,
              elapsedMs: finalElapsed,
              bestMs: isNewRecord ? finalElapsed : prevBest,
              isNewRecord,
            };

            activeDailyRef.current = null;
            setActiveDailyDateKey(null);
            hasScrambledRef.current = false;
            setHasScrambled(false);
            isAutoSolvingRef.current = false;
            setIsAutoSolving(false);
            setIsBusy(false);

            engine.triggerVictoryCelebration();
            setVictorySnapshot(snapshot);
            setGameState('gameover');

            if (isValidDailyRun && dailyRun) {
              const clientId = getOrCreateClientId();
              const playerName = loadPlayerName();
              const localDailyEntry = {
                id: `dc-3d-${Date.now().toString(36)}`,
                dateKey: dailyRun.dateKey,
                puzzleType: dailyRun.puzzleType,
                clientId,
                playerName,
                timeMs: Math.round(finalElapsed),
                penalty: 'none' as const,
                source: 'virtual3d' as const,
                moves: snapshot.moves,
                submittedAt: Date.now(),
              };
              upsertLocalDailyEntry(localDailyEntry);

              fetch(buildApiUrl('/api/daily-challenge/submit'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  puzzleType: dailyRun.puzzleType,
                  clientId,
                  playerName,
                  timeMs: Math.round(finalElapsed),
                  penalty: 'none',
                  source: 'virtual3d',
                  moves: snapshot.moves,
                }),
              })
                .then((res) => (res.ok ? res.json() : null))
                .then((json: (DailyChallengeResponse & { entry?: typeof localDailyEntry }) | null) => {
                  if (!json) return;
                  if (json.entry) upsertLocalDailyEntry(json.entry);
                  setVictorySnapshot((prev) =>
                    prev
                      ? {
                          ...prev,
                          dailyChallenge: {
                            dateKey: json.dateKey,
                            rank: json.userEntry?.rank ?? null,
                            totalParticipants: json.totalParticipants,
                          },
                        }
                      : prev
                  );
                })
                .catch(() => {
                  // localStorage & cookie already hold the entry
                });
            }
          }
        },
        onQueueEmpty: (solvedNow) => {
          if (isScramblingRef.current) {
            isScramblingRef.current = false;
            hasScrambledRef.current = !solvedNow;
            setHasScrambled(!solvedNow);
            moveCountRef.current = 0;
            setMoveCount(0);
            elapsedAccumRef.current = 0;
            timerRunningRef.current = false;
            setElapsedMs(0);

            if (!solvedNow) {
              const plan = solveCubeWithMethod(
                engine.getCubieStates(),
                selectedMethodRef.current,
                puzzleRef.current,
                historyRef.current
              );
              activeMethodPlanRef.current = plan;
              setActiveMethodPlan(plan);
              const nextPlayTracker = createSequenceTracker(plan.allMoves.map((m) => m.notation));
              playTrackerRef.current = nextPlayTracker;
              setPlayTracker(nextPlayTracker);
              const label = `${plan.methodName} Solve`;
              playTrackerLabelRef.current = label;
              setPlayTrackerLabel(label);
            }
          }
          isAutoSolvingRef.current = false;
          setIsAutoSolving(false);
          setIsBusy(false);
        },
      },
      savedTheme
    );

    engineRef.current = engine;
    if (puzzleRef.current !== '3x3') {
      engine.loadPuzzle(puzzleRef.current, false);
    }
    engine.setGameState(gameStateRef.current);

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Sync game state changes to 3D camera framing & pause timer hygiene
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (gameState === 'paused') {
      if (timerRunningRef.current) {
        elapsedAccumRef.current += performance.now() - timerStartRef.current;
        timerRunningRef.current = false;
      }
    } else if (gameState === 'playing') {
      if (hasScrambledRef.current && moveCountRef.current > 0 && !isSolved && !timerRunningRef.current) {
        timerStartRef.current = performance.now();
        timerRunningRef.current = true;
      }
    }

    engine.setGameState(gameState);
  }, [gameState, isSolved]);

  const resetProgressTrackers = useCallback(() => {
    historyRef.current = [];
    setRecentNotations([]);
    moveCountRef.current = 0;
    setMoveCount(0);
    elapsedAccumRef.current = 0;
    timerRunningRef.current = false;
    setElapsedMs(0);
    hasScrambledRef.current = false;
    setHasScrambled(false);
    setIsSolved(true);
    setHintMove(null);
    isScramblingRef.current = false;
    isAutoSolvingRef.current = false;
    setIsAutoSolving(false);
    isUndoingWrongRef.current = false;
    isSteppingMethodRef.current = false;
    setIsBusy(false);

    activeMethodPlanRef.current = null;
    setActiveMethodPlan(null);

    const lessons = CURRICULUM[puzzleRef.current] ?? CURRICULUM['3x3'];
    const defaultLesson = lessons[0];
    const freshLesson = createSequenceTracker(defaultLesson.algorithm);
    lessonTrackerRef.current = freshLesson;
    setLessonTracker(freshLesson);

    const emptyPlay = createSequenceTracker([]);
    playTrackerRef.current = emptyPlay;
    setPlayTracker(emptyPlay);
    playTrackerLabelRef.current = 'Sequence';
    setPlayTrackerLabel('Sequence');
    lastScrambleTokensRef.current = [];
    setHasLastScramble(false);

    activeDailyRef.current = null;
    setActiveDailyDateKey(null);
    setActivePatternId('solved');
  }, []);

  const handleStartStudio = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    cubeAudio.playUiTick();
    // Reset cleanly from title demo moves so the studio starts crisp & ready
    engineRef.current?.loadPuzzle(puzzleRef.current, false);
    resetProgressTrackers();
    setVictorySnapshot(null);
    document.body.dataset.state = 'playing';
    setGameState('playing');
  }, [resetProgressTrackers]);

  const handleNavigateSeoView = useCallback(
    (view: SeoViewId) => {
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState(null, '', buildInternalViewHref(view));
        } catch {
          // ignore history errors in sandboxed iframes
        }
      }
      handleStartStudio();
      setDockCollapsed(false);
      if (view === 'arena') {
        setTimerModalTab(null);
        setArenaOpen(true);
      } else if (view === 'tutorials') {
        setArenaOpen(false);
        setTimerModalTab(null);
        setActiveTab('learn');
        activeTabRef.current = 'learn';
      } else if (view === 'timer') {
        setArenaOpen(false);
        setActiveTab('play');
        activeTabRef.current = 'play';
        setTimerModalTab('stopwatch');
      } else if (view === 'daily') {
        setArenaOpen(false);
        setActiveTab('play');
        activeTabRef.current = 'play';
        setTimerModalTab('daily');
      } else {
        setArenaOpen(false);
        setTimerModalTab(null);
        setActiveTab('play');
        activeTabRef.current = 'play';
      }
      syncDocumentSeo(view);
    },
    [handleStartStudio]
  );

  const handleSelectPuzzle = useCallback(
    (nextPuzzle: PuzzleType) => {
      if (nextPuzzle === puzzleRef.current && gameStateRef.current !== 'title') return;
      setPuzzleType(nextPuzzle);
      puzzleRef.current = nextPuzzle;
      saveStudioPref('puzzle', nextPuzzle);
      setActiveLessonId(CURRICULUM[nextPuzzle][0].id);
      resetProgressTrackers();
      engineRef.current?.loadPuzzle(nextPuzzle, true);
    },
    [resetProgressTrackers]
  );

  const handleSelectTheme = useCallback(
    (nextThemeKey: string) => {
      cubeAudio.playUiTick();
      setThemeKey(nextThemeKey);
      saveStudioPref('theme', nextThemeKey);
      saveCustomThemes(customThemes, nextThemeKey);
    },
    [customThemes]
  );

  const handleSaveCustomTheme = useCallback((record: CustomThemeRecord) => {
    setCustomThemes((prev) => {
      const idx = prev.findIndex((t) => t.id === record.id);
      const next =
        idx >= 0 ? prev.map((t) => (t.id === record.id ? record : t)) : [record, ...prev];
      saveCustomThemes(next, record.id);
      return next;
    });
    setThemeKey(record.id);
    saveStudioPref('theme', record.id);
  }, []);

  const handleDeleteCustomTheme = useCallback(
    (id: string) => {
      cubeAudio.playUiTick();
      setCustomThemes((prev) => {
        const next = prev.filter((t) => t.id !== id);
        const fallbackKey = themeKey === id ? 'atelier' : themeKey;
        saveCustomThemes(next, fallbackKey);
        return next;
      });
      if (themeKey === id) {
        setThemeKey('atelier');
        saveStudioPref('theme', 'atelier');
      }
    },
    [themeKey]
  );

  const handleSelectSoundscape = useCallback(
    (next: AmbientSoundscapeId) => {
      cubeAudio.playUiTick();
      setSoundscape(next);
      cubeAudio.setAmbientVolume(ambientVolume);
      cubeAudio.setSoundscape(next);
      saveAmbientPrefs(next, ambientVolume);
    },
    [ambientVolume]
  );

  const handleAmbientVolumeChange = useCallback(
    (vol: number) => {
      setAmbientVolume(vol);
      cubeAudio.setAmbientVolume(vol);
      saveAmbientPrefs(soundscape, vol);
    },
    [soundscape]
  );

  const handleScramble = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isBusy) return;
    cubeAudio.playUiTick();
    engine.clearGuideArrow();
    setHintMove(null);
    setVictorySnapshot(null);
    setGameState('playing');

    // Start scramble from fresh solved state for predictable scramble length
    engine.loadPuzzle(puzzleRef.current, false);
    resetProgressTrackers();

    const scrambleMoves = generateScramble(puzzleRef.current);
    const scrambleTokens = scrambleMoves.map((m) => m.notation);
    currentScrambleRef.current = scrambleTokens.join(' ');
    lastScrambleTokensRef.current = scrambleTokens;
    setHasLastScramble(scrambleTokens.length > 0);
    isScramblingRef.current = true;
    setIsBusy(true);
    engine.enqueueMoves(scrambleMoves, 2.35);
  }, [isBusy, resetProgressTrackers]);

  const handleApplyScrambleTo3D = useCallback(
    (targetPuzzle: PuzzleType, scrambleStr: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      cubeAudio.playUiTick();
      setTimerModalTab(null);
      setVictorySnapshot(null);
      setGameState('playing');
      setPuzzleType(targetPuzzle);
      puzzleRef.current = targetPuzzle;
      setActiveLessonId(CURRICULUM[targetPuzzle][0].id);

      engine.loadPuzzle(targetPuzzle, false);
      resetProgressTrackers();
      currentScrambleRef.current = scrambleStr;

      const moves = parseAlgorithm(scrambleStr, targetPuzzle);
      lastScrambleTokensRef.current = moves.map((m) => m.notation);
      setHasLastScramble(moves.length > 0);
      if (moves.length > 0) {
        isScramblingRef.current = true;
        setIsBusy(true);
        engine.enqueueMoves(moves, 2.6);
      }
    },
    [resetProgressTrackers]
  );

  const handlePlayDailyIn3D = useCallback(
    (targetPuzzle: PuzzleType, scrambleStr: string, dateKey: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      cubeAudio.playUiTick();
      setTimerModalTab(null);
      setVictorySnapshot(null);
      setGameState('playing');
      setPuzzleType(targetPuzzle);
      puzzleRef.current = targetPuzzle;
      setActiveLessonId(CURRICULUM[targetPuzzle][0].id);

      engine.loadPuzzle(targetPuzzle, false);
      resetProgressTrackers();
      currentScrambleRef.current = scrambleStr;
      activeDailyRef.current = { dateKey, puzzleType: targetPuzzle, scramble: scrambleStr };
      setActiveDailyDateKey(dateKey);

      const moves = parseAlgorithm(scrambleStr, targetPuzzle);
      lastScrambleTokensRef.current = moves.map((m) => m.notation);
      setHasLastScramble(moves.length > 0);
      if (moves.length > 0) {
        isScramblingRef.current = true;
        setIsBusy(true);
        engine.enqueueMoves(moves, 2.6);
      }
    },
    [resetProgressTrackers]
  );

  const handleAddSolveRecord = useCallback((rec: SolveRecord) => {
    setSolveRecords((prev) => [...prev, rec]);
  }, []);

  const handleUpdateSolvePenalty = useCallback((id: string, penalty: SolvePenalty) => {
    setSolveRecords((prev) => prev.map((r) => (r.id === id ? { ...r, penalty } : r)));
  }, []);

  const handleUpdateSolveMoves = useCallback((id: string, moves: number | undefined) => {
    setSolveRecords((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (moves === undefined) {
          const { moves: _removed, ...rest } = r;
          return rest;
        }
        return { ...r, moves };
      })
    );
  }, []);

  const handleDeleteSolveRecord = useCallback((id: string) => {
    setSolveRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleClearPuzzleRecords = useCallback((puzzle: PuzzleType) => {
    setSolveRecords((prev) => prev.filter((r) => r.puzzleType !== puzzle));
  }, []);

  const handleRestoreDemoRecords = useCallback(() => {
    setSolveRecords(createSeedRecords());
  }, []);

  const handleExportBackupJson = useCallback((): { ok: boolean; message: string } => {
    try {
      const payload = createBackupPayload({
        customThemes,
        solveRecords,
        activeThemeId: themeKey,
      });
      const json = serializeBackupJson(payload);
      triggerJsonDownload(json, getBackupFilename());
      cubeAudio.playUiTick();
      const tLabel = customThemes.length === 1 ? 'theme' : 'themes';
      const sLabel = solveRecords.length === 1 ? 'solve' : 'solves';
      return {
        ok: true,
        message: `Exported ${customThemes.length} custom ${tLabel} & ${solveRecords.length} ${sLabel}.`,
      };
    } catch {
      return { ok: false, message: 'Could not generate backup file on this browser.' };
    }
  }, [customThemes, solveRecords, themeKey]);

  const handleImportBackupJson = useCallback(
    (rawText: string, mode: BackupImportMode = 'merge'): { ok: boolean; message: string } => {
      const parsed = parseBackupJson(rawText);
      if (!parsed.ok) {
        return { ok: false, message: parsed.error };
      }

      const merged = mergeBackupData(
        { customThemes, solveRecords },
        parsed.payload,
        mode
      );

      let nextThemeKey = themeKey;
      const incomingActive = parsed.payload.activeThemeId;
      if (incomingActive) {
        const resolved = resolveThemePalette(incomingActive, merged.customThemes);
        if (resolved.id === incomingActive) {
          nextThemeKey = incomingActive;
        }
      } else if (mode === 'replace') {
        const stillExists = resolveThemePalette(themeKey, merged.customThemes).id === themeKey;
        if (!stillExists) nextThemeKey = 'atelier';
      }

      setCustomThemes(merged.customThemes);
      saveCustomThemes(merged.customThemes, nextThemeKey);

      setSolveRecords(merged.solveRecords);
      saveSolveRecords(merged.solveRecords);

      if (nextThemeKey !== themeKey) {
        setThemeKey(nextThemeKey);
        saveStudioPref('theme', nextThemeKey);
      }

      cubeAudio.playUiTick();

      const skippedTotal = parsed.skippedThemes + parsed.skippedRecords;
      const skippedNote = skippedTotal > 0 ? ` (${skippedTotal} invalid skipped)` : '';
      if (mode === 'replace') {
        return {
          ok: true,
          message: `Restored ${merged.customThemes.length} custom theme${merged.customThemes.length === 1 ? '' : 's'} & ${merged.solveRecords.length} solve${merged.solveRecords.length === 1 ? '' : 's'}${skippedNote}.`,
        };
      }
      const themeTouch = merged.addedThemes + merged.updatedThemes;
      return {
        ok: true,
        message: `Imported ${themeTouch} custom theme${themeTouch === 1 ? '' : 's'} & ${merged.addedRecords} new solve${merged.addedRecords === 1 ? '' : 's'}${skippedNote}.`,
      };
    },
    [customThemes, solveRecords, themeKey]
  );

  const handleExportSnapshot = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const showToast = (ok: boolean, message: string) => {
      setSnapshotToast({ ok, message });
      if (snapshotToastTimerRef.current !== null) {
        window.clearTimeout(snapshotToastTimerRef.current);
      }
      snapshotToastTimerRef.current = window.setTimeout(() => {
        setSnapshotToast(null);
        snapshotToastTimerRef.current = null;
      }, 2800);
    };

    const captured = engine.captureHighResSnapshot();
    if (!captured) {
      showToast(false, 'Could not capture cube screenshot on this browser.');
      return;
    }

    const filename = buildSnapshotFilename({
      puzzleType: puzzleRef.current,
      themeName: theme.name,
    });
    triggerPngDownload(captured.dataUrl, filename);
    cubeAudio.playUiTick();
    showToast(true, `Saved ${captured.width}×${captured.height} PNG snapshot`);
  }, [theme.name]);

  useEffect(() => {
    return () => {
      if (snapshotToastTimerRef.current !== null) {
        window.clearTimeout(snapshotToastTimerRef.current);
      }
    };
  }, []);

  const handleManualMove = useCallback(
    (notation: string) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      const move = parseNotation(notation, puzzleRef.current);
      if (!move) return;
      const keepActiveGuide =
        (activeTabRef.current === 'learn' && lessonTrackerRef.current.tokens.length > 0) ||
        (activeTabRef.current === 'play' &&
          playTrackerRef.current.tokens.length > 0 &&
          playTrackerLabelRef.current !== 'Solve Guide');
      if (!keepActiveGuide) {
        engine.clearGuideArrow();
        setHintMove(null);
      }
      engine.enqueueMove(move, false, 1.0);
    },
    [isBusy]
  );

  const handleUndo = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isBusy || historyRef.current.length === 0) return;
    const last = historyRef.current[historyRef.current.length - 1];
    const inv = invertMove(last);

    const activeTracker =
      activeTabRef.current === 'learn'
        ? lessonTrackerRef.current
        : activeTabRef.current === 'play'
          ? playTrackerRef.current
          : null;

    if (activeTracker && activeTracker.lastWrongNotation !== null) {
      isUndoingWrongRef.current = true;
    } else {
      isUndoingWrongRef.current = false;
      engine.clearGuideArrow();
      setHintMove(null);
    }

    engine.enqueueMove(inv, false, 1.25);
  }, [isBusy]);

  const handleTrackPlaySequence = useCallback(
    (rawInput: string): { ok: boolean; message?: string } => {
      const { tokens, invalidTokens } = parseNotationSequenceInput(rawInput, puzzleRef.current);
      if (tokens.length === 0) {
        return {
          ok: false,
          message:
            invalidTokens.length > 0
              ? `Unsupported notation: ${invalidTokens.slice(0, 3).join(', ')}`
              : 'Enter WCA moves like U D L F R, M E S, or x y z.',
        };
      }
      cubeAudio.playUiTick();
      activeMethodPlanRef.current = null;
      setActiveMethodPlan(null);
      const next = createSequenceTracker(tokens);
      playTrackerRef.current = next;
      setPlayTracker(next);
      playTrackerLabelRef.current = 'Sequence';
      setPlayTrackerLabel('Sequence');

      const firstMove = parseNotation(tokens[0], puzzleRef.current);
      setHintMove(firstMove);
      engineRef.current?.showGuideArrow(firstMove);
      return {
        ok: true,
        message:
          invalidTokens.length > 0
            ? `Skipped unsupported: ${invalidTokens.join(', ')}`
            : undefined,
      };
    },
    []
  );

  const handlePracticeScrambleManually = useCallback(() => {
    const engine = engineRef.current;
    const tokens = lastScrambleTokensRef.current;
    if (!engine || isBusy || tokens.length === 0) return;
    cubeAudio.playUiTick();
    engine.loadPuzzle(puzzleRef.current, false);
    resetProgressTrackers();
    lastScrambleTokensRef.current = tokens;
    setHasLastScramble(true);

    const next = createSequenceTracker(tokens);
    playTrackerRef.current = next;
    setPlayTracker(next);
    playTrackerLabelRef.current = 'Scramble';
    setPlayTrackerLabel('Scramble');

    const firstMove = parseNotation(tokens[0], puzzleRef.current);
    setHintMove(firstMove);
    engine.showGuideArrow(firstMove);
  }, [isBusy, resetProgressTrackers]);

  const handleResetPlayTracker = useCallback(() => {
    if (playTrackerRef.current.tokens.length === 0) return;
    cubeAudio.playUiTick();
    if (activeMethodPlanRef.current && engineRef.current) {
      // Re-plan cleanly from the live 3D state for the active method!
      const plan = solveCubeWithMethod(
        engineRef.current.getCubieStates(),
        selectedMethodRef.current,
        puzzleRef.current,
        historyRef.current
      );
      activeMethodPlanRef.current = plan;
      setActiveMethodPlan(plan);
      const fresh = createSequenceTracker(plan.allMoves.map((m) => m.notation));
      playTrackerRef.current = fresh;
      setPlayTracker(fresh);
      const firstMove = plan.allMoves[0] ?? null;
      setHintMove(firstMove);
      if (firstMove) engineRef.current.showGuideArrow(firstMove);
      else engineRef.current.clearGuideArrow();
      return;
    }
    const restarted = createSequenceTracker(playTrackerRef.current.tokens);
    playTrackerRef.current = restarted;
    setPlayTracker(restarted);
    const firstMove = parseNotation(restarted.tokens[0], puzzleRef.current);
    setHintMove(firstMove);
    engineRef.current?.showGuideArrow(firstMove);
  }, []);

  const handleClearPlayTracker = useCallback(() => {
    cubeAudio.playUiTick();
    activeMethodPlanRef.current = null;
    setActiveMethodPlan(null);
    const empty = createSequenceTracker([]);
    playTrackerRef.current = empty;
    setPlayTracker(empty);
    playTrackerLabelRef.current = 'Sequence';
    setPlayTrackerLabel('Sequence');
    setHintMove(null);
    engineRef.current?.clearGuideArrow();
  }, []);

  const buildFreshMethodPlan = useCallback(
    (methodId: SolveMethodId, showArrow = false): MethodSolvePlan | null => {
      const engine = engineRef.current;
      if (!engine) return null;
      const plan = solveCubeWithMethod(
        engine.getCubieStates(),
        methodId,
        puzzleRef.current,
        historyRef.current
      );
      if (plan.totalMoves === 0) {
        activeMethodPlanRef.current = null;
        setActiveMethodPlan(null);
        return null;
      }
      activeMethodPlanRef.current = plan;
      setActiveMethodPlan(plan);
      const tracker = createSequenceTracker(plan.allMoves.map((m) => m.notation));
      playTrackerRef.current = tracker;
      setPlayTracker(tracker);
      const label = `${SOLVE_METHODS[methodId].shortName} Solve`;
      playTrackerLabelRef.current = label;
      setPlayTrackerLabel(label);

      if (showArrow && plan.allMoves[0]) {
        setHintMove(plan.allMoves[0]);
        engine.showGuideArrow(plan.allMoves[0]);
      } else {
        setHintMove(null);
        engine.clearGuideArrow();
      }
      return plan;
    },
    []
  );

  const handleSelectMethod = useCallback(
    (nextMethod: SolveMethodId) => {
      if (isBusy) return;
      cubeAudio.playUiTick();
      setSelectedMethod(nextMethod);
      selectedMethodRef.current = nextMethod;
      saveStudioPref('method', nextMethod);
      if (!isSolved) {
        buildFreshMethodPlan(nextMethod, true);
      }
    },
    [buildFreshMethodPlan, isBusy, isSolved]
  );

  const handleReplanMethod = useCallback(() => {
    if (isBusy || isSolved) return;
    cubeAudio.playUiTick();
    buildFreshMethodPlan(selectedMethodRef.current, true);
  }, [buildFreshMethodPlan, isBusy, isSolved]);

  const handleHint = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isBusy || isSolved) return;
    cubeAudio.playUiTick();

    // If an active method plan is on track, hint its exact next move; otherwise plan fresh!
    const currPlan = activeMethodPlanRef.current;
    const currTracker = playTrackerRef.current;
    if (
      currPlan &&
      currTracker.lastWrongNotation === null &&
      currTracker.currentIndex < currPlan.allMoves.length
    ) {
      const next = currPlan.allMoves[currTracker.currentIndex];
      setHintMove(next);
      engine.showGuideArrow(next);
      return;
    }

    const freshPlan = buildFreshMethodPlan(selectedMethodRef.current, true);
    if (!freshPlan) {
      const solution = computeSolutionFromHistory(historyRef.current, puzzleRef.current);
      if (solution.length === 0) return;
      setHintMove(solution[0]);
      engine.showGuideArrow(solution[0]);
    }
  }, [buildFreshMethodPlan, isBusy, isSolved]);

  const handleStepSolveMove = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isBusy || isSolved) return;
    cubeAudio.playUiTick();

    let plan = activeMethodPlanRef.current;
    let tracker = playTrackerRef.current;

    if (
      !plan ||
      tracker.lastWrongNotation !== null ||
      tracker.currentIndex >= plan.allMoves.length
    ) {
      plan = buildFreshMethodPlan(selectedMethodRef.current, false);
      tracker = playTrackerRef.current;
    }
    if (!plan || tracker.currentIndex >= plan.allMoves.length) return;

    const nextMove = plan.allMoves[tracker.currentIndex];
    isSteppingMethodRef.current = true;
    engine.enqueueMove(nextMove, true, 1.0);
  }, [buildFreshMethodPlan, isBusy, isSolved]);

  const handlePauseAutoSolve = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !isAutoSolvingRef.current) return;
    cubeAudio.playUiTick();
    engine.clearQueue();
    isAutoSolvingRef.current = false;
    setIsAutoSolving(false);
    setIsBusy(false);

    // Show 3D guide arrow on the exact move where the learner paused!
    const nextToken = getNextExpectedToken(playTrackerRef.current);
    if (nextToken) {
      const nextMove = parseNotation(nextToken, puzzleRef.current);
      setHintMove(nextMove);
      engine.showGuideArrow(nextMove);
    }
  }, []);

  const handleAutoSolve = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || isBusy || isSolved) return;
    cubeAudio.playUiTick();

    let plan = activeMethodPlanRef.current;
    let tracker = playTrackerRef.current;
    const canResumeCurrentPlan =
      plan !== null &&
      plan.methodId === selectedMethodRef.current &&
      tracker.lastWrongNotation === null &&
      tracker.currentIndex < plan.allMoves.length;

    if (!canResumeCurrentPlan) {
      plan = buildFreshMethodPlan(selectedMethodRef.current, false);
      tracker = playTrackerRef.current;
    }

    const remaining = plan
      ? plan.allMoves.slice(tracker.currentIndex)
      : computeSolutionFromHistory(historyRef.current, puzzleRef.current);
    if (remaining.length === 0) return;

    engine.clearGuideArrow();
    setHintMove(null);
    isAutoSolvingRef.current = true;
    setIsAutoSolving(true);
    setIsBusy(true);
    engine.enqueueMoves(remaining, 1.55);
  }, [buildFreshMethodPlan, isBusy, isSolved]);

  const handleResetCube = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    cubeAudio.playUiTick();
    engine.loadPuzzle(puzzleRef.current, true);
    resetProgressTrackers();
    setVictorySnapshot(null);
    if (gameStateRef.current === 'paused' || gameStateRef.current === 'gameover') {
      setGameState('playing');
    }
  }, [resetProgressTrackers]);

  const handleExplodeChange = useCallback((v: number) => {
    setExplodeAmount(v);
    engineRef.current?.setExplodeAmount(v);
  }, []);

  const handleSpeedChange = useCallback((v: number) => {
    setTurnSpeed(v);
    engineRef.current?.setTurnSpeed(v);
  }, []);

  const handleApplyPattern = useCallback(
    (patternId: StickerPatternId) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      cubeAudio.playUiTick();
      engine.clearGuideArrow();
      resetProgressTrackers();
      setVictorySnapshot(null);
      engine.applyStickerPattern(patternId, true);
      setActivePatternId(patternId);
    },
    [isBusy, resetProgressTrackers]
  );

  const handleRunAlgorithm = useCallback(
    (notations: string[]) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      const moves = parseAlgorithm(notations, puzzleRef.current);
      if (moves.length === 0) return;
      cubeAudio.playUiTick();
      engine.clearGuideArrow();
      setHintMove(null);
      setIsBusy(true);
      engine.enqueueMoves(moves, 1.25);
    },
    [isBusy]
  );

  // Interactive Lesson Handlers
  const handleStageLesson = useCallback(
    (lesson: LessonStep) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      resetProgressTrackers();
      setActiveLessonId(lesson.id);
      const fresh = createSequenceTracker(lesson.algorithm);
      lessonTrackerRef.current = fresh;
      setLessonTracker(fresh);

      engine.applySetupInstantly(lesson.setupMoves);
      historyRef.current = parseAlgorithm(lesson.setupMoves, puzzleRef.current);
      setIsSolved(false);

      const firstMove = parseNotation(lesson.algorithm[0], puzzleRef.current);
      setHintMove(firstMove);
      engine.showGuideArrow(firstMove);
    },
    [isBusy, resetProgressTrackers]
  );

  const handleSelectLesson = useCallback(
    (lesson: LessonStep) => {
      handleStageLesson(lesson);
    },
    [handleStageLesson]
  );

  const handleStepLesson = useCallback(
    (lesson: LessonStep) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      const curr = lessonTrackerRef.current;
      if (curr.currentIndex >= lesson.algorithm.length) return;
      const move = parseNotation(lesson.algorithm[curr.currentIndex], puzzleRef.current);
      if (!move) return;

      const nextTracker = advanceSequenceStep(curr);
      lessonTrackerRef.current = nextTracker;
      setLessonTracker(nextTracker);
      engine.enqueueMove(move, true, 0.95);

      const nextToken = getNextExpectedToken(nextTracker);
      if (nextToken) {
        const upcoming = parseNotation(nextToken, puzzleRef.current);
        setHintMove(upcoming);
        engine.showGuideArrow(upcoming);
      } else {
        setHintMove(null);
        engine.clearGuideArrow();
      }
    },
    [isBusy]
  );

  const handlePlayLesson = useCallback(
    (lesson: LessonStep) => {
      const engine = engineRef.current;
      if (!engine || isBusy) return;
      // Stage fresh first, then animate entire algorithm smoothly
      resetProgressTrackers();
      setActiveLessonId(lesson.id);
      engine.applySetupInstantly(lesson.setupMoves);
      historyRef.current = parseAlgorithm(lesson.setupMoves, puzzleRef.current);
      setIsSolved(false);

      const algMoves = parseAlgorithm(lesson.algorithm, puzzleRef.current);
      const doneTracker = completeSequenceAll(createSequenceTracker(lesson.algorithm));
      lessonTrackerRef.current = doneTracker;
      setLessonTracker(doneTracker);
      setIsBusy(true);
      engine.clearGuideArrow();
      engine.enqueueMoves(algMoves, 0.85);
    },
    [isBusy, resetProgressTrackers]
  );

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      cubeAudio.setMuted(next);
      return next;
    });
  }, []);

  // Global Keyboard Shortcuts (WCA faces U/D/L/R/F/B, center slices M/E/S, cube rotations x/y/z,
  // Shift for prime ', Enter/Space title start, Esc/P pause, V mute, H HUD, Ctrl+Z/Backspace undo, T stopwatch)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (timerModalOpenRef.current || arenaOpenRef.current || paletteStudioOpenRef.current) return;

      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isTyping) return;

      if (gameStateRef.current === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartStudio();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (gameStateRef.current === 'playing') handleUndo();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (shortcutsOpenRef.current) {
          setShortcutsOpen(false);
          return;
        }
        if (gameStateRef.current === 'playing') setGameState('paused');
        else if (gameStateRef.current === 'paused') setGameState('playing');
        return;
      }

      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (gameStateRef.current === 'playing') setGameState('paused');
        else if (gameStateRef.current === 'paused') setGameState('playing');
        return;
      }

      if (gameStateRef.current !== 'playing') return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleUndo();
        return;
      }

      const upper = e.key.toUpperCase();
      if (['U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S'].includes(upper)) {
        e.preventDefault();
        const notation = e.shiftKey ? `${upper}'` : upper;
        handleManualMove(notation);
        return;
      }

      if (['X', 'Y', 'Z'].includes(upper)) {
        e.preventDefault();
        const lower = upper.toLowerCase();
        const notation = e.shiftKey ? `${lower}'` : lower;
        handleManualMove(notation);
        return;
      }

      if (upper === 'T') {
        e.preventDefault();
        setTimerModalTab('stopwatch');
      } else if (upper === 'V') {
        e.preventDefault();
        handleToggleMute();
      } else if (upper === 'H') {
        e.preventDefault();
        setDockCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleManualMove, handleStartStudio, handleToggleMute, handleUndo]);

  const inStudio = gameState !== 'title';

  return (
    <main
      className="relative w-full h-dvh overflow-hidden flex flex-col"
      style={{ backgroundColor: theme.ui.bg }}
    >
      {/* Docked Non-Overlapping Top Studio Header */}
      {inStudio && (
        <TopHud
          theme={theme}
          puzzleType={puzzleType}
          moveCount={moveCount}
          elapsedMs={elapsedMs}
          isSolved={isSolved}
          hasScrambled={hasScrambled}
          activeDailyDateKey={activeDailyDateKey}
          isMuted={isMuted}
          dockCollapsed={dockCollapsed}
          shortcutsOpen={shortcutsOpen}
          onSelectPuzzle={handleSelectPuzzle}
          onOpenStopwatch={() => {
            cubeAudio.playUiTick();
            setTimerModalTab('stopwatch');
          }}
          onOpenDashboard={() => {
            cubeAudio.playUiTick();
            setTimerModalTab('dashboard');
          }}
          onOpenArena={() => {
            cubeAudio.playUiTick();
            setTimerModalTab(null);
            setArenaOpen(true);
          }}
          onExportSnapshot={handleExportSnapshot}
          onResetCamera={() => engineRef.current?.resetCamera()}
          onToggleMute={handleToggleMute}
          onToggleDock={() => setDockCollapsed((p) => !p)}
          onToggleShortcuts={() => {
            cubeAudio.playUiTick();
            setShortcutsOpen((p) => !p);
          }}
          onPause={() => setGameState('paused')}
        />
      )}

      {/* Responsive Non-Overlapping Studio Workspace (Full-bleed on Title Screen, Split/Stacked in Studio) */}
      <div className={inStudio ? 'kubi-studio-workspace' : 'relative flex-1 min-h-0 w-full flex flex-col'}>
        {/* Dedicated Unobstructed 3D Cube Stage (Persistent WebGL mount — never unmounted on state/collapse changes) */}
        <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
          <div className="relative flex-1 min-h-0 min-w-0">
            <div
              ref={canvasMountRef}
              data-testid="cube-viewport"
              className="kubi-canvas-stage absolute inset-0 w-full h-full z-0"
            />

            {/* Keyboard Shortcuts Reference anchored cleanly inside the 3D Stage */}
            {inStudio && shortcutsOpen && gameState === 'playing' && !paletteStudioOpen && timerModalTab === null && (
              <ShortcutsHelpOverlay
                theme={theme}
                puzzleType={puzzleType}
                isBusy={isBusy}
                onTryMove={handleManualMove}
                onClose={() => {
                  cubeAudio.playUiTick();
                  setShortcutsOpen(false);
                }}
              />
            )}

            {/* Non-intrusive High-Res Snapshot Confirmation Toast centered in 3D Stage */}
            {snapshotToast && (
              <div
                role={snapshotToast.ok ? 'status' : 'alert'}
                aria-live="polite"
                data-testid="snapshot-toast"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 whitespace-nowrap animate-kubi-enter"
                style={{
                  backgroundColor: theme.ui.surface,
                  borderColor: snapshotToast.ok ? theme.ui.accent : 'rgba(220, 38, 38, 0.45)',
                  color: snapshotToast.ok ? theme.ui.text : '#DC2626',
                  boxShadow: theme.ui.shadow,
                }}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" style={{ color: snapshotToast.ok ? theme.ui.accent : '#DC2626' }} />
                <span>{snapshotToast.message}</span>
              </div>
            )}
          </div>

          {/* Compact Live Notation & Active Step Mini-Bar — docked cleanly below the 3D Stage when controls are hidden */}
          {inStudio && !paletteStudioOpen && dockCollapsed && (
            <CompactNotationBar
              theme={theme}
              puzzleType={puzzleType}
              activeTab={activeTab}
              isBusy={isBusy}
              isAutoSolving={isAutoSolving}
              isSolved={isSolved}
              canUndo={historyRef.current.length > 0}
              hintMove={hintMove}
              activeMethodPlan={activeMethodPlan}
              activeLessonId={activeLessonId}
              lessonTracker={lessonTracker}
              playTracker={playTracker}
              playTrackerLabel={playTrackerLabel}
              onExpandControls={() => setDockCollapsed(false)}
              onScramble={handleScramble}
              onHint={handleHint}
              onUndo={handleUndo}
              onStepSolveMove={handleStepSolveMove}
              onAutoSolve={handleAutoSolve}
              onPauseAutoSolve={handlePauseAutoSolve}
              onManualMove={handleManualMove}
              onStageLesson={handleStageLesson}
              onStepLesson={handleStepLesson}
            />
          )}
        </div>

        {/* Dedicated Non-Overlapping Controls Slot (Right Side Panel on Desktop/Landscape, Bottom Drawer on Mobile Portrait) */}
        {inStudio && !paletteStudioOpen && !dockCollapsed && (
          <BottomDock
            theme={theme}
            customThemes={customThemes}
            soundscape={soundscape}
            ambientVolume={ambientVolume}
            puzzleType={puzzleType}
            activeTab={activeTab}
            collapsed={dockCollapsed}
            isBusy={isBusy}
            isAutoSolving={isAutoSolving}
            isSolved={isSolved}
            canUndo={historyRef.current.length > 0}
            hintMove={hintMove}
            explodeAmount={explodeAmount}
            turnSpeed={turnSpeed}
            activePatternId={activePatternId}
            selectedMethod={selectedMethod}
            activeMethodPlan={activeMethodPlan}
            activeLessonId={activeLessonId}
            lessonTracker={lessonTracker}
            playTracker={playTracker}
            playTrackerLabel={playTrackerLabel}
            hasLastScramble={hasLastScramble}
            recentNotations={recentNotations}
            onSetTab={(tab) => {
              cubeAudio.playUiTick();
              setActiveTab(tab);
              activeTabRef.current = tab;
              if (tab === 'learn') {
                const lessons = CURRICULUM[puzzleType];
                const current = lessons.find((l) => l.id === activeLessonId) ?? lessons[0];
                if (isSolved && !hasScrambled) {
                  handleStageLesson(current);
                } else {
                  const nextToken = getNextExpectedToken(lessonTrackerRef.current);
                  if (nextToken) {
                    const nextMove = parseNotation(nextToken, puzzleRef.current);
                    setHintMove(nextMove);
                    engineRef.current?.showGuideArrow(nextMove);
                  }
                }
              } else if (tab === 'play') {
                if (playTrackerRef.current.tokens.length > 0) {
                  const nextToken = getNextExpectedToken(playTrackerRef.current);
                  const nextMove = nextToken ? parseNotation(nextToken, puzzleRef.current) : null;
                  setHintMove(nextMove);
                  if (nextMove) engineRef.current?.showGuideArrow(nextMove);
                  else engineRef.current?.clearGuideArrow();
                } else {
                  setHintMove(null);
                  engineRef.current?.clearGuideArrow();
                }
              }
            }}
            onToggleCollapse={() => setDockCollapsed((p) => !p)}
            onScramble={handleScramble}
            onUndo={handleUndo}
            onHint={handleHint}
            onStepSolveMove={handleStepSolveMove}
            onAutoSolve={handleAutoSolve}
            onPauseAutoSolve={handlePauseAutoSolve}
            onSelectMethod={handleSelectMethod}
            onReplanMethod={handleReplanMethod}
            onResetCube={handleResetCube}
            onManualMove={handleManualMove}
            onTrackPlaySequence={handleTrackPlaySequence}
            onPracticeScrambleManually={handlePracticeScrambleManually}
            onResetPlayTracker={handleResetPlayTracker}
            onClearPlayTracker={handleClearPlayTracker}
            onExplodeChange={handleExplodeChange}
            onSpeedChange={handleSpeedChange}
            onSelectTheme={handleSelectTheme}
            onOpenPaletteStudio={() => {
              cubeAudio.playUiTick();
              setPaletteStudioOpen(true);
            }}
            onExportSnapshot={handleExportSnapshot}
            onSelectSoundscape={handleSelectSoundscape}
            onAmbientVolumeChange={handleAmbientVolumeChange}
            onApplyPattern={handleApplyPattern}
            onRunAlgorithm={handleRunAlgorithm}
            onSelectLesson={handleSelectLesson}
            onStageLesson={handleStageLesson}
            onStepLesson={handleStepLesson}
            onPlayLesson={handlePlayLesson}
          />
        )}

        {/* Figma-Inspired Live Cube Sticker Palette Studio — docks cleanly into the side/bottom panel slot */}
        {inStudio && paletteStudioOpen && (
          <PaletteStudioModal
            theme={savedTheme}
            activeThemeKey={themeKey}
            customThemes={customThemes}
            onPreviewPalette={setPreviewPalette}
            onSaveCustomTheme={handleSaveCustomTheme}
            onSelectTheme={handleSelectTheme}
            onDeleteCustomTheme={handleDeleteCustomTheme}
            onExportSnapshot={handleExportSnapshot}
            onClose={() => {
              setPreviewPalette(null);
              setPaletteStudioOpen(false);
            }}
          />
        )}
      </div>

      {/* Title Screen Overlay */}
      {gameState === 'title' && (
        <TitleScreen
          theme={theme}
          puzzleType={puzzleType}
          onSelectPuzzle={handleSelectPuzzle}
          onSelectTheme={handleSelectTheme}
          onStart={handleStartStudio}
          onNavigateView={handleNavigateSeoView}
        />
      )}

      {/* Pause / Studio Settings Modal */}
      {gameState === 'paused' && (
        <PauseModal
          theme={theme}
          customThemes={customThemes}
          solveCount={solveRecords.length}
          soundscape={soundscape}
          ambientVolume={ambientVolume}
          onResume={() => setGameState('playing')}
          onRestart={handleResetCube}
          onSelectTheme={handleSelectTheme}
          onOpenPaletteStudio={() => {
            cubeAudio.playUiTick();
            setGameState('playing');
            setPaletteStudioOpen(true);
          }}
          onSelectSoundscape={handleSelectSoundscape}
          onAmbientVolumeChange={handleAmbientVolumeChange}
          onExportBackupJson={handleExportBackupJson}
          onImportBackupJson={handleImportBackupJson}
          onExportSnapshot={handleExportSnapshot}
          onBackToTitle={() => {
            engineRef.current?.clearGuideArrow();
            setGameState('title');
          }}
        />
      )}

      {/* Victory Celebration Modal */}
      {gameState === 'gameover' && victorySnapshot && (
        <VictoryModal
          theme={theme}
          snapshot={victorySnapshot}
          onPlayAgain={handleScramble}
          onOpenLessons={() => {
            setVictorySnapshot(null);
            setGameState('playing');
            setDockCollapsed(false);
            setActiveTab('learn');
            handleStageLesson(CURRICULUM[puzzleType][0]);
          }}
          onOpenDailyLeaderboard={() => {
            setVictorySnapshot(null);
            setGameState('playing');
            setTimerModalTab('daily');
          }}
          onDismiss={() => {
            setVictorySnapshot(null);
            setGameState('playing');
          }}
        />
      )}

      {/* Built-in Speedcube Stopwatch, Analytics Dashboard & Daily Challenge Workspace */}
      {timerModalTab !== null && (
        <TimerDashboardModal
          theme={theme}
          puzzleType={puzzleType}
          initialTab={timerModalTab}
          records={solveRecords}
          customThemesCount={customThemes.length}
          onClose={() => setTimerModalTab(null)}
          onSelectPuzzle={handleSelectPuzzle}
          onAddRecord={handleAddSolveRecord}
          onUpdatePenalty={handleUpdateSolvePenalty}
          onUpdateMoves={handleUpdateSolveMoves}
          onDeleteRecord={handleDeleteSolveRecord}
          onClearPuzzleRecords={handleClearPuzzleRecords}
          onRestoreDemoRecords={handleRestoreDemoRecords}
          onExportBackupJson={handleExportBackupJson}
          onImportBackupJson={handleImportBackupJson}
          onApplyScrambleTo3D={handleApplyScrambleTo3D}
          onPlayDailyIn3D={handlePlayDailyIn3D}
        />
      )}

      {/* 1v1 Online Live Speedcubing Competition Arena (Video + Audio + Independent Timers) */}
      {arenaOpen && (
        <ArenaModal
          theme={theme}
          initialPuzzle={puzzleType}
          initialRoomCode={arenaInviteRoomCode}
          onClose={() => {
            setArenaOpen(false);
            setArenaInviteRoomCode(null);
          }}
        />
      )}
    </main>
  );
}
