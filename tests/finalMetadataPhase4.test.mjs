import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sales=fs.readFileSync("server/routes/sales.js","utf8");
const till=fs.readFileSync("server/routes/till.js","utf8");
const platform=fs.readFileSync("server/routes/platform.js","utf8");

test("phase 4 legacy sale mutation engine is retired",()=>{
  assert.equal(sales.includes("INSERT INTO sales"),false);
  assert.equal(sales.includes("INSERT INTO sale_items"),false);
  assert.equal(sales.includes("INSERT INTO payments"),false);
  assert.equal(sales.includes("METADATA_ACTION_REQUIRED"),true);
});

test("phase 4 legacy till mutation engines are retired",()=>{
  for(const sql of ["INSERT INTO till_sessions","UPDATE till_sessions","INSERT INTO cash_movements"]) assert.equal(till.includes(sql),false,sql);
  assert.equal((till.match(/METADATA_ACTION_REQUIRED/g)||[]).length>=4,true);
});

test("phase 4 generic platform runtime owns canonical record writes",()=>{
  assert.equal(platform.includes('type === "record_save"'),true);
  assert.equal(platform.includes("executeCanonicalRecordWrite({ req, object, metadataFields, fields, input: values, action, recordId })"),true);
});

test("phase 4 business reads may remain while mutation orchestration is metadata-owned",()=>{
  assert.equal(sales.includes('router.get('),true);
  assert.equal(till.includes('router.get('),true);
});
