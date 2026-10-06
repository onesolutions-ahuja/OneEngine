import { packageFunctions } from "../packages/functionsIndex.js";
import { dispatchIntegrationEvent } from "./integrationDispatcher.js";
import { issueAccountToken } from "./accountPolicy.js";
import { buildReceiptQrDownloadUrl, createTemporaryReceiptDownload, resolveReceiptQrSettings, revokeTemporaryReceiptDownloadsForSale } from "./receiptQr.js";

// Temporary compatibility registry.
//
// Only capabilities with a confirmed runtime caller remain here. Business
// capabilities are migrated to visible metadata/Flow and removed from this
// registry as their callers are converted to generic primitives.
const CORE_PLATFORM_FUNCTIONS = Object.freeze([
  {
    key: "integration.event.dispatch",
    category: "INTEGRATIONS",
    description: "Compatibility capability while integration dispatch is migrated to connector Flow.",
    inputs: { type: "object", required: ["event", "entityId"] },
    outputs: { type: "object" },
    permissions: ["integrations.manage"],
    handler: async ({ inputs = {}, db, companyId, req }) =>
      dispatchIntegrationEvent({
        event: inputs.event,
        deps: { db },
        context: {
          companyId: companyId || req?.user?.companyId,
          storeId: inputs.storeId || req?.user?.storeId,
        },
        entityId: inputs.entityId,
      }),
  },
  {
    key: "receipt.temporary_link.create",
    category: "DOCUMENT",
    description: "Create a short-lived receipt download link. Flow owns when and why it is created.",
    inputs: { type: "object", required: ["saleId"] },
    outputs: { type: "object" },
    permissions: ["sale.view"],
    handler: async ({ inputs = {}, db, companyId, req }) => {
      const tenantId = companyId || req?.user?.companyId;
      const settings = await resolveReceiptQrSettings(db, tenantId);
      const expiryMinutes = Number.isFinite(Number(inputs.expiryMinutes))
        ? Number(inputs.expiryMinutes)
        : settings.expiryMinutes;
      const result = await createTemporaryReceiptDownload({
        db,
        companyId: tenantId,
        storeId: req?.user?.storeId || null,
        tillId: req?.user?.tillId || null,
        saleId: inputs.saleId,
        expiryMinutes,
      });
      if (!result.ok) throw new Error(result.message || "Unable to create temporary receipt link");
      const baseUrl = req?.protocol && req?.get
        ? `${req.protocol}://${req.get("host")}`
        : "";
      const url = buildReceiptQrDownloadUrl(result.token, baseUrl);
      return {
        status: "completed",
        id: result.id,
        saleId: inputs.saleId,
        token: result.token,
        url,
        qrcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`,
        expiresAt: result.expiresAt,
        expiresMinutes: expiryMinutes,
      };
    },
  },
  {
    key: "receipt.temporary_link.revoke",
    category: "DOCUMENT",
    description: "Revoke active temporary receipt links for a sale. Flow owns when revocation occurs.",
    inputs: { type: "object", required: ["saleId"] },
    outputs: { type: "object" },
    permissions: ["sale.view"],
    handler: async ({ inputs = {}, db, companyId, req }) => {
      const result = await revokeTemporaryReceiptDownloadsForSale({
        db,
        companyId: companyId || req?.user?.companyId,
        saleId: inputs.saleId,
      });
      return { status: "completed", saleId: inputs.saleId, revoked: result.revoked || 0 };
    },
  },
  {
    key: "temporary.receipt.download.create",
    category: "DOCUMENT_RUNTIME",
    description: "Create a short-lived receipt download token and public URL from supplied record context.",
    inputs: { type: "object", required: ["saleId"] },
    outputs: { type: "object" },
    permissions: ["sale.view"],
    handler: async ({ inputs = {}, db, companyId, req }) => {
      const result = await createTemporaryReceiptDownload({
        db,
        companyId: companyId || req?.user?.companyId,
        storeId: inputs.storeId || req?.user?.storeId || null,
        tillId: inputs.tillId || req?.user?.tillId || null,
        saleId: inputs.saleId,
        expiryMinutes: Number(inputs.expiryMinutes || 5),
      });
      if (!result.ok) throw Object.assign(new Error(result.message || "Unable to create temporary receipt download"), { status: result.status || 500 });
      const url = buildReceiptQrDownloadUrl(result.token, inputs.baseUrl || null);
      return {
        id: result.id,
        saleId: result.saleId,
        token: result.token,
        url,
        qrcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`,
        expiresAt: result.expiresAt,
        expiresMinutes: Number(inputs.expiryMinutes || 5),
      };
    },
  },
  {
    key: "temporary.receipt.download.revoke_for_sale",
    category: "DOCUMENT_RUNTIME",
    description: "Revoke active temporary receipt downloads for a supplied sale record.",
    inputs: { type: "object", required: ["saleId"] },
    outputs: { type: "object" },
    permissions: ["sale.view"],
    handler: async ({ inputs = {}, db, companyId, req }) =>
      revokeTemporaryReceiptDownloadsForSale({
        db,
        companyId: companyId || req?.user?.companyId,
        saleId: inputs.saleId,
      }),
  },
  {
    key: "account.lifecycle.token.issue",
    category: "SECURITY",
    description: "Issue a tenant-scoped account lifecycle token. Flow owns lifecycle decisions, recipient selection, templates and communication sequencing.",
    inputs: { type: "object", required: ["userId", "purpose"] },
    outputs: { type: "object" },
    permissions: ["user.manage"],
    handler: async ({ inputs = {}, db, companyId, req }) => {
      const tenantId = companyId || req?.user?.companyId;
      const userId = String(inputs.userId || "").trim();
      const purpose = String(inputs.purpose || "").trim().toUpperCase();
      if (!tenantId || !userId) throw new Error("Account token requires tenant and user context");
      if (!["PASSWORD_RESET", "REGISTRATION"].includes(purpose)) throw new Error("Unsupported account token purpose");
      const result = await db(
        `SELECT u.id,u.email,u.active,c.user_email_domain,cs.domain_users_only
           FROM users u
           JOIN companies c ON c.id=u.company_id
           JOIN company_settings cs ON cs.company_id=u.company_id
          WHERE u.id=$1 AND u.company_id=$2 LIMIT 1`,
        [userId, tenantId]
      );
      const user = result.rows?.[0];
      if (!user) throw new Error("User not found");
      if (purpose === "PASSWORD_RESET" && !user.active) throw new Error("Password reset cannot be issued for an inactive user");
      if (purpose === "REGISTRATION" && user.domain_users_only) {
        const email = String(user.email || "").trim().toLowerCase();
        const domain = String(user.user_email_domain || "").trim().toLowerCase().replace(/^@/, "");
        if (!email || !domain || !email.endsWith(`@${domain}`)) throw new Error("User email is outside the allowed company domain");
      }
      const fallback = purpose === "PASSWORD_RESET" ? 60 : 1440;
      const requested = Number(inputs.expiresMinutes);
      const expiresMinutes = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 10080) : fallback;
      const token = await issueAccountToken(db, { companyId: tenantId, userId: user.id, purpose, expiresMinutes });
      return { token, userId: user.id, purpose, expiresMinutes };
    },
  },
  {
    key: "account.registration.token.issue",
    category: "SECURITY",
    description: "Issue a registration token; retained temporarily for the active account lifecycle route.",
    inputs: { type: "object", required: ["userId"] },
    outputs: { type: "string" },
    permissions: ["users.manage"],
    handler: async ({ inputs = {}, db, companyId, req }) =>
      issueAccountToken(db, {
        companyId: companyId || req?.user?.companyId,
        userId: inputs.userId,
        purpose: "REGISTRATION",
        expiresMinutes: inputs.expiresMinutes || 1440,
      }),
  },
]);

export const PLATFORM_FUNCTIONS = Object.freeze([...CORE_PLATFORM_FUNCTIONS, ...packageFunctions]);

const duplicates = PLATFORM_FUNCTIONS
  .map((item) => item.key)
  .filter((key, index, all) => all.indexOf(key) !== index);
if (duplicates.length) {
  throw new Error(`Duplicate registered function keys: ${[...new Set(duplicates)].join(", ")}`);
}

export const PLATFORM_FUNCTION_MAP = new Map(PLATFORM_FUNCTIONS.map((item) => [item.key, item]));
export function getPlatformFunction(key) {
  return PLATFORM_FUNCTION_MAP.get(String(key || "").trim()) || null;
}
export function listPlatformFunctions() {
  return PLATFORM_FUNCTIONS.slice();
}
