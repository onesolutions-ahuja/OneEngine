import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDashboardSubscription } from "../server/services/analyticsManagement.js";
import { claimDueDashboardSubscriptions } from "../server/services/dashboardSubscriptionScheduler.js";
import { assertDashboardSubscriptionCompatible } from "../server/services/dashboardSubscriptionCompatibility.js";

test("dashboard subscription contract forces email-only delivery", () => {
  const subscription = normalizeDashboardSubscription({
    cadence: "weekly",
    weekday: 2,
    hour: 9,
    minute: 15,
    timezone: "Europe/London",
    delivery: ["IN_APP"],
    recipientPrincipals: [{ principalType:"USER", principalId:"11111111-1111-4111-8111-111111111111" }],
  });
  assert.deepEqual(subscription.delivery, ["EMAIL"]);
  assert.equal(subscription.cadence, "WEEKLY");
  assert.equal(subscription.recipientPrincipals.length, 1);
});

test("dynamic dashboard subscriptions are rejected", async () => {
  await assert.rejects(
    () => assertDashboardSubscriptionCompatible(async()=>({rows:[]}), {
      company_id:"22222222-2222-4222-8222-222222222222",
      run_as_mode:"VIEWER",
      components:[],
    }),
    /Dynamic dashboards cannot be subscribed/,
  );
});

test("field-to-field source reports are rejected", async () => {
  await assert.rejects(
    () => assertDashboardSubscriptionCompatible(async()=>({rows:[]}), {
      company_id:"22222222-2222-4222-8222-222222222222",
      run_as_mode:"FIXED_USER",
      components:[{config:{report:{filters:[{field:"amount",operator:"gte_field",compareField:"target"}]}}}],
    }),
    /field-to-field filters/,
  );
});

test("due static dashboard subscription enqueues one durable occurrence", async () => {
  const calls=[];
  const db=async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes("FROM dashboard_subscriptions")) return {rows:[{
      id:"11111111-1111-4111-8111-111111111111",
      company_id:"22222222-2222-4222-8222-222222222222",
      dashboard_id:"33333333-3333-4333-8333-333333333333",
      user_id:"44444444-4444-4444-8444-444444444444",
      active:true,
      run_as_mode:"FIXED_USER",
      definition:{active:true,cadence:"DAILY",hour:9,minute:30,timezone:"UTC",recipientPrincipals:[]},
    }]};
    if(sql.includes("INSERT INTO platform_action_jobs")) return {rows:[{id:"job1",kind:"DASHBOARD_SUBSCRIPTION_DELIVERY"}]};
    return {rows:[]};
  };
  const jobs=await claimDueDashboardSubscriptions({db,now:new Date("2026-10-02T09:30:10.000Z")});
  assert.equal(jobs.length,1);
  const insert=calls.find((call)=>call.sql.includes("INSERT INTO platform_action_jobs"));
  assert.match(String(insert?.params?.[4]||""),/dashboard-subscription:11111111-1111-4111-8111-111111111111:2026-10-02T09:30/);
});

test("dynamic dashboard is never queued even when schedule is due", async () => {
  let inserts=0;
  const db=async(sql)=>{
    if(sql.includes("FROM dashboard_subscriptions")) return {rows:[{
      id:"11111111-1111-4111-8111-111111111111",
      company_id:"22222222-2222-4222-8222-222222222222",
      dashboard_id:"33333333-3333-4333-8333-333333333333",
      user_id:"44444444-4444-4444-8444-444444444444",
      active:true,
      run_as_mode:"VIEWER",
      definition:{active:true,cadence:"DAILY",hour:9,minute:30,timezone:"UTC",recipientPrincipals:[]},
    }]};
    if(sql.includes("INSERT INTO platform_action_jobs")) inserts+=1;
    return {rows:[]};
  };
  const jobs=await claimDueDashboardSubscriptions({db,now:new Date("2026-10-02T09:30:10.000Z")});
  assert.equal(jobs.length,0);
  assert.equal(inserts,0);
});
