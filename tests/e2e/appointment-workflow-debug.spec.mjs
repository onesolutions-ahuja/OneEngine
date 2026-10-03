import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const API = String(process.env.ONEPOS_API_URL || "https://oneengine.onrender.com").replace(/\/$/, "");

async function auth(page) {
  const configured = await loginIfConfigured(page);
  test.skip(!configured, "ONEPOS_E2E_USERNAME / ONEPOS_E2E_PASSWORD are required");
  const token = await page.evaluate(() => sessionStorage.getItem("onepos_token") || localStorage.getItem("onepos_token") || "");
  expect(token).not.toBe("");
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Origin: process.env.ONEPOS_E2E_ORIGIN || "https://onesolutions-ahuja.github.io",
  };
}

async function apiJson(page, method, pathname, headers) {
  const response = await page.request.fetch(API + pathname, { method, headers, timeout: 60_000 });
  let json = null;
  try { json = await response.json(); } catch {}
  expect(response.ok(), method + " " + pathname + " failed: " + response.status() + " " + JSON.stringify(json)).toBeTruthy();
  expect(json?.success, method + " " + pathname + " returned unsuccessful payload").not.toBe(false);
  return json;
}

test("installed booking router has no obsolete hidden appointment processors", async ({ page }) => {
  const headers = await auth(page);
  const rules = await apiJson(page, "GET", "/api/platform/rules", headers);
  const flow = (rules?.data || []).find((item) => item.name === "OneAssistant - Booking Channel Router");
  expect(flow).toBeTruthy();
  expect(flow.active).toBe(true);

  const keys = (flow.action?.actions || []).map((item) => item?.key).filter(Boolean);
  const obsolete = [
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

  for (const key of obsolete) expect(keys, "obsolete action " + key + " must not be installed").not.toContain(key);
  for (const key of ["GET_RECORDS", "CREATE_RECORD", "UPDATE_RECORD", "CONDITION", "SET_VARIABLE"]) {
    expect(keys, "visible primitive " + key + " must be installed").toContain(key);
  }
});
