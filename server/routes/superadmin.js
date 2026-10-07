import { loadEffectivePermissionSets, permissionSetAllowsSystemPermission } from "../services/platformPermissionSets.js";
import express from "express";
import bcrypt from "bcryptjs";
import { getCompanyEntitlements, mergeEntitlements, normaliseEntitlements } from "../services/licensing.js";
import { reconcileCompanyPackageEntitlements } from "../services/packageEntitlements.js";
import { createAuditWriter } from "../services/auditLog.js";
import {
  DUPLICATE_EMAIL_MESSAGE,
  findNormalizedEmailConflict,
  isValidEmail,
  listDuplicateNormalizedEmails,
  normalizeEmail,
} from "../services/userIdentity.js";
import {
  encryptDatabaseSecret,
  initializeTenantSchema,
  TENANT_SCHEMA_STATES,
  tenantDatabaseDiagnostic,
  validateTenantSchema,
} from "../services/tenantDatabase.js";
import {
  createPackageRelease,
  registerPortableApplicationPackage,
  executeTenantReleaseUpgrade,
  getPackageReleaseRolloutStatus,
  listPackageReleases,
  publishPackageRelease,
  rollbackPackageRelease,
  retryFailedReleaseUpgrades,
  setPackageReleasePaused,
  startReleaseRollout,
  validatePackageRelease,
} from "../services/appReleaseManager.js";

function validOptionalDate(value) {
  return value === undefined || value === null ||
    (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function validCompanyLicenceDate(value) {
  return value === null || value === undefined ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
}

function licenceStatus({ active, startsAt, expiresAt }) {
  if (active !== true) return "INACTIVE";
  const now = Date.now();
  if (startsAt && new Date(startsAt).getTime() > now) return "NOT_STARTED";
  if (expiresAt && new Date(expiresAt).getTime() <= now) return "EXPIRED";
  return "ACTIVE";
}

export default function createSuperadminRouter({ authenticate, db, pool, tenantDatabaseRouter, env = process.env, hasPermission = null }) {
  const router = express.Router();
  const writeAudit = createAuditWriter({ db });
  const requireOneEngineManage = async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
      }
      const allowed = hasPermission
        ? await hasPermission(req, "oneengine.manage")
        : false;
      if (!allowed) return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
      return next();
    } catch (error) {
      console.error("OneEngine authorization error:", error);
      return res.status(500).json({ success: false, message: "Unable to verify OneEngine Manager access" });
    }
  };

  router.use("/superadmin", authenticate, requireOneEngineManage);

  /* Legacy platform-developer identity/mapping endpoints were removed.
   * OneEngine authority is assigned through RBAC using oneengine.manage. */

  router.get("/superadmin/licences", async (req, res) => {
    const result = await db(`SELECT l.*, COUNT(c.id)::int AS company_count,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'package_id',p.id,'package_key',p.package_key,'name',p.name,
        'entitlement_type',lp.entitlement_type,'version_range',lp.version_range
      ) ORDER BY p.name) FROM licence_packages lp JOIN package_registry p ON p.id=lp.package_id
        WHERE lp.licence_id=l.id AND lp.enabled=true),'[]'::jsonb) AS packages,
      COALESCE((SELECT jsonb_object_agg(le.entitlement_key,le.enabled)
        FROM licence_entitlements le WHERE le.licence_id=l.id),'{}'::jsonb) AS entitlements
      FROM licences l LEFT JOIN companies c ON c.licence_id=l.id
      GROUP BY l.id ORDER BY l.name`);
    res.json({ success: true, data: result.rows.map((licence) => ({
      ...licence,
      entitlements: mergeEntitlements(licence.entitlements),
    })) });
  });

  router.post("/superadmin/licences", async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Licence name is required" });
    const body = req.body || {};
    const validLimit = (value) => value === undefined || value === null || (Number.isInteger(value) && value >= 0);
    const validDuration = (value) => value === undefined || value === null || (Number.isInteger(value) && value > 0);
    if ((body.monthlyPrice !== undefined && (!Number.isFinite(Number(body.monthlyPrice)) || Number(body.monthlyPrice) < 0)) ||
        (body.billingPeriod !== undefined && !["MONTHLY", "YEARLY", "ONE_TIME"].includes(body.billingPeriod)) ||
        !validLimit(body.seatLimit) || !validLimit(body.userLimit) ||
        !validDuration(body.durationDays) || !validDuration(body.trialDurationDays) ||
        (body.isTrial !== undefined && typeof body.isTrial !== "boolean")) {
      return res.status(400).json({ success: false, message: "Invalid licence commercial terms" });
    }
    try {
      const result = await db(`INSERT INTO licences
        (name,description,monthly_price,billing_period,seat_limit,user_limit,duration_days,is_trial,trial_duration_days,active,starts_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,true),$11,$12) RETURNING *`,
        [name, body.description || null, Number(body.monthlyPrice) || 0, body.billingPeriod || "MONTHLY",
          body.seatLimit ?? null, body.userLimit ?? null, body.durationDays ?? null, body.isTrial ?? false,
          body.trialDurationDays ?? null, body.active, body.startsAt || null, body.expiresAt || null]);
      const licence = result.rows[0];
      for (const [key, enabled] of Object.entries(normaliseEntitlements(body.entitlements))) {
        await db("INSERT INTO licence_entitlements (licence_id,entitlement_key,enabled) VALUES ($1,$2,$3)", [licence.id, key, enabled]);
      }
      res.status(201).json({ success: true, data: { ...licence, entitlements: mergeEntitlements(body.entitlements), packages: [] } });
    } catch (error) {
      res.status(error.code === "23505" ? 409 : 400).json({ success: false, message: error.code === "23505" ? "Licence name already exists" : error.message });
    }
  });

  router.put("/superadmin/licences/:id", async (req, res) => {
    const body = req.body || {};
    const validLimit = (value) => value === undefined || value === null || (Number.isInteger(value) && value >= 0);
    const validDuration = (value) => value === undefined || value === null || (Number.isInteger(value) && value > 0);
    if ((body.monthlyPrice !== undefined && (!Number.isFinite(Number(body.monthlyPrice)) || Number(body.monthlyPrice) < 0)) ||
        (body.billingPeriod !== undefined && !["MONTHLY", "YEARLY", "ONE_TIME"].includes(body.billingPeriod)) ||
        !validLimit(body.seatLimit) || !validLimit(body.userLimit) ||
        !validDuration(body.durationDays) || !validDuration(body.trialDurationDays) ||
        (body.isTrial !== undefined && typeof body.isTrial !== "boolean") ||
        (body.active !== undefined && typeof body.active !== "boolean")) {
      return res.status(400).json({ success: false, message: "Invalid licence commercial terms" });
    }
    const result = await db(`UPDATE licences SET name=COALESCE($1,name), description=COALESCE($2,description),
      monthly_price=COALESCE($3,monthly_price),billing_period=COALESCE($4,billing_period),
      seat_limit=CASE WHEN $5 THEN $6 ELSE seat_limit END,
      user_limit=CASE WHEN $7 THEN $8 ELSE user_limit END,
      duration_days=CASE WHEN $9 THEN $10 ELSE duration_days END,
      is_trial=COALESCE($11,is_trial),
      trial_duration_days=CASE WHEN $12 THEN $13 ELSE trial_duration_days END,
      active=COALESCE($14,active), starts_at=$15, expires_at=$16, updated_at=NOW()
      WHERE id=$17 RETURNING *`,
      [body.name?.trim() || null, body.description,
        body.monthlyPrice === undefined ? null : Number(body.monthlyPrice), body.billingPeriod ?? null,
        Object.hasOwn(body, "seatLimit"), body.seatLimit ?? null,
        Object.hasOwn(body, "userLimit"), body.userLimit ?? null,
        Object.hasOwn(body, "durationDays"), body.durationDays ?? null,
        body.isTrial ?? null, Object.hasOwn(body, "trialDurationDays"), body.trialDurationDays ?? null,
        body.active ?? null, body.startsAt || null, body.expiresAt || null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Licence not found" });
    if (req.body?.entitlements) {
      await db("DELETE FROM licence_entitlements WHERE licence_id=$1", [req.params.id]);
      for (const [key, enabled] of Object.entries(normaliseEntitlements(req.body.entitlements))) {
        await db("INSERT INTO licence_entitlements (licence_id,entitlement_key,enabled) VALUES ($1,$2,$3)", [req.params.id, key, enabled]);
      }
    }
    const companies = await db("SELECT id FROM companies WHERE licence_id=$1", [req.params.id]);
    for (const company of companies.rows) {
      await reconcileCompanyPackageEntitlements(db, company.id);
    }
    res.json({ success: true, data: result.rows[0] });
  });

  router.put("/superadmin/licences/:id/packages", async (req, res) => {
    const packages = req.body?.packages;
    if (!Array.isArray(packages) || packages.some((item) =>
      !item || typeof item.package_id !== "string" ||
      !["COMMERCIAL", "REQUIRED_DEPENDENCY", "OPTIONAL"].includes(item.entitlement_type || "COMMERCIAL") ||
      (item.version_range !== undefined && item.version_range !== null &&
        (typeof item.version_range !== "string" || item.version_range.length > 80))
    )) {
      return res.status(400).json({ success: false, message: "Invalid licence package composition" });
    }
    const licence = await db("SELECT id FROM licences WHERE id=$1", [req.params.id]);
    if (!licence.rows.length) return res.status(404).json({ success: false, message: "Licence not found" });
    const packageIds = [...new Set(packages.map((item) => item.package_id))];
    const known = packageIds.length
      ? await db("SELECT id FROM package_registry WHERE id=ANY($1::uuid[])", [packageIds])
      : { rows: [] };
    if (known.rows.length !== packageIds.length) return res.status(400).json({ success: false, message: "Licence contains an unknown package" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM licence_packages WHERE licence_id=$1", [req.params.id]);
      for (const item of packages) {
        await client.query(
          `INSERT INTO licence_packages(licence_id,package_id,enabled,optional,entitlement_type,version_range)
           VALUES($1,$2,true,$3,$4,$5)`,
          [req.params.id, item.package_id, item.entitlement_type === "OPTIONAL", item.entitlement_type || "COMMERCIAL", item.version_range || null]
        );
      }
      const companies = await client.query("SELECT id FROM companies WHERE licence_id=$1", [req.params.id]);
      for (const company of companies.rows) {
        await reconcileCompanyPackageEntitlements((query, params) => client.query(query, params), company.id);
      }
      await client.query("COMMIT");
      res.json({ success: true, data: { licenceId: req.params.id, packages } });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Licence package composition update error:", error);
      res.status(500).json({ success: false, message: "Unable to update licence package composition" });
    } finally {
      client.release();
    }
  });

  router.get("/superadmin/companies", async (req, res) => {
    const result = await db(`SELECT c.id,c.name,c.active,c.licence_id,l.name AS licence_name,l.active AS licence_active,
      COALESCE(a.active,true) AS allocation_active,COALESCE(a.starts_at,l.starts_at) AS allocation_starts_at,COALESCE(a.expires_at,l.expires_at) AS allocation_expires_at
      FROM companies c LEFT JOIN licences l ON l.id=c.licence_id
      LEFT JOIN company_licence_allocations a ON a.company_id=c.id AND a.licence_id=c.licence_id ORDER BY c.name`);
    res.json({ success: true, data: result.rows.map((company) => ({
      ...company,
      licence_status: company.licence_id ? licenceStatus({
        active: company.licence_active === true && company.allocation_active !== false,
        startsAt: company.allocation_starts_at,
        expiresAt: company.allocation_expires_at,
      }) : "INACTIVE",
    })) });
  });

  router.put("/superadmin/companies/:id/licence", async (req, res) => {
    const body = req.body || {};
    const company = await db(`SELECT c.id,c.name,c.licence_id,l.name AS licence_name,l.starts_at AS licence_starts_at,l.expires_at AS licence_expires_at,
      a.active AS allocation_active,a.starts_at,a.expires_at
      FROM companies c LEFT JOIN licences l ON l.id=c.licence_id
      LEFT JOIN company_licence_allocations a ON a.company_id=c.id AND a.licence_id=c.licence_id
      WHERE c.id=$1`, [req.params.id]);
    if (!company.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    const current = company.rows[0];
    const licenceId = body.licenceId === undefined ? current.licence_id : (body.licenceId || null);
    let licence = null;
    if (licenceId) {
      const licenceResult = await db("SELECT id,name,active,starts_at,expires_at FROM licences WHERE id=$1", [licenceId]);
      licence = licenceResult.rows[0];
      if (!licence) return res.status(404).json({ success: false, message: "Licence not found" });
      if (licence.active !== true) return res.status(400).json({ success: false, message: "Licence is not assignable" });
    }
    const startsAt = Object.hasOwn(body, "startsAt") ? (body.startsAt || null) : (current.starts_at || null);
    const expiresAt = Object.hasOwn(body, "expiresAt") ? (body.expiresAt || null) : (current.expires_at || null);
    const active = Object.hasOwn(body, "active") ? body.active : (current.allocation_active ?? true);
    if (active !== null && typeof active !== "boolean") return res.status(400).json({ success: false, message: "Invalid active state" });
    if (!validCompanyLicenceDate(startsAt) || !validCompanyLicenceDate(expiresAt)) return res.status(400).json({ success: false, message: "Licence dates must be valid ISO date-times" });
    if (startsAt && expiresAt && new Date(expiresAt) < new Date(startsAt)) return res.status(400).json({ success: false, message: "Expiry must be on or after the start date" });
    const result = await db(`UPDATE companies SET licence_id=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,licence_id`, [licenceId, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    if (licenceId) {
      await db(`INSERT INTO company_licence_allocations(company_id,licence_id,seats,assigned_by,active,starts_at,expires_at)
        VALUES($1,$2,0,$3,$4,$5,$6)
        ON CONFLICT(company_id,licence_id) DO UPDATE SET assigned_by=EXCLUDED.assigned_by,active=EXCLUDED.active,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,updated_at=NOW()`
        , [req.params.id, licenceId, req.user.id, active ?? true, startsAt, expiresAt]);
    }
    await reconcileCompanyPackageEntitlements(db, result.rows[0].id);
    const previousActive = current.allocation_active !== false;
    const nextActive = active ?? true;
    const effectiveStartsAt = startsAt || licence?.starts_at || null;
    const effectiveExpiresAt = expiresAt || licence?.expires_at || null;
    const newStatus = licenceId ? licenceStatus({ active: nextActive, startsAt: effectiveStartsAt, expiresAt: effectiveExpiresAt }) : "INACTIVE";
    const oldStartsAt = current.starts_at || current.licence_starts_at || null;
    const oldExpiresAt = current.expires_at || current.licence_expires_at || null;
    const oldValue = { licenceId: current.licence_id, startsAt: oldStartsAt, expiresAt: oldExpiresAt, active: previousActive };
    const newValue = { licenceId, startsAt: effectiveStartsAt, expiresAt: effectiveExpiresAt, active: nextActive };
    const auditActions = [];
    if (!current.licence_id && licenceId) auditActions.push("licence.assigned");
    else if (current.licence_id && current.licence_id !== licenceId) auditActions.push(licenceId ? "licence.changed" : "licence.unassigned");
    if (effectiveStartsAt !== oldStartsAt) auditActions.push("licence.start_changed");
    if (effectiveExpiresAt !== oldExpiresAt) {
      auditActions.push(effectiveExpiresAt && oldExpiresAt && new Date(effectiveExpiresAt) > new Date(oldExpiresAt) ? "licence.expiry_extended" : "licence.expiry_changed");
    }
    if (previousActive !== nextActive) auditActions.push(nextActive ? "licence.reactivated" : "licence.deactivated");
    if (!auditActions.length) auditActions.push("licence.updated");
    for (const action of auditActions) {
      await writeAudit(req.params.id, req.user.id, action, "company_licence", req.params.id, { old: oldValue, new: newValue });
    }
    res.json({ success: true, data: { ...result.rows[0], licence_name: licence?.name || current.licence_name || null, starts_at: effectiveStartsAt, expires_at: effectiveExpiresAt, active: nextActive, status: newStatus } });
  });

  router.get("/superadmin/companies/:id/licence-allocations", async (req,res) => {
    const r=await db(`SELECT a.licence_id,l.name,a.seats,(SELECT COUNT(*)::int FROM user_licence_assignments u WHERE u.company_id=a.company_id AND u.licence_id=a.licence_id) AS used FROM company_licence_allocations a JOIN licences l ON l.id=a.licence_id WHERE a.company_id=$1 ORDER BY l.name`,[req.params.id]);
    res.json({success:true,data:r.rows});
  });
  router.put("/superadmin/companies/:id/licence-allocations/:licenceId", async (req,res) => {
    const seats=Math.max(0,Number(req.body?.seats)||0);
    const licence=await db("SELECT seat_limit FROM licences WHERE id=$1",[req.params.licenceId]);
    if(!licence.rows.length)return res.status(404).json({success:false,message:"Licence not found"});
    if(licence.rows[0].seat_limit!==null&&licence.rows[0].seat_limit!==undefined&&seats>licence.rows[0].seat_limit)return res.status(400).json({success:false,message:"Seat allocation exceeds the licence seat limit"});
    const used=await db("SELECT COUNT(*)::int used FROM user_licence_assignments WHERE company_id=$1 AND licence_id=$2",[req.params.id,req.params.licenceId]);
    if(used.rows[0].used>seats)return res.status(409).json({success:false,message:`Cannot reduce allocation below ${used.rows[0].used} assigned seats`});
    const r=await db(`INSERT INTO company_licence_allocations(company_id,licence_id,seats,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,licence_id) DO UPDATE SET seats=EXCLUDED.seats,assigned_by=EXCLUDED.assigned_by,updated_at=NOW() RETURNING *`,[req.params.id,req.params.licenceId,seats,req.user.id]);
    res.json({success:true,data:r.rows[0]});
  });

  router.get("/superadmin/companies/:id/entitlements", async (req, res) => {
    const result = await db(`SELECT c.id,c.name,l.id AS licence_id,l.name AS licence_name,l.active,l.starts_at AS licence_starts_at,l.expires_at AS licence_expires_at,
      COALESCE(a.active,true) AS allocation_active,a.starts_at AS allocation_starts_at,a.expires_at AS allocation_expires_at,
      COALESCE(jsonb_object_agg(le.entitlement_key,le.enabled) FILTER (WHERE le.entitlement_key IS NOT NULL),'{}'::jsonb) AS entitlements
      FROM companies c LEFT JOIN licences l ON l.id=c.licence_id
      LEFT JOIN company_licence_allocations a ON a.company_id=c.id AND a.licence_id=c.licence_id
      LEFT JOIN licence_entitlements le ON le.licence_id=l.id
      WHERE c.id=$1 GROUP BY c.id,l.id`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    const [bundles, tiers] = await Promise.all([
      db(`SELECT b.id,b.bundle_key,b.name,a.starts_at,a.expires_at
        FROM company_bundle_assignments a JOIN licence_bundles b ON b.id=a.bundle_id
        WHERE a.company_id=$1 AND a.active=true
          AND (a.starts_at IS NULL OR a.starts_at<=NOW())
          AND (a.expires_at IS NULL OR a.expires_at>NOW()) ORDER BY b.name`, [req.params.id]),
      db(`SELECT t.id,t.tier_key,t.name,a.starts_at,a.expires_at
        FROM company_tier_assignments a JOIN licence_tiers t ON t.id=a.tier_id
        WHERE a.company_id=$1 AND a.active=true
          AND (a.starts_at IS NULL OR a.starts_at<=NOW())
          AND (a.expires_at IS NULL OR a.expires_at>NOW()) ORDER BY t.name`, [req.params.id]),
    ]);
    const effectiveEntitlements = await getCompanyEntitlements(db, req.params.id);
    res.json({ success: true, data: {
      ...result.rows[0],
      starts_at: result.rows[0].allocation_starts_at || result.rows[0].licence_starts_at,
      expires_at: result.rows[0].allocation_expires_at || result.rows[0].licence_expires_at,
      status: licenceStatus({
        active: Boolean(result.rows[0].licence_id) && result.rows[0].active !== false && result.rows[0].allocation_active !== false,
        startsAt: result.rows[0].allocation_starts_at || result.rows[0].licence_starts_at,
        expiresAt: result.rows[0].allocation_expires_at || result.rows[0].licence_expires_at,
      }),
      entitlements: effectiveEntitlements,
      bundles: bundles.rows,
      tiers: tiers.rows,
    } });
  });

  router.get("/superadmin/companies/:id/database", async (req, res) => {
    const config = await tenantDatabaseRouter?.loadConfig(req.params.id);
    if (!config) return res.status(404).json({ success: false, message: "Database configuration not found" });
    res.json({
      success: true,
      data: {
        companyId: config.company_id,
        databaseMode: config.database_mode,
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        sslMode: config.ssl_mode,
        active: config.active,
        schemaState: config.schema_state || TENANT_SCHEMA_STATES.UNINITIALIZED,
        credentialsConfigured: Boolean(config.password_ciphertext),
        initialAdminEmail: (await db(
          `SELECT u.email
             FROM users u
            WHERE u.company_id=$1
              AND u.active=true
              AND EXISTS (
                SELECT 1
                  FROM role_permissions rp
                  JOIN permissions p ON p.id=rp.permission_id
                 WHERE rp.role_id=u.role_id AND p.code='company.scope.all'
              )
            ORDER BY u.created_at
            LIMIT 1`,
          [req.params.id]
        )).rows[0]?.email || null,
      },
    });
  });

  router.get("/superadmin/companies/:id/users", async (req, res) => {
    try {
      const result = await db(
        `SELECT u.id,u.full_name,u.email,u.username,u.active,r.name AS role_name
           FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
          WHERE u.company_id=$1
          ORDER BY u.full_name,u.email`,
        [req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch {
      res.status(500).json({ success: false, message: "Unable to load company users" });
    }
  });

  router.get("/superadmin/users/email-conflicts", async (req, res) => {
    const conflicts = await listDuplicateNormalizedEmails(db);
    res.json({
      success: true,
      data: conflicts,
      migration: conflicts.length
        ? "Review each duplicate, assign a unique normalized email, then rerun initialization to create the unique index. Do not delete or merge accounts automatically."
        : "No normalized email conflicts found.",
    });
  });

  router.post("/superadmin/companies/:id/provision-admin", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid client admin email is required" });
    }
    const client = await pool.connect();
    try {
      const companyResult = await client.query("SELECT id,name FROM companies WHERE id=$1", [req.params.id]);
      if (!companyResult.rows.length) return res.status(404).json({ success: false, message: "Company not found" });

      const existingAdmin = await client.query(
        `SELECT u.id,u.email
           FROM users u
           JOIN roles r ON r.id=u.role_id
          WHERE u.company_id=$1
            AND u.active=true
            AND EXISTS (
              SELECT 1
                FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
               WHERE rp.role_id=r.id AND p.code='company.scope.all'
            )
          ORDER BY u.created_at
          LIMIT 1`,
        [req.params.id]
      );
      if (existingAdmin.rows.length) {
        return res.status(409).json({
          success: false,
          code: "COMPANY_ADMIN_EXISTS",
          message: "This company already has an initial Company Admin.",
          data: { emailConfigured: Boolean(existingAdmin.rows[0].email) },
        });
      }

      const conflict = await findNormalizedEmailConflict(
        (query, params) => client.query(query, params),
        email
      );
      if (conflict) return res.status(409).json({ success: false, code: "EMAIL_ALREADY_REGISTERED", message: DUPLICATE_EMAIL_MESSAGE });

      await client.query("BEGIN");
      let roleResult = await client.query(
        "SELECT r.id FROM roles r WHERE r.company_id=$1 AND r.api_key='company_admin' LIMIT 1",
        [req.params.id]
      );
      let roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        roleResult = await client.query(
          `SELECT r.id
             FROM roles r
            WHERE r.company_id=$1
              AND EXISTS (
                SELECT 1
                  FROM role_permissions rp
                  JOIN permissions p ON p.id=rp.permission_id
                 WHERE rp.role_id=r.id AND p.code='company.scope.all'
              )
            ORDER BY r.is_system_role DESC,r.created_at
            LIMIT 1`,
          [req.params.id]
        );
        roleId = roleResult.rows[0]?.id;
        if (roleId) {
          await client.query(
            "UPDATE roles SET api_key=COALESCE(api_key,'company_admin'),is_system_role=true WHERE id=$1",
            [roleId]
          );
        }
      }
      if (!roleId) {
        roleResult = await client.query(
          `INSERT INTO roles (company_id,name,api_key,description,is_system_role,managed_by_platform)
           VALUES ($1,'Company Admin','company_admin','Company-level administrative access',TRUE,FALSE)
           RETURNING id`,
          [req.params.id]
        );
        roleId = roleResult.rows[0]?.id;
      }
      if (!roleId) throw new Error("Unable to create Company Admin role");

      await client.query(
        `INSERT INTO role_permissions (role_id,permission_id)
         SELECT $1,id FROM permissions
         ON CONFLICT DO NOTHING`,
        [roleId]
      );
      const passwordHash = await bcrypt.hash("marvel", 12);
      const userResult = await client.query(
        `INSERT INTO users
          (company_id,role_id,username,email,password_hash,full_name,must_change_password)
         VALUES ($1,$2,$3,$4,$5,'Company Administrator',FALSE)
         RETURNING id,company_id,username,email,full_name,must_change_password`,
        [req.params.id, roleId, email, email, passwordHash]
      );
      await client.query("COMMIT");
      return res.status(201).json({
        success: true,
        data: {
          ...userResult.rows[0],
          temporaryPasswordIssued: true,
          password: undefined,
        },
        message: "Initial Company Admin provisioned. The password can be changed from the account menu.",
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error.code === "23505") {
        return res.status(409).json({ success: false, code: "EMAIL_ALREADY_REGISTERED", message: DUPLICATE_EMAIL_MESSAGE });
      }
      console.error("Company Admin provisioning error:", { companyId: req.params.id, code: error.code || "UNKNOWN" });
      return res.status(500).json({ success: false, message: "Unable to provision initial Company Admin" });
    } finally {
      client.release();
    }
  });

  router.post("/superadmin/companies/:id/provision-support", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const temporaryPassword = String(req.body?.temporaryPassword || "");
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid client-domain support email is required" });
    }
    if (temporaryPassword.length < 8) {
      return res.status(400).json({ success: false, message: "temporaryPassword must be at least 8 characters" });
    }

    const client = await pool.connect();
    try {
      const companyResult = await client.query(
        "SELECT id,name,user_email_domain FROM companies WHERE id=$1",
        [req.params.id]
      );
      if (!companyResult.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
      const company = companyResult.rows[0];
      const domain = String(company.user_email_domain || "").trim().toLowerCase();
      if (domain && !email.toLowerCase().endsWith(`@${domain}`)) {
        return res.status(400).json({ success: false, message: `Support email must use the company domain @${domain}` });
      }

      const conflict = await findNormalizedEmailConflict(
        (query, params) => client.query(query, params),
        email
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          code: "EMAIL_ALREADY_REGISTERED",
          message: DUPLICATE_EMAIL_MESSAGE,
        });
      }

      await client.query("BEGIN");

      let roleResult = await client.query(
        "SELECT id FROM roles WHERE company_id=$1 AND api_key='one_solutions_support' LIMIT 1",
        [company.id]
      );
      let roleId = roleResult.rows[0]?.id;
      if (!roleId) {
        roleResult = await client.query(
          `INSERT INTO roles
             (company_id,name,api_key,description,is_system_role,managed_by_platform)
           VALUES ($1,'One Solutions Support','one_solutions_support',
                   'Platform-managed tenant support profile',TRUE,TRUE)
           RETURNING id`,
          [company.id]
        );
        roleId = roleResult.rows[0].id;
      } else {
        await client.query(
          `UPDATE roles
              SET name='One Solutions Support',
                  description='Platform-managed tenant support profile',
                  is_system_role=TRUE,
                  managed_by_platform=TRUE
            WHERE id=$1`,
          [roleId]
        );
      }

      await client.query(
        `INSERT INTO role_permissions (role_id,permission_id)
         SELECT $1,id FROM permissions
         ON CONFLICT (role_id,permission_id) DO NOTHING`,
        [roleId]
      );

      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      const userResult = await client.query(
        `INSERT INTO users
           (company_id,role_id,username,email,password_hash,full_name,active,must_change_password)
         VALUES ($1,$2,$3,$3,$4,'One Solutions Support',TRUE,TRUE)
         RETURNING id,company_id,username,email,full_name,active,role_id,must_change_password`,
        [company.id, roleId, email, passwordHash]
      );

      await client.query("COMMIT");

      await writeAudit({
        companyId: company.id,
        userId: req.user.id,
        action: "platform.support_user.provisioned",
        entityType: "user",
        entityId: userResult.rows[0].id,
        details: { email, roleId, managedByPlatform: true },
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        data: userResult.rows[0],
        message: "Tenant support account provisioned with a platform-managed RBAC profile.",
      });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error.code === "23505") {
        return res.status(409).json({ success: false, code: "EMAIL_ALREADY_REGISTERED", message: DUPLICATE_EMAIL_MESSAGE });
      }
      console.error("Support account provisioning error:", { companyId: req.params.id, code: error.code || "UNKNOWN" });
      return res.status(500).json({ success: false, message: "Unable to provision tenant support account" });
    } finally {
      client.release();
    }
  });

  router.put("/superadmin/companies/:id/database", async (req, res) => {
    const mode = String(req.body?.databaseMode || "ONEPOS_MANAGED").toUpperCase();
    if (!["ONEPOS_MANAGED", "CUSTOMER_MANAGED"].includes(mode)) {
      return res.status(400).json({ success: false, message: "Invalid database mode" });
    }
    if (mode === "CUSTOMER_MANAGED" && (!req.body?.host || !req.body?.database || !req.body?.username)) {
      return res.status(400).json({ success: false, message: "Customer database host, database and username are required" });
    }
    const existing = await tenantDatabaseRouter.loadConfig(req.params.id);
    const incomingPort = Number(req.body?.port) || 5432;
    const routingChanged = existing.database_mode !== mode
      || (existing.host || null) !== (req.body.host || null)
      || Number(existing.port || 5432) !== incomingPort
      || (existing.database || null) !== (req.body.database || null)
      || (existing.username || null) !== (req.body.username || null)
      || (existing.ssl_mode || "require") !== (req.body.sslMode || "require")
      || Boolean(req.body?.password);
    const encryptedPassword = req.body?.password
      ? encryptDatabaseSecret(req.body.password, env)
      : existing.password_ciphertext || null;
    const nextActive = routingChanged ? false : existing.active === true;
    const nextSchemaState = routingChanged
      ? (mode === "ONEPOS_MANAGED" ? TENANT_SCHEMA_STATES.COMPATIBLE : TENANT_SCHEMA_STATES.UNINITIALIZED)
      : (existing.schema_state || (mode === "ONEPOS_MANAGED" ? TENANT_SCHEMA_STATES.COMPATIBLE : TENANT_SCHEMA_STATES.UNINITIALIZED));
    await db(
      `INSERT INTO tenant_database_configs
       (company_id,database_mode,host,port,database_name,username,password_ciphertext,ssl_mode,active,schema_state,updated_by,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (company_id) DO UPDATE SET
         database_mode=EXCLUDED.database_mode,host=EXCLUDED.host,port=EXCLUDED.port,
         database_name=EXCLUDED.database_name,username=EXCLUDED.username,
         password_ciphertext=COALESCE(EXCLUDED.password_ciphertext,tenant_database_configs.password_ciphertext),
         ssl_mode=EXCLUDED.ssl_mode,active=EXCLUDED.active,schema_state=EXCLUDED.schema_state,
         updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [
        req.params.id,
        mode,
        req.body.host || null,
        incomingPort,
        req.body.database || null,
        req.body.username || null,
        encryptedPassword,
        req.body.sslMode || "require",
        nextActive,
        nextSchemaState,
        req.user.id,
      ]
    );
    res.json({
      success: true,
      data: {
        databaseMode: mode,
        credentialsConfigured: Boolean(encryptedPassword),
        active: nextActive,
        schemaState: nextSchemaState,
      },
    });
  });

  router.post("/superadmin/companies/:id/database/test", async (req, res) => {
    try {
      const config = await tenantDatabaseRouter.loadConfig(req.params.id);
      if (config.database_mode !== "CUSTOMER_MANAGED") return res.json({ success: true, data: { status: "SKIPPED", message: "Company uses onePOS Managed storage" } });
      await tenantDatabaseRouter.testExternalConfig(config);
      return res.json({ success: true, data: { status: "CONNECTED" } });
    } catch (error) {
      console.error("Tenant database operation failed", {
        operation: "test_connection",
        companyId: req.params.id,
        ...tenantDatabaseDiagnostic(error),
      });
      return res.status(503).json({ success: false, code: "TENANT_DATABASE_UNAVAILABLE", message: "Unable to connect to customer database" });
    }
  });

  router.post("/superadmin/companies/:id/database/validate-schema", async (req, res) => {
    try {
      const config = await tenantDatabaseRouter.loadConfig(req.params.id);
      const pool = await tenantDatabaseRouter.getPoolForConfig(config);
      const schemaState = await validateTenantSchema(pool);
      await db("UPDATE tenant_database_configs SET schema_state=$1 WHERE company_id=$2", [schemaState, req.params.id]);
      res.json({ success: true, data: { schemaState } });
    } catch (error) {
      console.error("Tenant database operation failed", {
        operation: "validate_schema",
        companyId: req.params.id,
        ...tenantDatabaseDiagnostic(error),
      });
      res.status(503).json({ success: false, code: "TENANT_DATABASE_UNAVAILABLE", message: "Unable to validate customer database schema" });
    }
  });

  router.post("/superadmin/companies/:id/database/initialize", async (req, res) => {
    try {
      const config = await tenantDatabaseRouter.loadConfig(req.params.id);
      const pool = await tenantDatabaseRouter.getPoolForConfig(config);
      const schemaState = await initializeTenantSchema(pool);
      await db("UPDATE tenant_database_configs SET schema_state=$1 WHERE company_id=$2", [schemaState, req.params.id]);
      res.json({ success: true, data: { schemaState } });
    } catch (error) {
      console.error("Tenant database operation failed", {
        operation: "initialize_schema",
        companyId: req.params.id,
        ...tenantDatabaseDiagnostic(error),
      });
      res.status(503).json({ success: false, code: "TENANT_DATABASE_UNAVAILABLE", message: "Unable to initialize customer database" });
    }
  });

  router.post("/superadmin/companies/:id/database/activate", async (req, res) => {
    const config = await tenantDatabaseRouter.loadConfig(req.params.id);
    if (config.database_mode === "CUSTOMER_MANAGED" && config.schema_state !== TENANT_SCHEMA_STATES.COMPATIBLE) {
      return res.status(409).json({ success: false, message: "Customer database schema must be compatible before activation" });
    }
    await db("UPDATE tenant_database_configs SET active=true,updated_at=NOW(),updated_by=$1 WHERE company_id=$2", [req.user.id, req.params.id]);
    res.json({ success: true, data: { active: true } });
  });

  router.get("/superadmin/packages", async (_req, res) => {
    const result = await db(
      `SELECT id,package_key,name,version,package_type,publisher,category,publication_state,
              active,visible,installable,billable,featured,system_only,display_order,available_tiers,
              allowed_bundles,allowed_companies,licence_mode,manifest
         FROM package_registry ORDER BY display_order,name`
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/superadmin/packages/register-portable", async (req, res) => {
    try {
      const body = req.body || {};
      const result = await registerPortableApplicationPackage({
        db,
        packageKey: body.packageKey || body.package_key,
        name: body.name,
        version: body.version,
        description: body.description || "",
        manifest: body.manifest || {},
        publisher: body.publisher || "OneSolutions",
        category: body.category || "Apps",
        billable: body.billable !== false,
      });
      await writeAudit.object({
        userId: req.user?.id || null,
        action: "package.registered",
        entityType: "package",
        entityId: result.id,
        metadata: { packageKey: result.package_key, version: result.version },
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to register package" });
    }
  });

  router.get("/superadmin/packages/releases", async (req, res) => {
    try {
      const releases = await listPackageReleases(db, { packageKey: req.query?.packageKey || req.query?.package_key || null });
      res.json({ success: true, data: releases });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to load package releases" });
    }
  });

  router.get("/superadmin/packages/releases/:releaseId/status", async (req, res) => {
    try {
      const result = await getPackageReleaseRolloutStatus(db, req.params.releaseId);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to load release rollout status" });
    }
  });

  router.post("/superadmin/packages/releases", async (req, res) => {
    try {
      const payload = req.body || {};
      const result = await createPackageRelease({
        db,
        packageKey: payload.packageKey || payload.package_key,
        version: payload.version,
        previousVersion: payload.previousVersion || payload.previous_version || null,
        releaseNotes: payload.releaseNotes || payload.release_notes || "",
        status: payload.status || "DRAFT",
        minimumPlatformVersion: payload.minimumPlatformVersion || payload.minimum_platform_version || null,
        updatePolicy: payload.updatePolicy || payload.update_policy || "OPTIONAL",
        changeSet: Array.isArray(payload.changeSet) ? payload.changeSet : (Array.isArray(payload.change_set) ? payload.change_set : []),
        manifest: payload.manifest || {},
        createdBy: req.user?.id || null,
      });
      await writeAudit.object({
        userId: req.user?.id || null,
        action: "release.created",
        entityType: "package_release",
        entityId: result.id,
        metadata: { packageKey: result.packageKey, version: result.version, status: result.status },
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to create package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/validate", async (req, res) => {
    try {
      const result = await validatePackageRelease({ db, releaseId: req.params.releaseId, userId: req.user?.id || null });
      await writeAudit.object({
        userId: req.user?.id || null,
        action: "release.validated",
        entityType: "package_release",
        entityId: req.params.releaseId,
        result: result.valid ? "success" : "failure",
        metadata: { valid: result.valid, errorCount: result.errors?.length || 0, warningCount: result.warnings?.length || 0 },
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to validate package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/publish", async (req, res) => {
    try {
      const result = await publishPackageRelease({ db, releaseId: req.params.releaseId, publishedBy: req.user?.id || null });
      await writeAudit.object({
        userId: req.user?.id || null,
        action: "release.published",
        entityType: "package_release",
        entityId: result.id,
        metadata: { packageKey: result.packageKey, version: result.version, status: result.status },
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to publish package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/start-rollout", async (req, res) => {
    try {
      const result = await startReleaseRollout({ db, releaseId: req.params.releaseId, companyIds: Array.isArray(req.body?.companyIds) ? req.body.companyIds : [], userId: req.user?.id || null, stage: req.body?.stage || "internal" });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to start release rollout" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/pause", async (req, res) => {
    try {
      const result = await setPackageReleasePaused({ db, releaseId: req.params.releaseId, paused: true, userId: req.user?.id || null, companyId: req.user?.companyId || null });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to pause package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/resume", async (req, res) => {
    try {
      const result = await setPackageReleasePaused({ db, releaseId: req.params.releaseId, paused: false, userId: req.user?.id || null, companyId: req.user?.companyId || null });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to resume package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/retry", async (req, res) => {
    try {
      const result = await retryFailedReleaseUpgrades({ db, releaseId: req.params.releaseId, userId: req.user?.id || null });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to retry failed package upgrades" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/rollout", async (req, res) => {
    try {
      const result = await startReleaseRollout({ db, releaseId: req.params.releaseId, companyIds: Array.isArray(req.body?.companyIds) ? req.body.companyIds : [], userId: req.user?.id || null, stage: req.body?.stage || "internal" });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to queue release rollout" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/rollback", async (req, res) => {
    try {
      const companyId = req.body?.companyId || req.body?.company_id;
      if (!companyId) return res.status(400).json({ success: false, message: "companyId is required to roll back a tenant" });
      const result = await rollbackPackageRelease({ db, releaseId: req.params.releaseId, companyId, userId: req.user?.id || null });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to rollback package release" });
    }
  });

  router.post("/superadmin/packages/releases/:releaseId/tenant/:companyId/upgrade", async (req, res) => {
    try {
      const result = await executeTenantReleaseUpgrade({
        db,
        releaseId: req.params.releaseId,
        companyId: req.params.companyId,
        packageKey: req.body?.packageKey || req.body?.package_key || null,
        userId: req.user?.id || null,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to upgrade tenant" });
    }
  });

  router.put("/superadmin/packages/:packageId/marketplace", async (req, res) => {
    const body = req.body || {};
    const validBoolean = ["active", "visible", "installable", "billable", "featured", "system_only"].every((key) => body[key] === undefined || typeof body[key] === "boolean");
    const tiers = body.available_tiers;
    const bundles = body.allowed_bundles;
    const companies = body.allowed_companies;
    const validKeys = (items) => items === undefined || (Array.isArray(items) && items.every((item) => typeof item === "string" && /^[a-z0-9_.-]{1,100}$/i.test(item)));
    const validCompanies = companies === undefined || (Array.isArray(companies) && companies.every((item) => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item)));
    if (!validBoolean || !validKeys(tiers) || !validKeys(bundles) || !validCompanies) {
      return res.status(400).json({ success: false, message: "Invalid package visibility configuration" });
    }
    if (body.licence_mode !== undefined && !["COMMERCIAL", "TECHNICAL"].includes(body.licence_mode)) {
      return res.status(400).json({ success: false, message: "Invalid package licence mode" });
    }
    if (body.category !== undefined && (typeof body.category !== "string" || body.category.length > 100)) {
      return res.status(400).json({ success: false, message: "Invalid package category" });
    }
    if (body.publication_state !== undefined && !["DRAFT", "PUBLISHED", "RETIRED"].includes(body.publication_state)) {
      return res.status(400).json({ success: false, message: "Invalid publication state" });
    }
    const result = await db(
      `UPDATE package_registry SET
         active=COALESCE($1,active),
         visible=COALESCE($2,visible),installable=COALESCE($3,installable),
         billable=COALESCE($4,billable),featured=COALESCE($5,featured),system_only=COALESCE($6,system_only),
         category=COALESCE(NULLIF($7,''),category),display_order=COALESCE($8,display_order),
         available_tiers=COALESCE($9::jsonb,available_tiers),
         publication_state=COALESCE($10,publication_state),
         allowed_bundles=COALESCE($11::text[],allowed_bundles),
         allowed_companies=COALESCE($12::uuid[],allowed_companies),
         licence_mode=COALESCE($13,licence_mode),updated_at=NOW()
       WHERE id=$14 RETURNING id,package_key,active,visible,installable,billable,featured,system_only,
         category,display_order,available_tiers,allowed_bundles,allowed_companies,licence_mode,publication_state`,
      [
        body.active ?? null,
        body.visible ?? null,
        body.installable ?? null,
        body.billable ?? null,
        body.featured ?? null,
        body.system_only ?? null,
        body.category ?? null,
        Number.isInteger(body.display_order) ? body.display_order : null,
        tiers === undefined ? null : JSON.stringify(tiers),
        body.publication_state ?? null,
        bundles === undefined ? null : bundles,
        companies === undefined ? null : companies,
        body.licence_mode ?? null,
        req.params.packageId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Package not found" });
    const affectedCompanies = await db(
      `SELECT company_id FROM company_package_installations WHERE package_id=$1
       UNION SELECT company_id FROM company_package_entitlement_sources WHERE package_id=$1`,
      [req.params.packageId]
    );
    for (const company of affectedCompanies.rows) {
      await reconcileCompanyPackageEntitlements(db, company.company_id);
    }
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/superadmin/bundles", async (_req, res) => {
    const result = await db(
      `SELECT b.*,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'package_id',p.id,'package_key',p.package_key,'entitlement_type',bp.entitlement_type,'version_range',bp.version_range
              )) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS packages,
              COALESCE((SELECT jsonb_object_agg(be.entitlement_key,be.enabled)
                         FROM licence_bundle_entitlements be WHERE be.bundle_id=b.id),'{}'::jsonb) AS entitlements
         FROM licence_bundles b
         LEFT JOIN licence_bundle_packages bp ON bp.bundle_id=b.id
         LEFT JOIN package_registry p ON p.id=bp.package_id
        GROUP BY b.id ORDER BY b.name`
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/superadmin/bundles", async (req, res) => {
    const key = String(req.body?.bundle_key || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!/^[a-z][a-z0-9_.-]{1,99}$/i.test(key) || !name) {
      return res.status(400).json({ success: false, message: "A valid bundle key and name are required" });
    }
    const allowedCompanies = req.body.allowed_companies ?? [];
    const availableTiers = req.body.available_tiers ?? [];
    if (!Array.isArray(allowedCompanies) || allowedCompanies.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) ||
        !Array.isArray(availableTiers) || availableTiers.some((item) => typeof item !== "string" || !/^[a-z0-9_.-]{1,100}$/i.test(item))) {
      return res.status(400).json({ success: false, message: "Invalid bundle restrictions" });
    }
    const result = await db(
      `INSERT INTO licence_bundles
       (bundle_key,name,description,active,visible,installable,display_order,allowed_companies,available_tiers)
       VALUES($1,$2,$3,COALESCE($4,true),COALESCE($5,false),COALESCE($6,false),COALESCE($7,0),$8::uuid[],$9::text[])
       ON CONFLICT(bundle_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
         active=EXCLUDED.active,visible=EXCLUDED.visible,installable=EXCLUDED.installable,
         display_order=EXCLUDED.display_order,allowed_companies=EXCLUDED.allowed_companies,
         available_tiers=EXCLUDED.available_tiers,updated_at=NOW()
       RETURNING *`,
      [key, name, req.body.description || null, req.body.active, req.body.visible, req.body.installable,
        Number.isInteger(req.body.display_order) ? req.body.display_order : 0, allowedCompanies, availableTiers]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.put("/superadmin/bundles/:bundleId/marketplace", async (req, res) => {
    const body = req.body || {};
    const booleans = ["active", "visible", "installable"].every((key) => body[key] === undefined || typeof body[key] === "boolean");
    const validKeys = (items) => items === undefined || (Array.isArray(items) && items.every((item) => typeof item === "string" && /^[a-z0-9_.-]{1,100}$/i.test(item)));
    const companies = body.allowed_companies;
    if (!booleans || !validKeys(body.available_tiers) ||
        (companies !== undefined && (!Array.isArray(companies) || companies.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))))) {
      return res.status(400).json({ success: false, message: "Invalid bundle marketplace configuration" });
    }
    const result = await db(
      `UPDATE licence_bundles SET active=COALESCE($1,active),visible=COALESCE($2,visible),
         installable=COALESCE($3,installable),display_order=COALESCE($4,display_order),
         available_tiers=COALESCE($5::text[],available_tiers),
         allowed_companies=COALESCE($6::uuid[],allowed_companies),updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [body.active ?? null, body.visible ?? null, body.installable ?? null,
        Number.isInteger(body.display_order) ? body.display_order : null,
        body.available_tiers ?? null, companies ?? null, req.params.bundleId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Bundle not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.put("/superadmin/bundles/:bundleId/composition", async (req, res) => {
    const packages = req.body?.packages;
    const entitlements = req.body?.entitlements || {};
    if (!Array.isArray(packages) || !entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) {
      return res.status(400).json({ success: false, message: "packages and entitlements are required" });
    }
    const bundle = await db("SELECT id FROM licence_bundles WHERE id=$1", [req.params.bundleId]);
    if (!bundle.rows.length) return res.status(404).json({ success: false, message: "Bundle not found" });
    const packageIds = [...new Set(packages.map((item) => String(item?.package_id || "")))];
    const packageRows = packageIds.length
      ? await db("SELECT id FROM package_registry WHERE id=ANY($1::uuid[])", [packageIds])
      : { rows: [] };
    if (packageRows.rows.length !== packageIds.length) {
      return res.status(400).json({ success: false, message: "Bundle contains an unknown package" });
    }
    const normalizedEntitlements = normaliseEntitlements(entitlements);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM licence_bundle_packages WHERE bundle_id=$1", [req.params.bundleId]);
      await client.query("DELETE FROM licence_bundle_entitlements WHERE bundle_id=$1", [req.params.bundleId]);
      for (const item of packages) {
        const type = item.entitlement_type || "COMMERCIAL";
        if (!["COMMERCIAL", "REQUIRED_DEPENDENCY", "OPTIONAL"].includes(type)) throw new Error("Invalid bundle package entitlement type");
        await client.query(
          "INSERT INTO licence_bundle_packages(bundle_id,package_id,entitlement_type,version_range) VALUES($1,$2,$3,$4)",
          [req.params.bundleId, item.package_id, type, item.version_range || null]
        );
      }
      for (const [entitlementKey, enabled] of Object.entries(normalizedEntitlements)) {
        await client.query(
          "INSERT INTO licence_bundle_entitlements(bundle_id,entitlement_key,enabled) VALUES($1,$2,$3)",
          [req.params.bundleId, entitlementKey, enabled]
        );
      }
      const assignedCompanies = await client.query(
        "SELECT company_id FROM company_bundle_assignments WHERE bundle_id=$1 AND active=true",
        [req.params.bundleId]
      );
      for (const assignment of assignedCompanies.rows) {
        await reconcileCompanyPackageEntitlements(
          (query, params) => client.query(query, params),
          assignment.company_id
        );
      }
      await client.query("COMMIT");
      res.json({ success: true, data: { bundleId: req.params.bundleId, packages, entitlements: normalizedEntitlements } });
    } catch (error) {
      await client.query("ROLLBACK");
      res.status(400).json({ success: false, message: error.message || "Unable to update bundle composition" });
    } finally {
      client.release();
    }
  });

  router.put("/superadmin/companies/:id/bundles", async (req, res) => {
    const legacyIds = req.body?.bundleIds;
    const input = req.body?.assignments ?? (Array.isArray(legacyIds) ? legacyIds.map((bundleId) => ({ bundleId })) : null);
    if (!Array.isArray(input) || input.some((item) =>
      !item || typeof item.bundleId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.bundleId) ||
      !validOptionalDate(item.startsAt) || !validOptionalDate(item.expiresAt) ||
      (item.startsAt && item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(item.startsAt))
    )) {
      return res.status(400).json({ success: false, message: "Provide bundleIds or valid bundle assignments" });
    }
    const company = await db("SELECT id FROM companies WHERE id=$1", [req.params.id]);
    if (!company.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    const assignments = [...new Map(input.map((item) => [item.bundleId, item])).values()];
    const uniqueIds = assignments.map((item) => item.bundleId);
    const bundles = uniqueIds.length
      ? await db("SELECT id,allowed_companies,available_tiers FROM licence_bundles WHERE id=ANY($1::uuid[]) AND active=true", [uniqueIds])
      : { rows: [] };
    if (bundles.rows.length !== uniqueIds.length) return res.status(400).json({ success: false, message: "One or more bundles are unavailable" });
    const assignedTiers = await db(
      `SELECT t.tier_key FROM company_tier_assignments a
       JOIN licence_tiers t ON t.id=a.tier_id
       WHERE a.company_id=$1 AND a.active=true AND t.active=true
         AND (a.starts_at IS NULL OR a.starts_at<=NOW())
         AND (a.expires_at IS NULL OR a.expires_at>NOW())`,
      [req.params.id]
    );
    const tierKeys = new Set(assignedTiers.rows.map((row) => row.tier_key));
    if (bundles.rows.some((bundle) =>
      (bundle.allowed_companies || []).length && !bundle.allowed_companies.includes(req.params.id) ||
      (bundle.available_tiers || []).length && !(bundle.available_tiers || []).some((tierKey) => tierKeys.has(tierKey))
    )) {
      return res.status(400).json({ success: false, message: "One or more bundles are restricted for this company or tier" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE company_bundle_assignments SET active=false,updated_at=NOW() WHERE company_id=$1", [req.params.id]);
      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO company_bundle_assignments(company_id,bundle_id,active,starts_at,expires_at,assigned_by)
           VALUES($1,$2,true,$3,$4,$5)
           ON CONFLICT(company_id,bundle_id) DO UPDATE SET active=true,starts_at=EXCLUDED.starts_at,
             expires_at=EXCLUDED.expires_at,assigned_by=EXCLUDED.assigned_by,updated_at=NOW()`,
          [req.params.id, assignment.bundleId, assignment.startsAt || null, assignment.expiresAt || null, req.user.id]
        );
      }
      await reconcileCompanyPackageEntitlements((query, params) => client.query(query, params), req.params.id);
      await client.query("COMMIT");
      res.json({ success: true, data: { companyId: req.params.id, bundleIds: uniqueIds } });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Bundle assignment update error:", error);
      res.status(500).json({ success: false, message: "Unable to update company bundle assignments" });
    } finally {
      client.release();
    }
  });

  router.get("/superadmin/tiers", async (_req, res) => {
    const result = await db(
      `SELECT t.*,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'package_id',p.id,'package_key',p.package_key,'entitlement_type',tp.entitlement_type,'version_range',tp.version_range
              )) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS packages,
              COALESCE((SELECT jsonb_object_agg(te.entitlement_key,te.enabled)
                         FROM licence_tier_entitlements te WHERE te.tier_id=t.id),'{}'::jsonb) AS entitlements
         FROM licence_tiers t
         LEFT JOIN licence_tier_packages tp ON tp.tier_id=t.id
         LEFT JOIN package_registry p ON p.id=tp.package_id
        GROUP BY t.id ORDER BY t.display_order,t.name`
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/superadmin/tiers", async (req, res) => {
    const key = String(req.body?.tier_key || "").trim();
    const name = String(req.body?.name || "").trim();
    const allowedCompanies = req.body?.allowed_companies ?? [];
    if (!/^[a-z][a-z0-9_.-]{1,99}$/i.test(key) || !name ||
        !Array.isArray(allowedCompanies) || allowedCompanies.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return res.status(400).json({ success: false, message: "A valid tier key, name, and company restriction list are required" });
    }
    const result = await db(
      `INSERT INTO licence_tiers(tier_key,name,description,active,visible,installable,display_order,allowed_companies)
       VALUES($1,$2,$3,COALESCE($4,true),COALESCE($5,false),COALESCE($6,false),COALESCE($7,0),$8::uuid[])
       ON CONFLICT(tier_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
         active=EXCLUDED.active,visible=EXCLUDED.visible,installable=EXCLUDED.installable,
         display_order=EXCLUDED.display_order,allowed_companies=EXCLUDED.allowed_companies,updated_at=NOW()
       RETURNING *`,
      [key, name, req.body.description || null, req.body.active, req.body.visible, req.body.installable,
        Number.isInteger(req.body.display_order) ? req.body.display_order : 0, allowedCompanies]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.put("/superadmin/tiers/:tierId/marketplace", async (req, res) => {
    const body = req.body || {};
    const booleans = ["active", "visible", "installable"].every((key) => body[key] === undefined || typeof body[key] === "boolean");
    const companies = body.allowed_companies;
    if (!booleans || (companies !== undefined && (!Array.isArray(companies) ||
        companies.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))))) {
      return res.status(400).json({ success: false, message: "Invalid tier marketplace configuration" });
    }
    const result = await db(
      `UPDATE licence_tiers SET active=COALESCE($1,active),visible=COALESCE($2,visible),
         installable=COALESCE($3,installable),display_order=COALESCE($4,display_order),
         allowed_companies=COALESCE($5::uuid[],allowed_companies),updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [body.active ?? null, body.visible ?? null, body.installable ?? null,
        Number.isInteger(body.display_order) ? body.display_order : null, companies ?? null, req.params.tierId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Tier not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.put("/superadmin/tiers/:tierId/composition", async (req, res) => {
    const packages = req.body?.packages;
    const entitlements = req.body?.entitlements || {};
    if (!Array.isArray(packages) || !entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) {
      return res.status(400).json({ success: false, message: "packages and entitlements are required" });
    }
    const tier = await db("SELECT id FROM licence_tiers WHERE id=$1", [req.params.tierId]);
    if (!tier.rows.length) return res.status(404).json({ success: false, message: "Tier not found" });
    const packageIds = [...new Set(packages.map((item) => String(item?.package_id || "")))];
    const packageRows = packageIds.length
      ? await db("SELECT id FROM package_registry WHERE id=ANY($1::uuid[])", [packageIds])
      : { rows: [] };
    if (packageRows.rows.length !== packageIds.length) {
      return res.status(400).json({ success: false, message: "Tier contains an unknown package" });
    }
    const normalizedEntitlements = normaliseEntitlements(entitlements);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM licence_tier_packages WHERE tier_id=$1", [req.params.tierId]);
      await client.query("DELETE FROM licence_tier_entitlements WHERE tier_id=$1", [req.params.tierId]);
      for (const item of packages) {
        const type = item.entitlement_type || "COMMERCIAL";
        if (!["COMMERCIAL", "REQUIRED_DEPENDENCY", "OPTIONAL"].includes(type)) throw new Error("Invalid tier package entitlement type");
        await client.query(
          "INSERT INTO licence_tier_packages(tier_id,package_id,entitlement_type,version_range) VALUES($1,$2,$3,$4)",
          [req.params.tierId, item.package_id, type, item.version_range || null]
        );
      }
      for (const [entitlementKey, enabled] of Object.entries(normalizedEntitlements)) {
        await client.query(
          "INSERT INTO licence_tier_entitlements(tier_id,entitlement_key,enabled) VALUES($1,$2,$3)",
          [req.params.tierId, entitlementKey, enabled]
        );
      }
      const assignedCompanies = await client.query(
        "SELECT company_id FROM company_tier_assignments WHERE tier_id=$1 AND active=true",
        [req.params.tierId]
      );
      for (const assignment of assignedCompanies.rows) {
        await reconcileCompanyPackageEntitlements(
          (query, params) => client.query(query, params),
          assignment.company_id
        );
      }
      await client.query("COMMIT");
      res.json({ success: true, data: { tierId: req.params.tierId, packages, entitlements: normalizedEntitlements } });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Tier composition update error:", error);
      res.status(400).json({ success: false, message: error.message || "Unable to update tier composition" });
    } finally {
      client.release();
    }
  });

  router.put("/superadmin/companies/:id/tiers", async (req, res) => {
    const legacyIds = req.body?.tierIds;
    const input = req.body?.assignments ?? (Array.isArray(legacyIds) ? legacyIds.map((tierId) => ({ tierId })) : null);
    if (!Array.isArray(input) || input.some((item) =>
      !item || typeof item.tierId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.tierId) ||
      !validOptionalDate(item.startsAt) || !validOptionalDate(item.expiresAt) ||
      (item.startsAt && item.expiresAt && Date.parse(item.expiresAt) <= Date.parse(item.startsAt))
    )) {
      return res.status(400).json({ success: false, message: "Provide tierIds or valid tier assignments" });
    }
    const company = await db("SELECT id FROM companies WHERE id=$1", [req.params.id]);
    if (!company.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    const assignments = [...new Map(input.map((item) => [item.tierId, item])).values()];
    const uniqueIds = assignments.map((item) => item.tierId);
    const tiers = uniqueIds.length
      ? await db("SELECT id,allowed_companies FROM licence_tiers WHERE id=ANY($1::uuid[]) AND active=true", [uniqueIds])
      : { rows: [] };
    if (tiers.rows.length !== uniqueIds.length) return res.status(400).json({ success: false, message: "One or more tiers are unavailable" });
    if (tiers.rows.some((tier) =>
      (tier.allowed_companies || []).length && !tier.allowed_companies.includes(req.params.id)
    )) {
      return res.status(400).json({ success: false, message: "One or more tiers are restricted for this company" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE company_tier_assignments SET active=false,updated_at=NOW() WHERE company_id=$1", [req.params.id]);
      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO company_tier_assignments(company_id,tier_id,active,starts_at,expires_at,assigned_by)
           VALUES($1,$2,true,$3,$4,$5)
           ON CONFLICT(company_id,tier_id) DO UPDATE SET active=true,starts_at=EXCLUDED.starts_at,
             expires_at=EXCLUDED.expires_at,assigned_by=EXCLUDED.assigned_by,updated_at=NOW()`,
          [req.params.id, assignment.tierId, assignment.startsAt || null, assignment.expiresAt || null, req.user.id]
        );
      }
      await reconcileCompanyPackageEntitlements((query, params) => client.query(query, params), req.params.id);
      await client.query("COMMIT");
      res.json({ success: true, data: { companyId: req.params.id, tierIds: uniqueIds } });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Tier assignment update error:", error);
      res.status(500).json({ success: false, message: "Unable to update company tier assignments" });
    } finally {
      client.release();
    }
  });

  router.put("/superadmin/companies/:id/packages/:packageKey/assignment", async (req, res) => {
    if (typeof req.body?.active !== "boolean" ||
        !validOptionalDate(req.body?.starts_at) || !validOptionalDate(req.body?.expires_at) ||
        (req.body.starts_at && req.body.expires_at && Date.parse(req.body.expires_at) <= Date.parse(req.body.starts_at))) {
      return res.status(400).json({ success: false, message: "active and a valid entitlement interval are required" });
    }
    const company = await db("SELECT id FROM companies WHERE id=$1", [req.params.id]);
    if (!company.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
    const pkg = await db("SELECT id,package_key,allowed_companies FROM package_registry WHERE package_key=$1", [req.params.packageKey]);
    if (!pkg.rows.length) return res.status(404).json({ success: false, message: "Package not found" });
    if ((pkg.rows[0].allowed_companies || []).length && !pkg.rows[0].allowed_companies.includes(req.params.id)) {
      return res.status(400).json({ success: false, message: "Package is restricted for this company" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const sourceKey = `superadmin:${pkg.rows[0].id}`;
      if (req.body.active) {
        await client.query(
          `INSERT INTO company_package_entitlement_sources
           (company_id,package_id,source_type,source_key,active,starts_at,expires_at,metadata)
           VALUES($1,$2,'SUPERADMIN_ASSIGNMENT',$3,true,$4,$5,$6::jsonb)
           ON CONFLICT(company_id,package_id,source_type,source_key)
           DO UPDATE SET active=true,starts_at=EXCLUDED.starts_at,
             expires_at=EXCLUDED.expires_at,metadata=EXCLUDED.metadata`,
          [req.params.id, pkg.rows[0].id, sourceKey, req.body.starts_at || null,
            req.body.expires_at || null, JSON.stringify({ assignedBy: req.user.id })]
        );
      } else {
        await client.query(
          `DELETE FROM company_package_entitlement_sources
            WHERE company_id=$1 AND package_id=$2 AND source_type='SUPERADMIN_ASSIGNMENT' AND source_key=$3`,
          [req.params.id, pkg.rows[0].id, sourceKey]
        );
      }
      const effective = await reconcileCompanyPackageEntitlements((query, params) => client.query(query, params), req.params.id);
      await client.query("COMMIT");
      res.json({ success: true, data: { companyId: req.params.id, packageKey: pkg.rows[0].package_key, active: req.body.active, effective } });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Superadmin package assignment error:", error);
      res.status(500).json({ success: false, message: "Unable to update package assignment" });
    } finally {
      client.release();
    }
  });

  router.get("/superadmin/companies/:id/entitlement-sources", async (req, res) => {
    try {
      const data = await reconcileCompanyPackageEntitlements(db, req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      console.error("Package entitlement provenance load error:", error);
      res.status(500).json({ success: false, message: "Unable to load package entitlement sources" });
    }
  });

  return router;
}
