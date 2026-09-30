export function publicGroupMembershipWouldCycle(edges, parentGroupId, childGroupId) {
  const target = String(parentGroupId);
  const start = String(childGroupId);
  if (target === start) return true;
  const childrenByParent = new Map();
  for (const edge of edges) {
    if (String(edge.member_type).toUpperCase() !== "GROUP") continue;
    const parent = String(edge.group_id);
    childrenByParent.set(parent, [...(childrenByParent.get(parent) || []), String(edge.member_id)]);
  }
  const pending = [start];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(childrenByParent.get(current) || []));
  }
  return false;
}

export async function loadEffectivePublicGroupIds(db, { companyId, userId, roleId } = {}) {
  if (!companyId || (!userId && !roleId)) return [];
  const result = await db(
    `WITH RECURSIVE memberships(group_id) AS (
       SELECT m.group_id
         FROM platform_public_group_members m
         JOIN platform_public_groups g ON g.id=m.group_id AND g.company_id=$1 AND g.active=true
        WHERE m.company_id=$1
          AND ((m.member_type='USER' AND m.member_id=$2)
            OR (m.member_type='ROLE' AND m.member_id=$3))
       UNION
       SELECT m.group_id
         FROM platform_public_group_members m
         JOIN memberships nested ON m.member_type='GROUP' AND m.member_id=nested.group_id
         JOIN platform_public_groups g ON g.id=m.group_id AND g.company_id=$1 AND g.active=true
        WHERE m.company_id=$1
     )
     SELECT DISTINCT group_id FROM memberships`,
    [companyId, userId || null, roleId || null]
  );
  return result.rows.map((row) => String(row.group_id));
}

export async function loadEffectiveQueueIds(db, { companyId, userId, roleId } = {}) {
  if (!companyId || (!userId && !roleId)) return [];
  const groupIds = await loadEffectivePublicGroupIds(db, { companyId, userId, roleId });
  const result = await db(
    `SELECT DISTINCT m.queue_id
       FROM platform_queue_members m
       JOIN platform_queues q ON q.id=m.queue_id AND q.company_id=$1 AND q.active=true
      WHERE m.company_id=$1 AND (
        (m.member_type='USER' AND m.member_id=$2)
        OR (m.member_type='ROLE' AND m.member_id=$3)
        OR (m.member_type='GROUP' AND m.member_id=ANY($4::uuid[]))
      )`,
    [companyId, userId || null, roleId || null, groupIds]
  );
  return result.rows.map((row) => String(row.queue_id));
}