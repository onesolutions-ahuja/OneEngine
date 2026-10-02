import { applyFieldSecurity } from "./platformFieldValues.js";
import {
  appendSystemReadScope,
  platformFieldSql,
  safeSystemFields,
  systemObject,
} from "./platformSystemObjects.js";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 30;
const PER_OBJECT_LIMIT = 8;
const SEARCHABLE_TYPES = new Set(["text", "email", "phone", "select", "picklist", "lookup"]);

function isSafeIdentifier(value) {
  return typeof value === "string" && /^[a-z_][a-z0-9_]*$/.test(value);
}

async function searchableObjects(db, req) {
  const result = await db(
    `SELECT o.*, m.module_key
     FROM platform_objects o
     LEFT JOIN platform_modules m ON m.id=o.module_id
     WHERE o.active=true AND (o.company_id IS NULL OR o.company_id=$1)
       AND COALESCE(o.config->>'allowSearch','true') <> 'false'
       AND (m.id IS NULL OR m.installed=true)
     ORDER BY o.label, o.object_key`,
    [req.user.companyId]
  );
  return result.rows;
}

function destinationFor(object, recordId) {
  const system = systemObject(object);
  if (system) return `${system.route}?recordId=${encodeURIComponent(recordId)}`;
  return `/app/settings?tab=Platform&objectKey=${encodeURIComponent(object.object_key)}&recordId=${encodeURIComponent(recordId)}`;
}

function chooseLabel(fields) {
  return fields.find((field) => ["name", "title", "label", "full_name", "username", "code", "sku"].includes(field.api_name))
    || fields.find((field) => field.required)
    || fields[0];
}

export async function searchPlatformRecords(db, req, query, { maxResults = MAX_RESULTS } = {}) {
  const normalized = String(query || "").trim().slice(0, MAX_QUERY_LENGTH);
  if (normalized.length < MIN_QUERY_LENGTH) return { query: normalized, results: [] };
  const objects = await searchableObjects(db, req);
  const results = [];
  for (const object of objects) {
    if (results.length >= maxResults || !isSafeIdentifier(object.source_table)) break;
    try {
      const system = systemObject(object);
      const permission = system?.permission;
      const access = permission
        ? await db(
          `SELECT 1 FROM role_permissions rp
             JOIN roles r ON r.id=rp.role_id AND (r.company_id IS NULL OR r.company_id=$5)
             JOIN permissions p ON p.id=rp.permission_id
             WHERE rp.role_id=$1 AND p.code=$2
             UNION ALL
             SELECT 1 FROM platform_object_permissions
             WHERE object_id=$3 AND role_id=$1 AND company_id=$4 AND can_view=true
             LIMIT 1`,
          [req.user.roleId, permission, object.id, req.user.companyId, req.user.companyId]
        )
        : await db(
          "SELECT 1 FROM platform_object_permissions WHERE object_id=$1 AND role_id=$2 AND company_id=$3 AND can_view=true",
          [object.id, req.user.roleId, req.user.companyId]
        );
      if (!access.rows.length) continue;
      const fieldResult = await db(
        `SELECT * FROM platform_fields
         WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)
         ORDER BY display_order, label`,
        [object.id, req.user.companyId]
      );
      const secured = await applyFieldSecurity(db, safeSystemFields(object, fieldResult.rows), req);
      const readableFields = secured.filter((field) => field.readable !== false && platformFieldSql(field, object));
      const searchable = readableFields.filter((field) => SEARCHABLE_TYPES.has(field.field_type));
      if (!searchable.length) continue;
      const configuredKeys = Array.isArray(object.config?.searchLayoutFields)
        ? object.config.searchLayoutFields.map(String).slice(0, 8)
        : [];
      const byKey = new Map(readableFields.map((field) => [field.api_name, field]));
      const configuredDisplay = configuredKeys.map((key) => byKey.get(key)).filter(Boolean);
      const fallbackPrimary = chooseLabel(searchable);
      const fallbackSecondary = searchable.find((field) => field !== fallbackPrimary && ["sku", "code", "barcode", "email", "phone"].includes(field.api_name))
        || searchable.find((field) => field !== fallbackPrimary);
      const displayFields = (configuredDisplay.length ? configuredDisplay : [fallbackPrimary, fallbackSecondary].filter(Boolean)).slice(0, 8);
      const labelField = displayFields[0] || fallbackPrimary;
      const secondaryField = displayFields[1] || fallbackSecondary;
      const params = [normalized];
      const terms = searchable.map((field) => `CAST(${platformFieldSql(field, object)} AS TEXT) ILIKE $1`);
      const clauses = [`(${terms.join(" OR ")})`];
      if (object.company_scoped !== false) {
        params.push(req.user.companyId);
        clauses.push(`company_id=$${params.length}`);
      }
      appendSystemReadScope(object, req, clauses, params);
      const order = labelField
        ? `CASE WHEN CAST(${platformFieldSql(labelField, object)} AS TEXT) ILIKE $1 THEN 0
                WHEN CAST(${platformFieldSql(labelField, object)} AS TEXT) ILIKE $1 || '%' THEN 1 ELSE 2 END,
           CAST(${platformFieldSql(labelField, object)} AS TEXT)`
        : "id";
      const columns = [
        `"id"`,
        ...displayFields.map((field, index) => `${platformFieldSql(field, object)} AS "display_${index}"`),
      ];
      const queryResult = await db(
        `SELECT ${columns.join(", ")} FROM "${object.source_table}"
         WHERE ${clauses.join(" AND ")}
         ORDER BY ${order} LIMIT ${Math.min(PER_OBJECT_LIMIT, maxResults - results.length)}`,
        params
      );
      for (const row of queryResult.rows) {
        if (results.length >= maxResults) break;
        results.push({
          objectId: object.id,
          objectApiName: object.object_key,
          objectLabel: object.label,
          recordId: row.id,
          primaryLabel: row.display_0 == null ? String(row.id) : String(row.display_0),
          secondaryLabel: row.display_1 == null ? "" : String(row.display_1),
          displayFields: displayFields.map((field, index) => ({
            key: field.api_name,
            label: field.label || field.api_name,
            value: row[`display_${index}`] == null ? "" : String(row[`display_${index}`]),
          })),
          destination: destinationFor(object, row.id),
        });
      }
    } catch (error) {
      if (error?.status === 403) continue;
      console.error("Platform search object skipped:", object.object_key, error);
    }
  }
  return { query: normalized, results };
}

export { MIN_QUERY_LENGTH, MAX_RESULTS };
