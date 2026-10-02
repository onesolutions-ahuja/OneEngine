export const TRUSTED_JOB_KINDS = Object.freeze([
  "WAIT",
  "APP_RELEASE_UPGRADE",
  "PLATFORM_WEBHOOK_DELIVERY",
  "PLATFORM_SCHEDULED_WORKFLOW",
  "PLATFORM_EVENT_WORKFLOW",
  "REPORT_SUBSCRIPTION_DELIVERY",
  "DASHBOARD_SUBSCRIPTION_DELIVERY",
  "APPROVAL_DUE",
  "SHOPIFY_WEBHOOK_EVENT",
  "QUICKBOOKS_PROVIDER_SYNC",
  "SHOPIFY_PROVIDER_SYNC",
]);

const TRUSTED_JOB_KIND_SET = new Set(TRUSTED_JOB_KINDS);

export function assertTrustedJobKind(kind) {
  const normalized = String(kind || "");
  if (!TRUSTED_JOB_KIND_SET.has(normalized)) {
    throw Object.assign(new Error(`Unregistered platform job kind: ${kind}`), {
      code: "UNREGISTERED_JOB_KIND",
      status: 403,
      retryable: false,
    });
  }
  return `job:${normalized}`;
}
