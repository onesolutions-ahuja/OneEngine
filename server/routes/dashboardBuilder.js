import express from "express";

import { buildCustomSalesQuery, validateCustomReportDefinition } from "./reports.js";

import { buildPlatformObjectQuery } from "../services/reportableSources.js";

import { toSafeApiName } from "../services/platformMetadata.js";
import { DATE_RANGES, DEFAULT_DASHBOARD_DEFINITION, mergeDashboardFilters, normalizeDashboardIdentity, validateDashboardDefinition } from "../services/dashboardBuilder.js";
import { dashboardAccessAtLeast, dashboardPrincipalExists, loadDashboardPrincipalContext, resolveDashboardAccess, resolveDefaultDashboard } from "../services/dashboardSecurity.js";
import { loadPlatformReportContext } from "../services/platformReportSecurity.js";



function customDateRange(filters = []) {

  const dateFilter = filters.find((filter) => filter && filter.field === "date");

  const operator = dateFilter?.operator || "this_week";

  const now = new Date();

  const iso = (date) => date.toISOString().slice(0, 10);

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (operator === "custom") return { from: dateFilter.from || dateFilter.dateFrom || null, to: dateFilter.to || dateFilter.dateTo || null };

  if (operator === "today") return { from: iso(start), to: iso(start) };

  if (operator === "yesterday") { start.setUTCDate(start.getUTCDate() - 1); return { from: iso(start), to: iso(start) }; }

  if (operator === "last_7_days") { start.setUTCDate(start.getUTCDate() - 6); return { from: iso(start), to: iso(new Date()) }; }

  if (operator === "this_month") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(new Date()) };

  if (operator === "this_quarter") {

    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;

    return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1))), to: iso(new Date()) };

  }

  if (operator === "fiscal_year") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(new Date()) };

  const day = start.getUTCDay() || 7;

  start.setUTCDate(start.getUTCDate() - day + 1);

  return { from: iso(start), to: iso(new Date()) };

}



export default function createDashboardBuilderRouter({ authenticate, authorize, db, canViewCompanyCustomers, canAccessStore, writeAudit, hasPermission }) {

  const router = express.Router();

  const viewPermission = authorize("dashboard.view");
  const createPermission = authorize("dashboard.create");
  const editPermission = authorize("dashboard.edit");
  async function platformReportContext(req, objectId) {
    return loadPlatformReportContext(db, req, objectId);
  }



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



  /* Resolve one component's query. A component is either bound to a SAVED

     report (reportId, the original contract) or carries an INLINE report

     definition that Dashboard Builder configures. Both go through the same

     validateCustomReportDefinition + buildCustomSalesQuery /

     buildPlatformObjectQuery pipeline, so there is exactly one query engine. */

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async function resolveComponentReport(req, component, dashboardFilters) {
    const config = component?.config || {};
    const reportId = String(config.reportId || "").trim();

    // Persisted custom reports use UUID primary keys. Shipped/default dashboard
    // components may carry symbolic keys such as "report_top_product" while
    // also containing the complete inline report definition. Never send those
    // symbolic keys to PostgreSQL's UUID column.
    if (reportId && UUID_RE.test(reportId)) {
      const report = await db(
        "SELECT id, created_by, definition FROM custom_reports WHERE id=$1 AND company_id=$2 AND archived_at IS NULL",
        [reportId, req.user.companyId],
      );

      if (!report.rows[0]) throw new Error("Saved report unavailable");

      const savedReport = report.rows[0];
      const companyAdmin = canViewCompanyCustomers
        ? await canViewCompanyCustomers(req.user)
        : false;

      if (!companyAdmin && String(savedReport.created_by) !== String(req.user.id)) {
        const accessResult = await db(
          "SELECT 1 FROM custom_report_users WHERE report_id=$1 AND user_id=$2",
          [savedReport.id, req.user.id],
        );
        if (!accessResult.rows.length) throw new Error("Saved report unavailable");
      }

      const savedDefinition = validateCustomReportDefinition(savedReport.definition);
      return mergeDashboardFilters(savedDefinition, dashboardFilters);
    }

    // Inline report definitions are authoritative for shipped/default components
    // and for unsaved Builder previews. This also handles symbolic reportId keys.
    if (config.report && typeof config.report === "object") {
      const definition = validateCustomReportDefinition(config.report);
      const merged = mergeDashboardFilters(definition, dashboardFilters);

      // The component-level date range applies unless a dashboard-level date
      // filter explicitly overrides it.
      if (
        config.dateRange &&
        DATE_RANGES.includes(config.dateRange) &&
        !dashboardFilters.some((filter) => filter && filter.field === "date")
      ) {
        merged.filters = [
          { field: "date", operator: config.dateRange },
          ...merged.filters.filter((filter) => filter && filter.field !== "date"),
        ];
      }

      return merged;
    }

    if (reportId) {
      throw new Error(`Unknown dashboard report reference: ${reportId}`);
    }

    throw new Error("No report configured");
  }


  async function runComponent(req, component, dashboardFilters) {

    if (component.type === "text") return { id: component.id, type: component.type, data: { content: component.config.content } };
    if (["clock_widget", "calendar_widget", "weather_widget"].includes(component.type)) {
      return { id: component.id, type: component.type, data: { config: component.config || {} } };
    }

    try {

      const definition = await resolveComponentReport(req, component, dashboardFilters);

      let built;

      let columns;

      if (definition.dataSource === "platform_object") {

        const context = await platformReportContext(req, definition.objectId);

        if (!context.object) throw new Error("Data source unavailable");

        // Dashboard store selection is security scope, not a reportable object
        // field. Validate it through the same user_stores access check used by
        // sales dashboards, then remove the synthetic filter before the generic
        // platform report validator sees it.
        const requestedStores = [...new Set([
          ...(definition.storeIds || []),
          ...definition.filters
            .filter((filter) => filter.field === "store")
            .flatMap((filter) => Array.isArray(filter.value) ? filter.value : [filter.value])
            .filter(Boolean),
        ].map(String))];
        if (requestedStores.length > 1) throw new Error("Platform-object dashboard components support one active store at a time");
        for (const storeId of requestedStores) {
          if (!canAccessStore || !(await canAccessStore(req.user, storeId))) throw new Error("You do not have access to one or more stores");
        }
        const scopedStoreId = requestedStores[0] || (req.user.storeId ? String(req.user.storeId) : null);
        if (!requestedStores.length && scopedStoreId
          && (!canAccessStore || !(await canAccessStore(req.user, scopedStoreId)))) {
          throw new Error("You do not have access to the current store");
        }
        if (context.object.store_scoped === true && !scopedStoreId) {
          throw new Error("A store assignment is required to run this dashboard");
        }
        const platformDefinition = {
          ...definition,
          filters: definition.filters.filter((filter) => filter.field !== "store"),
        };

        built = buildPlatformObjectQuery(platformDefinition, context.object, context.fields, req.user.companyId, 1000, {
          storeId: scopedStoreId,
          visibilitySql: context.visibilitySql,
          visibilityParams: context.visibilityParams,
        }, context.relationships);

        /* Platform Object reports alias each aggregate as `<aggregate>_<field>`.

           Return the same column keys the runtime reads back so the generic

           renderer needs no knowledge of the aggregation. */

        columns = [

          ...definition.fields,

          ...definition.summaries.map((summary) => `${String(summary.aggregate).toLowerCase()}_${summary.field}`),

        ];

      } else {
        if (!hasPermission || !(await hasPermission(req, "reports.custom.view"))) {
          throw Object.assign(new Error("You do not have permission to view this dashboard data source"), { status: 403 });
        }

        const requestedStores = [...new Set([...(definition.storeIds || []), ...definition.filters.filter((filter) => filter.field === "store").flatMap((filter) => Array.isArray(filter.value) ? filter.value : [filter.value]).filter(Boolean)].map(String))];
        for (const storeId of requestedStores) {
          if (!canAccessStore || !(await canAccessStore(req.user, storeId))) throw new Error("You do not have access to one or more stores");
        }
        if (!requestedStores.length && req.user.storeId
          && (!canAccessStore || !(await canAccessStore(req.user, String(req.user.storeId))))) {
          throw new Error("You do not have access to the current store");
        }
        if (!requestedStores.length && !req.user.storeId
          && !(canViewCompanyCustomers && await canViewCompanyCustomers(req.user))) {
          throw new Error("A store assignment is required to run this dashboard");
        }
        const stores = requestedStores.length ? requestedStores : (req.user.storeId ? [String(req.user.storeId)] : []);

        built = buildCustomSalesQuery(definition, customDateRange(definition.filters), stores, definition.userIds || []);

        built.params[2] = req.user.companyId;

        columns = definition.fields;

      }

      const result = await db(built.sql, built.params);

      return { id: component.id, type: component.type, data: { columns, rows: result.rows } };

    } catch (error) {
      console.error("Dashboard component error:", {
        componentId: component.id,
        componentType: component.type,
        config: component.config,
        error: error.message,
        stack: error.stack,
      });

      return {
        id: component.id,
        type: component.type,
        error: error.status === 403 ? "You do not have permission to view this data" : error.message || "Unable to load this component",
      };
    }
  }



  router.get("/dashboards/default", authenticate, viewPermission, async (req, res) => {
    try {
      const resolved = await resolveDefaultDashboard(db, req.user);
      if (resolved) {
        return res.json({ success: true, data: validateDashboardDefinition({
          name: resolved.dashboard.name, description: resolved.dashboard.description,
          components: resolved.dashboard.components, filters: resolved.dashboard.filters,
          run_as_mode: resolved.dashboard.run_as_mode,
        }) });
      }
      res.json({ success: true, data: validateDashboardDefinition(structuredClone(DEFAULT_DASHBOARD_DEFINITION)) });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to resolve the default dashboard" }); }
  });

  /* Run a definition that is not (yet) saved — the Dashboard page uses this to

     render the default definition through the identical engine the saved

     dashboards use. */

  router.post("/dashboards/run", authenticate, viewPermission, async (req, res) => {

    try {

      const definition = validateDashboardDefinition(req.body || {});

      const results = await Promise.all((definition.components || []).map((component) => runComponent(req, component, definition.filters || [])));

      res.json({ success: true, data: { definition, components: results } });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to run this dashboard" }); }

  });

  router.get("/dashboards", authenticate, viewPermission, async (req, res) => {

    try { res.json({ success: true, data: (await visible(req)).rows }); }

    catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboards" }); }

  });

  router.get("/dashboards/:id", authenticate, viewPermission, async (req, res) => {

    try { const row = await dashboard(req, req.params.id); if (!row) return res.status(404).json({ success: false, message: "Dashboard not found" }); res.json({ success: true, data: row }); }

    catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboard" }); }

  });

  router.get("/dashboards/principals", authenticate, authorize("dashboard.manage", "dashboard.share", "dashboard.assign_default"), async (req, res) => {
    try {
      const [users, roles, groups] = await Promise.all([
        db("SELECT id,username,full_name FROM users WHERE company_id=$1 AND active=true ORDER BY full_name,username", [req.user.companyId]),
        db("SELECT id,name,parent_role_id FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
        db("SELECT id,name,api_key FROM platform_public_groups WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
      ]);
      res.json({ success: true, data: { users: users.rows, roles: roles.rows, groups: groups.rows, currentUserId: req.user.id, company: { id: req.user.companyId, name: req.user.companyName || "Current company" } } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load dashboard principals" }); }
  });

  router.post("/dashboards", authenticate, createPermission, async (req, res) => {

    try {

      const value = validateDashboardDefinition({ ...req.body, access: [], default_assignments: [], run_as_mode: "VIEWER" });
      const identity = normalizeDashboardIdentity(value, value.name);
      const duplicate = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND lower(name)=lower($2) LIMIT 1", [req.user.companyId, value.name]);

      if (duplicate.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this name already exists." });

      const keyConflict = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND lower(api_key)=lower($2) LIMIT 1", [req.user.companyId, identity.apiKey]);
      if (keyConflict.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this API key already exists." });

      const result = await db(`INSERT INTO dashboards(company_id,created_by,name,description,api_key,components,filters,run_as_mode,access,default_assignments)

        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb) RETURNING *`,

        [req.user.companyId, req.user.id, value.name, value.description, identity.apiKey, JSON.stringify(value.components), JSON.stringify(value.filters), value.run_as_mode, JSON.stringify(value.access), JSON.stringify(value.default_assignments)]);

      res.status(201).json({ success: true, data: result.rows[0] });

    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create dashboard" }); }

  });

  router.put("/dashboards/:id", authenticate, editPermission, async (req, res) => {

    try {

      const current = await dashboard(req, req.params.id, "EDIT");

      if (!current) return res.status(404).json({ success: false, message: "Dashboard not found" });

      const value = validateDashboardDefinition({ ...req.body, name: req.body.name || current.name,
        apiKey: req.body.apiKey || req.body.api_key || req.body.metadataKey || current.api_key || current.apiKey || toSafeApiName(req.body.name || current.name, "dashboard"),
        access: current.access || [], default_assignments: current.default_assignments || [], run_as_mode: current.run_as_mode || "VIEWER" });
      const identity = normalizeDashboardIdentity(value, current.name);
      const duplicateName = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND id<>$2 AND lower(name)=lower($3) LIMIT 1", [req.user.companyId, current.id, value.name]);

      if (duplicateName.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this name already exists." });

      const keyConflict = await db("SELECT id FROM dashboards WHERE company_id=$1 AND archived_at IS NULL AND id<>$2 AND lower(api_key)=lower($3) LIMIT 1", [req.user.companyId, current.id, identity.apiKey]);
      if (keyConflict.rows[0]) return res.status(409).json({ success: false, message: "A dashboard with this API key already exists." });

      const result = await db(`UPDATE dashboards SET name=$1,description=$2,api_key=$3,components=$4::jsonb,filters=$5::jsonb,run_as_mode=$6,access=$7::jsonb,default_assignments=$8::jsonb,updated_at=NOW()

        WHERE id=$9 AND company_id=$10 RETURNING *`, [value.name, value.description, identity.apiKey, JSON.stringify(value.components), JSON.stringify(value.filters), value.run_as_mode, JSON.stringify(value.access), JSON.stringify(value.default_assignments), req.params.id, req.user.companyId]);

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
      if (String(req.body?.run_as_mode || "VIEWER").toUpperCase() !== "VIEWER") return res.status(400).json({ success: false, message: "Only Run as Dashboard Viewer is supported" });
      const previousMode = current.run_as_mode;
      const result = await db("UPDATE dashboards SET run_as_mode='VIEWER',updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *", [current.id, req.user.companyId]);
      if (previousMode !== "VIEWER") await auditDashboard(req, "dashboard.run_as.changed", current, { from: previousMode, to: "VIEWER" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update dashboard data visibility" }); }
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
      if (!row) return res.status(404).json({ success: false, message: "Dashboard not found" });
      const definition = validateDashboardDefinition({ name: row.name, description: row.description, components: row.components, filters: row.filters, run_as_mode: "VIEWER" });
      const results = await Promise.all((definition.components || []).map((component) => runComponent(req, component, definition.filters || [])));
      res.json({ success: true, data: { definition, components: results } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to run this dashboard" }); }
  });

  return router;

}
