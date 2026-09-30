import { createHash } from "node:crypto";
import { ConnectorRuntimeError } from "./connectorRuntime.js";

export const PAYPAL_QR_CAPABILITIES = Object.freeze([
  "payment.sale",
  "payment.cancel",
  "payment.refund",
  "payment.status",
  "payment.test",
  "payment.health",
]);

export function mapProviderStatus(status) {
  const value = String(status || "").toUpperCase();
  if (["COMPLETED", "APPROVED", "CAPTURED", "SUCCESS"].includes(value)) return "APPROVED";
  if (["VOIDED", "CANCELLED", "CANCELED"].includes(value)) return "CANCELLED";
  if (["DECLINED", "DENIED"].includes(value)) return "DECLINED";
  if (value === "EXPIRED") return "EXPIRED";
  if (["FAILED", "ERROR"].includes(value)) return "FAILED";
  return "PENDING";
}

function paypalBaseUrl(environment) {
  return environment === "LIVE" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function createPaypalHttpAdapter({ environment, clientId, clientSecret, fetchImpl = globalThis.fetch } = {}) {
  const baseUrl = paypalBaseUrl(environment);
  if (typeof fetchImpl !== "function") throw new TypeError("PayPal adapter requires fetch");
  async function accessToken() {
    const response = await fetchImpl(`${baseUrl}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
    if (!response.ok) throw new ConnectorRuntimeError("PROVIDER_AUTH_FAILED", "PayPal authentication failed", { retryable: response.status >= 500 });
    return (await response.json()).access_token;
  }
  async function request(path, options = {}) {
    const token = await accessToken();
    const response = await fetchImpl(`${baseUrl}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ConnectorRuntimeError("PROVIDER_ERROR", "PayPal API request failed", { retryable: response.status >= 500 });
    return body;
  }
  return {
    async testConnection() { await accessToken(); return { success: true, status: "CONNECTED" }; },
    async createPayment({ amount, currency = "GBP", idempotencyKey }) { return request("/v2/checkout/orders", { method: "POST", headers: { "PayPal-Request-Id": idempotencyKey }, body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ amount: { currency_code: currency, value: Number(amount).toFixed(2) } }] }) }); },
    async getPaymentStatus(providerTransactionId) { return request(`/v2/checkout/orders/${encodeURIComponent(providerTransactionId)}`); },
    async cancelPayment(providerTransactionId) { return request(`/v2/checkout/orders/${encodeURIComponent(providerTransactionId)}/void`, { method: "POST", body: "{}" }); },
    async refundPayment(captureId, amount, currency = "GBP") { return request(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: "POST", body: JSON.stringify(amount == null ? {} : { amount: { value: Number(amount).toFixed(2), currency_code: currency } }) }); },
    async verifyWebhook({ webhookId, headers, body }) { const result = await request("/v1/notifications/verify-webhook-signature", { method: "POST", body: JSON.stringify({ auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"], transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"], transmission_time: headers["paypal-transmission-time"], webhook_id: webhookId, webhook_event: body }) }); return result.verification_status === "SUCCESS"; },
  };
}

export function createPaypalQrDriver() {
  const requests = new Map();
  const transactions = new Map();

  const isDemoMode = (config = {}) => {
    const env = String(config.environment || "DEMO").toUpperCase();
    const clientId = String(config.clientId || "").trim();
    const clientSecret = String(config.clientSecret || "").trim();
    const merchantId = String(config.merchantId || "").trim();
    return env === "DEMO";
  };

  return {
    packageKey: "paypal_qr",
    capabilities: PAYPAL_QR_CAPABILITIES,
    createAdapter({ instanceId, configuration = {} }) {
      const environment = String(configuration.environment || "DEMO").toUpperCase();
      const enabled = configuration.enabled !== false;
      const clientId = String(configuration.clientId || "").trim();
      const clientSecret = String(configuration.clientSecret || "").trim();
      const merchantId = String(configuration.merchantId || "").trim();
      const displayName = String(configuration.displayName || "PayPal QR").trim();
      const currency = String(configuration.currency || "GBP").toUpperCase();
      const qrPaymentEnabled = configuration.qrPaymentEnabled !== false;
      const provider = !isDemoMode(configuration) && clientId && clientSecret
        ? createPaypalHttpAdapter({ environment, clientId, clientSecret })
        : null;

      return {
        async connect() {
          if (!enabled) {
            throw new ConnectorRuntimeError("DISABLED", "PayPal QR connector is disabled");
          }
          if (!["DEMO", "SANDBOX", "LIVE"].includes(environment)) {
            throw new ConnectorRuntimeError("CONFIGURATION_INCOMPLETE", "PayPal environment must be DEMO, SANDBOX, or LIVE");
          }
          if (isDemoMode(configuration)) {
            return { healthy: true, code: "DEMO_MODE", message: "PayPal DEMO payment connector is active; no money moves" };
          }
          if (!clientId || !clientSecret) {
            throw new ConnectorRuntimeError("SETUP_REQUIRED", `PayPal ${environment} credentials are not configured`);
          }
          await provider.testConnection();
          return { healthy: true, code: "CONNECTED", message: `PayPal ${environment} connector ready for QR payments` };
        },

        async healthCheck() {
          try {
            await this.connect();
            return { healthy: true, code: isDemoMode(configuration) ? "DEMO_MODE" : "CONNECTED", message: `${displayName} is healthy` };
          } catch (error) {
            return {
              healthy: false,
              code: error?.code || "ERROR",
              message: error?.message || "PayPal QR connector is unavailable",
            };
          }
        },

        async test() {
          if (!enabled) {
            return { success: false, code: "DISABLED", status: "DISABLED", message: "PayPal QR connector is disabled" };
          }
          if (isDemoMode(configuration)) {
            return { success: true, status: "DEMO_MODE", message: `PayPal ${environment} test connection is running in demo mode without credentials` };
          }
          if (!clientId || !clientSecret) {
            return { success: false, code: "SETUP_REQUIRED", status: "SETUP_REQUIRED", message: `PayPal ${environment} credentials are incomplete` };
          }
          await provider.testConnection();
          return {
            success: true,
            status: "CONNECTED",
            message: `PayPal ${environment} test connection succeeded`,
          };
        },

        async execute(actionKey, payload = {}) {
          if (!PAYPAL_QR_CAPABILITIES.includes(actionKey)) {
            throw new ConnectorRuntimeError("PROVIDER_NOT_SUPPORTED", `PayPal QR connector does not support ${actionKey}`);
          }

          if (actionKey === "payment.test") {
            return { status: "APPROVED", providerTransactionId: `paypal-test-${instanceId}`, referenceCode: "PAYPAL-TEST", paymentMethod: "paypal_qr", timestamp: new Date().toISOString() };
          }

          if (actionKey === "payment.health") {
            return { status: "APPROVED", providerTransactionId: `paypal-health-${instanceId}`, referenceCode: "PAYPAL-HEALTH", paymentMethod: "paypal_qr", timestamp: new Date().toISOString() };
          }

          if (actionKey === "payment.sale") {
            if (!qrPaymentEnabled) {
              throw new ConnectorRuntimeError("PROVIDER_NOT_SUPPORTED", "PayPal QR payments are disabled by configuration");
            }
            const idempotencyKey = String(payload.idempotencyKey || payload.reference || "").trim();
            if (!idempotencyKey) {
              throw new ConnectorRuntimeError("IDEMPOTENCY_REQUIRED", "A stable idempotency reference is required");
            }
            const requestKey = `${instanceId}:${environment}:${idempotencyKey}`;
            if (requests.has(requestKey)) return requests.get(requestKey);
            const amount = Number(payload.amount ?? 0);
            if (!Number.isFinite(amount) || amount <= 0) {
              throw new ConnectorRuntimeError("INVALID_AMOUNT", "A positive PayPal payment amount is required");
            }
            if (!isDemoMode(configuration)) {
              const order = await provider.createPayment({ amount, currency: String(payload.currency || currency).toUpperCase(), idempotencyKey });
              const providerTransactionId = String(order.id || "");
              if (!providerTransactionId) throw new ConnectorRuntimeError("PROVIDER_ERROR", "PayPal did not return an order reference");
              const approvalUrl = (order.links || []).find((link) => link.rel === "approve")?.href || null;
              const result = { status: "PENDING", providerTransactionId, referenceCode: idempotencyKey.slice(0, 100), paymentMethod: "paypal_qr", amount, currency: String(payload.currency || currency).toUpperCase(), merchantId, environment, timestamp: new Date().toISOString(), paymentAttemptState: "PENDING", qrUrl: approvalUrl, demoMode: false };
              requests.set(requestKey, result);
              transactions.set(providerTransactionId, result);
              return result;
            }
            const transactionId = `paypal-${createHash("sha256").update(requestKey).digest("hex").slice(0, 24)}`;
            const result = {
              status: isDemoMode(configuration) ? "PENDING" : "APPROVED",
              providerTransactionId: transactionId,
              terminalId: String(payload.terminalId || `paypal-pos-${instanceId}`),
              approvalCode: `PP-${createHash("sha256").update(transactionId).digest("hex").slice(0, 12).toUpperCase()}`,
              referenceCode: idempotencyKey.slice(0, 100),
              paymentMethod: "paypal_qr",
              amount,
              currency: String(payload.currency || currency).toUpperCase(),
              merchantId: merchantId || clientId,
              timestamp: new Date().toISOString(),
              paymentAttemptState: "PENDING",
              action: "PAYPAL_CREATE_QR_PAYMENT",
              demoMode: isDemoMode(configuration),
              environment,
              qrUrl: isDemoMode(configuration) ? `https://demo.onepos.local/paypal-qr/${encodeURIComponent(transactionId)}` : null,
            };
            requests.set(requestKey, result);
            transactions.set(transactionId, result);
            return result;
          }

          if (actionKey === "payment.status") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            if (!existing) {
              return { status: "ERROR", referenceCode: "UNKNOWN_REFERENCE", paymentMethod: "paypal_qr" };
            }
            const nextStatus = existing.demoMode && payload.demoOutcome
              ? mapProviderStatus(payload.demoOutcome)
              : existing.status;
            const updated = nextStatus === existing.status ? existing : { ...existing, status: nextStatus, paymentAttemptState: nextStatus, timestamp: new Date().toISOString() };
            transactions.set(existing.providerTransactionId, updated);
            return { ...updated, status: updated.status };
          }

          if (actionKey === "payment.cancel") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            if (!existing) {
              return { status: "ERROR", referenceCode: "PAYMENT_NOT_FOUND", paymentMethod: "paypal_qr" };
            }
            const cancelled = { ...existing, status: "CANCELLED", paymentAttemptState: "CANCELLED", timestamp: new Date().toISOString() };
            transactions.set(existing.providerTransactionId, cancelled);
            return cancelled;
          }

          if (actionKey === "payment.refund") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            if (!existing || existing.status !== "APPROVED") {
              return { status: "ERROR", referenceCode: "PAYMENT_NOT_REFUNDABLE", paymentMethod: "paypal_qr" };
            }
            const result = {
              status: "APPROVED",
              providerTransactionId: `paypal-refund-${createHash("sha256").update(String(payload.providerTransactionId || "paypal-refund")).digest("hex").slice(0, 24)}`,
              referenceCode: String(payload.providerTransactionId || ""),
              paymentMethod: "paypal_qr",
              amount: Number(payload.amount ?? existing.amount ?? 0),
              currency: String(payload.currency || existing.currency || currency).toUpperCase(),
              timestamp: new Date().toISOString(),
            };
            return result;
          }

          throw new ConnectorRuntimeError("PROVIDER_NOT_SUPPORTED", `PayPal QR connector does not support ${actionKey}`);
        },
      };
    },
  };
}
