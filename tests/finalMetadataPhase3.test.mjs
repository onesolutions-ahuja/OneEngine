import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const customPage=fs.readFileSync("src/platform/pages/CustomPageRuntimePage.jsx","utf8");
const renderer=fs.readFileSync("src/components/platform/CustomPageRenderer.jsx","utf8");
const orderActions=fs.readFileSync("src/pages/online/useOnlineOrderActions.js","utf8");
const orderCard=fs.readFileSync("src/components/online/OnlineOrderCard.jsx","utf8");

test("phase 3 custom page behavior executes through generic interaction runtime",()=>{
  assert.equal(customPage.includes("/api/platform/runtime/page-interactions/execute"),true);
  assert.equal(customPage.includes('method:editing?"PUT":"POST"'),false);
});

test("phase 3 metadata renderer does not persist business records directly",()=>{
  assert.equal(/apiRequest\(\`\/api\/platform\/objects\//.test(renderer),false);
});

test("phase 3 online order lifecycle is metadata-button driven",()=>{
  assert.equal(orderActions.includes("/api/online/orders/"),false);
  assert.equal(orderActions.includes("/api/online/orders/generic/"),false);
  assert.equal(orderActions.includes("OTP_REQUIRED"),false);
  assert.equal(orderActions.includes("collectionVerificationRequired"),false);
  assert.equal(orderActions.includes("/buttons/"),true);
  assert.equal(orderCard.includes("onAction(order, button)"),true);
});

test("phase 3 UI has no hardcoded online-order action aliases",()=>{
  assert.equal(orderActions.includes('"cancel"'),false);
  assert.equal(orderActions.includes('"reject"'),false);
  assert.equal(orderActions.includes('"complete"'),false);
});
