export const TRUSTED_JOB_KINDS = Object.freeze([
  "WAIT",
  "APP_RELEASE_UPGRADE",
  "PLATFORM_WEBHOOK_DELIVERY",
  "PLATFORM_SCHEDULED_WORKFLOW",
  "PLATFORM_EVENT_WORKFLOW",
  "SHOPIFY_WEBHOOK_EVENT",
  "QUICKBOOKS_PROVIDER_SYNC",
  "SHOPIFY_PROVIDER_SYNC",
]);

export function assertTrustedJobKind(kind) {
  const normalized = String(kind || "").trim().toUpperCase();
  if (!TRUSTED_JOB_KINDS.includes(normalized)) {
    throw Object.assign(new Error(`Unregistered platform job kind: ${kind}`), {
      code: "UNREGISTERED_JOB_KIND",
      status: 403,
      retryable: false,
    });
  }
  return `job:${normalized}`;
}
