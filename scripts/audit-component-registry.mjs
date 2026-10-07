import fs from "node:fs";
import { PLATFORM_COMPONENTS, validateComponentRegistry } from "../server/services/platformComponentRegistry.js";

const result = validateComponentRegistry();
const requiredGenericPrimitives = [
  "section","container","card","grid","stack","table","header","text","divider","spacer",
  "text_input","long_text","number","currency","date","datetime","checkbox","picklist","lookup",
  "search_box","searchable_dropdown","toggle","radio_group","slider","file_upload","pin_input",
  "related_list","field_value","record_picker","tree_view","process_path","timeline","kanban",
  "calendar","scheduler","gantt","map","hierarchy_viewer","file_viewer","signature",
  "tabs","accordion","pagination","filter_bar","modal","drawer",
  "image","video","avatar","icon","qr_code","barcode","image_record_card",
  "alert","badge","progress","empty_state","loading_state","button","icon_button","back_button","close_button","refresh_button","navigation_button","link","select","multi_select","time_input","date_picker","menu","breadcrumb","stepper","tooltip","toast","confirmation_dialog","app_icon","dock_item",
  "kpi","bar_chart","line_chart","pie_chart","donut_chart","gauge_chart","funnel_chart",
  "scatter_chart","combo_chart","analytics_table","dashboard_text","dashboard_image",
  "clock_widget","calendar_widget","weather_widget"
];

const keys = new Set(PLATFORM_COMPONENTS.map((component) => component.key));
const missing = requiredGenericPrimitives.filter((key) => !keys.has(key));
if (!result.valid || missing.length) {
  console.error("Component registry audit failed.", { ...result, missing });
  process.exit(1);
}

// Page Builder coverage gate: every record-bound PAGE component must be
// explicitly recognised by the shared renderer, and every palette component
// must have either registry-configured Properties or an intentional specialised
// Properties implementation. This prevents a newly registered component from
// silently appearing with a blank side panel or no data runtime.
const dashboardBuilderSource = fs.readFileSync(new URL("../src/pages/dashboard/DashboardBuilder.jsx", import.meta.url), "utf8");
const dashboardRendererSource = fs.readFileSync(new URL("../src/components/dashboard/DashboardComponents.jsx", import.meta.url), "utf8");
const dashboardPropertiesSource = fs.readFileSync(new URL("../src/components/dashboard/DashboardComponentProperties.jsx", import.meta.url), "utf8");
const clientRegistrySource = fs.readFileSync(new URL("../src/pages/settings/Platform/componentRegistry.js", import.meta.url), "utf8");
const pageBuilderSource = fs.readFileSync(new URL("../src/pages/settings/Platform/CustomPageBuilder.jsx", import.meta.url), "utf8");
const pageRendererSource = fs.readFileSync(new URL("../src/components/platform/CustomPageRenderer.jsx", import.meta.url), "utf8");
const specialisedPropertyKeys = new Set([
  "section","multi_container","table","tree_view","process_path","container","button","text","header",
  "divider","spacer","field_value","related_list","timeline","kanban","calendar","scheduler","gantt",
  "map","hierarchy_viewer","file_viewer","signature",
]);
const excludedPaletteCategories = new Set(["field"]);
const pageComponents = PLATFORM_COMPONENTS.filter((component) =>
  !component.supportedBuilders?.length || component.supportedBuilders.includes("PAGE")
);
const propertyCoverageMissing = pageComponents
  .filter((component) => component.key !== "section" && !excludedPaletteCategories.has(component.category))
  .filter((component) => !specialisedPropertyKeys.has(component.key) && !(Array.isArray(component.configurable) && component.configurable.length) && component.runtimeKind !== "analytics")
  .filter((component) => !pageBuilderSource.includes(`componentKey === "${component.key}"`))
  .map((component) => component.key);
const recordRuntimeMissing = pageComponents
  .filter((component) => component.recordBound === true)
  .filter((component) => !pageRendererSource.includes(`"${component.key}"`))
  .map((component) => component.key);

// Capability gates: presence of a component key is not enough. Components
// advertising binding, relationships, children or actions must be wired into
// the corresponding generic runtime primitive.
const bindingRuntimeMissing = pageComponents
  .filter((component) => component.bindable === true && component.category !== "field" && component.recordBound !== true && component.relationship !== true)
  .filter((component) => !pageRendererSource.includes("resolveRuntimeBinding") || !pageRendererSource.includes(`"${component.key}"`))
  .map((component) => component.key);
const relationshipRuntimeMissing = pageComponents
  .filter((component) => component.relationship === true)
  .filter((component) => !pageRendererSource.includes("RelatedListView") || !pageRendererSource.includes("/related/"))
  .map((component) => component.key);
const childRuntimeMissing = pageComponents
  .filter((component) => component.supportsChildren === true || component.containsChildren === true || ["card","grid","stack","tabs","accordion"].includes(component.key))
  .filter((component) => component.key !== "section")
  .filter((component) => !pageRendererSource.includes("renderChildren"))
  .map((component) => component.key);
const controlRuntimeMissing = ["search_box","filter_bar","pagination"]
  .filter((key) => keys.has(key))
  .filter((key) => !pageRendererSource.includes(`key === "${key}"`) || !pageRendererSource.includes("targetNodeId"));
const actionRuntimeMissing = ["menu","breadcrumb","stepper","modal","drawer","confirmation_dialog","empty_state","app_icon","dock_item","link"]
  .filter((key) => keys.has(key))
  .filter((key) => !pageRendererSource.includes(`key === "${key}"`) && !pageRendererSource.includes(`["${key}"`));
const pageCalendarCollision = pageComponents.some((component) => component.key === "calendar_widget");

const recordDataConfigMismatch = pageComponents
  .filter((component) => Array.isArray(component.configurable) && component.configurable.includes("objectKey"))
  .filter((component) => component.runtimeKind !== "analytics")
  .filter((component) => component.recordBound !== true && component.relationship !== true)
  .map((component) => component.key);
const childMetadataMismatch = pageComponents
  .filter((component) => ["card","grid","stack","tabs","accordion","container"].includes(component.key))
  .filter((component) => component.supportsChildren !== true && component.containsChildren !== true)
  .map((component) => component.key);
const duplicatePageLabels = Object.entries(pageComponents.reduce((acc, component) => {
  const label = String(component.label || "").trim().toLowerCase();
  if (label) (acc[label] ||= []).push(component.key);
  return acc;
}, {})).filter(([, componentKeys]) => componentKeys.length > 1).map(([label, componentKeys]) => ({ label, componentKeys }));

const dashboardComponents = PLATFORM_COMPONENTS.filter((component) =>
  component.supportedBuilders?.includes("DASHBOARD") || component.supportsDashboardContext === true
);
const dashboardRuntimeMissing = dashboardComponents
  .filter((component) => !dashboardRendererSource.includes(`"${component.rendererKey || component.key}"`) && !dashboardRendererSource.includes(`"${component.key}"`))
  .map((component) => component.key);
const dashboardPropertiesMissing = dashboardComponents
  .filter((component) => Array.isArray(component.configurable) && component.configurable.length)
  .filter((component) => !component.runtimeKind && !dashboardPropertiesSource.includes(`"${component.rendererKey || component.key}"`) && !dashboardPropertiesSource.includes(`"${component.key}"`))
  .map((component) => component.key);
const iconCoverageMissing = PLATFORM_COMPONENTS
  .filter((component) => !clientRegistrySource.includes(`${component.key}:`))
  .map((component) => component.key);
const builderContractMismatch = PLATFORM_COMPONENTS
  .filter((component) => component.supportedBuilders?.includes("DASHBOARD") && component.supportsDashboardContext !== true)
  .concat(PLATFORM_COMPONENTS.filter((component) => component.supportedBuilders?.includes("PAGE") && component.supportsPageContext !== true))
  .map((component) => component.key);

const rendererCoverageMissing = pageComponents
  .filter((component) => component.key !== "section" && component.category !== "field" && component.runtimeKind !== "analytics")
  .filter((component) => !pageRendererSource.includes(`"${component.key}"`))
  .map((component) => component.key);

if (propertyCoverageMissing.length || recordRuntimeMissing.length || bindingRuntimeMissing.length || relationshipRuntimeMissing.length || childRuntimeMissing.length || controlRuntimeMissing.length || actionRuntimeMissing.length || recordDataConfigMismatch.length || childMetadataMismatch.length || duplicatePageLabels.length || dashboardRuntimeMissing.length || dashboardPropertiesMissing.length || iconCoverageMissing.length || builderContractMismatch.length || pageCalendarCollision || rendererCoverageMissing.length) {
  console.error("Page Builder component coverage audit failed.", { propertyCoverageMissing, recordRuntimeMissing, bindingRuntimeMissing, relationshipRuntimeMissing, childRuntimeMissing, controlRuntimeMissing, actionRuntimeMissing, recordDataConfigMismatch, childMetadataMismatch, duplicatePageLabels, dashboardRuntimeMissing, dashboardPropertiesMissing, iconCoverageMissing, builderContractMismatch, pageCalendarCollision, rendererCoverageMissing });
  process.exit(1);
}

console.log(`Component registry audit passed: ${result.count} registered components, all with unique 14-digit IDs.`);
