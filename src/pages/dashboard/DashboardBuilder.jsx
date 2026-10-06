import { useCallback, useEffect, useState } from "react";
import { apiRequest, loadSessionPermissions } from "../../services/api.js";
import DashboardLayoutCanvas from "../../components/dashboard/DashboardLayoutCanvas.jsx";
import DashboardComponentProperties from "../../components/dashboard/DashboardComponentProperties.jsx";
// DashboardComponentProperties (the shared <DashboardGrid> editor surface)
// exposes Data source, Metric field, Category / group field, Date range,
// Format, Size, Maximum categories, Width and Height controls.
import { applyLayout } from "../../components/dashboard/platformDashboard.js";
import { componentIcon, createRegisteredComponent, registryForBuilder, useComponentRegistry } from "../settings/Platform/componentRegistry.js";
import { DashboardFilterEditor, DashboardRunAsEditor, ResponsiveLayoutMode, responsiveComponents } from "../../components/dashboard/DashboardManagementControls.jsx";

/*
 * The EXISTING Dashboard Builder, extended (not replaced). It offers the same
 * generic component vocabulary the runtime renders, and a Properties panel that
 * configures each component's datasource, metric, grouping, date range,
 * conditions, formatting and size. Everything it writes is dashboard metadata;
 * the Dashboard page renders that metadata through the same runtime.
 */
const empty = { name: "", description: "", components: [], filters: [], global_filters: [], responsive_layouts: { desktop: [], tablet: [], mobile: [] }, run_as_mode: "VIEWER", run_as_user_id: null };
const CARD = { background: "var(--onepos-card-bg, var(--onepos-surface-raised))", border: "1px solid var(--onepos-border)", borderRadius: "var(--onepos-card-radius, 16px)" };
const FIELD = "w-full border rounded-lg px-2 py-1.5 text-sm";
const FIELD_STYLE = { borderColor: "var(--onepos-border)", background: "var(--onepos-surface-raised)", color: "var(--onepos-text-primary)" };
const LABEL = "block text-xs font-semibold mb-1";

const blankComponent = (spec) => createRegisteredComponent(spec, "DASHBOARD");


export default function DashboardBuilder({ embedded = false, initialDashboard = null, onClose, onSaved } = {}) {
  const [dashboards, setDashboards] = useState([]);
  const [current, setCurrent] = useState(() => initialDashboard ? { ...initialDashboard } : embedded ? { ...empty } : null);
  const [runtime, setRuntime] = useState([]);
  const registry = useComponentRegistry();
  const dashboardPalette = registryForBuilder(registry, "DASHBOARD");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [inspectorTab, setInspectorTab] = useState("components");
  const [principals, setPrincipals] = useState(null);
  const [principalType, setPrincipalType] = useState("USER");
  const [principalId, setPrincipalId] = useState("");
  const [accessLevel, setAccessLevel] = useState("VIEW");
  const [defaultType, setDefaultType] = useState("USER");
  const [defaultId, setDefaultId] = useState("");
  const [defaultPriority, setDefaultPriority] = useState("100");
  const [permissions, setPermissions] = useState({ codes: [] });
  const [layoutMode, setLayoutMode] = useState("desktop");

  const selectedIndex = Math.max(0, (current?.components || []).findIndex((component) => component.id === selectedId));
  const selectedComponent = (current?.components || [])[selectedIndex] || null;

  const loadPrincipals = async () => {
    const [response, permissionResponse] = await Promise.all([
      apiRequest("/api/dashboards/principals"), loadSessionPermissions(),
    ]);
    setPermissions({ codes: permissionResponse?.permissions || [] });
    if (response.success) setPrincipals(response.data);
    else setPrincipals(null);
  };

  const principalOptions = (type) => {
    if (type === "USER") return principals?.users || [];
    if (type === "ROLE") return principals?.roles || [];
    if (type === "PUBLIC_GROUP") return principals?.groups || [];
    return principals?.company ? [principals.company] : [];
  };

  const principalLabel = (type, id) => principalOptions(type).find((item) => String(item.id) === String(id))?.full_name
    || principalOptions(type).find((item) => String(item.id) === String(id))?.name
    || principalOptions(type).find((item) => String(item.id) === String(id))?.username
    || "Unavailable principal";
  const optionLabel = (type, item) => type === "USER" && String(item.id) === String(principals?.currentUserId)
    ? `Me (${item.full_name || item.username})`
    : item.full_name || item.name || item.username;
  const canShare = permissions.codes.includes("dashboard.share");
  const canAssignDefaults = permissions.codes.includes("dashboard.assign_default");
  const canEdit = permissions.codes.includes("dashboard.edit");
  const canCreate = permissions.codes.includes("dashboard.create");
  const canManage = permissions.codes.includes("dashboard.manage");

  const persistAccess = async (access) => {
    const response = await apiRequest(`/api/dashboards/${current.id}/access`, { method: "PUT", body: JSON.stringify({ access }) });
    if (response.success) setCurrent(response.data);
    else setError(response.message || "Unable to update dashboard sharing");
  };

  const persistDefaults = async (default_assignments) => {
    const response = await apiRequest(`/api/dashboards/${current.id}/defaults`, { method: "PUT", body: JSON.stringify({ default_assignments }) });
    if (response.success) setCurrent(response.data);
    else setError(response.message || "Unable to update dashboard defaults");
  };

  const load = useCallback(async () => {
    const response = await apiRequest("/api/dashboards");
    if (response.success) setDashboards(response.data || []);
    else setError(response.message);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!embedded) return;
    setCurrent(initialDashboard ? { ...initialDashboard } : { ...empty });
    setRuntime([]);
    setPreview(false);
    setSelectedId(null);
    if (initialDashboard?.id) loadPrincipals();
  }, [embedded, initialDashboard?.id]);

  const save = async () => {
    const value = current || empty;
    if (!value.name.trim()) return setError("Dashboard name is required");
    const payload = {
      ...value,
      apiKey: value.apiKey || value.api_key || value.metadataKey || (value.name || "dashboard").trim() || "dashboard",
    };
    setSaving(true);
    try {
      const response = await apiRequest(current?.id ? `/api/dashboards/${current.id}` : "/api/dashboards", {
        method: current?.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!response.success) return setError(response.message || "Unable to save dashboard");
      const savedId = response.data?.id;
      const reopened = savedId ? await apiRequest(`/api/dashboards/${encodeURIComponent(savedId)}`) : null;
      if (savedId && !reopened?.success) throw new Error(reopened?.message || "Unable to reopen saved dashboard");
      const persisted = reopened?.data || response.data;
      setCurrent(persisted);
      setError("");
      await loadPrincipals();
      await runPreview(persisted);
      await load();
      onSaved?.(persisted);
    } catch (error) {
      setError(error.message || "Unable to save dashboard");
    } finally {
      setSaving(false);
    }
  };

  /* Preview runs the UNSAVED definition through the same endpoint the Dashboard
     page uses, so the builder previews exactly what will render. */
  const runPreview = async (dashboardValue = current || empty) => {
    setError("");
    const value = dashboardValue || empty;
    const savedId = value?.id || null;
    const response = await apiRequest(savedId ? `/api/dashboards/${encodeURIComponent(savedId)}/run` : "/api/dashboards/run", {
      method: "POST",
      body: JSON.stringify(savedId
        ? { filters: value.filters || [], globalFilterValues: {} }
        : { ...value, name: (value?.name || current?.name || "Preview").trim() || "Preview" }),
    });
    if (response.success) { setRuntime(response.data?.components || []); setPreview(true); }
    else setError(response.message || "Unable to preview this dashboard");
  };
  const loadDefault = async () => {
    const response = await apiRequest("/api/dashboards/default");
    if (response.success) setCurrent({ ...response.data, id: null });
    else setError(response.message);
  };


  const addComponent = (registryKey) => {
    const spec = dashboardPalette.find((item) => item.key === registryKey);
    if (!spec) {
      setError("Component metadata is not available. Refresh the builder and try again.");
      return;
    }
    const component = { ...blankComponent(spec), registryKey: spec.key };
    setCurrent((value) => ({ ...(value || empty), components: [...(value?.components || []), component] }));
  };  const updateComponent = (index, next) => setCurrent((value) => {
    const components = [...(value?.components || [])];
    components[index] = next;
    return { ...value, components };
  });
  const moveComponent = (index, direction) => setCurrent((value) => {
    const components = [...(value?.components || [])];
    const target = index + direction;
    if (target < 0 || target >= components.length) return value;
    [components[index], components[target]] = [components[target], components[index]];
    return { ...value, components };
  });
  const removeComponent = (index) => setCurrent((value) => ({ ...value, components: (value?.components || []).filter((_, i) => i !== index) }));
  const close = () => {
    setRuntime([]);
    setPreview(false);
    if (embedded) onClose?.();
    else setCurrent(null);
  };


  if (!current) {
    return <div>
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="onepos-page-title">Dashboard Builder</h1>
          <p className="onepos-page-subtitle">Compose dashboards from generic, configurable components.</p>
        </div>
        <div className="flex gap-2">
          <button className="onepos-btn onepos-btn-sm" onClick={loadDefault}>Start from the default</button>
          <button className="onepos-btn onepos-btn-sm onepos-btn-primary" onClick={() => setCurrent({ ...empty })}>New dashboard</button>
        </div>
      </div>
      <div className="grid gap-3">
        {dashboards.map((item) => (
          <div key={item.id} className="p-4 flex justify-between items-center" style={CARD}>
            <div className="min-w-0">
              <b className="truncate block">{item.name}</b>
              <p className="text-sm truncate" style={{ color: "var(--onepos-text-muted)" }}>{item.description}</p>
            </div>
            <button className="onepos-btn onepos-btn-sm" onClick={() => { setCurrent(item); setRuntime([]); setPreview(false); loadPrincipals(); }}>Open</button>
          </div>
        ))}
        {!dashboards.length ? <div className="p-8 text-center" style={CARD}><p style={{ color: "var(--onepos-text-muted)" }}>No saved dashboards yet. Start from the default composition or create a new one.</p></div> : null}
      </div>
      {error ? <p className="text-sm mt-3" style={{ color: "#b91c1c" }}>{error}</p> : null}
    </div>;
  }

  return <div>
    <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="onepos-page-title">Dashboard Builder</h1>
        <p className="onepos-page-subtitle">Configure components, then save. The Dashboard renders exactly this metadata.</p>
      </div>
      <div className="flex gap-2">
        {preview ? <button className="onepos-btn onepos-btn-sm" onClick={() => setPreview(false)}><span className="inline-flex items-center gap-1"><span className="text-base leading-none">✎</span> Edit</span></button> : <button className="onepos-btn onepos-btn-sm" onClick={() => runPreview()}>Preview</button>}
        {(current.id ? canEdit : canCreate) ? <button className="onepos-btn onepos-btn-sm onepos-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button> : null}
        <button className="onepos-btn onepos-btn-sm" onClick={close}>Back to Dashboards</button>
      </div>
    </div>


    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] items-start dashboard-builder-workspace">
      <div className="min-w-0 space-y-3 dashboard-builder-main">
        <div className="p-4" style={CARD}>
          <span className={LABEL}>Dashboard name</span>
          <input className={FIELD} style={FIELD_STYLE} value={current.name || ""} onChange={(e) => setCurrent({ ...current, name: e.target.value, apiKey: current.apiKey || current.api_key || current.metadataKey || (e.target.value || "dashboard").trim() || "dashboard" })} />
          <span className={`${LABEL} mt-3`}>API key / metadata key</span>
          <input className={FIELD} style={FIELD_STYLE} value={current.apiKey || current.api_key || ""} onChange={(e) => setCurrent({ ...current, apiKey: e.target.value })} />
          <span className={`${LABEL} mt-3`}>Description</span>
          <textarea className={FIELD} rows={2} style={FIELD_STYLE} value={current.description || ""} onChange={(e) => setCurrent({ ...current, description: e.target.value })} />
        </div>

        <div className="p-4 space-y-4" style={CARD} data-testid="dashboard-security-panel">
          <div>
            <div className="font-semibold text-sm">DATA VISIBILITY</div>
            <div className="mt-2">
              <DashboardRunAsEditor
                mode={current.run_as_mode || "VIEWER"}
                userId={current.run_as_user_id || ""}
                users={principals?.users || []}
                onChange={({ mode, userId }) => {
                  if (mode === "FIXED_USER" && !canManage) {
                    setError("dashboard.manage permission is required to configure a fixed run-as user");
                    return;
                  }
                  setCurrent({ ...current, run_as_mode: mode, run_as_user_id: userId || null });
                }}
              />
            </div>
          </div>
          <DashboardFilterEditor
            filters={current.global_filters || []}
            components={current.components || []}
            onChange={(global_filters) => setCurrent({ ...current, global_filters })}
          />
          {current.id && principals && canShare ? <>
            <section data-testid="dashboard-sharing-panel">
              <h2 className="font-semibold text-sm">ACCESS &amp; SHARING</h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_120px_auto]">
                <select className={FIELD} style={FIELD_STYLE} value={principalType} onChange={(event) => { setPrincipalType(event.target.value); setPrincipalId(""); }} aria-label="Principal type">
                  <option value="USER">User</option><option value="ROLE">Role</option><option value="PUBLIC_GROUP">Public Group</option><option value="COMPANY">Company</option>
                </select>
                <select className={FIELD} style={FIELD_STYLE} value={principalId} onChange={(event) => setPrincipalId(event.target.value)} aria-label="Principal">
                  <option value="">Select principal</option>{principalOptions(principalType).map((item) => <option key={item.id} value={item.id}>{optionLabel(principalType, item)}</option>)}
                </select>
                <select className={FIELD} style={FIELD_STYLE} value={accessLevel} onChange={(event) => setAccessLevel(event.target.value)} aria-label="Access level">
                  <option value="VIEW">VIEW</option><option value="EDIT">EDIT</option><option value="MANAGE">MANAGE</option>
                </select>
                <button className="onepos-btn onepos-btn-sm" type="button" disabled={!principalId} onClick={() => persistAccess([...(current.access || []).filter((item) => !(item.principal_type === principalType && String(item.principal_id) === principalId)), { principal_type: principalType, principal_id: principalId, access_level: accessLevel, active: true }])}>Add</button>
              </div>
              <div className="mt-3 divide-y" style={{ borderColor: "var(--onepos-border)" }}>
                {(current.access || []).map((item) => <div key={`${item.principal_type}:${item.principal_id}`} className="grid gap-2 py-2 sm:grid-cols-[100px_minmax(0,1fr)_120px_90px_auto] items-center text-sm">
                  <span>{item.principal_type}</span><span>{principalLabel(item.principal_type, item.principal_id)}</span>
                  <select className={FIELD} style={FIELD_STYLE} value={item.access_level} aria-label={`Access for ${principalLabel(item.principal_type, item.principal_id)}`} onChange={(event) => persistAccess((current.access || []).map((entry) => entry === item ? { ...entry, access_level: event.target.value } : entry))}>
                    <option value="VIEW">VIEW</option><option value="EDIT">EDIT</option><option value="MANAGE">MANAGE</option>
                  </select>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={item.active !== false} onChange={(event) => persistAccess((current.access || []).map((entry) => entry === item ? { ...entry, active: event.target.checked } : entry))} />Active</label>
                  <button className="onepos-btn onepos-btn-sm" type="button" onClick={() => persistAccess((current.access || []).filter((entry) => entry !== item))}>Remove</button>
                </div>)}
              </div>
            </section>
          </> : null}
          {current.id && principals && canAssignDefaults ? <>
            <section data-testid="dashboard-defaults-panel">
              <h2 className="font-semibold text-sm">LANDING DASHBOARD FOR</h2><p className="mt-1 text-xs" style={{ color: "var(--onepos-text-muted)" }}>Choose which dashboard opens as the Smart Theme home for a user, role, public group or the company. More specific assignments take precedence by priority.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_100px_auto]">
                <select className={FIELD} style={FIELD_STYLE} value={defaultType} onChange={(event) => { setDefaultType(event.target.value); setDefaultId(""); }} aria-label="Default target type">
                  <option value="USER">User</option><option value="ROLE">Role</option><option value="PUBLIC_GROUP">Public Group</option><option value="COMPANY">Company</option>
                </select>
                <select className={FIELD} style={FIELD_STYLE} value={defaultId} onChange={(event) => setDefaultId(event.target.value)} aria-label="Default target principal">
                  <option value="">Select target</option>{principalOptions(defaultType).map((item) => <option key={item.id} value={item.id}>{optionLabel(defaultType, item)}</option>)}
                </select>
                <input className={FIELD} style={FIELD_STYLE} type="number" step="1" value={defaultPriority} aria-label="Default priority" onChange={(event) => setDefaultPriority(event.target.value)} />
                <button className="onepos-btn onepos-btn-sm" type="button" disabled={!defaultId} onClick={() => persistDefaults([...(current.default_assignments || []).filter((item) => !(item.principal_type === defaultType && String(item.principal_id) === defaultId)), { principal_type: defaultType, principal_id: defaultId, priority: Number(defaultPriority), active: true }])}>Add</button>
              </div>
              <div className="mt-3 divide-y" style={{ borderColor: "var(--onepos-border)" }}>
                {(current.default_assignments || []).map((item) => <div key={`${item.principal_type}:${item.principal_id}`} className="grid gap-2 py-2 sm:grid-cols-[100px_minmax(0,1fr)_100px_auto] items-center text-sm">
                  <span>{item.principal_type}</span><span>{principalLabel(item.principal_type, item.principal_id)}</span>
                  <input className={FIELD} style={FIELD_STYLE} type="number" step="1" aria-label={`Priority for ${principalLabel(item.principal_type, item.principal_id)}`} value={item.priority} onChange={(event) => persistDefaults((current.default_assignments || []).map((entry) => entry === item ? { ...entry, priority: Number(event.target.value) } : entry))} />
                  <button className="onepos-btn onepos-btn-sm" type="button" onClick={() => persistDefaults((current.default_assignments || []).filter((entry) => entry !== item))}>Remove</button>
                </div>)}
              </div>
            </section>
          </> : null}
        </div>

        {/* The layout canvas: drag to reorder, corner-handle to resize. It
            renders through <DashboardGrid>, so what is arranged here is exactly
            what the runtime renders. */}
        <div className="p-4" style={CARD} data-testid="dashboard-layout-panel">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="font-semibold text-sm">Layout</div>
            <ResponsiveLayoutMode value={layoutMode} onChange={setLayoutMode} />
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--onepos-text-muted)" }}>
            {preview ? "Live preview rendered by the shared dashboard runtime." : `Editing ${layoutMode} layout. Drag components to reorder and resize them.`}
          </p>
          <DashboardLayoutCanvas
            components={applyLayout(layoutMode === "desktop"
              ? current.components || []
              : responsiveComponents(current.components || [], current.responsive_layouts || {}, layoutMode))}
            results={preview ? runtime : []}
            loading={false}
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setInspectorTab("properties"); }}
            onChange={(components) => {
              if (layoutMode === "desktop") {
                setCurrent({ ...current, components });
                return;
              }
              const responsive_layouts = {
                ...(current.responsive_layouts || { desktop: [], tablet: [], mobile: [] }),
                [layoutMode]: components.map((component) => ({ id: component.id, ...component.layout })),
              };
              setCurrent({ ...current, responsive_layouts });
            }}
          />
          {!(current.components || []).length ? <p className="text-sm mt-3" style={{ color: "var(--onepos-text-muted)" }}>No components yet — add a Metric, Pie, Donut or Bar.</p> : null}
        </div>
      </div>

      <aside className="min-w-0 dashboard-builder-inspector">
        <div className="xl:sticky dashboard-builder-inspector-card" style={{ ...CARD, top: 0 }} data-testid="dashboard-properties-panel">
          <div className="dashboard-builder-inspector-tabs">
            <button type="button" className={inspectorTab === "components" ? "is-active" : ""} onClick={() => setInspectorTab("components")}>Objects</button>
            <button type="button" className={inspectorTab === "properties" ? "is-active" : ""} onClick={() => setInspectorTab("properties")}>Properties</button>
          </div>

          {inspectorTab === "components" ? (
            <div className="dashboard-builder-palette">
              {dashboardPalette.map((spec) => {
                const Icon = componentIcon(spec.key);
                return (
                  <button key={spec.key} type="button" className="dashboard-builder-palette-item" data-testid={`add-component-${spec.key}`} onClick={() => { addComponent(spec.key); setInspectorTab("properties"); }}>
                    <span className="dashboard-builder-palette-icon"><Icon size={14} aria-hidden="true" /></span>
                    <span>{spec.label}</span>
                    <b>+</b>
                  </button>
                );
              })}
            </div>
          ) : selectedComponent ? (
            <div className="dashboard-builder-properties">
              <div className="dashboard-builder-properties-head">
                <div>
                  <strong>{selectedComponent.title || "Untitled"}</strong>
                  <small>{selectedComponent.type}</small>
                </div>
                <div className="dashboard-builder-properties-actions">
                  <button type="button" onClick={() => moveComponent(selectedIndex, -1)} disabled={selectedIndex <= 0}>↑</button>
                  <button type="button" onClick={() => moveComponent(selectedIndex, 1)} disabled={selectedIndex === (current.components || []).length - 1}>↓</button>
                  <button type="button" onClick={() => removeComponent(selectedIndex)}>×</button>
                </div>
              </div>
              <DashboardComponentProperties component={selectedComponent} onChange={(next) => updateComponent(selectedIndex, next)} />
            </div>
          ) : (
            <div className="dashboard-builder-properties-empty">
              Select a component on the canvas to edit its properties.
            </div>
          )}
        </div>
      </aside>
    </div>
    {error ? <p className="text-sm mt-3" style={{ color: "#b91c1c" }}>{error}</p> : null}
  </div>;
}
