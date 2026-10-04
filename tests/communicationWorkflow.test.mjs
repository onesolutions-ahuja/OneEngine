import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { COMMUNICATION_CHANNELS } from "../server/services/communicationCore.js";
import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { packageDefinitions } from "../server/services/packageRegistry.js";

test("Send Communication is the developer-facing communication primitive", () => {
  const definition = getWorkflowActionDefinition("SEND_COMMUNICATION");
  assert.ok(definition);
  assert.equal(typeof definition.executor, "function");
  assert.ok(COMMUNICATION_CHANNELS.includes("EMAIL"));
  assert.ok(COMMUNICATION_CHANNELS.includes("SMS"));
  assert.ok(COMMUNICATION_CHANNELS.includes("WHATSAPP"));
  assert.ok(COMMUNICATION_CHANNELS.includes("IN_APP"));
  assert.equal(getWorkflowActionDefinition("SEND_APPOINTMENT_MESSAGE"), null);
});

test("OneAssistant uses Send Communication rather than appointment-specific send actions", () => {
  const pkg = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
  assert.ok(pkg);
  const router = pkg.manifest.workflows.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
  assert.ok(router);
  const keys = router.action.actions.map((action) => action.key || action.type);
  assert.ok(keys.includes("SEND_COMMUNICATION"));
  assert.equal(keys.includes("SEND_APPOINTMENT_MESSAGE"), false);
});

test("Send Communication renders an in-app template by API name", async () => {
  const definition = getWorkflowActionDefinition("SEND_COMMUNICATION");
  const writes = [];
  const db = async (sql, params = []) => {
    const text = String(sql);
    if (text.includes("FROM platform_message_templates")) {
      return { rows: [{
        id: "11111111-1111-1111-1111-111111111111",
        api_key: "booking_notice",
        channel: "IN_APP",
        subject: "Booking for {{customer.name}}",
        body: "Hello {{customer.name}}",
      }] };
    }
    if (text.includes("SELECT id FROM users")) return { rows: [{ id: "22222222-2222-2222-2222-222222222222" }] };
    if (text.includes("INSERT INTO platform_notifications")) {
      writes.push({ sql: text, params });
      return { rows: [{ id: "33333333-3333-3333-3333-333333333333" }] };
    }
    if (text.includes("INSERT INTO platform_communication_events")) return { rows: [] };
    return { rows: [] };
  };

  const result = await definition.executor({
    db,
    companyId: "44444444-4444-4444-4444-444444444444",
    req: { user: { id: "22222222-2222-2222-2222-222222222222", companyId: "44444444-4444-4444-4444-444444444444" } },
    record: { customer: { name: "Ada" } },
    previousRecord: null,
    object: null,
    workflowVariables: { variables: {} },
    action: {
      key: "SEND_COMMUNICATION",
      channel: "IN_APP",
      recipient: "CURRENT_USER",
      templateKey: "booking_notice",
      templateContext: { customer: { name: "Ada" } },
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(result.channel, "IN_APP");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].params[2], "Booking for Ada");
  assert.equal(writes[0].params[3], "Hello Ada");
});

test("Send Communication rejects a template from another channel", async () => {
  const definition = getWorkflowActionDefinition("SEND_COMMUNICATION");
  const db = async (sql) => {
    if (String(sql).includes("FROM platform_message_templates")) {
      return { rows: [{ id: "template-1", api_key: "sms_only", channel: "SMS", subject: null, body: "SMS body" }] };
    }
    return { rows: [] };
  };
  const result = await definition.executor({
    db,
    companyId: "company-1",
    req: { user: { id: "user-1", companyId: "company-1" } },
    record: {},
    previousRecord: null,
    object: null,
    workflowVariables: { variables: {} },
    action: { key: "SEND_COMMUNICATION", channel: "IN_APP", recipient: "CURRENT_USER", templateKey: "sms_only" },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.code, "TEMPLATE_CHANNEL_MISMATCH");
});

test("Builder exposes structured Send Communication fields and hides legacy communication actions", () => {
  const source = readFileSync(new URL("../src/pages/developer/Builder2Page.jsx", import.meta.url), "utf8");
  assert.match(source, /CommunicationActionFields/);
  assert.match(source, /SEND_COMMUNICATION/);
  assert.match(source, /Email/);
  assert.match(source, /WhatsApp/);
  assert.match(source, /In-app notification/);
  assert.match(source, /LEGACY_COMMUNICATION_ACTIONS/);
  assert.doesNotMatch(source, /p\.actionKey==='SEND_APPOINTMENT_MESSAGE'/);
});
