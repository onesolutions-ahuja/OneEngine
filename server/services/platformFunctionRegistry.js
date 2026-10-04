// OneEngine core-function boundary.
//
// Business-specific functions are intentionally not registered here.
// Business behaviour must be implemented as visible metadata + Flow using
// generic platform primitives from platformWorkflow.js.
//
// This registry remains only as a compatibility surface for callers that still
// query registered functions while the codebase is being reset. It must stay
// empty unless a future capability is proven to be a genuinely generic,
// technical platform primitive that cannot be represented by Flow metadata.

export const PLATFORM_FUNCTIONS = Object.freeze([]);

export const PLATFORM_FUNCTION_MAP = new Map();

export function getPlatformFunction(key) {
  return PLATFORM_FUNCTION_MAP.get(String(key || "").trim()) || null;
}

export function listPlatformFunctions() {
  return [];
}
