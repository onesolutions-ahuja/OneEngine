/* Dashboard definitions are deliberately data-only. Reports remain the sole
 * SQL/query engine; this module only validates the dashboard composition. */
import { toSafeApiName } from "./platformMetadata.js";
import {
  normalizeDashboardGlobalFilters,
  normalizeResponsiveLayouts,
  normalizeRunAs,
} from "./analyticsManagement.js";

export const COMPONENT_TYPES = Object.freeze(["kpi", "chart", "pie", "donut", "bar", "line", "gauge", "funnel", "scatter", "combo", "table", "text", "image", "clock_widget", "calendar_widget", "weather_widget", "folder_card", "avatar_group", "modern_app_card", "modern_kpi_card", "modern_section_header", "modern_data_card", "icon_action_tile"]);
export const CHART_TYPES = Object.freeze(["bar", "line", "pie", "donut", "gauge", "funnel", "scatter", "combo"]);
export const KPI_SIZES = Object.freeze(["small", "medium", "large"]);
export const VALUE_FORMATS = Object.freeze(["number", "currency", "percent"]);
export const DATE_RANGES = Object.freeze([
  "all_time", "today", "yesterday", "this_week", "last_7_days", "this_month", "this_quarter", "fiscal_year",
]);
export const DASHBOARD_PRINCIPAL_TYPES = Object.freeze(["USER", "ROLE", "PUBLIC_GROUP", "COMPANY"]);
export const DASHBOARD_ACCESS_LEVELS = Object.freeze(["VIEW", "EDIT", "MANAGE"]);
export const DASHBOARD_RUN_AS_MODES = Object.freeze(["VIEWER", "FIXED_USER"]);

function normalizePrincipalType(value, fieldName) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!DASHBOARD_PRINCIPAL_TYPES.includes(normalized)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return normalized;
}

function normalizeAccessLevel(value, fieldName) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!DASHBOARD_ACCESS_LEVELS.includes(normalized)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return normalized;
}

export function normalizeDashboardAccess(entries = []) {
  if (!Array.isArray(entries)) return [];
  const normalized = [];
  for (const [index, item] of entries.entries()) {
    if (!item || typeof item !== "object") throw new Error(`Dashboard access row ${index + 1} must be an object`);
    const principalType = normalizePrincipalType(item.principal_type || item.principalType, "dashboard access principal type");
    const principalId = String(item.principal_id || item.principalId || "").trim();
    const accessLevel = normalizeAccessLevel(item.access_level || item.accessLevel, "dashboard access level");
    if (!principalId) throw new Error(`Dashboard access row ${index + 1} requires a principal id`);
    normalized.push({
      principal_type: principalType,
      principal_id: principalId,
      access_level: accessLevel,
      active: item.active !== false,
      created_by: item.created_by || item.createdBy || null,
      created_at: item.created_at || item.createdAt || null,
    });
  }
  return normalized;
}

export function normalizeDashboardDefaultAssignments(entries = []) {
  if (!Array.isArray(entries)) return [];
  const normalized = [];
  for (const [index, item] of entries.entries()) {
    if (!item || typeof item !== "object") throw new Error(`Dashboard default assignment row ${index + 1} must be an object`);
    const principalType = normalizePrincipalType(item.principal_type || item.principalType, "dashboard default principal type");
    const principalId = String(item.principal_id || item.principalId || "").trim();
    const priority = Number(item.priority ?? 100);
    if (!principalId) throw new Error(`Dashboard default assignment row ${index + 1} requires a principal id`);
    normalized.push({
      principal_type: principalType,
      principal_id: principalId,
      priority: Number.isFinite(priority) ? priority : 100,
      active: item.active !== false,
      created_by: item.created_by || item.createdBy || null,
      created_at: item.created_at || item.createdAt || null,
    });
  }
  return normalized;
}

export function normalizeDashboardIdentity(input = {}, fallbackName = "dashboard") {
  const name = String(input.name || fallbackName || "dashboard").trim();
  const rawKey = String(input.apiKey || input.api_key || input.metadataKey || input.key || "").trim();
  const apiKey = rawKey || toSafeApiName(name || fallbackName || "dashboard", "dashboard");
  return {
    name,
    apiKey: apiKey.replace(/-+/g, "_").slice(0, 100) || "dashboard",
  };
}

export const DASHBOARD_COLUMNS = 12;
export const clampWidth = (value) => Math.min(DASHBOARD_COLUMNS, Math.max(1, Number(value) || 1));
export const clampHeight = (value) => Math.min(12, Math.max(1, Number(value) || 1));

export function packLayout(layouts = []) {
  const placements = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const layout of layouts) {
    const w = clampWidth(layout?.w);
    const h = clampHeight(layout?.h);
    if (x + w > DASHBOARD_COLUMNS) { x = 0; y += rowHeight; rowHeight = 0; }
    placements.push({ x, y, w, h });
    x += w;
    rowHeight = Math.max(rowHeight, h);
  }
  return placements;
}

export function validateDashboardDefinition(input = {}) {
  const name = String(input.name || "").trim();
  if (!name || name.length > 150) throw new Error("A dashboard name up to 150 characters is required");
  const { apiKey } = normalizeDashboardIdentity(input, name);
  const runAs = normalizeRunAs({
    mode: input.run_as_mode || input.runAsMode || "VIEWER",
    userId: input.run_as_user_id || input.runAsUserId || null,
  });
  const access = normalizeDashboardAccess(input.access || input.sharing || input.dashboard_access || []);
  const defaultAssignments = normalizeDashboardDefaultAssignments(input.default_assignments || input.defaultAssignments || []);
  const components = Array.isArray(input.components) ? input.components.slice(0, 50) : [];
  if (components.filter((component) => String(component?.type || "") === "image").length > 3) throw new Error("A dashboard can contain up to 3 image widgets");
  const normalized = components.map((component, index) => {
    const type = String(component?.type || "");
    if (!COMPONENT_TYPES.includes(type)) throw new Error(`Invalid dashboard component at position ${index + 1}`);
    const config = component?.config && typeof component.config === "object" ? component.config : {};
    const modernComponents = new Set(["folder_card","avatar_group","modern_app_card","modern_kpi_card","modern_section_header","modern_data_card","icon_action_tile"]);
    const utilityComponents = new Set(["clock_widget","calendar_widget","weather_widget"]);
    const contentComponents = new Set(["text","image"]);
    if (!modernComponents.has(type) && !utilityComponents.has(type) && !contentComponents.has(type) && !config.reportId && !config.report) throw new Error(`Component ${index + 1} must reference a report`);
    if (config.report) {
      if (!String(config.report.dataSource || "").trim()) throw new Error(`Component ${index + 1} must select a data source`);
      if (!Array.isArray(config.report.fields) || !config.report.fields.length) throw new Error(`Component ${index + 1} must select at least one field`);
    }
    return {
      id: String(component.id || crypto.randomUUID()),
      type,
      title: String(component.title || "").slice(0,150),
      config: {
        reportId: config.reportId ? String(config.reportId) : null,
        report: config.report && typeof config.report === "object" ? {
          ...config.report,
          dataSource: String(config.report.dataSource || ""),
          objectId: config.report.objectId ? String(config.report.objectId) : null,
          fields: [...new Set((Array.isArray(config.report.fields) ? config.report.fields : []).map(String))],
          groupBy: [...new Set((Array.isArray(config.report.groupBy) ? config.report.groupBy : []).map(String))],
          rowGroups: [...new Set((Array.isArray(config.report.rowGroups) ? config.report.rowGroups : Array.isArray(config.report.groupBy) ? config.report.groupBy : []).map(String))],
          columnGroups: [...new Set((Array.isArray(config.report.columnGroups) ? config.report.columnGroups : []).map(String))],
          sort: Array.isArray(config.report.sort) ? config.report.sort : [],
          filters: Array.isArray(config.report.filters) ? config.report.filters.slice(0,50) : [],
          filterLogic: String(config.report.filterLogic || "all"),
        } : null,
        valueField: config.valueField ? String(config.valueField) : null,
        labelField: config.labelField ? String(config.labelField) : null,
        seriesField: config.seriesField ? String(config.seriesField) : null,
        xField: config.xField ? String(config.xField) : null,
        yFields: [...new Set((Array.isArray(config.yFields) ? config.yFields : config.valueField ? [config.valueField] : []).map(String))].slice(0,4),
        secondaryAxisFields: [...new Set((Array.isArray(config.secondaryAxisFields) ? config.secondaryAxisFields : []).map(String))].slice(0,4),
        chartType: CHART_TYPES.includes(config.chartType) ? config.chartType : null,
        format: VALUE_FORMATS.includes(config.format) ? config.format : "number",
        size: KPI_SIZES.includes(config.size) ? config.size : "medium",
        maxCategories: Math.min(100,Math.max(2,Number(config.maxCategories)||6)),
        limit: Math.min(200,Math.max(1,Number(config.limit)||12)),
        sort: Array.isArray(config.sort) ? config.sort.slice(0,10).map((item)=>({field:String(item?.field||""),direction:item?.direction==="asc"?"asc":"desc"})) : null,
        dateRange: DATE_RANGES.includes(config.dateRange) ? config.dateRange : null,
        orientation: config.orientation === "horizontal" ? "horizontal" : "vertical",
        stacked: config.stacked === true,
        normalizeToPercent: config.normalizeToPercent === true,
        showLegend: config.showLegend !== false,
        showValues: config.showValues === true,
        showGrid: config.showGrid !== false,
        referenceLines: Array.isArray(config.referenceLines) ? config.referenceLines.slice(0,10).map((line)=>({label:String(line?.label||"").slice(0,100),value:Number(line?.value||0),axis:line?.axis==="secondary"?"secondary":"primary"})) : [],
        showMarkers: config.showMarkers !== false,
        showTotal: config.showTotal !== false,
        targetMode: config.targetMode === "field" ? "field" : "fixed",
        targetValue: Number.isFinite(Number(config.targetValue)) ? Number(config.targetValue) : 100,
        targetField: config.targetField ? String(config.targetField) : null,
        conditionalFormatting: Array.isArray(config.conditionalFormatting) ? config.conditionalFormatting.slice(0,30) : [],
        drillAction: config.drillAction && typeof config.drillAction === "object" ? config.drillAction : null,
        content: type === "text" ? String(config.content || "").slice(0,5000) : null,
        imageUrl: type === "image" ? String(config.imageUrl || "").slice(0,2000) : null,
        altText: type === "image" ? String(config.altText || "").slice(0,300) : null,
        imageFit: type === "image" && ["contain","cover"].includes(String(config.imageFit)) ? String(config.imageFit) : "contain",
        linkUrl: type === "image" ? String(config.linkUrl || "").slice(0,2000) : null,
        timeZone: utilityComponents.has(type) ? String(config.timeZone || "").slice(0,100) : null,
        hour12: type === "clock_widget" ? config.hour12 !== false : null,
        showSeconds: type === "clock_widget" ? config.showSeconds === true : null,
        showDate: type === "clock_widget" ? config.showDate !== false : null,
        showWeekday: type === "calendar_widget" ? config.showWeekday !== false : null,
        showMonth: type === "calendar_widget" ? config.showMonth !== false : null,
        location: type === "weather_widget" ? String(config.location || "").slice(0,160) : null,
        unit: type === "weather_widget" && ["C","F"].includes(String(config.unit||"").toUpperCase()) ? String(config.unit).toUpperCase() : "C",
        temperature: type === "weather_widget" && config.temperature !== undefined && config.temperature !== null ? String(config.temperature).slice(0,30) : null,
        condition: type === "weather_widget" ? String(config.condition || "").slice(0,120) : null,
      },
      layout: {
        x: Math.max(0,Number(component.layout?.x)||0),
        y: Math.max(0,Number(component.layout?.y)||0),
        w: Math.min(12,Math.max(1,Number(component.layout?.w)||4)),
        h: Math.min(12,Math.max(1,Number(component.layout?.h)||1)),
      },
    };
  });
  const packed=packLayout(normalized.map((entry)=>entry.layout));
  normalized.forEach((entry,index)=>{entry.layout=packed[index];});
  const filters=Array.isArray(input.filters)?input.filters.slice(0,20).map((filter)=>{
    const field=String(filter?.field||"").trim();
    const operator=String(filter?.operator||"equals").trim();
    if(!field || !operator) throw new Error("Dashboard filters require a metadata field and operator");
    return {field,operator,value:filter.value};
  }):[];
  return {
    name,
    apiKey,
    description:String(input.description||"").slice(0,500),
    run_as_mode:runAs.mode,
    run_as_user_id:runAs.userId,
    access,
    default_assignments:defaultAssignments,
    components:normalized,
    filters,
    global_filters:normalizeDashboardGlobalFilters(input.global_filters||input.globalFilters||[]),
    responsive_layouts:normalizeResponsiveLayouts(input.responsive_layouts||input.responsiveLayouts||{}),
  };
}

/*
 * The shipped default Dashboard. It is a DASHBOARD DEFINITION, not Dashboard
 * page markup: every entry is a generic component (kpi / pie / donut / bar)
 * bound to a saved report by id. The same rows are editable, reorderable and
 * removable in Dashboard Builder, and the Dashboard page renders whatever the
 * saved definition says. Changing a component's reportId, metric, grouping or
 * date range changes the rendered dashboard without touching React source.
 */
export const DEFAULT_DASHBOARD_DEFINITION = Object.freeze({
  name: "Dashboard",
  description: "",
  run_as_mode: "VIEWER",
  access: [],
  default_assignments: [],
  filters: [],
  components: [],
});

export function mergeDashboardFilters(reportDefinition, dashboardFilters = []) {
  const filters = Array.isArray(reportDefinition?.filters) ? [...reportDefinition.filters] : [];
  for (const filter of dashboardFilters) {
    if (filter.field === "date") filters.push({ field: "date", operator: filter.operator || filter.value || "this_week" });
    if (filter.field === "store" && filter.value) {
      const values = Array.isArray(filter.value) ? filter.value.filter(Boolean) : [filter.value].filter(Boolean);
      if (values.length) filters.push({
        field: "store",
        operator: values.length > 1 || filter.operator === "in" ? "in" : "equals",
        value: values.length > 1 || filter.operator === "in" ? values : values[0],
      });
    }
  }
  return { ...reportDefinition, filters };
}
