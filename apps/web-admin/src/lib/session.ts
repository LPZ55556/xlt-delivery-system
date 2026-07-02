import type { CurrentUser } from './types';

const TOKEN_KEY = 'xlt_access_token';
const USER_KEY = 'xlt_current_user';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getAccessToken() {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): CurrentUser | null {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function saveSession(accessToken: string, user: CurrentUser) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveCurrentUser(user: CurrentUser) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function hasAnyRole(user: CurrentUser | null, roles: string[]) {
  return Boolean(user && roles.includes(user.role));
}

export function canManageProducts(user: CurrentUser | null) {
  return hasAnyRole(user, ['super_admin', 'admin', 'warehouse']);
}

export function canViewCostPrice(user: CurrentUser | null) {
  return hasAnyRole(user, ['super_admin', 'admin', 'finance']);
}

export function canManageMerchants(user: CurrentUser | null) {
  return hasAnyRole(user, ['super_admin', 'admin']);
}

export function canVoidOrders(user: CurrentUser | null) {
  return hasAnyRole(user, ['super_admin', 'admin']);
}

export function canManageUsers(user: CurrentUser | null) {
  return hasAnyRole(user, ['super_admin', 'admin']);
}

export function canManageTargetUser(actor: CurrentUser | null, targetRole: string) {
  if (!actor) return false;
  if (actor.role === 'super_admin') return true;
  return actor.role === 'admin' && ['finance', 'warehouse', 'salesperson'].includes(targetRole);
}
