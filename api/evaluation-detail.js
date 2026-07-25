import { createClient } from '@supabase/supabase-js';
import { TRACK_CATEGORIES, targetTrack } from './evaluation-classification.js';
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
  if (!token) throw Object.assign(new Error('Login is required.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('Invalid session.'), { status: 401 });
  const profile = await service.from('users')
    .select('id,sys_role,active')
    .eq('auth_user_id', auth.data.user.id)
    .maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true) {
    throw Object.assign(new Error('Active employee profile is required.'), { status: 403 });
  }
  if (![ROLES.admin, ROLES.executive].includes(profile.data.sys_role)) {
    throw Object.assign(new Error('Administrator or executive role required.'), { status: 403 });
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    const service = serviceClient();
    await authenticate(req, service);
    const cycleId = Number(req.query?.cycle_id);
    const targetId = Number(req.query?.target_id);
    if (!cycleId || !targetId) return send(res, 400, { error: 'Cycle and target IDs are required.' });

    const [cycle, target, matchings, evaluations, adjustment] = await Promise.all([
      service.from('evaluation_cycles').select('id,name,status').eq('id', cycleId).maybeSingle(),
      service.from('users').select('id,name,company,dept,workplace,role,type').eq('id', targetId).maybeSingle(),
      service.from('matchings').select('id,evaluator_id,type,relationship_type').eq('cycle_id', cycleId).eq('target_id', targetId).order('id'),
      service.from('evaluations').select('id,matching_id,evaluator_id,perf_score,collab_score,growth_score,harmony_score,qualitative_comment').eq('cycle_id', cycleId).eq('target_id', targetId).order('id'),
      service.from('evaluation_result_adjustments').select('raw_score,final_score,reason,workflow_status,adjusted_at').eq('cycle_id', cycleId).eq('target_id', targetId).eq('status', 'active').maybeSingle()
    ]);
    for (const result of [cycle, target, matchings, evaluations, adjustment]) {
      if (result.error) throw result.error;
    }
    if (!cycle.data || !target.data) return send(res, 404, { error: 'Evaluation cycle or target not found.' });

    const evaluatorIds = [...new Set((matchings.data || []).map(row => Number(row.evaluator_id)).filter(Boolean))];
    const evaluators = evaluatorIds.length
      ? await service.from('users').select('id,name,company,dept,role').in('id', evaluatorIds)
      : { data: [], error: null };
    if (evaluators.error) throw evaluators.error;
    const evaluatorById = new Map((evaluators.data || []).map(row => [Number(row.id), row]));
    const evaluationByMatching = new Map((evaluations.data || []).map(row => [Number(row.matching_id), row]));
    const assignments = (matchings.data || []).map(matching => {
      const evaluation = evaluationByMatching.get(Number(matching.id)) || null;
      return {
        matching_id: Number(matching.id),
        type: matching.type || matching.relationship_type || '평가',
        evaluator: evaluatorById.get(Number(matching.evaluator_id)) || { id: Number(matching.evaluator_id) },
        submitted: Boolean(evaluation),
        scores: evaluation ? {
          performance: Number(evaluation.perf_score),
          collaboration: Number(evaluation.collab_score),
          growth: Number(evaluation.growth_score),
          harmony: Number(evaluation.harmony_score)
        } : null,
        feedback: evaluation?.qualitative_comment || null
      };
    });
    const submitted = assignments.filter(row => row.submitted);
    const average = key => submitted.length
      ? Number((submitted.reduce((sum, row) => sum + Number(row.scores[key] || 0), 0) / submitted.length).toFixed(2))
      : null;
    const complete = assignments.length > 0 && submitted.length === assignments.length;

    return send(res, 200, {
      cycle: cycle.data,
      target: target.data,
      assigned_count: assignments.length,
      submitted_count: submitted.length,
      complete,
      current_scores: {
        performance: average('performance'),
        collaboration: average('collaboration'),
        growth: average('growth'),
        harmony: average('harmony')
      },
      adjustment: adjustment.data || null,
      category_labels: TRACK_CATEGORIES[targetTrack(target.data)] || TRACK_CATEGORIES.headquarters_member,
      assignments
    });
  } catch (error) {
    console.error('Evaluation detail API error:', error);
    return send(res, error.status || 500, { error: error.message || 'Unable to load evaluation detail.' });
  }
}
