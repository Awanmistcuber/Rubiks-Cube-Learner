import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildThemePaletteFromCustom,
  FIGMA_STARTER_PALETTES,
  getContrastForeground,
  hexToNumber,
  normalizeHexColor,
  numberToHex,
  resolveThemePalette,
  type CustomThemeRecord,
} from './customThemes.ts';

test('normalizeHexColor validates 3-digit, 6-digit, and fallback hex strings', () => {
  assert.equal(normalizeHexColor('#abc', '#000000'), '#AABBCC');
  assert.equal(normalizeHexColor('ff5733', '#000000'), '#FF5733');
  assert.equal(normalizeHexColor('not-a-hex', '#123456'), '#123456');
  assert.equal(hexToNumber('#0ACF83'), 0x0acf83);
  assert.equal(numberToHex(0x0acf83), '#0ACF83');
});

test('getContrastForeground selects accessible text contrast for light and dark accents', () => {
  assert.equal(getContrastForeground('#FFCE2E'), '#141517');
  assert.equal(getContrastForeground('#16161A'), '#FFFFFF');
  assert.equal(getContrastForeground('#1D4ED8'), '#FFFFFF');
});

test('buildThemePaletteFromCustom preserves base lighting while injecting custom sticker hex colors', () => {
  const starter = FIGMA_STARTER_PALETTES[0];
  const custom: CustomThemeRecord = {
    id: 'custom-figma-1',
    name: 'My Figma Cube',
    baseThemeId: starter.baseThemeId,
    accentHex: '#A259FF',
    chassisHex: '#18191E',
    faceHexColors: { ...starter.faceHexColors, pz: '#10B981' },
    createdAt: 1700000000000,
  };

  const palette = buildThemePaletteFromCustom(custom);
  assert.equal(palette.id, 'custom-figma-1');
  assert.equal(palette.name, 'My Figma Cube');
  assert.equal(palette.isCustom, true);
  assert.equal(palette.isDark, true); // inherited from monolith base
  assert.equal(palette.scene.faceColors.pz, 0x10b981);
  assert.equal(palette.scene.chassisColor, 0x18191e);
  assert.equal(palette.ui.accent, '#A259FF');
  assert.equal(palette.ui.accentFg, '#FFFFFF');
});

test('resolveThemePalette resolves built-in themes, custom themes, and safe fallback', () => {
  const custom: CustomThemeRecord = {
    id: 'custom-matcha',
    name: 'Matcha Studio',
    baseThemeId: 'pastel',
    accentHex: '#4D7C5D',
    chassisHex: '#F4F1EA',
    faceHexColors: FIGMA_STARTER_PALETTES[2].faceHexColors,
    createdAt: 1700000000000,
  };

  assert.equal(resolveThemePalette('monolith', [custom]).name, 'Monolith Dark');
  assert.equal(resolveThemePalette('custom-matcha', [custom]).name, 'Matcha Studio');
  assert.equal(resolveThemePalette('missing-id', [custom]).name, 'Atelier Light');
});
