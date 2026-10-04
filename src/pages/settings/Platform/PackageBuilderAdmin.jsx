import { useEffect, useMemo, useState } from "react";
import { AppWindow, Box, ChevronRight, FlaskConical, Package, RefreshCw, Rocket, Search, Workflow } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import { setRoute } from "../../../navigation/routes.js";
import CustomPageBuilder from "./CustomPageBuilder.jsx";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

function packageKeyFor(app) {
  return String(app?.config?.packageBuilder?.packageKey || app?.config?.packageKey || "").trim();
}

function appStateFor(app) {
  return String(app?.config?.packageBuilder?.state || "DRAFT").toUpperCase();
}

function inferredDependencies(pages = []) {
  const objects = new Set();
  for (const page of pages) {
    const key = page?.definition?.objectKey;
    if (key) objects.add(String(key));
    for (const candidate of page?.definition?.dependencies || []) {
      if (typeof candidate === "string" && candidate.trim()) objects.add(candidate.trim());
    }
  }
  return [...objects].sort();
}

export default function PackageBuilderAdmin({ onMessage, onError }) {
  const [apps, setApps] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [app, setApp] = useState(null);
  const [pages, setPages] = useState([]);
  const [objects, setObjects] = useState([]);
  const [actions, setActions] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pageBuilderOpen, setPageBuilderOpen] = useState(false);
  const [pageBuilderPageId, setPageBuilderPageId] = useState("");

  const loadBase = async () => {
    try {
      const [appsResponse, objectsResponse, actionsResponse] = await Promise.all([
        apiRequest("/api/platform/apps"),
        apiRequest("/api/platform/objects"),
        apiRequest("/api/platform/workflow-actions").catch(() => ({ data: [] })),
      ]);
      setApps(Array.isArray(appsResponse?.data) ? appsResponse.data : []);
      const objectRows = objectsResponse?.data?.objects || objectsResponse?.data || [];
      setObjects(Array.isArray(objectRows) ? objectRows : []);
      setActions(Array.isArray(actionsResponse?.data) ? actionsResponse.data : []);
    } catch (error) {
      onError?.(error?.message || "Unable to load Package Builder metadata.");
    }
  };

  const openApp = async (id) => {
    if (!id) return;
    try {
      setBusy(true);
      const response = await apiRequest(`/api/platform/apps/${encodeURIComponent(id)}`);
      setSelectedId(id);
      setApp(response.data || null);
      setPages(Array.isArray(response?.data?.pages) ? response.data.pages : []);
    } catch (error) {
      onError?.(error?.message || "Unable to open package app.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void loadBase(); }, []);

  const filteredApps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter((item) => !needle || `${item.label || ""} ${packageKeyFor(item)}`.toLowerCase().includes(needle));
  }, [apps, query]);

  const dependencies = useMemo(() => inferredDependencies(pages), [pages]);
  const selectedObjectLabels = useMemo(() => dependencies.map((key) => objects.find((item) => item.object_key === key)?.label || key), [dependencies, objects]);

  const patchPackageConfig = (patch) => {
    setApp((current) => ({
      ...(current || {}),
      config: {
        ...(current?.config || {}),
        packageBuilder: {
          ...(current?.config?.packageBuilder || {}),
          ...patch,
        },
      },
    }));
  };

  const createNew = () => {
    setSelectedId("");
    setPages([]);
    setApp({
      label: "New App",
      description: "",
      active: true,
      config: {
        packageBuilder: {
          packageKey: "",
          version: "1.0.0",
          state: "DRAFT",
          noCode: true,
          runtimePolicy: "EXISTING_GLOBAL_ACTIONS_ONLY",
        },
      },
    });
  };

  const save = async () => {
    if (!app?.label?.trim()) return onError?.("App name is required.");
    const packageKey = packageKeyFor(app);
    if (!packageKey) return onError?.("Package key is required.");
    try {
      setBusy(true);
      const config = {
        ...(app.config || {}),
        packageBuilder: {
          ...(app.config?.packageBuilder || {}),
          packageKey,
          noCode: true,
          runtimePolicy: "EXISTING_GLOBAL_ACTIONS_ONLY",
          inferredDependencies: dependencies,
        },
        pageOrder: pages.map((page) => page.id),
      };
      const payload = {
        label: app.label.trim(),
        description: app.description || "",
        active: app.active !== false,
        config,
      };
      const response = app.id
        ? await apiRequest(`/api/platform/apps/${encodeURIComponent(app.id)}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiRequest("/api/platform/apps", { method: "POST", body: JSON.stringify(payload) });
      const saved = response.data || {};
      setApp((current) => ({ ...current, ...saved, config }));
      setSelectedId(saved.id || selectedId);
      await loadBase();
      onMessage?.("Package metadata saved using the existing platform app runtime.");
    } catch (error) {
      onError?.(error?.message || "Unable to save package metadata.");
    } finally {
      setBusy(false);
    }
  };

  const setMode = async (state) => {
    patchPackageConfig({ state });
    setApp((current) => ({ ...current, active: true }));
    onMessage?.(state === "TEST" ? "Test mode selected. Save to keep this version private to developer testing." : "Draft mode selected.");
  };

  if (pageBuilderOpen) {
    return (
      <CustomPageBuilder
        onMessage={onMessage}
        onError={onError}
        initialAppId={app?.id || selectedId}
        initialPageId={pageBuilderPageId}
        context="developer"
        lockApp
        onBack={() => {
          setPageBuilderOpen(false);
          setPageBuilderPageId("");
          if (app?.id || selectedId) void openApp(app?.id || selectedId);
        }}
      />
    );
  }

  return (
    <div className="grid min-h-[620px] grid-cols-[240px_minmax(0,1fr)] gap-4">
      <aside className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <strong className="text-sm">Packages</strong>
          <button type="button" onClick={createNew} className="text-sm font-medium text-blue-700">New</button>
        </div>
        <label className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
          <Search size={15} className="text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search packages" className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
        </label>
        <div className="space-y-1">
          {filteredApps.map((item) => (
            <button key={item.id} type="button" onClick={() => void openApp(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === item.id ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50"}`}>
              <div className="font-medium">{item.label}</div>
              <div className="truncate text-[11px] text-slate-500">{packageKeyFor(item) || "Unlinked package"}</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        {!app ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Select an existing app or create a new package app.</div>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Package Builder</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{app.label || "New App"}</h2>
                  <p className="mt-1 text-sm text-slate-500">No-code package definition over existing OneEngine objects, pages, workflows, registered actions and release services.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void setMode("DRAFT")} className={`rounded-lg border px-3 py-2 text-sm ${appStateFor(app) === "DRAFT" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>Draft</button>
                  <button type="button" onClick={() => void setMode("TEST")} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${appStateFor(app) === "TEST" ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200"}`}><FlaskConical size={15}/>Test</button>
                  <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={() => setRoute("app-releases")} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><Rocket size={15}/>Release</button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-medium text-slate-600">App name<input className={`${inputClass} mt-1`} value={app.label || ""} onChange={(event) => setApp({ ...app, label: event.target.value })} /></label>
                <label className="text-xs font-medium text-slate-600">Package key<input className={`${inputClass} mt-1`} value={packageKeyFor(app)} onChange={(event) => patchPackageConfig({ packageKey: event.target.value.replace(/[^a-zA-Z0-9_.-]/g, "_") })} placeholder="whatsapp_connector" /></label>
                <label className="text-xs font-medium text-slate-600">Version<input className={`${inputClass} mt-1`} value={app?.config?.packageBuilder?.version || "1.0.0"} onChange={(event) => patchPackageConfig({ version: event.target.value })} /></label>
                <label className="text-xs font-medium text-slate-600">State<input className={`${inputClass} mt-1 bg-slate-50`} value={appStateFor(app)} readOnly /></label>
              </div>
              <label className="mt-3 block text-xs font-medium text-slate-600">Description<textarea className={`${inputClass} mt-1 min-h-[72px]`} value={app.description || ""} onChange={(event) => setApp({ ...app, description: event.target.value })} /></label>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">App canvas</h3>
                  <p className="text-sm text-slate-500">Each node is an existing platform page. Open it in the existing Page Builder to place components and wire their events to registered actions or workflows.</p>
                </div>
                <button type="button" onClick={() => { setPageBuilderPageId(""); setPageBuilderOpen(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm"><AppWindow size={15}/>Open Page Builder</button>
              </div>

              <div className="mt-5 overflow-x-auto pb-2">
                <div className="flex min-w-max items-center gap-3">
                  <div className="flex h-24 w-44 flex-col justify-center rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
                    <Package size={18} className="text-blue-700" />
                    <strong className="mt-1 text-sm">{app.label}</strong>
                    <span className="text-[11px] text-blue-700">Landing / package root</span>
                  </div>
                  {pages.map((page) => (
                    <div key={page.id} className="flex items-center gap-3">
                      <ChevronRight size={18} className="text-slate-300" />
                      <button type="button" onClick={() => { setPageBuilderPageId(page.id); setPageBuilderOpen(true); }} className="flex h-24 w-44 flex-col justify-center rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-300">
                        <AppWindow size={18} className="text-slate-600" />
                        <strong className="mt-1 truncate text-sm">{page.label}</strong>
                        <span className="truncate text-[11px] text-slate-500">{page.page_type || "custom"}{page.definition?.objectKey ? ` · ${page.definition.objectKey}` : ""}</span>
                      </button>
                    </div>
                  ))}
                  {!pages.length ? <div className="ml-2 rounded-xl border border-dashed border-slate-300 px-5 py-7 text-sm text-slate-500">No pages yet — open Page Builder to create the landing page.</div> : null}
                </div>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2"><Box size={17}/><h3 className="font-semibold">Package dependencies</h3></div>
                <p className="mt-1 text-sm text-slate-500">Derived from the objects referenced by package pages. These are references; Package Builder does not create duplicate object tables.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedObjectLabels.length ? selectedObjectLabels.map((label) => <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">{label}</span>) : <span className="text-sm text-slate-400">No object dependencies detected yet.</span>}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2"><Workflow size={17}/><h3 className="font-semibold">Runtime actions</h3></div>
                <p className="mt-1 text-sm text-slate-500">Read-only canonical registry. Package Builder may reference these actions but cannot generate new app-specific functions.</p>
                <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-slate-100">
                  {actions.slice(0, 40).map((action) => <div key={action.key || action.name} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-xs last:border-0"><span>{action.displayName || action.label || action.key}</span><code className="text-slate-500">{action.key}</code></div>)}
                  {!actions.length ? <div className="p-3 text-sm text-slate-400">Action registry unavailable.</div> : null}
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-start gap-2"><RefreshCw size={16} className="mt-0.5"/><div><strong>Runtime guardrail:</strong> CRUD, APIs, communication, navigation and workflows remain on the existing global registries/runtime. This builder stores only metadata references and mappings; it does not create package-specific execution functions.</div></div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
