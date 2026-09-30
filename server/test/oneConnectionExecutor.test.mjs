import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "oneconnection-executor-test-secret";

import { createConnectorActionExecutor } from "../services/connectorFramework.js";
import { encryptCredentials } from "../services/integrationCredentials.js";

test("generic integration endpoint executes through OneConnection credentials", async () => {
  const cipher = encryptCredentials({ apiKey: "secret-key", headerName: "X-Custom-Key" });
  const requests = [];

  const db = async (sql, params = []) => {
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "11111111-1111-1111-1111-111111111111",
          company_id: "22222222-2222-2222-2222-222222222222",
          name: "Generic API",
          base_url: "https://93.184.216.34",
          auth_type: "api_key",
          connector_definition_id: null,
          credential_id: "33333333-3333-3333-3333-333333333333",
          enabled: true,
          timeout_ms: 5000,
          retry_policy: { maxAttempts: 1 },
        }],
      };
    }
    if (sql.includes("SELECT * FROM platform_credentials")) {
      return {
        rows: [{
          id: "33333333-3333-3333-3333-333333333333",
          company_id: "22222222-2222-2222-2222-222222222222",
          connection_id: "11111111-1111-1111-1111-111111111111",
          ciphertext: cipher,
          metadata: {},
          active: true,
        }],
      };
    }
    if (sql.includes("FROM integration_endpoints")) {
      return {
        rows: [{
          id: "44444444-4444-4444-4444-444444444444",
          name: "send-order",
          method: "POST",
          path: "/orders",
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql} :: ${JSON.stringify(params)}`);
  };

  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ accepted: true }),
    };
  };

  const execute = createConnectorActionExecutor({
    db,
    fetchImpl,
    sleep: async () => {},
  });

  const result = await execute({
    companyId: "22222222-2222-2222-2222-222222222222",
    connectionId: "11111111-1111-1111-1111-111111111111",
    operation: "send-order",
    input: { orderId: "o1" },
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 200);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://93.184.216.34/orders");
  assert.equal(requests[0].options.headers["X-Custom-Key"], "secret-key");
  assert.equal(requests[0].options.body, JSON.stringify({ orderId: "o1" }));
  assert.deepEqual(result.data, { accepted: true });
});

test("absolute generic endpoint must stay on configured OneConnection origin", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM integration_connections c")) {
      return {
        rows: [{
          id: "11111111-1111-1111-1111-111111111111",
          company_id: "22222222-2222-2222-2222-222222222222",
          name: "Generic API",
          base_url: "https://93.184.216.34",
          auth_type: "none",
          connector_definition_id: null,
          enabled: true,
        }],
      };
    }
    if (sql.includes("FROM integration_endpoints")) {
      return {
        rows: [{
          id: "44444444-4444-4444-4444-444444444444",
          name: "bad-endpoint",
          method: "GET",
          path: "https://1.1.1.1/orders",
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const execute = createConnectorActionExecutor({
    db,
    fetchImpl: async () => { throw new Error("fetch should not run"); },
    sleep: async () => {},
  });

  await assert.rejects(
    () => execute({
      companyId: "22222222-2222-2222-2222-222222222222",
      connectionId: "11111111-1111-1111-1111-111111111111",
      operation: "bad-endpoint",
      input: {},
    }),
    /must match the configured base URL origin/,
  );
});
