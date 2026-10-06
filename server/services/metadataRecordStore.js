const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function safeIdentifier(value, label) {
  const text = String(value || "");
  if (!IDENTIFIER.test(text)) throw new Error(`Unsafe ${label}: ${text || "(empty)"}`);
  return text;
}

export async function resolveMetadataObject(db, { objectKey, companyId = null }) {
  const result = await db(
    `SELECT o.id,o.object_key,o.source_table,o.company_id,o.company_scoped,o.store_scoped,
            COALESCE(jsonb_agg(jsonb_build_object(
              'apiName',f.api_name,'sourceColumn',f.source_column,'writable',f.writable,'fieldType',f.field_type
            ) ORDER BY f.display_order) FILTER (WHERE f.id IS NOT NULL),'[]'::jsonb) AS fields
       FROM platform_objects o
       LEFT JOIN platform_fields f ON f.object_id=o.id AND f.active=true
      WHERE o.object_key=$1 AND o.active=true
        AND (o.company_id IS NULL OR o.company_id=$2)
      GROUP BY o.id
      ORDER BY (o.company_id IS NOT NULL) DESC
      LIMIT 1`,
    [objectKey, companyId]
  );
  const object = result.rows?.[0] || null;
  if (!object?.source_table) throw new Error(`Metadata object is unavailable: ${objectKey}`);
  object.source_table = safeIdentifier(object.source_table, "source table");
  object.fieldMap = new Map(
    (Array.isArray(object.fields) ? object.fields : [])
      .filter((field) => field?.apiName && field?.sourceColumn)
      .map((field) => [field.apiName, { ...field, sourceColumn: safeIdentifier(field.sourceColumn, "source column") }])
  );
  return object;
}

function fieldColumn(object, apiName) {
  const field = object.fieldMap.get(String(apiName || ""));
  if (!field) throw new Error(`Field is not declared in metadata: ${object.object_key}.${apiName}`);
  return field.sourceColumn;
}

export async function selectMetadataRecords(db, {
  objectKey, companyId = null, filters = {}, columns = null, orderBy = null, limit = null, forUpdate = false,
} = {}) {
  const object = await resolveMetadataObject(db, { objectKey, companyId });
  const selected = Array.isArray(columns) && columns.length
    ? columns.map((apiName) => `${fieldColumn(object, apiName)} AS ${safeIdentifier(apiName, "field alias")}`).join(",")
    : [...object.fieldMap.entries()].map(([apiName, field]) => `${field.sourceColumn} AS ${safeIdentifier(apiName, "field alias")}`).join(",");
  const params = [];
  const where = [];
  for (const [apiName, value] of Object.entries(filters || {})) {
    params.push(value);
    where.push(`${fieldColumn(object, apiName)}=$${params.length}`);
  }
  if (companyId && object.fieldMap.has("company_id") && !Object.prototype.hasOwnProperty.call(filters || {}, "company_id")) {
    params.push(companyId);
    where.push(`${fieldColumn(object, "company_id")}=$${params.length}`);
  }
  let sql = `SELECT ${selected || "*"} FROM ${object.source_table}`;
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  if (orderBy?.field) {
    sql += ` ORDER BY ${fieldColumn(object, orderBy.field)} ${String(orderBy.direction || "ASC").toUpperCase()==="DESC"?"DESC":"ASC"}`;
  }
  if (Number.isInteger(limit) && limit > 0) sql += ` LIMIT ${Math.min(limit, 10000)}`;
  if (forUpdate) sql += " FOR UPDATE";
  const result = await db(sql, params);
  return result.rows || [];
}

export async function upsertMetadataRecord(db, {
  objectKey, companyId = null, match = {}, values = {}, returnColumns = null,
} = {}) {
  const object = await resolveMetadataObject(db, { objectKey, companyId });
  const merged = { ...(values || {}) };
  if (companyId && object.fieldMap.has("company_id") && merged.company_id === undefined) merged.company_id = companyId;
  const entries = Object.entries(merged).filter(([apiName]) => object.fieldMap.get(apiName)?.writable !== false);
  if (!entries.length) throw new Error(`No writable metadata fields supplied for ${objectKey}`);
  const params = entries.map(([, value]) => value);
  const columns = entries.map(([apiName]) => fieldColumn(object, apiName));
  const placeholders = entries.map((_, index) => `$${index + 1}`);
  const matchFields = Object.keys(match || {});
  for (const apiName of matchFields) if (!entries.some(([name]) => name === apiName)) {
    entries.push([apiName, match[apiName]]);
    columns.push(fieldColumn(object, apiName));
    params.push(match[apiName]);
    placeholders.push(`$${params.length}`);
  }
  const conflictColumns = matchFields.map((apiName) => fieldColumn(object, apiName));
  const updates = entries
    .filter(([apiName]) => !matchFields.includes(apiName))
    .map(([apiName]) => {
      const column = fieldColumn(object, apiName);
      return `${column}=EXCLUDED.${column}`;
    });
  const returning = Array.isArray(returnColumns) && returnColumns.length
    ? returnColumns.map((apiName) => `${fieldColumn(object, apiName)} AS ${safeIdentifier(apiName,"field alias")}`).join(",")
    : "*";
  const sql = `INSERT INTO ${object.source_table} (${columns.join(",")}) VALUES (${placeholders.join(",")})
    ${conflictColumns.length ? `ON CONFLICT (${conflictColumns.join(",")}) DO UPDATE SET ${updates.length ? updates.join(",") : conflictColumns[0]+"=EXCLUDED."+conflictColumns[0]}` : ""}
    RETURNING ${returning}`;
  const result = await db(sql, params);
  return result.rows?.[0] || null;
}

export async function updateMetadataRecords(db, { objectKey, companyId = null, filters = {}, values = {}, returning = null } = {}) {
  const object = await resolveMetadataObject(db, { objectKey, companyId });
  const params = [];
  const sets = [];
  for (const [apiName, value] of Object.entries(values || {})) {
    const field = object.fieldMap.get(apiName);
    if (!field || field.writable === false) throw new Error(`Field is not writable in metadata: ${objectKey}.${apiName}`);
    params.push(value);
    sets.push(`${field.sourceColumn}=$${params.length}`);
  }
  const where = [];
  for (const [apiName, value] of Object.entries(filters || {})) {
    params.push(value);
    where.push(`${fieldColumn(object, apiName)}=$${params.length}`);
  }
  if (companyId && object.fieldMap.has("company_id") && !Object.prototype.hasOwnProperty.call(filters || {}, "company_id")) {
    params.push(companyId);
    where.push(`${fieldColumn(object, "company_id")}=$${params.length}`);
  }
  if (!sets.length || !where.length) throw new Error("Metadata update requires values and scoped filters");
  const returnSql = returning?.length ? " RETURNING "+returning.map((apiName)=>`${fieldColumn(object,apiName)} AS ${safeIdentifier(apiName,"field alias")}`).join(",") : "";
  const result = await db(`UPDATE ${object.source_table} SET ${sets.join(",")} WHERE ${where.join(" AND ")}${returnSql}`, params);
  return returning?.length ? (result.rows || []) : { rowCount: result.rowCount || 0 };
}
