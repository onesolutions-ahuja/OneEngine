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
  "./pages/settings/PaymentTerminalSettings",
  "./pages/settings/HardwareSettings",
  "./pages/settings/ConnectionsSettings",
  "./pages/settings/StoreTillSettingsPage",
  "./pages/settings/GoogleConnectSettings",
  "./pages/settings/ConnectorAppSettings",
  "./pages/settings/DeliverySettingsPage",
  "./pages/settings/WhatsAppAssistantSettings",
  "./pages/settings/AiAssistantSettings",
  "./pages/settings/SecurityIdentitySettings",
  "./pages/settings/MfaAdministrationSettings",
  "./pages/settings/SecurityGovernanceSettings",
  "./pages/settings/DataProtectionSettings",
  "./pages/superadmin/LicensingAdmin",
  "./pages/superadmin/AppReleasesAdmin",
];

test("phase 1 has no directly mounted business page modules",()=>{
  for(const path of BUSINESS_PAGE_IMPORTS) assert.equal(app.includes(path),false,path);
});

test("phase 1 routes business surfaces through metadata runtime",()=>{
  for(const key of ["till","kiosk","kiosk-display","global-product-lookup","dashboard","reports","audit-log","licensing","app-releases"]) {
    assert.equal(app.includes(`pageKey="${key}"`),true,key);
  }
  for(const key of ["integration","payment_terminal","hardware_configuration","store","terminal"]) {
    assert.equal(app.includes(`objectKey="${key}"`),true,key);
  }
});

test("metadata components never mutate business records directly",()=>{
  assert.equal(/apiRequest\(\`\/api\/platform\/objects\//.test(renderer),false);
  assert.equal(renderer.includes('method: "PUT", body: JSON.stringify({ data:'),false);
});
