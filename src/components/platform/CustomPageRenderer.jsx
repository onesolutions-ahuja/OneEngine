import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import renderDashboardComponent from "../dashboard/DashboardComponents.jsx";
import {
  SECTION_WIDTHS,
  multiContainerColumns,
  nodeLabel,
} from "../../pages/settings/Platform/customPageTree.js";

const PAGE_BUILDER_GRID_CSS = `
  .cpb-tree { display: flex; flex-wrap: wrap; gap: 12px; min-width: 0; }
  .cpb-section { border-radius: var(--onepos-radius, 12px); min-width: 0; }
  .cpb-section-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .cpb-container-grid { display: grid; gap: 8px; min-width: 0; }
  .cpb-multi-grid { display: grid; min-width: 0; }
  .cpb-record-card {
    display: flex; flex-direction: column; gap: 4px;
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 10px; background: var(--card-background, #fff);
    padding: 12px; min-width: 0; overflow: hidden;
  }
  .cpb-record-card.clickable { cursor: pointer; transition: box-shadow .15s ease, transform .15s ease; }
  .cpb-record-card.clickable:hover { box-shadow: var(--onepos-shadow-md, 0 4px 12px rgba(15,23,42,.08)); }
  .cpb-card-title { font-weight: 600; font-size: 13px; color: var(--text-primary, #111827); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cpb-card-subtitle { font-size: 11px; color: var(--text-secondary, #6b7280); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cpb-card-field { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--text-secondary, #6b7280); }
  .cpb-card-field b { font-weight: 500; color: var(--text-primary, #374151); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cpb-placeholder-row {
    display: grid; gap: 8px; border: 1.5px dashed var(--border-color, #cbd5e1);
    border-radius: 10px; padding: 10px; color: var(--text-secondary, #94a3b8); font-size: 11px;
  }
  .cpb-empty { border: 1.5px dashed var(--border-color, #cbd5e1); border-radius: 10px; padding: 18px; text-align: center; color: var(--text-secondary, #94a3b8); font-size: 12px; }
`;

export function formatRecordValue(value, fieldType) {
  if (value === null || value === undefined || value === "") return "—";
  if (fieldType === "boolean") return value === true || value === "true" ? "Yes" : "No";
  if (fieldType === "date" || fieldType === "datetime") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return fieldType === "date" ? date.toLocaleDateString() : date.toLocaleString();
  }
  if (fieldType === "currency" || fieldType === "decimal" || fieldType === "number") {
    const num = Number(value);
    if (Number.isFinite(num)) return fieldType === "currency" ? num.toLocaleString(undefined, { style: "currency", currency: "GBP" }) : String(num);
  }
  return String(value);
}

function placeholderRecords(collection) {
  const fields = collection.fields?.length ? collection.fields : ["name", "status", "created_at"];
  const records = [];
  for (let index = 0; index < Math.min(collection.maxRecords || 3, 3); index += 1) {
    const record = { id: `preview-${index + 1}` };
    for (const field of fields) record[field] = `${String(field).replace(/_/g, " ")} ${index + 1}`;
    records.push(record);
  }
  return { records, fields, placeholder: true };
}

/**
 * THE one Record Collection hook. Every record-bound component uses the same
 * request shape and canonical server-side condition and permission gates.
 * Pagination state lives with the caller so filters and limits stay aligned.
 */
export function useRecordCollection(collection, { enabled, page = 1, pageContext = null } = {}) {
  const [state, setState] = useState(() => ({ records: [], total: 0, fields: [], placeholder: false, loading: false, error: "" }));
  const key = useMemo(() => JSON.stringify(collection || {}), [collection]);
  const contextKey = JSON.stringify(pageContext || {});

  useEffect(() => {
    if (!enabled) return;
    const parsed = JSON.parse(key);
    if (!parsed?.objectKey) {
      setState({ records: [], total: 0, fields: [], placeholder: true, loading: false, error: "" });
      return undefined;
    }
    let live = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    /* Consume the Record Collection boundary — NOT a bespoke query. The
       endpoint resolves conditions/sort/limit against object metadata and
       enforces the same object-permission + read-scope gates as the object
       runtime. */
    const maxRecords = Math.min(parsed.maxRecords || 10, 50);
    const clampedPage = Math.max(1, Number(page) || 1);
    apiRequest("/api/platform/runtime/record-collection", {
      method: "POST",
      body: JSON.stringify({
        objectKey: parsed.objectKey,
        conditions: (parsed.conditions || []).filter((condition) => condition.field),
        conditionMatch: parsed.conditionMatch || "all",
        sort: parsed.sort || [],
        maxRecords,
        fields: parsed.fields || [],
        offset: (clampedPage - 1) * maxRecords,
        pageContext: pageContext || undefined,
      }),
    })
      .then((response) => {
        if (!live) return;
        const records = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : [];
        const total = Number(response?.total) || 0;
        setState({ records, total, fields: parsed.fields || [], placeholder: false, loading: false, error: "" });
      })
      .catch((error) => {
        if (live) setState({ records: [], total: 0, fields: parsed.fields || [], placeholder: true, loading: false, error: error?.message || "Records unavailable" });
      });
    return () => { live = false; };
  }, [key, enabled, page, contextKey]);

  return state;
}

/** Shared pagination footer. Collection page state is owned by the page-level hook. */
function PaginationFooter({ total, maxRecords, page, onPageChange }) {
  const pages = Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, maxRecords)));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} aria-label="Previous page">
        <ChevronLeft size={13} /> Previous
      </button>
      <span className="text-xs" style={{ color: "var(--text-secondary, #6b7280)" }}>Page {page} of {pages}</span>
      <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={page >= pages} onClick={() => onPageChange(Math.min(pages, page + 1))} aria-label="Next page">
        Next <ChevronRight size={13} />
      </button>
    </div>
  );
}

function MultiContainerView({ node, sectionWidth, device, builderMode, onRecordClick, data }) {
  const collection = node.collection || {};
  const designed = useMemo(() => placeholderRecords(collection), [collection]);
  const { records, fields, placeholder, loading, error } = data?.placeholder
    ? { records: [], fields: collection.fields || [], placeholder: true, loading: false, error: "" }
    : (data || designed);

  const columns = multiContainerColumns({ sectionWidth, containerSize: node.containerSize || "medium", device });
  const maxRecords = collection.maxRecords || 10;
  const shown = records.slice(0, maxRecords);
  const titleField = collection.titleField || fields[0] || "name";
  const subtitleField = collection.subtitleField || fields[1] || "";

  const cardFor = (record, index) => {
    const clickable = node.clickable !== false && node.interaction?.type !== "none" && !builderMode;
    return (
      <div
        key={record.id || index}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        className={`cpb-record-card${clickable ? " clickable" : ""}`}
        onClick={clickable ? () => onRecordClick?.({ record, node }) : undefined}
        onKeyDown={clickable ? (event) => { if (event.key === "Enter") onRecordClick?.({ record, node }); } : undefined}
      >
        <span className="cpb-card-title">{formatRecordValue(record[titleField], "text")}</span>
        {subtitleField ? <span className="cpb-card-subtitle">{formatRecordValue(record[subtitleField], "text")}</span> : null}
        {fields.filter((field) => field !== titleField && field !== subtitleField).slice(0, 4).map((field) => (
          <span className="cpb-card-field" key={field}><span>{String(field).replace(/_/g, " ")}</span><b>{formatRecordValue(record[field])}</b></span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="cpb-multi-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: (node.spacing || 3) * 4 }}>
        {placeholder && !shown.length
          ? Array.from({ length: Math.min(columns, 3) }).map((_, index) => (
            <div className="cpb-placeholder-row" key={index}>
              <span className="cpb-card-title">{collection.titleField ? `${String(collection.titleField).replace(/_/g, " ")} #` : "Record #"}</span>
              {subtitleField ? <span className="cpb-card-subtitle">{String(subtitleField).replace(/_/g, " ")}</span> : null}
              {(collection.fields?.length ? collection.fields : ["status", "created_at"]).filter((field) => field !== titleField && field !== subtitleField).slice(0, 3).map((field) => (
                <span className="cpb-card-field" key={field}><span>{String(field).replace(/_/g, " ")}</span><b>—</b></span>
              ))}
            </div>
          ))
          : shown.map(cardFor)}
        {loading ? <div className="cpb-empty">Loading records…</div> : null}
        {!loading && error && !shown.length ? <div className="cpb-empty">{error}</div> : null}
        {!loading && !error && !placeholder && !shown.length ? <div className="cpb-empty">No records match this collection.</div> : null}
      </div>
      {!builderMode && !placeholder ? (
        <PaginationFooter total={data?.total || 0} maxRecords={maxRecords} page={data?.page || 1} onPageChange={data?.onPageChange} />
      ) : null}
    </div>
  );
}

/**
 * Table / List — consumes the SAME Record Collection datasource as
 * MultiContainer (same hook, same endpoint, same permissions). Row On Click
 * goes through the same interaction dispatch as record cards.
 */
export function TableView({ node, builderMode, onRecordClick, data }) {
  const collection = node.collection || {};
  const { records, fields, placeholder, loading, error } = data?.placeholder
    ? { records: [], fields: collection.fields || [], placeholder: true, loading: false, error: "" }
    : (data || { records: [], fields: collection.fields || [], placeholder: true, loading: false, error: "" });
  const maxRecords = collection.maxRecords || 10;
  const shown = records.slice(0, maxRecords);
  const columns = (fields.length ? fields : Object.keys(shown[0] || {})).filter((field) => field !== "id").slice(0, 7);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border-color, #e5e7eb)" }}>
        <table className="w-full text-left text-sm" style={{ color: "var(--text-primary, #111827)", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--muted-background, #f8fafc)" }}>
              {columns.map((field) => (
                <th key={field} className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--text-secondary, #6b7280)" }}>{String(field).replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placeholder && !shown.length
              ? Array.from({ length: 3 }).map((_, index) => (
                <tr key={index}>
                  {(columns.length ? columns : ["name", "status", "created_at"]).map((field) => (
                    <td key={field} className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary, #94a3b8)" }}>{String(field).replace(/_/g, " ")} …</td>
                  ))}
                </tr>
              ))
              : shown.map((record, index) => {
                const clickable = node.clickable !== false && node.interaction?.type !== "none" && !builderMode;
                return (
                  <tr
                    key={record.id || index}
                    onClick={clickable ? () => onRecordClick?.({ record, node }) : undefined}
                    onKeyDown={clickable ? (event) => { if (event.key === "Enter") onRecordClick?.({ record, node }); } : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    className={clickable ? "cursor-pointer transition-colors hover:bg-slate-50" : undefined}
                  >
                    {columns.map((field) => (
                      <td key={field} className="border-t px-3 py-2 text-xs" style={{ borderColor: "var(--border-color, #f1f5f9)" }}>{formatRecordValue(record[field])}</td>
                    ))}
                  </tr>
                );
              })}
            {loading ? <tr><td className="px-3 py-3 text-xs text-slate-400" colSpan={Math.max(1, columns.length)}>Loading records…</td></tr> : null}
            {!loading && error && !shown.length ? <tr><td className="px-3 py-3 text-xs text-slate-400" colSpan={Math.max(1, columns.length)}>{error}</td></tr> : null}
            {!loading && !error && !placeholder && !shown.length ? <tr><td className="px-3 py-3 text-xs text-slate-400" colSpan={Math.max(1, columns.length)}>No records match this collection.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {!builderMode && !placeholder ? (
        <PaginationFooter total={data?.total || 0} maxRecords={maxRecords} page={data?.page || 1} onPageChange={data?.onPageChange} />
      ) : null}
    </div>
  );
}

const ADVANCED_RECORD_COMPONENTS = ["timeline", "kanban", "calendar", "scheduler", "gantt", "map", "hierarchy_viewer", "file_viewer", "signature"];
const REGISTRY_RECORD_COMPONENTS = ["avatar_group", "record_picker", "product_image_card", "searchable_dropdown"];
const STATIC_DASHBOARD_COMPONENTS = ["folder_card", "avatar_group", "modern_app_card", "modern_kpi_card", "modern_section_header", "modern_data_card", "icon_action_tile", "clock_widget", "calendar_widget", "weather_widget"];
const GENERIC_PAGE_COMPONENTS = new Set([
  "card","grid","stack","tabs","accordion","modal","drawer","alert","badge","progress","empty_state","loading_state",
  "image","video","avatar","icon","qr_code","barcode","search_box","toggle","radio_group","slider","file_upload","pin_input",
  "pagination","filter_bar","icon_button","back_button","close_button","refresh_button","navigation_button","link","select",
  "multi_select","time_input","date_picker","menu","breadcrumb","stepper","tooltip","toast","confirmation_dialog","app_icon","dock_item",
]);

function advancedCollection(node) {
  const config = node.config || {};
  const collection = node.collection || {};
  const fields = new Set(collection.fields || []);
  for (const [key, value] of Object.entries(config)) {
    if (/(Field|field)$/.test(key) && typeof value === "string" && /^[a-z_][a-z0-9_]*$/.test(value)) fields.add(value);
    if (/(Fields|fields)$/.test(key) && Array.isArray(value)) value.forEach((field) => {
      if (typeof field === "string" && /^[a-z_][a-z0-9_]*$/.test(field)) fields.add(field);
    });
  }
  return { ...collection, objectKey: collection.objectKey || config.objectKey || "", fields: [...fields] };
}

export function AdvancedRecordView({ node, data, onRecordClick, builderMode }) {
  const config = node.config || {};
  const collection = advancedCollection(node);
  const state = data?.[node.id] || {};
  const records = Array.isArray(state.records) ? state.records : [];
  const [calendarDate, setCalendarDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [kanbanRecords, setKanbanRecords] = useState(records);
  const [kanbanError, setKanbanError] = useState("");
  useEffect(() => setKanbanRecords(records), [records]);
  const placeholder = state.placeholder || !collection.objectKey;
  const titleField = config.titleField || config.taskLabelField || config.labelField || "name";
  const clickRecord = (record) => {
    if (!builderMode && node.clickable !== false && node.interaction?.type !== "none") onRecordClick?.({ record, node });
  };
  if (state.loading) return <div className="cpb-empty">Loading records…</div>;
  if (state.error && !records.length) return <div className="cpb-empty">{state.error}</div>;
  if (!records.length && !placeholder) return <div className="cpb-empty">No records match this view.</div>;

  if (node.componentKey === "timeline") {
    const sorted = [...records].sort((a, b) => new Date(a[config.dateField] || 0) - new Date(b[config.dateField] || 0));
    if (config.sort === "desc") sorted.reverse();
    return <div className="space-y-2">{(placeholder ? [{ name: "Timeline entry", created_at: "Date" }] : sorted).map((record, index) => <button type="button" key={record.id || index} onClick={() => clickRecord(record)} className="flex w-full gap-3 rounded-lg border bg-white p-3 text-left" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" /><span className="min-w-0"><span className="block text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{formatRecordValue(record[config.dateField || "created_at"], "datetime")}</span><span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary, #0f172a)" }}>{record[config.titleField || "name"] || "Untitled"}</span>{config.secondaryField && record[config.secondaryField] ? <span className="block text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{record[config.secondaryField]}</span> : null}</span></button>)}</div>;
  }
  if (node.componentKey === "kanban") {
    const groupField = config.groupField || "status";
    const groups = new Map();
    for (const record of kanbanRecords) {
      const group = String(record[groupField] || "Unassigned");
      groups.set(group, [...(groups.get(group) || []), record]);
    }
    if (!groups.size) ["Backlog", "In progress", "Done"].forEach((group) => groups.set(group, []));
    const ordered = config.columnOrder?.length ? [...config.columnOrder.filter((group) => groups.has(group)), ...[...groups.keys()].filter((group) => !config.columnOrder.includes(group))] : [...groups.keys()];
    const moveCard = async (recordId, destination) => {
      if (builderMode || config.allowDragDrop === false || !collection.objectKey) return;
      const record = kanbanRecords.find((item) => String(item.id) === String(recordId));
      if (!record || String(record[groupField] || "Unassigned") === destination) return;
      try {
        await apiRequest(`/api/platform/objects/${encodeURIComponent(collection.objectKey)}/records/${encodeURIComponent(record.id)}`, { method: "PUT", body: JSON.stringify({ data: { [groupField]: destination } }) });
        setKanbanRecords((current) => current.map((item) => item.id === record.id ? { ...item, [groupField]: destination } : item));
        setKanbanError("");
      } catch (error) {
        setKanbanError(error?.message || "Unable to move record. Edit permission may be required.");
      }
    };
    return <div className="space-y-2">{kanbanError ? <p role="alert" className="text-xs text-red-700">{kanbanError}</p> : null}<div className="flex min-w-0 gap-3 overflow-x-auto pb-1">{ordered.map((group) => <section key={group} onDragOver={(event) => { if (!builderMode && config.allowDragDrop !== false) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); moveCard(event.dataTransfer.getData("text/plain"), group); }} className="w-64 shrink-0 rounded-lg border p-2" style={{ borderColor: "var(--border-color, #e5e7eb)", background: "var(--muted-background, #f8fafc)" }}><h4 className="mb-2 flex justify-between text-xs font-semibold"><span>{group}</span><span>{groups.get(group).length}</span></h4><div className="space-y-2">{groups.get(group).map((record, index) => <button type="button" key={record.id || index} draggable={!builderMode && config.allowDragDrop !== false} onDragStart={(event) => event.dataTransfer.setData("text/plain", String(record.id))} onClick={() => clickRecord(record)} className="block w-full rounded-md border bg-white p-2 text-left text-sm" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="block font-medium">{record[titleField] || "Untitled"}</span>{config.subtitleField && record[config.subtitleField] ? <span className="mt-1 block text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{record[config.subtitleField]}</span> : null}</button>)}</div></section>)}</div></div>;
  }
  if (node.componentKey === "calendar") {
    const startField = config.startField || "start_date";
    const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(1 - ((monthStart.getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
    const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const events = new Map();
    records.forEach((record) => { const date = new Date(record[startField]); if (!Number.isNaN(date.getTime())) events.set(dayKey(date), [...(events.get(dayKey(date)) || []), record]); });
    return <div className="space-y-2"><div className="flex items-center justify-between"><button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} aria-label="Previous month">‹</button><strong className="text-sm">{calendarDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} aria-label="Next month">›</button></div><div className="grid grid-cols-7 gap-1">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-1 text-center text-[11px] font-semibold">{day}</div>)}{days.map((day) => <div key={dayKey(day)} className="min-h-16 min-w-0 rounded border p-1" style={{ borderColor: "var(--border-color, #e5e7eb)", opacity: day.getMonth() === calendarDate.getMonth() ? 1 : 0.45 }}><span className="text-[10px]">{day.getDate()}</span><div className="mt-1 space-y-0.5">{(events.get(dayKey(day)) || []).slice(0, 2).map((record, index) => <button type="button" key={record.id || index} onClick={() => clickRecord(record)} className="block w-full truncate rounded bg-emerald-100 px-1 py-0.5 text-left text-[10px]">{record[titleField] || "Event"}</button>)}</div></div>)}</div>{placeholder ? <div className="cpb-empty">Choose an object to populate this calendar.</div> : null}</div>;
  }
  if (node.componentKey === "scheduler") {
    const startField = config.startField || "start_date";
    const groups = new Map();
    records.forEach((record) => { const resource = String(record[config.resourceField || "assignee_id"] || "Unassigned"); groups.set(resource, [...(groups.get(resource) || []), record]); });
    if (!groups.size && placeholder) groups.set("Resource", []);
    return <div className="flex min-w-0 gap-3 overflow-x-auto pb-1">{[...groups.entries()].map(([resource, items]) => <section key={resource} className="w-64 shrink-0 rounded-lg border p-2" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><h4 className="mb-2 truncate text-xs font-semibold">{resource}</h4><div className="space-y-1">{items.sort((a, b) => new Date(a[startField]) - new Date(b[startField])).map((record, index) => <button type="button" key={record.id || index} onClick={() => clickRecord(record)} className="block w-full rounded border px-2 py-1.5 text-left" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="block text-[10px]" style={{ color: "var(--text-secondary, #64748b)" }}>{formatRecordValue(record[startField], "datetime")}</span><span className="block truncate text-xs font-medium">{record[titleField] || "Untitled"}</span></button>)}</div></section>)}</div>;
  }
  if (node.componentKey === "gantt") {
    const startField = config.startField || "start_date";
    const endField = config.endField || "end_date";
    const dates = records.flatMap((record) => [new Date(record[startField]).getTime(), new Date(record[endField]).getTime()]).filter(Number.isFinite);
    const minimum = Math.min(...dates);
    const span = Math.max(1, Math.max(...dates) - minimum);
    return <div className="space-y-2">{(records.length ? records : state.placeholder ? [{ name: "Task", [startField]: 0, [endField]: 1 }] : []).map((record, index) => { const start = new Date(record[startField]).getTime(); const end = new Date(record[endField]).getTime(); const left = Number.isFinite(start) && Number.isFinite(minimum) ? Math.max(0, ((start - minimum) / span) * 100) : 0; const width = Number.isFinite(end - start) ? Math.max(4, ((end - start) / span) * 100) : 35; return <button type="button" key={record.id || index} onClick={() => clickRecord(record)} className="grid w-full grid-cols-[8rem_1fr] items-center gap-3 text-left"><span className="truncate text-xs">{record[config.taskLabelField || "name"] || "Untitled"}</span><span className="relative h-6 rounded bg-slate-100"><span className="absolute top-1 h-4 rounded bg-emerald-600" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} /></span></button>; })}</div>;
  }
  if (node.componentKey === "map") {
    const valid = config.locationMode === "address" ? records.filter((record) => record[config.addressField]) : records.filter((record) => Number.isFinite(Number(record[config.latitudeField || "latitude"])) && Number.isFinite(Number(record[config.longitudeField || "longitude"])));
    if (!valid.length) return <div className="cpb-empty">{placeholder ? "Location records will appear here." : "No records have valid locations."}</div>;
    const first = valid[0];
    const firstLatitude = Number(first[config.latitudeField || "latitude"]);
    const firstLongitude = Number(first[config.longitudeField || "longitude"]);
    const mapUrl = new URL("https://www.openstreetmap.org/export/embed.html");
    const latitudes = valid.map((record) => Number(record[config.latitudeField || "latitude"]));
    const longitudes = valid.map((record) => Number(record[config.longitudeField || "longitude"]));
    const padding = 0.01;
    mapUrl.searchParams.set("bbox", [Math.min(...longitudes) - padding, Math.min(...latitudes) - padding, Math.max(...longitudes) + padding, Math.max(...latitudes) + padding].join(","));
    mapUrl.searchParams.set("layer", "mapnik");
    mapUrl.searchParams.set("marker", `${firstLatitude},${firstLongitude}`);
    return <div className="space-y-2">{config.locationMode !== "address" ? <iframe title="Record locations map" className="h-64 w-full rounded-lg border" src={mapUrl.toString()} loading="lazy" referrerPolicy="no-referrer" style={{ borderColor: "var(--border-color, #e5e7eb)" }} /> : null}<div className="space-y-1">{valid.map((record, index) => { const location = config.locationMode === "address" ? String(record[config.addressField]) : `${record[config.latitudeField || "latitude"]},${record[config.longitudeField || "longitude"]}`; return <a key={record.id || index} href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" className="flex justify-between gap-2 rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="truncate font-medium">{record[config.labelField || "name"] || "Location"}</span><span className="truncate text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{location}</span></a>; })}</div></div>;
  }
  if (node.componentKey === "hierarchy_viewer") {
    const parentField = config.parentField || "parent_id";
    const byParent = new Map();
    for (const record of records) { const parent = record[parentField] == null ? "__root__" : String(record[parentField]); byParent.set(parent, [...(byParent.get(parent) || []), record]); }
    const render = (record, depth = 0) => <div key={record.id} className="space-y-1" style={{ marginLeft: depth * 16 }}><button type="button" onClick={() => clickRecord(record)} className="w-full rounded-md border bg-white px-3 py-2 text-left text-sm" style={{ borderColor: "var(--border-color, #e5e7eb)" }}>{record[config.titleField || "name"] || "Untitled"}{config.statusField && record[config.statusField] ? <span className="ml-2 text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{record[config.statusField]}</span> : null}</button>{depth < (config.maxDepth || 3) ? (byParent.get(String(record.id)) || []).map((child) => render(child, depth + 1)) : null}</div>;
    const roots = records.filter((record) => record[parentField] == null || !records.some((candidate) => String(candidate.id) === String(record[parentField])));
    return <div className="space-y-1">{roots.map((record) => render(record))}</div>;
  }
  if (node.componentKey === "file_viewer") {
    return <FileViewerRecords node={node} records={records} placeholder={placeholder} />;
  }
  if (node.componentKey === "signature") {
    return <div className="space-y-2">{records.length ? records.map((record, index) => <SignatureRecord key={record.id || index} node={node} record={record} objectKey={collection.objectKey} title={record[titleField] || record.id} builderMode={builderMode} />) : <div className="cpb-empty">{placeholder ? `${config.label || "Signature"} values will appear here.` : "No records available."}</div>}</div>;
  }
  return <div className="cpb-empty">No records match this view.</div>;
}

function FileViewerRecords({ node, records, placeholder }) {
  const [filesByRecord, setFilesByRecord] = useState({});
  const [downloadError, setDownloadError] = useState("");
  const objectKey = node.collection?.objectKey || node.config?.objectKey || "";
  const recordIds = records.slice(0, node.config?.maxItems || 12).map((record) => record.id).filter(Boolean);
  useEffect(() => {
    if (!objectKey || !recordIds.length) { setFilesByRecord({}); return undefined; }
    let live = true;
    Promise.all(recordIds.map(async (recordId) => {
      try {
        const result = await apiRequest(`/api/platform/files?objectKey=${encodeURIComponent(objectKey)}&recordId=${encodeURIComponent(recordId)}`);
        return [recordId, Array.isArray(result?.data) ? result.data : []];
      } catch {
        return [recordId, []];
      }
    })).then((entries) => { if (live) setFilesByRecord(Object.fromEntries(entries)); });
    return () => { live = false; };
  }, [objectKey, JSON.stringify(recordIds)]);
  const downloadFile = async (file) => {
    try {
      setDownloadError("");
      const result = await apiRequest(`/api/platform/files/${encodeURIComponent(file.id)}`);
      const base64 = result?.data?.base64;
      if (!base64) throw new Error("File contents are unavailable");
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: result.data.mime_type || "application/octet-stream" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename || file.filename || "download";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error?.message || "Unable to download file");
    }
  };
  if (placeholder) return <div className="cpb-empty">Files appear here when records are connected.</div>;
  const files = recordIds.flatMap((recordId) => (filesByRecord[recordId] || []).map((file) => ({ ...file, recordId })));
  if (!files.length) return <div className="cpb-empty">No files are attached to these records.</div>;
  return <div className="space-y-2">{downloadError ? <p role="alert" className="text-xs text-red-700">{downloadError}</p> : null}<div className={node.config?.displayMode === "grid" ? "grid gap-2 sm:grid-cols-2" : "space-y-1"}>{files.slice(0, node.config?.maxItems || 12).map((file) => <button type="button" key={file.id} onClick={() => downloadFile(file)} className="flex min-w-0 w-full items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 text-left text-sm" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="min-w-0 truncate font-medium">{file.filename}</span><span className="shrink-0 text-xs" style={{ color: "var(--text-secondary, #64748b)" }}>{file.mime_type || "File"}</span></button>)}</div></div>;
}

function SignatureRecord({ node, record, objectKey, title, builderMode }) {
  const canvasRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const config = node.config || {};
  const fieldKey = config.fieldKey || "signature";
  const canCapture = config.displayMode === "capture" && !builderMode;
  const drawing = useRef(false);
  const point = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const context = canvas.getContext("2d");
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#172554";
    return { context, x: (event.clientX - bounds.left) * (canvas.width / bounds.width), y: (event.clientY - bounds.top) * (canvas.height / bounds.height) };
  };
  const save = async () => {
    if (!canvasRef.current || !objectKey || !record.id) return;
    if (config.required && !hasInk) {
      setMessage("A signature is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(record.id)}`, { method: "PUT", body: JSON.stringify({ data: { [fieldKey]: canvasRef.current.toDataURL("image/png") } }) });
      setMessage("Signature saved.");
    } catch (error) {
      setMessage(error?.message || "Unable to save signature");
    } finally {
      setSaving(false);
    }
  };
  return <div className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><div className="mb-2 text-xs font-medium">{config.label || "Signature"} · {title}</div>{record[fieldKey] ? <img className="mb-2 max-h-32 max-w-full object-contain" src={record[fieldKey]} alt={`${config.label || "Signature"} for ${title}`} /> : null}{canCapture ? <><canvas ref={canvasRef} width={config.width || 320} height={config.height || 180} className="block max-w-full touch-none rounded border border-dashed bg-slate-50" style={{ width: "100%", maxWidth: config.width || 320, height: config.height || 180, borderColor: "var(--border-color, #cbd5e1)" }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const { context, x, y } = point(event); context.beginPath(); context.moveTo(x, y); }} onPointerMove={(event) => { if (!drawing.current) return; const { context, x, y } = point(event); context.lineTo(x, y); context.stroke(); setHasInk(true); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /><div className="mt-2 flex gap-2">{config.allowClear !== false ? <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={() => { const context = canvasRef.current?.getContext("2d"); context?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasInk(false); }}>Clear</button> : null}<button type="button" className="onepos-btn onepos-btn-primary onepos-btn-sm" disabled={saving || (config.required && !hasInk)} onClick={save}>{saving ? "Saving…" : "Save signature"}</button></div></> : null}{message ? <p role="status" className="mt-2 text-xs">{message}</p> : null}</div>;
}

function TreeViewView({ node, builderMode, onRecordClick, data }) {
  const collection = node.collection || {};
  const config = node.config || {};
  const state = data?.[node.id] || {};
  const records = Array.isArray(state.records) ? state.records : [];
  const parentField = config.parentField || "parent_id";
  const labelField = config.labelField || "name";
  const secondaryField = config.secondaryField || "status";
  const maxDepth = Math.max(1, Number(config.maxDepth) || 3);
  const defaultExpandedDepth = Math.max(0, Number(config.defaultExpandedDepth) || 1);
  const canCollapse = config.allowCollapse !== false;
  const [expanded, setExpanded] = useState(() => new Set());

  const childMap = useMemo(() => {
    const map = new Map();
    for (const record of records) {
      const parentValue = record[parentField];
      const key = parentValue === null || parentValue === undefined || parentValue === "" ? "__root__" : String(parentValue);
      const bucket = map.get(key) || [];
      bucket.push(record);
      map.set(key, bucket);
    }
    return map;
  }, [records, parentField]);
  const rootRecords = useMemo(() => records.filter((record) => {
    const parentValue = record[parentField];
    if (parentValue === null || parentValue === undefined || parentValue === "") return true;
    return !records.some((candidate) => String(candidate.id) === String(parentValue));
  }), [records, parentField]);
  const toggle = (recordId) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(recordId)) next.delete(recordId);
    else next.add(recordId);
    return next;
  });
  const renderNode = (record, depth = 0) => {
    const children = childMap.get(String(record.id)) || [];
    const isExpanded = canCollapse ? (expanded.has(record.id) || depth < defaultExpandedDepth) : true;
    const isLeaf = !children.length;
    const label = record[labelField] ?? record.name ?? record.title ?? "Untitled";
    const subtitle = secondaryField && record[secondaryField] ? String(record[secondaryField]) : "";
    const countText = config.showCounts !== false && !isLeaf ? ` (${children.length})` : "";

    return (
      <div key={record.id || `${labelField}-${depth}`} className="space-y-1">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" style={{ borderColor: "var(--border-color, #e2e8f0)", marginLeft: depth * 14 }}>
          {canCollapse && !isLeaf ? (
            <button type="button" className="rounded p-0.5 text-slate-500 hover:bg-slate-100" aria-label={isExpanded ? "Collapse" : "Expand"} onClick={() => toggle(record.id)}>
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : <span className="inline-block w-4 text-center text-slate-400">{isLeaf ? "•" : "▸"}</span>}
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={builderMode || !node.interaction || node.interaction.type === "none" ? undefined : () => onRecordClick?.({ record, node })}
          >
            <div className="truncate font-medium" style={{ color: "var(--text-primary, #0f172a)" }}>{String(label)}{countText}</div>
            {subtitle ? <div className="truncate text-[11px]" style={{ color: "var(--text-secondary, #64748b)" }}>{subtitle}</div> : null}
          </button>
        </div>
        {canCollapse && !isLeaf && isExpanded && depth < maxDepth ? (
          <div className="space-y-1">{children.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
        {!canCollapse && !isLeaf && depth < maxDepth ? (
          <div className="space-y-1">{children.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };
  if (state.loading) return <div className="cpb-empty">Loading hierarchy…</div>;
  if (state.error && !records.length) return <div className="cpb-empty">{state.error}</div>;
  if (!records.length && !state.placeholder) return <div className="cpb-empty">No hierarchy records available.</div>;
  return (
    <div className="space-y-2">
      {rootRecords.length ? rootRecords.map((record) => renderNode(record, 0)) : records.slice(0, 6).map((record) => renderNode(record, 0))}
    </div>
  );
}

function ProcessPathView({ node, builderMode, data }) {
  const state = data?.[node.id] || {};
  const config = node.config || {};
  const record = state.records?.[0] || null;
  const statusField = config.statusField || "status";
  const titleField = config.titleField || "";
  const stages = Array.isArray(config.stages) ? config.stages.filter(Boolean) : [];
  const [optimisticStage, setOptimisticStage] = useState("");
  const [savingStage, setSavingStage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setOptimisticStage(record?.[statusField] == null ? "" : String(record[statusField]));
  }, [record?.id, record?.[statusField], statusField]);

  const current = optimisticStage || (record?.[statusField] == null ? "" : String(record[statusField]));
  const stageList = stages.length ? stages : (current ? [current] : []);

  const changeStage = async (stage) => {
    if (builderMode || config.allowStageChange !== true || !record?.id || !node.collection?.objectKey || stage === current) return;
    setSavingStage(stage);
    setMessage("");
    try {
      await apiRequest(
        `/api/platform/objects/${encodeURIComponent(node.collection.objectKey)}/records/${encodeURIComponent(record.id)}`,
        { method: "PUT", body: JSON.stringify({ data: { [statusField]: stage } }) },
      );
      setOptimisticStage(stage);
      setMessage("Stage updated.");
    } catch (error) {
      setMessage(error?.message || "Unable to update stage.");
    } finally {
      setSavingStage("");
    }
  };

  if (state.loading) return <div className="cpb-empty">Loading process path…</div>;
  if (state.error && !record) return <div className="cpb-empty">{state.error}</div>;
  if (!record && !builderMode) return <div className="cpb-empty">No record available for this path.</div>;

  return (
    <div className="space-y-3">
      {titleField && record?.[titleField] ? <div className="text-sm font-semibold" style={{ color: "var(--text-primary,#111827)" }}>{String(record[titleField])}</div> : null}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1" role="list" aria-label={node.label || "Process Path"}>
        {(stageList.length ? stageList : ["Stage 1", "Stage 2", "Stage 3"]).map((stage, index) => {
          const activeIndex = stageList.indexOf(current);
          const completed = activeIndex >= 0 && index < activeIndex;
          const active = String(stage) === String(current);
          return (
            <button
              key={String(stage)}
              type="button"
              role="listitem"
              disabled={builderMode || config.allowStageChange !== true || savingStage !== ""}
              onClick={() => changeStage(String(stage))}
              className={`min-w-[120px] flex-1 rounded-lg border px-3 py-2 text-left text-xs ${active ? "font-semibold" : ""}`}
              style={{
                borderColor: active ? "var(--primary-color,#176f6a)" : "var(--border-color,#d1d5db)",
                background: active ? "color-mix(in srgb, var(--primary-color,#176f6a) 10%, white)" : completed ? "var(--muted-background,#f8fafc)" : "var(--card-background,#fff)",
                color: active ? "var(--primary-color,#176f6a)" : "var(--text-primary,#334155)",
              }}
              title={savingStage === String(stage) ? "Updating…" : String(stage)}
            >
              <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-secondary,#64748b)" }}>{index + 1}</span>
              <span className="block truncate">{String(stage).replaceAll("_", " ")}</span>
            </button>
          );
        })}
      </div>
      {message ? <p role="status" className="text-[11px]" style={{ color: message === "Stage updated." ? "var(--primary-color,#176f6a)" : "#b91c1c" }}>{message}</p> : null}
      {builderMode ? <p className="text-[11px]" style={{ color: "var(--text-secondary,#64748b)" }}>Runtime highlights the current stage from {statusField}.</p> : null}
    </div>
  );
}

function AnalyticsNodeView({ node }) {
  const component = useMemo(() => ({
    id: node.id,
    registryKey: node.componentKey,
    type: node.rendererKey || node.componentKey,
    title: node.title || node.label || "",
    config: node.config || {},
    layout: node.layout || { w: 6, h: 4 },
  }), [node]);
  const [state,setState]=useState({loading:true,result:null,error:""});
  useEffect(()=>{
    let live=true;
    setState({loading:true,result:null,error:""});
    apiRequest("/api/dashboards/run",{method:"POST",body:JSON.stringify({name:"Embedded analytics",description:"",components:[component],filters:[],global_filters:[],run_as_mode:"VIEWER"})})
      .then((response)=>{if(!live)return;const result=response?.success?response.data?.components?.find((item)=>String(item.id)===String(component.id)):null;setState({loading:false,result,error:response?.success?"":response?.message||"Unable to load analytics component"});})
      .catch((error)=>{if(live)setState({loading:false,result:null,error:error?.message||"Unable to load analytics component"});});
    return()=>{live=false;};
  },[component]);
  return renderDashboardComponent(component,state.result,state.loading?"loading":state.error?"error":"ready");
}


function configText(config, keys, fallback = "") {
  for (const key of keys) {
    const value = config?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return fallback;
}

function GenericPageComponentView({ node, builderMode, onButtonClick, runtimeValue, onValueChange }) {
  const key = node.componentKey;
  const config = node.config || {};
  const title = node.title || config.title || config.label || node.label || key.replace(/_/g, " ");
  const action = () => { if (!builderMode) onButtonClick?.(node); };
  const options = Array.isArray(config.options) ? config.options : Array.isArray(config.items) ? config.items : [];
  const disabled = builderMode || node.enabled === false || node.readOnly === true || config.disabled === true;
  const setValue = (value) => { if (!builderMode && !disabled) onValueChange?.(node, value); };

  if (key === "card") return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm font-semibold">{title}</div>{config.subtitle ? <div className="mt-1 text-xs text-slate-500">{String(config.subtitle)}</div> : null}</div>;
  if (key === "grid") return <div className="grid gap-2 rounded-xl border border-dashed p-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, Number(config.columns) || 2))}, minmax(0,1fr))` }}>{Array.from({length:Math.max(2,Math.min(6,Number(config.columns)||2))}).map((_,i)=><div key={i} className="h-10 rounded bg-slate-100" />)}</div>;
  if (key === "stack") return <div className={`flex gap-2 rounded-xl border border-dashed p-3 ${config.direction === "row" ? "flex-row" : "flex-col"}`}><div className="h-8 flex-1 rounded bg-slate-100"/><div className="h-8 flex-1 rounded bg-slate-100"/></div>;
  if (key === "tabs") return <div><div className="flex gap-1 border-b">{(options.length?options:["Tab 1","Tab 2"]).map((item,i)=><button key={i} type="button" className={`px-3 py-2 text-xs ${i===0?"border-b-2 border-teal-600 font-semibold":""}`} disabled>{typeof item==="object"?(item.label||item.title||`Tab ${i+1}`):String(item)}</button>)}</div><div className="p-3 text-xs text-slate-500">Tab content</div></div>;
  if (key === "accordion") return <details open={config.defaultOpen !== false} className="rounded-lg border p-3"><summary className="cursor-default text-sm font-semibold">{title}</summary><div className="pt-2 text-xs text-slate-500">{config.message || "Accordion content"}</div></details>;
  if (["modal","drawer","confirmation_dialog"].includes(key)) return <div className="rounded-xl border bg-white p-4 shadow-lg"><div className="text-sm font-semibold">{title}</div><div className="mt-2 text-xs text-slate-500">{config.message || `${key.replace(/_/g," ")} preview`}</div>{key==="confirmation_dialog"?<div className="mt-3 flex justify-end gap-2"><button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled>Cancel</button><button type="button" className="onepos-btn onepos-btn-primary onepos-btn-sm" disabled>Confirm</button></div>:null}</div>;
  if (["alert","toast"].includes(key)) return <div className="rounded-lg border p-3"><div className="text-sm font-semibold">{title}</div><div className="text-xs text-slate-500">{config.message || "Message"}</div></div>;
  if (key === "badge") return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{configText(config,["valueBinding","value"],"Badge")}</span>;
  if (key === "progress") { const max=Math.max(1,Number(config.max)||100); const value=Math.max(0,Math.min(max,Number(config.valueBinding)||0)); return <div className="space-y-1"><div className="flex justify-between text-xs"><span>{config.label||"Progress"}</span>{config.showValue!==false?<span>{Math.round(value/max*100)}%</span>:null}</div><div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-teal-600" style={{width:`${value/max*100}%`}}/></div></div>; }
  if (key === "empty_state") return <div className="rounded-xl border border-dashed p-6 text-center"><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs text-slate-500">{config.message||"Nothing to show yet."}</div></div>;
  if (key === "loading_state") return <div className="space-y-2">{Array.from({length:Math.max(1,Math.min(8,Number(config.rows)||3))}).map((_,i)=><div key={i} className="h-3 animate-pulse rounded bg-slate-100"/>)}</div>;
  if (key === "image") return config.source ? <img src={config.source} alt={config.alt||""} className="max-h-64 w-full rounded-lg object-cover" /> : <div className="cpb-empty">Choose an image source in Properties.</div>;
  if (key === "video") return config.source ? <video src={config.source} poster={config.poster||undefined} controls={config.controls!==false} className="max-h-72 w-full rounded-lg" /> : <div className="cpb-empty">Choose a video source in Properties.</div>;
  if (["avatar","app_icon"].includes(key)) { const image=config.image||config.imageBinding; const initials=config.initialsBinding||config.label||title.slice(0,2).toUpperCase(); return <div className="flex items-center gap-2">{image?<img src={image} alt="" className="h-12 w-12 rounded-xl object-cover"/>:<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold">{initials}</div>}{config.label?<span className="text-sm">{String(config.label)}</span>:null}</div>; }
  if (key === "icon") return <div className="flex items-center gap-2 text-sm"><span className="text-xl">{config.icon||"◈"}</span>{config.label||title}</div>;
  if (key === "qr_code") return <div className="inline-flex flex-col items-center gap-2"><div className="grid h-24 w-24 grid-cols-6 gap-0.5 bg-white p-2 ring-1 ring-slate-200">{Array.from({length:36}).map((_,i)=><span key={i} className={i%3===0||i%7===0?"bg-slate-900":"bg-white"}/>)}</div>{config.label?<span className="text-xs">{String(config.label)}</span>:null}</div>;
  if (key === "barcode") return <div className="inline-flex flex-col items-center gap-1"><div className="flex h-16 items-stretch gap-px bg-white p-2 ring-1 ring-slate-200">{Array.from({length:28}).map((_,i)=><span key={i} className="bg-slate-900" style={{width:i%4===0?3:1}}/>)}</div>{config.showValue!==false?<span className="text-[10px]">{configText(config,["valueBinding"],"000000000000")}</span>:null}</div>;
  if (key === "search_box") return <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder={config.placeholder||"Search…"} value={runtimeValue ?? ""} disabled={disabled} required={node.required===true} onChange={(event)=>setValue(event.target.value)}/>;
  if (key === "toggle") return <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(runtimeValue)} disabled={disabled} required={node.required===true} onChange={(event)=>setValue(event.target.checked)}/>{config.label||title}</label>;
  if (key === "radio_group") return <div className={`flex gap-3 ${config.orientation==="vertical"?"flex-col":""}`}>{(options.length?options:["Option 1","Option 2"]).map((item,i)=><label key={i} className="inline-flex items-center gap-1.5 text-sm"><input type="radio" disabled={disabled} name={node.id} checked={String(runtimeValue??"")===String(typeof item==="object"?(item.value??item.label):item)} onChange={()=>setValue(typeof item==="object"?(item.value??item.label):item)}/>{typeof item==="object"?(item.label||item.value):String(item)}</label>)}</div>;
  if (key === "slider") return <div><input className="w-full" type="range" min={config.min??0} max={config.max??100} step={config.step??1} value={runtimeValue ?? config.min ?? 0} disabled={disabled} onChange={(event)=>setValue(Number(event.target.value))}/></div>;
  if (key === "file_upload") return <label className="block rounded-lg border border-dashed p-4 text-center text-xs text-slate-500">Choose files<input type="file" className="hidden" multiple={config.multiple===true} disabled={disabled}/></label>;
  if (key === "pin_input") return <div className="flex gap-1.5">{Array.from({length:Math.max(1,Math.min(12,Number(config.length)||4))}).map((_,i)=><input key={i} className="h-9 w-9 rounded border text-center" disabled={disabled} maxLength={1}/>)}</div>;
  if (["select","multi_select"].includes(key)) return <label className="block text-xs"><span className="mb-1 block text-slate-500">{config.label||title}</span><select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" multiple={key==="multi_select"} disabled={disabled} required={node.required===true} value={key==="multi_select"?(Array.isArray(runtimeValue)?runtimeValue:[]):(runtimeValue??"")} onChange={(event)=>setValue(key==="multi_select"?Array.from(event.target.selectedOptions).map((option)=>option.value):event.target.value)}><option>{config.placeholder||"Select…"}</option>{options.map((item,i)=><option key={i} value={typeof item==="object"?(item.value??item.label):String(item)}>{typeof item==="object"?(item.label||item.value):String(item)}</option>)}</select></label>;
  if (key === "time_input") return <label className="block text-xs"><span className="mb-1 block text-slate-500">{config.label||title}</span><input className="w-full rounded-lg border px-3 py-2 text-sm" type="time" step={config.step||undefined} disabled={disabled} required={node.required===true} value={runtimeValue??""} onChange={(event)=>setValue(event.target.value)}/></label>;
  if (key === "date_picker") return <label className="block text-xs"><span className="mb-1 block text-slate-500">{config.label||title}</span><input className="w-full rounded-lg border px-3 py-2 text-sm" type="date" min={config.min||undefined} max={config.max||undefined} disabled={disabled} required={node.required===true} value={runtimeValue??""} onChange={(event)=>setValue(event.target.value)}/></label>;
  if (key === "pagination") return <div className="flex items-center justify-center gap-2 text-xs"><button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled>Previous</button><span>1</span><button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled>Next</button></div>;
  if (key === "filter_bar") return <div className="flex flex-wrap gap-2 rounded-lg border p-2">{(Array.isArray(config.fields)&&config.fields.length?config.fields:["Filter"]).map((field,i)=><span key={i} className="rounded bg-slate-100 px-2 py-1 text-xs">{String(field)}</span>)}</div>;
  if (["icon_button","back_button","close_button","refresh_button","navigation_button"].includes(key)) return <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={disabled} onClick={action}><span>{config.icon||({back_button:"←",close_button:"×",refresh_button:"↻"}[key]||"◈")}</span>{config.label||title}</button>;
  if (key === "link") return <a href={builderMode?"#":(config.href||"#")} target={config.target||"_self"} onClick={builderMode?(e)=>e.preventDefault():undefined} className="text-sm text-teal-700 underline">{config.label||title}</a>;
  if (key === "menu") return <div className="inline-flex rounded-lg border bg-white p-1">{(options.length?options:["Menu"]).slice(0,5).map((item,i)=><button type="button" disabled key={i} className="px-2 py-1 text-xs">{typeof item==="object"?(item.label||item.title):String(item)}</button>)}</div>;
  if (key === "breadcrumb") return <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">{(options.length?options:["Home","Page"]).map((item,i)=><span key={i}>{i>0?<span className="mr-1">/</span>:null}{typeof item==="object"?(item.label||item.title):String(item)}</span>)}</div>;
  if (key === "stepper") return <div className={`flex gap-2 ${config.orientation==="vertical"?"flex-col":""}`}>{(Array.isArray(config.steps)&&config.steps.length?config.steps:["Step 1","Step 2","Step 3"]).map((item,i)=><div key={i} className="flex items-center gap-1.5 text-xs"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${i<=(Number(config.currentStep)||0)?"bg-teal-600 text-white":"bg-slate-100"}`}>{i+1}</span><span>{typeof item==="object"?(item.label||item.title):String(item)}</span></div>)}</div>;
  if (key === "tooltip") return <span className="inline-flex rounded border border-dashed px-2 py-1 text-xs" title={config.content||"Tooltip"}>{config.trigger||"Hover target"}</span>;
  if (key === "dock_item") return <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm" disabled={disabled} onClick={action}><span>{config.icon||"◈"}</span><span>{config.label||title}</span>{config.badge?<span className="rounded-full bg-slate-800 px-1.5 text-[10px] text-white">{String(config.badge)}</span>:null}</button>;
  if (key === "jarves") {
    const size = Math.max(36, Math.min(96, Number(config.size) || 56));
    return <button type="button" aria-label={config.label || "JARVES"} disabled={disabled} onClick={action} className="inline-flex items-center gap-2 rounded-full border bg-white p-1.5 shadow-sm" style={{ borderColor: "var(--border-color, #e5e7eb)" }}><span className="flex items-center justify-center rounded-full bg-slate-900 text-white" style={{ width: size, height: size }}>✦</span>{config.label ? <span className="pr-3 text-sm font-medium">{String(config.label)}</span> : null}</button>;
  }
  return <div className="rounded-lg border border-dashed p-3 text-sm text-slate-500">{title}</div>;
}

function NodeView({ node, sectionWidth, device, builderMode, onRecordClick, onButtonClick, onValueChange, data, runtimeOverrides = {} }) {
  const key = node.componentKey;
  if (node.visible === false && !builderMode) return null;
  const interactive = node.enabled !== false && node.readOnly !== true;
  const guardedRecordClick = interactive ? onRecordClick : undefined;
  const guardedButtonClick = interactive ? onButtonClick : undefined;
  if (node.runtimeKind === "analytics") return <AnalyticsNodeView node={node} />;
  if (STATIC_DASHBOARD_COMPONENTS.includes(key)) {
    const config = { ...(node.config || {}) };
    if (key === "avatar_group") {
      const records = Array.isArray(data?.[node.id]?.records) ? data[node.id].records : [];
      if (records.length) {
        const imageField = config.imageField || "";
        const initialsField = config.initialsField || "name";
        config.avatars = records.slice(0, Number(config.maxVisible) || 5).map((record) => ({
          label: record[initialsField] || record.name || record.title || "",
          initials: String(record[initialsField] || record.name || record.title || "?").trim().slice(0, 2).toUpperCase(),
          image: imageField ? record[imageField] : "",
        }));
      }
    }
    return renderDashboardComponent({
      id: node.id,
      registryKey: key,
      type: node.rendererKey || key,
      title: node.title || node.label || "",
      config,
      layout: node.layout || {},
    }, null, "ready");
  }
  if (["record_picker", "searchable_dropdown"].includes(key)) {
    const config = node.config || {};
    const state = data?.[node.id] || {};
    if (!config.objectKey) return <div className="cpb-empty">Select an Object in Properties to preview records.</div>;
    const records = Array.isArray(state.records) ? state.records : [];
    if (state.error && !records.length) return <div className="cpb-empty" role="alert">{state.error}</div>;
    const valueField = config.valueField || "id";
    const labelField = config.labelField || "name";
    const secondaryField = config.secondaryField || "";
    return (
      <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" disabled={builderMode || state.loading || node.enabled === false || node.readOnly === true} required={node.required===true} value={runtimeOverrides?.[node.id]?.value ?? ""} onChange={(event)=>{ const selected=records.find((record)=>String(record[valueField]||record.id||"")===event.target.value)||null; onValueChange?.(node,event.target.value,selected); }}>
        <option value="">{state.loading ? "Loading…" : !records.length ? "No matching records" : (config.placeholder || "Select record…")}</option>
        {records.map((record, index) => <option key={record[valueField] || record.id || index} value={record[valueField] || record.id || ""}>{String(record[labelField] || record.name || record.id || "Record")}{secondaryField && record[secondaryField] ? ` · ${record[secondaryField]}` : ""}</option>)}
      </select>
    );
  }
  if (key === "product_image_card") {
    const config = node.config || {};
    const state = data?.[node.id] || {};
    if (!config.objectKey) return <div className="cpb-empty">Select an Object in Properties to preview product records.</div>;
    const records = Array.isArray(state.records) ? state.records : [];
    if (state.loading) return <div className="cpb-empty">Loading records…</div>;
    if (state.error && !records.length) return <div className="cpb-empty">{state.error}</div>;
    const shown = records.slice(0, Math.max(1, Number(config.maxRecords) || 8));
    return <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>{shown.map((record, index) => {
      const image = config.imageField ? record[config.imageField] : "";
      const title = record[config.titleField || "name"] || "Record";
      const subtitleFields = Array.isArray(config.subtitleFields) ? config.subtitleFields : [];
      return <div key={record.id || index} className="overflow-hidden rounded-lg border border-slate-200 bg-white">{image ? <img src={image} alt="" className="h-28 w-full object-cover" /> : <div className="h-28 bg-slate-100" />}<div className="p-2"><div className="truncate text-sm font-semibold">{String(title)}</div>{subtitleFields.slice(0,2).map((field) => record[field] ? <div key={field} className="truncate text-xs text-slate-500">{String(record[field])}</div> : null)}</div></div>;
    })}{!shown.length ? <div className="cpb-empty">No records match this component.</div> : null}</div>;
  }
  if (GENERIC_PAGE_COMPONENTS.has(key)) return <GenericPageComponentView node={node} builderMode={builderMode} onButtonClick={guardedButtonClick} runtimeValue={runtimeOverrides?.[node.id]?.value} onValueChange={onValueChange} />;
  const currentOverride = runtimeOverrides?.[node.id] || {};
  if (ADVANCED_RECORD_COMPONENTS.includes(key)) return <AdvancedRecordView node={node} data={data} onRecordClick={guardedRecordClick} builderMode={builderMode} />;
  if (key === "container") {
    return (
      <div className="cpb-container-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, node.columns || 2)}, minmax(0, 1fr))`, gap: (node.spacing || 3) * 4 }}>
        {(node.children || []).map((child) => <NodeView key={child.id} node={child} sectionWidth={sectionWidth} device={device} builderMode={builderMode} onRecordClick={guardedRecordClick} onButtonClick={guardedButtonClick} onValueChange={onValueChange} data={data} runtimeOverrides={runtimeOverrides} />)}
      </div>
    );
  }
  if (key === "multi_container") {
    return <MultiContainerView node={node} sectionWidth={sectionWidth} device={device} builderMode={builderMode} onRecordClick={guardedRecordClick} data={data?.[node.id]} />;
  }
  if (key === "table") {
    return <TableView node={node} builderMode={builderMode} onRecordClick={guardedRecordClick} data={data?.[node.id]} />;
  }
  if (key === "tree_view") {
    return <TreeViewView node={node} builderMode={builderMode} onRecordClick={guardedRecordClick} data={data} />;
  }
  if (key === "process_path") {
    return <ProcessPathView node={node} builderMode={builderMode} data={data} />;
  }
  if (key === "button") {
    const variantClass = { primary: "onepos-btn-primary", secondary: "onepos-btn-secondary", ghost: "onepos-btn-secondary", danger: "onepos-btn-danger" }[node.variant || "primary"] || "onepos-btn-primary";
    return (
      <button
        type="button"
        className={`onepos-btn ${variantClass}${node.size === "small" ? " onepos-btn-sm" : ""}`}
        onClick={builderMode ? undefined : () => onButtonClick?.(node)}
      >
        {node.label || "Button"}
      </button>
    );
  }
  if (key === "header") return <h3 className="text-base font-semibold" style={{ color: "var(--text-primary, #111827)" }}>{node.text || node.label || "Heading"}</h3>;
  if (key === "text") return <p className="text-sm" style={{ color: "var(--text-secondary, #475569)" }}>{node.text || node.label || "Text"}</p>;
  if (key === "divider") return <hr style={{ borderColor: "var(--border-color, #e5e7eb)", margin: 0 }} />;
  if (key === "spacer") return <div style={{ height: 16 + (Number(node.spacing) || 3) * 6 }} aria-hidden="true" />;
  if (key === "related_list") return <div className="cpb-empty">Related list{node.relationshipKey ? ` · ${node.relationshipKey}` : ""}</div>;
  if (key === "field_value") {
    const value = currentOverride?.value;
    return <div className="text-sm" style={{ color: "var(--text-primary, #374151)" }}>{value !== undefined ? formatRecordValue(value) : node.field ? `${String(node.field).replace(/_/g, " ")}` : "Field value"}</div>;
  }
  return <div className="text-sm" style={{ color: "var(--text-secondary, #64748b)" }}>{nodeLabel(node)}</div>;
}

/**
 * Per-node hook host: the ONE useRecordCollection hook instance for each
 * record-bound node. Writing the fetch result into the page-level state map
 * (via setNodeState) keeps pagination page state and data in a single owner —
 * the shared renderer — so MultiContainer, Table and future record components
 * stay in perfect sync without extra wiring.
 */
function RecordBoundNodeBoundary({ node, collectionState, pageByNode, setNodeState, setPage, runtimeOverride, pageContext, children }) {
  const baseCollection = ADVANCED_RECORD_COMPONENTS.includes(node.componentKey)
    ? advancedCollection(node)
    : REGISTRY_RECORD_COMPONENTS.includes(node.componentKey)
      ? (() => {
          const config = node.config || {};
          const fields = new Set();
          for (const [key, value] of Object.entries(config)) {
            if (/(Field|Binding)$/i.test(key) && typeof value === "string" && /^[a-z_][a-z0-9_]*$/.test(value)) fields.add(value);
            if (/Fields$/i.test(key) && Array.isArray(value)) value.forEach((field) => {
              if (typeof field === "string" && /^[a-z_][a-z0-9_]*$/.test(field)) fields.add(field);
            });
          }
          return {
            objectKey: config.objectKey || "",
            conditions: Array.isArray(config.filters) ? config.filters : [],
            conditionMatch: config.conditionMatch === "any" ? "any" : "all",
            sort: Array.isArray(config.sort) ? config.sort : [],
            maxRecords: Math.max(1, Math.min(50, Number(config.maxRecords || config.maxVisible) || 10)),
            fields: [...fields],
          };
        })()
      : (node.collection || {});
  const dynamicFilter = runtimeOverride?.filter?.field
    ? [{ field: runtimeOverride.filter.field, operator: "equals", value: runtimeOverride.filter.value }]
    : [];
  const collection = {
    ...baseCollection,
    conditions: [...(baseCollection.conditions || []), ...dynamicFilter],
    __refreshNonce: runtimeOverride?.refreshNonce || 0,
  };
  const isRecordBound = ["multi_container", "table", "tree_view", "process_path", ...ADVANCED_RECORD_COMPONENTS, ...REGISTRY_RECORD_COMPONENTS].includes(node.componentKey);
  const page = pageByNode[node.id] || 1;
  const live = useRecordCollection(collection, {
    enabled: isRecordBound && Boolean(collection.objectKey),
    page,
    pageContext,
  });
  const effectiveLive = isRecordBound && !collection.objectKey
    ? { records: [], total: 0, fields: collection.fields || [], placeholder: true, loading: false, error: "" }
    : live;
  useEffect(() => {
    if (!isRecordBound) return;
    setNodeState(node.id, {
      ...effectiveLive,
      page,
      onPageChange: (nextPage) => setPage((current) => ({ ...current, [node.id]: Math.max(1, Number(nextPage) || 1) })),
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isRecordBound, node.id, collection.objectKey, effectiveLive.records, effectiveLive.total, effectiveLive.loading, effectiveLive.error, effectiveLive.placeholder, page]);
  return children;
}

/**
 * The shared renderer.
 *
 * @param definition  normalised Custom Page tree (customPageTree.js shape)
 * @param builderMode when true, records stay as placeholders and interactions are inert
 * @param device      desktop | tablet | mobile | kiosk (builder device preview / runtime width)
 */
export default function CustomPageRenderer({ definition, builderMode = false, device = "desktop", selectedId = null, onSelectNode = null, onRecordClick = null, onButtonClick = null, renderSectionChrome = null, pageContext = null }) {
  const sections = Array.isArray(definition?.sections) ? definition.sections : [];

  /*
   * ONE page-level Record Collection state map.
   *
   * Every record-bound node gets a slot in one state map keyed by node id.
   * Pagination page indexes live HERE (not inside the node components), so a
   * Max Records or conditions change re-fetches the same page instead of
   * resetting it, and each collection keeps its own page while others change.
   * The hook is rendered through a tiny per-node component so rules-of-hooks
   * stay satisfied with a dynamic node list.
   */
  const [collectionState, setCollectionState] = useState({});
  const [pageByNode, setPageByNode] = useState({});
  const [runtimeOverrides, setRuntimeOverrides] = useState({});
  useEffect(() => {
    const onInteractionComplete = (event) => {
      const detail = event?.detail || {};
      if (!detail.nodeId) return;
      setRuntimeOverrides((current) => ({
        ...current,
        [detail.nodeId]: {
          ...(current[detail.nodeId] || {}),
          lastInteraction: detail,
          refreshNonce: Number(current[detail.nodeId]?.refreshNonce || 0) + 1,
          ...(detail.output !== undefined ? { flowOutput: detail.output } : {}),
        },
      }));
    };
    window.addEventListener("oneengine:page-interaction-complete", onInteractionComplete);
    return () => window.removeEventListener("oneengine:page-interaction-complete", onInteractionComplete);
  }, []);

  const applyComponentInteraction = ({ record = null, node }) => {
    const interaction = node?.interaction;
    if (!interaction || interaction.type !== "component" || !interaction.targetNodeId) return false;
    const targetId = String(interaction.targetNodeId);
    setRuntimeOverrides((current) => {
      const existing = current[targetId] || {};
      const operation = interaction.operation || "set_record";
      if (operation === "set_record") {
        return { ...current, [targetId]: { ...existing, record: record || null } };
      }
      if (operation === "filter_collection") {
        const sourceField = interaction.sourceField || "id";
        const targetField = interaction.targetField || sourceField;
        return { ...current, [targetId]: { ...existing, filter: { field: targetField, value: record?.[sourceField] ?? null }, refreshNonce: Number(existing.refreshNonce || 0) + 1 } };
      }
      if (operation === "set_value") {
        const sourceField = interaction.sourceField || "";
        const value = sourceField ? record?.[sourceField] : record;
        return { ...current, [targetId]: { ...existing, value, valueKey: interaction.targetField || "value" } };
      }
      if (operation === "refresh") {
        return { ...current, [targetId]: { ...existing, refreshNonce: Number(existing.refreshNonce || 0) + 1 } };
      }
      return current;
    });
    return true;
  };

  const handleRecordClick = (payload) => {
    if (!applyComponentInteraction(payload)) onRecordClick?.(payload);
  };

  const handleButtonClick = (node) => {
    if (!applyComponentInteraction({ record: null, node })) onButtonClick?.(node);
  };

  const handleValueChange = (node, value, selectedRecord = undefined) => {
    setRuntimeOverrides((current) => ({ ...current, [node.id]: { ...(current[node.id] || {}), value, ...(selectedRecord !== undefined ? { record: selectedRecord } : {}) } }));
  };

  const recordNodes = useMemo(() => {
    const nodes = [];
    for (const section of sections) {
      const visit = (list) => {
        for (const node of list || []) {
          if (["multi_container", "table", "tree_view", "process_path", ...ADVANCED_RECORD_COMPONENTS, ...REGISTRY_RECORD_COMPONENTS].includes(node.componentKey)) nodes.push(node);
          if (Array.isArray(node.children)) visit(node.children);
        }
      };
      visit(section.children);
    }
    return nodes;
  }, [sections]);

  const setNodeState = (nodeId, patch) => setCollectionState((current) => ({ ...current, [nodeId]: { ...(current[nodeId] || {}), ...patch } }));
  const effectivePageContext = {
    ...(pageContext || {}),
    components: {
      ...(pageContext?.components || {}),
      ...Object.fromEntries(Object.entries(runtimeOverrides).map(([id, state]) => [id, {
        value: state?.value,
        selectedRecord: state?.record || null,
      }])),
    },
    flows: {
      ...(pageContext?.flows || {}),
      ...Object.fromEntries(Object.entries(runtimeOverrides).filter(([, state]) => state?.flowOutput !== undefined).map(([id, state]) => [id, state.flowOutput])),
    },
  };

  return (
    <div className={`cpb-tree${device === "mobile" ? " mx-auto w-full max-w-[390px]" : device === "tablet" ? " mx-auto w-full max-w-[820px]" : device === "kiosk" ? " mx-auto w-full max-w-[1024px]" : " w-full"}`}>
      <style>{PAGE_BUILDER_GRID_CSS}</style>
      {sections.filter((section) => section.visible !== false).map((section) => {
        const body = (
          <div className="cpb-section-body">
            {(section.children || []).filter((child) => child.visible !== false).map((node) => (
              <div
                key={node.id}
                onClick={builderMode && onSelectNode ? (event) => { event.stopPropagation(); onSelectNode(node.id, null); } : undefined}
                style={{
                  minWidth: 0,
                  width: Number(node.layout?.width) > 0 ? `min(100%, ${Number(node.layout.width)}px)` : undefined,
                  minHeight: Number(node.layout?.height) > 0 ? Number(node.layout.height) : undefined,
                }}
                className={`${builderMode && selectedId === node.id ? "cpb-selected" : ""}`}
              >
                <RecordBoundNodeBoundary node={node} collectionState={collectionState} pageByNode={pageByNode} setNodeState={setNodeState} setPage={setPageByNode} runtimeOverride={runtimeOverrides[node.id]} pageContext={effectivePageContext}>
                  <NodeView
                    node={node}
                    sectionWidth={section.width}
                    device={device}
                    builderMode={builderMode}
                    onRecordClick={handleRecordClick}
                    onButtonClick={handleButtonClick}
                    onValueChange={handleValueChange}
                    data={runtimeOverrides[node.id]?.record
                      ? { ...collectionState, [node.id]: { ...(collectionState[node.id] || {}), records: [runtimeOverrides[node.id].record], total: 1, loading: false, error: "", placeholder: false } }
                      : collectionState}
                    runtimeOverrides={runtimeOverrides}
                  />
                </RecordBoundNodeBoundary>
              </div>
            ))}
            {!section.children?.length ? <div className="cpb-empty">Drop components here</div> : null}
          </div>
        );
        /* The builder supplies its own section chrome (labels, width, drop zones);
           runtime renders the plain section card. */
        if (renderSectionChrome) return renderSectionChrome(section, body);
        return (
          <section key={section.id} className="cpb-section onepos-card p-4" style={{ flexBasis: SECTION_WIDTHS[section.width]?.basis || "100%", width: section.width === "full" ? "100%" : SECTION_WIDTHS[section.width]?.basis }}>
            {body}
          </section>
        );
      })}
      {!sections.length ? <div className="cpb-empty">Drag a Section onto the page to start.</div> : null}
    </div>
  );
}
