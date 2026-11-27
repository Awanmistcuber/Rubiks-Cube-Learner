import type {
  CubeWorkerRequest,
  CubeWorkerResponse,
  SampleAndClassifyResult,
} from './cubeCompute.worker';
import {
  classifyRgbToWcaFace,
  computeBasicAlgorithmHints,
  recalibrateScannedFaces,
  sampleGridFromRgba,
  type ColorCalibration,
  type ScannedFaces,
  type ScannedRgbFaces,
  type SmartHintOption,
} from './cubeScanner';
import { solveCubeWithMethod, type MethodSolvePlan } from './methodSolver';
import type { CubeMove, CubieState, PuzzleType, SolveMethodId } from './types';

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

let sharedWorker: Worker | null = null;
let workerDisabled = false;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest<unknown>>();

function rejectAllPending(reason: Error) {
  for (const [, entry] of pendingRequests) {
    entry.reject(reason);
  }
  pendingRequests.clear();
}

function getWorker(): Worker | null {
  if (workerDisabled || typeof Worker === 'undefined') {
    return null;
  }
  if (sharedWorker) {
    return sharedWorker;
  }
  try {
    const worker = new Worker(new URL('./cubeCompute.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<CubeWorkerResponse>) => {
      const msg = event.data;
      const pending = pendingRequests.get(msg.id);
      if (!pending) return;
      pendingRequests.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error));
      }
    };
    worker.onerror = () => {
      // Gracefully fall back to synchronous computation if worker fails to load or crashes
      workerDisabled = true;
      sharedWorker = null;
      worker.terminate();
      rejectAllPending(new Error('Cube worker error; falling back to local execution'));
    };
    sharedWorker = worker;
    return worker;
  } catch {
    workerDisabled = true;
    return null;
  }
}

function postToWorker<T>(
  request: CubeWorkerRequest,
  transfer: Transferable[] = []
): Promise<T> | null {
  const worker = getWorker();
  if (!worker) return null;
  return new Promise<T>((resolve, reject) => {
    pendingRequests.set(request.id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    try {
      worker.postMessage(request, transfer);
    } catch (err) {
      pendingRequests.delete(request.id);
      reject(err instanceof Error ? err : new Error('Failed to post message to cube worker'));
    }
  });
}

/**
 * Offloads Rubik's Cube method solving (CFOP, Beginner, Roux, ZZ) to the background Web Worker
 * with transparent synchronous fallback when Web Workers are unavailable.
 */
export async function solveCubeWithMethodAsync(
  cubies: CubieState[],
  methodId: SolveMethodId,
  puzzleType: PuzzleType,
  fallbackHistory: CubeMove[] = []
): Promise<MethodSolvePlan> {
  const id = nextRequestId++;
  const promise = postToWorker<MethodSolvePlan>({
    id,
    type: 'solveMethod',
    cubies,
    methodId,
    puzzleType,
    fallbackHistory,
  });
  if (!promise) {
    return solveCubeWithMethod(cubies, methodId, puzzleType, fallbackHistory);
  }
  try {
    return await promise;
  } catch {
    return solveCubeWithMethod(cubies, methodId, puzzleType, fallbackHistory);
  }
}

/**
 * Offloads all 4 local Smart Hint algorithm solves (CFOP, Beginner, Roux, ZZ) to the Web Worker,
 * eliminating multi-second main-thread blocks when analyzing a scanned physical cube.
 */
export async function computeBasicAlgorithmHintsAsync(
  cubies: CubieState[]
): Promise<SmartHintOption[]> {
  const id = nextRequestId++;
  const promise = postToWorker<SmartHintOption[]>({
    id,
    type: 'computeSmartHints',
    cubies,
  });
  if (!promise) {
    return computeBasicAlgorithmHints(cubies);
  }
  try {
    return await promise;
  } catch {
    return computeBasicAlgorithmHints(cubies);
  }
}

/**
 * Offloads 3x3 reticle pixel sampling and CIELAB/HSV sticker color classification to the Web Worker.
 * Transfers the underlying ArrayBuffer (zero-copy) when possible.
 */
export async function sampleAndClassifyFaceAsync(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  reticleScale: number,
  calibration?: ColorCalibration
): Promise<SampleAndClassifyResult> {
  const worker = getWorker();
  if (!worker) {
    const rgbs = sampleGridFromRgba(rgbaData, width, height, reticleScale);
    const facesGrid = rgbs.map((rgb) => classifyRgbToWcaFace(rgb, calibration));
    return { rgbs, facesGrid };
  }

  // Copy into a standalone ArrayBuffer only if rgbaData is a sub-view, otherwise transfer directly
  const isFullBuffer =
    rgbaData.byteOffset === 0 && rgbaData.byteLength === rgbaData.buffer.byteLength;
  const rgbaBuffer = isFullBuffer
    ? (rgbaData.buffer as ArrayBuffer)
    : rgbaData.slice().buffer;

  const id = nextRequestId++;
  const promise = postToWorker<SampleAndClassifyResult>(
    {
      id,
      type: 'sampleAndClassifyFace',
      rgbaBuffer,
      width,
      height,
      reticleScale,
      calibration,
    },
    [rgbaBuffer]
  );

  if (!promise) {
    const fallbackView = new Uint8ClampedArray(rgbaBuffer);
    const rgbs = sampleGridFromRgba(fallbackView, width, height, reticleScale);
    const facesGrid = rgbs.map((rgb) => classifyRgbToWcaFace(rgb, calibration));
    return { rgbs, facesGrid };
  }

  return promise;
}

/**
 * Offloads dynamic Von Kries white-balance & bounded-margin global sticker recalibration
 * to the background Web Worker.
 */
export async function recalibrateScannedFacesAsync(
  rgbFaces: ScannedRgbFaces,
  currentFaces: ScannedFaces
): Promise<ScannedFaces> {
  const id = nextRequestId++;
  const promise = postToWorker<ScannedFaces>({
    id,
    type: 'recalibrateFaces',
    rgbFaces,
    currentFaces,
  });
  if (!promise) {
    return recalibrateScannedFaces(rgbFaces, currentFaces);
  }
  try {
    return await promise;
  } catch {
    return recalibrateScannedFaces(rgbFaces, currentFaces);
  }
}

export function terminateCubeComputeWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
  rejectAllPending(new Error('Cube compute worker terminated'));
}
