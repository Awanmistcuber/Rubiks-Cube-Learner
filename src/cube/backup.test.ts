import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackupPayload,
  getBackupFilename,
  mergeBackupData,
  parseBackupJson,
  serializeBackupJson,
} from './backup';
import type { CustomThemeRecord } from './customThemes';
import type { SolveRecord } from './timerStats';

const SAMPLE_THEME: CustomThemeRecord = {
  id: 'custom-figma-1',
  name: 'Figma Neon',
  baseThemeId: 'monolith',
  accentHex: '#A259FF',
  chassisHex: '#18191E',
  faceHexColors: {
    py: '#F8FAFC',
    ny: '#FFCE2E',
    pz: '#0ACF83',
    nz: '#1ABCFE',
    px: '#F24E1E',
    nx: '#A259FF',
  },
  createdAt: 1730000000000,
};

const SAMPLE_RECORD: SolveRecord = {
  id: 'sw-101',
  puzzleType: '3x3',
  timeMs: 14250,
  penalty: 'none',
  scramble: "R U R' U' F2 D",
  source: 'stopwatch',
  timestamp: 1730000100000,
};

test('createBackupPayload and serializeBackupJson round-trip cleanly via parseBackupJson', () => {
  const payload = createBackupPayload({
    customThemes: [SAMPLE_THEME],
    solveRecords: [SAMPLE_RECORD],
    activeThemeId: SAMPLE_THEME.id,
    exportedAt: new Date('2026-11-19T12:00:00.000Z'),
  });

  const json = serializeBackupJson(payload);
  const parsed = parseBackupJson(json);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.payload.app, 'kubi-studio');
    assert.equal(parsed.payload.schemaVersion, 1);
    assert.equal(parsed.payload.activeThemeId, 'custom-figma-1');
    assert.equal(parsed.payload.customThemes.length, 1);
    assert.equal(parsed.payload.customThemes[0].name, 'Figma Neon');
    assert.equal(parsed.payload.solveRecords.length, 1);
    assert.equal(parsed.payload.solveRecords[0].timeMs, 14250);
    assert.equal(parsed.skippedThemes, 0);
    assert.equal(parsed.skippedRecords, 0);
  }
});

test('parseBackupJson rejects malformed JSON and unrecognized objects with clear errors', () => {
  const badSyntax = parseBackupJson('{ not valid json');
  assert.equal(badSyntax.ok, false);

  const wrongShape = parseBackupJson(JSON.stringify({ hello: 'world' }));
  assert.equal(wrongShape.ok, false);

  const emptyFile = parseBackupJson('   ');
  assert.equal(emptyFile.ok, false);
});

test('parseBackupJson sanitizes hex colors and skips corrupt entries without crashing', () => {
  const raw = JSON.stringify({
    app: 'kubi-studio',
    schemaVersion: 1,
    customThemes: [
      {
        id: 'custom-short',
        name: '  Pastel   Studio  ',
        baseThemeId: 'invalid-base',
        accentHex: '#0f8',
        chassisHex: 'badhex',
        faceHexColors: {
          py: '#fff',
          ny: '#ff0',
          pz: '#0f0',
          nz: '#00f',
          px: '#f00',
          nx: '#f80',
        },
      },
      { broken: true },
    ],
    solveRecords: [
      {
        id: 'rec-ok',
        puzzleType: '2x2',
        timeMs: 4120.7,
        penalty: '+2',
        scramble: "R U' F2",
        source: 'virtual3d',
        timestamp: 1730000200000,
      },
      {
        id: 'rec-bad-time',
        puzzleType: '3x3',
        timeMs: -50,
      },
    ],
  });

  const parsed = parseBackupJson(raw);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.skippedThemes, 1);
    assert.equal(parsed.skippedRecords, 1);
    assert.equal(parsed.payload.customThemes[0].baseThemeId, 'atelier');
    assert.equal(parsed.payload.customThemes[0].accentHex, '#00FF88');
    assert.equal(parsed.payload.customThemes[0].faceHexColors.py, '#FFFFFF');
    assert.equal(parsed.payload.solveRecords[0].timeMs, 4121);
    assert.equal(parsed.payload.solveRecords[0].penalty, '+2');
  }
});

test('mergeBackupData deduplicates by id in merge mode and overwrites cleanly in replace mode', () => {
  const incomingTheme2: CustomThemeRecord = {
    ...SAMPLE_THEME,
    id: 'custom-bauhaus',
    name: 'Swiss Bauhaus',
  };
  const incomingRecord2: SolveRecord = {
    ...SAMPLE_RECORD,
    id: 'sw-202',
    timeMs: 11890,
    timestamp: 1730000500000,
  };

  const incoming = createBackupPayload({
    customThemes: [SAMPLE_THEME, incomingTheme2],
    solveRecords: [SAMPLE_RECORD, incomingRecord2],
  });

  const merged = mergeBackupData(
    { customThemes: [SAMPLE_THEME], solveRecords: [SAMPLE_RECORD] },
    incoming,
    'merge'
  );
  assert.equal(merged.customThemes.length, 2);
  assert.equal(merged.addedThemes, 1);
  assert.equal(merged.updatedThemes, 1);
  assert.equal(merged.solveRecords.length, 2);
  assert.equal(merged.addedRecords, 1);

  const replaced = mergeBackupData(
    { customThemes: [SAMPLE_THEME], solveRecords: [SAMPLE_RECORD] },
    createBackupPayload({ customThemes: [incomingTheme2], solveRecords: [incomingRecord2] }),
    'replace'
  );
  assert.equal(replaced.customThemes.length, 1);
  assert.equal(replaced.customThemes[0].id, 'custom-bauhaus');
  assert.equal(replaced.solveRecords.length, 1);
  assert.equal(replaced.solveRecords[0].id, 'sw-202');
});

test('getBackupFilename formats deterministic UTC date filename', () => {
  assert.equal(
    getBackupFilename(new Date('2026-11-19T08:30:00.000Z')),
    'kubi-studio-backup-2026-11-19.json'
  );
});
