
export const DEVICE_PROFILES = Object.freeze({
  ADMIN: "admin",
  TILL: "till",
});

export function normalizeDeviceProfile(value) {
  const profile = String(value || "").trim().toLowerCase();
  return profile === DEVICE_PROFILES.TILL ? DEVICE_PROFILES.TILL : DEVICE_PROFILES.ADMIN;
}

export function destinationFor(value, destinations = []) {
  const key = String(value || "").trim();
  if (!key) return null;
  const list = Array.isArray(destinations) ? destinations : [];
  const found = list.find((entry) => entry?.key === key || entry?.path === key);
  return found ? { ...found } : null;
}

export const isValidLandingPage = (value, destinations = []) => Boolean(destinationFor(value, destinations));

export function canAccessDestination(value, { destinations = [], enabledModules = new Set(), permissions = [] } = {}) {
  const destination = destinationFor(value, destinations);
  if (!destination) return false;
  if (destination.moduleKey && !enabledModules.has(destination.moduleKey)) return false;
  const required = Array.isArray(destination.permissions)
    ? destination.permissions
    : destination.permission ? [destination.permission] : [];
  return (!destination.requiresAnyPermission || permissions.length > 0)
    && (!required.length || required.some((permission) => permissions.includes(permission)));
}

export function resolveLandingPage({
  userOverride,
  roleDefault,
  profileDefault,
  companyDefault,
  destinations = [],
  enabledModules = new Set(),
  permissions = [],
} = {}) {
  const candidates = [userOverride, roleDefault, profileDefault, companyDefault].filter(Boolean);
  const selected = candidates.find((candidate) => canAccessDestination(candidate, { destinations, enabledModules, permissions }));
  return destinationFor(selected, destinations)?.path || null;
}

export function permittedCatalogEntries({ catalog = [], enabledModules = new Set(), permissions = [] } = {}) {
  return (Array.isArray(catalog) ? catalog : []).filter((entry) =>
    enabledModules.has(entry.key)
    && (Array.isArray(entry.permissions) ? entry.permissions : []).some((permission) => permissions.includes(permission))
  );
}


export function resolveLandingFlow({ flow, user = {}, deviceProfile = DEVICE_PROFILES.ADMIN, fallback = null } = {}) {
  const rules = Array.isArray(flow?.rules) ? flow.rules : [];
  const profile = normalizeDeviceProfile(deviceProfile);
  const values = {
    user_id: String(user.id || ""),
    role_id: String(user.roleId || user.role_id || ""),
    profile: String(user.profile || user.profileKey || profile || "").toLowerCase(),
    store_id: String(user.storeId || user.store_id || ""),
    company_id: String(user.companyId || user.company_id || ""),
  };
  const matches = (condition = {}) => {
    const actual = values[String(condition.field || "").toLowerCase()];
    if (actual === undefined) return false;
    const expected = String(condition.value ?? "");
    return condition.operator === "not_equals" ? actual !== expected : actual === expected;
  };
  for (const rule of rules) {
    if (rule?.active === false) continue;
    const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
    if (conditions.every(matches) && typeof rule?.destination === "string" && rule.destination.startsWith("/app")) return rule.destination;
  }
  return typeof flow?.defaultDestination === "string" && flow.defaultDestination.startsWith("/app") ? flow.defaultDestination : fallback;
}
