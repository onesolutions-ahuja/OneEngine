import test from "node:test";
import assert from "node:assert/strict";

import { claimDueReportSubscriptions } from "../server/services/reportSubscriptionScheduler.js";

test("due report subscription enqueues one durable delivery occurrence", async () => {
  const calls=[];
  const db=async(sql,params)=>{
    calls.push({sql,params});
    if(sql.includes("FROM report_subscriptions")) return {rows:[{
      id:"11111111-1111-4111-8111-111111111111",
      company_id:"22222222-2222-4222-8222-222222222222",
      report_id:"33333333-3333-4333-8333-333333333333",
      user_id:"44444444-4444-4444-8444-444444444444",
      active:true,
      definition:{active:true,cadence:"DAILY",hour:9,minute:30,timezone:"UTC",delivery:["IN_APP"],condition:{type:"ALWAYS"}},
    }]};
    if(sql.includes("INSERT INTO platform_action_jobs")) return {rows:[{id:"job1",kind:"REPORT_SUBSCRIPTION_DELIVERY"}]};
    return {rows:[]};
  };
  const jobs=await claimDueReportSubscriptions({db,now:new Date("2026-10-02T09:30:20.000Z")});
  assert.equal(jobs.length,1);
  const insert=calls.find((call)=>call.sql.includes("INSERT INTO platform_action_jobs"));
  assert.match(String(insert?.params?.[4]||""),/report-subscription:11111111-1111-4111-8111-111111111111:2026-10-02T09:30/);
});

test("subscription outside its minute is not enqueued", async () => {
  let inserts=0;
  const db=async(sql)=>{
    if(sql.includes("FROM report_subscriptions")) return {rows:[{
      id:"11111111-1111-4111-8111-111111111111",
      company_id:"22222222-2222-4222-8222-222222222222",
      report_id:"33333333-3333-4333-8333-333333333333",
      user_id:"44444444-4444-4444-8444-444444444444",
      active:true,
      definition:{active:true,cadence:"DAILY",hour:9,minute:30,timezone:"UTC",delivery:["IN_APP"],condition:{type:"ALWAYS"}},
    }]};
    if(sql.includes("INSERT INTO platform_action_jobs")) inserts+=1;
    return {rows:[]};
  };
  const jobs=await claimDueReportSubscriptions({db,now:new Date("2026-10-02T09:31:00.000Z")});
  assert.equal(jobs.length,0);
  assert.equal(inserts,0);
});
