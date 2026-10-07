import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("bootstrap foundations are selected from package metadata and dependency ordered", async () => {
  const source = await readFile(new URL("../server/services/platformBootstrap.js", import.meta.url), "utf8");
  assert.match(source, /manifest->>'bootstrapFoundation'/);
  assert.match(source, /const visit = \(entry\) =>/);
  assert.match(source, /entry\.manifest\?\.dependencies/);
  assert.match(source, /Bootstrap foundation dependency cycle/);
  assert.match(source, /await provisionPackageMetadata/);
  assert.equal(source.includes("platformMetadata.js"), false);
});
