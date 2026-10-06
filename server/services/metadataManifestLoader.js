import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestDirectory = fileURLToPath(new URL("../metadata/manifests/", import.meta.url));
let cache = null;

function loadManifestMap() {
  if (cache) return cache;
  const entries = new Map();
  for (const file of readdirSync(manifestDirectory, { withFileTypes: true })) {
    if (!file.isFile() || extname(file.name) !== ".json") continue;
    const packageKey = file.name.slice(0, -5);
    const parsed = JSON.parse(readFileSync(join(manifestDirectory, file.name), "utf8"));
    entries.set(packageKey, parsed);
  }
  cache = entries;
  return cache;
}

export function metadataManifestByPackageKey(packageKey) {
  return loadManifestMap().get(String(packageKey || "")) || null;
}
