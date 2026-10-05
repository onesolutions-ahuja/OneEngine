import { provisionPackageMetadata, resolvePackagePlan } from "./packageRegistry.js";

function packageDefinition(row) {
  return {
    packageKey: row.package_key,
    version: row.version,
    moduleId: row.module_id,
    installable: row.installable,
    visible: row.visible,
    active: row.active,
    publication_state: row.publication_state,
    licence_mode: row.licence_mode,
    billable: row.billable,
    manifest: row.manifest || {},
    dependencies: row.manifest?.dependencies || [],
  };
}

async function setModuleAccess(db, { moduleId, companyId, enabled }) {
  if (!moduleId) return;
  const updated = await db(
    "UPDATE platform_module_access SET enabled=$1,updated_at=NOW() WHERE module_id=$2 AND company_id=$3 AND store_id IS NULL",
    [enabled, moduleId, companyId]
  );
  if (!updated.rowCount) {
    await db(
      "INSERT INTO platform_module_access (module_id,company_id,store_id,enabled) VALUES ($1,$2,NULL,$3)",
      [moduleId, companyId, enabled]
    );
  }
}

async function installEntry(db, { entry, companyId, userId, installationType }) {
  if (entry.installable === false || entry.active !== true) {
    throw new Error(`Package is not installable: ${entry.packageKey}`);
  }
  await provisionPackageMetadata(db, {
    packageId: entry.id,
    moduleId: entry.moduleId,
    companyId,
    manifest: entry.manifest,
    packageVersion: entry.version,
  });
  await db(
    `INSERT INTO company_package_installations
       (company_id,package_id,version,status,installed_by,installation_type,installed_version,target_version,available_version,update_status)
     VALUES ($1,$2,$3,'active',$4,$5,$3,$3,$3,'CURRENT')
     ON CONFLICT (company_id,package_id) DO UPDATE SET
       version=EXCLUDED.version,
       status='active',
       installed_by=COALESCE(EXCLUDED.installed_by,company_package_installations.installed_by),
       installation_type=CASE WHEN EXCLUDED.installation_type='DIRECT' THEN 'DIRECT' ELSE company_package_installations.installation_type END,
       installed_version=EXCLUDED.installed_version,
       target_version=EXCLUDED.target_version,
       available_version=EXCLUDED.available_version,
       update_status='CURRENT',
       update_error=NULL,
       deactivated_by_user=FALSE,
       suspended_by_entitlement=FALSE,
       updated_at=NOW()`,
    [companyId, entry.id, entry.version, userId || null, installationType]
  );
  await setModuleAccess(db, { moduleId: entry.moduleId, companyId, enabled: true });
}

export async function applyPackageLifecycle({ db, companyId, userId = null, tenantAppId, operation }) {
  if (!db || !companyId || !tenantAppId) throw new Error("Package lifecycle requires tenant app and company scope");
  const tenant = await db(
    `SELECT ta.*,osa.app_key,p.id AS package_id,p.module_id,p.version,p.manifest,p.installable,p.visible,p.active,
            p.publication_state,p.licence_mode,p.billable
       FROM tenant_apps ta
       JOIN onestore_apps osa ON osa.id=ta.onestore_app_id
       JOIN package_registry p ON p.package_key=osa.app_key
      WHERE ta.id=$1 AND ta.company_id=$2
      LIMIT 1`,
    [tenantAppId, companyId]
  );
  const row = tenant.rows[0];
  if (!row) throw new Error("Tenant App is unavailable");

  const requested = String(operation || "").trim().toUpperCase();
  const packageKey = row.app_key;
  const allPackages = await db(
    `SELECT id,package_key,module_id,version,manifest,installable,visible,active,publication_state,licence_mode,billable
       FROM package_registry
      WHERE active=TRUE`
  );
  const definitions = allPackages.rows.map((item) => ({ ...packageDefinition(item), id: item.id }));
  const plan = resolvePackagePlan(packageKey, definitions);

  if (["INSTALL","ACTIVATE","UPGRADE"].includes(requested)) {
    const licenceRequired = row.licence_mode !== "TECHNICAL" && row.billable !== false;
    if (licenceRequired && !["LICENSED","TRIAL"].includes(String(row.licence_status || "").toUpperCase())) {
      throw new Error("Package requires an active licence or trial");
    }
  }

  if (requested === "TRIAL") {
    const existing = await db(
      "SELECT activated_at,expires_at FROM company_package_trials WHERE company_id=$1 AND package_id=$2 LIMIT 1",
      [companyId, row.package_id]
    );
    if (existing.rows[0]) {
      const error = new Error("The free trial for this app has already been used");
      error.code = "TRIAL_ALREADY_USED";
      throw error;
    }
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const trialResult = await db(
      `INSERT INTO company_package_trials
         (company_id,package_id,activated_by,activated_at,expires_at)
       VALUES ($1,$2,$3,NOW(),$4)
       RETURNING activated_at,expires_at`,
      [companyId, row.package_id, userId || null, expiresAt]
    );
    await db(
      `INSERT INTO company_package_entitlement_sources
         (company_id,package_id,source_type,source_key,active,starts_at,expires_at,metadata)
       VALUES ($1,$2,'DIRECT_LICENCE',$3,true,NOW(),$4,$5::jsonb)
       ON CONFLICT (company_id,package_id,source_type,source_key)
       DO UPDATE SET active=true,starts_at=NOW(),expires_at=EXCLUDED.expires_at,metadata=EXCLUDED.metadata`,
      [
        companyId,
        row.package_id,
        `trial:${companyId}:${packageKey}`,
        expiresAt,
        JSON.stringify({ trial: true, days: 7, activatedBy: userId || null }),
      ]
    );
    return { success: true, operation: requested, packageKey, ...trialResult.rows[0] };
  }

  if (requested === "INSTALL") {
    for (const entry of plan) {
      await installEntry(db, {
        entry,
        companyId,
        userId,
        installationType: entry.packageKey === packageKey ? "DIRECT" : "DEPENDENCY",
      });
    }
    return { success: true, operation: requested, packageKey, installed: plan.map((entry) => entry.packageKey) };
  }

  if (requested === "ACTIVATE") {
    for (const entry of plan) {
      const packageId = entry.id;
      const existing = await db(
        "SELECT id FROM company_package_installations WHERE company_id=$1 AND package_id=$2 LIMIT 1",
        [companyId, packageId]
      );
      if (!existing.rows.length) {
        await installEntry(db, {
          entry,
          companyId,
          userId,
          installationType: entry.packageKey === packageKey ? "DIRECT" : "DEPENDENCY",
        });
      } else {
        await db(
          `UPDATE company_package_installations
              SET status='active',deactivated_by_user=FALSE,suspended_by_entitlement=FALSE,updated_at=NOW()
            WHERE company_id=$1 AND package_id=$2`,
          [companyId, packageId]
        );
        await setModuleAccess(db, { moduleId: entry.moduleId, companyId, enabled: true });
      }
    }
    return { success: true, operation: requested, packageKey };
  }

  if (requested === "DEACTIVATE" || requested === "UNINSTALL") {
    const dependents = await db(
      `SELECT DISTINCT p.package_key
         FROM company_package_installations i
         JOIN package_dependencies d ON d.package_id=i.package_id
         JOIN package_registry p ON p.id=i.package_id
        WHERE d.dependency_id=$1 AND i.company_id=$2 AND i.status='active' AND d.optional=FALSE`,
      [row.package_id, companyId]
    );
    if (dependents.rows.length) {
      const error = new Error("Package is required by an installed package");
      error.code = "PACKAGE_REQUIRED";
      throw error;
    }
    await db(
      `UPDATE company_package_installations
          SET status='inactive',deactivated_by_user=TRUE,suspended_by_entitlement=FALSE,updated_at=NOW()
        WHERE company_id=$1 AND package_id=$2`,
      [companyId, row.package_id]
    );
    await setModuleAccess(db, { moduleId: row.module_id, companyId, enabled: false });
    return { success: true, operation: requested, packageKey, dataPreserved: true };
  }

  if (requested === "UPGRADE") {
    for (const entry of plan) {
      await provisionPackageMetadata(db, {
        packageId: entry.id,
        moduleId: entry.moduleId,
        companyId,
        manifest: entry.manifest,
        packageVersion: entry.version,
      });
      await db(
        `UPDATE company_package_installations
            SET version=$1,installed_version=$1,target_version=$1,available_version=$1,
                update_status='CURRENT',update_error=NULL,last_update_at=NOW(),last_upgrade_at=NOW(),
                last_upgrade_state='COMPLETED',updated_at=NOW()
          WHERE company_id=$2 AND package_id=$3`,
        [entry.version, companyId, entry.id]
      );
    }
    return { success: true, operation: requested, packageKey, upgraded: plan.map((entry) => entry.packageKey) };
  }

  throw new Error(`Unsupported package lifecycle operation: ${requested}`);
}
