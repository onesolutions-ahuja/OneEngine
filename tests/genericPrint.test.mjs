import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getWorkflowActionDefinition,
  getWorkflowBuilderActionRegistry,
} from "../server/services/platformWorkflow.js";

test("Flow Builder exposes one generic Print action", () => {
  const keys = new Set(getWorkflowBuilderActionRegistry().map((item) => item.key));
  assert.ok(keys.has("PRINT"));
  assert.equal(keys.has("PRINT_RECEIPT"), false);
  assert.equal(keys.has("PRINT_KITCHEN_TICKET"), false);

  const print = getWorkflowActionDefinition("PRINT");
  assert.ok(print);
  assert.equal(typeof print.executor, "function");
  assert.equal(getWorkflowActionDefinition("PRINT_RECEIPT"), null);
  assert.equal(getWorkflowActionDefinition("PRINT_KITCHEN_TICKET"), null);
});

test("Print requires metadata-selected template and validates copies", () => {
  const print = getWorkflowActionDefinition("PRINT");
  assert.throws(() => print.validation({ key: "PRINT" }), /requires a template/i);
  assert.doesNotThrow(() => print.validation({
    key: "PRINT",
    templateKey: "receipt",
    capability: "printer.print",
    copies: 1,
  }));
  assert.doesNotThrow(() => print.validation({
    key: "PRINT",
    templateKey: "kitchen_ticket",
    capability: "printer.kitchen.print",
    copies: 2,
  }));
  assert.throws(() => print.validation({
    key: "PRINT",
    templateKey: "receipt",
    copies: 0,
  }), /copies/i);
});

test("Kiosk and Till metadata use generic Print", () => {
  const kiosk = readFileSync(new URL("../server/routes/kiosk.js", import.meta.url), "utf8");
  const metadata = readFileSync(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
  assert.match(kiosk, /key:\s*"PRINT"/);
  assert.match(kiosk, /templateKey:\s*"receipt"/);
  assert.doesNotMatch(kiosk, /key:\s*"PRINT_RECEIPT"/);
  assert.match(metadata, /actionKey === "till\.print" \? "PRINT"/);
  assert.match(metadata, /templateKey:\s*"receipt"/);
  assert.doesNotMatch(metadata, /"PRINT_RECEIPT"/);
});
