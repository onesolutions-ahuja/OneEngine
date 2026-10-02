const NUMERIC_TYPES = new Set(["number", "decimal", "currency"]);
const CONTEXT_SOURCES = new Set(["permission", "role", "device", "entitlement", "record_type", "object_state", "company"]);

function isEmpty(value) {
  return value === null
    || value === undefined
    || value === ""
    || (Array.isArray(value) && value.length === 0);
}

function fieldKey(field) {
  return field?.api_name || field?.apiName || field?.field_key || field?.fieldKey || field?.name;
}

function fieldType(field) {
  return field?.field_type || field?.fieldType || field?.type || "text";
}

function resolvePath(record, path) {
  if (!record || !path) return undefined;
  return String(path).split(".").reduce((value, key) => value == null ? undefined : value[key], record);
}

function normalize(value, field) {
  if (isEmpty(value)) return null;
  const type = fieldType(field);
  if (NUMERIC_TYPES.has(type)) return Number(value);
  if (type === "boolean") return value === true || value === 1 || value === "true" || value === "1";
  return String(value);
}

function findField(fields, key) {
  const direct = (fields || []).find((candidate) => fieldKey(candidate) === key);
  if (direct) return direct;
  const last = String(key || "").split(".").pop();
  return (fields || []).find((candidate) => fieldKey(candidate) === last) || { field_type: "text" };
}

function matchesField(condition, fields, record, previousRecord = null) {
  const field = findField(fields, condition.field);
  const actual = resolvePath(record, condition.field);
  const previous = resolvePath(previousRecord, condition.field);
  if (condition.operator === "changed") return actual !== previous;
  if (condition.operator === "changed_to") return actual !== previous && normalize(actual, field) === normalize(condition.value, field);
  if (condition.operator === "changed_from") return actual !== previous && normalize(previous, field) === normalize(condition.value, field);
  if (condition.operator === "changed_from_to") {
    return actual !== previous
      && normalize(previous, field) === normalize(condition.value?.from, field)
      && normalize(actual, field) === normalize(condition.value?.to, field);
  }
  if (condition.operator === "is_empty") return isEmpty(actual);
  if (condition.operator === "is_not_empty") return !isEmpty(actual);
  if (isEmpty(actual)) return condition.operator === "not_equals";

  const left = normalize(actual, field);
  const right = normalize(condition.value, field);
  switch (condition.operator) {
    case "equals": return left === right;
    case "not_equals": return left !== right;
    case "greater_than": return left > right;
    case "greater_than_or_equal": return left >= right;
    case "less_than": return left < right;
    case "less_than_or_equal": return left <= right;
    default: return false;
  }
}

function contextValue(source, context, field = null) {
  if (source === "permission") return context.permissions || context.user?.permissions || [];
  if (source === "role") return context.roles || [context.user?.roleId, context.user?.roleKey].filter(Boolean);
  if (source === "device") return context.device || context.formFactor || "desktop";
  if (source === "entitlement") return context.entitlements || context.packages || [];
  if (source === "record_type") return context.recordTypeId || context.record?.recordTypeId || context.record?.record_type_id || "";
  if (source === "object_state") return field ? resolvePath(context.objectState || context.object || {}, field) : (context.objectState || context.object || {});
  if (source === "company") return context.companyId || context.user?.companyId || "";
  return undefined;
}

function containsContextValue(actual, expected) {
  if (Array.isArray(actual)) return actual.some((value) => String(value) === String(expected));
  if (actual && typeof actual === "object") {
    return actual[expected] === true || String(actual[expected] ?? "") === String(expected);
  }
  return String(actual ?? "") === String(expected ?? "");
}

function evaluateCondition(condition, fields, context) {
  const source = String(condition?.source || "field").toLowerCase();
  if (source === "field") return matchesField(condition, fields, context.record || {}, context.previousRecord || null);
  if (!CONTEXT_SOURCES.has(source)) return false;

  const actual = contextValue(source, context, condition.field || null);
  if (condition.operator === "is_empty") return isEmpty(actual);
  if (condition.operator === "is_not_empty") return !isEmpty(actual);
  if (condition.operator === "not_equals") return !containsContextValue(actual, condition.value);
  if (condition.operator !== "equals") return false;
  return containsContextValue(actual, condition.value);
}

function evaluateNode(config, fields, context) {
  if (!config) return true;
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;

  if (Array.isArray(config.groups)) {
    if (!config.groups.length) return true;
    const results = config.groups.map((group) => evaluateNode(group, fields, context));
    return String(config.match || "all").toLowerCase() === "any" ? results.some(Boolean) : results.every(Boolean);
  }

  const conditions = Array.isArray(config.conditions) ? config.conditions : [];
  if (!conditions.length) return true;
  const results = conditions.map((condition) => evaluateCondition(condition, fields, context));
  return String(config.match || "all").toLowerCase() === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function evaluatePlatformCondition(config, fields = [], context = {}) {
  return evaluateNode(config, fields, context);
}

export function evaluateFieldCondition(field, key, fields, record, context = {}) {
  const config = field?.config?.[key];
  return evaluatePlatformCondition(config, fields, {
    ...context,
    record: record || context.record || {},
  });
}
