import { createHash } from "node:crypto";
import { PLATFORM_FUNCTIONS } from "./platformFunctionRegistry.js";
import { PLATFORM_ACTION_REGISTRY } from "./platformActionRegistry.js";

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

const PRIVILEGED_ROUTES = Object.freeze([
  { id: "platform.developer.manage", prefixes: ["/api/platform/developer/"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "platform.metadata.execute", prefixes: ["/api/platform/runtime/", "/api/platform/workflows", "/api/platform/events", "/api/platform/schedules"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "package.lifecycle", prefixes: ["/api/packages/", "/api/platform/packages/"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "security.manage", prefixes: ["/api/platform/security"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "admin.manage", prefixes: ["/api/admin/"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "settings.manage", prefixes: ["/api/settings/"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "payment.execute", prefixes: ["/api/payments", "/api/payment", "/api/checkout", "/api/till/payment"], methods: ["POST","PUT","PATCH","DELETE"] },
  { id: "refund.execute", prefixes: ["/api/refunds", "/api/returns", "/api/exchanges"], methods: ["POST","PUT","PATCH","DELETE"] },
].map((item) => Object.freeze({ ...item, prefixes: Object.freeze(item.prefixes), methods: Object.freeze(item.methods) })));

const definitions = [
  ...PRIVILEGED_ROUTES.map((item) => ({ id: item.id, type: "route" })),
  ...PLATFORM_FUNCTIONS.map((item) => ({ id: `function:${item.key}`, type: "function" })),
  ...PLATFORM_ACTION_REGISTRY.map((item) => ({ id: `action:${item.key}`, type: "action" })),
  ...TRUSTED_JOB_KINDS.map((kind) => ({ id: `job:${kind}`, type: "job" })),
];

const duplicateIds = definitions.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index);
if (duplicateIds.length) throw new Error(`Duplicate Trusted Runtime capability ids: ${[...new Set(duplicateIds)].join(", ")}`);

export const TRUSTED_CAPABILITIES = Object.freeze(definitions.map((item) => Object.freeze(item)));
export const TRUSTED_CAPABILITY_MAP = new Map(TRUSTED_CAPABILITIES.map((item) => [item.id, item]));
export const TRUSTED_RUNTIME_VERSION = createHash("sha256")
  .update(TRUSTED_CAPABILITIES.map((item) => `${item.type}:${item.id}`).sort().join("|"))
  .digest("hex");

function canonicalPath(value) {
  try { return new URL(String(value || ""), "https://oneengine.invalid").pathname; }
  catch { return String(value || "").split("?")[0]; }
}

export function resolveTrustedRoute(path, method = "GET") {
  const pathname = canonicalPath(path);
  const verb = String(method || "GET").toUpperCase();
  return PRIVILEGED_ROUTES.find((definition) =>
    definition.methods.includes(verb) && definition.prefixes.some((prefix) => {
      const collection = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
      return pathname === prefix || pathname === collection || pathname.startsWith(prefix);
    })
  ) || null;
}

export function isPrivilegedMutation(path, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  if (!["POST","PUT","PATCH","DELETE"].includes(verb)) return false;
  const pathname = canonicalPath(path);
  return pathname.startsWith("/api/platform/") || pathname.startsWith("/api/packages/")
    || pathname.startsWith("/api/admin/") || pathname.startsWith("/api/settings/")
    || pathname.startsWith("/api/payments") || pathname.startsWith("/api/payment")
    || pathname.startsWith("/api/refunds") || pathname.startsWith("/api/returns")
    || pathname.startsWith("/api/exchanges");
}

export function assertTrustedJobKind(kind) {
  const key = `job:${String(kind || "")}`;
  if (!TRUSTED_CAPABILITY_MAP.has(key)) {
    throw Object.assign(new Error(`Unregistered platform job kind: ${kind}`), { code: "UNREGISTERED_JOB_KIND", status: 403, retryable: false });
  }
  return key;
}

export function validateTrustedRuntime() {
  for (const fn of PLATFORM_FUNCTIONS) {
    if (!fn?.key || typeof fn.handler !== "function" || !Array.isArray(fn.permissions) || !fn.permissions.length) {
      throw new Error(`Invalid registered platform function: ${fn?.key || "(missing key)"}`);
    }
  }
  for (const action of PLATFORM_ACTION_REGISTRY) if (!action?.key) throw new Error("Invalid registered platform action");
  return Object.freeze({ version: TRUSTED_RUNTIME_VERSION, count: TRUSTED_CAPABILITIES.length });
}

export function createTrustedRuntimeGate() {
  return (req, res, next) => {
    if (!isPrivilegedMutation(req.path, req.method)) return next();
    const capability = resolveTrustedRoute(req.path, req.method);
    if (!capability) return res.status(403).json({ success: false, code: "UNREGISTERED_CAPABILITY", message: "Operation is not registered in OneEngine Trusted Runtime" });

    // The header is correlation evidence only, never authorization. A caller
    // cannot gain authority by forging it; normal authenticate/authorize,
    // tenant/company and entitlement middleware remain authoritative.
    const claimed = String(req.get("X-OneEngine-Capability") || "").trim();
    if (claimed && claimed !== capability.id) {
      return res.status(403).json({ success: false, code: "CAPABILITY_MISMATCH", message: "Capability does not match requested operation" });
    }
    req.trustedCapability = capability.id;
    return next();
  };
}
