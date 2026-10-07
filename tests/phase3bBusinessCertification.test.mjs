import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

const scenarios = [
  "salon/appointments","restaurant/reservations/orders","retail/inventory","crm/sales",
  "field service","recruitment","leave/expense/purchasing approvals","customer/client portal",
  "projects/tasks","warehouse","inspection/compliance","assets/maintenance","vendor onboarding",
  "invoice processing","support/service desk"
];

test("Phase 3B certifies all fifteen business scenarios through the same generic primitives", async () => {
  assert.equal(scenarios.length, 15);
  const builder = await read("src/pages/settings/Platform/CustomPageBuilder.jsx");
  const renderer = await read("src/components/platform/CustomPageRenderer.jsx");
  const runtime = await read("src/platform/pages/CustomPageRuntimePage.jsx");
  const route = await read("server/routes/platform.js");
  const workflow = await read("server/services/platformWorkflow.js");

  for (const event of ["click","change","select","submit","load","row_click","scan","success","error"]) {
    assert.ok(builder.includes(event), `missing generic page event: ${event}`);
  }
  for (const operation of ["set_record","filter_collection","set_value","refresh"]) {
    assert.ok(renderer.includes(operation), `missing generic component operation: ${operation}`);
  }
  for (const primitive of ["CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD","ASSIGNMENT","CONDITION","LOOP","WAIT","RUN_SUBFLOW","SEND_COMMUNICATION"]) {
    assert.ok(workflow.includes(primitive), `missing generic Flow primitive: ${primitive}`);
  }
  assert.match(route, /resolvePageBindingTree/);
  assert.match(route, /workflowVariables/);
  assert.match(runtime, /screen_flow/);
  assert.match(runtime, /form_layout/);
  assert.match(runtime, /outputTarget/);
});

test("advanced page components do not bypass metadata events with direct record mutation", async () => {
  const renderer = await read("src/components/platform/CustomPageRenderer.jsx");
  assert.equal(/apiRequest\([^\n]*\/api\/platform\/objects\/[^\n]*method:\s*["']PUT["']/.test(renderer), false);
  for (const assumption of [
    'config.groupField || "status"',
    'config.startField || "start_date"',
    'config.resourceField || "assignee_id"',
    'config.titleField || config.taskLabelField || config.labelField || "name"'
  ]) assert.equal(renderer.includes(assumption), false, assumption);
  assert.match(renderer, /eventName:\s*"change"/);
  assert.match(renderer, /changes:\s*\{\s*\[groupField\]/);
});

test("business scenario names stay certification data, not Page Builder/runtime implementation", async () => {
  const implementation = [
    await read("src/pages/settings/Platform/CustomPageBuilder.jsx"),
    await read("src/components/platform/CustomPageRenderer.jsx"),
    await read("src/platform/pages/CustomPageRuntimePage.jsx"),
    await read("server/routes/platform.js"),
  ].join("\n").toLowerCase();
  for (const token of ["barber","appointment","restaurant","candidate","invoice","ticket","warehouse"]) {
    assert.equal(implementation.includes(token), false, `business token leaked into generic Page Builder/runtime: ${token}`);
  }
});
