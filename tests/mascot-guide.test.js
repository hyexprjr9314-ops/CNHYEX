import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexUrl = new URL('../index.html', import.meta.url);

test('contextual mascot guide remains optional, accessible, and isolated from evaluation submission', async () => {
  const html = await readFile(indexUrl, 'utf8');
  assert.match(html, /id="mascot-guide"[\s\S]*role="status"[\s\S]*aria-live="polite"/);
  assert.match(html, /assets\/mascot-hanyang\.jpg/);
  assert.match(html, /assets\/mascot-chungnam\.jpg/);
  assert.match(html, /prefers-reduced-motion[\s\S]*#mascot-guide\.is-visible/);
  assert.match(html, /submit_evaluation_central[\s\S]*if \(submitError\)[\s\S]*showMascotGuide\(/);
  assert.doesNotMatch(html, /mascot-guide[\s\S]{0,500}z-index:\s*9999/);
});
