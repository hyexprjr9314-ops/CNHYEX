export const ROLES = Object.freeze({ admin: '\uAD00\uB9AC\uC790', executive: '\uC784\uC6D0' });
const EVALUATION_SETUP_SUBTABS = Object.freeze(['cycles', 'permissions', 'questions', 'matching', 'lifecycle']);
const CLOSING_MANAGEMENT_SUBTABS = Object.freeze(['progress', 'summary', 'history']);
const SHARED_PRIVILEGED_ACTIONS = new Set(['adjust_final', 'cancel_adjustment', 'publish']);
const EXECUTIVE_ACTIONS = new Set(['decide_internal_approval']);
const ADMIN_ACTIONS = new Set(['request_internal_approval']);

export function roleLevel(role) {
  if (role === ROLES.admin) return 'admin';
  if (role === ROLES.executive) return 'executive';
  return 'regular';
}
export function canUseAdminAction(role, action) {
  const level = roleLevel(role);
  if (SHARED_PRIVILEGED_ACTIONS.has(action)) return level === 'admin' || level === 'executive';
  if (EXECUTIVE_ACTIONS.has(action)) return level === 'executive';
  if (ADMIN_ACTIONS.has(action)) return level === 'admin';
  return level === 'admin';
}
export function allowedAdminSubtabs(role) {
  const level = roleLevel(role);
  if (level === 'admin') return [...EVALUATION_SETUP_SUBTABS, ...CLOSING_MANAGEMENT_SUBTABS];
  if (level === 'executive') return CLOSING_MANAGEMENT_SUBTABS;
  return [];
}
export function allowedEvaluationSetupSubtabs(role) {
  return roleLevel(role) === 'admin' ? EVALUATION_SETUP_SUBTABS : [];
}
export function allowedClosingManagementSubtabs(role) {
  const level = roleLevel(role);
  return level === 'admin' || level === 'executive' ? CLOSING_MANAGEMENT_SUBTABS : [];
}
