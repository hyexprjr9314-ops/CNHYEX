export const GRADE_RATIOS = Object.freeze({ S: 0.05, A: 0.20, B: 0.60, C: 0.10, D: 0.05 });
const GRADE_ORDER = Object.freeze(['S', 'A', 'B', 'C', 'D']);

export function cohortKeyForUser(user = {}) {
  const dept = String(user.dept || '');
  const workplace = String(user.workplace || '');
  if (dept.includes('\uC815\uBE44')) return 'mechanic';
  if (dept.includes('\uC601\uC5C5\uC18C') || workplace.includes('\uC601\uC5C5\uC18C')) return 'branch';
  return 'headquarters';
}

export function largestRemainderAllocation(count) {
  if (!Number.isInteger(count) || count < 0) throw new TypeError('count must be a non-negative integer');
  const rows = GRADE_ORDER.map((grade, index) => {
    const exact = count * GRADE_RATIOS[grade];
    return { grade, allocation_count: Math.floor(exact), allocation_ratio: GRADE_RATIOS[grade], remainder: exact % 1, index };
  });
  let remaining = count - rows.reduce((sum, row) => sum + row.allocation_count, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- <= 0) break;
    row.allocation_count += 1;
  }
  return rows.map(({ remainder, index, ...row }) => row);
}

export function buildRelativeGradePlan(entries) {
  const cohorts = new Map();
  for (const entry of entries || []) {
    if (!Number.isFinite(Number(entry.targetId)) || !Number.isFinite(Number(entry.rawScore)) || !Number.isFinite(Number(entry.effectiveFinalScore))) continue;
    const cohortKey = String(entry.cohortKey || 'headquarters');
    if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, []);
    cohorts.get(cohortKey).push({ ...entry, targetId: Number(entry.targetId), rawScore: Number(entry.rawScore), effectiveFinalScore: Number(entry.effectiveFinalScore), cohortKey });
  }
  const gradesByTargetId = new Map();
  const allocations = [];
  for (const [cohortKey, members] of cohorts) {
    const allocation = largestRemainderAllocation(members.length);
    allocations.push(...allocation.map(row => ({ cohortKey, ...row })));
    const ranked = [...members].sort((a, b) => b.effectiveFinalScore - a.effectiveFinalScore || b.rawScore - a.rawScore || a.targetId - b.targetId);
    let offset = 0;
    for (const row of allocation) {
      for (const member of ranked.slice(offset, offset + row.allocation_count)) gradesByTargetId.set(member.targetId, row.grade);
      offset += row.allocation_count;
    }
  }
  return { gradesByTargetId, allocations };
}
