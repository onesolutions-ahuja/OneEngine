import { getWorkflowActionRegistry } from "./platformWorkflow.js";

// Canonical executable registry: only Flow elements and approved core functions.
const definitions = getWorkflowActionRegistry();
const duplicateKeys = definitions.map((item) => item.key).filter((key, index, all) => all.indexOf(key) !== index);
if (duplicateKeys.length) throw new Error(`Duplicate registered action keys: ${[...new Set(duplicateKeys)].join(", ")}`);

export const PLATFORM_ACTION_REGISTRY = Object.freeze(definitions);
export const PLATFORM_ACTION_MAP = new Map(PLATFORM_ACTION_REGISTRY.map((item) => [item.key, item]));
export function listRegisteredPlatformActions() { return PLATFORM_ACTION_REGISTRY.slice(); }
export function getRegisteredPlatformAction(key) { return PLATFORM_ACTION_MAP.get(String(key || "").trim()) || null; }
