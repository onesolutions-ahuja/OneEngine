export const PLATFORM_JOB_KINDS = Object.freeze([
  "WAIT",
  "APP_RELEASE_UPGRADE",
  "PLATFORM_WEBHOOK_DELIVERY",
  "PLATFORM_SCHEDULED_WORKFLOW",
  "PLATFORM_EVENT_WORKFLOW",
  "REPORT_SUBSCRIPTION_DELIVERY",
  "DASHBOARD_SUBSCRIPTION_DELIVERY",
  "APPROVAL_DUE",
]);

const JOB_KIND_SET = new Set(PLATFORM_JOB_KINDS);

export function assertPlatformJobKind(kind) {
  const normalized = String(kind || "");
  if (!JOB_KIND_SET.has(normalized)) throw Object.assign(new Error(`Unregistered platform job kind: ${kind}`), { code: "UNREGISTERED_JOB_KIND", status: 403, retryable: false });
  return normalized;
}
