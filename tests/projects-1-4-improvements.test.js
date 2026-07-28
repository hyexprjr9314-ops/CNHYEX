import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('project 1 removes retired AI DOM references and throttles focus refresh', async () => {
  const index = await read('../index.html');
  assert.doesNotMatch(index, /aiStrengthEl|aiGuideEl/);
  assert.match(index, /Date\.now\(\) - lastCentralLoadAt > 30000/);
});

test('project 2 bulk permission changes use one administrator API action', async () => {
  const [index, api, migration] = await Promise.all([
    read('../index.html'),
    read('../api/admin-state.js'),
    read('../supabase/migrations/202607250001_fix_cycle_enum_permission_guards.sql')
  ]);
  assert.match(index, /bulkSetPermissions\('both', true\)/);
  assert.match(index, /bulkSetPermissions\('both', false\)/);
  assert.match(index, /일괄 비활성화/);
  assert.match(index, /action: 'permission_bulk_update'/);
  assert.match(api, /permission_bulk_update/);
  assert.match(api, /\.in\('id', userIds\)/);
  assert.match(api, /typeof req\.body\.can_evaluate === 'boolean'/);
  assert.match(api, /typeof req\.body\.is_evaluatee === 'boolean'/);
  assert.match(migration, /c\.status <> '마감\/보관됨'/);
  assert.doesNotMatch(migration, /'closed'|'cancelled'|'archived'/);
});

test('project 3 uses scoped light-theme contrast classes', async () => {
  const index = await read('../index.html');
  for (const className of ['progress-stat-neutral', 'progress-stat-complete', 'approval-panel', 'super-admin-badge']) {
    assert.match(index, new RegExp(className));
  }
  assert.match(index, /\.super-admin-badge\s*\{[\s\S]*color:\s*#5B21B6\s*!important/);
});

test('project 4 stores and calculates four independent track weight sets', async () => {
  const [index, api, resultState, migration] = await Promise.all([
    read('../index.html'),
    read('../api/admin-state.js'),
    read('../api/result-state.js'),
    read('../supabase/migrations/202607240011_track_category_weights.sql')
  ]);
  for (const track of ['headquarters_member', 'headquarters_leader', 'branch_employee', 'mechanic']) {
    assert.match(index, new RegExp(track));
    assert.match(migration, new RegExp(`"${track}"`));
  }
  assert.match(index, /track_category_weights: trackCategoryWeights/);
  assert.match(api, /normalizedWeights\(settings, track/);
  assert.match(resultState, /track_category_weights/);
  assert.match(migration, /category_weight_for_target/);
  assert.match(migration, /pg_get_functiondef\('public\.governance_finalize_cycle\(bigint,uuid\)'/);
});
