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

  const [objectIssues, fieldIssues, duplicateObjects, duplicateFields, schemaDrift, relationshipIssues, packageRows] = await Promise.all([
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
    db(
      `SELECT object_key,COUNT(*)::int AS count
         FROM platform_objects
        WHERE active=true
          AND ($1::uuid IS NULL OR company_id IS NULL OR company_id=$1)
        GROUP BY object_key
       HAVING COUNT(*)>1`,
      [companyId]
    ),
    db(
      `SELECT object_id,api_name,COUNT(*)::int AS count
         FROM platform_fields
        WHERE active=true
          AND ($1::uuid IS NULL OR company_id IS NULL OR company_id=$1)
        GROUP BY object_id,api_name
       HAVING COUNT(*)>1`,
      [companyId]
    ),
    db(
      `SELECT o.id AS object_id,o.object_key,o.source_table,
              f.id AS field_id,f.api_name,f.source_column,
              CASE
                WHEN o.source_table IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM information_schema.tables t
                   WHERE t.table_schema=current_schema() AND t.table_name=o.source_table
                ) THEN 'MISSING_SOURCE_TABLE'
                WHEN f.source_column IS NOT NULL AND o.source_table IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM information_schema.columns c
                   WHERE c.table_schema=current_schema()
                     AND c.table_name=o.source_table
                     AND c.column_name=f.source_column
                ) THEN 'MISSING_SOURCE_COLUMN'
                ELSE NULL
              END AS issue
         FROM platform_objects o
         LEFT JOIN platform_fields f ON f.object_id=o.id AND f.active=true
        WHERE o.active=true
          AND ($1::uuid IS NULL OR o.company_id IS NULL OR o.company_id=$1)`,
      [companyId]
    ),
    db(
      `SELECT r.id,r.relationship_key,r.parent_object_id,r.child_object_id,r.child_field_id
         FROM platform_relationships r
         LEFT JOIN platform_objects p ON p.id=r.parent_object_id
         LEFT JOIN platform_objects c ON c.id=r.child_object_id
         LEFT JOIN platform_fields f ON f.id=r.child_field_id
        WHERE r.active=true
          AND ($1::uuid IS NULL OR p.company_id IS NULL OR p.company_id=$1)
          AND (p.id IS NULL OR c.id IS NULL OR (r.child_field_id IS NOT NULL AND f.id IS NULL))`,
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
    duplicateObjects: duplicateObjects.rows || [],
    duplicateFields: duplicateFields.rows || [],
    schemaDrift: (schemaDrift.rows || []).filter((row) => row.issue),
    relationships: relationshipIssues.rows || [],
    incompatiblePackages,
  };

  return {
    ...platformRuntimeContract(),
    compliant:
      issues.objects.length === 0
      && issues.fields.length === 0
      && issues.duplicateObjects.length === 0
      && issues.duplicateFields.length === 0
      && issues.schemaDrift.length === 0
      && issues.relationships.length === 0
      && issues.incompatiblePackages.length === 0,
    issues,
  };
}


export async function loadPlatformTrace({ db, companyId, correlationId } = {}) {
  if (!db || typeof db !== "function") throw new Error("Database context is required");
  if (!companyId || !correlationId) throw new Error("Company and correlationId are required");

  const [runs, events, history] = await Promise.all([
    db(
      `SELECT r.*,
              COALESCE((
                SELECT jsonb_agg(s ORDER BY s.step_order,s.created_at)
                  FROM platform_workflow_step_runs s
                 WHERE s.run_id=r.id
              ), '[]'::jsonb) AS steps
         FROM platform_workflow_runs r
        WHERE r.company_id=$1
          AND (r.correlation_id=$2 OR r.metadata->>'correlationId'=$2)
        ORDER BY r.started_at,r.created_at`,
      [companyId, correlationId]
    ),
    db(
      `SELECT *
         FROM platform_events
        WHERE company_id=$1 AND correlation_id=$2
        ORDER BY replay_id,created_at`,
      [companyId, correlationId]
    ),
    db(
      `SELECT *
         FROM platform_record_history
        WHERE company_id=$1 AND correlation_id=$2
        ORDER BY created_at,id`,
      [companyId, correlationId]
    ),
  ]);

  return {
    ...platformRuntimeContract(),
    correlationId,
    workflowRuns: runs.rows || [],
    events: events.rows || [],
    recordHistory: history.rows || [],
  };
}
