import { createHmac, timingSafeEqual } from "node:crypto";

const SHOPIFY_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;
const API_VERSION_RE = /^20\d{2}-(01|04|07|10)$/;

export function verifyShopifyWebhook(rawBody, signature, secret) {
  if ((!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") || !signature || !secret) return false;
  let provided;
  try {
    provided = Buffer.from(String(signature), "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", String(secret)).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function getShopHost(shopDomain) {
  const host = String(shopDomain || "").trim().toLowerCase();
  if (!SHOPIFY_DOMAIN_RE.test(host)) throw new Error("Shopify shop domain must be a myshopify.com host");
  return host;
}

async function readTokenResponse(response, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(`Shopify ${operation} failed (${response.status})`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  if (!body?.access_token || !body?.refresh_token || !Number.isFinite(Number(body.expires_in))) {
    throw new Error(`Shopify ${operation} returned incomplete offline credentials`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Number(body.expires_in),
    refreshTokenExpiresIn: Number(body.refresh_token_expires_in) || null,
    scopes: String(body.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean),
  };
}

export function createShopifyAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  async function exchangeAuthorizationCode({ shopDomain, clientId, clientSecret, code }) {
    const host = getShopHost(shopDomain);
    const id = String(clientId || "").trim();
    const secret = String(clientSecret || "").trim();
    const authorizationCode = String(code || "").trim();
    if (!id || !secret || !authorizationCode) throw new Error("Shopify authorization credentials are incomplete");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/oauth/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, code: authorizationCode, expiring: "1" }),
      });
    } catch {
      throw new Error("Shopify authorization request failed");
    }
    return readTokenResponse(response, "authorization exchange");
  }

  async function refreshAuthentication({ shopDomain, clientId, clientSecret, refreshToken }) {
    const host = getShopHost(shopDomain);
    const id = String(clientId || "").trim();
    const secret = String(clientSecret || "").trim();
    const token = String(refreshToken || "").trim();
    if (!id || !secret || !token) throw new Error("Shopify refresh credentials are incomplete");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/oauth/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: token }),
      });
    } catch {
      const error = new Error("Shopify token refresh request failed");
      error.retryable = true;
      throw error;
    }
    return readTokenResponse(response, "token refresh");
  }

  async function graphqlRequest({ shopDomain, apiVersion = "2026-07", accessToken, query, variables = {} }) {
    const host = getShopHost(shopDomain);
    if (!API_VERSION_RE.test(String(apiVersion || ""))) throw new Error("Shopify API version is invalid");
    const token = String(accessToken || "").trim();
    const document = String(query || "").trim();
    if (!token || !document) throw new Error("Shopify GraphQL credentials and query are required");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: document, variables }),
      });
    } catch {
      const error = new Error("Shopify GraphQL request failed");
      error.retryable = true;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Shopify GraphQL request failed (${response.status})`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    try {
      const result = await response.json();
      if (Array.isArray(result?.errors) && result.errors.length) {
        const error = new Error("Shopify rejected the GraphQL operation");
        error.retryable = result.errors.some((entry) => ["THROTTLED", "INTERNAL_SERVER_ERROR"].includes(entry?.extensions?.code));
        throw error;
      }
      if (!result?.data) throw new Error("Shopify returned an invalid GraphQL response");
      return result.data;
    } catch (error) {
      if (error?.message === "Shopify rejected the GraphQL operation") throw error;
      const failure = new Error("Shopify GraphQL request failed");
      failure.retryable = true;
      throw failure;
    }
  }

  async function testConnection(connection) {
    const data = await graphqlRequest({
      ...connection,
      query: "query OnePosConnectionTest { shop { id name myshopifyDomain currencyCode } }",
    });
    const shop = data?.shop;
    if (!shop) throw new Error("Shopify shop information was not returned");
    return {
      connected: true,
      shopId: String(shop.id || ""),
      shopName: String(shop.name || ""),
      shopDomain: String(shop.myshopifyDomain || connection.shopDomain),
      currency: String(shop.currencyCode || ""),
    };
  }

  // Business mappings and commerce operations are metadata/Flow-owned.
  // This adapter deliberately exposes only OAuth, generic GraphQL transport,
  // connection testing and webhook verification.

  return Object.freeze({ exchangeAuthorizationCode, refreshAuthentication, graphqlRequest, testConnection, verifyWebhook: verifyShopifyWebhook });
}