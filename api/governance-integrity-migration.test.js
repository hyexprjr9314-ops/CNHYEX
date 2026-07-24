import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607240007_governance_integrity_hardening.sql', import.meta.url);

async function migrationSource() {
  return readFile(migrationUrl, 'utf8');
}

test('integrity migration removes the premature final-grade requirement', async () => {
  const source = await migrationSource();
  assert.match(source, /alter table public\.evaluation_result_adjustments\s+alter column final_grade drop not null/i);
  assert.match(source, /add column if not exists category_scores jsonb not null/i);
});

test('finalization RPC accepts no caller-supplied result JSON and computes locked DB inputs', async () => {
  const source = await migrationSource();
  assert.match(source, /drop function if exists public\.governance_finalize_cycle\(bigint,uuid,jsonb,jsonb,jsonb,jsonb\)/i);
  assert.match(source, /create or replace function public\.governance_finalize_cycle\(\s*p_cycle_id bigint,\s*p_actor_id uuid\s*\)/is);
  assert.doesNotMatch(source, /governance_finalize_cycle\(\s*p_cycle_id bigint,\s*p_actor_id uuid,\s*p_snapshot/is);
  for (const guard of [
    "public.governance_actor_role(p_actor_id) <> '관리자'",
    'from public.evaluation_cycles where id = p_cycle_id for update',
    'perform 1 from public.matchings where cycle_id = p_cycle_id for update',
    'perform 1 from public.evaluations where cycle_id = p_cycle_id for update',
    'perform 1 from public.evaluation_result_adjustments where cycle_id = p_cycle_id for update',
    'All active adjustments require stage 2 completion',
    'Largest-remainder allocation',
    'insert into public.evaluation_final_results',
    'insert into public.evaluation_archives'
  ]) assert.ok(source.includes(guard), `missing finalization guard: ${guard}`);
});

test('executives are denied raw RLS tables and get only a safe aggregate RPC', async () => {
  const source = await migrationSource();
  for (const policy of [
    'users_read_self_or_admin',
    'matchings_read_owner_or_admin',
    'evaluations_read_owner_or_admin',
    'evaluation_answers_read_owner_or_admin',
    'employee_goals_read_self_or_admin',
    'result_adjustments_read_admin'
  ]) assert.ok(source.includes(policy), `missing policy ${policy}`);
  assert.match(source, /create or replace function public\.executive_cycle_governance_summary\(\)/i);
  assert.match(source, /returns table[\s\S]*active_adjustment_count integer[\s\S]*stage2_adjustment_count integer/i);
});

test('publication changes leave a gate-open or gate-closed audit event', async () => {
  const source = await migrationSource();
  assert.match(source, /insert into public\.evaluation_cycle_approval_audit/i);
  assert.match(source, /case when p_published then 'gate_opened' else 'gate_closed' end/i);
});

test('activation validates the actual matching track and relationship audience', async () => {
  const source = await migrationSource();
  assert.match(source, /create or replace function public\.validate_cycle_question_coverage\(p_cycle_id bigint\)/i);
  assert.match(source, /q\.audience=rc\.relationship_type/i);
  assert.match(source, /v_coverage := public\.validate_cycle_question_coverage\(p_cycle_id\)/i);
});
