import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = [
  "src/pages/developer",
  "src/pages/settings/Platform",
  "src/pages/dashboard",
  "src/pages/reports",
  "src/components/dashboard",
  "src/shared",
];

async function sourceFiles(root) {
  const out = [];
  async function walk(path) {
    for (const entry of await readdir(new URL("../" + path + "/", import.meta.url), { withFileTypes: true })) {
      const child = join(path, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory()) await walk(child);
      else if ([".js",".jsx",".ts",".tsx"].includes(extname(entry.name))) out.push(child);
    }
  }
  await walk(root);
  return out;
}

test("Phase 3A builders contain no business-domain identifiers", async () => {
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const forbidden = [
    /\bsales\b/i,
    /\bcustomer(?:s)?\b/i,
    /\bproduct(?:s)?\b/i,
    /\bsupplier(?:s)?\b/i,
    /\bpurchase(?:s)?\b/i,
    /\binventory\b/i,
    /\bnet_sales\b/i,
    /\breceipt_number\b/i,
    /\bcustomer_id\b/i,
    /\bproduct_id\b/i,
    /\bsupplier_id\b/i,
  ];
  for (const path of files) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, path + " contains " + pattern);
    }
  }
});

test("Phase 3A builders contain no provider-specific execution assumptions", async () => {
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const forbidden = [
    /\buber\b/i,/\bdeliveroo\b/i,/\bshopify\b/i,/\bquickbooks\b/i,
    /\bpaypal\b/i,/\bdojo\b/i,/\bsumup\b/i,/\bmailchimp\b/i,/\bbrevo\b/i,
    /SEND_EMAIL_BREVO/,/SEND_EMAIL_MAILJET/,/SEND_WHATSAPP/,
  ];
  for (const path of files) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, path + " contains " + pattern);
    }
  }
});

test("Phase 3A report and dashboard builders have no fixed business datasource", async () => {
  const report = await readFile(new URL("../src/pages/reports/CustomReportsAdmin.jsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../src/pages/dashboard/DashboardBuilder.jsx", import.meta.url), "utf8");
  const registry = await readFile(new URL("../src/pages/settings/Platform/componentRegistry.js", import.meta.url), "utf8");
  assert.equal(report.includes('dataSource: "sales"'), false);
  assert.equal(report.includes('value="sales"'), false);
  assert.match(report, /metadata\.sources/);
  assert.equal(dashboard.includes('dataSource: "sales"'), false);
  assert.equal(registry.includes('dataSource: "sales"'), false);
});

test("Phase 3A builders remain metadata/runtime driven", async () => {
  const gpt = await readFile(new URL("../src/pages/developer/gptbuilder/GPTBuilderPage.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/pages/developer/gptappbuilder/GPTAppBuilderPage.jsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../src/pages/developer/GPTPageBuilder.jsx", import.meta.url), "utf8");
  assert.match(gpt, /platform/);
  assert.match(app, /metadata/i);
  assert.match(page, /component/i);
});
