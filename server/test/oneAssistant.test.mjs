import test from "node:test";
import assert from "node:assert/strict";
import { calculateAppointmentPayment, issueAppointmentPublicLink } from "../services/oneAssistant.js";

test("OneAssistant payment policy calculations",()=>{
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"NO_ADVANCE",deposit_value:20}),0);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"FIXED_DEPOSIT",deposit_value:20}),20);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"PERCENT_DEPOSIT",deposit_value:25}),25);
  assert.equal(calculateAppointmentPayment({price:100,payment_policy:"FULL_PAYMENT",deposit_value:20}),100);
  assert.equal(calculateAppointmentPayment({price:10,payment_policy:"FIXED_DEPOSIT",deposit_value:50}),10);
});


test("OneAssistant booking links default to 15 minutes", async()=>{
  const calls=[];
  const db=async(sql,params=[])=>{
    calls.push({sql,params});
    if(sql.includes("SELECT id FROM appointment_booking_cases")) return {rows:[{id:"case-1"}]};
    if(sql.includes("INSERT INTO appointment_public_links")) return {rows:[{id:"link-1",booking_case_id:"case-1",purpose:"BOOK_SLOT",expires_at:params[4]}]};
    if(sql.includes("UPDATE appointment_booking_cases")) return {rows:[]};
    throw new Error("Unexpected query: "+sql);
  };
  const before=Date.now();
  const link=await issueAppointmentPublicLink(db,{companyId:"company-1",bookingCaseId:"case-1",publicBaseUrl:"https://example.test"});
  const ttl=new Date(link.expires_at).getTime()-before;
  assert.ok(ttl>=14*60*1000 && ttl<=16*60*1000, `expected roughly 15 minutes, got ${ttl}ms`);
  assert.match(link.url,/^https:\/\/example\.test\/assistant\/book\//);
});
