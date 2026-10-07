import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const RETIRED_OBJECT_KEYS = new Set(["sale", "purchase", "online_order", "online_order_line"]);
const RETIRED_SOURCE_TABLES = new Set(["sales", "purchases", "online_orders", "online_order_items"]);

test("metadata manifests do not restore retired object or physical table names", async () => {
  const dir = new URL("../server/metadata/manifests/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  assert.ok(files.length > 0);

  for (const file of files) {
    const manifest = JSON.parse(await readFile(new URL(file, dir), "utf8"));
    for (const object of manifest.objects || []) {
      assert.equal(RETIRED_OBJECT_KEYS.has(object.objectKey), false, `${file}: retired object key ${object.objectKey}`);
      assert.equal(RETIRED_SOURCE_TABLES.has(object.sourceTable), false, `${file}: retired source table ${object.sourceTable}`);
    }
  }
});

test("canonical ledger objects are owned by current manifests", async () => {
  const purchasing = JSON.parse(await read("server/metadata/manifests/purchasing_core.json"));
  const finance = JSON.parse(await read("server/metadata/manifests/finance_core.json"));
  const keys = new Set([...(purchasing.objects || []), ...(finance.objects || [])].map((item) => item.objectKey));
  assert.ok(keys.has("purchase_ledger"));
  assert.ok(keys.has("supplier_invoice"));
  assert.ok(keys.has("supplier_payment"));
});

test("fresh schema and startup schema do not recreate retired physical tables", async () => {
  for (const path of ["server/database/schema.sql", "server/database/init.js"]) {
    const source = await read(path);
    for (const legacy of RETIRED_SOURCE_TABLES) {
      const directTable = new RegExp(`\\b(?:FROM|JOIN|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|REFERENCES|CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS|ALTER\\s+TABLE)\\s+${legacy}\\b`, "i");
      assert.equal(directTable.test(source), false, `${path}: legacy physical table ${legacy}`);
    }
  }
});

test("canonical ledger migrations remain registered in order", async () => {
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
