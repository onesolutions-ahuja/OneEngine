import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../server/services/connectorCapabilityRuntime.js", import.meta.url);

test("connector capability runtime stays provider-neutral", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  for (const forbidden of [
    "brevo_connector",
    "mailjet_connector",
    "smsgate_connector",
    "twilio",
    "whatsapp",
    "SEND_EMAIL",
    "SEND_SMS",
    "SEND_WHATSAPP",
    "email.send",
    "sms.send",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(source, /capabilityKey/);
  assert.match(source, /connector_capabilities/);
  assert.match(source, /service\.execute\(capabilityKey, payload\)/);
});
