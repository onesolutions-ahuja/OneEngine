import { isSafeIdentifier } from "./platformMetadata.js";
import {
  fieldComparisonSql,
  normalizeAdvancedFieldFilter,
  normalizeCrossFilters,
  relativeDateSql,
} from "./reportTypeDefinition.js";
import {
  compileFilterLogic,
  normalizeAdvancedReportDefinition,
} from "./reportAnalyticsDefinition.js";

export const STANDARD_REPORT_SOURCES = [
  {
    key: "sales",
    label: "Sales",
    kind: "standard",
    supportsDates: true,
    grouping: true,
    sorting: true,
    fields: ["date", "store", "user", "product", "sku", "quantity", "gross_sales", "net_sales", "vat", "discount", "transactions"],
  },
  { key: "products", label: "Products", kind: "standard", grouping: true, sorting: true },
  { key: "customers", label: "Customers", kind: "standard", grouping: true, sorting: true },
  { key: "inventory", label: "Inventory", kind: "standard", grouping: true, sorting: true },
  { key: "payments", label: "Payments", kind: "standard", grouping: true, sorting: true },
  {
    key: "hospitality",
    label: "Hospitality",
    kind: "standard",
    supportsDates: true,
    grouping: true,
    sorting: true,
    fields: [
      "date", "store", "floor", "table", "session", "operator", "status", "guests",
      "source", "gross", "discount", "net", "vat", "service_charge", "tips",
      "paid", "remaining", "payment_method", "payment_count", "opened_at", "closed_at",
      "duration_minutes", "average_spend_per_cover", "ticket_created", "ticket_fired",
      "ticket_completed", "course", "preparation_duration", "delayed",
    ],
  },
];

const OPERATORS = new Set([
  "equals", "not_equals", "contains", "starts_with", "is_blank", "is_not_blank",
  "gt", "gte", "lt", "lte", "between", "in",
  "equals_field", "not_equals_field", "gt_field", "gte_field", "lt_field", "lte_field",
  "relative_date",
]);
const AGGREGATES = new Set(["COUNT", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX"]);

export function normalizePlatformReportDefinition(definition = {}) {
  const advanced = normalizeAdvancedReportDefinition(definition);
  return {
    ...advanced,
    dataSource: "platform_object",
    objectId: String(definition.objectId || ""),
  };
}

function fieldKey(field) {
  return String(field.api_name || field.key || "");
}

function buildFieldMap(fields, relationships = []) {
  const fieldMap = new Map(fields
    .filter((field) => field.active !== false && field.readable !== false)
    .map((field) => [fieldKey(field), field]));
  for (const relationship of relationships) {
    const relationshipKey = String(relationship.relationship_key || relationship.key || "");
    const relatedFields = Array.isArray(relationship.fields) ? relationship.fields : [];
    if (!isSafeIdentifier(relationshipKey)) continue;
    for (const field of relatedFields) {
      const key = fieldKey(field);
      if (isSafeIdentifier(key)) fieldMap.set(`${relationshipKey}.${key}`, { ...field, relationshipKey });
    }
  }
  return fieldMap;
}

export function validatePlatformReportDefinition(definition, object, fields, relationships = []) {
  const normalized = normalizePlatformReportDefinition(definition);
  if (!object?.id || !object.source_table || !isSafeIdentifier(object.source_table)) throw new Error("Report object is not available");
  const fieldMap = buildFieldMap(fields, relationships);
  const relationshipByKey = relationshipMap(relationships);
  if (!normalized.fields.length || normalized.fields.some((key) => !fieldMap.has(key))) throw new Error("Select at least one valid report field");
  if (normalized.rowGroups.some((key) => !fieldMap.has(key))) throw new Error("Invalid row grouping field");
  if (normalized.columnGroups.some((key) => !fieldMap.has(key))) throw new Error("Invalid column grouping field");
  for (const summary of normalized.summaries) {
    const key = String(summary?.field || "");
    const aggregate = String(summary?.aggregate || "").toUpperCase();
    const field = fieldMap.get(key);
    const type = String(field?.field_type || field?.type || "").toLowerCase();
    if (!field || !AGGREGATES.has(aggregate)) throw new Error("Invalid report summary");
    if (["SUM", "AVG", "MIN", "MAX"].includes(aggregate) && !["number", "decimal", "currency", "date", "datetime", "formula", "rollup"].includes(type)) {
      throw new Error(`Aggregate ${aggregate} is not valid for ${key}`);
    }
  }
  normalized.filters = normalized.filters.map(normalizeAdvancedFieldFilter);
  normalized.crossFilters = normalizeCrossFilters(definition.crossFilters || []);
  for (const filter of normalized.filters) {
    if (!fieldMap.has(String(filter?.field)) || !OPERATORS.has(String(filter?.operator))) throw new Error("Invalid report filter");
    if (filter.compareField) {
      if (!fieldMap.has(String(filter.compareField))) throw new Error("Invalid comparison field");
      if (String(filter.field) === String(filter.compareField)) throw new Error("Field-to-field filters must compare two different fields");
      const leftType = String(fieldMap.get(String(filter.field))?.field_type || fieldMap.get(String(filter.field))?.type || "").toLowerCase();
      const rightType = String(fieldMap.get(String(filter.compareField))?.field_type || fieldMap.get(String(filter.compareField))?.type || "").toLowerCase();
      const comparisonKind = (type) => ["number","decimal","currency","percent","rollup"].includes(type) ? "numeric" : type === "date" ? "date" : type === "datetime" ? "datetime" : null;
      if (!comparisonKind(leftType) || comparisonKind(leftType) !== comparisonKind(rightType)) throw new Error("Field-to-field filters require two different numeric fields or two fields of the same date/time type");
    }
  }
  for (const item of normalized.sort) {
    if (!fieldMap.has(String(item?.field)) || !["asc", "desc"].includes(String(item?.direction).toLowerCase())) throw new Error("Invalid sort field");
  }
  return normalized;
}

function relationshipMap(relationships = []) {
  return new Map(relationships.map((relationship) => [
    String(relationship.relationship_key || relationship.key || ""),
    relationship,
  ]));
}

function fieldExpression(field, alias = "r", relationshipAliases = {}) {
  const sourceColumn = field?.source_column || field?.sourceColumn;
  if (!sourceColumn || !isSafeIdentifier(sourceColumn)) throw new Error("Report field mapping is invalid");
  const sourceAlias = field?.relationshipKey ? relationshipAliases[field.relationshipKey] : alias;
  if (!sourceAlias || !isSafeIdentifier(sourceAlias)) throw new Error("Report relationship mapping is invalid");
  return `${sourceAlias}."${sourceColumn}"`;
}

export function buildPlatformObjectQuery(definition, object, fields, companyId, limit = 1000, scope = {}, relationships = []) {
  const normalized = validatePlatformReportDefinition(definition, object, fields, relationships);
  const fieldMap = buildFieldMap(fields, relationships);
  const params = [companyId];
  const where = [`r.company_id = $${params.length}`];
  const relationshipAliases = {};
  const joins = [];
  for (const [index, relationship] of relationships.entries()) {
    const key = String(relationship.relationship_key || relationship.key || "");
    const targetTable = relationship.target_source_table || relationship.source_table;
    const childColumn = relationship.child_source_column || relationship.childSourceColumn;
    if (!isSafeIdentifier(key) || !targetTable || !isSafeIdentifier(targetTable) || !childColumn || !isSafeIdentifier(childColumn)) continue;
    const alias = `rel${index + 1}`;
    relationshipAliases[key] = alias;
    const localColumn = relationship.local_source_column || relationship.localSourceColumn;
    const targetColumn = relationship.target_source_column || relationship.targetSourceColumn;
    const joinKeyword = String(relationship.reportJoinType || relationship.joinType || "").toUpperCase() === "WITH"
      ? "INNER JOIN"
      : "LEFT JOIN";
    const sourceRelationshipKey = relationship.source_relationship_key || relationship.sourceRelationshipKey || null;
    const sourceAlias = sourceRelationshipKey ? relationshipAliases[sourceRelationshipKey] : "r";
    if (!sourceAlias || !isSafeIdentifier(sourceAlias)) throw new Error("Report relationship path is invalid");
    joins.push(localColumn && isSafeIdentifier(localColumn) && targetColumn && isSafeIdentifier(targetColumn)
      ? `${joinKeyword} "${targetTable}" ${alias} ON ${alias}."${targetColumn}" = ${sourceAlias}."${localColumn}"`
      : `${joinKeyword} "${targetTable}" ${alias} ON ${alias}."${childColumn}" = ${sourceAlias}."id"`);
  }
  let next = params.length + 1;
  if (object.store_scoped === true) {
    if (!scope.storeId) throw new Error("A store session is required to run this report");
    params.push(String(scope.storeId));
    where.push(`r.store_id = $${next}`);
    next += 1;
  }
  for (const [index, relationship] of relationships.entries()) {
    const alias = `rel${index + 1}`;
    const conditions = [];
    if (relationship.target_company_scoped === true) conditions.push(`${alias}.company_id = $1`);
    if (relationship.target_store_scoped === true) {
      if (!scope.storeId) throw new Error("A store session is required to report on this relationship");
      params.push(String(scope.storeId));
      conditions.push(`${alias}.store_id = $${next}`);
      next += 1;
    }
    if (conditions.length) {
      joins[index] = `${joins[index]} AND ${conditions.join(" AND ")}`;
    }
  }
  if (scope.visibilitySql) {
    where.push(`(${scope.visibilitySql})`);
    params.push(...(Array.isArray(scope.visibilityParams) ? scope.visibilityParams : []));
    next = params.length + 1;
  }
  const filterClauses = [];
  for (const filter of normalized.filters) {
    const field = fieldMap.get(String(filter.field));
    const expression = fieldExpression(field, "r", relationshipAliases);
    const operator = String(filter.operator);
    if (filter.compareField) {
      const comparisonField = fieldMap.get(String(filter.compareField));
      filterClauses.push(fieldComparisonSql(operator, expression, fieldExpression(comparisonField, "r", relationshipAliases)));
      continue;
    }
    if (operator === "relative_date") {
      const compiled = relativeDateSql(filter.relativeDate || filter.value || {}, expression, params, next);
      filterClauses.push(compiled.clause);
      next = compiled.nextParamIndex;
      continue;
    }
    if (["is_blank", "is_not_blank"].includes(operator)) {
      filterClauses.push(`${expression} IS ${operator === "is_blank" ? "" : "NOT "}NULL`);
      continue;
    }
    if (operator === "between") {
      filterClauses.push(`${expression} BETWEEN $${next} AND $${next + 1}`);
      const range = Array.isArray(filter.value)
        ? filter.value
        : typeof filter.value === "string" ? filter.value.split(",").map((value) => value.trim()) : [];
      params.push(filter.from ?? range[0] ?? null, filter.to ?? range[1] ?? null);
      next += 2;
      continue;
    }
    const values = Array.isArray(filter.value)
      ? filter.value
      : operator === "in" && typeof filter.value === "string"
        ? filter.value.split(",").map((value) => value.trim()).filter(Boolean)
        : [filter.value];
    const sqlOperator = operator === "equals" ? "=" : operator === "not_equals" ? "<>" : operator === "contains" ? "ILIKE" : operator === "starts_with" ? "ILIKE" : operator === "gt" ? ">" : operator === "gte" ? ">=" : operator === "lt" ? "<" : operator === "lte" ? "<=" : "IN";
    if (operator === "in") {
      filterClauses.push(`${expression} = ANY($${next})`);
      params.push(values);
    } else {
      filterClauses.push(`${expression} ${sqlOperator} $${next}`);
      params.push(operator === "contains" ? `%${values[0]}%` : operator === "starts_with" ? `${values[0]}%` : values[0]);
    }
    next += 1;
  }
  if (filterClauses.length) where.push(`(${compileFilterLogic(normalized.filterLogic, filterClauses)})`);

  for (const crossFilter of normalized.crossFilters || []) {
    const relationship = relationshipByKey.get(String(crossFilter.relationshipKey));
    if (!relationship) throw new Error(`Unknown cross-filter relationship ${crossFilter.relationshipKey}`);
    const targetTable = relationship.target_source_table || relationship.source_table;
    const localColumn = relationship.local_source_column || relationship.localSourceColumn || "id";
    const targetColumn = relationship.target_source_column || relationship.targetSourceColumn || relationship.child_source_column || relationship.childSourceColumn;
    if (!isSafeIdentifier(targetTable) || !isSafeIdentifier(localColumn) || !isSafeIdentifier(targetColumn)) {
      throw new Error("Cross-filter relationship mapping is invalid");
    }
    const alias = `xf${where.length + 1}`;
    const relatedFieldKey = (value) => {
      const raw = String(value || "");
      const prefix = `${crossFilter.relationshipKey}.`;
      return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    };
    const subfilters = [];
    for (const raw of crossFilter.subfilters || []) {
      const subfilter = normalizeAdvancedFieldFilter(raw);
      const targetField = (relationship.fields || []).find((candidate) => fieldKey(candidate) === relatedFieldKey(subfilter.field));
      if (!targetField) throw new Error(`Invalid cross-filter field ${subfilter.field}`);
      const expression = fieldExpression({ ...targetField, relationshipKey: null }, alias, {});
      if (subfilter.compareField) {
        const comparison = (relationship.fields || []).find((candidate) => fieldKey(candidate) === relatedFieldKey(subfilter.compareField));
        if (!comparison) throw new Error("Invalid cross-filter comparison field");
        subfilters.push(fieldComparisonSql(subfilter.operator, expression, fieldExpression({ ...comparison, relationshipKey: null }, alias, {})));
        continue;
      }
      if (subfilter.operator === "relative_date") {
        const compiled = relativeDateSql(subfilter.relativeDate || subfilter.value || {}, expression, params, next);
        subfilters.push(compiled.clause);
        next = compiled.nextParamIndex;
        continue;
      }
      if (["is_blank", "is_not_blank"].includes(subfilter.operator)) {
        subfilters.push(`${expression} IS ${subfilter.operator === "is_blank" ? "" : "NOT "}NULL`);
        continue;
      }
      const op = subfilter.operator === "equals" ? "="
        : subfilter.operator === "not_equals" ? "<>"
          : subfilter.operator === "gt" ? ">"
            : subfilter.operator === "gte" ? ">="
              : subfilter.operator === "lt" ? "<"
                : subfilter.operator === "lte" ? "<="
                  : null;
      if (!op) throw new Error(`Unsupported cross-filter operator ${subfilter.operator}`);
      subfilters.push(`${expression} ${op} $${next}`);
      params.push(subfilter.value);
      next += 1;
    }
    const companyClause = relationship.target_company_scoped === true ? ` AND ${alias}.company_id = $1` : "";
    const sourceRelationshipKey = relationship.source_relationship_key || relationship.sourceRelationshipKey || null;
    const sourceAlias = sourceRelationshipKey ? relationshipAliases[sourceRelationshipKey] : "r";
    if (!sourceAlias || !isSafeIdentifier(sourceAlias)) throw new Error("Cross-filter relationship path is invalid");
    const exists = `EXISTS (SELECT 1 FROM "${targetTable}" ${alias} WHERE ${alias}."${targetColumn}" = ${sourceAlias}."${localColumn}"${companyClause}${subfilters.length ? ` AND ${subfilters.join(" AND ")}` : ""})`;
    where.push(crossFilter.type === "WITHOUT" ? `NOT ${exists}` : exists);
  }
  const selected = normalized.fields.map((key) => `${fieldExpression(fieldMap.get(key), "r", relationshipAliases)} AS "${key}"`);
  if (scope.includeRecordId === true) selected.unshift(`r."id" AS "__recordId"`);
  const groupKeys = [...new Set([
    ...normalized.rowGroups,
    ...normalized.columnGroups,
    ...(normalized.summaries.length ? normalized.fields : []),
  ])];
  const groups = groupKeys.map((key) => fieldExpression(fieldMap.get(key), "r", relationshipAliases));
  const summaries = normalized.summaries.map((summary) => {
    const aggregate = String(summary.aggregate).toUpperCase();
    const expression = fieldExpression(fieldMap.get(String(summary.field)), "r", relationshipAliases);
    const sql = aggregate === "COUNT"
      ? "COUNT(*)"
      : aggregate === "COUNT_DISTINCT"
        ? `COUNT(DISTINCT ${expression})`
        : `${aggregate}(${expression})`;
    const alias = summary.alias || `${aggregate.toLowerCase()}_${summary.field}`;
    return `${sql} AS "${alias}"`;
  });
  const select = [...selected, ...summaries];
  const order = (normalized.sort.length ? normalized.sort : normalized.rowGroups.map((field) => ({ field, direction: "asc", nulls: "last" })))
    .map((item) => `"${item.field}" ${String(item.direction).toLowerCase() === "asc" ? "ASC" : "DESC"} NULLS ${String(item.nulls).toLowerCase() === "first" ? "FIRST" : "LAST"}`).join(", ");
  const requestedLimit = Math.min(Number(normalized.rowLimit || limit || 1000), Number(limit || 1000), 1000);
  const sql = `SELECT ${select.join(", ")} FROM "${object.source_table}" r ${joins.join(" ")} WHERE ${where.join(" AND ")}${groups.length ? ` GROUP BY ${groups.join(", ")}` : ""}${order ? ` ORDER BY ${order}` : ""} LIMIT ${Math.max(requestedLimit, 1)}`;
  return { sql, params, definition: normalized };
}
