import test from "node:test";
import assert from "node:assert/strict";

import { evaluateWorkflowFormula } from "../server/services/platformFormula.js";

test("workflow formula supports generic date and time operations", () => {
  assert.equal(evaluateWorkflowFormula('PARSEDATE(input, "DD/MM/YYYY")', { input: "04/04/2027" }), "2027-04-04");
  assert.equal(evaluateWorkflowFormula('FORMATDATE(input, "DD/MM/YYYY")', { input: "2027-04-04" }), "04/04/2027");
  assert.equal(evaluateWorkflowFormula('COMBINEDATETIME(day, time)', { day: "2027-04-04", time: "09:30" }), "2027-04-04T09:30:00.000Z");
  assert.equal(evaluateWorkflowFormula('ADDMINUTES(start, minutes)', { start: "2027-04-04T09:30:00.000Z", minutes: 45 }), "2027-04-04T10:15:00.000Z");
  assert.equal(evaluateWorkflowFormula('MINUTESBETWEEN(start, end)', { start: "2027-04-04T09:30:00.000Z", end: "2027-04-04T10:15:00.000Z" }), 45);
  assert.equal(evaluateWorkflowFormula('WEEKDAY(day)', { day: "2027-04-04" }), 0);
  assert.equal(evaluateWorkflowFormula('FORMATTIME(value, "HH:mm")', { value: "2027-04-04T09:30:00.000Z" }), "09:30");
});

test("workflow formula rejects invalid custom dates without inventing a value", () => {
  assert.equal(evaluateWorkflowFormula('PARSEDATE(input, "DD/MM/YYYY")', { input: "31/02/2027" }), null);
  assert.equal(evaluateWorkflowFormula('PARSEDATE(input, "DD/MM/YYYY")', { input: "wrong" }), null);
});
