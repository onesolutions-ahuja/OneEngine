import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api.js";

const EMPTY = {
  label: "",
  description: "",
  visibilityScope: "company",
  sharedRoleIds: [],
  columns: [],
  pageSize: 50,
  isDefault: false,
  active: true,
};

function fieldKey(field) {
  return field?.api_name || field?.apiName || field?.field_key || "";
}

export default function ListViewEditor({ object, fields = [], view = null, onSaved, onCancel, onError }) {
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    label: view?.label || "",
    description: view?.description || "",
    visibilityScope: view?.visibility_scope || "company",
    sharedRoleIds: Array.isArray(view?.shared_role_ids) ? view.shared_role_ids.map(String) : [],
    columns: Array.isArray(view?.columns) ? view.columns : fields.filter((field) => field.active !== false).map(fieldKey).filter(Boolean).slice(0, 6),
    pageSize: Number(view?.page_size || 50),
    isDefault: view?.is_default === true,
    active: view?.active !== false,
  }));

  useEffect(() => {
    apiRequest("/api/admin/roles")
      .then((response) => setRoles(Array.isArray(response?.data) ? response.data : []))
      .catch(() => setRoles([]));
  }, []);

  const availableFields = useMemo(
    () => fields.filter((field) => field.active !== false && field.readable !== false && fieldKey(field)),
    [fields]
  );

  async function save() {
    if (!form.label.trim()) return onError?.("Enter a list view name.");
    if (!form.columns.length) return onError?.("Choose at least one column.");
    if (form.visibilityScope === "roles" && !form.sharedRoleIds.length) return onError?.("Choose at least one role.");

    setSaving(true);
    onError?.("");
    try {
      const payload = {
        label: form.label.trim(),
        description: form.description || null,
        columns: form.columns,
        pageSize: Math.max(1, Math.min(200, Number(form.pageSize || 50))),
        isDefault: form.isDefault === true,
        active: form.active !== false,
        visibilityScope: form.visibilityScope,
        sharedRoleIds: form.visibilityScope === "roles" ? form.sharedRoleIds : [],
      };
      const response = await apiRequest(
        view?.id
          ? `/api/platform/list-views/${encodeURIComponent(view.id)}`
          : `/api/platform/objects/${encodeURIComponent(object.id)}/list-views`,
        { method: view?.id ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      onSaved?.(response?.data || null);
    } catch (error) {
      onError?.(error?.message || "Unable to save list view.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!view?.id) return;
    if (!window.confirm(`Deactivate list view "${view.label}"?`)) return;
    setSaving(true);
    try {
      await apiRequest(`/api/platform/list-views/${encodeURIComponent(view.id)}`, { method: "DELETE" });
      onSaved?.(null);
    } catch (error) {
      onError?.(error?.message || "Unable to deactivate list view.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="objects-rule-editor">
      <div className="objects-rule-editor-head">
        <div><strong>{view?.id ? "Edit List View" : "New List View"}</strong><span>{object?.label || object?.object_key}</span></div>
        <div className="objects-rule-editor-actions">
          {view?.id ? <button type="button" className="objects-rule-danger" disabled={saving} onClick={deactivate}>Deactivate</button> : null}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="objects-rule-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="objects-rule-grid">
        <label>Name<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })}/></label>
        <label>Rows per page<input type="number" min="1" max="200" value={form.pageSize} onChange={(event) => setForm({ ...form, pageSize: event.target.value })}/></label>
        <label>Visibility<select value={form.visibilityScope} onChange={(event) => setForm({ ...form, visibilityScope: event.target.value, sharedRoleIds: [] })}>
          <option value="private">Only me</option>
          <option value="company">All users with object access</option>
          <option value="roles">Selected roles</option>
        </select></label>
        <label className="objects-rule-toggle"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}/> Default list view</label>
        <label className="objects-rule-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })}/> Active</label>
      </div>

      {form.visibilityScope === "roles" ? (
        <label className="objects-rule-description">Roles
          <select multiple size={Math.min(8, Math.max(3, roles.length))} value={form.sharedRoleIds} onChange={(event) => setForm({ ...form, sharedRoleIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
      ) : null}

      <label className="objects-rule-description">Description<textarea rows="2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>

      <div className="objects-config-list">
        <div className="objects-config-list-head"><strong>Columns</strong><span>{form.columns.length} selected</span></div>
        <div className="objects-access-table-wrap">
          <table className="objects-access-table">
            <thead><tr><th>Show</th><th>Field</th><th>API name</th></tr></thead>
            <tbody>{availableFields.map((field) => {
              const key = fieldKey(field);
              const checked = form.columns.includes(key);
              return <tr key={key}>
                <td><input type="checkbox" checked={checked} onChange={(event) => setForm((current) => ({ ...current, columns: event.target.checked ? [...current.columns, key] : current.columns.filter((item) => item !== key) }))}/></td>
                <td>{field.label || key}</td>
                <td><code>{key}</code></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
