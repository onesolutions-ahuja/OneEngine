import test from "node:test";
import assert from "node:assert/strict";

import {
  filterReportSubscriptionRecipientsByAccess,
  loadReportSubscriptionExecutionUser,
  resolveReportSubscriptionRecipients,
} from "../server/services/reportSubscriptionDelivery.js";

test("subscription running user must be active in the same tenant", async () => {
  const db = async (_sql, params) => ({ rows: params[0] === "u1" && params[1] === "c1" ? [{ id:"u1", company_id:"c1", active:true }] : [] });
  assert.equal((await loadReportSubscriptionExecutionUser(db,{companyId:"c1",ownerUserId:"u1"})).id,"u1");
  await assert.rejects(()=>loadReportSubscriptionExecutionUser(db,{companyId:"c2",ownerUserId:"u1"}),/unavailable/);
});

test("subscription recipient users and roles resolve to active tenant users", async () => {
  const db = async (sql) => {
    if (sql.includes("AND (u.id=ANY")) return { rows:[{id:"u1",company_id:"c1",role_id:"r1",active:true},{id:"u2",company_id:"c1",role_id:"r2",active:true}] };
    return { rows:[] };
  };
  const users=await resolveReportSubscriptionRecipients(db,{companyId:"c1",principals:[{principalType:"USER",principalId:"u1"},{principalType:"ROLE",principalId:"r2"}]});
  assert.deepEqual(users.map((user)=>user.id),["u1","u2"]);
});

test("subscription recipients without report access are removed", async () => {
  const users=[{id:"u1"},{id:"u2"}];
  const allowed=await filterReportSubscriptionRecipientsByAccess(users,async(user)=>user.id==="u2");
  assert.deepEqual(allowed.map((user)=>user.id),["u2"]);
});
