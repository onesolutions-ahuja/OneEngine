import assert from "node:assert/strict";
import test from "node:test";
import { internalAppCatalog } from "../services/internalAppCatalog.js";
import { packageDefinition } from "../services/packageRegistry.js";
import { assertTrustedPackageManifest, validateTrustedPackageCatalogue } from "../services/trustedPackages.js";

test("trusted package catalogue validates and accepts canonical manifests", () => {
  const state = validateTrustedPackageCatalogue();
  assert.ok(state.count > 0);
  assert.match(state.digest, /^[a-f0-9]{64}$/);
  const definition = packageDefinition(internalAppCatalog[0]);
  assert.doesNotThrow(() => assertTrustedPackageManifest(definition.packageKey, definition.manifest, definition.version));
});

test("trusted package catalogue rejects outside packages", () => {
  assert.throws(
    () => assertTrustedPackageManifest("outside_package", { packageKey: "outside_package" }, "1.0.0"),
    (error) => error?.code === "UNREGISTERED_PACKAGE" && error?.status === 403
  );
});

test("trusted package catalogue rejects manifest tampering", () => {
  const definition = packageDefinition(internalAppCatalog[0]);
  const tampered = { ...definition.manifest, publisher: "OutsidePublisher" };
  assert.throws(
    () => assertTrustedPackageManifest(definition.packageKey, tampered, definition.version),
    (error) => error?.code === "PACKAGE_MANIFEST_MISMATCH" && error?.status === 403
  );
});

test("trusted package catalogue rejects unregistered versions", () => {
  const definition = packageDefinition(internalAppCatalog[0]);
  assert.throws(
    () => assertTrustedPackageManifest(definition.packageKey, definition.manifest, "999.0.0"),
    (error) => error?.code === "UNTRUSTED_PACKAGE_VERSION" && error?.status === 403
  );
});


test("every app catalogue entry produces a complete trusted package contract", () => {
  const packageKeys = new Set(internalAppCatalog.map((entry) => entry.packageKey || entry.key));
  const seen = new Set();

  for (const entry of internalAppCatalog) {
    const definition = packageDefinition(entry);
    assert.ok(definition.packageKey, `Missing package key for ${entry.key}`);
    assert.ok(!seen.has(definition.packageKey), `Duplicate package key: ${definition.packageKey}`);
    seen.add(definition.packageKey);

    assert.match(definition.version, /^\d+\.\d+\.\d+(?:[-+].*)?$/, `Invalid version: ${definition.packageKey}`);
    assert.equal(definition.manifest.packageKey, definition.packageKey);
    assert.equal(definition.manifest.version, definition.version);
    assert.equal(definition.manifest.route, entry.route, `Package route drift: ${definition.packageKey}`);
    assert.deepEqual(definition.manifest.permissions, [...new Set(definition.manifest.permissions)], `Duplicate package permissions: ${definition.packageKey}`);

    for (const dependency of definition.manifest.dependencies || []) {
      const key = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
      assert.ok(packageKeys.has(key), `Unknown dependency ${key} in ${definition.packageKey}`);
    }
    for (const dependency of definition.manifest.optionalDependencies || []) {
      const key = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
      assert.ok(packageKeys.has(key), `Unknown optional dependency ${key} in ${definition.packageKey}`);
    }

    if (definition.manifest.visibility === "PUBLIC" && definition.manifest.installable !== false) {
      assert.ok(String(definition.manifest.route || "").startsWith("/app/"), `Installable package has no app route: ${definition.packageKey}`);
      assert.ok(Array.isArray(definition.manifest.permissions) && definition.manifest.permissions.length > 0, `Installable package has no permissions: ${definition.packageKey}`);
    }

    assert.doesNotThrow(() => assertTrustedPackageManifest(definition.packageKey, definition.manifest, definition.version));
  }
});

test("communication package routes and SMS booking package versions stay aligned", () => {
  const byKey = new Map(internalAppCatalog.map((entry) => [entry.packageKey || entry.key, packageDefinition(entry)]));
  assert.equal(byKey.get("email_connector")?.manifest?.route, "/app/settings/email-delivery");
  assert.equal(byKey.get("sms_connector")?.manifest?.route, "/app/settings/sms-delivery");
  assert.equal(byKey.get("sms_connector")?.version, "1.1.0");
  assert.equal(byKey.get("smsgate_connector")?.version, "1.2.0");
  assert.ok(byKey.get("smsgate_connector")?.manifest?.capabilities?.includes("sms_inbound"));
  assert.ok(byKey.get("one_assistant")?.manifest?.capabilities?.includes("sms_booking"));
});
