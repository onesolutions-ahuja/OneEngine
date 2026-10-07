import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import { compileFormulas, formulaPreviewDependencies, formulaReferences } from "../../../../server/services/platformFormula.js";
import { toSafeApiName, withGeneratedApiName } from "./safeApiName.js";
import WhereUsedPanel from "./WhereUsedPanel.jsx";

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "text_area", label: "Text Area" },
  { value: "long_text", label: "Long Text Area" },
  { value: "rich_text", label: "Rich Text" },
  { value: "url", label: "URL" },
  { value: "time", label: "Time" },
  { value: "percent", label: "Percent" },
  { value: "auto_number", label: "Auto Number" },
  { value: "address", label: "Address" },
  { value: "location", label: "Location" },
  { value: "json", label: "JSON / Structured" },
  { value: "number", label: "Number" },
  { value: "decimal", label: "Decimal" },
  { value: "currency", label: "Currency" },
  { value: "boolean", label: "Checkbox / Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "picklist", label: "Picklist" },
  { value: "select", label: "Picklist / Select (legacy)" },
  { value: "lookup", label: "Lookup" },
  { value: "multiselect", label: "Multi-select" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "formula", label: "Formula (read-only)" },
  { value: "rollup", label: "Rollup (read-only)" },
];

const EMPTY_FIELD = {
  label: "",
  apiName: "",
  field_type: "text",
  sourceColumn: "",
  required: false,
  readable: true,
  writable: true,
  active: true,
  description: "",
};

export default function FieldEditor({
  object,
  field = null,
  fields = [],
  onSave,
  onCancel,
  onNavigateDependency,
}) {
  const isNew = !field?.id && !field?.field_id;

  const [form, setForm] = useState({
    ...EMPTY_FIELD,
    ...(field || {}),
    apiName: field?.apiName || field?.api_name || "",
    sourceColumn: field?.sourceColumn || field?.source_column || "",
    description: field?.description || field?.config?.description || "",
    expression: field?.config?.expression || "",
    resultType: field?.config?.resultType || "decimal",
    visibilityCondition: field?.config?.visibilityCondition || null,
    requiredCondition: field?.config?.requiredCondition || null,
    valueSource: field?.config?.valueSetId ? "reusable" : "local",
    valueSetId: field?.config?.valueSetId || "",
    dependentPicklist: {
      controllingField: field?.config?.dependentPicklist?.controllingField || field?.config?.dependent_picklist?.controlling_field || "",
      mappings: field?.config?.dependentPicklist?.mappings || field?.config?.dependent_picklist?.mappings || {},
    },
    rollupOperation: field?.config?.operation || "COUNT",
    rollupRelationshipKey: field?.config?.relationshipKey || "",
    rollupSourceField: field?.config?.field || "",
    rollupResultType: field?.config?.resultType || "number",
    rollupCondition: field?.config?.condition || null,
    lookupRelationshipKey: field?.config?.relationshipKey || "",
    lookupRelatedObjectKey: field?.config?.relatedObjectKey || field?.config?.related_object_key || "",
    duplicateMatching: {
      enabled: field?.config?.duplicateMatching?.enabled === true,
      operator: field?.config?.duplicateMatching?.operator || (field?.field_type === "email" ? "normalized_email" : field?.field_type === "phone" ? "normalized_phone" : "exact"),
      action: field?.config?.duplicateMatching?.action || "BLOCK",
      ruleKey: field?.config?.duplicateMatching?.ruleKey || "",
      matchMode: field?.config?.duplicateMatching?.matchMode || "ANY",
    },
    autoNumberPrefix: field?.config?.prefix || "",
    autoNumberSuffix: field?.config?.suffix || "",
    autoNumberStart: Number(field?.config?.start ?? field?.config?.startNumber ?? 1),
    autoNumberPadding: Number(field?.config?.padding ?? 0),
    helpText: field?.config?.helpText || field?.config?.help_text || "",
    defaultMode: field?.config?.defaultFormula || field?.config?.default_formula ? "formula" : "static",
    defaultValue: field?.config?.defaultValue ?? field?.config?.default_value ?? "",
    defaultFormula: field?.config?.defaultFormula || field?.config?.default_formula || "",
    restrictedPicklist: field?.config?.restricted !== false,
    sortAlphabetically: field?.config?.sortAlphabetically === true || field?.config?.sort_alphabetically === true,
    multiSelectVisibleLines: Number(field?.config?.visibleLines ?? field?.config?.visible_lines ?? 6),
    maxLength: field?.config?.maxLength ?? field?.config?.max_length ?? "",
    precision: field?.config?.precision ?? "",
    scale: field?.config?.scale ?? field?.config?.decimalPlaces ?? field?.config?.decimal_places ?? "",
    unique: field?.config?.unique === true,
    externalId: field?.config?.externalId === true || field?.config?.external_id === true,
    uniqueCaseSensitive: field?.config?.uniqueCaseSensitive === true || field?.config?.unique_case_sensitive === true,
    trackHistory: field?.config?.trackHistory === true || field?.config?.track_history === true,
    lookupFilter: {
      active: field?.config?.lookupFilter?.active === true || field?.config?.lookup_filter?.active === true,
      required: (field?.config?.lookupFilter?.required ?? field?.config?.lookup_filter?.required) !== false,
      match: field?.config?.lookupFilter?.match || field?.config?.lookup_filter?.match || "all",
      conditions: field?.config?.lookupFilter?.conditions || field?.config?.lookup_filter?.conditions || [],
    },
    options: Array.isArray(field?.options) ? field.options : [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [valueSets, setValueSets] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [formulaPreviewValues, setFormulaPreviewValues] = useState({});
  const [formulaPathPreviewValues, setFormulaPathPreviewValues] = useState({});
  const [recordPaths, setRecordPaths] = useState({ rootObjectKey: "", items: [] });
  const [lookupTargetFields, setLookupTargetFields] = useState([]);

  let formulaDependencies = [];
  let formulaPathReferences = [];
  let formulaPreviewValue = null;
  let formulaPreviewError = "";
  if (form.field_type === "formula") {
    try {
      const apiName = form.apiName || "formula_preview";
      const existingFields = fields.filter((item) => item.api_name !== apiName && item.api_name !== field?.api_name);
      const refs = formulaReferences(form.expression);
      const dotted = refs.filter((reference) => reference.includes("."));
      formulaPathReferences = dotted;
      const pathTypes = {};
      for (const reference of dotted) {
        const canonical = reference.startsWith(`${recordPaths.rootObjectKey}.`) ? reference : `${recordPaths.rootObjectKey}.${reference}`;
        const match = recordPaths.items.find((item) => item.kind === "field" && item.path === canonical);
        if (match?.fieldType) pathTypes[reference] = match.fieldType;
      }
      const candidate = {
        ...(field || {}),
        api_name: apiName,
        field_type: "formula",
        source_column: null,
        required: false,
        writable: false,
        readable: true,
        active: true,
        config: { expression: form.expression, resultType: form.resultType, ...(Object.keys(pathTypes).length ? { recordPathTypes: pathTypes } : {}) },
      };
      formulaDependencies = formulaPreviewDependencies(existingFields, form.expression);
      formulaPreviewValue = compileFormulas([...existingFields, candidate])({
        ...formulaPreviewValues,
        __formulaPathValues: formulaPathPreviewValues,
      })[apiName];
    } catch (previewError) {
      formulaPreviewError = previewError.message || "Formula preview is unavailable.";
    }
  }

  useEffect(() => {
    if (!["picklist", "select", "multiselect"].includes(form.field_type)) return;
    apiRequest("/api/platform/value-sets")
      .then((response) => setValueSets(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => setError(err?.message || "Unable to load reusable value sets."));
  }, [form.field_type]);

  useEffect(() => {
    if (form.field_type !== "formula" || !object?.id) return;
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/record-paths?depth=6`)
      .then((response) => setRecordPaths({
        rootObjectKey: response?.rootObjectKey || object?.object_key || "",
        items: Array.isArray(response?.data) ? response.data : [],
      }))
      .catch((err) => setError(err?.message || "Unable to load formula record paths."));
  }, [form.field_type, object?.id]);

  useEffect(() => {
    if (form.field_type !== "lookup" || !object?.id) return;
    apiRequest("/api/platform/relationships")
      .then((response) => setRelationships(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => setError(err?.message || "Unable to load relationships."));
  }, [form.field_type, object?.id]);

  useEffect(() => {
    if (form.field_type !== "lookup" || !object?.id || !form.lookupRelationshipKey) {
      setLookupTargetFields([]);
      return;
    }
    const relationship = relationships.find((item) => item.relationship_key === form.lookupRelationshipKey);
    if (!relationship) return;
    const targetObjectId = String(relationship.parent_object_id) === String(object.id)
      ? relationship.child_object_id
      : relationship.parent_object_id;
    if (!targetObjectId) return;
    apiRequest(`/api/platform/objects/${encodeURIComponent(targetObjectId)}/record-paths?depth=1`)
      .then((response) => {
        const root = response?.rootObjectKey || "";
        setLookupTargetFields((Array.isArray(response?.data) ? response.data : [])
          .filter((item) => item.kind === "field" && item.path.split(".").length === 2)
          .map((item) => ({ apiName: item.path.startsWith(`${root}.`) ? item.path.slice(root.length + 1) : item.path.split(".").pop(), label: item.label, fieldType: item.fieldType })));
      })
      .catch((err) => setError(err?.message || "Unable to load lookup target fields."));
  }, [form.field_type, form.lookupRelationshipKey, relationships, object?.id]);

  function update(name, value) {
    setForm((current) => ({
      ...current,
      ...withGeneratedApiName(current, name, value, (label) => toSafeApiName(label), { labelField: "label", apiNameField: "apiName", isNew }),
      [name]: value,
    }));
  }

  function updateCondition(name, next) {
    setForm((current) => ({ ...current, [name]: next }));
  }

  function updateDuplicateMatching(name, value) {
    setForm((current) => ({ ...current, duplicateMatching: { ...current.duplicateMatching, [name]: value } }));
  }

  function updateLookupFilter(patch) {
    setForm((current) => ({ ...current, lookupFilter: { ...current.lookupFilter, ...patch } }));
  }

  function addLookupFilterCondition() {
    setForm((current) => ({
      ...current,
      lookupFilter: {
        ...current.lookupFilter,
        active: true,
        conditions: [...(current.lookupFilter?.conditions || []), {
          targetField: lookupTargetFields[0]?.apiName || "",
          operator: "equals",
          valueSource: "source_field",
          sourceField: fields[0]?.api_name || "",
          value: "",
          userField: "id",
        }],
      },
    }));
  }

  function updateLookupFilterCondition(index, patch) {
    setForm((current) => ({
      ...current,
      lookupFilter: {
        ...current.lookupFilter,
        conditions: (current.lookupFilter?.conditions || []).map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      },
    }));
  }

  function removeLookupFilterCondition(index) {
    setForm((current) => ({
      ...current,
      lookupFilter: {
        ...current.lookupFilter,
        conditions: (current.lookupFilter?.conditions || []).filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  }

  function addOption() {
    setForm((current) => ({
      ...current,
      options: [...current.options, { id: `new-${Date.now()}-${current.options.length}`, label: "", value: "", active: true }],
    }));
  }

  function updateOption(index, key, value) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => {
        if (optionIndex !== index) return option;
        if (key === "label" && !option.id?.toString().startsWith("new-")) {
          return { ...option, label: value };
        }
        return {
          ...option,
          [key]: value,
          ...(key === "label" && option.id?.toString().startsWith("new-") ? { value: toSafeApiName(value) } : {}),
        };
      }),
    }));
  }

  function removeOption(index) {
    setForm((current) => ({ ...current, options: current.options.filter((_, optionIndex) => optionIndex !== index) }));
  }

  function moveOption(index, direction) {
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const options = [...current.options];
      [options[index], options[target]] = [options[target], options[index]];
      return { ...current, options };
    });
  }

  function picklistOptions(candidate) {
    const options = Array.isArray(candidate?.options)
      ? candidate.options
      : Array.isArray(candidate?.values)
        ? candidate.values
        : [];
    return options
      .filter((option) => option?.active !== false)
      .map((option) => ({
        value: String(typeof option === "object" ? option.value ?? option.key ?? option.label ?? "" : option),
        label: String(typeof option === "object" ? option.label ?? option.name ?? option.value ?? "" : option),
      }))
      .filter((option) => option.value);
  }

  function updateDependentPicklist(name, value) {
    setForm((current) => ({
      ...current,
      dependentPicklist: {
        ...(current.dependentPicklist || { controllingField: "", mappings: {} }),
        [name]: value,
      },
    }));
  }

  function toggleDependentMapping(dependentValue, controllingValue, checked) {
    setForm((current) => {
      const existing = current.dependentPicklist?.mappings || {};
      const values = new Set(Array.isArray(existing[dependentValue]) ? existing[dependentValue].map(String) : []);
      if (checked) values.add(String(controllingValue));
      else values.delete(String(controllingValue));
      return {
        ...current,
        dependentPicklist: {
          ...(current.dependentPicklist || {}),
          mappings: { ...existing, [dependentValue]: [...values] },
        },
      };
    });
  }

  function conditionEditor(name, title) {
    const condition = form[name];
    const availableFields = fields.filter((candidate) => candidate.api_name !== (field?.api_name || field?.apiName));
    const fallback = {
      field: availableFields[0]?.api_name || "",
      operator: "equals",
      value: "",
    };
    const conditions = condition?.conditions?.length ? condition.conditions : [fallback];
    const updateAt = (index, key, value) => updateCondition(name, {
      match: condition?.match || "all",
      conditions: conditions.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    });
    const addCondition = () => updateCondition(name, {
      match: condition?.match || "all",
      conditions: [...conditions, fallback],
    });
    const removeCondition = (index) => updateCondition(name, {
      match: condition?.match || "all",
      conditions: conditions.filter((_, itemIndex) => itemIndex !== index),
    });

    return (
      <fieldset className="platform-field-editor-wide">
        <legend>{title}</legend>
        <label>
          <span>Match</span>
          <select
            value={condition?.match || "all"}
            onChange={(event) => updateCondition(name, {
              match: event.target.value,
              conditions,
            })}
          >
            <option value="all">ALL conditions</option>
            <option value="any">ANY conditions</option>
          </select>
        </label>
        {conditions.map((item, index) => (
          <React.Fragment key={`${name}-${index}`}>
            <label>
              <span>Controlling field</span>
              <select value={item.field} onChange={(event) => updateAt(index, "field", event.target.value)}>
                <option value="">Select a field</option>
                {availableFields.map((candidate) => (
                  <option key={candidate.api_name} value={candidate.api_name}>
                    {candidate.label} ({candidate.api_name})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Operator</span>
              <select value={item.operator} onChange={(event) => updateAt(index, "operator", event.target.value)}>
                {["equals", "not_equals", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "is_empty", "is_not_empty"].map((operator) => (
                  <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            {!["is_empty", "is_not_empty"].includes(item.operator) ? (
              <label>
                <span>Comparison value</span>
                <input value={item.value ?? ""} onChange={(event) => updateAt(index, "value", event.target.value)} />
              </label>
            ) : null}
            {conditions.length > 1 ? <button type="button" onClick={() => removeCondition(index)}>Remove condition</button> : null}
          </React.Fragment>
        ))}
        <button type="button" onClick={addCondition}>Add condition</button>
        <button type="button" onClick={() => updateCondition(name, null)}>Clear condition</button>
      </fieldset>
    );
  }

  async function saveField(event) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      if (!object?.id && !object?.object_id) {
        throw new Error("Save the object before adding fields.");
      }

      const objectId = object.id || object.object_id;

      const payload = {
        label: form.label,
        apiName: form.apiName,
        fieldType: form.field_type,
        sourceColumn: ["formula", "rollup"].includes(form.field_type) ? null : form.sourceColumn || null,
        required: ["formula", "rollup", "auto_number"].includes(form.field_type) ? false : Boolean(form.required),
        readable: form.readable !== false,
        writable: ["formula", "rollup", "auto_number"].includes(form.field_type) ? false : form.writable !== false,
        ...(form.field_type === "formula" ? { writable: false, config: { ...(field?.config || {}), expression: form.expression, resultType: form.resultType } } : {}),
        active: form.active !== false,
        description: form.description || "",
        config: {
          ...(field?.config || {}),
          description: String(form.description || "").trim(),
          ...(form.field_type === "formula" ? { expression: form.expression, resultType: form.resultType } : {}),
          ...(form.field_type === "rollup" ? {
            operation: form.rollupOperation,
            relationshipKey: form.rollupRelationshipKey,
            field: form.rollupSourceField || null,
            resultType: form.rollupResultType,
            ...(form.rollupCondition ? { condition: form.rollupCondition } : {}),
          } : {}),
          ...(form.field_type === "lookup" ? {
            relationshipKey: form.lookupRelationshipKey || null,
            relatedObjectKey: form.lookupRelatedObjectKey || null,
            lookupFilter: form.lookupFilter?.active ? {
              active: true,
              required: form.lookupFilter.required !== false,
              match: form.lookupFilter.match === "any" ? "any" : "all",
              conditions: form.lookupFilter.conditions || [],
            } : null,
          } : {}),
          ...(!["formula", "rollup", "auto_number"].includes(form.field_type) ? {
            helpText: String(form.helpText || "").trim(),
            ...(form.defaultMode === "formula"
              ? { defaultValue: null, defaultFormula: String(form.defaultFormula || "").trim() || null }
              : { defaultFormula: null, ...(form.defaultValue !== "" && !(form.dependentPicklist?.controllingField && ["picklist","select","multiselect"].includes(form.field_type)) ? { defaultValue: form.defaultValue } : { defaultValue: null }) }),
            ...(["text","long_text","rich_text"].includes(form.field_type) && form.maxLength !== ""
              ? { maxLength: Math.max(1, Number(form.maxLength)) }
              : { maxLength: null }),
            ...(form.precision !== "" ? { precision: Math.max(1, Number(form.precision)) } : { precision: null }),
            ...(form.scale !== "" ? { scale: Math.max(0, Number(form.scale)) } : { scale: null }),
            unique: form.unique === true,
            externalId: form.externalId === true,
            uniqueCaseSensitive: form.unique === true && form.uniqueCaseSensitive === true,
            trackHistory: form.trackHistory === true,
          } : {}),
          ...(form.field_type === "auto_number" ? {
            prefix: form.autoNumberPrefix || "",
            suffix: form.autoNumberSuffix || "",
            start: Math.max(1, Number(form.autoNumberStart || 1)),
            padding: Math.max(0, Math.min(20, Number(form.autoNumberPadding || 0))),
            externalId: form.externalId === true,
            trackHistory: form.trackHistory === true,
          } : {}),
          ...(!["formula", "rollup"].includes(form.field_type) ? { duplicateMatching: form.duplicateMatching } : {}),
          ...(form.visibilityCondition ? { visibilityCondition: form.visibilityCondition } : {}),
          ...(form.requiredCondition ? { requiredCondition: form.requiredCondition } : {}),
          ...(["picklist", "select", "multiselect"].includes(form.field_type)
            ? {
                ...(form.valueSource === "reusable" ? { valueSetId: form.valueSetId } : { valueSetId: null }),
                restricted: form.restrictedPicklist !== false,
                sortAlphabetically: form.sortAlphabetically === true,
                visibleLines: form.field_type === "multiselect" ? Math.max(3, Math.min(50, Number(form.multiSelectVisibleLines || 6))) : null,
                ...(form.dependentPicklist?.controllingField ? {
                  dependentPicklist: {
                    controllingField: form.dependentPicklist.controllingField,
                    mappings: form.dependentPicklist.mappings || {},
                  },
                } : { dependentPicklist: null }),
              }
            : {}),
        },
        options: ["picklist", "select", "multiselect"].includes(form.field_type) && form.valueSource === "local" ? form.options : [],
      };

      const fieldId = field?.id || field?.field_id;

      const url = isNew
        ? `/api/platform/objects/${objectId}/fields`
        : `/api/platform/fields/${fieldId}`;

      const response = await apiRequest(url, {
        method: isNew ? "POST" : "PUT",
        body: JSON.stringify(payload),
      });
      const savedField = response?.data || response;

      if (typeof onSave === "function") {
        onSave(savedField);
      }
    } catch (err) {
      setError(
        err?.message ||
          "Unable to save the field."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="platform-field-editor">
      <div className="platform-field-editor-header">
        <div>
          <div className="platform-eyebrow">
            PLATFORM / FIELD
          </div>

          <h2>
            {isNew ? "New Field" : "Edit Field"}
          </h2>

          <p>
            Object:{" "}
            <strong>
              {object?.name ||
                object?.label ||
                object?.object_key ||
                "Unknown"}
            </strong>
          </p>
        </div>

        <button
          type="button"
          className="platform-secondary-button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>

      {error ? (
        <div className="platform-alert platform-alert-error">
          {error}
        </div>
      ) : null}

      <form onSubmit={saveField}>
        <div className="platform-field-editor-grid">
          <label>
            <span>Field Label</span>
            <input
              type="text"
              value={form.label || ""}
              onChange={(event) =>
                update("label", event.target.value)
              }
              placeholder="Record Name"
              required
            />
          </label>

          <label>
            <span>API Key (stable)</span>
            <input
              type="text"
              value={form.apiName || ""}
              readOnly
              placeholder="related_name"
              required
            />
            <small>
              Generated from the label for new fields and kept stable after creation.
            </small>
          </label>

          <label>
            <span>Field Type</span>
            <select
              value={form.field_type || "text"}
              onChange={(event) =>
                update(
                  "field_type",
                  event.target.value
                )
              }
            >
              {FIELD_TYPES.map((type) => (
                <option
                  key={type.value}
                  value={type.value}
                >
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          {!["formula", "rollup"].includes(form.field_type) && <label>
            <span>Existing Database Column</span>
            <input
              type="text"
              value={form.sourceColumn || ""}
              onChange={(event) =>
                update(
                  "sourceColumn",
                  event.target.value
                )
              }
              placeholder="Existing column name"
            />
            <small>
              Only map to an existing column. This editor
              must not create database columns.
            </small>
          </label>}

          {form.field_type !== "formula" && form.field_type !== "rollup" && form.sourceColumn && (
            <fieldset className="platform-field-editor-wide">
              <legend>Duplicate matching</legend>
              <label>
                <span>Enable this field in duplicate rules</span>
                <input type="checkbox" checked={form.duplicateMatching.enabled} onChange={(event) => updateDuplicateMatching("enabled", event.target.checked)} />
              </label>
              <label>
                <span>Matching operator</span>
                <select value={form.duplicateMatching.operator} onChange={(event) => updateDuplicateMatching("operator", event.target.value)}>
                  <option value="exact">Exact</option>
                  <option value="normalized_text">Normalized text</option>
                  <option value="normalized_email">Normalized email</option>
                  <option value="normalized_phone">Normalized phone</option>
                </select>
              </label>
              <label>
                <span>Duplicate action</span>
                <select value={form.duplicateMatching.action} onChange={(event) => updateDuplicateMatching("action", event.target.value)}>
                  <option value="ALLOW">Allow</option>
                  <option value="WARN">Warn</option>
                  <option value="BLOCK">Block</option>
                </select>
              </label>
              <label>
                <span>Rule key</span>
                <input value={form.duplicateMatching.ruleKey} onChange={(event) => updateDuplicateMatching("ruleKey", event.target.value)} placeholder={form.apiName || "Defaults to this field"} />
              </label>
              <label>
                <span>Combined field matching</span>
                <select value={form.duplicateMatching.matchMode} onChange={(event) => updateDuplicateMatching("matchMode", event.target.value)}>
                  <option value="ANY">Any configured field</option>
                  <option value="ALL">All configured fields</option>
                </select>
              </label>
              <small>Fields with the same rule key form one Object-level rule. Use ALL to require every configured field to match.</small>
            </fieldset>
          )}

          {["picklist", "select", "multiselect"].includes(form.field_type) ? (
            <fieldset className="platform-field-editor-wide">
              <legend>Picklist values</legend>
              <label>
                <span>Value source</span>
                <select value={form.valueSource} onChange={(event) => update("valueSource", event.target.value)}>
                  <option value="local">Local values</option>
                  <option value="reusable">Reusable value set</option>
                </select>
              </label>
              {form.valueSource === "reusable" ? (
                <label>
                  <span>Reusable value set</span>
                  <select value={form.valueSetId} onChange={(event) => update("valueSetId", event.target.value)} required>
                    <option value="">Select a value set</option>
                    {valueSets.filter((valueSet) => valueSet.active !== false).map((valueSet) => (
                      <option key={valueSet.id} value={valueSet.id}>{valueSet.label} ({valueSet.value_set_key})</option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  {form.options.map((option, index) => (
                    <div key={option.id || `${option.value}-${index}`} className="platform-field-editor-option">
                      <input value={option.label || ""} placeholder="In Progress" onChange={(event) => updateOption(index, "label", event.target.value)} />
                      <input value={option.value || ""} readOnly placeholder="in_progress" />
                      <label><input type="checkbox" checked={option.active !== false} onChange={(event) => updateOption(index, "active", event.target.checked)} /> Active</label>
                      {!form.sortAlphabetically ? <><button type="button" disabled={index === 0} onClick={() => moveOption(index, -1)} aria-label="Move value up">↑</button><button type="button" disabled={index === form.options.length - 1} onClick={() => moveOption(index, 1)} aria-label="Move value down">↓</button></> : null}
                      <button type="button" onClick={() => removeOption(index)}>Remove</button>
                    </div>
                  ))}
                  <button type="button" onClick={addOption}>Add value</button>
                </>
              )}
              <label className="platform-checkbox"><input type="checkbox" checked={form.sortAlphabetically === true} onChange={(event) => update("sortAlphabetically", event.target.checked)} /><span><strong>Sort values alphabetically</strong><small>Otherwise users see the manual order above.</small></span></label>
              <label className="platform-checkbox"><input type="checkbox" checked={form.restrictedPicklist !== false} onChange={(event) => update("restrictedPicklist", event.target.checked)} /><span><strong>Restricted values</strong><small>When off, API/import/automation may save values not defined here; record forms still show the configured choices.</small></span></label>
              {form.field_type === "multiselect" ? <label><span>Visible lines</span><input type="number" min="3" max="50" value={form.multiSelectVisibleLines || 6} onChange={(event) => update("multiSelectVisibleLines", Number(event.target.value || 6))} /></label> : null}
              <div className="platform-dependent-picklist">
                <label>
                  <span>Controlling field</span>
                  <select
                    value={form.dependentPicklist?.controllingField || ""}
                    onChange={(event) => updateDependentPicklist("controllingField", event.target.value)}
                  >
                    <option value="">None — independent picklist</option>
                    {fields
                      .filter((candidate) => candidate.api_name !== (field?.api_name || form.apiName))
                      .filter((candidate) => ["picklist", "select", "boolean"].includes(candidate.field_type))
                      .map((candidate) => (
                        <option key={candidate.id || candidate.api_name} value={candidate.api_name}>
                          {candidate.label} ({candidate.api_name})
                        </option>
                      ))}
                  </select>
                </label>
                {form.dependentPicklist?.controllingField ? (() => {
                  const controller = fields.find((candidate) => candidate.api_name === form.dependentPicklist.controllingField);
                  const controllerOptions = controller?.field_type === "boolean"
                    ? [{ value: "true", label: "True" }, { value: "false", label: "False" }]
                    : picklistOptions(controller);
                  const selectedValueSet = valueSets.find((valueSet) => String(valueSet.id) === String(form.valueSetId || ""));
                  const dependentOptions = form.valueSource === "local"
                    ? picklistOptions({ options: form.options })
                    : picklistOptions(selectedValueSet || field);
                  return controllerOptions.length && dependentOptions.length ? (
                    <div className="platform-dependent-matrix">
                      <div className="platform-dependent-matrix-head">
                        <strong>Dependent value</strong>
                        {controllerOptions.map((option) => <strong key={option.value}>{option.label}</strong>)}
                      </div>
                      {dependentOptions.map((dependent) => (
                        <div className="platform-dependent-matrix-row" key={dependent.value}>
                          <span>{dependent.label}</span>
                          {controllerOptions.map((controllerOption) => {
                            const checked = Array.isArray(form.dependentPicklist?.mappings?.[dependent.value])
                              && form.dependentPicklist.mappings[dependent.value].map(String).includes(String(controllerOption.value));
                            return (
                              <label key={controllerOption.value} title={dependent.label + " when " + controllerOption.label}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => toggleDependentMapping(dependent.value, controllerOption.value, event.target.checked)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : <small>Configure active values on both picklists before building the dependency matrix.</small>;
                })() : null}
                <small>When a controlling value changes, users only see the dependent values enabled in this matrix. The server enforces the same mapping.</small>
                {form.dependentPicklist?.controllingField ? <small>Dependent picklists do not use a default value; the controlling value and record type determine the choices.</small> : null}
              </div>
            </fieldset>
          ) : null}

          {form.field_type === "auto_number" ? (
            <fieldset className="platform-field-editor-wide">
              <legend>Auto Number</legend>
              <label><span>Prefix</span><input value={form.autoNumberPrefix || ""} onChange={(event) => update("autoNumberPrefix", event.target.value)} placeholder="ORD-" /></label>
              <label><span>Start at</span><input type="number" min="1" value={form.autoNumberStart || 1} onChange={(event) => update("autoNumberStart", Number(event.target.value || 1))} /></label>
              <label><span>Minimum digits</span><input type="number" min="0" max="20" value={form.autoNumberPadding || 0} onChange={(event) => update("autoNumberPadding", Number(event.target.value || 0))} /></label>
              <label><span>Suffix</span><input value={form.autoNumberSuffix || ""} onChange={(event) => update("autoNumberSuffix", event.target.value)} placeholder="" /></label>
              <label className="platform-checkbox"><input type="checkbox" checked={form.externalId === true} onChange={(event) => update("externalId", event.target.checked)} /><span><strong>External ID</strong><small>Allow Data Loader/API upserts to match this generated value.</small></span></label>
              <label className="platform-checkbox"><input type="checkbox" checked={form.trackHistory === true} onChange={(event) => update("trackHistory", event.target.checked)} /><span><strong>Track History</strong><small>Include the generated identifier in record history.</small></span></label>
              <small>Generated atomically when a record is created. Supports date tokens &#123;YYYY&#125;, &#123;YY&#125;, &#123;MM&#125;, &#123;DD&#125;. Maximum generated value: 30 characters.</small>
            </fieldset>
          ) : null}

          {form.field_type === "lookup" ? (
            <fieldset className="platform-field-editor-wide">
              <legend>Relationship target</legend>
              <label>
                <span>Relationship</span>
                <select
                  value={form.lookupRelationshipKey || ""}
                  onChange={(event) => {
                    const relationship = relationships.find((item) => item.relationship_key === event.target.value);
                    const targetObjectKey = relationship
                      ? String(relationship.parent_object_id) === String(object.id)
                        ? relationship.child_object_key
                        : relationship.parent_object_key
                      : "";
                    setForm((current) => ({
                      ...current,
                      lookupRelationshipKey: event.target.value,
                      lookupRelatedObjectKey: targetObjectKey,
                    }));
                  }}
                  required
                >
                  <option value="">Select a relationship</option>
                  {relationships
                    .filter((relationship) =>
                      String(relationship.parent_object_id) === String(object.id) ||
                      String(relationship.child_object_id) === String(object.id)
                    )
                    .map((relationship) => (
                      <option key={relationship.id} value={relationship.relationship_key}>
                        {relationship.relationship_key} ({relationship.parent_object_key} → {relationship.child_object_key})
                      </option>
                    ))}
                </select>
              </label>
              <small>
                Lookup values must come from an existing relationship. The relationship supplies the target object and tenant-safe reference.
              </small>
              <div className="platform-dependent-picklist">
                <label className="platform-checkbox">
                  <input type="checkbox" checked={form.lookupFilter?.active === true} onChange={(event) => updateLookupFilter({ active: event.target.checked })} />
                  <span><strong>Lookup Filter</strong><small>Limit which related records users can choose.</small></span>
                </label>
                {form.lookupFilter?.active ? (
                  <>
                    <label><span>Match</span><select value={form.lookupFilter.match || "all"} onChange={(event) => updateLookupFilter({ match: event.target.value })}><option value="all">ALL conditions</option><option value="any">ANY condition</option></select></label>
                    <label className="platform-checkbox">
                      <input type="checkbox" checked={form.lookupFilter.required !== false} onChange={(event) => updateLookupFilter({ required: event.target.checked })} />
                      <span><strong>Required filter</strong><small>Reject values that do not satisfy the filter.</small></span>
                    </label>
                    {(form.lookupFilter.conditions || []).map((condition, index) => (
                      <div key={`lookup-filter-${index}`} className="platform-field-editor-option">
                        <select value={condition.targetField || ""} onChange={(event) => updateLookupFilterCondition(index, { targetField: event.target.value })}>
                          <option value="">Target field…</option>
                          {lookupTargetFields.map((candidate) => <option key={candidate.apiName} value={candidate.apiName}>{candidate.label} ({candidate.apiName})</option>)}
                        </select>
                        <select value={condition.operator || "equals"} onChange={(event) => updateLookupFilterCondition(index, { operator: event.target.value })}>
                          {["equals","not_equals","greater_than","greater_than_or_equal","less_than","less_than_or_equal","contains","is_empty","is_not_empty"].map((operator) => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}
                        </select>
                        {!["is_empty","is_not_empty"].includes(condition.operator) ? (
                          <>
                            <select value={condition.valueSource || "source_field"} onChange={(event) => updateLookupFilterCondition(index, { valueSource: event.target.value })}>
                              <option value="source_field">Field on this record</option>
                              <option value="literal">Fixed value</option>
                              <option value="user">Current user/session</option>
                            </select>
                            {condition.valueSource === "literal" ? (
                              <input value={condition.value ?? ""} placeholder="Value" onChange={(event) => updateLookupFilterCondition(index, { value: event.target.value })} />
                            ) : condition.valueSource === "user" ? (
                              <select value={condition.userField || "id"} onChange={(event) => updateLookupFilterCondition(index, { userField: event.target.value })}>
                                <option value="id">User ID</option><option value="roleId">Role ID</option><option value="companyId">Company ID</option><option value="storeId">Store ID</option>
                              </select>
                            ) : (
                              <select value={condition.sourceField || ""} onChange={(event) => updateLookupFilterCondition(index, { sourceField: event.target.value })}>
                                <option value="">Source field…</option>
                                {fields.filter((candidate) => candidate.active !== false).map((candidate) => <option key={candidate.api_name} value={candidate.api_name}>{candidate.label} ({candidate.api_name})</option>)}
                              </select>
                            )}
                          </>
                        ) : null}
                        <button type="button" onClick={() => removeLookupFilterCondition(index)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" onClick={addLookupFilterCondition}>Add filter condition</button>
                    <small>Filters can compare a target field with a field on this record, a fixed value, or current user/session context.</small>
                  </>
                ) : null}
              </div>
            </fieldset>
          ) : null}

          {form.field_type === "rollup" && <fieldset className="platform-field-editor-wide">
            <legend>Rollup configuration</legend>
            <label><span>Aggregate</span><select value={form.rollupOperation || "COUNT"} onChange={event => update("rollupOperation", event.target.value)}>{["COUNT", "SUM", "MIN", "MAX", "AVG"].map(operation => <option key={operation} value={operation}>{operation}</option>)}</select></label>
            <label><span>Relationship key</span><input value={form.rollupRelationshipKey || ""} onChange={event => update("rollupRelationshipKey", event.target.value)} placeholder="customer_orders" required /></label>
            <label><span>Child numeric field</span><input value={form.rollupSourceField || ""} onChange={event => update("rollupSourceField", event.target.value)} placeholder="total" required={form.rollupOperation !== "COUNT"} /></label>
            <label><span>Result type</span><select value={form.rollupResultType || "number"} onChange={event => update("rollupResultType", event.target.value)}>{["number", "decimal", "currency"].map(type => <option key={type} value={type}>{type}</option>)}</select></label>
            <small>Values are calculated from related child records and cannot be written directly. Filters are configured through the existing condition format in metadata.</small>
          </fieldset>}

          {form.field_type === "formula" && <>
            <label>
              <span>Formula result type</span>
                <select value={form.resultType} onChange={event => update("resultType", event.target.value)}>
                  {["number", "decimal", "currency", "percent", "text", "url", "time", "boolean", "date", "datetime", "email", "phone", "select", "picklist"].map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="platform-field-editor-wide">
              <span>Formula expression</span>
              <textarea value={form.expression} onChange={event => update("expression", event.target.value)} required maxLength={2000} rows={4} placeholder="ROUND(price * quantity, 2)" />
              <small>Use field API names. Functions: IF, COALESCE, CONCAT, ROUND, ABS, MIN, MAX. Example: CONCAT(name, " - ", sku). Calculated from this record; never stored or editable. Blank inputs and division by zero return blank; use COALESCE for defaults.</small>
            </label>
            <fieldset className="platform-field-editor-wide">
              <legend>Record Paths</legend>
              <label>
                <span>Insert related field</span>
                <select
                  value=""
                  onChange={(event) => {
                    const path = event.target.value;
                    if (!path) return;
                    const prefix = recordPaths.rootObjectKey ? `${recordPaths.rootObjectKey}.` : "";
                    const reference = path.startsWith(prefix) ? path.slice(prefix.length) : path;
                    update("expression", form.expression ? `${form.expression} ${reference}` : reference);
                  }}
                >
                  <option value="">Choose a scalar related field…</option>
                  {recordPaths.items
                    .filter((item) => item.kind === "field" && item.path.split(".").length > 2)
                    .map((item) => <option key={item.path} value={item.path}>{item.path} · {item.label}</option>)}
                </select>
              </label>
              <small>Only scalar lookup/parent paths are accepted when the field is saved. Child collection paths are rejected.</small>
            </fieldset>
            <fieldset className="platform-field-editor-wide">
              <legend>Formula preview</legend>
              {formulaDependencies.map((dependency) => {
                const type = dependency.field_type;
                const value = formulaPreviewValues[dependency.api_name] ?? (type === "boolean" ? false : "");
                const inputType = ["number", "decimal", "currency"].includes(type) ? "number"
                  : type === "date" ? "date"
                    : type === "datetime" ? "datetime-local" : "text";
                return (
                  <label key={dependency.api_name}>
                    <span>{dependency.label} sample value</span>
                    {type === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) => setFormulaPreviewValues((current) => ({ ...current, [dependency.api_name]: event.target.checked }))}
                      />
                    ) : (
                      <input
                        type={inputType}
                        step={inputType === "number" ? "any" : undefined}
                        value={value}
                        onChange={(event) => setFormulaPreviewValues((current) => ({ ...current, [dependency.api_name]: event.target.value }))}
                      />
                    )}
                  </label>
                );
              })}
              {formulaPathReferences.map((path) => (
                <label key={path}>
                  <span>{path} sample value</span>
                  <input
                    value={formulaPathPreviewValues[path] ?? ""}
                    onChange={(event) => setFormulaPathPreviewValues((current) => ({ ...current, [path]: event.target.value }))}
                  />
                </label>
              ))}
              <output className={formulaPreviewError ? "onepos-alert onepos-alert-error" : "onepos-alert"} aria-live="polite">
                {formulaPreviewError
                  ? `Preview unavailable: ${formulaPreviewError}`
                  : `Result: ${formulaPreviewValue === null || formulaPreviewValue === undefined ? "Blank" : String(formulaPreviewValue)}`}
              </output>
            </fieldset>
          </>}

          {conditionEditor("visibilityCondition", "Conditional Visibility")}
          {conditionEditor("requiredCondition", "Conditional Required")}

          {!["formula", "rollup", "auto_number"].includes(form.field_type) ? (
            <fieldset className="platform-field-editor-wide">
              <legend>Field behaviour</legend>
              <label className="platform-field-editor-wide"><span>Help text</span><input value={form.helpText || ""} maxLength={255} onChange={(event) => update("helpText", event.target.value)} placeholder="Guidance shown below the field to users" /></label>
              {!["lookup","address","location","json"].includes(form.field_type) && !(form.dependentPicklist?.controllingField && ["picklist","select","multiselect"].includes(form.field_type)) ? (
                <label><span>Default type</span><select value={form.defaultMode || "static"} onChange={(event) => update("defaultMode", event.target.value)}><option value="static">Static value</option><option value="formula">Formula</option></select></label>
              ) : null}
              {form.defaultMode === "formula" && !["lookup","address","location","json"].includes(form.field_type) && !(form.dependentPicklist?.controllingField && ["picklist","select","multiselect"].includes(form.field_type)) ? (
                <label className="platform-field-editor-wide"><span>Default formula</span><input value={form.defaultFormula || ""} onChange={(event) => update("defaultFormula", event.target.value)} placeholder='Example: IF(store_id == "abc", "priority", "") or ADDDAYS(TODAY(), 7)' /><small>Runs once when a record is created. Available inputs include other supplied/defaulted field API names plus user_id, role_id, company_id and store_id.</small></label>
              ) : form.defaultMode !== "formula" && ["picklist","select"].includes(form.field_type) && !form.dependentPicklist?.controllingField ? (
                <label><span>Default value</span><select value={form.defaultValue ?? ""} onChange={(event) => update("defaultValue", event.target.value)}><option value="">No default</option>{(form.valueSource === "local" ? picklistOptions({ options: form.options }) : picklistOptions(valueSets.find((valueSet) => String(valueSet.id) === String(form.valueSetId || "")) || field)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              ) : form.defaultMode !== "formula" && form.field_type === "multiselect" && !form.dependentPicklist?.controllingField ? (
                <label><span>Default values</span><select multiple size={Math.min(8, Math.max(3, Number(form.multiSelectVisibleLines || 4)))} value={Array.isArray(form.defaultValue) ? form.defaultValue.map(String) : []} onChange={(event) => update("defaultValue", Array.from(event.target.selectedOptions).map((option) => option.value))}>{(form.valueSource === "local" ? picklistOptions({ options: form.options }) : picklistOptions(valueSets.find((valueSet) => String(valueSet.id) === String(form.valueSetId || "")) || field)).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              ) : form.defaultMode !== "formula" && form.field_type === "boolean" ? (
                <label className="platform-checkbox"><input type="checkbox" checked={form.defaultValue === true || form.defaultValue === "true"} onChange={(event) => update("defaultValue", event.target.checked)} /><span><strong>Default checked</strong><small>New records start enabled unless a record type or caller supplies another value.</small></span></label>
              ) : form.defaultMode !== "formula" && !["lookup","address","location","json","multiselect"].includes(form.field_type) ? (
                <label><span>Default value</span><input type={["number","decimal","currency","percent"].includes(form.field_type) ? "number" : form.field_type === "date" ? "date" : form.field_type === "datetime" ? "datetime-local" : form.field_type === "time" ? "time" : "text"} value={form.defaultValue ?? ""} onChange={(event) => update("defaultValue", event.target.value)} /></label>
              ) : null}
              {["text","long_text","rich_text"].includes(form.field_type) ? (
                <label><span>Maximum length</span><input type="number" min={["long_text","rich_text"].includes(form.field_type) ? 256 : 1} max={["long_text","rich_text"].includes(form.field_type) ? 131072 : 255} value={form.maxLength ?? ""} onChange={(event) => update("maxLength", event.target.value)} placeholder={["long_text","rich_text"].includes(form.field_type) ? "32768 default · 256–131072" : "255 default · 1–255"} /></label>
              ) : ["text_area","email","phone","url"].includes(form.field_type) ? (
                <div className="platform-field-editor-wide"><small>{form.field_type === "email" ? "Email fields accept up to 80 characters." : form.field_type === "phone" ? "Phone fields accept up to 40 characters." : "This field accepts up to 255 characters."}</small></div>
              ) : null}
              {["number","decimal","currency","percent"].includes(form.field_type) ? (
                <>
                  <label><span>Precision (total digits)</span><input type="number" min="1" max="18" value={form.precision ?? ""} onChange={(event) => update("precision", event.target.value)} placeholder="Digits" /></label>
                  <label><span>Decimal places</span><input type="number" min="0" max="17" value={form.scale ?? ""} onChange={(event) => update("scale", event.target.value)} placeholder="Scale" /></label>
                </>
              ) : null}
              <label className="platform-checkbox"><input type="checkbox" checked={form.trackHistory === true} onChange={(event) => update("trackHistory", event.target.checked)} /><span><strong>Track History</strong><small>Store field changes in the record history timeline. Leave off for fields that do not need audit history.</small></span></label>
              {["text","number","decimal","email","auto_number"].includes(form.field_type) ? (
                <>
                  <label className="platform-checkbox"><input type="checkbox" checked={form.externalId === true} onChange={(event) => update("externalId", event.target.checked)} /><span><strong>External ID</strong><small>Use this field as an external-system key for Data Loader/API matching. It is not automatically unique.</small></span></label>
                  <label className="platform-checkbox"><input type="checkbox" checked={form.unique === true} onChange={(event) => update("unique", event.target.checked)} /><span><strong>Unique</strong><small>Prevent duplicate values for this field.</small></span></label>
                  {form.unique && ["text","email"].includes(form.field_type) ? <label className="platform-checkbox"><input type="checkbox" checked={form.uniqueCaseSensitive === true} onChange={(event) => update("uniqueCaseSensitive", event.target.checked)} /><span><strong>Case sensitive</strong><small>Treat ABC and abc as different values.</small></span></label> : null}
                </>
              ) : null}
            </fieldset>
          ) : null}

          {!isNew ? (
            <div className="platform-field-editor-wide">
              <WhereUsedPanel
                fieldId={field?.id || field?.field_id}
                title="Where Used"
                onNavigate={onNavigateDependency}
              />
            </div>
          ) : null}

          <label className="platform-field-editor-wide">
            <span>Description</span>
            <textarea
              value={form.description || ""}
              onChange={(event) =>
                update(
                  "description",
                  event.target.value
                )
              }
              rows={3}
              placeholder="Describe what this field represents."
            />
          </label>

          <div className="platform-field-options">
            <label className="platform-checkbox">
              <input
                type="checkbox"
                checked={!["formula", "rollup", "auto_number"].includes(form.field_type) && Boolean(form.required)}
                disabled={["formula", "rollup", "auto_number"].includes(form.field_type)}
                onChange={(event) =>
                  update(
                    "required",
                    event.target.checked
                  )
                }
              />
              <span>
                <strong>Required</strong>
                <small>
                  The field must contain a value.
                </small>
              </span>
            </label>

            <label className="platform-checkbox">
              <input
                type="checkbox"
                checked={form.readable !== false}
                onChange={(event) => update("readable", event.target.checked)}
              />
              <span>
                <strong>Readable</strong>
                <small>Include this field in generic record responses.</small>
              </span>
            </label>

            <label className="platform-checkbox">
              <input
                type="checkbox"
                checked={!["formula", "rollup", "auto_number"].includes(form.field_type) && form.writable !== false}
                disabled={["formula", "rollup", "auto_number"].includes(form.field_type)}
                onChange={(event) => update("writable", event.target.checked)}
              />
              <span>
                <strong>Writable</strong>
                <small>Allow generic record creates and updates to set this field.</small>
              </span>
            </label>

            <label className="platform-checkbox">
              <input
                type="checkbox"
                checked={form.active !== false}
                onChange={(event) =>
                  update(
                    "active",
                    event.target.checked
                  )
                }
              />
              <span>
                <strong>Active</strong>
                <small>
                  Available for normal platform use.
                </small>
              </span>
            </label>
          </div>
        </div>

        <div className="platform-field-editor-footer">
          <button
            type="button"
            className="platform-secondary-button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="platform-primary-button"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Field"}
          </button>
        </div>
      </form>

      <style>{`
        .platform-field-editor {
          padding: 20px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 12px;
          background: var(--card-background, #ffffff);
        }

        .platform-field-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 20px;
        }

        .platform-eyebrow {
          margin-bottom: 5px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          opacity: 0.6;
        }

        .platform-field-editor-header h2 {
          margin: 0;
          font-size: 20px;
        }

        .platform-field-editor-header p {
          margin: 5px 0 0;
          color: var(--text-secondary, #6b7280);
          font-size: 12px;
        }

        .platform-field-editor-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 17px;
        }

        .platform-field-editor-grid > label {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .platform-field-editor-grid > label > span {
          font-size: 12px;
          font-weight: 600;
        }

        .platform-field-editor-grid input,
        .platform-field-editor-grid select,
        .platform-field-editor-grid textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #ffffff);
          color: inherit;
          padding: 9px 10px;
          font: inherit;
          font-size: 13px;
          outline: none;
        }

        .platform-field-editor-grid textarea {
          resize: vertical;
        }

        .platform-field-editor-grid input:focus,
        .platform-field-editor-grid select:focus,
        .platform-field-editor-grid textarea:focus {
          border-color: var(--primary-color, #2563eb);
        }

        .platform-field-editor-grid small {
          color: var(--text-secondary, #6b7280);
          font-size: 10px;
          line-height: 1.4;
        }

        .platform-field-editor-wide {
          grid-column: 1 / -1;
        }

        .platform-field-options {
          grid-column: 1 / -1;
          display: flex;
          gap: 25px;
          padding-top: 4px;
        }

        .platform-checkbox {
          display: flex;
          align-items: flex-start;
          gap: 8px;
        }

        .platform-checkbox input {
          width: auto;
          margin-top: 2px;
        }

        .platform-checkbox strong,
        .platform-checkbox small {
          display: block;
        }

        .platform-checkbox strong {
          font-size: 12px;
        }

        .platform-checkbox small {
          margin-top: 3px;
          color: var(--text-secondary, #6b7280);
          font-size: 10px;
        }

        .platform-field-editor-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 22px;
          padding-top: 17px;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .platform-primary-button,
        .platform-secondary-button {
          border-radius: 8px;
          padding: 9px 14px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .platform-primary-button {
          border: 1px solid var(--primary-color, #2563eb);
          background: var(--primary-color, #2563eb);
          color: #fff;
        }

        .platform-secondary-button {
          border: 1px solid var(--border-color, #d1d5db);
          background: var(--card-background, #fff);
          color: inherit;
        }

        .platform-alert {
          margin-bottom: 15px;
          padding: 11px 13px;
          border-radius: 8px;
          font-size: 12px;
        }

        .platform-alert-error {
          border: 1px solid #fecaca;
          background: #fff7f7;
          color: #991b1b;
        }

        @media (max-width: 700px) {
          .platform-field-editor-grid {
            grid-template-columns: 1fr;
          }

          .platform-field-editor-wide {
            grid-column: auto;
          }

          .platform-field-options {
            flex-direction: column;
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
