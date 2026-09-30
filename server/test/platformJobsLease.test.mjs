import test from "node:test";
import assert from "node:assert/strict";
import { claimDuePlatformJobs, completePlatformJob, failPlatformJob, drainDuePlatformJobs } from "../services/platformJobs.js";

test("job claim includes stale RUNNING recovery and lease", async () => {
  let sql = "";
  let params = null;
  const db = async (query, values) => {
    sql = query;
    params = values;
    return { rows: [{ id: "j1", status: "RUNNING" }] };
  };
  const rows = await claimDuePlatformJobs({ db, limit: 5, leaseSeconds: 120 });
  assert.equal(rows.length, 1);
  assert.match(sql, /status='RUNNING'/);
  assert.match(sql, /locked_until <= NOW\(\)/);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.deepEqual(params, [5, 120]);
});

test("job completion clears its lease", async () => {
  let sql = "";
  const db = async (query) => {
    sql = query;
    return { rows: [] };
  };
  await completePlatformJob({ db, id: "j1" });
  assert.match(sql, /locked_until=NULL/);
});

test("job failure clears lease before retry", async () => {
  let sql = "";
  const db = async (query) => {
    sql = query;
    return { rows: [{ id: "j1", status: "PENDING" }] };
  };
  await failPlatformJob({ db, id: "j1", error: new Error("retry") });
  assert.match(sql, /locked_until=NULL/);
});


test("tenant concurrency governor defers excess claimed jobs instead of failing them", async () => {
  const updates = [];
  const jobs = Array.from({ length: 3 }, (_, index) => ({
    id: `j${index + 1}`,
    company_id: "c1",
    status: "RUNNING",
  }));
  const db = async (sql, params = []) => {
    if (sql.includes("WITH due AS")) return { rows: jobs };
    if (sql.includes("COUNT(*)::int AS running")) return { rows: [{ running: 9 }] };
    if (sql.includes("SET status='PENDING'") && sql.includes("tenant_concurrency_limit") === false) {
      updates.push({ sql, params });
      return { rows: [] };
    }
    if (sql.includes("SET status='COMPLETED'")) return { rows: [] };
    if (sql.includes("UPDATE platform_action_jobs SET status='PENDING'")) {
      updates.push({ sql, params });
      return { rows: [] };
    }
    return { rows: [] };
  };

  let handled = 0;
  const result = await drainDuePlatformJobs({
    db,
    limit: 3,
    handler: async () => {
      handled += 1;
      return { status: "COMPLETED" };
    },
  });

  assert.equal(handled, 1);
  assert.equal(result.filter((item) => item.deferred === true).length, 2);
  assert.equal(result.filter((item) => item.status === "COMPLETED").length, 1);
});
