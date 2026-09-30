import { evaluateCondition } from "./platformConditions.js";

function normalizeMatch(value) {
  return Array.isArray(value) ? value : [value];
}

export async function evaluateAssignmentRules({ db, companyId, objectId, record = {}, fields = [], defaultAssigneeId = null, excludeAssigneeId = null } = {}) {
  if (!db || !companyId || !objectId) return { ruleId: null, assigneeId: defaultAssigneeId || null, assignmentField: "assigned_to", fallback: Boolean(defaultAssigneeId) };

  const rulesResult = await db(
    `SELECT * FROM platform_assignment_rules WHERE object_id=$1 AND company_id=$2 AND active=true`,
    [objectId, companyId]
  );
  const rules = Array.isArray(rulesResult?.rows) ? [...rulesResult.rows].sort((left, right) => {
    const leftPriority = Number(left.priority ?? 0);
    const rightPriority = Number(right.priority ?? 0);
    if (rightPriority !== leftPriority) return rightPriority - leftPriority;
    return String(right.created_at || "").localeCompare(String(left.created_at || ""));
  }) : [];
  const userResult = await db(
    `SELECT id, company_id, role_id, active FROM users WHERE company_id=$1 AND active=true`,
    [companyId]
  );
  const users = Array.isArray(userResult?.rows) ? userResult.rows : [];

  for (const rule of rules) {
    if (!rule || rule.active === false || !rule.conditions) continue;
    if (!evaluateCondition(rule.conditions, fields, record)) continue;

    const targetType = String(rule.target_type || "USER").toUpperCase();
    let assigneeId = null;

    if (targetType === "USER") assigneeId = rule.target_id;
    else if (targetType === "ROLE") {
      const matched = users.find((user) => String(user.role_id) === String(rule.target_id) && String(user.company_id) === String(companyId));
      assigneeId = matched ? matched.id : null;
    } else if (targetType === "QUEUE") {
      const queueMembersResult = await db(
        `SELECT member_id, member_type FROM platform_queue_members WHERE queue_id=$1 AND company_id=$2 AND active=true`,
        [rule.target_id, companyId]
      );
      const members = Array.isArray(queueMembersResult?.rows) ? queueMembersResult.rows : [];
      const candidate = members.find((member) => member.member_type === "USER");
      assigneeId = candidate ? candidate.member_id : null;
    }

    if (!assigneeId) continue;
    if (excludeAssigneeId && String(assigneeId) === String(excludeAssigneeId)) continue;

    return {
      ruleId: rule.id,
      assigneeId,
      assignmentField: rule.assignment_field || "assigned_to",
      targetType,
      fallback: false,
    };
  }

  return {
    ruleId: null,
    assigneeId: defaultAssigneeId || null,
    assignmentField: "assigned_to",
    fallback: Boolean(defaultAssigneeId),
  };
}

export function buildAssignmentRulePayload(rule = {}) {
  return {
    id: rule.id || null,
    objectId: rule.object_id || rule.objectId || null,
    companyId: rule.company_id || rule.companyId || null,
    ruleKey: rule.rule_key || rule.ruleKey || null,
    name: rule.name || "Assignment rule",
    priority: Number(rule.priority ?? 0),
    targetType: String(rule.target_type || "USER").toUpperCase(),
    targetId: rule.target_id || rule.targetId || null,
    assignmentField: rule.assignment_field || rule.assignmentField || "assigned_to",
    conditions: rule.conditions || { match: "all", conditions: [] },
    active: rule.active !== false,
  };
}

export function resolveAssignmentTargets(rule, members = []) {
  const targetType = String(rule?.target_type || "USER").toUpperCase();
  const candidateIds = normalizeMatch(rule?.target_id || rule?.targetId || []).filter(Boolean);
  if (targetType === "USER") return candidateIds;
  if (targetType === "ROLE") return members.filter((member) => member.member_type === "ROLE" && candidateIds.includes(String(member.member_id))).map((member) => member.member_id);
  if (targetType === "QUEUE") return members.filter((member) => member.member_type === "USER" && candidateIds.includes(String(member.queue_id))).map((member) => member.member_id);
  return [];
}
