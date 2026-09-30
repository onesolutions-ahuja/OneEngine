import { createHash } from "node:crypto";
import { ConnectorRuntimeError } from "./connectorRuntime.js";

export const REFERENCE_PAYMENT_CAPABILITIES = Object.freeze([
  "payment.sale",
  "payment.cancel",
  "payment.refund",
  "payment.status",
  "payment.test",
  "payment.health",
]);

const SIMULATED_OUTCOMES = new Set(["APPROVED", "DECLINED", "OFFLINE", "TIMEOUT", "ERROR"]);

export function createReferencePaymentDriver() {
  const requests = new Map();
  const transactions = new Map();
  return {
    packageKey: "payment_reference",
    capabilities: REFERENCE_PAYMENT_CAPABILITIES,
    createAdapter({ instanceId, configuration = {} }) {
      const mode = String(configuration.mode || "").toUpperCase();
      const outcome = String(configuration.simulatedOutcome || "APPROVED").toUpperCase();
      return {
        async connect() {
          if (mode !== "TEST") {
            throw new ConnectorRuntimeError("PROVIDER_NOT_CONFIGURED", "Reference connector must be explicitly configured in TEST mode");
          }
          if (!SIMULATED_OUTCOMES.has(outcome)) {
            throw new ConnectorRuntimeError("PROVIDER_NOT_CONFIGURED", "Reference outcome is not supported");
          }
        },
        async healthCheck() {
          return mode === "TEST"
            ? { healthy: true }
            : { healthy: false, code: "PROVIDER_NOT_CONFIGURED", message: "Reference connector is not configured in TEST mode" };
        },
        async test() {
          return mode === "TEST"
            ? { success: true, message: "Reference simulator ready (TEST ONLY)" }
            : { success: false, code: "PROVIDER_NOT_CONFIGURED", message: "Select TEST mode" };
        },
        async execute(actionKey, payload = {}) {
          if (!REFERENCE_PAYMENT_CAPABILITIES.includes(actionKey)) {
            throw new ConnectorRuntimeError("PROVIDER_NOT_SUPPORTED", `Reference simulator does not support ${actionKey}`);
          }
          if (actionKey === "payment.test") {
            return { status: "APPROVED", referenceCode: "REFERENCE-TEST", timestamp: new Date().toISOString() };
          }
          if (actionKey === "payment.health") {
            return { status: "APPROVED", referenceCode: "TEST-ONLY" };
          }
          if (actionKey === "payment.sale") {
            const idempotencyKey = String(payload.idempotencyKey || payload.reference || "");
            if (!idempotencyKey) {
              throw new ConnectorRuntimeError("IDEMPOTENCY_REQUIRED", "A stable idempotency reference is required");
            }
            const requestKey = `${instanceId}:${idempotencyKey}`;
            if (requests.has(requestKey)) return requests.get(requestKey);
            const result = {
              status: outcome,
              providerTransactionId: `reference-${createHash("sha256").update(requestKey).digest("hex").slice(0, 24)}`,
              terminalId: String(payload.terminalId || "REFERENCE-TEST-TERMINAL"),
              ...(outcome === "APPROVED" ? { approvalCode: "TEST-APPROVED" } : {}),
              referenceCode: idempotencyKey.slice(0, 100),
              paymentMethod: "card",
              timestamp: new Date().toISOString(),
            };
            requests.set(requestKey, result);
            if (["APPROVED", "DECLINED"].includes(outcome)) transactions.set(result.providerTransactionId, result);
            return result;
          }
          if (actionKey === "payment.status") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            return existing || { status: "ERROR", referenceCode: "UNKNOWN_REFERENCE" };
          }
          if (actionKey === "payment.cancel") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            if (!existing || existing.status !== "APPROVED") return { status: "ERROR", referenceCode: "PAYMENT_NOT_CANCELLABLE" };
            const cancelled = { ...existing, status: "CANCELLED", timestamp: new Date().toISOString() };
            transactions.set(existing.providerTransactionId, cancelled);
            return cancelled;
          }
          if (actionKey === "payment.refund") {
            const existing = transactions.get(String(payload.providerTransactionId || ""));
            if (!existing || existing.status !== "APPROVED") return { status: "ERROR", referenceCode: "PAYMENT_NOT_REFUNDABLE" };
            return {
              status: "APPROVED",
              providerTransactionId: `refund-${existing.providerTransactionId}`,
              referenceCode: existing.providerTransactionId,
              paymentMethod: "card",
              timestamp: new Date().toISOString(),
            };
          }
          throw new ConnectorRuntimeError("PROVIDER_NOT_SUPPORTED", `Reference simulator does not support ${actionKey}`);
        },
      };
    },
  };
}
