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
