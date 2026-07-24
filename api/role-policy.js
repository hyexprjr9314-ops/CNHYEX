export const ROLES = Object.freeze({ admin: '\uAD00\uB9AC\uC790', executive: '\uC784\uC6D0' });
const ADMIN_SUBTABS = Object.freeze(['dashboard', 'summary', 'history', 'settings']);
const EXECUTIVE_SUBTABS = Object.freeze(['summary', 'history']);
const EXECUTIVE_ACTIONS = new Set(['approve_adjustment', 'publish', 'decide_internal_approval']);
const ADMIN_ACTIONS = new Set(['adjust', 'request_internal_approval']);

export function roleLevel(role) {
  if (role === ROLES.admin) return 'admin';
  if (role === ROLES.executive) return 'executive';
  return 'regular';
}
export function canUseAdminAction(role, action) {
  const level = roleLevel(role);
  if (EXECUTIVE_ACTIONS.has(action)) return level === 'executive';
  if (ADMIN_ACTIONS.has(action)) return level === 'admin';
  return level === 'admin';
}
export function allowedAdminSubtabs(role) {
  const level = roleLevel(role);
  if (level === 'admin') return ADMIN_SUBTABS;
  if (level === 'executive') return EXECUTIVE_SUBTABS;
  return [];
}
