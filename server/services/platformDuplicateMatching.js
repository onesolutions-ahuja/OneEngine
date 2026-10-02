const MATCH_OPERATORS = new Set(["exact", "normalized_text", "normalized_email", "normalized_phone", "fuzzy_text", "fuzzy_name"]);
const DUPLICATE_ACTIONS = new Set(["ALLOW", "WARN", "BLOCK"]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeWords(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshteinDistance(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = saved;
    }
  }
  return previous[b.length];
}

export function fuzzySimilarity(operator, left, right) {
  const a = operator === "fuzzy_name"
    ? normalizeWords(left).sort().join(" ")
    : normalizeWords(left).join(" ");
  const b = operator === "fuzzy_name"
    ? normalizeWords(right).sort().join(" ")
    : normalizeWords(right).join(" ");
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  return maxLength ? 1 - (levenshteinDistance(a, b) / maxLength) : 1;
}

export function normalizeDuplicateValue(operator, value) {
  if (!MATCH_OPERATORS.has(operator)) throw new Error(`Unsupported matching operator: ${operator}`);
  if (value === null || value === undefined || value === "") return null;
  if (operator === "exact") return value;
  if (operator === "normalized_text") return normalizeText(value);
  if (operator === "normalized_email") return String(value).trim().toLowerCase();
  if (operator === "normalized_phone") return String(value).replace(/\D/g, "");
  return String(value);
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
    if (["fuzzy_text", "fuzzy_name"].includes(field.operator)) {
      const threshold = Number(field.threshold ?? 0.85);
      if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) {
        throw new Error("Fuzzy matching threshold must be between 0.5 and 1");
      }
    }
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
        if (expected === null || actual === null) return false;
        if (["fuzzy_text", "fuzzy_name"].includes(field.operator)) {
          return fuzzySimilarity(field.operator, expected, actual) >= Number(field.threshold ?? 0.85);
        }
        return expected === actual;
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

export async function loadObjectDuplicateRules({ db, objectId, companyId }) {
  const [matching, duplicate] = await Promise.all([
    db(
      `SELECT * FROM platform_matching_rules
        WHERE object_id=$1 AND company_id=$2 AND active=true
        ORDER BY label,id`,
      [objectId, companyId]
    ),
    db(
      `SELECT * FROM platform_duplicate_rules
        WHERE object_id=$1 AND company_id=$2 AND active=true
        ORDER BY label,id`,
      [objectId, companyId]
    ),
  ]);
  const matchingById = new Map(matching.rows.map((rule) => [String(rule.id), rule]));
  return duplicate.rows.map((rule) => {
    const match = matchingById.get(String(rule.matching_rule_id));
    if (!match) return null;
    return validateDuplicateRule({
      id: rule.id,
      name: rule.label,
      action: rule.action,
      matchMode: match.match_mode,
      fields: Array.isArray(match.fields) ? match.fields : [],
      matchingRuleId: match.id,
      matchingRuleKey: match.rule_key,
      duplicateRuleKey: rule.rule_key,
    });
  }).filter(Boolean);
}

export async function findObjectDuplicateMatches({ db, object, fields, input, companyId, storeId = null, excludeRecordId = null }) {
  const rules = await loadObjectDuplicateRules({ db, objectId: object.id, companyId });
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
    clauses.push(`company_id=${params.length}`);
  }
  if (object.store_scoped) {
    if (!storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
    params.push(storeId);
    clauses.push(`store_id=${params.length}`);
  }
  const rows = await db(
    `SELECT id,${columns.join(",")} FROM "${object.source_table}"${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
    params
  );
  return evaluateDuplicateRules(rules, input, rows.rows, { excludeRecordId });
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