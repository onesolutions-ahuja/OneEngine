import { compileFormulas, evaluateFormulaExpression, formulaDependencies, normalizeRollupConfig } from "./platformFormula.js";
import { evaluateCondition } from "./platformConditions.js";
import { isSafeIdentifier } from "./platformMetadata.js";

const CALCULATED = new Set(["formula", "rollup"]);

function activeFields(fields = []) {
  return fields.filter((field) => field && field.active !== false);
}

export function applyDerivedDefaults(fields, input = {}) {
  const result = { ...(input || {}) };
  const usable = activeFields(fields);
  for (const field of usable) {
    if (!field.api_name || CALCULATED.has(field.field_type) || field.writable === false) continue;
    if (result[field.api_name] !== undefined && result[field.api_name] !== null && result[field.api_name] !== "") continue;
    const config = field.config && typeof field.config === "object" ? field.config : {};
    if (Object.hasOwn(config, "defaultValue")) result[field.api_name] = config.defaultValue;
    else if (Object.hasOwn(config, "default_value")) result[field.api_name] = config.default_value;
    else if (typeof config.defaultExpression === "string" && config.defaultExpression.trim()) {
      result[field.api_name] = evaluateFormulaExpression(usable, config.defaultExpression, result, field.field_type);
    } else if (typeof config.default_expression === "string" && config.default_expression.trim()) {
      result[field.api_name] = evaluateFormulaExpression(usable, config.default_expression, result, field.field_type);
    }
  }
  return result;
}

function requiredLookupPaths(fields) {
  const paths = new Set();
  for (const field of activeFields(fields)) {
    if (field.field_type !== "formula") continue;
    for (const dependency of formulaDependencies(field.config?.expression || "")) {
      if (dependency.includes(".")) paths.add(dependency);
    }
  }
  return [...paths];
}

async function loadObjectByKey(db, objectKey, companyId) {
  const result = await db(
    "SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY company_id NULLS FIRST LIMIT 1",
    [objectKey, companyId]
  );
  return result.rows?.[0] || null;
}

async function loadObjectFields(db, objectId, companyId) {
  const result = await db(
    "SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order",
    [objectId, companyId]
  );
  return result.rows || [];
}

async function loadRelatedRecord({ db, object, recordId, req }) {
  if (!object?.source_table || !isSafeIdentifier(object.source_table) || !recordId) return null;
  const params = [recordId];
  const clauses = ["id=$1"];
  if (object.company_scoped) {
    params.push(req.user.companyId);
    clauses.push(`company_id=$${params.length}`);
  }
  if (object.store_scoped) {
    if (!req.user.storeId) return null;
    params.push(req.user.storeId);
    clauses.push(`store_id=$${params.length}`);
  }
  const result = await db(`SELECT * FROM "${object.source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`, params);
  return result.rows?.[0] || null;
}

async function hydrateLookupPath({ db, fields, record, path, req, cache, depth = 0 }) {
  if (depth > 4) return;
  const [root, ...rest] = path.split(".");
  if (!root || !rest.length) return;
  const rootField = fields.find((field) => field.api_name === root && field.active !== false);
  if (!rootField || rootField.field_type !== "lookup") return;
  const lookupId = record?.[root];
  if (!lookupId) return;

  const targetKey = rootField.config?.relatedObjectKey || rootField.config?.related_object_key || rootField.config?.objectKey;
  if (!targetKey) return;
  const cacheKey = `${targetKey}:${lookupId}`;
  let related = cache.get(cacheKey);
  let targetObject;
  let targetFields;
  if (!related) {
    targetObject = await loadObjectByKey(db, targetKey, req.user.companyId);
    if (!targetObject) return;
    targetFields = await loadObjectFields(db, targetObject.id, req.user.companyId);
    related = await loadRelatedRecord({ db, object: targetObject, recordId: lookupId, req });
    if (!related) return;
    cache.set(cacheKey, { record: related, object: targetObject, fields: targetFields });
  } else {
    targetObject = related.object;
    targetFields = related.fields;
    related = related.record;
  }

  record[root] = { ...related };
  if (rest.length > 1) {
    await hydrateLookupPath({
      db,
      fields: targetFields,
      record: record[root],
      path: rest.join("."),
      req,
      cache,
      depth: depth + 1,
    });
  }
}


async function resolveRelatedPathType({ db, field, path, req, depth = 0 }) {
  if (depth > 4 || !field || field.field_type !== "lookup") return null;
  const targetKey = field.config?.relatedObjectKey || field.config?.related_object_key || field.config?.objectKey;
  if (!targetKey) return null;
  const targetObject = await loadObjectByKey(db, targetKey, req.user.companyId);
  if (!targetObject) return null;
  const targetFields = await loadObjectFields(db, targetObject.id, req.user.companyId);
  const [segment, ...rest] = path.split(".");
  const targetField = targetFields.find((candidate) => candidate.api_name === segment && candidate.active !== false);
  if (!targetField) return null;
  if (!rest.length) {
    if (targetField.field_type === "formula" || targetField.field_type === "rollup") {
      return targetField.config?.resultType || targetField.config?.result_type || "text";
    }
    return targetField.field_type;
  }
  return resolveRelatedPathType({ db, field: targetField, path: rest.join("."), req, depth: depth + 1 });
}

export async function prepareFormulaFields({ db, fields, req }) {
  const prepared = activeFields(fields).map((field) => ({
    ...field,
    config: field.config && typeof field.config === "object" ? { ...field.config } : {},
  }));

  for (const formula of prepared.filter((field) => field.field_type === "formula")) {
    for (const dependency of formulaDependencies(formula.config?.expression || "")) {
      if (!dependency.includes(".")) continue;
      const [root, ...rest] = dependency.split(".");
      const lookup = prepared.find((field) => field.api_name === root);
      if (!lookup || lookup.field_type !== "lookup") continue;
      const type = await resolveRelatedPathType({ db, field: lookup, path: rest.join("."), req });
      if (!type) continue;
      lookup.config.relatedFieldTypes = {
        ...(lookup.config.relatedFieldTypes || lookup.config.related_field_types || {}),
        [rest.join(".")]: type,
      };
    }
  }
  return prepared;
}

export function buildDerivedDependencyGraph(fields) {
  const nodes = {};
  for (const field of activeFields(fields)) {
    if (field.field_type === "formula") {
      nodes[field.api_name] = {
        kind: "formula",
        dependencies: formulaDependencies(field.config?.expression || ""),
      };
    } else if (field.field_type === "rollup") {
      const config = normalizeRollupConfig(field);
      nodes[field.api_name] = {
        kind: "rollup",
        relationshipKey: config?.relationshipKey || null,
        sourceField: config?.sourceField || null,
        dependencies: config?.sourceField ? [`${config.relationshipKey}.${config.sourceField}`] : [config?.relationshipKey].filter(Boolean),
      };
    }
  }
  return nodes;
}

export async function hydrateFormulaLookups({ db, fields, record, req }) {
  const result = { ...(record || {}) };
  const cache = new Map();
  for (const path of requiredLookupPaths(fields)) {
    await hydrateLookupPath({ db, fields, record: result, path, req, cache });
  }
  return result;
}

export async function evaluateRollupsForRecord({ db, object, fields, record, req }) {
  const result = { ...(record || {}) };
  for (const field of activeFields(fields).filter((candidate) => candidate.field_type === "rollup")) {
    const config = normalizeRollupConfig(field);
    if (!config?.relationshipKey || !result.id) {
      result[field.api_name] = result[field.api_name] ?? null;
      continue;
    }

    const relationshipResult = await db(
      `SELECT r.*, c.source_table AS child_source_table, c.company_scoped AS child_company_scoped,
              c.store_scoped AS child_store_scoped
         FROM platform_relationships r
         JOIN platform_objects c ON c.id=r.child_object_id
        WHERE r.parent_object_id=$1 AND r.relationship_key=$2 AND r.active=true
        LIMIT 1`,
      [object.id, config.relationshipKey]
    );
    const relationship = relationshipResult.rows?.[0];
    if (!relationship?.child_field_id || !relationship.child_source_table || !isSafeIdentifier(relationship.child_source_table)) {
      result[field.api_name] = null;
      continue;
    }

    const childFields = await loadObjectFields(db, relationship.child_object_id, req.user.companyId);
    const joinField = childFields.find((candidate) => String(candidate.id) === String(relationship.child_field_id));
    if (!joinField?.source_column || !isSafeIdentifier(joinField.source_column)) {
      result[field.api_name] = null;
      continue;
    }

    const params = [result.id];
    const clauses = [`"${joinField.source_column}"=$1`];
    if (relationship.child_company_scoped) {
      params.push(req.user.companyId);
      clauses.push(`company_id=$${params.length}`);
    }
    if (relationship.child_store_scoped) {
      if (!req.user.storeId) {
        result[field.api_name] = null;
        continue;
      }
      params.push(req.user.storeId);
      clauses.push(`store_id=$${params.length}`);
    }

    const rowsResult = await db(
      `SELECT * FROM "${relationship.child_source_table}" WHERE ${clauses.join(" AND ")}`,
      params
    );
    let rows = rowsResult.rows || [];
    if (config.condition) {
      const condition = config.condition?.conditions ? config.condition : {
        match: "all",
        conditions: Array.isArray(config.condition) ? config.condition : [config.condition],
      };
      rows = rows.filter((row) => evaluateCondition(condition, childFields, row));
    }

    if (config.operation === "COUNT") {
      result[field.api_name] = rows.length;
      continue;
    }

    const source = childFields.find((candidate) =>
      candidate.api_name === config.sourceField || candidate.source_column === config.sourceField
    );
    const sourceColumn = source?.source_column;
    if (!sourceColumn || !isSafeIdentifier(sourceColumn)) {
      result[field.api_name] = null;
      continue;
    }
    const values = rows.map((row) => row[sourceColumn]).filter((value) => value !== null && value !== undefined && value !== "");
    if (!values.length) {
      result[field.api_name] = null;
      continue;
    }
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) {
      result[field.api_name] = null;
      continue;
    }
    if (config.operation === "SUM") result[field.api_name] = numbers.reduce((a, b) => a + b, 0);
    else if (config.operation === "AVG") result[field.api_name] = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    else if (config.operation === "MIN") result[field.api_name] = Math.min(...numbers);
    else if (config.operation === "MAX") result[field.api_name] = Math.max(...numbers);
    else result[field.api_name] = null;
  }
  return result;
}

export async function recalculateDerivedRecord({ db, object, fields, record, req }) {
  const preparedFields = await prepareFormulaFields({ db, fields, req });
  let result = await evaluateRollupsForRecord({ db, object, fields: preparedFields, record, req });
  result = await hydrateFormulaLookups({ db, fields: preparedFields, record: result, req });
  result = compileFormulas(preparedFields)(result);
  return result;
}
