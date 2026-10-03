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
      const response = await fetch(API + path, {
        method,
        headers: {
          Accept: "application/json",
          Origin: ORIGIN,
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
      if (!response.ok || payload?.success === false) {
        const error = new Error(method + " " + path + " failed: HTTP " + response.status + " " + (payload?.message || text || ""));
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const login = await jsonFetch("/api/auth/login", {
  method: "POST",
  body: { username, password },
  retries: 20,
});
if (!login?.token) throw new Error("Login succeeded without a bearer token");

const rules = await jsonFetch("/api/platform/rules", { token: login.token, retries: 3 });
const router = (rules?.data || []).find((item) => item.name === "OneAssistant - Booking Channel Router");
assert(router, "OneAssistant - Booking Channel Router is not installed");
assert(router.active === true, "OneAssistant - Booking Channel Router is not active");

const keys = (router.action?.actions || []).map((item) => item?.key).filter(Boolean);
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

for (const key of obsolete) assert(!keys.includes(key), "Installed router still references obsolete hidden action " + key);
for (const key of ["GET_RECORDS", "CREATE_RECORD", "UPDATE_RECORD", "CONDITION", "SET_VARIABLE"]) {
  assert(keys.includes(key), "Installed router is missing visible primitive " + key);
}

console.log("PASS: installed OneAssistant booking router contains no obsolete hidden appointment processors.");
console.log("NOTE: full runtime booking Debug remains gated until date/slot resources are produced entirely by visible Flow nodes.");
