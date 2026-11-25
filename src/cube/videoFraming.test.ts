import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAspectPreservedFrameSize, isPortraitFrame } from './videoFraming';

test('computeAspectPreservedFrameSize preserves portrait mobile aspect ratio without wide stretching', () => {
  // Typical mobile front camera in portrait orientation (9:16)
  const portrait = computeAspectPreservedFrameSize(720, 1280, 320);
  assert.equal(portrait.width, 180);
  assert.equal(portrait.height, 320);
  assert.ok(Math.abs(portrait.width / portrait.height - 720 / 1280) < 0.01);
  assert.equal(isPortraitFrame(portrait.width, portrait.height), true);

  // 3:4 portrait phone camera
  const portrait34 = computeAspectPreservedFrameSize(480, 640, 320);
  assert.equal(portrait34.width, 240);
  assert.equal(portrait34.height, 320);
  assert.equal(isPortraitFrame(portrait34.width, portrait34.height), true);
});

test('computeAspectPreservedFrameSize preserves landscape and square aspect ratios', () => {
  const landscape = computeAspectPreservedFrameSize(1280, 720, 320);
  assert.equal(landscape.width, 320);
  assert.equal(landscape.height, 180);
  assert.equal(isPortraitFrame(landscape.width, landscape.height), false);

  const square = computeAspectPreservedFrameSize(500, 500, 320);
  assert.equal(square.width, 320);
  assert.equal(square.height, 320);
  assert.equal(isPortraitFrame(square.width, square.height), false);
});

test('computeAspectPreservedFrameSize handles invalid or zero source sizes safely', () => {
  assert.deepEqual(computeAspectPreservedFrameSize(0, 0), { width: 320, height: 180 });
  assert.deepEqual(computeAspectPreservedFrameSize(-100, 200), { width: 320, height: 180 });
  assert.equal(isPortraitFrame(0, 0), false);
});
