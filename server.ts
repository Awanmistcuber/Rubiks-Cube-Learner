import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kubi Studio running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
