import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (name) => JSON.parse(await readFile(new URL(`../server/metadata/manifests/${name}.json`, import.meta.url), "utf8"));

test("Phase 3 Product and Inventory metadata has canonical ownership", async () => {
  const [products, inventory, batch] = await Promise.all([readJson("products"), readJson("inventory"), readJson("batch_expiry")]);
  assert.deepEqual(products.objects.map(x => x.objectKey).sort(), ["category","product"]);
  for (const key of ["inventory_movement","store_stock","inventory_balance"]) assert.ok(inventory.objects.some(x => x.objectKey === key), key);
  assert.ok(batch.objects.some(x => x.objectKey === "inventory_batch"));
  for (const manifest of [products, inventory, batch]) {
    for (const object of manifest.objects) assert.equal(object.config?.flowWritesOnly, true, object.objectKey + " must reject direct generic writes outside Flow");
  }
});

test("Phase 3 package registry contains no inline Product or Batch business metadata", async () => {
  const registry = await readFile(new URL("../server/services/packageRegistry.js", import.meta.url), "utf8");
  assert.equal(registry.includes('entry.key === "products"'), false);
  assert.equal(registry.includes('entry.key === "batch_expiry"'), false);
  assert.equal(/INSERT INTO inventory_batches|UPDATE inventory_batches/.test(registry), false);
});

test("Phase 3 legacy inventory business engine and server injection stay removed", async () => {
  const server = await readFile(new URL("../server/server.js", import.meta.url), "utf8");
  assert.equal(server.includes("services/inventory.js"), false);
  assert.equal(server.includes("createInventoryMovement"), false);
  assert.equal(server.includes("inventoryPlatform"), false);
});

test("Phase 3 inventory validation is metadata owned", async () => {
  const inventory = await readJson("inventory");
  const batch = await readJson("batch_expiry");
  assert.ok(inventory.rules.some(x => x.objectKey === "inventory_movement" && /cannot be zero/i.test(x.name)));
  assert.ok(batch.rules.some(x => x.objectKey === "inventory_batch" && /quantity cannot be negative/i.test(x.name)));
});
