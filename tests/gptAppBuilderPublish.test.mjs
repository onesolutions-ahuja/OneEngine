import test from "node:test";
import assert from "node:assert/strict";
import { registerPortableApplicationPackage, projectPublishedPackageToOneStore } from "../server/services/appReleaseManager.js";
import { validateDeploymentManifest } from "../server/services/platformMetadataDeployment.js";

test("portable app-only manifests pass generic deployment validation", () => {
  const manifest = {
    apps: [{ appKey: "sample_app", label: "Sample App" }],
    pages: [{ appKey: "sample_app", pageKey: "desktop", label: "Desktop", definition: {} }],
  };
  const normalized = validateDeploymentManifest(manifest);
  assert.equal(normalized.apps.length, 1);
  assert.equal(normalized.pages.length, 1);
});

test("portable package registration is draft and generic", async () => {
  const calls = [];
  const db = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: "package-id", package_key: "sample_app", name: "Sample App", version: "1.0.0", publication_state: "DRAFT", visible: false, installable: true, billable: true, licence_mode: "COMMERCIAL" }] };
  };
  const result = await registerPortableApplicationPackage({
    db, packageKey: "sample_app", name: "Sample App", version: "1.0.0",
    manifest: { apps: [{ appKey: "sample_app", label: "Sample App" }] },
  });
  assert.equal(result.publication_state, "DRAFT");
  assert.match(calls[0].sql, /package_registry/);
  assert.match(calls[0].sql, /'DRAFT'/);
});

test("OneStore projection only selects published packages", async () => {
  let sql = "";
  const db = async (statement) => {
    sql = statement;
    return { rows: [{ id: "app-id", app_key: "sample_app", name: "Sample App", version: "1.0.0" }] };
  };
  const result = await projectPublishedPackageToOneStore(db, "sample_app");
  assert.equal(result.app_key, "sample_app");
  assert.match(sql, /publication_state='PUBLISHED'/);
  assert.match(sql, /onestore_apps/);
});
