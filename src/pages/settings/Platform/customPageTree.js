/*
 * SHARED CUSTOM PAGE TREE — one metadata model for builder AND runtime.
 *
 * The Custom Page Builder stores ONE nested definition tree:
 *
 *   { sections: [ { id, width: full|half|third, children: [node...] } ] }
 *   node.container  → { id, componentKey: "container", children: [...] }
 *   node.multi_container → record-bound card grid (Record Collection config)
 *   node.button / node.text / node.header / node.divider / node.spacer / ...
 *
 * BOTH the visual builder (src/pages/settings/Platform/CustomPageBuilder.jsx)
 * and the runtime (src/components/CustomPageRuntime.jsx) render THIS tree
 * through ONE shared renderer (src/components/platform/CustomPageRenderer.jsx).
 * There is no second page renderer and no parallel metadata store: the tree is
 * persisted inside the existing platform_pages.definition JSONB column, which
 * has always been the Custom Page metadata store.
 *
 * Old flat definitions ({ sections: [...], components: [...] }) are migrated
 * in memory by normalizeCustomPageTree() so existing pages keep rendering.
 */

/* The canonical platform condition operators (services/platformConditions.js
   vocabulary); kept as the client-facing set for Record Collection editors. */
export const RECORD_CONDITION_OPERATORS = Object.freeze([
  "equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty",
]);

export const SECTION_WIDTHS = Object.freeze({
  full: { key: "full", label: "Full Width", basis: "100%" },
  half: { key: "half", label: "Half Width", basis: "50%" },
  third: { key: "third", label: "Third Width", basis: "33.333%" },
});

export const CONTAINER_SIZES = Object.freeze(["small", "medium", "large"]);
export const MULTI_GRID_SIZES = Object.freeze(["small", "medium", "large"]);
export const MAX_RECORD_LIMIT = 50;

export const ON_CLICK_TYPES = Object.freeze(["none", "workflow", "action", "navigate", "form_layout", "component"]);

const PAGE_DATA_TYPES = new Set(["text", "number", "boolean", "date", "datetime", "record", "collection", "object"]);
function normalizePageResourceDefinitions(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalize = (item, index) => {
    const key = safeApiName(item?.key ?? item?.name);
    if (!key) return null;
    const dataType = PAGE_DATA_TYPES.has(item?.dataType ?? item?.data_type) ? (item?.dataType ?? item?.data_type) : "text";
    return {
      key,
      label: safeString(item?.label, 120) || key,
      dataType,
      defaultValue: item?.defaultValue ?? item?.default_value ?? null,
      order: safeNumber(item?.order, index, { min: 0, max: 1000 }),
    };
  };
  return {
    parameters: (Array.isArray(source.parameters) ? source.parameters : []).map(normalize).filter(Boolean).slice(0, 50),
    variables: (Array.isArray(source.variables) ? source.variables : []).map(normalize).filter(Boolean).slice(0, 100),
  };
}

/** Component Registry keys that may hold children inside a Section. */
export function isContainerComponentKey(componentKey) {
  return componentKey === "container" || componentKey === "multi_container";
}

/** Component Registry keys the page tree may place as nodes. */
export function isNodeComponentKey(componentKey) {
  return componentKey !== "section";
}

function safeString(value, limit = 200) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, limit) : null;
}

function safeApiName(value) {
  return typeof value === "string" && /^[a-z_][a-z0-9_]*$/.test(value.trim()) ? value.trim() : null;
}

function safeNumber(value, fallback = null, { min = null, max = null } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  let next = num;
  if (min !== null) next = Math.max(min, next);
  if (max !== null) next = Math.min(max, next);
  return next;
}

/** Whitelisted Record Collection for any record-bound component. */
export function normalizeRecordCollection(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const conditions = Array.isArray(source.conditions) ? source.conditions
    .map((condition) => ({
      field: safeApiName(condition?.field) || "",
      // The canonical condition-engine operator vocabulary — the same operators
      // workflows and validation rules use. No page-specific operator set.
      operator: RECORD_CONDITION_OPERATORS.includes(condition?.operator) ? condition.operator : "equals",
      value: condition && ["string", "number", "boolean"].includes(typeof condition.value) ? condition.value : null,
    }))
    .filter((condition) => condition.field)
    .slice(0, 20)
    : [];
  const conditionMatch = source.conditionMatch === "any" ? "any" : "all";
  const sort = Array.isArray(source.sort) ? source.sort
    .map((entry) => ({ field: safeApiName(entry?.field) || "", direction: entry?.direction === "asc" ? "asc" : "desc" }))
    .filter((entry) => entry.field)
    .slice(0, 3)
    : [];
  return {
    objectKey: safeApiName(source.objectKey ?? source.object_key) || "",
    conditions,
    conditionMatch,
    sort,
    maxRecords: safeNumber(source.maxRecords ?? source.max_records, 10, { min: 1, max: MAX_RECORD_LIMIT }),
    pagination: source.pagination !== false,
    fields: Array.isArray(source.fields) ? source.fields.map(safeApiName).filter(Boolean).slice(0, 12) : [],
    titleField: safeApiName(source.titleField ?? source.title_field) || "",
    subtitleField: safeApiName(source.subtitleField ?? source.subtitle_field) || "",
  };
}

/*
 * NAVIGATION TARGET — the stable saved definition for On Click → Navigate.
 *
 * Only registry keys are persisted, never URLs or display labels: the runtime
 * re-resolves the target at click time through the ONE resolver
 * (src/utils/navigationTargets.js), so renamed pages, re-pointed objects and
 * permission changes can never leave a stale hard-coded route behind.
 *
 *   type system_page   → key = the navCatalogue page name (PAGE_SLUGS key)
 *   type custom_page   → key = platform_pages.page_key (company-scoped)
 *   type object_list   → key = Platform Object object_key
 *   type object_record → key = object_key, recordSource current|explicit,
 *                        recordId only for explicit (validated shape)
 */
export const NAVIGATION_TARGET_TYPES = Object.freeze(["system_page", "custom_page", "object_list", "object_record"]);

function normalizeNavigationTargetValue(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  if (!source || !NAVIGATION_TARGET_TYPES.includes(source.type)) return null;
  const key = typeof source.key === "string" ? source.key.trim().slice(0, 200) : "";
  if (!key) return null;
  if (source.type === "system_page") return { type: source.type, key };
  if (!/^[a-z_][a-z0-9_]*$/.test(key)) return null;
  if (source.type !== "object_record") return { type: source.type, key };
  const recordSource = source.recordSource === "explicit" ? "explicit" : "current";
  const target = { type: source.type, key, objectKey: key, recordSource };
  if (recordSource === "explicit") {
    const recordId = typeof source.recordId === "string" ? source.recordId.trim().slice(0, 64) : "";
    if (!/^[0-9a-fA-F-]{8,64}$/.test(recordId)) return null;
    target.recordId = recordId;
  }
  return target;
}

function normalizeInteraction(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = ON_CLICK_TYPES.includes(source.type ?? source.onClickType ?? source.on_click) ? (source.type ?? source.onClickType ?? source.on_click) : "none";
  return {
    type,
    // Stored as UUID/registry-key references — never display names (renames must
    // not break pages). Workflows are platform_rules rows; actions are keys of
    // the canonical Action Registry.
    workflowUuid: safeString(source.workflowUuid ?? source.workflow_uuid, 64) || null,
    actionKey: safeString(source.actionKey ?? source.action_key, 100) || null,
    navigateTo: safeString(source.navigateTo ?? source.navigate_to, 200) || null,
    /* Canonical navigation-target definition (custom_page pages today; the
       other destination types ride the same shape). Whichever of the two is
       populated wins — the legacy flat page-key stays readable. */
    navigationTarget: normalizeNavigationTargetValue(source.navigationTarget ?? source.navigation_target)
      || (source.navigateTo && !source.navigationTarget && !source.navigation_target
        ? { type: "custom_page", key: safeString(source.navigateTo, 200) }
        : null),
    formLayoutId: safeString(source.formLayoutId ?? source.form_layout_id, 64) || null,
    formPresentation: ["full_screen", "screen_modal", "compact_popup"].includes(source.formPresentation ?? source.form_presentation) ? (source.formPresentation ?? source.form_presentation) : "screen_modal",
    targetNodeId: safeString(source.targetNodeId ?? source.target_node_id, 100) || null,
    targetNodeLabel: safeString(source.targetNodeLabel ?? source.target_node_label, 200) || null,
    operation: ["set_record", "filter_collection", "set_value", "refresh"].includes(source.operation) ? source.operation : "set_record",
    sourceField: safeApiName(source.sourceField ?? source.source_field) || null,
    targetField: safeApiName(source.targetField ?? source.target_field) || null,
  };
}

function normalizeTreeViewConfig(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    parentField: safeApiName(source.parentField ?? source.parent_field) || "parent_id",
    labelField: safeApiName(source.labelField ?? source.label_field) || "name",
    secondaryField: safeApiName(source.secondaryField ?? source.secondary_field) || "status",
    rootFilter: safeString(source.rootFilter ?? source.root_filter, 200) || null,
    sort: Array.isArray(source.sort) ? source.sort.map((entry) => ({ field: safeApiName(entry?.field) || "", direction: entry?.direction === "asc" ? "asc" : "desc" })).filter((entry) => entry.field).slice(0, 3) : [],
    maxDepth: safeNumber(source.maxDepth ?? source.max_depth, 3, { min: 1, max: 6 }),
    showCounts: source.showCounts !== false,
    allowCollapse: source.allowCollapse !== false,
    defaultExpandedDepth: safeNumber(source.defaultExpandedDepth ?? source.default_expanded_depth, 1, { min: 0, max: 6 }),
  };
}

function normalizeAdvancedConfig(componentKey, value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const asApiName = (field, fallback = "") => safeApiName(field) || fallback;
  const asEnum = (field, values, fallback = values[0] || "") => (values.includes(field) ? field : fallback);
  const asBool = (field, fallback = false) => source[field] === undefined ? fallback : Boolean(source[field]);
  const titleField = asApiName(source.titleField ?? source.title_field, "name");
  const labelField = asApiName(source.labelField ?? source.label_field, "name");
  if (componentKey === "timeline") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      dateField: asApiName(source.dateField ?? source.date_field, "created_at"),
      titleField,
      secondaryField: asApiName(source.secondaryField ?? source.secondary_field, "status"),
      iconField: asApiName(source.iconField ?? source.icon_field),
      groupBy: asEnum(source.groupBy ?? source.group_by, ["none", "day", "month"], "none"),
      sort: (source.sort === "asc" || source.sort === "desc") ? source.sort : "desc",
      maxRecords: safeNumber(source.maxRecords ?? source.max_records, 10, { min: 1, max: 50 }),
      filters: Array.isArray(source.filters) ? source.filters.filter((entry) => entry && typeof entry === "object").slice(0, 6) : [],
    };
  }
  if (componentKey === "kanban") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      groupField: asApiName(source.groupField ?? source.group_field, "status"),
      titleField,
      subtitleField: asApiName(source.subtitleField ?? source.subtitle_field),
      imageField: asApiName(source.imageField ?? source.image_field),
      cardFields: Array.isArray(source.cardFields ?? source.card_fields) ? (source.cardFields ?? source.card_fields).map(asApiName).filter(Boolean).slice(0, 6) : [],
      columnOrder: Array.isArray(source.columnOrder ?? source.column_order) ? (source.columnOrder ?? source.column_order).map(String).filter(Boolean).slice(0, 12) : [],
      maxRecords: safeNumber(source.maxRecords ?? source.max_records, 10, { min: 1, max: 50 }),
      allowDragDrop: asBool("allowDragDrop", true),
    };
  }
  if (componentKey === "calendar") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      startField: asApiName(source.startField ?? source.start_field, "start_date"),
      endField: asApiName(source.endField ?? source.end_field, "end_date"),
      titleField,
      subtitleField: asApiName(source.subtitleField ?? source.subtitle_field),
      categoryField: asApiName(source.categoryField ?? source.category_field, "status"),
      defaultView: asEnum(source.defaultView ?? source.default_view, ["month", "week", "day"], "month"),
      createAction: asBool("createAction", false),
    };
  }
  if (componentKey === "scheduler") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      resourceField: asApiName(source.resourceField ?? source.resource_field, "assignee_id"),
      resourceLabelField: asApiName(source.resourceLabelField ?? source.resource_label_field, "name"),
      startField: asApiName(source.startField ?? source.start_field, "start_date"),
      endField: asApiName(source.endField ?? source.end_field, "end_date"),
      titleField,
      statusField: asApiName(source.statusField ?? source.status_field, "status"),
      workingHours: { start: source.workingHours?.start ?? "09:00", end: source.workingHours?.end ?? "17:00" },
      slotInterval: safeNumber(source.slotInterval ?? source.slot_interval, 30, { min: 15, max: 180 }),
    };
  }
  if (componentKey === "gantt") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      taskLabelField: asApiName(source.taskLabelField ?? source.task_label_field, "name"),
      startField: asApiName(source.startField ?? source.start_field, "start_date"),
      endField: asApiName(source.endField ?? source.end_field, "end_date"),
      progressField: asApiName(source.progressField ?? source.progress_field, "progress"),
      parentField: asApiName(source.parentField ?? source.parent_field),
      statusField: asApiName(source.statusField ?? source.status_field),
      scale: asEnum(source.scale, ["day", "week", "month"], "week"),
    };
  }
  if (componentKey === "map") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      locationMode: asEnum(source.locationMode ?? source.location_mode, ["latlng", "address"], "latlng"),
      latitudeField: asApiName(source.latitudeField ?? source.latitude_field, "latitude"),
      longitudeField: asApiName(source.longitudeField ?? source.longitude_field, "longitude"),
      addressField: asApiName(source.addressField ?? source.address_field),
      labelField,
      descriptionField: asApiName(source.descriptionField ?? source.description_field),
      popupFields: Array.isArray(source.popupFields ?? source.popup_fields) ? (source.popupFields ?? source.popup_fields).map(asApiName).filter(Boolean).slice(0, 6) : [],
      maxRecords: safeNumber(source.maxRecords ?? source.max_records, 10, { min: 1, max: 50 }),
      defaultZoom: safeNumber(source.defaultZoom ?? source.default_zoom, 10, { min: 1, max: 20 }),
    };
  }
  if (componentKey === "hierarchy_viewer") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      parentField: asApiName(source.parentField ?? source.parent_field, "parent_id"),
      titleField,
      subtitleFields: Array.isArray(source.subtitleFields ?? source.subtitle_fields) ? (source.subtitleFields ?? source.subtitle_fields).map(asApiName).filter(Boolean).slice(0, 4) : [],
      imageField: asApiName(source.imageField ?? source.image_field),
      statusField: asApiName(source.statusField ?? source.status_field),
      maxDepth: safeNumber(source.maxDepth ?? source.max_depth, 3, { min: 1, max: 6 }),
      orientation: asEnum(source.orientation, ["vertical", "horizontal"], "vertical"),
    };
  }
  if (componentKey === "file_viewer") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      fileRelationship: asApiName(source.fileRelationship ?? source.file_relationship),
      displayMode: asEnum(source.displayMode ?? source.display_mode, ["list", "grid", "preview"], "list"),
      filenameField: asApiName(source.filenameField ?? source.filename_field, "filename"),
      typeField: asApiName(source.typeField ?? source.type_field, "file_type"),
      dateField: asApiName(source.dateField ?? source.date_field, "created_at"),
      uploaderField: asApiName(source.uploaderField ?? source.uploader_field),
      allowedTypes: Array.isArray(source.allowedTypes ?? source.allowed_types) ? (source.allowedTypes ?? source.allowed_types).map(String).filter(Boolean).slice(0, 12) : [],
      maxItems: safeNumber(source.maxItems ?? source.max_items, 12, { min: 1, max: 100 }),
    };
  }
  if (componentKey === "signature") {
    return {
      objectKey: asApiName(source.objectKey ?? source.object_key),
      fieldKey: asApiName(source.fieldKey ?? source.field_key, "signature"),
      label: safeString(source.label, 120) || "Signature",
      required: asBool("required", false),
      allowClear: asBool("allowClear", true),
      displayMode: asEnum(source.displayMode ?? source.display_mode, ["capture", "readonly", "preview"], "capture"),
      width: safeNumber(source.width, 320, { min: 160, max: 960 }),
      height: safeNumber(source.height, 180, { min: 120, max: 600 }),
    };
  }
  return { ...source };
}

function normalizeComponentNode(node) {
  const componentKey = safeApiName(node?.componentKey ?? node?.component_key) || "text";
  const rawLayout = node?.layout && typeof node.layout === "object" && !Array.isArray(node.layout) ? node.layout : {};
  const base = {
    id: safeString(node?.id, 80) || null,
    componentKey,
    label: safeString(node?.label, 200) || null,
    visible: node?.visible !== false,
    enabled: node?.enabled !== false,
    required: node?.required === true,
    readOnly: node?.readOnly === true || node?.read_only === true,
    conditions: node?.conditions && typeof node.conditions === "object" && !Array.isArray(node.conditions) ? node.conditions : null,
    layout: {
      width: safeNumber(rawLayout.width, 0, { min: 0, max: 2400 }),
      height: safeNumber(rawLayout.height, 0, { min: 0, max: 1800 }),
    },
  };
  if (componentKey === "container") {
    return {
      ...base,
      componentKey,
      size: MULTI_GRID_SIZES.includes(node?.size) ? node.size : "medium",
      columns: safeNumber(node?.columns, 2, { min: 1, max: 3 }),
      spacing: safeNumber(node?.spacing, 3, { min: 1, max: 6 }),
      children: normalizeChildren(node?.children),
    };
  }
  if (componentKey === "multi_container") {
    return {
      ...base,
      componentKey,
      collection: normalizeRecordCollection(node?.collection ?? node?.record_collection),
      containerSize: MULTI_GRID_SIZES.includes(node?.containerSize ?? node?.container_size) ? (node?.containerSize ?? node?.container_size) : "medium",
      spacing: safeNumber(node?.spacing, 3, { min: 1, max: 6 }),
      clickable: node?.clickable !== false,
      interaction: normalizeInteraction(node?.interaction ?? node?.on_click),
    };
  }
  if (componentKey === "table") {
    /* Table/List consumes the SAME Record Collection datasource as
       MultiContainer — no separate query path, no extra endpoint. */
    return {
      ...base,
      componentKey,
      collection: normalizeRecordCollection(node?.collection ?? node?.record_collection),
      clickable: node?.clickable !== false,
      interaction: normalizeInteraction(node?.interaction ?? node?.on_click),
    };
  }
  if (componentKey === "button") {
    return {
      ...base,
      componentKey,
      variant: ["primary", "secondary", "ghost", "danger"].includes(node?.variant ?? node?.style) ? (node?.variant ?? node?.style) : "primary",
      size: ["small", "medium", "large"].includes(node?.size) ? node.size : "medium",
      interaction: normalizeInteraction(node?.interaction ?? node?.on_click),
    };
  }
  if (componentKey === "text" || componentKey === "header") {
    return {
      ...base,
      componentKey,
      text: safeString(node?.text ?? node?.label, 500) || "",
    };
  }
  if (componentKey === "field_value") {
    return { ...base, componentKey, field: safeApiName(node?.field) || "", interaction: normalizeInteraction(node?.interaction) };
  }
  if (componentKey === "related_list") {
    return { ...base, componentKey, relationshipKey: safeApiName(node?.relationshipKey ?? node?.relationship_key) || "", limit: safeNumber(node?.limit, 10, { min: 1, max: 50 }) };
  }
  if (["tree_view", "timeline", "kanban", "calendar", "scheduler", "gantt", "map", "hierarchy_viewer", "file_viewer", "signature"].includes(componentKey)) {
    const baseConfig = node && typeof node.config === "object" && !Array.isArray(node.config) ? node.config : (node && typeof node.settings === "object" && !Array.isArray(node.settings) ? node.settings : {});
    const config = componentKey === "tree_view" ? normalizeTreeViewConfig(baseConfig) : normalizeAdvancedConfig(componentKey, baseConfig);
    return {
      ...base,
      componentKey,
      collection: normalizeRecordCollection(node?.collection ?? node?.record_collection),
      config,
      clickable: node?.clickable !== false,
      interaction: normalizeInteraction(node?.interaction ?? node?.clickAction ?? node?.click_action ?? node?.on_click),
      clickAction: node?.clickAction ?? node?.click_action ?? null,
    };
  }
  return { ...base, componentKey };
}

function normalizeChildren(children) {
  if (!Array.isArray(children)) return [];
  return children
    .filter((child) => child && typeof child === "object" && !Array.isArray(child) && safeApiName(child?.componentKey ?? child?.component_key))
    .map(normalizeComponentNode)
    .slice(0, 40);
}

export function normalizeCustomPageTree(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const presentation = ["landing", "overlay_rectangle", "overlay_square"].includes(source.presentation_mode ?? source.presentationMode)
    ? (source.presentation_mode ?? source.presentationMode) : "landing";
  const device = ["desktop", "tablet", "mobile", "kiosk"].includes(source.device) ? source.device : "desktop";
  const resources = normalizePageResourceDefinitions(source.resources);

  /* Legacy flat pages (sections + components arrays) migrate in memory so an
     existing page keeps rendering instead of being dropped on the floor. */
  if (!Array.isArray(source.sections) || !source.sections.some((section) => section && Array.isArray(section.children))) {
    const legacySections = Array.isArray(source.sections) ? source.sections : [];
    const legacyComponents = Array.isArray(source.components) ? source.components : [];
    if (legacySections.length || legacyComponents.length) {
      return {
        device,
        presentation_mode: presentation,
        resources,
        sections: legacySections.map((section, index) => {
          const sectionId = String(section?.id || `section-${index + 1}`);
          const columns = Math.min(3, Math.max(1, Number(section?.columns) || 1));
          return {
            id: sectionId,
            width: columns === 2 ? "half" : columns === 3 ? "third" : "full",
            children: legacyComponents
              .filter((component) => component?.section_id === sectionId)
              .map((component, componentIndex) => ({
                id: String(component?.id || `${component?.component_key || component?.type || "component"}-${componentIndex + 1}`),
                componentKey: String(component?.component_key || component?.type || "text"),
                label: safeString(component?.label, 200),
                visible: component?.visible !== false,
                ...(component?.component_key === "multi_container" || component?.type === "multi_container"
                  ? { collection: normalizeRecordCollection(component?.collection), clickable: component?.clickable !== false }
                  : {}),
              })),
          };
        }),
      };
    }
    return { device, presentation_mode: presentation, resources, sections: [] };
  }

  const sections = source.sections.map((section, index) => ({
    id: safeString(section?.id, 80) || `section-${index + 1}`,
    width: SECTION_WIDTHS[section?.width] ? section.width : "full",
    visible: section?.visible !== false,
    children: normalizeChildren(section?.children),
  }));
  return { device, presentation_mode: presentation, resources, sections };
}

/*
 * DRAG/DROP VALIDATION — the builder and its tests share this rule set.
 *
 *   section body (parentComponentKey null or "SECTION")
 *             ← section reorders, containers, multi_containers, leaf components
 *   container ← leaf components and other containers (any mix)
 *   multi_container / leaf nodes accept NO children.
 *
 * Sections themselves only ever reorder at the top level — they are never
 * dropped INTO another parent.
 */
export function canDropNode({ parentComponentKey = null, droppedComponentKey, droppedIsSection = false }) {
  const sectionLevel = parentComponentKey === null || parentComponentKey === "SECTION";
  if (droppedIsSection) return sectionLevel;
  if (sectionLevel) return true; // the section body accepts every node kind
  /* Record-bound components accept NO children: their content comes from the
     Record Collection, not from nested nodes. Ordinary Containers may nest
     (a full-width header above a two-column pair is a normal case). */
  if (parentComponentKey === "multi_container" || parentComponentKey === "table") return false;
  return true;
}

export function canReorderInto({ parentComponentKey = null, movingComponentKey }) {
  return canDropNode({ parentComponentKey, droppedComponentKey: movingComponentKey, droppedIsSection: false });
}

export function nodeLabel(node) {
  return node?.label || ({
    container: "Container",
    multi_container: "MultiContainer",
    table: "Table",
    tree_view: "Tree View",
    timeline: "Timeline",
    kanban: "Kanban",
    calendar: "Calendar",
    scheduler: "Scheduler",
    gantt: "Gantt",
    map: "Map",
    hierarchy_viewer: "Hierarchy Viewer",
    file_viewer: "File Viewer",
    signature: "Signature",
    button: "Button",
    text: "Text",
    header: "Heading",
    divider: "Divider",
    spacer: "Spacer",
    field_value: "Field Value",
    related_list: "Related List",
  }[node?.componentKey] || node?.componentKey || "Component");
}

/** Responsive card grid: section width × container size × device → column count. */
export function multiContainerColumns({ sectionWidth = "full", containerSize = "medium", device = "desktop" }) {
  const base = { full: { small: 5, medium: 4, large: 3 }, half: { small: 3, medium: 2, large: 2 }, third: { small: 2, medium: 1, large: 1 } };
  const desktop = base[sectionWidth]?.[containerSize] ?? base.full[containerSize] ?? 3;
  if (device === "mobile") return sectionWidth === "full" && containerSize === "small" ? 2 : 1;
  if (device === "tablet") return Math.max(1, desktop - 1);
  if (device === "kiosk") return Math.max(1, desktop - 1);
  return desktop;
}

/** Unique ids for builder-created nodes. */
export function makeNodeId(componentKey) {
  return `${componentKey}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

/** Deep node lookup. */
export function findNode(sections, nodeId, parentComponentKey = null) {
  for (const section of sections || []) {
    const visit = (nodes, parentKey) => {
      for (const node of nodes) {
        if (node.id === nodeId) return { node, parentComponentKey: parentKey };
        if (Array.isArray(node.children)) {
          const hit = visit(node.children, node.componentKey);
          if (hit) return hit;
        }
      }
      return null;
    };
    const hit = visit(section.children, null);
    if (hit) return hit;
  }
  return null;
}

/** Immutable tree update applied by every builder mutation (undo-friendly). */
export function updateNodeInSections(sections, nodeId, updater) {
  const walk = (nodes) => nodes.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (Array.isArray(node.children)) return { ...node, children: walk(node.children) };
    return node;
  });
  return sections.map((section) => (section.children ? { ...section, children: walk(section.children) } : section));
}

export function removeNodeFromSections(sections, nodeId) {
  const walk = (nodes) => nodes.filter((node) => node.id !== nodeId).map((node) => (Array.isArray(node.children) ? { ...node, children: walk(node.children) } : node));
  return sections.map((section) => ({ ...section, children: walk(section.children) }));
}

export function duplicateNodeInSections(sections, nodeId) {
  const walk = (nodes) => nodes.flatMap((node) => {
    if (node.id === nodeId) {
      const clone = (source) => ({
        ...source,
        id: makeNodeId(source.componentKey),
        ...(Array.isArray(source.children) ? { children: source.children.map(clone) } : {}),
      });
      return [node, clone(node)];
    }
    return Array.isArray(node.children) ? [{ ...node, children: walk(node.children) }] : [node];
  });
  return sections.map((section) => ({ ...section, children: walk(section.children) }));
}

/** Move node within/across parents; drops are validated with canDropNode. */
export function moveNodeInSections(sections, { nodeId, targetParentKey, targetIndex, targetSectionId }) {
  let moving = null;
  const detach = (nodes) => nodes.filter((node) => {
    if (node.id === nodeId) { moving = node; return false; }
    return true;
  }).map((node) => (Array.isArray(node.children) ? { ...node, children: detach(node.children) } : node));

  const nextSections = sections.map((section) => {
    if (section.id === targetSectionId) return { ...section, children: detach(section.children) };
    return { ...section, children: detach(section.children) };
  });
  if (!moving) return sections;

  if (targetParentKey === "SECTION") {
    const next = nextSections.map((section) => (section.id === targetSectionId
      ? { ...section, children: insertAt(section.children, moving, targetIndex) }
      : section));
    return next;
  }
  const inserted = nextSections.map((section) => ({
    ...section,
    children: walkInsert(section.children, { nodeId: targetParentKey, child: moving, index: targetIndex }),
  }));
  return inserted.some((section, index) => section !== sections[index]) ? inserted : sections;
}

function insertAt(nodes, child, index) {
  const next = [...nodes];
  const at = Math.min(Math.max(index ?? next.length, 0), next.length);
  next.splice(at, 0, child);
  return next;
}

function walkInsert(nodes, { nodeId, child, index }) {
  return nodes.map((node) => {
    if (node.id === nodeId && Array.isArray(node.children)) {
      return { ...node, children: insertAt(node.children, child, index) };
    }
    if (Array.isArray(node.children)) return { ...node, children: walkInsert(node.children, { nodeId, child, index }) };
    return node;
  });
}
