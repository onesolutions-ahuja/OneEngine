import { isAllowedConnectorTarget } from "./connectorFramework.js";

const DEFAULT_API_URL = "https://api.sms-gate.app";

function normalizedBaseUrl(value) {
  return String(value || DEFAULT_API_URL).trim().replace(/\/+$/, "");
}

function authHeaders(configuration) {
  const mode = String(configuration?.authenticationMethod || "USERNAME_PASSWORD").toUpperCase();
  if (mode === "API_TOKEN") {
    if (!configuration?.apiToken) throw Object.assign(new Error("SMSGate API token is not configured"), { code: "PROVIDER_NOT_CONFIGURED" });
    return { Authorization: `Bearer ${configuration.apiToken}` };
  }
  if (!configuration?.username || !configuration?.password) {
    throw Object.assign(new Error("SMSGate username and password are required"), { code: "PROVIDER_NOT_CONFIGURED" });
  }
  return {
    Authorization: `Basic ${Buffer.from(`${configuration.username}:${configuration.password}`).toString("base64")}`,
  };
}

async function request(configuration, path, { method = "GET", body = undefined } = {}) {
  const baseUrl = normalizedBaseUrl(configuration?.apiUrl);
  if (!(await isAllowedConnectorTarget(baseUrl))) {
    throw Object.assign(new Error("SMSGate API URL is not an allowed public HTTP(S) target"), { code: "INVALID_API_URL" });
  }
  const url = new URL(String(path || "").replace(/^\/+/, ""), `${baseUrl}/`);
  if (url.origin !== new URL(baseUrl).origin || !(await isAllowedConnectorTarget(url.href))) {
    throw Object.assign(new Error("SMSGate request target is not allowed"), { code: "INVALID_API_URL" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...authHeaders(configuration),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? (payload.message || payload.error || `SMSGate returned HTTP ${response.status}`)
        : `SMSGate returned HTTP ${response.status}`;
      const error = new Error(String(message).slice(0, 300));
      error.code = response.status === 401 || response.status === 403 ? "AUTH_FAILED" : "PROVIDER_ERROR";
      error.retryable = response.status >= 500 || response.status === 429;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("SMSGate request timed out"), { code: "TIMEOUT", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePhoneNumbers(payload = {}) {
  if (Array.isArray(payload.phoneNumbers)) return payload.phoneNumbers.filter(Boolean).map(String);
  const single = payload.recipient || payload.to || payload.phoneNumber || payload.phone;
  return single ? [String(single)] : [];
}

export function createSmsGateDriver() {
  return {
    packageKey: "smsgate_connector",
    capabilities: ["sms.send", "sms.devices.list", "connector.test"],
    createAdapter({ configuration = {} }) {
      return {
        async connect() {
          authHeaders(configuration);
          return true;
        },
        async healthCheck() {
          try {
            const devices = await request(configuration, "/3rdparty/v1/devices");
            return { healthy: true, devices: Array.isArray(devices) ? devices.length : null };
          } catch (error) {
            return { healthy: false, code: error.code || "ERROR", message: error.message };
          }
        },
        async test() {
          try {
            const devices = await request(configuration, "/3rdparty/v1/devices");
            return {
              success: true,
              message: `SMSGate connected${Array.isArray(devices) ? ` · ${devices.length} device${devices.length === 1 ? "" : "s"}` : ""}`,
            };
          } catch (error) {
            return { success: false, code: error.code || "ERROR", message: error.message };
          }
        },
        async execute(actionKey, payload = {}) {
          if (actionKey === "sms.devices.list") {
            return request(configuration, "/3rdparty/v1/devices");
          }
          if (actionKey !== "sms.send") throw new Error("Unsupported SMSGate action");
          const phoneNumbers = normalizePhoneNumbers(payload);
          const text = String(payload.text ?? payload.message ?? payload.body ?? "").trim();
          if (!phoneNumbers.length) throw Object.assign(new Error("SMS recipient is required"), { code: "INVALID_RECIPIENT" });
          if (!text) throw Object.assign(new Error("SMS message is required"), { code: "INVALID_MESSAGE" });

          const message = {
            textMessage: { text },
            phoneNumbers,
          };
          const deviceId = payload.deviceId || configuration.deviceId;
          const simNumber = Number(payload.simNumber ?? configuration.simNumber);
          if (deviceId) message.deviceId = String(deviceId);
          if (Number.isInteger(simNumber) && simNumber >= 1 && simNumber <= 3) message.simNumber = simNumber;

          const result = await request(configuration, "/3rdparty/v1/messages", { method: "POST", body: message });
          return {
            status: "SENT",
            provider: "smsgate",
            providerMessageId: result?.id || result?.messageId || result?.message_id || null,
            response: result,
          };
        },
      };
    },
  };
}


export async function configureSmsGateInboundWebhook(configuration = {}, { webhookUrl } = {}) {
  const url = String(webhookUrl || "").trim();
  if (!url || !/^https:\/\//i.test(url)) {
    throw Object.assign(new Error("A public HTTPS SMSGate webhook URL is required"), { code: "INVALID_WEBHOOK_URL" });
  }

  const current = await request(configuration, "/3rdparty/v1/webhooks");
  const webhooks = Array.isArray(current)
    ? current
    : Array.isArray(current?.data)
      ? current.data
      : Array.isArray(current?.webhooks)
        ? current.webhooks
        : [];

  const existing = webhooks.find((hook) =>
    String(hook?.url || "").replace(/\/+$/, "") === url.replace(/\/+$/, "")
      && String(hook?.event || "").toLowerCase() === "sms:received"
  );

  if (existing) {
    return {
      configured: true,
      created: false,
      webhookId: existing.id || existing.webhookId || null,
      webhookUrl: url,
      event: "sms:received",
    };
  }

  const payload = { url, event: "sms:received" };
  if (configuration.deviceId) payload.device_id = String(configuration.deviceId);
  const created = await request(configuration, "/3rdparty/v1/webhooks", { method: "POST", body: payload });
  return {
    configured: true,
    created: true,
    webhookId: created?.id || created?.webhookId || null,
    webhookUrl: url,
    event: "sms:received",
  };
}


export async function getSmsGateDiagnostics(configuration = {}) {
  const [webhooks, logs] = await Promise.all([
    request(configuration, "/3rdparty/v1/webhooks"),
    request(configuration, "/3rdparty/v1/logs").catch((error) => ({ error: error.message, code: error.code || null })),
  ]);
  return { webhooks, logs };
}
