/* Generic communication transport adapters only. Business invoice orchestration is metadata/Flow-owned. */
const PROVIDER_TIMEOUT_MS = 10000;

export async function sendSmsViaTwilio({ accountSid, authToken, from, to, body }) {
  if (!accountSid || !authToken || !from || !to || !body) {
    return { ok: false, httpStatus: 0, errorText: "Twilio SMS configuration is incomplete" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const form = new URLSearchParams({
      To: String(to),
      From: String(from),
      Body: String(body),
    });
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: controller.signal,
    });
    const respBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        errorText: respBody?.message || `Twilio returned HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      httpStatus: response.status,
      reference: respBody?.sid || null,
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      errorText: error?.name === "AbortError" ? "Twilio SMS request timed out" : "Twilio SMS request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** POST the SMS payload to the configured endpoint. Returns { ok, httpStatus, reference?, errorText? }. */
export async function sendSmsViaProvider({ endpoint, apiKey, authScheme, senderId, to, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = authScheme === "bearer" ? `Bearer ${apiKey}` : apiKey;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ to, from: senderId || undefined, message: body }),
      signal: controller.signal,
    });
    const respBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, httpStatus: response.status, errorText: respBody?.error?.message || `SMS provider returned HTTP ${response.status}` };
    }
    return { ok: true, httpStatus: response.status, reference: respBody?.id || respBody?.messageId || respBody?.reference || null };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      errorText: error?.name === "AbortError" ? "SMS provider request timed out" : "SMS provider request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** POST the email payload. Returns { ok, httpStatus, reference?, errorText? }. */
export async function sendEmailViaProvider({ endpoint, apiKey, authScheme, from, to, subject, body, attachments = [] }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = authScheme === "bearer" ? `Bearer ${apiKey}` : apiKey;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ from, to, subject, text: body, ...(attachments.length ? { attachments } : {}) }),
      signal: controller.signal,
    });
    const respBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, httpStatus: response.status, errorText: respBody?.error?.message || `Email provider returned HTTP ${response.status}` };
    }
    return { ok: true, httpStatus: response.status, reference: respBody?.id || respBody?.messageId || respBody?.reference || null };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 0,
      errorText: error?.name === "AbortError" ? "Email provider request timed out" : "Email provider request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
