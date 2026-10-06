import { selectMetadataRecords, upsertMetadataRecord } from "../metadataRecordStore.js";

/*
 * JARVES user/licence control (internal configuration foundation).
 *
 * Company allowance is exposed through the metadata-owned system_settings Object;
 * per-user opt-in remains an identity field on users. No business settings table
 * is referenced by this runtime service.
 */

export const JARVES_MAX_ALLOWANCE = 10000;

/** Allowance result codes (route maps them to HTTP statuses/messages). */
export const JARVES_ALLOWANCE_RESULTS = Object.freeze({
  OK: "ok",
  ALLOWANCE_REACHED: "allowance_reached",
  ALLOWANCE_BELOW_ENABLED: "allowance_below_enabled",
  USER_NOT_FOUND: "user_not_found",
  ALREADY_SET: "already_set",
});

/** Normalise an admin-supplied allowance to a safe integer, or null if invalid. */
export function normalizeJarvesAllowance(value) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > JARVES_MAX_ALLOWANCE) return null;
  return parsed;
}

/** Count of ACTIVE users with JARVES enabled for one company. */
export async function countJarvesEnabledUsers(db, companyId) {
  const result = await db(
    `SELECT COUNT(*)::int AS enabled FROM users WHERE company_id = $1 AND jarves_enabled = TRUE AND active = TRUE`,
    [companyId]
  );
  return Number(result.rows[0]?.enabled ?? 0);
}

/** Company licence allowance (0 when never configured - JARVES is opt-in). */
export async function getJarvesAllowance(db, companyId) {
  const rows = await selectMetadataRecords(db, {
    objectKey: "system_settings",
    companyId,
    columns: ["jarves_licence_users"],
    limit: 1,
  });
  return Number(rows[0]?.jarves_licence_users ?? 0);
}

/** { allowance, enabledUsers, seatsRemaining } for one company - admin UI + enforcement. */
export async function getJarvesLicenceState(db, companyId) {
  const allowance = await getJarvesAllowance(db, companyId);
  const enabledUsers = await countJarvesEnabledUsers(db, companyId);
  return { allowance, enabledUsers, seatsRemaining: Math.max(allowance - enabledUsers, 0) };
}

/** Is JARVES enabled for this specific user (company-scoped, active only)? */
export async function isJarvesEnabledForUser(db, { userId, companyId } = {}) {
  if (!userId || !companyId) return false;
  const result = await db(
    `SELECT 1 FROM users WHERE id = $1 AND company_id = $2 AND jarves_enabled = TRUE AND active = TRUE LIMIT 1`,
    [userId, companyId]
  );
  return result.rows.length > 0;
}

/**
 * Set the company allowance. Refuses to go below the current enabled count so
 * existing users are never silently stripped - the admin must disable users
 * first. Returns a JARVES_ALLOWANCE_RESULTS code.
 */
export async function setJarvesAllowance(db, companyId, allowance, updatedBy = null) {
  const safeAllowance = normalizeJarvesAllowance(allowance);
  if (safeAllowance == null) return JARVES_ALLOWANCE_RESULTS.ALLOWANCE_BELOW_ENABLED; // invalid input

  const enabledUsers = await countJarvesEnabledUsers(db, companyId);
  if (safeAllowance < enabledUsers) return JARVES_ALLOWANCE_RESULTS.ALLOWANCE_BELOW_ENABLED;

  await upsertMetadataRecord(db, {
    objectKey: "system_settings",
    companyId,
    match: { company_id: companyId },
    values: { jarves_licence_users: safeAllowance },
  });
  return JARVES_ALLOWANCE_RESULTS.OK;
}

/**
 * Enable/disable JARVES for one user, company-scoped. Enabling is refused when
 * the allowance is already fully used. Returns a JARVES_ALLOWANCE_RESULTS code.
 */
export async function setJarvesUserEnabled(db, { companyId, userId, enabled }) {
  if (typeof enabled !== "boolean") return JARVES_ALLOWANCE_RESULTS.USER_NOT_FOUND;

  if (enabled) {
    const state = await getJarvesLicenceState(db, companyId);
    const already = await isJarvesEnabledForUser(db, { userId, companyId });
    if (!already && state.seatsRemaining <= 0) return JARVES_ALLOWANCE_RESULTS.ALLOWANCE_REACHED;
  }

  const result = await db(
    `UPDATE users SET jarves_enabled = $1, updated_at = NOW()
     WHERE id = $2 AND company_id = $3
     RETURNING id, username, jarves_enabled`,
    [enabled, userId, companyId]
  );
  if (!result.rows.length) return JARVES_ALLOWANCE_RESULTS.USER_NOT_FOUND;
  return JARVES_ALLOWANCE_RESULTS.OK;
}

/**
 * The per-request access checker the JARVES route uses. Built once in
 * server.js with the existing db helper. Returns true only when the
 * authenticated user is company-scoped AND explicitly enabled for JARVES.
 */
export function createJarvesAccessChecker({ db } = {}) {
  if (typeof db !== "function") {
    throw new Error("createJarvesAccessChecker requires the existing db helper");
  }
  return function jarvesAccess(user = {}) {
    return isJarvesEnabledForUser(db, { userId: user?.id, companyId: user?.companyId });
  };
}