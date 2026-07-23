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
    service.from('evaluation_cycles')
      .select('id,name,status,results_published').eq('id', cycleId).maybeSingle(),
    service.from('matchings').select('id,evaluator_id,target_id').eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluations')
      .select('matching_id,perf_score,collab_score,growth_score,harmony_score,qualitative_comment')
      .eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluation_result_adjustments')
      .select('id,raw_score,final_score,final_grade,reason,adjusted_by,adjusted_at,updated_at,status')
      .eq('cycle_id', cycleId).eq('target_id', targetId).eq('status', 'active').maybeSingle(),
    service.from('evaluation_settings')
      .select('performance_weight,collaboration_weight,growth_weight,harmony_weight').eq('id', 1).single(),
    service.from('users').select('id,active,can_evaluate,is_evaluatee')
  ]);
  if (cycleResult.error || !cycleResult.data) throw Object.assign(new Error('평가 주기를 찾을 수 없습니다.'), { status: 404 });
  if (matchingsResult.error) throw matchingsResult.error;
  if (evaluationsResult.error) throw evaluationsResult.error;
  if (adjustmentResult.error) throw adjustmentResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (usersResult.error) throw usersResult.error;
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
  const evaluations = evaluationsResult.data || [];
  const assignedIds = new Set(assigned.map(row => String(row.id)));
  const valid = evaluations.filter(row => assignedIds.has(String(row.matching_id)));
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
    comments: valid.map(row => String(row.qualitative_comment || '').trim()).filter(Boolean),
    adjustment: adjustmentResult.data || null,
    weights
  };
}

function reportSchema() {
  const category = {
    type: 'object',
    additionalProperties: false,
    required: ['pattern', 'advice'],
    properties: {
      pattern: { type: 'string' },
      advice: { type: 'string' }
    }
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'strengths', 'improvements', 'categories', 'peer_feedback_summary', 'action_plan', 'caution'],
    properties: {
      summary: { type: 'string' },
      strengths: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
      improvements: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } },
      categories: {
        type: 'object', additionalProperties: false,
        required: ['performance', 'collaboration', 'growth', 'harmony'],
        properties: { performance: category, collaboration: category, growth: category, harmony: category }
      },
      peer_feedback_summary: { type: 'string' },
      action_plan: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
      caution: { type: 'string' }
    }
  };
}

function responseText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('AI 응답에서 분석 결과를 찾지 못했습니다.');
}

async function generateReport(aggregate) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Vercel에 OPENAI_API_KEY가 등록되지 않았습니다.'), { status: 503 });
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-terra';
  const qualitativeOnly = Boolean(aggregate.adjustment);
  const input = {
    role: '직원',
    department: '비식별 처리됨',
    analysis_mode: qualitativeOnly ? 'qualitative_only' : 'scored',
    scores: qualitativeOnly ? undefined : aggregate.scores,
    category_weights: qualitativeOnly ? undefined : aggregate.weights,
    anonymous_comments: aggregate.comments
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        '당신은 인사평가 결과를 해석하는 한국어 코칭 리포트 작성자입니다.',
        qualitativeOnly
          ? '관리자 조정이 적용된 평가입니다. 점수와 등급을 언급하거나 추론하지 말고 익명 의견만 근거로 코칭하세요.'
          : '입력된 확정 점수와 익명 의견만 근거로 사용하고 사실을 만들지 마세요.',
        '점수, 등급, 승진, 징계 또는 해고 결정을 변경하거나 권고하지 마세요.',
        '평가자 신원을 추정하지 말고 성격, 건강, 정치·종교 등 민감정보를 추론하지 마세요.',
        '문장은 존중하는 어조로 구체적이고 실행 가능하게 작성하세요.'
      ].join(' '),
      input: JSON.stringify(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'hr_evaluation_report',
          strict: true,
          schema: reportSchema()
        }
      }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'OpenAI 분석 요청에 실패했습니다.');
  return { model, report: JSON.parse(responseText(payload)), analysisMode: qualitativeOnly ? 'qualitative_only' : 'scored' };
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
      const reportResult = await service.from('ai_evaluation_reports')
        .select('status,report,model,analysis_mode,generated_at,approved_at')
        .eq('cycle_id', cycleId).eq('target_id', targetId).maybeSingle();
      if (reportResult.error) throw reportResult.error;
      const privileged = PRIVILEGED_ROLES.has(profile.sys_role);
      const visible = reportResult.data && (privileged || (
        aggregate.cycle.results_published === true && reportResult.data.status === 'approved'
      ));
      const adjusted = Boolean(aggregate.adjustment);
      return send(res, 200, {
        cycle: aggregate.cycle,
        complete: aggregate.complete,
        assigned_count: aggregate.assigned_count,
        submitted_count: aggregate.submitted_count,
        weights: aggregate.weights,
        scores: aggregate.complete && (privileged || (!adjusted && aggregate.cycle.results_published)) ? aggregate.scores : null,
        adjusted,
        adjustment: privileged ? aggregate.adjustment : (adjusted ? { adjusted: true } : null),
        report: visible ? reportResult.data : null,
        state: !aggregate.complete ? 'in_progress'
          : !reportResult.data ? 'not_generated'
          : reportResult.data.status !== 'approved' ? 'awaiting_approval'
          : !privileged && !aggregate.cycle.results_published ? 'not_published'
          : 'ready'
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
    if (!PRIVILEGED_ROLES.has(profile.sys_role)) return send(res, 403, { error: '관리자 권한이 필요합니다.' });
    const action = String(req.body?.action || 'generate');
    const targetId = Number(req.body?.target_id);
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
        cycle_id: cycleId, target_id: targetId, raw_score: aggregate.scores.total,
        final_score: finalScore, final_grade: gradeFor(finalScore), reason,
        adjusted_by: authUser.id, adjusted_at: now, updated_at: now,
        status: 'active', cancelled_by: null, cancelled_at: null, cancellation_reason: null
      };
      const result = await service.from('evaluation_result_adjustments')
        .upsert(record, { onConflict: 'cycle_id,target_id' }).select().single();
      if (result.error) throw result.error;
      const eventResult = await service.from('evaluation_result_adjustment_events').insert({
        adjustment_id: result.data.id, cycle_id: cycleId, target_id: targetId,
        event_type: !previous ? 'created' : previous.status === 'cancelled' ? 'reactivated' : 'updated',
        previous_final_score: previous?.final_score ?? null, next_final_score: finalScore,
        reason, acted_by: authUser.id, occurred_at: now
      });
      if (eventResult.error) throw eventResult.error;
      const staleReport = await service.from('ai_evaluation_reports')
        .delete().eq('cycle_id', cycleId).eq('target_id', targetId);
      if (staleReport.error) throw staleReport.error;
      return send(res, 200, { adjustment: result.data, ai_report_invalidated: true });
    }

    if (action === 'cancel_adjustment') {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 10) return send(res, 400, { error: '조정 취소 사유를 10자 이상 입력해 주세요.' });
      const aggregate = await aggregateTarget(service, cycleId, targetId);
      const activeAdjustment = aggregate.adjustment;
      if (!activeAdjustment) return send(res, 409, { error: '활성화된 점수 조정 내역이 없습니다.' });
      const now = new Date().toISOString();
      const cancelResult = await service.from('evaluation_result_adjustments').update({
        status: 'cancelled', cancelled_by: authUser.id, cancelled_at: now,
        cancellation_reason: reason, updated_at: now
      }).eq('id', activeAdjustment.id).eq('status', 'active').select().single();
      if (cancelResult.error) throw cancelResult.error;
      const eventResult = await service.from('evaluation_result_adjustment_events').insert({
        adjustment_id: activeAdjustment.id, cycle_id: cycleId, target_id: targetId,
        event_type: 'cancelled', previous_final_score: activeAdjustment.final_score,
        next_final_score: aggregate.scores.total, reason, acted_by: authUser.id, occurred_at: now
      });
      if (eventResult.error) throw eventResult.error;
      const staleReport = await service.from('ai_evaluation_reports')
        .delete().eq('cycle_id', cycleId).eq('target_id', targetId);
      if (staleReport.error) throw staleReport.error;
      return send(res, 200, { adjustment: cancelResult.data, restored_raw_score: aggregate.scores.total, ai_report_invalidated: true });
    }

    if (action === 'approve') {
      const result = await service.from('ai_evaluation_reports').update({
        status: 'approved', approved_by: authUser.id,
        approved_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('cycle_id', cycleId).eq('target_id', targetId).select().single();
      if (result.error) throw result.error;
      return send(res, 200, { report: result.data });
    }

    if (action === 'publish') {
      const published = req.body?.published;
      if (typeof published !== 'boolean') return send(res, 400, { error: '공개 상태가 필요합니다.' });
      const result = await service.from('evaluation_cycles')
        .update({ results_published: published }).eq('id', cycleId).select().single();
      if (result.error) throw result.error;
      return send(res, 200, { cycle: result.data });
    }

    const aggregate = await aggregateTarget(service, cycleId, targetId);
    if (!aggregate.complete) {
      return send(res, 409, {
        error: `모든 평가가 완료되어야 합니다. (${aggregate.submitted_count}/${aggregate.assigned_count})`
      });
    }
    const generated = await generateReport(aggregate);
    const record = {
      cycle_id: cycleId, target_id: targetId,
      source_evaluation_count: aggregate.submitted_count,
      perf_score: aggregate.scores.performance,
      collab_score: aggregate.scores.collaboration,
      growth_score: aggregate.scores.growth,
      harmony_score: aggregate.scores.harmony,
      total_score: aggregate.scores.total,
      report: generated.report, status: 'draft', model: generated.model,
      analysis_mode: generated.analysisMode,
      generated_by: authUser.id, generated_at: new Date().toISOString(),
      approved_by: null, approved_at: null, updated_at: new Date().toISOString()
    };
    const result = await service.from('ai_evaluation_reports')
      .upsert(record, { onConflict: 'cycle_id,target_id' }).select().single();
    if (result.error) throw result.error;
    return send(res, 200, { report: result.data });
  } catch (error) {
    console.error('AI report API error:', error);
    return send(res, error.status || 500, { error: error.message || 'AI 리포트 처리 중 오류가 발생했습니다.' });
  }
}
