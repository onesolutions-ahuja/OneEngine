import { getCompanyEntitlements, isPackageLicensed } from "./licensing.js";

export const GOOGLE_CONNECT_PACKAGE_KEY = "one_connect_google";

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function configFromRow(row) {
  const config = row?.connector_configuration && typeof row.connector_configuration === "object"
    ? row.connector_configuration
    : {};
  return {
    enabled: config.enabled === true,
    allowedDomain: String(config.allowedDomain || "").trim().toLowerCase(),
    allowPasswordLogin: config.allowPasswordLogin !== false,
    clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || ""),
    redirectUri: String(process.env.GOOGLE_REDIRECT_URI || "").trim(),
    credentialSource: "ENVIRONMENT",
  };
}

export async function getGoogleConnectRuntime(db, companyId) {
  if (!companyId) return { ready: false, licensed: false, installed: false, enabled: false, reason: "SSO_NOT_CONNECTED" };

  const packageResult = await db(
    `SELECT p.*, i.status AS installation_status, i.suspended_by_entitlement, i.deactivated_by_user
       FROM package_registry p
       LEFT JOIN company_package_installations i
         ON i.package_id=p.id AND i.company_id=$1
      WHERE p.package_key=$2 AND p.active=true
      LIMIT 1`,
    [companyId, GOOGLE_CONNECT_PACKAGE_KEY]
  );
  const packageRow = packageResult.rows[0] || null;
  if (!packageRow) return { ready: false, licensed: false, installed: false, enabled: false, reason: "SSO_NOT_CONNECTED" };

  const entitlements = await getCompanyEntitlements(db, companyId);
  const licensed = isPackageLicensed(entitlements, packageRow);
  const installed = packageRow.installation_status === "active"
    && packageRow.suspended_by_entitlement !== true
    && packageRow.deactivated_by_user !== true;

  const connectionResult = await db(
    `SELECT *
       FROM integration_connections
      WHERE company_id=$1 AND connector_package_key=$2
      ORDER BY updated_at DESC
      LIMIT 1`,
    [companyId, GOOGLE_CONNECT_PACKAGE_KEY]
  );
  const connection = connectionResult.rows[0] || null;
  const config = configFromRow(connection);
  const configured = Boolean(config.clientId && config.clientSecret && config.redirectUri);
  const enabled = connection?.enabled === true && config.enabled;
  const ready = Boolean(licensed && installed && enabled && configured);

  return {
    ready,
    licensed,
    installed,
    configured,
    enabled,
    reason: ready ? "READY" : "SSO_NOT_CONNECTED",
    package: packageRow,
    connection,
    config,
  };
}

export async function getGoogleConnectRuntimeForEmail(db, email) {
  const value = normalizedEmail(email);
  if (!value) return { ready: false, reason: "SSO_NOT_CONNECTED" };
  const userResult = await db(
    `SELECT id, company_id, active, email
       FROM users
      WHERE LOWER(BTRIM(email))=$1
      LIMIT 1`,
    [value]
  );
  const user = userResult.rows[0] || null;
  if (!user || user.active !== true || !user.company_id) {
    return { ready: false, reason: "SSO_NOT_CONNECTED" };
  }
  const runtime = await getGoogleConnectRuntime(db, user.company_id);
  return { ...runtime, user, companyId: user.company_id, requestedEmail: value };
}

export async function saveGoogleConnectConfiguration(db, companyId, userId, input = {}) {
  const current = await getGoogleConnectRuntime(db, companyId);
  if (!current.licensed || !current.installed) {
    const error = new Error("Google Connect licence is not available for this company");
    error.code = "FEATURE_NOT_LICENSED";
    throw error;
  }

  const allowedDomain = String(input.allowedDomain ?? current.config?.allowedDomain ?? "").trim().toLowerCase();
  const allowPasswordLogin = input.allowPasswordLogin !== false;
  const enabled = input.enabled === true;
  const configuration = { enabled, allowedDomain, allowPasswordLogin };
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);

  if (current.connection?.id) {
    await db(
      `UPDATE integration_connections
          SET name='Google Connect', provider_name='google', integration_type='identity',
              connector_package_key=$1, connector_configuration=$2::jsonb,
              credentials_encrypted=NULL, enabled=$3,
              connection_status=$4, last_error=NULL, updated_at=NOW()
        WHERE id=$5 AND company_id=$6`,
      [
        GOOGLE_CONNECT_PACKAGE_KEY,
        JSON.stringify(configuration),
        enabled,
        enabled && configured ? "CONFIGURED" : "NOT_CONNECTED",
        current.connection.id,
        companyId,
      ]
    );
  } else {
    await db(
      `INSERT INTO integration_connections
        (company_id,name,provider_name,integration_type,connector_package_key,
         connector_configuration,auth_type,credentials_encrypted,enabled,connection_status,created_by)
       VALUES ($1,'Google Connect','google','identity',$2,$3::jsonb,'none',NULL,$4,$5,$6)`,
      [
        companyId,
        GOOGLE_CONNECT_PACKAGE_KEY,
        JSON.stringify(configuration),
        enabled,
        enabled && configured ? "CONFIGURED" : "NOT_CONNECTED",
        userId || null,
      ]
    );
  }

  return getGoogleConnectRuntime(db, companyId);
}

export function publicGoogleConnectConfig(runtime) {
  return {
    packageKey: GOOGLE_CONNECT_PACKAGE_KEY,
    licensed: runtime?.licensed === true,
    installed: runtime?.installed === true,
    configured: runtime?.configured === true,
    enabled: runtime?.enabled === true,
    ready: runtime?.ready === true,
    credentialSource: "ENVIRONMENT",
    clientIdConfigured: Boolean(runtime?.config?.clientId),
    clientSecretConfigured: Boolean(runtime?.config?.clientSecret),
    redirectUriConfigured: Boolean(runtime?.config?.redirectUri),
    redirectUri: runtime?.config?.redirectUri || "",
    allowedDomain: runtime?.config?.allowedDomain || "",
    allowPasswordLogin: runtime?.config?.allowPasswordLogin !== false,
  };
}
