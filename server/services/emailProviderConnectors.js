import { isAllowedConnectorTarget } from "./connectorFramework.js";

const PROVIDERS = Object.freeze({
  brevo: {
    packageKey: "brevo_connector",
    baseUrl: "https://api.brevo.com",
    accountPath: "/v3/account",
    sendPath: "/v3/smtp/email",
  },
  mailjet: {
    packageKey: "mailjet_connector",
    baseUrl: "https://api.mailjet.com",
    accountPath: "/v3/REST/myprofile",
    sendPath: "/v3.1/send",
  },
});

function providerDefinition(provider) {
  const definition = PROVIDERS[String(provider || "").toLowerCase()];
  if (!definition) throw Object.assign(new Error("Unsupported email provider"), { code: "PROVIDER_NOT_SUPPORTED" });
  return definition;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function recipientList(payload = {}) {
  const raw = payload.to ?? payload.recipient ?? payload.recipients ?? [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.flatMap((value) => {
    if (!value) return [];
    if (typeof value === "string") return [{ email: normalizeEmail(value) }];
    const email = normalizeEmail(value.email || value.address);
    return email ? [{ email, name: value.name || undefined }] : [];
  });
}

function mailContent(payload = {}) {
  const subject = String(payload.subject || "").trim();
  const html = String(payload.html ?? payload.htmlContent ?? payload.bodyHtml ?? "").trim();
  const text = String(payload.text ?? payload.textContent ?? payload.body ?? payload.message ?? "").trim();
  if (!subject) throw Object.assign(new Error("Email subject is required"), { code: "INVALID_SUBJECT" });
  if (!html && !text) throw Object.assign(new Error("Email message is required"), { code: "INVALID_MESSAGE" });
  return { subject, html, text };
}

function authHeaders(provider, configuration = {}) {
  if (provider === "brevo") {
    if (!configuration.apiKey) throw Object.assign(new Error("Brevo API key is not configured"), { code: "PROVIDER_NOT_CONFIGURED" });
    return { "api-key": configuration.apiKey };
  }
  if (!configuration.apiKey || !configuration.secretKey) {
    throw Object.assign(new Error("Mailjet API key and secret key are required"), { code: "PROVIDER_NOT_CONFIGURED" });
  }
  return {
    Authorization: `Basic ${Buffer.from(`${configuration.apiKey}:${configuration.secretKey}`).toString("base64")}`,
  };
}

async function providerRequest(provider, configuration, path, { method = "GET", body } = {}) {
  const definition = providerDefinition(provider);
  const baseUrl = definition.baseUrl;
  if (!(await isAllowedConnectorTarget(baseUrl))) {
    throw Object.assign(new Error("Email provider API target is not allowed"), { code: "INVALID_API_URL" });
  }
  const url = new URL(String(path || "").replace(/^\/+/, ""), `${baseUrl}/`);
  if (url.origin !== new URL(baseUrl).origin || !(await isAllowedConnectorTarget(url.href))) {
    throw Object.assign(new Error("Email provider request target is not allowed"), { code: "INVALID_API_URL" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...authHeaders(provider, configuration),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try { payload = JSON.parse(responseText); } catch { payload = responseText; }
    }
    if (!response.ok) {
      const providerMessage = payload && typeof payload === "object"
        ? (payload.message || payload.ErrorMessage || payload.error || payload.errorIdentifier)
        : null;
      const error = new Error(String(providerMessage || `Email provider returned HTTP ${response.status}`).slice(0, 400));
      error.code = response.status === 401 || response.status === 403 ? "AUTH_FAILED" : "PROVIDER_ERROR";
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("Email provider request timed out"), { code: "TIMEOUT", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sender(configuration = {}, payload = {}) {
  const email = normalizeEmail(payload.fromEmail || payload.from || configuration.fromEmail);
  const name = String(payload.fromName || configuration.fromName || "").trim();
  if (!email) throw Object.assign(new Error("Verified sender email is required"), { code: "SENDER_NOT_CONFIGURED" });
  return { email, name };
}

function brevoMessage(configuration, payload) {
  const recipients = recipientList(payload);
  if (!recipients.length) throw Object.assign(new Error("Email recipient is required"), { code: "INVALID_RECIPIENT" });
  const content = mailContent(payload);
  const from = sender(configuration, payload);
  const body = {
    sender: { email: from.email, ...(from.name ? { name: from.name } : {}) },
    to: recipients,
    subject: content.subject,
    ...(content.html ? { htmlContent: content.html } : { textContent: content.text }),
  };
  if (content.html && content.text) body.textContent = content.text;
  if (payload.replyTo) body.replyTo = typeof payload.replyTo === "string" ? { email: payload.replyTo } : payload.replyTo;
  return body;
}

function mailjetMessage(configuration, payload) {
  const recipients = recipientList(payload);
  if (!recipients.length) throw Object.assign(new Error("Email recipient is required"), { code: "INVALID_RECIPIENT" });
  const content = mailContent(payload);
  const from = sender(configuration, payload);
  return {
    Messages: [{
      From: { Email: from.email, ...(from.name ? { Name: from.name } : {}) },
      To: recipients.map((item) => ({ Email: item.email, ...(item.name ? { Name: item.name } : {}) })),
      Subject: content.subject,
      ...(content.text ? { TextPart: content.text } : {}),
      ...(content.html ? { HTMLPart: content.html } : {}),
    }],
  };
}

function createEmailProviderDriver(provider) {
  const definition = providerDefinition(provider);
  return {
    packageKey: definition.packageKey,
    capabilities: ["email.send", "connector.test"],
    createAdapter({ configuration = {} }) {
      return {
        async connect() {
          authHeaders(provider, configuration);
          sender(configuration);
          return true;
        },
        async healthCheck() {
          try {
            await providerRequest(provider, configuration, definition.accountPath);
            return { healthy: true };
          } catch (error) {
            return { healthy: false, code: error.code || "ERROR", message: error.message };
          }
        },
        async test() {
          try {
            await providerRequest(provider, configuration, definition.accountPath);
            return {
              success: true,
              message: `${provider === "brevo" ? "Brevo" : "Mailjet"} connected`,
            };
          } catch (error) {
            return { success: false, code: error.code || "ERROR", message: error.message };
          }
        },
        async execute(actionKey, payload = {}) {
          if (actionKey !== "email.send") throw new Error("Unsupported email connector action");
          const requestBody = provider === "brevo"
            ? brevoMessage(configuration, payload)
            : mailjetMessage(configuration, payload);
          const result = await providerRequest(provider, configuration, definition.sendPath, { method: "POST", body: requestBody });
          const providerMessageId = provider === "brevo"
            ? (result?.messageId || null)
            : (result?.Messages?.[0]?.To?.[0]?.MessageID || result?.Messages?.[0]?.To?.[0]?.MessageUUID || null);
          return {
            status: "SENT",
            provider,
            providerMessageId,
            response: result,
          };
        },
      };
    },
  };
}

export function createBrevoDriver() {
  return createEmailProviderDriver("brevo");
}

export function createMailjetDriver() {
  return createEmailProviderDriver("mailjet");
}
