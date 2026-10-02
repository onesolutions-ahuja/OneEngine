/**
 * Canonical advanced report-definition contract.
 *
 * This module is deliberately UI-agnostic. Report Builder, Dashboard Builder,
 * Custom Page Builder and scheduled/report-delivery jobs all persist the SAME
 * definition shape. No builder owns analytical semantics.
 */

const REPORT_FORMATS = new Set(["tabular", "summary", "matrix", "joined"]);
const PRESENTATIONS = new Set([
  "table", "summary", "bar", "line", "pie", "donut", "gauge", "funnel", "scatter",
]);
const AGGREGATES = new Set(["COUNT", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX"]);
const FORMULA_SCOPES = new Set(["row", "summary", "cross_block"]);
const FILTER_TOKEN = /^(?:\d+|AND|OR|NOT|\(|\))$/i;
const API_NAME = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

const asArray = (value, max = 100) => (Array.isArray(value) ? value.slice(0, max) : []);
const uniqueStrings = (value, max = 100) => [...new Set(asArray(value, max).map(String).map((v) => v.trim()).filter(Boolean))];

export function normalizeFilterLogic(value, filterCount) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "all") {
    return Array.from({ length: filterCount }, (_, index) => String(index + 1)).join(" AND ");
  }
  if (raw.toLowerCase() === "any") {
    return Array.from({ length: filterCount }, (_, index) => String(index + 1)).join(" OR ");
  }
  return raw.toUpperCase().replace(/\s+/g, " ").trim();
}

export function validateFilterLogic(logic, filterCount) {
  const normalized = normalizeFilterLogic(logic, filterCount);
  if (!normalized && filterCount === 0) return "";
  const tokens = normalized.match(/\d+|AND|OR|NOT|\(|\)/gi) || [];
  const compact = normalized.replace(/\s+/g, "");
  if (tokens.join("").toUpperCase() !== compact.toUpperCase()) throw new Error("Invalid filter logic");
  if (tokens.some((token) => !FILTER_TOKEN.test(token))) throw new Error("Invalid filter logic token");
  let depth = 0;
  let expectOperand = true;
  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (!expectOperand || n < 1 || n > filterCount) throw new Error("Invalid filter reference");
      expectOperand = false;
    } else if (upper === "NOT") {
      if (!expectOperand) throw new Error("Invalid NOT placement");
    } else if (upper === "(") {
      if (!expectOperand) throw new Error("Invalid opening parenthesis");
      depth += 1;
    } else if (upper === ")") {
      if (expectOperand || depth < 1) throw new Error("Invalid closing parenthesis");
      depth -= 1;
      expectOperand = false;
    } else {
      if (expectOperand) throw new Error(`Invalid ${upper} placement`);
      expectOperand = true;
    }
  }
  if (depth !== 0 || (tokens.length && expectOperand)) throw new Error("Incomplete filter logic");
  return normalized;
}

export function compileFilterLogic(logic, clauses = []) {
  if (!clauses.length) return "";
  const normalized = validateFilterLogic(logic, clauses.length);
  const tokens = normalized.match(/\d+|AND|OR|NOT|\(|\)/gi) || [];
  return tokens.map((token) => /^\d+$/.test(token) ? `(${clauses[Number(token) - 1]})` : token.toUpperCase()).join(" ");
}

function normalizeBucket(bucket, index) {
  const key = String(bucket?.key || `bucket_${index + 1}`).trim();
  if (!API_NAME.test(key)) throw new Error(`Bucket ${index + 1} has an invalid API name`);
  const mode = ["ranges", "values"].includes(String(bucket?.mode)) ? String(bucket.mode) : "values";
  const entries = asArray(bucket?.entries, 100).map((entry, entryIndex) => ({
    label: String(entry?.label || `Bucket ${entryIndex + 1}`).slice(0, 120),
    values: uniqueStrings(entry?.values, 100), from: entry?.from ?? null, to: entry?.to ?? null,
    includeFrom: entry?.includeFrom !== false, includeTo: entry?.includeTo !== false,
  }));
  if (!entries.length) throw new Error(`Bucket ${key} needs at least one entry`);
  return { key, label: String(bucket?.label || key).slice(0, 120), field: String(bucket?.field || ""), mode, entries, otherLabel: String(bucket?.otherLabel || "Other").slice(0, 120) };
}

function normalizeFormula(formula, index, scope) {
  const key = String(formula?.key || `${scope}_formula_${index + 1}`).trim();
  if (!API_NAME.test(key)) throw new Error(`Formula ${index + 1} has an invalid API name`);
  const formulaScope = String(formula?.scope || scope);
  if (!FORMULA_SCOPES.has(formulaScope)) throw new Error("Invalid formula scope");
  const expression = String(formula?.expression || "").trim();
  if (!expression || expression.length > 2000) throw new Error(`Formula ${key} needs a valid expression`);
  return { key, label: String(formula?.label || key).slice(0, 120), scope: formulaScope, expression,
    format: ["number", "currency", "percent", "date", "text"].includes(String(formula?.format)) ? String(formula.format) : "number",
    decimals: Math.min(Math.max(Number(formula?.decimals ?? 2), 0), 8) };
}

function normalizeConditionalRule(rule, index) {
  const operator = String(rule?.operator || "gte");
  if (!new Set(["equals", "not_equals", "gt", "gte", "lt", "lte", "between", "is_blank", "is_not_blank"]).has(operator)) throw new Error(`Conditional-format rule ${index + 1} has an invalid operator`);
  return { field: String(rule?.field || ""), operator, value: rule?.value ?? null, from: rule?.from ?? null, to: rule?.to ?? null,
    style: ["success", "warning", "danger", "info", "accent", "muted"].includes(String(rule?.style)) ? String(rule.style) : "accent",
    applyTo: ["cell", "row", "value", "component"].includes(String(rule?.applyTo)) ? String(rule.applyTo) : "cell" };
}

function normalizeDrillAction(action) {
  if (!action || typeof action !== "object") return null;
  const type = String(action.type || "report");
  if (!["report", "record", "page", "url", "none"].includes(type)) throw new Error("Invalid drill action");
  if (type === "none") return null;
  return { type, targetId: action.targetId ? String(action.targetId) : null, targetField: action.targetField ? String(action.targetField) : null,
    passFilters: action.passFilters !== false, mappings: asArray(action.mappings, 20).map((mapping) => ({ source: String(mapping?.source || ""), target: String(mapping?.target || "") })) };
}

function normalizeBlock(block, index) {
  return { key: String(block?.key || `block_${index + 1}`), label: String(block?.label || `Block ${index + 1}`).slice(0, 120), dataSource: String(block?.dataSource || "platform_object"),
    objectId: block?.objectId ? String(block.objectId) : null, fields: uniqueStrings(block?.fields, 100), filters: asArray(block?.filters, 50),
    filterLogic: normalizeFilterLogic(block?.filterLogic, asArray(block?.filters, 50).length), rowGroups: uniqueStrings(block?.rowGroups || block?.groupBy, 10),
    columnGroups: uniqueStrings(block?.columnGroups, 10), summaries: asArray(block?.summaries, 30), sort: asArray(block?.sort, 20) };
}

export function normalizeAdvancedReportDefinition(definition = {}) {
  const filters = asArray(definition.filters, 50);
  const format = REPORT_FORMATS.has(String(definition.format)) ? String(definition.format) : "tabular";
  const rowGroups = uniqueStrings(definition.rowGroups || definition.groupBy, 10);
  const columnGroups = uniqueStrings(definition.columnGroups, 10);
  const normalized = { ...definition, schemaVersion: 2, format, fields: uniqueStrings(definition.fields, 100), filters,
    filterLogic: normalizeFilterLogic(definition.filterLogic, filters.length), rowGroups, columnGroups, groupBy: rowGroups,
    summaries: asArray(definition.summaries, 30).map((summary) => ({ aggregate: String(summary?.aggregate || "COUNT").toUpperCase(), field: String(summary?.field || ""), alias: summary?.alias ? String(summary.alias) : null, showGrandTotal: summary?.showGrandTotal !== false, showSubtotals: summary?.showSubtotals !== false })),
    buckets: asArray(definition.buckets, 20).map(normalizeBucket), rowFormulas: asArray(definition.rowFormulas, 20).map((formula, index) => normalizeFormula(formula, index, "row")),
    summaryFormulas: asArray(definition.summaryFormulas, 20).map((formula, index) => normalizeFormula(formula, index, "summary")),
    sort: asArray(definition.sort, 20).map((item) => ({ field: String(item?.field || ""), direction: String(item?.direction || "asc").toLowerCase() === "desc" ? "desc" : "asc", nulls: String(item?.nulls || "last").toLowerCase() === "first" ? "first" : "last" })),
    rowLimit: Math.min(Math.max(Number(definition.rowLimit || 1000), 1), 1000), showDetails: definition.showDetails !== false, showSubtotals: definition.showSubtotals !== false, showGrandTotal: definition.showGrandTotal !== false,
    presentation: { type: PRESENTATIONS.has(String(definition.presentation?.type)) ? String(definition.presentation.type) : "table", xField: definition.presentation?.xField ? String(definition.presentation.xField) : null, yField: definition.presentation?.yField ? String(definition.presentation.yField) : null, seriesField: definition.presentation?.seriesField ? String(definition.presentation.seriesField) : null, stacked: definition.presentation?.stacked === true, orientation: definition.presentation?.orientation === "horizontal" ? "horizontal" : "vertical", showLegend: definition.presentation?.showLegend !== false, showValues: definition.presentation?.showValues === true },
    conditionalFormatting: asArray(definition.conditionalFormatting, 30).map(normalizeConditionalRule), drillAction: normalizeDrillAction(definition.drillAction),
    blocks: format === "joined" ? asArray(definition.blocks, 5).map(normalizeBlock) : [], commonGroups: format === "joined" ? uniqueStrings(definition.commonGroups, 10) : [] };
  validateFilterLogic(normalized.filterLogic, normalized.filters.length);
  if (format === "matrix" && (!rowGroups.length || !columnGroups.length)) throw new Error("Matrix reports require at least one row group and one column group");
  if (format === "joined" && normalized.blocks.length < 2) throw new Error("Joined reports require at least two report blocks");
  for (const summary of normalized.summaries) if (!AGGREGATES.has(summary.aggregate)) throw new Error(`Invalid aggregate ${summary.aggregate}`);
  return normalized;
}

export function reportCapabilities() {
  return { schemaVersion: 2, formats: [...REPORT_FORMATS], aggregates: [...AGGREGATES], presentations: [...PRESENTATIONS], maxJoinedBlocks: 5, maxFilters: 50,
    maxRowGroups: 10, maxColumnGroups: 10, maxBuckets: 20, maxFormulas: 20, maxSorts: 20, filterLogic: "custom",
    supports: { tabular: true, summary: true, matrix: true, joined: true, buckets: true, rowFormulas: true, summaryFormulas: true, crossBlockFormulas: true, conditionalFormatting: true, drillActions: true, multipleSorts: true, detailToggle: true, subtotals: true, grandTotals: true } };
}
