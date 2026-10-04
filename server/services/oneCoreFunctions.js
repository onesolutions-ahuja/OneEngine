import { decryptCredentials, redactHeadersForLog, redactValue } from "./integrationCredentials.js";

const ALLOWED_METHODS = new Set(["GET","POST","PUT","PATCH","DELETE"]);
const SECRET_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i;

function interpolate(value, variables = {}) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const resolved = String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], variables);
    return resolved == null ? "" : encodeURIComponent(String(resolved));
  });
}

function safeBaseUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("ONE_HTTP_REQUEST requires an HTTPS provider base URL");
  if (["localhost","127.0.0.1","::1"].includes(url.hostname.toLowerCase())) throw new Error("ONE_HTTP_REQUEST cannot call a local endpoint");
  return url;
}

function applyAuth(headers, authType, credentials) {
  const type = String(authType || "none").toLowerCase();
  if (type === "none") return;
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

  const definitionResult = await db(
    `SELECT id,connector_key,base_url,auth_type,timeout_ms,status
       FROM platform_connector_definitions
      WHERE LOWER(connector_key)=LOWER($1) AND status='ACTIVE'
      LIMIT 1`,
    [providerKey]
  );
  const definition = definitionResult.rows?.[0];
  if (!definition) throw new Error(`Provider metadata not found: ${providerKey}`);

  const connectionResult = await db(
    `SELECT id,base_url,auth_type,credentials_encrypted,connector_configuration
       FROM integration_connections
      WHERE company_id=$1 AND enabled=true
        AND (LOWER(provider_name)=LOWER($2) OR connector_definition_id=$3)
        AND (store_id IS NULL OR store_id=$4)
      ORDER BY (store_id IS NULL),updated_at DESC
      LIMIT 1`,
    [companyId, providerKey, definition.id, storeId]
  );
  const connection = connectionResult.rows?.[0] || null;
  let credentials = {};
  if (connection?.credentials_encrypted) credentials = decryptCredentials(connection.credentials_encrypted) || {};

  const base = safeBaseUrl(connection?.base_url || definition.base_url);
  const renderedEndpoint = interpolate(endpoint || "/", variables);
  const url = new URL(renderedEndpoint, base.toString().replace(/\/$/, "") + "/");
  if (url.origin !== base.origin) throw new Error("ONE_HTTP_REQUEST endpoint must remain on the configured provider host");

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, interpolate(String(value), variables));
  }

  const requestMethod = String(method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(requestMethod)) throw new Error(`Unsupported HTTP method: ${requestMethod}`);
  const requestHeaders = { Accept: "application/json", ...headers };
  applyAuth(requestHeaders, connection?.auth_type || definition.auth_type, credentials);
  const effectiveTimeout = Math.max(100, Math.min(120000, Number(timeoutMs || definition.timeout_ms || 15000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    const init = { method: requestMethod, headers: requestHeaders, signal: controller.signal };
    if (body !== null && body !== undefined && !["GET"].includes(requestMethod)) {
      init.headers["Content-Type"] ||= "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return {
      status: "completed",
      success: response.ok,
      statusCode: response.status,
      data: redactValue(data),
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
    executor: async ({ db, companyId, storeId, req, action, workflowVariables = {}, record = {} }) => oneHttpRequest({
      db,
      companyId: companyId || req?.user?.companyId,
      storeId: storeId || req?.user?.storeId || null,
      providerKey: action.providerKey,
      method: action.method,
      endpoint: action.endpoint,
      headers: action.headers || {},
      body: action.body,
      query: action.query || {},
      variables: { ...(record || {}), ...(workflowVariables?.variables || {}), input: workflowVariables?.input || {} },
      timeoutMs: action.timeoutMs,
    }),
  };
}
