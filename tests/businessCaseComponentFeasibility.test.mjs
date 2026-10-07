import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLATFORM_COMPONENTS } from "../server/services/platformComponentRegistry.js";

const keys = new Set(PLATFORM_COMPONENTS.map((component) => component.key));
const renderer = fs.readFileSync(new URL("../src/components/platform/CustomPageRenderer.jsx", import.meta.url), "utf8");

const cases = {
  appointments: ["calendar","scheduler","timer","table","record_picker"],
  crm: ["table","kanban","timeline","process_path","related_list"],
  projects: ["kanban","gantt","timeline","tree_view","progress"],
  retail_inventory: ["table","barcode","image_record_card","editable_grid"],
  hospitality: ["spatial_board","scheduler","kanban","editable_grid"],
  helpdesk: ["kanban","timer","timeline","related_list"],
  accounting: ["editable_grid","table","kpi","bar_chart"],
  property: ["map","file_viewer","signature","related_list"],
  clinic: ["scheduler","file_viewer","signature","timeline"],
  education: ["scheduler","table","progress","related_list"],
  field_service: ["route_plan","map","signature","file_upload"],
  ecommerce: ["image_record_card","editable_grid","process_path","barcode"],
  hr: ["calendar","hierarchy_viewer","file_viewer","process_path"],
  legal: ["file_viewer","signature","timeline","process_path"],
  manufacturing: ["tree_view","editable_grid","gantt","kanban"],
};

test("15 representative businesses have generic component coverage", () => {
  assert.equal(Object.keys(cases).length, 15);
  for (const [business, required] of Object.entries(cases)) {
    const missing = required.filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `${business} missing: ${missing.join(", ")}`);
  }
});

test("cross-industry record primitives have runtime render paths", () => {
  for (const key of ["editable_grid","spatial_board","timer","route_plan"]) {
    assert.match(renderer, new RegExp(`node\\.componentKey === ["']${key}["']`), `${key} has no runtime renderer`);
  }
});
