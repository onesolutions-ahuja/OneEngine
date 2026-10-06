import assert from "node:assert/strict";
import { metadataManifestByPackageKey } from "../server/services/metadataManifestLoader.js";

const manifest = metadataManifestByPackageKey("retail_pos");
const legacy = new Set(["sale", "sale_item", "payment", "refund"]);
const objects = Array.isArray(manifest?.objects) ? manifest.objects : [];
const keys = objects.map((object) => object?.objectKey).filter(Boolean);

assert.equal(keys.filter((key) => key === "sale_ledger").length, 1, "sale_ledger must exist exactly once");
assert.deepEqual(keys.filter((key) => legacy.has(key)), [], "legacy sales objects must not be active");

const staleReferences = [];
JSON.stringify(manifest, (key, value) => {
  if (["objectKey","relatedObjectKey","parentObjectKey","childObjectKey"].includes(key) && legacy.has(value)) {
    staleReferences.push({ key, value });
  }
  return value;
});
assert.deepEqual(staleReferences, [], "legacy sales metadata references must be fully resolved to sale_ledger");

console.log("sale-ledger canonical metadata audit passed");
