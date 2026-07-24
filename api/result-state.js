import { createClient } from '@supabase/supabase-js';

const PRIVILEGED_ROLES = new Set(['관리자', '임원']);
const send = (res, status, payload) => res.status(status).json(payload);

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('유효하지 않은 로그인입니다.'), { status: 401 });
  const profileResult = await service.from('users')
    .select('id,name,dept,role,sys_role,active,auth_user_id')
    .eq('auth_user_id', data.user.id).maybeSingle();
  if (profileResult.error || !profileResult.data || profileResult.data.active !== true) {
    throw Object.assign(new Error('활성 직원 프로필을 찾을 수 없습니다.'), { status: 403 });
  }
  return { authUser: data.user, profile: profileResult.data };
}

async function aggregateTarget(service, cycleId, targetId) {
  const [cycleResult, matchingsResult, evaluationsResult, adjustmentResult, settingsResult, usersResult] = await Promise.all([
    service.from('evaluation_cycles').select('id,name,status,results_published').eq('id', cycleId).maybeSingle(),
    service.from('matchings').select('id,evaluator_id,target_id').eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluations')
      .select('matching_id,perf_score,collab_score,growth_score,harmony_score')
      .eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluation_result_adjustments')
      .select('id,raw_score,final_score,final_grade,reason,adjusted_by,adjusted_at,updated_at,status')
      .eq('cycle_id', cycleId).eq('target_id', targetId).eq('status', 'active').maybeSingle(),
    service.from('evaluation_settings')
      .select('performance_weight,collaboration_weight,growth_weight,harmony_weight').eq('id', 1).single(),
    service.from('users').select('id,active,can_evaluate,is_evaluatee')
  ]);
  for (const result of [cycleResult, matchingsResult, evaluationsResult, adjustmentResult, settingsResult, usersResult]) {
    if (result.error) throw result.error;
  }
  if (!cycleResult.data) throw Object.assign(new Error('평가 주기를 찾을 수 없습니다.'), { status: 404 });

  const weights = {
    performance: Number(settingsResult.data.performance_weight) / 100,
    collaboration: Number(settingsResult.data.collaboration_weight) / 100,
    growth: Number(settingsResult.data.growth_weight) / 100,
    harmony: Number(settingsResult.data.harmony_weight) / 100
  };
  const userMap = new Map((usersResult.data || []).map(user => [Number(user.id), user]));
  const assigned = (matchingsResult.data || []).filter(row => {
    const evaluator = userMap.get(Number(row.evaluator_id));
    const target = userMap.get(Number(row.target_id));
    return evaluator?.active === true && evaluator.can_evaluate !== false
      && target?.active === true && target.is_evaluatee !== false;
  });
  const assignedIds = new Set(assigned.map(row => String(row.id)));
  const valid = (evaluationsResult.data || []).filter(row => assignedIds.has(String(row.matching_id)));
  const complete = assigned.length > 0 && valid.length === assigned.length;

  if (!complete) {
    return {
      cycle: cycleResult.data,
      complete: false,
      assigned_count: assigned.length,
      submitted_count: valid.length,
      adjustment: adjustmentResult.data || null,
      weights
    };
  }

  const average = key => Number((valid.reduce((sum, row) => sum + Number(row[key] || 0), 0) / valid.length).toFixed(2));
  const scores = {
    performance: average('perf_score'),
    collaboration: average('collab_score'),
    growth: average('growth_score'),
    harmony: average('harmony_score')
  };
  scores.total = Number((
    scores.performance * weights.performance
    + scores.collaboration * weights.collaboration
    + scores.growth * weights.growth
    + scores.harmony * weights.harmony
  ).toFixed(2));

  return {
    cycle: cycleResult.data,
    complete: true,
    assigned_count: assigned.length,
    submitted_count: valid.length,
    scores,
    adjustment: adjustmentResult.data || null,
    weights
  };
}

function gradeFor(score) {
  if (score >= 100) return 'EX';
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

export default async function handler(req, res) {
  try {
    const service = serviceClient();
    const { authUser, profile } = await authenticate(req, service);
    const cycleId = Number(req.method === 'GET' ? req.query?.cycle_id : req.body?.cycle_id);
    if (!cycleId) return send(res, 400, { error: '평가 주기 ID가 필요합니다.' });

    if (req.method === 'GET') {
      const targetId = Number(req.query?.target_id || profile.id);
      if (targetId !== profile.id && !PRIVILEGED_ROLES.has(profile.sys_role)) {
        return send(res, 403, { error: '다른 직원의 결과를 조회할 권한이 없습니다.' });
      }
      const aggregate = await aggregateTarget(service, cycleId, targetId);
      const privileged = PRIVILEGED_ROLES.has(profile.sys_role);
      const adjusted = Boolean(aggregate.adjustment);
      return send(res, 200, {
        cycle: aggregate.cycle,
        complete: aggregate.complete,
        assigned_count: aggregate.assigned_count,
        submitted_count: aggregate.submitted_count,
        weights: aggregate.weights,
        scores: aggregate.complete && (privileged || (!adjusted && aggregate.cycle.results_published))
          ? aggregate.scores
          : null,
        adjusted,
        adjustment: privileged
          ? aggregate.adjustment
          : adjusted
            ? {
                adjusted: true,
                final_grade: aggregate.cycle.results_published === true
                  ? aggregate.adjustment.final_grade
                  : null
              }
            : null,
        state: !aggregate.complete
          ? 'in_progress'
          : !privileged && !aggregate.cycle.results_published
            ? 'not_published'
            : 'ready'
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
    if (!PRIVILEGED_ROLES.has(profile.sys_role)) return send(res, 403, { error: '관리자 권한이 필요합니다.' });
    const action = String(req.body?.action || '');
    const targetId = Number(req.body?.target_id);

    if (action === 'publish') {
      const published = req.body?.published;
      if (typeof published !== 'boolean') return send(res, 400, { error: '공개 상태가 필요합니다.' });
      const result = await service.from('evaluation_cycles')
        .update({ results_published: published }).eq('id', cycleId).select().single();
      if (result.error) throw result.error;
      return send(res, 200, { cycle: result.data });
    }

    if (!targetId) return send(res, 400, { error: '피평가자 ID가 필요합니다.' });
    if (action === 'adjust') {
      const finalScore = Number(req.body?.final_score);
      const reason = String(req.body?.reason || '').trim();
      if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) {
        return send(res, 400, { error: '조정 점수는 0~100 사이여야 합니다.' });
      }
      if (reason.length < 10) return send(res, 400, { error: '조정 사유를 10자 이상 입력해 주세요.' });
      const aggregate = await aggregateTarget(service, cycleId, targetId);
      if (!aggregate.complete) return send(res, 409, { error: '모든 평가가 완료된 뒤 조정할 수 있습니다.' });
      const previousResult = await service.from('evaluation_result_adjustments')
        .select('id,status,final_score').eq('cycle_id', cycleId).eq('target_id', targetId).maybeSingle();
      if (previousResult.error) throw previousResult.error;
      const previous = previousResult.data;
      const now = new Date().toISOString();
      const record = {
        cycle_id: cycleId,
        target_id: targetId,
        raw_score: aggregate.scores.total,
        final_score: finalScore,
        final_grade: gradeFor(finalScore),
        reason,
        adjusted_by: authUser.id,
        adjusted_at: now,
        updated_at: now,
        status: 'active',
        cancelled_by: null,
        cancelled_at: null,
        cancellation_reason: null
      };
      const result = await service.from('evaluation_result_adjustments')
        .upsert(record, { onConflict: 'cycle_id,target_id' }).select().single();
      if (result.error) throw result.error;
      const eventResult = await service.from('evaluation_result_adjustment_events').insert({
        adjustment_id: result.data.id,
        cycle_id: cycleId,
        target_id: targetId,
        event_type: !previous ? 'created' : previous.status === 'cancelled' ? 'reactivated' : 'updated',
        previous_final_score: previous?.final_score ?? null,
        next_final_score: finalScore,
        reason,
        acted_by: authUser.id,
        occurred_at: now
      });
      if (eventResult.error) throw eventResult.error;
      return send(res, 200, { adjustment: result.data });
    }

    if (action === 'cancel_adjustment') {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 10) return send(res, 400, { error: '조정 취소 사유를 10자 이상 입력해 주세요.' });
      const aggregate = await aggregateTarget(service, cycleId, targetId);
      if (!aggregate.adjustment) return send(res, 409, { error: '활성화된 점수 조정 내역이 없습니다.' });
      const now = new Date().toISOString();
      const cancelResult = await service.from('evaluation_result_adjustments').update({
        status: 'cancelled',
        cancelled_by: authUser.id,
        cancelled_at: now,
        cancellation_reason: reason,
        updated_at: now
      }).eq('id', aggregate.adjustment.id).eq('status', 'active').select().single();
      if (cancelResult.error) throw cancelResult.error;
      const eventResult = await service.from('evaluation_result_adjustment_events').insert({
        adjustment_id: aggregate.adjustment.id,
        cycle_id: cycleId,
        target_id: targetId,
        event_type: 'cancelled',
        previous_final_score: aggregate.adjustment.final_score,
        next_final_score: aggregate.scores.total,
        reason,
        acted_by: authUser.id,
        occurred_at: now
      });
      if (eventResult.error) throw eventResult.error;
      return send(res, 200, {
        adjustment: cancelResult.data,
        restored_raw_score: aggregate.scores.total
      });
    }

    return send(res, 400, { error: '지원하지 않는 결과 관리 작업입니다.' });
  } catch (error) {
    console.error('Result state API error:', error);
    return send(res, error.status || 500, { error: error.message || '평가 결과 처리 중 오류가 발생했습니다.' });
  }
}
