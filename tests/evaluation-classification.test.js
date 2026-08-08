import test from 'node:test'; import assert from 'node:assert/strict';
import { isLeader, normalizeTrack, normalizedCategory, questionAudience, relationshipType, targetTrack, TRACKS, TRACK_CATEGORIES } from '../api/evaluation-classification.js';
test('classification covers tracks and relationship precedence', () => {
  assert.equal(targetTrack({ type: '정비사', dept: '총무' }), TRACKS.mechanic);
  assert.equal(targetTrack({ type: '팀원급', workplace: '부산영업소' }), TRACKS.branch_employee);
  assert.equal(targetTrack({ type: '팀장/부서장급', workplace: '부산영업소' }), TRACKS.headquarters_leader);
  assert.equal(targetTrack({ type: '정비사', workplace: '부산영업소' }), TRACKS.mechanic);
  assert.equal(targetTrack({ type: '팀원급', role: '부장' }), TRACKS.headquarters_member);
  assert.equal(targetTrack({ type: '팀장/부서장급', role: '대리' }), TRACKS.headquarters_leader);
  assert.equal(targetTrack({ role: '대리' }), TRACKS.headquarters_member);
  assert.equal(targetTrack({ role: '과장' }), TRACKS.headquarters_member);
  assert.equal(targetTrack({ type: '정비사', role: '팀장' }), TRACKS.mechanic);
  assert.equal(isLeader({ type: '팀장/부서장급' }), true);
  assert.equal(isLeader({ type: '부서실장급' }), true);
  assert.equal(isLeader({ type: '임원급', role: '부장' }), false);
  assert.equal(isLeader({ role: '대리' }), false);
  assert.equal(relationshipType({ type: '팀장/부서장급' }, { type: '팀장/부서장급' }), 'exchange');
  assert.equal(relationshipType({}, { type: '팀장/부서장급' }), 'leadership');
  assert.equal(relationshipType({ company: '(주)한양고속', dept: '인사' }, { company: '(주)한양고속', dept: '인사' }), 'internal');
  assert.equal(relationshipType({ company: '(주)한양고속', dept: '인사' }, { company: '(주)충남고속', dept: '인사' }), 'exchange');
  assert.equal(relationshipType({ company: '(주)한양고속', dept: '인사' }, { company: '(주)한양고속', dept: '영업' }), 'exchange');
  assert.equal(normalizedCategory('소통 / 협력'), '소통 협력');
  assert.equal(normalizeTrack('기본 필수질문'), 'all');
  assert.equal(normalizeTrack('팀장·부서장급'), TRACKS.headquarters_leader);
  assert.equal(normalizeTrack('영업소 직원'), TRACKS.branch_employee);
  assert.equal(normalizeTrack('unrecognized'), 'all');
  assert.deepEqual(TRACK_CATEGORIES.mechanic, ['역량 개발', '정비 능력', '책임/주인의식', '안전의식']);
  assert.deepEqual(TRACK_CATEGORIES.branch_employee, TRACK_CATEGORIES.headquarters_member);
});

test('affiliate questions apply only to cross-company team-member pairs', () => {
  const member = company => ({ type: '팀원급', company });
  assert.equal(questionAudience(member('(주)충남고속'), member('(주)한양고속')), 'affiliate_peer');
  assert.equal(questionAudience(member('(주)충남고속'), member('(주)충남고속')), 'all');
  assert.equal(questionAudience({ type: '팀장/부서장급', company: '(주)충남고속' }, member('(주)한양고속')), 'all');
  assert.equal(questionAudience(member('(주)충남고속'), { type: '팀장/부서장급', company: '(주)한양고속' }), 'all');
  assert.equal(questionAudience(member(''), member('(주)한양고속')), 'all');
});

test('leader peers use collaboration-specific questions', () => {
  const leader = company => ({ type: '팀장/부서장급', company });
  assert.equal(questionAudience(leader('(주)충남고속'), leader('(주)한양고속')), 'leader_peer');
  assert.equal(questionAudience(leader('(주)충남고속'), leader('(주)충남고속')), 'leader_peer');
});
