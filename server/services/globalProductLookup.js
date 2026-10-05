import { decryptCredentials } from "./integrationCredentials.js";
import { getCompanyEntitlements, isPackageLicensed } from "./licensing.js";
import {
  createBarcodeNestAdapter,
  createGoUpcAdapter,
  createOpenFoodFactsAdapter,
  createUpcItemDbAdapter,
  normalizeProductBarcode,
  ProductProviderError,
} from "./globalProductProviderAdapters.js";

const PROVIDER_ADAPTERS = Object.freeze({
  open_food_facts: createOpenFoodFactsAdapter,
  upcitemdb: createUpcItemDbAdapter,
  barcode_nest: createBarcodeNestAdapter,
  go_upc: createGoUpcAdapter,
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
      WHERE p.active=true
        AND p.manifest->'providerConnector'->'globalProductLookup' IS NOT NULL
      ORDER BY p.name`,
    [companyId]
  );
  const entitlements = await getCompanyEntitlements(db, companyId);
  const connectorRows = (packagesResult.rows || [])
    .map((row) => objectValue(row.manifest).providerConnector?.globalProductLookup)
    .filter((connector) => connector && typeof connector === "object" && connector.configKey);
  const configKeys = [...new Set(connectorRows.map((connector) => String(connector.configKey)))];
  const configsResult = configKeys.length
    ? await db(
        `SELECT provider,configuration,active FROM integrations
          WHERE company_id=$1 AND provider=ANY($2::text[])`,
        [companyId, configKeys]
      )
    : { rows: [] };
  const configs = new Map((configsResult.rows || []).map((row) => [row.provider, row]));
  const providers = [];

  for (const row of packagesResult.rows || []) {
    const connector = objectValue(row.manifest).providerConnector?.globalProductLookup;
    const providerKey = String(connector?.providerKey || "");
    const configKey = String(connector?.configKey || "");
    // Adapter implementation stays trusted code; provider identity, configuration
    // key, priority, fallback and cache policy come entirely from package metadata.
    if (!PROVIDER_ADAPTERS[providerKey] || !configKey) continue;
    const installed = row.installation_status === "active" && row.suspended_by_entitlement !== true && row.deactivated_by_user !== true;
    const licensed = isPackageLicensed(entitlements, {
      package_key: row.package_key,
      package_type: row.package_type,
      licence_mode: row.licence_mode,
      manifest: objectValue(row.manifest),
    });
    if (!installed || !licensed) continue;
    const stored = configs.get(configKey);
    const storedSettings = objectValue(stored?.configuration);
    const settings = { ...connector, ...objectValue(connector.settings), ...storedSettings };
    const active = stored?.active !== false;
    const metadataTimeout = positiveNumber(connector.timeoutMs, 5000, 30000);
    providers.push({
      providerKey,
      packageKey: row.package_key,
      displayName: connector.displayName || row.name,
      configKey,
      settings: {
        ...settings,
        enabled: active && settings.enabled !== false,
        priority: Number.isFinite(Number(settings.priority)) ? Number(settings.priority) : Number.MAX_SAFE_INTEGER,
        timeoutMs: positiveNumber(settings.timeoutMs, metadataTimeout, 30000),
        fallbackEnabled: settings.fallbackEnabled === true,
        cacheTtlSeconds: Math.max(0, Math.min(Number(settings.cacheTtlSeconds) || 0, 86400)),
      },
      metadata: connector,
    });
  }

  providers.sort((left, right) => left.settings.priority - right.settings.priority || left.displayName.localeCompare(right.displayName));
  return providers;
}

async function providerCredentials(db, companyId, provider) {
  if (!provider?.metadata || !["bearer","x-api-key","optional_user_key"].includes(provider.metadata.authType)) return null;
  const result = await db(
    `SELECT credentials_encrypted FROM integration_connections
      WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND enabled=true AND store_id IS NULL
      ORDER BY updated_at DESC LIMIT 1`,
    [companyId, provider.providerKey]
  );
  try { return decryptCredentials(result.rows?.[0]?.credentials_encrypted); }
  catch { return null; }
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
      const credentials = await providerCredentials(db, companyId, provider);
      try {
        const result = await fetchForProvider({ provider, barcode, companyId, credentials });
        if (result.status === "found") {
          return { status: "found", barcode, product: result.product, triedProviders, providerErrors };
        }
        if (!provider.settings.fallbackEnabled) break;
      } catch (error) {
        providerErrors.push({ provider: provider.providerKey, code: error?.code || "PROVIDER_ERROR", message: error?.message || "Provider request failed" });
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

  async function search({ db, companyId, query: input, reqCompanyId = null, providerKey = null, page = 1, pageSize = 20 }) {
    if (!companyId || (reqCompanyId && String(reqCompanyId) !== String(companyId))) {
      throw new ProductProviderError("Product lookup company context is invalid", { code: "INVALID_COMPANY", retryable: false });
    }
    const query = String(input || "").trim().replace(/\s+/g, " ");
    if (query.length < 2 || query.length > 120) {
      throw new ProductProviderError("Search text must be between 2 and 120 characters", { code: "INVALID_SEARCH", retryable: false });
    }

    const providers = (await discoverGlobalProductProviders({ db, companyId }))
      .filter((provider) => provider.settings.enabled && (!providerKey || provider.providerKey === providerKey));
    const triedProviders = [];
    const providerErrors = [];

    for (const provider of providers) {
      const adapter = PROVIDER_ADAPTERS[provider.providerKey]({ fetchImpl });
      if (typeof adapter.search !== "function") continue;
      triedProviders.push(provider.providerKey);
      try {
        const credentials = await providerCredentials(db, companyId, provider);
        const result = await adapter.search({
          query,
          page,
          pageSize,
          apiKey: credentials?.apiKey,
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

