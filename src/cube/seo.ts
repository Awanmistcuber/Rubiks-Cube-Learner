import type { PuzzleType } from './types';

export type SeoViewId = 'home' | 'tutorials' | 'timer' | 'solver' | 'daily';

export interface SeoMetadata {
  view: SeoViewId;
  title: string;
  description: string;
  canonicalUrl: string;
}

export interface InitialSeoRoute {
  view: SeoViewId;
  puzzle?: PuzzleType;
  autoStart: boolean;
}

export const SITE_CANONICAL_BASE = 'https://awanmistcuber.github.io/Rubiks-Cube-Learner/';

const VALID_VIEWS = new Set<SeoViewId>(['home', 'tutorials', 'timer', 'solver', 'daily']);
const VALID_PUZZLES = new Set<PuzzleType>(['2x2', '3x3', '4x4', 'mirror']);

const VIEW_METADATA: Record<SeoViewId, { title: string; description: string }> = {
  home: {
    title: "Kubi Studio – 3D Rubik's Cube Tutorials, Solver & Timer",
    description:
      "Master speedcubing with interactive 3D Rubik's Cube tutorials (Beginner, CFOP, Roux, ZZ), a WCA timer, live move tracker, and 2x2, 3x3, 4x4 & Mirror cubes.",
  },
  tutorials: {
    title: "Rubik's Cube Tutorials – CFOP, Roux, ZZ & Beginner Guide",
    description:
      "Learn how to solve a Rubik's Cube step by step with 3D visual guide arrows, green/red move tracking, and interactive Beginner, CFOP, Roux & ZZ tutorials.",
  },
  timer: {
    title: 'Speedcubing Timer, WCA Scrambles & Ao5/Ao12 Stats – Kubi',
    description:
      'Practice speedcubing with a WCA-style cube timer, +2/DNF penalties, Ao5 & Ao12 averages, 20-solve analytics graphs, and instant 3D scramble sync.',
  },
  solver: {
    title: "3D Rubik's Cube Solver – CFOP, Roux, ZZ & Beginner Flow",
    description:
      "Watch any scrambled 3x3 Rubik's Cube solved step by step using CFOP, Roux, ZZ/ZOLL, or Beginner methods with a live stage flow stepper and 3D move hints.",
  },
  daily: {
    title: "Daily Rubik's Cube Scramble & Leaderboard – Kubi Studio",
    description:
      'Compete on the official daily UTC speedcubing scramble for 2x2, 3x3, 4x4, and Mirror cubes using the built-in stopwatch or interactive 3D cube.',
  },
};

/**
 * Parses URL search parameters into a clean initial Studio view & puzzle target.
 */
export function parseInitialSeoRoute(search: string): InitialSeoRoute {
  const params = new URLSearchParams(search);
  const rawView = (params.get('view') ?? 'home').toLowerCase() as SeoViewId;
  const view: SeoViewId = VALID_VIEWS.has(rawView) ? rawView : 'home';

  const rawPuzzle = (params.get('puzzle') ?? '').toLowerCase() as PuzzleType;
  const puzzle = VALID_PUZZLES.has(rawPuzzle) ? rawPuzzle : undefined;

  const autoStart = params.get('autostart') === '1' || view !== 'home';
  return { view, puzzle, autoStart };
}

/**
 * Builds a clean, self-referencing canonical URL that strips tracking parameters
 * (utm_*, fbclid, autostart) while preserving indexable studio views.
 */
export function resolveCanonicalUrl(
  origin: string,
  pathname: string,
  view: SeoViewId
): string {
  const safeOrigin = origin && origin.startsWith('http') ? origin.replace(/\/+$/, '') : '';
  const cleanPath = pathname
    ? pathname.endsWith('/')
      ? pathname
      : `${pathname}/`
    : '/';

  const base = safeOrigin ? `${safeOrigin}${cleanPath}` : SITE_CANONICAL_BASE;
  if (view === 'home') return base;
  return `${base}?view=${encodeURIComponent(view)}`;
}

/**
 * Returns SEO metadata (title, description, canonicalUrl) for a given studio view.
 */
export function getSeoMetadataForView(
  view: SeoViewId,
  origin?: string,
  pathname?: string
): SeoMetadata {
  const entry = VIEW_METADATA[view] ?? VIEW_METADATA.home;
  const canonicalUrl = resolveCanonicalUrl(origin ?? '', pathname ?? '', view);
  return {
    view,
    title: entry.title,
    description: entry.description,
    canonicalUrl,
  };
}

/**
 * Builds a relative href for crawlable internal navigation links (works cleanly on both
 * GitHub Pages subpath deployments and root Cloud Run deployments).
 */
export function buildInternalViewHref(view: SeoViewId): string {
  if (view === 'home') return './';
  return `./?view=${encodeURIComponent(view)}`;
}

/**
 * Synchronizes document <title>, meta description, OpenGraph, Twitter Cards, and <link rel="canonical">
 * in client-side SPA transitions for consistent search engine indexing.
 */
export function syncDocumentSeo(view: SeoViewId): SeoMetadata {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const meta = getSeoMetadataForView(view, origin, pathname);

  if (typeof document === 'undefined') return meta;

  document.title = meta.title;

  const upsertMeta = (attr: 'name' | 'property', key: string, content: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  upsertMeta('name', 'description', meta.description);
  upsertMeta('property', 'og:title', meta.title);
  upsertMeta('property', 'og:description', meta.description);
  upsertMeta('property', 'og:url', meta.canonicalUrl);
  upsertMeta('name', 'twitter:title', meta.title);
  upsertMeta('name', 'twitter:description', meta.description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', meta.canonicalUrl);

  return meta;
}
