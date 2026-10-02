/* Dashboard definitions are deliberately data-only. Reports remain the sole
 * SQL/query engine; this module only validates the dashboard composition. */
import { toSafeApiName } from "./platformMetadata.js";
import {
  normalizeDashboardGlobalFilters,
  normalizeResponsiveLayouts,
  normalizeRunAs,
} from "./analyticsManagement.js";

export const COMPONENT_TYPES = Object.freeze(["kpi", "chart", "pie", "donut", "bar", "line", "gauge", "funnel", "scatter", "table", "text", "image", "clock_widget", "calendar_widget", "weather_widget", "folder_card", "avatar_group", "modern_app_card", "modern_kpi_card", "modern_section_header", "modern_data_card", "icon_action_tile"]);
export const CHART_TYPES = Object.freeze(["bar", "line", "pie", "donut", "gauge", "funnel", "scatter"]);
export const KPI_SIZES = Object.freeze(["small", "medium", "large"]);
export const VALUE_FORMATS = Object.freeze(["number", "currency", "percent"]);
export const DATE_RANGES = Object.freeze([
  "all_time", "today", "yesterday", "this_week", "last_7_days", "this_month", "this_quarter", "fiscal_year",
]);
export const FILTER_FIELDS = Object.freeze(["store", "date"]);
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

/*
 * The canonical dashboard component vocabulary. Every entry is GENERIC: it
 * describes a rendering shape plus the configuration an administrator supplies
 * (a saved report or an inline report definition reusing the existing custom
 * report engine). No Sales-, Product- or payment-specific component exists.
 */
export const DASHBOARD_COMPONENTS = Object.freeze([
  { key: "kpi", label: "Metric / KPI", kind: "metric", valueField: true, labelField: true, formats: VALUE_FORMATS, sizes: KPI_SIZES },
  { key: "pie", label: "Pie Chart", kind: "chart", categoryField: true, valueField: true, maxCategories: true },
  { key: "donut", label: "Donut Chart", kind: "chart", categoryField: true, valueField: true, maxCategories: true },
  { key: "bar", label: "Bar Chart", kind: "chart", categoryField: true, valueField: true, sort: true, limit: true },
  { key: "table", label: "Table / List", kind: "record" },
  { key: "text", label: "Text", kind: "content" },
  { key: "image", label: "Image", kind: "content" },
  { key: "clock_widget", label: "Clock / Watch", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "calendar_widget", label: "Calendar", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "weather_widget", label: "Weather", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "folder_card", label: "Folder Card", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "avatar_group", label: "Avatar Group", kind: "avatar", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "modern_app_card", label: "Modern App Card", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "modern_kpi_card", label: "Modern KPI Card", kind: "metric", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "modern_section_header", label: "Modern Section Header", kind: "section", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "modern_data_card", label: "Modern Data Card", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
  { key: "icon_action_tile", label: "Action Tile", kind: "action", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"] },
]);
const DASHBOARD_COMPONENT_MAP = new Map(DASHBOARD_COMPONENTS.map((component) => [component.key, component]));

export function getDashboardComponent(key) {
  return DASHBOARD_COMPONENT_MAP.get(String(key || "")) || null;
}

/*
 * THE dashboard layout algorithm. This is deliberately duplicated in
 * src/components/dashboard/platformDashboard.js (`packLayout`) because that
 * module is also imported by browser code and must not pull server modules into
 * the bundle. Both implementations are byte-for-byte equivalent and a unit
 * test asserts they agree, so the Builder canvas and the persisted metadata can
 * never drift.
 */
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
      if (config.report.dataSource && !["sales","platform_object"].includes(String(config.report.dataSource))) throw new Error(`Component ${index + 1} uses an unsupported data source`);
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
          dataSource: ["sales","platform_object"].includes(config.report.dataSource) ? config.report.dataSource : "sales",
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
        chartType: CHART_TYPES.includes(config.chartType) ? config.chartType : null,
        format: VALUE_FORMATS.includes(config.format) ? config.format : "number",
        size: KPI_SIZES.includes(config.size) ? config.size : "medium",
        maxCategories: Math.min(100,Math.max(2,Number(config.maxCategories)||6)),
        limit: Math.min(200,Math.max(1,Number(config.limit)||12)),
        sort: Array.isArray(config.sort) ? config.sort.slice(0,10).map((item)=>({field:String(item?.field||""),direction:item?.direction==="asc"?"asc":"desc"})) : null,
        dateRange: DATE_RANGES.includes(config.dateRange) ? config.dateRange : null,
        orientation: config.orientation === "horizontal" ? "horizontal" : "vertical",
        stacked: config.stacked === true,
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
    const field=String(filter?.field||"");
    if(!FILTER_FIELDS.includes(field)) throw new Error("Invalid dashboard filter");
    return {field,operator:String(filter.operator||"equals"),value:filter.value};
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
const salesDatasource = { dataSource: "sales", fields: [], groupBy: [], sort: [], filters: [], filterLogic: "all" };

export const DEFAULT_DASHBOARD_DEFINITION = Object.freeze({
  name: "Business Overview",
  description: "Default configurable dashboard: KPIs and visualisations bound to saved reports.",
  run_as_mode: "VIEWER",
  access: [],
  default_assignments: [],
  filters: [],
  components: [
    { id: "default-clock", type: "clock_widget", title: "Clock", config: { showDate: true, showSeconds: false, hour12: false }, layout: { x: 0, y: 0, w: 3, h: 1 } },
    { id: "default-kpi-total-sales", type: "kpi", title: "Total Sales", config: { reportId: "report_total_sales", valueField: "net_sales", format: "currency", size: "medium", dateRange: "all_time", report: { ...salesDatasource, fields: ["net_sales"] } }, layout: { x: 3, y: 0, w: 3, h: 1 } },
    { id: "default-kpi-quarter-sales", type: "kpi", title: "Quarter Sales", config: { reportId: "report_quarter_sales", valueField: "net_sales", format: "currency", size: "medium", dateRange: "this_quarter", report: { ...salesDatasource, fields: ["net_sales"] } }, layout: { x: 6, y: 0, w: 3, h: 1 } },
    { id: "default-kpi-annual-sales", type: "kpi", title: "Annual Sales", config: { reportId: "report_annual_sales", valueField: "net_sales", format: "currency", size: "medium", dateRange: "fiscal_year", report: { ...salesDatasource, fields: ["net_sales"] } }, layout: { x: 9, y: 0, w: 3, h: 1 } },
    { id: "default-kpi-top-product", type: "kpi", title: "Most Selling Product", config: { reportId: "report_top_product", valueField: "quantity", labelField: "product", format: "number", size: "medium", dateRange: "fiscal_year", report: { ...salesDatasource, fields: ["product", "quantity"], groupBy: ["product"], sort: [{ field: "quantity", direction: "desc" }] } }, layout: { x: 0, y: 1, w: 4, h: 3 } },
    { id: "default-pie-category", type: "pie", title: "Sales by Category", config: { reportId: "report_sales_by_category", valueField: "net_sales", labelField: "category", maxCategories: 6, dateRange: "fiscal_year", report: { ...salesDatasource, fields: ["category", "net_sales"], groupBy: ["category"], sort: [{ field: "net_sales", direction: "desc" }] } }, layout: { x: 4, y: 1, w: 4, h: 3 } },
    { id: "default-donut-payment", type: "donut", title: "Payment Method Mix", config: { reportId: "report_payment_mix", valueField: "total", labelField: "method", maxCategories: 6, dateRange: "fiscal_year", report: { ...salesDatasource, fields: ["method", "total"], groupBy: ["method"], sort: [{ field: "total", direction: "desc" }] } }, layout: { x: 8, y: 1, w: 4, h: 3 } },
    { id: "default-bar-period", type: "bar", title: "Sales by Period", config: { reportId: "report_sales_by_period", valueField: "net_sales", labelField: "date", limit: 12, dateRange: "last_7_days", report: { ...salesDatasource, fields: ["date", "net_sales"], groupBy: ["date"], sort: [{ field: "date", direction: "asc" }] } }, layout: { x: 0, y: 4, w: 12, h: 4 } },
  ],
});

/* The custom-report fields a Dashboard Builder administrator may pick from for
   the built-in sales datasource. Reuses the reporting engine's field list. */
export const DASHBOARD_SALES_FIELDS = Object.freeze([
  { key: "date", label: "Date", groupable: true },
  { key: "store", label: "Store", groupable: true },
  { key: "user", label: "Operator", groupable: true },
  { key: "product", label: "Product", groupable: true },
  { key: "sku", label: "SKU", groupable: true },
  { key: "category", label: "Category", groupable: true },
  { key: "method", label: "Payment method", groupable: true },
  { key: "quantity", label: "Quantity sold", aggregate: true },
  { key: "gross_sales", label: "Gross sales", aggregate: true },
  { key: "net_sales", label: "Net sales", aggregate: true },
  { key: "vat", label: "VAT", aggregate: true },
  { key: "discount", label: "Discounts", aggregate: true },
  { key: "transactions", label: "Transactions", aggregate: true },
]);

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
