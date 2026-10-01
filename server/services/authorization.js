/**
 * Authoritative onePOS authorization semantics.
 *
 * Authorization is permission-driven. Identity/profile names and bootstrap
 * markers never grant access.
 */

/**
 * Shared permission decision for normal application functionality.
 */
export function permissionAllows({ permissions = [], requiredPermissions = [] } = {}) {
  if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) return true;
  const codes = new Set(Array.isArray(permissions) ? permissions : []);
  return requiredPermissions.some((permission) => codes.has(permission));
}

export const MODULE_ACCESS_REASONS = Object.freeze({
  ALLOWED: "entitled",
  ALLOWED_ONEENGINE_MANAGEMENT: "oneengine_management",
  COMPANY_DISABLED: "company_disabled",
  NOT_PERMITTED: "not_permitted",
  PACKAGE_NOT_INSTALLED: "package_not_installed",
  NOT_LICENSED: "not_licensed",
});

/**
 * Decide whether one runtime module is reachable by the caller.
 *
 * canManageOneEngine means the caller holds the oneengine.manage permission.
 * It is not an identity flag.
 */
export function moduleRuntimeAccess({
  enabledByCompany = true,
  packageInstalled = false,
  licensed = false,
  permitted = false,
  canManageOneEngine = false,
} = {}) {
  if (enabledByCompany === false) {
    return { allowed: false, reason: MODULE_ACCESS_REASONS.COMPANY_DISABLED };
  }
  if (permitted !== true) {
    return { allowed: false, reason: MODULE_ACCESS_REASONS.NOT_PERMITTED };
  }
  if (canManageOneEngine === true) {
    return {
      allowed: true,
      reason:
        packageInstalled && licensed
          ? MODULE_ACCESS_REASONS.ALLOWED
          : MODULE_ACCESS_REASONS.ALLOWED_ONEENGINE_MANAGEMENT,
    };
  }
  if (!packageInstalled) {
    return { allowed: false, reason: MODULE_ACCESS_REASONS.PACKAGE_NOT_INSTALLED };
  }
  if (!licensed) {
    return { allowed: false, reason: MODULE_ACCESS_REASONS.NOT_LICENSED };
  }
  return { allowed: true, reason: MODULE_ACCESS_REASONS.ALLOWED };
}

/** Convenience boolean form of moduleRuntimeAccess(). */
export function isModuleRuntimeAccessible(options) {
  return moduleRuntimeAccess(options).allowed === true;
}

/**
 * Administrative access inside the caller's selected company context.
 * Permission codes remain the only authority.
 */
export function companyAdministrativeAccess({
  permissions = [],
  requiredPermission = "settings.manage",
} = {}) {
  return Array.isArray(permissions) && permissions.includes(requiredPermission);
}
