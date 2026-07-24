import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const indexUrl = new URL('../index.html', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/202607240010_relationship_stage_alignment.sql', import.meta.url);

test('approval, bulk mail, and final grade controls are connected in their intended views', async () => {
  const index = await readFile(indexUrl, 'utf8');
  assert.equal((index.match(/id="internal-approval-controls"/g) || []).length, 1);
  assert.equal((index.match(/id="admin-publish-toggle-btn"/g) || []).length, 1);
  assert.match(index, /id="admin-subtab-summary"[\s\S]*id="internal-approval-controls"/);
  assert.match(index, /sendBulkPasswordResetEmails\(\)/);
  assert.match(index, /action:\s*'password_reset_bulk'/);
  assert.match(index, /sendBulkGradeNoticeEmails\(\)/);
  assert.match(index, /action:\s*'grade_notice_bulk'/);
  assert.match(index, /sendGradeNoticeEmail\(\$\{emp\.id\}/);
  assert.match(index, /id="my-chart-card"[\s\S]*id="my-grade-card"/);
});

test('inline application scripts remain syntactically valid', async () => {
  const index = await readFile(indexUrl, 'utf8');
  const inlineScripts = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(inlineScripts.length >= 2);
  inlineScripts.forEach((source, indexValue) => {
    assert.doesNotThrow(() => new vm.Script(source), `inline script ${indexValue + 1} must parse`);
  });
});

test('relationship alignment migration preserves leader precedence and cross-organization exchange', async () => {
  const source = await readFile(migrationUrl, 'utf8');
  assert.match(source, /disable trigger matchings_prevent_non_draft_mutation/);
  assert.match(source, /when context\.target_is_leader then 'leadership'/);
  assert.match(source, /context\.evaluator_company = context\.target_company[\s\S]*context\.evaluator_dept = context\.target_dept then 'internal'/);
  assert.match(source, /else 'exchange'/);
  assert.match(source, /enable trigger matchings_prevent_non_draft_mutation[\s\S]*commit;/);
});
