import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("fresh schema and startup schema do not use retired physical transaction tables", async () => {
  for (const path of ["server/database/schema.sql", "server/database/init.js"]) {
    const source = await read(path);
    for (const legacy of ["sales", "purchases", "online_orders", "online_order_items"]) {
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
