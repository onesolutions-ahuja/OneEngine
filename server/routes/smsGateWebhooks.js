import crypto from "node:crypto";
import express from "express";

import { decryptCredentials } from "../services/integrationCredentials.js";
import { createSmsGateDriver } from "../services/smsGateConnector.js";
import { COMMUNICATION_EVENTS, recordCommunicationEvent } from "../services/communicationCore.js";
import { createAppointmentBookingCase, issueAppointmentPublicLink } from "../services/oneAssistant.js";

const MAX_CLOCK_SKEW_SECONDS = 300;

function jsonValue(value, fallback = {}) {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return value;
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeHexEqual(left, right) {
  const a = Buffer.from(String(left || "").trim().toLowerCase(), "hex");
  const b = Buffer.from(String(right || "").trim().toLowerCase(), "hex");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySmsGateSignature(rawBody, headers, signingKey) {
  const signature = String(headers["x-signature"] || "");
  const timestamp = String(headers["x-timestamp"] || "");
  const numericTimestamp = Number(timestamp);
  if (!signature || !timestamp || !Number.isFinite(numericTimestamp) || !signingKey) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - numericTimestamp) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = crypto.createHmac("sha256", signingKey)
    .update(Buffer.concat([rawBody, Buffer.from(timestamp, "utf8")]))
    .digest("hex");
  return safeHexEqual(signature, expected);
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return raw.startsWith("+") ? raw : raw;
}

export default function createSmsGateWebhookRouter({ pool } = {}) {
  const router = express.Router();

  router.post("/smsgate/webhook/:connectionId", async (req, res) => {
    if (!pool) return res.status(503).json({ success: false, message: "Database unavailable" });
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
      let body;
      try { body = JSON.parse(rawBody.toString("utf8")); }
      catch { return res.status(400).json({ success: false, message: "Invalid JSON payload" }); }

      const result = await pool.query(
        `SELECT id,company_id,enabled,connection_status,connector_configuration,credentials_encrypted
           FROM integration_connections
          WHERE id=$1 AND connector_package_key='smsgate_connector'
          LIMIT 1`,
        [req.params.connectionId]
      );
      const connection = result.rows[0];
      if (!connection || connection.enabled !== true) {
        return res.status(404).json({ success: false, message: "SMSGate connection unavailable" });
      }

      // Public provider webhooks are still mutation entry points. Once the
      // signed connector instance resolves the tenant, attach the request to
      // the shared business-command workflow trace before writing anything.
      await req.ensureBusinessCommandRun?.({
        companyId: connection.company_id,
        userId: null,
        storeId: null,
      });

      const configuration = jsonValue(connection.connector_configuration, {});
      let secrets = {};
      try { secrets = decryptCredentials(connection.credentials_encrypted) || {}; } catch { secrets = {}; }
      const signingKey = secrets.webhookSigningKey || configuration.webhookSigningKey || "";
      if (!verifySmsGateSignature(rawBody, req.headers, signingKey)) {
        return res.status(401).json({ success: false, message: "Invalid SMSGate webhook signature" });
      }

      if (String(body?.event || "").toLowerCase() !== "sms:received") {
        return res.status(202).json({ success: true, ignored: true });
      }

      const payload = body?.payload || {};
      const configuredDevice = String(configuration.deviceId || "").trim();
      if (configuredDevice && String(body?.deviceId || "") !== configuredDevice) {
        return res.status(403).json({ success: false, message: "Webhook device does not match this connection" });
      }

      const sender = normalizePhone(payload.sender || payload.phoneNumber);
      const recipient = normalizePhone(payload.recipient);
      const message = String(payload.message || "").trim();
      if (!sender || !message) {
        return res.status(400).json({ success: false, message: "Inbound SMS sender and message are required" });
      }

      const providerMessageId = String(payload.messageId || body?.id || "").trim() || null;
      const sourceMessageId = [
        String(body?.deviceId || "device"),
        String(body?.id || providerMessageId || crypto.createHash("sha256").update(rawBody).digest("hex"))
      ].join(":").slice(0, 255);

      await recordCommunicationEvent({
        db: pool.query.bind(pool),
        companyId: connection.company_id,
        channel: "SMS",
        eventType: COMMUNICATION_EVENTS.RECEIVED,
        direction: "INBOUND",
        provider: "smsgate",
        providerMessageId,
        sender,
        recipient,
        metadata: {
          connectorInstanceId: connection.id,
          deviceId: body?.deviceId || null,
          simNumber: payload.simNumber ?? null,
          receivedAt: payload.receivedAt || null,
          webhookEventId: body?.id || null,
        },
      });

      const bookingCase = await createAppointmentBookingCase(pool.query.bind(pool), {
        companyId: connection.company_id,
        channel: "SMS",
        sourceMessageId,
        sender,
        recipient,
        body: message,
        state: {
          provider: "smsgate",
          connectorInstanceId: connection.id,
          deviceId: body?.deviceId || null,
          receivedAt: payload.receivedAt || null,
        },
      });

      const bookingBaseUrl = String(
        configuration.bookingBaseUrl ||
        process.env.PUBLIC_APP_URL ||
        process.env.FRONTEND_URL ||
        "https://onesolutions-ahuja.github.io/OneEngine"
      ).replace(/\/$/, "");

      const link = await issueAppointmentPublicLink(pool.query.bind(pool), {
        companyId: connection.company_id,
        bookingCaseId: bookingCase.id,
        purpose: "BOOK_SLOT",
        ttlMinutes: 15,
        publicBaseUrl: bookingBaseUrl,
        metadata: { channel: "SMS", provider: "smsgate", connectorInstanceId: connection.id },
      });

      const connectorConfiguration = { ...configuration, ...secrets };
      const adapter = createSmsGateDriver().createAdapter({ configuration: connectorConfiguration });
      const replyText = `Welcome. Book your appointment here: ${link.url}. This secure link expires in 15 minutes.`;
      const sent = await adapter.execute("sms.send", { recipient: sender, text: replyText });

      return res.status(202).json({
        success: true,
        data: {
          bookingCaseId: bookingCase.id,
          communicationChannel: "SMS",
          replyMessageId: sent?.providerMessageId || null,
        },
      });
    } catch (error) {
      console.error("SMSGate inbound booking webhook error:", error);
      return res.status(500).json({ success: false, message: "Unable to process inbound SMS booking request" });
    }
  });

  return router;
}
