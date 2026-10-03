import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const API = String(process.env.ONEPOS_API_URL || "https://oneengine.onrender.com").replace(/\/$/, "");

async function auth(page) {
  const configured = await loginIfConfigured(page);
  test.skip(!configured, "ONEPOS_E2E_USERNAME / ONEPOS_E2E_PASSWORD are required");
  const token = await page.evaluate(() => sessionStorage.getItem("onepos_token") || localStorage.getItem("onepos_token") || "");
  expect(token).not.toBe("");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Origin: process.env.ONEPOS_E2E_ORIGIN || "https://onesolutions-ahuja.github.io",
  };
}

async function apiJson(page, method, pathname, headers, body) {
  const response = await page.request.fetch(`${API}${pathname}`, {
    method,
    headers,
    data: body,
    timeout: 60_000,
  });
  let json = null;
  try { json = await response.json(); } catch {}
  expect(response.ok(), `${method} ${pathname} failed: ${response.status()} ${JSON.stringify(json)}`).toBeTruthy();
  expect(json?.success, `${method} ${pathname} returned unsuccessful payload: ${JSON.stringify(json)}`).not.toBe(false);
  return json;
}

async function router(page, headers) {
  const rules = await apiJson(page, "GET", "/api/platform/rules", headers);
  const row = (rules?.data || []).find((item) => item.name === "OneAssistant - Booking Channel Router");
  expect(row, "OneAssistant - Booking Channel Router must be installed").toBeTruthy();
  expect(row.active, "Booking Channel Router must be active").toBe(true);
  return row;
}

function debugRecord(channel, suffix) {
  return {
    channel,
    direction: "INBOUND",
    eventType: "RECEIVED",
    provider: channel === "SMS" ? "debug-smsgate" : "debug-whatsapp",
    providerMessageId: `workflow-debug-${channel.toLowerCase()}-${suffix}`,
    sender: channel === "SMS" ? "+447700900701" : "+447700900702",
    recipient: "+447700900700",
    body: "APPOINTMENT",
    metadata: { conversationId: `workflow-debug-${channel.toLowerCase()}-${suffix}` },
  };
}

test.describe.configure({ mode: "serial" });

test("saved booking router Debug follows SMS and WhatsApp branches without sending", async ({ page }) => {
  const headers = await auth(page);
  const flow = await router(page, headers);

  for (const channel of ["SMS", "WHATSAPP"]) {
    const suffix = `${Date.now()}-${channel.toLowerCase()}`;
    const result = await apiJson(page, "POST", `/api/platform/rules/${flow.id}/debug`, headers, {
      mode: "debug",
      recordOverride: debugRecord(channel, suffix),
      assertions: [
        { type: "RUN_STATUS", expected: "COMPLETED" },
        { type: "RESOURCE_EQUALS", resource: "steps.session_context.route", expected: "STARTED" },
        { type: "RESOURCE_EQUALS", resource: "steps.session_context.channel", expected: channel },
        { type: "DECISION_OUTCOME", stepId: "channel_router", expected: channel === "SMS" ? "sms" : "whatsapp" },
        { type: "STEP_STATUS", stepId: channel === "SMS" ? "sms_send_date" : "whatsapp_send_date", expected: "COMPLETED" },
      ],
    });
    expect(result.data.status).toBe("COMPLETED");
    expect(result.data.rolledBack).toBe(true);
    expect(result.data.externalActionsSimulated).toBe(true);
    expect(result.data.assertionResult?.passed).toBe(true);
  }
});

test("Debug proves APPOINTMENT from same number closes previous session and starts a new one", async ({ page }) => {
  const headers = await auth(page);
  const sender = "+447700900703";
  const suffix = Date.now();
  const definition = {
    name: "Debug - Appointment Restart",
    triggerKey: "manual",
    action: {
      type: "workflow",
      actions: [
        {
          id: "first_start",
          key: "APPOINTMENT_SESSION_CONTEXT",
          channel: "SMS",
          sender,
          recipient: "+447700900700",
          body: "APPOINTMENT",
          sourceMessageId: `restart-first-${suffix}`,
        },
        {
          id: "second_start",
          key: "APPOINTMENT_SESSION_CONTEXT",
          channel: "SMS",
          sender,
          recipient: "+447700900700",
          body: "APPOINTMENT",
          sourceMessageId: `restart-second-${suffix}`,
        },
      ],
    },
  };
  const result = await apiJson(page, "POST", "/api/platform/rules/debug", headers, {
    mode: "debug",
    definition,
    assertions: [
      { type: "RUN_STATUS", expected: "COMPLETED" },
      { type: "RESOURCE_EQUALS", resource: "steps.first_start.route", expected: "STARTED" },
      { type: "RESOURCE_EQUALS", resource: "steps.second_start.route", expected: "STARTED" },
      { type: "RESOURCE_EQUALS", resource: "steps.second_start.restartedCount", expected: 1 },
    ],
  });
  expect(result.data.status).toBe("COMPLETED");
  expect(result.data.rolledBack).toBe(true);
  expect(result.data.assertionResult?.passed).toBe(true);
});

test("Debug validates bad date input and exercises date-to-slot-to-confirmation when seeded availability exists", async ({ page }) => {
  const headers = await auth(page);
  const suffix = Date.now();

  const invalidDefinition = {
    name: "Debug - Appointment Invalid Date",
    triggerKey: "manual",
    action: {
      type: "workflow",
      actions: [
        {
          id: "start",
          key: "APPOINTMENT_SESSION_CONTEXT",
          channel: "SMS",
          sender: "+447700900704",
          recipient: "+447700900700",
          body: "APPOINTMENT",
          sourceMessageId: `invalid-date-${suffix}`,
        },
        {
          id: "date",
          key: "PROCESS_APPOINTMENT_DATE_RESPONSE",
          bookingCaseId: { path: "steps.start.bookingCaseId" },
          body: "wrong-date",
        },
      ],
    },
  };
  const invalid = await apiJson(page, "POST", "/api/platform/rules/debug", headers, {
    mode: "debug",
    definition: invalidDefinition,
    assertions: [
      { type: "RUN_STATUS", expected: "COMPLETED" },
      { type: "RESOURCE_EQUALS", resource: "steps.date.result", expected: "INVALID_DATE" },
    ],
  });
  expect(invalid.data.assertionResult?.passed).toBe(true);

  const bookingDefinition = {
    name: "Debug - Appointment Full Booking",
    triggerKey: "manual",
    action: {
      type: "workflow",
      actions: [
        {
          id: "start",
          key: "APPOINTMENT_SESSION_CONTEXT",
          channel: "SMS",
          sender: "+447700900705",
          recipient: "+447700900700",
          body: "APPOINTMENT",
          sourceMessageId: `full-booking-${suffix}`,
        },
        {
          id: "date",
          key: "PROCESS_APPOINTMENT_DATE_RESPONSE",
          bookingCaseId: { path: "steps.start.bookingCaseId" },
          body: "2",
        },
        {
          id: "slot",
          key: "PROCESS_APPOINTMENT_SLOT_RESPONSE",
          bookingCaseId: { path: "steps.start.bookingCaseId" },
          body: "1",
        },
      ],
    },
  };
  const booking = await apiJson(page, "POST", "/api/platform/rules/debug", headers, {
    mode: "debug",
    definition: bookingDefinition,
  });
  expect(booking.data.status).toBe("COMPLETED");
  expect(booking.data.rolledBack).toBe(true);
  const dateResult = booking.data.variables?.steps?.date?.result;
  expect(dateResult, `Date processing did not return a result: ${JSON.stringify(booking.data.variables?.steps?.date)}`).toBe("SLOTS_READY");
  expect(booking.data.variables?.steps?.slot?.result, `Slot confirmation failed: ${JSON.stringify(booking.data.variables?.steps?.slot)}`).toBe("CONFIRMED");
});
