import { createJarvisProvider } from "./jarvis/providers/index.js";

function normalizeAllowedIntents(value) {
  return String(value || "sales_enquiry")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_"))
    .filter(Boolean)
    .slice(0, 20);
}

function extractJson(text) {
  const value = String(text || "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : value;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(source.slice(start, end + 1)); } catch { return null; }
}

export async function interpretWhatsAppAssistantMessage({
  message,
  allowedIntents = "sales_enquiry",
  providerName = "gemini",
  contactName = null,
  env = process.env,
} = {}) {
  const text = String(message || "").trim().slice(0, 4000);
  if (!text) return { ok: false, reason: "empty_message" };

  const allowed = normalizeAllowedIntents(allowedIntents);
  const requestedProvider = String(providerName || "gemini").trim().toLowerCase();
  let provider;
  try {
    provider = createJarvisProvider({ name: requestedProvider, env });
  } catch (error) {
    return { ok: false, reason: "provider_unavailable", provider: requestedProvider, error: error?.code || "provider_unavailable" };
  }
  if (!provider.isConfigured?.()) {
    return { ok: false, reason: "provider_not_configured", provider: requestedProvider };
  }

  const systemInstruction = [
    "You classify and draft replies for a business WhatsApp assistant.",
    "You do not have access to CRM records, orders, invoices, payment data, or private customer data.",
    "Use only the incoming message and the limited context provided below.",
    `Allowed intents: ${allowed.join(", ") || "sales_enquiry"}.`,
    "If the message is outside the allowed intents, requests private/account-specific information, needs a human decision, is abusive/unsafe, or you are uncertain, set handoff=true and reply=null.",
    "For an allowed sales enquiry, write a short helpful business reply. Never invent prices, availability, promises, account facts, or customer facts.",
    "Return JSON only with keys: intent, confidence, handoff, reply.",
  ].join("\n");

  try {
    const result = await provider.generateAnswer({
      systemInstruction,
      message: JSON.stringify({
        incomingMessage: text,
        contactName: contactName ? String(contactName).slice(0, 120) : null,
        allowedIntents: allowed,
      }),
    });
    const parsed = extractJson(result?.text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "invalid_ai_response", provider: result?.provider || requestedProvider };
    }
    const intent = String(parsed.intent || "unknown").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
    const confidence = Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : null;
    const allowedIntent = allowed.includes(intent);
    const handoff = parsed.handoff === true || !allowedIntent;
    const reply = !handoff && typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 2000) : null;
    return {
      ok: true,
      intent,
      confidence,
      handoff: handoff || !reply,
      reply: handoff ? null : reply,
      provider: result?.provider || requestedProvider,
      model: result?.model || provider.model || null,
      usage: result?.usage || null,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      provider: requestedProvider,
      error: error?.code || "provider_error",
    };
  }
}
