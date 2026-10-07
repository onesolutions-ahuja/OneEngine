import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("../metadata/runtime-flow-manifests.json", import.meta.url), "utf8"));
export const PACKAGE_RUNTIME_FLOWS = Object.freeze(Array.isArray(raw) ? raw : []);
