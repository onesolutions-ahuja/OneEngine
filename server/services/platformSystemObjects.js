// Generic metadata-driven platform object helpers.
// Business object/table/route/permission knowledge belongs to package/object metadata.

export const SYSTEM_OBJECTS = Object.freeze([]);

export function systemObject(object) {
  if (!object || typeof object !== "object") return null;
  const config = object.config && typeof object.config === "object" ? object.config : {};
  const permission = config.rbacPermission || object.rbac_permission || null;
  const route = config.route || object.route || null;
  const companyScoped = config.companyScoped !== false;
  return permission || route ? { key: object.object_key, table: object.source_table, permission, route, companyScoped } : null;
}

export function systemObjectRbacPermission(object, action) {
  const config = object?.config && typeof object.config === "object" ? object.config : {};
  const permissions = config.rbac && typeof config.rbac === "object" ? config.rbac : {};
  return permissions[action] || null;
}

export function safeSystemFields(object, fields) {
  const allow = object?.config?.readableFields;
  if (!Array.isArray(allow) || !allow.length) return fields;
  const profile = new Set(allow);
  return fields.filter(field => !field.source_column || profile.has(field.source_column));
}

export async function hydrateExtensions(db, object, fields, records, req) {
  const custom = fields.filter(field => field.active !== false && isExtensionField(field));
  if (!custom.length || !records.length) return records;
  const stored = await db("SELECT record_id,custom_values FROM platform_record_associations WHERE object_id=$1 AND company_id=$2 AND record_id=ANY($3::uuid[])", [object.id, req.user.companyId, records.map(record => record.id)]);
  const byId = new Map(stored.rows.map(row => [String(row.record_id), row.custom_values]));
  return records.map(record => ({ ...record, ...Object.fromEntries(custom.map(field => [field.api_name, byId.get(String(record.id))?.[field.api_name] ?? null])) }));
}

export function tenantFields(fields, companyId) {
  return fields.filter(field => field.company_id == null || field.company_id === companyId);
}

export function isExtensionField(field) {
  return field.config?.storage === "extension" && !field.source_column;
}

export function platformFieldSql(field, object) {
  if (!field || field.readable === false || !/^[a-z_][a-z0-9_]*$/.test(field.api_name || "")) return null;
  if (field.source_column && /^[a-z_][a-z0-9_]*$/.test(field.source_column)) return `"${field.source_column}"`;
  if (!isExtensionField(field)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(object.id) || !/^[a-z_][a-z0-9_]*$/.test(object.source_table || "")) throw new Error("Invalid extension mapping");
  // Only validated metadata identifiers/UUIDs enter this expression. Correlate
  // on BOTH company and business record; callers scope the business table.
  const value = `(SELECT e.custom_values->>'${field.api_name}' FROM platform_record_associations e WHERE e.object_id='${object.id}'::uuid AND e.record_id="${object.source_table}".id AND e.company_id="${object.source_table}".company_id)`;
  const cast = ({ number: "numeric", decimal: "numeric", currency: "numeric", boolean: "boolean", date: "date", datetime: "timestamptz" })[field.field_type];
  return cast ? `NULLIF(${value},'')::${cast}` : value;
}

export function appendSystemReadScope(object, req, clauses, params) {
  if (object?.store_scoped === true) {
    if (!req.user.storeId) throw Object.assign(new Error("A store session is required"), { status: 403 });
    params.push(req.user.storeId);
    clauses.push(`store_id=$${params.length}`);
  }
}
