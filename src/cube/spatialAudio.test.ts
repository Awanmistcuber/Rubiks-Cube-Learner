import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNotation } from './cubeLogic';
import {
  classifyTurnKind,
  computeLayerLocalCenter,
  computeTurnAcousticProfile,
  loadSpatialAudioPref,
  saveSpatialAudioPref,
  SPATIAL_AUDIO_STORAGE_KEY,
  type SpatialListenerPose,
  type Vec3,
} from './spatialAudio';

const FRONT_CAMERA: SpatialListenerPose = {
  position: [0, 0, 10],
  forward: [0, 0, -1],
  up: [0, 1, 0],
};

const BACK_CAMERA: SpatialListenerPose = {
  position: [0, 0, -10],
  forward: [0, 0, 1],
  up: [0, 1, 0],
};

function mustParse(notation: string, puzzleType: '2x2' | '3x3' | '4x4' | 'mirror' = '3x3') {
  const move = parseNotation(notation, puzzleType);
  assert.ok(move, `Expected valid move for ${notation}`);
  return move;
}

test('computeLayerLocalCenter computes accurate 3D centroids for outer, slice, wide, and rotation moves', () => {
  const unitScale = 2.75 / 3;
  const rCenter = computeLayerLocalCenter(mustParse('R'), '3x3', unitScale, 0);
  const lCenter = computeLayerLocalCenter(mustParse('L'), '3x3', unitScale, 0);
  const uCenter = computeLayerLocalCenter(mustParse('U'), '3x3', unitScale, 0);
  const dCenter = computeLayerLocalCenter(mustParse('D'), '3x3', unitScale, 0);
  const fCenter = computeLayerLocalCenter(mustParse('F'), '3x3', unitScale, 0);
  const bCenter = computeLayerLocalCenter(mustParse('B'), '3x3', unitScale, 0);
  const mCenter = computeLayerLocalCenter(mustParse('M'), '3x3', unitScale, 0);
  const xCenter = computeLayerLocalCenter(mustParse('x'), '3x3', unitScale, 0);

  assert.ok(rCenter[0] > 0.8 && rCenter[1] === 0 && rCenter[2] === 0);
  assert.ok(lCenter[0] < -0.8 && lCenter[1] === 0 && lCenter[2] === 0);
  assert.ok(uCenter[1] > 0.8 && uCenter[0] === 0 && uCenter[2] === 0);
  assert.ok(dCenter[1] < -0.8 && dCenter[0] === 0 && dCenter[2] === 0);
  assert.ok(fCenter[2] > 0.8 && fCenter[0] === 0 && fCenter[1] === 0);
  assert.ok(bCenter[2] < -0.8 && bCenter[0] === 0 && bCenter[1] === 0);
  assert.deepEqual(mCenter, [0, 0, 0]);
  assert.deepEqual(xCenter, [0, 0, 0]);

  // Exploded view expands outer layer acoustic origin radially outward
  const rExploded = computeLayerLocalCenter(mustParse('R'), '3x3', unitScale, 1);
  assert.ok(rExploded[0] > rCenter[0] + 0.5);

  // 4x4 wide turn sits between outer and inner layer
  const rwCenter = computeLayerLocalCenter(mustParse('Rw', '4x4'), '4x4', 2.75 / 4, 0);
  const r4Center = computeLayerLocalCenter(mustParse('R', '4x4'), '4x4', 2.75 / 4, 0);
  assert.ok(rwCenter[0] > 0 && rwCenter[0] < r4Center[0]);
});

test('classifyTurnKind distinguishes outer, wide, slice, and whole-cube rotations', () => {
  assert.equal(classifyTurnKind(mustParse('R'), '3x3'), 'outer');
  assert.equal(classifyTurnKind(mustParse('M'), '3x3'), 'slice');
  assert.equal(classifyTurnKind(mustParse('x'), '3x3'), 'rotation');
  assert.equal(classifyTurnKind(mustParse('Rw', '4x4'), '4x4'), 'wide');
  assert.equal(classifyTurnKind(mustParse('y', '2x2'), '2x2'), 'rotation');
});

test('stereo azimuth maps R to right ear, L to left ear, and dynamically flips when camera orbits 180°', () => {
  const unitScale = 2.75 / 3;
  const cubeWorldPos: Vec3 = [0, 0, 0];

  const rMove = mustParse('R');
  const lMove = mustParse('L');
  const rWorld = computeLayerLocalCenter(rMove, '3x3', unitScale, 0);
  const lWorld = computeLayerLocalCenter(lMove, '3x3', unitScale, 0);

  const rFront = computeTurnAcousticProfile({
    move: rMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: rWorld,
    listener: FRONT_CAMERA,
  });
  const lFront = computeTurnAcousticProfile({
    move: lMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: lWorld,
    listener: FRONT_CAMERA,
  });

  assert.ok(rFront.azimuthRad > 0.25, `Expected R to pan right, got ${rFront.azimuthRad}`);
  assert.ok(lFront.azimuthRad < -0.25, `Expected L to pan left, got ${lFront.azimuthRad}`);
  assert.ok(rFront.stereoPan > 0.25);
  assert.ok(lFront.stereoPan < -0.25);

  // Orbit 180° to back side of cube: R is now on listener's LEFT, L is on listener's RIGHT!
  const rBack = computeTurnAcousticProfile({
    move: rMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: rWorld,
    listener: BACK_CAMERA,
  });
  const lBack = computeTurnAcousticProfile({
    move: lMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: lWorld,
    listener: BACK_CAMERA,
  });

  assert.ok(rBack.azimuthRad < -0.25, `Expected R to flip left from rear view, got ${rBack.azimuthRad}`);
  assert.ok(lBack.azimuthRad > 0.25, `Expected L to flip right from rear view, got ${lBack.azimuthRad}`);
});

test('elevation distinguishes U vs D turns and front vs back turns apply acoustic chassis occlusion', () => {
  const unitScale = 2.75 / 3;
  const cubeWorldPos: Vec3 = [0, 0, 0];

  const uMove = mustParse('U');
  const dMove = mustParse('D');
  const fMove = mustParse('F');
  const bMove = mustParse('B');

  const uProfile = computeTurnAcousticProfile({
    move: uMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(uMove, '3x3', unitScale, 0),
    listener: FRONT_CAMERA,
  });
  const dProfile = computeTurnAcousticProfile({
    move: dMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(dMove, '3x3', unitScale, 0),
    listener: FRONT_CAMERA,
  });

  assert.ok(uProfile.elevationRad > 0.25);
  assert.ok(dProfile.elevationRad < -0.25);
  assert.ok(uProfile.bodyFreqHz > dProfile.bodyFreqHz);

  const fProfile = computeTurnAcousticProfile({
    move: fMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(fMove, '3x3', unitScale, 0),
    listener: FRONT_CAMERA,
  });
  const bProfile = computeTurnAcousticProfile({
    move: bMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(bMove, '3x3', unitScale, 0),
    listener: FRONT_CAMERA,
  });
  const bExploded = computeTurnAcousticProfile({
    move: bMove,
    puzzleType: '3x3',
    unitScale,
    explodeAmount: 1,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(bMove, '3x3', unitScale, 1),
    listener: FRONT_CAMERA,
  });

  assert.equal(fProfile.occlusionFactor, 0);
  assert.ok(bProfile.occlusionFactor > 0.4, `Expected back face occlusion, got ${bProfile.occlusionFactor}`);
  assert.ok(
    bProfile.filterCutoffHz < fProfile.filterCutoffHz - 1500,
    `Expected back face cutoff (${bProfile.filterCutoffHz}) to be noticeably warmer than front (${fProfile.filterCutoffHz})`
  );
  // Exploded view reduces chassis occlusion on back faces
  assert.ok(bExploded.occlusionFactor < bProfile.occlusionFactor);
});

test('puzzle materials, turn kinds, turn speeds, and double-turn second clicks have distinct acoustic signatures', () => {
  const cubeWorldPos: Vec3 = [0, 0, 0];
  const r3 = mustParse('R', '3x3');
  const r2 = mustParse('R', '2x2');
  const r4 = mustParse('R', '4x4');
  const rMirror = mustParse('R', 'mirror');
  const rotY = mustParse('y', '3x3');
  const sliceM = mustParse('M', '3x3');

  const p2 = computeTurnAcousticProfile({
    move: r2,
    puzzleType: '2x2',
    unitScale: 2.75 / 2,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(r2, '2x2', 2.75 / 2, 0),
    listener: FRONT_CAMERA,
  });
  const p3 = computeTurnAcousticProfile({
    move: r3,
    puzzleType: '3x3',
    unitScale: 2.75 / 3,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(r3, '3x3', 2.75 / 3, 0),
    listener: FRONT_CAMERA,
  });
  const p4 = computeTurnAcousticProfile({
    move: r4,
    puzzleType: '4x4',
    unitScale: 2.75 / 4,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(r4, '4x4', 2.75 / 4, 0),
    listener: FRONT_CAMERA,
  });
  const pMirror = computeTurnAcousticProfile({
    move: rMirror,
    puzzleType: 'mirror',
    unitScale: 0.92,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(rMirror, 'mirror', 0.92, 0),
    listener: FRONT_CAMERA,
  });
  const pRot = computeTurnAcousticProfile({
    move: rotY,
    puzzleType: '3x3',
    unitScale: 2.75 / 3,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: [0, 0, 0],
    listener: FRONT_CAMERA,
  });
  const pSlice = computeTurnAcousticProfile({
    move: sliceM,
    puzzleType: '3x3',
    unitScale: 2.75 / 3,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: [0, 0, 0],
    listener: FRONT_CAMERA,
  });

  // 2x2 is higher-pitched than 3x3, which is higher-pitched than 4x4
  assert.ok(p2.bodyFreqHz > p3.bodyFreqHz);
  assert.ok(p3.bodyFreqHz > p4.bodyFreqHz);

  // Mirror cube has distinctly higher metallic alloy blend & overtone resonance
  assert.ok(pMirror.metallicMix > p3.metallicMix + 0.3);
  assert.ok(pMirror.overtoneFreqHz > p3.overtoneFreqHz);

  // Whole-cube rotation has soft handling thud instead of sharp detent click
  assert.equal(pRot.turnKind, 'rotation');
  assert.ok(pRot.snapGain < p3.snapGain * 0.35);

  // Center slice has higher friction slide & core resonance than standard outer turn
  assert.equal(pSlice.turnKind, 'slice');
  assert.ok(pSlice.slideGain > p3.slideGain);

  // Fast flick vs slow turn & double-turn second click lift
  const fastR = computeTurnAcousticProfile({
    move: r3,
    puzzleType: '3x3',
    unitScale: 2.75 / 3,
    explodeAmount: 0,
    turnSpeed: 2.2,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(r3, '3x3', 2.75 / 3, 0),
    listener: FRONT_CAMERA,
  });
  const secondClickR = computeTurnAcousticProfile({
    move: r3,
    puzzleType: '3x3',
    unitScale: 2.75 / 3,
    explodeAmount: 0,
    turnSpeed: 1,
    cubeWorldPos,
    layerWorldPos: computeLayerLocalCenter(r3, '3x3', 2.75 / 3, 0),
    listener: FRONT_CAMERA,
    clickIndex: 1,
  });
  assert.ok(fastR.clickFreqHz > p3.clickFreqHz);
  assert.ok(fastR.snapGain > p3.snapGain);
  assert.ok(secondClickR.bodyFreqHz > p3.bodyFreqHz);
  assert.ok(secondClickR.snapGain > p3.snapGain);
});

test('loadSpatialAudioPref and saveSpatialAudioPref persist boolean toggle cleanly', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  assert.equal(loadSpatialAudioPref(mockStorage), true);
  saveSpatialAudioPref(false, mockStorage);
  assert.equal(store.get(SPATIAL_AUDIO_STORAGE_KEY), 'false');
  assert.equal(loadSpatialAudioPref(mockStorage), false);
  saveSpatialAudioPref(true, mockStorage);
  assert.equal(loadSpatialAudioPref(mockStorage), true);
});
