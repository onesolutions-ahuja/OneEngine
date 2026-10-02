import React, { useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import { toSafeApiName } from "./safeApiName.js";

const EMPTY_FORM = {
  label: "",
  recordTypeKey: "",
  description: "",
  isDefault: false,
  active: true,
  defaultValues: "{}",
};

function fieldId(field) {
  return field?.id || field?.field_id || "";
}

function activeOptions(field) {
  return (Array.isArray(field?.options) ? field.options : [])
    .filter((option) => option?.active !== false)
    .map((option) => ({
      value: String(typeof option === "object" ? option.value ?? option.key ?? option.label ?? "" : option),
      label: String(typeof option === "object" ? option.label ?? option.name ?? option.value ?? "" : option),
    }))
    .filter((option) => option.value);
}

export default function RecordTypeEditor({ object, fields = [] }) {
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [cloneSourceId, setCloneSourceId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [picklistRestrictions, setPicklistRestrictions] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const picklistFields = useMemo(
    () => fields.filter((field) => ["picklist", "select", "multiselect"].includes(field.field_type)),
    [fields]
  );

  async function load() {
    const response = await apiRequest(`/api/platform/objects/${object.id}/record-types?includeInactive=1`);
    setTypes(Array.isArray(response?.data) ? response.data : []);
  }

  useEffect(() => {
    setEditing(null);
    setCloneSourceId("");
    setForm(EMPTY_FORM);
    setPicklistRestrictions({});
    load().catch((err) => setError(err?.message || "Unable to load record types."));
  }, [object.id]);

  function resetEditor() {
    setEditing(null);
    setCloneSourceId("");
    setForm(EMPTY_FORM);
    setPicklistRestrictions({});
    setError("");
  }

  function openEdit(type) {
    setEditing(type);
    setCloneSourceId("");
    setForm({
      label: type.label || "",
      recordTypeKey: type.record_type_key || "",
      description: type.description || "",
      isDefault: type.is_default === true,
      active: type.active !== false,
      defaultValues: JSON.stringify(type.default_values || {}, null, 2),
    });
    setPicklistRestrictions(type.picklistRestrictions || {});
    setError("");
  }

  function cloneFrom(type) {
    if (!type) return resetEditor();
    setEditing(null);
    setCloneSourceId(type.id);
    setForm({
      label: `${type.label || "Record Type"} Copy`,
      recordTypeKey: "",
      description: type.description || "",
      isDefault: false,
      active: true,
      defaultValues: JSON.stringify(type.default_values || {}, null, 2),
    });
    setPicklistRestrictions(type.picklistRestrictions || {});
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let defaultValues;
      try {
        defaultValues = JSON.parse(form.defaultValues || "{}");
      } catch {
        throw new Error("Default values must be valid JSON.");
      }
      const payload = {
        label: form.label,
        recordTypeKey: editing?.id ? form.recordTypeKey : (form.recordTypeKey || toSafeApiName(form.label, "record_type")),
        description: form.description,
        isDefault: form.isDefault === true,
        active: form.active !== false,
        defaultValues,
        picklistRestrictions,
      };
      await apiRequest(
        editing?.id ? `/api/platform/record-types/${encodeURIComponent(editing.id)}` : `/api/platform/objects/${object.id}/record-types`,
        { method: editing?.id ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      resetEditor();
      await load();
    } catch (err) {
      setError(err?.message || "Unable to save record type.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(type) {
    if (!type?.id) return;
    if (!window.confirm(`Deactivate record type "${type.label}"?`)) return;
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/platform/record-types/${encodeURIComponent(type.id)}`, { method: "DELETE" });
      if (editing?.id === type.id) resetEditor();
      await load();
    } catch (err) {
      setError(err?.message || "Unable to deactivate record type.");
    } finally {
      setSaving(false);
    }
  }

  async function reactivate(type) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/platform/record-types/${encodeURIComponent(type.id)}`, {
        method: "PUT",
        body: JSON.stringify({ label: type.label, active: true }),
      });
      await load();
    } catch (err) {
      setError(err?.message || "Unable to reactivate record type.");
    } finally {
      setSaving(false);
    }
  }

  const showEditor = Boolean(editing || cloneSourceId || form.label || !types.length);

  return (
    <section className="platform-editor-card platform-record-types">
      <div className="platform-editor-card-header">
        <div>
          <h2>Record Types</h2>
          <p>Control record categories, defaults, picklist availability, and the record-type context used by page-layout assignments.</p>
        </div>
        <button type="button" className="platform-primary-button" onClick={() => { resetEditor(); setForm({ ...EMPTY_FORM }); }}>
          <Plus size={13}/> New Record Type
        </button>
      </div>

      {error ? <div className="platform-alert platform-alert-error">{error}</div> : null}

      <div className="platform-record-type-grid">
        <div className="platform-record-type-list">
          {types.length ? types.map((type) => {
            const blockers = Array.isArray(type.deactivationBlockers) ? type.deactivationBlockers : [];
            return (
              <article key={type.id} className={`platform-record-type-row ${editing?.id === type.id ? "is-selected" : ""}`}>
                <button type="button" className="platform-record-type-main" onClick={() => openEdit(type)}>
                  <span><strong>{type.label}</strong><code>{type.record_type_key}</code></span>
                  <span className={type.active === false ? "is-inactive" : "is-active"}>{type.active === false ? "Inactive" : type.is_default ? "Default" : "Active"}</span>
                </button>
                <div className="platform-record-type-actions">
                  <button type="button" onClick={() => openEdit(type)} aria-label={`Edit ${type.label}`}><Pencil size={12}/></button>
                  <button type="button" onClick={() => cloneFrom(type)} aria-label={`Clone ${type.label}`}><Copy size={12}/></button>
                  {type.active === false
                    ? <button type="button" disabled={saving} onClick={() => reactivate(type)} aria-label={`Reactivate ${type.label}`}><RotateCcw size={12}/></button>
                    : <button type="button" disabled={saving || blockers.length > 0} onClick={() => deactivate(type)} aria-label={`Deactivate ${type.label}`}><X size={12}/></button>}
                </div>
                {blockers.length ? <small>Deactivate blocked: {blockers.join(", ")}</small> : null}
              </article>
            );
          }) : <div className="platform-editor-empty">No record types configured. Records use the object’s master/default behaviour until you add one.</div>}
        </div>

        {showEditor ? (
          <form className="platform-record-type-editor" onSubmit={save}>
            <div className="platform-record-type-editor-head">
              <div>
                <strong>{editing ? "Edit Record Type" : cloneSourceId ? "Clone Record Type" : "New Record Type"}</strong>
                <span>{editing ? editing.record_type_key : "Create metadata without hard-coding object logic."}</span>
              </div>
              {(editing || cloneSourceId) ? <button type="button" className="platform-secondary-button" onClick={resetEditor}>Close</button> : null}
            </div>

            {!editing && types.length ? (
              <label className="platform-form-field platform-form-field-wide">
                <span>Start from existing record type</span>
                <select value={cloneSourceId} onChange={(event) => cloneFrom(types.find((type) => String(type.id) === event.target.value) || null)}>
                  <option value="">Start blank</option>
                  {types.filter((type) => type.active !== false).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                <small>Copies defaults and picklist availability; the new API key stays independent.</small>
              </label>
            ) : null}

            <div className="platform-form-grid">
              <label className="platform-form-field"><span>Label</span><input value={form.label} required onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
              <label className="platform-form-field"><span>API Key</span><input value={form.recordTypeKey} readOnly={Boolean(editing)} onChange={(event) => setForm({ ...form, recordTypeKey: event.target.value })} placeholder="Generated from label" /><small>{editing ? "Stable after creation." : "Leave blank to generate from the label."}</small></label>
              <label className="platform-form-field platform-form-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} /></label>
              <label className="platform-toggle-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span><strong>Active</strong><small>Inactive record types cannot be selected for new records.</small></span></label>
              <label className="platform-toggle-field"><input type="checkbox" checked={form.isDefault} disabled={!form.active} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} /><span><strong>Default record type</strong><small>Used when creation does not explicitly choose another active type.</small></span></label>
            </div>

            {picklistFields.length ? (
              <fieldset className="platform-record-type-picklists">
                <legend>Picklist values available for this record type</legend>
                {picklistFields.map((field) => {
                  const options = activeOptions(field);
                  const id = fieldId(field);
                  return (
                    <label key={id} className="platform-form-field">
                      <span>{field.label}</span>
                      <select
                        multiple
                        size={Math.min(8, Math.max(3, options.length || 3))}
                        value={picklistRestrictions[id] || []}
                        onChange={(event) => setPicklistRestrictions({
                          ...picklistRestrictions,
                          [id]: Array.from(event.target.selectedOptions, (option) => option.value),
                        })}
                      >
                        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <small>No selection means the field is not restricted by this record type.</small>
                    </label>
                  );
                })}
              </fieldset>
            ) : null}

            <details className="platform-record-type-advanced">
              <summary>Advanced default field values</summary>
              <label className="platform-form-field platform-form-field-wide"><span>Defaults (JSON)</span><textarea value={form.defaultValues} onChange={(event) => setForm({ ...form, defaultValues: event.target.value })} rows={4} placeholder='{"status":"active"}' /><small>Optional OneEngine extension. Picklist availability above remains the authoritative record-type restriction.</small></label>
            </details>

            <div className="platform-record-type-footer">
              <button type="button" className="platform-secondary-button" onClick={resetEditor}>Cancel</button>
              <button type="submit" className="platform-primary-button" disabled={saving}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Record Type"}</button>
            </div>
          </form>
        ) : null}
      </div>

      <style>{`
        .platform-record-type-grid{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(420px,1.2fr);gap:14px}
        .platform-record-type-list{display:grid;align-content:start;gap:7px}
        .platform-record-type-row{border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-background,#fff);overflow:hidden}
        .platform-record-type-row.is-selected{box-shadow:0 0 0 2px color-mix(in srgb,var(--primary-color,#2563eb) 22%,transparent)}
        .platform-record-type-main{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:transparent;color:inherit;padding:10px;text-align:left;cursor:pointer}
        .platform-record-type-main span:first-child{display:grid;gap:2px}.platform-record-type-main strong{font-size:11px}.platform-record-type-main code{font-size:9px;color:var(--text-secondary,#64748b)}
        .platform-record-type-main .is-active,.platform-record-type-main .is-inactive{font-size:9px;font-weight:700}.platform-record-type-main .is-inactive{opacity:.55}
        .platform-record-type-actions{display:flex;gap:5px;padding:0 10px 8px}.platform-record-type-actions button{display:grid;place-items:center;border:1px solid var(--border-color,#d1d5db);border-radius:6px;background:transparent;color:inherit;padding:5px;cursor:pointer}
        .platform-record-type-actions button:disabled{opacity:.35;cursor:not-allowed}.platform-record-type-row>small{display:block;padding:0 10px 9px;color:var(--text-secondary,#64748b);font-size:9px}
        .platform-record-type-editor{border:1px solid var(--border-color,#e5e7eb);border-radius:12px;padding:14px;background:var(--card-background,#fff)}
        .platform-record-type-editor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.platform-record-type-editor-head>div{display:grid;gap:3px}.platform-record-type-editor-head strong{font-size:13px}.platform-record-type-editor-head span{font-size:10px;color:var(--text-secondary,#64748b)}
        .platform-record-type-picklists{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0;padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px}.platform-record-type-picklists legend{padding:0 6px;font-size:11px;font-weight:700}
        .platform-record-type-advanced{margin-top:12px;border-top:1px solid var(--border-color,#e5e7eb);padding-top:10px}.platform-record-type-advanced summary{cursor:pointer;font-size:10px;font-weight:700;margin-bottom:10px}
        .platform-record-type-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        @media(max-width:900px){.platform-record-type-grid{grid-template-columns:1fr}.platform-record-type-picklists{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
