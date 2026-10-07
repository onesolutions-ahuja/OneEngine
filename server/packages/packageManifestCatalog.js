import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("../metadata/package-catalog.json", import.meta.url), "utf8"));
export const packageManifestCatalog = Object.freeze(
  (Array.isArray(raw) ? raw : []).map((entry) => Object.freeze({
    ...entry,
    permissions: Object.freeze([...(Array.isArray(entry?.permissions) ? entry.permissions : [])]),
  }))
);
export default packageManifestCatalog;
