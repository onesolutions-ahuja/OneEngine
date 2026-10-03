import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../../services/api.js";

function metadataObjectKey(object) {
  return String(object?.object_key || object?.objectKey || object?.api_name || object?.apiName || object?.key || "");
}

function fieldKey(field) {
  return field?.api_name || field?.apiName || "";
}

function fieldLabel(field) {
  return field?.label || field?.name || fieldKey(field) || "Unknown field";
}

export default function PlatformFieldPicker({
  objectKey = "",
  selectedObjectKey: legacySelectedObjectKey = "",
  onObjectChange,
  value = "",
  onChange,
  onInsert,
  label = "Field",
  includeObjectSelector = false,
  objectOnly = false,
  availableFields = null,
  allowedFieldTypes = null,
  className = "",
  scopeKey = null,
  flowBuilderParity = false,
}) {
  const selectedObjectKey = objectKey || legacySelectedObjectKey;
  const [objects, setObjects] = useState([]);
  const [fields, setFields] = useState([]);
  const [search, setSearch] = useState("");
  const [objectSearch, setObjectSearch] = useState("");
  const [objectsLoading, setObjectsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [objectOpen, setObjectOpen] = useState(false);
  const unknown = value && !fields.some((field) => fieldKey(field) === value);

  useEffect(() => {
    let active = true;
    setObjectsLoading(true);
    const endpoint = scopeKey
      ? `/api/platform/workflow-resources?scope=${encodeURIComponent(scopeKey)}`
      : "/api/platform/objects";
    apiRequest(endpoint)
      .then((response) => {
        const loaded = scopeKey
          ? response?.data?.objects
          : (response?.data?.objects || response?.data || []);
        if (active) setObjects(Array.isArray(loaded) ? loaded : []);
      })
      .catch((loadError) => {
        if (active) setError("Unable to load Platform objects.");
        if (active) console.error("Platform field picker object metadata error:", loadError);
      })
      .finally(() => {
        if (active) setObjectsLoading(false);
      });
    return () => { active = false; };
  }, [scopeKey]);

  useEffect(() => {
    if (Array.isArray(availableFields)) {
      setFields(availableFields.filter((field) => field.active !== false && field.readable !== false));
      setLoading(false);
      return undefined;
    }
    if (!selectedObjectKey) {
      setFields([]);
      setSearch("");
      setLoading(false);
      return undefined;
    }
    let active = true;
    const object = objects.find((item) => metadataObjectKey(item) === selectedObjectKey);
    setFields([]);
    setSearch("");
    if (!object) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError("");
    const objectId = object.id || object.object_id;
    if (!objectId) {
      setLoading(false);
      setError("Selected Platform object has no metadata identifier.");
      return undefined;
    }
    apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}/fields`)
      .then((response) => {
        if (active) {
          setFields(Array.isArray(response?.data)
            ? response.data.filter((field) => field.active !== false && field.readable !== false)
            : []);
        }
      })
      .catch((loadError) => {
        if (active) setError("Unable to load fields for this object.");
        if (active) console.error("Platform field picker field metadata error:", loadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [availableFields, objects, selectedObjectKey]);

  const filteredObjects = useMemo(() => {
    const query = objectSearch.trim().toLowerCase();
    if (!query) return objects;
    return objects.filter((object) => {
      const key = metadataObjectKey(object);
      const label = object?.label || object?.name || key;
      return `${label} ${key}`.toLowerCase().includes(query);
    });
  }, [objects, objectSearch]);

  const filteredFields = useMemo(() => {
    const allowed = Array.isArray(allowedFieldTypes) && allowedFieldTypes.length
      ? new Set(allowedFieldTypes.map((type) => String(type).toLowerCase()))
      : null;
    const compatible = allowed
      ? fields.filter((field) => allowed.has(String(field.field_type || field.fieldType || "").toLowerCase()))
      : fields;
    const query = search.trim().toLowerCase();
    if (!query) return compatible;
    return compatible.filter((field) => `${fieldLabel(field)} ${fieldKey(field)}`.toLowerCase().includes(query));
  }, [allowedFieldTypes, fields, search]);

  const selectField = (key) => {
    onChange?.(key);
    if (key) onInsert?.(`{{${key}}}`, key);
  };

  function selectObject(nextKey) {
    const selected = objects.find((item) => metadataObjectKey(item) === String(nextKey));
    const canonicalKey = selected ? metadataObjectKey(selected) : String(nextKey || "");
    onObjectChange?.(canonicalKey, selected?.id || selected?.object_id || "");
    onChange?.("");
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {includeObjectSelector ? (
        flowBuilderParity ? (
          <div className="relative">
            <button type="button" className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" onClick={() => setObjectOpen((open) => !open)} disabled={objectsLoading} aria-haspopup="listbox" aria-expanded={objectOpen}>
              {objectsLoading ? "Loading objects..." : (objects.find((item) => metadataObjectKey(item) === String(selectedObjectKey))?.label || selectedObjectKey || "Select an Object")}
            </button>
            {objectOpen ? <div className="absolute z-[80] mt-1 w-full rounded border border-slate-300 bg-white shadow-lg">
              <div className="border-b border-slate-200 p-2"><input autoFocus className="w-full rounded border border-slate-300 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none" value={objectSearch} onChange={(event) => setObjectSearch(event.target.value)} placeholder="Search objects..." aria-label="Search objects"/></div>
              <div className="max-h-64 overflow-y-auto py-1" role="listbox">
                {filteredObjects.map((object) => { const key=metadataObjectKey(object); const selected=key===String(selectedObjectKey); return <button type="button" role="option" aria-selected={selected} key={object.id || key} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50 ${selected ? "bg-blue-50 text-blue-700" : "text-slate-700"}`} onClick={() => { selectObject(key); setObjectOpen(false); setObjectSearch(""); }}><span>{object.label || key}</span>{selected ? <span aria-hidden="true">✓</span> : null}</button>; })}
                {!filteredObjects.length ? <div className="px-3 py-3 text-sm text-slate-500">No objects found.</div> : null}
              </div>
            </div> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <input className="w-full rounded border px-2 py-2 text-sm" value={objectSearch} onChange={(event) => setObjectSearch(event.target.value)} placeholder="Search objects..." aria-label="Search objects" disabled={objectsLoading}/>
            <select className="w-full rounded border px-2 py-2 text-sm" value={selectedObjectKey || ""} onChange={(event) => selectObject(event.target.value)} disabled={objectsLoading}>
              <option value="">{objectsLoading ? "Loading objects..." : "Select object"}</option>
              {selectedObjectKey && !objects.some((item) => metadataObjectKey(item) === String(selectedObjectKey)) ? <option value={selectedObjectKey}>Unknown object: {selectedObjectKey}</option> : null}
              {filteredObjects.map((object) => <option key={object.id || metadataObjectKey(object)} value={metadataObjectKey(object)}>{object.label || metadataObjectKey(object)}</option>)}
            </select>
          </div>
        )
      ) : null}
      {objectOnly ? null : (
      <div className="flex gap-2">
        <select className="min-w-0 flex-1 rounded border px-2 py-2 text-sm" value={value} onChange={(event) => selectField(event.target.value)} disabled={loading || !selectedObjectKey}>
          <option value="">{loading ? "Loading fields..." : label}</option>
          {unknown ? <option value={value}>Unknown field: {value}</option> : null}
          {filteredFields.map((field) => <option key={field.id || fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)} ({field.field_type || field.fieldType || "field"})</option>)}
        </select>
      </div>
      )}
      {!objectOnly && selectedObjectKey ? <input className="w-full rounded border px-2 py-2 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fields..." /> : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
