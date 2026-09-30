import { decryptCredentials, encryptCredentials } from "./integrationCredentials.js";

export const ONE_CONNECTION_AUTH_TYPES = Object.freeze(["none","api_key","bearer","basic","oauth2"]);

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function credentialMetadata(secrets = {}, extra = {}) {
  return {
    ...extra,
    fieldNames: Object.keys(secrets || {}),
    tokenExpiresAt: secrets?.tokenExpiry || secrets?.token_expiry || secrets?.expiresAt || secrets?.expires_at || null,
  };
}

export function publicOneConnection(row, credential = null) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    storeId: row.store_id || null,
    tillId: row.till_id || null,
    name: row.name,
    providerName: row.provider_name || null,
    connectorDefinitionId: row.connector_definition_id || null,
    connectorPackageKey: row.connector_package_key || null,
    baseUrl: row.effective_base_url || row.base_url || null,
    authType: row.effective_auth_type || row.auth_type || "none",
    credentialId: row.credential_id || credential?.id || null,
    hasCredentials: Boolean(row.credential_id || row.credentials_encrypted || credential),
    configuration: parseJson(row.connector_configuration, {}),
    capabilities: parseJson(row.connector_capabilities, []),
    timeoutMs: Number(row.connection_timeout_ms || row.timeout_ms || row.definition_timeout_ms || 15000),
    retryPolicy: parseJson(row.connection_retry_policy || row.retry_policy || row.definition_retry_policy, {}),
    enabled: row.enabled !== false,
    status: row.connection_status || "NOT_CONNECTED",
    lastConnectedAt: row.last_connected_at || null,
    lastError: row.last_error || null,
    providerAccountId: row.provider_account_id || null,
  };
}

export async function saveOneConnectionCredential({
  db,
  companyId,
  connectionId,
  connectorId = null,
  credentialKey = "default",
  name = "Connection credential",
  secrets,
  userId = null,
  metadata = {},
}) {
  if (!db || !companyId || !connectionId) throw new Error("db, companyId and connectionId are required");
  if (!secrets || typeof secrets !== "object" || Array.isArray(secrets)) throw new Error("secrets must be an object");
  const ciphertext = encryptCredentials(secrets);
  const safeMetadata = credentialMetadata(secrets, metadata);
  const existing = await db(
    `SELECT id FROM platform_credentials
      WHERE company_id=$1 AND connection_id=$2 AND credential_key=$3
      LIMIT 1`,
    [companyId, connectionId, credentialKey]
  );
  const result = existing.rows?.[0]
    ? await db(
        `UPDATE platform_credentials
            SET connector_id=$1,name=$2,ciphertext=$3,metadata=$4::jsonb,active=TRUE,
                rotated_at=NOW(),updated_at=NOW()
          WHERE id=$5 AND company_id=$6
          RETURNING *`,
        [connectorId, name, ciphertext, JSON.stringify(safeMetadata), existing.rows[0].id, companyId]
      )
    : await db(
        `INSERT INTO platform_credentials
          (company_id,connector_id,connection_id,credential_key,name,ciphertext,metadata,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         RETURNING *`,
        [companyId, connectorId, connectionId, credentialKey, name, ciphertext, JSON.stringify(safeMetadata), userId]
      );
  const credential = result.rows?.[0] || null;
  if (credential?.id) {
    await db(
      `UPDATE integration_connections
          SET credential_id=$1,credentials_encrypted=NULL,updated_at=NOW()
        WHERE id=$2 AND company_id=$3`,
      [credential.id, connectionId, companyId]
    );
  }
  return credential;
}

export async function resolveOneConnection({
  db,
  companyId,
  connectionId,
  includeSecrets = false,
  migrateLegacy = true,
  actorUserId = null,
}) {
  if (!db || !companyId || !connectionId) throw new Error("db, companyId and connectionId are required");
  const result = await db(
    `SELECT c.*,
            d.connector_key,d.base_url AS definition_base_url,d.auth_type AS definition_auth_type,
            d.timeout_ms AS definition_timeout_ms,d.retry_policy AS definition_retry_policy,
            d.operations,d.status AS definition_status
       FROM integration_connections c
       LEFT JOIN platform_connector_definitions d ON d.id=c.connector_definition_id
      WHERE c.id=$1 AND c.company_id=$2
      LIMIT 1`,
    [connectionId, companyId]
  );
  let row = result.rows?.[0] || null;
  if (!row) return null;
  if (row.connector_definition_id && row.definition_status && row.definition_status !== "ACTIVE") return null;

  let credentialRow = null;
  let secrets = null;
  if (row.credential_id) {
    const credential = await db(
      `SELECT * FROM platform_credentials
        WHERE id=$1 AND company_id=$2 AND active=TRUE
          AND (connection_id=$3 OR connection_id IS NULL)
        LIMIT 1`,
      [row.credential_id, companyId, connectionId]
    );
    credentialRow = credential.rows?.[0] || null;
    if (credentialRow) secrets = decryptCredentials(credentialRow.ciphertext);
  } else if (row.credentials_encrypted) {
    secrets = decryptCredentials(row.credentials_encrypted);
    if (migrateLegacy && secrets) {
      credentialRow = await saveOneConnectionCredential({
        db,
        companyId,
        connectionId,
        connectorId: row.connector_definition_id || null,
        credentialKey: "default",
        name: `${row.name || row.provider_name || "Connection"} credential`,
        secrets,
        userId: actorUserId,
        metadata: { migratedFrom: "integration_connections.credentials_encrypted" },
      });
      if (credentialRow?.id) row = { ...row, credential_id: credentialRow.id, credentials_encrypted: null };
    }
  }

  const effectiveBaseUrl = row.base_url || row.definition_base_url || null;
  const effectiveAuthType = String(
    row.connector_definition_id && String(row.auth_type || "none").toLowerCase() === "none" && row.definition_auth_type
      ? row.definition_auth_type
      : (row.auth_type || row.definition_auth_type || "none")
  ).toLowerCase();
  if (!ONE_CONNECTION_AUTH_TYPES.includes(effectiveAuthType)) throw new Error("Unsupported OneConnection auth type");

  const connection = {
    ...row,
    effective_base_url: effectiveBaseUrl,
    effective_auth_type: effectiveAuthType,
  };
  return {
    connection,
    public: publicOneConnection(connection, credentialRow),
    credential: credentialRow
      ? {
          id: credentialRow.id,
          metadata: parseJson(credentialRow.metadata, {}),
          rotatedAt: credentialRow.rotated_at,
        }
      : null,
    secrets: includeSecrets ? (secrets || {}) : undefined,
  };
}

export async function rotateOneConnectionOAuthTokens({
  db,
  companyId,
  connectionId,
  accessToken,
  refreshToken = undefined,
  expiresAt = null,
  tokenType = "Bearer",
  scope = null,
  actorUserId = null,
}) {
  const loaded = await resolveOneConnection({ db, companyId, connectionId, includeSecrets: true, actorUserId });
  if (!loaded) throw new Error("Connection not found");
  const current = loaded.secrets || {};
  const next = {
    ...current,
    accessToken,
    access_token: accessToken,
    token: accessToken,
    tokenType,
    token_type: tokenType,
    ...(refreshToken === undefined ? {} : { refreshToken, refresh_token: refreshToken }),
    ...(expiresAt ? { tokenExpiry: expiresAt, token_expiry: expiresAt } : {}),
    ...(scope ? { scope } : {}),
  };
  const credential = await saveOneConnectionCredential({
    db,
    companyId,
    connectionId,
    connectorId: loaded.connection.connector_definition_id || null,
    credentialKey: "default",
    name: `${loaded.connection.name || "Connection"} credential`,
    secrets: next,
    userId: actorUserId,
    metadata: { authType: "oauth2", tokenRotated: true },
  });
  await db(
    `UPDATE integration_connections
        SET auth_type='oauth2',connection_status='CONNECTED',last_connected_at=NOW(),last_error=NULL,updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [connectionId, companyId]
  );
  return credential;
}

export function buildOneConnectionAuthHeaders(authType, secrets = {}) {
  const type = String(authType || "none").toLowerCase();
  if (type === "none") return {};
  if (type === "bearer" || type === "oauth2") {
    const token = secrets.accessToken || secrets.access_token || secrets.token;
    if (!token) throw new Error(`${type} access token is missing`);
    return { Authorization: `Bearer ${token}` };
  }
  if (type === "basic") {
    if (secrets.username == null || secrets.password == null) throw new Error("Basic auth credentials are incomplete");
    return { Authorization: `Basic ${Buffer.from(`${secrets.username}:${secrets.password}`).toString("base64")}` };
  }
  if (type === "api_key") {
    const key = secrets.apiKey ?? secrets.api_key ?? secrets.key;
    if (!key) throw new Error("API key is missing");
    return { [secrets.headerName || secrets.header_name || "X-API-Key"]: String(key) };
  }
  throw new Error("Unsupported OneConnection auth type");
}


export async function clearOneConnectionCredential({ db, companyId, connectionId }) {
  if (!db || !companyId || !connectionId) throw new Error("db, companyId and connectionId are required");
  await db(
    `UPDATE platform_credentials
        SET active=FALSE,updated_at=NOW()
      WHERE company_id=$1 AND connection_id=$2 AND active=TRUE`,
    [companyId, connectionId]
  );
  await db(
    `UPDATE integration_connections
        SET credential_id=NULL,credentials_encrypted=NULL,updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [connectionId, companyId]
  );
}
