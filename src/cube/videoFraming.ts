export interface FrameDimensions {
  width: number;
  height: number;
}

export const DEFAULT_FALLBACK_MAX_DIMENSION = 320;

/**
 * Computes aspect-ratio-preserving canvas dimensions for WebSocket video frame relay.
 * Prevents portrait mobile cameras (e.g. 360x640) from being squashed into 16:9
 * and horizontally stretched on the opponent's screen.
 */
export function computeAspectPreservedFrameSize(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number = DEFAULT_FALLBACK_MAX_DIMENSION
): FrameDimensions {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0
  ) {
    return { width: 320, height: 180 };
  }

  const safeMax = Math.max(64, Math.round(maxDimension));
  const longest = Math.max(srcWidth, srcHeight);
  const scale = longest > safeMax ? safeMax / longest : 1;

  // Round to even integers >= 2 for clean JPEG macroblock encoding
  const toEven = (v: number) => Math.max(2, Math.round(v / 2) * 2);

  return {
    width: toEven(srcWidth * scale),
    height: toEven(srcHeight * scale),
  };
}

/**
 * Returns true when a video/image frame is portrait (taller than wide).
 */
export function isPortraitFrame(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  return height > width * 1.05;
}
