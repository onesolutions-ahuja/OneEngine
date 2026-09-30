import { PLATFORM_FUNCTIONS } from "./platformFunctionRegistry.js";
import { PLATFORM_ACTION_REGISTRY } from "./platformActionRegistry.js";
import { TRUSTED_JOB_KINDS } from "./trustedRuntime.js";

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
    .filter((item) => item?.key && item.key !== "WORKFLOW")
    .map(actionWorkflow);
  const jobs = TRUSTED_JOB_KINDS.map(jobWorkflow);
  return [...functions, ...actions, ...jobs];
}

export async function ensureSystemWorkflowCatalog({ db, companyId, userId = null }) {
  if (!db || typeof db !== "function" || !companyId) return { created: 0, existing: 0, total: 0 };

  const definitions = systemWorkflowDefinitions();
  const existingResult = await db(
    `SELECT id, action, user_modified
       FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL`,
    [companyId]
  );
  const existing = new Map(
    (existingResult.rows || []).map((row) => [String(row.action?.systemKey || ""), row])
  );

  let created = 0;
  for (const definition of definitions) {
    if (existing.has(definition.systemKey)) continue;
    await db(
      `INSERT INTO platform_rules
         (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,company_id,created_by,managed,package_required,user_modified)
       VALUES
         (NULL,$1,$2,'[]'::jsonb,$3::jsonb,FALSE,'DRAFT',1,$4,$5,TRUE,FALSE,FALSE)`,
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

  return {
    created,
    existing: existing.size,
    total: definitions.length,
  };
}
