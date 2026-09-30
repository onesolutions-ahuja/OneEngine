import { loadEffectivePublicGroupIds } from "./platformGroups.js";

const ACCESS_RANK = Object.freeze({ VIEW: 1, EDIT: 2, MANAGE: 3 });
const rowArray = (value) => Array.isArray(value) ? value : [];

export async function loadDashboardPrincipalContext(db, user) {
  const companyId = user?.companyId || user?.company_id;
  const userId = user?.id;
  if (!companyId || !userId) return { companyId: null, userId: null, roleIds: [], groupIds: [] };
  const roleResult = await db(
    `WITH RECURSIVE role_tree(id,parent_role_id) AS (
       SELECT id,parent_role_id FROM roles WHERE id=$1 AND company_id=$2
       UNION
       SELECT parent.id,parent.parent_role_id FROM roles parent
       JOIN role_tree child ON child.parent_role_id=parent.id
       WHERE parent.company_id=$2
     ) SELECT id FROM role_tree`,
    [user.roleId || user.role_id || null, companyId],
  );
  const roleIds = [...new Set((roleResult.rows || []).map((row) => String(row.id)))];
  const groups = await Promise.all(roleIds.map((roleId) =>
    loadEffectivePublicGroupIds(db, { companyId, userId, roleId })
  ));
  return { companyId: String(companyId), userId: String(userId), roleIds, groupIds: [...new Set(groups.flat().map(String))] };
}

export async function resolveDashboardAccess(db, dashboard, user, context = null) {
  const principals = context || await loadDashboardPrincipalContext(db, user);
  if (!dashboard || !principals.companyId || String(dashboard.company_id) !== principals.companyId || dashboard.archived_at) return null;
  let rank = String(dashboard.created_by) === principals.userId ? ACCESS_RANK.MANAGE : 0;
  const roleIds = new Set(principals.roleIds);
  const groupIds = new Set(principals.groupIds);
  for (const entry of rowArray(dashboard.access)) {
    if (!entry || entry.active === false) continue;
    const principalId = String(entry.principal_id || entry.principalId || "");
    const type = String(entry.principal_type || entry.principalType || "").toUpperCase();
    const matches = (type === "USER" && principalId === principals.userId)
      || (type === "ROLE" && roleIds.has(principalId))
      || (type === "PUBLIC_GROUP" && groupIds.has(principalId))
      || (type === "COMPANY" && principalId === principals.companyId);
    if (matches) rank = Math.max(rank, ACCESS_RANK[String(entry.access_level || entry.accessLevel || "VIEW").toUpperCase()] || 0);
  }
  const legacy = await db("SELECT 1 FROM dashboard_users WHERE dashboard_id=$1 AND user_id=$2", [dashboard.id, principals.userId]);
  if (legacy.rows?.length) rank = Math.max(rank, ACCESS_RANK.VIEW);
  return Object.keys(ACCESS_RANK).find((level) => ACCESS_RANK[level] === rank) || null;
}

export async function resolveDefaultDashboard(db, user) {
  const principals = await loadDashboardPrincipalContext(db, user);
  if (!principals.companyId) return null;
  const result = await db("SELECT * FROM dashboards WHERE company_id=$1 AND archived_at IS NULL ORDER BY id", [principals.companyId]);
  const candidates = [];
  for (const dashboard of result.rows || []) {
    const access = await resolveDashboardAccess(db, dashboard, user, principals);
    if (!access) continue;
    for (const assignment of rowArray(dashboard.default_assignments)) {
      if (!assignment || assignment.active === false) continue;
      const type = String(assignment.principal_type || assignment.principalType || "").toUpperCase();
      const principalId = String(assignment.principal_id || assignment.principalId || "");
      const scope = type === "USER" && principalId === principals.userId ? 0
        : (type === "ROLE" && principals.roleIds.includes(principalId)) || (type === "PUBLIC_GROUP" && principals.groupIds.includes(principalId)) ? 1
          : type === "COMPANY" && principalId === principals.companyId ? 2 : -1;
      if (scope < 0) continue;
      candidates.push({ dashboard, scope, priority: Number(assignment.priority) || 0, type, principalId, access });
    }
  }
  candidates.sort((left, right) => left.scope - right.scope
    || (left.scope === 1 ? left.priority - right.priority : 0)
    || left.type.localeCompare(right.type)
    || left.priority - right.priority
    || String(left.dashboard.id).localeCompare(String(right.dashboard.id)));
  return candidates[0] || null;
}

export async function dashboardPrincipalExists(db, companyId, type, id) {
  if (type === "COMPANY") return String(companyId) === String(id);
  const definitions = {
    USER: ["SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=true", [id, companyId]],
    ROLE: ["SELECT id FROM roles WHERE id=$1 AND company_id=$2", [id, companyId]],
    PUBLIC_GROUP: ["SELECT id FROM platform_public_groups WHERE id=$1 AND company_id=$2 AND active=true", [id, companyId]],
  };
  const definition = definitions[type];
  if (!definition) return false;
  const result = await db(...definition);
  return Boolean(result.rows?.length);
}

export function dashboardAccessAtLeast(actual, required) {
  return (ACCESS_RANK[actual] || 0) >= (ACCESS_RANK[required] || Infinity);
}