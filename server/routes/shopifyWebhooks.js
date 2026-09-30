import express from "express";
import { createHash } from "node:crypto";
import { decryptCredentials } from "../services/integrationCredentials.js";
import { enqueuePlatformJob } from "../services/platformJobs.js";
import { getCompanyEntitlements, hasEntitlement } from "../services/licensing.js";
import { verifyShopifyWebhook } from "../services/shopifyAdapter.js";

const SHOP_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;
const ALLOWED_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/fulfilled",
  "orders/cancelled",
  "refunds/create",
  "fulfillments/create",
  "fulfillments/update",
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
]);

export default function createShopifyWebhooksRouter({ db, writeAudit, isEntitled = async (companyId) => hasEntitlement(await getCompanyEntitlements(db, companyId), "integrations") }) {
  const router = express.Router();

  router.post("/shopify/webhooks", async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
    if (!rawBody) return res.status(400).json({ success: false, message: "Raw webhook body is required" });
    const shopDomain = String(req.get("x-shopify-shop-domain") || "").trim().toLowerCase();
    const topic = String(req.get("x-shopify-topic") || "").trim().toLowerCase();
    const deliveryId = String(req.get("x-shopify-webhook-id") || "").trim();
    const signature = req.get("x-shopify-hmac-sha256");
    if (!SHOP_DOMAIN_RE.test(shopDomain) || !ALLOWED_TOPICS.has(topic) || !deliveryId || deliveryId.length > 200) {
      return res.status(400).json({ success: false, message: "Invalid Shopify webhook headers" });
    }

    try {
      const connections = await db(
        `SELECT id, company_id, store_id, provider_account_id, credentials_encrypted
           FROM integration_connections
          WHERE LOWER(provider_name)='shopify' AND provider_account_id=$1
            AND enabled=true AND connection_status='CONNECTED'
          ORDER BY updated_at DESC
          LIMIT 2`,
        [shopDomain]
      );
      if (connections.rows.length !== 1) return res.status(401).json({ success: false, message: "Shopify webhook is not authorized" });
      const connection = connections.rows[0];
      const credentials = decryptCredentials(connection.credentials_encrypted) || {};
      const configuredShop = String(credentials.shopDomain || credentials.shop_domain || "").trim().toLowerCase();
      const signingSecret = credentials.webhookSecret || credentials.webhook_secret || credentials.clientSecret || credentials.client_secret;
      if (configuredShop !== shopDomain || !verifyShopifyWebhook(rawBody, signature, signingSecret)) {
        return res.status(401).json({ success: false, message: "Shopify webhook signature is invalid" });
      }
      await req.ensureBusinessCommandRun?.({
        companyId: connection.company_id,
        userId: null,
        storeId: connection.store_id || null,
      });

      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return res.status(400).json({ success: false, message: "Shopify webhook body is invalid" });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return res.status(400).json({ success: false, message: "Shopify webhook body is invalid" });
      }

      const entitled = await isEntitled(connection.company_id);
      const installed = await db(
        `SELECT 1 FROM company_package_installations i
           JOIN package_registry p ON p.id=i.package_id
          WHERE i.company_id=$1 AND p.package_key='shopify'
            AND i.status='active' AND i.suspended_by_entitlement=false
          LIMIT 1`,
        [connection.company_id]
      );
      if (!entitled || !installed.rows.length) {
        if (typeof writeAudit === "function") {
          await writeAudit(connection.company_id, null, "shopify_webhook_skipped_unlicensed", "integration_connection", connection.id, { topic, deliveryId });
        }
        return res.status(200).json({ success: true, skipped: true });
      }

      const eventId = String(req.get("x-shopify-event-id") || "").slice(0, 200) || null;
      const dedupeId = eventId || deliveryId;
      const key = `shopify:${connection.id}:${createHash("sha256").update(dedupeId).digest("hex")}`;
      const job = await enqueuePlatformJob({
        db,
        companyId: connection.company_id,
        kind: "SHOPIFY_WEBHOOK_EVENT",
        idempotencyKey: key,
        payload: { connectionId: connection.id, shopDomain, topic, deliveryId, eventId, payload },
      });
      if (typeof writeAudit === "function") {
        await writeAudit(connection.company_id, null, job ? "shopify_webhook_queued" : "shopify_webhook_duplicate", "integration_connection", connection.id, { topic, deliveryId, eventId });
      }
      return res.status(200).json({ success: true, duplicate: !job });
    } catch {
      return res.status(503).json({ success: false, message: "Shopify webhook could not be accepted" });
    }
  });

  return router;
}
