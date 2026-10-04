import { createInventoryMovement } from "./inventory.js";
import { receivePurchase } from "./purchaseReceiving.js";
import { executeSupplierPayment } from "./supplierPaymentExecution.js";
import { createGenericOrder, transitionGenericOrder } from "./onlineOrders/genericOrderService.js";
import { createSaleForCompletedOrder } from "./onlineOrders/saleCreator.js";
import { dispatchIntegrationEvent } from "./integrationDispatcher.js";
import { publishPlatformEvent } from "./platformEvents.js";
import { clockInAttendance, clockOutAttendance } from "./attendanceActions.js";

// Temporary compatibility registry.
//
// Only capabilities with a confirmed runtime caller remain here. Business
// capabilities are migrated to visible metadata/Flow and removed from this
// registry as their callers are converted to generic primitives.
export const PLATFORM_FUNCTIONS = Object.freeze([
  {
    key: "purchase.receive",
    category: "PURCHASING",
    description: "Compatibility capability while purchase receiving is migrated to Flow.",
    inputs: { type: "object", required: ["purchaseId"] },
    outputs: { type: "object" },
    permissions: ["purchases.receive"],
    handler: async ({ inputs = {}, client, companyId, userId, req }) =>
      receivePurchase({
        client,
        purchaseId: inputs.purchaseId,
        companyId: companyId || req?.user?.companyId,
        userId: userId || req?.user?.id,
        storeId: inputs.storeId || req?.user?.storeId,
        requestedItems: inputs.requestedItems || null,
        receiptMeta: inputs.receiptMeta || {},
        createInventoryMovement,
      }),
  },
  {
    key: "supplier.payment.execute",
    category: "SUPPLIER_ACCOUNTING",
    description: "Compatibility capability while supplier payment is migrated to Flow.",
    inputs: { type: "object", required: ["supplierId", "amount"] },
    outputs: { type: "object" },
    permissions: ["payment.manage"],
    handler: async ({ inputs = {}, client, companyId, userId, req }) =>
      executeSupplierPayment({
        client,
        companyId: companyId || req?.user?.companyId,
        userId: userId || req?.user?.id,
        defaultStoreId: req?.user?.storeId,
        input: inputs,
      }),
  },
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
]);

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
