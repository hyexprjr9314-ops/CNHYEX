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

test('administrator mascot guide is read-only, state-aware, and isolated from management actions', async () => {
  const html = await readFile(indexUrl, 'utf8');
  const adminGuide = html.slice(
    html.indexOf('function showAdminMascotGuide'),
    html.indexOf('function filterEmployeeListTrack')
  );
  assert.match(html, /function showAdminMascotGuide\(subtab\)[\s\S]*\['evalmanage', 'admin'\]\.includes\(currentActiveView\)[\s\S]*!roleInfo\.isAdmin/);
  assert.match(html, /internal_approval_status[\s\S]*results_published[\s\S]*cnhy_mascot_admin_/);
  assert.match(html, /requestAnimationFrame\(\(\) => showAdminMascotGuide\(subtab\)\)/);
  assert.match(html, /Optional mascot admin guide skipped/);
  assert.doesNotMatch(adminGuide, /callAdminStateApi/);
});
