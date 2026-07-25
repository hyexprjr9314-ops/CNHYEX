import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('approved grade override preserves computed relative grade', async () => {
  const [sql, state, admin, mail, html] = await Promise.all([
    read('../supabase/migrations/202607250012_grade_override.sql'),
    read('../api/result-state.js'),
    read('../api/admin-state.js'),
    read('../api/mail.js'),
    read('../index.html')
  ]);
  assert.match(sql, /add column if not exists grade_override/);
  assert.match(sql, /add column if not exists approved_grade/);
  assert.match(sql, /coalesce\(a\.grade_override, r\.relative_grade\)/);
  assert.match(state, /p_grade_override: gradeOverride/);
  assert.match(admin, /grade: row\.approved_grade \|\| row\.relative_grade/);
  assert.match(mail, /finalResult\.approved_grade \|\| finalResult\.relative_grade/);
  assert.match(html, /id="adjust-grade-input"/);
  assert.match(html, /onclick="closeScoreAdjustmentModal\(\)"/);
  assert.match(html, /function closeScoreAdjustmentModal\(\)/);
  assert.match(html, /finalResult\?\.approved_grade \|\| finalResult\?\.relative_grade/);
});
