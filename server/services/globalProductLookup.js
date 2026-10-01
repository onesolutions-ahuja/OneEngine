import { decryptCredentials } from "./integrationCredentials.js";
import { getCompanyEntitlements, isPackageLicensed } from "./licensing.js";
import {
  createGoUpcAdapter,
  createOpenFoodFactsAdapter,
  normalizeProductBarcode,
  ProductProviderError,
} from "./globalProductProviderAdapters.js";

const PROVIDER_ADAPTERS = Object.freeze({
  open_food_facts: createOpenFoodFactsAdapter,
  go_upc: createGoUpcAdapter,
});
const CONFIG_KEYS = Object.freeze({
  open_food_facts: "global_product_lookup_open_food_facts",
  go_upc: "global_product_lookup_go_upc",
});
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  priority: 100,
  timeoutMs: 5000,
  fallbackEnabled: true,
  cacheTtlSeconds: 5,
});
const MAX_CACHE_ENTRIES = 500;

function objectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function positiveNumber(value, fallback, max) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : fallback;
}

export async function discoverGlobalProductProviders({ db, companyId }) {
  if (!db || typeof db !== "function" || !companyId) return [];
  const packagesResult = await db(
    `SELECT p.package_key,p.name,p.version,p.package_type,p.licence_mode,p.manifest,
            i.status AS installation_status,i.suspended_by_entitlement,i.deactivated_by_user
       FROM package_registry p
       LEFT JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=$1
      WHERE p.active=true AND p.package_key=ANY($2::text[])
      ORDER BY p.name`,
    [companyId, Object.keys(CONFIG_KEYS).map((key) => key === "open_food_facts" ? "open_food_facts" : "go_upc")]
  );
  const entitlements = await getCompanyEntitlements(db, companyId);
  const configsResult = await db(
    `SELECT provider,configuration,active FROM integrations
      WHERE company_id=$1 AND provider=ANY($2::text[])`,
    [companyId, Object.values(CONFIG_KEYS)]
  );
  const configs = new Map((configsResult.rows || []).map((row) => [row.provider, row]));
  const providers = [];

  for (const row of packagesResult.rows || []) {
    const connector = objectValue(row.manifest).providerConnector?.globalProductLookup;
    const providerKey = String(connector?.providerKey || "");
    const configKey = String(connector?.configKey || "");
    if (!PROVIDER_ADAPTERS[providerKey] || !configKey || CONFIG_KEYS[providerKey] !== configKey) continue;
    const installed = row.installation_status === "active" && row.suspended_by_entitlement !== true && row.deactivated_by_user !== true;
    const licensed = isPackageLicensed(entitlements, {
      package_key: row.package_key,
      package_type: row.package_type,
      licence_mode: row.licence_mode,
      manifest: objectValue(row.manifest),
    });
    if (!installed || !licensed) continue;
    const stored = configs.get(configKey);
    const settings = { ...DEFAULT_CONFIG, ...connector.settings, ...objectValue(stored?.configuration) };
    const active = stored?.active !== false;
    providers.push({
      providerKey,
      packageKey: row.package_key,
      displayName: connector.displayName || row.name,
      configKey,
      settings: {
        ...settings,
        enabled: active && settings.enabled !== false,
        priority: Number.isFinite(Number(settings.priority)) ? Number(settings.priority) : DEFAULT_CONFIG.priority,
        timeoutMs: positiveNumber(settings.timeoutMs, DEFAULT_CONFIG.timeoutMs, 30000),
        cacheTtlSeconds: Math.max(0, Math.min(Number(settings.cacheTtlSeconds) || 0, 86400)),
      },
      metadata: connector,
    });
  }

  providers.sort((left, right) => left.settings.priority - right.settings.priority || left.displayName.localeCompare(right.displayName));
  return providers;
}

export function createGlobalProductLookupService({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();

  async function fetchForProvider({ provider, barcode, companyId, credentials }) {
    const ttl = provider.settings.cacheTtlSeconds * 1000;
    const key = `${companyId}:${provider.providerKey}:${barcode}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;
    if (cached) cache.delete(key);
    if (pending.has(key)) return pending.get(key);

    const adapter = PROVIDER_ADAPTERS[provider.providerKey]({ fetchImpl });
    const task = adapter.lookup({
      barcode,
      apiKey: credentials?.apiKey,
      config: {
        ...provider.metadata,
        ...provider.settings,
        lookupEndpoint: provider.metadata.lookupEndpoint,
        baseUrl: provider.settings.baseUrl || provider.metadata.baseUrl,
      },
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    const value = await task;
    if (ttl > 0) {
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expiresAt: now() + ttl });
    }
    return value;
  }

  async function lookup({ db, companyId, barcode: input, reqCompanyId = null, providerKey = null }) {
    if (!companyId || (reqCompanyId && String(reqCompanyId) !== String(companyId))) {
      throw new ProductProviderError("Product lookup company context is invalid", { code: "INVALID_COMPANY", retryable: false });
    }
    const barcode = normalizeProductBarcode(input);
    const providers = (await discoverGlobalProductProviders({ db, companyId })).filter((provider) =>
      provider.settings.enabled && (!providerKey || provider.providerKey === providerKey)
    );
    if (!providers.length) return { status: "no_provider", barcode, product: null, triedProviders: [], providerErrors: [] };

    const triedProviders = [];
    const providerErrors = [];
    for (const provider of providers) {
      triedProviders.push(provider.providerKey);
      let credentials = null;
      if (provider.providerKey === "go_upc") {
        const result = await db(
          `SELECT id,credentials_encrypted FROM integration_connections
            WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND enabled=true
              AND store_id IS NULL
            ORDER BY updated_at DESC LIMIT 1`,
          [companyId, "go_upc"]
        );
        try { credentials = decryptCredentials(result.rows?.[0]?.credentials_encrypted); }
        catch { credentials = null; }
      }
      try {
        const result = await fetchForProvider({ provider, barcode, companyId, credentials });
        if (result.status === "found") {
          return { status: "found", barcode, product: result.product, triedProviders, providerErrors };
        }
        if (!provider.settings.fallbackEnabled) break;
      } catch (error) {
        providerErrors.push({ provider: provider.providerKey, code: error?.code || "PROVIDER_ERROR" });
        if (!provider.settings.fallbackEnabled) break;
      }
    }

    return {
      status: providerErrors.length ? "unavailable" : "not_found",
      barcode,
      product: null,
      triedProviders,
      providerErrors,
    };
  }

  async function search({ db, companyId, query: input, reqCompanyId = null, page = 1, pageSize = 20 }) {
    if (!companyId || (reqCompanyId && String(reqCompanyId) !== String(companyId))) {
      throw new ProductProviderError("Product lookup company context is invalid", { code: "INVALID_COMPANY", retryable: false });
    }
    const query = String(input || "").trim().replace(/\s+/g, " ");
    if (query.length < 2 || query.length > 120) {
      throw new ProductProviderError("Search text must be between 2 and 120 characters", { code: "INVALID_SEARCH", retryable: false });
    }

    const providers = (await discoverGlobalProductProviders({ db, companyId }))
      .filter((provider) => provider.settings.enabled);
    const triedProviders = [];
    const providerErrors = [];

    for (const provider of providers) {
      const adapter = PROVIDER_ADAPTERS[provider.providerKey]({ fetchImpl });
      if (typeof adapter.search !== "function") continue;
      triedProviders.push(provider.providerKey);
      try {
        const result = await adapter.search({
          query,
          page,
          pageSize,
          config: {
            ...provider.metadata,
            ...provider.settings,
            baseUrl: provider.settings.baseUrl || provider.metadata.baseUrl,
          },
        });
        if (result.status === "found") {
          return { ...result, query, triedProviders, providerErrors, scope: "worldwide" };
        }
        if (!provider.settings.fallbackEnabled) break;
      } catch (error) {
        providerErrors.push({ provider: provider.providerKey, code: error?.code || "PROVIDER_ERROR" });
        if (!provider.settings.fallbackEnabled) break;
      }
    }

    return {
      status: providerErrors.length ? "unavailable" : "not_found",
      query,
      products: [],
      count: 0,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Math.min(Number(pageSize) || 20, 40)),
      triedProviders,
      providerErrors,
      scope: "worldwide",
    };
  }

  return { lookup, search };
}

export async function testGlobalProductProvider({ db, companyId, providerKey, fetchImpl = globalThis.fetch }) {
  if (!PROVIDER_ADAPTERS[providerKey]) {
    return { success: false, code: "UNKNOWN_PROVIDER", message: "Unknown product lookup provider" };
  }
  const providers = await discoverGlobalProductProviders({ db, companyId });
  const provider = providers.find((candidate) => candidate.providerKey === providerKey);
  if (!provider) {
    return { success: false, code: "NOT_AVAILABLE", message: "Provider app must be installed, enabled and licensed before it can be tested" };
  }
  let credentials = null;
  if (providerKey === "go_upc") {
    const result = await db(
      `SELECT credentials_encrypted FROM integration_connections
        WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND enabled=true AND store_id IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
      [companyId, "go_upc"]
    );
    try { credentials = decryptCredentials(result.rows?.[0]?.credentials_encrypted); }
    catch { credentials = null; }
  }
  try {
    const adapter = PROVIDER_ADAPTERS[providerKey]({ fetchImpl });
    const result = await adapter.testConnection({
      config: { ...provider.metadata, ...provider.settings, baseUrl: provider.settings.baseUrl || provider.metadata.baseUrl },
      apiKey: credentials?.apiKey,
    });
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      code: error?.code || "PROVIDER_ERROR",
      message: "Unable to verify the product lookup provider. Review its settings and retry.",
    };
  }
}

export const globalProductProviderConfigKeys = CONFIG_KEYS;
export const globalProductProviderDefaults = DEFAULT_CONFIG;