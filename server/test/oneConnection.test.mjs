import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "oneconnection-test-secret";

import {
  ONE_CONNECTION_AUTH_TYPES,
  buildOneConnectionAuthHeaders,
  publicOneConnection,
  resolveOneConnection,
  rotateOneConnectionOAuthTokens,
  saveOneConnectionCredential,
} from "../services/oneConnection.js";
import { encryptCredentials } from "../services/integrationCredentials.js";

test("OneConnection auth contract supports OAuth2 without exposing tokens", () => {
  assert.equal(ONE_CONNECTION_AUTH_TYPES.includes("oauth2"), true);
  assert.deepEqual(
    buildOneConnectionAuthHeaders("oauth2", { accessToken: "secret-token" }),
    { Authorization: "Bearer secret-token" },
  );

  const publicView = publicOneConnection({
    id: "c1",
    company_id: "co1",
    name: "OAuth connection",
    auth_type: "oauth2",
    credential_id: "cred1",
    enabled: true,
  });
  assert.equal(publicView.hasCredentials, true);
  assert.equal("secrets" in publicView, false);
  assert.equal(JSON.stringify(publicView).includes("secret-token"), false);
});

test("saving a connection credential writes encrypted vault data and links connection", async () => {
  const calls = [];
  const db = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id")) {
      return { rows: [{ id: "conn1", company_id: "co1", connector_definition_id: null }] };
    }
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id") && !sql.includes("LEFT JOIN platform_connector_definitions")) {
      return { rows: [{ id: "conn1", company_id: "co1", connector_definition_id: null }] };
    }
    if (sql.includes("SELECT id FROM platform_credentials")) return { rows: [] };
    if (sql.includes("INSERT INTO platform_credentials")) {
      return {
        rows: [{
          id: "cred1",
          company_id: "co1",
          connector_id: null,
          connection_id: "conn1",
          credential_key: "default",
          ciphertext: params[5],
          metadata: JSON.parse(params[6]),
          rotated_at: new Date().toISOString(),
        }],
      };
    }
    if (sql.includes("UPDATE integration_connections")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const credential = await saveOneConnectionCredential({
    db,
    companyId: "co1",
    connectionId: "conn1",
    secrets: { apiKey: "top-secret" },
    userId: "u1",
  });

  assert.equal(credential.id, "cred1");
  const insert = calls.find((call) => call.sql.includes("INSERT INTO platform_credentials"));
  assert.ok(insert);
  assert.equal(String(insert.params[5]).includes("top-secret"), false);
  const link = calls.find((call) => call.sql.includes("SET credential_id=$1"));
  assert.deepEqual(link.params.slice(0, 3), ["cred1", "conn1", "co1"]);
});

test("legacy encrypted credentials migrate lazily into the connection credential vault", async () => {
  const legacyCipher = encryptCredentials({ token: "legacy-token" });
  let linkedCredentialId = null;
  let insertedCredential = null;

  const db = async (sql, params = []) => {
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "conn1",
          company_id: "co1",
          name: "Legacy",
          auth_type: "bearer",
          credentials_encrypted: legacyCipher,
          credential_id: linkedCredentialId,
          connector_definition_id: null,
          enabled: true,
        }],
      };
    }
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id") && !sql.includes("LEFT JOIN platform_connector_definitions")) {
      return { rows: [{ id: "conn1", company_id: "co1", connector_definition_id: null }] };
    }
    if (sql.includes("SELECT id FROM platform_credentials")) return { rows: [] };
    if (sql.includes("INSERT INTO platform_credentials")) {
      insertedCredential = {
        id: "cred-new",
        company_id: "co1",
        connector_id: null,
        connection_id: "conn1",
        ciphertext: params[5],
        metadata: JSON.parse(params[6]),
      };
      return { rows: [insertedCredential] };
    }
    if (sql.includes("UPDATE integration_connections")) {
      linkedCredentialId = params[0];
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const loaded = await resolveOneConnection({
    db,
    companyId: "co1",
    connectionId: "conn1",
    includeSecrets: true,
    migrateLegacy: true,
  });

  assert.equal(loaded.secrets.token, "legacy-token");
  assert.equal(linkedCredentialId, "cred-new");
  assert.equal(insertedCredential.metadata.migratedFrom, "integration_connections.credentials_encrypted");
});

test("definition-backed connection inherits definition auth when row remains none", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "conn1",
          company_id: "co1",
          name: "Defined",
          auth_type: "none",
          connector_definition_id: "def1",
          definition_auth_type: "api_key",
          definition_status: "ACTIVE",
          definition_base_url: "https://example.com",
          enabled: true,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const loaded = await resolveOneConnection({
    db,
    companyId: "co1",
    connectionId: "conn1",
  });
  assert.equal(loaded.connection.effective_auth_type, "api_key");
  assert.equal(loaded.connection.effective_base_url, "https://example.com");
});

test("OAuth token rotation preserves refresh token and moves connection to connected", async () => {
  const existingSecrets = {
    accessToken: "old-access",
    refreshToken: "stable-refresh",
  };
  const vaultCipher = encryptCredentials(existingSecrets);
  const calls = [];

  const db = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "conn1",
          company_id: "co1",
          name: "OAuth",
          auth_type: "oauth2",
          connector_definition_id: null,
          credential_id: "cred1",
          enabled: true,
        }],
      };
    }
    if (sql.includes("SELECT * FROM platform_credentials") && sql.includes("id=$1")) {
      return {
        rows: [{
          id: "cred1",
          company_id: "co1",
          connection_id: "conn1",
          connector_id: null,
          credential_key: "default",
          ciphertext: vaultCipher,
          metadata: {},
          active: true,
        }],
      };
    }
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id") && !sql.includes("LEFT JOIN platform_connector_definitions")) {
      return { rows: [{ id: "conn1", company_id: "co1", connector_definition_id: null }] };
    }
    if (sql.includes("SELECT id FROM platform_credentials")) {
      return { rows: [{ id: "cred1" }] };
    }
    if (sql.includes("UPDATE platform_credentials")) {
      return {
        rows: [{
          id: "cred1",
          company_id: "co1",
          connection_id: "conn1",
          ciphertext: params[2],
          metadata: JSON.parse(params[3]),
          rotated_at: new Date().toISOString(),
        }],
      };
    }
    if (sql.includes("UPDATE integration_connections")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await rotateOneConnectionOAuthTokens({
    db,
    companyId: "co1",
    connectionId: "conn1",
    accessToken: "new-access",
    expiresAt: "2030-01-01T00:00:00.000Z",
  });

  const credentialUpdate = calls.find((call) => call.sql.includes("UPDATE platform_credentials"));
  assert.ok(credentialUpdate);
  const { decryptCredentials } = await import("../services/integrationCredentials.js");
  const rotated = decryptCredentials(credentialUpdate.params[2]);
  assert.equal(rotated.accessToken, "new-access");
  assert.equal(rotated.refreshToken, "stable-refresh");
  assert.equal(rotated.tokenExpiry, "2030-01-01T00:00:00.000Z");
});

test("basic and api-key auth headers use canonical secret aliases", () => {
  assert.deepEqual(
    buildOneConnectionAuthHeaders("api_key", { api_key: "k1", header_name: "X-Custom-Key" }),
    { "X-Custom-Key": "k1" },
  );
  assert.deepEqual(
    buildOneConnectionAuthHeaders("basic", { username: "user", password: "pass" }),
    { Authorization: `Basic ${Buffer.from("user:pass").toString("base64")}` },
  );
});


test("credential save rejects a connection outside the company", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id")) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await assert.rejects(
    () => saveOneConnectionCredential({
      db,
      companyId: "co1",
      connectionId: "other-company-connection",
      secrets: { token: "secret" },
    }),
    (error) => error.code === "ONECONNECTION_CONNECTION_NOT_FOUND" && error.status === 404,
  );
});

test("credential save rejects connector mismatch", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM integration_connections") && sql.includes("connector_definition_id")) {
      return { rows: [{ id: "conn1", company_id: "co1", connector_definition_id: "def-a" }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await assert.rejects(
    () => saveOneConnectionCredential({
      db,
      companyId: "co1",
      connectionId: "conn1",
      connectorId: "def-b",
      secrets: { token: "secret" },
    }),
    (error) => error.code === "ONECONNECTION_CONNECTOR_MISMATCH" && error.status === 409,
  );
});

test("credential resolution scopes linked credentials to the connection connector", async () => {
  let credentialParams = null;
  const db = async (sql, params = []) => {
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "conn1",
          company_id: "co1",
          connector_definition_id: "def-a",
          definition_status: "ACTIVE",
          auth_type: "bearer",
          credential_id: "cred1",
          enabled: true,
        }],
      };
    }
    if (sql.includes("SELECT * FROM platform_credentials") && sql.includes("id=$1")) {
      credentialParams = params;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const loaded = await resolveOneConnection({
    db,
    companyId: "co1",
    connectionId: "conn1",
    includeSecrets: true,
  });

  assert.equal(loaded.credential, null);
  assert.deepEqual(loaded.secrets, {});
  assert.equal(credentialParams[4], "def-a");
});
