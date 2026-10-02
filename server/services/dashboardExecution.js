import { buildCustomSalesQuery, customDateRange, validateCustomReportDefinition } from "./reportSalesDefinition.js";
import { buildPlatformObjectQuery } from "./reportableSources.js";
import { DATE_RANGES, mergeDashboardFilters } from "./dashboardBuilder.js";
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
      return mergeDashboardFilters(validateCustomReportDefinition(savedReport.definition), dashboardFilters);
    }

    if (config.report && typeof config.report === "object") {
      const definition = validateCustomReportDefinition(config.report);
      const merged = mergeDashboardFilters(definition, dashboardFilters);
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

      if (definition.dataSource === "platform_object") {
        const context = await loadPlatformReportContext(db, req, definition.objectId);
        if (!context.object) throw new Error("Data source unavailable");

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
        if (!requestedStores.length && scopedStoreId && (!canAccessStore || !(await canAccessStore(req.user, scopedStoreId)))) {
          throw new Error("You do not have access to the current store");
        }
        if (context.object.store_scoped === true && !scopedStoreId) throw new Error("A store assignment is required to run this dashboard");

        const platformDefinition = {
          ...definition,
          filters: definition.filters.filter((filter) => filter.field !== "store"),
        };
        built = buildPlatformObjectQuery(platformDefinition, context.object, context.fields, req.user.companyId, 1000, {
          storeId: scopedStoreId,
          visibilitySql: context.visibilitySql,
          visibilityParams: context.visibilityParams,
        }, context.relationships);
        columns = [
          ...definition.fields,
          ...definition.summaries.map((summary) => `${String(summary.aggregate).toLowerCase()}_${summary.field}`),
        ];
      } else {
        if (!hasPermission || !(await hasPermission(req, "reports.custom.view"))) {
          throw Object.assign(new Error("You do not have permission to view this dashboard data source"), { status: 403 });
        }
        const requestedStores = [...new Set([
          ...(definition.storeIds || []),
          ...definition.filters
            .filter((filter) => filter.field === "store")
            .flatMap((filter) => Array.isArray(filter.value) ? filter.value : [filter.value])
            .filter(Boolean),
        ].map(String))];
        for (const storeId of requestedStores) {
          if (!canAccessStore || !(await canAccessStore(req.user, storeId))) throw new Error("You do not have access to one or more stores");
        }
        if (!requestedStores.length && req.user.storeId && (!canAccessStore || !(await canAccessStore(req.user, String(req.user.storeId))))) {
          throw new Error("You do not have access to the current store");
        }
        if (!requestedStores.length && !req.user.storeId && !(canViewCompanyCustomers && await canViewCompanyCustomers(req.user))) {
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
