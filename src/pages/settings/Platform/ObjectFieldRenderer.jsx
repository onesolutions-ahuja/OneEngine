import React, { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import BooleanField from "../../../components/records/BooleanField.jsx";
import { formatRecordDisplayValue, isUuid, parseBooleanValue } from "../../../utils/recordDisplay.js";

function getFieldType(field) {
  if ((field?.fieldType || field?.field_type) === "formula") return field?.config?.resultType || "text";
  return (
    field?.fieldType ||
    field?.field_type ||
    field?.type ||
    "text"
  );
}

function getFieldLabel(field) {
  return (
    field?.label ||
    field?.name ||
    field?.apiName ||
    field?.api_name ||
    "Field"
  );
}

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

function formatValue(value, field) {
  return formatRecordDisplayValue(value, field);
}

function richTextNodes(value) {
  const text = String(value ?? "");
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function structuredDisplay(value, type) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "—";
  if (type === "location") {
    const lat = value.latitude ?? value.lat;
    const lng = value.longitude ?? value.lng ?? value.lon;
    return lat === undefined || lng === undefined ? "—" : `${lat}, ${lng}`;
  }
  if (type === "address") {
    return [value.line1, value.line2, value.city, value.region, value.postcode, value.country].filter(Boolean).join(", ") || "—";
  }
  return JSON.stringify(value);
}

export default function ObjectFieldRenderer({
  field,
  value,
  mode = "display",
  onChange,
  disabled = false,
  error = "",
  placeholder = "",
  className = "",
}) {
  const fieldType = getFieldType(field);
  const label = getFieldLabel(field);
  const fieldKey = getFieldKey(field);
  const [lookupOptions, setLookupOptions] = useState([]);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    const targetKey = field?.config?.relatedObjectKey || field?.config?.related_object_key;
    if (mode === "display" || fieldType !== "lookup" || !targetKey) return;
    let active = true;
    apiRequest(`/api/platform/objects/${encodeURIComponent(targetKey)}/records?limit=100`)
      .then((response) => {
        if (!active) return;
        const records = response?.records || response?.data?.records || response?.data || [];
        setLookupOptions(Array.isArray(records) ? records : []);
      })
      .catch((error) => {
        if (active) setLookupError(error?.message || "Unable to load lookup records.");
      });
    return () => { active = false; };
  }, [fieldType, field?.config?.relatedObjectKey, field?.config?.related_object_key, mode]);

  if (!fieldKey) {
    return null;
  }

  if (mode === "display" || (field?.fieldType || field?.field_type) === "formula") {
    /* Boolean display uses THE global read-only toggle (same design language
       as the editable control); everything else formats to text. */
    if (fieldType === "rich_text") {
      return (
        <div className={`platform-field-renderer platform-field-display ${className}`}>
          <div className="platform-field-display-label">{label}</div>
          <div className="platform-field-display-value platform-rich-display">{richTextNodes(value)}</div>
        </div>
      );
    }
    if (["address", "location", "json"].includes(fieldType)) {
      return (
        <div className={`platform-field-renderer platform-field-display ${className}`}>
          <div className="platform-field-display-label">{label}</div>
          <div className="platform-field-display-value">{structuredDisplay(value, fieldType)}</div>
        </div>
      );
    }
    if (fieldType === "url" && value) {
      return (
        <div className={`platform-field-renderer platform-field-display ${className}`}>
          <div className="platform-field-display-label">{label}</div>
          <div className="platform-field-display-value"><a href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a></div>
        </div>
      );
    }
    if (fieldType === "boolean" && (field?.fieldType || field?.field_type) !== "formula") {
      return (
        <div className={`platform-field-renderer platform-field-display ${className}`}>
          <div className="platform-field-display-label">{label}</div>
          <div className="platform-field-display-value">
            <BooleanField value={parseBooleanValue(value)} mode="display" label={label} />
          </div>
        </div>
      );
    }
    return (
      <div
        className={`platform-field-renderer platform-field-display ${className}`}
      >
        <div className="platform-field-display-label">
          {label}
        </div>

        <div className="platform-field-display-value">
          {formatValue(value, field)}
        </div>

        <style>{`
          .platform-field-display {
            min-width: 0;
          }

          .platform-field-display-label {
            margin-bottom: 5px;
            color: var(
              --text-secondary,
              #6b7280
            );
            font-size: 9px;
            font-weight: 700;
          }

          .platform-field-display-value {
            min-height: 20px;
            color: var(
              --text-primary,
              #1f2937
            );
            font-size: 11px;
            line-height: 1.45;
            word-break: break-word;
            white-space: pre-wrap;
          }
        `}</style>
      </div>
    );
  }

  function handleChange(nextValue) {
    onChange?.(
      nextValue,
      field
    );
  }

  let control;

  switch (fieldType) {
    case "boolean":
      /* THE global boolean renderer — one shared toggle everywhere. */
      control = (
        <div className="platform-form-toggle">
          <BooleanField
            value={parseBooleanValue(value)}
            onChange={(next) => handleChange(next)}
            mode="edit"
            disabled={disabled}
            label={field?.checkboxLabel || label}
          />
          <span className="platform-form-toggle-label">{field?.checkboxLabel || label}</span>
        </div>
      );

      break;

    case "rich_text":
      control = (
        <textarea
          value={value ?? ""}
          disabled={disabled}
          placeholder={placeholder}
          rows={6}
          onChange={(event) => handleChange(event.target.value)}
        />
      );
      break;

    case "address": {
      const address = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const patch = (key, next) => handleChange({ ...address, [key]: next });
      control = (
        <div className="platform-structured-grid">
          <input value={address.line1 || ""} disabled={disabled} placeholder="Address line 1" onChange={(event) => patch("line1", event.target.value)} />
          <input value={address.line2 || ""} disabled={disabled} placeholder="Address line 2" onChange={(event) => patch("line2", event.target.value)} />
          <input value={address.city || ""} disabled={disabled} placeholder="City" onChange={(event) => patch("city", event.target.value)} />
          <input value={address.region || ""} disabled={disabled} placeholder="County / Region" onChange={(event) => patch("region", event.target.value)} />
          <input value={address.postcode || ""} disabled={disabled} placeholder="Postcode" onChange={(event) => patch("postcode", event.target.value)} />
          <input value={address.country || ""} disabled={disabled} placeholder="Country" onChange={(event) => patch("country", event.target.value)} />
        </div>
      );
      break;
    }

    case "location": {
      const location = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      control = (
        <div className="platform-structured-grid platform-location-grid">
          <input type="number" step="any" min="-90" max="90" value={location.latitude ?? location.lat ?? ""} disabled={disabled} placeholder="Latitude" onChange={(event) => handleChange({ ...location, latitude: event.target.value === "" ? "" : Number(event.target.value) })} />
          <input type="number" step="any" min="-180" max="180" value={location.longitude ?? location.lng ?? location.lon ?? ""} disabled={disabled} placeholder="Longitude" onChange={(event) => handleChange({ ...location, longitude: event.target.value === "" ? "" : Number(event.target.value) })} />
        </div>
      );
      break;
    }

    case "auto_number":
      control = <output>{value || "Generated on save"}</output>;
      break;

    case "time":
      control = <input type="time" value={value ?? ""} disabled={disabled} onChange={(event) => handleChange(event.target.value)} />;
      break;

    case "json":
      control = <textarea value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)} disabled={disabled} rows={6} onChange={(event) => { try { handleChange(JSON.parse(event.target.value)); } catch {} }} />;
      break;

    case "long_text":
      control = (
        <textarea
          value={value ?? ""}
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "number":
    case "decimal":
    case "currency":
    case "percent":
      control = (
        <input
          type="number"
          value={value ?? ""}
          disabled={disabled}
          placeholder={placeholder}
          step={
            ["decimal", "percent"].includes(fieldType)
              ? "any"
              : "1"
          }
          onChange={(event) => {
            const nextValue =
              event.target.value;

            if (nextValue === "") {
              handleChange("");
              return;
            }

            handleChange(
              Number(nextValue)
            );
          }}
        />
      );

      break;

    case "date":
      control = (
        <input
          type="date"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "datetime":
      control = (
        <input
          type="datetime-local"
          value={value ?? ""}
          disabled={disabled}
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "email":
      control = (
        <input
          type="email"
          value={value ?? ""}
          disabled={disabled}
          placeholder={
            placeholder ||
            `Enter ${label}`
          }
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "phone":
      control = (
        <input
          type="tel"
          value={value ?? ""}
          disabled={disabled}
          placeholder={
            placeholder ||
            `Enter ${label}`
          }
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "url":
      control = (
        <input
          type="url"
          value={value ?? ""}
          disabled={disabled}
          placeholder={
            placeholder ||
            `Enter ${label}`
          }
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "lookup":
      control = lookupOptions.length ? (
        <select value={typeof value === "object" ? value?.id ?? "" : value ?? ""} disabled={disabled} onChange={(event) => handleChange(event.target.value)}>
          <option value="">Select {label}</option>
          {lookupOptions.map((record) => {
            const recordId = record?.id ?? record?.record_id;
            const recordLabel = record?.label ?? record?.name ?? record?.display_name ?? record?.title ?? "Record";
            return <option key={String(recordId)} value={String(recordId)}>{String(recordLabel)}</option>;
          })}
        </select>
      ) : (
        <input
          type="text"
          value={
            typeof value === "object" &&
            value !== null
              ? value?.label ??
                value?.name ??
              value?.display_name ??
              value?.value ??
              ""
            : isUuid(String(value ?? "")) ? "" : value ?? ""
          }
          disabled={disabled}
          placeholder={
            placeholder ||
            `Select ${label}`
          }
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );

      break;

    case "select":
    case "picklist": {
      const options = Array.isArray(field?.options) ? field.options : [];
      control = (
        <select value={value ?? ""} disabled={disabled} onChange={(event) => handleChange(event.target.value)}>
          <option value="">Select {label}</option>
          {options.map((option) => {
            const optionValue = typeof option === "object" ? option.value ?? option.key ?? option.label : option;
            const optionLabel = typeof option === "object" ? option.label ?? option.name ?? optionValue : option;
            return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>;
          })}
        </select>
      );
      break;
    }

    case "multiselect": {
      const options = Array.isArray(field?.options) ? field.options : [];
      const selected = Array.isArray(value) ? value : [];
      control = (
        <select multiple value={selected.map(String)} disabled={disabled} onChange={(event) => handleChange(Array.from(event.target.selectedOptions, (option) => option.value))}>
          {options.map((option) => {
            const optionValue = typeof option === "object" ? option.value ?? option.key ?? option.label : option;
            const optionLabel = typeof option === "object" ? option.label ?? option.name ?? optionValue : option;
            return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>;
          })}
        </select>
      );
      break;
    }

    default:
      control = (
        <input
          type="text"
          value={value ?? ""}
          disabled={disabled}
          placeholder={
            placeholder ||
            `Enter ${label}`
          }
          onChange={(event) =>
            handleChange(
              event.target.value
            )
          }
        />
      );
  }

  return (
    <div
      className={`platform-field-renderer platform-field-editor ${className}`}
    >
      <label>
        {label}

        {field?.required ? (
          <span className="platform-field-required">
            *
          </span>
        ) : null}
      </label>

      {control}

      {field?.description ? (
        <div className="platform-field-help">
          {field.description}
        </div>
      ) : null}

      {error ? (
        <div className="platform-field-error">
          {error}
        </div>
      ) : null}
      {lookupError ? (
        <div className="platform-field-error">
          {lookupError}
        </div>
      ) : null}

      <style>{`
        .platform-field-editor {
          min-width: 0;
        }

        .platform-field-editor > label {
          display: block;
          margin-bottom: 6px;
          color: var(
            --text-primary,
            #374151
          );
          font-size: 10px;
          font-weight: 700;
        }

        .platform-field-required {
          margin-left: 3px;
          color: #dc2626;
        }

        .platform-field-editor input,
        .platform-field-editor textarea,
        .platform-field-editor select {
          box-sizing: border-box;
          width: 100%;
          border: 1px solid var(
            --border-color,
            #d1d5db
          );
          border-radius: 7px;
          background: var(
            --card-background,
            #fff
          );
          color: var(
            --text-primary,
            #1f2937
          );
          padding: 9px 10px;
          outline: none;
          font-family: inherit;
          font-size: 11px;
        }

        .platform-field-editor textarea {
          min-height: 90px;
          resize: vertical;
          line-height: 1.45;
        }

        .platform-field-editor
          input:focus,
        .platform-field-editor
          textarea:focus,
        .platform-field-editor
          select:focus {
          border-color: #9ca3af;
        }

        .platform-field-editor
          input:disabled,
        .platform-field-editor
          textarea:disabled,
        .platform-field-editor
          select:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .platform-structured-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:6px;
        }
        .platform-structured-grid > :first-child,
        .platform-structured-grid > :nth-child(2) { grid-column:1 / -1; }
        .platform-location-grid > * { grid-column:auto !important; }
        .platform-rich-display { white-space:pre-wrap; }
        @media(max-width:640px){ .platform-structured-grid { grid-template-columns:1fr; } .platform-structured-grid > * { grid-column:auto !important; } }

        .platform-field-checkbox {
          display: flex !important;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          box-sizing: border-box;
          padding: 8px 10px;
          border: 1px solid var(
            --border-color,
            #d1d5db
          );
          border-radius: 7px;
          background: var(
            --card-background,
            #fff
          );
          cursor: pointer;
        }

        .platform-field-checkbox
          input {
          width: auto;
          margin: 0;
        }

        .platform-field-checkbox
          span {
          color: var(
            --text-primary,
            #374151
          );
          font-size: 11px;
        }

        .platform-field-help {
          margin-top: 5px;
          color: var(
            --text-secondary,
            #9ca3af
          );
          font-size: 9px;
          line-height: 1.4;
        }

        .platform-field-error {
          margin-top: 4px;
          color: #dc2626;
          font-size: 9px;
        }
      `}</style>
    </div>
  );
}
