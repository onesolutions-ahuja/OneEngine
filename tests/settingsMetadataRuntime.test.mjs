import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("legacy hardcoded Settings router and source catalogue stay deleted", async () => {
  await assert.rejects(access(new URL("server/routes/settings.js", root)));
  await assert.rejects(access(new URL("server/services/settingsNavigationCatalog.js", root)));
});

test("Settings UI resolves through persisted platform metadata", async () => {
  const page = await read("src/pages/settings/MetadataSettingsPage.jsx");
  const section = await read("src/pages/settings/MetadataSettingsSection.jsx");
  const app = await read("src/App.jsx");
  const platformRoutes = await read("server/routes/platform.js");
  const routeStart = platformRoutes.indexOf('router.get("/platform/runtime/settings-hosts", authenticate,');
  const routeEnd = platformRoutes.indexOf('router.get("/platform/runtime/pages/:pageKey"', routeStart);
  const settingsHostRoute = platformRoutes.slice(routeStart, routeEnd);

  assert.match(page, /\/api\/platform\/runtime\/settings-hosts/);
  assert.match(section, /\/api\/platform\/runtime\/settings-hosts/);
  assert.notEqual(routeStart, -1);
  assert.notEqual(routeEnd, -1);
  assert.match(settingsHostRoute, /const batchSize = 3/);
  assert.ok(
    settingsHostRoute.indexOf('hasPlatformObjectPermission(db, req, object.id, "view")')
      < settingsHostRoute.indexOf("FROM platform_fields")
  );
  assert.match(app, /MetadataSettingsPage/);
  assert.equal(page.includes("/api/settings"), false);
  assert.equal(section.includes("/api/settings"), false);
});

test("legacy Settings client contract stays removed", async () => {
  const service = await read("src/services/settings.js");
  for (const token of [
    "/api/settings",
    "loadSettingsContext",
    "readSettingsContextCache",
    "patchCompanySettings",
    "patchSettings",
  ]) {
    assert.equal(service.includes(token), false, token);
  }
});

test("Settings host discovery is metadata-driven", async () => {
  const settingsAccessSource = await read("src/utils/settingsAccess.js");
  assert.doesNotMatch(settingsAccessSource, /Customer Loyalty|Client Web Shop|Server \/ API Configuration/);
  assert.match(settingsAccessSource, /sections/);
  assert.match(settingsAccessSource, /section\.permissions/);
});
