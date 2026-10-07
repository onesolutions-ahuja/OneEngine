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
  "image","video","avatar","icon","qr_code","barcode","product_image_card",
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
const rendererCoverageMissing = pageComponents
  .filter((component) => component.key !== "section" && component.category !== "field")
  .filter((component) => !pageRendererSource.includes(`"${component.key}"`))
  .map((component) => component.key);

if (propertyCoverageMissing.length || recordRuntimeMissing.length || rendererCoverageMissing.length) {
  console.error("Page Builder component coverage audit failed.", { propertyCoverageMissing, recordRuntimeMissing, rendererCoverageMissing });
  process.exit(1);
}

console.log(`Component registry audit passed: ${result.count} registered components, all with unique 14-digit IDs.`);
