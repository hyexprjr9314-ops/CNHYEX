import { createClient } from '@supabase/supabase-js';
import { ROLES } from './role-policy.js';
import { normalizeTrack } from './evaluation-classification.js';

const send = (res, status, payload) => res.status(status).json(payload);

const APPROVAL_NOT_REQUESTED = 'not_requested';
const DRAFT_CYCLE_STATUSES = new Set(['\uCD08\uC548', 'draft', 'not_started']);

export function isMutableDraftCycle(cycle = {}) {
  return DRAFT_CYCLE_STATUSES.has(String(cycle.status || '').trim())
    && String(cycle.internal_approval_status || APPROVAL_NOT_REQUESTED) === APPROVAL_NOT_REQUESTED;
}

export function normalizeQuestionRows(rawQuestions) {
  return rawQuestions.map(raw => ({
    cycle_id: Number(raw.cycle_id), category: String(raw.category || '').trim(),
    target_track: normalizeTrack(raw.target_track),
    target_dept: String(raw.target_dept || '\uC804\uCCB4').trim(), type: String(raw.type || '5\uC9C0\uC120\uB2E4\uD615').trim(),
    audience: String(raw.audience || 'all').trim(), weight: Number(raw.weight), text: String(raw.text || '').trim(),
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
  for (const cycleId of uniqueCycleIds) {
    const cycle = byId.get(cycleId);
    if (!cycle) throw Object.assign(new Error(`\uD3C9\uAC00 \uC8FC\uAE30 #${cycleId}\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`), { status: 404 });
    if (!isMutableDraftCycle(cycle)) {
      throw Object.assign(new Error('\uCD08\uC548(\uBBF8\uC2DC\uC791) \uC0C1\uD0DC\uC758 \uD3C9\uAC00 \uC8FC\uAE30\uC5D0\uC11C\uB9CC \uC9C8\uBB38\uC744 \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'), { status: 409 });
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
      if (!['all', 'internal', 'exchange', 'leadership'].includes(row.audience)) {
        results.push({ text: row.text, status: 'failed', message: '질문 대상 관계는 all, internal, exchange, leadership 중 하나여야 합니다.' }); continue;
      }
      if (!row.cycle_id || !row.category || !row.text || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100) {
        results.push({ text: row.text, status: 'failed', message: '필수값 또는 가중치 오류' }); continue;
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
