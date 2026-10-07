import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read=(path)=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("database bootstrap is no longer exempt from metadata architecture audit",async()=>{
 const audit=await read("scripts/audit-metadata-architecture.mjs");
 const historical=audit.slice(audit.indexOf("const historicalMigrationFiles"),audit.indexOf("const declarativeMetadataFiles"));
 assert.equal(historical.includes("server/database/init.js"),false);
});

test("database bootstrap performs no direct business-record mutation",async()=>{
 const source=await read("server/database/init.js");
 const direct=/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:sales|sale_ledger|sale_items|customers|payments|products|suppliers|purchases|purchase_ledger|purchase_items|purchase_receipts|refunds|sales_orders|sales_order_items|supplier_invoices|supplier_payments|supplier_payment_allocations|stock_returns|stock_return_items)\b/i;
 assert.equal(direct.test(source),false);
});

test("generic server does not directly instantiate provider connector drivers",async()=>{
 const source=await read("server/server.js");
 for(const token of ["createReferencePaymentDriver","createSmsGateDriver","createBrevoDriver","createMailjetDriver"]) assert.equal(source.includes(token),false,token);
});
