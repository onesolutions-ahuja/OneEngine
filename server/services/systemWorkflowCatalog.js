import { PACKAGE_RUNTIME_FLOWS } from "../packages/runtimeFlowManifests.js";

const outputVariable = (name, dataType = "Text", extra = {}) => ({
  value: `variables.${name}`,
  apiName: name,
  label: name,
  type: "Variable",
  dataType,
  defaultValue: "",
  isCollection: false,
  availableInput: false,
  availableOutput: true,
  objectKey: "",
  ...extra,
});
const assignment = (id, label, variableName, variableType, value) => ({
  id, label, apiName: id, key: "ASSIGNMENT", variableName, variableType, operator: "set", value,
});

const withBuilderMetadata = (definition) => {
  const action = definition?.action || {};
  const actions = Array.isArray(action.actions) ? action.actions : [];
  if (!actions.length) return definition;
  return {
    ...definition,
    action: {
      ...action,
      gptBuilder: true,
      layout: action.layout || { mode: "AUTO" },
      gptBuilderElements: Array.isArray(action.gptBuilderElements) && action.gptBuilderElements.length
        ? action.gptBuilderElements
        : actions.map((step, index) => ({
            id: step.id || `system-step-${index + 1}`,
            key: "action",
            label: step.label || step.apiName || step.key || `Step ${index + 1}`,
            apiName: step.apiName || step.id || `System_Step_${index + 1}`,
            description: step.description || "",
            labelSource: "manual",
            apiNameSource: "manual",
            config: {
              actionKey: step.key || step.type || "",
              inputs: {},
              inputModes: {},
              inputIncluded: {},
              transforms: {},
              outputMode: "automatic",
              manualOutputs: [],
              importedRuntimeAction: step,
              importedRuntimeActionText: "",
            },
            configured: true,
            source: "runtime_import",
            position: null,
          })),
    },
  };
};

const creditInput = (name, type, { required = false, defaultValue = null } = {}) => ({
  name,
  label: name,
  type,
  required,
  defaultValue,
});
const creditFormula = (id, resourceName, resultType, expression, inputs) => ({
  id,
  label: resourceName,
  apiName: id,
  key: "FORMULA",
  resourceName,
  resultType,
  expression,
  inputs,
});
const creditResourceType = (type) => ({
  text: "Text",
  number: "Number",
  boolean: "Boolean",
  object: "Object",
  record: "Record",
  collection: "Collection",
  date: "Date",
  datetime: "DateTime",
})[String(type || "text").toLowerCase()] || "Text";
const creditFlow = ({ key, name, inputs, outputs, actions }) => {
  const resources = [
    ...inputs.map((input) => outputVariable(input.name, creditResourceType(input.type), {
      availableInput: true,
      availableOutput: false,
      defaultValue: input.defaultValue,
      isCollection: input.type === "collection",
    })),
    ...outputs.map((output) => outputVariable(output.name, creditResourceType(output.type), {
      availableInput: false,
      availableOutput: true,
      isCollection: output.type === "collection",
    })),
  ];
  const resourceNames = new Set(resources.map((resource) => resource.apiName));
  for (const action of actions) {
    const actionType = String(action?.type || action?.key || "").toUpperCase();
    const candidates = actionType === "FORMULA"
      ? [{ name: action.resourceName, type: action.resultType }]
      : actionType === "ASSIGNMENT"
        ? [{ name: action.variableName, type: action.variableType }]
        : actionType === "LOOP"
          ? [{ name: action.itemVariable, type: "object" }]
          : ["COLLECTION_FILTER", "TRANSFORM"].includes(actionType)
            ? [{ name: action.outputVariable, type: "collection" }]
            : [];
    for (const candidate of candidates) {
      const name = String(candidate.name || "");
      if (!name || resourceNames.has(name)) continue;
      resources.push(outputVariable(name, creditResourceType(candidate.type), {
        availableInput: false,
        availableOutput: true,
        defaultValue: candidate.type === "collection" ? [] : candidate.type === "object" ? {} : "",
        isCollection: candidate.type === "collection",
      }));
      resourceNames.add(name);
    }
  }
  return {
    systemKey: `flow:${key}`,
    name: `COPILOT- ${name}`,
    triggerKey: "manual",
    action: {
      type: "workflow",
      systemGenerated: true,
      systemKey: `flow:${key}`,
      scope: "system",
      capabilityType: "workflow",
      capabilityKey: key,
      apiName: key.replaceAll(".", "_"),
      flowType: "AUTOLAUNCHED",
      inputs,
      outputs: outputs.map((output) => output.name),
      inputContract: inputs,
      outputContract: outputs,
      resources,
      actions,
    },
  };
};

const CUSTOMER_CREDIT_SYSTEM_WORKFLOWS = [];

const tillFlow = (spec) => {
  const flow = creditFlow(spec);
  return { ...flow, name: `OneTill - ${spec.name}` };
};

const TILL_SYSTEM_WORKFLOWS = Object.freeze([]);

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
      resources: [
        outputVariable("barcode", "Text", { availableInput: true }),
        outputVariable("found", "Boolean"),
        outputVariable("productName"),
        outputVariable("brand"),
        outputVariable("imageUrl"),
        outputVariable("ingredients"),
      ],
      actions: [
        { id: "lookup_http", label: "Lookup Product", apiName: "lookup_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/{{barcode}}.json" },
        { id: "product_found", label: "Product Found?", apiName: "product_found", key: "CONDITION",
          outcomes: [{ id: "found", label: "Found", condition: { match: "all", conditions: [
            { field: "steps.lookup_http.success", operator: "equals", value: true },
            { field: "steps.lookup_http.data.status", operator: "equals", value: 1 }
          ] }, branch: ["set_found","set_barcode","set_product_name","set_brand","set_image_url","set_ingredients"] }],
          defaultLabel: "Not Found", defaultBranch: ["set_not_found"] },
        assignment("set_found", "Set Found", "found", "boolean", true),
        assignment("set_barcode", "Set Barcode", "barcode", "text", { path: "steps.lookup_http.data.code" }),
        assignment("set_product_name", "Set Product Name", "productName", "text", { path: "steps.lookup_http.data.product.product_name" }),
        assignment("set_brand", "Set Brand", "brand", "text", { path: "steps.lookup_http.data.product.brands" }),
        assignment("set_image_url", "Set Image URL", "imageUrl", "text", { path: "steps.lookup_http.data.product.image_front_url" }),
        assignment("set_ingredients", "Set Ingredients", "ingredients", "text", { path: "steps.lookup_http.data.product.ingredients_text" }),
        assignment("set_not_found", "Set Not Found", "found", "boolean", false),
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
      resources: [
        outputVariable("connected", "Boolean"),
        outputVariable("message"),
        outputVariable("statusCode", "Number"),
      ],
      actions: [
        { id: "test_http", label: "Call Open Food Facts", apiName: "test_http", key: "ONE_HTTP_REQUEST", providerKey: "open_food_facts", method: "GET", endpoint: "/api/v2/product/737628064502.json" },
        { id: "connection_ok", label: "Connection Successful?", apiName: "connection_ok", key: "CONDITION",
          outcomes: [{ id: "success", label: "Success", condition: { match: "all", conditions: [{ field: "steps.test_http.success", operator: "equals", value: true }] },
            branch: ["set_connected","set_connected_message","set_connected_status"] }],
          defaultLabel: "Failed", defaultBranch: ["set_failed","set_failed_message","set_failed_status"] },
        assignment("set_connected", "Set Connected", "connected", "boolean", true),
        assignment("set_connected_message", "Set Connected Message", "message", "text", "Connected"),
        assignment("set_connected_status", "Set Connected Status Code", "statusCode", "number", { path: "steps.test_http.statusCode" }),
        assignment("set_failed", "Set Failed", "connected", "boolean", false),
        assignment("set_failed_message", "Set Failed Message", "message", "text", "Connection failed"),
        assignment("set_failed_status", "Set Failed Status Code", "statusCode", "number", { path: "steps.test_http.statusCode" }),
      ]
    }
  },

]);

function titleCase(value = "") {
  return String(value)
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function systemWorkflowDefinitions() {
  return [...CUSTOMER_CREDIT_SYSTEM_WORKFLOWS, ...TILL_SYSTEM_WORKFLOWS, ...PLATFORM_SYSTEM_WORKFLOWS, ...PACKAGE_RUNTIME_FLOWS].map(withBuilderMetadata);
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
    const current = existing.get(definition.systemKey);
    if (current) {
      if (current.user_modified !== true) {
        await db(
          `UPDATE platform_rules
              SET name=$1,trigger_key=$2,action=$3::jsonb,active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
            WHERE id=$4 AND company_id=$5 AND COALESCE(user_modified,FALSE)=FALSE`,
          [definition.name, definition.triggerKey, JSON.stringify(definition.action), current.id, companyId]
        );
      }
      continue;
    }
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
