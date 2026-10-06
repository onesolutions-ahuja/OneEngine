import TableV1 from "./table/TableV1.jsx";
import ButtonV1 from "./button/ButtonV1.jsx";
import ContainerV1 from "./container/ContainerV1.jsx";
import HeaderV1 from "./header/HeaderV1.jsx";
import TextV1 from "./text/TextV1.jsx";
import DividerV1 from "./divider/DividerV1.jsx";
import SpacerV1 from "./spacer/SpacerV1.jsx";
import RelatedListV1 from "./related-list/RelatedListV1.jsx";
import FieldValueV1 from "./field-value/FieldValueV1.jsx";
import MultiContainerV1 from "./multi-container/MultiContainerV1.jsx";
import TreeViewV1 from "./tree-view/TreeViewV1.jsx";
import ProcessPathV1 from "./process-path/ProcessPathV1.jsx";
import TimelineV1 from "./timeline/TimelineV1.jsx";
import KanbanV1 from "./kanban/KanbanV1.jsx";
import SchedulerV1 from "./scheduler/SchedulerV1.jsx";
import HierarchyViewerV1 from "./hierarchy-viewer/HierarchyViewerV1.jsx";


/**
 * Code implementation registry only. Page metadata references these stable APIs.
 * New behaviour is registered as a new API (table.v2), never copied into pages.
 */
export const COMPONENT_IMPLEMENTATIONS = Object.freeze({
  "table.v1": TableV1,
  "button.v1": ButtonV1,
  "container.v1": ContainerV1,
  "header.v1": HeaderV1,
  "text.v1": TextV1,
  "divider.v1": DividerV1,
  "spacer.v1": SpacerV1,
  "related_list.v1": RelatedListV1,
  "field_value.v1": FieldValueV1,
  "multi_container.v1": MultiContainerV1,
  "tree_view.v1": TreeViewV1,
  "process_path.v1": ProcessPathV1,
  "timeline.v1": TimelineV1,
  "kanban.v1": KanbanV1,
  "scheduler.v1": SchedulerV1,
  "hierarchy_viewer.v1": HierarchyViewerV1,
});

export const LEGACY_COMPONENT_API_ALIASES = Object.freeze({
  table: "table.v1",
  button: "button.v1",
  container: "container.v1",
  header: "header.v1",
  text: "text.v1",
  divider: "divider.v1",
  spacer: "spacer.v1",
  related_list: "related_list.v1",
  field_value: "field_value.v1",
  multi_container: "multi_container.v1",
  tree_view: "tree_view.v1",
  process_path: "process_path.v1",
  timeline: "timeline.v1",
  kanban: "kanban.v1",
  scheduler: "scheduler.v1",
  hierarchy_viewer: "hierarchy_viewer.v1",
});

export function canonicalComponentApi(value) {
  const key = String(value || "").trim();
  return LEGACY_COMPONENT_API_ALIASES[key] || key;
}

export function componentImplementation(value) {
  return COMPONENT_IMPLEMENTATIONS[canonicalComponentApi(value)] || null;
}
