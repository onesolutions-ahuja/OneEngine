import { createHash } from "node:crypto";
import { internalAppCatalog } from "./internalAppCatalog.js";
import { packageDefinition } from "./packageRegistry.js";

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

const entries = internalAppCatalog.map((entry) => {
  const definition = packageDefinition(entry);
  return Object.freeze({
    packageKey: definition.packageKey,
    version: definition.version,
    manifestHash: hashPackageManifest(definition.manifest),
    capabilities: Object.freeze([...(definition.manifest?.capabilities || [])]),
  });
});

const duplicateKeys = entries.map((entry) => entry.packageKey).filter((key, index, all) => all.indexOf(key) !== index);
if (duplicateKeys.length) throw new Error(`Duplicate trusted package keys: ${[...new Set(duplicateKeys)].join(", ")}`);

export const TRUSTED_PACKAGE_MANIFESTS = Object.freeze(entries);
export const TRUSTED_PACKAGE_MAP = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.packageKey, entry])));

export function assertTrustedPackageManifest(packageKey, manifest, version = null) {
  const key = String(packageKey || "").trim();
  const trusted = TRUSTED_PACKAGE_MAP[key];
  if (!trusted) {
    throw Object.assign(new Error(`Package is not registered in the OneEngine trusted package catalogue: ${key || "(missing)"}`), {
      code: "UNREGISTERED_PACKAGE",
      status: 403,
    });
  }
  if (version && String(version) !== String(trusted.version)) {
    throw Object.assign(new Error(`Package version is not registered in the trusted catalogue: ${key}@${version}`), {
      code: "UNTRUSTED_PACKAGE_VERSION",
      status: 403,
    });
  }
  const actualHash = hashPackageManifest(manifest);
  if (actualHash !== trusted.manifestHash) {
    throw Object.assign(new Error(`Package manifest integrity check failed: ${key}`), {
      code: "PACKAGE_MANIFEST_MISMATCH",
      status: 403,
    });
  }
  return trusted;
}

export function validateTrustedPackageCatalogue() {
  for (const entry of entries) {
    if (!entry.packageKey || !entry.version || !entry.manifestHash) throw new Error("Invalid trusted package catalogue entry");
  }
  return Object.freeze({
    count: entries.length,
    digest: createHash("sha256").update(entries.map((entry) => `${entry.packageKey}@${entry.version}:${entry.manifestHash}`).sort().join("|")).digest("hex"),
  });
}
