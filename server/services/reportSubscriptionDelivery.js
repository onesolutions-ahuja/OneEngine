import { loadEffectivePublicGroupIds } from "./platformGroups.js";

const uniqueUsers = (rows = []) => [...new Map(rows.map((row) => [String(row.id), row])).values()];

export async function loadReportSubscriptionExecutionUser(db, { companyId, ownerUserId, runAsUserId = null } = {}) {
  const userId = runAsUserId || ownerUserId;
  if (!companyId || !userId) throw new Error("Report subscription execution user is required");
  const result = await db(
    `SELECT u.id,u.company_id,u.role_id,u.username,u.full_name,u.email,u.active
       FROM users u
      WHERE u.id=$1 AND u.company_id=$2 AND u.active=TRUE
      LIMIT 1`,
    [userId, companyId]
  );
  const user = result.rows?.[0];
  if (!user) throw new Error("Report subscription running user is unavailable");
  return user;
}

export async function resolveReportSubscriptionRecipients(db, { companyId, principals = [] } = {}) {
  if (!companyId) throw new Error("Report subscription company is required");
  const users = new Set();
  const roles = new Set();
  const groups = new Set();
  for (const principal of Array.isArray(principals) ? principals : []) {
    const type = String(principal?.principalType || principal?.principal_type || "").toUpperCase();
    const id = String(principal?.principalId || principal?.principal_id || "").trim();
    if (!id) continue;
    if (type === "USER") users.add(id);
    else if (type === "ROLE") roles.add(id);
    else if (type === "PUBLIC_GROUP") groups.add(id);
  }

  const direct = await db(
    `SELECT u.id,u.company_id,u.role_id,u.username,u.full_name,u.email,u.active
       FROM users u
      WHERE u.company_id=$1 AND u.active=TRUE
        AND (u.id=ANY($2::uuid[]) OR u.role_id=ANY($3::uuid[]))
      ORDER BY u.id`,
    [companyId, [...users], [...roles]]
  );
  const resolved = [...(direct.rows || [])];

  if (groups.size) {
    const candidates = await db(
      `SELECT u.id,u.company_id,u.role_id,u.username,u.full_name,u.email,u.active
         FROM users u
        WHERE u.company_id=$1 AND u.active=TRUE
        ORDER BY u.id`,
      [companyId]
    );
    for (const user of candidates.rows || []) {
      const effective = await loadEffectivePublicGroupIds(db, {
        companyId,
        userId: user.id,
        roleId: user.role_id,
      });
      if (effective.some((groupId) => groups.has(String(groupId)))) resolved.push(user);
    }
  }

  return uniqueUsers(resolved);
}

export async function filterReportSubscriptionRecipientsByAccess(users = [], canAccessReport) {
  if (typeof canAccessReport !== "function") throw new Error("Report access resolver is required");
  const allowed = [];
  for (const user of users) if (await canAccessReport(user)) allowed.push(user);
  return allowed;
}
