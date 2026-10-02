import { loadDashboardPrincipalContext } from "./dashboardSecurity.js";

/** Resolve ROLE / PUBLIC_GROUP / COMPANY / USER access exactly like dashboards. */
export async function resolveAnalyticsPrincipalAccess(db, access = [], ownerId, user, minimum = "VIEW") {
  const rank = { VIEW: 1, EDIT: 2, MANAGE: 3 };
  const context = await loadDashboardPrincipalContext(db, user);
  if (!context.companyId || !context.userId) return false;
  let best = String(ownerId) === context.userId ? rank.MANAGE : 0;
  const roles = new Set(context.roleIds || []);
  const groups = new Set(context.groupIds || []);
  for (const entry of Array.isArray(access) ? access : []) {
    if (!entry || entry.active === false) continue;
    const type = String(entry.principalType || entry.principal_type || "").toUpperCase();
    const id = String(entry.principalId || entry.principal_id || "");
    const level = String(entry.accessLevel || entry.access_level || "VIEW").toUpperCase();
    const matches =
      (type === "USER" && id === context.userId) ||
      (type === "ROLE" && roles.has(id)) ||
      (type === "PUBLIC_GROUP" && groups.has(id)) ||
      (type === "COMPANY" && id === context.companyId);
    if (matches) best = Math.max(best, rank[level] || 0);
  }
  return best >= (rank[String(minimum).toUpperCase()] || 99);
}

export async function resolveDashboardExecutionUser(db, dashboard, requestUser) {
  if (String(dashboard?.run_as_mode || "VIEWER").toUpperCase() !== "FIXED_USER") return requestUser;
  const runAsUserId = dashboard?.run_as_user_id;
  if (!runAsUserId) throw new Error("Dashboard fixed-user execution is not configured");
  const result = await db(
    `SELECT u.id,u.company_id,u.role_id,u.username,u.full_name,u.active
     FROM users u WHERE u.id=$1 AND u.company_id=$2 AND u.active=TRUE`,
    [runAsUserId, requestUser.companyId],
  );
  const row = result.rows?.[0];
  if (!row) throw new Error("Dashboard run-as user is unavailable");
  return {
    ...requestUser,
    id: row.id,
    companyId: row.company_id,
    roleId: row.role_id,
    username: row.username,
    full_name: row.full_name,
    storeId: requestUser.storeId,
  };
}
