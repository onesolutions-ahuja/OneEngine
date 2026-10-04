import { PLATFORM_FUNCTIONS } from "./platformFunctionRegistry.js";
import { PLATFORM_ACTION_REGISTRY } from "./platformActionRegistry.js";
import { TRUSTED_JOB_KINDS } from "./trustedJobKinds.js";

const PLATFORM_SYSTEM_WORKFLOWS = Object.freeze([
  {
    systemKey: "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
    name: "GPT - Open Food Facts - Lookup Product",
    triggerKey: "manual",
    action: {
      type: "workflow", systemGenerated: true, systemKey: "flow:GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
      scope: "system", capabilityType: "workflow", capabilityKey: "GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
      apiName: "GPT_OPEN_FOOD_FACTS_LOOKUP_PRODUCT", flowType: "AUTOLAUNCHED",
      inputs: [{ name: "barcode", type: "text", required: true }],
      outputs: ["found","barcode","productName","brand","imageUrl","ingredients"],
      actions: [
        { id: "lookup_http", label: "Lookup Product", apiName: "lookup_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/{{barcode}}.json" },
        { id: "product_found", label: "Product Found?", apiName: "product_found", key: "CONDITION", outcomes: [{ id: "found", label: "Found", condition: { match: "all", conditions: [{ field: "steps.lookup_http.success", operator: "equals", value: true }, { field: "steps.lookup_http.data.status", operator: "equals", value: 1 }] }, branch: ["assign_found"] }], defaultLabel: "Not Found", defaultBranch: ["assign_not_found"] },
        { id: "assign_found", label: "Set Product Outputs", apiName: "assign_found", key: "ASSIGNMENT", assignments: [
          { variable: "variables.found", variableType: "boolean", operator: "set", value: true },
          { variable: "variables.barcode", variableType: "text", operator: "set", value: { path: "steps.lookup_http.data.code" } },
          { variable: "variables.productName", variableType: "text", operator: "set", value: { path: "steps.lookup_http.data.product.product_name" } },
          { variable: "variables.brand", variableType: "text", operator: "set", value: { path: "steps.lookup_http.data.product.brands" } },
          { variable: "variables.imageUrl", variableType: "text", operator: "set", value: { path: "steps.lookup_http.data.product.image_front_url" } },
          { variable: "variables.ingredients", variableType: "text", operator: "set", value: { path: "steps.lookup_http.data.product.ingredients_text" } }
        ] },
        { id: "assign_not_found", label: "Set Not Found Output", apiName: "assign_not_found", key: "ASSIGNMENT", assignments: [
          { variable: "variables.found", variableType: "boolean", operator: "set", value: false },
          { variable: "variables.barcode", variableType: "text", operator: "set", value: { path: "barcode" } }
        ] }
      ]
    }
  },
  {
    systemKey: "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
    name: "GPT - Open Food Facts - Test Connection",
    triggerKey: "manual",
    action: {
      type: "workflow", systemGenerated: true, systemKey: "flow:GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
      scope: "system", capabilityType: "workflow", capabilityKey: "GPT_OPEN_FOOD_FACTS_TEST_CONNECTION",
      apiName: "GPT_OPEN_FOOD_FACTS_TEST_CONNECTION", flowType: "AUTOLAUNCHED",
      outputs: ["connected","message","statusCode"],
      actions: [
        { id: "test_http", label: "Call Open Food Facts", apiName: "test_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/737628064502.json" },
        { id: "connection_ok", label: "Connection Successful?", apiName: "connection_ok", key: "CONDITION", outcomes: [{ id: "success", label: "Success", condition: { match: "all", conditions: [{ field: "steps.test_http.success", operator: "equals", value: true }] }, branch: ["assign_connected"] }], defaultLabel: "Failed", defaultBranch: ["assign_failed"] },
        { id: "assign_connected", label: "Set Connected Output", apiName: "assign_connected", key: "ASSIGNMENT", assignments: [
          { variable: "variables.connected", variableType: "boolean", operator: "set", value: true },
          { variable: "variables.message", variableType: "text", operator: "set", value: "Connected" },
          { variable: "variables.statusCode", variableType: "number", operator: "set", value: { path: "steps.test_http.statusCode" } }
        ] },
        { id: "assign_failed", label: "Set Failed Output", apiName: "assign_failed", key: "ASSIGNMENT", assignments: [
          { variable: "variables.connected", variableType: "boolean", operator: "set", value: false },
          { variable: "variables.message", variableType: "text", operator: "set", value: "Connection failed" },
          { variable: "variables.statusCode", variableType: "number", operator: "set", value: { path: "steps.test_http.statusCode" } }
        ] }
      ]
    }
  }
]);

function titleCase(value = "") {
  return String(value)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function functionWorkflow(fn) {
  return {
    systemKey: `function:${fn.key}`,
    name: `System · Function · ${titleCase(fn.key)}`,
    triggerKey: "system_function",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `function:${fn.key}`,
      scope: "system",
      capabilityType: "function",
      capabilityKey: fn.key,
      actions: [{
        type: "CALL_FUNCTION",
        functionKey: fn.key,
        inputs: {},
        label: fn.description || fn.key,
      }],
    },
  };
}

function actionWorkflow(action) {
  return {
    systemKey: `action:${action.key}`,
    name: `System · Action · ${action.displayName || titleCase(action.key)}`,
    triggerKey: "system_action",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `action:${action.key}`,
      scope: "system",
      capabilityType: "action",
      capabilityKey: action.key,
      // This is the canonical editable wrapper. Phase 3 reroutes callers
      // through these workflow ids and supplies runtime inputs/config.
      actions: [{
        type: action.key,
        systemTemplate: true,
        label: action.displayName || action.key,
      }],
    },
  };
}

function jobWorkflow(kind) {
  return {
    systemKey: `job:${kind}`,
    name: `System · Trigger · ${titleCase(kind)}`,
    triggerKey: "system_job",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `job:${kind}`,
      scope: "system",
      capabilityType: "job",
      capabilityKey: kind,
      // Job execution is wired to these entries in Phase 3.
      actions: [{
        type: "STOP",
        reason: `System job trigger placeholder for ${kind}`,
        systemTemplate: true,
      }],
    },
  };
}

export function systemWorkflowDefinitions() {
  const functions = PLATFORM_FUNCTIONS.map(functionWorkflow);
  const actions = PLATFORM_ACTION_REGISTRY
    .filter((item) => item?.key && item.key !== "WORKFLOW" && item.systemVisible !== false)
    .map(actionWorkflow);
  const jobs = TRUSTED_JOB_KINDS.map(jobWorkflow);
  return [...functions, ...actions, ...jobs, ...PLATFORM_SYSTEM_WORKFLOWS];
}

export async function ensureSystemWorkflowCatalog({ db, companyId, userId = null }) {
  if (!db || typeof db !== "function" || !companyId) return { created: 0, existing: 0, total: 0 };

  const definitions = systemWorkflowDefinitions();
  const existingResult = await db(
    `SELECT id,name,object_id,trigger_key,conditions,action,version,active_version,lifecycle_status,created_by,user_modified
       FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL`,
    [companyId]
  );
  const existing = new Map(
    (existingResult.rows || []).map((row) => [String(row.action?.systemKey || ""), row])
  );

  // Remove untouched generated wrappers whose underlying capability no longer exists.
  // Developer-modified wrappers are preserved for explicit migration/review.
  const validSystemKeys = definitions.map((definition) => definition.systemKey);
  const staleResult = await db(
    `DELETE FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL
        AND COALESCE(user_modified,FALSE)=FALSE
        AND NOT ((action->>'systemKey') = ANY($2::text[]))
      RETURNING id,action->>'systemKey' AS system_key`,
    [companyId, validSystemKeys]
  );
  const removed = staleResult.rows?.length || 0;

  // System workflows are executable defaults. Respect developer edits, but
  // repair untouched rows created by older catalogue versions.
  await db(
    `UPDATE platform_rules
        SET active=TRUE,lifecycle_status='ACTIVE',active_version=COALESCE(active_version,version,1),updated_at=NOW()
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND COALESCE(user_modified,FALSE)=FALSE
        AND (active=FALSE OR lifecycle_status<>'ACTIVE')`,
    [companyId]
  );

  let created = 0;
  for (const definition of definitions) {
    if (existing.has(definition.systemKey)) continue;
    await db(
      `INSERT INTO platform_rules
         (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,created_by,managed,package_required,user_modified)
       VALUES
         (NULL,$1,$2,'[]'::jsonb,$3::jsonb,TRUE,'ACTIVE',1,1,$4,$5,TRUE,FALSE,FALSE)`,
      [
        definition.name,
        definition.triggerKey,
        JSON.stringify(definition.action),
        companyId,
        userId || null,
      ]
    );
    created += 1;
  }

  await db(
    `INSERT INTO platform_workflow_versions
       (company_id,workflow_id,version,definition,lifecycle_status,created_by)
     SELECT r.company_id,r.id,COALESCE(r.active_version,r.version,1),
            jsonb_build_object(
              'object_id',r.object_id,
              'name',r.name,
              'trigger_key',r.trigger_key,
              'conditions',r.conditions,
              'action',r.action,
              'active',r.active,
              'lifecycle_status',r.lifecycle_status,
              'version',COALESCE(r.active_version,r.version,1)
            ),
            r.lifecycle_status,r.created_by
       FROM platform_rules r
      WHERE r.company_id=$1
        AND r.action->>'systemGenerated'='true'
        AND r.action->>'systemKey' IS NOT NULL
     ON CONFLICT (company_id,workflow_id,version) DO NOTHING`,
    [companyId]
  );

  return {
    created,
    removed,
    existing: Math.max(0, existing.size - removed),
    total: definitions.length,
  };
}
