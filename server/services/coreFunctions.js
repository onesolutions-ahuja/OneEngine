// OneEngine canonical core-function boundary.
//
// IMPORTANT ARCHITECTURE RULE
// ---------------------------
// Apps/screens/components may contain UI behaviour only. Business behaviour must
// be expressed through metadata and visible ONE-* Flows. App code must not add
// business-specific calculations, status transitions, mappings, object writes,
// provider sequences, or hidden decision logic.
//
// This file is the single allow-list for generic runtime operations that an app
// or Flow may invoke directly. The implementations remain metadata-driven and
// object-agnostic.
//
// New reusable Flows must use the prefix: ONE-

export const ONE_FLOW_PREFIX = "ONE-";

export const CORE_FUNCTIONS = Object.freeze([
  // Generic record access
  "GET_RECORDS",
  "CREATE_RECORD",
  "UPDATE_RECORD",
  "DELETE_RECORD",

  // Generic related-record / ownership operations
  "CREATE_RELATED_RECORD",
  "UPDATE_RELATED_RECORD",
  "ASSIGN_RECORD",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",

  // Generic external transport
  "HTTP_REQUEST",
  "CALL_WEBHOOK",
  "WEBHOOK",
  "CALL_CONNECTOR",

  // Generic provider-neutral communication
  "SEND_COMMUNICATION",

  // Reuse visible Flow metadata
  "RUN_SUBFLOW",
]);

export const CORE_FUNCTION_SET = new Set(CORE_FUNCTIONS);

export function isCoreFunction(key) {
  return CORE_FUNCTION_SET.has(String(key || "").trim().toUpperCase());
}

export function assertCoreFunction(key) {
  const normalized = String(key || "").trim().toUpperCase();
  if (!CORE_FUNCTION_SET.has(normalized)) {
    throw new Error(
      `Non-core function "${key}" is not permitted. Use metadata, a ONE-* Flow, Validation Rule, Formula Field, Rollup Field, or an approved generic core function.`
    );
  }
  return normalized;
}

export function assertOneFlowName(name) {
  const value = String(name || "").trim();
  if (!value.startsWith(ONE_FLOW_PREFIX)) {
    throw new Error(`New Flow names must start with "${ONE_FLOW_PREFIX}".`);
  }
  return value;
}

export function listCoreFunctions() {
  return CORE_FUNCTIONS.slice();
}
