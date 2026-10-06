import { PLATFORM_COMPONENTS, validateComponentRegistry } from "../server/services/platformComponentRegistry.js";

const result = validateComponentRegistry();
const requiredGenericPrimitives = [
  "section","container","card","grid","stack","table","header","text","divider","spacer",
  "text_input","long_text","number","currency","date","datetime","checkbox","picklist","lookup",
  "search_box","searchable_dropdown","toggle","radio_group","slider","file_upload","pin_input",
  "related_list","field_value","record_picker","tree_view","process_path","timeline","kanban",
  "calendar","scheduler","gantt","map","hierarchy_viewer","file_viewer","signature",
  "tabs","accordion","pagination","filter_bar","modal","drawer",
  "image","video","avatar","icon","qr_code","barcode","image_detail_card",
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
console.log(`Component registry audit passed: ${result.count} registered components, all with unique 14-digit IDs.`);
