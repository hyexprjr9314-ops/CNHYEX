const LEADER_TYPES = new Set(['\uD300\uC7A5/\uBD80\uC11C\uC7A5\uAE09', '\uD300\uC7A5\uAE09', '\uBD80\uC11C\uC2E4\uC7A5\uAE09']);
export const TRACKS = Object.freeze({ headquarters_member: 'headquarters_member', headquarters_leader: 'headquarters_leader', branch_employee: 'branch_employee', mechanic: 'mechanic' });
export const DEFAULT_TRACK = 'all';
export const QUESTION_AUDIENCES = Object.freeze({ standard: 'all', affiliatePeer: 'affiliate_peer', leaderPeer: 'leader_peer' });
export const TRACK_ALIASES = Object.freeze({
  all: DEFAULT_TRACK,
  '기본 필수질문': DEFAULT_TRACK,
  '전사 공통': DEFAULT_TRACK,
  headquarters_member: TRACKS.headquarters_member,
  '본사 팀원급': TRACKS.headquarters_member,
  '팀원급': TRACKS.headquarters_member,
  headquarters_leader: TRACKS.headquarters_leader,
  '팀장/부서장급': TRACKS.headquarters_leader,
  '팀장·부서장급': TRACKS.headquarters_leader,
  '팀장급': TRACKS.headquarters_leader,
  branch_employee: TRACKS.branch_employee,
  '영업소': TRACKS.branch_employee,
  '영업소 직원': TRACKS.branch_employee,
  mechanic: TRACKS.mechanic,
  '정비사': TRACKS.mechanic
});
export const TRACK_CATEGORIES = Object.freeze({
  headquarters_member: ['\uC131\uACFC', '\uD611\uC5C5', '\uC131\uC7A5', '\uC870\uD654'],
  headquarters_leader: ['\uB9AC\uB354\uC2ED', '\uD300\uC6D0 \uC721\uC131', '\uC18C\uD1B5', '\uC804\uB7B5\uC801 \uC0AC\uACE0'],
  branch_employee: ['\uC131\uACFC', '\uD611\uC5C5', '\uC131\uC7A5', '\uC870\uD654'],
  mechanic: ['\uC5ED\uB7C9 \uAC1C\uBC1C', '\uC815\uBE44 \uB2A5\uB825', '\uCC45\uC784/\uC8FC\uC778\uC758\uC2DD', '\uC548\uC804\uC758\uC2DD']
});
export function isLeader(user = {}) {
  const employeeType = String(user.type || '').trim();
  return LEADER_TYPES.has(employeeType);
}

export function isMechanic(user = {}) {
  const employeeType = String(user.type || '').trim();
  const role = String(user.role || '').trim();
  const dept = String(user.dept || '').trim();
  return employeeType === '\uC815\uBE44\uC0AC'
    || (employeeType === '\uD300\uC6D0\uAE09' && (/\uC815\uBE44/.test(role) || ['\uC815\uBE44', '\uC815\uBE44\uD300'].includes(dept)));
}

export function normalizeTrack(track, fallback = DEFAULT_TRACK) {
  return TRACK_ALIASES[String(track || '').trim()] || fallback;
}

export function targetTrack(user = {}) {
  const employeeType = String(user.type || '').trim();
  if (isMechanic(user)) return TRACKS.mechanic;
  if (LEADER_TYPES.has(employeeType)) return TRACKS.headquarters_leader;
  if (`${user.workplace || ''} ${user.dept || ''}`.includes('\uC601\uC5C5\uC18C')) return TRACKS.branch_employee;
  return TRACKS.headquarters_member;
}

export function relationshipType(evaluator = {}, target = {}) {
  const evaluatorIsLeader = isLeader(evaluator);
  const targetIsLeader = isLeader(target);
  const evaluatorDepartment = String(evaluator.dept || '').trim();
  const targetDepartment = String(target.dept || '').trim();
  const evaluatorCompany = String(evaluator.company || '').trim();
  const targetCompany = String(target.company || '').trim();

  if (evaluatorIsLeader && targetIsLeader) return 'exchange';
  if (targetIsLeader) return 'leadership';
  return evaluatorCompany === targetCompany && evaluatorDepartment === targetDepartment ? 'internal' : 'exchange';
}

export function questionAudience(evaluator = {}, target = {}) {
  const evaluatorCompany = String(evaluator.company || '').trim();
  const targetCompany = String(target.company || '').trim();
  const bothTeamMembers = !isMechanic(evaluator) && !isMechanic(target)
    && String(evaluator.type || '').trim() === '\uD300\uC6D0\uAE09'
    && String(target.type || '').trim() === '\uD300\uC6D0\uAE09';
  if (isLeader(evaluator) && isLeader(target)) return QUESTION_AUDIENCES.leaderPeer;
  return bothTeamMembers && evaluatorCompany && targetCompany && evaluatorCompany !== targetCompany
    ? QUESTION_AUDIENCES.affiliatePeer
    : QUESTION_AUDIENCES.standard;
}

export function normalizedCategory(category) {
  return String(category || '').replace(/[\s/]+/g, ' ').trim();
}
