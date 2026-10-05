import { evaluateCondition } from "./platformConditions.js";
import { renderMessageTemplate } from "./messageTemplates.js";
import { COMMUNICATION_EVENTS, recordCommunicationEvent } from "./communicationCore.js";
import { classifyDebugCode } from "./debugCodes.js";
import { evaluateWorkflowFormula, workflowFormulaReferences } from "./platformFormula.js";
import { enqueuePlatformJob } from "./platformJobs.js";
import { executeRegisteredAction } from "./platformActions.js";
import { isSafeIdentifier } from "./platformMetadata.js";
import { resolveBindingTree, resolveRecordPathValue, resolveWorkflowResource } from "./platformRecordPaths.js";
import { domainAllowed, issueAccountToken, normalizeEmail } from "./accountPolicy.js";
import { createConnectorActionExecutor } from "./connectorFramework.js";
import { effectiveManifest, resolvePersistedConnectorCapability } from "./connectorRuntime.js";
import { createInventoryMovement } from "./inventory.js";
import { createSaleForCompletedOrder } from "./onlineOrders/saleCreator.js";
import { publishPlatformEvent } from "./platformEvents.js";
import { applyPackageLifecycle } from "./packageLifecycleRuntime.js";
import { decryptCredentials, encryptCredentials } from "./integrationCredentials.js";
import { decryptSecret } from "./onlineOrders/platformConfig.js";
import { createQuickBooksAdapter } from "./quickbooksAdapter.js";
import { syncQuickBooksVendor, exportQuickBooksPurchase, exportQuickBooksSupplierPayment, exportQuickBooksSupplierCredit } from "./quickbooksSync.js";
import { createShopifyAdapter } from "./shopifyAdapter.js";
import { exportShopifyFulfillment, exportShopifyRefund, syncShopifyInventory, syncShopifyProducts } from "./shopifySync.js";
import { processShopifyWebhookEvent } from "./onlineOrders/shopifyWebhookProcessor.js";
import { getCompanyEntitlements, hasEntitlement, isPackageLicensed } from "./licensing.js";
import { findConfiguredDuplicateMatches, resolveDuplicateAction } from "./platformDuplicateMatching.js";
import { applyFieldSecurity } from "./platformFieldValues.js";
import { loadEffectivePermissionSets, permissionSetAllowsObject, permissionSetAllowsSystemPermission } from "./platformPermissionSets.js";
import { systemObjectRbacPermission } from "./platformSystemObjects.js";
import { hasPlatformObjectPermission } from "./platformReportSecurity.js";
import { createGlobalProductLookupService } from "./globalProductLookup.js";
import { oneHttpRequestDefinition } from "./oneCoreFunctions.js";
import { PLATFORM_FUNCTIONS, PLATFORM_FUNCTION_MAP } from "./platformFunctionRegistry.js";
const IRREVERSIBLE_ACTIONS = new Set(["SEND_COMMUNICATION", "SEND_EMAIL", "SEND_EMAIL_BREVO", "SEND_EMAIL_MAILJET", "EMAIL_ALERT", "SEND_SMS", "SEND_WHATSAPP", "CALL_WEBHOOK", "HTTP_REQUEST", "WEBHOOK"]);
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

function redact(value, depth = 0, inheritedSecureValues = new Set()) {
  if (depth > 5 || value == null) return value;
  const secureValues = new Set(inheritedSecureValues);
  if (value && typeof value === "object" && Array.isArray(value.__secureValues)) {
    for (const secret of value.__secureValues) {
      const text = String(secret ?? "");
      if (text.length >= 4) secureValues.add(text);
    }
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, secureValues));
  if (typeof value !== "object") {
    let text = String(value);
    for (const secret of secureValues) {
      if (secret && text.includes(secret)) text = text.split(secret).join("********");
    }
    return text;
  }
  const secureFields = new Set(Array.isArray(value.__secureFields) ? value.__secureFields.map(String) : []);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "__secureFields" && key !== "__secureValues")
    .map(([key, item]) => [key, (SECRET_KEY.test(key) || secureFields.has(key)) ? "********" : redact(item, depth + 1, secureValues)]));
}

function errorDetails(error) {
  const status = error?.status || error?.statusCode || 500;
  return redact({
    message: String(error?.message || error || "Workflow execution failed").slice(0, 2000),
    code: error?.code || null,
    oeCode: classifyDebugCode(error, Number(status || 500)),
    status,
    retryable: error?.retryable ?? null,
  });
}

async function loadProviderConnection(context, providerKey, requestedConnectionId = null) {
  const requestCompanyId = context.req?.user?.companyId || null;
  const companyId = context.companyId || requestCompanyId;
  if (!context.db || typeof context.db !== "function" || !companyId) {
    throw new Error(`${providerKey} action requires a company-scoped database context`);
  }
  if (requestCompanyId && String(requestCompanyId) !== String(companyId)) {
    throw new Error(`${providerKey} action company context is invalid`);
  }
  const storeId = context.storeId || context.req?.user?.storeId || null;
  const connectionPredicate = requestedConnectionId ? "AND id=$4" : "";
  const values = [companyId, providerKey, storeId];
  if (requestedConnectionId) values.push(requestedConnectionId);
  const result = await context.db(
    `SELECT id, company_id, store_id, base_url, credentials_encrypted
       FROM integration_connections
      WHERE company_id=$1 AND LOWER(provider_name)=LOWER($2) AND enabled=true
        AND (store_id IS NULL OR store_id=$3)
        ${connectionPredicate}
      ORDER BY (store_id IS NULL), updated_at DESC
      LIMIT 1`,
    values
  );
  const connection = result.rows?.[0];
  if (!connection?.credentials_encrypted) return null;
  let credentials = decryptCredentials(connection.credentials_encrypted) || {};
  const expiry = Date.parse(credentials.tokenExpiry || credentials.token_expiry || "");
  if (Number.isFinite(expiry) && expiry <= Date.now() + 60_000) {
    const clientId = credentials.clientId || credentials.client_id;
    const clientSecret = credentials.clientSecret || credentials.client_secret;
    let refreshed;
    if (providerKey === "quickbooks") {
      refreshed = await createQuickBooksAdapter().refreshAuthentication({
        refreshToken: credentials.refreshToken || credentials.refresh_token,
        clientId,
        clientSecret,
      });
    } else if (providerKey === "shopify") {
      const shopDomain = credentials.shopDomain || credentials.shop_domain || connection.base_url;
      refreshed = await createShopifyAdapter().refreshAuthentication({
        shopDomain: String(shopDomain || "").replace(/^https?:\/\//i, "").replace(/\/$/, ""),
        refreshToken: credentials.refreshToken || credentials.refresh_token,
        clientId,
        clientSecret,
      });
    }
    if (!refreshed) throw new Error(`${providerKey} token refresh is unavailable`);
    credentials = {
      ...credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      ...(refreshed.refreshTokenExpiresIn
        ? { refreshTokenExpiry: new Date(Date.now() + refreshed.refreshTokenExpiresIn * 1000).toISOString() }
        : {}),
      ...(refreshed.scopes?.length ? { scopes: refreshed.scopes } : {}),
    };
    const saved = await context.db(
      `UPDATE integration_connections
          SET credentials_encrypted=$1, last_error=NULL, updated_at=NOW()
        WHERE id=$2 AND company_id=$3 AND enabled=true
        RETURNING id`,
      [encryptCredentials(credentials), connection.id, companyId]
    );
    if (!saved.rows?.length) throw new Error(`${providerKey} connection changed during token refresh`);
  }
  return { connection, credentials };
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
    this.oeCode = details.oeCode || classifyDebugCode(this, Number(details.status || 500));
    this.details = { ...details, oeCode: this.oeCode };
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
  const hasUserIdentity = [user.id, user.userId, user.companyId, user.storeId, user.roleId]
    .some((value) => value !== undefined && value !== null && value !== false);
  if (!hasUserIdentity) return true;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : Array.isArray(user?.permissionCodes) ? user.permissionCodes : [];
  const required = connectorActionPermission(actionKey);
  if (!required.length) return true;
  return required.some((permission) => permissions.includes(permission));
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
  if (!tenantCompanyId) {
    return { success: false, code: "INVALID_SCOPE", message: "Connector workflow action requires a company scope" };
  }
  const runtimePayload = payload ?? action?.payload ?? { ...action };
  const explicitInstanceId = action?.connectorInstanceId || action?.instanceId || runtimePayload?.connectorInstanceId || runtimePayload?.instanceId || null;

  // Explicit device/app assignments resolve the exact installed connector
  // instance instead of falling back to whichever connector is bound to the
  // current till. Management/test actions may resolve disabled instances;
  // runtime actions require the selected instance to be enabled and healthy.
  if (explicitInstanceId) {
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
    if (!driver && requestedKey === "CONNECTOR_TEST_CONNECTION" && instance.connector_definition_id) {
      try {
        const executeConnectorAction = createConnectorActionExecutor({ db });
        const test = await executeConnectorAction({
          companyId: tenantCompanyId,
          connectionId: instance.id,
          operation: "test_connection",
          actorUserId: actorUserId || req?.user?.id || null,
        });
        const testResult = { ...test, testMode: false };
        await db(
          `UPDATE integration_connections
              SET connection_status='CONNECTED',last_error=NULL,last_test_at=NOW(),
                  last_test_result=$1::jsonb,last_connected_at=NOW(),updated_at=NOW()
            WHERE id=$2 AND company_id=$3`,
          [JSON.stringify(testResult), instance.id, tenantCompanyId]
        );
        await writeAudit?.(tenantCompanyId, actorUserId || req?.user?.id || null, "connector.instance.tested", "integration_connection", instance.id, { packageKey: instance.connector_package_key, success: true, metadataDriven: true });
        return { success: true, status: "CONNECTED", connectorInstanceId: instance.id, connectorPackageKey: instance.connector_package_key, capability, requestedKey, result: testResult };
      } catch (error) {
        const message = String(error?.message || "Connector test failed").slice(0, 500);
        await db(
          `UPDATE integration_connections
              SET connection_status='ERROR',last_error=$1,last_test_at=NOW(),
                  last_test_result=$2::jsonb,updated_at=NOW()
            WHERE id=$3 AND company_id=$4`,
          [message, JSON.stringify({ success: false, message, metadataDriven: true }), instance.id, tenantCompanyId]
        );
        return { success: false, status: "ERROR", code: error?.code || "TEST_FAILED", message, connectorInstanceId: instance.id, connectorPackageKey: instance.connector_package_key, capability, requestedKey };
      }
    }
    if (!driver) return { success: false, code: "PROVIDER_NOT_SUPPORTED", message: "Connector app has no runtime driver", connectorInstanceId: instance.id };

    const manifest = effectiveManifest(instance.connector_package_key, instance.manifest);
    if (requestedKey === "CONNECTOR_ENABLE" || requestedKey === "CONNECTOR_DISABLE") {
      if (requestedKey === "CONNECTOR_ENABLE") {
        const lastTest = typeof instance.last_test_result === "string" ? JSON.parse(instance.last_test_result || "{}") : (instance.last_test_result || {});
        const companyScoped = manifest?.connectorApp?.scope === "company";
        if ((!companyScoped && !instance.till_id) || lastTest?.success !== true) {
          return { success: false, code: "TEST_REQUIRED", message: companyScoped ? "Successfully test this connector before enabling it" : "Assign and successfully test this connector before enabling it", connectorInstanceId: instance.id };
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

    const capabilities = (manifest?.connectorApp?.capabilities || [])
      .map((item) => typeof item === "string" ? item : item?.key)
      .filter((key) => key && driver.capabilities.has(key));
    const { ConnectorService } = await import("./connectorRuntime.js");
    const { decryptCredentials } = await import("./integrationCredentials.js");
    const service = new ConnectorService({
      connectorKey: instance.connector_package_key,
      capabilities,
      adapter: driver.createAdapter({
        instanceId: instance.id,
        configuration: {
          ...(typeof instance.connector_configuration === "string" ? JSON.parse(instance.connector_configuration || "{}") : (instance.connector_configuration || {})),
          ...(() => { try { return decryptCredentials(instance.credentials_encrypted) || {}; } catch { return {}; } })(),
        },
        companyId: instance.company_id,
        storeId: instance.store_id,
        tillId: instance.till_id,
      }),
    });
    if (!["CONNECTOR_TEST_CONNECTION","CONNECTOR_ENABLE","CONNECTOR_DISABLE"].includes(requestedKey)) {
      if (instance.enabled !== true) {
        return { success: false, code: "CONNECTOR_DISABLED", message: "The assigned connector instance is disabled", connectorInstanceId: instance.id };
      }
      if (tenantStoreId && instance.store_id && String(instance.store_id) !== String(tenantStoreId)) {
        return { success: false, code: "INVALID_SCOPE", message: "The assigned connector belongs to a different store", connectorInstanceId: instance.id };
      }
      const declaredCapability = (manifest?.connectorApp?.capabilities || []).some((item) =>
        (typeof item === "string" ? item : item?.key) === capability
      );
      if (!declaredCapability || !driver.capabilities.has(capability)) {
        return { success: false, code: "NOT_SUPPORTED", message: `The assigned connector does not provide ${capability}`, connectorInstanceId: instance.id };
      }
    }

    const connection = await service.connect();
    await db(
      `UPDATE integration_connections
          SET connection_status=$1::varchar,last_error=$2,
              last_connected_at=CASE WHEN $1::varchar='CONNECTED' THEN NOW() ELSE last_connected_at END,
              updated_at=NOW()
        WHERE id=$3 AND company_id=$4`,
      [connection.state, connection.lastError || null, instance.id, tenantCompanyId]
    );

    if (requestedKey === "CONNECTOR_TEST_CONNECTION") {
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

    if (!connection.healthy) {
      return {
        success: false,
        code: connection.errorCode || "DEVICE_OFFLINE",
        message: connection.lastError || "The assigned connector is unavailable",
        connectorInstanceId: instance.id,
        connectorPackageKey: instance.connector_package_key,
        capability,
        requestedKey,
      };
    }

    try {
      const result = await service.execute(capability, runtimePayload);
      return {
        success: true,
        status: result?.status || "COMPLETED",
        result,
        connectorInstanceId: instance.id,
        connectorPackageKey: instance.connector_package_key,
        capability,
        requestedKey,
      };
    } catch (error) {
      return {
        success: false,
        code: error?.code || "CONNECTOR_ACTION_FAILED",
        message: error?.message || "Connector action failed",
        connectorInstanceId: instance.id,
        connectorPackageKey: instance.connector_package_key,
        capability,
        requestedKey,
      };
    }
  }

  if (!tenantStoreId || !tenantTillId) {
    return { success: false, code: "INVALID_SCOPE", message: "Connector workflow action requires a store and till scope" };
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

function resolveCommunicationWorkflowAction(action, record, object = null, workflowVariables = null, req = null, previousRecord = null) {
  const context = { record, previousRecord, req, object, workflowVariables };
  const resolveRecipient = (value) => {
    const resolved = resolveConfiguredResource(value, context);
    return resolved == null || resolved === "" ? value : resolved;
  };
  return {
    ...action,
    recipient: resolveRecipient(action?.recipient),
    to: resolveRecipient(action?.to),
    templateContext: action?.templateContext
      ? resolveBindingTree(action.templateContext, workflowBindingContext(context))
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
    `UPDATE platform_workflow_step_runs
        SET status=$1::varchar,
            completed_at=CASE WHEN UPPER($1::varchar) IN ('PENDING','RUNNING','WAITING') THEN NULL ELSE COALESCE(completed_at, NOW()) END,
            error_text=$2,
            error_code=COALESCE(($3::jsonb->'error'->>'oeCode'), error_code),
            metadata=COALESCE(metadata,'{}'::jsonb) || $3::jsonb,
            updated_at=NOW()
      WHERE id=$4 RETURNING *`,
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
    `SELECT r.id, r.relationship_key, r.relationship_type, r.parent_object_id, r.child_object_id, r.child_field_id,
            p.object_key AS parent_object_key,
            c.object_key AS child_object_key, c.source_table AS child_source_table,
            c.company_id AS child_company_id, c.label AS child_label,
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

async function executeLicenceRequestPackageAction({ db, action, req, companyId, userId, pool, writeAudit, record = null, recordId = null }) {
  let packageKey = String(action?.packageKey || action?.package_key || "").trim();
  if (!packageKey && (record?.id || recordId)) {
    const tenantApp = await db(
      `SELECT osa.app_key
         FROM tenant_apps ta
         JOIN onestore_apps osa ON osa.id=ta.onestore_app_id
        WHERE ta.id=$1 AND ta.company_id=$2
        LIMIT 1`,
      [record?.id || recordId, companyId || req?.user?.companyId]
    );
    packageKey = String(tenantApp.rows[0]?.app_key || "").trim();
  }
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
      { type: "SEND_COMMUNICATION", channel: "IN_APP", recipient: "platform_superadmins", title: "Licence request received", message: `${packageRow.company_name} requested licence for ${packageRow.name}` },
      { type: "SEND_COMMUNICATION", channel: "EMAIL", recipient: "platform_superadmins", templateId, templateContext: {
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

async function resolveEmailWorkflowAction({
  db,
  companyId,
  action,
  record,
  previousRecord,
  object,
  workflowVariables,
  req,
}) {
  const context = { record, previousRecord, req, object, workflowVariables };
  const resolved = resolveCommunicationWorkflowAction(
    action,
    record,
    object,
    workflowVariables,
    req,
    previousRecord
  );
  const resolveValue = (value) => {
    if (value === undefined || value === null || value === "") return value;
    const candidate = resolveConfiguredResource(value, context, { preserveMissing: true });
    return candidate === undefined ? value : candidate;
  };

  resolved.subject = resolveValue(action?.subject);
  const configuredBody = action?.body ?? action?.text ?? action?.message;
  if (configuredBody !== undefined) {
    const body = resolveValue(configuredBody);
    resolved.body = body;
    resolved.text = body;
    resolved.message = body;
  }
  if (action?.html !== undefined) resolved.html = resolveValue(action.html);

  const templateRef = action?.templateId || action?.template || null;
  const contentMode = String(action?.contentMode || (templateRef ? "TEMPLATE" : "CUSTOM")).toUpperCase();
  if (contentMode === "TEMPLATE" && templateRef) {
    const templateResult = await db(
      `SELECT id,api_key,subject,body
         FROM platform_message_templates
        WHERE active=TRUE
          AND channel='EMAIL'
          AND (company_id=$1 OR company_id IS NULL)
          AND (id::text=$2 OR api_key=$2)
        ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [companyId, String(templateRef)]
    );
    const template = templateResult.rows[0];
    if (!template) {
      throw Object.assign(new Error("Selected email template is unavailable"), { code: "TEMPLATE_NOT_FOUND", retryable: false });
    }
    const templateContext = resolved.templateContext && typeof resolved.templateContext === "object"
      ? resolved.templateContext
      : (record || {});
    resolved.subject = renderMessageTemplate(template.subject || "", templateContext);
    resolved.text = renderMessageTemplate(template.body || "", templateContext);
    resolved.body = resolved.text;
    resolved.message = resolved.text;
    resolved.templateId = template.id;
    resolved.template = template.api_key || resolved.template;
  }

  if (!String(resolved.subject || "").trim()) {
    throw Object.assign(new Error("Email subject is required"), { code: "INVALID_SUBJECT", retryable: false });
  }
  if (!String(resolved.text || resolved.body || resolved.message || resolved.html || "").trim()) {
    throw Object.assign(new Error("Email message body is required"), { code: "INVALID_MESSAGE", retryable: false });
  }
  return resolved;
}

async function executeProviderSpecificEmail({
  packageKey,
  actionKey,
  db,
  action,
  req,
  companyId,
  stepRunId,
  record,
  previousRecord,
  object,
  workflowVariables,
  connectorDrivers,
  writeAudit,
}) {
  const company = companyId || req?.user?.companyId;
  if (!company) return { status: "failed", provider: packageKey, error: "Company scope is required" };
  const connection = await db(
    `SELECT c.id
       FROM integration_connections c
       JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
       JOIN company_package_installations i ON i.package_id=p.id AND i.company_id=c.company_id
        AND i.status='active' AND i.suspended_by_entitlement=FALSE
      WHERE c.company_id=$1
        AND c.connector_package_key=$2
        AND c.enabled=TRUE
        AND UPPER(COALESCE(c.connection_status,''))='CONNECTED'
        AND COALESCE((c.last_test_result->>'success')::boolean,FALSE)=TRUE
      ORDER BY c.fallback_order ASC,c.updated_at DESC
      LIMIT 1`,
    [company, packageKey]
  );
  const connectorInstanceId = connection.rows[0]?.id || null;
  if (!connectorInstanceId) {
    return {
      status: "failed",
      provider: packageKey,
      error: `${packageKey === "brevo_connector" ? "Brevo" : "Mailjet"} connector is not configured, tested and enabled`,
    };
  }
  const resolvedAction = await resolveEmailWorkflowAction({
    db,
    companyId: company,
    action,
    record,
    previousRecord,
    object,
    workflowVariables,
    req,
  });
  const execution = await executeConnectorWorkflowAction({
    action: {
      ...resolvedAction,
      key: actionKey,
      capability: "email.send",
      connectorInstanceId,
    },
    payload: resolvedAction,
    db,
    companyId: company,
    connectorDrivers,
    req,
    writeAudit,
    actorUserId: req?.user?.id || null,
  });
  if (!execution.success) {
    return {
      status: "failed",
      provider: packageKey,
      error: execution.message || execution.code || "Email connector failed",
      connectorInstanceId,
    };
  }
  return {
    status: "sent",
    provider: packageKey,
    connectorInstanceId,
    providerMessageId: execution.result?.providerMessageId || null,
    result: execution.result || null,
    stepRunId: stepRunId || null,
  };
}


function validateGetRecordsCustomLogic(logic, conditionCount, context = "Get Records") {
  const value = String(logic || "").trim();
  if (!value) return;
  const remainder = value.replace(/\bAND\b|\bOR\b|\d+|[()\s]/gi, "");
  if (remainder) throw new Error(context + " custom condition logic is invalid");
  const indexes = value.match(/\d+/g) || [];
  if (!indexes.length || indexes.some((item) => Number(item) < 1 || Number(item) > conditionCount)) {
    throw new Error(context + " custom condition logic references an unavailable condition");
  }
}

function compileGetRecordsCustomLogic(logic, clauses, context = "Get Records") {
  const value = String(logic || "").trim();
  if (!value) return "";
  validateGetRecordsCustomLogic(value, clauses.length, context);
  const tokens = value.match(/\d+|AND|OR|\(|\)/gi) || [];
  let cursor = 0;
  const parseFactor = () => {
    const token = tokens[cursor++];
    if (token === "(") {
      const inner = parseOr();
      if (tokens[cursor++] !== ")") throw new Error(context + " custom condition logic has unmatched parentheses");
      return "(" + inner + ")";
    }
    if (!/^\d+$/.test(String(token || ""))) throw new Error(context + " custom condition logic is invalid");
    const index = Number(token) - 1;
    if (index < 0 || index >= clauses.length) throw new Error(context + " custom condition logic references an unavailable condition");
    return "(" + clauses[index] + ")";
  };
  const parseAnd = () => {
    let result = parseFactor();
    while (String(tokens[cursor] || "").toUpperCase() === "AND") { cursor += 1; result += " AND " + parseFactor(); }
    return result;
  };
  const parseOr = () => {
    let result = parseAnd();
    while (String(tokens[cursor] || "").toUpperCase() === "OR") { cursor += 1; result += " OR " + parseAnd(); }
    return result;
  };
  const compiled = parseOr();
  if (cursor !== tokens.length) throw new Error(context + " custom condition logic is invalid");
  return compiled;
}

function validateRelatedGetRecordsConfig(relatedRecords) {
  if (relatedRecords === undefined) return;
  if (!Array.isArray(relatedRecords)) throw new Error("Get Records related records must be a list");
  for (const related of relatedRecords) {
    const label = 'Get Records related object "' + (related?.objectKey || related?.relationshipKey || "unknown") + '"';
    if (!related?.relationshipKey || !related?.objectKey) throw new Error(label + " requires relationship and object metadata");
    if (related.filters !== undefined && !Array.isArray(related.filters)) throw new Error(label + " filters must be a list");
    if (related.match && !["all", "any"].includes(String(related.match).toLowerCase())) throw new Error(label + " match must be all or any");
    if (related.sortDirection && !["asc", "desc"].includes(String(related.sortDirection).toLowerCase())) throw new Error(label + " sort direction must be ascending or descending");
    if (related.fieldSelection && !["auto", "choose"].includes(String(related.fieldSelection).toLowerCase())) throw new Error(label + " field selection mode is invalid");
    if (related.selectedFields !== undefined && !Array.isArray(related.selectedFields)) throw new Error(label + " selected fields must be a list");
    const limit = Number(related.limit || 20000);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20000) throw new Error(label + " limit must be between 1 and 20000");
    validateGetRecordsCustomLogic(related.customConditionLogic, Array.isArray(related.filters) ? related.filters.length : 0, label);
  }
}

async function loadRelatedGetRecordsCollections({ db, relatedRecords, targetObject, rows, req, companyId, record, previousRecord, object, workflowVariables }) {
  const configs = Array.isArray(relatedRecords) ? relatedRecords : [];
  if (!configs.length || !rows.length) return {};
  const runtimeCompanyId = req?.user?.companyId || companyId;
  const parentIds = rows.map((row) => row?.id).filter((id) => id != null).map(String);
  if (!parentIds.length) return {};
  const collections = {};

  for (const related of configs) {
    const relationResult = await db(
      `SELECT r.id,r.relationship_key,r.child_object_id,r.child_field_id,
              child.object_key AS child_object_key,child.label AS child_object_label,
              child.source_table AS child_source_table,child.company_id AS child_company_id,
              child.company_scoped AS child_company_scoped,child.store_scoped AS child_store_scoped,
              link.api_name AS child_field_api_name,link.source_column AS child_field_source_column
         FROM platform_relationships r
         JOIN platform_objects child ON child.id=r.child_object_id AND child.active=true
         JOIN platform_fields link ON link.id=r.child_field_id AND link.active=true
        WHERE r.parent_object_id=$1 AND r.active=true
          AND (r.relationship_key=$2 OR r.id::text=$3)
          AND (child.company_id IS NULL OR child.company_id=$4)
        LIMIT 1`,
      [targetObject.id, String(related.relationshipKey), String(related.relationshipId || ""), runtimeCompanyId]
    );
    const relation = relationResult.rows[0];
    if (!relation || String(relation.child_object_key) !== String(related.objectKey)) {
      throw new Error('Get Records related object "' + related.objectKey + '" is not available from ' + targetObject.object_key);
    }

    const childObject = {
      id: relation.child_object_id, object_key: relation.child_object_key, label: relation.child_object_label,
      source_table: relation.child_source_table, company_id: relation.child_company_id,
      company_scoped: relation.child_company_scoped, store_scoped: relation.child_store_scoped,
    };
    if (!isSafeIdentifier(childObject.source_table) || !isSafeIdentifier(relation.child_field_source_column)) {
      throw new Error('Get Records related object "' + related.objectKey + '" has unavailable metadata');
    }
    if (req?.user) await assertSpecificWorkflowObjectPermission({ db, req, companyId: runtimeCompanyId }, childObject, "view");

    const fieldResult = await db(
      "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
      [childObject.id, runtimeCompanyId]
    );
    const secured = req?.user ? await applyFieldSecurity(db, fieldResult.rows || [], req) : (fieldResult.rows || []);
    const fields = secured.filter((field) => field.readable !== false && isSafeIdentifier(field.source_column || ""));
    const fieldByKey = new Map([["id", { api_name: "id", source_column: "id" }]]);
    for (const field of fields) {
      fieldByKey.set(String(field.api_name), field);
      if (field.source_column) fieldByKey.set(String(field.source_column), field);
    }

    const params = [parentIds];
    const clauses = ['"' + relation.child_field_source_column + '"::text = ANY($1::text[])'];
    if (childObject.company_scoped) { params.push(runtimeCompanyId || null); clauses.push('"company_id"=$' + params.length); }
    if (childObject.store_scoped && req?.user?.storeId) { params.push(req.user.storeId); clauses.push('"store_id"=$' + params.length); }

    const filterClauses = [];
    for (const filter of Array.isArray(related.filters) ? related.filters : []) {
      const metadata = fieldByKey.get(String(filter?.field || ""));
      if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error('Get Records related filter field "' + (filter?.field || "") + '" is unavailable');
      const column = '"' + (metadata.source_column || metadata.api_name) + '"';
      const operator = String(filter?.operator || "equals").toLowerCase();
      const value = resolveConfiguredResource(filter?.value, { record, previousRecord, req, object, workflowVariables });
      if (operator === "is_empty" || operator === "is_null") {
        const shouldBeNull = filter?.value === undefined ? true : Boolean(value);
        filterClauses.push(shouldBeNull ? "(" + column + " IS NULL OR " + column + "::text=\'\')" : "(" + column + " IS NOT NULL AND " + column + "::text<>\'\')");
        continue;
      }
      if (operator === "in" || operator === "not_in") {
        if (!Array.isArray(value)) throw new Error("Get Records related " + (operator === "in" ? "In" : "Not In") + " operator requires a collection resource");
        params.push(value.map((item) => item == null ? "" : String(item)));
        const placeholder = "$" + params.length;
        filterClauses.push(operator === "in" ? column + "::text = ANY(" + placeholder + "::text[])" : "NOT (" + column + "::text = ANY(" + placeholder + "::text[]))");
        continue;
      }
      params.push(value);
      const placeholder = "$" + params.length;
      if (operator === "equals") filterClauses.push(column + "=" + placeholder);
      else if (operator === "not_equals") filterClauses.push(column + "<>" + placeholder);
      else if (operator === "greater_than") filterClauses.push(column + ">" + placeholder);
      else if (operator === "greater_than_or_equal") filterClauses.push(column + ">=" + placeholder);
      else if (operator === "less_than") filterClauses.push(column + "<" + placeholder);
      else if (operator === "less_than_or_equal") filterClauses.push(column + "<=" + placeholder);
      else if (operator === "contains") filterClauses.push(column + "::text ILIKE \'%\' || " + placeholder + "::text || \'%\'");
      else if (operator === "starts_with") filterClauses.push(column + "::text ILIKE " + placeholder + "::text || \'%\'");
      else if (operator === "ends_with") filterClauses.push(column + "::text ILIKE \'%\' || " + placeholder + "::text");
      else throw new Error('Get Records related records use unsupported operator "' + operator + '"');
    }
    if (filterClauses.length) {
      const custom = compileGetRecordsCustomLogic(related.customConditionLogic, filterClauses, 'Get Records related object "' + related.objectKey + '"');
      clauses.push("(" + (custom || filterClauses.join(String(related.match || "all").toLowerCase() === "any" ? " OR " : " AND ")) + ")");
    }

    let orderBy = "";
    if (related.sortField) {
      const metadata = fieldByKey.get(String(related.sortField));
      if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error('Get Records related sort field "' + related.sortField + '" is unavailable');
      orderBy = ' ORDER BY "' + (metadata.source_column || metadata.api_name) + '" ' + (String(related.sortDirection || "asc").toLowerCase() === "desc" ? "DESC" : "ASC");
    }

    const fieldSelection = String(related.fieldSelection || "auto").toLowerCase();
    let selectedMetadata = fields;
    if (fieldSelection === "choose") {
      selectedMetadata = [...new Set((related.selectedFields || []).map(String))].map((key) => {
        const metadata = fieldByKey.get(key);
        if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error('Get Records related selected field "' + key + '" is unavailable');
        return metadata;
      });
    }
    const selectColumns = ["id", '"' + relation.child_field_source_column + '"::text AS "__parent_id"'];
    const seen = new Set(["id", relation.child_field_source_column]);
    for (const field of selectedMetadata) {
      const source = String(field.source_column || field.api_name || "");
      if (!source || seen.has(source)) continue;
      seen.add(source);
      selectColumns.push('"' + source + '" AS "' + field.api_name + '"');
    }

    const perParentLimit = Math.max(1, Math.min(Number(related.limit || 20000), 20000));
    params.push(perParentLimit);
    const perParentLimitPlaceholder = "$" + params.length;
    const rowOrder = related.sortField
      ? orderBy.replace(/^ ORDER BY /, "")
      : '"id" ASC';
    const innerQuery = 'SELECT ' + selectColumns.join(", ")
      + ', ROW_NUMBER() OVER (PARTITION BY "' + relation.child_field_source_column + '" ORDER BY ' + rowOrder + ') AS "__row_num"'
      + ' FROM "' + childObject.source_table + '" WHERE ' + clauses.join(" AND ");
    const query = 'SELECT * FROM (' + innerQuery + ') AS ranked WHERE "__row_num" <= '
      + perParentLimitPlaceholder + ' ORDER BY "__parent_id", "__row_num"';
    const result = await db(query, params);
    const byParent = new Map();
    for (const raw of result.rows || []) {
      const parentId = String(raw.__parent_id ?? "");
      const clean = { ...raw };
      delete clean.__parent_id;
      delete clean.__row_num;
      const bucket = byParent.get(parentId) || [];
      bucket.push(clean);
      byParent.set(parentId, bucket);
    }

    const flattened = [];
    for (const rootRow of rows) {
      const childRows = byParent.get(String(rootRow.id)) || [];
      rootRow[String(related.relationshipKey)] = childRows;
      flattened.push(...childRows);
    }
    collections[String(related.relationshipKey)] = flattened;
  }

  return collections;
}
export const WORKFLOW_ACTION_REGISTRY = Object.freeze([
  ...GENERIC_CONNECTOR_ACTIONS,
  {
    key: "PACKAGE_LIFECYCLE",
    displayName: "Package - Apply Lifecycle",
    description: "Apply the technical install, activate, deactivate, uninstall or upgrade operation for the current Tenant App record.",
    validation: (action) => {
      const operation = String(action?.operation || "").toUpperCase();
      if (!["INSTALL","ACTIVATE","DEACTIVATE","UNINSTALL","UPGRADE","TRIAL"].includes(operation)) {
        throw new Error("Package lifecycle action requires a supported operation");
      }
    },
    async: true,
    requiredPermissions: ["package.install"],
    executor: async ({ action, db, req, companyId, userId, record, recordId }) =>
      applyPackageLifecycle({
        db,
        companyId: companyId || req?.user?.companyId,
        userId: userId || req?.user?.id || null,
        tenantAppId: record?.id || recordId,
        operation: action.operation,
      }),
  },  {
    key: "LICENCE_REQUEST_PACKAGE",
    displayName: "Licence - Request Package",
    description: "Create a pending package licence request and run its configured workflow.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["package.manage"],
    executor: (context) => executeLicenceRequestPackageAction(context),
  },
  {
    key: "GLOBAL_PRODUCT_LOOKUP_BARCODE",
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
    displayName: "Global Product - Lookup Barcode",
    description: "Resolve an external barcode using enabled, installed product lookup providers in configured priority order.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["global_product.view"],
    executor: (context) => executeGlobalProductLookupAction(context),
  },
  {
    key: "GO_UPC_LOOKUP_PRODUCT",
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
    displayName: "Go-UPC - Lookup Product",
    description: "Look up a barcode using the installed Go-UPC connector and company credential.",
    validation: () => undefined,
    async: true,
    requiredPermissions: ["global_product.view"],
    executor: (context) => executeGlobalProductLookupAction(context, "go_upc"),
  },
  {
    key: "SEND_PASSWORD_RESET_EMAIL",
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
        payload: { recipient, to: recipient, templateKey: "PASSWORD_RESET", variables: { token, userId: user.id, expiresMinutes: user.password_reset_expiry_minutes || 60 }, _roleId: req?.user?.roleId, _stepRunId: stepRunId },
        idempotencyKey: `${company}:password-reset:${user.id}:${stepRunId || Date.now()}`,
      });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null, expiresMinutes: user.password_reset_expiry_minutes || 60 };
    },
  },
  {
    key: "SEND_USER_INVITATION",
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
          _roleId: req?.user?.roleId,
          _stepRunId: stepRunId,
        },
        idempotencyKey: `${company}:user-invite:${user.id}:${stepRunId || Date.now()}`,
      });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null, expiresMinutes: user.registration_link_expiry_minutes || 1440 };
    },
  },
  {
    key: "CALL_CONNECTOR_CAPABILITY",
    displayName: "Call Connector Capability",
    description: "Resolve an enabled tenant/store/till connector by package and capability, then execute it without provider-specific workflow code.",
    schema: {
      type: "object",
      properties: {
        packageKey: { type: ["string","object"] },
        capability: { type: ["string","object"] },
        input: { type: "object" },
      },
      required: ["capability"],
    },
    validation: (action) => {
      if (action?.packageKey != null && typeof action.packageKey !== "string" && typeof action.packageKey !== "object") {
        throw new Error("Call Connector Capability packageKey must be text or a resource binding");
      }
      if (typeof action?.capability !== "string" && typeof action?.capability !== "object") {
        throw new Error("Call Connector Capability requires a capability key or resource binding");
      }
      if (action.input !== undefined && (!action.input || typeof action.input !== "object" || Array.isArray(action.input))) {
        throw new Error("Call Connector Capability input must be an object");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId, req, storeId, tillId, connectorDrivers, writeAudit, workflowVariables, record, object, actorUserId }) => {
      const context = { workflowVariables, record, object, req };
      const packageKeyRaw = action.packageKey == null ? null : resolveConfiguredResource(action.packageKey, context, { preserveMissing: false });
      const capabilityRaw = resolveConfiguredResource(action.capability, context, { preserveMissing: false });
      const input = resolveFieldValueMap(action.input || {}, context) || {};
      const packageKey = packageKeyRaw == null || packageKeyRaw === "" ? null : String(packageKeyRaw);
      const capabilityKey = String(capabilityRaw || "").trim();
      if (!capabilityKey || !/^[a-zA-Z0-9_.-]{1,100}$/.test(capabilityKey)) {
        throw new Error("Call Connector Capability resolved an invalid capability key");
      }
      const result = await resolvePersistedConnectorCapability({
        db,
        drivers: connectorDrivers,
        companyId: companyId || req?.user?.companyId,
        storeId: storeId || req?.user?.storeId || null,
        tillId: tillId || req?.user?.tillId || null,
        capabilityKey,
        packageKey,
        selfCheckout: input.selfCheckout === true,
        payload: input,
        writeAudit,
        actorUserId: actorUserId || req?.user?.id || null,
      });
      return { status: "completed", ...result };
    },
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
            Array.isArray(req?.user?.permissions) && req.user.permissions.includes("oneengine.manage"),
          actorUserId: req?.user?.id || null,
        })),
      };
    },
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
    requiredPermissions: ["workflow.execute"],
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
    key: "CONSTANT",
    displayName: "Constant",
    description: "Expose a typed fixed value as a reusable workflow resource.",
    schema: {
      type: "object",
      properties: {
        resourceName: { type: "string" },
        resourceType: { type: "string", enum: ["text","number","boolean","date","datetime"] },
        value: { type: "string" },
      },
      required: ["resourceName","resourceType"],
    },
    validation: (action) => {
      if (!action?.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.resourceName))) {
        throw new Error("Constant requires a valid resource name");
      }
      if (!["text","number","boolean","date","datetime"].includes(String(action.resourceType || ""))) {
        throw new Error("Constant requires a supported resource type");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const name = String(action.resourceName);
      const type = String(action.resourceType || "text");
      let value = action.value;
      if (type === "number") {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Constant "${name}" requires a numeric value`);
        value = numeric;
      } else if (type === "boolean") {
        if (typeof value !== "boolean") value = String(value).toLowerCase() === "true";
      }
      workflowVariables.variables[name] = value;
      return { status: "completed", resourceName: name, resourceType: type, value };
    },
  },
  {
    key: "FORMULA",
    displayName: "Formula",
    description: "Calculate a reusable workflow resource with the safe formula engine.",
    schema: {
      type: "object",
      properties: {
        resourceName: { type: "string" },
        resultType: { type: "string", enum: ["text","number","boolean","date","datetime"] },
        expression: { type: "string" },
        inputs: { type: "object" },
      },
      required: ["resourceName","resultType","expression","inputs"],
    },
    validation: (action) => {
      if (!action?.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.resourceName))) {
        throw new Error("Formula requires a valid resource name");
      }
      if (!["text","number","boolean","date","datetime"].includes(String(action.resultType || ""))) {
        throw new Error("Formula requires a supported result type");
      }
      if (typeof action.expression !== "string" || !action.expression.trim()) throw new Error("Formula requires an expression");
      if (!action.inputs || typeof action.inputs !== "object" || Array.isArray(action.inputs)) throw new Error("Formula requires named inputs");
      const inputNames = new Set(Object.keys(action.inputs));
      for (const name of inputNames) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name)) throw new Error(`Formula input "${name}" is invalid`);
      }
      const missing = workflowFormulaReferences(action.expression).filter((name) => !inputNames.has(name));
      if (missing.length) throw new Error(`Formula is missing mapped inputs: ${missing.join(", ")}`);
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const resolvedInputs = Object.fromEntries(Object.entries(action.inputs || {}).map(([name, binding]) => [
        name,
        resolveConfiguredResource(binding, { record, previousRecord, req, object, workflowVariables }),
      ]));
      let value = evaluateWorkflowFormula(action.expression, resolvedInputs);
      if (action.resultType === "number" && value != null) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error(`Formula "${action.resourceName}" did not return a number`);
        value = numeric;
      }
      if (action.resultType === "boolean" && value != null && typeof value !== "boolean") {
        throw new Error(`Formula "${action.resourceName}" did not return a boolean`);
      }
      if (action.resultType === "text" && value != null) value = String(value);
      workflowVariables.variables[String(action.resourceName)] = value;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: String(action.resultType), value, inputs: resolvedInputs };
    },
  },
  {
    key: "TEXT_TEMPLATE",
    displayName: "Text Template",
    description: "Build reusable text with Flow merge resources.",
    schema: {
      type: "object",
      properties: {
        resourceName: { type: "string" },
        templateText: { type: "string" },
      },
      required: ["resourceName","templateText"],
    },
    validation: (action) => {
      if (!action?.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.resourceName))) {
        throw new Error("Text Template requires a valid resource name");
      }
      if (!String(action.templateText || "").trim()) throw new Error("Text Template requires body text");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const value = String(action.templateText || "").replace(/\{!([^}]+)\}/g, (match, rawPath) => {
        const path = String(rawPath || "").trim()
          .replace(/^\$Record__Prior(?=\.|$)/, "$previous")
          .replace(/^\$Record(?=\.|$)/, "$record")
          .replace(/^\$User(?=\.|$)/, "$user")
          .replace(/^\$Flow\.CurrentDateTime$/, "$now");
        const resolved = resolveConfiguredResource(path, context, { preserveMissing: false });
        return resolved == null ? "" : String(resolved);
      });
      workflowVariables.variables[String(action.resourceName)] = value;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "text", value };
    },
  },
  {
    key: "INSTRUCTION_TEMPLATE",
    displayName: "Instruction Template",
    description: "Build reusable provider-neutral AI or automation instructions from named Flow inputs.",
    schema: {
      type: "object",
      properties: {
        resourceName: { type: "string" },
        instructionText: { type: "string" },
        instructionInputs: { type: "object" },
      },
      required: ["resourceName","instructionText"],
    },
    validation: (action) => {
      if (!action?.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.resourceName))) {
        throw new Error("Instruction Template requires a valid resource name");
      }
      if (!String(action.instructionText || "").trim()) throw new Error("Instruction Template requires instructions");
      if (action.instructionInputs && (typeof action.instructionInputs !== "object" || Array.isArray(action.instructionInputs))) {
        throw new Error("Instruction Template inputs must be a named mapping");
      }
      for (const name of Object.keys(action.instructionInputs || {})) {
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name)) throw new Error(`Instruction input "${name}" is invalid`);
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const resolvedInputs = Object.fromEntries(Object.entries(action.instructionInputs || {}).map(([name, binding]) => [
        name,
        resolveConfiguredResource(binding, context, { preserveMissing: false }),
      ]));
      const value = String(action.instructionText || "").replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, name) => {
        if (!Object.prototype.hasOwnProperty.call(resolvedInputs, name)) return "";
        const resolved = resolvedInputs[name];
        if (resolved == null) return "";
        return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
      });
      workflowVariables.variables[String(action.resourceName)] = value;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "text", value, inputs: resolvedInputs };
    },
  },

  {
    key: "COLLECTION_FILTER",
    displayName: "Collection Filter",
    description: "Filter a collection into a new collection using conditions or a boolean formula.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        filters: { type: "array" },
        match: { type: "string", enum: ["all","any"] },
        customConditionLogic: { type: "string" },
        formula: { type: "string" },
        mode: { type: "string", enum: ["all","any","custom","formula"] },
        outputVariable: { type: "string" },
        currentItemVariable: { type: "string" },
      },
      required: ["collection"],
    },
    validation: (action) => {
      if (!action?.collection) throw new Error("Collection Filter requires a collection");
      const mode = String(action?.mode || action?.match || "all").toLowerCase();
      if (mode === "formula") {
        if (!String(action?.formula || "").trim()) throw new Error("Collection Filter formula is required");
      } else {
        if (!Array.isArray(action.filters) || !action.filters.length) throw new Error("Collection Filter requires at least one condition");
        if (mode === "custom" && !String(action.customConditionLogic || "").trim()) throw new Error("Collection Filter custom condition logic is required");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const source = resolveConfiguredResource(action.collection, context, { preserveMissing: false });
      const collection = Array.isArray(source) ? source : [];
      const getPath = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
      const compare = (left, operator, right) => {
        const ordered = (value) => {
          if (value == null || value === "") return NaN;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) return numeric;
          return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? Date.parse(value) : NaN;
        };
        switch (String(operator || "equals")) {
          case "equals": return left === right || String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
          case "not_equals": return !(left === right || String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase());
          case "greater_than": return ordered(left) > ordered(right);
          case "greater_than_or_equal": return ordered(left) >= ordered(right);
          case "less_than": return ordered(left) < ordered(right);
          case "less_than_or_equal": return ordered(left) <= ordered(right);
          case "contains": return Array.isArray(left)
            ? left.some((item) => String(item).toLowerCase() === String(right ?? "").toLowerCase())
            : String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
          case "is_empty": return left == null || left === "" || (Array.isArray(left) && left.length === 0);
          case "is_not_empty": return !(left == null || left === "" || (Array.isArray(left) && left.length === 0));
          default: return false;
        }
      };
      const filters = Array.isArray(action.filters) ? action.filters : [];
      const mode = String(action.mode || action.match || "all").toLowerCase();
      const customLogic = String(action.customConditionLogic || "").trim();
      const evaluateCustom = (results) => {
        if (!customLogic) return results.every(Boolean);
        const tokens = customLogic.match(/\d+|AND|OR|NOT|\(|\)/gi) || [];
        const normalized = tokens.map((token) => {
          if (/^\d+$/.test(token)) {
            const index = Number(token) - 1;
            if (index < 0 || index >= results.length) throw new Error("Collection Filter custom condition logic references an unavailable condition");
            return results[index] ? "true" : "false";
          }
          return token.toUpperCase() === "AND" ? "&&" : token.toUpperCase() === "OR" ? "||" : token.toUpperCase() === "NOT" ? "!" : token;
        }).join(" ");
        if (/[^truefals&|!()\s]/i.test(normalized)) throw new Error("Collection Filter custom condition logic is invalid");
        return Function('"use strict"; return Boolean(' + normalized + ')')();
      };
      const output = collection.filter((item) => {
        const itemContext = {
          ...context,
          record: item,
          workflowVariables: {
            ...workflowVariables,
            variables: {
              ...(workflowVariables.variables || {}),
              [String(action.currentItemVariable || "CurrentItem")]: item,
            },
          },
        };
        if (mode === "formula") {
          const formulaInputs = {
            ...(workflowVariables.variables || {}),
            ...Object.fromEntries(Object.entries(item || {})
              .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
              .map(([name, value]) => [`CurrentItem_${name}`, value])),
            CurrentItem: item,
            [String(action.currentItemVariable || "CurrentItem")]: item,
            record: item,
            variables: itemContext.workflowVariables.variables,
            steps: workflowVariables.steps || {},
          };
          return evaluateWorkflowFormula(String(action.formula || ""), formulaInputs) === true;
        }
        const results = filters.map((filter) => {
          const left = filter?.field ? getPath(item, filter.field) : item;
          const right = ["is_empty","is_not_empty"].includes(filter?.operator)
            ? undefined
            : resolveConfiguredResource(filter?.value, itemContext, { preserveMissing: false });
          return compare(left, filter?.operator, right);
        });
        if (mode === "any") return results.some(Boolean);
        if (mode === "custom") return evaluateCustom(results);
        return results.every(Boolean);
      });
      const outputVariable = String(action.outputVariable || action.apiName || "").trim();
      if (outputVariable) workflowVariables.variables[outputVariable] = output;
      return {
        status: "completed",
        collection: output,
        count: output.length,
        outputVariable: outputVariable || null,
        currentItemVariable: action.currentItemVariable || null,
      };
    },
  },
  {
    key: "COLLECTION_SORT",
    displayName: "Collection Sort",
    description: "Sort a collection in place and optionally limit the remaining items.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        sortOptions: { type: "array" },
        sortField: { type: "string" },
        sortDirection: { type: "string", enum: ["asc","desc"] },
        nullsFirst: { type: "boolean" },
        limit: {},
      },
      required: ["collection"],
    },
    validation: (action) => {
      if (!action?.collection) throw new Error("Collection Sort requires a collection");
      const options = Array.isArray(action.sortOptions) && action.sortOptions.length
        ? action.sortOptions
        : [{ field: action.sortField || "", direction: action.sortDirection || "asc", nullsFirst: action.nullsFirst === true }];
      if (options.length > 3) throw new Error("Collection Sort supports up to 3 sort options");
      for (const option of options) {
        if (!["asc","desc"].includes(String(option?.direction || "asc").toLowerCase())) {
          throw new Error("Collection Sort sort order must be ascending or descending");
        }
      }
      if (action.limit != null && action.limit !== "") {
        const limit = Number(action.limit);
        if (!Number.isInteger(limit) || limit < 0) throw new Error("Collection Sort limit must be a non-negative integer");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const source = resolveConfiguredResource(action.collection, context, { preserveMissing: false });
      const collection = Array.isArray(source) ? source : [];
      const getPath = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
      const options = (Array.isArray(action.sortOptions) && action.sortOptions.length
        ? action.sortOptions
        : [{ field: action.sortField || "", direction: action.sortDirection || "asc", nullsFirst: action.nullsFirst === true }]
      ).slice(0, 3);
      const empty = (value) => value == null || value === "";
      const comparable = (value) => {
        if (typeof value === "boolean") return value ? 1 : 0;
        if (typeof value === "number") return value;
        if (value instanceof Date) return value.getTime();
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) {
          const stamp = Date.parse(value);
          if (Number.isFinite(stamp)) return stamp;
        }
        return value;
      };
      let output = [...collection].sort((leftItem, rightItem) => {
        for (const option of options) {
          const left = option?.field ? getPath(leftItem, option.field) : leftItem;
          const right = option?.field ? getPath(rightItem, option.field) : rightItem;
          const leftEmpty = empty(left);
          const rightEmpty = empty(right);
          if (leftEmpty || rightEmpty) {
            if (leftEmpty && rightEmpty) continue;
            const nullOrder = option?.nullsFirst === true ? -1 : 1;
            return leftEmpty ? nullOrder : -nullOrder;
          }
          const direction = String(option?.direction || "asc").toLowerCase() === "desc" ? -1 : 1;
          const a = comparable(left);
          const b = comparable(right);
          let compared = 0;
          if (typeof a === "number" && typeof b === "number") compared = a === b ? 0 : (a < b ? -1 : 1);
          else compared = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
          if (compared !== 0) return compared * direction;
        }
        return 0;
      });
      const limit = Number(action.limit || 0);
      if (Number.isInteger(limit) && limit > 0) output = output.slice(0, limit);

      const collectionPath = typeof action.collection === "string" ? action.collection : "";
      if (collectionPath.startsWith("variables.")) {
        const variableName = collectionPath.slice("variables.".length);
        if (variableName) workflowVariables.variables[variableName] = output;
      }

      return {
        status: "completed",
        collection: output,
        count: output.length,
        mutatedCollection: collectionPath || null,
        sortOptions: options,
      };
    },
  },
  {
    key: "TIME_WINDOW_EXPAND",
    displayName: "Time Window Expand",
    description: "Expand generic daily time windows into fixed-duration datetime intervals.",
    validation: (action) => {
      if (!action?.collection) throw new Error("Time Window Expand requires a collection");
      if (action?.date == null) throw new Error("Time Window Expand requires a date");
      if (action?.durationMinutes == null) throw new Error("Time Window Expand requires duration minutes");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      const context = { record, previousRecord, req, object, workflowVariables };
      const windows = resolveConfiguredResource(action.collection, context, { preserveMissing: false });
      if (!Array.isArray(windows)) throw new Error("Time Window Expand collection must resolve to a collection");
      const rawDate = resolveConfiguredResource(action.date, context, { preserveMissing: false });
      const text = String(rawDate || "").trim();
      const gb = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
      const normalized = gb ? (gb[3] + "-" + gb[2] + "-" + gb[1]) : text;
      const day = new Date(normalized.includes("T") ? normalized : normalized + "T00:00:00.000Z");
      if (Number.isNaN(day.getTime()) || day.toISOString().slice(0,10) !== normalized.slice(0,10)) throw new Error("Time Window Expand date is invalid");
      const duration = Number(resolveConfiguredResource(action.durationMinutes, context, { preserveMissing: false }));
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Time Window Expand duration must be greater than zero");
      const get = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
      const output = [];
      const max = Math.max(1, Math.min(Number(action.limit || 500), 5000));
      const days = Number(resolveConfiguredResource(action.days ?? 1, context));
      if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error("Time Window Expand days must be between 1 and 31");
      const firstDay = new Date(day);
      for (let offset = 0; offset < days && output.length < max; offset++) {
      day.setTime(firstDay.getTime() + offset * 86400000);
      for (const window of windows) {
        const weekday = get(window, action.weekdayField || "weekday");
        if (weekday != null && Number(weekday) !== day.getUTCDay()) continue;
        const startParts = String(get(window, action.startField || "start_time") || "").split(":").map(Number);
        const endParts = String(get(window, action.endField || "end_time") || "").split(":").map(Number);
        if (startParts.length < 2 || endParts.length < 2 || !startParts.slice(0,2).every(Number.isFinite) || !endParts.slice(0,2).every(Number.isFinite)) continue;
        const start = new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),startParts[0],startParts[1]||0));
        const end = new Date(Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate(),endParts[0],endParts[1]||0));
        const interval = Math.max(1, Number(get(window, action.intervalField || "slot_interval_minutes") || 15));
        for (let cursor=start; cursor.getTime()+duration*60000<=end.getTime() && output.length<max; cursor=new Date(cursor.getTime()+interval*60000)) {
          const slotEnd = new Date(cursor.getTime()+duration*60000);
          output.push({startsAt:cursor.toISOString(),endsAt:slotEnd.toISOString(),date:cursor.toISOString().slice(0,10),time:cursor.toISOString().slice(11,16)});
        }
        if (output.length>=max) break;
      }
      }
      return {status:"completed",collection:output,count:output.length};
    },
  },
  {
    key: "COLLECTION_EXCLUDE_OVERLAPS",
    displayName: "Collection Exclude Overlaps",
    description: "Remove candidate time intervals that overlap intervals in another collection.",
    validation: (action) => {
      if (!action?.collection) throw new Error("Collection Exclude Overlaps requires a candidate collection");
      if (!action?.busyCollection) throw new Error("Collection Exclude Overlaps requires a busy collection");
    },
    async:false,
    requiredPermissions:["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      const context={record,previousRecord,req,object,workflowVariables};
      const candidates=resolveConfiguredResource(action.collection,context,{preserveMissing:false});
      const busy=resolveConfiguredResource(action.busyCollection,context,{preserveMissing:false});
      if(!Array.isArray(candidates)||!Array.isArray(busy)) throw new Error("Collection Exclude Overlaps inputs must be collections");
      const get=(value,path)=>String(path||"").split(".").filter(Boolean).reduce((current,part)=>current==null?undefined:current?.[part],value);
      const collection=candidates.filter((candidate)=>{
        const start=new Date(get(candidate,action.candidateStartField||"startsAt"));
        const end=new Date(get(candidate,action.candidateEndField||"endsAt"));
        if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())) return false;
        return !busy.some((row)=>{
          const busyStart=new Date(get(row,action.busyStartField||"starts_at"));
          const busyEnd=new Date(get(row,action.busyEndField||"ends_at"));
          if(Number.isNaN(busyStart.getTime())||Number.isNaN(busyEnd.getTime())) return false;
          return start < busyEnd && end > busyStart;
        });
      });
      return {status:"completed",collection,count:collection.length};
    },
  },
  {
    key: "COLLECTION_DISTINCT", displayName: "Collection Distinct", description: "Keep the first row for each distinct field value in a collection.",
    validation: action => { if (!action.collection || !action.field) throw new Error("Collection Distinct requires a collection and field"); },
    async: false, requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      const rows = resolveConfiguredResource(action.collection, {record,previousRecord,req,object,workflowVariables});
      if (!Array.isArray(rows)) throw new Error("Collection Distinct input must be a collection");
      const seen = new Set(); const collection = [];
      const limit = Math.max(1,Math.min(Number(action.limit || 5000),5000));
      for (const row of rows) {
        const value = String(action.field).split('.').reduce((current,key)=>current?.[key],row);
        if (value == null) continue;
        const key = JSON.stringify(value);
        if (seen.has(key)) continue;
        seen.add(key); collection.push(row);
        if (collection.length >= limit) break;
      }
      return {status:"completed",collection,count:collection.length};
    },
  },
  {
    key: "COLLECTION_FORMAT_TEXT",
    displayName: "Collection Format Text",
    description: "Render collection rows into reusable numbered text using a generic line template.",
    validation:(action)=>{
      if(!action?.collection) throw new Error("Collection Format Text requires a collection");
      if(!String(action?.lineTemplate||"").trim()) throw new Error("Collection Format Text requires a line template");
    },
    async:false,
    requiredPermissions:["workflow.execute"],
    executor:async ({action,record,previousRecord,req,object,workflowVariables={}})=>{
      const context={record,previousRecord,req,object,workflowVariables};
      const source=resolveConfiguredResource(action.collection,context,{preserveMissing:false});
      if(!Array.isArray(source)) throw new Error("Collection Format Text input must be a collection");
      const get=(value,path)=>String(path||"").split(".").filter(Boolean).reduce((current,part)=>current==null?undefined:current?.[part],value);
      const startIndex=Number(action.startIndex||1);
      const limit=Math.max(0,Math.min(Number(action.limit||0),500));
      const rows=(limit?source.slice(0,limit):source).map((item,index)=>String(action.lineTemplate)
        .replace(/\{\{\s*index\s*\}\}/g,String(startIndex+index))
        .replace(/\{\{\s*item\.([A-Za-z_][A-Za-z0-9_.]*)\s*\}\}/g,(_,path)=>String(get(item,path)??"")));
      return {status:"completed",text:rows.join(action.separator==null?"\n":String(action.separator)),count:rows.length};
    },
  },
  {
    key: "TRANSFORM",
    displayName: "Transform",
    description: "Map, join, aggregate, and transform source data into a generated target resource without writing records.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        sources: { type: "array" },
        target: { type: "object" },
        joins: { type: "array" },
        transformMappings: { type: "object" },
        outputVariable: { type: "string" },
        outputValue: {},
      },
      required: ["transformMappings"],
    },
    validation: (action) => {
      const sources = Array.isArray(action?.sources) && action.sources.length ? action.sources : (action?.collection ? [action.collection] : []);
      if (!sources.length) throw new Error("Transform requires at least one source Resource");
      if (action.outputValue === undefined && (!action.transformMappings || typeof action.transformMappings !== "object" || !Object.keys(action.transformMappings).length)) throw new Error("Transform requires at least one mapping or output value");
      if (sources.length > 1) {
        if (!Array.isArray(action.joins) || !action.joins.length) throw new Error("Transform requires join keys when multiple source collections are used");
        for (const join of action.joins) {
          if (!join?.leftSource || !join?.rightSource || !join?.leftKey || !join?.rightKey) throw new Error("Transform join configuration is incomplete");
        }
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const sourcePaths = Array.isArray(action.sources) && action.sources.length ? action.sources : [action.collection].filter(Boolean);
      const sourceEntries = sourcePaths.map((path) => [path, resolveConfiguredResource(path, context, { preserveMissing: false })]);
      const getPath = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
      const assignPath = (target, path, value) => {
        const parts = String(path || "").split(".").filter(Boolean);
        if (!parts.length) return;
        let cursor = target;
        parts.forEach((part, index) => {
          if (index === parts.length - 1) cursor[part] = value;
          else cursor = cursor[part] ||= {};
        });
      };
      const sourceName = (path) => String(path || "").replace(/^variables\./, "");
      const sourceValue = (expression, item, rowContext = {}) => {
        if (expression == null) return expression;
        if (typeof expression === "string") {
          if (expression === "item") return item;
          if (expression.startsWith("item.")) return getPath(item, expression.slice(5));
          const eachMatch = /^\[\$EachItem\](?:\.(.+))?$/.exec(expression);
          if (eachMatch) return eachMatch[1] ? getPath(item, eachMatch[1]) : item;
          const sourceMatch = /^([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/.exec(expression);
          if (sourceMatch && Object.prototype.hasOwnProperty.call(rowContext, sourceMatch[1])) return getPath(rowContext[sourceMatch[1]], sourceMatch[2]);
        }
        return resolveConfiguredResource(expression, { ...context, record: item }, { preserveMissing: false });
      };
      const resolveMapping = (mapping, item, rowContext, sourceCollections) => {
        if (mapping && typeof mapping === "object" && !Array.isArray(mapping)) {
          if (Object.prototype.hasOwnProperty.call(mapping, "fixed")) return mapping.fixed;
          if (mapping.formula != null) {
            const formula = String(mapping.formula || "").replace(/\[\$EachItem\]/g, "CurrentItem");
            return evaluateWorkflowFormula(formula, {
              CurrentItem: item,
              record: item,
              variables: { ...(workflowVariables.variables || {}), ...rowContext },
              steps: workflowVariables.steps || {},
            });
          }
          if (mapping.aggregate) {
            const firstCollection = sourceCollections.find((entry) => Array.isArray(entry[1]))?.[1] || [];
            if (String(mapping.aggregate).toLowerCase() === "count") return firstCollection.length;
            if (String(mapping.aggregate).toLowerCase() === "sum") return firstCollection.reduce((total, entry) => total + Number(getPath(entry, mapping.field) || 0), 0);
          }
          if (mapping.valueMap) {
            const raw = sourceValue(mapping.source, item, rowContext);
            const definition = action.valueMaps?.[mapping.valueMap] || workflowVariables.valueMaps?.[mapping.valueMap] || null;
            if (!definition) return raw;
            const entries = definition.entries || definition.values || {};
            if (Object.prototype.hasOwnProperty.call(entries, raw)) return entries[raw];
            if (definition.defaultBehavior === "fail") throw new Error(`Transform Value Map "${mapping.valueMap}" has no mapping for value "${raw}"`);
            if (definition.defaultBehavior === "default") return definition.defaultValue;
            return raw;
          }
          if (Array.isArray(mapping.coalesce)) return mapping.coalesce.map((entry) => resolveMapping(entry, item, rowContext, sourceCollections)).find((entry) => entry !== undefined && entry !== null && entry !== "");
          if (Object.prototype.hasOwnProperty.call(mapping, "source")) {
            let value = sourceValue(mapping.source, item, rowContext);
            if (mapping.multiply !== undefined) value = Number(value) * Number(mapping.multiply);
            if (mapping.round === true) value = Math.round(Number(value));
            return value;
          }
          // A path binding is already understood by the generic resource
          // resolver. Other plain objects are nested transform structures and
          // must resolve recursively instead of leaking mapping definitions
          // into the generated payload.
          if (Object.prototype.hasOwnProperty.call(mapping, "path")) {
            return sourceValue(mapping, item, rowContext);
          }
          return Object.fromEntries(
            Object.entries(mapping).map(([key, value]) => [
              key,
              resolveMapping(value, item, rowContext, sourceCollections),
            ])
          );
        }
        return sourceValue(mapping, item, rowContext);
      };
      const joins = Array.isArray(action.joins) ? action.joins : [];
      let rows;
      if (sourceEntries.length <= 1) {
        const value = sourceEntries[0]?.[1];
        rows = Array.isArray(value)
          ? value.map((item) => ({ item, context: { [sourceName(sourceEntries[0]?.[0])]: item } }))
          : [{ item: value && typeof value === "object" ? value : {}, context: { [sourceName(sourceEntries[0]?.[0])]: value } }];
      } else {
        const first = sourceEntries[0];
        rows = (Array.isArray(first[1]) ? first[1] : []).map((item) => ({ item, context: { [sourceName(first[0])]: item } }));
        for (const join of joins) {
          const leftName = sourceName(join.leftSource);
          const rightName = sourceName(join.rightSource);
          const rightEntry = sourceEntries.find(([path]) => path === join.rightSource);
          if (!rightEntry || !Array.isArray(rightEntry[1])) continue;
          const next = [];
          for (const row of rows) {
            const leftItem = row.context[leftName];
            if (!leftItem) continue;
            const leftKey = getPath(leftItem, join.leftKey);
            for (const rightItem of rightEntry[1]) {
              const rightKey = getPath(rightItem, join.rightKey);
              if (leftKey === rightKey || String(leftKey ?? "") === String(rightKey ?? "")) {
                next.push({ item: { ...row.item, ...rightItem }, context: { ...row.context, [rightName]: rightItem } });
              }
            }
          }
          rows = next;
        }
      }
      const mappings = action.transformMappings || {};
      const transformOne = (row) => {
        const output = {};
        for (const [targetPath, mapping] of Object.entries(mappings)) assignPath(output, targetPath, resolveMapping(mapping, row.item, row.context, sourceEntries));
        return output;
      };
      let value;
      if (action.outputValue !== undefined) {
        const values = rows.map((row) => resolveMapping(action.outputValue, row.item, row.context, sourceEntries));
        value = Array.isArray(sourceEntries[0]?.[1]) || action?.target?.isCollection ? values : values[0];
      } else {
        const values = rows.map(transformOne);
        value = action?.target?.isCollection || Array.isArray(sourceEntries[0]?.[1]) ? values : values[0];
      }
      const outputVariable = String(action.outputVariable || action.apiName || "").trim();
      if (outputVariable) workflowVariables.variables[outputVariable] = value;
      return {
        status: "completed",
        value,
        collection: Array.isArray(value) ? value : null,
        count: Array.isArray(value) ? value.length : null,
        outputVariable: outputVariable || null,
        target: action.target || null,
      };
    },
  },
  {
    key: "ASSIGNMENT",
    displayName: "Assignment",
    description: "Set one or more existing flow variables without writing to the database.",
    schema: {
      type: "object",
      properties: {
        variableName: { type: "string" },
        variableType: { type: "string", enum: ["text","number","currency","boolean","date","datetime","record","collection","object","picklist","multiselect","time"] },
        operator: { type: "string", enum: ["set","add","subtract","append","prepend","remove_first","remove_all","remove_before_first","remove_after_first","remove_position","remove_uncommon","count"] },
        value: {},
        resourceOnly: { type: "boolean" },
        assignments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              variable: { type: "string" },
              variableType: { type: "string", enum: ["text","number","currency","boolean","date","datetime","record","collection","object","picklist","multiselect","time"] },
              operator: { type: "string", enum: ["set","add","subtract","append","prepend","remove_first","remove_all","remove_before_first","remove_after_first","remove_position","remove_uncommon","count"] },
              value: {},
            },
          },
        },
      },
      required: [],
    },
    validation: (action) => {
      const supportedTypes = ["text","number","currency","boolean","date","datetime","record","collection","object","picklist","multiselect","time"];
      const supportedOperators = ["set","add","subtract","append","prepend","remove_first","remove_all","remove_before_first","remove_after_first","remove_position","remove_uncommon","count"];
      const rows = Array.isArray(action?.assignments) && action.assignments.length ? action.assignments : null;
      const validateAssignment = ({ name, type, operator, value }) => {
        if (!name || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(name))) throw new Error("Assignment requires a valid Variable");
        if (!supportedTypes.includes(String(type || ""))) throw new Error(`Assignment for "${name}" requires a supported data type`);
        if (!supportedOperators.includes(String(operator || "set"))) throw new Error(`Assignment for "${name}" requires a supported operator`);
        if (["add","subtract"].includes(String(operator)) && !["number","currency","date","text","picklist","multiselect"].includes(String(type))) throw new Error("Assignment operator is not supported for this variable type");
        if (["append","prepend","remove_first","remove_all","remove_before_first","remove_after_first","remove_position","remove_uncommon"].includes(String(operator)) && !["collection","multiselect"].includes(String(type))) throw new Error("Assignment collection operator requires a collection-compatible variable");
        if (String(operator) === "count" && !["number","currency"].includes(String(type))) throw new Error("Equals Count requires a number-compatible target");
        if (String(operator || "set") !== "set" && value === undefined) throw new Error(`Assignment for "${name}" requires a value`);
      };
      if (rows) {
        for (const row of rows) {
          const variable = String(row?.variable || "");
          const name = variable.startsWith("variables.") ? variable.slice("variables.".length) : "";
          validateAssignment({ name, type: row?.variableType || "text", operator: row?.operator || "set", value: row?.value });
        }
        return;
      }
      validateAssignment({
        name: action?.variableName,
        type: action?.variableType,
        operator: action?.operator || "set",
        value: action?.value,
      });
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const rows = Array.isArray(action?.assignments) && action.assignments.length
        ? action.assignments.map((row) => ({
            name: String(row?.variable || "").replace(/^variables\./, ""),
            type: String(row?.variableType || "text"),
            operator: String(row?.operator || "set"),
            value: row?.value,
          }))
        : [{
            name: String(action.variableName || ""),
            type: String(action.variableType || "text"),
            operator: String(action.operator || "set"),
            value: action.value,
          }];

      const assignOne = (row) => {
        const { name, type, operator } = row;
        const raw = resolveConfiguredResource(row.value, { record, previousRecord, req, object, workflowVariables });
        const coerce = (value) => {
          if (value == null) return value;
          if (type === "number") {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) throw new Error(`Assignment variable "${name}" requires a numeric value`);
            return numeric;
          }
          if (type === "boolean") {
            if (typeof value === "boolean") return value;
            if (["true","1",1].includes(value)) return true;
            if (["false","0",0].includes(value)) return false;
            throw new Error(`Assignment variable "${name}" requires a boolean value`);
          }
          if (type === "collection") return Array.isArray(value) ? value : (value == null ? [] : [value]);
          return value;
        };
        const incoming = coerce(raw);
        const current = workflowVariables.variables[name];
        let next = incoming;
        if (operator === "add") {
          if (type === "date") {
            const base = new Date(current);
            if (Number.isNaN(base.getTime())) throw new Error(`Assignment variable "${name}" requires a valid date value`);
            base.setUTCDate(base.getUTCDate() + Number(incoming || 0));
            next = base.toISOString().slice(0, 10);
          } else if (["text","picklist","multiselect"].includes(type)) {
            next = String(current ?? "") + String(incoming ?? "");
          } else next = Number(current || 0) + Number(incoming || 0);
        } else if (operator === "subtract") {
          if (type === "date") {
            const base = new Date(current);
            if (Number.isNaN(base.getTime())) throw new Error(`Assignment variable "${name}" requires a valid date value`);
            base.setUTCDate(base.getUTCDate() - Number(incoming || 0));
            next = base.toISOString().slice(0, 10);
          } else next = Number(current || 0) - Number(incoming || 0);
        } else if (operator === "count") {
          if (!Array.isArray(incoming)) throw new Error("Equals Count requires a collection value");
          next = incoming.length;
        } else if (["append","prepend","remove_first","remove_all","remove_before_first","remove_after_first","remove_position","remove_uncommon"].includes(operator)) {
          const base = type === "multiselect"
            ? String(current || "").split(";").map((item) => item.trim()).filter(Boolean)
            : (Array.isArray(current) ? [...current] : (current == null ? [] : [current]));
          const values = Array.isArray(incoming) ? incoming : [incoming];
          if (operator === "append") next = [...base, ...values];
          else if (operator === "prepend") next = [...values, ...base];
          else if (operator === "remove_first") {
            next = [...base];
            const index = next.findIndex((item) => Object.is(item, values[0]) || String(item) === String(values[0]));
            if (index >= 0) next.splice(index, 1);
          } else if (operator === "remove_all") next = base.filter((item) => !values.some((value) => Object.is(item, value) || String(item) === String(value)));
          else if (operator === "remove_before_first") {
            const index = base.findIndex((item) => Object.is(item, values[0]) || String(item) === String(values[0]));
            next = index >= 0 ? base.slice(index) : base;
          } else if (operator === "remove_after_first") {
            const index = base.findIndex((item) => Object.is(item, values[0]) || String(item) === String(values[0]));
            next = index >= 0 ? base.slice(0, index + 1) : base;
          } else if (operator === "remove_position") {
            const position = Number(incoming);
            next = [...base];
            if (Number.isInteger(position) && position >= 1 && position <= next.length) next.splice(position - 1, 1);
          } else if (operator === "remove_uncommon") next = base.filter((item) => values.some((value) => Object.is(item, value) || String(item) === String(value)));
          if (type === "multiselect") next = next.join("; ");
        }
        workflowVariables.variables[name] = next;
        return { variableName: name, variableType: type, operator, value: next };
      };

      const results = rows.map(assignOne);
      const last = results[results.length - 1] || null;
      return {
        status: "completed",
        assignments: results,
        variableName: results.length === 1 ? last?.variableName : null,
        variableType: results.length === 1 ? last?.variableType : null,
        value: last?.value,
      };
    },
  },
  {
    key: "LOOP",
    displayName: "Loop",
    description: "Run selected workflow steps once for each item in a collection.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        itemVariable: { type: "string" },
        iterationOrder: { type: "string", enum: ["FIRST_TO_LAST","LAST_TO_FIRST"] },
        bodyBranch: { type: "array" },
        itemType: { type: "string" },
        itemObjectKey: { type: "string" },
      },
      required: ["collection","itemVariable"],
    },
    validation: (action) => {
      if (!action?.collection) throw new Error("Loop requires a collection resource");
      if (!action?.itemVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.itemVariable))) {
        throw new Error("Loop requires a valid current item variable name");
      }
      if (action.bodyBranch !== undefined && !Array.isArray(action.bodyBranch)) throw new Error("Loop body branch must be a list");
      if (action?.iterationOrder && !["FIRST_TO_LAST","LAST_TO_FIRST"].includes(String(action.iterationOrder).toUpperCase())) {
        throw new Error("Loop iteration order must be FIRST_TO_LAST or LAST_TO_FIRST");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      const collection = resolveConfiguredResource(action.collection, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
      if (!Array.isArray(collection)) throw new Error("Loop collection must resolve to a collection");
      if (collection.length > 500) throw new Error("Loop collection exceeds the maximum of 500 items");
      const orderedCollection = String(action.iterationOrder || "FIRST_TO_LAST").toUpperCase() === "LAST_TO_FIRST"
        ? [...collection].reverse()
        : collection;
      return {
        status: "completed",
        itemVariable: String(action.itemVariable),
        itemType: action.itemType || null,
        itemObjectKey: action.itemObjectKey || null,
        count: orderedCollection.length,
        collection: orderedCollection,
      };
    },
  },
  {
    key: "GET_RECORDS",
    displayName: "Get Records",
    description: "Find records on a Platform object and expose the result to later workflow steps.",
    schema: {
      type: "object",
      properties: {
        objectKey: { type: "string" },
        filters: { type: "array" },
        match: { type: "string" },
        customConditionLogic: { type: "string" },
        sortField: { type: "string" },
        sortDirection: { type: "string" },
        limit: { type: "number" },
        store: { type: "string" },
        fieldSelection: { type: "string" },
        selectedFields: { type: "array" },
        advancedAssignment: { type: "object" },
        relatedRecords: { type: "array" },
      },
      required: ["objectKey"],
    },
    validation: (action) => {
      if (!action?.objectKey && !action?.objectId && !action?.object) throw new Error("Get Records requires an object");
      if (action?.filters !== undefined && !Array.isArray(action.filters)) throw new Error("Get Records filters must be a list");
      if (action?.match && !["all", "any"].includes(String(action.match).toLowerCase())) throw new Error("Get Records match must be all or any");
      if (action?.sortDirection && !["asc", "desc"].includes(String(action.sortDirection).toLowerCase())) throw new Error("Get Records sort direction must be ascending or descending");
      if (action?.fieldSelection && !["auto", "choose", "advanced"].includes(String(action.fieldSelection).toLowerCase())) {
        throw new Error("Get Records field selection mode is invalid");
      }
      if (action?.selectedFields !== undefined && !Array.isArray(action.selectedFields)) {
        throw new Error("Get Records selected fields must be a list");
      }
      const customLogic = String(action?.customConditionLogic || "").trim();
      if (customLogic) {
        const remainder = customLogic.replace(/\bAND\b|\bOR\b|\d+|[()\s]/gi, "");
        if (remainder) throw new Error("Get Records custom condition logic is invalid");
        const indexes = customLogic.match(/\d+/g) || [];
        const filterCount = Array.isArray(action?.filters) ? action.filters.length : 0;
        if (!indexes.length || indexes.some((value) => Number(value) < 1 || Number(value) > filterCount)) {
          throw new Error("Get Records custom condition logic references an unavailable condition");
        }
      }
      validateRelatedGetRecordsConfig(action?.relatedRecords);
      if (action?.advancedAssignment !== undefined) {
        const assignment = action.advancedAssignment;
        if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
          throw new Error("Get Records advanced assignment must be an object");
        }
        const mode = String(assignment.mode || "").toLowerCase();
        if (!["record", "collection", "fields"].includes(mode)) throw new Error("Get Records advanced assignment mode is invalid");
        if (["record", "collection"].includes(mode)) {
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(assignment.resourceName || ""))) {
            throw new Error("Get Records advanced record assignment requires a valid variable API name");
          }
          if (assignment.fields !== undefined && !Array.isArray(assignment.fields)) {
            throw new Error("Get Records advanced record fields must be a list");
          }
        }
        if (mode === "fields") {
          if (!Array.isArray(assignment.mappings) || !assignment.mappings.length) {
            throw new Error("Get Records advanced field assignments require at least one mapping");
          }
          for (const mapping of assignment.mappings) {
            if (!String(mapping?.field || "").trim()) throw new Error("Get Records advanced field assignment requires a field");
            if (!/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(mapping?.resourceName || ""))) {
              throw new Error("Get Records advanced field assignment requires a valid variable API name");
            }
          }
        }
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, req, object, companyId, record, previousRecord, workflowVariables = {} }) => {
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      await assertWorkflowObjectPermission({ db, req, object: targetObject, access: "view" });
      const table = targetObject.source_table;
      const fieldResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
        [targetObject.id, req?.user?.companyId || companyId]
      );
      const securedFields = req?.user
        ? await applyFieldSecurity(db, fieldResult.rows || [], req)
        : (fieldResult.rows || []);
      const fields = securedFields.filter((field) => field.readable !== false && isSafeIdentifier(field.source_column || ""));
      const fieldByKey = new Map();
      fieldByKey.set("id", { api_name: "id", source_column: "id" });
      for (const field of fields) {
        fieldByKey.set(String(field.api_name), field);
        if (field.source_column) fieldByKey.set(String(field.source_column), field);
      }

      const parameter = (position) => String.fromCharCode(36) + position;
      const params = [];
      const clauses = [];
      if (targetObject.company_scoped) {
        params.push(req?.user?.companyId || companyId || null);
        clauses.push('"company_id"=' + parameter(params.length));
      }
      if (targetObject.store_scoped && req?.user?.storeId) {
        params.push(req.user.storeId);
        clauses.push('"store_id"=' + parameter(params.length));
      }

      const filterClauses = [];
      const filters = Array.isArray(action.filters) ? action.filters : [];
      for (const filter of filters) {
        const metadata = fieldByKey.get(String(filter?.field || ""));
        if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) {
          throw new Error(`Get Records filter field "${filter?.field || ""}" is unavailable`);
        }
        const column = '"' + (metadata.source_column || metadata.api_name) + '"';
        const operator = String(filter?.operator || "equals").toLowerCase();
        const value = resolveConfiguredResource(filter?.value, { record, previousRecord, req, object, workflowVariables });
        if (operator === "is_empty" || operator === "is_null") {
          const shouldBeNull = filter?.value === undefined ? true : Boolean(value);
          filterClauses.push(shouldBeNull
            ? "(" + column + " IS NULL OR " + column + "::text='')"
            : "(" + column + " IS NOT NULL AND " + column + "::text<>'')");
          continue;
        }
        if (operator === "is_not_empty" || operator === "is_not_null") {
          filterClauses.push("(" + column + " IS NOT NULL AND " + column + "::text<>'')");
          continue;
        }
        if (operator === "in" || operator === "not_in") {
          if (!Array.isArray(value)) throw new Error(`Get Records ${operator === "in" ? "In" : "Not In"} operator requires a collection resource`);
          params.push(value.map((item) => item == null ? "" : String(item)));
          const placeholder = parameter(params.length);
          filterClauses.push(operator === "in"
            ? column + "::text = ANY(" + placeholder + "::text[])"
            : "NOT (" + column + "::text = ANY(" + placeholder + "::text[]))");
          continue;
        }
        params.push(value);
        const placeholder = parameter(params.length);
        if (operator === "equals") filterClauses.push(column + "=" + placeholder);
        else if (operator === "not_equals") filterClauses.push(column + "<>" + placeholder);
        else if (operator === "greater_than") filterClauses.push(column + ">" + placeholder);
        else if (operator === "greater_than_or_equal") filterClauses.push(column + ">=" + placeholder);
        else if (operator === "less_than") filterClauses.push(column + "<" + placeholder);
        else if (operator === "less_than_or_equal") filterClauses.push(column + "<=" + placeholder);
        else if (operator === "contains") filterClauses.push(column + "::text ILIKE '%' || " + placeholder + "::text || '%'");
        else if (operator === "starts_with") filterClauses.push(column + "::text ILIKE " + placeholder + "::text || '%'");
        else if (operator === "ends_with") filterClauses.push(column + "::text ILIKE '%' || " + placeholder + "::text");
        else throw new Error(`Get Records uses unsupported operator "${operator}"`);
      }

      if (filterClauses.length) {
        const customLogic = String(action.customConditionLogic || "").trim();
        if (customLogic) {
          const tokens = customLogic.match(/\d+|AND|OR|\(|\)/gi) || [];
          let cursor = 0;
          const parseFactor = () => {
            const token = tokens[cursor++];
            if (token === "(") {
              const inner = parseOr();
              if (tokens[cursor++] !== ")") throw new Error("Get Records custom condition logic has unmatched parentheses");
              return "(" + inner + ")";
            }
            if (!/^\d+$/.test(String(token || ""))) throw new Error("Get Records custom condition logic is invalid");
            const index = Number(token) - 1;
            if (index < 0 || index >= filterClauses.length) throw new Error("Get Records custom condition logic references an unavailable condition");
            return "(" + filterClauses[index] + ")";
          };
          const parseAnd = () => {
            let value = parseFactor();
            while (String(tokens[cursor] || "").toUpperCase() === "AND") {
              cursor += 1;
              value += " AND " + parseFactor();
            }
            return value;
          };
          const parseOr = () => {
            let value = parseAnd();
            while (String(tokens[cursor] || "").toUpperCase() === "OR") {
              cursor += 1;
              value += " OR " + parseAnd();
            }
            return value;
          };
          const compiled = parseOr();
          if (cursor !== tokens.length) throw new Error("Get Records custom condition logic is invalid");
          clauses.push("(" + compiled + ")");
        } else {
          clauses.push("(" + filterClauses.join(String(action.match || "all").toLowerCase() === "any" ? " OR " : " AND ") + ")");
        }
      }

      let orderBy = "";
      if (action.sortField) {
        const sortMetadata = fieldByKey.get(String(action.sortField));
        if (!sortMetadata || !isSafeIdentifier(sortMetadata.source_column || sortMetadata.api_name)) {
          throw new Error(`Get Records sort field "${action.sortField}" is unavailable`);
        }
        orderBy = ' ORDER BY "' + (sortMetadata.source_column || sortMetadata.api_name) + '" ' + (String(action.sortDirection || "asc").toLowerCase() === "desc" ? "DESC" : "ASC");
      }

      const fieldSelection = String(action.fieldSelection || "auto").toLowerCase();
      const advancedAssignment = action.advancedAssignment && typeof action.advancedAssignment === "object" ? action.advancedAssignment : null;
      const requestedFieldKeys = fieldSelection === "auto"
        ? []
        : [...new Set([
            ...(Array.isArray(action.selectedFields) ? action.selectedFields : []),
            ...(Array.isArray(advancedAssignment?.fields) ? advancedAssignment.fields : []),
            ...(Array.isArray(advancedAssignment?.mappings) ? advancedAssignment.mappings.map((mapping) => mapping?.field) : []),
          ].filter(Boolean).map(String))];
      let selectedMetadata = fields;
      if (fieldSelection !== "auto") {
        selectedMetadata = requestedFieldKeys.map((key) => {
          const metadata = fieldByKey.get(key);
          if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) {
            throw new Error(`Get Records selected field "${key}" is unavailable`);
          }
          return metadata;
        });
      }
      const selectColumns = ["id"];
      const seenColumns = new Set(["id"]);
      for (const field of selectedMetadata) {
        const sourceColumn = String(field.source_column || field.api_name || "");
        if (!sourceColumn || sourceColumn === "id" || seenColumns.has(sourceColumn)) continue;
        seenColumns.add(sourceColumn);
        selectColumns.push('"' + sourceColumn + '" AS "' + field.api_name + '"');
      }

      const configuredLimit = action.limit && typeof action.limit === "object"
        ? resolveConfiguredResource(action.limit, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false })
        : action.limit;
      const requestedLimit = Math.max(1, Math.min(Number(configuredLimit || (String(action.store || "first").toLowerCase() === "all" ? 20000 : 1)), 20000));
      if (!Number.isFinite(requestedLimit)) throw new Error("Get Records maximum record limit must resolve to a number");
      params.push(requestedLimit);
      const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
      const query = 'SELECT ' + selectColumns.join(", ") + ' FROM "' + table + '"' + where + orderBy + " LIMIT " + parameter(params.length);
      const result = await db(query, params);
      const rows = result.rows || [];
      const relatedCollections = await loadRelatedGetRecordsCollections({
        db,
        relatedRecords: action.relatedRecords,
        targetObject,
        rows,
        req,
        companyId,
        record,
        previousRecord,
        object,
        workflowVariables,
      });

      if (advancedAssignment) {
        if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
        const mode = String(advancedAssignment.mode || "").toLowerCase();
        if (mode === "record") {
          if (rows[0] || advancedAssignment.setNullOnNoRecords === true) {
            workflowVariables.variables[String(advancedAssignment.resourceName)] = rows[0] || null;
          }
        } else if (mode === "collection") {
          workflowVariables.variables[String(advancedAssignment.resourceName)] = rows;
        } else if (mode === "fields") {
          const first = rows[0] || null;
          if (first || advancedAssignment.setNullOnNoRecords === true) {
            for (const mapping of advancedAssignment.mappings || []) {
              const name = String(mapping.resourceName || "");
              workflowVariables.variables[name] = first ? first[String(mapping.field || "")] ?? null : null;
            }
          }
        }
      }

      return {
        status: "completed",
        objectKey: targetObject.object_key,
        record: rows[0] || null,
        records: String(action.store || "first").toLowerCase() === "all" ? rows : (rows[0] ? [rows[0]] : []),
        count: rows.length,
        fieldSelection,
        selectedFields: fieldSelection === "auto" ? null : requestedFieldKeys,
        relatedRecords: relatedCollections,
      };
    },
  },
  {
    key: "CREATE_RECORD",
    displayName: "Create Record",
    description: "Create one or more records on an object using field mappings or record resources.",
    schema: {
      type: "object",
      properties: {
        objectKey: { type: "string" },
        objectId: { type: "string" },
        fieldValues: { type: "object" },
        recordResource: {},
        recordCollectionResource: {},
        updateExisting: { type: "boolean" },
        matchField: { type: "string" },
        checkMatchingRecords: { type: "boolean" },
        match: { type: "string" },
        matchConditions: { type: "array" },
        matchAction: { type: "string" },
      },
    },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Create Record requires an action object");
      const hasFields = action.fieldValues && typeof action.fieldValues === "object" && !Array.isArray(action.fieldValues);
      const hasRecord = action.recordResource !== undefined;
      const hasCollection = action.recordCollectionResource !== undefined;
      if (!hasFields && !hasRecord && !hasCollection) throw new Error("Create Record requires field values or a record resource");
      if (action.updateExisting === true && !String(action.matchField || "").trim()) {
        throw new Error("Create Record update-existing mode requires a matching field");
      }
      if (action.checkMatchingRecords === true) {
        if (!Array.isArray(action.matchConditions) || !action.matchConditions.length) {
          throw new Error("Create Record matching-record mode requires at least one condition");
        }
        if (!["skip","update"].includes(String(action.matchAction || "skip").toLowerCase())) {
          throw new Error("Create Record matching-record action must be skip or update");
        }
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, req, object, companyId, fields, record, previousRecord, workflowVariables = {} }) => {
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      await assertWorkflowObjectPermission({ db, req, object: targetObject, access: "create" });
      const table = targetObject.source_table;
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || null;
      const context = { record, previousRecord, req, object, workflowVariables };
      const metadataResult = await db(
        "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
        [targetObject.id, runtimeCompanyId]
      );
      const metadataByKey = new Map([["id", { api_name: "id", source_column: "id" }]]);
      for (const field of metadataResult.rows || []) {
        metadataByKey.set(String(field.api_name), field);
        if (field.source_column) metadataByKey.set(String(field.source_column), field);
      }

      let payloads = [];
      let sourceVariableName = "";
      if (action.recordCollectionResource !== undefined) {
        const resolved = resolveConfiguredResource(action.recordCollectionResource, context, { preserveMissing: false });
        if (!Array.isArray(resolved)) throw new Error("Create Record collection resource must resolve to a record collection");
        payloads = resolved;
      } else if (action.recordResource !== undefined) {
        const resolved = resolveConfiguredResource(action.recordResource, context, { preserveMissing: false });
        if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) throw new Error("Create Record record resource must resolve to one record");
        payloads = [resolved];
        sourceVariableName = String(action.recordResource?.path || "").replace(/^variables\./, "");
      } else {
        payloads = [resolveFieldValueMap(action.fieldValues || {}, context)];
      }

      const findExisting = async (payload) => {
        const conditions = [];
        const params = [];
        if (action.updateExisting === true) {
          const metadata = metadataByKey.get(String(action.matchField || ""));
          if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error("Create Record matching field is unavailable");
          const value = payload?.[String(action.matchField)];
          if (value === undefined || value === null || value === "") return null;
          params.push(value);
          conditions.push('"' + (metadata.source_column || metadata.api_name) + '"=$' + params.length);
        } else if (action.checkMatchingRecords === true) {
          for (const condition of action.matchConditions || []) {
            const metadata = metadataByKey.get(String(condition?.field || ""));
            if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error("Create Record matching condition field is unavailable");
            const value = resolveConfiguredResource(condition?.value, context, { preserveMissing: false });
            params.push(value);
            conditions.push('"' + (metadata.source_column || metadata.api_name) + '"=$' + params.length);
          }
        } else return null;
        if (!conditions.length) return null;
        const joiner = String(action.match || "all").toLowerCase() === "any" ? " OR " : " AND ";
        const scope = [];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); scope.push('"company_id"=$' + params.length); }
        if (targetObject.store_scoped && runtimeStoreId) { params.push(runtimeStoreId); scope.push('"store_id"=$' + params.length); }
        const where = ["(" + conditions.join(joiner) + ")", ...scope].join(" AND ");
        const existing = await db('SELECT * FROM "' + table + '" WHERE ' + where + ' LIMIT 1', params);
        return existing.rows[0] || null;
      };

      const updateExistingRecord = async (existing, payload) => {
        await assertSpecificWorkflowObjectPermission({ db, req, companyId: runtimeCompanyId }, targetObject, "edit");
        const entries = Object.entries(payload || {}).filter(([key]) => key !== "id");
        if (!entries.length) return existing;
        const mappedFields = await resolveWorkflowWritableFields({ db, object: targetObject, entries, req });
        const sets = mappedFields.map((field, index) => '"' + field.source_column + '"=$' + (index + 1)).join(", ");
        const params = [...entries.map(([, value]) => value), existing.id];
        const clauses = ["id=$" + params.length];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); clauses.push("company_id=$" + params.length); }
        if (targetObject.store_scoped && runtimeStoreId) { params.push(runtimeStoreId); clauses.push("store_id=$" + params.length); }
        const result = await db('UPDATE "' + table + '" SET ' + sets + ' WHERE ' + clauses.join(" AND ") + " RETURNING *", params);
        return result.rows[0] || existing;
      };

      const insertRecord = async (payload) => {
        const entries = Object.entries(payload || {}).filter(([key]) => key !== "id");
        if (!entries.length) throw new Error("Create Record requires at least one field value");
        const mappedFields = await resolveWorkflowWritableFields({ db, object: targetObject, entries, req });
        const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req });
        const columns = mappedFields.map((field) => '"' + field.source_column + '"');
        const params = entries.map(([, value]) => value);
        const values = entries.map((_, index) => "$" + (index + 1));
        if (runtimeCompanyId && targetObject.company_scoped) { columns.push('"company_id"'); values.push("$" + (params.length + 1)); params.push(runtimeCompanyId); }
        if (runtimeStoreId && targetObject.store_scoped) { columns.push('"store_id"'); values.push("$" + (params.length + 1)); params.push(runtimeStoreId); }
        const result = await db('INSERT INTO "' + table + '" (' + columns.join(", ") + ") VALUES (" + values.join(", ") + ") RETURNING *", params);
        return { record: result.rows[0] || null, duplicateWarning: duplicateAction === "WARN" };
      };

      const created = [];
      const updated = [];
      const skipped = [];
      let duplicateWarning = false;
      for (const rawPayload of payloads) {
        if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) throw new Error("Create Record resource contains an invalid record value");
        const payload = { ...rawPayload };
        delete payload.id;
        const existing = await findExisting(payload);
        if (existing) {
          const shouldUpdate = action.updateExisting === true || String(action.matchAction || "skip").toLowerCase() === "update";
          if (shouldUpdate) updated.push(await updateExistingRecord(existing, payload));
          else skipped.push(existing);
          continue;
        }
        const inserted = await insertRecord(payload);
        if (inserted.record) created.push(inserted.record);
        duplicateWarning ||= inserted.duplicateWarning;
      }

      for (const createdRecord of created) {
        try {
          if (createdRecord?.id) await publishPlatformEvent({ db, companyId: runtimeCompanyId, eventType: "platform.object.record.created", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId: createdRecord.id, record: createdRecord }, actorUserId: req?.user?.id || null });
        } catch (error) { console.error("Platform workflow record event publication error:", error); }
      }
      for (const updatedRecord of updated) {
        try {
          if (updatedRecord?.id) await publishPlatformEvent({ db, companyId: runtimeCompanyId, eventType: "platform.object.record.updated", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId: updatedRecord.id, record: updatedRecord }, actorUserId: req?.user?.id || null });
        } catch (error) { console.error("Platform workflow record event publication error:", error); }
      }
      if (sourceVariableName && workflowVariables.variables && (created[0] || updated[0])) {
        workflowVariables.variables[sourceVariableName] = created[0] || updated[0];
      }
      return {
        status: created.length || updated.length ? "completed" : "skipped",
        created: created[0] || null,
        createdRecords: created,
        updated: updated[0] || null,
        updatedRecords: updated,
        skippedRecords: skipped,
        count: created.length + updated.length,
        duplicateWarning,
      };
    },
  },
  {
    key: "UPDATE_RECORD",
    displayName: "Update Record",
    description: "Update one or more records using record resources or object conditions.",
    schema: {
      type: "object",
      properties: {
        recordId: {},
        recordResource: {},
        recordCollectionResource: {},
        objectKey: { type: "string" },
        conditions: { type: "array" },
        match: { type: "string" },
        fieldValues: { type: "object" },
      },
    },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Update Record requires an action object");
      const hasRecordId = action.recordId !== undefined;
      const hasRecord = action.recordResource !== undefined;
      const hasCollection = action.recordCollectionResource !== undefined;
      const hasConditions = action.objectKey && Array.isArray(action.conditions);
      if (!hasRecordId && !hasRecord && !hasCollection && !hasConditions) {
        throw new Error("Update Record requires a record resource, record collection, recordId, or object conditions");
      }
      if (hasConditions && (!action.fieldValues || typeof action.fieldValues !== "object" || Array.isArray(action.fieldValues))) {
        throw new Error("Update Record condition mode requires fieldValues");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, object, req, companyId, fields, record, previousRecord, workflowVariables = {} }) => {
      const context = { record, previousRecord, req, object, workflowVariables };
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || null;

      const updateById = async ({ targetObject, recordId, payload }) => {
        if (!recordId) throw new Error("Update Record requires a record ID");
        await assertWorkflowObjectPermission({ db, req, object: targetObject, access: "edit" });
        const entries = Object.entries(payload || {}).filter(([key]) => key !== "id");
        if (!entries.length) return null;
        const mappedFields = await resolveWorkflowWritableFields({ db, object: targetObject, entries, req });
        const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: runtimeCompanyId, req, excludeRecordId: recordId });
        const sets = mappedFields.map((field, index) => '"' + field.source_column + '"=$' + (index + 1)).join(", ");
        const params = [...entries.map(([, value]) => value), recordId];
        const clauses = ["id=$" + params.length];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); clauses.push("company_id=$" + params.length); }
        if (targetObject.store_scoped && runtimeStoreId) { params.push(runtimeStoreId); clauses.push("store_id=$" + params.length); }
        const result = await db('UPDATE "' + targetObject.source_table + '" SET ' + sets + ' WHERE ' + clauses.join(" AND ") + " RETURNING *", params);
        return { record: result.rows[0] || null, duplicateWarning: duplicateAction === "WARN" };
      };

      if (action.recordResource !== undefined || action.recordCollectionResource !== undefined) {
        const source = action.recordCollectionResource !== undefined
          ? resolveConfiguredResource(action.recordCollectionResource, context, { preserveMissing: false })
          : [resolveConfiguredResource(action.recordResource, context, { preserveMissing: false })];
        const rows = Array.isArray(source) ? source : [];
        if (!rows.length) return { status: "skipped", updated: null, updatedRecords: [], count: 0 };
        const updatedRecords = [];
        let duplicateWarning = false;
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Update Record resource contains an invalid record value");
          const rowObjectKey = row.objectKey || row.object_key || action.objectKey || object?.object_key;
          const targetObject = await resolveWorkflowTargetObject({ db, action: { objectKey: rowObjectKey }, object, companyId, req });
          const result = await updateById({ targetObject, recordId: row.id, payload: row });
          if (result?.record) updatedRecords.push(result.record);
          duplicateWarning ||= Boolean(result?.duplicateWarning);
        }
        return {
          status: updatedRecords.length ? "completed" : "skipped",
          updated: updatedRecords[0] || null,
          updatedRecords,
          count: updatedRecords.length,
          duplicateWarning,
        };
      }

      if (action.objectKey && Array.isArray(action.conditions)) {
        const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
        const fieldResult = await db(
          "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
          [targetObject.id, runtimeCompanyId]
        );
        const fieldByKey = new Map([["id", { api_name: "id", source_column: "id" }]]);
        for (const field of fieldResult.rows || []) {
          fieldByKey.set(String(field.api_name), field);
          if (field.source_column) fieldByKey.set(String(field.source_column), field);
        }
        const params = [];
        const clauses = [];
        for (const condition of action.conditions || []) {
          const metadata = fieldByKey.get(String(condition?.field || ""));
          if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error("Update Record condition field is unavailable");
          const column = '"' + (metadata.source_column || metadata.api_name) + '"';
          const operator = String(condition.operator || "equals").toLowerCase();
          const value = resolveConfiguredResource(condition.value, context, { preserveMissing: false });
          params.push(value);
          const placeholder = "$" + params.length;
          if (operator === "equals") clauses.push(column + "=" + placeholder);
          else if (operator === "not_equals") clauses.push(column + "<>" + placeholder);
          else if (operator === "greater_than") clauses.push(column + ">" + placeholder);
          else if (operator === "less_than") clauses.push(column + "<" + placeholder);
          else throw new Error("Update Record uses unsupported condition operator");
        }
        const scoped = [];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); scoped.push('"company_id"=$' + params.length); }
        if (targetObject.store_scoped && runtimeStoreId) { params.push(runtimeStoreId); scoped.push('"store_id"=$' + params.length); }
        const conditionSql = clauses.length
          ? "(" + clauses.join(String(action.match || "all").toLowerCase() === "any" ? " OR " : " AND ") + ")"
          : "TRUE";
        const where = [conditionSql, ...scoped].join(" AND ");
        const existing = await db('SELECT id FROM "' + targetObject.source_table + '" WHERE ' + where, params);
        const resolvedFieldValues = resolveFieldValueMap(action.fieldValues || {}, context);
        const updatedRecords = [];
        let duplicateWarning = false;
        for (const row of existing.rows || []) {
          const result = await updateById({ targetObject, recordId: row.id, payload: resolvedFieldValues });
          if (result?.record) updatedRecords.push(result.record);
          duplicateWarning ||= Boolean(result?.duplicateWarning);
        }
        return {
          status: updatedRecords.length ? "completed" : "skipped",
          updated: updatedRecords[0] || null,
          updatedRecords,
          count: updatedRecords.length,
          duplicateWarning,
        };
      }

      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const resolvedRecordId = resolveConfiguredResource(action.recordId, context);
      const resolvedFieldValues = resolveFieldValueMap(action.fieldValues || {}, context);
      const result = await updateById({ targetObject, recordId: resolvedRecordId, payload: resolvedFieldValues });
      const updated = result?.record || null;
      try {
        if (updated?.id) await publishPlatformEvent({ db, companyId: runtimeCompanyId, eventType: "platform.object.record.updated", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId: updated.id, record: updated }, actorUserId: req?.user?.id || null });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: updated ? "completed" : "skipped", updated, updatedRecords: updated ? [updated] : [], count: updated ? 1 : 0, duplicateWarning: Boolean(result?.duplicateWarning) };
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
    executor: async ({ db, action, object, req, companyId, record, previousRecord, workflowVariables }) => {
      if (!action.recordId) throw new Error("Update Related Record requires a recordId");
      const resolvedRecordId = resolveConfiguredResource(action.recordId, { record, previousRecord, req, object, workflowVariables });
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
      if (!table || !targetObject) throw new Error("Update Related Record requires a target object");
      await assertSpecificWorkflowObjectPermission({ db, req, companyId }, targetObject, "edit");
      const resolvedFieldValues = resolveFieldValueMap(action.fieldValues || {}, { record, previousRecord, req, object, workflowVariables });
      const entries = Object.entries(resolvedFieldValues || {});
      if (!entries.length) return { status: "completed", recordId: resolvedRecordId, updated: null };
      const mappedFields = await resolveWorkflowWritableFields({ db, object: targetObject, entries, req });
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: req?.user?.companyId || companyId, req, excludeRecordId: resolvedRecordId });
      const sets = mappedFields.map((field, index) => `"${field.source_column}"=$${index + 1}`).join(", ");
      const params = [...entries.map(([, value]) => value), resolvedRecordId];
      const clauses = ["id=$" + params.length];
      if (targetObject.company_scoped) {
        params.push(req?.user?.companyId || companyId || null);
        clauses.push(`company_id=$${params.length}`);
      }
      if (targetObject.store_scoped) {
        if (!req?.user?.storeId) throw new Error("A store session is required for this related record");
        params.push(req.user.storeId);
        clauses.push(`store_id=$${params.length}`);
      }
      const result = await db(`UPDATE "${table}" SET ${sets} WHERE ${clauses.join(" AND ")} RETURNING *`, params);
      const updated = result.rows[0] || null;
      try {
        if (updated?.id) await publishPlatformEvent({ db, companyId: req?.user?.companyId || companyId, eventType: "platform.object.record.updated", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId: updated.id, record: updated }, actorUserId: req?.user?.id || null });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: result.rows.length ? "completed" : "skipped", recordId: resolvedRecordId, updated, duplicateWarning: duplicateAction === "WARN" };
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
    executor: async ({ db, action, req, object, recordId, companyId, record, previousRecord, workflowVariables }) => {
      let relationship = action.relationship || null;
      const parentObject = await resolveWorkflowTargetObject({ db, action: { objectId: action.parentObjectId || action.parent_object_id }, object, companyId, req });
      let table = null;
      let targetObject = null;
      const parentRecordId = resolveConfiguredResource(action.recordId || action.parentRecordId || recordId || null, { record, previousRecord, req, object, workflowVariables });
      const relationshipKey = action.relationshipKey || action.relationship_key || null;
      if (relationshipKey && db && typeof db === "function") {
        const relationshipResult = await db("SELECT * FROM platform_relationships WHERE relationship_key=$1 AND parent_object_id=$2 AND active=true LIMIT 1", [relationshipKey, parentObject.id]);
        relationship = relationshipResult.rows[0] || relationship;
      }
      if (relationship?.child_object_id && db && typeof db === "function") {
        targetObject = await resolveTargetObjectMetadata({ db, objectId: relationship.child_object_id, companyId: companyId || req?.user?.companyId });
        table = targetObject?.source_table || table;
      }
      if (!table || !targetObject) throw new Error("Create Related Record requires a target object");
      await assertSpecificWorkflowObjectPermission({ db, req, companyId }, targetObject, "create");
      const fieldValues = { ...(resolveFieldValueMap(action.fieldValues || {}, { record, previousRecord, req, object, workflowVariables }) || {}) };
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
      const mappedFields = await resolveWorkflowWritableFields({ db, object: targetObject, entries, req });
      const duplicateAction = await checkWorkflowDuplicateRules({ db, object: targetObject, entries, companyId: req?.user?.companyId || companyId, req });
      const columns = mappedFields.map((field) => `"${field.source_column}"`);
      const values = entries.map((_, index) => `$${index + 1}`);
      const params = entries.map(([, value]) => value);
      if (targetObject.company_scoped) {
        columns.push('"company_id"');
        values.push(`$${params.length + 1}`);
        params.push(req?.user?.companyId || companyId || null);
      }
      if (targetObject.store_scoped) {
        if (!req?.user?.storeId) throw new Error("A store session is required for this related record");
        columns.push('"store_id"');
        values.push(`$${params.length + 1}`);
        params.push(req.user.storeId);
      }
      const query = `INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${values.join(", ")}) RETURNING *`;
      const result = await db(query, params);
      const created = result.rows[0] || null;
      try {
        if (created?.id) await publishPlatformEvent({ db, companyId: req?.user?.companyId || companyId, eventType: "platform.object.record.created", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId: created.id, record: created }, actorUserId: req?.user?.id || null });
      } catch (error) { console.error("Platform workflow record event publication error:", error); }
      return { status: "completed", created, relationshipKey: relationshipKey || action.relationshipKey || null, duplicateWarning: duplicateAction === "WARN" };
    },
  },
  {
    key: "DELETE_RECORD",
    displayName: "Delete Record",
    description: "Delete one or more records using record resources or object conditions.",
    schema: {
      type: "object",
      properties: {
        recordId: {},
        recordResource: {},
        recordCollectionResource: {},
        objectKey: { type: "string" },
        conditions: { type: "array" },
        match: { type: "string" },
      },
    },
    validation: (action) => {
      if (!action || typeof action !== "object") throw new Error("Delete Record requires an action object");
      const hasRecordId = action.recordId !== undefined;
      const hasRecord = action.recordResource !== undefined;
      const hasCollection = action.recordCollectionResource !== undefined;
      const hasConditions = action.objectKey && Array.isArray(action.conditions) && action.conditions.length > 0;
      if (!hasRecordId && !hasRecord && !hasCollection && !hasConditions) {
        throw new Error("Delete Record requires a record resource, record collection, recordId, or object conditions");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, object, req, companyId, record, previousRecord, workflowVariables = {} }) => {
      const context = { record, previousRecord, req, object, workflowVariables };
      const runtimeCompanyId = req?.user?.companyId || companyId || null;
      const runtimeStoreId = req?.user?.storeId || null;

      const deleteById = async ({ targetObject, recordId }) => {
        if (!recordId) return null;
        await assertWorkflowObjectPermission({ db, req, object: targetObject, access: "delete" });
        const table = targetObject.source_table;
        const hasActive = await db(
          "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'active'",
          [table]
        );
        const params = [recordId];
        const clauses = ["id=$1"];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); clauses.push("company_id=$" + params.length); }
        if (targetObject.store_scoped) {
          if (!runtimeStoreId) throw new Error("A store session is required for this record");
          params.push(runtimeStoreId);
          clauses.push("store_id=$" + params.length);
        }
        const result = hasActive.rows.length
          ? await db('UPDATE "' + table + '" SET active=false WHERE ' + clauses.join(" AND ") + " RETURNING *", params)
          : await db('DELETE FROM "' + table + '" WHERE ' + clauses.join(" AND ") + " RETURNING *", params);
        const deleted = result.rows[0] || null;
        try {
          if (deleted) await publishPlatformEvent({ db, companyId: runtimeCompanyId, eventType: "platform.object.record.deleted", payload: { objectId: targetObject.id, objectKey: targetObject.object_key, recordId, record: deleted, archived: hasActive.rows.length > 0 }, actorUserId: req?.user?.id || null });
        } catch (error) { console.error("Platform workflow record event publication error:", error); }
        return deleted;
      };

      if (action.recordResource !== undefined || action.recordCollectionResource !== undefined) {
        const source = action.recordCollectionResource !== undefined
          ? resolveConfiguredResource(action.recordCollectionResource, context, { preserveMissing: false })
          : [resolveConfiguredResource(action.recordResource, context, { preserveMissing: false })];
        const rows = Array.isArray(source) ? source : [];
        const deletedRecords = [];
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Delete Record resource contains an invalid record value");
          const rowObjectKey = row.objectKey || row.object_key || action.objectKey || object?.object_key;
          const targetObject = await resolveWorkflowTargetObject({ db, action: { objectKey: rowObjectKey }, object, companyId, req });
          const deleted = await deleteById({ targetObject, recordId: row.id });
          if (deleted) deletedRecords.push(deleted);
        }
        return { status: deletedRecords.length ? "completed" : "skipped", deleted: deletedRecords[0] || null, deletedRecords, count: deletedRecords.length };
      }

      if (action.objectKey && Array.isArray(action.conditions) && action.conditions.length) {
        const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
        const fieldResult = await db(
          "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)",
          [targetObject.id, runtimeCompanyId]
        );
        const fieldByKey = new Map([["id", { api_name: "id", source_column: "id" }]]);
        for (const field of fieldResult.rows || []) {
          fieldByKey.set(String(field.api_name), field);
          if (field.source_column) fieldByKey.set(String(field.source_column), field);
        }
        const params = [];
        const clauseRows = [];
        for (const condition of action.conditions) {
          const fieldName = String(condition?.field || "");
          const metadata = fieldByKey.get(fieldName);
          if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) throw new Error("Delete Record condition field is unavailable");
          const column = '"' + (metadata.source_column || metadata.api_name) + '"';
          const operator = String(condition.operator || "equals").toLowerCase();
          const value = resolveConfiguredResource(condition.value, context, { preserveMissing: false });
          let sql = "";
          if (operator === "is_null") {
            sql = Boolean(value) ? "(" + column + " IS NULL OR " + column + "::text='')" : "(" + column + " IS NOT NULL AND " + column + "::text<>'')";
          } else {
            params.push(value);
            const placeholder = "$" + params.length;
            if (operator === "equals") sql = column + "=" + placeholder;
            else if (operator === "not_equals") sql = column + "<>" + placeholder;
            else if (operator === "greater_than") sql = column + ">" + placeholder;
            else if (operator === "greater_than_or_equal") sql = column + ">=" + placeholder;
            else if (operator === "less_than") sql = column + "<" + placeholder;
            else if (operator === "less_than_or_equal") sql = column + "<=" + placeholder;
            else if (operator === "contains") sql = column + "::text ILIKE '%' || " + placeholder + "::text || '%'";
            else if (operator === "starts_with") sql = column + "::text ILIKE " + placeholder + "::text || '%'";
            else if (operator === "ends_with") sql = column + "::text ILIKE '%' || " + placeholder + "::text";
            else throw new Error("Delete Record uses unsupported condition operator");
          }
          clauseRows.push({ field: fieldName, operator, sql });
        }
        let conditionSql = "";
        if (String(action.match || "all").toLowerCase() === "any") {
          conditionSql = clauseRows.map((row) => row.sql).join(" OR ");
        } else {
          const consumed = new Set();
          const groups = [];
          clauseRows.forEach((row, index) => {
            if (consumed.has(index)) return;
            if (row.operator === "equals") {
              const same = clauseRows.map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
                .filter(({ candidate, candidateIndex }) => candidateIndex >= index && candidate.operator === "equals" && candidate.field === row.field);
              if (same.length > 1) {
                same.forEach(({ candidateIndex }) => consumed.add(candidateIndex));
                groups.push("(" + same.map(({ candidate }) => candidate.sql).join(" OR ") + ")");
                return;
              }
            }
            consumed.add(index);
            groups.push(row.sql);
          });
          conditionSql = groups.join(" AND ");
        }
        const scoped = [];
        if (targetObject.company_scoped) { params.push(runtimeCompanyId); scoped.push('"company_id"=$' + params.length); }
        if (targetObject.store_scoped) {
          if (!runtimeStoreId) throw new Error("A store session is required for this record");
          params.push(runtimeStoreId);
          scoped.push('"store_id"=$' + params.length);
        }
        const where = ["(" + conditionSql + ")", ...scoped].join(" AND ");
        const existing = await db('SELECT id FROM "' + targetObject.source_table + '" WHERE ' + where, params);
        const deletedRecords = [];
        for (const row of existing.rows || []) {
          const deleted = await deleteById({ targetObject, recordId: row.id });
          if (deleted) deletedRecords.push(deleted);
        }
        return { status: deletedRecords.length ? "completed" : "skipped", deleted: deletedRecords[0] || null, deletedRecords, count: deletedRecords.length };
      }

      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const resolvedRecordId = resolveConfiguredResource(action.recordId, context);
      const deleted = await deleteById({ targetObject, recordId: resolvedRecordId });
      return { status: deleted ? "completed" : "skipped", deleted, deletedRecords: deleted ? [deleted] : [], count: deleted ? 1 : 0 };
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
    executor: async ({ db, action, object, req, companyId, record, previousRecord, workflowVariables }) => {
      const targetObject = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const table = targetObject.source_table;
      const assignee = resolveConfiguredResource(action.assignee ?? action.assignedTo, { record, previousRecord, req, object, workflowVariables });
      const resolvedRecordId = resolveConfiguredResource(action.recordId, { record, previousRecord, req, object, workflowVariables });
      const params = [assignee, resolvedRecordId];
      const scope = targetObject.company_scoped ? " AND company_id=$3" : "";
      if (targetObject.company_scoped) params.push(req?.user?.companyId || companyId);
      const result = await db(`UPDATE "${table}" SET assigned_to=$1 WHERE id=$2${scope} RETURNING *`, params);
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
    executor: async ({ db, action, object, req, recordId, record, previousRecord, workflowVariables }) => {
      const relationshipKey = action.relationshipKey;
      const relatedRecordId = resolveConfiguredResource(action.relatedRecordId || action.recordId, { record, previousRecord, req, object, workflowVariables });
      const parentRecordId = resolveConfiguredResource(action.parentRecordId || recordId || action.recordId || null, { record, previousRecord, req, object, workflowVariables });
      if (!db || typeof db !== "function") return { status: "completed", relationshipKey, relatedRecordId };
      const resolved = await loadRecordRelationship({ db, action, object });
      if (!resolved?.relationship) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" is not registered for this object` };
      }
      const column = resolved.field?.source_column || resolved.field?.api_name || null;
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
      const result = await db(
        `UPDATE "${resolved.relationship.child_source_table}" SET "${column}"=$1 WHERE ${clauses.join(" AND ")} RETURNING *`,
        params
      );
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
    executor: async ({ db, action, object, req, record, previousRecord, workflowVariables }) => {
      const relationshipKey = action.relationshipKey;
      const relatedRecordId = resolveConfiguredResource(action.relatedRecordId || action.recordId, { record, previousRecord, req, object, workflowVariables });
      if (!db || typeof db !== "function") return { status: "completed", relationshipKey, relatedRecordId };
      const resolved = await loadRecordRelationship({ db, action, object });
      if (!resolved?.relationship) {
        return { status: "skipped", relationshipKey, relatedRecordId, reason: `Relationship "${relationshipKey}" is not registered for this object` };
      }
      const column = resolved.field?.source_column || resolved.field?.api_name || null;
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
      const result = await db(
        `UPDATE "${resolved.relationship.child_source_table}" SET "${column}"=NULL WHERE ${clauses.join(" AND ")} RETURNING *`,
        params
      );
      return { status: result.rows.length ? "completed" : "skipped", relationshipKey, relatedRecordId, linkField: column, unlinked: result.rows[0] || null };
    },
  },
  {
    key: "SEND_COMMUNICATION",
    displayName: "Send Communication",
    description: "Send a provider-neutral communication. Channel, recipient, content and template are Flow metadata; installed communication providers own transport and credentials.",
    schema: {
      type: "object",
      properties: {
        channel: { type: "string", title: "Channel" },
        recipient: { type: "string", title: "Recipient" },
        subject: { type: "string", title: "Subject" },
        title: { type: "string", title: "Notification title" },
        message: { type: "string", title: "Message" },
        templateId: { type: "string", title: "Template" },
        templateKey: { type: "string", title: "Template API name" },
        templateContext: { type: "object", title: "Template context" },
        conversationId: { type: "string", title: "Conversation" },
        objectId: { type: "string", title: "Related object" },
        recordId: { type: "string", title: "Related record" },
      },
      required: ["channel"],
    },
    validation: (action) => {
      if (!action?.channel) throw new Error("Send Communication requires a channel");
      if (!action?.message && !action?.body && !action?.text && !action?.templateId && !action?.templateKey && !action?.template) {
        throw new Error("Send Communication requires a message or template");
      }
    },
    async: true,
    requiredPermissions: ["communications.send"],
    executor: async (context) => {
      const { action, db, req, companyId, record, previousRecord, object, workflowVariables } = context;
      const bindingContext = { record, previousRecord, req, object, workflowVariables };
      const channelValue = resolveConfiguredResource(action.channel, bindingContext, { preserveMissing: false });
      const channel = String(channelValue || "").trim().toUpperCase();
      if (!channel) return { status: "failed", code: "COMMUNICATION_CHANNEL_REQUIRED", retryable: false };

      const resolved = resolveCommunicationWorkflowAction(action, record, object, workflowVariables, req, previousRecord);
      const forwarded = {
        ...resolved,
        subject: resolveConfiguredResource(action.subject, bindingContext, { preserveMissing: false }),
        title: resolveConfiguredResource(action.title, bindingContext, { preserveMissing: false }),
        message: resolveConfiguredResource(action.message ?? action.body ?? action.text, bindingContext, { preserveMissing: false }),
        templateId: resolveConfiguredResource(action.templateId, bindingContext, { preserveMissing: false }),
        template: resolveConfiguredResource(action.template || action.templateKey, bindingContext, { preserveMissing: false }),
        conversationId: resolveConfiguredResource(action.conversationId, bindingContext, { preserveMissing: false }),
        objectId: resolveConfiguredResource(action.objectId, bindingContext, { preserveMissing: false }),
        recordId: resolveConfiguredResource(action.recordId, bindingContext, { preserveMissing: false }),
      };

      const tenantId = companyId || req?.user?.companyId || null;
      const templateRef = forwarded.templateId || forwarded.template || null;
      if (templateRef && tenantId) {
        const templateResult = await db(
          `SELECT id,api_key,subject,body,channel
             FROM platform_message_templates
            WHERE active=TRUE
              AND (company_id=$1 OR company_id IS NULL)
              AND (id::text=$2 OR api_key=$2)
            ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END
            LIMIT 1`,
          [tenantId, String(templateRef)]
        );
        const template = templateResult.rows[0];
        if (!template) return { status: "failed", code: "COMMUNICATION_TEMPLATE_UNAVAILABLE", retryable: false };
        if (String(template.channel || "").toUpperCase() !== channel) {
          return { status: "failed", code: "TEMPLATE_CHANNEL_MISMATCH", channel, retryable: false };
        }
        const templateContext = forwarded.templateContext && typeof forwarded.templateContext === "object"
          ? forwarded.templateContext
          : (record || {});
        forwarded.templateId = template.id;
        forwarded.template = template.api_key;
        forwarded.templateKey = template.api_key;
        forwarded.subject = renderMessageTemplate(template.subject || forwarded.subject || "", templateContext);
        forwarded.title = forwarded.title || forwarded.subject || null;
        forwarded.message = renderMessageTemplate(template.body || forwarded.message || "", templateContext);
        forwarded.body = forwarded.message;
        forwarded.text = forwarded.message;
      }

      if (channel === "IN_APP") {
        if (!tenantId) return { status: "failed", code: "COMPANY_CONTEXT_REQUIRED", retryable: false };
        let recipientSpec = resolveConfiguredResource(action.recipientUserId || action.recipient || action.to, bindingContext, { preserveMissing: false });
        if (!recipientSpec || ["CURRENT_USER","$USER","$USER.ID"].includes(String(recipientSpec).toUpperCase())) {
          recipientSpec = req?.user?.id || null;
        }
        if (!recipientSpec) return { status: "failed", code: "COMMUNICATION_RECIPIENT_REQUIRED", retryable: false };

        let recipientUserIds = [];
        if (["PLATFORM_SUPERADMINS","PLATFORM_ADMINS"].includes(String(recipientSpec).toUpperCase())) {
          const admins = await db(
            `SELECT DISTINCT u.id
               FROM users u
               JOIN role_permissions rp ON rp.role_id=u.role_id
               JOIN permissions p ON p.id=rp.permission_id
              WHERE u.active=TRUE AND p.code='oneengine.manage'`
          );
          recipientUserIds = (admins.rows || []).map((row) => row.id).filter(Boolean);
        } else {
          const userResult = await db(
            "SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE LIMIT 1",
            [recipientSpec, tenantId]
          );
          recipientUserIds = userResult.rows?.[0]?.id ? [userResult.rows[0].id] : [];
        }
        if (!recipientUserIds.length) return { status: "failed", code: "COMMUNICATION_RECIPIENT_UNAVAILABLE", retryable: false };

        const templateContext = forwarded.templateContext && typeof forwarded.templateContext === "object" ? forwarded.templateContext : (record || {});
        const rawMessage = forwarded.message ?? action.message ?? action.body ?? action.text ?? "";
        const rawTitle = forwarded.title ?? forwarded.subject ?? action.title ?? action.subject ?? "";
        const message = renderMessageTemplate(String(rawMessage), templateContext);
        const title = rawTitle ? renderMessageTemplate(String(rawTitle), templateContext) : null;

        for (const recipientUserId of recipientUserIds) {
          await db(
            "INSERT INTO platform_notifications (company_id,user_id,title,message,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
            [tenantId, recipientUserId, title, message, JSON.stringify({ source: "send_communication", channel: "IN_APP", objectId: forwarded.objectId || null, recordId: forwarded.recordId || null })]
          );
          await recordCommunicationEvent({
            db,
            companyId: tenantId,
            channel: "IN_APP",
            eventType: COMMUNICATION_EVENTS.SENT,
            direction: "OUTBOUND",
            provider: "IN_APP",
            recipient: String(recipientUserId),
            objectId: forwarded.objectId || null,
            recordId: forwarded.recordId || null,
            body: message,
            metadata: { title, actionType: "SEND_COMMUNICATION" },
          }).catch(() => null);
        }
        return { status: "completed", channel: "IN_APP", recipients: recipientUserIds };
      }

      if (channel === "WHATSAPP") {
        if (!tenantId) return { status: "failed", code: "COMPANY_CONTEXT_REQUIRED", retryable: false };
        const recipient = String(forwarded.recipient || forwarded.to || "").replace(/[^0-9]/g, "");
        const message = String(forwarded.message || forwarded.body || forwarded.text || "").trim();
        if (!recipient || !message) {
          return { status: "failed", code: "COMMUNICATION_RECIPIENT_OR_MESSAGE_REQUIRED", channel, retryable: false };
        }

        // Backfill pre-metadata WhatsApp settings once, so existing tenants do
        // not need to re-enter credentials after moving transport to ONE_HTTP_REQUEST.
        const existingConnection = await db(
          "SELECT id FROM integration_connections WHERE company_id=$1 AND LOWER(provider_name)='whatsapp' AND enabled=TRUE LIMIT 1",
          [tenantId]
        );
        if (!existingConnection.rows?.length) {
          const legacy = await db(
            "SELECT active,configuration FROM integrations WHERE company_id=$1 AND LOWER(provider) IN ('whatsapp','whatsapp_business') AND active=TRUE ORDER BY updated_at DESC LIMIT 1",
            [tenantId]
          );
          const configuration = legacy.rows?.[0]?.configuration || {};
          const token = decryptSecret(configuration.access_token);
          const phoneNumberId = configuration.phone_number_id || null;
          if (token && phoneNumberId) {
            await db(
              `INSERT INTO integration_connections
                (company_id,name,provider_name,integration_type,base_url,connector_package_key,connector_configuration,auth_type,credentials_encrypted,enabled,connection_status,created_by)
               VALUES ($1,'WhatsApp Business Connection','whatsapp','communication','https://graph.facebook.com/v21.0','whatsapp',$2::jsonb,'bearer',$3,TRUE,'CONNECTED',$4)`,
              [tenantId, JSON.stringify({
                phoneNumberId,
                businessAccountId: configuration.business_account_id || null,
                defaultCountryCode: configuration.default_country_code || null,
              }), encryptCredentials({ token }), req?.user?.id || null]
            );
          }
        }

        // WhatsApp is transport metadata, not a platform job/function. Execute
        // through the generic ONE_HTTP_REQUEST core using the tenant's stored
        // API connection metadata, encrypted credentials and phone-number metadata.
        const http = oneHttpRequestDefinition();
        const result = await http.executor({
          ...context,
          companyId: tenantId,
          action: {
            providerKey: "whatsapp",
            method: "POST",
            endpoint: "/{{phoneNumberId}}/messages",
            body: {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: recipient,
              type: "text",
              text: { preview_url: false, body: message },
            },
          },
        });
        if (result?.success !== true) {
          return {
            status: "failed",
            code: "COMMUNICATION_PROVIDER_FAILED",
            channel,
            retryable: Number(result?.statusCode || 0) >= 500,
            statusCode: result?.statusCode || 0,
            data: result?.data || null,
          };
        }
        await recordCommunicationEvent({
          db,
          companyId: tenantId,
          channel: "WHATSAPP",
          eventType: COMMUNICATION_EVENTS.SENT,
          direction: "OUTBOUND",
          provider: "whatsapp",
          recipient,
          objectId: forwarded.objectId || null,
          recordId: forwarded.recordId || null,
          body: message,
          metadata: {
            actionType: "SEND_COMMUNICATION",
            providerMessageId: result?.data?.messages?.[0]?.id || null,
            conversationId: forwarded.conversationId || null,
          },
        }).catch(() => null);
        return {
          status: "completed",
          channel: "WHATSAPP",
          provider: "whatsapp",
          statusCode: result.statusCode,
          reference: result?.data?.messages?.[0]?.id || null,
        };
      }

      const legacyKey = { EMAIL: "SEND_EMAIL", SMS: "SEND_SMS" }[channel] || null;
      if (!legacyKey) {
        return { status: "failed", code: "UNSUPPORTED_COMMUNICATION_CHANNEL", channel, retryable: false };
      }
      const transport = getWorkflowActionDefinition(legacyKey);
      if (!transport?.executor) return { status: "failed", code: "COMMUNICATION_TRANSPORT_UNAVAILABLE", channel, retryable: false };
      return transport.executor({ ...context, action: { ...forwarded, key: legacyKey, type: legacyKey } });
    },
  },
  {
    key: "IN_APP_NOTIFICATION",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
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
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Send Email",
    description: "Queue an email using the configured email provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send Email requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.email",
    executor: async ({ db, action, req, companyId, stepRunId, record, previousRecord, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "EMAIL", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "EMAIL", error: provider.error, jobId: null };
      }
      const resolvedAction = await resolveEmailWorkflowAction({ db, companyId: company, action, record, previousRecord, object, workflowVariables, req });
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_EMAIL", payload: { ...resolvedAction, _roleId: req?.user?.roleId, _stepRunId: stepRunId }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "SEND_EMAIL_BREVO",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Send Email - Brevo",
    description: "Send an email through the tenant's installed Brevo connector.",
    schema: {
      type: "object",
      properties: {
        recipient: { type: "string", title: "Recipient email" },
        contentMode: { type: "string", enum: ["TEMPLATE","CUSTOM"], title: "Content source" },
        templateId: { type: "string", title: "Message template" },
        subject: { type: "string", title: "Subject" },
        body: { type: "string", title: "Message body" },
      },
      required: ["recipient"],
    },
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send Email - Brevo requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    executor: async (context) => executeProviderSpecificEmail({
      ...context,
      packageKey: "brevo_connector",
      actionKey: "SEND_EMAIL_BREVO",
    }),
  },
  {
    key: "SEND_EMAIL_MAILJET",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Send Email - Mailjet",
    description: "Send an email through the tenant's installed Mailjet connector.",
    schema: {
      type: "object",
      properties: {
        recipient: { type: "string", title: "Recipient email" },
        contentMode: { type: "string", enum: ["TEMPLATE","CUSTOM"], title: "Content source" },
        templateId: { type: "string", title: "Message template" },
        subject: { type: "string", title: "Subject" },
        body: { type: "string", title: "Message body" },
      },
      required: ["recipient"],
    },
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send Email - Mailjet requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    executor: async (context) => executeProviderSpecificEmail({
      ...context,
      packageKey: "mailjet_connector",
      actionKey: "SEND_EMAIL_MAILJET",
    }),
  },
  {
    key: "EMAIL_ALERT",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Email Alert",
    description: "Send a reusable email-template alert through the configured email provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Email Alert requires a recipient");
      if (!action?.templateId && !action?.template) throw new Error("Email Alert requires an email template");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.email",
    executor: async ({ db, action, req, companyId, stepRunId, record, previousRecord, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "EMAIL", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "EMAIL", error: provider.error, jobId: null };
      }
      const resolvedAction = await resolveEmailWorkflowAction({ db, companyId: company, action: { ...action, type: "SEND_EMAIL", contentMode: "TEMPLATE" }, record, previousRecord, object, workflowVariables, req });
      const job = await enqueuePlatformJob({
        db,
        companyId: company,
        kind: "SEND_EMAIL",
        payload: { ...resolvedAction, _roleId: req?.user?.roleId, _stepRunId: stepRunId },
        runAt: new Date(),
        idempotencyKey: action.idempotencyKey || `${company}:email-alert:${stepRunId || action.id || JSON.stringify(action)}`,
      });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "SEND_SMS",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Send SMS",
    description: "Queue an SMS using the configured SMS provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send SMS requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.sms",
    executor: async ({ db, action, req, companyId, stepRunId, record, previousRecord, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "SMS", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "SMS", error: provider.error, jobId: null };
      }
      const resolvedAction = resolveCommunicationWorkflowAction(action, record, object, workflowVariables, req, previousRecord);
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_SMS", payload: { ...resolvedAction, _roleId: req?.user?.roleId, _stepRunId: stepRunId }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
    },
  },
  {
    key: "SEND_WHATSAPP",
    builderVisible: false,
    systemVisible: false,
    legacyTransport: true,
    displayName: "Send WhatsApp",
    description: "Queue a WhatsApp message using the configured provider.",
    validation: (action) => {
      if (!action?.recipient && !action?.to) throw new Error("Send WhatsApp requires a recipient");
    },
    async: true,
    requiredPermissions: ["communications.send"],
    requiredEntitlement: "communications.whatsapp",
    executor: async ({ db, action, req, companyId, stepRunId, record, previousRecord, object, workflowVariables }) => {
      const company = companyId || req?.user?.companyId;
      const provider = await ensureCommunicationProvider({ db, companyId: company, providerKind: "WHATSAPP", stepRunId });
      if (!provider.configured) {
        return { status: "failed", provider: "WHATSAPP", error: provider.error, jobId: null };
      }
      const resolvedAction = resolveCommunicationWorkflowAction(action, record, object, workflowVariables, req, previousRecord);
      const job = await enqueuePlatformJob({ db, companyId: company, kind: "SEND_WHATSAPP", payload: { ...resolvedAction, _roleId: req?.user?.roleId, _stepRunId: stepRunId }, runAt: new Date(), idempotencyKey: action.idempotencyKey || `${company}:${stepRunId || action.id || JSON.stringify(action)}` });
      return { status: job ? "queued" : "skipped", jobId: job?.id || null };
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
    executor: async ({ action, db, businessDb = null, pool, client, req, companyId, userId, record, previousRecord, object, fields, workflowVariables = {} }) => {
      const functionKey = action.functionKey || action.key;
      const functionDefinition = getRegisteredFunction(functionKey);
      if (!functionDefinition) throw new Error(`Function "${functionKey}" is not registered`);
      if (typeof functionDefinition.handler !== "function") {
        throw new Error(`Function "${functionKey}" has no handler`);
      }
      const inputs = Object.fromEntries(Object.entries(action.inputs || {}).map(([key, value]) => [
        key,
        resolveConfiguredResource(value, { record, previousRecord, req, object, workflowVariables }),
      ]));
      return functionDefinition.handler({
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
      if (!action?.workflowId && !action?.subflowId && !action?.subflowApiName && !(action?.workflow && Array.isArray(action.workflow.actions))) throw new Error("Run Subflow requires a workflowId or subflowApiName");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, traceDb = null, debugMode = false, companyId, req, record, previousRecord, object, fields, workflowVariables = {}, workflowDepth = 0, workflowStack = [], runId = null, stepRunId = null, ...context }) => {
      const workflowKey = action.workflowId || action.subflowId || action.subflowApiName || action.workflow?.id || action.workflow?.key || "inline-subflow";
      const runDb = debugMode && traceDb && typeof traceDb === "function" ? traceDb : db;
      const stack = Array.isArray(workflowStack) ? workflowStack.slice() : [];
      if (stack.includes(workflowKey)) {
        throw new Error(`Workflow recursion detected for subflow "${workflowKey}"`);
      }
      const nextDepth = Number(workflowDepth || 0) + 1;
      if (nextDepth > 8) {
        throw new Error(`Maximum workflow depth exceeded for subflow "${workflowKey}"`);
      }
      const subflowDefinition = action.workflow && Array.isArray(action.workflow.actions)
        ? action.workflow
        : (() => {
            if (!db || typeof db !== "function") return null;
            const id = action.workflowId || action.subflowId;
            if (id) return db(`SELECT * FROM platform_rules WHERE id=$1 AND active=true LIMIT 1`, [id]).then((result) => result.rows[0] || null);
            const apiName = action.subflowApiName;
            if (!apiName) return null;
            return db(`SELECT * FROM platform_rules WHERE company_id=$1 AND active=true AND (action->>'apiName'=$2 OR action->>'capabilityKey'=$2) ORDER BY updated_at DESC LIMIT 1`, [companyId || req?.user?.companyId, apiName]).then((result) => result.rows[0] || null);
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
      const mappings = action.workflowInputs || action.inputMappings || action.inputs || action.inputMap || action.mappings || {};
      for (const [targetKey, sourceBinding] of Object.entries(mappings)) {
        const sourceValue = resolveConfiguredResource(sourceBinding, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
        if (sourceValue !== undefined) mappedInputs[targetKey] = sourceValue;
      }
      const inputContract = Array.isArray(definition.action?.inputContract) ? definition.action.inputContract : Array.isArray(definition.inputContract) ? definition.inputContract : [];
      for (const input of inputContract) {
        const name = String(input?.name || "");
        if (!name) continue;
        if (input.required === true && (mappedInputs[name] === undefined || mappedInputs[name] === null || mappedInputs[name] === "")) {
          throw new Error(`Subflow "${definition.name || workflowKey}" requires input "${input.label || name}"`);
        }
        if (mappedInputs[name] === undefined) continue;
        const type = String(input.type || "text").toLowerCase();
        if (type === "number" && !Number.isFinite(Number(mappedInputs[name]))) throw new Error(`Subflow input "${input.label || name}" must be a number`);
        if (type === "boolean" && typeof mappedInputs[name] !== "boolean") throw new Error(`Subflow input "${input.label || name}" must be true or false`);
        if (type === "collection" && !Array.isArray(mappedInputs[name])) throw new Error(`Subflow input "${input.label || name}" must be a collection`);
      }
      const mergedRecord = { ...(record || {}), ...mappedInputs };
      const outputContract = Array.isArray(definition.action?.outputContract) ? definition.action.outputContract : Array.isArray(definition.outputContract) ? definition.outputContract : [];

      if (stepRunId && runDb && typeof runDb === "function") {
        const parentStepResult = await runDb(
          "SELECT child_run_id FROM platform_workflow_step_runs WHERE id=$1 LIMIT 1",
          [stepRunId]
        );
        const existingChildRunId = parentStepResult.rows[0]?.child_run_id || null;
        if (existingChildRunId) {
          const existingChildResult = await runDb(
            "SELECT * FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1",
            [existingChildRunId, targetCompanyId || runtimeCompanyId]
          );
          const existingChild = existingChildResult.rows[0];
          if (existingChild?.status === "WAITING" || existingChild?.status === "RUNNING") {
            return { status: "waiting", workflowId: workflowKey, runId: existingChildRunId, results: existingChild.metadata?.childResults || [] };
          }
          if (existingChild?.status === "FAILED") {
            throw new Error(existingChild.error_text || `Subflow "${definition.name || workflowKey}" failed`);
          }
          if (existingChild?.status === "COMPLETED") {
            const persistedVariables = existingChild.metadata?.finalVariables || { variables: {}, steps: {} };
            const outputs = {};
            for (const output of outputContract) {
              const name = String(output?.name || "");
              if (!name) continue;
              const source = output.source || `variables.${name}`;
              const value = resolveConfiguredResource(source, { record: mergedRecord, previousRecord, req, object, workflowVariables: persistedVariables }, { preserveMissing: false });
              if (output.required === true && value === undefined) throw new Error(`Subflow output "${output.label || name}" was not produced`);
              outputs[name] = value;
            }
            for (const [outputName, target] of Object.entries(action.outputMappings || {})) {
              if (!target) continue;
              const variableName = String(target).replace(/^variables\./, "");
              if (Object.prototype.hasOwnProperty.call(outputs, outputName)) {
                if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
                workflowVariables.variables[variableName] = outputs[outputName];
              }
            }
            return {
              status: "completed",
              workflowId: workflowKey,
              runId: existingChildRunId,
              results: existingChild.metadata?.childResults || [],
              outputs,
              resumed: true,
            };
          }
        }
      }

      const childWorkflowVariables = { variables: { ...mappedInputs }, steps: {} };
      const childVersion = Number(definition.active_version || definition.version || 1);
      const childRun = runDb && typeof runDb === "function"
        ? await createWorkflowRun({
            db: runDb,
            companyId: targetCompanyId || runtimeCompanyId,
            workflowId: workflowKey,
            workflowName: definition.name || action.workflowName || "Subflow",
            workflowVersion: childVersion,
            objectId: object?.id || action.objectId || null,
            recordId: record?.id || action.recordId || null,
            triggerKey: "subflow",
            parentRunId: runId || null,
            status: "RUNNING",
            metadata: {
              parentWorkflow: workflowKey,
              inputMappings: mappings,
              actorUserId: req?.user?.id || context.actorUserId || null,
              storeId: req?.user?.storeId || context.storeId || null,
              tillId: req?.user?.tillId || context.tillId || null,
              initialVariables: childWorkflowVariables,
              initialPreviousRecord: redact(previousRecord || null),
            },
          })
        : null;
      const childResult = await executeWorkflowActions({
        ...context,
        actions: childActions,
        allActions: childActions,
        db,
        object,
        fields,
        record: mergedRecord,
        previousRecord,
        req,
        companyId: targetCompanyId || runtimeCompanyId,
        workflowDepth: nextDepth,
        workflowStack: [...stack, workflowKey],
        workflowVersion: childVersion,
        runId: childRun?.id || runId || null,
        stepRunId: null,
        workflowVariables: childWorkflowVariables,
        traceDb,
        debugMode,
      });
      const childWaiting = workflowResultsContainStatus(childResult, "waiting");
      const outputs = {};
      if (!childWaiting) {
        for (const output of outputContract) {
          const name = String(output?.name || "");
          if (!name) continue;
          const source = output.source || `variables.${name}`;
          const value = resolveConfiguredResource(source, { record: mergedRecord, previousRecord, req, object, workflowVariables: childWorkflowVariables }, { preserveMissing: false });
          if (output.required === true && value === undefined) throw new Error(`Subflow output "${output.label || name}" was not produced`);
          outputs[name] = value;
        }
      }
      const childFailed = childResult.some((item) => item.result?.status === "failed");
      const childStatus = childFailed ? "FAILED" : childWaiting ? "WAITING" : "COMPLETED";
      if (childRun && runDb && typeof runDb === "function") {
        await runDb(
          `UPDATE platform_workflow_runs SET status=$1, completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END, metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb, updated_at=NOW() WHERE id=$3`,
          [childStatus, JSON.stringify({ childResults: childResult, ...(childWaiting ? {} : { finalVariables: childWorkflowVariables, outputs }) }), childRun.id]
        );
      }
      if (stepRunId) {
        await updateWorkflowStepRunStatus({
          db: runDb,
          stepRunId,
          status: childStatus,
          errorText: childResult.find((item) => item.result?.error)?.result?.error || null,
          metadata: { childRunId: childRun?.id || null, childResults: childResult },
        });
        if (childRun?.id) {
          await runDb("UPDATE platform_workflow_step_runs SET child_run_id=$1,updated_at=NOW() WHERE id=$2", [childRun.id, stepRunId]);
        }
      }
      if (!childWaiting) {
        for (const [outputName, target] of Object.entries(action.outputMappings || {})) {
          if (!target) continue;
          const variableName = String(target).replace(/^variables\./, "");
          if (Object.prototype.hasOwnProperty.call(outputs, outputName)) {
            if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
            workflowVariables.variables[variableName] = outputs[outputName];
          }
        }
      }
      return {
        status: childFailed ? "failed" : childWaiting ? "waiting" : "completed",
        workflowId: workflowKey,
        runId: childRun?.id || null,
        results: childResult,
        outputs,
      };
    },
  },
  {
    key: "CALL_WEBHOOK",
    displayName: "Call Webhook",
    description: "Send a webhook to an approved endpoint.",
    schema: {
      type: "object",
      properties: {"url":{"type":"string","title":"Webhook URL"},"method":{"type":"string","title":"Method","enum":["POST","GET","PUT","PATCH"]},"headers":{"type":"object","title":"Headers"},"body":{"type":"object","title":"Body"}},
      required: [],
    },
    validation: (action) => {
      if (!action?.url && !action?.endpoint) throw new Error("Call Webhook requires a url or endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action }) => ({ status: "queued", endpoint: action.url || action.endpoint || null }),
  },
  oneHttpRequestDefinition(),
  {
    key: "HTTP_REQUEST",
    displayName: "HTTP Request",
    description: "Send an HTTP request to an approved endpoint.",
    schema: {
      type: "object",
      properties: {"url":{"type":"string","title":"Request URL"},"method":{"type":"string","title":"Method","enum":["POST","GET","PUT","PATCH","DELETE"]},"headers":{"type":"object","title":"Headers"},"body":{"type":"object","title":"Body"}},
      required: [],
    },
    validation: (action) => {
      if (!action?.url && !action?.endpoint) throw new Error("HTTP Request requires a url or endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action }) => ({ status: "queued", endpoint: action.url || action.endpoint || null }),
  },
  {
    key: "WEBHOOK",
    displayName: "Webhook",
    description: "Send a webhook to an approved endpoint.",
    validation: (action) => {
      if (!action?.url && !action?.endpoint) throw new Error("Webhook requires a url or endpoint");
    },
    async: true,
    requiredPermissions: ["integrations.execute"],
    executor: async ({ action }) => ({ status: "queued", endpoint: action.url || action.endpoint || null }),
  },
  {
    key: "CONDITION",
    displayName: "Decision",
    description: "Evaluate ordered outcomes and follow the first matching path, otherwise the Default path.",
    validation: (action) => {
      const outcomes = Array.isArray(action?.outcomes) ? action.outcomes : [];
      if (outcomes.length) {
        if (outcomes.length > 20) throw new Error("Decision supports a maximum of 20 outcomes");
        const mode = String(action?.decisionLogic || "manual").toLowerCase();
        if (!["manual","ai"].includes(mode)) throw new Error("Decision logic mode is invalid");
        if (mode === "ai" && !String(action?.decisionInstructions || "").trim()) throw new Error("AI Decision requires Decision Instructions");
        const ids = new Set();
        for (const outcome of outcomes) {
          if (!outcome?.id || !/^[A-Za-z0-9_-]{1,100}$/.test(String(outcome.id))) throw new Error("Each Decision outcome requires a valid id");
          if (ids.has(String(outcome.id))) throw new Error("Decision outcome identifiers must be unique");
          ids.add(String(outcome.id));
          if (!String(outcome.label || "").trim()) throw new Error("Each Decision outcome requires a label");
          if (mode === "ai") {
            if (!String(outcome.instructions || "").trim()) throw new Error(`Decision outcome "${outcome.label}" requires Outcome Instructions`);
          } else if (!outcome.condition) throw new Error(`Decision outcome "${outcome.label}" requires conditions`);
          if (outcome.branch !== undefined && !Array.isArray(outcome.branch)) throw new Error(`Decision outcome "${outcome.label}" branch must be a list`);
        }
        if (action.defaultBranch !== undefined && !Array.isArray(action.defaultBranch)) throw new Error("Decision Default branch must be a list");
        return;
      }
      if (!action?.condition) throw new Error("Decision requires at least one outcome");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, fields, record, previousRecord, req, object, workflowVariables = {} }) => {
      const conditionContext = { record, previousRecord, req, object, workflowVariables };
      // Decisions may branch on previous workflow step outputs as well as the
      // trigger record. Exposing steps/variables in this evaluation snapshot
      // keeps routing metadata-driven instead of forcing business state into
      // hard-coded actions.
      const evaluationRecord = {
        ...(record || {}),
        steps: workflowVariables?.steps || {},
        variables: workflowVariables?.variables || {},
      };
      const evaluationPreviousRecord = {
        ...(previousRecord || {}),
        steps: workflowVariables?.steps || {},
        variables: workflowVariables?.variables || {},
      };
      const outcomes = Array.isArray(action?.outcomes) ? action.outcomes : [];
      if (outcomes.length) {
        if (String(action?.decisionLogic || "manual").toLowerCase() === "ai") {
          const service = req?.app?.locals?.oneEngineAgent || null;
          if (!service || typeof service.ask !== "function") throw new Error("AI Decision service is unavailable");
          const options = outcomes.map((outcome, index) => ({
            id: String(outcome.id),
            apiName: String(outcome.apiName || outcome.id),
            label: String(outcome.label || `Outcome ${index + 1}`),
            instructions: String(outcome.instructions || ""),
          }));
          const prompt = [
            String(action.decisionInstructions || ""),
            "Choose exactly one outcome from the options below.",
            ...options.map((option) => `${option.id} | ${option.apiName} | ${option.label}: ${option.instructions}`),
            "Return only the chosen outcome id, API name, or label.",
          ].join("\n");
          const result = await service.ask({
            message: prompt,
            context: {
              record: evaluationRecord,
              previousRecord: evaluationPreviousRecord,
              outcomes: options,
              companyId: req?.user?.companyId || null,
              userId: req?.user?.id || null,
            },
          });
          const answer = String(result?.answer || "").trim().toLowerCase();
          const index = options.findIndex((option) => [option.id,option.apiName,option.label].some((value) => String(value).toLowerCase() === answer));
          if (index >= 0) {
            const outcome = outcomes[index];
            return {
              status: "completed",
              matched: true,
              outcomeId: String(outcome.id),
              outcomeLabel: String(outcome.label || `Outcome ${index + 1}`),
              outcomeIndex: index,
              aiDecision: true,
              provider: result?.provider || null,
              model: result?.model || null,
            };
          }
          return { status: "completed", matched: false, outcomeId: null, outcomeLabel: String(action.defaultLabel || "Default Outcome"), outcomeIndex: -1, aiDecision: true };
        }
        for (let index = 0; index < outcomes.length; index += 1) {
          const outcome = outcomes[index];
          const matched = evaluateCondition(resolveWorkflowConditionConfig(outcome.condition, conditionContext), fields || [], evaluationRecord, evaluationPreviousRecord);
          if (matched) {
            return {
              status: "completed",
              matched: true,
              outcomeId: String(outcome.id),
              outcomeLabel: String(outcome.label || `Outcome ${index + 1}`),
              outcomeIndex: index,
            };
          }
        }
        return { status: "completed", matched: false, outcomeId: null, outcomeLabel: String(action.defaultLabel || "Default Outcome"), outcomeIndex: -1 };
      }
      const result = evaluateCondition(resolveWorkflowConditionConfig(action.condition, conditionContext), fields || [], evaluationRecord, evaluationPreviousRecord);
      return { status: result ? "completed" : "skipped", matched: Boolean(result), legacyBinary: true };
    },
  },
  {
    key: "SCHEDULE_PATH",
    displayName: "Scheduled Path",
    description: "Run selected workflow steps later without blocking the immediate workflow.",
    schema: {
      type: "object",
      properties: {
        pathLabel: { type: "string" },
        scheduleMode: { type: "string", enum: ["OFFSET","AT_DATETIME"] },
        delayAmount: { type: "number" },
        delayUnit: { type: "string", enum: ["MINUTES","HOURS","DAYS"] },
        runAt: { type: "string" },
        branch: { type: "array" },
      },
      required: ["pathLabel","scheduleMode","branch"],
    },
    validation: (action) => {
      if (!String(action?.pathLabel || "").trim()) throw new Error("Scheduled Path requires a name");
      const mode = String(action?.scheduleMode || "OFFSET").toUpperCase();
      if (!["OFFSET","AT_DATETIME"].includes(mode)) throw new Error("Scheduled Path requires a supported timing mode");
      if (!Array.isArray(action?.branch) || !action.branch.length) throw new Error("Scheduled Path requires at least one path step");
      if (mode === "OFFSET") {
        const amount = Number(action.delayAmount);
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Scheduled Path delay must be zero or greater");
        if (!["MINUTES","HOURS","DAYS"].includes(String(action.delayUnit || "MINUTES").toUpperCase())) throw new Error("Scheduled Path delay unit is invalid");
      } else if (!action.runAt) {
        throw new Error("Scheduled Path requires a date/time Resource");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, record, previousRecord, object, workflowVariables = {}, debugMode = false, workflowVersion = 1 }) => {
      const mode = String(action.scheduleMode || "OFFSET").toUpperCase();
      let runAt;
      if (mode === "AT_DATETIME") {
        const resolved = resolveConfiguredResource(action.runAt, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
        runAt = new Date(resolved);
      } else {
        const amount = Number(action.delayAmount || 0);
        const unit = String(action.delayUnit || "MINUTES").toUpperCase();
        const multiplier = unit === "DAYS" ? 86400000 : unit === "HOURS" ? 3600000 : 60000;
        runAt = new Date(Date.now() + amount * multiplier);
      }
      if (Number.isNaN(runAt.getTime())) throw new Error("Scheduled Path resolved to an invalid date/time");
      if (debugMode) {
        return { status: "scheduled", simulated: true, runAt: runAt.toISOString(), pathLabel: action.pathLabel, stepIds: action.branch };
      }
      const tenantId = companyId || req?.user?.companyId;
      const job = await enqueuePlatformJob({
        db,
        companyId: tenantId,
        kind: "WAIT",
        payload: {
          scheduledPath: true,
          parentRunId: runId || null,
          workflowId: action.workflowId || null,
          workflowVersion: Number(workflowVersion || 1),
          scheduledPathId: action.id || null,
          scheduledPathLabel: action.pathLabel,
          scheduledPathStepIds: action.branch,
          sourceStepRunId: stepRunId || null,
          recordId: record?.id || null,
          objectId: object?.id || null,
          workflowVariables: redact(workflowVariables),
          previousRecord: redact(previousRecord || null),
        },
        runAt,
        idempotencyKey: `${tenantId || "workflow"}:scheduled-path:${runId || "no-run"}:${action.id || action.pathLabel}:${runAt.toISOString()}`,
      });
      if (job?.id && stepRunId) {
        await db("UPDATE platform_workflow_step_runs SET durable_job_id=$1,updated_at=NOW() WHERE id=$2", [job.id, stepRunId]);
      }
      return { status: "scheduled", jobId: job?.id || null, runAt: runAt.toISOString(), pathLabel: action.pathLabel, stepIds: action.branch };
    },
  },
  {
    key: "CHOICE",
    displayName: "Choice",
    description: "Create one reusable screen choice.",
    schema: { type: "object", properties: { resourceName: { type: "string" }, choiceLabel: { type: "string" }, choiceValue: {}, choiceDataType: { type: "string" } }, required: ["resourceName","choiceLabel"] },
    validation: (action) => {
      if (!action?.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(action.resourceName))) throw new Error("Choice requires a valid API Name");
      if (!String(action.choiceLabel || "").trim()) throw new Error("Choice requires a label");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const value = resolveConfiguredResource(action.choiceValue, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
      const choice = { label: String(action.choiceLabel), value, dataType: action.choiceDataType || "text" };
      workflowVariables.variables[String(action.resourceName)] = choice;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "choice", value: choice };
    },
  },
  {
    key: "COLLECTION_CHOICE_SET",
    displayName: "Collection Choice Set",
    description: "Map a Flow collection into reusable screen choices.",
    schema: { type: "object", properties: { resourceName: { type: "string" }, collection: { type: "string" }, choiceLabelPath: { type: "string" }, choiceValuePath: { type: "string" } }, required: ["resourceName","collection","choiceLabelPath","choiceValuePath"] },
    validation: (action) => {
      if (!action?.resourceName || !action?.collection || !action?.choiceLabelPath || !action?.choiceValuePath) throw new Error("Collection Choice Set is incomplete");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const source = resolveConfiguredResource(action.collection, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
      const getPath = (item, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], item);
      const choices = (Array.isArray(source) ? source : []).map((item) => ({
        label: String(getPath(item, action.choiceLabelPath) ?? ""),
        value: getPath(item, action.choiceValuePath),
        controllingValues: Array.isArray(item?.controllingValues) ? item.controllingValues : undefined,
      })).filter((choice) => choice.label);
      workflowVariables.variables[String(action.resourceName)] = choices;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "choice_collection", value: choices, count: choices.length };
    },
  },
  {
    key: "PICKLIST_CHOICE_SET",
    displayName: "Picklist Choice Set",
    description: "Reuse the configured values of a picklist field as screen choices.",
    schema: { type: "object", properties: { resourceName: { type: "string" }, object: { type: "string" }, fieldApiName: { type: "string" } }, required: ["resourceName","object","fieldApiName"] },
    validation: (action) => {
      if (!action?.resourceName || !action?.object || !action?.fieldApiName) throw new Error("Picklist Choice Set is incomplete");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const target = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const fieldResult = await db(
        `SELECT * FROM platform_fields
          WHERE object_id=$1 AND api_name=$2 AND active=true AND (company_id IS NULL OR company_id=$3)
          LIMIT 1`,
        [target.id, action.fieldApiName, companyId || req?.user?.companyId]
      );
      const field = fieldResult.rows?.[0];
      if (!field) throw new Error("Picklist field is unavailable");
      if (!["picklist","select","multiselect"].includes(String(field.field_type || "").toLowerCase())) throw new Error("Selected field is not picklist-compatible");
      const secured = req?.user ? await applyFieldSecurity(db, [field], req) : [field];
      if (!secured.length || secured[0]?.readable === false) throw new Error("Picklist field is not readable for this user");
      const config = field.config && typeof field.config === "object" ? field.config : {};
      const raw = Array.isArray(config.options) ? config.options : Array.isArray(config.values) ? config.values : Array.isArray(config.choices) ? config.choices : [];
      const choices = raw.map((item) => typeof item === "object"
        ? {
            label: String(item.label ?? item.value ?? ""),
            value: item.value ?? item.key ?? item.label,
            controllingValues: Array.isArray(item.controllingValues) ? item.controllingValues : Array.isArray(item.validFor) ? item.validFor : undefined,
          }
        : { label: String(item), value: item }).filter((choice) => choice.label);
      workflowVariables.variables[String(action.resourceName)] = choices;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "choice_collection", value: choices, count: choices.length };
    },
  },
  {
    key: "RECORD_CHOICE_SET",
    displayName: "Record Choice Set",
    description: "Build screen choices from tenant-scoped records.",
    schema: { type: "object", properties: { resourceName: { type: "string" }, object: { type: "string" }, choiceLabelField: { type: "string" }, choiceValueField: { type: "string" }, limit: { type: "number" } }, required: ["resourceName","object","choiceLabelField","choiceValueField"] },
    validation: (action) => {
      if (!action?.resourceName || !action?.object || !action?.choiceLabelField || !action?.choiceValueField) throw new Error("Record Choice Set is incomplete");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const target = await resolveWorkflowTargetObject({ db, action, object, companyId, req });
      const tenantId = companyId || req?.user?.companyId;
      const metadataResult = await db(
        `SELECT * FROM platform_fields
          WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)`,
        [target.id, tenantId]
      );
      const securedFields = req?.user
        ? await applyFieldSecurity(db, metadataResult.rows || [], req)
        : (metadataResult.rows || []);
      const fields = securedFields.filter((field) => field.readable !== false && isSafeIdentifier(field.source_column || field.api_name || ""));
      const fieldByKey = new Map();
      for (const field of fields) {
        fieldByKey.set(String(field.api_name), field);
        if (field.source_column) fieldByKey.set(String(field.source_column), field);
      }
      const labelField = fieldByKey.get(String(action.choiceLabelField));
      const valueField = String(action.choiceValueField) === "id"
        ? { api_name: "id", source_column: "id" }
        : fieldByKey.get(String(action.choiceValueField));
      const labelColumn = labelField?.source_column || labelField?.api_name;
      const valueColumn = valueField?.source_column || valueField?.api_name;
      if (!isSafeIdentifier(labelColumn) || !isSafeIdentifier(valueColumn)) throw new Error("Record Choice Set fields are unavailable");

      const parameter = (position) => String.fromCharCode(36) + position;
      const params = [];
      const clauses = [];
      if (target.company_scoped !== false) {
        params.push(tenantId);
        clauses.push('"company_id"=' + parameter(params.length));
      }
      if (target.store_scoped) {
        if (!req?.user?.storeId) throw new Error("Record Choice Set requires an active store");
        params.push(req.user.storeId);
        clauses.push('"store_id"=' + parameter(params.length));
      }

      const filterClauses = [];
      for (const filter of Array.isArray(action.filters) ? action.filters : []) {
        const metadata = fieldByKey.get(String(filter?.field || ""));
        if (!metadata || !isSafeIdentifier(metadata.source_column || metadata.api_name)) {
          throw new Error(`Record Choice Set filter field "${filter?.field || ""}" is unavailable`);
        }
        const column = '"' + (metadata.source_column || metadata.api_name) + '"';
        const operator = String(filter?.operator || "equals").toLowerCase();
        const value = resolveConfiguredResource(filter?.value, { record: null, previousRecord: null, req, object, workflowVariables });
        if (operator === "is_empty") {
          filterClauses.push("(" + column + " IS NULL OR " + column + "::text='')");
          continue;
        }
        if (operator === "is_not_empty") {
          filterClauses.push("(" + column + " IS NOT NULL AND " + column + "::text<>'')");
          continue;
        }
        params.push(value);
        const placeholder = parameter(params.length);
        if (operator === "equals") filterClauses.push(column + "=" + placeholder);
        else if (operator === "not_equals") filterClauses.push(column + "<>" + placeholder);
        else if (operator === "greater_than") filterClauses.push(column + ">" + placeholder);
        else if (operator === "greater_than_or_equal") filterClauses.push(column + ">=" + placeholder);
        else if (operator === "less_than") filterClauses.push(column + "<" + placeholder);
        else if (operator === "less_than_or_equal") filterClauses.push(column + "<=" + placeholder);
        else if (operator === "contains") filterClauses.push(column + "::text ILIKE '%' || " + placeholder + "::text || '%'");
        else throw new Error(`Record Choice Set uses unsupported operator "${operator}"`);
      }
      if (filterClauses.length) {
        clauses.push("(" + filterClauses.join(String(action.match || "all").toLowerCase() === "any" ? " OR " : " AND ") + ")");
      }

      let orderBy = ` ORDER BY "${labelColumn}" ASC NULLS LAST`;
      if (action.sortField) {
        const sortMetadata = fieldByKey.get(String(action.sortField));
        if (!sortMetadata || !isSafeIdentifier(sortMetadata.source_column || sortMetadata.api_name)) {
          throw new Error(`Record Choice Set sort field "${action.sortField}" is unavailable`);
        }
        const direction = String(action.sortDirection || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
        orderBy = ` ORDER BY "${sortMetadata.source_column || sortMetadata.api_name}" ${direction} NULLS LAST`;
      }
      params.push(Math.max(1, Math.min(200, Number(action.limit || 50))));
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const result = await db(
        `SELECT "${labelColumn}" AS label_value,"${valueColumn}" AS stored_value
           FROM "${target.source_table}"${where}${orderBy}
          LIMIT ${parameter(params.length)}`,
        params
      );
      const choices = (result.rows || []).map((row) => ({ label: String(row.label_value ?? ""), value: row.stored_value })).filter((choice) => choice.label);
      workflowVariables.variables[String(action.resourceName)] = choices;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "choice_collection", value: choices, count: choices.length };
    },
  },
  {
    key: "STAGE",
    displayName: "Stage",
    description: "Define an ordered Screen Flow progress stage.",
    schema: { type: "object", properties: { resourceName: { type: "string" }, stageLabel: { type: "string" }, stageValue: {}, stageOrder: { type: "number" } }, required: ["resourceName","stageLabel"] },
    validation: (action) => {
      if (!action?.resourceName || !String(action.stageLabel || "").trim()) throw new Error("Stage is incomplete");
      if (!String(action.stageValue || "").trim()) throw new Error("Stage requires a value");
      if (!Number.isInteger(Number(action.stageOrder)) || Number(action.stageOrder) < 1) throw new Error("Stage order must be 1 or greater");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const stage = { label: String(action.stageLabel), value: action.stageValue ?? action.resourceName, order: Math.max(1, Number(action.stageOrder || 1)), active: action.stageActive !== false };
      workflowVariables.variables[String(action.resourceName)] = stage;
      const stages = Array.isArray(workflowVariables.variables.__flowStages) ? workflowVariables.variables.__flowStages : [];
      workflowVariables.variables.__flowStages = [...stages.filter((item) => String(item?.value) !== String(stage.value)), stage].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      if (stage.active && !workflowVariables.variables.__flowCurrentStage) workflowVariables.variables.__flowCurrentStage = stage;
      return { status: "completed", resourceName: String(action.resourceName), resourceType: "stage", value: stage };
    },
  },
  {
    key: "RECOMMENDATION_ASSIGNMENT",
    displayName: "Recommendation Assignment",
    description: "Create a new recommendation collection from an existing collection and mapped values.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        recommendationMappings: { type: "object" },
        apiName: { type: "string" },
      },
      required: ["collection","recommendationMappings"],
    },
    validation: (action) => {
      if (!action?.collection) throw new Error("Recommendation Assignment requires a source collection");
      if (!action.recommendationMappings || typeof action.recommendationMappings !== "object" || !Object.keys(action.recommendationMappings).length) {
        throw new Error("Recommendation Assignment requires at least one mapping");
      }
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record, previousRecord, req, object, workflowVariables = {} }) => {
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const context = { record, previousRecord, req, object, workflowVariables };
      const source = resolveConfiguredResource(action.collection, context, { preserveMissing: false });
      const mappings = action.recommendationMappings || {};
      const readItemPath = (item, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], item);
      const output = (Array.isArray(source) ? source : []).map((item) => {
        const recommendation = item && typeof item === "object" && !Array.isArray(item) ? { ...item } : {};
        for (const [field, configured] of Object.entries(mappings)) {
          if (configured === undefined || configured === null || configured === "") continue;
          let value;
          if (typeof configured === "string" && configured.startsWith("item.")) {
            value = readItemPath(item, configured.slice(5));
          } else if (configured === "item") {
            value = item;
          } else {
            value = resolveConfiguredResource(configured, { ...context, record: item }, { preserveMissing: false });
          }
          recommendation[field] = value;
        }
        return recommendation;
      });
      const resourceName = String(action.apiName || action.resourceName || "Recommendations");
      workflowVariables.variables[resourceName] = output;
      return {
        status: "completed",
        resourceName,
        resourceType: "collection",
        value: output,
        recommendations: output,
        count: output.length,
      };
    },
  },
  {
    key: "LIMIT_REPETITIONS",
    displayName: "Limit Repetitions",
    description: "Filter recommendations based on recent accepted/rejected reaction history.",
    schema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        repetitionReactions: { type: "array" },
        repetitionCount: { type: "number" },
        repetitionDays: { type: "number" },
        repetitionScope: { type: "string", enum: ["USER","RECORD","USER_OR_RECORD"] },
      },
      required: ["collection","repetitionReactions","repetitionCount","repetitionDays"],
    },
    validation: (action) => {
      if (!action?.collection) throw new Error("Limit Repetitions requires a recommendation collection");
      const reactions = Array.isArray(action.repetitionReactions) ? action.repetitionReactions.map((value) => String(value).toUpperCase()) : [];
      if (!reactions.length || reactions.some((value) => !["ACCEPTED","REJECTED"].includes(value))) throw new Error("Limit Repetitions requires accepted and/or rejected responses");
      if (!Number.isInteger(Number(action.repetitionCount)) || Number(action.repetitionCount) < 1) throw new Error("Limit Repetitions response count must be at least 1");
      if (!Number.isInteger(Number(action.repetitionDays)) || Number(action.repetitionDays) < 1) throw new Error("Limit Repetitions day window must be at least 1");
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId, req, record, previousRecord, object, workflowVariables = {} }) => {
      const context = { record, previousRecord, req, object, workflowVariables };
      const source = resolveConfiguredResource(action.collection, context, { preserveMissing: false });
      const recommendations = Array.isArray(source) ? source : [];
      if (!recommendations.length) return { status: "completed", recommendations: [], count: 0, suppressed: 0 };
      const tenantId = companyId || req?.user?.companyId;
      const userId = req?.user?.id || null;
      const recordId = record?.id || null;
      const scope = String(action.repetitionScope || "USER_OR_RECORD").toUpperCase();
      const reactions = [...new Set((action.repetitionReactions || []).map((value) => String(value).toUpperCase()).filter((value) => ["ACCEPTED","REJECTED"].includes(value)))];
      const limit = Math.max(1, Number(action.repetitionCount || 1));
      const days = Math.max(1, Number(action.repetitionDays || 1));
      const keyFor = (item) => String(item?.recommendationKey ?? item?.RecommendationKey ?? item?.recommendation_key ?? item?.id ?? item?.key ?? "").trim();
      const keys = [...new Set(recommendations.map(keyFor).filter(Boolean))];
      if (!keys.length) return { status: "completed", recommendations, count: recommendations.length, suppressed: 0 };

      const params = [tenantId, keys, reactions, days];
      const scopeClauses = [];
      if (scope === "USER" || scope === "USER_OR_RECORD") {
        params.push(userId);
        scopeClauses.push(`user_id=${params.length}`);
      }
      if (scope === "RECORD" || scope === "USER_OR_RECORD") {
        params.push(recordId);
        scopeClauses.push(`record_id=${params.length}`);
      }
      const scopeSql = scopeClauses.length
        ? ` AND (${scopeClauses.map((clause) => `(${clause})`).join(" OR ")})`
        : "";
      const result = await db(
        `SELECT recommendation_key,COUNT(*)::int AS reaction_count
           FROM platform_recommendation_reactions
          WHERE company_id=$1
            AND recommendation_key=ANY($2::text[])
            AND reaction=ANY($3::text[])
            AND reacted_at >= date_trunc('day',NOW()) - ($4::int * INTERVAL '1 day')
            ${scopeSql}
          GROUP BY recommendation_key`,
        params
      );
      const counts = new Map((result.rows || []).map((row) => [String(row.recommendation_key), Number(row.reaction_count || 0)]));
      const output = recommendations.filter((item) => {
        const key = keyFor(item);
        if (!key) return true;
        return Number(counts.get(key) || 0) < limit;
      });
      return {
        status: "completed",
        recommendations: output,
        collection: output,
        count: output.length,
        suppressed: recommendations.length - output.length,
        reactionCounts: Object.fromEntries(counts),
      };
    },
  },
  {
    key: "RUN_AGENT",
    displayName: "Run Agent",
    description: "Run an active OneEngine agent with request/session inputs and capture unstructured or structured outputs.",
    schema: {
      type: "object",
      properties: {
        agentKey: { type: "string" },
        agentDefinition: { type: "object" },
        agentPrompt: {},
        sessionId: {},
        structuredOutput: { type: "array" },
        agentResponseVariable: { type: "string" },
        agentSessionVariable: { type: "string" },
        structuredResponseVariable: { type: "string" },
      },
      required: ["agentPrompt"],
    },
    validation: (action) => {
      if (!action?.agentPrompt) throw new Error("Run Agent requires an Agent Request");
      const names = new Set();
      for (const field of action?.structuredOutput || []) {
        const name = String(field?.name || "");
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error("Run Agent structured output field names must be valid API names");
        if (names.has(name.toLowerCase())) throw new Error("Run Agent structured output field names must be unique");
        names.add(name.toLowerCase());
        if (!["text","number","boolean"].includes(String(field?.dataType || ""))) throw new Error("Run Agent structured output field type must be String, Number, or Boolean");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, db, companyId = null, record, previousRecord, req, object, workflowVariables = {}, agentService = null }) => {
      const service = agentService || req?.app?.locals?.oneEngineAgent || null;
      if (!service || typeof service.ask !== "function") throw new Error("OneEngine agent service is unavailable");
      if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
      const contextBase = { record, previousRecord, req, object, workflowVariables };
      const promptValue = resolveConfiguredResource(action.agentPrompt, contextBase, { preserveMissing: false });
      const prompt = String(promptValue ?? "").trim();
      if (!prompt) throw new Error("Run Agent request resolved to an empty value");
      const resolvedSession = action.sessionId
        ? resolveConfiguredResource(action.sessionId, contextBase, { preserveMissing: false })
        : null;
      const agentKey = String(action.agentKey || "oneengine_assistant");
      let agentDefinition = action.agentDefinition && typeof action.agentDefinition === "object" ? action.agentDefinition : null;
      if (!agentDefinition && agentKey !== "oneengine_assistant") {
        if (!db || typeof db !== "function") throw new Error("Run Agent cannot load the selected agent");
        const agentResult = await db(
          `SELECT id,label,api_name,description,user_access,instructions,actions,active
             FROM platform_agents
            WHERE company_id=$1 AND api_name=$2 AND active=true
            LIMIT 1`,
          [companyId || req?.user?.companyId, agentKey]
        );
        const agentRow = agentResult.rows?.[0] || null;
        if (!agentRow) throw new Error(`Run Agent selected agent "${agentKey}" is not active or does not exist`);
        agentDefinition = {
          id: agentRow.id,
          label: agentRow.label,
          apiName: agentRow.api_name,
          description: agentRow.description || "",
          userAccess: agentRow.user_access || "",
          instructions: agentRow.instructions || "",
          actions: Array.isArray(agentRow.actions) ? agentRow.actions : [],
        };
      }
      const safeContext = {
        companyId: req?.user?.companyId || null,
        storeId: req?.user?.storeId || null,
        roleId: req?.user?.roleId || null,
        userId: req?.user?.id || null,
        permissions: Array.isArray(req?.user?.permissions) ? req.user.permissions : [],
        agentKey,
        agentDefinition,
        sessionId: resolvedSession || null,
      };
      const result = await service.ask({ message: prompt, context: safeContext, sessionId: resolvedSession || undefined });
      const sessionId = result?.sessionId || result?.session_id || resolvedSession || null;
      const structuredSpec = Array.isArray(action.structuredOutput) ? action.structuredOutput : [];
      let structured = result?.structuredResponse || result?.structured || null;
      if (structuredSpec.length && (!structured || typeof structured !== "object" || Array.isArray(structured))) {
        try {
          const parsed = JSON.parse(String(result?.answer || ""));
          structured = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch { structured = {}; }
      }
      if (structuredSpec.length) {
        const normalized = {};
        for (const field of structuredSpec) {
          const name = String(field.name);
          const present = Object.prototype.hasOwnProperty.call(structured || {}, name);
          let value = present ? structured[name] : null;
          const type = String(field.dataType || "text");
          if (value != null && type === "number") value = Number(value);
          if (value != null && type === "boolean") value = [true,1,"true","1"].includes(value);
          if (value != null && type === "text") value = String(value);
          if (field.required === true && !present) throw new Error(`Run Agent required structured output "${name}" was not returned`);
          normalized[name] = value;
          normalized[`${name}_set`] = present;
        }
        structured = normalized;
      }
      const responseVar = String(action.agentResponseVariable || "AgentResponse");
      const sessionVar = String(action.agentSessionVariable || "SessionId");
      const structuredVar = String(action.structuredResponseVariable || "StructuredAgentResponse");
      workflowVariables.variables[responseVar] = structuredSpec.length ? null : (result?.answer ?? null);
      workflowVariables.variables[sessionVar] = sessionId;
      workflowVariables.variables[structuredVar] = structuredSpec.length ? structured : null;
      return {
        status: "completed",
        agentKey,
        answer: structuredSpec.length ? null : (result?.answer ?? null),
        sessionId,
        structuredResponse: structuredSpec.length ? structured : null,
        provider: result?.provider || null,
        model: result?.model || null,
        latencyMs: result?.latencyMs || null,
      };
    },
  },
  {
    key: "SCREEN",
    displayName: "Screen",
    description: "Pause a flow and present a metadata-defined interactive screen.",
    schema: {
      type: "object",
      properties: {
        screen: { type: "object" },
        allowBack: { type: "boolean" },
        allowNext: { type: "boolean" },
        allowFinish: { type: "boolean" },
        showFooter: { type: "boolean" },
      },
      required: ["screen"],
    },
    validation: (action) => {
      const screen = action?.screen;
      if (!screen || typeof screen !== "object" || Array.isArray(screen)) throw new Error("Screen requires a screen definition");
      if (!String(screen.label || "").trim()) throw new Error("Screen requires a label");
      if (!String(screen.apiName || "").trim()) throw new Error("Screen requires an API Name");
      if (!Array.isArray(screen.components)) throw new Error("Screen components must be an array");
      const names = screen.components.map((component) => String(component?.name || "").trim()).filter(Boolean);
      if (new Set(names).size !== names.length) throw new Error("Screen component names must be unique");
      const visibilityOperators = new Set(["truthy","falsy","is_empty","is_not_empty","equals","not_equals","contains","not_contains","greater_than","greater_or_equal","less_than","less_or_equal"]);
      const visibilityCompareOperators = new Set(["equals","not_equals","contains","not_contains","greater_than","greater_or_equal","less_than","less_or_equal"]);
      const validateVisibilityLogic = (logic, count) => {
        const value = String(logic || "").trim();
        if (!value) throw new Error("Screen custom visibility logic is required");
        if (value.length > 1000) throw new Error("Screen custom visibility logic must be 1000 characters or fewer");
        const tokens = value.match(/\d+|AND|OR|NOT|\(|\)/gi) || [];
        if (!tokens.length || tokens.join("").toUpperCase() !== value.replace(/\s+/g, "").toUpperCase()) throw new Error("Screen custom visibility logic is invalid");
        const indexes = tokens.filter((token) => /^\d+$/.test(token)).map(Number);
        if (!indexes.length || indexes.some((index) => index < 1 || index > count)) throw new Error("Screen custom visibility logic references an unavailable condition");
      };
      for (const component of screen.components) {
        const width = Number(component?.width ?? 12);
        if (!Number.isInteger(width) || width < 1 || width > 12) throw new Error("Screen component width must be between 1 and 12 columns");
        if (!["top","center","bottom"].includes(String(component?.verticalAlignment || "top"))) throw new Error("Screen component vertical alignment is invalid");
        if (component?.type === "SECTION") {
          const columns = Number(component.columns || 1);
          if (!Number.isInteger(columns) || columns < 1 || columns > 4) throw new Error("Screen Section must have between 1 and 4 columns");
          const widths = Array.isArray(component.columnWidths) ? component.columnWidths.map(Number) : [];
          if (widths.length !== columns || widths.some((value) => !Number.isInteger(value) || value < 1 || value > 12) || widths.reduce((sum, value) => sum + value, 0) !== 12) {
            throw new Error("Screen Section column widths must total 12");
          }
          if (component.includeHeader === true && !String(component.heading || "").trim()) throw new Error("Screen Section header label is required");
        }
        const mode = String(component?.visibilityMode || "");
        const conditions = Array.isArray(component?.visibilityConditions) ? component.visibilityConditions : [];
        if (mode && mode !== "always") {
          if (!["all","any","custom"].includes(mode)) throw new Error("Screen component visibility mode is invalid");
          if (!conditions.length) throw new Error("Screen component visibility requires at least one condition");
          for (const condition of conditions) {
            const operator = condition?.operator || "truthy";
            if (!String(condition?.resource || "").trim()) throw new Error("Screen visibility condition requires a resource");
            if (!visibilityOperators.has(operator)) throw new Error(`Unsupported screen visibility operator: ${operator}`);
            if (String(condition.resource) === String(component.name || "")) throw new Error("A screen component cannot control its own visibility");
            if (visibilityCompareOperators.has(operator) && String(condition?.value ?? "").trim() === "") throw new Error("Screen visibility comparison requires a compare value");
          }
          if (mode === "custom") validateVisibilityLogic(component.visibilityLogic, conditions.length);
          continue;
        }
        if (!component?.visibilityResource) continue;
        const operator = component.visibilityOperator || "truthy";
        if (!visibilityOperators.has(operator)) throw new Error(`Unsupported screen visibility operator: ${operator}`);
        if (String(component.visibilityResource) === String(component.name || "")) throw new Error("A screen component cannot control its own visibility");
        if (visibilityCompareOperators.has(operator) && String(component.visibilityValue ?? "").trim() === "") throw new Error("Screen visibility comparison requires a compare value");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, workflowVariables = {}, record = null, object = null }) => {
      const tenantId = companyId || req?.user?.companyId;
      if (!runId) throw new Error("Screen requires a persisted workflow run");
      const rawScreen = action.screen || {};
      const resolveScreenResource = (value) => resolveConfiguredResource(value, { req, workflowVariables }, { preserveMissing: false });
      const components = (Array.isArray(rawScreen.components) ? rawScreen.components : []).map((component) => {
        const next = { ...component };
        if (component?.choiceResource) {
          const resolved = resolveScreenResource(component.choiceResource);
          const choices = Array.isArray(resolved) ? resolved : resolved && typeof resolved === "object" && Object.prototype.hasOwnProperty.call(resolved, "label") ? [resolved] : [];
          next.options = choices.map((choice) => ({
            label: String(choice?.label ?? choice?.value ?? ""),
            value: choice?.value ?? choice?.label,
            controllingValues: Array.isArray(choice?.controllingValues) ? choice.controllingValues : undefined,
          })).filter((choice) => choice.label);
        }
        if (typeof component?.defaultValue === "string" && /^(?:\$|steps\.|variables\.)/.test(component.defaultValue)) {
          next.defaultValue = resolveScreenResource(component.defaultValue);
        }
        if (Array.isArray(component?.visibilityConditions) && component.visibilityConditions.length) {
          next.visibilityInitialValues = component.visibilityConditions.map((condition) => resolveScreenResource(condition?.resource));
        } else if (component?.visibilityResource) {
          next.visibilityInitialValue = resolveScreenResource(component.visibilityResource);
        }
        if (component?.type === "DATA_TABLE" && component?.dataResource) {
          const rows = resolveScreenResource(component.dataResource);
          next.rows = Array.isArray(rows) ? rows : [];
        }
        if (component?.type === "IMAGE" && component?.source) {
          next.resolvedSource = /^(?:\$|steps\.|variables\.)/.test(String(component.source))
            ? resolveScreenResource(component.source)
            : component.source;
        }
        if (component?.type === "LINK" && component?.href) {
          next.resolvedHref = /^(?:\$|steps\.|variables\.)/.test(String(component.href))
            ? resolveScreenResource(component.href)
            : component.href;
        }
        if (component?.type === "PROGRESS" && component?.stageResource) {
          next.resolvedStage = resolveScreenResource(component.stageResource);
        }
        if (component?.type === "FILE_UPLOAD") {
          const targetRecord = component.fileRecordResource
            ? resolveScreenResource(component.fileRecordResource)
            : record?.id || null;
          next.fileTarget = {
            objectKey: component.fileObjectKey || object?.object_key || object?.objectKey || null,
            recordId: targetRecord && typeof targetRecord === "object" ? targetRecord.id || null : targetRecord,
            category: component.fileCategory || null,
          };
        }
        return next;
      });
      const stages = (Array.isArray(workflowVariables.variables?.__flowStages)
        ? workflowVariables.variables.__flowStages
        : Object.values(workflowVariables.variables || {}).filter((value) => value && typeof value === "object" && !Array.isArray(value) && Number.isFinite(Number(value.order)) && value.label))
        .filter((stage) => stage?.active !== false)
        .sort((a, b) => Number(a.order) - Number(b.order));
      const currentStage = rawScreen.currentStageResource
        ? resolveScreenResource(rawScreen.currentStageResource)
        : workflowVariables.variables?.__flowCurrentStage || null;
      if (currentStage) workflowVariables.variables.__flowCurrentStage = currentStage;
      const screen = {
        ...rawScreen,
        components,
        stages,
        currentStage,
        allowBack: action.allowBack !== false,
        allowNext: action.allowNext !== false,
        allowFinish: action.allowFinish === true,
        allowPause: action.allowPause === true,
        showFooter: action.showFooter !== false,
        nextLabel: action.nextLabel || "Next",
        finishLabel: action.finishLabel || "Finish",
        previousLabel: action.previousLabel || "Previous",
        pauseLabel: action.pauseLabel || "Pause",
      };
      const existing = await db(
        "SELECT * FROM platform_workflow_screen_sessions WHERE run_id=$1 AND step_identifier=$2 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1",
        [runId, String(action.id || action.screen?.apiName || stepRunId || "screen")]
      );
      if (existing.rows?.[0]) {
        return {
          status: "waiting",
          screenSessionId: existing.rows[0].id,
          screen: existing.rows[0].screen,
          resumed: false,
        };
      }
      const initialValues = {};
      for (const component of components) {
        const name = String(component?.name || "").trim();
        if (!name || component?.input === false) continue;
        if (Object.prototype.hasOwnProperty.call(workflowVariables.variables || {}, name)) {
          initialValues[name] = workflowVariables.variables[name];
        }
      }
      const result = await db(
        `INSERT INTO platform_workflow_screen_sessions
           (company_id,workflow_id,run_id,step_run_id,step_identifier,status,screen,values,workflow_variables,history,actor_user_id,expires_at)
         SELECT $1,r.workflow_id,r.id,$2,$3,'ACTIVE',$4::jsonb,$5::jsonb,$6::jsonb,'[]'::jsonb,$7,NOW() + INTERVAL '24 hours'
         FROM platform_workflow_runs r
         WHERE r.id=$8 AND r.company_id=$1
         RETURNING *`,
        [
          tenantId,
          stepRunId || null,
          String(action.id || action.screen?.apiName || stepRunId || "screen"),
          JSON.stringify(screen),
          JSON.stringify(initialValues),
          JSON.stringify(workflowVariables || { variables: {}, steps: {} }),
          req?.user?.id || null,
          runId,
        ]
      );
      const session = result.rows?.[0];
      if (!session) throw new Error("Unable to create Screen session");
      if (stepRunId) {
        await db(
          "UPDATE platform_workflow_step_runs SET status='WAITING',metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2",
          [JSON.stringify({ screenSessionId: session.id, screenApiName: screen.apiName || null }), stepRunId]
        );
      }
      await db(
        "UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [runId, tenantId]
      );
      return { status: "waiting", screenSessionId: session.id, screen, resumed: false };
    },
  },
  {
    key: "WAIT_DURATION",
    displayName: "Wait for Amount of Time",
    description: "Pause a workflow for a specific amount of time and optionally resume at a specific local time of day.",
    schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        unit: { type: "string", enum: ["minutes","hours","days","months"] },
        resumeAtSpecificTime: { type: "boolean" },
        resumeTime: { type: "string" },
        timeZone: { type: "string" },
      },
      required: ["amount","unit"],
    },
    validation: (action) => {
      const amount = Number(action?.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Wait for Amount of Time requires an amount greater than zero");
      if (!["minutes","hours","days","months"].includes(String(action?.unit || "").toLowerCase())) throw new Error("Wait for Amount of Time unit must be Minutes, Hours, Days, or Months");
      if (action?.resumeAtSpecificTime === true) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(action?.resumeTime || ""))) throw new Error("Wait for Amount of Time resume time is invalid");
        if (!String(action?.timeZone || "").trim()) throw new Error("Wait for Amount of Time time zone is required");
        try { new Intl.DateTimeFormat("en-US", { timeZone: String(action.timeZone) }).format(new Date()); }
        catch { throw new Error("Wait for Amount of Time time zone is invalid"); }
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, debugMode = false, debugWaitElementBehavior = false, debugWaitPaths = {} }) => {
      const tenantId = companyId || req?.user?.companyId;
      const amount = Number(action.amount);
      const unit = String(action.unit || "minutes").toLowerCase();
      const now = new Date();
      let expiry = new Date(now);
      if (unit === "minutes") expiry = new Date(now.getTime() + amount * 60000);
      else if (unit === "hours") expiry = new Date(now.getTime() + amount * 3600000);
      else if (unit === "days") expiry = new Date(now.getTime() + amount * 86400000);
      else {
        if (!Number.isInteger(amount)) throw new Error("Wait for Amount of Time months must be a whole number");
        expiry.setUTCMonth(expiry.getUTCMonth() + amount);
      }

      const zonedParts = (date, timeZone) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(date);
        return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
      };
      const localToUtc = (year, month, day, hour, minute, timeZone) => {
        let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        for (let attempt = 0; attempt < 4; attempt++) {
          const parts = zonedParts(new Date(guess), timeZone);
          const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second || 0));
          const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
          const delta = desired - rendered;
          if (Math.abs(delta) < 1000) break;
          guess += delta;
        }
        return new Date(guess);
      };
      const addLocalDay = (year, month, day) => {
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + 1);
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      };

      let runAt = expiry;
      if (action.resumeAtSpecificTime === true) {
        const timeZone = String(action.timeZone);
        const [resumeHour, resumeMinute] = String(action.resumeTime).split(":").map(Number);
        const local = zonedParts(expiry, timeZone);
        let dateParts = { year: Number(local.year), month: Number(local.month), day: Number(local.day) };
        const expiredMinutes = Number(local.hour) * 60 + Number(local.minute);
        const desiredMinutes = resumeHour * 60 + resumeMinute;
        if (expiredMinutes > desiredMinutes) dateParts = addLocalDay(dateParts.year, dateParts.month, dateParts.day);
        runAt = localToUtc(dateParts.year, dateParts.month, dateParts.day, resumeHour, resumeMinute, timeZone);
        if (runAt.getTime() < expiry.getTime()) {
          dateParts = addLocalDay(dateParts.year, dateParts.month, dateParts.day);
          runAt = localToUtc(dateParts.year, dateParts.month, dateParts.day, resumeHour, resumeMinute, timeZone);
        }
      }

      if (debugMode && debugWaitElementBehavior) {
        const selectedPath = debugWaitPaths?.[action.id];
        if (!selectedPath) throw new Error(`Select a Wait Path for "${action.label || action.apiName || action.id || "Wait for Amount of Time"}"`);
        return {
          status: "completed",
          simulated: true,
          debugWait: true,
          selectedPath,
          waitType: "WAIT_DURATION",
          amount,
          unit,
          resumeAt: runAt.toISOString(),
        };
      }

      const job = await enqueuePlatformJob({
        db,
        companyId: tenantId,
        kind: "WAIT",
        payload: {
          runId,
          stepRunId,
          amount,
          unit,
          resumeAtSpecificTime: action.resumeAtSpecificTime === true,
          resumeTime: action.resumeTime || null,
          timeZone: action.timeZone || null,
          resumeAt: runAt.toISOString(),
        },
        runAt,
        idempotencyKey: `${tenantId || "workflow"}:wait-duration:${runId || "no-run"}:${stepRunId || action.id || runAt.toISOString()}`,
      });
      if (job?.id && stepRunId) await db("UPDATE platform_workflow_step_runs SET durable_job_id=$1,updated_at=NOW() WHERE id=$2", [job.id, stepRunId]);
      if (job?.id && runId && tenantId) await db("UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [runId, tenantId]);
      return {
        status: job ? "waiting" : "skipped",
        jobId: job?.id || null,
        amount,
        unit,
        resumeAt: runAt.toISOString(),
        resumeAtSpecificTime: action.resumeAtSpecificTime === true,
        resumeTime: action.resumeTime || null,
        timeZone: action.timeZone || null,
      };
    },
  },
  {
    key: "WAIT_FOR_CONDITIONS",
    displayName: "Wait for Conditions",
    description: "Pause a workflow for the first eligible specific-time or platform-event resume configuration.",
    schema: {
      type: "object",
      properties: {
        waitConfigurations: { type: "array" },
        waitCondition: { type: "object" },
        pollSeconds: { type: "number" },
        maxWaitUntil: { type: "string" },
      },
      required: [],
    },
    validation: (action) => {
      const configs = Array.isArray(action?.waitConfigurations) && action.waitConfigurations.length
        ? action.waitConfigurations
        : (action?.waitCondition ? [{ id: "legacy", label: "Wait Configuration", waitCondition: action.waitCondition, resumeEvent: { type: "specific_time", baseTime: action.maxWaitUntil || "$Flow.CurrentDateTime", offsetNumber: 0, offsetUnit: "hours" } }] : []);
      if (!configs.length) throw new Error("Wait for Conditions requires at least one wait configuration");
      for (const config of configs) {
        if (!String(config?.label || "").trim()) throw new Error("Wait for Conditions configuration label is required");
        const event = config?.resumeEvent || {};
        if (!["specific_time","platform_event"].includes(String(event.type || ""))) throw new Error("Wait for Conditions requires a supported resume event");
        if (event.type === "specific_time") {
          if (!event.baseTime) throw new Error("Wait for Conditions specific-time event requires a base time");
          if (event.offsetNumber !== "" && event.offsetNumber != null && !Number.isInteger(Number(event.offsetNumber))) throw new Error("Wait for Conditions offset number must be a whole number");
          if (event.offsetNumber !== "" && event.offsetNumber != null && !["hours","days"].includes(String(event.offsetUnit || ""))) throw new Error("Wait for Conditions offset unit must be Hours or Days");
        }
        if (event.type === "platform_event" && !String(event.eventType || "").trim()) throw new Error("Wait for Conditions platform event is required");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, record = null, previousRecord = null, fields = [], object = null, workflowVariables = {}, debugMode = false, debugWaitElementBehavior = false, debugWaitPaths = {} }) => {
      const tenantId = companyId || req?.user?.companyId;
      if (!runId) throw new Error("Wait for Conditions requires a persisted workflow run");
      const legacyConfig = action?.waitCondition ? [{
        id: "legacy",
        label: "Wait Configuration",
        waitCondition: action.waitCondition,
        resumeEvent: { type: "specific_time", baseTime: action.maxWaitUntil || "$Flow.CurrentDateTime", offsetNumber: 0, offsetUnit: "hours" },
      }] : [];
      const configs = Array.isArray(action?.waitConfigurations) && action.waitConfigurations.length ? action.waitConfigurations : legacyConfig;
      const context = { record, previousRecord, req, object, workflowVariables };
      if (debugMode && debugWaitElementBehavior) {
        const selectedPath = debugWaitPaths?.[action.id];
        if (!selectedPath) throw new Error(`Select a Wait Path for "${action.label || action.apiName || action.id || "Wait for Conditions"}"`);
        if (selectedPath === "__DEFAULT__") {
          return { status: "completed", simulated: true, debugWait: true, selectedPath, waitType: "WAIT_FOR_CONDITIONS", defaultPath: true };
        }
        const selectedConfiguration = configs.find((config) => String(config?.id || "") === String(selectedPath));
        if (!selectedConfiguration) throw new Error(`Selected Wait Path is unavailable for "${action.label || action.apiName || action.id || "Wait for Conditions"}"`);
        return {
          status: "completed",
          simulated: true,
          debugWait: true,
          selectedPath,
          waitType: "WAIT_FOR_CONDITIONS",
          defaultPath: false,
          waitConfigurationId: selectedConfiguration.id || null,
          waitConfigurationLabel: selectedConfiguration.label || null,
        };
      }
      const eligible = [];
      for (const config of configs) {
        let conditionMet = true;
        if (config?.waitCondition) {
          const condition = resolveWorkflowConditionConfig(config.waitCondition, context);
          conditionMet = evaluateCondition(condition, fields || [], record || {}, previousRecord || null);
        }
        if (conditionMet) eligible.push(config);
      }
      if (!eligible.length) return { status: "completed", waited: false, defaultPath: true, eligibleConfigurations: [] };

      const jobs = [];
      const waitingStartedAt = new Date().toISOString();
      for (const config of eligible) {
        const event = config.resumeEvent || {};
        let runAt = new Date();
        const payload = {
          runId,
          stepRunId,
          waitConfigurationId: config.id || null,
          waitConfigurationLabel: config.label || null,
          waitingStartedAt,
          resumeEvent: event,
        };
        if (event.type === "specific_time") {
          const resolvedBase = resolveConfiguredResource(event.baseTime, context, { preserveMissing: false });
          const base = new Date(resolvedBase === "$Flow.CurrentDateTime" ? Date.now() : resolvedBase);
          if (Number.isNaN(base.getTime())) throw new Error(`Wait for Conditions base time is invalid for "${config.label}"`);
          const offset = Number(event.offsetNumber || 0);
          runAt = new Date(base);
          if (String(event.offsetUnit || "hours") === "days") runAt.setTime(runAt.getTime() + offset * 86400000);
          else runAt.setTime(runAt.getTime() + offset * 3600000);
          payload.resumeAt = runAt.toISOString();
        } else {
          runAt = new Date(Date.now() + Math.max(30, Number(action.pollSeconds || 60)) * 1000);
          payload.platformEventType = String(event.eventType);
          payload.platformEventConditionMode = String(event.conditionMode || "none");
          payload.platformEventCustomConditionLogic = String(event.customConditionLogic || "");
          payload.platformEventConditions = Array.isArray(event.conditions)
            ? event.conditions.map((condition) => ({
                ...condition,
                value: condition?.valueMode === "resource"
                  ? resolveConfiguredResource(condition.value, context, { preserveMissing: false })
                  : condition?.value,
              }))
            : [];
          payload.platformEventOutputVariable = event.outputVariable ? String(event.outputVariable).replace(/^variables\./, "") : null;
          payload.pollSeconds = Math.max(30, Number(action.pollSeconds || 60));
        }
        const job = await enqueuePlatformJob({
          db,
          companyId: tenantId,
          kind: "WAIT",
          payload,
          runAt,
          idempotencyKey: `${tenantId || "workflow"}:wait-conditions:${runId}:${stepRunId || action.id || "step"}:${config.id || config.label}`,
        });
        if (job?.id) jobs.push({ id: job.id, configurationId: config.id || null, label: config.label || null, resumeAt: runAt.toISOString(), type: event.type });
      }
      if (jobs.length && stepRunId) {
        await db("UPDATE platform_workflow_step_runs SET durable_job_id=$1,metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=NOW() WHERE id=$3", [
          jobs[0].id,
          JSON.stringify({ waitConfigurationJobs: jobs }),
          stepRunId,
        ]);
      }
      if (jobs.length && tenantId) await db("UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [runId, tenantId]);
      return {
        status: jobs.length ? "waiting" : "skipped",
        waited: jobs.length > 0,
        defaultPath: false,
        jobs,
        eligibleConfigurations: eligible.map((config) => ({ id: config.id || null, label: config.label || null })),
      };
    },
  },
  {
    key: "WAIT_UNTIL_DATE",
    displayName: "Wait Until Date",
    description: "Pause a workflow until a calendar date/time or a Date/DateTime attribute.",
    schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["enter_date","get_attribute"] },
        resumeDate: { type: "string" },
        resumeTime: { type: "string" },
        timeZone: { type: "string" },
        attribute: {},
        attributeType: { type: "string" },
        relativeEnabled: { type: "boolean" },
        relativeNumber: { type: "number" },
        relativeUnit: { type: "string", enum: ["hours","days"] },
        relativeWhen: { type: "string", enum: ["before","after"] },
        specificTimeEnabled: { type: "boolean" },
        attributeResumeTime: { type: "string" },
        attributeTimeZone: { type: "string" },
        resumeAt: {},
      },
      required: [],
    },
    validation: (action) => {
      const mode = action?.mode || (action?.resumeAt ? "get_attribute" : "");
      if (!["enter_date","get_attribute"].includes(mode)) throw new Error("Wait Until Date requires Enter Date or Get from Attribute");
      if (mode === "enter_date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(action?.resumeDate || ""))) throw new Error("Wait Until Date requires a valid Resume Date");
        if (action?.resumeTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(action.resumeTime))) throw new Error("Wait Until Date Resume Time is invalid");
      } else {
        if (!(action?.attribute || action?.resumeAt)) throw new Error("Wait Until Date requires a Date or Date/Time attribute");
        if (action?.relativeEnabled === true) {
          if (!Number.isInteger(Number(action.relativeNumber)) || Number(action.relativeNumber) < 0) throw new Error("Wait Until Date relative number must be a whole number of 0 or greater");
          if (!["hours","days"].includes(String(action.relativeUnit || ""))) throw new Error("Wait Until Date relative unit must be Hours or Days");
          if (!["before","after"].includes(String(action.relativeWhen || ""))) throw new Error("Wait Until Date relative timing must be Before or After");
        }
        if (action?.specificTimeEnabled === true && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(action?.attributeResumeTime || ""))) {
          throw new Error("Wait Until Date attribute Resume Time is invalid");
        }
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, record = null, previousRecord = null, object = null, workflowVariables = {}, debugMode = false, debugWaitElementBehavior = false, debugWaitPaths = {} }) => {
      const tenantId = companyId || req?.user?.companyId;
      const context = { record, previousRecord, req, object, workflowVariables };
      const orgTimeZone = String(req?.user?.timeZone || req?.user?.timezone || "UTC");
      const validZone = (value) => {
        const zone = String(value || orgTimeZone);
        try { new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date()); return zone; }
        catch { return orgTimeZone; }
      };
      const zonedParts = (date, timeZone) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(date);
        return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
      };
      const localToUtc = (year, month, day, hour, minute, timeZone) => {
        let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
        for (let attempt = 0; attempt < 4; attempt++) {
          const parts = zonedParts(new Date(guess), timeZone);
          const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second || 0));
          const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
          const delta = desired - rendered;
          if (Math.abs(delta) < 1000) break;
          guess += delta;
        }
        return new Date(guess);
      };
      const nextLocalDay = (year, month, day) => {
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + 1);
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
      };

      const mode = action?.mode || (action?.resumeAt ? "get_attribute" : "enter_date");
      let runAt = new Date();
      if (mode === "enter_date") {
        const zone = validZone(action.timeZone);
        const [year, month, day] = String(action.resumeDate).split("-").map(Number);
        const [hour, minute] = String(action.resumeTime || "00:00").split(":").map(Number);
        runAt = localToUtc(year, month, day, hour, minute, zone);
      } else {
        const raw = resolveConfiguredResource(action.attribute || action.resumeAt, context, { preserveMissing: false });
        const zone = validZone(action.attributeTimeZone);
        const attributeType = String(action.attributeType || "").toLowerCase();
        if (raw == null || raw === "") {
          runAt = new Date();
        } else if (attributeType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
          const [year, month, day] = String(raw).split("-").map(Number);
          runAt = localToUtc(year, month, day, 0, 0, zone);
        } else {
          runAt = new Date(raw);
          if (Number.isNaN(runAt.getTime())) runAt = new Date();
        }

        if (action.relativeEnabled === true) {
          const amount = Number(action.relativeNumber || 0) * (String(action.relativeWhen) === "before" ? -1 : 1);
          const unit = String(action.relativeUnit || "days");
          runAt = new Date(runAt.getTime() + amount * (unit === "hours" ? 3600000 : 86400000));
        }

        if (action.specificTimeEnabled === true) {
          const [hour, minute] = String(action.attributeResumeTime).split(":").map(Number);
          const local = zonedParts(runAt, zone);
          let dateParts = { year: Number(local.year), month: Number(local.month), day: Number(local.day) };
          let candidate = localToUtc(dateParts.year, dateParts.month, dateParts.day, hour, minute, zone);
          if (candidate.getTime() < Date.now()) {
            dateParts = nextLocalDay(dateParts.year, dateParts.month, dateParts.day);
            candidate = localToUtc(dateParts.year, dateParts.month, dateParts.day, hour, minute, zone);
          }
          runAt = candidate;
        } else if (runAt.getTime() < Date.now()) {
          runAt = new Date();
        }
      }

      if (Number.isNaN(runAt.getTime())) runAt = new Date();
      if (debugMode && debugWaitElementBehavior) {
        const selectedPath = debugWaitPaths?.[action.id];
        if (!selectedPath) throw new Error(`Select a Wait Path for "${action.label || action.apiName || action.id || "Wait Until Date"}"`);
        return {
          status: "completed",
          simulated: true,
          debugWait: true,
          selectedPath,
          waitType: "WAIT_UNTIL_DATE",
          resumeAt: runAt.toISOString(),
          mode,
        };
      }
      const job = await enqueuePlatformJob({
        db,
        companyId: tenantId,
        kind: "WAIT",
        payload: {
          resumeAt: runAt.toISOString(),
          runId,
          stepRunId,
          waitUntilDate: true,
          mode,
        },
        runAt,
        idempotencyKey: `${tenantId || "workflow"}:wait-until:${runId || "no-run"}:${stepRunId || action.id || runAt.toISOString()}`,
      });
      if (job?.id && stepRunId) await db("UPDATE platform_workflow_step_runs SET durable_job_id=$1,updated_at=NOW() WHERE id=$2", [job.id, stepRunId]);
      if (job?.id && runId && tenantId) await db("UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [runId, tenantId]);
      return { status: job ? "waiting" : "skipped", jobId: job?.id || null, resumeAt: runAt.toISOString(), mode };
    },
  },
  {
    key: "CUSTOM_ERROR",
    displayName: "Custom Error",
    description: "Stop the flow with a targeted validation error.",
    schema: {
      type: "object",
      properties: {
        errorMessage: { type: "string" },
        errorField: { type: "string" },
      },
      required: ["errorMessage"],
    },
    validation: (action) => {
      if (!String(action?.errorMessage || "").trim()) throw new Error("Custom Error requires an error message");
    },
    async: false,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ action, record = null, previousRecord = null, req = null, object = null, workflowVariables = {} }) => {
      const resolved = resolveConfiguredResource(action.errorMessage, { record, previousRecord, req, object, workflowVariables }, { preserveMissing: false });
      const message = String(resolved ?? "").trim();
      if (!message) throw new Error("Custom Error requires a resolved error message");
      if (message.length > 255) throw new Error("Custom Error message must be 255 characters or fewer");
      const error = new Error(message);
      error.code = "CUSTOM_FLOW_ERROR";
      error.field = action.errorLocation === "field" ? action.errorField || null : null;
      error.location = action.errorLocation || (action.errorField ? "field" : "record");
      error.retryable = false;
      throw error;
    },
  },
  {
    key: "WAIT",
    displayName: "Wait",
    description: "Pause a workflow without blocking an HTTP request.",
    validation: (action) => {
      if (!action?.durationSeconds && !action?.waitSeconds && !action?.until && !action?.resumeAt) {
        throw new Error("Wait requires a duration or resume time");
      }
    },
    async: true,
    requiredPermissions: ["workflow.execute"],
    executor: async ({ db, action, companyId, req, runId = null, stepRunId = null, debugMode = false, debugWaitElementBehavior = false, debugWaitPaths = {} }) => {
      const tenantId = companyId || req?.user?.companyId;
      const requestedResumeAt = action.resumeAt || action.until || null;
      const waitSeconds = Number(action.durationSeconds ?? action.waitSeconds ?? 0);
      const runAt = requestedResumeAt
        ? new Date(requestedResumeAt)
        : new Date(Date.now() + Math.max(0, waitSeconds || 0) * 1000);
      if (Number.isNaN(runAt.getTime())) throw new Error("Wait resume time is invalid");
      if (debugMode && debugWaitElementBehavior) {
        const selectedPath = debugWaitPaths?.[action.id] || "__WAIT__";
        return { status: "completed", simulated: true, debugWait: true, selectedPath, waitType: "WAIT", resumeAt: runAt.toISOString() };
      }
      const job = await enqueuePlatformJob({
        db,
        companyId: tenantId,
        kind: "WAIT",
        payload: { waitSeconds, resumeAt: runAt.toISOString(), runId, stepRunId },
        runAt,
        idempotencyKey: `${tenantId || "workflow"}:wait:${runId || "no-run"}:${stepRunId || Date.now()}`,
      });
      if (job?.id && stepRunId) {
        await db(
          "UPDATE platform_workflow_step_runs SET durable_job_id=$1,updated_at=NOW() WHERE id=$2",
          [job.id, stepRunId]
        );
      }
      if (job?.id && runId && tenantId) {
        await db(
          "UPDATE platform_workflow_runs SET status='WAITING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
          [runId, tenantId]
        );
      }
      return { status: job ? "waiting" : "skipped", jobId: job?.id || null, resumeAt: runAt.toISOString() };
    },
  },
  {
    key: "SHOPIFY_PROCESS_WEBHOOK",
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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
    builderVisible: false,
    systemVisible: false,
    internalAdapter: true,
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

// Re-export registry bindings without eagerly reading them during module
// initialization. platformFunctionRegistry participates in the workflow import
// graph, so assigning these imported bindings to new consts can hit the ESM
// temporal dead zone during startup.
export { PLATFORM_FUNCTIONS as REGISTERED_FUNCTIONS, PLATFORM_FUNCTION_MAP as REGISTERED_FUNCTIONS_MAP } from "./platformFunctionRegistry.js";

export async function executeMediatedRegisteredAction({ db, companyId, userId = null, req = null, action }) {
  return executeRegisteredAction({
    db,
    companyId,
    userId,
    req: req || { user: { id: userId, companyId } },
    action,
  });
}

export function getWorkflowActionRegistry() {
  return [...WORKFLOW_ACTION_REGISTRY, ...DYNAMIC_CONNECTOR_ACTIONS].filter((definition, index, all) => all.findIndex((entry) => String(entry.key || "").toUpperCase() === String(definition.key || "").toUpperCase()) === index);
}

export function getWorkflowBuilderActionRegistry() {
  return getWorkflowActionRegistry().filter((definition) => definition?.builderVisible !== false);
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
  return PLATFORM_FUNCTION_MAP.get(String(functionKey || "")) || null;
}

export function getRegisteredFunctionsRegistry() {
  return PLATFORM_FUNCTIONS.slice();
}

async function resolveTargetObjectMetadata({ db, objectId, objectKey, companyId }) {
  if (!db || typeof db !== "function" || !companyId) return null;
  const where = objectId ? "id=$1" : "object_key=$1";
  const value = objectId || objectKey;
  if (!value) return null;
  const result = await db(
    `SELECT * FROM platform_objects
      WHERE ${where} AND (company_id=$2 OR company_id IS NULL) AND active=true
        AND source_table IS NOT NULL
      ORDER BY CASE WHEN company_id=$2 THEN 0 ELSE 1 END
      LIMIT 1`,
    [value, companyId]
  );
  return result.rows[0] || null;
}

function normalizeWorkflowConditionConfig(condition) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return condition;
  if (Array.isArray(condition.conditions)) {
    return { ...condition, match: condition.match || condition.type || "all" };
  }
  if (Array.isArray(condition.rules)) {
    return {
      match: condition.match || condition.type || "all",
      conditions: condition.rules.map((rule) => ({ ...rule })),
    };
  }
  return condition;
}

function resolveWorkflowConditionConfig(condition, context = {}) {
  const normalized = normalizeWorkflowConditionConfig(condition);
  if (!normalized || !Array.isArray(normalized.conditions)) return normalized;
  return {
    ...normalized,
    conditions: normalized.conditions.map((rule) => {
      if (!rule || typeof rule !== "object") return rule;
      if (rule.operator === "changed_from_to" && rule.value && typeof rule.value === "object" && !Array.isArray(rule.value)) {
        return {
          ...rule,
          value: {
            from: resolveConfiguredResource(rule.value.from, context),
            to: resolveConfiguredResource(rule.value.to, context),
          },
        };
      }
      return { ...rule, value: resolveConfiguredResource(rule.value, context) };
    }),
  };
}

function workflowBindingContext({ record, previousRecord, req, object, workflowVariables } = {}) {
  return {
    record: record || null,
    previousRecord: previousRecord || null,
    user: req?.user || null,
    rootObjectKey: object?.object_key || object?.objectKey || object?.api_name || null,
    variables: workflowVariables || {},
  };
}

function resolveConfiguredResource(value, context = {}, { preserveMissing = true } = {}) {
  if (value && typeof value === "object") {
    return resolveBindingTree(value, workflowBindingContext(context));
  }
  if (typeof value !== "string") return value;
  const raw = value.trim();
  if (!raw) return value;
  const rootKey = context.object?.object_key || context.object?.objectKey || context.object?.api_name || "";
  const resourceLike = raw.startsWith("$")
    || raw.startsWith("steps.")
    || raw.startsWith("variables.")
    || (rootKey && (raw === rootKey || raw.startsWith(`${rootKey}.`)));
  if (!resourceLike) return value;
  const resolved = resolveWorkflowResource(raw, workflowBindingContext(context));
  return resolved === undefined && preserveMissing ? value : resolved;
}

function resolveFieldValueMap(input, context = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [
    key,
    resolveConfiguredResource(value, context),
  ]));
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
  const requestedObjectKey = action.objectKey || action.object_key || action.object || null;
  const objectId = requestedObjectId || (!requestedObjectKey ? object?.id || null : null);
  const objectKey = requestedObjectKey || (!objectId ? object?.object_key || object?.api_name || null : null);
  const target = await resolveTargetObjectMetadata({ db, objectId, objectKey, companyId: runtimeCompanyId });
  if (!target) throw new Error("Workflow target object is not available for this company");
  if (!isSafeIdentifier(target.source_table)
      || (target.company_id != null && String(target.company_id) !== String(runtimeCompanyId))) {
    throw new Error("Workflow target object is not permitted");
  }
  return target;
}

async function assertResolvedWorkflowObjectPermission({ db, req, object, access }) {
  if (!req?.user) throw new Error("Workflow object authorization requires an authenticated user");
  const allowed = await hasPlatformObjectPermission(db, req, object.id, access);
  if (!allowed) {
    const error = new Error(`Workflow user cannot ${access} ${object.label || object.object_key || "target object"}`);
    error.status = 403;
    error.code = "WORKFLOW_OBJECT_PERMISSION_DENIED";
    throw error;
  }
}

async function resolveWorkflowWritableFields({ db, object, entries, req = null }) {
  const requested = new Map(entries.map(([name]) => [String(name), true]));
  const metadataResult = await db(
    `SELECT *
       FROM platform_fields
      WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)
      ORDER BY display_order,label`,
    [object.id, req?.user?.companyId || object.company_id]
  );
  const metadata = req?.user
    ? await applyFieldSecurity(db, metadataResult.rows || [], req)
    : (metadataResult.rows || []);
  const resolved = [];
  for (const [name] of requested) {
    const field = metadata.find((candidate) =>
      String(candidate.api_name || "") === name || String(candidate.source_column || "") === name
    );
    if (!field || field.active === false || field.writable === false || !isSafeIdentifier(field.source_column || field.api_name)) {
      throw new Error(`Workflow field "${name}" is not writable for the target object`);
    }
    resolved.push({ source_column: field.source_column || field.api_name });
  }
  return resolved;
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

export function createWorkflowRun({ db, companyId, workflowId, workflowName, workflowVersion = 1, objectId, recordId, triggerKey, parentRunId = null, startedAt = new Date(), status = "PENDING", metadata = {} }) {
  if (!db || typeof db !== "function") return null;
  const normalizedVersion = Math.max(1, Number.parseInt(workflowVersion, 10) || 1);
  const payload = { workflowId, workflowName, workflowVersion: normalizedVersion, objectId, recordId, triggerKey, parentRunId, status, metadata: metadata || {} };
  return db(
    `INSERT INTO platform_workflow_runs (company_id, workflow_id, workflow_name, workflow_version, object_id, record_id, trigger_key, parent_run_id, status, started_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
    [companyId, workflowId || null, workflowName || null, normalizedVersion, objectId || null, recordId || null, triggerKey || null, parentRunId || null, status, startedAt, JSON.stringify(payload.metadata || {})]
  ).then((result) => result.rows[0] || null);
}

export function createWorkflowStepRun({ db, runId, stepIdentifier, stepOrder = 0, actionType, status = "PENDING", metadata = {}, jobId = null, childRunId = null }) {
  if (!db || typeof db !== "function") return null;
  return db(
    `INSERT INTO platform_workflow_step_runs (run_id, step_identifier, step_order, action_type, status, metadata, durable_job_id, child_run_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
    [runId, stepIdentifier || null, stepOrder, actionType || null, status, JSON.stringify(metadata || {}), jobId || null, childRunId || null]
  ).then((result) => result.rows[0] || null);
}

export function resolveWorkflowActionType(action) {
  const normalized = action && (action.type || action.key || action.actionType || "");
  return String(normalized || "").toUpperCase();
}

async function workflowEffectivePermissionSets(context) {
  const req = context?.req;
  if (!req?.user?.companyId || !req?.user?.roleId || !context?.db) return [];
  if (Array.isArray(req._workflowEffectivePermissionSets)) return req._workflowEffectivePermissionSets;
  const sets = await loadEffectivePermissionSets(context.db, req.user, req);
  req._workflowEffectivePermissionSets = Array.isArray(sets) ? sets : [];
  return req._workflowEffectivePermissionSets;
}

async function assertWorkflowActionPermission(context, definition) {
  const req = context?.req;
  const required = [...new Set((Array.isArray(definition.requiredPermissions) ? definition.requiredPermissions : []).filter(Boolean).map(String))];
  if (!required.length) return;
  if (!req?.user?.companyId || !req.user.roleId) {
    throw new Error("Workflow action authorization requires an RBAC user and role");
  }
  if (!context?.db || typeof context.db !== "function") {
    throw new Error("Workflow action authorization context is unavailable");
  }
  const [roleResult, permissionSets] = await Promise.all([
    context.db(
      `SELECT DISTINCT p.code
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp.permission_id
         JOIN roles r ON r.id=rp.role_id
        WHERE rp.role_id=$1
          AND (r.company_id IS NULL OR r.company_id=$2)
          AND p.code = ANY($3::text[])`,
      [req.user.roleId, req.user.companyId, required]
    ),
    workflowEffectivePermissionSets(context),
  ]);
  const rolePermissions = new Set((roleResult.rows || []).map((row) => String(row.code)));
  const missing = required.filter((code) =>
    !rolePermissions.has(code) && !permissionSetAllowsSystemPermission(permissionSets, code)
  );
  if (missing.length) {
    throw new Error(`You do not have permission to execute this workflow action. Missing: ${missing.join(", ")}`);
  }
}

const WORKFLOW_OBJECT_ACCESS = Object.freeze({
  GET_RECORDS: "view",
  CREATE_RECORD: "create",
  CREATE_RELATED_RECORD: "create",
  UPDATE_RECORD: "edit",
  UPDATE_RELATED_RECORD: "edit",
  DELETE_RECORD: "delete",
  ASSIGN_RECORD: "edit",
  ADD_RELATIONSHIP: "edit",
  REMOVE_RELATIONSHIP: "edit",
  SET_FIELD: "edit",
});

async function assertSpecificWorkflowObjectPermission(context, targetObject, access) {
  const req = context?.req;
  if (!access || !targetObject) return;
  if (!req?.user?.companyId || !req?.user?.roleId) {
    throw new Error("Workflow record access requires an RBAC user and role");
  }
  const [roleGrant, permissionSets] = await Promise.all([
    context.db(
      `SELECT can_view,can_create,can_edit,can_delete
         FROM platform_object_permissions
        WHERE object_id=$1 AND role_id=$2 AND company_id=$3
        LIMIT 1`,
      [targetObject.id, req.user.roleId, req.user.companyId]
    ),
    workflowEffectivePermissionSets(context),
  ]);
  const column = `can_${access}`;
  if (roleGrant.rows[0]?.[column] === true) return;
  if (permissionSetAllowsObject(permissionSets, targetObject.object_key, access)) return;

  const systemPermission = systemObjectRbacPermission(targetObject, access);
  if (systemPermission) {
    if (permissionSetAllowsSystemPermission(permissionSets, systemPermission)) return;
    const rolePermission = await context.db(
      `SELECT 1
         FROM role_permissions rp
         JOIN permissions p ON p.id=rp.permission_id
        WHERE rp.role_id=$1 AND p.code=$2
        LIMIT 1`,
      [req.user.roleId, systemPermission]
    );
    if (rolePermission.rows.length) return;
  }
  throw new Error(`You do not have permission to ${access} records for ${targetObject.label || targetObject.object_key}`);
}

async function assertWorkflowObjectPermission(context, actionType) {
  const access = WORKFLOW_OBJECT_ACCESS[actionType];
  const req = context?.req;
  if (!access) return;
  if (!req?.user?.companyId || !req?.user?.roleId) {
    throw new Error("Workflow record access requires an RBAC user and role");
  }
  const targetObject = await resolveWorkflowTargetObject({
    db: context.db,
    action: context.action || {},
    object: context.object || null,
    companyId: context.companyId || req.user.companyId,
    req,
  });
  await assertSpecificWorkflowObjectPermission(context, targetObject, access);
}

const DEBUG_EXECUTABLE_ACTIONS = new Set([
  "CONSTANT","FORMULA","TEXT_TEMPLATE","ASSIGNMENT","COLLECTION_FILTER","COLLECTION_SORT","TRANSFORM","RECOMMENDATION_ASSIGNMENT","CONDITION","LOOP","GET_RECORDS",
  "CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD",
  "DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP",
  "SCHEDULE_PATH","RUN_SUBFLOW","WAIT","WAIT_FOR_CONDITIONS","WAIT_UNTIL_DATE","CUSTOM_ERROR","STOP",
  // Appointment orchestration actions are safe to execute in Debug because
  // their database writes use the Debug transaction and are rolled back.
  // SEND_COMMUNICATION is intentionally omitted so external and in-app delivery
  // remains simulated during Debug.
  ]);

export function friendlyWorkflowError(error, actionType = "") {
  const message = String(error?.message || error || "Workflow execution failed");
  const lower = message.toLowerCase();
  let title = "This step could not complete";
  let howToFix = "Open this step in Workflow Builder and check its required fields and Resources, then run Debug again.";
  if (lower.includes("permission") || lower.includes("rbac")) {
    title = "Permission is missing";
    howToFix = "Check the running user's role and make sure it has every permission required by this step.";
  } else if (lower.includes("duplicate") || lower.includes("unique constraint") || lower.includes("already exists")) {
    title = "This would create a duplicate record";
    howToFix = "Check the values being created or updated. A record with the same unique value already exists.";
  } else if (lower.includes("foreign key") || lower.includes("related record") && (lower.includes("missing") || lower.includes("not found"))) {
    title = "A related record is no longer available";
    howToFix = "Check the selected related-record Resource and choose a record that still exists in this company/store.";
  } else if (lower.includes("timeout") || lower.includes("timed out")) {
    title = "This step took too long";
    howToFix = "Try Debug again. If it repeats, check the connected service or reduce the amount of data this step processes.";
  } else if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("connection refused")) {
    title = "The connected service could not be reached";
    howToFix = "Check the connection health and service availability, then run Debug again.";
  } else if (lower.includes("invalid input syntax") || lower.includes("invalid value") || lower.includes("wrong type")) {
    title = "A value has the wrong format";
    howToFix = "Open this step and check the highlighted values and Resources match the field types expected by the target object.";
  } else if (lower.includes("not configured") || lower.includes("provider")) {
    title = "A connection or provider is not configured";
    howToFix = "Open Settings for this app or connector, complete its connection setup, test it successfully, then run Debug again.";
  } else if (lower.includes("record") && (lower.includes("not found") || lower.includes("does not exist"))) {
    title = "The record could not be found";
    howToFix = "Check the Resource feeding this step and confirm the record exists in the current company/store.";
  } else if (lower.includes("required") || lower.includes("requires") || lower.includes("not null")) {
    title = "Required information is missing";
    howToFix = "Open this step and complete the required value or Resource shown in its Properties.";
  } else if (lower.includes("formula")) {
    title = "The formula could not be evaluated";
    howToFix = "Check the formula inputs and expression. Make sure every name in the formula has a mapped Resource.";
  } else if (lower.includes("collection") || lower.includes("loop")) {
    title = "The collection or Loop is invalid";
    howToFix = "Check that the Loop receives a collection and that its Current Item/collection Resources come from an earlier step.";
  } else if (lower.includes("object") || lower.includes("field")) {
    title = "An object or field is unavailable";
    howToFix = "Re-select the object/field in this step. It may have been renamed, removed, or made unavailable by permissions.";
  }
  return {
    title,
    whatHappened: message.slice(0, 1000),
    howToFix,
    actionType: String(actionType || ""),
  };
}

function workflowResultPath(value, path) {
  if (!path) return value;
  return String(path).split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
}

function setWorkflowObjectPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return value;
  let current = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) current[part] = value;
    else {
      if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) current[part] = {};
      current = current[part];
    }
  });
  return target;
}

function resolveActionBuilderBinding(value, context = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.__flowInputMode === "formula") {
    return evaluateWorkflowFormula(String(value.expression || ""), {
      record: context.record || {},
      previousRecord: context.previousRecord || {},
      variables: context.workflowVariables?.variables || {},
      steps: context.workflowVariables?.steps || {},
    });
  }
  if (value.__flowInputMode === "transform") {
    const source = resolveConfiguredResource(value.source, context, { preserveMissing: false });
    const mappings = Array.isArray(value.mappings) ? value.mappings : [];
    const transformOne = (item) => {
      const output = {};
      for (const mapping of mappings) {
        const mappedValue = workflowResultPath(item, mapping?.sourceField);
        setWorkflowObjectPath(output, mapping?.targetField, mappedValue);
      }
      return output;
    };
    return Array.isArray(source) ? source.map(transformOne) : transformOne(source);
  }
  const keys = Object.keys(value);
  if (typeof value.path === "string" && keys.every((key) => ["path","fallback"].includes(key))) {
    return resolveConfiguredResource(value, context, { preserveMissing: false });
  }
  return value;
}

function materializeActionBuilderInputs(action, context = {}) {
  if (!action || typeof action !== "object") return action;
  return Object.fromEntries(Object.entries(action).map(([key, value]) => [
    key,
    resolveActionBuilderBinding(value, context),
  ]));
}

function applyWorkflowActionOutputStorage(action, result, workflowVariables) {
  if (!action || !workflowVariables?.variables) return;
  const automatic = String(action.automaticOutputVariable || "").trim();
  if (automatic) workflowVariables.variables[automatic] = result;
  for (const mapping of Array.isArray(action.manualOutputMappings) ? action.manualOutputMappings : []) {
    const target = String(mapping?.targetVariable || "").replace(/^variables\./, "");
    if (!target) continue;
    workflowVariables.variables[target] = workflowResultPath(result, mapping?.outputPath);
  }
}

export async function executeWorkflowAction(context) {
  const action = materializeActionBuilderInputs(context?.action, context);
  const executionContext = action === context?.action ? context : { ...context, action };
  const definition = validateWorkflowAction(action);
  await assertWorkflowActionPermission(executionContext, definition);
  const actionType = resolveWorkflowActionType(action);
  await assertWorkflowObjectPermission(executionContext, actionType);
  if (executionContext?.debugMode === true && !DEBUG_EXECUTABLE_ACTIONS.has(actionType)) {
    return {
      status: "completed",
      simulated: true,
      actionType,
      message: "Simulated in Debug mode so no external action or irreversible operation was performed.",
    };
  }
  if (executionContext?.debugMode === true && ["WAIT","WAIT_FOR_CONDITIONS","WAIT_UNTIL_DATE"].includes(actionType)) {
    return {
      status: "completed",
      simulated: true,
      actionType,
      message: "Wait was skipped in Debug mode.",
      resumeAt: action?.resumeAt || action?.until || null,
      durationSeconds: Number(action?.durationSeconds ?? action?.waitSeconds ?? 0),
    };
  }
  if (typeof definition.executor !== "function") {
    return { status: "skipped", reason: "No executor configured" };
  }
  return definition.executor(executionContext);
}

async function recordCompensationFailure({ db, runId, stepRunId, action, error, context }) {
  const details = errorDetails(error);
  if (!db || !runId) return details;
  await db(
    `INSERT INTO platform_workflow_compensation_runs
       (run_id, step_run_id, company_id, action_type, status, error_text, error_code, metadata)
     VALUES ($1,$2,$3,$4,'FAILED',$5,$6,$7::jsonb)`,
    [runId, stepRunId || null, context.companyId || context.req?.user?.companyId || null, resolveWorkflowActionType(action), details.message, details.oeCode || "OEWX01", JSON.stringify({ error: details })]
  );
  return details;
}

async function getOrCreateWorkflowStepRun({ db, runId, stepIdentifier, stepOrder, actionType }) {
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

export function restoreWorkflowRuntimeState(result, workflowVariables, stepId = null, actionType = null) {
  if (!result || typeof result !== "object" || !workflowVariables?.variables) return;
  if (result.variableName) workflowVariables.variables[result.variableName] = result.value;
  if (result.resourceName) workflowVariables.variables[result.resourceName] = result.value;
  if (result.faultHandled) {
    const friendly = result.friendlyError || {};
    const error = result.error || {};
    workflowVariables.variables.fault = {
      stepId: result.fault?.stepId || stepId || null,
      actionType: result.fault?.actionType || friendly.actionType || actionType || null,
      message: error.message || friendly.whatHappened || "Workflow step failed",
      title: friendly.title || "This step could not complete",
      howToFix: friendly.howToFix || null,
    };
  }
  const branchResults = result.branch?.results || result.faultBranch?.results || [];
  for (const entry of Array.isArray(branchResults) ? branchResults : []) {
    restoreWorkflowRuntimeState(entry?.result, workflowVariables, entry?.stepId || null, entry?.action || null);
  }
  for (const iteration of Array.isArray(result.iterations) ? result.iterations : []) {
    for (const entry of Array.isArray(iteration?.results) ? iteration.results : []) {
      restoreWorkflowRuntimeState(entry?.result, workflowVariables, entry?.stepId || null, entry?.action || null);
    }
  }
}

export function workflowResultsContainStatus(entries = [], status = "waiting") {
  return (Array.isArray(entries) ? entries : []).some((entry) => {
    if (String(entry?.result?.status || "").toLowerCase() === String(status).toLowerCase()) return true;
    if (workflowResultsContainStatus(entry?.result?.branch?.results || [], status)) return true;
    if (workflowResultsContainStatus(entry?.result?.faultBranch?.results || [], status)) return true;
    if (workflowResultsContainStatus(entry?.result?.scheduledBranch?.results || [], status)) return true;
    const iterations = Array.isArray(entry?.result?.iterations) ? entry.result.iterations : [];
    return iterations.some((iteration) => workflowResultsContainStatus(iteration?.results || [], status));
  });
}

async function hydrateWorkflowProviderResources(context, workflowVariables) {
  if (workflowVariables.__providerResourcesHydrated === true) return;
  workflowVariables.__providerResourcesHydrated = true;
  const companyId = context.companyId || context.req?.user?.companyId || null;
  if (!companyId || !context.db || typeof context.db !== "function") return;
  const storeId = context.storeId || context.req?.user?.storeId || null;
  const result = await context.db(
    `SELECT c.id,c.name,c.provider_name,c.base_url,c.auth_type,c.credentials_encrypted,
            c.connector_configuration,c.timeout_ms,c.connection_status,d.connector_key,d.credentials_schema
       FROM integration_connections c
       LEFT JOIN platform_connector_definitions d ON d.id=c.connector_definition_id
      WHERE c.company_id=$1 AND c.enabled=true
        AND (c.store_id IS NULL OR c.store_id=$2)
      ORDER BY (c.store_id IS NULL),c.updated_at DESC`,
    [companyId, storeId]
  );
  const seen = new Set();
  for (const row of result.rows || []) {
    const providerKey = String(row.provider_name || row.connector_key || "").trim();
    if (!providerKey || seen.has(providerKey.toLowerCase())) continue;
    seen.add(providerKey.toLowerCase());
    let credentials = {};
    try { credentials = row.credentials_encrypted ? (decryptCredentials(row.credentials_encrypted) || {}) : {}; } catch { credentials = {}; }
    const configuration = row.connector_configuration && typeof row.connector_configuration === "object" && !Array.isArray(row.connector_configuration)
      ? row.connector_configuration
      : {};
    const schema = Array.isArray(row.credentials_schema)
      ? row.credentials_schema
      : Object.entries(row.credentials_schema || {}).map(([key,value]) => ({ key, ...(value || {}) }));
    const secureKeys = new Set(schema.map((field) => String(field?.key || field?.name || "")).filter(Boolean));
    for (const key of Object.keys(credentials || {})) secureKeys.add(String(key));
    if (!Array.isArray(workflowVariables.variables.__secureValues)) workflowVariables.variables.__secureValues = [];
    for (const key of secureKeys) {
      const secret = credentials?.[key];
      if (secret !== undefined && secret !== null && String(secret).length >= 4 && !workflowVariables.variables.__secureValues.includes(String(secret))) {
        workflowVariables.variables.__secureValues.push(String(secret));
      }
    }
    const variableName = `Provider_${providerKey.replace(/[^A-Za-z0-9_]/g, "_")}`;
    workflowVariables.variables[variableName] = {
      name: row.name || providerKey,
      providerKey,
      baseUrl: row.base_url || "",
      authType: row.auth_type || "none",
      timeoutMs: Number(row.timeout_ms || 15000),
      status: row.connection_status || "",
      ...configuration,
      ...credentials,
      __secureFields: [...secureKeys],
    };
    credentials = {};
  }
}

export async function executeWorkflowActions({ actions, ...context }) {
  if (!Array.isArray(actions)) return [];
  const results = [];
  const completed = [];
  const workflowVariables = context.workflowVariables && typeof context.workflowVariables === "object"
    ? context.workflowVariables
    : {};
  if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
  if (!workflowVariables.steps || typeof workflowVariables.steps !== "object") workflowVariables.steps = {};
  const providerResourceReferenced = JSON.stringify(actions).includes("variables.Provider_");
  if (providerResourceReferenced) await hydrateWorkflowProviderResources(context, workflowVariables);
  const allActions = Array.isArray(context.allActions) ? context.allActions : actions;
  const actionById = new Map(allActions.filter((item) => item?.id).map((item) => [String(item.id), item]));
  const branchTargetIds = new Set();
  if (context.branchExecution !== true) {
    for (const candidate of allActions) {
      const candidateType = resolveWorkflowActionType(candidate);
      if (candidateType === "CONDITION") {
        const decisionTargets = Array.isArray(candidate.outcomes) && candidate.outcomes.length
          ? [...candidate.outcomes.flatMap((outcome) => outcome?.branch || []), ...(candidate.defaultBranch || [])]
          : [...(candidate.ifBranch || []), ...(candidate.elseBranch || [])];
        for (const branchId of decisionTargets) {
          if (branchId) branchTargetIds.add(String(branchId));
        }
      }
      if (candidateType === "LOOP") {
        for (const bodyId of candidate.bodyBranch || []) {
          if (bodyId) branchTargetIds.add(String(bodyId));
        }
      }
      if (candidateType === "SCHEDULE_PATH") {
        for (const scheduledId of candidate.branch || []) {
          if (scheduledId) branchTargetIds.add(String(scheduledId));
        }
      }
      const candidateFaultMode = String(candidate.faultMode || (Array.isArray(candidate.faultBranch) && candidate.faultBranch.length ? "ROUTE" : "FAIL")).toUpperCase();
      if (["ROUTE","RETRY"].includes(candidateFaultMode)) {
        for (const faultId of candidate.faultBranch || []) {
          if (faultId) branchTargetIds.add(String(faultId));
        }
      }
    }
  }

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
    const item = actions[actionIndex];
    if (!item || typeof item !== "object") continue;
    if (context.branchExecution !== true && item.id && branchTargetIds.has(String(item.id))) continue;

    const globalIndex = item.id
      ? Math.max(0, allActions.findIndex((candidate) => String(candidate?.id || "") === String(item.id)))
      : actionIndex;
    let stepRun = null;
    const traceDb = context.traceDb || context.db;
    if (traceDb && context.runId) {
      stepRun = await getOrCreateWorkflowStepRun({
        db: traceDb,
        runId: context.runId,
        stepIdentifier: (item.id || `step-${globalIndex + 1}`) + (context.executionScope ? `@${context.executionScope}` : ""),
        stepOrder: globalIndex + 1,
        actionType: resolveWorkflowActionType(item),
      });
    }

    if (stepRun?.status === "WAITING" && stepRun.metadata?.faultPending === true) {
      const storedError = stepRun.metadata?.error || { message: stepRun.error_text || "Workflow step failed" };
      const storedFriendly = stepRun.metadata?.friendlyError || friendlyWorkflowError(storedError, resolveWorkflowActionType(item));
      const faultIds = Array.isArray(stepRun.metadata?.faultBranchStepIds)
        ? stepRun.metadata.faultBranchStepIds.map(String)
        : (Array.isArray(item.faultBranch) ? item.faultBranch.map(String) : []);
      workflowVariables.variables.fault = {
        stepId: item.id || `step-${globalIndex + 1}`,
        actionType: resolveWorkflowActionType(item),
        message: storedError.message || stepRun.error_text || "Workflow step failed",
        title: storedFriendly.title,
        howToFix: storedFriendly.howToFix,
      };
      const faultActions = faultIds
        .map((id) => actionById.get(String(id)))
        .filter(Boolean)
        .sort((a, b) => allActions.indexOf(a) - allActions.indexOf(b));
      const faultResults = await executeWorkflowActions({
        actions: faultActions,
        ...context,
        workflowVariables,
        allActions,
        branchExecution: true,
        executionScope: `${context.executionScope ? context.executionScope + ":" : ""}${item.id || globalIndex}:fault`,
      });
      const waiting = workflowResultsContainStatus(faultResults, "waiting");
      const stopped = workflowResultsContainStatus(faultResults, "stopped");
      const handled = {
        status: waiting ? "waiting" : stopped ? "stopped" : "fault_handled",
        faultHandled: true,
        error: storedError,
        friendlyError: storedFriendly,
        faultBranch: { stepIds: faultIds, results: faultResults },
      };
      workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = handled;
      if (item.apiName) workflowVariables.steps[item.apiName] = handled;
      results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: handled, stepRunId: stepRun.id, resumedFaultPath: true });
      await updateWorkflowStepRunStatus({
        db: traceDb,
        stepRunId: stepRun.id,
        status: waiting ? "WAITING" : stopped ? "STOPPED" : "COMPLETED",
        errorText: storedError.message || stepRun.error_text || null,
        metadata: {
          result: redact(handled),
          error: storedError,
          friendlyError: storedFriendly,
          faultPending: waiting,
          faultBranchStepIds: faultIds,
        },
      });
      if (waiting || stopped) break;
      continue;
    }

    if (stepRun?.status === "COMPLETED") {
      const priorResult = stepRun.metadata?.result || { status: "completed", idempotentReplay: true };
      results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: priorResult, stepRunId: stepRun.id, idempotentReplay: true });
      workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = priorResult;
      if (item.apiName) workflowVariables.steps[item.apiName] = priorResult;
      applyWorkflowActionOutputStorage(item, priorResult, workflowVariables);
      restoreWorkflowRuntimeState(priorResult, workflowVariables, item.id || `step-${globalIndex + 1}`, resolveWorkflowActionType(item));
      if (priorResult?.faultHandled !== true) completed.push({ action: item, stepRunId: stepRun.id, index: globalIndex });
      continue;
    }
    if (stepRun?.status === "WAITING" && !["LOOP","CONDITION","RUN_SUBFLOW"].includes(resolveWorkflowActionType(item))) {
      const priorResult = stepRun.metadata?.result || { status: "waiting", idempotentReplay: true };
      results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: priorResult, stepRunId: stepRun.id, idempotentReplay: true });
      workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = priorResult;
      if (item.apiName) workflowVariables.steps[item.apiName] = priorResult;
      break;
    }

    let retryAttempts = 0;
    try {
      const faultMode = String(item.faultMode || (Array.isArray(item.faultBranch) && item.faultBranch.length ? "ROUTE" : "FAIL")).toUpperCase();
      const maxRetries = faultMode === "RETRY" ? Math.max(1, Math.min(Number(item.retryCount || 1), 3)) : 0;
      const actionType = resolveWorkflowActionType(item);
      const pinnedDecisionResult = stepRun?.status === "WAITING" && actionType === "CONDITION" && stepRun.metadata?.result
        ? { ...stepRun.metadata.result, status: "completed", resumed: true }
        : null;
      let result = pinnedDecisionResult;
      while (!result) {
        try {
          result = await executeWorkflowAction({
            ...context,
            workflowVariables,
            allActions,
            action: item,
            stepRunId: stepRun?.id || null,
          });
          break;
        } catch (executionError) {
          if (retryAttempts >= maxRetries) throw executionError;
          retryAttempts += 1;
        }
      }

      let branchPaused = false;
      if (context.debugMode === true && resolveWorkflowActionType(item) === "SCHEDULE_PATH") {
        const scheduledIds = Array.isArray(item.branch) ? item.branch : [];
        const scheduledActions = scheduledIds
          .map((id) => actionById.get(String(id)))
          .filter(Boolean)
          .sort((a, b) => allActions.indexOf(a) - allActions.indexOf(b));
        const scheduledResults = scheduledActions.length
          ? await executeWorkflowActions({
              actions: scheduledActions,
              ...context,
              workflowVariables,
              allActions,
              branchExecution: true,
              executionScope: `${context.executionScope ? context.executionScope + ":" : ""}${item.id || globalIndex}:scheduled-debug`,
            })
          : [];
        result.scheduledBranch = {
          simulated: true,
          stepIds: scheduledIds,
          results: scheduledResults,
        };
        if (workflowResultsContainStatus(scheduledResults, "stopped")) result.status = "stopped";
      }
      if (resolveWorkflowActionType(item) === "LOOP") {
        const bodyIds = Array.isArray(item.bodyBranch) ? item.bodyBranch : [];
        const bodyActions = bodyIds
          .map((id) => actionById.get(String(id)))
          .filter(Boolean)
          .sort((a, b) => allActions.indexOf(a) - allActions.indexOf(b));
        const pinnedLoopCollection = stepRun?.status === "WAITING" && Array.isArray(stepRun.metadata?.result?.loopCollection)
          ? stepRun.metadata.result.loopCollection
          : null;
        const collection = pinnedLoopCollection || (Array.isArray(result?.collection) ? result.collection : []);
        const iterationOrder = String(item.iterationOrder || "FIRST_TO_LAST").toUpperCase();
        // LOOP executor already returns the collection in the requested iteration order.
        // Reversing again here would turn LAST_TO_FIRST back into FIRST_TO_LAST.
        const iterationCollection = collection;
        const itemVariable = String(item.itemVariable || result?.itemVariable || "currentItem");
        const iterations = [];
        const hadPrevious = Object.prototype.hasOwnProperty.call(workflowVariables.variables, itemVariable);
        const previousValue = workflowVariables.variables[itemVariable];
        for (let loopIndex = 0; loopIndex < iterationCollection.length; loopIndex += 1) {
          workflowVariables.variables[itemVariable] = iterationCollection[loopIndex];
          const iterationResults = await executeWorkflowActions({
            actions: bodyActions,
            ...context,
            workflowVariables,
            allActions,
            branchExecution: true,
            executionScope: `${context.executionScope ? context.executionScope + ":" : ""}${item.id || globalIndex}:loop:${loopIndex}`,
          });
          iterations.push({
            index: loopIndex,
            sourceIndex: iterationOrder === "LAST_TO_FIRST" ? collection.length - 1 - loopIndex : loopIndex,
            results: iterationResults,
          });
          if (workflowResultsContainStatus(iterationResults, "waiting")) {
            result.status = "waiting";
            result.waitingIteration = loopIndex;
            result.loopCollection = collection;
            break;
          }
          if (iterationResults.some((entry) => entry?.result?.status === "stopped")) break;
        }
        if (hadPrevious) workflowVariables.variables[itemVariable] = previousValue;
        else delete workflowVariables.variables[itemVariable];
        result.iterations = iterations;
        result.bodyStepIds = bodyIds;
        result.collection = undefined;
        if (result.status !== "waiting") delete result.loopCollection;
      }
      if (resolveWorkflowActionType(item) === "CONDITION" && typeof result?.matched === "boolean") {
        const outcomes = Array.isArray(item.outcomes) ? item.outcomes : [];
        let selectedIds;
        let outcomeName;
        if (outcomes.length) {
          const selectedOutcome = result.outcomeId == null
            ? null
            : outcomes.find((outcome) => String(outcome?.id) === String(result.outcomeId));
          selectedIds = selectedOutcome ? (selectedOutcome.branch || []) : (item.defaultBranch || []);
          outcomeName = selectedOutcome?.label || String(item.defaultLabel || "Default Outcome");
        } else {
          selectedIds = result.matched ? (item.ifBranch || []) : (item.elseBranch || []);
          outcomeName = result.matched ? "IF" : "ELSE";
        }
        const selectedActions = selectedIds
          .map((id) => actionById.get(String(id)))
          .filter(Boolean);
        if (selectedActions.length) {
          const branchResults = await executeWorkflowActions({
            actions: selectedActions,
            ...context,
            workflowVariables,
            allActions,
            branchExecution: true,
            executionScope: `${context.executionScope ? context.executionScope + ":" : ""}${item.id || globalIndex}:decision:${result.outcomeId ?? "default"}`,
          });
          result.branch = {
            outcome: outcomeName,
            outcomeId: result.outcomeId ?? null,
            stepIds: selectedIds,
            results: branchResults,
          };
          branchPaused = workflowResultsContainStatus(branchResults, "waiting");
          if (branchPaused) result.status = "waiting";
        } else {
          result.branch = { outcome: outcomeName, outcomeId: result.outcomeId ?? null, stepIds: [], results: [] };
        }
      }

      const entry = { stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result, stepRunId: stepRun?.id || null };
      workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = result;
      if (item.apiName) workflowVariables.steps[item.apiName] = result;
      applyWorkflowActionOutputStorage(item, result, workflowVariables);
      results.push(entry);

      if (result?.status === "failed") throw new WorkflowExecutionError(errorDetails(result.error || result), []);
      if (result?.status === "completed" || result?.status === "queued" || result?.status === "waiting") {
        completed.push({ action: item, stepRunId: stepRun?.id || null, index: globalIndex });
      }
      if (stepRun?.id) {
        await updateWorkflowStepRunStatus({
          db: traceDb,
          stepRunId: stepRun.id,
          status: result?.status === "stopped"
            ? "STOPPED"
            : result?.status === "waiting"
              ? "WAITING"
              : result?.status === "queued"
                ? "WAITING"
                : "COMPLETED",
          metadata: {
            result: redact(result),
            retryAttempts,
            irreversible: IRREVERSIBLE_ACTIONS.has(resolveWorkflowActionType(item)),
            ...(context.debugMode === true ? {
              resourceSnapshot: redact({
                variables: { ...(workflowVariables.variables || {}) },
                stepResult: result,
              }),
            } : {}),
          },
        });
      }

      if (result?.status === "stopped" || result?.status === "waiting" || branchPaused) break;
      if (context.branchExecution !== true && item.nextStepId) {
        const targetIndex = actions.findIndex((candidate) => String(candidate?.id || "") === String(item.nextStepId));
        if (targetIndex > actionIndex) actionIndex = targetIndex - 1;
      }
    } catch (error) {
      const details = errorDetails(error);
      const friendlyError = friendlyWorkflowError(error, resolveWorkflowActionType(item));
      if (stepRun?.id) {
        await updateWorkflowStepRunStatus({
          db: traceDb,
          stepRunId: stepRun.id,
          status: "FAILED",
          errorText: details.message,
          metadata: {
            error: details,
            friendlyError,
            retryAttempts,
            ...(context.debugMode === true ? {
              resourceSnapshot: redact({ variables: { ...(workflowVariables.variables || {}) } }),
            } : {}),
          },
        });
      }
      const faultMode = String(item.faultMode || (Array.isArray(item.faultBranch) && item.faultBranch.length ? "ROUTE" : "FAIL")).toUpperCase();
      const faultIds = Array.isArray(item.faultBranch) ? item.faultBranch : [];
      if (faultMode === "CONTINUE") {
        const handled = { status: "fault_handled", faultHandled: true, mode: "CONTINUE", error: details, friendlyError, retryAttempts };
        workflowVariables.variables.fault = {
          stepId: item.id || `step-${globalIndex + 1}`,
          actionType: resolveWorkflowActionType(item),
          message: details.message,
          title: friendlyError.title,
          howToFix: friendlyError.howToFix,
        };
        workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = handled;
      if (item.apiName) workflowVariables.steps[item.apiName] = handled;
        results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: handled, stepRunId: stepRun?.id || null });
        if (stepRun?.id) {
          await updateWorkflowStepRunStatus({
            db: traceDb,
            stepRunId: stepRun.id,
            status: "COMPLETED",
            errorText: details.message,
            metadata: { result: redact(handled), error: details, friendlyError, retryAttempts, faultPending: false },
          });
        }
        continue;
      }
      if (faultMode === "STOP") {
        const handled = { status: "stopped", faultHandled: true, mode: "STOP", error: details, friendlyError, retryAttempts };
        workflowVariables.variables.fault = {
          stepId: item.id || `step-${globalIndex + 1}`,
          actionType: resolveWorkflowActionType(item),
          message: details.message,
          title: friendlyError.title,
          howToFix: friendlyError.howToFix,
        };
        workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = handled;
      if (item.apiName) workflowVariables.steps[item.apiName] = handled;
        results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: handled, stepRunId: stepRun?.id || null });
        if (stepRun?.id) {
          await updateWorkflowStepRunStatus({
            db: traceDb,
            stepRunId: stepRun.id,
            status: "STOPPED",
            errorText: details.message,
            metadata: { result: redact(handled), error: details, friendlyError, retryAttempts, faultPending: false },
          });
        }
        break;
      }
      if ((faultMode === "ROUTE" || faultMode === "RETRY") && faultIds.length) {
        const faultActions = faultIds
          .map((id) => actionById.get(String(id)))
          .filter(Boolean)
          .sort((a, b) => allActions.indexOf(a) - allActions.indexOf(b));
        workflowVariables.variables.fault = {
          stepId: item.id || `step-${globalIndex + 1}`,
          actionType: resolveWorkflowActionType(item),
          message: details.message,
          title: friendlyError.title,
          howToFix: friendlyError.howToFix,
        };
        const faultResults = await executeWorkflowActions({
          actions: faultActions,
          ...context,
          workflowVariables,
          allActions,
          branchExecution: true,
          executionScope: `${context.executionScope ? context.executionScope + ":" : ""}${item.id || globalIndex}:fault`,
        });
        const faultWaiting = workflowResultsContainStatus(faultResults, "waiting");
        const faultStopped = workflowResultsContainStatus(faultResults, "stopped");
        const handled = {
          status: faultWaiting ? "waiting" : faultStopped ? "stopped" : "fault_handled",
          faultHandled: true,
          error: details,
          friendlyError,
          faultBranch: { stepIds: faultIds, results: faultResults },
        };
        workflowVariables.steps[item.id || `step-${globalIndex + 1}`] = handled;
      if (item.apiName) workflowVariables.steps[item.apiName] = handled;
        results.push({ stepId: item.id || `step-${globalIndex + 1}`, action: item.type || item.key, result: handled, stepRunId: stepRun?.id || null });
        if (stepRun?.id) {
          await updateWorkflowStepRunStatus({
            db: traceDb,
            stepRunId: stepRun.id,
            status: handled.status === "waiting" ? "WAITING" : handled.status === "stopped" ? "STOPPED" : "COMPLETED",
            errorText: details.message,
            metadata: {
              result: redact(handled),
              error: details,
              friendlyError,
              retryAttempts,
              faultPending: handled.status === "waiting",
              faultBranchStepIds: faultIds,
            },
          });
        }
        if (handled.status === "waiting" || handled.status === "stopped") break;
        continue;
      }
      const compensationFailures = await compensateCompletedSteps(completed, context, error);
      if (context.runId && traceDb) {
        await traceDb(
          "UPDATE platform_workflow_runs SET status='FAILED', completed_at=NOW(), error_text=$1, error_code=$2, metadata=COALESCE(metadata,'{}'::jsonb) || $3::jsonb, updated_at=NOW() WHERE id=$4 AND company_id=$5",
          [details.message, details.oeCode || "OEWE01", JSON.stringify({ rootError: details, compensationFailures }), context.runId, context.companyId || context.req?.user?.companyId]
        );
      }
      throw new WorkflowExecutionError(details, compensationFailures);
    }
  }
  return results;
}
