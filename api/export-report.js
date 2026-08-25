import { createClient } from '@supabase/supabase-js';
import { buildEvaluationReportWorkbook } from '../lib/evaluation-report-workbook.js';
import { ROLES } from './role-policy.js';

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function authenticate(req, service) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  const auth = await service.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Object.assign(new Error('로그인 세션이 올바르지 않습니다.'), { status: 401 });
  const profile = await service.from('users').select('sys_role,active').eq('auth_user_id', auth.data.user.id).maybeSingle();
  if (profile.error || !profile.data || profile.data.active !== true || ![ROLES.admin, ROLES.executive].includes(profile.data.sys_role)) {
    throw Object.assign(new Error('관리자 또는 임원 권한이 필요합니다.'), { status: 403 });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const service = serviceClient();
    await authenticate(req, service);
    const cycleName = String(req.body?.cycle_name || '인사평가').slice(0, 100);
    const reportDate = String(req.body?.report_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const workbook = buildEvaluationReportWorkbook({ cycleName, reportDate, rows: req.body?.rows });
    const bytes = await workbook.xlsx.writeBuffer();
    const safeName = cycleName.replace(/[\\/:*?"<>|]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}_인사평가_전체리포트_${reportDate}.xlsx`)}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(bytes));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Excel 리포트 생성에 실패했습니다.' });
  }
}
