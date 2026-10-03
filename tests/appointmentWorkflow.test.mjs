import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

function oneAssistantRouter() {
  const pkg = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
  assert.ok(pkg, "OneAssistant package must exist");
  const workflow = pkg.manifest.workflows.find((item) => item.name === "OneAssistant - Booking Channel Router");
  assert.ok(workflow, "booking channel router must exist");
  return { pkg, workflow };
}

test("OneAssistant uses one active communication-event router for SMS and WhatsApp", () => {
  const { workflow } = oneAssistantRouter();
  assert.equal(workflow.active, true);
  assert.equal(workflow.triggerKey, "communication_message_received");
  assert.equal(workflow.action.flowType, "platform_event");
  assert.equal(workflow.action.start.eventKey, "communication_message_received");

  const actions = workflow.action.actions;
  const keys = actions.map((action) => action.key);
  assert.ok(keys.includes("APPOINTMENT_SESSION_CONTEXT"));
  assert.ok(keys.includes("PROCESS_APPOINTMENT_DATE_RESPONSE"));
  assert.ok(keys.includes("PROCESS_APPOINTMENT_SLOT_RESPONSE"));
  assert.ok(keys.includes("SEND_APPOINTMENT_MESSAGE"));

  const channelRouter = actions.find((action) => action.id === "channel_router");
  assert.deepEqual(channelRouter.outcomes.map((outcome) => outcome.label), ["SMS", "WhatsApp"]);

  const sends = actions.filter((action) => action.key === "SEND_APPOINTMENT_MESSAGE");
  assert.ok(sends.some((action) => action.channel === "SMS"));
  assert.ok(sends.some((action) => action.channel === "WHATSAPP"));
  assert.ok(sends.every((action) => typeof action.message === "string" && action.message.length > 0));

  assert.equal(
    packageDefinitions().find((definition) => definition.packageKey === "one_assistant")
      .manifest.workflows.some((item) => item.name === "OneAssistant - SMS Booking"),
    false,
    "legacy SMS event flow must not be installed alongside the router"
  );
  assert.equal(
    packageDefinitions().find((definition) => definition.packageKey === "one_assistant")
      .manifest.workflows.some((item) => item.name === "OneAssistant - WhatsApp Booking"),
    false,
    "legacy WhatsApp event flow must not be installed alongside the router"
  );
});

test("workflow decisions can route on outputs from previous steps", async () => {
  const decision = getWorkflowActionDefinition("CONDITION");
  assert.ok(decision);
  const result = await decision.executor({
    action: {
      outcomes: [
        {
          id: "sms",
          label: "SMS",
          condition: {
            match: "all",
            conditions: [{ field: "steps.session_context.channel", operator: "equals", value: "SMS" }],
          },
          branch: [],
        },
      ],
      defaultBranch: [],
    },
    fields: [],
    record: {},
    previousRecord: null,
    req: { user: { companyId: "company-1" } },
    object: null,
    workflowVariables: { steps: { session_context: { channel: "SMS" } }, variables: {} },
  });
  assert.equal(result.outcomeId, "sms");
  assert.equal(result.matched, true);
});

test("registered appointment workflow actions are available to the Builder", () => {
  for (const key of [
    "APPOINTMENT_SESSION_CONTEXT",
    "PROCESS_APPOINTMENT_DATE_RESPONSE",
    "PROCESS_APPOINTMENT_SLOT_RESPONSE",
    "SEND_APPOINTMENT_MESSAGE",
  ]) {
    const definition = getWorkflowActionDefinition(key);
    assert.ok(definition, `${key} must be registered`);
    assert.equal(typeof definition.executor, "function");
  }
});

test("SMSGate webhook only records inbound communication and no longer hard-codes booking links", () => {
  const source = readFileSync(new URL("../server/routes/smsGateWebhooks.js", import.meta.url), "utf8");
  assert.match(source, /recordCommunicationEvent/);
  assert.match(source, /workflowDispatched/);
  assert.doesNotMatch(source, /createAppointmentBookingCase/);
  assert.doesNotMatch(source, /issueAppointmentPublicLink/);
  assert.doesNotMatch(source, /Welcome\. Book your appointment here/);
});
