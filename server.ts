import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  ArenaEngine,
  VALID_ARENA_PENALTIES,
  VALID_ARENA_PUZZLES,
  type ArenaClientMessage,
  type ArenaRoomEventKind,
  type ArenaRoomSnapshot,
  type ArenaServerMessage,
} from './src/cube/arenaEngine.ts';
import {
  generateDailyScramble,
  getNextUtcMidnightMs,
  getUtcDateKey,
  rankDailyEntries,
  sanitizePlayerName,
  type DailyLeaderboardEntry,
} from './src/cube/dailyChallenge.ts';
import { getEffectiveTimeMs, type SolvePenalty } from './src/cube/timerStats.ts';
import type { PuzzleType } from './src/cube/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const VALID_PUZZLES = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);
const VALID_PENALTIES = new Set<SolvePenalty>(['none', '+2', 'dnf']);
const DAILY_STORE_PATH = path.join(os.tmpdir(), 'kubi-studio-daily-leaderboard-v1.json');

function loadDailyStore(): DailyLeaderboardEntry[] {
  try {
    if (!fs.existsSync(DAILY_STORE_PATH)) return [];
    const raw = fs.readFileSync(DAILY_STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DailyLeaderboardEntry =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.dateKey === 'string' &&
        VALID_PUZZLES.has(item.puzzleType) &&
        typeof item.clientId === 'string' &&
        typeof item.playerName === 'string' &&
        typeof item.timeMs === 'number'
    );
  } catch {
    return [];
  }
}

function saveDailyStore(entries: DailyLeaderboardEntry[]): void {
  try {
    // Keep last 7 UTC days to keep file compact
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trimmed = entries.filter((e) => e.submittedAt >= cutoff).slice(-2000);
    fs.writeFileSync(DAILY_STORE_PATH, JSON.stringify(trimmed), 'utf-8');
  } catch {
    // fallback gracefully to in-memory cache
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Prevent search crawlers from indexing raw JSON API endpoints
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // Explicitly serve robots.txt and sitemap.xml with crisp crawler headers at both root and GitHub Pages subpath
  const publicDir = path.resolve(__dirname, isProd ? 'dist' : 'public');
  const sendSeoStaticFile = (filename: string, contentType: string) => (_req: express.Request, res: express.Response) => {
    const filePath = path.join(publicDir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).type('text/plain').send('Not Found');
      return;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  };

  app.get(['/robots.txt', '/Rubiks-Cube-Learner/robots.txt'], sendSeoStaticFile('robots.txt', 'text/plain; charset=utf-8'));
  app.get(['/sitemap.xml', '/Rubiks-Cube-Learner/sitemap.xml'], sendSeoStaticFile('sitemap.xml', 'application/xml; charset=utf-8'));

  const arenaEngine = new ArenaEngine();
  const arenaSockets = new Map<string, WebSocket>();
  const arenaQueuedPuzzle = new Map<string, PuzzleType>();

  app.get('/api/arena/status', (_req, res) => {
    res.json({
      queueCounts: arenaEngine.getQueueCounts(),
      activeRooms: arenaEngine.getActiveRoomCount(),
    });
  });

  let dailyEntries: DailyLeaderboardEntry[] = loadDailyStore();

  const buildDailyPayload = (puzzleType: PuzzleType, clientId?: string) => {
    const nowMs = Date.now();
    const dateKey = getUtcDateKey(new Date(nowMs));
    const scramble = generateDailyScramble(dateKey, puzzleType);
    const matching = dailyEntries.filter(
      (entry) => entry.dateKey === dateKey && entry.puzzleType === puzzleType
    );
    const ranked = rankDailyEntries(matching);
    const userEntry = clientId ? ranked.find((r) => r.clientId === clientId) ?? null : null;

    return {
      dateKey,
      puzzleType,
      scramble,
      nextResetMs: getNextUtcMidnightMs(nowMs),
      totalParticipants: ranked.length,
      leaderboard: ranked.slice(0, 100),
      userEntry,
    };
  };

  // Shared UTC Daily Challenge & Global Leaderboard API
  app.get('/api/daily-challenge', (req, res) => {
    const rawPuzzle = String(req.query.puzzle ?? '3x3') as PuzzleType;
    const puzzleType: PuzzleType = VALID_PUZZLES.has(rawPuzzle) ? rawPuzzle : '3x3';
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.slice(0, 64) : undefined;
    res.json(buildDailyPayload(puzzleType, clientId));
  });

  app.post('/api/daily-challenge/submit', (req, res) => {
    const body = req.body ?? {};
    const puzzleType = body.puzzleType as PuzzleType;
    if (!VALID_PUZZLES.has(puzzleType)) {
      res.status(400).json({ error: 'Invalid puzzle configuration.' });
      return;
    }

    const clientId = typeof body.clientId === 'string' ? body.clientId.trim().slice(0, 64) : '';
    if (clientId.length < 4) {
      res.status(400).json({ error: 'Missing player session identifier.' });
      return;
    }

    const playerName = sanitizePlayerName(String(body.playerName ?? '')) || 'Guest Cuber';
    const timeMs = Math.round(Number(body.timeMs));
    if (!Number.isFinite(timeMs) || timeMs < 100 || timeMs > 3600000) {
      res.status(400).json({ error: 'Solve time must be between 0.10s and 60 minutes.' });
      return;
    }

    const penalty: SolvePenalty = VALID_PENALTIES.has(body.penalty) ? body.penalty : 'none';
    const source: 'stopwatch' | 'virtual3d' = body.source === 'virtual3d' ? 'virtual3d' : 'stopwatch';
    const moves =
      typeof body.moves === 'number' && Number.isFinite(body.moves) && body.moves > 0
        ? Math.min(9999, Math.round(body.moves))
        : undefined;

    const dateKey = getUtcDateKey();
    const existingIdx = dailyEntries.findIndex(
      (e) => e.dateKey === dateKey && e.puzzleType === puzzleType && e.clientId === clientId
    );

    const candidateEffective = getEffectiveTimeMs({ timeMs, penalty });
    let savedEntry: DailyLeaderboardEntry;
    let improved = true;

    if (existingIdx >= 0) {
      const existing = dailyEntries[existingIdx];
      const existingEffective = getEffectiveTimeMs({
        timeMs: existing.timeMs,
        penalty: existing.penalty,
      });

      // Update player's official daily leaderboard slot if faster (or if previous was DNF)
      const isBetter =
        candidateEffective !== null &&
        (existingEffective === null || candidateEffective < existingEffective);

      if (isBetter) {
        savedEntry = {
          ...existing,
          playerName,
          timeMs,
          penalty,
          source,
          moves,
          submittedAt: Date.now(),
        };
        dailyEntries[existingIdx] = savedEntry;
      } else {
        // Still sync updated playerName on existing best entry
        savedEntry = { ...existing, playerName };
        dailyEntries[existingIdx] = savedEntry;
        improved = false;
      }
    } else {
      savedEntry = {
        id: `dc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        dateKey,
        puzzleType,
        clientId,
        playerName,
        timeMs,
        penalty,
        source,
        moves,
        submittedAt: Date.now(),
      };
      dailyEntries.push(savedEntry);
    }

    saveDailyStore(dailyEntries);

    const payload = buildDailyPayload(puzzleType, clientId);
    res.status(201).json({
      ...payload,
      entry: savedEntry,
      improved,
    });
  });

  app.patch('/api/daily-challenge/entry/:id', (req, res) => {
    const entryId = req.params.id;
    const body = req.body ?? {};
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim().slice(0, 64) : '';
    const idx = dailyEntries.findIndex((e) => e.id === entryId && e.clientId === clientId);

    if (idx < 0) {
      res.status(404).json({ error: 'Daily leaderboard entry not found.' });
      return;
    }

    const existing = dailyEntries[idx];
    const nextPenalty: SolvePenalty = VALID_PENALTIES.has(body.penalty)
      ? body.penalty
      : existing.penalty;
    const nextName =
      typeof body.playerName === 'string' && sanitizePlayerName(body.playerName).length >= 2
        ? sanitizePlayerName(body.playerName)
        : existing.playerName;

    const updated: DailyLeaderboardEntry = {
      ...existing,
      penalty: nextPenalty,
      playerName: nextName,
    };
    dailyEntries[idx] = updated;
    saveDailyStore(dailyEntries);

    res.json({
      ...buildDailyPayload(existing.puzzleType, clientId),
      entry: updated,
    });
  });

  // Deep-reasoning Rubik's Cube Solve Coach endpoint
  app.post('/api/coach/analyze', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
        res.status(503).json({
          error:
            'Deep Solve Coach requires a Gemini API key in Settings > Secrets. You can still use the built-in step-by-step interactive lessons, hints, and auto-solver offline.',
        });
        return;
      }

      const { question, puzzleType, moveHistory, nextHint, isSolved } = req.body ?? {};
      if (typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Please enter a cubing question or topic to analyze.' });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction = [
        'You are a world-class speedcubing coach and twisty-puzzle educator.',
        'Explain Rubik\'s Cube concepts, WCA notation, algorithms, fingertricks, lookahead, and parity clearly and concisely.',
        'Keep responses structured in short, scannable paragraphs or numbered steps under 220 words.',
        'When writing move sequences, use crisp WCA notation (e.g., R U R\' U\') and explain the visual intuition behind why the moves work.',
      ].join(' ');

      const contextLines = [
        `Active Puzzle: ${String(puzzleType ?? '3x3')}`,
        `Current State: ${isSolved ? 'Solved' : 'Scrambled / In Progress'}`,
        Array.isArray(moveHistory) && moveHistory.length > 0
          ? `Recent Moves: ${moveHistory.slice(-16).join(' ')}`
          : 'Recent Moves: None',
        nextHint ? `Recommended Next Move: ${String(nextHint)}` : '',
        '',
        `Learner Question: ${question.trim()}`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextLines,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
          },
        },
      });

      const answer = response.text?.trim();
      if (!answer) {
        res.status(502).json({ error: 'Coach returned an empty response. Please try again.' });
        return;
      }

      res.json({ answer });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to reach Solve Coach right now.';
      const status =
        message.includes('API_KEY_INVALID') || message.includes('400')
          ? 400
          : message.includes('PERMISSION_DENIED') || message.includes('403')
            ? 403
            : message.includes('RESOURCE_EXHAUSTED') || message.includes('429')
              ? 429
              : 500;
      res.status(status).json({ error: message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/Rubiks-Cube-Learner', express.static(distPath));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Avoid soft-404 HTML responses for missing static files (e.g., .xml, .txt, .png, .js, .css)
      if (/\.[a-z0-9]{2,6}$/i.test(req.path) && !req.path.endsWith('.html')) {
        res.status(404).type('text/plain').send('Not Found');
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const arenaWss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const sendWs = (ws: WebSocket | undefined, payload: ArenaServerMessage) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // ignore transient socket write errors
    }
  };

  const broadcastRoom = (room: ArenaRoomSnapshot, event: ArenaRoomEventKind = 'updated') => {
    for (const p of room.players) {
      sendWs(arenaSockets.get(p.playerId), {
        type: 'room:state',
        room,
        event,
      });
    }
  };

  const broadcastQueueCounts = () => {
    const queueCounts = arenaEngine.getQueueCounts();
    for (const [pid, puzzle] of arenaQueuedPuzzle.entries()) {
      sendWs(arenaSockets.get(pid), {
        type: 'queue:status',
        queued: true,
        puzzleType: puzzle,
        queueSize: queueCounts[puzzle] ?? 0,
        queueCounts,
      });
    }
  };

  const VALID_SIGNAL_TYPES = new Set(['offer', 'answer', 'ice']);
  const VALID_TIMER_PHASES = new Set(['idle', 'holding', 'armed', 'running']);

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (
        reqUrl.pathname === '/ws/arena' ||
        reqUrl.pathname === '/Rubiks-Cube-Learner/ws/arena'
      ) {
        arenaWss.handleUpgrade(request, socket, head, (ws) => {
          arenaWss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  // Periodic WebSocket liveness check to clean up dropped sockets
  const heartbeatInterval = setInterval(() => {
    for (const ws of arenaWss.clients) {
      const tracked = ws as WebSocket & { isAlive?: boolean };
      if (tracked.isAlive === false) {
        ws.terminate();
        continue;
      }
      tracked.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore
      }
    }
  }, 30000);

  arenaWss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  arenaWss.on('connection', (ws) => {
    const tracked = ws as WebSocket & { isAlive?: boolean };
    tracked.isAlive = true;
    ws.on('pong', () => {
      tracked.isAlive = true;
    });

    const playerId = crypto.randomUUID();
    arenaSockets.set(playerId, ws);

    sendWs(ws, {
      type: 'welcome',
      playerId,
      queueCounts: arenaEngine.getQueueCounts(),
      activeRooms: arenaEngine.getActiveRoomCount(),
    });

    ws.on('message', (raw) => {
      let msg: ArenaClientMessage;
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
          sendWs(ws, { type: 'error', code: 'INVALID_PAYLOAD', message: 'Malformed message.' });
          return;
        }
        msg = parsed as ArenaClientMessage;
      } catch {
        sendWs(ws, { type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON payload.' });
        return;
      }

      switch (msg.type) {
        case 'ping': {
          sendWs(ws, { type: 'pong', serverTimeMs: Date.now() });
          break;
        }

        case 'room:create': {
          const puzzle = VALID_ARENA_PUZZLES.has(msg.puzzleType) ? msg.puzzleType : '3x3';
          arenaQueuedPuzzle.delete(playerId);
          const res = arenaEngine.createPrivateRoom(playerId, puzzle, {
            name: String(msg.name ?? ''),
            camEnabled: Boolean(msg.camEnabled),
            micEnabled: Boolean(msg.micEnabled),
          });
          if (!res.ok) {
            sendWs(ws, { type: 'error', code: res.code, message: res.message });
            return;
          }
          if (res.data.affectedPreviousRoom) {
            broadcastRoom(res.data.affectedPreviousRoom, 'opponent_left');
          }
          broadcastRoom(res.data.room, 'created');
          broadcastQueueCounts();
          break;
        }

        case 'room:join': {
          arenaQueuedPuzzle.delete(playerId);
          const res = arenaEngine.joinPrivateRoom(playerId, String(msg.roomCode ?? ''), {
            name: String(msg.name ?? ''),
            camEnabled: Boolean(msg.camEnabled),
            micEnabled: Boolean(msg.micEnabled),
          });
          if (!res.ok) {
            sendWs(ws, { type: 'error', code: res.code, message: res.message });
            return;
          }
          if (res.data.affectedPreviousRoom) {
            broadcastRoom(res.data.affectedPreviousRoom, 'opponent_left');
          }
          broadcastRoom(res.data.room, 'joined');
          broadcastQueueCounts();
          break;
        }

        case 'room:leave': {
          const left = arenaEngine.leaveRoom(playerId);
          sendWs(ws, { type: 'room:left', reason: 'left' });
          if (left.remainingRoom) {
            broadcastRoom(left.remainingRoom, 'opponent_left');
          }
          break;
        }

        case 'matchmaking:join': {
          const puzzle = VALID_ARENA_PUZZLES.has(msg.puzzleType) ? msg.puzzleType : '3x3';
          const res = arenaEngine.joinMatchmaking(playerId, puzzle, {
            name: String(msg.name ?? ''),
            camEnabled: Boolean(msg.camEnabled),
            micEnabled: Boolean(msg.micEnabled),
          });
          if (res.affectedPreviousRoom) {
            broadcastRoom(res.affectedPreviousRoom, 'opponent_left');
          }
          if (res.matched) {
            arenaQueuedPuzzle.delete(playerId);
            arenaQueuedPuzzle.delete(res.peerId);
            broadcastRoom(res.room, 'matched');
            broadcastQueueCounts();
          } else {
            arenaQueuedPuzzle.set(playerId, res.puzzleType);
            broadcastQueueCounts();
          }
          break;
        }

        case 'matchmaking:leave': {
          arenaEngine.leaveMatchmaking(playerId);
          arenaQueuedPuzzle.delete(playerId);
          sendWs(ws, {
            type: 'queue:status',
            queued: false,
            puzzleType: null,
            queueSize: 0,
            queueCounts: arenaEngine.getQueueCounts(),
          });
          broadcastQueueCounts();
          break;
        }

        case 'media:status': {
          const updated = arenaEngine.updateMediaStatus(
            playerId,
            Boolean(msg.camEnabled),
            Boolean(msg.micEnabled)
          );
          if (updated) {
            broadcastRoom(updated, 'updated');
          }
          break;
        }

        case 'timer:phase': {
          if (!VALID_TIMER_PHASES.has(msg.phase)) return;
          const res = arenaEngine.updateTimerPhase(playerId, msg.phase);
          if (res.ok) {
            broadcastRoom(res.data, 'updated');
          }
          break;
        }

        case 'timer:finish': {
          const penalty =
            msg.penalty && VALID_ARENA_PENALTIES.has(msg.penalty) ? msg.penalty : 'none';
          const res = arenaEngine.finishTimer(playerId, Number(msg.timeMs), penalty);
          if (!res.ok) {
            sendWs(ws, { type: 'error', code: res.code, message: res.message });
            return;
          }
          broadcastRoom(res.data, 'updated');
          break;
        }

        case 'timer:penalty': {
          if (!VALID_ARENA_PENALTIES.has(msg.penalty)) return;
          const res = arenaEngine.updatePenalty(
            playerId,
            msg.penalty,
            typeof msg.roundNumber === 'number' ? msg.roundNumber : undefined
          );
          if (res.ok) {
            broadcastRoom(res.data, 'updated');
          }
          break;
        }

        case 'round:next': {
          const res = arenaEngine.advanceRound(playerId);
          if (!res.ok) {
            sendWs(ws, { type: 'error', code: res.code, message: res.message });
            return;
          }
          broadcastRoom(res.data, 'next_round');
          break;
        }

        case 'room:puzzle': {
          if (!VALID_ARENA_PUZZLES.has(msg.puzzleType)) return;
          const res = arenaEngine.changeRoomPuzzle(playerId, msg.puzzleType);
          if (!res.ok) {
            sendWs(ws, { type: 'error', code: res.code, message: res.message });
            return;
          }
          broadcastRoom(res.data, 'next_round');
          break;
        }

        case 'webrtc:signal': {
          if (!VALID_SIGNAL_TYPES.has(msg.signalType)) return;
          if (msg.payload !== null && typeof msg.payload !== 'object') return;
          // Strictly isolate WebRTC signaling to the verified peer seated in the sender's room
          const peerId = arenaEngine.getPeerPlayerId(playerId);
          if (!peerId) return;
          sendWs(arenaSockets.get(peerId), {
            type: 'webrtc:signal',
            fromPlayerId: playerId,
            signalType: msg.signalType,
            payload: msg.payload,
          });
          break;
        }

        default:
          sendWs(ws, { type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Unknown message type.' });
      }
    });

    ws.on('close', () => {
      arenaSockets.delete(playerId);
      arenaQueuedPuzzle.delete(playerId);
      const disc = arenaEngine.disconnectPlayer(playerId);
      if (disc.remainingRoom) {
        broadcastRoom(disc.remainingRoom, 'opponent_left');
      }
      if (disc.removedFromQueue) {
        broadcastQueueCounts();
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Kubi Studio running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
