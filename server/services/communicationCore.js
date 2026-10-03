import { publishPlatformEvent } from "./platformEvents.js";

export const COMMUNICATION_CHANNELS = Object.freeze(["EMAIL", "SMS", "WHATSAPP"]);

export const COMMUNICATION_EVENTS = Object.freeze({
  RECEIVED: "communication.message_received",
  SENT: "communication.message_sent",
  DELIVERED: "communication.message_delivered",
  FAILED: "communication.message_failed",
  OPTED_OUT: "communication.opted_out",
  HANDOFF: "communication.handoff",
});

export function normalizeCommunicationChannel(value) {
  const channel = String(value || "").trim().toUpperCase();
  return COMMUNICATION_CHANNELS.includes(channel) ? channel : null;
}

export function communicationTriggerKey(eventType) {
  return String(eventType || "").trim().replace(/\./g, "_");
}

export async function recordCommunicationEvent({
  db,
  companyId,
  channel,
  eventType,
  direction = null,
  provider = null,
  providerMessageId = null,
  recipient = null,
  sender = null,
  templateId = null,
  objectId = null,
  recordId = null,
  communicationId = null,
  body = null,
  metadata = {},
}) {
  if (!db || !companyId) return null;
  const normalizedChannel = normalizeCommunicationChannel(channel);
  if (!normalizedChannel) throw new Error(`Unsupported communication channel: ${channel}`);
  if (!Object.values(COMMUNICATION_EVENTS).includes(eventType)) {
    throw new Error(`Unsupported communication event: ${eventType}`);
  }
  const result = await db(
    `INSERT INTO platform_communication_events
      (company_id,channel,event_type,direction,provider,provider_message_id,recipient,sender,
       template_id,object_id,record_id,communication_id,body,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     RETURNING *`,
    [
      companyId,
      normalizedChannel,
      eventType,
      direction,
      provider,
      providerMessageId,
      recipient,
      sender,
      templateId,
      objectId,
      recordId,
      communicationId,
      body ?? metadata?.body ?? metadata?.text ?? null,
      JSON.stringify(metadata || {}),
    ]
  );
  const event = result.rows?.[0] || null;
  if (event) {
    await publishPlatformEvent({
      db,
      companyId,
      eventType: communicationTriggerKey(eventType),
      payload: {
        id: event.id,
        communicationEventId: event.id,
        channel: normalizedChannel,
        eventType,
        direction,
        provider,
        providerMessageId,
        recipient,
        sender,
        templateId,
        objectId,
        recordId,
        communicationId,
        // Workflow records are built from this event payload. Keep message text
        // at the top level as well as in metadata so bindings such as
        // { path: "body" } work for inbound communication workflows.
        body: body ?? metadata?.body ?? metadata?.text ?? null,
        text: body ?? metadata?.text ?? metadata?.body ?? null,
        metadata: metadata || {},
      },
      idempotencyKey: `communication:${event.id}`,
    });
  }
  return event;
}

export async function findCommunicationWorkflows({
  db,
  companyId,
  eventType,
  channel,
  scope = null,
}) {
  if (!db || !companyId) return [];
  const normalizedChannel = normalizeCommunicationChannel(channel);
  const triggerKey = communicationTriggerKey(eventType);
  const result = await db(
    `SELECT id,name,object_id,action
       FROM platform_rules
      WHERE company_id=$1
        AND active=true
        AND trigger_key=$2
        AND action->>'type'='workflow'
        AND (
          COALESCE(action->>'channel','')=''
          OR UPPER(action->>'channel')=$3
        )
        AND (
          $4::text IS NULL
          OR COALESCE(action->>'scope','')=''
          OR action->>'scope'=$4
        )
      ORDER BY created_at,id`,
    [companyId, triggerKey, normalizedChannel, scope]
  );
  return result.rows || [];
}
