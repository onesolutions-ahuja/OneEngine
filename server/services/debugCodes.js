import { randomBytes } from "node:crypto";

export const BUILTIN_DEBUG_CODES = Object.freeze([
  { code: "OES01", category: "Server", title: "Service starting", userMessage: "OneEngine is starting. Please try again shortly.", internalDescription: "API process is alive but core startup is not complete.", severity: "WARNING", retryable: true, matchPattern: "" },
  { code: "OES02", category: "Server", title: "Service unavailable", userMessage: "OneEngine is temporarily unavailable.", internalDescription: "Server-side service failure outside a more specific category.", severity: "CRITICAL", retryable: true, matchPattern: "" },
  { code: "OEN01", category: "Network", title: "Server not reachable", userMessage: "OneEngine could not be reached. Check your connection and try again.", internalDescription: "Browser/device could not reach the API.", severity: "ERROR", retryable: true, matchPattern: "" },
  { code: "OEN02", category: "Network", title: "Request timeout", userMessage: "The request took too long. Please try again.", internalDescription: "Request exceeded the configured client/server timeout.", severity: "ERROR", retryable: true, matchPattern: "timeout|timed out" },
  { code: "OED01", category: "Database", title: "Database unavailable", userMessage: "OneEngine data services are temporarily unavailable.", internalDescription: "Database connection/query infrastructure is unavailable.", severity: "CRITICAL", retryable: true, matchPattern: "ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect|connect ETIMEDOUT" },
  { code: "OED02", category: "Database", title: "Database resource limit", userMessage: "OneEngine data services are temporarily unavailable.", internalDescription: "Database provider quota, allowance, compute or resource limit was reached.", severity: "CRITICAL", retryable: false, matchPattern: "quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit" },
  { code: "OEA01", category: "API", title: "API unavailable", userMessage: "The requested OneEngine service is unavailable.", internalDescription: "API dependency or route is unavailable.", severity: "ERROR", retryable: true, matchPattern: "" },
  { code: "OEA02", category: "API", title: "Unexpected API error", userMessage: "OneEngine could not complete this request.", internalDescription: "Unhandled backend exception.", severity: "ERROR", retryable: false, matchPattern: "" },
  { code: "OEA03", category: "API", title: "Request rate limited", userMessage: "Too many requests. Please try again shortly.", internalDescription: "API rate limit was reached.", severity: "WARNING", retryable: true, matchPattern: "too many requests|rate limit" },
  { code: "OEA04", category: "API", title: "Endpoint not found", userMessage: "The requested service could not be found.", internalDescription: "API route does not exist.", severity: "ERROR", retryable: false, matchPattern: "" },
  { code: "OEF01", category: "Frontend", title: "Frontend runtime error", userMessage: "This screen could not be displayed.", internalDescription: "Unhandled browser UI runtime exception.", severity: "ERROR", retryable: true, matchPattern: "" },
  { code: "OEF02", category: "Frontend", title: "Frontend module load error", userMessage: "This page could not be loaded.", internalDescription: "Lazy JS module/chunk failed to load.", severity: "ERROR", retryable: true, matchPattern: "" },
  { code: "OER01", category: "Permission", title: "Permission denied", userMessage: "You do not have permission to perform this action.", internalDescription: "RBAC/policy denied the request.", severity: "INFO", retryable: false, matchPattern: "" },
  { code: "OET01", category: "Tenant", title: "Company context unavailable", userMessage: "Your company context could not be resolved.", internalDescription: "Authenticated company/tenant context is missing or invalid.", severity: "ERROR", retryable: false, matchPattern: "company context|tenant context|acting company" },
  { code: "OEU01", category: "Session", title: "Authentication required", userMessage: "Please sign in again to continue.", internalDescription: "Authentication/session is missing or expired.", severity: "INFO", retryable: false, matchPattern: "authentication required|session expired" },
  { code: "OEW01", category: "Workflow", title: "Workflow failed", userMessage: "The automation could not be completed.", internalDescription: "Workflow execution failed.", severity: "ERROR", retryable: false, matchPattern: "workflow.*failed|automation.*failed" },
  { code: "OEL01", category: "Licence", title: "Licence unavailable", userMessage: "This feature is not currently available.", internalDescription: "Required package licence/entitlement is unavailable.", severity: "INFO", retryable: false, matchPattern: "licen[cs]e|entitlement" },
  { code: "OEP01", category: "Package", title: "Package operation failed", userMessage: "The app operation could not be completed.", internalDescription: "OneStore/package install, update or lifecycle operation failed.", severity: "ERROR", retryable: false, matchPattern: "package.*failed|install.*failed" },
  { code: "OEI01", category: "Integration", title: "Integration failed", userMessage: "The connected service could not complete the request.", internalDescription: "External connector/provider operation failed.", severity: "ERROR", retryable: true, matchPattern: "connector.*failed|provider.*failed|integration.*failed" },
  { code: "OEC01", category: "Cache", title: "Local data unavailable", userMessage: "Local data could not be loaded. Please refresh and try again.", internalDescription: "Browser cache/IndexedDB persistence failed.", severity: "WARNING", retryable: true, matchPattern: "indexeddb|cache.*failed" },
]);

export const DEBUG_CODE_RE = /^OE[A-Z][0-9]{2,3}$/;
const byCode = new Map(BUILTIN_DEBUG_CODES.map((item) => [item.code, item]));

export function createDebugReference() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function builtinDebugCode(code) {
  return byCode.get(String(code || "").toUpperCase()) || null;
}

export function classifyDebugCode(error, status = 500) {
  const explicit = String(error?.oeCode || error?.debugCode || "").toUpperCase();
  if (DEBUG_CODE_RE.test(explicit)) return explicit;
  const technicalCode = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "");
  const haystack = `${technicalCode} ${message}`;

  if (/quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit/i.test(haystack)) return "OED02";
  if (/ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect|connect ETIMEDOUT|too many clients|remaining connection slots/i.test(haystack)) return "OED01";
  if (/timeout|timed out|ETIMEDOUT/i.test(haystack)) return "OEN02";
  if (/company context|tenant context|acting company/i.test(haystack)) return "OET01";
  if (/workflow.*failed|automation.*failed/i.test(haystack)) return "OEW01";
  if (/licen[cs]e|entitlement/i.test(haystack)) return "OEL01";
  if (/package.*failed|install.*failed/i.test(haystack)) return "OEP01";
  if (/connector.*failed|provider.*failed|integration.*failed/i.test(haystack)) return "OEI01";
  if (status === 401) return "OEU01";
  if (status === 403) return "OER01";
  if (status === 404) return "OEA04";
  if (status === 429) return "OEA03";
  if (status === 502 || status === 503 || status === 504) return "OEA01";
  return status >= 500 ? "OEA02" : "OEA02";
}

export async function resolveDebugDefinition(db, error, status = 500) {
  const technical = `${String(error?.code || "")} ${String(error?.message || error || "")}`;
  try {
    const result = await db(
      `SELECT code,category,title,user_message,internal_description,severity,retryable,match_pattern
         FROM oneengine_debug_codes
        WHERE active=TRUE
        ORDER BY built_in DESC,sort_order,code`
    );
    for (const row of result.rows || []) {
      if (!row.match_pattern) continue;
      try {
        if (new RegExp(row.match_pattern, "i").test(technical)) {
          return {
            code: row.code,
            category: row.category,
            title: row.title,
            userMessage: row.user_message,
            internalDescription: row.internal_description,
            severity: row.severity,
            retryable: row.retryable === true,
          };
        }
      } catch {}
    }
    const code = classifyDebugCode(error, status);
    const row = (result.rows || []).find((item) => item.code === code);
    if (row) return {
      code: row.code,
      category: row.category,
      title: row.title,
      userMessage: row.user_message,
      internalDescription: row.internal_description,
      severity: row.severity,
      retryable: row.retryable === true,
    };
  } catch {}
  return builtinDebugCode(classifyDebugCode(error, status)) || builtinDebugCode("OEA02");
}

export async function writeDebugEvent(db, {
  reference,
  definition,
  error,
  status,
  req = null,
  environment = process.env.NODE_ENV || "production",
} = {}) {
  if (!db || !definition?.code) return;
  try {
    await db(
      `INSERT INTO oneengine_debug_events
        (reference,code,company_id,user_id,endpoint,http_method,http_status,technical_code,technical_message,stack_trace,environment,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        reference,
        definition.code,
        req?.user?.companyId || null,
        req?.user?.id || null,
        req?.originalUrl || req?.path || null,
        req?.method || null,
        status || null,
        error?.code ? String(error.code).slice(0, 160) : null,
        String(error?.message || error || "").slice(0, 2000),
        error?.stack ? String(error.stack).slice(0, 12000) : null,
        environment,
      ]
    );
  } catch (writeError) {
    console.error("OneEngine Debug event write failed:", writeError?.message || writeError);
  }
}

export async function buildDebugPayload(db, { error, status = 500, req = null } = {}) {
  const definition = await resolveDebugDefinition(db, error, status);
  const reference = createDebugReference();
  await writeDebugEvent(db, { reference, definition, error, status, req });
  return {
    success: false,
    code: definition.code,
    oeCode: definition.code,
    title: definition.title,
    message: definition.userMessage,
    retryable: definition.retryable === true,
    reference,
  };
}
