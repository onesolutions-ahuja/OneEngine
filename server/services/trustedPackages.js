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

let entries = Object.freeze([]);
export let TRUSTED_PACKAGE_MANIFESTS = entries;
export let TRUSTED_PACKAGE_MAP = Object.freeze({});

function normalizeRegistryRow(row = {}) {
  const packageKey = String(row.package_key || row.packageKey || row.manifest?.packageKey || "").trim();
  const version = String(row.version || row.manifest?.version || "").trim();
  const manifest = row.manifest && typeof row.manifest === "object" ? row.manifest : {};
  if (!packageKey || !version) return null;
  if (manifest.packageKey && String(manifest.packageKey) !== packageKey) {
    throw new Error(`Package registry key mismatch: ${packageKey}`);
  }
  if (manifest.version && String(manifest.version) !== version) {
    throw new Error(`Package registry version mismatch: ${packageKey}@${version}`);
  }
  return Object.freeze({
    packageKey,
    version,
    manifestHash: hashPackageManifest(manifest),
    capabilities: Object.freeze([...(manifest.capabilities || [])]),
  });
}

/**
 * Build the trusted package catalogue from the authoritative package_registry
 * rows after database bootstrap. Business packages remain metadata-owned; the
 * runtime trust gate snapshots exactly what the protected registry exposes.
 */
export function registerTrustedPackageCatalogue(rows = []) {
  const next = rows.map(normalizeRegistryRow).filter(Boolean);
  const duplicateKeys = next.map((entry) => entry.packageKey).filter((key, index, all) => all.indexOf(key) !== index);
  if (duplicateKeys.length) throw new Error(`Duplicate trusted package keys: ${[...new Set(duplicateKeys)].join(", ")}`);
  entries = Object.freeze(next);
  TRUSTED_PACKAGE_MANIFESTS = entries;
  TRUSTED_PACKAGE_MAP = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.packageKey, entry])));
  return validateTrustedPackageCatalogue();
}

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
