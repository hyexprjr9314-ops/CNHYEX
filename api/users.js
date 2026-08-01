import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { ROLES } from './role-policy.js';
import { isMutableDraftCycle } from './questions.js';

const REQUIRED = ['name', 'email', 'company', 'dept', 'workplace', 'role', 'type', 'sys_role'];
const ALLOWED_TYPES = new Set(['팀원급', '팀장/부서장급', '임원급', '정비사']);
const ALLOWED_ROLES = new Set(['일반사용자', '관리자', '임원']);
const ALLOWED_COMPANIES = new Set(['(주)한양고속', '(주)충남고속']);
const SUPER_ADMIN_EMAIL = 'admin@cnhyex.com';
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

function send(res, status, payload) {
  res.status(status).json(payload);
}

function normalizeLoginId(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function normalize(row) {
  const loginMethod = ['email', 'pin', 'none'].includes(row.login_method) ? row.login_method : 'email';
  const loginId = loginMethod === 'pin' ? normalizeLoginId(row.login_id) : String(row.email || '').trim().toLowerCase();
  const email = loginMethod === 'pin' ? `${loginId.toLowerCase()}@noemail.cnhyex.invalid` : String(row.email || '').trim().toLowerCase();
  return {
    name: String(row.name || '').trim(),
    email,
    auth_email: loginMethod === 'none' ? null : email,
    login_method: loginMethod,
    login_id: loginMethod === 'none' ? null : loginId,
    company: normalizeCompany(row.company),
    dept: String(row.dept || '').trim(),
    workplace: String(row.workplace || '').trim(),
    role: String(row.role || '').trim(),
    joindate: row.joindate ? String(row.joindate).trim() : null,
    type: String(row.type || '').trim(),
    phone: String(row.phone || '010-0000-0000').trim(),
    sys_role: String(row.sys_role || '일반사용자').trim()
  };
}

function validate(row) {
  const missing = REQUIRED.filter(key => !row[key]);
  if (missing.length) return `필수값 누락: ${missing.join(', ')}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return '이메일 형식 오류';
  if (row.login_method === 'pin' && !/^[A-Z0-9-]{3,30}$/.test(row.login_id)) return '사번은 영문·숫자·하이픈 3~30자로 입력해 주세요.';
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
  if (!token) throw new Error('로그인이 필요합니다.');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('유효하지 않은 로그인입니다.');
  const { data: profile, error: profileError } = await service
    .from('users').select('id,sys_role,active').eq('auth_user_id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.active !== true || profile.sys_role !== ROLES.admin) {
    throw new Error('관리자 권한이 필요합니다.');
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

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return send(res, 500, { error: 'Vercel 환경변수가 설정되지 않았습니다.' });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const actor = await authorize(req, service);
    if (req.method === 'GET') {
      const { data, error } = await service.from('users').select(
        'id,name,email,company,dept,workplace,role,joindate,type,phone,sys_role,active,auth_user_id,can_evaluate,is_evaluatee,login_method,login_id,pin_enrolled,pin_enrollment_expires_at'
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
      return send(res, 405, { error: '영구 삭제는 지원하지 않습니다. 활성화 상태를 변경해 주세요.' });
    }
    if (req.method !== 'POST') return send(res, 405, { error: '지원하지 않는 요청입니다.' });

    if (req.body?.action === 'send_password_reset') {
      return send(res, 410, { error: '비밀번호 메일 발송은 중복 방지 기능이 있는 /api/mail을 사용해 주세요.' });
    }
    if (req.body?.action === 'generate_pin_enrollment') {
      const id = Number(req.body?.id);
      const target = await service.from('users')
        .select('id,name,login_id,login_method,auth_user_id,active,pin_enrolled').eq('id', id).single();
      if (target.error) throw target.error;
      if (target.data.active !== true || target.data.login_method !== 'pin' || !target.data.auth_user_id) {
        return send(res, 409, { error: '활성화된 사번·PIN 사용자만 등록 링크를 발급할 수 있습니다.' });
      }
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const saved = await service.from('users').update({
        pin_enrolled: false,
        pin_enrollment_token_hash: crypto.createHash('sha256').update(token).digest('hex'),
        pin_enrollment_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (saved.error) throw saved.error;
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
      const origin = String(process.env.APP_ORIGIN || 'https://cnhyex.vercel.app').replace(/\/$/, '');
      const enrollmentUrl = `${origin}/#enroll=${token}`;
      return send(res, 200, {
        login_id: target.data.login_id,
        expires_at: expiresAt,
        enrollment_url: enrollmentUrl,
        qr_data_url: await QRCode.toDataURL(enrollmentUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      });
    }

    const rows = Array.isArray(req.body?.users) ? req.body.users : [];
    if (!rows.length || rows.length > 500) return send(res, 400, { error: '사용자 1~500명을 전달해 주세요.' });
    const duplicateEmails = new Set();
    const seen = new Set();
    rows.forEach(raw => {
      const key = raw.login_method === 'pin'
        ? `pin:${normalizeLoginId(raw.login_id)}`
        : `email:${String(raw.email || '').trim().toLowerCase()}`;
      if (seen.has(key)) duplicateEmails.add(key);
      seen.add(key);
    });
    const results = [];
    for (const raw of rows) {
      const row = normalize(raw);
      const duplicateKey = row.login_method === 'pin' ? `pin:${row.login_id}` : `email:${row.email}`;
      const invalid = validate(row) || (duplicateEmails.has(duplicateKey) ? 'CSV 내 로그인 ID 중복' : null);
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
          ? await service.from('users').update(payload).eq('id', existing.id)
          : await service.from('users').insert(payload);
        if (write.error) throw write.error;
        results.push({ email: row.email, name: row.name, status: 'success', message: existing ? 'updated' : 'created' });
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
    return send(res, /권한|로그인/.test(error.message) ? 403 : 500, { error: error.message });
  }
}
