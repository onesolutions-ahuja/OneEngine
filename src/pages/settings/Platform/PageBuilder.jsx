import MetadataResourcePicker from "./MetadataResourcePicker.jsx";
import { useEffect, useMemo, useState } from "react";
import { GripVertical, Monitor, Pencil, Plus, Rocket, Save, Smartphone, Tablet, Trash2 } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import {
  componentByKey,
  componentCategoryLabel,
  componentIcon,
  createRegisteredComponent,
  registryForBuilder,
  useComponentRegistry,
} from "./componentRegistry.js";

/*
 * Form & Page Builder — onePOS Lightning App Builder.
 *
 * Structure matches Salesforce's builder: component palette LEFT, live canvas
 * CENTRE, properties panel RIGHT, device preview selector + presentation mode
 * and Save / Activate (Preview) actions in ONE top bar. Everything the builder
 * writes is page definition metadata through the existing pages API.
 */
const uid = (prefix = "cmp") => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const fresh = () => ({
  device: "desktop",
  presentation_mode: "landing",
  sections: [{ id: "section-1", label: "Main", order: 0, columns: 1, visible: true }],
  components: [],
});
const WIDTHS = ["full", "1/2", "1/3", "2/3", "1/4"];
const PRESENTATION_MODES = [
  { key: "landing", label: "Landing / Full Screen" },
  { key: "overlay_rectangle", label: "Rectangle Overlay" },
  { key: "overlay_square", label: "Square / Compact Overlay" },
];
const DEVICES = [
  { key: "desktop", label: "Desktop", Icon: Monitor },
  { key: "tablet", label: "Tablet", Icon: Tablet },
  { key: "mobile", label: "Mobile", Icon: Smartphone },
];
const spanClass = { full: "col-span-full", "1/2": "md:col-span-1", "1/3": "md:col-span-1", "2/3": "md:col-span-2", "1/4": "md:col-span-1" };

function normalizeDefinition(definition) {
  const source = definition && typeof definition === "object" ? definition : {};
  if (Array.isArray(source.sections) && Array.isArray(source.components)) {
    return { device: source.device || "desktop", presentation_mode: source.presentation_mode || "landing", sections: source.sections, components: source.components };
  }
  const legacy = source.builder;
  if (legacy?.regions) {
    return {
      device: legacy.device || "desktop",
      presentation_mode: source.presentation_mode || "landing",
      sections: legacy.regions.map((r, i) => ({ id: r.id || `section-${i + 1}`, label: r.label || "Section", order: i, columns: Number(r.columns) || 1, visible: r.visible !== false })),
      components: legacy.regions.flatMap((r) => (r.components || []).map((c) => ({ ...c, section_id: r.id }))),
    };
  }
  return fresh();
}

export default function PageBuilder({ onMessage, onError }) {
  const [apps, setApps] = useState([]), [appId, setAppId] = useState(""), [pages, setPages] = useState([]), [page, setPage] = useState(null);
  const [definition, setDefinition] = useState(fresh());
  const registry = useComponentRegistry();
  const [selected, setSelected] = useState(""), [preview, setPreview] = useState(false);

  useEffect(() => { apiRequest("/api/platform/apps").then((r) => setApps(r.data || [])).catch((e) => onError?.(e.message)); }, []);
  useEffect(() => { if (!appId) return setPages([]); apiRequest(`/api/platform/apps/${appId}/pages`).then((r) => setPages(r.data || [])).catch((e) => onError?.(e.message)); }, [appId]);

  /* Palette = the ONE shared registry view, ready-to-place components only. */
  const palette = useMemo(() => registryForBuilder(registry, "PAGE").filter((c) => c.key !== "section"), [registry]);
  const current = definition.components.find((c) => c.id === selected);
  const selectPage = (next) => { setPage(next); setDefinition(normalizeDefinition(next?.definition)); setSelected(""); };
  const patch = (fn) => setDefinition((value) => fn(value));
  const addSection = () => patch((d) => ({ ...d, sections: [...d.sections, { id: uid("section"), label: `Section ${d.sections.length + 1}`, order: d.sections.length, columns: 1, visible: true }] }));
  const addComponent = (sectionId, componentKey) => {
    const meta = componentByKey(registry, componentKey);
    if (!meta) { onError?.("Component metadata is unavailable. Refresh the builder and try again."); return; }
    const instance = createRegisteredComponent(meta, "PAGE");
    const id = instance.id;
    patch((d) => ({ ...d, components: [...d.components, {
      ...instance,
      component_key: meta.key,
      section_id: sectionId,
      order: d.components.length,
      width: "full",
      visible: true,
      props: {},
    }] }));
    setSelected(id);
  };
  const updateComponent = (changes) => patch((d) => ({ ...d, components: d.components.map((c) => c.id === selected ? { ...c, ...changes, props: { ...c.props, ...(changes.props || {}) } } : c) }));
  const removeComponent = () => { patch((d) => ({ ...d, components: d.components.filter((c) => c.id !== selected) })); setSelected(""); };
  const reorder = (sourceId, targetId, sectionId) => patch((d) => {
    const next = [...d.components];
    const from = next.findIndex((c) => c.id === sourceId), to = targetId ? next.findIndex((c) => c.id === targetId) : next.length;
    if (from < 0) return d;
    const [moved] = next.splice(from, 1);
    const insertAt = Math.max(0, to > from ? to - 1 : to);
    next.splice(targetId ? insertAt : next.length, 0, { ...moved, section_id: sectionId });
    return { ...d, components: next.map((c, order) => ({ ...c, order })) };
  });
  const save = async () => {
    if (!page) return;
    try {
      const next = { ...(page.definition || {}), ...definition };
      delete next.builder;
      const result = await apiRequest(`/api/platform/pages/${page.id}`, { method: "PUT", body: JSON.stringify({ definition: next }) });
      setPage(result.data); setPages((items) => items.map((p) => p.id === result.data.id ? result.data : p)); onMessage?.("Page layout saved.");
    } catch (error) { onError?.(error.message); }
  };

  return <div className="lab-surface min-w-0">
    {/* BUILDER TOOLBAR — device preview selector, presentation mode and
        Save/Activate in one row, like the Lightning App Builder header. */}
    <div className="lab-toolbar">
      <h2 className="lab-title">Form &amp; Page Builder</h2>
      <select className="onepos-input w-auto" aria-label="Select app" value={appId} onChange={(e) => { setAppId(e.target.value); setPage(null); }}><option value="">Select app</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <select className="onepos-input w-auto" aria-label="Select page" value={page?.id || ""} onChange={(e) => selectPage(pages.find((p) => p.id === e.target.value) || null)}><option value="">Select page</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      <select className="onepos-input w-auto" aria-label="Presentation mode" value={definition.presentation_mode || "landing"} onChange={(e) => patch((d) => ({ ...d, presentation_mode: e.target.value }))}>{PRESENTATION_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}</select>
      <button className="onepos-btn onepos-btn-secondary" onClick={() => setPreview((v) => !v)}>{preview ? <><Pencil size={14} /> Edit</> : <><Rocket size={14} /> Activate</>}</button>
      <button className="onepos-btn onepos-btn-primary" disabled={!page} title={page ? "Save the page layout" : "Select a page first"} onClick={save}><Save size={14} /> Save</button>
      {!page && <span className="lab-toolbar-hint">Select a page to enable Save</span>}
    </div>
    {!appId ? <div className="onepos-empty"><span className="onepos-empty-title">{apps.length ? "Select an app, then a page to compose." : "No apps available yet — create one under Apps first."}</span></div>
      : appId && !page ? <div className="onepos-empty"><span className="onepos-empty-title">{pages.length ? "Select a page to compose." : "This app has no pages yet — create one in Objects → Page Layouts / Record Pages."}</span></div>
      : <div className="lab-grid">
      {/* LEFT — component palette. */}
      {!preview && <aside className="lab-pane lab-palette">
        <div className="lab-pane-title">Components</div>
        <div className="lab-palette-list">
          {palette.map((item) => { const Icon = componentIcon(item); return <button key={item.key} draggable title={`${item.label} — ${componentCategoryLabel(item.category)}`} onDragStart={(e) => e.dataTransfer.setData("application/x-onepos-component", item.key)} onClick={() => addComponent(definition.sections[0]?.id, item.key)} className="lab-palette-item"><span className="flex items-center gap-2 min-w-0"><Icon size={14} className="shrink-0 opacity-60" aria-hidden="true" /><span className="truncate">{item.label}</span></span></button>; })}
        </div>
        <button className="lab-add-section" onClick={addSection}><Plus size={14}/> Add section</button>
      </aside>}
      {/* CENTRE — live canvas with the device preview selector above it. */}
      <main className={`lab-canvas ${definition.device === "mobile" ? "lab-device-mobile" : definition.device === "tablet" ? "lab-device-tablet" : ""}`}>
        <div className="lab-device-row" role="group" aria-label="Device preview">
          {DEVICES.map(({ key, label, Icon }) => (
            <button key={key} aria-pressed={definition.device === key} title={`${label} preview`} className={`lab-device-btn${definition.device === key ? " lab-device-btn-active" : ""}`} onClick={() => patch((d) => ({ ...d, device: key }))}>
              <Icon size={13} /> <span>{label}</span>
            </button>
          ))}
        </div>
        {definition.sections.map((section, sectionIndex) => {
          const items = definition.components.filter((c) => c.section_id === section.id);
          return <section key={section.id} className="lab-section" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const componentKey = e.dataTransfer.getData("application/x-onepos-component"); const componentId = e.dataTransfer.getData("application/x-onepos-placed"); if (componentKey) addComponent(section.id, componentKey); else if (componentId) reorder(componentId, "", section.id); }}>
            <div className="mb-2 flex flex-wrap items-center gap-2"><input className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={section.label} onChange={(e) => patch((d) => ({ ...d, sections: d.sections.map((s, i) => i === sectionIndex ? { ...s, label: e.target.value } : s) }))}/><select className="onepos-input w-auto shrink-0" aria-label="Section columns" value={section.columns} onChange={(e) => patch((d) => ({ ...d, sections: d.sections.map((s, i) => i === sectionIndex ? { ...s, columns: Number(e.target.value) } : s) }))}><option value="1">1 column</option><option value="2">2 columns</option><option value="3">3 columns</option></select></div>
            <div className={`grid gap-2 ${definition.device === "mobile" ? "grid-cols-1" : section.columns === 2 ? "md:grid-cols-2" : section.columns === 3 ? "md:grid-cols-3" : "grid-cols-1"}`}>{items.map((c) => <button type="button" key={c.id} draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("application/x-onepos-placed", c.id); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const source = e.dataTransfer.getData("application/x-onepos-placed"); if (source) reorder(source, c.id, section.id); }} onClick={() => setSelected(c.id)} aria-pressed={selected === c.id} className={`lab-component ${spanClass[c.width] || "col-span-full"} ${selected === c.id ? "lab-component-selected" : ""}`}><div className="flex items-center gap-2 min-w-0"><GripVertical size={14} className="shrink-0 opacity-50"/><b className="truncate">{c.label}</b></div><div className="mt-1 text-xs opacity-60 truncate">{c.component_key}</div></button>)}</div>
            {!items.length && <div className="py-8 text-center text-sm opacity-60">Drag a component here, or click one in the palette to add it.</div>}
          </section>;
        })}
      </main>
      {/* RIGHT — properties panel. */}
      {!preview && <aside className="lab-pane lab-properties">
        <div className="lab-pane-title">Properties</div>
        {current ? <div className="space-y-3"><label className="block text-xs font-medium">Label<input className="onepos-input mt-1 w-full" value={current.label || ""} onChange={(e) => updateComponent({ label: e.target.value })}/></label><label className="block text-xs font-medium">Width<select className="onepos-input mt-1 w-full" value={current.width || "full"} onChange={(e) => updateComponent({ width: e.target.value })}>{WIDTHS.map((w) => <option key={w}>{w}</option>)}</select></label><MetadataResourcePicker objectKey={page?.object_key || page?.definition?.object_key || ""} label="Record / field binding" value={current.props?.binding || ""} onChange={(binding) => updateComponent({ props: { binding } })}/><MetadataResourcePicker objectKey={page?.object_key || page?.definition?.object_key || ""} label="Visibility field" value={current.props?.visibility_path || ""} onChange={(visibility_path) => updateComponent({ props: { visibility_path } })}/><button className="lab-remove" onClick={removeComponent}><Trash2 size={14}/> Remove component</button></div> : <span className="text-sm opacity-60">Select a component on the canvas to configure it.</span>}
      </aside>}
    </div>}
  </div>;
}
