const DEFAULT_TIMEOUT_MS = 5000;
const BARCODE_RE = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;

export class ProductProviderError extends Error {
  constructor(message, { code = "PROVIDER_ERROR", status = null, retryable = true } = {}) {
    super(message);
    this.name = "ProductProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function normalizeProductBarcode(value) {
  const barcode = String(value || "").trim().replace(/[\s-]/g, "");
  if (!BARCODE_RE.test(barcode)) {
    throw new ProductProviderError("Barcode must contain 8, 12, 13 or 14 digits", {
      code: "INVALID_BARCODE",
      retryable: false,
    });
  }
  return barcode;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? null;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function mappedValue(product, mappings, canonicalField) {
  const path = mappings?.[canonicalField];
  if (typeof path !== "string" || !path.trim()) return null;
  return path.split(".").reduce((value, part) => value?.[part], product) ?? null;
}

export function normalizeExternalProduct(product = {}, { provider, barcode, referenceId = null, fieldMappings = {} } = {}) {
  const normalizedBarcode = normalizeProductBarcode(firstValue(
    mappedValue(product, fieldMappings, "barcode"), product.code, product.barcode, product.gtin, product.ean, barcode
  ));
  const categories = normalizeList(firstValue(
    mappedValue(product, fieldMappings, "category"), product.categories_tags, product.categories, product.category
  ));
  const countries = normalizeList(firstValue(
    mappedValue(product, fieldMappings, "country"), product.countries_tags, product.countries, product.country
  ));
  const name = firstValue(
    mappedValue(product, fieldMappings, "name"), product.product_name, product.product_name_en, product.name, product.title
  );
  if (!name) return null;

  return {
    barcode: normalizedBarcode,
    gtin: normalizedBarcode,
    name: String(name).trim(),
    brand: firstValue(mappedValue(product, fieldMappings, "brand"), product.brands, product.brand),
    description: firstValue(mappedValue(product, fieldMappings, "description"), product.description, product.long_description),
    category: categories[0] || null,
    categories,
    variant: firstValue(mappedValue(product, fieldMappings, "variant"), product.variant, product.flavour, product.flavor),
    quantity: firstValue(mappedValue(product, fieldMappings, "quantity"), product.quantity, product.pack_size, product.package_size),
    imageUrl: firstValue(mappedValue(product, fieldMappings, "imageUrl"), product.image_front_url, product.image_url, product.image, product.thumbnail),
    country: countries[0] || null,
    countries,
    manufacturer: firstValue(product.manufacturing_places, product.manufacturer),
    sourceProvider: provider,
    providerReferenceId: firstValue(referenceId, product.id, product.code, product.barcode),
  };
}

async function requestJson(fetchImpl, url, { headers, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw new ProductProviderError("The provider did not respond before the timeout.", { code: "TIMEOUT" });
      }
      throw new ProductProviderError("The provider could not be reached.", { code: "PROVIDER_UNAVAILABLE" });
    }

    if (response.status === 404) return null;

    let errorPayload = null;
    if (!response.ok) {
      try { errorPayload = await response.clone().json(); } catch {}
    }
    const upstreamCode = String(errorPayload?.error?.code || errorPayload?.code || "").trim();
    const upstreamMessage = String(errorPayload?.error?.message || errorPayload?.message || "").trim();

    if (response.status === 401 || response.status === 403) {
      throw new ProductProviderError(upstreamMessage || "The provider rejected the configured API credentials.", {
        code: upstreamCode || "INVALID_CREDENTIALS", status: response.status, retryable: false,
      });
    }
    if (response.status === 429) {
      const quota = /usage|quota|limit/i.test(upstreamCode) ? upstreamCode : "RATE_LIMITED";
      throw new ProductProviderError(upstreamMessage || "The provider API usage or rate limit has been reached.", {
        code: quota, status: 429,
      });
    }
    if (!response.ok) {
      throw new ProductProviderError(upstreamMessage || `The provider returned HTTP ${response.status}.`, {
        code: upstreamCode || "PROVIDER_ERROR", status: response.status, retryable: response.status >= 500,
      });
    }
    try {
      return await response.json();
    } catch {
      throw new ProductProviderError("The provider returned data that OneEngine could not read.", {
        code: "INVALID_RESPONSE", status: response.status,
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

function providerUrl(baseUrl, endpoint, barcode, allowedHostSuffix) {
  const base = new URL(baseUrl);
  if (base.protocol !== "https:" || !(base.hostname === allowedHostSuffix || base.hostname.endsWith(`.${allowedHostSuffix}`))) {
    throw new ProductProviderError("Configured provider URL is not permitted", { code: "INVALID_PROVIDER_URL", retryable: false });
  }
  return `${base.origin}${endpoint.replace("{barcode}", encodeURIComponent(barcode))}`;
}

export function createOpenFoodFactsAdapter({ fetchImpl = globalThis.fetch } = {}) {
  const headersFor = (config) => ({
    Accept: "application/json",
    "User-Agent": String(config.userAgent || "onePOS/1.0 (product lookup; support@onesolutions.example)").slice(0, 200),
  });

  return {
    async lookup({ barcode: input, config = {} }) {
      const barcode = normalizeProductBarcode(input);
      const baseUrl = config.baseUrl || "https://world.openfoodfacts.org";
      const endpoint = config.lookupEndpoint || "/api/v2/product/{barcode}.json";
      const base = providerUrl(baseUrl, endpoint, barcode, "openfoodfacts.org");
      const url = new URL(base);
      // The world endpoint is intentionally not country-filtered. product_type=all
      // lets barcode lookups follow Open Food Facts' cross-product-type routing.
      url.searchParams.set("product_type", "all");
      url.searchParams.set("fields", "code,product_name,product_name_en,brands,categories,categories_tags,quantity,image_front_url,countries,countries_tags,manufacturing_places");
      const payload = await requestJson(fetchImpl, url.toString(), {
        timeoutMs: Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS,
        headers: headersFor(config),
      });
      if (!payload || payload.status === 0 || !payload.product) return { status: "not_found" };
      const product = normalizeExternalProduct(payload.product, {
        provider: "open_food_facts", barcode, referenceId: payload.product.code, fieldMappings: config.fieldMappings,
      });
      return product ? { status: "found", product } : { status: "not_found" };
    },

    async search({ query: input, config = {}, page = 1, pageSize = 20 } = {}) {
      const query = String(input || "").trim().replace(/\s+/g, " ");
      if (query.length < 2 || query.length > 120) {
        throw new ProductProviderError("Search text must be between 2 and 120 characters", {
          code: "INVALID_SEARCH", retryable: false,
        });
      }
      const base = new URL(config.baseUrl || "https://world.openfoodfacts.org");
      if (base.protocol !== "https:" || !(base.hostname === "openfoodfacts.org" || base.hostname.endsWith(".openfoodfacts.org"))) {
        throw new ProductProviderError("Configured provider URL is not permitted", { code: "INVALID_PROVIDER_URL", retryable: false });
      }
      // Official documentation currently directs plain-text search to the
      // legacy CGI search endpoint. No country filter is supplied: results are worldwide.
      const url = new URL("/cgi/search.pl", base.origin);
      url.searchParams.set("search_terms", query);
      url.searchParams.set("search_simple", "1");
      url.searchParams.set("action", "process");
      url.searchParams.set("json", "1");
      url.searchParams.set("page", String(Math.max(1, Number(page) || 1)));
      url.searchParams.set("page_size", String(Math.max(1, Math.min(Number(pageSize) || 20, 40))));
      url.searchParams.set("fields", "code,product_name,product_name_en,brands,categories,categories_tags,quantity,image_front_url,countries,countries_tags,manufacturing_places");
      const payload = await requestJson(fetchImpl, url.toString(), {
        timeoutMs: Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS,
        headers: headersFor(config),
      });
      const products = (Array.isArray(payload?.products) ? payload.products : [])
        .map((item) => {
          try {
            return normalizeExternalProduct(item, {
              provider: "open_food_facts",
              barcode: item?.code,
              referenceId: item?.code,
              fieldMappings: config.fieldMappings,
            });
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return {
        status: products.length ? "found" : "not_found",
        products,
        count: Number(payload?.count) || products.length,
        page: Number(payload?.page) || Math.max(1, Number(page) || 1),
        pageSize: Number(payload?.page_size) || Math.max(1, Math.min(Number(pageSize) || 20, 40)),
      };
    },

    async testConnection({ config = {} } = {}) {
      const result = await this.lookup({ barcode: "737628064502", config });
      return { connected: true, sampleFound: result.status === "found", scope: "worldwide" };
    },
  };
}

export function createUpcItemDbAdapter({ fetchImpl = globalThis.fetch } = {}) {
  const baseFor = (config) => {
    const base = new URL(config.baseUrl || "https://api.upcitemdb.com");
    if (base.protocol !== "https:" || !(base.hostname === "upcitemdb.com" || base.hostname.endsWith(".upcitemdb.com"))) {
      throw new ProductProviderError("Configured UPCitemdb URL is not permitted", { code: "INVALID_PROVIDER_URL", retryable: false });
    }
    return base.origin;
  };
  const headersFor = (apiKey) => ({
    Accept: "application/json",
    ...(apiKey ? { user_key: String(apiKey).trim(), key_type: "3scale" } : {}),
  });
  const endpointFor = (config, apiKey, kind) => {
    if (kind === "search") return apiKey ? (config.paidSearchEndpoint || "/prod/v1/search") : (config.searchEndpoint || "/prod/trial/search");
    return apiKey ? (config.paidLookupEndpoint || "/prod/v1/lookup") : (config.lookupEndpoint || "/prod/trial/lookup");
  };
  return {
    async lookup({ barcode: input, config = {}, apiKey = null }) {
      const barcode = normalizeProductBarcode(input);
      const url = new URL(endpointFor(config, apiKey, "lookup"), baseFor(config));
      url.searchParams.set("upc", barcode);
      const payload = await requestJson(fetchImpl, url.toString(), {
        timeoutMs: Number(config.timeoutMs) || 7000,
        headers: headersFor(apiKey),
      });
      const item = Array.isArray(payload?.items) ? payload.items[0] : null;
      if (!payload || !item) return { status: "not_found" };
      const product = normalizeExternalProduct(item, {
        provider: "upcitemdb", barcode, referenceId: item.ean || item.upc || item.gtin, fieldMappings: config.fieldMappings,
      });
      return product ? { status: "found", product } : { status: "not_found" };
    },
    async search({ query: input, config = {}, apiKey = null, page = 1, pageSize = 20 } = {}) {
      const query = String(input || "").trim().replace(/\s+/g, " ");
      if (query.length < 2 || query.length > 120) {
        throw new ProductProviderError("Search text must be between 2 and 120 characters", { code: "INVALID_SEARCH", retryable: false });
      }
      const url = new URL(endpointFor(config, apiKey, "search"), baseFor(config));
      url.searchParams.set("s", query);
      url.searchParams.set("type", "product");
      url.searchParams.set("match_mode", "0");
      url.searchParams.set("offset", String(Math.max(0, (Math.max(1, Number(page) || 1) - 1) * Math.min(10, Number(pageSize) || 10))));
      const payload = await requestJson(fetchImpl, url.toString(), {
        timeoutMs: Number(config.timeoutMs) || 7000,
        headers: headersFor(apiKey),
      });
      const products = (Array.isArray(payload?.items) ? payload.items : []).map((item) => {
        try {
          return normalizeExternalProduct(item, {
            provider: "upcitemdb",
            barcode: item?.ean || item?.upc || item?.gtin,
            referenceId: item?.ean || item?.upc || item?.gtin,
            fieldMappings: config.fieldMappings,
          });
        } catch { return null; }
      }).filter(Boolean);
      return {
        status: products.length ? "found" : "not_found",
        products,
        count: Number(payload?.total) || products.length,
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(10, Number(pageSize) || 10),
      };
    },
    async testConnection({ config = {}, apiKey = null } = {}) {
      const result = await this.lookup({ barcode: "4006381333931", config, apiKey });
      return { connected: true, sampleFound: result.status === "found", planMode: apiKey ? "paid-key" : "free" };
    },
  };
}

export function createBarcodeNestAdapter({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async lookup({ barcode: input, config = {}, apiKey }) {
      const barcode = normalizeProductBarcode(input);
      if (!apiKey || !String(apiKey).trim()) {
        throw new ProductProviderError("BarcodeNest API key is not configured.", { code: "NOT_CONFIGURED", retryable: false });
      }
      const url = providerUrl(config.baseUrl || "https://api.barcodenest.com", config.lookupEndpoint || "/v1/products/{barcode}", barcode, "barcodenest.com");
      const payload = await requestJson(fetchImpl, url, {
        timeoutMs: Number(config.timeoutMs) || 7000,
        headers: { Accept: "application/json", "X-API-Key": String(apiKey).trim() },
      });
      if (!payload || payload.found === false || !payload.product) return { status: "not_found" };
      const sourceProduct = {
        ...payload.product,
        barcode: payload.barcode || barcode,
      };
      const product = normalizeExternalProduct(sourceProduct, {
        provider: "barcode_nest",
        barcode,
        referenceId: payload?.source?.source_id || payload.barcode,
        fieldMappings: config.fieldMappings,
      });
      return product ? { status: "found", product } : { status: "not_found" };
    },
    async testConnection({ config = {}, apiKey } = {}) {
      if (!apiKey || !String(apiKey).trim()) {
        throw new ProductProviderError("BarcodeNest API key is not configured.", { code: "NOT_CONFIGURED", retryable: false });
      }
      const result = await this.lookup({ barcode: "3017620422003", config, apiKey });
      return { connected: true, sampleFound: result.status === "found" };
    },
  };
}

export function createGoUpcAdapter({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async lookup({ barcode: input, config = {}, apiKey }) {
      const barcode = normalizeProductBarcode(input);
      if (!apiKey || !String(apiKey).trim()) {
        throw new ProductProviderError("Go-UPC API key is not configured", { code: "NOT_CONFIGURED", retryable: false });
      }
      const baseUrl = config.baseUrl || "https://go-upc.com";
      const endpoint = config.lookupEndpoint || "/api/v1/code/{barcode}";
      const url = providerUrl(baseUrl, endpoint, barcode, "go-upc.com");
      const payload = await requestJson(fetchImpl, url, {
        timeoutMs: Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS,
        headers: { Accept: "application/json", Authorization: `Bearer ${String(apiKey).trim()}` },
      });
      const productData = payload?.product || payload?.data?.product || payload?.data || payload;
      if (!payload || payload?.status === "not_found" || payload?.found === false) return { status: "not_found" };
      const product = normalizeExternalProduct(productData, { provider: "go_upc", barcode, fieldMappings: config.fieldMappings });
      return product ? { status: "found", product } : { status: "not_found" };
    },
    async testConnection({ config = {}, apiKey } = {}) {
      if (!apiKey || !String(apiKey).trim()) {
        throw new ProductProviderError("Go-UPC API key is not configured", { code: "NOT_CONFIGURED", retryable: false });
      }
      const url = providerUrl(config.baseUrl || "https://go-upc.com", config.testEndpoint || "/api/v1/code/737628064502", "737628064502", "go-upc.com");
      const payload = await requestJson(fetchImpl, url, {
        timeoutMs: Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS,
        headers: { Accept: "application/json", Authorization: `Bearer ${String(apiKey).trim()}` },
      });
      return { connected: true, sampleFound: Boolean(payload) };
    },
  };
}