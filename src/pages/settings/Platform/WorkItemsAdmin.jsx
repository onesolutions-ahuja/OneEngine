import { useEffect, useMemo, useState } from "react";
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
  const [statusFilter, setStatusFilter] = useState("pending");
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
    <div className="grid gap-4 xl:grid-cols-[350px_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <strong className="text-sm text-slate-800">Work Items</strong>
          <button type="button" className="text-xs text-blue-700" onClick={loadItems}>Refresh</button>
        </div>
        <div className="space-y-3 p-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Status
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="">All</option>
            </select>
          </label>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
            <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} placeholder="Assignee" />
            <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} placeholder="Queue or group" />
            <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" value={flowFilter} onChange={(event) => setFlowFilter(event.target.value)} placeholder="Flow" />
            <input className="rounded-lg border border-slate-300 px-2 py-2 text-sm" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto border-t border-slate-200">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading work items…</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No work items match this filter.</div>
          ) : (
            filteredItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left ${selected?.id === item.id ? "bg-blue-50" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">{item.process_name || item.flow_name || "Workflow item"}</span>
                  {statusBadge(item.status)}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Record {item.record_id || "—"}</div>
                <div className="mt-1 text-[11px] text-slate-500">{item.assignee_name || item.assigned_to || "Unassigned"} · {item.queue_name || item.queue || "No queue"}</div>
                <div className="mt-1 text-[11px] text-slate-500">{formatDate(item.submitted_at)}</div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {!selected ? (
          <div className="text-sm text-slate-500">Select a work item to review the flow and complete it.</div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Work Item</div>
              <h3 className="mt-1 text-xl font-semibold text-slate-800">{selected.process_name || selected.flow_name || "Workflow item"}</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Status</div><div className="mt-2">{statusBadge(selected.status)}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Assignee</div><div className="mt-2">{selected.assignee_name || selected.assigned_to || "Unassigned"}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Queue</div><div className="mt-2">{selected.queue_name || selected.queue || "No queue"}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Due</div><div className="mt-2">{formatDate(selected.due_at || selected.due_date)}</div></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Related record</div><div className="mt-2">{selected.record_id || "—"}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Flow / execution</div><div className="mt-2">{selected.process_name || selected.flow_name || "—"}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Created</div><div className="mt-2">{formatDate(selected.submitted_at || selected.created_at)}</div></div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-slate-500">Completed</div><div className="mt-2">{formatDate(selected.resolved_at || selected.completed_at)}</div></div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Completion outcome</div>
              <div className="mt-2 text-sm text-slate-700">{selected.result || selected.decision || "No outcome yet"}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={working === selected.id || selected.status === "approved" || selected.status === "rejected" || selected.status === "cancelled"} onClick={() => updateItem(selected.id, "approve")} className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {working === selected.id ? "Completing…" : "Complete / Approve"}
              </button>
              <button type="button" disabled={working === selected.id || selected.status === "approved" || selected.status === "rejected" || selected.status === "cancelled"} onClick={() => updateItem(selected.id, "reject")} className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
