import { createClient } from '@supabase/supabase-js';
import { buildRelativeGradePlan, cohortKeyForUser } from './relative-grading.js';
import { ROLES } from './role-policy.js';
import { normalizeTrack, relationshipType, targetTrack, TRACK_CATEGORIES } from './evaluation-classification.js';
import { isMutableDraftCycle } from './questions.js';
import { planAutoMatchings } from './auto-matching.js';
import { notifyAndDispatch } from '../lib/push.js';

const PRIVILEGED = new Set([ROLES.admin, ROLES.executive]);
const SUPER_ADMIN_EMAIL = 'admin@cnhyex.com';
const ADMIN_ONLY = new Set([
  'cycle_create', 'cycle_update', 'cycle_delete', 'cycle_validate', 'cycle_activate', 'question_create', 'question_update',
  'question_delete', 'matching_toggle', 'matching_replace', 'matching_generate', 'matching_mode_update', 'permission_update', 'permission_bulk_update', 'settings_update',
  'goal_status', 'cycle_close', 'cycle_pause', 'cycle_resume', 'cycle_force_close', 'cycle_cancel', 'cycle_hard_delete'
]);
const EXECUTIVE_ALLOWED = new Set(['notification_read', 'notification_read_all', 'push_web_config', 'push_register', 'push_unregister']);
const send = (res, status, payload) => res.status(status).json(payload);

export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const result = await buildQuery().range(from, from + pageSize - 1);
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) return { data: rows, error: null };
  }
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authenticatedRpcClient(accessToken) {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) throw new Error('Authenticated RPC environment is not configured.');
  return createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

function requiredReason(body) {
  const reason = String(body?.reason || '').trim();
  if (reason.length < 5) {
    throw Object.assign(new Error('작업 사유를 5자 이상 입력해 주세요.'), { status: 400 });
  }
  return reason;
}

function assertSuperAdmin(authUser) {
  if (String(authUser?.email || '').trim().toLowerCase() !== SUPER_ADMIN_EMAIL) {
    throw Object.assign(new Error('최고관리자 전용 기능입니다.'), { status: 403 });
  }
}

async function authenticate(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('유효하지 않은 로그인입니다.'), { status: 401 });
  const profile = await service.from('users').select('id,name,role,sys_role,active').eq('auth_user_id', auth.data.user.id).maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true) {
    throw Object.assign(new Error('활성 직원 프로필을 찾을 수 없습니다.'), { status: 403 });
  }
  return { authUser: auth.data.user, profile: profile.data };
}

function cyclePayload(body) {
  const name = String(body.name || '').trim();
  const startDate = String(body.start_date || body.start || '').trim();
  const endDate = String(body.end_date || body.end || '').trim();
  const deadline = String(body.deadline || endDate).trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    throw Object.assign(new Error('평가 주기 이름과 유효한 시작·종료일이 필요합니다.'), { status: 400 });
  }
  if (endDate < startDate || deadline < endDate) {
    throw Object.assign(new Error('종료일은 시작일 이후, 마감일은 종료일 이후여야 합니다.'), { status: 400 });
  }
  return {
    name, description: String(body.description || body.desc || '').trim(),
    start_date: startDate, end_date: endDate, deadline,
    // Lifecycle transitions are deliberately excluded. A generic edit must
    // never turn a draft into an active, paused, or closed cycle.
    updated_at: new Date().toISOString()
  };
}

function questionPayload(body) {
  const row = {
    cycle_id: Number(body.cycle_id || body.cycleId), category: String(body.category || '').trim(),
    text: String(body.text || '').trim(), weight: 1,
    type: String(body.type || '5지선다형').trim(), target_track: normalizeTrack(body.target_track || body.targetTrack),
    target_dept: '전체',
    audience: 'all', required: body.required !== false,
    is_default: body.is_default !== false, max_score: Number(body.max_score || 5), updated_at: new Date().toISOString()
  };
  if (!row.cycle_id || !row.category || !row.text) {
    throw Object.assign(new Error('질문의 평가 주기, 카테고리 및 내용이 필요합니다.'), { status: 400 });
  }
  return row;
}

function normalizedWeights(settings, track = 'headquarters_member') {
  const scoped = settings?.track_category_weights?.[track];
  if (Array.isArray(scoped) && scoped.length === 4) {
    return {
      performance: Number(scoped[0]) / 100, collaboration: Number(scoped[1]) / 100,
      growth: Number(scoped[2]) / 100, harmony: Number(scoped[3]) / 100
    };
  }
  return {
    performance: Number(settings?.performance_weight ?? 40) / 100,
    collaboration: Number(settings?.collaboration_weight ?? 30) / 100,
    growth: Number(settings?.growth_weight ?? 20) / 100,
    harmony: Number(settings?.harmony_weight ?? 10) / 100
  };
}

function buildScores(evaluations, adjustments, settings, matchings = [], users = []) {
  const userMap = new Map((users || []).map(user => [Number(user.id), user]));
  const grouped = new Map();
  const assignedCounts = new Map();
  for (const row of matchings || []) {
    const key = `${row.cycle_id}:${row.target_id}`;
    assignedCounts.set(key, (assignedCounts.get(key) || 0) + 1);
  }
  for (const row of evaluations || []) {
    const key = `${row.cycle_id}:${row.target_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const adjustmentMap = new Map((adjustments || [])
    .filter(row => row.status !== 'cancelled')
    .map(row => [`${row.cycle_id}:${row.target_id}`, row]));
  const result = {};
  for (const [key, rows] of grouped) {
    const [cycleId, targetId] = key.split(':');
    const weights = normalizedWeights(settings, targetTrack(userMap.get(Number(targetId)) || {}));
    const avg = field => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length;
    const raw = Number((
      avg('perf_score') * weights.performance + avg('collab_score') * weights.collaboration
      + avg('growth_score') * weights.growth + avg('harmony_score') * weights.harmony
    ).toFixed(2));
    const adjustment = adjustmentMap.get(key);
    const final = adjustment ? Number(adjustment.final_score) : raw;
    const assigned = assignedCounts.get(key) || rows.length;
    result[cycleId] ||= {};
    result[cycleId][targetId] = {
      raw, final, grade: null, calculated_grade: null, grade_override: adjustment?.grade_override || null,
      grade_status: null, is_adjusted: Boolean(adjustment), completed: rows.length,
      assigned, complete: assigned > 0 && rows.length >= assigned,
      performance: Number(avg('perf_score').toFixed(2)), collaboration: Number(avg('collab_score').toFixed(2)),
      growth: Number(avg('growth_score').toFixed(2)), harmony: Number(avg('harmony_score').toFixed(2)),
      adjustment_reason: adjustment?.reason || null, adjusted_at: adjustment?.adjusted_at || null,
      workflow_status: adjustment?.workflow_status || null
    };
  }
  return result;
}

async function assertCycleMutable(service, cycleId) {
  const cycle = await service.from('evaluation_cycles')
    .select('id,status,internal_approval_status')
    .eq('id', cycleId)
    .single();
  if (cycle.error) throw cycle.error;
  if (!isMutableDraftCycle(cycle.data)) {
    throw Object.assign(new Error('초안(미시작) 상태의 평가 주기에서만 변경할 수 있습니다.'), { status: 409 });
  }
}

async function matchingCycleMode(service, cycleId, action, body) {
  const cycle = await service.from('evaluation_cycles')
    .select('id,status,internal_approval_status')
    .eq('id', cycleId)
    .single();
  if (cycle.error) throw cycle.error;
  if (isMutableDraftCycle(cycle.data)) return 'draft';
  if (action !== 'matching_generate'
      && cycle.data.status === '일시정지'
      && cycle.data.internal_approval_status === 'not_requested') {
    requiredReason(body);
    return 'paused';
  }
  throw Object.assign(new Error('매칭은 초안 또는 일시정지 상태에서만 변경할 수 있습니다.'), { status: 409 });
}

export function isClosedHistoricalCycle(cycle = {}) {
  return ['마감/보관됨', '취소/보관됨', 'closed', 'cancelled', 'archived'].includes(String(cycle.status || '').trim());
}

export function isCurrentGovernanceCycle(cycle = {}) {
  return !isMutableDraftCycle(cycle) && !isClosedHistoricalCycle(cycle);
}

export async function assertGlobalConfigurationMutable(service) {
  const cycles = await service.from('evaluation_cycles').select('id,status,internal_approval_status');
  if (cycles.error) throw cycles.error;
  // Editable drafts and immutable closed history are safe. Every current
  // lifecycle state (active, paused, or approval) locks global weights.
  const hasLockedCurrentCycle = (cycles.data || []).some(isCurrentGovernanceCycle);
  if (hasLockedCurrentCycle) {
    throw Object.assign(new Error('진행 중이거나 승인 절차가 시작된 평가 주기가 있어 전체 가중치를 변경할 수 없습니다.'), { status: 409 });
  }
}

async function assertQuestionCycleMutable(service, cycleId) {
  const cycle = await service.from('evaluation_cycles')
    .select('id,status,internal_approval_status')
    .eq('id', cycleId)
    .single();
  if (cycle.error) throw cycle.error;
  if (isMutableDraftCycle(cycle.data)) return;
  if (cycle.data.status === '일시정지' && cycle.data.internal_approval_status === 'not_requested') {
    const submitted = await service.from('evaluations').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId);
    if (submitted.error) throw submitted.error;
    if (submitted.count === 0) return;
  }
  throw Object.assign(new Error('초안 또는 아직 제출이 없는 일시정지 주기에서만 질문을 변경할 수 있습니다.'), { status: 409 });
}

async function generateAutoMatchings(service, rpcClient, cycleId, actorId) {
  const [users, existing, submitted] = await Promise.all([
    service.from('users').select('id,name,company,dept,workplace,role,type,sys_role,can_evaluate,is_evaluatee,active').eq('active', true),
    service.from('matchings').select('id,evaluator_id,target_id,type,relationship_type').eq('cycle_id', cycleId),
    service.from('evaluations').select('matching_id').eq('cycle_id', cycleId)
  ]);
  for (const query of [users, existing, submitted]) if (query.error) return query;
  const plan = planAutoMatchings({
    cycleId,
    users: users.data || [],
    existing: existing.data || [],
    submittedMatchingIds: (submitted.data || []).map(row => row.matching_id)
  });
  const saved = await rpcClient.rpc('governance_replace_auto_matchings', {
    p_cycle_id: cycleId,
    p_matchings: plan.generated,
    p_actor_id: actorId
  });
  if (saved.error && /governance_replace_auto_matchings|schema cache|could not find/i.test(saved.error.message || '')) {
    const submittedIds = new Set((submitted.data || []).map(row => Number(row.matching_id)));
    const desiredByEvaluator = new Map();
    for (const row of existing.data || []) {
      if (row.type === '알고리즘 자동 지정' && !submittedIds.has(Number(row.id))) continue;
      const evaluatorId = Number(row.evaluator_id);
      if (!desiredByEvaluator.has(evaluatorId)) desiredByEvaluator.set(evaluatorId, []);
      desiredByEvaluator.get(evaluatorId).push({
        target_id: Number(row.target_id),
        relationship_type: row.relationship_type || 'internal'
      });
    }
    for (const row of plan.generated) {
      if (!desiredByEvaluator.has(row.evaluator_id)) desiredByEvaluator.set(row.evaluator_id, []);
      desiredByEvaluator.get(row.evaluator_id).push({
        target_id: row.target_id,
        relationship_type: row.relationship_type
      });
    }
    const evaluatorIds = new Set([
      ...(existing.data || []).map(row => Number(row.evaluator_id)),
      ...plan.generated.map(row => Number(row.evaluator_id))
    ]);
    for (const evaluatorId of evaluatorIds) {
      const fallback = await rpcClient.rpc('governance_replace_draft_matchings', {
        p_cycle_id: cycleId,
        p_evaluator_id: evaluatorId,
        p_targets: desiredByEvaluator.get(evaluatorId) || [],
        p_actor_id: actorId
      });
      if (fallback.error) return fallback;
    }
  } else if (saved.error) {
    return saved;
  }
  return {
    data: {
      ...(saved.data || {}),
      generated: plan.generated.length,
      shortages: plan.shortages
    },
    error: null
  };
}

export function applyRelativeGrades(cycleScores, users, archives) {
  const usersById = new Map((users || []).map(user => [Number(user.id), user]));
  const finalGradesByCycle = new Map();

  for (const archive of archives || []) {
    const cycleId = String(archive.cycle_id);
    if (finalGradesByCycle.has(cycleId)) continue;
    finalGradesByCycle.set(
      cycleId,
      new Map((archive.snapshot || [])
        .filter(row => row.grade)
        .map(row => [Number(row.id), row.grade]))
    );
  }

  for (const [cycleId, scoresByTarget] of Object.entries(cycleScores)) {
    const candidates = Object.entries(scoresByTarget)
      .map(([targetId, score]) => ({ targetId: Number(targetId), user: usersById.get(Number(targetId)), score }))
      .filter(({ user, score }) => user?.active === true && user.is_evaluatee !== false && score.complete)
      .map(({ targetId, user, score }) => ({
        targetId,
        cohortKey: cohortKeyForUser(user),
        rawScore: score.raw,
        effectiveFinalScore: score.final,
        isAdjusted: score.is_adjusted === true
      }));
    const provisionalGrades = buildRelativeGradePlan(candidates).gradesByTargetId;
    const finalGrades = finalGradesByCycle.get(cycleId);

    for (const [targetId, score] of Object.entries(scoresByTarget)) {
      const target = usersById.get(Number(targetId));
      const finalGrade = finalGrades?.get(Number(targetId)) || null;
      score.calculated_grade = finalGrade || provisionalGrades.get(Number(targetId)) || null;
      score.grade = score.grade_override || score.calculated_grade;
      score.grade_status = finalGrade ? 'final' : score.grade ? 'provisional' : null;
      score.category_labels = TRACK_CATEGORIES[targetTrack(target)] || TRACK_CATEGORIES.headquarters_member;
    }
  }

  return cycleScores;
}

// Final results supersede every live calculation for the current finalized
// version.  This keeps historic score pages and exports stable when settings,
// questions, matching, or employee profiles later change.
export function applyImmutableFinalResults(cycleScores, finalResults, cyclesById) {
  const currentRows = (finalResults || []).filter(row =>
    Number(row.result_version) === Number(cyclesById.get(Number(row.cycle_id))?.result_version || 0)
  );
  for (const row of currentRows) {
    const cycleId = String(row.cycle_id);
    const targetId = String(row.target_id);
    cycleScores[cycleId] ||= {};
    const live = cycleScores[cycleId][targetId] || {};
    cycleScores[cycleId][targetId] = {
      ...live,
      raw: Number(row.raw_score),
      final: Number(row.effective_score),
      calculated_grade: row.relative_grade,
      grade_override: row.approved_grade && row.approved_grade !== row.relative_grade ? row.approved_grade : null,
      grade: row.approved_grade || row.relative_grade,
      grade_status: 'final',
      complete: true,
      // Do not accidentally display live category averages next to a frozen
      // final score; the final table stores labels, not mutable components.
      performance: row.category_scores?.performance ?? null,
      collaboration: row.category_scores?.collaboration ?? null,
      growth: row.category_scores?.growth ?? null,
      harmony: row.category_scores?.harmony ?? null,
      category_labels: row.category_labels || [],
      result_version: Number(row.result_version),
      is_adjusted: Boolean(live.is_adjusted)
    };
  }
  return cycleScores;
}

async function readState(service, profile) {
  const [settingsResult, goalsResult] = await Promise.all([
    service.from('evaluation_settings').select('*').eq('id', 1).single(),
    service.from('employee_goals').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (goalsResult.error) throw goalsResult.error;
  if (!PRIVILEGED.has(profile.sys_role)) return { settings: settingsResult.data, goals: goalsResult.data || [] };
  const [matchings, archives, evaluations, adjustments, adjustmentEvents, allGoals, users, cycles, finalResults, approvalRequests, approvalSteps, gradeMailDispatches, notifications] = await Promise.all([
    fetchAllRows(() => service.from('matchings').select('*').order('id')),
    service.from('evaluation_archives').select('*').order('closed_at', { ascending: false }),
    fetchAllRows(() => service.from('evaluations').select('matching_id,cycle_id,target_id,perf_score,collab_score,growth_score,harmony_score').order('id')),
    service.from('evaluation_result_adjustments').select('*'),
    fetchAllRows(() => service.from('evaluation_result_adjustment_events')
      // Keep the read compatible while the additive grade-history migration
      // rolls out; older schemas still return score/reason audit events.
      .select('*')
      .order('occurred_at', { ascending: true })),
    service.from('employee_goals').select('*').order('created_at', { ascending: false }),
    service.from('users').select('id,active,can_evaluate,is_evaluatee,company,dept,workplace,role,type'),
    service.from('evaluation_cycles').select('id,result_version'),
    service.from('evaluation_final_results').select('cycle_id,target_id,result_version,raw_score,effective_score,relative_grade,approved_grade,category_labels,category_scores'),
    service.from('evaluation_cycle_approval_requests').select('id,cycle_id,request_status,requested_at,result_version').order('requested_at', { ascending: false }),
    service.from('evaluation_cycle_approval_steps').select('approval_request_id,step_order,approver_user_id,status,decided_at,decision_note').order('step_order'),
    profile.sys_role === ROLES.admin
      ? fetchAllRows(() => service.from('evaluation_mail_dispatch_audit')
          .select('cycle_id,target_id,result_version,dispatched_at')
          .eq('mail_kind', 'grade_notice')
          .eq('dispatch_status', 'sent'))
      : Promise.resolve({ data: [], error: null }),
    service.from('evaluation_notifications')
      .select('id,cycle_id,notification_type,title,message,read_at,created_at')
      .eq('recipient_user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);
  for (const result of [matchings, archives, evaluations, adjustments, adjustmentEvents, allGoals, users, cycles, finalResults, approvalRequests, approvalSteps, gradeMailDispatches, notifications]) if (result.error) throw result.error;
  const userMap = new Map((users.data || []).map(user => [Number(user.id), user]));
  const eligibleMatchings = (matchings.data || []).filter(row => {
    const evaluator = userMap.get(Number(row.evaluator_id));
    const target = userMap.get(Number(row.target_id));
    return evaluator?.active === true && evaluator.can_evaluate !== false
      && target?.active === true && target.is_evaluatee !== false;
  });
  const eligibleMatchingIds = new Set(eligibleMatchings.map(row => Number(row.id)));
  const eligibleEvaluations = (evaluations.data || []).filter(row => eligibleMatchingIds.has(Number(row.matching_id)));
  const cycleScores = buildScores(eligibleEvaluations, adjustments.data || [], settingsResult.data, eligibleMatchings, users.data || []);
  applyRelativeGrades(cycleScores, users.data || [], archives.data || []);
  const cyclesById = new Map((cycles.data || []).map(cycle => [Number(cycle.id), cycle]));
  const currentFinalResults = (finalResults.data || []).filter(row =>
    Number(row.result_version) === Number(cyclesById.get(Number(row.cycle_id))?.result_version || 0)
  );
  applyImmutableFinalResults(cycleScores, currentFinalResults, cyclesById);
  const stepsByRequest = new Map();
  for (const step of approvalSteps.data || []) {
    if (!stepsByRequest.has(Number(step.approval_request_id))) stepsByRequest.set(Number(step.approval_request_id), []);
    stepsByRequest.get(Number(step.approval_request_id)).push(step);
  }
  const visibleApprovalRequests = profile.sys_role === ROLES.admin
    ? (approvalRequests.data || [])
    : (approvalRequests.data || []).filter(request =>
        (stepsByRequest.get(Number(request.id)) || [])
          .some(step => Number(step.approver_user_id) === Number(profile.id)));
  const approvalLines = visibleApprovalRequests.map(request => {
    const steps = stepsByRequest.get(Number(request.id)) || [];
    const current = steps.find(step => step.status === 'pending') || null;
    return {
      id: request.id,
      cycle_id: request.cycle_id,
      request_status: request.request_status,
      current_step: current?.step_order || null,
      current_approver_user_id: current?.approver_user_id || null,
      steps: steps.map(step => ({
        step_order: step.step_order,
        approver_user_id: step.approver_user_id,
        status: step.status,
        decided_at: step.decided_at,
        ...(profile.sys_role === ROLES.admin ? { decision_note: step.decision_note } : {})
      }))
    };
  });
  const pendingApprovalNotifications = profile.sys_role === ROLES.executive
    ? approvalLines.filter(request => request.request_status === 'requested'
      && Number(request.current_approver_user_id) === Number(profile.id))
      .map(request => ({
        approval_request_id: request.id,
        cycle_id: request.cycle_id,
        step_order: request.current_step
      }))
    : [];
  return {
    settings: settingsResult.data, goals: goalsResult.data || [],
    ...(profile.sys_role === ROLES.admin ? { all_goals: allGoals.data || [] } : {}),
    // Progress visibility needs assignment identities and submission state,
    // never individual answers or qualitative comments.
    matchings: (matchings.data || []).map(row => ({
      id: row.id, cycle_id: row.cycle_id, evaluator_id: row.evaluator_id,
      target_id: row.target_id, type: row.type
    })),
    submitted_matching_ids: eligibleEvaluations.map(row => Number(row.matching_id)),
    eligible_matching_ids: eligibleMatchings.map(row => Number(row.id)),
    archives: archives.data || [], cycle_scores: cycleScores,
    adjustment_events: adjustmentEvents.data || [],
    final_results: currentFinalResults,
    grade_mail_dispatches: gradeMailDispatches.data || [],
    approval_requests: approvalLines,
    pending_approval_notifications: pendingApprovalNotifications,
    notifications: notifications.data || []
  };
}

async function notifyCollectionComplete(service, profile, cycleId) {
  const matchingResult = await service.from('matchings')
    .select('id,evaluator_id')
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

async function closeCycle(service, rpcService, cycleId, authUser) {
  const [cycle, users, matchings, scores, adjustments, settings] = await Promise.all([
    service.from('evaluation_cycles').select('*').eq('id', cycleId).single(),
    service.from('users').select('id,name,company,dept,workplace,role,type,can_evaluate,is_evaluatee').eq('active', true),
    service.from('matchings').select('id,evaluator_id,target_id').eq('cycle_id', cycleId),
    service.from('evaluations').select('matching_id,cycle_id,target_id,perf_score,collab_score,growth_score,harmony_score').eq('cycle_id', cycleId),
    service.from('evaluation_result_adjustments').select('*').eq('cycle_id', cycleId),
    service.from('evaluation_settings').select('*').eq('id', 1).single()
  ]);
  for (const result of [cycle, users, matchings, scores, adjustments, settings]) if (result.error) throw result.error;
  const userMap = new Map((users.data || []).map(user => [Number(user.id), user]));
  const activeMatchings = (matchings.data || []).filter(row => {
    const evaluator = userMap.get(Number(row.evaluator_id));
    const target = userMap.get(Number(row.target_id));
    return evaluator?.can_evaluate !== false && target?.is_evaluatee !== false;
  });
  const submittedMatchingIds = new Set((scores.data || []).map(row => Number(row.matching_id)));
  const missingCount = activeMatchings.filter(row => !submittedMatchingIds.has(Number(row.id))).length;
  if (!activeMatchings.length) {
    throw Object.assign(new Error('마감할 활성 평가 배정이 없습니다.'), { status: 409 });
  }
  if (missingCount > 0) {
    throw Object.assign(new Error(`미제출 평가 ${missingCount}건이 남아 있어 마감할 수 없습니다.`), { status: 409 });
  }
  if ((adjustments.data || []).some(row => row.status === 'active' && row.workflow_status !== 'second_stage_adjusted')) {
    throw Object.assign(new Error('최종 조정이 완료되지 않은 활성 조정이 있어 마감할 수 없습니다.'), { status: 409 });
  }
  const scoreMap = buildScores(scores.data || [], adjustments.data || [], settings.data, activeMatchings, users.data || [])[String(cycleId)] || {};
  const finalUsers = (users.data || []).filter(user => user.is_evaluatee !== false && scoreMap[user.id]);
  const gradePlan = buildRelativeGradePlan(finalUsers.map(user => ({
    targetId: user.id,
    cohortKey: cohortKeyForUser(user),
    rawScore: scoreMap[user.id].raw,
    effectiveFinalScore: scoreMap[user.id].final,
    isAdjusted: scoreMap[user.id].is_adjusted === true
  })));
  const snapshot = finalUsers.map(user => ({
    id: user.id, name: user.name, company: user.company, dept: user.dept, role: user.role,
    score: scoreMap[user.id]?.final ?? null, raw_score: scoreMap[user.id]?.raw ?? null,
    grade: gradePlan.gradesByTargetId.get(Number(user.id)) || null, is_adjusted: scoreMap[user.id]?.is_adjusted || false
  }));
  if (!snapshot.length) throw Object.assign(new Error('보관할 완료 평가 결과가 없습니다.'), { status: 409 });
  const finalResults = finalUsers.map(user => ({
    target_id: user.id, cohort_key: cohortKeyForUser(user), raw_score: scoreMap[user.id].raw,
    effective_score: scoreMap[user.id].final, relative_grade: gradePlan.gradesByTargetId.get(Number(user.id)),
    category_labels: TRACK_CATEGORIES[targetTrack(user)] || TRACK_CATEGORIES.headquarters_member
  }));
  const cohortSnapshots = finalUsers.map(user => ({
    target_id: user.id, cohort_key: cohortKeyForUser(user), company: user.company || null, dept: user.dept || null,
    workplace: user.workplace || null, role: user.role || null, employee_type: user.type || null,
    profile_snapshot: { company: user.company, dept: user.dept, workplace: user.workplace, role: user.role, type: user.type }
  }));
  const allocations = gradePlan.allocations.map(row => ({
    cohort_key: row.cohortKey, grade: row.grade, allocation_count: row.allocation_count, allocation_ratio: row.allocation_ratio
  }));
  // The database owns the immutable snapshot: it locks the cycle and computes
  // scores, cohorts, quota grades, labels, and archive atomically.  No client
  // supplied score/grade payload may cross this boundary.
  const finalization = await rpcService.rpc('governance_finalize_cycle', {
    p_cycle_id: cycleId,
    p_actor_id: authUser.id
  });
  if (finalization.error) throw Object.assign(new Error(finalization.error.message), { status: 409 });
  return finalization.data;
}

export default async function handler(req, res) {
  try {
    const service = serviceClient();
    const { authUser, profile } = await authenticate(req, service);
    if (req.method === 'GET') return send(res, 200, await readState(service, profile));
    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
    const action = String(req.body?.action || '');
    if (profile.sys_role === ROLES.executive && !EXECUTIVE_ALLOWED.has(action)) return send(res, 403, { error: '임원은 점수 집계 및 마감 이력 작업만 수행할 수 있습니다.' });
    if (action === 'push_web_config') {
      return send(res, 200, {
        configured: Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY),
        publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || ''
      });
    }
    if (action === 'push_register') {
      const token = String(req.body?.token || '').trim();
      if (token.length < 20) return send(res, 400, { error: '유효한 기기 토큰이 필요합니다.' });
      const platform = String(req.body?.platform || 'android');
      if (!['android', 'web'].includes(platform)) return send(res, 400, { error: '지원하지 않는 푸시 플랫폼입니다.' });
      const registered = await service.from('push_device_tokens').upsert({
        user_id: profile.id,
        token,
        platform,
        device_id: String(req.body?.device_id || '').slice(0, 200) || null,
        app_version: String(req.body?.app_version || '').slice(0, 50) || null,
        active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'token' }).select('id,user_id,active').single();
      if (registered.error) throw registered.error;
      return send(res, 200, { data: registered.data });
    }
    if (action === 'push_unregister') {
      const unregistered = await service.from('push_device_tokens')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('token', String(req.body?.token || '').trim())
        .select('id');
      if (unregistered.error) throw unregistered.error;
      return send(res, 200, { data: unregistered.data || [] });
    }
    if (action === 'push_evaluation_submitted') {
      const cycleId = Number(req.body?.cycle_id);
      if (!cycleId) return send(res, 400, { error: '평가주기 ID가 필요합니다.' });
      return send(res, 200, { data: await notifyCollectionComplete(service, profile, cycleId) });
    }
    if (action === 'goal_create') {
      const title = String(req.body?.title || '').trim();
      const category = String(req.body?.category || '').trim();
      if (title.length < 2 || title.length > 300 || !['성과','협업','성장','조화'].includes(category)) {
        return send(res, 400, { error: '2~300자의 목표명과 유효한 카테고리가 필요합니다.' });
      }
      const goal = await service.from('employee_goals').insert({
        user_id: profile.id, cycle_id: Number(req.body?.cycle_id) || null,
        title, category, status: 'pending', updated_at: new Date().toISOString()
      }).select().single();
      if (goal.error) throw goal.error;
      return send(res, 200, { data: goal.data });
    }
    if (!PRIVILEGED.has(profile.sys_role)) return send(res, 403, { error: '관리자 권한이 필요합니다.' });
    if (action === 'notification_read' || action === 'notification_read_all') {
      let query = service.from('evaluation_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', profile.id)
        .is('read_at', null);
      if (action === 'notification_read') query = query.eq('id', Number(req.body?.id));
      const updated = await query.select('id,read_at');
      if (updated.error) throw updated.error;
      return send(res, 200, { data: updated.data || [] });
    }
    if (action === 'goal_status') {
      if (profile.sys_role !== ROLES.admin) return send(res, 403, { error: 'Administrator role required.' });
      const status = String(req.body?.status || '');
      if (!['approved','rejected'].includes(status)) return send(res, 400, { error: '승인 또는 반려 상태가 필요합니다.' });
      const now = new Date().toISOString();
      const goal = await service.from('employee_goals').update({
        status, feedback: String(req.body?.feedback || '').trim() || null,
        approved_by: authUser.id, approved_at: now, updated_at: now
      }).eq('id', Number(req.body?.id)).select().single();
      if (goal.error) throw goal.error;
      return send(res, 200, { data: goal.data });
    }
    if (ADMIN_ONLY.has(action) && profile.sys_role !== ROLES.admin) return send(res, 403, { error: '인사관리자 전용 기능입니다.' });
    const guardedCycleId = Number(req.body?.cycle_id || req.body?.cycleId || req.body?.id);
    let matchingMode = null;
    if (['cycle_update', 'cycle_delete', 'cycle_activate'].includes(action)) {
      if (guardedCycleId) await assertCycleMutable(service, guardedCycleId);
    }
    if (['question_create', 'question_update', 'question_delete'].includes(action)) {
      const questionCycleId = Number(req.body?.cycle_id || req.body?.cycleId);
      if (questionCycleId) await assertQuestionCycleMutable(service, questionCycleId);
    }
    if (['matching_toggle', 'matching_replace', 'matching_generate', 'matching_mode_update'].includes(action) && guardedCycleId) {
      matchingMode = await matchingCycleMode(service, guardedCycleId, action, req.body);
    }
    let result;
    if (action === 'settings_update') {
      await assertGlobalConfigurationMutable(service);
      const weights = req.body?.weights || {};
      const payload = {
        performance_weight: Number(weights.perf), collaboration_weight: Number(weights.collab),
        growth_weight: Number(weights.growth), harmony_weight: Number(weights.harmony),
        auto_matching_enabled: req.body?.auto_matching_enabled !== false,
        updated_by: authUser.id, updated_at: new Date().toISOString()
      };
      const trackWeights = req.body?.track_category_weights;
      if (trackWeights && typeof trackWeights === 'object') {
        for (const track of Object.values(TRACKS)) {
          const values = trackWeights[track];
          if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite)
            || Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > .01) {
            return send(res, 400, { error: '모든 직군의 카테고리 가중치 합계는 100이어야 합니다.' });
          }
        }
        payload.track_category_weights = trackWeights;
      }
      const sum = payload.performance_weight + payload.collaboration_weight + payload.growth_weight + payload.harmony_weight;
      if (![payload.performance_weight, payload.collaboration_weight, payload.growth_weight, payload.harmony_weight].every(Number.isFinite) || Math.abs(sum - 100) > .01) {
        return send(res, 400, { error: '가중치 합계는 100이어야 합니다.' });
      }
      result = await service.from('evaluation_settings').update(payload).eq('id', 1).select().single();
    } else if (action === 'cycle_create') {
      const payload = cyclePayload(req.body);
      payload.status = '초안';
      payload.auto_matching_enabled = false;
      result = await service.from('evaluation_cycles').insert(payload).select().single();
    } else if (action === 'cycle_update') {
      const cycleId = Number(req.body.id);
      const payload = cyclePayload(req.body);
      // Activation is cycle_activate and closing is cycle_close. Do not offer
      // a status-bearing generic edit path that bypasses lifecycle checks.
      result = await service.from('evaluation_cycles').update(payload).eq('id', cycleId).select().single();
    } else if (action === 'cycle_validate') {
      result = await service.rpc('validate_evaluation_cycle', { p_cycle_id: Number(req.body.cycle_id) });
    } else if (action === 'cycle_activate') {
      const cycleId = Number(req.body.cycle_id);
      result = await service.rpc('activate_evaluation_cycle', { p_cycle_id: cycleId });
      if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
      const [matchingRows, adminRows] = await Promise.all([
        service.from('matchings').select('evaluator_id').eq('cycle_id', cycleId),
        service.from('users').select('id').eq('active', true).eq('sys_role', ROLES.admin)
      ]);
      if (!matchingRows.error) {
        await notifyAndDispatch(service, {
          eventKey: `assignment_created:${cycleId}`,
          cycleId,
          type: 'assignment_created',
          title: '새 평가 배정',
          message: '새로운 동료평가가 배정되었습니다.',
          recipientUserIds: (matchingRows.data || []).map(row => row.evaluator_id),
          targetView: 'list'
        });
      }
      if (!adminRows.error) {
        const assignmentCount = (matchingRows.data || []).length;
        await notifyAndDispatch(service, {
          eventKey: `assignment_summary:${cycleId}`,
          cycleId,
          type: 'assignment_created',
          title: '평가 배정 완료',
          message: `평가 배정이 완료되었습니다. 총 ${assignmentCount}건입니다.`,
          recipientUserIds: (adminRows.data || []).map(row => row.id),
          targetView: 'closingmanage',
          targetSubtab: 'progress'
        });
      }
    } else if (['cycle_pause', 'cycle_resume', 'cycle_force_close', 'cycle_cancel', 'cycle_hard_delete'].includes(action)) {
      if (['cycle_force_close', 'cycle_cancel', 'cycle_hard_delete'].includes(action)) assertSuperAdmin(authUser);
      const rpcNames = {
        cycle_pause: 'governance_pause_cycle',
        cycle_resume: 'governance_resume_cycle',
        cycle_force_close: 'governance_force_close_cycle',
        cycle_cancel: 'governance_cancel_cycle',
        cycle_hard_delete: 'governance_hard_delete_cycle'
      };
      const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const args = {
        p_cycle_id: Number(req.body.cycle_id),
        p_reason: requiredReason(req.body),
        p_actor_id: authUser.id
      };
      if (action === 'cycle_cancel') args.p_hard_delete = req.body.hard_delete === true;
      if (action === 'cycle_hard_delete') args.p_confirmation = String(req.body.confirmation || '');
      result = await authenticatedRpcClient(accessToken).rpc(rpcNames[action], args);
      if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
    } else if (action === 'cycle_delete') {
      const cycleId = Number(req.body.id);
      const used = await service.from('matchings').select('id', { count: 'exact', head: true }).eq('cycle_id', cycleId);
      if (used.error) throw used.error;
      if (used.count > 0) return send(res, 409, { error: '배정 또는 평가 데이터가 있는 주기는 삭제하지 말고 마감 처리해 주세요.' });
      result = await service.from('evaluation_cycles').delete().eq('id', cycleId);
    } else if (action === 'question_create') {
      result = await service.from('evaluation_questions').insert(questionPayload(req.body)).select().single();
    } else if (action === 'question_update') {
      const existingQuestion = await service.from('evaluation_questions').select('cycle_id').eq('id', Number(req.body.id)).single();
      if (existingQuestion.error) throw existingQuestion.error;
      await assertQuestionCycleMutable(service, existingQuestion.data.cycle_id);
      const requestedCycleId = Number(req.body?.cycle_id || req.body?.cycleId);
      if (requestedCycleId && requestedCycleId !== Number(existingQuestion.data.cycle_id)) {
        await assertQuestionCycleMutable(service, requestedCycleId);
      }
      result = await service.from('evaluation_questions').update(questionPayload(req.body)).eq('id', Number(req.body.id)).select().single();
    } else if (action === 'question_delete') {
      const existingQuestion = await service.from('evaluation_questions').select('cycle_id').eq('id', Number(req.body.id)).single();
      if (existingQuestion.error) throw existingQuestion.error;
      await assertQuestionCycleMutable(service, existingQuestion.data.cycle_id);
      const used = await service.from('evaluation_answers').select('id', { count: 'exact', head: true }).eq('question_id', Number(req.body.id));
      if (used.error) throw used.error;
      if (used.count > 0) return send(res, 409, { error: '제출 답변이 연결된 질문은 삭제할 수 없습니다.' });
      result = await service.from('evaluation_questions').delete().eq('id', Number(req.body.id));
    } else if (action === 'permission_update') {
      const changes = {};
      if (typeof req.body.can_evaluate === 'boolean') changes.can_evaluate = req.body.can_evaluate;
      if (typeof req.body.is_evaluatee === 'boolean') changes.is_evaluatee = req.body.is_evaluatee;
      changes.updated_at = new Date().toISOString();
      result = await service.from('users').update(changes).eq('id', Number(req.body.user_id)).select().single();
    } else if (action === 'permission_bulk_update') {
      const userIds = [...new Set((req.body.user_ids || []).map(Number).filter(Number.isInteger))].slice(0, 500);
      if (!userIds.length) return send(res, 400, { error: '변경할 사용자를 선택해 주세요.' });
      const changes = { updated_at: new Date().toISOString() };
      if (typeof req.body.can_evaluate === 'boolean') changes.can_evaluate = req.body.can_evaluate;
      if (typeof req.body.is_evaluatee === 'boolean') changes.is_evaluatee = req.body.is_evaluatee;
      if (!Object.hasOwn(changes, 'can_evaluate') && !Object.hasOwn(changes, 'is_evaluatee')) {
        return send(res, 400, { error: '변경할 권한 상태가 필요합니다.' });
      }
      result = await service.from('users').update(changes).in('id', userIds).select('id');
    } else if (action === 'matching_toggle') {
      const cycleId = Number(req.body.cycle_id), evaluatorId = Number(req.body.evaluator_id), targetId = Number(req.body.target_id);
      if (!cycleId || !evaluatorId || !targetId || evaluatorId === targetId) return send(res, 400, { error: '유효한 주기·평가자·피평가자가 필요합니다.' });
      const existing = await service.from('matchings').select('id').eq('cycle_id', cycleId).eq('evaluator_id', evaluatorId).eq('target_id', targetId).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const submitted = await service.from('evaluations').select('id', { count: 'exact', head: true }).eq('matching_id', existing.data.id);
        if (submitted.error) throw submitted.error;
        if (submitted.count > 0) return send(res, 409, { error: '이미 제출된 평가 배정은 삭제할 수 없습니다.' });
      }
      const people = await service.from('users').select('id,dept,workplace,role,type,company').in('id', [evaluatorId, targetId]);
      if (people.error) throw people.error;
      const personById = new Map((people.data || []).map(row => [Number(row.id), row]));
      if (matchingMode === 'paused') {
        const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        result = await authenticatedRpcClient(accessToken).rpc('governance_toggle_paused_matching', {
          p_cycle_id: cycleId,
          p_evaluator_id: evaluatorId,
          p_target_id: targetId,
          p_relationship_type: relationshipType(personById.get(evaluatorId), personById.get(targetId)),
          p_reason: requiredReason(req.body),
          p_actor_id: authUser.id
        });
        if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
      } else {
        result = existing.data
          ? await service.from('matchings').delete().eq('id', existing.data.id)
          : await service.from('matchings').insert({ cycle_id: cycleId, evaluator_id: evaluatorId, target_id: targetId, type: '관리자 수동 지정', relationship_type: relationshipType(personById.get(evaluatorId), personById.get(targetId)), updated_at: new Date().toISOString() }).select().single();
      }
    } else if (action === 'matching_replace') {
      const cycleId = Number(req.body.cycle_id), evaluatorId = Number(req.body.evaluator_id);
      const targetIds = [...new Set((req.body.target_ids || []).map(Number).filter(id => id && id !== evaluatorId))];
      if (matchingMode === 'paused') {
        const people = await service.from('users')
          .select('id,dept,workplace,role,type,company')
          .in('id', [evaluatorId, ...targetIds]);
        if (people.error) throw people.error;
        const peopleById = new Map((people.data || []).map(row => [Number(row.id), row]));
        const evaluator = peopleById.get(evaluatorId);
        const targets = targetIds.map(targetId => ({
          target_id: targetId,
          relationship_type: relationshipType(evaluator, peopleById.get(targetId))
        }));
        const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        result = await authenticatedRpcClient(accessToken).rpc('governance_replace_paused_matchings', {
          p_cycle_id: cycleId,
          p_evaluator_id: evaluatorId,
          p_targets: targets,
          p_reason: requiredReason(req.body),
          p_actor_id: authUser.id
        });
        if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
      } else {
      const people = await service.from('users')
        .select('id,dept,workplace,role,type,company')
        .in('id', [evaluatorId, ...targetIds]);
      if (people.error) throw people.error;
      const peopleById = new Map((people.data || []).map(row => [Number(row.id), row]));
      const evaluator = peopleById.get(evaluatorId);
      const targets = targetIds.map(targetId => ({
        target_id: targetId,
        relationship_type: relationshipType(evaluator, peopleById.get(targetId))
      }));
      const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      result = await authenticatedRpcClient(accessToken).rpc('governance_replace_draft_matchings', {
        p_cycle_id: cycleId,
        p_evaluator_id: evaluatorId,
        p_targets: targets,
        p_actor_id: authUser.id
      });
      if (result.error) throw Object.assign(new Error(result.error.message), { status: 409 });
      }
    } else if (action === 'matching_mode_update') {
      const cycleId = Number(req.body.cycle_id);
      const enabled = req.body.enabled !== false;
      if (!cycleId) return send(res, 400, { error: '평가 주기가 필요합니다.' });
      if (enabled) {
        const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const generated = await generateAutoMatchings(service, authenticatedRpcClient(accessToken), cycleId, authUser.id);
        if (generated.error) throw generated.error;
      }
      result = await service.from('evaluation_cycles')
        .update({ auto_matching_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', cycleId)
        .select()
        .single();
    } else if (action === 'matching_generate') {
      const cycleId = Number(req.body.cycle_id);
      if (!cycleId) return send(res, 400, { error: '평가 주기가 필요합니다.' });
      const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      result = await generateAutoMatchings(service, authenticatedRpcClient(accessToken), cycleId, authUser.id);
    } else if (action === 'cycle_close') {
      const accessToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      return send(res, 200, { archive: await closeCycle(service, authenticatedRpcClient(accessToken), Number(req.body.cycle_id), authUser) });
    } else if (action === 'archive_delete') {
      return send(res, 409, { error: '마감된 평가 이력은 삭제할 수 없습니다.' });
    } else {
      return send(res, 400, { error: '알 수 없는 관리 작업입니다.' });
    }
    if (result.error) throw result.error;
    return send(res, 200, { data: result.data ?? null });
  } catch (error) {
    console.error('Admin state API error:', error);
    return send(res, error.status || 500, { error: error.message || '중앙 상태 처리 중 오류가 발생했습니다.' });
  }
}
