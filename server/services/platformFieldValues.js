import { toSafeApiName } from "./platformMetadata.js";
import { tenantFields } from "./platformSystemObjects.js";
import { loadEffectivePermissionSets, mergePermissionSetFieldAccess } from "./platformPermissionSets.js";

export function normalizePicklistOptions(options) {
  return (Array.isArray(options) ? options : []).map((option, index) => {
    if (typeof option === "string" || typeof option === "number") {
      return { label: String(option), value: toSafeApiName(option), active: true, displayOrder: index };
    }

    return {
      label: String(option?.label || option?.name || option?.value || ""),
      value: String(option?.value || option?.key || toSafeApiName(option?.label || option?.name || "")),
      active: option?.active !== false,
      displayOrder: Number.isFinite(Number(option?.displayOrder ?? option?.display_order)) ? Number(option.displayOrder ?? option.display_order) : index,
    };
  });

}

export function localPicklistOptions(field) {
  return normalizePicklistOptions(field.options).filter((option) => option.value && option.label);
}

export function fieldValueError(field, value) {
  const type = field.field_type;
  const empty = value === null || value === undefined || value === "";
  if (empty) return field.required ? `${field.label} is required` : null;
  if (["text", "email", "phone", "multiselect"].includes(type) && typeof value !== "string" && !Array.isArray(value)) return `${field.label} must be text`;
  if (["number", "decimal", "currency"].includes(type) && (!((typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value))))) return `${field.label} must be a valid number`;
  if (type === "boolean" && ![true, false, 0, 1, "true", "false", "0", "1"].includes(value)) return `${field.label} must be boolean`;
  if (["date", "datetime"].includes(type) && Number.isNaN(new Date(value).getTime())) return `${field.label} must be a valid ${type}`;
  if (type === "select" || type === "picklist") {
    const options = localPicklistOptions(field);
    const allowed = options.filter((option) => option.active !== false).map((option) => option.value);
    if (allowed.length && !allowed.includes(value)) return `${field.label} must be one of the configured options`;
  }
  if (type === "lookup" && typeof value !== "string" && typeof value !== "number") return `${field.label} must reference a record`;
  return null;
}

export function normalizeFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return null;
  if (field.field_type === "boolean") return value === true || value === 1 || value === "1" || value === "true";
  if (["number", "decimal", "currency"].includes(field.field_type)) return Number(value);
  if (field.field_type === "multiselect" && Array.isArray(value)) return JSON.stringify(value);
  return value;
}

export async function valueSetOptions(db, field, req) {
  const valueSetId = field?.config?.valueSetId || field?.config?.value_set_id;
  if (!valueSetId) return localPicklistOptions(field);
  const result = await db(
    "SELECT v.* FROM platform_value_set_values v JOIN platform_value_sets s ON s.id=v.value_set_id WHERE s.id=$1 AND s.company_id=$2 AND s.active=true ORDER BY v.display_order, v.label",
    [valueSetId, req.user.companyId]
  );
  return result.rows.map((value) => ({
    label: value.label,
    value: value.value,
    active: value.active !== false,
    displayOrder: value.display_order,
  }));
}

export async function enrichFields(db, fields, req) {
  fields = tenantFields(fields, req.user.companyId);
  return Promise.all(fields.map(async (field) => {
    if (!["select", "picklist"].includes(field.field_type)) return field;
    return { ...field, options: await valueSetOptions(db, field, req) };
  }));
}

export async function applyFieldSecurity(db, fields, req) {
  fields = tenantFields(fields, req.user.companyId);
  if (!req.user?.companyId || !fields.length) return fields;
  try {
    const result = req.user.roleId
      ? await db(
        "SELECT field_id,readable,writable FROM platform_field_security WHERE role_id=$1 AND company_id=$2 AND field_id=ANY($3::uuid[])",
        [req.user.roleId, req.user.companyId, fields.map((field) => field.id)]
      )
      : { rows: [] };
    const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
    const hasPortableFieldGrants = permissionSets.some((set) =>
      Object.keys(set.field_permissions || {}).some((key) => key.includes("."))
    );
    const objectKeyById = new Map();
    if (hasPortableFieldGrants) {
      const objectIds = [...new Set(fields.map((field) => field.object_id).filter(Boolean))];
      if (objectIds.length) {
        const objects = await db(
          "SELECT id,object_key FROM platform_objects WHERE id=ANY($1::uuid[]) AND (company_id IS NULL OR company_id=$2)",
          [objectIds, req.user.companyId]
        );
        for (const object of objects.rows) objectKeyById.set(String(object.id), object.object_key);
      }
    }
    const accessByField = new Map(result.rows.map((row) => [String(row.field_id), row]));
    return fields.map((field) => {
      const access = accessByField.get(String(field.id));
      const roleAccess = access ? { readable: access.readable, writable: access.writable } : field;
      const merged = mergePermissionSetFieldAccess(permissionSets, {
        fieldId: field.id,
        objectKey: objectKeyById.get(String(field.object_id)),
        apiName: field.api_name,
        readable: roleAccess.readable,
        writable: roleAccess.writable,
      });
      return {
        ...field,
        ...(access ? roleAccess : {}),
        ...(merged.readable === undefined ? {} : { readable: merged.readable }),
        ...(merged.writable === undefined ? {} : { writable: merged.writable }),
      };
    });
  } catch (error) {
    // Access checks fail closed, including non-PostgreSQL connection errors.
    throw error;
  }
}

export async function resolveEffectiveFieldSecurity(db, field, req) {
  const secured = req.user?.roleId
    ? await db(
      "SELECT readable,writable FROM platform_field_security WHERE field_id=$1 AND role_id=$2 AND company_id=$3",
      [field.id, req.user.roleId, req.user.companyId]
    )
    : { rows: [] };
  const permissionSets = await loadEffectivePermissionSets(db, req.user, req);
  const override = secured.rows[0];
  const base = {
    readable: override ? override.readable === true : field.readable !== false,
    writable: override ? override.writable === true : field.writable === true,
  };
  const effective = mergePermissionSetFieldAccess(permissionSets, {
    fieldId: field.id,
    objectKey: field.object_key,
    apiName: field.api_name,
    ...base,
  });
  return {
    fieldId: field.id,
    roleId: req.user?.roleId || null,
    permissionSetIds: permissionSets.map((set) => set.id),
    ...effective,
    source: permissionSets.length ? (override ? "role_and_permission_sets" : "permission_sets") : override ? "role_override" : "field_default",
  };
}
