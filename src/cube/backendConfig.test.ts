import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOriginAllowed,
  parseAllowedOrigins,
  resolveBackendConfig,
} from './backendConfig.ts';

test('resolveBackendConfig uses same-origin WS/API on localhost and full-stack hosts', () => {
  const local = resolveBackendConfig(
    {},
    {
      protocol: 'http:',
      host: 'localhost:3000',
      hostname: 'localhost',
      origin: 'http://localhost:3000',
    }
  );
  assert.equal(local.apiBaseUrl, '');
  assert.equal(local.arenaWsUrl, 'ws://localhost:3000/ws/arena');
  assert.equal(local.healthUrl, '/api/health');
  assert.equal(local.isExternalBackend, false);
  assert.equal(local.needsExternalBackend, false);

  const cloudRun = resolveBackendConfig(
    {},
    {
      protocol: 'https:',
      host: 'kubi-studio.run.app',
      hostname: 'kubi-studio.run.app',
      origin: 'https://kubi-studio.run.app',
    }
  );
  assert.equal(cloudRun.arenaWsUrl, 'wss://kubi-studio.run.app/ws/arena');
  assert.equal(cloudRun.needsExternalBackend, false);
});

test('resolveBackendConfig connects GitHub Pages statically to configured Render backend', () => {
  const cfg = resolveBackendConfig(
    { VITE_BACKEND_URL: 'https://kubi-studio-arena.onrender.com/' },
    {
      protocol: 'https:',
      host: 'awanmistcuber.github.io',
      hostname: 'awanmistcuber.github.io',
      origin: 'https://awanmistcuber.github.io',
    }
  );
  assert.equal(cfg.apiBaseUrl, 'https://kubi-studio-arena.onrender.com');
  assert.equal(cfg.arenaWsUrl, 'wss://kubi-studio-arena.onrender.com/ws/arena');
  assert.equal(cfg.healthUrl, 'https://kubi-studio-arena.onrender.com/api/health');
  assert.equal(cfg.isExternalBackend, true);
  assert.equal(cfg.needsExternalBackend, false);
});

test('resolveBackendConfig flags unconfigured GitHub Pages host and rejects unsafe URL schemes', () => {
  const ghLoc = {
    protocol: 'https:',
    host: 'awanmistcuber.github.io',
    hostname: 'awanmistcuber.github.io',
    origin: 'https://awanmistcuber.github.io',
  };

  const unconfigured = resolveBackendConfig({}, ghLoc);
  assert.equal(unconfigured.arenaWsUrl, null);
  assert.equal(unconfigured.needsExternalBackend, true);

  const unsafe = resolveBackendConfig(
    { VITE_BACKEND_URL: 'javascript:alert(1)', VITE_ARENA_WS_URL: 'data:text/html,boom' },
    ghLoc
  );
  assert.equal(unsafe.arenaWsUrl, null);
  assert.equal(unsafe.needsExternalBackend, true);
});

test('resolveBackendConfig supports explicit VITE_ARENA_WS_URL override', () => {
  const cfg = resolveBackendConfig(
    {
      VITE_BACKEND_URL: 'https://api.example.com',
      VITE_ARENA_WS_URL: 'wss://ws.example.com/custom-ws',
    },
    {
      protocol: 'https:',
      host: 'awanmistcuber.github.io',
      hostname: 'awanmistcuber.github.io',
      origin: 'https://awanmistcuber.github.io',
    }
  );
  assert.equal(cfg.apiBaseUrl, 'https://api.example.com');
  assert.equal(cfg.arenaWsUrl, 'wss://ws.example.com/custom-ws');
  assert.equal(cfg.isExternalBackend, true);
});

test('parseAllowedOrigins and isOriginAllowed enforce strict cross-origin validation', () => {
  const allowed = parseAllowedOrigins(
    'https://awanmistcuber.github.io/Rubiks-Cube-Learner/, https://custom.example.com, javascript:bad'
  );
  assert.deepEqual(allowed, ['https://awanmistcuber.github.io', 'https://custom.example.com']);

  // Allowed GitHub Pages origin
  assert.equal(
    isOriginAllowed('https://awanmistcuber.github.io', allowed, 'kubi-studio-arena.onrender.com'),
    true
  );
  // Same-host request
  assert.equal(
    isOriginAllowed('https://kubi-studio-arena.onrender.com', allowed, 'kubi-studio-arena.onrender.com'),
    true
  );
  // Unknown third-party site rejected
  assert.equal(
    isOriginAllowed('https://evil-phish.example.net', allowed, 'kubi-studio-arena.onrender.com'),
    false
  );
  // Local dev allowed
  assert.equal(
    isOriginAllowed('http://localhost:3000', allowed, 'kubi-studio-arena.onrender.com'),
    true
  );
  // Non-browser health check (no Origin header) allowed
  assert.equal(isOriginAllowed(undefined, allowed, 'kubi-studio-arena.onrender.com'), true);
});
