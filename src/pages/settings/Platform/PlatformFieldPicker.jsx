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
}) {
  const selectedObjectKey = objectKey || legacySelectedObjectKey;
  const [objects, setObjects] = useState([]);
  const [fields, setFields] = useState([]);
  const [search, setSearch] = useState("");
  const [objectSearch, setObjectSearch] = useState("");
  const [objectsLoading, setObjectsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
        <div className="space-y-2">
          <input className="w-full rounded border px-2 py-2 text-sm" value={objectSearch} onChange={(event) => setObjectSearch(event.target.value)} placeholder="Search objects..." aria-label="Search objects" disabled={objectsLoading}/>
          <select className="w-full rounded border px-2 py-2 text-sm" value={selectedObjectKey || ""} onChange={(event) => selectObject(event.target.value)} disabled={objectsLoading}>
            <option value="">{objectsLoading ? "Loading objects..." : "Select object"}</option>
            {selectedObjectKey && !objects.some((item) => metadataObjectKey(item) === String(selectedObjectKey)) ? <option value={selectedObjectKey}>Unknown object: {selectedObjectKey}</option> : null}
            {filteredObjects.map((object) => <option key={object.id || metadataObjectKey(object)} value={metadataObjectKey(object)}>{object.label || metadataObjectKey(object)}</option>)}
          </select>
        </div>
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
