import { createChangePasswordHandler } from "./services/changePassword.js";
import "dotenv/config";
import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { bootstrapInitialSuperadmin, ensureGlobalSystemProfile, initializeDatabase } from "./database/init.js";
import { createAuditWriter } from "./services/auditLog.js";
import { createSessionToken, createAuthenticate } from "./services/session.js";
import { drainDuePlatformJobs } from "./services/platformJobs.js";
import { assertTrustedJobKind, createTrustedRuntimeGate, validateTrustedRuntime } from "./services/trustedRuntime.js";
import { validateTrustedPackageCatalogue } from "./services/trustedPackages.js";
import { executeTenantReleaseUpgrade } from "./services/appReleaseManager.js";
import { claimDueScheduledWorkflows, completeScheduledWorkflow, failScheduledWorkflow } from "./services/platformSchedules.js";
import { deliverPlatformWebhook, verifyWebhookSignature } from "./services/platformEvents.js";
import { decryptSecret, encryptSecret } from "./services/onlineOrders/platformConfig.js";
import { decryptCredentials } from "./services/integrationCredentials.js";
import {
  createWorkflowRun,
  executeWorkflowAction,
  executeWorkflowActions,
} from "./services/platformWorkflow.js";
import { executeSystemWorkflow } from "./services/systemWorkflowRuntime.js";
import { createBusinessCommandGateway, purgeOldBusinessCommandRuns } from "./services/businessCommandGateway.js";
import { withPlatformTransaction } from "./services/platformTransaction.js";
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
import createScanGoRouter from "./routes/scanAndGo.js";
import createMobileScannerRouter from "./routes/mobileScanner.js";
import createReturnsRouter from "./routes/returns.js";
import createReportsRouter from "./routes/reports.js";
import createSecureInvoiceRouter from "./routes/secureInvoice.js";
import createSettingsRouter from "./routes/settings.js";
import createAccountLifecycleRouter from "./routes/accountLifecycle.js";
import createWhatsAppSettingsRouter from "./routes/whatsapp.js";
import createOneAssistantRouter from "./routes/oneAssistant.js";
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
import { ONE_CONNECT_PROVIDER_DRIVER_KEYS, createOneConnectProviderDriver } from "./services/oneConnectProviders.js";
import createPlatformFilesRouter from "./routes/platformFiles.js";
import createPlatformSequencesRouter from "./routes/platformSequences.js";
import createPlatformSchedulesRouter from "./routes/platformSchedules.js";
import createPlatformEventsRouter from "./routes/platformEvents.js";
import { saveDomainConfiguration } from "./services/platformDomainRecords.js";
import createAdvancedPlatformRouter from "./routes/advancedPlatform.js";
import { initializePlatformMetadata, initializeStandardObjectEcosystem } from "./services/platformMetadata.js";
import { getCompanyEntitlements } from "./services/licensing.js";
import { requireEntitlement } from "./services/licensing.js";
import { getGoogleConnectRuntimeForEmail, getGoogleConnectRuntime } from "./services/googleConnect.js";
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

const app = express();

const PORT = process.env.PORT || 10000;


/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(cors());

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
app.use("/api/shopify/webhooks", express.raw({ type: "*/*", limit: "1mb" }));

app.use(express.json({ limit: "10mb" }));

/* T10D: Self-Checkout mode gate — ahead of EVERY API router so a
 * self-checkout mode token is refused for privileged operations
 * server-side (never merely hidden in the UI). */
app.use(createSelfCheckoutModeGate());
app.use(createTrustedRuntimeGate());
app.use(express.urlencoded({ limit: "10mb", extended: true }));

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

const primaryDatabaseUrl = process.env.DATABASE_URL
  ? normalizePrimaryDatabaseUrl(process.env.DATABASE_URL)
  : "";

const pool = primaryDatabaseUrl
  ? new Pool({
      connectionString: primaryDatabaseUrl,
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
      idle_in_transaction_session_timeout: 30000,
      lock_timeout: 15000,
      statement_timeout: 120000,
    })
  : null;

const tenantPoolManager = createTenantPoolManager({
  env: process.env,
  PoolFactory: Pool,
  poolOptions: {
    connectionTimeoutMillis: 15000,
    idle_in_transaction_session_timeout: 30000,
    lock_timeout: 15000,
    statement_timeout: 120000,
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

const paymentProviders = new Map();
const connectorDrivers = new ConnectorDriverRegistry();
connectorDrivers.register(createReferencePaymentDriver());
connectorDrivers.register(createPaypalQrDriver());
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
const authenticate = (req, res, next) => baseAuthenticate(req, res, (error) => {
  if (error) return next(error);
  return Promise.resolve(
    req.ensureBusinessCommandRun?.({
      companyId: req.user?.companyId || null,
      userId: req.user?.id || null,
      storeId: req.user?.storeId || null,
    })
  ).then(() => next()).catch(next);
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
      const codes = await getRolePermissionCodes(req.user.roleId, req);
      const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
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
  const codes = await getRolePermissionCodes(req.user?.roleId, req);
  const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
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
  if (!user?.roleId) return false;
  // Reuse the request-scoped RBAC lookup when a request is available instead
  // of issuing a second company.scope.all query.
  const codes = await getRolePermissionCodes(user.roleId, request);
  return codes.includes("company.scope.all");
}

async function canAccessStore(user, storeId) {
  if (!storeId) return false;

  // Company-wide scope permission bypasses per-store assignment checks.
  if (await canViewCompanyCustomers(user)) {
    return true;
  }

  // Never trust the login-time assignedStoreIds claim for a security decision;
  // assignments can be revoked while a session token is still valid.
  const assignment = await db(
    `SELECT 1 FROM stores s
      JOIN user_stores us ON us.store_id=s.id AND us.user_id=$3 AND us.active=true
     WHERE s.id=$1 AND s.company_id=$2 AND s.active=true LIMIT 1`,
    [storeId, user.companyId, user.id]
  );
  return assignment.rows.length > 0;
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get("/api/health", async (req, res) => {
  let database = "not configured";

  if (pool) {
    try {
      await db("SELECT NOW()");
      database = "connected";
    } catch (error) {
      console.error("Database health check failed:", error.message);
      database = "error";
    }
  }

  res.json({
    success: true,
    app: "onePOS",
    status: "online",
    version: "0.2.0",
    database,
    time: new Date().toISOString(),
  });
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
  const secret = process.env.JWT_SECRET || "development-secret-change-this";
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
  const secret = process.env.JWT_SECRET || "development-secret-change-this";

  let returnTo = "https://onesolutions-ahuja.github.io/smart-theme/";
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
        u.is_platform_developer,
        u.must_change_password,
        r.name AS role_name
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

    await pool.query("UPDATE users SET last_login_at=NOW() WHERE id=$1", [user.id]);
    const token = createToken(user);

    const target = new URL(returnTo);
    target.hash = `google_token=${encodeURIComponent(token)}`;
    return res.redirect(target.toString());
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return res.redirect(googleOAuthErrorRedirect(returnTo, "google_login_failed"));
  }
});

app.post("/api/auth/login", async (req, res) => {
  const loginStartedAt = Date.now();
  const loginTimings = {};
  const markLoginTiming = (name, startedAt) => { loginTimings[name] = Date.now() - startedAt; };
  try {
    const email = String(req.body?.email || req.body?.username || "").trim();
    const { password } = req.body;
    const requestedActingCompanyId = String(req.body?.actingCompanyId || "").trim();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (!pool) {
      return res.status(503).json({
        success: false,
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
        u.is_platform_developer,
        u.must_change_password,
        r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE LOWER(BTRIM(u.email)) = LOWER(BTRIM($1))
         OR (u.email IS NULL AND LOWER(u.username) = LOWER(BTRIM($1)))
      LIMIT 1
    `;

    /*
     * Global platform profiles live in the central identity database with no
     * tenant company binding. Tenant/domain resolution must never shadow those
     * global accounts with a tenant-local user row.
     */
    let stepStartedAt = Date.now();
    const centralIdentity = await pool.query(identitySql, [email]);
    markLoginTiming("central_identity_ms", stepStartedAt);
    const centralUser = centralIdentity.rows[0] || null;
    const isPlatformIdentity = Boolean(centralUser && centralUser.company_id == null);

    const loginPool = isPlatformIdentity
      ? pool
      : (req.tenantPool || tenantPoolManager.getPoolForRequest(req) || pool);

    stepStartedAt = Date.now();
    const result = isPlatformIdentity
      ? centralIdentity
      : await loginPool.query(identitySql, [email]);
    markLoginTiming("tenant_identity_ms", stepStartedAt);

    if (!result.rows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = result.rows[0];

    if (!user.active) {
      return res.status(403).json({
        success: false,
        message: "User account is disabled",
      });
    }

    if (user.company_id) {
      const googleRuntime = await getGoogleConnectRuntime(
        (query, params = []) => loginPool.query(query, params),
        user.company_id
      );
      if (googleRuntime.ready && googleRuntime.config?.allowPasswordLogin === false) {
        return res.status(403).json({
          success: false,
          code: "GOOGLE_SSO_REQUIRED",
          message: "This company requires Google SSO. Use Continue with Google.",
        });
      }
    }

    stepStartedAt = Date.now();
    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );
    markLoginTiming("bcrypt_ms", stepStartedAt);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    stepStartedAt = Date.now();
    await loginPool.query(
      `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = $1
      `,
      [user.id]
    );
    markLoginTiming("last_login_update_ms", stepStartedAt);

    /*
     * Resolve the optional Platform Developer acting-company inside the login
     * request. Smart Theme previously performed two extra HTTP round trips
     * after authentication (developer/companies + acting-company), which kept
     * the login button stuck on "Signing in..." even though the password had
     * already been accepted.
     *
     * The requested company is never trusted directly: it is selected only
     * when an active developer-company mapping exists. If no remembered company
     * is valid and exactly one mapping exists, that single company is selected.
     */
    let actingCompanyId = null;
    if (user.is_platform_developer === true) {
      stepStartedAt = Date.now();
      const companyAccess = await pool.query(
        `SELECT c.id
           FROM companies c
           JOIN platform_developer_company_access a ON a.company_id=c.id
          WHERE a.developer_id=$1
            AND a.active=true
            AND c.active=true
          ORDER BY c.name`,
        [user.id]
      );
      markLoginTiming("acting_company_lookup_ms", stepStartedAt);
      const authorisedCompanyIds = companyAccess.rows.map((row) => String(row.id));
      if (requestedActingCompanyId && authorisedCompanyIds.includes(requestedActingCompanyId)) {
        actingCompanyId = requestedActingCompanyId;
      } else if (authorisedCompanyIds.length === 1) {
        actingCompanyId = authorisedCompanyIds[0];
      }
    }

    /*
     * Return the effective RBAC permission set with the login response so the
     * client can build its UI from one authenticated bootstrap. This avoids
     * every page re-fetching /auth/me/permissions. Runtime endpoints still
     * enforce authorization independently.
     */
    stepStartedAt = Date.now();
    const loginDb = (sql, params = []) => loginPool.query(sql, params);
    const rolePermissionResult = user.role_id
      ? await loginPool.query(
          `SELECT p.code
             FROM role_permissions rp
             JOIN permissions p ON p.id=rp.permission_id
            WHERE rp.role_id=$1`,
          [user.role_id]
        )
      : { rows: [] };
    const loginPermissionUser = {
      id: user.id,
      companyId: user.company_id || actingCompanyId || null,
    };
    const permissionSets = await loadEffectivePermissionSets(loginDb, loginPermissionUser);
    const effectivePermissions = [...new Set([
      ...rolePermissionResult.rows.map((row) => row.code),
      ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : []),
    ])];
    markLoginTiming("permissions_ms", stepStartedAt);

    const token = createToken(user);
    loginTimings.total_ms = Date.now() - loginStartedAt;
    console.log("onePOS: auth login timings", {
      ...loginTimings,
      platform_identity: isPlatformIdentity,
      platform_developer: user.is_platform_developer === true,
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
        isPlatformDeveloper: user.is_platform_developer === true,
      },
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name,
        role: user.role_name,
        companyId: user.company_id,
        storeId: user.store_id,
        isPlatformDeveloper: user.is_platform_developer === true,
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
     * Bootstrap only for a global profile holding platform.manage. This is an
     * RBAC check, not an identity/profile-name bypass.
     */
    if (!user.pin_hash && user.company_id == null && process.env.SUPERADMIN_BOOTSTRAP_PIN) {
      const platformAccess = user.role_id
        ? await db(
            "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='platform.manage' LIMIT 1",
            [user.role_id]
          )
        : { rows: [] };
      if (platformAccess.rows.length) {
        if (pin !== String(process.env.SUPERADMIN_BOOTSTRAP_PIN)) {
          return res.status(401).json({ success: false, message: "Incorrect PIN" });
        }
        const pinHash = await bcrypt.hash(pin, 12);
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
        u.is_platform_developer,
        u.must_change_password,
        r.name AS role_name
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
        companyId: user.company_id,
        storeId: user.store_id,
        isPlatformDeveloper: user.is_platform_developer === true,
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

app.get("/api/auth/me/permissions", authenticate, async (req, res) => {
  try {
    const isAdmin = await canViewCompanyCustomers(req.user, req);

    let permissions = req.user.roleId ? await getRolePermissionCodes(req.user.roleId, req) : [];
    const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
    permissions = [...new Set([...permissions, ...permissionSets.flatMap((set) => Array.isArray(set.system_permissions) ? set.system_permissions : [])])];

    const includeEntitlements = !["0", "false", "no"].includes(String(req.query?.includeEntitlements || "").toLowerCase());
    res.json({
      success: true,
      data: {
        isAdmin,
        isPlatformDeveloper: req.user?.isPlatformDeveloper === true,
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
}));

app.use("/api", createDashboardRouter({ authenticate, db }));
app.use("/api", createDashboardBuilderRouter({ authenticate, authorize, db, canAccessStore, writeAudit, hasPermission }));

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
app.use("/api", createSuperadminRouter({ authenticate, db, pool, tenantDatabaseRouter, env: process.env }));
app.use("/api", createPlatformRouter({ authenticate, authorize, db, pool, canViewCompanyCustomers }));
app.use("/api", createPlatformDeploymentsRouter({ authenticate, authorize, db, writeAudit }));
app.use("/api", createPlatformSecurityRouter({ authenticate, authorize, db }));
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
app.use("/api", createAccountLifecycleRouter({ authenticate, authorize, db }));

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

app.use("/api", createReturnsRouter({ authenticate, authorize, db, pool, createInventoryMovement, writeAudit, canonicalTransactionWriter: createCanonicalRelatedTransaction }));

app.use("/api", createAdminRouter({ authenticate, authorize, db, pool, canViewCompanyCustomers, hasCompanyAdminAccess, bcrypt, savePlatformRecord: saveDomainConfiguration }));

/*
|--------------------------------------------------------------------------
| STAFF ATTENDANCE (CLOCK IN / CLOCK OUT)
|--------------------------------------------------------------------------
|
| Attendance sessions are recorded against the EXISTING users / companies /
| stores (no separate employee identity). Clock in/out times and worked
| duration are always set server-side (NOW() + timestamp arithmetic) — the
| client never supplies them. Management visibility is gated by the
| attendance.view permission with the same admin/owner bypass everywhere
| else uses; records are company-scoped and store-restricted through the
| existing canViewCompanyCustomers / canAccessStore helpers.
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

app.use("/api", createReportsRouter({ authenticate, authorize, db, canAccessStore, canViewCompanyCustomers }));

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

app.get("/api/setup/database", async (req, res) => {
  try {
    if (!pool) {
      return res.status(500).json({
        success: false,
        message: "DATABASE_URL is not configured",
      });
    }

    await db(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(200) NOT NULL,
        legal_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
        timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/London',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

      CREATE TABLE IF NOT EXISTS stores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(50),
        address_line1 VARCHAR(255),
        address_line2 VARCHAR(255),
        city VARCHAR(100),
        postcode VARCHAR(30),
        phone VARCHAR(50),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS terminals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        terminal_number VARCHAR(50),
        device_identifier VARCHAR(255),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE roles ADD COLUMN IF NOT EXISTS api_key VARCHAR(100);
      WITH role_keys AS (
        SELECT id,company_id,
          COALESCE(NULLIF(TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(name),'[^a-z0-9]+','_','g')),''),'role') AS base_key,
          ROW_NUMBER() OVER (PARTITION BY company_id,COALESCE(NULLIF(TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(name),'[^a-z0-9]+','_','g')),''),'role') ORDER BY id) AS ordinal
        FROM roles WHERE api_key IS NULL
      )
      UPDATE roles r SET api_key=CASE WHEN k.ordinal=1 THEN LEFT(k.base_key,100)
        ELSE LEFT(k.base_key,80)||'_'||LEFT(REPLACE(r.id::text,'-',''),12) END
      FROM role_keys k WHERE r.id=k.id;
      CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_company_api_key ON roles(company_id,api_key) WHERE company_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
        role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(200) NOT NULL,
        email VARCHAR(255),
        pin_hash TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_developer BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE TABLE IF NOT EXISTS platform_developer_company_access (
        developer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (developer_id, company_id)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100),
        barcode VARCHAR(100),
        description TEXT,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20,
        stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
        low_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0,
        track_stock BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        loyalty_number VARCHAR(100),
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        store_id UUID NOT NULL REFERENCES stores(id),
        terminal_id UUID REFERENCES terminals(id),
        user_id UUID NOT NULL REFERENCES users(id),
        customer_id UUID REFERENCES customers(id),
        receipt_number VARCHAR(100),
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        offline_created BOOLEAN NOT NULL DEFAULT FALSE,
        sync_status VARCHAR(50) NOT NULL DEFAULT 'synced',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity NUMERIC(12,3) NOT NULL,
        unit_price NUMERIC(12,2) NOT NULL,
        discount NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        payment_method VARCHAR(50) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        provider VARCHAR(100),
        terminal_id VARCHAR(100),
        provider_transaction_id VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sale_id UUID NOT NULL REFERENCES sales(id),
        user_id UUID NOT NULL REFERENCES users(id),
        amount NUMERIC(12,2) NOT NULL,
        reason TEXT,
        payment_method VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS discounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        value NUMERIC(12,2) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        requires_permission BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS till_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        terminal_id UUID NOT NULL REFERENCES terminals(id),
        store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
        user_id UUID NOT NULL REFERENCES users(id),
        opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
        closing_cash NUMERIC(12,2),
        expected_cash NUMERIC(12,2),
        cash_difference NUMERIC(12,2),
        status VARCHAR(50) NOT NULL DEFAULT 'open',
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        closed_by UUID REFERENCES users(id) ON DELETE SET NULL
      );

        ALTER TABLE till_sessions
          ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
          ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id) ON DELETE SET NULL;

       CREATE TABLE IF NOT EXISTS cash_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        till_session_id UUID NOT NULL REFERENCES till_sessions(id),
        user_id UUID NOT NULL REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id UUID,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        key_hash TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        provider VARCHAR(100) NOT NULL,
        configuration JSONB,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const permissions = [
      ["sale.view", "View Sales"],
      ["sale.create", "Create Sale"],
      ["sale.edit", "Edit Sale"],
      ["sale.delete", "Delete / Void Sale"],
      ["sale.invoice.view", "View Invoices"],
      ["sale.invoice.reprint", "Reprint Invoice"],
      ["sale.discount", "Apply Discount"],
      ["sale.void_item", "Void Item"],
      ["sale.void", "Void Sale"],
      ["sale.refund", "Refund Sale"],
      ["sale.refund_without_receipt", "Refund Without Receipt"],
      ["sale.price_change", "Change Price"],
      ["sale.hold", "Hold Sale"],
      ["cash.open_drawer", "Open Cash Drawer"],
      ["cash.payout", "Cash Payout"],
      ["cash.adjustment", "Cash Adjustment"],
      ["till.open", "Open Till"],
      ["till.close", "Close Till"],
      ["product.view", "View Products"],
      ["product.create", "Create Product"],
      ["product.edit", "Edit Product"],
      ["product.delete", "Delete Product"],
      ["customer.view", "View Customers"],
      ["customer.create", "Create Customer"],
      ["customer.edit", "Edit Customer"],
      ["customer.delete", "Delete Customer"],
      ["purchase.view", "View Purchases"],
      ["purchase.create", "Create Purchase"],
      ["purchase.edit", "Edit Purchase"],
      ["purchase.delete", "Delete / Cancel Purchase"],
      ["inventory.view", "View Inventory"],
      ["inventory.movements.view", "View Stock Movements"],
      ["inventory.adjust", "Adjust Inventory"],
      ["inventory.replenishment.view", "View Replenishment Suggestions"],
      ["returns.view", "View Returns"],
      ["returns.create", "Create Returns"],
      ["returns.approve", "Approve / Process Returns"],
      ["reports.sales.view", "Sales Report"],
      ["reports.products.view", "Product Sales Report"],
      ["reports.customers.view", "Customer Report"],
      ["reports.inventory.view", "Inventory Overview"],
      ["reports.inventory_movements.view", "Stock Movement Ledger"],
      ["reports.low_stock.view", "Low Stock Report"],
      ["reports.payments.view", "Payments Report"],
      ["reports.purchases.view", "Purchase Report"],
      ["reports.returns.view", "Sales Returns Report"],
      ["reports.profit.view", "Profit Report"],
      ["reports.till.view", "Till Report"],
      ["reports.vat.view", "Tax / VAT Report"],
      ["reports.summary.view", "Reports Summary"],
      ["dashboard.view", "View Dashboards"],
      ["dashboard.create", "Create Dashboards"],
      ["dashboard.edit", "Edit Dashboards"],
      ["dashboard.manage", "Manage Dashboards"],
      ["dashboard.share", "Share Dashboards"],
      ["dashboard.assign_default", "Assign Default Dashboards"],
      ["report.export", "Export Reports"],
      ["user.manage", "Manage Users"],
      ["role.manage", "Manage Roles"],
      ["payment.manage", "Manage Payments"],
      ["integration.manage", "Manage Integrations"],
      ["settings.manage", "Manage Settings"],
      ["package.manage", "Manage Packages"],
      ["module.access.manage", "Manage Module Access"],
      ["online_orders.view", "View Online Orders"],
      ["online_orders.manage", "Manage Online Orders"],
      ["online_orders.configure", "Configure Online Platforms"],
    ];

    for (const [code, name] of permissions) {
      await db(
        `
        INSERT INTO permissions (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO NOTHING
        `,
        [code, name]
      );
    }

    res.json({
      success: true,
      message: "onePOS database initialized successfully",
    });
  } catch (error) {
    console.error("Database setup error:", error);

    res.status(500).json({
      success: false,
      message: "Database setup failed",
      error: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| Frontend ownership
|--------------------------------------------------------------------------
| The operational UI now lives in the smart-theme repository and is deployed
| separately. This service is API/backend only. Keep a small redirect for
| legacy browser entry points so old bookmarks do not depend on a duplicate
| frontend bundle in this repository.
*/
const SMART_THEME_URL = String(process.env.SMART_THEME_URL || "https://smart-theme.onrender.com").replace(/\/$/, "");

app.get(["/", "/login", "/app", "/app/*", "/customer-display"], (req, res) => {
  return res.redirect(302, SMART_THEME_URL);
});

/* Unknown API routes remain JSON; unknown browser routes also go to Smart Theme. */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: "API endpoint not found" });
  }
  return res.redirect(302, SMART_THEME_URL);
});

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

async function startServer() {
  try {
    const trustedRuntime = validateTrustedRuntime();
    const trustedPackages = validateTrustedPackageCatalogue();
    console.log(`OneEngine Trusted Runtime ${trustedRuntime.version.slice(0, 12)} (${trustedRuntime.count} capabilities; packages ${trustedPackages.digest.slice(0, 12)}/${trustedPackages.count})`);
    if (!pool) throw new Error("DATABASE_URL is not configured");
    console.log("onePOS: checking database connection...");
    await db("SELECT NOW()");
    await initializeDatabase(pool, { bootstrapSuperadmin: false });
    console.log("onePOS: core database ready");

    // Bind the HTTP listener as soon as the core schema is ready. Platform
    // metadata/bootstrap can take significantly longer on a cold Render start
    // and must not keep /api/auth/login unreachable during that work.
    console.log(`onePOS: binding HTTP listener on ${PORT}`);
    const server = app.listen(PORT, "0.0.0.0");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`HTTP listener did not bind on port ${PORT}`)), 10000);
      server.once("listening", () => {
        clearTimeout(timeout);
        resolve();
      });
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    console.log(`onePOS running on port ${PORT}`);

    // Complete the heavier idempotent platform bootstrap after the service is
    // already accepting requests. This preserves the existing startup work
    // while removing the long pre-listen delay seen on hosted cold starts.
    await initializePlatformMetadata(pool, { includeOperationalObjects: true });
    await initializeStandardObjectEcosystem(pool);
    await bootstrapInitialSuperadmin(pool);
    const developerRoleId = await ensureGlobalSystemProfile(pool, {
      name: "Developer",
      apiKey: "platform_developer",
      description: "Global platform developer profile. Access is granted through RBAC permissions.",
      grantAllPermissions: true,
    });
    if (process.env.PLATFORM_DEVELOPER_PASSWORD) {
      const developerHash = await bcrypt.hash(process.env.PLATFORM_DEVELOPER_PASSWORD, 12);
      await db(
        `INSERT INTO users (company_id,role_id,username,password_hash,full_name,email,is_platform_developer,active)
         VALUES (NULL,$2,'developer@onepos.local',$1,'Platform Developer','developer@onepos.local',true,true)
         ON CONFLICT (username) DO UPDATE SET role_id=$2,is_platform_developer=true,active=true,password_hash=EXCLUDED.password_hash`,
        [developerHash, developerRoleId]
      );
    }
    console.log("onePOS: platform bootstrap ready");

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
            if (job.kind === "PLATFORM_SCHEDULED_WORKFLOW" && failed?.status === "FAILED") {
              await failScheduledWorkflow({ db, payload: job.payload || {}, error: failed.last_error });
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
            if (job.kind === "WAIT") return;
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
              try {
                const transaction = await withPlatformTransaction({
                  pool,
                  handler: async (tx) => {
                    const outcome = await executeTenantReleaseUpgrade({
                      db: tx.query,
                      releaseId: payload.releaseId,
                      companyId: payload.companyId || job.company_id,
                      packageKey: payload.packageKey,
                      userId: payload.userId || null,
                    });
                    if (outcome.status === "FAILED") {
                      throw Object.assign(new Error("Package release upgrade failed"), {
                        code: "RELEASE_UPGRADE_FAILED",
                        retryable: true,
                      });
                    }
                    return outcome;
                  },
                });
                return transaction.result;
              } catch (error) {
                await db(
                  `UPDATE company_package_installations SET update_status='FAILED',update_error='Package release upgrade failed',updated_at=NOW()
                    WHERE company_id=$1 AND package_id=(SELECT id FROM package_registry WHERE package_key=$2)`,
                  [payload.companyId || job.company_id, payload.packageKey]
                );
                await writeAudit(payload.companyId || job.company_id, null, "release.tenant.failed", "package_release", payload.releaseId, {
                  packageKey: payload.packageKey,
                  errorCode: error?.code || "RELEASE_UPGRADE_FAILED",
                  transactionId: error?.transactionId || null,
                });
                throw error;
              }
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
                `SELECT id,name,object_id,action FROM platform_rules
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
                const actor = payload.actorUserId
                  ? (await db(
                      "SELECT id,company_id,store_id,role_id,is_superadmin FROM users WHERE id=$1 AND company_id=$2 AND active=true LIMIT 1",
                      [payload.actorUserId, companyId]
                    )).rows[0] || null
                  : null;
                if (payload.actorUserId && !actor) {
                  throw Object.assign(new Error("Scheduled workflow actor is no longer active"), { retryable: false, code: "RUNTIME_ACTOR_UNAVAILABLE" });
                }
                const executionMode = actor ? "USER" : "SYSTEM";
                const results = await executeWorkflowActions({
                  actions,
                  db,
                  req: {
                    method: "JOB",
                    path: "PLATFORM_SCHEDULED_WORKFLOW",
                    executionMode,
                    trustedSystemExecution: executionMode === "SYSTEM",
                    user: actor
                      ? { id: actor.id, companyId: actor.company_id, storeId: actor.store_id, roleId: actor.role_id, isSuperadmin: actor.is_superadmin === true }
                      : { companyId },
                  },
                  companyId,
                  userId: actor?.id || null,
                  executionMode,
                  trustedSystem: executionMode === "SYSTEM",
                  object: objectResult.rows[0] || null,
                  record: null,
                  recordId: null,
                  runId: run?.id || null,
                  workflowId: workflow.id,
                  trigger: { type: "scheduled", operation: "EXECUTE" },
                  source: { type: "JOB", capability: "PLATFORM_SCHEDULED_WORKFLOW" },
                  idempotencyKey: job.idempotency_key || null,
                });
                await db(
                  "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
                  [run.id, companyId]
                );
                await completeScheduledWorkflow({ db, payload });
                return { status: "COMPLETED", results };
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
              try {
                const actor = payload.actorUserId
                  ? (await db(
                      "SELECT id,company_id,store_id,role_id,is_superadmin FROM users WHERE id=$1 AND company_id=$2 AND active=true LIMIT 1",
                      [payload.actorUserId, job.company_id]
                    )).rows[0] || null
                  : null;
                if (payload.actorUserId && !actor) {
                  throw Object.assign(new Error("Event workflow actor is no longer active"), { retryable: false, code: "RUNTIME_ACTOR_UNAVAILABLE" });
                }
                const executionMode = actor ? "USER" : "SYSTEM";
                const results = await executeWorkflowActions({
                  actions,
                  db,
                  pool,
                  req: {
                    method: "JOB",
                    path: "PLATFORM_EVENT_WORKFLOW",
                    executionMode,
                    trustedSystemExecution: executionMode === "SYSTEM",
                    user: actor
                      ? { id: actor.id, companyId: actor.company_id, storeId: actor.store_id, roleId: actor.role_id, isSuperadmin: actor.is_superadmin === true }
                      : { companyId: job.company_id },
                    platformEvent: {
                      eventId: payload.eventId || null,
                      replayId: payload.replayId || null,
                      eventType: payload.eventType || workflow.trigger_key,
                      originType: payload.originType || null,
                      originId: payload.originId || null,
                      correlationId: payload.correlationId || null,
                      causationEventId: payload.causationEventId || null,
                      rootEventId: payload.rootEventId || payload.eventId || null,
                      hopCount: Number(payload.hopCount || 0),
                      eventSignature: payload.eventSignature || null,
                    },
                  },
                  companyId: job.company_id,
                  userId: actor?.id || null,
                  executionMode,
                  trustedSystem: executionMode === "SYSTEM",
                  object: objectResult.rows[0] || null,
                  record: payload.record || null,
                  recordId: payload.recordId || null,
                  runId: run?.id || null,
                  workflowId: workflow.id,
                  trigger: { type: payload.eventType || workflow.trigger_key, operation: "EVENT" },
                  source: { type: "JOB", capability: "PLATFORM_EVENT_WORKFLOW" },
                  channel: { type: "PLATFORM_EVENT", eventId: payload.eventId || null, eventType: payload.eventType || workflow.trigger_key },
                  idempotencyKey: job.idempotency_key || null,
                  writeAudit,
                  createInventoryMovement,
                });
                if (run?.id) {
                  await db(
                    "UPDATE platform_workflow_runs SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",
                    [run.id, job.company_id]
                  );
                }
                return { status: "COMPLETED", results };
              } catch (error) {
                if (run?.id) {
                  await db(
                    "UPDATE platform_workflow_runs SET status='FAILED',error_text=$1,completed_at=NOW(),updated_at=NOW() WHERE id=$2 AND company_id=$3",
                    [String(error?.message || error).slice(0, 2000), run.id, job.company_id]
                  );
                }
                throw error;
              }
            }
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
      } catch (error) {
        console.error("Platform job worker error:", error.message);
      } finally {
        draining = false;
      }
    };
    const workerTimer = workerEnabled ? setInterval(drain, 5000) : null;
    if (workerTimer?.unref) workerTimer.unref();
    const shutdown = () => {
      if (workerTimer) clearInterval(workerTimer);
      server.close(() => process.exit(0));
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  } catch (error) {
    console.error(
      "onePOS startup failed:",
      error
    );

    process.exit(1);
  }
}

startServer();
