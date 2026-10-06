import express from "express";

import { createDashboardExecution } from "../services/dashboardExecution.js";
import { normalizeDashboardSubscription } from "../services/analyticsManagement.js";
import { resolveReportSubscriptionRecipients } from "../services/reportSubscriptionDelivery.js";
import { assertDashboardSubscriptionCompatible } from "../services/dashboardSubscriptionCompatibility.js";

import { toSafeApiName } from "../services/platformCoreMetadata.js";
import { DEFAULT_DASHBOARD_DEFINITION, mergeDashboardFilters, normalizeDashboardIdentity, validateDashboardDefinition } from "../services/dashboardBuilder.js";
import { resolveDashboardExecutionUser } from "../services/analyticsSecurity.js";
import { dashboardAccessAtLeast, dashboardPrincipalExists, loadDashboardPrincipalContext, resolveDashboardAccess, resolveDefaultDashboard } from "../services/dashboardSecurity.js";




export default function createDashboardBuilderRouter({ authenticate, authorize, db, hasCompanyWideScope, canAccessStore, writeAudit, hasPermission }) {

  const router = express.Router();

  const viewPermission = authorize("dashboard.view");
  const createPermission = authorize("dashboard.create");
  const editPermission = authorize("dashboard.edit");
  const subscribePermission = authorize("dashboard.subscribe");
  const dashboardExecution = createDashboardExecution({ db, hasCompanyWideScope, canAccessStore, hasPermission });



  async function dashboard(req, id, minimum = "VIEW") {
    const result = await db("SELECT * FROM dashboards WHERE id=$1 AND company_id=$2 AND archived_at IS NULL", [id, req.user.companyId]);
    const row = result.rows[0];
    if (!row) return null;
    const principals = await loadDashboardPrincipalContext(db, req.user);
    const actual = await resolveDashboardAccess(db, row, req.user, principals);
    return dashboardAccessAtLeast(actual, minimum) ? row : null;
  }

  const visible = async (req) => {
    const result = await db(`SELECT d.*,u.full_name AS created_by_name FROM dashboards d
      LEFT JOIN users u ON u.id=d.created_by
      WHERE d.company_id=$1 AND d.archived_at IS NULL ORDER BY d.updated_at DESC`, [req.user.companyId]);
    const rows = [];
    const principals = await loadDashboardPrincipalContext(db, req.user);
    for (const row of result.rows || []) {
      const level = await resolveDashboardAccess(db, row, req.user, principals);
      if (level) rows.push({ ...row, effective_access: level });
    }
    return { rows };
  };

  async function validatePrincipals(companyId, entries) {
    for (const entry of entries) {
      if (!await dashboardPrincipalExists(db, companyId, entry.principal_type, entry.principal_id)) {
        throw new Error(`Unknown or inactive ${entry.principal_type} principal`);
      }
      if (entry.priority !== undefined && !Number.isInteger(Number(entry.priority))) throw new Error("Default priority must be an integer");
    }
  }

  async function auditDashboard(req, action, row, metadata = {}) {
    await writeAudit?.object({ companyId: req.user.companyId, userId: req.user.id, actorUsername: req.user.username,
      action, entityType: "dashboard", entityId: row.id, metadata });
  }





  router.get("/dashboards/default", authenticate, viewPermission, async (req, res) => {
    try {
      const resolved = await resolveDefaultDashboard(db, req.user);
      if (resolved) {
        const definition = validateDashboardDefinition({
          name: resolved.dashboard.name, description: resolved.dashboard.description,
          components: resolved.dashboard.components, filters: resolved.dashboard.filters,
          global_filters: resolved.dashboard.global_filters || [],
          responsive_layouts: resolved.dashboard.responsive_layouts || {},
          run_as_mode: resolved.dashboard.run_as_mode,
          run_as_user_id: resolved.dashboard.run_as_user_id || null,
        });
        return res.json({ success: true, data: { id: resolved.dashboard.id, ...definition } });
      }
      res.json({ success: true, data: validateDashboardDefinition(structuredClone(DEFAULT_DASHBOARD_DEFINITION)) });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to resolve the default dashboard" }); }
  });
  /* Run a definition that is not (yet) saved — the Dashboard page uses this to

     render the default definition through the identical engine the saved

     dashboards use. */

  router.post("/dashboards/run", authenticate, viewPermission, async (req, res) => {

    try {

      const definition = validateDashboardDefinition({ ...(req.body || {}), run_as_mode: "VIEWER", run_as_user_id: null });
      const globalValues = req.body?.globalFilterValues && typeof req.body.globalFilterValues === "object" ? req.body.globalFilterValues : {};
      const data = await dashboardExecution.runDashboardDefinition(req, definition, { globalFilterValues: globalValues });
      res.json({ success: true, data });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to run this dashboard" }); }

  });

  router.get("/dashboards", authenticate, viewPermission, async (req, res) => {

    try { res.json({ success: true, data: (await visible(req)).rows }); }

    catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboards" }); }

  });

  router.get("/dashboards/principals", authenticate, authorize("dashboard.manage", "dashboard.share", "dashboard.assign_default", "dashboard.subscribe.recipients"), async (req, res) => {
    try {
      const [users, roles, groups] = await Promise.all([
        db("SELECT id,username,full_name FROM users WHERE company_id=$1 AND active=true ORDER BY full_name,username", [req.user.companyId]),
        db("SELECT id,name,parent_role_id FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
        db("SELECT id,name,api_key FROM platform_public_groups WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
      ]);
      res.json({ success: true, data: { users: users.rows, roles: roles.rows, groups: groups.rows, currentUserId: req.user.id, company: { id: req.user.companyId, name: req.user.companyName || "Current company" } } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboard principals" }); }
  });

  router.get("/dashboards/:id/state", authenticate, viewPermission, async (req, res) => {
    try {
      const found = await dashboard(req, req.params.id, "VIEW");
      if (!found) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const result = await db("SELECT filter_values,updated_at FROM dashboard_user_state WHERE dashboard_id=$1 AND user_id=$2", [req.params.id,req.user.id]);
      res.json({ success: true, data: result.rows[0] || { filter_values: {} } });
    } catch (error) { res.status(500).json({ success:false,message:"Unable to load dashboard state" }); }
  });

  router.put("/dashboards/:id/state", authenticate, viewPermission, async (req, res) => {
    try {
      const found = await dashboard(req, req.params.id, "VIEW");
      if (!found) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const filterValues = req.body?.filterValues && typeof req.body.filterValues === "object" ? req.body.filterValues : {};
      await db(`INSERT INTO dashboard_user_state(dashboard_id,user_id,filter_values,updated_at)
        VALUES($1,$2,$3::jsonb,NOW())
        ON CONFLICT(dashboard_id,user_id) DO UPDATE SET filter_values=EXCLUDED.filter_values,updated_at=NOW()`,
        [req.params.id,req.user.id,JSON.stringify(filterValues)]);
      res.json({ success:true,data:{ filter_values: filterValues } });
    } catch (error) { res.status(400).json({ success:false,message:"Unable to save dashboard state" }); }
  });

  router.get("/dashboards/:id", authenticate, viewPermission, async (req, res) => {

    try { const row = await dashboard(req, req.params.id); if (!row) return res.status(404).json({ success: false, message: "Dashboard not found" }); res.json({ success: true, data: row }); }

    catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboard" }); }

  });



  router.post("/dashboards", authenticate, createPermission, async (req, res) => {

    try {

      const value = validateDashboardDefinition({ ...req.body, access: [], default_assignments: [] });
      const identity = normalizeDashboardIdentity(value, value.name);
      const duplicate = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND lower(name)=lower($2) LIMIT 1", [req.user.companyId, value.name]);

      if (duplicate.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this name already exists." });

      const keyConflict = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND lower(api_key)=lower($2) LIMIT 1", [req.user.companyId, identity.apiKey]);
      if (keyConflict.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this API key already exists." });

      const result = await db(`INSERT INTO dashboards(company_id,created_by,name,description,api_key,components,filters,global_filters,responsive_layouts,run_as_mode,run_as_user_id,access,default_assignments)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12::jsonb,$13::jsonb) RETURNING *`,
        [req.user.companyId, req.user.id, value.name, value.description, identity.apiKey,
          JSON.stringify(value.components), JSON.stringify(value.filters), JSON.stringify(value.global_filters),
          JSON.stringify(value.responsive_layouts), value.run_as_mode, value.run_as_user_id,
          JSON.stringify(value.access), JSON.stringify(value.default_assignments)]);

      res.status(201).json({ success: true, data: result.rows[0] });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create dashboard" }); }

  });

  router.put("/dashboards/:id", authenticate, editPermission, async (req, res) => {

    try {

      const current = await dashboard(req, req.params.id, "EDIT");

      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });

      const value = validateDashboardDefinition({ ...req.body, name: req.body.name || current.name,
        apiKey: req.body.apiKey || req.body.api_key || req.body.metadataKey || current.api_key || current.apiKey || toSafeApiName(req.body.name || current.name, "dashboard"),
        access: current.access || [], default_assignments: current.default_assignments || [],
        run_as_mode: req.body.run_as_mode || req.body.runAsMode || current.run_as_mode || "VIEWER",
        run_as_user_id: req.body.run_as_user_id || req.body.runAsUserId || current.run_as_user_id || null,
        global_filters: req.body.global_filters || req.body.globalFilters || current.global_filters || [],
        responsive_layouts: req.body.responsive_layouts || req.body.responsiveLayouts || current.responsive_layouts || {} });
      const identity = normalizeDashboardIdentity(value, current.name);
      const duplicateName = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND id<>$2 AND lower(name)=lower($3) LIMIT 1", [req.user.companyId, current.id, value.name]);

      if (duplicateName.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this name already exists." });

      const keyConflict = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND id<>$2 AND lower(api_key)=lower($3) LIMIT 1", [req.user.companyId, current.id, identity.apiKey]);
      if (keyConflict.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this API key already exists." });

      const result = await db(`UPDATE dashboards
        SET name=$1,description=$2,api_key=$3,components=$4::jsonb,filters=$5::jsonb,global_filters=$6::jsonb,
            responsive_layouts=$7::jsonb,run_as_mode=$8,run_as_user_id=$9,access=$10::jsonb,default_assignments=$11::jsonb,updated_at=NOW()
        WHERE id=$12 AND company_id=$13 RETURNING *`,
        [value.name,value.description,identity.apiKey,JSON.stringify(value.components),JSON.stringify(value.filters),
          JSON.stringify(value.global_filters),JSON.stringify(value.responsive_layouts),value.run_as_mode,value.run_as_user_id,
          JSON.stringify(value.access),JSON.stringify(value.default_assignments),req.params.id,req.user.companyId]);

      res.json({ success: true, data: result.rows[0] });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update dashboard" }); }

  });

  router.put("/dashboards/:id/users", authenticate, authorize("dashboard.share"), async (req, res) => {

    try {

      const current = await dashboard(req, req.params.id, "MANAGE");

      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });

      const userIds = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].slice(0, 100);

      const valid = userIds.length

        ? await db("SELECT id FROM users WHERE company_id=$1 AND id=ANY($2::uuid[]) AND active=true", [req.user.companyId, userIds])

        : { rows: [] };

      if (valid.rows.length !== userIds.length) return res.status(400).json({ success: false, message: "One or more users were not found" });

      await db("DELETE FROM dashboard_users WHERE dashboard_id=$1", [current.id]);

      for (const userId of userIds) await db("INSERT INTO dashboard_users(dashboard_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [current.id, userId]);

      await auditDashboard(req, userIds.length ? "dashboard.sharing.changed" : "dashboard.sharing.removed", current, { userIds });

      res.json({ success: true, data: { userIds } });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to share dashboard" }); }

  });

  router.put("/dashboards/:id/access", authenticate, authorize("dashboard.share"), async (req, res) => {
    try {
      const current = await dashboard(req, req.params.id, "MANAGE");
      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const access = validateDashboardDefinition({ name: current.name, components: current.components, access: req.body?.access || [] }).access;
      await validatePrincipals(req.user.companyId, access);
      const previous = structuredClone(current.access || []);
      const result = await db("UPDATE dashboards SET access=$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *", [JSON.stringify(access), current.id, req.user.companyId]);
      for (const entry of access) {
        const old = previous.find((item) => item.principal_type === entry.principal_type && String(item.principal_id) === String(entry.principal_id));
        if (!old) await auditDashboard(req, "dashboard.sharing.added", current, { principal_type: entry.principal_type, principal_id: entry.principal_id, access_level: entry.access_level });
        else if (old.access_level !== entry.access_level || old.active !== entry.active) await auditDashboard(req, "dashboard.sharing.changed", current, { principal_type: entry.principal_type, principal_id: entry.principal_id, from: old.access_level, to: entry.access_level, active: entry.active });
      }
      for (const old of previous) if (!access.some((entry) => entry.principal_type === old.principal_type && String(entry.principal_id) === String(old.principal_id))) {
        await auditDashboard(req, "dashboard.sharing.removed", current, { principal_type: old.principal_type, principal_id: old.principal_id });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update dashboard sharing" }); }
  });

  router.put("/dashboards/:id/defaults", authenticate, authorize("dashboard.assign_default"), async (req, res) => {
    try {
      const current = await dashboard(req, req.params.id, "MANAGE");
      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const assignments = validateDashboardDefinition({ name: current.name, components: current.components, default_assignments: req.body?.default_assignments || [] }).default_assignments;
      if (assignments.some((item) => item.principal_type === "COMPANY") && !(await hasPermission?.(req, "dashboard.manage"))) {
        return res.status(403).json({ success: false, message: "dashboard.manage is required to assign a company-wide default" });
      }
      await validatePrincipals(req.user.companyId, assignments);
      const previous = structuredClone(current.default_assignments || []);
      const result = await db("UPDATE dashboards SET default_assignments=$1::jsonb,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING *", [JSON.stringify(assignments), current.id, req.user.companyId]);
      for (const entry of assignments) {
        const old = previous.find((item) => item.principal_type === entry.principal_type && String(item.principal_id) === String(entry.principal_id));
        if (!old) await auditDashboard(req, "dashboard.default.assigned", current, { assignment: entry });
        else if (Number(old.priority) !== Number(entry.priority) || old.active !== entry.active) await auditDashboard(req, "dashboard.default.changed", current, { from: old, to: entry });
      }
      for (const old of previous) if (!assignments.some((entry) => entry.principal_type === old.principal_type && String(entry.principal_id) === String(old.principal_id))) {
        await auditDashboard(req, "dashboard.default.removed", current, { assignment: old });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update default assignments" }); }
  });

  router.put("/dashboards/:id/run-as", authenticate, authorize("dashboard.edit"), async (req, res) => {
    try {
      const current = await dashboard(req, req.params.id, "EDIT");
      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const mode = String(req.body?.run_as_mode || "VIEWER").toUpperCase();
      if (!["VIEWER","FIXED_USER"].includes(mode)) return res.status(400).json({ success:false,message:"Invalid dashboard run-as mode" });
      let runAsUserId = null;
      if (mode === "FIXED_USER") {
        if (!(await hasPermission?.(req, "dashboard.manage"))) return res.status(403).json({ success:false,message:"dashboard.manage is required to configure a fixed run-as user" });
        runAsUserId = String(req.body?.run_as_user_id || "").trim();
        if (!runAsUserId) return res.status(400).json({ success:false,message:"Select a fixed run-as user" });
        const user = await db("SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active=TRUE", [runAsUserId,req.user.companyId]);
        if (!user.rows.length) return res.status(400).json({ success:false,message:"Run-as user is unavailable" });
      }
      const previousMode = current.run_as_mode;
      const result = await db("UPDATE dashboards SET run_as_mode=$1,run_as_user_id=$2,updated_at=NOW() WHERE id=$3 AND company_id=$4 RETURNING *", [mode,runAsUserId,current.id,req.user.companyId]);
      if (previousMode !== mode || String(current.run_as_user_id||"") !== String(runAsUserId||"")) await auditDashboard(req, "dashboard.run_as.changed", current, { from: previousMode, to: mode, runAsUserId });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update dashboard data visibility" }); }
  });


  async function userCanViewDashboard(row, user) {
    const requestUser = { id:user.id, companyId:user.company_id, roleId:user.role_id };
    const principals = await loadDashboardPrincipalContext(db, requestUser);
    const level = await resolveDashboardAccess(db, row, requestUser, principals);
    return dashboardAccessAtLeast(level, "VIEW");
  }

  router.get("/dashboards/:id/subscriptions", authenticate, subscribePermission, async (req,res)=>{
    try {
      const current=await dashboard(req,req.params.id,"VIEW");
      if(!current)return res.status(404).json({success:false,message:"Dashboard not found"});
      const result=await db("SELECT * FROM dashboard_subscriptions WHERE dashboard_id=$1 AND company_id=$2 AND user_id=$3 ORDER BY updated_at DESC",[current.id,req.user.companyId,req.user.id]);
      res.json({success:true,data:result.rows});
    } catch(error){res.status(500).json({success:false,message:"Unable to load dashboard subscriptions"});}
  });

  router.post("/dashboards/:id/subscriptions", authenticate, subscribePermission, async (req,res)=>{
    try {
      const current=await dashboard(req,req.params.id,"VIEW");
      if(!current)return res.status(404).json({success:false,message:"Dashboard not found"});
      if(String(current.run_as_mode||"VIEWER").toUpperCase()!=="FIXED_USER")return res.status(400).json({success:false,message:"Dynamic dashboards cannot be subscribed. Configure a fixed run-as user first."});
      await assertDashboardSubscriptionCompatible(db,current);
      const definition=normalizeDashboardSubscription(req.body||{});
      if(!definition.recipientPrincipals.length)definition.recipientPrincipals=[{principalType:"USER",principalId:req.user.id}];
      const selfOnly=definition.recipientPrincipals.every((principal)=>principal.principalType==="USER"&&String(principal.principalId)===String(req.user.id));
      if(!selfOnly&&!(await hasPermission?.(req,"dashboard.subscribe.recipients")))return res.status(403).json({success:false,message:"dashboard.subscribe.recipients is required to add other recipients"});
      const recipients=await resolveReportSubscriptionRecipients(db,{companyId:req.user.companyId,principals:definition.recipientPrincipals});
      if(recipients.length>500)return res.status(400).json({success:false,message:"A dashboard subscription can contain up to 500 resolved recipients"});
      if(!recipients.length)return res.status(400).json({success:false,message:"Select at least one active recipient"});
      for(const recipient of recipients)if(!(await userCanViewDashboard(current,recipient)))return res.status(400).json({success:false,message:"One or more recipients cannot access this dashboard"});
      const result=await db("INSERT INTO dashboard_subscriptions(company_id,dashboard_id,user_id,definition,active) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *",[req.user.companyId,current.id,req.user.id,JSON.stringify(definition),definition.active]);
      res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to create dashboard subscription"});}
  });

  router.delete("/dashboards/:id/subscriptions/:subscriptionId", authenticate, subscribePermission, async (req,res)=>{
    try {
      const current=await dashboard(req,req.params.id,"VIEW");
      if(!current)return res.status(404).json({success:false,message:"Dashboard not found"});
      const result=await db("DELETE FROM dashboard_subscriptions WHERE id=$1 AND dashboard_id=$2 AND company_id=$3 AND user_id=$4 RETURNING id",[req.params.subscriptionId,current.id,req.user.companyId,req.user.id]);
      if(!result.rows.length)return res.status(404).json({success:false,message:"Dashboard subscription not found"});
      res.json({success:true});
    } catch(error){res.status(400).json({success:false,message:"Unable to remove dashboard subscription"});}
  });

  router.post("/dashboards/:id/duplicate", authenticate, createPermission, async (req, res) => {

    try {

      const current = await dashboard(req, req.params.id); if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });

      const result = await db(`INSERT INTO dashboards(company_id,created_by,name,description,components,filters)

        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [req.user.companyId, req.user.id, `${current.name} (Copy)`, current.description, JSON.stringify(current.components), JSON.stringify(current.filters)]);

      res.status(201).json({ success: true, data: result.rows[0] });

    } catch (error) { res.status(400).json({ success: false, message: "Unable to duplicate dashboard" }); }

  });

  router.delete("/dashboards/:id", authenticate, authorize("dashboard.manage"), async (req, res) => {

    try {

      const current = await dashboard(req, req.params.id, "MANAGE"); if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });

      await db("UPDATE dashboards SET archived_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2", [req.params.id, req.user.companyId]);

      await auditDashboard(req, "dashboard.deactivated", current);

      res.json({ success: true });

    } catch (error) { res.status(500).json({ success: false, message: "Unable to archive dashboard" }); }

  });

  router.post("/dashboards/:id/run", authenticate, viewPermission, async (req, res) => {
    try {
      const row = await dashboard(req, req.params.id, "VIEW");
      if (!row) return res.status(404).json({ success:false,message:"Dashboard not found" });
      const definition = validateDashboardDefinition({
        name: row.name,
        description: row.description,
        apiKey: row.api_key,
        components: row.components,
        filters: Array.isArray(req.body?.filters) ? req.body.filters : row.filters,
        global_filters: row.global_filters || [],
        responsive_layouts: row.responsive_layouts || {},
        run_as_mode: row.run_as_mode || "VIEWER",
        run_as_user_id: row.run_as_user_id || null,
        access: row.access || [],
        default_assignments: row.default_assignments || [],
      });
      let executionReq=req;
      if(definition.run_as_mode==="FIXED_USER"){
        const executionUser=await resolveDashboardExecutionUser(db,definition,req.user);
        executionReq=Object.create(req);
        executionReq.user=executionUser;
      }
      const globalValues=req.body?.globalFilterValues&&typeof req.body.globalFilterValues==="object"?req.body.globalFilterValues:{};
      const data=await dashboardExecution.runDashboardDefinition(executionReq,definition,{globalFilterValues:globalValues});
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to run this dashboard"});}
  });

  return router;

}
