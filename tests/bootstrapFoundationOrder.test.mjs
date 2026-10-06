import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("bootstrap foundations are provisioned from package metadata after registry seed", async () => {
  const source = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const registrySeed = source.indexOf("await seedPackageRegistry(pool)");
  const foundationQuery = source.indexOf("bootstrapFoundation");
  const provision = source.indexOf("await provisionPackageMetadata");
  assert.ok(registrySeed >= 0);
  assert.ok(foundationQuery > registrySeed);
  assert.ok(provision > foundationQuery);
  assert.match(source, /manifest\?\.dependencies/);
});
