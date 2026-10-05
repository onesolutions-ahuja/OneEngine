import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function hashPackageManifest(manifest) {
  return createHash("sha256").update(JSON.stringify(canonical(manifest || {}))).digest("hex");
}

// Package/application discovery is metadata-owned. There is deliberately no
// source-defined business package allow-list here; package_registry is the
// runtime authority and lifecycle routes pass its persisted manifest through
// this generic integrity gate.
export const TRUSTED_PACKAGE_MANIFESTS = Object.freeze([]);
export const TRUSTED_PACKAGE_MAP = Object.freeze({});

export function assertTrustedPackageManifest(packageKey, manifest, version = null) {
  const key = String(packageKey || "").trim();
  if (!key) {
    throw Object.assign(new Error("Package key is required"), {
      code: "INVALID_PACKAGE_MANIFEST",
      status: 403,
    });
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw Object.assign(new Error(`Package manifest is invalid: ${key}`), {
      code: "INVALID_PACKAGE_MANIFEST",
      status: 403,
    });
  }

  const manifestKey = String(manifest.packageKey || manifest.package_key || "").trim();
  if (manifestKey && manifestKey !== key) {
    throw Object.assign(new Error(`Package manifest key mismatch: ${key}`), {
      code: "PACKAGE_MANIFEST_MISMATCH",
      status: 403,
    });
  }

  const requestedVersion = version == null ? "" : String(version).trim();
  const manifestVersion = manifest.version == null ? "" : String(manifest.version).trim();
  if (requestedVersion && manifestVersion && requestedVersion !== manifestVersion) {
    throw Object.assign(new Error(`Package manifest version mismatch: ${key}@${requestedVersion}`), {
      code: "UNTRUSTED_PACKAGE_VERSION",
      status: 403,
    });
  }

  return Object.freeze({
    packageKey: key,
    version: requestedVersion || manifestVersion || null,
    manifestHash: hashPackageManifest(manifest),
    capabilities: Object.freeze([...(Array.isArray(manifest.capabilities) ? manifest.capabilities : [])]),
  });
}

export function validateTrustedPackageCatalogue() {
  // Source-defined package catalogues are intentionally forbidden. Startup
  // verifies persisted package_registry rows separately.
  return Object.freeze({
    count: 0,
    digest: hashPackageManifest({ authority: "package_registry" }),
    authority: "package_registry",
  });
}
