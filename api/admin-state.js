import { createClient } from '@supabase/supabase-js';

const PRIVILEGED = new Set(['관리자', '임원']);
const ADMIN_ONLY = new Set([
  'cycle_create', 'cycle_update', 'cycle_delete', 'cycle_validate', 'cycle_activate', 'question_create', 'question_update',
  'question_delete', 'matching_toggle', 'matching_replace', 'matching_generate', 'permission_update', 'settings_update'
]);
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
  const statusMap = { '진행 중': '진행중', '진행중': '진행중', '일시정지': '일시정지', '마감/보관됨': '마감/보관됨', '초안': '초안' };
  return {
    name, description: String(body.description || body.desc || '').trim(),
    start_date: startDate, end_date: endDate, deadline,
    status: statusMap[String(body.status || '초안')] || '초안', updated_at: new Date().toISOString()
  };
}

function questionPayload(body) {
  const row = {
    cycle_id: Number(body.cycle_id || body.cycleId), category: String(body.category || '').trim(),
    text: String(body.text || '').trim(), weight: Number(body.weight),
    type: String(body.type || '5지선다형').trim(), target_track: String(body.target_track || body.targetTrack || '기본 필수질문').trim(),
    target_dept: String(body.target_dept || body.targetDept || '전체').trim(), required: body.required !== false,
    is_default: body.is_default !== false, max_score: Number(body.max_score || 5), updated_at: new Date().toISOString()
  };
  if (!row.cycle_id || !row.category || !row.text || !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100) {
    throw Object.assign(new Error('질문의 평가 주기, 카테고리, 내용 및 0~100 가중치가 필요합니다.'), { status: 400 });
  }
  return row;
}

function normalizedWeights(settings) {
  return {
    performance: Number(settings?.performance_weight ?? 40) / 100,
    collaboration: Number(settings?.collaboration_weight ?? 30) / 100,
    growth: Number(settings?.growth_weight ?? 20) / 100,
    harmony: Number(settings?.harmony_weight ?? 10) / 100
  };
}

function buildScores(evaluations, adjustments, settings, matchings = []) {
  const weights = normalizedWeights(settings);
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
    const avg = field => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length;
    const raw = Number((
      avg('perf_score') * weights.performance + avg('collab_score') * weights.collaboration
      + avg('growth_score') * weights.growth + avg('harmony_score') * weights.harmony
    ).toFixed(2));
    const adjustment = adjustmentMap.get(key);
    const final = adjustment ? Number(adjustment.final_score) : raw;
    const grade = adjustment?.final_grade || (final >= 100 ? 'EX' : final >= 90 ? 'S' : final >= 80 ? 'A' : final >= 70 ? 'B' : final >= 60 ? 'C' : 'D');
    const assigned = assignedCounts.get(key) || rows.length;
    result[cycleId] ||= {};
    result[cycleId][targetId] = {
      raw, final, grade, is_adjusted: Boolean(adjustment), completed: rows.length,
      assigned, complete: assigned > 0 && rows.length >= assigned,
      performance: Number(avg('perf_score').toFixed(2)), collaboration: Number(avg('collab_score').toFixed(2)),
      growth: Number(avg('growth_score').toFixed(2)), harmony: Number(avg('harmony_score').toFixed(2)),
      adjustment_reason: adjustment?.reason || null, adjusted_at: adjustment?.adjusted_at || null
    };
  }
  return result;
}

async function readState(service, profile) {
  const [settingsResult, goalsResult] = await Promise.all([
    service.from('evaluation_settings').select('*').eq('id', 1).single(),
    service.from('employee_goals').select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (goalsResult.error) throw goalsResult.error;
  if (!PRIVILEGED.has(profile.sys_role)) return { settings: settingsResult.data, goals: goalsResult.data || [] };
  const [matchings, archives, evaluations, adjustments, allGoals, users] = await Promise.all([
    service.from('matchings').select('*').order('id'),
    service.from('evaluation_archives').select('*').order('closed_at', { ascending: false }),
    service.from('evaluations').select('matching_id,cycle_id,target_id,perf_score,collab_score,growth_score,harmony_score'),
    service.from('evaluation_result_adjustments').select('*'),
    service.from('employee_goals').select('*').order('created_at', { ascending: false }),
    service.from('users').select('id,active,can_evaluate,is_evaluatee')
  ]);
  for (const result of [matchings, archives, evaluations, adjustments, allGoals, users]) if (result.error) throw result.error;
  const userMap = new Map((users.data || []).map(user => [Number(user.id), user]));
  const eligibleMatchings = (matchings.data || []).filter(row => {
    const evaluator = userMap.get(Number(row.evaluator_id));
    const target = userMap.get(Number(row.target_id));
    return evaluator?.active === true && evaluator.can_evaluate !== false
      && target?.active === true && target.is_evaluatee !== false;
  });
  const eligibleMatchingIds = new Set(eligibleMatchings.map(row => Number(row.id)));
  const eligibleEvaluations = (evaluations.data || []).filter(row => eligibleMatchingIds.has(Number(row.matching_id)));
  return {
    settings: settingsResult.data, goals: goalsResult.data || [], all_goals: allGoals.data || [],
    matchings: matchings.data || [], archives: archives.data || [],
    cycle_scores: buildScores(eligibleEvaluations, adjustments.data || [], settingsResult.data, eligibleMatchings)
  };
}

async function closeCycle(service, cycleId, authUser, profile) {
  const [cycle, users, matchings, scores, adjustments, settings] = await Promise.all([
    service.from('evaluation_cycles').select('*').eq('id', cycleId).single(),
    service.from('users').select('id,name,company,dept,role,can_evaluate,is_evaluatee').eq('active', true),
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
  const scoreMap = buildScores(scores.data || [], adjustments.data || [], settings.data, activeMatchings)[String(cycleId)] || {};
  const snapshot = (users.data || []).filter(user => user.is_evaluatee !== false && scoreMap[user.id]).map(user => ({
    id: user.id, name: user.name, company: user.company, dept: user.dept, role: user.role,
    score: scoreMap[user.id]?.final ?? null, raw_score: scoreMap[user.id]?.raw ?? null,
    grade: scoreMap[user.id]?.grade ?? null, is_adjusted: scoreMap[user.id]?.is_adjusted || false
  }));
  if (!snapshot.length) throw Object.assign(new Error('보관할 완료 평가 결과가 없습니다.'), { status: 409 });
  const now = new Date().toISOString();
  const archive = await service.from('evaluation_archives').upsert({
    cycle_id: cycleId, cycle_name: cycle.data.name, closed_by: authUser.id,
    closed_by_name: `${profile.name} (${profile.role || profile.sys_role})`, closed_at: now, snapshot
  }, { onConflict: 'cycle_id' }).select().single();
  if (archive.error) throw archive.error;
  const updated = await service.from('evaluation_cycles').update({
    status: '마감/보관됨', closed_by: authUser.id, closed_at: now, updated_at: now
  }).eq('id', cycleId).select().single();
  if (updated.error) throw updated.error;
  return archive.data;
}

export default async function handler(req, res) {
  try {
    const service = serviceClient();
    const { authUser, profile } = await authenticate(req, service);
    if (req.method === 'GET') return send(res, 200, await readState(service, profile));
    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });
    const action = String(req.body?.action || '');
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
    if (action === 'goal_status') {
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
    if (ADMIN_ONLY.has(action) && profile.sys_role !== '관리자') return send(res, 403, { error: '인사관리자 전용 기능입니다.' });
    let result;
    if (action === 'settings_update') {
      const weights = req.body?.weights || {};
      const payload = {
        performance_weight: Number(weights.perf), collaboration_weight: Number(weights.collab),
        growth_weight: Number(weights.growth), harmony_weight: Number(weights.harmony),
        auto_matching_enabled: req.body?.auto_matching_enabled !== false,
        updated_by: authUser.id, updated_at: new Date().toISOString()
      };
      const sum = payload.performance_weight + payload.collaboration_weight + payload.growth_weight + payload.harmony_weight;
      if (![payload.performance_weight, payload.collaboration_weight, payload.growth_weight, payload.harmony_weight].every(Number.isFinite) || Math.abs(sum - 100) > .01) {
        return send(res, 400, { error: '가중치 합계는 100이어야 합니다.' });
      }
      result = await service.from('evaluation_settings').update(payload).eq('id', 1).select().single();
    } else if (action === 'cycle_create') {
      const payload = cyclePayload(req.body);
      payload.status = '초안';
      result = await service.from('evaluation_cycles').insert(payload).select().single();
    } else if (action === 'cycle_update') {
      const cycleId = Number(req.body.id);
      const payload = cyclePayload(req.body);
      if (payload.status === '진행중') {
        payload.status = '초안';
        const saved = await service.from('evaluation_cycles').update(payload).eq('id', cycleId).select().single();
        if (saved.error) throw saved.error;
        const activated = await service.rpc('activate_evaluation_cycle', { p_cycle_id: cycleId });
        if (activated.error) throw Object.assign(new Error(activated.error.message), { status: 409 });
        result = { data: { ...saved.data, status: '진행중', validation: activated.data }, error: null };
      } else {
        result = await service.from('evaluation_cycles').update(payload).eq('id', cycleId).select().single();
      }
    } else if (action === 'cycle_validate') {
      result = await service.rpc('validate_evaluation_cycle', { p_cycle_id: Number(req.body.cycle_id) });
    } else if (action === 'cycle_activate') {
      result = await service.rpc('activate_evaluation_cycle', { p_cycle_id: Number(req.body.cycle_id) });
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
      result = await service.from('evaluation_questions').update(questionPayload(req.body)).eq('id', Number(req.body.id)).select().single();
    } else if (action === 'question_delete') {
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
      result = existing.data
        ? await service.from('matchings').delete().eq('id', existing.data.id)
        : await service.from('matchings').insert({ cycle_id: cycleId, evaluator_id: evaluatorId, target_id: targetId, type: '관리자 수동 지정', updated_at: new Date().toISOString() }).select().single();
    } else if (action === 'matching_replace') {
      const cycleId = Number(req.body.cycle_id), evaluatorId = Number(req.body.evaluator_id);
      const targetIds = [...new Set((req.body.target_ids || []).map(Number).filter(id => id && id !== evaluatorId))];
      const existing = await service.from('matchings').select('id,target_id').eq('cycle_id', cycleId).eq('evaluator_id', evaluatorId);
      if (existing.error) throw existing.error;
      const protectedTargetIds = new Set();
      if ((existing.data || []).length) {
        const evaluated = await service.from('evaluations').select('matching_id').in('matching_id', existing.data.map(row => row.id));
        if (evaluated.error) throw evaluated.error;
        const evaluatedIds = new Set((evaluated.data || []).map(row => row.matching_id));
        for (const row of existing.data) if (evaluatedIds.has(row.id)) protectedTargetIds.add(Number(row.target_id));
      }
      for (const targetId of protectedTargetIds) if (!targetIds.includes(targetId)) targetIds.push(targetId);
      const removable = (existing.data || []).filter(row => !protectedTargetIds.has(Number(row.target_id))).map(row => row.id);
      if (removable.length) { const removed = await service.from('matchings').delete().in('id', removable); if (removed.error) throw removed.error; }
      const rows = targetIds.filter(targetId => !protectedTargetIds.has(targetId)).map(targetId => ({
        cycle_id: cycleId, evaluator_id: evaluatorId, target_id: targetId, type: '관리자 수동 지정', updated_at: new Date().toISOString()
      }));
      if (rows.length) { const inserted = await service.from('matchings').upsert(rows, { onConflict: 'cycle_id,evaluator_id,target_id' }); if (inserted.error) throw inserted.error; }
      result = { data: { protected_target_ids: [...protectedTargetIds] }, error: null };
    } else if (action === 'matching_generate') {
      const cycleId = Number(req.body.cycle_id);
      if (!cycleId) return send(res, 400, { error: '평가 주기가 필요합니다.' });
      const [users, existing, submitted] = await Promise.all([
        service.from('users').select('id,company,dept,workplace,can_evaluate,is_evaluatee,active').eq('active', true),
        service.from('matchings').select('id,evaluator_id,target_id,type').eq('cycle_id', cycleId),
        service.from('evaluations').select('matching_id').eq('cycle_id', cycleId)
      ]);
      for (const query of [users, existing, submitted]) if (query.error) throw query.error;
      const evaluators = (users.data || []).filter(user => user.can_evaluate !== false);
      const targets = (users.data || []).filter(user => user.is_evaluatee !== false);
      const desired = new Map();
      for (const evaluator of evaluators) {
        const evaluatorIsBranch = String(evaluator.workplace || '').includes('영업소') || String(evaluator.dept || '').includes('영업소');
        for (const target of targets) {
          if (evaluator.id === target.id) continue;
          const targetIsBranch = String(target.workplace || '').includes('영업소') || String(target.dept || '').includes('영업소');
          const eligible = evaluatorIsBranch
            ? evaluator.company === target.company
            : !targetIsBranch;
          if (eligible) desired.set(`${evaluator.id}:${target.id}`, {
            cycle_id: cycleId, evaluator_id: evaluator.id, target_id: target.id,
            type: '알고리즘 자동 지정', updated_at: new Date().toISOString()
          });
        }
      }
      const existingMap = new Map((existing.data || []).map(row => [`${row.evaluator_id}:${row.target_id}`, row]));
      const submittedIds = new Set((submitted.data || []).map(row => Number(row.matching_id)));
      const obsoleteIds = (existing.data || []).filter(row =>
        row.type === '알고리즘 자동 지정'
        && !desired.has(`${row.evaluator_id}:${row.target_id}`)
        && !submittedIds.has(Number(row.id))
      ).map(row => row.id);
      if (obsoleteIds.length) {
        const removed = await service.from('matchings').delete().in('id', obsoleteIds);
        if (removed.error) throw removed.error;
      }
      const rows = [...desired.entries()].filter(([key]) => !existingMap.has(key)).map(([, row]) => row);
      if (rows.length) {
        const inserted = await service.from('matchings').insert(rows).select('id');
        if (inserted.error) throw inserted.error;
      }
      result = { data: { inserted: rows.length, removed: obsoleteIds.length, desired: desired.size }, error: null };
    } else if (action === 'cycle_close') {
      return send(res, 200, { archive: await closeCycle(service, Number(req.body.cycle_id), authUser, profile) });
    } else if (action === 'archive_delete') {
      result = await service.from('evaluation_archives').delete().eq('cycle_id', Number(req.body.cycle_id));
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
