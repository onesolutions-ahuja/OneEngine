import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { enqueuePlatformJob } from "./platformJobs.js";
import { isAllowedConnectorTarget } from "./connectorFramework.js";
import { deliverPlatformNotifications } from "./platformNotifications.js";

function envelope(row) {
  return {
    id: row.id,
    replayId: row.replay_id == null ? null : Number(row.replay_id),
    companyId: row.company_id,
    type: row.event_type,
    payload: row.payload,
    actorUserId: row.actor_user_id,
    origin: {
      type: row.origin_type || null,
      id: row.origin_id || null,
    },
    correlationId: row.correlation_id || null,
    causationEventId: row.causation_event_id || null,
    rootEventId: row.root_event_id || row.id || null,
    hopCount: Number(row.hop_count || 0),
    objectId: row.object_id || null,
    recordId: row.record_id || null,
    operation: row.operation || null,
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
    signature: row.event_signature || null,
    createdAt: row.created_at,
  };
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function eventSignature(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function changedFieldNames(previousRecord = null, record = null, operation = null) {
  const op = String(operation || "").toUpperCase();
  if (op === "CREATE") return Object.keys(record || {}).sort();
  if (op === "DELETE") return Object.keys(previousRecord || record || {}).sort();
  const keys = new Set([
    ...Object.keys(previousRecord || {}),
    ...Object.keys(record || {}),
  ]);
  return [...keys]
    .filter((key) => JSON.stringify(previousRecord?.[key] ?? null) !== JSON.stringify(record?.[key] ?? null))
    .sort();
}

function resolveEventLineage({ req = null, causationEventId = null, rootEventId = null, hopCount = null } = {}) {
  const inherited = req?.platformEvent || req?.eventContext || null;
  const parentId = causationEventId || inherited?.eventId || inherited?.id || null;
  const rootId = rootEventId || inherited?.rootEventId || inherited?.root_event_id || parentId || null;
  const inheritedHop = Number(inherited?.hopCount ?? inherited?.hop_count ?? -1);
  const resolvedHop = hopCount == null
    ? (parentId ? inheritedHop + 1 : 0)
    : Number(hopCount || 0);
  return { causationEventId: parentId, rootEventId: rootId, hopCount: resolvedHop };
}

async function safeTargetUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Webhook targetUrl must be an absolute HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Webhook targetUrl must use HTTPS without embedded credentials");
  if (!(await isAllowedConnectorTarget(url.toString()))) throw new Error("Webhook targetUrl cannot point to a private or reserved address");
  return url.toString();
}

function safeHeaders(headers = {}) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) throw new Error("Webhook headers must be an object");
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /^(host|content-length|connection|transfer-encoding)$/i.test(key)) {
      throw new Error(`Webhook header is not allowed: ${key}`);
    }
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error(`Webhook header ${key} must be a string or scalar`);
    result[key] = String(value);
  }
  return result;
}

function resolveTemplatePath(root, path) {
  return String(path).split(".").reduce((value, key) => value == null ? undefined : value[key], root);
}

function renderTemplate(value, context) {
  if (Array.isArray(value)) return value.map((entry) => renderTemplate(entry, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, renderTemplate(entry, context)]));
  if (typeof value !== "string") return value;
  return value.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, path) => {
    const resolved = resolveTemplatePath(context, path);
    return resolved == null ? "" : typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

function eventFromRow(row) {
  return envelope(row);
}

export async function registerPlatformEventType({ db, eventType, description = null, sourcePackageId = null }) {
  const key = String(eventType || "").trim();
  if (!key || key.length > 200) throw new Error("eventType must contain 1 to 200 characters");
  const result = await db(
    `INSERT INTO platform_event_types(event_type,description,source_package_id,active)
     VALUES($1,$2,$3,TRUE)
     ON CONFLICT(event_type) DO UPDATE SET description=EXCLUDED.description,source_package_id=EXCLUDED.source_package_id,active=TRUE
     RETURNING *`,
    [key, description, sourcePackageId]
  );
  return result.rows[0];
}

export async function publishPlatformEvent({
  db,
  companyId = null,
  eventType,
  payload = {},
  actorUserId = null,
  idempotencyKey = null,
  originType = null,
  originId = null,
  correlationId = null,
  causationEventId = null,
  rootEventId = null,
  hopCount = null,
  objectId = null,
  recordId = null,
  operation = null,
  changedFields = [],
  signature = null,
  req = null,
}) {
  const type = String(eventType || "").trim();
  if (!type || type.length > 200) throw new Error("eventType must contain 1 to 200 characters");
  if (!payload || typeof payload !== "object") throw new Error("Event payload must be an object or array");
  const lineage = resolveEventLineage({ req, causationEventId, rootEventId, hopCount });
  if (lineage.hopCount > 16) {
    return { event: null, inserted: false, skipped: true, reason: "EVENT_HOP_LIMIT", notifications: { delivered: 0, skipped: 0 } };
  }
  const normalizedChangedFields = Array.isArray(changedFields) ? [...new Set(changedFields.map(String))].sort() : [];
  const derivedSignature = signature || eventSignature({
    type,
    objectId,
    recordId,
    operation,
    changedFields: normalizedChangedFields,
    payload,
  });

  if (lineage.rootEventId && derivedSignature) {
    const loop = await db(
      `SELECT id,replay_id FROM platform_events
        WHERE root_event_id=$1 AND event_signature=$2
        LIMIT 1`,
      [lineage.rootEventId, derivedSignature]
    );
    if (loop.rows?.length) {
      return {
        event: eventFromRow(loop.rows[0]),
        inserted: false,
        skipped: true,
        reason: "EVENT_LOOP_PREVENTED",
        notifications: { delivered: 0, skipped: 0 },
      };
    }
  }

  const result = await db(
    `INSERT INTO platform_events(
       company_id,event_type,payload,actor_user_id,idempotency_key,
       origin_type,origin_id,correlation_id,causation_event_id,root_event_id,hop_count,
       object_id,record_id,operation,changed_fields,event_signature
     )
     VALUES($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
     ON CONFLICT(company_id,idempotency_key) DO NOTHING RETURNING *`,
    [
      companyId,
      type,
      JSON.stringify(payload),
      actorUserId,
      idempotencyKey,
      originType,
      originId,
      correlationId,
      lineage.causationEventId,
      lineage.rootEventId,
      lineage.hopCount,
      objectId,
      recordId,
      operation,
      JSON.stringify(normalizedChangedFields),
      derivedSignature,
    ]
  );
  let row = result.rows[0];
  const inserted = Boolean(row);
  if (!row && idempotencyKey) {
    const existing = await db("SELECT * FROM platform_events WHERE company_id IS NOT DISTINCT FROM $1 AND idempotency_key=$2", [companyId, idempotencyKey]);
    row = existing.rows[0];
  }
  if (!row) throw new Error("Unable to persist platform event");
  if (!row.root_event_id) {
    const rooted = await db(
      "UPDATE platform_events SET root_event_id=id WHERE id=$1 AND root_event_id IS NULL RETURNING *",
      [row.id]
    );
    row = rooted.rows?.[0] || row;
  }
  let notifications = { delivered: 0, skipped: 0 };
  if (inserted && row.company_id) {
    const deliveries = await db(
      `INSERT INTO platform_webhook_deliveries(company_id,subscription_id,event_id)
       SELECT s.company_id,s.id,$3 FROM platform_webhook_subscriptions s
       WHERE s.company_id=$1 AND s.event_type IN ($2,'*') AND s.active=TRUE
       ON CONFLICT(subscription_id,event_id) DO NOTHING
       RETURNING id,company_id,attempts`,
      [row.company_id, row.event_type, row.id]
    );
    for (const delivery of deliveries.rows) {
      await enqueuePlatformJob({
        db,
        companyId: delivery.company_id,
        kind: "PLATFORM_WEBHOOK_DELIVERY",
        payload: { deliveryId: delivery.id, companyId: delivery.company_id },
        idempotencyKey: `webhook-delivery:${delivery.id}:attempt:1`,
      });
    }
    try {
      notifications = await deliverPlatformNotifications({ db, event: eventFromRow(row) });
    } catch (error) {
      console.error("Platform event notification delivery error:", error);
    }

    /* Any registered Platform event can be a workflow trigger. Rules store the
       exact event_type in trigger_key, so the Event Registry is the single
       vocabulary used by publishers and the Builder. Event workflows run as
       durable jobs and are idempotent per workflow/event pair. */
    try {
      const workflows = await db(
        `SELECT r.id,r.name,r.object_id
           FROM platform_rules r
          WHERE r.company_id=$1 AND r.active=TRUE
            AND COALESCE(r.lifecycle_status,'ACTIVE')='ACTIVE'
            AND r.trigger_key=$2
            AND r.action->>'type'='workflow'
          ORDER BY r.created_at,r.id`,
        [row.company_id, row.event_type]
      );
      for (const workflow of workflows.rows || []) {
        await enqueuePlatformJob({
          db,
          companyId: row.company_id,
          kind: "PLATFORM_EVENT_WORKFLOW",
          payload: {
            workflowId: workflow.id,
            eventId: row.id,
            eventType: row.event_type,
            objectId: workflow.object_id || payload?.objectId || null,
            recordId: payload?.recordId || payload?.id || null,
            record: payload?.record || payload || null,
            actorUserId: row.actor_user_id || null,
            replayId: row.replay_id || null,
            originType: row.origin_type || null,
            originId: row.origin_id || null,
            correlationId: row.correlation_id || null,
            causationEventId: row.causation_event_id || null,
            rootEventId: row.root_event_id || row.id,
            hopCount: Number(row.hop_count || 0),
            eventSignature: row.event_signature || null,
          },
          idempotencyKey: `event-workflow:${workflow.id}:${row.id}`,
        });
      }
    } catch (error) {
      console.error("Platform event workflow dispatch error:", error);
    }
  }
  return { event: eventFromRow(row), inserted, notifications };
}

export async function createWebhookSubscription({
  db, companyId, eventType, targetUrl, headers = {}, payloadTemplate = {}, signingSecretCiphertext = null, credentialId = null,
  retryPolicy = {}, createdBy = null,
}) {
  const type = String(eventType || "").trim();
  if (!type || type.length > 200) throw new Error("A valid eventType is required");
  const url = await safeTargetUrl(targetUrl);
  const cleanHeaders = safeHeaders(headers);
  if (!payloadTemplate || typeof payloadTemplate !== "object" || Array.isArray(payloadTemplate)) throw new Error("payloadTemplate must be an object");
  const policy = {
    maxAttempts: Math.min(Math.max(Number(retryPolicy.maxAttempts) || 5, 1), 20),
    backoffMs: Math.min(Math.max(Number(retryPolicy.backoffMs) || 1000, 250), 86_400_000),
  };
  const result = await db(
    `INSERT INTO platform_webhook_subscriptions
      (company_id,event_type,target_url,credential_id,headers,payload_template,signing_secret_ciphertext,retry_policy,created_by)
     VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8::jsonb,$9) RETURNING *`,
    [companyId, type, url, credentialId, JSON.stringify(cleanHeaders), JSON.stringify(payloadTemplate), signingSecretCiphertext, JSON.stringify(policy), createdBy]
  );
  return result.rows[0];
}

export async function updateWebhookSubscription({ db, companyId, subscriptionId, patch = {}, signingSecretCiphertext }) {
  const existing = await db("SELECT * FROM platform_webhook_subscriptions WHERE id=$1 AND company_id=$2", [subscriptionId, companyId]);
  if (!existing.rows.length) return null;
  const current = existing.rows[0];
  const url = await safeTargetUrl(patch.targetUrl ?? patch.target_url ?? current.target_url);
  const headers = safeHeaders(patch.headers ?? current.headers);
  const payloadTemplate = patch.payloadTemplate ?? patch.payload_template ?? current.payload_template;
  if (!payloadTemplate || typeof payloadTemplate !== "object" || Array.isArray(payloadTemplate)) throw new Error("payloadTemplate must be an object");
  const retry = patch.retryPolicy ?? patch.retry_policy ?? current.retry_policy ?? {};
  const retryPolicy = {
    maxAttempts: Math.min(Math.max(Number(retry.maxAttempts) || 5, 1), 20),
    backoffMs: Math.min(Math.max(Number(retry.backoffMs) || 1000, 250), 86_400_000),
  };
  const type = String(patch.eventType ?? patch.event_type ?? current.event_type).trim();
  if (!type || type.length > 200) throw new Error("A valid eventType is required");
  const secret = signingSecretCiphertext === undefined ? current.signing_secret_ciphertext : signingSecretCiphertext;
  const result = await db(
    `UPDATE platform_webhook_subscriptions SET event_type=$1,target_url=$2,headers=$3::jsonb,payload_template=$4::jsonb,
       signing_secret_ciphertext=$5,retry_policy=$6::jsonb,active=$7,updated_at=NOW()
     WHERE id=$8 AND company_id=$9 RETURNING *`,
    [type, url, JSON.stringify(headers), JSON.stringify(payloadTemplate), secret, JSON.stringify(retryPolicy),
      patch.active === undefined ? current.active : patch.active === true, subscriptionId, companyId]
  );
  return result.rows[0] || null;
}

export async function deactivateWebhookSubscription({ db, companyId, subscriptionId }) {
  const result = await db(
    "UPDATE platform_webhook_subscriptions SET active=FALSE,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id,active",
    [subscriptionId, companyId]
  );
  return result.rows[0] || null;
}

export async function listWebhookDeliveries({ db, companyId, limit = 100 }) {
  const result = await db(
    `SELECT d.id,d.company_id,d.subscription_id,d.event_id,d.status,d.attempts,d.next_attempt_at,
       d.last_http_status,d.last_error,d.response_excerpt,d.created_at,d.updated_at
     FROM platform_webhook_deliveries d WHERE d.company_id=$1
     ORDER BY d.created_at DESC LIMIT $2`,
    [companyId, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return result.rows;
}

export async function getWebhookDelivery({ db, companyId, deliveryId }) {
  const result = await db(
    `SELECT d.*,s.target_url,s.headers,s.payload_template,s.signing_secret_ciphertext,s.retry_policy,
       e.event_type,e.payload,e.actor_user_id,e.created_at AS event_created_at
     FROM platform_webhook_deliveries d
     JOIN platform_webhook_subscriptions s ON s.id=d.subscription_id AND s.company_id=d.company_id
     JOIN platform_events e ON e.id=d.event_id
     WHERE d.id=$1 AND d.company_id=$2`,
    [deliveryId, companyId]
  );
  return result.rows[0] || null;
}

function signBody(secret, timestamp, body) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function constantTimeStringEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWebhookSignature({ secret, timestamp, body, signature, toleranceSeconds = 300, now = Date.now() }) {
  if (!secret || !timestamp || !body || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) return false;
  return constantTimeStringEqual(signBody(secret, seconds, body), signature);
}

/**
 * Worker entry point for PLATFORM_WEBHOOK_DELIVERY. Supply decryptSecret to
 * resolve signing_secret_ciphertext; deliveries are at-least-once, identified
 * to receivers by the stable X-OnePOS-Delivery-Id header.
 */
export async function deliverPlatformWebhook({ db, deliveryId, companyId, decryptSecret, fetchImpl = fetch, now = new Date() }) {
  if (!deliveryId || !companyId) throw new Error("Webhook delivery job requires deliveryId and companyId");
  const claimed = await db(
    `UPDATE platform_webhook_deliveries SET status='RUNNING',attempts=attempts+1,updated_at=$1
     WHERE id=$2 AND company_id=$3 AND (
       (status='PENDING' AND next_attempt_at <= $1) OR
       (status='RUNNING' AND updated_at <= $1 - INTERVAL '5 minutes')
     ) RETURNING id,attempts`,
    [now, deliveryId, companyId]
  );
  if (!claimed.rows.length) return { status: "SKIPPED" };
  const delivery = await getWebhookDelivery({ db, companyId, deliveryId });
  if (!delivery) return { status: "SKIPPED" };
  const event = {
    id: delivery.event_id,
    companyId: delivery.company_id,
    type: delivery.event_type,
    payload: delivery.payload,
    actorUserId: delivery.actor_user_id,
    createdAt: delivery.event_created_at,
  };
  const template = delivery.payload_template && Object.keys(delivery.payload_template).length ? delivery.payload_template : event;
  const body = JSON.stringify(renderTemplate(template, { event, ...event }));
  const headers = { ...safeHeaders(delivery.headers), "content-type": "application/json", "x-onepos-event": delivery.event_type, "x-onepos-delivery-id": delivery.id };
  let responseStatus = null;
  let responseExcerpt = null;
  let failure = null;
  try {
    const targetUrl = await safeTargetUrl(delivery.target_url);
    if (delivery.signing_secret_ciphertext) {
      if (typeof decryptSecret !== "function") throw new Error("Webhook signing secret decryption is not configured");
      const secret = await decryptSecret(delivery.signing_secret_ciphertext);
      if (!secret) throw new Error("Webhook signing secret could not be decrypted");
      const timestamp = String(Math.floor(now.getTime() / 1000));
      headers["x-onepos-timestamp"] = timestamp;
      headers["x-onepos-signature"] = signBody(secret, timestamp, body);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(targetUrl, { method: "POST", headers, body, signal: controller.signal, redirect: "error" });
      responseStatus = response.status;
      responseExcerpt = (await response.text()).slice(0, 2000);
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    failure = error;
  }

  const attempts = claimed.rows[0].attempts;
  if (!failure) {
    await db(
      `UPDATE platform_webhook_deliveries SET status='DELIVERED',last_http_status=$1,response_excerpt=$2,last_error=NULL,updated_at=NOW()
       WHERE id=$3 AND company_id=$4`,
      [responseStatus, responseExcerpt, deliveryId, companyId]
    );
    return { status: "DELIVERED", attempts, httpStatus: responseStatus };
  }

  const retryPolicy = delivery.retry_policy || {};
  const maxAttempts = Math.min(Math.max(Number(retryPolicy.maxAttempts) || 5, 1), 20);
  const baseDelay = Math.min(Math.max(Number(retryPolicy.backoffMs) || 1000, 250), 86_400_000);
  const retryAt = attempts < maxAttempts ? new Date(now.getTime() + Math.min(baseDelay * (2 ** Math.max(attempts - 1, 0)), 86_400_000)) : null;
  await db(
    `UPDATE platform_webhook_deliveries SET status=$1,next_attempt_at=COALESCE($2,next_attempt_at),last_http_status=$3,
       last_error=$4,response_excerpt=$5,updated_at=NOW() WHERE id=$6 AND company_id=$7`,
    [retryAt ? "PENDING" : "FAILED", retryAt, responseStatus, String(failure.message || failure).slice(0, 2000), responseExcerpt, deliveryId, companyId]
  );
  if (retryAt) {
    await enqueuePlatformJob({
      db,
      companyId,
      kind: "PLATFORM_WEBHOOK_DELIVERY",
      payload: { deliveryId, companyId },
      runAt: retryAt,
      idempotencyKey: `webhook-delivery:${deliveryId}:attempt:${attempts + 1}`,
    });
  }
  return { status: retryAt ? "PENDING" : "FAILED", attempts, error: String(failure.message || failure) };
}

export async function dispatchDueWebhookDeliveries({ db, companyId = null, limit = 100, now = new Date() }) {
  const result = await db(
    `SELECT id,company_id,attempts FROM platform_webhook_deliveries
     WHERE status='PENDING' AND next_attempt_at <= $1 AND ($2::uuid IS NULL OR company_id=$2)
     ORDER BY next_attempt_at,created_at LIMIT $3`,
    [now, companyId, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  const queued = [];
  for (const row of result.rows) {
    const attempt = Number(row.attempts) + 1;
    const job = await enqueuePlatformJob({
      db,
      companyId: row.company_id,
      kind: "PLATFORM_WEBHOOK_DELIVERY",
      payload: { deliveryId: row.id, companyId: row.company_id },
      runAt: now,
      idempotencyKey: `webhook-delivery:${row.id}:attempt:${attempt}`,
    });
    queued.push({ deliveryId: row.id, jobId: job?.id || null, enqueued: Boolean(job) });
  }
  return queued;
}

function valueAtPath(object, path) {
  return String(path || "").split(".").reduce((value, part) => value == null ? undefined : value[part], object);
}

export async function createInboundWebhookEndpoint({
  db, companyId = null, connectorId = null, authType = "none", credentialId = null, eventType, mapping = {}, active = true,
}) {
  const type = String(eventType || "").trim();
  if (!type || type.length > 200) throw new Error("A valid eventType is required");
  const endpointKey = randomBytes(24).toString("hex");
  const result = await db(
    `INSERT INTO platform_inbound_webhook_endpoints(company_id,connector_id,endpoint_key,auth_type,credential_id,event_type,mapping,active)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
    [companyId, connectorId, endpointKey, String(authType || "none"), credentialId, type, JSON.stringify(mapping || {}), active !== false]
  );
  return result.rows[0];
}

export async function listInboundWebhookEndpoints({ db, companyId }) {
  const result = await db(
    `SELECT id,company_id,connector_id,endpoint_key,auth_type,credential_id,event_type,mapping,active,created_at
     FROM platform_inbound_webhook_endpoints WHERE company_id=$1 ORDER BY created_at DESC`,
    [companyId]
  );
  return result.rows;
}

export async function updateInboundWebhookEndpoint({ db, companyId, endpointId, patch = {} }) {
  const result = await db(
    `UPDATE platform_inbound_webhook_endpoints e SET event_type=COALESCE($1,e.event_type),
       auth_type=COALESCE($2,e.auth_type),credential_id=CASE WHEN $3 THEN $4 ELSE e.credential_id END,
       mapping=COALESCE($5::jsonb,e.mapping),active=COALESCE($6,e.active)
     WHERE e.id=$7 AND e.company_id=$8 RETURNING e.id,e.company_id,e.event_type,e.auth_type,e.credential_id,e.mapping,e.active,e.created_at`,
    [
      patch.eventType ?? null, patch.authType ?? null, patch.credentialId !== undefined, patch.credentialId ?? null,
      patch.mapping === undefined ? null : JSON.stringify(patch.mapping), patch.active === undefined ? null : patch.active === true,
      endpointId, companyId,
    ]
  );
  return result.rows[0] || null;
}

/**
 * Persist and deduplicate an inbound delivery using its endpoint-scoped event
 * id. authenticateInbound receives the endpoint, exact raw bytes, parsed JSON,
 * headers, and request; return true (or { valid: true }) only after auth passes.
 */
export async function acceptInboundWebhook({
  db, endpointKey, rawBody, headers = {}, request = null, authenticateInbound = null,
}) {
  const endpointResult = await db(
    "SELECT * FROM platform_inbound_webhook_endpoints WHERE endpoint_key=$1 AND active=TRUE",
    [endpointKey]
  );
  const endpoint = endpointResult.rows[0];
  if (!endpoint) return { accepted: false, status: 404, message: "Webhook endpoint not found" };
  if (!Buffer.isBuffer(rawBody)) return { accepted: false, status: 415, message: "Raw webhook body is required" };
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { accepted: false, status: 400, message: "Webhook body must be valid JSON" };
  }
  let authenticated = endpoint.auth_type === "none";
  if (endpoint.auth_type !== "none") {
    if (typeof authenticateInbound !== "function") return { accepted: false, status: 503, message: "Inbound webhook authentication is not configured" };
    const auth = await authenticateInbound({ endpoint, rawBody, payload, headers, request });
    authenticated = auth === true || auth?.valid === true;
  }
  if (!authenticated) return { accepted: false, status: 401, message: "Webhook authentication failed" };

  const mapping = endpoint.mapping || {};
  const externalEventId = headers["x-event-id"] || headers["x-webhook-id"] ||
    (mapping.externalIdPath ? valueAtPath(payload, mapping.externalIdPath) : null) || payload?.event_id || payload?.eventId || payload?.id || null;
  const inserted = await db(
    `INSERT INTO platform_inbound_webhook_events(endpoint_id,company_id,external_event_id,payload,signature_valid,status)
     VALUES($1,$2,$3,$4::jsonb,TRUE,'RECEIVED')
     ON CONFLICT(endpoint_id,external_event_id) DO NOTHING RETURNING *`,
    [endpoint.id, endpoint.company_id, externalEventId ? String(externalEventId).slice(0, 255) : null, JSON.stringify(payload)]
  );
  let inbound = inserted.rows[0];
  const duplicate = !inbound && Boolean(externalEventId);
  if (duplicate) {
    const previous = await db(
      "SELECT * FROM platform_inbound_webhook_events WHERE endpoint_id=$1 AND external_event_id=$2",
      [endpoint.id, String(externalEventId).slice(0, 255)]
    );
    inbound = previous.rows[0];
  }
  if (!inbound) throw new Error("Unable to persist inbound webhook event");
  if (endpoint.company_id) {
    await publishPlatformEvent({
      db,
      companyId: endpoint.company_id,
      eventType: endpoint.event_type,
      payload,
      idempotencyKey: externalEventId ? `inbound:${endpoint.id}:${externalEventId}` : `inbound:${inbound.id}`,
    });
  }
  return { accepted: true, duplicate, inboundEventId: inbound.id, companyId: endpoint.company_id, status: duplicate ? 200 : 202 };
}

export { safeTargetUrl };


export async function publishRecordChangeEvent({
  db,
  companyId,
  object,
  record,
  previousRecord = null,
  operation,
  actorUserId = null,
  req = null,
  originType = null,
  originId = null,
  correlationId = null,
  idempotencyKey = null,
  archived = false,
}) {
  const op = String(operation || "").toUpperCase();
  if (!["CREATE", "UPDATE", "DELETE"].includes(op)) throw new Error("Record change operation must be CREATE, UPDATE or DELETE");
  const objectId = object?.id || null;
  const objectKey = object?.object_key || object?.objectKey || null;
  const recordId = record?.id || previousRecord?.id || null;
  const changedFields = changedFieldNames(previousRecord, record, op);
  const eventType = `platform.object.record.${op === "CREATE" ? "created" : op === "UPDATE" ? "updated" : "deleted"}`;
  const correlation = correlationId
    || req?.executionContext?.globals?.$Request?.correlationId
    || req?.headers?.["x-request-id"]
    || req?.headers?.["x-correlation-id"]
    || null;
  const origin = originType
    || req?.executionContext?.globals?.$Trigger?.source
    || req?.executionSource
    || req?.platformEvent?.originType
    || (req?.method === "JOB" ? "JOB" : "API");

  return publishPlatformEvent({
    db,
    companyId,
    eventType,
    payload: {
      objectId,
      objectKey,
      recordId,
      operation: op,
      changedFields,
      previousRecord: previousRecord || null,
      record: record || null,
      archived: archived === true,
    },
    actorUserId,
    idempotencyKey,
    originType: String(origin || "SYSTEM").toUpperCase(),
    originId: originId || req?.platformEvent?.eventId || req?.platformEvent?.id || null,
    correlationId: correlation,
    objectId,
    recordId,
    operation: op,
    changedFields,
    req,
  });
}
