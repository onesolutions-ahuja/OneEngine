const DEFAULT_ENTITLEMENTS = Object.freeze({});

export function normaliseEntitlements(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(source)
    .filter(([key, enabled]) => /^[a-z][a-z0-9_.-]{0,80}$/i.test(key) && typeof enabled === "boolean")
    .map(([key, enabled]) => [key, enabled]));
}

export function mergeEntitlements(value = {}) {
  return { ...DEFAULT_ENTITLEMENTS, ...normaliseEntitlements(value) };
}

export async function getCompanyEntitlements(db, companyId) {
  if (!companyId) return {};
  const resultPromise = db(
    `SELECT l.active AS licence_active, l.starts_at AS licence_starts_at, l.expires_at AS licence_expires_at,
            COALESCE(a.active, true) AS allocation_active,
            COALESCE(a.starts_at, l.starts_at) AS starts_at,
            COALESCE(a.expires_at, l.expires_at) AS expires_at,
            COALESCE(jsonb_object_agg(le.entitlement_key, le.enabled)
              FILTER (WHERE le.entitlement_key IS NOT NULL), '{}'::jsonb) AS entitlements
       FROM companies c
       LEFT JOIN licences l ON l.id = c.licence_id
       LEFT JOIN company_licence_allocations a ON a.company_id = c.id AND a.licence_id = c.licence_id
       LEFT JOIN licence_entitlements le ON le.licence_id = l.id
      WHERE c.id = $1
      GROUP BY l.id, a.active, a.starts_at, a.expires_at`,
    [companyId]
  );
  const bundleResultPromise = db(
    `SELECT be.entitlement_key, be.enabled
       FROM company_bundle_assignments a
       JOIN licence_bundles b ON b.id=a.bundle_id AND b.active=true
       JOIN licence_bundle_entitlements be ON be.bundle_id=b.id
      WHERE a.company_id=$1 AND a.active=true
         AND (cardinality(b.allowed_companies)=0 OR $1=ANY(b.allowed_companies))
         AND (a.starts_at IS NULL OR a.starts_at<=NOW())
        AND (a.expires_at IS NULL OR a.expires_at>NOW())`,
    [companyId]
  );
  const packageResultPromise = db(
    `SELECT p.manifest->>'entitlementKey' AS entitlement_key
       FROM company_bundle_assignments a
       JOIN licence_bundles b ON b.id=a.bundle_id AND b.active=true
       JOIN licence_bundle_packages bp ON bp.bundle_id=b.id
       JOIN package_registry p ON p.id=bp.package_id
      WHERE a.company_id=$1 AND a.active=true AND bp.entitlement_type='COMMERCIAL'
        AND (cardinality(b.allowed_companies)=0 OR $1=ANY(b.allowed_companies))
        AND (cardinality(p.allowed_companies)=0 OR $1=ANY(p.allowed_companies))
        AND p.licence_mode='COMMERCIAL'
          AND p.active=true
        AND (a.starts_at IS NULL OR a.starts_at<=NOW())
        AND (a.expires_at IS NULL OR a.expires_at>NOW())
        AND p.manifest->>'entitlementKey' IS NOT NULL`,
    [companyId]
  );
  const tierEntitlementsPromise = db(
    `SELECT te.entitlement_key,te.enabled
       FROM company_tier_assignments a
       JOIN licence_tiers t ON t.id=a.tier_id AND t.active=true
       JOIN licence_tier_entitlements te ON te.tier_id=t.id
      WHERE a.company_id=$1 AND a.active=true
         AND (cardinality(t.allowed_companies)=0 OR $1=ANY(t.allowed_companies))
         AND (a.starts_at IS NULL OR a.starts_at<=NOW())
        AND (a.expires_at IS NULL OR a.expires_at>NOW())`,
    [companyId]
  );
  const licensedPackageResultPromise = db(
    `SELECT p.manifest->>'entitlementKey' AS entitlement_key
       FROM companies c
      JOIN licences l ON l.id=c.licence_id AND l.active=true
      LEFT JOIN company_licence_allocations a ON a.company_id=c.id AND a.licence_id=c.licence_id
       JOIN licence_packages lp ON lp.licence_id=l.id AND lp.enabled=true
         AND lp.entitlement_type='COMMERCIAL'
       JOIN package_registry p ON p.id=lp.package_id
      WHERE c.id=$1
        AND COALESCE(a.active,true)=true
        AND (COALESCE(a.starts_at, l.starts_at) IS NULL OR COALESCE(a.starts_at, l.starts_at)<=NOW())
        AND (COALESCE(a.expires_at, l.expires_at) IS NULL OR COALESCE(a.expires_at, l.expires_at)>NOW())
        AND p.licence_mode='COMMERCIAL'
        AND p.active=true
        AND (cardinality(p.allowed_companies)=0 OR c.id=ANY(p.allowed_companies))
        AND p.manifest->>'entitlementKey' IS NOT NULL`,
    [companyId]
  );
  const packageSourcesPromise = db(
    `SELECT p.package_key,p.licence_mode,s.source_type,p.manifest->>'entitlementKey' AS entitlement_key
       FROM company_package_entitlement_sources s
       JOIN package_registry p ON p.id=s.package_id
      WHERE s.company_id=$1 AND s.active=true
        AND p.active=true
        AND (cardinality(p.allowed_companies)=0 OR $1=ANY(p.allowed_companies))
        AND (s.starts_at IS NULL OR s.starts_at<=NOW())
        AND (s.expires_at IS NULL OR s.expires_at>NOW())`,
    [companyId]
  );

  const result = await resultPromise;
  const row = result.rows[0];
  const licenceActive = row?.licence_active ?? row?.active;
  const allocationActive = row?.allocation_active ?? true;
  const startsAt = row?.starts_at ?? row?.licence_starts_at;
  const expiresAt = row?.expires_at ?? row?.licence_expires_at;
  const activeLicence = licenceActive === true && allocationActive === true &&
    !(startsAt && new Date(startsAt) > new Date()) &&
    !(expiresAt && new Date(expiresAt) <= new Date());
  const entitlements = activeLicence ? mergeEntitlements(row.entitlements) : {};
  const bundleResult = await bundleResultPromise;
  for (const item of bundleResult.rows) {
    if (!item.entitlement_key) continue;
    if (item.enabled === true) entitlements[item.entitlement_key] = true;
    else if (!(item.entitlement_key in (row?.entitlements || {}))) entitlements[item.entitlement_key] = false;
  }
  const packageResult = await packageResultPromise;
  for (const item of packageResult.rows) {
    if (item.entitlement_key) entitlements[item.entitlement_key] = true;
  }
  const tierEntitlements = await tierEntitlementsPromise;
  for (const item of tierEntitlements.rows) {
    if (!item.entitlement_key) continue;
    if (item.enabled === true) entitlements[item.entitlement_key] = true;
    else if (!(item.entitlement_key in (row?.entitlements || {}))) entitlements[item.entitlement_key] = false;
  }
  const licensedPackageResult = await licensedPackageResultPromise;
  for (const item of licensedPackageResult.rows) {
    if (item.entitlement_key) entitlements[item.entitlement_key] = true;
  }
  const packageSources = await packageSourcesPromise;
  for (const item of packageSources.rows) {
    if (!item.package_key) continue;
    entitlements[`package:${item.package_key}`] = true;
    if (item.licence_mode !== "TECHNICAL" &&
        !["DIRECT_INSTALL", "REQUIRED_DEPENDENCY", "OPTIONAL_DEPENDENCY"].includes(item.source_type) &&
        item.entitlement_key && item.entitlement_key !== "undefined") {
      entitlements[item.entitlement_key] = true;
    }
  }
  return entitlements;
}

export async function getUserLicenceState(db, companyId, userId) {
  if (!companyId || !userId) return { active: false, reason: "UNASSIGNED" };
  const result = await db(
    `SELECT a.active AS assignment_active, a.starts_at AS assignment_starts_at, a.expires_at AS assignment_expires_at,
            l.id AS licence_id, l.name AS licence_name, l.active AS licence_active,
            l.starts_at AS licence_starts_at, l.expires_at AS licence_expires_at
       FROM user_licence_assignments a
       JOIN licences l ON l.id=a.licence_id
      WHERE a.company_id=$1 AND a.user_id=$2
      LIMIT 1`,
    [companyId, userId]
  );
  const row = result.rows[0];
  if (!row) return { active: false, reason: "UNASSIGNED" };
  const now = Date.now();
  const before = (v) => v && new Date(v).getTime() > now;
  const expired = (v) => v && new Date(v).getTime() <= now;
  if (row.assignment_active !== true || row.licence_active !== true) return { ...row, active: false, reason: "INACTIVE" };
  if (before(row.assignment_starts_at) || before(row.licence_starts_at)) return { ...row, active: false, reason: "NOT_STARTED" };
  if (expired(row.assignment_expires_at) || expired(row.licence_expires_at)) return { ...row, active: false, reason: "EXPIRED" };
  return { ...row, active: true, reason: "ACTIVE" };
}

export async function hasActiveUserLicence(db, companyId, userId) {
  return (await getUserLicenceState(db, companyId, userId)).active === true;
}

export async function hasUserEntitlement(db, companyId, userId, entitlementKey) {
  if (!companyId || !userId || !entitlementKey) return false;
  const state = await getUserLicenceState(db, companyId, userId);
  if (state.active !== true || !state.licence_id) return false;
  const result = await db(
    `SELECT 1 FROM licence_entitlements
      WHERE licence_id=$1 AND entitlement_key=$2 AND enabled=true
      LIMIT 1`,
    [state.licence_id, entitlementKey]
  );
  return result.rows.length > 0;
}

export function createUserEntitlementAccessChecker({ db, entitlementKey } = {}) {
  if (typeof db !== "function") throw new Error("createUserEntitlementAccessChecker requires db");
  if (!entitlementKey) throw new Error("createUserEntitlementAccessChecker requires entitlementKey");
  return (user = {}) => hasUserEntitlement(db, user?.companyId, user?.id, entitlementKey);
}

export function hasEntitlement(entitlements, key) {
  return entitlements?.[key] === true;
}

export function isPackageLicensed(entitlements, packageEntry = {}) {
  const licenceMode = packageEntry?.licence_mode || packageEntry?.manifest?.licenceMode;
  if (licenceMode === "TECHNICAL") return true;
  if (
    licenceMode !== "COMMERCIAL" && (
      packageEntry?.package_type === "FOUNDATION" ||
      packageEntry?.packageType === "FOUNDATION" ||
      packageEntry?.manifest?.packageType === "FOUNDATION" ||
      packageEntry?.manifest?.licenceRequired === false
    )
  ) return true;
  const packageKey = packageEntry?.package_key || packageEntry?.packageKey || packageEntry?.manifest?.packageKey;
  if (packageKey && hasEntitlement(entitlements, `package:${packageKey}`)) return true;
  const key = packageEntry?.manifest?.entitlementKey;
  if (key) return hasEntitlement(entitlements, key);
  const licenceRequired = packageEntry?.manifest?.licenceRequired === true ||
    packageEntry?.licence_required === true;
  return licenceRequired ? Boolean(packageKey && hasEntitlement(entitlements, `package:${packageKey}`)) : true;
}

export function requireEntitlement(db, key) {
  return async (req, res, next) => {
    try {
      const entitlements = await getCompanyEntitlements(db, req.user?.companyId);
      if (!hasEntitlement(entitlements, key)) {
        return res.status(403).json({ success: false, code: "FEATURE_NOT_LICENSED", message: "This feature is not licensed for this company" });
      }
      req.entitlements = entitlements;
      return next();
    } catch (error) {
      console.error(`Licensing check failed for ${key}:`, error);
      return res.status(500).json({ success: false, message: "Unable to verify feature licence" });
    }
  };
}

export { DEFAULT_ENTITLEMENTS };
