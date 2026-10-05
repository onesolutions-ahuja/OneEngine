import assert from "node:assert/strict";
import test from "node:test";
import { assertTrustedPackageManifest, validateTrustedPackageCatalogue } from "../services/trustedPackages.js";

test("trusted package validation is metadata-owned", () => {
  const state = validateTrustedPackageCatalogue();
  assert.equal(state.authority, "package_registry");
  assert.equal(state.count, 0);
  assert.match(state.digest, /^[a-f0-9]{64}$/);
});

test("metadata-owned package manifests pass the generic integrity gate", () => {
  const manifest = {
    packageKey: "example_connector",
    version: "1.2.3",
    capabilities: ["example.send"],
  };
  const trusted = assertTrustedPackageManifest("example_connector", manifest, "1.2.3");
  assert.equal(trusted.packageKey, "example_connector");
  assert.equal(trusted.version, "1.2.3");
  assert.match(trusted.manifestHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(trusted.capabilities, ["example.send"]);
});

test("package integrity rejects a missing package key", () => {
  assert.throws(
    () => assertTrustedPackageManifest("", { version: "1.0.0" }, "1.0.0"),
    (error) => error?.code === "INVALID_PACKAGE_MANIFEST" && error?.status === 403
  );
});

test("package integrity rejects manifest key drift", () => {
  assert.throws(
    () => assertTrustedPackageManifest("package_a", { packageKey: "package_b", version: "1.0.0" }, "1.0.0"),
    (error) => error?.code === "PACKAGE_MANIFEST_MISMATCH" && error?.status === 403
  );
});

test("package integrity rejects manifest version drift", () => {
  assert.throws(
    () => assertTrustedPackageManifest("package_a", { packageKey: "package_a", version: "1.0.0" }, "2.0.0"),
    (error) => error?.code === "UNTRUSTED_PACKAGE_VERSION" && error?.status === 403
  );
});

test("package integrity rejects non-object manifests", () => {
  assert.throws(
    () => assertTrustedPackageManifest("package_a", null, "1.0.0"),
    (error) => error?.code === "INVALID_PACKAGE_MANIFEST" && error?.status === 403
  );
});
