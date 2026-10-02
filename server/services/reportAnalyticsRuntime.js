/**
 * Shared report analytics runtime.
 *
 * Runs after secure datasource retrieval. It never evaluates JavaScript or SQL
 * supplied by metadata. Expressions are tokenised and evaluated against a
 * whitelist of operators/functions.
 */

const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const FUNCTIONS = new Set(["ABS", "ROUND", "MIN", "MAX", "IF", "COALESCE"]);
const PRECEDENCE = { "OR": 1, "AND": 2, "=": 3, "!=": 3, ">": 3, ">=": 3, "<": 3, "<=": 3, "+": 4, "-": 4, "*": 5, "/": 5 };

const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function tokenize(expression) {
  const source = String(expression || "");
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    const pair = source.slice(i, i + 2);
    if ([">=", "<=", "!="].includes(pair)) { tokens.push(pair); i += 2; continue; }
    if ("()+-*/=><,".includes(ch)) { tokens.push(ch); i += 1; continue; }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let value = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < source.length) { value += source[i + 1]; i += 2; }
        else { value += source[i]; i += 1; }
      }
      if (source[i] !== quote) throw new Error("Unterminated string in formula");
      i += 1;
      tokens.push({ type: "literal", value });
      continue;
    }
    const number = source.slice(i).match(/^-?(?:\d+\.?\d*|\.\d+)/)?.[0];
    if (number) { tokens.push({ type: "literal", value: Number(number) }); i += number.length; continue; }
    const word = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/)?.[0];
    if (word) {
      const upper = word.toUpperCase();
      if (["TRUE", "FALSE", "NULL"].includes(upper)) tokens.push({ type: "literal", value: upper === "TRUE" ? true : upper === "FALSE" ? false : null });
      else if (["AND", "OR"].includes(upper)) tokens.push(upper);
      else tokens.push({ type: "ident", value: word });
      i += word.length;
      continue;
    }
    throw new Error(`Unsupported formula token near "${source.slice(i, i + 12)}"`);
  }
  return tokens;
}

function parser(tokens, context) {
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];

  const primary = () => {
    const token = take();
    if (token === "(") {
      const value = expression(0);
      if (take() !== ")") throw new Error("Formula is missing a closing parenthesis");
      return value;
    }
    if (token === "-") return -numeric(primary());
    if (token && token.type === "literal") return token.value;
    if (token && token.type === "ident") {
      const next = peek();
      if (next === "(") {
        take();
        const fn = token.value.toUpperCase();
        if (!FUNCTIONS.has(fn)) throw new Error(`Unsupported formula function ${fn}`);
        const args = [];
        if (peek() !== ")") {
          while (true) {
            args.push(expression(0));
            if (peek() === ",") { take(); continue; }
            break;
          }
        }
        if (take() !== ")") throw new Error("Formula function is missing a closing parenthesis");
        if (fn === "ABS") return Math.abs(numeric(args[0]));
        if (fn === "ROUND") {
          const digits = Math.min(Math.max(Number(args[1] ?? 0), 0), 8);
          const factor = 10 ** digits;
          return Math.round(numeric(args[0]) * factor) / factor;
        }
        if (fn === "MIN") return Math.min(...args.map(numeric));
        if (fn === "MAX") return Math.max(...args.map(numeric));
        if (fn === "IF") return args[0] ? args[1] : args[2];
        if (fn === "COALESCE") return args.find((value) => value !== null && value !== undefined) ?? null;
      }
      if (!IDENT.test(token.value)) throw new Error("Invalid formula field reference");
      return context[token.value];
    }
    throw new Error("Invalid formula");
  };

  const apply = (operator, left, right) => {
    if (operator === "+") return numeric(left) + numeric(right);
    if (operator === "-") return numeric(left) - numeric(right);
    if (operator === "*") return numeric(left) * numeric(right);
    if (operator === "/") return numeric(right) === 0 ? null : numeric(left) / numeric(right);
    if (operator === "=") return left === right;
    if (operator === "!=") return left !== right;
    if (operator === ">") return left > right;
    if (operator === ">=") return left >= right;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === "AND") return Boolean(left) && Boolean(right);
    if (operator === "OR") return Boolean(left) || Boolean(right);
    throw new Error(`Unsupported operator ${operator}`);
  };

  function expression(minPrecedence) {
    let left = primary();
    while (true) {
      const operator = peek();
      const precedence = typeof operator === "string" ? PRECEDENCE[operator] : undefined;
      if (precedence === undefined || precedence < minPrecedence) break;
      take();
      const right = expression(precedence + 1);
      left = apply(operator, left, right);
    }
    return left;
  }

  const value = expression(0);
  if (index !== tokens.length) throw new Error("Unexpected formula content");
  return value;
}

export function evaluateFormula(expression, context = {}) {
  return parser(tokenize(expression), context);
}

export function bucketValue(value, bucket) {
  for (const entry of bucket?.entries || []) {
    if (bucket.mode === "ranges") {
      const number = Number(value);
      if (!Number.isFinite(number)) continue;
      const fromOk = entry.from === null || entry.from === undefined || (entry.includeFrom !== false ? number >= Number(entry.from) : number > Number(entry.from));
      const toOk = entry.to === null || entry.to === undefined || (entry.includeTo !== false ? number <= Number(entry.to) : number < Number(entry.to));
      if (fromOk && toOk) return entry.label;
    } else if ((entry.values || []).map(String).includes(String(value))) {
      return entry.label;
    }
  }
  return bucket?.otherLabel || "Other";
}

export function applyBuckets(rows = [], buckets = []) {
  if (!buckets.length) return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    const next = { ...row };
    for (const bucket of buckets) next[bucket.key] = bucketValue(row[bucket.field], bucket);
    return next;
  });
}

export function applyRowFormulas(rows = [], formulas = []) {
  if (!formulas.length) return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    const next = { ...row };
    for (const formula of formulas) next[formula.key] = evaluateFormula(formula.expression, next);
    return next;
  });
}

function aggregate(values, type) {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (type === "COUNT") return present.length;
  if (type === "COUNT_DISTINCT") return new Set(present.map((value) => `${typeof value}:${String(value)}`)).size;
  const numbers = present.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  if (type === "SUM") return numbers.reduce((sum, value) => sum + value, 0);
  if (type === "AVG") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (type === "MIN") return Math.min(...numbers);
  if (type === "MAX") return Math.max(...numbers);
  return 0;
}

function summarizeRows(rows, summaries) {
  const output = {};
  for (const summary of summaries || []) {
    const alias = summary.alias || `${String(summary.aggregate).toLowerCase()}_${summary.field}`;
    output[alias] = aggregate(rows.map((row) => row[summary.field]), String(summary.aggregate).toUpperCase());
  }
  return output;
}

export function shapeSummary(rows = [], definition = {}) {
  const groups = definition.rowGroups || definition.groupBy || [];
  const totals = definition.showGrandTotal === false ? {} : summarizeRows(rows, definition.summaries);
  if (!groups.length) return { rows: definition.showDetails === false ? [] : rows, totals };
  const tree = new Map();
  for (const row of rows) {
    let cursor = tree;
    for (const group of groups) {
      const key = row[group];
      if (!cursor.has(key)) cursor.set(key, { rows: [], children: new Map() });
      const node = cursor.get(key);
      node.rows.push(row);
      cursor = node.children;
    }
  }
  const flatten = (map, depth = 0, path = []) => {
    const output = [];
    for (const [value, node] of map.entries()) {
      const currentPath = [...path, value];
      output.push({
        __kind: "group", __depth: depth, __path: currentPath, __groupField: groups[depth], __groupValue: value, __count: node.rows.length,
        [groups[depth]]: value,
        ...(definition.showSubtotals === false ? {} : summarizeRows(node.rows, definition.summaries)),
      });
      if (node.children.size) output.push(...flatten(node.children, depth + 1, currentPath));
      else if (definition.showDetails !== false) {
        for (const row of node.rows) output.push({ ...row, __kind: "detail", __depth: depth + 1, __path: currentPath });
      }
    }
    return output;
  };
  return { rows: flatten(tree), totals };
}

export function shapeMatrix(rows = [], definition = {}) {
  const rowGroups = definition.rowGroups || [];
  const columnGroups = definition.columnGroups || [];
  if (!rowGroups.length || !columnGroups.length) throw new Error("Matrix output requires row and column groups");
  const rowKey = (row) => rowGroups.map((field) => String(row[field] ?? "")).join(" | ");
  const columnKey = (row) => columnGroups.map((field) => String(row[field] ?? "")).join(" | ");
  const columnValues = [...new Set(rows.map(columnKey))];
  const grouped = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    if (!grouped.has(key)) grouped.set(key, { label: key, rows: [] });
    grouped.get(key).rows.push(row);
  }
  const matrixRows = [];
  for (const [, group] of grouped) {
    const output = { __rowGroup: group.label };
    for (const column of columnValues) {
      const subset = group.rows.filter((row) => columnKey(row) === column);
      for (const summary of definition.summaries || []) {
        const alias = summary.alias || (String(summary.aggregate).toLowerCase() + "_" + summary.field);
        output[column + "::" + alias] = aggregate(subset.map((row) => row[summary.field]), String(summary.aggregate).toUpperCase());
      }
    }
    matrixRows.push(output);
  }
  const columns = [{ key: "__rowGroup", label: rowGroups.join(" / ") || "Row Group" }];
  for (const column of columnValues) {
    for (const summary of definition.summaries || []) {
      const alias = summary.alias || (String(summary.aggregate).toLowerCase() + "_" + summary.field);
      columns.push({ key: column + "::" + alias, label: column + " · " + alias });
    }
  }
  return { rows: matrixRows, columns, rowGroups, columnGroups, totals: definition.showGrandTotal === false ? {} : summarizeRows(rows, definition.summaries) };
}

export function applySummaryFormulas(result, formulas = [], applyToRows = true) {
  if (!formulas.length) return result;
  const totals = { ...(result.totals || {}) };
  for (const formula of formulas) totals[formula.key] = evaluateFormula(formula.expression, totals);
  const rows = (result.rows || []).map((row) => {
    if (!applyToRows || row?.__kind === "detail") return row;
    const next = { ...row };
    for (const formula of formulas) next[formula.key] = evaluateFormula(formula.expression, next);
    return next;
  });
  return { ...result, rows, totals };
}

export function joinReportBlocks(blockResults = [], definition = {}) {
  const commonGroups = definition.commonGroups || [];
  const fieldFor = (group, block) => {
    if (typeof group === "string") return group;
    const mapping = (group?.mappings || []).find((item) => String(item.blockKey) === String(block.key));
    return mapping?.field || null;
  };
  const indexes = blockResults.map((block) => {
    const map = new Map();
    for (const row of block.rows || []) {
      const key = commonGroups.map((group) => {
        const field = fieldFor(group, block);
        return String(field ? row[field] ?? "" : "");
      }).join(" | ");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  });
  const keys = [...new Set(indexes.flatMap((map) => [...map.keys()]))];
  const rows = keys.map((key) => {
    const output = { __commonGroup: key };
    blockResults.forEach((block, blockIndex) => {
      const subset = indexes[blockIndex].get(key) || [];
      const summaries = summarizeRows(subset, block.definition?.summaries || []);
      for (const [summaryKey, value] of Object.entries(summaries)) output[`${block.key}.${summaryKey}`] = value;
    });
    return output;
  });
  return { rows, commonGroups, blocks: blockResults.map((block) => ({ key: block.key, label: block.label })) };
}

export function applyCrossBlockFormulas(result, formulas = []) {
  if (!formulas.length) return result;
  return { ...result, rows: (result.rows || []).map((row) => {
    const next = { ...row };
    for (const formula of formulas) next[formula.key] = evaluateFormula(formula.expression, next);
    return next;
  }) };
}

export function conditionalStyles(row, rules = []) {
  const styles = {};
  for (const rule of rules || []) {
    const value = row[rule.field];
    let matched = false;
    if (rule.operator === "equals") matched = value === rule.value;
    else if (rule.operator === "not_equals") matched = value !== rule.value;
    else if (rule.operator === "gt") matched = numeric(value) > numeric(rule.value);
    else if (rule.operator === "gte") matched = numeric(value) >= numeric(rule.value);
    else if (rule.operator === "lt") matched = numeric(value) < numeric(rule.value);
    else if (rule.operator === "lte") matched = numeric(value) <= numeric(rule.value);
    else if (rule.operator === "between") matched = numeric(value) >= numeric(rule.from) && numeric(value) <= numeric(rule.to);
    else if (rule.operator === "is_blank") matched = value === null || value === undefined || value === "";
    else if (rule.operator === "is_not_blank") matched = !(value === null || value === undefined || value === "");
    if (matched) styles[rule.field] = { style: rule.style, applyTo: rule.applyTo };
  }
  return styles;
}

export function buildDrillPayload(row, definition = {}) {
  const action = definition.drillAction;
  if (!action) return null;
  return { type: action.type, targetId: action.targetId, targetField: action.targetField, passFilters: action.passFilters !== false,
    filters: action.passFilters === false ? [] : [...(definition.filters || []), ...(action.mappings || []).map((mapping) => ({ field: mapping.target, operator: "equals", value: row[mapping.source] }))] };
}

function reportOutputColumns(result, definition = {}, baseColumns = []) {
  if (definition.format === "matrix") return result.columns || [];
  const base = (baseColumns || []).map((column) => typeof column === "string" ? { key: column, label: column } : column);
  const visibleBase = definition.format === "summary" && definition.showDetails === false
    ? base.filter((column) => (definition.rowGroups || definition.groupBy || []).includes(column.key))
    : base;
  const byKey = new Map(visibleBase.map((column) => [column.key, column]));
  const add = (key, label = key) => { if (key && !byKey.has(key)) byKey.set(key, { key, label }); };
  for (const bucket of definition.buckets || []) add(bucket.key, bucket.label || bucket.key);
  for (const formula of definition.rowFormulas || []) add(formula.key, formula.label || formula.key);
  if (definition.format === "summary") {
    for (const group of definition.rowGroups || definition.groupBy || []) add(group, group);
    for (const summary of definition.summaries || []) {
      const alias = summary.alias || (String(summary.aggregate).toLowerCase() + "_" + summary.field);
      add(alias, alias);
    }
  }
  for (const formula of definition.summaryFormulas || []) add(formula.key, formula.label || formula.key);
  return [...byKey.values()];
}

export function runAnalytics(rows = [], definition = {}, baseColumns = []) {
  let nextRows = applyBuckets(rows, definition.buckets || []);
  nextRows = applyRowFormulas(nextRows, definition.rowFormulas || []);
  let result;
  if (definition.format === "matrix") result = shapeMatrix(nextRows, definition);
  else if (definition.format === "summary") result = shapeSummary(nextRows, definition);
  else result = { rows: nextRows, totals: definition.showGrandTotal === false ? {} : summarizeRows(nextRows, definition.summaries || []) };
  result = applySummaryFormulas(result, definition.summaryFormulas || [], definition.format !== "tabular");
  const rowsWithMetadata = (result.rows || []).map((row) => ({
    ...row,
    __conditionalFormatting: conditionalStyles(row, definition.conditionalFormatting || []),
    __drill: buildDrillPayload(row, definition),
  }));
  const groups = rowsWithMetadata.filter((row) => row?.__kind === "group").map((row) => ({ field: row.__groupField || null, value: row.__groupValue ?? null, depth: row.__depth ?? 0, path: Array.isArray(row.__path) ? row.__path : [], count: Number(row.__count || 0) }));
  return { ...result, columns: reportOutputColumns(result, definition, baseColumns), rows: rowsWithMetadata, groups };
}
