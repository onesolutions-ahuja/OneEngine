import test from "node:test";
import assert from "node:assert/strict";

import { fieldValueError, formatAutoNumberValue, normalizeFieldValue } from "../server/services/platformFieldValues.js";

test("field constraints enforce max length, precision and scale", () => {
  assert.equal(fieldValueError({ label:"Code", field_type:"text", required:false, config:{ maxLength:5 } }, "ABCDEF"), "Code must be 5 characters or fewer");
  assert.equal(fieldValueError({ label:"Amount", field_type:"decimal", required:false, config:{ precision:5, scale:2 } }, "123.456"), "Amount supports at most 2 decimal places");
  assert.equal(fieldValueError({ label:"Amount", field_type:"decimal", required:false, config:{ precision:5, scale:2 } }, "1234.56"), "Amount supports at most 5 digits");
  assert.equal(fieldValueError({ label:"Amount", field_type:"decimal", required:false, config:{ precision:5, scale:2 } }, "123.45"), null);
});

test("multi-select validates every selected metadata value", () => {
  const field={ label:"Tags", field_type:"multiselect", required:false, options:[
    { label:"A", value:"a", active:true },
    { label:"B", value:"b", active:true },
    { label:"Old", value:"old", active:false },
  ]};
  assert.equal(fieldValueError(field, ["a","b"]), null);
  assert.match(fieldValueError(field, ["a","old"]), /unavailable option/i);
  assert.equal(normalizeFieldValue(field, ["a","b"]), '["a","b"]');
});

test("auto-number formatter supports padding and UTC date tokens", () => {
  const value=formatAutoNumberValue(
    { prefix:"PO-{YYYY}{MM}{DD}-", padding:4, suffix:"-{YY}" },
    23,
    new Date("2026-10-02T14:00:00Z"),
  );
  assert.equal(value, "PO-20261002-0023-26");
});

test("auto-number formatter rejects values beyond the platform length limit", () => {
  assert.throws(() => formatAutoNumberValue({ prefix:"X".repeat(29) }, 12), /30-character limit/);
});
