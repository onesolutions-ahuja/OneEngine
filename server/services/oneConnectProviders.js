export const ONE_CONNECT_PROVIDER_DRIVER_KEYS = Object.freeze(["dojo", "sumup", "square"]);

const PROVIDER_CONFIG = Object.freeze({
  dojo: { providerName: "Dojo", providerAlias: "Dojo", providerKey: "dojo" },
  sumup: { providerName: "SumUp", providerAlias: "SumUp", providerKey: "sumup" },
  square: { providerName: "Square", providerAlias: "Square", providerKey: "square" },
});

const GENERIC_PAYMENT_CAPABILITIES = Object.freeze([
  "payment.sale",
  "payment.refund",
  "payment.cancel",
  "payment.status",
  "payment.health",
  "payment.test",
]);

const PROVIDER_ACTION_ALIASES = Object.freeze({
  dojo: ["Dojo.PaymentSale", "Dojo.PaymentRefund", "Dojo.PaymentCancel", "Dojo.PaymentStatus", "Dojo.HealthCheck", "Dojo.TestConnection"],
  sumup: ["SumUp.PaymentSale", "SumUp.PaymentRefund", "SumUp.PaymentCancel", "SumUp.PaymentStatus", "SumUp.HealthCheck", "SumUp.TestConnection"],
  square: ["Square.PaymentSale", "Square.PaymentRefund", "Square.PaymentCancel", "Square.PaymentStatus", "Square.HealthCheck", "Square.TestConnection"],
});

function createTransactionId(providerKey, instanceId, suffix = "txn") {
  const base = `${providerKey}:${instanceId}:${suffix}`;
  return `${providerKey}-${Buffer.from(base).toString("base64url").replace(/=+$/g, "").slice(0, 18)}`;
}

function normalizeActionKey(actionKey, providerAlias) {
  const candidate = String(actionKey || "").trim();
  if (!candidate) return null;
  const alias = providerAlias.toLowerCase();
  if (candidate === "payment.sale" || candidate === `${providerAlias}.PaymentSale`) return "payment.sale";
  if (candidate === "payment.refund" || candidate === `${providerAlias}.PaymentRefund`) return "payment.refund";
  if (candidate === "payment.cancel" || candidate === `${providerAlias}.PaymentCancel`) return "payment.cancel";
  if (candidate === "payment.status" || candidate === `${providerAlias}.PaymentStatus`) return "payment.status";
  if (candidate === "payment.health" || candidate === `${providerAlias}.HealthCheck`) return "payment.health";
  if (candidate === "payment.test" || candidate === `${providerAlias}.TestConnection`) return "payment.test";
  if (candidate.toLowerCase() === `${alias}.paymentsale`) return "payment.sale";
  if (candidate.toLowerCase() === `${alias}.paymentrefund`) return "payment.refund";
  if (candidate.toLowerCase() === `${alias}.paymentcancel`) return "payment.cancel";
  if (candidate.toLowerCase() === `${alias}.paymentstatus`) return "payment.status";
  if (candidate.toLowerCase() === `${alias}.healthcheck`) return "payment.health";
  if (candidate.toLowerCase() === `${alias}.testconnection`) return "payment.test";
  return null;
}

function resolveOutcome(configuration, fallback = "APPROVED") {
  const simulated = String(configuration?.simulatedOutcome || configuration?.outcome || "").trim().toUpperCase();
  if (["APPROVED", "DECLINED", "TIMEOUT", "OFFLINE", "ERROR", "CANCELLED"].includes(simulated)) return simulated;
  return fallback;
}

async function testSquareConnection(configuration = {}) {
  const mode = String(configuration.mode || "DEMO").trim().toUpperCase();
  if (mode === "DEMO") {
    return { success: true, healthy: true, code: "DEMO_MODE", status: "DEMO_MODE", message: "Square demo connection is active" };
  }
  if (!["SANDBOX", "LIVE"].includes(mode)) {
    return { success: false, healthy: false, code: "INVALID_MODE", status: "ERROR", message: "Square mode must be DEMO, SANDBOX or LIVE" };
  }
  const accessToken = String(configuration.accessToken || "").trim();
  const locationId = String(configuration.locationId || "").trim();
  if (!accessToken || !locationId) {
    return { success: false, healthy: false, code: "NOT_CONFIGURED", status: "ERROR", message: "Square access token and location ID are required" };
  }
  const baseUrl = mode === "SANDBOX" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}/v2/locations/${encodeURIComponent(locationId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.code || `Square returned HTTP ${response.status}`;
      return { success: false, healthy: false, code: `SQUARE_HTTP_${response.status}`, status: "ERROR", message: detail };
    }
    const location = payload?.location;
    if (!location || String(location.id || "") !== locationId) {
      return { success: false, healthy: false, code: "LOCATION_NOT_FOUND", status: "ERROR", message: "Square location could not be verified" };
    }
    return {
      success: true,
      healthy: true,
      code: mode === "SANDBOX" ? "SANDBOX_CONNECTED" : "LIVE_CONNECTED",
      status: "CONNECTED",
      message: `Square ${mode.toLowerCase()} connection verified for ${location.name || location.id}`,
      locationId: location.id,
      locationName: location.name || null,
    };
  } catch (error) {
    return {
      success: false,
      healthy: false,
      code: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      status: "ERROR",
      message: error?.name === "AbortError" ? "Square connection timed out" : String(error?.message || "Unable to reach Square"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOneConnectProviderDriver(providerKey) {
  const normalized = String(providerKey || "").trim().toLowerCase();
  const provider = PROVIDER_CONFIG[normalized];
  if (!provider) throw new Error(`Unsupported One Connect provider: ${providerKey}`);

  return {
    packageKey: `one_connect_${normalized}`,
    providerName: provider.providerName,
    providerAlias: provider.providerAlias,
    capabilities: [...GENERIC_PAYMENT_CAPABILITIES],
    actions: PROVIDER_ACTION_ALIASES[normalized],
    createAdapter({ instanceId = `${normalized}-demo`, configuration = {} } = {}) {
      const enabled = configuration.enabled !== false;
      const mode = String(configuration.mode || "DEMO").trim().toUpperCase();
      const storeId = String(configuration.storeId || "demo-store").trim();
      const tillId = String(configuration.tillId || "demo-till").trim();
      const terminalId = String(configuration.terminalId || `${normalized}-terminal-${instanceId}`).trim();

      async function baseResult({ actionKey, status = "APPROVED", providerTransactionId = createTransactionId(normalized, instanceId, actionKey), amount = 0, currency = "GBP", referenceCode = null, paymentMethod = provider.providerKey } = {}) {
        const finalStatus = (String(status || "APPROVED").toUpperCase());
        return {
          status: finalStatus,
          providerTransactionId,
          terminalId,
          referenceCode: referenceCode || providerTransactionId,
          paymentMethod,
          amount,
          currency,
          timestamp: new Date().toISOString(),
          provider: provider.providerName,
          storeId,
          tillId,
        };
      }

      return {
        async connect() {
          if (!enabled) {
            throw new Error(`${provider.providerName} connector is disabled`);
          }
          if (normalized === "square" && mode !== "DEMO") {
            const result = await testSquareConnection(configuration);
            return { ...result, provider: provider.providerName };
          }
          return {
            healthy: true,
            code: "DEMO_MODE",
            status: "DEMO_MODE",
            message: `${provider.providerName} demo connection is active; no live credentials are required for local validation`,
            provider: provider.providerName,
          };
        },
        async healthCheck() {
          if (normalized === "square" && mode !== "DEMO") {
            const result = await testSquareConnection(configuration);
            return { ...result, provider: provider.providerName };
          }
          return {
            healthy: true,
            code: "DEMO_MODE",
            status: "DEMO_MODE",
            message: `${provider.providerName} health check passed in demo mode`,
            provider: provider.providerName,
          };
        },
        async test() {
          if (normalized === "square" && mode !== "DEMO") {
            const result = await testSquareConnection(configuration);
            return { ...result, provider: provider.providerName };
          }
          return {
            success: true,
            status: "DEMO_MODE",
            code: "DEMO_MODE",
            message: `${provider.providerName} test connection succeeded in demo mode`,
            provider: provider.providerName,
          };
        },
        async execute(actionKey, payload = {}) {
          const normalizedAction = normalizeActionKey(actionKey, provider.providerAlias) || actionKey;
          const outcome = resolveOutcome(configuration);
          const amount = Number(payload.amount ?? 0);
          const idempotencyKey = String(payload.idempotencyKey || payload.reference || `${provider.providerKey}-${instanceId}`);

          if (normalizedAction === "payment.sale") {
            const result = await baseResult({
              actionKey: normalizedAction,
              status: outcome === "DECLINED" ? "DECLINED" : outcome === "TIMEOUT" ? "TIMEOUT" : outcome === "OFFLINE" ? "OFFLINE" : outcome === "ERROR" ? "ERROR" : "APPROVED",
              providerTransactionId: createTransactionId(provider.providerKey, instanceId, "sale"),
              amount,
              referenceCode: idempotencyKey,
            });
            if (outcome === "CANCELLED") return { ...result, status: "CANCELLED" };
            return result;
          }

          if (normalizedAction === "payment.refund") {
            return baseResult({
              actionKey: normalizedAction,
              status: "APPROVED",
              providerTransactionId: createTransactionId(provider.providerKey, instanceId, "refund"),
              amount: Number(payload.amount ?? amount ?? 0),
              referenceCode: String(payload.providerTransactionId || idempotencyKey),
            });
          }

          if (normalizedAction === "payment.cancel") {
            return baseResult({
              actionKey: normalizedAction,
              status: "CANCELLED",
              providerTransactionId: String(payload.providerTransactionId || createTransactionId(provider.providerKey, instanceId, "cancel")),
              amount: Number(payload.amount ?? amount ?? 0),
              referenceCode: String(payload.reference || idempotencyKey),
            });
          }

          if (normalizedAction === "payment.status") {
            return baseResult({
              actionKey: normalizedAction,
              status: outcome === "DECLINED" ? "DECLINED" : "APPROVED",
              providerTransactionId: String(payload.providerTransactionId || createTransactionId(provider.providerKey, instanceId, "status")),
              amount: Number(payload.amount ?? amount ?? 0),
              referenceCode: String(payload.reference || idempotencyKey),
            });
          }

          if (normalizedAction === "payment.health") {
            return baseResult({
              actionKey: normalizedAction,
              status: "APPROVED",
              providerTransactionId: createTransactionId(provider.providerKey, instanceId, "health"),
              amount: 0,
              referenceCode: "HEALTHCHECK",
            });
          }

          if (normalizedAction === "payment.test") {
            return {
              success: true,
              status: "APPROVED",
              providerTransactionId: createTransactionId(provider.providerKey, instanceId, "test"),
              provider: provider.providerName,
              message: `${provider.providerName} connector test passed`,
              terminalId,
              storeId,
              tillId,
            };
          }

          throw new Error(`Unsupported action for ${provider.providerName}: ${actionKey}`);
        },
      };
    },
  };
}

export function createOneConnectProviderRuntime() {
  return Object.fromEntries(ONE_CONNECT_PROVIDER_DRIVER_KEYS.map((providerKey) => [providerKey, createOneConnectProviderDriver(providerKey)]));
}
