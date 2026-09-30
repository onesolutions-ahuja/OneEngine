function getPath(value, path) {
  return String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], value);
}

function render(value, context) {
  if (!value) return "";
  return String(value).replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, path) => {
    const resolved = getPath(context, path);
    return resolved == null ? "" : typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
  });
}

async function resolveRecipient({ db, subscription, event }) {
  const config = subscription.recipient_config && typeof subscription.recipient_config === "object"
    ? subscription.recipient_config
    : {};
  let userId = null;
  if (subscription.recipient_type === "ACTOR") userId = event.payload?.actorUserId || event.actorUserId || null;
  if (subscription.recipient_type === "USER") userId = config.userId || config.user_id || null;
  if (subscription.recipient_type === "FIELD") {
    const fieldName = config.fieldApiName || config.field_api_name;
    userId = fieldName ? event.payload?.record?.[fieldName] ?? event.payload?.data?.[fieldName] ?? null : null;
  }
  if (!userId) return null;
  const user = await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=true", [userId, event.companyId]);
  return user.rows[0]?.id || null;
}

export async function deliverPlatformNotifications({ db, event }) {
  if (!event?.companyId) return { delivered: 0, skipped: 0 };
  const objectId = event.payload?.objectId || event.payload?.object_id || null;
  const subscriptions = await db(
    `SELECT * FROM platform_notification_subscriptions
      WHERE company_id=$1 AND active=true AND event_type IN ($2,'*')
        AND (object_id IS NULL OR object_id::text=$3)
      ORDER BY id`,
    [event.companyId, event.type, objectId ? String(objectId) : ""]
  );
  let delivered = 0;
  let skipped = 0;
  const context = { event: { ...event.payload, type: event.type }, record: event.payload?.record || {}, actorUserId: event.actorUserId };
  for (const subscription of subscriptions.rows || []) {
    const userId = await resolveRecipient({ db, subscription, event });
    if (!userId) {
      skipped += 1;
      continue;
    }
    const message = render(subscription.message_template, context).trim();
    if (!message) {
      skipped += 1;
      continue;
    }
    const result = await db(
      `INSERT INTO platform_notifications
        (company_id,user_id,title,message,status,delivery_status,event_id,subscription_id,metadata)
       VALUES ($1,$2,$3,$4,'UNREAD','DELIVERED',$5,$6,$7::jsonb)
       ON CONFLICT (subscription_id,event_id,user_id)
       WHERE subscription_id IS NOT NULL AND event_id IS NOT NULL AND user_id IS NOT NULL
       DO NOTHING RETURNING id`,
      [event.companyId, userId, render(subscription.title_template, context).trim() || null, message,
        event.id, subscription.id, JSON.stringify({ source: "event_subscription", eventType: event.type, objectId })]
    );
    delivered += result.rows.length;
  }
  return { delivered, skipped };
}