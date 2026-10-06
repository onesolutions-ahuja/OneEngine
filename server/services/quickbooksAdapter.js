import { createHash } from "node:crypto";

const OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE_URLS = Object.freeze({
  production: "https://quickbooks.api.intuit.com",
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
});

function requiredString(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}

export function quickBooksRequestId(companyId, entityType, sourceId) {
  const identity = `${requiredString(companyId, "Company ID")}:${requiredString(entityType, "Entity type")}:${requiredString(sourceId, "Source ID")}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 40);
}

async function readJson(response, provider, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(`${provider} ${operation} failed (${response.status})`);
  if (!body || typeof body !== "object") throw new Error(`${provider} returned an invalid response`);
  return body;
}

export function createQuickBooksAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  async function requestToken(form, { clientId, clientSecret }) {
    const id = requiredString(clientId, "QuickBooks client ID");
    const secret = requiredString(clientSecret, "QuickBooks client secret");
    let response;
    try {
      response = await fetchImpl(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form),
      });
    } catch {
      throw new Error("QuickBooks OAuth request failed");
    }
    const tokens = await readJson(response, "QuickBooks", "OAuth request");
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(Number(tokens.expires_in))) {
      throw new Error("QuickBooks returned incomplete OAuth credentials");
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: Number(tokens.expires_in),
      tokenType: tokens.token_type || "bearer",
    };
  }

  async function exchangeAuthorizationCode({ code, redirectUri, realmId, clientId, clientSecret }) {
    const result = await requestToken({
      grant_type: "authorization_code",
      code: requiredString(code, "QuickBooks authorization code"),
      redirect_uri: requiredString(redirectUri, "QuickBooks redirect URI"),
    }, { clientId, clientSecret });
    return { ...result, realmId: requiredString(realmId, "QuickBooks company ID") };
  }

  async function refreshAuthentication({ refreshToken, clientId, clientSecret }) {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: requiredString(refreshToken, "QuickBooks refresh token"),
    }, { clientId, clientSecret });
  }

  async function apiRequest({ environment, realmId, accessToken, path, method = "GET", body }) {
    const baseUrl = API_BASE_URLS[environment];
    if (!baseUrl) throw new Error("QuickBooks environment must be production or sandbox");
    const companyId = requiredString(realmId, "QuickBooks company ID");
    if (!/^\d+$/.test(companyId)) throw new Error("QuickBooks company ID is invalid");
    const apiPath = String(path || "");
    if (!apiPath.startsWith(`/v3/company/${companyId}/`) || apiPath.includes("..")) {
      throw new Error("QuickBooks API path is invalid");
    }
    const token = requiredString(accessToken, "QuickBooks access token");
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${apiPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("QuickBooks API request failed");
    }
    return readJson(response, "QuickBooks", "API request");
  }

  async function entityRequest({ environment, realmId, accessToken, resource, method = "GET", body, query = null, requestId = null }) {
    const companyId = requiredString(realmId, "QuickBooks company ID");
    if (!/^\d+$/.test(companyId)) throw new Error("QuickBooks company ID is invalid");
    const params = new URLSearchParams();
    if (query) params.set("query", String(query));
    if (requestId) params.set("requestid", String(requestId).slice(0, 50));
    const suffix = params.size ? `?${params}` : "";
    const resourceName = String(resource || "").trim();
    const path = resourceName === "query"
      ? `/v3/company/${companyId}/query${suffix}`
      : `/v3/company/${companyId}/${resourceName}${suffix}`;
    return apiRequest({ environment, realmId: companyId, accessToken, path, method, body });
  }

  async function testConnection(connection) {
    const companyId = requiredString(connection?.realmId, "QuickBooks company ID");
    const body = await apiRequest({
      ...connection,
      path: `/v3/company/${companyId}/companyinfo/${companyId}`,
    });
    const company = body?.CompanyInfo;
    if (!company) throw new Error("QuickBooks company information was not returned");
    return { connected: true, companyId, companyName: String(company.CompanyName || "") };
  }

  return Object.freeze({
    exchangeAuthorizationCode,
    refreshAuthentication,
    apiRequest,
    entityRequest,
    testConnection,
  });
}