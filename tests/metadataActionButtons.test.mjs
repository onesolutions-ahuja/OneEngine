import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("workspace renders generic metadata action forms", async () => {
  const source = await readFile(new URL("../src/platform/workspace/WorkspacePage.jsx", import.meta.url), "utf8");
  assert.match(source, /MetadataActionButtons/);
  assert.equal(source.includes("runMetadataButton"), false);
});

test("metadata action component is business-neutral and supports collections", async () => {
  const source = await readFile(new URL("../src/components/platform/MetadataActionButtons.jsx", import.meta.url), "utf8");
  assert.match(source, /type === "collection"/);
  assert.match(source, /related_select/);
  assert.match(source, /includeMetadataFields/);
  for (const term of ["supplier", "purchase", "product"]) assert.equal(source.toLowerCase().includes(term), false, term);
});
