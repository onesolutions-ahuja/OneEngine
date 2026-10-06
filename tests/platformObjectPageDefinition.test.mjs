import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_OBJECT_ICON_KEY,
  DEFAULT_OBJECT_NAV_ORDER,
  defaultObjectPageDefinition,
  normalizeObjectPageDefinition,
  objectRuntimeRoute,
} from "../server/services/platformObjectNavigation.js";

test("default Object Page is canonical metadata, not page-specific code", () => {
  assert.deepEqual(defaultObjectPageDefinition("sales"), {
    sections: [],
    components: [],
    objectKey: "sales",
    showInNavigation: true,
    icon: DEFAULT_OBJECT_ICON_KEY,
    order: DEFAULT_OBJECT_NAV_ORDER,
  });
  assert.equal(objectRuntimeRoute("sales"), "/app/objects/sales");
});

test("Object Page normalizer preserves layout and object identity", () => {
  const definition = normalizeObjectPageDefinition({
    object_key: "products",
    sections: [{ id: "main", columns: 2 }],
    components: [{ id: "table-1", componentApi: "table.v1" }],
    showInNavigation: false,
    order: 22,
  });
  assert.equal(definition.objectKey, "products");
  assert.equal(definition.showInNavigation, false);
  assert.equal(definition.order, 22);
  assert.equal(definition.sections[0].id, "main");
  assert.equal(definition.components[0].componentApi, "table.v1");
});
