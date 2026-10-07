import { getWorkflowActionRegistry } from "./platformWorkflow.js";

// Action choices are supplied by the canonical workflow/core-function registry.
// This module must not own a second static action catalogue.
const CORE_ACTIONS = Object.freeze([]);

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
