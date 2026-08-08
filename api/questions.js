import { createClient } from '@supabase/supabase-js';
import { ROLES } from './role-policy.js';
import { normalizeTrack, QUESTION_AUDIENCES } from './evaluation-classification.js';

const send = (res, status, payload) => res.status(status).json(payload);

const APPROVAL_NOT_REQUESTED = 'not_requested';
const DRAFT_CYCLE_STATUSES = new Set(['\uCD08\uC548', 'draft', 'not_started']);
const PAUSED_CYCLE_STATUSES = new Set(['\uC77C\uC2DC\uC815\uC9C0', 'paused']);

export function isMutableDraftCycle(cycle = {}) {
  return DRAFT_CYCLE_STATUSES.has(String(cycle.status || '').trim())
    && String(cycle.internal_approval_status || APPROVAL_NOT_REQUESTED) === APPROVAL_NOT_REQUESTED;
}

export function normalizeQuestionRows(rawQuestions) {
  return rawQuestions.map(raw => ({
    cycle_id: Number(raw.cycle_id), category: String(raw.category || '').trim(),
    target_track: normalizeTrack(raw.target_track),
    target_dept: '\uC804\uCCB4', type: String(raw.type || '5\uC9C0\uC120\uB2E4\uD615').trim(),
    audience: Object.values(QUESTION_AUDIENCES).includes(raw.audience) ? raw.audience : QUESTION_AUDIENCES.standard,
    weight: 1, text: String(raw.text || '').trim(),
    required: raw.required !== false, is_default: raw.is_default !== false, max_score: 5
  }));
}

// CSV import bypasses admin-state, so validate every referenced cycle before
// the service-role client is allowed to write a single question.
export async function assertQuestionCyclesMutable(service, cycleIds) {
  const uniqueCycleIds = [...new Set(cycleIds.map(Number).filter(Number.isInteger))];
  if (!uniqueCycleIds.length) throw Object.assign(new Error('\uD3C9\uAC00 \uC8FC\uAE30\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.'), { status: 400 });
  const response = await service.from('evaluation_cycles').select('id,status,internal_approval_status').in('id', uniqueCycleIds);
  if (response.error) throw response.error;
  const byId = new Map((response.data || []).map(cycle => [Number(cycle.id), cycle]));
  const pausedCycleIds = [];
  for (const cycleId of uniqueCycleIds) {
    const cycle = byId.get(cycleId);
    if (!cycle) throw Object.assign(new Error(`\uD3C9\uAC00 \uC8FC\uAE30 #${cycleId}\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`), { status: 404 });
    if (isMutableDraftCycle(cycle)) continue;
    if (PAUSED_CYCLE_STATUSES.has(String(cycle.status || '').trim())
        && String(cycle.internal_approval_status || APPROVAL_NOT_REQUESTED) === APPROVAL_NOT_REQUESTED) {
      pausedCycleIds.push(cycleId);
      continue;
    }
    throw Object.assign(new Error('\uCD08\uC548 \uB610\uB294 \uC544\uC9C1 \uC81C\uCD9C\uC774 \uC5C6\uB294 \uC77C\uC2DC\uC815\uC9C0 \uC8FC\uAE30\uC5D0\uC11C\uB9CC \uC9C8\uBB38\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'), { status: 409 });
  }
  if (pausedCycleIds.length) {
    const submitted = await service.from('evaluations').select('id', { count: 'exact', head: true }).in('cycle_id', pausedCycleIds);
    if (submitted.error) throw submitted.error;
    if (submitted.count > 0) {
      throw Object.assign(new Error('\uC774\uBBF8 \uC81C\uCD9C\uB41C \uD3C9\uAC00\uAC00 \uC788\uC5B4 \uC77C\uC2DC\uC815\uC9C0 \uC8FC\uAE30\uC758 \uC9C8\uBB38\uC744 \uBCC0\uACBD\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'), { status: 409 });
    }
  }
  return uniqueCycleIds;
}

async function authorize(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('유효하지 않은 로그인입니다.'), { status: 401 });
  const { data: profile } = await service.from('users').select('sys_role,active').eq('auth_user_id', data.user.id).maybeSingle();
  if (!profile || profile.active !== true || profile.sys_role !== ROLES.admin) throw Object.assign(new Error('관리자 권한이 필요합니다.'), { status: 403 });
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 500, { error: 'Vercel 환경변수가 설정되지 않았습니다.' });
  const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    await authorize(req, service);
    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (!questions.length || questions.length > 500) return send(res, 400, { error: '질문 1~500개를 전달해 주세요.' });
    const rows = normalizeQuestionRows(questions);
    await assertQuestionCyclesMutable(service, rows.map(row => row.cycle_id));
    const results = [];
    for (const row of rows) {
      if (!row.cycle_id || !row.category || !row.text) {
        results.push({ text: row.text, status: 'failed', message: '필수값 오류' }); continue;
      }
      const { data: existing, error: findError } = await service.from('evaluation_questions').select('id')
        .eq('cycle_id', row.cycle_id).eq('category', row.category).eq('text', row.text)
        .eq('target_track', row.target_track).eq('target_dept', row.target_dept).eq('audience', row.audience).maybeSingle();
      if (findError) { results.push({ text: row.text, status: 'failed', message: findError.message }); continue; }
      const write = existing
        ? await service.from('evaluation_questions').update(row).eq('id', existing.id)
        : await service.from('evaluation_questions').insert(row);
      results.push({ text: row.text, status: write.error ? 'failed' : 'success', message: write.error?.message || (existing ? 'updated' : 'created') });
    }
    return send(res, 200, { results, success: results.filter(r => r.status === 'success').length, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    return send(res, error.status || (/권한|로그인/.test(error.message) ? 403 : 500), { error: error.message });
  }
}
