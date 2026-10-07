import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getWorkflowActionDefinition } from "../server/services/platformWorkflow.js";

test("workflow decisions can route on outputs from previous steps", async () => {
  const decision = getWorkflowActionDefinition("CONDITION");
  assert.ok(decision);
  const result = await decision.executor({
    action: {
      outcomes: [{
        id: "matched",
        label: "Matched",
        condition: {
          match: "all",
          conditions: [{ field: "steps.previous.channel", operator: "equals", value: "GENERIC" }],
        },
        branch: [],
      }],
      defaultBranch: [],
    },
    fields: [],
    record: {},
    previousRecord: null,
    req: { user: { companyId: "company-1" } },
    object: null,
    workflowVariables: { steps: { previous: { channel: "GENERIC" } }, variables: {} },
  });
  assert.equal(result.outcomeId, "matched");
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

test("generic Flow HTTP retains OAuth client-credentials metadata from the connection", () => {
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
  assert.match(source, /duplicate: true, workflowDispatched: false/);
});

test("generic communication workflow action has no connector-definition runtime dependency", () => {
  const source = readFileSync(new URL("../server/services/platformWorkflow.js", import.meta.url), "utf8");
  const start = source.indexOf('key: "SEND_COMMUNICATION"');
  const end = source.indexOf('key: "IN_APP_NOTIFICATION"', start);
  const sendCommunication = source.slice(start, end);
  assert.ok(start >= 0);
  assert.doesNotMatch(sendCommunication, /platform_connector_definitions/);
  assert.doesNotMatch(sendCommunication, /connector_definition_id/);
});
