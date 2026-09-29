import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import { Toggle } from "../../../components/ui.jsx";

const emptyGroup = () => ({ name: "", apiKey: "", description: "", active: true });
const emptyQueue = () => ({ name: "", apiKey: "", description: "", supported_objects: [], claim_behavior: "ANY_MEMBER", allow_record_ownership: true, active: true });

export default function AccessControlAdmin({ onMessage, onError }) {
  const [tab, setTab] = useState("groups");
  const [principals, setPrincipals] = useState({ users: [], roles: [], groups: [] });
  const [objects, setObjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [queues, setQueues] = useState([]);
  const [group, setGroup] = useState(null);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [groupMembers, setGroupMembers] = useState([]);
  const [queue, setQueue] = useState(null);
  const [queueForm, setQueueForm] = useState(emptyQueue);
  const [queueMembers, setQueueMembers] = useState([]);
  const [queueRecords, setQueueRecords] = useState([]);
  const [memberType, setMemberType] = useState("USER");
  const [memberId, setMemberId] = useState("");
  const [recordId, setRecordId] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [principalResponse, objectResponse, groupResponse, queueResponse] = await Promise.all([
        apiRequest("/api/platform/security/principals"),
        apiRequest("/api/platform/objects"),
        apiRequest("/api/platform/security/public-groups"),
        apiRequest("/api/platform/security/queues"),
      ]);
      setPrincipals(principalResponse.data || { users: [], roles: [], groups: [] });
      setObjects(objectResponse.data || []);
      setGroups(groupResponse.data || []);
      setQueues(queueResponse.data || []);
    } catch (error) { onError?.(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function openGroup(next) {
    setGroup(next || null);
    setGroupForm(next ? { id: next.id, name: next.name, apiKey: next.api_key, description: next.description || "", active: next.active !== false } : emptyGroup());
    setGroupMembers([]);
    if (next?.id) {
      const response = await apiRequest(`/api/platform/security/public-groups/${next.id}/members`);
      setGroupMembers(response.data || []);
    }
  }

  async function saveGroup() {
    if (!groupForm.name.trim()) return onError?.("Enter a Public Group name.");
    try {
      const { id, ...payload } = groupForm;
      await apiRequest(id ? `/api/platform/security/public-groups/${id}` : "/api/platform/security/public-groups", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      await load();
      onMessage?.("Public Group saved.");
    } catch (error) { onError?.(error.message); }
  }

  async function addGroupMember() {
    if (!group?.id || !memberId) return onError?.("Select a group member.");
    try {
      await apiRequest(`/api/platform/security/public-groups/${group.id}/members`, { method: "POST", body: JSON.stringify({ memberType, memberId }) });
      await openGroup(group);
      setMemberId("");
    } catch (error) { onError?.(error.message); }
  }

  async function removeGroupMember(member) {
    try {
      await apiRequest(`/api/platform/security/public-groups/${group.id}/members/${member.member_type}/${member.member_id}`, { method: "DELETE" });
      setGroupMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (error) { onError?.(error.message); }
  }

  async function openQueue(next) {
    setQueue(next || null);
    setQueueForm(next ? { ...next, apiKey: next.api_key, supported_objects: next.supported_objects || [] } : emptyQueue());
    setQueueMembers([]);
    setQueueRecords([]);
    if (next?.id) {
      const [membersResponse, recordsResponse] = await Promise.all([
        apiRequest(`/api/platform/security/queues/${next.id}/members`),
        apiRequest(`/api/platform/security/queues/${next.id}/records`),
      ]);
      setQueueMembers(membersResponse.data || []);
      setQueueRecords(recordsResponse.data || []);
    }
  }

  async function saveQueue() {
    if (!queueForm.name.trim()) return onError?.("Enter a Queue name.");
    try {
      const { id, ...payload } = queueForm;
      await apiRequest(id ? `/api/platform/security/queues/${id}` : "/api/platform/security/queues", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      await load();
      onMessage?.("Queue saved.");
    } catch (error) { onError?.(error.message); }
  }

  async function addQueueMember() {
    if (!queue?.id || !memberId) return onError?.("Select a Queue member.");
    try {
      await apiRequest(`/api/platform/security/queues/${queue.id}/members`, { method: "POST", body: JSON.stringify({ memberType, memberId }) });
      const response = await apiRequest(`/api/platform/security/queues/${queue.id}/members`);
      setQueueMembers(response.data || []);
      setMemberId("");
    } catch (error) { onError?.(error.message); }
  }

  async function removeQueueMember(member) {
    try {
      await apiRequest(`/api/platform/security/queues/${queue.id}/members/${member.member_type}/${member.member_id}`, { method: "DELETE" });
      setQueueMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (error) { onError?.(error.message); }
  }

  async function assignRecord() {
    if (!queue?.id || !recordId.trim()) return onError?.("Enter a record ID.");
    try {
      await apiRequest(`/api/platform/security/queues/${queue.id}/records`, { method: "POST", body: JSON.stringify({ objectKey: queueForm.objectKey, recordId: recordId.trim() }) });
      const response = await apiRequest(`/api/platform/security/queues/${queue.id}/records`);
      setQueueRecords(response.data || []);
      setRecordId("");
    } catch (error) { onError?.(error.message); }
  }

  async function claimNext() {
    try {
      const response = await apiRequest(`/api/platform/security/queues/${queue.id}/claim`, { method: "POST", body: JSON.stringify({}) });
      setQueueRecords((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      onMessage?.("Queue record claimed.");
    } catch (error) { onError?.(error.message); }
  }

  const principalOptions = memberType === "USER" ? principals.users : memberType === "ROLE" ? principals.roles : principals.groups.filter((item) => item.id !== group?.id);
  if (loading) return <div className="onepos-empty">Loading Public Groups and Queues...</div>;
  return <div className="space-y-4 min-w-0">
    <div className="flex gap-2 border-b" role="tablist" aria-label="Access control"><button type="button" role="tab" aria-selected={tab === "groups"} className={`px-3 py-2 text-sm ${tab === "groups" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`} onClick={() => setTab("groups")}>Public Groups</button><button type="button" role="tab" aria-selected={tab === "queues"} className={`px-3 py-2 text-sm ${tab === "queues" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`} onClick={() => setTab("queues")}>Queues</button></div>

    {tab === "groups" && <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]"><section className="onepos-card p-3"><div className="flex items-center"><h3 className="font-semibold">Public Groups</h3><button type="button" className="ml-auto onepos-btn onepos-btn-secondary" onClick={() => openGroup(null)}>New</button></div>{groups.map((item) => <button key={item.id} type="button" className="block w-full border-t py-2 text-left text-sm" onClick={() => openGroup(item)}>{item.name} <span className="text-slate-400">({item.member_count})</span></button>)}</section><div className="space-y-4"><section className="onepos-card p-4 space-y-3"><div className="flex items-center"><h3 className="font-semibold">{groupForm.id ? "Edit Group" : "New Group"}</h3><label className="ml-auto flex items-center gap-2 text-sm">Active<Toggle checked={groupForm.active} onChange={(event) => setGroupForm((current) => ({ ...current, active: event.target.checked }))} aria-label="Public Group active" /></label></div><div className="grid gap-3 md:grid-cols-2"><input className="onepos-input" placeholder="Name" value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} /><input className="onepos-input" placeholder="API key" value={groupForm.apiKey} onChange={(event) => setGroupForm((current) => ({ ...current, apiKey: event.target.value }))} /></div><textarea className="onepos-input w-full" placeholder="Description" value={groupForm.description} onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))} /><button type="button" className="onepos-btn onepos-btn-primary" onClick={saveGroup}>Save Group</button></section><section className="onepos-card p-4 space-y-3"><h3 className="font-semibold">Members</h3><div className="grid gap-2 md:grid-cols-[160px_1fr_auto]"><select className="onepos-input" value={memberType} onChange={(event) => { setMemberType(event.target.value); setMemberId(""); }}><option value="USER">User</option><option value="ROLE">Role</option><option value="GROUP">Nested group</option></select><select className="onepos-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Select member</option>{principalOptions.map((item) => <option key={item.id} value={item.id}>{item.username || item.name}</option>)}</select><button type="button" className="onepos-btn onepos-btn-secondary" disabled={!group} onClick={addGroupMember}>Add</button></div>{groupMembers.map((member) => <div key={member.id} className="flex items-center border-t py-2 text-sm"><span className="flex-1">{member.member_type}: {member.member_name}</span><button type="button" className="text-red-700" onClick={() => removeGroupMember(member)}>Remove</button></div>)}</section></div></div>}

    {tab === "queues" && <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]"><section className="onepos-card p-3"><div className="flex items-center"><h3 className="font-semibold">Queues</h3><button type="button" className="ml-auto onepos-btn onepos-btn-secondary" onClick={() => openQueue(null)}>New</button></div>{queues.map((item) => <button key={item.id} type="button" className="block w-full border-t py-2 text-left text-sm" onClick={() => openQueue(item)}>{item.name}</button>)}</section><div className="space-y-4"><section className="onepos-card p-4 space-y-3"><div className="flex items-center"><h3 className="font-semibold">{queueForm.id ? "Edit Queue" : "New Queue"}</h3><label className="ml-auto flex items-center gap-2 text-sm">Active<Toggle checked={queueForm.active} onChange={(event) => setQueueForm((current) => ({ ...current, active: event.target.checked }))} aria-label="Queue active" /></label></div><div className="grid gap-3 md:grid-cols-2"><input className="onepos-input" placeholder="Name" value={queueForm.name} onChange={(event) => setQueueForm((current) => ({ ...current, name: event.target.value }))} /><input className="onepos-input" placeholder="API key" value={queueForm.apiKey || ""} onChange={(event) => setQueueForm((current) => ({ ...current, apiKey: event.target.value }))} /></div><textarea className="onepos-input w-full" placeholder="Description" value={queueForm.description || ""} onChange={(event) => setQueueForm((current) => ({ ...current, description: event.target.value }))} /><label className="block text-sm">Claim behavior<select className="onepos-input mt-1" value={queueForm.claim_behavior} onChange={(event) => setQueueForm((current) => ({ ...current, claim_behavior: event.target.value }))}><option value="ANY_MEMBER">Any member</option><option value="ORDERED">Oldest first</option></select></label><div><b className="text-sm">Supported Objects</b><div className="mt-2 grid gap-2 sm:grid-cols-2">{objects.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={queueForm.supported_objects.includes(item.object_key)} onChange={(event) => setQueueForm((current) => ({ ...current, supported_objects: event.target.checked ? [...current.supported_objects, item.object_key] : current.supported_objects.filter((key) => key !== item.object_key) }))} />{item.label}</label>)}</div></div><label className="flex items-center gap-2 text-sm">Records may be queue-owned<Toggle checked={queueForm.allow_record_ownership} onChange={(event) => setQueueForm((current) => ({ ...current, allow_record_ownership: event.target.checked }))} aria-label="Queue can own records" /></label><button type="button" className="onepos-btn onepos-btn-primary" onClick={saveQueue}>Save Queue</button></section>
      <section className="onepos-card p-4 space-y-3"><h3 className="font-semibold">Queue Members</h3><div className="grid gap-2 md:grid-cols-[160px_1fr_auto]"><select className="onepos-input" value={memberType} onChange={(event) => { setMemberType(event.target.value); setMemberId(""); }}><option value="USER">User</option><option value="ROLE">Role</option><option value="GROUP">Public Group</option></select><select className="onepos-input" value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">Select member</option>{principalOptions.map((item) => <option key={item.id} value={item.id}>{item.username || item.name}</option>)}</select><button type="button" className="onepos-btn onepos-btn-secondary" disabled={!queue} onClick={addQueueMember}>Add</button></div>{queueMembers.map((member) => <div key={member.id} className="flex items-center border-t py-2 text-sm"><span className="flex-1">{member.member_type}: {member.member_name}</span><button type="button" className="text-red-700" onClick={() => removeQueueMember(member)}>Remove</button></div>)}</section>
      <section className="onepos-card p-4 space-y-3"><div className="flex items-center"><h3 className="font-semibold">Queued Records</h3><button type="button" disabled={!queue} className="ml-auto onepos-btn onepos-btn-secondary" onClick={claimNext}>Claim next</button></div><div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><select className="onepos-input" value={queueForm.objectKey || ""} onChange={(event) => setQueueForm((current) => ({ ...current, objectKey: event.target.value }))}><option value="">Select Object</option>{objects.filter((item) => queueForm.supported_objects.includes(item.object_key)).map((item) => <option key={item.id} value={item.object_key}>{item.label}</option>)}</select><input className="onepos-input" placeholder="Record ID" value={recordId} onChange={(event) => setRecordId(event.target.value)} /><button type="button" disabled={!queue} className="onepos-btn onepos-btn-secondary" onClick={assignRecord}>Assign</button></div>{queueRecords.map((record) => <div key={record.id} className="border-t py-2 text-sm">{record.object_key} · {record.record_id}{record.claimed_by ? " · claimed" : " · pending"}</div>)}</section></div></div>}
  </div>;
}