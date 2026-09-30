import { comparePackageVersions } from "./packageRegistry.js";

export const PLATFORM_RUNTIME_CONTRACT_VERSION = "1.0.0";
export const PLATFORM_METADATA_SCHEMA_VERSION = 10;
export const PLATFORM_API_VERSION = "2026-09";

export function platformRuntimeContract() {
  return Object.freeze({
    runtime: "OneEngine",
    runtimeContractVersion: PLATFORM_RUNTIME_CONTRACT_VERSION,
    metadataSchemaVersion: PLATFORM_METADATA_SCHEMA_VERSION,
    apiVersion: PLATFORM_API_VERSION,
  });
}

export function validatePlatformCompatibility(requiredVersion, currentVersion = PLATFORM_RUNTIME_CONTRACT_VERSION) {
  if (!requiredVersion) return { compatible: true, requiredVersion: null, currentVersion };
  const compatible = comparePackageVersions(currentVersion, requiredVersion) >= 0;
  return {
    compatible,
    requiredVersion: String(requiredVersion),
    currentVersion: String(currentVersion),
  };
}

export function assertPlatformCompatibility(requiredVersion, currentVersion = PLATFORM_RUNTIME_CONTRACT_VERSION) {
  const result = validatePlatformCompatibility(requiredVersion, currentVersion);
  if (!result.compatible) {
    const error = new Error(
      `Package requires platform runtime ${result.requiredVersion} but current runtime is ${result.currentVersion}`
    );
    error.code = "PLATFORM_RUNTIME_INCOMPATIBLE";
    error.status = 409;
    error.compatibility = result;
    throw error;
  }
  return result;
}

export function normalizeTraceEnvelope({
  correlationId = null,
  transactionId = null,
  workflowRunId = null,
  eventId = null,
  source = null,
  executionMode = null,
  runtimeContractVersion = PLATFORM_RUNTIME_CONTRACT_VERSION,
} = {}) {
  return {
    correlationId: correlationId || transactionId || null,
    transactionId: transactionId || null,
    workflowRunId: workflowRunId || null,
    eventId: eventId || null,
    source: source || null,
    executionMode: executionMode || null,
    runtimeContractVersion,
  };
}


export async function auditPlatformConformance({ db, companyId = null } = {}) {
  if (!db || typeof db !== "function") throw new Error("Database context is required");

  const [objectIssues, fieldIssues, packageRows] = await Promise.all([
    db(
      `SELECT id,object_key,api_name,source_table
         FROM platform_objects
        WHERE active=true
          AND ($1::uuid IS NULL OR company_id IS NULL OR company_id=$1)
          AND (
            object_key IS NULL OR object_key=''
            OR api_name IS NULL OR api_name=''
            OR (source_table IS NOT NULL AND source_table !~ '^[a-z_][a-z0-9_]*$')
          )`,
      [companyId]
    ),
    db(
      `SELECT id,object_id,api_name,source_column,field_type
         FROM platform_fields
        WHERE active=true
          AND ($1::uuid IS NULL OR company_id IS NULL OR company_id=$1)
          AND (api_name IS NULL OR api_name='')`,
      [companyId]
    ),
    companyId
      ? db(
          `SELECT p.package_key,p.version,p.required_platform_version,i.installed_version,i.version AS installation_version
             FROM company_package_installations i
             JOIN package_registry p ON p.id=i.package_id
            WHERE i.company_id=$1 AND i.status='active' AND p.active=true`,
          [companyId]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const incompatiblePackages = [];
  for (const row of packageRows.rows || []) {
    const required = row.required_platform_version || null;
    const compatibility = validatePlatformCompatibility(required);
    if (!compatibility.compatible) {
      incompatiblePackages.push({
        packageKey: row.package_key,
        installedVersion: row.installed_version || row.installation_version || row.version || null,
        requiredPlatformVersion: required,
        currentPlatformVersion: compatibility.currentVersion,
      });
    }
  }

  const issues = {
    objects: objectIssues.rows || [],
    fields: fieldIssues.rows || [],
    incompatiblePackages,
  };

  return {
    ...platformRuntimeContract(),
    compliant:
      issues.objects.length === 0
      && issues.fields.length === 0
      && issues.incompatiblePackages.length === 0,
    issues,
  };
}
