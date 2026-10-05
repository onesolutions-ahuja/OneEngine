import { uberEatsManifest } from "./uber_eats/manifest.js";
import { oneAssistantManifest } from "./one_assistant/manifest.js";
import { oneKioskManifest } from "./one_kiosk/manifest.js";

const PACKAGE_MANIFEST_EXTENSIONS = Object.freeze({
  uber_eats: uberEatsManifest,
  one_assistant: oneAssistantManifest,
  one_kiosk: oneKioskManifest,
});

export function packageManifestExtension(entry) {
  const factory = PACKAGE_MANIFEST_EXTENSIONS[entry?.key];
  return typeof factory === "function" ? factory(entry) : {};
}
