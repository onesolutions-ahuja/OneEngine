import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api.js";

const OBJECT_PERMISSIONS = [
  ["can_view", "Read"],
  ["can_create", "Create"],
  ["can_edit", "Edit"],
  ["can_delete", "Delete"],
  ["can_import", "Import"],
  ["can_export", "Export"],
];

export default function ObjectAccessAdmin({ object, onError }) {
  const [objectRows, setObjectRows] = useState([]);
  const [fieldSummary, setFieldSummary] = useState({ fields: [], roles: [], access: [] });
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [objectAccess, fieldAccess] = await Promise.all([
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/access-summary`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/field-access-summary`),
      ]);
      const rows = Array.isArray(objectAccess?.data) ? objectAccess.data : [];
      const summary = fieldAccess?.data || { fields: [], roles: [], access: [] };
      setObjectRows(rows);
      setFieldSummary(summary);
      setSelectedFieldId((current) => current || summary.fields?.find((field) => field.active !== false)?.id || summary.fields?.[0]?.id || "");
    } catch (error) {
      onError?.(error?.message || "Unable to load access summaries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [object.id]);

  const selectedAccess = useMemo(
    () => fieldSummary.access?.find((item) => String(item.fieldId) === String(selectedFieldId)) || { byRole: {} },
    [fieldSummary, selectedFieldId]
  );

  async function updateObjectRole(row, key, checked) {
    const next = { ...row, [key]: checked };
    if (key === "can_view" && !checked) {
      for (const [permissionKey] of OBJECT_PERMISSIONS) next[permissionKey] = false;
    }
    if (key !== "can_view" && checked) next.can_view = true;
    const token = `object:${row.roleId}`;
    setSavingKey(token);
    try {
      await apiRequest(
        `/api/platform/objects/${encodeURIComponent(object.id)}/permissions/${encodeURIComponent(row.roleId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            canView: next.can_view === true,
            canCreate: next.can_create === true,
            canEdit: next.can_edit === true,
            canDelete: next.can_delete === true,
            canImport: next.can_import === true,
            canExport: next.can_export === true,
          }),
        }
      );
      setObjectRows((current) => current.map((item) => item.roleId === row.roleId ? next : item));
    } catch (error) {
      onError?.(error?.message || "Unable to update object access.");
    } finally {
      setSavingKey("");
    }
  }

  async function updateFieldRole(roleId, nextReadable, nextWritable) {
    if (!selectedFieldId) return;
    const readable = nextWritable ? true : nextReadable;
    const writable = readable ? nextWritable : false;
    const token = `field:${selectedFieldId}:${roleId}`;
    setSavingKey(token);
    try {
      await apiRequest(
        `/api/platform/fields/${encodeURIComponent(selectedFieldId)}/security/${encodeURIComponent(roleId)}`,
        { method: "PUT", body: JSON.stringify({ readable, writable }) }
      );
      setFieldSummary((current) => ({
        ...current,
        access: current.access.map((item) => String(item.fieldId) !== String(selectedFieldId) ? item : ({
          ...item,
          byRole: { ...item.byRole, [roleId]: { readable, writable, inherited: false } },
        })),
      }));
    } catch (error) {
      onError?.(error?.message || "Unable to update field access.");
    } finally {
      setSavingKey("");
    }
  }

  if (loading) return <div className="objects-detail-placeholder">Loading access summaries…</div>;

  return (
    <div className="objects-config-list objects-config-list--stacked">
      <section className="objects-access-summary">
        <div className="objects-config-list-head"><strong>Object Access</strong><span>Role grants for this object</span></div>
        <div className="objects-access-table-wrap">
          <table className="objects-access-table">
            <thead><tr><th>Role</th>{OBJECT_PERMISSIONS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {objectRows.map((row) => (
                <tr key={row.roleId}>
                  <td><strong>{row.roleName}</strong>{row.systemRole ? <small>System role</small> : null}</td>
                  {OBJECT_PERMISSIONS.map(([key]) => (
                    <td key={key}><input
                      type="checkbox"
                      checked={row[key] === true}
                      disabled={savingKey === `object:${row.roleId}`}
                      onChange={(event) => updateObjectRole(row, key, event.target.checked)}
                      aria-label={`${row.roleName} ${key}`}
                    /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="objects-access-summary">
        <div className="objects-config-list-head">
          <strong>Field Access</strong>
          <select value={selectedFieldId} onChange={(event) => setSelectedFieldId(event.target.value)}>
            {fieldSummary.fields.map((field) => <option key={field.id} value={field.id}>{field.label}{field.active === false ? " (inactive)" : ""}</option>)}
          </select>
        </div>
        {selectedFieldId ? (
          <div className="objects-access-table-wrap">
            <table className="objects-access-table">
              <thead><tr><th>Role</th><th>Visible</th><th>Editable</th><th>Source</th></tr></thead>
              <tbody>
                {fieldSummary.roles.map((role) => {
                  const access = selectedAccess.byRole?.[role.id] || { readable: false, writable: false, inherited: true };
                  const busy = savingKey === `field:${selectedFieldId}:${role.id}`;
                  return (
                    <tr key={role.id}>
                      <td><strong>{role.name}</strong></td>
                      <td><input type="checkbox" checked={access.readable === true} disabled={busy} onChange={(event) => updateFieldRole(role.id, event.target.checked, event.target.checked ? access.writable === true : false)}/></td>
                      <td><input type="checkbox" checked={access.writable === true} disabled={busy || access.readable !== true} onChange={(event) => updateFieldRole(role.id, access.readable === true, event.target.checked)}/></td>
                      <td>{access.inherited ? "Field default" : "Role override"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="objects-detail-placeholder">No fields configured.</div>}
      </section>

      <style>{`
        .objects-access-summary{border:1px solid var(--border-color,#e5e7eb);border-radius:10px;overflow:hidden;background:var(--card-background,#fff)}
        .objects-access-table-wrap{overflow:auto}.objects-access-table{width:100%;border-collapse:collapse;font-size:10px}.objects-access-table th,.objects-access-table td{padding:8px 10px;border-bottom:1px solid var(--border-color,#eef2f7);text-align:center;white-space:nowrap}.objects-access-table th:first-child,.objects-access-table td:first-child{text-align:left}.objects-access-table td:first-child{display:grid;gap:2px}.objects-access-table small{color:var(--text-secondary,#64748b);font-size:8px}.objects-access-table input{width:14px;height:14px}
        .objects-config-list-head select{max-width:260px;border:1px solid var(--border-color,#d1d5db);border-radius:7px;background:var(--card-background,#fff);padding:6px 8px;color:inherit;font-size:10px}
      `}</style>
    </div>
  );
}
