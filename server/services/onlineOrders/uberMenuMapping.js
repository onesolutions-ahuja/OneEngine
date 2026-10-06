/*
 * Uber menu business-field mappings are metadata-owned.
 * This boundary only validates that connector configuration carries a JSON
 * mapping document; it does not know OneEngine objects or fields.
 */
export class UberMenuMappingError extends Error {
  constructor(message, code = "INVALID_MENU_MAPPING", details = null) {
    super(message);
    this.name = "UberMenuMappingError";
    this.code = code;
    this.details = details;
  }
}

export const UBER_MENU_MAPPING_SCHEMA = Object.freeze([]);

export function sanitizeUberMenuMapping(configuration) {
  if (configuration == null) return {};
  if (typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new UberMenuMappingError("Uber menu mapping metadata must be an object");
  }
  return JSON.parse(JSON.stringify(configuration));
}

export function resolveUberMenuProducts() {
  throw new UberMenuMappingError("Uber menu product mapping must execute through metadata/Flow", "METADATA_FLOW_REQUIRED");
}
