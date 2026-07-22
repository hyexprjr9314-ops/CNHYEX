import { createClient } from '@supabase/supabase-js';

const send = (res, status, payload) => res.status(status).json(payload);

async function authorize(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('로그인이 필요합니다.');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('유효하지 않은 로그인입니다.');
  const { data: profile } = await service.from('users').select('sys_role,active').eq('auth_user_id', data.user.id).maybeSingle();
  if (!profile || profile.active !== true || !['관리자', '임원'].includes(profile.sys_role)) throw new Error('관리자 권한이 필요합니다.');
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
    const results = [];
    for (const raw of questions) {
      const row = {
        cycle_id: Number(raw.cycle_id), category: String(raw.category || '').trim(),
        target_track: String(raw.target_track || '기본 필수질문').trim(),
        target_dept: String(raw.target_dept || '전체').trim(), type: String(raw.type || '5지선다형').trim(),
        weight: Number(raw.weight), text: String(raw.text || '').trim(),
        required: raw.required !== false, is_default: raw.is_default !== false, max_score: 5
      };
      if (!row.cycle_id || !row.category || !row.text || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100) {
        results.push({ text: row.text, status: 'failed', message: '필수값 또는 가중치 오류' }); continue;
      }
      const { data: existing, error: findError } = await service.from('evaluation_questions').select('id')
        .eq('cycle_id', row.cycle_id).eq('category', row.category).eq('text', row.text)
        .eq('target_track', row.target_track).eq('target_dept', row.target_dept).maybeSingle();
      if (findError) { results.push({ text: row.text, status: 'failed', message: findError.message }); continue; }
      const write = existing
        ? await service.from('evaluation_questions').update(row).eq('id', existing.id)
        : await service.from('evaluation_questions').insert(row);
      results.push({ text: row.text, status: write.error ? 'failed' : 'success', message: write.error?.message || (existing ? 'updated' : 'created') });
    }
    return send(res, 200, { results, success: results.filter(r => r.status === 'success').length, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    return send(res, /권한|로그인/.test(error.message) ? 403 : 500, { error: error.message });
  }
}
