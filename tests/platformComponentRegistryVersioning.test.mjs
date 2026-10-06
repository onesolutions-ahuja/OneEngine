import test from "node:test";
import assert from "node:assert/strict";
import {
  getPlatformComponent,
  listPlatformComponents,
  resolvePlatformComponentApi,
  validateComponentRegistry,
} from "../server/services/platformComponentRegistry.js";

test("component registry exposes stable versioned APIs", () => {
  const audit = validateComponentRegistry();
  assert.equal(audit.valid, true);
  assert.equal(audit.versioned, true);
  assert.ok(audit.count > 0);
  for (const component of listPlatformComponents()) {
    assert.match(component.api, /^[a-z][a-z0-9_]*\.v[1-9][0-9]*$/);
  }
});

test("legacy component keys resolve to the canonical version", () => {
  assert.equal(resolvePlatformComponentApi("table"), "table.v1");
  assert.equal(resolvePlatformComponentApi("table.v1"), "table.v1");
  assert.equal(getPlatformComponent("table"), getPlatformComponent("table.v1"));
  assert.equal(resolvePlatformComponentApi("button"), "button.v1");
  assert.equal(resolvePlatformComponentApi("container"), "container.v1");
});
