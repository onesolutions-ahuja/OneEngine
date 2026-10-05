import { test, expect } from "@playwright/test";
import { loginIfConfigured } from "./helpers.mjs";

const API = String(process.env.ONEPOS_API_URL || "https://oneengine-6gas.onrender.com").replace(/\/$/, "");
const OBSOLETE = [
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
];

async function auth(page) {
  const configured = await loginIfConfigured(page);
  test.skip(!configured, "ONEPOS_E2E_USERNAME / ONEPOS_E2E_PASSWORD are required");
  const token = await page.evaluate(() => sessionStorage.getItem("onepos_token") || localStorage.getItem("onepos_token") || "");
  expect(token).not.toBe("");
  return { Authorization: "Bearer " + token, "Content-Type": "application/json", Origin: process.env.ONEPOS_E2E_ORIGIN || "https://onesolutions-ahuja.github.io" };
}

test("installed booking router contains no dead legacy appointment wrappers", async ({ page }) => {
  const headers = await auth(page);
  const response = await page.request.get(API + "/api/platform/rules", { headers, timeout: 60_000 });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const flow = (payload?.data || []).find((item) => item.name === "OneAssistant - Booking Channel Router");
  expect(flow).toBeTruthy();
  expect(flow.active).toBe(true);
  const keys = (flow.action?.actions || []).map((item) => item?.key).filter(Boolean);
  for (const key of OBSOLETE) expect(keys, key + " must not be installed").not.toContain(key);
  for (const key of ["GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","CONDITION","ASSIGNMENT","FORMULA"]) expect(keys).toContain(key);
});
