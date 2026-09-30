import { evaluateCondition } from "./platformConditions.js";
import { enqueuePlatformJob } from "./platformJobs.js";
import { executeRegisteredAction } from "./platformActions.js";
import { executeInventoryPlatformAction } from "./inventoryPlatform.js";
import { isSafeIdentifier } from "./platformMetadata.js";
import { resolveBindingTree, resolveRecordPathValue } from "./platformRecordPaths.js";
import { domainAllowed, issueAccountToken, normalizeEmail } from "./accountPolicy.js";
import { getPlatformService } from "./onlineOrders/index.js";
import { loadPlatformConfig } from "./onlineOrders/platformConfig.js";
import { resolveUberMenuProducts, UberMenuMappingError } from "./onlineOrders/uberMenuMapping.js";
import { createConnectorActionExecutor } from "./connectorFramework.js";
import { transitionGenericOrder } from "./onlineOrders/genericOrderService.js";
import { createInventoryMovement } from "./inventory.js";
import { createSaleForCompletedOrder } from "./onlineOrders/saleCreator.js";
import { publishPlatformEvent, publishRecordChangeEvent } from "./platformEvents.js";
import { resolveOneConnection, rotateOneConnectionOAuthTokens } from "./oneConnection.js";
import { createQuickBooksAdapter } from "./quickbooksAdapter.js";
import { syncQuickBooksVendor, exportQuickBooksPurchase, exportQuickBooksSupplierPayment, exportQuickBooksSupplierCredit } from "./quickbooksSync.js";
import { createShopifyAdapter } from "./shopifyAdapter.js";
import { exportShopifyFulfillment, exportShopifyRefund, syncShopifyInventory, syncShopifyProducts } from "./shopifySync.js";
import { processShopifyWebhookEvent } from "./onlineOrders/shopifyWebhookProcessor.js";
import { getCompanyEntitlements, hasEntitlement, isPackageLicensed } from "./licensing.js";
import { findConfiguredDuplicateMatches, resolveDuplicateAction } from "./platformDuplicateMatching.js";
import { loadEffectivePermissionSets, permissionSetAllowsSystemPermission } from "./platformPermissionSets.js";
import { writePlatformRecordHistory } from "./platformRecordHistory.js";
import { createGlobalProductLookupService, testGlobalProductProvider } from "./globalProductLookup.js";
import {
  findAvailableAppointmentSlots,
  holdAppointmentSlot,
  releaseAppointmentHold,
  confirmAppointmentFromHold,
  listPaymentRequestProviders,
  createAppointmentPaymentRequest,
  calculateAppointmentPayment,
  createAppointmentBookingCase,
  issueAppointmentPublicLink,
  resolveAssistantSubflow,
  completeAppointmentPayment,
} from "./oneAssistant.js";

import { PLATFORM_FUNCTIONS, PLATFORM_FUNCTION_MAP } from "./platformFunctionRegistry.js";
import { createPlatformExecutionContext, applyExecutionContext } from "./platformExecutionContext.js";
import { createExecutionGuard, claimPersistentExecution, completePersistentExecution, executionFingerprint } from "./platformExecutionGuard.js";
import {
  EXECUTION_MODES,
  resolveExecutionMode,
  authoritativeRuntimeCompanyId,
  assertRuntimeObjectPermission,
  assertRuntimeFieldWriteAccess,
} from "./platformRuntimeSecurity.js";
import { createGovernorBudget } from "./platformGovernor.js";
const IRREVERSIBLE_ACTIONS = new Set(["SEND_EMAIL", "SEND_SMS", "SEND_WHATSAPP", "CALL_WEBHOOK", "HTTP_REQUEST", "WEBHOOK"]);
const SECRET_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key)/i;
const globalProductLookupService = createGlobalProductLookupService();

async function executeGlobalProductLookupAction(context, providerKey = null) {
  const companyId = context.companyId || context.req?.user?.companyId;
  const barcode = context.action?.barcode ?? context.action?.code ?? context.record?.barcode ?? context.trigger?.barcode;
  try {
    const result = await globalProductLookupService.lookup({
      db: context.db,
      companyId,
      reqCompanyId: context.req?.user?.companyId || null,
      barcode,
      providerKey,
    });
    return { success: true, ...result };
  } catch (error) {
    return { success: false, code: error?.code || "LOOKUP_FAILED", message: error?.code === "INVALID_BARCODE" ? error.message : "Unable to look up this barcode" };
  }
}

async function executeGlobalProductProviderTest(context, providerKey) {
  const companyId = context.companyId || context.req?.user?.companyId;
  if (context.req?.user?.companyId && String(context.req.user.companyId) !== String(companyId)) {
    return { success: false, code: "INVALID_COMPANY", message: "Product lookup company context is invalid" };
  }
  return testGlobalProductProvider({ db: context.db, companyId, providerKey });
}

function redact(value, depth = 0) {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1)]));
}

function errorDetails(error) {
  return redact({
    message: String(error?.message || error || "Workflow execution failed").slice(0, 2000),
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    retryable: error?.retryable ?? null,
  });
}

async function loadProviderConnection(context, providerKey, requestedConnectionId = null) {
  const companyId = context.companyId || context.req?.user?.companyId;
  if (!context.db || !companyId) return null;

  const result = await context.db(
    `SELECT id
       FROM integration_connections
      WHERE company_id=$1
        AND enabled=TRUE
        AND lower(COALESCE(provider_name,connector_package_key,integration_type,''))=lower($2)
        AND ($3::uuid IS NULL OR id=$3)
      ORDER BY CASE WHEN store_id=$4::uuid THEN 0 WHEN store_id IS NULL THEN 1 ELSE 2 END,
               fallback_order,id
      LIMIT 1`,
    [companyId, providerKey, requestedConnectionId || null, context.storeId || context.req?.user?.storeId || null]
  );
  const connectionId = result.rows?.[0]?.id;
  if (!connectionId) return null;

  const loaded = await resolveOneConnection({
    db: context.db,
    companyId,
    connectionId,
    includeSecrets: true,
    migrateLegacy: true,
    actorUserId: context.userId || context.req?.user?.id || null,
  });
  if (!loaded) return null;

  const credentials = loaded.secrets || {};
  const expiry = Date.parse(credentials.tokenExpiry || credentials.token_expiry || "");
  const expiring = Number.isFinite(expiry) && expiry <= Date.now() + 60_000;

  if (expiring && (providerKey === "quickbooks" || providerKey === "shopify")) {
    const clientId = credentials.clientId || credentials.client_id;
    const clientSecret = credentials.clientSecret || credentials.client_secret;
    const refreshToken = credentials.refreshToken || credentials.refresh_token;
    let refreshed = null;

    if (providerKey === "quickbooks" && clientId && clientSecret && refreshToken) {
      refreshed = await refreshQuickBooksToken({
        clientId,
        clientSecret,
        refreshToken,
      });
    } else if (providerKey === "shopify" && refreshToken) {
      const shopDomain = credentials.shopDomain || credentials.shop_domain || loaded.connection.effective_base_url || loaded.connection.base_url;
      refreshed = await refreshShopifyToken({
        shopDomain,
        refreshToken,
        clientId,
        clientSecret,
      });
    }

    if (!refreshed) throw new Error(`${providerKey} token refresh is unavailable`);
    const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();

    await rotateOneConnectionOAuthTokens({
      db: context.db,
      companyId,
      connectionId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? refreshToken,
      expiresAt,
      actorUserId: context.userId || context.req?.user?.id || null,
    });

    const reloaded = await resolveOneConnection({
      db: context.db,
      companyId,
      connectionId,
      includeSecrets: true,
      migrateLegacy: false,
      actorUserId: context.userId || context.req?.user?.id || null,
    });
    return { connection: reloaded.connection, credentials: reloaded.secrets || {} };
  }

  return { connection: loaded.connection, credentials };
}

async function shopifyPackageAvailability(db, companyId) {
  const entitlements = await getCompanyEntitlements(db, companyId);
  if (!hasEntitlement(entitlements, "integrations")) {
    return { success: false, code: "NOT_LICENSED", retryable: false, message: "Shopify is not licensed for this company" };
  }
  const installed = await db(
    `SELECT 1 FROM company_package_installations i
       JOIN package_registry p ON p.id=i.package_id
      WHERE i.company_id=$1 AND p.package_key='shopify'
        AND i.status='active' AND i.suspended_by_entitlement=false LIMIT 1`,
    [companyId],
  );
  if (!installed.rows.length) return { success: false, code: "NOT_INSTALLED", retryable: false, message: "Shopify is not installed for this company" };
  return null;
}

async function quickBooksPackageAvailability(db, companyId) {
  const entitlements = await getCompanyEntitlements(db, companyId);
  if (!hasEntitlement(entitlements, "integrations")) {
    return { success: false, code: "NOT_LICENSED", retryable: false, message: "QuickBooks is not licensed for this company" };
  }
  const installed = await db(
    `SELECT 1 FROM company_package_installations i
       JOIN package_registry p ON p.id=i.package_id
      WHERE i.company_id=$1 AND p.package_key='quickbooks'
        AND i.status='active' AND i.suspended_by_entitlement=false LIMIT 1`,
    [companyId],
  );
  if (!installed.rows.length) return { success: false, code: "NOT_INSTALLED", retryable: false, message: "QuickBooks is not installed for this company" };
  return null;
}

export class WorkflowExecutionError extends Error {
  constructor(details, compensationFailures = []) {
    super(details.message);
    this.name = "WorkflowExecutionError";
    this.code = details.code || "WORKFLOW_EXECUTION_FAILED";
    this.details = details;
    this.compensationFailures = compensationFailures;
  }
}

const COMMUNICATION_PROVIDER_ALIASES = {
  EMAIL: ["email", "smtp", "mail", "sendgrid", "mailgun", "postmark", "ses"],
  SMS: ["sms", "twilio", "textlocal", "messagebird", "vonage", "nexmo", "clickatell"],
  WHATSAPP: ["whatsapp", "whatsapp_business", "meta_whatsapp"],
};

const GENERIC_CONNECTOR_ACTIONS = Object.freeze([
  {
    key: "CONNECTOR_HEALTH_CHECK",
    displayName: "Connector - Health Check",
    description: "Execute the installed connector health check for the current company/store/till scope.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["connector.view"],
    capability: "connector.health",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "CONNECTOR_HEALTH_CHECK" } }),
  },
  {
    key: "CONNECTOR_ENABLE",
    displayName: "Connector - Enable",
    description: "Enable the installed connector instance for the current tenant scope if supported.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["connector.manage"],
    capability: "connector.enable",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "CONNECTOR_ENABLE" } }),
  },
  {
    key: "CONNECTOR_DISABLE",
    displayName: "Connector - Disable",
    description: "Disable the installed connector instance for the current tenant scope if supported.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["connector.manage"],
    capability: "connector.disable",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "CONNECTOR_DISABLE" } }),
  },
  {
    key: "PAYMENT_START",
    displayName: "Payment - Start",
    description: "Start a payment through the assigned connector instance for the current till.",
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Payment action payload is required");
      if (action.amount === undefined && action.total === undefined) throw new Error("Payment action requires an amount or total");
    },
    async: true,
    requiredPermissions: ["sale.create"],
    capability: "payment.sale",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "PAYMENT_START" } }),
  },
  {
    key: "PAYMENT_CANCEL",
    displayName: "Payment - Cancel",
    description: "Cancel an in-flight payment through the assigned connector instance.",
    validation: (action) => {
      if (!action?.providerTransactionId && !action?.transactionId && !action?.paymentId) {
        throw new Error("Payment cancellation requires a transaction reference");
      }
    },
    async: true,
    requiredPermissions: ["sale.create"],
    capability: "payment.cancel",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "PAYMENT_CANCEL" } }),
  },
  {
    key: "PAYMENT_REFUND",
    displayName: "Payment - Refund",
    description: "Refund a completed payment through the assigned connector instance.",
    validation: (action) => {
      if (!action?.providerTransactionId && !action?.transactionId && !action?.paymentId) {
        throw new Error("Payment refund requires a transaction reference");
      }
    },
    async: true,
    requiredPermissions: ["sale.refund"],
    capability: "payment.refund",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "PAYMENT_REFUND" } }),
  },
  {
    key: "PRINT_RECEIPT",
    displayName: "Print - Receipt",
    description: "Print a receipt using the active printer connector on the assigned till.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["sale.invoice.reprint"],
    capability: "printer.print",
    executor: async (context) => executeConnectorWorkflowAction({
      ...context,
      action: { ...context.action, key: "PRINT_RECEIPT" },
      payload: context.action?.payload || {
        saleId: context.record?.id || context.recordId || context.action?.inputs?.saleId || null,
        receiptNumber: context.record?.receipt_number || context.record?.receiptNumber || null,
        sale: context.record || null,
        inputs: context.action?.inputs || {},
      },
    }),
  },
  {
    key: "PRINT_KITCHEN_TICKET",
    displayName: "Print - Kitchen Ticket",
    description: "Print a kitchen ticket using the active kitchen printer connector.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["sale.create"],
    capability: "printer.kitchen.print",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "PRINT_KITCHEN_TICKET" } }),
  },
  {
    key: "OPEN_CASH_DRAWER",
    displayName: "Cash Drawer - Open",
    description: "Open the assigned cash drawer connector if the current till supports it.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["till.open"],
    capability: "drawer.open",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "OPEN_CASH_DRAWER" } }),
  },
  {
    key: "SCANNER_STATUS",
    displayName: "Scanner - Status",
    description: "Return the status of the assigned barcode scanner connector.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    capability: "scanner.status",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "SCANNER_STATUS" } }),
  },
  {
    key: "CONNECTOR_TEST_CONNECTION",
    displayName: "Connector - Test Connection",
    description: "Run the connector test connection routine for the assigned instance.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["connector.test"],
    capability: "connector.test",
    executor: async (context) => executeConnectorWorkflowAction({ ...context, action: { ...context.action, key: "CONNECTOR_TEST_CONNECTION" } }),
  },
]);

const GENERIC_CONNECTOR_EVENTS = Object.freeze([
  "connector.online",
  "connector.offline",
  "connector.enabled",
  "connector.disabled",
  "payment.pending",
  "payment.approved",
  "payment.declined",
  "payment.cancelled",
  "payment.failed",
  "payment.refunded",
  "print.started",
  "print.completed",
  "print.failed",
  "scanner.connected",
  "scanner.disconnected",
  "cash_drawer.opened",
  "cash_drawer.failed",
]);

const DYNAMIC_CONNECTOR_ACTIONS = [];
const DYNAMIC_CONNECTOR_EVENTS = new Set();

const CONNECTOR_ACTIONS_BY_KEY = new Map(GENERIC_CONNECTOR_ACTIONS.map((definition) => [String(definition.key), definition]));
const CONNECTOR_EVENT_TYPES = new Set(GENERIC_CONNECTOR_EVENTS);

function mergedConnectorActions() {
  return [...WORKFLOW_ACTION_REGISTRY, ...DYNAMIC_CONNECTOR_ACTIONS];
}

function connectorActionCapability(actionKey) {
  const normalized = String(actionKey || "").toUpperCase();
  const action = CONNECTOR_ACTIONS_BY_KEY.get(normalized) || DYNAMIC_CONNECTOR_ACTIONS.find((item) => String(item.key || "").toUpperCase() === normalized);
  return action?.capability || null;
}

function connectorActionPermission(actionKey) {
  const normalized = String(actionKey || "").toUpperCase();
  const action = CONNECTOR_ACTIONS_BY_KEY.get(normalized) || DYNAMIC_CONNECTOR_ACTIONS.find((item) => String(item.key || "").toUpperCase() === normalized);
  return Array.isArray(action?.requiredPermissions) ? action.requiredPermissions : [];
}

function safeConnectorEventPayload(input) {
  const allowed = new Set([
    "companyId",
    "storeId",
    "tillId",
    "connectorInstanceId",
    "connectorKey",
    "capability",
    "internalTransactionId",
    "internalReferenceId",
    "status",
    "timestamp",
    "message",
    "amount",
    "currency",
  ]);
  const sensitiveKeyPattern = /(card|cvv|cvc|pan|secret|credential|token|password|api[_-]?key|authorization|cookie|private[_-]?key)/i;
  const output = {};
  if (!input || typeof input !== "object") return output;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (key === "companyId" || key === "storeId" || key === "tillId" || key === "connectorInstanceId" || key === "connectorKey" || key === "capability" || key === "internalTransactionId" || key === "internalReferenceId" || key === "status" || key === "timestamp" || key === "message" || key === "amount" || key === "currency") {
      output[key] = value;
      continue;
    }
    if (sensitiveKeyPattern.test(key)) continue;
    if (allowed.has(key) || (!Number.isNaN(Number(key)) && typeof value !== "object")) {
      output[key] = value;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  return output;
}

export function getRegisteredConnectorWorkflowActions() {
  return [...GENERIC_CONNECTOR_ACTIONS, ...DYNAMIC_CONNECTOR_ACTIONS];
}

export function getRegisteredConnectorWorkflowEvents() {
  return [...CONNECTOR_EVENT_TYPES, ...DYNAMIC_CONNECTOR_EVENTS];
}

export function registerConnectorWorkflowAction(definition) {
  if (!definition || typeof definition !== "object") throw new Error("Connector workflow action registration requires an object");
  const key = String(definition.key || "").trim();
  if (!key) throw new Error("Connector workflow action requires a key");
  const next = {
    ...definition,
    key,
    requiredPermissions: Array.isArray(definition.requiredPermissions) ? definition.requiredPermissions : [],
    capability: definition.capability || definition.requiredCapability || null,
  };
  const existingIndex = DYNAMIC_CONNECTOR_ACTIONS.findIndex((item) => String(item.key || "").toUpperCase() === key.toUpperCase());
  if (existingIndex >= 0) DYNAMIC_CONNECTOR_ACTIONS.splice(existingIndex, 1, next);
  else DYNAMIC_CONNECTOR_ACTIONS.push(next);
  CONNECTOR_ACTIONS_BY_KEY.set(key.toUpperCase(), next);
  return next;
}

export function registerConnectorWorkflowEventType(eventType, description = null) {
  const normalized = String(eventType || "").trim();
  if (!normalized) throw new Error("Connector workflow event requires an event type");
  CONNECTOR_EVENT_TYPES.add(normalized);
  if (description) DYNAMIC_CONNECTOR_EVENTS.add(normalized);
  return { eventType: normalized, description };
}

function normalizeConnectorActionKey(rawKey) {
  return String(rawKey || "").trim().toUpperCase();
}

function permissionAllowsConnectorAction(user, actionKey) {
  if (!user || typeof user !== "object") return true;
  const hasUserIdentity = [user.id, user.userId, user.companyId, user.storeId, user.roleId, user.isAdmin]
    .some((value) => value !== undefined && value !== null && value !== false);
  if (!hasUserIdentity) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : Array.isArray(user?.permissionCodes) ? user.permissionCodes : [];
  const required = connectorActionPermission(actionKey);
  if (!required.length) return true;
  return required.some((permission) => permissions.includes(permission) || user?.isAdmin === true);
}

export async function executeConnectorWorkflowAction({
  action,
  db,
  companyId,
  storeId,
  tillId,
  connectorDrivers,
  req,
  writeAudit = null,
  actorUserId = null,
  payload = null,
}) {
  const requestedKey = normalizeConnectorActionKey(action?.key || action?.actionKey || action?.type);
  if (!requestedKey) return { success: false, code: "INVALID_ACTION", message: "Connector workflow action requires a key" };
  const capability = connectorActionCapability(requestedKey) || action?.capability || action?.requiredCapability || null;
  if (!capability) return { success: false, code: "UNSUPPORTED_ACTION", message: "This connector workflow action is not registered for this capability" };
  const requestedCapability = String(action?.capability || action?.requiredCapability || "").trim();
  if (requestedCapability && requestedCapability !== capability) {
    return {
      success: false,
      code: "NOT_SUPPORTED",
      message: `Connector workflow action "${requestedKey}" does not support capability "${requestedCapability}"`,
      capability,
      requestedKey,
    };
  }
  const user = req?.user || {};
  if (!permissionAllowsConnectorAction(user, requestedKey)) {
    return { success: false, code: "PERMISSION_DENIED", message: "You do not have permission to execute this connector action" };
  }
  if (!db || typeof db !== "function") {
    return { success: false, code: "NO_DATABASE_CONTEXT", message: "Connector workflow action requires a database context" };
  }
  const tenantCompanyId = companyId || req?.user?.companyId || null;
  const tenantStoreId = storeId || req?.user?.storeId || null;
  const tenantTillId = tillId || req?.user?.tillId || null;
  if (!tenantCompanyId || !tenantStoreId || !tenantTillId) {
    return { success: false, code: "INVALID_SCOPE", message: "Connector workflow action requires a company, store, and till scope" };
  }
  const runtimePayload = payload ?? action?.payload ?? { ...action };
  const explicitInstanceId = action?.connectorInstanceId || action?.instanceId || runtimePayload?.connectorInstanceId || runtimePayload?.instanceId || null;

  // Management/test actions must work before a connector is enabled, so they
  // resolve the explicitly selected instance instead of the enabled-candidate
  // payment runtime.
  if (explicitInstanceId && ["CONNECTOR_TEST_CONNECTION","CONNECTOR_ENABLE","CONNECTOR_DISABLE"].includes(requestedKey)) {
    const instanceResult = await db(
      `SELECT c.*,p.manifest
         FROM integration_connections c
         JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
         JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=c.company_id
          AND i.status='active' AND i.suspended_by_entitlement=FALSE
        WHERE c.id=$1 AND c.company_id=$2
        LIMIT 1`,
      [explicitInstanceId, tenantCompanyId]
    );
    const instance = instanceResult.rows[0];
    if (!instance) return { success: false, code: "CONNECTOR_NOT_FOUND", message: "Installed connector instance not found" };
    const driver = connectorDrivers?.get(instance.connector_package_key);
    if (!driver) return { success: false, code: "PROVIDER_NOT_SUPPORTED", message: "Connector app has no runtime driver", connectorInstanceId: instance.id };

    if (requestedKey === "CONNECTOR_ENABLE" || requestedKey === "CONNECTOR_DISABLE") {
      if (requestedKey === "CONNECTOR_ENABLE") {
        const lastTest = typeof instance.last_test_result === "string" ? JSON.parse(instance.last_test_result || "{}") : (instance.last_test_result || {});
        if (!instance.till_id || lastTest?.success !== true) {
          return { success: false, code: "TEST_REQUIRED", message: "Assign and successfully test this connector before enabling it", connectorInstanceId: instance.id };
        }
      }
      const enabled = requestedKey === "CONNECTOR_ENABLE";
      const updated = await db(
        `UPDATE integration_connections
            SET enabled=$1,updated_at=NOW()
          WHERE id=$2 AND company_id=$3
          RETURNING id,connector_package_key,enabled,connection_status`,
        [enabled, instance.id, tenantCompanyId]
      );
      await writeAudit?.(tenantCompanyId, actorUserId || req?.user?.id || null, enabled ? "connector.instance.enabled" : "connector.instance.disabled", "integration_connection", instance.id, { packageKey: instance.connector_package_key });
      return {
        success: true,
        status: enabled ? "ENABLED" : "DISABLED",
        connectorInstanceId: instance.id,
        connectorPackageKey: instance.connector_package_key,
        capability,
        requestedKey,
        result: updated.rows[0] || { enabled },
      };
    }

    const manifest = effectiveManifest(instance.connector_package_key, instance.manifest);
    const capabilities = (manifest?.connectorApp?.capabilities || [])
      .map((item) => typeof item === "string" ? item : item?.key)
      .filter((key) => key && driver.capabilities.has(key));
    const { ConnectorService } = await import("./connectorRuntime.js");
    const loadedConnection = await resolveOneConnection({
      db,
      companyId: tenantCompanyId,
      connectionId: instance.id,
      includeSecrets: true,
      migrateLegacy: true,
      actorUserId: actorUserId || req?.user?.id || null,
    });
    const service = new ConnectorService({
      connectorKey: instance.connector_package_key,
      capabilities,
      adapter: driver.createAdapter({
        instanceId: instance.id,
        configuration: {
          ...(typeof instance.connector_configuration === "string" ? JSON.parse(instance.connector_configuration || "{}") : (instance.connector_configuration || {})),
          ...(loadedConnection?.secrets || {}),
        },
        companyId: instance.company_id,
        storeId: instance.store_id,
        tillId: instance.till_id,
      }),
    });
    const connection = await service.connect();
    const test = connection.healthy
      ? await service.test()
      : { success: false, status: connection.state, code: connection.errorCode, message: connection.lastError };
    const testResult = { ...test, testMode: manifest.connectorApp?.mode === "TEST" || (instance.connector_configuration?.mode === "TEST") };
    await db(
      `UPDATE integration_connections
          SET connection_status=$1::varchar,last_error=$2,last_test_at=NOW(),
              last_test_result=$3::jsonb,
              last_connected_at=CASE WHEN $1::varchar='CONNECTED' THEN NOW() ELSE last_connected_at END,
              updated_at=NOW()
        WHERE id=$4 AND company_id=$5`,
      [test.success ? "CONNECTED" : connection.state, test.message || null, JSON.stringify(testResult), instance.id, tenantCompanyId]
    );
    await writeAudit?.(tenantCompanyId, actorUserId || req?.user?.id || null, "connector.instance.tested", "integration_connection", instance.id, { packageKey: instance.connector_package_key, success: test.success, testMode: testResult.testMode });
    return {
      success: test.success === true,
      status: test.success ? "CONNECTED" : (test.status || connection.state || "ERROR"),
      connectorInstanceId: instance.id,
      connectorPackageKey: instance.connector_package_key,
      capability,
      requestedKey,
      result: testResult,
      ...(test.success ? {} : { code: test.code || connection.errorCode || "TEST_FAILED", message: test.message || connection.lastError || "Connector test failed" }),
    };
  }

  const resolved = await import("./connectorRuntime.js").then(({ resolvePersistedConnectorCapability }) => resolvePersistedConnectorCapability({
    db,
    drivers: connectorDrivers,
    companyId: tenantCompanyId,
    storeId: tenantStoreId,
    tillId: tenantTillId,
    capabilityKey: capability,
    selfCheckout: action?.selfCheckout === true,
    payload: runtimePayload,
    writeAudit,
    actorUserId: actorUserId || req?.user?.id || null,
  }));
  if (!resolved.available) {
    return {
      success: false,
      code: resolved.code || "CONNECTOR_UNAVAILABLE",
      message: resolved.message || "No eligible connector is available in the current scope",
      connectorInstanceId: resolved.connectorInstanceId || null,
      capability,
    };
  }
  return {
    success: true,
    status: resolved.result?.status || (resolved.state ? resolved.state : "COMPLETED"),
    result: resolved.result || { status: resolved.state || "COMPLETED" },
    connectorInstanceId: resolved.connectorInstanceId || null,
    connectorPackageKey: resolved.connectorPackageKey || null,
    capability,
    requestedKey,
  };
}

export async function emitConnectorWorkflowEvent({
  db,
  companyId,
  storeId,
  tillId,
  connectorInstanceId,
  connectorKey,
  capability,
  eventType,
  status,
  internalTransactionId,
  internalReferenceId,
  payload = {},
}) {
  const normalizedType = String(eventType || "").trim();
  if (!normalizedType || !CONNECTOR_EVENT_TYPES.has(normalizedType)) {
    throw new Error(`Unsupported connector workflow event: ${normalizedType || "unknown"}`);
  }
  const safePayload = safeConnectorEventPayload({
    companyId,
    storeId,
    tillId,
    connectorInstanceId,
    connectorKey,
    capability,
    internalTransactionId,
    internalReferenceId,
    status,
    timestamp: new Date().toISOString(),
    ...(payload && typeof payload === "object" ? payload : {}),
  });
  const result = await publishPlatformEvent({
    db,
    companyId,
    eventType: normalizedType,
    payload: safePayload,
    actorUserId: null,
    idempotencyKey: internalReferenceId || `${connectorInstanceId || connectorKey || "connector"}:${normalizedType}:${Date.now()}`,
  });
  return result;
}

function normalizeProviderName(value) {
  return String(value || "").trim().toLowerCase();
}

async function loadUberWorkflowContext({ db, req, companyId }) {
  const requestCompanyId = req?.user?.companyId || null;
  const tenantId = companyId || requestCompanyId;
  if (!db || typeof db !== "function" || !tenantId) {
    throw new Error("Uber action requires a company-scoped database context");
  }
  if (requestCompanyId && String(requestCompanyId) !== String(tenantId)) {
    throw new Error("Uber action company context is invalid");
  }
  return {
    db,
    companyId: tenantId,
    runtime: await loadPlatformConfig(db, tenantId, "uber"),
    service: getPlatformService("uber"),
  };
}

function extractUberStoreIds(data) {
  const stores = Array.isArray(data?.stores) ? data.stores : Array.isArray(data) ? data : [];
  return stores.map((store) => ({
    storeId: store.id || store.store_id || null,
    name: store.name || null,
    brandId: store.brand?.id || store.brand_id || null,
    brandName: store.brand?.description || store.brand?.name || store.brand_name || null,
    status: typeof store.status === "string" ? store.status : store.status?.type || null,
    integrationEnabled: store.integration_enabled == null ? null : store.integration_enabled === true,
  }));
}

async function runUberStoreConnectionTest(runtime, service) {
  if (runtime.enabled !== true) {
    return {
      success: false,
      code: "PLATFORM_DISABLED",
      message: "Uber Eats integration is disabled in Settings - Online Platforms",
      attempts: [],
      stores: [],
    };
  }

  const environments = [runtime.environment || "sandbox"];
  if (environments[0] !== "production") environments.push("production");
  const attempts = [];
  for (const environment of environments) {
    const response = await service.getStores({ ...runtime, environment });
    attempts.push({
      environment,
      success: response.success === true,
      httpStatus: response.httpStatus ?? null,
      code: response.code || null,
      message: response.message || null,
      stores: response.success ? extractUberStoreIds(response.data) : [],
      uberResponse: response.data ?? null,
    });
    if (response.success) break;
  }

  const successAttempt = attempts.find((attempt) => attempt.success);
  const lastAttempt = attempts[attempts.length - 1];
  const successMessage = successAttempt
    ? successAttempt.stores.length
      ? `Uber connection OK (${successAttempt.environment}) - ${successAttempt.stores.length} store(s) found`
      : successAttempt.environment === "sandbox"
        ? "No Sandbox stores are currently provisioned for this application."
        : "No stores are currently provisioned for this application."
    : null;
  return {
    success: Boolean(successAttempt),
    message: successMessage || lastAttempt?.message || "Uber API rejected the request - see the raw response",
    code: successAttempt ? null : lastAttempt?.code || null,
    attempts,
    stores: successAttempt ? successAttempt.stores : [],
  };
}

async function executeUberOrderAction(context, operation) {
  const { db, req, action = {}, recordId, record } = context;
  const { companyId, runtime, service } = await loadUberWorkflowContext(context);
  const orderId = action.orderId || recordId || record?.id;
  if (!orderId) {
    return { success: false, code: "ORDER_NOT_FOUND", message: "Uber order identifier is required" };
  }

  const orderDb = context.client
    ? context.client.query.bind(context.client)
    : db;
  const orderResult = await orderDb(
    `SELECT id, company_id, store_id, platform, external_order_id, status
       FROM online_orders
      WHERE id=$1 AND company_id=$2 AND platform='uber'
      LIMIT 1`,
    [orderId, companyId]
  );
  const order = orderResult.rows?.[0];
  if (!order || !order.external_order_id) {
    return { success: false, code: "ORDER_NOT_FOUND", message: "Uber order not found" };
  }
  if (req?.user?.storeId && String(req.user.storeId) !== String(order.store_id || "")) {
    return { success: false, code: "STORE_SCOPE_MISMATCH", message: "Uber order is outside the current store scope" };
  }

  const validStatuses = operation === "accept" ? ["RECEIVED"] : ["RECEIVED", "ACCEPTED"];
  if (!validStatuses.includes(order.status)) {
    return {
      success: false,
      code: "INVALID_STATUS",
      message: `Order in status ${order.status} cannot be ${operation === "accept" ? "accepted" : "denied"}`,
    };
  }

  if (runtime.enabled !== true) {
    return {
      success: false,
      code: "PLATFORM_DISABLED",
      message: "Uber Eats integration is disabled in Settings - Online Platforms",
    };
  }
  if (operation === "accept") return service.acceptOrder(order, runtime);
  return service.rejectOrder(order, action.reason || null, runtime);
}

function uberItemId(product) {
  return product?.uber_item_id || product?.id || null;
}

function validateUberStore(runtime) {
  const storeId = runtime.store_id || runtime.store_location_id;
  return storeId
    ? { storeId: String(storeId) }
    : { success: false, code: "STORE_NOT_MAPPED", message: "No Uber store is mapped for this company" };
}

async function loadUberProductForItem(context, runtime) {
  const { db, action = {}, recordId, record } = context;
  const companyId = context.companyId || context.req?.user?.companyId;
  const productId = action.productId || recordId || record?.id;
  const itemId = action.itemId || action.uberItemId || null;
  if (!productId && !itemId) {
    return { error: { success: false, code: "PRODUCT_REQUIRED", message: "Product or Uber item identifier is required" } };
  }
  const result = await db(
    `SELECT p.id, p.company_id, p.uber_item_id, p.price
       FROM products p
      WHERE p.company_id = $1
        AND (${productId ? "p.id = $2" : "p.uber_item_id = $2"})
      LIMIT 1`,
    [companyId, productId || itemId]
  );
  const product = result.rows?.[0];
  if (!product) {
    return { error: { success: false, code: "PRODUCT_NOT_FOUND", message: "Product is not mapped for this company" } };
  }
  const resolvedItemId = uberItemId(product);
  if (!resolvedItemId) {
    return { error: { success: false, code: "ITEM_NOT_MAPPED", message: "Product has no stable Uber item mapping" } };
  }
  const store = validateUberStore(runtime);
  if (store.success === false) return { error: store };
  return { product, itemId: String(resolvedItemId), storeId: store.storeId };
}

function priceMinorUnits(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || Math.round(parsed * 100) !== parsed * 100) return null;
  return Math.round(parsed * 100);
}

async function executeUberItemAction(context, operation) {
  const { action = {} } = context;
  const { runtime, service } = await loadUberWorkflowContext(context);
  if (runtime.enabled !== true) {
    return { success: false, code: "PLATFORM_DISABLED", message: "Uber Eats integration is disabled in Settings - Online Platforms" };
  }
  const resolved = await loadUberProductForItem(context, runtime);
  if (resolved.error) return resolved.error;

  let body;
  if (operation === "price") {
    const price = priceMinorUnits(action.priceMinorUnits ?? action.price ?? resolved.product.price);
    if (price === null) {
      return { success: false, code: "INVALID_PRICE", message: "Price must be a non-negative amount with at most two decimal places" };
    }
    body = { price_info: { price, overrides: [] } };
  } else if (operation === "available") {
    body = { suspension_info: { suspension: { suspend_until: null } } };
  } else {
    const suspendUntil = Number(action.suspendUntil ?? action.suspend_until);
    if (!Number.isInteger(suspendUntil) || suspendUntil <= Math.floor(Date.now() / 1000)) {
      return { success: false, code: "INVALID_SUSPENSION", message: "suspendUntil must be a future Unix timestamp in seconds" };
    }
    body = { suspension_info: { suspension: { suspend_until: suspendUntil, reason: "Out of stock" } } };
  }

  const response = await service.updateMenuItem(resolved.storeId, resolved.itemId, body, runtime);
  return response.success === true
    ? { ...response, productId: resolved.product.id, itemId: resolved.itemId, storeId: resolved.storeId }
    : { ...response, code: response.code || "UBER_ITEM_UPDATE_FAILED", productId: resolved.product.id, itemId: resolved.itemId, storeId: resolved.storeId };
}

function resolveCommunicationWorkflowAction(action, record, object = null, workflowVariables = null) {
  const rootObjectKey = object?.object_key || object?.objectKey || null;
  const resolveRecipient = (value) => {
    if (value && typeof value === "object") {
      const resolved = resolveBindingTree(value, { record, rootObjectKey, variables: workflowVariables });
      return resolved == null ? value : resolved;
    }
    if (typeof value === "string" && record) {
      const resolved = resolveRecordPathValue(record, value, rootObjectKey);
      if (resolved !== undefined && resolved !== null && resolved !== "") return resolved;
    }
    return value;
  };
  return {
    ...action,
    recipient: resolveRecipient(action?.recipient),
    to: resolveRecipient(action?.to),
    templateContext: action?.templateContext
      ? resolveBindingTree(action.templateContext, { record, rootObjectKey, variables: workflowVariables })
      : (record || {}),
  };
}

export async function hasConfiguredCommunicationProvider({ db, companyId, providerKind }) {
  if (!db || typeof db !== "function" || !companyId || !providerKind) return false;
  const providerName = String(providerKind).trim().toUpperCase();
  const providers = COMMUNICATION_PROVIDER_ALIASES[providerName] || [normalizeProviderName(providerKind)];
  if (!providers.length) return false;

  const result = await db(
    `SELECT provider, active, configuration FROM integrations WHERE company_id = $1 AND lower(provider) = ANY($2::text[]) LIMIT 1`,
    [companyId, providers]
  );

  if (!result.rows.length) return false;
  const row = result.rows[0];
  const config = row.configuration && typeof row.configuration === "object" ? row.configuration : {};
  if (row.active !== true) return false;

  const hasConfig = Object.keys(config).length > 0;
  if (providerName === "EMAIL") {
    return hasConfig && ["host", "server", "api_key", "auth_token", "username", "smtp_host", "from_email", "from", "sender"].some((key) => config[key] != null && String(config[key]).trim() !== "");
  }
  if (providerName === "SMS") {
    return hasConfig && ["account_sid", "auth_token", "api_key", "from", "sender", "phone_number", "provider_key", "sid"].some((key) => config[key] != null && String(config[key]).trim() !== "");
  }
  if (providerName === "WHATSAPP") {
    return hasConfig && ["phone_number_id", "app_id", "access_token", "webhook_verify_token", "business_account_id", "token"].some((key) => config[key] != null && String(config[key]).trim() !== "");
  }
  return hasConfig;
}

export async function updateWorkflowStepRunStatus({ db, stepRunId, status, errorText = null, metadata = {} }) {
  if (!db || typeof db !== "function" || !stepRunId) return null;
  const row = await db(
    `UPDATE platform_workflow_step_runs SET status=$1, completed_at=COALESCE(completed_at, NOW()), error_text=$2, metadata=COALESCE(metadata,'{}'::jsonb) || $3::jsonb, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [String(status || "FAILED").toUpperCase(), errorText || null, JSON.stringify(metadata || {}), stepRunId]
  );
  return row.rows[0] || null;
}

export async function ensureCommunicationProvider({ db, companyId, providerKind, stepRunId = null }) {
  const configured = await hasConfiguredCommunicationProvider({ db, companyId, providerKind });
  if (configured) return { configured: true, providerKind };
  const label = String(providerKind || "provider").toUpperCase();
  const message = `${label} provider not configured`;
  if (stepRunId) {
    await updateWorkflowStepRunStatus({ db, stepRunId, status: "FAILED", errorText: message, metadata: { provider: label, providerConfigured: false } });
  }
  return { configured: false, providerKind: label, error: message };
}

/**
 * Load the relationship metadata a record-association action writes through.
 *
 * `platform_relationships` is object-level metadata (which objects relate, and
 * through which field) — never a record-level link table. A record-to-record
 * link is stored the same way the related-records reader reads it: the CHILD
 * record's foreign key column holds the parent record id, so the association is
 * persisted on the child object's existing source table through its mapped
 * `child_field_id`.
 */
async function loadRecordRelationship({ db, action, object }) {
  if (!db || typeof db !== "function") return null;
  const relationshipKey = action?.relationshipKey;
  const parentObjectId = action?.parentObjectId || object?.id || null;
  if (!relationshipKey || !parentObjectId) return null;
  const result = await db(
    `SELECT r.id, r.relationship_key, r.relationship_type, r.child_field_id,
            p.object_key AS parent_object_key,
            c.object_key AS child_object_key, c.source_table AS child_source_table,
            c.company_scoped AS child_company_scoped, c.store_scoped AS child_store_scoped
       FROM platform_relationships r
       JOIN platform_objects p ON p.id=r.parent_object_id
       JOIN platform_objects c ON c.id=r.child_object_id
      WHERE r.parent_object_id=$1 AND r.relationship_key=$2 AND r.active=true
      LIMIT 1`,
    [parentObjectId, relationshipKey]
  );
  const relationship = result.rows[0];
  if (!relationship) return null;
  if (!relationship.child_field_id) return { relationship, field: null };
  const fieldResult = await db(
    "SELECT id, api_name, source_column FROM platform_fields WHERE id=$1 AND active=true LIMIT 1",
    [relationship.child_field_id]
  );
  return { relationship, field: fieldResult.rows[0] || null };
}

const ONLINE_ORDER_TRANSITION_TARGETS = new Set([
  "PREPARING",
  "REJECTED",
  "AUTO_READY",
  "READY_FOR_PICKUP",
  "READY_FOR_DELIVERY",
  "COLLECTED",
  "COMPLETED",
  "CANCELLED",
]);

async function executeOnlineOrderTransition({ db, pool, action, req, record, recordId, companyId, userId }) {
  const tenantId = companyId || req?.user?.companyId;
  const orderId = action?.orderId || record?.id || recordId;
  if (!tenantId || !orderId || typeof db !== "function" || typeof pool?.connect !== "function") {
    throw new Error("Online order actions require a company-scoped record and database pool");
  }
  if (req?.user?.companyId && String(req.user.companyId) !== String(tenantId)) {
    throw new Error("Online order action company context is invalid");
  }
  const result = await db(
    "SELECT id,company_id,store_id,platform,fulfilment_type,status FROM online_orders WHERE id=$1 AND company_id=$2 LIMIT 1",
    [orderId, tenantId]
  );
  const order = result.rows[0];
  if (!order) throw Object.assign(new Error("Online order not found"), { status: 404 });
  if (req?.user?.storeId && String(req.user.storeId) !== String(order.store_id || "")) {
    throw Object.assign(new Error("Online order is outside the current store scope"), { status: 403 });
  }
  if (order.platform !== "direct") {
    throw Object.assign(new Error("Provider-specific order actions must be executed by the provider integration"), { status: 409 });
  }

  let toStatus = String(action.toStatus || "").toUpperCase();
  if (toStatus === "AUTO_READY") {
    toStatus = order.fulfilment_type === "SELF_PICKUP"
      ? "READY_FOR_PICKUP"
      : order.fulfilment_type === "DELIVERY"
        ? "READY_FOR_DELIVERY"
        : "READY";
  }
  if (!ONLINE_ORDER_TRANSITION_TARGETS.has(String(action.toStatus || "").toUpperCase())) {
    throw new Error("Online order action requires a supported lifecycle target");
  }
  if (toStatus === "READY_FOR_PICKUP" && order.fulfilment_type !== "SELF_PICKUP") {
    throw new Error("Only self-pickup orders can be marked ready for pickup");
  }
  if (toStatus === "READY_FOR_DELIVERY" && order.fulfilment_type !== "DELIVERY") {
    throw new Error("Only delivery orders can be marked ready for delivery");
  }

  const transition = await transitionGenericOrder({
    pool,
    companyId: tenantId,
    orderId,
    userId: userId || req?.user?.id || null,
    toStatus,
    reason: action.reason || null,
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
  if (!transition.success) {
    throw Object.assign(new Error(transition.error || "Online order transition failed"), {
      status: transition.error === "Order not found" ? 404 : 409,
    });
  }
  return transition;
}

async function executeLicenceRequestPackageAction({ db, action, req, companyId, userId, pool, writeAudit }) {
  const packageKey = String(action?.packageKey || action?.package_key || "").trim();
  const tenantId = companyId || req?.user?.companyId;
  const actorId = userId || req?.user?.id || null;
  if (!db || !tenantId || !packageKey) throw new Error("Licence request requires a package key and company context");
  const packageResult = await db(
    `SELECT p.package_key,p.name,p.visible,p.active,p.installable,p.system_only,p.publication_state,p.manifest,
            c.name AS company_name,u.full_name,u.username,u.email
       FROM package_registry p
       JOIN companies c ON c.id=$2
       LEFT JOIN users u ON u.id=$3
      WHERE p.package_key=$1 LIMIT 1`,
    [packageKey, tenantId, actorId]
  );
  const packageRow = packageResult.rows[0];
  if (!packageRow || packageRow.visible !== true || packageRow.active !== true || packageRow.installable !== true || packageRow.system_only === true || packageRow.publication_state !== "PUBLISHED") {
    throw Object.assign(new Error("This package cannot be requested"), { status: 409 });
  }
  const entitlements = await getCompanyEntitlements(db, tenantId);
  if (isPackageLicensed(entitlements, packageRow)) {
    throw Object.assign(new Error("This package is already licensed for the company"), { status: 409 });
  }
  const existing = await db("SELECT * FROM platform_licence_requests WHERE company_id=$1 AND package_key=$2 AND status='PENDING' LIMIT 1", [tenantId, packageKey]);
  if (existing.rows.length) return { status: "PENDING", duplicate: true, request: existing.rows[0] };
  const requestResult = await db(
    `INSERT INTO platform_licence_requests
      (company_id,package_key,package_name,requesting_user_id,requesting_user_name,licence_status)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [tenantId, packageKey, packageRow.name, actorId, packageRow.full_name || packageRow.username || packageRow.email || null,
      JSON.stringify({ licensed: false, entitlementKey: packageRow.manifest?.entitlementKey || packageKey })]
  );
  const request = requestResult.rows[0];
  const platformAdmins = await db(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN role_permissions rp ON rp.role_id=u.role_id
       JOIN permissions p ON p.id=rp.permission_id
      WHERE u.active=true AND p.code='platform.manage'`
  );
  for (const admin of platformAdmins.rows || []) {
    await db(
      `INSERT INTO platform_notifications (company_id,user_id,title,message,metadata)
       VALUES (NULL,$1,$2,$3,$4::jsonb)`,
      [admin.id, "Licence request received", `${packageRow.company_name} requested licence for ${packageRow.name}`, JSON.stringify({ source: "licence_request", requestId: request.id, companyId: tenantId, packageKey })]
    );
  }
  if (typeof writeAudit === "function") {
    await writeAudit(tenantId, actorId, "licence_request_created", "platform_licence_request", request.id, { packageKey, packageName: packageRow.name, status: "PENDING" });
  }
  const templateResult = await db(
    `INSERT INTO platform_message_templates
      (company_id,name,api_key,description,channel,subject,body,active,created_by)
     VALUES ($1,'Licence Request Created','licence_request_superadmin','Default Superadmin licence-request email','EMAIL',
       'Licence request - {{company.name}} - {{package.name}}',
       'Company: {{company.name}}\n\nRequested app: {{package.name}}\n\nRequested by: {{request.user_name}}\n\nRequested at: {{request.created_at}}',true,$2)
     ON CONFLICT(company_id,api_key) DO UPDATE SET updated_at=NOW()
     RETURNING id`,
    [tenantId, actorId]
  );
  const templateId = templateResult.rows[0]?.id;
  await db(
    `INSERT INTO platform_rules (object_id,name,trigger_key,conditions,action,active,company_id,created_by)
     SELECT NULL,'Licence Request Created','licence_request_created','[]'::jsonb,$1::jsonb,true,$2,$3
      WHERE NOT EXISTS (SELECT 1 FROM platform_rules WHERE company_id=$2 AND trigger_key='licence_request_created' AND active=true)`,
    [JSON.stringify({ type: "workflow", actions: [
      { type: "IN_APP_NOTIFICATION", message: `${packageRow.company_name} requested licence for ${packageRow.name}` },
      { type: "SEND_EMAIL", recipient: "platform_superadmins", templateId, templateContext: {
        company: { name: packageRow.company_name }, package: { name: packageRow.name },
        request: { user_name: request.requesting_user_name, created_at: request.created_at },
      } },
    ] }), tenantId, actorId]
  );
  const workflowResult = await db(
    `SELECT id,name,action FROM platform_rules
      WHERE active=true AND trigger_key='licence_request_created' AND (company_id=$1 OR company_id IS NULL)
      ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END,id LIMIT 1`,
    [tenantId]
  );
  if (workflowResult.rows[0]?.action) {
    const workflow = workflowResult.rows[0];
    const actions = Array.isArray(workflow.action.actions) ? workflow.action.actions : [];
    const run = await createWorkflowRun({ db, companyId: tenantId, workflowId: workflow.id, workflowName: workflow.name, triggerKey: "licence_request_created", status: "RUNNING", metadata: { requestId: request.id } });
    const record = { ...request, company_name: packageRow.company_name, package_name: packageRow.name, request_user_name: request.requesting_user_name };
    try {
      await executeWorkflowActions({ actions, db, pool, req, companyId: tenantId, userId: actorId, record, runId: run?.id || null, trigger: "licence_request_created", writeAudit });
      if (run?.id) await db("UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1", [run.id]);
    } catch (error) {
      if (run?.id) {
        const failureMessage = String(error?.message || error || "Workflow execution failed").slice(0, 2000);
        await db(
          "UPDATE platform_workflow_runs SET status='FAILED',completed_at=NOW(),error_text=$1,updated_at=NOW(),metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb WHERE id=$3",
          [failureMessage, JSON.stringify({ error: failureMessage, last_error: failureMessage }), run.id]
        );
      }
    }
  }
  return { status: "PENDING", duplicate: false, request };
}

function workflowHistoryTrace(context = {}) {
  return {
    actorUserId: context.userId || context.req?.user?.id || null,
    correlationId: context.correlationId || context.$System?.correlationId || context.executionContext?.globals?.$System?.correlationId || null,
    workflowRunId: context.runId || context.$Flow?.runId || context.executionContext?.globals?.$Flow?.runId || null,
    eventId: context.req?.platformEvent?.eventId || null,
    source: "WORKFLOW",
    executionMode: context.executionMode || context.$System?.executionMode || context.executionContext?.globals?.$System?.executionMode || "USER",
  };
}

export const WORKFLOW_ACTION_REGISTRY = Object.freeze([
  ...GENERIC_CONNECTOR_ACTIONS,
  {
    key: "CREATE_APPOINTMENT_BOOKING_CASE",
    displayName: "Appointments - Create Booking Case",
    description: "Create an appointment booking case from an inbound Email, SMS or WhatsApp workflow.",
    validation: (action) => {
      if (!action?.channel) throw new Error("Create Appointment Booking Case requires channel");
    },
    async: false,
    requiredPermissions: ["appointments.manage"],
    executor: async ({ action, db, companyId, req, record }) => {
      const tenantId=companyId||req?.user?.companyId;
      const bookingCase=await createAppointmentBookingCase(db,{
        companyId:tenantId,
        channel:action.channel,
        sourceMessageId:action.sourceMessageId||record?.providerMessageId||record?.provider_message_id||record?.id||null,
        sender:action.sender||record?.sender||record?.from||null,
        recipient:action.recipient||record?.recipient||record?.to||null,
        subject:action.subject||record?.subject||null,
        body:action.body||record?.body||record?.message||record?.text||null,
        customerId:action.customerId||record?.customerId||record?.customer_id||null,
        state:action.state||{},
      });
      return {status:"completed",bookingCase};
    },
  },
  {
    key: "ISSUE_APPOINTMENT_BOOKING_LINK",
    displayName: "Appointments - Issue Booking Link",
    description: "Create an expiring no-login booking URL for an appointment booking case.",
    validation: (action) => {
      if (!action?.bookingCaseId) throw new Error("Issue Appointment Booking Link requires bookingCaseId");
    },
    async: false,
    requiredPermissions: ["appointments.manage"],
    executor: async ({ action, db, companyId, req, record, object, workflowVariables }) => {
      const tenantId=companyId||req?.user?.companyId;
      const rootObjectKey=object?.object_key||object?.objectKey||null;
      const resolved=resolveBindingTree(action,{record,rootObjectKey,variables:workflowVariables});
      const link=await issueAppointmentPublicLink(db,{
        companyId:tenantId,
        bookingCaseId:resolved.bookingCaseId,
        purpose:resolved.purpose||"BOOK_SLOT",
        ttlMinutes:resolved.ttlMinutes||30,
        publicBaseUrl:resolved.publicBaseUrl||process.env.PUBLIC_APP_URL||process.env.FRONTEND_URL||"",
        metadata:resolved.metadata||{},
      });
      return {status:"completed",link};
    },
  },
  {
    key: "RUN_ASSISTANT_SUBFLOW",
    displayName: "Appointments - Run Available Subflow",
    description: "Resolve and run an active OneAssistant communication or payment subflow whose required package is installed.",
    validation: (action) => {
      if (!action?.capability) throw new Error("Run Available Subflow requires capability");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async (context) => {
      const {action,db,companyId,req,record,object,workflowVariables}=context;
      const tenantId=companyId||req?.user?.companyId;
      const rootObjectKey=object?.object_key||object?.objectKey||null;
      const bound=resolveBindingTree(action,{record,rootObjectKey,variables:workflowVariables});
      const resolved=await resolveAssistantSubflow(db,{
        companyId:tenantId,
        capability:bound.capability,
        channel:bound.channel||null,
        providerPackageKey:bound.providerPackageKey||null,
      });
      if(!resolved){
        if(bound.required===true) throw new Error(`No active installed subflow is available for ${bound.capability}`);
        return {status:"skipped",reason:"No compatible installed subflow",capability:bound.capability};
      }
      const runner=WORKFLOW_ACTION_REGISTRY.find((item)=>item.key==="RUN_SUBFLOW");
      if(!runner?.executor) throw new Error("RUN_SUBFLOW is unavailable");
      const result=await runner.executor({
        ...context,
        action:{
          ...bound,
          workflowId:resolved.id,
          inputs:bound.inputs||{},
        },
      });
      return {...result,resolvedWorkflowId:resolved.id,resolvedWorkflowName:resolved.name};
    },
  },
  {
    key: "FIND_APPOINTMENT_SLOTS",
    displayName: "Appointments - Find Available Slots",
    description: "Find available OneAssistant appointment slots for a service and optional resource.",
    validation: (action) => { if (!action?.serviceId) throw new Error("Find Appointment Slots requires serviceId"); },
    async: false,
    requiredPermissions: ["appointments.view"],
    executor: async ({ action, db, companyId, req }) => ({
      status: "completed",
      slots: await findAvailableAppointmentSlots(db, {
        companyId: companyId || req?.user?.companyId,
        serviceId: action.serviceId,
        resourceId: action.resourceId || null,
        from: action.from || new Date().toISOString(),
        to: action.to || new Date(Date.now() + 14 * 86400000).toISOString(),
        limit: action.limit || 4,
      }),
    }),
  },
  {
    key: "HOLD_APPOINTMENT_SLOT",
    displayName: "Appointments - Hold Slot",
    description: "Temporarily reserve an available appointment slot while the booking flow completes.",
    validation: (action) => {
      for (const field of ["serviceId","resourceId","startsAt","endsAt"]) if (!action?.[field]) throw new Error(`Hold Appointment Slot requires ${field}`);
    },
    async: false,
    requiredPermissions: ["appointments.manage"],
    executor: async ({ action, client, db, companyId, req }) => {
      const queryClient = client || { query: db };
      const hold = await holdAppointmentSlot(queryClient, {
        companyId: companyId || req?.user?.companyId,
        storeId: action.storeId || req?.user?.storeId || null,
        serviceId: action.serviceId,
        resourceId: action.resourceId,
        customerId: action.customerId || null,
        conversationId: action.conversationId || null,
        startsAt: action.startsAt,
        endsAt: action.endsAt,
        holdMinutes: action.holdMinutes || 10,
        idempotencyKey: action.idempotencyKey || null,
        metadata: action.metadata || {},
      });
      return { status: "completed", hold };
    },
  },
  {
    key: "RELEASE_APPOINTMENT_SLOT",
    displayName: "Appointments - Release Slot",
    description: "Release a temporary appointment hold after cancellation, timeout, or payment failure.",
    validation: (action) => { if (!action?.holdId) throw new Error("Release Appointment Slot requires holdId"); },
    async: false,
    requiredPermissions: ["appointments.manage"],
    executor: async ({ action, db, companyId, req }) => ({
      status: "completed",
      hold: await releaseAppointmentHold(db, {
        companyId: companyId || req?.user?.companyId,
        holdId: action.holdId,
        reason: action.reason || null,
      }),
    }),
  },
  {
    key: "LIST_APPOINTMENT_PAYMENT_PROVIDERS",
    displayName: "Appointments - List Payment Providers",
    description: "Return installed payment connector packages that explicitly support payment.request.",
    validation: () => undefined,
    async: false,
    requiredPermissions: ["appointments.payment"],
    executor: async ({ db, companyId, req }) => ({
      status: "completed",
      providers: await listPaymentRequestProviders(db, companyId || req?.user?.companyId),
    }),
  },
  {
    key: "CREATE_APPOINTMENT_PAYMENT_REQUEST",
    displayName: "Appointments - Create Payment Request",
    description: "Create a provider-neutral payment request for a held or confirmed appointment.",
    validation: (action) => { if (action?.amount === undefined) throw new Error("Create Appointment Payment Request requires amount"); },
    async: false,
    requiredPermissions: ["appointments.payment"],
    executor: async ({ action, db, companyId, req }) => ({
      status: "completed",
      paymentRequest: await createAppointmentPaymentRequest(db, {
        companyId: companyId || req?.user?.companyId,
        holdId: action.holdId || null,
        appointmentId: action.appointmentId || null,
        providerPackageKey: action.providerPackageKey || null,
        amount: action.amount,
        currency: action.currency || "GBP",
        expiresAt: action.expiresAt || null,
        metadata: action.metadata || {},
      }),
    }),
  },
  {
    key: "COMPLETE_APPOINTMENT_PAYMENT",
    displayName: "Appointments - Complete Payment",
    description: "Standard payment-subflow callback: mark the payment request successful, confirm the held appointment, and emit appointment.confirmed.",
    validation: (action) => {
      if (!action?.paymentRequestId) throw new Error("Complete Appointment Payment requires paymentRequestId");
    },
    async: false,
    requiredPermissions: ["appointments.payment","appointments.manage"],
    executor: async ({ action, client, db, companyId, req, record, object, workflowVariables }) => {
      const tenantId=companyId||req?.user?.companyId;
      const rootObjectKey=object?.object_key||object?.objectKey||null;
      const resolved=resolveBindingTree(action,{record,rootObjectKey,variables:workflowVariables});
      const queryClient=client||{query:db};
      const result=await completeAppointmentPayment(queryClient,{
        companyId:tenantId,
        paymentRequestId:resolved.paymentRequestId,
        providerReference:resolved.providerReference||null,
        paymentUrl:resolved.paymentUrl||null,
        amountPaid:resolved.amountPaid,
      });
      return {status:"completed",...result};
    },
  },
  {
    key: "CALCULATE_APPOINTMENT_PAYMENT",
    displayName: "Appointments - Calculate Advance",
    description: "Calculate the configured deposit or full-payment amount for an appointment service.",
    validation: (action) => { if (!action?.serviceId) throw new Error("Calculate Appointment Payment requires serviceId"); },
    async: false,
    requiredPermissions: ["appointments.payment"],
    executor: async ({ action, db, companyId, req }) => {
      const tenantId = companyId || req?.user?.companyId;
      const result = await db("SELECT id,price,currency,payment_policy,deposit_value FROM appointment_services WHERE id=$1 AND company_id=$2 LIMIT 1",[action.serviceId,tenantId]);
      const service = result.rows[0];
      if (!service) throw new Error("Appointment service not found");
      return { status: "completed", amount: calculateAppointmentPayment(service), currency: service.currency, paymentPolicy: service.payment_policy };
    },
  },
  {
    key: "CONFIRM_APPOINTMENT",
    displayName: "Appointments - Confirm Booking",
    description: "Convert an active slot hold into a confirmed appointment after any required payment gate succeeds.",
    validation: (action) => { if (!action?.holdId) throw new Error("Confirm Appointment requires holdId"); },
    async: false,
    requiredPermissions: ["appointments.manage"],
    executor: async ({ action, client, db, companyId, req, userId }) => {
      const queryClient = client || { query: db };
      const appointment = await confirmAppointmentFromHold(queryClient, {
        companyId: companyId || req?.user?.companyId,
        holdId: action.holdId,
        customerId: action.customerId || null,
        customerName: action.customerName || null,
        customerPhone: action.customerPhone || null,
        customerEmail: action.customerEmail || null,
        sourceChannel: action.sourceChannel || "WORKFLOW",
        notes: action.notes || null,
        paymentStatus: action.paymentStatus || "NOT_REQUIRED",
        amountDue: action.amountDue || 0,
        amountPaid: action.amountPaid || 0,
        createdBy: userId || req?.user?.id || null,
        metadata: action.metadata || {},
      });
      return { status: "completed", appointment };
    },
  },
  {
    key: "LICENCE_REQUEST_PACKAGE",
    displayName: "Licence - Request Package",
    description: "Create a pending package licence request and run its configured workflow.",
    validation: (action) => { if (!action?.packageKey && !action?.package_key) throw new Error("Licence request requires a package key"); },
    async: true,
    requiredPermissions: ["package.manage"],
    executor: (context) => executeLicenceRequestPackageAction(context),
  },
  {
    key: "GLOBAL_PRODUCT_LOOKUP_BARCODE",
    displayName: "Global Product - Lookup Barcode",
    description: "Resolve an external barcode using enabled, installed product lookup providers in configured priority order.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["global_product.view"],
    executor: (context) => executeGlobalProductLookupAction(context),
  },
  {
    key: "OPEN_FOOD_FACTS_LOOKUP_PRODUCT",
    displayName: "Open Food Facts - Lookup Product",
    description: "Look up a barcode using the installed Open Food Facts connector.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["global_product.view"],
    executor: (context) => executeGlobalProductLookupAction(context, "open_food_facts"),
  },
  {
    key: "OPEN_FOOD_FACTS_TEST_CONNECTION",
    displayName: "Open Food Facts - Test Connection",
    description: "Verify the Open Food Facts barcode API connection without credentials.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    executor: (context) => executeGlobalProductProviderTest(context, "open_food_facts"),
  },
  {
    key: "GO_UPC_LOOKUP_PRODUCT",
    displayName: "Go-UPC - Lookup Product",
    description: "Look up a barcode using the installed Go-UPC connector and company credential.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["global_product.view"],
    executor: (context) => executeGlobalProductLookupAction(context, "go_upc"),
  },
  {
    key: "GO_UPC_TEST_CONNECTION",
    displayName: "Go-UPC - Test Connection",
    description: "Verify the configured Go-UPC API key without returning it.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    executor: (context) => executeGlobalProductProviderTest(context, "go_upc"),
  },
  {
    key: "ONLINE_ORDER_TRANSITION",
    displayName: "Online Order Lifecycle Transition",
    description: "Apply a provider-neutral direct online order lifecycle transition using the canonical service.",
    validation: (action) => {
      if (!ONLINE_ORDER_TRANSITION_TARGETS.has(String(action?.toStatus || "").toUpperCase())) {
        throw new Error("Online Order Lifecycle Transition requires a supported lifecycle target");
      }
    },
    async: false,
    requiredPermissions: ["online_orders.manage"],
    executor: executeOnlineOrderTransition,
  },
  {
    key: "SEND_PASSWORD_RESET_EMAIL",
    displayName: "Send Password Reset Email",
    description: "Issue a tenant-scoped expiring password-reset token and queue the configured reset email for the selected User/Employee record.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["user.manage"],
    executor: async ({ db, req, companyId, record, recordId, stepRunId }) => {
      const company = companyId || req?.user?.companyId;
      const userId = record?.id || recordId;
      if (!company || !userId) throw new Error("Password reset requires a company and user record");
      const result = await db(
        `SELECT u.id,u.email,u.active,cs.password_reset_email_enabled,cs.password_reset_expiry_minutes
           FROM users u
           JOIN company_settings cs ON cs.company_id=u.company_id
          WHERE u.id=$1 AND u.company_id=$2 LIMIT 1`,
        [userId, company]
      );
      const user = result.rows[0];
      if (!user) throw new Error("User not found");
      if (!user.active) throw new Error("Password reset cannot be sent to an inactive user");
      if (!user.password_reset_email_enabled) throw new Error("Password reset email is disabled in Settings");
      const recipient = normalizeEmail(user.email);
      if (!recipient) throw new Error("User has no email address");
      const token = await issueAccountToken(db, {
        companyId: company, userId: user.id, purpose: "PASSWORD_RESET",
        expiresMinutes: user.password_reset_expiry_minutes || 60,
      });
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "EMAIL", stepRunId });
      if (!provider.configured) throw new Error(provider.error || "Email provider is not configured");
      const job = await enqueuePlatformJob({
        db, companyId: company, kind: "SEND_EMAIL", runAt: new Date(),
        payload: {
          recipient, to: recipient, templateKey: "PASSWORD_RESET",
          variables: { token, userId: user.id, expiresMinutes: user.password_reset_expiry_minutes || 60 },
          actorUserId: req?.user?.id || null,
          _roleId: req?.user?.roleId || null,
          _executionMode: resolveExecutionMode({ req }),
          _stepRunId: stepRunId,
        },
        idempotencyKey: `${company}:password-reset:${user.id}:${stepRunId || Date.now()}`,
      });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null, expiresMinutes: user.password_reset_expiry_minutes || 60 };
    },
  },
  {
    key: "SEND_USER_INVITATION",
    displayName: "Send User Invitation",
    description: "Issue a tenant-scoped registration token and queue the configured invitation email for the selected User/Employee record.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["user.manage"],
    executor: async ({ db, req, companyId, record, recordId, stepRunId }) => {
      const company = companyId || req?.user?.companyId;
      const userId = record?.id || recordId;
      if (!company || !userId) throw new Error("User invitation requires a company and user record");
      const result = await db(
        `SELECT u.id,u.email,u.active,c.user_email_domain,cs.domain_users_only,cs.email_registration_enabled,cs.registration_link_expiry_minutes
           FROM users u
           JOIN companies c ON c.id=u.company_id
           JOIN company_settings cs ON cs.company_id=u.company_id
          WHERE u.id=$1 AND u.company_id=$2 LIMIT 1`,
        [userId, company]
      );
      const user = result.rows[0];
      if (!user) throw new Error("User not found");
      if (!user.email_registration_enabled) throw new Error("Email registration is disabled in Settings");
      const recipient = normalizeEmail(user.email);
      if (!recipient) throw new Error("User has no email address");
      if (!domainAllowed(recipient, user.user_email_domain, user.domain_users_only)) {
        throw new Error("User email is outside the allowed company domain");
      }
      const token = await issueAccountToken(db, {
        companyId: company,
        userId: user.id,
        purpose: "REGISTRATION",
        expiresMinutes: user.registration_link_expiry_minutes || 1440,
      });
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "EMAIL", stepRunId });
      if (!provider.configured) throw new Error(provider.error || "Email provider is not configured");
      const job = await enqueuePlatformJob({
        db,
        companyId: company,
        kind: "SEND_EMAIL",
        runAt: new Date(),
        payload: {
          recipient,
          to: recipient,
          templateKey: "USER_INVITATION",
          variables: { token, userId: user.id, expiresMinutes: user.registration_link_expiry_minutes || 1440 },
          actorUserId: req?.user?.id || null,
          _roleId: req?.user?.roleId || null,
          _executionMode: resolveExecutionMode({ req }),
          _stepRunId: stepRunId,
        },
        idempotencyKey: `${company}:user-invite:${user.id}:${stepRunId || Date.now()}`,
      });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null, expiresMinutes: user.registration_link_expiry_minutes || 1440 };
    },
  },
  {
    key: "INVENTORY_ACTION",
    displayName: "Inventory Action",
    description: "Executes an atomic inventory adjustment, wastage, transfer, or stock operation.",
    validation: (action) => {
      if (!action?.operation && !action?.inventoryAction) throw new Error("Inventory Action requires operation");
    },
    async: false,
    requiredPermissions: ["inventory.adjust"],
    executor: async ({ action, client, db, companyId, req, userId }) => executeInventoryPlatformAction({
      client: client || db,
      action: { ...action, type: action.operation || action.inventoryAction },
      companyId: companyId || req?.user?.companyId,
      userId: userId || req?.user?.id || null,
    }),
  },
  {
    key: "CALL_CONNECTOR",
    displayName: "Call Connector",
    description: "Execute a registered operation through a tenant connector connection.",
    schema: {
      type: "object",
      properties: {
        connectionId: { type: "string" },
        operation: { type: "string" },
        input: { type: "object" },
      },
      required: ["connectionId", "operation"],
    },
    validation: (action) => {
      if (typeof action?.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(action.connectionId)) {
        throw new Error("Call Connector requires a valid connectionId");
      }
      if (typeof action?.operation !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(action.operation)) {
        throw new Error("Call Connector requires a valid operation key");
      }
      if (action.input !== undefined && (!action.input || typeof action.input !== "object" || Array.isArray(action.input))) {
        throw new Error("Call Connector input must be an object");
      }
    },
    async: false,
    requiredPermissions: ["integration.manage"],
    executor: async ({ action, db, companyId, req }) => {
      const execute = createConnectorActionExecutor({ db });
      return {
        status: "completed",
        ...(await execute({
          companyId: companyId || req?.user?.companyId,
          connectionId: action.connectionId,
          operation: action.operation,
          input: action.input || {},
          platformCredentialAccess:
            Array.isArray(req?.user?.permissions) && req.user.permissions.includes("platform.manage"),
          actorUserId: req?.user?.id || null,
        })),
      };
    },
  },
  {
    key: "RECONCILE_INVENTORY",
    displayName: "Reconcile Inventory",
    description: "Compares movement history, rollups, and store stock projections.",
    validation: () => undefined,
    async: false,
    requiredPermissions: ["inventory.view"],
    executor: async ({ action, client, db, companyId, req }) => executeInventoryPlatformAction({
      client: client || db,
      action: { ...action, type: "RECONCILE" },
      companyId: companyId || req?.user?.companyId,
    }),
  },
  {
    key: "REBUILD_INVENTORY",
    displayName: "Rebuild Inventory Projection",
    description: "Rebuilds persisted inventory rollups from the movement ledger.",
    validation: () => undefined,
    async: false,
    requiredPermissions: ["inventory.adjust"],
    executor: async ({ action, client, db, companyId, req }) => executeInventoryPlatformAction({
      client: client || db,
      action: { ...action, type: "REBUILD" },
      companyId: companyId || req?.user?.companyId,
    }),
  },
  {
    key: "WORKFLOW",
    displayName: "Workflow",
    description: "A wrapper action grouping a collection of step actions.",
    schema: { type: "object", properties: { actions: { type: "array" } }, required: ["actions"] },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Workflow action requires an object");
      if (!Array.isArray(action.actions) || action.actions.length === 0) throw new Error("Workflow actions require at least one action");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, ...context }) => ({ status: "completed", actions: action.actions || [] }),
  },
  {
    key: "VALIDATION",
    displayName: "Validation",
    description: "Validation gate before save.",
    validation: () => undefined,
    async: false,
    requiredPermissions: ["records.validate"],
    executor: async () => ({ status: "completed" }),
  },
  {
    key: "SET_FIELD",
    displayName: "Set Field",
    description: "Set a field value on the current record.",
    validation: (action) => {
      if (!action?.field) throw new Error("Set Field requires a field");
      if (action.value === undefined) throw new Error("Set Field requires a value");
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async ({ action, object }) => ({ status: "completed", field: action.field, value: action.value, objectId: object?.id || null }),
  },
  {
    key: "JARVES_INTERACTION",
    displayName: "JARVES Interaction",
    description: "Present JARVES with one of three configured video behaviours and Voice, Message, or Ask for Input interaction.",
    schema: {
      type: "object",
      properties: {
        behaviour: { type: "string", enum: ["behaviour_1", "behaviour_2", "behaviour_3"] },
        interaction: { type: "string", enum: ["voice", "message", "ask_input"] },
        content: { type: "string" },
        responseVariable: { type: "string" },
      },
      required: ["behaviour", "interaction"],
    },
    validation: (action) => {
      if (!["behaviour_1", "behaviour_2", "behaviour_3"].includes(action?.behaviour)) throw new Error("JARVES Interaction requires one of three registered behaviours");
      if (!["voice", "message", "ask_input"].includes(action?.interaction)) throw new Error("JARVES Interaction requires voice, message, or ask_input");
      if (action.interaction === "ask_input" && !action.responseVariable) throw new Error("JARVES Ask for Input requires responseVariable");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action }) => ({
      status: action.interaction === "ask_input" ? "awaiting_input" : "completed",
      uiDirective: {
        component: "jarves",
        behaviour: action.behaviour,
        interaction: action.interaction,
        content: action.content || "",
        responseVariable: action.responseVariable || null,
      },
    }),
  },
  {
    key: "TILL_UI_ACTION",
    displayName: "Till UI Action",
    description: "Dispatch a metadata-defined Retail POS interaction to the Till shell. Business mutations still execute through their canonical protected endpoints/connectors.",
    validation: (action) => {
      const uiAction = String(action?.uiAction || action?.ui_action || "").trim();
      if (!uiAction || !/^[a-z0-9_.-]{1,80}$/i.test(uiAction)) throw new Error("Till UI Action requires a valid uiAction");
    },
    async: false,
    requiredPermissions: [],
    executor: async ({ action }) => ({
      status: "completed",
      uiDirective: {
        component: "till",
        action: String(action.uiAction || action.ui_action),
        config: action.config || {},
      },
    }),
  },
  {
    key: "SHOW_MESSAGE",
    displayName: "Show Message",
    description: "Show a transient user-facing message.",
    validation: (action) => {
      if (!action?.message || typeof action.message !== "string") throw new Error("Show Message requires a message string");
    },
    async: false,
    requiredPermissions: ["notifications.write"],
    executor: async ({ action }) => ({ status: "completed", message: action.message }),
  },
  {
    key: "POST_CREDIT_PAYMENT",
    displayName: "Post Credit Payment",
    description: "Posts a customer credit payment through the protected credit transaction endpoint.",
    validation: (action) => {
      if (!action?.customerId || !Number.isFinite(Number(action.amount)) || Number(action.amount) <= 0) {
        throw new Error("Post Credit Payment requires customerId and a positive amount");
      }
    },
    async: false,
    requiredPermissions: ["customer.credit.payment"],
    executor: async ({ creditActionExecutor, action, ...context }) => {
      if (typeof creditActionExecutor !== "function") {
        throw new Error("Customer credit payment executor is unavailable");
      }
      return creditActionExecutor({ ...context, action });
    },
  },
  {
    key: "FREEZE_CREDIT_ACCOUNT",
    displayName: "Freeze Credit Account",
    description: "Freezes a customer credit account through the protected credit operation.",
    validation: (action) => {
      if (!action?.customerId) throw new Error("Freeze Credit Account requires customerId");
    },
    async: false,
    requiredPermissions: ["customer.credit.freeze"],
    executor: async ({ creditActionExecutor, action, ...context }) => {
      if (typeof creditActionExecutor !== "function") {
        throw new Error("Customer credit account executor is unavailable");
      }
      return creditActionExecutor({ ...context, action: { ...action, operation: "freeze" } });
    },
  },
  {
    key: "UNFREEZE_CREDIT_ACCOUNT",
    displayName: "Unfreeze Credit Account",
    description: "Unfreezes a customer credit account through the protected credit operation.",
    validation: (action) => {
      if (!action?.customerId) throw new Error("Unfreeze Credit Account requires customerId");
    },
    async: false,
    requiredPermissions: ["customer.credit.freeze"],
    executor: async ({ creditActionExecutor, action, ...context }) => {
      if (typeof creditActionExecutor !== "function") {
        throw new Error("Customer credit account executor is unavailable");
      }
      return creditActionExecutor({ ...context, action: { ...action, operation: "unfreeze" } });
    },
  },
  {
    key: "SEND_CREDIT_STATEMENT",
    displayName: "Send Credit Statement",
    description: "Sends a customer credit statement using the configured communication action.",
    validation: (action) => {
      if (!action?.customerId) throw new Error("Send Credit Statement requires customerId");
    },
    async: false,
    requiredPermissions: ["customer.credit.statement"],
    executor: async ({ creditActionExecutor, action, ...context }) => {
      if (typeof creditActionExecutor !== "function") {
        throw new Error("Customer credit statement executor is unavailable");
      }
      return creditActionExecutor({ ...context, action });
    },
  },
  {
    key: "CREATE_RECORD",
    displayName: "Create Record",
    description: "Create a record on an object using field mappings.",
    schema: {
      type: "object",
      properties: {
        objectKey: { type: "string" },
        objectId: { type: "string" },
        fieldValues: { type: "object" },
      },
      required: ["fieldValues"],
    },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Create Record requires an action object");
      if (!action.fieldValues || typeof action.fieldValues !== "object" || Array.isArray(action.fieldValues)) {
        throw new Error("Create Record requires fieldValues to be an object");
      }
    },
    async: false,
    requiredPermissions: ["records.create"],
    executor: async (context) => {
      const { db, action, req, object, companyId, fields } = context;
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "create", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const table = targetObject.source_table;
      const entries = Object.entries(action.fieldValues || {});
      if (!entries.length) return { status: "completed", created: null };
      const mappedFields = await resolveWorkflowWritableFields({
        db, object: targetObject, fields, entries, req, executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || context.storeId || null;
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req });
      const writePairs = alignWorkflowWritableValues(mappedFields, entries);
      const columns = writePairs.map(({ field }) => `"${field.source_column}"`);
      const params = writePairs.map(({ value }) => value);
      const values = writePairs.map((_, index) => `${index + 1}`);
      if (targetObject.company_scoped) {
        if (!runtimeCompanyId) throw new Error("Workflow company scope is required");
        columns.push('"company_id"');
        values.push(`${params.length + 1}`);
        params.push(runtimeCompanyId);
      }
      if (targetObject.store_scoped) {
        if (!runtimeStoreId) throw new Error("Workflow store scope is required");
        columns.push('"store_id"');
        values.push(`${params.length + 1}`);
        params.push(runtimeStoreId);
      }
      const query = `INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING *`;
      const result = await db(query, params);
      const created = result.rows[0] || null;
      if (created?.id) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: created.id,
          fields: mappedFields,
          previousRecord: null,
          record: created,
          action: "create",
          ...workflowHistoryTrace(context),
        });
      }
      try {
        if (created?.id) await publishRecordChangeEvent({
          db,
          companyId: req?.user?.companyId || companyId,
          object: targetObject,
          record: created,
          operation: "CREATE",
          actorUserId: req?.user?.id || null,
          req,
          originType: "WORKFLOW",
        });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: "completed", created, duplicateWarning: duplicateAction === "WARN" };
    },
  },
  {
    key: "UPDATE_RECORD",
    displayName: "Update Record",
    description: "Update an existing record using field mappings.",
    schema: {
      type: "object",
      properties: {
        recordId: { type: "string" },
        fieldValues: { type: "object" },
      },
      required: ["recordId", "fieldValues"],
    },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Update Record requires an action object");
      if (!action.recordId) throw new Error("Update Record requires a recordId");
      if (!action.fieldValues || typeof action.fieldValues !== "object" || Array.isArray(action.fieldValues)) {
        throw new Error("Update Record requires fieldValues to be an object");
      }
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async (context) => {
      const { db, action, object, req, companyId, fields } = context;
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "edit", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const table = targetObject.source_table;
      const entries = Object.entries(action.fieldValues || {});
      if (!entries.length) return { status: "completed", updated: null };
      const mappedFields = await resolveWorkflowWritableFields({
        db, object: targetObject, fields, entries, req, executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || context.storeId || null;
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req, excludeRecordId: action.recordId });
      const writePairs = alignWorkflowWritableValues(mappedFields, entries);
      const sets = writePairs.map(({ field }, index) => `"${field.source_column}"=$${index + 1}`).join(", ");
      const params = [...writePairs.map(({ value }) => value), action.recordId];
      const clauses = ["id=$" + params.length];
      if (targetObject.company_scoped) {
        if (!runtimeCompanyId) throw new Error("Workflow company scope is required");
        params.push(runtimeCompanyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (targetObject.store_scoped) {
        if (!runtimeStoreId) throw new Error("Workflow store scope is required");
        params.push(runtimeStoreId);
        clauses.push(`store_id=$${params.length}`);
      }
      const previousParams = [action.recordId];
      const previousClauses = ["id=$1"];
      if (targetObject.company_scoped) {
        previousParams.push(runtimeCompanyId);
        previousClauses.push(`company_id=$${previousParams.length}`);
      }
      if (targetObject.store_scoped) {
        previousParams.push(runtimeStoreId);
        previousClauses.push(`store_id=$${previousParams.length}`);
      }
      const previous = (await db(`SELECT * FROM "${table}" WHERE ${previousClauses.join(" AND ")} LIMIT 1`, previousParams)).rows[0] || null;
      const query = `UPDATE "${table}" SET ${sets} WHERE ${clauses.join(" AND ")} RETURNING *`;
      const result = await db(query, params);
      const updated = result.rows[0] || null;
      if (updated?.id) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: updated.id,
          fields: mappedFields,
          previousRecord: previous,
          record: updated,
          action: "update",
          ...workflowHistoryTrace(context),
        });
      }
      try {
        if (updated?.id) await publishRecordChangeEvent({
          db,
          companyId: req?.user?.companyId || companyId,
          object: targetObject,
          record: updated,
          previousRecord: previous,
          operation: "UPDATE",
          actorUserId: req?.user?.id || null,
          req,
          originType: "WORKFLOW",
        });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: result.rows.length ? "completed" : "skipped", updated, duplicateWarning: duplicateAction === "WARN" };
    },
  },
  {
    key: "UPDATE_RELATED_RECORD",
    displayName: "Update Related Record",
    description: "Update a child or related record via a relationship.",
    validation: (action) => {
      if (!action?.relationshipKey) throw new Error("Update Related Record requires a relationshipKey");
      if (!action.recordId) throw new Error("Update Related Record requires a recordId");
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async (context) => {
      const { db, action, object, req, companyId } = context;
      if (!action.recordId) throw new Error("Update Related Record requires a recordId");
      const parentObject = await resolveWorkflowTargetObject({ db, action: { objectId: action.parentObjectId }, object, companyId, req });
      let table = null;
      let targetObject = null;
      if (db && typeof db === "function") {
        const relationshipResult = await db("SELECT * FROM platform_relationships WHERE relationship_key=$1 AND parent_object_id=$2 AND active=true LIMIT 1", [action.relationshipKey, parentObject.id]);
        const relationship = relationshipResult.rows[0];
        if (relationship) {
          targetObject = await resolveTargetObjectMetadata({ db, objectId: relationship.child_object_id, companyId: companyId || req?.user?.companyId });
          table = targetObject?.source_table || null;
        }
      }
      if (!table) throw new Error("Update Related Record requires a target table");
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "edit", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const entries = Object.entries(action.fieldValues || {});
      if (!entries.length) return { status: "completed", recordId: action.recordId, updated: null };
      const relatedFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [targetObject.id, req?.user?.companyId || companyId]
      )).rows;
      const mappedFields = await resolveWorkflowWritableFields({
        db, object: targetObject, fields: relatedFields, entries, req, executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || context.storeId || null;
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req, excludeRecordId: action.recordId });
      const writePairs = alignWorkflowWritableValues(mappedFields, entries);
      const sets = writePairs.map(({ field }, index) => `"${field.source_column}"=$${index + 1}`).join(", ");
      const params = [...writePairs.map(({ value }) => value), action.recordId];
      const clauses = ["id=$" + params.length];
      if (targetObject.company_scoped) {
        if (!runtimeCompanyId) throw new Error("Workflow company scope is required");
        params.push(runtimeCompanyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (targetObject.store_scoped) {
        if (!runtimeStoreId) throw new Error("Workflow store scope is required");
        params.push(runtimeStoreId);
        clauses.push(`store_id=$${params.length}`);
      }
      const previousParams = [action.recordId];
      const previousClauses = ["id=$1"];
      if (targetObject.company_scoped) {
        previousParams.push(runtimeCompanyId);
        previousClauses.push(`company_id=$${previousParams.length}`);
      }
      if (targetObject.store_scoped) {
        previousParams.push(runtimeStoreId);
        previousClauses.push(`store_id=$${previousParams.length}`);
      }
      const previous = (await db(`SELECT * FROM "${table}" WHERE ${previousClauses.join(" AND ")} LIMIT 1`, previousParams)).rows[0] || null;
      const result = await db(`UPDATE "${table}" SET ${sets} WHERE ${clauses.join(" AND ")} RETURNING *`, params);
      const updated = result.rows[0] || null;
      if (updated?.id) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: updated.id,
          fields: mappedFields,
          previousRecord: previous,
          record: updated,
          action: "update",
          ...workflowHistoryTrace(context),
        });
      }
      try {
        if (updated?.id) await publishRecordChangeEvent({
          db,
          companyId: req?.user?.companyId || companyId,
          object: targetObject,
          record: updated,
          previousRecord: previous,
          operation: "UPDATE",
          actorUserId: req?.user?.id || null,
          req,
          originType: "WORKFLOW",
        });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: result.rows.length ? "completed" : "skipped", recordId: action.recordId, updated, duplicateWarning: duplicateAction === "WARN" };
    },
  },
  {
    key: "CREATE_RELATED_RECORD",
    displayName: "Create Related Record",
    description: "Create a child record through a defined relationship.",
    validation: (action) => {
      if (!action?.relationshipKey) throw new Error("Create Related Record requires a relationshipKey");
      if (!action.fieldValues || typeof action.fieldValues !== "object") throw new Error("Create Related Record requires fieldValues");
    },
    async: false,
    requiredPermissions: ["records.create"],
    executor: async (context) => {
      const { db, action, req, object, recordId, companyId } = context;
      let relationship = action.relationship || null;
      const parentObject = await resolveWorkflowTargetObject({ db, action: { objectId: action.parentObjectId || action.parent_object_id }, object, companyId, req });
      let table = null;
      let targetObject = null;
      const parentRecordId = action.recordId || action.parentRecordId || recordId || null;
      const relationshipKey = action.relationshipKey || action.relationship_key || null;
      if (relationshipKey && db && typeof db === "function") {
        const relationshipResult = await db("SELECT * FROM platform_relationships WHERE relationship_key=$1 AND parent_object_id=$2 AND active=true LIMIT 1", [relationshipKey, parentObject.id]);
        relationship = relationshipResult.rows[0] || relationship;
      }
      if (relationship?.child_object_id && db && typeof db === "function") {
        targetObject = await resolveTargetObjectMetadata({ db, objectId: relationship.child_object_id, companyId: companyId || req?.user?.companyId });
        table = targetObject?.source_table || table;
      }
      if (!table) throw new Error("Create Related Record requires a target table");
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "create", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const fieldValues = { ...(action.fieldValues || {}) };
      let relationField = action.relationshipField || action.relatedField || action.foreignKey || action.foreign_key || null;
      if (!relationField && relationship?.child_field_id && db && typeof db === "function") {
        const fieldResult = await db("SELECT * FROM platform_fields WHERE id=$1 AND active=true LIMIT 1", [relationship.child_field_id]);
        relationField = fieldResult.rows[0]?.source_column || fieldResult.rows[0]?.api_name || null;
      }
      if (parentRecordId && relationField && !(Object.prototype.hasOwnProperty.call(fieldValues, relationField))) {
        fieldValues[relationField] = parentRecordId;
      }
      const entries = Object.entries(fieldValues);
      if (!entries.length) return { status: "completed", created: null };
      const relatedFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [targetObject.id, req?.user?.companyId || companyId]
      )).rows;
      const mappedFields = await resolveWorkflowWritableFields({
        db, object: targetObject, fields: relatedFields, entries, req, executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || context.storeId || null;
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req });
      const writePairs = alignWorkflowWritableValues(mappedFields, entries);
      const columns = writePairs.map(({ field }) => `"${field.source_column}"`);
      const values = writePairs.map((_, index) => `${index + 1}`);
      const params = writePairs.map(({ value }) => value);
      if (targetObject?.company_scoped || action.companyScoped || action.company_scoped || object?.company_scoped) {
        if (!runtimeCompanyId) throw new Error("Workflow company scope is required");
        columns.push('"company_id"');
        values.push(`${params.length + 1}`);
        params.push(runtimeCompanyId);
      }
      if (targetObject?.store_scoped || action.storeScoped || action.store_scoped || object?.store_scoped) {
        if (!runtimeStoreId) throw new Error("Workflow store scope is required");
        columns.push('"store_id"');
        values.push(`${params.length + 1}`);
        params.push(runtimeStoreId);
      }
      const query = `INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING *`;
      const result = await db(query, params);
      const created = result.rows[0] || null;
      if (created?.id) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: created.id,
          fields: mappedFields,
          previousRecord: null,
          record: created,
          action: "create",
          ...workflowHistoryTrace(context),
        });
      }
      try {
        if (created?.id) await publishRecordChangeEvent({
          db,
          companyId: req?.user?.companyId || companyId,
          object: targetObject,
          record: created,
          operation: "CREATE",
          actorUserId: req?.user?.id || null,
          req,
          originType: "WORKFLOW",
        });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: "completed", created, relationshipKey: relationshipKey || action.relationshipKey || null, duplicateWarning: duplicateAction === "WARN" };
    },
  },
  {
    key: "DELETE_RECORD",
    displayName: "Delete Record",
    description: "Delete or soft delete a record using the object's existing semantics.",
    validation: (action) => {
      if (!action?.recordId) throw new Error("Delete Record requires a recordId");
    },
    async: false,
    requiredPermissions: ["records.delete"],
    executor: async (context) => {
      const { db, action, object, req, companyId } = context;
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "delete", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const table = targetObject.source_table;
      const historyFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
        [targetObject.id, companyId || req?.user?.companyId]
      )).rows;
      const scopeParams = [action.recordId];
      const scopeClauses = ["id=$1"];
      if (targetObject.company_scoped) {
        scopeParams.push(req?.user?.companyId || companyId);
        scopeClauses.push(`company_id=$${scopeParams.length}`);
      }
      const previous = (await db(`SELECT * FROM "${table}" WHERE ${scopeClauses.join(" AND ")} LIMIT 1`, scopeParams)).rows[0] || null;
      const hasActive = await db(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'active'`, [table]);
      const result = hasActive.rows.length
        ? await db(`UPDATE "${table}" SET active=false WHERE id=$1${targetObject.company_scoped ? " AND company_id=$2" : ""} RETURNING *`, targetObject.company_scoped ? [action.recordId, req?.user?.companyId || companyId] : [action.recordId])
        : await db(`DELETE FROM "${table}" WHERE id=$1${targetObject.company_scoped ? " AND company_id=$2" : ""} RETURNING *`, targetObject.company_scoped ? [action.recordId, req?.user?.companyId || companyId] : [action.recordId]);
      if (result.rows[0]) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: action.recordId,
          fields: historyFields,
          previousRecord: previous || result.rows[0],
          record: hasActive.rows.length ? result.rows[0] : null,
          action: "delete",
          ...workflowHistoryTrace(context),
        });
      }
      try {
        if (result.rows[0]) await publishRecordChangeEvent({
          db,
          companyId: req?.user?.companyId || companyId,
          object: targetObject,
          record: hasActive.rows.length ? result.rows[0] : null,
          previousRecord: previous || result.rows[0],
          operation: "DELETE",
          actorUserId: req?.user?.id || null,
          req,
          originType: "WORKFLOW",
          archived: hasActive.rows.length > 0,
        });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: result.rows.length ? "completed" : "skipped", deleted: result.rows[0] || null };
    },
  },
  {
    key: "ASSIGN_RECORD",
    displayName: "Assign Record",
    description: "Assign a record to a user, team or queue.",
    validation: (action) => {
      if (!action?.recordId) throw new Error("Assign Record requires a recordId");
      if (!action.assignee && !action.assignedTo) throw new Error("Assign Record requires assignee information");
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async (context) => {
      const { db, action, object, req, companyId } = context;
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "edit", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const assignmentFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [targetObject.id, req?.user?.companyId || companyId]
      )).rows;
      await assertRuntimeFieldWriteAccess({
        db, req, object: targetObject, fields: assignmentFields, fieldNames: ["assigned_to"],
        executionMode, trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const table = targetObject.source_table;
      const assignee = action.assignee ?? action.assignedTo;
      const params = [assignee, action.recordId];
      const scope = targetObject.company_scoped ? " AND company_id=$3" : "";
      if (targetObject.company_scoped) params.push(req?.user?.companyId || companyId);
      const previous = (await db(
        `SELECT * FROM "${table}" WHERE id=$1${targetObject.company_scoped ? " AND company_id=$2" : ""} LIMIT 1`,
        targetObject.company_scoped ? [action.recordId, companyId || req?.user?.companyId] : [action.recordId]
      )).rows[0] || null;
      const result = await db(`UPDATE "${table}" SET assigned_to=$1 WHERE id=$2${scope} RETURNING *`, params);
      if (result.rows[0]) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: action.recordId,
          fields: assignmentFields,
          previousRecord: previous,
          record: result.rows[0],
          action: "update",
          ...workflowHistoryTrace(context),
        });
      }
      return { status: result.rows.length ? "completed" : "skipped", updated: result.rows[0] || null };
    },
  },
  {
    key: "ADD_RELATIONSHIP",
    displayName: "Add Relationship",
    description: "Associate a record with a related record.",
    validation: (action) => {
      if (!action?.relationshipKey) throw new Error("Add Relationship requires a relationshipKey");
      if (!action.relatedRecordId && !action.recordId) throw new Error("Add Relationship requires a target record");
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async (context) => {
      const { db, action, object, req, recordId, companyId } = context;
      const relationshipKey = action.relationshipKey;
      const relatedRecordId = action.relatedRecordId || action.recordId;
      const parentRecordId = action.parentRecordId || recordId || action.recordId || null;
      if (!db || typeof db !== "function") return { status: "completed", relationshipKey, relatedRecordId };
      const resolved = await loadRecordRelationship({ db, action, object });
      if (!resolved?.relationship) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" is not registered for this object` };
      }
      const column = resolved.field?.source_column || resolved.field?.api_name || null;
      const targetObject = await resolveTargetObjectMetadata({
        db,
        objectId: resolved.relationship.child_object_id,
        companyId: req?.user?.companyId || companyId,
      });
      if (!targetObject) throw new Error("Related target object is unavailable");
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "edit", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const relationFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [targetObject.id, req?.user?.companyId || companyId]
      )).rows;
      await assertRuntimeFieldWriteAccess({
        db, req, object: targetObject, fields: relationFields, fieldNames: [column],
        executionMode, trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      if (!isSafeIdentifier(resolved.relationship.child_source_table) || !isSafeIdentifier(column)) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" has no writable child link field` };
      }
      const params = [parentRecordId, relatedRecordId];
      const clauses = ["id=$2"];
      if (resolved.relationship.child_company_scoped && req?.user?.companyId) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (resolved.relationship.child_store_scoped && req?.user?.storeId) {
        params.push(req.user.storeId);
        clauses.push(`store_id=$${params.length}`);
      }
      const previousParams = [relatedRecordId];
      const previousClauses = ["id=$1"];
      if (resolved.relationship.child_company_scoped && req?.user?.companyId) {
        previousParams.push(req.user.companyId);
        previousClauses.push(`company_id=$${previousParams.length}`);
      }
      if (resolved.relationship.child_store_scoped && req?.user?.storeId) {
        previousParams.push(req.user.storeId);
        previousClauses.push(`store_id=$${previousParams.length}`);
      }
      const previous = (await db(
        `SELECT * FROM "${resolved.relationship.child_source_table}" WHERE ${previousClauses.join(" AND ")} LIMIT 1`,
        previousParams
      )).rows[0] || null;
      const result = await db(
        `UPDATE "${resolved.relationship.child_source_table}" SET "${column}"=$1 WHERE ${clauses.join(" AND ")} RETURNING *`,
        params
      );
      if (result.rows[0]) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: relatedRecordId,
          fields: relationFields,
          previousRecord: previous,
          record: result.rows[0],
          action: "update",
          ...workflowHistoryTrace(context),
        });
      }
      return { status: result.rows.length ? "completed" : "skipped", relationshipKey, relatedRecordId, linkField: column, linked: result.rows[0] || null };
    },
  },
  {
    key: "REMOVE_RELATIONSHIP",
    displayName: "Remove Relationship",
    description: "Remove a relationship between records.",
    validation: (action) => {
      if (!action?.relationshipKey) throw new Error("Remove Relationship requires a relationshipKey");
      if (!action.relatedRecordId && !action.recordId) throw new Error("Remove Relationship requires a target record");
    },
    async: false,
    requiredPermissions: ["records.update"],
    executor: async (context) => {
      const { db, action, object, req, companyId } = context;
      const relationshipKey = action.relationshipKey;
      const relatedRecordId = action.relatedRecordId || action.recordId;
      if (!db || typeof db !== "function") return { status: "completed", relationshipKey, relatedRecordId };
      const resolved = await loadRecordRelationship({ db, action, object });
      if (!resolved?.relationship) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" is not registered for this object` };
      }
      const column = resolved.field?.source_column || resolved.field?.api_name || null;
      const targetObject = await resolveTargetObjectMetadata({
        db,
        objectId: resolved.relationship.child_object_id,
        companyId: req?.user?.companyId || companyId,
      });
      if (!targetObject) throw new Error("Related target object is unavailable");
      const executionMode = resolveExecutionMode(context);
      await assertRuntimeObjectPermission({
        db, req, object: targetObject, action: "edit", executionMode,
        trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      const relationFields = (await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [targetObject.id, req?.user?.companyId || companyId]
      )).rows;
      await assertRuntimeFieldWriteAccess({
        db, req, object: targetObject, fields: relationFields, fieldNames: [column],
        executionMode, trustedSystem: context.trustedSystem === true || req?.trustedSystemExecution === true,
      });
      if (!isSafeIdentifier(resolved.relationship.child_source_table) || !isSafeIdentifier(column)) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" has no writable child link field` };
      }
      const params = [relatedRecordId];
      const clauses = ["id=$1"];
      if (resolved.relationship.child_company_scoped && req?.user?.companyId) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      if (resolved.relationship.child_store_scoped && req?.user?.storeId) {
        params.push(req.user.storeId);
        clauses.push(`store_id=$${params.length}`);
      }
      const previous = (await db(
        `SELECT * FROM "${resolved.relationship.child_source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`,
        params
      )).rows[0] || null;
      const result = await db(
        `UPDATE "${resolved.relationship.child_source_table}" SET "${column}"=NULL WHERE ${clauses.join(" AND ")} RETURNING *`,
        params
      );
      if (result.rows[0]) {
        await writePlatformRecordHistory({
          db,
          companyId: companyId || req?.user?.companyId,
          object: targetObject,
          recordId: relatedRecordId,
          fields: relationFields,
          previousRecord: previous,
          record: result.rows[0],
          action: "update",
          ...workflowHistoryTrace(context),
        });
      }
      return { status: result.rows.length ? "completed" : "skipped", relationshipKey, relatedRecordId, linkField: column, unlinked: result.rows[0] || null };
    },
  },
  {
    key: "IN_APP_NOTIFICATION",
    displayName: "In-App Notification",
    description: "Create a persistent internal notification for a user or team.",
    validation: (action) => {
      if (!action?.message && !action?.templateKey) throw new Error("In-App Notification requires a message or template");
    },
    async: false,
    requiredPermissions: ["notifications.write"],
    executor: async ({ db, action, req }) => {
      if (typeof db !== "function") return { status: "completed", notice: action.message || action.templateKey };
      try {
        await db(
          "INSERT INTO platform_notifications (company_id, user_id, message, status, created_at) VALUES ($1,$2,$3,'UNREAD',NOW())",
          [req?.user?.companyId || null, req?.user?.id || null, action.message || action.templateKey || ""]
        );
      } catch (error) {
        return { status: "completed", notice: action.message || action.templateKey || "notification", persistent: false, note: error.message };
      }
      return { status: "completed", notice: action.message || action.templateKey || "notification", persistent: true };
    },
  },
  {
    key: "SEND_EMAIL",
    displayName: "Send Email",
    description: "Queue an email using the configured email provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send Email requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.email",
    executor: async ({ db, action, req, companyId, stepRunId, record, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "EMAIL", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "EMAIL", error: provider.error, jobId: null };
      }
      const resolvedAction = resolveCommunicationWorkflowAction(action, record, object, workflowVariables);
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_EMAIL", payload: {
        ...resolvedAction,
        actorUserId: req?.user?.id || null,
        _roleId: req?.user?.roleId || null,
        _executionMode: resolveExecutionMode({ req }),
        _stepRunId: stepRunId,
      }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "SEND_SMS",
    displayName: "Send SMS",
    description: "Queue an SMS using the configured SMS provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send SMS requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.sms",
    executor: async ({ db, action, req, companyId, stepRunId, record, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "SMS", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "SMS", error: provider.error, jobId: null };
      }
      const resolvedAction = resolveCommunicationWorkflowAction(action, record, object, workflowVariables);
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_SMS", payload: {
        ...resolvedAction,
        actorUserId: req?.user?.id || null,
        _roleId: req?.user?.roleId || null,
        _executionMode: resolveExecutionMode({ req }),
        _stepRunId: stepRunId,
      }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "SEND_WHATSAPP",
    displayName: "Send WhatsApp",
    description: "Queue a WhatsApp message using the configured provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send WhatsApp requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.whatsapp",
    executor: async ({ db, action, req, companyId, stepRunId, record, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "WHATSAPP", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "WHATSAPP", error: provider.error, jobId: null };
      }
      const resolvedAction = resolveCommunicationWorkflowAction(action, record, object, workflowVariables);
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_WHATSAPP", payload: {
        ...resolvedAction,
        actorUserId: req?.user?.id || null,
        _roleId: req?.user?.roleId || null,
        _executionMode: resolveExecutionMode({ req }),
        _stepRunId: stepRunId,
      }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "PUBLISH_TO_WEB_SHOP",
    displayName: "Publish to Web Shop",
    description: "Set a canonical product as published for the active client web shop.",
    validation: (action) => {
      if (!action?.productId) throw new Error("Publish to Web Shop requires a productId");
    },
    async: true,
    requiredPermissions: ["product.manage"],
    executor: async ({ db, action, companyId, req }) => {
      const targetCompanyId = companyId || req?.user?.companyId;
      if (!targetCompanyId || !db || typeof db !== "function") return { status: "failed", code: "INVALID_CONTEXT", retryable: false };
      const now = new Date();
      await db(
        `UPDATE products SET web_shop_published=true, updated_at=NOW(), web_shop_publish_start=COALESCE(web_shop_publish_start, $2::timestamptz), web_shop_publish_end=COALESCE(web_shop_publish_end, NULL), web_shop_sort_order=COALESCE(web_shop_sort_order, 0) WHERE id=$1 AND company_id=$3`,
        [action.productId, now.toISOString(), targetCompanyId]
      );
      await publishPlatformEvent({ db, companyId: targetCompanyId, eventType: "webshop.product_published", payload: { productId: action.productId }, actorUserId: req?.user?.id || null, objectType: "product", objectId: action.productId, idempotencyKey: `webshop.publish:${action.productId}` });
      return { status: "completed", productId: action.productId };
    },
  },
  {
    key: "UNPUBLISH_FROM_WEB_SHOP",
    displayName: "Unpublish from Web Shop",
    description: "Hide a canonical product from the public storefront.",
    validation: (action) => {
      if (!action?.productId) throw new Error("Unpublish from Web Shop requires a productId");
    },
    async: true,
    requiredPermissions: ["product.manage"],
    executor: async ({ db, action, companyId, req }) => {
      const targetCompanyId = companyId || req?.user?.companyId;
      if (!targetCompanyId || !db || typeof db !== "function") return { status: "failed", code: "INVALID_CONTEXT", retryable: false };
      await db(
        `UPDATE products SET web_shop_published=false, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [action.productId, targetCompanyId]
      );
      await publishPlatformEvent({ db, companyId: targetCompanyId, eventType: "webshop.product_unpublished", payload: { productId: action.productId }, actorUserId: req?.user?.id || null, objectType: "product", objectId: action.productId, idempotencyKey: `webshop.unpublish:${action.productId}` });
      return { status: "completed", productId: action.productId };
    },
  },
  {
    key: "UPDATE_WEB_LISTING",
    displayName: "Update Web Listing",
    description: "Apply canonical product listing metadata for the Web Shop storefront.",
    validation: (action) => {
      if (!action?.productId) throw new Error("Update Web Listing requires a productId");
    },
    async: true,
    requiredPermissions: ["product.manage"],
    executor: async ({ db, action, companyId, req }) => {
      const targetCompanyId = companyId || req?.user?.companyId;
      if (!targetCompanyId || !db || typeof db !== "function") return { status: "failed", code: "INVALID_CONTEXT", retryable: false };
      const fields = [];
      const values = [action.productId, targetCompanyId];
      const assign = (column, value) => { if (value !== undefined) { fields.push(`${column}=$${values.length + 1}`); values.push(value); } };
      assign("web_shop_title_override", action.webShopTitleOverride);
      assign("web_shop_description_override", action.webShopDescriptionOverride);
      assign("web_shop_image_override", action.webShopImageOverride);
      assign("web_shop_category_override", action.webShopCategoryOverride);
      assign("web_shop_sort_order", action.webShopSortOrder);
      assign("web_shop_delivery_eligible", action.webShopDeliveryEligible);
      assign("web_shop_pickup_eligible", action.webShopPickupEligible);
      assign("web_shop_featured", action.webShopFeatured);
      assign("web_shop_price_override", action.webShopPriceOverride);
      if (!fields.length) return { status: "completed", productId: action.productId, updated: false };
      fields.push("updated_at=NOW()");
      await db(`UPDATE products SET ${fields.join(", ")} WHERE id=$1 AND company_id=$2`, values);
      await publishPlatformEvent({ db, companyId: targetCompanyId, eventType: "webshop.listing_updated", payload: { productId: action.productId, changes: fields }, actorUserId: req?.user?.id || null, objectType: "product", objectId: action.productId, idempotencyKey: `webshop.listing:${action.productId}` });
      return { status: "completed", productId: action.productId, updated: true };
    },
  },
  {
    key: "SET_WEB_FEATURED",
    displayName: "Set Web Featured",
    description: "Toggle the product featured status in Web Shop listings.",
    validation: (action) => {
      if (!action?.productId) throw new Error("Set Web Featured requires a productId");
    },
    async: true,
    requiredPermissions: ["product.manage"],
    executor: async ({ db, action, companyId, req }) => {
      const targetCompanyId = companyId || req?.user?.companyId;
      if (!targetCompanyId || !db || typeof db !== "function") return { status: "failed", code: "INVALID_CONTEXT", retryable: false };
      await db(
        `UPDATE products SET web_shop_featured=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2`,
        [action.productId, targetCompanyId, action.webShopFeatured === true]
      );
      return { status: "completed", productId: action.productId, featured: action.webShopFeatured === true };
    },
  },
  {
    key: "CALL_FUNCTION",
    displayName: "Call Function",
    description: "Invoke a registered, approved onePOS function.",
    validation: (action) => {
      if (!action?.functionKey && !action?.key) throw new Error("Call Function requires a functionKey");
    },
    async: false,
    requiredPermissions: ["functions.execute"],
    executor: async (context) => {
      const { action, db, businessDb = null, pool, client, req, companyId, userId, record, previousRecord, object, fields, workflowVariables } = context;
      const functionKey = action.functionKey || action.key;
      const functionDefinition = getRegisteredFunction(functionKey);
      if (!functionDefinition) throw new Error(`Function "${functionKey}" is not registered`);
      if (typeof functionDefinition.handler !== "function") {
        throw new Error(`Function "${functionKey}" has no handler`);
      }
      const inputs = resolveBindingTree(action.inputs || {}, {
        record,
        rootObjectKey: object?.object_key || object?.objectKey || null,
        variables: workflowVariables || context.globals || {},
      });
      return functionDefinition.handler({
        ...context,
        action,
        inputs,
        db: businessDb || db,
        pool,
        client,
        req,
        companyId,
        userId,
        record,
        previousRecord,
        object,
        fields,
      });
    },
  },
  {
    key: "RUN_SUBFLOW",
    displayName: "Run Subflow",
    description: "Run another approved workflow as a child workflow.",
    validation: (action) => {
      if (!action?.workflowId && !action?.subflowId && !(action?.workflow && Array.isArray(action.workflow.actions))) throw new Error("Run Subflow requires a workflowId");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId, req, record, previousRecord, object, fields, workflowDepth = 0, workflowStack = [], runId = null, stepRunId = null, ...context }) => {
      const workflowKey = action.workflowId || action.subflowId || action.workflow?.id || action.workflow?.key || "inline-subflow";
      const stack = Array.isArray(workflowStack) ? workflowStack.slice() : [];
      const parentGuard = context.executionGuard || createExecutionGuard({ maxDepth: 8, chain: stack });
      const childGuard = parentGuard.enter(workflowKey);
      const nextDepth = childGuard.chain.length;
      context.governor?.checkSubflowDepth(nextDepth);
      const subflowDefinition = action.workflow && Array.isArray(action.workflow.actions)
        ? action.workflow
        : (() => {
            if (!db || typeof db !== "function") return null;
            const id = action.workflowId || action.subflowId;
            if (!id) return null;
            return db(`SELECT * FROM platform_rules WHERE id=$1 AND active=true LIMIT 1`, [id]).then((result) => result.rows[0] || null);
          })();
      const definition = await Promise.resolve(subflowDefinition);
      if (!definition) {
        throw new Error(`Subflow "${workflowKey}" was not found or is not active`);
      }
      const targetCompanyId = action.companyId || definition.company_id || companyId || req?.user?.companyId;
      const runtimeCompanyId = companyId || req?.user?.companyId;
      if (targetCompanyId && runtimeCompanyId && targetCompanyId !== runtimeCompanyId) {
        throw new Error("Cross-company subflow execution is not allowed");
      }
      const childActions = Array.isArray(definition.actions) ? definition.actions : Array.isArray(definition.action?.actions) ? definition.action.actions : [];
      if (!childActions.length) {
        return { status: "skipped", workflowId: workflowKey, reason: "Subflow contains no actions" };
      }
      const mappedInputs = {};
      const mappings = action.inputs || action.inputMap || action.mappings || {};
      for (const [sourceKey, targetKey] of Object.entries(mappings)) {
        const sourceValue = sourceKey in (context || {}) ? context[sourceKey] : (record && Object.prototype.hasOwnProperty.call(record, sourceKey) ? record[sourceKey] : undefined);
        if (sourceValue !== undefined) {
          mappedInputs[targetKey] = sourceValue;
        }
      }
      const mergedRecord = { ...(record || {}), ...mappedInputs };
      const childRun = db && typeof db === "function"
        ? await createWorkflowRun({
            db,
            companyId: targetCompanyId || runtimeCompanyId,
            workflowId: workflowKey,
            workflowName: definition.name || action.workflowName || "Subflow",
            objectId: object?.id || action.objectId || null,
            recordId: record?.id || action.recordId || null,
            triggerKey: "subflow",
            parentRunId: runId || null,
            status: "RUNNING",
            metadata: { parentWorkflow: workflowKey, inputMappings: mappings },
          })
        : null;
      const childStep = childRun && db && typeof db === "function"
        ? await createWorkflowStepRun({
            db,
            runId: childRun.id,
            stepIdentifier: `subflow:${workflowKey}`,
            stepOrder: 0,
            actionType: "RUN_SUBFLOW",
            status: "RUNNING",
            metadata: { parentRunId: runId || null },
          })
        : null;
      const childResult = await executeWorkflowActions({
        actions: childActions,
        db,
        object,
        fields,
        record: mergedRecord,
        previousRecord,
        req,
        companyId: targetCompanyId || runtimeCompanyId,
        workflowDepth: nextDepth,
        workflowStack: [...childGuard.chain],
        executionGuard: childGuard,
        governor: context.governor || null,
        workflowId: workflowKey,
        parentRunId: runId || null,
        runId: childRun?.id || runId || null,
        stepRunId: childStep?.id || stepRunId || null,
        executionContext: context.executionContext || null,
        source: { type: "SUBFLOW" },
      });
      if (childRun && db && typeof db === "function") {
        await db(
          `UPDATE platform_workflow_runs SET status=$1, completed_at=NOW(), metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$3`,
          [childResult.some((item) => item.result?.status === "failed") ? "FAILED" : "COMPLETED", JSON.stringify({ childResults: childResult }), childRun.id]
        );
      }
      if (stepRunId) {
        await updateWorkflowStepRunStatus({
          db,
          stepRunId,
          status: childResult.some((item) => item.result?.status === "failed") ? "FAILED" : "COMPLETED",
          errorText: childResult.find((item) => item.result?.error)?.result?.error || null,
          metadata: { childRunId: childRun?.id || null, childResults: childResult },
        });
      }
      return {
        status: childResult.some((item) => item.result?.status === "failed") ? "failed" : "completed",
        workflowId: workflowKey,
        runId: childRun?.id || null,
        results: childResult,
      };
    },
  },
  {
    key: "CALL_WEBHOOK",
    displayName: "Call Webhook",
    description: "Send a webhook through OneConnection; legacy direct endpoints remain metadata-compatible.",
    validation: (action) => {
      if (action?.connectionId) {
        if (typeof action.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(action.connectionId)) {
          throw new Error("Call Webhook requires a valid connectionId");
        }
        const operation = action.operation || action.endpointId || action.endpoint;
        if (typeof operation !== "string" || !operation.trim()) {
          throw new Error("Call Webhook requires an operation or endpoint when connectionId is used");
        }
        return;
      }
      if (!action?.url && !action?.endpoint) throw new Error("Call Webhook requires a OneConnection or legacy endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action, db, companyId, req }) => {
      if (action.connectionId) {
        const execute = createConnectorActionExecutor({ db });
        const result = await execute({
          companyId: companyId || req?.user?.companyId,
          connectionId: action.connectionId,
          operation: action.operation || action.endpointId || action.endpoint,
          input: action.input || action.body || {},
          platformCredentialAccess:
            Array.isArray(req?.user?.permissions) && req.user.permissions.includes("platform.manage"),
          actorUserId: req?.user?.id || null,
        });
        return { status: "completed", ...result };
      }
      return {
        status: "queued",
        endpoint: action.url || action.endpoint || null,
        legacy: true,
        warning: "Legacy direct endpoint metadata is preserved but new executions should use OneConnection",
      };
    },
  },
  {
    key: "HTTP_REQUEST",
    displayName: "HTTP Request",
    description: "Send an HTTP request through OneConnection; legacy direct endpoints remain metadata-compatible.",
    validation: (action) => {
      if (action?.connectionId) {
        if (typeof action.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(action.connectionId)) {
          throw new Error("HTTP Request requires a valid connectionId");
        }
        const operation = action.operation || action.endpointId || action.endpoint;
        if (typeof operation !== "string" || !operation.trim()) {
          throw new Error("HTTP Request requires an operation or endpoint when connectionId is used");
        }
        return;
      }
      if (!action?.url && !action?.endpoint) throw new Error("HTTP Request requires a OneConnection or legacy endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action, db, companyId, req }) => {
      if (action.connectionId) {
        const execute = createConnectorActionExecutor({ db });
        const result = await execute({
          companyId: companyId || req?.user?.companyId,
          connectionId: action.connectionId,
          operation: action.operation || action.endpointId || action.endpoint,
          input: action.input || action.body || {},
          platformCredentialAccess:
            Array.isArray(req?.user?.permissions) && req.user.permissions.includes("platform.manage"),
          actorUserId: req?.user?.id || null,
        });
        return { status: "completed", ...result };
      }
      return {
        status: "queued",
        endpoint: action.url || action.endpoint || null,
        legacy: true,
        warning: "Legacy direct endpoint metadata is preserved but new executions should use OneConnection",
      };
    },
  },
  {
    key: "WEBHOOK",
    displayName: "Webhook",
    description: "Send a webhook through OneConnection; legacy direct endpoints remain metadata-compatible.",
    validation: (action) => {
      if (action?.connectionId) {
        if (typeof action.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(action.connectionId)) {
          throw new Error("Webhook requires a valid connectionId");
        }
        const operation = action.operation || action.endpointId || action.endpoint;
        if (typeof operation !== "string" || !operation.trim()) {
          throw new Error("Webhook requires an operation or endpoint when connectionId is used");
        }
        return;
      }
      if (!action?.url && !action?.endpoint) throw new Error("Webhook requires a OneConnection or legacy endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action, db, companyId, req }) => {
      if (action.connectionId) {
        const execute = createConnectorActionExecutor({ db });
        const result = await execute({
          companyId: companyId || req?.user?.companyId,
          connectionId: action.connectionId,
          operation: action.operation || action.endpointId || action.endpoint,
          input: action.input || action.body || {},
          platformCredentialAccess:
            Array.isArray(req?.user?.permissions) && req.user.permissions.includes("platform.manage"),
          actorUserId: req?.user?.id || null,
        });
        return { status: "completed", ...result };
      }
      return {
        status: "queued",
        endpoint: action.url || action.endpoint || null,
        legacy: true,
        warning: "Legacy direct endpoint metadata is preserved but new executions should use OneConnection",
      };
    },
  },
  {
    key: "CONDITION",
    displayName: "Condition",
    description: "Evaluate a branch condition and select flow path.",
    validation: (action) => {
      if (!action?.condition) throw new Error("Condition requires a condition");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, fields, record, previousRecord }) => {
      const condition = action.condition;
      const result = evaluateCondition(condition, fields || [], record || {}, previousRecord || null);
      return { status: result ? "completed" : "skipped", matched: Boolean(result) };
    },
  },
  {
    key: "WAIT",
    displayName: "Wait",
    description: "Pause a workflow without blocking an HTTP request.",
    validation: (action) => {
      if (!action?.durationSeconds && !action?.waitSeconds && !action?.until) {
        throw new Error("Wait requires a durationSeconds or until value");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req }) => {
      const waitSeconds = Number(action.durationSeconds ?? action.waitSeconds ?? 0);
      const runAt = new Date(Date.now() + Math.max(0, waitSeconds || 0) * 1000);
      const job = await enqueuePlatformJob({
        db,
        companyId: companyId || req?.user?.companyId,
        kind: "WAIT",
        payload: { waitSeconds, action },
        runAt,
        idempotencyKey: `${companyId || req?.user?.companyId || "workflow"}:wait:${Date.now()}`,
      });
      return { status: job ? "waiting" : "skipped", jobId: job?.id || null, resumeAt: runAt.toISOString() };
    },
  },
  {
    key: "QUICKBOOKS_TEST_CONNECTION",
    displayName: "Test QuickBooks Connection",
    description: "Verify the enabled, company-scoped QuickBooks connection without returning credentials.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    executor: async (context) => {
      try {
        const loaded = await loadProviderConnection(context, "quickbooks");
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", message: "QuickBooks connection is not configured" };
        const { credentials } = loaded;
        const result = await createQuickBooksAdapter().testConnection({
          environment: credentials.environment,
          realmId: credentials.realmId || credentials.realm_id,
          accessToken: credentials.accessToken || credentials.access_token,
        });
        return { success: true, ...result };
      } catch {
        return { success: false, code: "CONNECTION_FAILED", message: "Unable to verify the QuickBooks connection. Review the settings and retry." };
      }
    },
  },
  {
    key: "QUICKBOOKS_SYNC_VENDORS",
    displayName: "Sync QuickBooks Vendors",
    description: "Create or update mapped QuickBooks vendors from canonical onePOS suppliers.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "accounting.export"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      try {
        const unavailable = await quickBooksPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "quickbooks", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "QuickBooks connection is unavailable" };
        const supplierIds = context.action?.supplierId
          ? [context.action.supplierId]
          : (await context.db("SELECT id FROM suppliers WHERE company_id=$1 AND active=true ORDER BY name", [companyId])).rows.map((row) => row.id);
        const results = [];
        for (const supplierId of supplierIds) results.push(await syncQuickBooksVendor({ db: context.db, companyId, ...loaded, supplierId }));
        return { success: true, synced: results.length, results };
      } catch (error) {
        return { success: false, code: "VENDOR_SYNC_FAILED", retryable: error?.retryable !== false, message: String(error?.message || "QuickBooks vendor sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "QUICKBOOKS_SYNC_PURCHASES",
    displayName: "Sync QuickBooks Purchases",
    description: "Export canonical onePOS purchases and supplier invoices as QuickBooks Bills.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "accounting.export"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      try {
        const unavailable = await quickBooksPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "quickbooks", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "QuickBooks connection is unavailable" };
        const action = context.action || {};
        const ids = action.purchaseId || action.invoiceId
          ? [{ purchaseId: action.purchaseId || null, invoiceId: action.invoiceId || null }]
          : (await context.db("SELECT id FROM purchases WHERE company_id=$1 AND status <> 'CANCELLED' ORDER BY purchase_date", [companyId])).rows.map((row) => ({ purchaseId: row.id, invoiceId: null }));
        const results = [];
        for (const entity of ids) results.push(await exportQuickBooksPurchase({ db: context.db, companyId, ...loaded, ...entity }));
        return { success: true, synced: results.length, results };
      } catch (error) {
        return { success: false, code: "PURCHASE_SYNC_FAILED", retryable: error?.retryable !== false, message: String(error?.message || "QuickBooks purchase sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS",
    displayName: "Sync QuickBooks Supplier Payments",
    description: "Export canonical supplier payments and invoice allocations to QuickBooks.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "accounting.export"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      try {
        const unavailable = await quickBooksPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "quickbooks", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "QuickBooks connection is unavailable" };
        const ids = context.action?.paymentId
          ? [context.action.paymentId]
          : (await context.db("SELECT id FROM supplier_payments WHERE company_id=$1 AND status='COMPLETED' ORDER BY payment_date", [companyId])).rows.map((row) => row.id);
        const results = [];
        for (const paymentId of ids) results.push(await exportQuickBooksSupplierPayment({ db: context.db, companyId, ...loaded, paymentId }));
        return { success: true, synced: results.length, results };
      } catch (error) {
        return { success: false, code: "SUPPLIER_PAYMENT_SYNC_FAILED", retryable: error?.retryable !== false, message: String(error?.message || "QuickBooks supplier payment sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "QUICKBOOKS_SYNC_SUPPLIER_CREDITS",
    displayName: "Sync QuickBooks Supplier Credits",
    description: "Export canonical supplier returns as QuickBooks Vendor Credits.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "accounting.export", "returns.create"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      try {
        const unavailable = await quickBooksPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "quickbooks", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "QuickBooks connection is unavailable" };
        const ids = context.action?.returnId
          ? [context.action.returnId]
          : (await context.db("SELECT id FROM stock_returns WHERE company_id=$1 AND return_type='SUPPLIER' AND status='COMPLETED' ORDER BY created_at", [companyId])).rows.map((row) => row.id);
        const results = [];
        for (const returnId of ids) results.push(await exportQuickBooksSupplierCredit({ db: context.db, companyId, ...loaded, returnId }));
        return { success: true, synced: results.length, results };
      } catch (error) {
        return { success: false, code: "SUPPLIER_CREDIT_SYNC_FAILED", retryable: error?.retryable !== false, message: String(error?.message || "QuickBooks supplier credit sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "QUICKBOOKS_RETRY_FAILED_SYNC",
    displayName: "Retry Failed QuickBooks Sync",
    description: "Retry a failed QuickBooks vendor, purchase, supplier payment, or supplier credit export idempotently.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "accounting.export"],
    executor: async (context) => {
      const syncType = String(context.action?.syncType || "vendors").toLowerCase();
      const companyId = context.companyId || context.req?.user?.companyId;
      try {
        const unavailable = await quickBooksPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "quickbooks", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "QuickBooks connection is unavailable" };
        const action = context.action || {};
        const result = syncType === "vendors"
          ? await syncQuickBooksVendor({ db: context.db, companyId, ...loaded, supplierId: action.supplierId })
          : syncType === "purchases"
            ? await exportQuickBooksPurchase({ db: context.db, companyId, ...loaded, purchaseId: action.purchaseId, invoiceId: action.invoiceId })
            : syncType === "payments"
              ? await exportQuickBooksSupplierPayment({ db: context.db, companyId, ...loaded, paymentId: action.paymentId })
              : syncType === "credits"
                ? await exportQuickBooksSupplierCredit({ db: context.db, companyId, ...loaded, returnId: action.returnId })
                : null;
        if (!result) return { success: false, code: "INVALID_SYNC_TYPE", retryable: false, message: "QuickBooks retry must target vendors, purchases, payments or credits" };
        return { success: true, retried: syncType, ...result };
      } catch (error) {
        return { success: false, code: "SYNC_RETRY_FAILED", retryable: error?.retryable !== false, message: String(error?.message || "QuickBooks sync retry failed").slice(0, 500) };
      }
    },
  },
  {
    key: "SHOPIFY_TEST_CONNECTION",
    displayName: "Test Shopify Connection",
    description: "Verify the enabled, company- and store-scoped Shopify connection without returning credentials.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    executor: async (context) => {
      try {
        const companyId = context.companyId || context.req?.user?.companyId;
        const requestCompanyId = context.req?.user?.companyId;
        if (requestCompanyId && String(requestCompanyId) !== String(companyId)) {
          return { success: false, code: "CONNECTION_FAILED", message: "Unable to verify the Shopify connection. Review the settings and retry." };
        }
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", message: "Shopify connection is not configured" };
        const { connection, credentials } = loaded;
        const shopDomain = credentials.shopDomain || credentials.shop_domain || connection.base_url;
        const domain = String(shopDomain || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
        const result = await createShopifyAdapter().testConnection({
          shopDomain: domain,
          apiVersion: credentials.apiVersion || credentials.api_version,
          accessToken: credentials.accessToken || credentials.access_token,
        });
        return { success: true, ...result };
      } catch {
        return { success: false, code: "CONNECTION_FAILED", message: "Unable to verify the Shopify connection. Review the settings and retry." };
      }
    },
  },
  {
    key: "SHOPIFY_PROCESS_WEBHOOK",
    displayName: "Process Shopify Webhook",
    description: "Import Shopify orders into Online Orders and apply cancellation events through the canonical lifecycle.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.manage"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      const connectionId = context.action?.connectionId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        const result = await processShopifyWebhookEvent({
          db: context.db,
          pool: context.pool,
          companyId,
          connection: loaded.connection,
          credentials: loaded.credentials,
          event: context.action,
          createInventoryMovement: context.createInventoryMovement,
        });
        if (result?.syncRequired === true) {
          const eventKey = context.action?.eventId || context.action?.deliveryId || `${result.inventoryItemId}:${result.locationId}:${result.externalQuantity}`;
          await enqueuePlatformJob({
            db: context.db,
            companyId,
            kind: "SHOPIFY_PROVIDER_SYNC",
            idempotencyKey: `shopify:inventory-reconcile:${loaded.connection.id}:${eventKey}`.slice(0, 200),
            payload: { type: "SHOPIFY_SYNC_INVENTORY", connectionId: loaded.connection.id, storeId: result.storeId },
          });
          result.reconciliationQueued = true;
        }
        if (result?.success === false) return { ...result, retryable: result.retryable === true };
        return { success: true, ...result };
      } catch (error) {
        return {
          success: false,
          code: "PROCESSING_FAILED",
          retryable: error?.retryable === true,
          message: String(error?.message || "Shopify webhook processing failed").slice(0, 500),
        };
      }
    },
  },
  {
    key: "SHOPIFY_SYNC_PRODUCTS",
    displayName: "Sync Shopify Products",
    description: "Upsert canonical onePOS products and variants into the configured Shopify store.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "product.manage"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      const storeId = context.storeId || context.req?.user?.storeId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        const result = await syncShopifyProducts({ db: context.db, companyId, storeId, ...loaded });
        await context.db("UPDATE integration_connections SET last_error=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [loaded.connection.id, companyId]);
        return { success: true, ...result };
      } catch (error) {
        if (context.db && context.action?.connectionId) await context.db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify product sync failed").slice(0, 500), context.action.connectionId, companyId]).catch(() => {});
        return { success: false, code: "SYNC_FAILED", retryable: error?.retryable === true, message: String(error?.message || "Shopify product sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "SHOPIFY_SYNC_INVENTORY",
    displayName: "Sync Shopify Inventory",
    description: "Set Shopify inventory levels from the canonical onePOS store stock balances.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "inventory.view"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      const storeId = context.storeId || context.req?.user?.storeId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        const result = await syncShopifyInventory({ db: context.db, companyId, storeId, ...loaded });
        await context.db("UPDATE integration_connections SET last_error=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [loaded.connection.id, companyId]);
        return { success: true, ...result };
      } catch (error) {
        if (context.db && context.action?.connectionId) await context.db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify inventory sync failed").slice(0, 500), context.action.connectionId, companyId]).catch(() => {});
        return { success: false, code: "SYNC_FAILED", retryable: error?.retryable === true, message: String(error?.message || "Shopify inventory sync failed").slice(0, 500) };
      }
    },
  },
  {
    key: "SHOPIFY_RETRY_FAILED_SYNC",
    displayName: "Retry Failed Shopify Sync",
    description: "Retry the selected Shopify product or inventory synchronisation after a provider failure.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage"],
    executor: async (context) => {
      const syncType = String(context.action?.syncType || "products").toLowerCase();
      if (!["products", "inventory", "fulfilment", "refund"].includes(syncType)) return { success: false, code: "INVALID_SYNC_TYPE", retryable: false, message: "Shopify retry must target products, inventory, fulfilment or refund" };
      const companyId = context.companyId || context.req?.user?.companyId;
      const storeId = context.storeId || context.req?.user?.storeId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        const result = syncType === "products"
          ? await syncShopifyProducts({ db: context.db, companyId, storeId, ...loaded })
          : syncType === "inventory"
            ? await syncShopifyInventory({ db: context.db, companyId, storeId, ...loaded })
            : syncType === "fulfilment"
              ? await exportShopifyFulfillment({ db: context.db, pool: context.pool, companyId, storeId, orderId: context.action?.orderId, ...loaded })
              : await exportShopifyRefund({ db: context.db, pool: context.pool, companyId, storeId, returnId: context.action?.returnId, ...loaded });
        await context.db("UPDATE integration_connections SET last_error=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [loaded.connection.id, companyId]);
        return { success: true, retried: syncType, ...result };
      } catch (error) {
        if (context.db && context.action?.connectionId) await context.db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify sync retry failed").slice(0, 500), context.action.connectionId, companyId]).catch(() => {});
        return { success: false, code: "SYNC_FAILED", retryable: error?.retryable === true, message: String(error?.message || "Shopify sync retry failed").slice(0, 500) };
      }
    },
  },
  {
    key: "SHOPIFY_EXPORT_FULFILMENT",
    displayName: "Export Shopify Fulfilment",
    description: "Create the Shopify fulfilment for a completed canonical onePOS order.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "online_orders.manage"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      const storeId = context.storeId || context.req?.user?.storeId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        return {
          success: true,
          ...(await exportShopifyFulfillment({
            db: context.db, pool: context.pool, companyId, storeId, orderId: context.action?.orderId, ...loaded,
            notifyCustomer: context.action?.notifyCustomer !== false,
          })),
        };
      } catch (error) {
        return { success: false, code: "FULFILMENT_EXPORT_FAILED", retryable: error?.retryable === true, message: String(error?.message || "Shopify fulfilment export failed").slice(0, 500) };
      }
    },
  },
  {
    key: "SHOPIFY_EXPORT_REFUND",
    displayName: "Export Shopify Refund",
    description: "Export a canonical onePOS customer return refund for a Shopify order.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["integration.manage", "returns.create"],
    executor: async (context) => {
      const companyId = context.companyId || context.req?.user?.companyId;
      const storeId = context.storeId || context.req?.user?.storeId;
      try {
        const unavailable = await shopifyPackageAvailability(context.db, companyId);
        if (unavailable) return unavailable;
        const loaded = await loadProviderConnection(context, "shopify", context.action?.connectionId);
        if (!loaded) return { success: false, code: "NOT_CONFIGURED", retryable: false, message: "Shopify connection is unavailable" };
        return {
          success: true,
          ...(await exportShopifyRefund({ db: context.db, pool: context.pool, companyId, storeId, returnId: context.action?.returnId, ...loaded })),
        };
      } catch (error) {
        if (context.db && context.action?.connectionId) await context.db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify refund export failed").slice(0, 500), context.action.connectionId, companyId]).catch(() => {});
        return { success: false, code: "REFUND_EXPORT_FAILED", retryable: error?.retryable === true, message: String(error?.message || "Shopify refund export failed").slice(0, 500) };
      }
    },
  },
  {
    key: "UBER_GET_STORES",
    displayName: "Get Uber Eats Stores",
    description: "List Uber Eats stores available to the configured company connector.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: async (context) => {
      const { runtime, service } = await loadUberWorkflowContext(context);
      if (runtime.enabled !== true) {
        return {
          success: false,
          code: "PLATFORM_DISABLED",
          message: "Uber Eats integration is disabled in Settings - Online Platforms",
          httpStatus: null,
          data: null,
        };
      }
      return service.getStores(runtime);
    },
  },
  {
    key: "UBER_TEST_CONNECTION",
    displayName: "Test Uber Eats Connection",
    description: "Test the configured Uber Eats connector and discover its accessible stores.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: async (context) => {
      const { runtime, service } = await loadUberWorkflowContext(context);
      return runUberStoreConnectionTest(runtime, service);
    },
  },
  {
    key: "UBER_UPLOAD_MENU",
    displayName: "Upload Uber Eats Menu",
    description: "Publish the tenant's Uber-enabled Product Master items to its configured Uber Eats store.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: async (context) => {
      const { db, runtime, service } = await loadUberWorkflowContext(context);
      if (runtime.enabled !== true) {
        return {
          success: false,
          code: "PLATFORM_DISABLED",
          message: "Uber Eats integration is disabled in Settings - Online Platforms",
          productCount: 0,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
      const productsResult = await db(
        `SELECT p.id, p.name, p.description, p.price, p.vat_rate, p.active,
                p.uber_item_id, p.available_on_uber, p.category_id,
                c.name AS category_name
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
          WHERE p.company_id = $1
            AND (p.available_on_uber = true OR p.uber_item_id IS NOT NULL)
          ORDER BY c.display_order, c.name, p.name`,
        [context.companyId || context.req?.user?.companyId]
      );
      const products = productsResult.rows;
      if (!products.length) {
        return {
          success: false,
          code: "NOTHING_TO_SYNC",
          message: "No products are marked 'Available on Uber Eats' in the Product Master",
          productCount: 0,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
      if (runtime.configured !== true) {
        return { ...await service.syncMenu(products, runtime), productCount: products.length };
      }
      const requestedStoreId = String(context.action?.storeId || "").trim();
      const storeId = String(context.action?.storeId || runtime.store_id || runtime.store_location_id || "").trim();
      const storeMenuMappings = runtime.store_menu_mappings || [];
      const configuredStoreIds = new Set([
        runtime.store_id,
        ...runtime.store_mappings.map((entry) => entry.uber_store_id),
        ...storeMenuMappings.map((entry) => entry.uber_store_id),
      ].filter(Boolean).map(String));
      if (requestedStoreId && !configuredStoreIds.has(requestedStoreId)) {
        return {
          success: false,
          code: "UBER_STORE_NOT_CONFIGURED",
          message: `Uber store ${requestedStoreId} is not configured for this company`,
          productCount: products.length,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
      const selectedStoreMenuMapping = storeMenuMappings.find(
        (entry) => entry.uber_store_id === storeId
      );
      if (!storeId) {
        return {
          success: false,
          code: "STORE_NOT_MAPPED",
          message: "Select an Uber store before syncing its menu",
          productCount: products.length,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
      if (
        (storeMenuMappings.length > 0 && !selectedStoreMenuMapping) ||
        (storeMenuMappings.length === 0 && runtime.store_mappings.length > 1)
      ) {
        return {
          success: false,
          code: "STORE_MENU_CONFIGURATION_REQUIRED",
          message: `Configure a menu mapping for Uber store ${storeId} before syncing`,
          productCount: products.length,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
      const menuRuntime = {
        ...runtime,
        store_id: storeId,
        store_location_id: storeId,
        menu_mapping: selectedStoreMenuMapping?.menu_mapping || runtime.menu_mapping || null,
      };
      let mappingProducts = products;
      let customFields;
      if (menuRuntime.menu_mapping) {
        const customFieldResult = await db(
          `SELECT f.api_name
             FROM platform_fields f
             JOIN platform_objects o ON o.id = f.object_id
            WHERE o.object_key = 'product'
              AND o.active = true
              AND f.active = true
              AND f.config->>'storage' = 'extension'
              AND (o.company_id IS NULL OR o.company_id = $1)
              AND (f.company_id IS NULL OR f.company_id = $1)`,
          [context.companyId || context.req?.user?.companyId]
        );
        customFields = customFieldResult.rows.map((field) => field.api_name);
        const overridesResult = await db(
          `SELECT a.record_id, a.custom_values
             FROM platform_record_associations a
             JOIN platform_objects o ON o.id = a.object_id
            WHERE o.object_key = 'product'
              AND o.active = true
              AND (o.company_id IS NULL OR o.company_id = $1)
              AND a.company_id = $1
              AND a.record_id = ANY($2::uuid[])`,
          [context.companyId || context.req?.user?.companyId, products.map((product) => product.id)]
        );
        const overridesById = new Map(
          overridesResult.rows.map((row) => [String(row.record_id), row.custom_values || {}])
        );
        mappingProducts = products.map((product) => ({
          ...product,
          custom_values: overridesById.get(String(product.id)) || {},
        }));
      }

      try {
        const { products: mappedProducts } = resolveUberMenuProducts(mappingProducts, menuRuntime.menu_mapping, { customFields });
        return { ...await service.syncMenu(mappedProducts, menuRuntime), productCount: products.length };
      } catch (error) {
        if (!(error instanceof UberMenuMappingError)) throw error;
        return {
          success: false,
          code: error.code,
          message: error.message,
          details: error.details,
          productCount: products.length,
          meta: { publishedCount: 0, skippedInactiveCount: 0, categoryCount: 0, publishedItemIds: [] },
          httpStatus: null,
          data: null,
        };
      }
    },
  },
  {
    key: "UBER_ACCEPT_ORDER",
    displayName: "Accept Uber Eats Order",
    description: "Acknowledge a received Uber Eats order using its company-scoped onePOS order record.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.manage"],
    executor: (context) => executeUberOrderAction(context, "accept"),
  },
  {
    key: "UBER_DENY_ORDER",
    displayName: "Deny Uber Eats Order",
    description: "Deny a received or accepted Uber Eats order using its company-scoped onePOS order record.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.manage"],
    executor: (context) => executeUberOrderAction(context, "deny"),
  },
  {
    key: "UBER_UPDATE_ITEM_PRICE",
    displayName: "Update Uber Eats Item Price",
    description: "Update one company-scoped Uber Eats item price.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: (context) => executeUberItemAction(context, "price"),
  },
  {
    key: "UBER_SET_ITEM_UNAVAILABLE",
    displayName: "Set Uber Eats Item Unavailable",
    description: "Suspend one company-scoped Uber Eats item until a future time.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: (context) => executeUberItemAction(context, "unavailable"),
  },
  {
    key: "UBER_SET_ITEM_AVAILABLE",
    displayName: "Set Uber Eats Item Available",
    description: "Remove the suspension from one company-scoped Uber Eats item.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["online_orders.configure"],
    executor: (context) => executeUberItemAction(context, "available"),
  },
  {
    key: "STOP",
    displayName: "Stop",
    description: "Stop workflow execution cleanly and record the reason.",
    validation: () => undefined,
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action }) => ({ status: "stopped", reason: action?.reason || "Workflow stopped by action" }),
  },
]);

export const WORKFLOW_ACTION_MAP = new Map(WORKFLOW_ACTION_REGISTRY.map((definition) => [String(definition.key || "").toUpperCase(), definition]));

export const REGISTERED_FUNCTIONS = PLATFORM_FUNCTIONS;

export const REGISTERED_FUNCTIONS_MAP = PLATFORM_FUNCTION_MAP;

export function getWorkflowActionRegistry() {
  return [...WORKFLOW_ACTION_REGISTRY, ...DYNAMIC_CONNECTOR_ACTIONS].filter((definition, index, all) => all.findIndex((entry) => String(entry.key || "").toUpperCase() === String(definition.key || "").toUpperCase()) === index);
}

export function getWorkflowActionDefinition(key) {
  const normalized = String(key || "").toUpperCase();
  return (WORKFLOW_ACTION_MAP.get(normalized) || DYNAMIC_CONNECTOR_ACTIONS.find((entry) => String(entry.key || "").toUpperCase() === normalized) || null);
}

export function validateWorkflowAction(action) {
  if (!action || typeof action !== "object") {
    throw new Error("Workflow action must be an object");
  }
  const type = String(action.type || action.key || "").toUpperCase();
  const definition = getWorkflowActionDefinition(type) || getWorkflowActionDefinition(action.type || action.key);
  if (!definition) {
    throw new Error(`Unsupported workflow action: ${action.type || action.key}`);
  }
  if (typeof definition.validation === "function") {
    definition.validation(action);
  }
  return definition;
}

export function getRegisteredFunction(functionKey) {
  return REGISTERED_FUNCTIONS_MAP.get(String(functionKey || "")) || null;
}

export function getRegisteredFunctionsRegistry() {
  return REGISTERED_FUNCTIONS.slice();
}

async function resolveTargetObjectMetadata({ db, objectId, objectKey, companyId }) {
  if (!db || typeof db !== "function" || !companyId) return null;
  const where = objectId ? "id=$1" : "object_key=$1";
  const value = objectId || objectKey;
  if (!value) return null;
  const result = await db(
    `SELECT * FROM platform_objects
      WHERE ${where}
        AND active=true
        AND source_table IS NOT NULL
        AND (company_id=$2 OR company_id IS NULL)
      ORDER BY CASE WHEN company_id=$2 THEN 0 ELSE 1 END, id
      LIMIT 1`,
    [value, companyId]
  );
  return result.rows[0] || null;
}

async function resolveWorkflowTargetObject({ db, action = {}, object = null, companyId, req }) {
  const runtimeCompanyId = companyId || req?.user?.companyId || null;
  if (!runtimeCompanyId || (req?.user?.companyId && String(req.user.companyId) !== String(runtimeCompanyId))) {
    throw new Error("Workflow target company context is invalid");
  }
  if (action.sourceTable || action.targetTable || action.relatedTable) {
    throw new Error("Workflow target tables must be resolved from tenant-scoped Platform metadata");
  }
  const requestedObjectId = action.objectId || action.object_id || null;
  const requestedObjectKey = action.objectKey || action.object_key || null;
  const objectId = requestedObjectId || (!requestedObjectKey ? object?.id || null : null);
  const objectKey = requestedObjectKey || (!objectId ? object?.object_key || object?.api_name || null : null);
  const target = await resolveTargetObjectMetadata({ db, objectId, objectKey, companyId: runtimeCompanyId });
  if (!target) throw new Error("Workflow target object is not available for this company");
  const tenantOwned = target.company_id != null && String(target.company_id) === String(runtimeCompanyId);
  const globalTenantScoped = target.company_id == null && target.company_scoped === true;
  if (!isSafeIdentifier(target.source_table) || (!tenantOwned && !globalTenantScoped)) {
    throw new Error("Workflow target object is not permitted");
  }
  return target;
}

async function resolveWorkflowWritableFields({ db, object, fields = [], entries, req, executionMode, trustedSystem }) {
  const metadata = Array.isArray(fields) && fields.length
    ? fields
    : (await db(
      `SELECT * FROM platform_fields
        WHERE object_id=$1 AND active=true
          AND (company_id IS NULL OR company_id=$2)
        ORDER BY display_order`,
      [object.id, authoritativeRuntimeCompanyId({ req, companyId: object.company_id })]
    )).rows;
  const secured = await assertRuntimeFieldWriteAccess({
    db,
    req,
    object,
    fields: metadata,
    fieldNames: entries.map(([name]) => String(name)),
    executionMode,
    trustedSystem,
  });
  return secured.map((field) => ({ ...field, source_column: field.source_column || field.api_name }));
}

export function alignWorkflowWritableValues(mappedFields = [], entries = []) {
  const requested = new Map(entries.map(([name, value]) => [String(name), value]));
  return mappedFields.map((field) => {
    const apiName = String(field.api_name || "");
    const sourceColumn = String(field.source_column || apiName);
    if (requested.has(apiName)) return { field, value: requested.get(apiName) };
    if (requested.has(sourceColumn)) return { field, value: requested.get(sourceColumn) };
    throw new Error(`Workflow field value is missing for writable field: ${apiName || sourceColumn}`);
  });
}

async function checkWorkflowDuplicateRules({ db, object, entries, companyId, req, excludeRecordId = null }) {
  const metadata = await db(
    `SELECT * FROM platform_fields
      WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)`,
    [object.id, companyId]
  );
  const fields = metadata.rows || [];
  const input = {};
  for (const [name, value] of entries) {
    const field = fields.find((candidate) => candidate.api_name === name || candidate.source_column === name);
    if (field?.api_name) input[field.api_name] = value;
  }
  const matches = await findConfiguredDuplicateMatches({
    db,
    object,
    fields,
    input,
    companyId,
    storeId: req?.user?.storeId || null,
    excludeRecordId,
  });
  const action = resolveDuplicateAction(matches);
  if (action === "BLOCK") {
    throw Object.assign(new Error("Workflow record matches an active duplicate rule"), { status: 409, code: "EXISTING_RECORD_DUPLICATE" });
  }
  return action;
}

export function createWorkflowRun({ db, companyId, workflowId, workflowName, objectId, recordId, triggerKey, parentRunId = null, startedAt = new Date(), status = "PENDING", metadata = {} }) {
  if (!db || typeof db !== "function") return null;
  const payload = { workflowId, workflowName, objectId, recordId, triggerKey, parentRunId, status, metadata: metadata || {} };
  return db(
    `INSERT INTO platform_workflow_runs (company_id, workflow_id, workflow_name, object_id, record_id, trigger_key, parent_run_id, status, started_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
    [companyId, workflowId || null, workflowName || null, objectId || null, recordId || null, triggerKey || null, parentRunId || null, status, startedAt, JSON.stringify(payload.metadata || {})]
  ).then((result) => result.rows[0] || null);
}

export function createWorkflowStepRun({ db, runId, stepIdentifier, stepOrder = 0, actionType, status = "PENDING", metadata = {}, jobId = null, childRunId = null, correlationId = null }) {
  if (!db || typeof db !== "function") return null;
  return db(
    `INSERT INTO platform_workflow_step_runs (run_id, step_identifier, step_order, action_type, status, metadata, durable_job_id, child_run_id, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
    [runId, stepIdentifier || null, stepOrder, actionType || null, status, JSON.stringify(metadata || {}), jobId || null, childRunId || null, correlationId || null]
  ).then((result) => result.rows[0] || null);
}

export function resolveWorkflowActionType(action) {
  const normalized = action && (action.type || action.key || action.actionType || "");
  return String(normalized || "").toUpperCase();
}

async function assertWorkflowActionPermission(context, definition) {
  const mode = resolveExecutionMode(context);
  if (mode === EXECUTION_MODES.SYSTEM) {
    if (!(context.trustedSystem === true || context.req?.trustedSystemExecution === true || context.executionContext?.globals?.$System?.trusted === true)) {
      throw Object.assign(new Error("SYSTEM workflow execution is not trusted"), { status: 403, code: "UNTRUSTED_SYSTEM_EXECUTION" });
    }
    return;
  }

  const req = context?.req;
  if (!req?.user?.id || !req.user.roleId || !req.user.companyId) {
    throw Object.assign(new Error("Workflow action requires an authenticated USER execution context"), { status: 403, code: "RUNTIME_ACTOR_REQUIRED" });
  }
  if (!context?.db || typeof context.db !== "function") {
    throw new Error("Workflow action authorization context is unavailable");
  }
  const required = Array.isArray(definition.requiredPermissions) ? definition.requiredPermissions : [];
  if (!required.length) return;
  const [roleResult, permissionSets] = await Promise.all([
    context.db(
      `SELECT 1
       FROM role_permissions rp
       JOIN permissions p ON p.id=rp.permission_id
       WHERE rp.role_id=$1 AND p.code = ANY($2::text[])
       LIMIT 1`,
      [req.user.roleId, required]
    ),
    loadEffectivePermissionSets(context.db, req.user, req),
  ]);
  const setAllowed = required.some((permission) => permissionSetAllowsSystemPermission(permissionSets, permission));
  if (!roleResult.rows.length && !setAllowed) {
    throw Object.assign(new Error("You do not have permission to execute this workflow action"), { status: 403, code: "WORKFLOW_ACTION_PERMISSION_REQUIRED" });
  }
}

export async function executeWorkflowAction(context) {
  const action = context?.action;
  const definition = validateWorkflowAction(action);
  await assertWorkflowActionPermission(context, definition);
  if (typeof definition.executor !== "function") {
    return { status: "skipped", reason: "No executor configured" };
  }
  return definition.executor(context);
}

async function recordCompensationFailure({ db, runId, stepRunId, action, error, context }) {
  const details = errorDetails(error);
  if (!db || !runId) return details;
  await db(
    `INSERT INTO platform_workflow_compensation_runs
       (run_id, step_run_id, company_id, action_type, status, error_text, metadata)
     VALUES ($1,$2,$3,$4,'FAILED',$5,$6::jsonb)`,
    [runId, stepRunId || null, context.companyId || context.req?.user?.companyId || null, resolveWorkflowActionType(action), details.message, JSON.stringify({ error: details })]
  );
  return details;
}

async function getOrCreateWorkflowStepRun({ db, runId, stepIdentifier, stepOrder, actionType, correlationId = null }) {
  const existing = await db(
    "SELECT * FROM platform_workflow_step_runs WHERE run_id=$1 AND step_identifier=$2 ORDER BY created_at DESC LIMIT 1",
    [runId, stepIdentifier]
  );
  if (existing.rows?.[0]) return existing.rows[0];
  return createWorkflowStepRun({
    db,
    runId,
    stepIdentifier,
    stepOrder,
    actionType,
    status: "RUNNING",
    correlationId,
    metadata: { irreversible: IRREVERSIBLE_ACTIONS.has(actionType) },
  });
}

async function compensateCompletedSteps(completed, context, originalError) {
  const failures = [];
  for (const item of completed.reverse()) {
    const compensation = item.action?.compensation;
    if (!compensation || !context.db || !context.runId) continue;
    try {
      const existing = await context.db(
        "SELECT id,status FROM platform_workflow_compensation_runs WHERE run_id=$1 AND step_run_id=$2 AND company_id=$3 LIMIT 1",
        [context.runId, item.stepRunId || null, context.companyId || context.req?.user?.companyId || null]
      );
      if (existing.rows?.length) continue;
      const result = await executeWorkflowAction({ ...context, action: compensation, stepRunId: item.stepRunId || null, compensationFor: item.stepRunId || item.index });
      if (result?.status === "failed") throw new Error(result.error || "Compensation failed");
    } catch (error) {
      failures.push(await recordCompensationFailure({ db: context.db, runId: context.runId, companyId: context.companyId, req: context.req, context, stepRunId: item.stepRunId, action: compensation, error }));
    }
  }
  return failures;
}

export async function executeWorkflowActions({ actions, ...context }) {
  if (!Array.isArray(actions)) return [];

  const workflowIdentity = context.workflowId || context.executionContext?.globals?.$Flow?.id || (context.runId ? `run:${context.runId}` : null);
  const governor = context.governor || createGovernorBudget({ limits: context.governorLimits || {} });
  governor.checkRuntime();
  governor.checkPayload({
    record: context.record || null,
    previousRecord: context.previousRecord || null,
    workflowVariables: context.workflowVariables || null,
  });
  const executionGuard = context.executionGuard
    || (workflowIdentity
      ? createExecutionGuard({
          maxDepth: 8,
          chain: Array.isArray(context.workflowStack) ? context.workflowStack : [],
        }).enter(workflowIdentity)
      : createExecutionGuard({ maxDepth: 8, chain: Array.isArray(context.workflowStack) ? context.workflowStack : [] }));

  let persistentClaim = null;
  if (context.db && context.idempotencyKey && (context.companyId || context.req?.user?.companyId)) {
    persistentClaim = await claimPersistentExecution({
      db: context.db,
      companyId: context.companyId || context.req?.user?.companyId,
      scope: `workflow:${workflowIdentity || "anonymous"}`,
      idempotencyKey: context.idempotencyKey,
      fingerprint: executionFingerprint({
        workflowIdentity,
        recordId: context.recordId || context.record?.id || null,
        previousRecordId: context.previousRecord?.id || null,
        actionCount: actions.length,
      }),
      metadata: { runId: context.runId || null, workflowIdentity },
    });
    if (!persistentClaim.claimed) {
      if (persistentClaim.row?.status === "COMPLETED") {
        return Array.isArray(persistentClaim.row?.result) ? persistentClaim.row.result : [];
      }
      return [{ action: "WORKFLOW", result: { status: "skipped", duplicate: true, idempotencyKey: context.idempotencyKey } }];
    }
  }

  const executionMode = resolveExecutionMode(context);
  let executionContext;
  try {
    executionContext = await createPlatformExecutionContext({
      ...context,
      executionMode,
      trustedSystem: context.trustedSystem === true || context.req?.trustedSystemExecution === true,
      workflowId: context.workflowId || context.executionContext?.globals?.$Flow?.id || null,
      workflowVersion: context.workflowVersion || context.executionContext?.globals?.$Flow?.version || null,
      parentRunId: context.parentRunId || context.executionContext?.globals?.$Flow?.runId || null,
      executionContext: context.executionContext || null,
    });
  } catch (error) {
    if (persistentClaim?.row?.id && context.db) {
      await completePersistentExecution({
        db: context.db,
        claimId: persistentClaim.row.id,
        status: "FAILED",
        error: errorDetails(error),
      });
    }
    throw error;
  }
  let governedDb = context.db;
  if (typeof context.db === "function" && context.db.__platformGoverned !== true) {
    governedDb = async (...args) => {
      governor.consumeQuery(1);
      return context.db(...args);
    };
    governedDb.__platformGoverned = true;
  }
  const runtimeContext = applyExecutionContext({
    ...context,
    db: governedDb,
    executionGuard,
    governor,
    executionMode,
    trustedSystem: context.trustedSystem === true || context.req?.trustedSystemExecution === true,
    workflowDepth: executionGuard.chain.length,
    workflowStack: [...executionGuard.chain],
  }, executionContext);

  if (runtimeContext.db && runtimeContext.runId) {
    await runtimeContext.db(
      `UPDATE platform_workflow_runs
          SET correlation_id=COALESCE(correlation_id,$1),
              execution_mode=COALESCE(execution_mode,$2),
              runtime_contract_version=COALESCE(runtime_contract_version,$3),
              metadata=COALESCE(metadata,'{}'::jsonb) || $4::jsonb,
              updated_at=NOW()
        WHERE id=$5 AND company_id=$6`,
      [
        runtimeContext.correlationId || runtimeContext.$System?.correlationId || null,
        runtimeContext.executionMode || runtimeContext.$System?.executionMode || null,
        runtimeContext.$System?.runtimeContractVersion || null,
        JSON.stringify({
          correlationId: runtimeContext.correlationId || runtimeContext.$System?.correlationId || null,
          executionMode: runtimeContext.executionMode || runtimeContext.$System?.executionMode || null,
          runtimeContractVersion: runtimeContext.$System?.runtimeContractVersion || null,
        }),
        runtimeContext.runId,
        runtimeContext.companyId || runtimeContext.req?.user?.companyId,
      ]
    );
  }

  const results = [];
  const completed = [];
  const workflowVariables = {
    ...executionContext.globals,
    ...(runtimeContext.workflowVariables || {}),
    steps: { ...(runtimeContext.workflowVariables?.steps || {}) },
  };

  for (const item of actions) {
    if (!item || typeof item !== "object") continue;
    governor.consumeWorkflowStep(1);
    const actionType = resolveWorkflowActionType(item);
    const externalActionTypes = new Set([
      "SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","SEND_PASSWORD_RESET_EMAIL","SEND_USER_INVITATION",
      "CALL_WEBHOOK","WEBHOOK","HTTP_REQUEST","CALL_FUNCTION","CALL_CONNECTOR",
      "CONNECTOR_HEALTH_CHECK","CONNECTOR_TEST_CONNECTION",
      "PAYMENT_START","PAYMENT_CANCEL","PAYMENT_REFUND","CREATE_APPOINTMENT_PAYMENT_REQUEST",
      "GLOBAL_PRODUCT_LOOKUP_BARCODE","GO_UPC_LOOKUP_PRODUCT","GO_UPC_TEST_CONNECTION",
      "OPEN_FOOD_FACTS_LOOKUP_PRODUCT","OPEN_FOOD_FACTS_TEST_CONNECTION",
      "QUICKBOOKS_RETRY_FAILED_SYNC","QUICKBOOKS_SYNC_PURCHASES","QUICKBOOKS_SYNC_SUPPLIER_CREDITS",
      "QUICKBOOKS_SYNC_SUPPLIER_PAYMENTS","QUICKBOOKS_SYNC_VENDORS","QUICKBOOKS_TEST_CONNECTION",
      "SHOPIFY_EXPORT_FULFILMENT","SHOPIFY_EXPORT_REFUND","SHOPIFY_PROCESS_WEBHOOK",
      "SHOPIFY_RETRY_FAILED_SYNC","SHOPIFY_SYNC_INVENTORY","SHOPIFY_SYNC_PRODUCTS","SHOPIFY_TEST_CONNECTION",
      "UBER_ACCEPT_ORDER","UBER_DENY_ORDER","UBER_GET_STORES","UBER_SET_ITEM_AVAILABLE",
      "UBER_SET_ITEM_UNAVAILABLE","UBER_TEST_CONNECTION","UBER_UPDATE_ITEM_PRICE","UBER_UPLOAD_MENU",
      "JARVES_INTERACTION"
    ]);
    if (externalActionTypes.has(actionType)) {
      governor.consumeExternalAction(1);
    }
    if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","SEND_PASSWORD_RESET_EMAIL","SEND_USER_INVITATION","WAIT"].includes(actionType)) {
      governor.consumeQueuedJob(1);
    }
    if (actionType === "RUN_SUBFLOW") governor.consumeSubflow(1);
    const index = results.length;
    let stepRun = null;
    if (runtimeContext.db && runtimeContext.runId) {
      stepRun = await getOrCreateWorkflowStepRun({
        db: runtimeContext.db,
        runId: runtimeContext.runId,
        stepIdentifier: item.id || `step-${index + 1}`,
        stepOrder: index + 1,
        actionType: resolveWorkflowActionType(item),
        correlationId: runtimeContext.correlationId || runtimeContext.$System?.correlationId || null,
      });
    }
    if (stepRun?.status === "COMPLETED" || stepRun?.status === "WAITING") {
      const priorResult = stepRun.metadata?.result || { status: stepRun.status === "WAITING" ? "waiting" : "completed", idempotentReplay: true };
      results.push({ action: item.type || item.key, result: priorResult, stepRunId: stepRun.id, idempotentReplay: true });
      workflowVariables.steps[item.id || `step-${index + 1}`] = priorResult;
      completed.push({ action: item, stepRunId: stepRun.id, index });
      continue;
    }
    try {
      const result = await executeWorkflowAction({ ...runtimeContext, workflowVariables, action: item, stepRunId: stepRun?.id || null });
      const entry = { action: item.type || item.key, result, stepRunId: stepRun?.id || null };
      workflowVariables.steps[item.id || `step-${index + 1}`] = result;
      results.push(entry);
      if (result?.status === "failed") throw new WorkflowExecutionError(errorDetails(result.error || result), []);
      if (result?.status === "completed" || result?.status === "queued" || result?.status === "waiting") {
        completed.push({ action: item, stepRunId: stepRun?.id || null, index });
      }
      if (stepRun?.id) await updateWorkflowStepRunStatus({ db: runtimeContext.db, stepRunId: stepRun.id, status: result?.status === "stopped" ? "STOPPED" : result?.status === "waiting" ? "WAITING" : result?.status === "queued" ? "WAITING" : "COMPLETED", metadata: { result: redact(result), irreversible: IRREVERSIBLE_ACTIONS.has(resolveWorkflowActionType(item)) } });
      if (result?.status === "stopped") break;
    } catch (error) {
      const details = errorDetails(error);
      if (stepRun?.id) await updateWorkflowStepRunStatus({ db: runtimeContext.db, stepRunId: stepRun.id, status: "FAILED", errorText: details.message, metadata: { error: details } });
      const compensationFailures = await compensateCompletedSteps(completed, runtimeContext, error);
      if (runtimeContext.runId && runtimeContext.db) {
        await runtimeContext.db(
          "UPDATE platform_workflow_runs SET status='FAILED', completed_at=NOW(), error_text=$1, metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$3 AND company_id=$4",
          [details.message, JSON.stringify({ rootError: details, compensationFailures }), runtimeContext.runId, runtimeContext.companyId || runtimeContext.req?.user?.companyId]
        );
      }
      if (persistentClaim?.row?.id) {
        await completePersistentExecution({
          db: runtimeContext.db,
          claimId: persistentClaim.row.id,
          status: "FAILED",
          error: details,
        });
      }
      throw new WorkflowExecutionError(details, compensationFailures);
    }
  }
  if (persistentClaim?.row?.id) {
    await completePersistentExecution({ db: runtimeContext.db, claimId: persistentClaim.row.id, status: "COMPLETED", result: results });
  }
  return results;
}
