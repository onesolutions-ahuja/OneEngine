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
  assert.ok(keys.includes("GET_RECORDS"));
  assert.ok(keys.includes("CREATE_RECORD"));
  assert.ok(keys.includes("UPDATE_RECORD"));
  assert.ok(keys.includes("CONDITION"));
  assert.ok(keys.includes("ASSIGNMENT"));
  assert.ok(keys.includes("SEND_COMMUNICATION"));
  assert.equal(keys.includes("APPOINTMENT_SESSION_CONTEXT"), false);
  assert.equal(keys.includes("PROCESS_APPOINTMENT_CONVERSATION"), false);
  assert.equal(keys.includes("PROCESS_APPOINTMENT_DATE_RESPONSE"), false);
  assert.equal(keys.includes("PROCESS_APPOINTMENT_SLOT_RESPONSE"), false);

  const channelRouter = actions.find((action) => action.id === "channel_router");
  assert.deepEqual(channelRouter.outcomes.map((outcome) => outcome.label), ["SMS", "WhatsApp"]);

  const channelAssignments = actions.filter((action) => action.key === "ASSIGNMENT" && action.variableName === "messageChannel");
  assert.ok(channelAssignments.some((action) => action.value === "SMS"));
  assert.ok(channelAssignments.some((action) => action.value === "WHATSAPP"));
  const sends = actions.filter((action) => action.key === "SEND_COMMUNICATION");
  assert.ok(sends.length > 0);
  assert.ok(sends.every((action) => action.channel === "SMS"));
  assert.ok(sends.every((action) => typeof action.message === "string" && action.message.length > 0));
  const whatsappApi = actions.filter((action) => action.key === "ONE_HTTP_REQUEST" && action.providerKey === "whatsapp");
  assert.ok(whatsappApi.length > 0);
  assert.ok(whatsappApi.every((action) => action.method === "POST" && action.endpoint === "/{{phoneNumberId}}/messages"));

  assert.equal(
    packageDefinitions().find((definition) => definition.packageKey === "one_assistant")
      .manifest.workflows.some((item) => item.name === "OneAssistant - Email Booking"),
    false,
    "inactive legacy Email booking flow must not be packaged"
  );
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

test("booking router graph reaches service, availability, confirmation and only starts new sessions explicitly", () => {
  const { workflow } = oneAssistantRouter();
  const actions = workflow.action.actions;
  const byId = new Map(actions.map((action) => [action.id, action]));
  const hasCase = byId.get("has_case");
  assert.deepEqual(hasCase.defaultBranch, ["is_booking_request"]);
  const start = byId.get("is_booking_request");
  assert.ok(start);
  assert.equal(start.defaultBranch.length, 0);
  assert.ok(start.outcomes.every((outcome) => outcome.branch.includes("create_case") && outcome.branch.includes("send_initial_prompt")));
  const validateDate = byId.get("validate_date");
  assert.ok(validateDate.outcomes.every((outcome) => outcome.branch.includes("service_found")));
  assert.deepEqual(validateDate.defaultBranch, ["parse_custom_date","custom_date_valid"]);
  assert.ok(byId.get("custom_date_valid").outcomes[0].branch.includes("service_found"));
  assert.ok(byId.get("service_found").outcomes[0].branch.includes("resource_service_found"));
  assert.ok(byId.get("resource_service_found").outcomes[0].branch.includes("resource_found"));
  assert.ok(byId.get("resource_found").outcomes[0].branch.includes("availability_rules_found"));
  assert.ok(byId.get("availability_rules_found").outcomes[0].branch.includes("availability_found"));
  assert.ok(byId.get("validate_slot").outcomes.every((outcome) => outcome.branch.includes("confirm_case") && outcome.branch.includes("send_confirmation")));
  const getCase = byId.get("get_case");
  for (const status of ["CONFIRMED","CANCELLED","EXPIRED"]) {
    assert.ok(getCase.filters.some((filter) => filter.field === "status" && filter.operator === "not_equals" && filter.value === status));
  }
});

test("booking router restarts stale sessions and uses token-safe 15 minute waits", () => {
  const { workflow } = oneAssistantRouter();
  const byId = new Map(workflow.action.actions.map((action) => [action.id, action]));
  const hasCase = byId.get("has_case");
  for (const outcomeId of ["restart_upper","restart_title","restart_lower"]) {
    const outcome = hasCase.outcomes.find((item) => item.id === outcomeId);
    assert.ok(outcome);
    assert.ok(outcome.branch.includes("expire_existing_case"));
    assert.ok(outcome.branch.includes("create_case"));
    assert.ok(outcome.branch.includes("wait_date_timeout"));
  }
  for (const waitId of ["wait_date_timeout","wait_slot_timeout"]) {
    assert.equal(byId.get(waitId)?.key, "WAIT_DURATION");
    assert.equal(byId.get(waitId)?.amount, 15);
    assert.equal(byId.get(waitId)?.unit, "minutes");
  }
  assert.equal(byId.get("create_case")?.fieldValues?.state?.waitToken?.path, "variables.currentTime");
  assert.equal(byId.get("save_date_state")?.fieldValues?.state?.waitToken?.path, "variables.currentTime");
  assert.ok(byId.get("date_timeout_still_waiting")?.outcomes?.[0]?.condition?.conditions?.some((condition) =>
    condition.field === "steps.refresh_case_after_date_wait.record.state.waitToken" &&
    condition.operator === "equals" &&
    condition.value?.path === "variables.currentTime"
  ));
  assert.ok(byId.get("slot_timeout_still_waiting")?.outcomes?.[0]?.condition?.conditions?.some((condition) =>
    condition.field === "steps.refresh_case_after_slot_wait.record.state.waitToken" &&
    condition.operator === "equals" &&
    condition.value?.path === "variables.currentTime"
  ));
});

test("Decision supports indexed collection paths used by appointment slot choices", async () => {
  const decision = getWorkflowActionDefinition("CONDITION");
  const result = await decision.executor({
    action: {
      outcomes: [{
        id: "first",
        label: "First slot",
        condition: { match: "all", conditions: [{ field: "steps.case.record.state.slots.0.startsAt", operator: "is_not_empty" }] },
        branch: [],
      }],
      defaultBranch: [],
    },
    fields: [],
    record: {},
    previousRecord: null,
    req: { user: { companyId: "company-1" } },
    object: null,
    workflowVariables: { variables: {}, steps: { case: { record: { state: { slots: [{ startsAt: "2026-10-05T10:00:00Z" }] } } } } },
  });
  assert.equal(result.outcomeId, "first");
  assert.equal(result.matched, true);
});

test("generic Flow HTTP preserves provider base URL paths", () => {
  const coreSource = readFileSync(new URL("../server/services/oneCoreFunctions.js", import.meta.url), "utf8");
  assert.match(coreSource, /renderedEndpoint\.replace\(\/\^\\\/\+\//);
  assert.match(coreSource, /absoluteEndpoint/);
});

test("generic Flow HTTP runtime does not depend on connector definitions", () => {
  const coreSource = readFileSync(new URL("../server/services/oneCoreFunctions.js", import.meta.url), "utf8");
  const start = coreSource.indexOf("export async function oneHttpRequest");
  const end = coreSource.indexOf("export function oneHttpRequestDefinition", start);
  const runtime = coreSource.slice(start, end);
  assert.doesNotMatch(runtime, /platform_connector_definitions/);
  assert.match(runtime, /FROM integration_connections/);
  assert.match(runtime, /LOWER\(provider_name\)=LOWER/);
});

test("WhatsApp Flow API uses normalized recipient and fails the workflow on provider HTTP errors", () => {
  const { workflow } = oneAssistantRouter();
  const apiSteps = workflow.action.actions.filter((action) => action.key === "ONE_HTTP_REQUEST" && action.providerKey === "whatsapp");
  assert.ok(apiSteps.length > 0);
  assert.ok(apiSteps.every((action) => action.requireSuccess === true));
  assert.ok(apiSteps.every((action) => action.body?.to?.path === "metadata.senderDigits"));
});

test("booking router validates custom dates, no-slot retry state and slot bounds", () => {
  const { workflow } = oneAssistantRouter();
  const byId = new Map(workflow.action.actions.map((action) => [action.id, action]));
  assert.equal(byId.get("parse_custom_date")?.key, "FORMULA");
  assert.equal(byId.get("parse_custom_date")?.expression, "PARSEDATE(inputDate)");
  assert.deepEqual(byId.get("custom_date_valid")?.defaultBranch, ["refresh_date_wait_token","send_invalid_date","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]);
  assert.deepEqual(byId.get("custom_date_valid")?.outcomes?.[0]?.branch?.slice(0,1), ["set_next_custom_date"]);
  assert.ok(byId.get("custom_date_valid")?.outcomes?.[0]?.condition?.conditions?.some((condition) => condition.field === "variables.selectedDate" && condition.operator === "greater_than" && condition.value?.path === "variables.currentDate"));
  assert.equal(byId.has("set_custom_date"), false);
  assert.deepEqual(byId.get("availability_rules_found")?.defaultBranch, ["reset_to_date","send_no_slots","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]);
  assert.deepEqual(byId.get("availability_found")?.defaultBranch, ["reset_to_date","send_no_slots","wait_date_timeout","refresh_case_after_date_wait","date_timeout_still_waiting"]);
  assert.ok(byId.get("get_busy_appointments")?.filters?.some((filter) => filter.field === "starts_at" && filter.operator === "greater_than_or_equal"));
  assert.ok(byId.get("get_busy_appointments")?.filters?.some((filter) => filter.field === "starts_at" && filter.operator === "less_than"));
  assert.equal(byId.get("reset_to_date")?.fieldValues?.state?.step, "AWAITING_DATE");
  const slotDecision = byId.get("validate_slot");
  for (let index = 0; index < 5; index += 1) {
    assert.ok(slotDecision.outcomes[index].condition.conditions.some((condition) =>
      condition.field === `steps.get_case.record.state.slots.${index}.startsAt` &&
      condition.operator === "is_not_empty"
    ));
  }
});

test("direct Flow HTTP retains OAuth client-credentials metadata from the connection", () => {
  const coreSource = readFileSync(new URL("../server/services/oneCoreFunctions.js", import.meta.url), "utf8");
  const start = coreSource.indexOf("export async function oneHttpRequest");
  const end = coreSource.indexOf("export function oneHttpRequestDefinition", start);
  const runtime = coreSource.slice(start, end);
  assert.match(runtime, /tokenUrl.*token_url/);
  assert.match(runtime, /oauth_client_credentials/);
  assert.doesNotMatch(runtime, /operations:\s*\[\]/);
});

test("communication event ingestion is idempotent by provider message id", () => {
  const source = readFileSync(new URL("../server/services/communicationCore.js", import.meta.url), "utf8");
  assert.match(source, /provider_message_id=\$3/);
  assert.match(source, /if \(existing\.rows\?\.\[0\]\) return \{ \.\.\.existing\.rows\[0\], duplicate: true, workflowDispatched: false \}/);
});

test("startup verifies the canonical booking router rather than a retired WhatsApp flow", () => {
  const source = readFileSync(new URL("../server/server.js", import.meta.url), "utf8");
  assert.match(source, /OneAssistant_Booking_Channel_Router/);
  assert.doesNotMatch(source, /r\.name='OneAssistant - WhatsApp Booking'/);
});

test("WhatsApp Flow transport has no connector-definition runtime dependency", () => {
  const source = readFileSync(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  const start = source.indexOf('key: "SEND_COMMUNICATION"');
  const end = source.indexOf('key: "IN_APP_NOTIFICATION"', start);
  const sendCommunication = source.slice(start, end);
  assert.doesNotMatch(sendCommunication, /platform_connector_definitions/);
  assert.doesNotMatch(sendCommunication, /connector_definition_id/);
});

test("booking router exposes business logic as Builder primitives", () => {
  const { workflow } = oneAssistantRouter();
  const keys = workflow.action.actions.map((action) => action.key);
  for (const key of ["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","CONDITION","ASSIGNMENT","FORMULA","TIME_WINDOW_EXPAND","COLLECTION_EXCLUDE_OVERLAPS","COLLECTION_SORT","COLLECTION_FORMAT_TEXT","WAIT_DURATION","SEND_COMMUNICATION","ONE_HTTP_REQUEST"]) {
    const definition = getWorkflowActionDefinition(key);
    assert.ok(definition, `${key} must be registered`);
    assert.equal(typeof definition.executor, "function");
    assert.ok(keys.includes(key), `${key} must be visible in the booking flow`);
  }
  for (const hidden of ["APPOINTMENT_SESSION_CONTEXT","PROCESS_APPOINTMENT_CONVERSATION","PROCESS_APPOINTMENT_DATE_RESPONSE","PROCESS_APPOINTMENT_SLOT_RESPONSE","FIND_APPOINTMENT_SLOTS","SEND_APPOINTMENT_MESSAGE"]) {
    assert.equal(keys.includes(hidden), false, `${hidden} must not hide booking business logic`);
  }

  for (const removed of [
    "APPOINTMENT_SESSION_CONTEXT",
    "PROCESS_APPOINTMENT_DATE_RESPONSE",
    "PROCESS_APPOINTMENT_SLOT_RESPONSE",
    "PROCESS_APPOINTMENT_CONVERSATION",
    "SEND_APPOINTMENT_CONVERSATION_REPLY",
    "HOLD_APPOINTMENT_SLOT",
    "RELEASE_APPOINTMENT_SLOT",
    "LIST_APPOINTMENT_PAYMENT_PROVIDERS",
    "CREATE_APPOINTMENT_PAYMENT_REQUEST",
    "CALCULATE_APPOINTMENT_PAYMENT",
    "CONFIRM_APPOINTMENT",
    "RUN_ASSISTANT_SUBFLOW",
    "COMPLETE_APPOINTMENT_PAYMENT",
    "SEND_APPOINTMENT_CONFIRMATION",
    "ISSUE_APPOINTMENT_BOOKING_LINK",
    "CREATE_APPOINTMENT_BOOKING_CASE",
  ]) {
    assert.equal(getWorkflowActionDefinition(removed), null, removed + " must be removed from the executable registry");
  }
  const createAppointment = workflow.action.actions.find((action) => action.id === "create_appointment");
  assert.equal(createAppointment.objectKey, "appointment");
  assert.ok(createAppointment.fieldValues.starts_at);
  assert.ok(createAppointment.fieldValues.ends_at);
});

test("SMSGate webhook only records inbound communication and no longer hard-codes booking links", () => {
  const source = readFileSync(new URL("../server/routes/smsGateWebhooks.js", import.meta.url), "utf8");
  assert.match(source, /recordCommunicationEvent/);
  assert.match(source, /workflowDispatched/);
  assert.doesNotMatch(source, /createAppointmentBookingCase/);
  assert.doesNotMatch(source, /issueAppointmentPublicLink/);
  assert.doesNotMatch(source, /Welcome\. Book your appointment here/);
});


test("OneAssistant exposes service-resource and slot-hold metadata for visible availability Flow", () => {
  const pkg = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
  const objects = pkg?.manifest?.objects || [];
  const keys = objects.map((item) => item.objectKey);
  assert.ok(keys.includes("appointment_resource_service"));
  assert.ok(keys.includes("appointment_slot_hold"));
});

test("generic slot primitives expand, exclude overlaps and format text", async () => {
  const expand = getWorkflowActionDefinition("TIME_WINDOW_EXPAND");
  const exclude = getWorkflowActionDefinition("COLLECTION_EXCLUDE_OVERLAPS");
  const format = getWorkflowActionDefinition("COLLECTION_FORMAT_TEXT");
  assert.ok(expand && exclude && format);

  const workflowVariables = { variables: {} };
  const expanded = await expand.executor({
    action: {
      collection: [{ weekday: 1, start_time: "09:00", end_time: "11:00", slot_interval_minutes: 30 }],
      date: "2026-10-05",
      durationMinutes: 60,
      limit: 10,
    },
    record: {}, previousRecord: null, req: { user: {} }, object: null, workflowVariables,
  });
  assert.deepEqual(expanded.collection.map((slot) => slot.time), ["09:00","09:30","10:00"]);

  const available = await exclude.executor({
    action: {
      collection: expanded.collection,
      busyCollection: [{ starts_at: "2026-10-05T09:30:00.000Z", ends_at: "2026-10-05T10:30:00.000Z" }],
    },
    record: {}, previousRecord: null, req: { user: {} }, object: null, workflowVariables,
  });
  assert.deepEqual(available.collection.map((slot) => slot.time), []);

  const formatted = await format.executor({
    action: { collection: expanded.collection.slice(0,2), lineTemplate: "{{index}}. {{item.time}}", separator: "\n" },
    record: {}, previousRecord: null, req: { user: {} }, object: null, workflowVariables,
  });
  assert.equal(formatted.text, "1. 09:00\n2. 09:30");
});


test("generic Send Communication supports in-app notifications", async () => {
  const definition = getWorkflowActionDefinition("SEND_COMMUNICATION");
  assert.ok(definition);
  const queries = [];
  const db = async (sql, params = []) => {
    queries.push({ sql, params });
    if (String(sql).includes("SELECT id FROM users")) return { rows: [{ id: "user-1" }] };
    if (String(sql).includes("INSERT INTO platform_notifications")) return { rows: [{ id: "notification-1" }] };
    return { rows: [] };
  };
  const result = await definition.executor({
    db,
    companyId: "company-1",
    req: { user: { id: "user-1", companyId: "company-1" } },
    record: { customer: { name: "Ada" } },
    previousRecord: null,
    object: null,
    workflowVariables: { variables: {} },
    action: {
      key: "SEND_COMMUNICATION",
      channel: "IN_APP",
      recipient: "CURRENT_USER",
      title: "Booking update",
      message: "Hello {{customer.name}}",
      templateContext: { customer: { name: "Ada" } },
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.channel, "IN_APP");
  assert.ok(queries.some((entry) => String(entry.sql).includes("INSERT INTO platform_notifications")));
});

test("appointment-specific communication sender is removed from executable registry", () => {
  assert.equal(getWorkflowActionDefinition("SEND_APPOINTMENT_MESSAGE"), null);
});


test("OneAssistant WhatsApp transport is visible in Flow as generic HTTP", () => {
  const { workflow } = oneAssistantRouter();
  const actions = workflow.action.actions;
  const apiSteps = actions.filter((action) => action.key === "ONE_HTTP_REQUEST" && action.providerKey === "whatsapp");
  assert.ok(apiSteps.length > 0);
  assert.ok(apiSteps.every((action) => action.method === "POST"));
  assert.ok(apiSteps.every((action) => action.endpoint === "/{{phoneNumberId}}/messages"));
  assert.equal(actions.some((action) => action.key === "SEND_COMMUNICATION" && String(action.channel || "").toUpperCase() === "WHATSAPP"), false);
});



test("single-router migration retires converted legacy appointment workflows", () => {
  const source = readFileSync(new URL("../server/database/init.js", import.meta.url), "utf8");
  assert.match(source, /0062_oneassistant_single_event_router/);
  assert.match(source, /System · Action · Appointments - Process Conversation/);
  assert.match(source, /System · Action · Appointments - Send Conversation Reply/);
  assert.match(source, /System · Action · Appointments - Process Date Response/);
  assert.match(source, /System · Action · Appointments - Process Slot Response/);
  assert.match(source, /id<>\$2/);
  assert.match(source, /OneAssistant event router dedupe verification failed/);
});
