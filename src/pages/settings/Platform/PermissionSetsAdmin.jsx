import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import { Toggle } from "../../../components/ui.jsx";

const input = "onepos-input w-full";
const actions = [
  ["can_view", "View"], ["can_create", "Create"], ["can_edit", "Edit"],
  ["can_delete", "Delete"], ["can_import", "Import"], ["can_export", "Export"],
];
const emptySet = () => ({ name: "", apiKey: "", description: "", active: true, systemPermissions: [], objectPermissions: {}, fieldPermissions: {} });
const emptyGroup = () => ({ name: "", apiKey: "", description: "", active: true });

export default function PermissionSetsAdmin({ onMessage, onError }) {
  const [tab, setTab] = useState("sets");
  const [sets, setSets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [objects, setObjects] = useState([]);
  const [permissionCodes, setPermissionCodes] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [setDraft, setSetDraft] = useState(emptySet);
  const [groupDraft, setGroupDraft] = useState(emptyGroup);
  const [objectId, setObjectId] = useState("");
  const [fields, setFields] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [members, setMembers] = useState([]);
  const [groupAssignments, setGroupAssignments] = useState([]);
  const [memberSetId, setMemberSetId] = useState("");
  const [userId, setUserId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [permissionSearch, setPermissionSearch] = useState("");
  const [effectiveObjectId, setEffectiveObjectId] = useState("");
  const [effective, setEffective] = useState(null);
  const [loading, setLoading] = useState(true);

  const selectedObject = useMemo(() => objects.find((item) => item.id === objectId), [objects, objectId]);

  async function load() {
    setLoading(true);
    try {
      const [setResponse, groupResponse, userResponse, objectResponse, permissionResponse] = await Promise.all([
        apiRequest("/api/platform/permission-sets"),
        apiRequest("/api/platform/permission-set-groups"),
        apiRequest("/api/platform/permission-users"),
        apiRequest("/api/platform/objects"),
        apiRequest("/api/platform/permission-catalog"),
      ]);
      setSets(setResponse.data || []);
      setGroups(groupResponse.data || []);
      setUsers(userResponse.data || []);
      setObjects(objectResponse.data || []);
      setPermissionCodes(permissionResponse.data || []);
      setObjectId((current) => current || objectResponse.data?.[0]?.id || "");
      setEffectiveObjectId((current) => current || objectResponse.data?.[0]?.id || "");
    } catch (error) {
      onError?.(error.message || "Unable to load permission configuration.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!objectId) { setFields([]); return; }
    apiRequest(`/api/platform/objects/${objectId}`)
      .then((response) => setFields(response.data?.fields || []))
      .catch((error) => onError?.(error.message));
  }, [objectId]);
  useEffect(() => {
    if (tab !== "effective" || !effectiveObjectId) return;
    apiRequest(`/api/platform/objects/${effectiveObjectId}/effective-permissions`)
      .then((response) => setEffective(response.data || null))
      .catch((error) => onError?.(error.message));
  }, [tab, effectiveObjectId]);

  function startSet(set = null) {
    setSelectedSet(set?.id || null);
    setSetDraft(set ? {
      id: set.id,
      name: set.name,
      apiKey: set.api_key,
      description: set.description || "",
      active: set.active !== false,
      systemPermissions: set.system_permissions || [],
      objectPermissions: set.object_permissions || {},
      fieldPermissions: set.field_permissions || {},
    } : emptySet());
    setAssignments([]);
    setUserId("");
    if (set?.id) {
      apiRequest(`/api/platform/permission-sets/${set.id}/assignments`)
        .then((response) => setAssignments(response.data || []))
        .catch((error) => onError?.(error.message));
    }
  }

  async function saveSet() {
    if (!setDraft.name.trim()) return onError?.("Enter a Permission Set name.");
    try {
      const { id, ...payload } = setDraft;
      const response = await apiRequest(id ? `/api/platform/permission-sets/${id}` : "/api/platform/permission-sets", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      startSet(response.data);
      await load();
      onMessage?.("Permission Set saved.");
    } catch (error) { onError?.(error.message); }
  }

  async function toggleSet(set) {
    try {
      await apiRequest(`/api/platform/permission-sets/${set.id}`, { method: "PUT", body: JSON.stringify({ active: set.active === false }) });
      await load();
    } catch (error) { onError?.(error.message); }
  }

  async function assignSet() {
    if (!selectedSet || !userId) return onError?.("Select a user to assign.");
    try {
      await apiRequest(`/api/platform/permission-sets/${selectedSet}/assignments`, {
        method: "POST",
        body: JSON.stringify({ userId, effectiveFrom: effectiveFrom || null, effectiveUntil: effectiveUntil || null }),
      });
      const response = await apiRequest(`/api/platform/permission-sets/${selectedSet}/assignments`);
      setAssignments(response.data || []);
      setUserId("");
      onMessage?.("Permission Set assigned.");
    } catch (error) { onError?.(error.message); }
  }

  async function removeSetAssignment(assignment) {
    try {
      await apiRequest(`/api/platform/permission-sets/${selectedSet}/assignments/${assignment.user_id}`, { method: "DELETE" });
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
    } catch (error) { onError?.(error.message); }
  }

  function startGroup(group = null) {
    setSelectedGroup(group?.id || null);
    setGroupDraft(group ? { id: group.id, name: group.name, apiKey: group.api_key, description: group.description || "", active: group.active !== false } : emptyGroup());
    setMembers([]);
    setGroupAssignments([]);
    setMemberSetId("");
    setUserId("");
    if (group?.id) {
      Promise.all([
        apiRequest(`/api/platform/permission-set-groups/${group.id}/members`),
        apiRequest(`/api/platform/permission-set-groups/${group.id}/assignments`),
      ]).then(([memberResponse, assignmentResponse]) => {
        setMembers(memberResponse.data || []);
        setGroupAssignments(assignmentResponse.data || []);
      }).catch((error) => onError?.(error.message));
    }
  }

  async function saveGroup() {
    if (!groupDraft.name.trim()) return onError?.("Enter a Permission Set Group name.");
    try {
      const { id, ...payload } = groupDraft;
      const response = await apiRequest(id ? `/api/platform/permission-set-groups/${id}` : "/api/platform/permission-set-groups", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      startGroup(response.data);
      await load();
      onMessage?.("Permission Set Group saved.");
    } catch (error) { onError?.(error.message); }
  }

  async function addGroupMember() {
    if (!selectedGroup || !memberSetId) return onError?.("Select a Permission Set to add.");
    try {
      await apiRequest(`/api/platform/permission-set-groups/${selectedGroup}/members`, { method: "POST", body: JSON.stringify({ permissionSetId: memberSetId }) });
      const response = await apiRequest(`/api/platform/permission-set-groups/${selectedGroup}/members`);
      setMembers(response.data || []);
      setMemberSetId("");
    } catch (error) { onError?.(error.message); }
  }

  async function assignGroup() {
    if (!selectedGroup || !userId) return onError?.("Select a user to assign.");
    try {
      await apiRequest(`/api/platform/permission-set-groups/${selectedGroup}/assignments`, {
        method: "POST",
        body: JSON.stringify({ userId, effectiveFrom: effectiveFrom || null, effectiveUntil: effectiveUntil || null }),
      });
      const response = await apiRequest(`/api/platform/permission-set-groups/${selectedGroup}/assignments`);
      setGroupAssignments(response.data || []);
      setUserId("");
    } catch (error) { onError?.(error.message); }
  }

  function toggleObjectPermission(objectKey, key) {
    const current = setDraft.objectPermissions[objectKey] || {};
    setSetDraft((draft) => ({
      ...draft,
      objectPermissions: { ...draft.objectPermissions, [objectKey]: { ...current, [key]: current[key] !== true } },
    }));
  }

  function toggleFieldPermission(field, key) {
    const fieldKey = `${selectedObject?.object_key}.${field.api_name}`;
    const current = setDraft.fieldPermissions[fieldKey] || {};
    const nextValue = current[key] !== true;
    setSetDraft((draft) => ({
      ...draft,
      fieldPermissions: {
        ...draft.fieldPermissions,
        [fieldKey]: { ...current, [key]: nextValue, ...(key === "writable" && nextValue ? { readable: true } : {}) },
      },
    }));
  }

  function toggleSystemPermission(code) {
    setSetDraft((draft) => ({
      ...draft,
      systemPermissions: draft.systemPermissions.includes(code)
        ? draft.systemPermissions.filter((item) => item !== code)
        : [...draft.systemPermissions, code],
    }));
  }

  const filteredCodes = permissionCodes.filter((code) => code.toLowerCase().includes(permissionSearch.toLowerCase()));
  const tabs = [["sets", "Permission Sets"], ["groups", "Permission Set Groups"], ["effective", "Effective Permissions"]];

  if (loading) return <div className="onepos-empty">Loading permissions...</div>;
  return <div className="space-y-4 min-w-0">
    <div className="flex flex-wrap gap-2 border-b" role="tablist" aria-label="Security configuration">
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`px-3 py-2 text-sm ${tab === key ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}>{label}</button>)}
    </div>

    {tab === "sets" && <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
      <section className="onepos-card p-3 min-w-0"><div className="flex items-center"><h3 className="font-semibold">Permission Sets</h3><button type="button" className="ml-auto onepos-btn onepos-btn-secondary" onClick={() => startSet()}>New</button></div>
        {sets.map((set) => <div key={set.id} className="flex items-center gap-2 border-t py-2"><button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => startSet(set)}>{set.name}{set.active === false ? " (inactive)" : ""}</button><button type="button" className="text-xs text-slate-600" onClick={() => toggleSet(set)}>{set.active === false ? "Activate" : "Deactivate"}</button></div>)}
      </section>
      <div className="space-y-4 min-w-0">
        <section className="onepos-card p-4 space-y-3"><div className="flex items-center"><h3 className="font-semibold">{setDraft.id ? "Edit Permission Set" : "New Permission Set"}</h3><label className="ml-auto flex items-center gap-2 text-sm">Active<Toggle checked={setDraft.active} onChange={(event) => setSetDraft((draft) => ({ ...draft, active: event.target.checked }))} aria-label="Permission Set active" /></label></div>
          <div className="grid gap-3 md:grid-cols-2"><input className={input} placeholder="Name" value={setDraft.name} onChange={(event) => setSetDraft((draft) => ({ ...draft, name: event.target.value }))} /><input className={input} placeholder="API key" value={setDraft.apiKey} onChange={(event) => setSetDraft((draft) => ({ ...draft, apiKey: event.target.value }))} /></div>
          <textarea className={input} placeholder="Description" value={setDraft.description} onChange={(event) => setSetDraft((draft) => ({ ...draft, description: event.target.value }))} />
          <div className="flex flex-wrap gap-2"><button type="button" className="onepos-btn onepos-btn-primary" onClick={saveSet}>Save Permission Set</button>{setDraft.id && <button type="button" className="onepos-btn onepos-btn-secondary" onClick={async () => { await apiRequest(`/api/platform/permission-sets/${setDraft.id}`, { method: "DELETE" }); startSet(); await load(); }}>Deactivate</button>}</div>
        </section>
        <section className="onepos-card p-4 space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">System Permissions</h3><input className={`${input} md:max-w-xs`} placeholder="Filter permissions" value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} /></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 max-h-64 overflow-auto">{filteredCodes.map((code) => <label key={code} className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" checked={setDraft.systemPermissions.includes(code)} onChange={() => toggleSystemPermission(code)} /><span className="break-all">{code}</span></label>)}</div>
        </section>
        <section className="onepos-card p-4 space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">Object and Field Access</h3><select className="onepos-input md:max-w-sm" value={objectId} onChange={(event) => setObjectId(event.target.value)}>{objects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
          {selectedObject && <><div className="overflow-x-auto"><table className="onepos-table w-full text-sm"><thead><tr><th>Object</th>{actions.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody><tr><td>{selectedObject.label}</td>{actions.map(([key]) => <td key={key}><input aria-label={`${selectedObject.label} ${key}`} type="checkbox" checked={setDraft.objectPermissions[selectedObject.object_key]?.[key] === true} onChange={() => toggleObjectPermission(selectedObject.object_key, key)} /></td>)}</tr></tbody></table></div>
            <div className="overflow-x-auto"><table className="onepos-table w-full text-sm"><thead><tr><th>Field</th><th>Visible</th><th>Editable</th></tr></thead><tbody>{fields.map((field) => { const key = `${selectedObject.object_key}.${field.api_name}`; const access = setDraft.fieldPermissions[key] || {}; return <tr key={field.id}><td>{field.label}</td><td><input type="checkbox" aria-label={`${field.label} readable`} checked={access.readable === true || access.writable === true} onChange={() => toggleFieldPermission(field, "readable")} /></td><td><input type="checkbox" aria-label={`${field.label} writable`} checked={access.writable === true} onChange={() => toggleFieldPermission(field, "writable")} /></td></tr>; })}</tbody></table></div></>}
        </section>
        <section className="onepos-card p-4 space-y-3"><h3 className="font-semibold">User Assignment</h3><div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"><select className="onepos-input" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select><input className="onepos-input" type="date" aria-label="Effective from" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /><input className="onepos-input" type="date" aria-label="Effective until" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /><button type="button" className="onepos-btn onepos-btn-secondary" disabled={!selectedSet} onClick={assignSet}>Assign</button></div>
          {assignments.map((assignment) => <div key={assignment.id} className="flex items-center border-t py-2 text-sm"><span className="min-w-0 flex-1">{assignment.username}{assignment.effective_until ? ` · until ${String(assignment.effective_until).slice(0, 10)}` : ""}</span><button type="button" className="text-red-700" onClick={() => removeSetAssignment(assignment)}>Remove</button></div>)}
        </section>
      </div>
    </div>}

    {tab === "groups" && <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
      <section className="onepos-card p-3"><div className="flex items-center"><h3 className="font-semibold">Permission Set Groups</h3><button type="button" className="ml-auto onepos-btn onepos-btn-secondary" onClick={() => startGroup()}>New</button></div>{groups.map((group) => <button key={group.id} type="button" className="block w-full border-t py-2 text-left text-sm" onClick={() => startGroup(group)}>{group.name}{group.active === false ? " (inactive)" : ""}</button>)}</section>
      <div className="space-y-4">
        <section className="onepos-card p-4 space-y-3"><div className="flex items-center"><h3 className="font-semibold">{groupDraft.id ? "Edit Group" : "New Group"}</h3><label className="ml-auto flex items-center gap-2 text-sm">Active<Toggle checked={groupDraft.active} onChange={(event) => setGroupDraft((draft) => ({ ...draft, active: event.target.checked }))} aria-label="Permission Set Group active" /></label></div><div className="grid gap-3 md:grid-cols-2"><input className={input} placeholder="Name" value={groupDraft.name} onChange={(event) => setGroupDraft((draft) => ({ ...draft, name: event.target.value }))} /><input className={input} placeholder="API key" value={groupDraft.apiKey} onChange={(event) => setGroupDraft((draft) => ({ ...draft, apiKey: event.target.value }))} /></div><textarea className={input} placeholder="Description" value={groupDraft.description} onChange={(event) => setGroupDraft((draft) => ({ ...draft, description: event.target.value }))} /><button type="button" className="onepos-btn onepos-btn-primary" onClick={saveGroup}>Save Group</button></section>
        <section className="onepos-card p-4 space-y-3"><h3 className="font-semibold">Included Permission Sets</h3><div className="flex gap-2"><select className="onepos-input" value={memberSetId} onChange={(event) => setMemberSetId(event.target.value)}><option value="">Select Permission Set</option>{sets.filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="onepos-btn onepos-btn-secondary" disabled={!selectedGroup} onClick={addGroupMember}>Add</button></div>{members.map((member) => <div key={member.id} className="border-t py-2 text-sm">{member.name}</div>)}</section>
        <section className="onepos-card p-4 space-y-3"><h3 className="font-semibold">Group Assignment</h3><div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]"><select className="onepos-input" value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</select><input className="onepos-input" type="date" aria-label="Effective from" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /><input className="onepos-input" type="date" aria-label="Effective until" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} /><button type="button" className="onepos-btn onepos-btn-secondary" disabled={!selectedGroup} onClick={assignGroup}>Assign</button></div>{groupAssignments.map((assignment) => <div key={assignment.id} className="border-t py-2 text-sm">{assignment.username}</div>)}</section>
      </div>
    </div>}

    {tab === "effective" && <section className="onepos-card space-y-4 p-4"><div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">Effective Access</h3><select className="onepos-input md:max-w-sm" value={effectiveObjectId} onChange={(event) => setEffectiveObjectId(event.target.value)}>{objects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      {effective && <><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Role</dt><dd>{effective.roleId || "None"}</dd></div><div><dt className="text-slate-500">OneEngine manage</dt><dd>{effective.canManageOneEngine ? "Granted" : "Not granted"}</dd></div><div><dt className="text-slate-500">Object access source</dt><dd>{effective.source}</dd></div><div><dt className="text-slate-500">Assigned Permission Sets</dt><dd>{effective.permissionSets?.map((item) => `${item.name}${item.packageRequired ? ` · package ${item.sourcePackageId || "required"}` : ""}`).join(", ") || "None"}</dd></div><div><dt className="text-slate-500">Permission Set Groups</dt><dd>{effective.permissionSetGroups?.map((item) => item.name).join(", ") || "None"}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">System Permissions</dt><dd className="break-all">{effective.systemPermissions?.join(", ") || "None"}</dd></div></dl><div className="overflow-x-auto"><table className="onepos-table w-full text-sm"><thead><tr><th>Capability</th><th>Effective</th></tr></thead><tbody>{actions.map(([key, label]) => <tr key={key}><td>{label}</td><td>{effective[key] ? "Allowed" : "Denied"}</td></tr>)}{(effective.fields || []).map((field) => <tr key={field.fieldId}><td>{field.label}</td><td>{field.writable ? "Editable" : field.readable ? "Visible" : "Hidden"}</td></tr>)}</tbody></table></div></>}
    </section>}
  </div>;
}