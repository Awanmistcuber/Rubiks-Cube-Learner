import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInternalViewHref,
  getSeoMetadataForView,
  parseInitialSeoRoute,
  resolveCanonicalUrl,
  type SeoViewId,
} from './seo';

test('All SEO view titles and meta descriptions obey Google snippet length guidelines', () => {
  const views: SeoViewId[] = ['home', 'tutorials', 'timer', 'solver', 'daily'];
  for (const view of views) {
    const meta = getSeoMetadataForView(view, 'https://awanmistcuber.github.io', '/Rubiks-Cube-Learner/');
    assert.ok(
      meta.title.length >= 30 && meta.title.length <= 60,
      `Expected ${view} title length 30-60, got ${meta.title.length}: "${meta.title}"`
    );
    assert.ok(
      meta.description.length >= 120 && meta.description.length <= 160,
      `Expected ${view} description length 120-160, got ${meta.description.length}: "${meta.description}"`
    );
  }
});

test('resolveCanonicalUrl strips trailing noise and generates self-referencing view canonicals', () => {
  assert.equal(
    resolveCanonicalUrl('https://awanmistcuber.github.io', '/Rubiks-Cube-Learner', 'home'),
    'https://awanmistcuber.github.io/Rubiks-Cube-Learner/'
  );
  assert.equal(
    resolveCanonicalUrl('https://awanmistcuber.github.io', '/Rubiks-Cube-Learner/', 'tutorials'),
    'https://awanmistcuber.github.io/Rubiks-Cube-Learner/?view=tutorials'
  );
  assert.equal(
    resolveCanonicalUrl('https://awanmistcuber.github.io', '/Rubiks-Cube-Learner/', 'timer'),
    'https://awanmistcuber.github.io/Rubiks-Cube-Learner/?view=timer'
  );
});

test('parseInitialSeoRoute resolves view, puzzle, and autostart cleanly while ignoring unknown values', () => {
  assert.deepEqual(parseInitialSeoRoute(''), {
    view: 'home',
    puzzle: undefined,
    autoStart: false,
  });
  assert.deepEqual(parseInitialSeoRoute('?view=tutorials&puzzle=4x4&utm_source=google'), {
    view: 'tutorials',
    puzzle: '4x4',
    autoStart: true,
  });
  assert.deepEqual(parseInitialSeoRoute('?view=invalid&autostart=1'), {
    view: 'home',
    puzzle: undefined,
    autoStart: true,
  });
});

test('buildInternalViewHref builds clean relative links compatible with subpath and root hosting', () => {
  assert.equal(buildInternalViewHref('home'), './');
  assert.equal(buildInternalViewHref('tutorials'), './?view=tutorials');
  assert.equal(buildInternalViewHref('timer'), './?view=timer');
});
