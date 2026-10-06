import { packageFunctions } from "../packages/functionsIndex.js";

// Legacy function registry is intentionally empty of business capabilities.
// Business behaviour belongs to metadata + editable Flows. Only package-level
// generic technical functions may be surfaced here, and current packages
// register none.
export const PLATFORM_FUNCTIONS = Object.freeze([...packageFunctions]);

const duplicates = PLATFORM_FUNCTIONS
  .map((item) => item.key)
  .filter((key, index, all) => all.indexOf(key) !== index);
if (duplicates.length) {
  throw new Error(`Duplicate registered function keys: ${[...new Set(duplicates)].join(", ")}`);
}

export const PLATFORM_FUNCTION_MAP = new Map(PLATFORM_FUNCTIONS.map((item) => [item.key, item]));
export function getPlatformFunction(key) {
  return PLATFORM_FUNCTION_MAP.get(String(key || "").trim()) || null;
}
export function listPlatformFunctions() {
  return PLATFORM_FUNCTIONS.slice();
}
