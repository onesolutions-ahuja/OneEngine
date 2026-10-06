import { packageFunctions } from "../packages/functionsIndex.js";
import { dispatchIntegrationEvent } from "./integrationDispatcher.js";

// Temporary compatibility registry.
//
// Only capabilities with a confirmed runtime caller remain here. Business
// capabilities are migrated to visible metadata/Flow and removed from this
// registry as their callers are converted to generic primitives.
const CORE_PLATFORM_FUNCTIONS = Object.freeze([
  {
    key: "integration.event.dispatch",
    category: "INTEGRATIONS",
    description: "Compatibility capability while integration dispatch is migrated to connector Flow.",
    inputs: { type: "object", required: ["event", "entityId"] },
    outputs: { type: "object" },
    permissions: ["integrations.manage"],
    handler: async ({ inputs = {}, db, companyId, req }) =>
      dispatchIntegrationEvent({
        event: inputs.event,
        deps: { db },
        context: {
          companyId: companyId || req?.user?.companyId,
          storeId: inputs.storeId || req?.user?.storeId,
        },
        entityId: inputs.entityId,
      }),
  },
]);

export const PLATFORM_FUNCTIONS = Object.freeze([...CORE_PLATFORM_FUNCTIONS, ...packageFunctions]);

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
