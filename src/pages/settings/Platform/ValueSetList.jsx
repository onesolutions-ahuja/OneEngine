import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import { toSafeApiName } from "./safeApiName.js";

function valueCount(row) {
  return Array.isArray(row?.values) ? row.values.length : Number(row?.value_count || 0);
}

export default function ValueSetList({ onMessage, onError }) {
  const [valueSets, setValueSets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", description: "", valueSetKey: "", active: true });
  const [newValue, setNewValue] = useState({ label: "", value: "" });

  async function load(preferredId = selectedId) {
    setLoading(true);
    try {
      const response = await apiRequest("/api/platform/value-sets");
      const rows = Array.isArray(response?.data) ? response.data : [];
      setValueSets(rows);
      const nextId = rows.some((row) => String(row.id) === String(preferredId))
        ? preferredId
        : rows[0]?.id || "";
      setSelectedId(nextId);
      return rows.find((row) => String(row.id) === String(nextId)) || null;
    } catch (error) {
      onError?.(error.message || "Unable to load value sets.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(""); }, []);

  const selected = useMemo(
    () => valueSets.find((row) => String(row.id) === String(selectedId)) || null,
    [valueSets, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return valueSets;
    return valueSets.filter((row) =>
      `${row.label || ""} ${row.value_set_key || ""} ${row.description || ""}`.toLowerCase().includes(q)
    );
  }, [valueSets, query]);

  function startCreate() {
    setCreating(true);
    setEditing(true);
    setSelectedId("");
    setForm({ label: "", description: "", valueSetKey: "", active: true });
    setNewValue({ label: "", value: "" });
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setForm({
      label: selected.label || "",
      description: selected.description || "",
      valueSetKey: selected.value_set_key || "",
      active: selected.active !== false,
    });
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    if (!selectedId && valueSets[0]?.id) setSelectedId(valueSets[0].id);
  }

  function updateForm(name, value) {
    setForm((current) => ({
      ...current,
      ...(name === "label" && (creating || !current.valueSetKey)
        ? { valueSetKey: toSafeApiName(value, "value_set") }
        : {}),
      [name]: value,
    }));
  }

  async function saveSet(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiRequest(
        creating ? "/api/platform/value-sets" : `/api/platform/value-sets/${selected.id}`,
        {
          method: creating ? "POST" : "PUT",
          body: JSON.stringify({
            label: form.label,
            description: form.description,
            valueSetKey: form.valueSetKey,
            active: form.active,
          }),
        }
      );
      const saved = response?.data || null;
      setEditing(false);
      setCreating(false);
      await load(saved?.id || selected?.id || "");
      onMessage?.(creating ? "Value set created." : "Value set updated.");
    } catch (error) {
      onError?.(error.message || "Unable to save value set.");
    } finally {
      setSaving(false);
    }
  }

  async function addValue(event) {
    event.preventDefault();
    if (!selected) return;
    try {
      await apiRequest(`/api/platform/value-sets/${selected.id}/values`, {
        method: "POST",
        body: JSON.stringify({
          label: newValue.label,
          value: newValue.value || toSafeApiName(newValue.label),
        }),
      });
      setNewValue({ label: "", value: "" });
      await load(selected.id);
      onMessage?.("Value added.");
    } catch (error) {
      onError?.(error.message || "Unable to add value.");
    }
  }

  async function updateValue(item, changes) {
    try {
      await apiRequest(`/api/platform/value-set-values/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(changes),
      });
      await load(selected?.id || "");
      onMessage?.("Value updated.");
    } catch (error) {
      onError?.(error.message || "Unable to update value.");
    }
  }

  return (
    <div className="developer-record-shell value-set-record-shell">
      <aside className="developer-record-list">
        <div className="developer-record-list-head">
          <div><strong>Value Sets</strong><span>{loading ? "Loading…" : `${filtered.length} of ${valueSets.length}`}</span></div>
          <div className="developer-record-head-actions">
            <button type="button" onClick={() => load()} title="Refresh" aria-label="Refresh"><RefreshCw size={14}/></button>
            <button type="button" onClick={startCreate} title="New Value Set" aria-label="New Value Set"><Plus size={15}/></button>
          </div>
        </div>

        <label className="developer-record-search">
          <Search size={14}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search value sets" />
        </label>

        <div className="developer-record-list-body">
          {loading ? <div className="developer-record-empty">Loading value sets…</div> : null}
          {!loading && filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`developer-record-row ${String(selectedId) === String(row.id) && !creating ? "is-selected" : ""}`}
              onClick={() => { setSelectedId(row.id); setEditing(false); setCreating(false); }}
            >
              <span className="developer-record-row-copy">
                <strong>{row.label || "Untitled value set"}</strong>
                <small>{row.value_set_key || "value_set"} · {valueCount(row)} values</small>
              </span>
              <span className={`developer-record-status ${row.active === false ? "is-inactive" : "is-active"}`}>
                {row.active === false ? "Inactive" : "Active"}
              </span>
            </button>
          ))}
          {!loading && !filtered.length ? (
            <div className="developer-record-empty"><strong>No value sets found</strong><span>Create one with + or change your search.</span></div>
          ) : null}
        </div>
      </aside>

      <section className="developer-record-detail">
        {editing ? (
          <form onSubmit={saveSet} className="developer-record-editor">
            <div className="developer-record-detail-head">
              <div><span>{creating ? "New Value Set" : "Edit Value Set"}</span><strong>{creating ? "Create value set" : selected?.label}</strong></div>
              <button type="button" className="developer-record-icon" onClick={cancelEdit} title="Cancel" aria-label="Cancel"><X size={15}/></button>
            </div>

            <div className="developer-record-form-grid">
              <label><span>Label</span><input value={form.label} onChange={(event) => updateForm("label", event.target.value)} required /></label>
              <label><span>API Key</span><input value={form.valueSetKey} readOnly required /></label>
              <label className="wide"><span>Description</span><textarea rows={3} value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></label>
              <label className="developer-record-check"><input type="checkbox" checked={form.active} onChange={(event) => updateForm("active", event.target.checked)} /><span>Active</span></label>
            </div>

            <div className="developer-record-editor-actions">
              <button type="button" onClick={cancelEdit}>Cancel</button>
              <button type="submit" className="is-primary" disabled={saving}><Save size={13}/>{saving ? "Saving…" : creating ? "Create" : "Save"}</button>
            </div>
          </form>
        ) : selected ? (
          <>
            <div className="developer-record-detail-head">
              <div><span>Value Set</span><strong>{selected.label}</strong><small>{selected.value_set_key}</small></div>
              <button type="button" className="developer-record-icon" onClick={startEdit} title="Edit" aria-label="Edit"><Pencil size={15}/></button>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Details</div>
              <div className="developer-record-fields">
                <div><span>Label</span><strong>{selected.label || "—"}</strong></div>
                <div><span>API Key</span><strong>{selected.value_set_key || "—"}</strong></div>
                <div><span>Status</span><strong>{selected.active === false ? "Inactive" : "Active"}</strong></div>
                <div><span>Description</span><strong>{selected.description || "—"}</strong></div>
              </div>
            </div>

            <div className="developer-record-section">
              <div className="developer-record-section-title">Values</div>
              <form className="value-set-add-row" onSubmit={addValue}>
                <input
                  value={newValue.label}
                  placeholder="New value label"
                  onChange={(event) => setNewValue((current) => ({
                    ...current,
                    label: event.target.value,
                    value: current.value || toSafeApiName(event.target.value),
                  }))}
                  required
                />
                <input value={newValue.value} placeholder="Stable value" readOnly />
                <button type="submit"><Plus size={13}/> Add</button>
              </form>
              <div className="value-set-values-list">
                {(selected.values || []).map((item, index, values) => (
                  <div key={item.id} className="value-set-value-row">
                    <div><strong>{item.label}</strong><span>{item.value}</span></div>
                    <span className={`developer-record-status ${item.active === false ? "is-inactive" : "is-active"}`}>{item.active === false ? "Inactive" : "Active"}</span>
                    <div className="value-set-value-actions">
                      <button type="button" onClick={() => updateValue(item, { active: item.active === false })}>{item.active === false ? "Activate" : "Deactivate"}</button>
                      <button type="button" disabled={index === 0} onClick={() => updateValue(item, { displayOrder: index - 1 })}>↑</button>
                      <button type="button" disabled={index === values.length - 1} onClick={() => updateValue(item, { displayOrder: index + 1 })}>↓</button>
                    </div>
                  </div>
                ))}
                {!(selected.values || []).length ? <div className="developer-record-empty compact">No values configured.</div> : null}
              </div>
            </div>
          </>
        ) : (
          <div className="developer-record-empty"><strong>Select a value set</strong><span>Choose a record from the list or create a new one.</span></div>
        )}
      </section>
    </div>
  );
}
