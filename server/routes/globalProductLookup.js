import express from "express";
import { internalAppCatalog } from "../services/internalAppCatalog.js";
import { encryptCredentials } from "../services/integrationCredentials.js";
import { getCompanyEntitlements, isPackageLicensed } from "../services/licensing.js";
import { globalProductProviderConfigKeys, globalProductProviderDefaults } from "../services/globalProductLookup.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

const PROVIDER_KEYS = Object.freeze(Object.keys(globalProductProviderConfigKeys));
const PROVIDER_HOSTS = Object.freeze({
  open_food_facts: "openfoodfacts.org",
  upcitemdb: "upcitemdb.com",
  barcode_nest: "barcodenest.com",
  go_upc: "go-upc.com",
});
const CONFIGURABLE_FIELDS = new Set(["enabled", "priority", "timeoutMs", "fallbackEnabled", "cacheTtlSeconds", "baseUrl", "userAgent", "fieldMappings"]);
const MAPPED_FIELDS = new Set(["barcode", "name", "brand", "description", "category", "variant", "quantity", "imageUrl", "country", "manufacturer"]);

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function isSafeBaseUrl(value, providerKey) {
  try {
    const url = new URL(value);
    const suffix = PROVIDER_HOSTS[providerKey];
    return url.protocol === "https:" && (url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch { return false; }
}

function sanitizeSettings(body, providerKey, current) {
  const next = { ...current };
  for (const [key, value] of Object.entries(body || {})) {
    if (key === "apiKey") continue;
    if (!CONFIGURABLE_FIELDS.has(key)) throw Object.assign(new Error(`Unsupported provider setting: ${key}`), { status: 400 });
    if (key === "enabled" || key === "fallbackEnabled") {
      if (typeof value !== "boolean") throw Object.assign(new Error(`${key} must be a boolean`), { status: 400 });
      next[key] = value;
    } else if (key === "priority") {
      if (!Number.isInteger(value) || value < 1 || value > 9999) throw Object.assign(new Error("priority must be an integer from 1 to 9999"), { status: 400 });
      next[key] = value;
    } else if (key === "timeoutMs") {
      if (!Number.isInteger(value) || value < 500 || value > 30000) throw Object.assign(new Error("timeoutMs must be from 500 to 30000"), { status: 400 });
      next[key] = value;
    } else if (key === "cacheTtlSeconds") {
      if (!Number.isInteger(value) || value < 0 || value > 86400) throw Object.assign(new Error("cacheTtlSeconds must be from 0 to 86400"), { status: 400 });
      next[key] = value;
    } else if (key === "baseUrl") {
      if (typeof value !== "string" || !isSafeBaseUrl(value, providerKey)) throw Object.assign(new Error("baseUrl must use the provider's HTTPS host"), { status: 400 });
      next[key] = new URL(value).origin;
    } else if (key === "userAgent") {
      if (providerKey !== "open_food_facts" || typeof value !== "string" || value.trim().length < 10 || value.length > 200) {
        throw Object.assign(new Error("userAgent must identify the application and be 10 to 200 characters"), { status: 400 });
      }
      next[key] = value.trim();
    } else if (key === "fieldMappings") {
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > MAPPED_FIELDS.size) {
        throw Object.assign(new Error("fieldMappings must be an object of canonical field paths"), { status: 400 });
      }
      for (const [field, path] of Object.entries(value)) {
        if (!MAPPED_FIELDS.has(field) || typeof path !== "string" || !/^[A-Za-z0-9_.]+$/.test(path)) {
          throw Object.assign(new Error("fieldMappings contains an invalid field or path"), { status: 400 });
        }
      }
      next[key] = value;
    }
  }
  return next;
}

export default function createGlobalProductLookupRouter({ authenticate, authorize, db, writeAudit, lookupService, connectorDrivers = null }) {
  const router = express.Router();

  async function providerRows(companyId) {
    const appEntries = internalAppCatalog.filter((entry) => entry.providerConnector?.globalProductLookup);
    const packageKeys = appEntries.map((entry) => entry.key);
    const [packages, settings, connections, entitlements] = await Promise.all([
      db(
        `SELECT p.package_key,p.package_type,p.licence_mode,p.manifest,
                i.status AS installation_status,i.suspended_by_entitlement,i.deactivated_by_user
           FROM package_registry p
           LEFT JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=$1
          WHERE p.package_key=ANY($2::text[])`,
        [companyId, packageKeys]
      ),
      db("SELECT provider,configuration,active FROM integrations WHERE company_id=$1 AND provider=ANY($2::text[])", [companyId, [...Object.values(globalProductProviderConfigKeys), "global_product_lookup_preferences"]]),
      db("SELECT provider_name,credentials_encrypted IS NOT NULL AS has_credentials,last_connected_at,last_error FROM integration_connections WHERE company_id=$1 AND provider_name=ANY($2::text[]) AND store_id IS NULL ORDER BY updated_at DESC", [companyId, ["go_upc","upcitemdb","barcode_nest"]]),
      getCompanyEntitlements(db, companyId),
    ]);
    const packageByKey = new Map((packages.rows || []).map((row) => [row.package_key, row]));
    const configByKey = new Map((settings.rows || []).map((row) => [row.provider, row]));
    const connectionByProvider = new Map((connections.rows || []).map((row) => [String(row.provider_name || "").toLowerCase(), row]));
    const preferences = parseObject(configByKey.get("global_product_lookup_preferences")?.configuration);
    const defaultProviderKey = String(preferences.defaultProviderKey || "");

    const rows = appEntries.map((entry) => {
      const definition = packageByKey.get(entry.key);
      const metadata = definition ? parseObject(definition.manifest) : {};
      const manifestConnector = metadata.providerConnector?.globalProductLookup || entry.providerConnector.globalProductLookup;
      const configKey = manifestConnector.configKey;
      const stored = configByKey.get(configKey);
      const config = { ...globalProductProviderDefaults, ...manifestConnector, ...parseObject(stored?.configuration) };
      const installed = definition?.installation_status === "active" && definition.suspended_by_entitlement !== true && definition.deactivated_by_user !== true;
      const licensed = Boolean(definition && isPackageLicensed(entitlements, {
        package_key: entry.key,
        package_type: definition.package_type,
        licence_mode: definition.licence_mode,
        manifest: metadata,
      }));
      const connection = connectionByProvider.get(manifestConnector.providerKey);
      return {
        providerKey: manifestConnector.providerKey,
        packageKey: entry.key,
        displayName: manifestConnector.displayName || entry.name,
        configKey,
        installed,
        licensed,
        enabled: stored?.active !== false && config.enabled !== false,
        priority: Number.isFinite(Number(config.priority)) ? Number(config.priority) : globalProductProviderDefaults.priority,
        timeoutMs: Number(config.timeoutMs) || globalProductProviderDefaults.timeoutMs,
        fallbackEnabled: config.fallbackEnabled !== false,
        cacheTtlSeconds: Number(config.cacheTtlSeconds) || 0,
        baseUrl: config.baseUrl || manifestConnector.baseUrl,
        userAgent: manifestConnector.providerKey === "open_food_facts" ? config.userAgent || "onePOS/1.0 (product lookup; support@onesolutions.example)" : undefined,
        fieldMappings: config.fieldMappings || manifestConnector.fieldMappings || {},
        authType: manifestConnector.authType || "none",
        requiresApiKey: ["bearer","x-api-key"].includes(manifestConnector.authType),
        acceptsApiKey: ["bearer","x-api-key","optional_user_key"].includes(manifestConnector.authType),
        configurableFields: Array.isArray(manifestConnector.configurableFields) ? manifestConnector.configurableFields : [],
        configured: ["bearer","x-api-key"].includes(manifestConnector.authType) ? connection?.has_credentials === true : true,
        usingCustomerKey: connection?.has_credentials === true,
        isDefault: defaultProviderKey === manifestConnector.providerKey,
        supportsSearch: Boolean(manifestConnector.searchEndpoint),
        lastSuccessfulLookup: connection?.last_connected_at || null,
        lastProviderError: connection?.last_error ? "Test connection reported an error" : null,
      };
    }).sort((left, right) => left.priority - right.priority || left.displayName.localeCompare(right.displayName));

    if (!rows.some((row) => row.isDefault && row.installed && row.licensed && row.enabled)) {
      const firstUsable = rows.find((row) => row.installed && row.licensed && row.enabled && (!row.requiresApiKey || row.configured));
      if (firstUsable) firstUsable.isDefault = true;
    }
    return rows;
  }

  router.get("/global-products/providers", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      res.json({ success: true, data: await providerRows(req.user.companyId) });
    } catch {
      res.status(500).json({ success: false, message: "Unable to load product lookup providers" });
    }
  });

  router.get("/global-products/search", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      const result = await lookupService.search({
        db,
        companyId: req.user.companyId,
        reqCompanyId: req.user.companyId,
        query: req.query?.q,
        providerKey: req.query?.providerKey || null,
        page: req.query?.page,
        pageSize: req.query?.pageSize,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      const status = error?.code === "INVALID_SEARCH" ? 400 : 500;
      res.status(status).json({
        success: false,
        code: error?.code || "SEARCH_FAILED",
        message: status === 400 ? error.message : "Unable to search the global product database",
      });
    }
  });

  router.post("/global-products/lookup", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      const result = await lookupService.lookup({
        db,
        companyId: req.user.companyId,
        reqCompanyId: req.user.companyId,
        barcode: req.body?.barcode,
        providerKey: req.body?.providerKey || null,
      });
      if (result.status === "unavailable" && writeAudit) {
        await writeAudit(req.user.companyId, req.user.id, "global_product_lookup_unavailable", "global_product_lookup", null, {
          barcode: result.barcode, providerErrors: result.providerErrors,
        });
      }
      res.json({ success: true, data: result });
    } catch (error) {
      const status = error?.code === "INVALID_BARCODE" ? 400 : 500;
      res.status(status).json({ success: false, code: error?.code || "LOOKUP_FAILED", message: status === 400 ? error.message : "Unable to look up this barcode" });
    }
  });

  router.patch("/global-products/default-provider", authenticate, authorize("integration.manage"), async (req, res) => {
    const providerKey = String(req.body?.providerKey || "").trim();
    if (!PROVIDER_KEYS.includes(providerKey)) {
      return res.status(400).json({ success: false, message: "Choose an installed product lookup provider" });
    }
    try {
      const providers = await providerRows(req.user.companyId);
      const selected = providers.find((item) => item.providerKey === providerKey);
      if (!selected?.installed || !selected?.licensed || !selected?.enabled || (selected.requiresApiKey && !selected.configured)) {
        return res.status(400).json({ success: false, message: "The selected provider must be installed, licensed, enabled and configured first" });
      }
      await db(
        `INSERT INTO integrations (company_id,name,provider,configuration,active)
         VALUES ($1,'Global Product Lookup preferences','global_product_lookup_preferences',$2::jsonb,true)
         ON CONFLICT (company_id,provider) DO UPDATE SET configuration=EXCLUDED.configuration,active=true,updated_at=NOW()`,
        [req.user.companyId, JSON.stringify({ defaultProviderKey: providerKey })]
      );
      await writeAudit?.(req.user.companyId, req.user.id, "global_product_default_provider_updated", "global_product_lookup", providerKey, {});
      res.json({ success: true, data: { providerKey } });
    } catch {
      res.status(500).json({ success: false, message: "Unable to change the default product lookup provider" });
    }
  });

  router.patch("/global-products/providers/:providerKey", authenticate, authorize("integration.manage"), async (req, res) => {
    const providerKey = String(req.params.providerKey || "");
    if (!PROVIDER_KEYS.includes(providerKey)) return res.status(404).json({ success: false, message: "Unknown product lookup provider" });
    if (typeof req.body?.apiKey === "string" && req.body.apiKey.trim().length > 1000) {
      return res.status(400).json({ success: false, message: "API key is too long" });
    }
    try {
      const connector = internalAppCatalog.find((entry) => entry.providerConnector?.globalProductLookup?.providerKey === providerKey)?.providerConnector;
      const configKey = connector.globalProductLookup.configKey;
      const currentResult = await db("SELECT configuration FROM integrations WHERE company_id=$1 AND provider=$2", [req.user.companyId, configKey]);
      const current = { ...globalProductProviderDefaults, ...connector.globalProductLookup, ...parseObject(currentResult.rows?.[0]?.configuration) };
      const next = sanitizeSettings(req.body || {}, providerKey, current);
      const publicFields = Object.keys(req.body || {}).filter((key) => key !== "apiKey");
      await db(
        `INSERT INTO integrations (company_id,name,provider,configuration,active)
         VALUES ($1,$2,$3,$4::jsonb,true)
         ON CONFLICT (company_id,provider) DO UPDATE SET
           configuration=EXCLUDED.configuration,active=true,updated_at=NOW()`,
        [req.user.companyId, `${connector.globalProductLookup.displayName} product lookup`, configKey, JSON.stringify(next)]
      );

      let credentialsChanged = false;
      if (connector.globalProductLookup.authType !== "none" && typeof req.body?.apiKey === "string" && req.body.apiKey.trim()) {
        const apiKey = req.body.apiKey.trim();
        const authType = connector.globalProductLookup.authType === "x-api-key" ? "x-api-key"
          : connector.globalProductLookup.authType === "optional_user_key" ? "user_key"
            : "bearer";
        const existing = await db(
          "SELECT id FROM integration_connections WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND store_id IS NULL ORDER BY updated_at DESC LIMIT 1",
          [req.user.companyId, providerKey]
        );
        if (existing.rows?.[0]) {
          await db(
            "UPDATE integration_connections SET credentials_encrypted=$1,auth_type=$2,base_url=$3,enabled=true,connection_status='CONFIGURED',last_error=NULL,updated_at=NOW() WHERE id=$4 AND company_id=$5",
            [encryptCredentials({ apiKey }), authType, next.baseUrl || connector.globalProductLookup.baseUrl, existing.rows[0].id, req.user.companyId]
          );
        } else {
          await db(
            `INSERT INTO integration_connections (company_id,store_id,name,provider_name,integration_type,base_url,auth_type,credentials_encrypted,enabled,connection_status,created_by)
             VALUES ($1,NULL,$2,$3,'product_lookup',$4,$5,$6,true,'CONFIGURED',$7)`,
            [
              req.user.companyId,
              `${connector.globalProductLookup.displayName} Product Lookup`,
              providerKey,
              next.baseUrl || connector.globalProductLookup.baseUrl,
              authType,
              encryptCredentials({ apiKey }),
              req.user.id,
            ]
          );
        }
        credentialsChanged = true;
      }

      // Every product provider gets a normal connector instance, including
      // credential-free providers such as Open Food Facts. This keeps Test
      // Connection on the same editable CONNECTOR_TEST_CONNECTION workflow.
      const definitionResult = await db(
        "SELECT id FROM platform_connector_definitions WHERE connector_key=$1 AND status='ACTIVE' LIMIT 1",
        [providerKey]
      );
      const connectorDefinitionId = definitionResult.rows?.[0]?.id || null;
      if (!connectorDefinitionId) throw new Error("Provider connector metadata is not installed");
      const connectorInstance = await db(
        "SELECT id FROM integration_connections WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND store_id IS NULL ORDER BY updated_at DESC LIMIT 1",
        [req.user.companyId, providerKey]
      );
      if (!connectorInstance.rows?.[0]) {
        await db(
          `INSERT INTO integration_connections
             (company_id,store_id,name,provider_name,integration_type,connector_package_key,connector_definition_id,connector_configuration,auth_type,credentials_encrypted,enabled,connection_status,created_by)
           VALUES ($1,NULL,$2,$3,'product_lookup',$4,$5,$6::jsonb,$7,NULL,true,'CONFIGURED',$8)`,
          [
            req.user.companyId,
            `${connector.globalProductLookup.displayName} Product Lookup`,
            providerKey,
            providerKey,
            connectorDefinitionId,
            JSON.stringify(next),
            connector.globalProductLookup.authType === "none" ? "none" : connector.globalProductLookup.authType,
            req.user.id,
          ]
        );
      } else {
        await db(
          "UPDATE integration_connections SET connector_package_key=COALESCE(connector_package_key,$1),connector_definition_id=$2,connector_configuration=$3::jsonb,updated_at=NOW() WHERE id=$4 AND company_id=$5",
          [providerKey, connectorDefinitionId, JSON.stringify(next), connectorInstance.rows[0].id, req.user.companyId]
        );
      }

      await writeAudit?.(req.user.companyId, req.user.id, "global_product_provider_config_updated", "global_product_provider", providerKey, {
        fields: publicFields, credentialsChanged,
      });
      const [provider] = (await providerRows(req.user.companyId)).filter((item) => item.providerKey === providerKey);
      res.json({ success: true, data: provider });
    } catch (error) {
      res.status(error?.status || 500).json({ success: false, message: error?.status ? error.message : "Unable to save product lookup provider settings" });
    }
  });

  router.post("/global-products/providers/:providerKey/test", authenticate, authorize("integration.manage"), async (req, res) => {
    const providerKey = String(req.params.providerKey || "");
    if (!PROVIDER_KEYS.includes(providerKey)) return res.status(404).json({ success: false, message: "Unknown product lookup provider" });
    const instanceResult = await db(
      "SELECT id FROM integration_connections WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND store_id IS NULL ORDER BY updated_at DESC LIMIT 1",
      [req.user.companyId, providerKey]
    );
    const connectorInstanceId = instanceResult.rows?.[0]?.id || null;
    if (!connectorInstanceId) {
      return res.status(400).json({ success: false, code: "NOT_CONFIGURED", message: "Configure this provider before testing the connection" });
    }
    const execution = await executeSystemWorkflow({
      db,
      companyId: req.user.companyId,
      userId: req.user.id || null,
      systemKey: "action:CONNECTOR_TEST_CONNECTION",
      req,
      input: { connectorInstanceId },
      connectorDrivers,
      source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "CONNECTOR_TEST_CONNECTION" },
    });
    const result = execution.result || { success: false, code: "TEST_FAILED", message: "Provider test did not return a result" };
    await writeAudit?.(req.user.companyId, req.user.id, "global_product_provider_tested", "global_product_provider", providerKey, {
      success: result.success, code: result.code || null,
    });
    res.status(result.success ? 200 : 400).json(result);
  });

  return router;
}