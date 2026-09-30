import crypto from "node:crypto";

export function createSandboxOnlinePaymentProvider({ authorize = null } = {}) {
  return {
    providerKey: "onepos_sandbox",
    async authorizePayment({ amount, currency = "GBP", paymentMethod = "card", idempotencyKey }) {
      const normalizedAmount = Number(amount);
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        throw new Error("A positive payment amount is required");
      }
      if (!idempotencyKey || String(idempotencyKey).length < 16) {
        throw new Error("A valid payment idempotency key is required");
      }
      if (typeof authorize === "function") {
        return authorize({ amount: normalizedAmount, currency, paymentMethod, idempotencyKey });
      }
      const transactionId = `sbx_${crypto.createHash("sha256").update(String(idempotencyKey)).digest("hex").slice(0, 32)}`;
      return { success: true, status: "completed", provider: "onepos_sandbox", transactionId };
    },
  };
}
