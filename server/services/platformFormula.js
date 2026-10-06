// Small, bounded expression language. Never evaluate JavaScript or generate SQL.
const TYPES = new Set(["number", "decimal", "currency", "percent", "text", "text_area", "long_text", "rich_text", "url", "time", "auto_number", "boolean", "date", "datetime", "email", "phone", "select", "picklist"]);
const STRING_TYPES = new Set(["text", "text_area", "long_text", "rich_text", "url", "time", "auto_number", "date", "datetime", "email", "phone", "select", "picklist"]);
const SAFE = /^[a-z_][a-z0-9_]*$/;
const SAFE_PATH = /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)*$/;
const WORKFLOW_SAFE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["id", "company_id", "store_id", "__proto__", "constructor", "prototype"]);
const PRECEDENCE = { "||": 1, "&&": 2, "==": 3, "!=": 3, ">": 4, ">=": 4, "<": 4, "<=": 4, "&": 5, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };
const ARITY = { IF: [3, 3], AND: [2, 20], OR: [2, 20], NOT: [1, 1], ISBLANK: [1, 1], ISPICKVAL: [2, 2], TEXT: [1, 1], BEGINS: [2, 2], CONTAINS: [2, 2], COALESCE: [2, 20], CONCAT: [1, 20], ROUND: [1, 2], ABS: [1, 1], MIN: [1, 20], MAX: [1, 20], TODAY: [0, 0], NOW: [0, 0], ADDDAYS: [2, 2], ADDMINUTES: [2, 2], PARSEDATE: [1, 1], MINUTESBETWEEN: [2, 2], TRIM: [1, 1], UPPER: [1, 1] };
export const ROLLUP_OPERATIONS = new Set(["COUNT", "SUM", "MIN", "MAX", "AVG"]);
const baseType = type => ["number", "decimal", "currency", "percent"].includes(type) ? "number" : type;
const formulaType = type => STRING_TYPES.has(type) ? "string" : baseType(type);
export const isCalculatedField = field => Boolean(field && ["formula", "rollup"].includes(field.field_type));
export const effectiveFieldType = field => {
  if (!field) return null;
  if (field.field_type === "formula" || field.field_type === "rollup") {
    const resultType = field.config?.resultType || field.config?.result_type || "number";
    return resultType;
  }
  return field.field_type;
};

export function normalizeRollupConfig(field) {
  if (!field || field.field_type !== "rollup") return null;
  const config = field.config && typeof field.config === "object" ? field.config : {};
  const operation = String(config.operation || config.aggregate || config.rollupOperation || "COUNT").toUpperCase();
  const relationshipKey = config.relationshipKey || config.relationship_key || config.relationship || config.relationshipId || config.relationship_id || null;
  const sourceField = config.field || config.sourceField || config.source_field || config.childField || config.child_field || null;
  const rawCondition = config.condition ?? config.filter ?? config.conditions ?? null;
  const condition = Array.isArray(rawCondition) ? { match: "all", conditions: rawCondition } : rawCondition;
  const resultType = config.resultType || config.result_type || (ROLLUP_OPERATIONS.has(operation) && ["SUM", "AVG", "MIN", "MAX"].includes(operation) ? "number" : "number");
  return { operation: ROLLUP_OPERATIONS.has(operation) ? operation : "COUNT", relationshipKey, sourceField, condition, resultType };
}

export class FormulaError extends Error {
  constructor(message) { super(message); this.code = "INVALID_FORMULA"; }
}
function fail(message) { throw new FormulaError(message); }

export function parseFormula(expression, { identifierPattern = SAFE, caseInsensitiveReserved = false } = {}) {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 2000) fail("Formula must contain 1–2000 characters");
  const tokens = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|("(?:[^"\\]|\\["\\nrt])*")|([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*)|(\|\||&&|==|!=|>=|<=|[+*/%(),!<>&-]))/y;
  let offset = 0;
  while (offset < expression.trimEnd().length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match) fail(`Invalid formula syntax near character ${offset + 1}`);
    let stringValue;
    if (match[2]) {
      try { stringValue = JSON.parse(match[2]); } catch { fail("Invalid string literal in formula"); }
    }
    tokens.push(match[1] ? { kind: "literal", value: Number(match[1]) } : match[2] ? { kind: "literal", value: stringValue } : { kind: match[3] ? "name" : "symbol", value: match[3] || match[4] });
    if (tokens.length > 256) fail("Formula is too complex (maximum 256 tokens)");
    offset = pattern.lastIndex;
  }
  let index = 0;
  const take = value => tokens[index]?.value === value && tokens[index]?.kind !== "literal" ? (index++, true) : false;
  const expect = value => { if (!take(value)) fail(`Expected ${value}`); };
  function expressionNode(min = 0, depth = 0) {
    if (depth > 32) fail("Formula nesting exceeds 32 levels");
    let node;
    const token = tokens[index++];
    if (!token) fail("Incomplete formula");
    if (token.kind === "literal") {
      if (typeof token.value === "number" && !Number.isFinite(token.value)) fail("Formula numbers must be finite");
      node = { kind: "literal", value: token.value };
    } else if (token.kind === "symbol" && ["-", "+", "!"].includes(token.value)) {
      node = { kind: "unary", op: token.value, value: expressionNode(7, depth + 1) };
    } else if (token.value === "(") { node = expressionNode(0, depth + 1); expect(")"); }
    else if (token.kind === "name") {
      if (take("(")) {
        if (!Object.hasOwn(ARITY, token.value)) fail(`Unsupported function ${token.value}`);
        const args = [];
        if (!take(")")) {
          do { args.push(expressionNode(0, depth + 1)); } while (take(","));
          expect(")");
        }
        const [low, high] = ARITY[token.value];
        if (args.length < low || args.length > high) fail(`Incorrect argument count for ${token.value}`);
        node = { kind: "call", name: token.value, args };
      } else if (["true", "false", "null"].includes(token.value)) node = { kind: "literal", value: JSON.parse(token.value) };
      else {
        const reservedKey = caseInsensitiveReserved ? String(token.value).toLowerCase() : token.value;
        if (!identifierPattern.test(token.value) || RESERVED.has(reservedKey)) fail("Use a valid formula name");
        node = { kind: "field", name: token.value };
      }
    } else fail("Expected a value, field, or function");
    while (tokens[index]?.kind === "symbol" && Object.hasOwn(PRECEDENCE, tokens[index].value) && PRECEDENCE[tokens[index].value] >= min) {
      const op = tokens[index++].value;
      node = { kind: "binary", op, left: node, right: expressionNode(PRECEDENCE[op] + 1, depth + 1) };
    }
    return node;
  }
  const ast = expressionNode();
  if (index !== tokens.length) fail("Unexpected formula token");
  return ast;
}

export function formulaPreviewDependencies(fields, expression) {
  const byName = new Map(fields.filter(field => field.active !== false).map(field => [field.api_name, field]));
  const inputs = new Set();
  const visitedFormulas = new Set();
  const visit = formula => {
    const ast = parseFormula(formula, { identifierPattern: SAFE_PATH });
    const walk = node => {
      if (node.kind === "field") {
        const dependency = byName.get(node.name);
        if (dependency?.field_type === "formula") {
          if (!visitedFormulas.has(node.name)) {
            visitedFormulas.add(node.name);
            visit(dependency.config?.expression);
          }
        } else if (dependency) {
          inputs.add(node.name);
        }
      } else if (node.kind === "unary") {
        walk(node.value);
      } else if (node.kind === "binary") {
        walk(node.left);
        walk(node.right);
      } else if (node.kind === "call") {
        node.args.forEach(walk);
      }
    };
    walk(ast);
  };
  visit(expression);
  return fields.filter(field => inputs.has(field.api_name));
}

export function formulaReferences(expression) {
  const ast = parseFormula(expression, { identifierPattern: SAFE_PATH });
  const refs = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.kind === "field") refs.add(node.name);
    else if (node.kind === "unary") walk(node.value);
    else if (node.kind === "binary") { walk(node.left); walk(node.right); }
    else if (node.kind === "call") node.args.forEach(walk);
  };
  walk(ast);
  return [...refs];
}

function infer(node, resolve, depth = 0) {
  if (depth > 64) fail("Formula expression is too deep");
  const typeOf = child => infer(child, resolve, depth + 1);
  const requireType = (type, expected) => { if (type !== "null" && type !== expected) fail(`Formula expects ${expected} operands`); };
  const common = types => { const distinct = [...new Set(types.filter(t => t !== "null"))]; if (distinct.length > 1) fail("Formula branches must have the same type"); return distinct[0] || "null"; };
  if (node.kind === "literal") return node.value === null ? "null" : typeof node.value;
  if (node.kind === "field") return resolve(node.name);
  if (node.kind === "unary") { requireType(typeOf(node.value), node.op === "!" ? "boolean" : "number"); return node.op === "!" ? "boolean" : "number"; }
  if (node.kind === "binary") {
    const left = typeOf(node.left), right = typeOf(node.right);
    if (["&&", "||"].includes(node.op)) { requireType(left, "boolean"); requireType(right, "boolean"); return "boolean"; }
    if (["==", "!=", ">", ">=", "<", "<="].includes(node.op)) { common([left, right]); return "boolean"; }
    if (node.op === "&") return "string";
    requireType(left, "number"); requireType(right, "number"); return "number";
  }
  const types = node.args.map(typeOf);
  if (node.name === "IF") { requireType(types[0], "boolean"); return common(types.slice(1)); }
  if (["AND", "OR"].includes(node.name)) { types.forEach(t => requireType(t, "boolean")); return "boolean"; }
  if (node.name === "NOT") { requireType(types[0], "boolean"); return "boolean"; }
  if (node.name === "ISBLANK") return "boolean";
  if (node.name === "ISPICKVAL") return "boolean";
  if (node.name === "TEXT") return "string";
  if (["BEGINS", "CONTAINS"].includes(node.name)) return "boolean";
  if (node.name === "COALESCE") return common(types);
  if (node.name === "CONCAT") return "string";
  if (["PARSEDATE", "TRIM", "UPPER"].includes(node.name)) { requireType(types[0], "string"); return "string"; }
  if (node.name === "MINUTESBETWEEN") { requireType(types[0], "string"); requireType(types[1], "string"); return "number"; }
  if (["TODAY", "NOW", "ADDDAYS", "ADDMINUTES"].includes(node.name)) {
    if (["ADDDAYS", "ADDMINUTES"].includes(node.name)) {
      requireType(types[0], "string");
      requireType(types[1], "number");
    }
    return "string";
  }
  types.forEach(t => requireType(t, "number"));
  return "number";
}

function valueFor(value, type) {
  if (value === undefined || value === null || value === "") return null;
  if (baseType(type) === "number") return ["number", "string"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;
  if (type === "boolean") return [true, false, 0, 1, "0", "1", "true", "false"].includes(value) ? [true, 1, "1", "true"].includes(value) : null;
  return typeof value === "string" ? value : null;
}

function evaluate(node, get) {
  const run = child => { const value = evaluate(child, get); return typeof value === "number" && !Number.isFinite(value) ? null : value; };
  if (node.kind === "literal") return node.value;
  if (node.kind === "field") return get(node.name);
  if (node.kind === "unary") { const value = run(node.value); return value === null ? null : node.op === "!" ? !value : node.op === "-" ? -value : value; }
  if (node.kind === "binary") {
    const left = run(node.left);
    if (node.op === "&&" && left === false) return false;
    if (node.op === "||" && left === true) return true;
    const right = run(node.right);
    if (node.op === "==") return left === right;
    if (node.op === "!=") return left !== right;
    if (node.op === "&") return String(left ?? "") + String(right ?? "");
    if (left === null || right === null) return null;
    switch (node.op) {
      case "+": return left + right; case "-": return left - right; case "*": return left * right;
      case "/": return right === 0 ? null : left / right; case "%": return right === 0 ? null : left % right;
      case ">": return left > right; case ">=": return left >= right; case "<": return left < right; case "<=": return left <= right;
      case "&&": return left && right; case "||": return left || right;
    }
  }
  if (node.name === "IF") { const condition = run(node.args[0]); return condition === null ? null : run(node.args[condition ? 1 : 2]); }
  if (node.name === "AND") { for (const arg of node.args) { if (!run(arg)) return false; } return true; }
  if (node.name === "OR") { for (const arg of node.args) { if (run(arg)) return true; } return false; }
  if (node.name === "NOT") return !Boolean(run(node.args[0]));
  if (node.name === "ISBLANK") { const value = run(node.args[0]); return value === null || value === undefined || value === ""; }
  if (node.name === "ISPICKVAL") return String(run(node.args[0]) ?? "") === String(run(node.args[1]) ?? "");
  if (node.name === "TEXT") { const value = run(node.args[0]); return value == null ? "" : String(value); }
  if (node.name === "BEGINS") return String(run(node.args[0]) ?? "").startsWith(String(run(node.args[1]) ?? ""));
  if (node.name === "CONTAINS") return String(run(node.args[0]) ?? "").includes(String(run(node.args[1]) ?? ""));
  if (node.name === "COALESCE") { for (const arg of node.args) { const value = run(arg); if (value !== null) return value; } return null; }
  if (node.name === "TODAY") return new Date().toISOString().slice(0, 10);
  if (node.name === "NOW") return new Date().toISOString();
  const args = node.args.map(run);
  if (node.name === "CONCAT") return args.map(value => value ?? "").join("").slice(0, 10000);
  if (node.name === "TRIM") return args[0] == null ? null : String(args[0]).trim();
  if (node.name === "UPPER") return args[0] == null ? null : String(args[0]).toUpperCase();
  if (node.name === "PARSEDATE") {
    const text = String(args[0] || '').trim();
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
  }
  if (node.name === "MINUTESBETWEEN") {
    const start = new Date(args[0]), end = new Date(args[1]);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  }
  if (node.name === "ADDDAYS") {
    if (args.includes(null) || !Number.isFinite(Number(args[1]))) return null;
    const date = new Date(args[0]);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + Number(args[1]));
    return String(args[0]).includes("T") ? date.toISOString() : date.toISOString().slice(0, 10);
  }
  if (node.name === "ADDMINUTES") {
    if (args.includes(null) || !Number.isFinite(Number(args[1]))) return null;
    const date = new Date(args[0]);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCMinutes(date.getUTCMinutes() + Number(args[1]));
    return date.toISOString();
  }
  if (args.includes(null)) return null;
  switch (node.name) {
    case "ABS": return Math.abs(args[0]); case "MIN": return Math.min(...args); case "MAX": return Math.max(...args);
    case "ROUND": { const places = args[1] ?? 0; return Number.isInteger(places) && places >= 0 && places <= 10 ? Number(args[0].toFixed(places)) : null; }
  }
}

export function workflowFormulaReferences(expression) {
  const ast = parseFormula(expression, { identifierPattern: WORKFLOW_SAFE, caseInsensitiveReserved: true });
  const refs = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.kind === "field") refs.add(node.name);
    else if (node.kind === "unary") walk(node.value);
    else if (node.kind === "binary") { walk(node.left); walk(node.right); }
    else if (node.kind === "call") node.args.forEach(walk);
  };
  walk(ast);
  return [...refs];
}

export function evaluateWorkflowFormula(expression, inputs = {}) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new FormulaError("Workflow formula inputs must be an object");
  }
  const names = Object.keys(inputs);
  for (const name of names) {
    if (!WORKFLOW_SAFE.test(name) || RESERVED.has(String(name).toLowerCase())) fail(`Invalid workflow formula input: ${name}`);
  }
  const ast = parseFormula(expression, { identifierPattern: WORKFLOW_SAFE, caseInsensitiveReserved: true });
  const value = evaluate(ast, (name) => {
    if (!Object.prototype.hasOwnProperty.call(inputs, name)) fail(`Workflow formula references an unknown input: ${name}`);
    const input = inputs[name];
    if (input === undefined || input === "") return null;
    return input;
  });
  return typeof value === "number" && !Number.isFinite(value) ? null : value;
}

export function compileFormulas(fields) {
  const byName = new Map(fields.filter(f => f.active !== false).map(f => [f.api_name, f]));
  const compiled = new Map(), visiting = new Set(), dependencyDepths = new Map();
  function visit(field, depth = 0) {
    if (depth > 32) fail("Formula dependency chain exceeds 32 fields");
    if (compiled.has(field.api_name)) return;
    if (visiting.has(field.api_name)) fail(`Circular formula reference: ${field.api_name}`);
    if (!SAFE.test(field.api_name) || RESERVED.has(field.api_name)) fail("Formula API name is reserved or invalid");
    if (field.source_column || field.required || field.writable) fail("Formula fields must be read-only, optional, and have no database column");
    if (!TYPES.has(field.config?.resultType)) fail("Select a supported formula result type");
    visiting.add(field.api_name);
    let dependencyDepth = 0;
    const ast = parseFormula(field.config?.expression, { identifierPattern: SAFE_PATH });
    const resultType = infer(ast, name => {
      if (name.includes(".")) {
        const type = field.config?.recordPathTypes?.[name] || field.config?.record_path_types?.[name];
        if (!type || !TYPES.has(type)) fail(`Formula references an unavailable record path: ${name}`);
        return formulaType(type);
      }
      const dependency = byName.get(name);
      if (!dependency || dependency.readable === false) fail(`Formula references an unavailable field: ${name}`);
      if (dependency.field_type === "formula") {
        visit(dependency, depth + 1);
        dependencyDepth = Math.max(dependencyDepth, 1 + dependencyDepths.get(name));
        if (dependencyDepth > 32) fail("Formula dependency chain exceeds 32 fields");
      } else if (dependency.field_type === "rollup") {
        const type = effectiveFieldType(dependency);
        if (!TYPES.has(type)) fail(`Unsupported formula dependency type: ${name}`);
        return formulaType(type);
      } else if (!SAFE.test(dependency.source_column || "") && !(dependency.config?.storage === "extension" && !dependency.source_column)) fail(`Formula references an unmapped field: ${name}`);
      const type = effectiveFieldType(dependency);
      if (!TYPES.has(type)) fail(`Unsupported formula dependency type: ${name}`);
      return formulaType(type);
    });
    const expected = formulaType(field.config.resultType);
    if (resultType !== "null" && resultType !== expected) fail(`Formula result must match ${field.config.resultType}`);
    visiting.delete(field.api_name);
    dependencyDepths.set(field.api_name, dependencyDepth);
    compiled.set(field.api_name, { field, ast });
  }
  for (const field of byName.values()) if (field.field_type === "formula") visit(field);
  return record => {
    const result = { ...record };
    for (const [name, { field, ast }] of compiled) {
      const value = evaluate(ast, key => {
        if (key.includes(".")) {
          const pathType = field.config?.recordPathTypes?.[key] || field.config?.record_path_types?.[key];
          return valueFor(result.__formulaPathValues?.[key], pathType);
        }
        return valueFor(result[key], effectiveFieldType(byName.get(key)));
      });
      result[name] = typeof value === "number" && !Number.isFinite(value) ? null : value;
    }
    // Callers project readable fields before sending calculated records to clients.
    return result;
  };
}
