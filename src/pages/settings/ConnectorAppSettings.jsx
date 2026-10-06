import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import { loadRuntimeSurface, runtimeEndpoint, surfacePath } from "../../services/runtimeSurface.js";
import { catalogAppForNavigation, readMarketplaceCache } from "../../utils/appMarketplace.js";
import ConnectorInstancesPanel from "../integrations/ConnectorInstancesPanel.jsx";

function defaultTitle(packageKey) {
  return String(packageKey || "Connector").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FieldControl({ field, value, disabled, onChange }) {
  if (field?.type === "boolean") {
    return <input type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />;
  }
  return <input type={field?.type === "secret" ? "password" : "text"} value={value ?? ""} disabled={disabled} placeholder={field?.placeholder || ""} onChange={(event) => onChange(event.target.value)} />;
}

function readonlyValue(item, form) {
  const value = surfacePath(form, item?.path || item?.key, null);
  if (item?.type === "boolean") return value === true ? "Yes" : "No";
  return value == null || value === "" ? "—" : String(value);
}

export default function ConnectorAppSettings({ packageKey, onBack }) {
  const cachedItem = useMemo(() => catalogAppForNavigation(readMarketplaceCache(), packageKey), [packageKey]);
  const [surface, setSurface] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    loadRuntimeSurface(packageKey, "connectorSettings")
      .then(async (nextSurface) => {
        if (!live) return;
        setSurface(nextSurface);
        const loadEndpoint = runtimeEndpoint(nextSurface, "load");
        if (!loadEndpoint) return;
        const response = await apiRequest(loadEndpoint);
        if (live) setForm(response?.data || response || {});
      })
      .catch(() => {
        if (live) setSurface(null);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [packageKey]);

  const metadataMode = Boolean(surface && (Array.isArray(surface.fields) || runtimeEndpoint(surface, "load")));
  const title = String(surface?.title || cachedItem?.name || cachedItem?.manifest?.name || defaultTitle(packageKey));

  const save = async () => {
    const endpoint = runtimeEndpoint(surface, "save");
    if (!endpoint) return;
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const payload = Object.fromEntries((surface?.fields || []).map((field) => [field.key, form?.[field.key]]));
      const response = await apiRequest(endpoint, {
        method: String(surface?.saveMethod || "PUT").toUpperCase(),
        body: JSON.stringify(payload),
      });
      setForm(response?.data || response || form);
      setMessage(surface?.saveMessage || "Settings saved.");
    } catch (reason) {
      setError(reason?.message || "Unable to save connector settings");
    } finally {
      setBusy("");
    }
  };

  const runAction = async (action) => {
    const endpoint = runtimeEndpoint(surface, action?.endpointKey || action?.key);
    if (!endpoint) return;
    setBusy(action.key);
    setError("");
    setMessage("");
    try {
      const response = await apiRequest(endpoint, { method: String(action?.method || "POST").toUpperCase() });
      setMessage(response?.data?.message || response?.message || action?.successMessage || "Action completed.");
      if (response?.data && typeof response.data === "object") setForm((current) => ({ ...current, ...response.data }));
    } catch (reason) {
      setError(reason?.message || action?.errorMessage || "Connector action failed");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="module-state">Loading app settings…</div>;

  return (
    <div className="integration-theme connector-settings-screen">
      <div className="connector-settings-page-head">
        <button type="button" onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50">
          <ArrowLeft size={15} /> oneStore
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{surface?.description || cachedItem?.description || "App settings and connection testing."}</p>
        </div>
      </div>

      {metadataMode ? (
        <section className="settings-detail-page">
          {message ? <div className="login-success">{message}</div> : null}
          {error ? <div className="login-error">{error}</div> : null}
          <div className="settings-form-card">
            {(surface?.readonly || []).map((item) => (
              <div className="settings-field-row" key={item.key || item.path}>
                <span>{item.label || item.key}</span>
                <strong>{readonlyValue(item, form)}</strong>
              </div>
            ))}
            {(surface?.fields || []).map((field) => (
              <label className={field.type === "boolean" ? "settings-field-row" : "settings-field"} key={field.key}>
                <span>{field.label || field.key}</span>
                <FieldControl field={field} value={form?.[field.key]} disabled={Boolean(busy)} onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))} />
              </label>
            ))}
            <div className="settings-actions">
              {runtimeEndpoint(surface, "save") ? <button type="button" className="login-submit" onClick={save} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save"}</button> : null}
              {(surface?.actions || []).map((action) => <button type="button" className="lock-signout" key={action.key} onClick={() => runAction(action)} disabled={Boolean(busy)}>{busy === action.key ? "Working…" : action.label || action.key}</button>)}
            </div>
          </div>
        </section>
      ) : (
        <ConnectorInstancesPanel packageKey={packageKey} settingsMode />
      )}
    </div>
  );
}
