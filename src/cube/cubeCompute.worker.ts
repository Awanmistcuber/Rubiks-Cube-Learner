import {
  classifyRgbToWcaFace,
  computeBasicAlgorithmHints,
  recalibrateScannedFaces,
  sampleGridFromRgba,
  type ColorCalibration,
  type RgbTriplet,
  type ScannedFaces,
  type ScannedRgbFaces,
  type SmartHintOption,
  type WcaFace,
} from './cubeScanner';
import { solveCubeWithMethod, type MethodSolvePlan } from './methodSolver';
import type { CubeMove, CubieState, PuzzleType, SolveMethodId } from './types';

export type CubeWorkerRequest =
  | {
      id: number;
      type: 'solveMethod';
      cubies: CubieState[];
      methodId: SolveMethodId;
      puzzleType: PuzzleType;
      fallbackHistory: CubeMove[];
    }
  | {
      id: number;
      type: 'computeSmartHints';
      cubies: CubieState[];
    }
  | {
      id: number;
      type: 'sampleAndClassifyFace';
      rgbaBuffer: ArrayBuffer;
      width: number;
      height: number;
      reticleScale: number;
      calibration?: ColorCalibration;
    }
  | {
      id: number;
      type: 'recalibrateFaces';
      rgbFaces: ScannedRgbFaces;
      currentFaces: ScannedFaces;
    };

export interface SampleAndClassifyResult {
  rgbs: RgbTriplet[];
  facesGrid: WcaFace[];
}

export type CubeWorkerResponse =
  | { id: number; ok: true; type: 'solveMethod'; result: MethodSolvePlan }
  | { id: number; ok: true; type: 'computeSmartHints'; result: SmartHintOption[] }
  | { id: number; ok: true; type: 'sampleAndClassifyFace'; result: SampleAndClassifyResult }
  | { id: number; ok: true; type: 'recalibrateFaces'; result: ScannedFaces }
  | { id: number; ok: false; error: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<CubeWorkerRequest>) => void) | null;
  postMessage: (message: CubeWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<CubeWorkerRequest>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case 'solveMethod': {
        const result = solveCubeWithMethod(
          req.cubies,
          req.methodId,
          req.puzzleType,
          req.fallbackHistory
        );
        workerScope.postMessage({ id: req.id, ok: true, type: 'solveMethod', result });
        return;
      }
      case 'computeSmartHints': {
        const result = computeBasicAlgorithmHints(req.cubies);
        workerScope.postMessage({ id: req.id, ok: true, type: 'computeSmartHints', result });
        return;
      }
      case 'sampleAndClassifyFace': {
        const rgba = new Uint8ClampedArray(req.rgbaBuffer);
        const rgbs = sampleGridFromRgba(rgba, req.width, req.height, req.reticleScale);
        const facesGrid = rgbs.map((rgb) => classifyRgbToWcaFace(rgb, req.calibration));
        workerScope.postMessage({
          id: req.id,
          ok: true,
          type: 'sampleAndClassifyFace',
          result: { rgbs, facesGrid },
        });
        return;
      }
      case 'recalibrateFaces': {
        const result = recalibrateScannedFaces(req.rgbFaces, req.currentFaces);
        workerScope.postMessage({ id: req.id, ok: true, type: 'recalibrateFaces', result });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cube worker computation failed';
    workerScope.postMessage({ id: req.id, ok: false, error: message });
  }
};
