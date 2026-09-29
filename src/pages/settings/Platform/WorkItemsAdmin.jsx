import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "../../../services/api.js";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusBadge(status) {
  const normalized = String(status || "").toUpperCase();
  const palette = {
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
    CANCELLED: "bg-slate-200 text-slate-700",
  };
  return `inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${palette[normalized] || "bg-slate-200 text-slate-700"}`;
}

export default function WorkItemsAdmin({ onMessage, onError }) {
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [flowFilter, setFlowFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [queueFilter, setQueueFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");

  const loadItems = async () => {
    try {
      setLoading(true);
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await apiRequest(`/api/platform/approval-requests${query}`);
      const nextItems = Array.isArray(response?.data) ? response.data : [];
      setItems(nextItems);
      if (!selectedId && nextItems[0]?.id) setSelectedId(nextItems[0].id);
    } catch (error) {
      onError?.(error?.message || "Unable to load work items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [statusFilter]);

  const filteredItems = useMemo(() => {
    const assigneeQuery = assigneeFilter.trim().toLowerCase();
    const queueQuery = queueFilter.trim().toLowerCase();
    const flowQuery = flowFilter.trim().toLowerCase();
    const dateQuery = dateFilter.trim();

    return items.filter((item) => {
      const assignee = String(item.assignee_name || item.assigned_to || "").toLowerCase();
      const queue = String(item.queue_name || item.queue || "").toLowerCase();
      const flow = String(item.process_name || item.flow_name || "").toLowerCase();
      const created = item.submitted_at || item.created_at || "";
      const passesAssignee = !assigneeQuery || assignee.includes(assigneeQuery);
      const passesQueue = !queueQuery || queue.includes(queueQuery);
      const passesFlow = !flowQuery || flow.includes(flowQuery);
      const passesDate = !dateQuery || (created && created.startsWith(dateQuery));
      return passesAssignee && passesQueue && passesFlow && passesDate;
    });
  }, [items, assigneeFilter, queueFilter, flowFilter, dateFilter]);

  const selected = useMemo(() => filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null, [filteredItems, selectedId]);

  useEffect(() => {
    if (selected && !filteredItems.some((item) => item.id === selected.id)) {
      setSelectedId(filteredItems[0]?.id || null);
    }
  }, [filteredItems, selected]);

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

  return (
    <div className="work-items-shell">
      <div className="work-items-toolbar">
        <div className="work-items-heading">
          <strong>Work Items</strong>
          <span>{loading ? "Loading…" : `${filteredItems.length} shown`}</span>
        </div>
        <button type="button" className="work-items-icon-button" onClick={loadItems} disabled={loading} title="Refresh work items" aria-label="Refresh work items">
          <RefreshCw size={14} className={loading ? "is-spinning" : ""} />
        </button>
      </div>

      <div className="work-items-filters">
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <input value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} placeholder="Assignee" />
        <input value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} placeholder="Queue or group" />
        <input value={flowFilter} onChange={(event) => setFlowFilter(event.target.value)} placeholder="Flow" />
        <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
      </div>

      {loading ? (
        <div className="work-items-empty">Loading work items…</div>
      ) : filteredItems.length === 0 ? (
        <div className="work-items-empty">
          <strong>No work items found</strong>
          <span>Change the filters or refresh to check again.</span>
        </div>
      ) : (
        <div className="work-items-layout">
          <div className="work-items-list" role="list">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`work-items-list-row ${selected?.id === item.id ? "is-selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="work-items-list-main">
                  <strong>{item.process_name || item.flow_name || "Workflow item"}</strong>
                  <span>{item.assignee_name || item.assigned_to || "Unassigned"} · {item.queue_name || item.queue || "No queue"}</span>
                  <small>{formatDate(item.submitted_at || item.created_at)}</small>
                </div>
                <span className={statusBadge(item.status)}>{String(item.status || "pending")}</span>
              </button>
            ))}
          </div>

          {selected ? (
            <section className="work-items-detail">
              <div className="work-items-detail-header">
                <div>
                  <span>Work Item</span>
                  <strong>{selected.process_name || selected.flow_name || "Workflow item"}</strong>
                </div>
                <span className={statusBadge(selected.status)}>{String(selected.status || "pending")}</span>
              </div>

              <div className="work-items-detail-grid">
                <div><span>Assignee</span><strong>{selected.assignee_name || selected.assigned_to || "Unassigned"}</strong></div>
                <div><span>Queue</span><strong>{selected.queue_name || selected.queue || "No queue"}</strong></div>
                <div><span>Related record</span><strong>{selected.record_id || "—"}</strong></div>
                <div><span>Due</span><strong>{formatDate(selected.due_at || selected.due_date)}</strong></div>
                <div><span>Created</span><strong>{formatDate(selected.submitted_at || selected.created_at)}</strong></div>
                <div><span>Completed</span><strong>{formatDate(selected.resolved_at || selected.completed_at)}</strong></div>
              </div>

              <div className="work-items-outcome">
                <span>Outcome</span>
                <strong>{selected.result || selected.decision || "No outcome yet"}</strong>
              </div>

              <div className="work-items-actions">
                <button
                  type="button"
                  className="work-items-primary"
                  disabled={working === selected.id || ["approved","rejected","cancelled"].includes(String(selected.status || "").toLowerCase())}
                  onClick={() => updateItem(selected.id, "approve")}
                >
                  {working === selected.id ? "Completing…" : "Complete / Approve"}
                </button>
                <button
                  type="button"
                  className="work-items-danger"
                  disabled={working === selected.id || ["approved","rejected","cancelled"].includes(String(selected.status || "").toLowerCase())}
                  onClick={() => updateItem(selected.id, "reject")}
                >
                  Reject
                </button>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
