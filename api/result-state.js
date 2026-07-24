import { createClient } from '@supabase/supabase-js';
import { TRACK_CATEGORIES, targetTrack } from './evaluation-classification.js';
import { ROLES } from './role-policy.js';

const PRIVILEGED_ROLES = new Set([ROLES.admin, ROLES.executive]);
const send = (res, status, payload) => res.status(status).json(payload);

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
      .select('raw_score,effective_score,relative_grade,category_labels,category_scores,result_version')
      .eq('cycle_id', cycleId)
      .eq('target_id', targetId)
      .eq('result_version', cycle.data.result_version)
      .maybeSingle();
    if (finalResult.error) throw finalResult.error;
    if (finalResult.data) {
      return {
        cycle: cycle.data,
        complete: true,
        assigned_count: null,
        submitted_count: null,
        adjustment: null,
        relative_grade: finalResult.data.relative_grade,
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
    service.from('evaluation_result_adjustments').select('id,raw_score,final_score,reason,status,workflow_status').eq('cycle_id', cycleId).eq('target_id', targetId).eq('status', 'active').maybeSingle(),
    service.from('evaluation_settings').select('performance_weight,collaboration_weight,growth_weight,harmony_weight').eq('id', 1).single(),
    service.from('users').select('id,active,can_evaluate,is_evaluatee,company,dept,workplace,role,type')
  ]);
  for (const result of [matchings, evaluations, adjustment, settings, users]) {
    if (result.error) throw result.error;
  }

  const usersById = new Map((users.data || []).map(user => [Number(user.id), user]));
  const target = usersById.get(Number(targetId));
  const categoryLabels = TRACK_CATEGORIES[targetTrack(target)] || TRACK_CATEGORIES.headquarters_member;
  const weights = {
    performance: Number(settings.data.performance_weight) / 100,
    collaboration: Number(settings.data.collaboration_weight) / 100,
    growth: Number(settings.data.growth_weight) / 100,
    harmony: Number(settings.data.harmony_weight) / 100
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

function mutationArguments(action, body, cycleId, actorId, rawScore = null) {
  const targetId = Number(body?.target_id);
  const reason = String(body?.reason || '').trim();
  const finalScore = body?.final_score === '' || body?.final_score === undefined ? null : Number(body?.final_score);
  switch (action) {
    case 'adjust': return { p_cycle_id: cycleId, p_target_id: targetId, p_raw_score: rawScore, p_final_score: finalScore, p_reason: reason, p_actor_id: actorId };
    case 'approve_adjustment': return { p_cycle_id: cycleId, p_target_id: targetId, p_final_score: finalScore, p_reason: reason, p_actor_id: actorId };
    case 'cancel_adjustment': return { p_cycle_id: cycleId, p_target_id: targetId, p_reason: reason, p_actor_id: actorId };
    case 'request_internal_approval': return { p_cycle_id: cycleId, p_actor_id: actorId };
    case 'decide_internal_approval': return { p_cycle_id: cycleId, p_approved: body?.approved === true, p_reason: reason, p_actor_id: actorId };
    case 'publish': return { p_cycle_id: cycleId, p_published: body?.published === true, p_actor_id: actorId };
    default: return null;
  }
}

const RPC_BY_ACTION = Object.freeze({
  adjust: 'governance_stage1_adjust',
  approve_adjustment: 'governance_stage2_adjust',
  cancel_adjustment: 'governance_cancel_adjustment',
  request_internal_approval: 'governance_request_approval',
  decide_internal_approval: 'governance_decide_approval',
  publish: 'governance_publish_results'
});

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
        adjusted: Boolean(aggregate.adjustment),
        relative_grade: privileged || released ? aggregate.relative_grade : null,
        adjustment: privileged ? aggregate.adjustment : null,
        state: !aggregate.complete ? 'in_progress' : !privileged && !released ? 'not_published' : 'ready'
      });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    if (!PRIVILEGED_ROLES.has(profile.sys_role)) return send(res, 403, { error: 'Privileged role required.' });
    const action = String(req.body?.action || '');
    const rpcName = RPC_BY_ACTION[action];
    if (!rpcName) return send(res, 400, { error: 'Unsupported result management action.' });

    let rawScore = null;
    if (action === 'adjust') {
      const aggregate = await aggregateTarget(service, cycleId, Number(req.body?.target_id));
      if (!aggregate.complete) return send(res, 409, { error: 'All assigned evaluations must be complete before adjustment.' });
      rawScore = aggregate.scores.total;
    }
    const rpc = await authenticatedRpcClient(accessToken)
      .rpc(rpcName, mutationArguments(action, req.body, cycleId, authUser.id, rawScore));
    if (rpc.error) throw Object.assign(new Error(rpc.error.message), { status: 409 });
    return send(res, 200, { data: rpc.data });
  } catch (error) {
    console.error('Result state API error:', error);
    return send(res, error.status || 500, { error: error.message || 'Unable to process evaluation result.' });
  }
}
