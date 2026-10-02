import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDashboardGlobalFilters } from "../server/services/analyticsManagement.js";

test("dashboard filters are capped at five", () => {
  assert.throws(
    () => normalizeDashboardGlobalFilters(Array.from({ length: 6 }, (_, index) => ({
      key: `f${index}`,
      label: `Filter ${index}`,
      options: [],
      mappings: [{ reportField: "stage" }],
    }))),
    /up to 5 filters/,
  );
});

test("dashboard filter options are capped at fifty", () => {
  const filter = normalizeDashboardGlobalFilters([{
    key: "stage",
    label: "Stage",
    type: "select",
    options: Array.from({ length: 80 }, (_, index) => ({ value: String(index), label: String(index) })),
    mappings: [{ reportField: "stage" }],
  }])[0];
  assert.equal(filter.options.length, 50);
});

test("dashboard filter metadata supports typed viewer controls", () => {
  const types = ["select","multi_select","date","number","boolean"];
  for (const type of types) {
    const filter = normalizeDashboardGlobalFilters([{
      key: type,
      label: type,
      type,
      options: type === "select" || type === "multi_select" ? [{ value:"a", label:"A" }] : [],
      mappings: [{ reportField: "field" }],
    }])[0];
    assert.equal(filter.type, type);
  }
});
