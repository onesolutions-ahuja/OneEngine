import { loadEffectivePermissionSets, permissionSetAllowsSystemPermission } from "../services/platformPermissionSets.js";
import express from "express";
import { DUPLICATE_EMAIL_MESSAGE, normalizeEmail } from "../services/userIdentity.js";
import { domainAllowed } from "../services/accountPolicy.js";
import { toSafeApiName } from "../services/platformMetadata.js";
import { delegatedAdminContext, delegatedRoleAssignable, delegatedUserAllowed } from "../services/delegatedAdministration.js";
import {
  JARVES_ALLOWANCE_RESULTS,
  getJarvesLicenceState,
  setJarvesUserEnabled,
} from "../services/jarvis/licensing.js";

export default function createAdminRouter({
  authenticate,
  authorize,
  db,
  pool,
  canViewCompanyCustomers,
  bcrypt,
  savePlatformRecord = null,
  /*
   * Administrative authority is supplied by the canonical permission-driven
   * helper in server.js. No role name or identity is an authority source.
   */
  hasCompanyAdminAccess = async (req) => canViewCompanyCustomers(req.user, req),
}) {
  const router = express.Router();

  async function hasOneEngineManage(req) {
    if (!req.user?.id || !req.user?.companyId) return false;
    const [roleResult, permissionSets] = await Promise.all([
      req.user.roleId
        ? db("SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code='oneengine.manage' LIMIT 1", [req.user.roleId])
        : Promise.resolve({ rows: [] }),
      loadEffectivePermissionSets(db, req.user, req),
    ]);
    return roleResult.rows.length > 0
      || permissionSetAllowsSystemPermission(permissionSets, "oneengine.manage");
  }

  async function protectedRole(roleId, companyId) {
    if (!roleId) return null;
    const result = await db(
      "SELECT id,managed_by_platform FROM roles WHERE id=$1 AND company_id=$2",
      [roleId, companyId]
    );
    return result.rows[0] || null;
  }

  async function protectedUser(userId, companyId) {
    const result = await db(
      `SELECT u.id,u.role_id,COALESCE(r.managed_by_platform,false) AS managed_by_platform
         FROM users u
         LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
        WHERE u.id=$1 AND u.company_id=$2`,
      [userId, companyId]
    );
    return result.rows[0] || null;
  }

  async function requireOneEngineForProtectedRole(req, roleId) {
    const role = await protectedRole(roleId, req.user.companyId);
    if (!role) return { ok: false, status: 404, message: "Role not found" };
    if (role.managed_by_platform && !(await hasOneEngineManage(req))) {
      return { ok: false, status: 403, message: "This system-managed role can only be changed by OneEngine Manager" };
    }
    return { ok: true, role };
  }

  async function requireOneEngineForProtectedUser(req, userId) {
    const user = await protectedUser(userId, req.user.companyId);
    if (!user) return { ok: false, status: 404, message: "User not found" };
    if (user.managed_by_platform && !(await hasOneEngineManage(req))) {
      return { ok: false, status: 403, message: "This system-managed support account can only be changed by OneEngine Manager" };
    }
    return { ok: true, user };
  }

  async function validRoleParent(parentRoleId, companyId, roleId = null) {
    if (!parentRoleId) return true;
    if (typeof parentRoleId !== "string" || String(parentRoleId) === String(roleId)) return false;
    const result = await db("SELECT id,parent_role_id FROM roles WHERE company_id=$1", [companyId]);
    const roleById = new Map(result.rows.map((role) => [String(role.id), role]));
    const visited = new Set();
    let cursor = String(parentRoleId);
    while (cursor) {
      if (cursor === String(roleId) || visited.has(cursor)) return false;
      visited.add(cursor);
      const parent = roleById.get(cursor);
      if (!parent) return false;
      cursor = parent.parent_role_id ? String(parent.parent_role_id) : "";
    }
    return true;
  }

  /*
   * GET /api/admin/users
   */
  router.get("/admin/users", authenticate, authorize("user.view"), async (req, res) => {
    try {
      const delegated=await delegatedAdminContext(db,{companyId:req.user.companyId,userId:req.user.id});
      const result = delegated.delegated
        ? await db("SELECT u.id, u.username, u.full_name, u.email, u.active, u.store_id, s.name AS store_name, u.role_id, r.name AS role_name, u.jarves_enabled FROM users u LEFT JOIN stores s ON s.id=u.store_id LEFT JOIN roles r ON r.id=u.role_id WHERE u.company_id=$1 AND u.role_id=ANY($2::uuid[]) ORDER BY u.full_name", [req.user.companyId,delegated.scopedRoleIds])
        : await db("SELECT u.id, u.username, u.full_name, u.email, u.active, u.store_id, s.name AS store_name, u.role_id, r.name AS role_name, u.jarves_enabled FROM users u LEFT JOIN stores s ON s.id=u.store_id LEFT JOIN roles r ON r.id=u.role_id WHERE u.company_id=$1 ORDER BY u.full_name", [req.user.companyId]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load users" });
    }
  });

  /*
   * PUT /api/admin/users/:id/jarves
   * JARVES licence control: enable/disable JARVES for ONE user. Enabling is
   * refused when the company licence allowance is already fully used
   * (ALLOWANCE_REACHED, 409). Company-scoped via the existing users.company_id
   * filter - an admin can never touch another company's user.
   */
  router.put("/admin/users/:id/jarves", authenticate, authorize("user.edit"), async (req, res) => {
    try {
      const enabled = req.body?.enabled;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ success: false, message: "A boolean \"enabled\" is required" });
      }
      const result = await setJarvesUserEnabled(db, {
        companyId: req.user.companyId,
        userId: req.params.id,
        enabled,
      });
      if (result === JARVES_ALLOWANCE_RESULTS.USER_NOT_FOUND) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      if (result === JARVES_ALLOWANCE_RESULTS.ALLOWANCE_REACHED) {
        const state = await getJarvesLicenceState(db, req.user.companyId);
        return res.status(409).json({
          success: false,
          code: "jarves_allowance_reached",
          message: `The JARVES licence allowance (${state.allowance}) is already fully used. Increase the allowance or disable JARVES for another user first.`,
        });
      }
      const state = await getJarvesLicenceState(db, req.user.companyId);
      res.json({ success: true, data: state });
    } catch (error) {
      console.error("JARVES user toggle error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to update JARVES for this user" });
    }
  });

  /*
   * GET /api/admin/users/:id/stores
   * Returns the stores assigned to a user.
   */
  router.get("/admin/users/:id/stores", authenticate, authorize("user.view"), async (req, res) => {
    try {
      const userCheck = await db("SELECT store_id FROM users WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);
      if (!userCheck.rows.length) return res.status(404).json({ success: false, message: "User not found" });
      
      const result = await db(
        `SELECT s.id, s.name, s.code, s.active, us.active AS assigned,
                (u.store_id=s.id) AS is_default
         FROM stores s
         LEFT JOIN user_stores us ON us.store_id = s.id AND us.user_id = $1 AND us.active = true
         LEFT JOIN users u ON u.id=$1
         WHERE s.company_id = $2
         ORDER BY s.name`,
        [req.params.id, req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load user stores" });
    }
  });

  /*
   * PUT /api/admin/users/:id/stores
   * Updates the stores assigned to a user.
   */
  router.put("/admin/users/:id/stores", authenticate, authorize("user.store_assignment.manage"), async (req, res) => {
    if (!pool) return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    if (!Array.isArray(req.body.storeIds)) return res.status(400).json({ success: false, message: "storeIds must be an array" });
    const requestedDefaultStoreId = req.body.defaultStoreId ? String(req.body.defaultStoreId) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const userCheck = await client.query("SELECT 1 FROM users WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);
      if (!userCheck.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "User not found" }); }
      
      // Only allow assignment to active stores
      const storeCheck = await client.query(
        "SELECT id FROM stores WHERE id = ANY($1::uuid[]) AND company_id = $2 AND active = true",
        [req.body.storeIds, req.user.companyId]
      );
      const validStoreIds = storeCheck.rows.map(row => row.id);
      if (requestedDefaultStoreId && !validStoreIds.map(String).includes(requestedDefaultStoreId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Default store must be one of the assigned stores" });
      }
      
      // Deactivate all existing user-store assignments
      await client.query(
        "UPDATE user_stores SET active = false WHERE user_id = $1",
        [req.params.id]
      );
      
      // Reactivate or create assignments for valid stores
      for (const storeId of validStoreIds) {
        await client.query(
          `INSERT INTO user_stores (user_id, store_id, active)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id, store_id) 
           DO UPDATE SET active = true`,
          [req.params.id, storeId]
        );
      }
      
      const defaultStoreId = requestedDefaultStoreId || validStoreIds[0] || null;
      await client.query(
        "UPDATE users SET store_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3",
        [defaultStoreId, req.params.id, req.user.companyId]
      );

      await client.query("COMMIT");
      res.json({ success: true, message: "Store access updated", defaultStoreId });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update user stores error:", error);
      res.status(500).json({ success: false, message: "Unable to update store access" });
    } finally {
      client.release();
    }
  });

  /*
   * GET /api/admin/roles
   */
  router.get("/admin/roles", authenticate, authorize("role.manage"), async (req, res) => {
    try {
      const delegated=await delegatedAdminContext(db,{companyId:req.user.companyId,userId:req.user.id});
      const result = delegated.delegated
        ? await db("SELECT r.id,r.name,r.description,r.is_system_role,r.managed_by_platform,r.parent_role_id,p.name AS parent_role_name,(SELECT COUNT(*)::int FROM users u WHERE u.role_id=r.id AND u.active) AS user_count FROM roles r LEFT JOIN roles p ON p.id=r.parent_role_id AND p.company_id=r.company_id WHERE r.company_id=$1 AND r.id=ANY($2::uuid[]) ORDER BY r.name", [req.user.companyId,delegated.assignableRoleIds])
        : await db("SELECT r.id,r.name,r.description,r.is_system_role,r.managed_by_platform,r.parent_role_id,p.name AS parent_role_name,(SELECT COUNT(*)::int FROM users u WHERE u.role_id=r.id AND u.active) AS user_count FROM roles r LEFT JOIN roles p ON p.id=r.parent_role_id AND p.company_id=r.company_id WHERE r.company_id=$1 ORDER BY r.name", [req.user.companyId]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load roles" });
    }
  });

  /*
   * GET /api/admin/permissions
   */
  router.get("/admin/permissions", authenticate, authorize("role.manage"), async (req, res) => {
    try {
      const result = await db("SELECT code, name, description FROM permissions ORDER BY code");
      res.json({ success: true, data: result.rows });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load permissions" });
    }
  });

  router.get("/admin/roles/:roleId/object-permissions", authenticate, authorize("role.manage"), async (req, res) => {
    try {
      const role = await db("SELECT id FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
      if (!role.rows.length) return res.status(404).json({ success: false, message: "Role not found" });
      const result = await db(
        `SELECT o.id AS object_id, o.object_key, o.label,
                COALESCE(p.can_view, false) AS can_view,
                COALESCE(p.can_create, false) AS can_create,
                COALESCE(p.can_edit, false) AS can_edit,
                COALESCE(p.can_delete, false) AS can_delete
         FROM platform_objects o
         LEFT JOIN platform_object_permissions p ON p.object_id=o.id AND p.role_id=$1 AND p.company_id=$2
         WHERE o.company_id IS NULL OR o.company_id=$2 ORDER BY o.label`,
        [req.params.roleId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load object permissions error:", error);
      res.status(500).json({ success: false, message: "Unable to load object permissions" });
    }
  });

  router.put("/admin/roles/:roleId/object-permissions", authenticate, authorize("role.manage"), async (req, res) => {
    if (!Array.isArray(req.body?.permissions)) return res.status(400).json({ success: false, message: "permissions must be an array" });
    const roleAccess = await requireOneEngineForProtectedRole(req, req.params.roleId);
    if (!roleAccess.ok) return res.status(roleAccess.status).json({ success: false, message: roleAccess.message });
    const client = pool ? await pool.connect() : null;
    if (!client) return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM platform_object_permissions WHERE role_id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
      for (const permission of req.body.permissions) {
        if (!permission?.objectId) continue;
        await client.query(
          `INSERT INTO platform_object_permissions (object_id, role_id, company_id, can_view, can_create, can_edit, can_delete)
           SELECT id, $2, $3, $4, $5, $6, $7 FROM platform_objects WHERE id=$1 AND (company_id IS NULL OR company_id=$3)
           ON CONFLICT (object_id, role_id, company_id) DO UPDATE SET can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_edit=EXCLUDED.can_edit, can_delete=EXCLUDED.can_delete`,
          [permission.objectId, req.params.roleId, req.user.companyId, permission.canView === true, permission.canCreate === true, permission.canEdit === true, permission.canDelete === true]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Save object permissions error:", error);
      res.status(500).json({ success: false, message: "Unable to save object permissions" });
    } finally {
      client.release();
    }
  });

  /*
   * GET /api/admin/roles/:roleId/permissions
   * Returns the set of permission codes currently assigned to a role.
   * Company-scoped: the role must belong to the authenticated user's company.
   */
  router.get("/admin/roles/:roleId/permissions", authenticate, authorize("role.manage"), async (req, res) => {
    try {
      const roleCheck = await db("SELECT 1 FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
      if (!roleCheck.rows.length) return res.status(404).json({ success: false, message: "Role not found" });
      const result = await db("SELECT p.code FROM permissions p INNER JOIN role_permissions rp ON rp.permission_id=p.id INNER JOIN roles r ON r.id=rp.role_id WHERE r.id=$1", [req.params.roleId]);
      res.json({ success: true, data: result.rows.map((row) => row.code) });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load role permissions" });
    }
  });

  /*
   * PUT /api/admin/roles/:roleId/permissions
   * Replaces the full permission set for a role.
   * Company-scoped: the role must belong to the authenticated user's company.
   */
  router.put("/admin/roles/:roleId/permissions", authenticate, authorize("role.manage"), async (req, res) => {
    if (!pool) return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    if (!Array.isArray(req.body.permissions)) return res.status(400).json({ success: false, message: "permissions must be an array" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const roleCheck = await client.query("SELECT id,managed_by_platform FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
      if (!roleCheck.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Role not found" }); }
      if (roleCheck.rows[0].managed_by_platform && !(await hasOneEngineManage(req))) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "This system-managed role can only be changed by OneEngine Manager" });
      }
      await client.query("DELETE FROM role_permissions WHERE role_id=$1", [req.params.roleId]);
      const codes = [...new Set(req.body.permissions.map((code) => String(code || "").trim()).filter(Boolean))];
      if (codes.length) {
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT $1,p.id FROM permissions p WHERE p.code=ANY($2::text[])
           ON CONFLICT (role_id,permission_id) DO NOTHING`,
          [req.params.roleId, codes]
        );
      }
      await client.query("COMMIT");
      const result = await db("SELECT p.code FROM permissions p INNER JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=$1 ORDER BY p.code", [req.params.roleId]);
      res.json({ success: true, data: result.rows.map((row) => row.code) });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update role permissions error:", error);
      res.status(500).json({ success: false, message: "Unable to save role permissions" });
    } finally {
      client.release();
    }
  });

  /*
   * POST /api/admin/roles — create a role (T10J).
   * Company-scoped. Role display names have no authorization meaning; stable
   * API keys and explicit permissions are the authority.
   */
  router.post("/admin/roles", authenticate, authorize("role.manage"), async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Role name is required" });
    if (name.length > 100) return res.status(400).json({ success: false, message: "Role name is too long" });
    const parentRoleId = req.body.parentRoleId || null;
    if (!await validRoleParent(parentRoleId, req.user.companyId)) return res.status(400).json({ success: false, message: "Parent role must belong to this company" });
    try {
      const dup = await db("SELECT 1 FROM roles WHERE company_id=$1 AND LOWER(name)=LOWER($2)", [req.user.companyId, name]);
      if (dup.rows.length) return res.status(409).json({ success: false, message: "A role with this name already exists" });
      const apiKey = toSafeApiName(name, "role");
      const keyConflict = await db("SELECT 1 FROM roles WHERE company_id=$1 AND api_key=$2", [req.user.companyId, apiKey]);
      if (keyConflict.rows.length) return res.status(409).json({ success: false, message: "A role with a conflicting stable key already exists" });
      const result = await db(
        "INSERT INTO roles (company_id,name,api_key,description,is_system_role,parent_role_id) VALUES ($1,$2,$3,$4,FALSE,$5) RETURNING id,name,api_key,description,is_system_role,parent_role_id",
        [req.user.companyId, name, apiKey, req.body.description ? String(req.body.description) : null, parentRoleId]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to create role" });
    }
  });

  /*
   * PUT /api/admin/roles/:roleId — rename / change description (T10J).
   * Company-scoped. Platform-managed roles are protected by metadata; display
   * names themselves do not grant or reserve access.
   */
  router.put("/admin/roles/:roleId", authenticate, authorize("role.manage"), async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Role name is required" });
    if (name.length > 100) return res.status(400).json({ success: false, message: "Role name is too long" });
    try {
      const check = await db("SELECT name,api_key,description,is_system_role,managed_by_platform,parent_role_id FROM roles WHERE id=$1 AND company_id=$2", [req.params.roleId, req.user.companyId]);
      if (!check.rows.length) return res.status(404).json({ success: false, message: "Role not found" });
      const existing = check.rows[0];
      if (existing.managed_by_platform && !(await hasOneEngineManage(req))) {
        return res.status(403).json({ success: false, message: "This system-managed role can only be changed by OneEngine Manager" });
      }
      const parentRoleId = req.body.parentRoleId === undefined ? existing.parent_role_id : (req.body.parentRoleId || null);
      if (!await validRoleParent(parentRoleId, req.user.companyId, req.params.roleId)) {
        return res.status(400).json({ success: false, message: "Parent role must belong to this company and cannot create a cycle" });
      }
      const dup = await db("SELECT 1 FROM roles WHERE company_id=$1 AND LOWER(name)=LOWER($2) AND id<>$3", [req.user.companyId, name, req.params.roleId]);
      if (dup.rows.length) return res.status(409).json({ success: false, message: "A role with this name already exists" });
      const result = await db(
        "UPDATE roles SET name=$1,description=$2,parent_role_id=$3 WHERE id=$4 AND company_id=$5 RETURNING id,name,api_key,description,is_system_role,parent_role_id",
        [name, req.body.description !== undefined ? (req.body.description ? String(req.body.description) : null) : existing.description,
          parentRoleId, req.params.roleId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to update role" });
    }
  });

  /*
   * PUT /api/admin/roles/:roleId/active — activate/deactivate a role (T10J).
   * Deactivation is a soft action (existing model has no active column);
   * it detaches the role from the company's users so they can no longer
   * authenticate with those permissions. The last active role holding
   * company.scope.all is protected to prevent tenant lock-out.
   */
  router.put("/admin/roles/:roleId/active", authenticate, authorize("role.manage"), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const check = await client.query("SELECT id, name, is_system_role, managed_by_platform FROM roles WHERE id=$1 AND company_id=$2 FOR UPDATE", [req.params.roleId, req.user.companyId]);
      if (!check.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ success: false, message: "Role not found" }); }
      const role = check.rows[0];
      if (role.managed_by_platform && !(await hasOneEngineManage(req))) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "This system-managed role can only be changed by OneEngine Manager" });
      }
      const activate = req.body.active !== false;
      if (!activate) {
        // Prevent tenant lock-out using effective RBAC, not role-only grants.
        // A remaining active user may retain company.scope.all through either
        // their role or an active permission set.
        const holders = await client.query(
          "SELECT id,role_id FROM users WHERE role_id=$1 AND company_id=$2 AND active",
          [role.id, req.user.companyId]
        );
        if (holders.rows.length) {
          const activeUsers = await client.query(
            "SELECT id,role_id FROM users WHERE company_id=$1 AND active",
            [req.user.companyId]
          );
          let hasAlternativeCompanyScope = false;
          for (const user of activeUsers.rows) {
            const permissionReq = {
              ...req,
              user: {
                ...req.user,
                id: user.id,
                // Users on the role being deactivated lose that role but keep
                // independently assigned permission sets. Evaluate exactly
                // that post-deactivation state to avoid a false lockout block.
                roleId: String(user.role_id || "") === String(role.id) ? null : user.role_id,
                companyId: req.user.companyId,
              },
            };
            if (await hasPermission(permissionReq, "company.scope.all")) {
              hasAlternativeCompanyScope = true;
              break;
            }
          }
          if (!hasAlternativeCompanyScope) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Cannot deactivate the last active company-wide access profile",
            });
          }
        }
        /* Deactivate = detach all users from the role (soft, reversible: set
           the role inactive then reassign users on re-activation is not
           tracked, so we simply block sign-in by nulling their role). */
        await client.query("UPDATE users SET role_id=NULL, updated_at=NOW() WHERE role_id=$1 AND company_id=$2", [role.id, req.user.companyId]);
      }
      await client.query("COMMIT");
      res.json({ success: true, message: activate ? "Role activated" : "Role deactivated" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, message: "Unable to update role status" });
    } finally {
      client.release();
    }
  });

  /*
   * GET /api/admin/stores
   */
  router.get("/admin/stores", authenticate, authorize("store.view"), async (req, res) => {
    try { const result = await db("SELECT s.id, s.name, s.code, s.address_line1, s.city, s.postcode, s.phone, s.active, COALESCE(json_agg(json_build_object('id',t.id,'name',t.name,'terminalNumber',t.terminal_number,'active',t.active) ORDER BY t.created_at) FILTER (WHERE t.id IS NOT NULL),'[]') AS tills FROM stores s LEFT JOIN terminals t ON t.store_id=s.id WHERE s.company_id=$1 GROUP BY s.id ORDER BY s.name", [req.user.companyId]); res.json({ success: true, data: result.rows }); } catch (error) { res.status(500).json({ success: false, message: "Unable to load stores" }); }
  });

  /*
   * PUT /api/admin/stores/:id
   */
  router.post("/admin/stores/:id/self-checkout-key", authenticate, authorize("store.edit"), async (req, res) => {
    if (!(await hasCompanyAdminAccess(req))) return res.status(403).json({ success: false, message: "Administrator permission required" });
    try {
      const store = await db("SELECT id FROM stores WHERE id = $1 AND company_id = $2", [req.params.id, req.user.companyId]);
      if (!store.rows.length) return res.status(404).json({ success: false, message: "Store not found" });

      if (req.body?.clear === true) {
        await db("UPDATE stores SET self_checkout_key_hash = NULL, updated_at = NOW() WHERE id = $1 AND company_id = $2", [req.params.id, req.user.companyId]);
        return res.json({ success: true, message: "Self-Checkout pairing cleared for this store", data: { cleared: true } });
      }

      /* Unambiguous pairing key: 6 readable groups, no look-alike chars. */
      const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
      const raw = Array.from({ length: 24 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
      const grouped = raw.match(/.{1,4}/g).join("-");
      const hash = await bcrypt.hash(raw, 10);
      await db("UPDATE stores SET self_checkout_key_hash = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [hash, req.params.id, req.user.companyId]);
      res.json({ success: true, message: "Self-Checkout device key generated — it is shown once, store it safely", data: { deviceKey: grouped, cleared: false } });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to update the Self-Checkout device key" });
    }
  });

  /*
   * PUT /api/admin/tills/:id
   */
  router.post("/admin/users", authenticate, authorize("user.create"), async (req, res) => {
    if (!(await hasCompanyAdminAccess(req))) return res.status(403).json({ success: false, message: "Administrator permission required" });
    const { username, fullName, password, roleId = null, storeId = null } = req.body;
    const email = normalizeEmail(req.body?.email);
    if (!username || !fullName || !password) return res.status(400).json({ success: false, message: "Username, full name and password are required" });
    const delegatedRole=await delegatedRoleAssignable(db,{companyId:req.user.companyId,actorUserId:req.user.id,roleId});
    if(!delegatedRole.allowed)return res.status(403).json({success:false,message:"This role is outside your delegated administration scope"});
    try {
      const policy = await db("SELECT c.user_email_domain,cs.domain_users_only,cs.email_registration_enabled FROM companies c JOIN company_settings cs ON cs.company_id=c.id WHERE c.id=$1", [req.user.companyId]);
      const accountPolicy = policy.rows[0] || {};
      if (!domainAllowed(email, accountPolicy.user_email_domain, accountPolicy.domain_users_only)) return res.status(400).json({ success: false, code: "EMAIL_DOMAIN_NOT_ALLOWED", message: "User email must use the company email domain" });
      const assignment = await db(
        `
        SELECT
          ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM roles WHERE id = $1 AND company_id = $3)) AS valid_role,
          ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM stores WHERE id = $2 AND company_id = $3)) AS valid_store
        `,
        [roleId || null, storeId || null, req.user.companyId]
      );
      if (!assignment.rows[0].valid_role || !assignment.rows[0].valid_store) return res.status(400).json({ success: false, message: "Role or store does not belong to this company" });
      const hash = await bcrypt.hash(password, 10);
      const result = await withDomainSave({ pool, db, savePlatformRecord, key: "employee", req, write: (db) => db("INSERT INTO users (company_id,store_id,role_id,username,password_hash,full_name,email) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,username,full_name,email,active,store_id,role_id", [req.user.companyId, storeId || null, roleId || null, String(username).trim().toLowerCase(), hash, String(fullName).trim(), email || null]) });
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { if (error.code === "PLATFORM_RECORD_INVALID") return res.status(error.status).json({ success: false, code: error.code, message: error.message }); res.status(error.code === "23505" ? 409 : 500).json({ success: false, code: error.code === "23505" ? "EMAIL_ALREADY_REGISTERED" : undefined, message: error.code === "23505" ? DUPLICATE_EMAIL_MESSAGE : "Unable to create user" }); }
  });

  /*
   * PUT /api/admin/users/:id
   */
  router.put("/admin/users/:id", authenticate, authorize("user.edit"), async (req, res) => {
    try {
      const delegatedTarget=await delegatedUserAllowed(db,{companyId:req.user.companyId,actorUserId:req.user.id,targetUserId:req.params.id});
      if(!delegatedTarget.allowed)return res.status(delegatedTarget.notFound?404:403).json({success:false,message:delegatedTarget.notFound?"User not found":"This user is outside your delegated administration scope"});
      if(req.body.roleId){
        const delegatedRole=await delegatedRoleAssignable(db,{companyId:req.user.companyId,actorUserId:req.user.id,roleId:req.body.roleId});
        if(!delegatedRole.allowed)return res.status(403).json({success:false,message:"This role is outside your delegated administration scope"});
      }
      const existingAccess = await requireOneEngineForProtectedUser(req, req.params.id);
      if (!existingAccess.ok) return res.status(existingAccess.status).json({ success: false, message: existingAccess.message });
      if (req.body.roleId) {
        const targetRoleAccess = await requireOneEngineForProtectedRole(req, req.body.roleId);
        if (!targetRoleAccess.ok) return res.status(targetRoleAccess.status).json({ success: false, message: targetRoleAccess.message });
      }
      const assignment = await db(
        `
        SELECT
          ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM roles WHERE id = $1 AND company_id = $3)) AS valid_role,
          ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM stores WHERE id = $2 AND company_id = $3)) AS valid_store
        `,
        [req.body.roleId || null, req.body.storeId || null, req.user.companyId]
      );
      if (!assignment.rows[0].valid_role || !assignment.rows[0].valid_store) return res.status(400).json({ success: false, message: "Role or store does not belong to this company" });
      const passwordClause = req.body.password ? ", password_hash = $8" : "";
      const params = [req.body.fullName, normalizeEmail(req.body.email), req.body.roleId || null, req.body.storeId || null, req.body.active !== false, req.params.id, req.user.companyId];
      if (req.body.password) params.push(await bcrypt.hash(req.body.password, 10));
      const result = await withDomainSave({ pool, db, savePlatformRecord, key: "employee", req, id: req.params.id, write: (db) => db(`UPDATE users SET full_name=$1,email=$2,role_id=$3,store_id=$4,active=$5,updated_at=NOW()${passwordClause} WHERE id=$6 AND company_id=$7 RETURNING id,username,full_name,email,active,store_id,role_id`, params) });
      if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { if (error.code === "PLATFORM_RECORD_INVALID") return res.status(error.status).json({ success: false, code: error.code, message: error.message });
      res.status(error.code === "23505" ? 409 : 500).json({ success: false, code: error.code === "23505" ? "EMAIL_ALREADY_REGISTERED" : undefined, message: error.code === "23505" ? DUPLICATE_EMAIL_MESSAGE : "Unable to update user" });
    }
  });

  /*
   * POST /api/admin/users/:id/reset-password
   * Admin reset of ANOTHER user's password. No current-password check (the
   * admin does not know it); requires user.manage permission + company scope.
   * Body: { newPassword, confirmPassword }. Keeps bcrypt hashing (cost 10).
   */
  router.post("/admin/users/:id/reset-password", authenticate, authorize("user.manage"), async (req, res) => {
    try {
      const delegatedTarget=await delegatedUserAllowed(db,{companyId:req.user.companyId,actorUserId:req.user.id,targetUserId:req.params.id});
      if(!delegatedTarget.allowed)return res.status(delegatedTarget.notFound?404:403).json({success:false,message:delegatedTarget.notFound?"User not found":"This user is outside your delegated administration scope"});
      const existingAccess = await requireOneEngineForProtectedUser(req, req.params.id);
      if (!existingAccess.ok) return res.status(existingAccess.status).json({ success: false, message: existingAccess.message });
      const { newPassword, confirmPassword } = req.body || {};
      if (!newPassword || !confirmPassword) return res.status(400).json({ success: false, message: "New password and confirmation are required" });
      if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: "New password and confirmation do not match" });
      if (String(newPassword).length < 8) return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
      if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ success: false, message: "Use change-password for your own account" });
      const hash = await bcrypt.hash(String(newPassword), 10);
      const result = await db("UPDATE users SET password_hash=$1, must_change_password=FALSE, updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING id, username", [hash, req.params.id, req.user.companyId]);
      if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found" });
      res.json({ success: true, message: "Password reset successfully", data: result.rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to reset password" });
    }
  });

  /*
   * DELETE /api/admin/users/:id
   * Soft delete — sets active = false so historical data remains intact.
   */
  router.delete("/admin/users/:id", authenticate, authorize("user.delete"), async (req, res) => {
    try {
      const delegatedTarget=await delegatedUserAllowed(db,{companyId:req.user.companyId,actorUserId:req.user.id,targetUserId:req.params.id});
      if(!delegatedTarget.allowed)return res.status(delegatedTarget.notFound?404:403).json({success:false,message:delegatedTarget.notFound?"User not found":"This user is outside your delegated administration scope"});
      const existingAccess = await requireOneEngineForProtectedUser(req, req.params.id);
      if (!existingAccess.ok) return res.status(existingAccess.status).json({ success: false, message: existingAccess.message });
      const result = await db(
        `UPDATE users SET active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING id`,
        [req.params.id, req.user.companyId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "User not found" });
      res.json({ success: true, message: "User deactivated" });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to deactivate user" });
    }
  });


  /* POST /api/admin/stores
   */
  router.post('/admin/stores', authenticate, authorize("store.create"), async (req, res) => {
    const { name, code, addressLine1, city, postcode, phone } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: 'Store name is required' });
    try {
      const result = await withDomainSave({ pool, db, savePlatformRecord, key: "store", req, write: (db) => db(
        `INSERT INTO stores (company_id, name, code, address_line1, city, postcode, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, code, address_line1, city, postcode, phone, active, created_at`,
        [req.user.companyId, name, code || null, addressLine1 || null, city || null, postcode || null, phone || null]
      ) });
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { if (error.code === "PLATFORM_RECORD_INVALID") return res.status(error.status).json({ success: false, code: error.code, message: error.message });
      res.status(500).json({ success: false, message: 'Unable to create store' });
    }
  });

  /* DELETE /api/admin/stores/:id
   * Soft delete — sets active = false so historical data remains intact.
   */
  router.delete('/admin/stores/:id', authenticate, authorize("store.delete"), async (req, res) => {
    try {
      const result = await db(
        `UPDATE stores SET active = false, updated_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING id`,
        [req.params.id, req.user.companyId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: 'Store not found' });
      res.json({ success: true, message: 'Store deactivated' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Unable to deactivate store' });
    }
  });

  /* GET /api/admin/stores/:id/stats
   * Returns today's sales, transaction count and low-stock item count for a store.
   */
  router.get('/admin/stores/:id/stats', authenticate, authorize("store.view"), async (req, res) => {
    if (!(await hasCompanyAdminAccess(req))) return res.status(403).json({ success: false, message: "Administrator permission required" });
    try {
      const storeCheck = await db('SELECT 1 FROM stores WHERE id=$1 AND company_id=$2', [req.params.id, req.user.companyId]);
      if (!storeCheck.rows.length) return res.status(404).json({ success: false, message: 'Store not found' });
      const result = await db(
        `
        WITH business_day AS (
          SELECT (CURRENT_TIMESTAMP AT TIME ZONE c.timezone)::date AS today
          FROM companies c
          WHERE c.id = $1
        )
        SELECT
          COALESCE((SELECT SUM(s.total) FROM sales s
            INNER JOIN companies c ON c.id = s.company_id
            CROSS JOIN business_day d
            WHERE s.company_id = $1 AND s.store_id = $2
            AND s.status = 'completed'
            AND (s.created_at AT TIME ZONE c.timezone)::date = d.today), 0) AS today_sales,
          (SELECT COUNT(*) FROM sales s
            INNER JOIN companies c ON c.id = s.company_id
            CROSS JOIN business_day d
            WHERE s.company_id = $1 AND s.store_id = $2
            AND s.status = 'completed'
            AND (s.created_at AT TIME ZONE c.timezone)::date = d.today) AS today_transactions,
          (SELECT COUNT(*) FROM products p
            WHERE p.company_id = $1
            AND p.active = true AND p.track_stock = true
            AND p.stock_quantity <= p.low_stock_level AND p.low_stock_level > 0) AS low_stock_count
        `,
        [req.user.companyId, req.params.id]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Unable to load store statistics' });
    }
  });
  return router;
}
