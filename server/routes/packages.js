import express from "express";

import { comparePackageVersions, provisionPackageMetadata, removePackageMetadata, resolveFeaturePlan, resolvePackagePlan, verifyPublicPackageRegistry } from "../services/packageRegistry.js";
import { executeTenantReleaseUpgrade } from "../services/appReleaseManager.js";

import { getCompanyEntitlements, isPackageLicensed } from "../services/licensing.js";

import { packageVersionHasEntitlement, reconcileCompanyPackageEntitlements } from "../services/packageEntitlements.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";
import { assertTrustedPackageManifest } from "../services/trustedPackages.js";



function operationKey(req) {

  const value = req.get("Idempotency-Key") || req.body?.idempotencyKey;

  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;

}



export default function createPackagesRouter({ authenticate, authorize, db, pool, writeAudit = null }) {

  const router = express.Router();

  const manage = [authenticate, authorize("package.manage", "settings.manage")];



  async function registry(dbCall) {

    const result = await dbCall(

      `SELECT p.*, m.module_key, m.installed AS module_installed

       FROM package_registry p LEFT JOIN platform_modules m ON m.id=p.module_id

       WHERE p.active=true ORDER BY p.name`

    );

    return result.rows;

  }



  async function packagePlan(packageKey) {

    const rows = await registry(db);

    const definitions = rows.map((row) => ({

      packageKey: row.package_key,

      name: row.name,

      version: row.version,

      description: row.description,

      moduleKey: row.module_key,

      package_type: row.package_type,
      billable: row.billable,
      licence_mode: row.licence_mode,
      licence_required: row.licence_mode !== "TECHNICAL" && row.manifest?.licenceRequired !== false,

      visible: row.visible,

      installable: row.installable,

      system_only: row.system_only,

      publication_state: row.publication_state,

      available_tiers: row.available_tiers || [],

      allowed_bundles: row.allowed_bundles || [],

      allowed_companies: row.allowed_companies || [],

      dependencies: row.manifest?.dependencies || [],

      manifest: row.manifest || {},

    }));

    return resolvePackagePlan(packageKey, definitions);

  }



  async function packageState(packageRows, companyId) {

    const installed = await db(

            `SELECT i.package_id, i.version, i.installed_version, i.target_version,
              i.update_status, i.update_error, i.last_update_at, i.auto_update_policy,
              i.status, i.selected_features, i.installation_type,
              i.deactivated_by_user, i.suspended_by_entitlement,
              i.available_version, i.installed_at

       FROM company_package_installations i

       JOIN package_registry p ON p.id=i.package_id

       WHERE i.company_id=$1`,

      [companyId]

    );

    const state = new Map(installed.rows.map((row) => [row.package_id, row]));

    return packageRows.map((row) => ({ ...row, company_installation: state.get(row.id) || null }));

  }



  async function ensureLicensed(req, packageEntries) {

    const entitlements = await getCompanyEntitlements(db, req.user.companyId);

    const entries = Array.isArray(packageEntries) ? packageEntries : [packageEntries];

    const root = entries[entries.length - 1];

    return isPackageLicensed(entitlements, root);

  }



  async function isMarketplaceEligible(companyId, entry) {

    const allowedCompanies = Array.isArray(entry.allowed_companies) ? entry.allowed_companies : [];

    const allowedBundles = Array.isArray(entry.allowed_bundles) ? entry.allowed_bundles : [];

    const availableTiers = Array.isArray(entry.available_tiers) ? entry.available_tiers : [];

    if (allowedCompanies.length && !allowedCompanies.includes(companyId)) return false;

    if (!allowedBundles.length && !availableTiers.length) return true;

    const result = await db(

      `SELECT

         ($2::text[]='{}' OR EXISTS (

           SELECT 1 FROM company_bundle_assignments a

           JOIN licence_bundles b ON b.id=a.bundle_id

           WHERE a.company_id=$1 AND a.active=true AND b.active=true AND b.bundle_key=ANY($2::text[])

             AND (a.starts_at IS NULL OR a.starts_at<=NOW())

             AND (a.expires_at IS NULL OR a.expires_at>NOW())

         )) AS bundle_allowed,

         ($3::text[]='{}' OR EXISTS (

           SELECT 1 FROM company_bundle_assignments a

           JOIN licence_bundles b ON b.id=a.bundle_id

           WHERE a.company_id=$1 AND a.active=true AND b.active=true AND b.bundle_key=ANY($3::text[])

             AND (a.starts_at IS NULL OR a.starts_at<=NOW())

             AND (a.expires_at IS NULL OR a.expires_at>NOW())

           UNION ALL

           SELECT 1 FROM company_tier_assignments a

           JOIN licence_tiers t ON t.id=a.tier_id

           WHERE a.company_id=$1 AND a.active=true AND t.active=true AND t.tier_key=ANY($3::text[])

             AND (a.starts_at IS NULL OR a.starts_at<=NOW())

             AND (a.expires_at IS NULL OR a.expires_at>NOW())

         )) AS tier_allowed`,

      [companyId, allowedBundles, availableTiers]

    );

    return result.rows[0]?.bundle_allowed === true && result.rows[0]?.tier_allowed === true;

  }

  async function marketplaceEligibilitySnapshot(companyId) {
    const [bundleResult, tierResult] = await Promise.all([
      db(
        `SELECT b.bundle_key
           FROM company_bundle_assignments a
           JOIN licence_bundles b ON b.id=a.bundle_id
          WHERE a.company_id=$1 AND a.active=true AND b.active=true
            AND (a.starts_at IS NULL OR a.starts_at<=NOW())
            AND (a.expires_at IS NULL OR a.expires_at>NOW())`,
        [companyId]
      ),
      db(
        `SELECT t.tier_key
           FROM company_tier_assignments a
           JOIN licence_tiers t ON t.id=a.tier_id
          WHERE a.company_id=$1 AND a.active=true AND t.active=true
            AND (a.starts_at IS NULL OR a.starts_at<=NOW())
            AND (a.expires_at IS NULL OR a.expires_at>NOW())`,
        [companyId]
      ),
    ]);
    return {
      bundleKeys: new Set(bundleResult.rows.map((row) => row.bundle_key)),
      tierKeys: new Set(tierResult.rows.map((row) => row.tier_key)),
    };
  }

  function marketplaceEligibleFromSnapshot(companyId, entry, snapshot) {
    const allowedCompanies = Array.isArray(entry.allowed_companies) ? entry.allowed_companies : [];
    const allowedBundles = Array.isArray(entry.allowed_bundles) ? entry.allowed_bundles : [];
    const availableTiers = Array.isArray(entry.available_tiers) ? entry.available_tiers : [];

    if (allowedCompanies.length && !allowedCompanies.includes(companyId)) return false;
    const bundleAllowed = !allowedBundles.length || allowedBundles.some((key) => snapshot.bundleKeys.has(key));
    // Preserve the existing eligibility semantics: available_tiers may be
    // satisfied by either a matching bundle key or an assigned tier key.
    const tierAllowed = !availableTiers.length || availableTiers.some(
      (key) => snapshot.bundleKeys.has(key) || snapshot.tierKeys.has(key)
    );
    return bundleAllowed && tierAllowed;
  }



  function packagePlanCompanyAllowed(companyId, plan) {

    return plan.every((entry) => {

      const allowed = Array.isArray(entry.allowed_companies) ? entry.allowed_companies : [];

      return !allowed.length || allowed.includes(companyId);

    });

  }



  async function replay(req, operation, packageKey) {

    const key = operationKey(req);

    if (!key) return null;

    const result = await db(

      "SELECT response FROM package_installation_operations WHERE company_id=$1 AND idempotency_key=$2 AND operation=$3 AND package_key=$4",

      [req.user.companyId, key, operation, packageKey]

    );

    return result.rows[0]?.response || null;

  }



  async function recordOperation(req, operation, packageKey, response) {

    const key = operationKey(req);

    if (!key) return;

    await db(

      `INSERT INTO package_installation_operations

       (company_id,idempotency_key,operation,package_key,status,response)

       VALUES ($1,$2,$3,$4,'completed',$5::jsonb)

       ON CONFLICT (company_id,idempotency_key,operation,package_key) DO NOTHING`,

      [req.user.companyId, key, operation, packageKey, JSON.stringify(response)]

    );

  }




  async function withTransaction(work) {

    if (!pool?.connect) return work(db);

    const client = await pool.connect();

    const txDb = (query, params = []) => client.query(query, params);

    try {

      await txDb("BEGIN");

      const result = await work(txDb);

      await txDb("COMMIT");

      return result;

    } catch (error) {

      try {

        await txDb("ROLLBACK");

      } catch (rollbackError) {

        console.error("Package transaction rollback failed:", rollbackError);

      }

      throw error;

    } finally {

      client.release();

    }

  }



  router.get(["/packages", "/platform/packages"], ...manage, async (req, res) => {

    const rows = await registry(db);

    res.json({ success: true, data: await packageState(rows, req.user.companyId) });

  });



  router.get("/packages/marketplace", authenticate, async (req, res) => {
    try {
      const registryHealth = await verifyPublicPackageRegistry(db);
      if (!registryHealth.healthy) {
        return res.status(503).json({
          success: false,
          code: "PACKAGE_REGISTRY_STALE",
          message: "oneStore catalogue is updating. Please retry shortly.",
          registry: registryHealth,
        });
      }


      const result = await db(
        `SELECT p.*, m.module_key,
                osa.id AS onestore_app_id,
                osa.name AS onestore_name,
                osa.version AS onestore_version,
                osa.description AS onestore_description,
                osa.svg AS onestore_svg,
                osa.landing_route AS onestore_landing_route,
                osa.category AS onestore_category,
                osa.publisher AS onestore_publisher,
                osa.active AS onestore_active,
                osa.visible AS onestore_visible,
                osa.installable AS onestore_installable,
                osa.display_order AS onestore_display_order,
                ta.id AS tenant_app_record_id,
                ta.status AS tenant_app_status,
                ta.installed_version AS tenant_app_installed_version,
                ta.available_version AS tenant_app_available_version,
                ta.licence_status AS tenant_app_licence_status,
                ta.trial_started_at AS tenant_app_trial_started_at,
                ta.trial_expires_at AS tenant_app_trial_expires_at,
                ta.update_status AS tenant_app_update_status
           FROM package_registry p
           LEFT JOIN platform_modules m ON m.id=p.module_id
           LEFT JOIN onestore_apps osa ON osa.app_key=p.package_key
           LEFT JOIN tenant_apps ta ON ta.onestore_app_id=osa.id AND ta.company_id=$1
          WHERE p.publication_state='PUBLISHED'
            AND p.visible=true AND p.system_only=false
            AND (cardinality(p.allowed_companies)=0 OR $1=ANY(p.allowed_companies))
          ORDER BY p.display_order,p.name`,
        [req.user.companyId]
      );

      const [packages, entitlements, requests, trials, eligibilitySnapshot] = await Promise.all([
        packageState(result.rows, req.user.companyId),
        getCompanyEntitlements(db, req.user.companyId),
        db("SELECT package_key,status FROM platform_licence_requests WHERE company_id=$1 AND status='PENDING'", [req.user.companyId]),
        db(`SELECT p.package_key,t.activated_at,t.expires_at
              FROM company_package_trials t
              JOIN package_registry p ON p.id=t.package_id
             WHERE t.company_id=$1`, [req.user.companyId]),
        marketplaceEligibilitySnapshot(req.user.companyId),
      ]);

      const pendingRequests = new Set(requests.rows.map((row) => row.package_key));
      const trialByPackage = new Map(trials.rows.map((row) => [row.package_key, row]));
      res.json({
        success: true,
        data: packages.map((item) => {
          const licensed = isPackageLicensed(entitlements, {
            ...item,
            licence_required: item.licence_mode !== "TECHNICAL" && item.manifest?.licenceRequired !== false,
          });
          const marketplaceEligible = marketplaceEligibleFromSnapshot(req.user.companyId, item, eligibilitySnapshot);
          const tenantStatus = String(item.tenant_app_status || "AVAILABLE").toUpperCase();
          const tenantLicence = String(item.tenant_app_licence_status || "NONE").toUpperCase();
          const tenantLicensed = ["LICENSED","TRIAL"].includes(tenantLicence) || licensed;
          const storefrontState = item.active !== true
            ? "UNAVAILABLE"
            : item.installable !== true
              ? "NOT_INSTALLABLE"
              : !tenantLicensed || !marketplaceEligible
                ? "LICENCE_REQUIRED"
                : tenantStatus === "ACTIVE"
                  ? "INSTALLED"
                  : tenantStatus === "INACTIVE"
                    ? "INACTIVE"
                    : tenantStatus === "INSTALLED"
                      ? "INSTALLED"
                      : "AVAILABLE";
          const priorTrial = trialByPackage.get(item.package_key) || null;
          const trialAvailable =
            item.licence_mode !== "TECHNICAL" &&
            item.installable === true &&
            item.active === true &&
            licensed !== true &&
            !priorTrial;
          return {
            ...item,
            name: item.onestore_name || item.name,
            version: item.onestore_version || item.version,
            description: item.onestore_description ?? item.description,
            svg: item.onestore_svg || null,
            landing_route: item.onestore_landing_route || null,
            category: item.onestore_category || item.category,
            publisher: item.onestore_publisher || item.publisher,
            active: item.onestore_active ?? item.active,
            visible: item.onestore_visible ?? item.visible,
            installable: item.onestore_installable ?? item.installable,
            display_order: item.onestore_display_order ?? item.display_order,
            licensed: tenantLicensed,
            licence_request_status: item.tenant_app_licence_status === "REQUESTED" || pendingRequests.has(item.package_key) ? "PENDING" : null,
            storefront_state: storefrontState,
            lifecycle_status: tenantStatus,
            is_installed: ["INSTALLED","ACTIVE","INACTIVE"].includes(tenantStatus),
            launchable: tenantStatus === "ACTIVE" && Boolean(item.onestore_landing_route || item.landing_route || item.manifest?.landingRoute || item.manifest?.route),
            update_display_status: String(item.tenant_app_update_status || "CURRENT").toUpperCase(),
            can_install: storefrontState === "AVAILABLE",
            trial_available: trialAvailable,
            trial_days: 7,
            trial_activated_at: priorTrial?.activated_at || null,
            trial_expires_at: priorTrial?.expires_at || null,
          };
        }),
      });
    } catch (error) {
      console.error("Marketplace catalogue error:", error);
      res.status(500).json({ success: false, message: error.message || "Unable to load oneStore catalogue" });
    }
  });



  router.post("/packages/:packageKey/activate-trial", ...manage, async (req, res) => {
    const packageKey = req.params.packageKey;
    try {
      const packageResult = await db(
        `SELECT id,package_key,name,licence_mode,installable,visible,system_only,publication_state,active
           FROM package_registry
          WHERE package_key=$1 AND active=true
          LIMIT 1`,
        [packageKey]
      );
      const pkg = packageResult.rows[0];
      if (!pkg || pkg.visible !== true || pkg.system_only === true || pkg.publication_state !== "PUBLISHED") {
        return res.status(404).json({ success: false, message: "Package is not available in oneStore" });
      }
      if (pkg.installable !== true || pkg.licence_mode === "TECHNICAL") {
        return res.status(400).json({ success: false, message: "This package is not eligible for a free trial" });
      }

      const alreadyUsed = await db(
        "SELECT activated_at,expires_at FROM company_package_trials WHERE company_id=$1 AND package_id=$2 LIMIT 1",
        [req.user.companyId, pkg.id]
      );
      if (alreadyUsed.rows[0]) {
        return res.status(409).json({
          success: false,
          code: "TRIAL_ALREADY_USED",
          message: "The free trial for this app has already been used",
          data: alreadyUsed.rows[0],
        });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const created = await withTransaction(async (txDb) => {
        const trial = await txDb(
          `INSERT INTO company_package_trials
             (company_id,package_id,activated_by,activated_at,expires_at)
           VALUES ($1,$2,$3,NOW(),$4)
           RETURNING activated_at,expires_at`,
          [req.user.companyId, pkg.id, req.user.id || null, expiresAt]
        );
        await txDb(
          `INSERT INTO company_package_entitlement_sources
             (company_id,package_id,source_type,source_key,active,starts_at,expires_at,metadata)
           VALUES ($1,$2,'DIRECT_LICENCE',$3,true,NOW(),$4,$5::jsonb)
           ON CONFLICT (company_id,package_id,source_type,source_key)
           DO UPDATE SET active=true,starts_at=NOW(),expires_at=EXCLUDED.expires_at,metadata=EXCLUDED.metadata`,
          [
            req.user.companyId,
            pkg.id,
            `trial:${req.user.companyId}:${pkg.package_key}`,
            expiresAt,
            JSON.stringify({ trial: true, days: 7, activatedBy: req.user.id || null }),
          ]
        );
        return trial.rows[0];
      });

      res.status(201).json({
        success: true,
        message: "7-day free trial activated",
        data: { packageKey: pkg.package_key, ...created },
      });
    } catch (error) {
      console.error("Package trial activation error:", error);
      res.status(400).json({ success: false, message: error.message || "Unable to activate free trial" });
    }
  });

  router.post("/packages/:packageKey/request-licence", authenticate, authorize("package.manage", "settings.manage"), async (req, res) => {
    try {
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: "action:LICENCE_REQUEST_PACKAGE",
        req,
        input: { packageKey: req.params.packageKey },
        writeAudit,
        source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "LICENCE_REQUEST_PACKAGE" },
        extraContext: { pool },
      });
      const result = execution.result;
      res.status(result?.duplicate ? 200 : 201).json({ success: true, data: result });
    } catch (error) {
      res.status(error.status || 400).json({ success: false, message: error.message || "Unable to request licence" });
    }
  });

  router.get(["/bundles/marketplace", "/marketplace/bundles"], authenticate, async (req, res) => {

    const result = await db(

      `SELECT b.*,

              COALESCE(jsonb_agg(jsonb_build_object(

                'packageKey',p.package_key,'name',p.name,'entitlementType',bp.entitlement_type,

                'versionRange',bp.version_range

              ) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS packages

         FROM licence_bundles b

         LEFT JOIN licence_bundle_packages bp ON bp.bundle_id=b.id

         LEFT JOIN package_registry p ON p.id=bp.package_id

        WHERE b.active=true AND b.visible=true AND b.installable=true

          AND (cardinality(b.allowed_companies)=0 OR $1=ANY(b.allowed_companies))

          AND (cardinality(b.available_tiers)=0 OR EXISTS (

            SELECT 1 FROM company_tier_assignments a

            JOIN licence_tiers t ON t.id=a.tier_id

            WHERE a.company_id=$1 AND a.active=true AND t.active=true

              AND t.tier_key=ANY(b.available_tiers)

              AND (a.starts_at IS NULL OR a.starts_at<=NOW())

              AND (a.expires_at IS NULL OR a.expires_at>NOW())

          ))

        GROUP BY b.id ORDER BY b.display_order,b.name`,

      [req.user.companyId]

    );

    res.json({ success: true, data: result.rows });

  });



  router.get(["/tiers/marketplace", "/marketplace/tiers"], authenticate, async (req, res) => {

    const result = await db(

      `SELECT t.*,

              COALESCE(jsonb_agg(jsonb_build_object(

                'packageKey',p.package_key,'name',p.name,'entitlementType',tp.entitlement_type,

                'versionRange',tp.version_range

              ) ORDER BY p.name) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS packages

         FROM licence_tiers t

         LEFT JOIN licence_tier_packages tp ON tp.tier_id=t.id

         LEFT JOIN package_registry p ON p.id=tp.package_id

        WHERE t.active=true AND t.visible=true AND t.installable=true

          AND (cardinality(t.allowed_companies)=0 OR $1=ANY(t.allowed_companies))

        GROUP BY t.id ORDER BY t.display_order,t.name`,

      [req.user.companyId]

    );

    res.json({ success: true, data: result.rows });

  });



  async function sendPlan(req, res, packageKey) {

    if (!packageKey) return res.status(400).json({ success: false, message: "packageKey is required" });

    try {

      const plan = await packagePlan(packageKey);

      const requestedFeatures = Array.isArray(req.body?.features) ? req.body.features : [];

      const root = plan[plan.length - 1];

      if (!packagePlanCompanyAllowed(req.user.companyId, plan)) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "A required package is not available to this company" });

      }

      if (!(await isMarketplaceEligible(req.user.companyId, root))) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "This package is not available to this company" });

      }

      const selectedFeatures = resolveFeaturePlan(root, requestedFeatures);

      for (const item of plan) assertTrustedPackageManifest(item.packageKey, item.manifest, item.version);

      if (!(await ensureLicensed(req, plan))) {

        return res.status(403).json({ success: false, code: "FEATURE_NOT_LICENSED", message: "This package is not licensed for this company" });

      }

      res.json({ success: true, data: { packageKey, packages: plan, features: selectedFeatures.map((feature) => feature.key) } });

    } catch (error) {

      res.status(400).json({ success: false, message: error.message });

    }

  }



  router.post(["/packages/plan", "/platform/packages/plan"], ...manage, async (req, res) => {

    return sendPlan(req, res, String(req.body?.packageKey || req.body?.package_key || "").trim());

  });



  router.get(["/packages/:packageKey/plan", "/platform/packages/:packageKey/plan"], ...manage, async (req, res) => {

    return sendPlan(req, res, req.params.packageKey);

  });



  router.post(["/packages/:packageKey/upgrade", "/platform/packages/:packageKey/upgrade"], ...manage, async (req, res) => {

    const packageKey = req.params.packageKey;

    let failedUpgrade = null;

    try {

      const plan = await packagePlan(packageKey);

      if (!packagePlanCompanyAllowed(req.user.companyId, plan)) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "A required package is not available to this company" });

      }

      if (!(await ensureLicensed(req, plan))) {

        return res.status(403).json({ success: false, code: "FEATURE_NOT_LICENSED", message: "This package is not licensed for this company" });

      }

      for (const item of plan) assertTrustedPackageManifest(item.packageKey, item.manifest, item.version);

      const results = await withTransaction(async (txDb) => {

        await reconcileCompanyPackageEntitlements(txDb, req.user.companyId);

        const upgraded = [];

        for (const item of plan) {

          const packageResult = await txDb(

            `SELECT p.id,p.version,p.module_id,p.manifest,i.version AS installed_version,i.status

               FROM package_registry p

               LEFT JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=$2

              WHERE p.package_key=$1 AND p.active=true`,

            [item.packageKey, req.user.companyId]

          );

          const entry = packageResult.rows[0];

          if (!entry) throw new Error(`Package dependency is unavailable or not installed: ${item.packageKey}`);

          if (!entry.installed_version || entry.status !== "active") {

            throw new Error(`Install required package dependency before upgrading: ${item.packageKey}`);

          }

          if (!(await packageVersionHasEntitlement(txDb, req.user.companyId, item.packageKey, entry.version))) {

            throw new Error(`Package version is outside the active licence or bundle constraint: ${item.packageKey}`);

          }

          const comparison = comparePackageVersions(entry.version, entry.installed_version);

          if (comparison < 0) throw new Error(`Package version downgrade is not supported: ${item.packageKey}`);

          if (comparison === 0) continue;

          failedUpgrade = {
            packageId: entry.id,
            fromVersion: entry.installed_version,
            toVersion: entry.version,
            releaseId: null,
          };

          const publishedRelease = await txDb(
            `SELECT id FROM package_releases
              WHERE package_key=$1 AND version=$2 AND status='PUBLISHED'
              ORDER BY published_at DESC NULLS LAST LIMIT 1`,
            [item.packageKey, entry.version]
          );

          if (publishedRelease.rows?.[0]?.id) {
            failedUpgrade.releaseId = publishedRelease.rows[0].id;
            const outcome = await executeTenantReleaseUpgrade({
              db: txDb,
              releaseId: publishedRelease.rows[0].id,
              companyId: req.user.companyId,
              packageKey: item.packageKey,
              userId: req.user.id || null,
            });
            if (outcome.status !== "CURRENT") throw new Error("Package release upgrade failed");
            upgraded.push({ packageKey: item.packageKey, from: outcome.previousVersion, to: outcome.installedVersion });
            continue;
          }

          failedUpgrade = {

            packageId: entry.id,

            fromVersion: entry.installed_version,

            toVersion: entry.version,

          };

          const history = await txDb(

            `INSERT INTO package_upgrade_history

             (company_id,package_id,from_version,to_version,status,created_by)

             VALUES ($1,$2,$3,$4,'RUNNING',$5) RETURNING id`,

            [req.user.companyId, entry.id, entry.installed_version, entry.version, req.user.id || null]

          );

          await provisionPackageMetadata(txDb, {

            packageId: entry.id,

            moduleId: entry.module_id,

            companyId: req.user.companyId,

            manifest: item.manifest,

            packageVersion: entry.version,


          });

          for (const migration of Array.isArray(item.manifest?.migrations) ? item.manifest.migrations : []) {

            const migrationKey = typeof migration === "string" ? migration : migration?.key;

            if (!migrationKey || !/^[a-zA-Z0-9\_.:-]{1,200}$/.test(migrationKey)) {

              throw new Error(`Invalid migration key for package: ${item.packageKey}`);

            }

            await txDb(

              `INSERT INTO package_installation_versions (company_id,package_id,version,migration_key,applied_by)

               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (company_id,package_id,version,migration_key) DO NOTHING`,

              [req.user.companyId, entry.id, entry.version, migrationKey, req.user.id || null]

            );

          }

          await txDb(

            `UPDATE company_package_installations

              SET version=$1,installed_version=$1,target_version=$1,available_version=$1,
                update_status='CURRENT',update_error=NULL,last_update_at=NOW(),
                last_upgrade_at=NOW(),last_upgrade_state='COMPLETED',updated_at=NOW()

              WHERE company_id=$2 AND package_id=$3`,

            [entry.version, req.user.companyId, entry.id]

          );

          await txDb(

            "UPDATE package_upgrade_history SET status='COMPLETED',completed_at=NOW() WHERE id=$1",

            [history.rows[0].id]

          );

          upgraded.push({ packageKey: item.packageKey, from: entry.installed_version, to: entry.version });

        }

        await reconcileCompanyPackageEntitlements(txDb, req.user.companyId);

        await txDb(

          `INSERT INTO platform_events(company_id,event_type,payload,actor_user_id,idempotency_key)

           VALUES ($1,'package.upgraded',$2::jsonb,$3,$4) ON CONFLICT(company_id,idempotency_key) DO NOTHING`,

          [req.user.companyId, JSON.stringify({ packageKey, upgraded }), req.user.id || null, `package-upgraded:${packageKey}:${upgraded.map((item) => item.to).join(",") || "current"}`]

        );

        return { success: true, data: { packageKey, upgraded } };

      });

      failedUpgrade = null;

      res.json(results);

    } catch (error) {

      if (failedUpgrade) {
        const safeFailure = failedUpgrade.releaseId ? "Release upgrade failed." : String(error.message || error).slice(0, 2000);

        await db(

          `INSERT INTO package_upgrade_history

           (company_id,package_id,from_version,to_version,status,error_text,completed_at,created_by)

           VALUES ($1,$2,$3,$4,'FAILED',$5,NOW(),$6)`,

          [req.user.companyId, failedUpgrade.packageId, failedUpgrade.fromVersion, failedUpgrade.toVersion, safeFailure, req.user.id || null]

        ).catch((historyError) => console.error("Package upgrade failure history write failed:", historyError.message));

        if (failedUpgrade.releaseId) {
          await db(
            `UPDATE company_package_installations
                SET update_status='FAILED',update_error='Release upgrade failed.',updated_at=NOW()
              WHERE company_id=$1 AND package_id=$2`,
            [req.user.companyId, failedUpgrade.packageId]
          ).catch((stateError) => console.error("Package release failure state write failed:", stateError.message));
          if (typeof writeAudit?.object === "function") {
            await writeAudit.object({
              companyId: req.user.companyId,
              userId: req.user.id || null,
              action: "release.tenant.failed",
              entityType: "package_release",
              entityId: failedUpgrade.releaseId,
              result: "failure",
              metadata: { packageKey, errorCode: "RELEASE_UPGRADE_FAILED" },
            }).catch((auditError) => console.error("Package release failure audit write failed:", auditError.message));
          }
        }

      }

      console.error("Package upgrade error:", error);

      res.status(400).json({ success: false, message: error.message || "Package upgrade failed" });

    }

  });



  router.post(["/packages/:packageKey/install", "/platform/packages/:packageKey/install"], ...manage, async (req, res) => {

    const packageKey = req.params.packageKey;

    try {

      const prior = await replay(req, "install", packageKey);

      if (prior) return res.json(prior);

      const plan = await packagePlan(packageKey);

      const requestedFeatures = Array.isArray(req.body?.features) ? req.body.features : [];

      const storeId = req.body?.storeId || req.body?.store_id || null;

      if (storeId) {

        const store = await db(

          "SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true",

          [storeId, req.user.companyId]

        );

        if (!store.rows.length) {

          return res.status(400).json({ success: false, message: "Store is not available to this company" });

        }

      }

      const root = plan[plan.length - 1];

      if (!packagePlanCompanyAllowed(req.user.companyId, plan)) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "A required package is not available to this company" });

      }

      if (!(await isMarketplaceEligible(req.user.companyId, root))) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "This package is not available to this company" });

      }

      const selectedFeatures = resolveFeaturePlan(root, requestedFeatures);

      for (const item of plan) assertTrustedPackageManifest(item.packageKey, item.manifest, item.version);

      if (!(await ensureLicensed(req, plan))) {

        return res.status(403).json({ success: false, code: "FEATURE_NOT_LICENSED", message: "This package is not licensed for this company" });

      }

      const response = await withTransaction(async (txDb) => {

        // Installing one package must only provision that package and its
        // resolved dependency plan. A global entitlement reconcile here used
        // to provision every licensed package, so an unrelated legacy metadata
        // conflict (for example Customer Core) could roll back a Product lookup
        // connector install. Licence reconciliation belongs to licence/bundle/
        // tier changes; this explicit install flow owns its own package plan.
        const rootPackageResult = await txDb(

          "SELECT id,version FROM package_registry WHERE package_key=$1 AND active=true",

          [root.packageKey]

        );

        if (!rootPackageResult.rows.length) throw new Error(`Package not found: ${root.packageKey}`);

        const rootPackageId = rootPackageResult.rows[0].id;

        for (const item of plan) {

          const moduleResult = await txDb("SELECT id FROM platform_modules WHERE module_key=$1", [item.moduleKey]);

          if (!moduleResult.rows.length) throw new Error(`Package module is not registered: ${item.moduleKey}`);

          const packageResult = await txDb(
            `SELECT id,version,installable FROM package_registry WHERE package_key=$1 AND active=true`,
            [item.packageKey]
          );
          if (!packageResult.rows.length) {
            throw new Error(`Package not found: ${item.packageKey}`);
          }

          if (packageResult.rows[0].installable === false) {
            throw new Error(`Package is not installable: ${item.packageKey}`);
          }

          if (
            item.packageKey === root.packageKey &&
            (
              item.installable === false ||
              item.visible === false ||
              item.system_only === true ||
              (item.publication_state && item.publication_state !== "PUBLISHED")
            )
          ) {
            throw new Error(`Package is not available for direct installation: ${item.packageKey}`);
          }

          if (
            !(await packageVersionHasEntitlement(
              txDb,
              req.user.companyId,
              item.packageKey,
              packageResult.rows[0].version
            ))
          ) {
            throw new Error(
              `Package version is outside the active licence or bundle constraint: ${item.packageKey}`
            );
          }

          await provisionPackageMetadata(txDb, {

            packageId: packageResult.rows[0].id,

            moduleId: moduleResult.rows[0].id,

            companyId: req.user.companyId,

            manifest: item.manifest,

            packageVersion: packageResult.rows[0].version,

          });

          await txDb(

          `INSERT INTO company_package_installations (company_id,package_id,version,status,installed_by,selected_features)

           VALUES ($1,$2,$3,'active',$4,$5::jsonb)

           ON CONFLICT (company_id,package_id) DO UPDATE SET status='active',

             selected_features=CASE WHEN EXCLUDED.version = company_package_installations.version THEN EXCLUDED.selected_features ELSE COALESCE(company_package_installations.selected_features,'[]'::jsonb) END,

             installed_by=COALESCE(EXCLUDED.installed_by,company_package_installations.installed_by),

             installation_type=CASE WHEN $6='DIRECT' THEN 'DIRECT' ELSE company_package_installations.installation_type END,
             available_version=CASE WHEN $6='DIRECT' THEN EXCLUDED.version ELSE company_package_installations.available_version END,
             suspended_by_entitlement=false,
             deactivated_by_user=false,
             updated_at=NOW()`,

          [

            req.user.companyId,

            packageResult.rows[0].id,

            packageResult.rows[0].version,

            req.user.id || null,

            JSON.stringify(item === root ? selectedFeatures.map((feature) => feature.key) : []),

            item === root ? "DIRECT" : "DEPENDENCY",

          ]

          );

          await txDb(

            `INSERT INTO company_package_entitlement_sources

             (company_id,package_id,source_type,source_key,parent_package_id,active,metadata)

             VALUES ($1,$2,$3,$4,$5,true,$6::jsonb)

             ON CONFLICT (company_id,package_id,source_type,source_key)

             DO UPDATE SET active=true,metadata=EXCLUDED.metadata,expires_at=NULL`,

            [

              req.user.companyId,

              packageResult.rows[0].id,

              item.packageKey === root.packageKey

                ? (item.manifest?.licenceMode === "TECHNICAL" || item.manifest?.packageType === "FOUNDATION"

                  ? "DIRECT_INSTALL"

                  : "DIRECT_LICENCE")

                : "REQUIRED_DEPENDENCY",

              String(rootPackageId),

              item.packageKey === root.packageKey ? null : rootPackageId,

              JSON.stringify({ rootPackageKey: root.packageKey }),

            ]

          );

          const migrations = Array.isArray(item.manifest?.migrations) ? item.manifest.migrations : [];

          for (const migration of migrations) {

            const migrationKey = typeof migration === "string" ? migration : migration?.key;

            if (!migrationKey || !/^[a-zA-Z0-9\_.:-]{1,200}$/.test(migrationKey)) {

              throw new Error(`Invalid migration key for package: ${item.packageKey}`);

            }

            await txDb(

              `INSERT INTO package_installation_versions

               (company_id,package_id,version,migration_key,applied_by)

               VALUES ($1,$2,$3,$4,$5)

               ON CONFLICT (company_id,package_id,version,migration_key) DO NOTHING`,

              [req.user.companyId, packageResult.rows[0].id, packageResult.rows[0].version, migrationKey, req.user.id || null]

            );

          }

          await txDb(

          `UPDATE platform_module_access SET enabled=true,updated_at=NOW()

           WHERE module_id=$1 AND company_id=$2 AND store_id IS NOT DISTINCT FROM $3`,

          [moduleResult.rows[0].id, req.user.companyId, storeId]

          );

          const access = await txDb(

          "SELECT id FROM platform_module_access WHERE module_id=$1 AND company_id=$2 AND store_id IS NOT DISTINCT FROM $3",

          [moduleResult.rows[0].id, req.user.companyId, storeId]

          );

          if (!access.rows.length) {

            await txDb(

            `INSERT INTO platform_module_access (module_id,company_id,store_id,enabled)

             VALUES ($1,$2,$3,true)`,

            [moduleResult.rows[0].id, req.user.companyId, storeId]

            );

          }

        }

        return { success: true, data: { packageKey, storeId, installed: plan.map((item) => item.packageKey), features: selectedFeatures.map((feature) => feature.key) } };

      });

      await recordOperation(req, "install", packageKey, response);

      res.json(response);

    } catch (error) {

      console.error("Package install error:", error);

      res.status(400).json({ success: false, message: error.message });

    }

  });



  router.post(["/packages/:packageKey/deactivate", "/platform/packages/:packageKey/deactivate"], ...manage, async (req, res) => {

    const packageKey = req.params.packageKey;

    try {

      const prior = await replay(req, "deactivate", packageKey);

      if (prior) return res.json(prior);

      const dependents = await db(

        `SELECT p.package_key FROM company_package_installations i

         JOIN package_dependencies d ON d.package_id=i.package_id

         JOIN package_registry p ON p.id=i.package_id

         JOIN package_registry target ON target.id=d.dependency_id

         WHERE target.package_key=$1 AND i.company_id=$2 AND i.status='active' AND d.optional=false`,

        [packageKey, req.user.companyId]

      );

      if (dependents.rows.length) {

        return res.status(409).json({

          success: false,

          message: "Package is required by an installed package",

          dependents: dependents.rows.map((row) => row.package_key),

        });

      }

      const result = await db(

        `UPDATE company_package_installations i

            SET status='inactive',deactivated_by_user=true,suspended_by_entitlement=false,updated_at=NOW()

         FROM package_registry p WHERE p.id=i.package_id AND p.package_key=$1 AND i.company_id=$2 RETURNING i.*`,

        [packageKey, req.user.companyId]

      );

      if (!result.rows.length) return res.status(404).json({ success: false, message: "Package is not installed for this company" });

      await reconcileCompanyPackageEntitlements(db, req.user.companyId);

      await db(

        `UPDATE platform_module_access a SET enabled=false,updated_at=NOW()

         FROM package_registry p

         WHERE p.package_key=$1 AND a.module_id=p.module_id AND a.company_id=$2`,

        [packageKey, req.user.companyId]

      );

      const response = { success: true, data: result.rows[0] };

      await recordOperation(req, "deactivate", packageKey, response);

      res.json(response);

    } catch (error) {

      console.error("Package deactivation error:", error);

      res.status(400).json({ success: false, message: error.message });

    }

  });



  router.post(["/packages/:packageKey/reactivate", "/platform/packages/:packageKey/reactivate"], ...manage, async (req, res) => {

    const packageKey = req.params.packageKey;

    try {

      const plan = await packagePlan(packageKey);
      const root = plan[plan.length - 1];

      if (
        root.installable === false || root.visible === false || root.system_only === true ||
        (root.publication_state && root.publication_state !== "PUBLISHED") ||
        !(await isMarketplaceEligible(req.user.companyId, root))
      ) {
        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "This package cannot be activated for this company" });
      }

      if (!packagePlanCompanyAllowed(req.user.companyId, plan)) {

        return res.status(403).json({ success: false, code: "PACKAGE_NOT_AVAILABLE", message: "A required package is not available to this company" });

      }

      if (!(await ensureLicensed(req, plan))) {

        return res.status(403).json({ success: false, code: "FEATURE_NOT_LICENSED", message: "This package is not licensed for this company" });

      }

      const result = await withTransaction(async (txDb) => {
        const reactivated = [];
        for (const item of plan) {
          const packageResult = await txDb(
            `SELECT p.id,p.module_id,i.status,i.deactivated_by_user
               FROM package_registry p
               LEFT JOIN company_package_installations i
                 ON i.package_id=p.id AND i.company_id=$2
              WHERE p.package_key=$1 AND p.active=true`,
            [item.packageKey, req.user.companyId]
          );
          const entry = packageResult.rows[0];
          if (!entry || !entry.status) {
            throw new Error(`Install required package dependency before reactivating: ${item.packageKey}`);
          }
          if (item.packageKey !== root.packageKey && entry.status !== "active" && entry.deactivated_by_user === true) {
            throw new Error(`Required dependency was explicitly deactivated: ${item.packageKey}`);
          }
          if (entry.status !== "active") {
            await txDb(
              `UPDATE company_package_installations
                  SET status='active',deactivated_by_user=false,suspended_by_entitlement=false,updated_at=NOW()
                WHERE company_id=$1 AND package_id=$2`,
              [req.user.companyId, entry.id]
            );
            reactivated.push(item.packageKey);
          }
          if (entry.module_id) {
            await txDb(
              `UPDATE platform_module_access
                  SET enabled=true,updated_at=NOW()
                WHERE module_id=$1 AND company_id=$2`,
              [entry.module_id, req.user.companyId]
            );
          }
        }
        await reconcileCompanyPackageEntitlements(txDb, req.user.companyId);
        const rootResult = await txDb(
          `SELECT i.* FROM company_package_installations i
             JOIN package_registry p ON p.id=i.package_id
            WHERE p.package_key=$1 AND i.company_id=$2`,
          [packageKey, req.user.companyId]
        );
        return { installation: rootResult.rows[0], reactivated };
      });

      res.json({ success: true, data: result.installation, reactivated: result.reactivated });

    } catch (error) {

      console.error("Package reactivation error:", error);

      res.status(400).json({ success: false, message: error.message });

    }

  });



  router.post(["/packages/:packageKey/uninstall", "/platform/packages/:packageKey/uninstall"], ...manage, async (req, res) => {

    const packageKey = req.params.packageKey;

    try {

      const prior = await replay(req, "uninstall", packageKey);

      if (prior) return res.json(prior);

      const packageResult = await db(
        "SELECT id,module_id FROM package_registry WHERE package_key=$1 AND active=true",
        [packageKey]
      );

      if (!packageResult.rows.length) {
        return res.status(404).json({ success: false, message: "Package not found" });
      }

      const packageRow = packageResult.rows[0];

      const installation = await db(
        `SELECT i.* FROM company_package_installations i
          WHERE i.package_id=$1 AND i.company_id=$2`,
        [packageRow.id, req.user.companyId]
      );

      if (!installation.rows.length) {
        return res.status(404).json({ success: false, message: "Package is not installed for this company" });
      }

      const dependents = await db(
        `SELECT DISTINCT p.package_key
           FROM company_package_installations i
           JOIN package_dependencies d ON d.package_id=i.package_id
           JOIN package_registry p ON p.id=i.package_id
          WHERE d.dependency_id=$1
            AND i.company_id=$2
            AND i.status='active'
            AND d.optional=false`,
        [packageRow.id, req.user.companyId]
      );

      if (dependents.rows.length) {
        return res.status(409).json({
          success: false,
          code: "PACKAGE_REQUIRED",
          message: "Package is required by an installed package",
          dependents: dependents.rows.map((row) => row.package_key),
        });
      }

      /*
       * Uninstall is intentionally non-destructive.
       * Package-owned business data, connector configuration and tenant metadata
       * remain in place so a later reinstall can reuse the previous state.
       * The package is removed only from the active application surface/runtime.
       */
      const result = await db(
        `UPDATE company_package_installations i
            SET status='inactive',
                deactivated_by_user=true,
                suspended_by_entitlement=false,
                updated_at=NOW()
          WHERE i.package_id=$1 AND i.company_id=$2
          RETURNING i.*`,
        [packageRow.id, req.user.companyId]
      );

      if (packageRow.module_id) {
        await db(
          `UPDATE platform_module_access
              SET enabled=false,updated_at=NOW()
            WHERE module_id=$1 AND company_id=$2`,
          [packageRow.module_id, req.user.companyId]
        );
      }

      await db(
        `UPDATE company_package_entitlement_sources
            SET active=false,updated_at=NOW()
          WHERE company_id=$1
            AND package_id=$2
            AND source_type='DIRECT_INSTALL'`,
        [req.user.companyId, packageRow.id]
      );

      await reconcileCompanyPackageEntitlements(db, req.user.companyId);

      const response = {
        success: true,
        data: {
          ...result.rows[0],
          dataPreserved: true,
          reinstallSupported: true,
        },
      };

      await recordOperation(req, "uninstall", packageKey, response);
      await writeAudit?.(
        req.user.companyId,
        req.user.id,
        "package.uninstalled",
        "package",
        packageRow.id,
        { packageKey, dataPreserved: true }
      );

      res.json(response);

    } catch (error) {

      console.error("Package uninstall error:", error);
      res.status(400).json({ success: false, message: error.message });

    }

  });


  return router;

}
