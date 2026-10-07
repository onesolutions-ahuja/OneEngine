import { createConnectorActionExecutor } from "./connectorFramework.js";

function jsonValue(value, fallback = {}) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

/**
 * Execute a connector capability entirely from persisted metadata.
 * integration_connections selects a platform_connector_definition and the
 * generic executor resolves credentials + operation mappings.
 */
export async function executeInstalledConnectorCapability({
  db,
  companyId,
  connectorInstanceId,
  capability,
  payload = {},
  requireEnabled = true,
  requireHealthy = true,
}) {
  if (!db || typeof db !== "function") throw new Error("Connector capability execution requires database context");
  if (!companyId) throw new Error("Connector capability execution requires company context");
  if (!connectorInstanceId) throw new Error("Connector capability execution requires an instance id");
  const capabilityKey = String(capability || "").trim();
  if (!capabilityKey) throw new Error("Connector capability is required");

  const result = await db(
    `SELECT c.*,d.id AS metadata_connector_definition_id,d.status AS metadata_connector_status
       FROM integration_connections c
       LEFT JOIN platform_connector_definitions d ON d.id=c.connector_definition_id
      WHERE c.id=$1 AND c.company_id=$2
      LIMIT 1`,
    [connectorInstanceId, companyId]
  );
  const instance = result.rows[0];
  if (!instance) throw Object.assign(new Error("Connector instance not found"), { code: "CONNECTOR_NOT_FOUND", status: 404 });

  const declaredCapabilities = new Set(
    jsonValue(instance.connector_capabilities, [])
      .map((item) => typeof item === "string" ? item : item?.key)
      .filter(Boolean)
  );
  if (!declaredCapabilities.has(capabilityKey)) {
    throw Object.assign(new Error("Connector capability is not declared for this instance"), { code: "CAPABILITY_NOT_DECLARED", status: 409 });
  }
  if (requireEnabled && instance.enabled !== true) {
    throw Object.assign(new Error("Connector instance is disabled"), { code: "CONNECTOR_DISABLED", status: 409 });
  }
  if (!instance.connector_definition_id || instance.metadata_connector_status !== "ACTIVE") {
    throw Object.assign(new Error("Connector instance has no active metadata definition"), { code: "CONNECTOR_DEFINITION_UNAVAILABLE", status: 409 });
  }
  const lastTest = jsonValue(instance.last_test_result, {});
  if (requireHealthy && (lastTest?.success !== true || String(instance.connection_status || "").toUpperCase() !== "CONNECTED")) {
    throw Object.assign(new Error("Connector instance is not healthy"), { code: "CONNECTOR_NOT_HEALTHY", status: 409 });
  }

  const execute = createConnectorActionExecutor({ db });
  const execution = await execute({
    companyId,
    connectionId: connectorInstanceId,
    operation: capabilityKey,
    input: payload,
  });
  return { instance, result: execution.data, execution };
}
