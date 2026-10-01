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
  const [comment, setComment] = useState("");
  const [users, setUsers] = useState([]);
  const [reassignTo, setReassignTo] = useState("");
  const [history, setHistory] = useState({ actions: [], events: [] });
  const [context,setContext]=useState(null);
  const [groups,setGroups]=useState([]); const [delegations,setDelegations]=useState([]); const [newGroup,setNewGroup]=useState(""); const [groupMembers,setGroupMembers]=useState([]); const [delegateTo,setDelegateTo]=useState(""); const [managerUser,setManagerUser]=useState(""); const [managerId,setManagerId]=useState("");

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("/api/platform/approval-requests");
      const rows = Array.isArray(response?.data) ? response.data : [];
      setItems(rows);
      setSelectedId((current) => rows.some((row) => String(row.work_item_id || row.id) === String(current)) ? current : (rows[0]?.work_item_id || rows[0]?.id || ""));
    } catch (error) {
      onError?.(error?.message || "Unable to load work items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadItems(); apiRequest("/api/platform/approval-users").then(r=>setUsers(r.data||[])).catch(()=>setUsers([])); apiRequest("/api/platform/approval-groups").then(r=>setGroups(r.data||[])).catch(()=>setGroups([])); apiRequest("/api/platform/approval-delegations").then(r=>setDelegations(r.data||[])).catch(()=>setDelegations([])); }, []);

  useEffect(() => {
    if (!selectedId) { setHistory({actions:[],events:[]}); return; }
    const requestId=items.find(x=>String(x.work_item_id||x.id)===String(selectedId))?.id||selectedId;
    apiRequest(`/api/platform/approval-requests/${requestId}/history`).then(r=>setHistory(r.data||{actions:[],events:[]})).catch(()=>setHistory({actions:[],events:[]}));
    apiRequest(`/api/platform/approval-requests/${requestId}/context`).then(r=>setContext(r.data||null)).catch(()=>setContext(null));
    setComment(""); setReassignTo("");
  }, [selectedId]);

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
    () => filteredItems.find((item) => String(item.work_item_id || item.id) === String(selectedId)) || filteredItems[0] || null,
    [filteredItems, selectedId],
  );

  useEffect(() => {
    if (selected && String(selected.work_item_id || selected.id) !== String(selectedId)) setSelectedId(selected.work_item_id || selected.id);
    if (!selected && selectedId) setSelectedId("");
  }, [selected, selectedId]);

  const updateItem = async (requestId, decision) => {
    try {
      setWorking(requestId);
      await apiRequest(`/api/platform/approval-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ workItemId: selected?.work_item_id || null, decision, comment: comment.trim() }),
      });
      await loadItems();
      setComment("");
      onMessage?.("Work item updated.");
    } catch (error) {
      onError?.(error?.message || "Unable to update work item");
    } finally {
      setWorking("");
    }
  };

  const terminal = selected ? ["APPROVED","REJECTED","CANCELLED"].includes(normalizedStatus(selected.status)) : false;

  const processConfig = selected?.process_config || {};
  const canDecide = selected?.can_decide === true;
  const canReassign = selected?.can_reassign === true;
  const requireRejectComment = processConfig.requireCommentOnReject !== false;

  const reassign = async () => {
    if (!selected || !reassignTo) return;
    try {
      setWorking(selected.id);
      await apiRequest(`/api/platform/approval-requests/${selected.id}/reassign`, { method:"POST", body:JSON.stringify({workItemId:selected.work_item_id||null,assigneeUserId:reassignTo,comment:comment.trim()}) });
      setComment(""); setReassignTo(""); await loadItems(); onMessage?.("Approval reassigned.");
    } catch(error) { onError?.(error?.message || "Unable to reassign approval"); } finally { setWorking(""); }
  };

  const recall = async () => {
    if (!selected) return;
    try {
      setWorking(selected.id);
      await apiRequest(`/api/platform/approval-requests/${selected.id}/recall`, { method:"POST", body:JSON.stringify({comment:comment.trim()}) });
      setComment(""); await loadItems(); onMessage?.("Approval recalled.");
    } catch(error) { onError?.(error?.message || "Unable to recall approval"); } finally { setWorking(""); }
  };

  const createGroup=async()=>{if(!newGroup.trim())return;try{await apiRequest("/api/platform/approval-groups",{method:"POST",body:JSON.stringify({name:newGroup.trim(),memberIds:groupMembers})});setNewGroup("");setGroupMembers([]);const r=await apiRequest("/api/platform/approval-groups");setGroups(r.data||[]);onMessage?.("Approval group created.");}catch(error){onError?.(error?.message||"Unable to create approval group");}};
  const saveManager=async()=>{if(!managerUser)return;try{await apiRequest(`/api/platform/approval-users/${managerUser}/manager`,{method:"PUT",body:JSON.stringify({managerId:managerId||null})});const r=await apiRequest("/api/platform/approval-users");setUsers(r.data||[]);onMessage?.("Manager hierarchy updated.");}catch(error){onError?.(error?.message||"Unable to save manager");}};
  const saveDelegate=async()=>{if(!delegateTo)return;try{await apiRequest("/api/platform/approval-delegations",{method:"POST",body:JSON.stringify({delegateUserId:delegateTo})});setDelegateTo("");const r=await apiRequest("/api/platform/approval-delegations");setDelegations(r.data||[]);onMessage?.("Approval delegate saved.");}catch(error){onError?.(error?.message||"Unable to save delegate");}};

  return (
    <div className="developer-record-shell work-items-record-shell">
      <aside className="developer-record-list">
        <div className="developer-record-list-head">
          <div><strong>Approvals</strong><span>{loading ? "Loading…" : `${filteredItems.length} of ${items.length}`}</span></div>
          <div className="developer-record-head-actions">
            <button type="button" onClick={loadItems} disabled={loading} title="Refresh" aria-label="Refresh">
              <RefreshCw size={14} className={loading ? "is-spinning" : ""}/>
            </button>
          </div>
        </div>

        <label className="developer-record-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approvals" />
        </label>

        <div className="developer-record-filters">
          {statuses.map((status) => (
            <button key={status} type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => setStatusFilter(status)}>
              {status === "ALL" ? "All" : status[0] + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="developer-record-list-body">
          {loading ? <div className="developer-record-empty">Loading approvals…</div> : null}
          {!loading && filteredItems.map((item) => (
            <button
              key={item.work_item_id || item.id}
              type="button"
              className={`developer-record-row ${String(selected?.work_item_id || selected?.id) === String(item.work_item_id || item.id) ? "is-selected" : ""}`}
              onClick={() => setSelectedId(item.work_item_id || item.id)}
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
            <div className="developer-record-empty"><strong>No approvals found</strong><span>Change the search or status filter.</span></div>
          ) : null}
        </div>
<div className="developer-record-section">
          <div className="developer-record-section-title">Approval Administration</div>
          <div className="grid gap-3">
            <div><strong className="text-sm">Queues / Groups</strong><div className="text-xs text-slate-500">{groups.map(g=>`${g.name} (${g.member_count})`).join(" · ")||"No groups yet"}</div><input className="mt-2 rounded-lg border p-2" placeholder="New group name" value={newGroup} onChange={e=>setNewGroup(e.target.value)}/><select multiple className="mt-2 w-full rounded-lg border p-2" value={groupMembers} onChange={e=>setGroupMembers([...e.target.selectedOptions].map(o=>o.value))}>{users.map(u=><option key={u.id} value={u.id}>{u.username||u.email}</option>)}</select><button type="button" className="mt-2" onClick={createGroup}>Create group</button></div>
            <div><strong className="text-sm">Manager hierarchy</strong><div className="grid grid-cols-2 gap-2 mt-2"><select className="rounded-lg border p-2" value={managerUser} onChange={e=>{setManagerUser(e.target.value);setManagerId(users.find(u=>String(u.id)===String(e.target.value))?.manager_id||"")}}><option value="">Choose user…</option>{users.map(u=><option key={u.id} value={u.id}>{u.username||u.email}</option>)}</select><select className="rounded-lg border p-2" value={managerId} onChange={e=>setManagerId(e.target.value)}><option value="">No manager</option>{users.filter(u=>String(u.id)!==String(managerUser)).map(u=><option key={u.id} value={u.id}>{u.username||u.email}</option>)}</select></div><button type="button" className="mt-2" disabled={!managerUser} onClick={saveManager}>Save manager</button></div><div><strong className="text-sm">My delegate</strong><div className="text-xs text-slate-500">{delegations.find(d=>d.active)?.delegate_name||"No active delegate"}</div><select className="mt-2 rounded-lg border p-2" value={delegateTo} onChange={e=>setDelegateTo(e.target.value)}><option value="">Choose delegate…</option>{users.map(u=><option key={u.id} value={u.id}>{u.username||u.email}</option>)}</select><button type="button" className="ml-2" disabled={!delegateTo} onClick={saveDelegate}>Save delegate</button></div>
          </div>
        </div>
      </aside>

      <section className="developer-record-detail">
        {selected ? (
          <>
            <div className="developer-record-detail-head">
              <div>
                <span>Approval request</span>
                <strong>{selected.process_name || selected.flow_name || selected.step_label || "Work item"}</strong>
                <small>#{String(selected.id || "").slice(0, 12)}</small>
              </div>
              <span className={`developer-record-status status-${normalizedStatus(selected.status).toLowerCase()}`}>{normalizedStatus(selected.status)}</span>
            </div>

            <div className="developer-record-section"><div className="developer-record-section-title">Approval progress</div><div className="flex flex-wrap gap-2">{(context?.steps||[]).map(step=><span key={step.step_order} className={`rounded-full border px-3 py-1 text-sm ${step.status==="current"?"font-semibold":""}`}>{step.status==="complete"?"✓":step.status==="current"?"→":"○"} {step.label}</span>)}</div>{context?.why?<div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Why approval is required</strong><div>{context.why}</div></div>:null}</div>\n            <div className="developer-record-section"><div className="developer-record-section-title">{context?.object?.label||"Record"} details</div><div className="developer-record-fields">{(context?.fields||[]).slice(0,10).map(field=>{const key=field.source_column||field.api_name;return <div key={key}><span>{field.label||field.api_name}</span><strong>{String(context?.record?.[key]??"—")}</strong></div>})}</div></div>\n            <div className="developer-record-section">
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
                <div><span>Reminder</span><strong>{selected.reminder_sent_at ? formatDate(selected.reminder_sent_at) : "—"}</strong></div>
                <div><span>Escalated</span><strong>{selected.escalated_at ? `${formatDate(selected.escalated_at)} (${selected.escalation_count||1})` : "—"}</strong></div>
                <div><span>Completed</span><strong>{formatDate(selected.resolved_at || selected.completed_at)}</strong></div>
                <div><span>Decision</span><strong>{selected.result || selected.decision || "—"}</strong></div>
              </div>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Approval History</div>
              <div className="space-y-2">
                {[...(history.events||[]),...(history.actions||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map((entry,index)=>(
                  <div key={entry.id||index} className="rounded-lg border p-2 text-sm">
                    <strong>{entry.event_type || entry.decision || "Activity"}</strong>
                    <span className="ml-2 text-slate-500">{entry.actor_name || "System"} · {formatDate(entry.created_at)}</span>
                    {entry.comment ? <div className="mt-1">{entry.comment}</div> : null}
                  </div>
                ))}
                {!(history.events||[]).length && !(history.actions||[]).length ? <span className="text-sm text-slate-500">No approval activity yet.</span> : null}
              </div>
            </div>

            {!terminal && (canDecide || canReassign || selected?.can_recall) ? (
              <>
                <div className="developer-record-section">
                  <div className="developer-record-section-title">Decision comment {requireRejectComment ? "· required for rejection" : ""}</div>
                  <textarea className="w-full rounded-lg border p-3" rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add context for the submitter and future audit history…" />
                </div>
                <div className="developer-record-actions">
                  {canDecide ? <><button type="button" className="is-primary" disabled={working===selected.id} onClick={()=>updateItem(selected.id,"approve")}>{working===selected.id?"Working…":"Approve"}</button><button type="button" className="is-danger" disabled={working===selected.id || (requireRejectComment && !comment.trim())} onClick={()=>updateItem(selected.id,"reject")}>Reject</button></> : null}
                  {canReassign ? <><select value={reassignTo} onChange={e=>setReassignTo(e.target.value)}><option value="">Reassign to…</option>{users.map(user=><option key={user.id} value={user.id}>{user.username||user.email} · {user.role_name||"User"}</option>)}</select><button type="button" disabled={!reassignTo||working===selected.id} onClick={reassign}>Reassign</button></> : null}
                  {selected?.can_recall ? <button type="button" disabled={working===selected.id} onClick={recall}>Recall</button> : null}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="developer-record-empty"><strong>Select a work item</strong><span>Choose a record from the list to see details.</span></div>
        )}
      </section>
    </div>
  );
}
