import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const RETIRED_OBJECT_KEYS = new Set(["sale", "purchase", "online_order", "online_order_line"]);
const RETIRED_SOURCE_TABLES = new Set(["sales", "purchases", "online_orders", "online_order_items"]);

test("canonical business objects replace retired sale, purchase and online-order object keys", async () => {
  const dir = new URL("../server/metadata/manifests/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json"));

  const seen = new Set();
  for (const file of files) {
    const manifest = JSON.parse(await readFile(new URL(file, dir), "utf8"));
    for (const object of manifest.objects || []) {
      assert.equal(RETIRED_OBJECT_KEYS.has(object.objectKey), false, `${file}: retired object key ${object.objectKey}`);
      assert.equal(RETIRED_SOURCE_TABLES.has(object.sourceTable), false, `${file}: retired source table ${object.sourceTable}`);
      seen.add(object.objectKey);
    }

    const visit = (value, key = "") => {
      if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
      if (!value || typeof value !== "object") return;
      for (const [childKey, childValue] of Object.entries(value)) {
        if (["objectKey", "parentObjectKey", "childObjectKey", "relatedObjectKey"].includes(childKey) && typeof childValue === "string") {
          assert.equal(RETIRED_OBJECT_KEYS.has(childValue), false, `${file}: retired metadata reference ${childKey}=${childValue}`);
        }
        visit(childValue, childKey);
      }
    };
    visit(manifest);
  }

  for (const key of ["sale_ledger", "purchase_ledger", "sales_order"]) {
    assert.ok(seen.has(key), `missing canonical metadata object ${key}`);
  }
});

test("absorbed transaction detail objects remain internal storage without OneIDs", async () => {
  const manifests = [
    JSON.parse(await read("server/metadata/manifests/retail_pos.json")),
    JSON.parse(await read("server/metadata/manifests/purchasing_core.json")),
    JSON.parse(await read("server/metadata/manifests/finance_core.json")),
    JSON.parse(await read("server/metadata/manifests/online_orders.json")),
  ];
  const objects = new Map(manifests.flatMap((manifest) => manifest.objects || []).map((object) => [object.objectKey, object]));

  for (const key of [
    "sale_item", "payment", "refund",
    "purchase_line", "purchase_receipt",
    "supplier_invoice", "supplier_payment", "supplier_payment_allocation",
    "sales_order_line",
  ]) {
    const object = objects.get(key);
    assert.ok(object, `missing internal child storage ${key}`);
    assert.equal(object.config?.internal, true, `${key}: internal`);
    assert.equal(object.config?.childStorage, true, `${key}: childStorage`);
    assert.equal(object.config?.generateOneId, false, `${key}: generateOneId`);
  }
});

test("fresh schema and startup schema use canonical physical tables", async () => {
  for (const path of ["server/database/schema.sql", "server/database/init.js"]) {
    const source = await read(path);
    for (const legacy of ["sales", "purchases", "online_orders", "online_order_items"]) {
      const directTable = new RegExp(`\\b(?:FROM|JOIN|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|REFERENCES|CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS|ALTER\\s+TABLE)\\s+${legacy}\\b`, "i");
      assert.equal(directTable.test(source), false, `${path}: legacy physical table ${legacy}`);
    }
  }
});

test("canonical ledger migrations are registered in order", async () => {
  const source = await read("server/database/migrations.js");
  const keys = [
    "0044_canonical_data_schema_ledgers",
    "0045_sale_ledger_consolidation",
    "0046_purchase_and_sales_order_consolidation",
  ];
  let previous = -1;
  for (const key of keys) {
    const index = source.indexOf(`"${key}"`);
    assert.ok(index > previous, `missing or out-of-order migration ${key}`);
    previous = index;
  }
});
