import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { relationshipNotePayload } from '../lib/relationship-notes.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('relationship note input is bounded and requires two different employees', () => {
  const row = relationshipNotePayload({
    subject_user_id: 1,
    related_user_id: 2,
    category: '협업 관찰',
    note_text: '공동 업무에서 진행 상황을 명확하게 공유함.',
    observed_on: '2026-08-09',
    expires_on: '2027-02-09'
  });
  assert.equal(row.subject_user_id, 1);
  assert.equal(row.expires_on, '2027-02-09');
  assert.throws(() => relationshipNotePayload({ ...row, related_user_id: 1 }), /서로 다른 두 직원/);
  assert.throws(() => relationshipNotePayload({ ...row, note_text: '짧음' }), /10~2000자/);
  assert.throws(() => relationshipNotePayload({ ...row, expires_on: '2026-08-08' }), /유효기간/);
});

test('relationship notes are server-isolated, audited, and excluded from automatic matching', async () => {
  const [api, migration, autoMatching, index, usersApi] = await Promise.all([
    read('../lib/relationship-notes.js'),
    read('../supabase/migrations/202608090001_admin_relationship_notes.sql'),
    read('../api/auto-matching.js'),
    read('../index.html'),
    read('../api/users.js')
  ]);
  assert.match(usersApi, /authorize\(req, service\)[\s\S]*resource === 'relationship-notes'[\s\S]*handleRelationshipNotes/);
  assert.match(api, /SUPER_ADMIN_EMAIL[\s\S]*req\.method === 'DELETE'/);
  assert.match(migration, /alter table public\.relationship_notes enable row level security/);
  assert.match(migration, /revoke all on public\.relationship_notes from anon, authenticated/);
  assert.match(migration, /relationship_notes_audit_trigger/);
  assert.doesNotMatch(autoMatching, /relationship_notes|relationship_note_audit/);
  assert.match(usersApi, /relationship_notes[\s\S]*subject_user_id[\s\S]*related_user_id/);
  assert.match(index, /relationship-notes-desktop-only/);
  assert.match(index, /subtab === 'relationship-notes' && window\.innerWidth < 1024/);
  assert.match(index, /if \(window\.innerWidth < 1024[\s\S]*return/);
});
