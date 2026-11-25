import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLocale,
  SUPPORTED_LOCALES,
  translate,
  TRANSLATION_DICTIONARIES,
  type TranslationKey,
} from './i18n';

test('all 7 JSON translation dictionaries share 100% key parity with non-empty localized values', () => {
  const baseKeys = Object.keys(TRANSLATION_DICTIONARIES.en) as TranslationKey[];
  assert.ok(baseKeys.length >= 60, 'Expected comprehensive translation coverage');

  for (const loc of SUPPORTED_LOCALES) {
    const dict = TRANSLATION_DICTIONARIES[loc.code];
    assert.ok(dict, `Missing dictionary for ${loc.code}`);
    const keys = Object.keys(dict);
    assert.equal(keys.length, baseKeys.length, `Key count mismatch for locale ${loc.code}`);
    for (const key of baseKeys) {
      assert.equal(
        typeof dict[key],
        'string',
        `Missing translation key "${key}" in locale "${loc.code}"`
      );
      assert.ok(
        dict[key].trim().length > 0,
        `Empty translation value for "${key}" in locale "${loc.code}"`
      );
    }
  }
});

test('translate interpolates placeholders accurately across all supported languages', () => {
  assert.equal(translate('en', 'settings.backupSummary', { themes: 3, solves: 12 }), '3 themes · 12 solves');
  assert.equal(translate('zh', 'history.winRate', { rate: 75 }), '75% 胜率');
  assert.equal(translate('ja', 'arena.findOpponent', { puzzle: '3×3' }), '対戦相手を探す (3×3)');
  assert.equal(translate('ko', 'history.streakLabel', { streak: 4 }), '4연승');
  assert.equal(translate('es', 'history.roundsCount', { count: 5 }), '5 rondas');
  assert.equal(translate('fr', 'history.roundsCount', { count: 3 }), '3 manches');
  assert.equal(translate('de', 'history.winRate', { rate: 80 }), '80% Siegquote');
});

test('normalizeLocale maps BCP-47 region tags to supported locales and defaults safely to en', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh');
  assert.equal(normalizeLocale('ja-JP'), 'ja');
  assert.equal(normalizeLocale('ko-KR'), 'ko');
  assert.equal(normalizeLocale('es-MX'), 'es');
  assert.equal(normalizeLocale('fr-CA'), 'fr');
  assert.equal(normalizeLocale('de-DE'), 'de');
  assert.equal(normalizeLocale('pt-BR'), 'en');
  assert.equal(normalizeLocale(null), 'en');
});
