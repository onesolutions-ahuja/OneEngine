import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Eye, GripVertical, Minus, Monitor, MonitorSmartphone, MoveDiagonal2, Plus, Redo2, Smartphone, Tablet, Trash2, Undo2 } from "lucide-react";
import { apiRequest } from "../../../services/api.js";
import {
  componentByKey,
  componentCategoryLabel,
  componentIcon,
  createRegisteredComponent,
  normalizedRegistry,
  registryForBuilder,
  useComponentRegistry,
} from "./componentRegistry.js";
import CustomPageRenderer, { useRecordCollection } from "../../../components/platform/CustomPageRenderer.jsx";
import ActionWorkflowPicker, { describeInteraction } from "./ActionWorkflowPicker.jsx";
import { CONDITION_OPERATORS } from "./conditionOperators.js";
import {
  CONTAINER_SIZES,
  MAX_RECORD_LIMIT,
  SECTION_WIDTHS,
  canDropNode,
  duplicateNodeInSections,
  findNode,
  makeNodeId,
  multiContainerColumns,
  nodeLabel,
  normalizeCustomPageTree,
  removeNodeFromSections,
  updateNodeInSections,
} from "./customPageTree.js";

/*
 * VISUAL CUSTOM PAGE BUILDER — WYSIWYG, drag-and-drop, live canvas.
 *
 * Layout (canvas gets the majority of width):
 *
 *   COMPONENTS (palette)  │        LIVE CANVAS         │  PROPERTIES
 *   from the Component    │   shared renderer in       │  selected node
 *   Registry              │   builder mode             │
 *
 * The canvas renders through CustomPageRenderer — the SAME component the
 * runtime page uses — with selection outlines and drop zones layered on top.
 * Property changes re-render instantly; Save is explicit and stores into the
 * existing platform_pages.definition through the existing pages API.
 *
 * Architecture rules honoured here:
 *   - palette comes from /api/platform/component-registry (no second list)
 *   - On Click references go through the generic ActionWorkflowPicker
 *   - `+ New Workflow` happens in-screen (no navigation, no state loss)
 *   - builder-only controls (move/duplicate/delete) never reach runtime
 */

const DRAG_MIME_PALETTE = "application/x-onepos-cpb-palette";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm";
const labelClass = "block text-xs font-medium text-slate-500";

const BUILDER_CSS = `
  .cpb-builder{display:flex;flex-direction:column;gap:10px;min-width:0;color:#17212b}
  .cpb-toolbar{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;padding:0 2px}
  .cpb-back-button{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border:1px solid #d9dde2;border-radius:999px;background:#fff;color:#3f4a54;box-shadow:0 1px 2px rgba(15,23,42,.04);cursor:pointer}
  .cpb-back-button:hover{background:#f5f7f7;border-color:#bcc6c8;color:#176f6a}
  .cpb-shell{
    display:grid;
    grid-template-columns:minmax(250px,280px) minmax(520px,1fr) minmax(300px,340px);
    gap:10px;
    width:100%;
    min-width:0;
    height:clamp(540px,calc(100dvh - 205px),860px);
    min-height:0;
    align-items:stretch;
  }
  .cpb-shell.is-palette-collapsed{grid-template-columns:minmax(520px,1fr) minmax(300px,340px)}
  .cpb-shell.is-properties-collapsed{grid-template-columns:minmax(250px,280px) minmax(520px,1fr)}
  .cpb-shell.is-palette-collapsed.is-properties-collapsed{grid-template-columns:minmax(520px,1fr)}
  .cpb-panel-toggle{white-space:nowrap}
  .cpb-panel{
    min-width:0;
    min-height:0;
    border:1px solid #e4e7eb;
    border-radius:12px;
    background:#fff;
    box-shadow:0 1px 2px rgba(15,23,42,.03);
  }
  .cpb-palette{display:flex;flex-direction:column;overflow:hidden;padding:0!important}
  .cpb-palette-head{flex:0 0 auto;padding:14px 14px 10px;border-bottom:1px solid #eef0f2;background:#fff}
  .cpb-palette-title{margin:0 0 10px;font-size:13px;font-weight:700;color:#222b33}
  .cpb-palette-search{display:flex;align-items:center;height:36px;border:1px solid #d9dde2;border-radius:9px;background:#fff;padding:0 10px}
  .cpb-palette-search input{width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:12px;color:#25313b}
  .cpb-palette-search input::placeholder{color:#98a1aa}
  .cpb-palette-scroll{min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 10px 14px;overscroll-behavior:contain;scrollbar-gutter:stable}
  .cpb-palette-scroll::-webkit-scrollbar,.cpb-properties-scroll::-webkit-scrollbar{width:8px;height:8px}
  .cpb-palette-scroll::-webkit-scrollbar-thumb,.cpb-properties-scroll::-webkit-scrollbar-thumb{background:#c8cdd3;border-radius:999px;border:2px solid transparent;background-clip:padding-box}
  .cpb-canvas::-webkit-scrollbar{width:12px;height:12px}
  .cpb-canvas::-webkit-scrollbar-track{background:#e5e8eb;border-radius:999px}
  .cpb-canvas::-webkit-scrollbar-thumb{background:#9aa4ad;border:2px solid #e5e8eb;border-radius:999px}
  .cpb-palette-group{padding:4px 0 8px}
  .cpb-palette-group-title{display:flex;align-items:center;justify-content:space-between;margin:0 2px 7px;font-size:10.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#68727d}
  .cpb-palette-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .cpb-palette-item{
    display:flex;min-width:0;min-height:54px;flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;
    border:1px solid #e2e5e9;border-radius:9px;background:#fff;padding:8px 9px;text-align:left;font-size:11px;font-weight:600;color:#36414b;cursor:grab;
    transition:border-color .14s ease,background .14s ease,box-shadow .14s ease,transform .14s ease;
  }
  .cpb-palette-item:hover{border-color:#9dbeb8;background:#f8fbfa;box-shadow:0 2px 8px rgba(20,80,70,.06);transform:translateY(-1px)}
  .cpb-palette-item svg{width:16px;height:16px;padding:2px;border-radius:4px;color:#176f6a!important;background:#e8f6f3}
  .cpb-palette-item:nth-child(4n+2) svg{color:#9a6700!important;background:#fff4d6}
  .cpb-palette-item:nth-child(4n+3) svg{color:#a23e72!important;background:#fdebf4}
  .cpb-palette-item:nth-child(4n+4) svg{color:#5566aa!important;background:#edf0ff}
  .cpb-palette-empty{padding:18px 8px;text-align:center;font-size:11px;color:#89939d}
  .cpb-section-tools{border-top:1px solid #edf0f2;margin-top:3px;padding-top:9px}
  .cpb-canvas-column{display:flex;min-width:0;min-height:0;flex-direction:column;gap:6px}
  .cpb-horizontal-scroll{flex:0 0 auto;display:flex;align-items:center;gap:8px;height:24px;padding:0 8px;border:1px solid #e2e5e9;border-radius:8px;background:#fff}
  .cpb-horizontal-scroll span{font-size:10px;color:#7b858e;white-space:nowrap}
  .cpb-horizontal-scroll input{width:100%;min-width:0}
  .cpb-canvas{
    min-width:0;min-height:0;height:100%;overflow:scroll;
    border:1px solid #e2e5e9;border-radius:12px;background:#f3f4f5;padding:18px;
    overscroll-behavior:contain;cursor:grab;user-select:none;scrollbar-width:auto;scrollbar-color:#9aa4ad #e5e8eb;
  }
  .cpb-canvas.is-panning{cursor:grabbing}
  .cpb-canvas input,.cpb-canvas select,.cpb-canvas textarea,.cpb-canvas button,.cpb-canvas a{user-select:auto}
  .cpb-node{position:relative;min-width:90px;min-height:38px;max-width:100%;cursor:default;overflow:visible}
  .cpb-resize-handle{position:absolute;right:-5px;bottom:-5px;z-index:12;width:20px;height:20px;display:grid;place-items:center;border:1px solid #9dbeb8;border-radius:6px;background:#fff;color:#147d70;box-shadow:0 2px 8px rgba(15,23,42,.12);cursor:nwse-resize;touch-action:none}
  .cpb-resize-handle:hover{background:#edf8f6;border-color:#147d70}
  .cpb-node-actions{position:absolute;top:4px;right:38px;z-index:8;display:flex;align-items:center;gap:3px;padding:3px;border:1px solid #cad4d2;border-radius:8px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.10)}
  .cpb-node-remove{position:absolute;top:4px;right:6px;z-index:9;width:28px;height:28px;display:grid;place-items:center;border:1px solid #d2d7dc;border-radius:999px;background:#fff;color:#5f6972;box-shadow:0 2px 8px rgba(15,23,42,.10);cursor:pointer}
  .cpb-node-remove:hover{border-color:#fecaca;background:#fff1f2;color:#dc2626}
  .cpb-node-actions button{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:#53606a;cursor:pointer}
  .cpb-node-actions button:hover{background:#f0f4f3;color:#176f6a}
  .cpb-node-actions button.is-danger:hover{background:#fff1f2;color:#dc2626}
  .cpb-tree{min-height:100%;padding:2px}
  .cpb-device-frame{box-sizing:border-box;margin:0 auto;min-height:100%;background:#fff;transition:width .18s ease,min-height .18s ease,border-radius .18s ease;box-shadow:0 8px 28px rgba(15,23,42,.10)}
  .cpb-device-frame.is-desktop{width:100%;min-width:760px;box-shadow:none;background:transparent}
  .cpb-device-frame.is-tablet{width:820px;min-height:1080px;border:10px solid #202428;border-radius:26px;padding:14px}
  .cpb-device-frame.is-mobile{width:390px;min-height:844px;border:10px solid #202428;border-radius:34px;padding:14px}
  .cpb-device-frame.is-kiosk{width:1024px;min-height:768px;border:12px solid #202428;border-radius:18px;padding:14px}
  .cpb-device-frame.is-tablet:before,.cpb-device-frame.is-mobile:before{content:"";display:block;width:42px;height:5px;margin:-5px auto 10px;border-radius:999px;background:#50555a}
  .cpb-canvas .onepos-card{border-color:#dfe3e7!important;box-shadow:none!important;background:#fff!important}
  .cpb-empty{display:grid;place-items:center;min-height:110px;border:1px dashed #cfd5da;border-radius:10px;background:#fbfcfc;color:#76808a;text-align:center;font-size:12px}
  .cpb-dropzone{outline:2px dashed #2d8b80;outline-offset:2px;border-radius:8px}
  .cpb-insert-target{min-height:22px;margin:3px 0;display:flex;align-items:center;justify-content:center;border:1px dashed #c9d2d8;border-radius:7px;background:#f8fafb;color:#7b858e;font-size:10px;opacity:.72;transition:.12s ease}
  .cpb-insert-target:hover,.cpb-insert-target.cpb-dropzone{min-height:34px;border-color:#2d8b80;background:#edf8f6;color:#176f6a;opacity:1}
  .cpb-node-selected{outline:2px solid #2d8b80;outline-offset:3px;border-radius:8px}
  .cpb-section-selected{outline:2px solid #2d8b80;outline-offset:3px}
  .cpb-device-btn{
    display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;
    border:1px solid #dde1e5;border-radius:8px;background:#fff;padding:6px 10px;font-size:11px;font-weight:600;color:#4e5964;
    transition:background .14s ease,border-color .14s ease,color .14s ease;
  }
  .cpb-device-btn:hover:not(:disabled){border-color:#b9c2ca;background:#f7f8f9}
  .cpb-device-btn.active{background:#147d70;border-color:#147d70;color:#fff}
  .cpb-device-btn:disabled{opacity:.45;cursor:not-allowed}
  .cpb-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #e2e5e9;border-radius:999px;background:#f7f8f9;padding:4px 9px;font-size:10.5px;color:#65707a}
  .cpb-properties{display:flex;flex-direction:column;overflow:hidden;padding:0!important}
  .cpb-properties-tabs{display:flex;align-items:center;gap:0;flex:0 0 auto;height:48px;padding:0 8px;border-bottom:1px solid #edf0f2;background:#fff;overflow-x:auto;scrollbar-width:none}.cpb-properties-tabs::-webkit-scrollbar{display:none}
  .cpb-properties-tabs button{height:34px;flex:0 0 auto;border:0;border-bottom:2px solid transparent;background:transparent;padding:0 8px;font-size:10.5px;font-weight:700;color:#68727d;cursor:pointer}
  .cpb-properties-tabs button.active{border-bottom-color:#147d70;color:#166e65}
  .cpb-properties-scroll{min-height:0;overflow-y:auto;padding:14px;overscroll-behavior:contain}
  .cpb-properties-scroll fieldset{border-color:#e3e6e9!important}
  .cpb-properties-scroll input,.cpb-properties-scroll select,.cpb-properties-scroll textarea{border-color:#d9dde2!important}
  .cpb-properties-scroll input:focus,.cpb-properties-scroll select:focus,.cpb-properties-scroll textarea:focus{outline:none;border-color:#5b9f97!important;box-shadow:0 0 0 2px rgba(20,125,112,.10)}
  .cpb-page-settings{display:grid;gap:13px}
  .cpb-page-settings h3{margin:0;font-size:13px;color:#26313a}
  .cpb-page-settings p{margin:0;font-size:10.5px;line-height:1.45;color:#7a848e}
  @media(max-width:1180px){
    .cpb-shell{grid-template-columns:220px minmax(380px,1fr);height:clamp(540px,calc(100dvh - 205px),860px)}
    .cpb-shell.is-palette-collapsed{grid-template-columns:minmax(380px,1fr)}
    .cpb-shell.is-properties-collapsed{grid-template-columns:220px minmax(380px,1fr)}
    .cpb-shell.is-palette-collapsed.is-properties-collapsed{grid-template-columns:minmax(380px,1fr)}
    .cpb-properties{position:absolute;z-index:80;right:12px;width:min(256px,88vw);height:calc(100% - 24px);box-shadow:0 18px 50px rgba(15,23,42,.16)}
  }
  @media(max-width:760px){
    .cpb-shell{grid-template-columns:minmax(180px,220px) minmax(340px,1fr);overflow-x:auto}
    .cpb-palette-grid{grid-template-columns:1fr}
  }
`

function uid(prefix) { return makeNodeId(prefix); }
function targetPageFromList(response, pageId) { return (Array.isArray(response?.data) ? response.data : []).find((row) => String(row.id) === String(pageId)) || null; }

function collectPageNodes(sections, excludeId = "") {
  const rows = [];
  const visit = (nodes = []) => {
    for (const node of nodes) {
      if (!node?.id) continue;
      if (String(node.id) !== String(excludeId || "")) {
        rows.push({
          id: node.id,
          componentKey: node.componentKey,
          label: `${node.label || node.text || nodeLabel(node)} · ${node.componentKey}`,
        });
      }
      if (Array.isArray(node.children)) visit(node.children);
    }
  };
  for (const section of sections || []) visit(section.children || []);
  return rows;
}

function newPageDraft() {
  return {
    pageKey: "",
    label: "New Custom Page",
    presentation_mode: "landing",
    device: "desktop",
    resources: { parameters: [], variables: [] },
    sections: [],
  };
}

/**
 * Palette groups derived from the ONE shared Component Registry view —
 * grouped by the registry's own categories (friendly labels via the shared
 * helper); no second hard-coded component list and no ad-hoc grouping.
 */
function paletteGroups(registry) {
  const components = registryForBuilder(normalizedRegistry(registry), "PAGE").filter((component) => component.key !== "section");
  const groups = [];
  for (const component of components) {
    const label = componentCategoryLabel(component.category);
    let group = groups.find((candidate) => candidate.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push(component);
  }
  return groups;
}

export default function CustomPageBuilder({ onMessage, onError, initialAppId = "", initialPageId = "", context = "user", lockApp = false, onBack = null }) {
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState(() => String(initialAppId || ""));
  const [pages, setPages] = useState([]);
  const [pageId, setPageId] = useState(() => String(initialPageId || ""));
  const [page, setPage] = useState(null);
  const [draft, setDraft] = useState(() => newPageDraft());
  const [paletteQuery, setPaletteQuery] = useState("");
  const registry = useComponentRegistry();
  const visiblePaletteGroups = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    return paletteGroups(registry)
      .map((group) => ({
        ...group,
        items: group.items.filter((component) => component.key !== "section" && (!query || [component.label, component.key, group.label].some((value) => String(value || "").toLowerCase().includes(query)))),
      }))
      .filter((group) => group.items.length);
  }, [registry, paletteQuery]);
  const [objects, setObjects] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [preview, setPreview] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testTrace, setTestTrace] = useState([]);
  const [testBusy, setTestBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [versions, setVersions] = useState([]);
  const [showVersions, setShowVersions] = useState(false);
  const [panelMode, setPanelMode] = useState("properties");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  /* Undo/redo: bounded snapshot stack of draft trees. Every mutation pushes. */
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const skipHistoryRef = useRef(false);
  const canvasViewportRef = useRef(null);
  const panRef = useRef(null);
  const resizeNodeRef = useRef(null);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [canvasScroll, setCanvasScroll] = useState({ left: 0, max: 0 });

  useEffect(() => {
    apiRequest("/api/platform/apps").then((response) => setApps(response.data || [])).catch((error) => onError?.(error.message));
    apiRequest("/api/platform/objects").then((response) => setObjects(Array.isArray(response?.data?.objects) ? response.data.objects : Array.isArray(response?.data) ? response.data : [])).catch(() => {});
  }, [onError]);

  useEffect(() => {
    if (initialAppId && String(initialAppId) !== String(appId || "")) setAppId(String(initialAppId));
  }, [initialAppId]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport || preview) return undefined;
    const sync = () => setCanvasScroll({
      left: Math.round(viewport.scrollLeft),
      max: Math.max(0, Math.round(viewport.scrollWidth - viewport.clientWidth)),
    });
    sync();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    resizeObserver?.observe(viewport);
    const frame = viewport.querySelector(".cpb-device-frame");
    if (frame) resizeObserver?.observe(frame);
    viewport.addEventListener("scroll", sync, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", sync);
      resizeObserver?.disconnect();
    };
  }, [draft.device, draft.sections, preview]);

  useEffect(() => {
    if (!initialPageId || !pages.length) return;
    const target = pages.find((row) => String(row.id) === String(initialPageId));
    if (target && String(pageId || "") !== String(target.id)) loadPage(target);
  }, [initialPageId, pages]);

  useEffect(() => {
    if (!appId) { setPages([]); setPageId(""); setPage(null); return; }
    apiRequest(`/api/platform/apps/${appId}/pages`).then((response) => setPages(response.data || [])).catch((error) => onError?.(error.message));
  }, [appId, onError]);

  const applyDraft = useCallback((updater, { history = true } = {}) => {
    setDraft((current) => {
      if (history && !skipHistoryRef.current) {
        setUndoStack((stack) => [...stack.slice(-49), current]);
        setRedoStack([]);
      }
      const next = typeof updater === "function" ? updater(current) : updater;
      setDirty(true);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1];
      setDraft((current) => { setRedoStack((redo) => [...redo.slice(-49), current]); return previous; });
      setDirty(true);
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const next = stack[stack.length - 1];
      setDraft((current) => { setUndoStack((undo) => [...undo.slice(-49), current]); return next; });
      setDirty(true);
      return stack.slice(0, -1);
    });
  }, []);

  const loadVersions = async (id) => {
    if (!id) { setVersions([]); return []; }
    try {
      const response = await apiRequest(`/api/platform/pages/${encodeURIComponent(id)}/versions`);
      const rows = Array.isArray(response?.data) ? response.data : [];
      setVersions(rows);
      return rows;
    } catch {
      setVersions([]);
      return [];
    }
  };

  const loadPage = (row) => {
    setPageId(row?.id || "");
    setPage(row || null);
    const tree = normalizeCustomPageTree(row?.draft_definition || row?.definition || {});
    setDraft({ pageKey: row?.page_key || "", label: row?.label || "Custom Page", presentation_mode: tree.presentation_mode, device: tree.device, resources: tree.resources, sections: tree.sections });
    setUndoStack([]); setRedoStack([]); setSelectedNodeId(null); setSelectedSectionId(null); setDirty(false); setPreview(false); setShowVersions(false);
    if (row?.id) void loadVersions(row.id); else setVersions([]);
  };

  const openNewPage = () => {
    setPage(null); setPageId("");
    const fresh = newPageDraft();
    setDraft(fresh);
    setUndoStack([]); setRedoStack([]); setSelectedNodeId(null); setSelectedSectionId(null); setDirty(false); setPreview(false); setVersions([]); setShowVersions(false);
  };

  /* ------------------------------ mutations ------------------------------ */

  const addSection = (width = "full", atIndex = null) => {
    const section = { id: uid("section"), width, children: [] };
    applyDraft((current) => {
      const sections = [...current.sections];
      sections.splice(atIndex ?? sections.length, 0, section);
      return { ...current, sections };
    });
    setSelectedSectionId(section.id); setSelectedNodeId(null);
  };

  const updateSection = (sectionId, changes) => {
    applyDraft((current) => ({
      ...current,
      sections: current.sections.map((section) => (section.id === sectionId ? { ...section, ...changes } : section)),
    }));
  };

  const moveSection = (fromIndex, toIndex) => {
    applyDraft((current) => {
      const sections = [...current.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(Math.max(0, Math.min(toIndex, sections.length)), 0, moved);
      return { ...current, sections };
    });
  };

  const removeSection = (sectionId) => {
    applyDraft((current) => ({ ...current, sections: current.sections.filter((section) => section.id !== sectionId) }));
    if (selectedSectionId === sectionId) { setSelectedSectionId(null); setSelectedNodeId(null); }
  };

  const componentMeta = (componentKey) => componentByKey(registry, componentKey) || { key: componentKey, label: nodeLabel({ componentKey }) };

  const newNodeFor = (componentKey) => {
    const meta = componentMeta(componentKey);
    if (meta.runtimeKind === "analytics") return createRegisteredComponent(meta, "PAGE");
    if (componentKey === "container") return { id: uid("container"), componentKey, label: meta.label, size: "medium", columns: 2, spacing: 3, children: [] };
    if (componentKey === "multi_container") {
      return {
        id: uid("multi_container"), componentKey, label: meta.label, containerSize: "medium", spacing: 3, clickable: true,
        collection: { objectKey: "", conditions: [], conditionMatch: "all", sort: [], maxRecords: 10, pagination: false, fields: [], titleField: "", subtitleField: "" },
        interaction: { type: "none" },
      };
    }
    if (componentKey === "table") {
      /* Same Record Collection datasource as MultiContainer — configured by
         the SAME properties groups, just without card sizing. */
      return {
        id: uid("table"), componentKey, label: meta.label, clickable: true,
        collection: { objectKey: "", conditions: [], conditionMatch: "all", sort: [], maxRecords: 10, pagination: false, fields: [] },
        interaction: { type: "none" },
      };
    }
    if (componentKey === "tree_view") {
      return {
        id: uid("tree_view"), componentKey, label: meta.label, collection: { objectKey: "", conditions: [], conditionMatch: "all", sort: [], maxRecords: 10, pagination: false, fields: [] },
        config: {
          parentField: "parent_id",
          labelField: "name",
          secondaryField: "status",
          maxDepth: 3,
          showCounts: true,
          allowCollapse: true,
          defaultExpandedDepth: 1,
        },
        interaction: { type: "none" },
      };
    }
    if (componentKey === "process_path") {
      return {
        id: uid("process_path"),
        componentKey,
        label: meta.label,
        collection: { objectKey: "", conditions: [], conditionMatch: "all", sort: [], maxRecords: 1, pagination: false, fields: [] },
        config: {
          statusField: "status",
          titleField: "name",
          stages: [],
          allowStageChange: false,
          keyFields: [],
          guidance: {},
        },
        interaction: { type: "none" },
      };
    }
    if (["timeline", "kanban", "calendar", "scheduler", "gantt", "map", "hierarchy_viewer", "file_viewer", "signature"].includes(componentKey)) {
      const defaults = {
        timeline: { dateField: "created_at", titleField: "name", secondaryField: "status", groupBy: "day", maxRecords: 10 },
        kanban: { groupField: "status", titleField: "name", subtitleField: "status", maxRecords: 12, allowDragDrop: true },
        calendar: { startField: "start_date", endField: "end_date", titleField: "name", subtitleField: "status", categoryField: "status", defaultView: "month" },
        scheduler: { resourceField: "assignee_id", resourceLabelField: "name", startField: "start_at", endField: "end_at", titleField: "name", statusField: "status", workingHours: { start: "09:00", end: "17:00" }, slotInterval: 30 },
        gantt: { taskLabelField: "name", startField: "start_date", endField: "end_date", progressField: "progress", scale: "week" },
        map: { locationMode: "latlng", latitudeField: "latitude", longitudeField: "longitude", labelField: "name", defaultZoom: 10 },
        hierarchy_viewer: { parentField: "parent_id", titleField: "name", maxDepth: 3, orientation: "vertical" },
        file_viewer: { displayMode: "grid", filenameField: "filename", typeField: "file_type", maxItems: 12 },
        signature: { fieldKey: "signature", label: "Signature", displayMode: "capture", width: 320, height: 180 },
      }[componentKey];
      return {
        id: uid(componentKey), componentKey, label: meta.label, collection: { objectKey: "", conditions: [], conditionMatch: "all", sort: [], maxRecords: 10, pagination: false, fields: [] },
        config: { ...defaults },
        interaction: { type: "none" },
      };
    }
    if (componentKey === "button") return { id: uid("button"), componentKey, label: meta.label || "Button", variant: "primary", size: "medium", interaction: { type: "none" } };
    if (componentKey === "header") return { id: uid("header"), componentKey, text: meta.label || "Heading" };
    if (componentKey === "text") return { id: uid("text"), componentKey, text: meta.label || "Text" };
    if (componentKey === "divider") return { id: uid("divider"), componentKey };
    if (componentKey === "spacer") return { id: uid("spacer"), componentKey, spacing: 3 };
    if (componentKey === "field_value") return { id: uid("field_value"), componentKey, field: "" };
    if (componentKey === "related_list") return { id: uid("related_list"), componentKey, relationshipKey: "", limit: 10 };
    return createRegisteredComponent(meta, "PAGE");
  };

  const addComponentToNewSection = (componentKey, width = "full") => {
    if (!canDropNode({ parentComponentKey: null, droppedComponentKey: componentKey, droppedIsSection: false })) return;
    const node = newNodeFor(componentKey);
    const section = { id: uid("section"), width, children: [node] };
    applyDraft((current) => ({ ...current, sections: [...current.sections, section] }));
    setSelectedNodeId(node.id);
    setSelectedSectionId(null);
  };

  const dropIntoSection = (sectionId, payload, index = null) => {
    const section = draft.sections.find((item) => item.id === sectionId);
    if (!section) return;
    if (payload.kind === "palette") {
      if (!canDropNode({ parentComponentKey: null, droppedComponentKey: payload.componentKey, droppedIsSection: false })) return;
      const node = newNodeFor(payload.componentKey);
      applyDraft((current) => ({
        ...current,
        sections: current.sections.map((item) => {
          if (item.id !== sectionId) return item;
          const children = [...item.children];
          children.splice(index ?? children.length, 0, node);
          return { ...item, children };
        }),
      }));
      setSelectedNodeId(node.id); setSelectedSectionId(null);
      return;
    }
    return;
  };

  const dropIntoNode = (parentNodeId, payload, index = null) => {
    const found = findNode(draft.sections, parentNodeId);
    if (!found) return;
    const parentKey = found.node.componentKey;
    if (payload.kind === "palette") {
      if (!canDropNode({ parentComponentKey: parentKey, droppedComponentKey: payload.componentKey })) return;
      const node = newNodeFor(payload.componentKey);
      applyDraft((current) => ({ ...current, sections: updateNodeInSections(current.sections, parentNodeId, (parent) => ({
        ...parent,
        children: (() => { const children = [...(parent.children || [])]; children.splice(index ?? children.length, 0, node); return children; })(),
      })) }));
      setSelectedNodeId(node.id);
      return;
    }
    return;
  };

  /* The customPageTree helpers return a SECTIONS ARRAY, so the draft object
     must be re-wrapped around the result. Returning the bare array would
     replace the whole draft and leave `draft.sections` undefined. */
const updateNode = (nodeId, changes) => {
  applyDraft((current) => ({
    ...current,
    sections: updateNodeInSections(
      current.sections,
      nodeId,
      (node) => ({ ...node, ...changes })
    ),
  }));
};

  const removeSelectedNode = () => {
    if (!selectedNodeId) return;
    applyDraft((current) => ({ ...current, sections: removeNodeFromSections(current.sections, selectedNodeId) }));
    setSelectedNodeId(null);
  };

  const duplicateSelectedNode = () => {
    if (!selectedNodeId) return;
    applyDraft((current) => ({ ...current, sections: duplicateNodeInSections(current.sections, selectedNodeId) }));
  };

  useEffect(() => {
    const handleDeleteKey = (event) => {
      if (!selectedNodeId || preview) return;
      const tag = String(event.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      removeSelectedNode();
    };
    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [selectedNodeId, preview]);

  const beginCanvasPan = (event) => {
    if (preview || event.button !== 0 || event.target !== event.currentTarget) return;
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    panRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    setCanvasPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveCanvasPan = (event) => {
    const viewport = canvasViewportRef.current;
    const pan = panRef.current;
    if (!viewport || !pan) return;
    viewport.scrollLeft = pan.left - (event.clientX - pan.x);
    viewport.scrollTop = pan.top - (event.clientY - pan.y);
  };
  const endCanvasPan = (event) => {
    if (!panRef.current) return;
    panRef.current = null;
    setCanvasPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const beginNodeResize = (nodeId, event) => {
    if (preview || !nodeId) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget.closest(".cpb-node");
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const state = {
      nodeId,
      element,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    resizeNodeRef.current = state;
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const move = (moveEvent) => {
      const active = resizeNodeRef.current;
      if (!active || active.nodeId !== nodeId) return;
      const width = Math.max(90, Math.min(2400, active.startWidth + (moveEvent.clientX - active.startX)));
      const height = Math.max(38, Math.min(1800, active.startHeight + (moveEvent.clientY - active.startY)));
      active.element.style.width = `${Math.round(width)}px`;
      active.element.style.height = `${Math.round(height)}px`;
    };
    const end = () => {
      const active = resizeNodeRef.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!active || active.nodeId !== nodeId) return;
      resizeNodeRef.current = null;
      const resized = active.element.getBoundingClientRect();
      const width = Math.round(resized.width);
      const height = Math.round(resized.height);
      const currentLayout = findNode(draft.sections, nodeId)?.node?.layout || {};
      if (Math.abs(Number(currentLayout.width || 0) - width) <= 1 && Math.abs(Number(currentLayout.height || 0) - height) <= 1) return;
      updateNode(nodeId, { layout: { ...currentLayout, width, height } });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  };

  const testNodeInteraction = async ({ node, record = null }) => {
    const interaction=node?.interaction||{};
    if(!["workflow","screen_flow"].includes(interaction.type)){setTestTrace([{kind:"page_event",status:"skipped",detail:{message:"Select a component with a Flow-backed event to run rollback Test."}}]);return;}
    try{setTestBusy(true);const response=await apiRequest("/api/platform/runtime/page-interactions/test",{method:"POST",body:JSON.stringify({nodeId:node?.id||null,event:"click",interaction,recordId:record?.id||record?.record_id||null,pageContext:{params:{},variables:Object.fromEntries((draft.resources?.variables||[]).map(v=>[v.key,v.defaultValue??null])),components:{},flows:{}}})});setTestTrace(response?.data?.trace||[]);if(!response?.success)throw new Error(response?.message||"Page Test failed");onMessage?.("Test completed. Database changes rolled back.");}catch(error){onError?.(error.message);setTestTrace((current)=>current.length?current:[{kind:"error",status:"failed",detail:{message:error.message}}]);}finally{setTestBusy(false);}
  };

  /* ------------------------------- save ---------------------------------- */

  const definitionForSave = () => normalizeCustomPageTree({
    device: draft.device,
    presentation_mode: draft.presentation_mode,
    resources: draft.resources,
    sections: draft.sections.map((section) => ({
      id: section.id,
      width: section.width,
      visible: section.visible !== false,
      children: section.children,
    })),
  });

  const save = async () => {
    setSaving(true);
    try {
      const definition = definitionForSave();
      let saved = null;
      let savedAppId = appId;
      if (pageId) {
        const response = await apiRequest(`/api/platform/pages/${encodeURIComponent(pageId)}`, { method: "PUT", body: JSON.stringify({ definition, label: draft.label }) });
        saved = response.data;
        setPage(saved);
        const tree = normalizeCustomPageTree(saved?.draft_definition || definition);
        setDraft({ ...draft, label: saved?.label || draft.label, presentation_mode: tree.presentation_mode, device: tree.device, resources: tree.resources, sections: tree.sections });
        setPages((current) => current.map((row) => row.id === saved?.id ? saved : row));
        if (saved?.id) await loadVersions(saved.id);
        onMessage?.("Draft saved.");
      } else {
        let targetApp = appId || (context === "developer" ? "" : apps[0]?.id);
        if (!targetApp && context === "developer") {
          throw new Error("Developer Page Builder requires a package app context.");
        }
        if (!targetApp) {
          const createdApp = await apiRequest("/api/platform/apps", { method: "POST", body: JSON.stringify({ label: "Custom Pages", appKey: "custom_pages" }) });
          setApps((current) => [...current, createdApp.data]);
          targetApp = createdApp.data.id;
        }
        const pageKey = draft.pageKey?.trim() || `custom_page_${Date.now().toString(36)}`;
        const response = await apiRequest(`/api/platform/apps/${targetApp}/pages`, {
          method: "POST",
          body: JSON.stringify({ label: draft.label, pageKey, pageType: "object", definition }),
        });
        saved = response.data;
        savedAppId = targetApp;
        setPage(saved); setPageId(saved.id); setAppId(targetApp);
        setPages((current) => [...current, saved]);
        await loadVersions(saved.id);
        onMessage?.("Draft created.");
      }
      // Re-read the persisted draft before declaring save complete. This is
      // the same definition the next edit session will reopen, so save/reopen
      // drift is detected immediately instead of reaching runtime.
      if (saved?.id) {
        // Re-open from the authoritative app page list. The platform exposes
        // page reads through the app-scoped collection, not a standalone
        // /pages/:id GET route.
        const reopened = targetPageFromList(await apiRequest(`/api/platform/apps/${encodeURIComponent(saved.app_id || savedAppId)}/pages`), saved.id);
        if (reopened) {
          saved = reopened;
          setPage(saved);
          const persistedTree = normalizeCustomPageTree(saved?.draft_definition || saved?.definition || {});
          setDraft((current) => ({
            ...current,
            pageKey: saved?.page_key || current.pageKey,
            label: saved?.label || current.label,
            presentation_mode: persistedTree.presentation_mode,
            device: persistedTree.device,
            resources: persistedTree.resources,
            sections: persistedTree.sections,
          }));
          setPages((current) => current.map((row) => row.id === saved.id ? saved : row));
        }
      }
      setUndoStack([]); setRedoStack([]); setDirty(false);
      return saved;
    } catch (error) {
      onError?.(error.message || "Unable to save the draft.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const activatePage = async () => {
    setLifecycleBusy(true);
    try {
      const saved = dirty || !pageId ? await save() : page;
      const id = saved?.id || pageId;
      if (!id) return;
      const response = await apiRequest(`/api/platform/pages/${encodeURIComponent(id)}/activate`, { method: "POST", body: JSON.stringify({}) });
      const activated = response?.data;
      setPage(activated);
      setPages((current) => current.map((row) => row.id === activated?.id ? activated : row));
      await loadVersions(id);
      onMessage?.("Page activated.");
    } catch (error) {
      onError?.(error.message || "Unable to activate the page.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const deactivatePage = async () => {
    if (!pageId) return;
    setLifecycleBusy(true);
    try {
      const response = await apiRequest(`/api/platform/pages/${encodeURIComponent(pageId)}/deactivate`, { method: "POST", body: JSON.stringify({}) });
      const inactive = response?.data;
      setPage(inactive);
      setPages((current) => current.map((row) => row.id === inactive?.id ? inactive : row));
      await loadVersions(pageId);
      onMessage?.("Page deactivated.");
    } catch (error) {
      onError?.(error.message || "Unable to deactivate the page.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const restoreVersion = async (version) => {
    if (!pageId) return;
    setLifecycleBusy(true);
    try {
      const response = await apiRequest(`/api/platform/pages/${encodeURIComponent(pageId)}/versions/${encodeURIComponent(version)}/restore`, { method: "POST", body: JSON.stringify({}) });
      const restored = response?.data;
      setPage(restored);
      const tree = normalizeCustomPageTree(restored?.draft_definition || restored?.definition || {});
      setDraft({ pageKey: restored?.page_key || draft.pageKey, label: restored?.label || draft.label, presentation_mode: tree.presentation_mode, device: tree.device, resources: tree.resources, sections: tree.sections });
      setDirty(false);
      await loadVersions(pageId);
      onMessage?.(`Version ${version} restored as a new draft.`);
    } catch (error) {
      onError?.(error.message || "Unable to restore the page version.");
    } finally {
      setLifecycleBusy(false);
    }
  };

  /* ------------------------------ selection ------------------------------ */

  const selectedSection = draft.sections.find((section) => section.id === selectedSectionId) || null;
  const selected = selectedNodeId ? findNode(draft.sections, selectedNodeId) : null;
  const selectedNode = selected?.node || null;
  const selectedParentKey = selected?.parentComponentKey ?? null;
  const interactionTargets = useMemo(
    () => collectPageNodes(draft.sections, selectedNodeId),
    [draft.sections, selectedNodeId],
  );

  /* Drag state via HTML5 DnD; payload through dataTransfer. */
  const onDragOver = (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; };

  const renderNode = (node, parentKey, index, parentNodeId) => {
    const isContainer = node.componentKey === "container" || node.componentKey === "multi_container";
    const acceptsChildren = isContainer && node.componentKey === "container";
    return (
      <div
        key={node.id}
        className={`cpb-node ${selectedNodeId === node.id && !preview ? "cpb-node-selected" : ""}`}
        style={{
          width: Number(node.layout?.width) > 0 ? Math.min(Number(node.layout.width), 2400) : "100%",
          height: Number(node.layout?.height) > 0 ? Math.min(Number(node.layout.height), 1800) : undefined,
        }}
        onDragOver={(event) => { if (!preview) { event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.add("cpb-dropzone"); } }}
        onDragLeave={(event) => event.currentTarget.classList.remove("cpb-dropzone")}
        onDrop={(event) => {
          if (preview) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.classList.remove("cpb-dropzone");
          const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
          if (paletteRaw) {
            const payload = JSON.parse(paletteRaw);
            if (acceptsChildren) dropIntoNode(node.id, payload);
            else if (parentNodeId) dropIntoNode(parentNodeId, payload, index);
            else dropIntoSection(node.sectionId, payload, index);
          }
        }}
        onClick={(event) => {
          if (preview) return;
          event.stopPropagation();
          setSelectedNodeId(node.id); setSelectedSectionId(null);
        }}
      >
        {!preview ? <button type="button" className="cpb-node-remove" aria-label={`Remove ${nodeLabel(node)}`} title="Remove component" onClick={(event) => { event.stopPropagation(); setSelectedNodeId(node.id); setTimeout(() => { applyDraft((current) => ({ ...current, sections: removeNodeFromSections(current.sections, node.id) })); setSelectedNodeId(null); }, 0); }}><Minus size={15}/></button> : null}
        {!preview && selectedNodeId === node.id ? (
          <>
            <span className="cpb-chip" style={{ position: "absolute", top: 4, left: 6, zIndex: 7, background: "#147d70", color: "#fff" }}>
              {nodeLabel(node)}
            </span>
            <span className="cpb-node-actions">
              <button type="button" title="Duplicate component" aria-label="Duplicate component" onClick={(event) => { event.stopPropagation(); duplicateSelectedNode(); }}><Copy size={13}/></button>
            </span>
            <button type="button" className="cpb-resize-handle" title="Drag to resize" aria-label="Resize component" onPointerDown={(event) => beginNodeResize(node.id, event)}>
              <MoveDiagonal2 size={12}/>
            </button>
          </>
        ) : null}
        <CustomPageRenderer
          definition={{ sections: [{ id: node.id, width: "full", visible: true, children: [node] }] }}
          builderMode={!preview}
          device={draft.device}
        />
        {!preview && acceptsChildren && !(node.children || []).length ? (
          <div
            className="cpb-empty"
            onDragOver={onDragOver}
            onDrop={(event) => {
              event.preventDefault(); event.stopPropagation();
              const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
              if (paletteRaw) dropIntoNode(node.id, JSON.parse(paletteRaw));
            }}
          >
            Drop components inside {nodeLabel(node)}
          </div>
        ) : null}
        {!preview && selectedNodeId === node.id ? (
          <span className="cpb-chip" style={{ position: "absolute", top: -10, right: 6, zIndex: 2 }}>
            {nodeLabel(node)} · {describeInteraction(node.interaction)}
          </span>
        ) : null}
      </div>
    );
  };

  const renderSection = (section, index) => {
    const widthMeta = SECTION_WIDTHS[section.width] || SECTION_WIDTHS.full;
    return (
      <div
        key={section.id}
        className={`onepos-card p-4 cpb-section ${!preview && selectedSectionId === section.id ? "cpb-section-selected" : ""}`}
        style={{ flexBasis: "100%", width: "100%", minWidth: 0, position: "relative", border: 0, boxShadow: "none", padding: 0 }}

        onDragOver={(event) => { if (!preview) { event.preventDefault(); event.currentTarget.classList.add("cpb-dropzone"); } }}
        onDragLeave={(event) => event.currentTarget.classList.remove("cpb-dropzone")}
        onDrop={(event) => {
          if (preview) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.classList.remove("cpb-dropzone");
          const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
          if (paletteRaw) dropIntoSection(section.id, JSON.parse(paletteRaw));
        }}
        onClick={(event) => { if (preview) return; event.stopPropagation(); setSelectedSectionId(section.id); setSelectedNodeId(null); }}
      >

        <div
          className="cpb-section-body"
          onDragOver={onDragOver}
          onDrop={(event) => {
            event.preventDefault(); event.stopPropagation();
            const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
            if (paletteRaw) dropIntoSection(section.id, JSON.parse(paletteRaw));
          }}
        >
          {!preview ? (
            <>
              {section.children.map((node, childIndex) => (
                <div key={node.id}>
                  <div
                    className="cpb-insert-target"
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.add("cpb-dropzone"); }}
                    onDragLeave={(event) => event.currentTarget.classList.remove("cpb-dropzone")}
                    onDrop={(event) => {
                      event.preventDefault(); event.stopPropagation();
                      event.currentTarget.classList.remove("cpb-dropzone");
                      const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
                      if (paletteRaw) dropIntoSection(section.id, JSON.parse(paletteRaw), childIndex);
                    }}
                  >
                    Drop component here
                  </div>
                  {renderNode({ ...node, sectionId: section.id }, null, childIndex, null)}
                </div>
              ))}
              <div
                className={section.children.length ? "cpb-insert-target" : "cpb-empty"}
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.add("cpb-dropzone"); }}
                onDragLeave={(event) => event.currentTarget.classList.remove("cpb-dropzone")}
                onDrop={(event) => {
                  event.preventDefault(); event.stopPropagation();
                  event.currentTarget.classList.remove("cpb-dropzone");
                  const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
                  if (paletteRaw) dropIntoSection(section.id, JSON.parse(paletteRaw), section.children.length);
                }}
              >
                {section.children.length ? "Drop component at end" : "Drop components here"}
              </div>
            </>
          ) : section.children.map((node, childIndex) => renderNode({ ...node, sectionId: section.id }, null, childIndex, null))}
        </div>
      </div>
    );
  };

  /* ---------------------------- properties ------------------------------- */

  const boundObjectKey = selectedNode?.componentKey === "multi_container" ? selectedNode.collection?.objectKey || "" : "";

  const renderProperties = () => {
    if (selectedSection) {
      return (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Section</p>
          <div className="space-y-1">
            <label className={labelClass}>Width</label>
            <select className={inputClass} value={selectedSection.width} onChange={(event) => updateSection(selectedSection.id, { width: event.target.value })}>
              {Object.values(SECTION_WIDTHS).map((width) => <option key={width.key} value={width.key}>{width.label}</option>)}
            </select>
          </div>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-red-600" onClick={() => removeSection(selectedSection.id)}><Trash2 size={13} /> Remove section</button>
        </div>
      );
    }
    if (!selectedNode) return <p className="text-xs text-slate-400">Select a component on the canvas.</p>;
    const node = selectedNode;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{nodeLabel(node)}</p>
          <span className="flex items-center gap-1">
            <button type="button" className="rounded p-1 text-slate-400 hover:text-slate-700" title="Duplicate" aria-label="Duplicate component" onClick={duplicateSelectedNode}><Copy size={13} /></button>
            <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" title="Delete" aria-label="Delete component" onClick={removeSelectedNode}><Trash2 size={13} /></button>
          </span>
        </div>

        {node.componentKey === "multi_container" ? <MultiContainerProperties node={node} objects={objects} registry={registry} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} /> : null}
        {(() => {
          const meta = componentMeta(node.componentKey);
          const specialized = new Set(["multi_container","table","tree_view","process_path","container","button","text","header","spacer","field_value","related_list","timeline","kanban","calendar","scheduler","gantt","map","hierarchy_viewer","file_viewer","signature"]);
          if (specialized.has(node.componentKey)) return null;
          return <RegistryDrivenProperties node={node} meta={meta} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} />;
        })()}
        {node.componentKey === "table" ? <TableProperties node={node} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} /> : null}
        {node.componentKey === "tree_view" ? <TreeViewProperties node={node} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} /> : null}
        {[
          "timeline", "kanban", "calendar", "scheduler", "gantt", "map", "hierarchy_viewer", "file_viewer", "signature",
        ].includes(node.componentKey) ? <AdvancedComponentProperties node={node} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} /> : null}
        {node.componentKey === "process_path" ? (
          <RecordCollectionDataGroup node={node} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)}>
            {({ fields: availableFields }) => {
              const config = node.config || {};
              const picklists = availableFields.filter((field) => ["picklist", "select"].includes(field.field_type));
              const setConfig = (patch) => updateNode(node.id, { config: { ...config, ...patch } });
              const selectedStatus = availableFields.find((field) => field.api_name === config.statusField);
              const options = Array.isArray(selectedStatus?.options) ? selectedStatus.options : [];
              const normalizedOptions = options.map((option) => ({
                value: String(typeof option === "object" ? option.value ?? option.key ?? option.label ?? "" : option),
                label: String(typeof option === "object" ? option.label ?? option.name ?? option.value ?? "" : option),
              })).filter((option) => option.value);
              return (
                <div className="space-y-3">
                  <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
                    <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Path</legend>
                    <div className="space-y-1">
                      <label className={labelClass}>Stage / Status field</label>
                      <select className={inputClass} value={config.statusField || ""} onChange={(event) => setConfig({ statusField: event.target.value, stages: [] })}>
                        <option value="">Select picklist…</option>
                        {picklists.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Title field</label>
                      <select className={inputClass} value={config.titleField || ""} onChange={(event) => setConfig({ titleField: event.target.value })}>
                        <option value="">None</option>
                        {availableFields.map((field) => <option key={field.id || field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={config.allowStageChange === true} onChange={(event) => setConfig({ allowStageChange: event.target.checked })}/>
                      Allow users to change stage from the Path
                    </label>
                    <div className="space-y-1">
                      <label className={labelClass}>Stages</label>
                      <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-200 p-1.5">
                        {normalizedOptions.length ? normalizedOptions.map((option) => {
                          const stages = Array.isArray(config.stages) && config.stages.length ? config.stages : normalizedOptions.map((item) => item.value);
                          const checked = stages.includes(option.value);
                          return (
                            <label key={option.value} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => setConfig({
                                  stages: event.target.checked
                                    ? [...new Set([...stages, option.value])]
                                    : stages.filter((value) => value !== option.value),
                                })}
                              />
                              {option.label}
                            </label>
                          );
                        }) : <span className="text-[11px] text-slate-400">Choose a picklist field to load its stages.</span>}
                      </div>
                    </div>
                  </fieldset>
                </div>
              );
            }}
          </RecordCollectionDataGroup>
        ) : null}
        {node.componentKey === "container" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={labelClass}>Columns</label>
              <select className={inputClass} value={node.columns || 2} onChange={(event) => updateNode(node.id, { columns: Number(event.target.value) })}>
                {[1, 2, 3].map((count) => <option key={count} value={count}>{count} column{count > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Spacing</label>
              <select className={inputClass} value={node.spacing || 3} onChange={(event) => updateNode(node.id, { spacing: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>
        ) : null}
        {node.componentKey === "button" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={labelClass}>Label</label>
              <input className={inputClass} value={node.label || ""} onChange={(event) => updateNode(node.id, { label: event.target.value })} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Style (global onePOS design system)</label>
              <select className={inputClass} value={node.variant || "primary"} onChange={(event) => updateNode(node.id, { variant: event.target.value })}>
                <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="ghost">Ghost</option><option value="danger">Destructive</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Size</label>
              <select className={inputClass} value={node.size || "medium"} onChange={(event) => updateNode(node.id, { size: event.target.value })}>
                <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
              </select>
            </div>
            <div className="border-t border-slate-100 pt-3">
<InteractionProperties
  node={node}
  targetComponents={interactionTargets}
  onChange={(changes) => updateNode(node.id, changes)}
/>
            </div>
          </div>
        ) : null}
        {["text", "header"].includes(node.componentKey) ? (
          <div className="space-y-1">
            <label className={labelClass}>{node.componentKey === "header" ? "Heading text" : "Text"}</label>
            <input className={inputClass} value={node.text || ""} onChange={(event) => updateNode(node.id, { text: event.target.value })} />
          </div>
        ) : null}
        {node.componentKey === "spacer" ? (
          <div className="space-y-1">
            <label className={labelClass}>Spacing</label>
            <select className={inputClass} value={node.spacing || 3} onChange={(event) => updateNode(node.id, { spacing: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </div>
        ) : null}
        {node.componentKey === "field_value" ? (
          <div className="space-y-1">
            <label className={labelClass}>Field</label>
            <input className={inputClass} value={node.field || ""} onChange={(event) => updateNode(node.id, { field: event.target.value })} placeholder="field api name" />
          </div>
        ) : null}
        {node.componentKey === "related_list" ? (
          <div className="space-y-1">
            <label className={labelClass}>Relationship key</label>
            <input className={inputClass} value={node.relationshipKey || ""} onChange={(event) => updateNode(node.id, { relationshipKey: event.target.value })} placeholder="relationship_key" />
          </div>
        ) : null}
      </div>
    );
  };

  const renderFocusedPanel = () => {
    if (panelMode === "properties") return selectedNode || selectedSection ? renderProperties() : renderPageSettings();
    if (!selectedNode) return <p className="text-xs text-slate-400">Select a component on the canvas to configure {panelMode}.</p>;
    const node = selectedNode;
    if (panelMode === "data") {
      if (node.collection) return <FocusedDataPanel node={node} objects={objects} pageResources={draft.resources} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} />;
      return <div className="cpb-page-settings"><h3>Data</h3><p>This component has no record collection. Content and registry-defined bindings are configured in Properties.</p></div>;
    }
    if (panelMode === "style") {
      return <div className="cpb-page-settings">
        <h3>Style & Layout</h3>
        <p>Generic presentation metadata only. No business-specific styling is stored here.</p>
        <div className="space-y-1"><label className={labelClass}>Width (px, 0 = auto)</label><input className={inputClass} type="number" min="0" max="2400" value={node.layout?.width || 0} onChange={(event) => updateNode(node.id, { layout: { ...(node.layout || {}), width: Math.max(0, Number(event.target.value) || 0) } })}/></div>
        <div className="space-y-1"><label className={labelClass}>Height (px, 0 = auto)</label><input className={inputClass} type="number" min="0" max="1800" value={node.layout?.height || 0} onChange={(event) => updateNode(node.id, { layout: { ...(node.layout || {}), height: Math.max(0, Number(event.target.value) || 0) } })}/></div>
        {node.componentKey === "button" ? <><div className="space-y-1"><label className={labelClass}>Button style</label><select className={inputClass} value={node.variant || "primary"} onChange={(event) => updateNode(node.id, { variant: event.target.value })}><option value="primary">Primary</option><option value="secondary">Secondary</option><option value="ghost">Ghost</option><option value="danger">Destructive</option></select></div><div className="space-y-1"><label className={labelClass}>Size</label><select className={inputClass} value={node.size || "medium"} onChange={(event) => updateNode(node.id, { size: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div></> : null}
      </div>;
    }
    if (panelMode === "conditions") {
      return <div className="cpb-page-settings">
        <h3>Conditions</h3>
        <p>Control whether this component is rendered. Record filtering belongs in the Data tab and uses the shared condition engine.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-slate-600"><input type="checkbox" checked={node.visible !== false} onChange={(event) => updateNode(node.id, { visible: event.target.checked })}/> Visible</label>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-slate-600"><input type="checkbox" checked={node.enabled !== false} onChange={(event) => updateNode(node.id, { enabled: event.target.checked })}/> Enabled</label>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-slate-600"><input type="checkbox" checked={node.required === true} onChange={(event) => updateNode(node.id, { required: event.target.checked })}/> Required</label>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2 text-xs text-slate-600"><input type="checkbox" checked={node.readOnly === true} onChange={(event) => updateNode(node.id, { readOnly: event.target.checked })}/> Read only</label>
        </div>
        <p className="text-[11px] text-slate-400">These states are saved with the component and enforced by the shared renderer. Data filters remain under Data → Filters.</p>
        {node.collection ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-500">Data filters are available under Data → Filters.</div> : null}
      </div>;
    }
    if (panelMode === "events") {
      return <div className="cpb-page-settings">
        <h3>Events</h3>
        <p>Connect this component to generic navigation, another component, or a metadata-selected Flow/action.</p>
        <InteractionProperties node={node} targetComponents={interactionTargets} onChange={(changes) => updateNode(node.id, changes)} />
      </div>;
    }
    return renderProperties();
  };

  const updateResourceDefinitions = (kind, next) => applyDraft((current) => ({ ...current, resources: { ...(current.resources || {}), [kind]: next } }));
  const resourceRows = (kind) => Array.isArray(draft.resources?.[kind]) ? draft.resources[kind] : [];
  const addResourceDefinition = (kind) => updateResourceDefinitions(kind, [...resourceRows(kind), { key: `${kind === "parameters" ? "param" : "variable"}_${resourceRows(kind).length + 1}`, label: kind === "parameters" ? "Page Parameter" : "Page Variable", dataType: "text", defaultValue: "" }]);
  const patchResourceDefinition = (kind, index, patch) => updateResourceDefinitions(kind, resourceRows(kind).map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item));
  const removeResourceDefinition = (kind, index) => updateResourceDefinitions(kind, resourceRows(kind).filter((_, rowIndex) => rowIndex !== index));
  const renderResourceDefinitions = (kind, title, description) => <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
    <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
    <p className="text-[11px] text-slate-500">{description}</p>
    {resourceRows(kind).map((item,index)=><div key={`${kind}-${index}`} className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-2">
      <div className="grid grid-cols-2 gap-1"><input className={inputClass} value={item.label || ""} onChange={(event)=>patchResourceDefinition(kind,index,{label:event.target.value})} placeholder="Label"/><input className={inputClass} value={item.key || ""} onChange={(event)=>patchResourceDefinition(kind,index,{key:event.target.value.replace(/[^A-Za-z0-9_]/g,"")})} placeholder="API name"/></div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1"><select className={inputClass} value={item.dataType || "text"} onChange={(event)=>patchResourceDefinition(kind,index,{dataType:event.target.value})}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="datetime">Date/Time</option><option value="record">Record</option><option value="collection">Collection</option></select><input className={inputClass} value={item.defaultValue ?? ""} disabled={kind === "parameters"} onChange={(event)=>patchResourceDefinition(kind,index,{defaultValue:event.target.value})} placeholder={kind === "parameters" ? "From URL/runtime" : "Default value"}/><button type="button" className="rounded px-2 text-red-600" onClick={()=>removeResourceDefinition(kind,index)} aria-label={`Remove ${title}`}><Trash2 size={13}/></button></div>
    </div>)}
    {!resourceRows(kind).length ? <p className="text-[11px] text-slate-400">None defined.</p> : null}
    <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={()=>addResourceDefinition(kind)}>+ Add {kind === "parameters" ? "parameter" : "variable"}</button>
  </fieldset>;

  const renderPageSettings = () => (
    <div className="cpb-page-settings">
      <div>
        <h3>Page Settings</h3>
        <p>Page-level metadata. These settings are stored with the page definition and used by the runtime.</p>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Page name</label>
        <input className={inputClass} value={draft.label || ""} onChange={(event) => applyDraft((current) => ({ ...current, label: event.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Page key</label>
        <input className={inputClass} value={draft.pageKey || ""} onChange={(event) => applyDraft((current) => ({ ...current, pageKey: event.target.value }))} placeholder="page_key" />
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Presentation</label>
        <select className={inputClass} value={draft.presentation_mode || "landing"} onChange={(event) => applyDraft((current) => ({ ...current, presentation_mode: event.target.value }))}>
          <option value="landing">Landing</option>
          <option value="workspace">Workspace</option>
          <option value="record">Record</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className={labelClass}>Default device</label>
        <select className={inputClass} value={draft.device || "desktop"} onChange={(event) => applyDraft((current) => ({ ...current, device: event.target.value }), { history: false })}>
          <option value="desktop">Desktop</option>
          <option value="tablet">Tablet</option>
          <option value="mobile">Mobile</option>
          <option value="kiosk">Kiosk</option>
        </select>
      </div>
      {renderResourceDefinitions("parameters","Page Parameters","Inputs supplied when the page opens, such as recordId, date or source.")}
      {renderResourceDefinitions("variables","Page Variables","Mutable page state that components, filters and Flow mappings can reference.")}
    </div>
  );

  return (
    <div className="cpb-builder">
      <style>{BUILDER_CSS}</style>

      {/* Toolbar — page name, device modes, preview, undo/redo, save. */}
      <div className="cpb-toolbar">
        {onBack ? <button type="button" className="cpb-back-button" onClick={onBack} aria-label="Back to Settings" title="Back to Settings"><ArrowLeft size={17}/></button> : null}
        {context === "developer" ? <span className="cpb-chip">Developer Page Builder</span> : null}
        {!lockApp ? (
          <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={appId} onChange={(event) => { setAppId(event.target.value); setPageId(""); setPage(null); }} aria-label="App">
            <option value="">New page…</option>
            {apps.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}
          </select>
        ) : (
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium">
            {apps.find((candidate) => String(candidate.id) === String(appId))?.label || "Package app"}
          </span>
        )}
        <select className="max-w-52 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={pageId} onChange={(event) => loadPage(pages.find((row) => row.id === event.target.value) || null)} aria-label="Page">
          <option value="">{appId ? "Select page…" : "New page…"}</option>
          {pages.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
        <input className="w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium" value={draft.label} onChange={(event) => applyDraft((current) => ({ ...current, label: event.target.value }))} aria-label="Page name" />
        <span className="ml-auto flex items-center gap-1">
          {!preview ? (
            <>
              <button type="button" className="cpb-device-btn cpb-panel-toggle" onClick={() => setPaletteOpen((value) => !value)} aria-pressed={paletteOpen} title={paletteOpen ? "Collapse Components pane" : "Show Components pane"}>
                {paletteOpen ? "Hide Components" : "Components"}
              </button>
              <button type="button" className="cpb-device-btn cpb-panel-toggle" onClick={() => setPropertiesOpen((value) => !value)} aria-pressed={propertiesOpen} title={propertiesOpen ? "Collapse Properties pane" : "Show Properties pane"}>
                {propertiesOpen ? "Hide Properties" : "Properties"}
              </button>
            </>
          ) : null}
          {(["desktop", "tablet", "mobile", "kiosk"]).map((device) => (
            <button key={device} type="button" className={`cpb-device-btn ${draft.device === device ? "active" : ""}`} onClick={() => applyDraft((current) => ({ ...current, device }), { history: false })} aria-pressed={draft.device === device}>
              {device === "desktop" ? <Monitor size={13} /> : device === "tablet" ? <Tablet size={13} /> : device === "mobile" ? <Smartphone size={13} /> : <MonitorSmartphone size={13} />}
              {device}
            </button>
          ))}
          <button type="button" className="cpb-device-btn" onClick={undo} disabled={!undoStack.length} title="Undo" aria-label="Undo"><Undo2 size={13} /></button>
          <button type="button" className="cpb-device-btn" onClick={redo} disabled={!redoStack.length} title="Redo" aria-label="Redo"><Redo2 size={13} /></button>
          <button type="button" className={`cpb-device-btn ${preview ? "active" : ""}`} onClick={() => setPreview((value) => !value)} aria-pressed={preview}>
            <Eye size={13} /> {preview ? "Exit Preview" : "Preview"}
          </button>
          <button type="button" className={`cpb-device-btn ${testMode ? "active" : ""}`} onClick={() => { setTestMode((value)=>!value); setPreview(true); setTestTrace([]); }} aria-pressed={testMode} disabled={testBusy}>
            {testBusy ? "Testing…" : testMode ? "Exit Test" : "Test · Rollback ON"}
          </button>
          <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={() => setShowVersions((value) => !value)} disabled={!pageId || lifecycleBusy}>Versions</button>
          {page?.active ? (
            <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={deactivatePage} disabled={lifecycleBusy}>Deactivate</button>
          ) : null}
          <button type="button" className="onepos-btn onepos-btn-secondary onepos-btn-sm" onClick={save} disabled={saving || lifecycleBusy}>{saving ? "Saving…" : dirty || !pageId || page?.draft_version ? "Save Draft" : "Draft Saved"}</button>
          <button type="button" className="onepos-btn onepos-btn-primary onepos-btn-sm" onClick={activatePage} disabled={saving || lifecycleBusy || (!dirty && !page?.draft_version && page?.active)}>{lifecycleBusy ? "Working…" : "Activate"}</button>
        </span>
      </div>
      {dirty ? <p className="text-[11px] text-amber-600">Unsaved changes — Save Draft does not change the active runtime page.</p> : page?.draft_version ? <p className="text-[11px] text-amber-600">Draft v{page.draft_version} is not active yet.</p> : page?.active ? <p className="text-[11px] text-emerald-700">Active version v{page.active_version || page.version || 1}.</p> : null}
      {showVersions && pageId ? (
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
          {versions.length ? versions.map((version) => (
            <div key={version.id || version.version} className="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-0">
              <strong>v{version.version}</strong>
              <span className="text-slate-500">{version.lifecycle_status}</span>
              <span className="text-slate-400">{version.created_at ? new Date(version.created_at).toLocaleString() : ""}</span>
              <button type="button" className="ml-auto onepos-btn onepos-btn-secondary onepos-btn-sm" disabled={lifecycleBusy} onClick={() => restoreVersion(version.version)}>Restore as Draft</button>
            </div>
          )) : <span className="text-slate-500">No versions yet.</span>}
        </div>
      ) : null}

      {preview ? (
        /* PREVIEW MODE — the unsaved tree rendered exactly like runtime. */
        <div className="cpb-canvas">
          <div className={`cpb-device-frame is-${draft.device}`}>
            <CustomPageRenderer definition={definitionForSave()} builderMode={false} device={draft.device} onRecordClick={testMode ? ({record,node})=>testNodeInteraction({record,node}) : undefined} onButtonClick={testMode ? (node)=>testNodeInteraction({node}) : undefined} />
          </div>
          {testMode ? <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs"><div className="mb-2 flex items-center justify-between"><strong>Test Trace</strong><span className="text-emerald-700">Rollback ON</span></div>{testTrace.length ? <div className="max-h-48 space-y-1 overflow-auto">{testTrace.map((entry,index)=><div key={index} className="rounded bg-slate-50 px-2 py-1"><strong>{entry.kind}</strong> · {entry.status}{entry.detail?.message?` · ${entry.detail.message}`:""}</div>)}</div> : <span className="text-slate-500">Click a Flow-backed component to test the Page → Flow chain.</span>}</div> : null}
        </div>
      ) : (
        <div className={`cpb-shell ${paletteOpen ? "" : "is-palette-collapsed"} ${propertiesOpen ? "" : "is-properties-collapsed"}`}>
          {/* PALETTE — populated from the Component Registry. */}
          {paletteOpen ? <aside className="cpb-panel cpb-palette">
            <div className="cpb-palette-head">
              <p className="cpb-palette-title">Components</p>
              <label className="cpb-palette-search">
                <input value={paletteQuery} onChange={(event) => setPaletteQuery(event.target.value)} placeholder="Search components..." aria-label="Search components" />
              </label>
            </div>
            <div className="cpb-palette-scroll">
            {visiblePaletteGroups.map((group) => (
              <div key={group.label} className="cpb-palette-group">
                <p className="cpb-palette-group-title">{group.label}</p>
                <div className="cpb-palette-grid">
                {group.items.map((component) => {
                  const Icon = componentIcon(component);
                  return (
                  <button
                    key={component.key}
                    type="button"
                    className="cpb-palette-item"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_MIME_PALETTE, JSON.stringify({ kind: "palette", componentKey: component.key }));
                    }}
                    onClick={() => {
                      if (draft.sections.length) dropIntoSection(draft.sections[draft.sections.length - 1].id, { kind: "palette", componentKey: component.key });
                      else addComponentToNewSection(component.key);
                    }}
                    title="Drag onto the canvas or click to add"
                  >
                    <Icon size={12} className="shrink-0 text-slate-400" aria-hidden="true" /> {component.label}
                  </button>
                  );
                })}
                </div>
              </div>
            ))}
            {!visiblePaletteGroups.length ? <div className="cpb-palette-empty">{registry.length ? `No components match “${paletteQuery}”.` : "Loading component metadata… The registry will retry automatically."}</div> : null}
            </div>
          </aside> : null}

          {/* LIVE CANVAS — shared renderer with drop zones. */}
          <div className="cpb-canvas-column">
            <div className="cpb-horizontal-scroll" aria-label="Canvas horizontal scroll">
              <span>Canvas left / right</span>
              <input
                type="range"
                min="0"
                max={Math.max(0, canvasScroll.max)}
                value={Math.min(canvasScroll.left, canvasScroll.max)}
                disabled={canvasScroll.max <= 0}
                onChange={(event) => {
                  const viewport = canvasViewportRef.current;
                  if (viewport) viewport.scrollLeft = Number(event.target.value) || 0;
                }}
              />
            </div>
          <main
            ref={canvasViewportRef}
            className={`cpb-canvas ${canvasPanning ? "is-panning" : ""}`}
            onPointerDown={beginCanvasPan}
            onPointerMove={moveCanvasPan}
            onPointerUp={endCanvasPan}
            onPointerCancel={endCanvasPan}
            onClick={(event) => { if (event.target === event.currentTarget) { setSelectedNodeId(null); setSelectedSectionId(null); } }}
            onDragOver={onDragOver}
            onDrop={(event) => {
              event.preventDefault();
              const paletteRaw = event.dataTransfer.getData(DRAG_MIME_PALETTE);
              if (paletteRaw) {
                const payload = JSON.parse(paletteRaw);
                if (draft.sections.length) dropIntoSection(draft.sections[draft.sections.length - 1].id, payload);
                else if (payload.kind === "palette") addComponentToNewSection(payload.componentKey);
              }
            }}
          >
            <div className={`cpb-device-frame is-${draft.device}`}>
              <div className="cpb-tree">
                {draft.sections.map((section, index) => renderSection(section, index))}
                {!draft.sections.length ? (
                  <div className="cpb-empty w-full py-14">
                    <strong className="mb-1 block text-sm">Blank canvas</strong>
                    Drag any component here to begin. Components can be resized directly on the canvas.
                  </div>
                ) : null}
              </div>
            </div>
          </main>
          </div>

          {/* PROPERTIES — relevant settings for the selection only. */}
          {propertiesOpen ? <aside className="cpb-panel cpb-properties">
            <div className="cpb-properties-tabs" role="tablist" aria-label="Component configuration">
              {["properties","data","style","conditions","events"].map((mode) => <button key={mode} type="button" className={panelMode === mode ? "active" : ""} onClick={() => setPanelMode(mode)} role="tab" aria-selected={panelMode === mode}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
            </div>
            <div className="cpb-properties-scroll">{renderFocusedPanel()}</div>
          </aside> : null}
        </div>
      )}
    </div>
  );
}

function widthMetaLabel(width) {
  return { full: "Full", half: "Half", third: "1/3" }[width] || width;
}
function widthMetaShort(width) {
  return { full: "Full", half: "Half", third: "Third" }[width] || width;
}

/**
 * Shared DATA group + field loading for every record-bound component
 * (MultiContainer, Table). One source of collection configuration — the exact
 * same Record Collection shape goes to the renderer and the runtime endpoint.
 */
function useCollectionFieldState(collection, objects) {
  const [state, setState] = useState({ fields: [], loading: false, error: "" });
  useEffect(() => {
    if (!collection.objectKey) { setState({ fields: [], loading: false, error: "" }); return; }
    const object = objects.find((candidate) => candidate.object_key === collection.objectKey);
    if (!object?.id) { setState({ fields: [], loading: false, error: "Selected object metadata is unavailable." }); return; }
    let live = true;
    setState({ fields: [], loading: true, error: "" });
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response) => {
        if (!live) return;
        const fields = (Array.isArray(response?.data) ? response.data : []).filter((field) => field.active !== false && field.readable !== false);
        setState({ fields, loading: false, error: fields.length ? "" : "No readable fields are available for this object." });
      })
      .catch((error) => { if (live) setState({ fields: [], loading: false, error: error?.message || "Unable to load object fields." }); });
    return () => { live = false; };
  }, [collection.objectKey, objects]);
  return state;
}
function useCollectionFields(collection, objects) {
  return useCollectionFieldState(collection, objects).fields;
}

function CollectionLivePreview({ collection }) {
  const live = useRecordCollection(collection, { enabled: Boolean(collection?.objectKey), page: 1 });
  if (!collection?.objectKey) return <p className="text-[11px] text-slate-400">Select an object to verify live data.</p>;
  if (live.loading) return <p className="text-xs text-slate-500">Loading preview records…</p>;
  if (live.error) return <p role="alert" className="text-xs text-red-600">{live.error}</p>;
  if (!live.records.length) return <p className="text-xs text-slate-500">0 records match the current filters.</p>;
  const fields = collection.fields?.length ? collection.fields : Object.keys(live.records[0] || {}).filter((field) => field !== "id").slice(0, 4);
  return <div className="space-y-1">
    <p className="text-[11px] font-medium text-slate-500">{live.total} matching record{live.total === 1 ? "" : "s"} · showing {Math.min(live.records.length, 3)}</p>
    <div className="max-h-32 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
      {live.records.slice(0, 3).map((record, index) => <div key={record.id || index} className="grid gap-1 border-b border-slate-200 px-2 py-1.5 text-[11px] last:border-b-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(fields.length, 4))},minmax(0,1fr))` }}>
        {fields.slice(0,4).map((field) => <span key={field} className="truncate" title={String(record[field] ?? "")}><b className="block truncate font-medium text-slate-500">{String(field).replace(/_/g," ")}</b>{String(record[field] ?? "—")}</span>)}
      </div>)}
    </div>
  </div>;
}

function FocusedDataPanel({ node, objects, onChange, targetComponents = [] }) {
  const collection = node.collection || {};
  const { fields, loading: fieldsLoading, error: fieldsError } = useCollectionFieldState(collection, objects);
  const patchCollection = (changes) => onChange({ collection: { ...collection, ...changes } });
  return (
    <div className="space-y-3">
      <div className="cpb-page-settings"><h3>Data</h3><p>Select the metadata object, filters, sorting and record limit used by this component.</p></div>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Source</legend>
        <div className="space-y-1"><label className={labelClass}>Object</label><select className={inputClass} value={collection.objectKey || ""} onChange={(event) => patchCollection({ objectKey: event.target.value, fields: [], titleField: "", subtitleField: "" })}><option value="">Select object…</option>{objects.map((object) => <option key={object.id} value={object.object_key}>{object.label || object.object_key}</option>)}</select></div>
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Fields</legend>
        {fieldsLoading ? <p className="text-xs text-slate-500">Loading fields…</p> : null}
        {fieldsError ? <p role="alert" className="text-xs text-red-600">{fieldsError}</p> : null}
        {!fieldsLoading && !fieldsError && collection.objectKey ? <div className="max-h-44 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
          {fields.map((field) => {
            const apiName = field.api_name;
            const checked = (collection.fields || []).includes(apiName);
            return <label key={apiName} className="flex min-h-7 items-center gap-2 rounded px-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <input type="checkbox" checked={checked} onChange={() => patchCollection({ fields: checked ? (collection.fields || []).filter((name) => name !== apiName) : [...(collection.fields || []), apiName].slice(0, 12) })}/>
              <span className="min-w-0 flex-1 truncate">{field.label || apiName}</span><span className="text-[10px] text-slate-400">{field.field_type || ""}</span>
            </label>;
          })}
        </div> : null}
        <p className="text-[11px] text-slate-400">Only readable fields are shown. Runtime field security is enforced again when data loads.</p>
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Filters</legend>
        <ConditionsEditor collection={collection} fields={fields} onChange={patchCollection} pageResources={pageResources} targetComponents={targetComponents} />
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Sort & Limit</legend>
        <SortEditor collection={collection} fields={fields} onChange={patchCollection} />
        <div className="space-y-1"><label className={labelClass}>Maximum Records (1–{MAX_RECORD_LIMIT})</label><input className={inputClass} type="number" min={1} max={MAX_RECORD_LIMIT} value={collection.maxRecords ?? 10} onChange={(event) => patchCollection({ maxRecords: Math.min(Math.max(Number(event.target.value) || 1, 1), MAX_RECORD_LIMIT) })}/></div>
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Live Data Check</legend>
        <CollectionLivePreview collection={collection} />
      </fieldset>
    </div>
  );
}

function RecordCollectionDataGroup({ node, objects, onChange, children, targetComponents = [], pageResources = {} }) {
  const collection = node.collection || {};
  const fields = useCollectionFields(collection, objects);
  const patchCollection = (changes) => onChange({ collection: { ...collection, ...changes } });
  return (
    <>
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Data</legend>
        <div className="space-y-1">
          <label className={labelClass}>Object</label>
          <select className={inputClass} value={collection.objectKey || ""} onChange={(event) => patchCollection({ objectKey: event.target.value, fields: [], titleField: "", subtitleField: "" })}>
            <option value="">Select object…</option>
            {objects.map((object) => <option key={object.id} value={object.object_key}>{object.label || object.object_key}</option>)}
          </select>
        </div>
        <ConditionsEditor collection={collection} fields={fields} onChange={patchCollection} />
        <SortEditor collection={collection} fields={fields} onChange={patchCollection} />
        <div className="space-y-1">
          <label className={labelClass}>Maximum Records (1–{MAX_RECORD_LIMIT})</label>
          <input className={inputClass} type="number" min={1} max={MAX_RECORD_LIMIT} value={collection.maxRecords ?? 10} onChange={(event) => patchCollection({ maxRecords: Math.min(Math.max(Number(event.target.value) || 1, 1), MAX_RECORD_LIMIT) })} />
        </div>
      </fieldset>
      {children?.({ fields, patchCollection })}
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Interaction</legend>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={node.clickable !== false} onChange={(event) => onChange({ clickable: event.target.checked })} />
          Clickable records
        </label>
        <InteractionProperties node={node} targetComponents={targetComponents} onChange={onChange} />
      </fieldset>
    </>
  );
}

/** DATA / LAYOUT / CONTENT / INTERACTION groups for MultiContainer. */
function MultiContainerProperties({ node, objects, pageResources = {}, registry, onChange, targetComponents = [] }) {
  const collection = node.collection || {};
  const columns = multiContainerColumns({ sectionWidth: "full", containerSize: node.containerSize || "medium", device: "desktop" });
  return (
    <RecordCollectionDataGroup node={node} objects={objects} targetComponents={targetComponents} pageResources={pageResources} onChange={onChange}>
      {({ fields, patchCollection }) => (
        <>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Layout</legend>
            <div className="space-y-1">
              <label className={labelClass}>Container Size</label>
              <select className={inputClass} value={node.containerSize || "medium"} onChange={(event) => onChange({ containerSize: event.target.value })}>
                {CONTAINER_SIZES.map((size) => <option key={size} value={size}>{size[0].toUpperCase()}{size.slice(1)}</option>)}
              </select>
              <p className="text-[11px] text-slate-400">Responsive grid ≈ {columns} card{(columns === 1 ? "" : "s")} per row at this size in a full-width section.</p>
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Spacing</label>
              <select className={inputClass} value={node.spacing || 3} onChange={(event) => onChange({ spacing: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </div>
          </fieldset>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Content</legend>
            <FieldSelect label="Title Field" value={collection.titleField} fields={fields} onChange={(titleField) => patchCollection({ titleField })} />
            <FieldSelect label="Subtitle Field" value={collection.subtitleField} fields={fields} onChange={(subtitleField) => patchCollection({ subtitleField })} />
            <div className="space-y-1">
              <label className={labelClass}>Displayed Fields</label>
              <div className="max-h-32 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
                {fields.length === 0 ? <p className="px-1 text-[11px] text-slate-400">Select an object to list fields.</p> : null}
                {fields.map((field) => {
                  const apiName = field.api_name;
                  const checked = (collection.fields || []).includes(apiName);
                  return (
                    <label key={apiName} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                      <input type="checkbox" checked={checked} onChange={() => patchCollection({ fields: checked ? (collection.fields || []).filter((name) => name !== apiName) : [...(collection.fields || []), apiName].slice(0, 12) })} />
                      {field.label || apiName}
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>
        </>
      )}
    </RecordCollectionDataGroup>
  );
}

/** DATA / COLUMNS / INTERACTION groups for Table / List. */
function TableProperties({ node, objects, pageResources = {}, onChange, targetComponents = [] }) {
  return (
    <RecordCollectionDataGroup node={node} objects={objects} targetComponents={targetComponents} pageResources={pageResources} onChange={onChange}>
      {({ fields, patchCollection }) => (
        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Columns</legend>
          <div className="max-h-40 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
            {fields.length === 0 ? <p className="px-1 text-[11px] text-slate-400">Select an object to list fields.</p> : null}
            {fields.map((field) => {
              const apiName = field.api_name;
              const checked = (collection_fields(node).includes(apiName));
              return (
                <label key={apiName} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                  <input type="checkbox" checked={checked} onChange={() => patchCollection({ fields: checked ? collection_fields(node).filter((name) => name !== apiName) : [...collection_fields(node), apiName].slice(0, 12) })} />
                  {field.label || apiName}
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Columns come from Object metadata. Row On Click is configured under Interaction.</p>
        </fieldset>
      )}
    </RecordCollectionDataGroup>
  );
}

function TreeViewProperties({ node, objects, pageResources = {}, onChange, targetComponents = [] }) {
  const collection = node.collection || {};
  const config = node.config || {};
  const { fields, patchCollection } = { fields: [], patchCollection: () => {} };
  return (
    <RecordCollectionDataGroup node={node} objects={objects} targetComponents={targetComponents} pageResources={pageResources} onChange={onChange}>
      {({ fields: availableFields, patchCollection: patchRecordCollection }) => (
        <div className="space-y-3">
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Hierarchy</legend>
            <FieldSelect label="Parent Field" value={config.parentField || "parent_id"} fields={availableFields} onChange={(parentField) => onChange({ config: { ...config, parentField } })} />
            <FieldSelect label="Label Field" value={config.labelField || "name"} fields={availableFields} onChange={(labelField) => onChange({ config: { ...config, labelField } })} />
            <FieldSelect label="Secondary Field" value={config.secondaryField || "status"} fields={availableFields} onChange={(secondaryField) => onChange({ config: { ...config, secondaryField } })} />
            <div className="space-y-1">
              <label className={labelClass}>Maximum Depth</label>
              <input className={inputClass} type="number" min={1} max={6} value={config.maxDepth ?? 3} onChange={(event) => onChange({ config: { ...config, maxDepth: Number(event.target.value) || 3 } })} />
            </div>
            <div className="space-y-1">
              <label className={labelClass}>Default Expanded Depth</label>
              <input className={inputClass} type="number" min={0} max={6} value={config.defaultExpandedDepth ?? 1} onChange={(event) => onChange({ config: { ...config, defaultExpandedDepth: Number(event.target.value) || 0 } })} />
            </div>
          </fieldset>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Behavior</legend>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={config.showCounts !== false} onChange={(event) => onChange({ config: { ...config, showCounts: event.target.checked } })} />
              Show counts
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={config.allowCollapse !== false} onChange={(event) => onChange({ config: { ...config, allowCollapse: event.target.checked } })} />
              Allow collapse
            </label>
            <div className="space-y-1">
              <label className={labelClass}>Root filter</label>
              <input className={inputClass} value={config.rootFilter || ""} onChange={(event) => onChange({ config: { ...config, rootFilter: event.target.value } })} placeholder="optional filter" />
            </div>
          </fieldset>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
            <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Fields</legend>
            <div className="max-h-40 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
              {availableFields.length === 0 ? <p className="px-1 text-[11px] text-slate-400">Select an object to list hierarchy fields.</p> : null}
              {availableFields.map((field) => {
                const apiName = field.api_name;
                const checked = (collection.fields || []).includes(apiName);
                return (
                  <label key={apiName} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-600 hover:bg-slate-50">
                    <input type="checkbox" checked={checked} onChange={() => patchRecordCollection({ fields: checked ? (collection.fields || []).filter((name) => name !== apiName) : [...(collection.fields || []), apiName].slice(0, 12) })} />
                    {field.label || apiName}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="border-t border-slate-100 pt-3">
            <InteractionProperties node={node} onChange={onChange} />
          </div>
        </div>
      )}
    </RecordCollectionDataGroup>
  );
}

function AdvancedComponentProperties({ node, objects, pageResources = {}, onChange, targetComponents = [] }) {
  const collection = node.collection || {};
  const config = node.config || {};
  return (
    <RecordCollectionDataGroup node={node} objects={objects} targetComponents={targetComponents} pageResources={pageResources} onChange={onChange}>
      {({ fields: availableFields, patchCollection }) => {
        const setConfig = (patch) => onChange({ config: { ...config, ...patch } });
        const common = (
          <>
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
              <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Fields</legend>
              <FieldSelect label="Title Field" value={config.titleField || config.labelField || "name"} fields={availableFields} onChange={(titleField) => setConfig({ titleField, labelField: titleField })} />
              {node.componentKey === "timeline" ? <FieldSelect label="Date Field" value={config.dateField || "created_at"} fields={availableFields} onChange={(dateField) => setConfig({ dateField })} /> : null}
              {node.componentKey === "timeline" ? <FieldSelect label="Secondary Field" value={config.secondaryField || "status"} fields={availableFields} onChange={(secondaryField) => setConfig({ secondaryField })} /> : null}
              {node.componentKey === "kanban" ? <FieldSelect label="Group Field" value={config.groupField || "status"} fields={availableFields} onChange={(groupField) => setConfig({ groupField })} /> : null}
              {node.componentKey === "kanban" ? <FieldSelect label="Subtitle Field" value={config.subtitleField || "status"} fields={availableFields} onChange={(subtitleField) => setConfig({ subtitleField })} /> : null}
              {node.componentKey === "calendar" ? <FieldSelect label="Start Field" value={config.startField || "start_date"} fields={availableFields} onChange={(startField) => setConfig({ startField })} /> : null}
              {node.componentKey === "calendar" ? <FieldSelect label="End Field" value={config.endField || "end_date"} fields={availableFields} onChange={(endField) => setConfig({ endField })} /> : null}
              {node.componentKey === "scheduler" ? <FieldSelect label="Start Field" value={config.startField || "start_at"} fields={availableFields} onChange={(startField) => setConfig({ startField })} /> : null}
              {node.componentKey === "scheduler" ? <FieldSelect label="End Field" value={config.endField || "end_at"} fields={availableFields} onChange={(endField) => setConfig({ endField })} /> : null}
              {node.componentKey === "scheduler" ? <FieldSelect label="Resource Field" value={config.resourceField || "assignee_id"} fields={availableFields} onChange={(resourceField) => setConfig({ resourceField })} /> : null}
              {node.componentKey === "gantt" ? <FieldSelect label="Start Field" value={config.startField || "start_date"} fields={availableFields} onChange={(startField) => setConfig({ startField })} /> : null}
              {node.componentKey === "gantt" ? <FieldSelect label="End Field" value={config.endField || "end_date"} fields={availableFields} onChange={(endField) => setConfig({ endField })} /> : null}
              {node.componentKey === "map" ? <FieldSelect label="Latitude Field" value={config.latitudeField || "latitude"} fields={availableFields} onChange={(latitudeField) => setConfig({ latitudeField })} /> : null}
              {node.componentKey === "map" ? <FieldSelect label="Longitude Field" value={config.longitudeField || "longitude"} fields={availableFields} onChange={(longitudeField) => setConfig({ longitudeField })} /> : null}
              {node.componentKey === "map" ? <FieldSelect label="Address Field" value={config.addressField || ""} fields={availableFields} onChange={(addressField) => setConfig({ addressField })} /> : null}
              {node.componentKey === "hierarchy_viewer" ? <FieldSelect label="Parent Field" value={config.parentField || "parent_id"} fields={availableFields} onChange={(parentField) => setConfig({ parentField })} /> : null}
              {node.componentKey === "hierarchy_viewer" ? <FieldSelect label="Status Field" value={config.statusField || "status"} fields={availableFields} onChange={(statusField) => setConfig({ statusField })} /> : null}
              {node.componentKey === "file_viewer" ? <FieldSelect label="Filename Field" value={config.filenameField || "filename"} fields={availableFields} onChange={(filenameField) => setConfig({ filenameField })} /> : null}
              {node.componentKey === "file_viewer" ? <FieldSelect label="Type Field" value={config.typeField || "file_type"} fields={availableFields} onChange={(typeField) => setConfig({ typeField })} /> : null}
              {node.componentKey === "signature" ? <FieldSelect label="Target Field" value={config.fieldKey || "signature"} fields={availableFields} onChange={(fieldKey) => setConfig({ fieldKey })} /> : null}
            </fieldset>
            <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
              <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Behavior</legend>
              {node.componentKey === "timeline" ? (
                <>
                  <div className="space-y-1"><label className={labelClass}>Group By</label><select className={inputClass} value={config.groupBy || "day"} onChange={(event) => setConfig({ groupBy: event.target.value })}><option value="none">None</option><option value="day">Day</option><option value="month">Month</option></select></div>
                  <div className="space-y-1"><label className={labelClass}>Sort</label><select className={inputClass} value={config.sort || "desc"} onChange={(event) => setConfig({ sort: event.target.value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></div>
                </>
              ) : null}
              {node.componentKey === "kanban" ? (
                <><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={config.allowDragDrop !== false} onChange={(event) => setConfig({ allowDragDrop: event.target.checked })} /> Allow drag / drop</label></>
              ) : null}
              {node.componentKey === "calendar" ? (
                <><div className="space-y-1"><label className={labelClass}>Default View</label><select className={inputClass} value={config.defaultView || "month"} onChange={(event) => setConfig({ defaultView: event.target.value })}><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option></select></div></>
              ) : null}
              {node.componentKey === "scheduler" ? (
                <><div className="space-y-1"><label className={labelClass}>Slot Interval (min)</label><input className={inputClass} type="number" min={15} max={180} step={15} value={config.slotInterval || 30} onChange={(event) => setConfig({ slotInterval: Number(event.target.value) || 30 })} /></div></>
              ) : null}
              {node.componentKey === "gantt" ? (
                <><div className="space-y-1"><label className={labelClass}>Scale</label><select className={inputClass} value={config.scale || "week"} onChange={(event) => setConfig({ scale: event.target.value })}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></div></>
              ) : null}
              {node.componentKey === "map" ? (
                <><div className="space-y-1"><label className={labelClass}>Mode</label><select className={inputClass} value={config.locationMode || "latlng"} onChange={(event) => setConfig({ locationMode: event.target.value })}><option value="latlng">Latitude / longitude</option><option value="address">Address</option></select></div><div className="space-y-1"><label className={labelClass}>Default Zoom</label><input className={inputClass} type="number" min={1} max={20} value={config.defaultZoom || 10} onChange={(event) => setConfig({ defaultZoom: Number(event.target.value) || 10 })} /></div></>
              ) : null}
              {node.componentKey === "hierarchy_viewer" ? (
                <><div className="space-y-1"><label className={labelClass}>Orientation</label><select className={inputClass} value={config.orientation || "vertical"} onChange={(event) => setConfig({ orientation: event.target.value })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></div><div className="space-y-1"><label className={labelClass}>Max Depth</label><input className={inputClass} type="number" min={1} max={6} value={config.maxDepth || 3} onChange={(event) => setConfig({ maxDepth: Number(event.target.value) || 3 })} /></div></>
              ) : null}
              {node.componentKey === "file_viewer" ? (
                <><div className="space-y-1"><label className={labelClass}>Display Mode</label><select className={inputClass} value={config.displayMode || "grid"} onChange={(event) => setConfig({ displayMode: event.target.value })}><option value="list">List</option><option value="grid">Grid</option><option value="preview">Preview</option></select></div><div className="space-y-1"><label className={labelClass}>Max Items</label><input className={inputClass} type="number" min={1} max={100} value={config.maxItems || 12} onChange={(event) => setConfig({ maxItems: Number(event.target.value) || 12 })} /></div></>
              ) : null}
              {node.componentKey === "signature" ? (
                <><div className="space-y-1"><label className={labelClass}>Label</label><input className={inputClass} value={config.label || "Signature"} onChange={(event) => setConfig({ label: event.target.value })} /></div><div className="space-y-1"><label className={labelClass}>Display Mode</label><select className={inputClass} value={config.displayMode || "capture"} onChange={(event) => setConfig({ displayMode: event.target.value })}><option value="capture">Capture</option><option value="readonly">Read-only</option><option value="preview">Preview</option></select></div><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={config.required === true} onChange={(event) => setConfig({ required: event.target.checked })} /> Required</label></>
              ) : null}
            </fieldset>
          </>
        );
        return (
          <div className="space-y-3">{common}</div>
        );
      }}
    </RecordCollectionDataGroup>
  );
}


const PROPERTY_BOOLEAN_KEYS = new Set(["visible","dismissible","showValue","disabled","multiple","clearable","allowClear","autoplay","loop","showSeconds","showDate","showWeekday","showMonth","hour12","masked","numeric","border","showPageSize","showCount","defaultOpen","allowCollapse"]);
const PROPERTY_NUMBER_KEYS = new Set(["maxVisible","overflowCount","size","spacing","padding","elevation","rows","max","min","step","maxFiles","maxSize","length","pageSize","debounceMs","currentStep","duration","temperature"]);
const PROPERTY_ENUMS = {
  alignment: ["left","center","right"],
  orientation: ["horizontal","vertical"],
  direction: ["row","column"],
  fit: ["contain","cover","fill"],
  imageFit: ["contain","cover"],
  shape: ["circle","rounded","square"],
  target: ["_self","_blank"],
  variant: ["default","primary","secondary","success","warning","danger","info"],
  placement: ["top","right","bottom","left"],
  side: ["left","right"],
  mode: ["single","range"],
  unit: ["C","F"],
};

function prettyPropertyLabel(key) {
  return String(key || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function useRegistryObjectFields(objectKey, objects) {
  const [fields, setFields] = useState([]);
  useEffect(() => {
    if (!objectKey) { setFields([]); return; }
    const object = objects.find((candidate) => candidate.object_key === objectKey);
    if (!object?.id) { setFields([]); return; }
    let live = true;
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response) => { if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field.active !== false && field.readable !== false)); })
      .catch(() => { if (live) setFields([]); });
    return () => { live = false; };
  }, [objectKey, objects]);
  return fields;
}

function RegistryDrivenProperties({ node, meta, objects, pageResources = {}, onChange, targetComponents = [] }) {
  const configurable = Array.isArray(meta?.configurable) ? meta.configurable : [];
  const config = node.config || {};
  const objectKey = config.objectKey || "";
  const fields = useRegistryObjectFields(objectKey, objects);
  const actionKeys = configurable.filter((key) => /action$/i.test(key) || /clickaction/i.test(key));
  const ordinaryKeys = configurable.filter((key) => !actionKeys.includes(key) && !["filter","filters","sort","conditionMatch"].includes(key));
  const patchConfig = (key, value) => onChange({ config: { ...config, [key]: value } });
  const supportsObjectConditions = configurable.includes("objectKey");
  const conditionCollection = {
    conditions: Array.isArray(config.filters) ? config.filters : [],
    conditionMatch: config.conditionMatch || "all",
    sort: Array.isArray(config.sort) ? config.sort : [],
  };
  const patchConditionCollection = (patch) => {
    const next = { ...config };
    if (Object.prototype.hasOwnProperty.call(patch, "conditions")) next.filters = patch.conditions;
    if (Object.prototype.hasOwnProperty.call(patch, "conditionMatch")) next.conditionMatch = patch.conditionMatch;
    if (Object.prototype.hasOwnProperty.call(patch, "sort")) next.sort = patch.sort;
    onChange({ config: next });
  };

  if (!configurable.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        This component has no configurable metadata yet. Size can still be changed from the canvas resize handle.
      </div>
    );
  }

  const renderField = (key) => {
    if (key === "visibility" || key === "visible") {
      return <label key={key} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={node.visible !== false} onChange={(event) => onChange({ visible: event.target.checked })} /> Visible at runtime</label>;
    }
    if (key === "title") {
      return <div key={key} className="space-y-1"><label className={labelClass}>Title</label><input className={inputClass} value={node.title || ""} onChange={(event) => onChange({ title: event.target.value })} /></div>;
    }
    if (key === "objectKey") {
      return <div key={key} className="space-y-1"><label className={labelClass}>Object</label><select className={inputClass} value={config.objectKey || ""} onChange={(event) => onChange({ config: { ...config, objectKey: event.target.value, filters: [], conditionMatch: "all", sort: [] } })}><option value="">Select object…</option>{objects.map((object) => <option key={object.id} value={object.object_key}>{object.label || object.object_key}</option>)}</select></div>;
    }
    if (key === "dataSource") {
      return <div key={key} className="space-y-1"><label className={labelClass}>Data Source</label><select className={inputClass} value={config.dataSource || "records"} onChange={(event) => patchConfig("dataSource", event.target.value)}><option value="records">Object records</option><option value="static">Static values</option></select></div>;
    }
    if ((/Field$/i.test(key) || /Binding$/i.test(key)) && !/Fields$/i.test(key) && fields.length) {
      return <FieldSelect key={key} label={prettyPropertyLabel(key)} value={config[key] || ""} fields={fields} onChange={(value) => patchConfig(key, value)} />;
    }
    if (PROPERTY_BOOLEAN_KEYS.has(key)) {
      return <label key={key} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={config[key] !== false} onChange={(event) => patchConfig(key, event.target.checked)} /> {prettyPropertyLabel(key)}</label>;
    }
    if (PROPERTY_ENUMS[key]) {
      return <div key={key} className="space-y-1"><label className={labelClass}>{prettyPropertyLabel(key)}</label><select className={inputClass} value={config[key] || PROPERTY_ENUMS[key][0]} onChange={(event) => patchConfig(key, event.target.value)}>{PROPERTY_ENUMS[key].map((value) => <option key={value} value={value}>{prettyPropertyLabel(value)}</option>)}</select></div>;
    }
    if (PROPERTY_NUMBER_KEYS.has(key)) {
      return <div key={key} className="space-y-1"><label className={labelClass}>{prettyPropertyLabel(key)}</label><input className={inputClass} type="number" value={config[key] ?? ""} onChange={(event) => patchConfig(key, event.target.value === "" ? "" : Number(event.target.value))} /></div>;
    }
    if (/Fields$|items$|steps$|options$|secondaryValues$|popupFields$/i.test(key)) {
      const value = Array.isArray(config[key]) ? config[key].join(", ") : (config[key] || "");
      return <div key={key} className="space-y-1"><label className={labelClass}>{prettyPropertyLabel(key)}</label><textarea className={inputClass} rows={2} value={value} onChange={(event) => patchConfig(key, event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="Comma-separated values" /></div>;
    }
    return <div key={key} className="space-y-1"><label className={labelClass}>{prettyPropertyLabel(key)}</label><input className={inputClass} value={config[key] ?? ""} onChange={(event) => patchConfig(key, event.target.value)} /></div>;
  };

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
        <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Configuration</legend>
        {ordinaryKeys.map(renderField)}
      </fieldset>
      {supportsObjectConditions ? (
        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5">
          <legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Conditions & Filters</legend>
          {objectKey ? (
            <>
              <ConditionsEditor collection={conditionCollection} fields={fields} onChange={patchConditionCollection} pageResources={pageResources} targetComponents={targetComponents} />
              <SortEditor collection={conditionCollection} fields={fields} onChange={patchConditionCollection} />
            </>
          ) : (
            <p className="text-[11px] text-slate-500">Select an Object first, then add field conditions and sorting.</p>
          )}
        </fieldset>
      ) : null}
      {actionKeys.length ? <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2.5"><legend className="px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Interaction</legend><InteractionProperties node={node} targetComponents={targetComponents} onChange={onChange} /></fieldset> : null}
    </div>
  );
}

function collection_fields(node) {
  return node?.collection?.fields || [];
}

function FieldSelect({ label, value, fields, onChange }) {
  return (
    <div className="space-y-1">
      <label className={labelClass}>{label}</label>
      <select className={inputClass} value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {value && !fields.some((field) => field.api_name === value) ? <option value={value}>{value}</option> : null}
        {fields.map((field) => <option key={field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
      </select>
    </div>
  );
}

function CollectionFilterValue({ value, disabled, pageResources = {}, targetComponents = [], onChange }) {
  const resource = value && typeof value === "object" && !Array.isArray(value) ? value : { type: "constant", value: value ?? "" };
  const type = resource.type || "constant";
  const setType = (next) => {
    if (next === "constant") onChange({ type: "constant", value: "" });
    else if (next === "current_user" || next === "current_record") onChange({ type: next, field: "" });
    else onChange({ type: next, key: "" });
  };
  const keyed = ["page_parameter","page_variable","component_value","selected_record","flow_output"].includes(type);
  const definitions = type === "page_parameter" ? (pageResources.parameters || []) : type === "page_variable" ? (pageResources.variables || []) : [];
  const componentOptions = ["component_value","selected_record","flow_output"].includes(type) ? targetComponents : [];
  return <div className="flex min-w-[190px] flex-1 items-center gap-1">
    <select className="rounded border border-slate-200 px-1 py-1 text-[11px]" value={type} disabled={disabled} onChange={(event)=>setType(event.target.value)}>
      <option value="constant">Value</option><option value="current_user">Current User</option><option value="current_record">Current Record</option>
      <option value="page_parameter">Page Parameter</option><option value="page_variable">Page Variable</option>
      <option value="component_value">Component Value</option><option value="selected_record">Selected Record</option><option value="flow_output">Flow Output</option>
      <option value="formula">Formula</option>
    </select>
    {type === "constant" ? <input className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={resource.value ?? ""} disabled={disabled} onChange={(event)=>onChange({type:"constant",value:event.target.value})} placeholder="value" /> : null}
    {(type === "current_user" || type === "current_record") ? <input className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={resource.field || ""} disabled={disabled} onChange={(event)=>onChange({...resource,type,field:event.target.value})} placeholder="Field path" /> : null}
    {keyed && definitions.length ? <select className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-1 text-xs" value={resource.key || ""} disabled={disabled} onChange={(event)=>onChange({...resource,type,key:event.target.value})}><option value="">Select…</option>{definitions.map((item)=><option key={item.key} value={item.key}>{item.label || item.key}</option>)}</select> : null}
    {keyed && !definitions.length && componentOptions.length ? <select className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-1 text-xs" value={resource.key || ""} disabled={disabled} onChange={(event)=>onChange({...resource,type,key:event.target.value})}><option value="">Select component…</option>{componentOptions.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select> : null}
    {keyed && !definitions.length && !componentOptions.length ? <input className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={resource.key || ""} disabled={disabled} onChange={(event)=>onChange({...resource,type,key:event.target.value})} placeholder="Resource key" /> : null}
    {(type === "selected_record" || type === "flow_output") ? <input className="w-24 rounded border border-slate-200 px-1.5 py-1 text-xs" value={resource.field || ""} disabled={disabled} onChange={(event)=>onChange({...resource,type,field:event.target.value})} placeholder="Field" /> : null}
    {type === "formula" ? <input className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={resource.expression || ""} disabled={disabled} onChange={(event)=>onChange({type:"formula",expression:event.target.value})} placeholder="Formula" /> : null}
  </div>;
}

function ConditionsEditor({ collection, fields, onChange, pageResources = {}, targetComponents = [] }) {
  const conditions = collection.conditions || [];
  const setConditions = (next) => onChange({ conditions: next });
  /* The CANONICAL platform operator vocabulary — the same set workflows and
     validation rules use (conditionOperators.js mirrors the server engine). */
  const operators = CONDITION_OPERATORS;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>Conditions</label>
        <select className="rounded border border-slate-200 px-1 py-0.5 text-[11px]" value={collection.conditionMatch || "all"} onChange={(event) => onChange({ conditionMatch: event.target.value })} aria-label="Condition match mode">
          <option value="all">Match ALL</option>
          <option value="any">Match ANY</option>
        </select>
      </div>
      {conditions.map((condition, index) => (
        <div key={index} className="flex items-center gap-1">
          <select className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={condition.field} onChange={(event) => setConditions(conditions.map((item, itemIndex) => (itemIndex === index ? { ...item, field: event.target.value } : item)))}>
            <option value="">Field…</option>
            {fields.map((field) => <option key={field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
          </select>
          <select className="rounded border border-slate-200 px-1 py-1 text-xs" value={condition.operator} onChange={(event) => setConditions(conditions.map((item, itemIndex) => (itemIndex === index ? { ...item, operator: event.target.value } : item)))}>
            {operators.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <CollectionFilterValue value={condition.value} disabled={["is_empty", "is_not_empty"].includes(condition.operator)} pageResources={pageResources} targetComponents={targetComponents} onChange={(value)=>setConditions(conditions.map((item,itemIndex)=>(itemIndex===index?{...item,value}:item)))} />
          <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove condition" onClick={() => setConditions(conditions.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </div>
      ))}
      <button type="button" className="text-[11px] text-blue-700" disabled={conditions.length >= 20} onClick={() => setConditions([...conditions, { field: "", operator: "equals", value: "" }])}>+ Add condition</button>
    </div>
  );
}

function SortEditor({ collection, fields, onChange }) {
  const sort = collection.sort || [];
  const setSort = (next) => onChange({ sort: next });
  return (
    <div className="space-y-1">
      <label className={labelClass}>Sort</label>
      {sort.map((entry, index) => (
        <div key={index} className="flex items-center gap-1">
          <select className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-xs" value={entry.field} onChange={(event) => setSort(sort.map((item, itemIndex) => (itemIndex === index ? { ...item, field: event.target.value } : item)))}>
            <option value="">Field…</option>
            {fields.map((field) => <option key={field.api_name} value={field.api_name}>{field.label || field.api_name}</option>)}
          </select>
          <select className="rounded border border-slate-200 px-1 py-1 text-xs" value={entry.direction} onChange={(event) => setSort(sort.map((item, itemIndex) => (itemIndex === index ? { ...item, direction: event.target.value } : item)))}>
            <option value="desc">DESC</option><option value="asc">ASC</option>
          </select>
          <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove sort" onClick={() => setSort(sort.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </div>
      ))}
      <button type="button" className="text-[11px] text-blue-700" disabled={sort.length >= 3} onClick={() => setSort([...sort, { field: "", direction: "desc" }])}>+ Add sort</button>
    </div>
  );
}

/** INTERACTION group — delegates to the generic picker. */
function InteractionProperties({ node, onChange, targetComponents = [] }) {
  const eventName = node.eventName || "click";
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className={labelClass}>Event</label>
        <select className={inputClass} value={eventName} onChange={(event) => onChange({ eventName: event.target.value })}>
          <option value="click">On Click / Select</option>
          <option value="change">On Change</option>
          <option value="submit">On Submit</option>
          <option value="load">On Load</option>
          <option value="success">On Success</option>
          <option value="error">On Error</option>
        </select>
        {eventName !== "click" ? <p className="text-[11px] text-amber-600">This event is saved as metadata. Runtime execution is enabled when the component emits this generic event.</p> : null}
      </div>
      <ActionWorkflowPicker
        interaction={node.interaction || { type: "none" }}
        objectKey={node.collection?.objectKey || node.config?.objectKey || ""}
        targetComponents={targetComponents}
        onChange={(interaction) => onChange({ interaction })}
      />
    </div>
  );
}
