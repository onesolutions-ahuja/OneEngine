/**
 * Final Report Builder parity contracts:
 * - CRT deployment/category/layout sections/display labels/lookup-field exposure
 * - automatic preview preferences
 * - historical trend snapshot selection
 * - export mode metadata
 */

const STATUS = new Set(["IN_DEVELOPMENT", "DEPLOYED"]);
const EXPORT_VIEW = new Set(["FORMATTED", "DETAILS"]);
const EXPORT_FORMAT = new Set(["XLSX", "CSV"]);

const arr = (v, max = 100) => Array.isArray(v) ? v.slice(0, max) : [];

export function normalizeReportTypeExperience(input = {}) {
  const status = String(input.status || "IN_DEVELOPMENT").toUpperCase();
  if (!STATUS.has(status)) throw new Error("Invalid report type deployment status");
  return {
    status,
    category: String(input.category || "Other Reports").slice(0, 100),
    sections: arr(input.sections, 50).map((section, index) => ({
      key: String(section?.key || `section_${index + 1}`),
      label: String(section?.label || `Section ${index + 1}`).slice(0, 120),
      visible: section?.visible !== false,
      order: Number.isFinite(Number(section?.order)) ? Number(section.order) : index,
    })),
    fieldLayout: arr(input.fieldLayout, 1000).map((field, index) => ({
      fieldKey: String(field?.fieldKey || ""),
      displayLabel: String(field?.displayLabel || "").slice(0, 200) || null,
      sectionKey: String(field?.sectionKey || "fields"),
      visible: field?.visible !== false,
      defaultSelected: field?.defaultSelected === true,
      lookupPath: arr(field?.lookupPath, 5).map(String),
      order: Number.isFinite(Number(field?.order)) ? Number(field.order) : index,
    })).filter((field) => field.fieldKey),
  };
}

export function reportTypeVisibleToUser(reportType, user = {}) {
  const status = String(reportType?.definition?.experience?.status || reportType?.definition?.status || reportType?.status || "IN_DEVELOPMENT").toUpperCase();
  if (status === "DEPLOYED") return true;
  const codes = new Set(user?.permissions || user?.permissionCodes || []);
  return codes.has("reports.custom.manage") || codes.has("platform.metadata.manage");
}

export function normalizePreviewPreference(input = {}) {
  return {
    autoPreview: input.autoPreview !== false,
    sampleLimit: Math.min(Math.max(Number(input.sampleLimit || 50), 1), 200),
  };
}

export function normalizeHistoricalTrend(input = {}) {
  const snapshotDates = arr(input.snapshotDates, 5)
    .map((value) => String(value))
    .filter(Boolean);
  const historicalFilters = arr(input.historicalFilters, 4).map((filter) => ({
    field: String(filter?.field || ""),
    operator: String(filter?.operator || "equals"),
    value: filter?.value ?? null,
    snapshotMode: ["ANY", "ALL", "SPECIFIC"].includes(String(filter?.snapshotMode || "").toUpperCase())
      ? String(filter.snapshotMode).toUpperCase()
      : "SPECIFIC",
    snapshotDate: filter?.snapshotDate ? String(filter.snapshotDate) : null,
  })).filter((filter) => filter.field);
  return {
    enabled: input.enabled === true,
    snapshotDates,
    historicalFilters,
  };
}

export function selectHistoricalSnapshots(allSnapshots = [], trend = {}) {
  const normalized = normalizeHistoricalTrend(trend);
  if (!normalized.enabled) return [];
  if (!normalized.snapshotDates.length) return allSnapshots.slice(0, 5);
  const wanted = new Set(normalized.snapshotDates);
  return allSnapshots.filter((snapshot) => {
    const key = String(snapshot.period_key || snapshot.snapshot_date || snapshot.captured_at || "");
    return wanted.has(key);
  }).slice(0, 5);
}

export function normalizeReportExport(input = {}, reportFormat = "tabular") {
  const view = String(input.view || "DETAILS").toUpperCase();
  const format = String(input.format || (view === "FORMATTED" ? "XLSX" : "CSV")).toUpperCase();
  if (!EXPORT_VIEW.has(view)) throw new Error("Invalid export view");
  if (!EXPORT_FORMAT.has(format)) throw new Error("Invalid export format");
  if (view === "FORMATTED" && format !== "XLSX") throw new Error("Formatted report export requires XLSX");
  if (String(reportFormat).toLowerCase() === "joined" && view === "DETAILS") {
    throw new Error("Joined reports support formatted export only");
  }
  return { view, format };
}
