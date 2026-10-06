import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestDirectory = fileURLToPath(new URL("../metadata/manifests/", import.meta.url));
let cache = null;

const SALES_LEGACY_OBJECTS = new Set(["sale", "sale_item", "payment", "refund"]);

function rewriteSalesObjectReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteSalesObjectReferences);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      ["objectKey", "relatedObjectKey", "parentObjectKey", "childObjectKey"].includes(key)
      && SALES_LEGACY_OBJECTS.has(item)
    ) {
      next[key] = "sale_ledger";
    } else {
      next[key] = rewriteSalesObjectReferences(item);
    }
  }
  return next;
}

export function canonicalizeRetailSalesManifest(manifest) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const objects = Array.isArray(source.objects) ? source.objects : [];
  const legacyObjects = objects.filter((object) => SALES_LEGACY_OBJECTS.has(object?.objectKey));
  if (!legacyObjects.length) return source;

  const sale = legacyObjects.find((object) => object.objectKey === "sale") || {};
  const fields = [];
  const seenFields = new Set();
  for (const object of legacyObjects) {
    for (const field of Array.isArray(object.fields) ? object.fields : []) {
      const apiName = String(field?.apiName || field?.api_name || "");
      if (!apiName || seenFields.has(apiName)) continue;
      seenFields.add(apiName);
      fields.push(rewriteSalesObjectReferences(field));
    }
  }

  const canonicalObject = rewriteSalesObjectReferences({
    ...sale,
    objectKey: "sale_ledger",
    label: "Sale Ledger",
    pluralLabel: "Sale Ledger",
    description: "Canonical sales ledger metadata object.",
    sourceTable: "sale_ledger",
    fields,
  });

  const relationships = (Array.isArray(source.relationships) ? source.relationships : [])
    .filter((relationship) => !(
      SALES_LEGACY_OBJECTS.has(relationship?.parentObjectKey)
      && SALES_LEGACY_OBJECTS.has(relationship?.childObjectKey)
    ))
    .map(rewriteSalesObjectReferences);

  return rewriteSalesObjectReferences({
    ...source,
    objects: [
      ...objects.filter((object) => !SALES_LEGACY_OBJECTS.has(object?.objectKey)),
      canonicalObject,
    ],
    relationships,
  });
}

function loadManifestMap() {
  if (cache) return cache;
  const entries = new Map();
  for (const file of readdirSync(manifestDirectory, { withFileTypes: true })) {
    if (!file.isFile() || extname(file.name) !== ".json") continue;
    const packageKey = file.name.slice(0, -5);
    const parsed = JSON.parse(readFileSync(join(manifestDirectory, file.name), "utf8"));
    entries.set(packageKey, packageKey === "retail_pos" ? canonicalizeRetailSalesManifest(parsed) : parsed);
  }
  cache = entries;
  return cache;
}

export function metadataManifestByPackageKey(packageKey) {
  return loadManifestMap().get(String(packageKey || "")) || null;
}
