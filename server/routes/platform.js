import { normalizePicklistOptions, localPicklistOptions, fieldValueError, normalizeFieldValue, enrichFields, applyFieldSecurity, resolveEffectiveFieldSecurity, valueSetOptions, formatAutoNumberValue } from "../services/platformFieldValues.js";
import express from "express";
import { createHash } from "node:crypto";
import { isSafeIdentifier, toSafeApiName } from "../services/platformMetadata.js";
import { normalizeObjectPageDefinition, objectNavigationEntries, OBJECT_RUNTIME_ROUTE_PREFIX } from "../services/platformObjectNavigation.js";
import { evaluateValidationRules, validationRuleError } from "../services/platformValidation.js";
import { compileFormulas, evaluateWorkflowFormula, FormulaError, formulaReferences, isCalculatedField, normalizeRollupConfig, ROLLUP_OPERATIONS, workflowFormulaReferences } from "../services/platformFormula.js";
import { ConditionError, evaluateCondition, evaluatePlatformCondition, validateConditionConfig, validateConditionalRequired } from "../services/platformConditions.js";
import { executePlatformAutomations } from "../services/platformAutomation.js";
import { hasConfiguredCommunicationProvider } from "../services/platformWorkflow.js";
import {
  createWorkflowRun,
  executeWorkflowAction,
  executeWorkflowActions,
  getRegisteredFunction,
  getRegisteredFunctionsRegistry,
  getWorkflowActionDefinition,
  getWorkflowActionRegistry,
  getWorkflowBuilderActionRegistry,
  validateWorkflowAction,
  friendlyWorkflowError,
  workflowResultsContainStatus,
} from "../services/platformWorkflow.js";
import { decidePlatformApproval, submitPlatformApproval, reassignPlatformApproval, recallPlatformApproval, isPlatformRecordLocked } from "../services/platformApprovals.js";
import { systemObject, systemObjectRbacPermission, tenantFields, isExtensionField, safeSystemFields, hydrateExtensions, appendSystemReadScope, platformFieldSql } from "../services/platformSystemObjects.js";
import { readDomainConfiguration, saveDomainConfiguration, withDomainSave } from "../services/platformDomainRecords.js";
import { internalAppCatalog } from "../services/internalAppCatalog.js";
import { moduleRuntimeAccess } from "../services/authorization.js";
import { normalizeDeviceProfile } from "../services/runtimeAccess.js";
import { buildRecordPathCatalog, resolveWorkflowResource } from "../services/platformRecordPaths.js";
import { getCompanyEntitlements, hasEntitlement, isPackageLicensed } from "../services/licensing.js";
import { resolvePageLayout, resolveAssignedPageLayout } from "../services/platformLayoutResolver.js";
import { searchPlatformRecords } from "../services/platformSearch.js";
import { PLATFORM_FIELD_TYPE_SET } from "../services/platformFieldTypes.js";
import { listRegisteredPlatformActions } from "../services/platformActionRegistry.js";
import { listPlatformComponents } from "../services/platformComponentRegistry.js";
import { BUTTON_VARIANTS, validateButtonDefinition } from "../services/platformButtonRegistry.js";
import { loadEffectivePermissionSets, permissionSetAllowsObject, permissionSetAllowsSystemPermission } from "../services/platformPermissionSets.js";
import { buildPlatformSharingScope } from "../services/platformSharing.js";
import { hasPlatformObjectPermission } from "../services/platformReportSecurity.js";
import { configuredDuplicateRules, evaluateDuplicateRules, findConfiguredDuplicateMatches, findObjectDuplicateMatches, loadObjectDuplicateRules, resolveDuplicateAction, validateDuplicateRule } from "../services/platformDuplicateMatching.js";
import { publishPlatformEvent } from "../services/platformEvents.js";
import { buildSettingsCatalog } from "../services/settingsNavigationCatalog.js";
import { enrichRuleFieldReferences } from "../services/platformRuleReferences.js";
import { ensureSystemWorkflowCatalog } from "../services/systemWorkflowCatalog.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

const FIELD_TYPES = PLATFORM_FIELD_TYPE_SET;
const PAGE_TYPES = new Set(["list", "detail", "view", "compact", "create", "edit", "quick_create"]);
const RELATIONSHIP_TYPES = new Set(["lookup", "one_to_many", "many_to_many"]);
const RELATIONSHIP_POLICIES = new Set(["restrict", "cascade", "set_null"]);

function customObjectStorageTable(objectKey) {
  const safeKey = String(objectKey || "object").replace(/[^A-Za-z0-9_]/g, "_").slice(0, 42) || "object";
  const digest = createHash("sha1").update(String(objectKey || "object")).digest("hex").slice(0, 10);
  return `oe_${safeKey}_${digest}`.slice(0, 63);
}

function customFieldSqlType(fieldType) {
  if (["number", "decimal", "currency", "percent"].includes(fieldType)) return "NUMERIC";
  if (fieldType === "boolean") return "BOOLEAN";
  if (fieldType === "date") return "DATE";
  if (fieldType === "datetime") return "TIMESTAMPTZ";
  if (fieldType === "time") return "TIME";
  if (["address", "location", "json"].includes(fieldType)) return "JSONB";
  return "TEXT";
}

async function ensureCustomObjectStorage(db, objectKey) {
  const table = customObjectStorageTable(objectKey);
  await db(`CREATE TABLE IF NOT EXISTS "${table}" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db(`CREATE INDEX IF NOT EXISTS "${table}_company_idx" ON "${table}" (company_id)`);
  return table;
}

async function ensureCustomFieldStorage(db, object, apiName, fieldType) {
  if (!object?.source_table || !isSafeIdentifier(object.source_table) || !isSafeIdentifier(apiName)) return null;
  if (["formula", "rollup"].includes(fieldType)) return null;
  const sqlType = customFieldSqlType(fieldType);
  // Requiredness is enforced by platform validation. Keep physical columns nullable so
  // administrators can add a required field to an object that already has records.
  await db(`ALTER TABLE "${object.source_table}" ADD COLUMN IF NOT EXISTS "${apiName}" ${sqlType}`);
  return apiName;
}

function validObjectInput(body) {
  return body && (body.objectKey === undefined || (typeof body.objectKey === "string" && isSafeIdentifier(body.objectKey)))
    && (body.apiName === undefined || (typeof body.apiName === "string" && isSafeIdentifier(body.apiName)))
    && typeof body.label === "string" && body.label.trim().length > 0
    && (!body.sourceTable || isSafeIdentifier(body.sourceTable));
}

function validFieldInput(body) {
  return body && (body.apiName === undefined || (typeof body.apiName === "string" && isSafeIdentifier(body.apiName)))
    && typeof body.label === "string" && body.label.trim().length > 0
    && FIELD_TYPES.has(body.fieldType)
    && (!body.sourceColumn || isSafeIdentifier(body.sourceColumn));
}





function validValueSetInput(body) {
  return body && typeof body.label === "string" && body.label.trim().length > 0
    && (body.valueSetKey === undefined || isSafeIdentifier(body.valueSetKey));
}

function validLayoutInput(body) {
  // The historical client sends page_type (snake_case); the documented contract
  // is pageType (camelCase). Accepting both keeps every existing caller valid.
  const pageType = body?.pageType ?? body?.page_type;
  return body && typeof body.name === "string" && body.name.trim().length > 0
    && PAGE_TYPES.has(pageType) && body.definition && Array.isArray(body.definition.components);
}

const HISTORICAL_TREND_FIELD_TYPES = new Set(["number","decimal","currency","date","picklist","select","lookup"]);

async function normalizeHistoricalTrendingConfig(db, objectId, companyId, input) {
  if (input === undefined) return undefined;
  const enabled = input?.enabled === true;
  const requested = [...new Set((Array.isArray(input?.fields) ? input.fields : []).map((value) => String(value).trim()).filter(Boolean))];
  if (requested.length > 8) throw Object.assign(new Error("Historical Trending supports up to 8 fields per object"), { status: 400 });
  if (!enabled) return { enabled: false, fields: [] };
  if (!objectId) {
    if (requested.length) throw Object.assign(new Error("Historical fields can be selected after the object is created"), { status: 400 });
    return { enabled: true, fields: [] };
  }
  const result = requested.length ? await db(
    "SELECT api_name,field_type FROM platform_fields WHERE object_id=$1 AND active=true AND api_name=ANY($2::text[]) AND (company_id IS NULL OR company_id=$3)",
    [objectId, requested, companyId]
  ) : { rows: [] };
  if (result.rows.length !== requested.length) throw Object.assign(new Error("One or more Historical Trending fields are unavailable"), { status: 400 });
  const byKey = new Map(result.rows.map((field) => [String(field.api_name), String(field.field_type || "").toLowerCase()]));
  for (const key of requested) {
    if (!HISTORICAL_TREND_FIELD_TYPES.has(byKey.get(key))) throw Object.assign(new Error(`Field ${key} is not eligible for Historical Trending`), { status: 400 });
  }
  return { enabled: true, fields: requested };
}

async function validateLayoutRole(db, roleId, req) {
  if (!roleId) return true;
  const result = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [roleId, req.user.companyId]);
  return result.rows.length > 0;
}

async function normalizeLayoutAssignmentDraft(rows, objectId, req) {
  if (!Array.isArray(rows)) return [];
  if (rows.length > 100) throw Object.assign(new Error("A layout supports up to 100 assignments"), { status: 400 });
  const normalized = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw Object.assign(new Error("Each assignment must be an object"), { status: 400 });
    const appId = row.appId || row.app_id || null;
    const recordTypeId = row.recordTypeId || row.record_type_id || null;
    const roleId = row.roleId || row.role_id || null;
    const deviceProfile = String(row.deviceProfile || row.device_profile || "any").toLowerCase();
    const requiredPermissions = Array.isArray(row.requiredPermissions || row.required_permissions)
      ? [...new Set((row.requiredPermissions || row.required_permissions).map((value) => String(value).trim()).filter(Boolean))]
      : [];
    const priority = Number.isFinite(Number(row.priority)) ? Math.max(-1000, Math.min(1000, Number(row.priority))) : 0;
    if (!["any","desktop","tablet","mobile"].includes(deviceProfile)) throw Object.assign(new Error("Device must be Any, Desktop, Tablet or Mobile"), { status: 400 });
    if (requiredPermissions.some((permission) => !/^[A-Za-z0-9_.:-]{1,120}$/.test(permission))) throw Object.assign(new Error("Required permission contains an invalid permission key"), { status: 400 });
    if (appId) {
      const app = await db("SELECT id FROM platform_apps WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [appId, req.user.companyId]);
      if (!app.rows.length) throw Object.assign(new Error("Assigned app is not available"), { status: 400 });
    }
    if (recordTypeId) {
      const recordType = await db("SELECT id FROM platform_record_types WHERE id=$1 AND object_id=$2 AND active=true AND (company_id IS NULL OR company_id=$3)", [recordTypeId, objectId, req.user.companyId]);
      if (!recordType.rows.length) throw Object.assign(new Error("Assigned record type is not available for this object"), { status: 400 });
    }
    if (roleId && !(await validateLayoutRole(db, roleId, req))) throw Object.assign(new Error("Assigned role is not available"), { status: 400 });
    const signature = JSON.stringify([appId || "", recordTypeId || "", roleId || "", deviceProfile, [...requiredPermissions].sort()]);
    if (seen.has(signature)) throw Object.assign(new Error("Duplicate layout assignment"), { status: 400 });
    seen.add(signature);
    normalized.push({ appId, recordTypeId, roleId, deviceProfile, requiredPermissions, priority });
  }
  return normalized;
}

async function validateLayoutDefinition(db, definition, object, req) {
  const sections = Array.isArray(definition.sections) ? definition.sections : [];
  const components = [
    ...(Array.isArray(definition.components) ? definition.components : []),
    ...sections.flatMap((section) => Array.isArray(section.items) ? section.items : []),
  ];
  const fields = await db(
    "SELECT api_name FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
    [object.id, req.user.companyId]
  );
  const allowedFields = new Set(fields.rows.map((field) => field.api_name));
  const sectionIds = new Set(sections.map((section) => section.id).filter(Boolean));
  if (sections.length !== sectionIds.size) return "Layout sections must have unique ids";
  const componentIds = new Set();
  for (const [index, component] of components.entries()) {
    if (!component || typeof component !== "object") return "Layout contains an invalid component";
    const componentId = String(component.id || `${component.type || "component"}-${component.field_key || index + 1}`);
    if (componentIds.has(componentId)) return "Layout components must have unique ids";
    componentIds.add(componentId);
    if (component.type && !["field", "text", "divider", "spacer", "header", "action", "button", "related_list", "process_path"].includes(component.type)) {
      return `Unsupported layout component type "${component.type}"`;
    }
    if (component.width && !["full", "1/2", "1/3", "2/3", "1/4"].includes(component.width)) {
      return `Unsupported component width "${component.width}"`;
    }
    if (component?.type === "button") {
      try {
        const button = validateButtonDefinition({
          buttonKey: component.button_key || component.id || `button_${index + 1}`,
          label: component.label || "Button",
          icon: component.icon,
          variant: component.variant,
          targetType: component.target_type,
          targetKey: component.target_key,
          requiredPermission: component.required_permission,
          visibilityRule: component.visibility_rule || {},
          inputMappings: component.input_mappings || {},
          config: component.config || {},
        });
        if (button.targetType === "url") {
          continue;
        }
        if (button.targetType === "workflow") {
          const target = await db(
            `SELECT id FROM platform_rules WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND (id::text=$3 OR name=$3) LIMIT 1`,
            [object.id, req.user.companyId, button.targetKey]
          );
          if (!target.rows.length) return "Button must reference an existing workflow";
        } else {
          const core = listRegisteredPlatformActions().some((item) => item.key === button.targetKey);
          if (!core) {
            const target = await db(
              "SELECT id FROM platform_registered_actions WHERE action_key=$1 AND object_id=$2 AND (company_id IS NULL OR company_id=$3) AND active=true LIMIT 1",
              [button.targetKey, object.id, req.user.companyId]
            );
            if (!target.rows.length) return "Button must reference a registered action";
          }
        }
      } catch (error) { return error.message; }
      continue;
    }
    if (component?.type !== "field") continue;
    if (typeof component.field_key !== "string" || !allowedFields.has(component.field_key)) {
      return `Field "${component?.field_key || ""}" does not belong to this object`;
    }
    if (component.section_id && sections.length && !sectionIds.has(component.section_id)) {
      return "A layout field references an invalid section";
    }
  }
  return null;
}

async function syncLayoutButtons(db, req, layout, { deactivateExisting = true } = {}) {
  const definition = layout?.definition || {};
  const sections = Array.isArray(definition.sections) ? definition.sections : [];
  const components = [
    ...(Array.isArray(definition.components) ? definition.components : []),
    ...sections.flatMap((section) => Array.isArray(section.items) ? section.items : []),
  ].filter((component) => component?.type === "button");
  if (deactivateExisting) {
    await db(
      "UPDATE platform_buttons SET active=false,user_modified=true,updated_at=NOW() WHERE company_id=$1 AND object_id=$2 AND config->>'layoutId'=$3",
      [req.user.companyId, layout.object_id, String(layout.id)]
    );
  }
  for (const [index, component] of components.entries()) {
    const buttonKey = toSafeApiName(component.button_key || `${layout.layout_key}_${component.id || component.label || index + 1}`, "button");
    const button = validateButtonDefinition({
      buttonKey,
      label: component.label || "Button",
      icon: component.icon,
      variant: component.variant,
      targetType: component.target_type,
      targetKey: component.target_key,
      placement: layout.page_type || "record",
      requiredPermission: component.required_permission,
      visibilityRule: component.visibility_rule || {},
      inputMappings: component.input_mappings || {},
      config: { ...(component.config || {}), layoutId: String(layout.id), componentId: String(component.id || index) },
    });
    await db(
      `INSERT INTO platform_buttons
       (company_id,object_id,button_key,label,icon,action_key,target_type,target_key,variant,placement,required_permission,visibility_rule,input_mappings,config,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,true)
       ON CONFLICT (company_id,button_key) WHERE company_id IS NOT NULL DO UPDATE SET
       object_id=EXCLUDED.object_id,label=EXCLUDED.label,icon=EXCLUDED.icon,action_key=EXCLUDED.action_key,target_type=EXCLUDED.target_type,
       target_key=EXCLUDED.target_key,variant=EXCLUDED.variant,placement=EXCLUDED.placement,required_permission=EXCLUDED.required_permission,
       visibility_rule=EXCLUDED.visibility_rule,input_mappings=EXCLUDED.input_mappings,config=EXCLUDED.config,active=true,updated_at=NOW()`,
      [req.user.companyId, layout.object_id, button.buttonKey, button.label, button.icon,
        button.targetType === "action" ? button.targetKey : null, button.targetType, button.targetKey, button.variant,
        button.placement, button.requiredPermission, JSON.stringify(button.visibilityRule), JSON.stringify(button.inputMappings), JSON.stringify(button.config)]
    );
  }
}

async function canManageGlobal(db, req) {
  if (!req.user?.id || !req.user?.companyId) return false;
  const [roleResult, permissionSets] = await Promise.all([
    req.user.roleId
      ? db("SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='oneengine.manage' LIMIT 1", [req.user.roleId])
      : Promise.resolve({ rows: [] }),
    loadEffectivePermissionSets(db, req.user, req),
  ]);
  return roleResult.rows.length > 0
    || permissionSetAllowsSystemPermission(permissionSets, "oneengine.manage");
}

async function activeFieldReferences(db, field, companyId) {
  const references = new Set();
  const needles = [...new Set([field.api_name, field.source_column, String(field.id)].filter(Boolean))];
  const matches = (value) => {
    const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
    return needles.some((needle) => text.includes(String(needle)));
  };

  const siblingFields = await db(
    "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label",
    [field.object_id, companyId]
  );
  for (const candidate of siblingFields.rows || []) {
    if (candidate.id === field.id) continue;
    if (matches(candidate)) references.add(candidate.field_type === "formula" ? `formula: ${candidate.label}` : `field metadata: ${candidate.label}`);
    if (candidate.field_type === "rollup") {
      const normalized = normalizeRollupConfig(candidate);
      if (normalized?.sourceField === field.api_name || normalized?.sourceField === field.source_column) references.add(`rollup: ${candidate.label}`);
    }
  }

  const activeMetadata = await db(
    `SELECT kind,label,payload FROM (
       SELECT 'workflow' AS kind, name AS label, (conditions::text || ' ' || action::text) AS payload
         FROM platform_rules WHERE object_id=$1 AND company_id=$2 AND active=true AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
       UNION ALL
       SELECT 'approval', name, conditions::text
         FROM platform_approval_processes WHERE object_id=$1 AND company_id=$2 AND active=true AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
       UNION ALL
       SELECT 'button', label, (visibility_rule::text || ' ' || config::text)
         FROM platform_buttons WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true
       UNION ALL
       SELECT 'action binding', event_key, config::text
         FROM platform_action_bindings WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true
       UNION ALL
       SELECT 'layout', name, definition::text
         FROM platform_layouts WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true
       UNION ALL
       SELECT 'report', label, config::text
         FROM platform_reports WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true
     ) refs`,
    [field.object_id, companyId]
  );
  for (const ref of activeMetadata.rows || []) {
    if (matches(ref.payload)) references.add(`${ref.kind}: ${ref.label}`);
  }
  return [...references].slice(0, 20);
}

async function objectDeactivationBlockers(db, object, companyId) {
  const blockers = [];
  if (object.source_table && isSafeIdentifier(object.source_table)) {
    const records = object.company_scoped
      ? await db(`SELECT COUNT(*)::int AS count FROM "${object.source_table}" WHERE company_id=$1`, [companyId])
      : await db(`SELECT COUNT(*)::int AS count FROM "${object.source_table}"`);
    if (Number(records.rows[0]?.count || 0) > 0) blockers.push("records");
  }
  const metadata = await db(
    `SELECT source FROM (
       SELECT 'fields' AS source FROM platform_fields WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'relationships' FROM platform_relationships
        WHERE (parent_object_id=$1 OR child_object_id=$1) AND active=true
       UNION ALL SELECT 'layouts' FROM platform_layouts WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'reports' FROM platform_reports WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'rules' FROM platform_rules WHERE object_id=$1 AND active=true AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
       UNION ALL SELECT 'approvals' FROM platform_approval_processes WHERE object_id=$1 AND active=true AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
       UNION ALL SELECT 'buttons' FROM platform_buttons WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'registered actions' FROM platform_registered_actions WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'action bindings' FROM platform_action_bindings WHERE object_id=$1 AND active=true
       UNION ALL SELECT 'record types' FROM platform_record_types WHERE object_id=$1 AND active=true
     ) blockers LIMIT 10`,
    [object.id]
  );
  blockers.push(...metadata.rows.map((row) => row.source));
  return [...new Set(blockers)];
}

async function fieldStoredValueCount(db, field, companyId) {
  if (isExtensionField(field)) {
    const result = await db(
      "SELECT COUNT(*)::int AS count FROM platform_record_associations WHERE object_id=$1 AND company_id=$2 AND custom_values ? $3 AND custom_values->$3 IS NOT NULL AND custom_values->$3 <> 'null'::jsonb",
      [field.object_id, companyId, field.api_name]
    );
    return Number(result.rows[0]?.count || 0);
  }
  if (field.source_table && field.source_column && isSafeIdentifier(field.source_table) && isSafeIdentifier(field.source_column)) {
    const result = field.object_company_scoped === false
      ? await db(`SELECT COUNT(*)::int AS count FROM "${field.source_table}" WHERE "${field.source_column}" IS NOT NULL`)
      : await db(
          `SELECT COUNT(*)::int AS count FROM "${field.source_table}" WHERE company_id=$1 AND "${field.source_column}" IS NOT NULL`,
          [companyId]
        );
    return Number(result.rows[0]?.count || 0);
  }
  return 0;
}

function visibilityClause(alias, req, start = 1) {
  return {
    sql: `(${alias}.company_id IS NULL OR ${alias}.company_id=$${start})`,
    params: [req.user.companyId],
  };
}

function recordIdIsValid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}





function metadataColumn(field) {
  return field && !isCalculatedField(field) && field.active === true && field.source_column && isSafeIdentifier(field.source_column)
    ? field.source_column
    : null;
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), maximum);
}

function recordReturning(fields, values) {
  const hasCalculated = fields.some(field => field.active && (field.field_type === "formula" || field.field_type === "rollup"));
  const mapped = hasCalculated ? fields.filter(field => metadataColumn(field) && field.readable !== false).map(field => ({ field, column: field.source_column })) : values;
  return ["id", ...mapped.filter(({ field }) => isSafeIdentifier(field.api_name)).map(({ field, column }) => `"${column}" AS "${field.api_name}"`)];
}

function publicFormulaRecord(fields, record) {
  const result = { ...record };
  for (const field of fields) if (field.readable === false) delete result[field.api_name];
  return result;
}

function normalizeListViewSort(value) {
  if (!value || typeof value !== "object") return { field: null, direction: "asc" };
  const field = typeof value.field === "string" ? value.field : null;
  const direction = ["asc", "desc"].includes(String(value.direction || "asc").toLowerCase()) ? String(value.direction).toLowerCase() : "asc";
  return { field, direction };
}

function normalizeAppConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { defaultPage: null, theme: { primary: "#0f172a" } };
  return {
    defaultPage: typeof value.defaultPage === "string" ? value.defaultPage : typeof value.default_page === "string" ? value.default_page : null,
    theme: value.theme && typeof value.theme === "object" && !Array.isArray(value.theme) ? value.theme : { primary: "#0f172a" },
  };
}

/*
 * Page definitions are admin-authored input, so they are whitelisted. The
 * shared normalizer keeps components/sections, the semantic target keys
 * (objectKey / referenceId / reportKey) and the navigation keys (show in
 * navigation, icon key, order, optional module, profiles, permissions).
 */
function normalizePageDefinition(value) {
  return normalizeObjectPageDefinition(value);
}

function configuredActionKey(component, index) {
  return String(component?.id || component?.key || `${component?.action || "action"}:${index}`);
}

function normalizeReportConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { fields: [], filters: [], sort: [], groupBy: null, metrics: [{ type: "count" }] };
  const fields = Array.isArray(value.fields) ? value.fields.filter((field) => typeof field === "string" && isSafeIdentifier(field)).slice(0, 50) : [];
  const filters = Array.isArray(value.filters) ? value.filters
    .filter((filter) => filter && typeof filter.field === "string" && isSafeIdentifier(filter.field))
    .map((filter) => ({
      field: filter.field,
      operator: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "is_null"].includes(filter.operator) ? filter.operator : "eq",
      value: filter.value,
    })).slice(0, 20) : [];
  const sort = Array.isArray(value.sort) ? value.sort
    .filter((item) => item && typeof item.field === "string" && isSafeIdentifier(item.field))
    .map((item) => ({ field: item.field, direction: String(item.direction).toLowerCase() === "desc" ? "desc" : "asc" })).slice(0, 10) : [];
  const groupBy = typeof value.groupBy === "string" ? value.groupBy : typeof value.group_by === "string" ? value.group_by : null;
  const metrics = Array.isArray(value.metrics) ? value.metrics : Array.isArray(value.metric) ? value.metric : [];
  const normalizedMetrics = metrics
    .filter((metric) => metric && typeof metric === "object")
    .map((metric) => {
      const type = typeof metric.type === "string" ? metric.type.toLowerCase() : "count";
      const safeType = ["count", "sum", "avg", "min", "max"].includes(type) ? type : "count";
      const field = typeof metric.field === "string" ? metric.field : typeof metric.fieldName === "string" ? metric.fieldName : null;
      return { type: safeType, field };
    })
    .slice(0, 5);

  return { fields, filters, sort, groupBy, metrics: normalizedMetrics.length ? normalizedMetrics : [{ type: "count" }] };
}

async function evaluateRollupValue(db, object, field, record, req) {
  const config = normalizeRollupConfig(field);
  if (!config || !config.relationshipKey || !object || !record || !record.id) return record?.[field.api_name] ?? null;
  const relationshipResult = await db(
    "SELECT r.*, p.object_key AS parent_object_key, c.object_key AS child_object_key, c.source_table AS child_source_table, c.company_scoped AS child_company_scoped, c.store_scoped AS child_store_scoped FROM platform_relationships r JOIN platform_objects p ON p.id=r.parent_object_id JOIN platform_objects c ON c.id=r.child_object_id WHERE r.parent_object_id=$1 AND r.relationship_key=$2 AND r.active=true",
    [object.id, config.relationshipKey]
  );
  const relationship = relationshipResult.rows[0];
  if (!relationship) return null;
  const childObject = { ...relationship, ...{ source_table: relationship.child_source_table, company_scoped: relationship.child_company_scoped, store_scoped: relationship.child_store_scoped } };
  const joinField = relationship.child_field_id ? await db("SELECT * FROM platform_fields WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [relationship.child_field_id, req.user.companyId]) : { rows: [] };
  const joinFieldInfo = joinField.rows[0];
  /* Only a child-owned link column can be aggregated from the child table. A
     parent-owned lookup (the FK lives on the parent) has no child join column,
     so no child aggregate can be computed for it. */
  if (joinFieldInfo && String(joinFieldInfo.object_id) !== String(relationship.child_object_id)) return null;
  if (!childObject.source_table || !isSafeIdentifier(childObject.source_table) || !joinFieldInfo || !joinFieldInfo.source_column || !isSafeIdentifier(joinFieldInfo.source_column)) {
    return null;
  }
  const operation = config.operation;
  const clauseParams = [record.id];
  const clauses = [`"${joinFieldInfo.source_column}"=$${clauseParams.length}`];
  const childFieldsResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order", [relationship.child_object_id, req.user.companyId]);
  const childFields = childFieldsResult.rows;
  const childFieldByApiName = new Map(childFields.map((candidate) => [candidate.api_name, candidate]));
  const sourceField = config.sourceField ? childFieldByApiName.get(config.sourceField) : childFields.find((candidate) => candidate.api_name === config.sourceField || candidate.source_column === config.sourceField) || null;
  const sourceColumn = sourceField && sourceField.source_column && isSafeIdentifier(sourceField.source_column) ? sourceField.source_column : null;
  if (operation !== "COUNT" && !sourceColumn) return null;
  if (childObject.company_scoped) { clauseParams.push(req.user.companyId); clauses.push(`company_id=$${clauseParams.length}`); }
  if (childObject.store_scoped) {
    if (!req.user.storeId) return null;
    clauseParams.push(req.user.storeId); clauses.push(`store_id=$${clauseParams.length}`);
  }
  const filterCondition = normalizeRollupConfig(field)?.condition ?? null;
  const filterRecords = await db(`SELECT * FROM "${childObject.source_table}" WHERE ${clauses.join(" AND ")}`, clauseParams);
  let rows = filterRecords.rows || [];
  if (filterCondition && rows.length) {
    rows = rows.filter((row) => evaluateCondition(filterCondition, childFields, row));
  }
  if (operation === "COUNT") return rows.length;
  const values = rows.map((row) => row[sourceColumn]).filter((value) => value !== null && value !== undefined && value !== "");
  if (!values.length) return null;
  switch (operation) {
    case "SUM": return values.reduce((total, value) => total + Number(value), 0);
    case "AVG": return values.reduce((total, value) => total + Number(value), 0) / values.length;
    case "MIN": return values.reduce((min, value) => (Number(value) < Number(min) ? Number(value) : Number(min)), Number(values[0]));
    case "MAX": return values.reduce((max, value) => (Number(value) > Number(max) ? Number(value) : Number(max)), Number(values[0]));
    default: return null;
  }
}

async function populateRollups(db, object, fields, records, req) {
  const rollups = fields.filter((field) => field.active !== false && field.field_type === "rollup");
  if (!rollups.length || !Array.isArray(records)) return records;
  const next = [];
  for (const record of records) {
    const enriched = { ...record };
    for (const field of rollups) {
      enriched[field.api_name] = await evaluateRollupValue(db, object, field, enriched, req);
    }
    next.push(enriched);
  }
  return next;
}







function metadataRecordValue(record, field) {
  if (!record || !field) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, field.api_name)) return record[field.api_name];
  if (field.source_column && Object.prototype.hasOwnProperty.call(record, field.source_column)) return record[field.source_column];
  return undefined;
}

async function hydrateFormulaRecordPaths(db, object, fields, records, req, depth = 0) {
  if (depth > 6) return records;
  const formulaPaths = [...new Set(
    (fields || [])
      .filter((field) => field.active !== false && field.field_type === "formula")
      .flatMap((field) => Object.keys(field.config?.recordPathTypes || field.config?.record_path_types || {}))
  )];
  if (!formulaPaths.length || !Array.isArray(records) || !records.length) return records;

  const [objectsResult, fieldsResult, relationshipsResult] = await Promise.all([
    db("SELECT * FROM platform_objects WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
    db("SELECT * FROM platform_fields WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
    db(`SELECT r.*,p.object_key AS parent_object_key,c.object_key AS child_object_key
          FROM platform_relationships r
          JOIN platform_objects p ON p.id=r.parent_object_id
          JOIN platform_objects c ON c.id=r.child_object_id
         WHERE r.active=true
           AND (p.company_id IS NULL OR p.company_id=$1)
           AND (c.company_id IS NULL OR c.company_id=$1)`, [req.user.companyId]),
  ]);
  const objectsById = new Map(objectsResult.rows.map((item) => [String(item.id), item]));
  const fieldsById = new Map(fieldsResult.rows.map((item) => [String(item.id), item]));
  const fieldsByObject = new Map();
  for (const field of fieldsResult.rows) {
    const key = String(field.object_id);
    if (!fieldsByObject.has(key)) fieldsByObject.set(key, []);
    fieldsByObject.get(key).push(field);
  }
  const relationships = relationshipsResult.rows;
  const recordCache = new Map();

  const inverseRelationship = (currentObject, key) => relationships.find((relationship) => {
    if (String(relationship.child_object_id) !== String(currentObject.id)) return false;
    const linkField = fieldsById.get(String(relationship.child_field_id || ""));
    const inverse = linkField?.api_name
      ? String(linkField.api_name).replace(/_id$/i, "")
      : relationship.parent_object_key;
    return inverse === key;
  });

  const loadParentRecord = async (parent, parentFields, id) => {
    const cacheKey = `${parent.id}:${id}`;
    if (recordCache.has(cacheKey)) return recordCache.get(cacheKey);
    if (!parent?.source_table || !isSafeIdentifier(parent.source_table) || !recordIdIsValid(String(id))) {
      recordCache.set(cacheKey, null);
      return null;
    }
    const clauses = ["id=$1"];
    const params = [id];
    if (parent.company_scoped || systemObject(parent)) {
      params.push(req.user.companyId);
      clauses.push(`company_id=$${params.length}`);
    }
    if (parent.store_scoped) {
      if (!req.user.storeId) {
        recordCache.set(cacheKey, null);
        return null;
      }
      params.push(req.user.storeId);
      clauses.push(`store_id=$${params.length}`);
    }
    appendSystemReadScope(parent, req, clauses, params);
    const sharing = await buildPlatformSharingScope({ db, object: parent, fields: parentFields, req, access: "read", paramsOffset: params.length });
    if (sharing.sql) {
      clauses.push(sharing.sql);
      params.push(...sharing.params);
    }
    const result = await db(`SELECT * FROM "${parent.source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`, params);
    if (!result.rows.length) {
      recordCache.set(cacheKey, null);
      return null;
    }
    const hydrated = await hydrateExtensions(db, parent, parentFields, result.rows, req);
    let row = hydrated[0] || null;
    if (row && depth < 6) {
      const formulaRecords = await calculateFormulaRecords(db, parent, parentFields, [row], req, depth + 1);
      row = formulaRecords[0] || row;
      const rolled = await populateRollups(db, parent, parentFields, [row], req);
      row = rolled[0] || row;
    }
    recordCache.set(cacheKey, row);
    return row;
  };

  const resolvePath = async (rootRecord, path) => {
    let parts = String(path).split(".").filter(Boolean);
    if (parts[0] === object.object_key) parts = parts.slice(1);
    if (parts.length < 2) return undefined;
    let currentObject = object;
    let currentRecord = rootRecord;

    for (const segment of parts.slice(0, -1)) {
      const relationship = inverseRelationship(currentObject, segment);
      if (!relationship) return undefined;
      const linkField = fieldsById.get(String(relationship.child_field_id || ""));
      const parent = objectsById.get(String(relationship.parent_object_id));
      if (!linkField || !parent) return undefined;
      const linkValue = metadataRecordValue(currentRecord, linkField);
      if (linkValue === null || linkValue === undefined || linkValue === "") return undefined;
      const parentFields = fieldsByObject.get(String(parent.id)) || [];
      currentRecord = await loadParentRecord(parent, parentFields, linkValue);
      if (!currentRecord) return undefined;
      currentObject = parent;
    }

    const fieldApi = parts[parts.length - 1];
    const targetField = (fieldsByObject.get(String(currentObject.id)) || []).find((field) => field.api_name === fieldApi);
    if (!targetField) return undefined;
    return metadataRecordValue(currentRecord, targetField);
  };

  const output = [];
  for (const rawRecord of records) {
    const rootHydrated = (await hydrateExtensions(db, object, fields, [rawRecord], req))[0] || rawRecord;
    const pathValues = {};
    for (const path of formulaPaths) pathValues[path] = await resolvePath(rootHydrated, path);
    output.push({ ...rootHydrated, __formulaPathValues: pathValues });
  }
  return output;
}

async function calculateFormulaRecords(db, object, fields, records, req, depth = 0) {
  const withPaths = await hydrateFormulaRecordPaths(db, object, fields, records, req, depth);
  const calculate = compileFormulas(fields);
  return withPaths.map((record) => calculate(record));
}

function validateGeneralFieldConfig(field) {
  const config = field?.config && typeof field.config === "object" && !Array.isArray(field.config) ? field.config : {};
  const textTypes = new Set(["text", "text_area", "long_text", "rich_text", "url", "email", "phone"]);
  const numericTypes = new Set(["number", "decimal", "currency", "percent"]);
  const externalIdTypes = new Set(["text", "number", "decimal", "email", "auto_number"]);
  const uniqueTypes = new Set(["text", "number", "decimal", "email", "auto_number"]);

  if (config.maxLength !== undefined && config.maxLength !== null) {
    const maxLength = Number(config.maxLength);
    const maxAllowed = ["long_text", "rich_text"].includes(field.field_type) ? 131072 : 255;
    const minAllowed = ["long_text", "rich_text"].includes(field.field_type) ? 256 : 1;
    if (!textTypes.has(field.field_type) || !Number.isInteger(maxLength) || maxLength < minAllowed || maxLength > maxAllowed) {
      throw new ConditionError(`Maximum length for ${field.field_type} must be between ${minAllowed} and ${maxAllowed}`);
    }
  }
  if (config.precision !== undefined && config.precision !== null) {
    const precision = Number(config.precision);
    if (!numericTypes.has(field.field_type) || !Number.isInteger(precision) || precision < 1 || precision > 18) {
      throw new ConditionError("Precision must be between 1 and 18 for numeric fields");
    }
    const scale = config.scale === undefined || config.scale === null ? 0 : Number(config.scale);
    if (!Number.isInteger(scale) || scale < 0 || scale > 17 || scale > precision) {
      throw new ConditionError("Decimal places must be between 0 and 17 and cannot exceed precision");
    }
  }
  if (config.scale !== undefined && config.scale !== null && config.precision === undefined) {
    const scale = Number(config.scale);
    if (!numericTypes.has(field.field_type) || !Number.isInteger(scale) || scale < 0 || scale > 17) {
      throw new ConditionError("Decimal places are invalid for this field type");
    }
  }
  if (config.externalId === true && !externalIdTypes.has(field.field_type)) {
    throw new ConditionError("External ID is available only for text, number, decimal, email, and auto-number fields");
  }
  if (config.unique === true && !uniqueTypes.has(field.field_type)) {
    throw new ConditionError("Unique is available only for text, number, decimal, email, and auto-number fields");
  }
  if (config.defaultValue !== undefined && config.defaultValue !== null && ["formula", "rollup", "auto_number", "lookup"].includes(field.field_type)) {
    throw new ConditionError("This field type cannot have a static default value");
  }
  if (config.defaultValue !== undefined && config.defaultValue !== null && !["select", "picklist", "multiselect", "formula", "rollup", "auto_number", "lookup"].includes(field.field_type)) {
    const defaultError = fieldValueError({ ...field, required: false }, config.defaultValue);
    if (defaultError) throw new ConditionError(`Default value is invalid: ${defaultError}`);
  }
  if (config.defaultFormula || config.default_formula) {
    if (["formula", "rollup", "auto_number", "lookup", "address", "location", "json"].includes(field.field_type)) {
      throw new ConditionError("This field type cannot have a formula default");
    }
    try { workflowFormulaReferences(config.defaultFormula || config.default_formula); }
    catch (error) { throw new ConditionError(`Default formula is invalid: ${error.message}`); }
  }
}

async function validatePicklistDefinition(db, field, req) {
  if (!["select", "picklist", "multiselect"].includes(field.field_type)) return;
  const valueSetId = field.config?.valueSetId || field.config?.value_set_id;
  const local = localPicklistOptions(field);
  if (valueSetId && local.length) throw new ConditionError("Picklists cannot use both local values and a reusable value set");
  if (valueSetId) {
    const result = await db("SELECT id FROM platform_value_sets WHERE id=$1 AND company_id=$2", [valueSetId, req.user.companyId]);
    if (!result.rows.length) throw new ConditionError("Reusable value set is not available to this company");
  }

  const options = valueSetId ? await valueSetOptions(db, field, req) : local;
  const seen = new Set();
  for (const option of options) {
    if (!isSafeIdentifier(option.value)) throw new ConditionError("Picklist values must use safe stable values");
    if (seen.has(option.value)) throw new ConditionError(`Duplicate picklist value: ${option.value}`);
    seen.add(option.value);
  }
  const dependent = field.config?.dependentPicklist || field.config?.dependent_picklist;
  const configuredDefault = field.config?.defaultValue ?? field.config?.default_value;
  const configuredDefaultFormula = field.config?.defaultFormula || field.config?.default_formula;
  if (dependent?.controllingField || dependent?.controlling_field) {
    if (field.config?.restricted === false) throw new ConditionError("Dependent picklists must use restricted values");
    if ((configuredDefault !== undefined && configuredDefault !== null && configuredDefault !== "") || configuredDefaultFormula) {
      throw new ConditionError("Dependent picklists cannot define a default value");
    }
  } else if (configuredDefault !== undefined && configuredDefault !== null && configuredDefault !== "") {
    const defaults = field.field_type === "multiselect"
      ? (Array.isArray(configuredDefault) ? configuredDefault : [configuredDefault])
      : [configuredDefault];
    const activeValues = new Set(options.filter((option) => option.active !== false).map((option) => String(option.value)));
    if (defaults.some((value) => !activeValues.has(String(value)))) throw new ConditionError("Picklist default must use an active configured value");
  }
}

async function validateDependentPicklistDefinition(db, object, field, req) {
  if (!["select", "picklist", "multiselect"].includes(field.field_type)) return;
  const config = field.config?.dependentPicklist || field.config?.dependent_picklist;
  if (!config) return;
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new ConditionError("Dependent picklist configuration must be an object");
  }
  const controllingFieldApi = String(config.controllingField || config.controlling_field || "").trim();
  if (!isSafeIdentifier(controllingFieldApi)) {
    throw new ConditionError("Dependent picklist must reference a valid controlling field");
  }
  if (controllingFieldApi === field.api_name) {
    throw new ConditionError("A picklist cannot control itself");
  }
  const controllerResult = await db(
    "SELECT * FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND active=true AND (company_id IS NULL OR company_id=$3) LIMIT 1",
    [object.id, controllingFieldApi, req.user.companyId]
  );
  const controller = controllerResult.rows[0];
  if (!controller || !["select", "picklist", "boolean"].includes(controller.field_type)) {
    throw new ConditionError("Controlling field must be an active picklist or boolean field on the same object");
  }

  const dependentOptions = await valueSetOptions(db, field, req);
  const dependentValues = new Set(dependentOptions.filter((option) => option.active !== false).map((option) => String(option.value)));
  const controllingValues = controller.field_type === "boolean"
    ? new Set(["true", "false"])
    : new Set((await valueSetOptions(db, controller, req)).filter((option) => option.active !== false).map((option) => String(option.value)));

  const mappings = config.mappings;
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) {
    throw new ConditionError("Dependent picklist mappings must be an object");
  }
  for (const [dependentValue, allowedControllers] of Object.entries(mappings)) {
    if (!dependentValues.has(String(dependentValue))) {
      throw new ConditionError(`Dependent picklist mapping references unknown value "${dependentValue}"`);
    }
    if (!Array.isArray(allowedControllers)) {
      throw new ConditionError("Each dependent picklist mapping must contain an array of controlling values");
    }
    for (const controllerValue of allowedControllers) {
      if (!controllingValues.has(String(controllerValue))) {
        throw new ConditionError(`Dependent picklist mapping references unknown controlling value "${controllerValue}"`);
      }
    }
  }
}

async function validateDependentPicklistValues(db, fields, record, req) {
  const fieldByApi = new Map((fields || []).map((field) => [field.api_name, field]));
  for (const field of fields || []) {
    if (!["select", "picklist", "multiselect"].includes(field.field_type)) continue;
    const config = field.config?.dependentPicklist || field.config?.dependent_picklist;
    const controllingFieldApi = config?.controllingField || config?.controlling_field;
    if (!controllingFieldApi) continue;

    const dependentValue = record?.[field.api_name];
    if (dependentValue === null || dependentValue === undefined || dependentValue === "" || (Array.isArray(dependentValue) && !dependentValue.length)) continue;
    const controllingValue = record?.[controllingFieldApi];
    if (controllingValue === null || controllingValue === undefined || controllingValue === "") {
      return `${field.label} requires ${fieldByApi.get(controllingFieldApi)?.label || controllingFieldApi} before a value can be selected`;
    }
    const selectedValues = Array.isArray(dependentValue) ? dependentValue : [dependentValue];
    for (const selected of selectedValues) {
      const allowedControllers = config?.mappings?.[String(selected)];
      if (!Array.isArray(allowedControllers) || !allowedControllers.map(String).includes(String(controllingValue))) {
        return `${field.label} value "${selected}" is not available when ${fieldByApi.get(controllingFieldApi)?.label || controllingFieldApi} is "${controllingValue}"`;
      }
    }
  }
  return null;
}

function parseRecordFilters(query) {
  const raw = query?.filter ?? query?.filters;
  if (raw === undefined || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseRecordFilterModel(query) {
  const raw = query?.filterModel ?? query?.filter_model;
  if (raw === undefined || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeFilterValue(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function parseCsv(text) {
  if (typeof text !== "string") return { headers: [], rows: [] };
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };
  const headers = parseLine(lines[0]).map((header) => header.replace(/^\ufeff/, "").trim());
  const rows = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseLine(lines[index]);
    const row = {};
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      row[headers[columnIndex]] = values[columnIndex] !== undefined ? values[columnIndex] : "";
    }
    rows.push({ row, lineNumber: index + 1 });
  }
  return { headers, rows };
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function validRecordTypeInput(body) {
  return body && typeof body.label === "string" && body.label.trim().length > 0
    && (body.recordTypeKey === undefined || isSafeIdentifier(body.recordTypeKey))
    && (body.defaultValues === undefined || (body.defaultValues && typeof body.defaultValues === "object" && !Array.isArray(body.defaultValues)));
}

const PERMISSION_SET_OBJECT_ACTIONS = new Set(["can_view", "can_create", "can_edit", "can_delete", "can_import", "can_export"]);
const PERMISSION_SET_FIELD_ACCESS = new Set(["readable", "writable"]);

function validPermissionSetInput(body) {
  if (!body || typeof body.name !== "string" || !body.name.trim()) return false;
  if (body.apiKey !== undefined && !isSafeIdentifier(body.apiKey)) return false;
  if (body.active !== undefined && typeof body.active !== "boolean") return false;
  if (body.systemPermissions !== undefined && (!Array.isArray(body.systemPermissions)
    || body.systemPermissions.length > 300
    || body.systemPermissions.some((code) => typeof code !== "string" || !/^[a-z][a-z0-9_.-]{1,139}$/.test(code)))) return false;
  if (body.objectPermissions !== undefined && (!body.objectPermissions || typeof body.objectPermissions !== "object" || Array.isArray(body.objectPermissions))) return false;
  if (body.fieldPermissions !== undefined && (!body.fieldPermissions || typeof body.fieldPermissions !== "object" || Array.isArray(body.fieldPermissions))) return false;
  for (const [objectKey, access] of Object.entries(body.objectPermissions || {})) {
    if (!isSafeIdentifier(objectKey) || !access || typeof access !== "object" || Array.isArray(access)) return false;
    if (Object.entries(access).some(([key, value]) => !PERMISSION_SET_OBJECT_ACTIONS.has(key) || typeof value !== "boolean")) return false;
  }
  for (const [fieldKey, access] of Object.entries(body.fieldPermissions || {})) {
    const [objectKey, apiName, ...rest] = fieldKey.split(".");
    if (!isSafeIdentifier(objectKey) || !isSafeIdentifier(apiName) || rest.length || !access || typeof access !== "object" || Array.isArray(access)) return false;
    if (Object.entries(access).some(([key, value]) => !PERMISSION_SET_FIELD_ACCESS.has(key) || typeof value !== "boolean")) return false;
  }
  return true;
}

function validAssignmentDates(body) {
  const effectiveFrom = body?.effectiveFrom || null;
  const effectiveUntil = body?.effectiveUntil || null;
  const fromDate = effectiveFrom ? new Date(effectiveFrom) : null;
  const untilDate = effectiveUntil ? new Date(effectiveUntil) : null;
  return (!fromDate || Number.isFinite(fromDate.getTime()))
    && (!untilDate || Number.isFinite(untilDate.getTime()))
    && (!fromDate || !untilDate || untilDate > fromDate);
}

export default function createPlatformRouter({ authenticate, authorize, db, pool, writeAudit = null, canViewCompanyCustomers = async () => false, hasPermission = null }) {
  const router = express.Router();

  // Express 4 does not forward rejected async route promises to error
  // middleware. Wrap async handlers at registration time so a failed query or
  // runtime check returns a controlled response instead of becoming an
  // unhandled rejection and leaving the browser request hanging.
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => register(
      path,
      ...handlers.map((handler) => {
        if (typeof handler !== "function" || handler.constructor?.name !== "AsyncFunction") return handler;
        return function platformAsyncHandler(req, res, next) {
          return Promise.resolve(handler(req, res, next)).catch(next);
        };
      })
    );
  }
  async function resolveActingCompany(req, res, next) {
    try {
      const oneEngineManager = await hasOneEngineManageAccess(req);
      const requestedOverride = req.headers["x-acting-company-id"] || req.body?.actingCompanyId || req.query?.actingCompanyId;

      // Ordinary tenant users are permanently scoped to their authenticated
      // company. Cross-company targeting exists only through oneengine.manage.
      if (req.user?.companyId && !oneEngineManager) {
        if (requestedOverride && String(requestedOverride) !== String(req.user.companyId)) {
          return res.status(403).json({ success: false, message: "Tenant users cannot switch company context" });
        }
        req.platformCompanyId = req.user.companyId;
        return next();
      }

      if (!oneEngineManager) {
        req.platformCompanyId = req.user.companyId;
        return next();
      }

      const actingCompanyId = requestedOverride || req.user?.companyId;
      if (!actingCompanyId) return res.status(409).json({ success: false, code: "ACTING_COMPANY_REQUIRED", message: "Select a company before customising tenant metadata" });

      const access = await db("SELECT id FROM companies WHERE id=$1 AND active=true LIMIT 1", [actingCompanyId]);

      if (!access.rows.length) return res.status(403).json({ success: false, message: "You are not authorised for the selected company" });
      req.platformCompanyId = access.rows[0].id;
      req.user.companyId = access.rows[0].id;
      return next();
    } catch (error) {
      console.error("Acting company resolution error:", error);
      return res.status(500).json({ success: false, message: "Unable to resolve acting company" });
    }
  }
  async function authorizePlatformManage(req, res, next) {
    return authorize("oneengine.manage")(req, res, next);
  }
  async function authorizeWorkflowExecute(req, res, next) {
    try {
      if (await hasExecutionPermission(req, "workflow.execute")) return next();
      return res.status(403).json({ success: false, message: "You do not have permission to execute workflows" });
    } catch (error) {
      return next(error);
    }
  }
  const manage = [authenticate, resolveActingCompany, authorizePlatformManage];
  const workflowExecute = [authenticate, authorizeWorkflowExecute];
  // Record CRUD is governed by Object permissions/RBAC, not by identity,
  // role names, or the Settings administration permission.
  const recordAccess = [authenticate, resolveActingCompany];

  router.use("/platform", authenticate, async (req, res, next) => {
    try { req.platformCompanyCustomers = await canViewCompanyCustomers(req.user, req); next(); }
    catch (error) { next(error); }
  });

  router.get("/platform/search", authenticate, async (req, res, next) => {
    try {
      const data = await searchPlatformRecords(db, req, req.query.q);
      res.json({ success: true, data });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Platform search error:", error);
      next(error);
    }
  });

  async function hasOneEngineManageAccess(req) {
    if (!req.user?.id) return false;
    if (hasPermission) return hasPermission(req, "oneengine.manage");
    return canManageGlobal(db, req);
  }

  router.get("/platform/workflow-providers", authenticate, resolveActingCompany, async (req, res, next) => {
    try {
      const result = await db(
        `SELECT c.id,c.name,c.provider_name,c.base_url,c.auth_type,c.connector_configuration,
                c.timeout_ms,c.connection_status,c.enabled,
                d.connector_key,d.name AS connector_name,d.credentials_schema
           FROM integration_connections c
           LEFT JOIN platform_connector_definitions d ON d.id=c.connector_definition_id
          WHERE c.company_id=$1 AND c.enabled=true
          ORDER BY COALESCE(d.name,c.name,c.provider_name),c.updated_at DESC`,
        [req.platformCompanyId || req.user.companyId]
      );
      const seen = new Set();
      const providers = [];
      const secretName = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key|client[_-]?secret)/i;
      for (const row of result.rows || []) {
        const providerKey = String(row.provider_name || row.connector_key || "").trim();
        if (!providerKey || seen.has(providerKey.toLowerCase())) continue;
        seen.add(providerKey.toLowerCase());
        const configuration = row.connector_configuration && typeof row.connector_configuration === "object" && !Array.isArray(row.connector_configuration)
          ? row.connector_configuration
          : {};
        const schema = Array.isArray(row.credentials_schema)
          ? row.credentials_schema
          : Object.entries(row.credentials_schema || {}).map(([key,value]) => ({ key, ...(value || {}) }));
        const fixed = [
          { key: "name", label: "Name", value: row.connector_name || row.name || providerKey, secure: false },
          { key: "providerKey", label: "Provider Key", value: providerKey, secure: false },
          { key: "baseUrl", label: "Base URL", value: row.base_url || "", secure: false },
          { key: "authType", label: "Auth Type", value: row.auth_type || "none", secure: false },
          { key: "timeoutMs", label: "Timeout (ms)", value: Number(row.timeout_ms || 15000), secure: false },
          { key: "status", label: "Status", value: row.connection_status || "", secure: false },
        ];
        const configFields = Object.entries(configuration)
          .filter(([key]) => !secretName.test(key))
          .map(([key,value]) => ({ key, label: key, value, secure: false }));
        const credentialFields = schema
          .map((field) => {
            const key = String(field?.key || field?.name || "").trim();
            if (!key) return null;
            return { key, label: field?.label || field?.name || key, value: "********", secure: true };
          })
          .filter(Boolean);
        providers.push({
          id: row.id,
          providerKey,
          name: row.connector_name || row.name || providerKey,
          variableName: `Provider_${providerKey.replace(/[^A-Za-z0-9_]/g, "_")}`,
          fields: [...fixed, ...configFields, ...credentialFields],
        });
      }
      res.json({ success: true, data: providers });
    } catch (error) {
      next(error);
    }
  });

  router.get("/platform/developer/companies", authenticate, async (req, res) => {
    const oneEngineManager = await hasOneEngineManageAccess(req);
    if (!oneEngineManager) {
      return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
    }

    const result = await db("SELECT c.id,c.name FROM companies c WHERE c.active=true ORDER BY c.name");
    res.json({ success: true, data: result.rows });
  });

  router.put("/platform/developer/acting-company", authenticate, async (req, res) => {
    const companyId = req.body?.actingCompanyId;
    const oneEngineManager = await hasOneEngineManageAccess(req);
    if (!oneEngineManager) {
      return res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
    }

    const result = await db("SELECT c.id,c.name FROM companies c WHERE c.id=$1 AND c.active=true", [companyId]);

    if (!result.rows.length) {
      return res.status(403).json({ success: false, message: "You are not authorised for the selected company" });
    }
    res.json({ success: true, data: { actingCompanyId: result.rows[0].id, company: result.rows[0] } });
  });

  router.use(["/platform/objects/:objectKey/records", "/platform/objects/:objectKey/reports"], authenticate, async (req, res, next) => {
    try {
      const object = (await db("SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [req.params.objectKey, req.user.companyId])).rows[0];
      const system = systemObject(object);
      if (system) return authorize(system.permission)(req, res, next);
      next();
    } catch (error) { next(error); }
  });

  router.get("/platform/system/:objectKey/configuration", authenticate, (req, res, next) => {
    const system = systemObject({ object_key: req.params.objectKey });
    if (!system) return res.status(404).json({ success: false, message: "System object not found" });
    return authorize(system.permission)(req, res, async () => {
      try {
        if (req.query.recordId && !recordIdIsValid(req.query.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
        const data = await readDomainConfiguration(db, system.key, req, req.query.recordId || null);
        res.json({ success: true, data });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
      }
    });
  });

  router.put("/platform/system/:objectKey/records/:recordId/extensions", ...manage, (req, res, next) => {
    const system = systemObject({ object_key: req.params.objectKey });
    if (!system || !recordIdIsValid(req.params.recordId)) return res.status(404).json({ success: false, message: "Record not found" });
    if (!req.body?.platform || Object.keys(req.body).some(key => key !== "platform")) return res.status(400).json({ success: false, message: "Only Platform extension values are accepted here" });
    return authorize(system.permission)(req, res, async () => {
      try {
        const configuration = await readDomainConfiguration(db, system.key, req, req.params.recordId);
        const object = configuration.object;
        const result = await withDomainSave({ pool, db, savePlatformRecord: saveDomainConfiguration, key: system.key, req, id: req.params.recordId,
          write: query => {
            const clauses = ["id=$1", "company_id=$2"], params = [req.params.recordId, req.user.companyId];
            appendSystemReadScope(object, req, clauses, params);
            return query(`SELECT * FROM "${system.table}" WHERE ${clauses.join(" AND ")}`, params);
          },
        });
        res.json({ success: true, data: result.rows[0].platform });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ success: false, message: error.message });
        next(error);
      }
    });
  });

  async function getObject(objectId, req, { forMutation = false, includeInactive = false } = {}) {
    const result = await db(
      `SELECT o.*, COALESCE(o.config,'{}'::jsonb) || COALESCE(s.config,'{}'::jsonb) AS config
         FROM platform_objects o
         LEFT JOIN platform_object_settings s ON s.object_id=o.id AND s.company_id=$2
        WHERE o.id=$1 AND ${includeInactive ? "TRUE" : "o.active=true"} AND (o.company_id IS NULL OR o.company_id=$2)`,
      [objectId, req.user.companyId]
    );
    const object = result.rows[0];
    if (forMutation && object?.company_id === null && !await canManageGlobal(db, req) && !systemObject(object)) return null;
    return object || null;
  }

  async function validateReferences(req, parentObjectId, childObjectId, childFieldId = null) {
    const [parent, child] = await Promise.all([getObject(parentObjectId, req), getObject(childObjectId, req)]);
    if (!parent || !child) return "Referenced objects must exist";
    if (childFieldId) {
      const field = await db("SELECT id,field_type,source_column,config FROM platform_fields WHERE id=$1 AND object_id=$2 AND active=true AND (company_id IS NULL OR company_id=$3)", [childFieldId, childObjectId, req.user.companyId]);
      if (!field.rows.length) return "The child field does not belong to the child object";
      const childField = field.rows[0];
      if (childField.field_type !== "lookup") return "The child field must be a Lookup field";
      if (!childField.source_column || !isSafeIdentifier(childField.source_column)) return "The child Lookup field must have record storage";
    }
    return null;
  }

  router.get("/platform/runtime-forms/:objectKey", authenticate, async (req, res) => {
    try {
      const objectResult = await db(
        `SELECT * FROM platform_objects
           WHERE object_key=$1 AND active=true
             AND (company_id IS NULL OR company_id=$2)
           ORDER BY CASE WHEN company_id=$2 THEN 0 ELSE 1 END
           LIMIT 1`,
        [req.params.objectKey, req.user.companyId]
      );
      const object = objectResult.rows[0];
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });
      const fieldsResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
        [object.id, req.user.companyId]
      );
      const fields = await enrichFields(db, await applyFieldSecurity(db, fieldsResult.rows, req), req);
      const pageType = req.query.pageType || req.query.page_type || "detail";
      if (!PAGE_TYPES.has(pageType)) return res.status(400).json({ success: false, message: "Invalid page type" });
      const requestedRecordTypeId = typeof req.query.recordTypeId === "string" ? req.query.recordTypeId : null;
      const recordType = requestedRecordTypeId ? await resolveRecordType(object, requestedRecordTypeId, req) : null;
      if (requestedRecordTypeId && !recordType) {
        return res.status(400).json({ success: false, message: "Record type is not available for this object" });
      }
      const layout = await resolveEffectiveLayoutForRequest({
        objectId: object.id,
        pageType,
        recordTypeId: recordType?.id || null,
        req,
      });
      res.json({ success: true, data: { object, fields, layout, recordType: recordType || null } });
    } catch (error) {
      console.error("Runtime platform form error:", error);
      res.status(500).json({ success: false, message: "Unable to load runtime platform form" });
    }
  });

  router.get("/platform/metadata", ...manage, async (req, res) => {
    try {
      const scope = visibilityClause("o", req);
      const [modules, objects, fields, relationships, layouts, rules] = await Promise.all([
        db("SELECT * FROM platform_modules ORDER BY name"),
        db(`SELECT * FROM platform_objects o WHERE o.active=true AND ${scope.sql} ORDER BY o.label`, scope.params),
        db(`SELECT f.* FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE o.active=true AND f.active=true AND (f.company_id IS NULL OR f.company_id=$1) AND ${scope.sql} ORDER BY f.object_id, f.display_order, f.label`, scope.params),
        db(`SELECT r.*, p.object_key AS parent_object_key, c.object_key AS child_object_key FROM platform_relationships r JOIN platform_objects p ON p.id=r.parent_object_id JOIN platform_objects c ON c.id=r.child_object_id WHERE r.active=true AND (p.company_id IS NULL OR p.company_id=$1)`, [req.user.companyId]),
        db("SELECT * FROM platform_layouts WHERE active=true AND (company_id IS NULL OR company_id=$1) ORDER BY name", [req.user.companyId]),
        db("SELECT * FROM platform_rules WHERE active=true AND (company_id IS NULL OR company_id=$1) ORDER BY name", [req.user.companyId]),
      ]);
      res.json({ success: true, data: { modules: modules.rows, objects: objects.rows, fields: fields.rows, relationships: relationships.rows, layouts: layouts.rows, rules: rules.rows } });
    } catch (error) {
      console.error("Platform metadata load error:", error);
      res.status(500).json({ success: false, message: "Unable to load platform metadata" });
    }
  });

  router.get("/platform/value-sets", ...manage, async (req, res) => {
    const result = await db(
      "SELECT * FROM platform_value_sets WHERE company_id=$1 ORDER BY label",
      [req.user.companyId]
    );
    const values = await db(
      "SELECT v.* FROM platform_value_set_values v JOIN platform_value_sets s ON s.id=v.value_set_id WHERE s.company_id=$1 ORDER BY v.value_set_id, v.display_order, v.label",
      [req.user.companyId]
    );
    const bySet = new Map();
    for (const value of values.rows) {
      if (!bySet.has(value.value_set_id)) bySet.set(value.value_set_id, []);
      bySet.get(value.value_set_id).push(value);
    }
    res.json({
      success: true,
      data: result.rows.map((set) => ({ ...set, values: bySet.get(set.id) || [] })),
    });
  });

  router.post("/platform/value-sets", ...manage, async (req, res) => {
    if (!validValueSetInput(req.body)) {
      return res.status(400).json({ success: false, message: "A label and safe value-set key are required" });
    }
    const valueSetKey = req.body.valueSetKey || toSafeApiName(req.body.label, "value_set");
    try {
      const result = await db(
        "INSERT INTO platform_value_sets (value_set_key,label,description,company_id) VALUES ($1,$2,$3,$4) RETURNING *",
        [valueSetKey, req.body.label.trim(), req.body.description || null, req.user.companyId]
      );
      res.status(201).json({ success: true, data: { ...result.rows[0], values: [] } });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A value set with this API name already exists" });
      console.error("Platform value set create error:", error);
      res.status(500).json({ success: false, message: "Unable to create value set" });
    }
  });

  router.put("/platform/value-sets/:valueSetId", ...manage, async (req, res) => {
    if (req.body.valueSetKey !== undefined && !isSafeIdentifier(req.body.valueSetKey)) {
      return res.status(400).json({ success: false, message: "valueSetKey must be a safe identifier" });
    }
    const existing = await db("SELECT * FROM platform_value_sets WHERE id=$1 AND company_id=$2", [req.params.valueSetId, req.user.companyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Value set not found" });
    try {
      const result = await db(
        "UPDATE platform_value_sets SET value_set_key=COALESCE($1,value_set_key),label=COALESCE($2,label),description=COALESCE($3,description),active=COALESCE($4,active),updated_at=NOW() WHERE id=$5 AND company_id=$6 RETURNING *",
        [req.body.valueSetKey, req.body.label, req.body.description, req.body.active, req.params.valueSetId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A value set with this API name already exists" });
      console.error("Platform value set update error:", error);
      res.status(500).json({ success: false, message: "Unable to update value set" });
    }
  });

  router.post("/platform/value-sets/:valueSetId/values", ...manage, async (req, res) => {
    const set = await db("SELECT id FROM platform_value_sets WHERE id=$1 AND company_id=$2 AND active=true", [req.params.valueSetId, req.user.companyId]);
    if (!set.rows.length || typeof req.body.label !== "string" || !req.body.label.trim()) return res.status(400).json({ success: false, message: "Active value set and value label are required" });
    const value = req.body.value || toSafeApiName(req.body.label);
    if (!isSafeIdentifier(value)) return res.status(400).json({ success: false, message: "Value must be a safe identifier" });
    try {
      const result = await db(
        "INSERT INTO platform_value_set_values (value_set_id,value,label,display_order,active) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        [req.params.valueSetId, value, req.body.label.trim(), Number(req.body.displayOrder || 0), req.body.active !== false]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A value with this stable value already exists in the value set" });
      console.error("Platform value set value create error:", error);
      res.status(500).json({ success: false, message: "Unable to create value-set value" });
    }
  });

  router.put("/platform/value-set-values/:valueId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT v.* FROM platform_value_set_values v JOIN platform_value_sets s ON s.id=v.value_set_id WHERE v.id=$1 AND s.company_id=$2",
      [req.params.valueId, req.user.companyId]
    );
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Value-set value not found" });
    if (req.body.value !== undefined && !isSafeIdentifier(req.body.value)) return res.status(400).json({ success: false, message: "Value must be a safe identifier" });
    try {
      const result = await db(
        "UPDATE platform_value_set_values SET value=COALESCE($1,value),label=COALESCE($2,label),display_order=COALESCE($3,display_order),active=COALESCE($4,active) WHERE id=$5 RETURNING *",
        [req.body.value, req.body.label, req.body.displayOrder, req.body.active, req.params.valueId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A value with this stable value already exists in the value set" });
      console.error("Platform value set value update error:", error);
      res.status(500).json({ success: false, message: "Unable to update value-set value" });
    }
  });

  async function recordTypeDeactivationBlockers(recordType, req) {
    const blockers = [];
    if (recordType.is_default === true) blockers.push("default record type");
    const [records, layouts, assignments] = await Promise.all([
      db("SELECT COUNT(*)::int AS count FROM platform_record_associations WHERE record_type_id=$1 AND company_id=$2", [recordType.id, req.user.companyId]),
      db("SELECT COUNT(*)::int AS count FROM platform_layouts WHERE record_type_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [recordType.id, req.user.companyId]),
      db("SELECT COUNT(*)::int AS count FROM platform_layout_assignments WHERE record_type_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [recordType.id, req.user.companyId]),
    ]);
    const recordCount = Number(records.rows[0]?.count || 0);
    const layoutCount = Number(layouts.rows[0]?.count || 0);
    const assignmentCount = Number(assignments.rows[0]?.count || 0);
    if (recordCount) blockers.push(`${recordCount} record${recordCount === 1 ? "" : "s"}`);
    if (layoutCount) blockers.push(`${layoutCount} legacy layout assignment${layoutCount === 1 ? "" : "s"}`);
    if (assignmentCount) blockers.push(`${assignmentCount} page-layout activation${assignmentCount === 1 ? "" : "s"}`);
    return blockers;
  }

  router.get("/platform/objects/:objectId/record-types", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const includeInactive = ["1","true"].includes(String(req.query?.includeInactive || "").toLowerCase());
    const types = await db(
      `SELECT * FROM platform_record_types WHERE object_id=$1 AND company_id=$2 ${includeInactive ? "" : "AND active=true"} ORDER BY active DESC,is_default DESC,label`,
      [object.id, req.user.companyId]
    );
    const restrictions = await db("SELECT r.* FROM platform_record_type_picklist_values r JOIN platform_record_types t ON t.id=r.record_type_id WHERE t.object_id=$1 AND t.company_id=$2 AND r.active=true", [object.id, req.user.companyId]);
    const byType = new Map();
    for (const row of restrictions.rows) {
      if (!byType.has(row.record_type_id)) byType.set(row.record_type_id, {});
      if (!byType.get(row.record_type_id)[row.field_id]) byType.get(row.record_type_id)[row.field_id] = [];
      byType.get(row.record_type_id)[row.field_id].push(row.value);
    }
    const data = [];
    for (const type of types.rows) {
      data.push({
        ...type,
        picklistRestrictions: byType.get(type.id) || {},
        deactivationBlockers: type.active === false ? [] : await recordTypeDeactivationBlockers(type, req),
      });
    }
    res.json({ success: true, data });
  });

  router.post("/platform/objects/:objectId/record-types", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { forMutation: true });
    if (!object || !validRecordTypeInput(req.body)) return res.status(400).json({ success: false, message: "Object and valid record type metadata are required" });
    const key = req.body.recordTypeKey || toSafeApiName(req.body.label, "record_type");
    const restrictions = req.body.picklistRestrictions || {};
    try {
      await validateRecordTypeRestrictions(object, restrictions, req);
      await validateRecordTypeDefaults(object, req.body.defaultValues, req);
      if (req.body.isDefault === true) {
        await db("UPDATE platform_record_types SET is_default=false WHERE object_id=$1 AND company_id=$2 AND is_default=true", [object.id, req.user.companyId]);
      }
      const result = await db("INSERT INTO platform_record_types (object_id,record_type_key,label,description,company_id,default_values,is_default,active) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *", [object.id, key, req.body.label.trim(), req.body.description || null, req.user.companyId, JSON.stringify(req.body.defaultValues || {}), req.body.isDefault === true, req.body.active !== false]);
      for (const [fieldId, values] of Object.entries(restrictions)) for (const value of values) {
        await db("INSERT INTO platform_record_type_picklist_values (record_type_id,field_id,value) VALUES ($1,$2,$3)", [result.rows[0].id, fieldId, String(value)]);
      }
      res.status(201).json({ success: true, data: { ...result.rows[0], picklistRestrictions: restrictions } });
    } catch (error) {
      if (error instanceof ConditionError) return res.status(400).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A record type with this key already exists" });
      console.error("Platform record type create error:", error);
      res.status(500).json({ success: false, message: "Unable to create record type" });
    }
  });

  router.put("/platform/record-types/:recordTypeId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_record_types WHERE id=$1 AND company_id=$2", [req.params.recordTypeId, req.user.companyId]);
    if (!existing.rows.length || !validRecordTypeInput({ ...existing.rows[0], ...req.body })) return res.status(404).json({ success: false, message: "Record type not found or invalid" });
    const current = existing.rows[0];
    const restrictions = req.body.picklistRestrictions;
    try {
      const object = await getObject(current.object_id, req, { includeInactive: true });
      if (!object) return res.status(404).json({ success: false, message: "Record type object not found" });
      if (restrictions !== undefined) await validateRecordTypeRestrictions(object, restrictions, req);
      if (req.body.defaultValues !== undefined) await validateRecordTypeDefaults(object, req.body.defaultValues, req);
      if (current.active !== false && req.body.active === false) {
        const blockers = await recordTypeDeactivationBlockers(current, req);
        if (blockers.length) {
          return res.status(409).json({
            success: false,
            code: "RECORD_TYPE_IN_USE",
            message: `Record type cannot be deactivated while it is used by ${blockers.join(", ")}.`,
            blockers,
          });
        }
      }
      if (req.body.isDefault === true) {
        if (req.body.active === false) return res.status(400).json({ success: false, message: "An inactive record type cannot be the default" });
        await db("UPDATE platform_record_types SET is_default=false WHERE object_id=$1 AND company_id=$2 AND id<>$3 AND is_default=true", [current.object_id, req.user.companyId, current.id]);
      }
      if (current.is_default === true && req.body.active === false) {
        return res.status(409).json({ success: false, code: "DEFAULT_RECORD_TYPE", message: "Choose another default record type before deactivating this one" });
      }
      const result = await db("UPDATE platform_record_types SET record_type_key=COALESCE($1,record_type_key),label=COALESCE($2,label),description=COALESCE($3,description),default_values=COALESCE($4::jsonb,default_values),is_default=COALESCE($5,is_default),active=COALESCE($6,active),updated_at=NOW() WHERE id=$7 AND company_id=$8 RETURNING *", [req.body.recordTypeKey, req.body.label?.trim(), req.body.description, req.body.defaultValues === undefined ? null : JSON.stringify(req.body.defaultValues), req.body.isDefault, req.body.active, current.id, req.user.companyId]);
      if (restrictions !== undefined) {
        await db("DELETE FROM platform_record_type_picklist_values WHERE record_type_id=$1", [current.id]);
        for (const [fieldId, values] of Object.entries(restrictions || {})) for (const value of values) await db("INSERT INTO platform_record_type_picklist_values (record_type_id,field_id,value) VALUES ($1,$2,$3)", [current.id, fieldId, String(value)]);
      }
      res.json({ success: true, data: { ...result.rows[0], picklistRestrictions: restrictions ?? undefined } });
    } catch (error) {
      if (error instanceof ConditionError) return res.status(400).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A record type with this key already exists" });
      console.error("Platform record type update error:", error);
      res.status(500).json({ success: false, message: "Unable to update record type" });
    }
  });

  router.delete("/platform/record-types/:recordTypeId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_record_types WHERE id=$1 AND company_id=$2", [req.params.recordTypeId, req.user.companyId]);
    const recordType = existing.rows[0];
    if (!recordType) return res.status(404).json({ success: false, message: "Record type not found" });
    if (recordType.active === false) return res.json({ success: true, data: recordType });
    const blockers = await recordTypeDeactivationBlockers(recordType, req);
    if (blockers.length) {
      return res.status(409).json({
        success: false,
        code: "RECORD_TYPE_IN_USE",
        message: `Record type cannot be deactivated while it is used by ${blockers.join(", ")}.`,
        blockers,
      });
    }
    const result = await db("UPDATE platform_record_types SET active=false,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *", [recordType.id, req.user.companyId]);
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/component-registry", ...manage, (req, res) => {
    res.json({ success: true, data: listPlatformComponents() });
  });

  router.get("/platform/action-registry", ...manage, async (req, res) => {
    res.json({ success: true, data: listRegisteredPlatformActions().map(({ executor, validation, ...definition }) => definition) });
  });

  router.get("/platform/objects/:objectId/registered-actions", ...manage, async (req, res) => {
    const result = await db(`SELECT * FROM platform_registered_actions WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY label`, [req.params.objectId, req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });

  async function registeredActionDeactivationBlockers(action, req) {
    const [buttons, bindings] = await Promise.all([
      db(
        "SELECT COUNT(*)::int AS count FROM platform_buttons WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true AND target_type='action' AND COALESCE(target_key,action_key)=$3",
        [action.object_id, req.user.companyId, action.action_key]
      ),
      db(
        "SELECT COUNT(*)::int AS count FROM platform_action_bindings WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true AND action_key=$3",
        [action.object_id, req.user.companyId, action.action_key]
      ),
    ]);
    const blockers = [];
    const buttonCount = Number(buttons.rows[0]?.count || 0);
    const bindingCount = Number(bindings.rows[0]?.count || 0);
    if (buttonCount) blockers.push(`${buttonCount} button${buttonCount === 1 ? "" : "s"}`);
    if (bindingCount) blockers.push(`${bindingCount} action binding${bindingCount === 1 ? "" : "s"}`);
    return blockers;
  }

  router.post("/platform/objects/:objectId/registered-actions", ...manage, async (req, res) => {
    const actionKey = String(req.body?.actionKey || req.body?.action_key || "").trim();
    const handlerKey = String(req.body?.handlerKey || req.body?.handler_key || "").trim();
    const label = String(req.body?.label || "").trim();
    if (!actionKey || !handlerKey || !label) return res.status(400).json({ success: false, message: "actionKey, handlerKey and label are required" });
    if (!listRegisteredPlatformActions().some((item) => item.key === handlerKey)) return res.status(400).json({ success: false, code: "UNREGISTERED_HANDLER", message: "Custom actions must use a registered handler" });
    const result = await db(`INSERT INTO platform_registered_actions (company_id,object_id,action_key,label,description,handler_key,required_permission,config) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`, [req.user.companyId, req.params.objectId, actionKey, label, req.body?.description || null, handlerKey, req.body?.requiredPermission || null, JSON.stringify(req.body?.config || {})]);
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.put("/platform/objects/:objectId/registered-actions/:actionId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT * FROM platform_registered_actions WHERE id=$1 AND object_id=$2 AND company_id=$3",
      [req.params.actionId, req.params.objectId, req.user.companyId]
    );
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Registered action not found" });

    const old = existing.rows[0];
    const actionKey = String(req.body?.actionKey ?? req.body?.action_key ?? old.action_key).trim();
    const handlerKey = String(req.body?.handlerKey ?? req.body?.handler_key ?? old.handler_key).trim();
    const label = String(req.body?.label ?? old.label).trim();
    const active = req.body?.active === undefined ? old.active !== false : req.body.active === true;

    if (!actionKey || !handlerKey || !label) {
      return res.status(400).json({ success: false, message: "actionKey, handlerKey and label are required" });
    }
    if (!listRegisteredPlatformActions().some((item) => item.key === handlerKey)) {
      return res.status(400).json({ success: false, code: "UNREGISTERED_HANDLER", message: "Custom actions must use a registered handler" });
    }

    const result = await db(
      `UPDATE platform_registered_actions
          SET action_key=$1,label=$2,description=$3,handler_key=$4,required_permission=$5,
              config=$6::jsonb,active=$7,user_modified=true,updated_at=NOW()
        WHERE id=$8 AND object_id=$9 AND company_id=$10
        RETURNING *`,
      [actionKey, label, req.body?.description ?? old.description, handlerKey,
        req.body?.requiredPermission ?? req.body?.required_permission ?? old.required_permission,
        JSON.stringify(req.body?.config ?? old.config ?? {}), active,
        old.id, req.params.objectId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/objects/:objectId/registered-actions/:actionId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT * FROM platform_registered_actions WHERE id=$1 AND object_id=$2 AND company_id=$3",
      [req.params.actionId, req.params.objectId, req.user.companyId]
    );
    const action = existing.rows[0];
    if (!action) return res.status(404).json({ success: false, message: "Registered action not found" });
    const blockers = await registeredActionDeactivationBlockers(action, req);
    if (blockers.length) {
      return res.status(409).json({
        success: false,
        code: "ACTION_IN_USE",
        message: `Action cannot be deactivated while it is used by ${blockers.join(", ")}.`,
        blockers,
      });
    }
    const result = await db(
      `UPDATE platform_registered_actions
          SET active=false,user_modified=true,updated_at=NOW()
        WHERE id=$1 AND object_id=$2 AND company_id=$3
        RETURNING id`,
      [action.id, req.params.objectId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/button-variants", ...manage, (req, res) => {
    res.json({ success: true, data: BUTTON_VARIANTS });
  });

  async function resolveButtonTarget(req, button, objectId = req.params.objectId) {
    if (button.targetType === "url") return { url: button.targetKey };
    if (button.targetType === "workflow") {
      const result = await db(
        `SELECT id,name,lifecycle_status,active FROM platform_rules
         WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2)
           AND (id::text=$3 OR name=$3) LIMIT 1`,
        [objectId, req.user.companyId, button.targetKey]
      );
      if (!result.rows.length) return { error: "Button must reference an existing workflow" };
      return { workflow: result.rows[0] };
    }
    const core = listRegisteredPlatformActions().find((item) => item.key === button.targetKey);
    if (core) return { action: core, handlerKey: core.key };
    const custom = await db(
      "SELECT * FROM platform_registered_actions WHERE action_key=$1 AND object_id=$2 AND (company_id IS NULL OR company_id=$3) AND active=true LIMIT 1",
      [button.targetKey, objectId, req.user.companyId]
    );
    if (!custom.rows.length) return { error: "Button must reference a registered action" };
    return { action: custom.rows[0], handlerKey: custom.rows[0].handler_key };
  }

  router.get("/platform/objects/:objectId/buttons", ...manage, async (req, res) => {
    const result = await db(
      `SELECT * FROM platform_buttons WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY label`,
      [req.params.objectId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/objects/:objectId/buttons", ...manage, async (req, res) => {
    try {
      const button = validateButtonDefinition(req.body || {});
      const target = await resolveButtonTarget(req, button);
      if (target.error) return res.status(400).json({ success: false, code: "UNREGISTERED_BUTTON_TARGET", message: target.error });
      const result = await db(
        `INSERT INTO platform_buttons
         (company_id,object_id,button_key,label,icon,action_key,target_type,target_key,variant,placement,required_permission,visibility_rule,input_mappings,config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb) RETURNING *`,
        [req.user.companyId, req.params.objectId, button.buttonKey, button.label, button.icon,
          button.targetType === "action" ? button.targetKey : null, button.targetType, button.targetKey,
          button.variant, button.placement, button.requiredPermission, JSON.stringify(button.visibilityRule),
          JSON.stringify(button.inputMappings), JSON.stringify(button.config)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A button with this key already exists" });
      if (error.message?.includes("button") || error.message?.includes("Button") || error.message?.includes("variant") || error.message?.includes("targetType") || error.message?.includes("Mappings")) {
        return res.status(400).json({ success: false, message: error.message });
      }
      throw error;
    }
  });

  router.put("/platform/objects/:objectId/buttons/:buttonId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_buttons WHERE id=$1 AND object_id=$2 AND company_id=$3", [req.params.buttonId, req.params.objectId, req.user.companyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Button not found" });
    try {
      const current = existing.rows[0];
      const button = validateButtonDefinition({
        buttonKey: req.body.buttonKey ?? current.button_key,
        label: req.body.label ?? current.label,
        icon: req.body.icon ?? current.icon,
        variant: req.body.variant ?? current.variant,
        targetType: req.body.targetType ?? current.target_type,
        targetKey: req.body.targetKey ?? current.target_key ?? current.action_key,
        placement: req.body.placement ?? current.placement,
        requiredPermission: req.body.requiredPermission ?? current.required_permission,
        visibilityRule: req.body.visibilityRule ?? current.visibility_rule,
        inputMappings: req.body.inputMappings ?? current.input_mappings,
        config: req.body.config ?? current.config,
      });
      const target = await resolveButtonTarget(req, button);
      if (target.error) return res.status(400).json({ success: false, code: "UNREGISTERED_BUTTON_TARGET", message: target.error });
      const result = await db(
        `UPDATE platform_buttons SET button_key=$1,label=$2,icon=$3,action_key=$4,target_type=$5,target_key=$6,variant=$7,user_modified=true,
         placement=$8,required_permission=$9,visibility_rule=$10::jsonb,input_mappings=$11::jsonb,config=$12::jsonb,updated_at=NOW()
         WHERE id=$13 AND object_id=$14 AND company_id=$15 RETURNING *`,
        [button.buttonKey, button.label, button.icon, button.targetType === "action" ? button.targetKey : null,
          button.targetType, button.targetKey, button.variant, button.placement, button.requiredPermission,
          JSON.stringify(button.visibilityRule), JSON.stringify(button.inputMappings), JSON.stringify(button.config),
          req.params.buttonId, req.params.objectId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  });

  router.delete("/platform/objects/:objectId/buttons/:buttonId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_buttons WHERE id=$1 AND object_id=$2 AND company_id=$3", [req.params.buttonId, req.params.objectId, req.user.companyId]);
    const button = existing.rows[0];
    if (!button) return res.status(404).json({ success: false, message: "Button not found" });
    const layouts = await db(
      "SELECT name FROM platform_layouts WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) AND definition::text ILIKE $3",
      [req.params.objectId, req.user.companyId, `%${String(button.button_key).replace(/[%_]/g, "")}%`]
    );
    if (layouts.rows.length) {
      return res.status(409).json({
        success: false,
        code: "BUTTON_IN_USE",
        message: `Button cannot be deactivated while it is placed on: ${layouts.rows.map((row) => row.name).join(", ")}`,
        blockers: layouts.rows.map((row) => `layout: ${row.name}`),
      });
    }
    const result = await db("UPDATE platform_buttons SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 RETURNING *", [button.id]);
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/objects", ...manage, async (req, res) => {
    const scope = visibilityClause("o", req);
    const result = await db(`SELECT o.*, COALESCE(o.config,'{}'::jsonb) || COALESCE(s.config,'{}'::jsonb) AS config FROM platform_objects o LEFT JOIN platform_object_settings s ON s.object_id=o.id AND s.company_id=$1 WHERE ${scope.sql} ORDER BY o.label`, scope.params);
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/objects/:objectId", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [object.id, req.user.companyId]);
    res.json({ success: true, data: { ...object, fields: await enrichFields(db, fields.rows, req) } });
  });

  router.get("/platform/fields/:fieldId/security", ...manage, async (req, res) => {
    const result = await db(
      "SELECT s.* FROM platform_field_security s JOIN platform_fields f ON f.id=s.field_id JOIN platform_objects o ON o.id=f.object_id WHERE s.field_id=$1 AND s.company_id=$2 AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2) ORDER BY s.role_id",
      [req.params.fieldId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/fields/:fieldId/effective-security", authenticate, async (req, res) => {
    const result = await db(
      "SELECT f.*,o.object_key FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE f.id=$1 AND f.active=true AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2)",
      [req.params.fieldId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Field not found" });
    res.json({ success: true, data: await resolveEffectiveFieldSecurity(db, result.rows[0], req) });
  });

  router.get("/platform/objects/:objectId/access-summary", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const [roles, permissions] = await Promise.all([
      db("SELECT id,name,description,is_system FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
      db(
        "SELECT role_id,can_view,can_create,can_edit,can_delete,can_import,can_export FROM platform_object_permissions WHERE object_id=$1 AND company_id=$2",
        [object.id, req.user.companyId]
      ),
    ]);
    const byRole = new Map(permissions.rows.map((row) => [String(row.role_id), row]));
    res.json({
      success: true,
      data: roles.rows.map((role) => ({
        roleId: role.id,
        roleName: role.name,
        description: role.description || "",
        systemRole: role.is_system === true,
        ...(byRole.get(String(role.id)) || {
          can_view: false,
          can_create: false,
          can_edit: false,
          can_delete: false,
          can_import: false,
          can_export: false,
        }),
      })),
    });
  });

  router.put("/platform/objects/:objectId/permissions/:roleId", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
    if (!role.rows.length) return res.status(404).json({ success: false, message: "Role not found" });
    const values = {
      canView: req.body?.canView === true,
      canCreate: req.body?.canCreate === true,
      canEdit: req.body?.canEdit === true,
      canDelete: req.body?.canDelete === true,
      canImport: req.body?.canImport === true,
      canExport: req.body?.canExport === true,
    };
    if (!values.canView && (values.canCreate || values.canEdit || values.canDelete || values.canImport || values.canExport)) {
      return res.status(400).json({ success: false, message: "Read access is required before Create, Edit, Delete, Import, or Export can be granted" });
    }
    const result = await db(
      `INSERT INTO platform_object_permissions
        (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete,can_import,can_export)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (object_id,role_id,company_id)
       DO UPDATE SET can_view=EXCLUDED.can_view,can_create=EXCLUDED.can_create,can_edit=EXCLUDED.can_edit,
                     can_delete=EXCLUDED.can_delete,can_import=EXCLUDED.can_import,can_export=EXCLUDED.can_export
       RETURNING *`,
      [object.id, req.params.roleId, req.user.companyId, values.canView, values.canCreate, values.canEdit,
        values.canDelete, values.canImport, values.canExport]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/objects/:objectId/field-access-summary", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const [roles, fields, security] = await Promise.all([
      db("SELECT id,name FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
      db("SELECT id,api_name,label,readable,writable,active FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY active DESC,display_order,label", [object.id, req.user.companyId]),
      db(
        `SELECT s.field_id,s.role_id,s.readable,s.writable
           FROM platform_field_security s
           JOIN platform_fields f ON f.id=s.field_id
          WHERE f.object_id=$1 AND s.company_id=$2`,
        [object.id, req.user.companyId]
      ),
    ]);
    const overrides = new Map(security.rows.map((row) => [`${row.field_id}:${row.role_id}`, row]));
    res.json({
      success: true,
      data: {
        fields: fields.rows,
        roles: roles.rows,
        access: fields.rows.map((field) => ({
          fieldId: field.id,
          byRole: Object.fromEntries(roles.rows.map((role) => {
            const override = overrides.get(`${field.id}:${role.id}`);
            return [role.id, {
              readable: override ? override.readable !== false : field.readable !== false,
              writable: override ? override.writable === true : field.writable === true,
              inherited: !override,
            }];
          })),
        })),
      },
    });
  });

  router.get("/platform/objects/:objectId/effective-permissions", authenticate, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const result = await db(
      "SELECT can_view,can_create,can_edit,can_delete,can_import,can_export FROM platform_object_permissions WHERE object_id=$1 AND role_id=$2 AND company_id=$3",
      [object.id, req.user.roleId || null, req.user.companyId]
    );
    const permission = result.rows[0] || { can_view: false, can_create: false, can_edit: false, can_delete: false, can_import: false, can_export: false };
    const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
    const actions = ["view", "create", "edit", "delete", "import", "export"];
    const [access, rolePermissionRows, fieldsResult] = await Promise.all([
      Promise.all(actions.map((action) => hasPlatformObjectPermission(db, req, object.id, action))),
      req.user.roleId
        ? db("SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1", [req.user.roleId])
        : Promise.resolve({ rows: [] }),
      db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label", [object.id, req.user.companyId]),
    ]);
    const effectiveObjectAccess = Object.fromEntries(actions.map((action, index) => [`can_${action}`, access[index]]));
    const rolePermissions = rolePermissionRows.rows.map((row) => row.code);
    const systemPermissions = [...new Set([
      ...rolePermissions,
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])].sort();
    const permissionSetGroups = [...new Map(permissionSets.flatMap((set) => set.permission_set_groups || [])
      .map((group) => [String(group.id), { id: group.id, name: group.name, apiKey: group.api_key }])).values()];
    const setGranted = actions.some((action) => permissionSetAllowsObject(permissionSets, object.object_key, action))
      || actions.some((action) => {
        const code = systemObjectRbacPermission(object, action);
        return code && permissionSetAllowsSystemPermission(permissionSets, code);
      });
    const bridgeGranted = actions.some((action) => {
      const code = systemObjectRbacPermission(object, action);
      return code && rolePermissions.includes(code);
    });
    const canManageOneEngine = systemPermissions.includes("oneengine.manage");
    const source = canManageOneEngine ? "oneengine_permission"
      : result.rows[0] ? "role_override"
        : setGranted ? "permission_set"
          : bridgeGranted ? "rbac_bridge"
            : "default_deny";
    const securedFields = access[0] ? await applyFieldSecurity(db, fieldsResult.rows, req) : [];
    const fields = securedFields.map((field) => ({
      fieldId: field.id,
      label: field.label,
      readable: field.readable !== false,
      writable: field.writable === true,
    }));
    res.json({
      success: true,
      data: {
        objectId: object.id,
        roleId: req.user.roleId || null,
        ...permission,
        ...effectiveObjectAccess,
        permissionSets: permissionSets.map(({ id, name, api_key, source_package_id, package_required }) => ({
          id, name, apiKey: api_key, sourcePackageId: source_package_id, packageRequired: package_required,
        })),
        permissionSetGroups,
        systemPermissions,
        fields,
        canManageOneEngine,
        source,
      },
    });
  });

  router.get("/platform/runtime/ui-context", authenticate, async (req, res) => {
    try {
      const [rolePermissionsResult, permissionSets, entitlements] = await Promise.all([
        req.user.roleId
          ? db(
              `SELECT p.code
                 FROM role_permissions rp
                 JOIN permissions p ON p.id=rp.permission_id
                WHERE rp.role_id=$1
                ORDER BY p.code`,
              [req.user.roleId]
            )
          : Promise.resolve({ rows: [] }),
        loadEffectivePermissionSets(db, req.user, req),
        getCompanyEntitlements(db, req.user.companyId),
      ]);
      const permissions = [...new Set([
        ...rolePermissionsResult.rows.map((row) => row.code),
        ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
      ])].sort();
      const enabledEntitlements = Object.entries(entitlements || {})
        .filter(([, enabled]) => enabled === true)
        .map(([key]) => key)
        .sort();
      res.json({
        success: true,
        data: {
          userId: req.user.id || null,
          companyId: req.user.companyId || null,
          roleId: req.user.roleId || null,
          storeId: req.user.storeId || null,
          permissions,
          entitlements: enabledEntitlements,
          entitlementMap: entitlements || {},
        },
      });
    } catch (error) {
      console.error("Platform UI context load error:", error);
      res.status(500).json({ success: false, message: "Unable to load runtime UI context" });
    }
  });

  router.get("/platform/permission-catalog", ...manage, async (req, res) => {
    const result = await db("SELECT code FROM permissions ORDER BY code", []);
    res.json({ success: true, data: result.rows.map((row) => row.code) });
  });

  router.get("/platform/permission-users", ...manage, async (req, res) => {
    const result = await db(
      "SELECT id,username FROM users WHERE company_id=$1 AND active=true ORDER BY username",
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  async function preparePermissionSet(body, companyId) {
    if (!validPermissionSetInput(body)) return null;
    const systemPermissions = [...new Set(body.systemPermissions || [])];
    if (systemPermissions.length) {
      const found = await db("SELECT code FROM permissions WHERE code=ANY($1::text[])", [systemPermissions]);
      if (found.rows.length !== systemPermissions.length) return null;
    }
    const objectKeys = Object.keys(body.objectPermissions || {});
    if (objectKeys.length) {
      const found = await db(
        "SELECT object_key FROM platform_objects WHERE object_key=ANY($1::text[]) AND active=true AND (company_id IS NULL OR company_id=$2)",
        [objectKeys, companyId]
      );
      if (found.rows.length !== objectKeys.length) return null;
    }
    const fieldKeys = Object.keys(body.fieldPermissions || {});
    if (fieldKeys.length) {
      const found = await db(
        `SELECT o.object_key || '.' || f.api_name AS field_key
           FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id
          WHERE (o.company_id IS NULL OR o.company_id=$1)
            AND (f.company_id IS NULL OR f.company_id=$1)
            AND o.active=true AND f.active=true
            AND (o.object_key || '.' || f.api_name)=ANY($2::text[])`,
        [companyId, fieldKeys]
      );
      if (found.rows.length !== fieldKeys.length) return null;
    }
    const fieldPermissions = Object.fromEntries(Object.entries(body.fieldPermissions || {}).map(([key, access]) => [
      key,
      { ...access, ...(access.writable === true ? { readable: true } : {}) },
    ]));
    const name = body.name.trim();
    const apiKey = body.apiKey || toSafeApiName(name, "permission_set");
    return {
      name,
      apiKey,
      description: body.description || null,
      systemPermissions,
      objectPermissions: body.objectPermissions || {},
      fieldPermissions,
      active: body.active !== false,
    };
  }

  router.get("/platform/permission-sets", ...manage, async (req, res) => {
    const result = await db(
      "SELECT id,name,api_key,description,system_permissions,object_permissions,field_permissions,active,source_package_id,package_required FROM oneengine_permission_sets WHERE company_id=$1 ORDER BY name",
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/permission-sets", ...manage, async (req, res) => {
    const definition = await preparePermissionSet(req.body, req.user.companyId);
    if (!definition) return res.status(400).json({ success: false, message: "Permission set metadata is invalid or references unavailable permissions, Objects, or fields" });
    try {
      const result = await db(
        `INSERT INTO oneengine_permission_sets
         (company_id,name,api_key,description,system_permissions,object_permissions,field_permissions,active)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) RETURNING *`,
        [req.user.companyId, definition.name, definition.apiKey, definition.description,
          JSON.stringify(definition.systemPermissions), JSON.stringify(definition.objectPermissions),
          JSON.stringify(definition.fieldPermissions), definition.active]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A permission set with this API key already exists" });
      throw error;
    }
  });

  router.put("/platform/permission-sets/:permissionSetId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT * FROM oneengine_permission_sets WHERE id=$1 AND company_id=$2",
      [req.params.permissionSetId, req.user.companyId]
    );
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Permission set not found" });
    const current = existing.rows[0];
    const definition = await preparePermissionSet({
      name: req.body.name ?? current.name,
      apiKey: req.body.apiKey ?? current.api_key,
      description: req.body.description ?? current.description,
      systemPermissions: req.body.systemPermissions ?? current.system_permissions,
      objectPermissions: req.body.objectPermissions ?? current.object_permissions,
      fieldPermissions: req.body.fieldPermissions ?? current.field_permissions,
      active: req.body.active ?? current.active,
    }, req.user.companyId);
    if (!definition) return res.status(400).json({ success: false, message: "Permission set metadata is invalid or references unavailable permissions, Objects, or fields" });
    try {
      const result = await db(
        `UPDATE oneengine_permission_sets SET name=$1,api_key=$2,description=$3,
           system_permissions=$4::jsonb,object_permissions=$5::jsonb,field_permissions=$6::jsonb,
           active=$7,user_modified=true,updated_at=NOW()
         WHERE id=$8 AND company_id=$9 RETURNING *`,
        [definition.name, definition.apiKey, definition.description, JSON.stringify(definition.systemPermissions),
          JSON.stringify(definition.objectPermissions), JSON.stringify(definition.fieldPermissions),
          definition.active, current.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A permission set with this API key already exists" });
      throw error;
    }
  });

  router.delete("/platform/permission-sets/:permissionSetId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE oneengine_permission_sets SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",
      [req.params.permissionSetId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set not found" });
    res.json({ success: true });
  });

  router.get("/platform/permission-sets/:permissionSetId/assignments", ...manage, async (req, res) => {
    const result = await db(
      `SELECT a.id,a.user_id,a.effective_from,a.effective_until,a.active,u.username
         FROM oneengine_permission_set_assignments a
         JOIN users u ON u.id=a.user_id AND u.company_id=a.company_id
        WHERE a.permission_set_id=$1 AND a.company_id=$2 ORDER BY u.username`,
      [req.params.permissionSetId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/permission-sets/:permissionSetId/assignments", ...manage, async (req, res) => {
    if (!validAssignmentDates(req.body)) return res.status(400).json({ success: false, message: "Assignment dates are invalid" });
    const [set, user] = await Promise.all([
      db("SELECT id FROM oneengine_permission_sets WHERE id=$1 AND company_id=$2 AND active=true", [req.params.permissionSetId, req.user.companyId]),
      db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=true", [req.body.userId, req.user.companyId]),
    ]);
    if (!set.rows.length || !user.rows.length) return res.status(404).json({ success: false, message: "Permission set or company user not found" });
    const result = await db(
      `INSERT INTO oneengine_permission_set_assignments
       (permission_set_id,user_id,company_id,effective_from,effective_until,active,assigned_by)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       ON CONFLICT (permission_set_id,user_id,company_id) DO UPDATE SET
       effective_from=EXCLUDED.effective_from,effective_until=EXCLUDED.effective_until,active=true,assigned_by=EXCLUDED.assigned_by
       RETURNING *`,
      [req.params.permissionSetId, req.body.userId, req.user.companyId, req.body.effectiveFrom || null, req.body.effectiveUntil || null, req.user.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/permission-sets/:permissionSetId/assignments/:userId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE oneengine_permission_set_assignments SET active=false WHERE permission_set_id=$1 AND user_id=$2 AND company_id=$3 RETURNING id",
      [req.params.permissionSetId, req.params.userId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set assignment not found" });
    res.json({ success: true });
  });

  router.get("/platform/permission-set-groups", ...manage, async (req, res) => {
    const result = await db(
      `SELECT g.*,COUNT(DISTINCT m.permission_set_id)::int AS permission_set_count,
              COUNT(DISTINCT a.user_id)::int AS assigned_user_count
         FROM oneengine_permission_set_groups g
         LEFT JOIN oneengine_permission_set_group_members m ON m.group_id=g.id AND m.company_id=g.company_id
         LEFT JOIN oneengine_permission_set_group_assignments a ON a.group_id=g.id AND a.company_id=g.company_id AND a.active=true
        WHERE g.company_id=$1 GROUP BY g.id ORDER BY g.name`,
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/permission-set-groups", ...manage, async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const apiKey = req.body?.apiKey || toSafeApiName(name, "permission_group");
    if (!name || !isSafeIdentifier(apiKey)) return res.status(400).json({ success: false, message: "Group name and valid API key are required" });
    try {
      const result = await db(
        "INSERT INTO oneengine_permission_set_groups (company_id,name,api_key,description,active) VALUES ($1,$2,$3,$4,true) RETURNING *",
        [req.user.companyId, name, apiKey, req.body.description || null]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A permission group with this API key already exists" });
      throw error;
    }
  });

  router.put("/platform/permission-set-groups/:groupId", ...manage, async (req, res) => {
    const result = await db(
      `UPDATE oneengine_permission_set_groups SET name=COALESCE($1,name),api_key=COALESCE($2,api_key),
         description=COALESCE($3,description),active=COALESCE($4,active),user_modified=true,updated_at=NOW()
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [req.body.name?.trim() || null, req.body.apiKey || null, req.body.description, req.body.active,
        req.params.groupId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set group not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/permission-set-groups/:groupId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE oneengine_permission_set_groups SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",
      [req.params.groupId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set group not found" });
    res.json({ success: true });
  });

  router.get("/platform/permission-set-groups/:groupId/members", ...manage, async (req, res) => {
    const result = await db(
      `SELECT m.id,m.permission_set_id,ps.name,ps.api_key,ps.active
         FROM oneengine_permission_set_group_members m
         JOIN oneengine_permission_sets ps ON ps.id=m.permission_set_id AND ps.company_id=m.company_id
        WHERE m.group_id=$1 AND m.company_id=$2 ORDER BY ps.name`,
      [req.params.groupId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/permission-set-groups/:groupId/members", ...manage, async (req, res) => {
    const [group, set] = await Promise.all([
      db("SELECT id FROM oneengine_permission_set_groups WHERE id=$1 AND company_id=$2 AND active=true", [req.params.groupId, req.user.companyId]),
      db("SELECT id FROM oneengine_permission_sets WHERE id=$1 AND company_id=$2 AND active=true", [req.body.permissionSetId, req.user.companyId]),
    ]);
    if (!group.rows.length || !set.rows.length) return res.status(404).json({ success: false, message: "Group or company permission set not found" });
    const result = await db(
      `INSERT INTO oneengine_permission_set_group_members (group_id,permission_set_id,company_id)
       VALUES ($1,$2,$3) ON CONFLICT (group_id,permission_set_id,company_id) DO NOTHING RETURNING *`,
      [req.params.groupId, req.body.permissionSetId, req.user.companyId]
    );
    res.status(201).json({ success: true, data: result.rows[0] || { group_id: req.params.groupId, permission_set_id: req.body.permissionSetId } });
  });

  router.delete("/platform/permission-set-groups/:groupId/members/:permissionSetId", ...manage, async (req, res) => {
    const result = await db(
      "DELETE FROM oneengine_permission_set_group_members WHERE group_id=$1 AND permission_set_id=$2 AND company_id=$3 RETURNING id",
      [req.params.groupId, req.params.permissionSetId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set group member not found" });
    res.json({ success: true });
  });

  router.get("/platform/permission-set-groups/:groupId/assignments", ...manage, async (req, res) => {
    const result = await db(
      `SELECT a.id,a.user_id,a.effective_from,a.effective_until,a.active,u.username
         FROM oneengine_permission_set_group_assignments a
         JOIN users u ON u.id=a.user_id AND u.company_id=a.company_id
        WHERE a.group_id=$1 AND a.company_id=$2 ORDER BY u.username`,
      [req.params.groupId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/permission-set-groups/:groupId/assignments", ...manage, async (req, res) => {
    if (!validAssignmentDates(req.body)) return res.status(400).json({ success: false, message: "Assignment dates are invalid" });
    const [group, user] = await Promise.all([
      db("SELECT id FROM oneengine_permission_set_groups WHERE id=$1 AND company_id=$2 AND active=true", [req.params.groupId, req.user.companyId]),
      db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=true", [req.body.userId, req.user.companyId]),
    ]);
    if (!group.rows.length || !user.rows.length) return res.status(404).json({ success: false, message: "Group or company user not found" });
    const result = await db(
      `INSERT INTO oneengine_permission_set_group_assignments
       (group_id,user_id,company_id,effective_from,effective_until,active,assigned_by)
       VALUES ($1,$2,$3,$4,$5,true,$6)
       ON CONFLICT (group_id,user_id,company_id) DO UPDATE SET
       effective_from=EXCLUDED.effective_from,effective_until=EXCLUDED.effective_until,active=true,assigned_by=EXCLUDED.assigned_by
       RETURNING *`,
      [req.params.groupId, req.body.userId, req.user.companyId, req.body.effectiveFrom || null, req.body.effectiveUntil || null, req.user.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/permission-set-groups/:groupId/assignments/:userId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE oneengine_permission_set_group_assignments SET active=false WHERE group_id=$1 AND user_id=$2 AND company_id=$3 RETURNING id",
      [req.params.groupId, req.params.userId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Permission set group assignment not found" });
    res.json({ success: true });
  });

  router.put("/platform/fields/:fieldId/security/:roleId", ...manage, async (req, res) => {
    if (typeof req.body?.readable !== "boolean" || typeof req.body?.writable !== "boolean") {
      return res.status(400).json({ success: false, message: "readable and writable must be boolean values" });
    }
    const field = await db(
      "SELECT f.id,o.company_id FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE f.id=$1 AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2)",
      [req.params.fieldId, req.user.companyId]
    );
    if (!field.rows.length) return res.status(404).json({ success: false, message: "Field not found" });
    // Field security is tenant-scoped access metadata. A tenant admin may
    // restrict a global/package field for one of their roles without mutating
    // the global field definition itself.
    const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
    if (!role.rows.length) return res.status(404).json({ success: false, message: "Role not found" });
    const result = await db(
      "INSERT INTO platform_field_security (field_id,role_id,company_id,readable,writable) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (field_id,role_id,company_id) DO UPDATE SET readable=EXCLUDED.readable,writable=EXCLUDED.writable RETURNING *",
      [req.params.fieldId, req.params.roleId, req.user.companyId, req.body.readable, req.body.writable]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/objects", ...manage, async (req, res) => {
    if (!validObjectInput(req.body)) return res.status(400).json({ success: false, message: "label and safe identifiers are required" });
    const { label, pluralLabel, sourceTable = null, moduleId = null } = req.body;
    const objectKey = req.body.objectKey || toSafeApiName(label, "object");
    const apiName = req.body.apiName || objectKey;
    try {
      if (moduleId) {
        const module = await db("SELECT id FROM platform_modules WHERE id=$1", [moduleId]);
        if (!module.rows.length) return res.status(400).json({ success: false, message: "Module not found" });
      }
      const storageTable = sourceTable || await ensureCustomObjectStorage(db, objectKey);
      const rawObjectConfig = req.body?.config && typeof req.body.config === "object" && !Array.isArray(req.body.config) ? req.body.config : {};
      const { historicalTrending: _tenantHistoricalTrending, ...baseObjectConfig } = rawObjectConfig;
      const objectConfig = {
        ...baseObjectConfig,
        allowReports: req.body?.allowReports !== false,
        allowSearch: req.body?.allowSearch !== false,
        trackHistory: req.body?.trackHistory !== false,
      };
      const result = await db("INSERT INTO platform_objects (object_key,api_name,label,plural_label,description,source_table,module_id,company_id,config) VALUES (COALESCE($1,$2 || '_' || substr(gen_random_uuid()::text,1,8)),$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *", [req.body.objectKey || null, apiName, label.trim(), pluralLabel || `${label.trim()}s`, req.body.description || null, storageTable, moduleId, req.user.companyId, JSON.stringify(objectConfig)]);
      await db(
        `INSERT INTO platform_object_permissions
           (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete,can_import,can_export)
         SELECT $1,r.id,$2,TRUE,TRUE,TRUE,TRUE,TRUE,TRUE
           FROM roles r
           JOIN role_permissions rp ON rp.role_id=r.id
           JOIN permissions p ON p.id=rp.permission_id
          WHERE r.company_id=$2 AND p.code='oneengine.manage'
         ON CONFLICT (object_id,role_id,company_id)
         DO UPDATE SET can_view=TRUE,can_create=TRUE,can_edit=TRUE,can_delete=TRUE,can_import=TRUE,can_export=TRUE`,
        [result.rows[0].id, req.user.companyId]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "An object with this key already exists" });
      console.error("Platform object create error:", error);
      res.status(500).json({ success: false, message: "Unable to create platform object" });
    }
  });

  router.put("/platform/objects/:objectId/settings", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    try {
      const historicalTrending = await normalizeHistoricalTrendingConfig(db, object.id, req.user.companyId, req.body?.historicalTrending);
      if (historicalTrending === undefined) return res.status(400).json({ success: false, message: "Historical Trending settings are required" });
      if (historicalTrending.enabled === true) historicalTrending.enabledAt = object?.config?.historicalTrending?.enabled === true && object.config.historicalTrending.enabledAt ? object.config.historicalTrending.enabledAt : new Date().toISOString();
      const result = await db(
        `INSERT INTO platform_object_settings(company_id,object_id,config,updated_at)
         VALUES($1,$2,$3::jsonb,NOW())
         ON CONFLICT(company_id,object_id)
         DO UPDATE SET config=COALESCE(platform_object_settings.config,'{}'::jsonb) || EXCLUDED.config,updated_at=NOW()
         RETURNING *`,
        [req.user.companyId, object.id, JSON.stringify({ historicalTrending })]
      );
      res.json({ success: true, data: { ...object, config: { ...(object.config || {}), historicalTrending }, settings: result.rows[0] } });
    } catch (error) {
      const status = Number(error?.status || 400);
      res.status(status).json({ success: false, message: error.message || "Unable to save object settings" });
    }
  });

  router.put("/platform/objects/:objectId", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { forMutation: true, includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found or not editable" });
    if (systemObject(object)) return res.status(409).json({ success: false, message: "System object identity and mapping are protected" });
    if (req.body.objectKey !== undefined && !isSafeIdentifier(req.body.objectKey)) return res.status(400).json({ success: false, message: "objectKey must be a safe identifier" });
    if (req.body.apiName !== undefined && !isSafeIdentifier(req.body.apiName)) return res.status(400).json({ success: false, message: "apiName must be a safe identifier" });
    if (req.body.sourceTable !== undefined && req.body.sourceTable !== null && !isSafeIdentifier(req.body.sourceTable)) return res.status(400).json({ success: false, message: "sourceTable must be a safe identifier" });
    try {
      if (object.active === true && req.body.active === false) {
        const blockers = await objectDeactivationBlockers(db, object, req.user.companyId);
        if (blockers.length) return res.status(409).json({ success: false, code: "OBJECT_IN_USE", message: `Object cannot be deactivated while active dependencies remain: ${blockers.join(", ")}` });
      }
      const mergedCurrentConfig = object.config && typeof object.config === "object" && !Array.isArray(object.config) ? object.config : {};
      const { historicalTrending: _tenantHistoricalTrending, ...currentConfig } = mergedCurrentConfig;
      const rawRequestConfig = req.body?.config && typeof req.body.config === "object" && !Array.isArray(req.body.config) ? req.body.config : {};
      const { historicalTrending: _ignoredHistoricalTrending, ...requestConfig } = rawRequestConfig;
      const nextConfig = {
        ...currentConfig,
        ...requestConfig,
        ...(req.body.allowReports === undefined ? {} : { allowReports: req.body.allowReports === true }),
        ...(req.body.allowSearch === undefined ? {} : { allowSearch: req.body.allowSearch === true }),
        ...(req.body.trackHistory === undefined ? {} : { trackHistory: req.body.trackHistory === true }),
      };
      const result = await db("UPDATE platform_objects SET object_key=COALESCE($1,object_key), api_name=COALESCE($2,api_name), label=COALESCE($3,label), plural_label=COALESCE($4,plural_label), description=COALESCE($5,description), source_table=$6, active=COALESCE($7,active), config=$8::jsonb, user_modified=true,updated_at=NOW() WHERE id=$9 AND (company_id=$10 OR (company_id IS NULL AND $11=true)) RETURNING *", [req.body.objectKey, req.body.apiName, req.body.label, req.body.pluralLabel, req.body.description, req.body.sourceTable === undefined ? object.source_table : req.body.sourceTable, req.body.active, JSON.stringify(nextConfig), object.id, req.user.companyId, await canManageGlobal(db, req)]);
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "An object with this key already exists" });
      console.error("Platform object update error:", error);
      res.status(500).json({ success: false, message: "Unable to update platform object" });
    }
  });

  router.get("/platform/objects/:objectId/record-paths", ...manage, async (req, res) => {
    const root = await getObject(req.params.objectId, req);
    if (!root) return res.status(404).json({ success: false, message: "Object not found" });
    const [objectsResult, fieldsResult, relationshipsResult] = await Promise.all([
      db("SELECT * FROM platform_objects WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
      db("SELECT * FROM platform_fields WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
      db(`SELECT r.*, p.object_key AS parent_object_key, c.object_key AS child_object_key
            FROM platform_relationships r
            JOIN platform_objects p ON p.id=r.parent_object_id
            JOIN platform_objects c ON c.id=r.child_object_id
           WHERE r.active=true AND (p.company_id IS NULL OR p.company_id=$1) AND (c.company_id IS NULL OR c.company_id=$1)`, [req.user.companyId]),
    ]);
    const securedFields = await applyFieldSecurity(db, fieldsResult.rows, req);
    const readableFields = securedFields.filter((field) => field.readable !== false);
    const maxDepth = Math.max(1, Math.min(6, Number(req.query.depth || 4)));
    const data = buildRecordPathCatalog({ objects: objectsResult.rows, fields: readableFields, relationships: relationshipsResult.rows }, root.object_key, maxDepth);
    res.json({ success: true, data, rootObjectKey: root.object_key });
  });

  router.get("/platform/fields/:fieldId/dependencies", ...manage, async (req, res) => {
    const result = await db("SELECT f.*, o.object_key, o.source_table FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE f.id=$1 AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2)", [req.params.fieldId, req.user.companyId]);
    const field = result.rows[0];
    if (!field) return res.status(404).json({ success: false, message: "Field not found" });
    const references = await activeFieldReferences(db, field, req.user.companyId);
    res.json({ success: true, data: { fieldId: field.id, objectKey: field.object_key, fieldKey: field.api_name, activeReferences: references, canDeactivate: references.length === 0 } });
  });

  router.get("/platform/objects/:objectId/dependencies", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const blockers = await objectDeactivationBlockers(db, object, req.user.companyId);
    res.json({ success: true, data: { objectId: object.id, objectKey: object.object_key, activeReferences: blockers, canDeactivate: blockers.length === 0 } });
  });

  router.get("/platform/objects/:objectId/fields", ...manage, async (req, res) => {
    if (!await getObject(req.params.objectId, req)) return res.status(404).json({ success: false, message: "Object not found" });
    const result = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY active DESC, display_order, label", [req.params.objectId, req.user.companyId]);
    const fields = await applyFieldSecurity(db, result.rows, req);
    res.json({ success: true, data: await enrichFields(db, fields, req) });
  });

  router.post("/platform/objects/:objectId/fields", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found or not editable" });
    if (!systemObject(object) && object.company_id === null && !await canManageGlobal(db, req)) return res.status(404).json({ success: false, message: "Object not found or not editable" });
    if (!validFieldInput(req.body)) return res.status(400).json({ success: false, message: "Valid label and supported fieldType are required" });
    const { label, fieldType, sourceColumn = null, required = false, writable = false, options = [], config = {}, displayOrder = 0 } = req.body;
    const apiName = req.body.apiName || toSafeApiName(label);
    if (systemObject(object) && sourceColumn) return res.status(400).json({ success: false, message: "Custom fields on system objects use extension storage, not business columns" });
    const generatedSourceColumn = !systemObject(object) && !["formula", "rollup"].includes(fieldType)
      ? (sourceColumn || apiName)
      : sourceColumn;
    const storedConfig = systemObject(object) && !isCalculatedField({ field_type: fieldType }) ? { ...config, storage: "extension" } : config;
    try {
      validateGeneralFieldConfig({ field_type: fieldType, config });
      await validatePicklistDefinition(db, { field_type: fieldType, options, config }, req);
    await validateDependentPicklistDefinition(db, object, { api_name: apiName, field_type: fieldType, options, config }, req);
      await validateLookupConfiguration(object.id, fieldType, config, req);
      await checkFormulaChange(object.id, { api_name: apiName, field_type: fieldType, source_column: generatedSourceColumn, required, writable, config: storedConfig, active: true, readable: true }, null, req);
      const names = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND (company_id IS NULL OR company_id=$3)", [object.id, apiName, req.user.companyId]);
      if (names.rows.some(field => field.api_name === apiName)) return res.status(409).json({ success: false, message: "A field with this API name already exists" });
      if (!systemObject(object) && generatedSourceColumn) await ensureCustomFieldStorage(db, object, generatedSourceColumn, fieldType);
      const result = await db("INSERT INTO platform_fields (object_id,api_name,label,field_type,source_column,required,writable,options,config,display_order,company_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) RETURNING *", [object.id, apiName, label.trim(), fieldType, generatedSourceColumn, required, writable, JSON.stringify(options), JSON.stringify(storedConfig), displayOrder, req.user.companyId]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error instanceof FormulaError || error instanceof ConditionError) return res.status(400).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A field with this API name already exists" });
      console.error("Platform field create error:", error);
      res.status(500).json({ success: false, message: "Unable to create platform field" });
    }
  });

  router.put("/platform/fields/:fieldId", ...manage, async (req, res) => {
    const result = await db("SELECT f.*, o.company_id AS object_company_id, o.company_scoped AS object_company_scoped, o.source_table, o.object_key FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE f.id=$1 AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2)", [req.params.fieldId, req.user.companyId]);
    const field = result.rows[0];
    if (!field || (field.company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Field not found or not editable" });
    const object = await getObject(field.object_id, req, { includeInactive: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    if (systemObject(field) && !field.company_id) return res.status(409).json({ success: false, message: "System field definitions are protected; use field security and layouts" });
    if (isExtensionField(field) && (req.body.sourceColumn || (req.body.apiName && req.body.apiName !== field.api_name) || (req.body.fieldType && req.body.fieldType !== field.field_type))) return res.status(400).json({ success: false, message: "Stored extension field identity, type and storage are protected" });
    if (field.source_column && field.field_type !== "formula" && field.field_type !== "rollup") {
      const nextApiName = req.body.apiName !== undefined ? req.body.apiName : field.api_name;
      const nextReadable = req.body.readable !== undefined ? req.body.readable : field.readable;
      const nextActive = req.body.active !== undefined ? req.body.active : field.active;
      if (nextApiName !== field.api_name || nextReadable !== field.readable || nextActive === false) {
        return res.status(400).json({ success: false, message: "Mapped field identity and access are protected" });
      }
    }
    if (isExtensionField(field) && req.body.config) req.body.config = { ...req.body.config, storage: "extension" };
    if (req.body.apiName !== undefined && !isSafeIdentifier(req.body.apiName)) return res.status(400).json({ success: false, message: "apiName must be a safe identifier" });
    if (req.body.fieldType !== undefined && !FIELD_TYPES.has(req.body.fieldType)) return res.status(400).json({ success: false, message: "Unsupported field type" });
    if (req.body.sourceColumn !== undefined && req.body.sourceColumn !== null && !isSafeIdentifier(req.body.sourceColumn)) return res.status(400).json({ success: false, message: "sourceColumn must be a safe identifier" });
    try {
      const candidate = { ...field };
      for (const [api, column] of Object.entries({ apiName: "api_name", fieldType: "field_type", sourceColumn: "source_column", required: "required", writable: "writable", readable: "readable", config: "config", active: "active" })) {
        if (req.body[api] !== undefined) candidate[column] = req.body[api];
      }
      if (req.body.options !== undefined) candidate.options = req.body.options;
      validateGeneralFieldConfig(candidate);
      await validatePicklistDefinition(db, candidate, req);
    await validateDependentPicklistDefinition(db, object, candidate, req);
      await validateLookupConfiguration(field.object_id, candidate.field_type, candidate.config, req);
      await checkFormulaChange(field.object_id, candidate, field.id, req);
      if (field.active === true && candidate.active === false) {
        if (await fieldStoredValueCount(db, field, req.user.companyId) > 0) {
          return res.status(409).json({ success: false, code: "FIELD_HAS_VALUES", message: "Field contains stored values and cannot be deactivated" });
        }
        const references = await activeFieldReferences(db, field, req.user.companyId);
        if (references.length) {
          return res.status(409).json({
            success: false,
            code: "FIELD_IN_USE",
            message: `Field is referenced by active metadata: ${references.join(", ")}`,
          });
        }
      }
      const updated = await db("UPDATE platform_fields SET api_name=COALESCE($1,api_name), label=COALESCE($2,label), field_type=COALESCE($3,field_type), source_column=$4, required=COALESCE($5,required), readable=COALESCE($6,readable), writable=COALESCE($7,writable), options=COALESCE($8::jsonb,options), config=COALESCE($9::jsonb,config), display_order=COALESCE($10,display_order), active=COALESCE($11,active),user_modified=true WHERE id=$12 RETURNING *", [req.body.apiName, req.body.label, req.body.fieldType, req.body.sourceColumn === undefined ? field.source_column : req.body.sourceColumn, req.body.required, req.body.readable, req.body.writable, req.body.options === undefined ? null : JSON.stringify(req.body.options), req.body.config === undefined ? null : JSON.stringify(req.body.config), req.body.displayOrder, req.body.active, field.id]);
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      if (error instanceof FormulaError || error instanceof ConditionError) return res.status(400).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A field with this API name already exists" });
      console.error("Platform field update error:", error);
      res.status(500).json({ success: false, message: "Unable to update platform field" });
    }
  });

  router.delete("/platform/fields/:fieldId", ...manage, async (req, res) => {
    try {
    const existing = await db("SELECT f.*, o.company_id AS object_company_id, o.company_scoped AS object_company_scoped, o.source_table, o.object_key FROM platform_fields f JOIN platform_objects o ON o.id=f.object_id WHERE f.id=$1 AND (f.company_id IS NULL OR f.company_id=$2) AND (o.company_id IS NULL OR o.company_id=$2)", [req.params.fieldId, req.user.companyId]);
    const field = existing.rows[0];
    if (!field || (field.company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Field not found or not editable" });
    if (systemObject(field) && !field.company_id) return res.status(409).json({ success: false, message: "System fields cannot be deleted" });
    if (field.source_column && field.field_type !== "formula" && field.field_type !== "rollup") {
      return res.status(400).json({ success: false, code: "FIELD_MAPPED", message: "Mapped database fields cannot be deactivated or deleted" });
    }
    if (await fieldStoredValueCount(db, field, req.user.companyId) > 0) {
      return res.status(409).json({ success: false, code: "FIELD_HAS_VALUES", message: "Field contains stored values and cannot be deactivated" });
    }
    const references = await activeFieldReferences(db, field, req.user.companyId);
    if (references.length) {
      return res.status(409).json({
        success: false,
        code: "FIELD_IN_USE",
        message: `Field is referenced by active metadata: ${references.join(", ")}`,
      });
    }
    await checkFormulaChange(field.object_id, { ...field, active: false }, field.id, req);
    const result = await db("UPDATE platform_fields f SET active=false WHERE f.id=$1 AND (f.company_id=$2 OR (f.company_id IS NULL AND $3=true)) RETURNING f.*", [req.params.fieldId, req.user.companyId, await canManageGlobal(db, req)]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Field not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error instanceof FormulaError) return res.status(400).json({ success: false, code: error.code, message: error.message });
      console.error("Platform field deactivate error:", error);
      res.status(500).json({ success: false, message: "Unable to deactivate field" });
    }
  });

  async function checkFormulaChange(objectId, candidate, replaceId, req) {
    for (const key of ["active", "readable", "writable", "required"]) {
      if (candidate[key] !== undefined && typeof candidate[key] !== "boolean") throw new FormulaError(`${key} must be a boolean`);
    }
    const existing = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [objectId, req.user.companyId]);
    const fields = [...existing.rows.filter(field => field.id !== replaceId), candidate];
    validateConditionConfig(candidate.config?.visibilityCondition, fields, "visibilityCondition");
    validateConditionConfig(candidate.config?.requiredCondition, fields, "requiredCondition");
    for (const key of ["visibilityCondition", "requiredCondition"]) {
      const conditions = candidate.config?.[key]?.conditions || [];
      if (conditions.some((condition) => condition.field === candidate.api_name)) {
        throw new ConditionError(`${key} cannot reference its own field`);
      }
    }
    if (candidate.field_type === "rollup") {
      const config = normalizeRollupConfig(candidate);
      if (!config || !config.relationshipKey) throw new FormulaError("Rollup fields require a relationshipKey in config");
      if (candidate.source_column !== undefined && candidate.source_column !== null) throw new FormulaError("Rollup fields are calculated values and cannot map to a source column");
      const rawOperation = candidate.config?.operation ?? candidate.config?.aggregate ?? candidate.config?.rollupOperation;
      if (rawOperation !== undefined && !ROLLUP_OPERATIONS.has(String(rawOperation).toUpperCase())) throw new FormulaError("Unsupported rollup operation");
      if (config.operation !== "COUNT" && !config.sourceField) throw new FormulaError(`${config.operation} rollups require a source field`);
      const relationship = await db("SELECT * FROM platform_relationships WHERE parent_object_id=$1 AND relationship_key=$2 AND active=true", [objectId, config.relationshipKey]);
      const relationshipRow = relationship.rows.find((row) => row.company_id === undefined || row.company_id === null || String(row.company_id) === String(req.user.companyId));
      if (!relationshipRow) throw new FormulaError(`Rollup relationship "${config.relationshipKey}" is not available on this object`);
      if (!relationshipRow.child_field_id) throw new FormulaError("Rollup relationship must define its child relationship field");
      const childFieldsResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true ORDER BY display_order", [relationshipRow.child_object_id]);
      const childFields = childFieldsResult.rows.filter((childField) => childField.company_id === undefined || childField.company_id === null || String(childField.company_id) === String(req.user.companyId));
      const relationshipField = childFields.find((childField) => childField.id === relationshipRow.child_field_id);
      if (!relationshipField || !relationshipField.source_column || !isSafeIdentifier(relationshipField.source_column)) throw new FormulaError("Rollup relationship field is unavailable or unmapped");
      const sourceFieldInfo = (config.sourceField && childFields.find((childField) => childField.api_name === config.sourceField || childField.source_column === config.sourceField)) || null;
      if (config.operation !== "COUNT" && (!sourceFieldInfo || !["number", "decimal", "currency"].includes(sourceFieldInfo.field_type) || !sourceFieldInfo.source_column || !isSafeIdentifier(sourceFieldInfo.source_column))) {
        throw new FormulaError(`${config.operation} rollups require a numeric child field`);
      }
      if (config.condition) {
        const childFieldList = childFields;
        const candidateConfig = config.condition && typeof config.condition === "object" && config.condition.conditions ? config.condition : { match: "all", conditions: Array.isArray(config.condition) ? config.condition : [config.condition] };
        validateConditionConfig(candidateConfig, childFieldList, "rollup.condition");
      }
      if (candidate.active !== false) {
        const storedType = config.resultType || "number";
        if (!["number", "decimal", "currency", "boolean", "text"].includes(storedType)) throw new FormulaError("Rollup result type is unsupported");
      }
    }
    if (candidate.field_type === "formula" && candidate.active !== false) {
      const expression = candidate.config?.expression;
      const references = formulaReferences(expression);
      const dotted = references.filter((reference) => reference.includes("."));
      if (dotted.length) {
        const [rootResult, objectsResult, allFieldsResult, relationshipsResult] = await Promise.all([
          db("SELECT * FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [objectId, req.user.companyId]),
          db("SELECT * FROM platform_objects WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
          db("SELECT * FROM platform_fields WHERE active=true AND (company_id IS NULL OR company_id=$1)", [req.user.companyId]),
          db(`SELECT r.*,p.object_key AS parent_object_key,c.object_key AS child_object_key
                FROM platform_relationships r
                JOIN platform_objects p ON p.id=r.parent_object_id
                JOIN platform_objects c ON c.id=r.child_object_id
               WHERE r.active=true
                 AND (p.company_id IS NULL OR p.company_id=$1)
                 AND (c.company_id IS NULL OR c.company_id=$1)`, [req.user.companyId]),
        ]);
        const root = rootResult.rows[0];
        if (!root) throw new FormulaError("Formula object is unavailable");
        const catalog = buildRecordPathCatalog(
          { objects: objectsResult.rows, fields: allFieldsResult.rows, relationships: relationshipsResult.rows },
          root.object_key,
          6
        );
        const fieldById = new Map(allFieldsResult.rows.map((field) => [String(field.id), field]));
        const pathTypes = {};
        for (const reference of dotted) {
          const canonical = reference.startsWith(`${root.object_key}.`) ? reference : `${root.object_key}.${reference}`;
          const fieldEntry = catalog.find((entry) => entry.kind === "field" && entry.path === canonical);
          if (!fieldEntry) throw new FormulaError(`Formula record path is unavailable: ${reference}`);
          const parts = canonical.split(".");
          for (let index = 2; index < parts.length; index += 1) {
            const prefix = parts.slice(0, index).join(".");
            const relationshipEntry = catalog.find((entry) => entry.kind === "relationship" && entry.path === prefix);
            if (!relationshipEntry || relationshipEntry.direction !== "inverse") {
              throw new FormulaError(`Formula path must use scalar lookup/parent relationships: ${reference}`);
            }
          }
          const targetField = fieldById.get(String(fieldEntry.fieldId));
          const targetType = targetField?.field_type === "formula" || targetField?.field_type === "rollup"
            ? targetField?.config?.resultType || targetField?.config?.result_type
            : targetField?.field_type;
          if (!targetType) throw new FormulaError(`Formula record path type is unavailable: ${reference}`);
          pathTypes[reference] = targetType;
        }
        if (!candidate.config || typeof candidate.config !== "object" || Array.isArray(candidate.config)) candidate.config = {};
        candidate.config.recordPathTypes = pathTypes;
        delete candidate.config.record_path_types;
      } else if (candidate.config?.recordPathTypes || candidate.config?.record_path_types) {
        delete candidate.config.recordPathTypes;
        delete candidate.config.record_path_types;
      }
      compileFormulas([{ ...candidate, active: true }, ...fields.filter(field => field !== candidate)]);
    }
    compileFormulas(fields);
  }

  function hasReferencedFieldInFormula(expression, field) {
    if (typeof expression !== "string" || !expression.trim()) return false;
    return expression.includes(field.api_name) || expression.includes(String(field.id));
  }

  function hasReferencedFieldInFormula(expression, field) {
    if (typeof expression !== "string" || !expression.trim()) return false;
    return expression.includes(field.api_name) || expression.includes(String(field.id));
  }

  async function relationshipDeactivationBlockers(relationship, req) {
    const key = String(relationship.relationship_key || "");
    const pattern = `%${key.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
    const [rollups, metadata] = await Promise.all([
      db(
        `SELECT label FROM platform_fields
          WHERE object_id=$1 AND active=true AND field_type='rollup'
            AND (company_id IS NULL OR company_id=$2)
            AND (config->>'relationshipKey'=$3 OR config->>'relationship_key'=$3)`,
        [relationship.parent_object_id, req.user.companyId, key]
      ),
      db(
        `SELECT kind,label FROM (
           SELECT 'layout' AS kind,name AS label,definition::text AS payload
             FROM platform_layouts WHERE object_id IN ($1,$2) AND active=true AND (company_id IS NULL OR company_id=$3)
           UNION ALL
           SELECT 'report',label,config::text
             FROM platform_reports WHERE object_id IN ($1,$2) AND active=true AND (company_id IS NULL OR company_id=$3)
           UNION ALL
           SELECT 'rule',name,(conditions::text || ' ' || action::text)
             FROM platform_rules WHERE object_id IN ($1,$2) AND active=true AND (company_id IS NULL OR company_id=$3)
         ) refs
         WHERE payload ILIKE $4 ESCAPE '\\'`,
        [relationship.parent_object_id, relationship.child_object_id, req.user.companyId, pattern]
      ),
    ]);
    return [
      ...rollups.rows.map((row) => `rollup: ${row.label}`),
      ...metadata.rows.map((row) => `${row.kind}: ${row.label}`),
    ].slice(0, 20);
  }

  router.get("/platform/relationships", ...manage, async (req, res) => {
    const includeInactive = ["1","true"].includes(String(req.query?.includeInactive || "").toLowerCase());
    const result = await db(
      `SELECT r.*, p.object_key AS parent_object_key, c.object_key AS child_object_key
         FROM platform_relationships r
         JOIN platform_objects p ON p.id=r.parent_object_id
         JOIN platform_objects c ON c.id=r.child_object_id
        WHERE (p.company_id IS NULL OR p.company_id=$1)
          ${includeInactive ? "" : "AND r.active=true"}
        ORDER BY r.active DESC,COALESCE(r.label,r.relationship_key),r.relationship_key`,
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/relationships", ...manage, async (req, res) => {
    const { parentObjectId, childObjectId, relationshipKey, label = null, description = null, relationshipType = "lookup", childFieldId = null, onDelete = "restrict", onUpdate = "restrict", active = true } = req.body || {};
    if (!relationshipKey || !RELATIONSHIP_TYPES.has(relationshipType) || !RELATIONSHIP_POLICIES.has(onDelete) || !RELATIONSHIP_POLICIES.has(onUpdate)) return res.status(400).json({ success: false, message: "Invalid relationship type or policy" });
    const referenceError = await validateReferences(req, parentObjectId, childObjectId, childFieldId);
    if (referenceError) return res.status(400).json({ success: false, message: referenceError });
    const parent = await getObject(parentObjectId, req);
    const child = await getObject(childObjectId, req);
    if (!await canManageGlobal(db, req) && (parent.company_id === null || child.company_id === null)) return res.status(403).json({ success: false, message: "oneengine.manage permission is required to change global relationships" });
    try {
      const result = await db("INSERT INTO platform_relationships (parent_object_id,child_object_id,relationship_key,label,description,relationship_type,child_field_id,on_delete,on_update,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [parentObjectId, childObjectId, relationshipKey, String(label || relationshipKey).trim(), description || null, relationshipType, childFieldId, onDelete, onUpdate, active !== false]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A relationship with this key already exists" });
      console.error("Platform relationship create error:", error);
      res.status(400).json({ success: false, message: "Unable to create relationship" });
    }
  });

  router.put("/platform/relationships/:relationshipId", ...manage, async (req, res) => {
    const current = await db("SELECT r.*, p.company_id FROM platform_relationships r JOIN platform_objects p ON p.id=r.parent_object_id WHERE r.id=$1 AND (p.company_id IS NULL OR p.company_id=$2)", [req.params.relationshipId, req.user.companyId]);
    const relationship = current.rows[0];
    if (!relationship || (relationship.company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Relationship not found or not editable" });
    const parentId = req.body.parentObjectId || relationship.parent_object_id;
    const childId = req.body.childObjectId || relationship.child_object_id;
    const childFieldId = req.body.childFieldId === undefined ? relationship.child_field_id : req.body.childFieldId;
    const referenceError = await validateReferences(req, parentId, childId, childFieldId);
    if (referenceError) return res.status(400).json({ success: false, message: referenceError });
    const parent = await getObject(parentId, req);
    const child = await getObject(childId, req);
    if (!await canManageGlobal(db, req) && (parent.company_id === null || child.company_id === null)) return res.status(403).json({ success: false, message: "oneengine.manage permission is required to change global relationships" });
    const relationshipType = req.body.relationshipType || relationship.relationship_type;
    const onDelete = req.body.onDelete || relationship.on_delete;
    const onUpdate = req.body.onUpdate || relationship.on_update;
    if (!RELATIONSHIP_TYPES.has(relationshipType) || !RELATIONSHIP_POLICIES.has(onDelete) || !RELATIONSHIP_POLICIES.has(onUpdate)) return res.status(400).json({ success: false, message: "Invalid relationship type or policy" });
    if (relationship.active !== false && req.body.active === false) {
      const blockers = await relationshipDeactivationBlockers(relationship, req);
      if (blockers.length) return res.status(409).json({
        success: false,
        code: "RELATIONSHIP_IN_USE",
        message: `Relationship cannot be deactivated while active metadata depends on it: ${blockers.join(", ")}`,
        blockers,
      });
    }
    const updated = await db("UPDATE platform_relationships SET parent_object_id=$1,child_object_id=$2,relationship_key=COALESCE($3,relationship_key),label=COALESCE($4,label),description=COALESCE($5,description),relationship_type=$6,child_field_id=$7,on_delete=$8,on_update=$9,active=COALESCE($10,active),user_modified=true WHERE id=$11 RETURNING *", [parentId, childId, req.body.relationshipKey, req.body.label, req.body.description, relationshipType, childFieldId, onDelete, onUpdate, req.body.active, relationship.id]);
    res.json({ success: true, data: updated.rows[0] });
  });

  router.get("/platform/relationships/:relationshipId/dependencies", ...manage, async (req, res) => {
    const result = await db(
      `SELECT r.* FROM platform_relationships r
        JOIN platform_objects o ON o.id=r.parent_object_id
       WHERE r.id=$1 AND (o.company_id IS NULL OR o.company_id=$2)`,
      [req.params.relationshipId, req.user.companyId]
    );
    const relationship = result.rows[0];
    if (!relationship) return res.status(404).json({ success: false, message: "Relationship not found" });
    const blockers = await relationshipDeactivationBlockers(relationship, req);
    res.json({ success: true, data: { relationshipId: relationship.id, relationshipKey: relationship.relationship_key, activeReferences: blockers, canDeactivate: blockers.length === 0 } });
  });

  router.delete("/platform/relationships/:relationshipId", ...manage, async (req, res) => {
    const existing = await db(
      `SELECT r.*,o.company_id FROM platform_relationships r
        JOIN platform_objects o ON o.id=r.parent_object_id
       WHERE r.id=$1 AND (o.company_id=$2 OR (o.company_id IS NULL AND $3=true))`,
      [req.params.relationshipId, req.user.companyId, await canManageGlobal(db, req)]
    );
    const relationship = existing.rows[0];
    if (!relationship) return res.status(404).json({ success: false, message: "Relationship not found or not editable" });
    const blockers = await relationshipDeactivationBlockers(relationship, req);
    if (blockers.length) return res.status(409).json({
      success: false,
      code: "RELATIONSHIP_IN_USE",
      message: `Relationship cannot be deactivated while active metadata depends on it: ${blockers.join(", ")}`,
      blockers,
    });
    const result = await db("UPDATE platform_relationships SET active=false,user_modified=true WHERE id=$1 RETURNING *", [relationship.id]);
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/objects/:objectId/list-views", authenticate, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) {
      return res.status(403).json({ success: false, message: "You do not have permission to view list views for this object" });
    }
    const roleId = req.user.roleId ? String(req.user.roleId) : "";
    const result = await db(
      `SELECT v.*,
              CASE WHEN pref.list_view_id=v.id THEN true ELSE false END AS is_pinned
         FROM platform_list_views v
         LEFT JOIN platform_list_view_preferences pref
           ON pref.company_id=$2 AND pref.user_id=$3 AND pref.object_id=v.object_id
        WHERE v.object_id=$1
          AND (v.company_id IS NULL OR v.company_id=$2)
          AND v.active=true
          AND (
            v.visibility_scope='company'
            OR v.owner_user_id=$3
            OR (v.visibility_scope='roles' AND v.shared_role_ids ? $4)
          )
        ORDER BY CASE WHEN pref.list_view_id=v.id THEN 0 ELSE 1 END,
                 CASE WHEN v.owner_user_id=$3 THEN 0 ELSE 1 END,
                 v.is_default DESC,v.label`,
      [object.id, req.user.companyId, req.user.id, roleId]
    );
    const canManage = await canManageGlobal(db, req);
    res.json({
      success: true,
      data: result.rows.map((view) => ({
        ...view,
        can_edit: String(view.owner_user_id || "") === String(req.user.id) || canManage,
        can_share: canManage,
      })),
    });
  });

  router.post("/platform/objects/:objectId/list-views", authenticate, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) {
      return res.status(403).json({ success: false, message: "You do not have permission to create a list view for this object" });
    }
    const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order", [object.id, req.user.companyId]);
    const validFields = new Set(fields.rows.map((field) => field.api_name));
    const columns = Array.isArray(req.body?.columns) ? req.body.columns.filter((column) => typeof column === "string" && validFields.has(column)) : [];
    if (!req.body || typeof req.body.label !== "string" || !req.body.label.trim() || !columns.length) {
      return res.status(400).json({ success: false, message: "A label and at least one valid column are required" });
    }
    const canManage = await canManageGlobal(db, req);
    const requestedScope = ["private","company","roles"].includes(req.body.visibilityScope) ? req.body.visibilityScope : "private";
    const visibilityScope = canManage ? requestedScope : "private";
    let sharedRoleIds = [];
    if (visibilityScope === "roles") {
      const requestedRoles = Array.isArray(req.body.sharedRoleIds) ? [...new Set(req.body.sharedRoleIds.map(String))].slice(0, 100) : [];
      if (!requestedRoles.length) return res.status(400).json({ success: false, message: "Select at least one role for a role-shared list view" });
      const validRoles = await db("SELECT id::text AS id FROM roles WHERE company_id=$1 AND id::text = ANY($2::text[])", [req.user.companyId, requestedRoles]);
      sharedRoleIds = validRoles.rows.map((row) => row.id);
      if (sharedRoleIds.length !== requestedRoles.length) return res.status(400).json({ success: false, message: "One or more shared roles are not available" });
    }
    const baseKey = req.body.viewKey || toSafeApiName(req.body.label, "list_view");
    const userSuffix = String(req.user.id || "").replace(/-/g, "").slice(0, 10);
    const viewKey = visibilityScope === "private" ? `${baseKey}_${userSuffix}` : baseKey;
    if (!isSafeIdentifier(viewKey)) return res.status(400).json({ success: false, message: "List view key is invalid" });
    try {
      const result = await db(
        `INSERT INTO platform_list_views
          (object_id,company_id,owner_user_id,visibility_scope,shared_role_ids,view_key,label,description,columns,filters,filter_model,sort,page_size,is_default)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)
         RETURNING *`,
        [object.id, req.user.companyId, req.user.id, visibilityScope, JSON.stringify(sharedRoleIds), viewKey, req.body.label.trim(), req.body.description || null, JSON.stringify(columns), JSON.stringify(req.body.filters || {}), JSON.stringify(req.body.filterModel || {}), JSON.stringify(normalizeListViewSort(req.body.sort)), Number(req.body.pageSize || 50), req.body.isDefault === true]
      );
      if (req.body.pin === true) {
        await db(
          `INSERT INTO platform_list_view_preferences (company_id,user_id,object_id,list_view_id,updated_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (company_id,user_id,object_id)
           DO UPDATE SET list_view_id=EXCLUDED.list_view_id,updated_at=NOW()`,
          [req.user.companyId, req.user.id, object.id, result.rows[0].id]
        );
      }
      res.status(201).json({ success: true, data: { ...result.rows[0], can_edit: true, can_share: canManage, is_pinned: req.body.pin === true } });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A list view with this name/key already exists" });
      console.error("Platform list view create error:", error);
      res.status(500).json({ success: false, message: "Unable to create list view" });
    }
  });

  router.put("/platform/list-views/:listViewId", authenticate, async (req, res) => {
    const existing = await db("SELECT * FROM platform_list_views WHERE id=$1 AND company_id=$2", [req.params.listViewId, req.user.companyId]);
    const view = existing.rows[0];
    if (!view) return res.status(404).json({ success: false, message: "List view not found" });
    const canManage = await canManageGlobal(db, req);
    const isOwner = String(view.owner_user_id || "") === String(req.user.id);
    if (!isOwner && !canManage) return res.status(403).json({ success: false, message: "You cannot edit this list view" });
    const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order", [view.object_id, req.user.companyId]);
    const validFields = new Set(fields.rows.map((field) => field.api_name));
    const columns = req.body.columns === undefined ? view.columns : (Array.isArray(req.body.columns) ? req.body.columns.filter((column) => typeof column === "string" && validFields.has(column)) : []);
    if (req.body.columns !== undefined && !columns.length) return res.status(400).json({ success: false, message: "List view columns must include at least one valid field" });
    const requestedScope = ["private","company","roles"].includes(req.body.visibilityScope) ? req.body.visibilityScope : view.visibility_scope;
    const visibilityScope = canManage ? requestedScope : "private";
    let sharedRoleIds = Array.isArray(view.shared_role_ids) ? view.shared_role_ids : [];
    if (visibilityScope === "roles" && req.body.sharedRoleIds !== undefined) {
      const requestedRoles = Array.isArray(req.body.sharedRoleIds) ? [...new Set(req.body.sharedRoleIds.map(String))].slice(0, 100) : [];
      const validRoles = requestedRoles.length
        ? await db("SELECT id::text AS id FROM roles WHERE company_id=$1 AND id::text = ANY($2::text[])", [req.user.companyId, requestedRoles])
        : { rows: [] };
      sharedRoleIds = validRoles.rows.map((row) => row.id);
      if (!sharedRoleIds.length) return res.status(400).json({ success: false, message: "Select at least one valid role" });
    }
    try {
      const result = await db(
        `UPDATE platform_list_views
            SET label=COALESCE($1,label),
                description=COALESCE($2,description),
                active=COALESCE($3,active),
                columns=COALESCE($4::jsonb,columns),
                filters=COALESCE($5::jsonb,filters),
                filter_model=COALESCE($6::jsonb,filter_model),
                sort=COALESCE($7::jsonb,sort),
                page_size=COALESCE($8,page_size),
                is_default=COALESCE($9,is_default),
                visibility_scope=$10,
                shared_role_ids=$11::jsonb,
                user_modified=true,updated_at=NOW()
          WHERE id=$12 RETURNING *`,
        [req.body.label, req.body.description, req.body.active, req.body.columns === undefined ? null : JSON.stringify(columns), req.body.filters === undefined ? null : JSON.stringify(req.body.filters || {}), req.body.filterModel === undefined ? null : JSON.stringify(req.body.filterModel || {}), req.body.sort === undefined ? null : JSON.stringify(normalizeListViewSort(req.body.sort)), req.body.pageSize === undefined ? null : Number(req.body.pageSize), req.body.isDefault, visibilityScope, JSON.stringify(visibilityScope === "roles" ? sharedRoleIds : []), view.id]
      );
      res.json({ success: true, data: { ...result.rows[0], can_edit: true, can_share: canManage } });
    } catch (error) {
      console.error("Platform list view update error:", error);
      res.status(500).json({ success: false, message: "Unable to update list view" });
    }
  });

  router.delete("/platform/list-views/:listViewId", authenticate, async (req, res) => {
    const existing = await db("SELECT * FROM platform_list_views WHERE id=$1 AND company_id=$2", [req.params.listViewId, req.user.companyId]);
    const view = existing.rows[0];
    if (!view) return res.status(404).json({ success: false, message: "List view not found" });
    const canManage = await canManageGlobal(db, req);
    const isOwner = String(view.owner_user_id || "") === String(req.user.id);
    if (!isOwner && !canManage) return res.status(403).json({ success: false, message: "You cannot delete this list view" });
    const result = await db("UPDATE platform_list_views SET active=false,user_modified=true WHERE id=$1 RETURNING *", [view.id]);
    await db("UPDATE platform_list_view_preferences SET list_view_id=NULL,updated_at=NOW() WHERE list_view_id=$1", [view.id]);
    res.json({ success: true, data: result.rows[0] });
  });

  router.put("/platform/objects/:objectId/list-view-preference", authenticate, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) {
      return res.status(403).json({ success: false, message: "You do not have permission to view records for this object" });
    }
    const listViewId = req.body?.listViewId || null;
    if (listViewId) {
      const roleId = req.user.roleId ? String(req.user.roleId) : "";
      const visible = await db(
        `SELECT id FROM platform_list_views
          WHERE id=$1 AND object_id=$2 AND active=true
            AND (company_id IS NULL OR company_id=$3)
            AND (visibility_scope='company' OR owner_user_id=$4 OR (visibility_scope='roles' AND shared_role_ids ? $5))`,
        [listViewId, object.id, req.user.companyId, req.user.id, roleId]
      );
      if (!visible.rows.length) return res.status(404).json({ success: false, message: "List view is not available" });
    }
    await db(
      `INSERT INTO platform_list_view_preferences (company_id,user_id,object_id,list_view_id,updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (company_id,user_id,object_id)
       DO UPDATE SET list_view_id=EXCLUDED.list_view_id,updated_at=NOW()`,
      [req.user.companyId, req.user.id, object.id, listViewId]
    );
    res.json({ success: true, data: { objectId: object.id, listViewId } });
  });

  router.get("/platform/objects/:objectKey/reports", authenticate, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      const result = await db(`SELECT * FROM platform_reports WHERE object_id=$1 AND company_id=$2${req.query.includeInactive === "true" ? "" : " AND active=true"} ORDER BY label`, [object.id, req.user.companyId]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Platform report list error:", error);
      res.status(500).json({ success: false, message: "Unable to load object reports" });
    }
  });

  router.post("/platform/objects/:objectKey/reports", ...manage, async (req, res) => {
    try {
      const { object } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
      if (!label) return res.status(400).json({ success: false, message: "A report label is required" });
      const reportKey = typeof req.body?.reportKey === "string" ? req.body.reportKey : toSafeApiName(label, "report");
      if (!isSafeIdentifier(reportKey)) return res.status(400).json({ success: false, message: "reportKey must be a safe identifier" });
      const config = normalizeReportConfig(req.body?.config || {});
      const result = await db(
        "INSERT INTO platform_reports (object_id,company_id,report_key,label,description,config) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *",
        [object.id, req.user.companyId, reportKey, label, req.body?.description || null, JSON.stringify(config)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A report with this key already exists" });
      console.error("Platform report create error:", error);
      res.status(500).json({ success: false, message: "Unable to create report" });
    }
  });

  router.put("/platform/reports/:reportId", ...manage, async (req, res) => {
    try {
      const existing = await db(
        "SELECT r.*,o.object_key FROM platform_reports r JOIN platform_objects o ON o.id=r.object_id WHERE r.id=$1 AND r.company_id=$2",
        [req.params.reportId, req.user.companyId]
      );
      if (!existing.rows.length) return res.status(404).json({ success: false, message: "Report not found" });
      const row = existing.rows[0];
      const label = req.body?.label === undefined ? row.label : String(req.body.label || "").trim();
      if (!label) return res.status(400).json({ success: false, message: "A report label is required" });
      const reportKey = req.body?.reportKey === undefined ? row.report_key : String(req.body.reportKey || "").trim();
      if (!isSafeIdentifier(reportKey)) return res.status(400).json({ success: false, message: "reportKey must be a safe identifier" });
      const config = req.body?.config === undefined ? row.config : normalizeReportConfig(req.body.config || {});
      const active = req.body?.active === undefined ? row.active : req.body.active === true;
      const result = await db(
        "UPDATE platform_reports SET report_key=$1,label=$2,description=$3,config=$4::jsonb,active=$5,user_modified=true,updated_at=NOW() WHERE id=$6 AND company_id=$7 RETURNING *",
        [reportKey, label, req.body?.description === undefined ? row.description : req.body.description || null, JSON.stringify(config), active, req.params.reportId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A report with this key already exists" });
      console.error("Platform report update error:", error);
      res.status(500).json({ success: false, message: "Unable to update report" });
    }
  });

  router.get("/platform/objects/:objectKey/reports/:reportKey", authenticate, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      const result = await db("SELECT * FROM platform_reports WHERE object_id=$1 AND company_id=$2 AND report_key=$3 AND active=true", [object.id, req.user.companyId, req.params.reportKey]);
      const report = result.rows[0];
      if (!report) return res.status(404).json({ success: false, message: "Report not found" });
      const fields = await applyFieldSecurity(db, metadataFields, req);
      const fieldByApiName = new Map(fields.filter((field) => field.active !== false && field.readable !== false).map((field) => [field.api_name, field]));
      const config = normalizeReportConfig(report.config);
      const whereClauses = [];
      const params = [];
      if (object.company_scoped) {
        params.push(req.user.companyId);
        whereClauses.push(`company_id=$${params.length}`);
      }
      if (object.store_scoped) {
        if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
        params.push(req.user.storeId);
        whereClauses.push(`store_id=$${params.length}`);
      }
      for (const filter of config.filters) {
        const field = fieldByApiName.get(filter.field);
        if (!platformFieldSql(field, object) || field.readable === false) continue;
        const column = `${platformFieldSql(field, object)}`;
        if (filter.operator === "is_null") {
          whereClauses.push(`${column} IS ${filter.value === false ? "NOT " : ""}NULL`);
        } else if (filter.operator === "in" && Array.isArray(filter.value) && filter.value.length) {
          params.push(filter.value.slice(0, 100));
          whereClauses.push(`${column} = ANY($${params.length})`);
        } else if (["eq", "neq", "gt", "gte", "lt", "lte"].includes(filter.operator)) {
          params.push(filter.value);
          whereClauses.push(`${column} ${({ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" })[filter.operator]} $${params.length}`);
        } else if (filter.operator === "contains") {
          params.push(`%${String(filter.value ?? "").slice(0, 200)}%`);
          whereClauses.push(`${column} ILIKE $${params.length}`);
        }
      }
      appendSystemReadScope(object, req, whereClauses, params);
      const where = whereClauses.length ? ` WHERE ${whereClauses.join(" AND ")}` : "";
      const selectedFields = (config.fields.length ? config.fields : fields.filter((field) => field.readable !== false).map((field) => field.api_name))
        .map((name) => fieldByApiName.get(name))
        .filter((field) => platformFieldSql(field, object) && field.readable !== false);
      const selectList = selectedFields.length
        ? selectedFields.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`).join(", ")
        : "id";
      const orderBy = config.sort.map((item) => {
        const field = fieldByApiName.get(item.field);
        return platformFieldSql(field, object) && field.readable !== false
          ? `${platformFieldSql(field, object)} ${item.direction === "desc" ? "DESC" : "ASC"}` : null;
      }).filter(Boolean).join(", ");
      if (!config.groupBy) {
        const rows = await db(`SELECT ${selectList} FROM "${object.source_table}"${where}${orderBy ? ` ORDER BY ${orderBy}` : ""} LIMIT 500`, params);
        return res.json({ success: true, data: { report, rows: rows.rows, summary: { total: rows.rows.length } } });
      }
      const groupField = fieldByApiName.get(config.groupBy);
      if (!platformFieldSql(groupField, object)) {
        return res.status(400).json({ success: false, message: `Report grouping field "${config.groupBy}" is unavailable` });
      }
      const metricSql = config.metrics.map((metric) => {
        const metricType = metric.type || "count";
        if (metricType === "count") return "COUNT(*)::int AS \"count\"";
        const targetField = metric.field ? fieldByApiName.get(metric.field) : groupField;
        if (!platformFieldSql(targetField, object)) return "COUNT(*)::int AS \"count\"";
        if (metricType === "sum") return `COALESCE(SUM(${platformFieldSql(targetField, object)})::numeric, 0) AS "sum"`;
        if (metricType === "avg") return `COALESCE(AVG(${platformFieldSql(targetField, object)})::numeric, 0) AS "avg"`;
        if (metricType === "min") return `COALESCE(MIN(${platformFieldSql(targetField, object)})::numeric, 0) AS "min"`;
        if (metricType === "max") return `COALESCE(MAX(${platformFieldSql(targetField, object)})::numeric, 0) AS "max"`;
        return "COUNT(*)::int AS \"count\"";
      }).join(", ");
      const groupSort = config.sort.find((item) => item.field === config.groupBy);
      const rows = await db(`SELECT ${platformFieldSql(groupField, object)} AS "group_value", ${metricSql} FROM "${object.source_table}"${where} GROUP BY ${platformFieldSql(groupField, object)} ORDER BY ${platformFieldSql(groupField, object)} ${groupSort?.direction === "desc" ? "DESC" : "ASC"}`, params);
      res.json({ success: true, data: { report, rows: rows.rows, summary: rows.rows } });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Platform report execution error:", error);
      res.status(500).json({ success: false, message: "Unable to execute report" });
    }
  });

  router.delete("/platform/reports/:reportId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_reports SET active=false,user_modified=true WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.reportId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Report not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/apps", ...manage, async (req, res) => {
    const result = await db(
      "SELECT * FROM platform_apps WHERE active=true AND (company_id IS NULL OR company_id=$1) ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END,label",
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

router.get("/platform/runtime/apps", authenticate, async (req, res) => {
  const apps = await db(
    "SELECT * FROM platform_apps WHERE company_id=$1 AND active=true ORDER BY label",
    [req.user.companyId]
  );

  const pages = await db(
    `SELECT *
     FROM platform_pages
     WHERE company_id=$1
       AND active=true
     ORDER BY label`,
    [req.user.companyId]
  );

  const pagesByApp = new Map();

  for (const page of pages.rows) {
    const key = String(page.app_id);

    if (!pagesByApp.has(key)) {
      pagesByApp.set(key, []);
    }

    pagesByApp.get(key).push(page);
  }

  const data = apps.rows.map((app) => ({
    ...app,
    pages: pagesByApp.get(String(app.id)) || [],
  }));

  res.json({
    success: true,
    data,
  });
});

  router.get("/platform/runtime/pages/:pageKey", authenticate, async (req, res) => {
    const key = String(req.params.pageKey || "").trim();
    if (!isSafeIdentifier(key)) return res.status(400).json({ success: false, message: "Invalid page key" });
    const result = await db(
      `SELECT p.*, a.app_key, a.label AS app_label
       FROM platform_pages p
       JOIN platform_apps a ON a.id=p.app_id AND a.company_id=p.company_id AND a.active=true
       WHERE p.page_key=$1 AND p.company_id=$2 AND p.active=true
       LIMIT 1`,
      [key, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Page not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  /*
   * RECORD COLLECTION RUNTIME — the ONE generic record feed for record-bound
   * Custom Page components (MultiContainer today; future Table/List/Cards/
   * Kanban components reuse it unchanged).
   *
   *   Platform Object → Record Collection (this endpoint) → Visual Component
   *
   * It deliberately wraps the EXISTING generic record reader rather than adding
   * a second query path: same platform_objects/platform_fields metadata, same
   * field-security, same company/store scoping, same appendSystemReadScope
   * read rules and the SAME platform_object_permissions gate — a Record
   * Collection can never expose records the caller could not read through the
   * object runtime. Conditions are validated with the CANONICAL condition
   * engine (services/platformConditions.js — the same validateConditionConfig
   * used by workflows and validation rules), then translated to parameterised
   * SQL through object field metadata. No page-specific vocabulary, no
   * embedded SQL in components, no second engine.
   */
  router.post("/platform/runtime/record-collection", authenticate, async (req, res) => {
    try {
      const collection = req.body || {};
      const objectKey = typeof collection.objectKey === "string" ? collection.objectKey : null;
      if (!objectKey || !isSafeIdentifier(objectKey)) return res.status(400).json({ success: false, message: "A valid Record Collection objectKey is required" });
      const metadata = await db(
        "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [objectKey, req.user.companyId]
      );
      const object = metadata.rows[0];
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) return res.status(404).json({ success: false, message: "Object records are not available" });
      /* Runtime permission enforcement — component visibility is never a substitute. */
      if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) return res.status(403).json({ success: false, message: "You do not have permission to view records for this object" });
      if (object.store_scoped && !req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });

      const fieldsResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [object.id, req.user.companyId]
      );
      const fields = await applyFieldSecurity(db, fieldsResult.rows, req);
      const readable = fields.filter((field) => field.readable !== false && field.field_type !== "formula" && field.field_type !== "rollup" && isSafeIdentifier(field.api_name) && Boolean(platformFieldSql(field, object)));
      const fieldByApiName = new Map(readable.map((field) => [field.api_name, field]));

      const clauses = [];
      const params = [];
      if (object.company_scoped) { params.push(req.user.companyId); clauses.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); clauses.push(`store_id=$${params.length}`); }

      /*
       * Collection conditions — canonical condition engine.
       *
       * validateConditionConfig (the SAME function workflows and validation
       * rules pass through) validates every entry against this object's field
       * metadata: operators, numeric/boolean coercion, readability. Evaluation
       * is the engine's row-level evaluateCondition() semantics translated to
       * parameterised SQL through platformFieldSql(); "changed*" operators are
       * record-transition operators and are rejected here as meaningless for a
       * standing filter.
       */
      const conditions = Array.isArray(collection.conditions) ? collection.conditions.slice(0, 20) : [];
      const conditionMatch = collection.conditionMatch === "any" ? "any" : "all";
      try {
        if (conditions.length) validateConditionConfig({ match: conditionMatch, conditions }, fields, "Record Collection conditions");
      } catch (error) {
        if (error instanceof ConditionError) return res.status(400).json({ success: false, code: error.code, message: error.message });
        throw error;
      }
      const transitionOperators = new Set(["changed", "changed_from", "changed_to", "changed_from_to"]);
      const collectionConditions = conditions.filter((condition) => !transitionOperators.has(condition.operator));
      if (collectionConditions.length !== conditions.length) return res.status(400).json({ success: false, message: "Record Collection conditions use record-transition operators, which do not apply to a standing filter" });
      for (const condition of collectionConditions) {
        const field = fieldByApiName.get(String(condition?.field || ""));
        if (!field) return res.status(400).json({ success: false, message: `Collection conditions reference unavailable field "${condition?.field || "?"}"` });
        const column = platformFieldSql(field, object);
        if (condition.operator === "is_empty") {
          clauses.push(field.source_column
            ? `(${column} IS NULL OR CAST(${column} AS TEXT) = '')`
            : `(${column} IS NULL)`);
          continue;
        }
        if (condition.operator === "is_not_empty") {
          clauses.push(field.source_column
            ? `(${column} IS NOT NULL AND CAST(${column} AS TEXT) <> '')`
            : `(${column} IS NOT NULL)`);
          continue;
        }
        const value = condition.value;
        if (value === null || value === undefined || typeof value === "object") { params.push(null); }
        else params.push(value);
        const placeholder = `$${params.length}`;
        const comparable = `NULLIF(CAST(${column} AS TEXT), '')`;
        if (condition.operator === "not_equals") clauses.push(`(${column} IS DISTINCT FROM ${placeholder})`);
        else if (condition.operator === "greater_than") clauses.push(`${column} > ${placeholder}`);
        else if (condition.operator === "greater_than_or_equal") clauses.push(`${column} >= ${placeholder}`);
        else if (condition.operator === "less_than") clauses.push(`${column} < ${placeholder}`);
        else if (condition.operator === "less_than_or_equal") clauses.push(`${column} <= ${placeholder}`);
        else if (condition.operator === "is_empty") clauses.push(`(${comparable} IS NULL)`);
        else if (condition.operator === "is_not_empty") clauses.push(`(${comparable} IS NOT NULL)`);
        else clauses.push(`${column} = ${placeholder}`);
      }
      /* "any" wraps ONLY the condition clauses (already appended); scope
         clauses appended after this point stay AND-ed as mandatory. */
      const scopeClauseCount = (object.company_scoped ? 1 : 0) + (object.store_scoped ? 1 : 0);
      const conditionClauseCount = clauses.length - scopeClauseCount;
      let conditionClauses = conditionClauseCount > 0 ? clauses.splice(scopeClauseCount, conditionClauseCount) : [];
      if (conditionClauses.length && conditionMatch === "any") conditionClauses = [`(${conditionClauses.join(" OR ")})`];
      clauses.push(...conditionClauses);
      if (["customers"].includes(object.source_table) && !req.platformCompanyCustomers) {
        /* Mirror the appendSystemReadScope customer-store rule for record feeds. */
        if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
        params.push(req.user.storeId, req.user.companyId);
        clauses.push(`EXISTS (SELECT 1 FROM customer_stores cs WHERE cs.customer_id="customers".id AND cs.store_id=$${params.length - 1} AND cs.company_id=$${params.length} AND cs.active=true)`);
      }
      appendSystemReadScope(object, req, clauses, params);

      /* Sort entries must name readable fields. */
      const sortEntries = Array.isArray(collection.sort) ? collection.sort.slice(0, 3) : [];
      const orderParts = [];
      for (const entry of sortEntries) {
        const field = fieldByApiName.get(String(entry?.field || ""));
        if (!field) return res.status(400).json({ success: false, message: `Collection sort references unavailable field "${entry?.field || "?"}"` });
        orderParts.push(`${platformFieldSql(field, object)} ${entry.direction === "asc" ? "ASC" : "DESC"}`);
      }
      if (!orderParts.length) orderParts.push("id ASC");

      const limit = boundedInteger(collection.maxRecords ?? collection.maxRecords ?? 10, 10, 50);
      const requestedFields = Array.isArray(collection.fields) ? collection.fields.map(String).filter((name) => fieldByApiName.has(name)) : [];
      const selectFields = requestedFields.length ? requestedFields : readable.slice(0, 12).map((field) => field.api_name);
      const selectList = ["id", ...selectFields.map((name) => `${platformFieldSql(fieldByApiName.get(name), object)} AS "${name}"`)];
      const offset = Math.max(0, Number.parseInt(collection.offset, 10) || 0);
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const result = await db(
        `SELECT ${selectList.join(", ")} FROM "${object.source_table}"${where} ORDER BY ${orderParts.join(", ")} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      const count = await db(`SELECT COUNT(*)::int AS total FROM "${object.source_table}"${where}`, params);
      const records = await populateRollups(db, object, fields, result.rows, req);
      res.json({ success: true, data: records, records, objectKey: object.object_key, limit, offset, total: count.rows[0]?.total || 0 });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Record collection runtime error:", error);
      res.status(500).json({ success: false, message: "Unable to load record collection" });
    }
  });

  /*
   * PAGE INTERACTION RUNTIME — the ONE executor for Custom Page On Click
   * bindings (MultiContainer/Table record clicks AND Button clicks).
   *
   * It reuses the existing execution machinery only:
   *   - workflowUuid  → platform_rules workflow, executed via the existing
   *     executeWorkflowActions pipeline (run + step records, permissions,
   *     registry validation) — the canonical UI invocation path
   *   - actionKey     → registered Action Registry handler, with its declared
   *     requiredPermissions enforced here before execution
   *
   * The workflow's Current Record is the clicked record when the interaction
   * comes from a record-bound component; for unbound Buttons the record is
   * OPTIONAL — the workflow runs with page context (user/company/store) only.
   * There is no second workflow engine and no second action engine here.
   */
  router.post("/platform/runtime/page-interactions/execute", authenticate, async (req, res, next) => {
    try {
      const interaction = req.body || {};
      const type = String(interaction.type || "");
      const recordId = interaction.recordId ? String(interaction.recordId) : null;
      const objectKey = typeof interaction.objectKey === "string" && isSafeIdentifier(interaction.objectKey) ? interaction.objectKey : null;
      if (recordId && !recordIdIsValid(recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });

      /* Resolve the bound object (required for actions, optional for
         record-less workflows) and the Current Record when supplied. */
      let object = null;
      let record = null;
      if (objectKey) {
        const objectResult = await db(
          "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
          [objectKey, req.user.companyId]
        );
        object = objectResult.rows[0] || null;
        if (!object) return res.status(404).json({ success: false, message: "Object not found" });
        if (recordId) {
          const recordClauses = ["id=$1"];
          const recordParams = [recordId];
          if (object.company_scoped) { recordParams.push(req.user.companyId); recordClauses.push(`company_id=$${recordParams.length}`); }
          if (object.store_scoped) {
            if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
            recordParams.push(req.user.storeId); recordClauses.push(`store_id=$${recordParams.length}`);
          }
          appendSystemReadScope(object, req, recordClauses, recordParams);
          const recordResult = await db(`SELECT * FROM "${object.source_table}" WHERE ${recordClauses.join(" AND ")}`, recordParams);
          if (!recordResult.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
          record = recordResult.rows[0];
        }
      }

      if (type === "workflow") {
        const workflowUuid = String(interaction.workflowUuid || "");
        if (!recordIdIsValid(workflowUuid)) return res.status(400).json({ success: false, message: "A valid workflow reference is required" });
        const workflowResult = await db(
          "SELECT * FROM platform_rules WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1",
          [workflowUuid, req.user.companyId]
        );
        const workflow = workflowResult.rows[0];
        if (!workflow) return res.status(404).json({ success: false, message: "Configured workflow not found" });
        if (workflow.object_id && object && String(workflow.object_id) !== String(object.id)) {
          return res.status(400).json({ success: false, message: "The configured workflow belongs to a different object" });
        }
        const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
        if (!actions.length) return res.status(422).json({ success: false, message: "Configured workflow contains no executable actions" });
        for (const workflowAction of actions) {
          validateWorkflowAction(workflowAction);
          const definition = getWorkflowActionDefinition(workflowAction.type || workflowAction.key);
          for (const requiredPermission of definition?.requiredPermissions || []) {
            if (!(await hasExecutionPermission(req, requiredPermission))) {
              return res.status(403).json({ success: false, message: `You do not have permission to execute ${workflowAction.type || workflowAction.key}` });
            }
          }
        }
        const run = await createWorkflowRun({
          db,
          companyId: req.user.companyId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          objectId: object?.id || null,
          recordId: recordIsPersisted ? (record?.id || null) : null,
          triggerKey: "page_interaction",
          status: "RUNNING",
          metadata: { actorUserId: req.user.id || null, pageInteraction: true },
        });
        try {
          const results = await executeWorkflowActions({
            actions,
            db,
            pool,
            req,
            object,
            record,
            recordId: record?.id || null,
            companyId: req.user.companyId,
            runId: run?.id || null,
            workflowVersion: Number(workflow.active_version || workflow.version || 1),
            trigger: "page_interaction",
          });
          const waiting = workflowResultsContainStatus(results, "waiting");
          if (run?.id) {
            await db(
              `UPDATE platform_workflow_runs
                  SET status=$1,
                      completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                      updated_at=NOW()
                WHERE id=$2 AND company_id=$3`,
              [waiting ? "WAITING" : "COMPLETED", run.id, req.user.companyId]
            );
          }
          return res.json({ success: true, data: { runId: run?.id || null, status: waiting ? "WAITING" : "COMPLETED", results } });
        } catch (error) {
          if (run?.id) {
            await db(
              "UPDATE platform_workflow_runs SET status=$1, completed_at=NOW(), updated_at=NOW(), metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$3 AND company_id=$4",
              ["FAILED", JSON.stringify({ error: error.message || "Workflow execution failed" }), run.id, req.user.companyId]
            );
          }
          throw error;
        }
      }

      if (type === "action") {
        const actionKey = String(interaction.actionKey || "").trim();
        if (!actionKey) return res.status(400).json({ success: false, message: "A registered action key is required" });
        const core = listRegisteredPlatformActions().find((item) => item.key === actionKey);
        if (!core) return res.status(404).json({ success: false, message: "Registered action not found" });
        if (["RECORD_SAVE", "RECORD_DELETE"].includes(core.key)) {
          return res.status(409).json({ success: false, message: "RECORD_SAVE and RECORD_DELETE belong to the canonical record page lifecycle" });
        }
        if (core.key === "WORKFLOW") return res.status(422).json({ success: false, message: "Use the Workflow interaction type to run workflows" });
        for (const requiredPermission of core.requiredPermissions || []) {
          if (!(await hasExecutionPermission(req, requiredPermission))) {
            return res.status(403).json({ success: false, message: `You do not have permission to execute ${core.displayName || core.key}` });
          }
        }
        const definition = getWorkflowActionDefinition(core.key);
        if (!definition) return res.status(422).json({ success: false, message: "Registered action handler is unavailable" });
        try {
          definition.validation?.({ type: core.key });
        } catch { /* argument-shape validation happens inside the executor. */ }
        const execution = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: `action:${core.key}`,
          req,
          input: { ...(interaction.config || {}) },
          object,
          record,
          recordId: record?.id || null,
          storeId: req.user.storeId || null,
          connectorDrivers: req.app?.locals?.connectorDrivers || null,
          writeAudit: req.app?.locals?.writeAudit || null,
          source: { type: "page_interaction", method: req.method, path: req.originalUrl || req.path, capability: core.key },
          extraContext: { pool },
        });
        return res.json({ success: true, data: execution.result, workflowRunId: execution.runId, correlationId: execution.correlationId });
      }

      return res.status(400).json({ success: false, message: "Unsupported page interaction type" });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      next(error);
    }
  });

  /*
   * MY PROFILE RECORD — the ONE canonical record-page feed for the signed-in
   * user's own account. It resolves the users-backed Platform Object (the
   * canonical "employee" object by default, or the objectKey the shell is
   * already looking at) and returns that record with the SAME metadata-driven
   * fields the generic object runtime renders, so the shell can open the
   * profile through the ONE /app/objects/<key> record route — the SAME record
   * page architecture every other Object uses. No ad hoc profile surface, no
   * second record-view system, no SQL in components.
   *
   * Self access is deliberately READ-ONLY and limited to the caller's own row:
   * viewing your own account record must not require the object's can_view
   * grant (which would otherwise expose the whole directory). Every write path
   * stays behind the existing manage/permission gates untouched.
   */
  /*
   * RECORD PAGE FEED — the ONE canonical resolver for a record deep link
   * (/app/objects/<key>/records/<recordId>): the navigation-target resolver
   * and the shell both point Object Record navigation here, and the record
   * page renders it through the SAME generic object runtime.
   *
   * The user's OWN record keeps its dedicated feed (GET /runtime/my-record)
   * — self access deliberately bypasses the object grant. Every OTHER record
   * resolves through THIS feed, which enforces the platform's normal
   * visibility exactly like the records list:
   *
   *   active object of this company (or a system object)
   *     → the caller's platform_object_permissions can_view grant
   *       (superadmin excepted, matching loadObjectNavigation)
   *   → object company/store scoping + appendSystemReadScope
   *     → readable fields through field security
   *
   * A forged or cross-company record id therefore 403/404s here and the
   * navigation layer never exposes data the object runtime would refuse.
   */
  router.get("/platform/runtime/record-page", authenticate, async (req, res) => {
    try {
      const objectKey = typeof req.query.objectKey === "string" && isSafeIdentifier(req.query.objectKey) ? req.query.objectKey : null;
      const recordId = typeof req.query.recordId === "string" ? req.query.recordId : "";
      if (!objectKey || !recordIdIsValid(recordId)) return res.status(400).json({ success: false, message: "A valid object key and record identifier are required" });
      const metadata = await db(
        "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [objectKey, req.user.companyId]
      );
      const object = metadata.rows[0];
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
        return res.status(404).json({ success: false, message: "Object is not available" });
      }
      if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) {
        return res.status(403).json({ success: false, message: "You do not have permission to view records for this object" });
      }
      if (object.store_scoped && !req.user.storeId) {
        return res.status(403).json({ success: false, message: "A store session is required" });
      }
      const fieldsResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [object.id, req.user.companyId]
      );
      const fields = await applyFieldSecurity(db, safeSystemFields(object, fieldsResult.rows), req);
      const readable = fields.filter((field) => field.readable !== false && field.field_type !== "formula" && field.field_type !== "rollup" && isSafeIdentifier(field.api_name) && Boolean(platformFieldSql(field, object)));
      const columns = readable.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`);
      if (!columns.length) return res.status(404).json({ success: false, message: "Record is not available" });

      /* Scope is the requested row plus the object's normal company/store
         visibility — never a wider read. */
      const clauses = ["id=$1"];
      const params = [recordId];
      if (object.company_scoped) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (object.store_scoped) {
        params.push(req.user.storeId);
        clauses.push(`store_id=$${params.length}`);
      }
      appendSystemReadScope(object, req, clauses, params);
      const result = await db(`SELECT ${columns.join(", ")}, "${object.source_table}".id AS "id" FROM "${object.source_table}" WHERE ${clauses.join(" AND ")}`, params);
      const record = result.rows[0] || null;
      if (!record) return res.status(404).json({ success: false, message: "Record not found" });

      const association = await db(
        "SELECT record_type_id FROM platform_record_associations WHERE object_id=$1 AND record_id=$2 AND company_id=$3 LIMIT 1",
        [object.id, recordId, req.user.companyId]
      );
      const recordTypeId = association.rows[0]?.record_type_id || null;
      const layout = await resolveEffectiveLayoutForRequest({
        objectId: object.id,
        pageType: "detail",
        recordTypeId,
        req,
      });
      const runtimeRecord = { ...record, recordTypeId };

      return res.json({
        success: true,
        data: {
          object,
          record: runtimeRecord,
          fields: readable,
          layout,
          objectKey: object.object_key,
          recordPath: `${OBJECT_RUNTIME_ROUTE_PREFIX}${encodeURIComponent(object.object_key)}/records/${encodeURIComponent(record.id)}`,
        },
      });
    } catch (error) {
      console.error("Record page feed error:", error);
      res.status(500).json({ success: false, message: "Unable to load the record" });
    }
  });

  router.get("/platform/runtime/my-record", authenticate, async (req, res) => {
    try {
      const objectKey = typeof req.query.objectKey === "string" && isSafeIdentifier(req.query.objectKey) ? req.query.objectKey : "employee";
      /* A recordId is accepted for deep links (browser refresh of the profile
         route) but is validated to be the caller's OWN record — self access
         never widens to another user's row. */
      const requestedRecordId = typeof req.query.recordId === "string" ? req.query.recordId : "";
      if (requestedRecordId) {
        if (!recordIdIsValid(requestedRecordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
        if (requestedRecordId !== req.user.id) return res.status(403).json({ success: false, message: "You can only open your own record through the profile route" });
      }
      const metadata = await db(
        "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [objectKey, req.user.companyId]
      );
      const object = metadata.rows[0];
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
        return res.status(404).json({ success: false, message: "User record object is not available" });
      }
      /* Only the users-backed object family qualifies — a tenant must not be
         able to repoint the profile at an arbitrary object. */
      const system = systemObject(object);
      if (!system || system.table !== "users") {
        return res.status(400).json({ success: false, message: "The configured object does not represent user accounts" });
      }
      if (object.store_scoped && !req.user.storeId) {
        return res.status(403).json({ success: false, message: "A store session is required" });
      }

      const fieldsResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [object.id, req.user.companyId]
      );
      const fields = await applyFieldSecurity(db, safeSystemFields(object, fieldsResult.rows), req);
      const readable = fields.filter((field) => field.readable !== false && field.field_type !== "formula" && field.field_type !== "rollup" && isSafeIdentifier(field.api_name) && Boolean(platformFieldSql(field, object)));
      const columns = readable.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`);
      if (!columns.length) return res.status(404).json({ success: false, message: "User record is not available" });

      /* Scope is the caller's OWN row (id=$1) plus the object's normal
         company/store visibility — never a wider read. */
      const clauses = ["id=$1"];
      const params = [req.user.id];
      if (object.company_scoped) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (object.store_scoped) {
        params.push(req.user.storeId);
        clauses.push(`store_id=$${params.length}`);
      }
      appendSystemReadScope(object, req, clauses, params);
      const result = await db(`SELECT ${columns.join(", ")}, "${object.source_table}".id AS "id" FROM "${object.source_table}" WHERE ${clauses.join(" AND ")}`, params);
      const record = result.rows[0] || null;
      if (!record) return res.status(404).json({ success: false, message: "Your user record could not be found" });

      return res.json({
        success: true,
        data: {
          object,
          record,
          fields: readable,
          objectKey: object.object_key,
          recordPath: `${OBJECT_RUNTIME_ROUTE_PREFIX}${encodeURIComponent(object.object_key)}/records/${encodeURIComponent(record.id)}`,
        },
      });
    } catch (error) {
      console.error("My record error:", error);
      res.status(500).json({ success: false, message: "Unable to load your record" });
    }
  });

  /*
   * NAVIGATION TARGET REGISTRY — the server-side discovery feed for Builder
   * components (Custom Button On Click → Navigate and every future
   * navigation-capable component).
   *
   * Destinations are discovered from the SAME authoritative sources the
   * shells already use — never a second route list:
   *
   *   customPages → the company-scoped active platform_pages rows (key +
   *                 label only; the Builder stores the KEY, not the label)
   *   objectPages → the SAME loadObjectNavigation() payload the app-catalog
   *                 returns: object visibility, module licence/enablement,
   *                 device profile and the caller's object permissions are
   *                 all filtered server-side, so a destination a caller
   *                 cannot reach never becomes configurable in the first
   *                 place.
   *
   * System pages are not duplicated here: the client derives them from the
   * ONE navCatalogue with the caller's permission state (already shipped by
   * /api/auth/me/permissions), and the runtime resolver re-checks them at
   * click time. Navigation remains discoverability only — every destination
   * endpoint keeps enforcing its own authorization.
   */
  router.get("/platform/runtime/navigation-targets", authenticate, async (req, res) => {
    try {
      const [permissionResult, permissionSets, entitlementResult] = await Promise.all([
        db(
          `SELECT p.code
           FROM role_permissions rp
           JOIN permissions p ON p.id=rp.permission_id
           WHERE rp.role_id=$1`,
          [req.user.roleId]
        ),
        loadEffectivePermissionSets(db, req.user, req),
        getCompanyEntitlements(db, req.user.companyId),
      ]);
      const permissions = [...new Set([
        ...permissionResult.rows.map((row) => row.code),
        ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
      ])];
      const navigation = await loadObjectNavigation(req, { permissions, entitlements: entitlementResult });
      const pagesResult = await db(
        "SELECT page_key, label FROM platform_pages WHERE company_id=$1 AND active=true ORDER BY label",
        [req.user.companyId]
      );
      res.json({
        success: true,
        data: {
          customPages: pagesResult.rows
            .filter((page) => isSafeIdentifier(page.page_key))
            .map((page) => ({ key: page.page_key, label: page.label || page.page_key })),
          objectPages: navigation.entries,
        },
      });
    } catch (error) {
      console.error("Navigation targets error:", error);
      res.status(500).json({ success: false, message: "Unable to load navigation targets" });
    }
  });

  router.get("/platform/runtime/apps/:appId", authenticate, async (req, res) => {
    const result = await db("SELECT * FROM platform_apps WHERE id=$1 AND company_id=$2 AND active=true", [req.params.appId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "App not found" });
    const pages = await db("SELECT * FROM platform_pages WHERE app_id=$1 AND company_id=$2 AND active=true ORDER BY label", [req.params.appId, req.user.companyId]);
    res.json({ success: true, data: { ...result.rows[0], pages: pages.rows } });
  });

  router.get("/platform/apps/:appId", ...manage, async (req, res) => {
    const result = await db("SELECT * FROM platform_apps WHERE id=$1 AND company_id=$2 AND active=true", [req.params.appId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "App not found" });
    const pages = await db("SELECT * FROM platform_pages WHERE app_id=$1 AND company_id=$2 AND active=true ORDER BY label", [result.rows[0].id, req.user.companyId]);
    res.json({ success: true, data: { ...result.rows[0], pages: pages.rows } });
  });

  router.post("/platform/apps", ...manage, async (req, res) => {
    if (!req.body || typeof req.body.label !== "string" || !req.body.label.trim()) {
      return res.status(400).json({ success: false, message: "A valid app label is required" });
    }
    const appKey = typeof req.body.appKey === "string" ? req.body.appKey : toSafeApiName(req.body.label, "app");
    if (!isSafeIdentifier(appKey)) return res.status(400).json({ success: false, message: "appKey must be a safe identifier" });
    const config = normalizeAppConfig(req.body.config);
    try {
      const result = await db(
        "INSERT INTO platform_apps (company_id,app_key,label,description,config) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *",
        [req.user.companyId, appKey, req.body.label.trim(), req.body.description || null, JSON.stringify(config)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "An app with this key already exists" });
      console.error("Platform app create error:", error);
      res.status(500).json({ success: false, message: "Unable to create app" });
    }
  });

  router.put("/platform/apps/:appId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_apps WHERE id=$1 AND company_id=$2", [req.params.appId, req.user.companyId]);
    const app = existing.rows[0];
    if (!app) return res.status(404).json({ success: false, message: "App not found or not editable" });
    const nextConfig = req.body?.config === undefined ? app.config : normalizeAppConfig(req.body.config);
    const result = await db(
      "UPDATE platform_apps SET app_key=COALESCE($1,app_key), label=COALESCE($2,label), description=COALESCE($3,description), active=COALESCE($4,active), config=COALESCE($5::jsonb,config), updated_at=NOW() WHERE id=$6 RETURNING *",
      [req.body?.appKey, req.body?.label, req.body?.description, req.body?.active, JSON.stringify(nextConfig), app.id]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/apps/:appId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_apps SET active=false WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.appId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "App not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/apps/:appId/pages", ...manage, async (req, res) => {
    const app = await db("SELECT * FROM platform_apps WHERE id=$1 AND company_id=$2 AND active=true", [req.params.appId, req.user.companyId]);
    if (!app.rows.length) return res.status(404).json({ success: false, message: "App not found" });
    const result = await db("SELECT * FROM platform_pages WHERE app_id=$1 AND company_id=$2 ORDER BY active DESC,label", [app.rows[0].id, req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/apps/:appId/pages", ...manage, async (req, res) => {
    const app = await db("SELECT * FROM platform_apps WHERE id=$1 AND company_id=$2 AND active=true", [req.params.appId, req.user.companyId]);
    if (!app.rows.length) return res.status(404).json({ success: false, message: "App not found" });
    if (!req.body || typeof req.body.label !== "string" || !req.body.label.trim()) {
      return res.status(400).json({ success: false, message: "A valid page label is required" });
    }
    const pageKey = typeof req.body.pageKey === "string" ? req.body.pageKey : toSafeApiName(req.body.label, "page");
    if (!isSafeIdentifier(pageKey)) return res.status(400).json({ success: false, message: "pageKey must be a safe identifier" });
    const pageType = ["object", "list_view", "report"].includes(req.body.pageType) ? req.body.pageType : "object";
    const definition = normalizePageDefinition(req.body.definition);
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `INSERT INTO platform_pages
            (app_id,company_id,page_key,label,route_path,page_type,definition,draft_definition,active,lifecycle_status,version,draft_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$7::jsonb,false,'DRAFT',1,1)
           RETURNING *`,
          [app.rows[0].id, req.user.companyId, pageKey, req.body.label.trim(), req.body.routePath || "/", pageType, JSON.stringify(definition)]
        );
        await client.query(
          `INSERT INTO platform_page_versions
            (page_id,company_id,version,definition,lifecycle_status,created_by)
           VALUES ($1,$2,1,$3::jsonb,'DRAFT',$4)`,
          [result.rows[0].id, req.user.companyId, JSON.stringify(definition), req.user.id || null]
        );
        await client.query("COMMIT");
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A page with this key already exists" });
      console.error("Platform page create error:", error);
      res.status(500).json({ success: false, message: "Unable to create page" });
    }
  });

  router.put("/platform/pages/:pageId", ...manage, async (req, res) => {
    const pageResult = await db("SELECT * FROM platform_pages WHERE id=$1 AND company_id=$2", [req.params.pageId, req.user.companyId]);
    if (!pageResult.rows.length) return res.status(404).json({ success: false, message: "Page not found or not editable" });
    const page = pageResult.rows[0];
    const result = await db(
      `UPDATE platform_pages
          SET page_key=COALESCE($1,page_key),
              label=COALESCE($2,label),
              route_path=COALESCE($3,route_path),
              page_type=COALESCE($4,page_type),
              updated_at=NOW(),
              user_modified=true
        WHERE id=$5 RETURNING *`,
      [req.body?.pageKey, req.body?.label, req.body?.routePath, req.body?.pageType, page.id]
    );
    if (req.body?.definition !== undefined) {
      const definition = normalizePageDefinition(req.body.definition);
      const maxResult = await db(
        "SELECT COALESCE(MAX(version),0)::int AS version FROM platform_page_versions WHERE page_id=$1 AND company_id=$2",
        [page.id, req.user.companyId]
      );
      const nextVersion = Number(maxResult.rows[0]?.version || 0) + 1;
      await db(
        `UPDATE platform_pages
            SET draft_definition=$1::jsonb,draft_version=$2,version=GREATEST(version,$2),
                lifecycle_status=CASE WHEN active=true THEN lifecycle_status ELSE 'DRAFT' END,
                updated_at=NOW(),user_modified=true
          WHERE id=$3`,
        [JSON.stringify(definition), nextVersion, page.id]
      );
      await db(
        `INSERT INTO platform_page_versions
          (page_id,company_id,version,definition,lifecycle_status,created_by)
         VALUES ($1,$2,$3,$4::jsonb,'DRAFT',$5)`,
        [page.id, req.user.companyId, nextVersion, JSON.stringify(definition), req.user.id || null]
      );
    }
    const refreshed = await db("SELECT * FROM platform_pages WHERE id=$1", [page.id]);
    res.json({ success: true, data: refreshed.rows[0] || result.rows[0] });
  });

  router.get("/platform/pages/:pageId/versions", ...manage, async (req, res) => {
    const page = await db("SELECT id FROM platform_pages WHERE id=$1 AND company_id=$2", [req.params.pageId, req.user.companyId]);
    if (!page.rows.length) return res.status(404).json({ success: false, message: "Page not found" });
    const versions = await db(
      `SELECT id,page_id,version,lifecycle_status,created_by,created_at
         FROM platform_page_versions
        WHERE page_id=$1 AND company_id=$2
        ORDER BY version DESC`,
      [req.params.pageId, req.user.companyId]
    );
    res.json({ success: true, data: versions.rows });
  });

  router.get("/platform/pages/:pageId/versions/:version", ...manage, async (req, res) => {
    const result = await db(
      `SELECT * FROM platform_page_versions
        WHERE page_id=$1 AND company_id=$2 AND version=$3`,
      [req.params.pageId, req.user.companyId, Number(req.params.version)]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Page version not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/pages/:pageId/activate", ...manage, async (req, res) => {
    const pageResult = await db("SELECT * FROM platform_pages WHERE id=$1 AND company_id=$2", [req.params.pageId, req.user.companyId]);
    const page = pageResult.rows[0];
    if (!page) return res.status(404).json({ success: false, message: "Page not found" });
    const version = Number(page.draft_version || page.active_version || page.version || 1);
    const definition = page.draft_definition || page.definition;
    if (!definition) return res.status(409).json({ success: false, message: "Page has no draft to activate" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE platform_page_versions SET lifecycle_status='INACTIVE' WHERE page_id=$1 AND company_id=$2 AND lifecycle_status='ACTIVE'",
        [page.id, req.user.companyId]
      );
      const existingVersion = await client.query(
        "SELECT id FROM platform_page_versions WHERE page_id=$1 AND company_id=$2 AND version=$3",
        [page.id, req.user.companyId, version]
      );
      if (existingVersion.rows.length) {
        await client.query(
          "UPDATE platform_page_versions SET lifecycle_status='ACTIVE' WHERE id=$1",
          [existingVersion.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO platform_page_versions
            (page_id,company_id,version,definition,lifecycle_status,created_by)
           VALUES ($1,$2,$3,$4::jsonb,'ACTIVE',$5)`,
          [page.id, req.user.companyId, version, JSON.stringify(definition), req.user.id || null]
        );
      }
      const updated = await client.query(
        `UPDATE platform_pages
            SET definition=$1::jsonb,active=true,lifecycle_status='ACTIVE',
                active_version=$2,version=GREATEST(version,$2),
                draft_definition=NULL,draft_version=NULL,updated_at=NOW(),user_modified=true
          WHERE id=$3 RETURNING *`,
        [JSON.stringify(definition), version, page.id]
      );
      await client.query("COMMIT");
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.post("/platform/pages/:pageId/deactivate", ...manage, async (req, res) => {
    const result = await db(
      `UPDATE platform_pages
          SET active=false,lifecycle_status='INACTIVE',updated_at=NOW(),user_modified=true
        WHERE id=$1 AND company_id=$2 RETURNING *`,
      [req.params.pageId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Page not found" });
    await db(
      "UPDATE platform_page_versions SET lifecycle_status='INACTIVE' WHERE page_id=$1 AND company_id=$2 AND lifecycle_status='ACTIVE'",
      [req.params.pageId, req.user.companyId]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/pages/:pageId/versions/:version/restore", ...manage, async (req, res) => {
    const [pageResult, versionResult] = await Promise.all([
      db("SELECT * FROM platform_pages WHERE id=$1 AND company_id=$2", [req.params.pageId, req.user.companyId]),
      db(
        "SELECT * FROM platform_page_versions WHERE page_id=$1 AND company_id=$2 AND version=$3",
        [req.params.pageId, req.user.companyId, Number(req.params.version)]
      ),
    ]);
    const page = pageResult.rows[0];
    const source = versionResult.rows[0];
    if (!page || !source) return res.status(404).json({ success: false, message: "Page or version not found" });
    const maxResult = await db(
      "SELECT COALESCE(MAX(version),0)::int AS version FROM platform_page_versions WHERE page_id=$1 AND company_id=$2",
      [page.id, req.user.companyId]
    );
    const nextVersion = Number(maxResult.rows[0]?.version || 0) + 1;
    await db(
      `INSERT INTO platform_page_versions
        (page_id,company_id,version,definition,lifecycle_status,created_by)
       VALUES ($1,$2,$3,$4::jsonb,'DRAFT',$5)`,
      [page.id, req.user.companyId, nextVersion, JSON.stringify(source.definition), req.user.id || null]
    );
    const updated = await db(
      `UPDATE platform_pages
          SET draft_definition=$1::jsonb,draft_version=$2,version=GREATEST(version,$2),
              lifecycle_status=CASE WHEN active=true THEN lifecycle_status ELSE 'DRAFT' END,
              updated_at=NOW(),user_modified=true
        WHERE id=$3 RETURNING *`,
      [JSON.stringify(source.definition), nextVersion, page.id]
    );
    res.json({ success: true, data: updated.rows[0] });
  });

  router.delete("/platform/pages/:pageId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_pages SET active=false WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.pageId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Page not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/layouts", ...manage, async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const result = await db(`SELECT * FROM platform_layouts
      WHERE (company_id IS NULL OR company_id=$1) ${includeInactive ? "" : "AND active=true"} ORDER BY name`, [req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/runtime/layouts/:layoutId", authenticate, async (req, res) => {
    try {
      const layoutResult = await db(
        `SELECT l.*,o.object_key,o.label AS object_label,o.source_table,o.company_scoped,o.store_scoped
           FROM platform_layouts l
           JOIN platform_objects o ON o.id=l.object_id
          WHERE l.id=$1 AND l.active=true AND o.active=true
            AND (l.company_id IS NULL OR l.company_id=$2)
            AND (o.company_id IS NULL OR o.company_id=$2)
          LIMIT 1`,
        [req.params.layoutId, req.user.companyId]
      );
      const layout = layoutResult.rows[0];
      if (!layout) return res.status(404).json({ success:false, message:"Form layout not found" });
      const action = ["create","quick_create"].includes(String(layout.page_type)) ? "create" : String(layout.page_type) === "edit" ? "edit" : "view";
      if (!(await hasPlatformObjectPermission(db, req, layout.object_id, action))) return res.status(403).json({ success:false, message:"You do not have permission to use this form layout" });
      const fieldResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label", [layout.object_id, req.user.companyId]);
      const object = { id:layout.object_id, object_key:layout.object_key, source_table:layout.source_table, company_scoped:layout.company_scoped, store_scoped:layout.store_scoped };
      const baseFields = safeSystemFields(object, tenantFields(fieldResult.rows, req.user.companyId));
      const enriched = await enrichFields(db, baseFields, req);
      const fields = await applyFieldSecurity(db, enriched, req);
      res.json({ success:true, data:{ layout, object:{ id:layout.object_id, objectKey:layout.object_key, label:layout.object_label }, fields } });
    } catch (error) {
      console.error("Runtime form layout error:", error);
      res.status(error?.status || error?.statusCode || 500).json({ success:false, message:error?.message || "Unable to load form layout" });
    }
  });
  router.get("/platform/layouts/effective", authenticate, async (req, res) => {
    const object = await getObject(req.query.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const pageType = req.query.pageType || req.query.page_type || "detail";
    if (!PAGE_TYPES.has(pageType)) return res.status(400).json({ success: false, message: "Invalid page type" });
    const requestedRecordTypeId = typeof req.query.recordTypeId === "string" ? req.query.recordTypeId : null;
    const recordType = requestedRecordTypeId ? await resolveRecordType(object, requestedRecordTypeId, req) : null;
    if (requestedRecordTypeId && !recordType) {
      return res.status(400).json({ success: false, message: "Record type is not available for this object" });
    }
    const layout = await resolveEffectiveLayoutForRequest({
      objectId: object.id,
      pageType,
      recordTypeId: recordType?.id || null,
      req,
    });
    res.json({ success: true, data: layout });
  });

  router.post("/platform/layouts/resolve-preview", ...manage, async (req, res) => {
    const object = await getObject(req.body?.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const pageType = req.body?.pageType || "detail";
    if (!PAGE_TYPES.has(pageType)) return res.status(400).json({ success: false, message: "Invalid page type" });

    const appId = req.body?.appId || null;
    const recordTypeId = req.body?.recordTypeId || null;
    const roleId = req.body?.roleId || null;
    const deviceProfile = String(req.body?.deviceProfile || "desktop").toLowerCase();
    const permissionKeys = Array.isArray(req.body?.permissionKeys)
      ? [...new Set(req.body.permissionKeys.map((value) => String(value).trim()).filter(Boolean))]
      : [];

    if (!["desktop","tablet","mobile"].includes(deviceProfile)) {
      return res.status(400).json({ success: false, message: "Preview device must be Desktop, Tablet or Mobile" });
    }
    if (appId) {
      const app = await db("SELECT id FROM platform_apps WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [appId, req.user.companyId]);
      if (!app.rows.length) return res.status(400).json({ success: false, message: "Preview app is not available" });
    }
    if (recordTypeId) {
      const recordType = await db("SELECT id FROM platform_record_types WHERE id=$1 AND object_id=$2 AND active=true AND (company_id IS NULL OR company_id=$3)", [recordTypeId, object.id, req.user.companyId]);
      if (!recordType.rows.length) return res.status(400).json({ success: false, message: "Preview record type is not available" });
    }
    if (roleId) {
      const role = await db("SELECT id FROM roles WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [roleId, req.user.companyId]);
      if (!role.rows.length) return res.status(400).json({ success: false, message: "Preview role is not available" });
    }

    const layoutResult = await db(
      `SELECT * FROM platform_layouts
        WHERE object_id=$1 AND page_type=$2 AND active=true
          AND (company_id IS NULL OR company_id=$3)
        ORDER BY is_default DESC,updated_at DESC,id`,
      [object.id, pageType, req.user.companyId]
    );
    const layoutIds = layoutResult.rows.map((layout) => layout.id);
    const assignmentResult = layoutIds.length
      ? await db(
          `SELECT * FROM platform_layout_assignments
            WHERE layout_id=ANY($1::uuid[]) AND active=true
              AND (company_id IS NULL OR company_id=$2)`,
          [layoutIds, req.user.companyId]
        )
      : { rows: [] };

    let previewAssignments = assignmentResult.rows || [];
    const candidateLayoutId = req.body?.candidateLayoutId || null;
    const candidateAssignment = req.body?.candidateAssignment;
    if (candidateLayoutId && candidateAssignment && typeof candidateAssignment === "object" && !Array.isArray(candidateAssignment)) {
      const candidateLayout = layoutResult.rows.find((layout) => String(layout.id) === String(candidateLayoutId));
      if (!candidateLayout) return res.status(400).json({ success: false, message: "Preview layout is not available for this object and page type" });
      const candidateDevice = String(candidateAssignment.deviceProfile || candidateAssignment.device_profile || "any").toLowerCase();
      if (!["any","desktop","tablet","mobile"].includes(candidateDevice)) {
        return res.status(400).json({ success: false, message: "Candidate assignment device is invalid" });
      }
      previewAssignments = previewAssignments.filter((assignment) => String(assignment.layout_id) !== String(candidateLayoutId));
      previewAssignments.push({
        layout_id: candidateLayoutId,
        company_id: req.user.companyId,
        app_id: candidateAssignment.appId || candidateAssignment.app_id || null,
        record_type_id: candidateAssignment.recordTypeId || candidateAssignment.record_type_id || null,
        role_id: candidateAssignment.roleId || candidateAssignment.role_id || null,
        device_profile: candidateDevice,
        required_permissions: Array.isArray(candidateAssignment.requiredPermissions || candidateAssignment.required_permissions)
          ? (candidateAssignment.requiredPermissions || candidateAssignment.required_permissions).map(String)
          : [],
        priority: Number(candidateAssignment.priority || 0),
        active: true,
      });
    }

    const permissionSet = new Set(permissionKeys);
    const allowedAssignments = previewAssignments.filter((assignment) => {
      const required = Array.isArray(assignment.required_permissions) ? assignment.required_permissions : [];
      return required.every((permission) => permissionSet.has(String(permission)));
    });

    const winner = resolveAssignedPageLayout(layoutResult.rows, allowedAssignments, {
      companyId: req.user.companyId,
      roleId,
      recordTypeId,
      appId,
      deviceProfile,
    });

    res.json({
      success: true,
      data: {
        layout: winner || null,
        matched: Boolean(winner),
        context: { appId, recordTypeId, roleId, deviceProfile, permissionKeys },
      },
    });
  });

  router.get("/platform/layouts/:layoutId/assignments", ...manage, async (req, res) => {
    const layoutResult = await db(
      "SELECT * FROM platform_layouts WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
      [req.params.layoutId, req.user.companyId]
    );
    const layout = layoutResult.rows[0];
    if (!layout) return res.status(404).json({ success: false, message: "Layout not found" });
    const result = await db(
      `SELECT a.*, app.app_key, app.label AS app_label, rt.record_type_key, rt.label AS record_type_label,
              r.name AS role_name
         FROM platform_layout_assignments a
         LEFT JOIN platform_apps app ON app.id=a.app_id
         LEFT JOIN platform_record_types rt ON rt.id=a.record_type_id
         LEFT JOIN roles r ON r.id=a.role_id
        WHERE a.layout_id=$1 AND (a.company_id IS NULL OR a.company_id=$2) AND a.active=true
        ORDER BY a.priority DESC,a.created_at,a.id`,
      [layout.id, req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.put("/platform/layouts/:layoutId/assignments", ...manage, async (req, res) => {
    const layoutResult = await db(
      "SELECT * FROM platform_layouts WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
      [req.params.layoutId, req.user.companyId]
    );
    const layout = layoutResult.rows[0];
    if (!layout) return res.status(404).json({ success: false, message: "Layout not found" });
    const rows = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
    if (!rows) return res.status(400).json({ success: false, message: "assignments must be an array" });
    if (rows.length > 100) return res.status(400).json({ success: false, message: "A layout supports up to 100 assignments" });

    const normalized = [];
    const seen = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return res.status(400).json({ success: false, message: "Each assignment must be an object" });
      }
      const appId = row.appId || row.app_id || null;
      const recordTypeId = row.recordTypeId || row.record_type_id || null;
      const roleId = row.roleId || row.role_id || null;
      const deviceProfile = String(row.deviceProfile || row.device_profile || "any").toLowerCase();
      const priority = Number.isFinite(Number(row.priority)) ? Math.max(-1000, Math.min(1000, Number(row.priority))) : 0;
      const requiredPermissions = Array.isArray(row.requiredPermissions || row.required_permissions)
        ? [...new Set((row.requiredPermissions || row.required_permissions).map((value) => String(value).trim()).filter(Boolean))]
        : [];
      if (!["any","desktop","tablet","mobile"].includes(deviceProfile)) {
        return res.status(400).json({ success: false, message: "Device must be Any, Desktop, Tablet or Mobile" });
      }
      if (requiredPermissions.some((permission) => !/^[A-Za-z0-9_.:-]{1,120}$/.test(permission))) {
        return res.status(400).json({ success: false, message: "Required permission contains an invalid permission key" });
      }
      if (appId) {
        const app = await db("SELECT id FROM platform_apps WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [appId, req.user.companyId]);
        if (!app.rows.length) return res.status(400).json({ success: false, message: "Assigned app is not available" });
      }
      if (recordTypeId) {
        const recordType = await db("SELECT id FROM platform_record_types WHERE id=$1 AND object_id=$2 AND active=true AND (company_id IS NULL OR company_id=$3)", [recordTypeId, layout.object_id, req.user.companyId]);
        if (!recordType.rows.length) return res.status(400).json({ success: false, message: "Assigned record type is not available for this object" });
      }
      if (roleId) {
        const role = await db("SELECT id FROM roles WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [roleId, req.user.companyId]);
        if (!role.rows.length) return res.status(400).json({ success: false, message: "Assigned role is not available" });
      }
      const signature = JSON.stringify([appId || "", recordTypeId || "", roleId || "", deviceProfile, [...requiredPermissions].sort()]);
      if (seen.has(signature)) return res.status(400).json({ success: false, message: "Duplicate layout assignment" });
      seen.add(signature);
      normalized.push({ appId, recordTypeId, roleId, deviceProfile, requiredPermissions, priority });
    }

    for (const row of normalized) {
      const conflict = await db(
        `SELECT a.id,l.id AS layout_id,l.name AS layout_name
           FROM platform_layout_assignments a
           JOIN platform_layouts l ON l.id=a.layout_id
          WHERE l.object_id=$1
            AND l.page_type=$2
            AND l.id<>$3
            AND l.active=true
            AND a.active=true
            AND a.company_id=$4
            AND a.app_id IS NOT DISTINCT FROM $5::uuid
            AND a.record_type_id IS NOT DISTINCT FROM $6::uuid
            AND a.role_id IS NOT DISTINCT FROM $7::uuid
            AND a.device_profile=$8
            AND a.priority=$9
            AND a.required_permissions=$10::jsonb
          LIMIT 1`,
        [
          layout.object_id,
          layout.page_type,
          layout.id,
          req.user.companyId,
          row.appId,
          row.recordTypeId,
          row.roleId,
          row.deviceProfile,
          row.priority,
          JSON.stringify([...row.requiredPermissions].sort()),
        ]
      );
      if (conflict.rows.length) {
        return res.status(409).json({
          success: false,
          code: "LAYOUT_ASSIGNMENT_CONFLICT",
          message: `This activation scope is already assigned to "${conflict.rows[0].layout_name}". Change the scope or priority before saving.`,
          conflict: conflict.rows[0],
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM platform_layout_assignments WHERE layout_id=$1 AND company_id=$2",
        [layout.id, req.user.companyId]
      );
      const saved = [];
      for (const row of normalized) {
        const result = await client.query(
          `INSERT INTO platform_layout_assignments
            (layout_id,company_id,app_id,record_type_id,role_id,device_profile,required_permissions,priority,active)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,true)
           RETURNING *`,
          [layout.id, req.user.companyId, row.appId, row.recordTypeId, row.roleId, row.deviceProfile, JSON.stringify(row.requiredPermissions), row.priority]
        );
        saved.push(result.rows[0]);
      }
      await client.query("COMMIT");
      res.json({ success: true, data: saved });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Platform layout assignment save error:", error);
      res.status(500).json({ success: false, message: "Unable to save layout assignments" });
    } finally {
      client.release();
    }
  });

  router.post("/platform/layouts/:layoutId/clone", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_layouts WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Layout not found" });
    const source = existing.rows[0];
    const name = String(req.body?.name || `${source.name} Copy`).trim();
    if (!name) return res.status(400).json({ success: false, message: "A layout name is required" });
    const layoutKey = toSafeApiName(name, "layout");
    try {
      const result = await db(
        "INSERT INTO platform_layouts (object_id,page_type,role_id,company_id,record_type_id,name,layout_key,definition,active,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,true,false) RETURNING *",
        [source.object_id, source.page_type, source.role_id, req.user.companyId, source.record_type_id, name, layoutKey, JSON.stringify(source.definition)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A layout with this API key already exists for this object and page type" });
      console.error("Platform layout clone error:", error);
      res.status(500).json({ success: false, message: "Unable to clone platform layout" });
    }
  });

  router.get("/platform/layouts/:layoutId", ...manage, async (req, res) => {
    const result = await db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Layout not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/layouts/draft", ...manage, async (req, res) => {
    if (!validLayoutInput(req.body)) return res.status(400).json({ success: false, message: "A valid layout definition is required" });
    const object = await getObject(req.body.objectId, req);
    if (!object) return res.status(400).json({ success: false, message: "Object not found" });
    const definitionError = await validateLayoutDefinition(db, req.body.definition, object, req);
    if (definitionError) return res.status(400).json({ success: false, message: definitionError });
    const companyId = req.body.companyId || req.user.companyId;
    if (companyId !== req.user.companyId && !await canManageGlobal(db, req)) return res.status(403).json({ success: false, message: "Cannot manage another company's layout" });
    if (!(await validateLayoutRole(db, req.body.roleId, req))) return res.status(400).json({ success: false, message: "Role does not belong to this company" });
    const recordTypeId = req.body.recordTypeId || null;
    if (recordTypeId && !(await resolveRecordType(object, recordTypeId, req))) return res.status(400).json({ success: false, message: "Record type does not belong to this object and company" });
    const assignments = await normalizeLayoutAssignmentDraft(req.body.assignments || [], object.id, req);
    const pageType = req.body.pageType ?? req.body.page_type;
    const layoutKey = toSafeApiName(req.body.layoutKey || req.body.name, "layout");
    const metadata = {
      name: req.body.name.trim(),
      pageType,
      roleId: req.body.roleId || null,
      recordTypeId,
      isDefault: req.body.isDefault === true,
    };
    try {
      const result = await db(
        `INSERT INTO platform_layouts
          (object_id,page_type,role_id,company_id,record_type_id,name,layout_key,definition,active,is_default,
           lifecycle_status,version,draft_version,draft_definition,draft_metadata,draft_assignments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,false,false,'DRAFT',1,1,$8::jsonb,$9::jsonb,$10::jsonb)
         RETURNING *`,
        [object.id, pageType, req.body.roleId || null, companyId, recordTypeId, req.body.name.trim(), layoutKey,
          JSON.stringify(req.body.definition), JSON.stringify(metadata), JSON.stringify(assignments)]
      );
      await db(
        `INSERT INTO platform_layout_versions
          (layout_id,company_id,version,definition,metadata,assignments,lifecycle_status,created_by)
         VALUES ($1,$2,1,$3::jsonb,$4::jsonb,$5::jsonb,'DRAFT',$6)`,
        [result.rows[0].id, companyId, JSON.stringify(req.body.definition), JSON.stringify(metadata), JSON.stringify(assignments), req.user.id || null]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A layout with this API key or scope already exists" });
      throw error;
    }
  });

  router.put("/platform/layouts/:layoutId/draft", ...manage, async (req, res) => {
    const existingResult = await db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    const existing = existingResult.rows[0];
    if (!existing || (existing.company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    const object = await getObject(existing.object_id, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const definition = req.body?.definition;
    if (!definition || !Array.isArray(definition.components)) return res.status(400).json({ success: false, message: "A valid layout definition is required" });
    const definitionError = await validateLayoutDefinition(db, definition, object, req);
    if (definitionError) return res.status(400).json({ success: false, message: definitionError });
    const pageType = req.body.pageType ?? req.body.page_type ?? existing.page_type;
    if (!PAGE_TYPES.has(pageType)) return res.status(400).json({ success: false, message: "Invalid page type" });
    const roleId = req.body.roleId === undefined ? existing.role_id || null : req.body.roleId || null;
    if (!(await validateLayoutRole(db, roleId, req))) return res.status(400).json({ success: false, message: "Role does not belong to this company" });
    const recordTypeId = req.body.recordTypeId === undefined ? existing.record_type_id || null : req.body.recordTypeId || null;
    if (recordTypeId && !(await resolveRecordType(object, recordTypeId, req))) return res.status(400).json({ success: false, message: "Record type does not belong to this object and company" });
    const assignments = await normalizeLayoutAssignmentDraft(req.body.assignments ?? existing.draft_assignments ?? [], object.id, req);
    const metadata = {
      name: String(req.body.name || existing.draft_metadata?.name || existing.name).trim(),
      pageType,
      roleId,
      recordTypeId,
      isDefault: req.body.isDefault === undefined ? Boolean(existing.draft_metadata?.isDefault ?? existing.is_default) : req.body.isDefault === true,
    };
    const maxResult = await db(
      "SELECT COALESCE(MAX(version),0)::int AS version FROM platform_layout_versions WHERE layout_id=$1 AND company_id=$2",
      [existing.id, req.user.companyId]
    );
    const nextVersion = Number(maxResult.rows[0]?.version || existing.version || 0) + 1;
    await db(
      `INSERT INTO platform_layout_versions
        (layout_id,company_id,version,definition,metadata,assignments,lifecycle_status,created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,'DRAFT',$7)`,
      [existing.id, req.user.companyId, nextVersion, JSON.stringify(definition), JSON.stringify(metadata), JSON.stringify(assignments), req.user.id || null]
    );
    const updated = await db(
      `UPDATE platform_layouts
          SET draft_definition=$1::jsonb,draft_metadata=$2::jsonb,draft_assignments=$3::jsonb,
              draft_version=$4,version=GREATEST(version,$4),
              lifecycle_status=CASE WHEN active=true THEN lifecycle_status ELSE 'DRAFT' END,
              updated_at=NOW(),user_modified=true
        WHERE id=$5 RETURNING *`,
      [JSON.stringify(definition), JSON.stringify(metadata), JSON.stringify(assignments), nextVersion, existing.id]
    );
    res.json({ success: true, data: updated.rows[0] });
  });

  router.get("/platform/layouts/:layoutId/versions", ...manage, async (req, res) => {
    const existing = await db("SELECT id FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Layout not found" });
    const versions = await db(
      `SELECT id,layout_id,version,lifecycle_status,created_by,created_at
         FROM platform_layout_versions
        WHERE layout_id=$1 AND company_id=$2 ORDER BY version DESC`,
      [req.params.layoutId, req.user.companyId]
    );
    res.json({ success: true, data: versions.rows });
  });

  router.post("/platform/layouts/:layoutId/activate", ...manage, async (req, res) => {
    const existingResult = await db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    const layout = existingResult.rows[0];
    if (!layout || (layout.company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    const version = Number(layout.draft_version || layout.active_version || layout.version || 1);
    const definition = layout.draft_definition || layout.definition;
    const metadata = layout.draft_metadata || {
      name: layout.name, pageType: layout.page_type, roleId: layout.role_id || null,
      recordTypeId: layout.record_type_id || null, isDefault: layout.is_default === true,
    };
    const assignments = await normalizeLayoutAssignmentDraft(layout.draft_assignments || [], layout.object_id, req);

    for (const row of assignments) {
      const conflict = await db(
        `SELECT l.name
           FROM platform_layout_assignments a
           JOIN platform_layouts l ON l.id=a.layout_id
          WHERE l.object_id=$1 AND l.page_type=$2 AND l.id<>$3 AND l.active=true
            AND a.active=true AND a.company_id=$4
            AND a.app_id IS NOT DISTINCT FROM $5::uuid
            AND a.record_type_id IS NOT DISTINCT FROM $6::uuid
            AND a.role_id IS NOT DISTINCT FROM $7::uuid
            AND a.device_profile=$8 AND a.priority=$9 AND a.required_permissions=$10::jsonb
          LIMIT 1`,
        [layout.object_id, metadata.pageType, layout.id, req.user.companyId, row.appId, row.recordTypeId, row.roleId,
          row.deviceProfile, row.priority, JSON.stringify([...row.requiredPermissions].sort())]
      );
      if (conflict.rows.length) return res.status(409).json({ success: false, code: "LAYOUT_ASSIGNMENT_CONFLICT", message: `This activation scope is already assigned to "${conflict.rows[0].name}".` });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE platform_layout_versions SET lifecycle_status='INACTIVE' WHERE layout_id=$1 AND company_id=$2 AND lifecycle_status='ACTIVE'",
        [layout.id, req.user.companyId]
      );
      await client.query(
        "UPDATE platform_layout_versions SET lifecycle_status='ACTIVE' WHERE layout_id=$1 AND company_id=$2 AND version=$3",
        [layout.id, req.user.companyId, version]
      );
      await client.query("DELETE FROM platform_layout_assignments WHERE layout_id=$1 AND company_id=$2", [layout.id, req.user.companyId]);
      for (const row of assignments) {
        await client.query(
          `INSERT INTO platform_layout_assignments
            (layout_id,company_id,app_id,record_type_id,role_id,device_profile,required_permissions,priority,active)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,true)`,
          [layout.id, req.user.companyId, row.appId, row.recordTypeId, row.roleId, row.deviceProfile, JSON.stringify(row.requiredPermissions), row.priority]
        );
      }
      if (metadata.isDefault === true) {
        await client.query(
          "UPDATE platform_layouts SET is_default=false WHERE object_id=$1 AND page_type=$2 AND id<>$3 AND (company_id IS NULL OR company_id=$4)",
          [layout.object_id, metadata.pageType, layout.id, req.user.companyId]
        );
      }
      const updated = await client.query(
        `UPDATE platform_layouts
            SET page_type=$1,role_id=$2,record_type_id=$3,name=$4,definition=$5::jsonb,
                active=true,is_default=$6,lifecycle_status='ACTIVE',active_version=$7,
                version=GREATEST(version,$7),draft_version=NULL,draft_definition=NULL,
                draft_metadata=NULL,draft_assignments=NULL,updated_at=NOW(),user_modified=true
          WHERE id=$8 RETURNING *`,
        [metadata.pageType, metadata.roleId || null, metadata.recordTypeId || null, metadata.name,
          JSON.stringify(definition), metadata.isDefault === true, version, layout.id]
      );
      await client.query("COMMIT");
      await syncLayoutButtons(db, req, updated.rows[0]);
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  router.post("/platform/layouts/:layoutId/deactivate", ...manage, async (req, res) => {
    const result = await db(
      `UPDATE platform_layouts SET active=false,is_default=false,lifecycle_status='INACTIVE',updated_at=NOW(),user_modified=true
        WHERE id=$1 AND (company_id=$2 OR (company_id IS NULL AND $3=true)) RETURNING *`,
      [req.params.layoutId, req.user.companyId, await canManageGlobal(db, req)]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Layout not found" });
    await db("UPDATE platform_layout_versions SET lifecycle_status='INACTIVE' WHERE layout_id=$1 AND company_id=$2 AND lifecycle_status='ACTIVE'", [req.params.layoutId, req.user.companyId]);
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/layouts/:layoutId/versions/:version/restore", ...manage, async (req, res) => {
    const [layoutResult, versionResult] = await Promise.all([
      db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]),
      db("SELECT * FROM platform_layout_versions WHERE layout_id=$1 AND company_id=$2 AND version=$3", [req.params.layoutId, req.user.companyId, Number(req.params.version)]),
    ]);
    const layout = layoutResult.rows[0];
    const source = versionResult.rows[0];
    if (!layout || !source) return res.status(404).json({ success: false, message: "Layout or version not found" });
    const maxResult = await db("SELECT COALESCE(MAX(version),0)::int AS version FROM platform_layout_versions WHERE layout_id=$1 AND company_id=$2", [layout.id, req.user.companyId]);
    const nextVersion = Number(maxResult.rows[0]?.version || 0) + 1;
    await db(
      `INSERT INTO platform_layout_versions
        (layout_id,company_id,version,definition,metadata,assignments,lifecycle_status,created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,'DRAFT',$7)`,
      [layout.id, req.user.companyId, nextVersion, JSON.stringify(source.definition), JSON.stringify(source.metadata || {}), JSON.stringify(source.assignments || []), req.user.id || null]
    );
    const updated = await db(
      `UPDATE platform_layouts
          SET draft_definition=$1::jsonb,draft_metadata=$2::jsonb,draft_assignments=$3::jsonb,
              draft_version=$4,version=GREATEST(version,$4),
              lifecycle_status=CASE WHEN active=true THEN lifecycle_status ELSE 'DRAFT' END,
              updated_at=NOW(),user_modified=true
        WHERE id=$5 RETURNING *`,
      [JSON.stringify(source.definition), JSON.stringify(source.metadata || {}), JSON.stringify(source.assignments || []), nextVersion, layout.id]
    );
    res.json({ success: true, data: updated.rows[0] });
  });

  router.post("/platform/layouts", ...manage, async (req, res) => {
    if (!validLayoutInput(req.body)) return res.status(400).json({ success: false, message: "A valid layout definition is required" });
    const object = await getObject(req.body.objectId, req);
    if (!object) return res.status(400).json({ success: false, message: "Object not found" });
    const definitionError = await validateLayoutDefinition(db, req.body.definition, object, req);
    if (definitionError) return res.status(400).json({ success: false, message: definitionError });
    const companyId = req.body.companyId || req.user.companyId;
    if (companyId !== req.user.companyId && !await canManageGlobal(db, req)) return res.status(403).json({ success: false, message: "Cannot manage another company's layout" });
    if (!(await validateLayoutRole(db, req.body.roleId, req))) return res.status(400).json({ success: false, message: "Role does not belong to this company" });
    let recordTypeId = req.body.recordTypeId || null;
    if (recordTypeId && !(await resolveRecordType(object, recordTypeId, req))) return res.status(400).json({ success: false, message: "Record type does not belong to this object and company" });
    // The layout API key is always generated deterministically from the layout
    // label using the same safeApiName convention as objects and fields. Client
    // layoutKey values are ignored, duplicates are rejected (never suffixed),
    // and legacy rows keep their stored key because ON CONFLICT only fires for
    // a layout with the same object/page/role/company identity.
    const pageType = req.body.pageType ?? req.body.page_type;
    const layoutKey = toSafeApiName(req.body.layoutKey || req.body.name, "layout");
    try {
      const result = recordTypeId
        ? await db("INSERT INTO platform_layouts (object_id,page_type,role_id,company_id,record_type_id,name,layout_key,definition,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *", [object.id, pageType, req.body.roleId || null, companyId, recordTypeId, req.body.name.trim(), layoutKey, JSON.stringify(req.body.definition), req.body.isDefault === true])
        : await db("INSERT INTO platform_layouts (object_id,page_type,role_id,company_id,name,layout_key,definition,is_default) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (object_id,page_type,role_id,company_id) DO UPDATE SET name=EXCLUDED.name, definition=EXCLUDED.definition, is_default=CASE WHEN EXCLUDED.is_default THEN true ELSE platform_layouts.is_default END, active=true, updated_at=NOW() RETURNING *", [object.id, pageType, req.body.roleId || null, companyId, req.body.name.trim(), layoutKey, JSON.stringify(req.body.definition), req.body.isDefault === true]);
      await syncLayoutButtons(db, req, result.rows[0], { deactivateExisting: false });
      if (req.body.isDefault === true) {
        await db("UPDATE platform_layouts SET is_default=false WHERE object_id=$1 AND page_type=$2 AND id<>$3 AND (company_id IS NULL OR company_id=$4)", [object.id, pageType, result.rows[0].id, req.user.companyId]);
      }
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        if (error.constraint === "uq_platform_layouts_object_page_key") return res.status(409).json({ success: false, message: "A layout with this API key already exists for this object and page type. Choose a different layout name." });
        return res.status(409).json({ success: false, message: "A layout already exists for this object, page type, role and company" });
      }
      console.error("Platform layout create error:", error);
      res.status(500).json({ success: false, message: "Unable to create platform layout" });
    }
  });

  router.put("/platform/layouts/:layoutId", ...manage, async (req, res) => {
    if (!validLayoutInput(req.body)) return res.status(400).json({ success: false, message: "A valid layout definition is required" });
    const existing = await db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    if (!existing.rows.length || (existing.rows[0].company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    // Layout API keys are immutable: renaming the display label only changes
    // name, never the generated layout_key. The page type cannot change to one
    // that already has a layout with the same generated key (unique index).
    const pageType = req.body.pageType ?? req.body.page_type;
    const recordTypeId = req.body.recordTypeId === undefined ? existing.rows[0].record_type_id || null : req.body.recordTypeId || null;
    const existingObject = await getObject(existing.rows[0].object_id, req);
    if (!existingObject) return res.status(404).json({ success: false, message: "Object not found" });
    const definitionError = await validateLayoutDefinition(db, req.body.definition, existingObject, req);
    if (definitionError) return res.status(400).json({ success: false, message: definitionError });
    if (recordTypeId) {
      if (!existingObject || !(await resolveRecordType(existingObject, recordTypeId, req))) return res.status(400).json({ success: false, message: "Record type does not belong to this object and company" });
    }
    if (!(await validateLayoutRole(db, req.body.roleId, req))) return res.status(400).json({ success: false, message: "Role does not belong to this company" });
    try {
      const result = recordTypeId
        ? await db("UPDATE platform_layouts SET page_type=$1,role_id=$2,record_type_id=$3,name=$4,definition=$5::jsonb,active=COALESCE($6,active),is_default=CASE WHEN COALESCE($6,active)=false THEN false ELSE COALESCE($7,is_default) END,user_modified=true,updated_at=NOW() WHERE id=$8 RETURNING *", [pageType, req.body.roleId || null, recordTypeId, req.body.name.trim(), JSON.stringify(req.body.definition), req.body.active, req.body.isDefault, req.params.layoutId])
        : await db("UPDATE platform_layouts SET page_type=$1,role_id=$2,name=$3,definition=$4::jsonb,active=COALESCE($5,active),is_default=CASE WHEN COALESCE($5,active)=false THEN false ELSE COALESCE($6,is_default) END,user_modified=true,updated_at=NOW() WHERE id=$7 RETURNING *", [pageType, req.body.roleId || null, req.body.name.trim(), JSON.stringify(req.body.definition), req.body.active, req.body.isDefault, req.params.layoutId]);
      await syncLayoutButtons(db, req, result.rows[0]);
      if (req.body.isDefault === true) {
        await db("UPDATE platform_layouts SET is_default=false WHERE object_id=$1 AND page_type=$2 AND id<>$3 AND (company_id IS NULL OR company_id=$4)", [result.rows[0].object_id, result.rows[0].page_type, result.rows[0].id, req.user.companyId]);
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A layout with this API key already exists for this object and page type. Choose a different layout name." });
      console.error("Platform layout update error:", error);
      res.status(500).json({ success: false, message: "Unable to update platform layout" });
    }
  });

  router.post("/platform/layouts/:layoutId/default", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_layouts WHERE id=$1 AND (company_id IS NULL OR company_id=$2)", [req.params.layoutId, req.user.companyId]);
    if (!existing.rows.length || (existing.rows[0].company_id === null && !await canManageGlobal(db, req))) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    if (!existing.rows[0].active) return res.status(400).json({ success: false, message: "Only active layouts can be the default" });
    const layout = existing.rows[0];
    try {
      await db("UPDATE platform_layouts SET is_default=false, updated_at=NOW() WHERE object_id=$1 AND page_type=$2 AND (company_id IS NULL OR company_id=$3)", [layout.object_id, layout.page_type, req.user.companyId]);
      const result = await db("UPDATE platform_layouts SET is_default=true,user_modified=true,updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.layoutId]);
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Platform layout default error:", error);
      res.status(500).json({ success: false, message: "Unable to set default platform layout" });
    }
  });

  router.delete("/platform/layouts/:layoutId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_layouts SET active=false,is_default=false,user_modified=true WHERE id=$1 AND (company_id=$2 OR (company_id IS NULL AND $3=true)) RETURNING *", [req.params.layoutId, req.user.companyId, await canManageGlobal(db, req)]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/layouts/:layoutId/activate", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_layouts SET active=true,user_modified=true,updated_at=NOW() WHERE id=$1 AND (company_id=$2 OR (company_id IS NULL AND $3=true)) RETURNING *", [req.params.layoutId, req.user.companyId, await canManageGlobal(db, req)]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Layout not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  function collectRuleFieldIds(value, out = new Set()) {
    if (!value || typeof value !== "object") return out;
    if (Array.isArray(value)) {
      for (const item of value) collectRuleFieldIds(item, out);
      return out;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (/^(?:fieldId|field_id|sourceFieldId|source_field_id|targetFieldId|target_field_id|lookupFieldId|lookup_field_id)$/i.test(key)
        && typeof nested === "string" && nested.trim()) {
        out.add(nested.trim());
      }
      collectRuleFieldIds(nested, out);
    }
    return out;
  }

  function workflowAuthoringRow(row) {
    if (!row || row.action?.type !== "workflow") return row;
    const draft = row.draft_definition && typeof row.draft_definition === "object" ? row.draft_definition : null;
    if (!draft) {
      return {
        ...row,
        runtime_active: row.active === true,
        active_version: row.active_version || (row.active ? row.version : null),
        draft_version: row.draft_version || null,
      };
    }
    return {
      ...row,
      object_id: draft.object_id ?? row.object_id ?? null,
      name: draft.name ?? row.name,
      trigger_key: draft.trigger_key ?? row.trigger_key,
      conditions: Array.isArray(draft.conditions) ? draft.conditions : (row.conditions || []),
      action: draft.action && typeof draft.action === "object" ? draft.action : row.action,
      active: false,
      lifecycle_status: "DRAFT",
      version: Number(row.draft_version || draft.version || row.version || 1),
      runtime_active: row.active === true,
      active_version: row.active_version || (row.active ? row.version : null),
      draft_version: Number(row.draft_version || draft.version || row.version || 1),
    };
  }

  router.get("/platform/rules", ...manage, async (req, res) => {
    await ensureSystemWorkflowCatalog({ db, companyId: req.user.companyId, userId: req.user.id || null });
    const result = await db(
      `SELECT r.*, o.object_key, o.label AS object_label
         FROM platform_rules r
         LEFT JOIN platform_objects o
           ON o.id=COALESCE(NULLIF(r.draft_definition->>'object_id','')::uuid,r.object_id)
        WHERE (r.company_id IS NULL OR r.company_id=$1)
        ORDER BY r.name`,
      [req.user.companyId]
    );
    const rows = (result.rows || []).map(workflowAuthoringRow);
    const fieldIds = [...new Set(rows.flatMap((rule) => [
      ...collectRuleFieldIds(rule.conditions),
      ...collectRuleFieldIds(rule.action),
    ]))];
    const fieldOwners = fieldIds.length
      ? await db(
          "SELECT id,object_id FROM platform_fields WHERE id=ANY($1::uuid[]) AND active=true AND (company_id IS NULL OR company_id=$2)",
          [fieldIds, req.user.companyId]
        )
      : { rows: [] };
    const objectByFieldId = new Map((fieldOwners.rows || []).map((field) => [String(field.id), String(field.object_id)]));
    const data = rows.map((rule) => {
      const referencedFieldIds = [...new Set([
        ...collectRuleFieldIds(rule.conditions),
        ...collectRuleFieldIds(rule.action),
      ])].filter((fieldId) => objectByFieldId.has(String(fieldId)));
      const referencedObjectIds = [...new Set([
        ...(rule.object_id ? [String(rule.object_id)] : []),
        ...referencedFieldIds.map((fieldId) => objectByFieldId.get(String(fieldId))),
      ].filter(Boolean))];
      return {
        ...rule,
        referenced_field_ids: referencedFieldIds,
        referenced_object_ids: referencedObjectIds,
      };
    });
    res.json({ success: true, data });
  });

  async function assignmentTargetExists(companyId, targetType, targetId) {
    if (!companyId || !targetId) return false;
    if (targetType === "USER") {
      const result = await db("SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND active=true LIMIT 1", [targetId, companyId]);
      return result.rows.length > 0;
    }
    if (targetType === "ROLE") {
      const result = await db("SELECT 1 FROM roles WHERE id=$1 AND (company_id=$2 OR company_id IS NULL) LIMIT 1", [targetId, companyId]);
      return result.rows.length > 0;
    }
    if (targetType === "QUEUE") {
      const result = await db("SELECT 1 FROM platform_queues WHERE id=$1 AND company_id=$2 AND active=true LIMIT 1", [targetId, companyId]);
      return result.rows.length > 0;
    }
    return false;
  }

  async function prepareAssignmentRule(req, object, input = {}) {
    const companyId = req.user.companyId;
    if (!companyId) throw new ConditionError("A company context is required for Assignment Rules");

    const name = String(input.name || "").trim();
    const ruleKey = input.ruleKey || input.rule_key || toSafeApiName(name, "assignment_rule");
    const targetType = String(input.targetType || input.target_type || "USER").toUpperCase();
    const targetId = input.targetId || input.target_id || null;
    const assignmentField = String(input.assignmentField || input.assignment_field || "assigned_to").trim();
    const conditions = input.conditions || { match: "all", conditions: [] };
    const priority = Number(input.priority || 0);
    const active = input.active !== false;

    if (!name || !isSafeIdentifier(ruleKey)) throw new ConditionError("Assignment Rule name and valid API key are required");
    if (!["USER","ROLE","QUEUE"].includes(targetType)) throw new ConditionError("Assignment target type must be USER, ROLE, or QUEUE");
    if (!await assignmentTargetExists(companyId, targetType, targetId)) throw new ConditionError("Assignment target is not available to this company");

    const fields = await db(
      "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
      [object.id, companyId]
    );
    const assignment = fields.rows.find((field) => field.api_name === assignmentField);
    if (!assignment) throw new ConditionError("Assignment field does not belong to this object");
    validateConditionConfig(conditions, fields.rows, "Assignment criteria");

    return { name, ruleKey, targetType, targetId, assignmentField, conditions, priority, active };
  }

  router.get("/platform/objects/:objectId/assignment-rules", ...manage, async (req, res) => {
    try {
      const object = await getObject(req.params.objectId, req);
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });
      if (!req.user.companyId) return res.status(400).json({ success: false, message: "A company context is required for Assignment Rules" });
      const result = await db(
        "SELECT * FROM platform_assignment_rules WHERE object_id=$1 AND company_id=$2 ORDER BY priority DESC,name",
        [object.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(error instanceof ConditionError ? 400 : 500).json({ success: false, message: error.message });
    }
  });

  router.post("/platform/objects/:objectId/assignment-rules", ...manage, async (req, res) => {
    try {
      const object = await getObject(req.params.objectId, req);
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });
      const rule = await prepareAssignmentRule(req, object, req.body || {});
      const result = await db(
        `INSERT INTO platform_assignment_rules
          (object_id,company_id,name,rule_key,target_type,target_id,assignment_field,conditions,active,priority)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
         RETURNING *`,
        [object.id, req.user.companyId, rule.name, rule.ruleKey, rule.targetType, rule.targetId,
          rule.assignmentField, JSON.stringify(rule.conditions), rule.active, rule.priority]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      res.status(error instanceof ConditionError ? 400 : 500).json({ success: false, message: error.message });
    }
  });

  router.put("/platform/assignment-rules/:ruleId", ...manage, async (req, res) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ success: false, message: "A company context is required for Assignment Rules" });
      const existing = await db(
        "SELECT * FROM platform_assignment_rules WHERE id=$1 AND company_id=$2",
        [req.params.ruleId, req.user.companyId]
      );
      if (!existing.rows.length) return res.status(404).json({ success: false, message: "Assignment Rule not found" });
      const old = existing.rows[0];
      const object = await getObject(old.object_id, req);
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });
      const rule = await prepareAssignmentRule(req, object, { ...old, ...req.body });
      const result = await db(
        `UPDATE platform_assignment_rules
            SET name=$1,rule_key=$2,target_type=$3,target_id=$4,assignment_field=$5,
                conditions=$6::jsonb,active=$7,priority=$8,updated_at=NOW()
          WHERE id=$9 AND company_id=$10
          RETURNING *`,
        [rule.name, rule.ruleKey, rule.targetType, rule.targetId, rule.assignmentField,
          JSON.stringify(rule.conditions), rule.active, rule.priority, old.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      res.status(error instanceof ConditionError ? 400 : 500).json({ success: false, message: error.message });
    }
  });

  router.delete("/platform/assignment-rules/:ruleId", ...manage, async (req, res) => {
    try {
      if (!req.user.companyId) return res.status(400).json({ success: false, message: "A company context is required for Assignment Rules" });
      const result = await db(
        "UPDATE platform_assignment_rules SET active=false,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",
        [req.params.ruleId, req.user.companyId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Assignment Rule not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  router.get("/platform/objects/:objectId/duplicate-management", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const [matching, duplicate] = await Promise.all([
      db(
        `SELECT * FROM platform_matching_rules
          WHERE object_id=$1 AND company_id=$2 AND active=true
          ORDER BY label,id`,
        [object.id, req.user.companyId]
      ),
      db(
        `SELECT d.*,m.label AS matching_rule_label,m.rule_key AS matching_rule_key
          FROM platform_duplicate_rules d
          JOIN platform_matching_rules m ON m.id=d.matching_rule_id
          WHERE d.object_id=$1 AND d.company_id=$2 AND d.active=true
          ORDER BY d.label,d.id`,
        [object.id, req.user.companyId]
      ),
    ]);
    res.json({ success: true, data: { matchingRules: matching.rows, duplicateRules: duplicate.rows } });
  });

  router.post("/platform/objects/:objectId/matching-rules", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const label = String(req.body?.label || "").trim();
    const ruleKey = String(req.body?.ruleKey || req.body?.rule_key || toSafeApiName(label, "matching_rule")).trim();
    const matchMode = String(req.body?.matchMode || req.body?.match_mode || "ALL").toUpperCase();
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : [];
    if (!label || !isSafeIdentifier(ruleKey)) return res.status(400).json({ success: false, message: "Matching rule label and safe API key are required" });
    try {
      validateDuplicateRule({ action: "ALLOW", matchMode, fields });
      const fieldNames = [...new Set(fields.map((field) => String(field.fieldApiName)))];
      const available = fieldNames.length
        ? await db(
            "SELECT api_name FROM platform_fields WHERE object_id=$1 AND api_name=ANY($2::text[]) AND active=true AND (company_id IS NULL OR company_id=$3)",
            [object.id, fieldNames, req.user.companyId]
          )
        : { rows: [] };
      if (available.rows.length !== fieldNames.length) {
        return res.status(400).json({ success: false, message: "Matching rules can only reference active fields on this object" });
      }
      const result = await db(
        `INSERT INTO platform_matching_rules
          (company_id,object_id,rule_key,label,description,match_mode,fields,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,true)
         RETURNING *`,
        [req.user.companyId, object.id, ruleKey, label, req.body?.description || null, matchMode, JSON.stringify(fields)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A matching rule with this API key already exists" });
      if (!error.code) return res.status(400).json({ success: false, message: error.message });
      throw error;
    }
  });

  router.put("/platform/matching-rules/:ruleId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT * FROM platform_matching_rules WHERE id=$1 AND company_id=$2 AND active=true",
      [req.params.ruleId, req.user.companyId]
    );
    const rule = existing.rows[0];
    if (!rule) return res.status(404).json({ success: false, message: "Matching rule not found" });
    const label = String(req.body?.label ?? rule.label).trim();
    const ruleKey = String(req.body?.ruleKey ?? req.body?.rule_key ?? rule.rule_key).trim();
    const matchMode = String(req.body?.matchMode ?? req.body?.match_mode ?? rule.match_mode).toUpperCase();
    const fields = req.body?.fields === undefined ? rule.fields : req.body.fields;
    if (!label || !isSafeIdentifier(ruleKey) || !Array.isArray(fields)) return res.status(400).json({ success: false, message: "Matching rule definition is invalid" });
    try {
      validateDuplicateRule({ action: "ALLOW", matchMode, fields });
      const fieldNames = [...new Set(fields.map((field) => String(field.fieldApiName)))];
      const available = fieldNames.length
        ? await db(
            "SELECT api_name FROM platform_fields WHERE object_id=$1 AND api_name=ANY($2::text[]) AND active=true AND (company_id IS NULL OR company_id=$3)",
            [rule.object_id, fieldNames, req.user.companyId]
          )
        : { rows: [] };
      if (available.rows.length !== fieldNames.length) return res.status(400).json({ success: false, message: "Matching rules can only reference active fields on this object" });
      const result = await db(
        `UPDATE platform_matching_rules
            SET rule_key=$1,label=$2,description=$3,match_mode=$4,fields=$5::jsonb,updated_at=NOW()
          WHERE id=$6 AND company_id=$7 RETURNING *`,
        [ruleKey, label, req.body?.description ?? rule.description, matchMode, JSON.stringify(fields), rule.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A matching rule with this API key already exists" });
      if (!error.code) return res.status(400).json({ success: false, message: error.message });
      throw error;
    }
  });

  router.delete("/platform/matching-rules/:ruleId", ...manage, async (req, res) => {
    const linked = await db(
      "SELECT id FROM platform_duplicate_rules WHERE matching_rule_id=$1 AND company_id=$2 AND active=true LIMIT 1",
      [req.params.ruleId, req.user.companyId]
    );
    if (linked.rows.length) return res.status(409).json({ success: false, message: "Deactivate linked duplicate rules before removing this matching rule" });
    const result = await db(
      "UPDATE platform_matching_rules SET active=false,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",
      [req.params.ruleId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Matching rule not found" });
    res.json({ success: true });
  });

  router.post("/platform/objects/:objectId/duplicate-rules", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const label = String(req.body?.label || "").trim();
    const ruleKey = String(req.body?.ruleKey || req.body?.rule_key || toSafeApiName(label, "duplicate_rule")).trim();
    const matchingRuleId = req.body?.matchingRuleId || req.body?.matching_rule_id;
    const action = String(req.body?.action || "BLOCK").toUpperCase();
    if (!label || !isSafeIdentifier(ruleKey) || !recordIdIsValid(String(matchingRuleId || "")) || !["ALLOW","WARN","BLOCK"].includes(action)) {
      return res.status(400).json({ success: false, message: "Duplicate rule definition is invalid" });
    }
    const matching = await db(
      "SELECT id FROM platform_matching_rules WHERE id=$1 AND object_id=$2 AND company_id=$3 AND active=true",
      [matchingRuleId, object.id, req.user.companyId]
    );
    if (!matching.rows.length) return res.status(400).json({ success: false, message: "Matching rule is not available for this object" });
    try {
      const result = await db(
        `INSERT INTO platform_duplicate_rules
          (company_id,object_id,matching_rule_id,rule_key,label,description,action,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         RETURNING *`,
        [req.user.companyId, object.id, matchingRuleId, ruleKey, label, req.body?.description || null, action]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A duplicate rule with this API key already exists" });
      throw error;
    }
  });

  router.put("/platform/duplicate-rules/:ruleId", ...manage, async (req, res) => {
    const existing = await db(
      "SELECT * FROM platform_duplicate_rules WHERE id=$1 AND company_id=$2 AND active=true",
      [req.params.ruleId, req.user.companyId]
    );
    const rule = existing.rows[0];
    if (!rule) return res.status(404).json({ success: false, message: "Duplicate rule not found" });
    const matchingRuleId = req.body?.matchingRuleId ?? req.body?.matching_rule_id ?? rule.matching_rule_id;
    const action = String(req.body?.action ?? rule.action).toUpperCase();
    const label = String(req.body?.label ?? rule.label).trim();
    const ruleKey = String(req.body?.ruleKey ?? req.body?.rule_key ?? rule.rule_key).trim();
    if (!label || !isSafeIdentifier(ruleKey) || !["ALLOW","WARN","BLOCK"].includes(action)) return res.status(400).json({ success: false, message: "Duplicate rule definition is invalid" });
    const matching = await db(
      "SELECT id FROM platform_matching_rules WHERE id=$1 AND object_id=$2 AND company_id=$3 AND active=true",
      [matchingRuleId, rule.object_id, req.user.companyId]
    );
    if (!matching.rows.length) return res.status(400).json({ success: false, message: "Matching rule is not available for this object" });
    try {
      const result = await db(
        `UPDATE platform_duplicate_rules
            SET matching_rule_id=$1,rule_key=$2,label=$3,description=$4,action=$5,updated_at=NOW()
          WHERE id=$6 AND company_id=$7 RETURNING *`,
        [matchingRuleId, ruleKey, label, req.body?.description ?? rule.description, action, rule.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A duplicate rule with this API key already exists" });
      throw error;
    }
  });

  router.delete("/platform/duplicate-rules/:ruleId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE platform_duplicate_rules SET active=false,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",
      [req.params.ruleId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Duplicate rule not found" });
    res.json({ success: true });
  });

  router.get("/platform/objects/:objectId/configuration", ...manage, async (req, res) => {
    const object = await getObject(req.params.objectId, req);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });

    const companyId = req.user.companyId || null;
    const [
      buttons,
      registeredActions,
      actionBindings,
      approvals,
      assignmentRules,
      listViews,
      reports,
      layouts,
      recordTypes,
      sharingSettings,
      sharingRules,
      automationLogs,
    ] = await Promise.all([
      db("SELECT * FROM platform_buttons WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY label", [object.id, companyId]),
      db("SELECT * FROM platform_registered_actions WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY label", [object.id, companyId]),
      db("SELECT * FROM platform_action_bindings WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY execution_order,event_key", [object.id, companyId]),
      companyId
        ? db(
            `SELECT p.*,
                    COALESCE(json_agg(
                      json_build_object(
                        'id',s.id,
                        'step_order',s.step_order,
                        'label',s.label,
                        'role_id',s.role_id,
                        'role_name',r.name,
                        'config',s.config
                      ) ORDER BY s.step_order
                    ) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS steps
               FROM platform_approval_processes p
               LEFT JOIN platform_approval_steps s ON s.process_id=p.id
               LEFT JOIN roles r ON r.id=s.role_id
              WHERE p.object_id=$1 AND p.company_id=$2
              GROUP BY p.id
              ORDER BY p.name`,
            [object.id, companyId]
          )
        : { rows: [] },
      companyId
        ? db("SELECT * FROM platform_assignment_rules WHERE object_id=$1 AND company_id=$2 ORDER BY priority DESC,name", [object.id, companyId])
        : { rows: [] },
      db("SELECT * FROM platform_list_views WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY is_default DESC,label", [object.id, companyId]),
      db("SELECT * FROM platform_reports WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY label", [object.id, companyId]),
      db("SELECT * FROM platform_layouts WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY page_type,name", [object.id, companyId]),
      db("SELECT * FROM platform_record_types WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) AND active=true ORDER BY is_default DESC,label", [object.id, companyId]),
      companyId
        ? db("SELECT * FROM platform_object_sharing_settings WHERE object_id=$1 AND company_id=$2", [object.id, companyId])
        : { rows: [] },
      companyId
        ? db("SELECT * FROM platform_sharing_rules WHERE object_id=$1 AND company_id=$2 AND active=true ORDER BY name", [object.id, companyId])
        : { rows: [] },
      companyId
        ? db("SELECT * FROM platform_automation_logs WHERE object_id=$1 AND company_id=$2 ORDER BY created_at DESC LIMIT 100", [object.id, companyId])
        : { rows: [] },
    ]);

    res.json({
      success: true,
      data: {
        objectId: object.id,
        buttons: buttons.rows || [],
        registeredActions: registeredActions.rows || [],
        actionBindings: actionBindings.rows || [],
        approvalProcesses: approvals.rows || [],
        assignmentRules: assignmentRules.rows || [],
        listViews: listViews.rows || [],
        reports: reports.rows || [],
        layouts: layouts.rows || [],
        recordTypes: recordTypes.rows || [],
        sharingSettings: sharingSettings.rows?.[0] || null,
        sharingRules: sharingRules.rows || [],
        automationLogs: automationLogs.rows || [],
      },
    });
  });

  router.get("/platform/function-registry", ...manage, async (req, res) => {
    res.json({
      success: true,
      data: getRegisteredFunctionsRegistry().map(({ handler, validation, ...definition }) => definition),
    });
  });

  router.get("/platform/workflow-triggers", ...manage, async (_req, res) => {
    const core = [
      ["before_create", "Before a record is created"],
      ["after_create", "After a record is created"],
      ["before_update", "Before a record is updated"],
      ["after_update", "After a record is updated"],
      ["before_save", "Before a record is created or updated"],
      ["after_save", "After a record is created or updated"],
      ["field_changed", "When a field changes"],
      ["before_delete", "Before a record is deleted"],
      ["after_delete", "After a record is deleted"],
      ["manual", "Manual trigger"],
    ].map(([key, label]) => ({ key, label, kind: "record" }));
    const events = await db(
      "SELECT event_type,description FROM platform_event_types WHERE active=TRUE ORDER BY event_type"
    );
    res.json({
      success: true,
      data: [
        ...core,
        ...(events.rows || []).map((row) => ({
          key: row.event_type,
          label: row.description || row.event_type,
          kind: "event",
        })),
      ],
    });
  });

  router.get("/platform/report-builder-registry", ...manage, (_req, res) => {
    res.json({
      success: true,
      data: [
        { key: "field", label: "Field", category: "Report", schema: { field: { type: "field" } } },
        { key: "filter", label: "Filter", category: "Report", schema: { field: { type: "field" }, operator: { type: "select", options: ["eq","neq","gt","gte","lt","lte","contains","in","is_null"] }, value: { type: "value" } } },
        { key: "group", label: "Group", category: "Report", schema: { field: { type: "field" } } },
        { key: "metric", label: "Metric", category: "Report", schema: { type: { type: "select", options: ["count","sum","avg","min","max"] }, field: { type: "field", optional: true } } },
        { key: "sort", label: "Sort", category: "Report", schema: { field: { type: "field" }, direction: { type: "select", options: ["asc","desc"] } } },
      ],
    });
  });

  router.get("/platform/workflow-actions", ...manage, async (req, res) => {
    res.json({
      success: true,
      data: getWorkflowBuilderActionRegistry()
        .map(({ key, displayName, description, async: isAsync, requiredPermissions = [], requiredEntitlement = null, schema = null, outputSchema = null, capability = null }) => ({
          key,
          displayName,
          description,
          async: isAsync === true,
          requiredPermissions,
          requiredEntitlement,
          schema,
          outputSchema,
          capability,
        })),
    });
  });


  router.get("/platform/agents", ...manage, async (req, res) => {
    const result = await db(
      `SELECT id,label,api_name,description,user_access,instructions,actions,active,created_at,updated_at
         FROM platform_agents
        WHERE company_id=$1 AND active=true
        ORDER BY label,api_name`,
      [req.user.companyId]
    );
    res.json({
      success: true,
      data: [
        { id: "oneengine-assistant", label: "OneEngine Assistant", api_name: "oneengine_assistant", description: "Built-in OneEngine assistant.", active: true, built_in: true, actions: [] },
        ...(result.rows || []),
      ],
    });
  });

  router.post("/platform/agents", ...manage, async (req, res) => {
    const body = req.body || {};
    const label = String(body.label || "").trim();
    const apiName = String(body.apiName || body.api_name || "").trim();
    const instructions = String(body.instructions || "").trim();
    const actions = Array.isArray(body.actions) ? [...new Set(body.actions.map((value) => String(value || "").trim()).filter(Boolean))] : [];
    if (!label) return res.status(400).json({ success: false, message: "Agent label is required" });
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName) || apiName.endsWith("_") || apiName.includes("__")) {
      return res.status(400).json({ success: false, message: "Agent API Name is invalid" });
    }
    if (!instructions) return res.status(400).json({ success: false, message: "Agent instructions are required" });
    if (!actions.length) return res.status(400).json({ success: false, message: "Add at least one action before Create & Activate" });
    const registry = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));
    const invalid = actions.filter((key) => !registry.has(key) || ["RUN_AGENT","SCREEN"].includes(key));
    if (invalid.length) return res.status(400).json({ success: false, message: `Unsupported agent actions: ${invalid.join(", ")}` });
    const result = await db(
      `INSERT INTO platform_agents(company_id,label,api_name,description,user_access,instructions,actions,active,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,true,$8)
       ON CONFLICT(company_id,api_name)
       DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,user_access=EXCLUDED.user_access,
         instructions=EXCLUDED.instructions,actions=EXCLUDED.actions,active=true,updated_at=NOW()
       RETURNING id,label,api_name,description,user_access,instructions,actions,active,created_at,updated_at`,
      [req.user.companyId,label,apiName,body.description || null,body.userAccess || body.user_access || null,instructions,JSON.stringify(actions),req.user.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  /*
   * Licence-aware resource catalogue for scoped package builders.
   * The ordinary Platform Builder keeps using its existing unrestricted
   * metadata endpoints. Package-scoped editors (for example WhatsApp
   * Assistant) use this endpoint so objects owned by an uninstalled or
   * unlicensed commercial package never appear as selectable resources.
   */
  router.get("/platform/workflow-resources", ...manage, async (req, res) => {
    const scope = String(req.query.scope || "").trim();
    if (!scope) return res.status(400).json({ success: false, message: "Workflow resource scope is required" });

    const entitlements = await getCompanyEntitlements(db, req.user.companyId);
    const objectResult = await db(
      `SELECT o.*,
              op.package_key AS object_package_key,op.package_type AS object_package_type,
              op.licence_mode AS object_licence_mode,op.manifest AS object_package_manifest,
              oi.status AS object_installation_status,oi.suspended_by_entitlement AS object_suspended,
              oi.deactivated_by_user AS object_deactivated,
              m.id AS owning_module_id,m.installed AS module_installed,
              access.enabled AS module_company_enabled,
              mp.package_key AS module_package_key,mp.package_type AS module_package_type,
              mp.licence_mode AS module_licence_mode,mp.manifest AS module_package_manifest,
              mi.status AS module_package_status,mi.suspended_by_entitlement AS module_suspended,
              mi.deactivated_by_user AS module_deactivated
         FROM platform_objects o
         LEFT JOIN package_registry op ON op.id=o.package_id
         LEFT JOIN company_package_installations oi
           ON oi.package_id=o.package_id AND oi.company_id=$1
         LEFT JOIN platform_modules m ON m.id=o.module_id
         LEFT JOIN package_registry mp ON mp.module_id=m.id AND mp.active=true
         LEFT JOIN company_package_installations mi
           ON mi.package_id=mp.id AND mi.company_id=$1
         LEFT JOIN LATERAL (
           SELECT enabled FROM platform_module_access
            WHERE module_id=m.id AND company_id=$1
            ORDER BY (store_id IS NOT NULL) ASC
            LIMIT 1
         ) access ON TRUE
        WHERE o.active=true AND (o.company_id IS NULL OR o.company_id=$1)
        ORDER BY o.label`,
      [req.user.companyId]
    );

    const objects = objectResult.rows.filter((object) => {
      if (object.owning_module_id) {
        const access = moduleRuntimeAccess({
          enabledByCompany: object.module_company_enabled ?? true,
          packageInstalled: object.module_installed === true
            && object.module_package_status === "active"
            && object.module_suspended !== true
            && object.module_deactivated !== true,
          licensed: isPackageLicensed(entitlements, {
            package_key: object.module_package_key,
            package_type: object.module_package_type,
            licence_mode: object.module_licence_mode,
            manifest: object.module_package_manifest || {},
          }),
          permitted: true,
        });
        if (!access.allowed) return false;
      }
      if (!object.package_required || !object.package_id) return true;
      if (object.object_installation_status !== "active" || object.object_suspended === true || object.object_deactivated === true) return false;
      return isPackageLicensed(entitlements, {
        package_key: object.object_package_key,
        package_type: object.object_package_type,
        licence_mode: object.object_licence_mode,
        manifest: object.object_package_manifest || {},
      });
    });

    const whatsappAssistantActions = new Set([
      "CONSTANT","FORMULA","ASSIGNMENT","LOOP","GET_RECORDS","BULK_UPDATE_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","ASSIGN_RECORD",
      "ADD_RELATIONSHIP","REMOVE_RELATIONSHIP","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD",
      "IN_APP_NOTIFICATION","SEND_EMAIL","SEND_SMS","SEND_WHATSAPP",
      "RUN_SUBFLOW","CONDITION","SCHEDULE_PATH","WAIT","STOP","WEBHOOK","CALL_WEBHOOK","HTTP_REQUEST"
    ]);
    const actions = getWorkflowActionRegistry()
      .filter((definition) => scope !== "whatsapp_assistant" || whatsappAssistantActions.has(definition.key))
      .filter((definition) => {
        if (!definition.requiredEntitlement) return true;
        if (hasEntitlement(entitlements, definition.requiredEntitlement)) return true;
        return scope === "whatsapp_assistant"
          && definition.key === "SEND_WHATSAPP"
          && hasEntitlement(entitlements, "whatsapp_assistant");
      })
      .map(({ key, displayName, description, async: isAsync, requiredPermissions = [], requiredEntitlement = null, schema = null, capability = null }) => ({
        key,
        displayName,
        description,
        async: isAsync === true,
        requiredPermissions,
        requiredEntitlement,
        schema,
        capability,
      }));

    res.json({ success: true, data: { scope, objects, actions } });
  });

  router.get("/platform/approval-roles", ...manage, async (req, res) => {
    const result = await db(
      "SELECT id,name,description,parent_role_id,is_system_role,default_landing_page FROM roles WHERE (company_id=$1 OR company_id IS NULL) ORDER BY is_system_role DESC,name",
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  async function normalizeRuleLifecycle(rule, fallbackActive = false) {
    const hasLifecycle = rule?.lifecycle_status !== undefined || rule?.lifecycleStatus !== undefined;
    const requested = String(rule?.lifecycle_status ?? rule?.lifecycleStatus ?? (rule?.active === true ? "ACTIVE" : fallbackActive ? "ACTIVE" : "DRAFT")).toUpperCase();
    const lifecycle = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(requested) ? requested : "DRAFT";
    const version = Number.isFinite(Number(rule?.version)) ? Math.max(1, Number(rule.version)) : 1;
    const active = hasLifecycle ? lifecycle === "ACTIVE" : rule?.active === undefined ? lifecycle === "ACTIVE" : Boolean(rule.active);
    return { lifecycle, version, active };
  }

  async function checkRule(req, rule, { strict = null } = {}) {
    if (typeof rule.name !== "string" || !rule.name.trim() || rule.name.length > 200 || typeof rule.trigger_key !== "string" || !rule.trigger_key.trim()
      || !Array.isArray(rule.conditions) || !rule.action || typeof rule.action !== "object" || Array.isArray(rule.action) || typeof rule.active !== "boolean") return "Invalid rule name, trigger, conditions, action or status";
    const isWorkflow = rule.action.type === "workflow";
    const strictWorkflow = !isWorkflow || strict === true || rule.active === true || String(rule.lifecycle_status || rule.lifecycleStatus || "").toUpperCase() === "ACTIVE";
    const recordTriggers = ["after_create", "after_update", "after_save", "before_save", "before_create", "before_update", "field_changed", "before_delete", "after_delete", "manual"];
    if (!recordTriggers.includes(rule.trigger_key)) {
      const eventType = await db(
        "SELECT event_type FROM platform_event_types WHERE event_type=$1 AND active=TRUE LIMIT 1",
        [rule.trigger_key]
      );
      if (!eventType.rows.length) return "Unsupported automation trigger";
    }
    if (rule.object_id && !await getObject(rule.object_id, req)) return "Object not found";
    const conditionFields = rule.object_id ? await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [rule.object_id, req.user.companyId]) : { rows: [] };
    if (strictWorkflow && rule.conditions.length) {
      try {
        validateConditionConfig({ match: rule.action.match || "all", conditions: rule.conditions }, conditionFields.rows, "Automation conditions");
      } catch (error) {
        if (error instanceof ConditionError) return error.message;
        throw error;
      }
    }
    const normalizeDecisionCondition = (condition) => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) return condition;
      if (Array.isArray(condition.conditions)) return { ...condition, match: condition.match || condition.type || "all" };
      if (Array.isArray(condition.rules)) return { match: condition.match || condition.type || "all", conditions: condition.rules };
      return condition;
    };
    const workflowMatch = isWorkflow ? rule.action.match || "all" : null;
    if (isWorkflow && !["all", "any"].includes(workflowMatch)) return "Workflow actions require a match mode of all or any";
    if (isWorkflow) {
      const entryTransition = String(rule.action?.entryTransition || "EVERY_TIME").toUpperCase();
      if (!["EVERY_TIME","UPDATED_TO_MEET"].includes(entryTransition)) return "Workflow entry transition must be Every Time or Updated To Meet";
      if (strictWorkflow && entryTransition === "UPDATED_TO_MEET" && !rule.conditions.length) return "Updated To Meet requires at least one Start condition";
      if (strictWorkflow && entryTransition === "UPDATED_TO_MEET" && !["after_update","after_save","before_update","before_save","field_changed"].includes(rule.trigger_key)) {
        return "Updated To Meet can only be used with an update trigger";
      }
    }
    if (isWorkflow && strictWorkflow && (!Array.isArray(rule.action.actions) || !rule.action.actions.length)) return "Workflow actions require at least one action";
    const registryTypes = new Set(getWorkflowActionRegistry().map((definition) => definition.key));
    const legacyTypes = new Set(["validation", "set_field", "show_message", "SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP", "CALL_WEBHOOK", "HTTP_REQUEST", "workflow"]);
    const allowed = new Set([...registryTypes, ...legacyTypes]);
    const actions = isWorkflow ? (Array.isArray(rule.action.actions) ? rule.action.actions : []) : (Array.isArray(rule.action.actions) ? rule.action.actions : [rule.action]);
    if ((!actions.length && strictWorkflow) || actions.some((action) => !action || !allowed.has(action.type || action.key))) return "Automation contains an unsupported action";
    for (const action of actions) {
      try {
        if (action.type === "workflow") {
          if (!Array.isArray(action.actions) || !action.actions.length) throw new Error("Workflow actions require at least one action");
          continue;
        }
        if (!strictWorkflow) continue;
        validateWorkflowAction(action);
        if (String(action.type || action.key || "").toUpperCase() === "CONDITION") {
          const outcomes = Array.isArray(action.outcomes) ? action.outcomes : [];
          if (outcomes.length) {
            for (const outcome of outcomes) {
              validateConditionConfig(normalizeDecisionCondition(outcome.condition), conditionFields.rows, `Decision outcome "${outcome.label || outcome.id || "Outcome"}"`, { allowResources: true });
            }
          } else {
            validateConditionConfig(normalizeDecisionCondition(action.condition), conditionFields.rows, "Decision condition", { allowResources: true });
          }
        }
      } catch (error) {
        return error.message;
      }
    }
    if (isWorkflow && strictWorkflow) {
      const ids = actions.map((action) => action?.id).filter(Boolean).map(String);
      if (new Set(ids).size !== ids.length) return "Workflow element identifiers must be unique";
      const indexById = new Map(actions.map((action, index) => [String(action?.id || ""), index]).filter(([id]) => id));
      const claimedControlTargets = new Map();
      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        const actionType = String(action?.type || action?.key || "").toUpperCase();
        const faultMode = String(action?.faultMode || (Array.isArray(action?.faultBranch) && action.faultBranch.length ? "ROUTE" : "FAIL")).toUpperCase();
        if (!["FAIL","CONTINUE","STOP","ROUTE","RETRY"].includes(faultMode)) return `Action "${action.label || action.id || index + 1}" has an unsupported On Error behaviour`;
        if (faultMode === "RETRY" && (!Number.isFinite(Number(action.retryCount || 1)) || Number(action.retryCount || 1) < 1 || Number(action.retryCount || 1) > 3)) return `Action "${action.label || action.id || index + 1}" retry count must be between 1 and 3`;
        if (faultMode === "ROUTE" && (!Array.isArray(action.faultBranch) || !action.faultBranch.length)) return `Action "${action.label || action.id || index + 1}" requires at least one On Error path step`;
        const faultTargets = ["ROUTE","RETRY"].includes(faultMode) && Array.isArray(action.faultBranch) ? action.faultBranch.map(String) : [];
        for (const targetId of faultTargets) {
          if (!indexById.has(targetId)) return `Action "${action.label || action.id || index + 1}" error path references an action that no longer exists`;
          if (indexById.get(targetId) <= index) return `Action "${action.label || action.id || index + 1}" error path can only route to later actions`;
          const owner = claimedControlTargets.get(targetId);
          if (owner && owner !== String(action.id || index)) return `Action "${actions[indexById.get(targetId)]?.label || targetId}" is already controlled by another Decision, Loop or error path`;
          claimedControlTargets.set(targetId, String(action.id || index));
        }
        if (actionType === "CONDITION") {
          const outcomes = Array.isArray(action.outcomes) ? action.outcomes : [];
          if (outcomes.length) {
            const outcomeIds = outcomes.map((outcome) => String(outcome?.id || ""));
            if (new Set(outcomeIds).size !== outcomeIds.length) return `Decision "${action.label || action.id || index + 1}" has duplicate outcome identifiers`;
            const targetOwners = new Map();
            for (const outcome of outcomes) {
              const label = String(outcome?.label || "Outcome");
              const targets = Array.isArray(outcome?.branch) ? outcome.branch.map(String) : [];
              for (const targetId of targets) {
                if (!indexById.has(targetId)) return `Decision "${action.label || action.id || index + 1}" outcome "${label}" references an action that no longer exists`;
                if (indexById.get(targetId) <= index) return `Decision "${action.label || action.id || index + 1}" can only route to later actions`;
                if (targetOwners.has(targetId)) return `Decision "${action.label || action.id || index + 1}" assigns action "${actions[indexById.get(targetId)]?.label || targetId}" to more than one outcome`;
                targetOwners.set(targetId, label);
                const owner = claimedControlTargets.get(targetId);
                if (owner && owner !== String(action.id || index)) return `Action "${actions[indexById.get(targetId)]?.label || targetId}" is already controlled by another Decision or Loop`;
                claimedControlTargets.set(targetId, String(action.id || index));
              }
            }
            for (const targetId of Array.isArray(action.defaultBranch) ? action.defaultBranch.map(String) : []) {
              if (!indexById.has(targetId)) return `Decision "${action.label || action.id || index + 1}" Default path references an action that no longer exists`;
              if (indexById.get(targetId) <= index) return `Decision "${action.label || action.id || index + 1}" can only route to later actions`;
              if (targetOwners.has(targetId)) return `Decision "${action.label || action.id || index + 1}" assigns action "${actions[indexById.get(targetId)]?.label || targetId}" to an outcome and Default`;
              targetOwners.set(targetId, "Default");
              const owner = claimedControlTargets.get(targetId);
              if (owner && owner !== String(action.id || index)) return `Action "${actions[indexById.get(targetId)]?.label || targetId}" is already controlled by another Decision or Loop`;
              claimedControlTargets.set(targetId, String(action.id || index));
            }
          } else {
            const yes = Array.isArray(action.ifBranch) ? action.ifBranch.map(String) : [];
            const otherwise = Array.isArray(action.elseBranch) ? action.elseBranch.map(String) : [];
            for (const targetId of [...yes, ...otherwise]) {
              if (!indexById.has(targetId)) return `Decision "${action.label || action.id || index + 1}" references an action that no longer exists`;
              if (indexById.get(targetId) <= index) return `Decision "${action.label || action.id || index + 1}" can only route to later actions`;
              const owner = claimedControlTargets.get(targetId);
              if (owner && owner !== String(action.id || index)) return `Action "${actions[indexById.get(targetId)]?.label || targetId}" is already controlled by another Decision or Loop`;
              claimedControlTargets.set(targetId, String(action.id || index));
            }
            const overlap = yes.find((targetId) => otherwise.includes(targetId));
            if (overlap) return `Decision "${action.label || action.id || index + 1}" assigns the same action to both outcomes`;
          }
          continue;
        }
        if (actionType === "LOOP") {
          const body = Array.isArray(action.bodyBranch) ? action.bodyBranch.map(String) : [];
          for (const targetId of body) {
            if (!indexById.has(targetId)) return `Loop "${action.label || action.id || index + 1}" references an action that no longer exists`;
            if (indexById.get(targetId) <= index) return `Loop "${action.label || action.id || index + 1}" can only contain later actions`;
            const target = actions[indexById.get(targetId)];
            const owner = claimedControlTargets.get(targetId);
            if (owner && owner !== String(action.id || index)) return `Action "${target?.label || targetId}" is already controlled by another Decision, Loop, Scheduled Path or error path`;
            claimedControlTargets.set(targetId, String(action.id || index));
          }
        }
        if (actionType === "SCHEDULE_PATH") {
          const targets = Array.isArray(action.branch) ? action.branch.map(String) : [];
          if (!targets.length) return `Scheduled Path "${action.pathLabel || action.label || index + 1}" requires at least one later step`;
          for (const targetId of targets) {
            if (!indexById.has(targetId)) return `Scheduled Path "${action.pathLabel || action.label || index + 1}" references an action that no longer exists`;
            if (indexById.get(targetId) <= index) return `Scheduled Path "${action.pathLabel || action.label || index + 1}" can only route to later actions`;
            const owner = claimedControlTargets.get(targetId);
            if (owner && owner !== String(action.id || index)) return `Action "${actions[indexById.get(targetId)]?.label || targetId}" is already controlled by another Decision, Loop, Scheduled Path or error path`;
            claimedControlTargets.set(targetId, String(action.id || index));
          }
        }
      }
    }
    if (strictWorkflow && actions.some((action) => action.type === "set_field" && (typeof action.field !== "string" || action.value === undefined))) return "Each field update action requires a field and value";
    if (strictWorkflow && actions.some((action) => action.type === "show_message" && (!action.message || typeof action.message !== "string"))) return "Each message action requires a message";
    if (strictWorkflow && actions.some((action) => ["SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP"].includes(action.type) && (!action.templateId || !action.recipient))) return "Communication actions require a template and recipient";
    if (strictWorkflow && actions.some((action) => ["CALL_WEBHOOK", "HTTP_REQUEST"].includes(action.type) && (!action.connectorId || !action.endpoint))) return "Webhook actions require a connector and endpoint";
    if (isWorkflow) {
      const allowedContractTypes = new Set(["text","number","boolean","date","datetime","record","collection","object"]);
      for (const [kind, entries] of [["input", rule.action?.inputContract], ["output", rule.action?.outputContract]]) {
        const contract = Array.isArray(entries) ? entries : [];
        const names = new Set();
        for (const item of contract) {
          const name = String(item?.name || "");
          if (!name && !strictWorkflow) continue;
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name)) return `Subflow ${kind} names can only use letters, numbers and underscores`;
          if (names.has(name)) return `Subflow ${kind} "${name}" is declared more than once`;
          names.add(name);
          if (!allowedContractTypes.has(String(item?.type || "text").toLowerCase())) return `Subflow ${kind} "${name}" uses an unsupported type`;
          if (strictWorkflow && kind === "output" && !item?.source) return `Subflow output "${item?.label || name}" requires a Resource`;
        }
      }
      for (const subflowAction of actions.filter((action) => String(action?.type || action?.key || "").toUpperCase() === "RUN_SUBFLOW")) {
        const id = subflowAction.workflowId || subflowAction.subflowId;
        if (!id) continue;
        const childResult = await db(
          "SELECT id,name,action FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1",
          [id, req.user.companyId]
        );
        const child = childResult.rows[0];
        if (!child) return "Run Subflow references a workflow that is not available to this company";
        const contract = Array.isArray(child.action?.inputContract) ? child.action.inputContract : [];
        const mappings = subflowAction.workflowInputs || subflowAction.inputs || subflowAction.inputMap || subflowAction.mappings || {};
        const missing = contract.find((input) => input?.required === true && (mappings[input.name] === undefined || mappings[input.name] === null || mappings[input.name] === ""));
        if (strictWorkflow && missing) return `Run Subflow "${subflowAction.label || child.name}" is missing required input "${missing.label || missing.name}"`;
      }
    }
    if (rule.active) {
      for (const providerAction of actions.filter((action) => ["SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP"].includes(action.type))) {
        const configured = await hasConfiguredCommunicationProvider({ db, companyId: req.user.companyId, providerKind: providerAction.type.replace("SEND_", "") });
        if (!configured) return `${providerAction.type.replace("SEND_", "")} provider is not configured; configure the company integration before activating this workflow`;
      }
    }
    if (isWorkflow) {
      if (!strictWorkflow) return null;
      const fields = rule.object_id ? await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [rule.object_id, req.user.companyId]) : { rows: [] };
      for (const action of actions.filter((candidate) => candidate.type === "set_field")) {
        const field = fields.rows.find((candidate) => candidate.api_name === action.field);
        if (!field || field.active === false || field.writable === false || field.readable === false) return `Automation action field "${action.field}" is not writable`;
      }
      return null;
    }
    if (actions.some((action) => action.type === "validation")) {
      rule.action = { ...rule.action, type: "validation" };
    }
    if (actions.some((action) => action.type !== "validation")) {
      const fields = rule.object_id ? await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [rule.object_id, req.user.companyId]) : { rows: [] };
      for (const action of actions.filter((candidate) => candidate.type === "set_field")) {
        const field = fields.rows.find((candidate) => candidate.api_name === action.field);
        if (!field || field.active === false || field.writable === false || field.readable === false) return `Automation action field "${action.field}" is not writable`;
      }
    }
    if (!actions.some((action) => action.type === "validation")) return null;
    const bypassPermission = rule.action?.bypassPermission;
    if (bypassPermission) {
      const permission = await db("SELECT 1 FROM permissions WHERE code=$1 LIMIT 1", [bypassPermission]);
      if (!permission.rows.length) return "Validation bypass permission is not available";
    }
    return validationRuleError(rule, conditionFields.rows);
  }

  function workflowVersionDefinition(row) {
    return {
      object_id: row.object_id || null,
      name: row.name,
      trigger_key: row.trigger_key,
      conditions: row.conditions || [],
      action: row.action || {},
      active: row.active === true,
      lifecycle_status: row.lifecycle_status || (row.active ? "ACTIVE" : "DRAFT"),
      version: Number(row.version || 1),
    };
  }

  async function saveWorkflowVersion(row, userId = null) {
    if (!row?.id || row.action?.type !== "workflow") return null;
    const definition = workflowVersionDefinition(row);
    const result = await db(
      `INSERT INTO platform_workflow_versions
         (company_id,workflow_id,version,definition,lifecycle_status,created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6)
       ON CONFLICT (company_id,workflow_id,version) DO NOTHING
       RETURNING *`,
      [row.company_id, row.id, Number(row.version || 1), JSON.stringify(definition), definition.lifecycle_status, userId]
    );
    return result.rows[0] || null;
  }

  function evaluateWorkflowAssertions(debugData, assertions = [], context = {}) {
    const steps = Array.isArray(debugData?.steps) ? debugData.steps : [];
    const results = Array.isArray(debugData?.results) ? debugData.results : [];
    const traceByStep = new Map();
    for (const step of steps) {
      const id = String(step.step_identifier || "").split("@")[0];
      if (id && !traceByStep.has(id)) traceByStep.set(id, step);
      if (id && String(step.status || "").toUpperCase() === "FAILED") traceByStep.set(id, step);
    }
    const resultByStep = new Map();
    const flatten = (entries = []) => {
      for (const entry of entries) {
        const stepId = entry?.result?.stepId || entry?.stepId || null;
        if (stepId) resultByStep.set(String(stepId), entry.result);
        if (entry?.result?.branch?.results) flatten(entry.result.branch.results);
        if (entry?.result?.faultBranch?.results) flatten(entry.result.faultBranch.results);
        if (entry?.result?.scheduledBranch?.results) flatten(entry.result.scheduledBranch.results);
        for (const iteration of entry?.result?.iterations || []) flatten(iteration?.results || []);
      }
    };
    flatten(results);
    const checks = (Array.isArray(assertions) ? assertions : []).map((assertion, index) => {
      const type = String(assertion?.type || "RUN_STATUS").toUpperCase();
      let actual;
      let passed = false;
      if (type === "RUN_STATUS") {
        actual = String(debugData?.status || "");
        passed = actual === String(assertion.expected || "COMPLETED").toUpperCase();
      } else if (type === "STEP_STATUS") {
        actual = String(traceByStep.get(String(assertion.stepId || ""))?.status || "NOT_RUN").toUpperCase();
        passed = actual === String(assertion.expected || "COMPLETED").toUpperCase();
      } else if (type === "DECISION_OUTCOME") {
        const step = traceByStep.get(String(assertion.stepId || ""));
        const result = resultByStep.get(String(assertion.stepId || "")) || step?.metadata?.result || {};
        const isDefaultOutcome = result?.outcomeId == null && (result?.outcomeLabel != null || result?.branch?.outcome != null);
        actual = isDefaultOutcome ? "__DEFAULT__" : (result?.outcomeId ?? result?.outcomeLabel ?? result?.branch?.outcome ?? null);
        const expected = String(assertion.expected ?? "");
        passed = isDefaultOutcome
          ? ["__DEFAULT__", "Default", "Default Outcome"].includes(expected)
          : String(actual ?? "") === expected;
      } else if (type === "RESOURCE_EQUALS" || type === "RESOURCE_CONDITION") {
        actual = resolveWorkflowResource(assertion.resource, {
          record: context.record || null,
          previousRecord: context.previousRecord || null,
          user: context.user || null,
          variables: debugData?.variables || {},
        });
        const expected = assertion.expected;
        const operator = type === "RESOURCE_EQUALS" ? "equals" : String(assertion.operator || "equals");
        const empty = (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0);
        const compare = (left, right) => {
          if (left != null && typeof left === "object") return JSON.stringify(left) === JSON.stringify(right);
          if (Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && String(left).trim() !== "" && String(right).trim() !== "") {
            const a = Number(left), b = Number(right);
            if (operator === "greater_than") return a > b;
            if (operator === "greater_than_or_equal") return a >= b;
            if (operator === "less_than") return a < b;
            if (operator === "less_than_or_equal") return a <= b;
            return operator === "not_equals" ? a !== b : a === b;
          }
          const a = String(left ?? ""), b = String(right ?? "");
          if (operator === "greater_than") return a > b;
          if (operator === "greater_than_or_equal") return a >= b;
          if (operator === "less_than") return a < b;
          if (operator === "less_than_or_equal") return a <= b;
          return operator === "not_equals" ? a !== b : a === b;
        };
        if (operator === "is_empty") passed = empty(actual);
        else if (operator === "is_not_empty") passed = !empty(actual);
        else passed = compare(actual, expected);
      } else {
        actual = "Unsupported assertion";
      }
      return { index, type, passed, expected: assertion?.expected, actual, operator: assertion?.operator || (type === "RESOURCE_EQUALS" ? "equals" : null), label: assertion?.label || null, stepId: assertion?.stepId || null, resource: assertion?.resource || null };
    });
    return { passed: checks.every((check) => check.passed), checks };
  }

  async function runWorkflowDebugRequest(req, res, workflowId = null) {
    let client = null;
    let run = null;
    const executionMode = String(req.body?.mode || "debug").toLowerCase() === "test" ? "TEST" : "DEBUG";
    try {
      const definition = req.body?.definition && typeof req.body.definition === "object" ? req.body.definition : null;
      let workflow = null;
      if (definition) {
        const resolvedObject = definition.objectId || definition.objectKey
          ? await getObject(definition.objectId || definition.objectKey, req)
          : null;
        if ((definition.objectId || definition.objectKey) && !resolvedObject) {
          return res.status(400).json({ success: false, message: "Debug object is not available" });
        }
        workflow = {
          id: workflowId || null,
          name: String(definition.name || "Unsaved workflow"),
          object_id: resolvedObject?.id || null,
          trigger_key: String(definition.triggerKey || "manual"),
          conditions: Array.isArray(definition.conditions) ? definition.conditions : [],
          action: definition.action || {},
          version: Number(definition.version || 1),
        };
        const draftError = await checkRule(req, {
          object_id: workflow.object_id,
          name: workflow.name,
          trigger_key: workflow.trigger_key,
          conditions: workflow.conditions,
          action: workflow.action,
          active: false,
          lifecycle_status: "DRAFT",
          version: workflow.version,
        }, { strict: true });
        if (draftError) return res.status(400).json({ success: false, message: `Debug cannot start: ${draftError}` });
      } else {
        if (!workflowId) return res.status(400).json({ success: false, message: "Debug requires a workflow definition" });
        const workflowResult = await db(
          "SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1",
          [workflowId, req.user.companyId]
        );
        workflow = workflowResult.rows[0] || null;
        if (!workflow) return res.status(404).json({ success: false, message: "Workflow not found" });
        workflow = workflowAuthoringRow(workflow);
      }

      const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
      if (!actions.length) return res.status(422).json({ success: false, message: "Workflow contains no executable steps" });
      const flowType = String(workflow.action?.flowType || "");
      const requestedRollback = req.body?.rollback ?? req.body?.debugOptions?.rollbackMode;
      const rollbackMode = executionMode === "TEST"
        ? (flowType === "record" || requestedRollback !== false)
        : requestedRollback === true;


      let object = null;
      let record = null;
      let recordIsPersisted = false;
      let fields = [];
      const recordOverride = req.body?.recordOverride && typeof req.body.recordOverride === "object" && !Array.isArray(req.body.recordOverride)
        ? req.body.recordOverride
        : null;
      if (workflow.object_id) {
        const objectResult = await db(
          "SELECT * FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1",
          [workflow.object_id, req.user.companyId]
        );
        object = objectResult.rows[0] || null;
        if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
          return res.status(422).json({ success: false, message: "Workflow object is unavailable" });
        }
        const fieldsResult = await db(
          "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
          [object.id, req.user.companyId]
        );
        fields = fieldsResult.rows || [];
        if (recordOverride) {
          // Debug/Test may use a synthetic trigger record. It is never inserted
          // into the source object and every workflow-side mutation still runs
          // inside the Debug transaction, which is rolled back below.
          record = { ...recordOverride };
        } else {
          const clauses = [];
          const params = [];
          const requestedRecordId = req.body?.recordId ? String(req.body.recordId) : null;
          if (requestedRecordId) {
            if (!recordIdIsValid(requestedRecordId)) return res.status(400).json({ success: false, message: "Choose a valid record for Debug" });
            params.push(requestedRecordId);
            clauses.push(`id=${params.length}`);
          }
          if (object.company_scoped !== false) {
            params.push(req.user.companyId);
            clauses.push(`company_id=${params.length}`);
          }
          if (object.store_scoped) {
            if (!req.user.storeId) return res.status(409).json({ success: false, message: "Select a store before debugging this store-scoped workflow" });
            params.push(req.user.storeId);
            clauses.push(`store_id=${params.length}`);
          }
          const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
          const hasCreatedAt = await db(
            "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name='created_at' LIMIT 1",
            [object.source_table]
          );
          const orderBy = requestedRecordId ? "" : (hasCreatedAt.rows.length ? " ORDER BY created_at DESC" : "");
          const recordResult = await db(`SELECT * FROM "${object.source_table}"${where}${orderBy} LIMIT 1`, params);
          record = recordResult.rows[0] || null;
          recordIsPersisted = Boolean(record);
          if (!record) {
            return res.status(404).json({ success: false, message: requestedRecordId ? "The selected Debug record was not found in this company/store" : "No record is available to test this workflow yet" });
          }
        }
      }

      if (!workflow.object_id && recordOverride) record = { ...recordOverride };

      for (const action of actions) validateWorkflowAction(action);

      run = await createWorkflowRun({
        db,
        companyId: req.user.companyId,
        workflowId: workflow.id || null,
        workflowName: workflow.name,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
        objectId: object?.id || null,
        recordId: record?.id || null,
        triggerKey: executionMode,
        status: "RUNNING",
        metadata: {
          debug: executionMode === "DEBUG",
          test: executionMode === "TEST",
          dryRun: rollbackMode,
          rollbackMode,
          unsavedDefinition: Boolean(definition),
          rolledBack: false,
          actorUserId: req.user.id || null,
          recordSource: recordOverride ? "override" : req.body?.recordId ? "selected" : object ? "latest" : "none",
        },
      });

      if (record && Array.isArray(workflow.conditions) && workflow.conditions.length && req.body?.skipStartConditionRequirements !== true) {
        const startMatched = evaluateCondition(
          { match: workflow.action?.match || "all", conditions: workflow.conditions },
          fields,
          record,
          null
        );
        if (!startMatched) {
          const friendly = {
            title: "This record does not meet the Start conditions",
            whatHappened: "Debug stopped before the first step because the selected record does not match the workflow's entry conditions.",
            howToFix: "Choose another record, or review the Start conditions if this record should enter the workflow.",
          };
          await db(
            "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3",
            [JSON.stringify({ debug: executionMode === "DEBUG", test: executionMode === "TEST", dryRun: rollbackMode, rollbackMode, rolledBack: rollbackMode, startMatched: false, friendlyError: friendly }), run.id, req.user.companyId]
          );
          const notStartedData = { status: "NOT_STARTED", run, steps: [], results: [], record: { id: record.id }, friendlyError: friendly, rolledBack: rollbackMode, externalActionsSimulated: rollbackMode, variables: { variables: {}, steps: {} } };
          const assertions = Array.isArray(req.body?.assertions) ? req.body.assertions : [];
          const assertionResult = evaluateWorkflowAssertions(notStartedData, assertions, { record, user: req.user });
          const testPassed = executionMode === "TEST" && assertions.length ? assertionResult.passed : null;
          return res.json({ success: true, data: { ...notStartedData, assertionResult, testPassed } });
        }
      }

      if (rollbackMode) {
        client = await pool.connect();
        await client.query("BEGIN");
      }
      const executionDb = rollbackMode ? ((query, params = []) => client.query(query, params)) : db;
      let results = [];
      let debugError = null;
      const declaredInputs = Array.isArray(workflow.action?.inputContract) ? workflow.action.inputContract : [];
      const suppliedInputs = req.body?.inputs && typeof req.body.inputs === "object" && !Array.isArray(req.body.inputs) ? req.body.inputs : {};
      const inputVariables = {};
      for (const input of declaredInputs) {
        const name = String(input?.name || "").trim();
        if (!name) continue;
        const hasValue = Object.prototype.hasOwnProperty.call(suppliedInputs, name);
        const value = hasValue ? suppliedInputs[name] : input?.defaultValue;
        if (input?.required === true && (value === undefined || value === null || String(value).trim() === "")) {
          throw Object.assign(new Error(`${executionMode === "TEST" ? "Test" : "Debug"} input ${input.label || name} is required`), { status: 422 });
        }
        if (value !== undefined) inputVariables[name] = value;
      }
      const workflowVariables = { variables: inputVariables, steps: {} };
      try {
        results = await executeWorkflowActions({
          actions,
          db: executionDb,
          traceDb: db,
          pool,
          req,
          object,
          fields,
          record,
          recordId: record?.id || null,
          companyId: req.user.companyId,
          runId: run?.id || null,
          workflowVersion: Number(workflow.draft_version || workflow.version || workflow.active_version || 1),
          trigger: executionMode,
          debugMode: rollbackMode,
          debugWaitElementBehavior: executionMode === "TEST" && req.body?.debugWaitElementBehavior === true,
          debugWaitPaths: req.body?.debugWaitPaths && typeof req.body.debugWaitPaths === "object" ? req.body.debugWaitPaths : {},
          workflowVariables,
        });
      } catch (error) {
        debugError = error;
      }
      if (client) {
        await client.query("ROLLBACK");
        client.release();
        client = null;
      }

      const finalStatus = debugError ? "FAILED" : "COMPLETED";
      const friendly = debugError ? friendlyWorkflowError(debugError) : null;
      await db(
        `UPDATE platform_workflow_runs
            SET status=$1,
                completed_at=NOW(),
                error_text=$2,
                metadata=COALESCE(metadata,'{}'::jsonb)||$3::jsonb,
                updated_at=NOW()
          WHERE id=$4 AND company_id=$5`,
        [
          finalStatus,
          debugError ? String(debugError?.message || debugError).slice(0, 2000) : null,
          JSON.stringify({ debug: executionMode === "DEBUG", test: executionMode === "TEST", dryRun: rollbackMode, rollbackMode, rolledBack: rollbackMode, startMatched: true, friendlyError: friendly }),
          run.id,
          req.user.companyId,
        ]
      );
      const [runResult, stepResult] = await Promise.all([
        db("SELECT * FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1", [run.id, req.user.companyId]),
        db("SELECT * FROM platform_workflow_step_runs WHERE run_id=$1 ORDER BY step_order,created_at,id", [run.id]),
      ]);
      const handledFaults = (stepResult.rows || [])
        .filter((step) => step.metadata?.result?.faultHandled === true)
        .map((step) => ({
          stepId: String(step.step_identifier || "").split("@")[0],
          actionType: step.action_type || null,
          mode: step.metadata?.result?.mode || null,
          error: step.metadata?.friendlyError || step.metadata?.result?.friendlyError || (step.error_text ? { title: "This step failed but its error path handled the failure", whatHappened: step.error_text } : null),
        }));
      const resourceHistory = (stepResult.rows || [])
        .filter((step) => step.metadata?.resourceSnapshot)
        .map((step) => ({
          stepId: String(step.step_identifier || "").split("@")[0],
          actionType: step.action_type || null,
          status: step.status,
          snapshot: step.metadata.resourceSnapshot,
        }));
      const debugData = {
        status: finalStatus,
        run: runResult.rows[0] || run,
        steps: stepResult.rows || [],
        results,
        record: record ? { id: record.id } : null,
        friendlyError: friendly,
        handledFaults: debugError ? [] : handledFaults,
        completedWithHandledError: !debugError && handledFaults.length > 0,
        rolledBack: rollbackMode,
        externalActionsSimulated: rollbackMode,
        variables: workflowVariables,
        resourceHistory,
      };
      const assertions = Array.isArray(req.body?.assertions) ? req.body.assertions : [];
      const assertionResult = evaluateWorkflowAssertions(debugData, assertions, { record, user: req.user });
      const testPassed = executionMode === "TEST" && assertions.length ? assertionResult.passed : null;
      return res.json({
        success: true,
        data: {
          ...debugData,
          assertionResult,
          testPassed,
        },
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
      }
      if (run?.id) {
        await db(
          "UPDATE platform_workflow_runs SET status='FAILED',completed_at=NOW(),error_text=$1,metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW() WHERE id=$3 AND company_id=$4",
          [
            String(error?.message || error).slice(0, 2000),
            JSON.stringify({ debug: executionMode === "DEBUG", test: executionMode === "TEST", dryRun: rollbackMode, rollbackMode, rolledBack: rollbackMode, friendlyError: friendlyWorkflowError(error) }),
            run.id,
            req.user.companyId,
          ]
        ).catch(() => {});
      }
      console.error("Workflow debug error:", error);
      return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to run workflow Debug" });
    }
  }

  const loadScreenFlowRuntime = async (session, req) => {
    const runResult = await db(
      "SELECT * FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1",
      [session.run_id, req.user.companyId]
    );
    const run = runResult.rows[0] || null;
    if (!run) throw Object.assign(new Error("Screen Flow run no longer exists"), { status: 404 });

    const workflowResult = await db(
      "SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1",
      [run.workflow_id, req.user.companyId]
    );
    let workflow = workflowResult.rows[0] || null;
    if (!workflow) throw Object.assign(new Error("Screen Flow definition no longer exists"), { status: 404 });

    const pinnedVersion = Number(run.workflow_version || workflow.active_version || workflow.version || 1);
    const versionResult = await db(
      "SELECT definition FROM platform_workflow_versions WHERE company_id=$1 AND workflow_id=$2 AND version=$3 LIMIT 1",
      [req.user.companyId, workflow.id, pinnedVersion]
    );
    if (versionResult.rows[0]?.definition && typeof versionResult.rows[0].definition === "object") {
      workflow = { ...workflow, ...versionResult.rows[0].definition, id: workflow.id, company_id: workflow.company_id };
    }

    let object = null;
    let record = null;
    let fields = [];
    if (run.object_id) {
      const objectResult = await db(
        "SELECT * FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [run.object_id, req.user.companyId]
      );
      object = objectResult.rows[0] || null;
      if (object?.id) {
        const fieldsResult = await db(
          "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
          [object.id, req.user.companyId]
        );
        fields = fieldsResult.rows || [];
      }
      if (object?.source_table && run.record_id) {
        if (!isSafeIdentifier(object.source_table)) throw Object.assign(new Error("Screen Flow record source is invalid"), { status: 422 });
        const params = [run.record_id];
        let where = "id=$1";
        if (object.company_scoped !== false) {
          params.push(req.user.companyId);
          where += ` AND company_id=$${params.length}`;
        }
        if (object.store_scoped) {
          if (!req.user.storeId) throw Object.assign(new Error("A store session is required for this Screen Flow record"), { status: 403 });
          params.push(req.user.storeId);
          where += ` AND store_id=$${params.length}`;
        }
        const recordResult = await db(`SELECT * FROM "${object.source_table}" WHERE ${where} LIMIT 1`, params);
        record = recordResult.rows[0] || null;
      }
    }

    return {
      run,
      workflow,
      pinnedVersion,
      actions: Array.isArray(workflow.action?.actions) ? workflow.action.actions : [],
      object,
      record,
      fields,
    };
  };

  const mergeScreenInputValues = (screen, values = {}, workflowVariables = {}) => {
    const next = workflowVariables && typeof workflowVariables === "object"
      ? JSON.parse(JSON.stringify(workflowVariables))
      : { variables: {}, steps: {} };
    if (!next.variables || typeof next.variables !== "object") next.variables = {};
    if (!next.steps || typeof next.steps !== "object") next.steps = {};
    for (const component of Array.isArray(screen?.components) ? screen.components : []) {
      const name = String(component?.name || "").trim();
      if (!name || component?.input === false || !Object.prototype.hasOwnProperty.call(values || {}, name)) continue;
      next.variables[name] = values[name];
    }
    return next;
  };

  const validateScreenSubmission = (screen, values = {}) => {
    const errors = {};
    const resourceValue = (path) => {
      if (!path) return undefined;
      const raw = String(path);
      if (raw.startsWith("variables.")) return raw.slice("variables.".length).split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], values);
      if (Object.prototype.hasOwnProperty.call(values || {}, raw)) return values[raw];
      return undefined;
    };
    const isVisible = (component) => {
      if (component?.visible === false) return false;
      if (!component?.visibilityResource) return true;
      const localValue = resourceValue(component.visibilityResource);
      const actual = localValue === undefined ? component.visibilityInitialValue : localValue;
      const operator = component.visibilityOperator || "truthy";
      const expected = component.visibilityValue;
      const empty = actual == null || actual === "" || (Array.isArray(actual) && actual.length === 0);
      const falsy = empty || actual === false;
      if (operator === "falsy") return falsy;
      if (operator === "is_empty") return empty;
      if (operator === "is_not_empty") return !empty;
      if (operator === "equals") return String(actual ?? "") === String(expected ?? "");
      if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
      if (operator === "contains") return Array.isArray(actual) ? actual.map(String).includes(String(expected ?? "")) : String(actual ?? "").includes(String(expected ?? ""));
      if (operator === "not_contains") return Array.isArray(actual) ? !actual.map(String).includes(String(expected ?? "")) : !String(actual ?? "").includes(String(expected ?? ""));
      if (["greater_than","greater_or_equal","less_than","less_or_equal"].includes(operator)) {
        const left = Number(actual);
        const right = Number(expected);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
        if (operator === "greater_than") return left > right;
        if (operator === "greater_or_equal") return left >= right;
        if (operator === "less_than") return left < right;
        return left <= right;
      }
      return !falsy;
    };
    for (const component of Array.isArray(screen?.components) ? screen.components : []) {
      const name = String(component?.name || "").trim();
      if (!name || component?.input === false) continue;
      const value = values?.[name];
      if (!isVisible(component)) continue;
      const empty = value === undefined
        || value === null
        || value === ""
        || (Array.isArray(value) && value.length === 0)
        || (["CHECKBOX","TOGGLE"].includes(component?.type) && value !== true)
        || (component?.type === "ADDRESS" && value && typeof value === "object" && !Array.isArray(value)
          && !Object.values(value).some((part) => String(part ?? "").trim()));
      if (component?.required === true && empty) {
        errors[name] = component.requiredMessage || `${component.label || name} is required`;
        continue;
      }
      if (!empty && component?.type === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        errors[name] = component.validationMessage || "Enter a valid email address";
      }
      if (!empty && ["NUMBER","SLIDER"].includes(component?.type)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) errors[name] = component.validationMessage || "Enter a valid number";
        if (Number.isFinite(numeric) && component.min !== "" && component.min != null && numeric < Number(component.min)) errors[name] = component.validationMessage || `Enter a value of at least ${component.min}`;
        if (Number.isFinite(numeric) && component.max !== "" && component.max != null && numeric > Number(component.max)) errors[name] = component.validationMessage || `Enter a value no greater than ${component.max}`;
      }
      if (!empty && ["TEXT","TEXT_AREA","EMAIL","PASSWORD"].includes(component?.type)) {
        const length = String(value).length;
        if (component.minLength !== "" && component.minLength != null && length < Number(component.minLength)) errors[name] = component.validationMessage || `Enter at least ${component.minLength} characters`;
        if (component.maxLength !== "" && component.maxLength != null && length > Number(component.maxLength)) errors[name] = component.validationMessage || `Enter no more than ${component.maxLength} characters`;
      }
      if (!empty && component?.pattern) {
        try {
          if (!(new RegExp(component.pattern)).test(String(value))) errors[name] = component.validationMessage || "The value is not valid";
        } catch {}
      }
      if (!errors[name] && String(component?.validationFormula || "").trim()) {
        try {
          const formulaInputs = {};
          for (const [inputName, inputValue] of Object.entries(values || {})) {
            if (/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(inputName))) formulaInputs[inputName] = inputValue;
          }
          const valid = evaluateWorkflowFormula(String(component.validationFormula), formulaInputs);
          if (valid !== true) errors[name] = component.validationMessage || `${component.label || name} is not valid`;
        } catch {
          errors[name] = component.validationMessage || "The validation formula could not be evaluated";
        }
      }
    }
    return errors;
  };

  router.post("/platform/recommendations/reactions", authenticate, async (req, res) => {
    try {
      const recommendationKey = String(req.body?.recommendationKey || req.body?.recommendation_key || "").trim();
      const reaction = String(req.body?.reaction || "").trim().toUpperCase();
      if (!recommendationKey) return res.status(400).json({ success: false, message: "recommendationKey is required" });
      if (!["ACCEPTED","REJECTED"].includes(reaction)) return res.status(400).json({ success: false, message: "reaction must be ACCEPTED or REJECTED" });

      const objectId = req.body?.objectId || req.body?.object_id || null;
      const recordId = req.body?.recordId || req.body?.record_id || null;
      const workflowId = req.body?.workflowId || req.body?.workflow_id || null;

      if (workflowId) {
        const workflowResult = await db("SELECT id FROM platform_rules WHERE id=$1 AND company_id=$2 LIMIT 1", [workflowId, req.user.companyId]);
        if (!workflowResult.rows.length) return res.status(404).json({ success: false, message: "Workflow not found" });
      }
      if (objectId) {
        const objectResult = await db("SELECT id FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1", [objectId, req.user.companyId]);
        if (!objectResult.rows.length) return res.status(404).json({ success: false, message: "Object not found" });
      }

      const result = await db(
        `INSERT INTO platform_recommendation_reactions
           (company_id,recommendation_key,reaction,user_id,object_id,record_id,workflow_id,metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         RETURNING id,recommendation_key,reaction,user_id,object_id,record_id,workflow_id,reacted_at`,
        [
          req.user.companyId,
          recommendationKey,
          reaction,
          req.user.id || null,
          objectId,
          recordId,
          workflowId,
          JSON.stringify(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
        ]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Recommendation reaction record error:", error);
      return res.status(500).json({ success: false, message: "Unable to record recommendation response" });
    }
  });

  router.get("/platform/flow-sessions/:sessionId", ...workflowExecute, async (req, res) => {
    try {
      const result = await db(
        `SELECT id,workflow_id,run_id,step_run_id,step_identifier,status,screen,values,history,expires_at,submitted_at,created_at,updated_at
           FROM platform_workflow_screen_sessions
          WHERE id=$1 AND company_id=$2 AND (actor_user_id IS NULL OR actor_user_id=$3)
          LIMIT 1`,
        [req.params.sessionId, req.user.companyId, req.user.id || null]
      );
      const session = result.rows[0] || null;
      if (!session) return res.status(404).json({ success: false, message: "Screen session not found" });
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now() && session.status === "ACTIVE") {
        await db("UPDATE platform_workflow_screen_sessions SET status='EXPIRED',updated_at=NOW() WHERE id=$1", [session.id]);
        session.status = "EXPIRED";
      }
      const previousResult = session.status === "ACTIVE"
        ? await db(
            `SELECT id FROM platform_workflow_screen_sessions
              WHERE run_id=$1 AND company_id=$2 AND status='COMPLETED' AND created_at < $3
              ORDER BY created_at DESC LIMIT 1`,
            [session.run_id, req.user.companyId, session.created_at]
          )
        : { rows: [] };
      session.screen = {
        ...(session.screen || {}),
        allowBack: session.screen?.allowBack !== false && Boolean(previousResult.rows?.[0]),
      };
      return res.json({ success: true, data: session });
    } catch (error) {
      console.error("Screen Flow session load error:", error);
      return res.status(500).json({ success: false, message: "Unable to load Screen Flow session" });
    }
  });

  router.post("/platform/flow-sessions/:sessionId/resume", ...workflowExecute, async (req, res) => {
    try {
      const result = await db(
        "SELECT * FROM platform_workflow_screen_sessions WHERE id=$1 AND company_id=$2 AND (actor_user_id IS NULL OR actor_user_id=$3) LIMIT 1",
        [req.params.sessionId, req.user.companyId, req.user.id || null]
      );
      const session = result.rows[0] || null;
      if (!session) return res.status(404).json({ success: false, message: "Screen session not found" });
      if (session.status !== "PAUSED") return res.status(409).json({ success: false, message: "Screen session is not paused" });
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        await db("UPDATE platform_workflow_screen_sessions SET status='EXPIRED',updated_at=NOW() WHERE id=$1", [session.id]);
        return res.status(410).json({ success: false, message: "Screen session has expired" });
      }
      const resumed = await db(
        "UPDATE platform_workflow_screen_sessions SET status='ACTIVE',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='PAUSED' RETURNING id",
        [session.id, req.user.companyId]
      );
      if (!resumed.rows?.[0]) return res.status(409).json({ success: false, message: "Screen session was already resumed" });
      await db(
        "UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [session.run_id, req.user.companyId]
      );
      return res.json({ success: true, data: { id: session.id, status: "ACTIVE", screen: session.screen || {}, values: session.values || {} } });
    } catch (error) {
      console.error("Screen Flow resume error:", error);
      return res.status(500).json({ success: false, message: "Unable to resume Screen Flow" });
    }
  });

    router.post("/platform/flow-sessions/:sessionId/submit", ...workflowExecute, async (req, res) => {
    let processingClaimed = false;
    try {
      const sessionResult = await db(
        "SELECT * FROM platform_workflow_screen_sessions WHERE id=$1 AND company_id=$2 AND (actor_user_id IS NULL OR actor_user_id=$3) LIMIT 1",
        [req.params.sessionId, req.user.companyId, req.user.id || null]
      );
      const session = sessionResult.rows[0] || null;
      if (!session) return res.status(404).json({ success: false, message: "Screen session not found" });
      if (session.status !== "ACTIVE") return res.status(409).json({ success: false, message: `Screen session is ${String(session.status || "closed").toLowerCase()}` });
      if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        await db("UPDATE platform_workflow_screen_sessions SET status='EXPIRED',updated_at=NOW() WHERE id=$1", [session.id]);
        return res.status(410).json({ success: false, message: "Screen session has expired" });
      }

      const navigation = String(req.body?.navigation || "NEXT").toUpperCase();
      if (!["NEXT","FINISH","BACK","PAUSE"].includes(navigation)) return res.status(400).json({ success: false, message: "Invalid Screen Flow navigation action" });
      if (navigation === "NEXT" && session.screen?.allowNext === false) return res.status(409).json({ success: false, message: "Next is not available for this screen" });
      if (navigation === "FINISH" && session.screen?.allowFinish !== true) return res.status(409).json({ success: false, message: "Finish is not available for this screen" });

      if (navigation === "PAUSE") {
        if (session.screen?.allowPause !== true) return res.status(409).json({ success: false, message: "Pause is not available for this screen" });
        const values = req.body?.values && typeof req.body.values === "object" && !Array.isArray(req.body.values) ? req.body.values : {};
        const pausedVariables = mergeScreenInputValues(session.screen || {}, values, session.workflow_variables);
        const paused = await db(
          "UPDATE platform_workflow_screen_sessions SET status='PAUSED',values=$1::jsonb,workflow_variables=$2::jsonb,updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status='ACTIVE' RETURNING id",
          [JSON.stringify(values), JSON.stringify(pausedVariables), session.id, req.user.companyId]
        );
        if (!paused.rows?.[0]) return res.status(409).json({ success: false, message: "Screen session was already submitted" });
        await db(
          "UPDATE platform_workflow_runs SET status='PAUSED',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
          [session.run_id, req.user.companyId]
        );
        return res.json({ success: true, data: { status: "PAUSED", runId: session.run_id, screenSessionId: session.id, screen: session.screen, values, navigation: "PAUSE" } });
      }

      if (navigation === "BACK") {
        if (session.screen?.allowBack === false) return res.status(409).json({ success: false, message: "Back navigation is not available" });
        const previousResult = await db(
          `SELECT * FROM platform_workflow_screen_sessions
            WHERE run_id=$1 AND company_id=$2 AND status='COMPLETED' AND created_at < $3
            ORDER BY created_at DESC LIMIT 1`,
          [session.run_id, req.user.companyId, session.created_at]
        );
        const previous = previousResult.rows?.[0] || null;
        if (!previous) return res.status(409).json({ success: false, message: "Back navigation is not available" });

        const backValues = req.body?.values && typeof req.body.values === "object" && !Array.isArray(req.body.values) ? req.body.values : {};
        const backVariables = mergeScreenInputValues(session.screen || {}, backValues, session.workflow_variables);
        const backed = await db(
          "UPDATE platform_workflow_screen_sessions SET status='CANCELLED_BACK',values=$1::jsonb,workflow_variables=$2::jsonb,updated_at=NOW() WHERE id=$3 AND company_id=$4 AND status='ACTIVE' RETURNING id",
          [JSON.stringify(backValues), JSON.stringify(backVariables), session.id, req.user.companyId]
        );
        if (!backed.rows?.[0]) return res.status(409).json({ success: false, message: "Screen session was already submitted" });
        if (session.step_run_id) {
          await db(
            "UPDATE platform_workflow_step_runs SET status='PENDING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND run_id=$2",
            [session.step_run_id, session.run_id]
          );
        }
        await db(
          "UPDATE platform_workflow_screen_sessions SET status='ACTIVE',submitted_at=NULL,workflow_variables=$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3",
          [JSON.stringify(backVariables), previous.id, req.user.companyId]
        );
        if (previous.step_run_id) {
          await db(
            "UPDATE platform_workflow_step_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND run_id=$2",
            [previous.step_run_id, previous.run_id]
          );
        }
        await db(
          "UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
          [session.run_id, req.user.companyId]
        );
        const earlierResult = await db(
          `SELECT id FROM platform_workflow_screen_sessions
            WHERE run_id=$1 AND company_id=$2 AND status='COMPLETED' AND created_at < $3
            ORDER BY created_at DESC LIMIT 1`,
          [previous.run_id, req.user.companyId, previous.created_at]
        );
        return res.json({
          success: true,
          data: {
            status: "WAITING",
            screenSessionId: previous.id,
            screen: { ...(previous.screen || {}), allowBack: previous.screen?.allowBack !== false && Boolean(earlierResult.rows?.[0]) },
            values: previous.values || {},
            navigation: "BACK",
          },
        });
      }

      const values = req.body?.values && typeof req.body.values === "object" && !Array.isArray(req.body.values) ? req.body.values : {};
      const errors = validateScreenSubmission(session.screen || {}, values);
      if (Object.keys(errors).length) return res.status(422).json({ success: false, message: "Complete the required screen values", errors });

      const claimed = await db(
        "UPDATE platform_workflow_screen_sessions SET status='PROCESSING',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='ACTIVE' RETURNING id",
        [session.id, req.user.companyId]
      );
      if (!claimed.rows?.[0]) return res.status(409).json({ success: false, message: "Screen session was already submitted" });
      processingClaimed = true;

      const runtime = await loadScreenFlowRuntime(session, req);
      const workflowVariables = mergeScreenInputValues(session.screen || {}, values, session.workflow_variables);

      const historyEntry = { screen: session.screen || {}, values, submittedAt: new Date().toISOString() };
      await db(
        `UPDATE platform_workflow_screen_sessions
            SET status='COMPLETED',values=$1::jsonb,workflow_variables=$2::jsonb,
                history=(COALESCE(history,'[]'::jsonb) || $3::jsonb),submitted_at=NOW(),updated_at=NOW()
          WHERE id=$4 AND company_id=$5`,
        [JSON.stringify(values), JSON.stringify(workflowVariables), JSON.stringify([historyEntry]), session.id, req.user.companyId]
      );
      processingClaimed = false;

      if (session.step_run_id) {
        await db(
          `UPDATE platform_workflow_step_runs
              SET status='COMPLETED',completed_at=NOW(),
                  metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW()
            WHERE id=$2 AND run_id=$3`,
          [JSON.stringify({ screenSessionId: session.id, result: { status: "completed", values, navigation } }), session.step_run_id, session.run_id]
        );
      }
      await db(
        "UPDATE platform_workflow_runs SET status='RUNNING',completed_at=NULL,error_text=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [session.run_id, req.user.companyId]
      );

      if (navigation === "FINISH") {
        await db(
          `UPDATE platform_workflow_runs
              SET status='COMPLETED',completed_at=NOW(),
                  metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW()
            WHERE id=$2 AND company_id=$3`,
          [JSON.stringify({ finalVariables: workflowVariables, screenNavigation: "FINISH" }), session.run_id, req.user.companyId]
        );
        return res.json({
          success: true,
          data: {
            status: "COMPLETED",
            runId: session.run_id,
            screenSessionId: null,
            screen: null,
            values: {},
            navigation: "FINISH",
            variables: workflowVariables,
          },
        });
      }

      const results = await executeWorkflowActions({
        actions: runtime.actions,
        allActions: runtime.actions,
        db,
        req,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        object: runtime.object,
        fields: runtime.fields,
        record: runtime.record,
        previousRecord: runtime.run.metadata?.initialPreviousRecord || null,
        recordId: runtime.run.record_id || null,
        storeId: req.user.storeId || null,
        tillId: req.user.tillId || null,
        runId: session.run_id,
        workflowVersion: runtime.pinnedVersion,
        trigger: runtime.run.trigger_key || runtime.workflow.trigger_key,
        workflowVariables,
      });

      const waiting = workflowResultsContainStatus(results, "waiting");
      await db(
        `UPDATE platform_workflow_runs
            SET status=$1,
                completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,
                updated_at=NOW()
          WHERE id=$3 AND company_id=$4`,
        [waiting ? "WAITING" : "COMPLETED", JSON.stringify({ finalVariables: workflowVariables, screenNavigation: navigation }), session.run_id, req.user.companyId]
      );

      const nextSessionResult = waiting
        ? await db(
            `SELECT id,status,screen,values,history,expires_at
               FROM platform_workflow_screen_sessions
              WHERE run_id=$1 AND company_id=$2 AND status='ACTIVE'
              ORDER BY created_at DESC LIMIT 1`,
            [session.run_id, req.user.companyId]
          )
        : { rows: [] };
      const nextSession = nextSessionResult.rows[0] || null;

      return res.json({
        success: true,
        data: {
          status: waiting ? "WAITING" : "COMPLETED",
          runId: session.run_id,
          screenSessionId: nextSession?.id || null,
          screen: nextSession?.screen || null,
          values: nextSession?.values || {},
          navigation,
          variables: workflowVariables,
        },
      });
    } catch (error) {
      if (processingClaimed) {
        await db(
          "UPDATE platform_workflow_screen_sessions SET status='ACTIVE',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status='PROCESSING'",
          [req.params.sessionId, req.user.companyId]
        ).catch(() => {});
      }
      console.error("Screen Flow submit error:", error);
      return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to continue Screen Flow" });
    }
  });

  async function runSavedWorkflowRequest(req, res, workflowId) {
    let run = null;
    try {
      const workflowResult = await db(
        "SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1",
        [workflowId, req.user.companyId]
      );
      const stored = workflowResult.rows[0] || null;
      if (!stored) return res.status(404).json({ success: false, message: "Workflow not found" });

      // Flow Builder Run executes the most recent saved state of the version that
      // is open. workflowAuthoringRow resolves an active workflow's saved draft
      // when one exists, otherwise it resolves the persisted runtime definition.
      const workflow = workflowAuthoringRow(stored);
      const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
      if (!actions.length) return res.status(422).json({ success: false, message: "Workflow contains no executable steps" });
      for (const action of actions) validateWorkflowAction(action);

      let object = null;
      let record = null;
      let fields = [];
      if (workflow.object_id) {
        object = await getObject(workflow.object_id, req);
        if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
          return res.status(422).json({ success: false, message: "Workflow object is unavailable" });
        }
        const fieldResult = await db(
          "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
          [object.id, req.user.companyId]
        );
        fields = fieldResult.rows || [];
        const requestedRecordId = req.body?.recordId ? String(req.body.recordId) : null;
        if (requestedRecordId) {
          if (!recordIdIsValid(requestedRecordId)) return res.status(400).json({ success: false, message: "Choose a valid record to run the flow" });
          const params = [requestedRecordId];
          const clauses = ["id=$1"];
          if (object.company_scoped !== false) {
            params.push(req.user.companyId);
            clauses.push(`company_id=${params.length}`);
          }
          if (object.store_scoped) {
            if (!req.user.storeId) return res.status(409).json({ success: false, message: "Select a store before running this store-scoped flow" });
            params.push(req.user.storeId);
            clauses.push(`store_id=${params.length}`);
          }
          const recordResult = await db(`SELECT * FROM "${object.source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`, params);
          record = recordResult.rows[0] || null;
          if (!record) return res.status(404).json({ success: false, message: "The selected record was not found in this company/store" });
        }
      }

      if (record && Array.isArray(workflow.conditions) && workflow.conditions.length) {
        const startMatched = evaluateCondition(
          { match: workflow.action?.match || "all", conditionLogic: workflow.action?.conditionLogic || workflow.action?.customConditionLogic || "", conditions: workflow.conditions },
          fields,
          record,
          null
        );
        if (!startMatched) return res.status(422).json({ success: false, message: "The selected record does not meet the flow Start conditions" });
      }

      const declaredInputs = Array.isArray(workflow.action?.inputContract) ? workflow.action.inputContract : [];
      const suppliedInputs = req.body?.inputs && typeof req.body.inputs === "object" && !Array.isArray(req.body.inputs) ? req.body.inputs : {};
      const inputVariables = {};
      for (const input of declaredInputs) {
        const name = String(input?.name || "").trim();
        if (!name) continue;
        const hasValue = Object.prototype.hasOwnProperty.call(suppliedInputs, name);
        const value = hasValue ? suppliedInputs[name] : input?.defaultValue;
        if (input?.required === true && (value === undefined || value === null || String(value).trim() === "")) {
          return res.status(422).json({ success: false, message: `Input ${input.label || name} is required` });
        }
        if (value !== undefined) inputVariables[name] = value;
      }
      const workflowVariables = { variables: inputVariables, steps: {} };
      const pinnedVersion = Number(workflow.draft_version || workflow.version || stored.active_version || stored.version || 1);

      run = await createWorkflowRun({
        db,
        companyId: req.user.companyId,
        workflowId: stored.id,
        workflowName: workflow.name,
        workflowVersion: pinnedVersion,
        objectId: object?.id || null,
        recordId: record?.id || null,
        triggerKey: "RUN",
        status: "RUNNING",
        metadata: {
          manualRun: true,
          actorUserId: req.user.id || null,
          storeId: req.user.storeId || null,
          tillId: req.user.tillId || null,
          initialVariables: workflowVariables,
        },
      });

      const results = await executeWorkflowActions({
        actions,
        db,
        pool,
        req,
        object,
        fields,
        record,
        recordId: record?.id || null,
        companyId: req.user.companyId,
        runId: run?.id || null,
        workflowVersion: pinnedVersion,
        trigger: "RUN",
        workflowVariables,
      });
      const waiting = workflowResultsContainStatus(results, "waiting");
      if (run?.id) {
        await db(
          `UPDATE platform_workflow_runs
              SET status=$1,
                  completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                  metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,
                  updated_at=NOW()
            WHERE id=$3 AND company_id=$4`,
          [waiting ? "WAITING" : "COMPLETED", JSON.stringify({ childResults: results, finalVariables: workflowVariables }), run.id, req.user.companyId]
        );
      }
      return res.json({ success: true, data: { status: waiting ? "WAITING" : "COMPLETED", runId: run?.id || null, results, variables: workflowVariables } });
    } catch (error) {
      if (run?.id) {
        await db(
          "UPDATE platform_workflow_runs SET status='FAILED',completed_at=NOW(),error_text=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3",
          [String(error?.message || error).slice(0, 2000), run.id, req.user.companyId]
        ).catch(() => {});
      }
      console.error("Workflow run error:", error);
      return res.status(error.status || 500).json({ success: false, message: error.message || "Unable to run workflow" });
    }
  }

  router.post("/platform/rules/debug", ...manage, async (req, res) => runWorkflowDebugRequest(req, res, null));
  router.post("/platform/rules/:ruleId/debug", ...manage, async (req, res) => runWorkflowDebugRequest(req, res, req.params.ruleId));
  router.post("/platform/rules/:ruleId/run", ...workflowExecute, async (req, res) => runSavedWorkflowRequest(req, res, req.params.ruleId));


  router.post("/platform/rules", ...manage, async (req, res) => {
    try {
      const { objectId = null, objectKey = null, name, triggerKey, conditions = [], action = {}, active = false, lifecycleStatus, version } = req.body || {};
      const resolvedObject = objectId || objectKey ? await getObject(objectId || objectKey, req) : null;
      if ((objectId || objectKey) && !resolvedObject) return res.status(400).json({ success: false, message: "Object not found" });
      const lifecycleState = await normalizeRuleLifecycle({ active, lifecycle_status: lifecycleStatus, version }, active);
      const normalizedReferences = resolvedObject?.id
        ? await enrichRuleFieldReferences({ db, objectId: resolvedObject.id, conditions, action })
        : { conditions, action };
      const ruleError = await checkRule(req, { object_id: resolvedObject?.id || null, name, trigger_key: triggerKey, conditions: normalizedReferences.conditions, action: normalizedReferences.action, active: lifecycleState.active, lifecycle_status: lifecycleState.lifecycle, version: lifecycleState.version });
      if (ruleError) return res.status(400).json({ success: false, message: ruleError });
      const initialDefinition = {
        object_id: resolvedObject?.id || null,
        name: name.trim(),
        trigger_key: triggerKey,
        conditions: normalizedReferences.conditions,
        action: normalizedReferences.action,
        active: lifecycleState.active,
        lifecycle_status: lifecycleState.lifecycle,
        version: lifecycleState.version,
      };
      const result = await db(
        `INSERT INTO platform_rules
           (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,draft_version,draft_definition,company_id,created_by)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)
         RETURNING *`,
        [
          initialDefinition.object_id,
          initialDefinition.name,
          initialDefinition.trigger_key,
          JSON.stringify(initialDefinition.conditions),
          JSON.stringify(initialDefinition.action),
          lifecycleState.active,
          lifecycleState.lifecycle,
          lifecycleState.version,
          lifecycleState.active ? lifecycleState.version : null,
          lifecycleState.active ? null : lifecycleState.version,
          lifecycleState.active ? null : JSON.stringify(initialDefinition),
          req.user.companyId,
          req.user.id,
        ]
      );
      await saveWorkflowVersion(result.rows[0], req.user.id);
      res.status(201).json({ success: true, data: workflowAuthoringRow(result.rows[0]) });
    } catch (error) {
      if (["22P02", "23503"].includes(error.code)) return res.status(400).json({ success: false, message: "Invalid rule reference" });
      console.error("Platform rule create error:", error);
      res.status(500).json({ success: false, message: "Unable to create rule" });
    }
  });

  router.put("/platform/rules/:ruleId", ...manage, async (req, res) => {
    try {
      const existing = await db("SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2", [req.params.ruleId, req.user.companyId]);
      if (!existing.rows.length) return res.status(404).json({ success: false, message: "Rule not found or not editable" });
      const rule = existing.rows[0];
      const isWorkflow = rule.action?.type === "workflow";
      const draftBase = isWorkflow && rule.draft_definition && typeof rule.draft_definition === "object"
        ? {
            ...rule,
            object_id: rule.draft_definition.object_id ?? rule.object_id,
            name: rule.draft_definition.name ?? rule.name,
            trigger_key: rule.draft_definition.trigger_key ?? rule.trigger_key,
            conditions: rule.draft_definition.conditions ?? rule.conditions,
            action: rule.draft_definition.action ?? rule.action,
            active: false,
            lifecycle_status: "DRAFT",
            version: Number(rule.draft_version || rule.draft_definition.version || rule.version || 1),
          }
        : { ...rule };
      const next = { ...draftBase };
      const requestedLifecycle = await normalizeRuleLifecycle({
        active: req.body.active ?? draftBase.active,
        lifecycle_status: req.body.lifecycleStatus ?? req.body.lifecycle_status ?? draftBase.lifecycle_status,
        version: req.body.version ?? draftBase.version,
      }, Boolean(draftBase.active));
      for (const [api, column] of Object.entries({ objectId: "object_id", name: "name", triggerKey: "trigger_key", conditions: "conditions", action: "action", active: "active", lifecycleStatus: "lifecycle_status", version: "version" })) {
        if (req.body[api] !== undefined) next[column] = req.body[api];
      }
      next.active = requestedLifecycle.active;
      next.lifecycle_status = requestedLifecycle.lifecycle;
      next.version = requestedLifecycle.version;
      if (req.body.objectId !== undefined || req.body.objectKey !== undefined) {
        const resolvedObject = req.body.objectId || req.body.objectKey
          ? await getObject(req.body.objectId || req.body.objectKey, req)
          : null;
        if ((req.body.objectId || req.body.objectKey) && !resolvedObject) {
          return res.status(400).json({ success: false, message: "Object not found" });
        }
        next.object_id = resolvedObject?.id || null;
      }

      const deactivateOnly = req.body.active === false && Object.keys(req.body).length === 1;
      let normalizedNext = next;
      if (!deactivateOnly && next.object_id) {
        const normalizedReferences = await enrichRuleFieldReferences({
          db,
          objectId: next.object_id,
          conditions: next.conditions,
          action: next.action,
        });
        normalizedNext = { ...next, conditions: normalizedReferences.conditions, action: normalizedReferences.action };
      }
      const ruleError = deactivateOnly ? null : await checkRule(req, normalizedNext);
      if (ruleError) return res.status(400).json({ success: false, message: ruleError });

      const definitionRequested = ["objectId","objectKey","name","triggerKey","conditions","action"].some((key) => req.body[key] !== undefined);
      const forceNewVersion = req.body?.forceNewVersion === true;
      const meaningfulEdit = definitionRequested && (
        String(draftBase.object_id || "") !== String(normalizedNext.object_id || "")
        || String(draftBase.name || "") !== String(normalizedNext.name || "")
        || String(draftBase.trigger_key || "") !== String(normalizedNext.trigger_key || "")
        || JSON.stringify(draftBase.conditions || []) !== JSON.stringify(normalizedNext.conditions || [])
        || JSON.stringify(draftBase.action || {}) !== JSON.stringify(normalizedNext.action || {})
      );

      if (isWorkflow && (meaningfulEdit || forceNewVersion || requestedLifecycle.lifecycle === "ACTIVE")) {
        const maxVersion = await db(
          "SELECT GREATEST(COALESCE(MAX(version),0),$1::int,$2::int,$3::int) AS version FROM platform_workflow_versions WHERE company_id=$4 AND workflow_id=$5",
          [
            Number(rule.version || 1),
            Number(rule.active_version || 0),
            Number(rule.draft_version || 0),
            req.user.companyId,
            rule.id,
          ]
        );
        const currentMax = Number(maxVersion.rows[0]?.version || rule.version || 1);
        const activatingExistingDraft = requestedLifecycle.lifecycle === "ACTIVE"
          && rule.draft_version
          && !meaningfulEdit
          && !forceNewVersion;
        normalizedNext.version = activatingExistingDraft ? Number(rule.draft_version) : currentMax + 1;
      }

      if (isWorkflow && requestedLifecycle.lifecycle === "INACTIVE" && req.body.active === false) {
        const updated = await db(
          `UPDATE platform_rules
              SET active=false,lifecycle_status='INACTIVE',user_modified=true,updated_at=NOW()
            WHERE id=$1 AND company_id=$2
            RETURNING *`,
          [rule.id, req.user.companyId]
        );
        return res.json({ success: true, data: workflowAuthoringRow(updated.rows[0]) });
      }

      if (isWorkflow && requestedLifecycle.lifecycle === "DRAFT" && rule.active === true) {
        const draftDefinition = workflowVersionDefinition({
          ...normalizedNext,
          company_id: rule.company_id,
          id: rule.id,
          active: false,
          lifecycle_status: "DRAFT",
        });
        const updated = await db(
          `UPDATE platform_rules
              SET draft_definition=$1::jsonb,draft_version=$2,user_modified=true,updated_at=NOW()
            WHERE id=$3 AND company_id=$4
            RETURNING *`,
          [JSON.stringify(draftDefinition), Number(normalizedNext.version || rule.version || 1), rule.id, req.user.companyId]
        );
        if (meaningfulEdit || forceNewVersion) {
          await saveWorkflowVersion({
            ...rule,
            ...normalizedNext,
            id: rule.id,
            company_id: rule.company_id,
            active: false,
            lifecycle_status: "DRAFT",
          }, req.user.id);
        }
        return res.json({ success: true, data: workflowAuthoringRow(updated.rows[0]) });
      }

      if (isWorkflow && requestedLifecycle.lifecycle === "ACTIVE") {
        const promoted = await db(
          `UPDATE platform_rules SET
              object_id=$1,name=$2,trigger_key=$3,conditions=$4::jsonb,action=$5::jsonb,
              active=true,lifecycle_status='ACTIVE',version=$6,active_version=$6,
              draft_definition=NULL,draft_version=NULL,user_modified=true,updated_at=NOW()
            WHERE id=$7 AND company_id=$8
            RETURNING *`,
          [
            normalizedNext.object_id,
            normalizedNext.name,
            normalizedNext.trigger_key,
            JSON.stringify(normalizedNext.conditions),
            JSON.stringify(normalizedNext.action),
            Number(normalizedNext.version || rule.version || 1),
            rule.id,
            req.user.companyId,
          ]
        );
        await saveWorkflowVersion(promoted.rows[0], req.user.id);
        return res.json({ success: true, data: workflowAuthoringRow(promoted.rows[0]) });
      }

      const result = await db(
        `UPDATE platform_rules SET
            object_id=$1,name=$2,trigger_key=$3,conditions=$4::jsonb,action=$5::jsonb,
            active=$6,lifecycle_status=$7::varchar,version=$8,
            active_version=CASE WHEN $6=TRUE THEN $8 ELSE active_version END,
            draft_version=CASE WHEN $7::varchar='DRAFT' THEN $8 ELSE draft_version END,
            draft_definition=CASE WHEN $7::varchar='DRAFT' THEN $9::jsonb ELSE draft_definition END,
            user_modified=true,updated_at=NOW()
          WHERE id=$10 AND company_id=$11
          RETURNING *`,
        [
          normalizedNext.object_id,
          normalizedNext.name,
          normalizedNext.trigger_key,
          JSON.stringify(normalizedNext.conditions),
          JSON.stringify(normalizedNext.action),
          normalizedNext.active,
          normalizedNext.lifecycle_status,
          normalizedNext.version,
          normalizedNext.lifecycle_status === "DRAFT" ? JSON.stringify(workflowVersionDefinition({ ...normalizedNext, active: false, lifecycle_status: "DRAFT" })) : null,
          rule.id,
          req.user.companyId,
        ]
      );
      if (isWorkflow && (meaningfulEdit || forceNewVersion)) await saveWorkflowVersion(result.rows[0], req.user.id);
      res.json({ success: true, data: workflowAuthoringRow(result.rows[0]) });
    } catch (error) {
      if (["22P02", "23503"].includes(error.code)) return res.status(400).json({ success: false, message: "Invalid rule reference" });
      console.error("Platform rule update error:", error);
      res.status(500).json({ success: false, message: "Unable to update rule" });
    }
  });

  router.get("/platform/rules/:ruleId/versions", ...manage, async (req, res) => {
    const result = await db(
      "SELECT id,workflow_id,version,definition,lifecycle_status,created_by,created_at FROM platform_workflow_versions WHERE company_id=$1 AND workflow_id=$2 ORDER BY version DESC",
      [req.user.companyId, req.params.ruleId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/rules/:ruleId/versions/:version/restore", ...manage, async (req, res) => {
    try {
      const [currentResult, versionResult] = await Promise.all([
        db("SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2 LIMIT 1", [req.params.ruleId, req.user.companyId]),
        db("SELECT * FROM platform_workflow_versions WHERE company_id=$1 AND workflow_id=$2 AND version=$3 LIMIT 1", [req.user.companyId, req.params.ruleId, Number(req.params.version)]),
      ]);
      const current = currentResult.rows[0];
      const snapshot = versionResult.rows[0];
      if (!current || !snapshot) return res.status(404).json({ success: false, message: "Workflow version not found" });
      const maxVersion = await db(
        "SELECT GREATEST(COALESCE(MAX(version),0),$1::int,$2::int,$3::int) AS version FROM platform_workflow_versions WHERE company_id=$4 AND workflow_id=$5",
        [Number(current.version || 1), Number(current.active_version || 0), Number(current.draft_version || 0), req.user.companyId, current.id]
      );
      const nextVersion = Number(maxVersion.rows[0]?.version || current.version || 1) + 1;
      const definition = {
        ...(snapshot.definition || {}),
        active: false,
        lifecycle_status: "DRAFT",
        version: nextVersion,
      };

      let restored;
      if (current.active === true) {
        const updated = await db(
          `UPDATE platform_rules
              SET draft_definition=$1::jsonb,draft_version=$2,user_modified=true,updated_at=NOW()
            WHERE id=$3 AND company_id=$4 RETURNING *`,
          [JSON.stringify(definition), nextVersion, current.id, req.user.companyId]
        );
        restored = workflowAuthoringRow(updated.rows[0]);
      } else {
        const updated = await db(
          `UPDATE platform_rules SET object_id=$1,name=$2,trigger_key=$3,conditions=$4::jsonb,action=$5::jsonb,
              active=false,lifecycle_status='DRAFT',version=$6,draft_version=$6,draft_definition=$7::jsonb,
              user_modified=true,updated_at=NOW()
            WHERE id=$8 AND company_id=$9 RETURNING *`,
          [
            definition.object_id || null,
            definition.name,
            definition.trigger_key,
            JSON.stringify(definition.conditions || []),
            JSON.stringify(definition.action || {}),
            nextVersion,
            JSON.stringify(definition),
            current.id,
            req.user.companyId,
          ]
        );
        restored = workflowAuthoringRow(updated.rows[0]);
      }

      await saveWorkflowVersion({
        ...current,
        ...definition,
        id: current.id,
        company_id: current.company_id,
      }, req.user.id);
      res.json({ success: true, data: restored, restoredFromVersion: Number(req.params.version) });
    } catch (error) {
      console.error("Workflow version restore error:", error);
      res.status(500).json({ success: false, message: "Unable to restore workflow version" });
    }
  });

  function validateWorkflowTestConfig(config = {}, definition = null) {
    if (String(config.recordMode || "latest") === "specific" && !String(config.recordId || "").trim()) return "Specific-record tests require a record ID";
    const assertions = Array.isArray(config.assertions) ? config.assertions : [];
    const actions = Array.isArray(definition?.action?.actions) ? definition.action.actions : [];
    const byId = new Map(actions.filter((item) => item?.id).map((item) => [String(item.id), item]));
    for (let index = 0; index < assertions.length; index += 1) {
      const assertion = assertions[index] || {};
      const type = String(assertion.type || "RUN_STATUS").toUpperCase();
      if (!["RUN_STATUS", "STEP_STATUS", "DECISION_OUTCOME", "RESOURCE_EQUALS", "RESOURCE_CONDITION"].includes(type)) return `Assertion ${index + 1} has an unsupported type`;
      if (type === "RUN_STATUS" && !["COMPLETED","FAILED","NOT_STARTED"].includes(String(assertion.expected || "COMPLETED").toUpperCase())) return `Assertion ${index + 1} has an unsupported run status`;
      if (type === "STEP_STATUS" && (!assertion.stepId || !byId.has(String(assertion.stepId)))) return `Assertion ${index + 1} must reference an existing element`;
      if (type === "STEP_STATUS" && !["COMPLETED","FAILED","NOT_RUN"].includes(String(assertion.expected || "COMPLETED").toUpperCase())) return `Assertion ${index + 1} has an unsupported element status`;
      if (type === "DECISION_OUTCOME") {
        const decision = byId.get(String(assertion.stepId || ""));
        if (!decision || String(decision.type || decision.key || "").toUpperCase() !== "CONDITION") return `Assertion ${index + 1} must reference a Decision element`;
        const expected = String(assertion.expected || "");
        if (!expected) return `Assertion ${index + 1} must select an expected Decision outcome`;
        const outcomes = Array.isArray(decision.outcomes) ? decision.outcomes : Array.isArray(decision.config?.outcomes) ? decision.config.outcomes : [];
        if (!["__DEFAULT__", "Default", "Default Outcome"].includes(expected) && !outcomes.some((outcome) => String(outcome?.id || "") === expected)) return `Assertion ${index + 1} must reference a valid Decision outcome`;
      }
      if (["RESOURCE_EQUALS","RESOURCE_CONDITION"].includes(type) && !String(assertion.resource || "").trim()) return `Assertion ${index + 1} must select a resource`;
      if (["RESOURCE_EQUALS","RESOURCE_CONDITION"].includes(type) && !["is_empty","is_not_empty"].includes(String(assertion.operator || "equals")) && assertion.expected === undefined) return `Assertion ${index + 1} must provide an expected value`;
      if (type === "RESOURCE_CONDITION" && !["equals","not_equals","greater_than","greater_than_or_equal","less_than","less_than_or_equal","is_empty","is_not_empty"].includes(String(assertion.operator || "equals"))) {
        return `Assertion ${index + 1} has an unsupported operator`;
      }
    }
    return "";
  }

  router.get("/platform/rules/:ruleId/tests", ...manage, async (req, res) => {
    const result = await db(
      "SELECT * FROM platform_workflow_tests WHERE company_id=$1 AND workflow_id=$2 AND active=true ORDER BY created_at DESC",
      [req.user.companyId, req.params.ruleId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/rules/:ruleId/tests", ...manage, async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const config = req.body?.config && typeof req.body.config === "object" ? req.body.config : {};
    if (!name) return res.status(400).json({ success: false, message: "Test name is required" });
    const workflow = await db("SELECT id,action FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1", [req.params.ruleId, req.user.companyId]);
    if (!workflow.rows.length) return res.status(404).json({ success: false, message: "Workflow not found" });
    const configIssue = validateWorkflowTestConfig(config, { action: workflow.rows[0].action || {} });
    if (configIssue) return res.status(400).json({ success: false, message: configIssue });
    const result = await db(
      "INSERT INTO platform_workflow_tests (company_id,workflow_id,name,config,created_by) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING *",
      [req.user.companyId, req.params.ruleId, name, JSON.stringify(config), req.user.id]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/rules/:ruleId/tests/:testId/run", ...manage, async (req, res) => {
    const saved = await db("SELECT * FROM platform_workflow_tests WHERE id=$1 AND workflow_id=$2 AND company_id=$3 AND active=true LIMIT 1", [req.params.testId, req.params.ruleId, req.user.companyId]);
    if (!saved.rows.length) return res.status(404).json({ success: false, message: "Saved test not found" });
    const test = saved.rows[0];
    const config = test.config && typeof test.config === "object" ? test.config : {};
    req.body = {
      ...(req.body || {}),
      mode: "test",
      inputs: config.inputs && typeof config.inputs === "object" ? config.inputs : {},
      assertions: Array.isArray(config.assertions) ? config.assertions : [],
      rollback: config.recordMode === "specific" || config.scenarioTestingAutomation === true ? true : (config.rollback ?? true),
      skipStartConditionRequirements: config.skipStartConditionRequirements === true,
      debugWaitElementBehavior: config.debugWaitElementBehavior === true,
      debugWaitPaths: config.debugWaitPaths && typeof config.debugWaitPaths === "object" ? config.debugWaitPaths : {},
    };
    if (config.recordMode === "specific" && config.recordId) req.body.recordId = config.recordId;
    else delete req.body.recordId;
    const originalJson = res.json.bind(res);
    res.json = async (payload) => {
      try {
        if (payload?.success && payload?.data) {
          await db("UPDATE platform_workflow_tests SET last_status=$1,last_run_id=$2,last_result=$3::jsonb,last_run_at=NOW(),updated_at=NOW() WHERE id=$4 AND workflow_id=$5 AND company_id=$6", [payload.data.testPassed === true ? "PASSED" : "FAILED", payload.data.run?.id || null, JSON.stringify({ status: payload.data.status || null, testPassed: payload.data.testPassed === true, assertionResult: payload.data.assertionResult || null }), test.id, req.params.ruleId, req.user.companyId]);
        }
      } catch (error) { console.error("Workflow saved test result persistence error:", error); }
      return originalJson(payload);
    };
    return runWorkflowDebugRequest(req, res, req.params.ruleId);
  });

  router.put("/platform/rules/:ruleId/tests/:testId", ...manage, async (req, res) => {
    if (req.body?.config !== undefined) {
      const workflow = await db("SELECT action FROM platform_rules WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow' LIMIT 1", [req.params.ruleId, req.user.companyId]);
      if (!workflow.rows.length) return res.status(404).json({ success: false, message: "Workflow not found" });
      const configIssue = validateWorkflowTestConfig(req.body.config || {}, { action: workflow.rows[0].action || {} });
      if (configIssue) return res.status(400).json({ success: false, message: configIssue });
    }
    const result = await db(
      `UPDATE platform_workflow_tests SET
         name=COALESCE($1,name),
         config=COALESCE($2::jsonb,config),
         last_status=COALESCE($3,last_status),
         last_run_id=COALESCE($4,last_run_id),
         last_result=COALESCE($5::jsonb,last_result),
         last_run_at=CASE WHEN $3::text IS NULL THEN last_run_at ELSE NOW() END,
         updated_at=NOW()
       WHERE id=$6 AND workflow_id=$7 AND company_id=$8 RETURNING *`,
      [
        req.body?.name || null,
        req.body?.config === undefined ? null : JSON.stringify(req.body.config || {}),
        req.body?.lastStatus || null,
        req.body?.lastRunId || null,
        req.body?.lastResult === undefined ? null : JSON.stringify(req.body.lastResult || {}),
        req.params.testId,
        req.params.ruleId,
        req.user.companyId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Saved test not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/rules/:ruleId/tests/:testId", ...manage, async (req, res) => {
    const result = await db(
      "UPDATE platform_workflow_tests SET active=false,updated_at=NOW() WHERE id=$1 AND workflow_id=$2 AND company_id=$3 RETURNING id",
      [req.params.testId, req.params.ruleId, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Saved test not found" });
    res.json({ success: true });
  });

  router.delete("/platform/rules/:ruleId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_rules SET active=false,user_modified=true WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.ruleId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Rule not found or not editable" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/rules/:ruleId/clone", ...manage, async (req, res) => {
    try {
      const source = await db("SELECT * FROM platform_rules WHERE id=$1 AND company_id=$2", [req.params.ruleId, req.user.companyId]);
      if (!source.rows.length) return res.status(404).json({ success: false, message: "Rule not found" });
      const rule = source.rows[0];
      const name = typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : `${rule.name} (Copy)`;
      const result = await db(
        "INSERT INTO platform_rules (object_id,name,trigger_key,conditions,action,active,company_id,created_by) VALUES ($1,$2,$3,$4,$5,false,$6,$7) RETURNING *",
        [rule.object_id, name, rule.trigger_key, rule.conditions, rule.action, req.user.companyId, req.user.id]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A workflow with this name already exists" });
      console.error("Platform rule clone error:", error);
      res.status(500).json({ success: false, message: "Unable to clone rule" });
    }
  });

  router.get("/platform/automation-logs", ...manage, async (req, res) => {
    const result = await db("SELECT * FROM platform_automation_logs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200", [req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });


  router.get("/platform/approval-processes/:processId", ...manage, async (req, res) => {
    const process = await db("SELECT p.*, o.object_key FROM platform_approval_processes p JOIN platform_objects o ON o.id=p.object_id WHERE p.id=$1 AND p.company_id=$2", [req.params.processId, req.user.companyId]);
    if (!process.rows.length) return res.status(404).json({ success: false, message: "Approval process not found" });
    const steps = await db("SELECT * FROM platform_approval_steps WHERE process_id=$1 ORDER BY step_order", [req.params.processId]);
    res.json({ success: true, data: { ...process.rows[0], steps: steps.rows } });
  });

  router.put("/platform/approval-processes/:processId", ...manage, async (req, res) => {
    const existing = await db("SELECT * FROM platform_approval_processes WHERE id=$1 AND company_id=$2", [req.params.processId, req.user.companyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Approval process not found" });
    const process = existing.rows[0];
    const next = req.body || {};
    if (next.name !== undefined && (!String(next.name).trim() || String(next.name).length > 200)) return res.status(400).json({ success: false, message: "A valid process name is required" });
    const processFields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [process.object_id, req.user.companyId]);
    if (next.conditions !== undefined) {
      try { validateConditionConfig(next.conditions, processFields.rows, "Approval entry conditions"); }
      catch (error) { if (error instanceof ConditionError) return res.status(400).json({ success: false, message: error.message }); throw error; }
    }
    if (Array.isArray(next.steps) && (!next.steps.length || next.steps.some((step) => !step?.label?.trim() || ((step.assignmentType || "role") === "role" && !step.roleId)))) {
      return res.status(400).json({ success: false, message: "At least one valid ordered approval step is required" });
    }
    const requestedLifecycle = next.lifecycleStatus ?? next.lifecycle_status ?? (next.active === true ? "ACTIVE" : next.active === false ? "INACTIVE" : undefined);
    if (requestedLifecycle !== undefined && !["DRAFT", "ACTIVE", "INACTIVE"].includes(String(requestedLifecycle).toUpperCase())) return res.status(400).json({ success: false, message: "lifecycleStatus must be DRAFT, ACTIVE or INACTIVE" });
    const lifecycleStatus = requestedLifecycle === undefined ? null : String(requestedLifecycle).toUpperCase();
    const activeValue = lifecycleStatus === null ? next.active : lifecycleStatus === "ACTIVE";
    const result = await db("UPDATE platform_approval_processes SET name=COALESCE($1,name),conditions=COALESCE($2::jsonb,conditions),config=COALESCE($3::jsonb,config),active=COALESCE($4,active),lifecycle_status=COALESCE($5,lifecycle_status),version=version+1,updated_at=NOW() WHERE id=$6 RETURNING *", [next.name, next.conditions === undefined ? null : JSON.stringify(next.conditions), next.config === undefined ? null : JSON.stringify(next.config), activeValue, lifecycleStatus, process.id]);
    if (Array.isArray(next.steps)) {
      const pending=await db("SELECT 1 FROM platform_approval_requests WHERE process_id=$1 AND company_id=$2 AND status='pending' LIMIT 1",[process.id,req.user.companyId]);
      if(pending.rows.length) return res.status(409).json({success:false,message:"This approval has requests in progress. Clone it or wait for them to finish before changing approver steps."});
      await db("DELETE FROM platform_approval_steps WHERE process_id=$1", [process.id]);
      for (let index = 0; index < next.steps.length; index += 1) {
        const step = next.steps[index];
        if ((step.assignmentType || "role") === "role") { const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [step.roleId, req.user.companyId]); if (!role.rows.length || !step.label?.trim()) return res.status(400).json({ success: false, message: "Each approval step requires a valid company role and label" }); }
        await db("INSERT INTO platform_approval_steps (process_id,step_order,label,role_id,config,assignment_type,assignment_config) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)", [process.id, index + 1, step.label.trim(), step.roleId || null, JSON.stringify(step.config || {}), step.assignmentType || "role", JSON.stringify(step.assignmentConfig || {})]);
      }
    }
    res.json({ success: true, data: result.rows[0] });
  });

  router.delete("/platform/approval-processes/:processId", ...manage, async (req, res) => {
    const result = await db("UPDATE platform_approval_processes SET active=false,lifecycle_status='INACTIVE',updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *", [req.params.processId, req.user.companyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Approval process not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/approval-processes", ...manage, async (req, res) => {
    const result = await db(
      "SELECT p.*, o.object_key FROM platform_approval_processes p JOIN platform_objects o ON o.id=p.object_id WHERE p.company_id=$1 ORDER BY p.name",
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/approval-processes", ...manage, async (req, res) => {
    const { objectId, name, conditions = {}, config = {}, steps = [], active = false } = req.body || {};
    const requestedLifecycle = String(req.body?.lifecycleStatus ?? req.body?.lifecycle_status ?? (active ? "ACTIVE" : "DRAFT")).toUpperCase();
    if (!["DRAFT", "ACTIVE", "INACTIVE"].includes(requestedLifecycle)) return res.status(400).json({ success: false, message: "lifecycleStatus must be DRAFT, ACTIVE or INACTIVE" });
    if (!objectId || typeof name !== "string" || !name.trim() || !Array.isArray(steps) || !steps.length) {
      return res.status(400).json({ success: false, message: "An object, process name and at least one approval step are required" });
    }
    const object = await getObject(objectId, req, { forMutation: true });
    if (!object) return res.status(404).json({ success: false, message: "Object not found or not editable" });
    try {
      const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY display_order, label", [object.id, req.user.companyId]);
      validateConditionConfig(conditions, fields.rows, "Approval entry conditions");
      const process = await db(
        "INSERT INTO platform_approval_processes (object_id,company_id,name,conditions,config,active,lifecycle_status) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) RETURNING *",
        [object.id, req.user.companyId, name.trim(), JSON.stringify(conditions), JSON.stringify(config || {}), requestedLifecycle === "ACTIVE", requestedLifecycle]
      );
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        if (typeof step.label !== "string" || !step.label.trim() || ((step.assignmentType || "role") === "role" && !step.roleId)) return res.status(400).json({ success: false, message: "Each approval step requires a label and a valid approver assignment" });
        if ((step.assignmentType || "role") === "role") { const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [step.roleId, req.user.companyId]); if (!role.rows.length) return res.status(400).json({ success: false, message: "Approval step role is not available to this company" }); }
        await db("INSERT INTO platform_approval_steps (process_id,step_order,label,role_id,config,assignment_type,assignment_config) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)", [process.rows[0].id, index + 1, step.label.trim(), step.roleId || null, JSON.stringify(step.config || {}), step.assignmentType || "role", JSON.stringify(step.assignmentConfig || {})]);
      }
      res.status(201).json({ success: true, data: process.rows[0] });
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ success: false, message: "An approval process with this name already exists" });
      console.error("Platform approval process create error:", error);
      res.status(500).json({ success: false, message: "Unable to create approval process" });
    }
  });

  router.get("/platform/approval-requests", authenticate, async (req, res) => {
    const result = await db(
      `SELECT r.*,p.name AS process_name,COALESCE(r.definition_snapshot->'process'->'config',p.config) AS process_config,s.label AS step_label,
              o.object_key,o.label AS object_name,w.id AS work_item_id,w.assigned_to,w.role_id,
              w.status AS work_item_status,w.due_at,w.reassigned_from,w.reassigned_at,w.reminder_sent_at,w.escalated_at,w.escalation_count,
              u.username AS assignee_name,u.email AS assignee_email
         FROM platform_approval_requests r
         JOIN platform_approval_processes p ON p.id=r.process_id
         JOIN platform_objects o ON o.id=r.object_id
         LEFT JOIN platform_approval_steps s ON s.process_id=r.process_id AND s.step_order=r.current_step
         LEFT JOIN platform_approval_work_items w ON w.request_id=r.id AND w.step_order=r.current_step
         LEFT JOIN users u ON u.id=w.assigned_to
        WHERE r.company_id=$1 AND ($2::text IS NULL OR r.status=$2)
        ORDER BY r.submitted_at DESC`,
      [req.user.companyId, req.query.status || null]
    );
    const data=result.rows.map(row=>{
      const snapshot=cfg(row.definition_snapshot); const pinned=(snapshot.steps||[]).find(step=>Number(step.step_order)===Number(row.current_step)); const processConfig=cfg(snapshot.process?.config||row.process_config);
      const eligible=row.status==="pending" && ((row.assigned_to && String(row.assigned_to)===String(req.user.id)) || (!row.assigned_to && String(row.role_id)===String(req.user.roleId)));
      return {...row,process_name:snapshot.process?.name||row.process_name,process_config:processConfig,step_label:pinned?.label||row.step_label,can_decide:eligible,can_reassign:eligible&&processConfig.allowReassign!==false,can_recall:row.status==="pending"&&String(row.submitted_by)===String(req.user.id)};
    });
    res.json({ success: true, data });
  });

  router.get("/platform/approval-requests/:requestId/history", authenticate, async (req, res) => {
    const actions = await db(`SELECT a.*,u.username AS actor_name FROM platform_approval_actions a JOIN platform_approval_requests r ON r.id=a.request_id LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.request_id=$1 AND r.company_id=$2 ORDER BY a.created_at ASC`, [req.params.requestId, req.user.companyId]);
    const events = await db(`SELECT e.*,u.username AS actor_name FROM platform_approval_events e JOIN platform_approval_requests r ON r.id=e.request_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.request_id=$1 AND r.company_id=$2 ORDER BY e.created_at ASC`, [req.params.requestId, req.user.companyId]);
    res.json({ success: true, data: { actions: actions.rows, events: events.rows } });
  });

  router.get("/platform/approval-requests/:requestId/context", authenticate, async (req,res) => {
    const q=await db(`SELECT r.*,o.object_key,o.label AS object_name,o.source_table FROM platform_approval_requests r JOIN platform_objects o ON o.id=r.object_id WHERE r.id=$1 AND r.company_id=$2`,[req.params.requestId,req.user.companyId]);
    const request=q.rows[0]; if(!request)return res.status(404).json({success:false,message:"Approval request not found"});
    let record={}; if(request.source_table&&/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(request.source_table)){const rr=await db(`SELECT * FROM "${request.source_table}" WHERE id=$1 AND company_id=$2 LIMIT 1`,[request.record_id,req.user.companyId]).catch(()=>({rows:[]}));record=rr.rows[0]||{};}
    const fields=await db("SELECT api_name,label,field_type,source_column FROM platform_fields WHERE object_id=$1 AND active=TRUE ORDER BY sort_order NULLS LAST,label",[request.object_id]).catch(()=>({rows:[]}));
    const snapshot=cfg(request.definition_snapshot); const steps=(snapshot.steps||[]).map(step=>({step_order:step.step_order,label:step.label,status:Number(step.step_order)<Number(request.current_step)?"complete":Number(step.step_order)===Number(request.current_step)&&request.status==="pending"?"current":request.status==="approved"?"complete":"upcoming"}));
    res.json({success:true,data:{request,object:{key:request.object_key,label:request.object_name},record,fields:fields.rows,steps,why:cfg(snapshot.process?.config).approvalReason||""}});
  });

  router.get("/platform/approval-users", authenticate, async (req,res) => {
    const result=await db("SELECT u.id,u.username,u.email,u.manager_id,r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.company_id=$1 AND u.active=TRUE ORDER BY u.username,u.email",[req.user.companyId]);
    res.json({success:true,data:result.rows});
  });

  router.put("/platform/approval-users/:userId/manager", ...manage, async (req,res) => {
    const managerId=req.body?.managerId||null;
    if(String(req.params.userId)===String(managerId)) return res.status(400).json({success:false,message:"A user cannot be their own manager"});
    if(managerId){const manager=await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE",[managerId,req.user.companyId]);if(!manager.rows.length)return res.status(400).json({success:false,message:"Manager must be an active user in this company"});}
    const result=await db("UPDATE users SET manager_id=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING id,manager_id",[managerId,req.params.userId,req.user.companyId]);
    if(!result.rows.length)return res.status(404).json({success:false,message:"User not found"});
    res.json({success:true,data:result.rows[0]});
  });

  router.get("/platform/approval-groups", authenticate, async (req,res) => {
    const result=await db(`SELECT g.*,COUNT(gm.user_id)::int AS member_count FROM platform_approval_groups g LEFT JOIN platform_approval_group_members gm ON gm.group_id=g.id WHERE g.company_id=$1 AND g.active=TRUE GROUP BY g.id ORDER BY g.name`,[req.user.companyId]);
    res.json({success:true,data:result.rows});
  });

  router.post("/platform/approval-groups", ...manage, async (req,res) => {
    const name=String(req.body?.name||"").trim(); const memberIds=Array.isArray(req.body?.memberIds)?req.body.memberIds:[];
    if(!name) return res.status(400).json({success:false,message:"Group name is required"});
    const group=await db("INSERT INTO platform_approval_groups(company_id,name) VALUES($1,$2) RETURNING *",[req.user.companyId,name]);
    for(const userId of memberIds) await db(`INSERT INTO platform_approval_group_members(group_id,user_id) SELECT $1,u.id FROM users u WHERE u.id=$2 AND u.company_id=$3 ON CONFLICT DO NOTHING`,[group.rows[0].id,userId,req.user.companyId]);
    res.json({success:true,data:group.rows[0]});
  });

  router.get("/platform/approval-delegations", authenticate, async (req,res) => {
    const result=await db(`SELECT d.*,u.username AS user_name,du.username AS delegate_name FROM platform_approval_delegations d JOIN users u ON u.id=d.user_id JOIN users du ON du.id=d.delegate_user_id WHERE d.company_id=$1 ORDER BY d.active DESC,d.created_at DESC`,[req.user.companyId]);
    res.json({success:true,data:result.rows});
  });

  router.post("/platform/approval-delegations", authenticate, async (req,res) => {
    const userId=req.body?.userId||req.user.id; const delegateUserId=req.body?.delegateUserId;
    if(String(userId)!==String(req.user.id)) return res.status(403).json({success:false,message:"Users can only configure their own approval delegate"});
    const target=await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE",[delegateUserId,req.user.companyId]);
    if(!target.rows.length || String(delegateUserId)===String(userId)) return res.status(400).json({success:false,message:"Choose another active user in this company"});
    await db("UPDATE platform_approval_delegations SET active=FALSE WHERE company_id=$1 AND user_id=$2 AND active=TRUE",[req.user.companyId,userId]);
    const result=await db("INSERT INTO platform_approval_delegations(company_id,user_id,delegate_user_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.user.companyId,userId,delegateUserId,req.body?.startsAt||null,req.body?.endsAt||null]);
    res.json({success:true,data:result.rows[0]});
  });

  router.delete("/platform/approval-delegations/:id", authenticate, async (req,res) => {
    const result=await db("UPDATE platform_approval_delegations SET active=FALSE WHERE id=$1 AND company_id=$2 AND user_id=$3 RETURNING id",[req.params.id,req.user.companyId,req.user.id]);
    if(!result.rows.length)return res.status(404).json({success:false,message:"Active delegation not found"});
    res.json({success:true,data:result.rows[0]});
  });

  router.put("/platform/approval-groups/:id", ...manage, async (req,res) => {
    const name=String(req.body?.name||"").trim(); const memberIds=Array.isArray(req.body?.memberIds)?req.body.memberIds:[];
    const group=await db("UPDATE platform_approval_groups SET name=COALESCE(NULLIF($1,''),name),active=COALESCE($2,active) WHERE id=$3 AND company_id=$4 RETURNING *",[name,typeof req.body?.active==="boolean"?req.body.active:null,req.params.id,req.user.companyId]);
    if(!group.rows.length)return res.status(404).json({success:false,message:"Approval group not found"});
    await db("DELETE FROM platform_approval_group_members WHERE group_id=$1",[req.params.id]);
    for(const userId of memberIds) await db("INSERT INTO platform_approval_group_members(group_id,user_id) SELECT $1,u.id FROM users u WHERE u.id=$2 AND u.company_id=$3 AND u.active=TRUE ON CONFLICT DO NOTHING",[req.params.id,userId,req.user.companyId]);
    res.json({success:true,data:group.rows[0]});
  });

  router.post("/platform/approval-processes/:id/test", ...manage, async (req,res) => {
    try {
      const processResult=await db("SELECT * FROM platform_approval_processes WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);
      const process=processResult.rows[0]; if(!process)return res.status(404).json({success:false,message:"Approval process not found"});
      const steps=await db("SELECT * FROM platform_approval_steps WHERE process_id=$1 ORDER BY step_order",[process.id]);
      const record=req.body?.record||{}; const objectResult=await db("SELECT * FROM platform_objects WHERE id=$1 AND company_id=$2",[process.object_id,req.user.companyId]);
      const object=objectResult.rows[0]; const fields=await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2)",[process.object_id,req.user.companyId]);
      const matched=evaluateCondition(process.conditions,fields.rows,record);
      const trace=[{key:"criteria",label:"Entry criteria",status:matched?"success":"failed",message:matched?"Record matches the approval entry criteria.":"Record does not match the approval entry criteria."}];
      if(matched) {
        for(const step of steps.rows) {
          const type=step.assignment_type||"role"; const ac=cfg(step.assignment_config); let detail=type;
          if(type==="role") { const role=await db("SELECT name FROM roles WHERE id=$1 AND company_id=$2",[step.role_id,req.user.companyId]); detail=role.rows[0]?.name||"Role unavailable"; }
          if(type==="user") { const user=await db("SELECT username,email FROM users WHERE id=$1 AND company_id=$2",[ac.userId,req.user.companyId]); detail=user.rows[0]?.username||user.rows[0]?.email||"User unavailable"; }
          if(type==="group") { const group=await db("SELECT g.name,COUNT(gm.user_id)::int AS member_count FROM platform_approval_groups g LEFT JOIN platform_approval_group_members gm ON gm.group_id=g.id LEFT JOIN users u ON u.id=gm.user_id AND u.company_id=g.company_id AND u.active=TRUE WHERE g.id=$1 AND g.company_id=$2 AND g.active=TRUE GROUP BY g.id",[ac.groupId,req.user.companyId]); detail=group.rows[0]?.member_count>0?`${group.rows[0].name} · ${group.rows[0].member_count} approver(s)`:"Group unavailable or empty"; }
          if(type==="manager") { const manager=await db("SELECT m.username,m.email FROM users u JOIN users m ON m.id=u.manager_id AND m.company_id=u.company_id AND m.active=TRUE WHERE u.id=$1 AND u.company_id=$2",[req.user.id,req.user.companyId]); detail=manager.rows[0]?.username||manager.rows[0]?.email||"Manager unavailable"; }
          if(type==="record_user") detail=record?.[ac.field]?`Record field ${ac.field} → ${record[ac.field]}`:`Record field ${ac.field||"?"} is empty`;
          trace.push({key:`step-${step.step_order}`,label:step.label,status:detail.toLowerCase().includes("unavailable")||detail.toLowerCase().includes("empty")?"failed":"success",message:`Approver: ${detail}. Rule: ${cfg(step.config).approvalRule||"FIRST_RESPONSE"}.`});
        }
        trace.push({key:"lock",label:"Record lock",status:"success",message:cfg(process.config).lockRecord===false?"Record remains editable while pending.":"Record will be locked while approval is pending."});
        trace.push({key:"actions",label:"Outcome actions",status:"success",message:`Submission: ${(cfg(process.config).submissionActions||[]).length}; approval: ${(cfg(process.config).finalApprovalActions||[]).length}; rejection: ${(cfg(process.config).finalRejectionActions||[]).length}. Test mode did not execute actions or change data.`});
      }
      res.json({success:true,data:{matched,trace,rolledBack:true,mutated:false}});
    } catch(error){console.error("Approval test error:",error);res.status(500).json({success:false,message:error.message||"Unable to test approval"});}
  });

  router.get("/platform/objects/:objectKey/records/:recordId/approval", ...recordAccess, async (req,res) => {
    try {
      const {object}=await getRecordMetadata(req.params.objectKey,req);
      if(!object) return res.status(404).json({success:false,message:"Unknown object"});
      const requests=await db(`SELECT r.*,p.name AS process_name,p.config AS process_config,s.label AS step_label
        FROM platform_approval_requests r JOIN platform_approval_processes p ON p.id=r.process_id
        LEFT JOIN platform_approval_steps s ON s.process_id=r.process_id AND s.step_order=r.current_step
        WHERE r.company_id=$1 AND r.object_id=$2 AND r.record_id=$3 ORDER BY r.submitted_at DESC`,[req.user.companyId,object.id,req.params.recordId]);
      let request=requests.rows[0]||null;
      if(request){const snap=cfg(request.definition_snapshot);const pinned=(snap.steps||[]).find(step=>Number(step.step_order)===Number(request.current_step));if(pinned)request={...request,process_name:snap.process?.name||request.process_name,process_config:snap.process?.config||request.process_config,step_label:pinned.label||request.step_label};}
      let history={actions:[],events:[]};
      if(request) {
        const actions=await db("SELECT a.*,u.username AS actor_name FROM platform_approval_actions a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.request_id=$1 ORDER BY a.created_at",[request.id]);
        const events=await db("SELECT e.*,u.username AS actor_name FROM platform_approval_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.request_id=$1 ORDER BY e.created_at",[request.id]);
        history={actions:actions.rows,events:events.rows};
      }
      const eligible=await db("SELECT id,name,config,conditions FROM platform_approval_processes WHERE company_id=$1 AND object_id=$2 AND active=TRUE ORDER BY name",[req.user.companyId,object.id]);
      const manualProcesses=eligible.rows.filter(p=>cfg(p.config).submissionMode==="MANUAL");
      res.json({success:true,data:{request,history,availableProcesses:manualProcesses}});
    } catch(error) { console.error("Record approval state error:",error); res.status(500).json({success:false,message:"Unable to load approval state"}); }
  });

  router.post("/platform/objects/:objectKey/records/:recordId/submit-approval", ...recordAccess, async (req,res) => {
    try {
      const {object,fields:metadataFields}=await getRecordMetadata(req.params.objectKey,req);
      if(!object) return res.status(404).json({success:false,message:"Unknown object"});
      if(!object.source_table||!isSafeIdentifier(object.source_table)) return res.status(400).json({success:false,message:"Object records are not available"});
      const params=[req.params.recordId]; const clauses=["id=$1"];
      if(object.company_scoped){params.push(req.user.companyId);clauses.push(`company_id=$${params.length}`);}
      const found=await db(`SELECT * FROM "${object.source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`,params);
      if(!found.rows.length) return res.status(404).json({success:false,message:"Record not found"});
      const request=await submitPlatformApproval({db,object,fields:metadataFields,recordId:req.params.recordId,record:found.rows[0],req,manual:true});
      if(!request) return res.status(422).json({success:false,message:"This record does not meet an active approval process's entry criteria"});
      if(req.body?.comment) await db("UPDATE platform_approval_requests SET submission_comment=$1 WHERE id=$2",[String(req.body.comment).trim(),request.id]);
      res.json({success:true,data:request});
    } catch(error) { console.error("Manual approval submission error:",error); const known=error?.code==="APPROVAL_ASSIGNEE_REQUIRED"; res.status(known?422:500).json({success:false,message:known?error.message:"Unable to submit this record for approval"}); }
  });

  router.post("/platform/approval-requests/:requestId/decision", authenticate, async (req, res) => {
    try {
      const result = await decidePlatformApproval({ db, requestId: req.params.requestId, workItemId: req.body?.workItemId || null, decision: req.body?.decision, comment: req.body?.comment, req });
      res.status(result.status).json(result.status === 200 ? { success: true, data: result.data } : { success: false, message: result.message });
    } catch (error) {
      console.error("Platform approval decision error:", error);
      res.status(500).json({ success: false, message: "Unable to process approval decision" });
    }
  });

  router.post("/platform/approval-requests/:requestId/reassign", authenticate, async (req,res)=>{
    try {
      const result=await reassignPlatformApproval({db,requestId:req.params.requestId,workItemId:req.body?.workItemId||null,assigneeUserId:req.body?.assigneeUserId,comment:req.body?.comment,req});
      res.status(result.status).json(result.status===200?{success:true,data:result.data}:{success:false,message:result.message});
    } catch(error) {
      console.error("Platform approval reassignment error:",error);
      res.status(500).json({success:false,message:"Unable to reassign approval"});
    }
  });

  router.post("/platform/approval-requests/:requestId/recall", authenticate, async (req,res)=>{
    try {
      const result=await recallPlatformApproval({db,requestId:req.params.requestId,comment:req.body?.comment,req});
      res.status(result.status).json(result.status===200?{success:true,data:result.data}:{success:false,message:result.message});
    } catch(error) {
      console.error("Platform approval recall error:",error);
      res.status(500).json({success:false,message:"Unable to recall approval"});
    }
  });

  router.get("/platform/modules", ...manage, async (req, res) => {
    const result = await db("SELECT * FROM platform_modules ORDER BY name");
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/modules/:moduleId", ...manage, async (req, res) => {
    const result = await db("SELECT * FROM platform_modules WHERE id=$1", [req.params.moduleId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Module not found" });
    const objects = await db(
      "SELECT * FROM platform_objects WHERE module_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY label",
      [req.params.moduleId, req.user.companyId]
    );
    res.json({ success: true, data: { ...result.rows[0], objects: objects.rows } });
  });

  router.patch("/platform/modules/:moduleId", ...manage, async (req, res) => {
    if (!await canManageGlobal(db, req)) return res.status(403).json({ success: false, message: "oneengine.manage permission is required to activate or deactivate a platform module" });
    if (typeof req.body.installed !== "boolean") return res.status(400).json({ success: false, message: "installed must be a boolean" });
    const result = await db("UPDATE platform_modules SET installed=$1,updated_at=NOW() WHERE id=$2 RETURNING *", [req.body.installed, req.params.moduleId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Module not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/app-catalog", ...manage, async (req, res) => {
    const result = await db(
      `SELECT m.*, a.enabled AS company_enabled, a.store_id AS enabled_store_id
       FROM platform_modules m
       LEFT JOIN LATERAL (
         SELECT enabled, store_id
         FROM platform_module_access
         WHERE module_id=m.id AND company_id=$1
           AND (store_id IS NULL OR store_id=$2)
         ORDER BY (store_id IS NOT NULL) DESC
         LIMIT 1
       ) a ON TRUE
       ORDER BY m.name`,
      [req.user.companyId, req.user.storeId || null]
    );
    const byKey = new Map(internalAppCatalog.map((entry) => [entry.key, entry]));
    const data = result.rows.map((module) => {
      const definition = byKey.get(module.module_key) || module.metadata || {};
      return {
        ...definition,
        ...module,
        permissions: definition.permissions || [],
        enabled: module.company_enabled ?? module.installed === true,
        company_enabled: module.company_enabled ?? null,
      };
    });
    res.json({ success: true, data });
  });

  router.patch("/platform/app-catalog/:moduleKey", authenticate, authorize("module.access.manage", "settings.manage"), async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be a boolean" });
    }
    const moduleResult = await db(
      "SELECT id FROM platform_modules WHERE module_key=$1",
      [req.params.moduleKey]
    );
    if (!moduleResult.rows.length) return res.status(404).json({ success: false, message: "Application not found" });
    const storeId = req.body.storeId || null;
    if (storeId) {
      const store = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true", [storeId, req.user.companyId]);
      if (!store.rows.length) return res.status(400).json({ success: false, message: "Store is not available to this company" });
    }
    const existing = await db(
      "UPDATE platform_module_access SET enabled=$1,updated_at=NOW() WHERE module_id=$2 AND company_id=$3 AND store_id IS NOT DISTINCT FROM $4 RETURNING *",
      [req.body.enabled, moduleResult.rows[0].id, req.user.companyId, storeId]
    );
    const result = existing.rows.length ? existing : await db(
      `INSERT INTO platform_module_access (module_id, company_id, store_id, enabled)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [moduleResult.rows[0].id, req.user.companyId, storeId, req.body.enabled]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  /*
   * METADATA-DRIVEN OBJECT NAVIGATION (services/platformObjectNavigation.js).
   *
   * ONE bounded payload for the whole menu: the configured pages, the objects
   * they reference, the modules those objects depend on and the caller's object
   * permissions. No fields, layouts, formulas, workflows or records — object
   * metadata loads only when an object page is opened. Every query is scoped to
   * the caller's company; access decisions live in the shared pure service.
   */
  async function loadObjectNavigation(req, { permissions, entitlements }) {
    const pagesResult = await db(
      `SELECT p.id, p.app_id, p.company_id, p.page_key, p.label, p.page_type, p.definition, p.active,
              a.app_key, a.label AS app_label, a.active AS app_active, a.company_id AS app_company_id
         FROM platform_pages p
         JOIN platform_apps a ON a.id = p.app_id
        WHERE p.company_id = $1 AND a.company_id = $1 AND p.active = true AND a.active = true`,
      [req.user.companyId]
    );
    const pages = pagesResult.rows || [];
    if (!pages.length) return { entries: [], excluded: [] };

    const apps = [...new Map(pages.map((page) => [String(page.app_id), {
      id: page.app_id,
      app_key: page.app_key,
      label: page.app_label,
      active: page.app_active,
      company_id: page.app_company_id,
    }])).values()];

    const definitions = pages.map((page) => normalizeObjectPageDefinition(page.definition));
    const objectKeys = [...new Set(definitions.map((definition) => definition.objectKey).filter(Boolean))];

    const objects = objectKeys.length
      ? (await db(
        "SELECT id, object_key, label, active, company_id, module_id FROM platform_objects WHERE object_key = ANY($1::text[]) AND (company_id IS NULL OR company_id = $2)",
        [objectKeys, req.user.companyId]
      )).rows || []
      : [];

    const moduleKeys = [...new Set(definitions.map((definition) => definition.moduleKey).filter(Boolean))];
    const moduleIds = [...new Set(objects.map((object) => object.module_id).filter(Boolean))];

    const modules = (moduleKeys.length || moduleIds.length)
      ? (await db(
        `SELECT m.id, m.module_key, access.enabled AS company_enabled,
                p.package_key, p.manifest AS package_manifest, installation.status AS package_status
           FROM platform_modules m
           JOIN package_registry p ON p.module_id = m.id AND p.active = true
           LEFT JOIN company_package_installations installation
             ON installation.package_id = p.id AND installation.company_id = $1
           LEFT JOIN LATERAL (
             SELECT enabled FROM platform_module_access
              WHERE module_id = m.id AND company_id = $1 AND (store_id IS NULL OR store_id = $4)
              ORDER BY (store_id IS NOT NULL) DESC LIMIT 1
           ) access ON TRUE
          WHERE m.installed = true AND (m.id = ANY($2::uuid[]) OR m.module_key = ANY($3::text[]))`,
        [req.user.companyId, moduleIds, moduleKeys, req.user.storeId || null]
      )).rows || []
      : [];

    const objectIds = objects.map((object) => object.id);
    const objectPermissions = objectIds.length
      ? (await db(
        "SELECT object_id, can_view FROM platform_object_permissions WHERE role_id=$1 AND company_id=$2 AND object_id = ANY($3::uuid[])",
        [req.user.roleId || null, req.user.companyId, objectIds]
      )).rows || []
      : [];

    /* The device/app profile only matters when a page declares one, so the POS
       startup path never pays for the lookup. */
    const needsProfile = definitions.some((definition) => (definition.profiles || []).length > 0);
    let deviceProfile;
    if (needsProfile) {
      const terminal = await db(
        "SELECT app_profile FROM terminals WHERE store_id=$1 AND active=true ORDER BY created_at LIMIT 1",
        [req.user.storeId || null]
      );
      deviceProfile = normalizeDeviceProfile(terminal.rows?.[0]?.app_profile);
    }

    return objectNavigationEntries({
      pages,
      apps,
      objects,
      modules,
      objectPermissions,
      entitlements,
      permissions,
      deviceProfile,
      companyId: req.user.companyId,
    });
  }

  router.get("/platform/runtime/app-catalog", authenticate, async (req, res) => {
    const [permissionResult, permissionSets, moduleResult, entitlementResult] = await Promise.all([
      db(
        `SELECT p.code
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp.permission_id
         WHERE rp.role_id=$1`,
        [req.user.roleId]
      ),
      loadEffectivePermissionSets(db, req.user, req),
      db(
        `SELECT m.*, access.enabled AS company_enabled
                , p.package_key, p.manifest AS package_manifest
                , installation.status AS package_status
         FROM platform_modules m
         JOIN package_registry p ON p.module_id=m.id AND p.active=true
         LEFT JOIN company_package_installations installation
           ON installation.package_id=p.id AND installation.company_id=$1
         LEFT JOIN LATERAL (
           SELECT enabled
           FROM platform_module_access
           WHERE module_id=m.id AND company_id=$1
             AND (store_id IS NULL OR store_id=$2)
           ORDER BY (store_id IS NOT NULL) DESC
           LIMIT 1
         ) access ON TRUE
         WHERE m.installed=true
         ORDER BY m.name`,
        [req.user.companyId, req.user.storeId || null]
      ),
      getCompanyEntitlements(db, req.user.companyId),
    ]);
    const permissions = [...new Set([
      ...permissionResult.rows.map((row) => row.code),
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])];
    const byKey = new Map(internalAppCatalog.map((entry) => [entry.key, entry]));
    const data = moduleResult.rows
      .map((module) => ({ ...byKey.get(module.module_key), ...module }))
      .filter((module) => {
        const definition = byKey.get(module.module_key);
        const requiredPermissions = Array.isArray(definition?.permissions) ? definition.permissions : [];
        return moduleRuntimeAccess({
          enabledByCompany: module.company_enabled ?? true,
          packageInstalled: module.package_status === "active",
          licensed: isPackageLicensed(entitlementResult, { manifest: module.package_manifest || {} }),
          permitted: requiredPermissions.length === 0 || requiredPermissions.some((code) => permissions.includes(code)),
        }).allowed;
      });
    /* The configured Object navigation rides in the SAME payload as the module
       catalogue, so the menu is discovered with one bounded request. */
    const navigation = await loadObjectNavigation(req, { permissions, entitlements: entitlementResult });
    res.json({ success: true, data, objectPages: navigation.entries });
  });

  async function getRecordMetadata(objectKey, req) {
    const objectResult = await db(
      "SELECT * FROM platform_objects WHERE object_key=$1 AND (company_id IS NULL OR company_id=$2)",
      [objectKey, req.user.companyId]
    );
    const object = objectResult.rows[0];
    if (!object) return { object: null, fields: [] };
    const systemDefinition = systemObject(object);
    if (systemDefinition) object.company_scoped = systemDefinition.companyScoped !== false;
    const fieldsResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND (company_id IS NULL OR company_id=$2) ORDER BY active DESC, display_order, label", [object.id, req.user.companyId]);
    return { object, fields: await enrichFields(db, safeSystemFields(object, fieldsResult.rows), req) };
  }

  async function hasExecutionPermission(req, permission) {
    if (!req.user?.id || !permission) return false;
    if (hasPermission) return hasPermission(req, permission);
    const [result, permissionSets] = await Promise.all([
      db(
        `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp.permission_id
         WHERE rp.role_id=$1 AND p.code=$2
         LIMIT 1`,
        [req.user?.roleId, permission]
      ),
      loadEffectivePermissionSets(db, req.user, req),
    ]);
    return result.rows.length > 0 || permissionSetAllowsSystemPermission(permissionSets, permission);
  }

  async function buildUiConditionContext(req, { record = null, object = null, recordTypeId = null } = {}) {
    const [rolePermissionsResult, permissionSets, entitlementMap] = await Promise.all([
      req.user.roleId
        ? db(
            `SELECT p.code
               FROM role_permissions rp
               JOIN permissions p ON p.id=rp.permission_id
              WHERE rp.role_id=$1`,
            [req.user.roleId]
          )
        : Promise.resolve({ rows: [] }),
      loadEffectivePermissionSets(db, req.user, req),
      getCompanyEntitlements(db, req.user.companyId),
    ]);
    const permissions = [...new Set([
      ...rolePermissionsResult.rows.map((row) => row.code),
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])];
    const entitlements = Object.entries(entitlementMap || {})
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key);
    return {
      user: {
        id: req.user.id || null,
        roleId: req.user.roleId || null,
        companyId: req.user.companyId || null,
      },
      permissions,
      roles: [req.user.roleId].filter(Boolean),
      device: layoutFormFactor(req),
      formFactor: layoutFormFactor(req),
      entitlements,
      packages: entitlements,
      recordTypeId: recordTypeId || record?.recordTypeId || record?.record_type_id || null,
      record: record || {},
      object: object || {},
      objectState: object || {},
      companyId: req.user.companyId || null,
    };
  }

  function layoutFormFactor(req) {
    const raw = req.query?.formFactor
      || req.query?.form_factor
      || req.headers["x-oneengine-form-factor"]
      || "desktop";
    const value = String(raw).trim().toLowerCase();
    return ["desktop", "tablet", "mobile"].includes(value) ? value : "desktop";
  }

  async function resolveLayoutApp(req) {
    const requestedId = typeof req.query?.appId === "string" ? req.query.appId : "";
    const requestedKey = typeof req.query?.appKey === "string"
      ? req.query.appKey
      : typeof req.headers["x-oneengine-app-key"] === "string"
        ? req.headers["x-oneengine-app-key"]
        : "";
    if (!requestedId && !requestedKey) return null;
    if (requestedId && !recordIdIsValid(requestedId)) return null;
    if (requestedKey && !isSafeIdentifier(requestedKey)) return null;
    const clauses = ["active=true", "(company_id IS NULL OR company_id=$1)"];
    const params = [req.user.companyId];
    if (requestedId) {
      params.push(requestedId);
      clauses.push(`id=${params.length}`);
    } else {
      params.push(requestedKey);
      clauses.push(`app_key=${params.length}`);
    }
    const result = await db(
      `SELECT * FROM platform_apps WHERE ${clauses.join(" AND ")}
       ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END LIMIT 1`,
      params
    );
    return result.rows[0] || null;
  }

  async function resolveEffectiveLayoutForRequest({ objectId, pageType, recordTypeId = null, req }) {
    const layoutsResult = await db(
      `SELECT * FROM platform_layouts
        WHERE object_id=$1 AND page_type=$2 AND active=true
          AND (company_id IS NULL OR company_id=$3)
        ORDER BY is_default DESC,updated_at DESC,id`,
      [objectId, pageType, req.user.companyId]
    );
    const layouts = layoutsResult.rows || [];
    if (!layouts.length) return null;

    const layoutIds = layouts.map((layout) => layout.id);
    const assignmentsResult = await db(
      `SELECT * FROM platform_layout_assignments
        WHERE layout_id=ANY($1::uuid[]) AND active=true
          AND (company_id IS NULL OR company_id=$2)
        ORDER BY priority DESC,updated_at DESC,id`,
      [layoutIds, req.user.companyId]
    );

    const permissionCache = new Map();
    const assignments = [];
    for (const assignment of assignmentsResult.rows || []) {
      const required = Array.isArray(assignment.required_permissions)
        ? assignment.required_permissions.filter((permission) => typeof permission === "string" && permission.trim())
        : [];
      let allowed = true;
      for (const permission of required) {
        if (!permissionCache.has(permission)) permissionCache.set(permission, await hasExecutionPermission(req, permission));
        if (!permissionCache.get(permission)) {
          allowed = false;
          break;
        }
      }
      if (allowed) assignments.push(assignment);
    }

    const app = await resolveLayoutApp(req);
    return resolveAssignedPageLayout(layouts, assignments, {
      companyId: req.user.companyId,
      roleId: req.user.roleId || null,
      recordTypeId: recordTypeId || null,
      appId: app?.id || null,
      deviceProfile: layoutFormFactor(req),
    });
  }

  router.get("/platform/runtime/settings-catalog", authenticate, async (req, res, next) => {
    try {
      /*
       * Lightweight shell metadata only. This endpoint deliberately does NOT
       * load Object fields/layouts/workflows: opening Settings must never wait
       * on full platform metadata.
       */
      const [permissionResult, permissionSets, hostedObjectsResult] = await Promise.all([
        db(
          `SELECT p.code
             FROM role_permissions rp
             JOIN permissions p ON p.id=rp.permission_id
            WHERE rp.role_id=$1`,
          [req.user.roleId]
        ),
        loadEffectivePermissionSets(db, req.user, req),
        db(
          `SELECT id,object_key,label,config
             FROM platform_objects
            WHERE active=TRUE
              AND (company_id IS NULL OR company_id=$1)
              AND COALESCE((config->>'settingsHost')::boolean,FALSE)=TRUE
            ORDER BY COALESCE((config->>'settingsOrder')::integer,999), label`,
          [req.user.companyId]
        ),
      ]);
      const permissions = [...new Set([
        ...permissionResult.rows.map((row) => row.code),
        ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
      ])];
      // Settings navigation is RBAC/install metadata only. Licence validity is
      // enforced by the licensed action at runtime, never by shell bootstrap.
      const catalog = buildSettingsCatalog({ permissions });

      /* Object-hosted Settings sections extend the same catalogue. Only the
         object identity + Settings presentation config is returned here; the
         canonical Object runtime fetches its own metadata after selection.

         Reuse the role permission query above for oneengine.manage instead of
         re-querying it once per hosted object. For other roles, resolve object
         visibility concurrently so this lightweight catalogue cannot degrade
         into a sequential N+1 request chain. */
      const hostedObjects = hostedObjectsResult.rows || [];
      const visibleHostedObjects = permissions.includes("oneengine.manage")
        ? hostedObjects
        : (await Promise.all(
            hostedObjects.map(async (object) => ({
              object,
              canView: await hasPlatformObjectPermission(db, req, object.id, "view"),
            }))
          ))
            .filter((entry) => entry.canView)
            .map((entry) => entry.object);

      for (const object of visibleHostedObjects) {
        const config = object.config || {};
        const groupKey = String(config.settingsGroupKey || "platform");
        if (!catalog.groups.some((group) => group.key === groupKey)) {
          catalog.groups.push({
            key: groupKey,
            label: String(config.settingsGroupLabel || "Platform"),
            order: Number(config.settingsGroupOrder ?? 90),
          });
        }
        catalog.sections.push({
          key: String(config.settingsKey || object.object_key),
          label: String(config.settingsLabel || object.label),
          groupKey,
          order: Number(config.settingsOrder ?? 999),
          iconKey: String(config.settingsIconKey || "layout-grid"),
          description: String(config.settingsDescription || object.label || ""),
          action: { type: "object", objectKey: object.object_key },
        });
      }

      catalog.groups.sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label).localeCompare(String(b.label)));
      catalog.sections.sort((a, b) => {
        const ga = catalog.groups.findIndex((group) => group.key === a.groupKey);
        const gb = catalog.groups.findIndex((group) => group.key === b.groupKey);
        return ga - gb || Number(a.order || 0) - Number(b.order || 0) || String(a.label).localeCompare(String(b.label));
      });
      res.json({ success: true, data: catalog });
    } catch (error) { next(error); }
  });

  router.get("/platform/runtime/objects/:objectKey/buttons", authenticate, async (req, res, next) => {
    try {
      const { object } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });
      const params = [object.id, req.user.companyId];
      let placementSql = "";
      if (req.query.placement) {
        params.push(String(req.query.placement));
        placementSql = ` AND placement=${params.length}`;
      }
      const result = await db(
        `SELECT * FROM platform_buttons
          WHERE object_id=$1 AND active=TRUE
            AND (company_id IS NULL OR company_id=$2)${placementSql}
          ORDER BY COALESCE((config->>'order')::integer, 999), created_at, label`,
        params
      );
      const visible = [];
      for (const button of result.rows || []) {
        if (button.required_permission && !(await hasExecutionPermission(req, button.required_permission))) continue;
        visible.push(button);
      }
      res.json({ success: true, data: visible });
    } catch (error) { next(error); }
  });

  router.post("/platform/runtime/objects/:objectKey/buttons/:buttonKey/execute", authenticate, async (req, res, next) => {
    try {
      const { object } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Object not found" });

      const buttonResult = await db(
        `SELECT * FROM platform_buttons
          WHERE object_id=$1 AND button_key=$2 AND active=true
            AND (company_id IS NULL OR company_id=$3)
          LIMIT 1`,
        [object.id, req.params.buttonKey, req.user.companyId]
      );
      const button = buttonResult.rows[0];
      if (!button) return res.status(404).json({ success: false, message: "Registered button not found" });
      if (button.required_permission && !(await hasExecutionPermission(req, button.required_permission))) {
        return res.status(403).json({ success: false, message: "You do not have permission to execute this button" });
      }

      const context = req.body?.context && typeof req.body.context === "object" && !Array.isArray(req.body.context)
        ? req.body.context
        : {};
      const recordId = req.body?.recordId || null;
      if (recordId) {
        if (!recordIdIsValid(recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
        return res.status(409).json({
          success: false,
          code: "USE_PERSISTED_BUTTON_ENDPOINT",
          message: "Persisted record buttons must use the record-scoped execution endpoint",
        });
      }

      const virtualRecord = {
        id: null,
        company_id: req.user.companyId || null,
        store_id: req.user.storeId || context.storeId || null,
        terminal_id: context.terminalId || null,
        customer_id: context.customerId || null,
        subtotal: Number(context.subtotal || 0),
        tax: Number(context.tax || context.vat || 0),
        discount: Number(context.discount || 0),
        total: Number(context.total || 0),
        basket: Array.isArray(context.basket) ? context.basket.slice(0, 500) : [],
        source: "TILL_RUNTIME",
      };

      if (button.target_type === "workflow") {
        if (!(await hasExecutionPermission(req, "workflow.execute"))) {
          return res.status(403).json({ success: false, message: "You do not have permission to execute workflows" });
        }
        const workflowResult = await db(
          `SELECT * FROM platform_rules
            WHERE object_id=$1 AND active=true
              AND (company_id IS NULL OR company_id=$2)
              AND (id::text=$3 OR name=$3)
            LIMIT 1`,
          [object.id, req.user.companyId, button.target_key]
        );
        const workflow = workflowResult.rows[0];
        if (!workflow) return res.status(404).json({ success: false, message: "Configured workflow not found" });

        const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
        if (!actions.length) return res.status(422).json({ success: false, message: "Configured workflow contains no executable actions" });

        for (const workflowAction of actions) {
          validateWorkflowAction(workflowAction);
          const definition = getWorkflowActionDefinition(workflowAction.type || workflowAction.key);
          for (const requiredPermission of definition?.requiredPermissions || []) {
            if (!(await hasExecutionPermission(req, requiredPermission))) {
              return res.status(403).json({ success: false, message: `You do not have permission to execute ${workflowAction.type || workflowAction.key}` });
            }
          }
        }

        const run = await createWorkflowRun({
          db,
          companyId: req.user.companyId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          objectId: object.id,
          recordId: null,
          triggerKey: "till_button",
          status: "RUNNING",
          metadata: {
            buttonKey: button.button_key,
            actorUserId: req.user.id || null,
            storeId: virtualRecord.store_id,
            terminalId: virtualRecord.terminal_id,
          },
        });

        const results = await executeWorkflowActions({
          actions,
          db,
          pool,
          req,
          object,
          record: virtualRecord,
          recordId: null,
          companyId: req.user.companyId,
          runId: run?.id || null,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          trigger: "till_button",
        });
        const waiting = workflowResultsContainStatus(results, "waiting");
        if (run?.id) {
          await db(
            `UPDATE platform_workflow_runs
                SET status=$1,
                    completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                    updated_at=NOW()
              WHERE id=$2 AND company_id=$3`,
            [waiting ? "WAITING" : "COMPLETED", run.id, req.user.companyId]
          );
        }
        return res.json({ success: true, data: { results, runId: run?.id || null, status: waiting ? "WAITING" : "COMPLETED" } });
      }

      const target = await resolveButtonTarget(req, {
        targetType: "action",
        targetKey: button.target_key || button.action_key,
      }, object.id);
      if (target.error) return res.status(422).json({ success: false, message: target.error });

      const handlerKey = target.handlerKey;
      if (["RECORD_SAVE", "RECORD_DELETE", "UPDATE_RECORD", "DELETE_RECORD"].includes(String(handlerKey || "").toUpperCase())) {
        return res.status(409).json({
          success: false,
          code: "PERSISTED_RECORD_REQUIRED",
          message: "This action requires a completed Sale record",
        });
      }

      const definition = getWorkflowActionDefinition(handlerKey);
      if (!definition) return res.status(422).json({ success: false, message: "Registered action handler is unavailable" });
      for (const permission of definition.requiredPermissions || []) {
        if (!(await hasExecutionPermission(req, permission))) {
          return res.status(403).json({ success: false, message: `You do not have permission to execute ${handlerKey}` });
        }
      }

      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: `action:${handlerKey}`,
        req,
        input: {
          ...(target.action?.config || {}),
          inputs: {
            ...(button.input_mappings || {}),
            ...(req.body?.inputs && typeof req.body.inputs === "object" ? req.body.inputs : {}),
            till: virtualRecord,
          },
        },
        object,
        record: virtualRecord,
        recordId: null,
        storeId: req.user.storeId || null,
        connectorDrivers: req.app?.locals?.connectorDrivers || null,
        writeAudit: req.app?.locals?.writeAudit || null,
        source: { type: "button", method: req.method, path: req.originalUrl || req.path, capability: handlerKey },
        extraContext: { pool },
      });
      return res.json({ success: true, data: execution.result, workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/platform/objects/:objectKey/records/:recordId/buttons/:buttonKey/execute", authenticate, async (req, res, next) => {
    try {
      if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
      const { object, fields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) return res.status(404).json({ success: false, message: "Object records are not available" });
      const buttonResult = await db(
        `SELECT * FROM platform_buttons WHERE object_id=$1 AND button_key=$2 AND active=true AND (company_id IS NULL OR company_id=$3) LIMIT 1`,
        [object.id, req.params.buttonKey, req.user.companyId]
      );
      const button = buttonResult.rows[0];
      if (!button) return res.status(404).json({ success: false, message: "Registered button not found" });
      if (button.required_permission && !(await hasExecutionPermission(req, button.required_permission))) {
        return res.status(403).json({ success: false, message: "You do not have permission to execute this button" });
      }
      const recordClauses = ["id=$1"], recordParams = [req.params.recordId];
      if (object.company_scoped) { recordParams.push(req.user.companyId); recordClauses.push(`company_id=$${recordParams.length}`); }
      if (object.store_scoped) {
        if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
        recordParams.push(req.user.storeId); recordClauses.push(`store_id=$${recordParams.length}`);
      }
      appendSystemReadScope(object, req, recordClauses, recordParams);
      const recordResult = await db(`SELECT * FROM "${object.source_table}" WHERE ${recordClauses.join(" AND ")}`, recordParams);
      if (!recordResult.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
      const record = recordResult.rows[0];
      const association = await db(
        "SELECT record_type_id FROM platform_record_associations WHERE object_id=$1 AND record_id=$2 AND company_id=$3 LIMIT 1",
        [object.id, req.params.recordId, req.user.companyId]
      );
      const recordTypeId = association.rows[0]?.record_type_id || null;
      try {
        const visibilityContext = await buildUiConditionContext(req, { record, object, recordTypeId });
        if (!evaluatePlatformCondition(button.visibility_rule, fields, visibilityContext)) {
          return res.status(404).json({ success: false, message: "Registered button is not available for this record" });
        }
      } catch (error) {
        if (error instanceof ConditionError) {
          return res.status(422).json({ success: false, code: error.code, message: "Registered button visibility metadata is invalid" });
        }
        throw error;
      }

      if (button.target_type === "workflow") {
        const workflowResult = await db(
          `SELECT * FROM platform_rules WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) AND (id::text=$3 OR name=$3) LIMIT 1`,
          [object.id, req.user.companyId, button.target_key]
        );
        const workflow = workflowResult.rows[0];
        if (!workflow) return res.status(404).json({ success: false, message: "Configured workflow not found" });
        const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
        if (!actions.length) return res.status(422).json({ success: false, message: "Configured workflow contains no executable actions" });
        const run = await createWorkflowRun({
          db,
          companyId: req.user.companyId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          objectId: object.id,
          recordId: req.params.recordId,
          triggerKey: "record_page_button",
          status: "RUNNING",
          metadata: { buttonKey: button.button_key, actorUserId: req.user.id || null, storeId: req.user.storeId || null },
        });
        const results = await executeWorkflowActions({
          actions,
          db,
          pool,
          req,
          object,
          record,
          recordId: req.params.recordId,
          companyId: req.user.companyId,
          runId: run?.id || null,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          trigger: "record_page_button",
        });
        const waiting = workflowResultsContainStatus(results, "waiting");
        if (run?.id) {
          await db(
            `UPDATE platform_workflow_runs
                SET status=$1,
                    completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                    updated_at=NOW()
              WHERE id=$2 AND company_id=$3`,
            [waiting ? "WAITING" : "COMPLETED", run.id, req.user.companyId]
          );
        }
        return res.json({ success: true, data: { results, runId: run?.id || null, status: waiting ? "WAITING" : "COMPLETED" } });
      }

      const target = await resolveButtonTarget(req, {
        targetType: "action",
        targetKey: button.target_key || button.action_key,
      }, object.id);
      if (target.error) return res.status(422).json({ success: false, message: target.error });
      const handlerKey = target.handlerKey;
      if (["RECORD_SAVE", "RECORD_DELETE"].includes(handlerKey)) {
        return res.status(409).json({ success: false, message: `${handlerKey} is handled by the canonical record page lifecycle` });
      }
      const definition = getWorkflowActionDefinition(handlerKey);
      if (!definition) return res.status(422).json({ success: false, message: "Registered action handler is unavailable" });
      for (const permission of definition.requiredPermissions || []) {
        if (!(await hasExecutionPermission(req, permission))) return res.status(403).json({ success: false, message: `You do not have permission to execute ${handlerKey}` });
      }
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: `action:${handlerKey}`,
        req,
        input: {
          ...(target.action?.config || {}),
          inputs: { ...(button.input_mappings || {}), ...(req.body?.inputs || {}) },
        },
        object,
        record,
        recordId: req.params.recordId,
        storeId: req.user.storeId || null,
        connectorDrivers: req.app?.locals?.connectorDrivers || null,
        writeAudit: req.app?.locals?.writeAudit || null,
        source: { type: "button", method: req.method, path: req.originalUrl || req.path, capability: handlerKey },
        extraContext: { pool },
      });
      return res.json({ success: true, data: execution.result, workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) { next(error); }
  });

  router.post("/platform/objects/:objectKey/records/:recordId/actions/:actionKey/execute", authenticate, async (req, res, next) => {
    try {
      if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });

      const { object, fields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
        return res.status(404).json({ success: false, message: "Object records are not available" });
      }

      const recordClauses = ["id=$1"];
      const recordParams = [req.params.recordId];
      if (object.company_scoped) {
        recordParams.push(req.user.companyId);
        recordClauses.push(`company_id=$${recordParams.length}`);
      }
      if (object.store_scoped) {
        if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
        recordParams.push(req.user.storeId);
        recordClauses.push(`store_id=$${recordParams.length}`);
      }
      appendSystemReadScope(object, req, recordClauses, recordParams);
      const recordResult = await db(
        `SELECT * FROM "${object.source_table}" WHERE ${recordClauses.join(" AND ")}`,
        recordParams
      );
      if (!recordResult.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
      const record = recordResult.rows[0];

      const association = await db(
        "SELECT record_type_id FROM platform_record_associations WHERE object_id=$1 AND record_id=$2 AND company_id=$3 LIMIT 1",
        [object.id, req.params.recordId, req.user.companyId]
      );
      const recordTypeId = association.rows[0]?.record_type_id || null;
      const selectedLayout = await resolveEffectiveLayoutForRequest({
        objectId: object.id,
        pageType: "detail",
        recordTypeId,
        req,
      });
      const components = normalizePageDefinition(selectedLayout?.definition).components;
      const component = components.find((candidate, index) =>
        candidate?.type === "action" &&
        candidate?.visible !== false &&
        configuredActionKey(candidate, index) === req.params.actionKey
      );
      if (!component) return res.status(404).json({ success: false, message: "Configured record action not found" });

      try {
        const visibilityContext = await buildUiConditionContext(req, { record, object, recordTypeId });
        if (!evaluatePlatformCondition(component.visibilityCondition, fields, visibilityContext)) {
          return res.status(404).json({ success: false, message: "Configured record action is not available for this record" });
        }
      } catch (error) {
        if (error instanceof ConditionError) {
          return res.status(422).json({ success: false, code: error.code, message: "Configured action visibility metadata is invalid" });
        }
        throw error;
      }

      const action = String(component.action || "").toLowerCase();
      const permission = action === "run_workflow" ? "workflow.execute" : action === "call_function" ? "functions.execute" : null;
      if (!permission) return res.status(400).json({ success: false, message: "This record action is not executable" });
      if (!(await hasExecutionPermission(req, permission))) return res.status(403).json({ success: false, message: "You do not have permission to execute this action" });

      if (action === "call_function") {
        const functionKey = component.functionKey || component.function_key;
        const definition = getRegisteredFunction(functionKey);
        if (!definition) return res.status(422).json({ success: false, message: "Configured registered function is unavailable" });
        const execution = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: `function:${functionKey}`,
          req,
          input: component.inputs || {},
          object,
          record,
          recordId: req.params.recordId,
          storeId: req.user.storeId || null,
          source: { type: "record_component", method: req.method, path: req.originalUrl || req.path, capability: functionKey },
        });
        return res.json({ success: true, data: execution.result, workflowRunId: execution.runId, correlationId: execution.correlationId });
      }

      const workflowId = component.workflowId || component.workflow_id || component.ruleId || component.rule_id;
      if (!workflowId) return res.status(422).json({ success: false, message: "Configured workflow is missing" });
      const workflowResult = await db(
        `SELECT * FROM platform_rules
         WHERE id=$1 AND active=true AND object_id=$2
           AND (company_id IS NULL OR company_id=$3)
         LIMIT 1`,
        [workflowId, object.id, req.user.companyId]
      );
      const workflow = workflowResult.rows[0];
      if (!workflow) return res.status(404).json({ success: false, message: "Configured workflow not found" });
      const actions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
      if (!actions.length) return res.status(422).json({ success: false, message: "Configured workflow contains no executable actions" });
      for (const workflowAction of actions) {
        validateWorkflowAction(workflowAction);
        const definition = getWorkflowActionDefinition(workflowAction.type || workflowAction.key);
        for (const requiredPermission of definition?.requiredPermissions || []) {
          if (!(await hasExecutionPermission(req, requiredPermission))) {
            return res.status(403).json({ success: false, message: `You do not have permission to execute ${workflowAction.type || workflowAction.key}` });
          }
        }
      }

      const run = await createWorkflowRun({
        db,
        companyId: req.user.companyId,
        workflowId: workflow.id,
        workflowName: workflow.name,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
        objectId: object.id,
        recordId: req.params.recordId,
        triggerKey: "record_page_action",
        status: "RUNNING",
        metadata: { actionKey: req.params.actionKey, actorUserId: req.user.id || null },
      });
      try {
        const results = await executeWorkflowActions({
          actions,
          db,
          req,
          object,
          record,
          recordId: req.params.recordId,
          companyId: req.user.companyId,
          runId: run?.id || null,
          workflowVersion: Number(workflow.active_version || workflow.version || 1),
          trigger: "record_page_action",
        });
        const waiting = workflowResultsContainStatus(results, "waiting");
        if (run?.id) {
          await db(
            `UPDATE platform_workflow_runs
                SET status=$1,
                    completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                    updated_at=NOW()
              WHERE id=$2 AND company_id=$3`,
            [waiting ? "WAITING" : "COMPLETED", run.id, req.user.companyId]
          );
        }
        return res.json({ success: true, data: { runId: run?.id || null, status: waiting ? "WAITING" : "COMPLETED", results } });
      } catch (error) {
        if (run?.id) {
          await db(
            "UPDATE platform_workflow_runs SET status=$1, completed_at=NOW(), updated_at=NOW(), metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$3 AND company_id=$4",
            ["FAILED", JSON.stringify({ error: error.message || "Workflow execution failed" }), run.id, req.user.companyId]
          );
        }
        throw error;
      }
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      next(error);
    }
  });

  async function resolveImportLookupMatches(targetObject, targetFields, rawValue, req) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === null || value === undefined || value === "") return { matches: [], ambiguous: false, reason: null };
    const safeText = String(value);
    if (recordIdIsValid(safeText)) {
      const scope = ["id=$1"];
      const params = [safeText];
      if (targetObject.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (targetObject.store_scoped) { if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 }); params.push(req.user.storeId); scope.push(`store_id=$${params.length}`); }
      const result = await db(`SELECT id FROM "${targetObject.source_table}" WHERE ${scope.join(" AND ")}`, params);
      return { matches: result.rows.map((row) => String(row.id)), ambiguous: false, reason: null };
    }
    const candidates = (targetFields || []).filter((field) => {
      if (!field || field.active === false || field.field_type === "formula" || field.field_type === "rollup") return false;
      const config = field.config && typeof field.config === "object" ? field.config : {};
      const api = String(field.api_name || "").toLowerCase();
      const isUnique = field.unique === true || config.unique === true || config.businessKey === true || config.business_key === true || config.uniqueBusinessKey === true || config.unique_business_key === true || config.externalId === true || config.external_id === true;
      return isUnique || /(?:sku|barcode|code|external|serial|reference|number|identifier)$/.test(api) || /(?:sku|barcode|code|external|serial|reference|number|identifier)/.test(String(field.label || "").toLowerCase());
    });
    const matches = [];
    for (const field of candidates) {
      const normalized = normalizeFieldValue(field, safeText);
      if (normalized === null || normalized === "") continue;
      const scope = [`${metadataColumn(field)}=$1`];
      const params = [normalized];
      if (targetObject.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (targetObject.store_scoped) { if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 }); params.push(req.user.storeId); scope.push(`store_id=$${params.length}`); }
      const result = await db(`SELECT id FROM "${targetObject.source_table}" WHERE ${scope.join(" AND ")}`, params);
      for (const row of result.rows) matches.push(String(row.id));
    }
    const unique = [...new Set(matches)];
    return { matches: unique, ambiguous: unique.length > 1, reason: unique.length > 1 ? "ambiguous" : null };
  }

  const LOOKUP_FILTER_OPERATORS = new Set(["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "contains", "is_empty", "is_not_empty"]);
  const LOOKUP_FILTER_SOURCES = new Set(["literal", "source_field", "user"]);

  function lookupFilterConfig(fieldOrConfig) {
    const config = fieldOrConfig?.config && typeof fieldOrConfig.config === "object" ? fieldOrConfig.config : fieldOrConfig;
    const filter = config?.lookupFilter || config?.lookup_filter;
    if (!filter || typeof filter !== "object" || Array.isArray(filter) || filter.active === false) return null;
    return {
      active: true,
      required: filter.required !== false,
      match: filter.match === "any" ? "any" : "all",
      conditions: Array.isArray(filter.conditions) ? filter.conditions : [],
    };
  }

  function lookupFilterValue(condition, sourceRecord, req) {
    const source = condition.valueSource || condition.value_source || "literal";
    if (source === "source_field") return sourceRecord?.[condition.sourceField || condition.source_field];
    if (source === "user") {
      const key = condition.userField || condition.user_field || "id";
      if (key === "id") return req.user?.id;
      if (key === "roleId") return req.user?.roleId;
      if (key === "companyId") return req.user?.companyId;
      if (key === "storeId") return req.user?.storeId;
      return null;
    }
    return condition.value;
  }

  function lookupFilterConditionMatches(condition, targetRecord, sourceRecord, req) {
    const left = targetRecord?.[condition.targetField || condition.target_field];
    const operator = condition.operator || "equals";
    if (operator === "is_empty") return left === null || left === undefined || left === "";
    if (operator === "is_not_empty") return left !== null && left !== undefined && left !== "";
    const right = lookupFilterValue(condition, sourceRecord, req);
    if (operator === "equals") return String(left ?? "") === String(right ?? "");
    if (operator === "not_equals") return String(left ?? "") !== String(right ?? "");
    if (operator === "contains") return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    if (left === null || left === undefined || right === null || right === undefined) return false;
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
    const a = numeric ? leftNumber : String(left);
    const b = numeric ? rightNumber : String(right);
    if (operator === "greater_than") return a > b;
    if (operator === "greater_than_or_equal") return a >= b;
    if (operator === "less_than") return a < b;
    if (operator === "less_than_or_equal") return a <= b;
    return false;
  }

  async function lookupFilterAllows(field, targetObject, targetFields, targetRecordId, sourceRecord, req) {
    const filter = lookupFilterConfig(field);
    if (!filter || !filter.conditions.length || filter.required === false) return true;
    const scope = ["id=$1"];
    const params = [targetRecordId];
    if (targetObject.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
    if (targetObject.store_scoped) {
      if (!req.user.storeId) return false;
      params.push(req.user.storeId); scope.push(`store_id=$${params.length}`);
    }
    const result = await db(`SELECT * FROM "${targetObject.source_table}" WHERE ${scope.join(" AND ")} LIMIT 1`, params);
    if (!result.rows.length) return false;
    const hydrated = await hydrateExtensions(db, targetObject, targetFields, result.rows, req);
    const targetRecord = hydrated[0] || result.rows[0];
    const matches = filter.conditions.map((condition) => lookupFilterConditionMatches(condition, targetRecord, sourceRecord, req));
    return filter.match === "any" ? matches.some(Boolean) : matches.every(Boolean);
  }

  async function validateLookupReference(field, value, req, sourceRecord = {}) {
    if (field.field_type !== "lookup" || !field.config || typeof field.config !== "object") return { value };
    const targetKey = field.config.relatedObjectKey || field.config.related_object_key || field.config.objectKey;
    let targetObject = null;
    let targetFields = [];
    if (targetKey) {
      const targetResult = await db("SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [targetKey, req.user.companyId]);
      targetObject = targetResult.rows[0];
      if (targetObject) {
        const metadata = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order", [targetObject.id, req.user.companyId]);
        targetFields = await enrichFields(db, safeSystemFields(targetObject, metadata.rows), req);
      }
    }
    if (!targetObject || !targetObject.source_table || !isSafeIdentifier(targetObject.source_table)) {
      return { error: `${field.label} references an unavailable object` };
    }
    if (value === null || value === undefined || value === "") return { value: null };
    const matchResult = await resolveImportLookupMatches(targetObject, targetFields, value, req);
    if (!matchResult.matches.length) return { error: `${field.label} references a record that does not exist` };
    if (matchResult.ambiguous) return { error: `${field.label} match is ambiguous; multiple records satisfy the configured relationship key` };
    const resolvedId = matchResult.matches[0];
    if (!(await lookupFilterAllows(field, targetObject, targetFields, resolvedId, sourceRecord, req))) {
      return { error: `${field.label} does not match the configured lookup filter` };
    }
    return { value: resolvedId };
  }

  async function validateLookupConfiguration(objectId, fieldType, config, req) {
    if (fieldType !== "lookup") return;
    const relationshipKey = config?.relationshipKey;
    if (!relationshipKey) throw new ConditionError("Lookup fields must select a relationship");
    const relationship = await db(
      "SELECT r.*, p.object_key AS parent_object_key, c.object_key AS child_object_key FROM platform_relationships r JOIN platform_objects p ON p.id=r.parent_object_id JOIN platform_objects c ON c.id=r.child_object_id WHERE r.relationship_key=$1 AND r.active=true AND ((r.parent_object_id=$2) OR (r.child_object_id=$2)) AND (p.company_id IS NULL OR p.company_id=$3) AND (c.company_id IS NULL OR c.company_id=$3)",
      [relationshipKey, objectId, req.user.companyId]
    );
    if (!relationship.rows[0]) throw new ConditionError("Lookup relationship is not available for this object");
    const current = relationship.rows[0];
    const targetObjectKey = String(current.parent_object_id) === String(objectId)
      ? current.child_object_key
      : current.parent_object_key;
    if (config.relatedObjectKey && config.relatedObjectKey !== targetObjectKey) {
      throw new ConditionError("Lookup target does not match the selected relationship");
    }
    const filter = lookupFilterConfig(config);
    if (!filter) return;
    if (!filter.conditions.length || filter.conditions.length > 10) throw new ConditionError("Lookup filters require between 1 and 10 conditions");
    const [sourceFieldsResult, targetObjectResult] = await Promise.all([
      db("SELECT api_name FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [objectId, req.user.companyId]),
      db("SELECT id FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1", [targetObjectKey, req.user.companyId]),
    ]);
    const targetObjectId = targetObjectResult.rows[0]?.id;
    const targetFieldsResult = targetObjectId
      ? await db("SELECT api_name FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [targetObjectId, req.user.companyId])
      : { rows: [] };
    const sourceFields = new Set(sourceFieldsResult.rows.map((item) => item.api_name));
    const targetFields = new Set(targetFieldsResult.rows.map((item) => item.api_name));
    for (const condition of filter.conditions) {
      const targetField = condition?.targetField || condition?.target_field;
      const valueSource = condition?.valueSource || condition?.value_source || "literal";
      if (!isSafeIdentifier(targetField) || !targetFields.has(targetField)) throw new ConditionError("Lookup filter must reference an active target field");
      if (!LOOKUP_FILTER_OPERATORS.has(condition?.operator || "equals")) throw new ConditionError("Lookup filter uses an unsupported operator");
      if (!LOOKUP_FILTER_SOURCES.has(valueSource)) throw new ConditionError("Lookup filter uses an unsupported value source");
      if (valueSource === "source_field") {
        const sourceField = condition?.sourceField || condition?.source_field;
        if (!isSafeIdentifier(sourceField) || !sourceFields.has(sourceField)) throw new ConditionError("Lookup filter must reference an active source field");
      }
      if (valueSource === "user" && !["id", "roleId", "companyId", "storeId"].includes(condition?.userField || condition?.user_field || "id")) {
        throw new ConditionError("Lookup filter uses an unsupported user field");
      }
    }
  }

  async function resolveRecordType(object, recordTypeId, req) {
    if (!recordTypeId) return null;
    const result = await db("SELECT * FROM platform_record_types WHERE id=$1 AND object_id=$2 AND company_id=$3 AND active=true", [recordTypeId, object.id, req.user.companyId]);
    return result.rows[0] || null;
  }

  async function validateRecordTypeRestrictions(object, restrictions, req) {
    if (!restrictions || typeof restrictions !== "object" || Array.isArray(restrictions)) {
      throw new ConditionError("Picklist restrictions must be an object");
    }

    async function validateRecordTypeDefaults(object, defaults, req) {
      if (defaults === undefined || defaults === null) return;
      if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
        throw new ConditionError("Record type default values must be an object");
      }
      const names = Object.keys(defaults);
      if (names.some((name) => !isSafeIdentifier(name))) throw new ConditionError("Record type defaults must use field API names");
      if (!names.length) return;
      const fields = await db(
        "SELECT api_name,field_type,active,readable,writable FROM platform_fields WHERE object_id=$1 AND api_name=ANY($2::text[]) AND active=true AND (company_id IS NULL OR company_id=$3)",
        [object.id, names, req.user.companyId]
      );
      const available = new Map(fields.rows.map((field) => [field.api_name, field]));
      for (const name of names) {
        const field = available.get(name);
        if (!field || field.writable === false || ["formula", "rollup"].includes(field.field_type)) {
          throw new ConditionError(`Record type default field "${name}" is not writable on this object`);
        }
      }
    }

    const fieldIds = Object.keys(restrictions);
    if (!fieldIds.length) return;
    if (fieldIds.some((fieldId) => !recordIdIsValid(fieldId))) {
      throw new ConditionError("Record type restrictions must reference valid field identifiers");
    }

    const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND id=ANY($2::uuid[]) AND active=true AND (company_id IS NULL OR company_id=$3)", [object.id, fieldIds, req.user.companyId]);
    const fieldsById = new Map(fields.rows.map((field) => [String(field.id), field]));

    for (const [fieldId, values] of Object.entries(restrictions)) {
      const field = fieldsById.get(String(fieldId));
      if (!field || !["select", "picklist", "multiselect"].includes(field.field_type)) {
        throw new ConditionError("Record type restrictions must reference active picklist fields on this object");
      }
      if (!Array.isArray(values) || values.length === 0) {
        throw new ConditionError("Each record type picklist restriction must contain at least one value");
      }

      const options = await valueSetOptions(db, field, req);
      const activeValues = new Set(options.filter((option) => option.active !== false).map((option) => String(option.value)));
      for (const value of values) {
        const normalized = String(value);
        if (!isSafeIdentifier(normalized) || !activeValues.has(normalized)) {
          throw new ConditionError("Record type restrictions must use active configured picklist values");
        }
      }
    }
  }

  async function validateRecordTypeValues(object, fields, recordType, input, req) {
    if (!recordType) return null;
    const restrictions = await db("SELECT field_id,value FROM platform_record_type_picklist_values WHERE record_type_id=$1 AND active=true", [recordType.id]);
    const byField = new Map();
    for (const row of restrictions.rows) {
      if (!byField.has(row.field_id)) byField.set(row.field_id, new Set());
      byField.get(row.field_id).add(row.value);
    }
    for (const field of fields) {
      const allowed = byField.get(field.id);
      if (!allowed || input[field.api_name] === undefined || input[field.api_name] === null || input[field.api_name] === "") continue;
      const selected = Array.isArray(input[field.api_name]) ? input[field.api_name] : [input[field.api_name]];
      if (selected.some((value) => !allowed.has(String(value)))) return `${field.label} is not available for record type ${recordType.label}`;
    }
    return null;
  }

  async function associateRecordType(object, recordId, recordType, req) {
    if (!recordType) {
      await db("DELETE FROM platform_record_associations WHERE object_id=$1 AND record_id=$2 AND company_id=$3", [object.id, recordId, req.user.companyId]);
      return;
    }
    await db("INSERT INTO platform_record_associations (object_id,record_id,record_type_id,company_id) VALUES ($1,$2,$3,$4) ON CONFLICT (object_id,record_id) DO UPDATE SET record_type_id=EXCLUDED.record_type_id,updated_at=NOW()", [object.id, recordId, recordType.id, req.user.companyId]);
  }

  async function loadRecordTypeAssociations(object, recordIds, req) {
    if (!recordIds.length) return { rows: [] };
    try {
      return await db(
        "SELECT record_id,record_type_id FROM platform_record_associations WHERE object_id=$1 AND company_id=$2 AND record_id=ANY($3::uuid[])",
        [object.id, req.user.companyId, recordIds]
      );
    } catch (error) {
      if (error.code) throw error;
      console.warn("Platform record type associations are unavailable; returning records without type metadata.");
      return { rows: [] };
    }
  }

  async function writeRecordHistory(object, recordId, fields, oldRecord, newRecord, action, req) {
    const trendingFields = new Set(object?.config?.historicalTrending?.enabled === true && Array.isArray(object?.config?.historicalTrending?.fields) ? object.config.historicalTrending.fields.map(String) : []);
    const changes = fields.filter((field) => {
      const config = field?.config && typeof field.config === "object" && !Array.isArray(field.config) ? field.config : {};
      if (!field.api_name) return false;
      if (!trendingFields.has(String(field.api_name)) && (config.trackHistory === false || config.track_history === false)) return false;
      return action !== "update" ||
        JSON.stringify(oldRecord?.[field.api_name] ?? null) !== JSON.stringify(newRecord?.[field.api_name] ?? null);
    });
    try {
      for (const field of changes) {
        await db(
          "INSERT INTO platform_record_history (company_id,object_id,object_key,record_id,field_api_name,old_value,new_value,action,actor_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)",
          [
            req.user.companyId,
            object.id,
            object.object_key,
            recordId,
            field.api_name,
            JSON.stringify(action === "create" ? null : oldRecord?.[field.api_name] ?? null),
            JSON.stringify(action === "delete" ? null : newRecord?.[field.api_name] ?? null),
            action,
            req.user.id || null,
          ]
        );
      }
    } catch (error) {
      console.error("Platform record history write error:", error);
    }
  }

  async function generateAutoNumberValues(req, fields) {
    const generated = [];
    for (const field of fields || []) {
      if (field.active !== true || field.field_type !== "auto_number" || !field.source_column) continue;
      const start = Math.max(1, Number.parseInt(field.config?.start ?? field.config?.startNumber ?? 1, 10) || 1);
      const counter = await db(
        `INSERT INTO platform_auto_number_counters (field_id,company_id,next_value,updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (field_id)
         DO UPDATE SET next_value=platform_auto_number_counters.next_value+1,updated_at=NOW()
         RETURNING next_value`,
        [field.id, req.user.companyId, start + 1]
      );
      const sequence = Math.max(start, Number(counter.rows[0]?.next_value || (start + 1)) - 1);
      generated.push({
        field,
        column: metadataColumn(field),
        value: formatAutoNumberValue(field.config || {}, sequence),
      });
    }
    return generated;
  }

  async function validateRecordInput(req, object, fields, input, { requireRequired = false, recordId = null } = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Record data must be an object" };
    const activeFields = fields.filter((field) => field.active === true);
    const activeByName = new Map(activeFields.map((field) => [field.api_name, field]));
    const allByName = new Map(fields.map((field) => [field.api_name, field]));
    const sourceRecord = { ...input };
    if (recordId && recordIdIsValid(String(recordId)) && object?.source_table && isSafeIdentifier(object.source_table)) {
      const params = [recordId];
      const scope = ["id=$1"];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); scope.push(`store_id=$${params.length}`); }
      const current = await db(`SELECT * FROM "${object.source_table}" WHERE ${scope.join(" AND ")} LIMIT 1`, params);
      if (current.rows[0]) {
        for (const candidate of activeFields) {
          if (sourceRecord[candidate.api_name] !== undefined || !candidate.source_column || !isSafeIdentifier(candidate.source_column)) continue;
          sourceRecord[candidate.api_name] = current.rows[0][candidate.source_column];
        }
      }
    }
    const values = [];
    for (const [apiName, value] of Object.entries(input)) {
      const field = activeByName.get(apiName);
      if (!field) {
        if (allByName.has(apiName)) return { error: `Field "${apiName}" is inactive` };
        return { error: `Unknown field "${apiName}"` };
      }
      if (["formula", "rollup", "auto_number"].includes(field.field_type)) return { error: `Calculated field "${apiName}" is read-only` };
      if (field.writable === false || field.writeable === false || field.protected === true || field.system === true || field.is_protected === true || field.read_only === true || field.readOnly === true) {
        return { error: `Field "${apiName}" is protected or read-only` };
      }
      const column = metadataColumn(field);
      if (!column) return { error: `Field "${apiName}" is unmapped` };
      if (["id", "company_id", "store_id"].includes(column) || ["company_id", "store_id"].includes(String(field.source_column || ""))) return { error: `Field "${apiName}" is managed by the server` };
      const valueError = fieldValueError(field, value);
      if (valueError) return { error: valueError };
      if (["select", "picklist", "multiselect"].includes(field.field_type) && (field.config?.restricted !== false || field.config?.dependentPicklist || field.config?.dependent_picklist)) {
        const options = await valueSetOptions(db, field, req);
        const allowed = new Set(options.filter((option) => option.active !== false).map((option) => String(option.value)));
        const selected = field.field_type === "multiselect"
          ? (Array.isArray(value) ? value : (typeof value === "string" ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : []))
          : [value];
        if (selected.some((item) => !allowed.has(String(item)))) return { error: `${field.label} must use active configured options` };
      }
      const lookup = await validateLookupReference(field, value, req, sourceRecord);
      if (lookup.error) return { error: lookup.error };
      values.push({ field, column, value: normalizeFieldValue(field, lookup.value) });
    }
    if (requireRequired) {
      for (const field of activeFields.filter((candidate) => candidate.required && !["formula", "rollup", "auto_number"].includes(candidate.field_type))) {
        if (!Object.prototype.hasOwnProperty.call(input, field.api_name) || input[field.api_name] === null || input[field.api_name] === "") {
          return { error: `${field.label} is required` };
        }
      }
    }
    if (!values.length) return { error: "At least one mapped field is required" };
    return { values };
  }

  function normalizeRequestedOperation(operation) {
    const value = String(operation ?? "auto").trim().toLowerCase();
    if (["create", "update", "upsert", "auto"].includes(value)) return value;
    return "auto";
  }

  function resolveImportAction(operation, existingId) {
    const requested = normalizeRequestedOperation(operation);
    const hasExistingId = !!existingId && recordIdIsValid(String(existingId));
    if (requested === "create") return "create";
    if (requested === "update") return hasExistingId ? "update" : "error";
    if (requested === "upsert") return hasExistingId ? "update" : "create";
    if (requested === "auto") return hasExistingId ? "update" : "create";
    return "create";
  }

  function getImportKeyCandidates(fields, input = {}) {
    const candidates = [];
    for (const field of fields) {
      if (!field || !field.active || !field.api_name || !metadataColumn(field)) continue;
      const config = field.config && typeof field.config === "object" ? field.config : {};
      const isUnique = field.unique === true || config.unique === true || config.businessKey === true || config.business_key === true || config.uniqueBusinessKey === true || config.unique_business_key === true || config.externalId === true || config.external_id === true;
      if (!isUnique && !/(?:sku|barcode|code|external|serial|reference|number|identifier)$/.test(String(field.api_name).toLowerCase()) && !/(?:sku|barcode|code|external|serial|reference|number|identifier)/.test(String(field.label || "").toLowerCase())) continue;
      if (input[field.api_name] === undefined || input[field.api_name] === null || String(input[field.api_name]).trim() === "") continue;
      const normalized = normalizeFieldValue(field, input[field.api_name]);
      if (normalized === null || normalized === "") continue;
      candidates.push({ field, value: normalized });
    }
    return candidates;
  }

  function getImportUniqueFields(fields) {
    const byName = new Map();
    for (const field of fields) {
      if (!field || !field.active || !field.api_name || !metadataColumn(field)) continue;
      const config = field.config && typeof field.config === "object" ? field.config : {};
      const isUnique = field.unique === true || config.unique === true || config.businessKey === true || config.business_key === true || config.uniqueBusinessKey === true || config.unique_business_key === true;
      if (isUnique) byName.set(String(field.api_name).toLowerCase(), field);
    }
    return [...byName.values()];
  }

  function summarizeImportPreview(rows, preview) {
    const summary = {
      total: rows.length,
      valid: 0,
      warnings: 0,
      errors: 0,
      create: 0,
      update: 0,
      skipped: 0,
      failed: 0,
      new: 0,
      skip: 0,
      error: 0,
    };
    for (const item of preview || []) {
      if (item.status === "warning") summary.warnings += 1;
      if (item.status === "valid") summary.valid += 1;
      if (item.status === "error") summary.errors += 1;
      if (item.action === "create") summary.create += 1;
      if (item.action === "update") summary.update += 1;
    }
    summary.skipped = summary.errors;
    summary.failed = summary.errors;
    summary.new = summary.create;
    summary.skip = summary.skipped;
    summary.error = summary.errors;
    return summary;
  }

  function findImportUniqueValues(fields, input = {}) {
    const values = [];
    for (const field of getImportUniqueFields(fields)) {
      const raw = input?.[field.api_name];
      if (raw === undefined || raw === null || raw === "") continue;
      const normalized = normalizeFieldValue(field, raw);
      if (normalized === null || normalized === "") continue;
      values.push({ field, value: normalized });
    }
    return values;
  }

  function buildImportRowInput(row, fieldByApiName) {
    const normalized = {};
    for (const [header, value] of Object.entries(row || {})) {
      const key = String(header).toLowerCase();
      if (key === "id") normalized.id = value;
      const match = fieldByApiName.get(key);
      if (match) normalized[match.api_name] = value;
    }
    const existingId = normalized.id ? String(normalized.id).trim() : null;
    const { id: _, ...input } = normalized;
    return { input, existingId };
  }

  async function findDatabaseDuplicateMatches(req, object, fields, input, { allowSameRecordId = false } = {}) {
    const objectRules = await loadObjectDuplicateRules({ db, objectId: object.id, companyId: req.user.companyId });
    const configured = objectRules.length
      ? await findObjectDuplicateMatches({
          db,
          object,
          fields,
          input,
          companyId: req.user.companyId,
          storeId: req.user.storeId,
          excludeRecordId: allowSameRecordId || null,
        })
      : await findConfiguredDuplicateMatches({
          db,
          object,
          fields,
          input,
          companyId: req.user.companyId,
          storeId: req.user.storeId,
          excludeRecordId: allowSameRecordId || null,
        });
    const effectiveRules = objectRules.length ? objectRules : configuredDuplicateRules(fields);
    const configuredFields = new Set(effectiveRules.flatMap((rule) => rule.fields.map((field) => field.fieldApiName)));
    const matches = configured.map((match) => ({
      field: match.fields?.[0] || null,
      fieldLabel: fields.find((field) => field.api_name === match.fields?.[0])?.label || match.fields?.[0] || null,
      value: input?.[match.fields?.[0]] ?? null,
      id: match.recordId,
      action: match.action,
      ruleId: match.ruleId,
    }));
    for (const field of getImportUniqueFields(fields).filter((candidate) => !configuredFields.has(candidate.api_name))) {
      const raw = input?.[field.api_name];
      if (raw === undefined || raw === null || raw === "") continue;
      const normalized = normalizeFieldValue(field, raw);
      if (normalized === null || normalized === "") continue;
      const column = metadataColumn(field);
      const config = field.config && typeof field.config === "object" ? field.config : {};
      const caseSensitive = config.uniqueCaseSensitive === true || config.unique_case_sensitive === true;
      const caseInsensitiveText = !caseSensitive && ["text", "email"].includes(field.field_type);
      const scope = [caseInsensitiveText ? `LOWER("${column}"::text)=LOWER($1::text)` : `"${column}"=$1`];
      const params = [normalized];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) {
        if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
        params.push(req.user.storeId); scope.push(`store_id=$${params.length}`);
      }
      const existing = await db(`SELECT id FROM "${object.source_table}" WHERE ${scope.join(" AND ")}`, params);
      for (const row of existing.rows) {
        const existingIdValue = String(row.id);
        if (allowSameRecordId && existingIdValue === String(allowSameRecordId)) continue;
        matches.push({ field: field.api_name, fieldLabel: field.label || field.api_name, value: normalized, id: row.id, action: "BLOCK" });
      }
    }
    return matches;
  }

  async function validateImportDuplicateState(req, object, fields, input, { operation, existingId = null, csvSeen = new Map() } = {}) {
    const requested = normalizeRequestedOperation(operation);
    const directId = existingId && recordIdIsValid(String(existingId)) ? String(existingId) : null;
    const objectRules = await loadObjectDuplicateRules({ db, objectId: object.id, companyId: req.user.companyId });
    const duplicateRules = objectRules.length ? objectRules : configuredDuplicateRules(fields);
    const configuredFields = new Set(duplicateRules.flatMap((rule) => rule.fields.map((field) => field.fieldApiName)));
    let warnings = [];
    if (csvSeen && csvSeen instanceof Map) {
      const priorRows = csvSeen.get("__configuredRows") || [];
      const csvMatches = evaluateDuplicateRules(duplicateRules, input, priorRows);
      const csvAction = resolveDuplicateAction(csvMatches);
      if (csvAction === "BLOCK") return {
        status: "error",
        field: csvMatches[0]?.fields?.[0] || null,
        code: "CSV_DUPLICATE_MATCH",
        message: "This row matches a prior row under an active duplicate rule",
      };
      if (csvAction === "WARN") warnings = [{ code: "POSSIBLE_DUPLICATE", message: "This row may duplicate an earlier CSV row" }];
      if (Object.keys(input || {}).length) csvSeen.set("__configuredRows", [...priorRows, { id: `csv-row-${priorRows.length + 1}`, ...input }]);
      for (const candidate of findImportUniqueValues(fields, input).filter(({ field }) => !configuredFields.has(field.api_name))) {
        const key = `${candidate.field.api_name}:${String(candidate.value)}`;
        if (csvSeen.has(key)) {
          return {
            status: "error",
            field: candidate.field.api_name,
            value: candidate.value,
            code: "CSV_DUPLICATE_VALUE",
            message: `Duplicate ${candidate.field.label || candidate.field.api_name} value within the CSV: ${candidate.value}`,
          };
        }
        csvSeen.set(key, true);
      }
    }
    const target = await resolveImportTarget(req, object, fields, input, { operation: requested, existingId: directId });
    if (target.action === "error") return {
      status: "error",
      field: null,
      value: null,
      code: "IMPORT_MATCHING_ERROR",
      message: target.message || "Ambiguous or invalid upsert match",
    };
    const excludedId = target.targetId || directId || false;
    const duplicateMatches = await findDatabaseDuplicateMatches(req, object, fields, input, { allowSameRecordId: excludedId });
    const duplicateAction = resolveDuplicateAction(duplicateMatches);
    if (duplicateAction === "BLOCK") {
      const match = duplicateMatches[0];
      return {
        status: "error",
        field: match.field,
        value: match.value,
        code: "EXISTING_RECORD_DUPLICATE",
        message: `Duplicate ${match.fieldLabel || match.field} ${match.value} already exists in this company scope`,
      };
    }
    if (duplicateAction === "WARN") warnings.push({ code: "POSSIBLE_DUPLICATE", message: "A possible duplicate record was found" });
    return {
      status: "valid",
      warnings,
    };
  }

  async function resolveImportTarget(req, object, fields, input, { operation, existingId = null } = {}) {
    const requested = normalizeRequestedOperation(operation);
    const action = resolveImportAction(requested, existingId);
    const directId = existingId && recordIdIsValid(String(existingId)) ? String(existingId) : null;
    if (action === "update" && directId) {
      const scope = ["id=$1"];
      const params = [directId];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) {
        if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
        params.push(req.user.storeId); scope.push(`store_id=$${params.length}`);
      }
      const existing = await db(`SELECT id FROM "${object.source_table}" WHERE ${scope.join(" AND ")}`, params);
      if (!existing.rows.length) return { action: "error", message: `Update target ${existingId} was not found` };
      return { action: "update", targetId: directId, matches: [directId] };
    }
    if (requested !== "upsert") return { action, targetId: directId || null, matches: directId ? [directId] : [] };
    const candidateKeys = [];
    for (const { field, value } of getImportKeyCandidates(fields, input)) {
      const scope = [`${metadataColumn(field)}=$1`];
      const params = [value];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) {
        if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
        params.push(req.user.storeId); scope.push(`store_id=$${params.length}`);
      }
      const matches = await db(`SELECT id FROM "${object.source_table}" WHERE ${scope.join(" AND ")}`, params);
      const ids = matches.rows.map((row) => String(row.id));
      for (const id of ids) candidateKeys.push(id);
    }
    const unique = [...new Set(candidateKeys)];
    if (unique.length > 1) return { action: "error", message: "Ambiguous upsert match: multiple existing records match the configured unique/business key" };
    if (unique.length === 1) return { action: "update", targetId: unique[0], matches: unique };
    return { action: "create", targetId: null, matches: [] };
  }

  async function validateImportRow(req, object, fields, input, { lineNumber, action, existingId = null, operation = null, csvSeen = null } = {}) {
    const result = { lineNumber, action, status: "valid", field: null, value: null, message: null, code: null, warnings: [] };
    const requested = normalizeRequestedOperation(operation ?? action ?? "auto");
    const duplicateCheck = await validateImportDuplicateState(req, object, fields, input, { operation: requested, existingId, csvSeen });
    if (duplicateCheck.status === "error") {
      result.status = "error";
      result.field = duplicateCheck.field || null;
      result.value = duplicateCheck.value || null;
      result.code = duplicateCheck.code || "DUPLICATE_VALUE";
      result.message = duplicateCheck.message;
      return result;
    }
    result.warnings = duplicateCheck.warnings || [];
    const targetPlan = await resolveImportTarget(req, object, fields, input, { operation: requested, existingId });
    if (targetPlan.action === "error") {
      result.status = "error";
      result.code = "IMPORT_MATCHING_ERROR";
      result.message = targetPlan.message;
      return result;
    }
    const canonicalAction = targetPlan.action === "update" ? "update" : "create";
    result.action = canonicalAction;
    const permission = await hasPlatformObjectPermission(db, req, object.id, canonicalAction === "update" ? "edit" : "create");
    if (!permission) {
      result.status = "error";
      result.code = "IMPORT_PERMISSION_REQUIRED";
      result.message = `${canonicalAction} permission is required`;
      return result;
    }
    const targetId = targetPlan.targetId || (existingId && recordIdIsValid(String(existingId)) ? String(existingId) : null);
    if (canonicalAction === "update" && targetId && !recordIdIsValid(String(targetId))) {
      result.status = "error";
      result.code = "INVALID_MATCHING_IDENTIFIER";
      result.message = "The row's matching identifier is not a valid record id";
      return result;
    }
    if (canonicalAction === "update" && !targetId) {
      result.status = "error";
      result.code = "UPDATE_TARGET_NOT_FOUND";
      result.message = "Update target was not found";
      return result;
    }
    const validation = await validateRecordInput(req, object, fields, input, { requireRequired: canonicalAction === "create", recordId: canonicalAction === "update" ? targetId : null });
    if (validation.error) {
      result.status = "error";
      result.code = "FIELD_VALIDATION_FAILED";
      result.message = validation.error;
      return result;
    }
    result.values = validation.values;
    const trigger = canonicalAction === "update" ? "before_update" : "before_create";
    const ruleCheck = await recordRuleCheck(req, object, fields, validation.values, trigger, canonicalAction === "update" ? targetId : null, { allowMissingExisting: true });
    if (ruleCheck.status) {
      result.status = "error";
      result.code = "OBJECT_VALIDATION_RULE_FAILED";
      result.message = ruleCheck.message || "Validation failed";
      const first = ruleCheck.errors?.[0];
      if (first) {
        result.field = first.field || null;
        result.value = first.value || null;
      }
      return result;
    }
    return result;
  }

  function operationFromAction(action) {
    return action === "update" ? "update" : action === "create" ? "create" : "upsert";
  }

  async function recordRuleCheck(req, object, fields, values, trigger, recordId = null, { allowMissingExisting = false } = {}) {
    const result = await db("SELECT * FROM platform_rules WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) AND trigger_key IN ($3,'before_save') AND action->>'type'='validation' ORDER BY id", [object.id, req.user.companyId, trigger]);
    let current = {};
    if (recordId) {
      const params = [recordId];
      const scope = ["id=$1"];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); scope.push(`store_id=$${params.length}`); }
      const existing = await db(`SELECT *, xmin::text AS "__validation_version" FROM "${object.source_table}" WHERE ${scope.join(" AND ")}`, params);
      if (!existing.rows.length) {
        if (allowMissingExisting) return {};
        return { status: 404, message: "Record not found" };
      }
      current = existing.rows[0];
    }
    const selfReference = values.find(({ field, value }) =>
      field.config?.preventSelfReference === true && recordId && String(value) === String(recordId)
    );
    if (selfReference) {
      return {
        status: 422,
        code: "SELF_REFERENCE_NOT_ALLOWED",
        message: `${selfReference.field.label || selfReference.field.api_name} cannot reference this record`,
      };
    }
    const candidate = { ...current, ...Object.fromEntries(values.map(({ field, value }) => [field.api_name, value])) };
    try {
      const dependentPicklistError = await validateDependentPicklistValues(db, fields, candidate, req);
      if (dependentPicklistError) return { status: 422, code: "DEPENDENT_PICKLIST_INVALID", message: dependentPicklistError };
      const formulaRecords = await calculateFormulaRecords(db, object, fields, [candidate], req);
      const calculated = formulaRecords[0] || candidate;
      const withRollups = await populateRollups(db, object, fields, [calculated], req);
      const resolved = Array.isArray(withRollups) && withRollups.length ? withRollups[0] : calculated;
      const conditionalError = validateConditionalRequired(fields, resolved);
      if (conditionalError) return { status: 422, code: "CONDITIONAL_REQUIRED", message: conditionalError };
      if (!result.rows.length) return { version: current.__validation_version, current };
      const enforceableRules = [];
      for (const rule of result.rows) {
        const bypassPermission = rule.action?.bypassPermission;
        if (bypassPermission && await hasExecutionPermission(req, bypassPermission)) continue;
        enforceableRules.push(rule);
      }
      const errors = evaluateValidationRules(enforceableRules, fields, resolved);
      if (errors.length) return { status: 422, code: "VALIDATION_RULE_FAILED", message: errors.map(error => error.message).join("; "), errors };
    } catch (error) {
      if (error instanceof ConditionError) return { status: 422, code: error.code, message: error.message };
      return { status: 422, code: "VALIDATION_RULE_INVALID", message: "An active validation rule cannot be evaluated. Ask an administrator to review its configuration." };
    }
    return { version: current.__validation_version, current };
  }

  async function applyFieldDefaults(fields, input, req) {
    const values = { ...(input || {}) };
    const eligible = (fields || []).filter((field) => field?.active && field.api_name && metadataColumn(field) && !["formula", "rollup", "auto_number"].includes(field.field_type));
    for (const field of eligible) {
      if (Object.prototype.hasOwnProperty.call(values, field.api_name)) continue;
      const config = field.config && typeof field.config === "object" && !Array.isArray(field.config) ? field.config : {};
      if (config.defaultFormula || config.default_formula) continue;
      if (config.defaultValue !== undefined && config.defaultValue !== null) values[field.api_name] = config.defaultValue;
      else if (config.default_value !== undefined && config.default_value !== null) values[field.api_name] = config.default_value;
    }
    const formulaInputs = () => ({
      ...Object.fromEntries(eligible.map((field) => [field.api_name, values[field.api_name] ?? null])),
      user_id: req.user?.id ?? null,
      role_id: req.user?.roleId ?? null,
      company_id: req.user?.companyId ?? null,
      store_id: req.user?.storeId ?? null,
    });
    for (const field of eligible) {
      if (Object.prototype.hasOwnProperty.call(values, field.api_name)) continue;
      const config = field.config && typeof field.config === "object" && !Array.isArray(field.config) ? field.config : {};
      const expression = config.defaultFormula || config.default_formula;
      if (!expression) continue;
      try {
        const value = evaluateWorkflowFormula(expression, formulaInputs());
        if (value !== undefined && value !== null) values[field.api_name] = value;
      } catch (error) {
        return { ...values, __defaultError: `${field.label} default formula failed: ${error.message}` };
      }
    }
    return values;
  }

  async function executeCanonicalRecordWrite({ req, object, metadataFields, fields, input, action, recordId = null }) {
    const permissionAction = action === "update" ? "edit" : "create";
    if (!(await hasPlatformObjectPermission(db, req, object.id, permissionAction))) {
      return { status: 403, code: "IMPORT_PERMISSION_REQUIRED", message: `${permissionAction} permission is required` };
    }
    const effectiveInput = action === "create" ? await applyFieldDefaults(fields, input, req) : input;
    if (effectiveInput?.__defaultError) return { status: 400, code: "FIELD_DEFAULT_FAILED", message: effectiveInput.__defaultError };
    const validation = await validateRecordInput(req, object, fields, effectiveInput, { requireRequired: action === "create", recordId });
    if (validation.error) return { status: 400, code: "FIELD_VALIDATION_FAILED", message: validation.error };
    if (action === "create") {
      const generated = await generateAutoNumberValues(req, fields);
      validation.values.push(...generated.filter(({ column }) => column));
    }
    const trigger = action === "update" ? "before_update" : "before_create";
    const ruleCheck = await recordRuleCheck(req, object, fields, validation.values, trigger, action === "update" ? recordId : null);
    if (ruleCheck.status) return { status: ruleCheck.status, code: ruleCheck.code, message: ruleCheck.message, errors: ruleCheck.errors };
    const duplicateMatches = await findDatabaseDuplicateMatches(req, object, fields, effectiveInput, { allowSameRecordId: action === "update" ? recordId : false });
    const duplicateAction = resolveDuplicateAction(duplicateMatches);
    if (duplicateAction === "BLOCK") return {
      status: 409,
      code: "EXISTING_RECORD_DUPLICATE",
      duplicateAction,
      message: "Record matches an active duplicate rule",
    };
    let saved;
    if (action === "update") {
      if (await isPlatformRecordLocked({ db, companyId: req.user.companyId, objectId: object.id, recordId })) return { status: 423, code: "RECORD_LOCKED_FOR_APPROVAL", message: "This record is locked while its approval is pending" };
      const valueParams = validation.values.map(({ value }) => value);
      const assignments = validation.values.map(({ column }, index) => `"${column}"=$${index + 1}`);
      const params = [...valueParams, recordId];
      const clauses = [`id=$${params.length}`];
      if (object.company_scoped) { params.push(req.user.companyId); clauses.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); clauses.push(`store_id=$${params.length}`); }
      const sharing = await buildPlatformSharingScope({ db, object, fields, req, access: "write", paramsOffset: params.length });
      if (sharing.sql) { clauses.push(sharing.sql); params.push(...sharing.params); }
      if (ruleCheck.version !== undefined) { params.push(ruleCheck.version); clauses.push(`xmin::text=$${params.length}`); }
      const returning = recordReturning(fields, validation.values);
      const result = await db(`UPDATE "${object.source_table}" SET ${assignments.join(",")} WHERE ${clauses.join(" AND ")} RETURNING ${returning.join(",")}`, params);
      if (!result.rows.length) return { status: ruleCheck.version !== undefined ? 409 : 404, code: "RECORD_NOT_AVAILABLE", message: "Record not found or changed while validating" };
      saved = result.rows[0];
      await writeRecordHistory(object, saved.id, fields, ruleCheck.current, saved, "update", req);
    } else {
      const columns = validation.values.map(({ column }) => `"${column}"`);
      const params = validation.values.map(({ value }) => value);
      const placeholders = params.map((_, index) => `$${index + 1}`);
      if (object.company_scoped) { columns.push('"company_id"'); placeholders.push(`$${params.length + 1}`); params.push(req.user.companyId); }
      if (object.store_scoped) { columns.push('"store_id"'); placeholders.push(`$${params.length + 1}`); params.push(req.user.storeId); }
      const returning = recordReturning(fields, validation.values);
      const result = await db(`INSERT INTO "${object.source_table}" (${columns.join(",")}) VALUES (${placeholders.join(",")}) RETURNING ${returning.join(",")}`, params);
      saved = result.rows[0];
      await writeRecordHistory(object, saved.id, fields, null, saved, "create", req);
    }
    const calculatedSaved = (await calculateFormulaRecords(db, object, metadataFields, [saved], req))[0] || saved;
    const automation = await executePlatformAutomations({
      db, object, fields: metadataFields, record: calculatedSaved, recordId: saved.id,
      trigger: action === "update" ? "after_update" : "after_create",
      previousRecord: action === "update" ? ruleCheck.current : null,
      req,
    });
    const calculatedAutomationRecord = (await calculateFormulaRecords(db, object, metadataFields, [automation.record], req))[0] || automation.record;
    const approval = await submitPlatformApproval({ db, object, fields: metadataFields, recordId: saved.id, record: calculatedAutomationRecord, req });
    const hydrated = await populateRollups(db, object, metadataFields, [calculatedAutomationRecord], req);
    try {
      await publishPlatformEvent({
        db,
        companyId: req.user.companyId,
        eventType: `platform.object.record.${action === "update" ? "updated" : "created"}`,
        payload: { objectId: object.id, objectKey: object.object_key, recordId: saved.id, record: hydrated[0] },
        actorUserId: req.user.id || null,
      });
    } catch (error) {
      console.error("Platform record event publication error:", error);
    }
    return {
      status: 200,
      id: saved.id,
      action,
      data: { ...publicFormulaRecord(fields, hydrated[0]), approvalStatus: approval?.status || null },
      messages: duplicateAction === "WARN" ? [...automation.messages, "A possible duplicate record was found"] : automation.messages,
      automationExecutions: automation.executions,
    };
  }

  router.post("/platform/objects/:objectKey/records", ...recordAccess, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      const fields = await applyFieldSecurity(db, metadataFields, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "create"))) return res.status(403).json({ success: false, message: "You do not have permission to create records for this object" });
      if (!object.active) return res.status(400).json({ success: false, message: "Object is inactive" });
      if (!object.source_table || !isSafeIdentifier(object.source_table)) return res.status(400).json({ success: false, message: "Object records are not available" });
      if (object.store_scoped && !req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      const input = req.body?.data || req.body;
      const recordTypeId = req.body?.recordTypeId ?? input?.recordTypeId;
      const recordType = await resolveRecordType(object, recordTypeId, req);
      if (recordTypeId && !recordType) return res.status(400).json({ success: false, message: "Record type is not available for this object" });
      const recordValues = { ...input };
      delete recordValues.recordTypeId;
      if (recordType) Object.assign(recordValues, { ...(recordType.default_values || {}), ...recordValues });
      const typeError = await validateRecordTypeValues(object, fields, recordType, recordValues, req);
      if (typeError) return res.status(400).json({ success: false, message: typeError });
      const saved = await executeCanonicalRecordWrite({ req, object, metadataFields, fields, input: recordValues, action: "create" });
      if (saved.status !== 200) return res.status(saved.status).json({ success: false, code: saved.code, message: saved.message, errors: saved.errors, duplicateAction: saved.duplicateAction });
      if (recordTypeId !== undefined) await associateRecordType(object, saved.id, recordType, req);
      res.status(201).json({ success: true, data: { ...saved.data, recordTypeId: recordType?.id ?? null }, messages: saved.messages, automationExecutions: saved.automationExecutions });
    } catch (error) {
      if (error instanceof FormulaError) return res.status(422).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A record with these values already exists" });
      if (error.code === "23503") return res.status(400).json({ success: false, message: "A referenced record does not exist" });
      console.error("Platform generic record create error:", error);
      res.status(500).json({ success: false, message: "Unable to create object record" });
    }
  });

  router.put("/platform/objects/:objectKey/records/:recordId", ...recordAccess, async (req, res) => {
    try {
      if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      const fields = await applyFieldSecurity(db, metadataFields, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "edit"))) return res.status(403).json({ success: false, message: "You do not have permission to edit records for this object" });
      if (!object.active) return res.status(400).json({ success: false, message: "Object is inactive" });
      if (!object.source_table || !isSafeIdentifier(object.source_table)) return res.status(400).json({ success: false, message: "Object records are not available" });
      if (object.store_scoped && !req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      const input = req.body?.data || req.body;
      const recordTypeId = req.body?.recordTypeId ?? input?.recordTypeId;
      const recordType = await resolveRecordType(object, recordTypeId, req);
      if (recordTypeId && !recordType) return res.status(400).json({ success: false, message: "Record type is not available for this object" });
      const recordValues = { ...input };
      delete recordValues.recordTypeId;
      const typeError = await validateRecordTypeValues(object, fields, recordType, recordValues, req);
      if (typeError) return res.status(400).json({ success: false, message: typeError });
      const saved = await executeCanonicalRecordWrite({ req, object, metadataFields, fields, input: recordValues, action: "update", recordId: req.params.recordId });
      if (saved.status !== 200) return res.status(saved.status).json({ success: false, code: saved.code, message: saved.message, errors: saved.errors, duplicateAction: saved.duplicateAction });
      if (recordTypeId !== undefined) await associateRecordType(object, saved.id, recordType, req);
      res.json({ success: true, data: { ...saved.data, recordTypeId: recordType?.id ?? null }, messages: saved.messages, automationExecutions: saved.automationExecutions });
    } catch (error) {
      if (error instanceof FormulaError) return res.status(422).json({ success: false, code: error.code, message: error.message });
      if (error.code === "23503") return res.status(400).json({ success: false, message: "A referenced record does not exist" });
      console.error("Platform generic record update error:", error);
      res.status(500).json({ success: false, message: "Unable to update object record" });
    }
  });

  router.delete("/platform/objects/" + ":objectKey/records/" + ":recordId", ...recordAccess, async (req, res) => {
    try {
      if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      const fields = await applyFieldSecurity(db, metadataFields, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "delete"))) return res.status(403).json({ success: false, message: "You do not have permission to delete records for this object" });
      if (!object.active) return res.status(400).json({ success: false, message: "Object is inactive" });
      if (!object.source_table || !isSafeIdentifier(object.source_table)) return res.status(404).json({ success: false, message: "Object records are not available" });
      if (object.store_scoped && !req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      const params = [req.params.recordId];
      let where = "id=$1";
      if (object.company_scoped) {
        params.push(req.user.companyId);
        where += ` AND company_id=$${params.length}`;
      }
      if (object.store_scoped) {
        params.push(req.user.storeId);
        where += ` AND store_id=$${params.length}`;
      }
      const sharing = await buildPlatformSharingScope({ db, object, fields, req, access: "write", paramsOffset: params.length });
      if (sharing.sql) { where += ` AND ${sharing.sql}`; params.push(...sharing.params); }
      const existing = await db(`SELECT * FROM "${object.source_table}" WHERE ${where}`, params);
      if (!existing.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
      const beforeDeleteAutomation = await executePlatformAutomations({
        db,
        object,
        fields: metadataFields,
        record: existing.rows[0],
        previousRecord: existing.rows[0],
        recordId: req.params.recordId,
        trigger: "before_delete",
        req,
      });
      // Objects with an active field use archive semantics.  This keeps the
      // RECORD_DELETE command generic while preserving historical relationships
      // (sales, stock, invoices, etc.). Objects without an active field may be
      // physically deleted when their metadata permission allows it.
      const activeField = fields.find(field => field.active !== false && field.source_column === "active");
      let result;
      let archived = false;
      if (activeField) {
        result = await db(`UPDATE "${object.source_table}" SET active=false WHERE ${where} RETURNING *`, params);
        archived = true;
      } else {
        const relationshipResult = await db(
          `SELECT r.on_delete,r.child_field_id,c.id AS child_object_id,c.object_key AS child_object_key,
                  c.source_table AS child_source_table,c.company_scoped AS child_company_scoped,
                  c.store_scoped AS child_store_scoped,f.source_column AS child_source_column
             FROM platform_relationships r
             JOIN platform_objects c ON c.id=r.child_object_id AND c.active=true
             LEFT JOIN platform_fields f ON f.id=r.child_field_id AND f.active=true
            WHERE r.parent_object_id=$1 AND r.active=true
              AND (c.company_id IS NULL OR c.company_id=$2)
            ORDER BY r.id`,
          [object.id, req.user.companyId]
        );
        const relatedRecords = [];
        for (const relationship of relationshipResult.rows || []) {
          if (!relationship.child_source_table || !isSafeIdentifier(relationship.child_source_table)
            || !relationship.child_source_column || !isSafeIdentifier(relationship.child_source_column)) {
            return res.status(409).json({ success: false, code: "RELATIONSHIP_CONFIGURATION_INVALID", message: "A related Object has an invalid delete relationship" });
          }
          const childScope = [`"${relationship.child_source_column}"=$1`];
          const childParams = [req.params.recordId];
          if (relationship.child_company_scoped) { childParams.push(req.user.companyId); childScope.push(`company_id=$${childParams.length}`); }
          if (relationship.child_store_scoped) {
            if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
            childParams.push(req.user.storeId); childScope.push(`store_id=$${childParams.length}`);
          }
          const children = await db(`SELECT * FROM "${relationship.child_source_table}" WHERE ${childScope.join(" AND ")}`, childParams);
          if (!children.rows.length) continue;
          const policy = String(relationship.on_delete || "restrict").toLowerCase();
          if (policy === "restrict") {
            return res.status(409).json({ success: false, code: "RECORD_REFERENCED", message: "This record is referenced by another Object and cannot be deleted" });
          }
          if (policy === "cascade") {
            const childObject = {
              id: relationship.child_object_id,
              object_key: relationship.child_object_key,
              source_table: relationship.child_source_table,
              company_scoped: relationship.child_company_scoped,
              store_scoped: relationship.child_store_scoped,
            };
            if (!(await hasPlatformObjectPermission(db, req, childObject.id, "delete"))) {
              return res.status(403).json({ success: false, message: "Delete permission is required for a related Object" });
            }
            const childFieldsResult = await db(
              "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
              [relationship.child_object_id, req.user.companyId]
            );
            const childFields = childFieldsResult.rows || [];
            const childSharing = await buildPlatformSharingScope({ db, object: childObject, fields: childFields, req, access: "write", paramsOffset: childParams.length });
            const accessibleScope = [...childScope];
            const accessibleParams = [...childParams];
            if (childSharing.sql) { accessibleScope.push(childSharing.sql); accessibleParams.push(...childSharing.params); }
            const accessible = await db(
              `SELECT id FROM "${relationship.child_source_table}" WHERE ${accessibleScope.join(" AND ")}`,
              accessibleParams
            );
            if (accessible.rows.length !== children.rows.length) {
              return res.status(403).json({ success: false, message: "Delete access to every related record is required" });
            }
            relationship.child_fields = childFields;
            relationship.delete_scope = accessibleScope;
            relationship.delete_params = accessibleParams;
          }
          relatedRecords.push({ relationship, childScope, childParams, children, policy });
        }
        for (const related of relatedRecords) {
          const { relationship, childScope, childParams, children, policy } = related;
          if (policy === "set_null") {
            await db(`UPDATE "${relationship.child_source_table}" SET "${relationship.child_source_column}"=NULL WHERE ${childScope.join(" AND ")}`, childParams);
            continue;
          }
          if (policy !== "cascade") continue;
          const childFields = relationship.child_fields || [];
          const deletedChildren = await db(
            `DELETE FROM "${relationship.child_source_table}" WHERE ${relationship.delete_scope.join(" AND ")} RETURNING *`,
            relationship.delete_params
          );
          for (const child of deletedChildren.rows || children.rows) {
            await writeRecordHistory(
              { id: relationship.child_object_id, object_key: relationship.child_object_key },
              child.id,
              childFields,
              child,
              null,
              "delete",
              req
            );
            if (typeof writeAudit === "function") {
              try { await writeAudit(req.user.companyId, req.user.id, "platform.record.delete", relationship.child_object_key, child.id, { cascadedFrom: req.params.recordId }); }
              catch { /* Keep audit transport failures from masking a completed delete. */ }
            }
          }
        }
        result = await db(`DELETE FROM "${object.source_table}" WHERE ${where} RETURNING *`, params);
        await db("DELETE FROM platform_record_associations WHERE object_id=$1 AND record_id=$2 AND company_id=$3", [object.id, req.params.recordId, req.user.companyId]);
      }
      await writeRecordHistory(object, req.params.recordId, fields, existing.rows[0], archived ? result.rows[0] : null, "delete", req);
      const afterDeleteAutomation = await executePlatformAutomations({
        db,
        object,
        fields: metadataFields,
        record: archived ? result.rows[0] : existing.rows[0],
        previousRecord: existing.rows[0],
        recordId: req.params.recordId,
        trigger: "after_delete",
        req,
      });
      if (typeof writeAudit === "function") {
        try { await writeAudit(req.user.companyId, req.user.id, "platform.record.delete", object.object_key, req.params.recordId, { archived }); }
        catch { /* Keep audit transport failures from masking a completed delete. */ }
      }
      try {
        await publishPlatformEvent({
          db,
          companyId: req.user.companyId,
          eventType: "platform.object.record.deleted",
          payload: { objectId: object.id, objectKey: object.object_key, recordId: req.params.recordId, record: existing.rows[0], archived },
          actorUserId: req.user.id || null,
        });
      } catch (eventError) { console.error("Platform record event publication error:", eventError); }
      res.json({
        success: true,
        data: { id: req.params.recordId, deleted: !archived && !!result.rows.length, archived: archived && !!result.rows.length },
        messages: [...(beforeDeleteAutomation.messages || []), ...(afterDeleteAutomation.messages || [])],
        automationExecutions: [...(beforeDeleteAutomation.executions || []), ...(afterDeleteAutomation.executions || [])],
      });
    } catch (error) {
      if (error.code === "23503" || error.code === "23502") return res.status(409).json({ success: false, code: "RECORD_REFERENCED", message: "The record is referenced by another Object and cannot be deleted" });
      console.error("Platform generic record delete error:", error);
      res.status(500).json({ success: false, message: "Unable to delete object record" });
    }
  });

  router.get("/platform/objects/:objectKey/records/:recordId/duplicates", authenticate, async (req, res) => {
    try {
      if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) return res.status(403).json({ success: false, message: "View permission is required" });
      if (!object.source_table || !isSafeIdentifier(object.source_table)) return res.status(404).json({ success: false, message: "Object records are not available" });
      if (object.store_scoped && !req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      const fields = await applyFieldSecurity(db, metadataFields, req);
      const scope = ["id=$1"];
      const params = [req.params.recordId];
      if (object.company_scoped) { params.push(req.user.companyId); scope.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { params.push(req.user.storeId); scope.push(`store_id=$${params.length}`); }
      const sharing = await buildPlatformSharingScope({ db, object, fields, req, access: "read", paramsOffset: params.length });
      if (sharing.sql) { scope.push(sharing.sql); params.push(...sharing.params); }
      const current = await db(`SELECT * FROM "${object.source_table}" WHERE ${scope.join(" AND ")}`, params);
      if (!current.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
      const currentInput = { ...current.rows[0] };
      for (const field of fields) if (field.source_column && currentInput[field.api_name] === undefined) currentInput[field.api_name] = currentInput[field.source_column];
      const duplicates = await findDatabaseDuplicateMatches(req, object, fields, currentInput, { allowSameRecordId: req.params.recordId });
      const readableFields = fields.filter((field) => field.active === true && field.readable !== false && metadataColumn(field) && isSafeIdentifier(field.api_name));
      const resultFields = readableFields.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`);
      const visible = [];
      for (const duplicateId of [...new Set(duplicates.map((match) => String(match.id)))]) {
        const candidateScope = ["id=$1"];
        const candidateParams = [duplicateId];
        if (object.company_scoped) { candidateParams.push(req.user.companyId); candidateScope.push(`company_id=$${candidateParams.length}`); }
        if (object.store_scoped) { candidateParams.push(req.user.storeId); candidateScope.push(`store_id=$${candidateParams.length}`); }
        const candidateSharing = await buildPlatformSharingScope({ db, object, fields, req, access: "read", paramsOffset: candidateParams.length });
        if (candidateSharing.sql) { candidateScope.push(candidateSharing.sql); candidateParams.push(...candidateSharing.params); }
        const candidate = await db(
          `SELECT id${resultFields.length ? `,${resultFields.join(",")}` : ""} FROM "${object.source_table}" WHERE ${candidateScope.join(" AND ")}`,
          candidateParams
        );
        if (candidate.rows.length) {
          visible.push({
            ...publicFormulaRecord(fields, candidate.rows[0]),
            matchingFields: [...new Set(duplicates.filter((match) => String(match.id) === duplicateId).map((match) => match.field).filter(Boolean))],
          });
        }
      }
      res.json({ success: true, data: visible });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Platform duplicate review error:", error);
      res.status(500).json({ success: false, message: "Unable to review duplicate records" });
    }
  });

  router.get("/platform/runtime/objects/:objectKey/workspace", authenticate, async (req, res, next) => {
    try {
      const objectKey = String(req.params.objectKey || "");
      if (!isSafeIdentifier(objectKey)) return res.status(400).json({ success: false, message: "Invalid object key" });
      const metadata = await db(
        "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2) LIMIT 1",
        [objectKey, req.user.companyId]
      );
      const object = metadata.rows[0];
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) {
        return res.status(404).json({ success: false, message: "Object is not available" });
      }
      if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) {
        return res.status(403).json({ success: false, message: "You do not have permission to view this object" });
      }

      const [fieldResult, listViewResult, recordTypeResult, relationshipResult, layoutResult, buttonResult] = await Promise.all([
        db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,api_name", [object.id, req.user.companyId]),
        db("SELECT * FROM platform_list_views WHERE object_id=$1 AND company_id=$2 AND active=true ORDER BY is_default DESC,label", [object.id, req.user.companyId]),
        db("SELECT * FROM platform_record_types WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY is_default DESC,label", [object.id, req.user.companyId]),
        db(`SELECT r.*,p.object_key AS parent_object_key,p.label AS parent_object_label,c.object_key AS child_object_key,c.label AS child_object_label,
                   f.api_name AS child_field_api_name
              FROM platform_relationships r
              JOIN platform_objects p ON p.id=r.parent_object_id
              JOIN platform_objects c ON c.id=r.child_object_id
              LEFT JOIN platform_fields f ON f.id=r.child_field_id
             WHERE (r.parent_object_id=$1 OR r.child_object_id=$1) AND r.active=true
               AND (p.company_id IS NULL OR p.company_id=$2)
               AND (c.company_id IS NULL OR c.company_id=$2)
             ORDER BY r.relationship_key`, [object.id, req.user.companyId]),
        db(`SELECT * FROM platform_layouts
             WHERE object_id=$1 AND active=true
               AND (company_id IS NULL OR company_id=$2)
               AND (role_id IS NULL OR role_id=$3)
             ORDER BY page_type,is_default DESC,updated_at DESC`, [object.id, req.user.companyId, req.user.roleId || null]),
        db(`SELECT * FROM platform_buttons
             WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)
             ORDER BY COALESCE((config->>'order')::integer,999),created_at,label`, [object.id, req.user.companyId]),
      ]);

      const safeFields = safeSystemFields(object, fieldResult.rows);
      const fields = await applyFieldSecurity(db, safeFields, req);
      const buttons = [];
      for (const button of buttonResult.rows || []) {
        if (button.required_permission && !(await hasExecutionPermission(req, button.required_permission))) continue;
        buttons.push(button);
      }
      const listViews = listViewResult.rows || [];
      const layouts = layoutResult.rows || [];
      const defaultListView = listViews.find((view) => view.is_default === true) || listViews[0] || null;
      const detailLayoutRows = layouts.filter((layout) => layout.page_type === "detail");
      const defaultDetailLayout = resolvePageLayout(detailLayoutRows) || null;
      const createLayoutRows = layouts.filter((layout) => layout.page_type === "create");
      const defaultCreateLayout = resolvePageLayout(createLayoutRows) || null;

      res.json({
        success: true,
        data: {
          object,
          fields,
          listViews,
          defaultListView,
          recordTypes: recordTypeResult.rows || [],
          relationships: relationshipResult.rows || [],
          layouts,
          defaultDetailLayout,
          defaultCreateLayout,
          buttons,
        },
      });
    } catch (error) {
      next(error);
    }
  });

router.get("/platform/objects/:objectKey/records/:recordId/related/:relationshipKey", authenticate, async (req, res) => {
  try {
    if (!recordIdIsValid(req.params.recordId) || !isSafeIdentifier(req.params.relationshipKey)) {
      return res.status(400).json({ success: false, message: "Invalid related record request" });
    }
    const parentResult = await db(
      "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
      [req.params.objectKey, req.user.companyId]
    );
    const parent = parentResult.rows[0];
    if (!parent) return res.status(404).json({ success: false, message: "Object not found" });
    if (!(await hasPlatformObjectPermission(db, req, parent.id, "view"))) {
      return res.status(403).json({ success: false, message: "You do not have permission to view records for this object" });
    }

    const parentClauses = ["id=$1"];
    const parentParams = [req.params.recordId];
    if (parent.company_scoped) {
      parentParams.push(req.user.companyId);
      parentClauses.push(`company_id=$${parentParams.length}`);
    }
    if (parent.store_scoped) {
      if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      parentParams.push(req.user.storeId);
      parentClauses.push(`store_id=$${parentParams.length}`);
    }
    appendSystemReadScope(parent, req, parentClauses, parentParams);
    const parentRecord = await db(`SELECT id FROM "${parent.source_table}" WHERE ${parentClauses.join(" AND ")}`, parentParams);
    if (!parentRecord.rows.length) return res.status(404).json({ success: false, message: "Record not found" });

    const relationshipResult = await db(
      `SELECT r.*, child.object_key AS child_object_key
       FROM platform_relationships r
       JOIN platform_objects child ON child.id=r.child_object_id
       WHERE r.parent_object_id=$1 AND r.relationship_key=$2 AND r.active=true
         AND (child.company_id IS NULL OR child.company_id=$3)`,
      [parent.id, req.params.relationshipKey, req.user.companyId]
    );
    const relationship = relationshipResult.rows[0];
    if (!relationship) return res.status(404).json({ success: false, message: "Relationship not found" });
    const childMetadata = await getRecordMetadata(relationship.child_object_key, req);
    const child = childMetadata.object;
    if (!child || !child.source_table || !isSafeIdentifier(child.source_table)) {
      return res.status(404).json({ success: false, message: "Related object is unavailable" });
    }
    if (!(await hasPlatformObjectPermission(db, req, child.id, "view"))) {
      return res.status(403).json({ success: false, message: "You do not have permission to view related records" });
    }
    const childField = childMetadata.fields.find((field) => String(field.id) === String(relationship.child_field_id));
    if (!childField || !platformFieldSql(childField, child)) {
      return res.status(422).json({ success: false, message: "Relationship target field is unavailable" });
    }
    const fields = await applyFieldSecurity(db, childMetadata.fields, req);
    const readableFields = fields.filter((field) => field.readable !== false && isSafeIdentifier(field.api_name) && platformFieldSql(field, child));
    const columns = readableFields.map((field) => `${platformFieldSql(field, child)} AS "${field.api_name}"`);
    const clauses = [`${platformFieldSql(childField, child)}=$1`];
    const params = [req.params.recordId];
    if (child.company_scoped) {
      params.push(req.user.companyId);
      clauses.push(`company_id=$${params.length}`);
    }
    if (child.store_scoped) {
      if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      params.push(req.user.storeId);
      clauses.push(`store_id=$${params.length}`);
    }
    appendSystemReadScope(child, req, clauses, params);
    const sharing = await buildPlatformSharingScope({ db, object: child, fields, req, access: "read", paramsOffset: params.length });
    if (sharing.sql) {
      clauses.push(sharing.sql);
      params.push(...sharing.params);
    }
    const fieldByApiName = new Map(readableFields.map((field) => [field.api_name, field]));
    const filterModel = parseRecordFilterModel(req.query);
    if (!filterModel) return res.status(400).json({ success: false, message: "filterModel must be a JSON object" });
    for (const [apiName, config] of Object.entries(filterModel)) {
      const field = fieldByApiName.get(apiName);
      if (!field) return res.status(400).json({ success: false, message: `Unknown or unavailable related-list filter field "${apiName}"` });
      if (!config || typeof config !== "object" || Array.isArray(config)) continue;
      const columnSql = platformFieldSql(field, child);
      const selectedValues = Array.isArray(config.values) ? config.values.map(decodeFilterValue) : [];
      if (selectedValues.length) {
        const placeholders = selectedValues.map((item) => {
          params.push(item);
          return `${params.length}`;
        });
        clauses.push(`${columnSql} IN (${placeholders.join(",")})`);
      }
      const operator = String(config.operator || "");
      const supported = new Set(["equals","not_equals","contains","not_contains","starts_with","greater_than","less_than","greater_or_equal","less_or_equal","is_blank","is_not_blank"]);
      if (!operator || !supported.has(operator)) continue;
      if (operator === "is_blank") {
        clauses.push(`(${columnSql} IS NULL OR CAST(${columnSql} AS TEXT)='')`);
        continue;
      }
      if (operator === "is_not_blank") {
        clauses.push(`(${columnSql} IS NOT NULL AND CAST(${columnSql} AS TEXT)<>'')`);
        continue;
      }
      const rawValue = decodeFilterValue(config.value);
      if (rawValue === undefined || rawValue === null || rawValue === "") continue;
      params.push(operator === "contains" || operator === "not_contains"
        ? `%${String(rawValue)}%`
        : operator === "starts_with"
          ? `${String(rawValue)}%`
          : rawValue);
      const placeholder = `${params.length}`;
      if (operator === "equals") clauses.push(`${columnSql}=${placeholder}`);
      else if (operator === "not_equals") clauses.push(`(${columnSql}<>${placeholder} OR ${columnSql} IS NULL)`);
      else if (operator === "contains") clauses.push(`CAST(${columnSql} AS TEXT) ILIKE ${placeholder}`);
      else if (operator === "not_contains") clauses.push(`(CAST(${columnSql} AS TEXT) NOT ILIKE ${placeholder} OR ${columnSql} IS NULL)`);
      else if (operator === "starts_with") clauses.push(`CAST(${columnSql} AS TEXT) ILIKE ${placeholder}`);
      else if (operator === "greater_than") clauses.push(`${columnSql}>${placeholder}`);
      else if (operator === "less_than") clauses.push(`${columnSql}<${placeholder}`);
      else if (operator === "greater_or_equal") clauses.push(`${columnSql}>=${placeholder}`);
      else if (operator === "less_or_equal") clauses.push(`${columnSql}<=${placeholder}`);
    }
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search && readableFields.length) {
      params.push(`%${search}%`);
      const searchParam = `${params.length}`;
      clauses.push(`(${readableFields.map((field) => `CAST(${platformFieldSql(field, child)} AS TEXT) ILIKE ${searchParam}`).join(" OR ")})`);
    }
    const limit = boundedInteger(req.query.limit ?? req.query.pageSize, 25, 100);
    const count = await db(`SELECT COUNT(*)::int AS total FROM "${child.source_table}" WHERE ${clauses.join(" AND ")}`, params);
    const total = count.rows[0]?.total || 0;
    const pages = total ? Math.ceil(total / limit) : 0;
    const requestedPage = req.query.page !== undefined
      ? boundedInteger(req.query.page, 1, Math.max(1, pages || 1))
      : null;
    const offset = requestedPage
      ? (requestedPage - 1) * limit
      : Math.max(Number.parseInt(req.query.offset || "0", 10) || 0, 0);
    const page = requestedPage || (Math.floor(offset / limit) + 1);
    const sortField = typeof req.query.sortField === "string"
      ? readableFields.find((field) => field.api_name === req.query.sortField)
      : null;
    if (req.query.sortField && !sortField) return res.status(400).json({ success: false, message: "Related-list sort field is not readable" });
    const direction = String(req.query.sortDirection || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const order = sortField ? ` ORDER BY ${platformFieldSql(sortField, child)} ${direction}` : " ORDER BY id ASC";
    const dataParams = [...params, limit, offset];
    const result = await db(
      `SELECT id${columns.length ? `, ${columns.join(", ")}` : ""} FROM "${child.source_table}" WHERE ${clauses.join(" AND ")}${order} LIMIT ${dataParams.length - 1} OFFSET ${dataParams.length}`,
      dataParams
    );
    const hydrated = await hydrateExtensions(db, child, fields, result.rows, req);
    const formulaRecords = await calculateFormulaRecords(db, child, childMetadata.fields, hydrated, req);
    const calculated = await populateRollups(db, child, childMetadata.fields, formulaRecords, req);
    const records = calculated.map((record) => publicFormulaRecord(fields, record));
    res.json({ success: true, data: records, records, relationship, pageSize: limit, offset, total, page, pages });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    if (error instanceof FormulaError) return res.status(422).json({ success: false, code: error.code, message: error.message });
    console.error("Platform related records load error:", error);
    res.status(500).json({ success: false, message: "Unable to load related records" });
  }
});


  router.get("/platform/objects/:objectKey/records", authenticate, async (req, res) => {
    try {
      const metadata = await db("SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [req.params.objectKey, req.user.companyId]);
      const object = metadata.rows[0];
      if (!object || !object.source_table || !isSafeIdentifier(object.source_table)) return res.status(404).json({ success: false, message: "Object records are not available" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) return res.status(403).json({ success: false, message: "You do not have permission to view records for this object" });
      const metadataFields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order", [object.id, req.user.companyId]);
      if (systemObject(object)) object.company_scoped = true;
      const safeFields = safeSystemFields(object, metadataFields.rows);
      const fields = await applyFieldSecurity(db, safeFields, req);
      const readableFields = fields.filter((field) => field.readable !== false && field.field_type !== "formula" && field.field_type !== "rollup" && isSafeIdentifier(field.api_name) && Boolean(platformFieldSql(field, object)));
      const listView = req.query.listViewId ? (await db(
        `SELECT * FROM platform_list_views
          WHERE id=$1 AND object_id=$2 AND active=true
            AND (company_id IS NULL OR company_id=$3)
            AND (visibility_scope='company' OR owner_user_id=$4 OR (visibility_scope='roles' AND shared_role_ids ? $5))`,
        [req.query.listViewId, object.id, req.user.companyId, req.user.id, req.user.roleId ? String(req.user.roleId) : ""]
      )).rows[0] || null : null;
      const configuredColumns = listView && Array.isArray(listView.columns) ? listView.columns : null;
      // A List View controls presentation, filtering, sorting and page size.
      // It must not truncate the record payload: selecting a row still needs
      // every readable field for the shared record-detail and action runtime.
      const selectedReadable = readableFields;
      const columns = selectedReadable.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`);
      if (!columns.length && !fields.some(field => (field.field_type === "formula" || field.field_type === "rollup") && field.readable !== false)) return res.json({ success: true, data: [], records: [], page: 1, pageSize: 50, total: 0, pages: 0 });
      const fieldByApiName = new Map(readableFields.map((field) => [field.api_name, field]));
      const filters = parseRecordFilters(req.query);
      if (!filters) return res.status(400).json({ success: false, message: "filter must be a JSON object" });
      const requestedFilterModel = parseRecordFilterModel(req.query);
      if (!requestedFilterModel) return res.status(400).json({ success: false, message: "filterModel must be a JSON object" });
      const hasRequestedFilterModel = req.query?.filterModel !== undefined || req.query?.filter_model !== undefined;
      const filterModel = hasRequestedFilterModel
        ? requestedFilterModel
        : ((listView?.filter_model && typeof listView.filter_model === "object" && !Array.isArray(listView.filter_model)) ? listView.filter_model : {});
      const clauses = [];
      const params = [];
      if (object.company_scoped) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (object.store_scoped) {
        if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
        params.push(req.user.storeId); clauses.push(`store_id=$${params.length}`);
      }
      const sharing = await buildPlatformSharingScope({ db, object, fields, req, access: "read", paramsOffset: params.length });
      if (sharing.sql) { clauses.push(sharing.sql); params.push(...sharing.params); }
      if (listView && listView.filters && typeof listView.filters === "object" && !Array.isArray(listView.filters)) {
        for (const [apiName, value] of Object.entries(listView.filters)) {
          const field = fieldByApiName.get(apiName);
          if (!field) continue;
          const values = Array.isArray(value) ? value : [value];
          if (!values.length) continue;
          const placeholders = values.map((item) => {
            params.push(item);
            return `$${params.length}`;
          });

          clauses.push(values.length === 1 ? `${platformFieldSql(field, object)}=${placeholders[0]}` : `${platformFieldSql(field, object)} IN (${placeholders.join(",")})`);
        }
      }
      for (const [apiName, value] of Object.entries(filters)) {
        const field = fieldByApiName.get(apiName);
        if (!field) return res.status(400).json({ success: false, message: `Unknown or unavailable filter field "${apiName}"` });
        const values = Array.isArray(value) ? value : [value];
        if (!values.length) continue;
        const placeholders = values.map((item) => {
          params.push(item);
          return `$${params.length}`;
        });

        clauses.push(values.length === 1 ? `${platformFieldSql(field, object)}=${placeholders[0]}` : `${platformFieldSql(field, object)} IN (${placeholders.join(",")})`);
      }
      for (const [apiName, config] of Object.entries(filterModel)) {
        const field = fieldByApiName.get(apiName);
        if (!field) return res.status(400).json({ success: false, message: `Unknown or unavailable filter field "${apiName}"` });
        if (!config || typeof config !== "object" || Array.isArray(config)) continue;
        const columnSql = platformFieldSql(field, object);
        const selectedValues = Array.isArray(config.values) ? config.values.map(decodeFilterValue) : [];
        if (selectedValues.length) {
          const placeholders = selectedValues.map((item) => {
            params.push(item);
            return `$${params.length}`;
          });
          clauses.push(`${columnSql} IN (${placeholders.join(",")})`);
        }
        const operator = String(config.operator || "");
        const supported = new Set(["equals","not_equals","contains","not_contains","starts_with","greater_than","less_than","greater_or_equal","less_or_equal","is_blank","is_not_blank"]);
        if (!operator || !supported.has(operator)) continue;
        if (operator === "is_blank") {
          clauses.push(`(${columnSql} IS NULL OR CAST(${columnSql} AS TEXT)='')`);
          continue;
        }
        if (operator === "is_not_blank") {
          clauses.push(`(${columnSql} IS NOT NULL AND CAST(${columnSql} AS TEXT)<>'')`);
          continue;
        }
        const rawValue = decodeFilterValue(config.value);
        if (rawValue === undefined || rawValue === null || rawValue === "") continue;
        params.push(operator === "contains" || operator === "not_contains"
          ? `%${String(rawValue)}%`
          : operator === "starts_with"
            ? `${String(rawValue)}%`
            : rawValue);
        const placeholder = `$${params.length}`;
        if (operator === "equals") clauses.push(`${columnSql}=${placeholder}`);
        else if (operator === "not_equals") clauses.push(`(${columnSql}<>${placeholder} OR ${columnSql} IS NULL)`);
        else if (operator === "contains") clauses.push(`CAST(${columnSql} AS TEXT) ILIKE ${placeholder}`);
        else if (operator === "not_contains") clauses.push(`(CAST(${columnSql} AS TEXT) NOT ILIKE ${placeholder} OR ${columnSql} IS NULL)`);
        else if (operator === "starts_with") clauses.push(`CAST(${columnSql} AS TEXT) ILIKE ${placeholder}`);
        else if (operator === "greater_than") clauses.push(`${columnSql}>${placeholder}`);
        else if (operator === "less_than") clauses.push(`${columnSql}<${placeholder}`);
        else if (operator === "greater_or_equal") clauses.push(`${columnSql}>=${placeholder}`);
        else if (operator === "less_or_equal") clauses.push(`${columnSql}<=${placeholder}`);
      }

      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      if (search) {
        if (!readableFields.length) return res.status(400).json({ success: false, message: "Search requires a stored readable field" });
        params.push(`%${search}%`);
        const searchParam = `$${params.length}`;
        clauses.push(`(${readableFields.map((field) => `CAST(${platformFieldSql(field, object)} AS TEXT) ILIKE ${searchParam}`).join(" OR ")})`);
      }
      appendSystemReadScope(object, req, clauses, params);
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const countResult = await db(`SELECT COUNT(*)::int AS total FROM "${object.source_table}"${where}`, params);
      const total = countResult.rows[0]?.total || 0;
      const pageSize = listView && Number.isFinite(Number(listView.page_size)) ? Number(listView.page_size) : boundedInteger(req.query.pageSize ?? req.query.limit, 50, 200);
      const pages = total ? Math.ceil(total / pageSize) : 0;
      const page = pages ? Math.min(boundedInteger(req.query.page, 1, pages), pages) : 1;
      const offset = (page - 1) * pageSize;
      const dataParams = [...params, pageSize, offset];
      const savedSort = listView && listView.sort && typeof listView.sort === "object" ? normalizeListViewSort(listView.sort) : { field: null, direction: "asc" };
      const requestedSortField = typeof req.query.sortField === "string" ? req.query.sortField : null;
      const requestedSortDirection = String(req.query.sortDirection || "asc").toLowerCase() === "desc" ? "desc" : "asc";
      const sort = requestedSortField ? { field: requestedSortField, direction: requestedSortDirection } : savedSort;
      const sortField = sort.field ? fieldByApiName.get(sort.field) : null;
      if (requestedSortField && !sortField) return res.status(400).json({ success: false, message: "Sort field is not readable on this object" });
      const orderClause = sortField
        ? ` ORDER BY ${platformFieldSql(sortField, object)} ${sort.direction === "desc" ? "DESC" : "ASC"}`
        : ` ORDER BY id ASC`;
      const result = await db(`SELECT ${["id", ...columns].join(", ")} FROM "${object.source_table}"${where}${orderClause} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
      const associations = await loadRecordTypeAssociations(object, result.rows.map((record) => record.id), req);
      const typeByRecord = new Map(associations.rows.map((row) => [String(row.record_id), row.record_type_id]));
      const extended = await hydrateExtensions(db, object, fields, result.rows, req);
      const formulaRecords = await calculateFormulaRecords(db, object, safeFields, extended, req);
      const hydrated = await populateRollups(db, object, fields, formulaRecords, req);
      result.rows = hydrated.map((record) => ({ ...publicFormulaRecord(fields, record), recordTypeId: typeByRecord.get(String(record.id)) ?? null }));
      res.json({ success: true, data: result.rows, records: result.rows, page, pageSize, total, pages });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      if (error instanceof FormulaError) return res.status(422).json({ success: false, code: error.code, message: error.message });
      console.error("Platform records load error:", error);
      res.status(500).json({ success: false, message: "Unable to load object records" });
    }
  });

  router.get("/platform/objects/:objectKey/records/export", authenticate, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "export"))) return res.status(403).json({ success: false, message: "Export permission is required" });
      const fields = await applyFieldSecurity(db, metadataFields, req);
      const readableFields = fields.filter((field) => field.active === true && field.readable !== false && !isCalculatedField(field) && metadataColumn(field) && isSafeIdentifier(field.api_name));
      if (!readableFields.length) return res.status(400).json({ success: false, message: "This object has no readable exportable fields" });
      const filters = parseRecordFilters(req.query);
      if (filters === null) return res.status(400).json({ success: false, message: "filter must be a JSON object" });
      const clauses = [];
      const params = [];
      if (object.company_scoped) { params.push(req.user.companyId); clauses.push(`company_id=$${params.length}`); }
      if (object.store_scoped) { if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" }); params.push(req.user.storeId); clauses.push(`store_id=$${params.length}`); }
      const sharing = await buildPlatformSharingScope({ db, object, fields, req, access: "read", paramsOffset: params.length });
      if (sharing.sql) { clauses.push(sharing.sql); params.push(...sharing.params); }
      for (const [apiName, value] of Object.entries(filters)) {
        const field = readableFields.find((candidate) => candidate.api_name === apiName);
        if (!platformFieldSql(field, object)) continue;
        const values = Array.isArray(value) ? value : [value];
        const placeholders = values.map((item) => { params.push(item); return `$${params.length}`; });
        clauses.push(values.length === 1 ? `${platformFieldSql(field, object)}=${placeholders[0]}` : `${platformFieldSql(field, object)} IN (${placeholders.join(",")})`);
      }
      appendSystemReadScope(object, req, clauses, params);
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const queryFields = ["id", ...readableFields.map((field) => `${platformFieldSql(field, object)} AS "${field.api_name}"`)];
      const result = await db(`SELECT ${queryFields.join(", ")} FROM "${object.source_table}"${where} ORDER BY id`, params);
      const csvRows = [["id", ...readableFields.map((field) => field.api_name)].join(",")];
      for (const row of result.rows) {
        csvRows.push([csvEscape(row.id), ...readableFields.map((field) => csvEscape(row[field.api_name]))].join(","));
      }
      const csv = `\ufeff${csvRows.join("\r\n")}`;
      if (typeof writeAudit === "function") await writeAudit(req.user.companyId, req.user.id, "platform.bulk_export", "platform_object", object.id, { objectKey: object.object_key, rowCount: result.rows.length, scope: req.query });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${object.object_key}-records-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Platform object export error:", error);
      res.status(500).json({ success: false, message: "Unable to export object records" });
    }
  });

  router.post("/platform/objects/:objectKey/records/import/validate", ...manage, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "import"))) return res.status(403).json({ success: false, message: "Import permission is required" });
      const fields = await applyFieldSecurity(db, metadataFields, req);
      const csvText = typeof req.body?.csv === "string" ? req.body.csv : "";
      if (!csvText.trim()) return res.status(400).json({ success: false, message: "CSV content is required" });
      const { headers, rows } = parseCsv(csvText);
      if (!headers.length || !rows.length) return res.status(400).json({ success: false, message: "CSV contains no data rows" });
      const fieldByApiName = new Map(fields.filter((field) => field.active === true).map((field) => [field.api_name.toLowerCase(), field]));
      const errors = [];
      const warnings = [];
      const preview = [];
      const csvSeen = new Map();
      let valid = 0;
      let warningCount = 0;
      const operation = normalizeRequestedOperation(req.body?.operation ?? "auto");
      for (const { row, lineNumber } of rows) {
        const { input, existingId } = buildImportRowInput(row, fieldByApiName);
        const action = resolveImportAction(operation, existingId);
        const validation = await validateImportRow(req, object, fields, input, { lineNumber, action, existingId, operation, csvSeen });
        if (validation.status === "error") {
          errors.push({ row: lineNumber, status: "error", field: validation.field, value: validation.value, message: validation.message, rowData: input, originalRow: row });
          continue;
        }
        if (validation.warnings?.length) {
          warningCount += validation.warnings.length;
          warnings.push(...validation.warnings.map((warning) => ({ row: lineNumber, status: "warning", rowData: input, originalRow: row, ...warning })));
        }
        preview.push({ row: lineNumber, status: validation.warnings?.length ? "warning" : "valid", action: validation.action || action, rowData: input, warnings: validation.warnings || [] });
        valid += 1;
      }
      const summary = summarizeImportPreview(rows, preview);
      summary.warnings = warningCount;
      summary.errors = errors.length;
      summary.create = preview.filter((item) => item.action === "create").length;
      summary.update = preview.filter((item) => item.action === "update").length;
      summary.skip = errors.length;
      summary.error = errors.length;
      summary.failed = errors.length;
      res.json({ success: true, data: { rowCount: rows.length, valid, warnings: warningCount, errors: errors.length, preview, warnings, summary, errors } });
    } catch (error) {
      console.error("Platform import validation error:", error);
      res.status(500).json({ success: false, message: "Unable to validate object import" });
    }
  });

  router.post("/platform/objects/:objectKey/records/import", ...manage, async (req, res) => {
    try {
      const { object, fields: metadataFields } = await getRecordMetadata(req.params.objectKey, req);
      if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
      if (!(await hasPlatformObjectPermission(db, req, object.id, "import"))) return res.status(403).json({ success: false, message: "Import permission is required" });
      const fields = await applyFieldSecurity(db, metadataFields, req);
      const csvText = typeof req.body?.csv === "string" ? req.body.csv : "";
      if (!csvText.trim()) return res.status(400).json({ success: false, message: "CSV content is required" });
      const { rows } = parseCsv(csvText);
      if (!rows.length) return res.status(400).json({ success: false, message: "CSV contains no data rows" });
      const operation = normalizeRequestedOperation(req.body?.operation ?? "auto");
      const fieldByApiName = new Map(fields.filter((field) => field.active === true).map((field) => [field.api_name.toLowerCase(), field]));
      const results = [];
      const errors = [];
      const csvSeen = new Map();
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const { row, lineNumber } of rows) {
        const { input, existingId } = buildImportRowInput(row, fieldByApiName);
        const action = resolveImportAction(operation, existingId);
        try {
          const validation = await validateImportRow(req, object, fields, input, { lineNumber, action, existingId, operation, csvSeen });
          if (validation.status === "error") {
            errors.push({ row: lineNumber, status: "error", code: validation.code, field: validation.field, value: validation.value, message: validation.message, rowData: input, originalRow: row });
            skipped += 1;
            continue;
          }
          const finalAction = validation.action || action;
          const targetPlan = await resolveImportTarget(req, object, fields, input, { operation, existingId });
          const targetId = finalAction === "update" ? targetPlan.targetId : null;
          const saved = await executeCanonicalRecordWrite({ req, object, metadataFields, fields, input, action: finalAction, recordId: targetId });
          if (saved.status !== 200) {
            errors.push({ row: lineNumber, status: "error", code: saved.code, message: saved.message, rowData: input, originalRow: row });
            skipped += 1;
            continue;
          }
          if (finalAction === "update") {
            updated += 1;
            results.push({ row: lineNumber, action: "update", id: saved.id, status: "updated", messages: saved.messages });
          } else {
            created += 1;
            results.push({ row: lineNumber, action: "create", id: saved.id || null, status: "created", messages: saved.messages });
          }
        } catch (error) {
          errors.push({ row: lineNumber, status: "error", message: error.message || "Import failed", rowData: input, originalRow: row });
          skipped += 1;
        }
      }
      const summary = { created, updated, skipped, failed: errors.length };
      res.json({ success: true, data: { summary, results, errors } });
      if (typeof writeAudit === "function") await writeAudit(req.user.companyId, req.user.id, "platform.bulk_import", "platform_object", object.id, {
        objectKey: object.object_key,
        operation,
        fileName: req.body?.fileName || req.body?.filename || null,
        created,
        updated,
        skipped,
        failed: errors.length,
      });
    } catch (error) {
      console.error("Platform object import error:", error);
      res.status(500).json({ success: false, message: "Unable to import object records" });
    }
  });

  router.get("/platform/objects/:objectKey/records/:recordId/history", authenticate, async (req, res) => {
    if (!recordIdIsValid(req.params.recordId)) return res.status(400).json({ success: false, message: "Invalid record identifier" });
    const metadata = await db(
      "SELECT id,object_key,source_table,store_scoped FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
      [req.params.objectKey, req.user.companyId]
    );
    const object = metadata.rows[0];
    if (!object) return res.status(404).json({ success: false, message: "Unknown object" });
    if (!(await hasPlatformObjectPermission(db, req, object.id, "view"))) return res.status(403).json({ success: false, message: "View permission is required" });
    const params = [object.id, req.params.recordId, req.user.companyId];
    const scope = "object_id=$1 AND record_id=$2 AND company_id=$3";
    let storeClause = "";
    if (object.store_scoped) {
      if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      params.push(req.user.storeId);
      if (!isSafeIdentifier(object.source_table)) {
        return res.status(500).json({ success: false, message: "Object source is invalid" });
      }
      storeClause = ` AND record_id IN (SELECT id FROM "${object.source_table}" WHERE id=$2 AND store_id=$4)`;
    }
    const result = await db(
      `SELECT * FROM platform_record_history WHERE ${scope}${storeClause} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    console.error("Platform route error:", error);
    return res.status(status).json({
      success: false,
      message: status >= 500 ? "Platform request failed" : (error?.message || "Platform request failed"),
    });
  });

  return router;
}
