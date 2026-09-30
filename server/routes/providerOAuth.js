import express from "express";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  decryptCredentials,
  encryptCredentials,
} from "../services/integrationCredentials.js";
import { createQuickBooksAdapter } from "../services/quickbooksAdapter.js";
import { createShopifyAdapter } from "../services/shopifyAdapter.js";

const STATE_TTL_SECONDS = 600;
const SHOP_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;
const PROVIDERS = new Set(["quickbooks", "shopify"]);

function signingSecret() {
  const secret = process.env.JWT_SECRET || process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!secret) throw new Error("OAuth state signing is unavailable");
  return secret;
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyState(value, provider, connectionId) {
  const [body, signature, extra] = String(value || "").split(".");
  if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", signingSecret()).update(body).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.provider !== provider || payload.connectionId !== connectionId || Number(payload.expiresAt) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function callbackBaseUrl() {
  const configured = String(process.env.PUBLIC_APP_URL || "").trim();
  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("PUBLIC_APP_URL must be configured for provider OAuth");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("PUBLIC_APP_URL must be a public HTTPS origin");
  }
  return parsed.origin;
}

function shopifyQueryIsAuthentic(query, clientSecret) {
  const supplied = String(query.hmac || "");
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const message = Object.keys(query)
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort()
    .map((key) => `${key}=${String(query[key])}`)
    .join("&");
  const expected = createHmac("sha256", clientSecret).update(message).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function stateHash(state) {
  return createHash("sha256").update(state).digest("hex");
}

function credentialValue(credentials, camel, snake) {
  return String(credentials?.[camel] || credentials?.[snake] || "").trim();
}

function shopHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return SHOP_DOMAIN_RE.test(host) ? host : null;
}

export default function createProviderOAuthRouter({ authenticate, authorize, db, writeAudit, fetchImpl = globalThis.fetch }) {
  const router = express.Router();
  const manage = [authenticate, authorize("integration.manage")];

  async function loadConnection(connectionId, companyId, storeId) {
    const result = await db(
      `SELECT id, company_id, store_id, provider_name, base_url, credentials_encrypted, enabled, created_by
         FROM integration_connections
        WHERE id=$1 AND company_id=$2
          AND (store_id IS NULL OR store_id=$3)
        LIMIT 1`,
      [connectionId, companyId, storeId || null]
    );
    return result.rows?.[0] || null;
  }

  async function consumeState({ state, payload, connection, provider }) {
    const result = await db(
      `UPDATE integration_connections
          SET oauth_state_hash=NULL, oauth_state_expires_at=NULL, updated_at=NOW()
        WHERE id=$1 AND company_id=$2 AND LOWER(provider_name)=LOWER($3)
          AND enabled=true AND oauth_state_hash=$4 AND oauth_state_expires_at > NOW()
        RETURNING id, company_id, store_id, provider_name, base_url, credentials_encrypted, created_by`,
      [connection.id, payload.companyId, provider, stateHash(state)]
    );
    return result.rows?.[0] || null;
  }

  router.get("/integrations/:id/:provider/oauth/start", ...manage, async (req, res) => {
    const provider = String(req.params.provider || "").toLowerCase();
    if (!PROVIDERS.has(provider)) return res.status(404).json({ success: false, message: "Provider OAuth is not available" });
    try {
      const connection = await loadConnection(req.params.id, req.user.companyId, req.user.storeId);
      if (!connection || String(connection.provider_name || "").toLowerCase() !== provider || connection.enabled !== true) {
        return res.status(404).json({ success: false, message: "Integration not found" });
      }
      const credentials = decryptCredentials(connection.credentials_encrypted) || {};
      const clientId = credentialValue(credentials, "clientId", "client_id");
      const clientSecret = credentialValue(credentials, "clientSecret", "client_secret");
      if (!clientId || !clientSecret) return res.status(409).json({ success: false, message: "Provider client credentials are not configured" });

      const callbackUrl = `${callbackBaseUrl()}/api/integrations/${encodeURIComponent(connection.id)}/${provider}/oauth/callback`;
      const state = signState({
        provider,
        connectionId: connection.id,
        companyId: connection.company_id,
        storeId: connection.store_id || null,
        userId: req.user.id,
        nonce: randomBytes(18).toString("base64url"),
        expiresAt: Date.now() + STATE_TTL_SECONDS * 1000,
      });
      const stored = await db(
        `UPDATE integration_connections
            SET oauth_state_hash=$1, oauth_state_expires_at=NOW() + ($2 * INTERVAL '1 second'), updated_at=NOW()
          WHERE id=$3 AND company_id=$4 AND enabled=true
          RETURNING id`,
        [stateHash(state), STATE_TTL_SECONDS, connection.id, req.user.companyId]
      );
      if (!stored.rows?.length) return res.status(404).json({ success: false, message: "Integration not found" });

      let authorizationUrl;
      if (provider === "quickbooks") {
        const url = new URL("https://appcenter.intuit.com/connect/oauth2");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
        url.searchParams.set("redirect_uri", callbackUrl);
        url.searchParams.set("state", state);
        authorizationUrl = url.toString();
      } else {
        const shop = shopHost(credentials.shopDomain || credentials.shop_domain || connection.base_url);
        if (!shop) return res.status(400).json({ success: false, message: "A valid Shopify myshopify.com domain is required" });
        const url = new URL(`https://${shop}/admin/oauth/authorize`);
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("scope", process.env.SHOPIFY_OAUTH_SCOPES || "read_products,write_products,read_inventory,write_inventory,read_orders,read_customers,write_fulfillments,read_locations,write_webhooks");
        url.searchParams.set("redirect_uri", callbackUrl);
        url.searchParams.set("state", state);
        authorizationUrl = url.toString();
      }
      return res.json({ success: true, data: { authorizationUrl, expiresIn: STATE_TTL_SECONDS } });
    } catch {
      return res.status(500).json({ success: false, message: "Unable to start provider authorization" });
    }
  });

  router.get("/integrations/:id/:provider/oauth/callback", async (req, res) => {
    const provider = String(req.params.provider || "").toLowerCase();
    if (!PROVIDERS.has(provider)) return res.status(404).send("Provider callback is not available");
    const state = String(req.query.state || "");
    let payload;
    try {
      payload = verifyState(state, provider, req.params.id);
    } catch {
      payload = null;
    }
    if (!payload) return res.status(400).send("Invalid or expired provider state");

    try {
      const connection = await loadConnection(req.params.id, payload.companyId, payload.storeId);
      if (!connection || String(connection.provider_name || "").toLowerCase() !== provider || connection.enabled !== true) {
        return res.status(400).send("Provider connection is unavailable");
      }
      let credentials = decryptCredentials(connection.credentials_encrypted) || {};
      const clientId = credentialValue(credentials, "clientId", "client_id");
      const clientSecret = credentialValue(credentials, "clientSecret", "client_secret");
      if (!clientId || !clientSecret) return res.status(400).send("Provider client credentials are unavailable");

      if (provider === "shopify") {
        const shop = shopHost(req.query.shop);
        const configuredShop = shopHost(credentials.shopDomain || credentials.shop_domain || connection.base_url);
        if (!shop || shop !== configuredShop || !shopifyQueryIsAuthentic(req.query, clientSecret)) {
          return res.status(400).send("Shopify authorization could not be verified");
        }
      }

      const consumed = await consumeState({ state, payload, connection, provider });
      if (!consumed) return res.status(400).send("Provider state has expired or was already used");

      let accountId;
      if (provider === "quickbooks") {
        const tokens = await createQuickBooksAdapter({ fetchImpl }).exchangeAuthorizationCode({
          code: req.query.code,
          redirectUri: `${callbackBaseUrl()}/api/integrations/${encodeURIComponent(connection.id)}/${provider}/oauth/callback`,
          realmId: req.query.realmId,
          clientId,
          clientSecret,
        });
        accountId = tokens.realmId;
        credentials = {
          ...credentials,
          environment: credentials.environment === "production" ? "production" : "sandbox",
          realmId: tokens.realmId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          tokenType: tokens.tokenType,
        };
      } else {
        const shop = shopHost(req.query.shop);
        const tokens = await createShopifyAdapter({ fetchImpl }).exchangeAuthorizationCode({
          shopDomain: shop,
          clientId,
          clientSecret,
          code: req.query.code,
        });
        const requestedScopes = String(process.env.SHOPIFY_OAUTH_SCOPES || "read_products,write_products,read_inventory,write_inventory,read_orders,read_customers,write_fulfillments,read_locations,write_webhooks")
          .split(",").map((scope) => scope.trim()).filter(Boolean);
        const missingScopes = requestedScopes.filter((scope) =>
          !tokens.scopes.includes(scope) && !(scope.startsWith("read_") && tokens.scopes.includes(`write_${scope.slice(5)}`))
        );
        if (missingScopes.length) return res.status(400).send("Shopify did not grant all required permissions. Review app scopes and reconnect.");
        accountId = shop;
        credentials = {
          ...credentials,
          shopDomain: shop,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          refreshTokenExpiry: tokens.refreshTokenExpiresIn
            ? new Date(Date.now() + tokens.refreshTokenExpiresIn * 1000).toISOString()
            : null,
          scopes: tokens.scopes,
        };
      }

      await db(
        `UPDATE integration_connections
            SET credentials_encrypted=$1, provider_account_id=$2, connection_status='CONNECTED',
                last_connected_at=NOW(), last_error=NULL, updated_at=NOW()
          WHERE id=$3 AND company_id=$4`,
        [encryptCredentials(credentials), accountId, connection.id, payload.companyId]
      );
      if (typeof writeAudit === "function") {
        await writeAudit(payload.companyId, payload.userId || connection.created_by || null, "integration_connected", "integration_connection", connection.id, { provider });
      }
      return res.redirect(303, `${callbackBaseUrl()}/app/integrations?provider=${provider}&connected=true`);
    } catch {
      try {
        await db(
          `UPDATE integration_connections
              SET connection_status='ERROR', last_error='Provider authorization failed', updated_at=NOW()
            WHERE id=$1 AND company_id=$2`,
          [connectionIdFromPayload(payload), payload.companyId]
        );
      } catch {
        // The public callback response remains generic even if state persistence fails.
      }
      return res.status(400).send("Provider authorization failed. Reconnect from onePOS and retry.");
    }
  });

  return router;
}

function connectionIdFromPayload(payload) {
  return payload?.connectionId || null;
}
