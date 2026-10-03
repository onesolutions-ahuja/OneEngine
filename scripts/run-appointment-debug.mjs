const API = String(process.env.ONEPOS_API_URL || "https://oneengine.onrender.com").replace(/\/$/, "");
const ORIGIN = process.env.ONEPOS_E2E_ORIGIN || "https://onesolutions-ahuja.github.io";
const username = process.env.ONEPOS_E2E_USERNAME || "";
const password = process.env.ONEPOS_E2E_PASSWORD || "";

if (!username || !password) throw new Error("ONEPOS_E2E_USERNAME and ONEPOS_E2E_PASSWORD are required");

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function jsonFetch(path, { method = "GET", token = "", body = undefined, retries = 0 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${API}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Origin: ORIGIN,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
      if (!response.ok || payload?.success === false) {
        const error = new Error(`${method} ${path} failed: HTTP ${response.status} ${payload?.message || text || ""}`);
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) throw error;
      await sleep(2500);
    }
  }
  throw lastError;
}

const login = await jsonFetch("/api/auth/login", {
  method: "POST",
  body: { username, password },
  retries: 20,
});
if (!login?.token) throw new Error("Login succeeded without a bearer token");
const token = login.token;

const rules = await jsonFetch("/api/platform/rules", { token, retries: 3 });
const router = (rules?.data || []).find((item) => item.name === "OneAssistant - Booking Channel Router");
if (!router) throw new Error("OneAssistant - Booking Channel Router is not installed");
if (router.active !== true) throw new Error("OneAssistant - Booking Channel Router is not active");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resultStep(data, id) {
  return data?.variables?.steps?.[id] || null;
}

async function debugSavedRouter(channel, sender) {
  const suffix = `${Date.now()}-${channel.toLowerCase()}`;
  const response = await jsonFetch(`/api/platform/rules/${router.id}/debug`, {
    method: "POST",
    token,
    body: {
      mode: "debug",
      recordOverride: {
        channel,
        direction: "INBOUND",
        eventType: "RECEIVED",
        provider: channel === "SMS" ? "debug-smsgate" : "debug-whatsapp",
        providerMessageId: `debug-${channel.toLowerCase()}-${suffix}`,
        sender,
        recipient: "+447700900700",
        body: "APPOINTMENT",
        metadata: { conversationId: `debug-${channel.toLowerCase()}-${suffix}` },
      },
      assertions: [
        { type: "RUN_STATUS", expected: "COMPLETED" },
        { type: "RESOURCE_EQUALS", resource: "steps.session_context.route", expected: "STARTED" },
        { type: "RESOURCE_EQUALS", resource: "steps.session_context.channel", expected: channel },
        { type: "DECISION_OUTCOME", stepId: "channel_router", expected: channel === "SMS" ? "sms" : "whatsapp" },
        { type: "STEP_STATUS", stepId: channel === "SMS" ? "sms_send_date" : "whatsapp_send_date", expected: "COMPLETED" },
      ],
    },
  });
  const data = response?.data;
  console.log("DEBUG saved router action summary", (router?.action?.actions || []).map((item) => ({
    id: item?.id || null,
    key: item?.key || null,
    type: item?.type || null,
    configActionKey: item?.config?.actionKey || null,
    outcomes: Array.isArray(item?.outcomes) ? item.outcomes.map((outcome) => ({
      id: outcome?.id || null,
      label: outcome?.label || null,
      field: outcome?.condition?.conditions?.[0]?.field || null,
      value: outcome?.condition?.conditions?.[0]?.value ?? null,
      branch: outcome?.branch || [],
    })) : [],
  })));
  console.log("DEBUG session_context", JSON.stringify(data?.variables?.steps?.session_context || null));
  console.log("DEBUG channel_router", JSON.stringify(data?.variables?.steps?.channel_router || null));
  console.log("DEBUG result summary", JSON.stringify((data?.results || []).map((entry) => ({
    stepId: entry?.stepId || null,
    action: entry?.action || null,
    status: entry?.result?.status || null,
    route: entry?.result?.route || null,
    channel: entry?.result?.channel || null,
    outcomeId: entry?.result?.outcomeId ?? null,
    branch: entry?.result?.branch?.stepIds || [],
  }))));
  assert(data?.status === "COMPLETED", `${channel} saved-router Debug did not complete`);
  assert(data?.rolledBack === true, `${channel} Debug did not roll back`);
  assert(data?.externalActionsSimulated === true, `${channel} Debug did not simulate external actions`);
  assert(data?.assertionResult?.passed === true, `${channel} saved-router assertions failed: ${JSON.stringify(data?.assertionResult)}`);
  console.log(`PASS saved router ${channel}: APPOINTMENT -> channel route -> date response action (simulated send)`);
}

async function debugRestart() {
  const suffix = Date.now();
  const sender = "+447700900703";
  const response = await jsonFetch("/api/platform/rules/debug", {
    method: "POST",
    token,
    body: {
      mode: "debug",
      definition: {
        name: "Debug - Appointment Restart",
        triggerKey: "manual",
        action: {
          type: "workflow",
          actions: [
            { id: "first_start", key: "APPOINTMENT_SESSION_CONTEXT", channel: "SMS", sender, recipient: "+447700900700", body: "APPOINTMENT", sourceMessageId: `restart-first-${suffix}` },
            { id: "second_start", key: "APPOINTMENT_SESSION_CONTEXT", channel: "SMS", sender, recipient: "+447700900700", body: "APPOINTMENT", sourceMessageId: `restart-second-${suffix}` },
          ],
        },
      },
      assertions: [
        { type: "RUN_STATUS", expected: "COMPLETED" },
        { type: "RESOURCE_EQUALS", resource: "steps.first_start.route", expected: "STARTED" },
        { type: "RESOURCE_EQUALS", resource: "steps.second_start.route", expected: "STARTED" },
        { type: "RESOURCE_EQUALS", resource: "steps.second_start.restartedCount", expected: 1 },
      ],
    },
  });
  const data = response?.data;
  assert(data?.status === "COMPLETED", "Restart Debug did not complete");
  assert(data?.rolledBack === true, "Restart Debug did not roll back");
  assert(data?.assertionResult?.passed === true, `Restart assertions failed: ${JSON.stringify(data?.assertionResult)}`);
  console.log("PASS same-number restart: previous booking session closed and a fresh session started");
}

async function debugInvalidDate() {
  const suffix = Date.now();
  const response = await jsonFetch("/api/platform/rules/debug", {
    method: "POST",
    token,
    body: {
      mode: "debug",
      definition: {
        name: "Debug - Appointment Invalid Date",
        triggerKey: "manual",
        action: {
          type: "workflow",
          actions: [
            { id: "start", key: "APPOINTMENT_SESSION_CONTEXT", channel: "SMS", sender: "+447700900704", recipient: "+447700900700", body: "APPOINTMENT", sourceMessageId: `invalid-date-${suffix}` },
            { id: "date", key: "PROCESS_APPOINTMENT_DATE_RESPONSE", bookingCaseId: { path: "steps.start.bookingCaseId" }, body: "wrong-date" },
          ],
        },
      },
      assertions: [
        { type: "RUN_STATUS", expected: "COMPLETED" },
        { type: "RESOURCE_EQUALS", resource: "steps.date.result", expected: "INVALID_DATE" },
      ],
    },
  });
  const data = response?.data;
  assert(data?.assertionResult?.passed === true, `Invalid-date assertions failed: ${JSON.stringify(data?.assertionResult)}`);
  console.log("PASS invalid date: bad customer input follows the validation path");
}

async function debugFullBooking() {
  const suffix = Date.now();
  const response = await jsonFetch("/api/platform/rules/debug", {
    method: "POST",
    token,
    body: {
      mode: "debug",
      definition: {
        name: "Debug - Appointment Full Booking",
        triggerKey: "manual",
        action: {
          type: "workflow",
          actions: [
            { id: "start", key: "APPOINTMENT_SESSION_CONTEXT", channel: "SMS", sender: "+447700900705", recipient: "+447700900700", body: "APPOINTMENT", sourceMessageId: `full-booking-${suffix}` },
            { id: "date", key: "PROCESS_APPOINTMENT_DATE_RESPONSE", bookingCaseId: { path: "steps.start.bookingCaseId" }, body: "2" },
            { id: "slot", key: "PROCESS_APPOINTMENT_SLOT_RESPONSE", bookingCaseId: { path: "steps.start.bookingCaseId" }, body: "1" },
          ],
        },
      },
    },
  });
  const data = response?.data;
  assert(data?.status === "COMPLETED", `Full booking Debug failed: ${JSON.stringify(data?.friendlyError || data)}`);
  assert(data?.rolledBack === true, "Full booking Debug did not roll back");
  const date = resultStep(data, "date");
  const slot = resultStep(data, "slot");
  assert(date?.result === "SLOTS_READY", `Expected seeded availability, got date result: ${JSON.stringify(date)}`);
  assert(slot?.result === "CONFIRMED", `Expected slot confirmation, got: ${JSON.stringify(slot)}`);
  console.log(`PASS full booking: date -> ${date.slotCount} live slots -> slot 1 -> confirmation, all rolled back`);
}

await debugSavedRouter("SMS", "+447700900701");
await debugSavedRouter("WHATSAPP", "+447700900702");
await debugRestart();
await debugInvalidDate();
await debugFullBooking();

console.log("Appointment Workflow Debug suite passed.");
