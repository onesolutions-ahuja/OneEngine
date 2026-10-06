import express from "express";

import { comparePackageVersions, provisionPackageMetadata, removePackageMetadata, resolveFeaturePlan, resolvePackagePlan, verifyPublicPackageRegistry } from "../services/packageRegistry.js";
import { executeTenantReleaseUpgrade } from "../services/appReleaseManager.js";

import { getCompanyEntitlements, isPackageLicensed } from "../services/licensing.js";

import { packageVersionHasEntitlement, reconcileCompanyPackageEntitlements } from "../services/packageEntitlements.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";
import { executeWorkflowActions } from "../services/platformWorkflow.js";
import { assertTrustedPackageManifest } from "../services/trustedPackages.js";
import { permissionAllows } from "../services/authorization.js";



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



  router.get("/packages/runtime-navigation", authenticate, async (req, res) => {
    try {
      const [rows, entitlements, permissionResult] = await Promise.all([
        registry(db).then((entries) => packageState(entries, req.user.companyId)),
        getCompanyEntitlements(db, req.user.companyId),
        db(
          `SELECT p.code
             FROM role_permissions rp
             JOIN permissions p ON p.id=rp.permission_id
            WHERE rp.role_id=$1`,
          [req.user.roleId]
        ),
      ]);
      const permissions = permissionResult.rows.map((row) => row.code);
      const data = rows
        .filter((item) => String(item.publication_state || "").toUpperCase() === "PUBLISHED")
        .filter((item) => String(item.company_installation?.status || "").toLowerCase() === "active")
        .filter((item) => permissionAllows({
          permissions,
          requiredPermissions: Array.isArray(item.manifest?.permissions)
            ? item.manifest.permissions
            : [],
        }))
        .filter((item) => isPackageLicensed(entitlements, {
          ...item,
          licence_required: item.licence_mode !== "TECHNICAL" && item.manifest?.licenceRequired !== false,
        }))
        .map((item) => ({
          package_key: item.package_key,
          name: item.name,
          route: item.manifest?.route || item.route || null,
          manifest: {
            route: item.manifest?.route || item.route || null,
            navigationAliases: Array.isArray(item.manifest?.navigationAliases) ? item.manifest.navigationAliases : [],
            runtimeSurfaces: item.manifest?.runtimeSurfaces || {},
          },
        }))
        .filter((item) => item.route || item.manifest.navigationAliases.length);
      res.json({ success: true, data });
    } catch (error) {
      console.error("Runtime package navigation error:", error);
      res.status(500).json({ success: false, message: "Unable to load runtime navigation" });
    }
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
                ta.update_status AS tenant_app_update_status,
                ta.is_installed AS is_installed,
                ta.launchable AS launchable,
                ta.storefront_state AS storefront_state
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
          const tenantLicence = String(item.tenant_app_licence_status || "NONE").toUpperCase();
          const tenantLicensed = ["LICENSED","TRIAL"].includes(tenantLicence) || licensed;
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
            storefront_state: item.storefront_state || "AVAILABLE",
            lifecycle_status: item.tenant_app_status || "AVAILABLE",
            is_installed: item.is_installed === true,
            launchable: item.launchable === true,
            update_display_status: item.tenant_app_update_status || "CURRENT",
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




  async function runTenantAppLifecycleFlow(req, packageKey, buttonKey) {
    const trustedPackageResult = await db(
      "SELECT package_key,manifest,version FROM package_registry WHERE package_key=$1 AND active=TRUE LIMIT 1",
      [packageKey]
    );
    const trustedPackage = trustedPackageResult.rows[0];
    if (!trustedPackage) throw Object.assign(new Error("Package is unavailable"), { status: 404 });
    assertTrustedPackageManifest(trustedPackage.package_key, trustedPackage.manifest || {}, trustedPackage.version);

    const tenantResult = await db(
      `SELECT ta.*,osa.app_key
         FROM tenant_apps ta
         JOIN onestore_apps osa ON osa.id=ta.onestore_app_id
        WHERE ta.company_id=$1 AND osa.app_key=$2
        LIMIT 1`,
      [req.user.companyId, packageKey]
    );
    const record = tenantResult.rows[0];
    if (!record) throw Object.assign(new Error("Tenant App record is unavailable"), { status: 404 });

    const objectResult = await db(
      "SELECT * FROM platform_objects WHERE object_key='tenant_app' AND active=TRUE AND company_id IS NULL LIMIT 1"
    );
    const object = objectResult.rows[0];
    if (!object) throw Object.assign(new Error("Tenant App object is unavailable"), { status: 503 });

    const buttonResult = await db(
      `SELECT * FROM platform_buttons
        WHERE object_id=$1 AND button_key=$2 AND active=TRUE AND company_id IS NULL
        LIMIT 1`,
      [object.id, buttonKey]
    );
    const button = buttonResult.rows[0];
    if (!button || button.target_type !== "workflow" || !button.target_key) {
      throw Object.assign(new Error("Tenant App lifecycle Flow is not configured"), { status: 503 });
    }

    const workflowResult = await db(
      `SELECT * FROM platform_rules
        WHERE object_id=$1 AND id::text=$2 AND active=TRUE
          AND lifecycle_status='ACTIVE'
          AND company_id IS NULL
        LIMIT 1`,
      [object.id, String(button.target_key)]
    );
    const workflow = workflowResult.rows[0];
    const actions = Array.isArray(workflow?.action?.actions) ? workflow.action.actions : [];
    if (!workflow || !actions.length) {
      throw Object.assign(new Error("Tenant App lifecycle Flow has no executable steps"), { status: 503 });
    }

    const results = await executeWorkflowActions({
      actions,
      db,
      pool,
      req,
      object,
      record,
      recordId: record.id,
      companyId: req.user.companyId,
      userId: req.user.id || null,
      trigger: "package_lifecycle_compatibility_route",
    });
    const refreshed = await db(
      "SELECT * FROM tenant_apps WHERE id=$1 AND company_id=$2 LIMIT 1",
      [record.id, req.user.companyId]
    );
    return { results, tenantApp: refreshed.rows[0] || record };
  }

  const lifecycleCompatibility = [
    { paths: ["/packages/:packageKey/install", "/platform/packages/:packageKey/install"], buttonKey: "onestore_install" },
    { paths: ["/packages/:packageKey/deactivate", "/platform/packages/:packageKey/deactivate"], buttonKey: "onestore_deactivate" },
    { paths: ["/packages/:packageKey/reactivate", "/platform/packages/:packageKey/reactivate"], buttonKey: "onestore_activate" },
    { paths: ["/packages/:packageKey/uninstall", "/platform/packages/:packageKey/uninstall"], buttonKey: "onestore_uninstall" },
    { paths: ["/packages/:packageKey/upgrade", "/platform/packages/:packageKey/upgrade"], buttonKey: "onestore_upgrade" },
    { paths: ["/packages/:packageKey/activate-trial"], buttonKey: "onestore_trial" },
  ];

  for (const lifecycle of lifecycleCompatibility) {
    router.post(lifecycle.paths, ...manage, async (req, res) => {
      try {
        const data = await runTenantAppLifecycleFlow(req, req.params.packageKey, lifecycle.buttonKey);
        res.json({ success: true, data });
      } catch (error) {
        res.status(error.status || 400).json({ success: false, code: error.code || null, message: error.message || "Package lifecycle Flow failed" });
      }
    });
  }

  router.post("/packages/:packageKey/request-licence", authenticate, authorize("package.manage", "settings.manage"), async (req, res) => {
    try {
      const data = await runTenantAppLifecycleFlow(req, req.params.packageKey, "onestore_request_licence");
      res.status(201).json({ success: true, data });
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



  return router;

}
