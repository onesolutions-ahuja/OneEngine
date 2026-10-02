import test from "node:test";
import assert from "node:assert/strict";

import { fieldValueError, formatAutoNumberValue, normalizeFieldValue } from "../server/services/platformFieldValues.js";

test("field constraints enforce max length, precision and scale", () => {
  assert.equal(fieldValueError({ label:"Code", field_type:"text", required:false, config:{ maxLength:5 } }, "ABCDEF"), "Code must be 5 characters or fewer");
  assert.equal(fieldValueError({ label:"Notes", field_type:"text_area", required:false, config:{ maxLength:255 } }, "x".repeat(256)), "Notes must be 255 characters or fewer");
  assert.equal(fieldValueError({ label:"Notes", field_type:"text_area", required:false, config:{} }, "x".repeat(256)), "Notes must be 255 characters or fewer");
  assert.equal(fieldValueError({ label:"Email", field_type:"email", required:false, config:{} }, "a".repeat(72) + "@example.com"), "Email must be 80 characters or fewer");
  assert.equal(fieldValueError({ label:"Phone", field_type:"phone", required:false, config:{} }, "1".repeat(41)), "Phone must be 40 characters or fewer");
  assert.equal(fieldValueError({ label:"Description", field_type:"long_text", required:false, config:{} }, "x".repeat(32769)), "Description must be 32768 characters or fewer");
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

test("email and millisecond time validation match field semantics", () => {
  assert.equal(fieldValueError({ label:"Email", field_type:"email", required:false, config:{} }, "person@example.com"), null);
  assert.match(fieldValueError({ label:"Email", field_type:"email", required:false, config:{} }, "not-an-email"), /valid email address/i);
  assert.equal(fieldValueError({ label:"Time", field_type:"time", required:false, config:{} }, "14:30:15.125"), null);
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
