/**
 * Canonical metadata-driven UI component registry.
 * Forms, record pages and custom pages must use these keys rather than
 * inventing page-specific control vocabularies.
 */
export const PLATFORM_COMPONENTS = Object.freeze([
  { key: "section", label: "Section", category: "layout", kind: "layout", bindable: false, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: true, rendererKey: "section" },
  { key: "folder_card", label: "Folder Card", category: "modern", kind: "card", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "folder_card", configurable: ["title", "subtitle", "icon", "image", "metric", "backgroundStyle", "accentStyle", "clickAction", "linkedPage", "visibility"] },
  { key: "avatar_group", label: "Avatar Group", category: "modern", kind: "avatar", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "avatar_group", configurable: ["dataSource", "objectKey", "imageField", "initialsField", "maxVisible", "overflowCount", "size", "spacing", "clickAction", "filter", "visibility"] },
  { key: "modern_app_card", label: "Modern App Card", category: "modern", kind: "card", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "modern_app_card", configurable: ["title", "subtitle", "icon", "metric", "backgroundStyle", "accentStyle", "link", "visibility"] },
  { key: "modern_kpi_card", label: "Modern KPI Card", category: "modern", kind: "metric", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "modern_kpi_card", configurable: ["title", "value", "trend", "delta", "icon", "accentStyle", "format", "clickAction"] },
  { key: "modern_section_header", label: "Modern Section Header", category: "modern", kind: "section", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "modern_section_header", configurable: ["title", "subtitle", "eyebrow", "icon", "alignment", "visibility"] },
  { key: "modern_data_card", label: "Modern Data Card", category: "modern", kind: "card", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "modern_data_card", configurable: ["title", "value", "meta", "status", "icon", "accentStyle", "clickAction", "visibility"] },
  { key: "icon_action_tile", label: "Action Tile", category: "modern", kind: "action", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, supportsRecordContext: false, supportsChildren: false, rendererKey: "icon_action_tile", configurable: ["label", "icon", "action", "variant", "size", "visibility"] },
  // Custom Page Builder layout components. `multi_container` is record-bound:
  // it renders a Record Collection through the shared page renderer and never
  // embeds its own query logic (collection → existing Platform record APIs).
  { key: "container", api: "container.v1", version: 1, label: "Container", category: "layout", kind: "layout", bindable: false, containsChildren: true, rendererKey: "container" },
  { key: "multi_container", label: "MultiContainer", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false },
  { key: "table", api: "table.v1", version: 1, label: "Table / List", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, rendererKey: "table" },
  { key: "tree_view", label: "Tree View", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "parentField", "labelField", "secondaryField", "rootFilter", "sort", "maxDepth", "showCounts", "allowCollapse", "defaultExpandedDepth", "clickAction"] },
  { key: "process_path", label: "Process Path", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["fieldKey", "stages", "guidance", "keyFields"] },
  { key: "timeline", label: "Timeline", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "dateField", "titleField", "subtitleField", "iconField", "sort", "groupBy", "maxRecords", "filters", "clickAction"] },
  { key: "kanban", label: "Kanban", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "groupField", "cardTitleField", "subtitleFields", "imageField", "secondaryValues", "sort", "columnOrder", "maxRecords", "allowDragDrop", "clickAction"] },
  { key: "calendar", label: "Calendar", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "startDateField", "endDateField", "titleField", "subtitleField", "categoryField", "filters", "defaultView", "clickAction", "createAction"] },
  { key: "scheduler", label: "Scheduler", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "resourceField", "startDateField", "endDateField", "titleField", "statusField", "resourceLabelField", "workingHours", "slotInterval", "filters", "clickAction"] },
  { key: "gantt", label: "Gantt", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "taskLabelField", "startDateField", "endDateField", "progressField", "parentRelationship", "statusField", "filters", "sort", "scale", "clickAction"] },
  { key: "map", label: "Map", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "latitudeField", "longitudeField", "addressFields", "labelField", "descriptionField", "popupFields", "filters", "maxRecords", "defaultZoom", "clickAction"] },
  { key: "hierarchy_viewer", label: "Hierarchy Viewer", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "parentField", "titleField", "subtitleFields", "imageField", "statusField", "maxDepth", "orientation", "clickAction"] },
  { key: "file_viewer", label: "File Viewer", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "fileRelation", "displayMode", "filenameField", "typeField", "dateField", "uploaderField", "allowedFileTypes", "maxItems"] },
  { key: "signature", label: "Signature", category: "record", kind: "record", bindable: true, recordBound: true, containsChildren: false, configurable: ["objectKey", "fieldKey", "label", "required", "clearPermission", "displayMode", "width", "height"] },
  { key: "header", label: "Header", category: "content", kind: "content", bindable: false },
  { key: "text", label: "Information Text", category: "content", kind: "content", bindable: false },
  { key: "divider", label: "Divider", category: "layout", kind: "layout", bindable: false },
  { key: "spacer", label: "Spacer", category: "layout", kind: "layout", bindable: false },
  { key: "text_input", label: "Text Box", category: "field", kind: "field", bindable: true, fieldTypes: ["text", "email", "phone", "url", "time", "auto_number"] },
  { key: "long_text", label: "Long Text", category: "field", kind: "field", bindable: true, fieldTypes: ["long_text", "rich_text", "textarea"] },
  { key: "number", label: "Number", category: "field", kind: "field", bindable: true, fieldTypes: ["number", "percent"] },
  { key: "currency", label: "Currency / Decimal", category: "field", kind: "field", bindable: true, fieldTypes: ["decimal", "currency"] },
  { key: "date", label: "Date", category: "field", kind: "field", bindable: true, fieldTypes: ["date"] },
  { key: "datetime", label: "Date & Time", category: "field", kind: "field", bindable: true, fieldTypes: ["datetime"] },
  { key: "checkbox", label: "Checkbox", category: "field", kind: "field", bindable: true, fieldTypes: ["boolean"] },
  { key: "picklist", label: "Picklist / Dropdown", category: "field", kind: "field", bindable: true, fieldTypes: ["select", "picklist", "multiselect"] },
  { key: "lookup", label: "Lookup", category: "field", kind: "field", bindable: true, fieldTypes: ["lookup"] },
  { key: "structured_field", label: "Address / Location", category: "field", kind: "field", bindable: true, fieldTypes: ["address", "location", "json"] },
  { key: "related_list", label: "Related List / Table", category: "record", kind: "record", bindable: true, relationship: true },
  { key: "field_value", label: "Field Value", category: "record", kind: "record", bindable: true, displayOnly: true },
  // Dashboard Builder / runtime components. Every entry is GENERIC: a rendering
  // shape plus the configuration an administrator supplies (datasource, metric,
  // grouping, date range). None of them is Sales- or Product-specific, and all
  // of them are driven entirely by saved dashboard metadata.
  { key: "clock_widget", label: "Clock / Watch", category: "content", kind: "content", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "clock_widget", configurable: ["timeZone", "hour12", "showSeconds", "showDate"] },
  { key: "calendar_widget", label: "Calendar", category: "content", kind: "content", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "calendar_widget", configurable: ["timeZone", "showWeekday", "showMonth"] },
  { key: "weather_widget", label: "Weather", category: "content", kind: "content", bindable: false, dashboard: true, supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "weather_widget", configurable: ["location", "unit", "temperature", "condition"] },
  {
    key: "kpi", label: "Metric / KPI", category: "dashboard", kind: "metric", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "kpi",
    configurable: ["report","metric","aggregation","filters","filterLogic","dateRange","format","size","conditionalFormatting","drillAction"],
    defaults: { title: "Metric", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, format: "number", size: "medium", dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 3, h: 2 } },
  },
  {
    key: "bar_chart", label: "Bar Chart", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "bar",
    configurable: ["report","categoryField","metric","aggregation","seriesField","orientation","stacked","filters","filterLogic","sort","limit","dateRange","conditionalFormatting","drillAction"],
    defaults: { title: "Bar Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, seriesField: null, orientation: "vertical", stacked: false, limit: 12, dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "line_chart", label: "Line Chart", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "line",
    defaults: { title: "Line Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, seriesField: null, limit: 24, showMarkers: true, dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "pie_chart", label: "Pie Chart", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "pie",
    defaults: { title: "Pie Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, maxCategories: 8, dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "donut_chart", label: "Donut Chart", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "donut",
    defaults: { title: "Donut Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, maxCategories: 8, showTotal: true, dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "gauge_chart", label: "Gauge", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "gauge",
    defaults: { title: "Gauge", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, format: "number", targetMode: "fixed", targetValue: 100, targetField: null, dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 4, h: 4 } },
  },
  {
    key: "funnel_chart", label: "Funnel", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "funnel",
    defaults: { title: "Funnel", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, limit: 8, dateRange: "this_month", drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "scatter_chart", label: "Scatter", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "scatter",
    defaults: { title: "Scatter", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, xField: null, valueField: null, labelField: null, limit: 60, dateRange: "this_month", drillAction: null }, layout: { w: 6, h: 4 } },
  },
  {
    key: "combo_chart", label: "Combo Chart", category: "dashboard", kind: "chart", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "combo",
    configurable: ["report","categoryField","metrics","secondaryAxisFields","filters","filterLogic","sort","limit","dateRange","referenceLines","conditionalFormatting","drillAction"],
    defaults: { title: "Combo Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, yFields: [], secondaryAxisFields: [], labelField: null, limit: 24, showLegend: true, showValues: false, showGrid: true, referenceLines: [], dateRange: "this_month", conditionalFormatting: [], drillAction: null }, layout: { w: 8, h: 4 } },
  },
  {
    key: "analytics_table", label: "Analytics Table", category: "dashboard", kind: "record", bindable: false, dashboard: true,
    supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true,
    runtimeKind: "analytics", rendererKey: "table",
    defaults: { title: "Table", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, rowLimit: 50, conditionalFormatting: [], drillAction: null }, layout: { w: 12, h: 5 } },
  },
  { key: "dashboard_text", label: "Dashboard Text", category: "dashboard", kind: "content", bindable: false, dashboard: true, supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsPageContext: true, supportsDashboardContext: true, runtimeKind: "analytics", rendererKey: "text", defaults: { title: "Text", config: { content: "" }, layout: { w: 6, h: 3 } }, configurable: ["content"] },
  { key: "dashboard_image", label: "Dashboard Image", category: "dashboard", kind: "content", bindable: false, dashboard: true, supportedBuilders: ["DASHBOARD"], supportedContexts: ["dashboard"], supportsPageContext: false, supportsDashboardContext: true, runtimeKind: "analytics", rendererKey: "image", defaults: { title: "Image", config: { imageUrl: "", altText: "", imageFit: "contain", linkUrl: "" }, layout: { w: 6, h: 4 } }, configurable: ["imageUrl","altText","imageFit","linkUrl"] },
  // Reserved canonical trigger component. Behaviour/variants are configured in UI Batch 2.
  { key: "button", api: "button.v1", version: 1, label: "Custom Button", category: "action", kind: "action", bindable: false, reserved: true, rendererKey: "button" },
  { key: "jarves", label: "JARVES", category: "action", kind: "assistant", bindable: false, registered: true, behaviours: ["behaviour_1", "behaviour_2", "behaviour_3"], interactions: ["voice", "message", "ask_input"] },
]);

const componentApi = (component) => component.api || `${component.key}.v${Number(component.version) || 1}`;
const COMPONENT_MAP = new Map();
for (const component of PLATFORM_COMPONENTS) {
  const normalized = Object.freeze({ ...component, api: componentApi(component), version: Number(component.version) || 1 });
  // Versioned API is canonical. Legacy key remains an alias during migration.
  COMPONENT_MAP.set(normalized.api, normalized);
  COMPONENT_MAP.set(normalized.key, normalized);
}

const FLOW_SCREEN_RENDERABLE_COMPONENTS = new Set([
  "header","text","divider","spacer",
  "text_input","long_text","number","currency","date","datetime","checkbox","picklist","lookup",
  "signature","clock_widget","calendar_widget","modern_section_header","modern_data_card","icon_action_tile",
]);

export function listPlatformComponents() {
  return PLATFORM_COMPONENTS.map((source) => {
    const component = COMPONENT_MAP.get(source.key);
    return ({
    ...component,
    fieldTypes: component.fieldTypes ? [...component.fieldTypes] : undefined,
    flowScreenSupported: FLOW_SCREEN_RENDERABLE_COMPONENTS.has(component.key) || component.supportedBuilders?.includes("FLOW"),
  });
  });
}

export function getPlatformComponent(key) {
  return COMPONENT_MAP.get(String(key || "")) || null;
}

export function componentForFieldType(fieldType) {
  const type = String(fieldType || "text").toLowerCase();
  return PLATFORM_COMPONENTS.find((component) => component.kind === "field" && component.fieldTypes?.includes(type)) || getPlatformComponent("text_input");
}

export function resolvePlatformComponentApi(value) {
  const component = COMPONENT_MAP.get(String(value || "").trim());
  return component?.api || null;
}

export function validateComponentRegistry() {
  const keys = PLATFORM_COMPONENTS.map((component) => component.key);
  const apis = PLATFORM_COMPONENTS.map((component) => componentApi(component));
  const versioned = apis.every((api) => /^[a-z][a-z0-9_]*\.v[1-9][0-9]*$/.test(api));
  return {
    valid: new Set(keys).size === keys.length && new Set(apis).size === apis.length && versioned,
    count: keys.length,
    aliases: keys.length,
    versioned,
  };
}
