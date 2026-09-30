const MATCH_OPERATORS = new Set(["exact", "normalized_text", "normalized_email", "normalized_phone"]);
const DUPLICATE_ACTIONS = new Set(["ALLOW", "WARN", "BLOCK"]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeDuplicateValue(operator, value) {
  if (!MATCH_OPERATORS.has(operator)) throw new Error(`Unsupported matching operator: ${operator}`);
  if (value === null || value === undefined || value === "") return null;
  if (operator === "exact") return value;
  if (operator === "normalized_text") return normalizeText(value);
  if (operator === "normalized_email") return String(value).trim().toLowerCase();
  return String(value).replace(/\D/g, "");
}

export function validateDuplicateRule(rule) {
  const action = String(rule?.action || "BLOCK").toUpperCase();
  const fields = Array.isArray(rule?.fields) ? rule.fields : [];
  const matchMode = String(rule?.matchMode || "ANY").toUpperCase();
  if (!DUPLICATE_ACTIONS.has(action)) throw new Error("Duplicate rule action must be ALLOW, WARN, or BLOCK");
  if (!["ANY", "ALL"].includes(matchMode)) throw new Error("Duplicate rule matchMode must be ANY or ALL");
  if (!fields.length) throw new Error("A duplicate rule must configure at least one field");
  for (const field of fields) {
    if (!field || typeof field.fieldApiName !== "string" || !/^[a-z][a-z0-9_]{0,99}$/i.test(field.fieldApiName)) {
      throw new Error("Duplicate rule fields must use valid field API names");
    }
    if (!MATCH_OPERATORS.has(field.operator)) throw new Error(`Unsupported matching operator: ${field.operator}`);
  }
  return { ...rule, action, matchMode, fields };
}

export function evaluateDuplicateRules(rules, input, records, { excludeRecordId = null } = {}) {
  const matches = [];
  for (const rawRule of rules || []) {
    const rule = validateDuplicateRule(rawRule);
    const configured = rule.fields.filter((field) => input?.[field.fieldApiName] !== undefined && input?.[field.fieldApiName] !== null && input?.[field.fieldApiName] !== "");
    if (!configured.length) continue;
    const mode = String(rule.matchMode || "ANY").toUpperCase() === "ALL" ? "ALL" : "ANY";
    for (const record of records || []) {
      if (excludeRecordId && String(record.id) === String(excludeRecordId)) continue;
      const checks = configured.map((field) => {
        const expected = normalizeDuplicateValue(field.operator, input[field.fieldApiName]);
        const actual = normalizeDuplicateValue(field.operator, record[field.fieldApiName]);
        return expected !== null && actual !== null && expected === actual;
      });
      if ((mode === "ALL" && checks.every(Boolean)) || (mode === "ANY" && checks.some(Boolean))) {
        matches.push({
          ruleId: rule.id || null,
          ruleName: rule.name || null,
          action: rule.action,
          recordId: record.id,
          fields: configured.filter((_field, index) => checks[index]).map((field) => field.fieldApiName),
        });
      }
    }
  }
  return matches;
}

export function resolveDuplicateAction(matches) {
  if (!(matches || []).length) return "ALLOW";
  if (matches.some((match) => match.action === "BLOCK")) return "BLOCK";
  if (matches.some((match) => match.action === "WARN")) return "WARN";
  return "ALLOW";
}

export function configuredDuplicateRules(fields) {
  const grouped = new Map();
  for (const field of fields || []) {
    const config = field?.config && typeof field.config === "object" && !Array.isArray(field.config) ? field.config : {};
    const matching = config.duplicateMatching || config.duplicate_matching;
    if (!matching || matching.enabled === false) continue;
    const key = String(matching.ruleKey || matching.rule_key || field.api_name);
    const action = String(matching.action || "BLOCK").toUpperCase();
    const matchMode = String(matching.matchMode || matching.match_mode || "ANY").toUpperCase();
    const existing = grouped.get(key) || {
      id: key,
      name: matching.name || field.label || key,
      action,
      matchMode,
      fields: [],
    };
    if (existing.action !== action || existing.matchMode !== matchMode) {
      throw new Error(`Fields grouped under duplicate rule "${key}" must use the same action and match mode`);
    }
    existing.fields.push({ fieldApiName: field.api_name, operator: matching.operator || "exact" });
    grouped.set(key, existing);
  }
  return [...grouped.values()].map(validateDuplicateRule);
}

export async function findConfiguredDuplicateMatches({ db, object, fields, input, companyId, storeId = null, excludeRecordId = null }) {
  const rules = configuredDuplicateRules(fields);
  if (!rules.length) return [];
  const fieldByName = new Map((fields || []).map((field) => [field.api_name, field]));
  const storedFields = [...new Set(rules.flatMap((rule) => rule.fields).map(({ fieldApiName }) => fieldByName.get(fieldApiName)))]
    .filter((field) => field?.active === true && field.source_column && /^[a-z][a-z0-9_]{0,99}$/i.test(field.source_column));
  if (!storedFields.length) return [];
  if (!/^[a-z][a-z0-9_]{0,99}$/i.test(String(object?.source_table || ""))) throw new Error("Object source table is invalid");
  const columns = [...new Map(storedFields.map((field) => [field.api_name, field])).values()]
    .map((field) => `"${field.source_column}" AS "${field.api_name}"`);
  const clauses = [];
  const params = [];
  if (object.company_scoped) {
    params.push(companyId);
    clauses.push(`company_id=$${params.length}`);
  }
  if (object.store_scoped) {
    if (!storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
    params.push(storeId);
    clauses.push(`store_id=$${params.length}`);
  }
  const rows = await db(
    `SELECT id,${columns.join(",")} FROM "${object.source_table}"${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
    params
  );
  return evaluateDuplicateRules(rules, input, rows.rows, { excludeRecordId });
}