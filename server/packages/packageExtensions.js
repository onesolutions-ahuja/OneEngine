import { uberEatsManifest } from "./uber_eats/manifest.js";

const PACKAGE_MANIFEST_EXTENSIONS = Object.freeze({
  uber_eats: uberEatsManifest,
});

export function packageManifestExtension(entry) {
  const factory = PACKAGE_MANIFEST_EXTENSIONS[entry?.key];
  return typeof factory === "function" ? factory(entry) : {};
}
