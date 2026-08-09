const SUPER_ADMIN_EMAIL = 'admin@cnhyex.com';
const CATEGORIES = new Set(['업무 접점', '협업 관찰', '반복 배정', '배제 검토', '기타']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const send = (res, status, payload) => res.status(status).json(payload);

export function relationshipNotePayload(body = {}) {
  const subjectUserId = Number(body.subject_user_id);
  const relatedUserId = Number(body.related_user_id);
  const category = String(body.category || '').trim();
  const noteText = String(body.note_text || '').trim();
  const observedOn = String(body.observed_on || '').trim();
  const expiresOn = String(body.expires_on || '').trim() || null;
  if (!subjectUserId || !relatedUserId || subjectUserId === relatedUserId) {
    throw Object.assign(new Error('서로 다른 두 직원을 선택해 주세요.'), { status: 400 });
  }
  if (!CATEGORIES.has(category)) throw Object.assign(new Error('유효한 메모 분류를 선택해 주세요.'), { status: 400 });
  if (noteText.length < 10 || noteText.length > 2000) throw Object.assign(new Error('메모는 10~2000자로 입력해 주세요.'), { status: 400 });
  if (!DATE_PATTERN.test(observedOn) || (expiresOn && (!DATE_PATTERN.test(expiresOn) || expiresOn < observedOn))) {
    throw Object.assign(new Error('관찰일과 유효기간을 확인해 주세요.'), { status: 400 });
  }
  return { subject_user_id: subjectUserId, related_user_id: relatedUserId, category, note_text: noteText, observed_on: observedOn, expires_on: expiresOn };
}

async function assertUsersExist(service, ids) {
  const result = await service.from('users').select('id').in('id', ids);
  if (result.error) throw result.error;
  if (new Set((result.data || []).map(row => Number(row.id))).size !== 2) {
    throw Object.assign(new Error('선택한 직원을 찾을 수 없습니다.'), { status: 404 });
  }
}

export async function handleRelationshipNotes(req, res, service, actor) {
  try {
    if (req.method === 'GET') {
      const noteId = Number(req.query?.note_id);
      if (req.query?.history === '1') {
        if (!noteId) return send(res, 400, { error: '메모 ID가 필요합니다.' });
        const history = await service.from('relationship_note_audit').select('id,note_id,action,old_record,new_record,acted_by,acted_at').eq('note_id', noteId).order('acted_at', { ascending: false });
        if (history.error) throw history.error;
        return send(res, 200, { history: history.data || [] });
      }
      const notes = await service.from('relationship_notes').select('*').order('observed_on', { ascending: false }).order('id', { ascending: false });
      if (notes.error) throw notes.error;
      return send(res, 200, { notes: notes.data || [] });
    }
    if (req.method === 'POST') {
      const row = relationshipNotePayload(req.body);
      await assertUsersExist(service, [row.subject_user_id, row.related_user_id]);
      const created = await service.from('relationship_notes').insert({ ...row, created_by: actor.authUser.id, updated_by: actor.authUser.id }).select().single();
      if (created.error) throw created.error;
      return send(res, 201, { note: created.data });
    }
    if (req.method === 'PATCH') {
      const id = Number(req.body?.id);
      if (!id) return send(res, 400, { error: '메모 ID가 필요합니다.' });
      if (req.body?.status !== undefined) {
        const status = req.body.status === 'active' ? 'active' : 'inactive';
        const updated = await service.from('relationship_notes').update({ status, updated_by: actor.authUser.id, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (updated.error) throw updated.error;
        return send(res, 200, { note: updated.data });
      }
      const row = relationshipNotePayload(req.body);
      await assertUsersExist(service, [row.subject_user_id, row.related_user_id]);
      const updated = await service.from('relationship_notes').update({ ...row, updated_by: actor.authUser.id, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      if (updated.error) throw updated.error;
      return send(res, 200, { note: updated.data });
    }
    if (req.method === 'DELETE') {
      if (String(actor.authUser.email || '').toLowerCase() !== SUPER_ADMIN_EMAIL) return send(res, 403, { error: '최고관리자만 영구 삭제할 수 있습니다.' });
      const id = Number(req.body?.id);
      if (!id || String(req.body?.confirmation || '') !== '영구 삭제') return send(res, 400, { error: '영구 삭제 확인 문구가 필요합니다.' });
      const marked = await service.from('relationship_notes').update({ updated_by: actor.authUser.id, updated_at: new Date().toISOString() }).eq('id', id).select('id').single();
      if (marked.error) throw marked.error;
      const deleted = await service.from('relationship_notes').delete().eq('id', id).select('id').single();
      if (deleted.error) throw deleted.error;
      return send(res, 200, { deleted_id: deleted.data.id });
    }
    return send(res, 405, { error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    console.error('Relationship notes API error:', error);
    return send(res, error.status || 500, { error: error.status ? error.message : '관계 메모 처리 중 서버 오류가 발생했습니다.' });
  }
}
