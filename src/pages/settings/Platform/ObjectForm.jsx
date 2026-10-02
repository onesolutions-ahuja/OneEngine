import React, { useEffect, useMemo, useRef, useState } from "react";
import { evaluateFieldCondition, evaluatePlatformCondition } from "../../../utils/platformConditions.js";
import { isUuid, parseBooleanValue } from "../../../utils/recordDisplay.js";
import { apiRequest } from "../../../services/api.js";
import BooleanField from "../../../components/records/BooleanField.jsx";

function getFieldKey(field) {
  return (
    field?.apiName ||
    field?.api_name ||
    field?.fieldKey ||
    field?.field_key ||
    field?.name ||
    ""
  );
}

function getFieldLabel(field) {
  return (
    field?.label ||
    field?.name ||
    getFieldKey(field) ||
    "Field"
  );
}

function getFieldType(field) {
  return (
    field?.fieldType ||
    field?.field_type ||
    field?.type ||
    "text"
  );
}

function getFieldOptions(field) {
  const options =
    field?.options ||
    field?.fieldOptions ||
    field?.field_options ||
    field?.choices ||
    [];

  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (
      typeof option === "string" ||
      typeof option === "number"
    ) {
      return {
        value: String(option),
        label: String(option),
      };
    }

    return {
      value:
        option?.value ??
        option?.key ??
        option?.id ??
        "",
      label:
        option?.label ??
        option?.name ??
        option?.value ??
        "",
    };
  });
}

function dependentPicklistConfig(field) {
  const config = field?.config?.dependentPicklist || field?.config?.dependent_picklist;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const controllingField = config.controllingField || config.controlling_field || "";
  const mappings = config.mappings && typeof config.mappings === "object" && !Array.isArray(config.mappings)
    ? config.mappings
    : {};
  return controllingField ? { controllingField, mappings } : null;
}

function getAvailableFieldOptions(field, values) {
  const options = getFieldOptions(field);
  const dependent = dependentPicklistConfig(field);
  if (!dependent) return options;
  const controllingValue = values?.[dependent.controllingField];
  if (controllingValue === null || controllingValue === undefined || controllingValue === "") return [];
  const normalizedController = String(controllingValue);
  return options.filter((option) => {
    const allowed = dependent.mappings?.[String(option.value)];
    return Array.isArray(allowed) && allowed.map(String).includes(normalizedController);
  });
}

function normalizeInitialValue(value, field) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const type = getFieldType(field);

  if (type === "boolean") {
    return parseBooleanValue(value);
  }

  if (
    type === "number" ||
    type === "decimal"
  ) {
    return value;
  }

  return value;
}

function buildInitialValues(fields, initialValues) {
  const result = {
    ...(initialValues || {}),
  };

  for (const field of fields) {
    const key = getFieldKey(field);

    if (!key) {
      continue;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        result,
        key
      )
    ) {
      result[key] = normalizeInitialValue(
        undefined,
        field
      );
    } else {
      result[key] = normalizeInitialValue(
        result[key],
        field
      );
    }
  }

  return result;
}

function lookupObjectKey(field) {
  return field?.config?.relatedObjectKey || field?.config?.related_object_key || "";
}

function lookupRecordLabel(record) {
  if (!record || typeof record !== "object") return "";
  return String(record.label || record.name || record.display_name || record.title || record.full_name || record.username || record.email || record.id || "");
}

function RichTextInput({ value, disabled, onChange, placeholder }) {
  const ref = useRef(null);
  const wrap = (left, right = left) => {
    const input = ref.current;
    if (!input || disabled) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const current = String(value ?? "");
    const selected = current.slice(start, end);
    const next = current.slice(0, start) + left + selected + right + current.slice(end);
    onChange(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + left.length, end + left.length);
    });
  };
  return (
    <div className="platform-rich-text">
      <div className="platform-rich-text-toolbar">
        <button type="button" disabled={disabled} onClick={() => wrap("**")}><strong>B</strong></button>
        <button type="button" disabled={disabled} onClick={() => wrap("_")}><em>I</em></button>
        <button type="button" disabled={disabled} onClick={() => wrap("[", "](https://)")}>Link</button>
      </div>
      <textarea
        ref={ref}
        value={value ?? ""}
        disabled={disabled}
        placeholder={placeholder}
        rows={6}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>Rich text uses safe lightweight formatting: **bold**, _italic_, and [label](https://example.com).</small>
    </div>
  );
}

function AddressInput({ value, disabled, onChange }) {
  const address = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const patch = (key, next) => onChange({ ...address, [key]: next });
  return (
    <div className="platform-structured-grid">
      <input value={address.line1 || ""} disabled={disabled} placeholder="Address line 1" onChange={(event) => patch("line1", event.target.value)} />
      <input value={address.line2 || ""} disabled={disabled} placeholder="Address line 2" onChange={(event) => patch("line2", event.target.value)} />
      <input value={address.city || ""} disabled={disabled} placeholder="City" onChange={(event) => patch("city", event.target.value)} />
      <input value={address.region || ""} disabled={disabled} placeholder="County / Region" onChange={(event) => patch("region", event.target.value)} />
      <input value={address.postcode || ""} disabled={disabled} placeholder="Postcode" onChange={(event) => patch("postcode", event.target.value)} />
      <input value={address.country || ""} disabled={disabled} placeholder="Country" onChange={(event) => patch("country", event.target.value)} />
    </div>
  );
}

function LocationInput({ value, disabled, onChange }) {
  const location = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return (
    <div className="platform-structured-grid platform-location-grid">
      <input type="number" step="any" min="-90" max="90" value={location.latitude ?? location.lat ?? ""} disabled={disabled} placeholder="Latitude" onChange={(event) => onChange({ ...location, latitude: event.target.value === "" ? "" : Number(event.target.value) })} />
      <input type="number" step="any" min="-180" max="180" value={location.longitude ?? location.lng ?? location.lon ?? ""} disabled={disabled} placeholder="Longitude" onChange={(event) => onChange({ ...location, longitude: event.target.value === "" ? "" : Number(event.target.value) })} />
    </div>
  );
}

function MetadataLookupInput({ field, value, disabled, onChange, placeholder }) {
  const objectKey = lookupObjectKey(field);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!objectKey || !open) return undefined;
    let alive = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const suffix = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : "";
        const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records?pageSize=20${suffix}`);
        const rows = response?.records || response?.data || [];
        if (alive) setOptions(Array.isArray(rows) ? rows : []);
      } catch {
        if (alive) setOptions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [objectKey, query, open]);

  if (!objectKey) {
    return (
      <input
        type="text"
        value={typeof value === "object" && value !== null ? lookupRecordLabel(value) : (isUuid(String(value ?? "")) ? "" : value ?? "")}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  const selectedId = typeof value === "object" && value !== null ? (value.id || value.record_id || "") : value;
  const selected = options.find((record) => String(record?.id || record?.record_id || "") === String(selectedId || ""));
  const currentLabel = typeof value === "object" && value !== null ? lookupRecordLabel(value) : (selected ? lookupRecordLabel(selected) : "");

  return (
    <div className="platform-lookup">
      <input
        type="search"
        value={open ? query : currentLabel}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open && !disabled ? (
        <div className="platform-lookup-results" role="listbox">
          {selectedId ? (
            <button type="button" className="platform-lookup-option platform-lookup-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setQuery(""); setOpen(false); }}>
              Clear selection
            </button>
          ) : null}
          {loading ? <div className="platform-lookup-state">Searching…</div> : null}
          {!loading && options.map((record) => {
            const id = record?.id || record?.record_id;
            if (!id) return null;
            return (
              <button
                type="button"
                className="platform-lookup-option"
                role="option"
                aria-selected={String(id) === String(selectedId || "")}
                key={String(id)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <strong>{lookupRecordLabel(record)}</strong>
                <span>{String(id)}</span>
              </button>
            );
          })}
          {!loading && !options.length ? <div className="platform-lookup-state">No matching records.</div> : null}
        </div>
      ) : null}
      {selectedId && !currentLabel && !open ? <small className="platform-lookup-selected">Selected record</small> : null}
    </div>
  );
}

function getInputType(field) {
  const type = getFieldType(field);

  switch (type) {
    case "email":
      return "email";

    case "phone":
      return "tel";

    case "url":
      return "url";

    case "number":
    case "decimal":
      return "number";

    case "date":
      return "date";

    case "datetime":
      return "datetime-local";

    default:
      return "text";
  }
}

export default function ObjectForm({
  fields = [],
  initialValues = {},
  onChange,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  readOnly = false,
  loading = false,
  error = "",
  title = "",
  description = "",
  embedded = false,
  conditionFields = null,
  contextValues = null,
  formId,
  showActions = true,
  sections = null,
}) {
  const Container = embedded ? "div" : "form";
  const activeFields = useMemo(
    () => (Array.isArray(fields) ? fields.filter((field) => field?.active !== false) : []),
    [fields]
  );
  const initialValuesKey = useMemo(
    () => JSON.stringify(initialValues || {}),
    [initialValues]
  );

  const [values, setValues] = useState(() =>
    buildInitialValues(
      activeFields,
      initialValues
    )
  );

  const [validationErrors, setValidationErrors] =
    useState({});
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      buildInitialValues(
        activeFields,
        initialValues
      )
    );

    setValidationErrors({});
  }, [
    activeFields,
    initialValuesKey,
  ]);

  const visibleFields = useMemo(
    () =>
      activeFields.filter((field) => {
        try {
          return evaluateFieldCondition(field, "visibilityCondition", conditionFields || activeFields, values, contextValues);
        } catch {
          return false;
        }
      }),
    [activeFields, values, conditionFields, contextValues]
  );
  const visibleFieldKeys = useMemo(() => new Set(visibleFields.map(getFieldKey)), [visibleFields]);
  const visibleSections = useMemo(
    () => (Array.isArray(sections) ? sections
      .filter((section) => evaluatePlatformCondition(section?.visibilityCondition, conditionFields || activeFields, { ...contextValues, record: values }))
      .map((section) => ({
        ...section,
        fields: (section.fields || []).filter((field) => visibleFieldKeys.has(getFieldKey(field))),
      }))
      .filter((section) => section.fields.length) : []),
    [sections, visibleFieldKeys, conditionFields, activeFields, contextValues, values]
  );

  function updateValue(field, value) {
    const key = getFieldKey(field);

    if (!key || readOnly) {
      return;
    }

    const nextValues = {
      ...values,
      [key]: value,
    };

    for (const candidate of activeFields) {
      const dependent = dependentPicklistConfig(candidate);
      if (!dependent || dependent.controllingField !== key) continue;
      const dependentKey = getFieldKey(candidate);
      const currentDependentValue = nextValues[dependentKey];
      if (currentDependentValue === null || currentDependentValue === undefined || currentDependentValue === "") continue;
      const allowed = getAvailableFieldOptions(candidate, nextValues).some((option) => String(option.value) === String(currentDependentValue));
      if (!allowed) nextValues[dependentKey] = "";
    }

    setValues(nextValues);

    setValidationErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const next = {
        ...current,
      };

      delete next[key];

      return next;
    });

    onChange?.(
      nextValues,
      field,
      value
    );
  }

  function validate() {
    const errors = {};

    for (const field of activeFields) {
      const key = getFieldKey(field);

      if (!key) {
        continue;
      }

      let conditionallyRequired = false;
      try {
        conditionallyRequired = Boolean(field?.config?.requiredCondition) &&
          evaluateFieldCondition(field, "requiredCondition", activeFields, values, contextValues);
      } catch {
        conditionallyRequired = false;
      }
      if ((!field?.required && !conditionallyRequired) || getFieldType(field) === "formula") {
        continue;
      }

      const value = values[key];

      const empty =
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) &&
          value.length === 0);

      if (empty) {
        errors[key] =
          `${getFieldLabel(field)} is required.`;
      }
    }

    setValidationErrors(errors);

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (readOnly || loading || submitting) {
      return;
    }

    if (!validate()) {
      return;
    }

    setSaveError("");
    setSubmitting(true);
    try {
      const formulaKeys = new Set(activeFields.filter(field => getFieldType(field) === "formula").map(getFieldKey));
      await onSubmit?.(Object.fromEntries(Object.entries(values).filter(([key]) => !formulaKeys.has(key))));
    } catch (err) {
      setSaveError(err?.message || "Unable to save record.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderField(field) {
    const key = getFieldKey(field);

    if (!key) {
      return null;
    }

    const label = getFieldLabel(field);
    const type = getFieldType(field);
    const value =
      values[key] ??
      (type === "boolean" ? false : "");

    const fieldError =
      validationErrors[key];

    const commonProps = {
      id: `platform-field-${key}`,
      name: key,
      disabled: readOnly || field.writable === false || loading || submitting,
      "aria-invalid": Boolean(fieldError),
      "aria-describedby": fieldError
        ? `platform-error-${key}`
        : undefined,
    };

    let control;

    switch (type) {
      case "formula":
        control = <output id={`platform-field-${key}`} aria-label={`${label} (calculated)`}>{value === "" ? "Calculated on save" : String(value)}</output>;
        break;
      case "boolean":
        /* THE global boolean renderer — the same shared toggle everywhere,
           never a page-specific checkbox or Yes/No dropdown. */
        control = (
          <div className="platform-form-toggle">
            <BooleanField
              value={parseBooleanValue(value)}
              onChange={(next) => updateValue(field, next)}
              mode="edit"
              disabled={readOnly || field.writable === false || loading || submitting}
              label={field?.checkboxLabel || label}
            />
            <span className="platform-form-toggle-label">
              {field?.checkboxLabel || `Enable ${label}`}
              {field?.required || field?.config?.requiredCondition ? <span className="platform-form-required"> *</span> : null}
            </span>
          </div>
        );

        break;

      case "rich_text":
        control = (
          <RichTextInput
            value={value}
            disabled={commonProps.disabled}
            placeholder={field?.placeholder || ""}
            onChange={(nextValue) => updateValue(field, nextValue)}
          />
        );
        break;

      case "address":
        control = <AddressInput value={value} disabled={commonProps.disabled} onChange={(nextValue) => updateValue(field, nextValue)} />;
        break;

      case "location":
        control = <LocationInput value={value} disabled={commonProps.disabled} onChange={(nextValue) => updateValue(field, nextValue)} />;
        break;

      case "auto_number":
        control = <output id={commonProps.id}>{value || "Generated on save"}</output>;
        break;

      case "time":
        control = (
          <input
            {...commonProps}
            type="time"
            value={value ?? ""}
            onChange={(event) => updateValue(field, event.target.value)}
          />
        );
        break;

      case "url":
        control = (
          <input
            {...commonProps}
            type="url"
            value={value ?? ""}
            placeholder={field?.placeholder || "https://"}
            onChange={(event) => updateValue(field, event.target.value)}
          />
        );
        break;

      case "json":
        control = (
          <textarea
            {...commonProps}
            value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
            rows={6}
            onChange={(event) => {
              try { updateValue(field, JSON.parse(event.target.value)); } catch { /* keep editing until valid JSON */ }
            }}
          />
        );
        break;

      case "long_text":
        control = (
          <textarea
            {...commonProps}
            value={value}
            rows={4}
            placeholder={
              field?.placeholder || ""
            }
            onChange={(event) =>
              updateValue(
                field,
                event.target.value
              )
            }
          />
        );

        break;

      case "select":
      case "picklist": {
        const options =
          getAvailableFieldOptions(field, values);

        control = (
          <select
            {...commonProps}
            value={value}
            onChange={(event) =>
              updateValue(
                field,
                event.target.value
              )
            }
          >
            <option value="">
              Select {label}
            </option>

            {options.map((option) => (
              <option
                key={String(option.value)}
                value={String(option.value)}
              >
                {option.label}
              </option>
            ))}
          </select>
        );

        break;
      }

      case "lookup":
        control = (
          <MetadataLookupInput
            field={field}
            value={value}
            disabled={commonProps.disabled}
            placeholder={field?.placeholder || `Search ${label}…`}
            onChange={(nextValue) => updateValue(field, nextValue)}
          />
        );

        break;

      default:
        control = (
          <input
            {...commonProps}
            type={getInputType(field)}
            value={value}
            step={
              type === "decimal"
                ? "any"
                : undefined
            }
            placeholder={
              field?.placeholder || ""
            }
            onChange={(event) => {
              let nextValue =
                event.target.value;

              if (
                type === "number" ||
                type === "decimal"
              ) {
                if (nextValue === "") {
                  updateValue(
                    field,
                    ""
                  );
                } else {
                  updateValue(
                    field,
                    Number(nextValue)
                  );
                }

                return;
              }

              updateValue(
                field,
                nextValue
              );
            }}
          />
        );
    }

    return (
      <div
        className={`platform-form-field${
          fieldError
            ? " has-error"
            : ""
        }${
          field.__spanAll || field?.layoutWidth === "full"
            ? " onepos-form-span"
            : ""
        }`}
        key={
          field?.id ||
          key
        }
      >
        {type !== "boolean" ? (
          <label
            htmlFor={`platform-field-${key}`}
          >
            {label}

            {field?.required || field?.config?.requiredCondition ? (
              <span className="platform-form-required">
                *
              </span>
            ) : null}
          </label>
        ) : null}

        {control}

        {field?.description ? (
          <div className="platform-form-help">
            {field.description}
          </div>
        ) : null}

        {fieldError ? (
          <div
            id={`platform-error-${key}`}
            className="platform-form-error"
          >
            {fieldError}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Container
      id={formId}
      className="platform-object-form"
      onSubmit={embedded ? undefined : handleSubmit}
      noValidate={embedded ? undefined : true}
    >
      {(title || description) && (
        <div className="platform-form-header">
          {title ? (
            <h3>{title}</h3>
          ) : null}

          {description ? (
            <p>{description}</p>
          ) : null}
        </div>
      )}

      {error || saveError ? (
        <div
          className="platform-form-server-error"
          role="alert"
        >
          {error || saveError}
        </div>
      ) : null}

      {visibleFields.length === 0 ? (
        <div className="platform-form-empty">
          <strong>No active fields</strong>

          <span>
            Configure active metadata fields
            for this object before using the
            form.
          </span>
        </div>
      ) : visibleSections.length ? visibleSections.map((section) => (
          <section className="platform-form-section" key={section.id}>
            {section.label ? <h3 className="platform-form-section-title">{section.label}</h3> : null}
            {section.description ? <p className="platform-form-section-description">{section.description}</p> : null}
            <div className="platform-form-grid" style={{ "--platform-form-columns": Math.min(3, Math.max(1, Number(section.columns) || 1)) }}>
              {section.fields.map(renderField)}
            </div>
          </section>
        )) : (
          <div className="platform-form-grid">
            {visibleFields.map(renderField)}
          </div>
        )}

      {!embedded && !readOnly && visibleFields.length > 0 ? (
        <div className="platform-form-actions">
          {onCancel ? (
            <button
              type="button"
              className="platform-form-cancel"
              onClick={onCancel}
              disabled={loading || submitting}
            >
              {cancelLabel}
            </button>
          ) : null}

          {onSubmit && showActions ? (
            <button
              type="submit"
              className="platform-form-submit"
              disabled={loading || submitting}
            >
              {loading || submitting
                ? "Saving..."
                : submitLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <style>{`
        .platform-object-form {
          width: 100%;
          min-width: 0;
        }

        .platform-form-header {
          margin-bottom: 18px;
        }

        .platform-form-header h3 {
          margin: 0;
          color: var(--text-primary, #1f2937);
          font-size: 16px;
        }

        .platform-form-header p {
          margin: 5px 0 0;
          color: var(--text-secondary, #6b7280);
          font-size: 11px;
          line-height: 1.5;
        }

        .platform-form-server-error {
          margin-bottom: 14px;
          padding: 10px 12px;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fff7f7;
          color: #991b1b;
          font-size: 11px;
        }

        /* The 3/2/1 responsive field grid lives in the SHARED stylesheet
           (index.css → .platform-form-grid), so every metadata form renders
           with the same desktop-3 / tablet-2 / mobile-1 rhythm and wide
           fields span via .onepos-form-span. */
        .platform-form-grid {
          display: grid;
          grid-template-columns: repeat(var(--platform-form-columns, 3), minmax(0, 1fr));
          gap: 16px 18px;
        }

        .platform-form-section + .platform-form-section { margin-top: 22px; }
        .platform-form-section-title {
          margin: 0 0 12px;
          padding-bottom: 7px;
          border-bottom: 1px solid var(--border-color, #e5e7eb);
          color: var(--text-primary, #1f2937);
          font-size: 13px;
          font-weight: 700;
        }
        .platform-form-section-description {
          margin: -6px 0 12px;
          color: var(--text-secondary, #6b7280);
          font-size: 11px;
          line-height: 1.45;
        }

        .platform-form-field {
          min-width: 0;
        }

        .platform-form-field.has-error input,
        .platform-form-field.has-error select,
        .platform-form-field.has-error textarea {
          border-color: #dc2626;
        }

        .platform-form-field > label {
          display: block;
          margin-bottom: 6px;
          color: var(--text-primary, #374151);
          font-size: 10px;
          font-weight: 700;
        }

        .platform-form-required {
          margin-left: 3px;
          color: #dc2626;
        }

        .platform-form-field input,
        .platform-form-field select,
        .platform-form-field textarea {
          box-sizing: border-box;
          width: 100%;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 7px;
          background: var(--card-background, #fff);
          color: var(--text-primary, #1f2937);
          padding: 9px 10px;
          outline: none;
          font-family: inherit;
          font-size: 11px;
        }

        .platform-rich-text { display:grid; gap:6px; }
        .platform-rich-text-toolbar { display:flex; gap:4px; }
        .platform-rich-text-toolbar button { border:1px solid var(--border-color,#d1d5db); border-radius:6px; background:var(--card-background,#fff); padding:4px 7px; font-size:10px; cursor:pointer; }
        .platform-rich-text small { color:var(--text-secondary,#64748b); font-size:9px; }
        .platform-structured-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
        .platform-structured-grid > :first-child,.platform-structured-grid > :nth-child(2) { grid-column:1 / -1; }
        .platform-location-grid > * { grid-column:auto !important; }
        @media(max-width:640px){ .platform-structured-grid { grid-template-columns:1fr; } .platform-structured-grid > * { grid-column:auto !important; } }

        .platform-form-field textarea {
          min-height: 90px;
          resize: vertical;
          line-height: 1.45;
        }

        .platform-lookup {
          position: relative;
        }

        .platform-lookup-results {
          position: absolute;
          z-index: 40;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          max-height: 260px;
          overflow: auto;
          border: 1px solid var(--border-color, #d1d5db);
          border-radius: 8px;
          background: var(--card-background, #fff);
          box-shadow: 0 12px 28px rgba(15, 23, 42, .14);
        }

        .platform-lookup-option {
          display: flex;
          width: 100%;
          flex-direction: column;
          gap: 2px;
          border: 0;
          border-bottom: 1px solid var(--border-color, #eef2f7);
          background: transparent;
          padding: 9px 10px;
          color: var(--text-primary, #1f2937);
          text-align: left;
          cursor: pointer;
        }

        .platform-lookup-option:hover,
        .platform-lookup-option[aria-selected="true"] {
          background: var(--muted-background, #f8fafc);
        }

        .platform-lookup-option strong {
          font-size: 11px;
          font-weight: 650;
        }

        .platform-lookup-option span,
        .platform-lookup-state,
        .platform-lookup-selected {
          color: var(--text-secondary, #64748b);
          font-size: 9px;
        }

        .platform-lookup-clear {
          color: var(--text-secondary, #64748b);
        }

        .platform-lookup-state {
          padding: 10px;
        }

        .platform-lookup-selected {
          display: block;
          margin-top: 4px;
        }

        .platform-form-field input:focus,
        .platform-form-field select:focus,
        .platform-form-field textarea:focus {
          border-color: #9ca3af;
        }

        .platform-form-field
          input:disabled,
        .platform-form-field
          select:disabled,
        .platform-form-field
          textarea:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .platform-form-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 38px;
        }

        .platform-form-toggle-label {
          color: var(--text-primary, #374151);
          font-size: 11px;
        }

        .platform-form-help {
          margin-top: 5px;
          color: var(--text-secondary, #9ca3af);
          font-size: 9px;
          line-height: 1.4;
        }

        .platform-form-error {
          margin-top: 4px;
          color: #dc2626;
          font-size: 9px;
        }

        .platform-form-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          min-height: 140px;
          padding: 25px;
          border: 1px dashed var(--border-color, #d1d5db);
          border-radius: 9px;
          color: var(--text-secondary, #6b7280);
          text-align: center;
          font-size: 10px;
        }

        .platform-form-empty strong {
          color: var(--text-primary, #374151);
          font-size: 12px;
        }

        .platform-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid var(--border-color, #e5e7eb);
        }

        .platform-form-actions button {
          border-radius: 7px;
          padding: 8px 13px;
          min-height: 36px;
          font-family: inherit;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .platform-form-cancel {
          border: 1px solid var(--border-color, #d1d5db);
          background: var(--card-background, #fff);
          color: var(--text-primary, #374151);
        }

        .platform-form-submit {
          border: 1px solid #374151;
          background: #374151;
          color: #fff;
        }

        .platform-form-actions button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        @media (max-width: 760px) {
          .platform-form-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .platform-form-grid {
            grid-template-columns: 1fr;
          }
          .platform-form-actions {
            flex-wrap: wrap;
          }
        }
      `}</style>
    </Container>
  );
}
