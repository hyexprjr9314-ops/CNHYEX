import { createClient } from '@supabase/supabase-js';
import { TRACK_CATEGORIES, targetTrack } from './evaluation-classification.js';
import { ROLES } from './role-policy.js';
import { dispatchPushNotifications, notifyAndDispatch } from './_push.js';

const PRIVILEGED_ROLES = new Set([ROLES.admin, ROLES.executive]);
const send = (res, status, payload) => res.status(status).json(payload);

export function isFinalResultAdjusted(result = {}) {
  return Number(result.raw_score) !== Number(result.effective_score)
    || Boolean(result.approved_grade && result.approved_grade !== result.relative_grade);
}

const COHORT_LABELS = Object.freeze({
  headquarters: '본사',
  branch: '영업소',
  mechanic: '정비사'
});

export function buildGradeBasis(result = {}, cohortResults = []) {
  const grade = result.approved_grade || result.relative_grade;
  const cohortKey = String(result.cohort_key || 'headquarters');
  const cohortLabel = COHORT_LABELS[cohortKey] || '해당 직군';
  if (!grade) return null;
  if (result.approved_grade && result.approved_grade !== result.relative_grade) {
    return {
      type: 'approved_override', cohort_key: cohortKey, cohort_label: cohortLabel,
      grade, calculated_grade: result.relative_grade,
      text: `상대평가 산정등급 ${result.relative_grade}에서 최종 승인 절차를 거쳐 ${grade}등급으로 확정되었습니다.`
    };
  }
  if (grade === 'EX') {
    return {
      type: 'exceptional', cohort_key: cohortKey, cohort_label: cohortLabel,
      grade, top_percent: 0,
      text: '최종점수 100점을 달성하여 상대평가 비율과 별도로 EX 특별등급이 부여되었습니다.'
    };
  }
  const ranked = (cohortResults || [])
    .filter(row => String(row.cohort_key) === cohortKey && row.relative_grade !== 'EX')
    .sort((a, b) => Number(b.effective_score) - Number(a.effective_score)
      || Number(b.raw_score) - Number(a.raw_score)
      || Number(a.target_id) - Number(b.target_id));
  const rankIndex = ranked.findIndex(row => Number(row.target_id) === Number(result.target_id));
  const topPercent = rankIndex < 0 || ranked.length === 0
    ? null
    : Math.max(1, Math.ceil(((rankIndex + 1) / ranked.length) * 100));
  return {
    type: 'relative', cohort_key: cohortKey, cohort_label: cohortLabel,
    grade, top_percent: topPercent,
    text: topPercent
      ? `${cohortLabel} 집계구역 상대평가에서 상위 ${topPercent}% 구간에 해당하여 ${grade}등급으로 산정되었습니다.`
      : `${cohortLabel} 집계구역 상대평가 기준에 따라 ${grade}등급으로 산정되었습니다.`
  };
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authenticatedRpcClient(accessToken) {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) throw new Error('SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required for authenticated RPC calls.');
  return createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

async function authenticate(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Login is required.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('Invalid session.'), { status: 401 });
  const profile = await service.from('users')
    .select('id,sys_role,active,auth_user_id')
    .eq('auth_user_id', auth.data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true) {
    throw Object.assign(new Error('Active employee profile is required.'), { status: 403 });
  }
  return { authUser: auth.data.user, profile: profile.data, accessToken: token };
}

async function aggregateTarget(service, cycleId, targetId) {
  const cycle = await service.from('evaluation_cycles')
    .select('id,name,status,results_published,internal_approval_required,internal_approval_status,result_gate_open,result_version')
    .eq('id', cycleId).maybeSingle();
  if (cycle.error) throw cycle.error;
  if (!cycle.data) throw Object.assign(new Error('Evaluation cycle not found.'), { status: 404 });

  // A closed cycle is a legal record, not a live dashboard.  Never let later
  // edits to employees, questions, weights, or evaluations change this view.
  if (Number(cycle.data.result_version || 0) > 0) {
    const finalResult = await service.from('evaluation_final_results')
      .select('target_id,cohort_key,raw_score,effective_score,relative_grade,approved_grade,category_labels,category_scores,result_version')
      .eq('cycle_id', cycleId)
      .eq('target_id', targetId)
      .eq('result_version', cycle.data.result_version)
      .maybeSingle();
    if (finalResult.error) throw finalResult.error;
    if (finalResult.data) {
      const cohortResults = await service.from('evaluation_final_results')
        .select('target_id,cohort_key,raw_score,effective_score,relative_grade,approved_grade')
        .eq('cycle_id', cycleId)
        .eq('result_version', cycle.data.result_version)
        .eq('cohort_key', finalResult.data.cohort_key);
      if (cohortResults.error) throw cohortResults.error;
      return {
        cycle: cycle.data,
        complete: true,
        assigned_count: null,
        submitted_count: null,
        adjustment: null,
        adjusted: isFinalResultAdjusted(finalResult.data),
        relative_grade: finalResult.data.approved_grade || finalResult.data.relative_grade,
        calculated_grade: finalResult.data.relative_grade,
        grade_basis: buildGradeBasis(finalResult.data, cohortResults.data || []),
        scores: {
          ...(finalResult.data.category_scores || {}),
          raw_total: Number(finalResult.data.raw_score),
          total: Number(finalResult.data.effective_score)
        },
        weights: null,
        category_labels: finalResult.data.category_labels || [],
        final_result_version: Number(finalResult.data.result_version)
      };
    }
    throw Object.assign(new Error('Current final result is missing for this evaluation cycle.'), { status: 409 });
  }

  const [matchings, evaluations, adjustment, settings, users] = await Promise.all([
    service.from('matchings').select('id,evaluator_id,target_id').eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluations').select('matching_id,perf_score,collab_score,growth_score,harmony_score').eq('cycle_id', cycleId).eq('target_id', targetId),
    service.from('evaluation_result_adjustments').select('id,raw_score,final_score,grade_override,reason,status,workflow_status').eq('cycle_id', cycleId).eq('target_id', targetId).eq('status', 'active').maybeSingle(),
    service.from('evaluation_settings').select('performance_weight,collaboration_weight,growth_weight,harmony_weight,track_category_weights').eq('id', 1).single(),
    service.from('users').select('id,active,can_evaluate,is_evaluatee,company,dept,workplace,role,type')
  ]);
  for (const result of [matchings, evaluations, adjustment, settings, users]) {
    if (result.error) throw result.error;
  }

  const usersById = new Map((users.data || []).map(user => [Number(user.id), user]));
  const target = usersById.get(Number(targetId));
  const track = targetTrack(target);
  const categoryLabels = TRACK_CATEGORIES[track] || TRACK_CATEGORIES.headquarters_member;
  const scopedWeights = settings.data.track_category_weights?.[track];
  const weightValues = Array.isArray(scopedWeights) && scopedWeights.length === 4
    ? scopedWeights.map(Number)
    : [settings.data.performance_weight, settings.data.collaboration_weight, settings.data.growth_weight, settings.data.harmony_weight].map(Number);
  const weights = {
    performance: weightValues[0] / 100, collaboration: weightValues[1] / 100,
    growth: weightValues[2] / 100, harmony: weightValues[3] / 100
  };
  const assigned = (matchings.data || []).filter(row => {
    const evaluator = usersById.get(Number(row.evaluator_id));
    const evaluated = usersById.get(Number(row.target_id));
    return evaluator?.active === true && evaluator.can_evaluate !== false
      && evaluated?.active === true && evaluated.is_evaluatee !== false;
  });
  const assignedIds = new Set(assigned.map(row => String(row.id)));
  const submitted = (evaluations.data || []).filter(row => assignedIds.has(String(row.matching_id)));
  const complete = assigned.length > 0 && submitted.length === assigned.length;
  const base = {
    cycle: cycle.data,
    complete,
    assigned_count: assigned.length,
    submitted_count: submitted.length,
    adjustment: adjustment.data || null,
    adjusted: Boolean(adjustment.data),
    relative_grade: null,
    weights,
    category_labels: categoryLabels
  };
  if (!complete) return base;

  const average = field => Number((submitted.reduce((sum, row) => sum + Number(row[field] || 0), 0) / submitted.length).toFixed(2));
  const scores = {
    performance: average('perf_score'),
    collaboration: average('collab_score'),
    growth: average('growth_score'),
    harmony: average('harmony_score')
  };
  scores.total = Number((scores.performance * weights.performance + scores.collaboration * weights.collaboration + scores.growth * weights.growth + scores.harmony * weights.harmony).toFixed(2));
  return { ...base, scores };
}

export function hasUnresolvedActiveAdjustment(adjustments) {
  return adjustments.some(adjustment => adjustment.status === 'active' && adjustment.workflow_status !== 'second_stage_adjusted');
}

export function secondStageFinalScore(requestedScore, currentScore) {
  const candidate = requestedScore === undefined || requestedScore === null || requestedScore === '' ? Number(currentScore) : Number(requestedScore);
  return Number.isFinite(candidate) && candidate >= 0 && candidate <= 100 ? candidate : null;
}

function mutationArguments(action, body, cycleId, actorId, approverAuthIds = []) {
  const targetId = Number(body?.target_id);
  const reason = String(body?.reason || '').trim();
  const finalScore = body?.final_score === '' || body?.final_score === undefined ? null : Number(body?.final_score);
  const gradeOverride = String(body?.grade_override || '').trim().toUpperCase() || null;
  switch (action) {
    case 'adjust_final': return { p_cycle_id: cycleId, p_target_id: targetId, p_final_score: finalScore, p_grade_override: gradeOverride, p_reason: reason, p_actor_id: actorId };
    case 'cancel_adjustment': return { p_cycle_id: cycleId, p_target_id: targetId, p_reason: reason, p_actor_id: actorId };
    case 'request_internal_approval': return { p_cycle_id: cycleId, p_actor_id: actorId, p_approver_ids: approverAuthIds };
    case 'decide_internal_approval': return { p_cycle_id: cycleId, p_approved: body?.approved === true, p_reason: reason, p_actor_id: actorId };
    case 'recall_internal_approval': return { p_cycle_id: cycleId, p_reason: reason, p_actor_id: actorId };
    case 'publish': return { p_cycle_id: cycleId, p_published: body?.published === true, p_actor_id: actorId };
    default: return null;
  }
}

const RPC_BY_ACTION = Object.freeze({
  adjust_final: 'governance_adjust_final_score',
  cancel_adjustment: 'governance_cancel_adjustment',
  request_internal_approval: 'governance_request_approval',
  decide_internal_approval: 'governance_decide_approval',
  recall_internal_approval: 'governance_recall_approval',
  publish: 'governance_publish_results'
});

async function resolveApproverAuthIds(service, userIds) {
  const ids = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
  if (ids.length < 1 || ids.length > 3) {
    throw Object.assign(new Error('Select one to three unique executive approvers.'), { status: 400 });
  }
  const approvers = await service.from('users')
    .select('id,auth_user_id')
    .in('id', ids)
    .eq('active', true)
    .eq('sys_role', ROLES.executive);
  if (approvers.error) throw approvers.error;
  const byId = new Map((approvers.data || []).map(row => [Number(row.id), row.auth_user_id]));
  const authIds = ids.map(id => byId.get(id));
  if (authIds.some(id => !id)) {
    throw Object.assign(new Error('Every approver must be an active executive with an Auth account.'), { status: 400 });
  }
  return authIds;
}

async function dispatchLatestApprovalNotification(service, cycleId) {
  const audit = await service.from('evaluation_cycle_approval_audit')
    .select('id')
    .eq('cycle_id', cycleId)
    .order('acted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (audit.error || !audit.data) return;
  const notifications = await service.from('evaluation_notifications')
    .select('id')
    .eq('source_audit_id', audit.data.id);
  if (notifications.error) return;
  await dispatchPushNotifications(service, (notifications.data || []).map(row => Number(row.id)));
}

async function notifyPublishedResults(service, cycleId) {
  const cycle = await service.from('evaluation_cycles')
    .select('result_version')
    .eq('id', cycleId)
    .single();
  if (cycle.error) throw cycle.error;
  const results = await service.from('evaluation_final_results')
    .select('target_id')
    .eq('cycle_id', cycleId)
    .eq('result_version', cycle.data.result_version);
  if (results.error) throw results.error;
  const targetIds = [...new Set((results.data || []).map(row => Number(row.target_id)))];
  if (!targetIds.length) return;
  const eligible = await service.from('users')
    .select('id')
    .in('id', targetIds)
    .eq('active', true)
    .neq('sys_role', ROLES.executive);
  if (eligible.error) throw eligible.error;
  await notifyAndDispatch(service, {
    eventKey: `results_published:${cycleId}:${cycle.data.result_version}`,
    cycleId,
    type: 'results_published',
    title: '나의 평가 결과 도착',
    message: '나의 평가 결과가 도착했습니다! 어서 확인하세요!',
    recipientUserIds: (eligible.data || []).map(row => row.id),
    targetView: 'myresults'
  });
}

export default async function handler(req, res) {
  try {
    const service = serviceClient();
    const { authUser, profile, accessToken } = await authenticate(req, service);
    const cycleId = Number(req.method === 'GET' ? req.query?.cycle_id : req.body?.cycle_id);
    if (!cycleId) return send(res, 400, { error: 'Evaluation cycle ID is required.' });

    if (req.method === 'GET') {
      const targetId = Number(req.query?.target_id || profile.id);
      if (targetId !== profile.id && !PRIVILEGED_ROLES.has(profile.sys_role)) return send(res, 403, { error: 'Not allowed to view another employee result.' });
      const aggregate = await aggregateTarget(service, cycleId, targetId);
      const privileged = PRIVILEGED_ROLES.has(profile.sys_role);
      const released = aggregate.cycle.results_published === true && aggregate.cycle.result_gate_open === true
        && (!aggregate.cycle.internal_approval_required || aggregate.cycle.internal_approval_status === 'approved');
      return send(res, 200, {
        cycle: aggregate.cycle,
        complete: aggregate.complete,
        assigned_count: aggregate.assigned_count,
        submitted_count: aggregate.submitted_count,
        weights: aggregate.weights,
        category_labels: aggregate.category_labels,
        scores: aggregate.complete && (privileged || released) ? aggregate.scores : null,
        adjusted: aggregate.adjusted,
        relative_grade: privileged || released ? aggregate.relative_grade : null,
        grade_basis: privileged ? aggregate.grade_basis || null : null,
        adjustment: privileged ? aggregate.adjustment : null,
        state: !aggregate.complete ? 'in_progress' : !privileged && !released ? 'not_published' : 'ready'
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    if (!PRIVILEGED_ROLES.has(profile.sys_role)) return send(res, 403, { error: 'Privileged role required.' });
    const action = String(req.body?.action || '');
    const rpcName = RPC_BY_ACTION[action];
    if (!rpcName) return send(res, 400, { error: 'Unsupported result management action.' });

    if (action === 'adjust_final') {
      const aggregate = await aggregateTarget(service, cycleId, Number(req.body?.target_id));
      if (!aggregate.complete) return send(res, 409, { error: 'All assigned evaluations must be complete before adjustment.' });
    }
    const approverAuthIds = action === 'request_internal_approval'
      ? await resolveApproverAuthIds(service, req.body?.approver_user_ids)
      : [];
    const rpc = await authenticatedRpcClient(accessToken)
      .rpc(rpcName, mutationArguments(action, req.body, cycleId, authUser.id, approverAuthIds));
    if (rpc.error) throw Object.assign(new Error(rpc.error.message), { status: 409 });
    if (['request_internal_approval', 'decide_internal_approval', 'recall_internal_approval'].includes(action)) {
      await dispatchLatestApprovalNotification(service, cycleId);
    }
    if (action === 'publish' && req.body?.published === true) {
      await notifyPublishedResults(service, cycleId);
    }
    return send(res, 200, { data: rpc.data });
  } catch (error) {
    console.error('Result state API error:', error);
    return send(res, error.status || 500, { error: error.message || 'Unable to process evaluation result.' });
  }
}
