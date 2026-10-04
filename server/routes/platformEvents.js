import express from "express";
import {
  acceptInboundWebhook,
  createInboundWebhookEndpoint,
  createWebhookSubscription,
  deactivateWebhookSubscription,
  listInboundWebhookEndpoints,
  listWebhookDeliveries,
  publishPlatformEvent,
  updateInboundWebhookEndpoint,
  updateWebhookSubscription,
} from "../services/platformEvents.js";

function publicSubscription(row) {
  if (!row) return row;
  const { signing_secret_ciphertext: _secret, ...safe } = row;
  return safe;
}

export default function createPlatformEventsRouter({
  authenticate,
  authorize,
  db,
  encryptSecret = null,
  authenticateInbound = null,
}) {
  const router = express.Router();
  const manage = [authenticate, authorize("settings.manage")];

  router.get("/platform/event-types", ...manage, async (req, res) => {
    try {
      const result = await db("SELECT event_type,description,source_package_id,field_schema,active,created_at FROM platform_event_types WHERE active=TRUE ORDER BY event_type");
      const rows = [];
      for (const row of result.rows || []) {
        let fields = Array.isArray(row.field_schema) ? row.field_schema : [];
        if (!fields.length) {
          const samples = await db(
            `SELECT payload FROM platform_events
              WHERE company_id=$1 AND event_type=$2
              ORDER BY created_at DESC LIMIT 20`,
            [req.user.companyId, row.event_type]
          );
          const names = new Set();
          for (const sample of samples.rows || []) {
            for (const key of Object.keys(sample.payload || {})) names.add(key);
          }
          fields = [...names].sort().map((key) => ({ api_name: key, label: key, data_type: "text", observed: true }));
        }
        rows.push({ ...row, field_schema: fields });
      }
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error("Platform event type list error:", error);
      res.status(500).json({ success: false, message: "Unable to load event types" });
    }
  });

  router.get("/platform/events", ...manage, async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const result = await db(
        `SELECT id,company_id,event_type,payload,actor_user_id,idempotency_key,created_at
         FROM platform_events WHERE company_id=$1 ORDER BY created_at DESC LIMIT $2`,
        [req.user.companyId, limit]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Platform event list error:", error);
      res.status(500).json({ success: false, message: "Unable to load events" });
    }
  });

  router.post("/platform/events", ...manage, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await publishPlatformEvent({
        db,
        companyId: req.user.companyId,
        eventType: body.eventType,
        payload: body.payload || {},
        actorUserId: req.user.id || null,
        idempotencyKey: body.idempotencyKey || req.get("idempotency-key") || null,
      });
      res.status(result.inserted ? 201 : 200).json({ success: true, data: result.event, inserted: result.inserted });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Unable to publish event" });
    }
  });

  router.get("/platform/notification-subscriptions", ...manage, async (req, res) => {
    try {
      const result = await db(
        `SELECT id,company_id,object_id,event_type,recipient_type,recipient_config,title_template,message_template,active,created_by,created_at,updated_at
           FROM platform_notification_subscriptions WHERE company_id=$1 ORDER BY created_at DESC`,
        [req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Platform notification subscription list error:", error);
      res.status(500).json({ success: false, message: "Unable to load notification subscriptions" });
    }
  });

  router.post("/platform/notification-subscriptions", ...manage, async (req, res) => {
    try {
      const body = req.body || {};
      const eventType = String(body.eventType || "").trim();
      const recipientType = String(body.recipientType || "").toUpperCase();
      const recipientConfig = body.recipientConfig && typeof body.recipientConfig === "object" && !Array.isArray(body.recipientConfig)
        ? body.recipientConfig
        : {};
      const messageTemplate = String(body.messageTemplate || "").trim();
      if (!eventType || eventType.length > 200 || !["ACTOR", "USER", "FIELD"].includes(recipientType) || !messageTemplate) {
        return res.status(400).json({ success: false, message: "Event type, recipient type, and message template are required" });
      }
      const objectId = body.objectId || null;
      if (objectId) {
        const object = await db("SELECT id FROM platform_objects WHERE id=$1 AND company_id=$2 AND active=true", [objectId, req.user.companyId]);
        if (!object.rows.length) return res.status(404).json({ success: false, message: "Object not found" });
      }
      if (recipientType === "USER") {
        const userId = recipientConfig.userId || recipientConfig.user_id;
        const user = userId ? await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=true", [userId, req.user.companyId]) : { rows: [] };
        if (!user.rows.length) return res.status(400).json({ success: false, message: "Recipient must be an active user in this company" });
      }
      if (recipientType === "FIELD") {
        const fieldApiName = recipientConfig.fieldApiName || recipientConfig.field_api_name;
        if (!objectId || !fieldApiName) return res.status(400).json({ success: false, message: "Field recipients require an Object and user-reference field" });
        const field = await db(
          `SELECT id FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND active=true
             AND field_type='lookup' AND (company_id IS NULL OR company_id=$3)`,
          [objectId, fieldApiName, req.user.companyId]
        );
        if (!field.rows.length) return res.status(400).json({ success: false, message: "Recipient field is not an active lookup field on this Object" });
      }
      const result = await db(
        `INSERT INTO platform_notification_subscriptions
          (company_id,object_id,event_type,recipient_type,recipient_config,title_template,message_template,active,created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,true,$8) RETURNING *`,
        [req.user.companyId, objectId, eventType, recipientType, JSON.stringify(recipientConfig), body.titleTemplate || null,
          messageTemplate, req.user.id || null]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Platform notification subscription create error:", error);
      res.status(500).json({ success: false, message: "Unable to create notification subscription" });
    }
  });

  router.patch("/platform/notification-subscriptions/:id", ...manage, async (req, res) => {
    const active = req.body?.active === true;
    const result = await db(
      "UPDATE platform_notification_subscriptions SET active=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING id,active",
      [active, req.params.id, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Notification subscription not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/notifications", authenticate, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const result = await db(
      `SELECT id,title,message,status,delivery_status,metadata,created_at,updated_at
        FROM platform_notifications WHERE user_id=$1 AND (company_id=$2 OR company_id IS NULL)
        ORDER BY created_at DESC LIMIT $3`,
      [req.user.id, req.user.companyId, limit]
    );
    res.json({ success: true, data: result.rows });
  });

  router.patch("/platform/notifications/:id", authenticate, async (req, res) => {
    const status = String(req.body?.status || "").toUpperCase();
    if (!["UNREAD", "READ", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Notification status must be UNREAD, READ, or ARCHIVED" });
    }
    const result = await db(
      `UPDATE platform_notifications SET status=$1,updated_at=NOW()
        WHERE id=$2 AND user_id=$3 AND (company_id=$4 OR company_id IS NULL)
        RETURNING id,status,delivery_status,updated_at`,
      [status, req.params.id, req.user.id, req.user.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, data: result.rows[0] });
  });

  router.post("/platform/notifications/read-all", authenticate, async (req, res) => {
    const result = await db(
      `UPDATE platform_notifications SET status='READ',updated_at=NOW()
        WHERE user_id=$1 AND (company_id=$2 OR company_id IS NULL) AND status='UNREAD' RETURNING id`,
      [req.user.id, req.user.companyId]
    );
    res.json({ success: true, data: { updated: result.rows.length } });
  });

  router.get("/platform/webhook-subscriptions", ...manage, async (req, res) => {
    try {
      const result = await db(
        `SELECT id,company_id,event_type,target_url,credential_id,headers,payload_template,retry_policy,active,created_by,created_at,updated_at
         FROM platform_webhook_subscriptions WHERE company_id=$1 ORDER BY created_at DESC`,
        [req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Webhook subscription list error:", error);
      res.status(500).json({ success: false, message: "Unable to load webhook subscriptions" });
    }
  });

  router.post("/platform/webhook-subscriptions", ...manage, async (req, res) => {
    try {
      const body = req.body || {};
      let signingSecretCiphertext = null;
      if (body.signingSecret) {
        if (typeof encryptSecret !== "function") return res.status(503).json({ success: false, message: "Webhook secret encryption is not configured" });
        signingSecretCiphertext = await encryptSecret(String(body.signingSecret), { companyId: req.user.companyId });
      }
      const data = await createWebhookSubscription({
        db,
        companyId: req.user.companyId,
        eventType: body.eventType,
        targetUrl: body.targetUrl,
        headers: body.headers || {},
        payloadTemplate: body.payloadTemplate || {},
        retryPolicy: body.retryPolicy || {},
        credentialId: body.credentialId || null,
        signingSecretCiphertext,
        createdBy: req.user.id || null,
      });
      res.status(201).json({ success: true, data: publicSubscription(data) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Invalid webhook subscription" });
    }
  });

  router.put("/platform/webhook-subscriptions/:id", ...manage, async (req, res) => {
    try {
      const body = req.body || {};
      let signingSecretCiphertext;
      if (body.signingSecret !== undefined) {
        if (typeof encryptSecret !== "function") return res.status(503).json({ success: false, message: "Webhook secret encryption is not configured" });
        signingSecretCiphertext = body.signingSecret ? await encryptSecret(String(body.signingSecret), { companyId: req.user.companyId }) : null;
      }
      const data = await updateWebhookSubscription({
        db,
        companyId: req.user.companyId,
        subscriptionId: req.params.id,
        patch: body,
        signingSecretCiphertext,
      });
      if (!data) return res.status(404).json({ success: false, message: "Webhook subscription not found" });
      res.json({ success: true, data: publicSubscription(data) });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Invalid webhook subscription" });
    }
  });

  router.delete("/platform/webhook-subscriptions/:id", ...manage, async (req, res) => {
    try {
      const result = await deactivateWebhookSubscription({ db, companyId: req.user.companyId, subscriptionId: req.params.id });
      if (!result) return res.status(404).json({ success: false, message: "Webhook subscription not found" });
      res.json({ success: true, data: result });
    } catch (error) {
      console.error("Webhook subscription update error:", error);
      res.status(500).json({ success: false, message: "Unable to deactivate webhook subscription" });
    }
  });

  router.get("/platform/webhook-deliveries", ...manage, async (req, res) => {
    try {
      const data = await listWebhookDeliveries({ db, companyId: req.user.companyId, limit: req.query.limit });
      res.json({ success: true, data });
    } catch (error) {
      console.error("Webhook delivery list error:", error);
      res.status(500).json({ success: false, message: "Unable to load webhook deliveries" });
    }
  });

  router.get("/platform/inbound-webhook-endpoints", ...manage, async (req, res) => {
    try {
      const data = await listInboundWebhookEndpoints({ db, companyId: req.user.companyId });
      res.json({ success: true, data });
    } catch (error) {
      console.error("Inbound endpoint list error:", error);
      res.status(500).json({ success: false, message: "Unable to load inbound endpoints" });
    }
  });

  router.post("/platform/inbound-webhook-endpoints", ...manage, async (req, res) => {
    try {
      const body = req.body || {};
      const data = await createInboundWebhookEndpoint({
        db,
        companyId: req.user.companyId,
        connectorId: body.connectorId || null,
        authType: body.authType || "none",
        credentialId: body.credentialId || null,
        eventType: body.eventType,
        mapping: body.mapping || {},
        active: body.active !== false,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Invalid inbound endpoint" });
    }
  });

  router.patch("/platform/inbound-webhook-endpoints/:id", ...manage, async (req, res) => {
    try {
      const data = await updateInboundWebhookEndpoint({
        db,
        companyId: req.user.companyId,
        endpointId: req.params.id,
        patch: req.body || {},
      });
      if (!data) return res.status(404).json({ success: false, message: "Inbound endpoint not found" });
      res.json({ success: true, data });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || "Invalid inbound endpoint" });
    }
  });

  // This route must be mounted before express.json(), or the host must preserve
  // the original request bytes on req.rawBody for signature verification.
  router.post("/webhooks/inbound/:endpointKey", async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
      const result = await acceptInboundWebhook({
        db,
        endpointKey: req.params.endpointKey,
        rawBody,
        headers: req.headers || {},
        request: req,
        authenticateInbound,
      });
      if (!result.accepted) return res.status(result.status).json({ success: false, message: result.message });
      await req.ensureBusinessCommandRun?.({ companyId: result.companyId, userId: null });
      res.status(result.status).json({ success: true, duplicate: result.duplicate, inboundEventId: result.inboundEventId });
    } catch (error) {
      console.error("Inbound webhook acceptance error:", error);
      res.status(500).json({ success: false, message: "Unable to accept inbound webhook" });
    }
  });

  return router;
}
