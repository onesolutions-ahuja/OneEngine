import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { packageDefinitions } from "../server/services/packageRegistry.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

const OBSOLETE = [
  "APPOINTMENT_SESSION_CONTEXT",
  "PROCESS_APPOINTMENT_DATE_RESPONSE",
  "PROCESS_APPOINTMENT_SLOT_RESPONSE",
  "PROCESS_APPOINTMENT_CONVERSATION",
  "SEND_APPOINTMENT_CONVERSATION_REPLY",
  "FIND_APPOINTMENT_SLOTS",
  "HOLD_APPOINTMENT_SLOT",
  "RELEASE_APPOINTMENT_SLOT",
  "LIST_APPOINTMENT_PAYMENT_PROVIDERS",
  "CREATE_APPOINTMENT_PAYMENT_REQUEST",
  "CALCULATE_APPOINTMENT_PAYMENT",
  "CONFIRM_APPOINTMENT",
];

function oneAssistantRouter() {
  const pkg = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
  assert.ok(pkg, "OneAssistant package must exist");
  const workflow = pkg.manifest.workflows.find((item) => item.name === "OneAssistant - Booking Channel Router");
  assert.ok(workflow, "booking channel router must exist");
  return { pkg, workflow };
}

test("OneAssistant booking router uses visible Builder primitives", () => {
  const { workflow } = oneAssistantRouter();
  assert.equal(workflow.active, true);
  assert.equal(workflow.triggerKey, "communication_message_received");
  assert.equal(workflow.action.flowType, "platform_event");
  assert.equal(workflow.action.start.eventKey, "communication_message_received");

  const keys = workflow.action.actions.map((action) => action.key);
  for (const key of ["GET_RECORDS", "CREATE_RECORD", "UPDATE_RECORD", "CONDITION", "ASSIGNMENT"]) {
    assert.ok(keys.includes(key), key + " must be visible in the booking flow");
    assert.ok(getWorkflowActionDefinition(key), key + " must remain a registered generic primitive");
  }
  for (const hidden of OBSOLETE) {
    assert.equal(keys.includes(hidden), false, hidden + " must not appear in the booking flow");
    assert.equal(getWorkflowActionDefinition(hidden), null, hidden + " must be removed from the executable action registry");
  }

  const createAppointment = workflow.action.actions.find((action) => action.id === "create_appointment");
  assert.equal(createAppointment.objectKey, "appointment");
  assert.ok(createAppointment.fieldValues.starts_at);
  assert.ok(createAppointment.fieldValues.ends_at);
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
            conditions: [{ field: "steps.lookup.channel", operator: "equals", value: "SMS" }],
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
    workflowVariables: { steps: { lookup: { channel: "SMS" } }, variables: {} },
  });
  assert.equal(result.outcomeId, "sms");
  assert.equal(result.matched, true);
});

test("SMSGate webhook only records inbound communication and no longer hard-codes booking links", () => {
  const source = readFileSync(new URL("../server/routes/smsGateWebhooks.js", import.meta.url), "utf8");
  assert.match(source, /recordCommunicationEvent/);
  assert.match(source, /workflowDispatched/);
  assert.doesNotMatch(source, /createAppointmentBookingCase/);
  assert.doesNotMatch(source, /issueAppointmentPublicLink/);
  assert.doesNotMatch(source, /Welcome\. Book your appointment here/);
});
