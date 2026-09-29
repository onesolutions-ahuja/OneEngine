import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import { OBJECT_NAV_ICON_OPTIONS } from "../../../utils/platformObjectIcons.js";
import ObjectPage from "./ObjectPage.jsx";

const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";

function AppBuilder({ onMessage, onError }) {
  const [apps, setApps] = useState([]);
  const [app, setApp] = useState(null);
  const [pages, setPages] = useState([]);
  const [objects, setObjects] = useState([]);
  const [pageForm, setPageForm] = useState({ label: "", pageType: "object", definition: {} });
  /*
   * METADATA-DRIVEN OBJECT NAVIGATION configuration.
   *
   * The page's own `definition` (the field this builder already writes) gains
   * the navigation keys — Show in navigation, icon KEY and order. Nothing is
   * added to platform_objects: the Object row stays authoritative for its
   * fields/layout, and the page decides whether it surfaces in the Dock.
   *
   * Persisting this metadata never grants access — the runtime payload applies
   * company / module / licence / object permission / user permission / device
   * profile rules before an entry is returned.
   */
  const [navForm, setNavForm] = useState({ show: true, icon: "", order: "" });
  const [references, setReferences] = useState({ listViews: [], reports: [] });
  const [runtime, setRuntime] = useState(null);
  const load = async () => { try { const [appsResponse, objectsResponse] = await Promise.all([apiRequest("/api/platform/apps"), apiRequest("/api/platform/objects")]); setApps(appsResponse.data || []); setObjects(objectsResponse.data || []); } catch (error) { onError(error.message); } };
  const open = async (nextApp) => { try { const response = await apiRequest(`/api/platform/apps/${nextApp.id}`); const order = response.data.config?.pageOrder || []; const loadedPages = response.data.pages || []; loadedPages.sort((left, right) => (order.indexOf(left.id) < 0 ? 999 : order.indexOf(left.id)) - (order.indexOf(right.id) < 0 ? 999 : order.indexOf(right.id))); setApp(response.data); setPages(loadedPages); } catch (error) { onError(error.message); } };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!pageForm.definition.objectKey) return;
    const selected = objects.find((item) => item.object_key === pageForm.definition.objectKey);
    if (!selected) return;
    Promise.all([
      apiRequest(`/api/platform/objects/${selected.id}/list-views`),
      apiRequest(`/api/platform/objects/${encodeURIComponent(selected.object_key)}/reports`),
    ]).then(([listViews, reports]) => setReferences({ listViews: listViews.data || [], reports: reports.data || [] })).catch((error) => onError(error.message));
  }, [pageForm.definition.objectKey, objects]);
  const saveApp = async () => { try { const payload = { label: app?.label || "New app", description: app?.description || "", active: app?.active !== false, config: { ...(app?.config || {}), pageOrder: pages.map((page) => page.id) } }; const response = app?.id ? await apiRequest(`/api/platform/apps/${app.id}`, { method: "PUT", body: JSON.stringify(payload) }) : await apiRequest("/api/platform/apps", { method: "POST", body: JSON.stringify(payload) }); setApp({ ...response.data, pages: pages || [] }); onMessage("Platform app saved."); await load(); } catch (error) { onError(error.message); } };
  const toggleApp = async () => { try { const nextActive = app.active === false; const response = await apiRequest(`/api/platform/apps/${app.id}`, { method: "PUT", body: JSON.stringify({ active: nextActive, config: { ...(app.config || {}), pageOrder: pages.map((page) => page.id) } }) }); setApp({ ...app, ...response.data }); onMessage(nextActive ? "Platform app activated." : "Platform app deactivated."); await load(); } catch (error) { onError(error.message); } };
  const resetForms = () => { setPageForm({ label: "", pageType: "object", definition: {} }); setNavForm({ show: true, icon: "", order: "" }); };
  const applyNavigation = (definition) => ({ ...definition, showInNavigation: navForm.show, ...(navForm.icon ? { icon: navForm.icon } : {}), ...(String(navForm.order).trim() ? { order: Number.parseInt(navForm.order, 10) || 0 } : {}) });
  const targetDefinition = () => (pageForm.pageType === "object" ? { objectKey: pageForm.definition.objectKey } : { ...pageForm.definition });
  const editPage = (page) => { const definition = page.definition || {}; setPageForm({ id: page.id, label: page.label, pageType: page.page_type, definition }); setNavForm({ show: definition.showInNavigation !== false, icon: definition.icon || "", order: definition.order ?? "" }); };
  const addPage = async () => { if (!app?.id || !pageForm.label.trim()) return onError("Save the app and enter a page label first."); try { const definition = applyNavigation(targetDefinition()); const response = await apiRequest(`/api/platform/apps/${app.id}/pages`, { method: "POST", body: JSON.stringify({ label: pageForm.label, pageType: pageForm.pageType, definition }) }); setPages([...pages, response.data]); resetForms(); onMessage("Navigation item added."); } catch (error) { onError(error.message); } };
  const savePage = async () => { if (!pageForm.id || !pageForm.label.trim()) return onError("Enter a page label first."); try { const definition = applyNavigation(targetDefinition()); const response = await apiRequest(`/api/platform/pages/${pageForm.id}`, { method: "PUT", body: JSON.stringify({ label: pageForm.label, pageType: pageForm.pageType, definition }) }); setPages(pages.map((item) => (item.id === response.data.id ? response.data : item))); resetForms(); onMessage("Navigation item saved."); } catch (error) { onError(error.message); } };
  const removePage = async (page) => { try { await apiRequest(`/api/platform/pages/${page.id}`, { method: "DELETE" }); setPages(pages.filter((item) => item.id !== page.id)); } catch (error) { onError(error.message); } };
  return <div className="grid lg:grid-cols-[220px_1fr] gap-4">
    <section className="bg-white border rounded-xl p-4"><div className="flex justify-between mb-3"><h3 className="font-semibold">Apps</h3><button type="button" onClick={() => { setApp({ label: "", description: "", config: {} }); setPages([]); }} className="text-blue-700 text-sm">New</button></div>{apps.map((item) => <button key={item.id} type="button" onClick={() => open(item)} className={`block w-full text-left px-3 py-2 rounded text-sm ${app?.id === item.id ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>{item.label}</button>)}</section>
    <section className="bg-white border rounded-xl p-4 space-y-4">{app ? <><input className={inputClass} placeholder="App name" value={app.label || ""} onChange={(event) => setApp({ ...app, label: event.target.value })} /><textarea className={inputClass} placeholder="Description" value={app.description || ""} onChange={(event) => setApp({ ...app, description: event.target.value })} /><div className="flex gap-2"><button type="button" onClick={saveApp} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Save app</button>{app.id && <button type="button" onClick={toggleApp} className="px-4 py-2 border rounded text-sm">{app.active === false ? "Activate" : "Deactivate"}</button>}{app.id && <button type="button" onClick={() => setRuntime(app)} className="px-4 py-2 border rounded text-sm">Open app</button>}{app.id && <button type="button" onClick={async () => { await apiRequest(`/api/platform/apps/${app.id}`, { method: "DELETE" }); setApp(null); setPages([]); await load(); }} className="px-4 py-2 border rounded text-sm text-red-700">Delete</button>}</div><h3 className="font-semibold border-t pt-4">Navigation pages</h3>{pages.map((page, index) => <div key={page.id} className="flex justify-between items-center border rounded p-3 text-sm"><span>{page.label} <span className="text-slate-400">({page.page_type})</span>{page.page_type === "object" && (page.definition?.showInNavigation === false ? <span className="ml-2 text-xs text-slate-400">hidden</span> : <span className="ml-2 text-xs text-emerald-700">in navigation{(page.definition?.icon || page.definition?.order !== undefined) ? ` · ${page.definition.icon || "box"}${page.definition.order !== undefined ? ` #${page.definition.order}` : ""}` : ""}</span>)}</span><span className="flex gap-2"><button type="button" disabled={index === 0} onClick={() => { const next = [...pages]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setPages(next); }} className="text-slate-600">↑</button><button type="button" disabled={index === pages.length - 1} onClick={() => { const next = [...pages]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setPages(next); }} className="text-slate-600">↓</button><button type="button" onClick={() => editPage(page)} className="text-slate-700">Edit</button><button type="button" onClick={() => removePage(page)} className="text-red-700">Delete</button></span></div>)}<div className="grid md:grid-cols-3 gap-2"><input className={inputClass} placeholder="Navigation label" value={pageForm.label} onChange={(event) => setPageForm({ ...pageForm, label: event.target.value })} /><select className={inputClass} value={pageForm.pageType} onChange={(event) => setPageForm({ ...pageForm, pageType: event.target.value, definition: {} })}><option value="object">Platform Object</option><option value="list_view">List View</option><option value="report">Report</option></select><select className={inputClass} value={pageForm.definition.objectKey || ""} onChange={(event) => setPageForm({ ...pageForm, definition: { ...pageForm.definition, objectKey: event.target.value, referenceId: "" } })}><option value="">Select object</option>{objects.map((item) => <option key={item.id} value={item.object_key}>{item.label}</option>)}</select>{pageForm.pageType !== "object" && <select className={inputClass} value={pageForm.definition.referenceId || ""} onChange={(event) => setPageForm({ ...pageForm, definition: { ...pageForm.definition, referenceId: event.target.value, ...(pageForm.pageType === "report" ? { reportKey: references.reports.find((item) => item.id === event.target.value)?.report_key } : {}) } })}><option value="">Select {pageForm.pageType === "report" ? "report" : "list view"}</option>{(pageForm.pageType === "report" ? references.reports : references.listViews).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</div><div className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={navForm.show} onChange={(event) => setNavForm({ ...navForm, show: event.target.checked })} />Show in navigation</label><select className={inputClass + " max-w-[180px]"} value={navForm.icon} onChange={(event) => setNavForm({ ...navForm, icon: event.target.value })}><option value="">Default object icon</option>{OBJECT_NAV_ICON_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select><input className={inputClass + " max-w-[120px]"} type="number" min="0" max="9999" placeholder="Order" value={navForm.order} onChange={(event) => setNavForm({ ...navForm, order: event.target.value })} /></div><div className="flex gap-2"><button type="button" onClick={pageForm.id ? savePage : addPage} className="px-4 py-2 border rounded text-sm">{pageForm.id ? "Save navigation item" : "Add navigation item"}</button>{pageForm.id && <button type="button" onClick={resetForms} className="px-4 py-2 border rounded text-sm">Cancel</button>}</div></> : <p className="text-slate-500">Select an app or create a new one.</p>}</section>
    {runtime && <RuntimeApp app={runtime} pages={pages} onClose={() => setRuntime(null)} />}
  </div>;
}

function RuntimeApp({ app, pages, onClose }) {
  const [page, setPage] = useState(pages[0] || null);
  if (!page) return <div className="fixed inset-0 bg-white z-20 p-8"><button type="button" onClick={onClose}>Close</button><p className="mt-4">This app has no active pages.</p></div>;
  const definition = page.definition || {};
  return <div className="fixed inset-0 bg-slate-50 z-20 overflow-auto p-6"><div className="max-w-6xl mx-auto"><div className="flex justify-between items-center mb-4"><div><h2 className="text-2xl font-bold">{app.label}</h2><p className="text-slate-500">{app.description}</p></div><button type="button" onClick={onClose} className="border rounded px-3 py-2">Close</button></div><nav className="flex gap-2 mb-5">{pages.map((item) => <button type="button" key={item.id} onClick={() => setPage(item)} className={`px-3 py-2 rounded text-sm ${item.id === page.id ? "bg-blue-600 text-white" : "bg-white border"}`}>{item.label}</button>)}</nav>{page.page_type === "object" || page.page_type === "list_view" ? <ObjectPage objectKey={definition.objectKey} /> : <RuntimeReport objectKey={definition.objectKey} reportKey={definition.reportKey} />}</div></div>;
}

function RuntimeReport({ objectKey, reportKey }) {
  const [state, setState] = useState({ loading: true, rows: [], error: "" });
  useEffect(() => { apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/reports/${encodeURIComponent(reportKey)}`).then((response) => setState({ loading: false, rows: response.data?.rows || [], error: "" })).catch((error) => setState({ loading: false, rows: [], error: error.message })); }, [objectKey, reportKey]);
  if (state.loading) return <div className="bg-white border rounded-xl p-6">Loading report...</div>;
  if (state.error) return <div className="bg-white border rounded-xl p-6 text-red-700">{state.error}</div>;
  return <div className="bg-white border rounded-xl p-6 overflow-auto"><table className="w-full text-sm"><tbody>{state.rows.map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell} className="border-b p-2">{String(value ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}



export default function PlatformAppsAdmin(props) {
  return <AppBuilder {...props} />;
}
