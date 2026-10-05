// Navigation entries are supplied by the authenticated runtime app catalogue.
// This module only normalizes permission state and catalog entries; it contains no business page/RBAC map.

export const EMPTY_PERMISSION_STATE = Object.freeze({ permissions: [] });

export function normalizePermissionState(state) {
  const source = state && typeof state === "object" ? state : {};
  return {
    permissions: Array.isArray(source.permissions)
      ? source.permissions.filter((code) => typeof code === "string")
      : [],
    navigation: Array.isArray(source.navigation) ? source.navigation : [],
  };
}

export function permittedNavItems(state) {
  const normalized = normalizePermissionState(state);
  return normalized.navigation
    .filter((entry) => entry && entry.label)
    .map((entry) => [entry.label, entry.Icon || null]);
}

export function permittedNavNames(state) {
  return new Set(permittedNavItems(state).map(([page]) => page));
}
