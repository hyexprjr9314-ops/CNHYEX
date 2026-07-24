import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ROLES } from './role-policy.js';
import { canonicalPasswordResetRedirect } from './mail-delivery.js';
import { isMutableDraftCycle } from './questions.js';

const REQUIRED = ['name', 'email', 'company', 'dept', 'workplace', 'role', 'type', 'sys_role'];
const ALLOWED_TYPES = new Set(['팀원급', '팀장급', '부서실장급', '임원급']);
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

function normalize(row) {
  return {
    name: String(row.name || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
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
  if (!ALLOWED_TYPES.has(row.type)) return `허용되지 않은 사원구분: ${row.type}`;
  if (!ALLOWED_ROLES.has(row.sys_role)) return `허용되지 않은 시스템권한: ${row.sys_role}`;
  if (!ALLOWED_COMPANIES.has(row.company)) return `허용되지 않은 소속사: ${row.company}`;
  return null;
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
      const { data, error } = await service.from('users').select('*').order('id');
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
        .select('auth_user_id,email,company,dept,workplace,role,type').eq('id', id).single();
      if (existingError) throw existingError;
      await assertPersonnelClassificationMutable(service, existing, profile);
      const isSuperAdmin = existing?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
      if (isSuperAdmin) {
        profile.email = SUPER_ADMIN_EMAIL;
        profile.sys_role = '관리자';
        profile.active = true;
      }
      if (existing?.auth_user_id) {
        const { error: authError } = await service.auth.admin.updateUserById(existing.auth_user_id, {
          email: isSuperAdmin ? SUPER_ADMIN_EMAIL : row.email
        });
        if (authError) throw authError;
      }
      const { data, error } = await service.from('users').update({ ...profile, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (error) throw error;
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
      const id = Number(req.body?.id);
      if (!id) return send(res, 400, { error: '사용자 ID가 필요합니다.' });
      const { data: target, error: targetError } = await service.from('users')
        .select('id,name,email,auth_user_id,active').eq('id', id).single();
      if (targetError) throw targetError;
      if (!target.auth_user_id) return send(res, 409, { error: 'Supabase Auth에 연결되지 않은 사용자입니다.' });
      if (target.active !== true) return send(res, 409, { error: '비활성화된 사용자에게는 메일을 발송할 수 없습니다.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target.email)) {
        return send(res, 400, { error: '실제로 수신할 수 있는 이메일 주소가 필요합니다.' });
      }

      const redirectTo = canonicalPasswordResetRedirect(process.env.PASSWORD_RESET_REDIRECT_URL);
      const requestedAt = new Date().toISOString();
      const { error: resetError } = await service.auth.resetPasswordForEmail(target.email, { redirectTo });
      const audit = await service.from('password_reset_email_audit').insert({
        target_id: target.id, target_email: target.email,
        requested_by: actor.authUser.id, requested_at: requestedAt,
        status: resetError ? 'failed' : 'sent',
        error_message: resetError ? String(resetError.message || resetError).slice(0, 1000) : null
      });
      if (audit.error) throw audit.error;
      if (resetError) throw resetError;
      return send(res, 200, {
        sent: true, email: target.email,
        message: '비밀번호 재설정 링크를 이메일로 발송했습니다.'
      });
    }

    const rows = Array.isArray(req.body?.users) ? req.body.users : [];
    if (!rows.length || rows.length > 500) return send(res, 400, { error: '사용자 1~500명을 전달해 주세요.' });
    const duplicateEmails = new Set();
    const seen = new Set();
    rows.forEach(raw => { const email = String(raw.email || '').trim().toLowerCase(); if (seen.has(email)) duplicateEmails.add(email); seen.add(email); });
    const results = [];
    for (const raw of rows) {
      const row = normalize(raw);
      const invalid = validate(row) || (duplicateEmails.has(row.email) ? 'CSV 내 이메일 중복' : null);
      if (invalid) { results.push({ email: row.email, status: 'failed', message: invalid }); continue; }
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
        }
        const profile = row;
        const { data: existing, error: findError } = await service.from('users')
          .select('id,company,dept,workplace,role,type').eq('email', row.email).maybeSingle();
        if (findError) throw findError;
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
        results.push({ email: row.email, name: row.name, status: 'failed', message: error.message });
      }
    }
    return send(res, 200, { results, success: results.filter(r => r.status === 'success').length, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    return send(res, /권한|로그인/.test(error.message) ? 403 : 500, { error: error.message });
  }
}
