// Payment-method behavior is metadata-owned. This compatibility module contains no
// tender catalogue, connector mapping, or direct persistence. Callers receive the
// metadata records already provisioned for the company through the generic object runtime.
export const DEFAULT_PAYMENT_METHODS = Object.freeze([]);

export async function listPaymentMethods() {
  return [];
}

export async function getAllowedPaymentMethodCodes() {
  return [];
}

export async function ensureConnectorPaymentMethods() {
  // Connector-to-payment-method relationships are installed as metadata.
}

export async function ensureDefaultPaymentMethods() {
  // No business defaults are seeded in code.
}
