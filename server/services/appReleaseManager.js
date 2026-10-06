import { comparePackageVersions, provisionPackageMetadata } from "./packageRegistry.js";
import { createAuditWriter } from "./auditLog.js";
import { enqueuePlatformJob } from "./platformJobs.js";
import { deployPackageMetadata, rollbackMetadataDeployment, validateDeploymentManifest } from "./platformMetadataDeployment.js";

export const RELEASE_UPDATE_POLICIES = Object.freeze(["OPTIONAL", "FORCED", "STAGED"]);
export const RELEASE_STATUSES = Object.freeze(["DRAFT", "VALIDATED", "PUBLISHED", "PAUSED", "ARCHIVED"]);
export const INSTALLATION_UPDATE_STATUSES = Object.freeze([
  "CURRENT",
  "UPDATE_AVAILABLE",
  "QUEUED",
  "UPDATING",
  "FAILED",
  "CONFLICT",
  "CURRENT_AFTER_UPDATE",
  "ROLLBACK_REQUIRED",
]);

export function normalizeUpdatePolicy(value) {
  const candidate = String(value || "OPTIONAL").trim().toUpperCase();
  return RELEASE_UPDATE_POLICIES.includes(candidate) ? candidate : "OPTIONAL";
}

export function normalizeReleaseStatus(value) {
  const candidate = String(value || "DRAFT").trim().toUpperCase();
  return RELEASE_STATUSES.includes(candidate) ? candidate : "DRAFT";
}

export function normalizeInstallationUpdateStatus(value) {
  const candidate = String(value || "CURRENT").trim().toUpperCase();
  return INSTALLATION_UPDATE_STATUSES.includes(candidate) ? candidate : "CURRENT";
}

export function isDestructiveChange(change) {
  if (!change || typeof change !== "object") return false;
  const type = String(change.type || change.changeType || change.kind || "").toUpperCase();
  const destructive = Boolean(change.destructive === true || change.requiresApproval === true || change.requires_approval === true);
  return destructive || ["DROP_FIELD", "DROP_OBJECT", "REMOVE_RELATIONSHIP", "INCOMPATIBLE_FIELD_TYPE_CHANGE", "DESTRUCTIVE_DATA_TRANSFORM"].includes(type);
}

export function summariseReleaseChanges(changeSet = []) {
  const changes = Array.isArray(changeSet) ? changeSet : [];
  const counts = {
    addObject: 0,
    addField: 0,
    updateFieldMetadata: 0,
    addRelationship: 0,
    updatePage: 0,
    updateLayout: 0,
    updateWorkflow: 0,
    updateRule: 0,
    addAction: 0,
    updateAction: 0,
    addPermission: 0,
    updatePermission: 0,
    updateIcon: 0,
    updateComponent: 0,
    updateConnectorConfigSchema: 0,
    other: 0,
  };
  const toCamelKey = (value) => String(value || "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => index === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
  let destructive = 0;
  for (const change of changes) {
    const type = String(change?.type || change?.changeType || change?.kind || "").toUpperCase();
    if (!type) {
      counts.other += 1;
      continue;
    }
    const key = toCamelKey(type);
    if (isDestructiveChange(change)) destructive += 1;
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] += 1;
    } else {
      counts.other += 1;
    }
  }
  return { ...counts, destructive };
}

export function buildReleasePreview({ packageKey = null, version = "1.0.0", previousVersion = null, changes = [], warnings = [], conflicts = [], companiesAffected = 0, minimumPlatformVersion = null } = {}) {
  const summary = summariseReleaseChanges(changes);
  const preview = {
    packageKey,
    version,
    previousVersion,
    minimumPlatformVersion,
    companiesAffected,
    destructiveChanges: summary.destructive,
    warnings: Array.isArray(warnings) ? warnings : [],
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    summary: {
      adds: summary.addObject + summary.addField + summary.addPermission + summary.addAction + summary.addRelationship,
      updates: summary.updateFieldMetadata + summary.updatePage + summary.updateLayout + summary.updateWorkflow + summary.updateRule + summary.updateAction + summary.updatePermission + summary.updateIcon + summary.updateComponent + summary.updateConnectorConfigSchema,
      destructive: summary.destructive,
    },
    changelog: [
      summary.addField ? `+ ${summary.addField} fields` : null,
      summary.updateWorkflow ? `~ ${summary.updateWorkflow} workflows` : null,
      summary.updatePage ? `~ ${summary.updatePage} page` : null,
      summary.updatePermission ? `+ ${summary.updatePermission} permission` : null,
      summary.updateIcon ? `~ app icon` : null,
      `0 destructive changes`,
    ].filter(Boolean),
    valid: summary.destructive === 0,
  };
  preview.summaryText = preview.changelog.join("\n");
  return preview;
}

async function writeReleaseAudit(db, { companyId = null, userId = null, action, releaseId, result = "success", metadata = {} } = {}) {
  const writeAudit = createAuditWriter({ db });
  await writeAudit.object({ companyId, userId, action, entityType: "package_release", entityId: releaseId, result, metadata });
}

export function resolveReleaseValidation({ packageVersion, minimumPlatformVersion, companyCount = 0, changes = [], warnings = [], conflicts = [] } = {}) {
  const releaseVersion = String(packageVersion || "").trim();
  const requiredPlatform = String(minimumPlatformVersion || "").trim();
  const destructive = summariseReleaseChanges(changes).destructive;
  const errors = [];
  if (requiredPlatform && typeof comparePackageVersions === "function") {
    try {
      if (comparePackageVersions(releaseVersion, requiredPlatform) < 0) {
        errors.push("Package version is below the required minimum platform version.");
      }
    } catch {
      /* ignore invalid platform version strings here; validation can still continue */
    }
  }
  if (destructive > 0) errors.push("Destructive migration changes require explicit approval.");
  if (Array.isArray(conflicts) && conflicts.length) errors.push("Customer override conflict requires admin review.");

  return {
    valid: errors.length === 0,
    errors,
    warnings: Array.isArray(warnings) ? warnings : [],
    conflicts: Array.isArray(conflicts) ? conflicts : [],
    companiesAffected: Number(companyCount) || 0,
    destructiveChanges: destructive,
  };
}

export function readStoredRelease(aRow = {}) {
  return {
    id: aRow.id || null,
    package_key: aRow.package_key || aRow.packageKey || aRow.package_key || null,
    packageKey: aRow.package_key || aRow.packageKey || aRow.package_key || null,
    version: aRow.version || "0.0.0",
    previous_version: aRow.previous_version || aRow.previousVersion || null,
    previousVersion: aRow.previous_version || aRow.previousVersion || null,
    release_notes: aRow.release_notes || aRow.releaseNotes || "",
    releaseNotes: aRow.release_notes || aRow.releaseNotes || "",
    status: normalizeReleaseStatus(aRow.status),
    created_at: aRow.created_at || aRow.createdAt || null,
    createdAt: aRow.created_at || aRow.createdAt || null,
    published_at: aRow.published_at || aRow.publishedAt || null,
    publishedAt: aRow.published_at || aRow.publishedAt || null,
    minimum_platform_version: aRow.minimum_platform_version || aRow.minimumPlatformVersion || null,
    minimumPlatformVersion: aRow.minimum_platform_version || aRow.minimumPlatformVersion || null,
    update_policy: normalizeUpdatePolicy(aRow.update_policy || aRow.updatePolicy || "OPTIONAL"),
    updatePolicy: normalizeUpdatePolicy(aRow.update_policy || aRow.updatePolicy || "OPTIONAL"),
    change_set: Array.isArray(aRow.change_set) ? aRow.change_set : (Array.isArray(aRow.delta) ? aRow.delta : []),
    delta: Array.isArray(aRow.change_set) ? aRow.change_set : (Array.isArray(aRow.delta) ? aRow.delta : []),
    manifest: aRow.manifest && typeof aRow.manifest === "object" ? aRow.manifest : {},
    validation_summary: aRow.validation_summary && typeof aRow.validation_summary === "object" ? aRow.validation_summary : {},
    package_name: aRow.package_name || aRow.name || null,
    name: aRow.package_name || aRow.name || null,
  };
}

export function serializeReleaseInsert(input = {}) {
  const release = readStoredRelease(input);
  return {
    packageKey: release.packageKey,
    version: release.version,
    previousVersion: release.previousVersion,
    releaseNotes: release.releaseNotes,
    status: normalizeReleaseStatus(release.status),
    minimumPlatformVersion: release.minimumPlatformVersion,
    updatePolicy: normalizeUpdatePolicy(release.updatePolicy),
    changeSet: Array.isArray(release.change_set) ? release.change_set : [],
  };
}

export async function listPackageReleases(db, { packageKey = null } = {}) {
  const clauses = [];
  const values = [];
  if (packageKey) {
    clauses.push("pr.package_key=$1");
    values.push(String(packageKey));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db(`
    SELECT pr.*, p.name AS package_name
      FROM package_releases pr
      LEFT JOIN package_registry p ON p.package_key=pr.package_key
     ${where}
     ORDER BY pr.published_at DESC NULLS LAST, pr.created_at DESC
  `, values);
  return (result.rows || []).map(readStoredRelease);
}

export async function registerPortableApplicationPackage({
  db, packageKey, name, version = "1.0.0", description = "", manifest = {},
  publisher = "OneSolutions", category = "Apps", billable = true,
} = {}) {
  const key = String(packageKey || "").trim();
  const label = String(name || "").trim();
  if (!/^[a-z0-9_.-]{1,100}$/i.test(key) || !label) throw new Error("Valid packageKey and name are required");
  validateDeploymentManifest(manifest);
  const result = await db(
    `INSERT INTO package_registry
       (package_key,name,version,description,manifest,active,package_type,publisher,category,
        publication_state,visible,installable,billable,system_only,display_order,licence_mode,updated_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,TRUE,'APPLICATION',$6,$7,'DRAFT',FALSE,TRUE,$8,FALSE,0,
             CASE WHEN $8=TRUE THEN 'COMMERCIAL' ELSE 'TECHNICAL' END,NOW())
     ON CONFLICT (package_key) DO UPDATE SET
       name=EXCLUDED.name,version=EXCLUDED.version,description=EXCLUDED.description,
       manifest=EXCLUDED.manifest,publisher=EXCLUDED.publisher,category=EXCLUDED.category,
       billable=EXCLUDED.billable,licence_mode=EXCLUDED.licence_mode,updated_at=NOW()
     RETURNING id,package_key,name,version,publication_state,visible,installable,billable,licence_mode`,
    [key, label, String(version || "1.0.0"), description || null, JSON.stringify(manifest), publisher, category, billable === true]
  );
  return result.rows[0];
}

export async function projectPublishedPackageToOneStore(db, packageKey) {
  const result = await db(
    `INSERT INTO onestore_apps
       (app_key,name,version,description,svg,landing_route,category,publisher,active,visible,installable,display_order,updated_at)
     SELECT p.package_key,p.name,p.version,p.description,
            NULLIF(p.manifest->>'svg',''),
            COALESCE(NULLIF(p.manifest->>'landingRoute',''),NULLIF(p.manifest->>'route',''),'/workspace'),
            p.category,p.publisher,p.active,p.visible,p.installable,p.display_order,NOW()
       FROM package_registry p
      WHERE p.package_key=$1 AND p.publication_state='PUBLISHED' AND p.active=TRUE
     ON CONFLICT (app_key) DO UPDATE SET
       name=EXCLUDED.name,version=EXCLUDED.version,description=EXCLUDED.description,
       svg=EXCLUDED.svg,landing_route=EXCLUDED.landing_route,category=EXCLUDED.category,
       publisher=EXCLUDED.publisher,active=EXCLUDED.active,visible=EXCLUDED.visible,
       installable=EXCLUDED.installable,display_order=EXCLUDED.display_order,updated_at=NOW()
     RETURNING id,app_key,name,version`,
    [String(packageKey || "")]
  );
  return result.rows[0] || null;
}

export async function createPackageRelease({ db, packageKey, version, previousVersion = null, releaseNotes = "", status = "DRAFT", minimumPlatformVersion = null, updatePolicy = "OPTIONAL", changeSet = [], manifest = {}, createdBy = null }) {
  const packageKeyValue = String(packageKey || "").trim();
  if (!packageKeyValue) throw new Error("packageKey is required");
  if (normalizeReleaseStatus(status) !== "DRAFT") throw new Error("New releases must be created as drafts");
  const packageVersion = String(version || "").trim() || "1.0.0";
  const result = await db(
    `INSERT INTO package_releases
      (package_key, version, previous_version, release_notes, status, minimum_platform_version, update_policy, change_set, manifest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
     RETURNING *`,
    [
      packageKeyValue,
      packageVersion,
      previousVersion || null,
      releaseNotes || "",
      "DRAFT",
      minimumPlatformVersion || null,
      normalizeUpdatePolicy(updatePolicy),
      JSON.stringify(Array.isArray(changeSet) ? changeSet : []),
      JSON.stringify(manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {}),
    ]
  );
  const release = readStoredRelease(result.rows[0]);
  await writeReleaseAudit(db, { userId: createdBy, action: "release.created", releaseId: release.id, metadata: { packageKey: release.packageKey, version: release.version } });
  return release;
}

export async function validatePackageRelease({ db, releaseId, userId = null }) {
  const result = await db(
    `SELECT pr.*, p.name AS package_name
       FROM package_releases pr
       LEFT JOIN package_registry p ON p.package_key=pr.package_key
      WHERE pr.id=$1`,
    [releaseId]
  );
  if (!result.rows.length) throw new Error("Release not found");
  const release = readStoredRelease(result.rows[0]);
  const preview = buildReleasePreview({
    packageKey: release.packageKey,
    version: release.version,
    previousVersion: release.previousVersion,
    changes: Array.isArray(release.change_set) ? release.change_set : [],
    warnings: [],
    conflicts: [],
    companiesAffected: 0,
    minimumPlatformVersion: release.minimumPlatformVersion,
  });
  const validation = resolveReleaseValidation({
    packageVersion: release.version,
    minimumPlatformVersion: release.minimumPlatformVersion,
    companyCount: 0,
    changes: Array.isArray(release.change_set) ? release.change_set : [],
    warnings: preview.warnings,
    conflicts: preview.conflicts,
  });
  if (release.manifest && Object.keys(release.manifest).length) {
    try {
      validateDeploymentManifest(release.manifest);
    } catch (error) {
      validation.valid = false;
      validation.errors.push(error.message || "Release metadata manifest is invalid.");
    }
  }
  const status = validation.valid ? "VALIDATED" : "DRAFT";
  const validationSummary = { ...validation, preview };
  await db(
    `UPDATE package_releases SET status=$1, validation_summary=$2::jsonb, updated_at=NOW() WHERE id=$3`,
    [status, JSON.stringify(validationSummary), releaseId]
  );
  await writeReleaseAudit(db, {
    userId,
    action: "release.validated",
    releaseId: release.id,
    result: validation.valid ? "success" : "failure",
    metadata: { packageKey: release.packageKey, version: release.version, valid: validation.valid, errorCount: validation.errors.length },
  });
  return { ...validation, release: { ...release, status, validation_summary: validationSummary }, preview };
}

export async function publishPackageRelease({ db, releaseId, publishedBy = null }) {
  const result = await db(
    `UPDATE package_releases
        SET status='PUBLISHED', published_at=NOW(), updated_at=NOW(), published_by=$2
      WHERE id=$1 AND status='VALIDATED'
      RETURNING *`,
    [releaseId, publishedBy || null]
  );
  if (!result.rows.length) throw new Error("Release must exist and pass validation before publishing");
  const release = readStoredRelease(result.rows[0]);
  const packageUpdate = await db(
    `UPDATE package_registry
        SET version=$1,manifest=CASE WHEN $3::jsonb='{}'::jsonb THEN manifest ELSE $3::jsonb END,updated_at=NOW()
      WHERE package_key=$2 AND active=true RETURNING id`,
    [release.version, release.packageKey, JSON.stringify(release.manifest || {})]
  );
  if (!packageUpdate.rows?.length) throw new Error("Package not found or inactive");
  await db(
    `UPDATE package_registry SET publication_state='PUBLISHED',visible=TRUE,installable=TRUE,updated_at=NOW()
      WHERE id=$1`,
    [packageUpdate.rows[0].id]
  );
  await projectPublishedPackageToOneStore(db, release.packageKey);
  await writeReleaseAudit(db, {
    userId: publishedBy,
    action: "release.published",
    releaseId: release.id,
    metadata: { packageKey: release.packageKey, version: release.version, policy: release.updatePolicy },
  });
  if (release.updatePolicy === "FORCED") {
    release.rollout = await startReleaseRollout({ db, releaseId, stage: "100%", userId: publishedBy });
  } else {
    await db(
      `UPDATE company_package_installations
          SET target_version=$1,available_version=$1,
              update_status=CASE WHEN update_status IN ('QUEUED','UPDATING') THEN update_status ELSE 'UPDATE_AVAILABLE' END,
              updated_at=NOW()
        WHERE package_id=$2 AND status='active' AND COALESCE(installed_version,version)<>$1`,
      [release.version, packageUpdate.rows[0].id]
    );
  }
  return release;
}

export async function getPackageReleaseById(db, releaseId) {
  let result = await db(
    `SELECT pr.*, p.id AS package_id, p.name AS package_name
       FROM package_releases pr
       LEFT JOIN package_registry p ON p.package_key=pr.package_key
      WHERE pr.id=$1`,
    [releaseId]
  );
  if ((!result || !Array.isArray(result.rows) || !result.rows.length) && typeof db === "function") {
    result = await db(`SELECT * FROM package_releases WHERE id=$1`, [releaseId]);
  }
  if (!result || !Array.isArray(result.rows) || !result.rows.length) throw new Error("Release not found");
  return readStoredRelease(result.rows[0]);
}

export async function getPackageReleaseRolloutStatus(db, releaseId) {
  const release = await getPackageReleaseById(db, releaseId);
  const packageResult = await db(
    `SELECT id, version FROM package_registry WHERE package_key=$1`,
    [release.packageKey]
  );
  const packageRow = packageResult.rows?.[0] || null;
  const companyResult = packageRow ? await db(
    `SELECT c.id AS company_id, c.name AS company_name,
            COALESCE(i.installed_version, i.version) AS installed_version,
            COALESCE(i.target_version, $2) AS target_version,
            i.update_status, i.update_error, i.auto_update_policy, i.last_update_at,
            (SELECT COUNT(*)::int FROM audit_logs a
              WHERE a.company_id=i.company_id AND a.entity_type='package_release'
                AND a.entity_id=$3 AND a.action='release.retry') AS retry_count,
            GREATEST(
              (SELECT MAX(h.started_at) FROM package_upgrade_history h
                WHERE h.company_id=i.company_id AND h.package_id=i.package_id
                  AND h.metadata->>'releaseId'=$3),
              (SELECT MAX(a.created_at) FROM audit_logs a
                WHERE a.company_id=i.company_id AND a.entity_type='package_release'
                  AND a.entity_id=$3 AND a.action='release.retry')
            ) AS last_attempt,
            (SELECT MAX(h.completed_at) FROM package_upgrade_history h
              WHERE h.company_id=i.company_id AND h.package_id=i.package_id
                AND h.metadata->>'releaseId'=$3) AS completed_at,
            (SELECT COUNT(*)::int FROM package_installation_versions v
              WHERE v.company_id=i.company_id AND v.package_id=i.package_id AND v.version=$2) AS migration_count
       FROM company_package_installations i
       JOIN companies c ON c.id=i.company_id
      WHERE i.package_id=$1
      ORDER BY c.name`,
    [packageRow.id, release.version, release.id]
  ) : { rows: [] };
  const companies = (companyResult.rows || []).map((row) => {
    const conflict = /override|custom|user.modified|ownership|conflict/i.test(String(row.update_error || ""));
    return {
      ...row,
      status: String(row.update_status || "CURRENT").toUpperCase(),
      error: row.update_error || null,
      conflict: conflict ? row.update_error : null,
      retry_count: Number(row.retry_count) || 0,
      migration_count: Number(row.migration_count) || 0,
    };
  });
  const count = (status) => companies.filter((company) => company.status === status).length;
  const completed = companies.filter((company) => company.status === "CURRENT" && company.installed_version === release.version).length;
  const total = companies.length;
  const conflicts = companies.filter((company) => company.conflict);
  return {
    release: { ...release, current_version: packageRow?.version || null },
    companies,
    summary: {
      total,
      queued: count("QUEUED"),
      updating: count("UPDATING"),
      completed,
      failed: count("FAILED"),
      conflicts: conflicts.length,
      progress: total ? Math.round((completed / total) * 100) : 0,
    },
    warnings: Array.isArray(release.validation_summary?.warnings) ? release.validation_summary.warnings : [],
    conflicts: Array.isArray(release.validation_summary?.conflicts) ? release.validation_summary.conflicts : [],
  };
}

export async function setPackageReleasePaused({ db, releaseId, paused, userId = null, companyId = null }) {
  const status = paused ? "PAUSED" : "PUBLISHED";
  const fromStatus = paused ? "PUBLISHED" : "PAUSED";
  let result = await db(
    `UPDATE package_releases SET status=$1, updated_at=NOW() WHERE id=$2 AND status=$3 RETURNING *`,
    [status, releaseId, fromStatus]
  );
  if (!result.rows.length) {
    result = await db(`SELECT * FROM package_releases WHERE id=$1`, [releaseId]);
    if (!result.rows.length) throw new Error("Release not found");
    if (normalizeReleaseStatus(result.rows[0].status) !== status) {
      throw new Error(`Only ${fromStatus.toLowerCase()} releases can be ${paused ? "paused" : "resumed"}`);
    }
  }
  const release = readStoredRelease(result.rows[0]);
  if (companyId) {
    await writeReleaseAudit(db, {
      companyId,
      userId,
      action: paused ? "release.rollout.paused" : "release.rollout.resumed",
      releaseId: release.id,
      metadata: { packageKey: release.packageKey, version: release.version },
    });
  }
  return release;
}

export async function retryFailedReleaseUpgrades({ db, releaseId, userId = null }) {
  const release = await getPackageReleaseById(db, releaseId);
  if (release.status !== "PUBLISHED") throw new Error("Resume the release before retrying failed upgrades");
  const failed = await db(
    `SELECT i.company_id, i.package_id, COALESCE(i.installed_version, i.version) AS installed_version
       FROM company_package_installations i
       JOIN package_registry p ON p.id=i.package_id
      WHERE p.package_key=$1 AND i.target_version=$2 AND i.update_status='FAILED'
      ORDER BY i.company_id`,
    [release.packageKey, release.version]
  );
  const result = [];
  for (const row of failed.rows || []) {
    await db(
      `INSERT INTO package_upgrade_history
        (company_id, package_id, from_version, to_version, status, metadata, created_by)
       VALUES ($1,$2,$3,$4,'RUNNING',$5::jsonb,$6)`,
      [row.company_id, row.package_id, row.installed_version, release.version, JSON.stringify({ releaseId: release.id, stage: "retry" }), userId || null]
    );
    await db(
      `UPDATE company_package_installations SET update_status='QUEUED',update_error=NULL,updated_at=NOW()
        WHERE company_id=$1 AND package_id=$2 AND update_status='FAILED'`,
      [row.company_id, row.package_id]
    );
    const existingJobs = await db(
      `SELECT id,status FROM platform_action_jobs
        WHERE company_id=$1 AND kind='APP_RELEASE_UPGRADE' AND payload->>'releaseId'=$2
        ORDER BY created_at DESC LIMIT 1`,
      [row.company_id, release.id]
    );
    const existingJob = existingJobs.rows?.[0];
    if (existingJob?.status === "PENDING") {
      await db("UPDATE platform_action_jobs SET next_attempt_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='PENDING'", [existingJob.id]);
    } else if (existingJob?.status === "FAILED") {
      await db(
        `UPDATE platform_action_jobs
            SET status='PENDING',attempts=0,last_error=NULL,next_attempt_at=NOW(),completed_at=NULL,updated_at=NOW()
          WHERE id=$1 AND status='FAILED'`,
        [existingJob.id]
      );
    } else if (!existingJob || existingJob.status === "COMPLETED") {
      await enqueuePlatformJob({
        db,
        companyId: row.company_id,
        kind: "APP_RELEASE_UPGRADE",
        payload: { releaseId: release.id, companyId: row.company_id, packageKey: release.packageKey, userId },
        idempotencyKey: `app-release:${release.id}:${row.company_id}:${release.version}:retry`,
      });
    }
    await writeReleaseAudit(db, { companyId: row.company_id, userId, action: "release.retry", releaseId: release.id, metadata: { packageKey: release.packageKey, version: release.version } });
    result.push({ companyId: row.company_id, status: "QUEUED" });
  }
  return { releaseId, retried: result.length, result };
}

export async function startReleaseRollout({ db, releaseId, companyIds = [], userId = null, stage = "internal" } = {}) {
  const release = await getPackageReleaseById(db, releaseId);
  if (release.status !== "PUBLISHED") throw new Error("Publish the release before starting a rollout");
  const packageRow = await db(
    `SELECT id, package_key, version FROM package_registry WHERE package_key=$1 AND active=true`,
    [release.packageKey]
  );
  if (!packageRow?.rows?.length) throw new Error("Package not found");
  const stageName = String(stage || "internal").trim().toLowerCase();
  const percentage = /^\d{1,3}%?$/.test(stageName) ? Number(stageName.replace("%", "")) : null;
  const isInternalStage = ["internal", "test", "internal/test"].includes(stageName);
  if (!isInternalStage && ![10, 50, 100].includes(percentage)) throw new Error("Rollout stage must be internal/test, 10%, 50%, or 100%");
  const candidates = Array.isArray(companyIds) && companyIds.length
    ? [...new Set(companyIds.filter((value) => typeof value === "string" && value.trim()))].sort()
    : (await db(`SELECT DISTINCT company_id FROM company_package_installations WHERE package_id=$1 ORDER BY company_id`, [packageRow.rows[0].id])).rows.map((row) => row.company_id).filter(Boolean).sort();
  const targetIds = isInternalStage
    ? (Array.isArray(companyIds) ? [...new Set(companyIds.filter((value) => typeof value === "string" && value.trim()))].sort() : [])
    : candidates.slice(0, Math.ceil(candidates.length * percentage / 100));
  const result = [];
  for (const companyId of targetIds) {
    const current = await db(
      `SELECT i.id, i.version, i.installed_version, i.target_version, i.update_status, i.auto_update_policy, i.status AS installation_status
         FROM company_package_installations i
        WHERE i.company_id=$1 AND i.package_id=$2`,
      [companyId, packageRow.rows[0].id]
    );
    const row = current.rows[0] || null;
    if (!row) {
      result.push({ companyId, status: "SKIPPED", reason: "NOT_INSTALLED" });
      continue;
    }
    if (String(row.installation_status || "active").toLowerCase() !== "active") {
      result.push({ companyId, status: "SKIPPED", reason: "INACTIVE" });
      continue;
    }
    const installedVersion = String(row?.installed_version || row?.version || "0.0.0").trim();
    if (String(row.update_status || "").toUpperCase() === "CONFLICT") {
      await writeReleaseAudit(db, { companyId, userId, action: "release.conflict", releaseId: release.id, result: "failure", metadata: { packageKey: release.packageKey, version: release.version } });
      result.push({ companyId, status: "CONFLICT", installedVersion, targetVersion: release.version });
      continue;
    }
    if (row && ["QUEUED", "UPDATING"].includes(String(row.update_status || "CURRENT").toUpperCase())) {
      await enqueuePlatformJob({
        db, companyId, kind: "APP_RELEASE_UPGRADE",
        payload: { releaseId: release.id, companyId, packageKey: release.packageKey, userId },
        idempotencyKey: `app-release:${release.id}:${companyId}:${release.version}`,
      });
      result.push({ companyId, status: "QUEUED", installedVersion, targetVersion: release.version });
      continue;
    }
    if (installedVersion === release.version) {
      result.push({ companyId, status: "CURRENT", installedVersion, targetVersion: release.version });
      continue;
    }
    await db(
      `UPDATE company_package_installations
          SET installed_version = COALESCE(installed_version, version),
              target_version = $1,
              update_status = 'QUEUED',
              auto_update_policy = CASE WHEN $2='FORCED' THEN 'FORCED' ELSE COALESCE(auto_update_policy, $2) END,
              last_update_at = NOW(),
              update_error = NULL,
              updated_at = NOW()
        WHERE company_id = $3 AND package_id = $4`,
      [release.version, normalizeUpdatePolicy(release.updatePolicy || release.update_policy || "OPTIONAL"), companyId, packageRow.rows[0].id]
    );
    await db(
      `INSERT INTO package_upgrade_history (company_id, package_id, from_version, to_version, status, metadata, created_by)
       VALUES ($1, $2, $3, $4, 'RUNNING', $5::jsonb, $6)
       ON CONFLICT DO NOTHING`,
      [companyId, packageRow.rows[0].id, installedVersion, release.version, JSON.stringify({ releaseId, stage }), userId || null]
    );
    await enqueuePlatformJob({
      db, companyId, kind: "APP_RELEASE_UPGRADE",
      payload: { releaseId: release.id, companyId, packageKey: release.packageKey, userId },
      idempotencyKey: `app-release:${release.id}:${companyId}:${release.version}`,
    });
    await writeReleaseAudit(db, { companyId, userId, action: "release.rollout.started", releaseId: release.id, metadata: { packageKey: release.packageKey, version: release.version, stage } });
    result.push({ companyId, status: "QUEUED", installedVersion, targetVersion: release.version });
  }
  return { releaseId, queued: result.filter((entry) => entry.status === "QUEUED").length, stage: isInternalStage ? "internal/test" : `${percentage}%`, result, policy: normalizeUpdatePolicy(release.updatePolicy || release.update_policy || "OPTIONAL") };
}

export async function executeTenantReleaseUpgrade({ db, releaseId, companyId, packageKey, userId = null, manifest = {} } = {}) {
  const release = await getPackageReleaseById(db, releaseId);
  if (release.status === "PAUSED") throw new Error("Release rollout is paused");
  let packageRow = await db(
    `SELECT id, package_key, version, module_id, manifest FROM package_registry WHERE package_key=$1 AND active=true`,
    [packageKey || release.packageKey]
  );
  if (!packageRow || !Array.isArray(packageRow.rows) || !packageRow.rows.length) throw new Error("Package not found");
  const packageDefinition = packageRow.rows[0];
  const packageId = packageDefinition.id;
  const current = await db(
    `SELECT id, company_id, package_id, version, installed_version, target_version, update_status, auto_update_policy
       FROM company_package_installations
      WHERE company_id=$1 AND package_id=$2`,
    [companyId, packageId]
  );
  const row = current.rows?.[0] || null;
  if (!row) throw new Error("Package is not installed for this company");
  const previousVersion = String(row?.installed_version || row?.version || "0.0.0").trim();
  const targetVersion = String(release.version || packageDefinition.version || previousVersion).trim();
  const packageManifest = packageDefinition.manifest && typeof packageDefinition.manifest === "object" ? packageDefinition.manifest : {};
  const versionedManifest = release.manifest && Object.keys(release.manifest).length ? release.manifest : packageManifest;
  const effectiveManifest = { ...versionedManifest, ...manifest };
  const migrations = Array.isArray(effectiveManifest.migrations) ? effectiveManifest.migrations : [];
  const migrationKeys = migrations.map((migration) => typeof migration === "string" ? migration : (migration?.key || migration?.migrationKey));
  for (const migrationKey of migrationKeys) {
    if (!migrationKey || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(migrationKey)) {
      throw new Error(`Invalid migration key for package: ${packageDefinition.package_key}`);
    }
  }
  if (previousVersion === targetVersion && String(row.update_status || "CURRENT").toUpperCase() === "CURRENT") {
    return { companyId, packageKey: packageDefinition.package_key, releaseId: release.id, status: "CURRENT", installedVersion: previousVersion, previousVersion, targetVersion, migrations: [], audit: [], alreadyCurrent: true };
  }
  const runningAttempt = await db(
    `SELECT id FROM package_upgrade_history
      WHERE company_id=$1 AND package_id=$2 AND to_version=$3 AND status='RUNNING'
        AND metadata->>'releaseId'=$4
      ORDER BY created_at DESC LIMIT 1`,
    [companyId, packageId, targetVersion, String(release.id)]
  );
  let upgradeAttemptId = runningAttempt.rows?.[0]?.id || null;
  if (!runningAttempt.rows?.length) {
    const insertedAttempt = await db(
      `INSERT INTO package_upgrade_history (company_id,package_id,from_version,to_version,status,metadata,created_by)
       VALUES ($1,$2,$3,$4,'RUNNING',$5::jsonb,$6) ON CONFLICT DO NOTHING RETURNING id`,
      [companyId, packageId, previousVersion, targetVersion, JSON.stringify({ releaseId: release.id }), userId || null]
    );
    upgradeAttemptId = insertedAttempt.rows?.[0]?.id || null;
  }
  const audit = [];
  try {
    await db(
      `UPDATE company_package_installations
          SET target_version=$1,
              update_status='UPDATING',
              last_update_at=NOW(),
              update_error=NULL,
              updated_at=NOW()
        WHERE company_id=$2 AND package_id=$3`,
      [targetVersion, companyId, packageId]
    );
    const provisioned = await deployPackageMetadata(db, {
      packageId,
      moduleId: packageDefinition.module_id,
      companyId,
      packageKey: packageDefinition.package_key,
      releaseId: release.id,
      upgradeAttemptId,
      userId,
      manifest: effectiveManifest,
      packageVersion: targetVersion,
    });
    const metadataConflicts = Array.isArray(provisioned.conflicts) ? provisioned.conflicts : [];
    const newlyAppliedMigrations = [];
    for (const migrationKey of migrationKeys) {
      const inserted = await db(
        `INSERT INTO package_installation_versions (company_id, package_id, version, migration_key, applied_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, package_id, version, migration_key) DO NOTHING
         RETURNING migration_key`,
        [companyId, packageId, targetVersion, migrationKey, userId || null]
      );
      if (inserted.rows?.length) newlyAppliedMigrations.push(migrationKey);
    }
    if (newlyAppliedMigrations.length) {
      await writeReleaseAudit(db, {
        companyId,
        userId,
        action: "release.migrations.applied",
        releaseId: release.id,
        metadata: { packageKey: packageDefinition.package_key, version: targetVersion, migrationCount: newlyAppliedMigrations.length },
      });
    }
    await db(
      `UPDATE company_package_installations
          SET version=$1,
              installed_version=$1,
              target_version=$1,
              update_status='CURRENT',
              auto_update_policy=CASE WHEN $2='FORCED' THEN 'FORCED' ELSE COALESCE(auto_update_policy, $2) END,
              last_update_at=NOW(),
              update_error=NULL,
              updated_at=NOW()
        WHERE company_id=$3 AND package_id=$4`,
      [targetVersion, normalizeUpdatePolicy(release.updatePolicy || release.update_policy || "OPTIONAL"), companyId, packageId]
    );
    if (metadataConflicts.length) {
      await db(
        `UPDATE company_package_installations
            SET update_status='CONFLICT',update_error='Customer metadata overrides were preserved; admin review required.',updated_at=NOW()
          WHERE company_id=$1 AND package_id=$2`,
        [companyId, packageId]
      );
      await writeReleaseAudit(db, {
        companyId,
        userId,
        action: "release.conflict",
        releaseId: release.id,
        result: "failure",
        metadata: {
          packageKey: packageDefinition.package_key,
          version: targetVersion,
          conflicts: metadataConflicts.map(({ metadata_type, metadata_id }) => ({ metadataType: metadata_type, metadataId: metadata_id })),
        },
      });
    }
    await db(
      `UPDATE package_upgrade_history
          SET status='COMPLETED', completed_at=NOW(), metadata=$1::jsonb
        WHERE company_id=$2 AND package_id=$3 AND to_version=$4 AND status='RUNNING'
          AND metadata->>'releaseId'=$5`,
      [JSON.stringify({ releaseId, result: "success", previousVersion, targetVersion, migrationCount: newlyAppliedMigrations.length, metadataDeploymentId: provisioned.deploymentId }), companyId, packageId, targetVersion, String(releaseId)]
    );
    await writeReleaseAudit(db, { companyId, userId, action: "release.tenant.upgraded", releaseId: release.id, metadata: { packageKey: packageDefinition.package_key, fromVersion: previousVersion, toVersion: targetVersion, policy: normalizeUpdatePolicy(release.updatePolicy || release.update_policy || "OPTIONAL"), migrationCount: migrationKeys.length } });
    audit.push({ action: "release.tenant.upgraded", companyId, releaseId: release.id, result: "success" });
    return { companyId, packageKey: packageDefinition.package_key, releaseId: release.id, upgradeAttemptId, metadataDeploymentId: provisioned.deploymentId, status: metadataConflicts.length ? "CONFLICT" : "CURRENT", installedVersion: targetVersion, previousVersion, targetVersion, migrations: migrationKeys.map((migrationKey) => ({ migrationKey })), conflicts: metadataConflicts, audit };
  } catch (error) {
    const conflict = /override|custom|user.modified|ownership|conflict/i.test(String(error.message || error));
    const failureCode = conflict ? "RELEASE_CONFLICT" : "RELEASE_UPGRADE_FAILED";
    const updateStatus = conflict ? "CONFLICT" : "FAILED";
    const safeMessage = conflict ? "Release conflict requires admin review." : "Release upgrade failed.";
    await db(
      `UPDATE package_upgrade_history
          SET status='FAILED', error_text=$1, completed_at=NOW(), metadata=$2::jsonb
        WHERE company_id=$3 AND package_id=$4 AND to_version=$5
          AND status='RUNNING' AND metadata->>'releaseId'=$6`,
      [failureCode, JSON.stringify({ releaseId, result: "failure", errorCode: failureCode }), companyId, packageId, targetVersion, releaseId]
    );
    await db(
      `UPDATE company_package_installations
          SET update_status=$1,
              update_error=$2,
              last_update_at=NOW(),
              updated_at=NOW()
        WHERE company_id=$3 AND package_id=$4`,
      [updateStatus, safeMessage, companyId, packageId]
    );
    const action = conflict ? "release.conflict" : "release.tenant.failed";
    await writeReleaseAudit(db, { companyId, userId, action, releaseId: release.id, result: "failure", metadata: { packageKey: packageDefinition.package_key, fromVersion: previousVersion, toVersion: targetVersion, errorCode: failureCode } });
    audit.push({ action, companyId, releaseId: release.id, result: "failure" });
    return { companyId, packageKey: packageKey || release.packageKey, releaseId: release.id, status: updateStatus, installedVersion: previousVersion, previousVersion, targetVersion, migrations: [], audit };
  }
}

export async function rollbackPackageRelease({ db, releaseId, companyId, userId = null } = {}) {
  const release = await getPackageReleaseById(db, releaseId);
  let packageRow = await db(
    `SELECT id, package_key FROM package_registry WHERE package_key=$1 AND active=true`,
    [release.packageKey]
  );
  if (!packageRow?.rows?.length) throw new Error("Package not found");
  const packageId = packageRow.rows[0].id;
  const current = await db(
    `SELECT id, version, installed_version, previous_version, target_version, update_status
       FROM company_package_installations
      WHERE company_id=$1 AND package_id=$2`,
    [companyId, packageId]
  );
  const currentRow = current.rows[0] || null;
  if (!currentRow) throw new Error("Package is not installed for this company");
  const previousInstalledVersion = String(currentRow?.installed_version || currentRow?.version || "0.0.0").trim();
  const rollbackVersion = String(release.previousVersion || currentRow?.version || currentRow?.installed_version || "0.0.0").trim();
  const restored = String(rollbackVersion || "0.0.0").trim();
  const completedRollback = await db(
    `SELECT metadata FROM package_upgrade_history
      WHERE company_id=$1 AND package_id=$2 AND migration_key='release.rollback'
        AND metadata->>'releaseId'=$3 AND metadata->>'action'='rollback'
      ORDER BY started_at DESC LIMIT 1`,
    [companyId, packageId, String(release.id)]
  );
  if (completedRollback.rows?.[0]?.metadata) {
    return { releaseId, companyId, ...completedRollback.rows[0].metadata, alreadyRolledBack: true };
  }
  const attempt = await db(
    `SELECT metadata FROM package_upgrade_history
      WHERE company_id=$1 AND package_id=$2 AND to_version=$3 AND status='COMPLETED'
        AND metadata->>'releaseId'=$4
      ORDER BY started_at DESC LIMIT 1`,
    [companyId, packageId, previousInstalledVersion, String(release.id)]
  );
  const metadataDeploymentId = attempt.rows?.[0]?.metadata?.metadataDeploymentId || null;
  let metadataRollback;
  if (metadataDeploymentId) {
    metadataRollback = await rollbackMetadataDeployment(db, { companyId, deploymentId: metadataDeploymentId, userId });
  } else {
    const changes = Array.isArray(release.change_set) ? release.change_set : [];
    metadataRollback = {
      status: changes.length ? "NOT_PERFORMED" : "NOT_REQUIRED",
      reverted: 0,
      skipped: 0,
      conflicts: [],
      failed: 0,
      nonReversible: changes.length,
      migrationsNotReversed: 0,
    };
  }
  const migrationHistory = await db(
    `SELECT COUNT(*)::int AS count,COALESCE(json_agg(migration_key),'[]'::json) AS keys
       FROM package_installation_versions WHERE company_id=$1 AND package_id=$2 AND version=$3`,
    [companyId, packageId, previousInstalledVersion]
  );
  const migrationsNotReversed = Number(migrationHistory.rows?.[0]?.count) || 0;
  metadataRollback.migrationsNotReversed = migrationsNotReversed;
  metadataRollback.migrationKeysPreserved = migrationHistory.rows?.[0]?.keys || [];
    const conflictCount = Array.isArray(metadataRollback.conflicts)
      ? metadataRollback.conflicts.length
      : Number(metadataRollback.conflicts) || 0;
  const nonReversibleCount = metadataRollback.nonReversible || 0;
  const result = conflictCount ? "rolled_back_with_conflicts" : (nonReversibleCount || metadataRollback.failed ? "partial_rollback" : "rolled_back");
  await db(
    `UPDATE company_package_installations
        SET version=$1,
            installed_version=$1,
            target_version=$1,
            update_status=$2,
            last_update_at=NOW(),
            update_error=NULL,
            updated_at=NOW()
      WHERE company_id=$3 AND package_id=$4`,
    [restored, conflictCount ? "CONFLICT" : "CURRENT", companyId, packageId]
  );
  const rollbackSummary = {
    action: "rollback",
    releaseId: release.id,
    packageKey: release.packageKey,
    packageVersionBefore: previousInstalledVersion,
    packageVersionAfter: restored,
    finalState: result,
    metadataRollback,
  };
  await db(
    `INSERT INTO package_upgrade_history
      (company_id, package_id, from_version, to_version, status, migration_key, metadata, created_by, completed_at)
     VALUES ($1,$2,$3,$4,'COMPLETED','release.rollback',$5::jsonb,$6,NOW())`,
    [companyId, packageId, previousInstalledVersion, restored, JSON.stringify(rollbackSummary), userId || null]
  );
  const audit = [{ action: "release.rollback", companyId, releaseId, result, version: restored, metadataRollback }];
  await writeReleaseAudit(db, { companyId, userId, action: "release.rollback", releaseId: release.id, result: conflictCount ? "failure" : "success", metadata: rollbackSummary });
  return { releaseId, companyId, ...rollbackSummary, result, version: restored, audit };
}

export function determineInstalledVersionState({ installedVersion = null, targetVersion = null, updateStatus = null, latestVersion = null, autoUpdatePolicy = "OPTIONAL" } = {}) {
  const current = String(installedVersion || "").trim();
  const target = String(targetVersion || latestVersion || "").trim();
  const status = normalizeInstallationUpdateStatus(updateStatus);
  if (["QUEUED", "UPDATING", "FAILED", "CONFLICT", "CURRENT_AFTER_UPDATE", "ROLLBACK_REQUIRED"].includes(status)) return status;
  if (!current) return status === "FAILED" ? "FAILED" : "CURRENT";
  if (target && current !== target) {
    return "UPDATE_AVAILABLE";
  }
  if (String(autoUpdatePolicy || "").trim().toUpperCase() === "FORCED") return "UPDATE_AVAILABLE";
  if (!target) return "CURRENT";
  return "CURRENT";
}

export function companyPackageUpdateState({ installedVersion, targetVersion, updateStatus, latestVersion, autoUpdatePolicy }) {
  const normalized = determineInstalledVersionState({ installedVersion, targetVersion, updateStatus, latestVersion, autoUpdatePolicy });
  return {
    installedVersion: String(installedVersion || "").trim() || null,
    targetVersion: String(targetVersion || latestVersion || "").trim() || null,
    updateStatus: normalized,
    autoUpdatePolicy: normalizeUpdatePolicy(autoUpdatePolicy),
    auto_update_policy: normalizeUpdatePolicy(autoUpdatePolicy),
  };
}

export const ensureReleaseTablesSql = `
  CREATE TABLE IF NOT EXISTS package_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_key VARCHAR(100) NOT NULL,
    version VARCHAR(40) NOT NULL,
    previous_version VARCHAR(40),
    release_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','PUBLISHED','PAUSED','ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    minimum_platform_version VARCHAR(40),
    update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL' CHECK (update_policy IN ('OPTIONAL','FORCED','STAGED')),
    change_set JSONB NOT NULL DEFAULT '[]'::jsonb,
    manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb
  );
  ALTER TABLE package_releases ADD COLUMN IF NOT EXISTS manifest JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_package_releases_package_status ON package_releases(package_key, status, published_at DESC);

  ALTER TABLE company_package_installations
    ADD COLUMN IF NOT EXISTS installed_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS target_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS update_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT' CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED')),
    ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS update_error TEXT,
    ADD COLUMN IF NOT EXISTS auto_update_policy VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL' CHECK (auto_update_policy IN ('OPTIONAL','FORCED','STAGED'));

  ALTER TABLE company_package_installations
    DROP CONSTRAINT IF EXISTS company_package_installations_update_status_check;
  ALTER TABLE company_package_installations
    ADD CONSTRAINT company_package_installations_update_status_check
    CHECK (update_status IN ('CURRENT','UPDATE_AVAILABLE','QUEUED','UPDATING','FAILED','CONFLICT','CURRENT_AFTER_UPDATE','ROLLBACK_REQUIRED'));

  UPDATE company_package_installations
     SET installed_version = version,
         target_version = version,
         update_status = CASE WHEN status='active' THEN 'CURRENT' ELSE update_status END,
         auto_update_policy = COALESCE(auto_update_policy, 'OPTIONAL')
   WHERE installed_version IS NULL;
`;
