import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTrustedPackageManifest,
  registerTrustedPackageCatalogue,
  validateTrustedPackageCatalogue,
} from "../services/trustedPackages.js";

const PACKAGE_A = {
  package_key: "package_a",
  version: "1.2.3",
  manifest: {
    packageKey: "package_a",
    version: "1.2.3",
    publisher: "OneSolutions",
    route: "/app/package-a",
    capabilities: ["records"],
  },
};

test("trusted package catalogue snapshots authoritative registry metadata", () => {
  const state = registerTrustedPackageCatalogue([PACKAGE_A]);
  assert.equal(state.count, 1);
  assert.match(state.digest, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => assertTrustedPackageManifest(PACKAGE_A.package_key, PACKAGE_A.manifest, PACKAGE_A.version));
});

test("trusted package catalogue rejects outside packages", () => {
  registerTrustedPackageCatalogue([PACKAGE_A]);
  assert.throws(
    () => assertTrustedPackageManifest("outside_package", { packageKey: "outside_package" }, "1.0.0"),
    (error) => error?.code === "UNREGISTERED_PACKAGE" && error?.status === 403
  );
});

test("trusted package catalogue rejects manifest tampering", () => {
  registerTrustedPackageCatalogue([PACKAGE_A]);
  const tampered = { ...PACKAGE_A.manifest, publisher: "OutsidePublisher" };
  assert.throws(
    () => assertTrustedPackageManifest(PACKAGE_A.package_key, tampered, PACKAGE_A.version),
    (error) => error?.code === "PACKAGE_MANIFEST_MISMATCH" && error?.status === 403
  );
});

test("trusted package catalogue rejects unregistered versions", () => {
  registerTrustedPackageCatalogue([PACKAGE_A]);
  assert.throws(
    () => assertTrustedPackageManifest(PACKAGE_A.package_key, PACKAGE_A.manifest, "999.0.0"),
    (error) => error?.code === "UNTRUSTED_PACKAGE_VERSION" && error?.status === 403
  );
});

test("trusted package catalogue rejects inconsistent registry rows", () => {
  assert.throws(
    () => registerTrustedPackageCatalogue([{
      package_key: "package_a",
      version: "1.2.3",
      manifest: { packageKey: "other_package", version: "1.2.3" },
    }]),
    /Package registry key mismatch/
  );
  assert.throws(
    () => registerTrustedPackageCatalogue([{
      package_key: "package_a",
      version: "1.2.3",
      manifest: { packageKey: "package_a", version: "9.9.9" },
    }]),
    /Package registry version mismatch/
  );
});

test("empty pre-database catalogue remains a valid startup state", () => {
  registerTrustedPackageCatalogue([]);
  const state = validateTrustedPackageCatalogue();
  assert.equal(state.count, 0);
  assert.match(state.digest, /^[a-f0-9]{64}$/);
});
