const ACTION_KEYS = Object.freeze({
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  import: "can_import",
  export: "can_export",
});

const requestCache = new WeakMap();

export async function loadEffectivePermissionSets(db, { id, companyId } = {}, request = null) {
  if (!id || !companyId) return [];
  if (request && requestCache.has(request)) return requestCache.get(request);
  const loading = load();
  if (request) requestCache.set(request, loading);
  return loading;

  async function load() {
  const result = await db(
    `SELECT DISTINCT ps.id, ps.name, ps.api_key, ps.system_permissions,
            ps.object_permissions, ps.field_permissions, ps.source_package_id,
            ps.package_required,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'api_key',g.api_key) ORDER BY g.name)
                FROM platform_permission_set_group_members gm
                JOIN platform_permission_set_groups g ON g.id=gm.group_id AND g.company_id=$2 AND g.active=true
                JOIN platform_permission_set_group_assignments ga ON ga.group_id=g.id AND ga.company_id=$2 AND ga.user_id=$1 AND ga.active=true
               WHERE gm.permission_set_id=ps.id AND gm.company_id=$2
                 AND (ga.effective_from IS NULL OR ga.effective_from <= NOW())
                 AND (ga.effective_until IS NULL OR ga.effective_until > NOW())
            ), '[]'::jsonb) AS permission_set_groups
       FROM platform_permission_sets ps
      WHERE ps.company_id=$2 AND ps.active=true
        AND (ps.package_required=false OR EXISTS (
          SELECT 1 FROM company_package_installations i
           WHERE i.company_id=$2 AND i.package_id=ps.source_package_id
             AND i.status='active' AND i.suspended_by_entitlement=false AND i.deactivated_by_user=false
        ))
        AND (
          EXISTS (
            SELECT 1 FROM platform_permission_set_assignments a
             WHERE a.permission_set_id=ps.id AND a.user_id=$1 AND a.company_id=$2
               AND a.active=true
               AND (a.effective_from IS NULL OR a.effective_from <= NOW())
               AND (a.effective_until IS NULL OR a.effective_until > NOW())
          )
          OR EXISTS (
            SELECT 1
              FROM platform_permission_set_group_members m
              JOIN platform_permission_set_groups g
                ON g.id=m.group_id AND g.company_id=$2 AND g.active=true
              JOIN platform_permission_set_group_assignments a
                ON a.group_id=g.id AND a.company_id=$2 AND a.user_id=$1 AND a.active=true
             WHERE m.permission_set_id=ps.id AND m.company_id=$2
               AND (a.effective_from IS NULL OR a.effective_from <= NOW())
               AND (a.effective_until IS NULL OR a.effective_until > NOW())
          )
        )
      ORDER BY ps.api_key`,
    [id, companyId]
  );
  return result.rows;
  }
}

export function permissionSetAllowsSystemPermission(permissionSets, permissionCode) {
  return permissionSets.some((set) =>
    Array.isArray(set.system_permissions) && set.system_permissions.includes(permissionCode)
  );
}

export function permissionSetAllowsObject(permissionSets, objectKey, action) {
  const actionKey = ACTION_KEYS[action];
  if (!actionKey || !objectKey) return false;
  return permissionSets.some((set) => set.object_permissions?.[objectKey]?.[actionKey] === true);
}

export function mergePermissionSetFieldAccess(permissionSets, {
  objectKey,
  fieldId,
  apiName,
  readable,
  writable,
} = {}) {
  let setReadable = false;
  let setWritable = false;
  for (const set of permissionSets) {
    const access = set.field_permissions?.[fieldId]
      || set.field_permissions?.[`${objectKey}.${apiName}`];
    if (access?.readable === true || access?.writable === true) setReadable = true;
    if (access?.writable === true) setWritable = true;
  }
  return {
    readable: setReadable ? true : readable,
    writable: setWritable ? true : writable,
  };
}