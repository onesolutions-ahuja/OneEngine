import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { apiRequest } from "../../../services/api.js";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function normalizedStatus(status) {
  return String(status || "pending").toUpperCase();
}

export default function WorkItemsAdmin({ onMessage, onError }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("/api/platform/approval-requests");
      const rows = Array.isArray(response?.data) ? response.data : [];
      setItems(rows);
      setSelectedId((current) => rows.some((row) => String(row.id) === String(current)) ? current : (rows[0]?.id || ""));
    } catch (error) {
      onError?.(error?.message || "Unable to load work items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadItems(); }, []);

  const statuses = useMemo(() => {
    const values = [...new Set(items.map((item) => normalizedStatus(item.status)).filter(Boolean))];
    return ["ALL", ...values];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "ALL" && normalizedStatus(item.status) !== statusFilter) return false;
      if (!q) return true;
      return [
        item.process_name,
        item.flow_name,
        item.assignee_name,
        item.assigned_to,
        item.queue_name,
        item.queue,
        item.record_id,
        item.object_key,
        item.step_label,
        item.id,
        item.status,
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [items, query, statusFilter]);

  const selected = useMemo(
    () => filteredItems.find((item) => String(item.id) === String(selectedId)) || filteredItems[0] || null,
    [filteredItems, selectedId],
  );

  useEffect(() => {
    if (selected && String(selected.id) !== String(selectedId)) setSelectedId(selected.id);
    if (!selected && selectedId) setSelectedId("");
  }, [selected, selectedId]);

  const updateItem = async (requestId, decision) => {
    try {
      setWorking(requestId);
      await apiRequest(`/api/platform/approval-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: "Completed from work-item UI" }),
      });
      await loadItems();
      onMessage?.("Work item updated.");
    } catch (error) {
      onError?.(error?.message || "Unable to update work item");
    } finally {
      setWorking("");
    }
  };

  const terminal = selected ? ["APPROVED","REJECTED","CANCELLED"].includes(normalizedStatus(selected.status)) : false;

  return (
    <div className="developer-record-shell work-items-record-shell">
      <aside className="developer-record-list">
        <div className="developer-record-list-head">
          <div><strong>Work Items</strong><span>{loading ? "Loading…" : `${filteredItems.length} of ${items.length}`}</span></div>
          <div className="developer-record-head-actions">
            <button type="button" onClick={loadItems} disabled={loading} title="Refresh" aria-label="Refresh">
              <RefreshCw size={14} className={loading ? "is-spinning" : ""}/>
            </button>
          </div>
        </div>

        <label className="developer-record-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work items" />
        </label>

        <div className="developer-record-filters">
          {statuses.map((status) => (
            <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => setStatusFilter(status)}>
              {status === "ALL" ? "All" : status[0] + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="developer-record-list-body">
          {loading ? <div className="developer-record-empty">Loading work items…</div> : null}
          {!loading && filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`developer-record-row ${String(selected?.id) === String(item.id) ? "is-selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <span className="developer-record-row-copy">
                <strong>{item.process_name || item.flow_name || item.step_label || "Work item"}</strong>
                <small>{item.assignee_name || item.assigned_to || "Unassigned"} · {item.record_id || item.object_key || "No record"}</small>
                <small>{formatDate(item.submitted_at || item.created_at)}</small>
              </span>
              <span className={`developer-record-status status-${normalizedStatus(item.status).toLowerCase()}`}>
                {normalizedStatus(item.status)}
              </span>
            </button>
          ))}
          {!loading && !filteredItems.length ? (
            <div className="developer-record-empty"><strong>No work items found</strong><span>Change the search or status filter.</span></div>
          ) : null}
        </div>
      </aside>

      <section className="developer-record-detail">
        {selected ? (
          <>
            <div className="developer-record-detail-head">
              <div>
                <span>Work Item</span>
                <strong>{selected.process_name || selected.flow_name || selected.step_label || "Work item"}</strong>
                <small>#{String(selected.id || "").slice(0, 12)}</small>
              </div>
              <span className={`developer-record-status status-${normalizedStatus(selected.status).toLowerCase()}`}>{normalizedStatus(selected.status)}</span>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Assignment</div>
              <div className="developer-record-fields">
                <div><span>Assignee</span><strong>{selected.assignee_name || selected.assigned_to || "Unassigned"}</strong></div>
                <div><span>Queue / Group</span><strong>{selected.queue_name || selected.queue || "—"}</strong></div>
                <div><span>Step</span><strong>{selected.step_label || "—"}</strong></div>
                <div><span>Status</span><strong>{normalizedStatus(selected.status)}</strong></div>
              </div>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Source & Related Record</div>
              <div className="developer-record-fields">
                <div><span>Process</span><strong>{selected.process_name || selected.flow_name || "—"}</strong></div>
                <div><span>Object</span><strong>{selected.object_key || selected.object_name || "—"}</strong></div>
                <div><span>Record</span><strong>{selected.record_id || "—"}</strong></div>
                <div><span>Request ID</span><strong>{selected.id || "—"}</strong></div>
              </div>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Timing</div>
              <div className="developer-record-fields">
                <div><span>Created</span><strong>{formatDate(selected.submitted_at || selected.created_at)}</strong></div>
                <div><span>Due</span><strong>{formatDate(selected.due_at || selected.due_date)}</strong></div>
                <div><span>Completed</span><strong>{formatDate(selected.resolved_at || selected.completed_at)}</strong></div>
                <div><span>Decision</span><strong>{selected.result || selected.decision || "—"}</strong></div>
              </div>
            </div>

            {!terminal ? (
              <div className="developer-record-actions">
                <button
                  type="button"
                  className="is-primary"
                  disabled={working === selected.id}
                  onClick={() => updateItem(selected.id, "approve")}
                >
                  {working === selected.id ? "Working…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={working === selected.id}
                  onClick={() => updateItem(selected.id, "reject")}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="developer-record-empty"><strong>Select a work item</strong><span>Choose a record from the list to see details.</span></div>
        )}
      </section>
    </div>
  );
}
