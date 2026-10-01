import express from "express";
import { isSafeIdentifier, toSafeApiName } from "../services/platformMetadata.js";
import { loadEffectivePublicGroupIds, publicGroupMembershipWouldCycle } from "../services/platformGroups.js";
import { validateConditionConfig } from "../services/platformConditions.js";

const MEMBER_TYPES = new Set(["USER", "ROLE", "GROUP"]);

export default function createPlatformSecurityRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  async function hasOneEngineManageAccess(userId) {
    const result = await db(
      `SELECT 1
         FROM users u
         JOIN role_permissions rp ON rp.role_id=u.role_id
         JOIN permissions p ON p.id=rp.permission_id
        WHERE u.id=$1 AND u.active=true AND p.code='oneengine.manage'
        LIMIT 1`,
      [userId]
    );
    return result.rows.length > 0;
  }

  async function resolveCompany(req, res, next) {
    try {
      const canManageOneEngine = await hasOneEngineManageAccess(req.user?.id);

      if (!canManageOneEngine) {
        if (req.headers["x-acting-company-id"]) return res.status(403).json({ success: false, message: "Tenant users cannot switch company context" });
        req.securityCompanyId = req.user.companyId;
        return next();
      }

      const companyId = req.headers["x-acting-company-id"] || req.user?.companyId;
      if (!companyId) return res.status(409).json({ success: false, code: "ACTING_COMPANY_REQUIRED", message: "Select a company" });

      const result = await db(
        "SELECT id FROM companies WHERE id=$1 AND active=true LIMIT 1",
        [companyId]
      );

      if (!result.rows.length) return res.status(403).json({ success: false, message: "You are not authorised for the selected company" });
      req.securityCompanyId = result.rows[0].id;
      return next();
    } catch (error) { next(error); }
  }

  function authorizeManage(req, res, next) {
    return authorize("oneengine.manage")(req, res, next);
  }

  const manage = [authenticate, resolveCompany, authorizeManage];
  const handle = (handler) => async (req, res, next) => {
    try { await handler(req, res, next); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      if (error.code === "23505") return res.status(409).json({ success: false, message: "A record with this API key already exists" });
      console.error("Platform security API error:", error);
      res.status(500).json({ success: false, message: "Unable to update Platform security metadata" });
    }
  };

  router.get("/platform/security/principals", ...manage, handle(async (req, res) => {
    const [users, roles, groups] = await Promise.all([
      db("SELECT id,username FROM users WHERE company_id=$1 AND active=true ORDER BY username", [req.securityCompanyId]),
      db("SELECT id,name,parent_role_id FROM roles WHERE company_id=$1 ORDER BY name", [req.securityCompanyId]),
      db("SELECT id,name,api_key FROM platform_public_groups WHERE company_id=$1 AND active=true ORDER BY name", [req.securityCompanyId]),
    ]);
    res.json({ success: true, data: { users: users.rows, roles: roles.rows, groups: groups.rows } });
  }));

  async function principalExists(companyId, type, id) {
    if (!MEMBER_TYPES.has(type) || typeof id !== "string" || !id) return false;
    const table = type === "USER" ? "users" : type === "ROLE" ? "roles" : "platform_public_groups";
    const activeClause = type === "USER" || type === "GROUP" ? " AND active=true" : "";
    const result = await db(`SELECT id FROM ${table} WHERE id=$1 AND company_id=$2${activeClause}`, [id, companyId]);
    return result.rows.length > 0;
  }

  async function supportedObjects(companyId, value) {
    if (!Array.isArray(value) || value.length > 100 || value.some((key) => !isSafeIdentifier(key))) return null;
    const keys = [...new Set(value)];
    if (!keys.length) return [];
    const result = await db("SELECT object_key FROM platform_objects WHERE object_key=ANY($1::text[]) AND active=true AND (company_id IS NULL OR company_id=$2)", [keys, companyId]);
    return result.rows.length === keys.length ? keys : null;
  }

  async function getSharingObject(objectId, companyId) {
    const result = await db("SELECT * FROM platform_objects WHERE id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [objectId, companyId]);
    return result.rows[0] || null;
  }

  async function validMappedOwnerField(objectId, companyId, apiName) {
    if (!apiName) return true;
    if (!isSafeIdentifier(apiName)) return false;
    const result = await db(
      `SELECT 1 FROM platform_fields WHERE object_id=$1 AND api_name=$2 AND active=true
        AND source_column IS NOT NULL AND (company_id IS NULL OR company_id=$3) LIMIT 1`,
      [objectId, apiName, companyId]
    );
    return result.rows.length > 0;
  }

  async function sharingPrincipalExists(companyId, type, id) {
    if (type === "USER" || type === "ROLE" || type === "GROUP") return principalExists(companyId, type, id);
    if (type !== "QUEUE" || typeof id !== "string" || !id) return false;
    const result = await db("SELECT id FROM platform_queues WHERE id=$1 AND company_id=$2 AND active=true", [id, companyId]);
    return result.rows.length > 0;
  }

  async function prepareSharingRule(body, object, companyId) {
    const name = String(body?.name || "").trim();
    const ruleKey = body?.ruleKey || toSafeApiName(name, "sharing_rule");
    const ruleType = String(body?.ruleType || "").toLowerCase();
    const targetType = String(body?.targetType || "").toUpperCase();
    const accessLevel = String(body?.accessLevel || "").toUpperCase();
    if (!name || !isSafeIdentifier(ruleKey) || !["owner", "criteria"].includes(ruleType)
      || !["USER", "ROLE", "GROUP", "QUEUE"].includes(targetType)
      || !["READ", "READ_WRITE"].includes(accessLevel)
      || typeof body.active !== "boolean") return null;
    if (!await sharingPrincipalExists(companyId, targetType, body.targetId)) return null;
    let sourceOwnerType = "ANY";
    let sourceOwnerId = null;
    let sourceRoleId = null;
    let criteria = {};
    if (ruleType === "owner") {
      sourceOwnerType = String(body.sourceOwnerType || "ANY").toUpperCase();
      sourceOwnerId = body.sourceOwnerId || null;
      if (!["ANY", "USER", "ROLE", "GROUP", "QUEUE"].includes(sourceOwnerType)) return null;
      if (sourceOwnerType !== "ANY" && !await sharingPrincipalExists(companyId, sourceOwnerType, sourceOwnerId)) return null;
      if (sourceOwnerType === "ROLE") sourceRoleId = sourceOwnerId;
    } else {
      criteria = body.criteria;
      const fields = await db("SELECT * FROM platform_fields WHERE object_id=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [object.id, companyId]);
      try { validateConditionConfig(criteria, fields.rows, "Sharing criteria"); }
      catch { return null; }
      const safeFieldNames = new Set(fields.rows.filter((field) => isSafeIdentifier(field.source_column || "")).map((field) => field.api_name));
      if (criteria.conditions.some((condition) => !safeFieldNames.has(condition.field)
        || !["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty"].includes(condition.operator))) return null;
    }
    return { name, ruleKey, ruleType, sourceOwnerType, sourceOwnerId, sourceRoleId, criteria, targetType, targetId: body.targetId, accessLevel, active: body.active };
  }

  router.get("/platform/security/objects/:objectId/sharing-settings", ...manage, handle(async (req, res) => {
    const object = await getSharingObject(req.params.objectId, req.securityCompanyId);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const result = await db("SELECT * FROM platform_object_sharing_settings WHERE object_id=$1 AND company_id=$2", [object.id, req.securityCompanyId]);
    res.json({ success: true, data: result.rows[0] || { object_id: object.id, company_id: req.securityCompanyId, default_access: "read_write", owner_field_api_name: null, owner_type_field_api_name: null, hierarchy_grants_access: false } });
  }));

  router.put("/platform/security/objects/:objectId/sharing-settings", ...manage, handle(async (req, res) => {
    const object = await getSharingObject(req.params.objectId, req.securityCompanyId);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const existing = await db("SELECT * FROM platform_object_sharing_settings WHERE object_id=$1 AND company_id=$2", [object.id, req.securityCompanyId]);
    const current = existing.rows[0] || {};
    const defaultAccess = req.body.defaultAccess ?? current.default_access ?? "read_write";
    const ownerField = req.body.ownerFieldApiName === undefined ? current.owner_field_api_name || null : req.body.ownerFieldApiName || null;
    const ownerTypeField = req.body.ownerTypeFieldApiName === undefined ? current.owner_type_field_api_name || null : req.body.ownerTypeFieldApiName || null;
    const hierarchy = req.body.hierarchyGrantsAccess === undefined ? current.hierarchy_grants_access === true : req.body.hierarchyGrantsAccess;
    if (!["private", "read_only", "read_write"].includes(defaultAccess) || typeof hierarchy !== "boolean"
      || !await validMappedOwnerField(object.id, req.securityCompanyId, ownerField)
      || !await validMappedOwnerField(object.id, req.securityCompanyId, ownerTypeField)) {
      return res.status(400).json({ success: false, message: "Sharing settings or mapped owner fields are invalid" });
    }
    const result = await db(
      `INSERT INTO platform_object_sharing_settings
       (object_id,company_id,default_access,owner_field_api_name,owner_type_field_api_name,hierarchy_grants_access)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (object_id,company_id) DO UPDATE SET default_access=EXCLUDED.default_access,
         owner_field_api_name=EXCLUDED.owner_field_api_name,owner_type_field_api_name=EXCLUDED.owner_type_field_api_name,
         hierarchy_grants_access=EXCLUDED.hierarchy_grants_access,user_modified=true,updated_at=NOW()
       RETURNING *`,
      [object.id, req.securityCompanyId, defaultAccess, ownerField, ownerTypeField, hierarchy]
    );
    res.json({ success: true, data: result.rows[0] });
  }));

  router.get("/platform/security/objects/:objectId/sharing-rules", ...manage, handle(async (req, res) => {
    const object = await getSharingObject(req.params.objectId, req.securityCompanyId);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const result = await db("SELECT * FROM platform_sharing_rules WHERE object_id=$1 AND company_id=$2 ORDER BY execution_order,name", [object.id, req.securityCompanyId]);
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/objects/:objectId/sharing-rules", ...manage, handle(async (req, res) => {
    const object = await getSharingObject(req.params.objectId, req.securityCompanyId);
    if (!object) return res.status(404).json({ success: false, message: "Object not found" });
    const rule = await prepareSharingRule(req.body, object, req.securityCompanyId);
    if (!rule) return res.status(400).json({ success: false, message: "Sharing rule is invalid or references unavailable metadata" });
    const result = await db(
      `INSERT INTO platform_sharing_rules
       (object_id,company_id,name,rule_key,rule_type,source_owner_type,source_owner_id,source_role_id,criteria,target_type,target_id,access_level,active,execution_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING *`,
      [object.id, req.securityCompanyId, rule.name, rule.ruleKey, rule.ruleType, rule.sourceOwnerType,
        rule.sourceOwnerId, rule.sourceRoleId, JSON.stringify(rule.criteria), rule.targetType,
        rule.targetId, rule.accessLevel, rule.active, Number(req.body.executionOrder) || 100]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }));

  router.put("/platform/security/sharing-rules/:ruleId", ...manage, handle(async (req, res) => {
    const existing = await db("SELECT * FROM platform_sharing_rules WHERE id=$1 AND company_id=$2", [req.params.ruleId, req.securityCompanyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Sharing rule not found" });
    const old = existing.rows[0];
    const object = await getSharingObject(old.object_id, req.securityCompanyId);
    const rule = await prepareSharingRule({
      name: req.body.name ?? old.name,
      ruleKey: req.body.ruleKey ?? old.rule_key,
      ruleType: req.body.ruleType ?? old.rule_type,
      sourceOwnerType: req.body.sourceOwnerType ?? old.source_owner_type,
      sourceOwnerId: req.body.sourceOwnerId ?? old.source_owner_id,
      criteria: req.body.criteria ?? old.criteria,
      targetType: req.body.targetType ?? old.target_type,
      targetId: req.body.targetId ?? old.target_id,
      accessLevel: req.body.accessLevel ?? old.access_level,
      active: req.body.active ?? old.active,
    }, object, req.securityCompanyId);
    if (!rule) return res.status(400).json({ success: false, message: "Sharing rule is invalid or references unavailable metadata" });
    const result = await db(
      `UPDATE platform_sharing_rules SET name=$1,rule_key=$2,rule_type=$3,source_owner_type=$4,source_owner_id=$5,
         source_role_id=$6,criteria=$7::jsonb,target_type=$8,target_id=$9,access_level=$10,active=$11,
         execution_order=$12,user_modified=true,updated_at=NOW() WHERE id=$13 AND company_id=$14 RETURNING *`,
      [rule.name, rule.ruleKey, rule.ruleType, rule.sourceOwnerType, rule.sourceOwnerId, rule.sourceRoleId,
        JSON.stringify(rule.criteria), rule.targetType, rule.targetId, rule.accessLevel, rule.active,
        Number(req.body.executionOrder ?? old.execution_order) || 100, old.id, req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows[0] });
  }));

  router.delete("/platform/security/sharing-rules/:ruleId", ...manage, handle(async (req, res) => {
    const result = await db("UPDATE platform_sharing_rules SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id", [req.params.ruleId, req.securityCompanyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Sharing rule not found" });
    res.json({ success: true });
  }));

  router.get("/platform/security/public-groups", ...manage, handle(async (req, res) => {
    const result = await db(
      `SELECT g.*,COUNT(m.id)::int AS member_count
         FROM platform_public_groups g LEFT JOIN platform_public_group_members m
           ON m.group_id=g.id AND m.company_id=g.company_id
        WHERE g.company_id=$1 GROUP BY g.id ORDER BY g.name`,
      [req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/public-groups", ...manage, handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const apiKey = req.body?.apiKey || toSafeApiName(name, "public_group");
    if (!name || !isSafeIdentifier(apiKey)) return res.status(400).json({ success: false, message: "Group name and valid API key are required" });
    const result = await db(
      "INSERT INTO platform_public_groups (company_id,name,api_key,description,active) VALUES ($1,$2,$3,$4,true) RETURNING *",
      [req.securityCompanyId, name, apiKey, req.body.description || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }));

  router.put("/platform/security/public-groups/:groupId", ...manage, handle(async (req, res) => {
    if (req.body.active !== undefined && typeof req.body.active !== "boolean") return res.status(400).json({ success: false, message: "active must be boolean" });
    if (req.body.apiKey !== undefined && !isSafeIdentifier(req.body.apiKey)) return res.status(400).json({ success: false, message: "Invalid API key" });
    const result = await db(
      `UPDATE platform_public_groups SET name=COALESCE($1,name),api_key=COALESCE($2,api_key),
         description=COALESCE($3,description),active=COALESCE($4,active),user_modified=true,updated_at=NOW()
       WHERE id=$5 AND company_id=$6 RETURNING *`,
      [req.body.name?.trim() || null, req.body.apiKey || null, req.body.description, req.body.active, req.params.groupId, req.securityCompanyId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Public Group not found" });
    res.json({ success: true, data: result.rows[0] });
  }));

  router.delete("/platform/security/public-groups/:groupId", ...manage, handle(async (req, res) => {
    const result = await db("UPDATE platform_public_groups SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id", [req.params.groupId, req.securityCompanyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Public Group not found" });
    res.json({ success: true });
  }));

  router.get("/platform/security/public-groups/:groupId/members", ...manage, handle(async (req, res) => {
    const result = await db(
      `SELECT m.id,m.member_type,m.member_id,
              COALESCE(u.username,r.name,g.name) AS member_name
         FROM platform_public_group_members m
         LEFT JOIN users u ON m.member_type='USER' AND u.id=m.member_id AND u.company_id=m.company_id
         LEFT JOIN roles r ON m.member_type='ROLE' AND r.id=m.member_id AND r.company_id=m.company_id
         LEFT JOIN platform_public_groups g ON m.member_type='GROUP' AND g.id=m.member_id AND g.company_id=m.company_id
        WHERE m.group_id=$1 AND m.company_id=$2 ORDER BY m.member_type,member_name`,
      [req.params.groupId, req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/public-groups/:groupId/members", ...manage, handle(async (req, res) => {
    const type = String(req.body?.memberType || "").toUpperCase();
    const memberId = req.body?.memberId;
    const companyId = req.securityCompanyId;
    const group = await db("SELECT id FROM platform_public_groups WHERE id=$1 AND company_id=$2 AND active=true", [req.params.groupId, companyId]);
    if (!group.rows.length || !await principalExists(companyId, type, memberId)) return res.status(404).json({ success: false, message: "Public Group or company member not found" });
    if (type === "GROUP") {
      const existing = await db("SELECT group_id,member_type,member_id FROM platform_public_group_members WHERE company_id=$1 AND member_type='GROUP'", [companyId]);
      if (publicGroupMembershipWouldCycle(existing.rows, req.params.groupId, memberId)) return res.status(400).json({ success: false, message: "Nested Public Groups cannot contain a cycle" });
    }
    const result = await db(
      `INSERT INTO platform_public_group_members (group_id,company_id,member_type,member_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT (group_id,member_type,member_id,company_id) DO NOTHING RETURNING *`,
      [req.params.groupId, companyId, type, memberId]
    );
    res.status(201).json({ success: true, data: result.rows[0] || { group_id: req.params.groupId, member_type: type, member_id: memberId } });
  }));

  router.delete("/platform/security/public-groups/:groupId/members/:memberType/:memberId", ...manage, handle(async (req, res) => {
    const type = String(req.params.memberType || "").toUpperCase();
    if (!MEMBER_TYPES.has(type)) return res.status(400).json({ success: false, message: "Unsupported group member type" });
    const result = await db("DELETE FROM platform_public_group_members WHERE group_id=$1 AND member_type=$2 AND member_id=$3 AND company_id=$4 RETURNING id", [req.params.groupId, type, req.params.memberId, req.securityCompanyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Public Group member not found" });
    res.json({ success: true });
  }));

  router.get("/platform/security/queues", ...manage, handle(async (req, res) => {
    const result = await db(
      `SELECT q.*,COUNT(DISTINCT m.id)::int AS member_count,COUNT(DISTINCT r.id)::int AS queued_record_count
         FROM platform_queues q
         LEFT JOIN platform_queue_members m ON m.queue_id=q.id AND m.company_id=q.company_id
         LEFT JOIN platform_queue_records r ON r.queue_id=q.id AND r.company_id=q.company_id AND r.active=true
        WHERE q.company_id=$1 GROUP BY q.id ORDER BY q.name`,
      [req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/queues", ...manage, handle(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const apiKey = req.body?.apiKey || toSafeApiName(name, "queue");
    const objects = await supportedObjects(req.securityCompanyId, req.body?.supportedObjects || []);
    const claimBehavior = req.body?.claimBehavior || "ANY_MEMBER";
    if (!name || !isSafeIdentifier(apiKey) || !objects || !["ANY_MEMBER", "ORDERED"].includes(claimBehavior)) return res.status(400).json({ success: false, message: "Queue name, supported Objects, API key, or claim behavior is invalid" });
    const result = await db(
      `INSERT INTO platform_queues (company_id,name,api_key,description,supported_objects,claim_behavior,allow_record_ownership,active)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,true) RETURNING *`,
      [req.securityCompanyId, name, apiKey, req.body.description || null, JSON.stringify(objects), claimBehavior, req.body.allowRecordOwnership !== false]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }));

  router.put("/platform/security/queues/:queueId", ...manage, handle(async (req, res) => {
    if (req.body.active !== undefined && typeof req.body.active !== "boolean") return res.status(400).json({ success: false, message: "active must be boolean" });
    if (req.body.apiKey !== undefined && !isSafeIdentifier(req.body.apiKey)) return res.status(400).json({ success: false, message: "Invalid API key" });
    if (req.body.claimBehavior !== undefined && !["ANY_MEMBER", "ORDERED"].includes(req.body.claimBehavior)) return res.status(400).json({ success: false, message: "Invalid claim behavior" });
    const existing = await db("SELECT * FROM platform_queues WHERE id=$1 AND company_id=$2", [req.params.queueId, req.securityCompanyId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, message: "Queue not found" });
    const current = existing.rows[0];
    const objects = req.body.supportedObjects === undefined ? current.supported_objects : await supportedObjects(req.securityCompanyId, req.body.supportedObjects);
    if (!objects || (req.body.allowRecordOwnership !== undefined && typeof req.body.allowRecordOwnership !== "boolean")) return res.status(400).json({ success: false, message: "Supported Objects or ownership setting is invalid" });
    const result = await db(
      `UPDATE platform_queues SET name=COALESCE($1,name),api_key=COALESCE($2,api_key),description=COALESCE($3,description),
         supported_objects=$4::jsonb,claim_behavior=COALESCE($5,claim_behavior),allow_record_ownership=COALESCE($6,allow_record_ownership),
         active=COALESCE($7,active),user_modified=true,updated_at=NOW()
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [req.body.name?.trim() || null, req.body.apiKey || null, req.body.description, JSON.stringify(objects), req.body.claimBehavior,
        req.body.allowRecordOwnership, req.body.active, req.params.queueId, req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows[0] });
  }));

  router.delete("/platform/security/queues/:queueId", ...manage, handle(async (req, res) => {
    const result = await db("UPDATE platform_queues SET active=false,user_modified=true,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id", [req.params.queueId, req.securityCompanyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Queue not found" });
    res.json({ success: true });
  }));

  router.get("/platform/security/queues/:queueId/members", ...manage, handle(async (req, res) => {
    const result = await db(
      `SELECT m.id,m.member_type,m.member_id,COALESCE(u.username,r.name,g.name) AS member_name
         FROM platform_queue_members m
         LEFT JOIN users u ON m.member_type='USER' AND u.id=m.member_id AND u.company_id=m.company_id
         LEFT JOIN roles r ON m.member_type='ROLE' AND r.id=m.member_id AND r.company_id=m.company_id
         LEFT JOIN platform_public_groups g ON m.member_type='GROUP' AND g.id=m.member_id AND g.company_id=m.company_id
        WHERE m.queue_id=$1 AND m.company_id=$2 ORDER BY m.member_type,member_name`,
      [req.params.queueId, req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/queues/:queueId/members", ...manage, handle(async (req, res) => {
    const type = String(req.body?.memberType || "").toUpperCase();
    const memberId = req.body?.memberId;
    const companyId = req.securityCompanyId;
    const queue = await db("SELECT id FROM platform_queues WHERE id=$1 AND company_id=$2 AND active=true", [req.params.queueId, companyId]);
    if (!queue.rows.length || !await principalExists(companyId, type, memberId)) return res.status(404).json({ success: false, message: "Queue or company member not found" });
    const result = await db(
      `INSERT INTO platform_queue_members (queue_id,company_id,member_type,member_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT (queue_id,member_type,member_id,company_id) DO NOTHING RETURNING *`,
      [req.params.queueId, companyId, type, memberId]
    );
    res.status(201).json({ success: true, data: result.rows[0] || { queue_id: req.params.queueId, member_type: type, member_id: memberId } });
  }));

  router.delete("/platform/security/queues/:queueId/members/:memberType/:memberId", ...manage, handle(async (req, res) => {
    const type = String(req.params.memberType || "").toUpperCase();
    if (!MEMBER_TYPES.has(type)) return res.status(400).json({ success: false, message: "Unsupported queue member type" });
    const result = await db("DELETE FROM platform_queue_members WHERE queue_id=$1 AND member_type=$2 AND member_id=$3 AND company_id=$4 RETURNING id", [req.params.queueId, type, req.params.memberId, req.securityCompanyId]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: "Queue member not found" });
    res.json({ success: true });
  }));

  router.get("/platform/security/queues/:queueId/records", ...manage, handle(async (req, res) => {
    const result = await db(
      `SELECT r.*,o.object_key, q.name AS queue_name
         FROM platform_queue_records r JOIN platform_objects o ON o.id=r.object_id
         JOIN platform_queues q ON q.id=r.queue_id
        WHERE r.queue_id=$1 AND r.company_id=$2 AND r.active=true ORDER BY r.assigned_at,r.id`,
      [req.params.queueId, req.securityCompanyId]
    );
    res.json({ success: true, data: result.rows });
  }));

  router.post("/platform/security/queues/:queueId/records", ...manage, handle(async (req, res) => {
    const [queue, object] = await Promise.all([
      db("SELECT * FROM platform_queues WHERE id=$1 AND company_id=$2 AND active=true", [req.params.queueId, req.securityCompanyId]),
      db("SELECT * FROM platform_objects WHERE object_key=$1 AND active=true AND (company_id IS NULL OR company_id=$2)", [req.body.objectKey, req.securityCompanyId]),
    ]);
    const queueRow = queue.rows[0];
    const objectRow = object.rows[0];
    if (!queueRow || !objectRow || !isSafeIdentifier(objectRow.source_table) || !queueRow.allow_record_ownership || !(queueRow.supported_objects || []).includes(objectRow.object_key)) {
      return res.status(404).json({ success: false, message: "Queue or supported Object not found" });
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(req.body.recordId || ""))) return res.status(400).json({ success: false, message: "Valid recordId is required" });
    const scope = ["id=$1"];
    const params = [req.body.recordId];
    if (objectRow.company_scoped !== false) { params.push(req.securityCompanyId); scope.push(`company_id=$${params.length}`); }
    if (objectRow.store_scoped) {
      if (!req.user.storeId) return res.status(403).json({ success: false, message: "A store session is required" });
      params.push(req.user.storeId); scope.push(`store_id=$${params.length}`);
    }
    const record = await db(`SELECT id FROM "${objectRow.source_table}" WHERE ${scope.join(" AND ")}`, params);
    if (!record.rows.length) return res.status(404).json({ success: false, message: "Record not found" });
    const result = await db(
      `INSERT INTO platform_queue_records (queue_id,object_id,record_id,company_id,assigned_by,active)
       VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (company_id,object_id,record_id) DO UPDATE SET queue_id=EXCLUDED.queue_id,assigned_by=EXCLUDED.assigned_by,assigned_at=NOW(),claimed_by=NULL,claimed_at=NULL,active=true
       RETURNING *`,
      [queueRow.id, objectRow.id, req.body.recordId, req.securityCompanyId, req.user.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }));

  router.post("/platform/security/queues/:queueId/claim", authenticate, resolveCompany, handle(async (req, res) => {
    const groupIds = await loadEffectivePublicGroupIds(db, { companyId: req.securityCompanyId, userId: req.user.id, roleId: req.user.roleId });
    const member = await db(
      `SELECT 1 FROM platform_queue_members m
        WHERE m.queue_id=$1 AND m.company_id=$2 AND (
          (m.member_type='USER' AND m.member_id=$3)
          OR (m.member_type='ROLE' AND m.member_id=$4)
          OR (m.member_type='GROUP' AND m.member_id=ANY($5::uuid[]))
        ) LIMIT 1`,
      [req.params.queueId, req.securityCompanyId, req.user.id, req.user.roleId, groupIds]
    );
    if (!member.rows.length) return res.status(403).json({ success: false, message: "Queue membership required" });
    const result = await db(
      `UPDATE platform_queue_records r SET claimed_by=$1,claimed_at=NOW()
        FROM platform_queues q
      WHERE r.queue_id=q.id AND q.id=$2 AND q.company_id=$3 AND q.active=true AND r.company_id=$3 AND r.active=true AND r.claimed_by IS NULL
         AND ($4::uuid IS NULL OR r.id=$4)
         AND (q.claim_behavior='ANY_MEMBER' OR r.assigned_at=(
           SELECT MIN(next_record.assigned_at) FROM platform_queue_records next_record
            WHERE next_record.queue_id=q.id AND next_record.company_id=$3 AND next_record.active=true AND next_record.claimed_by IS NULL
         ))
       RETURNING r.*`,
      [req.user.id, req.params.queueId, req.securityCompanyId, req.body?.queueRecordId || null]
    );
    if (!result.rows.length) return res.status(409).json({ success: false, message: "No claimable queue record is available" });
    res.json({ success: true, data: result.rows[0] });
  }));

  return router;
}