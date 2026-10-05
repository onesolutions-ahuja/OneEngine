import { useMemo, useState } from "react";
import { apiRequest } from "../../services/api.js";

function initialValue(field) {
  if (field.type === "uuid") return globalThis.crypto?.randomUUID?.() || `metadata-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (field.defaultValue === "today" && field.type === "date") return new Date().toISOString().slice(0, 10);
  if (field.type === "collection") {
    const count = Math.max(0, Number(field.defaultRows ?? field.minRows ?? 0));
    return Array.from({ length: count }, () => Object.fromEntries((field.fields || []).map((child) => [child.name, initialValue(child)])));
  }
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "boolean") return false;
  return "";
}

function optionLabel(row, fields = []) {
  return fields.map((field) => row?.[field]).filter((value) => value !== null && value !== undefined && value !== "").join(" · ");
}

function passesFilter(row, filter) {
  if (!filter?.field) return true;
  const left = row?.[filter.field], right = filter.value;
  if (filter.operator === "not_equals") return left !== right;
  if (filter.operator === "greater_than") return Number(left) > Number(right);
  if (filter.operator === "less_than") return Number(left) < Number(right);
  return left === right;
}

async function fetchOptions(source, { parentObjectKey = "", parentRecordId = "" } = {}) {
  let response;
  if (source?.relationshipKey && parentObjectKey && parentRecordId) {
    response = await apiRequest(`/api/platform/objects/${encodeURIComponent(parentObjectKey)}/records/${encodeURIComponent(parentRecordId)}/related/${encodeURIComponent(source.relationshipKey)}?pageSize=100`);
  } else if (source?.objectKey) {
    response = await apiRequest(`/api/platform/objects/${encodeURIComponent(source.objectKey)}/records?page=1&pageSize=200`);
  } else return [];
  const rows = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : [];
  return rows.filter((row) => passesFilter(row, source.filter)).map((row) => ({
    value: row?.[source.valueField || "id"],
    label: optionLabel(row, source.labelFields || [source.valueField || "id"]),
  }));
}

function validate(fields, values) {
  for (const field of fields || []) {
    if (!field?.name || ["hidden","uuid"].includes(field.type)) continue;
    const value = values?.[field.name];
    if (field.type === "collection") {
      const rows = Array.isArray(value) ? value : [];
      if (rows.length < Number(field.minRows || 0)) return `${field.label || field.name} requires at least ${field.minRows} row(s).`;
      for (const row of rows) {
        const nested = validate(field.fields || [], row);
        if (nested) return nested;
      }
      continue;
    }
    if (field.required && (value === "" || value === null || value === undefined)) return `${field.label || field.name} is required.`;
    if (field.type === "number" && value !== "" && !Number.isFinite(Number(value))) return `${field.label || field.name} must be a number.`;
  }
  return "";
}

export default function MetadataActionButtons({ objectKey, recordId = null, buttons = [], placements = ["record"], formFactor = "", appKey = "", onExecuted = null, onError = null }) {
  const [formState, setFormState] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const placementKey = placements.join("|");
  const visible = useMemo(() => (buttons || []).filter((button) => placements.includes(button.placement || "record")), [buttons, placementKey]);

  const collectOptions = async (fields, prefix = "", output = {}) => {
    for (const field of fields || []) {
      const key = prefix ? `${prefix}.${field.name}` : field.name;
      if (field.type === "related_select" && (field.optionsSource?.objectKey || field.optionsSource?.relationshipKey)) {
        output[key] = await fetchOptions(field.optionsSource, { parentObjectKey: objectKey, parentRecordId: recordId });
      }
      if (field.type === "collection") await collectOptions(field.fields || [], `${key}[]`, output);
    }
    return output;
  };

  const open = async (button) => {
    const form = button?.config?.form;
    if (!form?.fields?.length) return execute(button, {});
    try {
      const values = Object.fromEntries(form.fields.map((field) => [field.name, initialValue(field)]));
      const options = await collectOptions(form.fields);
      let metadata = null;
      if (form.includeMetadataFields) {
        const response = await apiRequest(`/api/platform/runtime/objects/${encodeURIComponent(objectKey)}/workspace`);
        const data = response?.data || {};
        metadata = {
          fields: (data.fields || []).filter((field) => field?.config?.storage === "extension" && field.writable !== false && field.active !== false),
          recordTypes: data.recordTypes || [],
          recordTypeId: (data.recordTypes || []).find((item) => item.is_default === true)?.id || "",
          customFields: {},
        };
      }
      setFormState({ button, form, values, options, metadata, error: "" });
    } catch (error) {
      onError?.(error?.message || "Unable to prepare configured action.");
    }
  };

  const execute = async (button, inputs) => {
    if (!button?.button_key || busyKey) return;
    setBusyKey(button.button_key);
    try {
      const query = new URLSearchParams();
      if (formFactor) query.set("formFactor", formFactor);
      if (appKey) query.set("appKey", appKey);
      const endpoint = recordId
        ? `/api/platform/objects/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(recordId)}/buttons/${encodeURIComponent(button.button_key)}/execute`
        : `/api/platform/runtime/objects/${encodeURIComponent(objectKey)}/buttons/${encodeURIComponent(button.button_key)}/execute`;
      const response = await apiRequest(`${endpoint}${query.toString() ? `?${query.toString()}` : ""}`, {
        method: "POST",
        body: JSON.stringify(recordId ? { inputs } : { context: inputs }),
      });
      if (response?.success === false) throw new Error(response.message || "Configured action failed");
      setFormState(null);
      await onExecuted?.(button, response);
    } catch (error) {
      const message = error?.message || "Unable to execute configured action.";
      if (formState) setFormState((current) => current ? { ...current, error: message } : current);
      else onError?.(message);
    } finally {
      setBusyKey("");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!formState) return;
    const error = validate(formState.form.fields, formState.values);
    if (error) return setFormState((current) => ({ ...current, error }));
    const inputs = formState.metadata
      ? { ...formState.values, recordTypeId: formState.metadata.recordTypeId || null, customFields: formState.metadata.customFields || {} }
      : { ...formState.values };
    await execute(formState.button, inputs);
  };

  const setValue = (name, value) => setFormState((current) => current ? { ...current, values: { ...current.values, [name]: value }, error: "" } : current);
  const setCollectionValue = (field, index, name, value) => setFormState((current) => {
    if (!current) return current;
    const rows = [...(current.values[field.name] || [])];
    rows[index] = { ...(rows[index] || {}), [name]: value };
    return { ...current, values: { ...current.values, [field.name]: rows }, error: "" };
  });

  const renderField = (field, value, onChange, optionKey) => {
    if (["hidden","uuid"].includes(field.type)) return null;
    const options = field.type === "related_select" ? (formState?.options?.[optionKey] || []) : (field.options || []);
    if (["select","related_select"].includes(field.type)) return <label className="module-input-label"><span>{field.label || field.name}</span><select required={field.required === true} value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">—</option>{options.map((option) => <option key={String(option.value)} value={option.value}>{option.label || option.value}</option>)}</select></label>;
    if (field.type === "textarea") return <label className="module-textarea-label"><span>{field.label || field.name}</span><textarea rows={field.rows || 3} required={field.required === true} value={value ?? ""} onChange={(event) => onChange(event.target.value)} /></label>;
    if (field.type === "boolean") return <label className="module-input-label"><span>{field.label || field.name}</span><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /></label>;
    return <label className="module-input-label"><span>{field.label || field.name}</span><input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} min={field.min} max={field.max} step={field.step} required={field.required === true} value={value ?? ""} onChange={(event) => onChange(field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} /></label>;
  };

  if (!visible.length) return null;
  return <>
    <span className="metadata-action-buttons">{visible.map((button) => <button key={button.id || button.button_key} type="button" disabled={Boolean(busyKey)} onClick={() => void open(button)}>{busyKey === button.button_key ? "Working…" : button.label}</button>)}</span>
    {formState ? <div className="module-modal-backdrop nested" onMouseDown={(event) => event.target === event.currentTarget && !busyKey && setFormState(null)}>
      <form className="module-modal metadata-action-form" onSubmit={submit}>
        <header><div><strong>{formState.button?.label || "Action"}</strong></div><button type="button" onClick={() => setFormState(null)}>Close</button></header>
        <div className="module-modal-body">
          {formState.error ? <div className="module-inline-error">{formState.error}</div> : null}
          {(formState.form.fields || []).map((field) => field.type === "collection"
            ? <section key={field.name} className="metadata-action-collection"><header><strong>{field.label || field.name}</strong><button type="button" onClick={() => setValue(field.name, [...(formState.values[field.name] || []), Object.fromEntries((field.fields || []).map((child) => [child.name, initialValue(child)]))])}>Add row</button></header>{(formState.values[field.name] || []).map((row, index) => <div key={index} className="metadata-action-collection-row">{(field.fields || []).map((child) => <span key={child.name}>{renderField(child, row?.[child.name], (value) => setCollectionValue(field, index, child.name, value), `${field.name}[].${child.name}`)}</span>)}<button type="button" disabled={(formState.values[field.name] || []).length <= Number(field.minRows || 0)} onClick={() => setValue(field.name, (formState.values[field.name] || []).filter((_, rowIndex) => rowIndex !== index))}>Remove</button></div>)}</section>
            : <span key={field.name}>{renderField(field, formState.values[field.name], (value) => setValue(field.name, value), field.name)}</span>)}
          {formState.metadata?.recordTypes?.length ? <label className="module-input-label"><span>Record Type</span><select value={formState.metadata.recordTypeId || ""} onChange={(event) => setFormState((current) => ({ ...current, metadata: { ...current.metadata, recordTypeId: event.target.value } }))}><option value="">Default</option>{formState.metadata.recordTypes.map((type) => <option key={type.id} value={type.id}>{type.label || type.name || type.record_type_key}</option>)}</select></label> : null}
          {(formState.metadata?.fields || []).map((field) => <span key={field.id || field.api_name}>{renderField({ name: field.api_name, label: field.label, type: ["number","decimal","currency"].includes(field.field_type) ? "number" : field.field_type === "boolean" ? "boolean" : field.field_type === "date" ? "date" : "text" }, formState.metadata.customFields?.[field.api_name], (value) => setFormState((current) => ({ ...current, metadata: { ...current.metadata, customFields: { ...current.metadata.customFields, [field.api_name]: value } } })), `customFields.${field.api_name}`)}</span>)}
        </div>
        <footer className="module-modal-footer"><button type="button" onClick={() => setFormState(null)}>Cancel</button><button type="submit" className="module-primary-button" disabled={Boolean(busyKey)}>{busyKey ? "Working…" : (formState.form.submitLabel || formState.button.label)}</button></footer>
      </form>
    </div> : null}
  </>;
}
