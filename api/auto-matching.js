import { isLeader, relationshipType } from './evaluation-classification.js';

export const AUTO_MATCHING_TYPE = '알고리즘 자동 지정';

const normalize = value => String(value || '')
  .toLowerCase()
  .replace(/[\sㆍ·._\-()[\]{}]/g, '')
  .replace(/㈜|주식회사|\(주\)/g, '')
  .trim();

const isMechanic = user => normalize(user?.type) === '정비사';
const isExecutive = user => normalize(user?.type).includes('임원') || normalize(user?.sys_role) === 'executive';
const isBranch = user => `${normalize(user?.workplace)}${normalize(user?.dept)}`.includes('영업소');
const isVehicleSafety = user => /차량|안전/.test(`${normalize(user?.dept)}${normalize(user?.workplace)}`);
const sameCompany = (a, b) => normalize(a?.company) === normalize(b?.company);
const sameDepartment = (a, b) => normalize(a?.dept) === normalize(b?.dept);
const sameWorkplace = (a, b) => normalize(a?.workplace) === normalize(b?.workplace);

function baseRules(target) {
  if (isLeader(target)) {
    return [
      { key: 'leadership', quota: 2, test: evaluator => !isLeader(evaluator) && sameDepartment(evaluator, target) },
      { key: 'leader_exchange', quota: 2, test: evaluator => isLeader(evaluator) }
    ];
  }
  if (isMechanic(target)) {
    return [
      { key: 'mechanic_peer', quota: 2, test: evaluator => isMechanic(evaluator) && sameCompany(evaluator, target) },
      { key: 'branch_peer', quota: 1, test: evaluator => !isMechanic(evaluator) && isBranch(evaluator) && sameCompany(evaluator, target) && sameWorkplace(evaluator, target) },
      { key: 'vehicle_safety', quota: 1, test: evaluator => isVehicleSafety(evaluator) && sameCompany(evaluator, target) }
    ];
  }
  if (isBranch(target)) {
    return [
      { key: 'supervisor', quota: 1, test: evaluator => isLeader(evaluator) && sameCompany(evaluator, target) && (sameWorkplace(evaluator, target) || sameDepartment(evaluator, target)) },
      { key: 'related_department', quota: 1, test: evaluator => isVehicleSafety(evaluator) && sameCompany(evaluator, target) },
      { key: 'branch_peer', quota: 2, test: evaluator => !isLeader(evaluator) && sameCompany(evaluator, target) && sameWorkplace(evaluator, target) }
    ];
  }
  const rules = [
    { key: 'internal', quota: 2, test: evaluator => !isLeader(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
    { key: 'company_exchange', quota: 1, test: evaluator => !isLeader(evaluator) && sameCompany(evaluator, target) && !sameDepartment(evaluator, target) },
    { key: 'affiliate_same_department', quota: 1, test: evaluator => !sameCompany(evaluator, target) && sameDepartment(evaluator, target) },
    { key: 'affiliate_exchange', quota: 1, test: evaluator => !sameCompany(evaluator, target) && !sameDepartment(evaluator, target) },
    { key: 'supervisor', quota: 1, test: evaluator => isLeader(evaluator) && sameCompany(evaluator, target) && sameDepartment(evaluator, target) }
  ];
  if (isVehicleSafety(target)) {
    rules.push({ key: 'mechanic_exchange', quota: 1, test: evaluator => isMechanic(evaluator) && sameCompany(evaluator, target) });
  }
  return rules;
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
  const paired = new Set();

  for (const row of fixed) {
    const evaluatorId = Number(row.evaluator_id);
    const targetId = Number(row.target_id);
    paired.add(`${evaluatorId}:${targetId}`);
    load.set(evaluatorId, (load.get(evaluatorId) || 0) + 1);
  }

  const generated = [];
  const shortages = [];
  for (const target of [...targets].sort((a, b) => Number(a.id) - Number(b.id))) {
    const rules = baseRules(target);
    const fixedForTarget = fixed.filter(row => Number(row.target_id) === Number(target.id));
    for (const rule of rules) {
      const already = fixedForTarget.filter(row => bucketFor(rules, userById.get(Number(row.evaluator_id))) === rule.key).length;
      const needed = Math.max(0, rule.quota - already);
      const candidates = evaluators
        .filter(evaluator => Number(evaluator.id) !== Number(target.id))
        .filter(evaluator => !paired.has(`${Number(evaluator.id)}:${Number(target.id)}`))
        .filter(rule.test)
        .sort((a, b) =>
          (load.get(Number(a.id)) || 0) - (load.get(Number(b.id)) || 0)
          || stableTie(cycleId, a.id, target.id) - stableTie(cycleId, b.id, target.id)
          || Number(a.id) - Number(b.id));
      const selected = candidates.slice(0, needed);
      for (const evaluator of selected) {
        const evaluatorId = Number(evaluator.id);
        const targetId = Number(target.id);
        generated.push({
          evaluator_id: evaluatorId,
          target_id: targetId,
          relationship_type: relationshipType(evaluator, target)
        });
        paired.add(`${evaluatorId}:${targetId}`);
        load.set(evaluatorId, (load.get(evaluatorId) || 0) + 1);
      }
      if (selected.length < needed) {
        shortages.push({
          target_id: Number(target.id),
          target_name: target.name || String(target.id),
          bucket: rule.key,
          required: rule.quota,
          assigned: already + selected.length,
          shortage: needed - selected.length
        });
      }
    }
  }
  return { generated, shortages };
}
