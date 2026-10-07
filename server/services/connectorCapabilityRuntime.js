import { ConnectorService } from "./connectorRuntime.js";
import { decryptCredentials } from "./integrationCredentials.js";

function jsonValue(value, fallback = {}) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

export async function executeInstalledConnectorCapability({
  db,
  drivers,
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
    `SELECT c.*,p.manifest
       FROM integration_connections c
       JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
      WHERE c.id=$1 AND c.company_id=$2
      LIMIT 1`,
    [connectorInstanceId, companyId]
  );
  const instance = result.rows[0];
  if (!instance) {
    throw Object.assign(new Error("Connector instance not found"), { code: "CONNECTOR_NOT_FOUND", status: 404 });
  }

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
  const lastTest = jsonValue(instance.last_test_result, {});
  if (requireHealthy && (lastTest?.success !== true || String(instance.connection_status || "").toUpperCase() !== "CONNECTED")) {
    throw Object.assign(new Error("Connector instance is not healthy"), { code: "CONNECTOR_NOT_HEALTHY", status: 409 });
  }

  const driver = drivers?.get?.(instance.connector_package_key);
  if (!driver || !driver.capabilities?.has?.(capabilityKey)) {
    throw Object.assign(new Error("Connector capability has no installed runtime driver"), { code: "CAPABILITY_UNAVAILABLE", status: 409 });
  }

  const configuration = {
    ...jsonValue(instance.connector_configuration, {}),
    ...(() => {
      try { return decryptCredentials(instance.credentials_encrypted) || {}; }
      catch { return {}; }
    })(),
  };
  const service = new ConnectorService({
    connectorKey: instance.connector_package_key,
    capabilities: [capabilityKey],
    adapter: driver.createAdapter({
      instanceId: instance.id,
      configuration,
      companyId: instance.company_id,
      storeId: instance.store_id,
      tillId: instance.till_id,
    }),
  });

  const connection = await service.connect();
  if (requireHealthy && !connection.healthy) {
    throw Object.assign(new Error(connection.lastError || "Connector is not healthy"), { code: "CONNECTOR_NOT_HEALTHY", status: 409 });
  }

  return {
    instance,
    result: await service.execute(capabilityKey, payload),
  };
}
