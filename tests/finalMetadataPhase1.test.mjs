import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync("src/App.jsx","utf8");
const renderer=fs.readFileSync("src/components/platform/CustomPageRenderer.jsx","utf8");

const BUSINESS_PAGE_IMPORTS=[
  "./pages/till/TillPage",
  "./pages/till/CustomerDisplay",
  "./pages/kiosk/OneKioskPage",
  "./pages/kiosk/OneKioskDisplayPage",
  "./pages/products/GlobalProductLookupPage",
  "./pages/dashboard/DashboardPage",
  "./pages/reports/CustomReportsPage",
  "./pages/integrations/IntegrationsAdmin",
  "./pages/audit/AuditLogPage",
];

test("phase 1 has no directly mounted business page modules",()=>{
  for(const path of BUSINESS_PAGE_IMPORTS) assert.equal(app.includes(path),false,path);
});

test("phase 1 routes business surfaces through metadata runtime",()=>{
  assert.match(app,/MetadataPageRuntime/);
});

test("metadata components never mutate business records directly",()=>{
  assert.equal(/apiRequest\(\`\/api\/platform\/objects\//.test(renderer),false);
});
