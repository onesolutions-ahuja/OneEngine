import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Phase 3A Page Test covers every configured generic interaction family", async () => {
  const builder = await read("src/pages/settings/Platform/CustomPageBuilder.jsx");
  const renderer = await read("src/components/platform/CustomPageRenderer.jsx");
  const route = await read("server/routes/platform.js");

  assert.equal(builder.includes("Flow-backed event to run rollback Test"), false);
  assert.match(builder, /node\?\.interactions\?\.\[eventName\]/);
  assert.match(builder, /onInteractionTrace=/);
  assert.match(builder, /onEvent=/);
  assert.match(renderer, /onInteractionTrace/);
  assert.match(renderer, /onInteractionTrace\?\.\(/);

  for (const type of ["none", "component", "navigate", "form_layout", "action", "workflow", "screen_flow"]) {
    assert.ok(route.includes(`"${type}"`), `test runtime is missing interaction type ${type}`);
  }
  for (const kind of ["page", "component", "event", "permission", "interaction", "action", "query", "flow_input", "flow", "flow_step", "flow_output", "ui_refresh", "rollback", "timing", "error"]) {
    assert.ok(route.includes(`kind: "${kind}"`) || route.includes(`kind:"${kind}"`), `test trace is missing ${kind}`);
  }
  assert.match(route, /await client\.query\("BEGIN"\)/);
  assert.match(route, /await client\.query\("ROLLBACK"\)/);
  assert.match(route, /databaseChanges:"rolled_back"/);
});

test("Phase 3A rollback test never executes standalone registered actions with external side effects", async () => {
  const route = await read("server/routes/platform.js");
  assert.match(route, /execution: "suppressed_in_rollback_test"/);
  assert.match(route, /externalSideEffects: "suppressed"/);
});
