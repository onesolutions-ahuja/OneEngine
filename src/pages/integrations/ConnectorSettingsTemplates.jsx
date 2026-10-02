import { Pencil, Save, X } from "lucide-react";

function Shell({ children, title, description, status, actions, className = "" }) {
  return (
    <section className={`connector-settings-template ${className}`}>
      <header className="connector-settings-template-head">
        <div className="connector-settings-template-copy">
          <div className="connector-settings-template-title-row">
            <h2>{title}</h2>
            {status ? <span className={`connector-settings-status ${status.tone || ""}`}>{status.label}</span> : null}
          </div>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="connector-settings-template-head-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function ConnectorSettingsCompact(props) {
  return <Shell {...props} className="connector-settings-template--compact" />;
}

export function ConnectorSettingsSplit(props) {
  return <Shell {...props} className="connector-settings-template--split" />;
}

export function ConnectorSettingsModeActions({ mode, onEdit, onCancel, saving }) {
  if (mode === "view") {
    return (
      <button type="button" className="connector-settings-edit-button" onClick={onEdit}>
        <Pencil size={14} /> Edit
      </button>
    );
  }
  return null;
}

export function ConnectorSettingsFooter({ mode, onCancel, saving, submitLabel = "Save changes" }) {
  if (mode === "view") return null;
  return (
    <footer className="connector-settings-template-footer">
      {mode === "edit" ? (
        <button type="button" className="connector-settings-secondary-button" onClick={onCancel} disabled={saving}>
          <X size={14} /> Cancel
        </button>
      ) : null}
      <button type="submit" className="connector-settings-primary-button" disabled={saving}>
        <Save size={14} /> {saving ? "Saving…" : submitLabel}
      </button>
    </footer>
  );
}

export function ConnectorFieldHelp({ description, helpUrl, helpLabel }) {
  if (!description && !helpUrl) return null;
  return (
    <div className="connector-field-help">
      {description ? <span>{description}</span> : null}
      {helpUrl ? (
        <a href={helpUrl} target="_blank" rel="noreferrer">
          {helpLabel || helpUrl}
        </a>
      ) : null}
    </div>
  );
}
