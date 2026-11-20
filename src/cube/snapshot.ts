import type { PuzzleType } from './types';

export interface SnapshotDimensions {
  width: number;
  height: number;
}

export const DEFAULT_SNAPSHOT_WIDTH = 2400;
export const DEFAULT_SNAPSHOT_HEIGHT = 1800;

/**
 * Computes safe high-resolution export dimensions bounded by the WebGL context's
 * maximum renderbuffer size while preserving the target aspect ratio.
 */
export function computeSnapshotDimensions(params?: {
  targetWidth?: number;
  targetHeight?: number;
  maxRenderbufferSize?: number;
}): SnapshotDimensions {
  const rawW = params?.targetWidth ?? DEFAULT_SNAPSHOT_WIDTH;
  const rawH = params?.targetHeight ?? DEFAULT_SNAPSHOT_HEIGHT;
  const maxDim = Math.max(512, Math.floor(params?.maxRenderbufferSize ?? 4096));

  const safeW = Math.max(640, Math.round(Number.isFinite(rawW) ? rawW : DEFAULT_SNAPSHOT_WIDTH));
  const safeH = Math.max(480, Math.round(Number.isFinite(rawH) ? rawH : DEFAULT_SNAPSHOT_HEIGHT));

  const largest = Math.max(safeW, safeH);
  if (largest <= maxDim) {
    return { width: safeW, height: safeH };
  }

  const scale = maxDim / largest;
  return {
    width: Math.max(640, Math.floor(safeW * scale)),
    height: Math.max(480, Math.floor(safeH * scale)),
  };
}

/**
 * Slugifies a theme name cleanly for cross-platform download filenames.
 */
export function slugifySnapshotSegment(input: string, fallback = 'studio'): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || fallback;
}

/**
 * Builds a descriptive, deterministic PNG filename reflecting the puzzle, theme, and UTC timestamp.
 */
export function buildSnapshotFilename(params: {
  puzzleType: PuzzleType;
  themeName: string;
  date?: Date;
}): string {
  const d = params.date ?? new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');

  const puzzleSlug = slugifySnapshotSegment(params.puzzleType, 'cube');
  const themeSlug = slugifySnapshotSegment(params.themeName, 'theme');
  return `kubi-${puzzleSlug}-${themeSlug}-${yyyy}${mm}${dd}-${hh}${min}.png`;
}

/**
 * Triggers a browser file download for a PNG data URL.
 */
export function triggerPngDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
