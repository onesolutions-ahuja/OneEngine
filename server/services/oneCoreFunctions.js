import { resolveBindingTree } from "./platformRecordPaths.js";
import { decryptCredentials, redactHeadersForLog, redactValue } from "./integrationCredentials.js";

const ALLOWED_METHODS = new Set(["GET","POST","PUT","PATCH","DELETE"]);
const SECRET_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i;
const OAUTH_CLIENT_CREDENTIALS_CACHE = new Map();

function interpolate(value, variables = {}) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const resolved = String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], variables);
    return resolved == null ? "" : encodeURIComponent(String(resolved));
  });
}

function interpolatePayload(value, variables = {}) {
  if (Array.isArray(value)) return value.map((item) => interpolatePayload(item, variables));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolatePayload(item, variables)]));
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const resolved = String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], variables);
    return resolved == null ? "" : String(resolved);
  });
}

function safeBaseUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("ONE_HTTP_REQUEST requires an HTTPS provider base URL");
  if (["localhost","127.0.0.1","::1"].includes(url.hostname.toLowerCase())) throw new Error("ONE_HTTP_REQUEST cannot call a local endpoint");
  return url;
}

async function applyAuth(headers, authType, credentials, { connectionId = null, operations = [], configuration = {} } = {}) {
  const type = String(authType || "none").toLowerCase();
  if (type === "none") return;
  if (type === "oauth2_client_credentials") {
    const existingToken = credentials?.accessToken || credentials?.access_token || credentials?.token;
    if (existingToken) { headers.Authorization = `Bearer ${existingToken}`; return; }
    const auth = (Array.isArray(operations) ? operations : []).find((entry) => entry?.key === "oauth_client_credentials") || {};
    const clientId = credentials?.clientId || credentials?.client_id;
    const clientSecret = credentials?.clientSecret || credentials?.client_secret;
    const tokenUrl = auth.tokenUrls?.[configuration?.environment] || auth.tokenUrl;
    if (!clientId || !clientSecret || !tokenUrl) throw new Error("Provider connection is missing OAuth client credentials metadata");
    const cacheKey = `${connectionId || "connection"}:${auth.scope || ""}`;
    let cached = OAUTH_CLIENT_CREDENTIALS_CACHE.get(cacheKey);
    if (!cached || cached.expiresAt <= Date.now() + 60000) {
      const tokenResponse = await fetch(String(tokenUrl), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: String(clientId), client_secret: String(clientSecret), ...(auth.scope ? { scope: String(auth.scope) } : {}) }) });
      const tokenBody = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenBody?.access_token) throw new Error(`Provider OAuth token request failed (${tokenResponse.status})`);
      cached = { token: String(tokenBody.access_token), expiresAt: Date.now() + Math.max(60, Number(tokenBody.expires_in || 3600) - 60) * 1000 };
      OAUTH_CLIENT_CREDENTIALS_CACHE.set(cacheKey, cached);
    }
    headers.Authorization = `Bearer ${cached.token}`;
    return;
  }
  if (type === "bearer" || type === "oauth2") {
    const token = credentials?.accessToken || credentials?.access_token || credentials?.token;
    if (!token) throw new Error("Provider connection is missing its access token");
    headers.Authorization = `Bearer ${token}`;
    return;
  }
  if (type === "api_key") {
    const token = credentials?.apiKey || credentials?.api_key || credentials?.token;
    if (!token) throw new Error("Provider connection is missing its API key");
    headers[String(credentials?.headerName || credentials?.header_name || "X-API-Key")] = token;
    return;
  }
  throw new Error(`Unsupported provider auth type: ${authType}`);
}

export async function oneHttpRequest({ db, companyId, storeId = null, providerKey, method = "GET", endpoint = "/", headers = {}, body = null, query = {}, variables = {}, timeoutMs = null }) {
  if (!db || typeof db !== "function") throw new Error("ONE_HTTP_REQUEST requires database context");
  if (!companyId) throw new Error("ONE_HTTP_REQUEST requires company context");
  if (!providerKey) throw new Error("ONE_HTTP_REQUEST requires providerKey");

  // Flow HTTP resolves the tenant's generic API connection directly.
  // Connector/package definitions are install-time/UI metadata and are not a runtime dependency.
  const connectionResult = await db(
    `SELECT id,base_url,auth_type,credentials_encrypted,connector_configuration
       FROM integration_connections
      WHERE company_id=$1 AND enabled=true
        AND LOWER(provider_name)=LOWER($2)
        AND (store_id IS NULL OR store_id=$3)
      ORDER BY (store_id IS NULL),updated_at DESC
      LIMIT 1`,
    [companyId, providerKey, storeId]
  );
  const connection = connectionResult.rows?.[0] || null;
  if (!connection) throw new Error(`API connection metadata not found: ${providerKey}`);
  let credentials = {};
  if (connection?.credentials_encrypted) credentials = decryptCredentials(connection.credentials_encrypted) || {};

  const base = safeBaseUrl(connection.base_url);
  const connectionVariables = { ...(connection?.connector_configuration || {}), realmId: connection?.connector_configuration?.realmId || credentials?.realmId || credentials?.realm_id || credentials?.companyId || credentials?.company_id || "" };
  const renderedEndpoint = interpolate(endpoint || "/", { ...connectionVariables, ...(variables || {}) });
  const absoluteEndpoint = /^https?:\/\//i.test(renderedEndpoint);
  const url = absoluteEndpoint
    ? new URL(renderedEndpoint)
    : new URL(renderedEndpoint.replace(/^\/+/, ""), base.toString().replace(/\/$/, "") + "/");
  if (url.origin !== base.origin) throw new Error("ONE_HTTP_REQUEST endpoint must remain on the configured provider host");

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, interpolate(String(value), { ...connectionVariables, ...(variables || {}) }));
  }

  const requestMethod = String(method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(requestMethod)) throw new Error(`Unsupported HTTP method: ${requestMethod}`);
  const requestHeaders = { Accept: "application/json", ...headers };
  const effectiveAuthType = String(connection.auth_type || "none").toLowerCase();
  const connectionConfiguration = connection.connector_configuration || {};
  const oauthOperation = {
    key: "oauth_client_credentials",
    tokenUrl: connectionConfiguration.tokenUrl || connectionConfiguration.token_url || null,
    tokenUrls: connectionConfiguration.tokenUrls || connectionConfiguration.token_urls || {},
    scope: connectionConfiguration.scope || connectionConfiguration.oauthScope || connectionConfiguration.oauth_scope || "",
  };
  await applyAuth(requestHeaders, effectiveAuthType, credentials, {
    connectionId: connection.id,
    operations: effectiveAuthType === "oauth2_client_credentials" ? [oauthOperation] : [],
    configuration: connectionConfiguration,
  });
  const effectiveTimeout = Math.max(100, Math.min(120000, Number(timeoutMs || 15000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const init = { method: requestMethod, headers: requestHeaders, signal: controller.signal };
    if (body !== null && body !== undefined && !["GET"].includes(requestMethod)) {
      init.headers["Content-Type"] ||= "application/json";
      const renderedBody = interpolatePayload(body, { ...connectionVariables, ...(variables || {}) });
      init.body = typeof renderedBody === "string" ? renderedBody : JSON.stringify(renderedBody);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    const safeData = redactValue(data);
    const providerMessageId = data?.messages?.[0]?.id || data?.id || null;
    console.info("Provider HTTP request completed", {
      providerKey,
      method: requestMethod,
      statusCode: response.status,
      success: response.ok,
      providerMessageId: providerMessageId ? String(providerMessageId) : null,
    });
    return {
      status: "completed",
      success: response.ok,
      statusCode: response.status,
      data: safeData,
      providerMessageId: providerMessageId ? String(providerMessageId) : null,
      request: { providerKey, method: requestMethod, endpoint: renderedEndpoint, headers: redactHeadersForLog(requestHeaders) },
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Provider request timed out after ${effectiveTimeout}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
    credentials = {};
  }
}

export function oneHttpRequestDefinition() {
  return {
    key: "ONE_HTTP_REQUEST",
    displayName: "ONE - HTTP Request",
    description: "Execute a provider API request using connection metadata; endpoint and request remain workflow-configurable.",
    schema: {
      type: "object",
      properties: {
        providerKey: { type: "string", title: "Provider" },
        method: { type: "string", title: "Method", enum: ["GET","POST","PUT","PATCH","DELETE"] },
        endpoint: { type: "string", title: "Endpoint" },
        headers: { type: "object", title: "Headers" },
        query: { type: "object", title: "Query" },
        body: { title: "Body" },
        variables: { type: "object", title: "Template variables" },
        timeoutMs: { type: "number", title: "Timeout (ms)" },
        requireSuccess: { type: "boolean", title: "Fail Flow on HTTP Error" },
      },
      required: ["providerKey","endpoint"],
    },
    validation: (action) => {
      if (!String(action?.providerKey || "").trim()) throw new Error("ONE_HTTP_REQUEST requires a Provider");
      if (!String(action?.endpoint || "").trim()) throw new Error("ONE_HTTP_REQUEST requires an Endpoint");
      if (action?.url) throw new Error("ONE_HTTP_REQUEST uses provider metadata plus Endpoint; direct URL is not allowed");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ db, companyId, storeId, req, action, workflowVariables = {}, record = {} }) => {
      const result = await oneHttpRequest({
      db,
      companyId: companyId || req?.user?.companyId,
      storeId: storeId || req?.user?.storeId || null,
      providerKey: action.providerKey,
      method: action.method,
      endpoint: action.endpoint,
      headers: action.headers || {},
      body: resolveBindingTree(action.body, { record, user: req?.user || null, variables: workflowVariables }),
      query: resolveBindingTree(action.query || {}, { record, user: req?.user || null, variables: workflowVariables }),
      variables: {
        ...(record || {}),
        ...(workflowVariables?.variables || {}),
        input: workflowVariables?.input || {},
        ...resolveBindingTree(action.variables || {}, { record, user: req?.user || null, variables: workflowVariables }),
      },
      timeoutMs: action.timeoutMs,
      });
      if (action.requireSuccess === true && result?.success === false) {
        const error = new Error(`Provider request failed with HTTP ${result.statusCode || "error"}`);
        error.providerResult = result;
        throw error;
      }
      return result;
    },
  };
}
