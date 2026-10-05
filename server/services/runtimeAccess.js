
export const DEVICE_PROFILES = Object.freeze({
  ADMIN: "admin",
  TILL: "till",
});

const DESTINATIONS = Object.freeze({
  pos: { path: "/app", moduleKey: "retail_pos", permission: "sale.view" },
  dashboard: { path: "/app/dashboard", moduleKey: null, requiresAnyPermission: true },
});

export function normalizeDeviceProfile(value) {
  const profile = String(value || "").trim().toLowerCase();
  return profile === DEVICE_PROFILES.TILL ? DEVICE_PROFILES.TILL : DEVICE_PROFILES.ADMIN;
}

export function destinationFor(value) {
  const key = String(value || "").trim().toLowerCase();
  if (DESTINATIONS[key]) return { key, ...DESTINATIONS[key] };
  const destination = Object.values(DESTINATIONS).find((entry) => entry.path === value);
  return destination ? { key: Object.keys(DESTINATIONS).find((name) => DESTINATIONS[name] === destination), ...destination } : null;
}

export const isValidLandingPage = (value) => Boolean(destinationFor(value));

export function canAccessDestination(value, { enabledModules = new Set(), permissions = [] } = {}) {
  const destination = destinationFor(value);
  if (!destination) return false;
  /* Company module activation applies to every caller. */
  if (destination.moduleKey && !enabledModules.has(destination.moduleKey)) return false;
  return (destination.requiresAnyPermission ? permissions.length > 0 : true)
    && (!destination.permission || permissions.includes(destination.permission));
}

export function resolveLandingPage({
  userOverride,
  roleDefault,
  profileDefault,
  companyDefault,
  deviceProfile = DEVICE_PROFILES.ADMIN,
  enabledModules = new Set(),
  permissions = [],
} = {}) {
  const profile = normalizeDeviceProfile(deviceProfile);
  const profileFallback = profileDefault || (profile === DEVICE_PROFILES.TILL ? "pos" : "dashboard");
  const candidates = [userOverride, roleDefault, profileFallback, companyDefault, "dashboard", "pos"];
  const selected = candidates.find((candidate) => canAccessDestination(candidate, { enabledModules, permissions }));
  return destinationFor(selected)?.path || null;
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
