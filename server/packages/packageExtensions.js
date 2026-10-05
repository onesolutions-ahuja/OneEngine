import { uberEatsManifest } from "./uber_eats/manifest.js";
import { oneAssistantManifest } from "./one_assistant/manifest.js";

const PACKAGE_MANIFEST_EXTENSIONS = Object.freeze({
  uber_eats: uberEatsManifest,
  one_assistant: oneAssistantManifest,
});

export function packageManifestExtension(entry) {
  const factory = PACKAGE_MANIFEST_EXTENSIONS[entry?.key];
  return typeof factory === "function" ? factory(entry) : {};
}
