import { decryptCredentials } from "./integrationCredentials.js";
import { internalAppCatalog } from "./internalAppCatalog.js";

export const CONNECTOR_STATUSES = Object.freeze([
  "CONNECTED",
  "DISCONNECTED",
  "CONNECTING",
  "ERROR",
  "DISABLED",
]);

export const PAYMENT_OUTCOMES = Object.freeze([
  "PENDING",
  "APPROVED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "TIMEOUT",
  "OFFLINE",
  "ERROR",
]);
const TECHNICAL_FALLBACK_CODES = new Set(["OFFLINE", "TIMEOUT", "BRIDGE_UNAVAILABLE", "DEVICE_OFFLINE"]);

const PAYMENT_METADATA_KEYS = new Set([
  "providerTransactionId",
  "terminalId",
  "approvalCode",
  "referenceCode",
  "paymentMethod",
  "timestamp",
]);
const PAYMENT_SENSITIVE_KEY = /^(pan|card(number|details)?|cvv|cvc|track(data)?|magneticstripe)$/i;

export function createLocalHardwareAdapter(bridge) {
  if (!bridge || typeof bridge.invoke !== "function") {
    throw new TypeError("A local hardware bridge with invoke() is required");
  }
  return {
    connect: (configuration) => bridge.invoke("connect", configuration),
    disconnect: () => bridge.invoke("disconnect"),
    healthCheck: () => bridge.invoke("health"),
    test: (configuration) => bridge.invoke("test", configuration),
    execute: (actionKey, payload) => bridge.invoke("execute", { actionKey, payload }),
  };
}

function validateCapability(capability) {
  if (typeof capability === "string") return { key: capability };
  if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
    throw new TypeError("Connector capabilities must be keys or descriptors");
  }
  const key = String(capability.key || capability.capabilityKey || "");
  if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(key)) {
    throw new TypeError("Connector capability key is invalid");
  }
  return {
    ...capability,
    key,
    requiredPermissions: Array.isArray(capability.requiredPermissions)
      ? [...capability.requiredPermissions]
      : [],
  };
}

function containsPaymentData(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPaymentData);
  return Object.entries(value).some(([key, child]) =>
    PAYMENT_SENSITIVE_KEY.test(key) || containsPaymentData(child)
  );
}

export function normalizePaymentResponse(response = {}) {
  const outcome = String(response.status || response.outcome || "ERROR").toUpperCase();
  if (!PAYMENT_OUTCOMES.includes(outcome)) {
    throw new TypeError("Payment connector returned an unsupported outcome");
  }
  const metadata = {};
  for (const key of PAYMENT_METADATA_KEYS) {
    const value = response[key];
    if (["string", "number"].includes(typeof value) && String(value).length <= 255) {
      metadata[key] = String(value);
    }
  }
  return { status: outcome, ...metadata };
}

export class ConnectorRuntimeError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message || code);
    this.name = "ConnectorRuntimeError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class ConnectorDriverRegistry {
  constructor() {
    this.drivers = new Map();
  }

  register({ packageKey, capabilities, createAdapter }) {
    if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(String(packageKey || "")) || typeof createAdapter !== "function") {
      throw new TypeError("A valid packageKey and createAdapter function are required");
    }
    this.drivers.set(packageKey, { packageKey, capabilities: new Set(capabilities || []), createAdapter });
    return () => this.drivers.delete(packageKey);
  }

  get(packageKey) {
    return this.drivers.get(packageKey) || null;
  }
}

export class ConnectorService {
  constructor({ connectorKey, capabilities = [], adapter, enabled = true }) {
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(String(connectorKey || ""))) {
      throw new TypeError("connectorKey is required");
    }
    if (!adapter || typeof adapter !== "object") {
      throw new TypeError("Connector adapter is required");
    }
    this.connectorKey = connectorKey;
    this.capabilities = new Map(capabilities.map((item) => {
      const capability = validateCapability(item);
      return [capability.key, capability];
    }));
    this.adapter = adapter;
    this.enabled = enabled !== false;
    this.connectionState = this.enabled ? "DISCONNECTED" : "DISABLED";
    this.lastError = null;
    this.lastErrorCode = null;
    this.lastSeen = null;
  }

  hasCapability(capabilityKey) {
    return this.capabilities.has(capabilityKey);
  }

  async connect() {
    if (!this.enabled) return this.status();
    this.connectionState = "CONNECTING";
    this.lastError = null;
    this.lastErrorCode = null;
    try {
      await this.adapter.connect?.();
      const healthy = await this.adapter.healthCheck?.();
      if (healthy === false || healthy?.healthy === false) {
        throw new ConnectorRuntimeError(healthy?.code || "DEVICE_OFFLINE", healthy?.message || "Connector health check failed", { retryable: true });
      }
      this.connectionState = "CONNECTED";
      this.lastSeen = new Date().toISOString();
    } catch (error) {
      this.connectionState = "ERROR";
      this.lastError = String(error?.message || "Connector connection failed").slice(0, 300);
      this.lastErrorCode = error?.code || "ERROR";
    }
    return this.status();
  }

  async disconnect() {
    try {
      await this.adapter.disconnect?.();
      this.connectionState = this.enabled ? "DISCONNECTED" : "DISABLED";
      this.lastError = null;
      this.lastErrorCode = null;
    } catch (error) {
      this.connectionState = "ERROR";
      this.lastError = String(error?.message || "Connector disconnect failed").slice(0, 300);
      this.lastErrorCode = error?.code || "ERROR";
    }
    return this.status();
  }

  async test() {
    if (!this.enabled) return { success: false, status: "DISABLED" };
    try {
      const result = await this.adapter.test?.();
      const success = result?.success === true;
      if (!success) this.lastError = String(result?.message || "Connector test failed").slice(0, 300);
      if (!success) this.lastErrorCode = result?.code || "ERROR";
      return { success, status: this.connectionState, message: result?.message || null };
    } catch (error) {
      this.lastError = String(error?.message || "Connector test failed").slice(0, 300);
      this.lastErrorCode = error?.code || "ERROR";
      return { success: false, status: this.connectionState, message: this.lastError };
    }
  }

  async healthCheck() {
    if (!this.enabled) return this.status();
    try {
      const result = await this.adapter.healthCheck?.();
      const healthy = result !== false && result?.healthy !== false;
      this.connectionState = healthy ? "CONNECTED" : "DISCONNECTED";
      if (healthy) this.lastSeen = new Date().toISOString();
      else {
        this.lastError = result?.message || "Connector is unhealthy";
        this.lastErrorCode = result?.code || "DEVICE_OFFLINE";
      }
    } catch (error) {
      this.connectionState = "ERROR";
      this.lastError = String(error?.message || "Connector health check failed").slice(0, 300);
      this.lastErrorCode = error?.code || "ERROR";
    }
    return this.status();
  }

  async reconnect() {
    await this.disconnect();
    return this.connect();
  }

  async execute(actionKey, payload = {}) {
    const capability = this.capabilities.get(actionKey);
    if (!capability) throw new Error("Connector action is not registered");
    if (this.connectionState !== "CONNECTED") throw new Error("Connector is not healthy");
    if (containsPaymentData(payload)) throw new Error("Raw payment card data is not accepted");
    if (typeof this.adapter.execute !== "function") throw new Error("Connector action is unavailable");
    const result = await this.adapter.execute(capability.actionKey || actionKey, payload);
    return actionKey.startsWith("payment.") ? normalizePaymentResponse(result) : result;
  }

  status() {
    return {
      connectorKey: this.connectorKey,
      state: this.connectionState,
      healthy: this.connectionState === "CONNECTED",
      lastSeen: this.lastSeen,
      lastError: this.lastError,
      errorCode: this.lastErrorCode,
    };
  }
}

export class ConnectorCapabilityRegistry {
  constructor() {
    this.installations = new Map();
  }

  register({ installationId, companyId, storeId = null, divisionId = null, deviceSessionId = null, active = true, priority = 0, service }) {
    if (!installationId || !companyId || !(service instanceof ConnectorService)) {
      throw new TypeError("installationId, companyId, and ConnectorService are required");
    }
    this.installations.set(String(installationId), {
      installationId: String(installationId),
      companyId: String(companyId),
      storeId: storeId == null ? null : String(storeId),
      divisionId: divisionId == null ? null : String(divisionId),
      deviceSessionId: deviceSessionId == null ? null : String(deviceSessionId),
      active: active === true,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      service,
    });
    return () => this.installations.delete(String(installationId));
  }

  hasCapability(capabilityKey, context = {}) {
    return Boolean(this.getConnectorForCapability(capabilityKey, context));
  }

  getConnectorForCapability(capabilityKey, context = {}) {
    if (!context.companyId) return null;
    const permissions = new Set(context.permissions || []);
    return [...this.installations.values()]
      .filter((installation) => {
        if (!installation.active || installation.companyId !== String(context.companyId)) return false;
        if (installation.storeId && installation.storeId !== String(context.storeId || "")) return false;
        if (installation.divisionId && installation.divisionId !== String(context.divisionId || "")) return false;
        if (installation.deviceSessionId && installation.deviceSessionId !== String(context.deviceSessionId || "")) return false;
        const capability = installation.service.capabilities.get(capabilityKey);
        if (!capability || installation.service.status().healthy !== true) return false;
        if (context.selfCheckout === true && capability.selfCheckoutSupported !== true) return false;
        if (context.isAdmin !== true && capability.requiredPermissions.some((permission) => !permissions.has(permission))) return false;
        return true;
      })
      .sort((a, b) => b.priority - a.priority || a.installationId.localeCompare(b.installationId))[0]?.service || null;
  }

  async executeCapability(capabilityKey, payload, context = {}) {
    const service = this.getConnectorForCapability(capabilityKey, context);
    if (!service) throw new Error(`No healthy connector provides ${capabilityKey} in this context`);
    return service.execute(capabilityKey, payload);
  }
}

function jsonValue(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function effectiveManifest(packageKey, storedManifest = {}) {
  const stored = jsonValue(storedManifest, {});
  if (stored?.connectorApp) return stored;
  const catalogEntry = internalAppCatalog.find((entry) =>
    String(entry.packageKey || entry.key || "") === String(packageKey || "")
  );
  if (!catalogEntry?.connectorApp) return stored;
  return {
    ...stored,
    packageKey: stored.packageKey || catalogEntry.packageKey || catalogEntry.key,
    name: stored.name || catalogEntry.name,
    category: stored.category || catalogEntry.category,
    connectorApp: catalogEntry.connectorApp,
  };
}

function capabilityDefinition(manifest, capabilityKey) {
  return (manifest?.connectorApp?.capabilities || []).find((definition) =>
    (typeof definition === "string" ? definition : definition?.key) === capabilityKey
  ) || null;
}

async function loadPersistedCandidates({ db, companyId, storeId, deviceSessionId }) {
  if (!companyId || !storeId || !deviceSessionId) return [];
  const result = await db(
    `SELECT c.id, c.company_id, c.store_id, c.device_session_id, c.connector_package_key,
            c.connector_configuration, c.connector_capabilities, c.enabled,
            c.connection_status, c.fallback_order, c.created_at, c.credentials_encrypted, p.manifest
       FROM integration_connections c
       JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
       JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=c.company_id
        AND i.status='active' AND i.suspended_by_entitlement=FALSE
       JOIN terminals t ON t.id=c.device_session_id AND t.store_id=$2
       JOIN stores s ON s.id=t.store_id AND s.company_id=c.company_id
      WHERE c.company_id=$1 AND c.enabled=TRUE AND c.device_session_id=$3
        AND (c.store_id IS NULL OR c.store_id=$2)
        AND p.package_type='APPLICATION'
      ORDER BY c.fallback_order ASC, c.created_at ASC, c.id ASC`,
    [companyId, storeId, deviceSessionId]
  );
  return result.rows || [];
}

async function persistConnectorHealth(db, instance, state) {
  await db(
    `UPDATE integration_connections
        SET connection_status=$1::varchar,last_error=$2,
            last_connected_at=CASE WHEN $1::varchar='CONNECTED' THEN NOW() ELSE last_connected_at END,
            updated_at=NOW()
      WHERE id=$3 AND company_id=$4`,
    [state.state, state.lastError || null, instance.id, instance.company_id]
  );
}

/** Resolve an installed, licensed and till-assigned connector from persisted package instances. */
export async function resolvePersistedConnectorCapability({
  db,
  drivers,
  companyId,
  storeId,
  deviceSessionId,
  capabilityKey,
  packageKey = null,
  selfCheckout = false,
  payload = null,
  writeAudit = null,
  actorUserId = null,
}) {
  const instances = await loadPersistedCandidates({ db, companyId, storeId, deviceSessionId });
  const eligible = instances.filter((instance) => {
    if (packageKey && String(instance.connector_package_key) !== String(packageKey)) return false;
    const manifest = effectiveManifest(instance.connector_package_key, instance.manifest);
    const capability = capabilityDefinition(manifest, capabilityKey);
    if (!capability) return false;
    if (selfCheckout && (typeof capability === "string" || capability.selfCheckoutSupported !== true)) return false;
    const declared = jsonValue(instance.connector_capabilities, []);
    return !Array.isArray(declared) || declared.length === 0 || declared.includes(capabilityKey);
  });
  if (!eligible.length) {
    return { available: false, code: "CONNECTOR_UNAVAILABLE", message: "No eligible connector is assigned to this till" };
  }

  let lastTechnicalFailure = null;
  for (let index = 0; index < eligible.length; index += 1) {
    const instance = eligible[index];
    const driver = drivers?.get(instance.connector_package_key);
    if (!driver) {
      return { available: false, code: "PROVIDER_NOT_SUPPORTED", message: "Connector app has no runtime driver", connectorInstanceId: instance.id };
    }
    const manifest = effectiveManifest(instance.connector_package_key, instance.manifest);
    const capabilities = (manifest?.connectorApp?.capabilities || [])
      .map((item) => typeof item === "string" ? item : item?.key)
      .filter((key) => key && driver.capabilities.has(key));
    let service;
    try {
      service = new ConnectorService({
        connectorKey: instance.connector_package_key,
        capabilities,
        adapter: driver.createAdapter({
          instanceId: instance.id,
          configuration: {
            ...jsonValue(instance.connector_configuration, {}),
            ...(() => { try { return decryptCredentials(instance.credentials_encrypted) || {}; } catch { return {}; } })(),
          },
          companyId,
          storeId,
          deviceSessionId,
        }),
      });
    } catch (error) {
      return { available: false, code: error?.code || "PROVIDER_NOT_CONFIGURED", message: error.message, connectorInstanceId: instance.id };
    }
    const connection = await service.connect();
    await persistConnectorHealth(db, instance, connection);
    if (!connection.healthy) {
      lastTechnicalFailure = {
        code: connection.errorCode || "ERROR",
        message: connection.lastError || "Connector is unavailable",
      };
      if (index < eligible.length - 1 && TECHNICAL_FALLBACK_CODES.has(lastTechnicalFailure.code)) {
        await writeAudit?.(companyId, actorUserId, "connector.fallback", "integration_connection", instance.id, {
          capabilityKey,
          fallbackReason: lastTechnicalFailure.code,
          nextInstanceId: eligible[index + 1].id,
        });
        continue;
      }
      return { available: false, ...lastTechnicalFailure, connectorInstanceId: instance.id };
    }
    if (payload === null) {
      return { available: true, connectorInstanceId: instance.id, connectorPackageKey: instance.connector_package_key, state: connection.state };
    }

    try {
      const result = await service.execute(capabilityKey, payload);
      if (["OFFLINE", "TIMEOUT"].includes(result.status) && index < eligible.length - 1) {
        await writeAudit?.(companyId, actorUserId, "connector.fallback", "integration_connection", instance.id, {
          capabilityKey,
          fallbackReason: result.status,
          nextInstanceId: eligible[index + 1].id,
          idempotencyReference: payload.idempotencyKey || payload.reference || null,
        });
        lastTechnicalFailure = { code: result.status, message: `Primary connector returned ${result.status}` };
        continue;
      }
      return {
        available: true,
        connectorInstanceId: instance.id,
        connectorPackageKey: instance.connector_package_key,
        state: connection.state,
        result,
      };
    } catch (error) {
      const code = error?.code || "ERROR";
      lastTechnicalFailure = { code, message: String(error?.message || "Connector action failed") };
      if (index < eligible.length - 1 && TECHNICAL_FALLBACK_CODES.has(code)) {
        await writeAudit?.(companyId, actorUserId, "connector.fallback", "integration_connection", instance.id, {
          capabilityKey,
          fallbackReason: code,
          nextInstanceId: eligible[index + 1].id,
          idempotencyReference: payload.idempotencyKey || payload.reference || null,
        });
        continue;
      }
      return { available: false, connectorInstanceId: instance.id, ...lastTechnicalFailure };
    }
  }
  return { available: false, ...(lastTechnicalFailure || { code: "CONNECTOR_UNAVAILABLE", message: "No connector could execute this capability" }) };
}