import { createChangePasswordHandler } from "./services/changePassword.js";
import "dotenv/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { initializeDatabase } from "./database/init.js";
import { bootstrapInitialSuperadmin } from "./database/rbacBootstrap.js";
import { seedOneSolutionsDemo } from "./database/oneSolutionsSeeder.js";
import { createAuditWriter } from "./services/auditLog.js";
import { createSessionToken, createAuthenticate } from "./services/session.js";
import { drainDuePlatformJobs, enqueuePlatformJob } from "./services/platformJobs.js";
import { processApprovalDueJob } from "./services/platformApprovals.js";
import { assertTrustedJobKind, createTrustedRuntimeGate, validateTrustedRuntime } from "./services/trustedRuntime.js";
import { validateTrustedPackageCatalogue } from "./services/trustedPackages.js";
import { executeTenantReleaseUpgrade } from "./services/appReleaseManager.js";
import { claimDueScheduledWorkflows, completeScheduledWorkflow, failScheduledWorkflow } from "./services/platformSchedules.js";
import { claimDueReportSubscriptions } from "./services/reportSubscriptionScheduler.js";
import { processReportSubscriptionDeliveryJob } from "./services/reportSubscriptionRuntime.js";
import { claimDueDashboardSubscriptions } from "./services/dashboardSubscriptionScheduler.js";
import { processDashboardSubscriptionDeliveryJob } from "./services/dashboardSubscriptionRuntime.js";
import { deliverPlatformWebhook, verifyWebhookSignature } from "./services/platformEvents.js";
import { decryptSecret, encryptSecret } from "./services/onlineOrders/platformConfig.js";
import { decryptCredentials, encryptCredentials } from "./services/integrationCredentials.js";
import {
  createWorkflowRun,
  executeWorkflowAction,
  executeWorkflowActions,
} from "./services/platformWorkflow.js";
import { resolveWorkflowResource } from "./services/platformRecordPaths.js";
import { evaluateCondition } from "./services/platformConditions.js";
import { executeSystemWorkflow } from "./services/systemWorkflowRuntime.js";
import { createBusinessCommandGateway, purgeOldBusinessCommandRuns } from "./services/businessCommandGateway.js";
import createTillRouter from "./routes/till.js";
import createHeldSalesRouter from "./routes/heldSales.js";
import createCustomersRouter from "./routes/customers.js";
import createProductsRouter from "./routes/products.js";
import createProductFeaturesRouter from "./routes/productFeatures.js";
import createPricingRouter from "./routes/pricing.js";
import createEanLookupRouter from "./routes/eanLookup.js";
import createSuppliersRouter from "./routes/suppliers.js";
import createPurchasesRouter from "./routes/purchases.js";
import createSupplierAccountsRouter from "./routes/supplierAccounts.js";
import createInventoryRouter from "./routes/inventory.js";
import createInventoryBatchesRouter from "./routes/inventoryBatches.js";

import createSalesRouter from "./routes/sales.js";
import createLayawaysRouter from "./routes/layaways.js";
import createSelfCheckoutRouter, { createSelfCheckoutModeGate } from "./routes/selfCheckout.js";
import createKioskRouter, { createKioskModeGate } from "./routes/kiosk.js";
import createScanGoRouter from "./routes/scanAndGo.js";
import createMobileScannerRouter from "./routes/mobileScanner.js";
import createReturnsRouter from "./routes/returns.js";
import createReportsRouter from "./routes/reports.js";
import createSecureInvoiceRouter from "./routes/secureInvoice.js";
import createSettingsRouter from "./routes/settings.js";
import createAccountLifecycleRouter from "./routes/accountLifecycle.js";
import createWhatsAppSettingsRouter from "./routes/whatsapp.js";
import createOneAssistantRouter from "./routes/oneAssistant.js";
import createSmsGateWebhookRouter from "./routes/smsGateWebhooks.js";
import createInvoiceDeliveryRouter from "./routes/invoiceDelivery.js";
import createAdminRouter from "./routes/admin.js";
import createAttendanceRouter from "./routes/attendance.js"; // Staff clock in/out — routes/attendance.js
import createAuditRouter from "./routes/audit.js"; // T10-AUDIT: central audit log API

import createIntegrationsRouter from "./routes/integrations.js";
import createProviderOAuthRouter from "./routes/providerOAuth.js";
import createShopifyWebhooksRouter from "./routes/shopifyWebhooks.js";
import createDashboardRouter from "./routes/dashboard.js";
import createDashboardBuilderRouter from "./routes/dashboardBuilder.js";
import createGlobalProductLookupRouter from "./routes/globalProductLookup.js";
import { createGlobalProductLookupService } from "./services/globalProductLookup.js";
import createReplenishmentRouter from "./routes/replenishment.js";
import createOnlineRouter from "./routes/online.js";
import createCustomerAuthRouter from "./routes/customerAuth.js";
import createAccountingExportRouter from "./routes/accountingExport.js"; // T10V - accounting integration export
import createJarvisRouter from "./routes/jarvis.js"; // JARVIS V1 - authenticated AI assistant questions
import createSuperadminRouter from "./routes/superadmin.js";
import createPlatformRouter from "./routes/platform.js";
import createPlatformDeploymentsRouter from "./routes/platformDeployments.js";
import createPlatformSecurityRouter from "./routes/platformSecurity.js";
import createIdentitySecurityRouter from "./routes/identitySecurity.js";
import createIdentityAssuranceRouter from "./routes/identityAssurance.js";
import createIdentityProviderLoginRouter from "./routes/identityProviderLogin.js";
import createSecurityGovernanceRouter from "./routes/securityGovernance.js";
import createDataProtectionRouter from "./routes/dataProtection.js";
import { accessDecision, clientIp, clearFailedLogin, createTrackedSession, enforceTrackedSession, finalizeSuccessfulLogin, loadLoginSecurityContext, registerFailedLogin, writeLoginHistory } from "./services/identitySecurity.js";
import { assuranceSatisfies, createPendingChallenge, effectiveStepUpPolicy, findTrustedDevice, listMfaMethods, loadEffectiveAssurance, mfaMethodAllowed, sortMfaMethods, stepUpRequired } from "./services/identityAssurance.js";
import createHospitalityRouter from "./routes/hospitality.js";
import { createClientWebShopRouter } from "./routes/clientWebShop.js";
import createOwnDeliveryRouter from "./routes/ownDelivery.js";
import createPackagesRouter from "./routes/packages.js";
import createConnectorsRouter from "./routes/connectors.js";
import createPaypalQrRouter from "./routes/paypalQr.js";
import createGoogleConnectRouter from "./routes/googleConnect.js";
import { ConnectorDriverRegistry } from "./services/connectorRuntime.js";
import { createReferencePaymentDriver } from "./services/referencePaymentConnector.js";
import { createPaypalQrDriver } from "./services/paypalQrConnector.js";
import { createSmsGateDriver, configureSmsGateInboundWebhook, getSmsGateDiagnostics } from "./services/smsGateConnector.js";
import { createBrevoDriver, createMailjetDriver } from "./services/emailProviderConnectors.js";
import { ONE_CONNECT_PROVIDER_DRIVER_KEYS, createOneConnectProviderDriver } from "./services/oneConnectProviders.js";
import createPlatformFilesRouter from "./routes/platformFiles.js";
import createPlatformSequencesRouter from "./routes/platformSequences.js";
import createPlatformSchedulesRouter from "./routes/platformSchedules.js";
import createPlatformEventsRouter from "./routes/platformEvents.js";
import { saveDomainConfiguration } from "./services/platformDomainRecords.js";
import createAdvancedPlatformRouter from "./routes/advancedPlatform.js";
import createDebugCodesRouter from "./routes/debugCodes.js";
import { buildDebugPayload, classifyDebugCode, builtinDebugCode, createDebugReference, normalizeDebugCode, writeDebugEvent } from "./services/debugCodes.js";
import { initializePlatformMetadata, initializeStandardObjectEcosystem } from "./services/platformMetadata.js";
import { seedInternalAppCatalog } from "./services/internalAppCatalog.js";
import { provisionPackageMetadata, seedPackageRegistry, verifyPublicPackageRegistry } from "./services/packageRegistry.js";
import { getCompanyEntitlements } from "./services/licensing.js";
import { reconcileCompanyPackageEntitlements } from "./services/packageEntitlements.js";
import { requireEntitlement } from "./services/licensing.js";
import { getGoogleConnectRuntimeForEmail, getGoogleConnectRuntime, resolveGoogleConnectPasswordLoginRuntime } from "./services/googleConnect.js";
import { createJarvis } from "./services/jarvis/index.js";
import { createJarvisTools } from "./services/jarvis/tools/index.js"; // JARVES V2 - read-only Sales tool
import { createCanonicalRelatedTransaction, syncCanonicalSaleTransaction } from "./services/canonicalTransactions.js";
import { createJarvesAccessChecker } from "./services/jarvis/licensing.js"; // JARVES V2 - licence gate
import { companyAdministrativeAccess, permissionAllows } from "./services/authorization.js";
import { loadEffectivePermissionSets, permissionSetAllowsSystemPermission } from "./services/platformPermissionSets.js";
import { createTenantPoolManager, getRequestHostname, resolveTenantFromHostname } from "./services/tenantResolver.js";
import { createTenantDatabaseRouter, createAuthenticatedDatabaseMiddleware, getRequestDatabaseContext, getRequestPool } from "./services/tenantDatabase.js";
/* Inventory primitives live in services/inventory.js (shared with every
 * stock writer: POS sales, purchases, returns, adjustments). */
import {
  createInventoryMovement,
  inventoryMovementTypes,
} from "./services/inventory.js";

const { Pool } = pg;

const PASSWORD_BCRYPT_ROUNDS = Math.max(10, Math.min(12, Number.parseInt(process.env.ONEPOS_BCRYPT_ROUNDS || "10", 10) || 10));

/*
 * Express 4 does not forward rejected promises from async route handlers to
 * error middleware. All onePOS routers are created after this patch, so wrap
 * async handlers once at Router creation time instead of duplicating
 * try/catch boilerplate across every route module.
 */
const originalExpressRouter = express.Router;
express.Router = function onePosAsyncSafeRouter(...args) {
  const router = originalExpressRouter(...args);
  for (const method of ["get", "post", "put", "patch", "delete", "use"]) {
    const register = router[method].bind(router);
    router[method] = (...registrationArgs) => {
      const wrap = (handler) => {
        if (Array.isArray(handler)) return handler.map(wrap);
        if (typeof handler !== "function" || handler.length === 4 || handler.constructor?.name !== "AsyncFunction") return handler;
        return function onePosAsyncRouteHandler(req, res, next) {
          return Promise.resolve(handler(req, res, next)).catch(next);
        };
      };
      if (!registrationArgs.length) return register();
      const [first, ...rest] = registrationArgs;
      if (typeof first === "function" || Array.isArray(first)) {
        return register(wrap(first), ...rest.map(wrap));
      }
      return register(first, ...rest.map(wrap));
    };
  }
  return router;
};
Object.assign(express.Router, originalExpressRouter);

const app = express();
// Render terminates TLS in front of Node. Trust exactly one proxy hop so req.ip is the authoritative client IP.
app.set("trust proxy", 1);

const PORT = process.env.PORT || 10000;
let httpServer = null;
let startupRetryTimer = null;
let startupAttempt = 0;
let runtimeReadiness = {
  state: "starting",
  oeCode: "OESB01",
  message: "OneEngine is starting. Please try again shortly.",
  technicalMessage: null,
  updatedAt: new Date().toISOString(),
};


/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

const configuredCorsOrigins = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const defaultCorsOrigins = new Set([
  "https://onesolutions-ahuja.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (defaultCorsOrigins.has(origin) || configuredCorsOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && (url.hostname === "onepos.com" || url.hostname.endsWith(".onepos.com"));
  } catch {
    return false;
  }
};
app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    if (!origin) return callback(null, true);
    db("SELECT 1 FROM security_trusted_origins WHERE origin=$1 AND origin_type='CORS' AND active=TRUE LIMIT 1", [origin])
      .then((result) => callback(result.rows.length ? null : new Error("CORS origin not allowed"), result.rows.length > 0))
      .catch(() => callback(new Error("CORS origin not allowed"), false));
  },
  credentials: true,
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "X-Acting-Company-Id",
    "X-Store-Id",
    "X-One-Device-Key",
    "X-OneEngine-Capability",
    "X-OneEngine-Runtime",
    "X-Requested-With",
  ],
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (req.secure || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

function createFixedWindowRateLimiter({ windowMs, max, keyPrefix }) {
  const buckets = new Map();
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of buckets) if (entry.resetAt <= now) buckets.delete(key);
  };
  const timer = setInterval(cleanup, Math.max(60_000, Math.min(windowMs, 15 * 60_000)));
  timer.unref?.();
  return (req, res, next) => {
    const now = Date.now();
    const address = String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    const key = `${keyPrefix}:${address}`;
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, code: "OEAR01", oeCode: "OEAR01", message: "Too many requests. Please try again shortly." });
    }
    next();
  };
}
const apiLimiter = createFixedWindowRateLimiter({ windowMs: 60_000, max: 600, keyPrefix: "api" });
const loginLimiter = createFixedWindowRateLimiter({ windowMs: 15 * 60_000, max: 5, keyPrefix: "login" });
app.use("/api", apiLimiter);

/*
 * Deliveroo webhooks are HMAC-signed over the RAW request body - parse it
 * before the global JSON parser consumes the stream (express.raw sets
 * req.body to a Buffer; express.json then skips the already-parsed body).
 */
app.use("/api/online/deliveroo/webhook", express.raw({ type: "*/*", limit: "1mb" }));

/*
 * Uber primary webhook is HMAC-signed (X-Uber-Signature) over the RAW body -
 * same raw-parsing mechanism as the Deliveroo webhook above.
 */
app.use("/api/online/uber/webhook", express.raw({ type: "*/*", limit: "1mb" }));

app.use("/api/webhooks/inbound", express.raw({ type: "*/*", limit: "1mb" }));
app.use("/api/whatsapp/webhook", express.raw({ type: "*/*", limit: "1mb" }));
app.use("/api/smsgate/webhook", express.raw({ type: "*/*", limit: "64kb" }));
app.use("/api/shopify/webhooks", express.raw({ type: "*/*", limit: "1mb" }));

app.use(express.json({ limit: "10mb" }));

/* T10D: Self-Checkout mode gate — ahead of EVERY API router so a
 * self-checkout mode token is refused for privileged operations
 * server-side (never merely hidden in the UI). */
app.use(createSelfCheckoutModeGate());
app.use(createKioskModeGate());
app.use(createTrustedRuntimeGate());
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Keep the process reachable while core dependencies initialise. This lets the
// browser receive an exact OneEngine code (for example OEDQ01 for a database
// resource limit) instead of incorrectly assuming that Render is merely starting.
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/") return next();
  if (runtimeReadiness.state === "ready") return next();
  const definition = builtinDebugCode(runtimeReadiness.oeCode) || builtinDebugCode("OESB01");
  return res.status(503).json({
    success: false,
    code: definition.code,
    oeCode: definition.code,
    title: definition.title,
    message: definition.userMessage,
    retryable: definition.retryable === true,
    reference: "STARTUP",
  });
});

/*
|--------------------------------------------------------------------------
| PostgreSQL
|-------------------------------------------------------------------------- */
function normalizePrimaryDatabaseUrl(value) {
  const parsed = new URL(value);
  const mode = String(parsed.searchParams.get("sslmode") || "").toLowerCase();
  if (["prefer", "require", "verify-ca"].includes(mode) && parsed.searchParams.get("uselibpqcompat") !== "true") {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
}

const normalizedPrimaryDatabaseUrl = process.env.DATABASE_URL
  ? normalizePrimaryDatabaseUrl(process.env.DATABASE_URL)
  : "";

function normalizePemCertificate(value) {
  const certificate = String(value || "").trim();
  if (!certificate) return "";
  return certificate.includes("\\n") ? certificate.replace(/\\n/g, "\n") : certificate;
}

function stripConnectionStringSslOptions(value) {
  const parsed = new URL(value);
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

const primaryDatabaseCaCertificate = normalizePemCertificate(process.env.DATABASE_CA_CERT);
const primaryDatabaseSsl = primaryDatabaseCaCertificate
  ? {
      ca: primaryDatabaseCaCertificate,
      rejectUnauthorized: true,
    }
  : undefined;
const primaryDatabaseUrl = primaryDatabaseCaCertificate
  ? stripConnectionStringSslOptions(normalizedPrimaryDatabaseUrl)
  : normalizedPrimaryDatabaseUrl;

function describeDatabaseTarget(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname || "unknown",
      port: parsed.port || "5432",
      database: String(parsed.pathname || "").replace(/^\//, "") || "unknown",
      sslmode: parsed.searchParams.get("sslmode") || "default",
    };
  } catch {
    return { host: "unparseable", port: "", database: "", sslmode: "" };
  }
}

const primaryDatabaseTarget = primaryDatabaseUrl ? describeDatabaseTarget(primaryDatabaseUrl) : null;

const pool = primaryDatabaseUrl
  ? new Pool({
      connectionString: primaryDatabaseUrl,
      ...(primaryDatabaseSsl ? { ssl: primaryDatabaseSsl } : {}),
      /*
       * Startup safety: without these bounds a single abandoned connection
       * (e.g. a transaction left "idle in transaction" while an outbound
       * platform HTTP call never returns) keeps its row locks forever, every
       * later query - including the schema DDL run at boot - waits on it
       * indefinitely, app.listen() is never reached and the platform reports
       * "No open ports detected".
       *
       *   - connectionTimeoutMillis: fail fast instead of hanging on connect
       *   - idle_in_transaction_session_timeout: Postgres aborts an abandoned
       *     open transaction (releasing its locks) instead of keeping it
       *   - lock_timeout / statement_timeout: a blocked query errors out
       *     rather than waiting forever
       */
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      max: Math.max(2, Math.min(10, Number.parseInt(process.env.PG_POOL_MAX || "5", 10) || 5)),
    })
  : null;

const tenantPoolManager = createTenantPoolManager({
  env: process.env,
  PoolFactory: Pool,
  poolOptions: {
    connectionTimeoutMillis: 15000,
  },
});

app.locals.pool = pool;
app.locals.tenantPoolManager = tenantPoolManager;
const tenantDatabaseRouter = pool
  ? createTenantDatabaseRouter({ controlPool: pool, sharedPool: pool, PoolFactory: Pool, env: process.env })
  : null;
app.locals.tenantDatabaseRouter = tenantDatabaseRouter;

app.use((req, res, next) => {
  const hostname = getRequestHostname(req);
  const tenant = resolveTenantFromHostname(hostname, process.env, { defaultTenantKey: "default" });
  req.tenant = tenant;
  req.tenantPool = pool;
  next();
});
/* T10P: Scan & Go checkout deducts stock through the SAME inventory ledger
 * helper the till and online orders use (no second inventory mechanism). */
app.locals.createInventoryMovement = createInventoryMovement;

/*
 * A backend error on an idle pool connection (network blip, Postgres restart,
 * idle-in-transaction termination) must never take the whole server down.
 * The broken client is simply removed from the pool; in-flight requests that
 * used it get their own query error which the route handlers report normally.
 */
if (pool) {
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool client error (connection discarded):", error.message);
  });
}

/*
 * Last-resort process guards: a single stray async rejection (fire-and-forget
 * delivery, integration dispatch, a dropped socket mid-write) must never kill
 * the till server - a dead backend shows up to every open POS screen as
 * "Failed to fetch". Log with full stack and keep serving; Node's default
 * behaviour for these events is to terminate the process.
 */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept alive):", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception (server kept alive):", error);
});

async function db(query, params = [], reqOverride = null) {
  const request = reqOverride || null;
  const requestContext = getRequestDatabaseContext();
  const tenantPool = requestContext?.pool || request?.tenantPool || (request ? tenantPoolManager.getPoolForRequest(request) : null);
  const chosenPool = tenantPool || pool;

  if (!chosenPool) {
    throw new Error("DATABASE_URL is not configured");
  }

  return chosenPool.query(query, params);
}


// Every handled API failure also receives a OneEngine diagnostic code.
// This covers route handlers that deliberately return {success:false} and
// therefore never reach the final exception boundary.
app.use("/api", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (body && typeof body === "object" && body.success === false) {
        const existing = normalizeDebugCode(body.oeCode || "");
        const status = Number(res.statusCode || 500);
        const diagnosticError = Object.assign(
          new Error(String(body.message || body.error || body.code || "OneEngine request failed")),
          { code: body.code && !String(body.code).startsWith("OE") ? body.code : undefined }
        );
        const derived = builtinDebugCode(existing)
          ? existing
          : classifyDebugCode(diagnosticError, status);
        const definition = builtinDebugCode(derived) || builtinDebugCode("OEXU01");
        const reference = String(body.reference || body.debugReference || createDebugReference()).toUpperCase();

        body = {
          ...body,
          oeCode: definition.code,
          reference,
        };

        void writeDebugEvent(db, {
          reference,
          definition,
          error: diagnosticError,
          status,
          req,
        });
      }
    } catch (debugError) {
      console.error("OneEngine response diagnostic decoration failed:", debugError?.message || debugError);
    }
    return originalJson(body);
  };
  next();
});

const paymentProviders = new Map();
const connectorDrivers = new ConnectorDriverRegistry();
connectorDrivers.register(createReferencePaymentDriver());
connectorDrivers.register(createPaypalQrDriver());
connectorDrivers.register(createSmsGateDriver());
connectorDrivers.register(createBrevoDriver());
connectorDrivers.register(createMailjetDriver());
for (const providerKey of ONE_CONNECT_PROVIDER_DRIVER_KEYS) {
  connectorDrivers.register(createOneConnectProviderDriver(providerKey));
}
app.locals.connectorDrivers = connectorDrivers;

async function testPaymentTerminal(terminal) {
  if (!terminal || !terminal.active || !terminal.provider || !terminal.connection_url) {
    return { status: "NOT_CONFIGURED", message: "Not configured" };
  }

  const provider = paymentProviders.get(terminal.provider.toLowerCase());

  if (!provider) {
    return { status: "PROVIDER_NOT_SUPPORTED", message: "Provider not supported" };
  }

  return provider.testConnection(terminal);
}

/*
 * Audit logging must never break the operation being audited - see
 * services/auditLog.js (unknown users are nulled to satisfy the FK; other
 * failures are logged and swallowed so a committed business action stands).
 */
app.use("/api", createBusinessCommandGateway({ db }));

const writeAudit = createAuditWriter({ db });
app.locals.writeAudit = writeAudit;
const workflowTraceRetentionDays = Math.max(7, Number(process.env.WORKFLOW_TRACE_RETENTION_DAYS || 90));
const purgeWorkflowTraceBatch = () => purgeOldBusinessCommandRuns({
  db,
  retentionDays: workflowTraceRetentionDays,
  batchSize: 5000,
}).catch((error) => console.error("Workflow trace retention cleanup error:", error?.message || error));
setTimeout(purgeWorkflowTraceBatch, 60_000).unref?.();
setInterval(purgeWorkflowTraceBatch, 6 * 60 * 60 * 1000).unref?.();
const globalProductLookupService = createGlobalProductLookupService();

/*
|--------------------------------------------------------------------------
| JWT / Authentication (session layer - services/session.js)
|--------------------------------------------------------------------------
*/

const createToken = createSessionToken;
const baseAuthenticate = createAuthenticate({
  onAuthenticated: createAuthenticatedDatabaseMiddleware({ router: tenantDatabaseRouter, pool }),
});
function sensitiveResourceKey(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.originalUrl || req.path || "").split("?")[0];

  // Salesforce-style high-assurance controls are intentionally granular.
  // Reads are included where the protected resource itself can expose sensitive
  // information (for example reports, auth providers and health/security views).
  if (/\/api\/security\/data\/exports?(?:\/|$)/.test(path)) return "MANAGE_DATA_EXPORT";
  if (/\/api\/security\/data\/retention(?:\/|$)/.test(path)) return "MANAGE_DATA_EXPORT";
  if (/\/api\/security\/email(?:\/|$)/.test(path)) return "SECURITY_CONFIGURATION";
  if (/\/api\/security\/delegated-admin(?:\/|$)/.test(path)) return "MANAGE_USERS";
  if (/\/api\/security\/governance\/health(?:\/|$)/.test(path)) return "VIEW_HEALTH_CHECK";
  if (/\/api\/security\/governance\/certificates(?:\/|$)/.test(path)) return "MANAGE_CERTIFICATES";
  if (/\/api\/security\/governance\/vault(?:\/|$)/.test(path)) return "MANAGE_ENCRYPTION_KEYS";
  if (/\/api\/security\/governance\/(connected-apps|api-policy)(?:\/|$)/.test(path)) return "MANAGE_CONNECTED_APPS";
  if (/\/api\/security\/governance\/trusted-origins(?:\/|$)/.test(path)) return "MANAGE_CONNECTED_APPS";
  if (/\/api\/security\/auth-providers(?:\/|$)/.test(path)) return "MANAGE_AUTH_PROVIDERS";
  if (/\/api\/security\/policies(?:\/|$)/.test(path) && !/\/ip-ranges(?:\/|$)/.test(path)) return "MANAGE_LOGIN_ACCESS_POLICIES";
  if (/\/api\/security\/settings(?:\/|$)/.test(path) && method !== "GET") {
    const body=req.body||{};
    if (["passwordExpiryDays","passwordHistoryCount","minimumPasswordLength","passwordComplexity","maximumInvalidLoginAttempts","lockoutMinutes","lockoutForever","minimumPasswordLifetimeHours"].some(key=>Object.prototype.hasOwnProperty.call(body,key))) return "MANAGE_PASSWORD_POLICIES";
  }
  if (/\/api\/security\/(trusted-ranges|ip-ranges)(?:\/|$)/.test(path)
      || /\/api\/security\/policies\/[^/]+\/ip-ranges(?:\/|$)/.test(path)) return "MANAGE_IP_ADDRESSES";
  if (/\/api\/security\/users\/[^/]+\/unlock(?:\/|$)/.test(path)
      || /\/api\/auth\/password-reset/.test(path)) return "UNLOCK_RESET_PASSWORDS";
  if (/\/api\/security\/mfa(?:\/|$)|\/api\/security\/trusted-devices(?:\/|$)/.test(path) && method !== "GET") return "MANAGE_MFA_UI";
  if (/\/api\/platform\/permission(?:-sets|-set-groups)?(?:\/|$)/.test(path)) return "MANAGE_PERMISSION_SETS_PROFILES";
  if (/\/api\/(settings\/roles|roles)(?:\/|$)/.test(path) && method !== "GET") return "MANAGE_ROLES";
  if (/\/api\/platform\/security\/(?:objects\/[^/]+\/sharing|sharing-rules|public-groups|queues)(?:\/|$)/.test(path)) return "MANAGE_SHARING";
  if (/\/api\/(admin\/users|settings\/users|platform\/objects\/employee)(?:\/|$)/.test(path)) return "MANAGE_USERS";
  if (/\/api\/(reports|custom-reports|dashboard|dashboard-builder)(?:\/|$)/.test(path)) return "REPORTS_DASHBOARDS";
  if (/\/api\/.*(?:export|data-export)(?:\/|$)/.test(path)) return "MANAGE_DATA_EXPORT";
  if (/\/api\/(connectors|integrations|packages)(?:\/|$)/.test(path) && method !== "GET") return "MANAGE_CONNECTED_APPS";
  if (/\/api\/security\/(certificates|keys)(?:\/|$)/.test(path)) return "MANAGE_CERTIFICATES";
  if (/\/api\/security\/(encryption|credential-vault)(?:\/|$)/.test(path)) return "MANAGE_ENCRYPTION_KEYS";
  if (/\/api\/security\/health(?:\/|$)/.test(path)) return "VIEW_HEALTH_CHECK";

  // OneEngine-specific administrative equivalents.
  if (/\/api\/platform\/deployments|\/api\/app-releases/.test(path)) return "DEPLOYMENT_ADMIN";
  if (/\/api\/platform\/security/.test(path)) return "ACCESS_CONTROL_ADMIN";
  if (method !== "GET" && /\/api\/security\/(settings|assurance|policies|step-up)/.test(path)) return "SECURITY_CONFIGURATION";
  return null;
}

const authenticate = (req, res, next) => baseAuthenticate(req, res, async (error) => {
  if (error) return next(error);
  try {
    const securityDecision = await enforceTrackedSession(db, req);
    if (!securityDecision.allowed) {
      const status = securityDecision.code?.startsWith("SESSION_") ? 401 : 403;
      return res.status(status).json({
        success: false,
        code: securityDecision.code || "SECURITY_POLICY_BLOCKED",
        message: securityDecision.reason || "Access denied by security policy",
      });
    }
    req.authSession = securityDecision.session || null;
    const resourceKey = sensitiveResourceKey(req);
    if (resourceKey && req.user?.companyId && req.user?.sid) {
      const policy = await effectiveStepUpPolicy(db, { companyId: req.user.companyId, resourceKey });
      if (policy?.action === "BLOCK") {
        return res.status(403).json({ success: false, code: "RESOURCE_BLOCKED", resourceKey, message: "This operation is blocked by security policy" });
      }
      if (policy && stepUpRequired({ session: req.authSession, policy, defaultMinutes: 15 })) {
        return res.status(428).json({ success: false, code: "STEP_UP_REQUIRED", resourceKey, message: "Additional identity verification is required for this operation" });
      }
    }
    const requestedStoreId = String(req.headers?.["x-store-id"] || "").trim();
    if (requestedStoreId) {
      const allowed = await canAccessStore(req.user, requestedStoreId);
      if (!allowed) {
        return res.status(403).json({ success: false, message: "You are not authorised for the selected store" });
      }
      req.user = { ...req.user, storeId: requestedStoreId };
    }
    await req.ensureBusinessCommandRun?.({
      companyId: req.user?.companyId || null,
      userId: req.user?.id || null,
      storeId: req.user?.storeId || null,
    });
    return next();
  } catch (nextError) {
    return next(nextError);
  }
});

/*
|--------------------------------------------------------------------------
| JARVIS AI assistant (V1 - authenticated text questions)
|--------------------------------------------------------------------------
|
| Built once at boot from the environment. GEMINI_API_KEY is read here,
| server-side only: it is never sent to the browser and never returned in a
| response. The AI provider sits behind a service abstraction
| (services/jarvis/*) so a future OpenAI / local model does not change this
| endpoint. See JARVIS.md.
|
| This changes NO existing behaviour - it only adds the JARVIS service used
| by the dedicated routes/jarvis.js router registered further below.
*/
/*
 * JARVES read-only tools + licence gate. Built once at boot from the EXISTING
 * db helper and admin-bypass helper - no new permission system, and the tool
 * runner only ever runs SELECTs scoped to the caller's verified company/store.
*/
const jarvis = createJarvis({ tools: createJarvisTools({ db, canViewCompanyCustomers }) });
const jarvesAccess = createJarvesAccessChecker({ db });
// Shared, server-only AI service for authenticated Flow actions. No provider
// credentials are exposed through app.locals; callers only receive ask().
app.locals.oneEngineAgent = jarvis;

/*
|--------------------------------------------------------------------------
| Authorization (reuses the existing permissions / role_permissions model)
|--------------------------------------------------------------------------
|
| `authorize` is intended to be used after `authenticate`. It resolves the
| permission codes granted to `req.user.roleId` via `role_permissions` and
| requires the user to hold at least one of the supplied codes.
|
| Administrator/Owner roles (as defined by `canViewCompanyCustomers`) retain
| full access, matching the existing behaviour for those accounts.
*/

const rolePermissionRequestCache = new WeakMap();

async function getRolePermissionCodes(roleId, request = null) {
  if (!roleId) return [];

  // Multiple authorization helpers can run during one HTTP request. Reuse the
  // same DB result within that request only; never persist permissions across
  // requests, so role changes still take effect immediately.
  if (request) {
    const cached = rolePermissionRequestCache.get(request);
    if (cached?.roleId === roleId) return cached.promise;
  }

  const loading = db(
    `
    SELECT p.code
    FROM role_permissions rp
    INNER JOIN permissions p
      ON p.id = rp.permission_id
    WHERE rp.role_id = $1
    `,
    [roleId]
  ).then((result) => result.rows.map((row) => row.code));

  if (request) rolePermissionRequestCache.set(request, { roleId, promise: loading });
  return loading;
}

/*
 * Company-administrative access for the caller's OWN company.
 * Action authority is permission-driven. Company-wide data scope is a separate
 * permission and never follows a role display name.
 */
async function hasCompanyAdminAccess(req) {
  return (await hasPermission(req, "settings.manage"))
    || (await hasPermission(req, "company.scope.all"));
}

function authorize(...permissionCodes) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    try {
      const [codes, permissionSets] = await Promise.all([
        getRolePermissionCodes(req.user.roleId, req),
        loadEffectivePermissionSets(db, req.user, req),
      ]);
      for (const code of permissionCodes) {
        if (permissionSetAllowsSystemPermission(permissionSets, code) && !codes.includes(code)) {
          codes.push(code);
        }
      }

      if (permissionAllows({ permissions: codes, requiredPermissions: permissionCodes })) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
    } catch (error) {
      console.error("Authorization error:", error);

      return res.status(500).json({
        success: false,
        message: "Authorization check failed",
      });
    }
  };
}

async function hasPermission(req, code) {
  const [codes, permissionSets] = await Promise.all([
    getRolePermissionCodes(req.user?.roleId, req),
    loadEffectivePermissionSets(db, req.user, req),
  ]);
  return codes.includes(code) || permissionSetAllowsSystemPermission(permissionSets, code);
}

async function associateCustomerWithStore(client, customerId, storeId, companyId, lastPurchaseAt = null) {
  const customer = await client.query(
    `SELECT id FROM customers WHERE id = $1 AND company_id = $2 AND active = true`,
    [customerId, companyId]
  );
  if (!customer.rows.length) throw new Error("Customer not found");

  const store = await client.query(
    `SELECT id FROM stores WHERE id = $1 AND company_id = $2 AND active = true`,
    [storeId, companyId]
  );
  if (!store.rows.length) throw new Error("Store not found");

  const result = await client.query(
    `
    INSERT INTO customer_stores (customer_id, store_id, last_purchase_at)
    VALUES ($1,$2,$3)
    ON CONFLICT (customer_id, store_id) DO UPDATE SET
      active = true,
      last_purchase_at = CASE
        WHEN EXCLUDED.last_purchase_at IS NULL THEN customer_stores.last_purchase_at
        WHEN customer_stores.last_purchase_at IS NULL THEN EXCLUDED.last_purchase_at
        WHEN EXCLUDED.last_purchase_at > customer_stores.last_purchase_at THEN EXCLUDED.last_purchase_at
        ELSE customer_stores.last_purchase_at
      END
    RETURNING id, customer_id, store_id, created_at, last_purchase_at, active
    `,
    [customerId, storeId, lastPurchaseAt]
  );
  return result.rows[0];
}

async function canViewCompanyCustomers(user, request = null) {
  if (!user?.id || !user?.companyId) return false;
  const codes = user.roleId ? await getRolePermissionCodes(user.roleId, request) : [];
  const permissionSets = await loadEffectivePermissionSets(db, user, request);
  return codes.includes("company.scope.all")
    || permissionSetAllowsSystemPermission(permissionSets, "company.scope.all");
}

async function canAccessStore(user, storeId) {
  if (!storeId || !user?.companyId || !user?.id) return false;

  // Legacy user_stores was removed. The authenticated user's default store
  // pointer is the core fallback; wider multi-store access is metadata-driven.
  const assignment = await db(
    `SELECT 1
       FROM users u
       JOIN stores s ON s.id=u.store_id
      WHERE u.id=$1
        AND u.company_id=$2
        AND u.active=true
        AND u.store_id=$3
        AND s.company_id=$2
        AND s.active=true
      LIMIT 1`,
    [user.id, user.companyId, storeId]
  );
  return assignment.rows.length > 0;
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/health", (req, res) => {
  // Keep routine connectivity probes memory-only. The previous health route
  // queried PostgreSQL, bootstrap metadata, and the package registry on every
  // browser poll, which prevented idle databases from ever becoming idle and
  // multiplied bandwidth across every open client.
  const ready = runtimeReadiness.state === "ready";
  const oeCode = ready ? null : (runtimeReadiness.oeCode || "OESB01");
  const definition = oeCode ? (builtinDebugCode(oeCode) || builtinDebugCode("OEAA01")) : null;

  res.status(ready ? 200 : 503).json({
    success: ready,
    app: "OneEngine",
    status: runtimeReadiness.state,
    version: "0.2.0",
    database: ready ? "connected" : (runtimeReadiness.state === "degraded" ? "unavailable" : "unknown"),
    readiness: {
      state: runtimeReadiness.state,
      updatedAt: runtimeReadiness.updatedAt,
    },
    diagnostics: {
      serviceUrl: process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_API_URL || null,
      buildCommit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null,
    },
    ...(definition ? {
      code: definition.code,
      oeCode: definition.code,
      title: definition.title,
      message: definition.userMessage,
      retryable: definition.retryable === true,
    } : {}),
    time: new Date().toISOString(),
  });
});

// Deep health is intentionally explicit and protected by normal API readiness.
// It is for diagnostics, not browser connectivity polling.
app.get("/api/health/deep", async (req, res) => {
  if (runtimeReadiness.state !== "ready") {
    const definition = builtinDebugCode(runtimeReadiness.oeCode) || builtinDebugCode("OESB01");
    return res.status(503).json({
      success: false,
      code: definition.code,
      oeCode: definition.code,
      message: definition.userMessage,
      database: "unavailable",
    });
  }

  try {
    await db("SELECT 1");
    const [bootstrap, packageRegistry] = await Promise.all([
      platformBootstrapIsCurrent(),
      verifyPublicPackageRegistry(db),
    ]);
    const healthy = bootstrap.current === true && packageRegistry.healthy === true;
    return res.status(healthy ? 200 : 503).json({
      success: healthy,
      database: "connected",
      platformBootstrap: bootstrap,
      packageRegistry,
      time: new Date().toISOString(),
    });
  } catch (error) {
    const code = classifyDebugCode(error, 503);
    const definition = builtinDebugCode(code) || builtinDebugCode("OENH01");
    return res.status(503).json({
      success: false,
      code: definition.code,
      oeCode: definition.code,
      message: definition.userMessage,
      database: "unavailable",
      time: new Date().toISOString(),
    });
  }
});

/*
|--------------------------------------------------------------------------
| API information
|--------------------------------------------------------------------------
*/

app.get("/api", (req, res) => {
  res.json({
    name: "onePOS API",
    version: "0.2.0",
    status: "online",
  });
});

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

const GOOGLE_OAUTH_STATE_COOKIE = "onepos_google_oauth_state";

function cookieValue(req, name) {
  const raw = String(req.headers?.cookie || "");
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function safeGoogleReturnTo(value) {
  const fallback = "https://onesolutions-ahuja.github.io/OneEngine/";
  try {
    const parsed = new URL(String(value || fallback));
    const allowed = new Set([
      "https://onesolutions-ahuja.github.io",
      "https://smart-theme.onrender.com",
      "https://oneengine2.onrender.com",
      "http://localhost:5173",
    ]);
    if (!allowed.has(parsed.origin)) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function googleOAuthErrorRedirect(returnTo, code) {
  const target = new URL(safeGoogleReturnTo(returnTo));
  target.hash = `google_error=${encodeURIComponent(code)}`;
  return target.toString();
}

app.get("/api/auth/google/status", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();
    if (!email || !pool) {
      return res.json({ success: true, data: { available: false, code: "SSO_NOT_CONNECTED" } });
    }
    const runtime = await getGoogleConnectRuntimeForEmail((query, params = []) => pool.query(query, params), email);
    return res.json({
      success: true,
      data: {
        available: runtime.ready === true,
        code: runtime.ready === true ? "READY" : "SSO_NOT_CONNECTED",
      },
    });
  } catch (error) {
    console.error("Google SSO status error:", error);
    return res.json({ success: true, data: { available: false, code: "SSO_NOT_CONNECTED" } });
  }
});

app.get("/api/auth/google/start", async (req, res) => {
  const secret = process.env.JWT_SECRET;
  const returnTo = safeGoogleReturnTo(req.query?.returnTo);
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();
    if (!email || !pool) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "sso_not_connected"));
    }

    const runtime = await getGoogleConnectRuntimeForEmail((query, params = []) => pool.query(query, params), email);
    if (!runtime.ready || !runtime.connection?.id) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "sso_not_connected"));
    }

    const { clientId, redirectUri } = runtime.config;
    const nonce = randomBytes(24).toString("base64url");
    const state = jwt.sign(
      {
        type: "google_oauth",
        nonce,
        returnTo,
        companyId: runtime.companyId,
        integrationId: runtime.connection.id,
        loginEmail: email,
      },
      secret,
      { expiresIn: "10m" }
    );

    res.setHeader(
      "Set-Cookie",
      `${GOOGLE_OAUTH_STATE_COOKIE}=${encodeURIComponent(nonce)}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google; Max-Age=600`
    );

    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", "openid email profile");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("prompt", "select_account");
    authorize.searchParams.set("login_hint", email);
    return res.redirect(authorize.toString());
  } catch (error) {
    console.error("Google OAuth start error:", error);
    return res.redirect(googleOAuthErrorRedirect(returnTo, "sso_not_connected"));
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const secret = process.env.JWT_SECRET;

  let returnTo = "https://onesolutions-ahuja.github.io/OneEngine/";
  try {
    if (!pool) return res.redirect(googleOAuthErrorRedirect(returnTo, "sso_not_connected"));

    const state = jwt.verify(String(req.query?.state || ""), secret);
    if (state?.type !== "google_oauth" || !state?.nonce || !state?.companyId || !state?.integrationId || !state?.loginEmail) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "invalid_state"));
    }
    returnTo = safeGoogleReturnTo(state.returnTo);

    const cookieNonce = cookieValue(req, GOOGLE_OAUTH_STATE_COOKIE);
    const left = Buffer.from(String(cookieNonce));
    const right = Buffer.from(String(state.nonce));
    if (!cookieNonce || left.length !== right.length || !timingSafeEqual(left, right)) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "invalid_state"));
    }

    res.setHeader(
      "Set-Cookie",
      `${GOOGLE_OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google; Max-Age=0`
    );

    if (req.query?.error) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "google_cancelled"));
    }

    const runtime = await getGoogleConnectRuntime(
      (query, params = []) => pool.query(query, params),
      state.companyId
    );
    if (!runtime.ready || String(runtime.connection?.id) !== String(state.integrationId)) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "sso_not_connected"));
    }

    const { clientId, clientSecret, redirectUri, allowedDomain } = runtime.config;
    const code = String(req.query?.code || "");
    if (!code) return res.redirect(googleOAuthErrorRedirect(returnTo, "missing_code"));

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "token_exchange_failed"));
    }
    const tokens = await tokenResponse.json();
    if (!tokens?.access_token) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "token_exchange_failed"));
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "profile_lookup_failed"));
    }
    const profile = await profileResponse.json();
    const email = String(profile?.email || "").trim().toLowerCase();
    if (!email || profile?.email_verified !== true) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "email_not_verified"));
    }
    if (email !== String(state.loginEmail).trim().toLowerCase()) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "account_not_linked"));
    }
    if (allowedDomain && email.split("@")[1] !== allowedDomain) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "account_not_linked"));
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.company_id,
        u.store_id,
        u.role_id,
        u.active,
        u.must_change_password,
        r.name AS role_name,
        COALESCE(r.default_landing_page, 'dashboard') AS default_landing_page
      FROM users u
      LEFT JOIN roles r ON r.id=u.role_id
      WHERE LOWER(BTRIM(u.email))=$1 AND u.company_id=$2
      LIMIT 1
      `,
      [email, state.companyId]
    );
    if (!result.rows.length) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "account_not_linked"));
    }

    const user = result.rows[0];
    if (user.active !== true) {
      return res.redirect(googleOAuthErrorRedirect(returnTo, "account_disabled"));
    }

    const googleDb = (query, params = []) => pool.query(query, params);
    const googleIp = clientIp(req);
    const googleAgent = req.get("user-agent") || null;
    const googleSettings = await loadSecuritySettings(googleDb, user.company_id);
    const googleAccess = await accessDecision(googleDb, {
      companyId: user.company_id,
      userId: user.id,
      roleId: user.role_id,
      ip: googleIp,
    });
    if (!googleAccess.allowed) {
      await writeLoginHistory(googleDb, { user, identifier: email, status: "BLOCKED", reason: googleAccess.code, ip: googleIp, userAgent: googleAgent, authMethod: "GOOGLE", req });
      return res.redirect(googleOAuthErrorRedirect(returnTo, String(googleAccess.code || "security_policy_blocked").toLowerCase()));
    }
    await clearFailedLogin(googleDb, user);
    await pool.query("UPDATE users SET last_login_at=NOW() WHERE id=$1", [user.id]);
    const googleAssurancePolicy = await loadEffectiveAssurance(googleDb, { companyId: user.company_id, userId: user.id, roleId: user.role_id });
    const googleBaseAssurance = googleAssurancePolicy.effective.trustSsoMfa ? "HIGH" : googleAssurancePolicy.effective.ssoAssurance;
    const googleActivationSatisfied = !googleAssurancePolicy.effective.deviceActivationRequired
      || googleBaseAssurance === "HIGH"
      || (googleAssurancePolicy.effective.skipDeviceActivationOnTrustedNetwork && googleAccess.trustedNetwork === true);
    const googleNeedsOneEngineMfa = googleAssurancePolicy.effective.mfaRequired && !googleAssurancePolicy.effective.trustSsoMfa
      || googleAssurancePolicy.effective.phishingResistantRequired
      || !assuranceSatisfies(googleBaseAssurance, googleAssurancePolicy.effective.requiredLoginAssurance)
      || !googleActivationSatisfied;
    if (googleNeedsOneEngineMfa) {
      const methods = await listMfaMethods(googleDb, { companyId: user.company_id, userId: user.id });
      const usable = sortMfaMethods(methods
        .filter((method) => mfaMethodAllowed(method, googleAssurancePolicy.effective))
        .filter((method) => !googleAssurancePolicy.effective.phishingResistantRequired || method.phishing_resistant === true));
      const challenge = await createPendingChallenge(googleDb, {
        companyId: user.company_id,
        userId: user.id,
        type: "LOGIN",
        context: { authMethod: "GOOGLE", phishingResistantRequired: googleAssurancePolicy.effective.phishingResistantRequired === true, activationOnly: !googleActivationSatisfied && !googleAssurancePolicy.effective.mfaRequired, deviceActivationPending: !googleActivationSatisfied },
        minutes: 10,
      });
      const target = new URL(returnTo);
      target.hash = `google_mfa_challenge=${encodeURIComponent(challenge.id)}&google_mfa_enroll=${usable.length ? "0" : "1"}&google_mfa_phishing_resistant=${googleAssurancePolicy.effective.phishingResistantRequired ? "1" : "0"}`;
      return res.redirect(target.toString());
    }
    const sessionId = await createTrackedSession(googleDb, { user, ip: googleIp, userAgent: googleAgent, authMethod: "GOOGLE", settings: googleSettings, originHost: String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim().toLowerCase() || null });
    await googleDb("UPDATE identity_sessions SET assurance_level=$2,assurance_verified_at=NOW(),mfa_method=$3 WHERE id=$1", [sessionId, googleBaseAssurance, googleBaseAssurance === "HIGH" ? "SSO_MFA" : null]);
    user.session_id = sessionId;
    const token = createToken(user);
    await writeLoginHistory(googleDb, { user, identifier: email, status: "SUCCESS", ip: googleIp, userAgent: googleAgent, authMethod: "GOOGLE", sessionId, req });

    const target = new URL(returnTo);
    target.hash = `google_token=${encodeURIComponent(token)}`;
    return res.redirect(target.toString());
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return res.redirect(googleOAuthErrorRedirect(returnTo, "google_login_failed"));
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const loginStartedAt = Date.now();
  const loginTimings = {};
  const markLoginTiming = (name, startedAt) => { loginTimings[name] = Date.now() - startedAt; };
  try {
    const email = String(req.body?.email || req.body?.username || "").trim();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: "LOGIN_INPUT_REQUIRED",
        message: "Email and password are required",
      });
    }

    if (!pool) {
      return res.status(503).json({
        success: false,
        code: "IDENTITY_DATABASE_UNAVAILABLE",
        message: "Identity database is not configured",
      });
    }

    const identitySql = `
      SELECT
        u.id,
        u.username,
        u.password_hash,
        u.full_name,
        u.company_id,
        u.store_id,
        u.role_id,
        u.active,
        u.must_change_password,
        r.name AS role_name,
        COALESCE(r.default_landing_page, 'dashboard') AS default_landing_page,
        s.code AS store_code,
        s.name AS store_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN stores s ON s.id = u.store_id AND s.company_id = u.company_id AND s.active = true
      WHERE LOWER(BTRIM(u.email)) = LOWER(BTRIM($1))
         OR (u.email IS NULL AND LOWER(u.username) = LOWER(BTRIM($1)))
      LIMIT 1
    `;

    /*
     * Global platform profiles live in the central identity database with no
     * tenant company binding. Tenant/domain resolution must never shadow those
     * global accounts with a tenant-local user row.
     */
    const identityStartedAt = Date.now();
    const requestTenantPool = req.tenantPool || tenantPoolManager.getPoolForRequest(req) || pool;
    const centralIdentityPromise = pool.query(identitySql, [email]);
    const tenantIdentityPromise = requestTenantPool === pool
      ? centralIdentityPromise
      : requestTenantPool.query(identitySql, [email]);

    const [centralIdentity, tenantIdentity] = await Promise.all([
      centralIdentityPromise,
      tenantIdentityPromise,
    ]);
    markLoginTiming("identity_bundle_ms", identityStartedAt);
    const centralUser = centralIdentity.rows[0] || null;
    const isPlatformIdentity = Boolean(centralUser && centralUser.company_id == null);

    const loginPool = isPlatformIdentity ? pool : requestTenantPool;
    const result = isPlatformIdentity || loginPool === pool ? centralIdentity : tenantIdentity;
    loginTimings.central_identity_ms = loginTimings.identity_bundle_ms;
    loginTimings.tenant_identity_ms = loginPool === pool ? 0 : loginTimings.identity_bundle_ms;

    if (!result.rows.length) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "Invalid username or password",
      });
    }

    const user = result.rows[0];
    const loginDb = (sql, params = []) => loginPool.query(sql, params);
    const requestIp = clientIp(req);
    const requestUserAgent = req.get("user-agent") || null;
    let bcryptDurationMs = 0;
    const passwordCheckPromise = (async () => {
      const bcryptStartedAt = Date.now();
      const valid = await bcrypt.compare(password, user.password_hash);
      bcryptDurationMs = Date.now() - bcryptStartedAt;
      return valid;
    })();
    const preflightStartedAt = Date.now();
    const securityContext = user.company_id
      ? await loadLoginSecurityContext(loginDb, { companyId: user.company_id, userId: user.id, roleId: user.role_id })
      : { settings: null, state: null, policy: null, companyTimezone: null, googlePackage: null, googleConnection: null };
    const googleRuntime = user.company_id
      ? await resolveGoogleConnectPasswordLoginRuntime(
          (query, params = []) => loginPool.query(query, params),
          user.company_id,
          securityContext.googlePackage,
          securityContext.googleConnection
        )
      : null;
    const securitySettings = securityContext.settings;
    const state = securityContext.state;
    const accessPolicy = securityContext.policy;
    const companyTimezone = securityContext.companyTimezone;
    markLoginTiming("security_preflight_ms", preflightStartedAt);
    if (state?.locked_indefinitely === true || (state?.locked_until && new Date(state.locked_until).getTime() > Date.now())) {
      await writeLoginHistory(loginDb, { user, identifier: email, status: "BLOCKED", reason: "ACCOUNT_LOCKED", ip: requestIp, userAgent: requestUserAgent, req });
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_LOCKED",
        message: "User account is temporarily locked due to invalid login attempts",
        lockedUntil: state.locked_until,
      });
    }

    if (!user.active) {
      return res.status(403).json({
        success: false,
        code: "USER_DISABLED",
        message: "User account is disabled",
      });
    }

    if (googleRuntime?.ready && googleRuntime.config?.allowPasswordLogin === false) {
      return res.status(403).json({
        success: false,
        code: "GOOGLE_SSO_REQUIRED",
        message: "This company requires Google SSO. Use Continue with Google.",
      });
    }

    const validPassword = await passwordCheckPromise;
    loginTimings.bcrypt_ms = bcryptDurationMs;

    if (validPassword) {
      try {
        const currentRounds = bcrypt.getRounds(user.password_hash);
        if (currentRounds !== PASSWORD_BCRYPT_ROUNDS) {
          const previousHash = user.password_hash;
          const userId = user.id;
          const passwordForRehash = password;
          setImmediate(() => {
            void (async () => {
              try {
                const replacementHash = await bcrypt.hash(passwordForRehash, PASSWORD_BCRYPT_ROUNDS);
                await loginPool.query(
                  "UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 AND password_hash=$3",
                  [replacementHash, userId, previousHash]
                );
                console.log(`onePOS: calibrated password hash cost for user ${userId} from ${currentRounds} to ${PASSWORD_BCRYPT_ROUNDS}`);
              } catch (rehashError) {
                console.warn("onePOS: password hash calibration failed", rehashError?.message || rehashError);
              }
            })();
          });
        }
      } catch (roundError) {
        console.warn("onePOS: password hash cost inspection skipped", roundError?.message || roundError);
      }
    }

    if (!validPassword) {
      const nextState = await registerFailedLogin(loginDb, { user, settings: securitySettings });
      await writeLoginHistory(loginDb, { user, identifier: email, status: "FAILURE", reason: "INVALID_PASSWORD", ip: requestIp, userAgent: requestUserAgent, req });
      const locked = nextState?.locked_indefinitely === true || (nextState?.locked_until && new Date(nextState.locked_until).getTime() > Date.now());
      return res.status(locked ? 403 : 401).json({
        success: false,
        code: locked ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
        message: locked ? "User account is temporarily locked due to invalid login attempts" : "Invalid username or password",
        ...(locked ? { lockedUntil: nextState.locked_until } : {}),
      });
    }

    const loginPermissionUser = {
      id: user.id,
      companyId: user.company_id || null,
    };
    const authorizationStartedAt = Date.now();
    const [access, rolePermissionResult, permissionSets, assurancePolicy, trustedDevice] = await Promise.all([
      accessDecision(loginDb, {
        companyId: user.company_id,
        userId: user.id,
        roleId: user.role_id,
        ip: requestIp,
        settingsOverride: securitySettings,
        policyOverride: accessPolicy,
        companyTimezoneOverride: companyTimezone,
      }),
      user.role_id
        ? loginPool.query(
            `SELECT p.code
               FROM role_permissions rp
               JOIN permissions p ON p.id=rp.permission_id
              WHERE rp.role_id=$1`,
            [user.role_id]
          )
        : Promise.resolve({ rows: [] }),
      loadEffectivePermissionSets(loginDb, loginPermissionUser),
      user.company_id
        ? loadEffectiveAssurance(
            loginDb,
            { companyId: user.company_id, userId: user.id, roleId: user.role_id },
            { settings: securitySettings, policy: accessPolicy }
          )
        : Promise.resolve(null),
      user.company_id
        ? findTrustedDevice(loginDb, {
            companyId: user.company_id,
            userId: user.id,
            token: req.body?.deviceToken,
            ip: requestIp,
          })
        : Promise.resolve(null),
    ]);
    loginTimings.authorization_bundle_ms = Date.now() - authorizationStartedAt;
    loginTimings.permissions_ms = loginTimings.authorization_bundle_ms;

    if (!access.allowed) {
      await writeLoginHistory(loginDb, { user, identifier: email, status: "BLOCKED", reason: access.code, ip: requestIp, userAgent: requestUserAgent, req });
      return res.status(403).json({ success: false, code: access.code, message: access.reason });
    }

    const effectivePermissions = [...new Set([
      ...rolePermissionResult.rows.map((row) => row.code),
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])];

    let passwordExpired = false;
    if (securitySettings && Number(securitySettings.password_expiry_days || 0) > 0) {
      const changedAt = state?.password_changed_at;
      if (!changedAt || Date.now() - new Date(changedAt).getTime() >= Number(securitySettings.password_expiry_days) * 86400000) {
        passwordExpired = true;
        await loginDb("UPDATE users SET must_change_password=TRUE WHERE id=$1", [user.id]);
        user.must_change_password = true;
      }
    }

    // Login always keeps the authenticated company binding. OneDeveloper
    // selects a target company separately, and only through oneengine.manage.
    const actingCompanyId = null;

    const effectiveAssurance = assurancePolicy?.effective || { mfaRequired: false, phishingResistantRequired: false, requiredLoginAssurance: "STANDARD", passwordAssurance: "STANDARD" };
    const activationSatisfied = !effectiveAssurance.deviceActivationRequired
      || Boolean(trustedDevice)
      || (effectiveAssurance.skipDeviceActivationOnTrustedNetwork && access.trustedNetwork === true);
    const requiresSecondFactor = effectiveAssurance.mfaRequired
      || effectiveAssurance.phishingResistantRequired
      || !assuranceSatisfies(effectiveAssurance.passwordAssurance, effectiveAssurance.requiredLoginAssurance)
      || !activationSatisfied;
    if (requiresSecondFactor) {
      const methods = await listMfaMethods(loginDb, { companyId: user.company_id, userId: user.id });
      const usable = sortMfaMethods(methods
        .filter((method) => mfaMethodAllowed(method, effectiveAssurance))
        .filter((method) => !effectiveAssurance.phishingResistantRequired || method.phishing_resistant === true));
      const challenge = await createPendingChallenge(loginDb, {
        companyId: user.company_id,
        userId: user.id,
        type: "LOGIN",
        context: { authMethod: "PASSWORD", phishingResistantRequired: effectiveAssurance.phishingResistantRequired === true, activationOnly: !activationSatisfied && !effectiveAssurance.mfaRequired, deviceActivationPending: !activationSatisfied },
        minutes: 10,
      });
      return res.status(202).json({
        success: true,
        mfaRequired: true,
        challengeId: challenge.id,
        enrollmentRequired: usable.length === 0,
        phishingResistantRequired: effectiveAssurance.phishingResistantRequired === true,
        availableMethods: usable.map((method) => ({
          id: method.id,
          type: method.method_type,
          label: method.label || method.method_type,
          phishingResistant: method.phishing_resistant === true,
        })),
        user: { id: user.id, name: user.full_name, username: user.username, companyId: user.company_id },
      });
    }

    const finalizationStartedAt = Date.now();
    const sessionId = await finalizeSuccessfulLogin(loginDb, {
      user,
      identifier: email,
      ip: requestIp,
      userAgent: requestUserAgent,
      authMethod: "PASSWORD",
      settings: securitySettings,
      originHost: String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim().toLowerCase() || null,
      assuranceLevel: effectiveAssurance.passwordAssurance,
      reason: passwordExpired ? "PASSWORD_EXPIRED" : null,
      req,
    });
    user.session_id = sessionId;
    const token = createToken(user);
    markLoginTiming("finalization_ms", finalizationStartedAt);
    loginTimings.total_ms = Date.now() - loginStartedAt;
    console.log("onePOS: auth login timings", {
      ...loginTimings,
      company_bound: Boolean(user.company_id),
    });

    res.setHeader("Server-Timing", [
      `identity;dur=${loginTimings.central_identity_ms || 0}`,
      `tenant_identity;dur=${loginTimings.tenant_identity_ms || 0}`,
      `bcrypt;dur=${loginTimings.bcrypt_ms || 0}`,
      `last_login;dur=${loginTimings.last_login_update_ms || 0}`,
      `acting_company;dur=${loginTimings.acting_company_lookup_ms || 0}`,
      `permissions;dur=${loginTimings.permissions_ms || 0}`,
      `total;dur=${loginTimings.total_ms || 0}`,
    ].join(", "));

    res.json({
      success: true,
      token,
      actingCompanyId,
      permissions: {
        permissions: effectivePermissions,
      },
      stores: user.store_id ? [{
        id: user.store_id,
        code: user.store_code || null,
        name: user.store_name || null,
        active: true,
        is_primary: true,
        companyId: user.company_id || null,
      }] : [],
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name,
        role: user.role_name,
        defaultLandingPage: user.default_landing_page || 'dashboard',
        companyId: user.company_id,
        storeId: user.store_id,
        mustChangePassword: user.must_change_password === true,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| LOCK SCREEN PIN VERIFY
|--------------------------------------------------------------------------
| Existing authenticated session remains the authority. This endpoint only
| verifies the current user's PIN hash so the client can unlock a locally
| locked session without asking for the password again.
*/
app.post("/api/auth/unlock-pin", authenticate, async (req, res) => {
  try {
    const pin = String(req.body?.pin || "").trim();
    if (!/^\d{4,12}$/.test(pin)) {
      return res.status(400).json({ success: false, message: "Enter a valid PIN" });
    }

    const result = await db(
      "SELECT pin_hash, active, role_id, company_id FROM users WHERE id=$1 AND company_id IS NOT DISTINCT FROM $2 LIMIT 1",
      [req.user.id, req.user.companyId]
    );
    const user = result.rows[0];
    if (!user || user.active !== true) {
      return res.status(403).json({ success: false, message: "User account is disabled" });
    }

    /*
     * Bootstrap only for a global profile holding oneengine.manage. This is an
     * RBAC check, not an identity/profile-name bypass.
     */
    if (!user.pin_hash && user.company_id == null && process.env.SUPERADMIN_BOOTSTRAP_PIN) {
      const platformAccess = user.role_id
        ? await db(
            "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='oneengine.manage' LIMIT 1",
            [user.role_id]
          )
        : { rows: [] };
      if (platformAccess.rows.length) {
        if (pin !== String(process.env.SUPERADMIN_BOOTSTRAP_PIN)) {
          return res.status(401).json({ success: false, code: "INVALID_PIN", message: "Incorrect PIN" });
        }
        const pinHash = await bcrypt.hash(pin, PASSWORD_BCRYPT_ROUNDS);
        await db(
          "UPDATE users SET pin_hash=$1, updated_at=NOW() WHERE id=$2 AND company_id IS NOT DISTINCT FROM $3",
          [pinHash, req.user.id, req.user.companyId]
        );
        return res.json({ success: true, initialized: true });
      }
    }

    if (!user.pin_hash) {
      return res.status(409).json({ success: false, code: "PIN_NOT_SET", message: "No PIN is configured for this user" });
    }

    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Incorrect PIN" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("PIN unlock error:", error);
    res.status(500).json({ success: false, message: "Unable to verify PIN" });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const result = await db(
      `
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.company_id,
        u.store_id,
        u.must_change_password,
        r.name AS role_name,
        COALESCE(r.default_landing_page, 'dashboard') AS default_landing_page
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
      `,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name,
        role: user.role_name,
        defaultLandingPage: user.default_landing_page || 'dashboard',
        companyId: user.company_id,
        storeId: user.store_id,
        mustChangePassword: user.must_change_password === true,
      },
    });
  } catch (error) {
    console.error("Current user error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve user",
    });
  }
});

app.get("/api/auth/bootstrap", authenticate, async (req, res) => {
  try {
    const [result, rolePermissions, permissionSets] = await Promise.all([
      db(
        `
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.company_id,
          u.store_id,
          u.must_change_password,
          r.name AS role_name,
          COALESCE(r.default_landing_page, 'dashboard') AS default_landing_page,
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', s.id,
                  'code', s.code,
                  'name', s.name,
                  'active', s.active,
                  'is_primary', true
                )
                ORDER BY s.name
              )
              FROM stores s
              WHERE s.id=u.store_id
                AND s.company_id=u.company_id
                AND s.active=true
            ),
            '[]'::jsonb
          ) AS stores
        FROM users u
        LEFT JOIN roles r ON r.id=u.role_id
        WHERE u.id=$1
        LIMIT 1
        `,
        [req.user.id]
      ),
      req.user.roleId ? getRolePermissionCodes(req.user.roleId, req) : Promise.resolve([]),
      loadEffectivePermissionSets(db, req.user, req),
    ]);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];
    let permissions = rolePermissions;
    permissions = [...new Set([
      ...permissions,
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])];

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name,
        role: user.role_name,
        defaultLandingPage: user.default_landing_page || "dashboard",
        companyId: user.company_id,
        storeId: user.store_id,
        mustChangePassword: user.must_change_password === true,
      },
      stores: Array.isArray(user.stores) ? user.stores : [],
      permissions: { permissions },
    });
  } catch (error) {
    console.error("Session bootstrap error:", error);
    res.status(500).json({ success: false, message: "Unable to prepare session context" });
  }
});

/*
|--------------------------------------------------------------------------
| CURRENT SESSION PERMISSIONS (sidebar/UI gating)
|--------------------------------------------------------------------------
|
| GET /api/auth/me/permissions
|
| Read-only convenience for UI gating — reports the SAME permission model
| the server-side `authorize()` helper enforces. Runtime access is derived
| from role/profile permissions and permission sets. It never grants
| anything on its own; every endpoint keeps enforcing its own checks.
| (T10B-SMALL: the frontend AdminLayout calls this to show/hide gated
| sidebar entries such as Reports, Returns, Order Prep and Integrations.)
*/

app.get("/api/auth/me/stores", authenticate, async (req, res) => {
  try {
    if (!req.user?.companyId) {
      return res.json({ success: true, data: [] });
    }

    const result = await db(
      `SELECT s.id,s.code,s.name,s.active,TRUE AS is_primary
         FROM users u
         JOIN stores s ON s.id=u.store_id AND s.company_id=u.company_id
        WHERE u.id=$2
          AND u.company_id=$1
          AND s.active=true
        ORDER BY s.name`,
      [req.user.companyId, req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Current user stores error:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve store access" });
  }
});

app.get("/api/auth/me/permissions", authenticate, async (req, res) => {
  try {
    let permissions = req.user.roleId ? await getRolePermissionCodes(req.user.roleId, req) : [];
    const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
    permissions = [...new Set([...permissions, ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : [])])];

    const includeEntitlements = !["0", "false", "no"].includes(String(req.query?.includeEntitlements || "").toLowerCase());
    res.json({
      success: true,
      data: {
        permissions,
        ...(includeEntitlements ? { entitlements: await getCompanyEntitlements(db, req.user.companyId) } : {}),
      },
    });
  } catch (error) {
    console.error("Current user permissions error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve permissions",
    });
  }
});

/*
|--------------------------------------------------------------------------
| CURRENT USER UI PREFERENCES (onePOS Admin presentation)
|--------------------------------------------------------------------------
|
| GET  /api/auth/me/preferences  — the caller's own presentation preferences
| PUT  /api/auth/me/preferences  — update them
|
| Per-USER (not per-company) storage of layout preset / appearance / accent
| choices, so each user picks their own admin presentation without changing
| anybody else's interface. Pure presentation: no permissions are encoded or
| checked here beyond authentication, and a user can only ever touch their
| own row. A 500 is returned when the database is unreachable — the client
| falls back to its localStorage mirror in that case.
*/

const USER_PREF_FIELDS = Object.freeze({
  preset: ["modern", "enterprise", "compact"],
  appearance: ["light", "dark", "system"],
  accent: ["teal", "blue", "purple", "green", "orange", "red"],
  sidebarCollapsed: "boolean",
});

function normalizeUserPreferences(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const preferences = {};
  for (const [field, allowed] of Object.entries(USER_PREF_FIELDS)) {
    if (allowed === "boolean") {
      preferences[field] = source[field] === true;
      continue;
    }
    preferences[field] = allowed.includes(source[field]) ? source[field] : allowed[0];
  }
  return preferences;
}

app.get("/api/auth/me/preferences", authenticate, async (req, res) => {
  try {
    if (!pool) return res.json({ success: true, data: normalizeUserPreferences(null) });
    const result = await db(
      "SELECT preferences FROM user_preferences WHERE user_id=$1",
      [req.user.id]
    );
    res.json({
      success: true,
      data: normalizeUserPreferences(result.rows[0]?.preferences),
    });
  } catch (error) {
    console.error("Current user preferences error:", error);
    res.status(500).json({ success: false, message: "Unable to retrieve preferences" });
  }
});

app.put("/api/auth/me/preferences", authenticate, async (req, res) => {
  try {
    const preferences = normalizeUserPreferences(req.body);
    if (!pool) return res.json({ success: true, data: preferences });
    const result = await db(
      `
      INSERT INTO user_preferences (user_id, preferences, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        preferences = EXCLUDED.preferences,
        updated_at = NOW()
      RETURNING preferences
      `,
      [req.user.id, JSON.stringify(preferences)]
    );
    res.json({
      success: true,
      data: normalizeUserPreferences(result.rows[0]?.preferences),
    });
  } catch (error) {
    console.error("Save user preferences error:", error);
    res.status(500).json({ success: false, message: "Unable to save preferences" });
  }
});

/*
|--------------------------------------------------------------------------
| CHANGE PASSWORD
|--------------------------------------------------------------------------
*/

app.post("/api/auth/change-password", authenticate, createChangePasswordHandler({ db, bcrypt }));

/*
|--------------------------------------------------------------------------
| CUSTOMER DATA FOUNDATION
|--------------------------------------------------------------------------
*/

app.use(
  "/api",
  createCustomersRouter({
    authenticate,
    authorize,
    db,
    pool,
    canViewCompanyCustomers,
    hasCompanyAdminAccess,
    associateCustomerWithStore,
    savePlatformRecord: saveDomainConfiguration,
    requireLoyaltyEntitlement: requireEntitlement(db, "loyalty"),
  })
);

/*

/*
|--------------------------------------------------------------------------
| DASHBOARD SUMMARY
|--------------------------------------------------------------------------
*/

app.use("/api", createEanLookupRouter({ authenticate, db, lookupService: globalProductLookupService }));

/* T10D: Self-Checkout session routes (enter/exit the restricted mode). */
app.use("/api", createSelfCheckoutRouter({
  authenticate,
  authorize,
  db,
  bcrypt,
  writeAudit,
  requireSelfCheckoutEntitlement: requireEntitlement(db, "self_checkout"),
  getCompanyEntitlements: (companyId) => getCompanyEntitlements(db, companyId),
}));

/* T10P: Scan & Go — customer scan sessions (token-authenticated, store/company
 * resolved server-side from the session; see routes/scanAndGo.js). */
app.use("/api", createScanGoRouter({ authenticate, db, pool, writeAudit }));
app.use("/api", createMobileScannerRouter({ authenticate, authorize, db, writeAudit }));

app.use("/api", createGlobalProductLookupRouter({
  authenticate,
  authorize,
  db,
  writeAudit,
  lookupService: globalProductLookupService,
  connectorDrivers,
}));

app.use("/api", createDashboardRouter({ authenticate, authorize, db }));
app.use("/api", createDashboardBuilderRouter({ authenticate, authorize, db, canViewCompanyCustomers, canAccessStore, writeAudit, hasPermission }));

/*
 * JARVIS AI assistant (V1) - POST /api/jarvis, GET /api/jarvis/status.
 * Authenticated with the existing session middleware; the caller's company,
 * store, role and permission codes come from the verified session claims and
 * the existing role_permissions lookup (read-only).
 */
app.use(
  "/api",
  createJarvisRouter({
    authenticate,
    jarvis,
    getRolePermissionCodes,
    jarvesAccess,
    entitlementAccess: (companyId) => getCompanyEntitlements(db, companyId),
  })
);
app.use("/api", createSuperadminRouter({ authenticate, db, pool, tenantDatabaseRouter, env: process.env, hasPermission }));
app.use("/api", createPlatformRouter({ authenticate, authorize, db, pool, canViewCompanyCustomers, hasPermission }));
app.use("/api", createDebugCodesRouter({ authenticate, authorize, db }));
app.use("/api", createPlatformDeploymentsRouter({ authenticate, authorize, db, writeAudit }));
app.use("/api", createPlatformSecurityRouter({ authenticate, authorize, db }));
app.use("/api", createIdentitySecurityRouter({ authenticate, authorize, db, writeAudit }));
app.use("/api", createIdentityAssuranceRouter({ authenticate, authorize, db, createToken, encryptCredentials, decryptCredentials, writeAudit }));
app.use("/api", createIdentityProviderLoginRouter({ db, createToken, decryptCredentials, encryptCredentials }));
app.use("/api", createSecurityGovernanceRouter({ authenticate, authorize, db, writeAudit }));
app.use("/api", createDataProtectionRouter({ authenticate, authorize, db, writeAudit }));
app.use("/api", createHospitalityRouter({ authenticate, authorize, db, pool, canAccessStore }));
app.use("/api", createClientWebShopRouter({
  authenticate,
  authorize,
  db,
  pool,
  createInventoryMovement,
  getCompanyEntitlements: (companyId) => getCompanyEntitlements(db, companyId),
}));
app.use("/api", createOwnDeliveryRouter({
  authenticate,
  authorize,
  db,
  pool,
  canAccessStore,
  createInventoryMovement,
  writeAudit,
}));
app.use("/api", createPackagesRouter({ authenticate, authorize, db, pool, writeAudit }));
app.use("/api", createAdvancedPlatformRouter({ authenticate, authorize, db }));
app.use("/api", createConnectorsRouter({ authenticate, authorize, db, writeAudit, drivers: connectorDrivers }));
app.use("/api", createPaypalQrRouter({ authenticate, authorize, db, connectorDrivers, writeAudit }));
app.use("/api", createGoogleConnectRouter({ authenticate, authorize, db }));
app.use("/api", createPlatformFilesRouter({ authenticate, db }));
app.use("/api", createPlatformSequencesRouter({ authenticate, authorize, db, pool }));
app.use("/api", createPlatformSchedulesRouter({ authenticate, authorize, db }));
app.use("/api", createPlatformEventsRouter({
  authenticate,
  authorize,
  db,
  encryptSecret: (value) => encryptSecret(value),
  authenticateInbound: async ({ endpoint, rawBody, headers }) => {
    if (!endpoint.credential_id || !endpoint.connector_id || !endpoint.company_id) return false;
    const result = await db(
      `SELECT ciphertext FROM platform_credentials
       WHERE id=$1 AND company_id=$2 AND connector_id=$3 AND active=TRUE`,
      [endpoint.credential_id, endpoint.company_id, endpoint.connector_id]
    );
    const encrypted = result.rows[0]?.ciphertext;
    if (!encrypted) return false;
    const credentials = decryptCredentials(encrypted);
    const supplied = (name) => headers[String(name).toLowerCase()];
    const secureEqual = (left, right) => {
      const a = Buffer.from(String(left || ""));
      const b = Buffer.from(String(right || ""));
      return a.length === b.length && timingSafeEqual(a, b);
    };
    const authType = String(endpoint.auth_type || "").toLowerCase();
    if (authType === "bearer") {
      const token = credentials.token || credentials.bearerToken || credentials.bearer_token;
      return Boolean(token && secureEqual(supplied("authorization"), `Bearer ${token}`));
    }
    if (authType === "api_key") {
      const key = credentials.apiKey || credentials.api_key || credentials.key;
      const headerName = credentials.headerName || credentials.header_name || "x-api-key";
      return Boolean(key && secureEqual(supplied(headerName), key));
    }
    if (authType === "basic") {
      if (credentials.username === undefined || credentials.password === undefined) return false;
      const expected = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
      return secureEqual(supplied("authorization"), expected);
    }
    if (authType === "hmac_sha256") {
      const secret = credentials.webhookSecret || credentials.webhook_secret || credentials.secret;
      return Boolean(secret && verifyWebhookSignature({
        secret,
        timestamp: supplied("x-onepos-timestamp"),
        signature: supplied("x-onepos-signature"),
        body: rawBody.toString("utf8"),
      }));
    }
    return false;
  },
}));
app.use("/api", createAccountLifecycleRouter({ authenticate, authorize, db, writeAudit }));

app.use("/api", createSettingsRouter({
  authenticate,
  authorize,
  db,
  pool,
  writeAudit,
  testPaymentTerminal,
  requireLoyaltyEntitlement: (req, res, next) => {
    const keys = ["loyaltyEnabled", "loyaltyEarningRate", "loyaltyMinSaleTotal", "loyaltyRedeemValuePerPoint", "loyaltyMinPointsRedeem"];
    if (!keys.some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key))) return next();
    return requireEntitlement(db, "loyalty")(req, res, next);
  },
}));
app.use("/api", createCustomerAuthRouter); /* routes/customerAuth.js exports a router instance (self-contained) */
app.use("/api", createWhatsAppSettingsRouter({ authenticate, authorize, db, pool, writeAudit }));
app.use("/api", createOneAssistantRouter({ pool, authenticate, authorize }));
app.use("/api", createSmsGateWebhookRouter({ pool }));
app.use("/api", createInvoiceDeliveryRouter({ authenticate, authorize, db, pool, writeAudit }));

/*
|--------------------------------------------------------------------------
| CATEGORIES & PRODUCTS
|--------------------------------------------------------------------------
|
| Product and category routes are registered via routes/products.js,
| receiving the existing authenticate, authorize, db, pool and
| createInventoryMovement functions so behaviour is unchanged.
|
| Route ordering preserved:
|   GET  /api/categories            (product.view)
|   POST /api/categories            (product.create)
|   PUT  /api/categories/:id        (product.edit)
|   DEL  /api/categories/:id        (product.delete)
|   GET  /api/products              (product.view)
|   GET  /api/products/:id          (product.view)
|   POST /api/products              (product.create)
|   PUT  /api/products/:id          (product.edit)
|   DEL  /api/products/:id          (product.delete)
*/
app.use(
  "/api",
  createProductsRouter({
    authenticate,
    authorize,
    db,
    pool,
    createInventoryMovement,
    writeAudit,
    canAccessStore,
    savePlatformRecord: saveDomainConfiguration,
  })
);
app.use(
  "/api",
  createProductFeaturesRouter({
    authenticate,
    authorize,
    db,
    pool,
  })
);
app.use(
  "/api",
  createPricingRouter({ authenticate, authorize, db, pool })
);

/*
|--------------------------------------------------------------------------
| INVENTORY - MOVEMENTS / ADJUSTMENTS / RECONCILIATION
|--------------------------------------------------------------------------
|
| Inventory routes are registered via routes/inventory.js, receiving the
| existing authenticate, authorize, db, pool, createInventoryMovement
| and inventoryMovementTypes so behaviour is unchanged.
|
| Route ordering preserved:
|   GET  /api/inventory/movements       (inventory.view)
|   POST /api/inventory/adjustments     (inventory.adjust)
|   GET  /api/inventory/reconciliation  (inventory.view)
*/
app.use(
  "/api",
  createInventoryRouter({
    authenticate,
    authorize,
    db,
    pool,
    createInventoryMovement,
    inventoryMovementTypes,
    canAccessStore,
    canViewCompanyCustomers,
  })
);

/*
 * BATCH / EXPIRY TRACKING — store-level batch API (same access model,
 * same movement primitive; batches never bypass the authoritative stock).
 */
app.use(
  "/api",
  createInventoryBatchesRouter({
    authenticate,
    authorize,
    db,
    pool,
    canAccessStore,
  })
);

/* T10H: read-only replenishment suggestions (planning layer, no writes). */
app.use("/api", createReplenishmentRouter({ authenticate, authorize, db }));

/*
|--------------------------------------------------------------------------
| SUPPLIERS
|--------------------------------------------------------------------------
|
| Supplier routes are registered via routes/suppliers.js, receiving the
| existing authenticate, authorize and db functions so behaviour is
| unchanged.
|
| Route ordering preserved:
|   GET  /api/suppliers              (inventory.view)
|   GET  /api/suppliers/:id          (inventory.view)
|   POST /api/suppliers              (inventory.adjust)
|   PUT  /api/suppliers/:id          (inventory.adjust)
|   PATCH /api/suppliers/:id/status  (inventory.adjust)
*/

app.use(
  "/api",
  createSuppliersRouter({
    authenticate,
    authorize,
    db,
    pool,
    savePlatformRecord: saveDomainConfiguration,
  })
);

/*
|--------------------------------------------------------------------------
| PURCHASES / GOODS RECEIVED
|--------------------------------------------------------------------------
|
| Purchase and receive routes are registered via routes/purchases.js,
| receiving the existing authenticate, authorize, db, pool and
| createInventoryMovement functions so behaviour is unchanged.
|
| Route ordering preserved:
|   GET  /api/purchases              (inventory.view)
|   GET  /api/purchases/:id          (inventory.view)
|   POST /api/purchases              (inventory.adjust)
|   POST /api/purchases/:id/receive  (inventory.adjust)
*/
app.use(
  "/api",
  createPurchasesRouter({
    authenticate,
    authorize,
    db,
    pool,
    createInventoryMovement,
    savePlatformRecord: saveDomainConfiguration,
  })
);
app.use(
  "/api",
  createSupplierAccountsRouter({ authenticate, authorize, db, pool })
);

app.use("/api", createSalesRouter({ authenticate, authorize, db, pool, requestPool: getRequestPool, createInventoryMovement, associateCustomerWithStore, writeAudit, getRolePermissionCodes, canViewCompanyCustomers, canonicalTransactionWriter: syncCanonicalSaleTransaction, selfCheckoutMode: (req) => req.user?.mode === "self_checkout", connectorDrivers, savePlatformRecord: saveDomainConfiguration }));
app.use("/api", createLayawaysRouter({ authenticate, authorize, db, pool, createInventoryMovement }));
app.use("/api", createKioskRouter({ authenticate, authorize, db, pool, writeAudit, connectorDrivers }));

app.use("/api", createReturnsRouter({ authenticate, authorize, db, pool, createInventoryMovement, writeAudit, canonicalTransactionWriter: createCanonicalRelatedTransaction }));

app.use("/api", createAdminRouter({ authenticate, authorize, db, pool, canViewCompanyCustomers, hasCompanyAdminAccess, hasPermission, bcrypt, savePlatformRecord: saveDomainConfiguration }));

/*
|--------------------------------------------------------------------------
| STAFF ATTENDANCE (CLOCK IN / CLOCK OUT)
|--------------------------------------------------------------------------
|
| Attendance sessions are recorded against the EXISTING users / companies /
| stores (no separate employee identity). Clock in/out times and worked
| duration are always set server-side (NOW() + timestamp arithmetic) — the
| client never supplies them. Management visibility is permission-driven;
| records are company-scoped and store-restricted through the canonical
| canViewCompanyCustomers / canAccessStore helpers.
*/
app.use(
  "/api",
  createAttendanceRouter({
    authenticate,
    db,
    canViewCompanyCustomers,
    canAccessStore,
    writeAudit,
  })
);

/* T10-AUDIT: central audit log (read-only) — see routes/audit.js. */
app.use(
  "/api",
  createAuditRouter({
    authenticate,
    authorize,
    db,
    canViewCompanyCustomers,
    canAccessStore,
  })
);

app.use("/api", createReportsRouter({ authenticate, authorize, db, canAccessStore, canViewCompanyCustomers, hasPermission }));

/*
|--------------------------------------------------------------------------
| SECURE INVOICE LINKS (T9P)
|--------------------------------------------------------------------------
|
| Public token-based invoice download at GET /i/:token (outside /api - the
| opaque token is the only credential; no IDs in the URL, hash-only token
| storage, generic 404s) plus admin create/revoke endpoints under
| /api/sales/:saleId/secure-links using the existing permission model.
*/
app.use(createSecureInvoiceRouter({ db, pool, authenticate, authorize, writeAudit }));

/*
| Online Orders (Uber Eats / Deliveroo foundation) - product platform
| configuration and online order lifecycle. Platform-specific logic stays
| isolated in services/onlineOrders/* (stubbed until real API credentials).
*/

app.use(
  "/api",
  createOnlineRouter({
    authenticate,
    authorize,
    db,
    pool,
    writeAudit,
    createInventoryMovement,
  })
);

/*
| T9A - generic integration foundation (provider-agnostic). Credentials are
| encrypted at rest; no Sales/Purchases data is sent anywhere by this module.
*/
app.use(
  "/api",
  createShopifyWebhooksRouter({ db, writeAudit })
);

app.use(
  "/api",
  createProviderOAuthRouter({
    authenticate,
    authorize,
    db,
    writeAudit,
  })
);

app.use(
  "/api",
  createIntegrationsRouter({
    authenticate,
    authorize,
    db,
    pool,
    writeAudit,
  })
);

/*
| T10V - accounting integration export: wires the T10W normalizers + T10X
| dispatcher to real sale data over the existing T9A connection system.
| All routes are accounting.export gated and company-scoped.
*/
app.use(
  "/api/accounting",
  createAccountingExportRouter({
    authenticate,
    authorize,
    db,
    writeAudit,
  })
);


/*
|--------------------------------------------------------------------------
| HELD SALES (SUSPENDED TRANSACTIONS) — hardened (routes/heldSales.js)
|--------------------------------------------------------------------------
|
| Atomic resume claim (POST /api/held-sales/:id/resume), optional
| store-wide listing (?scope=store), payload limits. Same authentication,
| sale.hold permission gate and company/store/user scoping as before.
*/
app.use("/api", createHeldSalesRouter({ authenticate, authorize, db }));

/*
|--------------------------------------------------------------------------
| TILL SESSIONS & CASH MANAGEMENT
|--------------------------------------------------------------------------
|
| A till session is opened per terminal (till) for a store. One open session
| is allowed per terminal. Sales created while a session is open are linked
| to the session's terminal; cash sales contribute to expected cash at close,
| card sales do not. Cash movements record manual cash-in / cash-out.
|
| Routes are registered via routes/till.js, receiving the existing
| authenticate, authorize, db, getRolePermissionCodes and
| canViewCompanyCustomers functions so behaviour is unchanged.
*/

app.use(
  "/api",
  createTillRouter({
    authenticate,
    authorize,
    db,
    pool,
    getRolePermissionCodes,
    canViewCompanyCustomers,
  })
);

/*
|--------------------------------------------------------------------------
| DATABASE SETUP
|--------------------------------------------------------------------------
|
| Safe to run repeatedly.
|--------------------------------------------------------------------------
*/

app.post("/api/setup/database", authenticate, authorize("oneengine.manage"), async (_req, res) => {
  try {
    if (!pool) return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    await initializeDatabase(pool, { bootstrapSuperadmin: false });
    return res.json({ success: true, message: "OneEngine database migrations are current" });
  } catch (error) {
    console.error("Database migration error:", error);
    return res.status(500).json({ success: false, message: "Database migration failed" });
  }
});

/*
 * Final API error boundary for async route failures. Local route handlers may
 * still return richer domain-specific errors; this catches only errors they
 * did not handle so clients receive a deterministic JSON response instead of
 * a hung request / browser "Failed to fetch".
 */
app.use(async (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
    ? error.status
    : 500;
  console.error("Unhandled API route error:", error);
  try {
    const payload = await buildDebugPayload(db, { error, status, req });
    return res.status(status).json(payload);
  } catch (debugError) {
    console.error("OneEngine Debug boundary failed:", debugError);
    const code = classifyDebugCode(error, status);
    const definition = builtinDebugCode(code) || builtinDebugCode("OEAE01");
    return res.status(status).json({
      success: false,
      code: definition.code,
      oeCode: definition.code,
      title: definition.title,
      message: definition.userMessage,
      retryable: definition.retryable === true,
    });
  }
});

/*
|--------------------------------------------------------------------------
| Frontend ownership
|--------------------------------------------------------------------------
| The operational UI is deployed separately from this API service. Keep a
| small redirect for legacy browser entry points so old bookmarks land on the
| active OneEngine frontend.
*/
const SMART_THEME_URL = String(process.env.SMART_THEME_URL || "https://onesolutions-ahuja.github.io/OneEngine").replace(/\/$/, "");

app.get(["/", "/login", "/app", "/app/*", "/customer-display"], (req, res) => {
  return res.redirect(302, SMART_THEME_URL);
});

/* Unknown API routes remain JSON; unknown browser routes go to the active frontend. */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, code: "OEAF01", oeCode: "OEAF01", message: "The requested service could not be found." });
  }
  return res.redirect(302, SMART_THEME_URL);
});

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

function platformBootstrapFingerprint() {
  const hash = createHash("sha256");
  for (const relativePath of [
    "./services/platformMetadata.js",
    "./services/internalAppCatalog.js",
    "./services/packageRegistry.js",
  ]) {
    hash.update(relativePath);
    hash.update(readFileSync(new URL(relativePath, import.meta.url)));
  }
  return hash.digest("hex");
}

async function platformBootstrapIsCurrent() {
  const fingerprint = platformBootstrapFingerprint();
  const result = await db(
    "SELECT state_value FROM onepos_runtime_state WHERE state_key='platform_bootstrap_fingerprint' LIMIT 1"
  );
  return { fingerprint, current: result.rows[0]?.state_value === fingerprint };
}

async function markPlatformBootstrapCurrent(fingerprint) {
  await db(
    `INSERT INTO onepos_runtime_state (state_key,state_value,updated_at)
     VALUES ('platform_bootstrap_fingerprint',$1,NOW())
     ON CONFLICT (state_key) DO UPDATE SET state_value=EXCLUDED.state_value,updated_at=NOW()`,
    [fingerprint]
  );
}

async function startServer() {
  if (startupRetryTimer) {
    clearTimeout(startupRetryTimer);
    startupRetryTimer = null;
  }
  startupAttempt += 1;
  try {
    // Bind before database/bootstrap work so startup dependency failures remain
    // diagnosable from the UI instead of appearing as an unreachable server.
    if (!httpServer) {
      console.log(`onePOS: binding HTTP listener on ${PORT}`);
      httpServer = app.listen(PORT, "0.0.0.0");
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`HTTP listener did not bind on port ${PORT}`)), 10000);
        httpServer.once("listening", () => {
          clearTimeout(timeout);
          resolve();
        });
        httpServer.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      console.log(`onePOS running on port ${PORT}`);
    }

    const trustedRuntime = validateTrustedRuntime();
    const trustedPackages = validateTrustedPackageCatalogue();
    console.log(`OneEngine Trusted Runtime ${trustedRuntime.version.slice(0, 12)} (${trustedRuntime.count} capabilities; packages ${trustedPackages.digest.slice(0, 12)}/${trustedPackages.count})`);
    if (!pool) throw new Error("DATABASE_URL is not configured");
    console.log(`onePOS: checking database connection host=${primaryDatabaseTarget?.host || "not-configured"} database=${primaryDatabaseTarget?.database || "not-configured"} sslmode=${primaryDatabaseTarget?.sslmode || "not-configured"}`);
    await db("SELECT NOW()");
    await initializeDatabase(pool, { bootstrapSuperadmin: false });
    console.log("onePOS: core database ready");

    // Canonical development tenant seed: a clean database must become usable
    // without manual SQL or copied production data.
    const oneSolutionsSeed = await seedOneSolutionsDemo(pool);

    // Catalogue availability is a core startup requirement, not part of the
    // heavyweight metadata bootstrap. Keep OneStore/package discovery current
    // before the HTTP listener can be reported live.
    await db(
      `CREATE TABLE IF NOT EXISTS onepos_runtime_state (
         state_key VARCHAR(120) PRIMARY KEY,
         state_value TEXT NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    console.log("onePOS: syncing package catalogue...");
    await seedInternalAppCatalog(pool);
    await seedPackageRegistry(pool);
    const startupRegistryHealth = await verifyPublicPackageRegistry(pool);
    if (!startupRegistryHealth.healthy) {
      const details = [
        startupRegistryHealth.missing.length ? `missing=${startupRegistryHealth.missing.join(",")}` : "",
        startupRegistryHealth.stale.length ? `stale=${startupRegistryHealth.stale.map((item) => item.packageKey).join(",")}` : "",
      ].filter(Boolean).join(" ");
      throw new Error(`Package catalogue startup verification failed${details ? `: ${details}` : ""}`);
    }
    console.log(`onePOS: package catalogue ready (${startupRegistryHealth.actualCount}/${startupRegistryHealth.expectedCount} public packages verified)`);

    // Operator-only one-time package activation hook. This is driven entirely
    // by the private service environment and is idempotent, so it can be used
    // to activate/install a package for a tenant without hard-coding tenant
    // identifiers into source code or exposing an HTTP backdoor.
    const startupPackageRequest = String(process.env.ONEENGINE_STARTUP_PACKAGE_TRIAL_INSTALL || "").trim();
    if (startupPackageRequest) {
      const [companyId, packageKey] = startupPackageRequest.split("|").map((value) => String(value || "").trim());
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId || "")) {
        throw new Error("ONEENGINE_STARTUP_PACKAGE_TRIAL_INSTALL has an invalid company id");
      }
      if (!/^[a-z_][a-z0-9_]{0,99}$/.test(packageKey || "")) {
        throw new Error("ONEENGINE_STARTUP_PACKAGE_TRIAL_INSTALL has an invalid package key");
      }

      const companyResult = await db("SELECT id FROM companies WHERE id=$1 LIMIT 1", [companyId]);
      if (!companyResult.rows.length) throw new Error(`Startup package activation company not found: ${companyId}`);

      const packageResult = await db(
        `SELECT id,package_key,name,version,module_id,licence_mode,installable,visible,system_only,publication_state,active
           FROM package_registry
          WHERE package_key=$1 AND active=true
          LIMIT 1`,
        [packageKey]
      );
      const pkg = packageResult.rows[0];
      if (!pkg || pkg.installable !== true || pkg.visible !== true || pkg.system_only === true || pkg.publication_state !== "PUBLISHED") {
        throw new Error(`Startup package activation is not allowed for: ${packageKey}`);
      }

      const activeInstallation = await db(
        `SELECT id
           FROM company_package_installations
          WHERE company_id=$1 AND package_id=$2
            AND status='active'
            AND suspended_by_entitlement=false
            AND deactivated_by_user=false
          LIMIT 1`,
        [companyId, pkg.id]
      );

      if (!activeInstallation.rows.length) {
        // An explicit operator request means reactivate this package even if
        // the tenant had previously deactivated it. Reconciliation deliberately
        // preserves manual deactivation, so clear that flag first.
        await db(
          `UPDATE company_package_installations
              SET deactivated_by_user=false,updated_at=NOW()
            WHERE company_id=$1 AND package_id=$2`,
          [companyId, pkg.id]
        );

        let trial = (await db(
          "SELECT activated_at,expires_at FROM company_package_trials WHERE company_id=$1 AND package_id=$2 LIMIT 1",
          [companyId, pkg.id]
        )).rows[0] || null;

        const hasActiveEntitlement = await db(
          `SELECT 1
             FROM company_package_entitlement_sources
            WHERE company_id=$1 AND package_id=$2 AND active=true
              AND (starts_at IS NULL OR starts_at<=NOW())
              AND (expires_at IS NULL OR expires_at>NOW())
            LIMIT 1`,
          [companyId, pkg.id]
        );

        if (!hasActiveEntitlement.rows.length) {
          if (trial && new Date(trial.expires_at).getTime() <= Date.now()) {
            throw new Error(`The one-time trial for ${packageKey} has already expired and cannot be restarted`);
          }
          if (!trial) {
            trial = (await db(
              `INSERT INTO company_package_trials
                 (company_id,package_id,activated_by,activated_at,expires_at)
               VALUES ($1,$2,NULL,NOW(),NOW() + INTERVAL '7 days')
               RETURNING activated_at,expires_at`,
              [companyId, pkg.id]
            )).rows[0];
          }
          await db(
            `INSERT INTO company_package_entitlement_sources
               (company_id,package_id,source_type,source_key,active,starts_at,expires_at,metadata)
             VALUES ($1,$2,'DIRECT_LICENCE',$3,true,$4,$5,$6::jsonb)
             ON CONFLICT (company_id,package_id,source_type,source_key)
             DO UPDATE SET active=true,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,metadata=EXCLUDED.metadata`,
            [
              companyId,
              pkg.id,
              `trial:${companyId}:${pkg.package_key}`,
              trial.activated_at,
              trial.expires_at,
              JSON.stringify({ trial: true, days: 7, activatedBy: "render-startup-operator" }),
            ]
          );
        }

        const entitlementSnapshot = await db(
          `SELECT source_type,source_key,active,starts_at,expires_at
             FROM company_package_entitlement_sources
            WHERE company_id=$1 AND package_id=$2
            ORDER BY source_type,source_key`,
          [companyId, pkg.id]
        );
        console.log("onePOS: startup package entitlement snapshot", {
          companyId,
          packageKey,
          sources: entitlementSnapshot.rows.map((row) => ({
            sourceType: row.source_type,
            active: row.active,
            startsAt: row.starts_at,
            expiresAt: row.expires_at,
          })),
        });

        if (!pkg.module_id) {
          throw new Error(`Startup package activation has no module for ${packageKey}`);
        }

        const packageManifest = await db(
          "SELECT manifest FROM package_registry WHERE id=$1 LIMIT 1",
          [pkg.id]
        );
        await provisionPackageMetadata(db, {
          packageId: pkg.id,
          moduleId: pkg.module_id,
          companyId,
          manifest: packageManifest.rows[0]?.manifest || {},
          packageVersion: pkg.version,
        });

        await db(
          `INSERT INTO company_package_installations
             (company_id,package_id,version,status,installation_type,available_version,deactivated_by_user,suspended_by_entitlement)
           VALUES($1,$2,$3,'active','ENTITLEMENT',$3,false,false)
           ON CONFLICT(company_id,package_id) DO UPDATE SET
             version=EXCLUDED.version,
             status='active',
             installation_type=CASE
               WHEN company_package_installations.installation_type='PLATFORM_DEFAULT'
                 THEN company_package_installations.installation_type
               ELSE 'ENTITLEMENT'
             END,
             available_version=EXCLUDED.available_version,
             deactivated_by_user=false,
             suspended_by_entitlement=false,
             updated_at=NOW()`,
          [companyId, pkg.id, pkg.version]
        );

        await db(
          `INSERT INTO platform_module_access(module_id,company_id,store_id,enabled)
           VALUES($1,$2,NULL,true)
           ON CONFLICT(module_id,company_id,COALESCE(store_id,'00000000-0000-0000-0000-000000000000'::uuid))
           DO UPDATE SET enabled=true,updated_at=NOW()`,
          [pkg.module_id, companyId]
        );

        const workflowVerification = await db(
          `SELECT r.id,r.active,COALESCE(r.lifecycle_status,'ACTIVE') AS lifecycle_status
             FROM platform_rules r
             JOIN platform_objects o ON o.id=r.object_id
            WHERE r.company_id=$1
              AND o.object_key='communication_event'
              AND r.action->>'apiName'='OneAssistant_Booking_Channel_Router'
            ORDER BY r.updated_at DESC NULLS LAST,r.created_at DESC
            LIMIT 1`,
          [companyId]
        );
        const bookingWorkflow = workflowVerification.rows[0];
        if (!bookingWorkflow || bookingWorkflow.active !== true || bookingWorkflow.lifecycle_status !== 'ACTIVE') {
          throw new Error("OneAssistant WhatsApp booking workflow was not provisioned as active");
        }

        console.log("onePOS: startup package targeted provisioning complete", {
          companyId,
          packageKey,
          bookingRouterWorkflow: bookingWorkflow.id,
        });
      }

      const verifiedInstallation = await db(
        `SELECT i.status,i.suspended_by_entitlement,i.deactivated_by_user
           FROM company_package_installations i
          WHERE i.company_id=$1 AND i.package_id=$2
          LIMIT 1`,
        [companyId, pkg.id]
      );
      const installed = verifiedInstallation.rows[0];
      console.log("onePOS: startup package installation snapshot", {
        companyId,
        packageKey,
        installation: installed || null,
      });
      if (!installed || installed.status !== "active" || installed.suspended_by_entitlement === true || installed.deactivated_by_user === true) {
        throw new Error(`Startup package activation did not produce an active installation for ${packageKey}`);
      }
      console.log("onePOS: startup package trial/install complete", { companyId, packageKey });
    }

    const recoveredCommands = await db(
      `UPDATE platform_workflow_runs
          SET status='FAILED',
              completed_at=NOW(),
              error_text=COALESCE(error_text,'Interrupted before HTTP response completed'),
              metadata=COALESCE(metadata,'{}'::jsonb) || '{"recoveredAtStartup":true}'::jsonb,
              updated_at=NOW()
        WHERE trigger_key='business_command'
          AND status='RUNNING'
          AND created_at < NOW() - INTERVAL '5 minutes'
        RETURNING id`
    );
    if (recoveredCommands.rowCount) {
      console.log(`onePOS: recovered ${recoveredCommands.rowCount} stale business command trace(s)`);
    }

    runtimeReadiness = {
      state: "ready",
      oeCode: null,
      message: "OneEngine is ready.",
      technicalMessage: null,
      updatedAt: new Date().toISOString(),
    };
    startupAttempt = 0;

    // Reconcile the canonical company-bound Superadmin immediately after the
    // core schema and listener are ready. This is intentionally before the
    // potentially long metadata bootstrap so login/E2E cannot be stranded on
    // a legacy identity during rolling deploys. The same idempotent bootstrap
    // runs again after metadata creation to grant any newly-created objects.
    await bootstrapInitialSuperadmin(pool, {
      ...process.env,
      BOOTSTRAP_SUPERADMIN_COMPANY_ID: oneSolutionsSeed.companyId,
      BOOTSTRAP_TENANT_SUPERADMIN_EMAIL: "superadmin@onepos.com",
      BOOTSTRAP_TENANT_SUPERADMIN_PASSWORD: "marvel",
      BOOTSTRAP_TENANT_SUPERADMIN_NAME: "OneSolutions Superadmin",
    });
    console.log("onePOS: identity bootstrap ready");

    // Reconcile SMSGate inbound webhooks after the HTTP listener is live. This
    // is idempotent: existing callbacks are reused, while missing callbacks
    // are created. Signing keys stay encrypted in integration credentials.
    setTimeout(async () => {
      try {
        const rows = await pool.query(
          `SELECT id,connector_configuration,credentials_encrypted,enabled
             FROM integration_connections
            WHERE connector_package_key='smsgate_connector'
              AND enabled=TRUE`
        );
        for (const row of rows.rows) {
          try {
          const configuration = typeof row.connector_configuration === "string"
            ? JSON.parse(row.connector_configuration || "{}")
            : (row.connector_configuration || {});
          const secrets = (() => {
            try { return decryptCredentials(row.credentials_encrypted) || {}; }
            catch { return {}; }
          })();
          const webhookToken = String(secrets.webhookToken || "").trim() || randomBytes(32).toString("hex");
          const webhookUrl = `${String(process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "")}/api/smsgate/webhook/${row.id}/${webhookToken}`;

          const webhook = await configureSmsGateInboundWebhook(
            { ...configuration, ...secrets },
            { webhookUrl }
          );

          const nextSecrets = { ...secrets, webhookToken };
          await pool.query(
            `UPDATE integration_connections
                SET credentials_encrypted=$1,
                    connector_configuration=connector_configuration - 'webhookSigningKey',
                    enabled=CASE
                      WHEN COALESCE((connector_configuration->>'enabled')::boolean,FALSE)=TRUE THEN TRUE
                      ELSE enabled
                    END,
                    updated_at=NOW()
              WHERE id=$2`,
            [encryptCredentials(nextSecrets), row.id]
          );

          console.log(`onePOS: SMSGate inbound webhook ready (${webhook.created ? "created" : "existing"}) connection=${row.id} staleRemoved=${webhook.removedStale || 0}`);
          const diagnostics = await getSmsGateDiagnostics({ ...configuration, ...nextSecrets }).catch((error) => ({ error: error?.message || String(error) }));
          const webhookRows = Array.isArray(diagnostics?.webhooks)
            ? diagnostics.webhooks
            : Array.isArray(diagnostics?.webhooks?.data)
              ? diagnostics.webhooks.data
              : Array.isArray(diagnostics?.webhooks?.webhooks)
                ? diagnostics.webhooks.webhooks
                : [];
          const relevantWebhook = webhookRows.find((item) =>
            String(item?.url || "") === webhookUrl
              && String(item?.event || "").toLowerCase() === "sms:received"
          );
          const logRows = Array.isArray(diagnostics?.logs)
            ? diagnostics.logs
            : Array.isArray(diagnostics?.logs?.data)
              ? diagnostics.logs.data
              : Array.isArray(diagnostics?.logs?.logs)
                ? diagnostics.logs.logs
                : [];
          console.log("onePOS: SMSGate diagnostics", {
            webhookRegistered: Boolean(relevantWebhook),
            webhookCount: webhookRows.length,
            recentProviderLogs: logRows.slice(-8).map((entry) => ({
              level: entry?.level || entry?.type || null,
              message: String(entry?.message || entry?.event || entry?.action || "").slice(0, 180),
              createdAt: entry?.createdAt || entry?.created_at || entry?.timestamp || null,
            })),
            providerLogError: diagnostics?.logs?.error || diagnostics?.error || null,
          });
          } catch (rowError) {
            console.error(`onePOS: SMSGate inbound webhook reconciliation failed connection=${row.id}:`, rowError?.message || rowError);
          }
        }
      } catch (error) {
        console.error("onePOS: SMSGate inbound webhook reconciliation failed:", error?.message || error);
      }
    }, 1500).unref?.();


    // The metadata bootstrap is expensive and used to run on every Render restart,
    // including frontend-only commits. Persist a fingerprint of the source files
    // that actually define platform/package metadata and skip the heavy pass when
    // nothing relevant changed. The marker is written only after a successful run.
    // Render performs rolling deploys, so old and new instances can overlap.
    // Serialise the metadata bootstrap across processes to avoid DDL/seed
    // deadlocks while both instances point at the same PostgreSQL database.
    const bootstrapLockClient = await pool.connect();
    let ownsBootstrapLock = false;
    try {
      // Never block a request-serving instance behind another rolling deploy.
      // The HTTP listener is already live at this point and the durable workflow
      // worker is initialized later in this startup path; a blocking advisory
      // lock here previously left inbound events queued indefinitely whenever
      // another instance held the bootstrap lock.
      const lockResult = await bootstrapLockClient.query(
        "SELECT pg_try_advisory_lock(hashtext('onepos_platform_bootstrap')) AS acquired"
      );
      ownsBootstrapLock = lockResult.rows[0]?.acquired === true;

      if (!ownsBootstrapLock) {
        console.warn("onePOS: platform bootstrap lock busy; skipping duplicate bootstrap on this instance");
      } else {
        const bootstrapState = await platformBootstrapIsCurrent();
        let bootstrapRan = false;
        if (!bootstrapState.current) {
          console.log("onePOS: platform bootstrap metadata changed; running full bootstrap");
          await initializePlatformMetadata(pool, { includeOperationalObjects: true });
          await initializeStandardObjectEcosystem(pool);
          bootstrapRan = true;
        } else {
          const initialRegistryHealth = await verifyPublicPackageRegistry(pool);
          if (!initialRegistryHealth.healthy) {
            console.warn("onePOS: package registry drift detected; repairing from source catalogue");
            await initializePlatformMetadata(pool, { includeOperationalObjects: true });
            await initializeStandardObjectEcosystem(pool);
            bootstrapRan = true;
          } else {
            console.log("onePOS: platform bootstrap metadata unchanged; registry verified");
          }
        }

        const registryHealth = await verifyPublicPackageRegistry(pool);
        if (!registryHealth.healthy) {
          const details = [
            registryHealth.missing.length ? `missing=${registryHealth.missing.join(",")}` : "",
            registryHealth.stale.length ? `stale=${registryHealth.stale.map((item) => item.packageKey).join(",")}` : "",
          ].filter(Boolean).join(" ");
          throw new Error(`Public package registry is out of sync with source catalogue${details ? `: ${details}` : ""}`);
        }
        if (bootstrapRan) await markPlatformBootstrapCurrent(bootstrapState.fingerprint);
      }
    } finally {
      try {
        if (ownsBootstrapLock) {
          await bootstrapLockClient.query("SELECT pg_advisory_unlock(hashtext('onepos_platform_bootstrap'))");
        }
      } finally {
        bootstrapLockClient.release();
      }
    }

    // Identity/profile synchronization remains cheap and intentionally runs on
    // every start so environment-driven bootstrap credentials can still change.
    // Re-run the idempotent tenant seed after platform bootstrap so tenant
    // extension fields/relationships can bind to canonical Platform Objects.
    await seedOneSolutionsDemo(pool);
    await bootstrapInitialSuperadmin(pool, {
      ...process.env,
      BOOTSTRAP_SUPERADMIN_COMPANY_ID: oneSolutionsSeed.companyId,
      BOOTSTRAP_TENANT_SUPERADMIN_EMAIL: "superadmin@onepos.com",
      BOOTSTRAP_TENANT_SUPERADMIN_PASSWORD: "marvel",
      BOOTSTRAP_TENANT_SUPERADMIN_NAME: "OneSolutions Superadmin",
    });

    // Installed package manifests are the source of truth for managed metadata.
    // Refresh every active installation after bootstrap so package-owned fields,
    // relationships, layouts, workflows and actions do not drift behind code
    // changes. This is intentionally additive/idempotent and preserves rows
    // marked user_modified. Physical business tables remain authoritative and
    // are never recreated by this metadata refresh.
    const activePackageInstallations = await db(
      `SELECT i.company_id,p.id AS package_id,p.package_key,p.module_id,p.version,p.manifest
         FROM company_package_installations i
         JOIN package_registry p ON p.id=i.package_id
        WHERE i.status='active'
          AND p.active=TRUE
          AND COALESCE(i.suspended_by_entitlement,FALSE)=FALSE
          AND COALESCE(i.deactivated_by_user,FALSE)=FALSE
        ORDER BY i.company_id,p.package_key`
    );
    let refreshedPackageMetadata = 0;
    let packageMetadataRefreshFailures = 0;
    for (const installation of activePackageInstallations.rows || []) {
      if (!installation.module_id) continue;
      const manifest = installation.manifest && typeof installation.manifest === "object"
        ? installation.manifest
        : {};
      const hasManagedMetadata = [
        "objects","relationships","layouts","recordForms","forms","listViews","workflows",
        "rules","validationRules","actions","buttons","reports","templates","events",
        "permissionDeclarations","connectors"
      ].some((key) => Array.isArray(manifest[key]) && manifest[key].length > 0);
      if (!hasManagedMetadata) continue;
      try {
        await provisionPackageMetadata(db, {
          packageId: installation.package_id,
          moduleId: installation.module_id,
          companyId: installation.company_id,
          manifest,
          packageVersion: installation.version,
        });
        refreshedPackageMetadata += 1;
      } catch (error) {
        packageMetadataRefreshFailures += 1;
        console.error("onePOS: managed package metadata refresh failed", {
          companyId: installation.company_id,
          packageKey: installation.package_key,
          error: error?.message || String(error),
        });
      }
    }
    console.log("onePOS: managed package metadata refresh complete", {
      installations: activePackageInstallations.rowCount || 0,
      refreshed: refreshedPackageMetadata,
      failures: packageMetadataRefreshFailures,
    });

    console.log("onePOS: platform bootstrap ready");

    const loadWorkflowAutomationActor = async (companyId, preferredUserId = null) => {
      if (!companyId) throw Object.assign(new Error("Workflow automation requires a company context"), { retryable: false });
      if (preferredUserId) {
        const preferred = await db(
          `SELECT u.id,u.role_id,u.store_id,NULL::uuid AS till_id
             FROM users u
             JOIN roles r ON r.id=u.role_id
            WHERE u.id=$1 AND u.company_id=$2 AND u.active=true
              AND u.role_id IS NOT NULL
              AND (r.company_id=$2 OR r.company_id IS NULL)
            LIMIT 1`,
          [preferredUserId, companyId]
        );
        if (preferred.rows[0]) return preferred.rows[0];
        throw Object.assign(
          new Error("Workflow automation actor is no longer active or no longer has an RBAC role. Reassign or recreate the workflow/schedule with an active user."),
          { retryable: false }
        );
      }
      const fallback = await db(
        `SELECT u.id,u.role_id,u.store_id,NULL::uuid AS till_id
           FROM users u
           JOIN roles r ON r.id=u.role_id
          WHERE u.company_id=$1 AND u.active=true
            AND r.api_key='platform_superadmin'
            AND (r.company_id=$1 OR r.company_id IS NULL)
          ORDER BY u.created_at,u.id
          LIMIT 1`,
        [companyId]
      );
      if (!fallback.rows[0]) {
        throw Object.assign(new Error("Workflow automation has no active RBAC execution user. Assign a tenant Superadmin or recreate the schedule/workflow with an active user."), { retryable: false });
      }
      return fallback.rows[0];
    };

    const workflowEntriesContainStatus = (entries = [], status = "waiting") =>
      (Array.isArray(entries) ? entries : []).some((entry) => {
        if (String(entry?.result?.status || "").toLowerCase() === String(status).toLowerCase()) return true;
        if (workflowEntriesContainStatus(entry?.result?.branch?.results || [], status)) return true;
        if (workflowEntriesContainStatus(entry?.result?.faultBranch?.results || [], status)) return true;
        return (Array.isArray(entry?.result?.iterations) ? entry.result.iterations : [])
          .some((iteration) => workflowEntriesContainStatus(iteration?.results || [], status));
      });

    let draining = false;
    const workerEnabled = process.env.PLATFORM_JOB_WORKER !== "false";
    const drain = async () => {
      if (!workerEnabled || draining || !pool) return;
      draining = true;
      try {
        await drainDuePlatformJobs({
          db,
          limit: 10,
          onFailed: async (job, failed) => {
            if (job.kind === "PLATFORM_EVENT_WORKFLOW") {
              console.error("Platform event workflow job failed", {
                jobId: job.id,
                companyId: job.company_id,
                workflowId: job.payload?.workflowId || null,
                eventId: job.payload?.eventId || null,
                status: failed?.status || "FAILED",
                attempts: failed?.attempts || 0,
                error: failed?.last_error || null,
              });
            }
            if (job.kind === "PLATFORM_SCHEDULED_WORKFLOW" && failed?.status === "FAILED") {
              await failScheduledWorkflow({ db, payload: job.payload || {}, error: failed.last_error });
            }
            if (job.kind === "REPORT_SUBSCRIPTION_DELIVERY" && failed?.status === "FAILED") {
              const subscriptionId = job.payload?.subscriptionId || null;
              if (subscriptionId) {
                await db(
                  "UPDATE report_subscriptions SET last_run_at=NOW(),last_status='FAILED',updated_at=NOW() WHERE id=$1 AND company_id=$2",
                  [subscriptionId, job.company_id]
                );
              }
            }
            if (job.kind === "DASHBOARD_SUBSCRIPTION_DELIVERY" && failed?.status === "FAILED") {
              const subscriptionId = job.payload?.subscriptionId || null;
              if (subscriptionId) {
                await db(
                  "UPDATE dashboard_subscriptions SET last_run_at=NOW(),last_status='FAILED',updated_at=NOW() WHERE id=$1 AND company_id=$2",
                  [subscriptionId, job.company_id]
                );
              }
            }
            if (["QUICKBOOKS_PROVIDER_SYNC", "SHOPIFY_PROVIDER_SYNC", "SHOPIFY_WEBHOOK_EVENT"].includes(job.kind)) {
              await writeAudit(job.company_id, null, "provider_job_attempt_failed", "platform_action_job", job.id, {
                kind: job.kind,
                status: failed?.status || "FAILED",
                attempts: failed?.attempts || 0,
              });
            }
          },
          handler: async (job) => {
            assertTrustedJobKind(job.kind);
            if (job.kind === "WAIT") {
              const payload = job.payload || {};
              if (payload.scheduledPath === true) {
                const parentRunResult = payload.parentRunId
                  ? await db("SELECT * FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1", [payload.parentRunId, job.company_id])
                  : { rows: [] };
                const parentRun = parentRunResult.rows[0] || null;
                const workflowId = payload.workflowId || parentRun?.workflow_id || null;
                if (!workflowId) throw Object.assign(new Error("Scheduled Path workflow is unavailable"), { retryable: false });
                const workflowResult = await db(
                  `SELECT * FROM platform_rules
                    WHERE id=$1 AND company_id=$2 AND action->>'type'='workflow'
                    LIMIT 1`,
                  [workflowId, job.company_id]
                );
                let workflow = workflowResult.rows[0];
                if (!workflow) throw Object.assign(new Error("Scheduled Path workflow no longer exists"), { retryable: false });
                const pinnedVersion = Number(payload.workflowVersion || parentRun?.workflow_version || workflow.active_version || workflow.version || 1);
                const snapshotResult = await db(
                  "SELECT definition FROM platform_workflow_versions WHERE company_id=$1 AND workflow_id=$2 AND version=$3 LIMIT 1",
                  [job.company_id, workflow.id, pinnedVersion]
                );
                if (snapshotResult.rows[0]?.definition && typeof snapshotResult.rows[0].definition === "object") {
                  workflow = { ...workflow, ...snapshotResult.rows[0].definition, id: workflow.id, company_id: workflow.company_id };
                }
                const allActions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
                const stepIds = new Set((payload.scheduledPathStepIds || []).map(String));
                const actions = allActions.filter((action) => stepIds.has(String(action?.id || "")));
                if (!actions.length) throw Object.assign(new Error("Scheduled Path has no executable steps"), { retryable: false });

                let object = null;
                let record = null;
                let fields = [];
                const objectId = payload.objectId || parentRun?.object_id || workflow.object_id || null;
                const recordId = payload.recordId || parentRun?.record_id || null;
                if (objectId) {
                  const objectResult = await db(
                    "SELECT * FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2) LIMIT 1",
                    [objectId, job.company_id]
                  );
                  object = objectResult.rows[0] || null;
                  if (object?.id) {
                    const fieldsResult = await db(
                      "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
                      [object.id, job.company_id]
                    );
                    fields = fieldsResult.rows || [];
                  }
                }
                if (object?.source_table && recordId) {
                  const table = String(object.source_table || "");
                  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw Object.assign(new Error("Scheduled Path record source is invalid"), { retryable: false });
                  const params = [recordId];
                  const clauses = ["id=$1"];
                  if (object.company_scoped !== false) {
                    params.push(job.company_id);
                    clauses.push("company_id=$" + params.length);
                  }
                  const recordResult = await db(`SELECT * FROM "${table}" WHERE ${clauses.join(" AND ")} LIMIT 1`, params);
                  record = recordResult.rows[0] || null;
                }

                const actor = await loadWorkflowAutomationActor(
                  job.company_id,
                  parentRun?.metadata?.actorUserId || workflow.created_by || null
                );
                const actorId = actor.id;
                const childRun = await createWorkflowRun({
                  db,
                  companyId: job.company_id,
                  workflowId: workflow.id,
                  workflowName: `${workflow.name} · ${payload.scheduledPathLabel || "Scheduled Path"}`,
                  workflowVersion: pinnedVersion,
                  objectId: object?.id || objectId,
                  recordId,
                  triggerKey: "SCHEDULED_PATH",
                  parentRunId: parentRun?.id || null,
                  status: "RUNNING",
                  metadata: {
                    scheduledPath: true,
                    scheduledPathId: payload.scheduledPathId || null,
                    scheduledPathLabel: payload.scheduledPathLabel || null,
                    scheduledPathStepIds: payload.scheduledPathStepIds || [],
                    actorUserId: actorId,
                    sourceRunId: parentRun?.id || null,
                    initialVariables: payload.workflowVariables && typeof payload.workflowVariables === "object"
                      ? payload.workflowVariables
                      : { variables: {}, steps: {} },
                    initialPreviousRecord: payload.previousRecord || null,
                  },
                });
                const req = {
                  user: {
                    id: actor.id || actorId || null,
                    roleId: actor.role_id || null,
                    companyId: job.company_id,
                    storeId: actor.store_id || parentRun?.metadata?.storeId || null,
                    tillId: actor.till_id || parentRun?.metadata?.tillId || null,
                  },
                };
                try {
                  const scheduledVariables = payload.workflowVariables && typeof payload.workflowVariables === "object"
                    ? JSON.parse(JSON.stringify(payload.workflowVariables))
                    : { variables: {}, steps: {} };
                  if (!scheduledVariables.variables || typeof scheduledVariables.variables !== "object") scheduledVariables.variables = {};
                  if (!scheduledVariables.steps || typeof scheduledVariables.steps !== "object") scheduledVariables.steps = {};
                  const results = await executeWorkflowActions({
                    actions,
                    allActions,
                    db,
                    pool,
                    req,
                    companyId: job.company_id,
                    userId: req.user.id,
                    object,
                    fields,
                    record,
                    recordId,
                    storeId: req.user.storeId,
                    tillId: req.user.tillId,
                    connectorDrivers,
                    writeAudit,
                    runId: childRun.id,
                    workflowVersion: pinnedVersion,
                    trigger: "SCHEDULED_PATH",
                    workflowVariables: scheduledVariables,
                  });
                  const scheduledWaiting = workflowEntriesContainStatus(results, "waiting");
                  await db(
                    `UPDATE platform_workflow_runs
                        SET status=$1,
                            completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                            metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,
                            updated_at=NOW()
                      WHERE id=$3 AND company_id=$4`,
                    [
                      scheduledWaiting ? "WAITING" : "COMPLETED",
                      JSON.stringify({ childResults: results, finalVariables: scheduledVariables }),
                      childRun.id,
                      job.company_id,
                    ]
                  );
                  if (payload.sourceStepRunId) {
                    await db(
                      `UPDATE platform_workflow_step_runs
                          SET metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW()
                        WHERE id=$2`,
                      [JSON.stringify({ scheduledChildRunId: childRun.id, scheduledPathFiredAt: new Date().toISOString() }), payload.sourceStepRunId]
                    );
                  }
                  return { status: scheduledWaiting ? "WAITING" : "COMPLETED", scheduledPath: true, runId: childRun.id, results };
                } catch (error) {
                  await db(
                    "UPDATE platform_workflow_runs SET status='FAILED',error_text=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND company_id=$3",
                    [String(error?.message || error).slice(0, 2000), childRun.id, job.company_id]
                  );
                  throw error;
                }
              }
              if (!payload.runId) return { status: "COMPLETED", resumed: false };

              const runResult = await db(
                `SELECT * FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1`,
                [payload.runId, job.company_id]
              );
              const run = runResult.rows[0];
              if (!run) throw Object.assign(new Error("Waiting workflow run no longer exists"), { retryable: false });

              if (payload.waitConfigurationId && String(run.status || "").toUpperCase() !== "WAITING") {
                return { status: "COMPLETED", resumed: false, ignored: true, reason: "wait_already_resumed" };
              }

              let matchedPlatformEventPayload = null;
              let matchedPlatformEventId = null;
              if (payload.platformEventType) {
                const since = payload.waitingStartedAt ? new Date(payload.waitingStartedAt) : new Date(run.updated_at || run.created_at || Date.now());
                const safeSince = Number.isNaN(since.getTime()) ? new Date(Date.now() - 86400000) : since;
                const events = await db(
                  `SELECT id,event_type,payload,created_at
                     FROM platform_events
                    WHERE company_id=$1 AND event_type=$2 AND created_at >= $3
                    ORDER BY created_at,id
                    LIMIT 100`,
                  [job.company_id, String(payload.platformEventType), safeSince]
                );
                const getEventPath = (value, path) => String(path || "").split(".").filter(Boolean).reduce((current, part) => current == null ? undefined : current?.[part], value);
                const compareEventValue = (left, operator, right) => {
                  const op = String(operator || "equals");
                  if (op === "equals") return left === right || String(left ?? "") === String(right ?? "");
                  if (op === "not_equals") return !(left === right || String(left ?? "") === String(right ?? ""));
                  if (op === "contains") return String(left ?? "").includes(String(right ?? ""));
                  if (op === "starts_with") return String(left ?? "").startsWith(String(right ?? ""));
                  if (op === "ends_with") return String(left ?? "").endsWith(String(right ?? ""));
                  if (op === "is_null") return left == null || left === "";
                  if (op === "is_not_null") return !(left == null || left === "");
                  const a = Number(left), b = Number(right);
                  if (op === "greater_than") return Number.isFinite(a) && Number.isFinite(b) && a > b;
                  if (op === "greater_than_or_equal") return Number.isFinite(a) && Number.isFinite(b) && a >= b;
                  if (op === "less_than") return Number.isFinite(a) && Number.isFinite(b) && a < b;
                  if (op === "less_than_or_equal") return Number.isFinite(a) && Number.isFinite(b) && a <= b;
                  return false;
                };
                const filters = Array.isArray(payload.platformEventConditions) ? payload.platformEventConditions : [];
                const evaluateLogic = (logic, results) => {
                  const tokens = String(logic || "").match(/\d+|AND|OR|NOT|\(|\)/gi) || [];
                  let cursor = 0;
                  const factor = () => {
                    const token = String(tokens[cursor++] || "");
                    if (token.toUpperCase() === "NOT") return !factor();
                    if (token === "(") {
                      const value = or();
                      if (tokens[cursor++] !== ")") return false;
                      return value;
                    }
                    return /^\d+$/.test(token) ? Boolean(results[Number(token) - 1]) : false;
                  };
                  const and = () => {
                    let value = factor();
                    while (String(tokens[cursor] || "").toUpperCase() === "AND") { cursor += 1; value = value && factor(); }
                    return value;
                  };
                  const or = () => {
                    let value = and();
                    while (String(tokens[cursor] || "").toUpperCase() === "OR") { cursor += 1; value = value || and(); }
                    return value;
                  };
                  return tokens.length ? or() && cursor === tokens.length : false;
                };
                const conditionMode = String(payload.platformEventConditionMode || (filters.length ? "all" : "none"));
                const matchedEvent = (events.rows || []).find((event) => {
                  if (conditionMode === "none" || !filters.length) return true;
                  const results = filters.map((filter) => compareEventValue(
                    getEventPath(event.payload || {}, filter.field),
                    filter.operator,
                    filter.value
                  ));
                  if (conditionMode === "any") return results.some(Boolean);
                  if (conditionMode === "custom") return evaluateLogic(payload.platformEventCustomConditionLogic, results);
                  return results.every(Boolean);
                });
                if (!matchedEvent) {
                  const pollSeconds = Math.max(30, Math.min(86400, Number(payload.pollSeconds || 60)));
                  await db(
                    "UPDATE platform_action_jobs SET status='PENDING',next_attempt_at=NOW() + ($2 * INTERVAL '1 second'),updated_at=NOW() WHERE id=$1 AND status='RUNNING'",
                    [job.id, pollSeconds]
                  );
                  return { status: "WAITING", deferred: true, platformEventMatched: false, nextCheckSeconds: pollSeconds };
                }
                matchedPlatformEventPayload = matchedEvent.payload || {};
                matchedPlatformEventId = matchedEvent.id;
                if (payload.stepRunId) {
                  await db(
                    "UPDATE platform_workflow_step_runs SET metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND run_id=$3",
                    [JSON.stringify({
                      waitConfigurationId: payload.waitConfigurationId || null,
                      waitConfigurationLabel: payload.waitConfigurationLabel || null,
                      platformEventId: matchedEvent.id,
                      platformEventType: matchedEvent.event_type,
                      waitResumedAt: new Date().toISOString(),
                    }), payload.stepRunId, run.id]
                  );
                }
              }

              if (payload.waitConfigurationId) {
                await db(
                  `UPDATE platform_action_jobs
                      SET status='COMPLETED',completed_at=NOW(),updated_at=NOW()
                    WHERE company_id=$1 AND kind='WAIT' AND id<>$2
                      AND status='PENDING'
                      AND payload->>'runId'=$3
                      AND payload ? 'waitConfigurationId'`,
                  [job.company_id, job.id, String(run.id)]
                );
              }

              if (payload.waitCondition) {
                let waitRecord = {};
                let waitFields = [];
                if (run.object_id) {
                  const waitObjectResult = await db(
                    `SELECT * FROM platform_objects
                      WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)
                      LIMIT 1`,
                    [run.object_id, job.company_id]
                  );
                  const waitObject = waitObjectResult.rows[0] || null;
                  if (waitObject?.id) {
                    const waitFieldsResult = await db(
                      "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
                      [waitObject.id, job.company_id]
                    );
                    waitFields = waitFieldsResult.rows || [];
                  }
                  if (waitObject?.source_table && run.record_id) {
                    const table = String(waitObject.source_table || "");
                    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw Object.assign(new Error("Wait condition record source is invalid"), { retryable: false });
                    const params = [run.record_id];
                    let where = "id=$1";
                    if (waitObject.company_scoped !== false) {
                      params.push(job.company_id);
                      where += ` AND company_id=${params.length}`;
                    }
                    const waitRecordResult = await db(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`, params);
                    waitRecord = waitRecordResult.rows[0] || {};
                  }
                }
                const conditionMet = evaluateCondition(
                  payload.waitCondition,
                  waitFields,
                  waitRecord,
                  run.metadata?.initialPreviousRecord || null
                );
                const maxWaitUntil = payload.maxWaitUntil ? new Date(payload.maxWaitUntil) : null;
                const timedOut = maxWaitUntil && !Number.isNaN(maxWaitUntil.getTime()) && Date.now() >= maxWaitUntil.getTime();
                if (!conditionMet && !timedOut) {
                  const pollSeconds = Math.max(30, Math.min(86400, Number(payload.pollSeconds || 60)));
                  await db(
                    "UPDATE platform_action_jobs SET status='PENDING',next_attempt_at=NOW() + ($2 * INTERVAL '1 second'),updated_at=NOW() WHERE id=$1 AND status='RUNNING'",
                    [job.id, pollSeconds]
                  );
                  return { status: "WAITING", deferred: true, conditionMet: false, nextCheckSeconds: pollSeconds };
                }
                if (payload.stepRunId) {
                  await db(
                    "UPDATE platform_workflow_step_runs SET metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND run_id=$3",
                    [JSON.stringify({ waitConditionMet: conditionMet, waitConditionTimedOut: Boolean(timedOut), waitConditionCheckedAt: new Date().toISOString() }), payload.stepRunId, run.id]
                  );
                }
              }

              const workflowResult = await db(
                `SELECT * FROM platform_rules
                  WHERE id=$1 AND company_id=$2
                    AND action->>'type'='workflow'
                  LIMIT 1`,
                [run.workflow_id, job.company_id]
              );
              let workflow = workflowResult.rows[0];
              if (!workflow) throw Object.assign(new Error("Waiting workflow definition is unavailable"), { retryable: false });
              const resumeVersion = Number(run.workflow_version || workflow.active_version || workflow.version || 1);
              const resumeSnapshot = await db(
                "SELECT definition FROM platform_workflow_versions WHERE company_id=$1 AND workflow_id=$2 AND version=$3 LIMIT 1",
                [job.company_id, workflow.id, resumeVersion]
              );
              if (resumeSnapshot.rows[0]?.definition && typeof resumeSnapshot.rows[0].definition === "object") {
                workflow = { ...workflow, ...resumeSnapshot.rows[0].definition, id: workflow.id, company_id: workflow.company_id };
              }

              if (payload.stepRunId) {
                await db(
                  `UPDATE platform_workflow_step_runs
                      SET status='COMPLETED',
                          completed_at=COALESCE(completed_at,NOW()),
                          metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,
                          updated_at=NOW()
                    WHERE id=$2 AND run_id=$3`,
                  [JSON.stringify({ resumedAt: new Date().toISOString(), waitJobId: job.id }), payload.stepRunId, run.id]
                );
              }

              await db(
                "UPDATE platform_workflow_runs SET status='RUNNING',completed_at=NULL,error_text=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
                [run.id, job.company_id]
              );

              let object = null;
              let record = null;
              let fields = [];
              if (run.object_id) {
                const objectResult = await db(
                  `SELECT * FROM platform_objects
                    WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)
                    LIMIT 1`,
                  [run.object_id, job.company_id]
                );
                object = objectResult.rows[0] || null;
                if (object?.id) {
                  const fieldsResult = await db(
                    "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label",
                    [object.id, job.company_id]
                  );
                  fields = fieldsResult.rows || [];
                }
              }
              if (object?.source_table && run.record_id) {
                const table = String(object.source_table || "");
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
                  throw Object.assign(new Error("Waiting workflow record source is invalid"), { retryable: false });
                }
                const params = [run.record_id];
                let where = "id=$1";
                if (object.company_scoped !== false) {
                  params.push(job.company_id);
                  where += ` AND company_id=$${params.length}`;
                }
                const recordResult = await db(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`, params);
                record = recordResult.rows[0] || null;
              }

              const actor = await loadWorkflowAutomationActor(
                job.company_id,
                run.metadata?.actorUserId || workflow.created_by || null
              );
              const actorId = actor.id;
              const allResumeActions = Array.isArray(workflow.action?.actions) ? workflow.action.actions : [];
              const scheduledResumeIds = run.trigger_key === "SCHEDULED_PATH" && Array.isArray(run.metadata?.scheduledPathStepIds)
                ? new Set(run.metadata.scheduledPathStepIds.map(String))
                : null;
              const actions = scheduledResumeIds
                ? allResumeActions.filter((action) => scheduledResumeIds.has(String(action?.id || "")))
                : allResumeActions;
              const req = {
                user: {
                  id: actor.id || actorId || null,
                  roleId: actor.role_id || null,
                  companyId: job.company_id,
                  storeId: actor.store_id || run.metadata?.storeId || null,
                  tillId: actor.till_id || run.metadata?.tillId || null,
                },
              };

              const workflowVariables = run.metadata?.initialVariables && typeof run.metadata.initialVariables === "object"
                ? JSON.parse(JSON.stringify(run.metadata.initialVariables))
                : { variables: {}, steps: {} };
              if (!workflowVariables.variables || typeof workflowVariables.variables !== "object") workflowVariables.variables = {};
              if (!workflowVariables.steps || typeof workflowVariables.steps !== "object") workflowVariables.steps = {};
              if (payload.platformEventOutputVariable && matchedPlatformEventPayload) {
                workflowVariables.variables[String(payload.platformEventOutputVariable)] = matchedPlatformEventPayload;
              }
              if (matchedPlatformEventId) {
                workflowVariables.variables.$LastPlatformEventId = matchedPlatformEventId;
              }
              let results;
              try {
                results = await executeWorkflowActions({
                  actions,
                  allActions: scheduledResumeIds ? allResumeActions : actions,
                  db,
                  pool,
                  req,
                  companyId: job.company_id,
                  userId: req.user.id,
                  object,
                  fields,
                  record,
                  previousRecord: run.metadata?.initialPreviousRecord || null,
                  recordId: run.record_id || null,
                  storeId: req.user.storeId,
                  tillId: req.user.tillId,
                  connectorDrivers,
                  writeAudit,
                  runId: run.id,
                  workflowVersion: resumeVersion,
                  trigger: run.trigger_key || workflow.trigger_key,
                  workflowVariables,
                });
              } catch (error) {
                if (run.parent_run_id) {
                  const parentRunResult = await db(
                    "SELECT id,status FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1",
                    [run.parent_run_id, job.company_id]
                  );
                  const parentRun = parentRunResult.rows[0];
                  if (parentRun && ["WAITING","RUNNING"].includes(String(parentRun.status || "").toUpperCase())) {
                    await db(
                      "UPDATE platform_workflow_runs SET status='RUNNING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
                      [run.parent_run_id, job.company_id]
                    );
                    await enqueuePlatformJob({
                      db,
                      companyId: job.company_id,
                      kind: "WAIT",
                      payload: { runId: run.parent_run_id, resumeParentFromFailedChildRunId: run.id },
                      runAt: new Date(),
                      idempotencyKey: `resume-parent-failed:${run.parent_run_id}:${run.id}`,
                    });
                  }
                }
                throw error;
              }

              const stillWaiting = workflowEntriesContainStatus(results, "waiting");
              if (!stillWaiting) {
                await db(
                  "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3",
                  [JSON.stringify({ childResults: results, finalVariables: workflowVariables }), run.id, job.company_id]
                );
                if (run.parent_run_id) {
                  const parentStep = await db(
                    `SELECT id,run_id FROM platform_workflow_step_runs
                      WHERE child_run_id=$1 AND run_id=$2
                      ORDER BY created_at DESC LIMIT 1`,
                    [run.id, run.parent_run_id]
                  );
                  if (parentStep.rows[0]) {
                    const outputContract = Array.isArray(workflow.action?.outputContract) ? workflow.action.outputContract : [];
                    const childOutputs = {};
                    for (const output of outputContract) {
                      const name = String(output?.name || "");
                      if (!name) continue;
                      const source = output.source || `variables.${name}`;
                      childOutputs[name] = resolveWorkflowResource(source, {
                        record,
                        previousRecord: null,
                        user: req.user,
                        rootObjectKey: object?.object_key || null,
                        variables: workflowVariables,
                      });
                    }
                    await db(
                      `UPDATE platform_workflow_step_runs
                          SET status='COMPLETED',completed_at=NOW(),
                              metadata=COALESCE(metadata,'{}'::jsonb)||$1::jsonb,updated_at=NOW()
                        WHERE id=$2`,
                      [JSON.stringify({
                        childRunId: run.id,
                        resumedChildCompleted: true,
                        result: {
                          status: "completed",
                          runId: run.id,
                          resumedChildCompleted: true,
                          outputs: childOutputs,
                        },
                      }), parentStep.rows[0].id]
                    );
                  }
                  const parentRun = await db(
                    "SELECT id,status FROM platform_workflow_runs WHERE id=$1 AND company_id=$2 LIMIT 1",
                    [run.parent_run_id, job.company_id]
                  );
                  if (parentRun.rows[0] && parentRun.rows[0].status === "WAITING") {
                    await db(
                      "UPDATE platform_workflow_runs SET status='RUNNING',completed_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2",
                      [run.parent_run_id, job.company_id]
                    );
                    await enqueuePlatformJob({
                      db,
                      companyId: job.company_id,
                      kind: "WAIT",
                      payload: { runId: run.parent_run_id, resumeParentFromChildRunId: run.id },
                      runAt: new Date(),
                      idempotencyKey: `resume-parent:${run.parent_run_id}:${run.id}`,
                    });
                  }
                }
              }
              return { status: stillWaiting ? "WAITING" : "COMPLETED", resumed: true, runId: run.id };
            }
            const payload = job.payload || {};
            if (job.kind === "APP_RELEASE_UPGRADE") {
              const release = await db("SELECT status FROM package_releases WHERE id=$1", [payload.releaseId]);
              if (release.rows[0]?.status === "PAUSED") {
                await db(
                  "UPDATE platform_action_jobs SET status='PENDING',next_attempt_at=NOW() + INTERVAL '1 minute',updated_at=NOW() WHERE id=$1 AND status='RUNNING'",
                  [job.id]
                );
                return { status: "PAUSED", deferred: true };
              }
              const client = await pool.connect();
              let outcome;
              try {
                await client.query("BEGIN");
                outcome = await executeTenantReleaseUpgrade({
                  db: (query, params = []) => client.query(query, params),
                  releaseId: payload.releaseId,
                  companyId: payload.companyId || job.company_id,
                  packageKey: payload.packageKey,
                  userId: payload.userId || null,
                });
                if (outcome.status === "FAILED") {
                  await client.query("ROLLBACK");
                  await db(
                    `UPDATE company_package_installations SET update_status='FAILED',update_error='Package release upgrade failed',updated_at=NOW()
                      WHERE company_id=$1 AND package_id=(SELECT id FROM package_registry WHERE package_key=$2)`,
                    [payload.companyId || job.company_id, payload.packageKey]
                  );
                  await writeAudit(payload.companyId || job.company_id, null, "release.tenant.failed", "package_release", payload.releaseId, {
                    packageKey: payload.packageKey,
                    errorCode: "RELEASE_UPGRADE_FAILED",
                  });
                  throw Object.assign(new Error("Package release upgrade failed"), { retryable: true });
                }
                await client.query("COMMIT");
                return outcome;
              } catch (error) {
                await client.query("ROLLBACK").catch(() => {});
                throw error;
              } finally {
                client.release();
              }
            }
            if (job.kind === "REPORT_SUBSCRIPTION_DELIVERY") {
              return processReportSubscriptionDeliveryJob({
                db,
                payload: { ...(payload || {}), companyId: job.company_id },
              });
            }
            if (job.kind === "DASHBOARD_SUBSCRIPTION_DELIVERY") {
              return processDashboardSubscriptionDeliveryJob({
                db,
                payload: { ...(payload || {}), companyId: job.company_id },
                canViewCompanyCustomers,
                canAccessStore,
                hasPermission,
              });
            }
            if (job.kind === "PLATFORM_WEBHOOK_DELIVERY") {
              return deliverPlatformWebhook({
                db,
                deliveryId: payload.deliveryId,
                companyId: payload.companyId || job.company_id,
                decryptSecret,
              });
            }
            if (job.kind === "PLATFORM_SCHEDULED_WORKFLOW") {
              const workflowResult = await db(
                `SELECT id,name,object_id,action,version,active_version,created_by FROM platform_rules
                 WHERE id=$1 AND company_id=$2 AND active=TRUE LIMIT 1`,
                [payload.workflowId, payload.companyId || job.company_id]
              );
              const workflow = workflowResult.rows[0];
              if (!workflow) throw Object.assign(new Error("Scheduled workflow is unavailable"), { retryable: false });
              const actions = Array.isArray(workflow.action?.actions)
                ? workflow.action.actions
                : Array.isArray(workflow.action) ? workflow.action
                  : workflow.action?.type ? [workflow.action] : [];
              if (!actions.length) throw Object.assign(new Error("Scheduled workflow has no executable actions"), { retryable: false });
              const companyId = payload.companyId || job.company_id;
              const runMetadata = { scheduleId: payload.scheduleId, fireAt: payload.fireAt };
              const previousRun = await db(
                `SELECT id FROM platform_workflow_runs
                 WHERE company_id=$1 AND trigger_key='SCHEDULED'
                   AND metadata->>'scheduleId'=$2 AND metadata->>'fireAt'=$3
                 ORDER BY created_at DESC LIMIT 1`,
                [companyId, String(payload.scheduleId), String(payload.fireAt)]
              );
              let run;
              if (previousRun.rows[0]) {
                const update = await db(
                  `UPDATE platform_workflow_runs SET status='RUNNING',error_text=NULL,completed_at=NULL,updated_at=NOW()
                   WHERE id=$1 AND company_id=$2 RETURNING *`,
                  [previousRun.rows[0].id, companyId]
                );
                run = update.rows[0];
              } else {
                run = await createWorkflowRun({
                  db,
                  companyId,
                  workflowId: workflow.id,
                  workflowName: workflow.name,
                  workflowVersion: Number(workflow.active_version || workflow.version || 1),
                  objectId: workflow.object_id,
                  recordId: null,
                  triggerKey: "SCHEDULED",
                  status: "RUNNING",
                  metadata: runMetadata,
                });
              }
              const objectResult = workflow.object_id
                ? await db(
                    "SELECT * FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)",
                    [workflow.object_id, companyId]
                  )
                : { rows: [] };
              try {
                const actor = await loadWorkflowAutomationActor(companyId, payload.actorUserId || workflow.created_by || null);
                const results = await executeWorkflowActions({
                  actions,
                  db,
                  req: { user: {
                    id: actor.id,
                    roleId: actor.role_id,
                    companyId,
                    storeId: actor.store_id || null,
                    tillId: actor.till_id || null,
                  } },
                  userId: actor.id,
                  storeId: actor.store_id || null,
                  tillId: actor.till_id || null,
                  companyId,
                  object: objectResult.rows[0] || null,
                  record: null,
                  recordId: null,
                  runId: run?.id || null,
                  workflowVersion: Number(workflow.active_version || workflow.version || 1),
                  trigger: "scheduled",
                });
                const waiting = workflowEntriesContainStatus(results, "waiting");
                await db(
                  `UPDATE platform_workflow_runs
                      SET status=$1,
                          completed_at=CASE WHEN $1='WAITING' THEN NULL ELSE NOW() END,
                          updated_at=NOW()
                    WHERE id=$2 AND company_id=$3`,
                  [waiting ? "WAITING" : "COMPLETED", run.id, companyId]
                );
                // This scheduled occurrence has been accepted. Advance the
                // durable schedule even if the workflow itself is paused by WAIT,
                // so recurring schedules are not blocked by a long-running run.
                await completeScheduledWorkflow({ db, payload });
                console.info("Platform scheduled workflow job completed", {
                  jobId: job.id,
                  workflowId: workflow.id,
                  status: waiting ? "WAITING" : "COMPLETED",
                  steps: results.map((entry) => ({
                    stepId: entry?.stepId || null,
                    action: entry?.action || null,
                    status: entry?.result?.status || null,
                  })),
                });
                return { status: waiting ? "WAITING" : "COMPLETED", results };
              } catch (error) {
                if (run?.id) {
                  await db(
                    "UPDATE platform_workflow_runs SET status='FAILED',error_text=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND company_id=$3",
                    [String(error?.message || error).slice(0, 2000), run.id, companyId]
                  );
                }
                throw error;
              }
            }
            if (job.kind === "PLATFORM_EVENT_WORKFLOW") {
              console.info("Platform event workflow job started", {
                jobId: job.id,
                companyId: job.company_id,
                workflowId: payload.workflowId || null,
                eventId: payload.eventId || null,
                eventType: payload.eventType || null,
              });
              const workflowResult = await db(
                `SELECT * FROM platform_rules
                  WHERE id=$1 AND company_id=$2 AND active=TRUE
                    AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
                    AND action->>'type'='workflow'
                  LIMIT 1`,
                [payload.workflowId, job.company_id]
              );
              const workflow = workflowResult.rows[0];
              if (!workflow) throw Object.assign(new Error("Event workflow is unavailable"), { retryable: false });
              if (payload.eventType && workflow.trigger_key !== payload.eventType) {
                throw Object.assign(new Error("Event workflow trigger no longer matches this event"), { retryable: false });
              }
              const actions = Array.isArray(workflow.action?.actions)
                ? workflow.action.actions
                : Array.isArray(workflow.action) ? workflow.action
                  : workflow.action?.type ? [workflow.action] : [];
              if (!actions.length) throw Object.assign(new Error("Event workflow has no executable actions"), { retryable: false });

              const existingRun = await db(
                `SELECT id,status FROM platform_workflow_runs
                  WHERE company_id=$1 AND workflow_id=$2
                    AND metadata->>'eventId'=$3
                  ORDER BY created_at DESC LIMIT 1`,
                [job.company_id, workflow.id, String(payload.eventId || "")]
              );
              let run;
              if (existingRun.rows[0]) {
                if (existingRun.rows[0].status === "COMPLETED") return { status: "COMPLETED", idempotentReplay: true };
                const restarted = await db(
                  `UPDATE platform_workflow_runs
                    SET status='RUNNING',error_text=NULL,completed_at=NULL,updated_at=NOW()
                    WHERE id=$1 AND company_id=$2 RETURNING *`,
                  [existingRun.rows[0].id, job.company_id]
                );
                run = restarted.rows[0];
              } else {
                run = await createWorkflowRun({
                  db,
                  companyId: job.company_id,
                  workflowId: workflow.id,
                  workflowName: workflow.name,
                  workflowVersion: Number(workflow.active_version || workflow.version || 1),
                  objectId: workflow.object_id || payload.objectId || null,
                  recordId: payload.recordId || null,
                  triggerKey: payload.eventType || workflow.trigger_key,
                  status: "RUNNING",
                  metadata: { eventId: payload.eventId || null, eventType: payload.eventType || workflow.trigger_key },
                });
              }

              const objectResult = (workflow.object_id || payload.objectId)
                ? await db(
                    "SELECT * FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)",
                    [workflow.object_id || payload.objectId, job.company_id]
                  )
                : { rows: [] };
              const triggerFields = objectResult.rows[0] ? await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)", [objectResult.rows[0].id, job.company_id]) : { rows: [] };
              try {
                const actor = await loadWorkflowAutomationActor(job.company_id, payload.actorUserId || workflow.created_by || null);
                const results = await executeWorkflowActions({
                  actions,
                  db,
                  pool,
                  req: { user: {
                    companyId: job.company_id,
                    id: actor.id,
                    roleId: actor.role_id,
                    storeId: actor.store_id || payload.storeId || null,
                    tillId: actor.till_id || null,
                  } },
                  companyId: job.company_id,
                  userId: actor.id,
                  storeId: actor.store_id || payload.storeId || null,
                  tillId: actor.till_id || null,
                  object: objectResult.rows[0] || null,
                  fields: triggerFields.rows,
                  record: payload.record || null,
                  recordId: payload.recordId || null,
                  runId: run?.id || null,
                  workflowVersion: Number(workflow.active_version || workflow.version || 1),
                  trigger: payload.eventType || workflow.trigger_key,
                  writeAudit,
                  createInventoryMovement,
                });
                const waiting = workflowEntriesContainStatus(results, "waiting");
                if (run?.id) {
                  await db(
                    `UPDATE platform_workflow_runs
                        SET status=$1,
                            completed_at=CASE WHEN $4::boolean THEN NULL ELSE NOW() END,
                            updated_at=NOW()
                      WHERE id=$2 AND company_id=$3`,
                    [waiting ? "WAITING" : "COMPLETED", run.id, job.company_id, waiting]
                  );
                }
                console.info("Platform event workflow job completed", {
                  jobId: job.id,
                  workflowId: workflow.id,
                  eventId: payload.eventId || null,
                  status: waiting ? "WAITING" : "COMPLETED",
                  steps: results.map((entry) => ({
                    stepId: entry?.stepId || null,
                    action: entry?.action || null,
                    status: entry?.result?.status || null,
                  })),
                });
                return { status: waiting ? "WAITING" : "COMPLETED", results };
              } catch (error) {
                console.error("Platform event workflow execution error", {
                  jobId: job.id,
                  workflowId: workflow.id,
                  eventId: payload.eventId || null,
                  message: error?.message || String(error),
                  code: error?.code || null,
                  detail: error?.detail || null,
                  position: error?.position || null,
                  stack: String(error?.stack || "").split("\n").slice(0, 10).join("\n"),
                });
                if (run?.id) {
                  await db(
                    "UPDATE platform_workflow_runs SET status='FAILED',error_text=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND company_id=$3",
                    [String(error?.message || error).slice(0, 2000), run.id, job.company_id]
                  );
                }
                throw error;
              }
            }
            if (job.kind === "APPROVAL_DUE") return processApprovalDueJob({ db, job });
            if (job.kind === "SHOPIFY_WEBHOOK_EVENT") {
              const execution = await executeSystemWorkflow({
                db,
                companyId: job.company_id,
                userId: payload.actorUserId || null,
                systemKey: "action:SHOPIFY_PROCESS_WEBHOOK",
                req: { method: "JOB", path: "SHOPIFY_WEBHOOK_EVENT", user: { companyId: job.company_id, storeId: payload.storeId || null, id: payload.actorUserId || null } },
                input: { ...payload, _executeFromJob: true },
                storeId: payload.storeId || null,
                writeAudit,
                source: { type: "job", method: "JOB", path: "SHOPIFY_WEBHOOK_EVENT", capability: "SHOPIFY_PROCESS_WEBHOOK" },
                extraContext: { pool, createInventoryMovement },
              });
              const outcome = execution.result;
              if (outcome?.success === false) {
                throw Object.assign(new Error(outcome.message || "Shopify webhook processing failed"), {
                  retryable: outcome.retryable === true,
                });
              }
              return outcome;
            }
            if (job.kind === "QUICKBOOKS_PROVIDER_SYNC") {
              const actionKey = String(payload.type || payload.key || "").toUpperCase();
              if (!actionKey) throw Object.assign(new Error("QuickBooks provider job is missing an action key"), { retryable: false });
              const execution = await executeSystemWorkflow({
                db,
                companyId: job.company_id,
                userId: payload.actorUserId || null,
                systemKey: `action:${actionKey}`,
                req: { method: "JOB", path: "QUICKBOOKS_PROVIDER_SYNC", user: { companyId: job.company_id, id: payload.actorUserId || null } },
                input: { ...payload, _executeFromJob: true },
                writeAudit,
                source: { type: "job", method: "JOB", path: "QUICKBOOKS_PROVIDER_SYNC", capability: actionKey },
                extraContext: { pool },
              });
              const outcome = execution.result;
              if (outcome?.success === false) {
                throw Object.assign(new Error(outcome.message || outcome.code || "QuickBooks sync failed"), {
                  retryable: outcome.retryable !== false,
                });
              }
              return outcome;
            }
            if (job.kind === "SHOPIFY_PROVIDER_SYNC") {
              const actionKey = String(payload.type || payload.key || "").toUpperCase();
              if (!actionKey) throw Object.assign(new Error("Shopify provider job is missing an action key"), { retryable: false });
              const execution = await executeSystemWorkflow({
                db,
                companyId: job.company_id,
                userId: payload.actorUserId || null,
                systemKey: `action:${actionKey}`,
                req: { method: "JOB", path: "SHOPIFY_PROVIDER_SYNC", user: { companyId: job.company_id, storeId: payload.storeId || null, id: payload.actorUserId || null } },
                input: { ...payload, _executeFromJob: true },
                storeId: payload.storeId || null,
                writeAudit,
                source: { type: "job", method: "JOB", path: "SHOPIFY_PROVIDER_SYNC", capability: actionKey },
                extraContext: { pool, createInventoryMovement },
              });
              const outcome = execution.result;
              if (outcome?.success === false) {
                throw Object.assign(new Error(outcome.message || outcome.code || "Shopify sync failed"), {
                  retryable: outcome.retryable !== false,
                });
              }
              return outcome;
            }
            const actionKey = String(payload.type || payload.key || "").toUpperCase();
            if (!actionKey) throw Object.assign(new Error("Platform action job is missing an action key"), { retryable: false });
            const execution = await executeSystemWorkflow({
              db,
              companyId: job.company_id,
              userId: payload.actorUserId || null,
              systemKey: `action:${actionKey}`,
              req: { method: "JOB", path: job.kind, user: { companyId: job.company_id, id: payload.actorUserId || null, roleId: payload._roleId || null } },
              input: { ...payload, _executeFromJob: true },
              writeAudit,
              source: { type: "job", method: "JOB", path: job.kind, capability: actionKey },
              extraContext: { pool, createInventoryMovement },
            });
            const result = execution.result;
            if (payload._stepRunId) {
              await db(
                "UPDATE platform_workflow_step_runs SET status=$1,error_text=$2,completed_at=NOW(),updated_at=NOW() WHERE id=$3",
                [result?.status === "SUCCESS" ? "COMPLETED" : (result?.status || "COMPLETED"), result?.code || result?.error?.message || null, payload._stepRunId]
              );
            }
            if (result?.status === "UNAVAILABLE") return result;
            if (result?.status && !["SUCCESS","COMPLETED"].includes(result.status)) {
              const error = new Error(result?.error?.message || result?.code || "Action failed");
              error.retryable = result?.retryable === true;
              throw error;
            }
            return result;
          },
        });
        await claimDueScheduledWorkflows({ db, limit: 10 });
        await claimDueReportSubscriptions({ db, limit: 50 });
        await claimDueDashboardSubscriptions({ db });
      } catch (error) {
        console.error("Platform job worker error:", error.message);
      } finally {
        draining = false;
      }
    };
    console.log("onePOS: platform job worker", { enabled: workerEnabled });

    if (workerEnabled) {
      // Recover recent event workflows that were persisted while the worker was
      // unavailable/disabled or whose prior job failed before creating a
      // completed workflow run. The durable event remains authoritative, and a
      // separate idempotency key makes recovery safe without mutating history.
      try {
        const recoverable = await db(
          `SELECT e.id AS event_id,e.company_id,e.event_type,e.payload,e.actor_user_id,
                  r.id AS workflow_id,r.object_id
             FROM platform_events e
             JOIN platform_rules r
               ON r.company_id=e.company_id
              AND r.active=TRUE
              AND COALESCE(r.lifecycle_status,'ACTIVE')='ACTIVE'
              AND r.trigger_key=e.event_type
              AND r.action->>'type'='workflow'
            WHERE e.event_type='communication_message_received'
              AND e.created_at >= NOW() - INTERVAL '1 hour'
              AND NOT EXISTS (
                SELECT 1
                  FROM platform_workflow_runs wr
                 WHERE wr.company_id=e.company_id
                   AND wr.workflow_id=r.id
                   AND wr.metadata->>'eventId'=e.id::text
                   AND wr.status='COMPLETED'
              )
            ORDER BY e.created_at,e.id`
        );
        for (const item of recoverable.rows || []) {
          const eventPayload = item.payload && typeof item.payload === "object" ? item.payload : {};
          await enqueuePlatformJob({
            db,
            companyId: item.company_id,
            kind: "PLATFORM_EVENT_WORKFLOW",
            payload: {
              workflowId: item.workflow_id,
              eventId: item.event_id,
              eventType: item.event_type,
              objectId: item.object_id || eventPayload.objectId || null,
              recordId: eventPayload.recordId || eventPayload.id || null,
              record: eventPayload.record || eventPayload || null,
              actorUserId: item.actor_user_id || null,
            },
            idempotencyKey: `event-workflow-recovery-v3:${item.workflow_id}:${item.event_id}`,
          });
        }
        console.log("onePOS: event workflow recovery scan", { recoverable: recoverable.rowCount || 0 });
        if (recoverable.rowCount) {
          console.log("onePOS: recovered recent event workflow jobs", { count: recoverable.rowCount });
        }
      } catch (error) {
        console.error("onePOS: event workflow recovery failed:", error?.message || error);
      }
      void drain();
    }

    const workerPollMs = Math.min(
      15 * 60_000,
      Math.max(30_000, Number(process.env.PLATFORM_JOB_POLL_MS || 60_000))
    );
    const workerTimer = workerEnabled ? setInterval(drain, workerPollMs) : null;
    if (workerTimer?.unref) workerTimer.unref();
    const shutdown = () => {
      if (workerTimer) clearInterval(workerTimer);
      const forceExit = setTimeout(() => process.exit(0), 5_000);
      forceExit.unref?.();
      try { httpServer?.closeIdleConnections?.(); } catch {}
      httpServer?.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
      setTimeout(() => {
        try { httpServer?.closeAllConnections?.(); } catch {}
      }, 2_000).unref?.();
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  } catch (error) {
    console.error("onePOS startup failed:", error);
    const oeCode = classifyDebugCode(error, 503);
    const definition = builtinDebugCode(oeCode) || builtinDebugCode("OESS01");
    runtimeReadiness = {
      state: "degraded",
      oeCode: definition.code,
      message: definition.userMessage,
      technicalMessage: String(error?.message || error || ""),
      updatedAt: new Date().toISOString(),
    };
    // If the HTTP listener itself could not bind there is no diagnostic surface
    // to preserve, so fail normally. Dependency/bootstrap failures stay online
    // in degraded mode and expose their OE code through /api/health.
    if (!httpServer?.listening) process.exit(1);

    // PostgreSQL poolers and TLS endpoints can briefly reset sockets during
    // deploys, maintenance, cold starts, or network rebalancing. Previously a
    // single ECONNRESET left OneEngine permanently degraded until the next
    // Render deploy. Retry the complete idempotent bootstrap with bounded
    // exponential backoff while keeping the diagnostic HTTP surface online.
    const transientCodes = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "ENETUNREACH", "EHOSTUNREACH"]);
    const transientDatabaseFailure =
      transientCodes.has(String(error?.code || "").toUpperCase()) ||
      /before secure TLS connection|connection terminated unexpectedly|timeout expired|server closed the connection/i.test(String(error?.message || ""));
    if (transientDatabaseFailure) {
      const retryDelayMs = startupAttempt <= 5
        ? Math.min(60_000, Math.max(3_000, 3_000 * (2 ** Math.min(startupAttempt - 1, 4))))
        : Math.min(15 * 60_000, 60_000 * (2 ** Math.min(startupAttempt - 5, 4)));
      console.warn(`onePOS: transient database startup failure; retrying in ${retryDelayMs}ms (attempt ${startupAttempt})`);
      startupRetryTimer = setTimeout(() => void startServer(), retryDelayMs);
      startupRetryTimer.unref?.();
    }
  }
}

startServer();
