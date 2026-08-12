import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { activationCodeHash, normalizeLoginId, normalizeLoginName } from '../lib/pin-auth.js';
import { handleRelationshipNotes } from '../lib/relationship-notes.js';
import { ROLES } from './role-policy.js';
import { isMutableDraftCycle } from './questions.js';

const REQUIRED = ['name', 'email', 'company', 'dept', 'workplace', 'role', 'type', 'sys_role'];
const ALLOWED_TYPES = new Set(['팀원급', '팀장/부서장급', '임원급', '정비사']);
const ALLOWED_ROLES = new Set(['일반사용자', '관리자', '임원']);
const ALLOWED_COMPANIES = new Set(['(주)한양고속', '(주)충남고속']);
const SUPER_ADMIN_EMAIL = 'admin@cnhyex.com';
const PIN_INITIAL_ACTIVATION_CODE = '12345678';
const CLASSIFICATION_FIELDS = Object.freeze(['company', 'dept', 'workplace', 'role', 'type']);

function isClosedHistoricalCycle(cycle = {}) {
  return ['마감/보관됨', 'closed', 'archived'].includes(String(cycle.status || '').trim());
}

export function hasClassificationChange(existing = {}, next = {}) {
  return CLASSIFICATION_FIELDS.some(field => String(existing[field] ?? '').trim() !== String(next[field] ?? '').trim());
}

export async function assertPersonnelClassificationMutable(service, existing, next) {
  if (!hasClassificationChange(existing, next)) return;
  const cycles = await service.from('evaluation_cycles').select('id,status,internal_approval_status');
  if (cycles.error) throw cycles.error;
  const locked = (cycles.data || []).some(cycle => !isMutableDraftCycle(cycle) && !isClosedHistoricalCycle(cycle));
  if (locked) {
    throw Object.assign(new Error('진행 중이거나 승인 절차 중인 평가 주기가 있어 소속·부서·근무지·직급·사원구분은 바꿀 수 없습니다.'), { status: 409 });
  }
}
function normalizeCompany(value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim();
  const companyName = normalized.replace(/^\(주\)/, '');
  if (companyName === '한양고속') return '(주)한양고속';
  if (companyName === '충남고속') return '(주)충남고속';
  return normalized;
}

export function normalizeEmployeeType(type, role, dept) {
  const current = String(type || '').trim();
  const mechanicProfile = /정비/.test(String(role || '').trim())
    || ['정비', '정비팀'].includes(String(dept || '').trim());
  return current === '팀원급' && mechanicProfile ? '정비사' : current;
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

function normalize(row) {
  const loginMethod = ['email', 'pin', 'none'].includes(row.login_method) ? row.login_method : 'email';
  const loginId = loginMethod === 'pin'
    ? normalizeLoginId(row.login_id || `PIN-${crypto.randomBytes(8).toString('hex')}`)
    : String(row.email || '').trim().toLowerCase();
  const email = loginMethod === 'pin' ? `${loginId.toLowerCase()}@noemail.cnhyex.invalid` : String(row.email || '').trim().toLowerCase();
  const dept = String(row.dept || '').trim();
  const role = String(row.role || '').trim();
  return {
    name: normalizeLoginName(row.name),
    pin_login_name: loginMethod === 'pin' ? normalizeLoginName(row.name) : null,
    email,
    auth_email: loginMethod === 'none' ? null : email,
    login_method: loginMethod,
    login_id: loginMethod === 'none' ? null : loginId,
    company: normalizeCompany(row.company),
    dept,
    workplace: String(row.workplace || '').trim(),
    role,
    joindate: row.joindate ? String(row.joindate).trim() : null,
    type: normalizeEmployeeType(row.type, role, dept),
    phone: String(row.phone || '010-0000-0000').trim(),
    sys_role: String(row.sys_role || '일반사용자').trim()
  };
}

function validate(row) {
  const missing = REQUIRED.filter(key => !row[key]);
  if (missing.length) return `필수값 누락: ${missing.join(', ')}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return '이메일 형식 오류';
  if (row.login_method === 'pin' && !/^[A-Z0-9-]{3,30}$/.test(row.login_id)) return 'PIN 로그인 내부 식별자가 올바르지 않습니다.';
  if (!ALLOWED_TYPES.has(row.type)) return `허용되지 않은 사원구분: ${row.type}`;
  if (!ALLOWED_ROLES.has(row.sys_role)) return `허용되지 않은 시스템권한: ${row.sys_role}`;
  if (!ALLOWED_COMPANIES.has(row.company)) return `허용되지 않은 소속사: ${row.company}`;
  return null;
}

function applyEmployeeTypePermissions(profile, previousType = null) {
  if (profile.type === '임원급') {
    profile.can_evaluate = false;
    profile.is_evaluatee = false;
  } else if (previousType === '임원급') {
    profile.can_evaluate = true;
    profile.is_evaluatee = true;
  }
}

async function authorize(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('유효하지 않은 로그인입니다.'), { status: 401 });
  const { data: profile, error: profileError } = await service
    .from('users').select('id,sys_role,active').eq('auth_user_id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.active !== true || profile.sys_role !== ROLES.admin) {
    throw Object.assign(new Error('관리자 권한이 필요합니다.'), { status: 403 });
  }
  return { authUser: data.user, profile };
}

async function findAuthUser(service, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find(user => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function assertUserHasNoHistory(service, target) {
  const id = Number(target.id);
  const checks = [
    service.from('matchings').select('id', { count: 'exact', head: true }).or(`evaluator_id.eq.${id},target_id.eq.${id}`),
    service.from('employee_goals').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('evaluation_result_adjustments').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_result_adjustment_events').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_adjustment_workflow_audit').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_cohort_snapshots').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_final_results').select('target_id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_cycle_approval_steps').select('id', { count: 'exact', head: true }).eq('approver_user_id', id),
    service.from('evaluation_matching_change_audit').select('id', { count: 'exact', head: true }).eq('evaluator_id', id),
    service.from('evaluation_mail_dispatch_audit').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('password_reset_email_audit').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('password_reset_request_audit').select('id', { count: 'exact', head: true }).eq('target_id', id),
    service.from('evaluation_notifications').select('id', { count: 'exact', head: true }).eq('recipient_user_id', id),
    service.from('push_device_tokens').select('id', { count: 'exact', head: true }).eq('user_id', id),
    service.from('relationship_notes').select('id', { count: 'exact', head: true }).or(`subject_user_id.eq.${id},related_user_id.eq.${id}`)
  ];
  if (target.auth_user_id) {
    checks.push(
      service.from('evaluation_cycle_governance_audit').select('id', { count: 'exact', head: true }).eq('acted_by', target.auth_user_id),
      service.from('evaluation_matching_change_audit').select('id', { count: 'exact', head: true }).eq('acted_by', target.auth_user_id)
    );
  }
  const results = await Promise.all(checks);
  const failed = results.find(result => result.error);
  if (failed) throw failed.error;
  if (results.some(result => Number(result.count) > 0)) {
    throw Object.assign(new Error('평가·결재·감사 또는 알림 이력이 있는 계정은 완전 삭제할 수 없습니다. 비활성화를 사용해 주세요.'), { status: 409 });
  }
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return send(res, 500, { error: 'Vercel 환경변수가 설정되지 않았습니다.' });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const actor = await authorize(req, service);
    if (req.query?.resource === 'relationship-notes') {
      return handleRelationshipNotes(req, res, service, actor);
    }
    if (req.method === 'GET') {
      const { data, error } = await service.from('users').select(
        'id,name,email,company,dept,workplace,role,joindate,type,phone,sys_role,active,auth_user_id,can_evaluate,is_evaluatee,login_method,login_id,pin_login_name,pin_enrolled,pin_enrollment_expires_at'
      ).order('id');
      if (error) throw error;
      return send(res, 200, { users: data });
    }
    if (req.method === 'PATCH') {
      const id = Number(req.body?.id);
      const row = normalize(req.body || {});
      const invalid = validate(row);
      if (!id || invalid) return send(res, 400, { error: invalid || '사용자 ID가 필요합니다.' });
      const profile = row;
      const { data: existing, error: existingError } = await service.from('users')
        .select('auth_user_id,email,auth_email,login_id,login_method,company,dept,workplace,role,type').eq('id', id).single();
      if (existingError) throw existingError;
      if (req.body?.login_method === undefined && existing.login_method === 'pin') {
        profile.email = existing.email;
        profile.auth_email = existing.auth_email;
        profile.login_id = existing.login_id;
        profile.login_method = 'pin';
        profile.pin_login_name = normalizeLoginName(profile.name);
      }
      applyEmployeeTypePermissions(profile, existing.type);
      await assertPersonnelClassificationMutable(service, existing, profile);
      const isSuperAdmin = existing?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
      if (isSuperAdmin) {
        profile.email = SUPER_ADMIN_EMAIL;
        profile.sys_role = '관리자';
        profile.active = true;
      }
      let authEmailChanged = false;
      if (existing?.auth_user_id) {
        const { error: authError } = await service.auth.admin.updateUserById(existing.auth_user_id, {
          email: isSuperAdmin ? SUPER_ADMIN_EMAIL : profile.auth_email
        });
        if (authError) throw authError;
        authEmailChanged = existing.email !== profile.email;
      }
      const { data, error } = await service.from('users').update({ ...profile, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) {
        if (authEmailChanged) {
          const rollback = await service.auth.admin.updateUserById(existing.auth_user_id, { email: existing.email });
          if (rollback.error) console.error('Auth email rollback failed:', rollback.error);
        }
        throw error;
      }
      return send(res, 200, { user: data });
    }
    if (req.method === 'PUT') {
      const id = Number(req.body?.id);
      const active = req.body?.active;
      if (!id || typeof active !== 'boolean') return send(res, 400, { error: '사용자 ID와 활성화 상태가 필요합니다.' });
      const { data: existing, error: findError } = await service.from('users').select('email').eq('id', id).single();
      if (findError) throw findError;
      if (existing.email?.toLowerCase() === SUPER_ADMIN_EMAIL && active === false) {
        return send(res, 400, { error: '최고관리자 계정은 비활성화할 수 없습니다.' });
      }
      const { data, error } = await service.from('users').update({ active, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
      return send(res, 200, { user: data });
    }
    if (req.method === 'DELETE') {
      const id = Number(req.body?.id);
      if (!id) return send(res, 400, { error: '사용자 ID가 필요합니다.' });
      if (actor.authUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) return send(res, 403, { error: '최고관리자만 계정을 완전 삭제할 수 있습니다.' });
      const target = await service.from('users').select('*').eq('id', id).single();
      if (target.error) throw target.error;
      if (target.data.email?.toLowerCase() === SUPER_ADMIN_EMAIL || target.data.auth_user_id === actor.authUser.id) {
        return send(res, 400, { error: '최고관리자 본인 계정은 삭제할 수 없습니다.' });
      }
      if (String(req.body?.confirmation_name || '').trim() !== target.data.name) {
        return send(res, 400, { error: '삭제 확인 이름이 일치하지 않습니다.' });
      }
      await assertUserHasNoHistory(service, target.data);
      const removed = await service.from('users').delete().eq('id', id).select('*').single();
      if (removed.error) throw removed.error;
      if (target.data.auth_user_id) {
        const deletedAuth = await service.auth.admin.deleteUser(target.data.auth_user_id);
        if (deletedAuth.error) {
          const restored = await service.from('users').insert(removed.data);
          if (restored.error) console.error('Deleted user profile rollback failed:', restored.error);
          throw Object.assign(new Error(restored.error ? '로그인 계정 삭제와 직원 정보 복원에 실패했습니다. 즉시 시스템 점검이 필요합니다.' : '로그인 계정을 삭제하지 못해 직원 정보를 복원했습니다.'), { status: 500 });
        }
      }
      return send(res, 200, { deleted: true, id });
    }
    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });

    if (req.body?.action === 'send_password_reset') {
      return send(res, 410, { error: '비밀번호 메일 발송은 중복 방지 기능이 있는 /api/mail을 사용해 주세요.' });
    }
    if (req.body?.action === 'generate_pin_activation') {
      const id = Number(req.body?.id);
      const target = await service.from('users')
        .select('id,name,company,login_id,login_method,auth_user_id,active,pin_enrolled').eq('id', id).single();
      if (target.error) throw target.error;
      if (target.data.active !== true || target.data.login_method !== 'pin' || !target.data.auth_user_id) {
        return send(res, 409, { error: '활성화된 이름·PIN 사용자만 임시번호를 발급할 수 있습니다.' });
      }
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const temporaryCode = PIN_INITIAL_ACTIVATION_CODE;
      const saved = await service.from('users').update({
        pin_enrolled: false,
        pin_enrollment_token_hash: activationCodeHash(temporaryCode, serviceKey),
        pin_enrollment_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (saved?.error) throw saved.error;
      const invalidated = await service.auth.admin.updateUserById(target.data.auth_user_id, {
        password: `${crypto.randomBytes(24).toString('base64url')}Aa1!`
      });
      if (invalidated.error) {
        await service.from('users').update({
          pin_enrolled: target.data.pin_enrolled === true,
          pin_enrollment_token_hash: null,
          pin_enrollment_expires_at: null
        }).eq('id', id);
        throw invalidated.error;
      }
      return send(res, 200, {
        name: target.data.name,
        company: target.data.company,
        temporary_code: temporaryCode,
        expires_at: expiresAt
      });
    }

    const rows = Array.isArray(req.body?.users) ? req.body.users : [];
    if (!rows.length || rows.length > 500) return send(res, 400, { error: '사용자 1~500명을 전달해 주세요.' });
    const duplicateEmails = new Set();
    const seen = new Set();
    rows.filter(raw => raw.login_method !== 'pin').forEach(raw => {
      const key = `email:${String(raw.email || '').trim().toLowerCase()}`;
      if (seen.has(key)) duplicateEmails.add(key);
      seen.add(key);
    });
    const results = [];
    for (const raw of rows) {
      const row = normalize(raw);
      const duplicateKey = `email:${row.email}`;
      const invalid = validate(row) || (row.login_method !== 'pin' && duplicateEmails.has(duplicateKey) ? 'CSV 내 이메일 중복' : null);
      if (invalid) { results.push({ email: row.email, status: 'failed', message: invalid }); continue; }
      let createdAuthUserId = null;
      try {
        let authUser = await findAuthUser(service, row.email);
        if (!authUser) {
          const generatedPassword = `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
          const created = await service.auth.admin.createUser({
            email: row.email, password: generatedPassword, email_confirm: true,
            user_metadata: { name: row.name }
          });
          if (created.error) throw created.error;
          authUser = created.data.user;
          createdAuthUserId = authUser.id;
        }
        const profile = row;
        const { data: existing, error: findError } = await service.from('users')
          .select('id,company,dept,workplace,role,type').eq('email', row.email).maybeSingle();
        if (findError) throw findError;
        applyEmployeeTypePermissions(profile, existing?.type);
        // CSV upsert must obey the same lifecycle classification guard as the
        // single-profile editor. New profiles are allowed; only a change to an
        // existing person's evaluation classification is blocked.
        if (existing) await assertPersonnelClassificationMutable(service, existing, row);
        if (row.email === SUPER_ADMIN_EMAIL) profile.sys_role = '관리자';
        const payload = { ...profile, auth_user_id: authUser.id, active: true, updated_at: new Date().toISOString() };
        const write = existing
          ? await service.from('users').update(payload).eq('id', existing.id).select('id').single()
          : await service.from('users').insert(payload).select('id').single();
        if (write.error) throw write.error;
        results.push({ user_id: write.data.id, email: row.email, name: row.name, status: 'success', message: existing ? 'updated' : 'created' });
      } catch (error) {
        if (createdAuthUserId) {
          const rollback = await service.auth.admin.deleteUser(createdAuthUserId);
          if (rollback.error) console.error('Orphan Auth user rollback failed:', rollback.error);
        }
        results.push({ email: row.email, name: row.name, status: 'failed', message: error.message });
      }
    }
    return send(res, 200, { results, success: results.filter(r => r.status === 'success').length, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    return send(res, error.status || 500, { error: error.message });
  }
}
