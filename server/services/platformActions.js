import { decryptSecret } from "./onlineOrders/platformConfig.js";
import { getCompanyEntitlements, hasEntitlement } from "./licensing.js";
import { sendEmailViaProvider, sendSmsViaProvider, sendSmsViaTwilio } from "./invoiceDelivery.js";
import { oneHttpRequest } from "./oneCoreFunctions.js";
import { COMMUNICATION_EVENTS, recordCommunicationEvent } from "./communicationCore.js";
import { decryptCredentials } from "./integrationCredentials.js";
import { createSmsGateDriver } from "./smsGateConnector.js";

const ACTIONS = {
  SEND_EMAIL: { provider: "EMAIL", entitlement: "communications.email" },
  SEND_SMS: { provider: "SMS", entitlement: "communications.sms" },
  SEND_WHATSAPP: { provider: "WHATSAPP", entitlement: "communications.whatsapp" },
};
const PERMISSIONS = "communications.send";

const SECRET = /(token|secret|password|api[_-]?key|credential|authorization)/i;
const safeError = (error) => ({ message: String(error?.message || error).slice(0, 500), retryable: error?.retryable === true });

async function provider(db, companyId, kind) {
  const aliases = { EMAIL: ["email_invoice", "email", "smtp", "mail"], SMS: ["sms_invoice", "sms", "twilio"], WHATSAPP: ["whatsapp", "whatsapp_business"] }[kind] || [kind.toLowerCase()];
  const result = await db("SELECT provider,configuration,active FROM integrations WHERE company_id=$1 AND lower(provider)=ANY($2::text[]) ORDER BY array_position($2::text[], lower(provider)) LIMIT 1", [companyId, aliases]);
  const row = result.rows[0];
  const config = row?.configuration && typeof row.configuration === "object" ? row.configuration : {};

  if (row && row.active === true && Object.keys(config).length) {
    const endpoint = config.endpoint || config.api_base_url || config.url;
    const apiKey = decryptSecret(config.auth_token) || decryptSecret(config.api_key) || null;
    if (endpoint && apiKey) {
      return { provider: String(row.provider || kind).toLowerCase(), endpoint, apiKey, authScheme: config.auth_scheme === "bearer" ? "bearer" : "raw", config };
    }
  }

  // Prefer the installed SMSGate connector when SMS is configured through OneConnect.
  if (kind === "SMS") {
    const connector = await db(
      `SELECT id,connector_configuration,credentials_encrypted
         FROM integration_connections
        WHERE company_id=$1 AND connector_package_key='smsgate_connector' AND enabled=true
        ORDER BY updated_at DESC LIMIT 1`,
      [companyId]
    );
    const row = connector.rows?.[0];
    if (row) {
      let secrets = {};
      try { secrets = decryptCredentials(row.credentials_encrypted) || {}; } catch { secrets = {}; }
      return {
        provider: "smsgate",
        connectorId: row.id,
        config: { ...(row.connector_configuration || {}), ...secrets },
      };
    }
  }

  // Development/hosted Twilio fallback. Credentials remain server-side in
  // Render environment variables; they are never exposed to the frontend.
  if (kind === "SMS") {
    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    const from = String(process.env.TWILIO_FROM_NUMBER || "").trim();
    if (accountSid && authToken && from) {
      return {
        provider: "twilio",
        twilio: { accountSid, authToken, from },
        config: { sender: from },
      };
    }
  }

  return null;
}

async function loadMessageTemplate(db, companyId, templateId) {
  if (!templateId) return null;
  const result = await db(
    "SELECT subject,body,channel,active FROM platform_message_templates WHERE id=$1 AND company_id=$2 LIMIT 1",
    [templateId, companyId]
  );
  const template = result.rows[0];
  return template?.active === true ? template : null;
}

function templateMatchesAction(template, type) {
  if (!template) return true;
  const channel = String(template.channel || "").toUpperCase();
  const expected = type === "SEND_EMAIL" ? "EMAIL" : type === "SEND_SMS" ? "SMS" : "WHATSAPP";
  return channel === expected;
}

async function resolveMessageTemplate(db, companyId, action) {
  const template = await loadMessageTemplate(db, companyId, action.templateId);
  return action.message || action.body || action.templateBody || template?.body || null;
}

function renderTemplate(value, context = {}) {
  return String(value || "").replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, path) => {
    const resolved = path.split(".").reduce((current, key) => current == null ? undefined : current[key], context);
    return resolved == null ? "" : String(resolved);
  });
}

export async function executeRegisteredAction({ db, action, req, companyId, userId }) {
  const type = String(action?.type || action?.key || "").toUpperCase();
  if (req?.user?.roleId) {
    const permission = await db("SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1", [req.user.roleId, PERMISSIONS]);
    if (!permission.rows.length) return { status: "UNAVAILABLE", code: "PERMISSION_DENIED", retryable: false };
  }
  if (type === "SEND_IN_APP_NOTIFICATION") {
    const message = await resolveMessageTemplate(db, companyId, action);
    if (!message) return { status: "FAILED", code: "INVALID_ACTION_PAYLOAD", retryable: false };
    await db(
      "INSERT INTO platform_notifications (company_id,user_id,title,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [companyId, userId || req?.user?.id || null, action.title || null, message, JSON.stringify({ source: "registered_action" })]
    );
    return { status: "SUCCESS" };
  }
  const definition = ACTIONS[type];
  if (!definition) throw Object.assign(new Error(`Unsupported shared action: ${type}`), { retryable: false });
  const entitlements = await getCompanyEntitlements(db, companyId);
  let entitled = type === "SEND_WHATSAPP"
    ? (hasEntitlement(entitlements, definition.entitlement) || hasEntitlement(entitlements, "whatsapp_assistant"))
    : hasEntitlement(entitlements, definition.entitlement);

  // A tenant-scoped, administrator-enabled communication connector is itself
  // the channel capability for registered workflow actions. Keep commercial
  // app licensing separate from provider configuration: OneAssistant can be
  // licensed/trialled independently while WhatsApp/SMSGate supply transport.
  if (!entitled && type === "SEND_SMS") {
    const configuredSmsGate = await db(
      `SELECT 1
         FROM integration_connections
        WHERE company_id=$1
          AND connector_package_key='smsgate_connector'
          AND enabled=TRUE
        LIMIT 1`,
      [companyId]
    );
    entitled = configuredSmsGate.rows.length > 0;
  }

  if (!entitled && type === "SEND_WHATSAPP") {
    const connectorLicensed = hasEntitlement(entitlements, "package:whatsapp_connector");
    const configuredWhatsApp = await db(
      `SELECT 1
         FROM integrations
        WHERE company_id=$1
          AND lower(provider) IN ('whatsapp','whatsapp_business')
          AND active=TRUE
          AND NULLIF(configuration->>'phone_number_id','') IS NOT NULL
          AND NULLIF(configuration->>'access_token','') IS NOT NULL
        LIMIT 1`,
      [companyId]
    );
    // Existing tenants may have the canonical WhatsApp integration configured
    // before the connector package catalogue existed. The active provider row
    // is the same tenant-scoped runtime used by sendWhatsAppTextMessage, so it
    // is a valid transport capability. New installs also expose
    // package:whatsapp_connector through normal package entitlements.
    entitled = connectorLicensed || configuredWhatsApp.rows.length > 0;
  }

  if (!entitled) {
    return { status: "UNAVAILABLE", code: "ENTITLEMENT_REQUIRED", retryable: false };
  }

  const template = await loadMessageTemplate(db, companyId, action.templateId);
  if (template && !templateMatchesAction(template, type)) return { status: "FAILED", code: "TEMPLATE_CHANNEL_MISMATCH", retryable: false };
  const recipientSpec = action.recipient || action.to;
  const recipients = recipientSpec === "platform_superadmins" || recipientSpec === "platform_admins"
    ? (await db(
        `SELECT DISTINCT u.email
           FROM users u
           JOIN role_permissions rp ON rp.role_id=u.role_id
           JOIN permissions p ON p.id=rp.permission_id
          WHERE u.active=true AND u.email IS NOT NULL AND p.code='oneengine.manage'`
      )).rows.map((row) => row.email)
    : [recipientSpec];
  const body = renderTemplate(action.body || action.message || action.templateBody || template?.body, action.templateContext || {});
  if (!recipientSpec || !body) return { status: "FAILED", code: "INVALID_ACTION_PAYLOAD", retryable: false };
  if (!recipients.filter(Boolean).length) return { status: "FAILED", code: "PLATFORM_ADMIN_RECIPIENT_UNAVAILABLE", retryable: false };

  const results = [];
  if (type === "SEND_WHATSAPP") {
    for (const recipient of recipients.filter(Boolean)) {
      const providerResult = await oneHttpRequest({
        db,
        companyId,
        storeId: action.storeId || null,
        providerKey: "whatsapp",
        method: "POST",
        endpoint: "/{{phoneNumberId}}/messages",
        variables: { phoneNumberId: action.phoneNumberId || action.templateContext?.phone_number_id || "" },
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: false, body },
        },
      });
      results.push({ ok: providerResult?.success === true, httpStatus: providerResult?.statusCode || 0, reference: providerResult?.providerMessageId || null });
    }
  } else {
    const runtime = await provider(db, companyId, definition.provider);
    if (!runtime) return { status: "UNAVAILABLE", code: "PROVIDER_UNAVAILABLE", retryable: false };
    for (const recipient of recipients.filter(Boolean)) {
      results.push(type === "SEND_EMAIL"
        ? await sendEmailViaProvider({
            endpoint: runtime.endpoint,
            apiKey: runtime.apiKey,
            authScheme: runtime.authScheme,
            from: runtime.config.from || runtime.config.from_email,
            to: recipient,
            subject: renderTemplate(action.subject || template?.subject || "onePOS notification", action.templateContext || {}),
            body,
            attachments: Array.isArray(action.attachments) ? action.attachments : [],
          })
        : runtime.provider === "smsgate"
          ? await (async()=>{
              try {
                const adapter = createSmsGateDriver().createAdapter({ configuration: runtime.config });
                const sent = await adapter.execute("sms.send", { recipient, text: body });
                return { ok:true, httpStatus:200, reference: sent?.providerMessageId || null };
              } catch (error) {
                return { ok:false, httpStatus:0, errorText:String(error?.message || "SMSGate send failed") };
              }
            })()
          : runtime.provider === "twilio"
          ? await sendSmsViaTwilio({
              accountSid: runtime.twilio.accountSid,
              authToken: runtime.twilio.authToken,
              from: runtime.twilio.from,
              to: recipient,
              body,
            })
          : await sendSmsViaProvider({
              endpoint: runtime.endpoint,
              apiKey: runtime.apiKey,
              authScheme: runtime.authScheme,
              senderId: runtime.config.sender || runtime.config.sender_id || runtime.config.from,
              to: recipient,
              body,
            }));
    }
  }
  const result = results.find((item) => !item.ok) || results[0];
  if (!result.ok) {
    const retryable = result.httpStatus >= 500 || result.httpStatus === 429 || result.httpStatus === 0;
    await recordCommunicationEvent({
      db,
      companyId,
      channel: definition.provider,
      eventType: COMMUNICATION_EVENTS.FAILED,
      direction: "OUTBOUND",
      provider: definition.provider,
      recipient: recipients.filter(Boolean)[0] || null,
      templateId: action.templateId || null,
      objectId: action.objectId || null,
      recordId: action.recordId || action.templateContext?.record_id || null,
      metadata: { actionType: type, retryable, reason: result.errorText || "Provider failed" },
    }).catch(() => null);
    return {
      status: "FAILED",
      code: retryable ? "PROVIDER_NETWORK_ERROR" : "PROVIDER_FAILED",
      retryable,
      error: safeError(Object.assign(new Error(result.errorText || "Provider failed"), { retryable })),
    };
  }
  await recordCommunicationEvent({
    db,
    companyId,
    channel: definition.provider,
    eventType: COMMUNICATION_EVENTS.SENT,
    direction: "OUTBOUND",
    provider: definition.provider,
    providerMessageId: result.reference || null,
    recipient: recipients.filter(Boolean)[0] || null,
    templateId: action.templateId || null,
    objectId: action.objectId || null,
    recordId: action.recordId || action.templateContext?.record_id || null,
    metadata: { actionType: type },
  }).catch(() => null);
  return { status: "SUCCESS", provider: definition.provider, reference: result.reference || null };
}

export function getSharedActionDefinition(type) {
  return ACTIONS[String(type || "").toUpperCase()] || null;
}

export function redactActionPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, SECRET.test(key) ? "[REDACTED]" : value]));
}
