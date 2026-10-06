import { oneHttpRequest } from "./oneCoreFunctions.js";
import { COMMUNICATION_EVENTS, recordCommunicationEvent } from "./communicationCore.js";

const ACTIONS = Object.freeze({
  SEND_COMMUNICATION: {
    provider: null,
    entitlement: null,
    requiredPermission: "communications.send",
  },
});

const SECRET = /(token|secret|password|api[_-]?key|credential|authorization)/i;

async function loadMessageTemplate(db, companyId, templateId) {
  if (!templateId) return null;
  const result = await db(
    "SELECT subject,body,channel,active FROM platform_message_templates WHERE id=$1 AND company_id=$2 LIMIT 1",
    [templateId, companyId]
  );
  const template = result.rows[0];
  return template?.active === true ? template : null;
}

function renderTemplate(value, context = {}) {
  return String(value || "").replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, path) => {
    const resolved = path.split(".").reduce((current, key) => current == null ? undefined : current[key], context);
    return resolved == null ? "" : String(resolved);
  });
}

async function hasPermission(db, roleId, code) {
  if (!roleId) return true;
  const result = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1",
    [roleId, code]
  );
  return result.rows.length > 0;
}

export async function executeRegisteredAction({ db, action, req, companyId, userId }) {
  const type = String(action?.type || action?.key || "").toUpperCase();
  const definition = ACTIONS[type];
  if (!definition) {
    throw Object.assign(new Error(`Unsupported shared action: ${type}`), { retryable: false });
  }
  if (!(await hasPermission(db, req?.user?.roleId, definition.requiredPermission))) {
    return { status: "UNAVAILABLE", code: "PERMISSION_DENIED", retryable: false };
  }

  const template = await loadMessageTemplate(db, companyId, action.templateId);
  const channel = String(action.channel || template?.channel || "").trim().toUpperCase();
  const providerKey = String(action.providerKey || action.provider_key || "").trim();
  const recipient = action.recipient || action.to || null;
  const context = action.templateContext || {};
  const body = renderTemplate(action.body || action.message || action.templateBody || template?.body, context);
  const subject = renderTemplate(action.subject || template?.subject || "", context);
  const endpoint = String(action.endpoint || "/send").trim();

  if (!channel || !providerKey || !recipient || !body) {
    return { status: "FAILED", code: "INVALID_ACTION_PAYLOAD", retryable: false };
  }

  try {
    const result = await oneHttpRequest({
      db,
      companyId,
      storeId: action.storeId || req?.user?.storeId || null,
      providerKey,
      method: String(action.method || "POST").toUpperCase(),
      endpoint,
      variables: action.variables || {},
      query: action.query || {},
      headers: action.headers || {},
      body: action.payload || { channel, to: recipient, subject, body },
    });

    const ok = result?.success === true || (Number(result?.statusCode || 0) >= 200 && Number(result?.statusCode || 0) < 300);
    await recordCommunicationEvent({
      db,
      companyId,
      channel,
      eventType: ok ? COMMUNICATION_EVENTS.SENT : COMMUNICATION_EVENTS.FAILED,
      direction: "OUTBOUND",
      provider: providerKey,
      providerMessageId: result?.providerMessageId || result?.reference || null,
      recipient,
      templateId: action.templateId || null,
      objectId: action.objectId || null,
      recordId: action.recordId || context?.record_id || null,
      metadata: { actionType: type, statusCode: result?.statusCode || null },
    }).catch(() => null);

    return ok
      ? { status: "SUCCESS", provider: providerKey, reference: result?.providerMessageId || result?.reference || null }
      : { status: "FAILED", code: "PROVIDER_FAILED", retryable: Number(result?.statusCode || 0) >= 500 };
  } catch (error) {
    await recordCommunicationEvent({
      db,
      companyId,
      channel,
      eventType: COMMUNICATION_EVENTS.FAILED,
      direction: "OUTBOUND",
      provider: providerKey,
      recipient,
      templateId: action.templateId || null,
      objectId: action.objectId || null,
      recordId: action.recordId || context?.record_id || null,
      metadata: { actionType: type, error: String(error?.message || error).slice(0, 300) },
    }).catch(() => null);
    return { status: "FAILED", code: "PROVIDER_FAILED", retryable: error?.retryable === true };
  }
}

export function getSharedActionDefinition(type) {
  return ACTIONS[String(type || "").toUpperCase()] || null;
}

export function redactActionPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, SECRET.test(key) ? "[REDACTED]" : value]));
}
