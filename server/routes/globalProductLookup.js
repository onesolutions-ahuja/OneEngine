import express from "express";
import { internalAppCatalog } from "../services/internalAppCatalog.js";
import { encryptCredentials } from "../services/integrationCredentials.js";
import { getCompanyEntitlements, isPackageLicensed } from "../services/licensing.js";
import { globalProductProviderConfigKeys, globalProductProviderDefaults, testGlobalProductProvider } from "../services/globalProductLookup.js";

const PROVIDER_KEYS = Object.freeze(Object.keys(globalProductProviderConfigKeys));
const PROVIDER_HOSTS = Object.freeze({ open_food_facts: "openfoodfacts.org", go_upc: "go-upc.com" });
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

export default function createGlobalProductLookupRouter({ authenticate, authorize, db, writeAudit, lookupService }) {
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
      db("SELECT provider,configuration,active FROM integrations WHERE company_id=$1 AND provider=ANY($2::text[])", [companyId, Object.values(globalProductProviderConfigKeys)]),
      db("SELECT provider_name,credentials_encrypted IS NOT NULL AS has_credentials,last_connected_at,last_error FROM integration_connections WHERE company_id=$1 AND provider_name=ANY($2::text[]) AND store_id IS NULL ORDER BY updated_at DESC", [companyId, ["go_upc"]]),
      getCompanyEntitlements(db, companyId),
    ]);
    const packageByKey = new Map((packages.rows || []).map((row) => [row.package_key, row]));
    const configByKey = new Map((settings.rows || []).map((row) => [row.provider, row]));
    const connectionByProvider = new Map((connections.rows || []).map((row) => [String(row.provider_name || "").toLowerCase(), row]));

    return appEntries.map((entry) => {
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
        requiresApiKey: manifestConnector.authType === "bearer",
        configurableFields: Array.isArray(manifestConnector.configurableFields) ? manifestConnector.configurableFields : [],
        configured: manifestConnector.providerKey === "go_upc" ? connection?.has_credentials === true : true,
        lastSuccessfulLookup: connection?.last_connected_at || null,
        lastProviderError: connection?.last_error ? "Test connection reported an error" : null,
      };
    }).sort((left, right) => left.priority - right.priority || left.displayName.localeCompare(right.displayName));
  }

  router.get("/global-products/providers", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      res.json({ success: true, data: await providerRows(req.user.companyId) });
    } catch {
      res.status(500).json({ success: false, message: "Unable to load product lookup providers" });
    }
  });

  router.post("/global-products/lookup", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      const result = await lookupService.lookup({
        db, companyId: req.user.companyId, reqCompanyId: req.user.companyId, barcode: req.body?.barcode,
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

  router.patch("/global-products/providers/:providerKey", authenticate, authorize("integration.manage"), async (req, res) => {
    const providerKey = String(req.params.providerKey || "");
    if (!PROVIDER_KEYS.includes(providerKey)) return res.status(404).json({ success: false, message: "Unknown product lookup provider" });
    if (providerKey === "go_upc" && typeof req.body?.apiKey === "string" && req.body.apiKey.trim().length > 1000) {
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
      if (providerKey === "go_upc" && typeof req.body?.apiKey === "string" && req.body.apiKey.trim()) {
        const apiKey = req.body.apiKey.trim();
        const existing = await db("SELECT id FROM integration_connections WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND store_id IS NULL ORDER BY updated_at DESC LIMIT 1", [req.user.companyId, "go_upc"]);
        if (existing.rows?.[0]) {
          await db(
            "UPDATE integration_connections SET credentials_encrypted=$1,auth_type='bearer',base_url=$2,enabled=true,connection_status='CONFIGURED',last_error=NULL,updated_at=NOW() WHERE id=$3 AND company_id=$4",
            [encryptCredentials({ apiKey }), next.baseUrl || connector.globalProductLookup.baseUrl, existing.rows[0].id, req.user.companyId]
          );
        } else {
          await db(
            `INSERT INTO integration_connections (company_id,store_id,name,provider_name,integration_type,base_url,auth_type,credentials_encrypted,enabled,connection_status,created_by)
             VALUES ($1,NULL,'Go-UPC Product Lookup','go_upc','product_lookup',$2,'bearer',$3,true,'CONFIGURED',$4)`,
            [req.user.companyId, next.baseUrl || connector.globalProductLookup.baseUrl, encryptCredentials({ apiKey }), req.user.id]
          );
        }
        credentialsChanged = true;
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
    const result = await testGlobalProductProvider({ db, companyId: req.user.companyId, providerKey });
    if (providerKey === "go_upc") {
      const error = result.success ? null : result.code || "Provider test failed";
      await db(
        `UPDATE integration_connections SET last_connected_at=CASE WHEN $1 THEN NOW() ELSE last_connected_at END,
                last_error=$2,connection_status=$3,updated_at=NOW()
          WHERE company_id=$4 AND LOWER(provider_name)=LOWER($5) AND store_id IS NULL`,
        [result.success, error, result.success ? "CONNECTED" : "ERROR", req.user.companyId, "go_upc"]
      );
    }
    await writeAudit?.(req.user.companyId, req.user.id, "global_product_provider_tested", "global_product_provider", providerKey, {
      success: result.success, code: result.code || null,
    });
    res.status(result.success ? 200 : 400).json(result);
  });

  return router;
}