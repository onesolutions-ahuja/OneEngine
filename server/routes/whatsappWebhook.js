import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptCredentials } from "../services/integrationCredentials.js";
import { recordCommunicationEvent } from "../services/communicationCore.js";

const router = express.Router();

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {}
  }
  return {};
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function configValue(config, credentials, ...keys) {
  const sources = [
    config,
    config.settings,
    config.credentials,
    credentials,
    credentials.settings,
  ].map(asObject);
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
    }
  }
  return "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function validSignature(rawBody, signature, appSecret) {
  if (!rawBody || !signature || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

async function loadWhatsAppIntegrations(db) {
  const result = await db(
    `SELECT id,company_id,provider_name,integration_type,connector_package_key,
            connector_configuration,credentials_encrypted
       FROM integration_connections
      WHERE enabled=TRUE
        AND (
          LOWER(COALESCE(provider_name,'')) LIKE '%whatsapp%'
          OR LOWER(COALESCE(integration_type,'')) LIKE '%communication%'
          OR connector_package_key='whatsapp_connector'
        )`
  );
  return (result.rows || []).flatMap((row) => {
    let credentials = {};
    try { credentials = asObject(decryptCredentials(row.credentials_encrypted)); }
    catch (error) {
      console.error("WhatsApp webhook: unable to decrypt integration credentials", { integrationId: row.id, message: error?.message });
      return [];
    }
    const config = asObject(row.connector_configuration);
    const phoneNumberId = configValue(
      config, credentials,
      "phone_number_id", "phoneNumberId", "wa_phone_number_id"
    );
    if (!phoneNumberId) return [];
    return [{
      ...row,
      config,
      credentials,
      phoneNumberId,
      verifyToken: configValue(config, credentials, "webhook_verify_token", "webhookVerifyToken", "verify_token", "verifyToken"),
      appSecret: firstValue(
        configValue(config, credentials, "app_secret", "appSecret", "meta_app_secret", "metaAppSecret"),
        process.env.WHATSAPP_APP_SECRET,
        process.env.META_APP_SECRET,
        process.env.FACEBOOK_APP_SECRET,
      ) || "",
    }];
  });
}

function extractBody(message) {
  const type = String(message?.type || "unknown").toLowerCase();
  if (type === "text") return message?.text?.body || "";
  if (["image", "video", "document"].includes(type)) return message?.[type]?.caption || "";
  if (type === "button") return message?.button?.text || "";
  if (type === "interactive") {
    return message?.interactive?.button_reply?.title
      || message?.interactive?.list_reply?.title
      || message?.interactive?.nfm_reply?.body
      || "";
  }
  if (type === "location") {
    const location = message?.location || {};
    return [location.name, location.address, location.latitude, location.longitude].filter(Boolean).join(", ");
  }
  return "";
}

function parseOccurredAt(timestamp) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

router.get("/whatsapp/webhook", async (req, res) => {
  console.info("WhatsApp webhook verification request received", { method: req.method, path: req.path, hasMode: Boolean(req.query["hub.mode"]), hasChallenge: Boolean(req.query["hub.challenge"]) });
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const envToken = firstValue(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN, process.env.WHATSAPP_VERIFY_TOKEN) || "";

  if (mode !== "subscribe" || !challenge || !token) {
    return res.status(403).send("Forbidden");
  }

  try {
    const integrations = await loadWhatsAppIntegrations(req.app.locals.db || globalThis.__oneEngineDb);
    const valid = (envToken && safeEqual(token, envToken))
      || integrations.some((integration) => integration.verifyToken && safeEqual(token, integration.verifyToken));
    if (!valid) return res.status(403).send("Forbidden");
    return res.status(200).type("text/plain").send(challenge);
  } catch (error) {
    console.error("WhatsApp webhook verification failed:", error?.message || error);
    return res.status(503).send("Webhook verification temporarily unavailable");
  }
});

router.post("/whatsapp/webhook", async (req, res) => {
  console.info("WhatsApp inbound webhook request received", { method: req.method, path: req.path, contentType: req.get("content-type") || null, contentLength: req.get("content-length") || null, bodyIsBuffer: Buffer.isBuffer(req.body), bodyBytes: Buffer.isBuffer(req.body) ? req.body.length : null });
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}), "utf8");

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, message: "Invalid webhook JSON" });
  }

  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return res.status(400).json({ success: false, message: "Unsupported webhook payload" });
  }

  try {
    const integrations = await loadWhatsAppIntegrations(req.app.locals.db || globalThis.__oneEngineDb);
    const signature = String(req.get("x-hub-signature-256") || "");
    const changes = payload.entry.flatMap((entry) =>
      (Array.isArray(entry?.changes) ? entry.changes : [])
        .filter((change) => change?.field === "messages")
        .map((change) => ({ wabaId: entry?.id || null, value: change?.value || {} }))
    );
    const incoming = changes.flatMap(({ wabaId, value }) => {
      const phoneNumberId = String(value?.metadata?.phone_number_id || "");
      return (Array.isArray(value?.messages) ? value.messages : []).map((message) => ({
        wabaId,
        value,
        phoneNumberId,
        message,
      }));
    });

    // Status-only callbacks are valid Meta events, but do not trigger inbound-message flows.
    if (!incoming.length) return res.status(200).json({ success: true });

    for (const item of incoming) {
      const integration = integrations.find((candidate) => candidate.phoneNumberId === item.phoneNumberId);
      if (!integration) {
        console.warn("WhatsApp webhook: no enabled integration matches phone_number_id", { phoneNumberId: item.phoneNumberId });
        return res.status(404).json({ success: false, message: "No enabled WhatsApp integration matches this phone number" });
      }
      if (!integration.appSecret) {
        console.error("WhatsApp webhook: app secret is not configured", { integrationId: integration.id });
        return res.status(503).json({ success: false, message: "WhatsApp App Secret is not configured" });
      }
      if (!validSignature(rawBody, signature, integration.appSecret)) {
        return res.status(401).json({ success: false, message: "Invalid WhatsApp webhook signature" });
      }
    }

    const db = req.app.locals.db || globalThis.__oneEngineDb;
    if (typeof db !== "function") throw new Error("Database query function is unavailable");

    let processed = 0;
    for (const item of incoming) {
      const integration = integrations.find((candidate) => candidate.phoneNumberId === item.phoneNumberId);
      const message = item.message || {};
      const sender = String(message.from || "");
      const providerMessageId = String(message.id || "");
      if (!sender || !providerMessageId) continue;

      const profileName = (item.value?.contacts || []).find((contact) => String(contact?.wa_id || "") === sender)?.profile?.name || null;
      const body = extractBody(message);
      const messageType = String(message.type || "unknown").slice(0, 40);
      const occurredAt = parseOccurredAt(message.timestamp);
      const conversationResult = await db(
        `INSERT INTO whatsapp_conversations
           (company_id,phone_number_id,wa_contact_id,customer_phone,status,last_message_at,metadata)
         VALUES ($1,$2,$3,$4,'OPEN',COALESCE($5::timestamptz,NOW()),$6::jsonb)
         ON CONFLICT (company_id,phone_number_id,wa_contact_id)
         DO UPDATE SET customer_phone=EXCLUDED.customer_phone,
                       last_message_at=GREATEST(COALESCE(whatsapp_conversations.last_message_at,EXCLUDED.last_message_at),EXCLUDED.last_message_at),
                       updated_at=NOW(),
                       metadata=whatsapp_conversations.metadata || EXCLUDED.metadata
         RETURNING id,customer_id,status`,
        [
          integration.company_id,
          item.phoneNumberId,
          sender,
          sender,
          occurredAt,
          JSON.stringify({ profileName, businessAccountId: item.wabaId }),
        ]
      );
      const conversation = conversationResult.rows?.[0];
      if (!conversation?.id) throw new Error("Unable to create WhatsApp conversation");

      const inserted = await db(
        `INSERT INTO whatsapp_messages
           (company_id,conversation_id,direction,provider_message_id,message_type,body,status,metadata,occurred_at)
         VALUES ($1,$2,'INBOUND',$3,$4,$5,'RECEIVED',$6::jsonb,$7::timestamptz)
         ON CONFLICT (company_id,provider_message_id) DO NOTHING
         RETURNING id`,
        [
          integration.company_id,
          conversation.id,
          providerMessageId,
          messageType,
          body || null,
          JSON.stringify({ provider: "META_WHATSAPP", phoneNumberId: item.phoneNumberId, sender, profileName, message }),
          occurredAt,
        ]
      );
      let messageId = inserted.rows?.[0]?.id;
      if (!messageId) {
        const existing = await db(
          "SELECT id FROM whatsapp_messages WHERE company_id=$1 AND provider_message_id=$2 LIMIT 1",
          [integration.company_id, providerMessageId]
        );
        messageId = existing.rows?.[0]?.id;
      }
      if (!messageId) throw new Error("Unable to persist WhatsApp message");

      // Calling this even for a retried message repairs the rare case where the
      // message row committed but event creation failed on the previous attempt.
      await recordCommunicationEvent({
        db,
        companyId: integration.company_id,
        channel: "WHATSAPP",
        eventType: "communication.message_received",
        direction: "INBOUND",
        provider: "META_WHATSAPP",
        providerMessageId,
        recipient: item.value?.metadata?.display_phone_number || item.phoneNumberId,
        sender,
        communicationId: messageId,
        body: body || null,
        metadata: {
          provider: "META_WHATSAPP",
          phoneNumberId: item.phoneNumberId,
          businessAccountId: item.wabaId,
          conversationId: conversation.id,
          messageId,
          messageType,
          profileName,
          message,
        },
      });
      processed += 1;
    }

    return res.status(200).json({ success: true, processed });
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error?.message || error);
    return res.status(500).json({ success: false, message: "Unable to process WhatsApp webhook" });
  }
});

export default function createWhatsAppWebhookRouter({ db }) {
  if (typeof db !== "function") throw new Error("WhatsApp webhook requires a database query function");
  // The database function is also attached to app.locals by the server mount.
  router.use((req, _res, next) => {
    req.app.locals.db = db;
    next();
  });
  return router;
}
