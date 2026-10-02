/**
 * Report/dashboard management contracts.
 *
 * Pure metadata validation only: no HTTP or DB coupling, so folders, sharing,
 * favourites, subscriptions and dashboard filters can be reused by routes,
 * jobs and future package APIs.
 */

const ACCESS = new Set(["VIEW", "EDIT", "MANAGE"]);
const PRINCIPAL = new Set(["USER", "ROLE", "PUBLIC_GROUP", "COMPANY"]);
const CADENCE = new Set(["DAILY", "WEEKLY", "MONTHLY"]);
const DELIVERY = new Set(["IN_APP", "EMAIL"]);
const CONDITION = new Set(["ALWAYS", "ROW_COUNT_GT", "ROW_COUNT_EQ", "VALUE_GT", "VALUE_GTE", "VALUE_LT", "VALUE_LTE"]);
const RUN_AS = new Set(["VIEWER", "FIXED_USER"]);

const arr = (value, max = 100) => Array.isArray(value) ? value.slice(0, max) : [];

export function normalizeFolder(input = {}) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 150) throw new Error("Folder name is required");
  const visibility = ["PRIVATE", "SHARED"].includes(String(input.visibility).toUpperCase())
    ? String(input.visibility).toUpperCase()
    : "PRIVATE";
  return { id: input.id || null, name, description: String(input.description || "").slice(0, 500), visibility, access: normalizeAccess(input.access || []) };
}

export function normalizeAccess(input = []) {
  return arr(input, 100).map((item, index) => {
    const principalType = String(item?.principalType || item?.principal_type || "").toUpperCase();
    const principalId = String(item?.principalId || item?.principal_id || "").trim();
    const accessLevel = String(item?.accessLevel || item?.access_level || "VIEW").toUpperCase();
    if (!PRINCIPAL.has(principalType)) throw new Error(`Invalid principal type at row ${index + 1}`);
    if (!principalId) throw new Error(`Missing principal id at row ${index + 1}`);
    if (!ACCESS.has(accessLevel)) throw new Error(`Invalid access level at row ${index + 1}`);
    return { principalType, principalId, accessLevel };
  });
}

export function normalizeSubscription(input = {}) {
  const cadence = String(input.cadence || "DAILY").toUpperCase();
  const delivery = arr(input.delivery || ["IN_APP"], 2).map((value) => String(value).toUpperCase());
  if (!CADENCE.has(cadence)) throw new Error("Invalid subscription cadence");
  if (!delivery.length || delivery.some((value) => !DELIVERY.has(value))) throw new Error("Invalid subscription delivery channel");
  const hour = Math.min(Math.max(Number(input.hour ?? 8), 0), 23);
  const minute = Math.min(Math.max(Number(input.minute ?? 0), 0), 59);
  const weekday = cadence === "WEEKLY" ? Math.min(Math.max(Number(input.weekday ?? 1), 0), 6) : null;
  const monthday = cadence === "MONTHLY" ? Math.min(Math.max(Number(input.monthday ?? 1), 1), 28) : null;

  const principalRecipients = arr(input.recipientPrincipals || input.recipient_principals, 50).map((item, index) => {
    const principalType = String(item?.principalType || item?.principal_type || "").toUpperCase();
    const principalId = String(item?.principalId || item?.principal_id || "").trim();
    if (!["USER","ROLE","PUBLIC_GROUP"].includes(principalType)) throw new Error(`Invalid subscription recipient type at row ${index + 1}`);
    if (!principalId) throw new Error(`Missing subscription recipient at row ${index + 1}`);
    return { principalType, principalId };
  });
  const recipientPrincipals = [...new Map(principalRecipients.map((item) => [`${item.principalType}:${item.principalId}`, item])).values()];

  const sourceConditions = Array.isArray(input.conditions) ? input.conditions : input.condition ? [input.condition] : [{ type: "ALWAYS" }];
  const conditions = arr(sourceConditions, 5).map((entry, index) => {
    const type = String(entry?.type || "ALWAYS").toUpperCase();
    if (!CONDITION.has(type)) throw new Error(`Invalid subscription condition at row ${index + 1}`);
    return { type, field: entry?.field ? String(entry.field) : null, value: entry?.value ?? null };
  });
  if (!conditions.length) conditions.push({ type: "ALWAYS", field: null, value: null });
  if (conditions.some((entry) => entry.type === "ALWAYS") && conditions.length > 1) throw new Error("Always cannot be combined with other subscription conditions");

  const attachmentInput = input.attachment && typeof input.attachment === "object" ? input.attachment : {};
  const attachment = {
    enabled: attachmentInput.enabled === true,
    view: String(attachmentInput.view || "FORMATTED").toUpperCase() === "DETAILS" ? "DETAILS" : "FORMATTED",
    format: String(attachmentInput.format || "XLSX").toUpperCase() === "CSV" ? "CSV" : "XLSX",
  };
  if (attachment.enabled && attachment.view === "FORMATTED") attachment.format = "XLSX";
  if (attachment.enabled && attachment.view === "DETAILS") attachment.format = "CSV";

  return {
    active: input.active !== false,
    cadence,
    hour,
    minute,
    weekday,
    monthday,
    timezone: String(input.timezone || "Europe/London").slice(0, 80),
    delivery,
    runAsUserId: input.runAsUserId || input.run_as_user_id ? String(input.runAsUserId || input.run_as_user_id) : null,
    recipientPrincipals,
    recipients: [...new Set(arr(input.recipients, 50).map(String).filter(Boolean))],
    conditions,
    condition: conditions[0],
    attachment,
  };
}

export function subscriptionIsDue(subscription, now = new Date()) {
  if (!subscription?.active) return false;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: subscription.timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  const hour = Number(date.hour), minute = Number(date.minute);
  if (hour !== subscription.hour || minute !== subscription.minute) return false;
  if (subscription.cadence === "WEEKLY") return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(date.weekday) === subscription.weekday;
  if (subscription.cadence === "MONTHLY") return Number(date.day) === subscription.monthday;
  return true;
}

export function subscriptionConditionMatches(subscription, result = {}) {
  const conditions = Array.isArray(subscription?.conditions) && subscription.conditions.length
    ? subscription.conditions
    : [subscription?.condition || { type: "ALWAYS" }];
  const matches = (condition) => {
    if (condition.type === "ALWAYS") return true;
    if (condition.type === "ROW_COUNT_GT") return (result.rows || []).length > Number(condition.value || 0);
    if (condition.type === "ROW_COUNT_EQ") return (result.rows || []).length === Number(condition.value || 0);
    const value = result.totals?.[condition.field] ?? result.rows?.[0]?.[condition.field];
    const left = Number(value), right = Number(condition.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (condition.type === "VALUE_GT") return left > right;
    if (condition.type === "VALUE_GTE") return left >= right;
    if (condition.type === "VALUE_LT") return left < right;
    if (condition.type === "VALUE_LTE") return left <= right;
    return false;
  };
  return conditions.slice(0, 5).every(matches);
}

export function normalizeDashboardGlobalFilters(filters = []) {
  return arr(filters, 20).map((filter, index) => {
    const key = String(filter?.key || `filter_${index + 1}`).trim();
    const label = String(filter?.label || key).slice(0, 120);
    const type = ["date", "select", "multi_select", "number", "boolean"].includes(String(filter?.type)) ? String(filter.type) : "select";
    const mappings = arr(filter?.mappings, 100).map((mapping) => ({ componentId: mapping?.componentId ? String(mapping.componentId) : null, reportField: String(mapping?.reportField || ""), operator: String(mapping?.operator || "equals") })).filter((mapping) => mapping.reportField);
    if (!mappings.length) throw new Error(`Dashboard filter "${label}" needs at least one report mapping`);
    return { key, label, type, defaultValue: filter?.defaultValue ?? null, allowAll: filter?.allowAll !== false, options: arr(filter?.options, 200).map((option) => ({ value: option?.value ?? option, label: String(option?.label ?? option) })), mappings };
  });
}

export function applyDashboardGlobalFilters(component, globalDefinitions = [], values = {}) {
  const report = component?.config?.report;
  if (!report) return component;
  const filters = [...(report.filters || [])];
  for (const definition of globalDefinitions) {
    const mapping = definition.mappings.find((item) => !item.componentId || String(item.componentId) === String(component.id));
    if (!mapping) continue;
    const value = values[definition.key] ?? definition.defaultValue;
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) continue;
    filters.push({ field: mapping.reportField, operator: mapping.operator, value });
  }
  return { ...component, config: { ...component.config, report: { ...report, filters } } };
}

export function normalizeResponsiveLayouts(layouts = {}) {
  const normalize = (entries = []) => arr(entries, 100).map((item) => ({ id: String(item?.id || ""), x: Math.max(0, Number(item?.x || 0)), y: Math.max(0, Number(item?.y || 0)), w: Math.min(Math.max(Number(item?.w || 4), 1), 12), h: Math.min(Math.max(Number(item?.h || 3), 1), 20) })).filter((item) => item.id);
  return { desktop: normalize(layouts.desktop || []), tablet: normalize(layouts.tablet || []), mobile: normalize(layouts.mobile || []) };
}

export function normalizeRunAs(input = {}) {
  const mode = String(input.mode || input.runAsMode || "VIEWER").toUpperCase();
  if (!RUN_AS.has(mode)) throw new Error("Invalid dashboard run-as mode");
  const userId = mode === "FIXED_USER" ? String(input.userId || input.runAsUserId || "").trim() : null;
  if (mode === "FIXED_USER" && !userId) throw new Error("Fixed-user dashboards require a user");
  return { mode, userId };
}
