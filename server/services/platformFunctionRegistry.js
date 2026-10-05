import { readdir, stat } from "node:fs/promises";
import { createInventoryMovement } from "./inventory.js";
import { createGenericOrder, transitionGenericOrder } from "./onlineOrders/genericOrderService.js";
import { createSaleForCompletedOrder } from "./onlineOrders/saleCreator.js";
import { dispatchIntegrationEvent } from "./integrationDispatcher.js";
import { publishPlatformEvent } from "./platformEvents.js";
import { clockInAttendance, clockOutAttendance } from "./attendanceActions.js";
import { issueAccountToken } from "./accountPolicy.js";
import { buildReceiptQrDownloadUrl, createTemporaryReceiptDownload, resolveReceiptQrSettings, revokeTemporaryReceiptDownloadsForSale } from "./receiptQr.js";

// Temporary compatibility registry.
//
// Only capabilities with a confirmed runtime caller remain here. Business
// capabilities are migrated to visible metadata/Flow and removed from this
// registry as their callers are converted to generic primitives.
const CORE_PLATFORM_FUNCTIONS = Object.freeze([
{
    key: "online_order.create",
    category: "ONLINE_ORDER",
    description: "Compatibility capability while online-order creation is migrated to Flow.",
    inputs: { type: "object", required: ["externalOrderId", "fulfilmentType", "items"] },
    outputs: { type: "object" },
    permissions: ["online_orders.manage"],
    handler: async ({ inputs = {}, db, pool, companyId, userId, req }) => {
      const tenantId = companyId || req?.user?.companyId;
      return createGenericOrder({
        db,
        pool: pool || db,
        companyId: tenantId,
        userId: userId || req?.user?.id,
        storeId: inputs.storeId || req?.user?.storeId,
        externalOrderId: inputs.externalOrderId,
        fulfilmentType: inputs.fulfilmentType,
        items: inputs.items,
        customer: inputs.customer || {},
        notes: inputs.notes,
        payment: inputs.payment,
        createInventoryMovement,
        publishEvent: ({ client, eventType, payload, actorUserId }) =>
          publishPlatformEvent({
            db: client.query.bind(client),
            companyId: tenantId,
            eventType,
            payload,
            actorUserId,
          }),
      });
    },
  },
  {
    key: "online_order.transition",
    category: "ONLINE_ORDER",
    description: "Compatibility capability while online-order transitions are migrated to Flow.",
    inputs: { type: "object", required: ["orderId", "toStatus"] },
    outputs: { type: "object" },
    permissions: ["online_orders.manage"],
    handler: async ({ inputs = {}, db, pool, companyId, userId, req }) => {
      const tenantId = companyId || req?.user?.companyId;
      return transitionGenericOrder({
        pool: pool || db,
        companyId: tenantId,
        orderId: inputs.orderId,
        userId: userId || req?.user?.id,
        toStatus: inputs.toStatus,
        reason: inputs.reason || null,
        createSale: createSaleForCompletedOrder,
        createInventoryMovement,
        publishEvent: ({ client, eventType, payload, actorUserId }) =>
          publishPlatformEvent({
            db: client.query.bind(client),
            companyId: tenantId,
            eventType,
            payload,
            actorUserId,
          }),
      });
    },
  },
  {
    key: "inventory.movement.create",
    category: "INVENTORY",
    description: "Compatibility capability while inventory movement callers are migrated to generic record Flow.",
    inputs: { type: "object" },
    outputs: { type: "object" },
    permissions: ["inventory.adjust"],
    handler: async ({ inputs = {}, db }) => createInventoryMovement(db, inputs),
  },
  {
    key: "attendance.clock_in",
    category: "STAFF",
    description: "Compatibility capability while attendance clock-in is migrated to Flow.",
    inputs: { type: "object" },
    outputs: { type: "object" },
    permissions: ["attendance.use"],
    handler: async ({ db, companyId, userId, req }) =>
      clockInAttendance({
        db,
        companyId: companyId || req?.user?.companyId,
        userId: userId || req?.user?.id,
        storeId: req?.user?.storeId,
      }),
  },
  {
    key: "attendance.clock_out",
    category: "STAFF",
    description: "Compatibility capability while attendance clock-out is migrated to Flow.",
    inputs: { type: "object" },
    outputs: { type: "object" },
    permissions: ["attendance.use"],
    handler: async ({ db, companyId, userId, req }) =>
      clockOutAttendance({
        db,
        companyId: companyId || req?.user?.companyId,
        userId: userId || req?.user?.id,
      }),
  },
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

const PACKAGE_ROOT = new URL("../packages/", import.meta.url);
const packageFunctions = [];
for (const directory of await readdir(PACKAGE_ROOT, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const functionsUrl = new URL(`../packages/${directory.name}/functions.js`, import.meta.url);
  try { await stat(functionsUrl); } catch { continue; }
  const module = await import(functionsUrl.href);
  const declared = Array.isArray(module.packageFunctions) ? module.packageFunctions : Array.isArray(module.default) ? module.default : [];
  for (const definition of declared) {
    if (definition?.key && typeof definition.handler === "function") packageFunctions.push(definition);
  }
}

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
