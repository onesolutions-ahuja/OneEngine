import express from "express";
import crypto from "crypto";

import {
  buildSmsInvoiceConfiguration,
  maskSmsInvoiceConfiguration,
  buildEmailInvoiceConfiguration,
  maskEmailInvoiceConfiguration,
  loadInvoiceChannelConfig,
  decryptSecret,
  maskEmail,
} from "../services/onlineOrders/platformConfig.js";
import {
  resendInvoiceByChannel,
  testInvoiceChannelConnection,
} from "../services/invoiceDelivery.js";

/*
 * T9D-NEXT - SMS + Email invoice delivery settings/delivery routes.
 *
 * Same patterns as the WhatsApp settings router (T9Q-SMALL):
 *  - configuration lives in the existing `integrations` table (providers
 *    'sms_invoice' / 'email_invoice'), secrets enc:v1-encrypted
 *  - activation gate: enabled=true requires a test token issued by a
 *    successful POST /invoice-delivery/test-connection, fingerprint-bound to
 *    the exact credentials (endpoint + auth material)
 *  - GET responses expose only masked/plain fields - never secrets
 *  - test-send + manual resend go through the shared delivery pipeline
 *  - every route is tenant-scoped; provider failures never throw into POS
 */

const TEST_WINDOW_MS = 60_000;
const TEST_MAX_PER_WINDOW = 10;
const testBuckets = new Map();
function testRateLimited(companyId) {
  const now = Date.now();
  const bucket = testBuckets.get(companyId);
  if (!bucket || now > bucket.reset) {
    testBuckets.set(companyId, { count: 1, reset: now + TEST_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > TEST_MAX_PER_WINDOW;
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex")}`;
}

// The settings UI sends camelCase fields; the config builders speak
// snake_case. Map both spellings so either client works.
const CAMEL_TO_SNAKE = {
  apiBaseUrl: "api_base_url",
  senderId: "sender_id",
  defaultCountryCode: "default_country_code",
  messageTemplate: "message_template",
  fromAddress: "from_address",
  fromName: "from_name",
  smtpHost: "smtp_host",
  smtpPort: "smtp_port",
  smtpSecure: "smtp_secure",
  subjectTemplate: "subject_template",
};

function normalisePlainFields(plain = {}) {
  const mapped = { ...plain };
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE)) {
    if (mapped[camel] !== undefined && mapped[snake] === undefined) mapped[snake] = mapped[camel];
  }
  return mapped;
}

const CHANNELS = {
  sms: {
    provider: "sms_invoice",
    build: buildSmsInvoiceConfiguration,
    mask: maskSmsInvoiceConfiguration,
    label: "SMS",
  },
  email: {
    provider: "email_invoice",
    build: buildEmailInvoiceConfiguration,
    mask: maskEmailInvoiceConfiguration,
    label: "Email",
  },
};

export default function createInvoiceDeliveryRouter({ db, pool, authenticate, authorize, writeAudit }) {
  const router = express.Router();

  const upsertRow = async (client, companyId, provider, active, configuration) => {
    const existing = await client.query(
      `SELECT id FROM integrations WHERE company_id = $1 AND provider = $2 FOR UPDATE`,
      [companyId, provider]
    );
    if (existing.rows.length) {
      await client.query(
        `UPDATE integrations SET active = $2, configuration = $3, updated_at = NOW() WHERE id = $1`,
        [existing.rows[0].id, active, JSON.stringify(configuration)]
      );
      return existing.rows[0].id;
    }
    const name = provider === "sms_invoice" ? "SMS Invoice Delivery" : "Email Invoice Delivery";
    const inserted = await client.query(
      `INSERT INTO integrations (company_id, name, provider, configuration, active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, name, provider, JSON.stringify(configuration), active]
    );
    return inserted.rows[0].id;
  };

  /* ------------------------------ GET settings ---------------------------- */

  router.get(
    "/invoice-delivery/:channel/settings",
    authenticate,
    authorize("settings.manage"),
    async (req, res) => {
      const channel = CHANNELS[req.params.channel];
      if (!channel) return res.status(404).json({ success: false, message: "Unknown delivery channel." });
      try {
        const { enabled, configuration } = await loadInvoiceChannelConfig(db, req.user.companyId, channel.provider);
        return res.json({
          success: true,
          data: { enabled, configuration: channel.mask(configuration) },
        });
      } catch (error) {
        console.error(`Invoice delivery ${channel.label} settings error:`, error.message);
        return res.status(500).json({ success: false, message: `Unable to load ${channel.label} settings.` });
      }
    }
  );

  /* ------------------------------ PUT settings ---------------------------- */

  router.put(
    "/invoice-delivery/:channel/settings",
    authenticate,
    authorize("settings.manage"),
    (_req, res) => res.status(410).json({ success: false, code: "METADATA_ACTION_REQUIRED", message: "Delivery configuration writes are executed through Integration metadata Actions/Flows." })
  );

  /* --------------------------- POST test-connection ----------------------- */

  router.post(
    "/invoice-delivery/:channel/test-connection",
    authenticate,
    authorize("settings.manage"),
    async (req, res) => {
      const channel = CHANNELS[req.params.channel];
      if (!channel) return res.status(404).json({ success: false, message: "Unknown delivery channel." });
      if (testRateLimited(req.user.companyId)) {
        return res.status(429).json({ success: false, message: "Too many test attempts. Please wait a minute." });
      }
      try {
        const { apiKey, apiSecret, authToken, ...plain } = req.body || {};
        const existing = await loadInvoiceChannelConfig(db, req.user.companyId, channel.provider);
        const candidate = channel.build(
          { ...normalisePlainFields(plain), api_key: apiKey, api_secret: apiSecret, auth_token: authToken },
          existing.configuration
        );

        const result = await testInvoiceChannelConnection({
          db,
          companyId: req.user.companyId,
          channel: req.params.channel,
          configuration: candidate,
        });

        await writeAudit(req.user.companyId, req.user.id, "invoice_delivery_connection_tested", "integration", null, {
          channel: channel.label.toLowerCase(),
          outcome: result.ok ? "success" : "failed",
          httpStatus: result.httpStatus ?? null,
          durationMs: result.durationMs ?? null,
        });

        if (!result.ok) {
          return res.json({ success: false, data: { status: "failed", httpStatus: result.httpStatus ?? null, error: result.error } });
        }

        // Success: persist the tested credential candidate + issue the
        // activation reference (fingerprint-bound, 24h window).
        const testToken = crypto.randomUUID();
        const client = await pool.connect();
        try {
          await upsertRow(client, req.user.companyId, channel.provider, existing.enabled === true, {
            ...candidate,
            last_test_token: testToken,
            last_test_fp: fingerprint((decryptSecret(candidate.auth_token || candidate.api_key) || "") + "|" + (candidate.api_base_url || "")),
            last_tested_at: new Date().toISOString(),
          });
        } finally {
          client.release();
        }
        return res.json({
          success: true,
          message: "Connection successful.",
          data: { status: "connected", httpStatus: result.httpStatus, durationMs: result.durationMs, testToken },
        });
      } catch (error) {
        console.error(`${channel.label} connection test error:`, error.message);
        return res.status(500).json({ success: false, data: { status: "failed", error: "Unable to run the connection test." } });
      }
    }
  );

  /* ------------------------------- POST test-send ------------------------- */

  /*
   * Sends a REAL test message to an ADMIN-SUPPLIED recipient through the
   * same pipeline as automatic delivery. Requires an activated integration
   * and a tenant-owned sale (for the T9P link). Never auto-enables anything.
   */
  router.post(
    "/invoice-delivery/:channel/test-send",
    authenticate,
    authorize("settings.manage"),
    async (req, res) => {
      const channel = CHANNELS[req.params.channel];
      if (!channel) return res.status(404).json({ success: false, message: "Unknown delivery channel." });
      try {
        const { saleId, recipient } = req.body || {};
        if (!saleId || typeof saleId !== "string") {
          return res.status(400).json({ success: false, message: "A sale must be selected to send a real test message." });
        }
        if (!recipient || typeof recipient !== "string") {
          return res.status(400).json({ success: false, message: `A test ${channel.label === "SMS" ? "phone number" : "email address"} is required.` });
        }

        // Tenant scope check (company + store where applicable).
        const saleCheck = await db(
          `SELECT id FROM sales
           WHERE id = $1 AND company_id = $2
           ${req.user.storeId ? "AND store_id = $3" : ""}
           LIMIT 1`,
          req.user.storeId ? [saleId, req.user.companyId, req.user.storeId] : [saleId, req.user.companyId]
        );
        if (!saleCheck.rows.length) {
          return res.status(404).json({ success: false, message: "Sale not found in your company" });
        }

        const result = await resendInvoiceByChannel({
          db,
          channel: req.params.channel,
          saleId,
          companyId: req.user.companyId,
          storeId: req.user.storeId ?? null,
          userId: req.user.id ?? null,
          overrideRecipient: recipient, // admin-supplied demo recipient
        });

        await writeAudit(req.user.companyId, req.user.id, result.ok ? "invoice_delivery_test_sent" : "invoice_delivery_test_failed", "sale", saleId, {
          channel: channel.label.toLowerCase(),
          outcome: result.outcome ?? null,
          httpStatus: result.httpStatus ?? null,
        });

        if (!result.ok) {
          const message =
            result.reason === "not_configured"
              ? `${channel.label} delivery is not enabled/configured. Run the connection test and activate first.`
              : result.reason === "invalid_recipient"
                ? `The test recipient is not a valid ${channel.label === "SMS" ? "phone number" : "email address"}.`
                : `Test send failed: ${result.error || result.reason || "provider error"}`;
          return res.status(result.reason === "not_configured" ? 400 : 502).json({ success: false, message });
        }
        return res.json({
          success: true,
          data: { sent: true, httpStatus: result.httpStatus ?? null, durationMs: result.durationMs ?? null },
        });
      } catch (error) {
        console.error(`${channel.label} test send error:`, error.message);
        return res.status(500).json({ success: false, message: "Unable to send the test message." });
      }
    }
  );

  /* ------------------------------ POST resend ----------------------------- */

  /*
   * Manual "Send by SMS/Email" for an existing sale from the sale detail
   * view. Recipient is ALWAYS the sale's own customer (never arbitrary);
   * tenant scope is re-verified inside the service loader.
   */
  router.post(
    "/invoice-delivery/:channel/resend",
    authenticate,
    authorize("settings.manage", "sale.refund"),
    async (req, res) => {
      const channel = CHANNELS[req.params.channel];
      if (!channel) return res.status(404).json({ success: false, message: "Unknown delivery channel." });
      try {
        const { saleId } = req.body || {};
        if (!saleId || typeof saleId !== "string") {
          return res.status(400).json({ success: false, message: "A sale ID is required." });
        }
        const saleCheck = await db(
          `SELECT id FROM sales
           WHERE id = $1 AND company_id = $2
           ${req.user.storeId ? "AND store_id = $3" : ""}
           LIMIT 1`,
          req.user.storeId ? [saleId, req.user.companyId, req.user.storeId] : [saleId, req.user.companyId]
        );
        if (!saleCheck.rows.length) {
          return res.status(404).json({ success: false, message: "Sale not found in your company" });
        }

        const result = await resendInvoiceByChannel({
          db,
          channel: req.params.channel,
          saleId,
          companyId: req.user.companyId,
          storeId: req.user.storeId ?? null,
          userId: req.user.id ?? null,
        });

        await writeAudit(req.user.companyId, req.user.id, result.ok ? "invoice_delivered" : "invoice_delivery_failed", "sale", saleId, {
          channel: channel.label.toLowerCase(),
          trigger: "manual_resend",
          outcome: result.outcome ?? null,
          httpStatus: result.httpStatus ?? null,
        });

        if (result.outcome === "skipped") {
          const message =
            result.reason === "sale_not_found"
              ? "Sale not found in your company"
              : result.reason === "no_customer_phone"
                ? "The sale has no usable customer phone number for SMS."
                : result.reason === "no_customer_email"
                  ? "The sale has no usable customer email address."
                  : `${channel.label} delivery is not activated. Enable it in Settings first.`;
          return res.status(result.reason === "sale_not_found" ? 404 : 400).json({ success: false, message });
        }
        if (!result.ok) {
          return res.status(502).json({
            success: false,
            message: `${channel.label} send failed: ${result.error || result.reason || "provider error"}`,
          });
        }
        return res.json({
          success: true,
          message: `Invoice sent by ${channel.label}.`,
          data: { httpStatus: result.httpStatus ?? null, durationMs: result.durationMs ?? null },
        });
      } catch (error) {
        console.error(`${channel.label} resend error:`, error.message);
        return res.status(500).json({ success: false, message: `Unable to send the invoice by ${channel.label}.` });
      }
    }
  );

  return router;
}
