import { loadEffectivePublicGroupIds, loadEffectiveQueueIds } from "./platformGroups.js";

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const COMPARISONS = new Map([
  ["equals", "="], ["not_equals", "<>"], ["greater_than", ">"],
  ["greater_than_or_equal", ">="], ["less_than", "<"], ["less_than_or_equal", "<="],
]);

function criteriaExpression(criteria, fields, recordName, params, offset) {
  if (!criteria || !Array.isArray(criteria.conditions) || !criteria.conditions.length || criteria.conditions.length > 20) return null;
  const expressions = [];
  for (const condition of criteria.conditions) {
    const field = fields.find((item) => item.active !== false && item.api_name === condition.field && SAFE_IDENTIFIER.test(item.source_column || ""));
    if (!field) return null;
    const column = `${recordName}."${field.source_column}"`;
    if (condition.operator === "is_empty") expressions.push(`(${column} IS NULL OR ${column}='')`);
    else if (condition.operator === "is_not_empty") expressions.push(`(${column} IS NOT NULL AND ${column}<>'')`);
    else {
      const operator = COMPARISONS.get(condition.operator);
      if (!operator || condition.value === undefined || condition.value === null || typeof condition.value === "object") return null;
      params.push(condition.value);
      expressions.push(`${column}${operator}$${offset + params.length}`);
    }
  }
  return `(${expressions.join(criteria.match === "any" ? " OR " : " AND ")})`;
}

export async function buildPlatformSharingScope({ db, object, fields = [], req, access = "read", paramsOffset = 0 } = {}) {
  if (!db || !object || !req?.user?.companyId) return { sql: null, params: [] };

  try {
    const settingsResult = await db(
      "SELECT * FROM platform_object_sharing_settings WHERE object_id=$1 AND company_id=$2",
      [object.id, req.user.companyId]
    );
    const settings = settingsResult.rows[0];
    if (!settings) return { sql: null, params: [] };
    const defaultAccess = settings.default_access || "read_write";
    if (access === "read" && defaultAccess !== "private") return { sql: null, params: [] };
    if (access === "write" && defaultAccess === "read_write") return { sql: null, params: [] };

    const recordName = `"${object.source_table}"`;
    const params = [];
    const expressions = [];
    const bind = (value) => {
      params.push(value);
      return `$${paramsOffset + params.length}`;
    };
    const ownerField = fields.find((field) => field.api_name === settings.owner_field_api_name && SAFE_IDENTIFIER.test(field.source_column || ""));
    const ownerColumn = ownerField ? `${recordName}."${ownerField.source_column}"` : null;
    if (ownerColumn && req.user.id) {
      expressions.push(`${ownerColumn}=${bind(req.user.id)}`);
      if (settings.hierarchy_grants_access && req.user.roleId) {
        const company = bind(req.user.companyId);
        const role = bind(req.user.roleId);
        expressions.push(`EXISTS (
          SELECT 1 FROM users owner_user
           WHERE owner_user.id=${ownerColumn} AND owner_user.company_id=${company}
             AND owner_user.role_id IN (
               WITH RECURSIVE role_tree(id) AS (
                 SELECT id FROM roles WHERE id=${role} AND company_id=${company}
                 UNION SELECT child.id FROM roles child JOIN role_tree parent ON child.parent_role_id=parent.id WHERE child.company_id=${company}
               ) SELECT id FROM role_tree
             )
        )`);
      }
    }

    const roleResult = await db(`WITH RECURSIVE role_tree(id,parent_role_id) AS (
      SELECT id,parent_role_id FROM roles WHERE id=$1 AND company_id=$2
      UNION SELECT parent.id,parent.parent_role_id FROM roles parent JOIN role_tree child ON child.parent_role_id=parent.id WHERE parent.company_id=$2
    ) SELECT id FROM role_tree`, [req.user.roleId || null, req.user.companyId]);
    const roleIds = [...new Set((roleResult.rows || []).map((row) => String(row.id)))];
    const queueResults = await Promise.all(roleIds.map((roleId) => loadEffectiveQueueIds(db, {
      companyId: req.user.companyId, userId: req.user.id, roleId,
    })));
    const queueIds = [...new Set(queueResults.flat().map(String))];
    if (queueIds.length) {
      const objectId = bind(object.id);
      const companyId = bind(req.user.companyId);
      const queues = bind(queueIds);
      const claimed = access === "write" ? ` AND qr.claimed_by=${bind(req.user.id)}` : "";
      expressions.push(`EXISTS (
        SELECT 1 FROM platform_queue_records qr
         WHERE qr.object_id=${objectId} AND qr.record_id=${recordName}.id
           AND qr.company_id=${companyId} AND qr.active=true AND qr.queue_id=ANY(${queues}::uuid[])${claimed}
      )`);
    }

    const rulesResult = await db(
      "SELECT * FROM platform_sharing_rules WHERE object_id=$1 AND company_id=$2 AND active=true ORDER BY execution_order,id",
      [object.id, req.user.companyId]
    );
    const groupResults = await Promise.all(roleIds.map((roleId) => loadEffectivePublicGroupIds(db, {
      companyId: req.user.companyId, userId: req.user.id, roleId,
    })));
    const groupIds = [...new Set(groupResults.flat().map(String))];
    for (const rule of rulesResult.rows) {
      if (access === "write" && rule.access_level !== "READ_WRITE") continue;
      let target = null;
      if (rule.target_type === "USER" && String(rule.target_id) === String(req.user.id)) target = "TRUE";
      if (rule.target_type === "ROLE" && roleIds.includes(String(rule.target_id))) target = "TRUE";
      if (rule.target_type === "GROUP" && groupIds.includes(String(rule.target_id))) target = "TRUE";
      if (rule.target_type === "QUEUE" && queueIds.includes(String(rule.target_id))) target = "TRUE";
      if (!target) continue;

      const ruleParts = [target];
      if (rule.rule_type === "owner" && rule.source_owner_type !== "ANY") {
        if (!ownerColumn) continue;
        if (rule.source_owner_type === "USER") ruleParts.push(`${ownerColumn}=${bind(rule.source_owner_id)}`);
        else if (rule.source_owner_type === "ROLE") {
          ruleParts.push(`EXISTS (SELECT 1 FROM users sharing_owner WHERE sharing_owner.id=${ownerColumn} AND sharing_owner.company_id=${bind(req.user.companyId)} AND sharing_owner.role_id=${bind(rule.source_role_id || rule.source_owner_id)})`);
        } else if (rule.source_owner_type === "QUEUE") {
          ruleParts.push(`EXISTS (SELECT 1 FROM platform_queue_records source_queue WHERE source_queue.object_id=${bind(object.id)} AND source_queue.record_id=${recordName}.id AND source_queue.company_id=${bind(req.user.companyId)} AND source_queue.queue_id=${bind(rule.source_owner_id)} AND source_queue.active=true)`);
        } else continue;
      } else if (rule.rule_type === "criteria") {
        const criteria = criteriaExpression(rule.criteria, fields, recordName, params, paramsOffset);
        if (!criteria) continue;
        ruleParts.push(criteria);
      }
      expressions.push(`EXISTS (SELECT 1 FROM platform_sharing_rules active_rule WHERE active_rule.id=${bind(rule.id)} AND ${ruleParts.join(" AND ")})`);
    }

    return { sql: expressions.length ? `(${expressions.join(" OR ")})` : "FALSE", params };
  } catch (error) { throw error; }
}