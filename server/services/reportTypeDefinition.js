/**
 * Salesforce-style report-type and advanced-filter metadata.
 * Builds on existing Platform Objects + Relationships rather than inventing
 * another schema layer.
 */

const JOIN_TYPES = new Set(["WITH", "WITH_OR_WITHOUT"]);
const CROSS_TYPES = new Set(["WITH", "WITHOUT"]);
const FIELD_OPERATORS = new Set(["equals_field", "not_equals_field", "gt_field", "gte_field", "lt_field", "lte_field"]);
const RELATIVE_UNITS = new Set(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]);
const RELATIVE_DIRECTIONS = new Set(["LAST", "NEXT", "CURRENT"]);
const arr = (v, max = 100) => Array.isArray(v) ? v.slice(0, max) : [];

export function normalizeReportType(input = {}) {
  const label = String(input.label || "").trim();
  const key = String(input.key || input.apiKey || "").trim();
  const primaryObjectId = String(input.primaryObjectId || "").trim();
  if (!label) throw new Error("Report type label is required");
  if (!/^[A-Za-z][A-Za-z0-9_]{1,99}$/.test(key)) throw new Error("Report type API key is invalid");
  if (!primaryObjectId) throw new Error("Primary object is required");
  return { id: input.id || null, label: label.slice(0, 150), key, description: String(input.description || "").slice(0, 500), primaryObjectId, active: input.active !== false,
    experience: input.experience && typeof input.experience === "object" ? input.experience : {},
    relationships: arr(input.relationships, 3).map((item, index) => {
      const relationshipId = String(item?.relationshipId || "").trim();
      const joinType = String(item?.joinType || "WITH_OR_WITHOUT").toUpperCase();
      const sourceRelationshipId = item?.sourceRelationshipId ? String(item.sourceRelationshipId).trim() : null;
      const previous = arr(input.relationships, 3).slice(0, index);
      if (!relationshipId) throw new Error(`Relationship ${index + 1} is required`);
      if (!JOIN_TYPES.has(joinType)) throw new Error(`Relationship ${index + 1} join type is invalid`);
      if (sourceRelationshipId && !previous.some((candidate) => String(candidate?.relationshipId || "") === sourceRelationshipId)) throw new Error(`Relationship ${index + 1} has an invalid parent path`);
      let ancestorId = sourceRelationshipId;
      while (ancestorId) {
        const ancestor = previous.find((candidate) => String(candidate?.relationshipId || "") === String(ancestorId));
        if (!ancestor) break;
        if (String(ancestor.joinType || "WITH_OR_WITHOUT").toUpperCase() === "WITH_OR_WITHOUT" && joinType === "WITH") {
          throw new Error(`Relationship ${index + 1} must remain optional because an earlier relationship in its path is optional`);
        }
        ancestorId = ancestor.sourceRelationshipId ? String(ancestor.sourceRelationshipId) : null;
      }
      return { relationshipId, sourceRelationshipId, joinType, alias: String(item?.alias || "").trim() || null };
    }),
    fieldVisibility: arr(input.fieldVisibility, 500).map((item) => ({ fieldKey: String(item?.fieldKey || ""), visible: item?.visible !== false, defaultSelected: item?.defaultSelected === true, category: String(item?.category || "Fields").slice(0, 100) })).filter((item) => item.fieldKey) };
}

export function normalizeCrossFilters(input = []) {
  return arr(input, 3).map((item, index) => {
    const type = String(item?.type || "WITH").toUpperCase();
    const relationshipKey = String(item?.relationshipKey || "").trim();
    if (!CROSS_TYPES.has(type)) throw new Error(`Cross filter ${index + 1} has an invalid type`);
    if (!relationshipKey) throw new Error(`Cross filter ${index + 1} needs a relationship`);
    return {
      type,
      relationshipKey,
      subfilters: arr(item?.subfilters, 5).map((subfilter, subIndex) => {
        const field = String(subfilter?.field || "").trim();
        const operator = String(subfilter?.operator || "equals");
        const compareField = subfilter?.compareField ? String(subfilter.compareField).trim() : null;
        if (!field) throw new Error(`Cross filter ${index + 1} condition ${subIndex + 1} needs a field`);
        if (FIELD_OPERATORS.has(operator) && !compareField) throw new Error(`Cross filter ${index + 1} condition ${subIndex + 1} requires a comparison field`);
        return {
          field,
          operator,
          value: subfilter?.value ?? null,
          compareField,
          relativeDate: subfilter?.relativeDate ? normalizeRelativeDate(subfilter.relativeDate) : null,
        };
      }),
    };
  });
}

export function normalizeAdvancedFieldFilter(filter = {}) {
  const operator = String(filter.operator || "equals");
  const compareField = filter.compareField ? String(filter.compareField) : null;
  if (FIELD_OPERATORS.has(operator) && !compareField) throw new Error(`Field comparison ${operator} requires compareField`);
  return { field: String(filter.field || ""), operator, value: filter.value ?? null, from: filter.from ?? null, to: filter.to ?? null, compareField, relativeDate: filter.relativeDate ? normalizeRelativeDate(filter.relativeDate) : null };
}

export function normalizeRelativeDate(input = {}) {
  const direction = String(input.direction || "CURRENT").toUpperCase();
  const unit = String(input.unit || "DAY").toUpperCase();
  const count = Math.min(Math.max(Number(input.count || 1), 1), 999);
  if (!RELATIVE_DIRECTIONS.has(direction)) throw new Error("Invalid relative-date direction");
  if (!RELATIVE_UNITS.has(unit)) throw new Error("Invalid relative-date unit");
  return { direction, unit, count, includeCurrent: input.includeCurrent !== false };
}

export function relativeDateSql(relativeDate, expression, params, nextParamIndex) {
  const value = normalizeRelativeDate(relativeDate);
  const unit = value.unit.toLowerCase();
  const intervalUnit = value.unit === "QUARTER" ? "month" : unit;
  const multiplier = value.unit === "QUARTER" ? 3 : 1;
  if (value.direction === "CURRENT") { const start = `date_trunc('${unit}', CURRENT_DATE)`; const end = `date_trunc('${unit}', CURRENT_DATE) + INTERVAL '${multiplier} ${intervalUnit}'`; return { clause: `${expression} >= ${start} AND ${expression} < ${end}`, nextParamIndex }; }
  params.push(value.count); const p = `$${nextParamIndex}`;
  if (value.direction === "LAST") { const lower = value.includeCurrent ? `CURRENT_DATE - (${p}::int * INTERVAL '${multiplier} ${intervalUnit}')` : `date_trunc('${unit}', CURRENT_DATE) - (${p}::int * INTERVAL '${multiplier} ${intervalUnit}')`; const upper = value.includeCurrent ? `CURRENT_DATE + INTERVAL '1 day'` : `date_trunc('${unit}', CURRENT_DATE)`; return { clause: `${expression} >= ${lower} AND ${expression} < ${upper}`, nextParamIndex: nextParamIndex + 1 }; }
  const lower = value.includeCurrent ? `CURRENT_DATE` : `date_trunc('${unit}', CURRENT_DATE) + INTERVAL '${multiplier} ${intervalUnit}'`; const upper = `${lower} + (${p}::int * INTERVAL '${multiplier} ${intervalUnit}')`; return { clause: `${expression} >= ${lower} AND ${expression} < ${upper}`, nextParamIndex: nextParamIndex + 1 };
}

export function fieldComparisonSql(operator, left, right) {
  const map = { equals_field: "=", not_equals_field: "<>", gt_field: ">", gte_field: ">=", lt_field: "<", lte_field: "<=" };
  const sqlOperator = map[operator]; if (!sqlOperator) throw new Error("Invalid field comparison operator"); return `${left} ${sqlOperator} ${right}`;
}

export function chartConfig(input = {}) {
  return { type: ["bar","line","pie","donut","gauge","funnel","scatter","combo"].includes(String(input.type)) ? String(input.type) : "bar", xField: input.xField ? String(input.xField) : null,
    yFields: [...new Set(arr(input.yFields || (input.yField ? [input.yField] : []), 10).map(String))], seriesField: input.seriesField ? String(input.seriesField) : null,
    secondaryAxisFields: [...new Set(arr(input.secondaryAxisFields, 10).map(String))], stacked: input.stacked === true, normalizeToPercent: input.normalizeToPercent === true,
    showLegend: input.showLegend !== false, showValues: input.showValues === true, showGrid: input.showGrid !== false, sortBy: input.sortBy ? String(input.sortBy) : null,
    sortDirection: String(input.sortDirection || "asc").toLowerCase() === "desc" ? "desc" : "asc", maxCategories: Math.min(Math.max(Number(input.maxCategories || 20), 2), 100),
    referenceLines: arr(input.referenceLines, 10).map((line) => ({ label: String(line?.label || "").slice(0, 100), value: Number(line?.value || 0), axis: line?.axis === "secondary" ? "secondary" : "primary" })) };
}
