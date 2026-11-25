export interface BackendUrlEnv {
  VITE_BACKEND_URL?: string;
  VITE_ARENA_WS_URL?: string;
}

export interface BrowserLocationLike {
  protocol: string;
  host: string;
  hostname: string;
  origin: string;
}

export interface ResolvedBackendConfig {
  /** Base HTTP(S) origin for /api/* calls (empty string means same-origin relative paths) */
  apiBaseUrl: string;
  /** Full ws:// or wss:// WebSocket URL for /ws/arena, or null if static host has no backend configured */
  arenaWsUrl: string | null;
  /** Full HTTP(S) URL for /api/health wake-up ping, or null if unavailable */
  healthUrl: string | null;
  /** True when frontend connects to a separate cross-origin backend (e.g. Render from GitHub Pages) */
  isExternalBackend: boolean;
  /** True when hosted on a static-only host (like *.github.io) without VITE_BACKEND_URL / VITE_ARENA_WS_URL */
  needsExternalBackend: boolean;
}

const STATIC_ONLY_HOST_PATTERNS = [/\.github\.io$/i, /\.gitlab\.io$/i];

function normalizeHttpOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeWsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    } else if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/ws/arena';
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isStaticOnlyHost(hostname: string): boolean {
  return STATIC_ONLY_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function resolveBackendConfig(
  env: BackendUrlEnv,
  loc: BrowserLocationLike
): ResolvedBackendConfig {
  const configuredHttpOrigin = normalizeHttpOrigin(env.VITE_BACKEND_URL);
  const configuredWsUrl = normalizeWsUrl(env.VITE_ARENA_WS_URL);

  if (configuredHttpOrigin || configuredWsUrl) {
    const derivedHttpFromWs = configuredWsUrl
      ? (() => {
          const u = new URL(configuredWsUrl);
          return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}`;
        })()
      : '';

    const apiBaseUrl = configuredHttpOrigin ?? derivedHttpFromWs;
    const arenaWsUrl =
      configuredWsUrl ??
      (() => {
        const u = new URL(configuredHttpOrigin!);
        const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProto}//${u.host}/ws/arena`;
      })();

    const isExternalBackend = Boolean(apiBaseUrl && apiBaseUrl !== loc.origin);

    return {
      apiBaseUrl,
      arenaWsUrl,
      healthUrl: apiBaseUrl ? `${apiBaseUrl}/api/health` : '/api/health',
      isExternalBackend,
      needsExternalBackend: false,
    };
  }

  // No explicit backend URL configured: static hosts like GitHub Pages cannot serve WebSockets
  if (isStaticOnlyHost(loc.hostname)) {
    return {
      apiBaseUrl: '',
      arenaWsUrl: null,
      healthUrl: null,
      isExternalBackend: false,
      needsExternalBackend: true,
    };
  }

  // Same-origin full-stack hosting (local dev server, Render full-stack, Cloud Run / AI Studio)
  const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    apiBaseUrl: '',
    arenaWsUrl: `${wsProtocol}//${loc.host}/ws/arena`,
    healthUrl: '/api/health',
    isExternalBackend: false,
    needsExternalBackend: false,
  };
}

function getRuntimeEnv(): BackendUrlEnv {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return {
    VITE_BACKEND_URL: metaEnv?.VITE_BACKEND_URL,
    VITE_ARENA_WS_URL: metaEnv?.VITE_ARENA_WS_URL,
  };
}

function getRuntimeLocation(): BrowserLocationLike {
  if (typeof window === 'undefined') {
    return {
      protocol: 'http:',
      host: 'localhost:3000',
      hostname: 'localhost',
      origin: 'http://localhost:3000',
    };
  }
  return {
    protocol: window.location.protocol,
    host: window.location.host,
    hostname: window.location.hostname,
    origin: window.location.origin,
  };
}

export function getBackendConfig(): ResolvedBackendConfig {
  return resolveBackendConfig(getRuntimeEnv(), getRuntimeLocation());
}

export function buildApiUrl(apiPath: string): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const { apiBaseUrl } = getBackendConfig();
  return apiBaseUrl ? `${apiBaseUrl}${normalizedPath}` : normalizedPath;
}

export function buildArenaWsUrl(): string | null {
  return getBackendConfig().arenaWsUrl;
}

export function buildBackendHealthUrl(): string | null {
  return getBackendConfig().healthUrl;
}

/**
 * Parses a comma-separated ALLOWED_ORIGINS string into normalized origins (scheme + host + optional port).
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const results: string[] = [];
  for (const part of raw.split(',')) {
    const origin = normalizeHttpOrigin(part);
    if (origin && !results.includes(origin)) {
      results.push(origin);
    }
  }
  return results;
}

/**
 * Validates whether an incoming browser Origin header is allowed for CORS or WebSocket upgrade.
 * - Requests without an Origin header (e.g. curl health checks, server-to-server) are allowed.
 * - Same-host requests (Origin host matches request Host / X-Forwarded-Host) are always allowed.
 * - Local development origins (localhost / 127.0.0.1) are allowed when not explicitly blocked.
 * - Cross-origin requests must match the configured ALLOWED_ORIGINS list.
 */
export function isOriginAllowed(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
  requestHost?: string
): boolean {
  if (!originHeader) return true;
  let parsed: URL;
  try {
    parsed = new URL(originHeader);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Same-origin match against Host or X-Forwarded-Host
  if (requestHost) {
    const cleanHost = requestHost.split(',')[0].trim().toLowerCase();
    if (parsed.host.toLowerCase() === cleanHost) {
      return true;
    }
  }

  // Explicit configured allowlist (e.g. https://awanmistcuber.github.io)
  if (allowedOrigins.includes(parsed.origin)) {
    return true;
  }

  // Allow localhost / loopback development origins when running locally
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
    return true;
  }

  return false;
}
