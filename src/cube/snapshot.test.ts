import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSnapshotFilename,
  computeSnapshotDimensions,
  DEFAULT_SNAPSHOT_HEIGHT,
  DEFAULT_SNAPSHOT_WIDTH,
  slugifySnapshotSegment,
} from './snapshot';

test('computeSnapshotDimensions returns 2400x1800 default high-resolution dimensions', () => {
  const dims = computeSnapshotDimensions();
  assert.equal(dims.width, DEFAULT_SNAPSHOT_WIDTH);
  assert.equal(dims.height, DEFAULT_SNAPSHOT_HEIGHT);
});

test('computeSnapshotDimensions scales proportionally when capped by maxRenderbufferSize', () => {
  const dims = computeSnapshotDimensions({
    targetWidth: 3840,
    targetHeight: 2160,
    maxRenderbufferSize: 2048,
  });
  assert.equal(dims.width, 2048);
  assert.equal(dims.height, 1152);
});

test('slugifySnapshotSegment strips symbols and falls back safely', () => {
  assert.equal(slugifySnapshotSegment('Figma Neon! #1'), 'figma-neon-1');
  assert.equal(slugifySnapshotSegment('   !!!   ', 'custom'), 'custom');
});

test('buildSnapshotFilename generates descriptive PNG filename with puzzle, theme, and UTC stamp', () => {
  const filename = buildSnapshotFilename({
    puzzleType: '4x4',
    themeName: 'Tokyo Matcha',
    date: new Date('2026-11-19T09:05:00.000Z'),
  });
  assert.equal(filename, 'kubi-4x4-tokyo-matcha-20261119-0905.png');
});
