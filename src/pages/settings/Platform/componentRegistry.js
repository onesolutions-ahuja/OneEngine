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
  CalendarDays,
  ChartGantt,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  CloudSun,
  FileText,
  FolderTree,
  Gauge,
  KanbanSquare,
  LayoutDashboard,
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
  Image as ImageIcon,
  Video,
  UserCircle,
  QrCode,
  Barcode,
  Search,
  SlidersHorizontal,
  Upload,
  Radio,
  ToggleLeft,
  Layers,
  Columns3,
  PanelRightOpen,
  MessageSquareWarning,
  BadgeCheck,
  LoaderCircle,
  ArrowLeft,
  X,
  RefreshCw,
  ExternalLink,
  Clock,
  Menu,
  ChevronRight,
  ListOrdered,
  MessageCircleQuestion,
  Bell,
  AppWindow,
  PanelBottom,
} from "lucide-react";

// Client fallback mirrors the server registry so the builder remains usable
// during transient API failures. The server /platform/component-registry is
// authoritative and is loaded by builders at runtime.
// No mirrored component catalogue is allowed in the browser.
// The server registry is the single source of truth. Builders may show a
// loading/error state, but they must never silently fall back to stale
// business/component metadata.
export const FALLBACK_COMPONENT_REGISTRY = Object.freeze([]);

/* ---------------------------------------------------------------------------
 * ONE icon + category presentation map.
 * Every palette, picker and the Component Registry screen resolve an entry's
 * icon and category label through these helpers — no component maps its own.
 * ------------------------------------------------------------------------ */

export const COMPONENT_ICONS = {
  section: Square,
  card: Square,
  grid: Columns3,
  stack: Layers,
  tabs: PanelTop,
  accordion: Rows3,
  modal: Square,
  drawer: PanelRightOpen,
  alert: MessageSquareWarning,
  badge: BadgeCheck,
  progress: Gauge,
  empty_state: Box,
  loading_state: LoaderCircle,
  image: ImageIcon,
  video: Video,
  avatar: UserCircle,
  icon: Sparkles,
  qr_code: QrCode,
  barcode: Barcode,
  search_box: Search,
  searchable_dropdown: ListFilter,
  toggle: ToggleLeft,
  radio_group: Radio,
  slider: SlidersHorizontal,
  file_upload: Upload,
  pin_input: TextCursorInput,
  record_picker: ListFilter,
  pagination: Rows3,
  filter_bar: ListFilter,
  product_image_card: ImageIcon,
  icon_button: Square,
  back_button: ArrowLeft,
  close_button: X,
  refresh_button: RefreshCw,
  navigation_button: ArrowLeft,
  link: ExternalLink,
  select: ListFilter,
  multi_select: ListFilter,
  time_input: Clock,
  date_picker: CalendarDays,
  menu: Menu,
  breadcrumb: ChevronRight,
  stepper: ListOrdered,
  tooltip: MessageCircleQuestion,
  toast: Bell,
  confirmation_dialog: MessageSquareWarning,
  app_icon: AppWindow,
  dock_item: PanelBottom,
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
  calendar_widget: CalendarDays,
  weather_widget: CloudSun,
  kanban: KanbanSquare,
  calendar: CalendarDays,
  scheduler: CalendarClock,
  gantt: ChartGantt,
  map: Map,
  hierarchy_viewer: Network,
  file_viewer: FileText,
  signature: PenLine,
  kpi: LayoutDashboard,
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
  input: "Inputs",
  navigation: "Navigation",
  media: "Media",
  feedback: "Feedback",
  overlay: "Overlays",
  modern: "Modern",
};

export function componentCategoryLabel(category) {
  return COMPONENT_CATEGORY_LABELS[category] || "Other";
}

/** Ordered category sequence for filter tabs (unknown categories appended). */
export function componentCategories(registry) {
  const preferred = ["all", "layout", "content", "field", "input", "record", "navigation", "media", "feedback", "overlay", "dashboard", "modern", "action"];
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
    id: /^\d{14}$/.test(String(source.id || source.component_id || source.componentId || "")) ? String(source.id || source.component_id || source.componentId) : "",
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
 * Every surface loads the authoritative server payload. A failed request leaves
 * the registry empty so builders cannot persist definitions against stale metadata.
 * ------------------------------------------------------------------------ */

export function useComponentRegistry() {
  const [registry, setRegistry] = useState([]);

  useEffect(() => {
    let alive = true;
    apiRequest("/api/platform/component-registry")
      .then((response) => {
        if (!alive) return;
        const next = normalizedRegistry(response?.data);
        if (next.length) setRegistry(next);
      })
      .catch(() => { if (alive) setRegistry([]); });
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
  const id = (() => {
    // Runtime instance IDs use the same 14-digit numeric contract as the
    // registry while remaining unique per placement.
    const now = String(Date.now()).slice(-11).padStart(11, "0");
    const entropy = typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint16Array(1))[0] % 1000
      : Math.floor(Math.random() * 1000);
    return `${now}${String(entropy).padStart(3, "0")}`;
  })();
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
