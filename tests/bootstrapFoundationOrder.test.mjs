import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("bootstrap foundations provision only after core object seed", async () => {
  const source = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  const coreSeed = source.indexOf("for (const object of [...retailObjects");
  const foundations = source.indexOf("const bootstrapFoundations");
  assert.ok(coreSeed >= 0);
  assert.ok(foundations > coreSeed);
});
