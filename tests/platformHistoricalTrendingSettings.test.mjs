import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Historical Trending settings are tenant-scoped and global metadata stays protected", async () => {
  const [routes, objectUi, reportSecurity, schema] = await Promise.all([
    readFile(new URL("../server/routes/platform.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/settings/ObjectsSettingsPane.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/services/platformReportSecurity.js", import.meta.url), "utf8"),
    readFile(new URL("../server/database/schema.sql", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /CREATE TABLE IF NOT EXISTS platform_object_settings/);
  assert.match(schema, /PRIMARY KEY \(company_id, object_id\)/);
  assert.match(routes, /router\.put\("\/platform\/objects\/:objectId\/settings"/);
  assert.match(routes, /Historical Trending supports up to 8 fields per object/);
  assert.match(routes, /platform_object_settings/);
  assert.match(reportSecurity, /LEFT JOIN platform_object_settings/);
  assert.match(objectUi, /selected\?\.company_id !== null/);
  assert.match(objectUi, /\/settings\`/);
});
