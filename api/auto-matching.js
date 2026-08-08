import { isLeader, isMechanic, relationshipType } from './evaluation-classification.js';

export const AUTO_MATCHING_TYPE = '알고리즘 자동 지정';
export const MAX_STANDARD_TARGETS = 7;

const normalize = value => String(value || '')
  .toLowerCase()
  .replace(/[\sㆍ·._\-()[\]{}]/g, '')
  .replace(/㈜|주식회사|\(주\)/g, '')
  .trim();

const isExecutive = user => normalize(user?.type).includes('임원') || normalize(user?.sys_role) === 'executive';
const isBranch = user => `${normalize(user?.workplace)}${normalize(user?.dept)}`.includes('영업소');
const isTeamMember = user => normalize(user?.type) === '팀원급' && !isMechanic(user);
const isVehicleSafety = user => /차량|안전/.test(`${normalize(user?.dept)}${normalize(user?.workplace)}`);
const sameCompany = (a, b) => normalize(a?.company) === normalize(b?.company);
const sameDepartment = (a, b) => normalize(a?.dept) === normalize(b?.dept);

const branchLocation = user => {
  const workplace = normalize(user?.workplace).replace(/영업소/g, '');
  return workplace && workplace !== '본사' ? workplace : normalize(user?.dept).replace(/영업소/g, '');
};
const sameBranch = (a, b) => isBranch(a) && isBranch(b)
  && branchLocation(a) && branchLocation(a) === branchLocation(b);

export function allowedMatchingPair(evaluator, target) {
  if (isMechanic(evaluator) && isMechanic(target)) {
    return sameCompany(evaluator, target) && sameDepartment(evaluator, target);
  }
  if ((isMechanic(evaluator) && isBranch(target)) || (isBranch(evaluator) && isMechanic(target))) {
    return sameCompany(evaluator, target) && sameBranch(evaluator, target);
  }
  if (isVehicleSafety(evaluator) && isMechanic(target)) return sameCompany(evaluator, target);
  if (isMechanic(evaluator) || isMechanic(target)) return false;
  if ((isBranch(evaluator) && isTeamMember(evaluator)) || (isBranch(target) && isTeamMember(target))) {
    if (isLeader(evaluator) || isLeader(target)) return sameCompany(evaluator, target) && sameBranch(evaluator, target);
    return isTeamMember(evaluator) && isTeamMember(target) && sameBranch(evaluator, target);
  }
  return true;
}

function baseRules(target) {
  if (isLeader(target)) {
    return [
      { key: 'leadership', all: true, test: evaluator => !isLeader(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
      { key: 'leader_exchange', quota: 2, test: evaluator => isLeader(evaluator) }
    ];
  }
  if (isMechanic(target)) {
    return [
      { key: 'mechanic_peer', quota: 5, test: evaluator => isMechanic(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
      { key: 'branch_peer', quota: 1, test: evaluator => !isMechanic(evaluator) && isBranch(evaluator) && sameCompany(evaluator, target) && sameBranch(evaluator, target) },
      { key: 'vehicle_safety', quota: 1, test: evaluator => isVehicleSafety(evaluator) && sameCompany(evaluator, target) }
    ];
  }
  if (isBranch(target)) {
    return [
      { key: 'supervisor', quota: 1, test: evaluator => isLeader(evaluator) && sameCompany(evaluator, target) && sameBranch(evaluator, target) },
      { key: 'branch_internal', quota: 3, test: evaluator => isTeamMember(evaluator) && sameCompany(evaluator, target) && sameBranch(evaluator, target) },
      { key: 'branch_mechanic', quota: 1, test: evaluator => isMechanic(evaluator) && sameCompany(evaluator, target) && sameBranch(evaluator, target) },
      { key: 'affiliate_peer', quota: 2, test: evaluator => isTeamMember(evaluator) && !sameCompany(evaluator, target) && sameBranch(evaluator, target) }
    ];
  }
  return [
    { key: 'supervisor', quota: 1, test: evaluator => isLeader(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
    { key: 'internal', quota: 4, test: evaluator => !isLeader(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
    { key: 'affiliate_same_department', quota: 2, test: evaluator => !sameCompany(evaluator, target) && sameDepartment(evaluator, target) }
  ];
}

function bucketFor(rules, evaluator) {
  return rules.find(rule => rule.test(evaluator))?.key || null;
}

const stableTie = (cycleId, evaluatorId, targetId) =>
  ((Number(cycleId) * 73856093) ^ (Number(evaluatorId) * 19349663) ^ (Number(targetId) * 83492791)) >>> 0;

export function planAutoMatchings({ cycleId, users = [], existing = [], submittedMatchingIds = [] }) {
  const evaluators = users.filter(user => user.active === true && user.can_evaluate === true && !isExecutive(user));
  const targets = users.filter(user => user.active === true && user.is_evaluatee === true && !isExecutive(user));
  const userById = new Map(users.map(user => [Number(user.id), user]));
  const submitted = new Set(submittedMatchingIds.map(Number));
  const fixed = existing.filter(row => row.type !== AUTO_MATCHING_TYPE || submitted.has(Number(row.id)));
  const load = new Map(evaluators.map(user => [Number(user.id), 0]));
  const targetLoad = new Map(targets.map(user => [Number(user.id), 0]));
  const paired = new Set();

  for (const row of fixed) {
    const evaluatorId = Number(row.evaluator_id);
    const targetId = Number(row.target_id);
    paired.add(`${evaluatorId}:${targetId}`);
    load.set(evaluatorId, (load.get(evaluatorId) || 0) + 1);
    targetLoad.set(targetId, (targetLoad.get(targetId) || 0) + 1);
  }

  const generated = [];
  const shortages = [];
  for (const target of [...targets].sort((a, b) => Number(a.id) - Number(b.id))) {
    const rules = baseRules(target);
    const fixedForTarget = fixed.filter(row => Number(row.target_id) === Number(target.id));
    for (const rule of rules) {
      const already = fixedForTarget.filter(row => bucketFor(rules, userById.get(Number(row.evaluator_id))) === rule.key).length;
      const targetCapacity = isLeader(target) ? Number.MAX_SAFE_INTEGER : Math.max(0, MAX_STANDARD_TARGETS - (targetLoad.get(Number(target.id)) || 0));
      const candidates = evaluators
        .filter(evaluator => Number(evaluator.id) !== Number(target.id))
        .filter(evaluator => !paired.has(`${Number(evaluator.id)}:${Number(target.id)}`))
        .filter(evaluator => isLeader(evaluator) || (load.get(Number(evaluator.id)) || 0) < MAX_STANDARD_TARGETS)
        .filter(evaluator => allowedMatchingPair(evaluator, target))
        .filter(rule.test)
        .sort((a, b) =>
          (load.get(Number(a.id)) || 0) - (load.get(Number(b.id)) || 0)
          || stableTie(cycleId, a.id, target.id) - stableTie(cycleId, b.id, target.id)
          || Number(a.id) - Number(b.id));
      const desired = rule.all ? candidates.length : Math.max(0, rule.quota - already);
      const selected = candidates.slice(0, Math.min(desired, targetCapacity));
      for (const evaluator of selected) {
        const evaluatorId = Number(evaluator.id);
        const targetId = Number(target.id);
        generated.push({ evaluator_id: evaluatorId, target_id: targetId, relationship_type: relationshipType(evaluator, target) });
        paired.add(`${evaluatorId}:${targetId}`);
        load.set(evaluatorId, (load.get(evaluatorId) || 0) + 1);
        targetLoad.set(targetId, (targetLoad.get(targetId) || 0) + 1);
      }
      if (!rule.all && selected.length < desired) {
        shortages.push({
          target_id: Number(target.id), target_name: target.name || String(target.id), bucket: rule.key,
          required: rule.quota, assigned: already + selected.length, shortage: desired - selected.length
        });
      }
    }
  }
  return { generated, shortages };
}
