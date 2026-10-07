import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

const absent = async (path) => {
  await assert.rejects(access(new URL("../" + path, import.meta.url)), /ENOENT/);
};

test("Phase 1 retired backend authorities stay deleted", async () => {
  for (const path of [
    "server/services/platformMetadata.js",
    "server/services/platformActions.js",
    "server/services/invoiceDelivery.js",
    "server/services/receiptQr.js",
    "server/utils/invoicePdf.js",
    "server/utils/invoiceHtml.js",
    "server/routes/settings.js",
    "server/routes/smsGateWebhooks.js",
    "server/database/secure_invoice_links.sql",
  ]) await absent(path);
});

test("Phase 1 server core contains no provider-specific connector/job wiring", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  for (const token of [
    "createReferencePaymentDriver","createSmsGateDriver","createBrevoDriver","createMailjetDriver",
    "configureSmsGateInboundWebhook","getSmsGateDiagnostics",
    "SHOPIFY_PROVIDER_SYNC","SHOPIFY_WEBHOOK_EVENT","SHOPIFY_PROCESS_WEBHOOK",
    "/api/shopify/webhooks","/api/smsgate/webhook"
  ]) assert.equal(server.includes(token), false, token);
  assert.match(server, /loadConnectorDriversFromMetadata/);
});

test("Phase 1 settings and lifecycle routes contain no hardcoded settings authority", async () => {
  const settings = await readFile(new URL("../src/services/settings.js", import.meta.url), "utf8");
  const lifecycle = await readFile(new URL("../server/routes/accountLifecycle.js", import.meta.url), "utf8");
  const admin = await readFile(new URL("../server/routes/admin.js", import.meta.url), "utf8");
  assert.equal(settings.includes("/api/settings"), false);
  assert.equal(lifecycle.includes("/settings/account-policy"), false);
  assert.equal(lifecycle.includes("company_settings"), false);
  assert.equal(admin.includes("company_settings"), false);
});

test("Phase 1 package bootstrap and connector drivers are metadata-driven", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  const loader = await readFile(new URL("../server/services/connectorDriverLoader.js", import.meta.url), "utf8");
  assert.match(registry, /bootstrapFoundation/);
  assert.equal(registry.includes('packageKeys = ["staff", "products", "customers"]'), false);
  assert.doesNotMatch(registry, /packageKey\s*===\s*["'](?:staff|products|customers)["']/);
  assert.match(loader, /manifest->'runtimeDriver'/);
});

test("production build executes architecture audits before Vite", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const build = String(pkg.scripts?.build || "");
  const auditIndex = build.indexOf("audit-metadata-architecture.mjs");
  const viteIndex = build.indexOf("vite build");
  assert.ok(auditIndex >= 0, "metadata architecture audit missing from build");
  assert.ok(viteIndex > auditIndex, "Vite must run after architecture audits");
});
