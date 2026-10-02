import { redactAuditDetails } from "./auditLog.js";
import { capturePackageMetadataSnapshot, provisionPackageMetadata } from "./packageRegistry.js";
import { packageVersionHasEntitlement } from "./packageEntitlements.js";

const SAFE_KEY = /^[a-z_][a-z0-9_]{0,99}$/;
const TYPES = ["objects", "fields", "relationships", "recordTypes", "layouts", "rules", "reports", "listViews", "apps", "pages", "packages"];
const SECRET_KEY = /password|oauth|access.?token|refresh.?token|api.?key|secret|credential|encryption.?key|private.?key|database.?url|payment.?card|cvv|jwt/i;

export const deploymentSchema = `
  CREATE TABLE IF NOT EXISTS platform_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source_company_id UUID, package_key VARCHAR(200) NOT NULL, package_version VARCHAR(80) NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('dry_run','success','failed','rolled_back','partial')),
    deployed_by UUID REFERENCES users(id) ON DELETE SET NULL, summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS platform_deployment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id UUID NOT NULL REFERENCES platform_deployments(id) ON DELETE CASCADE,
    metadata_type VARCHAR(40) NOT NULL, metadata_key VARCHAR(300) NOT NULL, operation VARCHAR(20) NOT NULL,
    reversible BOOLEAN NOT NULL DEFAULT TRUE, before_state JSONB, after_state JSONB, error TEXT,
    rollback_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
  );
  ALTER TABLE platform_deployment_items ADD COLUMN IF NOT EXISTS error TEXT;
  ALTER TABLE platform_deployment_items ADD COLUMN IF NOT EXISTS rollback_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
  CREATE INDEX IF NOT EXISTS idx_platform_deployments_company ON platform_deployments(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_platform_deployment_items_deployment ON platform_deployment_items(deployment_id);
`;

function companyIdOf(value) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("A valid target company ID is required");
  return id;
}

function inspectSecrets(value, path = "manifest") {
  if (value === null || value === undefined) return;
  if (typeof value === "string" && SECRET_KEY.test(path)) throw new Error(`Portable metadata cannot contain secret field: ${path}`);
  if (Array.isArray(value)) return value.forEach((item, index) => inspectSecrets(item, `${path}[${index}]`));
  if (typeof value === "object") Object.entries(value).forEach(([key, item]) => inspectSecrets(item, `${path}.${key}`));
}

const objectKey = (item) => item?.objectKey || item?.object_key || item?.key;
const fieldKey = (item) => `${objectKey(item)}.${item?.apiName || item?.api_name}`;
const layoutKey = (item) => `${objectKey(item)}:${item?.pageType || item?.page_type}:${item?.layoutKey || item?.layout_key}`;
const ruleKey = (item) => `${objectKey(item)}:${item?.apiKey || item?.api_key || item?.name}`;

const SNAPSHOT_TYPES = new Set([
  "object", "field", "relationship", "recordType", "layout", "workflow", "validation",
  "report", "list_view", "action", "button", "permission", "field_permission", "connector",
  "template", "app", "page",
]);

const ROLLBACK_METADATA = Object.freeze({
  object: { table: "platform_objects", owner: "package_id", columns: ["label", "plural_label", "description", "source_table", "store_scoped", "active", "source_package_version", "managed", "package_required"] },
  field: { table: "platform_fields", owner: "source_package_id", columns: ["label", "field_type", "source_column", "required", "readable", "writable", "options", "config", "display_order", "active", "source_package_version", "managed", "package_required"] },
  relationship: { table: "platform_relationships", owner: "source_package_id", columns: ["child_object_id", "relationship_type", "active", "source_package_version", "managed", "package_required"] },
  layout: { table: "platform_layouts", owner: "source_package_id", columns: ["name", "layout_key", "definition", "active", "is_default", "source_package_version", "managed", "package_required"] },
  workflow: { table: "platform_rules", owner: "source_package_id", columns: ["trigger_key", "conditions", "action", "active", "lifecycle_status", "source_package_version", "managed", "package_required"] },
  validation: { table: "platform_rules", owner: "source_package_id", columns: ["trigger_key", "conditions", "action", "active", "lifecycle_status", "source_package_version", "managed", "package_required"] },
  report: { table: "platform_reports", owner: "source_package_id", columns: ["label", "description", "config", "active", "source_package_version", "managed", "package_required"] },
  list_view: { table: "platform_list_views", owner: "source_package_id", columns: ["label", "description", "columns", "filters", "sort", "page_size", "is_default", "active", "source_package_version", "managed", "package_required"] },
  action: { table: "platform_registered_actions", owner: "source_package_id", columns: ["object_id", "action_key", "label", "description", "handler_key", "required_permission", "config", "active", "source_package_version", "managed", "package_required"] },
  button: { table: "platform_buttons", owner: "source_package_id", columns: ["object_id", "button_key", "label", "action_key", "placement", "visibility_rule", "config", "active", "target_type", "target_key", "variant", "required_permission", "input_mappings", "source_package_version", "managed", "package_required"] },
  permission: { table: "platform_object_permissions", owner: "source_package_id", columns: ["can_view", "can_create", "can_edit", "can_delete", "source_package_version", "managed", "package_required"] },
  field_permission: { table: "platform_field_security", owner: "source_package_id", columns: ["readable", "writable", "source_package_version", "managed", "package_required"] },
  connector: { table: "platform_connector_definitions", owner: "source_package_id", columns: ["name", "description", "publisher", "auth_type", "base_url", "credentials_schema", "operations", "timeout_ms", "retry_policy", "status", "source_package_version", "managed", "package_required"] },
  template: { table: "platform_message_templates", owner: "source_package_id", columns: ["name", "description", "channel", "subject", "body", "active", "source_package_version", "managed", "package_required"] },
  app: { table: "platform_apps", owner: "source_package_id", columns: ["label", "description", "config", "active", "source_package_version", "managed", "package_required"] },
  page: { table: "platform_pages", owner: "source_package_id", columns: ["label", "route_path", "page_type", "definition", "active", "source_package_version", "managed", "package_required"] },
});

function comparableMetadataState(state, columns) {
  return JSON.stringify(Object.fromEntries(columns.map((column) => [column, state?.[column] ?? null])));
}

function metadataSnapshotKey(type, item) {
  const state = item.state || {};
  return String(state.api_key || state.object_key || state.api_name || state.relationship_key || state.layout_key || state.view_key || state.action_key || state.button_key || state.app_key || state.page_key || state.name || item.metadataId);
}

export async function deployPackageMetadata(db, {
  companyId: rawCompanyId,
  packageId,
  moduleId,
  packageKey,
  packageVersion,
  manifest = {},
  releaseId = null,
  upgradeAttemptId = null,
  userId = null,
  writeAudit = null,
} = {}) {
  const companyId = companyIdOf(rawCompanyId);
  const before = await capturePackageMetadataSnapshot(db, { packageId, companyId });
  const provisioned = await provisionPackageMetadata(db, { packageId, moduleId, companyId, manifest, packageVersion });
  const after = await capturePackageMetadataSnapshot(db, { packageId, companyId });
  const beforeByKey = new Map(before.map((item) => [`${item.metadataType}:${item.metadataId}`, item]));
  const afterByKey = new Map(after.map((item) => [`${item.metadataType}:${item.metadataId}`, item]));
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const changed = [];
  for (const key of keys) {
    const previous = beforeByKey.get(key) || null;
    const next = afterByKey.get(key) || null;
    if (JSON.stringify(previous?.state ?? null) === JSON.stringify(next?.state ?? null)) continue;
    const item = next || previous;
    changed.push({
      type: item.metadataType,
      key: metadataSnapshotKey(item.metadataType, item),
      id: item.metadataId,
      operation: previous ? (next ? "update" : "delete") : "create",
      reversible: SNAPSHOT_TYPES.has(item.metadataType),
      beforeState: previous?.state || null,
      afterState: next?.state || null,
    });
  }
  const summary = {
    creates: changed.filter((item) => item.operation === "create").length,
    updates: changed.filter((item) => item.operation === "update").length,
    deletes: changed.filter((item) => item.operation === "delete").length,
    nonReversible: changed.filter((item) => !item.reversible).length,
  };
  const deployment = await db(
    `INSERT INTO platform_deployments (company_id,package_key,package_version,status,deployed_by,summary,completed_at)
     VALUES ($1,$2,$3,'success',$4,$5::jsonb,NOW()) RETURNING id`,
    [companyId, `release:${packageKey}:${releaseId || "upgrade"}`, packageVersion, userId, JSON.stringify({ ...summary, releaseId, upgradeAttemptId })]
  );
  const deploymentId = deployment.rows[0].id;
  for (const item of changed) {
    await db(
      `INSERT INTO platform_deployment_items
        (deployment_id,metadata_type,metadata_key,operation,reversible,before_state,after_state,error)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [deploymentId, item.type, item.key, item.operation, item.reversible, JSON.stringify(item.beforeState), JSON.stringify(item.afterState), item.reversible ? null : "NON_REVERSIBLE: no generic metadata rollback handler"]
    );
  }
  await writeAudit?.object({
    companyId,
    userId,
    action: "metadata.package.deployed",
    entityType: "platform_deployment",
    entityId: deploymentId,
    result: "success",
    metadata: { packageKey, packageVersion, releaseId, upgradeAttemptId, summary },
  });
  return { ...provisioned, deploymentId, changed, summary };
}

function collectFieldReferences(value, references = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => collectFieldReferences(item, references));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
    if (["field", "fieldKey", "field_key", "fieldApiName", "field_api_name", "sourceField", "source_field", "targetField", "target_field"].includes(key) && typeof item === "string") references.add(item);
    collectFieldReferences(item, references);
  });
  return references;
}

export function validateDeploymentManifest(manifest = {}) {
  inspectSecrets(manifest);
  const objects = Array.isArray(manifest.objects) ? manifest.objects : [];
  const fields = objects.flatMap((item) => (item.fields || []).map((field) => ({ ...field, objectKey: objectKey(item) })));
  const relationships = manifest.relationships || [];
  const layouts = [...(manifest.layouts || []), ...(manifest.recordForms || [])];
  const recordTypes = Array.isArray(manifest.recordTypes) ? manifest.recordTypes : [];
  const rules = Array.isArray(manifest.rules) ? manifest.rules : [];
  const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const packages = Array.isArray(manifest.packages) ? manifest.packages : [];
  const dashboards = Array.isArray(manifest.dashboards) ? manifest.dashboards.map((item) => {
    const dashboardKey = item?.dashboardKey || item?.dashboard_key;
    if (!SAFE_KEY.test(dashboardKey || "")) throw new Error("Every dashboard needs a safe dashboard key");
    const name = String(item.name || "").trim();
    const runAsMode = String(item.run_as_mode || "VIEWER").toUpperCase();
    const components = Array.isArray(item.components) ? item.components.slice(0, 50) : null;
    const filters = Array.isArray(item.filters) ? item.filters.slice(0, 10) : null;
    if (!name || name.length > 150 || !components || !filters) throw new Error(`Dashboard ${dashboardKey} has an invalid definition`);
    if (runAsMode !== "VIEWER") throw new Error(`Dashboard ${dashboardKey} uses an unsupported run-as mode`);
    for (const component of components) {
      if (!component || !["kpi", "chart", "pie", "donut", "bar", "table", "text"].includes(String(component.type))) throw new Error(`Dashboard ${dashboardKey} has an invalid component`);
      if (component.type !== "text" && !component.config?.reportId && !component.config?.report) throw new Error(`Dashboard ${dashboardKey} has a component without a report`);
    }
    const definition = { name, description: String(item.description || "").slice(0, 500), run_as_mode: runAsMode, components, filters };
    const normalizePrincipals = (entries) => (Array.isArray(entries) ? entries : []).map((entry) => {
      const type = String(entry.principalType || entry.principal_type || "").toUpperCase();
      const key = String(entry.principalKey || entry.principal_key || "").trim();
      if (!["USER", "ROLE", "PUBLIC_GROUP", "COMPANY"].includes(type)) throw new Error(`Dashboard ${dashboardKey} has an unsupported principal type`);
      const accessLevel = String(entry.accessLevel || entry.access_level || "VIEW").toUpperCase();
      if (entry.accessLevel !== undefined || entry.access_level !== undefined) {
        if (!["VIEW", "EDIT", "MANAGE"].includes(accessLevel)) throw new Error(`Dashboard ${dashboardKey} has an invalid access level`);
      }
      if (entry.priority !== undefined && !Number.isInteger(Number(entry.priority))) throw new Error(`Dashboard ${dashboardKey} has an invalid default priority`);
      if (entry.portable === false || !key) return { principal_type: type, principal_key: null, portable: false, source_principal_id: entry.sourcePrincipalId || null, access_level: entry.accessLevel || entry.access_level, priority: entry.priority, active: entry.active !== false };
      if (type === "COMPANY" && key !== "company") throw new Error(`Dashboard ${dashboardKey} must use the target-company key`);
      return { principal_type: type, principal_key: key, portable: true, access_level: entry.accessLevel || entry.access_level, priority: entry.priority, active: entry.active !== false };
    });
    return { ...definition, dashboardKey, access: normalizePrincipals(item.access), default_assignments: normalizePrincipals(item.defaultAssignments || item.default_assignments) };
  }) : [];
  if (!objects.length && !dashboards.length) throw new Error("Deployment package must contain at least one object or dashboard");
  const objectKeys = new Set();
  for (const object of objects) {
    if (!SAFE_KEY.test(objectKey(object) || "") || typeof object.label !== "string") throw new Error("Every object needs a safe API key and label");
    if (objectKeys.has(objectKey(object))) throw new Error(`Duplicate object: ${objectKey(object)}`);
    objectKeys.add(objectKey(object));
  }
  const fieldKeys = new Set();
  for (const field of fields) {
    if (!objectKeys.has(objectKey(field)) || !SAFE_KEY.test(field.apiName || field.api_name || "")) throw new Error(`Field references a missing or unsafe object: ${fieldKey(field)}`);
    if (!field.fieldType && !field.field_type) throw new Error(`Field type is required: ${fieldKey(field)}`);
    if (fieldKeys.has(fieldKey(field))) throw new Error(`Duplicate field: ${fieldKey(field)}`);
    fieldKeys.add(fieldKey(field));
  }
  for (const relationship of relationships) {
    if (!objectKeys.has(relationship.parentObjectKey || relationship.parent_object_key) || !objectKeys.has(relationship.childObjectKey || relationship.child_object_key)) {
      throw new Error(`Relationship references a missing object: ${relationship.relationshipKey || relationship.relationship_key || "(missing)"}`);
    }
    if (!SAFE_KEY.test(relationship.relationshipKey || relationship.relationship_key || "")) throw new Error("Relationship API keys must be safe");
  }
  for (const layout of layouts) {
    if (!objectKeys.has(objectKey(layout)) || !SAFE_KEY.test(layout.layoutKey || layout.layout_key || "")) throw new Error(`Layout references a missing object: ${layoutKey(layout)}`);
  }
  for (const view of manifest.listViews || []) if (!objectKeys.has(objectKey(view)) || !SAFE_KEY.test(view.viewKey || view.view_key || "")) throw new Error(`List view references a missing object: ${view.viewKey || view.view_key || "(missing)"}`);
  const appKeys = new Set(apps.map((app) => app.appKey || app.app_key));
  for (const app of apps) if (!SAFE_KEY.test(app.appKey || app.app_key || "") || typeof app.label !== "string") throw new Error("Apps need safe API keys and labels");
  for (const page of pages) if (!appKeys.has(page.appKey || page.app_key) || !SAFE_KEY.test(page.pageKey || page.page_key || "") || typeof page.label !== "string") throw new Error(`Page references a missing app: ${page.pageKey || page.page_key || "(missing)"}`);
  for (const type of recordTypes) if (!objectKeys.has(objectKey(type)) || !SAFE_KEY.test(type.recordTypeKey || type.record_type_key || "")) throw new Error(`Record Type references a missing object: ${type.recordTypeKey || type.record_type_key || "(missing)"}`);
  for (const rule of rules) if (!objectKeys.has(objectKey(rule)) || !rule.name) throw new Error(`Workflow references a missing object: ${rule.name || "(missing)"}`);
  return { objects, fields, relationships, layouts, rules, reports: manifest.reports || [], recordTypes, listViews: manifest.listViews || [], apps, pages, packages, dashboards };
}

export function dependencyOrder(manifest) {
  const normalized = validateDeploymentManifest(manifest);
  return [
    ...normalized.objects.map((item) => ({ type: "object", key: objectKey(item) })),
    ...normalized.fields.map((item) => ({ type: "field", key: fieldKey(item), dependsOn: [objectKey(item)] })),
    ...normalized.relationships.map((item) => ({ type: "relationship", key: item.relationshipKey || item.relationship_key, dependsOn: [item.parentObjectKey || item.parent_object_key, item.childObjectKey || item.child_object_key] })),
    ...normalized.recordTypes.map((item) => ({ type: "recordType", key: `${objectKey(item)}:${item.recordTypeKey || item.record_type_key}`, dependsOn: [objectKey(item)] })),
    ...normalized.layouts.map((item) => ({ type: "layout", key: layoutKey(item), dependsOn: [objectKey(item)] })),
    ...normalized.apps.map((item) => ({ type: "app", key: item.appKey || item.app_key, dependsOn: [] })),
    ...normalized.pages.map((item) => ({ type: "page", key: `${item.appKey || item.app_key}:${item.pageKey || item.page_key}`, dependsOn: [item.appKey || item.app_key] })),
    ...normalized.rules.map((item) => ({ type: "rule", key: ruleKey(item), dependsOn: [objectKey(item), ...(item.dependsOn || [])] })),
    ...normalized.reports.map((item) => ({ type: "report", key: `${objectKey(item)}:${item.reportKey || item.report_key}`, dependsOn: [objectKey(item)] })),
    ...normalized.listViews.map((item) => ({ type: "listView", key: `${objectKey(item)}:${item.viewKey || item.view_key}`, dependsOn: [objectKey(item)] })),
    ...normalized.packages.map((item) => ({ type: "package", key: item.packageKey || item.package_key, dependsOn: item.dependencies || [], reversible: false })),
    ...normalized.dashboards.map((item) => ({ type: "dashboard", key: item.dashboardKey, dependsOn: [] })),
  ];
}

async function resolveDashboardPrincipal(db, companyId, entry) {
  if (!entry.portable || !entry.principal_key) return null;
  if (entry.principal_type === "COMPANY") return entry.principal_key === "company" ? companyId : null;
  if (entry.principal_type === "USER") {
    const result = await db("SELECT id FROM users WHERE company_id=$1 AND username=$2 AND active=true", [companyId, entry.principal_key]);
    return result.rows?.[0]?.id || null;
  }
  if (entry.principal_type === "PUBLIC_GROUP") {
    const result = await db("SELECT id FROM platform_public_groups WHERE company_id=$1 AND api_key=$2 AND active=true", [companyId, entry.principal_key]);
    return result.rows?.[0]?.id || null;
  }
  if (entry.principal_type === "ROLE") {
    const result = await db("SELECT id FROM roles WHERE company_id=$1 AND api_key=$2", [companyId, entry.principal_key]);
    return result.rows?.[0]?.id || null;
  }
  return null;
}

export async function planMetadataDeployment(db, { companyId: rawCompanyId, manifest } = {}) {
  const companyId = companyIdOf(rawCompanyId);
  const normalized = validateDeploymentManifest(manifest);
  const order = dependencyOrder(normalized);
  const conflicts = [];
  const planned = order.map((item) => ({ ...item, operation: "create", reversible: item.reversible !== false }));
  if (typeof db === "function") {
    for (const object of normalized.objects) {
      const result = await db("SELECT id,object_key,source_table FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2)", [objectKey(object), companyId]);
      const existing = result.rows?.[0];
      const plan = planned.find((item) => item.type === "object" && item.key === objectKey(object));
      if (existing) {
        if (existing.source_table && object.sourceTable && existing.source_table !== object.sourceTable) conflicts.push(`Object ${objectKey(object)} has an incompatible source table`);
        plan.operation = conflicts.length && conflicts.at(-1).includes(objectKey(object)) ? "conflict" : "update";
        plan.existingId = existing.id;
      }
    }
    for (const field of normalized.fields) {
      const objectResult = await db("SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2)", [objectKey(field), companyId]);
      if (!objectResult.rows?.length) continue;
      const result = await db("SELECT id,field_type FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3)", [objectResult.rows[0].id, field.apiName || field.api_name, companyId]);
      const existing = result.rows?.[0];
      if (existing && existing.field_type !== (field.fieldType || field.field_type)) {
        conflicts.push(`Field ${fieldKey(field)} has an incompatible type`);
        const plan = planned.find((item) => item.type === "field" && item.key === fieldKey(field));
        if (plan) plan.operation = "conflict";
      }
    }
    for (const type of normalized.recordTypes) {
      const objectResult = await db("SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2)", [objectKey(type), companyId]);
      if (!objectResult.rows?.length) continue;
      const result = await db("SELECT id FROM platform_record_types WHERE object_id=$1 AND record_type_key=$2 AND company_id=$3", [objectResult.rows[0].id, type.recordTypeKey || type.record_type_key, companyId]);
      if (result.rows?.length) planned.find((item) => item.type === "recordType" && item.key.endsWith(`:${type.recordTypeKey || type.record_type_key}`)).operation = "update";
    }
    for (const app of normalized.apps) {
      const result = await db("SELECT id FROM platform_apps WHERE app_key=$1 AND company_id=$2", [app.appKey || app.app_key, companyId]);
      if (result.rows?.length) planned.find((item) => item.type === "app" && item.key === (app.appKey || app.app_key)).operation = "update";
    }
    for (const page of normalized.pages) {
      const result = await db("SELECT p.id FROM platform_pages p JOIN platform_apps a ON a.id=p.app_id WHERE a.app_key=$1 AND p.page_key=$2 AND p.company_id=$3", [page.appKey || page.app_key, page.pageKey || page.page_key, companyId]);
      if (result.rows?.length) planned.find((item) => item.type === "page" && item.key === `${page.appKey || page.app_key}:${page.pageKey || page.page_key}`).operation = "update";
    }
    for (const rule of normalized.rules) {
      const result = await db("SELECT id,action FROM platform_rules WHERE object_id=(SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1) AND name=$3 AND company_id=$2", [objectKey(rule), companyId, rule.name]);
      if (result.rows?.length) {
        const item = planned.find((candidate) => candidate.type === "rule" && candidate.key === ruleKey(rule));
        if (item) item.operation = JSON.stringify(result.rows[0].action || {}) === JSON.stringify(rule.action || {}) ? "update" : "conflict";
        if (item?.operation === "conflict") conflicts.push(`Workflow ${ruleKey(rule)} has an incompatible definition`);
      }
      const references = collectFieldReferences([rule.conditions, rule.action]);
      for (const reference of references) {
        if (reference.startsWith("$") || reference.includes(".")) continue;
        const fieldResult = await db("SELECT 1 FROM platform_fields WHERE object_id=(SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1) AND api_name=$3 AND (company_id IS NULL OR company_id=$2) LIMIT 1", [objectKey(rule), companyId, reference]);
        if (!fieldResult.rows?.length) conflicts.push(`Workflow ${ruleKey(rule)} references missing field ${reference}`);
      }
    }
    for (const pkg of normalized.packages) {
      const result = await db("SELECT id,installable,active FROM package_registry WHERE package_key=$1", [pkg.packageKey || pkg.package_key]);
      const item = planned.find((candidate) => candidate.type === "package" && candidate.key === (pkg.packageKey || pkg.package_key));
      if (!result.rows?.length || result.rows[0].active === false || result.rows[0].installable === false) { conflicts.push(`Package is unavailable or not installable: ${pkg.packageKey || pkg.package_key}`); if (item) item.operation = "conflict"; }
      else if (item) item.operation = "update";
    }
    for (const dashboard of normalized.dashboards) {
      const result = await db("SELECT id FROM dashboards WHERE company_id=$1 AND api_key=$2 AND archived_at IS NULL", [companyId, dashboard.dashboardKey]);
      const plan = planned.find((item) => item.type === "dashboard" && item.key === dashboard.dashboardKey);
      if (result.rows?.[0]) { plan.operation = "update"; plan.existingId = result.rows[0].id; }
      for (const entry of [...dashboard.access, ...dashboard.default_assignments]) {
        const resolvedPrincipalId = await resolveDashboardPrincipal(db, companyId, entry);
        if (!resolvedPrincipalId) {
          const label = entry.principal_key || entry.source_principal_id || "(missing key)";
          const message = entry.principal_type === "ROLE"
            ? `Dashboard ${dashboard.dashboardKey} has an unresolved ROLE stable key: ${label}`
            : `Dashboard ${dashboard.dashboardKey} has an unresolved ${entry.principal_type} principal: ${label}`;
          conflicts.push(message);
          if (plan) plan.operation = "conflict";
        } else entry.resolved_principal_id = resolvedPrincipalId;
      }
      for (const component of dashboard.components) {
        const reportId = component.config?.reportId;
        if (reportId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(reportId))) {
          conflicts.push(`Dashboard ${dashboard.dashboardKey} references a saved report by tenant-specific ID: ${reportId}`);
          if (plan) plan.operation = "conflict";
        }
        if (component.config?.report?.dataSource === "platform_object" && component.config.report.objectId) {
          conflicts.push(`Dashboard ${dashboard.dashboardKey} references a Platform object by tenant-specific ID`);
          if (plan) plan.operation = "conflict";
        }
      }
    }
  }
  return { companyId, valid: conflicts.length === 0, conflicts, creates: planned.filter((item) => item.operation === "create"), updates: planned.filter((item) => item.operation === "update"), skips: [], errors: [], order, manifest: normalized };
}

export async function deployMetadata(db, { companyId, manifest, packageKey = "metadata-deployment", packageVersion = "1.0.0", userId = null, sourceCompanyId = null, dryRun = false, writeAudit = null } = {}) {
  const plan = await planMetadataDeployment(db, { companyId, manifest });
  if (!plan.valid) throw new Error(`Deployment conflicts: ${plan.conflicts.join("; ")}`);
  if (dryRun) return { ...plan, status: "dry_run", changed: false };
  await db("BEGIN");
  const before = [];
  try {
    for (const object of plan.manifest.objects) {
      const existing = await db("SELECT * FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1", [objectKey(object), companyId]);
      before.push({ type: "object", key: objectKey(object), state: existing.rows?.[0] || null });
      if (existing.rows?.[0]) {
        await db("UPDATE platform_objects SET label=$1,description=$2,plural_label=$3,updated_at=NOW() WHERE id=$4 AND (company_id IS NULL OR company_id=$5)", [object.label, object.description || null, object.pluralLabel || object.plural_label || null, existing.rows[0].id, companyId]);
      } else {
        await db("INSERT INTO platform_objects (object_key,label,plural_label,description,company_id,source_table,active) VALUES ($1,$2,$3,$4,$5,$6,true)", [objectKey(object), object.label, object.pluralLabel || object.plural_label || null, object.description || null, object.metadataScope === "global" ? null : companyId, object.sourceTable || object.source_table || null]);
      }
    }
    for (const field of plan.manifest.fields) {
      const objectResult = await db("SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1", [objectKey(field), companyId]);
      const objectId = objectResult.rows?.[0]?.id;
      if (!objectId) throw new Error(`Missing deployed object for field ${fieldKey(field)}`);
      const existing = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3) LIMIT 1", [objectId, field.apiName || field.api_name, companyId]);
      before.push({ type: "field", key: fieldKey(field), state: existing.rows?.[0] || null });
      const values = [field.label, field.fieldType || field.field_type, field.sourceColumn || field.source_column || null, field.required === true, field.readable !== false, field.writable === true, JSON.stringify(field.options || []), JSON.stringify(field.config || {}), Number(field.displayOrder ?? field.display_order ?? 0)];
      if (existing.rows?.[0]) {
        if (existing.rows[0].field_type !== (field.fieldType || field.field_type)) throw new Error(`Field type mismatch: ${fieldKey(field)}`);
        await db("UPDATE platform_fields SET label=$1,source_column=$2,required=$3,readable=$4,writable=$5,options=$6::jsonb,config=$7::jsonb,display_order=$8,updated_at=NOW() WHERE id=$9 AND (company_id IS NULL OR company_id=$10)", [...values, existing.rows[0].id, companyId]);
      } else {
        await db("INSERT INTO platform_fields (object_id,api_name,label,field_type,source_column,required,readable,writable,options,config,display_order,company_id,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,true)", [objectId, field.apiName || field.api_name, ...values, field.metadataScope === "global" ? null : companyId]);
      }
    }
    const resolveObject = async (key) => {
      const result = await db("SELECT id FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2) LIMIT 1", [key, companyId]);
      if (!result.rows?.[0]?.id) throw new Error(`Missing metadata dependency: ${key}`);
      return result.rows[0].id;
    };
    for (const relationship of plan.manifest.relationships) {
      const parentId = await resolveObject(relationship.parentObjectKey || relationship.parent_object_key);
      const childId = await resolveObject(relationship.childObjectKey || relationship.child_object_key);
      const key = relationship.relationshipKey || relationship.relationship_key;
      const existing = await db("SELECT * FROM platform_relationships WHERE parent_object_id=$1 AND relationship_key=$2", [parentId, key]);
      before.push({ type: "relationship", key: `${relationship.parentObjectKey || relationship.parent_object_key}:${key}`, state: existing.rows?.[0] || null });
      if (existing.rows?.[0] && existing.rows[0].relationship_type !== (relationship.relationshipType || relationship.relationship_type)) throw new Error(`Relationship type mismatch: ${key}`);
      await db("INSERT INTO platform_relationships (parent_object_id,child_object_id,relationship_key,relationship_type,active) VALUES ($1,$2,$3,$4,true) ON CONFLICT (parent_object_id,relationship_key) DO UPDATE SET child_object_id=EXCLUDED.child_object_id,relationship_type=EXCLUDED.relationship_type,active=true", [parentId, childId, key, relationship.relationshipType || relationship.relationship_type || "lookup"]);
    }
    for (const layout of plan.manifest.layouts) {
      const objectId = await resolveObject(objectKey(layout));
      const key = layout.layoutKey || layout.layout_key;
      const pageType = layout.pageType || layout.page_type;
      const existing = await db("SELECT * FROM platform_layouts WHERE object_id=$1 AND page_type=$2 AND layout_key=$3 AND (company_id IS NULL OR company_id=$4)", [objectId, pageType, key, companyId]);
      before.push({ type: "layout", key: layoutKey(layout), state: existing.rows?.[0] || null });
      await db("INSERT INTO platform_layouts (object_id,page_type,company_id,name,layout_key,definition,active,is_default) VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,$7) ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> '' DO UPDATE SET name=EXCLUDED.name,definition=EXCLUDED.definition,active=true,is_default=EXCLUDED.is_default,updated_at=NOW()", [objectId, pageType, layout.metadataScope === "global" ? null : companyId, layout.name, key, JSON.stringify(layout.definition), layout.isDefault === true]);
    }
    for (const report of plan.manifest.reports) {
      const objectId = await resolveObject(objectKey(report));
      const key = report.reportKey || report.report_key;
      const existing = await db("SELECT * FROM platform_reports WHERE object_id=$1 AND company_id=$2 AND report_key=$3", [objectId, companyId, key]);
      before.push({ type: "report", key, state: existing.rows?.[0] || null });
      await db("INSERT INTO platform_reports (object_id,company_id,report_key,label,description,config,active) VALUES ($1,$2,$3,$4,$5,$6::jsonb,true) ON CONFLICT (object_id,company_id,report_key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,config=EXCLUDED.config,active=true,updated_at=NOW()", [objectId, companyId, key, report.label, report.description || null, JSON.stringify(report.config || {})]);
    }
    for (const view of plan.manifest.listViews) {
      const objectId = await resolveObject(objectKey(view));
      const key = view.viewKey || view.view_key;
      const existing = await db("SELECT * FROM platform_list_views WHERE object_id=$1 AND company_id=$2 AND view_key=$3 AND owner_user_id IS NULL", [objectId, companyId, key]);
      before.push({ type: "listView", key: `${objectKey(view)}:${key}`, state: existing.rows?.[0] || null });
      const values = [objectId, companyId, key, view.label, view.description || null, JSON.stringify(view.columns || []), JSON.stringify(view.filters || {}), JSON.stringify(view.sort || { field: null, direction: "asc" }), Number(view.pageSize || view.page_size || 50), view.isDefault === true || view.is_default === true];
      if (existing.rows?.[0]?.id) {
        await db(
          "UPDATE platform_list_views SET label=$4,description=$5,columns=$6::jsonb,filters=$7::jsonb,sort=$8::jsonb,page_size=$9,is_default=$10,active=true,updated_at=NOW() WHERE id=$11 AND owner_user_id IS NULL",
          [...values, existing.rows[0].id]
        );
      } else {
        await db(
          "INSERT INTO platform_list_views (object_id,company_id,owner_user_id,view_key,label,description,columns,filters,sort,page_size,is_default,active) VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,true)",
          values
        );
      }
    }
    for (const type of plan.manifest.recordTypes) {
      const objectId = await resolveObject(objectKey(type));
      const key = type.recordTypeKey || type.record_type_key;
      const existing = await db("SELECT * FROM platform_record_types WHERE object_id=$1 AND record_type_key=$2 AND company_id=$3", [objectId, key, companyId]);
      before.push({ type: "recordType", key: `${objectKey(type)}:${key}`, state: existing.rows?.[0] || null });
      await db("INSERT INTO platform_record_types (object_id,record_type_key,label,description,company_id,default_values,is_default,active) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (object_id,company_id,record_type_key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,default_values=EXCLUDED.default_values,is_default=EXCLUDED.is_default,active=EXCLUDED.active,updated_at=NOW()", [objectId, key, type.label, type.description || null, companyId, JSON.stringify(type.defaultValues || type.default_values || {}), type.isDefault === true || type.is_default === true, type.active !== false]);
    }
    for (const app of plan.manifest.apps) {
      const key = app.appKey || app.app_key;
      const existing = await db("SELECT * FROM platform_apps WHERE app_key=$1 AND company_id=$2", [key, companyId]);
      before.push({ type: "app", key, state: existing.rows?.[0] || null });
      await db("INSERT INTO platform_apps (company_id,app_key,label,description,config,active) VALUES ($1,$2,$3,$4,$5::jsonb,true) ON CONFLICT (company_id,app_key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,config=EXCLUDED.config,active=true,updated_at=NOW()", [companyId, key, app.label, app.description || null, JSON.stringify(app.config || {})]);
    }
    for (const page of plan.manifest.pages) {
      const appResult = await db("SELECT id FROM platform_apps WHERE app_key=$1 AND company_id=$2", [page.appKey || page.app_key, companyId]);
      if (!appResult.rows?.[0]?.id) throw new Error(`Missing metadata dependency: ${page.appKey || page.app_key}`);
      const key = page.pageKey || page.page_key;
      const existing = await db("SELECT * FROM platform_pages WHERE app_id=$1 AND page_key=$2 AND company_id=$3", [appResult.rows[0].id, key, companyId]);
      before.push({ type: "page", key: `${page.appKey || page.app_key}:${key}`, state: existing.rows?.[0] || null });
      await db("INSERT INTO platform_pages (app_id,company_id,page_key,label,route_path,page_type,definition,active) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,true) ON CONFLICT (app_id,company_id,page_key) DO UPDATE SET label=EXCLUDED.label,route_path=EXCLUDED.route_path,page_type=EXCLUDED.page_type,definition=EXCLUDED.definition,active=true,updated_at=NOW()", [appResult.rows[0].id, companyId, key, page.label, page.routePath || page.route_path || `/app/custom/${key}`, page.pageType || page.page_type || "page", JSON.stringify(page.definition || {})]);
    }
    for (const rule of plan.manifest.rules) {
      const objectId = await resolveObject(objectKey(rule));
      const existing = await db("SELECT * FROM platform_rules WHERE object_id=$1 AND name=$2 AND company_id=$3", [objectId, rule.name, companyId]);
      before.push({ type: "rule", key: ruleKey(rule), state: existing.rows?.[0] || null });
      const ruleValues = [rule.triggerKey || rule.trigger_key || "after_save", JSON.stringify(rule.conditions || []), JSON.stringify(rule.action || {}), rule.active !== false, companyId, rule.lifecycleStatus || rule.lifecycle_status || (rule.active === false ? "INACTIVE" : "ACTIVE")];
      if (existing.rows?.[0]) await db("UPDATE platform_rules SET trigger_key=$1,conditions=$2::jsonb,action=$3::jsonb,active=$4,lifecycle_status=$5,updated_at=NOW() WHERE id=$6 AND company_id=$7", [ruleValues[0], ruleValues[1], ruleValues[2], ruleValues[3], ruleValues[5], existing.rows[0].id, companyId]);
      else await db("INSERT INTO platform_rules (object_id,name,trigger_key,conditions,action,active,company_id,lifecycle_status) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)", [objectId, rule.name, ...ruleValues]);
    }
    for (const pkg of plan.manifest.packages) {
      const packageKeyValue = pkg.packageKey || pkg.package_key;
      const packageResult = await db("SELECT id,module_id,version,manifest,installable,active FROM package_registry WHERE package_key=$1", [packageKeyValue]);
      const packageRow = packageResult.rows?.[0];
      if (!packageRow || packageRow.active === false || packageRow.installable === false) throw new Error(`Package is unavailable or not installable: ${packageKeyValue}`);
      if (!(await packageVersionHasEntitlement(db, companyId, packageKeyValue, packageRow.version))) throw new Error(`Package version is outside the active entitlement: ${packageKeyValue}`);
      const prior = await db("SELECT * FROM company_package_installations WHERE company_id=$1 AND package_id=$2", [companyId, packageRow.id]);
      before.push({ type: "package", key: packageKeyValue, state: prior.rows?.[0] || null, reversible: false });
      await provisionPackageMetadata(db, { packageId: packageRow.id, moduleId: packageRow.module_id, companyId, manifest: packageRow.manifest || {}, packageVersion: packageRow.version });
      await db("INSERT INTO company_package_installations (company_id,package_id,version,status,installed_by) VALUES ($1,$2,$3,'active',$4) ON CONFLICT (company_id,package_id) DO UPDATE SET version=EXCLUDED.version,status='active',installed_by=COALESCE(EXCLUDED.installed_by,company_package_installations.installed_by),updated_at=NOW()", [companyId, packageRow.id, packageRow.version, userId]);
    }
    for (const dashboard of plan.manifest.dashboards) {
      const current = await db("SELECT * FROM dashboards WHERE company_id=$1 AND api_key=$2 AND archived_at IS NULL", [companyId, dashboard.dashboardKey]);
      const access = dashboard.access.map((entry) => ({ principal_type: entry.principal_type, principal_id: entry.resolved_principal_id, access_level: entry.access_level, active: entry.active }));
      const defaults = dashboard.default_assignments.map((entry) => ({ principal_type: entry.principal_type, principal_id: entry.resolved_principal_id, priority: entry.priority, active: entry.active }));
      const beforeState = current.rows?.[0] || null;
      before.push({ type: "dashboard", key: dashboard.dashboardKey, state: beforeState });
      if (beforeState) {
        await db(`UPDATE dashboards SET name=$1,description=$2,components=$3::jsonb,filters=$4::jsonb,run_as_mode='VIEWER',access=$5::jsonb,default_assignments=$6::jsonb,updated_at=NOW()
          WHERE id=$7 AND company_id=$8`, [dashboard.name, dashboard.description, JSON.stringify(dashboard.components), JSON.stringify(dashboard.filters), JSON.stringify(access), JSON.stringify(defaults), beforeState.id, companyId]);
      } else {
        await db(`INSERT INTO dashboards(company_id,created_by,name,api_key,description,components,filters,run_as_mode,access,default_assignments)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'VIEWER',$8::jsonb,$9::jsonb)`, [companyId, userId, dashboard.name, dashboard.dashboardKey, dashboard.description, JSON.stringify(dashboard.components), JSON.stringify(dashboard.filters), JSON.stringify(access), JSON.stringify(defaults)]);
      }
    }
    const summary = { creates: plan.creates.length, updates: plan.updates.length, skips: 0, errors: 0 };
    const deployment = await db("INSERT INTO platform_deployments (company_id,source_company_id,package_key,package_version,status,deployed_by,summary,completed_at) VALUES ($1,$2,$3,$4,'success',$5,$6::jsonb,NOW()) RETURNING id", [companyId, sourceCompanyId, packageKey, packageVersion, userId, JSON.stringify(summary)]);
    for (const item of before) await db("INSERT INTO platform_deployment_items (deployment_id,metadata_type,metadata_key,operation,reversible,before_state,after_state,error) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)", [deployment.rows[0].id, item.type, item.key, item.state ? "update" : "create", item.reversible !== false, JSON.stringify(item.state), JSON.stringify(null), item.reversible === false ? "NON_REVERSIBLE: canonical package metadata may be shared" : null]);
    await db("COMMIT");
    await writeAudit?.object({ companyId, userId, action: "metadata.deployment.success", entityType: "platform_deployment", entityId: deployment.rows[0].id, result: "success", metadata: { package: packageKey, version: packageVersion, summary } });
    return { ...plan, status: "success", deploymentId: deployment.rows[0].id, changed: true, summary };
  } catch (error) {
    await db("ROLLBACK");
    await writeAudit?.object({ companyId, userId, action: "metadata.deployment.failure", entityType: "platform_deployment", result: "failure", metadata: { package: packageKey, error: error.message } });
    throw error;
  }
}

async function rollbackMetadataDeploymentLegacy(db, { companyId, deploymentId, userId = null, writeAudit = null } = {}) {
  const target = companyIdOf(companyId);
  const deployment = await db("SELECT * FROM platform_deployments WHERE id=$1 AND company_id=$2 AND status='success'", [deploymentId, target]);
  if (!deployment.rows?.length) throw new Error("Deployment not found or is not rollback eligible");
  const items = await db("SELECT * FROM platform_deployment_items WHERE deployment_id=$1 ORDER BY id DESC", [deploymentId]);
  await db("BEGIN");
  try {
    for (const item of items.rows || []) {
      if (item.metadata_type === "package") {
        if (item.before_state) await db("UPDATE company_package_installations SET version=$1,status=$2,selected_features=$3::jsonb,updated_at=NOW() WHERE company_id=$4 AND package_id=$5", [item.before_state.version, item.before_state.status, JSON.stringify(item.before_state.selected_features || []), target, item.before_state.package_id]);
        else await db("UPDATE company_package_installations SET status='inactive',updated_at=NOW() WHERE company_id=$1 AND package_id=(SELECT id FROM package_registry WHERE package_key=$2)", [target, item.metadata_key]);
        continue;
      }
      if (!item.reversible) continue;
      if (item.metadata_type === "object") {
        if (item.before_state) await db("UPDATE platform_objects SET label=$1,description=$2,plural_label=$3,source_table=$4,updated_at=NOW() WHERE id=$5 AND (company_id IS NULL OR company_id=$6)", [item.before_state.label, item.before_state.description, item.before_state.plural_label, item.before_state.source_table, item.before_state.id, target]);
        else await db("UPDATE platform_objects SET active=false,updated_at=NOW() WHERE object_key=$1 AND company_id=$2", [item.metadata_key, target]);
      }
      if (item.metadata_type === "field") {
        const [objectKeyValue, apiName] = item.metadata_key.split(".");
        if (item.before_state) await db("UPDATE platform_fields SET label=$1,field_type=$2,source_column=$3,required=$4,readable=$5,writable=$6,options=$7::jsonb,config=$8::jsonb,updated_at=NOW() WHERE id=$9 AND (company_id IS NULL OR company_id=$10)", [item.before_state.label, item.before_state.field_type, item.before_state.source_column, item.before_state.required, item.before_state.readable, item.before_state.writable, JSON.stringify(item.before_state.options || []), JSON.stringify(item.before_state.config || {}), item.before_state.id, target]);
        else await db("UPDATE platform_fields f SET active=false,updated_at=NOW() FROM platform_objects o WHERE f.object_id=o.id AND o.object_key=$1 AND f.api_name=$2 AND f.company_id=$3", [objectKeyValue, apiName, target]);
      }
      if (item.metadata_type === "recordType") {
        if (item.before_state) await db("UPDATE platform_record_types SET label=$1,description=$2,default_values=$3::jsonb,is_default=$4,active=$5,updated_at=NOW() WHERE id=$6 AND company_id=$7", [item.before_state.label, item.before_state.description, JSON.stringify(item.before_state.default_values || {}), item.before_state.is_default, item.before_state.active, item.before_state.id, target]);
        else await db("UPDATE platform_record_types SET active=false,updated_at=NOW() WHERE record_type_key=$1 AND company_id=$2", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "rule") {
        if (item.before_state) await db("UPDATE platform_rules SET trigger_key=$1,conditions=$2::jsonb,action=$3::jsonb,active=$4,lifecycle_status=$5,updated_at=NOW() WHERE id=$6 AND company_id=$7", [item.before_state.trigger_key, JSON.stringify(item.before_state.conditions || []), JSON.stringify(item.before_state.action || {}), item.before_state.active, item.before_state.lifecycle_status || "ACTIVE", item.before_state.id, target]);
        else await db("UPDATE platform_rules SET active=false,lifecycle_status='INACTIVE',updated_at=NOW() WHERE name=$1 AND company_id=$2", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "relationship") {
        const [parentKey, relationshipKey] = item.metadata_key.split(":");
        if (item.before_state) await db("UPDATE platform_relationships r SET child_object_id=$1,relationship_type=$2,active=$3 WHERE r.id=$4 AND r.parent_object_id=(SELECT id FROM platform_objects WHERE object_key=$5)", [item.before_state.child_object_id, item.before_state.relationship_type, item.before_state.active, item.before_state.id, parentKey]);
        else await db("UPDATE platform_relationships SET active=false WHERE relationship_key=$1 AND parent_object_id=(SELECT id FROM platform_objects WHERE object_key=$2)", [relationshipKey, parentKey]);
      }
      if (item.metadata_type === "layout") {
        if (item.before_state) await db("UPDATE platform_layouts SET name=$1,definition=$2::jsonb,active=$3,is_default=$4,updated_at=NOW() WHERE id=$5 AND (company_id IS NULL OR company_id=$6)", [item.before_state.name, JSON.stringify(item.before_state.definition || {}), item.before_state.active, item.before_state.is_default, item.before_state.id, target]);
        else await db("UPDATE platform_layouts SET active=false,updated_at=NOW() WHERE layout_key=$1 AND (company_id IS NULL OR company_id=$2)", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "report") {
        if (item.before_state) await db("UPDATE platform_reports SET label=$1,description=$2,config=$3::jsonb,active=$4,updated_at=NOW() WHERE id=$5 AND company_id=$6", [item.before_state.label, item.before_state.description, JSON.stringify(item.before_state.config || {}), item.before_state.active, item.before_state.id, target]);
        else await db("UPDATE platform_reports SET active=false,updated_at=NOW() WHERE report_key=$1 AND company_id=$2", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "listView") {
        if (item.before_state) await db("UPDATE platform_list_views SET label=$1,description=$2,columns=$3::jsonb,filters=$4::jsonb,sort=$5::jsonb,page_size=$6,is_default=$7,active=$8,updated_at=NOW() WHERE id=$9 AND company_id=$10", [item.before_state.label, item.before_state.description, JSON.stringify(item.before_state.columns || []), JSON.stringify(item.before_state.filters || {}), JSON.stringify(item.before_state.sort || {}), item.before_state.page_size, item.before_state.is_default, item.before_state.active, item.before_state.id, target]);
        else await db("UPDATE platform_list_views SET active=false,updated_at=NOW() WHERE view_key=$1 AND company_id=$2", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "app") {
        if (item.before_state) await db("UPDATE platform_apps SET label=$1,description=$2,config=$3::jsonb,active=$4,updated_at=NOW() WHERE id=$5 AND company_id=$6", [item.before_state.label, item.before_state.description, JSON.stringify(item.before_state.config || {}), item.before_state.active, item.before_state.id, target]);
        else await db("UPDATE platform_apps SET active=false,updated_at=NOW() WHERE app_key=$1 AND company_id=$2", [item.metadata_key, target]);
      }
      if (item.metadata_type === "page") {
        if (item.before_state) await db("UPDATE platform_pages SET label=$1,route_path=$2,page_type=$3,definition=$4::jsonb,active=$5,updated_at=NOW() WHERE id=$6 AND company_id=$7", [item.before_state.label, item.before_state.route_path, item.before_state.page_type, JSON.stringify(item.before_state.definition || {}), item.before_state.active, item.before_state.id, target]);
        else await db("UPDATE platform_pages SET active=false,updated_at=NOW() WHERE page_key=$1 AND company_id=$2", [item.metadata_key.split(":").pop(), target]);
      }
      if (item.metadata_type === "dashboard") {
        if (item.before_state) await db(`UPDATE dashboards SET name=$1,description=$2,components=$3::jsonb,filters=$4::jsonb,run_as_mode=$5,access=$6::jsonb,default_assignments=$7::jsonb,updated_at=NOW()
          WHERE id=$8 AND company_id=$9`, [item.before_state.name, item.before_state.description, JSON.stringify(item.before_state.components || []), JSON.stringify(item.before_state.filters || []), item.before_state.run_as_mode, JSON.stringify(item.before_state.access || []), JSON.stringify(item.before_state.default_assignments || []), item.before_state.id, target]);
        else await db("UPDATE dashboards SET archived_at=NOW(),updated_at=NOW() WHERE company_id=$1 AND api_key=$2 AND archived_at IS NULL", [target, item.metadata_key]);
      }
    }
    await db("UPDATE platform_deployments SET status='rolled_back',completed_at=NOW() WHERE id=$1 AND company_id=$2", [deploymentId, target]);
    await db("COMMIT");
    await writeAudit?.object({ companyId: target, userId, action: "metadata.deployment.rollback", entityType: "platform_deployment", entityId: deploymentId, metadata: { deploymentId } });
    return { deploymentId, status: "rolled_back" };
  } catch (error) { await db("ROLLBACK"); throw error; }
}

export async function rollbackMetadataDeployment(db, { companyId, deploymentId, userId = null, writeAudit = null } = {}) {
  const target = companyIdOf(companyId);
  const deploymentResult = await db("SELECT * FROM platform_deployments WHERE id=$1 AND company_id=$2", [deploymentId, target]);
  const deployment = deploymentResult.rows?.[0];
  if (!deployment) throw new Error("Deployment not found");
  const itemResult = await db("SELECT * FROM platform_deployment_items WHERE deployment_id=$1 ORDER BY id DESC", [deploymentId]);
  const items = itemResult.rows || [];
  if (!items.some((item) => item.after_state)) {
    return rollbackMetadataDeploymentLegacy(db, { companyId: target, deploymentId, userId, writeAudit });
  }
  if (deployment.status === "rolled_back") {
    return { deploymentId, status: "rolled_back", ...(deployment.summary?.rollback || {}), alreadyRolledBack: true };
  }
  await db("BEGIN");
  const summary = { reverted: 0, skipped: 0, conflicts: 0, failed: 0, nonReversible: 0 };
  const conflicts = [];
  const packageId = deployment.summary?.packageId || null;
  try {
    let savepointIndex = 0;
    for (const item of items) {
      if (["REVERTED", "SKIPPED", "CONFLICT", "NON_REVERSIBLE"].includes(item.rollback_status)) {
        summary.skipped += 1;
        if (item.rollback_status === "CONFLICT") {
          summary.conflicts += 1;
          conflicts.push({ metadataType: item.metadata_type, metadataKey: item.metadata_key, code: item.error || "CUSTOMER_OWNED_CONFLICT" });
        }
        if (item.rollback_status === "NON_REVERSIBLE") summary.nonReversible += 1;
        continue;
      }
      const spec = ROLLBACK_METADATA[item.metadata_type];
      if (!item.reversible || !spec || item.operation === "delete") {
        summary.nonReversible += 1;
        await db("UPDATE platform_deployment_items SET rollback_status='NON_REVERSIBLE',error=COALESCE(error,'METADATA_ROLLBACK_UNSUPPORTED') WHERE id=$1", [item.id]);
        continue;
      }
      savepointIndex += 1;
      const savepoint = `rollback_item_${savepointIndex}`;
      await db(`SAVEPOINT ${savepoint}`);
      try {
        const currentResult = await db(`SELECT * FROM ${spec.table} WHERE id=$1`, [item.after_state?.id || item.before_state?.id]);
        const current = currentResult.rows?.[0] || null;
        if (!current && item.operation === "create") {
          await db("UPDATE platform_deployment_items SET rollback_status='REVERTED',error=NULL WHERE id=$1", [item.id]);
          summary.reverted += 1;
          await db(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }
        if (!current || current.user_modified === true) {
          const code = current ? "CUSTOMER_MODIFIED" : "METADATA_MISSING";
          conflicts.push({ metadataType: item.metadata_type, metadataKey: item.metadata_key, code });
          summary.conflicts += 1;
          await db("UPDATE platform_deployment_items SET rollback_status='CONFLICT',error=$1 WHERE id=$2", [code, item.id]);
          await db(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }
        const expectedOwner = item.after_state?.[spec.owner] || item.before_state?.[spec.owner];
        const currentOwner = current[spec.owner];
        if (!packageId || !expectedOwner || expectedOwner !== packageId || currentOwner !== packageId) {
          conflicts.push({ metadataType: item.metadata_type, metadataKey: item.metadata_key, code: "OWNERSHIP_CHANGED" });
          summary.conflicts += 1;
          await db("UPDATE platform_deployment_items SET rollback_status='CONFLICT',error='OWNERSHIP_CHANGED' WHERE id=$1", [item.id]);
          await db(`RELEASE SAVEPOINT ${savepoint}`);
          continue;
        }
        if (item.operation === "create") {
          if (comparableMetadataState(current, spec.columns) !== comparableMetadataState(item.after_state, spec.columns)) {
            conflicts.push({ metadataType: item.metadata_type, metadataKey: item.metadata_key, code: "CUSTOMER_VALUE_CHANGED" });
            summary.conflicts += 1;
            await db("UPDATE platform_deployment_items SET rollback_status='CONFLICT',error='CUSTOMER_VALUE_CHANGED' WHERE id=$1", [item.id]);
            await db(`RELEASE SAVEPOINT ${savepoint}`);
            continue;
          }
          await db(`UPDATE ${spec.table} SET active=false,updated_at=NOW() WHERE id=$1 AND ${spec.owner}=$2 AND user_modified=false`, [current.id, packageId]);
          await db("UPDATE package_metadata_ownership SET managed=false,updated_at=NOW() WHERE package_id=$1 AND metadata_type=$2 AND metadata_id=$3", [packageId, item.metadata_type, item.after_state.id]);
        } else {
          if (!item.before_state || comparableMetadataState(current, spec.columns) !== comparableMetadataState(item.after_state, spec.columns)) {
            conflicts.push({ metadataType: item.metadata_type, metadataKey: item.metadata_key, code: "CUSTOMER_VALUE_CHANGED" });
            summary.conflicts += 1;
            await db("UPDATE platform_deployment_items SET rollback_status='CONFLICT',error='CUSTOMER_VALUE_CHANGED' WHERE id=$1", [item.id]);
            await db(`RELEASE SAVEPOINT ${savepoint}`);
            continue;
          }
          const assignments = spec.columns.map((column) => `${column}=previous.${column}`).join(",");
          await db(
            `UPDATE ${spec.table} AS current SET ${assignments},updated_at=NOW()
               FROM jsonb_populate_record(NULL::${spec.table},$1::jsonb) AS previous
              WHERE current.id=previous.id AND current.${spec.owner}=$2 AND current.user_modified=false`,
            [JSON.stringify(item.before_state), packageId]
          );
          const oldPackageVersion = item.before_state.source_package_version || deployment.summary?.fromVersion || "0.0.0";
          await db(
            `UPDATE package_metadata_ownership SET package_version=$1,package_required=$2,
                default_snapshot=jsonb_build_object('packageVersion',$1,'metadata',$3::jsonb),managed=true,updated_at=NOW()
              WHERE package_id=$4 AND metadata_type=$5 AND metadata_id=$6`,
            [oldPackageVersion, item.before_state.package_required === true, JSON.stringify(item.before_state), packageId, item.metadata_type, item.before_state.id]
          );
        }
        await db("UPDATE platform_deployment_items SET rollback_status='REVERTED',error=NULL WHERE id=$1", [item.id]);
        summary.reverted += 1;
        await db(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        await db(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await db(`RELEASE SAVEPOINT ${savepoint}`);
        await db("UPDATE platform_deployment_items SET rollback_status='FAILED',error='METADATA_ROLLBACK_FAILED' WHERE id=$1", [item.id]);
        summary.failed += 1;
      }
    }
    const status = summary.conflicts || summary.failed || summary.nonReversible ? "partial" : "rolled_back";
    const outcome = { ...summary, conflicts };
    await db("UPDATE platform_deployments SET status=$1,summary=summary || $2::jsonb,completed_at=NOW() WHERE id=$3 AND company_id=$4", [status, JSON.stringify({ rollback: outcome }), deploymentId, target]);
    await db("COMMIT");
    await writeAudit?.object({ companyId: target, userId, action: "metadata.deployment.rollback", entityType: "platform_deployment", entityId: deploymentId, result: status === "rolled_back" ? "success" : "failure", metadata: { deploymentId, summary: outcome } });
    return { deploymentId, status, ...outcome };
  } catch (error) {
    await db("ROLLBACK");
    throw error;
  }
}

export { companyIdOf, redactAuditDetails };