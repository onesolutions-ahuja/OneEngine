import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

test("system workflow catalogue exposes Send Communication but not legacy transports", () => {
  const keys = systemWorkflowDefinitions().map((item) => item.systemKey);
  assert.ok(keys.includes("action:SEND_COMMUNICATION"));
  for (const key of [
    "action:SEND_EMAIL",
    "action:SEND_SMS",
    "action:SEND_WHATSAPP",
    "action:IN_APP_NOTIFICATION",
  ]) {
    assert.equal(keys.includes(key), false, key + " must remain internal compatibility only");
  }
});

test("Send Communication resolves templates and can notify platform admins", async () => {
  const action = getWorkflowActionDefinition("SEND_COMMUNICATION");
  assert.ok(action);

  const notifications = [];
  const db = async (sql, params = []) => {
    const text = String(sql);
    if (text.includes("FROM platform_message_templates")) {
      return {
        rows: [{
          id: "11111111-1111-1111-1111-111111111111",
          api_key: "licence_notice",
          channel: "IN_APP",
          subject: "Request from {{company.name}}",
          body: "{{company.name}} requested {{package.name}}",
        }],
      };
    }
    if (text.includes("SELECT DISTINCT u.id")) {
      return { rows: [{ id: "admin-1" }, { id: "admin-2" }] };
    }
    if (text.includes("INSERT INTO platform_notifications")) {
      notifications.push(params);
      return { rows: [{ id: "notification" }] };
    }
    if (text.includes("INSERT INTO platform_communication_events")) return { rows: [] };
    return { rows: [] };
  };

  const result = await action.executor({
    db,
    companyId: "company-1",
    req: { user: { id: "requester-1", companyId: "company-1" } },
    record: {},
    previousRecord: null,
    object: null,
    workflowVariables: { variables: {} },
    action: {
      key: "SEND_COMMUNICATION",
      channel: "IN_APP",
      recipient: "platform_superadmins",
      templateKey: "licence_notice",
      templateContext: {
        company: { name: "Acme" },
        package: { name: "OneAssistant" },
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(result.recipients, ["admin-1", "admin-2"]);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[0][2], "Request from Acme");
  assert.equal(notifications[0][3], "Acme requested OneAssistant");
});

test("licence requests no longer create notifications outside Flow", () => {
  const source = readFileSync(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  const start = source.indexOf("async function executeLicenceRequestPackageAction");
  const end = source.indexOf("async function resolveEmailWorkflowAction", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /INSERT INTO platform_notifications/);
  assert.match(body, /SEND_COMMUNICATION/);
  assert.match(body, /channel: "IN_APP"/);
  assert.match(body, /channel: "EMAIL"/);
});

test("communication upgrade migration converts legacy steps", () => {
  const source = readFileSync(new URL("../server/database/init.js", import.meta.url), "utf8");
  assert.match(source, /0052_migrate_legacy_communication_steps/);
  assert.match(source, /SEND_IN_APP_NOTIFICATION: "IN_APP"/);
  assert.match(source, /next\.key = "SEND_COMMUNICATION"/);
  assert.match(source, /platform_message_templates_channel_check/);
});
