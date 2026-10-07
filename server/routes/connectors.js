import express from "express";
import { decryptCredentials, encryptCredentials } from "../services/integrationCredentials.js";
import { isAllowedConnectorTarget, toPublicCredential } from "../services/connectorFramework.js";
import { executeInstalledConnectorCapability } from "../services/connectorCapabilityRuntime.js";
import { executeSystemAction } from "../services/systemWorkflowRuntime.js";

function jsonValue(value, fallback) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function publicDefinition(row) {
  const schema = jsonValue(row.credentials_schema, []);
  const schemaFields = Array.isArray(schema)
    ? schema
    : Object.entries(schema || {}).map(([key, value]) => ({ key, ...(value || {}) }));
  const operations = jsonValue(row.operations, []);
  return {
    id: row.id,
    connectorKey: row.connector_key,
    name: row.name,
    description: row.description,
    publisher: row.publisher,
    authType: row.auth_type,
    baseUrl: row.base_url,
    credentialsSchema: schemaFields.map((field) => ({
      key: field.key || field.name,
      name: field.name,
      type: field.type,
      required: Boolean(field.required),
      label: field.label,
      description: field.description,
    })),
    operations: (Array.isArray(operations) ? operations : Object.entries(operations || {}).map(([key, value]) => ({ key, ...(value || {}) }))).map((operation) => ({
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

function publicConnectorInstance(row) {
  let credentialFields = [];
  try {
    const secrets = decryptCredentials(row.credentials_encrypted) || {};
    credentialFields = secrets && typeof secrets === "object" && !Array.isArray(secrets) ? Object.keys(secrets) : [];
  } catch {}
  const configuration = Object.fromEntries(
    Object.entries(jsonValue(row.connector_configuration, {})).filter(([key]) => !/(secret|password|token|credential|api[_-]?key|card|pan)/i.test(key))
  );
  return {
    id: row.id,
    packageKey: row.connector_package_key,
    name: row.name,
    companyId: row.company_id,
    storeId: row.store_id,
    tillId: row.till_id,
    enabled: row.enabled === true,
    status: row.connection_status,
    health: jsonValue(row.last_test_result, {}),
    configuration,
    hasCredentials: Boolean(row.credentials_encrypted),
    credentialFields,
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
  const retryPolicy = body.retryPolicy ?? body.retry_policy ?? { maxAttempts: 3, backoffMs: 1000 };
  if (!["none", "api_key", "bearer", "basic"].includes(authType)) return { error: "Unsupported authType" };
  if (!(await isAllowedConnectorTarget(baseUrl))) return { error: "baseUrl must be a safe HTTP(S) target" };
  if (!Array.isArray(operations) || operations.length > 100) return { error: "operations must be an array of at most 100 operations" };
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) return { error: "timeoutMs must be between 100 and 120000" };
  const credentialsSchema = body.credentialsSchema ?? body.credentials_schema ?? [];
  return { value: { authType, baseUrl, operations, timeoutMs, retryPolicy, credentialsSchema } };
}

function validateSecrets(schema, secrets) {
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets)) return "secrets must be an object";
  const fields = Array.isArray(schema) ? schema : Object.values(schema || {});
  const allowed = new Set(fields.map((field) => field?.key || field?.name).filter(Boolean));
  if (allowed.size && Object.keys(secrets).some((key) => !allowed.has(key))) return "secrets contains fields not declared by this connector";
  for (const field of fields) {
    const key = field?.key || field?.name;
    if (field?.required && (secrets[key] === undefined || secrets[key] === null || secrets[key] === "")) return `${key} is required`;
  }
  return null;
}

export default function createConnectorsRouter({ authenticate, authorize, db, writeAudit, drivers }) {
  if (typeof db !== "function") throw new Error("db query function is required");
  const router = express.Router();

  async function requireOneEngineManage(req, res) {
    const result = await db(
      `SELECT 1 FROM users u JOIN role_permissions rp ON rp.role_id=u.role_id JOIN permissions p ON p.id=rp.permission_id
        WHERE u.id=$1 AND u.active=TRUE AND p.code='oneengine.manage' LIMIT 1`,
      [req.user?.id]
    );
    if (!result.rows.length) {
      res.status(403).json({ success: false, message: "OneEngine Manager permission required" });
      return false;
    }
    return true;
  }

  router.get("/connectors", authenticate, authorize("integration.manage"), async (_req, res) => {
    const result = await db(`SELECT * FROM platform_connector_definitions WHERE status='ACTIVE' ORDER BY name`);
    res.json({ success: true, data: result.rows.map(publicDefinition) });
  });

  router.get("/platform/connectors", authenticate, authorize("integration.manage"), async (req, res) => {
    if (!(await requireOneEngineManage(req, res))) return;
    const result = await db(`SELECT * FROM platform_connector_definitions ORDER BY name`);
    res.json({ success: true, data: result.rows.map(publicDefinition) });
  });

  router.post("/platform/connectors", authenticate, authorize("integration.manage"), async (req, res) => {
    if (!(await requireOneEngineManage(req, res))) return;
    const connectorKey = String(req.body?.connectorKey || req.body?.connector_key || "").trim();
    const name = String(req.body?.name || "").trim();
    if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(connectorKey) || !name) return res.status(400).json({ success: false, message: "A valid connectorKey and name are required" });
    const validation = await validateDefinition(req.body || {});
    if (validation.error) return res.status(400).json({ success: false, message: validation.error });
    const value = validation.value;
    const result = await db(
      `INSERT INTO platform_connector_definitions(connector_key,name,description,publisher,auth_type,base_url,credentials_schema,operations,timeout_ms,retry_policy,status,source_package_id,source_package_version)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$13) RETURNING *`,
      [connectorKey,name,req.body?.description||null,req.body?.publisher||null,value.authType,value.baseUrl,JSON.stringify(value.credentialsSchema),JSON.stringify(value.operations),value.timeoutMs,JSON.stringify(value.retryPolicy),req.body?.status||"ACTIVE",req.body?.sourcePackageId||null,req.body?.sourcePackageVersion||null]
    );
    res.status(201).json({ success: true, data: publicDefinition(result.rows[0]) });
  });

  router.put("/platform/connectors/:id", authenticate, authorize("integration.manage"), async (req, res) => {
    if (!(await requireOneEngineManage(req, res))) return;
    const connectorKey = String(req.body?.connectorKey || req.body?.connector_key || "").trim();
    const name = String(req.body?.name || "").trim();
    const validation = await validateDefinition(req.body || {});
    if (!connectorKey || !name || validation.error) return res.status(400).json({ success: false, message: validation.error || "A valid connectorKey and name are required" });
    const value = validation.value;
    const result = await db(
      `UPDATE platform_connector_definitions SET connector_key=$1,name=$2,description=$3,publisher=$4,auth_type=$5,base_url=$6,credentials_schema=$7::jsonb,operations=$8::jsonb,timeout_ms=$9,retry_policy=$10::jsonb,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [connectorKey,name,req.body?.description||null,req.body?.publisher||null,value.authType,value.baseUrl,JSON.stringify(value.credentialsSchema),JSON.stringify(value.operations),value.timeoutMs,JSON.stringify(value.retryPolicy),req.body?.status||"ACTIVE",req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: "Connector not found" });
    res.json({ success: true, data: publicDefinition(result.rows[0]) });
  });

  router.get("/credentials", authenticate, authorize("integration.manage"), async (req, res) => {
    const result = await db(`SELECT id,company_id,connector_id,credential_key,name,metadata,active,rotated_at,created_at,updated_at FROM platform_credentials WHERE company_id=$1 ORDER BY updated_at DESC`, [req.user.companyId]);
    res.json({ success: true, data: result.rows.map(toPublicCredential) });
  });

  router.post("/credentials", authenticate, authorize("integration.manage"), async (req, res) => {
    const connector = await db(`SELECT id,credentials_schema,status FROM platform_connector_definitions WHERE id=$1`, [req.body?.connectorId]);
    const definition = connector.rows[0];
    if (!definition || definition.status !== "ACTIVE") return res.status(404).json({ success: false, message: "Connector not found" });
    const error = validateSecrets(jsonValue(definition.credentials_schema, []), req.body?.secrets);
    if (error) return res.status(400).json({ success: false, message: error });
    const result = await db(
      `INSERT INTO platform_credentials(company_id,connector_id,credential_key,name,ciphertext,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id,company_id,connector_id,credential_key,name,metadata,active,rotated_at,created_at,updated_at`,
      [req.user.companyId,req.body.connectorId,req.body.credentialKey,req.body.name,encryptCredentials(req.body.secrets),JSON.stringify({fieldNames:Object.keys(req.body.secrets||{})}),req.user.id||null]
    );
    res.status(201).json({ success: true, data: toPublicCredential(result.rows[0]) });
  });

  router.get("/connector-apps", authenticate, authorize("integration.manage"), async (req, res) => {
    const result = await db(
      `SELECT p.package_key,p.name,p.description,p.manifest,p.category,p.publisher,i.status AS installation_status,i.version AS installed_version
         FROM package_registry p JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=$1
        WHERE p.active=TRUE AND p.package_type='APPLICATION' AND i.status='active' AND i.suspended_by_entitlement=FALSE ORDER BY p.name`,
      [req.user.companyId]
    );
    res.json({ success: true, data: result.rows.filter((row) => row.manifest?.connectorApp).map((row) => ({
      package_key: row.package_key,name: row.name,description: row.description,category: row.category,publisher: row.publisher,manifest: row.manifest,
      company_installation: { status: row.installation_status, version: row.installed_version },
    })) });
  });

  router.get("/connector-instances", authenticate, authorize("integration.manage"), async (req, res) => {
    const result = await db(`SELECT * FROM integration_connections WHERE company_id=$1 AND connector_package_key IS NOT NULL ORDER BY created_at DESC`, [req.user.companyId]);
    res.json({ success: true, data: result.rows.map(publicConnectorInstance) });
  });

  router.post("/connector-instances/:id/test", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const execution = await executeSystemAction({
        db, companyId: req.user.companyId, userId: req.user.id || null, actionKey: "CONNECTOR_TEST_CONNECTION", req,
        input: { connectorInstanceId: req.params.id }, connectorDrivers: drivers, writeAudit,
        source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "connector.test", connectorInstanceId: req.params.id },
      });
      res.json({ success: true, data: execution.result?.result || execution.result || null, workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || "Unable to test connector instance", workflowRunId: error.workflowRunId || null, correlationId: error.correlationId || null });
    }
  });

  router.post("/connector-instances/:id/execute", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const capability = String(req.body?.capability || "").trim();
      const execution = await executeInstalledConnectorCapability({ db, drivers, companyId: req.user.companyId, connectorInstanceId: req.params.id, capability, payload: req.body?.payload || {} });
      await writeAudit?.(req.user.companyId, req.user.id || null, "connector.capability.executed", "integration_connection", req.params.id, { capability });
      res.json({ success: true, data: execution.result });
    } catch (error) {
      res.status(error.status || 500).json({ success: false, code: error.code, message: error.message || "Unable to execute connector capability" });
    }
  });

  router.get("/connector-capabilities/:capabilityKey", authenticate, authorize("connector.view"), async (req, res) => {
    const capability = String(req.params.capabilityKey || "").trim();
    const result = await db(
      `SELECT id,connector_package_key,name,store_id,till_id,enabled,connection_status,connector_capabilities,last_test_result
         FROM integration_connections WHERE company_id=$1 AND connector_package_key IS NOT NULL AND enabled=TRUE ORDER BY fallback_order,created_at`,
      [req.user.companyId]
    );
    const matches = result.rows.filter((row) => jsonValue(row.connector_capabilities, []).some((entry) => (typeof entry === "string" ? entry : entry?.key) === capability));
    res.json({ success: true, data: matches.map(publicConnectorInstance) });
  });

  return router;
}
