import test from "node:test";
import assert from "node:assert/strict";

import {
  createRequestAwarePool,
  createRequestDatabaseMiddleware,
} from "../services/tenantDatabase.js";

test("request-aware pool uses tenant pool inside authenticated request context", async () => {
  const calls = [];
  const sharedPool = {
    query: async (...args) => { calls.push(["shared", ...args]); return { rows: [{ source: "shared" }] }; },
    connect: async () => ({ source: "shared-client" }),
  };
  const tenantPool = {
    query: async (...args) => { calls.push(["tenant", ...args]); return { rows: [{ source: "tenant" }] }; },
    connect: async () => ({ source: "tenant-client" }),
  };
  const proxy = createRequestAwarePool(sharedPool);
  const middleware = createRequestDatabaseMiddleware({
    router: {
      resolveForCompany: async (companyId) => ({
        companyId,
        mode: "CUSTOMER_MANAGED",
        pool: tenantPool,
        config: {},
      }),
    },
  });

  await new Promise((resolve, reject) => {
    const req = { user: { companyId: "company-1" } };
    const res = {};
    middleware(req, res, async (error) => {
      if (error) return reject(error);
      try {
        const queryResult = await proxy.query("SELECT 1");
        const client = await proxy.connect();
        assert.equal(queryResult.rows[0].source, "tenant");
        assert.equal(client.source, "tenant-client");
        assert.equal(req.tenantPool, tenantPool);
        resolve();
      } catch (err) {
        reject(err);
      }
    }).catch(reject);
  });

  assert.equal(calls.some(([source]) => source === "shared"), false);
  assert.equal(calls.some(([source]) => source === "tenant"), true);
});

test("request-aware pool falls back to shared pool outside request context", async () => {
  const sharedPool = {
    query: async () => ({ rows: [{ source: "shared" }] }),
    connect: async () => ({ source: "shared-client" }),
  };
  const proxy = createRequestAwarePool(sharedPool);
  assert.equal((await proxy.query("SELECT 1")).rows[0].source, "shared");
  assert.equal((await proxy.connect()).source, "shared-client");
});
