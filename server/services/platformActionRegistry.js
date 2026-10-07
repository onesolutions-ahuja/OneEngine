import { getWorkflowActionRegistry } from "./platformWorkflow.js";

// Canonical generic platform actions are safe to initialize independently.
// Workflow actions are resolved lazily so the workflow runtime can depend on
// durable jobs without creating an initialization cycle through Trusted Runtime.
const CORE_ACTIONS = Object.freeze([
  { key: "RECORD_SAVE", displayName: "Save Record", description: "Run the canonical create/update record save pipeline." },
  { key: "RECORD_DELETE", displayName: "Delete Record", description: "Run the canonical record delete pipeline." },
]);

export const PLATFORM_ACTION_REGISTRY = CORE_ACTIONS;
export const PLATFORM_ACTION_MAP = new Map(PLATFORM_ACTION_REGISTRY.map((item) => [item.key, item]));

function mergedActions() {
  const definitions = [...CORE_ACTIONS, ...getWorkflowActionRegistry()];
  const seen = new Set();
  const merged = [];
  for (const definition of definitions) {
    const key = String(definition?.key || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(definition);
  }
  return merged;
}

export function listRegisteredPlatformActions() {
  return mergedActions();
}

export function getRegisteredPlatformAction(key) {
  const normalized = String(key || "").trim();
  return PLATFORM_ACTION_MAP.get(normalized)
    || mergedActions().find((item) => String(item?.key || "").trim() === normalized)
    || null;
}
