// Shared client-side Component Registry support.
//
// The SERVER registry (/api/platform/component-registry, backed by
// services/platformComponentRegistry.js) is authoritative. This module owns
// the ONE shared presentation layer over it — icons, category labels, a
// normalizer that tolerates contract evolution, and one loader hook — so the
// Component Registry screen and every builder palette/picker stay in lockstep
// without importing server code into the browser bundle.

import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import {
  AlignLeft,
  BarChart3,
  Bot,
  Box,
  Braces,
  Calendar,
  CalendarClock,
  CalendarRange,
  ChartGantt,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  CloudSun,
  FileText,
  FolderTree,
  Gauge,
  KanbanSquare,
  Link2,
  List,
  ListFilter,
  Map,
  Minus,
  MousePointerClick,
  MoveVertical,
  Network,
  PanelTop,
  PenLine,
  PieChart,
  Rows3,
  Sparkles,
  Square,
  Table,
  Tag,
  Text,
  TextCursorInput,
  Workflow,
} from "lucide-react";

// Client fallback mirrors the server registry so the builder remains usable
// during transient API failures. The server /platform/component-registry is
// authoritative and is loaded by builders at runtime.
export const FALLBACK_COMPONENT_REGISTRY = [
  { key: "section", label: "Section", category: "layout", kind: "layout", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true },
  { key: "folder_card", label: "Folder Card", category: "modern", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "folder_card" },
  { key: "avatar_group", label: "Avatar Group", category: "modern", kind: "avatar", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "avatar_group" },
  { key: "modern_app_card", label: "Modern App Card", category: "modern", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "modern_app_card" },
  { key: "modern_kpi_card", label: "Modern KPI Card", category: "modern", kind: "metric", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "modern_kpi_card" },
  { key: "modern_section_header", label: "Modern Section Header", category: "modern", kind: "section", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "modern_section_header" },
  { key: "modern_data_card", label: "Modern Data Card", category: "modern", kind: "card", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "modern_data_card" },
  { key: "icon_action_tile", label: "Action Tile", category: "modern", kind: "action", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "icon_action_tile" },
  { key: "header", label: "Header", category: "content", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true },
  { key: "text", label: "Information Text", category: "content", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true },
  { key: "clock_widget", label: "Clock / Watch", category: "content", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "clock_widget" },
  { key: "calendar_widget", label: "Calendar", category: "content", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "calendar_widget" },
  { key: "weather_widget", label: "Weather", category: "content", kind: "content", supportedBuilders: ["PAGE", "DASHBOARD"], supportedContexts: ["page", "dashboard"], supportsDashboardContext: true, supportsPageContext: true, rendererKey: "weather_widget" },
  { key: "divider", label: "Divider", category: "layout", kind: "layout" },
  { key: "spacer", label: "Spacer", category: "layout", kind: "layout" },
  { key: "text_input", label: "Text Box", category: "field", kind: "field", bindable: true },
  { key: "long_text", label: "Long Text", category: "field", kind: "field", bindable: true },
  { key: "number", label: "Number", category: "field", kind: "field", bindable: true },
  { key: "currency", label: "Currency / Decimal", category: "field", kind: "field", bindable: true },
  { key: "date", label: "Date", category: "field", kind: "field", bindable: true },
  { key: "datetime", label: "Date & Time", category: "field", kind: "field", bindable: true },
  { key: "checkbox", label: "Checkbox", category: "field", kind: "field", bindable: true },
  { key: "picklist", label: "Picklist / Dropdown", category: "field", kind: "field", bindable: true },
  { key: "lookup", label: "Lookup", category: "field", kind: "field", bindable: true },
  { key: "related_list", label: "Related List / Table", category: "record", kind: "record", bindable: true },
  { key: "field_value", label: "Field Value", category: "record", kind: "record", bindable: true },
  { key: "tree_view", label: "Tree View", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "process_path", label: "Process Path", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "timeline", label: "Timeline", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "kanban", label: "Kanban", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "calendar", label: "Calendar", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "scheduler", label: "Scheduler", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "gantt", label: "Gantt", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "map", label: "Map", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "hierarchy_viewer", label: "Hierarchy Viewer", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "file_viewer", label: "File Viewer", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "signature", label: "Signature", category: "record", kind: "record", bindable: true, recordBound: true },
  { key: "button", label: "Custom Button", category: "action", kind: "action", reserved: true },
  { key: "kpi", label: "Metric / KPI", category: "dashboard", kind: "metric", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "kpi", defaults: { title: "Metric", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, format: "number", size: "medium", dateRange: "this_month" }, layout: { w: 3, h: 2 } } },
  { key: "bar_chart", label: "Bar Chart", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "bar", defaults: { title: "Bar Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, seriesField: null, stacked: false, limit: 12, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "line_chart", label: "Line Chart", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "line", defaults: { title: "Line Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, showMarkers: true, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "pie_chart", label: "Pie Chart", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "pie", defaults: { title: "Pie Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, maxCategories: 8, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "donut_chart", label: "Donut Chart", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "donut", defaults: { title: "Donut Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, maxCategories: 8, showTotal: true, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "gauge_chart", label: "Gauge", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "gauge", defaults: { title: "Gauge", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, targetMode: "fixed", targetValue: 100, dateRange: "this_month" }, layout: { w: 4, h: 4 } } },
  { key: "funnel_chart", label: "Funnel", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "funnel", defaults: { title: "Funnel", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, labelField: null, limit: 8, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "scatter_chart", label: "Scatter", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "scatter", defaults: { title: "Scatter", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, xField: null, valueField: null, labelField: null, limit: 60, dateRange: "this_month" }, layout: { w: 6, h: 4 } } },
  { key: "combo_chart", label: "Combo Chart", category: "dashboard", kind: "chart", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "combo", defaults: { title: "Combo Chart", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, valueField: null, yFields: [], secondaryAxisFields: [], labelField: null, limit: 24, showLegend: true, showValues: false, showGrid: true, referenceLines: [], dateRange: "this_month" }, layout: { w: 8, h: 4 } } },
  { key: "analytics_table", label: "Analytics Table", category: "dashboard", kind: "record", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "table", defaults: { title: "Table", config: { report: { dataSource: "sales", fields: [], groupBy: [], filters: [], filterLogic: "all", sort: [] }, rowLimit: 50 }, layout: { w: 12, h: 5 } } },
  { key: "dashboard_text", label: "Dashboard Text", category: "dashboard", kind: "content", supportedBuilders: ["PAGE","DASHBOARD"], supportedContexts: ["page","dashboard"], supportsDashboardContext: true, supportsPageContext: true, runtimeKind: "analytics", rendererKey: "text", defaults: { title: "Text", config: { content: "" }, layout: { w: 6, h: 3 } } },
  { key: "dashboard_image", label: "Dashboard Image", category: "dashboard", kind: "content", supportedBuilders: ["DASHBOARD"], supportedContexts: ["dashboard"], supportsDashboardContext: true, runtimeKind: "analytics", rendererKey: "image", defaults: { title: "Image", config: { imageUrl: "", altText: "", imageFit: "contain", linkUrl: "" }, layout: { w: 6, h: 4 } } },

];

/* ---------------------------------------------------------------------------
 * ONE icon + category presentation map.
 * Every palette, picker and the Component Registry screen resolve an entry's
 * icon and category label through these helpers — no component maps its own.
 * ------------------------------------------------------------------------ */

export const COMPONENT_ICONS = {
  section: Square,
  container: Box,
  multi_container: Rows3,
  table: Table,
  header: PanelTop,
  text: AlignLeft,
  dashboard_text: AlignLeft,
  divider: Minus,
  spacer: MoveVertical,
  text_input: TextCursorInput,
  long_text: Text,
  number: Tag,
  text: AlignLeft,
  currency: CircleDollarSign,
  date: Calendar,
  datetime: CalendarClock,
  checkbox: CheckSquare,
  picklist: ListFilter,
  lookup: Link2,
  related_list: List,
  field_value: Braces,
  tree_view: FolderTree,
  process_path: Workflow,
  timeline: Clock3,
  clock_widget: Clock3,
  calendar_widget: CalendarRange,
  weather_widget: CloudSun,
  kanban: KanbanSquare,
  calendar: CalendarRange,
  scheduler: Workflow,
  gantt: ChartGantt,
  map: Map,
  hierarchy_viewer: Network,
  file_viewer: FileText,
  signature: PenLine,
  kpi: Gauge,
  pie_chart: PieChart,
  donut_chart: PieChart,
  bar_chart: BarChart3,
  line_chart: ChartGantt,
  gauge_chart: Gauge,
  funnel_chart: ChartGantt,
  scatter_chart: ChartGantt,
  combo_chart: BarChart3,
  /* Dashboard runtime keys (platformDashboard.js vocabulary) resolve to the
     same icons as their registry counterparts — one visual language. */
  pie: PieChart,
  donut: PieChart,
  bar: BarChart3,
  line: ChartGantt,
  gauge: Gauge,
  funnel: ChartGantt,
  scatter: ChartGantt,
  combo: BarChart3,
  button: MousePointerClick,
  jarves: Bot,
  sparkles: Sparkles,
};

export function componentIcon(componentOrKey) {
  const key = typeof componentOrKey === "string" ? componentOrKey : componentOrKey?.key;
  return COMPONENT_ICONS[key] || COMPONENT_ICONS.sparkles;
}

/** Friendly category labels — one vocabulary, snake_case never surfaces. */
export const COMPONENT_CATEGORY_LABELS = {
  layout: "Layout",
  content: "Content",
  field: "Fields",
  record: "Record",
  dashboard: "Dashboard",
  action: "Actions",
};

export function componentCategoryLabel(category) {
  return COMPONENT_CATEGORY_LABELS[category] || "Other";
}

/** Ordered category sequence for filter tabs (unknown categories appended). */
export function componentCategories(registry) {
  const preferred = ["all", "layout", "content", "field", "record", "dashboard", "modern", "action"];
  const known = new Set(preferred);
  const extra = [];
  for (const component of registry || []) {
    const category = normalizeComponent(component).category;
    if (category && !known.has(category)) {
      known.add(category);
      extra.push(category);
    }
  }
  return [...preferred.filter((category) => category === "all" || (registry || []).some((c) => normalizeComponent(c).category === category)), ...extra];
}

/* ---------------------------------------------------------------------------
 * Normalization — loosely coupled to the server contract.
 * Accepts any subset of { key, component_key, name, label, title, category,
 * kind, description, ... } so registry additions/renames cannot break the UI.
 * ------------------------------------------------------------------------ */

export function normalizeComponent(component) {
  const source = component && typeof component === "object" ? component : {};
  const key = String(source.key || source.component_key || source.componentKey || source.name || "").trim();
  const label = String(source.label || source.title || source.name || key).trim() || key;
  const normalizeArray = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    const scalar = value == null ? "" : String(value);
    return scalar ? [scalar] : [];
  };
  return {
    ...source,
    key,
    label,
    category: String(source.category || "other").toLowerCase(),
    kind: String(source.kind || source.category || "other").toLowerCase(),
    bindable: source.bindable === true,
    reserved: source.reserved === true,
    recordBound: source.recordBound === true || source.record_bound === true,
    containsChildren: source.containsChildren === true || source.contains_children === true,
    description: typeof source.description === "string" ? source.description : "",
    supportedBuilders: normalizeArray(source.supportedBuilders || source.supported_builders || source.builders || source.builder),
    supportedContexts: normalizeArray(source.supportedContexts || source.supported_contexts || source.contexts || source.context),
    supportsDashboardContext: source.supportsDashboardContext === true || source.supports_dashboard_context === true || source.dashboard === true || source.supportsDashboardContext === "true",
    supportsPageContext: source.supportsPageContext === true || source.supports_page_context === true || source.page === true || source.supportsPageContext === "true",
    supportsRecordContext: source.supportsRecordContext === true || source.supports_record_context === true || source.recordBound === true || source.supportsRecordContext === "true",
    rendererKey: source.rendererKey || source.renderer_key || key,
    runtimeKind: source.runtimeKind || source.runtime_kind || null,
    defaults: source.defaults && typeof source.defaults === "object" ? source.defaults : {},
    permissions: normalizeArray(source.permissions || source.requiredPermissions || source.required_permissions),
    packageOwnership: source.packageOwnership || source.package_ownership || "shared",
    configurable: Array.isArray(source.configurable) ? source.configurable : [],
  };
}

export function normalizedRegistry(registry) {
  const seen = new Set();
  return (Array.isArray(registry) ? registry : [])
    .map(normalizeComponent)
    .filter((component) => component.key && !seen.has(component.key) && seen.add(component.key));
}

export function componentByKey(registry, key) {
  return normalizedRegistry(registry).find((component) => component.key === key) || null;
}

/* ---------------------------------------------------------------------------
 * ONE loader hook — the single fetch of /api/platform/component-registry.
 * Every surface starts from the fallback (never blank) and adopts the server
 * payload when it arrives; a failed request is silent by design.
 * ------------------------------------------------------------------------ */

export function useComponentRegistry() {
  const [registry, setRegistry] = useState(FALLBACK_COMPONENT_REGISTRY);

  useEffect(() => {
    let alive = true;
    apiRequest("/api/platform/component-registry")
      .then((response) => {
        if (!alive) return;
        const next = normalizedRegistry(response?.data);
        if (next.length) setRegistry(next);
      })
      .catch(() => { /* fallback stays rendered */ });
    return () => { alive = false; };
  }, []);

  return registry;
}

/* ---------------------------------------------------------------------------
 * Palette helpers (existing contracts, preserved).
 * ------------------------------------------------------------------------ */

export function registryForBuilder(registry = FALLBACK_COMPONENT_REGISTRY, builder = "DASHBOARD") {
  const target = String(builder || "DASHBOARD").toUpperCase();
  return normalizedRegistry(registry).filter((component) => {
    const supported = (component.supportedBuilders || []).map((item) => String(item).toUpperCase());
    if (supported.length) return supported.includes(target);
    const category = component.category || "";
    if (target === "DASHBOARD") {
      if (component.supportsDashboardContext || category === "dashboard" || category === "modern") return true;
      return ["layout", "content", "action"].includes(category);
    }
    if (target === "PAGE") {
      if (component.supportsPageContext || category === "layout" || category === "content" || category === "action" || category === "modern") return true;
      return !component.recordBound;
    }
    return true;
  });
}

export function paletteComponents(registry = FALLBACK_COMPONENT_REGISTRY) {
  return normalizedRegistry(registry).filter((component) => ["layout", "content", "action", "modern"].includes(component.category));
}

export function componentKeyForFieldType(fieldType, registry = FALLBACK_COMPONENT_REGISTRY) {
  const type = String(fieldType || "text").toLowerCase();
  const aliases = {
    text: "text_input", email: "text_input", phone: "text_input", url: "text_input", time: "text_input", auto_number: "text_input",
    text_area: "long_text", long_text: "long_text", rich_text: "long_text", textarea: "long_text",
    number: "number", percent: "number", decimal: "currency", currency: "currency",
    date: "date", datetime: "datetime", boolean: "checkbox",
    select: "picklist", picklist: "picklist", multiselect: "picklist", multi_select: "picklist", lookup: "lookup",
    address: "structured_field", location: "structured_field", json: "structured_field",
  };
  const key = aliases[type] || "text_input";
  return registry.some((component) => component.key === key) ? key : "text_input";
}

export function createRegisteredComponent(component, builder = "PAGE") {
  const spec = normalizeComponent(component);
  const defaults = typeof structuredClone === "function"
    ? structuredClone(spec.defaults || {})
    : JSON.parse(JSON.stringify(spec.defaults || {}));
  const id = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `component_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  if (String(builder).toUpperCase() === "DASHBOARD") {
    return {
      id,
      registryKey: spec.key,
      type: spec.rendererKey || spec.key,
      title: defaults.title || spec.label,
      config: defaults.config || {},
      layout: { x: 0, y: 0, w: 6, h: 4, ...(defaults.layout || {}) },
    };
  }
  return {
    id,
    componentKey: spec.key,
    rendererKey: spec.rendererKey || spec.key,
    runtimeKind: spec.runtimeKind || null,
    label: spec.label,
    title: defaults.title || spec.label,
    config: defaults.config || {},
    layout: defaults.layout || {},
  };
}
