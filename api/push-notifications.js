import { createClient } from '@supabase/supabase-js';
import { notifyAndDispatch } from './_push.js';
import { ROLES } from './role-policy.js';

const send = (res, status, payload) => res.status(status).json(payload);

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('로그인이 만료되었습니다.'), { status: 401 });
  const profile = await service.from('users')
    .select('id,name,sys_role,active')
    .eq('auth_user_id', auth.data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true) {
    throw Object.assign(new Error('활성 사용자 정보를 찾을 수 없습니다.'), { status: 403 });
  }
  return profile.data;
}

async function notifyCollectionComplete(service, profile, cycleId) {
  const matchingResult = await service.from('matchings')
    .select('id,evaluator_id,target_id')
    .eq('cycle_id', cycleId);
  if (matchingResult.error) throw matchingResult.error;
  const matching = matchingResult.data || [];
  if (!matching.some(row => Number(row.evaluator_id) === Number(profile.id))) {
    throw Object.assign(new Error('본인에게 배정된 평가주기가 아닙니다.'), { status: 403 });
  }
  const matchingIds = matching.map(row => Number(row.id));
  if (!matchingIds.length) return { complete: false };
  const evaluations = await service.from('evaluations')
    .select('matching_id')
    .eq('cycle_id', cycleId)
    .in('matching_id', matchingIds);
  if (evaluations.error) throw evaluations.error;
  const submitted = new Set((evaluations.data || []).map(row => Number(row.matching_id)));
  const complete = matchingIds.every(id => submitted.has(id));
  if (!complete) return { complete: false };
  const recipients = await service.from('users')
    .select('id')
    .eq('active', true)
    .in('sys_role', [ROLES.admin, ROLES.executive]);
  if (recipients.error) throw recipients.error;
  await notifyAndDispatch(service, {
    eventKey: `collection_complete:${cycleId}`,
    cycleId,
    type: 'collection_completed',
    title: '평가 취합 완료',
    message: '평가자들의 평가 결과 취합이 완료되었습니다.',
    recipientUserIds: (recipients.data || []).map(row => row.id),
    targetView: 'closingmanage',
    targetSubtab: 'progress'
  });
  return { complete: true };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    const service = serviceClient();
    const profile = await authenticate(req, service);
    const action = String(req.body?.action || '');
    if (action === 'register') {
      const token = String(req.body?.token || '').trim();
      if (token.length < 20) return send(res, 400, { error: '유효한 기기 토큰이 필요합니다.' });
      const row = {
        user_id: profile.id,
        token,
        platform: 'android',
        device_id: String(req.body?.device_id || '').slice(0, 200) || null,
        app_version: String(req.body?.app_version || '').slice(0, 50) || null,
        active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const result = await service.from('push_device_tokens')
        .upsert(row, { onConflict: 'token' })
        .select('id,user_id,active')
        .single();
      if (result.error) throw result.error;
      return send(res, 200, { data: result.data });
    }
    if (action === 'unregister') {
      const token = String(req.body?.token || '').trim();
      const result = await service.from('push_device_tokens')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('token', token)
        .select('id');
      if (result.error) throw result.error;
      return send(res, 200, { data: result.data || [] });
    }
    if (action === 'evaluation_submitted') {
      const cycleId = Number(req.body?.cycle_id);
      if (!cycleId) return send(res, 400, { error: '평가주기 ID가 필요합니다.' });
      return send(res, 200, { data: await notifyCollectionComplete(service, profile, cycleId) });
    }
    return send(res, 400, { error: 'Unsupported push notification action.' });
  } catch (error) {
    console.error('Push notification API error:', error);
    return send(res, error.status || 500, { error: error.message || 'Unable to process push notification.' });
  }
}
