import test from "node:test";
import assert from "node:assert/strict";
import { claimDuePlatformJobs, completePlatformJob, failPlatformJob } from "../services/platformJobs.js";

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
