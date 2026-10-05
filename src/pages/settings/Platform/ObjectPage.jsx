import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import ObjectSearch from "./ObjectSearch.jsx";
import FormRenderer from "./FormRenderer.jsx";
import RecordModal from "../../../components/RecordModal.jsx";
import ObjectHistory from "./ObjectHistory.jsx";
import ObjectRecordDetail from "./ObjectRecordDetail.jsx";
import RecordListView from "../../../platform/records/RecordListView.jsx";
import { formatRecordDisplayValue, isTechnicalRecordField } from "../../../utils/recordDisplay.js";
import { evaluatePlatformCondition } from "../../../utils/platformConditions.js";

function getObjectKey(object) {
  return (
    object?.objectKey ||
    object?.object_key ||
    object?.apiName ||
    object?.api_name ||
    object?.key ||
    ""
  );
}

function getSearchValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return (
      value.label ||
      value.name ||
      value.title ||
      value.value ||
      value.id ||
      JSON.stringify(value)
    );
  }

  return String(value);
}

function getObjectLabel(object) {
  return (
    object?.label ||
    object?.name ||
    object?.objectName ||
    object?.object_name ||
    getObjectKey(object) ||
    "Object"
  );
}

function getFieldKey(field) {
  return (
    field?.apiName ||
    field?.api_name ||
    field?.fieldKey ||
    field?.field_key ||
    field?.name ||
    ""
  );
}

function getFieldLabel(field) {
  return (
    field?.label ||
    field?.name ||
    getFieldKey(field) ||
    "Field"
  );
}

function getFieldType(field) {
  if ((field?.fieldType || field?.field_type) === "formula") return field?.config?.resultType || "text";
  return (
    field?.fieldType ||
    field?.field_type ||
    field?.type ||
    "text"
  );
}

function getFieldValue(record, field) {
  const key = getFieldKey(field);

  if (!key) {
    return undefined;
  }

  if (
    record &&
    Object.prototype.hasOwnProperty.call(record, key)
  ) {
    return record[key];
  }

  const sourceColumn =
    field?.sourceColumn ||
    field?.source_column ||
    field?.databaseColumn ||
    field?.database_column;

  if (
    sourceColumn &&
    record &&
    Object.prototype.hasOwnProperty.call(
      record,
      sourceColumn
    )
  ) {
    return record[sourceColumn];
  }

  return undefined;
}

function layoutPresentationClass(layout) {
  const mode = layout?.definition?.presentation_mode || "inline";
  return mode === "overlay_square"
    ? "platform-record-modal-compact"
    : mode === "overlay_rectangle"
      ? "platform-record-modal-rectangle"
      : "platform-record-modal-inline";
}

function formatValue(value, field) {
  return formatRecordDisplayValue(value, field);
}

function ObjectKanban({ records, fields, onSelect, onMove, canEdit }) {
  const groupField = fields.find((field) => ["select", "picklist"].includes(field?.field_type));
  if (!groupField) {
    return <div className="platform-object-empty compact"><strong>Kanban needs a picklist field</strong><span>Add or expose a picklist field to group records into columns.</span></div>;
  }
  const key = getFieldKey(groupField);
  const options = Array.isArray(groupField.options) ? groupField.options : [];
  const groups = options.length
    ? options.map((option) => ({ value: typeof option === "object" ? option.value ?? option.key ?? option.label : option, label: typeof option === "object" ? option.label ?? option.name ?? option.value : option }))
    : [...new Set(records.map((record) => record?.[key]).filter((value) => value !== null && value !== undefined && value !== ""))].map((value) => ({ value, label: value }));
  const titleField = fields.find((field) => !["boolean", "formula", "rollup"].includes(field?.field_type)) || fields[0];

  return (
    <div className="platform-kanban">
      {groups.map((group) => {
        const cards = records.filter((record) => String(record?.[key] ?? "") === String(group.value ?? ""));
        return (
          <section
            className="platform-kanban-column"
            key={String(group.value)}
            onDragOver={(event) => { if (canEdit) event.preventDefault(); }}
            onDrop={(event) => {
              if (!canEdit || !onMove) return;
              event.preventDefault();
              const recordId = event.dataTransfer.getData("text/plain");
              const record = records.find((item) => String(item?.id || item?.record_id) === String(recordId));
              if (record) onMove(record, groupField, group.value);
            }}
          >
            <header><strong>{String(group.label)}</strong><span>{cards.length}</span></header>
            <div className="platform-kanban-cards">
              {cards.map((record) => (
                <button
                  type="button"
                  draggable={canEdit}
                  key={record.id || record.record_id}
                  className="platform-kanban-card"
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", String(record.id || record.record_id))}
                  onClick={() => onSelect?.(record)}
                >
                  <strong>{formatRecordDisplayValue(getFieldValue(record, titleField), titleField)}</strong>
                  <span>{getFieldLabel(groupField)} · {String(group.label)}</span>
                </button>
              ))}
              {!cards.length ? <div className="platform-kanban-empty">No records</div> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function ObjectPage({
  objectKey,
  objectId,
  object: suppliedObject,
  recordId,
  suppliedRecord,
  fields: suppliedFields = null,
  onBack,
  onSelectRecord,
  renderRecordActions,
  appKey = "",
}) {
  const [objectMetadata, setObjectMetadata] =
    useState(suppliedObject || null);

  const [fields, setFields] = useState([]);
  const [recordTypes, setRecordTypes] = useState([]);
  const [recordModal, setRecordModal] = useState(null);
  const [selectedRecordTypeId, setSelectedRecordTypeId] = useState("");
  const [records, setRecords] = useState(
    suppliedRecord
      ? [suppliedRecord]
      : []
  );

  const [selectedRecord, setSelectedRecord] =
    useState(suppliedRecord || null);
  const [history, setHistory] = useState([]);
  const [detailLayout, setDetailLayout] = useState(null);
  const [compactLayout, setCompactLayout] = useState(null);
  const [createLayout, setCreateLayout] = useState(null);
  const [editLayout, setEditLayout] = useState(null);
  const [quickCreateLayout, setQuickCreateLayout] = useState(null);
  const [relatedLists, setRelatedLists] = useState({});
  const relatedSearchTimers = useRef({});
  const [executingAction, setExecutingAction] = useState("");
  const [recordButtons, setRecordButtons] = useState([]);
  const [listButtons, setListButtons] = useState([]);
  const [bulkEditFieldKey, setBulkEditFieldKey] = useState("");
  const [approvalState,setApprovalState]=useState(null);
  const [approvalComment,setApprovalComment]=useState("");
  const [uiContext, setUiContext] = useState({ permissions: [], entitlements: [] });

  const [loading, setLoading] = useState(
    !suppliedObject
  );

  const [recordsLoading, setRecordsLoading] =
    useState(false);

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [listViews, setListViews] = useState([]);
  const [activeListViewId, setActiveListViewId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [recordTotal, setRecordTotal] = useState(0);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [runtimeSort, setRuntimeSort] = useState({ key: "", direction: "asc" });
  const [runtimeFilters, setRuntimeFilters] = useState({});
  const [visibleColumnKeys, setVisibleColumnKeys] = useState([]);
  const [listViewDialog, setListViewDialog] = useState(null);
  const [displayMode, setDisplayMode] = useState("split");
  const [formFactor, setFormFactor] = useState(() => {
    if (typeof window === "undefined") return "desktop";
    if (window.innerWidth <= 650) return "mobile";
    if (window.innerWidth <= 1024) return "tablet";
    return "desktop";
  });
  const activeFields = useMemo(
    () => fields.filter((field) => field?.active !== false && !isTechnicalRecordField(field)),
    [fields]
  );
  const compactHighlightFields = useMemo(() => {
    const byKey = new Map(activeFields.map((field) => [getFieldKey(field), field]));
    const configured = Array.isArray(compactLayout?.definition?.components)
      ? compactLayout.definition.components
          .filter((component) => component?.type === "field" && component?.visible !== false)
          .map((component) => byKey.get(component.field_key || component.fieldKey || component.api_name))
          .filter(Boolean)
      : [];
    const fallback = activeFields.filter((field) => field?.readable !== false && !["json", "long_text", "rich_text"].includes(getFieldType(field)));
    const limit = formFactor === "mobile" ? 10 : 7;
    return (configured.length ? configured : fallback).slice(0, limit);
  }, [activeFields, compactLayout, formFactor]);
  const activeListView = useMemo(
    () => listViews.find((view) => String(view.id) === String(activeListViewId)) || null,
    [listViews, activeListViewId]
  );
  const displayedListFields = useMemo(() => {
    const byKey = new Map(activeFields.map((field) => [getFieldKey(field), field]));
    const keys = visibleColumnKeys.length ? visibleColumnKeys : activeFields.map(getFieldKey);
    return keys.map((key) => byKey.get(key)).filter(Boolean);
  }, [activeFields, visibleColumnKeys]);
  const bulkEditableFields = useMemo(
    () => activeFields.filter((field) => field?.writable !== false && !["formula", "rollup"].includes(field?.field_type)),
    [activeFields]
  );
  /* Every Platform Object uses the same metadata record command surface.
     A pre-supplied fields list marks the self-service READ-ONLY profile view:
     the shell opened one specific record (the signed-in user's own), so the
     admin-only metadata commands (record buttons, create/quick-create, edit
     lifecycle) stay out of the surface instead of 403-ing at click time. */
  const canWriteRecords = !suppliedFields;
  const selfServiceView = Boolean(suppliedFields);
  const resolvedObjectKey = useMemo(
    () =>
      objectKey ||
      getObjectKey(suppliedObject),
    [objectKey, suppliedObject]
  );

  useEffect(() => {
    if (!suppliedObject && resolvedObjectKey) {
      loadObject();
    }
  }, [resolvedObjectKey, suppliedObject]);

  useEffect(() => {
    if (!activeFields.length) {
      setVisibleColumnKeys([]);
      return;
    }
    const valid = new Set(activeFields.map(getFieldKey));
    const configured = Array.isArray(activeListView?.columns)
      ? activeListView.columns.filter((key) => valid.has(key))
      : [];
    setVisibleColumnKeys(configured.length ? configured : activeFields.map(getFieldKey));
    setRuntimeSort({
      key: activeListView?.sort?.field || "",
      direction: activeListView?.sort?.direction === "desc" ? "desc" : "asc",
    });
    setRuntimeFilters(
      activeListView?.filter_model && typeof activeListView.filter_model === "object"
        ? activeListView.filter_model
        : {}
    );
  }, [activeListViewId, listViews, activeFields]);

  useEffect(() => {
    if (objectMetadata) {
      loadFields();
      loadUiContext();
      if (!selfServiceView) {
        loadRecordButtons();
        loadListViews();
      }
    }
  }, [objectMetadata]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateFormFactor = () => {
      const next = window.innerWidth <= 650 ? "mobile" : window.innerWidth <= 1024 ? "tablet" : "desktop";
      setFormFactor((current) => current === next ? current : next);
    };
    window.addEventListener("resize", updateFormFactor);
    updateFormFactor();
    return () => window.removeEventListener("resize", updateFormFactor);
  }, []);

  useEffect(() => {
    if (!objectMetadata || selfServiceView) return;
    loadDetailLayout();
  }, [
    objectMetadata,
    selectedRecord?.recordTypeId,
    selectedRecord?.record_type_id,
    selectedRecordTypeId,
    formFactor,
    appKey,
    selfServiceView,
  ]);


  useEffect(() => {
    if (
      objectMetadata &&
      !suppliedRecord
    ) {
      loadRecords();
    }
  }, [
    objectMetadata,
    recordId,
    suppliedRecord,
    activeListViewId,
    page,
  ]);

  useEffect(() => {
    if (!objectMetadata || suppliedRecord) return undefined;
    const timer = window.setTimeout(() => {
      setPage(1);
      loadRecords({ pageOverride: 1, searchOverride: search });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, runtimeSort, runtimeFilters]);

  useEffect(() => {
    const key = getObjectKey(objectMetadata);
    const id = selectedRecord?.id || selectedRecord?.record_id;
    if (!key || !id) {
      setHistory([]);
      return;
    }
    /* Self-service profile view: record history is an admin metadata read,
       so it stays out of the surface (the API would refuse it for a caller
       without the object's view grant). */
    if (selfServiceView) {
      setHistory([]);
      return;
    }
    apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records/${id}/history`)
      .then((response) => setHistory(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => setError(err?.message || "Unable to load record history."));
  }, [objectMetadata, selectedRecord, selfServiceView]);

  useEffect(()=>{ loadApprovalState(); },[objectMetadata,selectedRecord,selfServiceView]);

  async function loadApprovalState(){
    const key=getObjectKey(objectMetadata); const id=selectedRecord?.id||selectedRecord?.record_id;
    if(!key||!id||selfServiceView){setApprovalState(null);return;}
    try{const response=await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(id)}/approval`);setApprovalState(response?.data||null);}
    catch{setApprovalState(null);}
  }

  async function submitForApproval(){
    const key=getObjectKey(objectMetadata); const id=selectedRecord?.id||selectedRecord?.record_id;
    if(!key||!id)return;
    try{await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records/${encodeURIComponent(id)}/submit-approval`,{method:"POST",body:JSON.stringify({comment:approvalComment})});setApprovalComment("");await loadApprovalState();}
    catch(err){setError(err?.message||"Unable to submit for approval.");}
  }

  useEffect(() => {
    const components = detailLayout?.definition?.components || [];
    setRelatedLists({});
    if (!selectedRecord || !components.length) return;
    components
      .filter((component) => component.type === "related_list" && component.visible !== false)
      .filter((component) => !relatedLists[component.relationship_key])
      .forEach((component) => {
        loadRelatedList(component).catch((err) => setError(err?.message || "Unable to load related records."));
      });
  }, [detailLayout, selectedRecord]);

  async function loadObject() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest(
        `/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}`
      );

      const object =
        data?.object ||
        data?.data?.object ||
        data?.data ||
        data;

      setObjectMetadata(object);
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load object metadata."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadUiContext() {
    try {
      const response = await apiRequest("/api/platform/runtime/ui-context");
      const data = response?.data || {};
      setUiContext({
        ...data,
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        entitlements: Array.isArray(data.entitlements) ? data.entitlements : [],
      });
    } catch {
      setUiContext({ permissions: [], entitlements: [] });
    }
  }

  async function loadFields() {
    /* Self-service profile view: the shell pre-loaded the canonical readable
       fields through the runtime feed — no admin metadata calls here. */
    if (suppliedFields) {
      setFields(Array.isArray(suppliedFields) ? suppliedFields.filter((field) => field?.active !== false) : []);
      return;
    }
    const id =
      objectMetadata?.id ||
      objectMetadata?.object_id;

    if (!id) {
      return;
    }

    try {
      const data = await apiRequest(
        `/api/platform/objects/${id}/fields`
      );

      const loaded =
        data?.fields ||
        data?.data?.fields ||
        (Array.isArray(data?.data) ? data.data : null) ||
        (Array.isArray(data) ? data : []);

      setFields(
        Array.isArray(loaded)
          ? loaded.filter(
              (field) =>
                field?.active !== false
            )
          : []
      );
      const typesData = await apiRequest(`/api/platform/objects/${id}/record-types`);
      const loadedTypes = Array.isArray(typesData?.data) ? typesData.data : [];
      setRecordTypes(loadedTypes);
      setSelectedRecordTypeId((current) =>
        current || loadedTypes.find((type) => type.is_default)?.id || ""
      );
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load object fields."
      );
    }
  }

  async function loadListViews() {
    if (selfServiceView) return;
    const objectId = objectMetadata?.id || objectMetadata?.object_id;
    if (!objectId) return;
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/list-views`);
      const views = Array.isArray(response?.data) ? response.data : [];
      setListViews(views);
      setActiveListViewId((current) => current || views.find((view) => view.is_pinned)?.id || views.find((view) => view.is_default)?.id || views[0]?.id || "");
    } catch {
      setListViews([]);
    }
  }

  async function persistListView(mode = "create", draft = null) {
    const objectId = objectMetadata?.id || objectMetadata?.object_id;
    if (!objectId) return;
    const editing = mode === "edit" ? activeListView : null;
    if (mode === "edit" && (!editing || editing.can_edit !== true)) {
      setError("This list view is read-only.");
      return;
    }
    const label = (draft?.label || editing?.label || "").trim();
    if (!label) {
      setError("Enter a list view name.");
      return;
    }
    const columns = visibleColumnKeys.length ? visibleColumnKeys : activeFields.map(getFieldKey);
    if (!columns.length) {
      setError("Choose at least one column.");
      return;
    }
    try {
      const payload = {
        label,
        description: draft?.description ?? editing?.description ?? "",
        columns,
        filters: {},
        filterModel: runtimeFilters || {},
        sort: { field: runtimeSort?.key || null, direction: runtimeSort?.direction || "asc" },
        pageSize,
        ...(mode === "create" ? { visibilityScope: "private", pin: draft?.pin === true } : {}),
      };
      const response = await apiRequest(
        mode === "edit"
          ? `/api/platform/list-views/${encodeURIComponent(editing.id)}`
          : `/api/platform/objects/${encodeURIComponent(objectId)}/list-views`,
        { method: mode === "edit" ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      const saved = response?.data;
      setListViewDialog(null);
      await loadListViews();
      if (saved?.id) setActiveListViewId(saved.id);
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to save list view.");
    }
  }

  async function pinActiveListView() {
    const objectId = objectMetadata?.id || objectMetadata?.object_id;
    if (!objectId || !activeListView) return;
    const unpin = activeListView.is_pinned === true;
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/list-view-preference`, {
        method: "PUT",
        body: JSON.stringify({ listViewId: unpin ? null : activeListView.id }),
      });
      await loadListViews();
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to update pinned list view.");
    }
  }

  async function deleteActiveListView() {
    if (!activeListView?.id || activeListView.can_edit !== true) return;
    if (!window.confirm(`Delete list view "${activeListView.label}"?`)) return;
    try {
      await apiRequest(`/api/platform/list-views/${encodeURIComponent(activeListView.id)}`, { method: "DELETE" });
      setActiveListViewId("");
      await loadListViews();
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to delete list view.");
    }
  }

  async function loadRecordButtons() {
    if (selfServiceView) return;
    const key = getObjectKey(objectMetadata);
    if (!key) return;
    try {
      const response = await apiRequest(`/api/platform/runtime/objects/${encodeURIComponent(key)}/buttons`);
      const buttons = Array.isArray(response?.data) ? response.data : [];
      setRecordButtons(buttons.filter((button) => button.active !== false && (!button.placement || ["record", "detail", "view"].includes(button.placement))));
      setListButtons(buttons.filter((button) => button.active !== false && ["list", "bulk", "mass"].includes(button.placement)));
    } catch {
      setRecordButtons([]);
      setListButtons([]);
    }
  }

  function effectiveLayoutUrl(pageType, recordTypeId = "") {
    const objectId = objectMetadata?.id;
    const query = new URLSearchParams({
      objectId: String(objectId || ""),
      pageType,
      formFactor,
    });
    if (recordTypeId) query.set("recordTypeId", recordTypeId);
    if (appKey) query.set("appKey", appKey);
    return `/api/platform/layouts/effective?${query.toString()}`;
  }

  async function loadDetailLayout() {
    const objectId = objectMetadata?.id;
    if (!objectId) return;
    const recordTypeId = selectedRecord?.recordTypeId || selectedRecord?.record_type_id || "";
    try {
      const [detailResponse, compactResponse, createResponse, editResponse, quickResponse] = await Promise.all([
        apiRequest(effectiveLayoutUrl("detail", recordTypeId)),
        apiRequest(effectiveLayoutUrl("compact", recordTypeId)),
        apiRequest(effectiveLayoutUrl("create", selectedRecordTypeId || "")),
        apiRequest(effectiveLayoutUrl("edit", recordTypeId)),
        apiRequest(effectiveLayoutUrl("quick_create", selectedRecordTypeId || "")),
      ]);
      setDetailLayout(detailResponse?.data || null);
      setCompactLayout(compactResponse?.data || null);
      setCreateLayout(createResponse?.data || null);
      setEditLayout(editResponse?.data || null);
      setQuickCreateLayout(quickResponse?.data || null);
    } catch {
      setDetailLayout(null);
      setCompactLayout(null);
      setCreateLayout(null);
      setEditLayout(null);
      setQuickCreateLayout(null);
    }
  }

  async function loadRelatedList(component, options = {}) {
    const relationshipKey = component?.relationship_key;
    const parentId = selectedRecord?.id || selectedRecord?.record_id;
    if (!relationshipKey || !parentId || !objectMetadata?.object_key) return;
    const current = relatedLists[relationshipKey] || {};
    const page = Math.max(1, Number(options.page ?? current.page ?? 1) || 1);
    const pageSize = Math.min(Math.max(Number(component.limit || current.pageSize || 25) || 25, 1), 100);
    const search = options.search !== undefined ? options.search : (current.search || "");
    const sort = options.sort || current.sort || {
      key: component.sort_field || "",
      direction: component.sort_direction === "desc" ? "desc" : "asc",
    };
    const filters = options.filters || current.filters || {};
    setRelatedLists((state) => ({
      ...state,
      [relationshipKey]: {
        ...(state[relationshipKey] || {}),
        loading: true,
        error: "",
        page,
        pageSize,
        search,
        sort,
        filters,
      },
    }));
    try {
      const query = new URLSearchParams();
      query.set("page", String(page));
      query.set("pageSize", String(pageSize));
      query.set("filterModel", JSON.stringify(filters || {}));
      if (search.trim()) query.set("search", search.trim());
      if (sort?.key) {
        query.set("sortField", sort.key);
        query.set("sortDirection", sort.direction || "asc");
      }
      const response = await apiRequest(
        `/api/platform/objects/${encodeURIComponent(getObjectKey(objectMetadata))}/records/${encodeURIComponent(parentId)}/related/${encodeURIComponent(relationshipKey)}?${query.toString()}`
      );
      const records = response?.records || response?.data || [];
      const relationship = response?.relationship || {};
      let childFields = current.fields || [];
      if (!childFields.length && relationship.child_object_id) {
        const childFieldsResponse = await apiRequest(`/api/platform/objects/${relationship.child_object_id}/fields`);
        childFields = childFieldsResponse?.data || [];
      }
      setRelatedLists((state) => ({
        ...state,
        [relationshipKey]: {
          records: Array.isArray(records) ? records : [],
          fields: childFields,
          relationship,
          loading: false,
          error: "",
          total: Number(response?.total ?? records?.length ?? 0),
          page: Number(response?.page ?? page),
          pageSize: Number(response?.pageSize ?? pageSize),
          search,
          sort,
          filters,
        },
      }));
    } catch (error) {
      setRelatedLists((state) => ({
        ...state,
        [relationshipKey]: {
          ...(state[relationshipKey] || {}),
          loading: false,
          error: error?.message || "Unable to load related records.",
        },
      }));
      throw error;
    }
  }

  function changeRelatedSearch(component, value) {
    const key = component?.relationship_key;
    if (!key) return;
    setRelatedLists((current) => ({
      ...current,
      [key]: { ...(current[key] || {}), search: value, page: 1 },
    }));
    if (relatedSearchTimers.current[key]) window.clearTimeout(relatedSearchTimers.current[key]);
    relatedSearchTimers.current[key] = window.setTimeout(() => {
      loadRelatedList(component, { page: 1, search: value }).catch((err) => setError(err?.message || "Unable to search related records."));
    }, 220);
  }


  async function saveEditedRecord(values) {
    const id = selectedRecord?.id || selectedRecord?.record_id;
    await apiRequest(`/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${id}`, {
      method: "PUT",
      body: JSON.stringify({ data: values }),
    });
    setRecordModal(null);
    await loadRecords();
  }
  async function updateProcessStage(fieldKey, nextValue) {
    const recordKey = selectedRecord?.id || selectedRecord?.record_id;
    if (!recordKey || !fieldKey || !canWriteRecords) return;
    setExecutingAction(`process:${fieldKey}`);
    setError("");
    try {
      const response = await apiRequest(
        `/api/platform/objects/${encodeURIComponent(getObjectKey(objectMetadata))}/records/${encodeURIComponent(recordKey)}`,
        { method: "PUT", body: JSON.stringify({ data: { [fieldKey]: nextValue } }) }
      );
      if (response?.data) setSelectedRecord((current) => ({ ...(current || {}), ...response.data }));
      await loadRecords();
    } catch (err) {
      setError(err?.message || "Unable to update process stage.");
    } finally {
      setExecutingAction("");
    }
  }


  async function deleteSelectedRecord() {
    const id = selectedRecord?.id || selectedRecord?.record_id;
    if (!window.confirm("Delete this record?")) return;
    await apiRequest(`/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${id}`, { method: "DELETE" });
    setSelectedRecord(null);
    await loadRecords();
  }

  async function createRelatedRecord(component) {
    const relationshipKey = component?.relationship_key;
    const relationship = (await apiRequest("/api/platform/relationships")).data?.find(
      (item) => item.relationship_key === relationshipKey && String(item.parent_object_id) === String(objectMetadata?.id)
    );
    if (!relationship) throw new Error("Relationship not found");
    const childObject = await apiRequest(`/api/platform/objects/${relationship.child_object_id}`);
    const child = childObject?.data || childObject?.object || childObject;
    const childKey = getObjectKey(child);
    const childFields = (await apiRequest(`/api/platform/objects/${relationship.child_object_id}/fields`)).data || [];
    const childField = childFields.find((field) => String(field.id) === String(relationship.child_field_id));
    const parentId = selectedRecord?.id || selectedRecord?.record_id;
    if (!childKey || !childField || !parentId) throw new Error("Related record configuration is incomplete");
    const initialValues = { [childField.api_name || childField.source_column]: parentId };
    setRecordModal({ type: "create", childKey, fields: childFields, initialValues, relationship });
  }

  async function createRecord(values) {
    const creating = recordModal?.type === "create" ? recordModal : null;
    const key = creating?.childKey || getObjectKey(objectMetadata);
    const initialValues = creating?.initialValues || {};
    const payload = { ...initialValues, ...values };
    await apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records`, {
      method: "POST",
      body: JSON.stringify({ data: payload, recordTypeId: creating?.childKey ? null : selectedRecordTypeId || null }),
    });
    setRecordModal(null);
    await loadRecords();
    if (creating?.relationship) {
      const component = (detailLayout?.definition?.components || []).find((item) => item.relationship_key === creating.relationship.relationship_key);
      if (component) await loadRelatedList(component);
    }
  }

  function runtimeExecutionQuery() {
    const query = new URLSearchParams({ formFactor });
    if (appKey) query.set("appKey", appKey);
    return query.toString();
  }

  function resolveMetadataUrl(template, record = {}) {
    const raw = String(template || "").replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, (_match, path) => {
      const value = String(path).split(".").reduce((current, key) => current == null ? undefined : current[key], record);
      return encodeURIComponent(value == null ? "" : String(value));
    });
    if (raw.startsWith("/") && !raw.startsWith("//")) return { url: raw, external: false };
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "https:") return { url: parsed.toString(), external: true };
    } catch {}
    return null;
  }

  async function handleMetadataButton(button) {
    const targetType = button?.target_type || "action";
    const targetKey = button?.target_key || button?.action_key;
    if (targetType === "action" && targetKey === "RECORD_SAVE") return setRecordModal({ type: "edit" });
    if (targetType === "action" && targetKey === "RECORD_DELETE") return deleteSelectedRecord();
    if (targetType === "url") {
      const resolved = resolveMetadataUrl(targetKey, selectedRecord || {});
      if (!resolved) return setError("This button has an unsafe or invalid URL.");
      if (resolved.external) window.open(resolved.url, "_blank", "noopener,noreferrer");
      else window.location.assign(resolved.url);
      return;
    }
    const recordKey = selectedRecord?.id || selectedRecord?.record_id;
    if (!recordKey || !button?.button_key) return setError("A record and registered button are required.");
    setExecutingAction(button.button_key);
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(getObjectKey(objectMetadata))}/records/${encodeURIComponent(recordKey)}/buttons/${encodeURIComponent(button.button_key)}/execute?${runtimeExecutionQuery()}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setError("");
      await loadRecords();
    } catch (err) {
      setError(err?.message || "Unable to execute the configured button.");
    } finally {
      setExecutingAction("");
    }
  }

  async function handleConfiguredAction(component) {
    if (component.action === "edit") return setRecordModal({ type: "edit" });
    if (component.action === "delete") return deleteSelectedRecord();
    if (component.action === "create_related") return createRelatedRecord(component);
    if (component.action === "open_related") {
      const related = relatedLists[component.relationship_key];
      const first = related?.records?.[0];
      if (first && onSelectRecord) return onSelectRecord(first, related.relationship?.child_object_key);
      return setError("Open Related List requires a related-record navigation handler.");
    }
    if (component.action === "run_workflow" || component.action === "call_function") {
      const components = detailLayout?.definition?.components || [];
      const index = components.indexOf(component);
      const actionKey = component.id || component.key || `${component.action}:${index}`;
      const recordKey = selectedRecord?.id || selectedRecord?.record_id;
      if (!recordKey) return setError("A record is required to execute this action.");
      setExecutingAction(actionKey);
      try {
        const response = await apiRequest(
          `/api/platform/objects/${encodeURIComponent(getObjectKey(objectMetadata))}/records/${encodeURIComponent(recordKey)}/actions/${encodeURIComponent(actionKey)}/execute?${runtimeExecutionQuery()}`,
          { method: "POST", body: JSON.stringify({}) }
        );
        setError("");
        if (response?.data?.runId) {
          await loadRecords();
        }
      } catch (err) {
        setError(err?.message || "Unable to execute the configured action.");
      } finally {
        setExecutingAction("");
      }
      return;
    }
    return setError(`${component.label || component.action} is configured, but no safe executor is available for this action.`);
  }

  async function loadRecords({ pageOverride = null, searchOverride = null } = {}) {
    const key = getObjectKey(objectMetadata);

    if (!key) {
      return;
    }

    setRecordsLoading(true);

    try {
      const query = new URLSearchParams();
      if (activeListViewId) query.set("listViewId", activeListViewId);
      if (runtimeSort?.key) {
        query.set("sortField", runtimeSort.key);
        query.set("sortDirection", runtimeSort.direction || "asc");
      }
      query.set("filterModel", JSON.stringify(runtimeFilters || {}));
      const requestedPage = pageOverride || page || 1;
      query.set("page", String(requestedPage));
      if (!activeListViewId) query.set("pageSize", String(pageSize || 50));
      const requestedSearch = searchOverride === null ? search : searchOverride;
      if (requestedSearch?.trim()) query.set("search", requestedSearch.trim());

      const data = await apiRequest(
        `/api/platform/objects/${encodeURIComponent(key)}/records?${query.toString()}`
      );

      const loaded =
        data?.records ||
        data?.data?.records ||
        (Array.isArray(data?.data) ? data.data : null) ||
        (Array.isArray(data) ? data : []);

      const safeRecords = Array.isArray(loaded)
        ? loaded
        : [];

      setRecords(safeRecords);
      setRecordTotal(Number(data?.total ?? safeRecords.length));
      setPageSize(Number(data?.pageSize ?? pageSize ?? 50));
      if (Number(data?.page) && Number(data.page) !== page) setPage(Number(data.page));
      setSelectedRowIds((current) => current.filter((id) => safeRecords.some((record) => String(record?.id ?? record?.record_id) === String(id))));

      if (recordId) {
        const matching = safeRecords.find(
          (record) =>
            String(
              record?.id ??
                record?.record_id
            ) === String(recordId)
        );

        if (matching) {
          setSelectedRecord(matching);
        }
      }
    } catch (err) {
      setError(
        err?.message ||
          "Unable to load records."
      );
    } finally {
      setRecordsLoading(false);
    }
  }

  async function inlineEditRecord(record, column, value) {
    const id = record?.id || record?.record_id;
    if (!id || !column?.key) return;
    await apiRequest(`/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ data: { [column.key]: value } }),
    });
    await loadRecords();
  }

  async function deleteSelectedRecords(ids) {
    if (!ids?.length) return;
    if (!window.confirm(`Delete ${ids.length} selected record${ids.length === 1 ? "" : "s"}?`)) return;
    setRecordsLoading(true);
    try {
      for (const id of ids) {
        await apiRequest(`/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      setSelectedRowIds([]);
      if (selectedRecord && ids.map(String).includes(String(selectedRecord?.id || selectedRecord?.record_id))) setSelectedRecord(null);
      await loadRecords();
    } catch (err) {
      setError(err?.message || "Unable to delete selected records.");
    } finally {
      setRecordsLoading(false);
    }
  }


  async function bulkEditSelectedRecords(values) {
    if (!bulkEditFieldKey || !selectedRowIds.length) return;
    const value = values?.[bulkEditFieldKey];
    setRecordsLoading(true);
    try {
      for (const id of selectedRowIds) {
        await apiRequest(`/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ data: { [bulkEditFieldKey]: value } }),
        });
      }
      setBulkEditFieldKey("");
      setSelectedRowIds([]);
      await loadRecords();
      setError("");
    } catch (err) {
      setError(err?.message || "Unable to edit selected records.");
    } finally {
      setRecordsLoading(false);
    }
  }

  async function executeBulkMetadataButton(button, ids) {
    if (!button?.button_key || !ids?.length) return;
    setExecutingAction(`bulk:${button.button_key}`);
    try {
      for (const id of ids) {
        await apiRequest(
          `/api/platform/objects/${encodeURIComponent(resolvedObjectKey)}/records/${encodeURIComponent(id)}/buttons/${encodeURIComponent(button.button_key)}/execute?${runtimeExecutionQuery()}`,
          { method: "POST", body: JSON.stringify({}) }
        );
      }
      setSelectedRowIds([]);
      await loadRecords();
      setError("");
    } catch (err) {
      setError(err?.message || `Unable to run ${button.label || "bulk action"}.`);
    } finally {
      setExecutingAction("");
    }
  }


  function handleRecordSelect(record) {
    setSelectedRecord(record);

    if (onSelectRecord) {
      onSelectRecord(record);
    }
  }

  if (loading) {
    return (
      <div className="platform-object-page">
        <div className="platform-object-empty">
          Loading object…
        </div>

        <ObjectSearch
          value={search}
          onChange={setSearch}
          placeholder="Search records..."
          disabled={recordsLoading}
        />
      </div>
    );
  }

  if (!objectMetadata) {
    return (
      <div className="platform-object-page">
        <div className="platform-object-header">
          {onBack ? (
            <button
              type="button"
              className="platform-secondary-button"
              onClick={onBack}
            >
              Back
            </button>
          ) : null}
        </div>

        <div className="platform-object-empty">
          <strong>Object not found</strong>
          <span>
            The requested object metadata could not be
            loaded.
          </span>
        </div>
      </div>
    );
  }

  const objectLabel =
    getObjectLabel(objectMetadata);

  const hasSelectedRecord =
    Boolean(selectedRecord);

  const runtimeVisibilityContext = {
    ...uiContext,
    device: formFactor,
    formFactor,
    companyId: uiContext.companyId || null,
    recordTypeId: selectedRecord?.recordTypeId || selectedRecord?.record_type_id || "",
    record: selectedRecord || {},
    object: objectMetadata || {},
    objectState: objectMetadata || {},
  };

  const createVisibilityContext = {
    ...uiContext,
    device: formFactor,
    formFactor,
    companyId: uiContext.companyId || null,
    recordTypeId: selectedRecordTypeId || "",
    record: {},
    object: objectMetadata || {},
    objectState: objectMetadata || {},
  };

  return (
    <div className="platform-object-page">
      <div className="platform-object-header">
        <div className="platform-object-header-left">
          {onBack ? (
            <button
              type="button"
              className="platform-secondary-button"
              onClick={onBack}
            >
              Back
            </button>
          ) : null}

          <div>
            {/* Clean page header — the technical "Platform / Object"
                breadcrumb and raw key are gone from the visible heading. */}
            <h2>{objectLabel}</h2>
          </div>
        </div>

        <span
          className={
            "onepos-badge " +
            (objectMetadata?.active === false
              ? "onepos-badge-neutral"
              : "onepos-badge-success")
          }
        >
          {objectMetadata?.active === false
            ? "Inactive"
            : "Active"}
        </span>
      </div>

      {error ? (
        <div className="onepos-alert onepos-alert-error">
          {error}
        </div>
      ) : null}


      <div className={`platform-object-layout ${displayMode !== "split" ? "platform-object-layout-table" : ""}`}>
        <section className="platform-object-records">
          <div className="platform-section-header">
            <div className="platform-list-view-heading">
              <div>
                <h3>Records</h3>
                <span>{recordTotal} record{recordTotal === 1 ? "" : "s"}</span>
              </div>
              {!selfServiceView && listViews.length ? (
                <select
                  className="platform-list-view-select"
                  value={activeListViewId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextView = listViews.find((view) => String(view.id) === String(nextId));
                    setActiveListViewId(nextId);
                    setRuntimeSort({ key: nextView?.sort?.field || "", direction: nextView?.sort?.direction === "desc" ? "desc" : "asc" });
                    setRuntimeFilters(nextView?.filter_model && typeof nextView.filter_model === "object" ? nextView.filter_model : {});
                    setVisibleColumnKeys(Array.isArray(nextView?.columns) && nextView.columns.length ? nextView.columns : activeFields.map(getFieldKey));
                    setPage(1);
                  }}
                  aria-label="Saved list view"
                >
                  {listViews.map((view) => <option key={view.id} value={view.id}>{view.label}{view.is_pinned ? " · Pinned" : view.is_default ? " · Default" : ""}</option>)}
                </select>
              ) : null}
              {!selfServiceView ? (
                <div className="platform-list-view-actions">
                  <details className="platform-column-picker">
                    <summary>Columns</summary>
                    <div className="platform-column-picker-menu">
                      {activeFields.map((field) => {
                        const key = getFieldKey(field);
                        const checked = visibleColumnKeys.includes(key);
                        return (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={checked && visibleColumnKeys.length === 1}
                              onChange={(event) => {
                                setVisibleColumnKeys((current) => event.target.checked
                                  ? [...current.filter((item) => item !== key), key]
                                  : current.filter((item) => item !== key));
                              }}
                            />
                            <span>{getFieldLabel(field)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                  <button
                    type="button"
                    className="platform-secondary-button"
                    onClick={() => setListViewDialog({ mode: "create", label: "", description: "", pin: false })}
                  >
                    Save as New
                  </button>
                  {activeListView?.can_edit === true ? (
                    <button
                      type="button"
                      className="platform-secondary-button"
                      onClick={() => setListViewDialog({ mode: "edit", label: activeListView.label || "", description: activeListView.description || "", pin: activeListView.is_pinned === true })}
                    >
                      Update View
                    </button>
                  ) : null}
                  {activeListView ? (
                    <button type="button" className="platform-secondary-button" onClick={pinActiveListView}>
                      {activeListView.is_pinned ? "Unpin" : "Pin"}
                    </button>
                  ) : null}
                  {activeListView?.can_edit === true ? (
                    <button type="button" className="platform-secondary-button" onClick={deleteActiveListView}>Delete View</button>
                  ) : null}
                </div>
              ) : null}
              {!selfServiceView ? (
                <div className="platform-list-mode" role="group" aria-label="Record display">
                  <button type="button" className={displayMode === "table" ? "active" : ""} onClick={() => setDisplayMode("table")}>Table</button>
                  <button type="button" className={displayMode === "split" ? "active" : ""} onClick={() => setDisplayMode("split")}>Split</button>
                  {activeFields.some((field) => ["select", "picklist"].includes(field?.field_type)) ? <button type="button" className={displayMode === "kanban" ? "active" : ""} onClick={() => setDisplayMode("kanban")}>Kanban</button> : null}
                </div>
              ) : null}
            </div>
            {recordsLoading ? <span className="platform-loading-label">Loading…</span> : null}
          </div>
          {listViewDialog ? (
            <RecordModal
              open
              mode="edit"
              title={listViewDialog.mode === "edit" ? "Update List View" : "Save List View"}
              subtitle="Columns, filters, sorting and page size are saved with the view."
              size="md"
              onClose={() => setListViewDialog(null)}
            >
              <form
                className="platform-list-view-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  persistListView(listViewDialog.mode, listViewDialog);
                }}
              >
                <label>
                  <span>View name</span>
                  <input
                    value={listViewDialog.label || ""}
                    onChange={(event) => setListViewDialog((current) => ({ ...current, label: event.target.value }))}
                    placeholder="My open customers"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  <span>Description</span>
                  <textarea
                    rows="3"
                    value={listViewDialog.description || ""}
                    onChange={(event) => setListViewDialog((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                {listViewDialog.mode === "create" ? (
                  <label className="platform-list-view-pin">
                    <input
                      type="checkbox"
                      checked={listViewDialog.pin === true}
                      onChange={(event) => setListViewDialog((current) => ({ ...current, pin: event.target.checked }))}
                    />
                    <span>Pin this view for me</span>
                  </label>
                ) : null}
                <div className="platform-list-view-form-actions">
                  <button type="button" className="platform-secondary-button" onClick={() => setListViewDialog(null)}>Cancel</button>
                  <button type="submit" className="onepos-btn onepos-btn-primary">{listViewDialog.mode === "edit" ? "Save Changes" : "Save View"}</button>
                </div>
              </form>
            </RecordModal>
          ) : null}
          {bulkEditFieldKey ? (
            <RecordModal
              open
              mode="edit"
              title={`Edit ${selectedRowIds.length} selected record${selectedRowIds.length === 1 ? "" : "s"}`}
              subtitle="Choose one field and value. Every selected record is validated and permission-checked separately."
              size="md"
              onClose={() => setBulkEditFieldKey("")}
            >
              <div className="platform-bulk-edit">
                <label>
                  <span>Field</span>
                  <select value={bulkEditFieldKey} onChange={(event) => setBulkEditFieldKey(event.target.value)}>
                    {bulkEditableFields.map((field) => <option key={getFieldKey(field)} value={getFieldKey(field)}>{getFieldLabel(field)}</option>)}
                  </select>
                </label>
                {bulkEditableFields.find((field) => getFieldKey(field) === bulkEditFieldKey) ? (
                  <FormRenderer
                    fields={[bulkEditableFields.find((field) => getFieldKey(field) === bulkEditFieldKey)]}
                    initialValues={{ [bulkEditFieldKey]: "" }}
                    mode="edit"
                    onSubmit={bulkEditSelectedRecords}
                  />
                ) : null}
              </div>
            </RecordModal>
          ) : null}
          {recordModal?.type === "create" ? (
            <RecordModal open mode="create" title="Create record" size="lg" className={layoutPresentationClass(createLayout || detailLayout)} onClose={() => setRecordModal(null)} formId="platform-create-record-form">
            <div className="platform-create-record">
              {recordTypes.length ? <label className="platform-form-field"><span>Record Type</span><select value={selectedRecordTypeId} onChange={(event) => setSelectedRecordTypeId(event.target.value)}><option value="">No record type</option>{recordTypes.map((type) => <option key={type.id} value={type.id}>{type.label}{type.is_default ? " (default)" : ""}</option>)}</select></label> : null}
              <FormRenderer
                formId="platform-create-record-form"
                definition={createLayout?.definition || detailLayout?.definition}
                fields={recordModal.fields || activeFields}
                initialValues={recordModal.initialValues || {}}
                mode="create"
                contextValues={createVisibilityContext}
                onSubmit={createRecord}
              />
            </div>
            </RecordModal>
          ) : null}
          {recordModal?.type === "quick_create" ? (
            <RecordModal open mode="create" title="Quick Create" subtitle="Uses the active Quick Create form for this object." size="md" className={layoutPresentationClass(quickCreateLayout || createLayout || detailLayout)} onClose={() => setRecordModal(null)} formId="platform-quick-create-form">
              <FormRenderer
                formId="platform-quick-create-form"
                definition={quickCreateLayout?.definition || createLayout?.definition || detailLayout?.definition}
                fields={activeFields}
                initialValues={{}}
                mode="quick_create"
                contextValues={createVisibilityContext}
                onSubmit={createRecord}
              />
            </RecordModal>
          ) : null}

          {displayMode === "kanban" ? (
            <ObjectKanban
              records={records}
              fields={activeFields}
              canEdit={canWriteRecords}
              onSelect={handleRecordSelect}
              onMove={(record, field, value) => inlineEditRecord(record, { key: getFieldKey(field) }, value)}
            />
          ) : (
                      <RecordListView
                        title={objectLabel}
                        subtitle={() => activeListViewId ? (listViews.find((view) => String(view.id) === String(activeListViewId))?.description || "Saved list view") : "All records"}
                        rows={records}
                        columns={displayedListFields.map((field) => ({
                          key: getFieldKey(field),
                          label: getFieldLabel(field),
                          render: (row) => formatRecordDisplayValue(getFieldValue(row, field), field),
                          editable: canWriteRecords && field.writable !== false && !["formula", "rollup", "lookup"].includes(field.field_type),
                          editorType: ["select", "picklist"].includes(field.field_type) ? "select"
                            : field.field_type === "boolean" ? "boolean"
                            : ["number", "decimal", "currency"].includes(field.field_type) ? "number"
                            : field.field_type === "date" ? "date"
                            : field.field_type === "datetime" ? "datetime"
                            : "text",
                          options: field.options || [],
                        }))}
                        searchKeys={activeFields.map(getFieldKey)}
                        searchValue={search}
                        onSearchChange={(value) => setSearch(value)}
                        createLabel="New Record"
                        canCreate={canWriteRecords}
                        canEdit={canWriteRecords}
                        onCreate={() => setRecordModal({ type: "create" })}
                        onEdit={(record) => { setSelectedRecord(record); setRecordModal({ type: "edit" }); }}
                        onInlineEdit={canWriteRecords ? inlineEditRecord : undefined}
                        loading={recordsLoading}
                        error={error}
                        emptyText="No matching records."
                        objectKey={resolvedObjectKey}
                        objectLabel={objectLabel}
                        onDataChanged={loadRecords}
                        selectedRowId={selectedRecord?.id || selectedRecord?.record_id || null}
                        onRowSelect={(record) => handleRecordSelect(record)}
                        selectable={canWriteRecords}
                        selectedRowIds={selectedRowIds}
                        onSelectionChange={setSelectedRowIds}
                        bulkActions={canWriteRecords ? [
                          ...(bulkEditableFields.length ? [{
                            key: "edit",
                            label: "Edit selected",
                            onClick: () => setBulkEditFieldKey(getFieldKey(bulkEditableFields[0])),
                          }] : []),
                          ...listButtons.map((button) => ({
                            key: `button:${button.button_key}`,
                            label: button.label,
                            disabled: executingAction !== "",
                            onClick: (ids) => executeBulkMetadataButton(button, ids),
                          })),
                          { key: "delete", label: "Delete", onClick: deleteSelectedRecords },
                        ] : []}
                        page={page}
                        pageSize={pageSize}
                        total={recordTotal}
                        onPageChange={(nextPage) => setPage(nextPage)}
                        remoteMode
                        sortValue={runtimeSort}
                        onSortChange={(nextSort) => { setRuntimeSort(nextSort); setPage(1); }}
                        filterValue={runtimeFilters}
                        onFiltersChange={(nextFilters) => { setRuntimeFilters(nextFilters); setPage(1); }}
                        columnOrderValue={visibleColumnKeys}
                        onColumnOrderChange={setVisibleColumnKeys}
                      />
            
          )}
          {canWriteRecords ? (
            <div className="platform-quick-create-row">
              <button type="button" className="platform-secondary-button" onClick={() => setRecordModal({ type: "quick_create" })}>Quick Create</button>
            </div>
          ) : null}
        </section>

        <aside className={`platform-object-detail ${displayMode !== "split" ? "platform-object-detail-hidden" : ""}`}>
          <div className="platform-section-header">
            <div>
              <h3>Record</h3>

              <span>
                Read-only object detail
              </span>
            </div>
          </div>

          {!hasSelectedRecord ? (
            <div className="platform-object-empty compact">
              <strong>
                Select a record
              </strong>

              <span>
                Select a record from the list to view
                its fields.
              </span>
            </div>
          ) : (
            <div className="platform-field-list">
              {recordButtons
                .filter((button) => evaluatePlatformCondition(button.visibility_rule, activeFields, runtimeVisibilityContext))
                .map((button) => (
                <button
                  key={button.id || button.button_key}
                  type="button"
                  className={`platform-secondary-button platform-button-${button.variant || "secondary"}`}
                  disabled={executingAction !== ""}
                  onClick={() => handleMetadataButton(button)}
                >
                  {executingAction === button.button_key ? "Executing..." : button.label}
                </button>
              ))}
              {detailLayout?.definition?.components
                ?.filter((component) => component.type === "action" && component.visible !== false)
                .filter((component) => evaluatePlatformCondition(component.visibilityCondition, activeFields, runtimeVisibilityContext))
                .map((component, index) => (
                <button key={`${component.action}-${index}`} type="button" className="platform-secondary-button" disabled={executingAction !== ""} onClick={() => handleConfiguredAction(component)}>
                  {executingAction === (component.id || component.key || `${component.action}:${detailLayout.definition.components.indexOf(component)}`) ? "Executing..." : component.label || component.action}
                </button>
              ))}
              {renderRecordActions?.(selectedRecord, {
                refresh: loadRecords,
                setError,
              })}
              {recordModal?.type === "edit" ? (
                <RecordModal open mode="edit" title="Edit record" size="lg" className={layoutPresentationClass(editLayout || createLayout || detailLayout)} onClose={() => setRecordModal(null)} formId="platform-edit-record-form">
                  <FormRenderer formId="platform-edit-record-form" definition={editLayout?.definition || createLayout?.definition || detailLayout?.definition} fields={activeFields} initialValues={selectedRecord} mode="edit" contextValues={runtimeVisibilityContext} onSubmit={saveEditedRecord} />
                </RecordModal>
              ) : null}
              {approvalState ? <section className="rounded-xl border bg-white p-3">
                <div className="flex items-center justify-between"><div><strong>Approval</strong><div className="text-xs text-slate-500">{approvalState.request ? `${approvalState.request.process_name} · ${approvalState.request.status}` : "Not submitted"}</div></div>{approvalState.request?.locked ? <span className="onepos-badge onepos-badge-warning">Locked</span>:null}</div>
                {approvalState.request?.status==="pending" ? <div className="mt-3 text-sm"><div><b>Current step:</b> {approvalState.request.step_label||"Approval"}</div><div className="mt-1 text-xs text-slate-500">Submitted {approvalState.request.submitted_at?new Date(approvalState.request.submitted_at).toLocaleString():""}{approvalState.request.process_version?` · Process v${approvalState.request.process_version}`:""}</div>{approvalState.request.submission_comment?<div className="mt-1 text-slate-600">{approvalState.request.submission_comment}</div>:null}</div> : null}{approvalState.request?.status==="error" ? <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm"><b>Approval needs attention</b><div>The approval could not resolve an eligible approver. Review the approval history and process assignment.</div></div>:null}
                {!approvalState.request && approvalState.availableProcesses?.length ? <div className="mt-3"><textarea className="w-full rounded-lg border p-2 text-sm" rows="2" placeholder="Submission comment (optional)" value={approvalComment} onChange={e=>setApprovalComment(e.target.value)}/><button type="button" className="onepos-btn onepos-btn-primary mt-2" onClick={submitForApproval}>Submit for Approval</button></div>:null}
                {(approvalState.history?.events?.length||approvalState.history?.actions?.length)?<div className="mt-3 border-t pt-2"><b className="text-xs uppercase text-slate-500">Approval history</b>{[...(approvalState.history.events||[]),...(approvalState.history.actions||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map((entry,index)=><div key={entry.id||index} className="mt-2 text-xs"><b>{entry.event_type||entry.decision}</b>{entry.actor_name?` · ${entry.actor_name}`:""}{entry.comment?<div className="text-slate-500">{entry.comment}</div>:null}</div>)}</div>:null}
              </section>:null}
              {selectedRecord && compactHighlightFields.length ? (
                <section className="platform-record-highlights" aria-label="Record highlights">
                  {compactHighlightFields.map((field, index) => (
                    <div className={`platform-record-highlight ${index === 0 ? "is-primary" : ""}`} key={field.id || getFieldKey(field)}>
                      <span>{getFieldLabel(field)}</span>
                      <strong>{formatValue(getFieldValue(selectedRecord, field), field)}</strong>
                    </div>
                  ))}
                </section>
              ) : null}
              <ObjectRecordDetail
                record={selectedRecord}
                fields={activeFields}
                objectLabel={getObjectLabel(objectMetadata)}
                objectKey={getObjectKey(objectMetadata)}
                definition={selfServiceView ? null : (detailLayout?.definition || null)}
                onEdit={canWriteRecords ? () => setRecordModal({ type: "edit" }) : undefined}
                contextValues={runtimeVisibilityContext}
                canEditProcessPath={canWriteRecords && executingAction === ""}
                onProcessStageChange={updateProcessStage}
              />
              {detailLayout?.definition?.components
                ?.filter((component) => component.type === "related_list" && component.visible !== false)
                .filter((component) => evaluatePlatformCondition(component.visibilityCondition, activeFields, runtimeVisibilityContext))
                .map((component) => {
                const related = relatedLists[component.relationship_key];
                const columns = (component.columns || []).length
                  ? related?.fields?.filter((field) => component.columns.includes(field.api_name))
                  : related?.fields?.slice(0, 3);
                return (
                  <section key={component.relationship_key} className="platform-related-list">
                    <div className="platform-related-list-heading">
                      <h4>{component.label || component.relationship_key} ({related?.records?.length || 0})</h4>
                      <button type="button" className="platform-secondary-button" onClick={() => createRelatedRecord(component)}>+ New</button>
                    </div>
                    {related?.loading ? <span>Loading related records...</span> : null}
                    {related?.error ? <span className="platform-field-error">{related.error}</span> : null}
                    {!related?.loading && !related?.error ? (
                      <RecordListView
                        title={component.label || component.relationship_key}
                        rows={related?.records || []}
                        columns={(columns || []).map((field) => ({
                          key: getFieldKey(field),
                          label: getFieldLabel(field),
                          render: (row) => formatValue(getFieldValue(row, field), field),
                        }))}
                        searchKeys={(columns || []).map(getFieldKey)}
                        canCreate={false}
                        canEdit={false}
                        emptyText="No related records."
                        selectedRowId={null}
                        onRowSelect={(record) => onSelectRecord?.(record, related.relationship?.child_object_key)}
                        searchValue={related?.search || ""}
                        onSearchChange={(value) => changeRelatedSearch(component, value)}
                        remoteMode
                        sortValue={related?.sort || { key: "", direction: "asc" }}
                        onSortChange={(sort) => loadRelatedList(component, { page: 1, sort }).catch((err) => setError(err?.message || "Unable to sort related records."))}
                        filterValue={related?.filters || {}}
                        onFiltersChange={(filters) => loadRelatedList(component, { page: 1, filters }).catch((err) => setError(err?.message || "Unable to filter related records."))}
                        page={related?.page || 1}
                        pageSize={related?.pageSize || Math.min(Number(component.limit) || 25, 100)}
                        total={related?.total ?? related?.records?.length ?? 0}
                        onPageChange={(page) => loadRelatedList(component, { page }).catch((err) => setError(err?.message || "Unable to load related records."))}
                      />
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
          {hasSelectedRecord ? (
            <ObjectHistory
              items={history.map((item) => ({
                id: item.id,
                title: `${item.action} ${item.field_api_name || "record"}`,
                description: `${item.old_value ?? "—"} → ${item.new_value ?? "—"}`,
                createdAt: item.created_at,
              }))}
              title="Record History"
            />
          ) : null}
        </aside>
      </div>

      <style>{`
        .platform-record-modal-rectangle { width: min(860px, calc(100vw - 32px)); }
        .platform-record-modal-compact { width: min(540px, calc(100vw - 32px)); }

        /* Every host of this screen (the admin shell content frame, the
           Platform shell, the Platform Studio overlay) already provides the
           outer inset and the page frame, so this screen adds none of its own
           — previously shell padding + this 20px stacked into a 42px inset
           that no other Platform screen had. The records workspace also uses
           all remaining width instead of being centred at 1400px, which left
           exterior gutters inside a full-bleed shell on wide monitors. */
        .platform-object-page {
          color: var(--text-primary, #1f2937);
        }

        .platform-object-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 18px;
        }

        .platform-object-header-left {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .platform-eyebrow {
          margin-bottom: 5px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          opacity: 0.6;
        }

        .platform-object-header h2 {
          margin: 0;
          font-size: 24px;
        }

        .platform-object-header p {
          margin: 5px 0 0;
          color: var(--text-secondary, #6b7280);
          font-family: monospace;
          font-size: 10px;
        }

        .platform-secondary-button {
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #fff);
          color: inherit;
          padding: 9px 14px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .platform-secondary-button:hover {
          background: var(--hover-background, var(--muted-background, #f9fafb));
        }

        .platform-secondary-button:focus-visible {
          outline: 2px solid var(--primary-color, #176f6a);
          outline-offset: 2px;
        }

        /* Object state and errors use the shared badge/alert primitives, so
           they follow the preset, the appearance and the accent instead of
           pinning Light-only colours that broke in Dark. */
        .platform-object-header .onepos-badge,
        .platform-object-page > .onepos-alert {
          margin-bottom: 15px;
        }

        .platform-managed-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .platform-managed-notice strong {
          display: block;
          font-size: 12.5px;
        }

        .platform-managed-notice span {
          display: block;
          margin-top: 3px;
          font-size: 12px;
        }

        .platform-managed-notice .platform-secondary-button {
          flex: none;
        }

        .platform-object-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.8fr);
          gap: 15px;
          align-items: start;
        }

        .platform-object-records,
        .platform-object-detail {
          min-width: 0;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          background: var(--card-background, #fff);
          overflow: hidden;
        }

        .platform-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
        }

        .platform-section-header h3 {
          margin: 0;
          font-size: 14px;
        }

        .platform-section-header span {
          display: block;
          margin-top: 3px;
          color: var(--text-secondary, #6b7280);
          font-size: 10px;
        }

        .platform-loading-label {
          color: var(--text-secondary, #6b7280) !important;
          font-size: 10px !important;
        }

        /* The record table is the SHARED ObjectList now; its presentation   */
        /* lives in index.css (.onepos-object-*).                            */

        .platform-field-list {
          padding: 8px 16px 16px;
        }

        .platform-field-row {
          padding: 11px 0;
          border-bottom: 1px solid var(--border-color, #f0f0f0);
        }

        .platform-field-row:last-child {
          border-bottom: 0;
        }

        .platform-field-label {
          margin-bottom: 4px;
          color: var(--text-secondary, #6b7280);
          font-size: 10px;
          font-weight: 600;
        }

        .platform-field-label span {
          margin-left: 3px;
        }

        .platform-field-value {
          min-height: 18px;
          font-size: 12px;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .platform-object-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          padding: 55px 20px;
          color: var(--text-secondary, #6b7280);
          font-size: 12px;
          text-align: center;
        }

        .platform-object-empty strong {
          color: inherit;
          font-size: 14px;
        }

        .platform-object-empty.compact {
          padding: 35px 20px;
        }

        .platform-list-view-heading {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
          flex: 1;
          flex-wrap: wrap;
        }

        .platform-list-view-select {
          max-width: 260px;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 7px;
          background: var(--card-background, #fff);
          color: var(--text-primary, #1f2937);
          padding: 6px 8px;
          font-size: 10px;
        }

        .platform-list-view-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .platform-column-picker {
          position: relative;
        }

        .platform-column-picker > summary {
          list-style: none;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #fff);
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }

        .platform-column-picker > summary::-webkit-details-marker { display: none; }

        .platform-column-picker-menu {
          position: absolute;
          z-index: 50;
          top: calc(100% + 5px);
          left: 0;
          width: 250px;
          max-height: 320px;
          overflow: auto;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 9px;
          background: var(--card-background, #fff);
          padding: 7px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, .14);
        }

        .platform-column-picker-menu label {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px;
          font-size: 10px;
          cursor: pointer;
        }

        .platform-list-view-form {
          display: grid;
          gap: 14px;
        }

        .platform-list-view-form > label {
          display: grid;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .platform-list-view-form input[type="text"],
        .platform-list-view-form input:not([type]),
        .platform-list-view-form textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #fff);
          color: var(--text-primary, #1f2937);
          padding: 9px 10px;
          font: inherit;
        }

        .platform-list-view-pin {
          display: flex !important;
          grid-template-columns: none !important;
          align-items: center;
          gap: 8px !important;
        }

        .platform-list-view-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
        }

        .platform-bulk-edit {
          display: grid;
          gap: 14px;
        }

        .platform-bulk-edit > label {
          display: grid;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
        }

        .platform-bulk-edit > label select {
          width: 100%;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #fff);
          color: var(--text-primary, #1f2937);
          padding: 9px 10px;
          font: inherit;
        }

        .platform-list-mode {
          display: inline-flex;
          overflow: hidden;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 7px;
        }

        .platform-list-mode button {
          border: 0;
          border-right: 1px solid var(--border-color, #d1d5db);
          background: var(--card-background, #fff);
          padding: 6px 9px;
          color: var(--text-secondary, #64748b);
          font-size: 10px;
          cursor: pointer;
        }

        .platform-list-mode button:last-child { border-right: 0; }
        .platform-list-mode button.active {
          background: var(--muted-background, #f1f5f9);
          color: var(--text-primary, #1f2937);
          font-weight: 700;
        }

        .platform-object-layout-table {
          grid-template-columns: minmax(0, 1fr);
        }

        .platform-kanban {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(240px, 1fr);
          gap: 10px;
          overflow-x: auto;
          padding: 12px;
        }

        .platform-kanban-column {
          min-width: 0;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 10px;
          background: var(--muted-background, #f8fafc);
        }

        .platform-kanban-column > header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 9px 10px;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          font-size: 11px;
        }

        .platform-kanban-column > header span {
          display: inline-grid;
          place-items: center;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          background: var(--card-background, #fff);
          color: var(--text-secondary, #64748b);
          font-size: 9px;
        }

        .platform-kanban-cards {
          display: flex;
          min-height: 80px;
          flex-direction: column;
          gap: 7px;
          padding: 8px;
        }

        .platform-kanban-card {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 8px;
          background: var(--card-background, #fff);
          padding: 9px;
          color: var(--text-primary, #1f2937);
          text-align: left;
          cursor: pointer;
        }

        .platform-kanban-card strong { font-size: 11px; }
        .platform-kanban-card span, .platform-kanban-empty { color: var(--text-secondary, #64748b); font-size: 9px; }
        .platform-kanban-empty { padding: 10px; text-align: center; }


        .platform-record-highlights {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1px;
          margin-bottom: 10px;
          overflow: hidden;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 10px;
          background: var(--border-color, #e2e8f0);
        }

        .platform-record-highlight {
          min-width: 0;
          padding: 9px 10px;
          background: var(--card-background, #fff);
        }

        .platform-record-highlight span {
          display: block;
          margin-bottom: 3px;
          color: var(--text-secondary, #64748b);
          font-size: 9px;
          font-weight: 600;
        }

        .platform-record-highlight strong {
          display: block;
          overflow: hidden;
          color: var(--text-primary, #0f172a);
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .platform-record-highlight.is-primary strong {
          font-size: 13px;
        }

        .platform-object-detail-hidden {
          display: none;
        }

        .platform-quick-create-row {
          display: flex;
          justify-content: flex-end;
          padding: 10px 12px;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        @media (max-width: 950px) {
          .platform-object-layout {
            grid-template-columns: 1fr;
          }

          .platform-object-detail {
            order: -1;
          }
        }

        @media (max-width: 650px) {
          .platform-object-header {
            flex-direction: column;
          }

          .platform-object-header-left {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
