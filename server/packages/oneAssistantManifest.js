import { readFileSync } from "node:fs";

const loaded = JSON.parse(readFileSync(new URL("../metadata/manifests/one_assistant.json", import.meta.url), "utf8"));
export const oneAssistantManifest = Object.freeze(loaded);
