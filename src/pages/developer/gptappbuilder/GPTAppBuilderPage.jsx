import { useEffect, useMemo, useState } from "react";
import { AppWindow, Plus, Search } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import CustomPageBuilder from "../../settings/Platform/CustomPageBuilder.jsx";
import ConnectorDefinitionEditor from "./ConnectorDefinitionEditor.jsx";

const BUILDER_DEFINITION = Object.freeze({
  key: "gpt_app_builder",
  label: "GPTAppBuilder",
  stages: [
    { key: "apps", label: "Apps" },
    { key: "pages", label: "Pages" },
  ],
  template: {
    key: "blank",
    label: "Blank",
    pages: [
      { pageKey: "desktop", label: "Desktop", device: "desktop" },
      { pageKey: "mobile", label: "Mobile", device: "mobile" },
    ],
  },
});

function safeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function GPTAppBuilderPage() {
  const [apps, setApps] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [selectedConnectorKey, setSelectedConnectorKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ label: "", appKey: "", description: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadApps = async () => {
    const response = await apiRequest("/api/platform/apps");
    setApps(Array.isArray(response?.data) ? response.data : []);
  };

  useEffect(() => { void loadApps().catch((e) => setError(e?.message || "Unable to load app metadata")); }, []);

  const visibleApps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter((app) => !needle || `${app.label || ""} ${app.app_key || ""}`.toLowerCase().includes(needle));
  }, [apps, query]);

  const createBlank = async () => {
    const appKey = safeKey(draft.appKey || draft.label);
    if (!draft.label.trim() || !appKey) return setError("App name and metadata key are required.");
    setCreating(true);
    setError("");
    try {
      const appResponse = await apiRequest("/api/platform/apps", {
        method: "POST",
        body: JSON.stringify({
          appKey,
          label: draft.label.trim(),
          description: draft.description || "",
          active: true,
          config: {
            builder: {
              builderKey: BUILDER_DEFINITION.key,
              schemaVersion: 1,
              templateKey: BUILDER_DEFINITION.template.key,
              state: "DRAFT",
            },
            navigation: { tabs: [] },
          },
        }),
      });
      const app = appResponse?.data;
      if (!app?.id) throw new Error("App metadata was not created.");
      let firstPageId = "";
      for (const page of BUILDER_DEFINITION.template.pages) {
        const response = await apiRequest(`/api/platform/apps/${encodeURIComponent(app.id)}/pages`, {
          method: "POST",
          body: JSON.stringify({
            pageKey: page.pageKey,
            label: page.label,
            pageType: "object",
            routePath: `/app/custom/${appKey}/${page.pageKey}`,
            definition: { schemaVersion: 1, device: page.device, sections: [] },
            active: true,
          }),
        });
        if (!firstPageId) firstPageId = response?.data?.id || "";
      }
      await loadApps();
      setSelectedAppId(String(app.id));
      setSelectedPageId(String(firstPageId));
      setDraft({ label: "", appKey: "", description: "" });
      setMessage("Blank app metadata created.");
    } catch (e) {
      setError(e?.message || "Unable to create app metadata.");
    } finally {
      setCreating(false);
    }
  };

  if (selectedAppId) {
    return (
      <div data-builder-key={BUILDER_DEFINITION.key}>
        <CustomPageBuilder
          initialAppId={selectedAppId}
          initialPageId={selectedPageId}
          lockApp
          context="developer"
          onBack={() => { setSelectedAppId(""); setSelectedPageId(""); void loadApps(); }}
          onMessage={setMessage}
          onError={setError}
        />
        {message ? <div className="settings-success">{message}</div> : null}
        {error ? <div className="settings-error">{error}</div> : null}
      </div>
    );
  }

  return (
    <section data-builder-key={BUILDER_DEFINITION.key}>
      <header className="onepos-page-header">
        <div><h1 className="onepos-page-title">{BUILDER_DEFINITION.label}</h1><p className="onepos-page-subtitle">Build portable apps from Platform metadata.</p></div>
        <button type="button" className="onepos-btn onepos-btn-primary" onClick={() => setCreating(true)}><Plus size={15}/>New App</button>
      </header>
      {error ? <div className="settings-error">{error}</div> : null}
      {message ? <div className="settings-success">{message}</div> : null}
      {creating ? (
        <div className="onepos-card"><div className="onepos-card-body">
          <h2 className="onepos-card-title">{BUILDER_DEFINITION.template.label} App</h2>
          <label>App name<input className="onepos-input" value={draft.label} onChange={(e) => setDraft((v) => ({ ...v, label: e.target.value, appKey: v.appKey || safeKey(e.target.value) }))}/></label>
          <label>Metadata key<input className="onepos-input" value={draft.appKey} onChange={(e) => setDraft((v) => ({ ...v, appKey: safeKey(e.target.value) }))}/></label>
          <label>Description<input className="onepos-input" value={draft.description} onChange={(e) => setDraft((v) => ({ ...v, description: e.target.value }))}/></label>
          <div className="cpb-toolbar"><button type="button" className="onepos-btn onepos-btn-primary" disabled={!draft.label.trim()} onClick={() => void createBlank()}>Create Blank App</button><button type="button" className="onepos-btn" onClick={() => setCreating(false)}>Cancel</button></div>
        </div></div>
      ) : null}
      <div className="onepos-card"><div className="onepos-card-body"><ConnectorDefinitionEditor value={selectedConnectorKey} onChange={setSelectedConnectorKey} onMessage={setMessage} onError={setError}/></div></div>
      <label className="settings-search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search app metadata"/></label>
      <div className="developer-record-list">
        {visibleApps.map((app) => <button type="button" key={app.id} className="settings-nav-item" onClick={() => setSelectedAppId(String(app.id))}><AppWindow size={16}/><span>{app.label || app.app_key}</span></button>)}
      </div>
    </section>
  );
}
