import { normalizeAdvancedReportDefinition } from "./reportAnalyticsDefinition.js";
import { buildPlatformObjectQuery } from "./reportableSources.js";
import { mergeDashboardFilters } from "./dashboardBuilder.js";
import { applyDashboardGlobalFilters } from "./analyticsManagement.js";
import { loadPlatformReportContext } from "./platformReportSecurity.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createDashboardExecution({ db, canViewCompanyCustomers, canAccessStore, hasPermission } = {}) {
  if (typeof db !== "function") throw new Error("Dashboard execution requires a database");

  async function resolveComponentReport(req, component, dashboardFilters = []) {
    const config = component?.config || {};
    const reportId = String(config.reportId || "").trim();

    if (reportId && UUID_RE.test(reportId)) {
      const report = await db(
        "SELECT id,created_by,definition FROM custom_reports WHERE id=$1 AND company_id=$2 AND archived_at IS NULL",
        [reportId, req.user.companyId]
      );
      if (!report.rows[0]) throw new Error("Saved report unavailable");
      const savedReport = report.rows[0];
      const companyAdmin = canViewCompanyCustomers ? await canViewCompanyCustomers(req.user) : false;
      if (!companyAdmin && String(savedReport.created_by) !== String(req.user.id)) {
        const accessResult = await db(
          "SELECT 1 FROM custom_report_users WHERE report_id=$1 AND user_id=$2",
          [savedReport.id, req.user.id]
        );
        if (!accessResult.rows.length) throw new Error("Saved report unavailable");
      }
      return mergeDashboardFilters(normalizeAdvancedReportDefinition(savedReport.definition), dashboardFilters);
    }

    if (reportId) throw new Error(`Unknown dashboard report reference: ${reportId}`);
    throw new Error("No report configured");
  }

  async function runComponent(req, component, dashboardFilters = []) {
    if (component.type === "text") return { id: component.id, type: component.type, data: { content: component.config?.content || "" } };
    if (component.type === "image") return { id: component.id, type: component.type, data: { config: component.config || {} } };
    if (["clock_widget","calendar_widget","weather_widget"].includes(component.type)) {
      return { id: component.id, type: component.type, data: { config: component.config || {} } };
    }
    if (["folder_card","avatar_group","modern_app_card","modern_kpi_card","modern_section_header","modern_data_card","icon_action_tile"].includes(component.type)) {
      return { id: component.id, type: component.type, data: { config: component.config || {} } };
    }

    try {
      const definition = await resolveComponentReport(req, component, dashboardFilters);
      let built;
      let columns;

      if (definition.dataSource && definition.dataSource !== "platform_object") {
        throw new Error("Dashboard report data source is not metadata-backed");
      }
      const context = await loadPlatformReportContext(db, req, definition.objectId);
      if (!context.object) throw new Error("Data source unavailable");
      const scopedStoreId = req.user.storeId ? String(req.user.storeId) : null;
      if (context.object.store_scoped === true && !scopedStoreId) throw new Error("A store assignment is required to run this dashboard");
      if (scopedStoreId && canAccessStore && !(await canAccessStore(req.user, scopedStoreId))) {
        throw new Error("You do not have access to the current store");
      }
      built = buildPlatformObjectQuery(
        { ...definition, dataSource:"platform_object" },
        context.object,
        context.fields,
        req.user.companyId,
        1000,
        {
          storeId: scopedStoreId,
          visibilitySql: context.visibilitySql,
          visibilityParams: context.visibilityParams,
        },
        context.relationships
      );
      columns = [
        ...definition.fields,
        ...definition.summaries.map((summary) => `${String(summary.aggregate).toLowerCase()}_${summary.field}`),
      ];

      const result = await db(built.sql, built.params);
      return { id: component.id, type: component.type, data: { columns, rows: result.rows } };
    } catch (error) {
      return {
        id: component.id,
        type: component.type,
        error: error.status === 403 ? "You do not have permission to view this data" : error.message || "Unable to load this component",
      };
    }
  }

  async function runDashboardDefinition(req, definition, { globalFilterValues = {}, ignoreGlobalFilters = false } = {}) {
    const components = ignoreGlobalFilters
      ? (definition.components || [])
      : (definition.components || []).map((component) => applyDashboardGlobalFilters(component, definition.global_filters || [], globalFilterValues || {}));
    const results = await Promise.all(components.map((component) => runComponent(req, component, definition.filters || [])));
    return { definition, components: results };
  }

  return { resolveComponentReport, runComponent, runDashboardDefinition };
}
