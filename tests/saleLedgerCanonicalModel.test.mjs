import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registry = JSON.parse(
  await readFile(new URL("../server/metadata/migrations/sale_ledger.json", import.meta.url), "utf8")
);

test("sale ledger is the only canonical sales object in the migration registry", () => {
  assert.equal(registry.canonicalObject.apiName, "sale_ledger");
  assert.equal(registry.canonicalObject.oneIdEligible, true);
  assert.equal(registry.canonicalObject.oneIdAssigned, false);

  const absorbed = new Map(registry.absorbs.map((item) => [item.apiName, item]));
  for (const key of ["sale", "sale_item", "payment", "refund"]) {
    assert.equal(absorbed.get(key)?.disposition, "ABSORB", key);
    assert.equal(absorbed.get(key)?.oneIdEligible, false, key);
  }
});

test("sale ledger migration is non-destructive until dependency audit completes", () => {
  assert.equal(registry.migrationRules.preserveData, true);
  assert.equal(registry.migrationRules.destructiveChangesAllowedBeforeDependencyAudit, false);
  assert.equal(registry.migrationRules.assignOneIdBeforeDependencyAudit, false);
  assert.equal(registry.migrationRules.legacyReferencesCountAsUsage, false);
});
