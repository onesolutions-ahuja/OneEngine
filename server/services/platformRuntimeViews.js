const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function safeIdentifier(value, label = "identifier") {
  const text = String(value || "");
  if (!SAFE_IDENTIFIER.test(text)) throw new Error(`Invalid metadata ${label}`);
  return text;
}

async function resolveObject(db, companyId, objectKey) {
  const result = await db(
    `SELECT * FROM platform_objects
      WHERE object_key=$1 AND active=true
        AND (company_id IS NULL OR company_id=$2)
      ORDER BY company_id NULLS FIRST
      LIMIT 1`,
    [objectKey, companyId]
  );
  const object = result.rows?.[0] || null;
  if (!object?.source_table) return null;
  safeIdentifier(object.source_table, "source table");
  return object;
}

async function resolveFields(db, companyId, object) {
  const result = await db(
    `SELECT api_name,source_column,readable,active
       FROM platform_fields
      WHERE object_id=$1 AND active=true
        AND (company_id IS NULL OR company_id=$2)
      ORDER BY company_id NULLS FIRST,display_order,label`,
    [object.id, companyId]
  );
  return new Map(
    (result.rows || [])
      .filter((field) => field.readable !== false && field.source_column && SAFE_IDENTIFIER.test(String(field.api_name || "")) && SAFE_IDENTIFIER.test(String(field.source_column || "")))
      .map((field) => [String(field.api_name), String(field.source_column)])
  );
}

function projectionColumns(projection = {}, fields) {
  const entries = Object.entries(projection || {});
  return entries.map(([alias, apiName]) => {
    safeIdentifier(alias, "projection alias");
    const column = fields.get(String(apiName));
    if (!column) throw new Error(`Runtime view field ${apiName} is unavailable`);
    return { alias, apiName: String(apiName), column };
  });
}

async function readOne({ db, companyId, storeId = null, object, recordId, projection }) {
  if (!recordId) return null;
  const fields = await resolveFields(db, companyId, object);
  const columns = projectionColumns(projection, fields);
  const params = [recordId];
  const clauses = ["id=$1"];
  if (object.company_scoped !== false && fields.has("company_id")) {
    params.push(companyId);
    clauses.push(`"${fields.get("company_id")}"=$${params.length}`);
  }
  if (storeId && object.store_scoped === true && fields.has("store_id")) {
    params.push(storeId);
    clauses.push(`"${fields.get("store_id")}"=$${params.length}`);
  }
  const select = ["id", ...columns.map(({ alias, column }) => `"${column}" AS "${alias}"`)];
  const result = await db(
    `SELECT ${select.join(",")} FROM "${object.source_table}" WHERE ${clauses.join(" AND ")} LIMIT 1`,
    params
  );
  return result.rows?.[0] || null;
}

async function readMany({ db, companyId, storeId = null, object, foreignField, foreignValue, projection, orderBy = null, limit = 500 }) {
  if (!foreignValue) return [];
  const fields = await resolveFields(db, companyId, object);
  const columns = projectionColumns(projection, fields);
  const foreignColumn = fields.get(String(foreignField));
  if (!foreignColumn) throw new Error(`Runtime view foreign field ${foreignField} is unavailable`);
  const params = [foreignValue];
  const clauses = [`"${foreignColumn}"=$1`];
  if (object.company_scoped !== false && fields.has("company_id")) {
    params.push(companyId);
    clauses.push(`"${fields.get("company_id")}"=$${params.length}`);
  }
  if (storeId && object.store_scoped === true && fields.has("store_id")) {
    params.push(storeId);
    clauses.push(`"${fields.get("store_id")}"=$${params.length}`);
  }
  let orderSql = "";
  if (orderBy?.field) {
    const orderColumn = fields.get(String(orderBy.field));
    if (!orderColumn) throw new Error(`Runtime view order field ${orderBy.field} is unavailable`);
    orderSql = ` ORDER BY "${orderColumn}" ${String(orderBy.direction || "asc").toLowerCase() === "desc" ? "DESC" : "ASC"}`;
  }
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 1000));
  params.push(boundedLimit);
  const select = ["id", ...columns.map(({ alias, column }) => `"${column}" AS "${alias}"`)];
  const result = await db(
    `SELECT ${select.join(",")} FROM "${object.source_table}" WHERE ${clauses.join(" AND ")}${orderSql} LIMIT $${params.length}`,
    params
  );
  return result.rows || [];
}

export async function loadConfiguredRuntimeView({ db, companyId, storeId = null, viewKey, recordId }) {
  if (!db || !companyId || !viewKey || !recordId) return null;
  const ownerResult = await db(
    `SELECT * FROM platform_objects
      WHERE active=true
        AND (company_id IS NULL OR company_id=$1)
        AND COALESCE(config,'{}'::jsonb)->'runtimeViews' ? $2
      ORDER BY company_id NULLS FIRST
      LIMIT 1`,
    [companyId, String(viewKey)]
  );
  const owner = ownerResult.rows?.[0] || null;
  const descriptor = owner?.config?.runtimeViews?.[viewKey];
  if (!owner || !descriptor || typeof descriptor !== "object") return null;

  const record = await readOne({
    db, companyId, storeId, object: owner, recordId,
    projection: descriptor.fields || {},
  });
  if (!record) return null;

  const lookups = {};
  for (const lookup of Array.isArray(descriptor.lookups) ? descriptor.lookups : []) {
    const target = await resolveObject(db, companyId, lookup.objectKey);
    if (!target) continue;
    const sourceValue = record[lookup.sourceAlias || lookup.sourceField];
    lookups[lookup.alias] = sourceValue
      ? await readOne({ db, companyId, object: target, recordId: sourceValue, projection: lookup.fields || {} })
      : null;
  }

  const collections = {};
  for (const collection of Array.isArray(descriptor.collections) ? descriptor.collections : []) {
    const target = await resolveObject(db, companyId, collection.objectKey);
    if (!target) {
      collections[collection.alias] = [];
      continue;
    }
    collections[collection.alias] = await readMany({
      db, companyId, storeId, object: target,
      foreignField: collection.foreignField,
      foreignValue: collection.sourceAlias ? record[collection.sourceAlias] : record.id,
      projection: collection.fields || {},
      orderBy: collection.orderBy || null,
      limit: collection.limit,
    });
  }

  return { record, lookups, collections, descriptor };
}


function metadataValue(value, values = {}) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  return values[value.slice(1)];
}

export async function runConfiguredAggregateView({ db, companyId, storeId = null, viewKey, values = {} }) {
  if (!db || !companyId || !viewKey) return null;
  const ownerResult = await db(
    `SELECT * FROM platform_objects
      WHERE active=true
        AND (company_id IS NULL OR company_id=$1)
        AND COALESCE(config,'{}'::jsonb)->'aggregateViews' ? $2
      ORDER BY company_id NULLS LAST
      LIMIT 1`,
    [companyId, String(viewKey)]
  );
  const object = ownerResult.rows?.[0] || null;
  const descriptor = object?.config?.aggregateViews?.[viewKey];
  if (!object?.source_table || !descriptor || typeof descriptor !== "object") return null;
  safeIdentifier(object.source_table, "source table");
  const fields = await resolveFields(db, companyId, object);
  const params = [];
  const clauses = [];

  if (object.company_scoped !== false && fields.has("company_id")) {
    params.push(companyId);
    clauses.push(`"${fields.get("company_id")}"=$${params.length}`);
  }
  if (object.store_scoped === true) {
    if (!storeId) throw new Error("A store context is required");
    const storeColumn = fields.get("store_id");
    if (!storeColumn) throw new Error("Store-scoped metadata object is missing store_id");
    params.push(storeId);
    clauses.push(`"${storeColumn}"=$${params.length}`);
  }

  for (const filter of Array.isArray(descriptor.filters) ? descriptor.filters : []) {
    const column = fields.get(String(filter.field));
    if (!column) throw new Error(`Aggregate view field ${filter.field} is unavailable`);
    const operator = String(filter.operator || "equals");
    const value = metadataValue(filter.value, values);
    if (operator === "equals" || operator === "not_equals" || operator === "gte" || operator === "gt" || operator === "lte" || operator === "lt") {
      params.push(value);
      const sqlOperator = ({ equals:"=", not_equals:"<>", gte:">=", gt:">", lte:"<=", lt:"<" })[operator];
      clauses.push(`"${column}" ${sqlOperator} $${params.length}`);
    } else if (operator === "local_date_equals") {
      const timezone = metadataValue(filter.timezone, values);
      if (!timezone || !value) throw new Error("Local-date aggregate filter requires date and timezone");
      params.push(timezone);
      const timezoneParam = `$${params.length}`;
      params.push(value);
      clauses.push(`("${column}" AT TIME ZONE ${timezoneParam})::date = $${params.length}::date`);
    } else if (operator === "is_blank") {
      clauses.push(`"${column}" IS NULL`);
    } else if (operator === "is_not_blank") {
      clauses.push(`"${column}" IS NOT NULL`);
    } else {
      throw new Error(`Unsupported aggregate view operator ${operator}`);
    }
  }

  const summaries = [];
  for (const summary of Array.isArray(descriptor.summaries) ? descriptor.summaries : []) {
    const alias = safeIdentifier(summary.alias, "summary alias");
    const field = fields.get(String(summary.field));
    if (!field) throw new Error(`Aggregate view summary field ${summary.field} is unavailable`);
    const aggregate = String(summary.aggregate || "COUNT").toUpperCase();
    if (!["COUNT","SUM","AVG","MIN","MAX"].includes(aggregate)) throw new Error("Unsupported aggregate");
    const expr = aggregate === "COUNT"
      ? `COUNT("${field}")::int`
      : `COALESCE(${aggregate}("${field}"),0)`;
    summaries.push(`${expr} AS "${alias}"`);
  }
  if (!summaries.length) throw new Error("Aggregate view needs at least one summary");
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const result = await db(`SELECT ${summaries.join(",")} FROM "${object.source_table}"${where}`, params);
  return result.rows?.[0] || {};
}
