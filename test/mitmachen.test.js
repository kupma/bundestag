import assert from 'node:assert/strict';
import test from 'node:test';

import { THEMES } from '../src/mitmachen.js';
import { LEVELS, RESOURCES } from '../src/resources.js';

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
