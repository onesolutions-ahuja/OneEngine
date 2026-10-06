import { normalizeAdvancedReportDefinition } from "./reportAnalyticsDefinition.js";

export const REPORT_DATE_PRESETS = Object.freeze([
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "this_month", label: "This month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "fiscal_year", label: "Fiscal year" },
]);

function requirePlatformSource(definition, label = "Report") {
  const dataSource = String(definition?.dataSource || "platform_object");
  if (dataSource !== "platform_object") {
    throw new Error(`${label} must use Platform Object metadata`);
  }
  const objectId = String(definition?.objectId || "").trim();
  const reportTypeId = definition?.reportTypeId || definition?.report_type_id || null;
  if (!objectId && !reportTypeId) {
    throw new Error(`${label} requires an Object or Report Type`);
  }
  return { ...definition, dataSource: "platform_object", objectId, reportTypeId };
}

export function validateCustomReportDefinition(input = {}) {
  const normalized = normalizeAdvancedReportDefinition(input || {});
  if (normalized.format === "joined") {
    if (!normalized.blocks.length) throw new Error("Joined reports require at least one block");
    return {
      ...normalized,
      dataSource: "platform_object",
      blocks: normalized.blocks.map((block, index) => requirePlatformSource(block, `Joined block ${index + 1}`)),
    };
  }
  return requirePlatformSource(normalized);
}
