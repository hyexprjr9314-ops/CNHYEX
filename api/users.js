import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['name', 'email', 'company', 'dept', 'workplace', 'role', 'type', 'sys_role'];
const ALLOWED_TYPES = new Set(['팀원급', '팀장급', '부서실장급', '임원급']);
const ALLOWED_ROLES = new Set(['일반사용자', '관리자', '임원']);
const ALLOWED_COMPANIES = new Set(['(주)한양고속', '(주)충남고속']);
const SUPER_ADMIN_EMAIL = 'admin@cnhyex.com';

function send(res, status, payload) {
  res.status(status).json(payload);
}

function normalize(row) {
  return {
    name: String(row.name || '').trim(),
    email: String(row.email || '').trim().toLowerCase(),
    company: String(row.company || '').trim(),
    dept: String(row.dept || '').trim(),
    workplace: String(row.workplace || '').trim(),
    role: String(row.role || '').trim(),
    joindate: row.joindate ? String(row.joindate).trim() : null,
    type: String(row.type || '').trim(),
    phone: String(row.phone || '010-0000-0000').trim(),
    sys_role: String(row.sys_role || '일반사용자').trim(),
    temporary_password: String(row.temporary_password || '').trim()
  };
}

function validate(row) {
  const missing = REQUIRED.filter(key => !row[key]);
  if (missing.length) return `필수값 누락: ${missing.join(', ')}`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return '이메일 형식 오류';
  if (!ALLOWED_TYPES.has(row.type)) return `허용되지 않은 사원구분: ${row.type}`;
  if (!ALLOWED_ROLES.has(row.sys_role)) return `허용되지 않은 시스템권한: ${row.sys_role}`;
  if (!ALLOWED_COMPANIES.has(row.company)) return `허용되지 않은 소속사: ${row.company}`;
  if (row.temporary_password && row.temporary_password.length < 8) return '임시비밀번호는 8자 이상이어야 합니다';
  return null;
}

async function authorize(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('로그인이 필요합니다.');
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('유효하지 않은 로그인입니다.');
  const { data: profile, error: profileError } = await service
    .from('users').select('id,sys_role,active').eq('auth_user_id', data.user.id).maybeSingle();
  if (profileError || !profile || profile.active !== true || !['관리자', '임원'].includes(profile.sys_role)) {
    throw new Error('관리자 권한이 필요합니다.');
  }
  return data.user;
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
    await authorize(req, service);
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
      const { temporary_password, ...profile } = row;
      const { data: existing } = await service.from('users').select('auth_user_id,email').eq('id', id).single();
      const isSuperAdmin = existing?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
      if (isSuperAdmin) {
        profile.email = SUPER_ADMIN_EMAIL;
        profile.sys_role = '관리자';
        profile.active = true;
      }
      if (existing?.auth_user_id) {
        const attrs = { email: isSuperAdmin ? SUPER_ADMIN_EMAIL : row.email };
        if (temporary_password) attrs.password = temporary_password;
        const { error: authError } = await service.auth.admin.updateUserById(existing.auth_user_id, attrs);
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
        let generatedPassword = '';
        if (!authUser) {
          generatedPassword = row.temporary_password || `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
          const created = await service.auth.admin.createUser({
            email: row.email, password: generatedPassword, email_confirm: true,
            user_metadata: { name: row.name }
          });
          if (created.error) throw created.error;
          authUser = created.data.user;
        } else if (row.temporary_password) {
          const updated = await service.auth.admin.updateUserById(authUser.id, { password: row.temporary_password });
          if (updated.error) throw updated.error;
          generatedPassword = row.temporary_password;
        }
        const { temporary_password, ...profile } = row;
        const { data: existing, error: findError } = await service.from('users').select('id').eq('email', row.email).maybeSingle();
        if (findError) throw findError;
        if (row.email === SUPER_ADMIN_EMAIL) profile.sys_role = '관리자';
        const payload = { ...profile, auth_user_id: authUser.id, active: true, updated_at: new Date().toISOString() };
        const write = existing
          ? await service.from('users').update(payload).eq('id', existing.id)
          : await service.from('users').insert(payload);
        if (write.error) throw write.error;
        results.push({ email: row.email, name: row.name, status: 'success', temporary_password: generatedPassword, message: existing ? 'updated' : 'created' });
      } catch (error) {
        results.push({ email: row.email, name: row.name, status: 'failed', message: error.message });
      }
    }
    return send(res, 200, { results, success: results.filter(r => r.status === 'success').length, failed: results.filter(r => r.status === 'failed').length });
  } catch (error) {
    return send(res, /권한|로그인/.test(error.message) ? 403 : 500, { error: error.message });
  }
}
