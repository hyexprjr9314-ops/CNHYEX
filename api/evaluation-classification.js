const LEADER_TYPES = new Set(['\uD300\uC7A5\uAE09', '\uBD80\uC11C\uC2E4\uC7A5\uAE09', '\uC784\uC6D0\uAE09']);
const LEADER_ROLE_PATTERN = /(\uD300\uC7A5|\uBD80\uC7A5|\uC2E4\uC7A5|\uBCF8\uBD80\uC7A5|\uC18C\uC7A5|\uC9C0\uC810\uC7A5|\uC13C\uD130\uC7A5|\uC774\uC0AC|\uC0C1\uBB34|\uC804\uBB34|\uB300\uD45C|\uC784\uC6D0)/;
export const TRACKS = Object.freeze({ headquarters_member: 'headquarters_member', headquarters_leader: 'headquarters_leader', branch_employee: 'branch_employee', mechanic: 'mechanic' });
export const DEFAULT_TRACK = 'all';
export const TRACK_ALIASES = Object.freeze({
  all: DEFAULT_TRACK,
  '기본 필수질문': DEFAULT_TRACK,
  '전사 공통': DEFAULT_TRACK,
  headquarters_member: TRACKS.headquarters_member,
  '본사 팀원급': TRACKS.headquarters_member,
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
  branch_employee: ['\uBE44\uC0C1\uB300\uC751', '\uC18C\uD1B5 \uD611\uB825', '\uC194\uC120 \uC218\uBC94', '\uAC08\uB4F1 \uD574\uC18C'],
  mechanic: ['\uC5ED\uB7C9 \uAC1C\uBC1C', '\uC815\uBE44 \uB2A5\uB825', '\uCC45\uC784/\uC8FC\uC778\uC758\uC2DD', '\uC548\uC804\uC758\uC2DD']
});
export function isLeader(user = {}) {
  const employeeType = String(user.type || '').trim();
  const role = String(user.role || '');
  return LEADER_TYPES.has(employeeType) || LEADER_ROLE_PATTERN.test(role);
}

export function normalizeTrack(track, fallback = DEFAULT_TRACK) {
  return TRACK_ALIASES[String(track || '').trim()] || fallback;
}

export function targetTrack(user = {}) {
  const workplaceText = `${user.company || ''} ${user.dept || ''} ${user.workplace || ''}`;
  // Leadership is a role, not a workplace. A branch or maintenance leader
  // therefore receives the leadership question set before job-area routing.
  if (isLeader(user)) return TRACKS.headquarters_leader;
  if (workplaceText.includes('\uC815\uBE44')) return TRACKS.mechanic;
  if (workplaceText.includes('\uC601\uC5C5\uC18C')) return TRACKS.branch_employee;
  return TRACKS.headquarters_member;
}

export function relationshipType(evaluator = {}, target = {}) {
  const evaluatorIsLeader = isLeader(evaluator);
  const targetIsLeader = isLeader(target);
  const evaluatorDepartment = String(evaluator.dept || '');
  const targetDepartment = String(target.dept || '');

  if (evaluatorIsLeader && targetIsLeader && evaluatorDepartment !== targetDepartment) return 'exchange';
  return targetIsLeader ? 'leadership' : 'internal';
}

export function normalizedCategory(category) {
  return String(category || '').replace(/[\s/]+/g, ' ').trim();
}
