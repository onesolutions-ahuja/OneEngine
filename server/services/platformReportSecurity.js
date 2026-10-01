import { applyFieldSecurity } from "./platformFieldValues.js";
import { loadEffectivePermissionSets, permissionSetAllowsObject, permissionSetAllowsSystemPermission } from "./platformPermissionSets.js";
import { safeSystemFields, systemObject, systemObjectRbacPermission } from "./platformSystemObjects.js";
import { buildPlatformSharingScope } from "./platformSharing.js";
import { isSafeIdentifier } from "./platformMetadata.js";

export async function hasPlatformObjectPermission(db, req, objectId, action) {
  if (!objectId || !req.user?.companyId) return false;
  if (!req.user?.roleId) return false;
  const platformPermission = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='oneengine.manage' LIMIT 1",
    [req.user.roleId]
  );
  if (platformPermission.rows.length) return true;
  const [permissionResult, permissionSets] = await Promise.all([
    db("SELECT can_view, can_create, can_edit, can_delete, can_import, can_export FROM platform_object_permissions WHERE object_id=$1 AND role_id=$2 AND company_id=$3", [objectId, req.user.roleId, req.user.companyId]),
    loadEffectivePermissionSets(db, req.user, req),
  ]);
  if (permissionResult.rows[0]?.[`can_${action}`] === true) return true;
  const objectResult = await db("SELECT object_key,source_table FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [objectId, req.user.companyId]);
  const object = objectResult.rows[0];
  if (permissionSetAllowsObject(permissionSets, object?.object_key, action)) return true;
  const permission = systemObjectRbacPermission(object, action);
  if (!permission) return false;
  if (permissionSetAllowsSystemPermission(permissionSets, permission)) return true;
  const inheritedRoles = await db(
    `WITH RECURSIVE role_tree(id,parent_role_id) AS (
       SELECT id,parent_role_id FROM roles WHERE id=$1 AND (company_id IS NULL OR company_id=$2)
       UNION SELECT parent.id,parent.parent_role_id FROM roles parent JOIN role_tree child ON child.parent_role_id=parent.id
        WHERE parent.company_id=$2 OR parent.company_id IS NULL
     ) SELECT id FROM role_tree`,
    [req.user.roleId, req.user.companyId]
  );
  const roleIds = (inheritedRoles.rows || []).map((row) => row.id);
  if (!roleIds.length) return false;
  const rolePermission = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=ANY($1::uuid[]) AND p.code=$2 LIMIT 1",
    [roleIds, permission]
  );
  return rolePermission.rows.length > 0;
}

export async function preparePlatformReportSecurity({ db, req, object, fields, paramsOffset = null }) {
  if (!await hasPlatformObjectPermission(db, req, object?.id, "view")) {
    throw Object.assign(new Error("You do not have permission to view records for this object"), { status: 403 });
  }
  const securedFields = await applyFieldSecurity(db, fields, req);
  const sharingOffset = paramsOffset ?? (1 + (object?.store_scoped === true ? 1 : 0));
  const sharing = await buildPlatformSharingScope({ db, object, fields: securedFields, req, access: "read", paramsOffset: sharingOffset });
  if (sharing.sql === "FALSE") throw Object.assign(new Error("No records are available to this user"), { status: 403 });
  return { fields: securedFields.filter((field) => field.readable !== false), visibilitySql: sharing.sql, visibilityParams: sharing.params };
}

export async function loadPlatformReportContext(db, req, objectId) {
  const objectResult = await db("SELECT * FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [objectId, req.user.companyId]);
  const object = objectResult.rows[0];
  if (!object) return { object: null, fields: [], relationships: [], visibilitySql: null, visibilityParams: [] };
  if (systemObject(object)) object.company_scoped = true;
  const fieldResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label", [object.id, req.user.companyId]);
  const safeFields = safeSystemFields(object, fieldResult.rows);

  const relationshipResult = await db(`SELECT rel.relationship_key,rel.relationship_type,
      target.id AS target_object_id,target.object_key AS target_object_key,target.source_table AS target_source_table,
      target.company_scoped AS target_company_scoped,target.store_scoped AS target_store_scoped,
      child.source_column AS child_source_column
    FROM platform_relationships rel
    JOIN platform_objects target ON target.id=rel.parent_object_id AND target.active=true
    JOIN platform_fields child ON child.id=rel.child_field_id
    WHERE rel.child_object_id=$1 AND rel.active=true
      AND (target.company_id IS NULL OR target.company_id=$2)`, [object.id, req.user.companyId]);
  const relationships = [];
  for (const relationship of relationshipResult.rows || []) {
    if (!await hasPlatformObjectPermission(db, req, relationship.target_object_id, "view")) continue;
    const relatedFieldsResult = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2) ORDER BY display_order,label", [relationship.target_object_id, req.user.companyId]);
    const relatedFields = await applyFieldSecurity(db, relatedFieldsResult.rows, req);
    const targetObject = {
      id: relationship.target_object_id, object_key: relationship.target_object_key,
      source_table: relationship.target_source_table,
      company_scoped: relationship.target_company_scoped, store_scoped: relationship.target_store_scoped,
    };
    const targetSharing = await buildPlatformSharingScope({ db, object: targetObject, fields: relatedFields, req, access: "read", paramsOffset: 0 });
    if (targetSharing.sql) continue;
    relationships.push({
      ...relationship,
      local_source_column: relationship.child_source_column,
      target_source_column: "id",
      fields: relatedFields.filter((field) => field.readable !== false && field.source_column && isSafeIdentifier(field.source_column)),
    });
  }
  const relatedStoreScopes = relationships.filter((relationship) => relationship.target_store_scoped === true).length;
  const access = await preparePlatformReportSecurity({
    db, req, object, fields: safeFields,
    paramsOffset: 1 + (object.store_scoped === true ? 1 : 0) + relatedStoreScopes,
  });
  return { object, fields: access.fields.filter((field) => field.readable !== false), relationships, visibilitySql: access.visibilitySql, visibilityParams: access.visibilityParams };
}