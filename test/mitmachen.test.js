import assert from 'node:assert/strict';
import test from 'node:test';

import { THEMES } from '../src/mitmachen.js';
import { ACTION_RESOURCE_KEYS, LEVELS, RESOURCES, shownActions } from '../src/resources.js';

test('every link on the Mitmachen page comes from the curated list', () => {
  for (const theme of THEMES) {
    assert.match(theme.id, /^[a-z]+$/);
    assert.ok(theme.tips.length >= 3, `${theme.id} has tips`);
    for (const tip of theme.tips) {
      assert.ok(tip.title && tip.text, 'title and text');
      assert.ok(tip.levels.length && tip.levels.every((l) => LEVELS[l]), `${tip.title}: levels`);
      for (const key of tip.links || []) assert.ok(RESOURCES[key], `${tip.title}: unknown link ${key}`);
    }
  }
});

test('curated links are https or point at a theme on the Mitmachen page', () => {
  const ids = new Set(THEMES.map((t) => t.id));
  for (const [key, r] of Object.entries(RESOURCES)) {
    assert.ok(r.label, `${key}: label`);
    if (r.url.startsWith('/')) assert.ok(ids.has(r.url.split('#')[1]), `${key}: anchor ${r.url}`);
    else assert.match(r.url, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[\w\-./]*)?$/, `${key}: ${r.url}`);
  }
});

test('suggestions under a decision leave out the general tips that fit anywhere', () => {
  assert.ok(ACTION_RESOURCE_KEYS.includes('mieterbund'));
  for (const k of ['abgeordnete', 'abgeordnetenwatch', 'petition', 'mitmachen_demokratie']) assert.ok(!ACTION_RESOURCE_KEYS.includes(k), k);
  // an article written before: three suggestions, one of them "ask your MP"
  const stored = [
    { level: 'politik', text: 'Frag deine Abgeordneten.', resource: 'abgeordnete' },
    { level: 'alltag', text: 'Prüfe deine Miete.', resource: 'mieterbund' },
    { level: 'gemeinsam', text: 'Hilf bei der Tafel.', resource: 'tafel' },
    { level: 'alltag', text: 'Ein dritter.', resource: null },
  ];
  assert.deepEqual(shownActions(stored).map((a) => a.text), ['Prüfe deine Miete.', 'Hilf bei der Tafel.']);
  assert.deepEqual(shownActions(undefined), []);
});
