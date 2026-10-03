import { submitPlatformApproval } from "./platformApprovals.js";
import { createInventoryMovement } from "./inventory.js";
import { transitionGenericOrder } from "./onlineOrders/genericOrderService.js";
import { createSaleForCompletedOrder } from "./onlineOrders/saleCreator.js";
import { dispatchIntegrationEvent } from "./integrationDispatcher.js";
import { publishPlatformEvent } from "./platformEvents.js";
import { clockInAttendance, clockOutAttendance } from "./attendanceActions.js";
import { issueAccountToken } from "./accountPolicy.js";
// Canonical reusable functions. Pages, buttons and workflows reference these
// keys; implementation lives here or delegates to the authoritative domain service.
export const PLATFORM_FUNCTIONS = Object.freeze([
  {
    key: "customer.credit.limit.check",
    category: "CUSTOMER_CREDIT",
    description: "Run the canonical customer-credit limit check.",
    inputs: { type: "object", required: ["currentBalanceCents", "saleAmountCents", "creditLimitCents"] },
    outputs: { type: "object" },
    permissions: ["customer_credit.use"],
    handler: async ({ inputs = {} }) => checkCreditLimit(Number(inputs.currentBalanceCents), Number(inputs.saleAmountCents), Number(inputs.creditLimitCents)),
  },
  {
    key: "customer.credit.payment.check",
    category: "CUSTOMER_CREDIT",
    description: "Validate a customer-credit payment against the canonical ledger rules.",
    inputs: { type: "object", required: ["currentBalanceCents", "paymentAmountCents"] },
    outputs: { type: "object" },
    permissions: ["customer_credit.use"],
    handler: async ({ inputs = {} }) => checkPayment(Number(inputs.currentBalanceCents), Number(inputs.paymentAmountCents)),
  },
                                                                      { key: "purchase.receive", category: "PURCHASING", description: "Execute canonical purchase receiving, including stock movement, batch receipt, receipt records and purchase status.", inputs: { type: "object", required: ["purchaseId"] }, outputs: { type: "object" }, permissions: ["purchases.receive"], handler: async ({ inputs = {}, client, companyId, userId, req }) => receivePurchase({ client, purchaseId: inputs.purchaseId, companyId: companyId || req?.user?.companyId, userId: userId || req?.user?.id, storeId: inputs.storeId || req?.user?.storeId, requestedItems: inputs.requestedItems || null, receiptMeta: inputs.receiptMeta || {}, createInventoryMovement }) },
  { key: "supplier.payment.execute", category: "SUPPLIER_ACCOUNTING", description: "Execute a supplier payment with tenant-safe invoice allocations, status updates and supplier ledger posting.", inputs: { type: "object", required: ["supplierId", "amount"] }, outputs: { type: "object" }, permissions: ["payment.manage"], handler: async ({ inputs = {}, client, companyId, userId, req }) => executeSupplierPayment({ client, companyId: companyId || req?.user?.companyId, userId: userId || req?.user?.id, defaultStoreId: req?.user?.storeId, input: inputs }) },
    { key: "customer.credit.transaction.build_payment", category: "CUSTOMER", description: "Build a canonical customer-credit payment ledger record.", inputs: { type: "object" }, outputs: { type: "object" }, permissions: ["customer_credit.use"], handler: async ({ inputs = {} }) => buildPaymentTransaction(inputs) },
  { key: "customer.credit.transaction.build_adjustment", category: "CUSTOMER", description: "Build a canonical customer-credit adjustment ledger record.", inputs: { type: "object" }, outputs: { type: "object" }, permissions: ["customer_credit.manage"], handler: async ({ inputs = {} }) => buildAdjustmentTransaction(inputs) },
                { key: "online_order.create", category: "ONLINE_ORDER", description: "Create a canonical direct online-order record and reserve inventory.", inputs: { type: "object", required: ["externalOrderId", "fulfilmentType", "items"] }, outputs: { type: "object" }, permissions: ["online_orders.manage"], handler: async ({ inputs = {}, db, pool, companyId, userId, req }) => {
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
      publishEvent: ({ client, eventType, payload, actorUserId }) => publishPlatformEvent({
        db: client.query.bind(client),
        companyId: tenantId,
        eventType,
        payload,
        actorUserId,
      }),
    });
  } },
  { key: "online_order.transition", category: "ONLINE_ORDER", description: "Execute a canonical online-order lifecycle transition, including reservation release or sale creation when required.", inputs: { type: "object", required: ["orderId", "toStatus"] }, outputs: { type: "object" }, permissions: ["online_orders.manage"], handler: async ({ inputs = {}, db, pool, companyId, userId, req }) => {
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
      publishEvent: ({ client, eventType, payload, actorUserId }) => publishPlatformEvent({
        db: client.query.bind(client),
        companyId: tenantId,
        eventType,
        payload,
        actorUserId,
      }),
    });
  } },
  { key: "inventory.movement.create", category: "INVENTORY", description: "Create a canonical inventory movement.", inputs: { type: "object" }, outputs: { type: "object" }, permissions: ["inventory.adjust"], handler: async ({ inputs = {}, db }) => createInventoryMovement(db, inputs) },
                                { key: "attendance.clock_in", category: "STAFF", description: "Clock the authenticated user in using server-authoritative time and tenant/store context.", inputs: { type: "object" }, outputs: { type: "object" }, permissions: ["attendance.use"], handler: async ({ db, companyId, userId, req }) => clockInAttendance({ db, companyId: companyId || req?.user?.companyId, userId: userId || req?.user?.id, storeId: req?.user?.storeId }) },
  { key: "attendance.clock_out", category: "STAFF", description: "Clock the authenticated user out and calculate worked minutes from server timestamps.", inputs: { type: "object" }, outputs: { type: "object" }, permissions: ["attendance.use"], handler: async ({ db, companyId, userId, req }) => clockOutAttendance({ db, companyId: companyId || req?.user?.companyId, userId: userId || req?.user?.id }) },
        { key: "integration.event.dispatch", category: "INTEGRATIONS", description: "Dispatch a registered business event through enabled company integrations without coupling domain routes to providers.", inputs: { type: "object", required: ["event", "entityId"] }, outputs: { type: "object" }, permissions: ["integrations.manage"], handler: async ({ inputs = {}, db, companyId, req }) => dispatchIntegrationEvent({ event: inputs.event, deps: { db }, context: { companyId: companyId || req?.user?.companyId, storeId: inputs.storeId || req?.user?.storeId }, entityId: inputs.entityId }) },
        { key: "account.registration.token.issue", category: "SECURITY", description: "Issue a single-use expiring first-registration token for the user onboarding workflow.", inputs: { type: "object", required: ["userId"] }, outputs: { type: "string" }, permissions: ["users.manage"], handler: async ({ inputs = {}, db, companyId, req }) => issueAccountToken(db, { companyId: companyId || req?.user?.companyId, userId: inputs.userId, purpose: "REGISTRATION", expiresMinutes: inputs.expiresMinutes || 1440 }) },
      {
    key: "approval.submit",
    category: "APPROVALS",
    description: "Submit a record to the canonical Platform approval engine.",
    inputs: { type: "object", required: ["recordId"] }, outputs: { type: "object" }, permissions: ["approvals.submit"],
    handler: async ({ inputs = {}, db, object, fields, record, req }) => submitPlatformApproval({ db, object: inputs.object || object, fields: inputs.fields || fields || [], recordId: inputs.recordId, record: inputs.record || record, req }),
  },
  ]);

const duplicates = PLATFORM_FUNCTIONS.map((item) => item.key).filter((key, index, all) => all.indexOf(key) !== index);
if (duplicates.length) throw new Error(`Duplicate registered function keys: ${[...new Set(duplicates)].join(", ")}`);
export const PLATFORM_FUNCTION_MAP = new Map(PLATFORM_FUNCTIONS.map((item) => [item.key, item]));
export function getPlatformFunction(key) { return PLATFORM_FUNCTION_MAP.get(String(key || "").trim()) || null; }
export function listPlatformFunctions() { return PLATFORM_FUNCTIONS.slice(); }
