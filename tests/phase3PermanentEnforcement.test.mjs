import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const absent = async (path) => assert.rejects(access(new URL("../" + path, import.meta.url)), /ENOENT/);

test("architecture audit has no runtime exemption mechanism", async () => {
  const audit = await read("scripts/audit-metadata-architecture.mjs");
  assert.match(audit, /const roots = \["server", "src"\]/);
  assert.equal(audit.includes("const exempt ="), false);
  assert.equal(audit.includes("declarativePrefixes"), false);
  assert.equal(audit.includes("legacyBusinessRuntime"), false);
  assert.match(audit, /runtimeExemptions:0/);
});

test("app surface audit uses package metadata and cannot pass with zero public apps", async () => {
  const audit = await read("scripts/audit-app-surfaces.mjs");
  assert.equal(audit.includes("internalAppCatalog"), false);
  assert.match(audit, /const definitions = packageDefinitions\(\)/);
  assert.match(audit, /publicApps\.length > 0/);
  assert.match(audit, /supportedRoutes\.add\('connector-settings'\)/);
});

test("tenant schema readiness is platform-neutral", async () => {
  const source = await read("server/services/tenantDatabase.js");
  assert.equal(source.includes("public.products"), false);
  assert.equal(source.includes("public.sales"), false);
  assert.match(source, /public\.schema_migrations/);
});

test("tenant seed contains no compiled business settings or provider demo data", async () => {
  const source = await read("server/database/oneSolutionsSeeder.js");
  for (const token of [
    "company_settings","vat_enabled","default_vat_rate","loyalty_enabled","scan_go_enabled",
    "exchange_mode","product_view","customer_display_enabled","online_ordering_enabled",
    "online_payment_methods","platform_communication_events","smsgate","WHATSAPP"
  ]) assert.equal(source.includes(token), false, token);
});

test("package metadata contains no retired communication aliases or retired frontend route", async () => {
  const source = await read("server/packages/packageManifestCatalog.js");
  assert.equal(source.includes("legacyActions"), false);
  for (const token of ["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION"]) {
    assert.equal(source.includes(token), false, token);
  }
  assert.equal(source.includes('route: "/app/global-products"'), false);
});

test("retired business runtime files remain absent", async () => {
  for (const path of [
    "server/routes/dashboard.js",
    "server/services/reportSalesDefinition.js",
    "src/pages/products/GlobalProductLookupPage.jsx",
    "src/components/online/OnlineOrderSummary.jsx",
  ]) await absent(path);
});

test("root production build includes server verification before Vite", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const build = String(pkg.scripts?.build || "");
  const serverBuild = build.indexOf("npm --prefix server run build");
  const vite = build.indexOf("vite build");
  assert.ok(serverBuild >= 0, "server build missing from root production build");
  assert.ok(vite > serverBuild, "Vite must run after server verification");
  assert.match(build, /phase3PermanentEnforcement\.test\.mjs/);
});


test("repository closure gate classifies every executable file and is required by build/CI", async () => {
  const classifier = await read("scripts/audit-repository-classification.mjs");
  const pkg = JSON.parse(await read("package.json"));
  const workflow = await read(".github/workflows/validate.yml");
  assert.match(classifier, /UNCLASSIFIED_EXECUTABLE/);
  assert.match(classifier, /repository-classification-audit\.json/);
  assert.match(classifier, /violationsRemaining/);
  assert.match(String(pkg.scripts?.build || ""), /audit-repository-classification\.mjs/);
  assert.match(workflow, /npm ls --all/);
  assert.match(workflow, /audit:repository-classification/);
  assert.match(workflow, /repository-closure-evidence/);
});
