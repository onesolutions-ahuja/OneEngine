import express from "express";
import { decryptCredentials, encryptCredentials } from "../services/integrationCredentials.js";
import {
  isAllowedConnectorTarget,
  toPublicCredential,
} from "../services/connectorFramework.js";
import { ConnectorService, resolvePersistedConnectorCapability } from "../services/connectorRuntime.js";
import { internalAppCatalog } from "../services/internalAppCatalog.js";\nimport { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

function jsonValue(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function effectiveConnectorManifest(packageKey, storedManifest = {}) {
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

function publicDefinition(row) {
  const schema = jsonValue(row.credentials_schema, []);
  const schemaFields = Array.isArray(schema)
    ? schema
    : Object.entries(schema || {}).map(([key, value]) => ({ key, ...(value || {}) }));
  const publicSchema = schemaFields.map((field) => ({
    key: field.key || field.name,
    name: field.name,
    type: field.type,
    required: Boolean(field.required),
    label: field.label,
    description: field.description,
  }));
  const operations = jsonValue(row.operations, []);
  return {
    id: row.id,
    connectorKey: row.connector_key,
    name: row.name,
    description: row.description,
    publisher: row.publisher,
    authType: row.auth_type,
    baseUrl: row.base_url,
    credentialsSchema: publicSchema,
    operations: (Array.isArray(operations)
      ? operations
      : Object.entries(operations || {}).map(([key, value]) => ({
          key,
          ...value,
        }))
    ).map((operation) => ({
      key: operation.key || operation.name,
      name: operation.name,
      description: operation.description,
      method: operation.method || "GET",
      path: String(operation.path || "").split("?")[0],
    })),
    timeoutMs: row.timeout_ms,
    retryPolicy: jsonValue(row.retry_policy, {}),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadConnector(db, connectorId) {
  const result = await db(
    `SELECT id, connector_key, name, auth_type, credentials_schema, status
     FROM platform_connector_definitions WHERE id = $1`,
    [connectorId]
  );
  return result.rows[0] || null;
}

function validateSecrets(schema, secrets) {
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets)) {
    return "secrets must be an object";
  }
  const fields = Array.isArray(schema) ? schema : Object.values(schema || {});
  const allowed = new Set(fields.map((field) => field?.key || field?.name).filter(Boolean));
  if (allowed.size && Object.keys(secrets).some((key) => !allowed.has(key))) {
    return "secrets contains fields not declared by this connector";
  }
  for (const field of fields) {
    const key = field?.key || field?.name;
    if (!key) continue;
    const value = secrets[key];
    if (field.required && (value === undefined || value === null || value === "")) {
      return `${key} is required`;
    }
    if (value !== undefined && field.type === "number" && !Number.isFinite(Number(value))) {
      return `${key} must be a number`;
    }
    if (value !== undefined && field.type === "boolean" && typeof value !== "boolean") {
      return `${key} must be a boolean`;
    }
    if (value !== undefined && field.type === "string" && typeof value !== "string") {
      return `${key} must be a string`;
    }
  }
  return null;
}

function publicPlatformCredential(row) {
  const result = toPublicCredential(row);
  return result
    ? { ...result, companyId: null, platformLevel: true }
    : null;
}

function validateAppConfiguration(manifest, supplied, { existingSecrets = {} } = {}) {
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) {
    return { error: "configuration must be an object" };
  }
  const schema = manifest?.connectorApp?.configurationSchema || [];
  const values = Object.fromEntries(schema
    .filter((field) => field.type !== "secret" && Object.hasOwn(field, "default"))
    .map((field) => [field.key, field.default]));
  const secrets = {};
  for (const [key, value] of Object.entries(supplied)) {
    const field = schema.find((item) => item.key === key);
    if (!field) return { error: `Configuration field ${key} is not declared by this connector app` };
    if (field.type === "secret") {
      if (value !== undefined && value !== null && value !== "") {
        if (typeof value !== "string") return { error: `${key} must be a string` };
        secrets[key] = value;
      }
      continue;
    }
    if (/(password|token|credential|api[_-]?key|card|pan)/i.test(key)) {
      return { error: "Secrets and card data must not be stored in connector configuration" };
    }
    if (field.type === "string" && typeof value !== "string") return { error: `${key} must be a string` };
    if (field.type === "number" && !Number.isFinite(Number(value))) return { error: `${key} must be a number` };
    if (field.type === "boolean" && typeof value !== "boolean") return { error: `${key} must be a boolean` };
    if (Array.isArray(field.enum) && !field.enum.includes(value)) return { error: `${key} has an unsupported value` };
    values[key] = value;
  }
  for (const field of schema) {
    const effective = field.type === "secret"
      ? (Object.hasOwn(secrets, field.key) ? secrets[field.key] : existingSecrets?.[field.key])
      : values[field.key];
    if (field.required && (effective === undefined || effective === null || effective === "")) {
      return { error: `${field.key} is required` };
    }
  }
  return { value: values, secrets };
}

function publicConnectorInstance(row) {
  const rawConfiguration = jsonValue(row.connector_configuration, {});
  const configuration = Object.fromEntries(Object.entries(rawConfiguration).filter(([key]) => !/(secret|password|token|credential|api[_-]?key|card|pan)/i.test(key)));
  return {
    id: row.id,
    packageKey: row.connector_package_key,
    name: row.name,
    companyId: row.company_id,
    storeId: row.store_id,
    storeName: row.store_name || null,
    tillId: row.till_id,
    tillName: row.till_name || null,
    enabled: row.enabled === true,
    status: row.connection_status,
    health: jsonValue(row.last_test_result, {}),
    configuration,
    hasCredentials: Boolean(row.credentials_encrypted),
    capabilities: jsonValue(row.connector_capabilities, []),
    fallbackOrder: Number(row.fallback_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function validateDefinition(body = {}) {
  const authType = String(body.authType || body.auth_type || "none").toLowerCase();
  const baseUrl = body.baseUrl || body.base_url;
  const operations = body.operations;
  const timeoutMs = Number(body.timeoutMs ?? body.timeout_ms ?? 15000);
  const retryPolicy = body.retryPolicy ?? body.retry_policy ?? {
    maxAttempts: 3,
    backoffMs: 1000,
  };
  if (!["none", "api_key", "bearer", "basic"].includes(authType)) {
    return { error: "Unsupported authType" };
  }
  if (!(await isAllowedConnectorTarget(baseUrl))) {
    return { error: "baseUrl must be a safe HTTP(S) target" };
  }
  const parsedBase = new URL(baseUrl);
  if (parsedBase.search || parsedBase.hash) {
    return { error: "baseUrl cannot include a query string or fragment" };
  }
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 120000
  ) {
    return { error: "timeoutMs must be between 100 and 120000" };
  }
  if (!Array.isArray(operations) || operations.length > 100) {
    return { error: "operations must be an array of at most 100 operations" };
  }
  const credentialsSchema = body.credentialsSchema ?? body.credentials_schema ?? [];
  if (
    !Array.isArray(credentialsSchema) &&
    (!credentialsSchema || typeof credentialsSchema !== "object")
  ) {
    return { error: "credentialsSchema must be an array or object" };
  }
  if (Object.keys(credentialsSchema).length > 100) {
    return { error: "credentialsSchema may contain at most 100 fields" };
  }
  const keys = new Set();
  for (const operation of operations) {
    const key = String(operation?.key || operation?.name || "");
    const method = String(operation?.method || "GET").toUpperCase();
    const path = String(operation?.path || "");
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(key) || keys.has(key)) {
      return { error: "Each operation needs a unique key or name" };
    }
    keys.add(key);
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      return { error: `Unsupported HTTP method for operation ${key}` };
    }
    if (!path || /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
      return { error: `Operation ${key} path must be a relative path` };
    }
    for (const field of ["headers", "params", "request", "requestMapping", "response", "responseMapping"]) {
      if (
        operation[field] !== undefined &&
        (!operation[field] || typeof operation[field] !== "object" || Array.isArray(operation[field]))
      ) {
        return { error: `Operation ${key} ${field} must be an object` };
      }
    }
    const operationTimeout = Number(operation.timeoutMs ?? operation.timeout ?? timeoutMs);
    if (!Number.isInteger(operationTimeout) || operationTimeout < 100 || operationTimeout > 120000) {
      return { error: `Operation ${key} timeout must be between 100 and 120000` };
    }
  }
  const retries =
    typeof retryPolicy === "number"
      ? { maxAttempts: retryPolicy }
      : retryPolicy;
  if (
    !retries ||
    !Number.isInteger(Number(retries.maxAttempts ?? 3)) ||
    Number(retries.maxAttempts ?? 3) < 1 ||
    Number(retries.maxAttempts ?? 3) > 5 ||
    !Number.isInteger(Number(retries.backoffMs ?? 1000)) ||
    Number(retries.backoffMs ?? 1000) < 0 ||
    Number(retries.backoffMs ?? 1000) > 30000
  ) {
    return { error: "retryPolicy maxAttempts/backoffMs is out of range" };
  }
  return {
    value: {
      authType,
      baseUrl,
      operations,
      timeoutMs,
      retryPolicy: retries,
      credentialsSchema,
    },
  };
}

/**
 * Router constructor for generic connector definitions and encrypted
 * credentials. Mount under the API prefix chosen by the parent server.
 */
export default function createConnectorsRouter({
  authenticate,
  authorize,
  db,
  writeAudit,
  drivers,
}) {
  if (typeof db !== "function") throw new Error("db query function is required");
  const router = express.Router();

  async function requireSuperadmin(req, res) {
    const userId = req.user?.id;
    if (!userId) {
      res.status(403).json({ success: false, message: "Platform permission required" });
      return false;
    }
    const result = await db(
      `SELECT 1
         FROM users u
         JOIN role_permissions rp ON rp.role_id=u.role_id
         JOIN permissions p ON p.id=rp.permission_id
        WHERE u.id=$1 AND u.active=true AND p.code='platform.manage'
        LIMIT 1`,
      [userId]
    );
    if (!result.rows.length) {
      res.status(403).json({ success: false, message: "Platform permission required" });
      return false;
    }
    return true;
  }

  async function loadTenantCredential(id, companyId) {
    const result = await db(
      `SELECT id, company_id, connector_id, credential_key, name, metadata,
              active, rotated_at, created_at, updated_at
       FROM platform_credentials WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    return result.rows[0] || null;
  }

  async function validateConnectionBinding({
    req,
    res,
    connectorId,
    credentialId,
    storeId,
  }) {
    const connector = await loadConnector(db, connectorId);
    if (!connector || connector.status !== "ACTIVE") {
      res.status(404).json({ success: false, message: "Connector not found" });
      return false;
    }
    if (credentialId) {
      const tenantCredential = await db(
        `SELECT id FROM platform_credentials
         WHERE id = $1 AND company_id = $2 AND connector_id = $3 AND active = TRUE`,
        [credentialId, req.user.companyId, connectorId]
      );
      if (!tenantCredential.rows[0]) {
        if (!(await requireSuperadmin(req, res))) return false;
        const platformCredential = await db(
          `SELECT id FROM platform_credentials
           WHERE id = $1 AND company_id IS NULL AND connector_id = $2 AND active = TRUE`,
          [credentialId, connectorId]
        );
        if (!platformCredential.rows[0]) {
          res.status(400).json({
            success: false,
            message: "Credential is unavailable for this connector",
          });
          return false;
        }
      }
    }
    if (storeId) {
      const store = await db(
        "SELECT id FROM stores WHERE id = $1 AND company_id = $2",
        [storeId, req.user.companyId]
      );
      if (!store.rows[0]) {
        res.status(400).json({ success: false, message: "Store is not available" });
        return false;
      }
    }
    return true;
  }

  function connectionPolicy(body, existing = {}) {
    const timeoutMs = Number(body.timeoutMs ?? existing.timeout_ms ?? 15000);
    const retryPolicy = body.retryPolicy ?? existing.retry_policy ?? {
      maxAttempts: 3,
      backoffMs: 1000,
    };
    const policy =
      typeof retryPolicy === "number"
        ? { maxAttempts: retryPolicy }
        : retryPolicy;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
      return { error: "timeoutMs must be between 100 and 120000" };
    }
    if (
      !policy ||
      !Number.isInteger(Number(policy.maxAttempts ?? 3)) ||
      Number(policy.maxAttempts ?? 3) < 1 ||
      Number(policy.maxAttempts ?? 3) > 5 ||
      !Number.isInteger(Number(policy.backoffMs ?? 1000)) ||
      Number(policy.backoffMs ?? 1000) < 0 ||
      Number(policy.backoffMs ?? 1000) > 30000
    ) {
      return { error: "retryPolicy maxAttempts/backoffMs is out of range" };
    }
    return { timeoutMs, retryPolicy: policy };
  }

  router.get(
    "/connections",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const result = await db(
          `SELECT c.id, c.company_id, c.store_id, c.name, c.enabled,
                  c.connector_definition_id, c.credential_id, c.timeout_ms,
                  c.retry_policy, c.created_at, c.updated_at,
                  d.connector_key, d.name AS connector_name,
                  p.name AS credential_name, p.credential_key,
                  p.active AS credential_active,
                  (p.id IS NOT NULL) AS has_credential
           FROM integration_connections c
           LEFT JOIN platform_connector_definitions d
             ON d.id = c.connector_definition_id
           LEFT JOIN platform_credentials p ON p.id = c.credential_id
           WHERE c.company_id = $1 AND c.connector_definition_id IS NOT NULL
           ORDER BY c.created_at DESC`,
          [req.user.companyId]
        );
        res.json({
          success: true,
          data: result.rows.map((row) => ({
            id: row.id,
            companyId: row.company_id,
            storeId: row.store_id,
            name: row.name,
            enabled: row.enabled,
            connectorId: row.connector_definition_id,
            connectorKey: row.connector_key,
            connectorName: row.connector_name,
            credentialId: row.credential_id,
            credentialName: row.credential_name || null,
            credentialKey: row.credential_key || null,
            hasCredential: row.has_credential && row.credential_active,
            timeoutMs: row.timeout_ms,
            retryPolicy: jsonValue(row.retry_policy, {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        });
      } catch (error) {
        console.error("List connector connections error:", error);
        res.status(500).json({ success: false, message: "Unable to list connections" });
      }
    }
  );

  router.post(
    "/connections",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const body = req.body || {};
        const connectorId = body.connectorId;
        const credentialId = body.credentialId || null;
        const storeId = body.storeId || null;
        const name = String(body.name || "").trim();
        if (!connectorId || !name || name.length > 200) {
          return res.status(400).json({
            success: false,
            message: "connectorId and name are required",
          });
        }
        if (!(await validateConnectionBinding({
          req,
          res,
          connectorId,
          credentialId,
          storeId,
        }))) return;
        const policy = connectionPolicy(body);
        if (policy.error) {
          return res.status(400).json({ success: false, message: policy.error });
        }
        const connector = await loadConnector(db, connectorId);
        const result = await db(
          `INSERT INTO integration_connections
             (company_id, store_id, name, provider_name, integration_type, auth_type,
              enabled, created_by, connector_definition_id, credential_id,
              retry_policy, timeout_ms)
           VALUES ($1,$2,$3,$4,'generic',$5,TRUE,$6,$7,$8,$9::jsonb,$10)
           RETURNING id, company_id, store_id, name, enabled,
                     connector_definition_id, credential_id, retry_policy,
                     timeout_ms, created_at, updated_at`,
          [
            req.user.companyId,
            storeId,
            name,
            connector.connector_key,
            connector.auth_type,
            req.user.id || null,
            connectorId,
            credentialId,
            JSON.stringify(policy.retryPolicy),
            policy.timeoutMs,
          ]
        );
        const row = result.rows[0];
        res.status(201).json({
          success: true,
          data: {
            id: row.id,
            companyId: row.company_id,
            storeId: row.store_id,
            name: row.name,
            enabled: row.enabled,
            connectorId: row.connector_definition_id,
            credentialId: row.credential_id,
            hasCredential: Boolean(row.credential_id),
            retryPolicy: jsonValue(row.retry_policy, {}),
            timeoutMs: row.timeout_ms,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        });
      } catch (error) {
        console.error("Create connector connection error:", error);
        res.status(500).json({ success: false, message: "Unable to create connection" });
      }
    }
  );

  router.patch(
    "/connections/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const loaded = await db(
          `SELECT id, company_id, store_id, name, connector_definition_id,
                  credential_id, retry_policy, timeout_ms
           FROM integration_connections
           WHERE id = $1 AND company_id = $2 AND connector_definition_id IS NOT NULL`,
          [req.params.id, req.user.companyId]
        );
        const current = loaded.rows[0];
        if (!current) {
          return res.status(404).json({ success: false, message: "Connection not found" });
        }
        const connectorId = req.body?.connectorId || current.connector_definition_id;
        const credentialId =
          req.body?.credentialId === undefined
            ? current.credential_id
            : req.body.credentialId || null;
        const storeId =
          req.body?.storeId === undefined
            ? current.store_id
            : req.body.storeId || null;
        if (!(await validateConnectionBinding({
          req,
          res,
          connectorId,
          credentialId,
          storeId,
        }))) return;
        const policy = connectionPolicy(req.body || {}, current);
        if (policy.error) {
          return res.status(400).json({ success: false, message: policy.error });
        }
        const name = String(req.body?.name ?? current.name).trim();
        if (!name) {
          return res.status(400).json({ success: false, message: "name cannot be empty" });
        }
        const connector = await loadConnector(db, connectorId);
        const result = await db(
          `UPDATE integration_connections
           SET name = $1, store_id = $2, provider_name = $3, auth_type = $4,
               connector_definition_id = $5, credential_id = $6,
               retry_policy = $7::jsonb, timeout_ms = $8,
               enabled = COALESCE($9, enabled), updated_at = NOW()
           WHERE id = $10 AND company_id = $11
           RETURNING id, company_id, store_id, name, enabled,
                     connector_definition_id, credential_id, retry_policy,
                     timeout_ms, created_at, updated_at`,
          [
            name,
            storeId,
            connector.connector_key,
            connector.auth_type,
            connectorId,
            credentialId,
            JSON.stringify(policy.retryPolicy),
            policy.timeoutMs,
            typeof req.body?.enabled === "boolean" ? req.body.enabled : null,
            req.params.id,
            req.user.companyId,
          ]
        );
        const row = result.rows[0];
        res.json({
          success: true,
          data: {
            id: row.id,
            companyId: row.company_id,
            storeId: row.store_id,
            name: row.name,
            enabled: row.enabled,
            connectorId: row.connector_definition_id,
            credentialId: row.credential_id,
            hasCredential: Boolean(row.credential_id),
            retryPolicy: jsonValue(row.retry_policy, {}),
            timeoutMs: row.timeout_ms,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        });
      } catch (error) {
        console.error("Update connector connection error:", error);
        res.status(500).json({ success: false, message: "Unable to update connection" });
      }
    }
  );

  router.post(
    "/platform/connectors",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const body = req.body || {};
        const connectorKey = String(body.connectorKey || body.connector_key || "");
        const name = String(body.name || "").trim();
        const status = body.status || "ACTIVE";
        if (
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(connectorKey) ||
          !name ||
          name.length > 200 ||
          !["ACTIVE", "INACTIVE", "DEPRECATED"].includes(status)
        ) {
          return res.status(400).json({
            success: false,
            message: "A valid connectorKey and name are required",
          });
        }
        const validation = await validateDefinition(body);
        if (validation.error) {
          return res.status(400).json({ success: false, message: validation.error });
        }
        const { value } = validation;
        const result = await db(
          `INSERT INTO platform_connector_definitions
             (connector_key, name, description, publisher, auth_type, base_url,
              credentials_schema, operations, timeout_ms, retry_policy, status,
              source_package_id, source_package_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$13)
           RETURNING id, connector_key, name, description, publisher, auth_type,
                     base_url, credentials_schema, operations, timeout_ms,
                     retry_policy, status, created_at, updated_at`,
          [
            connectorKey,
            name,
            body.description || null,
            body.publisher || null,
            value.authType,
            value.baseUrl,
            JSON.stringify(value.credentialsSchema),
            JSON.stringify(value.operations),
            value.timeoutMs,
            JSON.stringify(value.retryPolicy),
            status,
            body.sourcePackageId || null,
            body.sourcePackageVersion || null,
          ]
        );
        res.status(201).json({ success: true, data: publicDefinition(result.rows[0]) });
      } catch (error) {
        if (error?.code === "23505") {
          return res.status(409).json({
            success: false,
            message: "Connector key already exists",
          });
        }
        console.error("Create connector definition error:", error);
        res.status(500).json({ success: false, message: "Unable to save connector" });
      }
    }
  );

  router.put(
    "/platform/connectors/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const body = req.body || {};
        const connectorKey = String(body.connectorKey || body.connector_key || "");
        const name = String(body.name || "").trim();
        const status = body.status || "ACTIVE";
        if (
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(connectorKey) ||
          !name ||
          name.length > 200 ||
          !["ACTIVE", "INACTIVE", "DEPRECATED"].includes(status)
        ) {
          return res.status(400).json({
            success: false,
            message: "A valid connectorKey, name, and status are required",
          });
        }
        const validation = await validateDefinition(body);
        if (validation.error) {
          return res.status(400).json({ success: false, message: validation.error });
        }
        const { value } = validation;
        const result = await db(
          `UPDATE platform_connector_definitions
           SET connector_key = $1, name = $2, description = $3, publisher = $4,
               auth_type = $5, base_url = $6, credentials_schema = $7::jsonb,
               operations = $8::jsonb, timeout_ms = $9, retry_policy = $10::jsonb,
               status = $11, updated_at = NOW()
           WHERE id = $12
           RETURNING id, connector_key, name, description, publisher, auth_type,
                     base_url, credentials_schema, operations, timeout_ms,
                     retry_policy, status, created_at, updated_at`,
          [
            connectorKey,
            name,
            body.description || null,
            body.publisher || null,
            value.authType,
            value.baseUrl,
            JSON.stringify(value.credentialsSchema),
            JSON.stringify(value.operations),
            value.timeoutMs,
            JSON.stringify(value.retryPolicy),
            status,
            req.params.id,
          ]
        );
        if (!result.rows[0]) {
          return res.status(404).json({ success: false, message: "Connector not found" });
        }
        res.json({ success: true, data: publicDefinition(result.rows[0]) });
      } catch (error) {
        console.error("Update connector definition error:", error);
        res.status(500).json({ success: false, message: "Unable to update connector" });
      }
    }
  );

  router.get(
    "/connectors",
    authenticate,
    authorize("integration.manage"),
    async (_req, res) => {
      try {
        const result = await db(
          `SELECT id, connector_key, name, description, publisher, auth_type,
                  base_url, credentials_schema, operations, timeout_ms,
                  retry_policy, status, created_at, updated_at
           FROM platform_connector_definitions
           WHERE status = 'ACTIVE' ORDER BY name`
        );
        res.json({ success: true, data: result.rows.map(publicDefinition) });
      } catch (error) {
        console.error("List connector definitions error:", error);
        res.status(500).json({ success: false, message: "Unable to list connectors" });
      }
    }
  );

  router.get(
    "/credentials",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const params = [req.user.companyId];
        let query =
          `SELECT id, company_id, connector_id, credential_key, name, metadata,
                  active, rotated_at, created_at, updated_at
           FROM platform_credentials WHERE company_id = $1`;
        if (req.query.connectorId) {
          params.push(req.query.connectorId);
          query += ` AND connector_id = $2`;
        }
        query += " ORDER BY updated_at DESC";
        const result = await db(query, params);
        res.json({ success: true, data: result.rows.map(toPublicCredential) });
      } catch (error) {
        console.error("List connector credentials error:", error);
        res.status(500).json({ success: false, message: "Unable to list credentials" });
      }
    }
  );

  router.post(
    "/credentials",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const { connectorId, credentialKey, name, secrets } = req.body || {};
        if (
          !connectorId ||
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(String(credentialKey || "")) ||
          !String(name || "").trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "connectorId, credentialKey, and name are required",
          });
        }
        const connector = await loadConnector(db, connectorId);
        if (!connector || connector.status !== "ACTIVE") {
          return res.status(404).json({ success: false, message: "Connector not found" });
        }
        const validationError = validateSecrets(
          jsonValue(connector.credentials_schema, []),
          secrets
        );
        if (validationError) {
          return res.status(400).json({ success: false, message: validationError });
        }
        const result = await db(
          `INSERT INTO platform_credentials
             (company_id, connector_id, credential_key, name, ciphertext, metadata, created_by)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
           RETURNING id, company_id, connector_id, credential_key, name, metadata,
                     active, rotated_at, created_at, updated_at`,
          [
            req.user.companyId,
            connectorId,
            credentialKey,
            String(name).trim(),
            encryptCredentials(secrets),
            JSON.stringify({ fieldNames: Object.keys(secrets) }),
            req.user.id || null,
          ]
        );
        const credential = toPublicCredential(result.rows[0]);
        if (writeAudit) {
          await writeAudit(
            req.user.companyId,
            req.user.id,
            "connector_credential_created",
            "platform_credential",
            credential.id,
            { connectorId, credentialKey }
          );
        }
        res.status(201).json({ success: true, data: credential });
      } catch (error) {
        if (error?.code === "23505") {
          return res.status(409).json({
            success: false,
            message: "A credential with this key already exists",
          });
        }
        console.error("Create connector credential error:", error);
        res.status(500).json({ success: false, message: "Unable to save credential" });
      }
    }
  );

  router.put(
    "/credentials/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const existing = await loadTenantCredential(req.params.id, req.user.companyId);
        if (!existing) {
          return res.status(404).json({ success: false, message: "Credential not found" });
        }
        const connector = await loadConnector(db, existing.connector_id);
        const secrets = req.body?.secrets;
        const validationError = validateSecrets(
          jsonValue(connector?.credentials_schema, []),
          secrets
        );
        if (validationError) {
          return res.status(400).json({ success: false, message: validationError });
        }
        const name = String(req.body?.name || existing.name).trim();
        const result = await db(
          `UPDATE platform_credentials
           SET name = $1, ciphertext = $2, metadata = $3::jsonb, active = TRUE,
               rotated_at = NOW(), updated_at = NOW()
           WHERE id = $4 AND company_id = $5
           RETURNING id, company_id, connector_id, credential_key, name, metadata,
                     active, rotated_at, created_at, updated_at`,
          [
            name,
            encryptCredentials(secrets),
            JSON.stringify({ fieldNames: Object.keys(secrets) }),
            req.params.id,
            req.user.companyId,
          ]
        );
        res.json({ success: true, data: toPublicCredential(result.rows[0]) });
      } catch (error) {
        console.error("Rotate connector credential error:", error);
        res.status(500).json({ success: false, message: "Unable to update credential" });
      }
    }
  );

  router.delete(
    "/credentials/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const result = await db(
          `UPDATE platform_credentials SET active = FALSE, updated_at = NOW()
           WHERE id = $1 AND company_id = $2
           RETURNING id`,
          [req.params.id, req.user.companyId]
        );
        if (!result.rows[0]) {
          return res.status(404).json({ success: false, message: "Credential not found" });
        }
        res.json({ success: true, data: { id: result.rows[0].id, active: false } });
      } catch (error) {
        console.error("Delete connector credential error:", error);
        res.status(500).json({ success: false, message: "Unable to delete credential" });
      }
    }
  );

  router.get(
    "/platform/credentials",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const result = await db(
          `SELECT id, company_id, connector_id, credential_key, name, metadata,
                  active, rotated_at, created_at, updated_at
           FROM platform_credentials WHERE company_id IS NULL
           ORDER BY updated_at DESC`
        );
        res.json({
          success: true,
          data: result.rows.map(publicPlatformCredential),
        });
      } catch (error) {
        console.error("List platform credentials error:", error);
        res.status(500).json({
          success: false,
          message: "Unable to list platform credentials",
        });
      }
    }
  );

  router.post(
    "/platform/credentials",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const { connectorId, credentialKey, name, secrets } = req.body || {};
        if (
          !connectorId ||
          !/^[a-zA-Z0-9_.-]{1,100}$/.test(String(credentialKey || "")) ||
          !String(name || "").trim()
        ) {
          return res.status(400).json({
            success: false,
            message: "connectorId, credentialKey, and name are required",
          });
        }
        const connector = await loadConnector(db, connectorId);
        if (!connector || connector.status !== "ACTIVE") {
          return res.status(404).json({ success: false, message: "Connector not found" });
        }
        const validationError = validateSecrets(
          jsonValue(connector.credentials_schema, []),
          secrets
        );
        if (validationError) {
          return res.status(400).json({ success: false, message: validationError });
        }
        const result = await db(
          `INSERT INTO platform_credentials
             (company_id, connector_id, credential_key, name, ciphertext, metadata, created_by)
           VALUES (NULL,$1,$2,$3,$4,$5::jsonb,$6)
           RETURNING id, company_id, connector_id, credential_key, name, metadata,
                     active, rotated_at, created_at, updated_at`,
          [
            connectorId,
            credentialKey,
            String(name).trim(),
            encryptCredentials(secrets),
            JSON.stringify({ fieldNames: Object.keys(secrets) }),
            req.user.id || null,
          ]
        );
        res.status(201).json({
          success: true,
          data: publicPlatformCredential(result.rows[0]),
        });
      } catch (error) {
        if (error?.code === "23505") {
          return res.status(409).json({
            success: false,
            message: "A platform credential with this key already exists",
          });
        }
        console.error("Create platform credential error:", error);
        res.status(500).json({
          success: false,
          message: "Unable to save platform credential",
        });
      }
    }
  );

  router.put(
    "/platform/credentials/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const existing = await db(
          `SELECT id, connector_id, name FROM platform_credentials
           WHERE id = $1 AND company_id IS NULL`,
          [req.params.id]
        );
        if (!existing.rows[0]) {
          return res.status(404).json({
            success: false,
            message: "Platform credential not found",
          });
        }
        const connector = await loadConnector(db, existing.rows[0].connector_id);
        const secrets = req.body?.secrets;
        const validationError = validateSecrets(
          jsonValue(connector?.credentials_schema, []),
          secrets
        );
        if (validationError) {
          return res.status(400).json({ success: false, message: validationError });
        }
        const name = String(req.body?.name || existing.rows[0].name).trim();
        const result = await db(
          `UPDATE platform_credentials
           SET name = $1, ciphertext = $2, metadata = $3::jsonb, active = TRUE,
               rotated_at = NOW(), updated_at = NOW()
           WHERE id = $4 AND company_id IS NULL
           RETURNING id, company_id, connector_id, credential_key, name, metadata,
                     active, rotated_at, created_at, updated_at`,
          [
            name,
            encryptCredentials(secrets),
            JSON.stringify({ fieldNames: Object.keys(secrets) }),
            req.params.id,
          ]
        );
        res.json({
          success: true,
          data: publicPlatformCredential(result.rows[0]),
        });
      } catch (error) {
        console.error("Rotate platform credential error:", error);
        res.status(500).json({
          success: false,
          message: "Unable to update platform credential",
        });
      }
    }
  );

  router.delete(
    "/platform/credentials/:id",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        if (!(await requireSuperadmin(req, res))) return;
        const result = await db(
          `UPDATE platform_credentials SET active = FALSE, updated_at = NOW()
           WHERE id = $1 AND company_id IS NULL RETURNING id`,
          [req.params.id]
        );
        if (!result.rows[0]) {
          return res.status(404).json({
            success: false,
            message: "Platform credential not found",
          });
        }
        res.json({ success: true, data: { id: result.rows[0].id, active: false } });
      } catch (error) {
        console.error("Delete platform credential error:", error);
        res.status(500).json({
          success: false,
          message: "Unable to delete platform credential",
        });
      }
    }
  );

  router.get("/connector-apps", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      // Keep this read path fast. Repair only the legacy free-app suspension
      // state needed by connector settings; full entitlement reconciliation
      // belongs to package/licence mutation flows, not every page refresh.
      await db(
        `INSERT INTO company_package_entitlement_sources
           (company_id,package_id,source_type,source_key,active,metadata)
         SELECT i.company_id,i.package_id,'DIRECT_INSTALL',
                'free-direct-install:' || i.package_id::text,
                i.deactivated_by_user=false,
                jsonb_build_object('repairedFromInstallation',true)
           FROM company_package_installations i
           JOIN package_registry p ON p.id=i.package_id
          WHERE i.company_id=$1
            AND p.active=true
            AND p.package_type='APPLICATION'
            AND (
              p.licence_mode='TECHNICAL'
              OR p.billable=false
              OR COALESCE((p.manifest->>'licenceRequired')::boolean,false)=false
            )
         ON CONFLICT(company_id,package_id,source_type,source_key)
         DO UPDATE SET active=EXCLUDED.active,metadata=EXCLUDED.metadata`,
        [req.user.companyId]
      );
      await db(
        `UPDATE company_package_installations i
            SET status='active',suspended_by_entitlement=false,updated_at=NOW()
          WHERE i.company_id=$1
            AND i.suspended_by_entitlement=true
            AND i.deactivated_by_user=false
            AND EXISTS (
              SELECT 1
                FROM company_package_entitlement_sources s
               WHERE s.company_id=i.company_id
                 AND s.package_id=i.package_id
                 AND s.source_type='DIRECT_INSTALL'
                 AND s.active=true
            )`,
        [req.user.companyId]
      );
      const result = await db(
        `SELECT p.package_key,p.name,p.description,p.manifest,p.category,p.publisher,
                i.status AS installation_status,i.version AS installed_version
           FROM package_registry p
           JOIN company_package_installations i
             ON i.package_id=p.id
            AND i.company_id=$1
            AND i.status='active'
            AND i.suspended_by_entitlement=FALSE
          WHERE p.active=TRUE
            AND p.package_type='APPLICATION'
          ORDER BY p.name`,
        [req.user.companyId]
      );
      res.json({
        success: true,
        data: result.rows
          .map((row) => {
            const manifest = effectiveConnectorManifest(row.package_key, row.manifest);
            if (!manifest?.connectorApp) return null;
            return {
              package_key: row.package_key,
              name: row.name,
              description: row.description,
              category: row.category,
              publisher: row.publisher,
              manifest,
              company_installation: {
                status: row.installation_status,
                version: row.installed_version,
              },
            };
          })
          .filter(Boolean),
      });
    } catch (error) {
      console.error("List connector apps error:", error);
      res.status(500).json({ success: false, message: "Unable to list installed connector apps" });
    }
  });

  router.get("/connector-instances", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const result = await db(
        `SELECT c.id,c.company_id,c.store_id,c.till_id,c.name,c.enabled,c.connection_status,
                c.connector_package_key,c.connector_configuration,c.connector_capabilities,c.credentials_encrypted,
                c.fallback_order,c.last_test_result,c.created_at,c.updated_at,
                s.name AS store_name,t.name AS till_name
           FROM integration_connections c
           LEFT JOIN stores s ON s.id=c.store_id AND s.company_id=c.company_id
           LEFT JOIN terminals t ON t.id=c.till_id AND t.store_id=COALESCE(c.store_id,t.store_id)
          WHERE c.company_id=$1 AND c.connector_package_key IS NOT NULL
          ORDER BY c.created_at DESC`,
        [req.user.companyId]
      );
      res.json({ success: true, data: result.rows.map(publicConnectorInstance) });
    } catch (error) {
      console.error("List connector instances error:", error);
      res.status(500).json({ success: false, message: "Unable to list connector instances" });
    }
  });

  router.post("/connector-instances", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const packageKey = String(req.body?.packageKey || "");
      const installed = await db(
        `SELECT p.id,p.name,p.manifest,p.package_type
           FROM package_registry p
           JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=$2
          WHERE p.package_key=$1 AND p.active=TRUE AND i.status='active'
            AND i.suspended_by_entitlement=FALSE`,
        [packageKey, req.user.companyId]
      );
      const packageRow = installed.rows[0];
      const manifest = effectiveConnectorManifest(packageKey, packageRow?.manifest);
      const connectorApp = manifest.connectorApp;
      if (!packageRow || packageRow.package_type !== "APPLICATION" || !connectorApp) {
        return res.status(404).json({ success: false, message: "An installed connector app is required" });
      }
      const configurationResult = validateAppConfiguration(manifest, req.body?.configuration || {});
      if (configurationResult.error) return res.status(400).json({ success: false, message: configurationResult.error });
      const encryptedSecrets = Object.keys(configurationResult.secrets || {}).length
        ? encryptCredentials(configurationResult.secrets)
        : null;
      let storeId = req.body?.storeId || null;
      const tillId = req.body?.tillId || null;
      if (storeId) {
        const store = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2", [storeId, req.user.companyId]);
        if (!store.rows[0]) return res.status(400).json({ success: false, message: "Store is not available" });
      }
      if (tillId) {
        const till = await db(
          `SELECT t.id,t.store_id FROM terminals t JOIN stores s ON s.id=t.store_id
            WHERE t.id=$1 AND s.company_id=$2`,
          [tillId, req.user.companyId]
        );
        if (!till.rows[0] || (storeId && String(till.rows[0].store_id) !== String(storeId))) {
          return res.status(400).json({ success: false, message: "Till is not available for the selected store" });
        }
        storeId = till.rows[0].store_id;
      }
      const capabilities = (connectorApp.capabilities || []).map((item) => typeof item === "string" ? item : item.key).filter(Boolean);
      const result = await db(
        `INSERT INTO integration_connections
          (company_id,store_id,till_id,name,provider_name,integration_type,connector_package_key,
           connector_configuration,connector_capabilities,credentials_encrypted,fallback_order,enabled,connection_status,
           last_test_result,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$5,$7::jsonb,$8::jsonb,$9,$10,FALSE,'DISCONNECTED',$11::jsonb,$12)
         RETURNING id,company_id,store_id,till_id,name,enabled,connection_status,connector_package_key,
                   connector_configuration,connector_capabilities,credentials_encrypted,fallback_order,last_test_result,created_at,updated_at`,
        [
          req.user.companyId,
          storeId,
          tillId,
          String(req.body?.name || packageRow.name).trim().slice(0, 200),
          packageKey,
          connectorApp.type || "hardware",
          JSON.stringify(configurationResult.value),
          JSON.stringify(capabilities),
          encryptedSecrets,
          Math.min(Math.max(Number(req.body?.fallbackOrder) || 0, 0), 10),
          JSON.stringify({ success: false, code: "NOT_TESTED" }),
          req.user.id || null,
        ]
      );
      const row = result.rows[0];
      await writeAudit?.(req.user.companyId, req.user.id, "connector.instance.created", "integration_connection", row.id, { packageKey, storeId, tillId });
      res.status(201).json({ success: true, data: publicConnectorInstance(row) });
    } catch (error) {
      console.error("Create connector instance error:", error);
      res.status(500).json({ success: false, message: "Unable to create connector instance" });
    }
  });

  router.put("/connector-instances/:id", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const existingResult = await db(
        `SELECT c.*,p.manifest FROM integration_connections c
           JOIN package_registry p ON p.package_key=c.connector_package_key
          WHERE c.id=$1 AND c.company_id=$2`,
        [req.params.id, req.user.companyId]
      );
      const current = existingResult.rows[0];
      if (!current) return res.status(404).json({ success: false, message: "Connector instance not found" });
      const manifest = effectiveConnectorManifest(current.connector_package_key, current.manifest);
      const existingSecrets = (() => { try { return decryptCredentials(current.credentials_encrypted) || {}; } catch { return {}; } })();
      const configurationSupplied = req.body?.configuration !== undefined;
      const configuration = configurationSupplied
        ? req.body.configuration
        : jsonValue(current.connector_configuration, {});
      const validation = validateAppConfiguration(manifest, configuration, { existingSecrets });
      if (validation.error) return res.status(400).json({ success: false, message: validation.error });
      let storeId = req.body?.storeId === undefined ? current.store_id : req.body.storeId || null;
      const tillId = req.body?.tillId === undefined ? current.till_id : req.body.tillId || null;
      if (storeId) {
        const store = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2", [storeId, req.user.companyId]);
        if (!store.rows[0]) return res.status(400).json({ success: false, message: "Store is not available" });
      }
      if (tillId) {
        const till = await db(
          `SELECT t.id,t.store_id FROM terminals t JOIN stores s ON s.id=t.store_id
            WHERE t.id=$1 AND s.company_id=$2`,
          [tillId, req.user.companyId]
        );
        if (!till.rows[0] || (storeId && String(till.rows[0].store_id) !== String(storeId))) {
          return res.status(400).json({ success: false, message: "Till is not available for the selected store" });
        }
        storeId = till.rows[0].store_id;
      }
      const configurationChanged = configurationSupplied
        && JSON.stringify(validation.value) !== JSON.stringify(jsonValue(current.connector_configuration, {}));
      const secretsChanged = configurationSupplied && Object.keys(validation.secrets || {}).length > 0;
      const nextCredentials = secretsChanged ? encryptCredentials({ ...existingSecrets, ...validation.secrets }) : current.credentials_encrypted;
      const assignmentChanged = String(tillId || "") !== String(current.till_id || "") || String(storeId || "") !== String(current.store_id || "");
      const resetTest = configurationChanged || secretsChanged || assignmentChanged;
      const enabled = resetTest ? false : (req.body?.enabled === undefined ? current.enabled === true : req.body.enabled === true);
      if (enabled && (!tillId || jsonValue(current.last_test_result, {})?.success !== true)) {
        return res.status(409).json({ success: false, message: "Assign and successfully test this connector before enabling it" });
      }
      const fallbackOrder = req.body?.fallbackOrder === undefined
        ? Number(current.fallback_order || 0)
        : Number(req.body.fallbackOrder);
      if (!Number.isInteger(fallbackOrder) || fallbackOrder < 0 || fallbackOrder > 10) {
        return res.status(400).json({ success: false, message: "fallbackOrder must be between 0 and 10" });
      }
      const capabilities = (manifest.connectorApp?.capabilities || []).map((item) => typeof item === "string" ? item : item.key).filter(Boolean);
      const result = await db(
        `UPDATE integration_connections SET store_id=$1,till_id=$2,connector_configuration=$3::jsonb,
           connector_capabilities=$4::jsonb,credentials_encrypted=$5,fallback_order=$6,enabled=$7,
           connection_status=CASE WHEN $8 THEN 'DISCONNECTED' ELSE connection_status END,
           last_test_at=CASE WHEN $8 THEN NULL ELSE last_test_at END,
           last_test_result=CASE WHEN $8 THEN '{"success":false,"code":"NOT_TESTED"}'::jsonb ELSE last_test_result END,
           updated_at=NOW()
         WHERE id=$9 AND company_id=$10
         RETURNING id,company_id,store_id,till_id,name,enabled,connection_status,connector_package_key,
                   connector_configuration,connector_capabilities,credentials_encrypted,fallback_order,last_test_result,created_at,updated_at`,
        [storeId, tillId, JSON.stringify(validation.value), JSON.stringify(capabilities), nextCredentials, fallbackOrder, enabled, resetTest, req.params.id, req.user.companyId]
      );
      const row = result.rows[0];
      await writeAudit?.(req.user.companyId, req.user.id, "connector.instance.updated", "integration_connection", row.id, { storeId, tillId, enabled, fallbackOrder });
      res.json({ success: true, data: publicConnectorInstance(row) });
    } catch (error) {
      console.error("Update connector instance error:", error);
      res.status(500).json({ success: false, message: "Unable to update connector instance" });
    }
  });

  router.post("/connector-instances/:id/test", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: "action:CONNECTOR_TEST_CONNECTION",
        req,
        input: { connectorInstanceId: req.params.id },
        connectorDrivers: drivers,
        writeAudit,
        source: {
          type: "api",
          method: req.method,
          path: req.originalUrl || req.path,
          capability: "connector.test",
        },
      });
      const result = execution.result?.result || execution.result || null;
      res.json({ success: true, data: result, workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      console.error("Test connector instance workflow error:", error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Unable to test connector instance",
        workflowRunId: error.workflowRunId || null,
        correlationId: error.correlationId || null,
      });
    }
  });

  router.get("/connector-capabilities/:capabilityKey", authenticate, authorize("sale.create"), async (req, res) => {
    try {
      let session = await db(
        `SELECT terminal_id,store_id FROM till_sessions
          WHERE company_id=$1 AND store_id=$2 AND status='open'
          ORDER BY opened_at DESC LIMIT 1`,
        [req.user.companyId, req.user.storeId]
      );
      if (!session.rows[0] && req.user.id) {
        session = await db(
          `SELECT ts.terminal_id,ts.store_id
             FROM till_sessions ts
             JOIN integration_connections c
               ON c.company_id=ts.company_id
              AND c.till_id=ts.terminal_id
              AND c.enabled=TRUE
              AND (c.store_id IS NULL OR c.store_id=ts.store_id)
            WHERE ts.company_id=$1
              AND ts.user_id=$2
              AND ts.status='open'
            ORDER BY ts.opened_at DESC
            LIMIT 1`,
          [req.user.companyId, req.user.id]
        );
      }
      if (!session.rows[0]) return res.json({ success: true, data: { available: false, code: "DEVICE_OFFLINE" } });
      const result = await resolvePersistedConnectorCapability({
        db,
        drivers,
        companyId: req.user.companyId,
        storeId: session.rows[0].store_id,
        tillId: session.rows[0].terminal_id,
        capabilityKey: req.params.capabilityKey,
        selfCheckout: req.user.mode === "self_checkout",
      });
      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Resolve connector capability error:", error);
      res.status(500).json({ success: false, message: "Unable to resolve connector capability" });
    }
  });

  return router;
}
