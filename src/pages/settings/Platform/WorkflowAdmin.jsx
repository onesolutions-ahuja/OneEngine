import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import PlatformFieldPicker from "./PlatformFieldPicker.jsx";
import MetadataResourcePicker from "./MetadataResourcePicker.jsx";
import WorkflowReactFlowCanvas from "./WorkflowReactFlowCanvas.jsx";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

const WORKFLOW_VISUAL_CSS = `
  .workflow-builder-page {
    --wf-border: rgba(15, 23, 42, .09);
    --wf-muted: #64748b;
    --wf-text: #172033;
    --wf-blue: #0a84ff;
    --wf-surface: #ffffff;
    --wf-canvas: #fbfdff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .workflow-builder-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid var(--wf-border);
    border-radius: 14px;
    background: rgba(255,255,255,.98);
    box-shadow: 0 1px 3px rgba(15,23,42,.05);
  }
  .workflow-builder-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-right: 4px;
  }
  .workflow-builder-back {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid #d8dde6;
    border-radius: 6px;
    background: #fff;
    color: #444;
    font-size: 16px;
    cursor: pointer;
  }
  .workflow-builder-title-copy { min-width: 0; }
  .workflow-builder-title-copy small {
    display: block;
    max-width: min(62vw, 760px);
    margin-top: 2px;
    overflow: hidden;
    color: #706e6b;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workflow-builder-status {
    display: inline-flex;
    align-items: center;
    margin-left: 2px;
    border-radius: 999px;
    background: #f3f3f3;
    padding: 2px 7px;
    color: #444;
    font-size: 8px;
    font-weight: 700;
  }
  .workflow-builder-heading h2 {
    margin: 0;
    color: #13213a;
    font-size: 18px;
    line-height: 1.1;
    font-weight: 760;
    letter-spacing: -.025em;
    white-space: nowrap;
  }
  .workflow-builder-field label {
    display: block;
    margin: 0 0 5px;
    color: #64748b;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .015em;
    text-transform: none;
  }
  .workflow-builder-field input,
  .workflow-builder-field select {
    min-height: 38px;
  }
  .workflow-builder-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
  }
  .workflow-save-button {
    min-height: 38px;
    border: 0;
    border-radius: 9px;
    padding: 0 16px;
    background: #0a84ff;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 5px 14px rgba(10,132,255,.18);
    cursor: pointer;
  }
  .workflow-cancel-button {
    min-height: 38px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    padding: 0 11px;
    background: #fff;
    color: #64748b;
    font-size: 12px;
    cursor: pointer;
  }
  .workflow-icon-button { width: 34px; min-height: 34px; padding: 0; font-size: 16px; }
  .workflow-cancel-button:disabled, .workflow-save-button:disabled { opacity: .45; cursor: not-allowed; }
  .workflow-ready-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 0 4px rgba(34,197,94,.10);
  }
  .workflow-ready-dot.has-issue {
    background: #ef4444;
    box-shadow: 0 0 0 4px rgba(239,68,68,.10);
  }

  .workflow-visual-shell {
    display: grid;
    grid-template-columns: 238px minmax(390px, 1fr) 336px;
    gap: 10px;
    min-height: calc(100vh - 198px);
    width: 100%;
    min-width: 0;
    align-items: stretch;
  }
  .workflow-node-palette,
  .workflow-properties-panel,
  .workflow-canvas-surface {
    min-width: 0;
    border: 1px solid var(--wf-border);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15,23,42,.05);
  }
  .workflow-node-palette {
    padding: 12px 10px 10px;
    overflow: hidden;
  }
  .workflow-palette-head,
  .workflow-properties-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .workflow-properties-title,
  .workflow-palette-title {
    margin: 0;
    color: #172033;
    font-size: 14px;
    font-weight: 760;
  }
  .workflow-palette-search {
    position: relative;
    margin-bottom: 10px;
  }
  .workflow-palette-search span {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 13px;
    pointer-events: none;
  }
  .workflow-palette-search input {
    width: 100%;
    min-height: 37px;
    box-sizing: border-box;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #fff;
    padding: 7px 9px 7px 30px;
    color: #334155;
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .workflow-palette-search input:focus {
    border-color: rgba(10,132,255,.45);
    box-shadow: 0 0 0 3px rgba(10,132,255,.08);
  }
  .workflow-palette-help {
    margin: -2px 0 9px;
    color: #94a3b8;
    font-size: 9px;
    line-height: 1.35;
  }
  .workflow-palette-scroll {
    max-height: calc(100vh - 330px);
    overflow: auto;
    padding-right: 3px;
  }
  .workflow-palette-empty {
    padding: 18px 8px;
    color: #94a3b8;
    font-size: 11px;
    text-align: center;
  }
  .workflow-palette-item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    margin-bottom: 6px;
    padding: 7px 9px;
    border: 1px solid #e7edf4;
    border-radius: 9px;
    background: #fff;
    color: #334155;
    font-size: 11px;
    font-weight: 560;
    text-align: left;
    cursor: grab;
    transition: background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease;
  }
  .workflow-palette-item::before {
    content: "⋮⋮";
    flex: 0 0 auto;
    color: #b1bdcc;
    font-size: 10px;
    letter-spacing: -2px;
  }
  .workflow-palette-item::after { content: none; }
  .workflow-palette-item.is-browse-only,
  .workflow-palette-item:disabled {
    opacity: 1;
    cursor: default;
  }
  .workflow-palette-item.is-browse-only:hover,
  .workflow-palette-item:disabled:hover {
    background: transparent;
    box-shadow: none;
  }
  .workflow-palette-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    font-weight: 800;
  }
  .workflow-resource-choice {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    padding: 8px;
    color: #181818;
    text-align: left;
    cursor: pointer;
  }
  .workflow-resource-choice:hover { background: #f3f9ff; }
  .workflow-resource-choice strong { font-size: 11px; }
  .workflow-resource-choice small { color: #706e6b; font-size: 9px; line-height: 1.3; }
  .workflow-manager-item { border-bottom: 1px solid #f1f3f6; }
  .workflow-manager-item-row { display: grid; grid-template-columns: minmax(0,1fr) 28px; align-items: center; }
  .workflow-manager-item-row .workflow-palette-item { width: 100%; border-bottom: 0; }
  .workflow-manager-chevron { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 4px; background: transparent; color: #706e6b; cursor: pointer; }
  .workflow-manager-chevron:hover { background: #f3f3f3; }
  .workflow-manager-detail { margin: -2px 6px 7px 34px; border-left: 2px solid #d8dde6; padding: 5px 8px; }
  .workflow-manager-detail > div { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 8px; }
  .workflow-manager-detail span { color: #706e6b; }
  .workflow-manager-detail strong { max-width: 125px; overflow: hidden; color: #181818; text-overflow: ellipsis; white-space: nowrap; }
  .workflow-manager-detail p { margin: 4px 0 0; color: #706e6b; font-size: 8px; line-height: 1.35; }
  .workflow-palette-group-title {
    margin: 12px 4px 6px;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .workflow-palette-item-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .workflow-palette-item-copy strong {
    color: #334155;
    font-size: 11px;
    font-weight: 650;
  }
  .workflow-palette-item-copy small {
    display: block;
    overflow: hidden;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 450;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workflow-palette-item:hover {
    background: #f8fbff;
    border-color: rgba(10,132,255,.28);
    box-shadow: 0 4px 12px rgba(15,23,42,.05);
    transform: translateY(-1px);
  }

  .workflow-canvas-surface {
    position: relative;
    min-height: calc(100vh - 198px);
    max-height: calc(100vh - 156px);
    overflow: auto;
    padding: 16px 18px 30px;
    background-color: var(--wf-canvas);
    background-image: radial-gradient(circle, rgba(148,163,184,.30) 1px, transparent 1px);
    background-size: 18px 18px;
    box-shadow: inset 0 1px 4px rgba(15,23,42,.025);
    overscroll-behavior: contain;
  }
  .workflow-canvas-surface.is-panning {
    cursor: grabbing;
    user-select: none;
  }
  .workflow-canvas-surface.is-panning * { cursor: grabbing !important; }
  .workflow-canvas-toolbar {
    position: sticky;
    top: 0;
    z-index: 12;
    display: flex;
    width: fit-content;
    max-width: 100%;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 5px;
    margin: -5px -7px 14px auto;
    padding: 4px;
    border: 1px solid rgba(226,232,240,.86);
    border-radius: 10px;
    background: rgba(255,255,255,.86);
    box-shadow: 0 4px 14px rgba(15,23,42,.06);
    backdrop-filter: blur(10px);
    pointer-events: none;
  }
  .workflow-canvas-toolbar button {
    height: 30px;
    padding: 0 9px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: rgba(255,255,255,.94);
    color: #64748b;
    font-size: 10px;
    font-weight: 650;
    box-shadow: 0 2px 8px rgba(15,23,42,.05);
    cursor: pointer;
    pointer-events: auto;
  }
  .workflow-add-element-popover {
    position: sticky;
    top: 42px;
    z-index: 20;
    width: min(560px, calc(100% - 36px));
    max-height: 68vh;
    margin: 0 auto 16px;
    overflow: hidden;
    border: 1px solid #d8dde6;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 14px 40px rgba(15,23,42,.18);
  }
  .workflow-add-element-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 14px 9px;
    border-bottom: 1px solid #eef2f7;
  }
  .workflow-add-element-head > div { display: flex; flex-direction: column; gap: 2px; }
  .workflow-add-element-head strong { color: #181818; font-size: 14px; }
  .workflow-add-element-head small { color: #706e6b; font-size: 10px; }
  .workflow-add-element-head button { border: 0; background: transparent; color: #706e6b; font-size: 20px; cursor: pointer; }
  .workflow-add-element-search { position: relative; padding: 10px 12px 6px; }
  .workflow-add-element-search span { position: absolute; left: 22px; top: 20px; color: #706e6b; }
  .workflow-add-element-search input { width: 100%; min-height: 36px; box-sizing: border-box; border: 1px solid #c9c7c5; border-radius: 4px; padding: 7px 10px 7px 30px; font-size: 12px; }
  .workflow-add-element-groups { max-height: 52vh; overflow: auto; padding: 0 12px 14px; }
  .workflow-add-element-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .workflow-add-element-grid > button { display: flex; align-items: center; gap: 9px; min-height: 48px; border: 1px solid #e5e5e5; border-radius: 7px; background: #fff; padding: 8px 10px; text-align: left; cursor: pointer; }
  .workflow-add-element-grid > button:hover { border-color: #1b96ff; background: #f3f9ff; }
  .workflow-add-element-grid strong { display: block; color: #181818; font-size: 11px; }
  .workflow-add-element-grid small { display: block; margin-top: 2px; overflow: hidden; color: #706e6b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .workflow-add-element-icon { display: grid; place-items: center; width: 28px; height: 28px; flex: 0 0 auto; border-radius: 5px; background: #1b96ff; color: #fff; font-size: 14px; }
  .workflow-canvas-lane {
    width: min(100%, 560px);
    margin: 78px auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-start-node {
    display: grid;
    grid-template-columns: 34px 1fr;
    column-gap: 10px;
    align-items: center;
    min-width: 220px;
    max-width: 360px;
    border: 1.5px solid #50d68b;
    border-radius: 18px;
    background: linear-gradient(180deg,#f6fff9 0%,#effcf4 100%);
    padding: 10px 14px;
    color: #14532d;
    box-shadow: 0 8px 22px rgba(34,197,94,.08);
  }
  .workflow-start-icon {
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: #22b95f;
    color: #fff;
    font-size: 14px;
    box-shadow: 0 4px 10px rgba(34,185,95,.20);
  }
  .workflow-start-title {
    color: #173c2a;
    font-size: 13px;
    font-weight: 760;
    line-height: 1.1;
  }
  .workflow-start-note {
    margin-top: 3px;
    color: #34a167;
    font-size: 10px;
    font-weight: 540;
  }
  .workflow-node-connector {
    position: relative;
    width: 2px;
    height: 42px;
    background: #93a7bf;
  }
  .workflow-node-connector::before {
    content: "";
    position: absolute;
    left: 50%;
    top: -3px;
    width: 8px;
    height: 8px;
    transform: translateX(-50%);
    border: 1.5px solid #7d93ad;
    border-radius: 999px;
    background: #fff;
  }
  .workflow-insert-button {
    position: absolute;
    z-index: 4;
    left: 50%;
    top: 50%;
    width: 24px;
    height: 24px;
    transform: translate(-50%, -50%);
    border: 1px solid #8fa6bf;
    border-radius: 999px;
    background: #fff;
    color: #2563eb;
    font-size: 18px;
    font-weight: 500;
    line-height: 20px;
    box-shadow: 0 2px 6px rgba(15,23,42,.12);
    cursor: pointer;
  }
  .workflow-insert-button:hover { border-color: #2563eb; background: #eff6ff; box-shadow: 0 0 0 3px rgba(37,99,235,.10); }
  .workflow-node-connector::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -1px;
    width: 7px;
    height: 7px;
    transform: translateX(-50%) rotate(45deg);
    border-right: 1.5px solid #7d93ad;
    border-bottom: 1.5px solid #7d93ad;
  }
  .workflow-node-wrap {
    position: relative;
    width: min(100%, 360px);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-node-card {
    position: relative;
    width: 100%;
    min-height: 70px;
    padding: 12px 38px 12px 58px;
    border: 1px solid #dbe6f2;
    border-radius: 16px;
    background: rgba(255,255,255,.99);
    color: #1e293b;
    text-align: left;
    box-shadow: 0 8px 24px rgba(15,23,42,.055);
    cursor: pointer;
    transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
  }
  .workflow-node-card::before {
    content: "⚙";
    position: absolute;
    left: 13px;
    top: 50%;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    transform: translateY(-50%);
    border-radius: 9px;
    background: #0a84ff;
    color: #fff;
    font-size: 17px;
    font-weight: 800;
    box-shadow: 0 5px 12px rgba(10,132,255,.18);
  }
  .workflow-node-card[data-node-type="CONDITION"]::before { content: "◇"; background: #dd7a01; }
  .workflow-node-card[data-node-type="LOOP"]::before { content: "↻"; background: #8b5cf6; }
  .workflow-node-card[data-node-type="CREATE_RECORD"]::before { content: "+"; background: #2e844a; }
  .workflow-node-card[data-node-type="UPDATE_RECORD"]::before { content: "✎"; background: #2e844a; }
  .workflow-node-card[data-node-type="DELETE_RECORD"]::before { content: "−"; background: #ba0517; }
  .workflow-node-card[data-node-type="RUN_SUBFLOW"]::before { content: "⇢"; background: #0176d3; }
  .workflow-node-card[data-node-type="WAIT"]::before { content: "◷"; background: #9050e9; }
  .workflow-node-card[data-node-type="SEND_EMAIL"]::before { content: "✉"; background: #0176d3; }
  .workflow-node-card:hover {
    transform: translateY(-1px);
    border-color: #9bbce0;
    box-shadow: 0 12px 27px rgba(15,23,42,.08);
  }
  .workflow-node-card.is-selected {
    border-color: #0a84ff;
    box-shadow: 0 0 0 2px rgba(10,132,255,.10), 0 12px 27px rgba(15,23,42,.08);
  }
  .workflow-node-card.is-disabled { opacity: .5; }
  .workflow-node-card.has-builder-error {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239,68,68,.10), 0 10px 24px rgba(239,68,68,.08);
  }
  .workflow-node-card.has-builder-error .workflow-node-icon { background: #dc2626 !important; }
  .workflow-node-error-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    border-radius: 999px;
    background: #fee2e2;
    padding: 3px 7px;
    color: #b91c1c;
    font-size: 9px;
    font-weight: 750;
  }
  .workflow-node-card.is-debug-completed {
    border-color: #22c55e;
    background: #f0fdf4;
    box-shadow: 0 0 0 2px rgba(34,197,94,.10), 0 10px 24px rgba(34,197,94,.08);
  }
  .workflow-node-card.is-debug-failed {
    border-color: #ef4444;
    background: #fff1f2;
    box-shadow: 0 0 0 3px rgba(239,68,68,.12), 0 12px 28px rgba(239,68,68,.12);
  }
  .workflow-node-card.is-debug-failed::before { background: #ef4444; }
  .workflow-node-card.is-debug-completed::before { background: #22c55e; }
  .workflow-node-card.is-debug-simulated {
    border-style: dashed;
  }
  .workflow-node-card.is-fault-source:not(.is-debug-failed) {
    box-shadow: inset 3px 0 0 #ef4444, 0 8px 24px rgba(15,23,42,.055);
  }
  .workflow-node-card.is-fault-target:not(.is-debug-failed) {
    border-color: #fecaca;
    background: #fffafa;
  }
  .workflow-node-card.is-fault-target:not(.is-debug-failed)::before {
    background: #dc2626;
  }
  .workflow-fault-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    border-radius: 999px;
    background: #fee2e2;
    padding: 3px 7px;
    color: #b91c1c;
    font-size: 9px;
    font-weight: 700;
  }
  .workflow-node-kind {
    display: block;
    margin-bottom: 4px;
    color: #7c8aa0;
    font-size: 8px;
    font-weight: 760;
    letter-spacing: .065em;
    text-transform: uppercase;
  }
  .workflow-node-title {
    display: block;
    color: #172033;
    font-size: 12px;
    font-weight: 760;
    line-height: 1.25;
  }
  .workflow-node-description {
    position: absolute;
    right: 34px;
    top: 12px;
    color: #706e6b;
    font-size: 10px;
  }
  .workflow-node-note {
    display: block;
    margin-top: 5px;
    color: #64748b;
    font-size: 9px;
  }
  .workflow-decision-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
  }
  .workflow-decision-preview span {
    border: 1px solid #fed7aa;
    border-radius: 999px;
    background: #fff7ed;
    padding: 2px 6px;
    color: #9a3412;
    font-size: 8px;
    font-weight: 650;
  }
  .workflow-node-row { position: relative; width: 100%; }
  .workflow-node-card::before { content: none !important; }
  .workflow-node-icon {
    position: absolute;
    left: 13px;
    top: 50%;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    transform: translateY(-50%);
    border-radius: 7px;
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    box-shadow: 0 3px 8px rgba(15,23,42,.13);
  }
  .workflow-node-card.is-debug-failed .workflow-node-icon { background: #ef4444 !important; }
  .workflow-node-card.is-debug-completed .workflow-node-icon { background: #22c55e !important; }
  .workflow-node-menu {
    position: absolute;
    top: 7px;
    right: 8px;
    z-index: 9;
  }
  .workflow-node-menu > summary {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 4px;
    color: #706e6b;
    font-size: 18px;
    cursor: pointer;
    list-style: none;
  }
  .workflow-node-menu > summary::-webkit-details-marker { display: none; }
  .workflow-node-menu > summary:hover { background: #f3f3f3; }
  .workflow-node-menu-popover {
    position: absolute;
    top: 28px;
    right: 0;
    z-index: 30;
    width: 154px;
    overflow: hidden;
    border: 1px solid #c9c7c5;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(0,0,0,.16);
  }
  .workflow-node-menu-popover button {
    display: block;
    width: 100%;
    border: 0;
    background: #fff;
    padding: 8px 11px;
    color: #181818;
    font-size: 10px;
    text-align: left;
    cursor: pointer;
  }
  .workflow-node-menu-popover button:hover { background: #f3f3f3; }
  .workflow-node-menu-popover button.is-danger { color: #ba0517; }
  .workflow-decision-toggle {
    position: absolute;
    left: -31px;
    top: 22px;
    width: 24px;
    height: 24px;
    border: 1px solid #c9c7c5;
    border-radius: 999px;
    background: #fff;
    color: #444;
    cursor: pointer;
  }
  .workflow-branch-map {
    position: relative;
    z-index: 2;
    display: flex;
    width: min(860px, calc(100vw - 690px));
    max-width: min(860px, calc(100vw - 48px));
    margin: 10px 50% 0;
    transform: translateX(-50%);
    gap: 12px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-gutter: stable;
    padding: 18px 8px 8px;
    align-items: flex-start;
  }
  .workflow-branch-path {
    position: relative;
    min-width: 150px;
    flex: 1 0 150px;
    padding-top: 12px;
    text-align: center;
  }
  .workflow-branch-line { position: absolute; top: -18px; left: 50%; width: 1px; height: 28px; background: #8fa6bf; }
  .workflow-branch-label { display: block; overflow: hidden; margin-bottom: 8px; color: #3e3e3c; font-size: 10px; font-weight: 700; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .workflow-branch-path.is-highlighted { border-radius: 8px; background: rgba(1,118,211,.055); box-shadow: 0 0 0 2px rgba(1,118,211,.18); }
  .workflow-branch-label-input { width: 100%; border: 0; border-bottom: 1px solid transparent; background: transparent; color: #3e3e3c; font-size: 9px; font-weight: 700; text-align: center; outline: none; }
  .workflow-branch-label-input:focus { border-bottom-color: #0176d3; }
  .workflow-group-card { width: min(100%, 380px); border: 1px solid #b9c9dc; border-radius: 8px; background: #f8fbff; padding: 8px 10px; box-shadow: 0 2px 7px rgba(15,23,42,.05); }
  .workflow-group-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .workflow-group-head strong { color:#181818; font-size:11px; }
  .workflow-group-head small { display:block; margin-top:2px; color:#706e6b; font-size:8px; }
  .workflow-group-actions { display:flex; gap:4px; }
  .workflow-group-actions button { border:1px solid #d8dde6; border-radius:4px; background:#fff; padding:3px 6px; font-size:9px; cursor:pointer; }
  .workflow-branch-stack { display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .workflow-branch-node-row { position: relative; width: 100%; }
  .workflow-branch-node-card {
    display: grid;
    width: 100%;
    grid-template-columns: 25px minmax(0,1fr);
    gap: 7px;
    align-items: center;
    border: 1px solid #d8dde6;
    border-radius: 5px;
    background: #fff;
    padding: 7px 27px 7px 7px;
    color: #181818;
    text-align: left;
    box-shadow: 0 1px 2px rgba(0,0,0,.06);
    cursor: pointer;
  }
  .workflow-branch-node-card.is-selected { border-color: #0176d3; box-shadow: 0 0 0 1px #0176d3; }
  .workflow-branch-node-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 800; }
  .workflow-branch-node-card small { display: block; color: #706e6b; font-size: 8px; font-weight: 700; line-height: 1.25; text-transform: uppercase; }
  .workflow-branch-node-card strong { display: block; overflow: hidden; margin-top: 2px; color: #181818; font-size: 10px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .workflow-node-menu.branch-menu { top: 4px; right: 3px; }
  .workflow-node-menu.branch-menu > summary { width: 22px; height: 22px; font-size: 15px; }
  .workflow-branch-add { width: 24px; height: 24px; border: 1px solid #8fa6bf; border-radius: 999px; background: #fff; color: #0176d3; font-size: 16px; line-height: 20px; cursor: pointer; }
  .workflow-branch-add:hover { border-color: #0176d3; background: #f3f9ff; }
  .workflow-owned-step { display: flex; width: 100%; flex-direction: column; align-items: center; gap: 7px; }
  .workflow-branch-map-single { justify-content: center; overflow: visible; }
  .workflow-branch-map-single > .workflow-branch-path { max-width: 210px; flex-grow: 0; }
  .workflow-branch-path.is-fault .workflow-branch-label { color: #ba0517; }
  .workflow-branch-path.is-fault .workflow-branch-line { background: #ea001e; }
  .workflow-fault-map { margin-top: 4px; }
  .workflow-start-paths { margin-top: 8px; }
  .workflow-nested-paths { width: 100%; }
  .workflow-nested-map {
    width: 100%;
    max-width: 100%;
    margin: 5px 0 0;
    transform: none;
    overflow-x: auto;
    padding: 16px 2px 2px;
    gap: 6px;
  }
  .workflow-nested-map .workflow-branch-path { min-width: 118px; flex-basis: 118px; }
  .workflow-branch-collapse {
    position: absolute;
    left: -24px;
    top: 7px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 1px solid #c9c7c5;
    border-radius: 999px;
    background: #fff;
    color: #444;
    font-size: 10px;
    cursor: pointer;
  }
  .workflow-connector-label {
    position: absolute;
    left: calc(50% + 18px);
    top: 50%;
    transform: translateY(-50%);
    width: max-content;
    color: #706e6b;
    font-size: 8px;
    font-weight: 700;
  }
  .workflow-end-node {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 3px;
    border: 1px solid #c9c7c5;
    border-radius: 999px;
    background: #fff;
    padding: 6px 13px;
    color: #3e3e3c;
    font-size: 10px;
  }
  .workflow-end-node span { font-size: 7px; color: #706e6b; }
  .workflow-flow-properties-panel,
  .workflow-path-action-panel {
    position: fixed;
    z-index: 80;
    top: 50%;
    left: 50%;
    width: min(430px, calc(100vw - 32px));
    transform: translate(-50%, -50%);
    overflow: hidden;
    border: 1px solid #c9c7c5;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 18px 50px rgba(0,0,0,.24);
  }
  .workflow-path-action-body { padding: 14px; }
  .workflow-path-action-body p { margin: 0 0 12px; color: #3e3e3c; font-size: 11px; line-height: 1.45; }
  .workflow-path-action-body label { display: grid; gap: 5px; color: #3e3e3c; font-size: 10px; font-weight: 700; }
  .workflow-path-action-body select { width: 100%; min-height: 36px; border: 1px solid #c9c7c5; border-radius: 4px; background: #fff; padding: 6px 8px; color: #181818; font-size: 11px; }
  .workflow-path-action-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .workflow-flow-property-readonly { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #eef1f6; padding-top: 10px; font-size: 10px; }
  .workflow-flow-property-readonly span { color: #706e6b; }
  .workflow-flow-property-readonly strong { color: #181818; }
  .workflow-danger-button { min-height: 38px; border: 1px solid #ba0517; border-radius: 8px; background: #ba0517; padding: 0 15px; color: #fff; font-size: 11px; font-weight: 700; cursor: pointer; }
  .workflow-action-picker { overflow: hidden; border: 1px solid #d8dde6; border-radius: 6px; background: #fff; }
  .workflow-action-picker-search { position: relative; padding: 8px; border-bottom: 1px solid #eef1f6; }
  .workflow-action-picker-search span { position: absolute; left: 17px; top: 17px; color: #706e6b; font-size: 11px; }
  .workflow-action-picker-search input { width: 100%; min-height: 34px; box-sizing: border-box; border: 1px solid #c9c7c5; border-radius: 4px; padding: 6px 8px 6px 26px; font-size: 11px; }
  .workflow-action-picker-scroll { max-height: 290px; overflow: auto; padding: 5px 7px 8px; }
  .workflow-action-choice { display: flex; width: 100%; align-items: center; gap: 8px; border: 0; border-radius: 4px; background: #fff; padding: 7px; text-align: left; cursor: pointer; }
  .workflow-action-choice:hover { background: #f3f9ff; }
  .workflow-action-choice strong { display: block; color: #181818; font-size: 10px; }
  .workflow-action-choice small { display: block; margin-top: 2px; color: #706e6b; font-size: 8px; line-height: 1.25; }

  .workflow-freeform-canvas {
    position: relative;
    min-width: 1200px;
    min-height: 900px;
  }
  .workflow-freeform-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .workflow-freeform-node {
    position: absolute;
    width: 250px;
    z-index: 2;
    cursor: grab;
  }
  .workflow-freeform-node:active { cursor: grabbing; }
  .workflow-freeform-node .workflow-node-card { width: 250px; }
  .workflow-freeform-start {
    position: absolute;
    width: 220px;
    z-index: 2;
    cursor: grab;
  }
  .workflow-layout-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid #d8dde6;
    border-radius: 7px;
    background: #f8fafc;
    pointer-events: auto;
  }
  .workflow-layout-toggle button {
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  .workflow-layout-toggle button.is-active {
    background: #fff;
    color: #0176d3;
    box-shadow: 0 1px 3px rgba(15,23,42,.12);
  }
    .workflow-properties-panel {
    padding: 11px;
    overflow: auto;
    max-height: calc(100vh - 156px);
  }
  .workflow-properties-tabs {
    display: flex;
    gap: 22px;
    align-items: center;
    min-height: 32px;
    border-bottom: 1px solid #eef2f7;
    margin: -2px -2px 10px;
    padding: 0 7px;
  }
  .workflow-properties-tab {
    position: relative;
    padding: 0 0 9px;
    color: #64748b;
    font-size: 12px;
    font-weight: 650;
  }
  .workflow-properties-tab.is-active {
    color: #0a84ff;
  }
  .workflow-properties-tab.is-active::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: #0a84ff;
  }
  .workflow-properties-panel > .rounded-xl {
    border: 0 !important;
    border-radius: 10px !important;
    padding: 4px !important;
    box-shadow: none !important;
  }
  .workflow-properties-panel label {
    text-transform: none !important;
    letter-spacing: 0 !important;
    color: #64748b !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    line-height: 1.35 !important;
  }
  .workflow-properties-panel .space-y-3 > :not([hidden]) ~ :not([hidden]) {
    margin-top: .7rem;
  }
  .workflow-properties-panel .bg-slate-50 {
    background: #f8fafc !important;
  }
  .workflow-properties-panel .border-slate-200 {
    border-color: #e8edf3 !important;
  }
  .workflow-properties-panel textarea,
  .workflow-properties-panel input,
  .workflow-properties-panel select {
    font-size: 12px;
  }
  .workflow-properties-panel button {
    font-size: 11px;
  }
  .workflow-properties-panel .text-sm {
    font-size: 12px !important;
  }
  .workflow-properties-panel .text-xs {
    font-size: 10px !important;
    line-height: 1.35 !important;
  }

  .workflow-visual-shell.palette-collapsed {
    grid-template-columns: minmax(390px, 1fr) 336px;
  }
  .workflow-visual-shell.properties-collapsed {
    grid-template-columns: 238px minmax(390px, 1fr);
  }
  .workflow-visual-shell.palette-collapsed.properties-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .workflow-review-compact {
    display: none;
  }

  @media (max-width: 1350px) {
    .workflow-visual-shell {
      grid-template-columns: 210px minmax(360px, 1fr) 310px;
    }
    .workflow-visual-shell.palette-collapsed { grid-template-columns: minmax(360px, 1fr) 310px; }
    .workflow-visual-shell.properties-collapsed { grid-template-columns: 210px minmax(360px, 1fr); }
    .workflow-builder-header {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .workflow-builder-actions { min-width: 0; }
    .workflow-branch-map { width: min(760px, calc(100vw - 580px)); }
  }
  @media (max-width: 1050px) {
    .workflow-builder-header {
      grid-template-columns: 1fr;
    }
    .workflow-builder-heading,
    .workflow-builder-actions {
      grid-column: 1 / -1;
    }
    .workflow-builder-actions {
      justify-content: flex-start;
    }
    .workflow-visual-shell {
      grid-template-columns: 200px minmax(0, 1fr);
    }
    .workflow-properties-panel {
      grid-column: 1 / -1;
      max-height: min(430px, 46vh);
    }
    .workflow-branch-map {
      width: min(720px, calc(100vw - 270px));
      max-width: calc(100vw - 36px);
    }
  }
  @media (max-width: 760px) {
    .workflow-builder-header,
    .workflow-visual-shell {
      grid-template-columns: 1fr;
    }
    .workflow-builder-heading { min-width: 0; }
    .workflow-builder-title-copy small { max-width: calc(100vw - 126px); }
    .workflow-builder-actions {
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 3px;
      scrollbar-width: thin;
    }
    .workflow-builder-actions > button { flex: 0 0 auto; }
    .workflow-save-button { flex: 0 0 auto; }
    .workflow-node-palette,
    .workflow-properties-panel {
      max-height: 340px;
    }
    .workflow-canvas-surface {
      min-height: 560px;
      padding-inline: 10px;
    }
    .workflow-canvas-toolbar {
      left: 0;
      width: 100%;
      flex-wrap: nowrap;
      justify-content: flex-start;
      overflow-x: auto;
      margin-inline: 0;
    }
    .workflow-branch-map {
      width: calc(100vw - 42px);
      max-width: calc(100vw - 42px);
      gap: 8px;
    }
  }

  .workflow-builder-page .workflow-sfdc-drawer {
    border: 1px solid #d8dde6;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 2px 8px rgba(15,23,42,.08);
  }
  .workflow-builder-page .workflow-sfdc-drawer h3,
  .workflow-builder-page .workflow-sfdc-drawer strong {
    letter-spacing: 0;
  }
  .workflow-builder-page button:focus-visible,
  .workflow-builder-page [role="button"]:focus-visible,
  .workflow-builder-page summary:focus-visible,
  .workflow-builder-page input:focus-visible,
  .workflow-builder-page select:focus-visible,
  .workflow-builder-page textarea:focus-visible {
    outline: 2px solid #0a84ff;
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .workflow-builder-page *,
    .workflow-builder-page *::before,
    .workflow-builder-page *::after {
      scroll-behavior: auto !important;
      transition-duration: .001ms !important;
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
    }
  }
  /* Compact builder pass: keep the full flow visible and prioritize the canvas. */
  .workflow-builder-page { min-height: 0; }
  .workflow-builder-header {
    display: flex;
    grid-template-columns: none;
    min-height: 54px;
    padding: 6px 9px;
    gap: 10px;
    border-radius: 9px;
  }
  .workflow-builder-heading { min-width: 0; flex: 1 1 auto; gap: 7px; }
  .workflow-builder-back { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 7px; }
  .workflow-builder-title-copy {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }
  .workflow-builder-heading h2 { flex: 0 0 auto; font-size: 15px; }
  .workflow-builder-title-copy small {
    min-width: 0;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    color: #334155;
    font-size: 10px;
    text-overflow: ellipsis;
  }
  .workflow-builder-status { flex: 0 0 auto; padding: 3px 8px; background: #ecfdf3; color: #237a43; }
  .workflow-builder-actions { flex: 0 0 auto; flex-wrap: nowrap; gap: 5px; }
  .workflow-builder-actions .workflow-cancel-button,
  .workflow-builder-actions .workflow-save-button {
    min-height: 30px;
    height: 30px;
    border-radius: 7px;
    padding: 0 10px;
    font-size: 10px;
    box-shadow: none;
  }
  .workflow-builder-actions .workflow-icon-button { width: 30px; padding: 0; }
  .workflow-header-separator { width: 1px; height: 22px; margin: 0 2px; background: #e2e8f0; }
  .workflow-header-more, .workflow-canvas-more { position: relative; }
  .workflow-header-more > summary,
  .workflow-canvas-more > summary {
    width: 30px; height: 30px; display: grid; place-items: center;
    border: 1px solid #e2e8f0; border-radius: 7px; background: #fff;
    color: #475569; cursor: pointer; list-style: none; font-size: 17px;
  }
  .workflow-header-more > summary::-webkit-details-marker,
  .workflow-canvas-more > summary::-webkit-details-marker { display: none; }
  .workflow-header-more-menu,
  .workflow-canvas-more-menu {
    position: absolute; right: 0; top: 34px; z-index: 50; width: 170px;
    overflow: hidden; border: 1px solid #d8dde6; border-radius: 8px;
    background: #fff; box-shadow: 0 10px 30px rgba(15,23,42,.16);
  }
  .workflow-header-more-menu button,
  .workflow-canvas-more-menu button {
    width: 100%; min-height: 32px; border: 0; border-bottom: 1px solid #eef2f7;
    background: #fff; padding: 0 10px; color: #334155; font-size: 10px; text-align: left; cursor: pointer;
  }
  .workflow-header-more-menu button:last-child,
  .workflow-canvas-more-menu button:last-child { border-bottom: 0; }
  .workflow-header-more-menu button:hover,
  .workflow-canvas-more-menu button:hover { background: #f8fafc; }

  .workflow-visual-shell {
    grid-template-columns: 232px minmax(420px, 1fr) 300px;
    gap: 8px;
    min-height: 0;
  }
  .workflow-node-palette, .workflow-properties-panel, .workflow-canvas-surface { border-radius: 9px; }
  .workflow-node-palette { padding: 8px 8px 7px; }
  .workflow-palette-head { margin-bottom: 7px; }
  .workflow-palette-search { margin-bottom: 7px; }
  .workflow-palette-search input { min-height: 32px; font-size: 10px; }
  .workflow-palette-help { margin-bottom: 6px; }
  .workflow-palette-group-title { margin: 8px 4px 4px; font-size: 8px; }
  .workflow-palette-item {
    min-height: 31px; margin-bottom: 3px; padding: 4px 6px; gap: 6px; border-radius: 6px;
  }
  .workflow-palette-icon { width: 22px; height: 22px; }
  .workflow-palette-item-copy strong { font-size: 10px; }
  .workflow-palette-item-copy small { font-size: 8px; }

  .workflow-canvas-surface {
    min-height: 0;
    max-height: none;
    height: 100%;
    padding: 8px 10px 72px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable both-edges;
  }
  .workflow-canvas-toolbar {
    position: sticky; top: 0; z-index: 15;
    min-height: 34px; margin: 0 0 5px; padding: 0;
    align-items: center; justify-content: space-between;
    background: linear-gradient(180deg, rgba(251,253,255,.98) 75%, rgba(251,253,255,0));
    pointer-events: auto;
  }
  .workflow-canvas-toolbar-right { display: flex; align-items: center; gap: 5px; }
  .workflow-canvas-toolbar button { height: 28px; padding: 0 8px; border-radius: 6px; font-size: 9px; box-shadow: none; }
  .workflow-layout-toggle { padding: 2px; border-radius: 6px; }
  .workflow-layout-toggle button { height: 26px; }
  .workflow-canvas-checks { background: #fff !important; }
  .workflow-canvas-zoom {
    position: sticky;
    top: calc(100% - 38px);
    z-index: 14;
    width: max-content;
    margin: 0 4px -34px auto;
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid #d8dde6;
    border-radius: 8px;
    background: rgba(255,255,255,.96);
    box-shadow: 0 5px 18px rgba(15,23,42,.10);
  }
  .workflow-canvas-zoom button {
    height: 28px; min-width: 30px; border: 0; border-radius: 5px;
    background: transparent; color: #475569; font-size: 10px; cursor: pointer;
  }
  .workflow-canvas-zoom button:hover { background: #f1f5f9; }

  /* ------------------------------------------------------------------
     AUTO-LAYOUT CANVAS — compact Flow Builder geometry.
     This block intentionally overrides older experimental connector CSS.
     ------------------------------------------------------------------ */
  .workflow-canvas-lane {
    width: min(100%, 720px) !important;
    margin: 10px auto 0 !important;
    padding: 0 24px 42px !important;
    gap: 0 !important;
  }

  .workflow-stage,
  .workflow-node-wrap {
    position: relative !important;
    width: 248px !important;
    max-width: 248px !important;
    overflow: visible !important;
  }

  .workflow-start-node {
    width: 248px !important;
    min-width: 248px !important;
    max-width: 248px !important;
    min-height: 48px !important;
    grid-template-columns: 28px minmax(0,1fr) !important;
    gap: 8px !important;
    padding: 7px 10px !important;
    border: 1px solid #63cf8b !important;
    border-radius: 6px !important;
    background: #f4fbf6 !important;
    box-shadow: none !important;
  }
  .workflow-start-icon {
    width: 28px !important;
    height: 28px !important;
    border-radius: 4px !important;
    background: #22b663 !important;
    box-shadow: none !important;
    font-size: 11px !important;
  }
  .workflow-start-title {
    color: #1f2937 !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    line-height: 1.15 !important;
  }
  .workflow-start-note {
    color: #4f8a65 !important;
    font-size: 7.5px !important;
    line-height: 1.2 !important;
  }

  .workflow-node-card::before { display: none !important; }
  .workflow-node-card {
    width: 248px !important;
    min-height: 48px !important;
    padding: 7px 30px 7px 43px !important;
    border: 1px solid #d8dde6 !important;
    border-radius: 6px !important;
    background: #fff !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.06) !important;
    transform: none !important;
  }
  .workflow-node-card:hover {
    border-color: #9db5cf !important;
    box-shadow: 0 2px 5px rgba(15,23,42,.08) !important;
    transform: none !important;
  }
  .workflow-node-card.is-selected {
    border-color: #1b96ff !important;
    box-shadow: 0 0 0 1px #1b96ff !important;
  }
  .workflow-node-icon {
    position: absolute !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    left: 7px !important;
    width: 28px !important;
    height: 28px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }
  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon {
    width: 25px !important;
    height: 25px !important;
    left: 9px !important;
    border-radius: 2px !important;
    transform: translateY(-50%) rotate(45deg) !important;
    background: #f59e0b !important;
  }
  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon {
    color: transparent !important;
  }
  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon::after {
    content: "≠";
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    transform: rotate(-45deg);
  }
  .workflow-node-kind {
    margin: 0 0 1px !important;
    color: #6b7280 !important;
    font-size: 6.5px !important;
    font-weight: 700 !important;
    letter-spacing: .06em !important;
    line-height: 1.1 !important;
  }
  .workflow-node-title {
    color: #202938 !important;
    font-size: 9.5px !important;
    font-weight: 700 !important;
    line-height: 1.15 !important;
  }
  .workflow-node-note {
    margin-top: 2px !important;
    color: #6b7280 !important;
    font-size: 7px !important;
    line-height: 1.15 !important;
  }
  .workflow-node-menu {
    top: 3px !important;
    right: 3px !important;
  }
  .workflow-node-menu > summary {
    width: 21px !important;
    height: 21px !important;
    border-radius: 3px !important;
    font-size: 14px !important;
  }
  .workflow-decision-toggle {
    left: -22px !important;
    top: 14px !important;
    width: 18px !important;
    height: 18px !important;
    border-color: #c7cdd6 !important;
    color: #596273 !important;
    font-size: 8px !important;
  }

  .workflow-node-connector {
    width: 1px !important;
    height: 32px !important;
    background: #aeb7c3 !important;
  }
  .workflow-node-connector::before {
    display: none !important;
  }
  .workflow-node-connector::after {
    display: none !important;
  }
  .workflow-insert-button {
    width: 19px !important;
    height: 19px !important;
    border: 1px solid #aeb7c3 !important;
    border-radius: 999px !important;
    background: #fff !important;
    color: #5f6b7a !important;
    box-shadow: none !important;
    font-size: 13px !important;
    line-height: 16px !important;
  }
  .workflow-insert-button:hover {
    border-color: #1b96ff !important;
    color: #0176d3 !important;
    background: #fff !important;
    box-shadow: 0 0 0 2px rgba(27,150,255,.08) !important;
  }

  .workflow-decision-stage {
    position: relative;
    width: 520px;
    max-width: calc(100vw - 690px);
    margin: 0 50%;
    transform: translateX(-50%);
    display: grid;
    grid-template-rows: 16px 1px auto 1px 16px;
    align-items: stretch;
    overflow: visible;
  }
  .workflow-decision-stage--nested {
    width: 430px;
    max-width: 100%;
    margin: 4px auto 0;
    transform: none;
  }
  .workflow-decision-stem {
    justify-self: center;
    width: 1px;
    height: 16px;
    background: #aeb7c3;
  }
  .workflow-decision-stem--in { grid-row: 1; }
  .workflow-decision-stem--out { grid-row: 5; }
  .workflow-decision-rail {
    height: 1px;
    margin-left: var(--workflow-branch-edge, 25%);
    margin-right: var(--workflow-branch-edge, 25%);
    background: #aeb7c3;
  }
  .workflow-decision-rail--top { grid-row: 2; }
  .workflow-decision-rail--bottom { grid-row: 4; }

  .workflow-decision-map {
    grid-row: 3;
    position: relative !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    transform: none !important;
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr)) !important;
    gap: 34px !important;
    padding: 0 !important;
    overflow: visible !important;
    align-items: stretch !important;
  }
  .workflow-decision-map::before,
  .workflow-decision-map::after {
    display: none !important;
  }
  .workflow-decision-map > .workflow-branch-path {
    position: relative !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    min-width: 0 !important;
    width: 100% !important;
    flex: none !important;
    padding: 12px 0 12px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    align-self: stretch !important;
    overflow: visible !important;
    text-align: center !important;
  }
  .workflow-decision-map > .workflow-branch-path::before,
  .workflow-decision-map > .workflow-branch-path::after {
    display: none !important;
  }
  .workflow-decision-map .workflow-branch-line,
  .workflow-decision-map .workflow-branch-merge-line {
    position: absolute !important;
    left: 50% !important;
    width: 1px !important;
    transform: translateX(-50%) !important;
    background: #aeb7c3 !important;
    display: block !important;
    pointer-events: none !important;
  }
  .workflow-decision-map .workflow-branch-line {
    top: 0 !important;
    height: 24px !important;
  }
  .workflow-decision-map .workflow-branch-merge-line {
    bottom: 0 !important;
    height: 20px !important;
  }
  .workflow-decision-map .workflow-branch-label,
  .workflow-decision-map .workflow-branch-label-input {
    position: relative !important;
    z-index: 3 !important;
    width: auto !important;
    max-width: 150px !important;
    min-height: 20px !important;
    margin: 0 0 7px !important;
    border: 1px solid #d6dbe3 !important;
    border-radius: 999px !important;
    background: #fff !important;
    padding: 2px 9px !important;
    color: #4b5563 !important;
    font-size: 7.5px !important;
    font-weight: 700 !important;
    line-height: 14px !important;
    text-align: center !important;
    box-shadow: 0 1px 1px rgba(15,23,42,.03) !important;
  }
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label,
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label-input {
    border-color: #b9dec7 !important;
    background: #f2fbf5 !important;
    color: #287746 !important;
  }
  .workflow-decision-map .workflow-branch-stack {
    position: relative !important;
    z-index: 2 !important;
    width: 100% !important;
    min-height: 58px !important;
    flex: 1 1 auto !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 7px !important;
  }
  .workflow-decision-map .workflow-branch-path.is-empty .workflow-branch-stack {
    min-height: 38px !important;
  }
  .workflow-decision-map .workflow-branch-add {
    position: relative !important;
    z-index: 3 !important;
    width: 19px !important;
    height: 19px !important;
    border: 1px solid #aeb7c3 !important;
    background: #fff !important;
    color: #5f6b7a !important;
    font-size: 13px !important;
    line-height: 16px !important;
  }

  .workflow-decision-map .workflow-owned-step {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 7px !important;
  }
  .workflow-decision-map .workflow-branch-node-row {
    width: 100% !important;
    display: flex !important;
    justify-content: center !important;
  }
  .workflow-decision-map .workflow-branch-node-card {
    position: relative !important;
    width: 196px !important;
    min-height: 42px !important;
    grid-template-columns: 26px minmax(0,1fr) !important;
    gap: 7px !important;
    padding: 6px 24px 6px 7px !important;
    border: 1px solid #d8dde6 !important;
    border-radius: 6px !important;
    background: #fff !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.05) !important;
  }
  .workflow-decision-map .workflow-branch-node-card.is-selected {
    border-color: #1b96ff !important;
    box-shadow: 0 0 0 1px #1b96ff !important;
  }
  .workflow-decision-map .workflow-branch-node-icon {
    width: 25px !important;
    height: 25px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 10px !important;
  }
  .workflow-decision-map .workflow-branch-node-card small {
    color: #6b7280 !important;
    font-size: 6px !important;
    font-weight: 700 !important;
    letter-spacing: .04em !important;
  }
  .workflow-decision-map .workflow-branch-node-card strong {
    margin-top: 1px !important;
    color: #202938 !important;
    font-size: 8.5px !important;
    font-weight: 700 !important;
  }
  .workflow-decision-map .workflow-node-menu.branch-menu {
    right: calc(50% - 95px) !important;
    top: 3px !important;
  }

  .workflow-decision-stage + .workflow-node-connector {
    margin-top: 0 !important;
  }

  .workflow-end-node {
    min-height: 28px !important;
    margin-top: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    padding: 0 !important;
    color: #313846 !important;
    font-size: 8px !important;
    box-shadow: none !important;
  }
  .workflow-end-node span {
    width: 20px;
    height: 20px;
    display: inline-grid;
    place-items: center;
    border: 1px solid #c7cdd6;
    border-radius: 999px;
    background: #fff;
    color: #596273 !important;
    font-size: 6px !important;
  }

  .workflow-canvas-surface {
    cursor: default;
    background-color: #fbfdff !important;
    background-image: radial-gradient(circle, #dbe3ec 1px, transparent 1px) !important;
    background-size: 18px 18px !important;
  }
  .workflow-canvas-lane { user-select: none; }
  .workflow-node-card,
  .workflow-start-node,
  .workflow-branch-node-card { user-select: none; }
  .workflow-node-card:focus-visible,
  .workflow-start-node:focus-visible,
  .workflow-branch-node-card:focus-visible {
    outline: 2px solid rgba(27,150,255,.35) !important;
    outline-offset: 2px !important;
  }

  @media (max-width: 1280px) {
    .workflow-decision-stage {
      width: 470px;
      max-width: calc(100vw - 610px);
    }
    .workflow-decision-map {
      gap: 24px !important;
    }
  }
  @media (max-width: 1050px) {
    .workflow-decision-stage {
      width: min(500px, calc(100vw - 250px));
      max-width: 500px;
    }
  }
  @media (max-width: 760px) {
    .workflow-stage,
    .workflow-node-wrap,
    .workflow-start-node,
    .workflow-node-card {
      width: min(248px, 78vw) !important;
      min-width: min(248px, 78vw) !important;
      max-width: min(248px, 78vw) !important;
    }
    .workflow-decision-stage {
      width: min(92vw, 440px);
      max-width: 92vw;
    }
    .workflow-decision-map {
      gap: 14px !important;
    }
    .workflow-decision-map .workflow-branch-node-card {
      width: min(180px, 38vw) !important;
    }
  }

  /* Canvas component skin — presentation only. Keep workflow wiring untouched. */
  .workflow-canvas-surface {
    --wf-node-width: 244px;
    --wf-node-height: 54px;
    --wf-node-radius: 8px;
    --wf-node-border: #d8dee8;
    --wf-node-text: #1f2937;
    --wf-node-muted: #6b7280;
    --wf-edge: #a8b4c3;
    --wf-edge-active: #4d8fca;
    --wf-icon-blue: #4f86c6;
    --wf-icon-green: #39a96b;
    --wf-icon-orange: #df8a2c;
    --wf-icon-purple: #8065c7;
    --wf-icon-red: #cf5a63;
  }

  .workflow-canvas-component-card {
    box-sizing: border-box !important;
    border: 1px solid var(--wf-node-border) !important;
    border-radius: var(--wf-node-radius) !important;
    background: #fff !important;
    color: var(--wf-node-text) !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.07), 0 2px 6px rgba(15,23,42,.03) !important;
    transition: border-color .12s ease, box-shadow .12s ease !important;
  }
  .workflow-canvas-component-card:hover {
    border-color: #aebdce !important;
    box-shadow: 0 2px 6px rgba(15,23,42,.08) !important;
    transform: none !important;
  }
  .workflow-canvas-component-card.is-selected {
    border-color: #3b82c4 !important;
    box-shadow: 0 0 0 1px #3b82c4, 0 2px 6px rgba(15,23,42,.07) !important;
  }

  .workflow-node-card.workflow-canvas-component-card {
    width: var(--wf-node-width) !important;
    min-width: var(--wf-node-width) !important;
    max-width: var(--wf-node-width) !important;
    min-height: var(--wf-node-height) !important;
    padding: 8px 32px 8px 48px !important;
  }
  .workflow-node-icon {
    left: 9px !important;
    width: 28px !important;
    height: 28px !important;
    border-radius: 5px !important;
    box-shadow: none !important;
    font-size: 12px !important;
  }
  .workflow-node-kind {
    margin: 0 0 2px !important;
    color: var(--wf-node-muted) !important;
    font-size: 7px !important;
    font-weight: 700 !important;
    letter-spacing: .055em !important;
    line-height: 1 !important;
  }
  .workflow-node-title {
    color: var(--wf-node-text) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    line-height: 1.18 !important;
  }
  .workflow-node-note {
    margin-top: 3px !important;
    color: #7a8492 !important;
    font-size: 7.25px !important;
    line-height: 1.15 !important;
  }

  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon {
    left: 11px !important;
    width: 23px !important;
    height: 23px !important;
    border-radius: 3px !important;
    background: var(--wf-icon-orange) !important;
    transform: translateY(-50%) rotate(45deg) !important;
  }
  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon::after {
    content: "↔" !important;
    display: block;
    color: #fff;
    font-size: 9px;
    font-weight: 800;
    transform: rotate(-45deg);
  }
  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon {
    color: transparent !important;
  }

  .workflow-node-card[data-node-type="LOOP"] .workflow-node-icon,
  .workflow-branch-node-card[data-node-type="LOOP"] .workflow-branch-node-icon {
    background: var(--wf-icon-purple) !important;
  }
  .workflow-node-card[data-node-type="CREATE_RECORD"] .workflow-node-icon,
  .workflow-node-card[data-node-type="UPDATE_RECORD"] .workflow-node-icon,
  .workflow-node-card[data-node-type="GET_RECORD"] .workflow-node-icon,
  .workflow-branch-node-card[data-node-type="CREATE_RECORD"] .workflow-branch-node-icon,
  .workflow-branch-node-card[data-node-type="UPDATE_RECORD"] .workflow-branch-node-icon,
  .workflow-branch-node-card[data-node-type="GET_RECORD"] .workflow-branch-node-icon {
    background: var(--wf-icon-green) !important;
  }
  .workflow-node-card[data-node-type="DELETE_RECORD"] .workflow-node-icon,
  .workflow-branch-node-card[data-node-type="DELETE_RECORD"] .workflow-branch-node-icon {
    background: var(--wf-icon-red) !important;
  }

  .workflow-start-node {
    width: var(--wf-node-width) !important;
    min-width: var(--wf-node-width) !important;
    max-width: var(--wf-node-width) !important;
    min-height: var(--wf-node-height) !important;
    grid-template-columns: 30px minmax(0,1fr) !important;
    column-gap: 9px !important;
    padding: 8px 10px !important;
    border: 1px solid #a9d9bd !important;
    border-radius: var(--wf-node-radius) !important;
    background: #fff !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.06) !important;
  }
  .workflow-start-icon {
    width: 28px !important;
    height: 28px !important;
    border-radius: 5px !important;
    background: var(--wf-icon-green) !important;
    box-shadow: none !important;
    font-size: 10px !important;
  }
  .workflow-start-title {
    color: var(--wf-node-text) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
  }
  .workflow-start-note {
    margin-top: 2px !important;
    color: #6c8b78 !important;
    font-size: 7.25px !important;
  }

  .workflow-node-connector {
    width: 1px !important;
    height: 30px !important;
    background: var(--wf-edge) !important;
  }
  .workflow-node-connector::before,
  .workflow-node-connector::after {
    display: none !important;
  }
  .workflow-insert-button,
  .workflow-branch-add {
    width: 18px !important;
    height: 18px !important;
    border: 1px solid #b7c1ce !important;
    border-radius: 999px !important;
    background: #fff !important;
    color: #596779 !important;
    box-shadow: 0 1px 2px rgba(15,23,42,.04) !important;
    font-size: 12px !important;
    line-height: 15px !important;
  }
  .workflow-insert-button:hover,
  .workflow-branch-add:hover {
    border-color: var(--wf-edge-active) !important;
    color: var(--wf-edge-active) !important;
    background: #fff !important;
  }

  .workflow-decision-stage {
    width: 480px !important;
    max-width: calc(100vw - 700px) !important;
    grid-template-rows: 15px 1px auto 1px 15px !important;
  }
  .workflow-decision-stem,
  .workflow-decision-rail,
  .workflow-decision-map .workflow-branch-line,
  .workflow-decision-map .workflow-branch-merge-line {
    background: var(--wf-edge) !important;
  }
  .workflow-decision-map {
    gap: 30px !important;
  }
  .workflow-decision-map > .workflow-branch-path {
    padding: 11px 0 !important;
  }
  .workflow-decision-map .workflow-branch-label-input,
  .workflow-decision-map .workflow-branch-label {
    min-height: 19px !important;
    margin-bottom: 8px !important;
    border: 1px solid #d8dee8 !important;
    border-radius: 999px !important;
    background: #fff !important;
    padding: 2px 8px !important;
    color: #4b5563 !important;
    font-size: 7.25px !important;
    font-weight: 700 !important;
    box-shadow: none !important;
  }
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label-input,
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label {
    border-color: #b9ddc8 !important;
    background: #f5fbf7 !important;
    color: #2f7b4a !important;
  }

  .workflow-branch-node-card.workflow-canvas-component-card {
    width: 190px !important;
    min-width: 190px !important;
    max-width: 190px !important;
    min-height: 46px !important;
    grid-template-columns: 27px minmax(0,1fr) !important;
    gap: 8px !important;
    padding: 7px 24px 7px 7px !important;
  }
  .workflow-branch-node-icon {
    width: 27px !important;
    height: 27px !important;
    border-radius: 5px !important;
    box-shadow: none !important;
    font-size: 10px !important;
  }
  .workflow-branch-node-card small {
    color: var(--wf-node-muted) !important;
    font-size: 6.5px !important;
    font-weight: 700 !important;
    letter-spacing: .05em !important;
  }
  .workflow-branch-node-card strong {
    margin-top: 2px !important;
    color: var(--wf-node-text) !important;
    font-size: 9px !important;
    font-weight: 700 !important;
    line-height: 1.15 !important;
  }

  .workflow-end-node {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    margin-top: 0 !important;
    border: 0 !important;
    background: transparent !important;
    padding: 3px 7px !important;
    color: #596273 !important;
    font-size: 8px !important;
    box-shadow: none !important;
  }
  .workflow-end-node span {
    width: 16px !important;
    height: 16px !important;
    display: inline-grid !important;
    place-items: center !important;
    border: 1px solid #b9c3cf !important;
    border-radius: 999px !important;
    background: #fff !important;
    color: #6b7280 !important;
    font-size: 5px !important;
  }

  /* ---------------------------------------------------------------
     FIRST-CUT CANVAS GEOMETRY
     Deliberately plain: boxes + straight split/merge connectors only.
     No changes to palette, properties, workflow data, save or runtime.
     --------------------------------------------------------------- */
  .workflow-canvas-lane {
    width: min(100%, 920px) !important;
    margin: 24px auto 0 !important;
    padding: 0 36px 64px !important;
  }

  .workflow-stage,
  .workflow-node-wrap {
    width: 360px !important;
    max-width: 360px !important;
    overflow: visible !important;
  }

  .workflow-start-node,
  .workflow-node-card {
    width: 360px !important;
    min-width: 360px !important;
    max-width: 360px !important;
    min-height: 72px !important;
    box-sizing: border-box !important;
    border: 1px solid #b8c1cc !important;
    border-radius: 6px !important;
    background: #fff !important;
    box-shadow: none !important;
  }

  .workflow-start-node {
    grid-template-columns: 38px minmax(0,1fr) !important;
    gap: 12px !important;
    padding: 12px 14px !important;
  }

  .workflow-start-icon {
    width: 34px !important;
    height: 34px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
  }

  .workflow-start-title,
  .workflow-node-title {
    font-size: 14px !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
  }

  .workflow-start-note,
  .workflow-node-note {
    font-size: 10px !important;
    line-height: 1.25 !important;
  }

  .workflow-node-card {
    padding: 12px 38px 12px 58px !important;
  }

  .workflow-node-icon {
    left: 12px !important;
    width: 34px !important;
    height: 34px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 14px !important;
  }

  .workflow-node-card[data-node-type="CONDITION"] .workflow-node-icon {
    left: 15px !important;
    width: 28px !important;
    height: 28px !important;
  }

  .workflow-node-kind {
    margin-bottom: 3px !important;
    font-size: 9px !important;
    line-height: 1 !important;
  }

  .workflow-node-connector {
    width: 2px !important;
    height: 54px !important;
    background: #929eac !important;
  }

  .workflow-insert-button,
  .workflow-branch-add {
    width: 22px !important;
    height: 22px !important;
    border: 1px solid #929eac !important;
    background: #fff !important;
    color: #475569 !important;
    box-shadow: none !important;
    font-size: 14px !important;
  }

  .workflow-decision-stage {
    width: 680px !important;
    max-width: 680px !important;
    margin: 0 50% !important;
    transform: translateX(-50%) !important;
    grid-template-rows: 28px 2px auto 2px 28px !important;
  }

  .workflow-decision-stage--nested {
    width: 620px !important;
    max-width: 620px !important;
    margin: 8px 50% 0 !important;
    transform: translateX(-50%) !important;
  }

  .workflow-decision-stem {
    width: 2px !important;
    height: 28px !important;
    background: #929eac !important;
  }

  .workflow-decision-rail {
    height: 2px !important;
    background: #929eac !important;
  }

  .workflow-decision-map {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 80px !important;
    width: 100% !important;
    overflow: visible !important;
  }

  .workflow-decision-map > .workflow-branch-path {
    min-width: 0 !important;
    padding: 20px 0 !important;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .workflow-decision-map .workflow-branch-line,
  .workflow-decision-map .workflow-branch-merge-line {
    width: 2px !important;
    background: #929eac !important;
  }

  .workflow-decision-map .workflow-branch-line {
    height: 34px !important;
  }

  .workflow-decision-map .workflow-branch-merge-line {
    height: 30px !important;
  }

  .workflow-decision-map .workflow-branch-label,
  .workflow-decision-map .workflow-branch-label-input {
    min-height: 0 !important;
    margin: 0 0 12px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    padding: 0 !important;
    color: #334155 !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    line-height: 18px !important;
    box-shadow: none !important;
  }

  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label,
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label-input {
    border: 0 !important;
    background: transparent !important;
    color: #334155 !important;
  }

  .workflow-decision-map .workflow-branch-stack {
    min-height: 92px !important;
    gap: 14px !important;
  }

  .workflow-decision-map .workflow-branch-path.is-empty .workflow-branch-stack {
    min-height: 92px !important;
  }

  .workflow-decision-map .workflow-branch-node-card {
    width: 260px !important;
    min-width: 260px !important;
    max-width: 260px !important;
    min-height: 62px !important;
    grid-template-columns: 34px minmax(0,1fr) !important;
    gap: 10px !important;
    padding: 10px 30px 10px 10px !important;
    border: 1px solid #b8c1cc !important;
    border-radius: 6px !important;
    background: #fff !important;
    box-shadow: none !important;
  }

  .workflow-decision-map .workflow-branch-node-icon {
    width: 34px !important;
    height: 34px !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 13px !important;
  }

  .workflow-decision-map .workflow-branch-node-card small {
    font-size: 8px !important;
  }

  .workflow-decision-map .workflow-branch-node-card strong {
    margin-top: 3px !important;
    font-size: 12px !important;
    line-height: 1.2 !important;
  }

  .workflow-end-node {
    min-width: 140px !important;
    min-height: 48px !important;
    justify-content: center !important;
    gap: 10px !important;
    border: 1px solid #b8c1cc !important;
    border-radius: 6px !important;
    background: #fff !important;
    padding: 10px 16px !important;
    color: #1f2937 !important;
    font-size: 12px !important;
  }

  .workflow-end-node span {
    width: auto !important;
    height: auto !important;
    border: 0 !important;
    background: transparent !important;
    font-size: 8px !important;
  }

  @media (max-width: 1180px) {
    .workflow-decision-stage {
      width: 600px !important;
      max-width: 600px !important;
    }
    .workflow-decision-stage--nested {
      width: 540px !important;
      max-width: 540px !important;
    }
    .workflow-decision-map {
      gap: 56px !important;
    }
    .workflow-decision-map .workflow-branch-node-card {
      width: 230px !important;
      min-width: 230px !important;
      max-width: 230px !important;
    }
  }

  /* Continuous graph connectors: one SVG layer per Decision. */
  .workflow-decision-stage {
    position: relative !important;
    isolation: isolate;
  }
  .workflow-decision-connectors {
    position: absolute;
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .workflow-decision-connector-path {
    fill: none;
    stroke: #929eac;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
    stroke-linecap: square;
    stroke-linejoin: round;
  }
  .workflow-decision-stage > .workflow-decision-stem,
  .workflow-decision-stage > .workflow-decision-rail,
  .workflow-decision-map .workflow-branch-line,
  .workflow-decision-map .workflow-branch-merge-line {
    visibility: hidden !important;
  }
  .workflow-decision-map {
    position: relative !important;
    z-index: 1 !important;
  }
  .workflow-decision-map > .workflow-branch-path {
    position: relative !important;
    z-index: 1 !important;
  }
  .workflow-decision-map .workflow-branch-label,
  .workflow-decision-map .workflow-branch-label-input,
  .workflow-decision-map .workflow-branch-stack,
  .workflow-decision-map .workflow-owned-step,
  .workflow-decision-map .workflow-branch-node-card,
  .workflow-decision-map .workflow-branch-add {
    position: relative !important;
    z-index: 2 !important;
  }


  /* FlowPattern canvas pass — presentation only. Keep palette, properties and workflow semantics unchanged. */
  .workflow-builder-page {
    --wf-flow-canvas: #ffffff;
    --wf-flow-dot: rgba(148,163,184,.32);
    --wf-flow-edge: #7b8797;
    --wf-flow-card: #ffffff;
    --wf-flow-card-border: #dbe3ed;
  }
  .workflow-canvas-surface {
    background-color: var(--wf-flow-canvas) !important;
    background-image: radial-gradient(circle, var(--wf-flow-dot) 1px, transparent 1.2px) !important;
    background-size: 18px 18px !important;
  }
  .workflow-canvas-toolbar button,
  .workflow-layout-toggle,
  .workflow-canvas-zoom,
  .workflow-canvas-more > summary {
    backdrop-filter: blur(10px);
  }
  .workflow-canvas-lane {
    margin-top: 42px !important;
  }
  .workflow-start-node,
  .workflow-node-card,
  .workflow-decision-map .workflow-branch-node-card,
  .workflow-branch-node-card.workflow-canvas-component-card {
    border: 1px solid var(--wf-flow-card-border) !important;
    border-radius: 12px !important;
    background: var(--wf-flow-card) !important;
    box-shadow: 0 3px 12px rgba(15,23,42,.20) !important;
  }
  .workflow-start-node:hover,
  .workflow-node-card:hover,
  .workflow-decision-map .workflow-branch-node-card:hover {
    transform: translateY(-2px) !important;
    box-shadow: 0 8px 20px rgba(15,23,42,.24) !important;
  }
  .workflow-start-node,
  .workflow-node-card {
    width: 240px !important;
    min-width: 240px !important;
    max-width: 240px !important;
    min-height: 68px !important;
  }
  .workflow-stage,
  .workflow-node-wrap {
    width: 240px !important;
    max-width: 240px !important;
  }
  .workflow-node-card {
    padding: 11px 34px 11px 54px !important;
  }
  .workflow-node-icon,
  .workflow-start-icon {
    width: 36px !important;
    height: 36px !important;
    border-radius: 8px !important;
  }
  .workflow-node-title,
  .workflow-start-title {
    font-size: 13px !important;
    font-weight: 700 !important;
  }
  .workflow-node-kind {
    font-size: 8px !important;
  }
  .workflow-node-note,
  .workflow-start-note {
    font-size: 9px !important;
  }

  @keyframes workflow-flow-march {
    from { background-position: 0 0; }
    to { background-position: 0 18px; }
  }
  @keyframes workflow-flow-stroke {
    to { stroke-dashoffset: -26; }
  }

  .workflow-node-connector {
    position: relative !important;
    width: 2px !important;
    height: 62px !important;
    background: repeating-linear-gradient(
      to bottom,
      var(--wf-flow-edge) 0 7px,
      transparent 7px 13px
    ) !important;
    background-size: 2px 18px !important;
    animation: workflow-flow-march .7s linear infinite !important;
  }
  .workflow-node-connector::before,
  .workflow-node-connector::after {
    display: none !important;
  }
  .workflow-insert-button {
    left: 50% !important;
    top: 0 !important;
    width: 24px !important;
    height: 24px !important;
    transform: translate(-50%, -50%) !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 999px !important;
    background: #fff !important;
    color: #334155 !important;
    box-shadow: 0 2px 7px rgba(15,23,42,.18) !important;
    font-size: 16px !important;
    z-index: 8 !important;
  }
  .workflow-insert-button:hover {
    border-color: #94a3b8 !important;
    background: #f8fafc !important;
  }
  .workflow-connector-label {
    color: #475569 !important;
    background: rgba(255,255,255,.96) !important;
    border-color: #dbe3ed !important;
  }

  .workflow-decision-connectors {
    overflow: visible !important;
  }
  .workflow-decision-connector-path {
    fill: none !important;
    stroke: var(--wf-flow-edge) !important;
    stroke-width: 1.8 !important;
    stroke-dasharray: 7 6 !important;
    animation: workflow-flow-stroke .7s linear infinite !important;
  }
  .workflow-decision-stem,
  .workflow-decision-rail,
  .workflow-decision-map .workflow-branch-line,
  .workflow-decision-map .workflow-branch-merge-line {
    background: repeating-linear-gradient(
      to bottom,
      var(--wf-flow-edge) 0 7px,
      transparent 7px 13px
    ) !important;
    background-size: 2px 18px !important;
    animation: workflow-flow-march .7s linear infinite !important;
  }
  .workflow-decision-rail {
    background: repeating-linear-gradient(
      to right,
      var(--wf-flow-edge) 0 7px,
      transparent 7px 13px
    ) !important;
    background-size: 18px 2px !important;
  }
  .workflow-branch-label,
  .workflow-branch-label-input {
    color: #475569 !important;
  }
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label,
  .workflow-decision-map .workflow-branch-path:first-child .workflow-branch-label-input {
    color: #2f7b4a !important;
  }
  .workflow-end-node {
    border-color: rgba(255,255,255,.30) !important;
    background: rgba(255,255,255,.96) !important;
    box-shadow: 0 3px 12px rgba(15,23,42,.20) !important;
  }

  @media (max-width: 1180px) {
    .workflow-start-node,
    .workflow-node-card,
    .workflow-stage,
    .workflow-node-wrap {
      width: 220px !important;
      min-width: 220px !important;
      max-width: 220px !important;
    }
  }

  /* SFDC SURROUNDING BUILDER UI — do not alter the React Flow canvas/node/edge presentation. */
  .workflow-builder-page {
    --sfdc-blue: #0176d3;
    --sfdc-border: #c9c7c5;
    --sfdc-bg: #f3f3f3;
    --sfdc-text: #181818;
    color: var(--sfdc-text);
  }
  .workflow-builder-header {
    min-height: 52px;
    padding: 7px 10px;
    border: 1px solid #d8dde6;
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.08);
  }
  .workflow-builder-header button,
  .workflow-header-more > summary,
  .workflow-canvas-toolbar button,
  .workflow-cancel-button,
  .workflow-save-button {
    min-height: 30px;
    border-radius: 4px !important;
    font-size: 11px !important;
    font-weight: 600;
  }
  .workflow-save-button {
    border-color: var(--sfdc-blue) !important;
    background: var(--sfdc-blue) !important;
  }
  .workflow-node-palette,
  .workflow-properties-panel {
    border-color: var(--sfdc-border) !important;
    border-radius: 4px !important;
    background: #fff !important;
    box-shadow: none !important;
  }
  .workflow-node-palette { width: 248px; }
  .workflow-palette-head,
  .workflow-properties-tabs {
    min-height: 38px;
    padding: 7px 10px !important;
    border-bottom: 1px solid #e5e5e5;
    background: #fff;
  }
  .workflow-palette-head button {
    min-height: 26px;
    border-radius: 3px !important;
  }
  .workflow-palette-search {
    margin: 8px 9px 4px;
    border: 1px solid var(--sfdc-border);
    border-radius: 4px !important;
    background: #fff;
  }
  .workflow-palette-search input { min-height: 30px; font-size: 11px; }
  .workflow-palette-group-title {
    margin-top: 10px !important;
    color: #444;
    font-size: 9px !important;
    font-weight: 700;
    letter-spacing: .04em;
  }
  .workflow-palette-item {
    min-height: 34px !important;
    margin-bottom: 2px !important;
    border-radius: 4px !important;
    border-color: transparent !important;
    background: #fff !important;
  }
  .workflow-palette-item:hover { background: #f3f3f3 !important; border-color: #e5e5e5 !important; }
  .workflow-palette-icon {
    width: 24px !important;
    height: 24px !important;
    border-radius: 3px !important;
  }
  .workflow-palette-item-copy strong { font-size: 10.5px !important; }
  .workflow-palette-item-copy small { font-size: 8.5px !important; }

  .workflow-properties-panel {
    width: 338px;
    padding: 0 10px 10px !important;
    overflow-y: auto;
  }
  .workflow-properties-tab {
    padding: 8px 2px 7px !important;
    color: var(--sfdc-blue) !important;
    border-bottom: 2px solid var(--sfdc-blue);
    font-size: 11px !important;
    font-weight: 700;
  }
  .workflow-properties-panel .space-y-4 { gap: 10px !important; }
  .workflow-properties-panel label { color: #444 !important; font-size: 10.5px !important; }
  .workflow-properties-panel input,
  .workflow-properties-panel select,
  .workflow-properties-panel textarea {
    min-height: 32px !important;
    border-color: var(--sfdc-border) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 11px !important;
  }
  .workflow-properties-panel textarea { padding-top: 7px !important; }
  .workflow-properties-panel .rounded-xl,
  .workflow-properties-panel .rounded-lg {
    border-radius: 4px !important;
  }
  .workflow-properties-panel [class*="bg-slate-50"] { background: #f7f7f7 !important; }

  .workflow-canvas-toolbar {
    background: rgba(255,255,255,.96) !important;
    border: 1px solid #d8dde6;
    border-radius: 4px;
    padding: 3px !important;
  }
  .workflow-layout-toggle { border-radius: 3px !important; }
  .workflow-layout-toggle button[aria-pressed="true"],
  .workflow-layout-toggle .is-active { color: var(--sfdc-blue) !important; background: #eef4ff !important; }

  .workflow-sfdc-drawer {
    position: fixed;
    top: 96px;
    right: 16px;
    bottom: 82px;
    z-index: 2200;
    width: min(430px, calc(100vw - 32px));
    overflow-y: auto;
    padding: 0 14px 16px;
    border: 1px solid var(--sfdc-border);
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 8px 28px rgba(0,0,0,.18);
  }
  .workflow-sfdc-drawer > div:first-child {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0 -14px;
    padding: 11px 14px 10px;
    border-bottom: 1px solid #e5e5e5;
    background: #fff;
  }
  .workflow-sfdc-drawer .workflow-cancel-button,
  .workflow-sfdc-drawer .workflow-save-button { min-height: 30px; padding: 0 10px; }
  .workflow-sfdc-drawer .mt-4 { margin-top: 10px !important; }
  .workflow-sfdc-drawer .p-4 { padding: 12px !important; }
  .workflow-sfdc-drawer .p-3 { padding: 9px !important; }
  .workflow-sfdc-drawer input,
  .workflow-sfdc-drawer select,
  .workflow-sfdc-drawer textarea {
    min-height: 32px !important;
    border-color: var(--sfdc-border) !important;
    border-radius: 4px !important;
    box-shadow: none !important;
    font-size: 11px !important;
  }

  /* Requested Salesforce-style inspector behaviour: fixed column, white
     surface, sticky tabs and its own scrollbar independent of the canvas. */
  .workflow-visual-shell {
    min-height: 0;
    height: calc(100dvh - 176px);
    align-items: stretch;
  }
  .workflow-node-palette,
  .workflow-properties-panel {
    min-height: 0;
    height: 100%;
  }
  .workflow-properties-panel {
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background: #fff !important;
  }
  .workflow-properties-tabs {
    position: sticky;
    top: 0;
    z-index: 8;
    margin: 0 -10px 10px !important;
    background: #fff !important;
  }
  .workflow-properties-panel input,
  .workflow-properties-panel select,
  .workflow-properties-panel textarea,
  .workflow-properties-panel button {
    pointer-events: auto;
  }
  .workflow-properties-panel select {
    cursor: pointer;
  }
  .workflow-properties-panel input:focus,
  .workflow-properties-panel select:focus,
  .workflow-properties-panel textarea:focus {
    border-color: var(--sfdc-blue) !important;
    box-shadow: 0 0 0 1px var(--sfdc-blue) !important;
    outline: 0 !important;
  }
  .workflow-properties-panel .bg-slate-50 {
    background: #fff !important;
  }
  .workflow-properties-panel .border-slate-200 {
    border-color: #dddbda !important;
  }
  .workflow-node-palette {
    overflow: hidden !important;
    background: #fff !important;
  }
  .workflow-palette-scroll {
    max-height: none !important;
    height: calc(100% - 104px);
    overflow-y: auto !important;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  @media (max-width: 1050px) {
    .workflow-visual-shell { height: auto; min-height: 0; }
    .workflow-properties-panel { max-height: min(440px, 48dvh) !important; }
  }

  .workflow-record-picker { position: relative; min-width: 0; }
  .workflow-record-picker-input {
    min-height: 32px;
    display: grid;
    grid-template-columns: 18px minmax(0,1fr) auto;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid var(--sfdc-border);
    border-radius: 4px;
    background: #fff;
  }
  .workflow-record-picker-input > span { color: #706e6b; }
  .workflow-record-picker-input input {
    min-width: 0;
    min-height: 30px !important;
    padding: 0 !important;
    border: 0 !important;
    outline: 0;
  }
  .workflow-record-picker-input small { color: #706e6b; font-size: 9px; }
  .workflow-record-picker-input button {
    border: 0;
    background: transparent;
    color: var(--sfdc-blue);
    font-size: 9px;
    cursor: pointer;
  }
  .workflow-record-picker-menu {
    position: absolute;
    inset: calc(100% + 3px) 0 auto;
    z-index: 50;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--sfdc-border);
    border-radius: 4px;
    background: #fff;
    box-shadow: 0 5px 16px rgba(0,0,0,.16);
  }
  .workflow-record-picker-menu button {
    width: 100%;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 0;
    border-bottom: 1px solid #eee;
    background: #fff;
    text-align: left;
    cursor: pointer;
  }
  .workflow-record-picker-menu button:hover { background: #f3f3f3; }
  .workflow-record-picker-menu strong { color: #181818; font-size: 10.5px; }
  .workflow-record-picker-menu small { color: #706e6b; font-size: 8.5px; }
  .workflow-record-picker-empty { padding: 12px; color: #706e6b; font-size: 10px; }

  .workflow-debug-timeline {
    margin-top: 12px;
    overflow: hidden;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    background: #fff;
  }
  .workflow-debug-timeline-title {
    padding: 8px 10px;
    border-bottom: 1px solid #e5e5e5;
    color: #181818;
    font-size: 10.5px;
    font-weight: 700;
  }
  .workflow-debug-timeline-row {
    width: 100%;
    min-height: 44px;
    padding: 7px 9px;
    display: grid;
    grid-template-columns: 10px minmax(0,1fr) 22px;
    align-items: center;
    gap: 8px;
    border: 0;
    border-bottom: 1px solid #eee;
    background: #fff;
    text-align: left;
    cursor: pointer;
  }
  .workflow-debug-timeline-row:last-child { border-bottom: 0; }
  .workflow-debug-timeline-row:hover { background: #f7f7f7; }
  .workflow-debug-status-dot { width: 8px; height: 8px; border-radius: 999px; background: #747474; }
  .workflow-debug-timeline-row.is-completed .workflow-debug-status-dot { background: #2e844a; }
  .workflow-debug-timeline-row.is-failed .workflow-debug-status-dot { background: #ba0517; }
  .workflow-debug-timeline-row.is-fault_handled .workflow-debug-status-dot { background: #fe9339; }
  .workflow-debug-step-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .workflow-debug-step-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }
  .workflow-debug-step-copy small { color: #706e6b; font-size: 8.5px; }
  .workflow-debug-step-index { color: #706e6b; font-size: 9px; text-align: right; }

  @media (max-width: 760px) {
    .workflow-sfdc-drawer { top: 76px; right: 6px; bottom: 72px; width: calc(100vw - 12px); }
    .workflow-properties-panel { width: min(338px, 100vw); }
  }


  /* ======================================================================
     SALESFORCE FLOW BUILDER SURROUNDING UI PARITY
     Canvas visuals are intentionally excluded from this block.
     ====================================================================== */
  .workflow-builder-page {
    --sfdc-blue: #0176d3;
    --sfdc-blue-hover: #014486;
    --sfdc-border: #c9c7c5;
    --sfdc-border-soft: #e5e5e5;
    --sfdc-text: #181818;
    --sfdc-text-secondary: #444444;
    --sfdc-text-muted: #706e6b;
    --sfdc-panel-bg: #ffffff;
    --sfdc-panel-subtle: #f3f3f3;
    --sfdc-focus: #1b96ff;
    --sfdc-radius: 4px;
    color: var(--sfdc-text);
  }

  /* ---------- TOP BUTTON BAR ---------- */
  .workflow-builder-header {
    min-height: 48px !important;
    margin: 0 !important;
    padding: 7px 12px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--sfdc-border) !important;
    border-radius: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    gap: 12px !important;
  }
  .workflow-builder-heading {
    gap: 8px !important;
    margin-right: 12px !important;
  }
  .workflow-builder-back {
    width: 30px !important;
    height: 30px !important;
    min-height: 30px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
    box-shadow: none !important;
    font-size: 15px !important;
  }
  .workflow-builder-back:hover {
    background: #f3f3f3 !important;
    color: var(--sfdc-blue-hover) !important;
  }
  .workflow-ready-dot {
    width: 8px !important;
    height: 8px !important;
    box-shadow: none !important;
  }
  .workflow-builder-heading h2 {
    color: var(--sfdc-text) !important;
    font-size: 14px !important;
    line-height: 1.2 !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
  }
  .workflow-builder-title-copy {
    align-items: baseline !important;
    gap: 7px !important;
  }
  .workflow-builder-title-copy small {
    color: var(--sfdc-text-muted) !important;
    font-size: 10px !important;
    font-weight: 400 !important;
  }
  .workflow-builder-status {
    border: 0 !important;
    border-radius: 12px !important;
    background: #eef4ff !important;
    padding: 2px 7px !important;
    color: #032d60 !important;
    font-size: 9px !important;
    font-weight: 600 !important;
  }
  .workflow-builder-actions {
    gap: 6px !important;
    flex-wrap: nowrap !important;
  }
  .workflow-builder-actions .workflow-cancel-button,
  .workflow-builder-actions .workflow-save-button,
  .workflow-header-more > summary {
    height: 32px !important;
    min-height: 32px !important;
    border-radius: var(--sfdc-radius) !important;
    box-shadow: none !important;
    font-family: inherit !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }
  .workflow-builder-actions .workflow-cancel-button {
    border: 1px solid var(--sfdc-border) !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
    padding: 0 12px !important;
  }
  .workflow-builder-actions .workflow-cancel-button:hover:not(:disabled) {
    border-color: var(--sfdc-border) !important;
    background: #f3f3f3 !important;
    color: var(--sfdc-blue-hover) !important;
  }
  .workflow-builder-actions .workflow-save-button {
    border: 1px solid var(--sfdc-blue) !important;
    background: var(--sfdc-blue) !important;
    color: #fff !important;
    padding: 0 14px !important;
  }
  .workflow-builder-actions .workflow-save-button:hover:not(:disabled) {
    border-color: var(--sfdc-blue-hover) !important;
    background: var(--sfdc-blue-hover) !important;
  }
  .workflow-builder-actions .workflow-icon-button {
    width: 32px !important;
    padding: 0 !important;
    font-size: 15px !important;
  }
  .workflow-builder-actions button:disabled,
  .workflow-header-more button:disabled {
    border-color: #dddbda !important;
    background: #fff !important;
    color: #b0adab !important;
    opacity: 1 !important;
  }
  .workflow-header-separator {
    height: 24px !important;
    margin: 0 1px !important;
    background: #dddbda !important;
  }
  .workflow-header-more > summary {
    width: 32px !important;
    border: 1px solid var(--sfdc-border) !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
  }
  .workflow-header-more > summary:hover {
    background: #f3f3f3 !important;
  }
  .workflow-header-more-menu {
    top: 36px !important;
    width: 190px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    box-shadow: 0 2px 3px 0 rgba(0,0,0,.16) !important;
  }
  .workflow-header-more-menu button {
    min-height: 32px !important;
    padding: 0 12px !important;
    border-bottom: 0 !important;
    color: var(--sfdc-text) !important;
    font-size: 12px !important;
  }
  .workflow-header-more-menu button:hover {
    background: #f3f3f3 !important;
  }

  /* ---------- THREE-COLUMN SHELL: only pane chrome/width, never canvas content ---------- */
  .workflow-visual-shell {
    grid-template-columns: 260px minmax(420px, 1fr) 360px !important;
    gap: 0 !important;
    border: 0 !important;
  }
  .workflow-node-palette,
  .workflow-properties-panel {
    border-radius: 0 !important;
    background: var(--sfdc-panel-bg) !important;
    box-shadow: none !important;
  }
  .workflow-node-palette {
    padding: 0 !important;
    border: 0 !important;
    border-right: 1px solid var(--sfdc-border) !important;
  }
  .workflow-properties-panel {
    padding: 0 !important;
    border: 0 !important;
    border-left: 1px solid var(--sfdc-border) !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    scrollbar-gutter: stable !important;
  }
  .workflow-visual-shell.palette-collapsed {
    grid-template-columns: minmax(420px, 1fr) 360px !important;
  }
  .workflow-visual-shell.properties-collapsed {
    grid-template-columns: 260px minmax(420px, 1fr) !important;
  }
  .workflow-visual-shell.palette-collapsed.properties-collapsed {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  /* ---------- LEFT TOOLBOX ---------- */
  .workflow-palette-head {
    min-height: 43px !important;
    margin: 0 !important;
    padding: 0 12px !important;
    border-bottom: 1px solid var(--sfdc-border-soft) !important;
    background: #fff !important;
  }
  .workflow-palette-tabs {
    width: 100% !important;
    height: 43px !important;
    display: flex !important;
    align-items: stretch !important;
    gap: 22px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    padding: 0 !important;
  }
  .workflow-palette-tabs > button {
    position: relative !important;
    min-height: 43px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 1px !important;
    color: var(--sfdc-text-secondary) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }
  .workflow-palette-tabs > button.bg-white {
    color: var(--sfdc-blue) !important;
  }
  .workflow-palette-tabs > button.bg-white::after {
    content: "" !important;
    position: absolute !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    height: 3px !important;
    background: var(--sfdc-blue) !important;
  }
  .workflow-palette-search {
    margin: 12px 12px 8px !important;
  }
  .workflow-palette-search span {
    left: 10px !important;
    color: #706e6b !important;
    font-size: 13px !important;
  }
  .workflow-palette-search input {
    height: 32px !important;
    min-height: 32px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
    padding: 0 9px 0 30px !important;
    color: var(--sfdc-text) !important;
    font-size: 12px !important;
    box-shadow: none !important;
  }
  .workflow-palette-search input:focus {
    border-color: var(--sfdc-focus) !important;
    box-shadow: 0 0 3px #0176d3 !important;
    outline: 0 !important;
  }
  .workflow-palette-help {
    margin: 0 !important;
    padding: 0 12px 8px !important;
    color: var(--sfdc-text-muted) !important;
    font-size: 10px !important;
    line-height: 1.35 !important;
  }
  .workflow-palette-scroll {
    max-height: calc(100vh - 304px) !important;
    padding: 0 0 16px !important;
    scrollbar-width: thin !important;
  }
  .workflow-palette-group-title {
    margin: 0 !important;
    padding: 11px 12px 5px !important;
    color: var(--sfdc-text-muted) !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    letter-spacing: .03em !important;
    text-transform: uppercase !important;
  }
  .workflow-palette-item {
    min-height: 42px !important;
    margin: 0 !important;
    padding: 6px 12px !important;
    gap: 9px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #fff !important;
    box-shadow: none !important;
    transform: none !important;
    color: var(--sfdc-text) !important;
  }
  .workflow-palette-item:hover {
    border: 0 !important;
    background: #f3f3f3 !important;
    box-shadow: none !important;
    transform: none !important;
  }
  .workflow-palette-item::before {
    color: #706e6b !important;
    font-size: 9px !important;
  }
  .workflow-palette-icon {
    width: 28px !important;
    height: 28px !important;
    border-radius: var(--sfdc-radius) !important;
    box-shadow: none !important;
  }
  .workflow-palette-item-copy strong {
    color: var(--sfdc-text) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }
  .workflow-palette-item-copy small {
    color: var(--sfdc-text-muted) !important;
    font-size: 10px !important;
    font-weight: 400 !important;
    line-height: 1.2 !important;
  }
  .workflow-palette-empty {
    color: var(--sfdc-text-muted) !important;
    font-size: 12px !important;
  }
  .workflow-new-resource-button {
    width: calc(100% - 24px) !important;
    height: 32px !important;
    min-height: 32px !important;
    margin: 3px 12px 8px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    box-shadow: none !important;
  }
  .workflow-new-resource-button:hover {
    background: #f3f3f3 !important;
    color: var(--sfdc-blue-hover) !important;
  }
  .workflow-manager-filter {
    margin: 0 12px 7px !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    padding: 0 !important;
    gap: 12px !important;
  }
  .workflow-manager-filter button {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 4px 0 !important;
    color: var(--sfdc-text-muted) !important;
    font-size: 10px !important;
  }
  .workflow-manager-filter button.bg-white {
    color: var(--sfdc-blue) !important;
    text-decoration: underline !important;
    text-underline-offset: 4px !important;
  }
  .workflow-resource-choice {
    border-radius: 0 !important;
    padding: 8px 10px !important;
  }
  .workflow-resource-choice:hover {
    background: #f3f3f3 !important;
  }
  .workflow-manager-item {
    border-bottom: 1px solid #f3f3f3 !important;
  }
  .workflow-manager-detail {
    margin: 0 12px 8px 42px !important;
    border-left: 2px solid #dddbda !important;
    padding: 5px 8px !important;
  }

  /* ---------- RIGHT PROPERTIES PANE ---------- */
  .workflow-properties-tabs {
    position: sticky !important;
    top: 0 !important;
    z-index: 10 !important;
    min-height: 44px !important;
    margin: 0 !important;
    padding: 0 16px !important;
    border-bottom: 1px solid var(--sfdc-border) !important;
    background: #fff !important;
  }
  .workflow-properties-tab {
    padding: 14px 0 10px !important;
    color: var(--sfdc-text-secondary) !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }
  .workflow-properties-tab.is-active {
    color: var(--sfdc-blue) !important;
  }
  .workflow-properties-tab.is-active::after {
    height: 3px !important;
    border-radius: 0 !important;
    background: var(--sfdc-blue) !important;
  }
  .workflow-properties-panel > .rounded-xl,
  .workflow-properties-panel > .space-y-4,
  .workflow-properties-panel .rounded-xl.bg-white {
    border: 0 !important;
    border-radius: 0 !important;
    background: #fff !important;
    padding: 16px !important;
    box-shadow: none !important;
  }
  .workflow-properties-panel .text-sm.font-semibold,
  .workflow-properties-panel .text-base.font-semibold {
    color: var(--sfdc-text) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
  }
  .workflow-properties-panel .text-xs,
  .workflow-properties-panel .text-\\[11px\\] {
    color: var(--sfdc-text-muted) !important;
  }
  .workflow-properties-panel label {
    margin-bottom: 4px !important;
    color: var(--sfdc-text-secondary) !important;
    font-size: 12px !important;
    font-weight: 400 !important;
    line-height: 1.25 !important;
  }
  .workflow-properties-panel input:not([type="checkbox"]):not([type="radio"]),
  .workflow-properties-panel select,
  .workflow-properties-panel textarea {
    width: 100% !important;
    min-height: 32px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
    color: var(--sfdc-text) !important;
    font-size: 12px !important;
    font-weight: 400 !important;
    box-shadow: none !important;
  }
  .workflow-properties-panel input:not([type="checkbox"]):not([type="radio"]),
  .workflow-properties-panel select {
    height: 32px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  .workflow-properties-panel textarea {
    padding: 7px 9px !important;
  }
  .workflow-properties-panel input:focus,
  .workflow-properties-panel select:focus,
  .workflow-properties-panel textarea:focus {
    border-color: var(--sfdc-focus) !important;
    box-shadow: 0 0 3px #0176d3 !important;
    outline: 0 !important;
  }
  .workflow-properties-panel input[type="checkbox"],
  .workflow-properties-panel input[type="radio"] {
    accent-color: var(--sfdc-blue) !important;
  }
  .workflow-properties-panel .rounded-lg,
  .workflow-properties-panel .rounded-xl {
    border-radius: var(--sfdc-radius) !important;
  }
  .workflow-properties-panel .bg-slate-50 {
    background: #f3f3f3 !important;
  }
  .workflow-properties-panel .border-slate-200,
  .workflow-properties-panel .border-slate-100 {
    border-color: #dddbda !important;
  }
  .workflow-properties-panel button:not(.workflow-save-button):not(.workflow-cancel-button) {
    min-height: 30px !important;
    border-radius: var(--sfdc-radius) !important;
    box-shadow: none !important;
  }
  .workflow-properties-panel .workflow-cancel-button,
  .workflow-properties-panel .workflow-save-button {
    height: 32px !important;
    min-height: 32px !important;
    border-radius: var(--sfdc-radius) !important;
    padding: 0 14px !important;
    box-shadow: none !important;
    font-size: 12px !important;
    font-weight: 600 !important;
  }
  .workflow-properties-panel .workflow-cancel-button {
    border: 1px solid var(--sfdc-border) !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
  }
  .workflow-properties-panel .workflow-save-button {
    border: 1px solid var(--sfdc-blue) !important;
    background: var(--sfdc-blue) !important;
    color: #fff !important;
  }
  .workflow-properties-panel .workflow-cancel-button:hover {
    background: #f3f3f3 !important;
  }
  .workflow-properties-panel .workflow-save-button:hover {
    border-color: var(--sfdc-blue-hover) !important;
    background: var(--sfdc-blue-hover) !important;
  }
  .workflow-properties-footer {
    position: sticky !important;
    bottom: 0 !important;
    z-index: 8 !important;
    margin-left: -16px !important;
    margin-right: -16px !important;
    margin-bottom: -16px !important;
    padding: 10px 16px !important;
    border-top: 1px solid var(--sfdc-border) !important;
    background: #f3f3f3 !important;
  }

  /* Condition rows and option cards should read as Salesforce form sections,
     not rounded OneTheme cards. */
  .workflow-properties-panel .space-y-3.rounded-lg.border,
  .workflow-properties-panel .space-y-3.rounded-xl.border {
    border: 1px solid #dddbda !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
  }
  .workflow-properties-panel button.rounded-lg.border,
  .workflow-properties-panel button.rounded-xl.border {
    border-color: var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
  }
  .workflow-properties-panel button.rounded-lg.border:hover,
  .workflow-properties-panel button.rounded-xl.border:hover {
    background: #f3f3f3 !important;
  }

  /* ---------- DRAWERS / TESTS / DEBUG / PROPERTIES ---------- */
  .workflow-builder-page .workflow-sfdc-drawer {
    border: 1px solid var(--sfdc-border) !important;
    border-radius: var(--sfdc-radius) !important;
    background: #fff !important;
    box-shadow: 0 2px 3px rgba(0,0,0,.16) !important;
  }
  .workflow-builder-page .workflow-sfdc-drawer .workflow-cancel-button,
  .workflow-builder-page .workflow-sfdc-drawer .workflow-save-button {
    height: 32px !important;
    min-height: 32px !important;
    border-radius: var(--sfdc-radius) !important;
    box-shadow: none !important;
  }

  /* ---------- NEW FLOW MODAL ---------- */
  .workflow-builder-page [role="dialog"] > div {
    border-radius: var(--sfdc-radius) !important;
  }
  .workflow-builder-page [role="dialog"] button {
    border-radius: var(--sfdc-radius) !important;
  }

  @media (max-width: 1350px) {
    .workflow-visual-shell {
      grid-template-columns: 240px minmax(380px, 1fr) 330px !important;
    }
    .workflow-visual-shell.palette-collapsed { grid-template-columns: minmax(380px, 1fr) 330px !important; }
    .workflow-visual-shell.properties-collapsed { grid-template-columns: 240px minmax(380px, 1fr) !important; }
  }
  @media (max-width: 1050px) {
    .workflow-builder-header {
      align-items: flex-start !important;
      flex-wrap: wrap !important;
    }
    .workflow-builder-actions {
      width: 100% !important;
      overflow-x: auto !important;
      justify-content: flex-start !important;
      padding-bottom: 2px !important;
    }
    .workflow-visual-shell {
      grid-template-columns: 230px minmax(0, 1fr) !important;
    }
    .workflow-properties-panel {
      grid-column: 1 / -1 !important;
      border-left: 0 !important;
      border-top: 1px solid var(--sfdc-border) !important;
    }
  }
  @media (max-width: 760px) {
    .workflow-builder-header {
      padding: 6px 8px !important;
    }
    .workflow-visual-shell {
      grid-template-columns: 1fr !important;
    }
    .workflow-node-palette,
    .workflow-properties-panel {
      border-right: 0 !important;
      border-left: 0 !important;
      border-bottom: 1px solid var(--sfdc-border) !important;
    }
  }


  /* ---------- SALESFORCE-LIKE SCROLL CONTAINERS ----------
     Apply to Builder chrome only. The canvas and React Flow viewport are
     deliberately excluded so the user's existing canvas UI stays untouched. */
  .workflow-node-palette {
    display: flex !important;
    min-height: 0 !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }
  .workflow-palette-head,
  .workflow-palette-search,
  .workflow-palette-help,
  .workflow-new-resource-button,
  .workflow-manager-filter {
    flex: 0 0 auto !important;
  }
  .workflow-palette-scroll {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    scrollbar-gutter: stable !important;
  }
  .workflow-properties-panel {
    overscroll-behavior: contain !important;
    scrollbar-gutter: stable !important;
  }

  .workflow-palette-scroll,
  .workflow-properties-panel,
  .workflow-add-element-groups,
  .workflow-action-picker-scroll,
  .workflow-record-picker-menu,
  .workflow-sfdc-drawer,
  .workflow-header-more-menu,
  .workflow-canvas-more-menu,
  .workflow-builder-actions {
    scrollbar-width: thin !important;
    scrollbar-color: #b0adab #f3f3f3 !important;
  }

  .workflow-palette-scroll::-webkit-scrollbar,
  .workflow-properties-panel::-webkit-scrollbar,
  .workflow-add-element-groups::-webkit-scrollbar,
  .workflow-action-picker-scroll::-webkit-scrollbar,
  .workflow-record-picker-menu::-webkit-scrollbar,
  .workflow-sfdc-drawer::-webkit-scrollbar,
  .workflow-header-more-menu::-webkit-scrollbar,
  .workflow-canvas-more-menu::-webkit-scrollbar,
  .workflow-builder-actions::-webkit-scrollbar {
    width: 10px !important;
    height: 10px !important;
  }

  .workflow-palette-scroll::-webkit-scrollbar-track,
  .workflow-properties-panel::-webkit-scrollbar-track,
  .workflow-add-element-groups::-webkit-scrollbar-track,
  .workflow-action-picker-scroll::-webkit-scrollbar-track,
  .workflow-record-picker-menu::-webkit-scrollbar-track,
  .workflow-sfdc-drawer::-webkit-scrollbar-track,
  .workflow-header-more-menu::-webkit-scrollbar-track,
  .workflow-canvas-more-menu::-webkit-scrollbar-track,
  .workflow-builder-actions::-webkit-scrollbar-track {
    background: #f3f3f3 !important;
  }

  .workflow-palette-scroll::-webkit-scrollbar-thumb,
  .workflow-properties-panel::-webkit-scrollbar-thumb,
  .workflow-add-element-groups::-webkit-scrollbar-thumb,
  .workflow-action-picker-scroll::-webkit-scrollbar-thumb,
  .workflow-record-picker-menu::-webkit-scrollbar-thumb,
  .workflow-sfdc-drawer::-webkit-scrollbar-thumb,
  .workflow-header-more-menu::-webkit-scrollbar-thumb,
  .workflow-canvas-more-menu::-webkit-scrollbar-thumb,
  .workflow-builder-actions::-webkit-scrollbar-thumb {
    min-height: 28px !important;
    border: 2px solid #f3f3f3 !important;
    border-radius: 8px !important;
    background: #b0adab !important;
    background-clip: padding-box !important;
  }

  .workflow-palette-scroll::-webkit-scrollbar-thumb:hover,
  .workflow-properties-panel::-webkit-scrollbar-thumb:hover,
  .workflow-add-element-groups::-webkit-scrollbar-thumb:hover,
  .workflow-action-picker-scroll::-webkit-scrollbar-thumb:hover,
  .workflow-record-picker-menu::-webkit-scrollbar-thumb:hover,
  .workflow-sfdc-drawer::-webkit-scrollbar-thumb:hover,
  .workflow-header-more-menu::-webkit-scrollbar-thumb:hover,
  .workflow-canvas-more-menu::-webkit-scrollbar-thumb:hover,
  .workflow-builder-actions::-webkit-scrollbar-thumb:hover {
    background: #969492 !important;
    background-clip: padding-box !important;
  }

  .workflow-palette-scroll::-webkit-scrollbar-corner,
  .workflow-properties-panel::-webkit-scrollbar-corner,
  .workflow-add-element-groups::-webkit-scrollbar-corner,
  .workflow-action-picker-scroll::-webkit-scrollbar-corner,
  .workflow-record-picker-menu::-webkit-scrollbar-corner,
  .workflow-sfdc-drawer::-webkit-scrollbar-corner,
  .workflow-header-more-menu::-webkit-scrollbar-corner,
  .workflow-canvas-more-menu::-webkit-scrollbar-corner,
  .workflow-builder-actions::-webkit-scrollbar-corner {
    background: #f3f3f3 !important;
  }

  /* Match Salesforce's panel scroll behaviour: pane headers stay fixed while
     only the pane body scrolls. */
  .workflow-palette-head {
    position: sticky !important;
    top: 0 !important;
    z-index: 12 !important;
  }
  .workflow-properties-tabs {
    position: sticky !important;
    top: 0 !important;
    z-index: 12 !important;
  }
  .workflow-properties-footer {
    position: sticky !important;
    bottom: 0 !important;
    z-index: 12 !important;
  }

  /* Drop-down/list surfaces use the same compact Salesforce chrome. */
  .workflow-record-picker-menu,
  .workflow-action-picker,
  .workflow-add-element-popover,
  .workflow-header-more-menu,
  .workflow-canvas-more-menu {
    border: 1px solid #c9c7c5 !important;
    border-radius: 4px !important;
    background: #fff !important;
    box-shadow: 0 2px 3px rgba(0,0,0,.16) !important;
  }

  /* Keep scroll tracks from visually colliding with panel dividers. */
  .workflow-palette-scroll {
    padding-right: 0 !important;
  }
  .workflow-properties-panel {
    padding-right: 0 !important;
  }


  /* Salesforce-style Flow Builder interaction chrome. Canvas node/edge presentation stays OneEngine. */
  .workflow-toolbox-title {
    flex: 0 0 auto;
    min-height: 38px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-bottom: 1px solid #e5e5e5;
    background: #fff;
    color: #181818;
    font-size: 14px;
    font-weight: 600;
  }
  .workflow-layout-toggle--header {
    height: 32px !important;
    border: 1px solid var(--sfdc-border) !important;
    border-radius: 4px !important;
    background: #fff !important;
  }
  .workflow-layout-toggle--header button {
    height: 30px !important;
    min-height: 30px !important;
    border: 0 !important;
    border-radius: 3px !important;
    padding: 0 10px !important;
    background: #fff !important;
    color: var(--sfdc-blue) !important;
    font-size: 11px !important;
    font-weight: 600 !important;
  }
  .workflow-layout-toggle--header button.is-active {
    background: #eef4ff !important;
    color: #032d60 !important;
  }
  .workflow-debug-tabs {
    display: flex;
    gap: 18px;
    border-bottom: 1px solid #dddbda;
  }
  .workflow-debug-tabs button {
    position: relative;
    min-height: 34px;
    border: 0;
    background: transparent;
    color: #444;
    font-size: 12px;
    font-weight: 600;
  }
  .workflow-debug-tabs button.is-active {
    color: #0176d3;
  }
  .workflow-debug-tabs button.is-active::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 3px;
    background: #0176d3;
  }


  .workflow-new-flow-dialog {
    border-radius: 4px !important;
    overflow: hidden;
  }
  .workflow-new-flow-source {
    width: min(520px, 100%);
    min-height: 110px;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 2px solid #0176d3;
    border-radius: 4px;
    background: #eef4ff;
    padding: 18px;
    text-align: left;
  }
  .workflow-new-flow-source-icon,
  .workflow-new-flow-type-icon {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 4px;
    background: #0176d3;
    color: #fff;
    font-size: 19px;
    font-weight: 700;
  }
  .workflow-new-flow-source strong,
  .workflow-new-flow-type strong {
    display: block;
    color: #181818;
    font-size: 13px;
    font-weight: 700;
  }
  .workflow-new-flow-source small,
  .workflow-new-flow-type small {
    display: block;
    margin-top: 5px;
    color: #706e6b;
    font-size: 11px;
    line-height: 1.35;
  }
  .workflow-new-flow-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .workflow-new-flow-type {
    min-height: 96px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid #c9c7c5 !important;
    border-radius: 4px !important;
    background: #fff !important;
    padding: 13px !important;
    text-align: left;
  }
  .workflow-new-flow-type:hover {
    border-color: #1b96ff !important;
    background: #f3f9ff !important;
  }
  .workflow-new-flow-type.is-selected {
    border: 2px solid #0176d3 !important;
    background: #eef4ff !important;
    padding: 12px !important;
  }

`;

function WorkflowRecordPicker({ objectKey, value, onChange, ariaLabel = "Search records" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const text = String(query || "").trim();
    if (!objectKey || text.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ page: "1", pageSize: "12", search: text });
        const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records?${params.toString()}`);
        const rows = response?.records || response?.data?.records || response?.data || [];
        setResults(Array.isArray(rows) ? rows : []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [objectKey, query]);

  const labelFor = (record) => record?.name || record?.title || record?.display_name || record?.reference || record?.code || record?.email || record?.id || record?.record_id || "Record";
  const idFor = (record) => record?.id || record?.record_id || "";

  return (
    <div className="workflow-record-picker">
      <div className="workflow-record-picker-input">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label={ariaLabel}
          value={query}
          onFocus={() => { if (results.length) setOpen(true); }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={value ? `Selected: ${value}` : "Search records by name, reference or ID…"}
        />
        {loading ? <small>Searching…</small> : value ? <button type="button" onClick={() => { onChange?.(""); setQuery(""); setOpen(false); }}>Clear</button> : null}
      </div>
      {open && (query.trim().length >= 2) ? (
        <div className="workflow-record-picker-menu">
          {results.length ? results.map((record) => {
            const id = idFor(record);
            return <button key={id} type="button" onClick={() => { onChange?.(String(id)); setQuery(String(labelFor(record))); setOpen(false); }}>
              <strong>{labelFor(record)}</strong>
              <small>{id}</small>
            </button>;
          }) : !loading ? <div className="workflow-record-picker-empty">No matching records</div> : null}
        </div>
      ) : null}
    </div>
  );
}

const SCREEN_COMPONENT_TYPES = [
  { value: "DISPLAY_TEXT", label: "Display Text", input: false, group: "Display", description: "Rich instructional or informational text." },
  { value: "IMAGE", label: "Image", input: false, group: "Display", description: "Display an image from a URL or resource." },
  { value: "LINK", label: "Link", input: false, group: "Display", description: "Display a clickable link." },
  { value: "PROGRESS", label: "Progress Indicator", input: false, group: "Display", description: "Show stage/progress from Stage resources." },
  { value: "SECTION", label: "Section", input: false, group: "Layout", description: "Group related screen content." },
  { value: "COLUMNS", label: "Columns", input: false, group: "Layout", description: "Arrange components into columns." },
  { value: "TEXT", label: "Text", group: "Input", description: "Single-line text input." },
  { value: "TEXT_AREA", label: "Text Area", group: "Input", description: "Multi-line text input." },
  { value: "EMAIL", label: "Email", group: "Input", description: "Email address input." },
  { value: "PASSWORD", label: "Password", group: "Input", description: "Masked text input." },
  { value: "NUMBER", label: "Number", group: "Input", description: "Numeric input." },
  { value: "DATE", label: "Date", group: "Input", description: "Date input." },
  { value: "DATETIME", label: "Date/Time", group: "Input", description: "Date and time input." },
  { value: "CHECKBOX", label: "Checkbox", group: "Input", description: "Single boolean choice." },
  { value: "TOGGLE", label: "Toggle", group: "Input", description: "Boolean toggle control." },
  { value: "SLIDER", label: "Slider", group: "Input", description: "Numeric slider input." },
  { value: "ADDRESS", label: "Address", group: "Input", description: "Structured address input." },
  { value: "RADIO", label: "Radio Buttons", group: "Choice", description: "Select one choice." },
  { value: "CHECKBOX_GROUP", label: "Checkbox Group", group: "Choice", description: "Select multiple choices." },
  { value: "SELECT", label: "Picklist", group: "Choice", description: "Select one choice from a list." },
  { value: "MULTI_SELECT", label: "Multi-Select Picklist", group: "Choice", description: "Select multiple choices from a list." },
  { value: "RECORD_PICKER", label: "Record Picker", group: "Data", description: "Search and select an accessible record." },
  { value: "DATA_TABLE", label: "Data Table", group: "Data", description: "Display and optionally select records." },
  { value: "FILE_UPLOAD", label: "File Upload", group: "Data", description: "Collect one or more files." },
  { value: "CUSTOM_COMPONENT", label: "Registered Component", group: "Custom", description: "Use a registered OneEngine screen component." },
];

const SCREEN_COMPONENT_GROUPS = ["Input", "Choice", "Data", "Display", "Layout", "Custom"];

const actionOptions = [
  { value: "CONSTANT", label: "Constant" },
  { value: "FORMULA", label: "Formula" },
  { value: "TEXT_TEMPLATE", label: "Text Template" },
  { value: "INSTRUCTION_TEMPLATE", label: "Instruction Template" },
  { value: "CHOICE", label: "Choice" },
  { value: "RECORD_CHOICE_SET", label: "Record Choice Set" },
  { value: "PICKLIST_CHOICE_SET", label: "Picklist Choice Set" },
  { value: "COLLECTION_CHOICE_SET", label: "Collection Choice Set" },
  { value: "STAGE", label: "Stage" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "COLLECTION_FILTER", label: "Collection Filter" },
  { value: "COLLECTION_SORT", label: "Collection Sort" },
  { value: "TRANSFORM", label: "Transform" },
  { value: "RECOMMENDATION_ASSIGNMENT", label: "Recommendation Assignment" },
  { value: "LIMIT_REPETITIONS", label: "Limit Repetitions" },
  { value: "RUN_AGENT", label: "Run Agent" },
  { value: "SCREEN", label: "Screen" },
  { value: "LOOP", label: "Loop" },
  { value: "SCHEDULE_PATH", label: "Scheduled Path" },
  { value: "GET_RECORDS", label: "Get Records" },
  { value: "BULK_UPDATE_RECORDS", label: "Bulk Update Records" },
  { value: "CREATE_RECORD", label: "Create Records" },
  { value: "UPDATE_RECORD", label: "Update Records" },
  { value: "UPDATE_RELATED_RECORD", label: "Update Related Record" },
  { value: "CREATE_RELATED_RECORD", label: "Create Related Record" },
  { value: "DELETE_RECORD", label: "Delete Records" },
  { value: "ASSIGN_RECORD", label: "Assign Record" },
  { value: "ADD_RELATIONSHIP", label: "Add Relationship" },
  { value: "REMOVE_RELATIONSHIP", label: "Remove Relationship" },
  { value: "IN_APP_NOTIFICATION", label: "In-App Notification" },
  { value: "EMAIL_ALERT", label: "Email Alert" },
  { value: "SEND_EMAIL", label: "Send Email" },
  { value: "SEND_SMS", label: "Send SMS" },
  { value: "SEND_WHATSAPP", label: "Send WhatsApp" },
  { value: "SEND_APPOINTMENT_CONFIRMATION", label: "Appointments - Send Booking Confirmation" },
  { value: "CALL_FUNCTION", label: "Call Function" },
  { value: "RUN_SUBFLOW", label: "Subflow" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "CONDITION", label: "Decision" },
  { value: "WAIT", label: "Wait for Amount of Time" },
  { value: "WAIT_FOR_CONDITIONS", label: "Wait for Conditions" },
  { value: "WAIT_UNTIL_DATE", label: "Wait Until Date" },
  { value: "CUSTOM_ERROR", label: "Custom Error" },
  { value: "STOP", label: "End" },
];

const SALESFORCE_CORE_ELEMENT_TYPES = new Set([
  "ASSIGNMENT","COLLECTION_FILTER","COLLECTION_SORT","TRANSFORM","RECOMMENDATION_ASSIGNMENT","LIMIT_REPETITIONS","RUN_AGENT","SCREEN","LOOP","GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD",
  "CONDITION","WAIT","WAIT_FOR_CONDITIONS","WAIT_UNTIL_DATE","CUSTOM_ERROR","STOP","EMAIL_ALERT","RUN_SUBFLOW",
]);

const FLOW_ELEMENT_VISUALS = {
  ASSIGNMENT: { icon: "=", color: "#fe9339", family: "Logic" },
  COLLECTION_FILTER: { icon: "▽", color: "#fe9339", family: "Logic" },
  COLLECTION_SORT: { icon: "⇅", color: "#fe9339", family: "Logic" },
  TRANSFORM: { icon: "⇄", color: "#e83e8c", family: "Data" },
  RECOMMENDATION_ASSIGNMENT: { icon: "★", color: "#fe9339", family: "Logic" },
  LIMIT_REPETITIONS: { icon: "≦", color: "#fe9339", family: "Logic" },
  RUN_AGENT: { icon: "✦", color: "#0b5cab", family: "Interaction" },
  SCREEN: { icon: "▤", color: "#0b5cab", family: "Interaction" },
  LOOP: { icon: "↻", color: "#fe9339", family: "Logic" },
  CONDITION: { icon: "◇", color: "#fe9339", family: "Logic" },
  WAIT: { icon: "◷", color: "#fe9339", family: "Logic" },
  WAIT_FOR_CONDITIONS: { icon: "◌", color: "#fe9339", family: "Logic" },
  WAIT_UNTIL_DATE: { icon: "◴", color: "#fe9339", family: "Logic" },
  CUSTOM_ERROR: { icon: "!", color: "#c23934", family: "Logic" },
  STOP: { icon: "■", color: "#706e6b", family: "Logic" },
  GET_RECORDS: { icon: "⌕", color: "#e83e8c", family: "Data" },
  CREATE_RECORD: { icon: "+", color: "#e83e8c", family: "Data" },
  UPDATE_RECORD: { icon: "✎", color: "#e83e8c", family: "Data" },
  DELETE_RECORD: { icon: "−", color: "#e83e8c", family: "Data" },
  RUN_SUBFLOW: { icon: "⇢", color: "#0b5cab", family: "Interaction" },
  EMAIL_ALERT: { icon: "✉", color: "#0b5cab", family: "Interaction" },
  __ACTION__: { icon: "⚡", color: "#0b5cab", family: "Interaction" },
  __GROUP__: { icon: "▣", color: "#5c6ac4", family: "Logic" },
  __CONNECT__: { icon: "↪", color: "#5c6ac4", family: "Logic" },
};

function flowElementVisual(type = "") {
  return FLOW_ELEMENT_VISUALS[String(type || "").toUpperCase()] || { icon: "⚡", color: "#0b5cab", family: "Action" };
}

function decisionConditionSummary(step, rootObjectKey = "Record") {
  if (String(step?.type || "").toUpperCase() !== "CONDITION") return "";
  const outcomes = Array.isArray(step?.config?.outcomes) ? step.config.outcomes : [];
  const condition = outcomes[0]?.condition || step?.config?.condition || null;
  const rules = Array.isArray(condition?.rules) ? condition.rules : Array.isArray(condition?.conditions) ? condition.conditions : [];
  const rule = rules[0];
  if (!rule?.field) return "";
  const objectLabel = String(rootObjectKey || "Record").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const fieldLabel = String(rule.field).split(".").pop().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const operatorLabel = {
    is_not_empty: "is not empty",
    is_empty: "is empty",
    equals: "equals",
    not_equals: "does not equal",
    changed: "changed",
    changed_to: "changed to",
    greater_than: "is greater than",
    less_than: "is less than",
  }[rule.operator || "equals"] || String(rule.operator || "equals").replaceAll("_", " ");
  const suffix = ["is_not_empty","is_empty","changed"].includes(rule.operator) ? "" : rule.value !== undefined && rule.value !== "" ? ` ${rule.value}` : "";
  return `${objectLabel} ${fieldLabel} ${operatorLabel}${suffix}`;
}

function flowElementSupportsFaultPath(type = "") {
  return !["CONDITION","LOOP","SCREEN","WAIT","WAIT_FOR_CONDITIONS","WAIT_UNTIL_DATE","CUSTOM_ERROR","ASSIGNMENT","STOP","CONSTANT","FORMULA","TEXT_TEMPLATE","INSTRUCTION_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(String(type || "").toUpperCase());
}

function flowApiName(label = "") {
  const cleaned = String(label || "").trim().replace(/[^A-Za-z0-9_ ]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const prefixed = /^[A-Za-z]/.test(cleaned) ? cleaned : cleaned ? `Flow_${cleaned}` : "Element";
  return prefixed.slice(0, 80);
}

function createBlankWorkflow(scopeKey = null) {
  return {
    name: scopeKey === "whatsapp_assistant" ? "WhatsApp Assistant Flow" : "",
    object: "",
    trigger: scopeKey === "whatsapp_assistant" ? "whatsapp_message_received" : "manual",
    version: 1,
    lifecycleStatus: "DRAFT",
    active: false,
    runtimeActive: false,
    activeVersion: null,
    draftVersion: null,
    entryTransition: "EVERY_TIME",
    inputContract: [],
    outputContract: [],
    actionMetadata: {
      apiName: scopeKey === "whatsapp_assistant" ? "WhatsApp_Assistant_Flow" : "",
      description: "",
      flowType: scopeKey === "whatsapp_assistant" ? "PLATFORM_EVENT_TRIGGERED" : "AUTOLAUNCHED",
      optimizeFor: "ACTIONS_AND_RELATED_RECORDS",
      includeAsyncPath: false,
      schedule: { scheduleType: "DAILY", timezone: "", definition: { time: "" } },
      builderLayout: { mode: "AUTO", positions: {} },
      builderGroups: [],
    },
    steps: scopeKey === "whatsapp_assistant"
      ? [
          { ...makeStep("WHEN"), type: "CONDITION", label: "Decision" },
          { ...makeStep("SEND_WHATSAPP"), config: { ...makeStep("SEND_WHATSAPP").config, template: "", recipient: "" } },
        ]
      : [],
  };
}

function persistedWorkflowSignature(workflow = {}) {
  return JSON.stringify({
    name: workflow.name || "",
    objectId: workflow.objectId || workflow.object_id || null,
    objectKey: workflow.objectKey || workflow.object_key || workflow.object || "",
    trigger: workflow.trigger || workflow.trigger_key || "manual",
    conditions: workflow.conditions || [],
    match: workflow.match || workflow.action?.match || "all",
    entryTransition: workflow.entryTransition || workflow.action?.entryTransition || "EVERY_TIME",
    inputContract: workflow.inputContract || workflow.action?.inputContract || [],
    outputContract: workflow.outputContract || workflow.action?.outputContract || [],
    scope: workflow.scope || workflow.action?.scope || null,
    actionMetadata: {
      flowType: workflow.actionMetadata?.flowType || workflow.action?.flowType || null,
      optimizeFor: workflow.actionMetadata?.optimizeFor || workflow.action?.optimizeFor || "ACTIONS_AND_RELATED_RECORDS",
      includeAsyncPath: workflow.actionMetadata?.includeAsyncPath === true || workflow.action?.includeAsyncPath === true,
      apiName: workflow.actionMetadata?.apiName || workflow.action?.apiName || "",
      description: workflow.actionMetadata?.description || workflow.action?.description || "",
      templateKey: workflow.actionMetadata?.templateKey || workflow.action?.templateKey || null,
      defaultForNewDevices: workflow.actionMetadata?.defaultForNewDevices === true || workflow.action?.defaultForNewDevices === true,
      ui: workflow.actionMetadata?.ui || workflow.action?.ui || null,
      builderLayout: workflow.actionMetadata?.builderLayout || workflow.action?.builderLayout || { mode: "AUTO", positions: {} },
      builderGroups: workflow.actionMetadata?.builderGroups || workflow.action?.builderGroups || [],
      schedule: workflow.actionMetadata?.schedule || workflow.action?.schedule || null,
    },
    steps: (workflow.steps || workflow.action?.actions || []).filter((step) => step.enabled !== false).map((step) => ({
      id: step.id,
      label: step.label || getActionLabel(step.type || step.key),
      type: step.type || step.key,
      config: step.config || Object.fromEntries(Object.entries(step).filter(([key]) => !["expanded","_visual"].includes(key))),
    })),
  });
}

function blankCondition() {
  return { id: Date.now() + Math.random(), field: "", operator: "equals", value: "" };
}

function makeStep(type = "CREATE_RECORD") {
  const label = type === "__ACTION__" ? "Action" : (actionOptions.find((option) => option.value === type)?.label || "Action");
  return {
    id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    expanded: true,
    type,
    label,
    config: {
      apiName: flowApiName(label),
      description: "",
      resourceOnly: false,
      object: "",
      recordId: "",
      variableName: "",
      variableType: "text",
      operator: "set",
      value: "",
      assignments: [],
      resourceName: "",
      resourceType: "text",
      resultType: "number",
      expression: "",
      formulaInputs: {},
      templateText: "",
      instructionText: "",
      instructionInputs: {},
      choiceLabel: "",
      choiceValue: "",
      choiceDataType: "text",
      choiceLabelField: "",
      choiceValueField: "id",
      fieldApiName: "",
      choiceLabelPath: "",
      choiceValuePath: "",
      stageLabel: "",
      stageOrder: 1,
      stageValue: "",
      stageActive: true,
      collection: "",
      outputName: "",
      transformMappings: {},
      recommendationMappings: {},
      repetitionReactions: ["ACCEPTED"],
      repetitionCount: 1,
      repetitionDays: 30,
      repetitionScope: "USER_OR_RECORD",
      agentPrompt: "",
      agentContext: {},
      agentOutputVariable: "agentResponse",
      screen: {
        label: "Screen",
        apiName: "Screen",
        description: "",
        components: [],
        nextLabel: "Next",
        backLabel: "Previous",
        finishLabel: "Finish",
        showHeader: true,
        showFooter: true,
        currentStageResource: "",
      },
      allowBack: true,
      allowNext: true,
      allowFinish: false,
      allowPause: false,
      showFooter: true,
      itemVariable: type === "LOOP" ? "currentItem_Loop" : "currentItem",
      iterationOrder: type === "LOOP" ? "FIRST_TO_LAST" : "FIRST_TO_LAST",
      bodyBranch: [],
      recordIds: "",
      pathLabel: "Scheduled Path",
      scheduleMode: "OFFSET",
      delayAmount: 30,
      delayUnit: "MINUTES",
      runAt: "",
      branch: [],
      filters: [],
      match: "all",
      sortField: "",
      sortDirection: "asc",
      store: "first",
      limit: 1,
      fieldMappings: {},
      template: "",
      templateId: "",
      recipient: "",
      contentMode: "TEMPLATE",
      subject: "",
      body: "",
      text: "",
      html: "",
      providerStatus: "not-configured",
      functionKey: "",
      inputs: {},
      workflowId: "",
      workflowInputs: {},
      condition: { type: "all", rules: [blankCondition()] },
      outcomes: [],
      defaultLabel: "Default Outcome",
      defaultBranch: [],
      ifBranch: [],
      elseBranch: [],
      faultBranch: [],
      faultMode: "FAIL",
      retryCount: 1,
      durationSeconds: 60,
      resumeAt: "",
      waitCondition: { type: "all", rules: [blankCondition()] },
      pollSeconds: 60,
      maxWaitUntil: "",
      errorMessage: "",
      errorField: "",
      reason: "",
      url: "",
      method: "POST",
      message: "",
      title: "",
      apiParameters: {},
    },
  };
}

function getActionLabel(type) {
  return actionOptions.find((option) => option.value === type)?.label || "Action";
}

function workflowActionCategory(type = "") {
  const key = String(type || "").toUpperCase();
  if (["CONSTANT","FORMULA","TEXT_TEMPLATE","INSTRUCTION_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(key)) return "Resources";
  if (["CONDITION","WAIT","WAIT_FOR_CONDITIONS","WAIT_UNTIL_DATE","CUSTOM_ERROR","STOP","ASSIGNMENT","RECOMMENDATION_ASSIGNMENT","LIMIT_REPETITIONS","COLLECTION_FILTER","COLLECTION_SORT","LOOP","SCHEDULE_PATH"].includes(key)) return "Logic";
  if (["RUN_SUBFLOW","SCREEN","RUN_AGENT"].includes(key)) return "Interaction";
  if (["GET_RECORDS","TRANSFORM","BULK_UPDATE_RECORDS","CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(key)) return "Data";
  if (["EMAIL_ALERT","SEND_EMAIL","SEND_EMAIL_BREVO","SEND_EMAIL_MAILJET","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION","SEND_APPOINTMENT_CONFIRMATION","CALL_FUNCTION","WEBHOOK","HTTP_REQUEST"].includes(key) || key.startsWith("CONNECTOR_") || key.startsWith("PAYMENT_") || key.startsWith("PRINT_") || key.includes("SCANNER") || key.includes("CASH_DRAWER") || key.startsWith("QUICKBOOKS_") || key.startsWith("SHOPIFY_") || key.startsWith("UBER_") || key.includes("APPOINTMENT")) return "Actions";
  return "Actions";
}

/* Trigger values arrive as machine keys ("after_update"); the canvas Start
   pill and the workflow list present them in words. */
const TRIGGER_LABELS = {
  after_create: "When a record is created",
  after_update: "When a record is updated",
  after_save: "When a record is created or updated",
  manual: "Manual trigger",
  scheduled: "Scheduled trigger",
  system_function: "System function",
  system_action: "System action",
  system_job: "System job trigger",
};
const getTriggerLabel = (value) => TRIGGER_LABELS[value] || value || "Manual trigger";

export const FLOW_TYPE_OPTIONS = [
  { key: "SCREEN_FLOW", label: "Screen Flow", icon: "▤", description: "Guide a user through screens and collect input." },
  { key: "RECORD_TRIGGERED", label: "Record-Triggered Flow", icon: "◉", description: "Run automatically when a record is created, updated, or deleted." },
  { key: "SCHEDULE_TRIGGERED", label: "Schedule-Triggered Flow", icon: "◷", description: "Run at a specified time and frequency." },
  { key: "PLATFORM_EVENT_TRIGGERED", label: "Event-Triggered Flow", icon: "⚡", description: "Run when a registered platform or connector event is published." },
  { key: "AUTOLAUNCHED", label: "Autolaunched Flow (No Trigger)", icon: "▶", description: "Run from another flow, action, API, or application context." },
  { key: "RECOMMENDATION_STRATEGY", label: "Recommendation Strategy Flow", icon: "★", description: "Build a recommendation strategy with reusable resources and decisions." },
  { key: "INSTRUCTION_FLOW", label: "Instruction Flow", icon: "✦", description: "Run an instruction-oriented automation without screens." },
  { key: "KIOSK_EXPERIENCE", label: "Kiosk Experience", icon: "▣", description: "Build a metadata-driven kiosk experience using the same flow runtime." },
];

const RECORD_TRIGGER_WHEN_OPTIONS = [
  { key: "created", label: "A record is created" },
  { key: "updated", label: "A record is updated" },
  { key: "created_or_updated", label: "A record is created or updated" },
  { key: "deleted", label: "A record is deleted" },
];

function recordTriggerWhen(trigger = "") {
  const value = String(trigger || "").toLowerCase();
  if (value.includes("delete")) return "deleted";
  if (["before_create","after_create"].includes(value)) return "created";
  if (["before_update","after_update","field_changed"].includes(value)) return "updated";
  return "created_or_updated";
}

function recordTriggerKey(when = "created_or_updated", optimizeFor = "ACTIONS_AND_RELATED_RECORDS") {
  const fast = String(optimizeFor || "").toUpperCase() === "FAST_FIELD_UPDATES";
  if (when === "created") return fast ? "before_create" : "after_create";
  if (when === "updated") return fast ? "before_update" : "after_update";
  if (when === "deleted") return "after_delete";
  return fast ? "before_save" : "after_save";
}

const RECORD_ACTION_TYPES = new Set([
  "CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD",
  "DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP",
]);

function conditionIsValid(condition) {
  const rules = Array.isArray(condition?.rules) ? condition.rules : [];
  if (!rules.length) return false;
  return rules.every((rule) => {
    if (!rule?.field) return false;
    const operator = rule.operator || "equals";
    if (["is_empty","is_not_empty","changed"].includes(operator)) return true;
    if (operator === "changed_from_to") {
      return rule.value && typeof rule.value === "object"
        && rule.value.from !== undefined && rule.value.from !== null && String(rule.value.from).trim() !== ""
        && rule.value.to !== undefined && rule.value.to !== null && String(rule.value.to).trim() !== "";
    }
    return rule.value !== undefined && rule.value !== null && String(rule.value).trim() !== "";
  });
}

function workflowActionIssue(step, definition = null) {
  if (!step || step.enabled === false) return "";
  const config = step.config || {};
  const required = Array.isArray(definition?.schema?.required) ? definition.schema.required : [];
  for (const key of required) {
    const value = config[key] ?? config.apiParameters?.[key];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
      const label = String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
      return `Complete required field: ${label}.`;
    }
  }
  if (step.type === "CONSTANT") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid constant name.";
    if (!config.resourceType) return "Choose a constant type.";
    if (config.value === undefined || config.value === "") return "Enter the constant value.";
  }
  if (step.type === "FORMULA") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid formula name.";
    if (!config.resultType) return "Choose a formula result type.";
    if (!String(config.expression || "").trim()) return "Enter a formula expression.";
    if (Object.keys(config.formulaInputs || {}).some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(name)))) return "Formula input names can only use letters, numbers and underscores.";
  }
  if (step.type === "TEXT_TEMPLATE") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid text template name.";
    if (!String(config.templateText || "").trim()) return "Enter text for the Text Template.";
  }
  if (step.type === "INSTRUCTION_TEMPLATE") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Instruction Template API Name.";
    if (!String(config.instructionText || "").trim()) return "Enter instructions for the Instruction Template.";
    if (Object.keys(config.instructionInputs || {}).some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(name)))) return "Instruction input names can only use letters, numbers and underscores.";
  }
  if (step.type === "CHOICE") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Choice API Name.";
    if (!String(config.choiceLabel || "").trim()) return "Enter a Choice label.";
    if (config.choiceValue === undefined || config.choiceValue === null || String(config.choiceValue).trim() === "") return "Enter a stored value for the Choice.";
  }
  if (step.type === "RECORD_CHOICE_SET") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Record Choice Set API Name.";
    if (!config.object) return "Choose an object for the Record Choice Set.";
    if (!config.choiceLabelField) return "Choose a label field.";
    if (!config.choiceValueField) return "Choose a value field.";
    if (Array.isArray(config.filters) && config.filters.some((filter) => !String(filter?.field || "").trim())) return "Choose a field for every Record Choice filter.";
    if (Array.isArray(config.filters) && config.filters.some((filter) => !["is_empty","is_not_empty"].includes(filter?.operator) && (filter?.value === undefined || filter?.value === null || String(filter.value).trim() === ""))) return "Enter a value for every Record Choice filter.";
    if (!Number.isInteger(Number(config.limit || 50)) || Number(config.limit || 50) < 1 || Number(config.limit || 50) > 200) return "Record Choice maximum choices must be between 1 and 200.";
  }
  if (step.type === "PICKLIST_CHOICE_SET") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Picklist Choice Set API Name.";
    if (!config.object || !config.fieldApiName) return "Choose an object and picklist field.";
  }
  if (step.type === "COLLECTION_CHOICE_SET") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Collection Choice Set API Name.";
    if (!config.collection) return "Choose a source collection.";
    if (!config.choiceLabelPath || !config.choiceValuePath) return "Choose label and value paths.";
  }
  if (step.type === "STAGE") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid Stage API Name.";
    if (!String(config.stageLabel || "").trim()) return "Enter a Stage label.";
    if (!String(config.stageValue || "").trim()) return "Enter a Stage value.";
    if (!Number.isInteger(Number(config.stageOrder)) || Number(config.stageOrder) < 1) return "Stage order must be 1 or greater.";
  }
  if (step.type === "SCREEN") {
    const screen = config.screen || {};
    if (!String(screen.label || "").trim()) return "Enter a Screen label.";
    if (!String(screen.apiName || "").trim() || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(String(screen.apiName))) return "Enter a valid Screen API Name.";
    if (!Array.isArray(screen.components)) return "Screen components are invalid.";
    const inputComponents = screen.components.filter((component) => component?.input !== false);
    const names = inputComponents.map((component) => String(component?.name || "").trim()).filter(Boolean);
    const normalizedNames = names.map((name) => name.toLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) return "Screen component API Names must be unique.";
    if (inputComponents.some((component) => !String(component?.name || "").trim() || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(String(component.name)))) return "Every input component needs a valid API Name.";
    if (inputComponents.some((component) => String(component.validationFormula || "").trim() && !String(component.validationMessage || "").trim())) return "Add an error message for every component validation formula.";
    const choiceComponents = screen.components.filter((component) => ["RADIO","CHECKBOX_GROUP","SELECT","MULTI_SELECT"].includes(component?.type));
    for (const component of choiceComponents) {
      const options = Array.isArray(component.options) ? component.options : [];
      if (!component.choiceResource && !options.length) return `Add choices or choose a Choice Resource for ${component.label || component.name || "the choice component"}.`;
      if (options.some((option) => !String(option?.label || "").trim() || String(option?.value ?? "").trim() === "")) return `Complete every choice label and value for ${component.label || component.name || "the choice component"}.`;
      const values = options.map((option) => String(option.value));
      if (new Set(values).size !== values.length) return `Choice values must be unique for ${component.label || component.name || "the choice component"}.`;
      if (component.controllingComponent && !inputComponents.some((candidate) => candidate.name === component.controllingComponent)) return `Choose a valid controlling component for ${component.label || component.name || "the choice component"}.`;
    }
    const visibilityOperatorsWithValue = new Set(["equals","not_equals","contains","not_contains","greater_than","greater_or_equal","less_than","less_or_equal"]);
    for (const component of screen.components) {
      if (!component?.visibilityResource) continue;
      if (String(component.visibilityResource) === String(component.name || "")) return `Conditional visibility for ${component.label || component.name || "a component"} cannot reference itself.`;
      if (visibilityOperatorsWithValue.has(component.visibilityOperator || "truthy") && String(component.visibilityValue ?? "").trim() === "") return `Conditional visibility for ${component.label || component.name || "a component"} needs a compare value.`;
    }
    for (const component of screen.components.filter((item) => item.type === "RECORD_PICKER")) {
      if (!component.objectKey) return `Choose an object for ${component.label || component.name || "every Record Picker"}.`;
      const minChars = Number(component.searchMinChars ?? 2);
      if (!Number.isInteger(minChars) || minChars < 1 || minChars > 5) return `Record Picker minimum search characters must be between 1 and 5 for ${component.label || component.name || "the Record Picker"}.`;
    }
    for (const component of screen.components.filter((item) => item.type === "DATA_TABLE")) {
      if (!component.dataResource) return `Choose a row collection for ${component.label || component.name || "every Data Table"}.`;
      const columns = Array.isArray(component.columns) ? component.columns.map((column) => String(column || "").trim()).filter(Boolean) : [];
      if (!columns.length) return `Add at least one column for ${component.label || component.name || "the Data Table"}.`;
      if (new Set(columns.map((column) => column.toLowerCase())).size !== columns.length) return `Data Table columns must be unique for ${component.label || component.name || "the Data Table"}.`;
      if (component.selectionMode === "none" && component.required === true) return `${component.label || component.name || "The Data Table"} cannot be required when row selection is disabled.`;
    }
    for (const component of screen.components.filter((item) => item.type === "FILE_UPLOAD")) {
      const acceptedTypes = Array.isArray(component.acceptedTypes) ? component.acceptedTypes : [];
      const invalidType = acceptedTypes.find((value) => {
        const item = String(value || "").trim();
        return item && !/^\.[A-Za-z0-9]+$/.test(item) && !/^[A-Za-z0-9!#$&^_.+-]+\/(?:\*|[A-Za-z0-9!#$&^_.+-]+)$/.test(item);
      });
      if (invalidType) return `Enter valid file types for ${component.label || component.name || "the File Upload"} (for example .pdf, image/*, application/pdf).`;
      const maxFiles = Number(component.maxFiles || 1);
      if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 10) return `Maximum files must be between 1 and 10 for ${component.label || component.name || "the File Upload"}.`;
    }
    const layoutById = new Map(screen.components.filter((component) => ["SECTION","COLUMNS"].includes(component?.type) && component?.id).map((component) => [component.id, component]));
    for (const component of screen.components.filter((item) => item?.layoutParentId)) {
      const parent = layoutById.get(component.layoutParentId);
      if (!parent) return `Choose a valid layout container for ${component.label || component.name || "every component"}.`;
      if (parent.type === "COLUMNS") {
        const column = Number(component.layoutColumn || 1);
        const count = Math.max(2, Math.min(4, Number(parent.columnCount || 2)));
        if (!Number.isInteger(column) || column < 1 || column > count) return `Choose a valid column for ${component.label || component.name || "every component"}.`;
      }
    }
    if (screen.components.some((component) => component.type === "CUSTOM_COMPONENT" && (!component.registryKey || component.registryConfigError))) return "Complete every registered screen component configuration.";
    if (screen.components.some((component) => component.type === "PROGRESS" && !component.stageResource && !screen.currentStageResource)) return "Choose a Stage Resource for every Progress Indicator.";
    if (screen.components.some((component) => component.type === "IMAGE" && !String(component.source || "").trim())) return "Choose an image URL or Resource for every Image component.";
    if (screen.components.some((component) => component.type === "LINK" && !String(component.href || "").trim())) return "Choose a destination for every Link component.";
    if (screen.components.some((component) => component.minLength !== "" && component.maxLength !== "" && component.minLength !== undefined && component.maxLength !== undefined && Number(component.minLength) > Number(component.maxLength))) return "A component minimum length cannot be greater than its maximum length.";
    if (screen.components.some((component) => component.min !== "" && component.max !== "" && component.min !== undefined && component.max !== undefined && Number(component.min) > Number(component.max))) return "A numeric component minimum cannot be greater than its maximum.";
    if (screen.components.some((component) => component.step !== "" && component.step !== undefined && Number(component.step) <= 0)) return "Numeric component step values must be greater than zero.";
    if (config.showFooter === false) return "Show the footer so users have a supported way to continue the Screen Flow.";
    if (config.allowNext === false && config.allowFinish !== true) return "Enable Next or Finish so users can move forward from this screen.";
    if (config.allowNext !== false && !String(screen.nextLabel || "Next").trim()) return "Enter a Next button label.";
    if (config.allowBack !== false && !String(screen.backLabel || "Previous").trim()) return "Enter a Previous button label.";
    if (config.allowPause === true && !String(screen.pauseLabel || "Pause").trim()) return "Enter a Pause button label.";
    if (config.allowFinish === true && !String(screen.finishLabel || "Finish").trim()) return "Enter a Finish button label.";
  }
    if (step.type === "COLLECTION_FILTER") {
    if (!config.collection) return "Choose the collection to filter.";
    if (!Array.isArray(config.filters) || !config.filters.length) return "Add at least one filter condition.";
    if (config.filters.some((filter) => !String(filter?.field || "").trim())) return "Choose a field or item path for every filter.";
  }
  if (step.type === "COLLECTION_SORT") {
    if (!config.collection) return "Choose the collection to sort.";
    if (!String(config.sortField || "").trim()) return "Choose a field or item path to sort by.";
  }
  if (step.type === "TRANSFORM") {
    if (!config.collection) return "Choose a source Resource to transform.";
    if (!config.transformMappings || !Object.keys(config.transformMappings).length) return "Add at least one target mapping.";
  }
  if (step.type === "RECOMMENDATION_ASSIGNMENT") {
    if (!config.collection) return "Choose the source collection.";
    if (!config.recommendationMappings || !Object.keys(config.recommendationMappings).length) return "Map at least one recommendation field.";
  }
  if (step.type === "LIMIT_REPETITIONS") {
    if (!config.collection) return "Choose the recommendation collection.";
    if (!Array.isArray(config.repetitionReactions) || !config.repetitionReactions.length) return "Choose at least one response to limit.";
    if (!Number.isInteger(Number(config.repetitionCount)) || Number(config.repetitionCount) < 1) return "Enter a reaction count of 1 or greater.";
    if (!Number.isInteger(Number(config.repetitionDays)) || Number(config.repetitionDays) < 1) return "Enter a day window of 1 or greater.";
  }
  if (step.type === "RUN_AGENT") {
    if (!String(config.agentPrompt || "").trim()) return "Enter instructions or a prompt for the agent.";
    if (!config.agentOutputVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.agentOutputVariable))) return "Enter a valid output Variable API Name.";
  }
    if (step.type === "LOOP") {
    if (!config.collection) return "Choose the collection to loop through.";
    if (!config.itemVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.itemVariable))) return "The Loop Current Item resource could not be generated.";
    if (!Array.isArray(config.bodyBranch) || !config.bodyBranch.length) return "Add at least one element to the For Each Item path.";
  }
  if (step.type === "WAIT") {
    if (!Number(step.config?.durationSeconds || 0) && !step.config?.resumeAt) return "Enter a duration for Wait for Amount of Time.";
  }
  if (step.type === "WAIT_UNTIL_DATE") {
    if (!step.config?.resumeAt) return "Choose the date/time Resource to resume at.";
  }
  if (step.type === "WAIT_FOR_CONDITIONS") {
    if (!conditionIsValid(step.config?.waitCondition)) return "Complete the Wait for Conditions criteria.";
    if (!Number.isFinite(Number(step.config?.pollSeconds)) || Number(step.config?.pollSeconds) < 30) return "Condition checks must run every 30 seconds or longer.";
  }
  if (step.type === "CUSTOM_ERROR") {
    if (!String(step.config?.errorMessage || "").trim()) return "Enter the custom error message.";
  }
    if (step.type === "BULK_UPDATE_RECORDS") {
    if (!config.object) return "Choose the target object.";
    if (!config.recordIds) return "Choose the record collection.";
    if (!config.fieldMappings || !Object.keys(config.fieldMappings).length) return "Map at least one field to update.";
  }
  if (step.type === "__ACTION__") return "Choose an action.";
  if (!["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(step.type) && config.resourceOnly !== true) {
    if (!config.apiName || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(String(config.apiName))) return "Enter a valid API Name.";
  }
  if (step.type === "ASSIGNMENT") {
    if (config.resourceOnly === true) {
      if (!config.variableName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.variableName))) return "Enter a valid variable API Name.";
      if (!config.variableType) return "Choose a variable data type.";
    } else {
      const assignments = Array.isArray(config.assignments) && config.assignments.length
        ? config.assignments
        : (config.variableName ? [{ variable: `variables.${config.variableName}`, variableType: config.variableType, operator: config.operator, value: config.value }] : []);
      if (!assignments.length) return "Add at least one assignment.";
      if (assignments.some((assignment) => !String(assignment?.variable || "").startsWith("variables."))) return "Choose a Variable for every assignment.";
      if (assignments.some((assignment) => !assignment?.operator)) return "Choose an operator for every assignment.";
    }
  }
  if (step.type === "CONDITION") {
    const outcomes = Array.isArray(config.outcomes) ? config.outcomes : [];
    if (outcomes.length) {
      if (outcomes.some((outcome) => !String(outcome?.label || "").trim())) return "Name every Decision outcome.";
      if (outcomes.some((outcome) => !conditionIsValid(outcome?.condition))) return "Complete every Decision outcome condition.";
      const apiNames = outcomes.map((outcome) => String(outcome?.apiName || flowApiName(outcome?.label || "")));
      if (apiNames.some((apiName) => !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(apiName))) return "Enter a valid API Name for every Decision outcome.";
      if (new Set(apiNames).size !== apiNames.length) return "Decision outcome API Names must be unique.";
      if (!String(config.defaultLabel || "Default Outcome").trim()) return "Name the Default Outcome.";
      const seenTargets = new Set();
      for (const outcome of outcomes) {
        for (const targetId of outcome?.branch || []) {
          if (seenTargets.has(String(targetId))) return "A step can only belong to one Decision outcome.";
          seenTargets.add(String(targetId));
        }
      }
      for (const targetId of config.defaultBranch || []) {
        if (seenTargets.has(String(targetId))) return "A step cannot belong to both an outcome and Default.";
        seenTargets.add(String(targetId));
      }
      return "";
    }
    return conditionIsValid(config.condition) ? "" : "Complete the condition field/operator/value.";
  }
  if ((RECORD_ACTION_TYPES.has(step.type) || step.type === "GET_RECORDS") && !config.object && !["UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(step.type)) return "Choose the target object.";
  if (step.type === "GET_RECORDS") {
    const filters = Array.isArray(config.filters) ? config.filters : [];
    if (filters.some((filter) => !String(filter?.field || "").trim())) return "Choose a field for every Get Records filter.";
    if (filters.some((filter) => !["equals","not_equals","greater_than","greater_than_or_equal","less_than","less_than_or_equal","contains","is_empty","is_not_empty"].includes(String(filter?.operator || "equals")))) return "Choose a valid operator for every Get Records filter.";
    if (filters.some((filter) => !["is_empty","is_not_empty"].includes(filter?.operator) && (filter?.value === undefined || filter?.value === null || filter?.value === ""))) return "Enter a value or Resource for every Get Records filter.";
    if ((config.store || "first") === "all" && (!Number.isFinite(Number(config.limit)) || Number(config.limit) < 1 || Number(config.limit) > 200)) return "Get Records maximum records must be between 1 and 200.";
  }
  if (["CREATE_RECORD","UPDATE_RECORD"].includes(step.type) && (!config.fieldMappings || !Object.keys(config.fieldMappings).length)) return "Map at least one field.";
  if (["UPDATE_RECORD","DELETE_RECORD"].includes(step.type) && !config.recordId) return "Choose the record to update or delete.";
  if (["UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(step.type) && !config.relationshipKey) return "Choose a relationship.";
  if (step.type === "UPDATE_RELATED_RECORD" && !config.recordId) return "Choose the related record to update.";
  if (step.type === "CREATE_RELATED_RECORD" && (!config.fieldMappings || !Object.keys(config.fieldMappings).length)) return "Map at least one field for the related record.";
  if (["ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(step.type) && !(config.relatedRecordId || config.recordId)) return "Choose the related record.";
  if (["EMAIL_ALERT","SEND_EMAIL","SEND_EMAIL_BREVO","SEND_EMAIL_MAILJET","SEND_SMS","SEND_WHATSAPP"].includes(step.type)) {
    if (!config.recipient) return "Choose a recipient.";
    const emailAction = ["EMAIL_ALERT","SEND_EMAIL","SEND_EMAIL_BREVO","SEND_EMAIL_MAILJET"].includes(step.type);
    if (emailAction) {
      const templateMode = step.type === "EMAIL_ALERT" || (config.contentMode || "TEMPLATE") === "TEMPLATE";
      if (templateMode && !config.templateId && !config.template) return "Choose a message template.";
      if (!templateMode && (!String(config.subject || "").trim() || !String(config.body || config.text || config.message || "").trim())) {
        return "Add an email subject and message body.";
      }
    } else {
      const templateMode = (config.contentMode || "CUSTOM") === "TEMPLATE";
      if (templateMode && !config.templateId && !config.template) return "Choose a message template.";
      if (!templateMode && !String(config.body || config.text || config.message || "").trim()) return "Add a message body.";
    }
  }
  if (step.type === "IN_APP_NOTIFICATION" && (!config.title || !config.message || !config.recipient)) {
    return "Add title, message and recipient.";
  }
  if (step.type === "CALL_FUNCTION" && !config.functionKey) return "Choose a registered function.";
  if (step.type === "RUN_SUBFLOW") {
    if (!config.workflowId) return "Choose a subflow.";
    const selectedSubflow = availableWorkflows?.find?.((item) => String(item.id) === String(config.workflowId));
    const requiredInputs = (Array.isArray(selectedSubflow?.inputContract) ? selectedSubflow.inputContract : []).filter((input) => input.required === true);
    if (requiredInputs.some((input) => config.workflowInputs?.[input.name] === undefined || config.workflowInputs?.[input.name] === null || config.workflowInputs?.[input.name] === "")) return "Map every required subflow input.";
  }
  if (["WEBHOOK","CALL_WEBHOOK","HTTP_REQUEST"].includes(step.type)) {
    const requestUrl = String(config.url || config.endpoint || "").trim();
    if (!requestUrl) return "Enter the request URL.";
    if (!/^https:\/\//i.test(requestUrl)) return "Use an HTTPS request URL.";
  }
  if (step.type === "SCHEDULE_PATH") {
    if (!String(config.pathLabel || "").trim()) return "Name the Scheduled Path.";
    if (!Array.isArray(config.branch) || !config.branch.length) return "Choose at least one step for the Scheduled Path.";
    if ((config.scheduleMode || "OFFSET") === "OFFSET" && (!Number.isFinite(Number(config.delayAmount)) || Number(config.delayAmount) < 0)) return "Enter a valid Scheduled Path delay.";
    if ((config.scheduleMode || "OFFSET") === "AT_DATETIME" && !config.runAt) return "Choose the Scheduled Path date/time Resource.";
  }
  if (step.type === "WAIT" && !Number(config.durationSeconds || 0) && !config.resumeAt) return "Set a wait duration or resume time.";
  return "";
}

function FlowGuide({ steps, current, onSelect }) {
  return (
    <div className="one-flow-guide" aria-label="Flow builder progress">
      {steps.map((step, index) => (
        <button
          key={step.key}
          type="button"
          className={`one-flow-guide-step is-${step.status} ${current === step.key ? "is-current" : ""}`}
          onClick={() => onSelect(step.key)}
          title={step.message || step.label}
        >
          <span className="one-flow-guide-dot">
            {step.status === "complete" ? "✓" : step.status === "error" ? "!" : index + 1}
          </span>
          <span className="one-flow-guide-copy">
            <strong>{step.label}</strong>
            <small>{step.message || (step.status === "complete" ? "Complete" : "Not configured")}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function ProviderStatusPill({ available }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${available ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
      {available ? "Provider configured" : "Provider not configured"}
    </span>
  );
}

function StepConditionEditor({ value, onChange, objectKey, extraResources = [] }) {
  const config = value || { type: "all", rules: [blankCondition()] };
  const update = (patch) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Condition</span>
        <select aria-label="Condition Requirements" className={inputClass} value={config.type || "all"} onChange={(event) => update({ type: event.target.value })}>
          <option value="all">All Conditions Are Met (AND)</option>
          <option value="any">Any Condition Is Met (OR)</option>
          <option value="custom">Custom Condition Logic Is Met</option>
          <option value="formula">Formula Evaluates to True</option>
        </select>
      </div>
      {config.type === "custom" ? (
        <label className="block text-xs font-medium text-slate-600">Condition Logic
          <input className={inputClass} value={config.logic || ""} onChange={(event) => update({ logic: event.target.value })} placeholder="Example: 1 AND (2 OR 3)" />
        </label>
      ) : null}
      {config.type === "formula" ? (
        <label className="block text-xs font-medium text-slate-600">Formula
          <textarea className={inputClass} rows={4} value={config.formula || ""} onChange={(event) => update({ formula: event.target.value })} placeholder="Enter a formula that evaluates to true" />
        </label>
      ) : null}
      {config.type === "formula" ? null : (config.rules || []).map((rule, index) => (
        <div className="grid gap-2 md:grid-cols-[1.2fr_0.9fr_1fr_auto]" key={rule.id || index}>
          <PlatformFieldPicker objectKey={objectKey} value={rule.field || ""} label="Field" onChange={(field) => {
            const next = [...(config.rules || [])];
            next[index] = { ...rule, field };
            update({ rules: next });
          }} />
          <select className={inputClass} value={rule.operator || "equals"} onChange={(event) => {
            const next = [...(config.rules || [])];
            next[index] = { ...rule, operator: event.target.value };
            update({ rules: next });
          }}>
            <option value="equals">Equals</option>
            <option value="not_equals">Not equal</option>
            <option value="greater_than">Greater than</option>
            <option value="greater_than_or_equal">Greater than or equal</option>
            <option value="less_than">Less than</option>
            <option value="less_than_or_equal">Less than or equal</option>
            <option value="changed">Changed</option>
            <option value="changed_from">Changed from</option>
            <option value="changed_to">Changed to</option>
            <option value="changed_from_to">Changed from/to</option>
            <option value="is_empty">Is empty</option>
            <option value="is_not_empty">Is not empty</option>
          </select>
          {["is_empty","is_not_empty","changed"].includes(rule.operator) ? <div /> : rule.operator === "changed_from_to" ? (
            <div className="grid gap-2">
              <ResourceOrLiteralInput label="From" value={rule.value?.from ?? ""} onChange={(from) => {
                const next = [...(config.rules || [])];
                next[index] = { ...rule, value: { ...(rule.value && typeof rule.value === "object" ? rule.value : {}), from } };
                update({ rules: next });
              }} rootObjectKey={objectKey} extraResources={extraResources} />
              <ResourceOrLiteralInput label="To" value={rule.value?.to ?? ""} onChange={(to) => {
                const next = [...(config.rules || [])];
                next[index] = { ...rule, value: { ...(rule.value && typeof rule.value === "object" ? rule.value : {}), to } };
                update({ rules: next });
              }} rootObjectKey={objectKey} extraResources={extraResources} />
            </div>
          ) : (
            <ResourceOrLiteralInput label="Value" value={rule.value ?? ""} onChange={(value) => {
              const next = [...(config.rules || [])];
              next[index] = { ...rule, value };
              update({ rules: next });
            }} rootObjectKey={objectKey} extraResources={extraResources} />
          )}
          <button type="button" className="rounded border border-slate-200 px-2 text-sm text-slate-600" onClick={() => {
            const next = [...(config.rules || [])].filter((_, itemIndex) => itemIndex !== index);
            update({ rules: next.length ? next : [blankCondition()] });
          }}>Remove</button>
        </div>
      ))}
      {config.type === "formula" ? null : <button type="button" className="text-sm text-blue-700" onClick={() => update({ rules: [...(config.rules || []), blankCondition()] })}>+ Add Condition</button>}
    </div>
  );
}

function MappingEditor({ value = {}, onChange, rootObjectKey, extraResources = [], keyLabel = "Input", valueLabel = "Value" }) {
  const entries = Object.entries(value || {});
  const setEntry = (index, nextKey, nextValue) => {
    const next = {};
    entries.forEach(([key, currentValue], itemIndex) => {
      if (itemIndex === index) {
        if (nextKey) next[nextKey] = nextValue;
      } else if (key) next[key] = currentValue;
    });
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {entries.map(([key, currentValue], index) => (
        <div key={`${key}-${index}`} className="grid gap-2 md:grid-cols-[0.8fr_1.2fr_auto]">
          <input className={inputClass} value={key} onChange={(event) => setEntry(index, event.target.value, currentValue)} placeholder={keyLabel} />
          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label={valueLabel} value={String(currentValue ?? "")} onChange={(nextValue) => setEntry(index, key, nextValue)} />
          <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => {
            const next = Object.fromEntries(entries.filter((_, itemIndex) => itemIndex !== index));
            onChange(next);
          }}>Remove</button>
        </div>
      ))}
      <button type="button" className="text-sm text-blue-700" onClick={() => onChange({ ...(value || {}), [`input_${entries.length + 1}`]: "" })}>+ Add mapping</button>
    </div>
  );
}

function workflowStepResources(steps = [], currentIndex = 0, objectFieldCatalog = {}) {
  const resources = [
    { value: "variables.fault.message", label: "Fault → Error message", type: "fault" },
    { value: "variables.fault.title", label: "Fault → Problem", type: "fault" },
    { value: "variables.fault.howToFix", label: "Fault → How to fix", type: "fault" },
    { value: "variables.fault.actionType", label: "Fault → Failed action type", type: "fault" },
  ];
  const seenVariables = new Set();
  steps.slice(0, currentIndex).forEach((step, index) => {
    const label = step.label || getActionLabel(step.type) || `Step ${index + 1}`;
    const prefix = `steps.${step.id}`;
    if (step.type === "CONSTANT" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Constant · ${step.config.resourceType || "text"}`,
          type: step.config.resourceType || "constant",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Value`, type: step.config.resourceType || "element output" });
    } else if (step.type === "FORMULA" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Formula · ${step.config.resultType || "number"}`,
          type: step.config.resultType || "formula",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Result`, type: step.config.resultType || "element output" });
    } else if (["TEXT_TEMPLATE","INSTRUCTION_TEMPLATE"].includes(step.type) && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · ${step.type === "INSTRUCTION_TEMPLATE" ? "Instruction Template" : "Text Template"} · Text`,
          type: "text",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Text`, type: "text" });
    } else if (["CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET"].includes(step.type) && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · ${getActionLabel(step.type)}`,
          type: step.type === "CHOICE" ? "choice" : "choice_collection",
        });
        seenVariables.add(step.config.resourceName);
      }
    } else if (step.type === "STAGE" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Stage`,
          type: "stage",
        });
        seenVariables.add(step.config.resourceName);
      }
    } else if (step.type === "ASSIGNMENT" && step.config?.resourceOnly === true && step.config?.variableName) {
      if (!seenVariables.has(step.config.variableName)) {
        resources.push({
          value: `variables.${step.config.variableName}`,
          label: `${step.config.variableName} · Variable · ${step.config.variableType || "text"}`,
          type: step.config.variableType || "variable",
        });
        seenVariables.add(step.config.variableName);
      }
    } else if (step.type === "ASSIGNMENT") {
      resources.push({
        value: `${prefix}.value`,
        label: `${label} → Assigned Value`,
        type: "element output",
      });
    } else if (step.type === "SCREEN") {
      for (const component of step.config?.screen?.components || []) {
        if (!component?.name || component?.input === false) continue;
        resources.push({
          value: `variables.${component.name}`,
          label: `${label} → ${component.label || component.name}`,
          type: component.dataType || (["NUMBER","SLIDER"].includes(component.type) ? "number" : ["CHECKBOX","TOGGLE"].includes(component.type) ? "boolean" : ["CHECKBOX_GROUP","MULTI_SELECT","DATA_TABLE","FILE_UPLOAD"].includes(component.type) ? "collection" : "text"),
        });
      }
    } else if (step.type === "COLLECTION_FILTER") {
      resources.push(
        { value: `${prefix}.collection`, label: `${label} → Filtered Collection`, type: "collection" },
        { value: `${prefix}.count`, label: `${label} → Item Count`, type: "number" },
      );
    } else if (step.type === "COLLECTION_SORT") {
      resources.push(
        { value: `${prefix}.collection`, label: `${label} → Sorted Collection`, type: "collection" },
        { value: `${prefix}.count`, label: `${label} → Item Count`, type: "number" },
      );
    } else if (step.type === "TRANSFORM") {
      resources.push(
        { value: `${prefix}.value`, label: `${label} → Transformed Value`, type: "object" },
        { value: `${prefix}.collection`, label: `${label} → Transformed Collection`, type: "collection" },
      );
    } else if (step.type === "RECOMMENDATION_ASSIGNMENT") {
      const resourceName = step.config?.apiName || flowApiName(step.label || "Recommendations");
      resources.push(
        { value: `variables.${resourceName}`, label: `${resourceName} · Recommendation Collection`, type: "collection" },
        { value: `${prefix}.recommendations`, label: `${label} → Recommendations`, type: "collection" },
        { value: `${prefix}.count`, label: `${label} → Recommendation Count`, type: "number" },
      );
    } else if (step.type === "LIMIT_REPETITIONS") {
      resources.push(
        { value: `${prefix}.recommendations`, label: `${label} → Limited Recommendations`, type: "collection" },
        { value: `${prefix}.count`, label: `${label} → Recommendation Count`, type: "number" },
      );
    } else if (step.type === "RUN_AGENT") {
      if (step.config?.agentOutputVariable && !seenVariables.has(step.config.agentOutputVariable)) {
        resources.push({
          value: `variables.${step.config.agentOutputVariable}`,
          label: `${step.config.agentOutputVariable} · Agent Output`,
          type: "text",
        });
        seenVariables.add(step.config.agentOutputVariable);
      }
      resources.push({ value: `${prefix}.answer`, label: `${label} → Answer`, type: "text" });
    } else if (step.type === "LOOP" && step.config?.itemVariable) {
      resources.push(
        {
          value: `variables.${step.config.itemVariable}`,
          label: `Current Item from ${label}`,
          type: "record",
        },
        {
          value: `variables.${step.config.itemVariable}.id`,
          label: `Current Item from ${label} → Record ID`,
          type: "record id",
        },
        { value: `${prefix}.count`, label: `${label} → Iteration Count`, type: "number" },
      );
    } else if (step.type === "GET_RECORDS") {
      resources.push(
        { value: `${prefix}.record.id`, label: `${label} → First Record → Record ID`, type: "record id" },
        { value: `${prefix}.count`, label: `${label} → Record Count`, type: "number" },
        { value: `${prefix}.records`, label: `${label} → All Records`, type: "collection" },
      );
      for (const field of objectFieldCatalog?.[step.config?.object] || []) {
        if (!field?.apiName) continue;
        resources.push({
          value: `${prefix}.record.${field.apiName}`,
          label: `${label} → First Record → ${field.label || field.apiName}`,
          type: field.type || "field",
        });
      }
    } else if (step.type === "CREATE_RECORD") {
      resources.push({ value: `${prefix}.created.id`, label: `${label} → Created Record ID`, type: "element output" });
    } else if (step.type === "UPDATE_RECORD") {
      resources.push({ value: `${prefix}.updated.id`, label: `${label} → Updated Record ID`, type: "element output" });
    } else if (step.type === "RUN_SUBFLOW") {
      resources.push({ value: `${prefix}.runId`, label: `${label} → Child Run ID`, type: "element output" });
      for (const output of step.config?.declaredOutputs || []) {
        if (!output?.name) continue;
        resources.push({ value: `${prefix}.outputs.${output.name}`, label: `${label} → ${output.label || output.name}`, type: output.type || "subflow output" });
      }
    }
  });
  return resources;
}

function looksLikeWorkflowResource(value = "") {
  const text = String(value || "");
  return text.startsWith("$") || text.startsWith("steps.") || text.startsWith("variables.");
}

function ResourceOrLiteralInput({ label, value, onChange, rootObjectKey, extraResources = [], type = "string", required = false, allowResource = true }) {
  const [mode, setMode] = useState(() => looksLikeWorkflowResource(value) ? "resource" : "value");
  const numeric = type === "number" || type === "integer";
  const boolean = type === "boolean";
  const dateType = type === "date" ? "date" : type === "datetime" ? "datetime-local" : (numeric ? "number" : "text");
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600">{label}{required ? " *" : ""}</label>
        {allowResource ? <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          <button type="button" className={`rounded px-2 py-1 text-[10px] ${mode === "value" ? "bg-slate-100 text-slate-800" : "text-slate-500"}`} onClick={() => setMode("value")}>Value</button>
          <button type="button" className={`rounded px-2 py-1 text-[10px] ${mode === "resource" ? "bg-blue-50 text-blue-700" : "text-slate-500"}`} onClick={() => setMode("resource")}>Resource</button>
        </div> : null}
      </div>
      {allowResource && mode === "resource" ? (
        <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="" value={String(value ?? "")} onChange={onChange} />
      ) : boolean ? (
        <select className={inputClass} value={value === true ? "true" : value === false ? "false" : ""} onChange={(event) => onChange(event.target.value === "" ? "" : event.target.value === "true")}>
          <option value="">Select value</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : (
        <input
          className={inputClass}
          type={dateType}
          value={value ?? ""}
          onChange={(event) => onChange(numeric ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
        />
      )}
    </div>
  );
}

function SchemaActionEditor({ definition, config = {}, onChange, rootObjectKey, extraResources = [] }) {
  const schema = definition?.schema;
  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const entries = Object.entries(properties);
  if (!schema || schema.type !== "object" || !entries.length) {
    const hiddenKeys = new Set([
      "object","recordId","filters","match","sortField","sortDirection","store","limit",
      "fieldMappings","fieldValues","template","templateId","recipient","providerStatus",
      "functionKey","inputs","workflowId","workflowInputs","condition","ifBranch","elseBranch",
      "durationSeconds","resumeAt","reason","url","method","message","title","apiParameters"
    ]);
    const existingParameters = Object.fromEntries(Object.entries(config || {}).filter(([key, value]) => {
      if (hiddenKeys.has(key)) return false;
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && !value.length) return false;
      if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
      return true;
    }));
    const parameterValues = { ...existingParameters, ...(config.apiParameters || {}) };
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <strong className="text-xs text-slate-700">{definition?.label || definition?.value || "Registered action"}</strong>
          {definition?.description ? <p className="mt-1 text-xs text-slate-500">{definition.description}</p> : null}
          <p className="mt-2 text-[11px] text-slate-500">This action is available through the workflow API but does not publish a field schema yet. Configure the same request parameters here without writing JSON.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Action parameters</label>
          <MappingEditor
            value={parameterValues}
            onChange={(apiParameters) => onChange({ apiParameters })}
            rootObjectKey={rootObjectKey}
            extraResources={extraResources}
            keyLabel="API parameter"
            valueLabel="Value / resource"
          />
        </div>
      </div>
    );
  }

  const patch = (key, value) => onChange({ [key]: value });
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <strong className="text-xs text-slate-700">{definition.label || definition.value}</strong>
        {definition.description ? <p className="mt-1 text-xs text-slate-500">{definition.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {definition.capability ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">Capability: {definition.capability}</span> : null}
          {(definition.requiredPermissions || []).map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{permission}</span>)}
          {definition.requiredEntitlement ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Licence: {definition.requiredEntitlement}</span> : null}
        </div>
      </div>
      {entries.map(([key, property]) => {
        const fieldLabel = property.title || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
        const value = config?.[key];
        if (Array.isArray(property.enum)) {
          return (
            <label key={key} className="block space-y-1 text-xs font-medium text-slate-600">
              <span>{fieldLabel}{required.has(key) ? " *" : ""}</span>
              <select className={inputClass} value={value ?? ""} onChange={(event) => patch(key, event.target.value)}>
                <option value="">Select {fieldLabel.toLowerCase()}</option>
                {property.enum.map((option) => <option key={String(option)} value={option}>{String(option).replace(/_/g, " ")}</option>)}
              </select>
            </label>
          );
        }
        if (property.type === "boolean") {
          return (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              <input type="checkbox" checked={value === true} onChange={(event) => patch(key, event.target.checked)} />
              <span>{fieldLabel}{required.has(key) ? " *" : ""}</span>
            </label>
          );
        }
        if (property.type === "object") {
          return (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{fieldLabel}{required.has(key) ? " *" : ""}</label>
              <MappingEditor value={value && typeof value === "object" && !Array.isArray(value) ? value : {}} onChange={(next) => patch(key, next)} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Key" valueLabel="Value / resource" />
            </div>
          );
        }
        if (property.type === "array") {
          const values = Array.isArray(value) ? value : [];
          return (
            <div key={key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-600">{fieldLabel}{required.has(key) ? " *" : ""}</div>
              {values.map((item, itemIndex) => (
                <div key={itemIndex} className="grid grid-cols-[1fr_auto] gap-2">
                  <ResourceOrLiteralInput label={`Item ${itemIndex + 1}`} value={item} onChange={(nextValue) => {
                    const next = [...values]; next[itemIndex] = nextValue; patch(key, next);
                  }} rootObjectKey={rootObjectKey} extraResources={extraResources} type={property.items?.type || "string"} />
                  <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => patch(key, values.filter((_, index) => index !== itemIndex))}>Remove</button>
                </div>
              ))}
              <button type="button" className="text-sm text-blue-700" onClick={() => patch(key, [...values, ""])}>+ Add item</button>
            </div>
          );
        }
        return (
          <ResourceOrLiteralInput key={key} label={fieldLabel} value={value} onChange={(next) => patch(key, next)} rootObjectKey={rootObjectKey} extraResources={extraResources} type={property.type || "string"} required={required.has(key)} />
        );
      })}
    </div>
  );
}

function StepEditor({ step, index, allSteps = [], updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], platformComponents = [], rootObjectKey, scopeKey = null, debugInfo = null, objectFieldCatalog = {}, onDone, onCancel }) {
  const updateConfig = (patch) => updateStep(index, { config: { ...(step.config || {}), ...patch } });
  const [pendingOutcomeRemoval, setPendingOutcomeRemoval] = useState(null);
  const [relationshipOptions, setRelationshipOptions] = useState([]);
  const [expandedScreenComponentId, setExpandedScreenComponentId] = useState(null);
  useEffect(() => {
    setExpandedScreenComponentId(null);
  }, [step.id, step.type]);
  useEffect(() => {
    let live = true;
    if (!["UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(step.type)) return () => { live = false; };
    apiRequest("/api/platform/relationships")
      .then((response) => {
        if (!live) return;
        const rows = Array.isArray(response?.data) ? response.data : [];
        setRelationshipOptions(rows.filter((row) => !rootObjectKey || String(row.parent_object_key || "") === String(rootObjectKey)));
      })
      .catch(() => { if (live) setRelationshipOptions([]); });
    return () => { live = false; };
  }, [step.type, rootObjectKey]);
  const isVariableResource = step.type === "ASSIGNMENT" && step.config?.resourceOnly === true;
  const isResource = ["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(step.type) || isVariableResource;
  const [actionSearch, setActionSearch] = useState("");
  const actionPickerOptions = registryOptions.filter((option) => !SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["CONSTANT","FORMULA","TEXT_TEMPLATE","SCHEDULE_PATH","WHEN","STOP"].includes(option.value));
  const visibleActionPickerOptions = actionPickerOptions.filter((option) => !actionSearch.trim() || `${option.label || option.value} ${option.description || ""} ${option.category || workflowActionCategory(option.value)}`.toLowerCase().includes(actionSearch.trim().toLowerCase()));
  const actionPickerGroups = visibleActionPickerOptions.reduce((groups, option) => {
    const category = option.category || workflowActionCategory(option.value) || "Actions";
    if (!groups[category]) groups[category] = [];
    groups[category].push(option);
    return groups;
  }, {});
  const extraResources = workflowStepResources(allSteps, index, objectFieldCatalog);
  const variableResourceOptions = allSteps.slice(0, index)
    .filter((candidate) => candidate.type === "ASSIGNMENT" && candidate.config?.resourceOnly === true && candidate.config?.variableName)
    .map((candidate) => ({
      value: `variables.${candidate.config.variableName}`,
      label: candidate.config.variableName,
      type: candidate.config.variableType || "text",
    }));
  const registryDefinition = registryOptions.find((option) => option.value === step.type) || null;
  const updateFieldMapping = (key, value) => {
    const fieldMappings = { ...(step.config?.fieldMappings || {}) };
    fieldMappings[key] = value;
    updateConfig({ fieldMappings });
  };

  const renderConfig = () => {
    if (isVariableResource) {
      return (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">API Name</label>
            <input className={inputClass} value={step.config?.variableName || ""} onChange={(event) => updateConfig({ variableName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. followUpDate" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Data Type</label>
            <select className={inputClass} value={step.config?.variableType || "text"} onChange={(event) => updateConfig({ variableType: event.target.value, value: "" })}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="date">Date</option>
              <option value="datetime">Date / Time</option>
              <option value="record">Record</option>
              <option value="collection">Collection</option>
              <option value="object">Object</option>
            </select>
          </div>
          <ResourceOrLiteralInput label="Default Value" value={step.config?.value ?? ""} onChange={(value) => updateConfig({ value, operator: "set" })} rootObjectKey={rootObjectKey} extraResources={extraResources} type={step.config?.variableType || "text"} allowResource />
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.availableForInput === true} onChange={(event) => updateConfig({ availableForInput: event.target.checked })} /> Available for input</label>
          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.availableForOutput === true} onChange={(event) => updateConfig({ availableForOutput: event.target.checked })} /> Available for output</label>
        </div>
      );
    }
    switch (step.type) {
      case "__ACTION__":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Action</label>
              <div className="workflow-action-picker">
                <div className="workflow-action-picker-search">
                  <span>⌕</span>
                  <input value={actionSearch} onChange={(event) => setActionSearch(event.target.value)} placeholder="Search actions..." aria-label="Search actions" />
                </div>
                <div className="workflow-action-picker-scroll">
                  {Object.entries(actionPickerGroups).map(([category, options]) => (
                    <div key={category}>
                      <div className="workflow-palette-group-title">{category}</div>
                      {options.map((option) => {
                        const optionVisual = flowElementVisual(option.value);
                        return <button key={option.value} type="button" className="workflow-action-choice" onClick={() => {
                          const nextType = option.value;
                          const fresh = makeStep(nextType);
                          updateStep(index, { type: nextType, label: option.label || getActionLabel(nextType), config: { ...fresh.config, apiName: flowApiName(option.label || getActionLabel(nextType)) } });
                        }}>
                          <span className="workflow-palette-icon" style={{ background: optionVisual.color }}>{optionVisual.icon}</span>
                          <span><strong>{option.label || option.value}</strong>{option.description ? <small>{option.description}</small> : null}</span>
                        </button>;
                      })}
                    </div>
                  ))}
                  {!visibleActionPickerOptions.length ? <div className="workflow-palette-empty">No matching actions</div> : null}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Actions come from the OneEngine action registry, but they use the standard Flow Action element on the canvas.</p>
            </div>
          </div>
        );
      case "CONSTANT":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">API Name</label>
              <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. vatRate" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Data Type</label>
              <select className={inputClass} value={step.config?.resourceType || "text"} onChange={(event) => updateConfig({ resourceType: event.target.value, value: "" })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="datetime">Date / Time</option>
              </select>
            </div>
            <ResourceOrLiteralInput label="Value" value={step.config?.value ?? ""} onChange={(value) => updateConfig({ value })} rootObjectKey={rootObjectKey} extraResources={[]} type={step.config?.resourceType || "text"} required allowResource={false} />
            <p className="text-[11px] text-slate-500">Constants keep the same value for the flow run and are available as Resources.</p>
          </div>
        );
      case "FORMULA":
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">API Name</label>
                <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. totalWithTax" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Data Type</label>
                <select className={inputClass} value={step.config?.resultType || "number"} onChange={(event) => updateConfig({ resultType: event.target.value })}>
                  <option value="number">Number</option>
                  <option value="text">Text</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="datetime">Date / Time</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula Resources</label>
              <MappingEditor value={step.config?.formulaInputs || {}} onChange={(formulaInputs) => updateConfig({ formulaInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Reference Name" valueLabel="Resource" />
              <p className="mt-1 text-[11px] text-slate-500">Use simple names such as amount, tax or customerCount. Those names are what you use in the formula below.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula</label>
              <textarea className={inputClass} rows={4} value={step.config?.expression || ""} onChange={(event) => updateConfig({ expression: event.target.value })} placeholder="amount + tax" />
              <p className="mt-1 text-[11px] text-slate-500">Supported: + - * / %, comparisons, && / ||, IF, COALESCE, CONCAT, ROUND, ABS, MIN and MAX. JavaScript is never executed.</p>
            </div>
          </div>
        );
      case "TEXT_TEMPLATE":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">API Name</label>
              <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. welcomeMessage" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Body</label>
              <textarea className={inputClass} rows={8} value={step.config?.templateText || ""} onChange={(event) => updateConfig({ templateText: event.target.value })} placeholder={"Hello {!$Record.name},\n\nYour order is ready."} />
              <p className="mt-1 text-[11px] text-slate-500">Insert resources with Salesforce-style merge syntax, for example {!$Record.name}, {!$User.email} or {!variables.customerName}.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Text Templates are Resources. They do not appear as canvas elements and can be selected anywhere a Text Resource is accepted.
            </div>
          </div>
        );
      case "INSTRUCTION_TEMPLATE":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">API Name</label>
              <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. customerSummaryInstructions" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Instructions</label>
              <textarea className={inputClass} rows={8} value={step.config?.instructionText || ""} onChange={(event) => updateConfig({ instructionText: event.target.value })} placeholder="Summarise the request for {{customerName}} and return the next best action." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Named Inputs</label>
              <MappingEditor value={step.config?.instructionInputs || {}} onChange={(instructionInputs) => updateConfig({ instructionInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Input Name" valueLabel="Resource / Value" />
              <p className="mt-1 text-[11px] text-slate-500">Use {{inputName}} placeholders in the instructions. Each input can come from a Flow Resource or literal value.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              The resolved instruction becomes a normal Text Resource. It can feed Run Agent, messages, webhooks, or subflows without provider-specific branding.
            </div>
          </div>
        );
      case "CHOICE":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label>
            <label className="block text-xs font-medium text-slate-600">Choice Label<input className={inputClass} value={step.config?.choiceLabel || ""} onChange={(event) => updateConfig({ choiceLabel: event.target.value })} /></label>
            <ResourceOrLiteralInput label="Stored Value" value={step.config?.choiceValue ?? ""} onChange={(choiceValue) => updateConfig({ choiceValue })} rootObjectKey={rootObjectKey} extraResources={extraResources} />
            <label className="block text-xs font-medium text-slate-600">Data Type<select className={inputClass} value={step.config?.choiceDataType || "text"} onChange={(event) => updateConfig({ choiceDataType: event.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option></select></label>
          </div>
        );
      case "RECORD_CHOICE_SET": {
        const filters = Array.isArray(step.config?.filters) ? step.config.filters : [];
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label>
            <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, choiceLabelField: "", choiceValueField: "id", filters: [], sortField: "" })} />
            <div className="grid gap-2 md:grid-cols-2">
              <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={step.config?.choiceLabelField || ""} label="Choice Label Field" onChange={(choiceLabelField) => updateConfig({ choiceLabelField })} />
              <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={step.config?.choiceValueField || "id"} label="Choice Value Field" onChange={(choiceValueField) => updateConfig({ choiceValueField })} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Filter Records</strong>
                <select className={inputClass} value={step.config?.match || "all"} onChange={(event) => updateConfig({ match: event.target.value })}>
                  <option value="all">Match all conditions</option>
                  <option value="any">Match any condition</option>
                </select>
              </div>
              <div className="space-y-2">
                {filters.map((filter, index) => (
                  <div key={filter.id || index} className="grid gap-2 md:grid-cols-[1.1fr_.8fr_1fr_auto]">
                    <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={filter.field || ""} label={index === 0 ? "Field" : ""} onChange={(field) => {
                      const next = [...filters]; next[index] = { ...filter, field }; updateConfig({ filters: next });
                    }} />
                    <label className="block text-xs font-medium text-slate-600">{index === 0 ? "Operator" : ""}
                      <select className={inputClass} value={filter.operator || "equals"} onChange={(event) => {
                        const next = [...filters]; next[index] = { ...filter, operator: event.target.value }; updateConfig({ filters: next });
                      }}>
                        <option value="equals">Equals</option>
                        <option value="not_equals">Not equal</option>
                        <option value="greater_than">Greater than</option>
                        <option value="greater_than_or_equal">Greater than or equal</option>
                        <option value="less_than">Less than</option>
                        <option value="less_than_or_equal">Less than or equal</option>
                        <option value="contains">Contains</option>
                        <option value="is_empty">Is empty</option>
                        <option value="is_not_empty">Is not empty</option>
                      </select>
                    </label>
                    {["is_empty","is_not_empty"].includes(filter.operator) ? <div /> : <ResourceOrLiteralInput label={index === 0 ? "Value" : ""} value={filter.value ?? ""} onChange={(value) => {
                      const next = [...filters]; next[index] = { ...filter, value }; updateConfig({ filters: next });
                    }} rootObjectKey={rootObjectKey} extraResources={extraResources} />}
                    <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => updateConfig({ filters: filters.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
                  </div>
                ))}
                <button type="button" className="text-xs text-blue-700" onClick={() => updateConfig({ filters: [...filters, { id: Date.now() + Math.random(), field: "", operator: "equals", value: "" }] })}>+ Add filter</button>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={step.config?.sortField || ""} label="Sort Field (optional)" onChange={(sortField) => updateConfig({ sortField })} />
              <label className="block text-xs font-medium text-slate-600">Sort Direction
                <select className={inputClass} value={step.config?.sortDirection || "asc"} onChange={(event) => updateConfig({ sortDirection: event.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
              </label>
              <label className="block text-xs font-medium text-slate-600">Maximum Choices<input className={inputClass} type="number" min="1" max="200" value={Number(step.config?.limit || 50)} onChange={(event) => updateConfig({ limit: Math.max(1, Math.min(200, Number(event.target.value || 50))) })} /></label>
            </div>
          </div>
        );
      }
      case "PICKLIST_CHOICE_SET":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label>
            <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, fieldApiName: "" })} />
            <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={step.config?.fieldApiName || ""} label="Picklist Field" allowedFieldTypes={["picklist","select","multiselect"]} onChange={(fieldApiName) => updateConfig({ fieldApiName })} />
            <p className="text-[11px] text-slate-500">Only picklist-compatible fields are shown so the runtime and builder cannot disagree.</p>
          </div>
        );
      case "COLLECTION_CHOICE_SET":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label>
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection"))} label="Source Collection" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Label Path<input className={inputClass} value={step.config?.choiceLabelPath || ""} onChange={(event) => updateConfig({ choiceLabelPath: event.target.value })} placeholder="name" /></label>
              <label className="block text-xs font-medium text-slate-600">Value Path<input className={inputClass} value={step.config?.choiceValuePath || ""} onChange={(event) => updateConfig({ choiceValuePath: event.target.value })} placeholder="id" /></label>
            </div>
          </div>
        );
      case "STAGE":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label>
            <label className="block text-xs font-medium text-slate-600">Stage Label<input className={inputClass} value={step.config?.stageLabel || ""} onChange={(event) => updateConfig({ stageLabel: event.target.value })} /></label>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Stage Value<input className={inputClass} value={step.config?.stageValue || ""} onChange={(event) => updateConfig({ stageValue: event.target.value })} placeholder="qualification" /></label>
              <label className="block text-xs font-medium text-slate-600">Order<input className={inputClass} type="number" min="1" value={Number(step.config?.stageOrder || 1)} onChange={(event) => updateConfig({ stageOrder: Math.max(1, Number(event.target.value || 1)) })} /></label>
            </div>
            <label className="block text-xs font-medium text-slate-600">Description<textarea className={inputClass} rows={2} value={step.config?.description || ""} onChange={(event) => updateConfig({ description: event.target.value })} placeholder="Explain what this stage means to the user." /></label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.stageActive !== false} onChange={(event) => updateConfig({ stageActive: event.target.checked })} /> Active by default</label>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Stage resources can drive a Screen Progress Indicator or be selected as the Screen's current stage resource.</div>
          </div>
        );
      case "RECOMMENDATION_ASSIGNMENT": {
        const mappings = step.config?.recommendationMappings || {};
        const fields = [
          ["name","Name"],
          ["description","Description"],
          ["actionReference","Action Reference"],
          ["acceptanceLabel","Acceptance Label"],
          ["rejectionLabel","Rejection Label"],
          ["imageUrl","Image URL"],
        ];
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection"))} label="Source Collection" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Recommendation Fields</div>
              <div className="space-y-2">
                {fields.map(([key, label]) => <div key={key}>
                  <ResourceOrLiteralInput label={label} value={mappings[key] ?? ""} onChange={(value) => updateConfig({ recommendationMappings: { ...mappings, [key]: value } })} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                </div>)}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">To map from each source item, enter item.fieldName. Other Flow resources and literal values are also supported.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Output collection: <strong>{step.config?.apiName || flowApiName(step.label || "Recommendations")}</strong>
            </div>
          </div>
        );
      }
      case "LIMIT_REPETITIONS":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".recommendations") || String(resource.value || "").endsWith(".collection"))} label="Recommendation Collection" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Limit after these responses</div>
              <div className="flex gap-4">
                {["ACCEPTED","REJECTED"].map((reaction) => <label key={reaction} className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={(step.config?.repetitionReactions || []).includes(reaction)} onChange={(event) => {
                  const current = step.config?.repetitionReactions || [];
                  updateConfig({ repetitionReactions: event.target.checked ? [...new Set([...current, reaction])] : current.filter((item) => item !== reaction) });
                }} /> {reaction === "ACCEPTED" ? "Accepted" : "Rejected"}</label>)}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Number of Responses
                <input className={inputClass} type="number" min="1" value={Number(step.config?.repetitionCount || 1)} onChange={(event) => updateConfig({ repetitionCount: Math.max(1, Number(event.target.value || 1)) })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">Look Within This Many Days
                <input className={inputClass} type="number" min="1" value={Number(step.config?.repetitionDays || 30)} onChange={(event) => updateConfig({ repetitionDays: Math.max(1, Number(event.target.value || 1)) })} />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">Scope
              <select className={inputClass} value={step.config?.repetitionScope || "USER_OR_RECORD"} onChange={(event) => updateConfig({ repetitionScope: event.target.value })}>
                <option value="USER_OR_RECORD">Same user or same record</option>
                <option value="USER">Same user</option>
                <option value="RECORD">Same record</option>
              </select>
            </label>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Recommendations whose response count reaches the limit are removed from the output collection for the configured day window.</div>
          </div>
        );
      case "RUN_AGENT":
        return (
          <div className="space-y-3">
            <ResourceOrLiteralInput
              label="Prompt / Instructions"
              value={step.config?.agentPrompt || ""}
              onChange={(agentPrompt) => updateConfig({ agentPrompt })}
              rootObjectKey={rootObjectKey}
              extraResources={extraResources}
              required
            />
            <label className="block text-xs font-medium text-slate-600">Output Variable API Name
              <input className={inputClass} value={step.config?.agentOutputVariable || "agentResponse"} onChange={(event) => updateConfig({ agentOutputVariable: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Agent Context</label>
              <MappingEditor value={step.config?.agentContext || {}} onChange={(agentContext) => updateConfig({ agentContext })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Context Name" valueLabel="Resource" />
              <p className="mt-1 text-[11px] text-slate-500">Context is resolved from Flow resources before the agent runs. Credentials and unrestricted database access are never passed to the model.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Runs the configured OneEngine AI service and stores the answer in <strong>{step.config?.agentOutputVariable || "agentResponse"}</strong>.
            </div>
          </div>
        );
      case "SCREEN": {
        const screen = step.config?.screen || { label: "Screen", apiName: "Screen", components: [] };
        const components = Array.isArray(screen.components) ? screen.components : [];
        const layoutContainers = components.filter((component) => ["SECTION", "COLUMNS"].includes(component?.type) && component?.id);
        const updateScreen = (patch) => updateConfig({ screen: { ...screen, ...patch } });
        const updateComponent = (componentIndex, patch) => {
          const next = [...components];
          next[componentIndex] = { ...next[componentIndex], ...patch };
          updateScreen({ components: next });
        };
        const componentKey = (component, componentIndex) => String(component?.id || `legacy-screen-component-${componentIndex}`);
        const uniqueComponentName = (baseName, excludingIndex = -1) => {
          const existing = new Set(components.filter((_, i) => i !== excludingIndex).map((item) => String(item?.name || "").toLowerCase()).filter(Boolean));
          const normalizedBase = flowApiName(baseName || "Component") || "Component";
          let candidate = normalizedBase;
          let suffix = 2;
          while (existing.has(candidate.toLowerCase())) candidate = `${normalizedBase}_${suffix++}`;
          return candidate;
        };
        const addComponent = (type) => {
          const definition = SCREEN_COMPONENT_TYPES.find((item) => item.value === type) || { value: type, label: type };
          const number = components.filter((component) => component.type === type).length + 1;
          const name = flowApiName(`${definition.label}_${number}`);
          const component = {
            id: `screen-component-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type,
            label: definition.label,
            name: definition.input === false ? "" : name,
            input: definition.input !== false,
            required: false,
            defaultValue: "",
            helpText: "",
            placeholder: "",
            options: ["RADIO","CHECKBOX_GROUP","SELECT","MULTI_SELECT"].includes(type) ? [{ label: "Option 1", value: "option_1" }] : [],
            visible: true,
            visibility: null,
            width: "full",
          };
          updateScreen({ components: [...components, component] });
          setExpandedScreenComponentId(component.id);
        };
        const duplicateComponent = (componentIndex) => {
          const source = components[componentIndex];
          if (!source) return;
          const id = `screen-component-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const label = `${source.label || SCREEN_COMPONENT_TYPES.find((item) => item.value === source.type)?.label || "Component"} Copy`;
          const clone = {
            ...source,
            id,
            label,
            options: Array.isArray(source.options) ? source.options.map((option) => ({ ...option })) : source.options,
            visibility: source.visibility && typeof source.visibility === "object" ? { ...source.visibility } : source.visibility,
          };
          if (source.input !== false) clone.name = uniqueComponentName(`${source.name || flowApiName(label) || "Component"}_Copy`);
          const next = [...components];
          next.splice(componentIndex + 1, 0, clone);
          updateScreen({ components: next });
          setExpandedScreenComponentId(id);
        };
        return (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Screen Label
                <input className={inputClass} value={screen.label || ""} onChange={(event) => {
                  const label = event.target.value;
                  const previousGenerated = flowApiName(screen.label || "");
                  updateScreen({ label, apiName: !screen.apiName || screen.apiName === previousGenerated ? flowApiName(label) : screen.apiName });
                }} />
              </label>
              <label className="block text-xs font-medium text-slate-600">Screen API Name
                <input className={inputClass} value={screen.apiName || ""} onChange={(event) => updateScreen({ apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">Description
              <textarea className={inputClass} rows={2} value={screen.description || ""} onChange={(event) => updateScreen({ description: event.target.value })} />
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Screen Properties</div>
              <div className="grid gap-2 md:grid-cols-5">
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={screen.showHeader !== false} onChange={(event) => updateScreen({ showHeader: event.target.checked })} /> Show header</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.allowBack !== false} onChange={(event) => updateConfig({ allowBack: event.target.checked })} /> Allow Previous</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.allowNext !== false} onChange={(event) => updateConfig({ allowNext: event.target.checked })} /> Allow Next</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.allowFinish === true} onChange={(event) => updateConfig({ allowFinish: event.target.checked })} /> Allow Finish</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.allowPause === true} onChange={(event) => updateConfig({ allowPause: event.target.checked })} /> Allow Pause</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={step.config?.showFooter !== false} onChange={(event) => updateConfig({ showFooter: event.target.checked })} /> Show footer</label>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label className={`block text-xs font-medium ${step.config?.allowNext === false ? "text-slate-400" : "text-slate-600"}`}>Next Label<input className={inputClass} disabled={step.config?.allowNext === false} value={screen.nextLabel || "Next"} onChange={(event) => updateScreen({ nextLabel: event.target.value })} /></label>
              <label className={`block text-xs font-medium ${step.config?.allowBack === false ? "text-slate-400" : "text-slate-600"}`}>Previous Label<input className={inputClass} disabled={step.config?.allowBack === false} value={screen.backLabel || "Previous"} onChange={(event) => updateScreen({ backLabel: event.target.value })} /></label>
              <label className={`block text-xs font-medium ${step.config?.allowPause !== true ? "text-slate-400" : "text-slate-600"}`}>Pause Label<input className={inputClass} disabled={step.config?.allowPause !== true} value={screen.pauseLabel || "Pause"} onChange={(event) => updateScreen({ pauseLabel: event.target.value })} /></label>
              <label className={`block text-xs font-medium ${step.config?.allowFinish !== true ? "text-slate-400" : "text-slate-600"}`}>Finish Label<input className={inputClass} disabled={step.config?.allowFinish !== true} value={screen.finishLabel || "Finish"} onChange={(event) => updateScreen({ finishLabel: event.target.value })} /></label>
            </div>
            <div className="text-[11px] leading-5 text-slate-500">Previous is shown only when the runtime has a screen to return to. Keep Next enabled for normal progression; use Finish only when the user may end the flow from this screen.</div>
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "stage")} label="Current Stage Resource (optional)" value={screen.currentStageResource || ""} onChange={(currentStageResource) => updateScreen({ currentStageResource })} />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <strong className="text-xs text-slate-700">Screen Components</strong>
                  <div className="text-[11px] text-slate-500">Choose a component from the palette, then configure it below.</div>
                </div>
              </div>
              <details className="mb-3 rounded-lg border border-slate-200 bg-white p-2">
                <summary className="cursor-pointer text-xs font-semibold text-blue-700">+ Add Component</summary>
                <div className="mt-2 space-y-3">
                  {SCREEN_COMPONENT_GROUPS.map((group) => (
                    <div key={group}>
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group}</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {SCREEN_COMPONENT_TYPES.filter((item) => (item.group || "Input") === group).map((item) => (
                          <button key={item.value} type="button" className="rounded-lg border border-slate-200 bg-white p-2 text-left hover:border-blue-300 hover:bg-blue-50" onClick={() => addComponent(item.value)}>
                            <strong className="block text-xs text-slate-700">{item.label}</strong>
                            <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{item.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
              <div className="space-y-2">
                {components.map((component, componentIndex) => (
                  <details
                    key={component.id || componentIndex}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                    open={expandedScreenComponentId === componentKey(component, componentIndex) || (expandedScreenComponentId === null && componentIndex === 0)}
                    onToggle={(event) => {
                      const key = componentKey(component, componentIndex);
                      if (event.currentTarget.open) setExpandedScreenComponentId(key);
                      else if (expandedScreenComponentId === key || (expandedScreenComponentId === null && componentIndex === 0)) setExpandedScreenComponentId("__none__");
                    }}
                  >
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">{component.label || component.type} <span className="text-slate-400">· {SCREEN_COMPONENT_TYPES.find((item) => item.value === component.type)?.label || component.type}</span></summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-600">Label<input className={inputClass} value={component.label || ""} onChange={(event) => {
                          const label = event.target.value;
                          const previousGenerated = flowApiName(component.label || "");
                          const patch = { label };
                          if (component.input !== false && (!component.name || component.name === previousGenerated)) patch.name = uniqueComponentName(label, componentIndex);
                          updateComponent(componentIndex, patch);
                        }} /></label>
                        {component.input !== false ? <label className="block text-xs font-medium text-slate-600">API Name<input className={inputClass} value={component.name || ""} onChange={(event) => updateComponent(componentIndex, { name: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></label> : <div />}
                      </div>
                      {component.type === "DISPLAY_TEXT" ? (
                        <label className="block text-xs font-medium text-slate-600">Content<textarea className={inputClass} rows={4} value={component.text || ""} onChange={(event) => updateComponent(componentIndex, { text: event.target.value })} /></label>
                      ) : null}
                      {component.type === "IMAGE" ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <ResourceOrLiteralInput label="Image URL / Resource" value={component.source || ""} onChange={(source) => updateComponent(componentIndex, { source })} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                          <label className="block text-xs font-medium text-slate-600">Alternative Text<input className={inputClass} value={component.altText || ""} onChange={(event) => updateComponent(componentIndex, { altText: event.target.value })} /></label>
                        </div>
                      ) : null}
                      {component.type === "LINK" ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <ResourceOrLiteralInput label="Destination URL / Resource" value={component.href || ""} onChange={(href) => updateComponent(componentIndex, { href })} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                          <label className="block text-xs font-medium text-slate-600">Open Link
                            <select className={inputClass} value={component.linkTarget || "same"} onChange={(event) => updateComponent(componentIndex, { linkTarget: event.target.value })}><option value="same">In the same view</option><option value="new">In a new tab</option></select>
                          </label>
                        </div>
                      ) : null}
                      {component.type === "SECTION" ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">Heading<input className={inputClass} value={component.heading || component.label || ""} onChange={(event) => updateComponent(componentIndex, { heading: event.target.value })} /></label>
                          <label className="flex items-end gap-2 pb-2 text-xs text-slate-600"><input type="checkbox" checked={component.collapsible === true} onChange={(event) => updateComponent(componentIndex, { collapsible: event.target.checked })} /> Collapsible section</label>
                          <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">{components.filter((item) => item?.layoutParentId === component.id).length} component{components.filter((item) => item?.layoutParentId === component.id).length === 1 ? "" : "s"} assigned. Use each component’s <strong>Layout container</strong> setting to place content inside this section.</div>
                        </div>
                      ) : null}
                      {component.type === "COLUMNS" ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">Columns
                            <select className={inputClass} value={String(component.columnCount || 2)} onChange={(event) => {
                              const columnCount = Number(event.target.value);
                              const next = components.map((item, itemIndex) => {
                                if (itemIndex === componentIndex) return { ...item, columnCount };
                                if (item?.layoutParentId === component.id) return { ...item, layoutColumn: Math.max(1, Math.min(columnCount, Number(item.layoutColumn || 1))) };
                                return item;
                              });
                              updateScreen({ components: next });
                            }}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select>
                          </label>
                          <label className="block text-xs font-medium text-slate-600">Gap
                            <select className={inputClass} value={component.columnGap || "normal"} onChange={(event) => updateComponent(componentIndex, { columnGap: event.target.value })}><option value="compact">Compact</option><option value="normal">Normal</option><option value="wide">Wide</option></select>
                          </label>
                          <div className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">{components.filter((item) => item?.layoutParentId === component.id).length} component{components.filter((item) => item?.layoutParentId === component.id).length === 1 ? "" : "s"} assigned. Assign a component to this Columns layout, then choose its target column.</div>
                        </div>
                      ) : null}
                      {component.type === "RECORD_PICKER" ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={component.objectKey || ""} onObjectChange={(objectKey) => updateComponent(componentIndex, { objectKey })} />
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="block text-xs font-medium text-slate-600">Minimum characters before search
                              <input className={inputClass} type="number" min="1" max="5" value={Number(component.searchMinChars ?? 2)} onChange={(event) => updateComponent(componentIndex, { searchMinChars: Math.max(1, Math.min(5, Number(event.target.value || 2))) })} />
                            </label>
                            <label className="block text-xs font-medium text-slate-600">No results message
                              <input className={inputClass} value={component.noResultsMessage || "No matching records"} onChange={(event) => updateComponent(componentIndex, { noResultsMessage: event.target.value })} />
                            </label>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={component.allowClear !== false} onChange={(event) => updateComponent(componentIndex, { allowClear: event.target.checked })} /> Allow user to clear the selected record</label>
                          <p className="text-[11px] text-slate-500">Search results respect the signed-in user’s object permissions and company/store scope. The selected record ID is stored in this component’s API Name.</p>
                        </div>
                      ) : null}
                      {component.type === "DATA_TABLE" ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection"))} label="Row Collection" value={component.dataResource || ""} onChange={(dataResource) => updateComponent(componentIndex, { dataResource })} />
                          <label className="block text-xs font-medium text-slate-600">Columns (comma-separated field paths)
                            <input className={inputClass} value={(component.columns || []).join(", ")} onChange={(event) => updateComponent(componentIndex, { columns: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="name, status, total" />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">Selection Mode
                            <select className={inputClass} value={component.selectionMode || "multiple"} onChange={(event) => {
                              const selectionMode = event.target.value;
                              updateComponent(componentIndex, { selectionMode, ...(selectionMode === "none" ? { required: false } : {}) });
                            }}><option value="none">Display only</option><option value="single">Single row</option><option value="multiple">Multiple rows</option></select>
                          </label>
                          <p className="text-[11px] text-slate-500">Selected row IDs are stored in this component’s API Name. Display-only tables do not produce a selection value.</p>
                        </div>
                      ) : null}
                      {component.type === "FILE_UPLOAD" ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={component.fileObjectKey || rootObjectKey || ""} onObjectChange={(fileObjectKey) => updateComponent(componentIndex, { fileObjectKey })} />
                          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Target Record Resource (optional)" value={component.fileRecordResource || ""} onChange={(fileRecordResource) => updateComponent(componentIndex, { fileRecordResource })} />
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="block text-xs font-medium text-slate-600">Accepted file types<input className={inputClass} value={(component.acceptedTypes || []).join(", ")} onChange={(event) => updateComponent(componentIndex, { acceptedTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="image/*, application/pdf" /></label>
                            <label className="block text-xs font-medium text-slate-600">Maximum files<input className={inputClass} type="number" min="1" max="10" value={Number(component.maxFiles || 1)} onChange={(event) => updateComponent(componentIndex, { maxFiles: Math.max(1, Math.min(10, Number(event.target.value || 1))) })} /></label>
                          </div>
                          <label className="block text-xs font-medium text-slate-600">File Category<input className={inputClass} value={component.fileCategory || ""} onChange={(event) => updateComponent(componentIndex, { fileCategory: event.target.value })} /></label>
                          <p className="text-[11px] text-slate-500">If Target Record is blank, files attach to the record that started the flow.</p>
                        </div>
                      ) : null}
                      {component.type === "PROGRESS" ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "stage")} label="Stage Resource" value={component.stageResource || screen.currentStageResource || ""} onChange={(stageResource) => updateComponent(componentIndex, { stageResource })} />
                          <label className="block text-xs font-medium text-slate-600">Display Style
                            <select className={inputClass} value={component.progressStyle || "path"} onChange={(event) => updateComponent(componentIndex, { progressStyle: event.target.value })}>
                              <option value="path">Stage path</option>
                              <option value="bar">Progress bar</option>
                              <option value="compact">Compact status</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={component.showStageLabels !== false} onChange={(event) => updateComponent(componentIndex, { showStageLabels: event.target.checked })} /> Show stage labels</label>
                        </div>
                      ) : null}
                      {component.type === "CUSTOM_COMPONENT" ? (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <label className="block text-xs font-medium text-slate-600">Registered Component
                            <select className={inputClass} value={component.registryKey || ""} onChange={(event) => {
                              const registryKey = event.target.value;
                              const definition = platformComponents.find((item) => item.key === registryKey);
                              updateComponent(componentIndex, { registryKey, registryConfig: {}, label: definition?.label || component.label });
                            }}>
                              <option value="">Select component</option>
                              {platformComponents.filter((item) => item.flowScreenSupported === true && !item.reserved).map((item) => <option key={item.key} value={item.key}>{item.label} · {item.category || item.kind || "component"}</option>)}
                            </select>
                          </label>
                          {component.registryKey ? <label className="block text-xs font-medium text-slate-600">Component Configuration (JSON)
                            <textarea className={inputClass} rows={5} value={JSON.stringify(component.registryConfig || {}, null, 2)} onChange={(event) => {
                              try { updateComponent(componentIndex, { registryConfig: JSON.parse(event.target.value || "{}"), registryConfigError: "" }); }
                              catch { updateComponent(componentIndex, { registryConfigError: "Enter valid JSON." }); }
                            }} />
                            {component.registryConfigError ? <span className="mt-1 block text-[11px] text-red-600">{component.registryConfigError}</span> : null}
                          </label> : null}
                          <p className="text-[11px] text-slate-500">Uses the canonical OneEngine component registry. No Salesforce Lightning/Aura component branding is copied.</p>
                        </div>
                      ) : null}
                      {component.input !== false ? <>
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">Default Value<input className={inputClass} value={component.defaultValue ?? ""} onChange={(event) => updateComponent(componentIndex, { defaultValue: event.target.value })} /></label>
                          <label className="block text-xs font-medium text-slate-600">Placeholder<input className={inputClass} value={component.placeholder || ""} onChange={(event) => updateComponent(componentIndex, { placeholder: event.target.value })} /></label>
                        </div>
                        {["TEXT","TEXT_AREA","EMAIL","PASSWORD"].includes(component.type) ? <div className="grid gap-2 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">Minimum Length<input className={inputClass} type="number" min="0" value={component.minLength ?? ""} onChange={(event) => updateComponent(componentIndex, { minLength: event.target.value === "" ? "" : Math.max(0, Number(event.target.value)) })} /></label>
                          <label className="block text-xs font-medium text-slate-600">Maximum Length<input className={inputClass} type="number" min="1" value={component.maxLength ?? ""} onChange={(event) => updateComponent(componentIndex, { maxLength: event.target.value === "" ? "" : Math.max(1, Number(event.target.value)) })} /></label>
                        </div> : null}
                        {["NUMBER","SLIDER"].includes(component.type) ? <div className="grid gap-2 md:grid-cols-3">
                          <label className="block text-xs font-medium text-slate-600">Minimum<input className={inputClass} type="number" value={component.min ?? ""} onChange={(event) => updateComponent(componentIndex, { min: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
                          <label className="block text-xs font-medium text-slate-600">Maximum<input className={inputClass} type="number" value={component.max ?? ""} onChange={(event) => updateComponent(componentIndex, { max: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
                          <label className="block text-xs font-medium text-slate-600">Step<input className={inputClass} type="number" min="0.000001" step="any" value={component.step ?? ""} onChange={(event) => updateComponent(componentIndex, { step: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
                        </div> : null}
                        <label className="block text-xs font-medium text-slate-600">Help Text<input className={inputClass} value={component.helpText || ""} onChange={(event) => updateComponent(componentIndex, { helpText: event.target.value })} /></label>
                        <div className="grid gap-2 md:grid-cols-2">
                          <label className="block text-xs font-medium text-slate-600">Validate Input Formula
                            <input className={inputClass} value={component.validationFormula || ""} onChange={(event) => updateComponent(componentIndex, { validationFormula: event.target.value })} placeholder="age >= 18" />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">Validation Error Message
                            <input className={inputClass} value={component.validationMessage || ""} onChange={(event) => updateComponent(componentIndex, { validationMessage: event.target.value })} placeholder="Enter a valid value." />
                          </label>
                        </div>
                        <p className="text-[11px] text-slate-500">Validation formulas can reference other input component API Names on this screen and must evaluate to true.</p>
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={component.required === true} onChange={(event) => updateComponent(componentIndex, { required: event.target.checked })} /> Required</label>
                          <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={component.visible !== false} onChange={(event) => updateComponent(componentIndex, { visible: event.target.checked })} /> Visible</label>
                        </div>
                      </> : null}
                      {["RADIO","CHECKBOX_GROUP","SELECT","MULTI_SELECT"].includes(component.type) ? (
                        <div className="space-y-2">
                          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => ["choice","choice_collection"].includes(resource.type))} label="Choice Resource (optional)" value={component.choiceResource || ""} onChange={(choiceResource) => updateComponent(componentIndex, { choiceResource })} />
                          <label className="block text-xs font-medium text-slate-600">Controlling Component (optional)
                            <select className={inputClass} value={component.controllingComponent || ""} onChange={(event) => updateComponent(componentIndex, { controllingComponent: event.target.value })}>
                              <option value="">No controlling component</option>
                              {inputComponents.filter((candidate) => candidate.name && candidate.name !== component.name).map((candidate) => <option key={candidate.name} value={candidate.name}>{candidate.label || candidate.name} · {candidate.name}</option>)}
                            </select>
                          </label>
                          {component.choiceResource ? <p className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-800">This component uses a Choice Resource. Inline choices below are ignored until the Choice Resource is cleared.</p> : null}
                          <div className="text-[11px] font-semibold text-slate-600">Inline Choices</div>
                          <fieldset disabled={Boolean(component.choiceResource)} className={component.choiceResource ? "space-y-2 opacity-50" : "space-y-2"}>
                          {(component.options || []).map((option, optionIndex) => <div key={optionIndex} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                            <input className={inputClass} value={option.label || ""} onChange={(event) => {
                              const options = [...(component.options || [])]; options[optionIndex] = { ...option, label: event.target.value }; updateComponent(componentIndex, { options });
                            }} placeholder="Label" />
                            <input className={inputClass} value={option.value || ""} onChange={(event) => {
                              const options = [...(component.options || [])]; options[optionIndex] = { ...option, value: event.target.value }; updateComponent(componentIndex, { options });
                            }} placeholder="Value" />
                            <input className={inputClass} value={(option.controllingValues || []).join(", ")} onChange={(event) => {
                              const options = [...(component.options || [])];
                              options[optionIndex] = { ...option, controllingValues: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) };
                              updateComponent(componentIndex, { options });
                            }} placeholder="Show when controller = …" />
                            <button type="button" className="text-xs text-red-600" onClick={() => updateComponent(componentIndex, { options: (component.options || []).filter((_, i) => i !== optionIndex) })}>Remove</button>
                          </div>)}
                          <button type="button" className="text-xs text-blue-700" onClick={() => updateComponent(componentIndex, { options: [...(component.options || []), { label: `Option ${(component.options || []).length + 1}`, value: `option_${(component.options || []).length + 1}` }] })}>+ Choice</button>
                          </fieldset>
                        </div>
                      ) : null}
                      {(() => {
                        const issues = [];
                        if (component.input !== false && (!String(component.name || "").trim() || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(String(component.name)))) issues.push("Enter a valid API Name.");
                        if (component.input !== false && components.some((candidate, candidateIndex) => candidateIndex !== componentIndex && String(candidate?.name || "").toLowerCase() === String(component.name || "").toLowerCase() && String(component.name || "").trim())) issues.push("API Name must be unique on this screen.");
                        if (String(component.validationFormula || "").trim() && !String(component.validationMessage || "").trim()) issues.push("Add a validation error message.");
                        if (component.visibilityResource) {
                          const visibilityOperator = component.visibilityOperator || "truthy";
                          const compareOperators = ["equals","not_equals","contains","not_contains","greater_than","greater_or_equal","less_than","less_or_equal"];
                          if (String(component.visibilityResource) === String(component.name || "")) issues.push("A component cannot control its own visibility.");
                          if (compareOperators.includes(visibilityOperator) && String(component.visibilityValue ?? "").trim() === "") issues.push("Enter a compare value for conditional visibility.");
                          const source = components.find((candidate) => String(candidate?.name || "") === String(component.visibilityResource));
                          const sourceType = String(source?.type || "").toUpperCase();
                          if (source && ["greater_than","greater_or_equal","less_than","less_or_equal"].includes(visibilityOperator) && !["NUMBER","SLIDER"].includes(sourceType)) issues.push("Numeric visibility comparisons require a Number or Slider screen input.");
                          if (source && ["contains","not_contains"].includes(visibilityOperator) && ["CHECKBOX","TOGGLE","NUMBER","SLIDER","DATE","DATETIME"].includes(sourceType)) issues.push("Contains visibility comparisons require a text or multi-value screen input.");
                        }
                        if (["RADIO","CHECKBOX_GROUP","SELECT","MULTI_SELECT"].includes(component.type) && !component.choiceResource && !(component.options || []).length) issues.push("Add at least one choice or select a Choice Resource.");
                        if (component.type === "RECORD_PICKER" && !component.objectKey) issues.push("Choose an object to search.");
                        if (component.type === "DATA_TABLE" && !component.dataResource) issues.push("Choose a row collection.");
                        if (component.type === "DATA_TABLE" && !(component.columns || []).length) issues.push("Add at least one table column.");
                        if (component.layoutParentId) {
                          const parent = layoutContainers.find((item) => item.id === component.layoutParentId);
                          if (!parent) issues.push("Choose a valid layout container.");
                          if (parent?.type === "COLUMNS" && (Number(component.layoutColumn || 1) < 1 || Number(component.layoutColumn || 1) > Number(parent.columnCount || 2))) issues.push("Choose a valid column for this component.");
                        }
                        if (component.type === "CUSTOM_COMPONENT" && (!component.registryKey || component.registryConfigError)) issues.push(component.registryConfigError || "Choose a registered component.");
                        if (!issues.length) return null;
                        return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2" role="alert"><div className="text-[11px] font-semibold text-red-800">Fix before saving this screen</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-red-700">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>;
                      })()}
                      {!(["SECTION", "COLUMNS"].includes(component.type)) && layoutContainers.length ? <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-600">Layout container
                          <select className={inputClass} value={component.layoutParentId || ""} onChange={(event) => {
                            const layoutParentId = event.target.value;
                            const parent = layoutContainers.find((item) => item.id === layoutParentId);
                            updateComponent(componentIndex, { layoutParentId, layoutColumn: parent?.type === "COLUMNS" ? Math.max(1, Math.min(Number(parent.columnCount || 2), Number(component.layoutColumn || 1))) : undefined });
                          }}>
                            <option value="">Screen root</option>
                            {layoutContainers.map((layout) => <option key={layout.id} value={layout.id}>{layout.type === "SECTION" ? "Section" : "Columns"}: {layout.heading || layout.label || layout.id}</option>)}
                          </select>
                        </label>
                        {(() => {
                          const parent = layoutContainers.find((item) => item.id === component.layoutParentId);
                          if (parent?.type !== "COLUMNS") return <div />;
                          const count = Math.max(2, Math.min(4, Number(parent.columnCount || 2)));
                          return <label className="block text-xs font-medium text-slate-600">Column
                            <select className={inputClass} value={String(Math.max(1, Math.min(count, Number(component.layoutColumn || 1))))} onChange={(event) => updateComponent(componentIndex, { layoutColumn: Number(event.target.value) })}>{Array.from({ length: count }, (_, columnIndex) => <option key={columnIndex + 1} value={columnIndex + 1}>Column {columnIndex + 1}</option>)}</select>
                          </label>;
                        })()}
                      </div> : null}
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="block text-xs font-medium text-slate-600">Width
                          <select className={inputClass} value={component.width || "full"} onChange={(event) => updateComponent(componentIndex, { width: event.target.value })}>
                            <option value="full">Full</option><option value="1/2">Half</option><option value="1/3">One third</option><option value="2/3">Two thirds</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-600">Conditional Visibility Resource
                          <MetadataResourcePicker
                            objectKey={rootObjectKey}
                            extraResources={[
                              ...extraResources,
                              ...screen.components
                                .filter((candidate, candidateIndex) => candidateIndex !== componentIndex && candidate?.input !== false && String(candidate?.name || "").trim())
                                .map((candidate) => ({ value: candidate.name, label: `Screen Input → ${candidate.label || candidate.name}`, type: String(candidate.type || "input").toLowerCase() })),
                            ]}
                            label=""
                            value={component.visibilityResource || ""}
                            onChange={(visibilityResource) => updateComponent(componentIndex, { visibilityResource, ...(visibilityResource ? {} : { visibilityOperator: "truthy", visibilityValue: "" }) })}
                          />
                        </label>
                      </div>
                      {component.visibilityResource ? (() => {
                        const visibilitySource = screen.components.find((candidate) => String(candidate?.name || "") === String(component.visibilityResource));
                        const sourceType = String(visibilitySource?.type || "").toUpperCase();
                        const operator = component.visibilityOperator || "truthy";
                        const needsCompareValue = ["equals","not_equals","contains","not_contains","greater_than","greater_or_equal","less_than","less_or_equal"].includes(operator);
                        const booleanSource = ["CHECKBOX","TOGGLE"].includes(sourceType);
                        const numericSource = ["NUMBER","SLIDER"].includes(sourceType);
                        return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="block text-xs font-medium text-slate-600">Visibility Operator
                              <select className={inputClass} value={operator} onChange={(event) => updateComponent(componentIndex, { visibilityOperator: event.target.value, visibilityValue: "" })}>
                                <option value="truthy">Is True / Has Value</option>
                                <option value="falsy">Is False / Empty</option>
                                <option value="is_empty">Is Empty</option>
                                <option value="is_not_empty">Is Not Empty</option>
                                <option value="equals">Equals</option>
                                <option value="not_equals">Does Not Equal</option>
                                <option value="contains">Contains</option>
                                <option value="not_contains">Does Not Contain</option>
                                <option value="greater_than">Greater Than</option>
                                <option value="greater_or_equal">Greater Than or Equal</option>
                                <option value="less_than">Less Than</option>
                                <option value="less_or_equal">Less Than or Equal</option>
                              </select>
                            </label>
                            {needsCompareValue ? <label className="block text-xs font-medium text-slate-600">Compare Value
                              {booleanSource && ["equals","not_equals"].includes(operator) ? <select className={inputClass} value={String(component.visibilityValue ?? "")} onChange={(event) => updateComponent(componentIndex, { visibilityValue: event.target.value })}><option value="">Select value</option><option value="true">True</option><option value="false">False</option></select> : <input className={inputClass} type={numericSource && ["greater_than","greater_or_equal","less_than","less_or_equal"].includes(operator) ? "number" : "text"} value={component.visibilityValue ?? ""} onChange={(event) => updateComponent(componentIndex, { visibilityValue: event.target.value })} placeholder={numericSource ? "0" : "Value to compare"} />}
                            </label> : <div />}
                          </div>
                          <p className="text-[11px] text-slate-500">This component is rendered only when the selected resource matches this rule. Screen input resources update immediately as the user changes them.</p>
                          {String(component.visibilityResource) === String(component.name || "") ? <div className="text-[11px] font-medium text-red-600">A component cannot control its own visibility.</div> : null}
                        </div>;
                      })() : null}
                      <div className="flex justify-between gap-2">
                        <div className="flex gap-1">
                          <button type="button" aria-label={`Move ${component.label || "component"} up`} title="Move component up" className="rounded border border-slate-200 px-2 py-1 text-xs" disabled={componentIndex === 0} onClick={() => {
                            const next = [...components]; [next[componentIndex - 1], next[componentIndex]] = [next[componentIndex], next[componentIndex - 1]]; updateScreen({ components: next });
                          }}>↑</button>
                          <button type="button" aria-label={`Move ${component.label || "component"} down`} title="Move component down" className="rounded border border-slate-200 px-2 py-1 text-xs" disabled={componentIndex === components.length - 1} onClick={() => {
                            const next = [...components]; [next[componentIndex], next[componentIndex + 1]] = [next[componentIndex + 1], next[componentIndex]]; updateScreen({ components: next });
                          }}>↓</button>
                        </div>
                        <div className="flex items-center gap-3">
                          <button type="button" className="text-xs text-blue-700" onClick={() => duplicateComponent(componentIndex)}>Duplicate</button>
                          <button type="button" className="text-xs text-red-600" onClick={() => {
                            const removedName = String(component.name || "");
                            const removedId = String(component.id || "");
                            const next = components
                              .filter((_, i) => i !== componentIndex)
                              .map((item) => {
                                let nextItem = item?.controllingComponent === removedName ? { ...item, controllingComponent: "" } : item;
                                if (removedId && nextItem?.layoutParentId === removedId) nextItem = { ...nextItem, layoutParentId: "", layoutColumn: undefined };
                                return nextItem;
                              });
                            updateScreen({ components: next });
                            if (expandedScreenComponentId === componentKey(component, componentIndex)) setExpandedScreenComponentId("__none__");
                          }}>Remove Component</button>
                        </div>
                      </div>
                    </div>
                  </details>
                ))}
                {!components.length ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">Add components to build this screen.</div> : null}
              </div>
            </div>
          </div>
        );
      }
      case "COLLECTION_FILTER": {
        const filters = Array.isArray(step.config?.filters) ? step.config.filters : [];
        const updateFilter = (filterIndex, patch) => {
          const next = [...filters];
          next[filterIndex] = { ...next[filterIndex], ...patch };
          updateConfig({ filters: next });
        };
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection") || String(resource.value || "").startsWith("variables."))} label="Collection" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Filter conditions</strong>
                <select className={inputClass} value={step.config?.match || "all"} onChange={(event) => updateConfig({ match: event.target.value })}>
                  <option value="all">Match ALL</option><option value="any">Match ANY</option>
                </select>
              </div>
              <div className="space-y-2">
                {filters.map((filter, filterIndex) => <div key={filter.id || filterIndex} className="grid gap-2 md:grid-cols-[1fr_.8fr_1fr_auto]">
                  <input className={inputClass} value={filter.field || ""} onChange={(event) => updateFilter(filterIndex, { field: event.target.value })} placeholder="Item field/path" />
                  <select className={inputClass} value={filter.operator || "equals"} onChange={(event) => updateFilter(filterIndex, { operator: event.target.value })}>
                    <option value="equals">Equals</option><option value="not_equals">Not equal</option><option value="greater_than">Greater than</option><option value="greater_than_or_equal">Greater than or equal</option><option value="less_than">Less than</option><option value="less_than_or_equal">Less than or equal</option><option value="contains">Contains</option><option value="is_empty">Is empty</option><option value="is_not_empty">Is not empty</option>
                  </select>
                  {["is_empty","is_not_empty"].includes(filter.operator) ? <div /> : <ResourceOrLiteralInput label="" value={filter.value ?? ""} onChange={(value) => updateFilter(filterIndex, { value })} rootObjectKey={rootObjectKey} extraResources={extraResources} />}
                  <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => updateConfig({ filters: filters.filter((_, i) => i !== filterIndex) })}>Remove</button>
                </div>)}
              </div>
              <button type="button" className="mt-2 text-sm text-blue-700" onClick={() => updateConfig({ filters: [...filters, { id: `filter-${Date.now()}`, field: "", operator: "equals", value: "" }] })}>+ Add condition</button>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Outputs a new collection containing only items that match the criteria.</div>
          </div>
        );
      }
      case "COLLECTION_SORT":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection") || String(resource.value || "").startsWith("variables."))} label="Collection" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <label className="block text-xs font-medium text-slate-600">Sort field / item path
              <input className={inputClass} value={step.config?.sortField || ""} onChange={(event) => updateConfig({ sortField: event.target.value })} placeholder="e.g. total or customer.name" />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Direction
                <select className={inputClass} value={step.config?.sortDirection || "asc"} onChange={(event) => updateConfig({ sortDirection: event.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
              </label>
              <label className="block text-xs font-medium text-slate-600">Limit items
                <input className={inputClass} type="number" min="0" max="10000" value={Number(step.config?.limit || 0)} onChange={(event) => updateConfig({ limit: Math.max(0, Number(event.target.value || 0)) })} />
              </label>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Reorders the collection and can optionally keep only the first N items.</div>
          </div>
        );
      case "TRANSFORM": {
        const mappings = Object.entries(step.config?.transformMappings || {});
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Source Resource" value={step.config?.collection || ""} onChange={(collection) => updateConfig({ collection })} />
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">Map source data to target fields</div>
              <div className="space-y-2">
                {mappings.map(([target, source], mappingIndex) => <div key={`${target}-${mappingIndex}`} className="grid gap-2 md:grid-cols-[1fr_1.2fr_auto]">
                  <input className={inputClass} value={target} onChange={(event) => {
                    const next = { ...(step.config?.transformMappings || {}) }; const value = next[target]; delete next[target]; next[event.target.value] = value; updateConfig({ transformMappings: next });
                  }} placeholder="Target field" />
                  <ResourceOrLiteralInput label="" value={source} onChange={(value) => updateConfig({ transformMappings: { ...(step.config?.transformMappings || {}), [target]: value } })} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                  <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => { const next = { ...(step.config?.transformMappings || {}) }; delete next[target]; updateConfig({ transformMappings: next }); }}>Remove</button>
                </div>)}
              </div>
              <button type="button" className="mt-2 text-sm text-blue-700" onClick={() => {
                const next = { ...(step.config?.transformMappings || {}) }; let key = `field_${Object.keys(next).length + 1}`; while (Object.prototype.hasOwnProperty.call(next, key)) key += "_"; next[key] = ""; updateConfig({ transformMappings: next });
              }}>+ Add mapping</button>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Maps one record/object or every item in a collection into a new target shape.</div>
          </div>
        );
      }
      case "LOOP":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker
              objectKey={rootObjectKey}
              extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").endsWith(".collection"))}
              label="Collection"
              value={step.config?.collection || ""}
              onChange={(collection) => updateConfig({ collection })}
            />
            <label className="block text-xs font-medium text-slate-600">Iteration order
              <select className={inputClass} value={step.config?.iterationOrder || "FIRST_TO_LAST"} onChange={(event) => updateConfig({ iterationOrder: event.target.value })}>
                <option value="FIRST_TO_LAST">First item to last item</option>
                <option value="LAST_TO_FIRST">Last item to first item</option>
              </select>
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-700">Current Item from {step.label || "Loop"}</div>
              <p className="mt-1 break-all font-mono text-[11px] text-slate-600">variables.{step.config?.itemVariable || `currentItem_${step.config?.apiName || "Loop"}`}</p>
              <p className="mt-1 text-[11px] text-slate-500">Created automatically and available only while elements on the For Each Item path are running.</p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Add elements to the <strong>For Each Item</strong> path using the + insertion points on the canvas. The flow continues on <strong>After Last</strong> when the collection is finished.
            </div>
          </div>
        );
      case "BULK_UPDATE_RECORDS":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, fieldMappings: {} })} />
            </div>
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record collection" value={step.config?.recordIds || ""} onChange={(recordIds) => updateConfig({ recordIds })} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field updates</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
                      const next = { ...(step.config?.fieldMappings || {}) };
                      const currentValue = next[key];
                      delete next[key];
                      next[field] = currentValue;
                      updateConfig({ fieldMappings: next });
                    }} />
                    <ResourceOrLiteralInput label="New value" value={value} onChange={(source) => updateFieldMapping(key, source)} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                  </div>
                ))}
                <button type="button" className="text-sm text-blue-700" onClick={() => {
                  const next = { ...(step.config?.fieldMappings || {}) };
                  let key = `field_${Object.keys(next).length + 1}`;
                  while (Object.prototype.hasOwnProperty.call(next, key)) key += "_";
                  next[key] = "";
                  updateConfig({ fieldMappings: next });
                }}>+ Add field</button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">All selected records are updated in one scoped database operation rather than one update per Loop iteration.</p>
          </div>
        );
      case "ASSIGNMENT": {
        const rows = Array.isArray(step.config?.assignments) && step.config.assignments.length
          ? step.config.assignments
          : (step.config?.variableName
              ? [{ id: "legacy-assignment", variable: `variables.${step.config.variableName}`, variableType: step.config.variableType || "text", operator: step.config.operator || "set", value: step.config.value ?? "" }]
              : [{ id: `assignment-${step.id}`, variable: "", variableType: "text", operator: "set", value: "" }]);
        const setRows = (assignments) => updateConfig({ assignments, variableName: "", value: "" });
        return (
          <div className="space-y-3">
            {!variableResourceOptions.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Create a Variable from Manager → New Resource before configuring an Assignment.
              </div>
            ) : null}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Set Variable Values</div>
            {rows.map((assignment, assignmentIndex) => {
              const selectedVariable = variableResourceOptions.find((option) => option.value === assignment.variable);
              const variableType = assignment.variableType || selectedVariable?.type || "text";
              return <div key={assignment.id || assignmentIndex} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1.1fr_.8fr_auto]">
                  <label className="block text-xs font-medium text-slate-600">Variable
                    <select className={inputClass} value={assignment.variable || ""} onChange={(event) => {
                      const option = variableResourceOptions.find((item) => item.value === event.target.value);
                      const next = [...rows];
                      next[assignmentIndex] = { ...assignment, variable: event.target.value, variableType: option?.type || "text", operator: "set", value: "" };
                      setRows(next);
                    }}>
                      <option value="">Select a Variable</option>
                      {variableResourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.type}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">Operator
                    <select className={inputClass} value={assignment.operator || "set"} onChange={(event) => {
                      const next = [...rows];
                      next[assignmentIndex] = { ...assignment, operator: event.target.value };
                      setRows(next);
                    }}>
                      <option value="set">Equals</option>
                      {variableType === "number" ? <option value="add">Add</option> : null}
                      {variableType === "number" ? <option value="subtract">Subtract</option> : null}
                      {variableType === "collection" ? <option value="append">Add</option> : null}
                    </select>
                  </label>
                  <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== assignmentIndex))}>Remove</button>
                </div>
                <ResourceOrLiteralInput
                  label="Value"
                  value={assignment.value ?? ""}
                  onChange={(value) => {
                    const next = [...rows];
                    next[assignmentIndex] = { ...assignment, value, variableType };
                    setRows(next);
                  }}
                  rootObjectKey={rootObjectKey}
                  extraResources={extraResources}
                  type={variableType || "string"}
                  required
                />
              </div>;
            })}
            <button type="button" className="text-sm text-blue-700" onClick={() => setRows([...rows, { id: `assignment-${Date.now()}`, variable: "", variableType: "text", operator: "set", value: "" }])}>+ Add Assignment</button>
          </div>
        );
      }
      case "GET_RECORDS": {
        const filters = Array.isArray(step.config?.filters) ? step.config.filters : [];
        const updateFilter = (filterIndex, patch) => {
          const next = [...filters];
          next[filterIndex] = { ...next[filterIndex], ...patch };
          updateConfig({ filters: next });
        };
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly objectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, filters: [], sortField: "" })} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Filter conditions</strong>
                <select className={inputClass} value={step.config?.match || "all"} onChange={(event) => updateConfig({ match: event.target.value })}>
                  <option value="all">Match ALL</option>
                  <option value="any">Match ANY</option>
                </select>
              </div>
              <div className="space-y-2">
                {filters.map((filter, filterIndex) => (
                  <div key={filter.id || filterIndex} className="grid gap-2 md:grid-cols-[1.1fr_.8fr_1fr_auto]">
                    <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={filter.field || ""} label="Field" onChange={(field) => updateFilter(filterIndex, { field })} />
                    <select className={inputClass} value={filter.operator || "equals"} onChange={(event) => updateFilter(filterIndex, { operator: event.target.value })}>
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not equal</option>
                      <option value="greater_than">Greater than</option>
                      <option value="greater_than_or_equal">Greater than or equal</option>
                      <option value="less_than">Less than</option>
                      <option value="less_than_or_equal">Less than or equal</option>
                      <option value="contains">Contains</option>
                      <option value="is_empty">Is empty</option>
                      <option value="is_not_empty">Is not empty</option>
                    </select>
                    {["is_empty","is_not_empty"].includes(filter.operator) ? <div /> : (
                      <ResourceOrLiteralInput
                        label=""
                        value={filter.value ?? ""}
                        onChange={(value) => updateFilter(filterIndex, { value })}
                        rootObjectKey={rootObjectKey}
                        extraResources={extraResources}
                      />
                    )}
                    <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => updateConfig({ filters: filters.filter((_, itemIndex) => itemIndex !== filterIndex) })}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 text-sm text-blue-700" onClick={() => updateConfig({ filters: [...filters, { id: `filter-${Date.now()}`, field: "", operator: "equals", value: "" }] })}>+ Add filter</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Sort by</label>
                <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={step.config?.sortField || ""} label="Optional sort field" onChange={(sortField) => updateConfig({ sortField })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Direction</label>
                <select className={inputClass} value={step.config?.sortDirection || "asc"} onChange={(event) => updateConfig({ sortDirection: event.target.value })}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Store result</label>
                <select className={inputClass} value={step.config?.store || "first"} onChange={(event) => updateConfig({ store: event.target.value, limit: event.target.value === "first" ? 1 : Math.max(Number(step.config?.limit || 50), 2) })}>
                  <option value="first">First matching record</option>
                  <option value="all">All matching records</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Maximum records</label>
                <input className={inputClass} type="number" min="1" max="200" disabled={(step.config?.store || "first") === "first"} value={(step.config?.store || "first") === "first" ? 1 : Number(step.config?.limit || 50)} onChange={(event) => updateConfig({ limit: Math.max(1, Math.min(200, Number(event.target.value || 1))) })} />
              </div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Later steps can use this element from the Resource picker, including its first Record ID, record count, or collection.
            </div>
          </div>
        );
      }
      case "CREATE_RECORD":
      case "UPDATE_RECORD":
      case "DELETE_RECORD": {
        const needsRecord = step.type !== "CREATE_RECORD";
        const needsMappings = step.type !== "DELETE_RECORD";
        return (
          <div className="space-y-3">
            <div className={`grid gap-3 ${needsRecord ? "md:grid-cols-2" : ""}`}>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
                <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, fieldMappings: object === step.config?.object ? step.config?.fieldMappings : {} })} />
              </div>
              {needsRecord ? (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Record *</label>
                  <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record ID / Resource" value={step.config?.recordId || ""} onChange={(recordId) => updateConfig({ recordId })} />
                </div>
              ) : null}
            </div>
            {needsMappings ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings *</label>
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" key={`${key}-${mappingIndex}`}>
                      <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value={key.startsWith("field_") ? "" : key} label="Target field" onChange={(field) => {
                        if (!field) return;
                        const next = { ...(step.config?.fieldMappings || {}) };
                        const currentValue = next[key];
                        delete next[key];
                        next[field] = currentValue;
                        updateConfig({ fieldMappings: next });
                      }} />
                      <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Source value" value={value} onChange={(source) => updateFieldMapping(key, source)} />
                      <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => { const next = { ...(step.config?.fieldMappings || {}) }; delete next[key]; updateConfig({ fieldMappings: next }); }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="text-sm text-blue-700 disabled:text-slate-400" disabled={!step.config?.object} onClick={() => updateConfig({ fieldMappings: { ...(step.config?.fieldMappings || {}), [`field_${Date.now()}`]: "" } })}>+ Add mapping</button>
                  {!step.config?.object ? <p className="text-[11px] text-slate-500">Choose an object before mapping fields.</p> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Delete uses the target object's existing delete semantics. Objects with an Active field are deactivated; other objects are deleted.</div>
            )}
          </div>
        );
      }
      case "UPDATE_RELATED_RECORD":
      case "CREATE_RELATED_RECORD":
      case "ADD_RELATIONSHIP":
      case "REMOVE_RELATIONSHIP": {
        const createRelated = step.type === "CREATE_RELATED_RECORD";
        const updateRelated = step.type === "UPDATE_RELATED_RECORD";
        const linkOnly = ["ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(step.type);
        const selectedRelationship = relationshipOptions.find((item) => String(item.relationship_key) === String(step.config?.relationshipKey || ""));
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Relationship *</label>
              <select className={inputClass} value={step.config?.relationshipKey || ""} onChange={(event) => {
                const relationshipKey = event.target.value;
                const relationship = relationshipOptions.find((item) => String(item.relationship_key) === String(relationshipKey));
                updateConfig({ relationshipKey, object: relationship?.child_object_key || step.config?.object || "", fieldMappings: relationshipKey === step.config?.relationshipKey ? step.config?.fieldMappings : {} });
              }}>
                <option value="">Select a relationship</option>
                {step.config?.relationshipKey && !relationshipOptions.some((item) => String(item.relationship_key) === String(step.config.relationshipKey)) ? <option value={step.config.relationshipKey} disabled>{step.config.relationshipKey} (unavailable)</option> : null}
                {relationshipOptions.map((item) => <option key={item.id || item.relationship_key} value={item.relationship_key}>{item.label || item.relationship_key} · {item.child_object_key}</option>)}
              </select>
              {!relationshipOptions.length ? <p className="mt-1 text-[11px] text-slate-500">No active relationships are available from the Flow's root object.</p> : null}
            </div>
            {selectedRelationship ? <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">Target: {selectedRelationship.child_object_key} · {selectedRelationship.relationship_type || "relationship"}</div> : null}
            {(updateRelated || linkOnly) ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Related record *</label>
                <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Related record ID / Resource" value={step.config?.relatedRecordId || step.config?.recordId || ""} onChange={(relatedRecordId) => updateConfig({ relatedRecordId, ...(updateRelated ? { recordId: relatedRecordId } : {}) })} />
              </div>
            ) : null}
            {createRelated ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Parent record</label>
                <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Parent record ID / Resource" value={step.config?.parentRecordId || step.config?.recordId || ""} onChange={(parentRecordId) => updateConfig({ parentRecordId })} />
                <p className="mt-1 text-[11px] text-slate-500">Leave blank to use the current Flow record.</p>
              </div>
            ) : null}
            {(createRelated || updateRelated) ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings *</label>
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" key={`${key}-${mappingIndex}`}>
                      <PlatformFieldPicker scopeKey={scopeKey} objectKey={selectedRelationship?.child_object_key || step.config?.object || ""} value={key.startsWith("field_") ? "" : key} label="Target field" onChange={(field) => {
                        if (!field) return;
                        const next = { ...(step.config?.fieldMappings || {}) };
                        const currentValue = next[key];
                        delete next[key];
                        next[field] = currentValue;
                        updateConfig({ fieldMappings: next });
                      }} />
                      <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Source value" value={value} onChange={(source) => updateFieldMapping(key, source)} />
                      <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => { const next = { ...(step.config?.fieldMappings || {}) }; delete next[key]; updateConfig({ fieldMappings: next }); }}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="text-sm text-blue-700 disabled:text-slate-400" disabled={!selectedRelationship} onClick={() => updateConfig({ fieldMappings: { ...(step.config?.fieldMappings || {}), [`field_${Date.now()}`]: "" } })}>+ Add mapping</button>
                </div>
              </div>
            ) : null}
          </div>
        );
      }
      case "EMAIL_ALERT":
      case "SEND_EMAIL":
      case "SEND_EMAIL_BREVO":
      case "SEND_EMAIL_MAILJET":
      case "SEND_SMS":
      case "SEND_WHATSAPP": {
        const isEmail = ["EMAIL_ALERT","SEND_EMAIL","SEND_EMAIL_BREVO","SEND_EMAIL_MAILJET"].includes(step.type);
        const providerKey = step.type === "SEND_EMAIL_BREVO" ? "BREVO" : step.type === "SEND_EMAIL_MAILJET" ? "MAILJET" : isEmail ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP";
        const providerLabel = step.type === "SEND_EMAIL_BREVO" ? "Brevo" : step.type === "SEND_EMAIL_MAILJET" ? "Mailjet" : isEmail ? "Configured email provider" : step.type === "SEND_SMS" ? "Configured SMS provider" : "Configured WhatsApp provider";
        const available = providerAvailable[providerKey];
        const templateOnly = step.type === "EMAIL_ALERT";
        const contentMode = templateOnly ? "TEMPLATE" : (step.config?.contentMode || (isEmail ? "TEMPLATE" : "CUSTOM"));
        return (
          <div className="space-y-3">
            {isEmail && step.type !== "EMAIL_ALERT" ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Email provider</label>
                <select
                  className={inputClass}
                  value={step.type}
                  onChange={(event) => updateStep(index, { type: event.target.value, config: { ...(step.config || {}) } })}
                >
                  <option value="SEND_EMAIL">Configured default email provider</option>
                  {(providerAvailable.BREVO || step.type === "SEND_EMAIL_BREVO") ? <option value="SEND_EMAIL_BREVO">Brevo</option> : null}
                  {(providerAvailable.MAILJET || step.type === "SEND_EMAIL_MAILJET") ? <option value="SEND_EMAIL_MAILJET">Mailjet</option> : null}
                </select>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div>
                <span className="text-sm font-medium text-slate-700">{providerLabel}</span>
                <p className="mt-1 text-[11px] text-slate-500">Provider credentials and sender identity come from connector metadata, never from this Flow.</p>
              </div>
              <ProviderStatusPill available={available} />
            </div>

            <ResourceOrLiteralInput
              label={isEmail ? "Recipient email" : step.type === "SEND_SMS" ? "Recipient phone" : "Recipient"}
              value={step.config?.recipient || ""}
              onChange={(recipient) => updateConfig({ recipient })}
              rootObjectKey={rootObjectKey}
              extraResources={extraResources}
              required
            />

            {!templateOnly ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Content source</label>
                <select className={inputClass} value={contentMode} onChange={(event) => updateConfig({ contentMode: event.target.value })}>
                  <option value="TEMPLATE">Message template</option>
                  <option value="CUSTOM">Custom subject and body</option>
                </select>
              </div>
            ) : null}

            {contentMode === "TEMPLATE" ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Template</label>
                <select className={inputClass} value={step.config?.templateId || step.config?.template || ""} onChange={(event) => updateConfig({ templateId: event.target.value, template: "" })}>
                  <option value="">Select message template</option>
                  {messageTemplates
                    .filter((template) => String(template.channel || "").toUpperCase() === (isEmail ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP"))
                    .map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">Template merge values are resolved from the current record and Flow resources at runtime.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {isEmail ? <ResourceOrLiteralInput
                  label="Subject"
                  value={step.config?.subject || ""}
                  onChange={(subject) => updateConfig({ subject })}
                  rootObjectKey={rootObjectKey}
                  extraResources={extraResources}
                  required
                /> : null}
                <ResourceOrLiteralInput
                  label="Message body"
                  value={step.config?.body || step.config?.text || ""}
                  onChange={(body) => updateConfig({ body, text: body })}
                  rootObjectKey={rootObjectKey}
                  extraResources={extraResources}
                  required
                />
                <p className="text-[11px] text-slate-500">For a composed message with several record fields, create a Text Template Resource and select it as the body. No code or JSON is required.</p>
              </div>
            )}
          </div>
        );
      }
      case "SEND_APPOINTMENT_CONFIRMATION":
        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <strong className="text-sm text-slate-700">Booking confirmation</strong>
              <p className="mt-1 text-xs text-slate-500">Sent through the same mobile channel used to book. Leave Recipient blank to reply to the booking customer.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Confirmation message</label>
              <textarea
                className={inputClass}
                value={step.config?.message || ""}
                onChange={(event) => updateConfig({ message: event.target.value })}
                rows={4}
                placeholder="Your {{serviceName}} appointment is booked for {{startsAt}}."
              />
              <p className="mt-1 text-xs text-slate-500">Available values: {"{{serviceName}}"}, {"{{startsAt}}"}, {"{{appointmentId}}"}. If left blank, OneAssistant uses its standard confirmation message.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient override</label>
              <input
                className={inputClass}
                value={step.config?.recipient || ""}
                onChange={(event) => updateConfig({ recipient: event.target.value })}
                placeholder="Leave blank to use the booking customer's phone"
              />
            </div>
          </div>
        );
      case "IN_APP_NOTIFICATION":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Title</label>
              <input className={inputClass} value={step.config?.title || ""} onChange={(event) => updateConfig({ title: event.target.value })} placeholder="Notification title" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Message</label>
              <textarea className={inputClass} value={step.config?.message || ""} onChange={(event) => updateConfig({ message: event.target.value })} rows={3} placeholder="Message text or template" />
              <PlatformFieldPicker scopeKey={scopeKey} objectKey={step.config?.object || ""} value="" label="Insert message field" onInsert={(token) => updateConfig({ message: `${step.config?.message || ""}${token}` })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient mapping</label>
              <input className={inputClass} value={step.config?.recipient || ""} onChange={(event) => updateConfig({ recipient: event.target.value })} placeholder="user.id / team" />
            </div>
          </div>
        );
      case "CALL_FUNCTION":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Registered function</label>
              <select className={inputClass} value={step.config?.functionKey || ""} onChange={(event) => updateConfig({ functionKey: event.target.value })}>
                <option value="">Select a registered function</option>
                {step.config?.functionKey && !functionRegistry.some((item) => item.key === step.config.functionKey) ? <option value={step.config.functionKey} disabled>{step.config.functionKey} (unavailable)</option> : null}
                {functionRegistry.map((item) => <option key={item.key} value={item.key}>{item.displayName || item.key}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Inputs</label>
              <MappingEditor value={step.config?.inputs || {}} onChange={(inputs) => updateConfig({ inputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Input name" valueLabel="Input value" />
            </div>
          </div>
        );
      case "RUN_SUBFLOW": {
        const selectedSubflow = availableWorkflows.find((item) => String(item.id) === String(step.config?.workflowId || ""));
        const inputContract = Array.isArray(selectedSubflow?.inputContract) ? selectedSubflow.inputContract : [];
        const outputContract = Array.isArray(selectedSubflow?.outputContract) ? selectedSubflow.outputContract : [];
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Workflow</label>
              <select className={inputClass} value={step.config?.workflowId || ""} onChange={(event) => {
                const selected = availableWorkflows.find((item) => String(item.id) === String(event.target.value));
                updateConfig({ workflowId: event.target.value, workflowInputs: {}, declaredOutputs: selected?.outputContract || [] });
              }}>
                <option value="">Select a saved flow</option>
                {step.config?.workflowId && !availableWorkflows.some((item) => String(item.id) === String(step.config.workflowId)) ? <option value={step.config.workflowId} disabled>{step.config.workflowId} (unavailable)</option> : null}
                {availableWorkflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!availableWorkflows.length ? <p className="text-xs text-slate-500">Save another active flow before selecting a subflow.</p> : null}
            </div>
            {inputContract.length ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Declared inputs</div>
                {inputContract.map((input) => (
                  <ResourceOrLiteralInput
                    key={input.name}
                    label={`${input.label || input.name}${input.required ? " *" : ""}`}
                    value={step.config?.workflowInputs?.[input.name] ?? ""}
                    onChange={(value) => updateConfig({ workflowInputs: { ...(step.config?.workflowInputs || {}), [input.name]: value } })}
                    rootObjectKey={rootObjectKey}
                    extraResources={extraResources}
                    type={input.type || "string"}
                    required={input.required === true}
                  />
                ))}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Input mapping</label>
                <MappingEditor value={step.config?.workflowInputs || {}} onChange={(workflowInputs) => updateConfig({ workflowInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Subflow input" valueLabel="Map from resource" />
                <p className="mt-1 text-[11px] text-slate-500">This flow has no formal input contract yet, so legacy free-form mapping remains available.</p>
              </div>
            )}
            {outputContract.length ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="text-xs font-semibold text-blue-800">Outputs available after this step</div>
                <div className="mt-2 space-y-1 text-[11px] text-blue-700">
                  {outputContract.map((output) => <div key={output.name}>{output.label || output.name} · {output.type || "text"}</div>)}
                </div>
              </div>
            ) : null}
          </div>
        );
      }
      case "CONDITION": {
        const configuredOutcomes = Array.isArray(step.config?.outcomes) ? step.config.outcomes : [];
        const outcomes = configuredOutcomes.length
          ? configuredOutcomes
          : [{
              id: "outcome-1",
              label: "Outcome 1",
              apiName: "Outcome_1",
              condition: step.config?.condition || { type: "all", rules: [blankCondition()] },
              branch: step.config?.ifBranch || [],
            }];
        const defaultBranch = configuredOutcomes.length ? (step.config?.defaultBranch || []) : (step.config?.elseBranch || []);
        const defaultLabel = step.config?.defaultLabel || "Default Outcome";
        const setOutcomes = (nextOutcomes, patch = {}) => updateConfig({ outcomes: nextOutcomes, defaultBranch, defaultLabel, condition: null, ifBranch: [], elseBranch: [], ...patch });
        const apiNames = outcomes.map((outcome) => String(outcome?.apiName || flowApiName(outcome?.label || "")));
        const duplicateApiNames = new Set(apiNames.filter((apiName, apiIndex) => apiNames.indexOf(apiName) !== apiIndex));
        const removeOutcome = (outcomeIndex) => {
          if (outcomes.length <= 1) return;
          const outcome = outcomes[outcomeIndex];
          const branch = Array.isArray(outcome?.branch) ? outcome.branch : [];
          if (branch.length) {
            setPendingOutcomeRemoval({ outcomeIndex, outcomeId: outcome?.id, label: outcome?.label || `Outcome ${outcomeIndex + 1}`, branch });
            return;
          }
          setOutcomes(outcomes.filter((_, itemIndex) => itemIndex !== outcomeIndex));
        };
        const confirmOutcomeRemoval = () => {
          if (!pendingOutcomeRemoval) return;
          const outcomeIndex = Number(pendingOutcomeRemoval.outcomeIndex);
          const movingIds = Array.isArray(pendingOutcomeRemoval.branch) ? pendingOutcomeRemoval.branch : [];
          const nextOutcomes = outcomes.filter((_, itemIndex) => itemIndex !== outcomeIndex);
          const nextDefault = [...new Set([...(defaultBranch || []), ...movingIds])];
          setOutcomes(nextOutcomes, { defaultBranch: nextDefault });
          setPendingOutcomeRemoval(null);
        };
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Outcomes are evaluated in the order shown. The first matching outcome runs. If none match, the Default Outcome runs.
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outcome Order</div>
            {outcomes.map((outcome, outcomeIndex) => {
              const outcomeApiName = String(outcome.apiName || flowApiName(outcome.label || `Outcome ${outcomeIndex + 1}`));
              const labelMissing = !String(outcome.label || "").trim();
              const apiInvalid = !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(outcomeApiName);
              const apiDuplicate = duplicateApiNames.has(outcomeApiName);
              const branchCount = Array.isArray(outcome.branch) ? outcome.branch.length : 0;
              return (
              <div key={outcome.id || outcomeIndex} className={`space-y-3 rounded-xl border bg-white p-3 ${labelMissing || apiInvalid || apiDuplicate ? "border-red-300" : "border-slate-200"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-2 text-[11px] font-bold text-blue-700">{outcomeIndex + 1}</span>
                    <div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-700">{outcome.label || `Outcome ${outcomeIndex + 1}`}</div><div className="text-[10px] text-slate-400">{branchCount ? `${branchCount} path element${branchCount === 1 ? "" : "s"}` : "No path elements yet"}</div></div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" disabled={outcomeIndex === 0} title="Evaluate this outcome earlier" aria-label={`Move ${outcome.label || `Outcome ${outcomeIndex + 1}`} up`} onClick={() => {
                      if (outcomeIndex === 0) return;
                      const next = [...outcomes];
                      [next[outcomeIndex - 1], next[outcomeIndex]] = [next[outcomeIndex], next[outcomeIndex - 1]];
                      setOutcomes(next);
                    }}>↑</button>
                    <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" disabled={outcomeIndex === outcomes.length - 1} title="Evaluate this outcome later" aria-label={`Move ${outcome.label || `Outcome ${outcomeIndex + 1}`} down`} onClick={() => {
                      if (outcomeIndex >= outcomes.length - 1) return;
                      const next = [...outcomes];
                      [next[outcomeIndex], next[outcomeIndex + 1]] = [next[outcomeIndex + 1], next[outcomeIndex]];
                      setOutcomes(next);
                    }}>↓</button>
                    <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-red-600 disabled:text-slate-300" disabled={outcomes.length <= 1} onClick={() => removeOutcome(outcomeIndex)}>Remove</button>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                    <label className="block text-xs font-medium text-slate-600">Label
                      <input
                        className={inputClass}
                        value={outcome.label || ""}
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          const previousGenerated = flowApiName(outcome.label || "");
                          const next = [...outcomes];
                          next[outcomeIndex] = { ...outcome, label: nextLabel, apiName: !outcome.apiName || outcome.apiName === previousGenerated ? flowApiName(nextLabel) : outcome.apiName };
                          setOutcomes(next);
                        }}
                        placeholder={`Outcome ${outcomeIndex + 1}`}
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">API Name
                      <input className={inputClass} value={outcome.apiName || flowApiName(outcome.label || `Outcome ${outcomeIndex + 1}`)} onChange={(event) => {
                        const next = [...outcomes];
                        next[outcomeIndex] = { ...outcome, apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") };
                        setOutcomes(next);
                      }} />
                    </label>
                </div>
                {labelMissing ? <p className="text-[11px] font-medium text-red-600">Outcome label is required.</p> : null}
                {apiInvalid ? <p className="text-[11px] font-medium text-red-600">API Name must start with a letter and use only letters, numbers, and underscores.</p> : null}
                {apiDuplicate ? <p className="text-[11px] font-medium text-red-600">API Name must be unique within this Decision.</p> : null}
                <StepConditionEditor
                  objectKey={rootObjectKey}
                  extraResources={extraResources}
                  value={outcome.condition || { type: "all", rules: [blankCondition()] }}
                  onChange={(condition) => {
                    const next = [...outcomes];
                    next[outcomeIndex] = { ...outcome, condition };
                    setOutcomes(next);
                  }}
                />
                <p className="text-[11px] text-slate-500">Add elements to this outcome from the + insertion points on the canvas.</p>
              </div>
            );})}
            {pendingOutcomeRemoval ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-semibold text-amber-900">Remove {pendingOutcomeRemoval.label}?</div>
                <p className="mt-1 text-[11px] leading-5 text-amber-800">This outcome already owns {pendingOutcomeRemoval.branch.length} path element{pendingOutcomeRemoval.branch.length === 1 ? "" : "s"}. To prevent orphaned elements, removing the outcome will move those elements to the Default Outcome.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900" onClick={() => setPendingOutcomeRemoval(null)}>Cancel</button>
                  <button type="button" className="rounded bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white" onClick={confirmOutcomeRemoval}>Move to Default & Remove</button>
                </div>
              </div>
            ) : null}
            <button type="button" className="text-sm text-blue-700" disabled={outcomes.length >= 20} onClick={() => {
              const nextIndex = outcomes.length + 1;
              const label = `Outcome ${nextIndex}`;
              setOutcomes([...outcomes, {
                id: `outcome-${Date.now()}-${nextIndex}`,
                label,
                apiName: flowApiName(label),
                condition: { type: "all", rules: [blankCondition()] },
                branch: [],
              }]);
            }}>+ New Outcome</button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="block text-xs font-medium text-slate-600">Default Outcome Label
                <input className={inputClass} value={defaultLabel} onChange={(event) => updateConfig({ outcomes, defaultBranch, defaultLabel: event.target.value, condition: null, ifBranch: [], elseBranch: [] })} />
              </label>
              {!String(defaultLabel || "").trim() ? <p className="mt-1 text-[11px] font-medium text-red-600">Default Outcome label is required.</p> : null}
              <p className="mt-2 text-[11px] text-slate-500">This path runs only when no configured outcome matches. {defaultBranch.length ? `${defaultBranch.length} element${defaultBranch.length === 1 ? "" : "s"} currently use this path.` : "Add its elements from the canvas."}</p>
            </div>
          </div>
        );
      }
      case "SCHEDULE_PATH":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Path name</label>
              <input className={inputClass} value={step.config?.pathLabel || ""} onChange={(event) => updateConfig({ pathLabel: event.target.value })} placeholder="e.g. Follow up after 2 hours" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">When should this path run?</label>
              <select className={inputClass} value={step.config?.scheduleMode || "OFFSET"} onChange={(event) => updateConfig({ scheduleMode: event.target.value })}>
                <option value="OFFSET">After a delay</option>
                <option value="AT_DATETIME">At a date/time Resource</option>
              </select>
            </div>
            {(step.config?.scheduleMode || "OFFSET") === "OFFSET" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Delay</label>
                  <input className={inputClass} type="number" min="0" value={step.config?.delayAmount ?? 30} onChange={(event) => updateConfig({ delayAmount: Number(event.target.value || 0) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Unit</label>
                  <select className={inputClass} value={step.config?.delayUnit || "MINUTES"} onChange={(event) => updateConfig({ delayUnit: event.target.value })}>
                    <option value="MINUTES">Minutes</option>
                    <option value="HOURS">Hours</option>
                    <option value="DAYS">Days</option>
                  </select>
                </div>
              </div>
            ) : (
              <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Run at" value={step.config?.runAt || ""} onChange={(runAt) => updateConfig({ runAt })} />
            )}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Add elements to this Scheduled Path from its + insertion points on the canvas. The Run Immediately path continues independently.
            </div>
          </div>
        );
      case "WAIT":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">Amount of time (seconds)
              <input className={inputClass} type="number" min="1" value={Number(step.config?.durationSeconds || 60)} onChange={(event) => updateConfig({ durationSeconds: Math.max(1, Number(event.target.value || 1)), resumeAt: "" })} />
            </label>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">The flow interview pauses durably and resumes after this amount of time.</div>
          </div>
        );
      case "WAIT_UNTIL_DATE":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Date/Time Resource" value={step.config?.resumeAt || ""} onChange={(resumeAt) => updateConfig({ resumeAt })} />
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">The flow resumes at the Date/Time value selected above.</div>
          </div>
        );
      case "WAIT_FOR_CONDITIONS":
        return (
          <div className="space-y-3">
            <StepConditionEditor objectKey={rootObjectKey} extraResources={extraResources} value={step.config?.waitCondition || { type: "all", rules: [blankCondition()] }} onChange={(waitCondition) => updateConfig({ waitCondition })} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">Check every (seconds)
                <input className={inputClass} type="number" min="30" value={Number(step.config?.pollSeconds || 60)} onChange={(event) => updateConfig({ pollSeconds: Math.max(30, Number(event.target.value || 60)) })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">Stop waiting after (optional)
                <input className={inputClass} type="datetime-local" value={step.config?.maxWaitUntil || ""} onChange={(event) => updateConfig({ maxWaitUntil: event.target.value })} />
              </label>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">If the conditions are false, OneEngine re-checks them with durable jobs until they become true or the optional stop-waiting time is reached.</div>
          </div>
        );
      case "CUSTOM_ERROR":
        return (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-600">Error Message
              <textarea className={inputClass} rows={4} value={step.config?.errorMessage || ""} onChange={(event) => updateConfig({ errorMessage: event.target.value })} placeholder="Tell the user what must be corrected." />
            </label>
            <label className="block text-xs font-medium text-slate-600">Field API Name (optional)
              <input className={inputClass} value={step.config?.errorField || ""} onChange={(event) => updateConfig({ errorField: event.target.value })} placeholder="e.g. email" />
            </label>
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-800">Stops the flow with a targeted validation error. For record-triggered transactions, the triggering change remains uncommitted when the surrounding transaction supports rollback.</div>
          </div>
        );
      case "STOP":
        return (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Optional reason</label>
            <input className={inputClass} value={step.config?.reason || ""} onChange={(event) => updateConfig({ reason: event.target.value })} placeholder="Stop reason" />
          </div>
        );
      case "WEBHOOK":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">URL</label>
              <input className={inputClass} type="url" inputMode="url" value={step.config?.url || ""} onChange={(event) => updateConfig({ url: event.target.value })} placeholder="https://..." />
              {step.config?.url && !/^https:\/\//i.test(String(step.config.url)) ? <p className="mt-1 text-[11px] text-red-600">Use an HTTPS URL.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Method</label>
              <select className={inputClass} value={step.config?.method || "POST"} onChange={(event) => updateConfig({ method: event.target.value })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
          </div>
        );
      default:
        return <SchemaActionEditor definition={registryDefinition} config={step.config || {}} onChange={updateConfig} rootObjectKey={rootObjectKey} extraResources={extraResources} />;
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{isResource ? (isVariableResource ? "Variable" : getActionLabel(step.type)) : (step.type === "__ACTION__" ? "Action" : getActionLabel(step.type))}</div>
          <div className="mt-1 text-[11px] text-slate-500">{isResource ? "Flow Resource" : "Flow Element"}</div>
        </div>
        <button type="button" className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={onCancel} aria-label="Close properties">×</button>
      </div>
      {!isResource ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Label</label>
            <input className={inputClass} value={step.label || ""} onChange={(event) => {
              const nextLabel = event.target.value;
              const previousGenerated = flowApiName(step.label || "");
              const nextApiName = !step.config?.apiName || step.config.apiName === previousGenerated ? flowApiName(nextLabel) : step.config.apiName;
              const nextConfig = { ...(step.config || {}), apiName: nextApiName };
              if (step.type === "LOOP" && (!step.config?.itemVariable || step.config.itemVariable === "currentItem" || String(step.config.itemVariable).startsWith("currentItem_"))) nextConfig.itemVariable = `currentItem_${nextApiName || "Loop"}`;
              updateStep(index, { label: nextLabel, config: nextConfig });
            }} placeholder="Element label" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">API Name</label>
            <input className={inputClass} value={step.config?.apiName || ""} onChange={(event) => {
              const apiName = event.target.value.replace(/[^A-Za-z0-9_]/g, "");
              updateConfig({ apiName, ...(step.type === "LOOP" ? { itemVariable: `currentItem_${apiName || "Loop"}` } : {}) });
            }} placeholder="Element_API_Name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
            <textarea className={inputClass} rows={2} value={step.config?.description || ""} onChange={(event) => updateConfig({ description: event.target.value })} placeholder="What does this element do?" />
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
          <textarea className={inputClass} rows={2} value={step.config?.description || ""} onChange={(event) => updateConfig({ description: event.target.value })} placeholder="Describe this resource" />
        </div>
      )}

      {["FAILED","FAULT_HANDLED"].includes(debugInfo?.status) && debugInfo?.error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600">{debugInfo?.status === "FAULT_HANDLED" ? "Debug fault handled" : "Debug failure"}</div>
          <div className="mt-1 font-semibold">{debugInfo.error.title || "This element could not complete"}</div>
          <div className="mt-2 text-xs leading-5">{debugInfo.error.whatHappened || "The step failed during Debug."}</div>
          <div className="mt-3 rounded-lg border border-red-100 bg-white/80 p-3 text-xs leading-5"><strong>How to fix it:</strong> {debugInfo.error.howToFix || "Check this step's required values and Resources, then run Debug again."}</div>
        </div>
      ) : debugInfo?.status === "COMPLETED" ? (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${debugInfo.simulated ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {debugInfo.simulated ? "This element was simulated in Debug mode. No external or irreversible action was performed." : "This element completed successfully in the last Debug run."}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="space-y-3 pt-1">
          {renderConfig()}
          {!isResource ? <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">On Error</summary>
              <div className="mt-3 space-y-3">
                <label className="block space-y-1 text-xs text-slate-600">
                  <span>When this element fails</span>
                  <select className={inputClass} value={step.config?.faultMode || "FAIL"} onChange={(event) => updateConfig({ faultMode: event.target.value })}>
                    <option value="FAIL">Fail the flow</option>
                    <option value="CONTINUE">Continue to the next element</option>
                    <option value="STOP">Stop the flow without running later elements</option>
                    <option value="ROUTE">Run an error path</option>
                    <option value="RETRY">Retry, then use the error path or fail</option>
                  </select>
                </label>
                {step.config?.faultMode === "RETRY" ? (
                  <label className="block space-y-1 text-xs text-slate-600">
                    <span>Retry attempts</span>
                    <select className={inputClass} value={Number(step.config?.retryCount || 1)} onChange={(event) => updateConfig({ retryCount: Number(event.target.value) })}>
                      <option value={1}>1 retry</option>
                      <option value={2}>2 retries</option>
                      <option value={3}>3 retries</option>
                    </select>
                  </label>
                ) : null}
                {["ROUTE","RETRY"].includes(step.config?.faultMode || "FAIL") ? (
                  <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-[11px] text-red-700">
                    Add recovery elements to the <strong>Fault</strong> path from the canvas. Fault resources such as Error message and How to fix are available to those elements.
                  </div>
                ) : null}
                <p className="text-[11px] text-slate-500">Retry is capped at three attempts and recorded in Run History.</p>
              </div>
          </details> : null}
        </div>
      </div>
      <div className="workflow-properties-footer mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="workflow-cancel-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="workflow-save-button" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}


function WorkflowCanvas({ workflow, workflowId, setWorkflow, updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], scopeKey = null, onGuideStepChange, debugTrace = null, objectFieldCatalog = {}, triggerOptions = [], flowIssues = [], onOpenFlowProperties }) {
  const [selectedId, setSelectedId] = useState("__start__");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [addElementSearch, setAddElementSearch] = useState("");
  const [startTriggerSearch, setStartTriggerSearch] = useState("");
  const [paletteTab, setPaletteTab] = useState("elements");
  const [insertAt, setInsertAt] = useState(null);
  const [branchTarget, setBranchTarget] = useState(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [resourceMenuOpen, setResourceMenuOpen] = useState(false);
  const [inspectorSnapshot, setInspectorSnapshot] = useState(null);
  const [inspectorNewId, setInspectorNewId] = useState(null);
  const [inspectorTransition, setInspectorTransition] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [collapsedBranches, setCollapsedBranches] = useState({});
  const [managerDetailId, setManagerDetailId] = useState(null);
  const [startSnapshot, setStartSnapshot] = useState(null);
  const [pathActionDialog, setPathActionDialog] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedElementIds, setSelectedElementIds] = useState([]);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [platformComponents, setPlatformComponents] = useState([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [infoDialog, setInfoDialog] = useState(null);
  const [managerFilter, setManagerFilter] = useState("all");
  const [highlightedPathKey, setHighlightedPathKey] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [connectFromId, setConnectFromId] = useState(null);
  const [groupTargetId, setGroupTargetId] = useState(null);
  const [autoConnectSourceId, setAutoConnectSourceId] = useState(null);
  const [connectPathDialog, setConnectPathDialog] = useState(null);
  const [groupDialog, setGroupDialog] = useState(null);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const paletteRef = useRef(null);
  const canvasRef = useRef(null);
  const propertiesRef = useRef(null);
  const laneRef = useRef(null);
  const reactFlowRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const applyingHistoryRef = useRef(false);
  const spacePanRef = useRef(false);
  const canvasPanRef = useRef(null);
  const selectedIndex = workflow.steps.findIndex((step) => step.id === selectedId);
  const selectedStep = selectedIndex >= 0 ? workflow.steps[selectedIndex] : null;
  const layoutMode = String(workflow.actionMetadata?.builderLayout?.mode || "AUTO").toUpperCase();
  const flowType = String(workflow.actionMetadata?.flowType || "AUTOLAUNCHED").toUpperCase();
  const startTriggerOptions = flowType === "RECORD_TRIGGERED"
    ? triggerOptions.filter((option) => option.kind === "record" && option.key !== "manual")
    : flowType === "PLATFORM_EVENT_TRIGGERED"
      ? triggerOptions.filter((option) => option.kind === "event")
      : flowType === "SCHEDULE_TRIGGERED"
        ? [{ key: "scheduled", label: "On schedule", kind: "schedule" }]
        : [{ key: "manual", label: "Manual trigger", kind: "manual" }];
  const filteredStartTriggerOptions = startTriggerOptions.filter((option) => {
    const query = startTriggerSearch.trim().toLowerCase();
    return !query || `${option.label || ""} ${option.key || ""}`.toLowerCase().includes(query);
  });
  useEffect(() => { setStartTriggerSearch(""); }, [flowType]);
  const freeformPositions = workflow.actionMetadata?.builderLayout?.positions || {};
  const setLayoutMode = (mode) => setWorkflow((current) => ({
    ...current,
    actionMetadata: {
      ...(current.actionMetadata || {}),
      builderLayout: {
        ...(current.actionMetadata?.builderLayout || {}),
        mode,
        positions: { ...(current.actionMetadata?.builderLayout?.positions || {}) },
      },
    },
  }));
  const defaultFreeformPosition = (stepId, index = 0) => {
    if (stepId === "__start__") return { x: 490, y: 38 };
    return { x: 475, y: 150 + (index * 112) };
  };
  const getFreeformPosition = (stepId, index = 0) => freeformPositions?.[stepId] || defaultFreeformPosition(stepId, index);
  const setFreeformPosition = (stepId, position) => setWorkflow((current) => ({
    ...current,
    actionMetadata: {
      ...(current.actionMetadata || {}),
      builderLayout: {
        ...(current.actionMetadata?.builderLayout || {}),
        mode: "FREEFORM",
        positions: {
          ...(current.actionMetadata?.builderLayout?.positions || {}),
          [stepId]: {
            x: Math.max(10, Math.round(Number(position?.x || 0))),
            y: Math.max(10, Math.round(Number(position?.y || 0))),
          },
        },
      },
    },
  }));

  useEffect(() => {
    const snapshot = JSON.stringify(workflow);
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      return;
    }
    const current = historyRef.current[historyIndexRef.current];
    if (current?.snapshot === snapshot) return;
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({ snapshot, value: JSON.parse(snapshot) });
    if (nextHistory.length > 100) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
  }, [workflow]);

  useEffect(() => {
    if (selectedId === "__start__") return;
    if (!workflow.steps.length) {
      setSelectedId("__start__");
      return;
    }
    if (!workflow.steps.some((step) => step.id === selectedId)) {
      setSelectedId("__start__");
    }
  }, [workflow.steps, selectedId]);

  useEffect(() => {
    const failedId = workflow.steps.find((step) => debugTrace?.[step.id]?.status === "FAILED")?.id;
    if (failedId) setSelectedId(failedId);
  }, [debugTrace, workflow.steps]);

  useEffect(() => {
    if (selectedId === "__start__" && propertiesOpen && !startSnapshot) {
      setStartSnapshot(JSON.parse(JSON.stringify(workflow)));
    }
  }, [selectedId, propertiesOpen]);

  useEffect(() => {
    let live = true;
    apiRequest("/api/platform/component-registry")
      .then((response) => { if (live) setPlatformComponents(Array.isArray(response?.data) ? response.data : []); })
      .catch(() => { if (live) setPlatformComponents([]); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(`oneengine:flow-builder:collapsed:${workflowId || "new"}`);
      setCollapsedBranches(stored ? JSON.parse(stored) : {});
    } catch {
      setCollapsedBranches({});
    }
  }, [workflowId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(`oneengine:flow-builder:groups-collapsed:${workflowId || "new"}`);
      setCollapsedGroups(stored ? JSON.parse(stored) : {});
    } catch {
      setCollapsedGroups({});
    }
  }, [workflowId]);

  const toggleGroupCollapse = (groupId, collapsed) => {
    setCollapsedGroups((current) => {
      const next = { ...current, [groupId]: collapsed };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(`oneengine:flow-builder:groups-collapsed:${workflowId || "new"}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const toggleBranchCollapse = (stepId, collapsed) => {
    setCollapsedBranches((current) => {
      const next = { ...current, [stepId]: collapsed };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(`oneengine:flow-builder:collapsed:${workflowId || "new"}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const inspectorHasChanges = () => {
    if (!propertiesOpen) return false;
    if (selectedId === "__start__" && startSnapshot) return JSON.stringify(workflow) !== JSON.stringify(startSnapshot);
    if (inspectorNewId && String(selectedId) === String(inspectorNewId)) return workflow.steps.some((step) => String(step.id) === String(inspectorNewId));
    if (inspectorSnapshot && selectedStep) return JSON.stringify(selectedStep) !== JSON.stringify(inspectorSnapshot);
    return false;
  };
  const openInspectorTarget = (target, sourceWorkflow = workflow) => {
    if (!target || target.kind === "close") {
      setStartSnapshot(null);
      setInspectorSnapshot(null);
      setInspectorNewId(null);
      setPropertiesOpen(false);
      return;
    }
    if (target.kind === "selection") {
      setStartSnapshot(null);
      setInspectorSnapshot(null);
      setInspectorNewId(null);
      setPropertiesOpen(false);
      setSelectionMode(true);
      setSelectedElementIds([]);
      return;
    }
    if (target.kind === "start") {
      setStartSnapshot(deepClone(sourceWorkflow));
      setInspectorSnapshot(null);
      setInspectorNewId(null);
      setSelectedId("__start__");
      setPropertiesOpen(true);
      return;
    }
    if (target.kind === "step") {
      const current = sourceWorkflow.steps.find((step) => String(step.id) === String(target.stepId));
      if (!current) return;
      setStartSnapshot(null);
      setInspectorSnapshot(deepClone(current));
      setInspectorNewId(null);
      setSelectedId(current.id);
      setPropertiesOpen(true);
    }
  };
  const requestInspectorTarget = (target) => {
    if (target?.kind === "step" && String(selectedId) === String(target.stepId) && propertiesOpen) return;
    if (target?.kind === "start" && selectedId === "__start__" && propertiesOpen) return;
    if (inspectorHasChanges()) {
      setInspectorTransition(target);
      return;
    }
    openInspectorTarget(target);
  };
  const inspectStart = () => requestInspectorTarget({ kind: "start" });
  const inspectStep = (stepId) => requestInspectorTarget({ kind: "step", stepId });
  const requestCloseInspector = () => requestInspectorTarget({ kind: "close" });
  const requestSelectionMode = () => requestInspectorTarget({ kind: "selection" });
  const resolveInspectorTransition = (mode) => {
    const target = inspectorTransition;
    if (!target) return;
    setInspectorTransition(null);
    if (mode === "stay") return;
    if (mode === "apply") {
      setStartSnapshot(null);
      setInspectorSnapshot(null);
      setInspectorNewId(null);
      openInspectorTarget(target, workflow);
      return;
    }
    let restored = deepClone(workflow);
    if (selectedId === "__start__" && startSnapshot) restored = deepClone(startSnapshot);
    else if (inspectorNewId && String(selectedId) === String(inspectorNewId)) {
      restored.steps = restored.steps.filter((step) => String(step.id) !== String(inspectorNewId));
    } else if (inspectorSnapshot) {
      const snapshot = deepClone(inspectorSnapshot);
      restored.steps = restored.steps.map((step) => String(step.id) === String(snapshot.id) ? snapshot : step);
    }
    setWorkflow(restored);
    setStartSnapshot(null);
    setInspectorSnapshot(null);
    setInspectorNewId(null);
    openInspectorTarget(target, restored);
  };
  const stripStepReferences = (config = {}, stepId) => {
    const prune = (items) => (Array.isArray(items) ? items.filter((id) => String(id) !== String(stepId)) : items);
    return {
      ...config,
      ...(Array.isArray(config.outcomes) ? { outcomes: config.outcomes.map((outcome) => ({ ...outcome, branch: prune(outcome.branch) || [] })) } : {}),
      ...(Array.isArray(config.defaultBranch) ? { defaultBranch: prune(config.defaultBranch) } : {}),
      ...(Array.isArray(config.ifBranch) ? { ifBranch: prune(config.ifBranch) } : {}),
      ...(Array.isArray(config.elseBranch) ? { elseBranch: prune(config.elseBranch) } : {}),
      ...(Array.isArray(config.bodyBranch) ? { bodyBranch: prune(config.bodyBranch) } : {}),
      ...(Array.isArray(config.faultBranch) ? { faultBranch: prune(config.faultBranch) } : {}),
      ...(Array.isArray(config.branch) ? { branch: prune(config.branch) } : {}),
    };
  };
  const removeStepById = (stepId) => {
    setWorkflow((current) => ({
      ...current,
      steps: current.steps
        .filter((step) => String(step.id) !== String(stepId))
        .map((step) => ({ ...step, config: stripStepReferences(step.config || {}, stepId) })),
    }));
  };
  const ownedPathsForStep = (step) => {
    const paths = [];
    if (step?.type === "CONDITION") {
      const outcomes = Array.isArray(step.config?.outcomes) && step.config.outcomes.length
        ? step.config.outcomes
        : [{ id: "outcome-1", label: "Outcome 1", branch: step.config?.ifBranch || [] }];
      outcomes.forEach((outcome, index) => paths.push({ key: `decision:${outcome.id || index}`, kind: "decision", outcomeId: outcome.id || `outcome-${index + 1}`, label: outcome.label || `Outcome ${index + 1}`, ids: outcome.branch || [] }));
      paths.push({ key: "decision:__default__", kind: "decision", outcomeId: "__default__", label: step.config?.defaultLabel || "Default Outcome", ids: step.config?.defaultBranch || step.config?.elseBranch || [] });
    }
    if (step?.type === "LOOP") paths.push({ key: "loop:body", kind: "loop", label: "For Each Item", ids: step.config?.bodyBranch || [] });
    if (["ROUTE","RETRY"].includes(String(step?.config?.faultMode || "FAIL").toUpperCase())) paths.push({ key: "fault", kind: "fault", label: "Fault", ids: step.config?.faultBranch || [] });
    return paths;
  };
  const collectOwnedIds = (seedIds = [], seen = new Set()) => {
    for (const id of seedIds || []) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      const child = workflow.steps.find((item) => String(item.id) === key);
      if (child) ownedPathsForStep(child).forEach((path) => collectOwnedIds(path.ids, seen));
    }
    return seen;
  };
  const clearOwnedPath = (step, path) => {
    const next = JSON.parse(JSON.stringify(step));
    if (!path) return next;
    if (path.kind === "decision") {
      if (path.outcomeId === "__default__") next.config.defaultBranch = [];
      else if (Array.isArray(next.config?.outcomes)) next.config.outcomes = next.config.outcomes.map((outcome) => String(outcome.id) === String(path.outcomeId) ? { ...outcome, branch: [] } : outcome);
      else next.config.ifBranch = [];
    } else if (path.kind === "loop") next.config.bodyBranch = [];
    else if (path.kind === "fault") next.config.faultBranch = [];
    return next;
  };
  const removeStep = (index) => {
    const stepId = workflow.steps[index]?.id;
    if (!stepId) return;
    const nextId = workflow.steps[index + 1]?.id || workflow.steps[index - 1]?.id || "__start__";
    removeStepById(stepId);
    setSelectedId(nextId);
    setInspectorSnapshot(null);
    setInspectorNewId(null);
  };
  const finishInspector = () => {
    setStartSnapshot(null);
    setInspectorSnapshot(null);
    setInspectorNewId(null);
    setPropertiesOpen(false);
  };
  const cancelInspector = () => {
    if (selectedId === "__start__" && startSnapshot) {
      setWorkflow(JSON.parse(JSON.stringify(startSnapshot)));
    } else if (inspectorNewId && selectedId === inspectorNewId) {
      removeStepById(inspectorNewId);
      setSelectedId("__start__");
    } else if (inspectorSnapshot) {
      const snapshot = JSON.parse(JSON.stringify(inspectorSnapshot));
      setWorkflow((current) => ({ ...current, steps: current.steps.map((step) => step.id === snapshot.id ? snapshot : step) }));
    }
    setStartSnapshot(null);
    setInspectorSnapshot(null);
    setInspectorNewId(null);
    setPropertiesOpen(false);
  };
  const prepareCopiedStep = (source, preservePaths = false) => {
    const step = JSON.parse(JSON.stringify(source));
    step.id = `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    step.label = source.label || getActionLabel(source.type);
    step.config = { ...(step.config || {}), apiName: flowApiName(`${step.label}_Copy`) };
    if (!preservePaths) {
      step.config.faultBranch = [];
      step.config.bodyBranch = [];
      step.config.branch = [];
      step.config.ifBranch = [];
      step.config.elseBranch = [];
      step.config.defaultBranch = [];
      if (Array.isArray(step.config.outcomes)) {
        step.config.outcomes = step.config.outcomes.map((outcome) => ({ ...outcome, branch: [] }));
      }
    }
    return step;
  };
  const insertPreparedStep = (step, index = workflow.steps.length, extraSteps = []) => {
    setWorkflow((current) => {
      if (!branchTarget) {
        return { ...current, steps: [...current.steps.slice(0, index), step, ...extraSteps, ...current.steps.slice(index)] };
      }
      if (branchTarget.kind && branchTarget.ownerId) {
        const ownerIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(branchTarget.ownerId));
        if (ownerIndex < 0) return { ...current, steps: [...current.steps, step, ...extraSteps] };
        const owner = current.steps[ownerIndex];
        const key = branchTarget.kind === "loop" ? "bodyBranch" : branchTarget.kind === "scheduled" ? "branch" : "faultBranch";
        const targetIds = [...(owner.config?.[key] || [])];
        const requestedPosition = Number.isInteger(branchTarget.position) ? branchTarget.position : targetIds.length;
        const branchPosition = Math.max(0, Math.min(requestedPosition, targetIds.length));
        let branchInsertAt = ownerIndex + 1;
        if (branchPosition > 0) {
          const previousIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(targetIds[branchPosition - 1]));
          if (previousIndex >= 0) branchInsertAt = previousIndex + 1;
        } else if (targetIds.length) {
          const firstIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(targetIds[0]));
          if (firstIndex >= 0) branchInsertAt = firstIndex;
        }
        const insertedIds = [step.id, ...extraSteps.map((item) => item.id)];
        const nextBranch = [...targetIds.slice(0, branchPosition), ...insertedIds, ...targetIds.slice(branchPosition)];
        const nextSteps = [...current.steps];
        nextSteps[ownerIndex] = {
          ...owner,
          config: {
            ...(owner.config || {}),
            [key]: nextBranch,
            ...(branchTarget.kind === "fault" ? { faultMode: ["ROUTE","RETRY"].includes(String(owner.config?.faultMode || "").toUpperCase()) ? owner.config.faultMode : "ROUTE" } : {}),
          },
        };
        nextSteps.splice(branchInsertAt, 0, step, ...extraSteps);
        return { ...current, steps: nextSteps };
      }
      const decisionIndex = current.steps.findIndex((candidate) => candidate.id === branchTarget.decisionId);
      if (decisionIndex < 0) return { ...current, steps: [...current.steps, step, ...extraSteps] };
      const decision = current.steps[decisionIndex];
      const outcomes = Array.isArray(decision.config?.outcomes) && decision.config.outcomes.length
        ? decision.config.outcomes.map((outcome) => ({ ...outcome, branch: [...(outcome.branch || [])] }))
        : [{
            id: "outcome-1",
            label: "Outcome 1",
            condition: decision.config?.condition || { type: "all", rules: [blankCondition()] },
            branch: [...(decision.config?.ifBranch || [])],
          }];
      let defaultBranch = Array.isArray(decision.config?.outcomes) && decision.config.outcomes.length
        ? [...(decision.config?.defaultBranch || [])]
        : [...(decision.config?.elseBranch || [])];
      const targetIds = branchTarget.outcomeId === "__default__"
        ? [...defaultBranch]
        : [...(outcomes.find((outcome) => String(outcome.id) === String(branchTarget.outcomeId))?.branch || [])];
      const requestedPosition = Number.isInteger(branchTarget.position) ? branchTarget.position : targetIds.length;
      const branchPosition = Math.max(0, Math.min(requestedPosition, targetIds.length));
      let branchInsertAt = decisionIndex + 1;
      if (branchPosition > 0) {
        const previousIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(targetIds[branchPosition - 1]));
        if (previousIndex >= 0) branchInsertAt = previousIndex + 1;
      } else if (targetIds.length) {
        const firstIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(targetIds[0]));
        if (firstIndex >= 0) branchInsertAt = firstIndex;
      }
      const insertedIds = [step.id, ...extraSteps.map((item) => item.id)];
      const nextBranchIds = [...targetIds.slice(0, branchPosition), ...insertedIds, ...targetIds.slice(branchPosition)];
      if (branchTarget.outcomeId === "__default__") defaultBranch = nextBranchIds;
      else {
        const outcomeIndex = outcomes.findIndex((outcome) => String(outcome.id) === String(branchTarget.outcomeId));
        if (outcomeIndex >= 0) outcomes[outcomeIndex] = { ...outcomes[outcomeIndex], branch: nextBranchIds };
      }
      const nextSteps = [...current.steps];
      nextSteps[decisionIndex] = {
        ...decision,
        config: { ...(decision.config || {}), outcomes, defaultBranch, condition: null, ifBranch: [], elseBranch: [] },
      };
      nextSteps.splice(branchInsertAt, 0, step, ...extraSteps);
      return { ...current, steps: nextSteps };
    });
    setSelectedId(step.id);
    setInspectorSnapshot(null);
    setInspectorNewId(step.id);
    setInsertAt(null);
    setBranchTarget(null);
    setPropertiesOpen(true);
  };
  const addFromPalette = (type, index = workflow.steps.length) => {
    if (type === "__CONNECT__") {
      const source = workflow.steps[Math.max(0, index - 1)];
      if (source) {
        setAutoConnectSourceId(source.id);
        setSelectedId(source.id);
        setPaletteOpen(false);
        setInsertAt(null);
        setBranchTarget(null);
      }
      return;
    }
    if (type === "__GROUP__") {
      createEmptyGroupAt(index);
      return;
    }
    const step = makeStep(type);
    const definition = registryOptions.find((option) => option.value === type);
    if (definition?.label) {
      step.label = definition.label;
      step.config.apiName = flowApiName(definition.label);
    }
    const targetGroupId = groupTargetId;
    insertPreparedStep(step, index);
    if (type === "SCREEN") {
      setWorkflow((current) => ({
        ...current,
        trigger: "manual",
        actionMetadata: { ...(current.actionMetadata || {}), flowType: "SCREEN_FLOW" },
      }));
    }
    if (targetGroupId) {
      setWorkflow((current) => ({
        ...current,
        actionMetadata: {
          ...(current.actionMetadata || {}),
          builderGroups: (current.actionMetadata?.builderGroups || []).map((group) => String(group.id) === String(targetGroupId)
            ? { ...group, stepIds: [...(group.stepIds || []), step.id], anchorBeforeId: group.anchorBeforeId || "__end__" }
            : group),
        },
      }));
      setGroupTargetId(null);
    }
  };
  const copyStep = (step) => setClipboard({ mode: "copy", step: JSON.parse(JSON.stringify(step)), steps: [JSON.parse(JSON.stringify(step))], bundle: [] });
  const toggleElementSelection = (stepId) => {
    const key = String(stepId);
    setSelectedElementIds((current) => current.includes(key) ? current.filter((id) => id !== key) : [...current, key]);
  };
  const copySelectedElements = ({ keepSelection = false } = {}) => {
    const selected = new Set(selectedElementIds.map(String));
    const steps = workflow.steps.filter((step) => selected.has(String(step.id))).map((step) => JSON.parse(JSON.stringify(step)));
    if (!steps.length) return;
    setClipboard({ mode: "copy", step: steps[0], steps, bundle: [] });
    if (!keepSelection) {
      setSelectionMode(false);
      setSelectedElementIds([]);
    }
  };
  const selectedStepsForBulkAction = () => workflow.steps.filter((step) => selectedElementIds.includes(String(step.id)));
  const bulkSelectionHasOwnedPaths = () => selectedStepsForBulkAction().some((step) => ownedPathsForStep(step).some((path) => path.ids?.length));
  const explainUnsafeBulkBranchAction = (action) => {
    setInfoDialog({
      title: `${action} branching elements individually`,
      type: "Selection safety",
      description: `One or more selected Decision/Loop elements own branch paths. ${action} them individually so you can choose which path to keep and avoid orphaning branch elements.`,
    });
  };
  const deleteSelectedElements = () => {
    if (!selectedElementIds.length) return;
    if (bulkSelectionHasOwnedPaths()) { explainUnsafeBulkBranchAction("Delete"); return; }
    removeStepSet(new Set(selectedElementIds.map(String)));
    setSelectedElementIds([]);
    setSelectionMode(false);
    setSelectedId("__start__");
    setPropertiesOpen(false);
  };
  const cutSelectedElements = () => {
    if (!selectedElementIds.length) return;
    if (bulkSelectionHasOwnedPaths()) { explainUnsafeBulkBranchAction("Cut"); return; }
    const selected = new Set(selectedElementIds.map(String));
    const steps = workflow.steps.filter((step) => selected.has(String(step.id))).map((step) => JSON.parse(JSON.stringify(step)));
    if (!steps.length) return;
    setClipboard({ mode: "cut", step: steps[0], steps, bundle: [] });
    removeStepSet(selected);
    setSelectedElementIds([]);
    setSelectionMode(false);
    setSelectedId("__start__");
    setPropertiesOpen(false);
  };
  const removeStepSet = (ids) => {
    const remove = new Set([...ids].map(String));
    setWorkflow((current) => ({
      ...current,
      steps: current.steps
        .filter((item) => !remove.has(String(item.id)))
        .map((item) => {
          let config = item.config || {};
          remove.forEach((id) => { config = stripStepReferences(config, id); });
          return { ...item, config };
        }),
    }));
  };
  const deleteStepWithPathChoice = (step, keepKey = "__none__") => {
    const paths = ownedPathsForStep(step);
    const keepPath = paths.find((path) => path.key === keepKey) || null;
    const keepIds = keepPath ? collectOwnedIds(keepPath.ids) : new Set();
    const removeIds = new Set([String(step.id)]);
    paths.filter((path) => path.key !== keepKey).forEach((path) => collectOwnedIds(path.ids, removeIds));
    keepIds.forEach((id) => removeIds.delete(String(id)));
    removeStepSet(removeIds);
    setSelectedId("__start__");
    setPropertiesOpen(false);
    setPathActionDialog(null);
  };
  const cutStepWithPathChoice = (step, keepKey = "__none__") => {
    const paths = ownedPathsForStep(step);
    const keepPath = paths.find((path) => path.key === keepKey) || null;
    const keepIds = keepPath ? collectOwnedIds(keepPath.ids) : new Set();
    const cutIds = new Set();
    paths.filter((path) => path.key !== keepKey).forEach((path) => collectOwnedIds(path.ids, cutIds));
    keepIds.forEach((id) => cutIds.delete(String(id)));
    let clipboardStep = keepPath ? clearOwnedPath(step, keepPath) : JSON.parse(JSON.stringify(step));
    const bundle = workflow.steps.filter((item) => cutIds.has(String(item.id))).map((item) => JSON.parse(JSON.stringify(item)));
    setClipboard({ mode: "cut", step: clipboardStep, steps: [clipboardStep], bundle });
    removeStepSet(new Set([String(step.id), ...cutIds]));
    setSelectedId("__start__");
    setPropertiesOpen(false);
    setPathActionDialog(null);
  };
  const requestDeleteStep = (step) => {
    const paths = ownedPathsForStep(step).filter((path) => path.ids?.length);
    if (!paths.length) return deleteStepWithPathChoice(step);
    setPathActionDialog({ mode: "delete", stepId: step.id, keepKey: "__none__", paths });
  };
  const requestCutStep = (step) => {
    const paths = ownedPathsForStep(step).filter((path) => path.ids?.length);
    if (!paths.length) return cutStepWithPathChoice(step);
    setPathActionDialog({ mode: "cut", stepId: step.id, keepKey: "__none__", paths });
  };
  const pasteClipboard = (index = workflow.steps.length) => {
    if (!clipboard?.step) return;
    const sources = Array.isArray(clipboard.steps) && clipboard.steps.length ? clipboard.steps : [clipboard.step];
    const prepared = sources.map((source) => prepareCopiedStep(source, clipboard.mode === "cut"));
    const first = prepared[0];
    const extras = [...prepared.slice(1), ...(clipboard.mode === "cut" ? (clipboard.bundle || []) : [])];
    insertPreparedStep(first, index, extras);
    if (clipboard.mode === "cut") setClipboard(null);
  };
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      const target = event.target;
      const editable = target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
        || target.isContentEditable
      );
      const key = String(event.key || "").toLowerCase();
      if (!editable && key === " " && !event.repeat) {
        spacePanRef.current = true;
        if (canvasRef.current?.contains(document.activeElement) || document.activeElement === document.body) event.preventDefault();
      }
      if (!editable && (event.ctrlKey || event.metaKey) && event.altKey) {
        if (key === "=" || key === "+") {
          event.preventDefault();
          setCanvasZoom((value) => Math.min(1.3, Number((value + .1).toFixed(1))));
          return;
        }
        if (key === "-") {
          event.preventDefault();
          setCanvasZoom((value) => Math.max(.5, Number((value - .1).toFixed(1))));
          return;
        }
        if (key === "1") {
          event.preventDefault();
          zoomToFit();
          return;
        }
        if (key === "0") {
          event.preventDefault();
          setCanvasZoom(1);
          return;
        }
      }
      if (!editable && key === "f6") {
        event.preventDefault();
        focusCycle();
        return;
      }
      if (!editable && key === "escape") {
        if (inspectorTransition) {
          event.preventDefault();
          setInspectorTransition(null);
          return;
        }
        if (connectPathDialog || groupDialog || pathActionDialog || insertAt != null || branchTarget || connectFromId || autoConnectSourceId || resourceMenuOpen || issuesOpen || infoDialog || shortcutHelpOpen) {
          event.preventDefault();
          setConnectPathDialog(null);
          setGroupDialog(null);
          setPathActionDialog(null);
          setInsertAt(null);
          setBranchTarget(null);
          setConnectFromId(null);
          setAutoConnectSourceId(null);
          setResourceMenuOpen(false);
          setIssuesOpen(false);
          setInfoDialog(null);
          setShortcutHelpOpen(false);
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          setSelectionMode(false);
          setSelectedElementIds([]);
          return;
        }
        if (propertiesOpen) {
          event.preventDefault();
          requestCloseInspector();
          return;
        }
      }
      if (!editable && layoutMode === "FREEFORM" && (key === "backspace" || key === "delete")) {
        if (selectedElementIds.length > 1) {
          event.preventDefault();
          deleteSelectedElements();
          return;
        }
        const id = selectedElementIds[0] || (selectedStep ? String(selectedStep.id) : null);
        if (id) {
          event.preventDefault();
          const step = workflow.steps.find((item) => String(item.id) === String(id));
          if (step) requestDeleteStep(step);
          return;
        }
      }
      if (!editable && (event.ctrlKey || event.metaKey) && key === "i" && selectedStep) {
        event.preventDefault();
        setInfoDialog({
          title: selectedStep.label || getActionLabel(selectedStep.type),
          type: SALESFORCE_CORE_ELEMENT_TYPES.has(selectedStep.type) ? getActionLabel(selectedStep.type) : "Action",
          description: selectedStep.config?.description || "No description has been added.",
        });
        return;
      }
      if (!editable && (event.ctrlKey || event.metaKey) && !event.altKey && key === "/") {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }
      if (editable || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoFlowChange();
        else undoFlowChange();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoFlowChange();
        return;
      }
      if (key === "c" && (selectedElementIds.length || selectedStep)) {
        event.preventDefault();
        if (selectedElementIds.length) copySelectedElements({ keepSelection: true });
        else copyStep(selectedStep);
        return;
      }
      if (key === "x" && (selectedElementIds.length || selectedStep)) {
        event.preventDefault();
        if (selectedElementIds.length > 1) cutSelectedElements();
        else {
          const step = selectedElementIds.length
            ? workflow.steps.find((item) => String(item.id) === String(selectedElementIds[0]))
            : selectedStep;
          if (step) requestCutStep(step);
        }
        return;
      }
      if (key === "v" && clipboard?.step) {
        event.preventDefault();
        if (branchTarget || insertAt != null) {
          pasteClipboard(insertAt == null ? workflow.steps.length : insertAt);
          return;
        }
        const selectedIsOwnedPath = selectedStep && workflow.steps.some((owner) => {
          const config = owner.config || {};
          const references = [
            ...(Array.isArray(config.outcomes) ? config.outcomes.flatMap((outcome) => outcome?.branch || []) : []),
            ...(config.defaultBranch || []),
            ...(config.ifBranch || []),
            ...(config.elseBranch || []),
            ...(config.bodyBranch || []),
            ...(config.faultBranch || []),
            ...(config.branch || []),
          ];
          return references.some((id) => String(id) === String(selectedStep.id));
        });
        const pasteIndex = selectedStep && !selectedIsOwnedPath && selectedIndex >= 0 ? selectedIndex + 1 : workflow.steps.length;
        pasteClipboard(pasteIndex);
      }
    };
    const onKeyUp = (event) => {
      if (String(event.key || "").toLowerCase() === " ") {
        spacePanRef.current = false;
        canvasPanRef.current = null;
        setCanvasPanning(false);
      }
    };
    const onWindowBlur = () => {
      spacePanRef.current = false;
      canvasPanRef.current = null;
      setCanvasPanning(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [selectedStep, selectedIndex, selectedElementIds, clipboard, branchTarget, insertAt, workflow.steps, layoutMode, propertiesOpen, inspectorTransition]);
  const undoFlowChange = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    applyingHistoryRef.current = true;
    setWorkflow(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current].value)));
  };
  const redoFlowChange = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    applyingHistoryRef.current = true;
    setWorkflow(JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current].value)));
  };
  const zoomToFit = () => {
    const canvas = canvasRef.current;
    const lane = laneRef.current;
    if (!canvas || !lane) return;
    const currentZoom = canvasZoom || 1;
    const naturalWidth = lane.scrollWidth / currentZoom;
    const naturalHeight = lane.scrollHeight / currentZoom;
    const availableWidth = Math.max(1, canvas.clientWidth - 40);
    const availableHeight = Math.max(1, canvas.clientHeight - 70);
    const next = Math.max(.5, Math.min(1.3, availableWidth / Math.max(1, naturalWidth), availableHeight / Math.max(1, naturalHeight)));
    setCanvasZoom(Number(next.toFixed(2)));
  };
  const detachStepFromOwnedPaths = (steps, stepId) => steps.map((item) => ({ ...item, config: stripStepReferences(item.config || {}, stepId) }));
  const connectFreeformElements = (sourceId, targetId, pathChoice = null) => {
    if (!sourceId || !targetId || String(sourceId) === String(targetId) || String(targetId) === "__start__") {
      setConnectFromId(null);
      return;
    }
    const sourcePreview = workflow.steps.find((item) => String(item.id) === String(sourceId));
    const sourcePreviewType = String(sourcePreview?.type || "").toUpperCase();
    if (pathChoice == null && ["CONDITION", "LOOP"].includes(sourcePreviewType)) {
      const outcomes = sourcePreviewType === "CONDITION"
        ? (Array.isArray(sourcePreview?.config?.outcomes) && sourcePreview.config.outcomes.length
          ? sourcePreview.config.outcomes
          : [{ id: "outcome-1", label: "Outcome 1", branch: sourcePreview?.config?.ifBranch || [] }])
        : [];
      setConnectPathDialog({
        sourceId: String(sourceId),
        targetId: String(targetId),
        sourceType: sourcePreviewType,
        sourceLabel: sourcePreview?.label || getActionLabel(sourcePreview?.type),
        pathChoice: sourcePreviewType === "CONDITION" ? `decision:${outcomes[0]?.id || "outcome-1"}` : "loop:body",
        paths: sourcePreviewType === "CONDITION"
          ? [
              ...outcomes.map((outcome, index) => ({ value: `decision:${outcome.id || `outcome-${index + 1}`}`, label: outcome.label || `Outcome ${index + 1}` })),
              { value: "decision:__default__", label: sourcePreview?.config?.defaultLabel || "Default Outcome" },
            ]
          : [
              { value: "loop:body", label: "For Each Item" },
              { value: "loop:after", label: "After Last" },
            ],
      });
      return;
    }
    setWorkflow((current) => {
      let steps = detachStepFromOwnedPaths(current.steps, targetId);
      const targetIndex = steps.findIndex((item) => String(item.id) === String(targetId));
      if (targetIndex < 0) return current;
      const target = steps[targetIndex];
      steps.splice(targetIndex, 1);

      if (String(sourceId) === "__start__") {
        const firstExecutable = steps.findIndex((item) => !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(item.type) && item.config?.resourceOnly !== true);
        const insertAt = firstExecutable < 0 ? steps.length : firstExecutable;
        steps.splice(insertAt, 0, target);
        return {
          ...current,
          steps,
          actionMetadata: {
            ...(current.actionMetadata || {}),
            builderLayout: {
              ...(current.actionMetadata?.builderLayout || {}),
              mode: "FREEFORM",
              startStepId: target.id,
            },
          },
        };
      }

      const sourceIndex = steps.findIndex((item) => String(item.id) === String(sourceId));
      if (sourceIndex < 0) {
        steps.push(target);
        return { ...current, steps };
      }
      const source = steps[sourceIndex];
      const sourceType = String(source.type || "").toUpperCase();

      if (sourceType === "CONDITION") {
        const outcomes = Array.isArray(source.config?.outcomes) && source.config.outcomes.length
          ? source.config.outcomes.map((outcome) => ({ ...outcome, branch: [...(outcome.branch || [])] }))
          : [{ id: "outcome-1", label: "Outcome 1", condition: source.config?.condition || { type: "all", rules: [blankCondition()] }, branch: [...(source.config?.ifBranch || [])] }];
        let defaultBranch = [...(source.config?.defaultBranch || source.config?.elseBranch || [])];
        if (String(pathChoice) === "decision:__default__") {
          defaultBranch = [...defaultBranch, target.id];
        } else {
          const outcomeId = String(pathChoice || "").replace(/^decision:/, "");
          const outcomeIndex = Math.max(0, outcomes.findIndex((outcome, index) => String(outcome.id || `outcome-${index + 1}`) === outcomeId));
          outcomes[outcomeIndex] = { ...outcomes[outcomeIndex], branch: [...(outcomes[outcomeIndex].branch || []), target.id] };
        }
        steps[sourceIndex] = { ...source, config: { ...(source.config || {}), outcomes, defaultBranch, ifBranch: [], elseBranch: [] } };
        steps.splice(sourceIndex + 1, 0, target);
        return { ...current, steps };
      }

      if (sourceType === "LOOP") {
        if (String(pathChoice) === "loop:after") {
          steps[sourceIndex] = { ...source, config: { ...(source.config || {}), nextStepId: target.id } };
        } else {
          steps[sourceIndex] = { ...source, config: { ...(source.config || {}), bodyBranch: [...(source.config?.bodyBranch || []), target.id] } };
        }
        steps.splice(sourceIndex + 1, 0, target);
        return { ...current, steps };
      }

      steps[sourceIndex] = { ...source, config: { ...(source.config || {}), nextStepId: target.id } };
      steps.splice(sourceIndex + 1, 0, target);
      return { ...current, steps };
    });
    setConnectFromId(null);
  };
    const addFreeformElement = (type, position) => {
    const step = makeStep(type);
    const definition = registryOptions.find((option) => option.value === type);
    if (definition?.label) {
      step.label = definition.label;
      step.config.apiName = flowApiName(definition.label);
    }
    setWorkflow((current) => ({
      ...current,
      steps: [...current.steps, step],
      actionMetadata: {
        ...(current.actionMetadata || {}),
        builderLayout: {
          ...(current.actionMetadata?.builderLayout || {}),
          mode: "FREEFORM",
          positions: {
            ...(current.actionMetadata?.builderLayout?.positions || {}),
            [step.id]: { x: Math.max(10, Math.round(position.x)), y: Math.max(10, Math.round(position.y)) },
          },
        },
      },
    }));
    setSelectedId(step.id);
    setInspectorSnapshot(null);
    setInspectorNewId(step.id);
    setPropertiesOpen(true);
  };
  const freeformEdges = () => {
    const edges = [];
    const addChain = (ids, sourceId = null) => {
      const clean = (ids || []).map(String).filter((id) => workflow.steps.some((step) => String(step.id) === id));
      if (sourceId && clean[0]) edges.push([String(sourceId), clean[0]]);
      clean.forEach((id, index) => { if (clean[index + 1]) edges.push([id, clean[index + 1]]); });
    };
    const owned = new Set();
    workflow.steps.forEach((owner) => {
      const config = owner.config || {};
      if (owner.type === "CONDITION") {
        const outcomes = Array.isArray(config.outcomes) && config.outcomes.length ? config.outcomes : [{ branch: config.ifBranch || [] }];
        outcomes.forEach((outcome) => { (outcome.branch || []).forEach((id) => owned.add(String(id))); addChain(outcome.branch, owner.id); });
        const defaultIds = config.defaultBranch || config.elseBranch || [];
        defaultIds.forEach((id) => owned.add(String(id)));
        addChain(defaultIds, owner.id);
      }
      if (owner.type === "LOOP") {
        (config.bodyBranch || []).forEach((id) => owned.add(String(id)));
        addChain(config.bodyBranch || [], owner.id);
      }
      if (["ROUTE","RETRY"].includes(String(config.faultMode || "FAIL").toUpperCase())) {
        (config.faultBranch || []).forEach((id) => owned.add(String(id)));
        addChain(config.faultBranch || [], owner.id);
      }
      if (owner.type === "SCHEDULE_PATH") {
        (config.branch || []).forEach((id) => owned.add(String(id)));
        addChain(config.branch || [], "__start__");
      }
    });
    const top = workflow.steps.filter((step) => !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(step.type) && step.config?.resourceOnly !== true && !owned.has(String(step.id)));
    const explicitStart = workflow.actionMetadata?.builderLayout?.startStepId;
    const startTarget = explicitStart && top.some((step) => String(step.id) === String(explicitStart)) ? explicitStart : top[0]?.id;
    if (startTarget) edges.push(["__start__", String(startTarget)]);
    top.forEach((step, index) => {
      const explicitNext = step.config?.nextStepId;
      const next = explicitNext && top.some((candidate) => String(candidate.id) === String(explicitNext)) ? explicitNext : top[index + 1]?.id;
      if (next) edges.push([String(step.id), String(next)]);
    });
    return edges;
  };
  const onCanvasPointerDown = (event) => {
    const shouldPan = event.button === 1 || (event.button === 0 && spacePanRef.current);
    if (!shouldPan || !canvasRef.current) return;
    event.preventDefault();
    canvasPanRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: canvasRef.current.scrollLeft,
      scrollTop: canvasRef.current.scrollTop,
    };
    setCanvasPanning(true);
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch {}
  };
  const onCanvasPointerMove = (event) => {
    const pan = canvasPanRef.current;
    const canvas = canvasRef.current;
    if (!pan || !canvas || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    canvas.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  };
  const stopCanvasPan = (event) => {
    const pan = canvasPanRef.current;
    if (!pan || (event?.pointerId != null && pan.pointerId !== event.pointerId)) return;
    canvasPanRef.current = null;
    setCanvasPanning(false);
    try { event?.currentTarget?.releasePointerCapture?.(pan.pointerId); } catch {}
  };
  const onCanvasWheel = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -.1 : .1;
      setCanvasZoom((value) => Math.max(.5, Math.min(1.3, Number((value + delta).toFixed(1)))));
      return;
    }
    if (event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      canvas.scrollLeft += event.deltaY;
    }
  };
  const onFreeformDrop = (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/x-oneengine-flow-element");
    if (!type) return;
    const rect = event.currentTarget.getBoundingClientRect();
    addFreeformElement(type, {
      x: (event.clientX - rect.left + event.currentTarget.scrollLeft) / Math.max(.1, canvasZoom) - 125,
      y: (event.clientY - rect.top + event.currentTarget.scrollTop) / Math.max(.1, canvasZoom) - 32,
    });
  };
  const onFreeformDragEnd = (event, stepId, index) => {
    const canvas = canvasRef.current;
    if (!canvas || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const rect = canvas.getBoundingClientRect();
    const current = getFreeformPosition(stepId, index);
    const x = (event.clientX - rect.left + canvas.scrollLeft) / Math.max(.1, canvasZoom) - 125;
    const y = (event.clientY - rect.top + canvas.scrollTop) / Math.max(.1, canvasZoom) - 32;
    if (event.clientX === 0 && event.clientY === 0) {
      setFreeformPosition(stepId, current);
      return;
    }
    setFreeformPosition(stepId, { x, y });
  };
    const addFaultPath = (step) => {
    const index = workflow.steps.findIndex((item) => item.id === step.id);
    if (index < 0 || !flowElementSupportsFaultPath(step.type)) return;
    updateStep(index, { config: { ...(step.config || {}), faultMode: "ROUTE", faultBranch: step.config?.faultBranch || [] } });
    setBranchTarget({ kind: "fault", ownerId: step.id, position: (step.config?.faultBranch || []).length });
    setInsertAt(null);
    setPaletteTab("elements");
    setPaletteOpen(true);
  };
  const registeredActionOptions = registryOptions
    .filter((option) => !SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["WHEN","CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH","STOP"].includes(option.value));
  const paletteOptions = [
    ...(layoutMode === "AUTO" ? [{ value: "__GROUP__", label: "Group", description: "Organize related elements in a named, collapsible section.", category: "Logic" }] : []),
    ...(layoutMode === "AUTO" && insertAt != null && !branchTarget && insertAt > 0 ? [{ value: "__CONNECT__", label: "Connect to element", description: "Create a Go To connector to a nonconsecutive element.", category: "Logic" }] : []),
    ...registryOptions
      .filter((option) => SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(option.value))
      .map((option) => ({ ...option, category: option.value === "RUN_SUBFLOW" ? "Interaction" : workflowActionCategory(option.value) })),
    ...registeredActionOptions.map((option) => ({
      ...option,
      category: option.category || workflowActionCategory(option.value) || "App Actions",
    })),
  ];
  const matchesPaletteQuery = (option, query) => !query.trim() || `${option.label || option.value} ${option.description || ""} ${option.category || ""}`.toLowerCase().includes(query.trim().toLowerCase());
  const palette = paletteOptions.filter((option) => matchesPaletteQuery(option, paletteSearch));
  const addElementPalette = paletteOptions.filter((option) => matchesPaletteQuery(option, addElementSearch));
  const groupPalette = (options) => options.reduce((groups, option) => {
    const category = option.category || "App Actions";
    if (!groups[category]) groups[category] = [];
    groups[category].push(option);
    return groups;
  }, {});
  const paletteGroups = groupPalette(palette);
  const addElementPaletteGroups = groupPalette(addElementPalette);
  const paletteInsertionActive = insertAt != null || Boolean(branchTarget);
  useEffect(() => {
    if (paletteInsertionActive) setAddElementSearch("");
  }, [insertAt, branchTarget]);
  const globalResources = [
    { label: "$Record", detail: "The record that triggered the flow", type: "Global Variable" },
    { label: "$Record__Prior", detail: "The record values before the triggering update", type: "Global Variable" },
    { label: "$User", detail: "The user running the flow", type: "Global Variable" },
    { label: "$Flow.CurrentDateTime", detail: "The date and time when this flow runs", type: "Global Variable" },
    { label: "$Flow.CurrentStage", detail: "The current Screen Flow stage", type: "Global Variable" },
    { label: "$Flow.ActiveStages", detail: "Ordered active Screen Flow stages", type: "Global Variable" },
  ];
  const stepResources = workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog);
  const resourceSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => ["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(step.type) || (step.type === "ASSIGNMENT" && step.config?.resourceOnly === true));
  const managerElementSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(step.type) && step.config?.resourceOnly !== true);
  const scheduledPathSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.type === "SCHEDULE_PATH");
  const faultTargetIds = new Set(workflow.steps.flatMap((step) => {
    const mode = String(step.config?.faultMode || "FAIL").toUpperCase();
    return ["ROUTE","RETRY"].includes(mode) ? (step.config?.faultBranch || []).map(String) : [];
  }));
  const ownedCanvasTargetIds = new Set(workflow.steps.flatMap((step) => {
    const owned = [];
    if (step.type === "CONDITION") {
      const outcomes = Array.isArray(step.config?.outcomes) && step.config.outcomes.length
        ? step.config.outcomes
        : [{ branch: step.config?.ifBranch || [] }];
      owned.push(...outcomes.flatMap((outcome) => outcome.branch || []), ...(step.config?.defaultBranch || step.config?.elseBranch || []));
    }
    if (step.type === "LOOP") owned.push(...(step.config?.bodyBranch || []));
    if (step.type === "SCHEDULE_PATH") owned.push(...(step.config?.branch || []));
    if (["ROUTE","RETRY"].includes(String(step.config?.faultMode || "FAIL").toUpperCase())) owned.push(...(step.config?.faultBranch || []));
    return owned.map(String);
  }));
  const visibleCanvasSteps = managerElementSteps.filter(({ step }) => !ownedCanvasTargetIds.has(String(step.id)));
  const branchStepById = new Map(workflow.steps.map((step) => [String(step.id), step]));
  const incomingPathCount = (stepId) => workflow.steps.reduce((count, owner) => {
    const config = owner.config || {};
    const references = [
      ...(Array.isArray(config.outcomes) ? config.outcomes.flatMap((outcome) => outcome?.branch || []) : []),
      ...(config.defaultBranch || []),
      ...(config.ifBranch || []),
      ...(config.elseBranch || []),
      ...(config.bodyBranch || []),
      ...(config.faultBranch || []),
      ...(config.branch || []),
    ];
    return count + references.filter((id) => String(id) === String(stepId)).length;
  }, 0);
  const stepOutputCount = (stepId) => stepResources.filter((resource) => String(resource.value || "").startsWith(`steps.${stepId}.`)).length;
  const resourceUsageCount = (step) => {
    const resourceName = step.type === "ASSIGNMENT" ? step.config?.variableName : step.config?.resourceName;
    if (!resourceName) return 0;
    const needle = `variables.${resourceName}`;
    return workflow.steps.filter((candidate) => candidate.id !== step.id && JSON.stringify(candidate.config || {}).includes(needle)).length;
  };
  const addScheduledPath = () => {
    const path = makeStep("SCHEDULE_PATH");
    path.label = "Scheduled Path";
    const insertAt = workflow.steps.findIndex((step) => !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE","SCHEDULE_PATH"].includes(step.type));
    const target = insertAt < 0 ? workflow.steps.length : insertAt;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, target), path, ...current.steps.slice(target)] }));
    setSelectedId("__start__");
  };
  const updateScheduledPath = (index, patch) => updateStep(index, { config: { ...(workflow.steps[index]?.config || {}), ...patch } });
  const removeScheduledPath = (index) => {
    const scheduledPath = workflow.steps[index];
    if (scheduledPath) deleteStepWithPathChoice(scheduledPath, "__none__");
  };
  const addResource = (type) => {
    const resource = type === "VARIABLE" ? makeStep("ASSIGNMENT") : makeStep(type);
    if (type === "VARIABLE") {
      resource.label = "Variable";
      resource.config = { ...resource.config, resourceOnly: true, variableName: "", variableType: "text", operator: "set", value: "", availableForInput: false, availableForOutput: false };
    } else {
      resource.label = getActionLabel(type);
      resource.config = { ...resource.config, resourceOnly: true };
    }
    const firstActionIndex = workflow.steps.findIndex((step) => !["CONSTANT","FORMULA","TEXT_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(step.type) && step.config?.resourceOnly !== true);
    const insertAt = firstActionIndex < 0 ? workflow.steps.length : firstActionIndex;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, insertAt), resource, ...current.steps.slice(insertAt)] }));
    setSelectedId(resource.id);
    setInspectorSnapshot(null);
    setInspectorNewId(resource.id);
    setPropertiesOpen(true);
    setResourceMenuOpen(false);
  };
  const pathActionStep = pathActionDialog ? workflow.steps.find((item) => String(item.id) === String(pathActionDialog.stepId)) : null;
  const resourceQuery = paletteSearch.trim().toLowerCase();
  const visibleGlobalResources = globalResources.filter((item) => !resourceQuery || `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(resourceQuery));
  const visibleStepResources = stepResources.filter((item) => !resourceQuery || `${item.label} ${item.type}`.toLowerCase().includes(resourceQuery));

  const builderErrors = workflow.steps
    .map((step, index) => ({ step, index, message: workflowActionIssue(step, registryOptions.find((option) => option.value === step.type) || null) }))
    .filter((item) => item.message);
  const builderWarnings = workflow.steps
    .map((step, index) => ({ step, index, message: !String(step.config?.description || "").trim() && step.config?.resourceOnly !== true ? "Consider adding a description so other builders can understand this element." : "" }))
    .filter((item) => item.message);
  const builderErrorByStepId = new Map(builderErrors.map((item) => [String(item.step.id), item.message]));
  const totalBuilderErrors = builderErrors.length + flowIssues.length;
  const openFlowIssue = (issue) => {
    setIssuesOpen(false);
    if (issue.target === "start") {
      inspectStart();
      onGuideStepChange?.("trigger");
      return;
    }
    if (issue.target === "properties") {
      onOpenFlowProperties?.();
      return;
    }
    if (issue.target === "resources") {
      setPaletteTab("manager");
      setPaletteOpen(true);
      setManagerFilter("all");
    }
  };
  const focusCycle = () => {
    const panels = [paletteRef.current, canvasRef.current, propertiesRef.current].filter(Boolean);
    if (!panels.length) return;
    const active = document.activeElement;
    const currentIndex = panels.findIndex((panel) => panel === active || panel?.contains?.(active));
    const next = panels[(currentIndex + 1 + panels.length) % panels.length];
    next?.focus?.();
  };

  const builderGroups = Array.isArray(workflow.actionMetadata?.builderGroups) ? workflow.actionMetadata.builderGroups : [];
  const groupForStep = (stepId) => builderGroups.find((group) => (group.stepIds || []).map(String).includes(String(stepId))) || null;
  const firstStepIdForGroup = (group) => (group?.stepIds || []).find((id) => visibleCanvasSteps.some(({ step }) => String(step.id) === String(id))) || null;
  const anchoredGroupBeforeStep = (stepId) => builderGroups.find((group) => !(group.stepIds || []).length && String(group.anchorBeforeId || "__end__") === String(stepId)) || null;
  const endAnchoredGroups = builderGroups.filter((group) => !(group.stepIds || []).length && String(group.anchorBeforeId || "__end__") === "__end__");
  const connectAutoLayoutTarget = (targetId) => {
    const sourceIndex = workflow.steps.findIndex((step) => String(step.id) === String(autoConnectSourceId));
    const targetIndex = workflow.steps.findIndex((step) => String(step.id) === String(targetId));
    if (sourceIndex < 0 || targetIndex <= sourceIndex) {
      setAutoConnectSourceId(null);
      return;
    }
    updateStep(sourceIndex, { config: { ...(workflow.steps[sourceIndex]?.config || {}), nextStepId: targetId } });
    setSelectedId(targetId);
    setAutoConnectSourceId(null);
    setPropertiesOpen(true);
  };
    const createEmptyGroupAt = (index = workflow.steps.length) => {
    const nextVisible = visibleCanvasSteps.find(({ index: stepIndex }) => stepIndex >= index)?.step?.id || "__end__";
    setGroupDialog({ mode: "empty", label: "New Group", description: "", anchorBeforeId: String(nextVisible), selectedIds: [] });
  };
  const addElementInsideGroup = (groupId, index) => {
    setGroupTargetId(groupId);
    setBranchTarget(null);
    setInsertAt(index);
    setPaletteTab("elements");
    setPaletteOpen(true);
  };
    const createGroupFromSelection = () => {
    const selected = visibleCanvasSteps.filter(({ step }) => selectedElementIds.includes(String(step.id))).map(({ step }) => String(step.id));
    if (!selected.length) return;
    setGroupDialog({ mode: "selection", label: "New Group", description: "", anchorBeforeId: null, selectedIds: selected });
  };
  const deleteGroup = (groupId) => setWorkflow((current) => ({
    ...current,
    actionMetadata: {
      ...(current.actionMetadata || {}),
      builderGroups: (current.actionMetadata?.builderGroups || []).filter((group) => String(group.id) !== String(groupId)),
    },
  }));
  const saveGroupDialog = () => {
    const label = String(groupDialog?.label || "").trim();
    if (!label) return;
    const selected = Array.isArray(groupDialog?.selectedIds) ? groupDialog.selectedIds.map(String) : [];
    const group = {
      id: `group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
      apiName: flowApiName(label),
      description: String(groupDialog?.description || "").trim(),
      stepIds: groupDialog?.mode === "selection" ? selected : [],
      ...(groupDialog?.mode === "empty" ? { anchorBeforeId: String(groupDialog?.anchorBeforeId || "__end__") } : {}),
    };
    setWorkflow((current) => {
      const existing = current.actionMetadata?.builderGroups || [];
      const cleaned = groupDialog?.mode === "selection"
        ? existing.map((item) => ({ ...item, stepIds: (item.stepIds || []).filter((id) => !selected.includes(String(id))) })).filter((item) => item.stepIds.length || item.anchorBeforeId)
        : existing;
      return {
        ...current,
        actionMetadata: {
          ...(current.actionMetadata || {}),
          builderGroups: [...cleaned, group],
        },
      };
    });
    if (groupDialog?.mode === "selection") {
      setSelectionMode(false);
      setSelectedElementIds([]);
    }
    setInsertAt(null);
    setBranchTarget(null);
    setGroupTargetId(null);
    setPaletteOpen(true);
    setPaletteTab("elements");
    setGroupDialog(null);
  };
  const renameDecisionPath = (ownerId, outcomeId, label) => {
    const ownerIndex = workflow.steps.findIndex((item) => String(item.id) === String(ownerId));
    if (ownerIndex < 0) return;
    const owner = workflow.steps[ownerIndex];
    if (outcomeId === "__default__") {
      updateStep(ownerIndex, { config: { ...(owner.config || {}), defaultLabel: label } });
      return;
    }
    const outcomes = (owner.config?.outcomes || []).map((outcome) => {
      if (String(outcome.id) !== String(outcomeId)) return outcome;
      const previousGenerated = flowApiName(outcome.label || "");
      return { ...outcome, label, apiName: !outcome.apiName || outcome.apiName === previousGenerated ? flowApiName(label) : outcome.apiName };
    });
    updateStep(ownerIndex, { config: { ...(owner.config || {}), outcomes } });
  };

  function openPath(target) {
    setGroupTargetId(null);
    setBranchTarget(target);
    setInsertAt(null);
    setPaletteTab("elements");
    setPaletteOpen(true);
  }

  function pathTarget(kind, ownerId, outcomeId, position) {
    return kind === "decision"
      ? { decisionId: ownerId, outcomeId, position }
      : { kind, ownerId, position };
  }

  function renderDecisionConnectorSvg(pathCount) {
    const count = Math.max(1, Number(pathCount || 1));
    const centers = Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * 100);
    return (
      <svg className="workflow-decision-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="workflow-decision-connector-path" d="M50 0 V14" />
        {centers.map((x, index) => (
          <path key={`split-${index}`} className="workflow-decision-connector-path" d={`M50 14 H${x} V29`} />
        ))}
        {centers.map((x, index) => (
          <path key={`merge-${index}`} className="workflow-decision-connector-path" d={`M${x} 71 V86 H50`} />
        ))}
        <path className="workflow-decision-connector-path" d="M50 86 V100" />
      </svg>
    );
  }

  function renderOwnedPath({ ownerId, kind, ids = [], label, outcomeId = null, tone = "", depth = 0, ancestry = [] }) {
    const children = ids.map((id) => branchStepById.get(String(id))).filter(Boolean);
    return (
      <div key={`${ownerId}-${kind}-${outcomeId || label}`} className={`workflow-branch-path ${!children.length ? "is-empty" : ""} ${tone ? `is-${tone}` : ""} ${highlightedPathKey === `${ownerId}:${kind}:${outcomeId || label}` ? "is-highlighted" : ""}`} onClick={() => setHighlightedPathKey(`${ownerId}:${kind}:${outcomeId || label}`)}>
        <span className="workflow-branch-line" />
        {kind === "decision" ? <span className="workflow-branch-merge-line" aria-hidden="true" /> : null}
        {kind === "decision" ? <input className="workflow-branch-label-input" aria-label={`Decision path ${label}`} value={label} onClick={(event) => event.stopPropagation()} onChange={(event) => renameDecisionPath(ownerId, outcomeId, event.target.value)} /> : <span className="workflow-branch-label">{label}</span>}
        <div className="workflow-branch-stack">
          <button type="button" className="workflow-branch-add" aria-label={`Add first element to ${label}`} onClick={() => openPath(pathTarget(kind, ownerId, outcomeId, 0))}>+</button>
          {children.map((child, childIndex) => {
            const childVisual = flowElementVisual(child.type);
            const childIndexInFlow = workflow.steps.findIndex((item) => item.id === child.id);
            const childCanCollapse = ["CONDITION","LOOP"].includes(child.type);
            const childCollapsed = collapsedBranches[child.id] === true;
            return (
              <div key={child.id} className="workflow-owned-step">
                <div className="workflow-branch-node-row">
                  <button type="button" data-node-type={child.type} className={`workflow-branch-node-card workflow-canvas-component-card ${selectedId === child.id || selectedElementIds.includes(String(child.id)) ? "is-selected" : ""}`} onClick={() => selectionMode ? toggleElementSelection(child.id) : inspectStep(child.id)}>
                    <span className="workflow-branch-node-icon" style={{ background: childVisual.color }}>{childVisual.icon}</span>
                    <span><small>{SALESFORCE_CORE_ELEMENT_TYPES.has(child.type) ? getActionLabel(child.type) : "Action"}</small><strong>{child.label || getActionLabel(child.type)}</strong></span>
                  </button>
                  {childCanCollapse ? <button type="button" className="workflow-branch-collapse" aria-label={childCollapsed ? "Expand paths" : "Collapse paths"} onClick={() => toggleBranchCollapse(child.id, !childCollapsed)}>{childCollapsed ? "▸" : "▾"}</button> : null}
                  <details className="workflow-node-menu branch-menu">
                    <summary aria-label={`Open actions for ${child.label || getActionLabel(child.type)}`}>⋮</summary>
                    <div className="workflow-node-menu-popover">
                      <button type="button" onClick={() => inspectStep(child.id)}>Edit Element</button>
                      <button type="button" onClick={() => copyStep(child)}>Copy Element</button>
                      <button type="button" onClick={() => requestCutStep(child)}>Cut Element</button>
                      {flowElementSupportsFaultPath(child.type) ? <button type="button" onClick={() => addFaultPath(child)}>Add Fault Path</button> : null}
                      <button type="button" className="is-danger" onClick={() => requestDeleteStep(child)}>Delete Element</button>
                    </div>
                  </details>
                </div>
                {renderNestedPaths(child, depth + 1, ancestry)}
                <button type="button" className="workflow-branch-add" aria-label={`Add element after ${child.label || getActionLabel(child.type)}`} onClick={() => openPath(pathTarget(kind, ownerId, outcomeId, childIndex + 1))}>+</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderNestedPaths(owner, depth = 0, ancestry = []) {
    if (!owner?.id || depth > 5 || ancestry.includes(String(owner.id))) return null;
    const next = [...ancestry, String(owner.id)];
    const collapsed = collapsedBranches[owner.id] === true;
    const blocks = [];
    if (owner.type === "CONDITION") {
      const outcomes = Array.isArray(owner.config?.outcomes) && owner.config.outcomes.length
        ? owner.config.outcomes
        : [{ id: "outcome-1", label: "Outcome 1", branch: owner.config?.ifBranch || [] }];
      const paths = outcomes.map((outcome, i) => ({ id: outcome.id || `outcome-${i + 1}`, label: outcome.label || `Outcome ${i + 1}`, ids: outcome.branch || [] }));
      paths.push({ id: "__default__", label: owner.config?.defaultLabel || "Default Outcome", ids: owner.config?.defaultBranch || owner.config?.elseBranch || [] });
      blocks.push(
        <div key="decision" className="workflow-decision-stage workflow-decision-stage--nested">
          {renderDecisionConnectorSvg(paths.length)}
          <span className="workflow-decision-stem workflow-decision-stem--in" aria-hidden="true" />
          <span className="workflow-decision-rail workflow-decision-rail--top" aria-hidden="true" />
          <div className="workflow-branch-map workflow-decision-map workflow-nested-map" style={{ "--workflow-branch-edge": `${50 / Math.max(1, paths.length)}%` }}>
            {paths.map((p) => renderOwnedPath({ ownerId: owner.id, kind: "decision", outcomeId: p.id, ids: p.ids, label: p.label, depth, ancestry: next }))}
          </div>
          <span className="workflow-decision-rail workflow-decision-rail--bottom" aria-hidden="true" />
          <span className="workflow-decision-stem workflow-decision-stem--out" aria-hidden="true" />
        </div>
      );
    }
    if (owner.type === "LOOP" && !collapsed) {
      blocks.push(<div key="loop" className="workflow-branch-map workflow-branch-map-single workflow-nested-map">{renderOwnedPath({ ownerId: owner.id, kind: "loop", ids: owner.config?.bodyBranch || [], label: "For Each Item", depth, ancestry: next })}</div>);
    }
    if (["ROUTE","RETRY"].includes(String(owner.config?.faultMode || "FAIL").toUpperCase())) {
      blocks.push(<div key="fault" className="workflow-branch-map workflow-branch-map-single workflow-nested-map">{renderOwnedPath({ ownerId: owner.id, kind: "fault", ids: owner.config?.faultBranch || [], label: "Fault", tone: "fault", depth, ancestry: next })}</div>);
    }
    return blocks.length ? <div className="workflow-nested-paths">{blocks}</div> : null;
  }

  return (
    <div className={`workflow-visual-shell ${!paletteOpen ? "palette-collapsed" : ""} ${!propertiesOpen ? "properties-collapsed" : ""}`}>
      {paletteOpen ? <aside ref={paletteRef} tabIndex={-1} className="workflow-node-palette">
        <div className="workflow-toolbox-title">Toolbox</div>
        <div className="workflow-palette-head">
          <div className="workflow-palette-tabs inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "elements" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("elements")}>Elements</button>
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "resources" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("resources")}>Manager</button>
          </div>
        </div>
        <div className="workflow-palette-search">
          <span>⌕</span>
          <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={paletteTab === "elements" ? "Search elements..." : "Search manager..."} aria-label={paletteTab === "elements" ? "Search flow elements" : "Search flow manager"} />
        </div>
        {paletteTab === "elements" ? (
          <>
            <p className="workflow-palette-help">{layoutMode === "FREEFORM" ? "Drag an element onto the canvas." : autoConnectSourceId ? "Select the element that this Go To connector should target." : branchTarget ? "Choose an element for this path." : insertAt == null ? "Use a + insertion point on the canvas to add an element or Group." : "Choose an element, Group, or Connect to element."}</p>
            <div className="workflow-palette-scroll">
              {Object.entries(paletteGroups).map(([category, options]) => (
                <div key={category}>
                  <div className="workflow-palette-group-title">{category}</div>
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      title={option.description || option.label}
                      aria-label={option.label || option.value}
                      onClick={() => { if (layoutMode !== "FREEFORM" && paletteInsertionActive) addFromPalette(option.value, insertAt == null ? workflow.steps.length : insertAt); }}
                      draggable={layoutMode === "FREEFORM"}
                      onDragStart={(event) => { if (layoutMode === "FREEFORM") event.dataTransfer.setData("application/x-oneengine-flow-element", option.value); }}
                      disabled={layoutMode !== "FREEFORM" && !paletteInsertionActive}
                      className={`workflow-palette-item ${layoutMode !== "FREEFORM" && !paletteInsertionActive ? "is-browse-only" : ""}`}
                    >
                      <span className="workflow-palette-icon" style={{ background: flowElementVisual(option.value).color }}>{flowElementVisual(option.value).icon}</span>
                      <span className="workflow-palette-item-copy">
                        <strong>{option.label}</strong>
                        {option.description ? <small>{option.description}</small> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {!palette.length ? <div className="workflow-palette-empty">No matching elements</div> : null}
            </div>
          </>
        ) : (
          <>
            <p className="workflow-palette-help">View all flow elements and resources. Select any item to inspect it.</p>
            <div className="relative mb-2">
              <button type="button" className="workflow-new-resource-button w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-semibold text-blue-700" onClick={() => setResourceMenuOpen((value) => !value)}>New Resource</button>
              {resourceMenuOpen ? (
                <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("VARIABLE")}><strong>Variable</strong><small>Store a value that can change while the flow runs.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("CONSTANT")}><strong>Constant</strong><small>Store a fixed value for this flow.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("FORMULA")}><strong>Formula</strong><small>Calculate a value when the resource is used.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("TEXT_TEMPLATE")}><strong>Text Template</strong><small>Build reusable text with Flow merge resources.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("CHOICE")}><strong>Choice</strong><small>Create one reusable label/value choice.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("RECORD_CHOICE_SET")}><strong>Record Choice Set</strong><small>Build choices from records.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("PICKLIST_CHOICE_SET")}><strong>Picklist Choice Set</strong><small>Reuse picklist field values.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("COLLECTION_CHOICE_SET")}><strong>Collection Choice Set</strong><small>Map a Flow collection into choices.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("STAGE")}><strong>Stage</strong><small>Define progress stages for Screen Flow.</small></button>
                </div>
              ) : null}
            </div>
            <div className="workflow-manager-filter mb-2 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button type="button" className={`rounded-md px-2 py-1 text-[9px] font-semibold ${managerFilter === "all" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setManagerFilter("all")}>All</button>
              <button type="button" className={`rounded-md px-2 py-1 text-[9px] font-semibold ${managerFilter === "unused" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setManagerFilter("unused")}>Unused</button>
            </div>
            <div className="workflow-palette-scroll">
              {managerFilter === "all" && managerElementSteps.length ? <div className="workflow-palette-group-title">Elements</div> : null}
              {managerFilter === "all" ? managerElementSteps.map(({ step, index }) => (
                <div key={step.id} className="workflow-manager-item">
                  <div className="workflow-manager-item-row">
                    <button type="button" className="workflow-palette-item" onClick={() => inspectStep(step.id)}>
                      <span className="workflow-palette-icon" style={{ background: flowElementVisual(step.type).color }}>{flowElementVisual(step.type).icon}</span>
                      <span className="workflow-palette-item-copy">
                        <strong>{step.label || getActionLabel(step.type)}</strong>
                        <small>{SALESFORCE_CORE_ELEMENT_TYPES.has(step.type) ? getActionLabel(step.type) : "Action"} · Step {index + 1}</small>
                      </span>
                    </button>
                    <button type="button" className="workflow-manager-chevron" aria-label={`Show details for ${step.label || getActionLabel(step.type)}`} onClick={() => setManagerDetailId((current) => current === step.id ? null : step.id)}>{managerDetailId === step.id ? "⌄" : "›"}</button>
                  </div>
                  {managerDetailId === step.id ? (
                    <div className="workflow-manager-detail">
                      <div><span>Type</span><strong>{SALESFORCE_CORE_ELEMENT_TYPES.has(step.type) ? getActionLabel(step.type) : "Action"}</strong></div>
                      <div><span>API Name</span><strong>{step.config?.apiName || flowApiName(step.label || getActionLabel(step.type))}</strong></div>
                      <div><span>Outputs</span><strong>{stepOutputCount(step.id)}</strong></div>
                      <div><span>Incoming paths</span><strong>{incomingPathCount(step.id)}</strong></div>
                      {step.type === "SCREEN" ? <div><span>Components</span><strong>{step.config?.screen?.components?.length || 0}</strong></div> : null}
                      {step.type === "SCREEN" ? <div><span>Navigation</span><strong>{step.config?.showFooter === false ? "Footer hidden" : [step.config?.allowBack !== false ? "Previous" : null, step.config?.allowNext !== false ? "Next" : null, step.config?.allowPause === true ? "Pause" : null, step.config?.allowFinish === true ? "Finish" : null].filter(Boolean).join(" · ")}</strong></div> : null}
                      {step.config?.description ? <p>{step.config.description}</p> : null}
                    </div>
                  ) : null}
                </div>
              )) : null}
              {(managerFilter === "all" ? resourceSteps.length : resourceSteps.some(({ step }) => resourceUsageCount(step) === 0)) ? <div className="workflow-palette-group-title">Resources</div> : null}
              {resourceSteps.filter(({ step }) => managerFilter === "all" || resourceUsageCount(step) === 0).map(({ step }) => {
                const resourceLabel = step.type === "ASSIGNMENT" ? (step.config?.variableName || "New Variable") : (step.config?.resourceName || `New ${getActionLabel(step.type)}`);
                const resourceType = step.type === "ASSIGNMENT"
                  ? `Variable · ${step.config?.variableType || "text"}`
                  : step.type === "CONSTANT" ? `Constant · ${step.config?.resourceType || "text"}`
                    : step.type === "FORMULA" ? `Formula · ${step.config?.resultType || "number"}`
                      : step.type === "TEXT_TEMPLATE" ? "Text Template · Text"
                        : step.type === "INSTRUCTION_TEMPLATE" ? "Instruction Template · Text"
                          : step.type === "CHOICE" ? "Choice"
                          : ["RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET"].includes(step.type) ? `${getActionLabel(step.type)} · Choices`
                            : step.type === "STAGE" ? "Stage · Progress" : getActionLabel(step.type);
                return <div key={step.id} className="workflow-manager-item">
                  <div className="workflow-manager-item-row">
                    <button type="button" className="workflow-palette-item" onClick={() => inspectStep(step.id)}>
                      <span className="workflow-palette-item-copy"><strong>{resourceLabel}</strong><small>{resourceType}</small></span>
                    </button>
                    <button type="button" className="workflow-manager-chevron" aria-label={`Show details for ${resourceLabel}`} onClick={() => setManagerDetailId((current) => current === step.id ? null : step.id)}>{managerDetailId === step.id ? "⌄" : "›"}</button>
                  </div>
                  {managerDetailId === step.id ? (
                    <div className="workflow-manager-detail">
                      <div><span>Resource Type</span><strong>{step.type === "ASSIGNMENT" ? "Variable" : getActionLabel(step.type)}</strong></div>
                      <div><span>Data Type</span><strong>{step.type === "ASSIGNMENT" ? (step.config?.variableType || "text") : step.type === "CONSTANT" ? (step.config?.resourceType || "text") : step.type === "FORMULA" ? (step.config?.resultType || "number") : step.type === "STAGE" ? "stage" : ["CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET"].includes(step.type) ? "choice" : "text"}</strong></div>
                      <div><span>Used by</span><strong>{resourceUsageCount(step)} element{resourceUsageCount(step) === 1 ? "" : "s"}</strong></div>
                      {step.type === "RECORD_CHOICE_SET" ? <div><span>Source</span><strong>{step.config?.object || "Not selected"}</strong></div> : null}
                      {step.type === "PICKLIST_CHOICE_SET" ? <div><span>Source</span><strong>{[step.config?.object, step.config?.fieldApiName].filter(Boolean).join(".") || "Not selected"}</strong></div> : null}
                      {step.type === "STAGE" ? <div><span>Stage</span><strong>{step.config?.stageOrder || 1} · {step.config?.stageValue || "No value"}</strong></div> : null}
                      {step.config?.description ? <p>{step.config.description}</p> : null}
                    </div>
                  ) : null}
                </div>;
              })}
              <div className="workflow-palette-group-title">Flow context</div>
              {visibleGlobalResources.map((resource) => (
                <div key={resource.label} className="workflow-palette-item">
                  <span className="workflow-palette-item-copy">
                    <strong>{resource.label}</strong>
                    <small>{resource.detail}</small>
                  </span>
                </div>
              ))}
              <div className="workflow-palette-group-title">Step outputs</div>
              {visibleStepResources.map((resource) => (
                <div key={resource.value} className="workflow-palette-item">
                  <span className="workflow-palette-item-copy">
                    <strong>{resource.label}</strong>
                    <small>{resource.type}</small>
                  </span>
                </div>
              ))}
              {!visibleGlobalResources.length && !visibleStepResources.length ? <div className="workflow-palette-empty">No matching resources</div> : null}
            </div>
          </>
        )}
      </aside> : null}
      <main
        ref={canvasRef}
        tabIndex={-1}
        className={`workflow-canvas-surface ${canvasPanning ? "is-panning" : ""}`}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={stopCanvasPan}
        onPointerCancel={stopCanvasPan}
        onWheel={onCanvasWheel}
        onDragOver={(event) => { if (layoutMode === "FREEFORM") event.preventDefault(); }}
        onDrop={(event) => { if (layoutMode === "FREEFORM") onFreeformDrop(event); }}
      >
        <div className="workflow-canvas-toolbar">
          <div className="workflow-canvas-toolbar-right">
            <button type="button" className="workflow-canvas-checks" title={totalBuilderErrors ? "Show Errors" : "Show Warnings"} onClick={() => setIssuesOpen(true)}>
              {totalBuilderErrors ? `Errors ${totalBuilderErrors}` : builderWarnings.length ? `Warnings ${builderWarnings.length}` : "Checks ✓"}
            </button>
            <details className="workflow-canvas-more">
              <summary aria-label="More canvas actions" title="More canvas actions">⋮</summary>
              <div className="workflow-canvas-more-menu">
                {layoutMode === "FREEFORM" ? (
                  connectFromId ? <button type="button" onClick={() => setConnectFromId(null)}>Cancel Connect</button>
                    : <button type="button" onClick={() => setConnectFromId(selectedId || "__start__")}>Connect selected</button>
                ) : null}
                {autoConnectSourceId ? <button type="button" onClick={() => setAutoConnectSourceId(null)}>Cancel Go To</button> : null}
                {selectionMode ? (
                  <>
                    <button type="button" disabled={!selectedElementIds.length} onClick={copySelectedElements}>Copy {selectedElementIds.length || ""} selected</button>
                    <button type="button" disabled={!selectedElementIds.length} onClick={cutSelectedElements}>Cut selected</button>
                    <button type="button" disabled={!selectedElementIds.length} onClick={deleteSelectedElements}>Delete selected</button>
                    {layoutMode === "AUTO" ? <button type="button" disabled={!selectedElementIds.length} onClick={createGroupFromSelection}>Group selected</button> : null}
                    <button type="button" onClick={() => { setSelectionMode(false); setSelectedElementIds([]); }}>Cancel selection</button>
                  </>
                ) : <button type="button" onClick={requestSelectionMode}>Select elements</button>}
                <button type="button" onClick={() => setPaletteOpen((value) => !value)}>{paletteOpen ? "Hide Toolbox" : "Show Toolbox"}</button>
                <button type="button" onClick={() => propertiesOpen ? requestCloseInspector() : openInspectorTarget(selectedId === "__start__" ? { kind: "start" } : { kind: "step", stepId: selectedId })}>{propertiesOpen ? "Hide Properties" : "Show Properties"}</button>
                <button type="button" onClick={() => setShortcutHelpOpen(true)}>Keyboard shortcuts</button>
              </div>
            </details>
          </div>
        </div>
        <div className="workflow-canvas-zoom" aria-label="Canvas zoom controls">
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => layoutMode === "AUTO" ? reactFlowRef.current?.zoomOut?.({ duration: 160 }) : setCanvasZoom((value) => Math.max(.5, Number((value - .1).toFixed(1))))}>−</button>
          <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => layoutMode === "AUTO" ? reactFlowRef.current?.setViewport?.({ x: 0, y: 0, zoom: 1 }, { duration: 180 }) : setCanvasZoom(1)}>{Math.round(canvasZoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => layoutMode === "AUTO" ? reactFlowRef.current?.zoomIn?.({ duration: 160 }) : setCanvasZoom((value) => Math.min(1.3, Number((value + .1).toFixed(1))))}>+</button>
          <button type="button" title="Zoom to Fit" onClick={() => layoutMode === "AUTO" ? reactFlowRef.current?.fitView?.({ padding: .25, duration: 220 }) : zoomToFit()}>Fit</button>
        </div>
        {inspectorTransition ? (
          <div className="workflow-path-action-panel" role="dialog" aria-modal="true" aria-label="Unsaved Element Changes">
            <div className="workflow-add-element-head">
              <div><strong>Unsaved changes</strong><small>Properties panel</small></div>
              <button type="button" aria-label="Close Unsaved Changes" onClick={() => resolveInspectorTransition("stay")}>×</button>
            </div>
            <div className="workflow-path-action-body space-y-3">
              <p>You changed this {selectedId === "__start__" ? "Start configuration" : "element"}. Apply the changes before moving away, discard them, or keep editing.</p>
              <div className="workflow-path-action-buttons">
                <button type="button" className="workflow-cancel-button" onClick={() => resolveInspectorTransition("stay")}>Keep Editing</button>
                <button type="button" className="workflow-cancel-button" onClick={() => resolveInspectorTransition("discard")}>Discard</button>
                <button type="button" className="workflow-save-button" onClick={() => resolveInspectorTransition("apply")}>Apply & Continue</button>
              </div>
            </div>
          </div>
        ) : null}
        {connectPathDialog ? (
          <div className="workflow-path-action-panel" role="dialog" aria-modal="true" aria-label="Choose Connection Path">
            <div className="workflow-add-element-head">
              <div><strong>Choose Connection Path</strong><small>{connectPathDialog.sourceLabel}</small></div>
              <button type="button" aria-label="Close Choose Connection Path" onClick={() => { setConnectPathDialog(null); setConnectFromId(null); }}>×</button>
            </div>
            <div className="workflow-path-action-body">
              <p>{connectPathDialog.sourceType === "CONDITION" ? "Select which Decision outcome should connect to this element." : "Select which Loop path should connect to this element."}</p>
              <label>
                Path
                <select value={connectPathDialog.pathChoice} onChange={(event) => setConnectPathDialog((current) => ({ ...current, pathChoice: event.target.value }))}>
                  {(connectPathDialog.paths || []).map((path) => <option key={path.value} value={path.value}>{path.label}</option>)}
                </select>
              </label>
              <div className="workflow-path-action-buttons">
                <button type="button" className="workflow-cancel-button" onClick={() => { setConnectPathDialog(null); setConnectFromId(null); }}>Cancel</button>
                <button type="button" className="workflow-save-button" onClick={() => {
                  const pending = connectPathDialog;
                  setConnectPathDialog(null);
                  connectFreeformElements(pending.sourceId, pending.targetId, pending.pathChoice);
                }}>Connect</button>
              </div>
            </div>
          </div>
        ) : null}
        {groupDialog ? (
          <div className="workflow-path-action-panel" role="dialog" aria-modal="true" aria-label="Create Group">
            <div className="workflow-add-element-head">
              <div><strong>Create Group</strong><small>{groupDialog.mode === "selection" ? `${groupDialog.selectedIds?.length || 0} selected element${(groupDialog.selectedIds?.length || 0) === 1 ? "" : "s"}` : "Add an empty group at this point"}</small></div>
              <button type="button" aria-label="Close Create Group" onClick={() => setGroupDialog(null)}>×</button>
            </div>
            <div className="workflow-path-action-body space-y-3">
              <label>
                Group Name
                <input className={inputClass} value={groupDialog.label || ""} onChange={(event) => setGroupDialog((current) => ({ ...current, label: event.target.value }))} autoFocus />
              </label>
              <label>
                Description <span className="font-normal text-slate-400">(optional)</span>
                <textarea className={inputClass} rows={3} value={groupDialog.description || ""} onChange={(event) => setGroupDialog((current) => ({ ...current, description: event.target.value }))} placeholder="Explain what this section does" />
              </label>
              <div className="workflow-path-action-buttons">
                <button type="button" className="workflow-cancel-button" onClick={() => setGroupDialog(null)}>Cancel</button>
                <button type="button" className="workflow-save-button" disabled={!String(groupDialog.label || "").trim()} onClick={saveGroupDialog}>Create Group</button>
              </div>
            </div>
          </div>
        ) : null}
        {issuesOpen ? (
          <div className="workflow-path-action-panel" role="dialog" aria-label="Errors and Warnings">
            <div className="workflow-add-element-head">
              <div><strong>Errors and Warnings</strong><small>Resolve errors before activation.</small></div>
              <button type="button" aria-label="Close Errors and Warnings" onClick={() => setIssuesOpen(false)}>×</button>
            </div>
            <div className="workflow-path-action-body">
              <div className="space-y-3">
                {flowIssues.length ? <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-red-600">Flow errors</div>
                  <div className="space-y-1">{flowIssues.map((issue, index) => <button key={`${issue.target || "flow"}-${index}`} type="button" className="workflow-resource-choice" onClick={() => openFlowIssue(issue)}><strong>{issue.label || "Flow"}</strong><small>{issue.message}</small></button>)}</div>
                </div> : null}
                {builderErrors.length ? <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-red-600">Errors</div>
                  <div className="space-y-1">{builderErrors.map(({ step, message }) => <button key={step.id} type="button" className="workflow-resource-choice" onClick={() => { inspectStep(step.id); setIssuesOpen(false); }}><strong>{step.label || getActionLabel(step.type)}</strong><small>{message}</small></button>)}</div>
                </div> : null}
                {builderWarnings.length ? <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Warnings</div>
                  <div className="space-y-1">{builderWarnings.map(({ step, message }) => <button key={step.id} type="button" className="workflow-resource-choice" onClick={() => { inspectStep(step.id); setIssuesOpen(false); }}><strong>{step.label || getActionLabel(step.type)}</strong><small>{message}</small></button>)}</div>
                </div> : null}
                {!totalBuilderErrors && !builderWarnings.length ? <div className="text-xs text-emerald-700">No builder errors or warnings.</div> : null}
              </div>
            </div>
          </div>
        ) : null}
        {infoDialog ? (
          <div className="workflow-path-action-panel" role="dialog" aria-label="Element Description">
            <div className="workflow-add-element-head">
              <div><strong>{infoDialog.title}</strong><small>{infoDialog.type}</small></div>
              <button type="button" aria-label="Close Element Description" onClick={() => setInfoDialog(null)}>×</button>
            </div>
            <div className="workflow-path-action-body"><p>{infoDialog.description}</p></div>
          </div>
        ) : null}
        {shortcutHelpOpen ? (
          <div className="workflow-path-action-panel" role="dialog" aria-label="Keyboard Shortcuts">
            <div className="workflow-add-element-head">
              <div><strong>Keyboard Shortcuts</strong><small>Flow Builder canvas</small></div>
              <button type="button" aria-label="Close Keyboard Shortcuts" onClick={() => setShortcutHelpOpen(false)}>×</button>
            </div>
            <div className="workflow-path-action-body">
              <div className="space-y-2 text-[11px] text-slate-700">
                <div className="flex justify-between gap-4"><span>Undo</span><strong>Ctrl/Cmd + Z</strong></div>
                <div className="flex justify-between gap-4"><span>Redo</span><strong>Ctrl/Cmd + Shift + Z</strong></div>
                <div className="flex justify-between gap-4"><span>Copy selected element</span><strong>Ctrl/Cmd + C</strong></div>
                <div className="flex justify-between gap-4"><span>Cut selected element</span><strong>Ctrl/Cmd + X</strong></div>
                <div className="flex justify-between gap-4"><span>Paste</span><strong>Ctrl/Cmd + V</strong></div>
                <div className="flex justify-between gap-4"><span>Pan canvas</span><strong>Space + Drag · Middle Drag</strong></div>
                <div className="flex justify-between gap-4"><span>Horizontal scroll</span><strong>Shift + Wheel</strong></div>
                <div className="flex justify-between gap-4"><span>Zoom at canvas</span><strong>Ctrl/Cmd + Wheel</strong></div>
                <div className="flex justify-between gap-4"><span>Zoom in / out</span><strong>Ctrl/Cmd + Alt + = / -</strong></div>
                <div className="flex justify-between gap-4"><span>Zoom to fit</span><strong>Ctrl/Cmd + Alt + 1</strong></div>
                <div className="flex justify-between gap-4"><span>Reset zoom</span><strong>Ctrl/Cmd + Alt + 0</strong></div>
                <div className="flex justify-between gap-4"><span>Select multiple elements</span><strong>Shift + Click · Free-Form</strong></div>
                <div className="flex justify-between gap-4"><span>Copy selected elements</span><strong>Ctrl/Cmd + C</strong></div>
                <div className="flex justify-between gap-4"><span>Cut selected elements</span><strong>Ctrl/Cmd + X</strong></div>
                <div className="flex justify-between gap-4"><span>Delete selected elements</span><strong>Delete / Backspace · Free-Form</strong></div>
                <div className="flex justify-between gap-4"><span>Close dialog / cancel mode</span><strong>Esc</strong></div>
                <div className="flex justify-between gap-4"><span>View description</span><strong>Ctrl/Cmd + I</strong></div>
                <div className="flex justify-between gap-4"><span>Switch panel focus</span><strong>F6</strong></div>
                <div className="flex justify-between gap-4"><span>Shortcut help</span><strong>Ctrl/Cmd + /</strong></div>
              </div>
            </div>
          </div>
        ) : null}
        {pathActionDialog && pathActionStep ? (
          <div className="workflow-path-action-panel" role="dialog" aria-label={pathActionDialog.mode === "cut" ? "Cut Element" : "Delete Element"}>
            <div className="workflow-add-element-head">
              <div>
                <strong>{pathActionDialog.mode === "cut" ? "Cut Element" : "Delete Element"}</strong>
                <small>{pathActionStep.label || getActionLabel(pathActionStep.type)}</small>
              </div>
              <button type="button" aria-label="Close" onClick={() => setPathActionDialog(null)}>×</button>
            </div>
            <div className="workflow-path-action-body">
              <p>Choose the path whose elements you want to keep on the canvas.</p>
              <label>
                Keep Path
                <select value={pathActionDialog.keepKey || "__none__"} onChange={(event) => setPathActionDialog((current) => ({ ...current, keepKey: event.target.value }))}>
                  <option value="__none__">None, {pathActionDialog.mode === "cut" ? "cut" : "delete"} all paths</option>
                  {(pathActionDialog.paths || []).map((path) => <option key={path.key} value={path.key}>{path.label}</option>)}
                </select>
              </label>
              <div className="workflow-path-action-buttons">
                <button type="button" className="workflow-cancel-button" onClick={() => setPathActionDialog(null)}>Cancel</button>
                <button type="button" className={pathActionDialog.mode === "delete" ? "workflow-danger-button" : "workflow-save-button"} onClick={() => {
                  if (pathActionDialog.mode === "cut") cutStepWithPathChoice(pathActionStep, pathActionDialog.keepKey || "__none__");
                  else deleteStepWithPathChoice(pathActionStep, pathActionDialog.keepKey || "__none__");
                }}>{pathActionDialog.mode === "cut" ? "Cut" : "Delete"}</button>
              </div>
            </div>
          </div>
        ) : null}
        {(insertAt != null || branchTarget) ? (
          <div className="workflow-add-element-popover" role="dialog" aria-label="Add Element">
            <div className="workflow-add-element-head">
              <div>
                <strong>Add Element</strong>
                <small>{branchTarget ? "Choose an element for this path" : "Choose an element to insert here"}</small>
              </div>
              <button type="button" aria-label="Close Add Element" onClick={() => { setInsertAt(null); setBranchTarget(null); }}>×</button>
            </div>
            <div className="workflow-add-element-search">
              <span>⌕</span>
              <input value={addElementSearch} onChange={(event) => setAddElementSearch(event.target.value)} placeholder="Search elements..." autoFocus />
            </div>
            <div className="workflow-add-element-groups">
              {clipboard?.step ? (
                <div className="workflow-add-element-group">
                  <div className="workflow-palette-group-title">Clipboard</div>
                  <div className="workflow-add-element-grid">
                    <button type="button" onClick={() => pasteClipboard(insertAt == null ? workflow.steps.length : insertAt)}>
                      <span className="workflow-add-element-icon" style={{ background: flowElementVisual(clipboard.step.type).color }}>⧉</span>
                      <span><strong>Paste {Array.isArray(clipboard.steps) && clipboard.steps.length ? clipboard.steps.length : 1} Element{(Array.isArray(clipboard.steps) && clipboard.steps.length ? clipboard.steps.length : 1) === 1 ? "" : "s"}</strong><small>{(Array.isArray(clipboard.steps) && clipboard.steps.length > 1) ? `${clipboard.steps.length} selected elements` : (clipboard.step.label || getActionLabel(clipboard.step.type))} · {clipboard.mode === "cut" ? "Cut" : "Copied"}</small></span>
                    </button>
                  </div>
                </div>
              ) : null}
              {Object.entries(addElementPaletteGroups).map(([category, options]) => (
                <div key={category} className="workflow-add-element-group">
                  <div className="workflow-palette-group-title">{category}</div>
                  <div className="workflow-add-element-grid">
                    {options.map((option) => (
                      <button key={option.value} type="button" onClick={() => addFromPalette(option.value, insertAt == null ? workflow.steps.length : insertAt)}>
                        <span className="workflow-add-element-icon" style={{ background: flowElementVisual(option.value).color }}>{flowElementVisual(option.value).icon}</span>
                        <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!addElementPalette.length ? <div className="workflow-palette-empty">No matching elements</div> : null}
            </div>
          </div>
        ) : null}
        {layoutMode === "FREEFORM" ? (
          <div ref={laneRef} className="workflow-freeform-canvas" style={{ transform: `scale(${canvasZoom})`, transformOrigin: "top left" }}>
            <svg className="workflow-freeform-svg" aria-hidden="true">
              <defs>
                <marker id="workflow-freeform-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#7d93ad" />
                </marker>
              </defs>
              {freeformEdges().map(([fromId, toId], edgeIndex) => {
                const fromIndex = workflow.steps.findIndex((step) => String(step.id) === String(fromId));
                const toIndex = workflow.steps.findIndex((step) => String(step.id) === String(toId));
                const from = getFreeformPosition(fromId, fromIndex < 0 ? 0 : fromIndex);
                const to = getFreeformPosition(toId, toIndex < 0 ? 0 : toIndex);
                const fromWidth = fromId === "__start__" ? 220 : 250;
                const startX = from.x + fromWidth / 2;
                const startY = from.y + 70;
                const endX = to.x + 125;
                const endY = to.y;
                const midY = startY + Math.max(28, (endY - startY) / 2);
                return <path key={`${fromId}-${toId}-${edgeIndex}`} d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`} fill="none" stroke="#7d93ad" strokeWidth="1.75" strokeLinecap="round" markerEnd="url(#workflow-freeform-arrow)" />;
              })}
            </svg>
            {(() => {
              const pos = getFreeformPosition("__start__", 0);
              return <div className="workflow-freeform-start" style={{ left: pos.x, top: pos.y }} draggable onDragEnd={(event) => onFreeformDragEnd(event, "__start__", 0)}>
                <button type="button" className="workflow-start-node" onClick={() => { if (connectFromId && connectFromId !== "__start__") connectFreeformElements(connectFromId, "__start__"); else inspectStart(); }} title="Configure when this flow starts">
                  <span className="workflow-start-icon">▶</span>
                  <span className="workflow-start-title">Start</span>
                  <span className="workflow-start-note">{getTriggerLabel(workflow.trigger)}</span>
                </button>
              </div>;
            })()}
            {managerElementSteps.map(({ step, index }) => {
              const visual = flowElementVisual(step.type);
              const pos = getFreeformPosition(step.id, index);
              const elementKind = SALESFORCE_CORE_ELEMENT_TYPES.has(step.type) ? getActionLabel(step.type) : "Action";
              const builderError = builderErrorByStepId.get(String(step.id)) || "";
              return <div key={step.id} className="workflow-freeform-node" style={{ left: pos.x, top: pos.y }} draggable onDragEnd={(event) => onFreeformDragEnd(event, step.id, index)}>
                <div className="workflow-node-row">
                  <button type="button" onClick={(event) => { if (connectFromId) { connectFreeformElements(connectFromId, step.id); return; } if (event.shiftKey) { toggleElementSelection(step.id); return; } inspectStep(step.id); }} data-node-type={step.type} className={`workflow-node-card workflow-canvas-component-card ${selectedId === step.id || selectedElementIds.includes(String(step.id)) ? "is-selected" : ""} ${builderError ? "has-builder-error" : ""}`} title={builderError || undefined}>
                    <span className="workflow-node-icon" style={{ background: visual.color }}>{visual.icon}</span>
                    <span className="workflow-node-kind">{elementKind}</span>
                    <span className="workflow-node-title">{step.label || getActionLabel(step.type)}</span>
                    {step.config?.description ? <span className="workflow-node-description" title={step.config.description}>ⓘ</span> : null}
                    {builderError ? <span className="workflow-node-error-badge">! Fix configuration</span> : null}
                  </button>
                  <details className="workflow-node-menu">
                    <summary aria-label={`Open actions for ${step.label || getActionLabel(step.type)}`} title="Element actions">⋮</summary>
                    <div className="workflow-node-menu-popover">
                      <button type="button" onClick={() => inspectStep(step.id)}>Edit Element</button>
                      <button type="button" onClick={() => { setSelectedId(step.id); setConnectFromId(step.id); }}>Connect To…</button>
                      <button type="button" onClick={() => copyStep(step)}>Copy Element</button>
                      <button type="button" onClick={() => requestCutStep(step)}>Cut Element</button>
                      {flowElementSupportsFaultPath(step.type) ? <button type="button" onClick={() => addFaultPath(step)}>Add Fault Path</button> : null}
                      <button type="button" className="is-danger" onClick={() => requestDeleteStep(step)}>Delete Element</button>
                    </div>
                  </details>
                </div>
              </div>;
            })}
          </div>
        ) : (
          <WorkflowReactFlowCanvas
            workflow={workflow}
            mainEntries={visibleCanvasSteps}
            flowElementVisual={flowElementVisual}
            getActionLabel={getActionLabel}
            getTriggerLabel={getTriggerLabel}
            onInspect={(id) => {
              if (String(id) === "__start__") inspectStart();
              else inspectStep(id);
            }}
            onInsertMain={(index) => {
              setAutoConnectSourceId(null);
              setGroupTargetId(null);
              setBranchTarget(null);
              setInsertAt(index);
              setPaletteTab("elements");
              setPaletteOpen(true);
            }}
            onInsertBranch={({ ownerId, kind, outcomeId, index }) => {
              openPath(pathTarget(kind, ownerId, outcomeId, index));
            }}
            onDelete={requestDeleteStep}
            onReady={(instance) => { reactFlowRef.current = instance; setCanvasZoom(instance.getZoom?.() || 1); }}
            onViewportChange={(zoom) => setCanvasZoom(Number(zoom || 1))}
          />
        )}
      </main>
      {propertiesOpen ? <aside ref={propertiesRef} tabIndex={-1} className="workflow-properties-panel">
        <div className="workflow-properties-tabs">
          <span className="workflow-properties-tab is-active">Properties</span>
        </div>
        {selectedId === "__start__" ? (
          <div className="space-y-4 rounded-xl bg-white p-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">Configure Start</div>
              <p className="mt-1 text-xs text-slate-500">Define how this flow starts, which records qualify, and when the flow should run.</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{FLOW_TYPE_OPTIONS.find((item) => item.key === flowType)?.label || flowType}</span>
              <span className="ml-2">Flow type is selected when the flow is created. Use Properties to change advanced version settings.</span>
            </div>
            {["RECORD_TRIGGERED","SCHEDULE_TRIGGERED"].includes(flowType) ? <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Select Object</div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Object {flowType === "SCHEDULE_TRIGGERED" ? "(optional batch source)" : ""}</label>
              <PlatformFieldPicker
                scopeKey={scopeKey}
                includeObjectSelector
                objectOnly
                objectKey={workflow.object || ""}
                onObjectChange={(object) => setWorkflow((current) => ({ ...current, object, conditions: [], match: "all", entryTransition: "EVERY_TIME" }))}
              />
            </div> : null}
            {flowType === "RECORD_TRIGGERED" ? (
              <div>
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Configure Trigger</div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Trigger the Flow When</label>
                <select aria-label="Flow trigger" className={inputClass} value={recordTriggerWhen(workflow.trigger)} onChange={(event) => {
                  const when = event.target.value;
                  setWorkflow((current) => ({
                    ...current,
                    trigger: recordTriggerKey(when, current.actionMetadata?.optimizeFor),
                    entryTransition: "EVERY_TIME",
                  }));
                }}>
                  {RECORD_TRIGGER_WHEN_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>
            ) : flowType === "SCHEDULE_TRIGGERED" ? null : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{flowType === "PLATFORM_EVENT_TRIGGERED" ? "Event" : "Trigger"}</label>
                {startTriggerOptions.length > 8 ? <input className={inputClass} value={startTriggerSearch} onChange={(event) => setStartTriggerSearch(event.target.value)} placeholder="Search triggers or events..." aria-label="Search flow triggers"/> : null}
                <select aria-label="Flow trigger" className={inputClass} value={workflow.trigger || "manual"} onChange={(event) => setWorkflow((current) => ({ ...current, trigger: event.target.value, entryTransition: "EVERY_TIME" }))}>
                  {!startTriggerOptions.some((option) => option.key === workflow.trigger) && workflow.trigger ? <option value={workflow.trigger}>{getTriggerLabel(workflow.trigger)}</option> : null}
                  {workflow.trigger && startTriggerOptions.some((option) => option.key === workflow.trigger) && !filteredStartTriggerOptions.some((option) => option.key === workflow.trigger) ? <option value={workflow.trigger}>{getTriggerLabel(workflow.trigger)}</option> : null}
                  {filteredStartTriggerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </div>
            )}
            {flowType === "SCHEDULE_TRIGGERED" ? (() => {
              const schedule = workflow.actionMetadata?.schedule || { scheduleType: "DAILY", timezone: "", definition: { time: "" } };
              const definition = schedule.definition || {};
              const updateSchedule = (patch) => setWorkflow((current) => ({
                ...current,
                actionMetadata: { ...(current.actionMetadata || {}), schedule: { ...(current.actionMetadata?.schedule || schedule), ...patch } },
              }));
              const updateDefinition = (patch) => updateSchedule({ definition: { ...(definition || {}), ...patch } });
              return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Schedule</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">Frequency
                    <select className={inputClass} value={schedule.scheduleType || "DAILY"} onChange={(event) => updateSchedule({ scheduleType: event.target.value })}>
                      <option value="ONCE">Once</option><option value="HOURLY">Hourly</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-600">Timezone
                    <input className={inputClass} value={schedule.timezone || ""} onChange={(event) => updateSchedule({ timezone: event.target.value })} placeholder="Europe/London" />
                  </label>
                </div>
                {schedule.scheduleType === "ONCE" ? <div className="grid gap-2 md:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-600">Date<input type="date" className={inputClass} value={definition.date || ""} onChange={(event) => updateDefinition({ date: event.target.value })} /></label>
                  <label className="block text-xs font-medium text-slate-600">Time<input type="time" className={inputClass} value={definition.time || ""} onChange={(event) => updateDefinition({ time: event.target.value })} /></label>
                </div> : null}
                {schedule.scheduleType === "HOURLY" ? <label className="block text-xs font-medium text-slate-600">Minute past the hour<input type="number" min="0" max="59" className={inputClass} value={Number(definition.minute || 0)} onChange={(event) => updateDefinition({ minute: Math.max(0, Math.min(59, Number(event.target.value || 0))) })} /></label> : null}
                {["DAILY","WEEKLY","MONTHLY"].includes(schedule.scheduleType) ? <label className="block text-xs font-medium text-slate-600">Time<input type="time" className={inputClass} value={definition.time || ""} onChange={(event) => updateDefinition({ time: event.target.value })} /></label> : null}
                {schedule.scheduleType === "WEEKLY" ? <label className="block text-xs font-medium text-slate-600">Day
                  <select className={inputClass} value={Number((definition.daysOfWeek || [1])[0])} onChange={(event) => updateDefinition({ daysOfWeek: [Number(event.target.value)] })}>
                    <option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option>
                  </select>
                </label> : null}
                {schedule.scheduleType === "MONTHLY" ? <label className="block text-xs font-medium text-slate-600">Day of month<input type="number" min="1" max="31" className={inputClass} value={Number(definition.dayOfMonth || 1)} onChange={(event) => updateDefinition({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value || 1))) })} /></label> : null}
                <p className="text-[11px] text-slate-500">When activated, this Flow runs only from its schedule. If an Object is selected, the scheduler can process matching records as separate interviews.</p>
              </div>;
            })() : null}
            {flowType === "RECORD_TRIGGERED" && recordTriggerWhen(workflow.trigger) !== "deleted" ? (
              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-xs font-semibold text-slate-700">Optimize the Flow For</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {[
                      ["FAST_FIELD_UPDATES", "Fast Field Updates", "Update fields on the record that triggered the flow before the record is saved."],
                      ["ACTIONS_AND_RELATED_RECORDS", "Actions and Related Records", "Run after the record is saved so the flow can create or update related records and run actions."],
                    ].map(([value, label, help]) => {
                      const selected = (workflow.actionMetadata?.optimizeFor || "ACTIONS_AND_RELATED_RECORDS") === value;
                      return <button key={value} type="button" className={`rounded-lg border p-3 text-left ${selected ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 bg-white"}`} onClick={() => setWorkflow((current) => {
                        const when = recordTriggerWhen(current.trigger);
                        return {
                          ...current,
                          trigger: recordTriggerKey(when, value),
                          actionMetadata: { ...(current.actionMetadata || {}), optimizeFor: value, ...(value === "FAST_FIELD_UPDATES" ? { includeAsyncPath: false } : {}) },
                        };
                      })}>
                        <strong className="block text-xs text-slate-800">{label}</strong>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{help}</span>
                      </button>;
                    })}
                  </div>
                </div>
                {(workflow.actionMetadata?.optimizeFor || "ACTIONS_AND_RELATED_RECORDS") === "ACTIONS_AND_RELATED_RECORDS" ? (
                  <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={workflow.actionMetadata?.includeAsyncPath === true} onChange={(event) => setWorkflow((current) => ({ ...current, actionMetadata: { ...(current.actionMetadata || {}), includeAsyncPath: event.target.checked } }))} />
                    <span><strong className="block">Include a Run Asynchronously path</strong><span className="mt-1 block text-[11px] text-slate-500">Use this path for external systems or work that should run only after the triggering transaction is committed.</span></span>
                  </label>
                ) : null}
              </div>
            ) : null}
            {flowType === "RECORD_TRIGGERED" ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Scheduled Paths</div>
                  <p className="mt-1 text-[11px] text-slate-500">Configure paths that run later from this Start element.</p>
                </div>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700" onClick={addScheduledPath}>+ Add path</button>
              </div>
              <div className="space-y-3">
                {scheduledPathSteps.map(({ step: pathStep, index: pathIndex }) => (
                  <div key={pathStep.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <input className={inputClass} value={pathStep.config?.pathLabel || ""} onChange={(event) => updateScheduledPath(pathIndex, { pathLabel: event.target.value })} placeholder="Path name" />
                      <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => removeScheduledPath(pathIndex)}>Remove</button>
                    </div>
                    <select className={inputClass} value={pathStep.config?.scheduleMode || "OFFSET"} onChange={(event) => updateScheduledPath(pathIndex, { scheduleMode: event.target.value })}>
                      <option value="OFFSET">Run after a delay</option>
                      <option value="AT_DATETIME">Run at date/time from record</option>
                    </select>
                    {(pathStep.config?.scheduleMode || "OFFSET") === "OFFSET" ? (
                      <div className="grid grid-cols-[1fr_1fr] gap-2">
                        <input className={inputClass} type="number" min="0" value={Number(pathStep.config?.delayAmount ?? 30)} onChange={(event) => updateScheduledPath(pathIndex, { delayAmount: Math.max(0, Number(event.target.value || 0)) })} />
                        <select className={inputClass} value={pathStep.config?.delayUnit || "MINUTES"} onChange={(event) => updateScheduledPath(pathIndex, { delayUnit: event.target.value })}>
                          <option value="MINUTES">Minutes later</option>
                          <option value="HOURS">Hours later</option>
                          <option value="DAYS">Days later</option>
                        </select>
                      </div>
                    ) : (
                      <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={[]} label="Date / time Resource" value={pathStep.config?.runAt || ""} onChange={(runAt) => updateScheduledPath(pathIndex, { runAt })} />
                    )}
                    <p className="text-[11px] text-slate-500">Add elements to this path from the Scheduled Path branch on the canvas.</p>
                  </div>
                ))}
                {!scheduledPathSteps.length ? <div className="text-[11px] text-slate-500">No scheduled paths. The Run Immediately path runs normally.</div> : null}
              </div>
            </div> : null}

            <div className="space-y-3">
              {["after_update","after_save","before_update","before_save","field_changed"].includes(workflow.trigger) ? (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">When to Run the Flow for Updated Records</div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">When conditions become true</label>
                  <select className={inputClass} value={workflow.entryTransition || "EVERY_TIME"} onChange={(event) => setWorkflow((current) => ({ ...current, entryTransition: event.target.value }))}>
                    <option value="EVERY_TIME">Every time the record meets the conditions</option>
                    <option value="UPDATED_TO_MEET">Only when the record is updated to meet the conditions</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">“Only when updated to meet” runs when the full entry criteria changes from false to true. Later edits are ignored while the record remains matched.</p>
                </div>
              ) : null}
              {workflow.object && ["RECORD_TRIGGERED","SCHEDULE_TRIGGERED"].includes(flowType) ? (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Set Entry Conditions</div>
                  <div className="mb-2 text-xs font-semibold text-slate-700">Condition Requirements</div>
                  <StepConditionEditor
                    objectKey={workflow.object}
                    value={{ type: workflow.match || "all", rules: workflow.conditions?.length ? workflow.conditions : [blankCondition()] }}
                    onChange={(condition) => setWorkflow((current) => ({
                      ...current,
                      match: condition.type || "all",
                      conditions: condition.rules || [],
                    }))}
                  />
                  <p className="mt-2 text-[11px] text-slate-500">Use Changed / Changed to for a specific field transition. Use the option above when the full entry criteria should transition from false to true.</p>
                </div>
              ) : <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Choose an object to configure record entry conditions.</div>}
            </div>
            <div className="workflow-properties-footer flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className="workflow-cancel-button" onClick={cancelInspector}>Cancel</button>
              <button type="button" className="workflow-save-button" onClick={finishInspector}>Done</button>
            </div>
          </div>
        ) : selectedStep ? <StepEditor step={selectedStep} index={selectedIndex} allSteps={workflow.steps} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={removeStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={availableWorkflows.filter((item) => (item.runtimeActive === true || item.active !== false) && String(item.id) !== String(workflowId || ""))} messageTemplates={messageTemplates} platformComponents={platformComponents} rootObjectKey={workflow.object || ""} scopeKey={scopeKey} debugInfo={debugTrace?.[selectedStep.id] || null} objectFieldCatalog={objectFieldCatalog} onDone={finishInspector} onCancel={cancelInspector} /> : <p className="text-sm text-slate-500">Select Start or a flow element to configure it.</p>}
      </aside> : null}
    </div>
  );
}

export default function WorkflowAdmin({ onMessage, onError, scopeKey = null, title = "Workflows", description = "Create and manage workflow builder configurations.", embedded = false, initialWorkflow = null, onClose, onSaved }) {
  const normalizedInitialWorkflow = initialWorkflow ? {
    id: initialWorkflow.id || null,
    name: initialWorkflow.name || "",
    object: initialWorkflow.object || initialWorkflow.object_key || initialWorkflow.objectKey || "",
    objectId: initialWorkflow.objectId || initialWorkflow.object_id || null,
    objectKey: initialWorkflow.objectKey || initialWorkflow.object_key || initialWorkflow.object || "",
    trigger: initialWorkflow.trigger || initialWorkflow.trigger_key || initialWorkflow.triggerKey || "manual",
    version: Number(initialWorkflow.version || 1),
    lifecycleStatus: initialWorkflow.lifecycleStatus || initialWorkflow.lifecycle_status || (initialWorkflow.active === false ? "INACTIVE" : "ACTIVE"),
    active: initialWorkflow.active !== false,
    runtimeActive: initialWorkflow.runtimeActive ?? initialWorkflow.runtime_active ?? initialWorkflow.active !== false,
    activeVersion: Number(initialWorkflow.activeVersion || initialWorkflow.active_version || 0) || null,
    draftVersion: Number(initialWorkflow.draftVersion || initialWorkflow.draft_version || 0) || null,
    conditions: initialWorkflow.conditions || [],
    match: initialWorkflow.action?.match || initialWorkflow.match || "all",
    entryTransition: initialWorkflow.action?.entryTransition || initialWorkflow.entryTransition || "EVERY_TIME",
    inputContract: initialWorkflow.action?.inputContract || initialWorkflow.inputContract || [],
    outputContract: initialWorkflow.action?.outputContract || initialWorkflow.outputContract || [],
    scope: initialWorkflow.scope || initialWorkflow.action?.scope || null,
    actionMetadata: {
      flowType: initialWorkflow.action?.flowType || initialWorkflow.actionMetadata?.flowType || null,
      optimizeFor: initialWorkflow.action?.optimizeFor || initialWorkflow.actionMetadata?.optimizeFor || "ACTIONS_AND_RELATED_RECORDS",
      includeAsyncPath: initialWorkflow.action?.includeAsyncPath === true || initialWorkflow.actionMetadata?.includeAsyncPath === true,
      templateKey: initialWorkflow.action?.templateKey || null,
      defaultForNewDevices: initialWorkflow.action?.defaultForNewDevices === true,
      apiName: initialWorkflow.action?.apiName || initialWorkflow.apiName || flowApiName(initialWorkflow.name || "Flow"),
      description: initialWorkflow.action?.description || initialWorkflow.description || "",
      ui: initialWorkflow.action?.ui || null,
      builderLayout: initialWorkflow.action?.builderLayout || initialWorkflow.actionMetadata?.builderLayout || { mode: "AUTO", positions: {} },
      builderGroups: initialWorkflow.action?.builderGroups || initialWorkflow.actionMetadata?.builderGroups || [],
      schedule: initialWorkflow.action?.schedule || initialWorkflow.actionMetadata?.schedule || { scheduleType: "DAILY", timezone: "Europe/London", definition: { time: "09:00" } },
    },
    steps: (initialWorkflow.steps || initialWorkflow.action?.actions || []).map((step) => ({
      ...makeStep(step.type || step.key || "CREATE_RECORD"),
      ...step,
      type: step.type || step.key || "CREATE_RECORD",
      enabled: step.enabled !== false,
      label: step.label || getActionLabel(step.type || step.key),
      config: {
        ...(makeStep(step.type || step.key || "CREATE_RECORD").config),
        ...(step.config || {}),
        ...Object.fromEntries(Object.entries(step).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
        apiParameters: { ...(step.config?.apiParameters || {}), ...Object.fromEntries(Object.entries(step).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))) },
        ...((step.type || step.key) === "FORMULA" ? { formulaInputs: step.formulaInputs || step.inputs || step.config?.formulaInputs || step.config?.inputs || {} } : {}),
      },
    })),
  } : null;
  const [workflowId, setWorkflowId] = useState(() => normalizedInitialWorkflow?.id || null);
  const [workflow, setWorkflow] = useState(() => normalizedInitialWorkflow || createBlankWorkflow(scopeKey));

  const [guideStep, setGuideStep] = useState("trigger");
  const [showBuilder, setShowBuilder] = useState(embedded);
  const [savedWorkflows, setSavedWorkflows] = useState(() => embedded && normalizedInitialWorkflow ? [normalizedInitialWorkflow] : []);
  const [providerAvailable, setProviderAvailable] = useState({ EMAIL: false, BREVO: false, MAILJET: false, SMS: false, WHATSAPP: false });
  const [registryOptions, setRegistryOptions] = useState(scopeKey ? [] : actionOptions);
  const [functionRegistry, setFunctionRegistry] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [workflowListSearch, setWorkflowListSearch] = useState("");
  const [workflowListFilter, setWorkflowListFilter] = useState("all");
  const [triggerOptions, setTriggerOptions] = useState([
    { key: "after_create", label: "After a record is created", kind: "record" },
    { key: "after_update", label: "After a record is updated", kind: "record" },
    { key: "after_save", label: "After a record is created or updated", kind: "record" },
    { key: "manual", label: "Manual trigger", kind: "record" },
  ]);
  const [builderLoadIssues, setBuilderLoadIssues] = useState([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugMode, setDebugMode] = useState("debug");
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugRecordMode, setDebugRecordMode] = useState("latest");
  const [debugRecordId, setDebugRecordId] = useState("");
  const [debugPanelTab, setDebugPanelTab] = useState("setup");
  const [debugPathId, setDebugPathId] = useState("immediate");
  const [debugSkipStartConditions, setDebugSkipStartConditions] = useState(false);
  const [debugRollbackMode, setDebugRollbackMode] = useState(true);
  const [debugInputs, setDebugInputs] = useState({});
  const [debugResult, setDebugResult] = useState(null);
  const [activeSavedTest, setActiveSavedTest] = useState(null);
  const [testsOpen, setTestsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [flowPropertiesOpen, setFlowPropertiesOpen] = useState(false);
  const [flowPropertiesSnapshot, setFlowPropertiesSnapshot] = useState(null);
  const [savedTests, setSavedTests] = useState([]);
  const [workflowVersions, setWorkflowVersions] = useState([]);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [testDraft, setTestDraft] = useState({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Flow completes" }] });
  const [testBusyId, setTestBusyId] = useState(null);
  const [editingTestId, setEditingTestId] = useState(null);
  const [pendingDeleteTestId, setPendingDeleteTestId] = useState(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [objectFieldCatalog, setObjectFieldCatalog] = useState({});
  const [flowHistory, setFlowHistory] = useState({ past: [], future: [], last: null, applying: false });
  const [savedDefinitionSignature, setSavedDefinitionSignature] = useState(() => persistedWorkflowSignature(normalizedInitialWorkflow || createBlankWorkflow(scopeKey)));
  const [saveBusy, setSaveBusy] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [pendingRestoreVersion, setPendingRestoreVersion] = useState(null);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [newFlowChooserOpen, setNewFlowChooserOpen] = useState(false);
  const [newFlowChooserStep, setNewFlowChooserStep] = useState("source");
  const [newFlowTypeDraft, setNewFlowTypeDraft] = useState("");

  const currentDefinitionSignature = persistedWorkflowSignature(workflow);
  const hasUnsavedChanges = currentDefinitionSignature !== savedDefinitionSignature;

  const resetToNewWorkflow = () => {
    const next = createBlankWorkflow(scopeKey);
    setWorkflowId(null);
    setWorkflow(next);
    setSavedDefinitionSignature(persistedWorkflowSignature(next));
    setFlowHistory({ past: [], future: [], last: JSON.stringify(next), applying: false });
    setWorkflowVersions([]);
    setSavedTests([]);
    setCompareVersionId(null);
    setDebugResult(null);
    setActiveSavedTest(null);
    setDebugInputs({});
    setVersionsOpen(false);
    setTestsOpen(false);
    setDebugOpen(false);
  };

  const startNewFlow = (flowType) => {
    const next = createBlankWorkflow(scopeKey);
    const type = String(flowType || "AUTOLAUNCHED").toUpperCase();
    const trigger = type === "RECORD_TRIGGERED" ? "after_save"
      : type === "SCHEDULE_TRIGGERED" ? "scheduled"
        : type === "PLATFORM_EVENT_TRIGGERED" ? (triggerOptions.find((option) => option.kind === "event")?.key || next.trigger)
          : "manual";
    next.trigger = trigger;
    next.actionMetadata = {
      ...(next.actionMetadata || {}),
      flowType: type,
      optimizeFor: "ACTIONS_AND_RELATED_RECORDS",
      includeAsyncPath: false,
    };
    setWorkflowId(null);
    setWorkflow(next);
    setSavedDefinitionSignature(persistedWorkflowSignature(next));
    setFlowHistory({ past: [], future: [], last: JSON.stringify(next), applying: false });
    setWorkflowVersions([]);
    setSavedTests([]);
    setCompareVersionId(null);
    setDebugResult(null);
    setActiveSavedTest(null);
    setDebugInputs({});
    setVersionsOpen(false);
    setTestsOpen(false);
    setDebugOpen(false);
    setNewFlowChooserOpen(false);
    setShowBuilder(true);
  };

  const leaveBuilder = () => {
    if (hasUnsavedChanges) { setLeaveConfirmOpen(true); return; }
    if (embedded) onClose?.();
    else setShowBuilder(false);
  };

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const serialized = JSON.stringify(workflow);
    setFlowHistory((current) => {
      if (current.applying) return { ...current, last: serialized, applying: false };
      if (!current.last) return { ...current, last: serialized };
      if (current.last === serialized) return current;
      return {
        past: [...current.past.slice(-49), current.last],
        future: [],
        last: serialized,
        applying: false,
      };
    });
  }, [workflow]);

  useEffect(() => {
    setFlowHistory({ past: [], future: [], last: JSON.stringify(workflow), applying: false });
  }, [workflowId]);

  const openFlowProperties = () => {
    setFlowPropertiesSnapshot({ name: workflow.name || "", actionMetadata: JSON.parse(JSON.stringify(workflow.actionMetadata || {})) });
    setFlowPropertiesOpen(true);
  };
  const cancelFlowProperties = () => {
    if (flowPropertiesSnapshot) {
      setWorkflow((current) => ({ ...current, name: flowPropertiesSnapshot.name, actionMetadata: flowPropertiesSnapshot.actionMetadata }));
    }
    setFlowPropertiesSnapshot(null);
    setFlowPropertiesOpen(false);
  };
  const finishFlowProperties = () => {
    setFlowPropertiesSnapshot(null);
    setFlowPropertiesOpen(false);
  };

  const undoFlowChange = () => {
    if (!flowHistory.past.length) return;
    const target = flowHistory.past[flowHistory.past.length - 1];
    const current = flowHistory.last || JSON.stringify(workflow);
    setFlowHistory({
      past: flowHistory.past.slice(0, -1),
      future: [current, ...flowHistory.future].slice(0, 50),
      last: target,
      applying: true,
    });
    setWorkflow(JSON.parse(target));
  };

  const redoFlowChange = () => {
    if (!flowHistory.future.length) return;
    const target = flowHistory.future[0];
    const current = flowHistory.last || JSON.stringify(workflow);
    setFlowHistory({
      past: [...flowHistory.past, current].slice(-50),
      future: flowHistory.future.slice(1),
      last: target,
      applying: true,
    });
    setWorkflow(JSON.parse(target));
  };


  useEffect(() => {
    if (scopeKey === "whatsapp_assistant") return;
    apiRequest("/api/platform/workflow-triggers")
      .then((response) => {
        const options = Array.isArray(response?.data) ? response.data : [];
        if (options.length) setTriggerOptions(options);
      })
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load flow triggers."])]));
  }, [scopeKey]);

  useEffect(() => {
    if (!embedded) return;
    if (normalizedInitialWorkflow) {
      setWorkflowId(normalizedInitialWorkflow.id || null);
      setWorkflow(normalizedInitialWorkflow);
    } else {
      setWorkflowId(null);
      setWorkflow({
        name: "",
        object: "",
        trigger: "manual",
        version: 1,
        lifecycleStatus: "DRAFT",
        active: false,
        entryTransition: "EVERY_TIME",
        inputContract: [],
        outputContract: [],
        steps: [],
      });
    }
    setShowBuilder(true);
  }, [embedded, initialWorkflow?.id]);

  useEffect(() => {
    apiRequest(scopeKey
      ? `/api/platform/workflow-resources?scope=${encodeURIComponent(scopeKey)}`
      : "/api/platform/workflow-actions")
      .then((response) => {
        const source = scopeKey ? response?.data?.actions : response?.data;
        const registry = (Array.isArray(source) ? source : []).map((item) => ({
          value: item.key,
          label: item.displayName || item.key,
          description: item.description || "",
          category: workflowActionCategory(item.key),
          schema: item.schema || null,
          requiredPermissions: Array.isArray(item.requiredPermissions) ? item.requiredPermissions : [],
          requiredEntitlement: item.requiredEntitlement || null,
          capability: item.capability || null,
          async: item.async === true,
        }));
        if (registry.length) setRegistryOptions(registry);
      })
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load flow actions."])]));
  }, [scopeKey]);

  useEffect(() => {
    apiRequest("/api/platform/function-registry")
      .then((response) => setFunctionRegistry(Array.isArray(response?.data) ? response.data : []))
      .catch((error) => onError?.(error.message || "Unable to load registered functions"));
  }, [onError]);

  useEffect(() => {
    apiRequest("/api/platform/message-templates")
      .then((response) => setMessageTemplates(Array.isArray(response?.data) ? response.data.filter((item) => item.active !== false) : []))
      .catch((error) => {
        setMessageTemplates([]);
        setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load message templates."])]);
      });
  }, []);

  useEffect(() => {
    apiRequest("/api/platform/rules")
      .then((response) => {
        const rules = Array.isArray(response?.data) ? response.data : [];
        const workflows = rules
          .filter((rule) => rule?.action?.type === "workflow")
          .filter((rule) => !scopeKey || rule?.action?.scope === scopeKey)
          .map((rule) => ({
          ...rule,
          id: rule.id,
          name: rule.name,
          object: rule.object_key || rule.object || "",
          trigger: rule.trigger_key,
          active: rule.active !== false,
          runtimeActive: rule.runtime_active === true || rule.active === true,
          activeVersion: Number(rule.active_version || 0) || null,
          draftVersion: Number(rule.draft_version || 0) || null,
          scope: rule.action.scope || null,
          systemGenerated: rule.action.systemGenerated === true,
          systemKey: rule.action.systemKey || null,
          capabilityType: rule.action.capabilityType || null,
          capabilityKey: rule.action.capabilityKey || null,
          match: rule.action.match || "all",
          entryTransition: rule.action.entryTransition || "EVERY_TIME",
          inputContract: rule.action.inputContract || [],
          outputContract: rule.action.outputContract || [],
          actionMetadata: {
            flowType: rule.action?.flowType || null,
            optimizeFor: rule.action?.optimizeFor || "ACTIONS_AND_RELATED_RECORDS",
            includeAsyncPath: rule.action?.includeAsyncPath === true,
            templateKey: rule.action?.templateKey || null,
            defaultForNewDevices: rule.action?.defaultForNewDevices === true,
            apiName: rule.action?.apiName || flowApiName(rule.name || "Flow"),
            description: rule.action?.description || "",
            ui: rule.action?.ui || null,
            builderLayout: rule.action?.builderLayout || { mode: "AUTO", positions: {} },
            builderGroups: rule.action?.builderGroups || [],
            schedule: rule.action?.schedule || { scheduleType: "DAILY", timezone: "Europe/London", definition: { time: "09:00" } },
          },
          lifecycleStatus: rule.lifecycle_status || (rule.active === false ? "INACTIVE" : "ACTIVE"),
          version: Number(rule.version || 1),
          steps: (rule.action.actions || []).map((action) => {
            const base = makeStep(action.type || action.key);
            return {
              ...base,
              id: action.id || base.id,
              label: action.label || getActionLabel(action.type || action.key),
              type: action.type || action.key,
              config: {
                ...base.config,
                ...action,
                apiParameters: {
                  ...(action.apiParameters || {}),
                  ...Object.fromEntries(Object.entries(action).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
                },
                ...(action.type === "FORMULA" ? { formulaInputs: action.formulaInputs || action.inputs || {} } : {}),
              },
            };
          }),
        }));
        setSavedWorkflows(workflows);
      })
      .catch((error) => onError?.(error.message || "Unable to load flows"));
  }, [onError]);

  useEffect(() => {
    const objectKeys = [...new Set((workflow.steps || [])
      .filter((step) => step.type === "GET_RECORDS" && step.config?.object)
      .map((step) => step.config.object))];
    if (!objectKeys.length) return;
    let live = true;
    (async () => {
      try {
        const objectsResponse = await apiRequest("/api/platform/objects");
        const objects = objectsResponse?.data?.objects || objectsResponse?.data || [];
        const next = { ...objectFieldCatalog };
        for (const objectKey of objectKeys) {
          if (next[objectKey]) continue;
          const object = objects.find((item) => String(item.object_key || item.api_name || item.key || "") === String(objectKey));
          if (!object?.id) continue;
          const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/record-paths?depth=1`);
          const paths = Array.isArray(response?.data) ? response.data : [];
          next[objectKey] = paths
            .filter((path) => path.kind === "field" && String(path.path || "").split(".").length === 2)
            .map((path) => ({
              apiName: String(path.path).split(".").at(-1),
              label: path.label || String(path.path).split(".").at(-1),
              type: path.fieldType || "field",
            }));
        }
        if (live) setObjectFieldCatalog(next);
      } catch {
        // MetadataResourcePicker still exposes the core record/count/collection resources.
      }
    })();
    return () => { live = false; };
  }, [workflow.steps]);

  useEffect(() => {
    Promise.all([
      apiRequest("/api/integrations").catch(() => ({ data: [] })),
      apiRequest("/api/connector-instances").catch(() => ({ data: [] })),
    ])
      .then(([integrationResponse, connectorResponse]) => {
        const integrations = Array.isArray(integrationResponse?.data) ? integrationResponse.data : [];
        const connectors = Array.isArray(connectorResponse?.data) ? connectorResponse.data : [];
        const nextState = { EMAIL: false, BREVO: false, MAILJET: false, SMS: false, WHATSAPP: false };
        for (const item of integrations) {
          const provider = String(item.provider || "").toUpperCase();
          if (provider === "EMAIL" || provider === "SMS" || provider === "WHATSAPP") {
            nextState[provider] = Boolean(item.active !== false && item.configuration && Object.keys(item.configuration || {}).length > 0);
          }
        }
        for (const item of connectors) {
          const packageKey = String(item.packageKey || item.connector_package_key || "").toLowerCase();
          const capabilities = (Array.isArray(item.capabilities) ? item.capabilities : [])
            .map((capability) => String(typeof capability === "string" ? capability : capability?.key || "").toLowerCase())
            .filter(Boolean);
          const ready = item.enabled === true
            && String(item.status || item.connectionStatus || "").toUpperCase() === "CONNECTED"
            && (item.testPassed === true || item.health?.success === true);
          if (!ready) continue;
          if (packageKey === "brevo_connector") nextState.BREVO = true;
          if (packageKey === "mailjet_connector") nextState.MAILJET = true;
          if (packageKey.includes("email") || packageKey.includes("brevo") || packageKey.includes("mailjet") || capabilities.some((key) => key.startsWith("email."))) nextState.EMAIL = true;
          if (packageKey.includes("sms") || capabilities.some((key) => key.startsWith("sms.") || key.includes("message.sms"))) nextState.SMS = true;
          if (packageKey.includes("whatsapp") || capabilities.some((key) => key.startsWith("whatsapp.") || key.includes("message.whatsapp"))) nextState.WHATSAPP = true;
        }
        setProviderAvailable(nextState);
      })
      .catch(() => {
        setProviderAvailable({ EMAIL: false, BREVO: false, MAILJET: false, SMS: false, WHATSAPP: false });
      });
  }, []);

  const updateStep = (index, patch) => {
    setWorkflow((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)),
    }));
  };

  const addStepAt = (index, type = "CREATE_RECORD") => {
    const nextStep = makeStep(type);
    setWorkflow((current) => ({
      ...current,
      steps: [...current.steps.slice(0, index), nextStep, ...current.steps.slice(index)],
    }));
  };

  const moveStep = (index, direction) => {
    setWorkflow((current) => {
      const next = [...current.steps];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, steps: next };
    });
  };

  const duplicateStep = (index) => {
    setWorkflow((current) => ({
      ...current,
      steps: [...current.steps.slice(0, index + 1), { ...current.steps[index], id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}` }, ...current.steps.slice(index + 1)],
    }));
  };

  const deleteStep = (index) => {
    setWorkflow((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  };

  const isKioskExperience = String(workflow.actionMetadata?.flowType || "").toUpperCase() === "KIOSK_EXPERIENCE";
  const kioskUi = workflow.actionMetadata?.ui && typeof workflow.actionMetadata.ui === "object"
    ? workflow.actionMetadata.ui
    : { schemaVersion: 1, startScreen: "catalogue", screens: [], features: {} };

  const updateKioskUi = (patch) => setWorkflow((current) => ({
    ...current,
    actionMetadata: {
      ...(current.actionMetadata || {}),
      flowType: "KIOSK_EXPERIENCE",
      ui: { ...(current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} }), ...patch },
    },
  }));

  const updateKioskScreen = (index, patch) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = [...(ui.screens || [])];
    screens[index] = { ...screens[index], ...patch };
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens } } };
  });

  const moveKioskScreen = (index, direction) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = [...(ui.screens || [])];
    const target = index + direction;
    if (target < 0 || target >= screens.length) return current;
    [screens[index], screens[target]] = [screens[target], screens[index]];
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens } } };
  });

  const removeKioskScreen = (index) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = (ui.screens || []).filter((_, screenIndex) => screenIndex !== index);
    const startScreen = screens.some((screen) => screen.key === ui.startScreen) ? ui.startScreen : (screens[0]?.key || "");
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens, startScreen } } };
  });

  const addKioskScreen = (type) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const keyBase = String(type || "screen").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    let key = keyBase;
    let suffix = 2;
    while ((ui.screens || []).some((screen) => screen.key === key)) key = `${keyBase}_${suffix++}`;
    const defaults = {
      CATALOGUE: { title: "Browse products", search: true, categories: true, productAction: "OPEN_DETAIL" },
      PRODUCT_DETAIL: { title: "Product", description: true, variants: true, modifiers: true },
      RECOMMENDATIONS: { title: "You may also like", source: "CROSS_SELL", optional: true },
      FULFILMENT: { title: "Choose fulfilment", options: [{ key: "COLLECT", label: "Collect", canonicalType: "SELF_PICKUP", requires: [] }] },
      BASKET: { title: "Review your order", editable: true, promotions: true },
      LOYALTY: { title: "Rewards", subtitle: "Enter phone or email, or continue as a guest.", optional: true },
      FORM: { title: "Order details", optional: true, fields: [] },
      PAYMENT: { title: "Payment", methods: ["CARD"], actionLabel: "Pay now" },
      CONFIRMATION: { title: "Order confirmed", collectionNumber: true, receipt: ["PRINT","QR"], resetAfterSeconds: 30 },
    };
    const nextScreen = { key, type, ...(defaults[type] || { title: type }) };
    const screens = [...(ui.screens || []), nextScreen];
    return {
      ...current,
      actionMetadata: {
        ...(current.actionMetadata || {}),
        flowType: "KIOSK_EXPERIENCE",
        ui: { ...ui, screens, startScreen: ui.startScreen || screens[0]?.key || key },
      },
    };
  });

  const updateKioskFeature = (key, value) => updateKioskUi({ features: { ...(kioskUi.features || {}), [key]: value } });

  const enabledSteps = (workflow.steps || []).filter((step) => step.enabled !== false);
  const conditionSteps = enabledSteps.filter((step) => step.type === "CONDITION");
  const actionSteps = enabledSteps.filter((step) => step.type !== "CONDITION");
  const triggerNeedsObject = !["manual","whatsapp_message_received","system_function","system_action","system_job"].includes(workflow.trigger);
  const triggerIssue = !workflow.trigger
    ? "Choose a trigger."
    : triggerNeedsObject && !workflow.object
      ? "Choose the trigger object."
      : "";
  const entryConditionIssue = (workflow.conditions || []).length && !conditionIsValid({ rules: workflow.conditions })
    ? "One or more Start conditions are incomplete."
    : "";
  const entryTransitionIssue = workflow.entryTransition === "UPDATED_TO_MEET"
    ? !(workflow.conditions || []).length
      ? "Add at least one Start condition for Only when updated to meet."
      : !["after_update","after_save","before_update","before_save","field_changed"].includes(workflow.trigger)
        ? "Only when updated to meet requires an update trigger."
        : ""
    : "";
  const definitionFor = (step) => registryOptions.find((option) => option.value === step.type) || null;
  const conditionIssue = conditionSteps.length && conditionSteps.some((step) => workflowActionIssue(step, definitionFor(step)))
    ? "One or more conditions are incomplete."
    : "";
  const actionIssues = actionSteps.map((step) => workflowActionIssue(step, definitionFor(step))).filter(Boolean);
  const resourceDeclarations = new Map();
  let resourceConflict = "";
  for (const step of enabledSteps) {
    const name = step.type === "ASSIGNMENT"
      ? step.config?.variableName
      : ["CONSTANT","FORMULA","TEXT_TEMPLATE","INSTRUCTION_TEMPLATE","CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET","STAGE"].includes(step.type)
        ? step.config?.resourceName
        : null;
    if (!name) continue;
    const normalizedName = String(name).toLowerCase();
    const kind = step.type === "ASSIGNMENT" ? "VARIABLE" : step.type;
    const type = step.type === "ASSIGNMENT" ? step.config?.variableType : step.type === "CONSTANT" ? step.config?.resourceType : step.type === "FORMULA" ? step.config?.resultType : step.type === "STAGE" ? "stage" : ["CHOICE","RECORD_CHOICE_SET","PICKLIST_CHOICE_SET","COLLECTION_CHOICE_SET"].includes(step.type) ? "choice" : "text";
    const previous = resourceDeclarations.get(normalizedName);
    if (!previous) {
      resourceDeclarations.set(normalizedName, { kind, type, name: String(name) });
      continue;
    }
    if (kind === "VARIABLE" && previous.kind === "VARIABLE" && previous.type === type && previous.name === String(name)) continue;
    resourceConflict = previous.kind === "VARIABLE" && kind === "VARIABLE"
      ? `Variable "${name}" is assigned with conflicting types or casing (${previous.type || "unknown"} and ${type || "unknown"}).`
      : `Resource name "${name}" conflicts with "${previous.name}". Resource API Names must be unique, including casing differences.`;
    break;
  }
  const stageSteps = enabledSteps.filter((step) => step.type === "STAGE");
  const duplicateStageValue = stageSteps.find((step, index, list) => list.findIndex((candidate) => String(candidate.config?.stageValue || "").trim().toLowerCase() === String(step.config?.stageValue || "").trim().toLowerCase()) !== index);
  const duplicateStageOrder = stageSteps.find((step, index, list) => list.findIndex((candidate) => Number(candidate.config?.stageOrder || 0) === Number(step.config?.stageOrder || 0)) !== index);
  const stageConflict = duplicateStageValue
    ? `Stage value "${duplicateStageValue.config?.stageValue}" is used more than once. Give every stage a unique value.`
    : duplicateStageOrder
      ? `Stage order ${duplicateStageOrder.config?.stageOrder} is used more than once. Give every stage a unique order.`
      : "";
  const isScreenFlow = String(workflow.actionMetadata?.flowType || "").toUpperCase() === "SCREEN_FLOW";
  const screenFlowIssue = isScreenFlow && !enabledSteps.some((step) => step.type === "SCREEN")
    ? "Add at least one Screen element."
    : "";
  const kioskScreenIssue = isKioskExperience
    ? !(Array.isArray(kioskUi.screens) && kioskUi.screens.length)
      ? "Add at least one kiosk screen."
      : !kioskUi.startScreen || !(kioskUi.screens || []).some((screen) => screen.key === kioskUi.startScreen)
        ? "Choose a valid kiosk start screen."
        : (kioskUi.screens || []).some((screen) => !screen.key || !screen.type)
          ? "Every kiosk screen needs a key and type."
          : ""
    : "";
  const actionsIssue = isKioskExperience
    ? kioskScreenIssue
    : screenFlowIssue
      ? screenFlowIssue
      : resourceConflict
      ? resourceConflict
      : stageConflict
      ? stageConflict
      : !actionSteps.length
        ? "Add at least one element."
        : actionIssues[0] || "";
  const contractEntries = [...(workflow.inputContract || []), ...(workflow.outputContract || [])];
  const invalidContractName = contractEntries.find((item) => !item?.name || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(item.name)));
  const duplicateInput = (workflow.inputContract || []).find((item, index, list) => list.findIndex((other) => other.name === item.name) !== index);
  const duplicateOutput = (workflow.outputContract || []).find((item, index, list) => list.findIndex((other) => other.name === item.name) !== index);
  const missingOutputSource = (workflow.outputContract || []).find((item) => !item?.source);
  const contractIssue = invalidContractName
    ? "Subflow input/output names can only use letters, numbers and underscores."
    : duplicateInput ? `Subflow input "${duplicateInput.name}" is declared more than once.`
      : duplicateOutput ? `Subflow output "${duplicateOutput.name}" is declared more than once.`
        : missingOutputSource ? `Choose a Resource for subflow output "${missingOutputSource.label || missingOutputSource.name || "output"}".`
          : "";
  const flowValidationIssues = [
    !workflow.name ? { target: "properties", label: "Flow Properties", message: "Enter a flow name." } : null,
    triggerIssue ? { target: "start", label: "Start", message: triggerIssue } : null,
    entryConditionIssue ? { target: "start", label: "Start Conditions", message: entryConditionIssue } : null,
    entryTransitionIssue ? { target: "start", label: "Start Transition", message: entryTransitionIssue } : null,
    resourceConflict ? { target: "resources", label: "Resources", message: resourceConflict } : null,
    stageConflict ? { target: "resources", label: "Stages", message: stageConflict } : null,
    contractIssue ? { target: "properties", label: "Input / Output Contract", message: contractIssue } : null,
    screenFlowIssue ? { target: "resources", label: "Screen Flow", message: screenFlowIssue } : null,
    kioskScreenIssue ? { target: "properties", label: "Kiosk Experience", message: kioskScreenIssue } : null,
  ].filter(Boolean);
  const reviewIssue = triggerIssue || entryConditionIssue || entryTransitionIssue || conditionIssue || actionsIssue || contractIssue || (!workflow.name ? "Enter a flow name." : "");
  const guideSteps = [
    { key: "trigger", label: "Start", status: (triggerIssue || entryTransitionIssue) ? "error" : "complete", message: triggerIssue || entryTransitionIssue },
    {
      key: "conditions",
      label: "Conditions",
      status: conditionIssue ? "error" : conditionSteps.length ? "complete" : "idle",
      message: conditionIssue || (conditionSteps.length ? "" : "Optional"),
    },
    { key: "actions", label: "Actions", status: actionsIssue ? "error" : "complete", message: actionsIssue },
    { key: "review", label: "Save", status: reviewIssue ? "error" : "complete", message: reviewIssue },
  ];

  const navigateGuide = (key) => {
    setGuideStep(key);
    const targetId = key === "trigger" ? "workflow-trigger-section"
      : key === "review" ? "workflow-review-section"
        : "workflow-canvas-section";
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const buildWorkflowPayload = (lifecycleOverride = null) => {
    const nextLifecycle = String(lifecycleOverride || workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase();
    return {
      objectId: workflow.objectId || null,
      objectKey: workflow.objectKey || workflow.object || null,
      name: workflow.name,
      triggerKey: workflow.trigger,
      conditions: workflow.conditions || [],
      version: Number(workflow.version || 1),
      lifecycleStatus: nextLifecycle,
      active: nextLifecycle === "ACTIVE",
      action: {
        type: "workflow",
        inputContract: workflow.inputContract || [],
        outputContract: workflow.outputContract || [],
        ...(scopeKey ? { scope: scopeKey } : workflow.scope ? { scope: workflow.scope } : {}),
        ...(workflow.systemGenerated ? {
          systemGenerated: true,
          systemKey: workflow.systemKey || null,
          capabilityType: workflow.capabilityType || null,
          capabilityKey: workflow.capabilityKey || null,
          scope: workflow.scope || "system",
        } : {}),
        ...(workflow.actionMetadata?.flowType ? { flowType: workflow.actionMetadata.flowType } : {}),
        ...(workflow.actionMetadata?.optimizeFor ? { optimizeFor: workflow.actionMetadata.optimizeFor } : {}),
        ...(workflow.actionMetadata?.includeAsyncPath ? { includeAsyncPath: true } : {}),
        apiName: workflow.actionMetadata?.apiName || flowApiName(workflow.name || "Flow"),
        ...(workflow.actionMetadata?.description ? { description: workflow.actionMetadata.description } : {}),
        ...(workflow.actionMetadata?.templateKey ? { templateKey: workflow.actionMetadata.templateKey } : {}),
        ...(workflow.actionMetadata?.defaultForNewDevices ? { defaultForNewDevices: true } : {}),
        ...(workflow.actionMetadata?.ui ? { ui: workflow.actionMetadata.ui } : {}),
        builderLayout: workflow.actionMetadata?.builderLayout || { mode: "AUTO", positions: {} },
        builderGroups: workflow.actionMetadata?.builderGroups || [],
        ...(workflow.actionMetadata?.schedule ? { schedule: workflow.actionMetadata.schedule } : {}),
        match: workflow.match || "all",
        entryTransition: workflow.entryTransition || "EVERY_TIME",
        actions: workflow.steps.filter((step) => step.enabled !== false).map((step) => {
          const config = { ...(step.config || {}) };
          if (config.fieldMappings && !config.fieldValues) config.fieldValues = config.fieldMappings;
          if (config.template && !config.templateId) config.templateId = config.template;
          if (step.type === "FORMULA") {
            config.inputs = config.formulaInputs || config.inputs || {};
            delete config.formulaInputs;
          }
          const apiParameters = config.apiParameters && typeof config.apiParameters === "object" ? config.apiParameters : {};
          delete config.apiParameters;
          return { id: step.id, label: step.label || getActionLabel(step.type), type: step.type, ...apiParameters, ...config };
        }),
      },
    };
  };

  const saveWorkflow = async (lifecycleOverride = null, { keepOpen = false, silent = false, forceNewVersion = false } = {}) => {
    if (saveBusy) return null;
    if (String(workflow.actionMetadata?.flowType || "").toUpperCase() === "SCHEDULE_TRIGGERED") {
      const schedule = workflow.actionMetadata?.schedule || {};
      const definition = schedule.definition || {};
      if (!String(schedule.timezone || "").trim()) {
        onError?.("Choose a timezone for this scheduled Flow.");
        return null;
      }
      if (String(schedule.scheduleType || "DAILY").toUpperCase() !== "HOURLY"
          && !String(definition.time || "").trim()
          && !(String(schedule.scheduleType || "").toUpperCase() === "ONCE" && (definition.at || definition.runAt))) {
        onError?.("Choose a time for this scheduled Flow.");
        return null;
      }
    }
    const nextLifecycle = String(lifecycleOverride || workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase();
    if (nextLifecycle === "ACTIVE" && reviewIssue) {
      onError?.(`Cannot activate flow: ${reviewIssue}`);
      return null;
    }
    const payload = { ...buildWorkflowPayload(nextLifecycle), ...(forceNewVersion ? { forceNewVersion: true } : {}) };
    setSaveBusy(true);
    try {
      const response = workflowId
        ? await apiRequest(`/api/platform/rules/${workflowId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiRequest("/api/platform/rules", { method: "POST", body: JSON.stringify(payload) });
      const saved = response?.data || {};
      const nextId = saved.id || workflowId;
      setWorkflowId(nextId);
      const savedWorkflow = {
        ...workflow,
        ...saved,
        id: nextId,
        lifecycleStatus: nextLifecycle,
        active: nextLifecycle === "ACTIVE",
        runtimeActive: saved.runtime_active ?? saved.runtimeActive ?? (nextLifecycle === "ACTIVE" ? true : workflow.runtimeActive === true),
        activeVersion: Number(saved.active_version || saved.activeVersion || workflow.activeVersion || 0) || null,
        draftVersion: Number(saved.draft_version || saved.draftVersion || (nextLifecycle === "DRAFT" ? saved.version || workflow.version : 0)) || null,
      };
      setWorkflow(savedWorkflow);
      setSavedDefinitionSignature(persistedWorkflowSignature(savedWorkflow));
      setSavedWorkflows((current) => [savedWorkflow, ...current.filter((item) => item.id !== nextId)]);
      try {
        const schedulesResponse = await apiRequest("/api/platform/schedules");
        const schedules = Array.isArray(schedulesResponse?.data) ? schedulesResponse.data : [];
        const existingSchedule = schedules.find((item) => String(item.workflow_id || item.workflowId) === String(nextId));
        if (String(workflow.actionMetadata?.flowType || "").toUpperCase() === "SCHEDULE_TRIGGERED") {
          const schedule = workflow.actionMetadata?.schedule || {};
          const schedulePayload = {
            workflowId: nextId,
            scheduleType: schedule.scheduleType || "DAILY",
            definition: schedule.definition || { time: "" },
            timezone: schedule.timezone || "",
            active: nextLifecycle === "ACTIVE",
          };
          if (existingSchedule) await apiRequest(`/api/platform/schedules/${existingSchedule.id}`, { method: "PUT", body: JSON.stringify(schedulePayload) });
          else await apiRequest("/api/platform/schedules", { method: "POST", body: JSON.stringify(schedulePayload) });
        } else if (existingSchedule?.active) {
          await apiRequest(`/api/platform/schedules/${existingSchedule.id}`, { method: "DELETE" });
        }
      } catch (scheduleError) {
        if (String(workflow.actionMetadata?.flowType || "").toUpperCase() === "SCHEDULE_TRIGGERED") throw scheduleError;
      }
      if (embedded) onSaved?.({ ...workflow, ...saved, id: nextId });
      else if (!keepOpen) setShowBuilder(false);
      if (!silent) onMessage?.(forceNewVersion ? `Flow saved as version ${saved.version || savedWorkflow.version}.` : nextLifecycle === "ACTIVE" ? "Flow activated." : "Flow draft saved.");
      return { id: nextId, workflow: savedWorkflow };
    } catch (error) {
      onError?.(error.message || "Unable to save workflow.");
      return null;
    } finally {
      setSaveBusy(false);
    }
  };

  const deactivateWorkflow = async (target = workflow) => {
    const targetId = target?.id || workflowId;
    if (!targetId || saveBusy) return null;
    setSaveBusy(true);
    try {
      const response = await apiRequest(`/api/platform/rules/${targetId}`, {
        method: "PUT",
        body: JSON.stringify({ active: false, lifecycleStatus: "INACTIVE" }),
      });
      const saved = response?.data || {};
      const next = {
        ...target,
        ...saved,
        id: targetId,
        active: false,
        runtimeActive: false,
        lifecycleStatus: saved.lifecycle_status || saved.lifecycleStatus || (saved.draft_version ? "DRAFT" : "INACTIVE"),
        activeVersion: Number(saved.active_version || saved.activeVersion || target?.activeVersion || 0) || null,
        draftVersion: Number(saved.draft_version || saved.draftVersion || target?.draftVersion || 0) || null,
      };
      if (String(target?.actionMetadata?.flowType || workflow.actionMetadata?.flowType || "").toUpperCase() === "SCHEDULE_TRIGGERED") {
        const schedulesResponse = await apiRequest("/api/platform/schedules");
        const schedules = Array.isArray(schedulesResponse?.data) ? schedulesResponse.data : [];
        const existingSchedule = schedules.find((item) => String(item.workflow_id || item.workflowId) === String(targetId));
        if (existingSchedule?.active) await apiRequest(`/api/platform/schedules/${existingSchedule.id}`, { method: "DELETE" });
      }
      if (String(targetId) === String(workflowId || "")) {
        setWorkflow(next);
        setSavedDefinitionSignature(persistedWorkflowSignature(next));
      }
      setSavedWorkflows((current) => current.map((entry) => entry.id === targetId ? { ...entry, ...next } : entry));
      setDeactivateConfirmOpen(false);
      onMessage?.("Flow deactivated. No new runs will start from the live version.");
      return next;
    } catch (error) {
      onError?.(error.message || "Unable to deactivate flow.");
      return null;
    } finally {
      setSaveBusy(false);
    }
  };

  const saveAndLeaveBuilder = async () => {
    const saved = await saveWorkflow("DRAFT", { keepOpen: true, silent: true });
    if (!saved) return;
    setLeaveConfirmOpen(false);
    if (embedded) onClose?.();
    else setShowBuilder(false);
    onMessage?.("Flow draft saved.");
  };

  const discardAndLeaveBuilder = () => {
    setLeaveConfirmOpen(false);
    if (embedded) onClose?.();
    else setShowBuilder(false);
  };

  const debugTrace = (() => {
    const trace = {};
    for (const stepRun of debugResult?.steps || []) {
      const baseId = String(stepRun.step_identifier || "").split("@")[0];
      if (!baseId) continue;
      const current = trace[baseId];
      const rawStatus = String(stepRun.status || "").toUpperCase();
      const result = stepRun.metadata?.result || {};
      const status = result?.faultHandled === true ? "FAULT_HANDLED" : rawStatus;
      const next = {
        status,
        faultHandled: result?.faultHandled === true,
        simulated: result?.simulated === true,
        error: stepRun.metadata?.friendlyError || result?.friendlyError || (stepRun.error_text ? { title: "This element could not complete", whatHappened: stepRun.error_text, howToFix: "Open the element Properties and check its required values and Resources." } : null),
      };
      if (!current || status === "FAILED" || (current.status !== "FAILED" && status === "COMPLETED")) trace[baseId] = next;
    }
    return trace;
  })();

  const loadSavedTests = async (workflowIdOverride = null) => {
    const id = workflowIdOverride || workflowId;
    if (!id) { setSavedTests([]); return; }
    try {
      const response = await apiRequest(`/api/platform/rules/${id}/tests`);
      setSavedTests(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      onError?.(error.message || "Unable to load flow tests.");
    }
  };

  const loadWorkflowVersions = async (workflowIdOverride = null) => {
    const id = workflowIdOverride || workflowId;
    if (!id) { setWorkflowVersions([]); return; }
    try {
      setVersionsBusy(true);
      const response = await apiRequest(`/api/platform/rules/${id}/versions`);
      setWorkflowVersions(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      onError?.(error.message || "Unable to load flow versions.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const assertionLabel = (assertion) => {
    if (assertion.type === "RUN_STATUS") return `Flow status is ${assertion.expected || "COMPLETED"}`;
    const step = workflow.steps.find((item) => String(item.id) === String(assertion.stepId || ""));
    if (assertion.type === "STEP_STATUS") return `${step?.label || "Step"} status is ${assertion.expected || "COMPLETED"}`;
    if (assertion.type === "DECISION_OUTCOME") return `${step?.label || "Decision"} outcome is ${assertion.expected || "selected outcome"}`;
    if (assertion.type === "RESOURCE_EQUALS") return `${assertion.resource || "Resource"} equals expected value`;
    return assertion.label || "Assertion";
  };

  const savedTestDraftIssue = (() => {
    if (!testDraft.name.trim()) return "Enter a test name.";
    if (testDraft.recordMode === "specific" && !testDraft.recordId.trim()) return "Enter the record ID this test should use.";
    if (!(testDraft.assertions || []).length) return "Add at least one assertion so the saved test can detect a regression.";
    for (let index = 0; index < (testDraft.assertions || []).length; index += 1) {
      const assertion = testDraft.assertions[index] || {};
      const number = index + 1;
      if (assertion.type === "STEP_STATUS") {
        if (!assertion.stepId || !workflow.steps.some((step) => String(step.id) === String(assertion.stepId))) return `Assertion ${number}: select an element.`;
        if (!assertion.expected) return `Assertion ${number}: choose the expected element result.`;
      } else if (assertion.type === "DECISION_OUTCOME") {
        const decision = workflow.steps.find((step) => String(step.id) === String(assertion.stepId) && step.type === "CONDITION");
        if (!decision) return `Assertion ${number}: select a Decision element.`;
        const outcomeIds = new Set((decision.config?.outcomes || []).map((outcome) => String(outcome.id)));
        if (!assertion.expected || (assertion.expected !== "__DEFAULT__" && !outcomeIds.has(String(assertion.expected)))) return `Assertion ${number}: select a valid Decision outcome.`;
      } else if (assertion.type === "RESOURCE_EQUALS") {
        if (!String(assertion.resource || "").trim()) return `Assertion ${number}: select a resource.`;
      } else if (assertion.type !== "RUN_STATUS") {
        return `Assertion ${number}: choose a supported assertion type.`;
      }
    }
    return "";
  })();

  const saveTestCase = async () => {
    let id = workflowId || null;
    if (!id) {
      const saved = await saveWorkflow("DRAFT", { keepOpen: true, silent: true });
      if (!saved?.id) return;
      id = saved.id;
    }
    if (savedTestDraftIssue) { onError?.(savedTestDraftIssue); return; }
    try {
      setTestBusyId(editingTestId || "new");
      const config = {
        recordMode: testDraft.recordMode,
        recordId: testDraft.recordMode === "specific" ? testDraft.recordId.trim() : "",
        assertions: testDraft.assertions || [],
      };
      if (editingTestId) {
        await apiRequest(`/api/platform/rules/${id}/tests/${editingTestId}`, {
          method: "PUT",
          body: JSON.stringify({ name: testDraft.name.trim(), config }),
        });
      } else {
        await apiRequest(`/api/platform/rules/${id}/tests`, {
          method: "POST",
          body: JSON.stringify({ name: testDraft.name.trim(), config }),
        });
      }
      setEditingTestId(null);
      setTestDraft({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Flow completes" }] });
      await loadSavedTests(id);
      onMessage?.(editingTestId ? "Flow test updated." : "Flow test saved.");
    } catch (error) {
      onError?.(error.message || "Unable to save flow test.");
    } finally {
      setTestBusyId(null);
    }
  };

  const editSavedTest = (test) => {
    const config = test?.config && typeof test.config === "object" ? test.config : {};
    setEditingTestId(test.id);
    setTestDraft({
      name: test.name || "",
      recordMode: config.recordMode === "specific" ? "specific" : "latest",
      recordId: config.recordId || "",
      assertions: Array.isArray(config.assertions) && config.assertions.length
        ? config.assertions.map((assertion) => ({ ...assertion }))
        : [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Flow completes" }],
    });
  };

  const cancelTestEdit = () => {
    setEditingTestId(null);
    setTestDraft({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Flow completes" }] });
  };

  const runSavedTest = async (test) => {
    if (!workflowId) return;
    try {
      setTestBusyId(test.id);
      setDebugMode("test");
      setDebugResult(null);
      setActiveSavedTest(test);
      const savedConfig = test?.config && typeof test.config === "object" ? test.config : {};
      setDebugRecordMode(savedConfig.recordMode === "specific" ? "specific" : "latest");
      setDebugRecordId(savedConfig.recordMode === "specific" ? String(savedConfig.recordId || "") : "");
      setDebugOpen(true);
      const definition = buildWorkflowPayload("DRAFT");
      const response = await apiRequest(`/api/platform/rules/${workflowId}/tests/${test.id}/run`, {
        method: "POST",
        body: JSON.stringify({ definition }),
      });
      const result = response?.data || null;
      setDebugResult(result);
      await loadSavedTests();
    } catch (error) {
      onError?.(error.message || "Unable to run saved flow test.");
    } finally {
      setTestBusyId(null);
    }
  };

  const deleteSavedTest = async (testId) => {
    if (!workflowId) return;
    try {
      await apiRequest(`/api/platform/rules/${workflowId}/tests/${testId}`, { method: "DELETE" });
      if (String(editingTestId || "") === String(testId)) cancelTestEdit();
      setPendingDeleteTestId(null);
      if (String(activeSavedTest?.id || "") === String(testId)) setActiveSavedTest(null);
      await loadSavedTests();
    } catch (error) {
      onError?.(error.message || "Unable to remove flow test.");
    }
  };

  const compareVersionSummary = (versionItem) => {
    const oldDefinition = versionItem?.definition || {};
    const currentDefinition = buildWorkflowPayload(workflow.lifecycleStatus || "DRAFT");
    const currentActions = currentDefinition.action?.actions || [];
    const oldActions = oldDefinition.action?.actions || [];
    const currentById = new Map(currentActions.filter((item) => item?.id).map((item) => [String(item.id), item]));
    const oldById = new Map(oldActions.filter((item) => item?.id).map((item) => [String(item.id), item]));
    const added = [...currentById.keys()].filter((id) => !oldById.has(id)).length;
    const removed = [...oldById.keys()].filter((id) => !currentById.has(id)).length;
    const changed = [...currentById.keys()].filter((id) => oldById.has(id) && JSON.stringify(currentById.get(id)) !== JSON.stringify(oldById.get(id))).length;
    const changes = [];
    if (String(oldDefinition.name || "") !== String(currentDefinition.name || "")) changes.push("Flow name changed");
    if (String(oldDefinition.trigger_key || "") !== String(currentDefinition.triggerKey || "")) changes.push("Trigger changed");
    if (String(oldDefinition.object_id || "") !== String(currentDefinition.objectId || "")) changes.push("Trigger object changed");
    if (JSON.stringify(oldDefinition.conditions || []) !== JSON.stringify(currentDefinition.conditions || [])) changes.push("Start conditions changed");
    if (added) changes.push(`${added} step${added === 1 ? "" : "s"} added`);
    if (removed) changes.push(`${removed} step${removed === 1 ? "" : "s"} removed`);
    if (changed) changes.push(`${changed} step${changed === 1 ? "" : "s"} changed`);
    if (JSON.stringify(oldDefinition.action?.inputContract || []) !== JSON.stringify(currentDefinition.action?.inputContract || [])) changes.push("Subflow inputs changed");
    if (JSON.stringify(oldDefinition.action?.outputContract || []) !== JSON.stringify(currentDefinition.action?.outputContract || [])) changes.push("Subflow outputs changed");
    return changes.length ? changes : ["No definition differences from the current Builder state"];
  };

  const requestRestoreWorkflowVersion = (version) => {
    if (hasUnsavedChanges) {
      setPendingRestoreVersion(version);
      return;
    }
    restoreWorkflowVersion(version);
  };

  const restoreWorkflowVersion = async (version) => {
    if (!workflowId) return;
    try {
      setVersionsBusy(true);
      await apiRequest(`/api/platform/rules/${workflowId}/versions/${version}/restore`, { method: "POST" });
      const response = await apiRequest("/api/platform/rules");
      const rule = (Array.isArray(response?.data) ? response.data : []).find((item) => String(item.id) === String(workflowId));
      if (!rule) throw new Error("Restored flow could not be reloaded");
      const restored = {
        ...rule,
        id: rule.id,
        name: rule.name,
        object: rule.object_key || rule.object || "",
        objectId: rule.object_id || null,
        objectKey: rule.object_key || "",
        trigger: rule.trigger_key,
        active: false,
        scope: rule.action?.scope || null,
        inputContract: rule.action?.inputContract || [],
        outputContract: rule.action?.outputContract || [],
        match: rule.action?.match || "all",
        entryTransition: rule.action?.entryTransition || "EVERY_TIME",
        lifecycleStatus: "DRAFT",
        version: Number(rule.version || 1),
        actionMetadata: {
          flowType: rule.action?.flowType || null,
          templateKey: rule.action?.templateKey || null,
          defaultForNewDevices: rule.action?.defaultForNewDevices === true,
          ui: rule.action?.ui || null,
        },
        conditions: rule.conditions || [],
        steps: (rule.action?.actions || []).map((action) => {
          const base = makeStep(action.type || action.key);
          return {
            ...base,
            id: action.id || base.id,
            label: action.label || getActionLabel(action.type || action.key),
            type: action.type || action.key,
            config: {
              ...base.config,
              ...action,
              apiParameters: {
                ...(action.apiParameters || {}),
                ...Object.fromEntries(Object.entries(action).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
              },
              ...(action.type === "FORMULA" ? { formulaInputs: action.formulaInputs || action.inputs || {} } : {}),
            },
          };
        }),
      };
      setWorkflow(restored);
      setSavedDefinitionSignature(persistedWorkflowSignature(restored));
      setPendingRestoreVersion(null);
      setSavedWorkflows((current) => [restored, ...current.filter((item) => String(item.id) !== String(workflowId))]);
      await loadWorkflowVersions();
      onMessage?.(`Version ${version} restored as new draft version ${restored.version}.`);
    } catch (error) {
      onError?.(error.message || "Unable to restore flow version.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const debugMissingInput = (workflow.inputContract || []).find((input) => {
    if (input.required !== true) return false;
    const value = debugInputs[input.name];
    return value === undefined || value === null || String(value).trim() === "";
  }) || null;

  const focusStepById = (stepId) => {
    const targetId = workflow.steps.some((step) => String(step.id) === String(stepId || "")) ? stepId : "__start__";
    setSelectedId(targetId);
    setPropertiesOpen(true);
    window.requestAnimationFrame(() => document.getElementById("workflow-canvas-section")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const focusDebugFailure = () => {
    const failedId = workflow.steps.find((step) => debugTrace?.[step.id]?.status === "FAILED")?.id;
    focusStepById(failedId || "__start__");
  };

  const runDebug = async () => {
    if (reviewIssue) {
      onError?.(`Fix the flow before Debug: ${reviewIssue}`);
      return;
    }
    if (workflow.object && debugRecordMode === "specific" && !debugRecordId.trim()) {
      onError?.("Choose a specific record ID before running Debug.");
      return;
    }
    if (debugMissingInput) {
      onError?.(`Enter the required Debug input: ${debugMissingInput.label || debugMissingInput.name}.`);
      return;
    }
    setDebugRunning(true);
    setDebugResult(null);
    try {
      const definition = buildWorkflowPayload("DRAFT");
      const endpoint = workflowId ? `/api/platform/rules/${workflowId}/debug` : "/api/platform/rules/debug";
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          definition,
          mode: debugMode,
          inputs: debugInputs,
          debugOptions: {
            pathId: debugPathId,
            skipStartConditionRequirements: debugSkipStartConditions,
            rollbackMode: debugRollbackMode,
            recordEvent: flowType === "RECORD_TRIGGERED" ? recordTriggerWhen(workflow.trigger) : null,
          },
          ...(debugRecordMode === "specific" ? { recordId: debugRecordId.trim() } : {}),
        }),
      });
      setDebugResult(response?.data || null);
      setDebugPanelTab("details");
    } catch (error) {
      onError?.(error.message || "Unable to run Debug.");
    } finally {
      setDebugRunning(false);
    }
  };

  const visibleSavedWorkflows = savedWorkflows.filter((item) => {
    const system = item.systemGenerated === true || item.scope === "system";
    if (workflowListFilter === "system" && !system) return false;
    if (workflowListFilter === "user" && system) return false;
    const query = workflowListSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.trigger, item.capabilityType, item.capabilityKey, item.object]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  if (!showBuilder && !embedded) {
    return (
      <div className="space-y-4">
        {newFlowChooserOpen ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="New Flow">
            <div className="workflow-new-flow-dialog w-full max-w-5xl border border-slate-300 bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">New Flow</h3>
                  <p className="mt-1 text-sm text-slate-500">{newFlowChooserStep === "source" ? "Choose how you want to start." : "Choose the type of flow you want to build."}</p>
                </div>
                <button type="button" className="workflow-cancel-button" onClick={() => setNewFlowChooserOpen(false)} aria-label="Close New Flow">×</button>
              </div>
              {newFlowChooserStep === "source" ? (
                <div className="px-6 py-6">
                  <div className="mb-4 text-sm font-semibold text-slate-800">How do you want to start?</div>
                  <button
                    type="button"
                    className="workflow-new-flow-source is-selected"
                    aria-pressed="true"
                    onClick={() => {}}
                  >
                    <span className="workflow-new-flow-source-icon">＋</span>
                    <span>
                      <strong>Start From Scratch</strong>
                      <small>Choose a flow type and configure the automation yourself.</small>
                    </span>
                  </button>
                </div>
              ) : (
                <div className="px-6 py-5">
                  <div className="mb-4 text-sm font-semibold text-slate-800">Select a Flow Type</div>
                  <div className="workflow-new-flow-grid">
                    {FLOW_TYPE_OPTIONS.map((option) => {
                      const selected = newFlowTypeDraft === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-pressed={selected}
                          className={`workflow-new-flow-type ${selected ? "is-selected" : ""}`}
                          onClick={() => setNewFlowTypeDraft(option.key)}
                        >
                          <span className="workflow-new-flow-type-icon">{option.icon}</span>
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3">
                <div>{newFlowChooserStep === "type" ? <button type="button" className="workflow-cancel-button" onClick={() => setNewFlowChooserStep("source")}>Back</button> : null}</div>
                <div className="flex gap-2">
                  <button type="button" className="workflow-cancel-button" onClick={() => setNewFlowChooserOpen(false)}>Cancel</button>
                  {newFlowChooserStep === "source"
                    ? <button type="button" className="workflow-save-button" onClick={() => setNewFlowChooserStep("type")}>Next</button>
                    : <button type="button" className="workflow-save-button" disabled={!newFlowTypeDraft} onClick={() => startNewFlow(newFlowTypeDraft)}>Create</button>}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <button type="button" aria-label="New Flow" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => { setNewFlowChooserStep("source"); setNewFlowTypeDraft(""); setNewFlowChooserOpen(true); }}>+ New Flow</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={inputClass}
            style={{ maxWidth: 360 }}
            value={workflowListSearch}
            onChange={(event) => setWorkflowListSearch(event.target.value)}
            placeholder="Search workflows..."
          />
          <select className={inputClass} style={{ maxWidth: 180 }} value={workflowListFilter} onChange={(event) => setWorkflowListFilter(event.target.value)}>
            <option value="all">All workflows</option>
            <option value="system">System workflows</option>
            <option value="user">User workflows</option>
          </select>
          <span className="text-xs text-slate-500">{visibleSavedWorkflows.length} shown · {savedWorkflows.length} total</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          {visibleSavedWorkflows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No workflows match this view.</div>
          ) : visibleSavedWorkflows.map((item, index) => (
            <div key={`${item.name || "workflow"}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-b-0">
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-slate-800">{item.name || "Unnamed workflow"}</strong>
                  {item.systemGenerated || item.scope === "system" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">SYSTEM</span> : null}
                  {item.runtimeActive ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">LIVE{item.activeVersion ? ` v${item.activeVersion}` : ""}</span> : null}
                  {item.lifecycleStatus === "DRAFT" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">DRAFT{item.version ? ` v${item.version}` : ""}</span> : null}
                </div>
                <span className="block text-xs text-slate-500">
                  {item.object || "No trigger object"} · {getTriggerLabel(item.trigger)}
                  {item.capabilityKey ? ` · ${item.capabilityType || "capability"}: ${item.capabilityKey}` : ""}
                </span>
              </div>
              <div className="flex gap-3">
                <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setSavedDefinitionSignature(persistedWorkflowSignature(item)); setShowBuilder(true); }}>Edit</button>
                <button type="button" className="text-sm text-indigo-700" onClick={() => {
                  setWorkflowId(null);
                  setWorkflow({
                    ...item,
                    id: null,
                    name: `${item.name || "Flow"} Copy`,
                    lifecycleStatus: "DRAFT",
                    active: false,
                    runtimeActive: false,
                    activeVersion: null,
                    draftVersion: null,
                    version: 1,
                    actionMetadata: item.actionMetadata ? JSON.parse(JSON.stringify(item.actionMetadata)) : null,
                    steps: (item.steps || []).map((step) => ({ ...step, id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}` })),
                  });
                  setSavedDefinitionSignature(persistedWorkflowSignature(createBlankWorkflow(scopeKey)));
                  setShowBuilder(true);
                }}>Clone</button>
                {item.id && (item.runtimeActive === true || item.active !== false) ? <button type="button" className="text-sm text-slate-600" onClick={() => deactivateWorkflow(item)}>Deactivate</button> : item.id ? <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setSavedDefinitionSignature(persistedWorkflowSignature(item)); setShowBuilder(true); }}>Open to activate</button> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-builder-page space-y-3">
      <style>{WORKFLOW_VISUAL_CSS}</style>
      {leaveConfirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4" role="dialog" aria-modal="true" aria-label="Unsaved Flow Changes">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Unsaved flow changes</div>
            <p className="mt-2 text-sm text-slate-600">You have changes that have not been saved. Save the draft before leaving, or discard the local changes.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="workflow-cancel-button" disabled={saveBusy} onClick={() => setLeaveConfirmOpen(false)}>Keep Editing</button>
              <button type="button" className="workflow-cancel-button" disabled={saveBusy} onClick={discardAndLeaveBuilder}>Discard Changes</button>
              <button type="button" className="workflow-save-button" disabled={saveBusy || Boolean(reviewIssue)} title={reviewIssue || "Save draft and leave"} onClick={saveAndLeaveBuilder}>{saveBusy ? "Saving…" : "Save Draft & Leave"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {deactivateConfirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4" role="dialog" aria-modal="true" aria-label="Deactivate Flow">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Deactivate live flow?</div>
            <p className="mt-2 text-sm text-slate-600">This stops new runs from the currently live version. Existing run history and any saved Draft version are kept.</p>
            {hasUnsavedChanges ? <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">You also have unsaved Builder changes. Deactivation will not save those changes.</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="workflow-cancel-button" disabled={saveBusy} onClick={() => setDeactivateConfirmOpen(false)}>Cancel</button>
              <button type="button" className="workflow-save-button" disabled={saveBusy} onClick={() => deactivateWorkflow()}>{saveBusy ? "Deactivating…" : "Deactivate Flow"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingRestoreVersion !== null ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4" role="dialog" aria-modal="true" aria-label="Restore Flow Version">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">Discard unsaved changes and restore?</div>
            <p className="mt-2 text-sm text-slate-600">Restoring version {pendingRestoreVersion} creates a new Draft version. Your current unsaved Builder changes will be discarded.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="workflow-cancel-button" disabled={versionsBusy} onClick={() => setPendingRestoreVersion(null)}>Cancel</button>
              <button type="button" className="workflow-save-button" disabled={versionsBusy} onClick={() => restoreWorkflowVersion(pendingRestoreVersion)}>{versionsBusy ? "Restoring…" : `Restore Version ${pendingRestoreVersion}`}</button>
            </div>
          </div>
        </div>
      ) : null}
      {builderLoadIssues.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Some flow resources could not be loaded.</strong>
          <div className="mt-1 text-xs">{builderLoadIssues.join(" · ")}</div>
          <div className="mt-1 text-xs">Do not assume an empty dropdown means there are no records. Refresh after the connection/API issue is resolved.</div>
        </div>
      ) : null}
      <div id="workflow-trigger-section" className="workflow-builder-header">
        <div className="workflow-builder-heading">
          <button type="button" className="workflow-builder-back" aria-label="Back to Flows" title="Back to Flows" onClick={leaveBuilder}>←</button>
          <span className={`workflow-ready-dot ${reviewIssue ? "has-issue" : ""}`} title={reviewIssue || "Flow ready"} />
          <div className="workflow-builder-title-copy">
            <h2>Flow Builder</h2>
            <small>{workflow.name || "New Flow"} <span className="workflow-builder-status">{workflow.runtimeActive ? `LIVE v${workflow.activeVersion || workflow.version || 1}` : "NOT LIVE"}{workflow.draftVersion || String(workflow.lifecycleStatus || "").toUpperCase() === "DRAFT" ? ` · DRAFT v${workflow.draftVersion || workflow.version || 1}` : ""}{hasUnsavedChanges ? " · Unsaved changes" : " · Saved"}</span></small>
          </div>
        </div>
        <div className="workflow-builder-actions">
          <button type="button" className="workflow-cancel-button workflow-icon-button" disabled={!flowHistory.past.length} onClick={undoFlowChange} title="Undo" aria-label="Undo">↶</button>
          <button type="button" className="workflow-cancel-button workflow-icon-button" disabled={!flowHistory.future.length} onClick={redoFlowChange} title="Redo" aria-label="Redo">↷</button>
          <span className="workflow-header-separator" aria-hidden="true" />
          <button type="button" className="workflow-cancel-button" onClick={requestSelectionMode}>Select Elements</button>
          <span className="workflow-layout-toggle workflow-layout-toggle--header" aria-label="Canvas layout">
            <button type="button" className={layoutMode === "AUTO" ? "is-active" : ""} onClick={() => setLayoutMode("AUTO")}>Auto-Layout</button>
            <button type="button" className={layoutMode === "FREEFORM" ? "is-active" : ""} onClick={() => { setLayoutMode("FREEFORM"); setPaletteOpen(true); setPaletteTab("elements"); }}>Free-Form</button>
          </span>
          <button type="button" className="workflow-cancel-button" aria-label="View Properties" onClick={openFlowProperties}>Properties</button>
          {reviewIssue ? <button type="button" className="workflow-cancel-button workflow-icon-button" title={reviewIssue} aria-label="Show Errors" onClick={() => document.getElementById("workflow-review-section")?.scrollIntoView({ behavior: "smooth", block: "center" })}>!</button> : null}
          <button type="button" className="workflow-cancel-button" aria-label="View Tests" disabled={!workflowId} onClick={() => { setTestsOpen((value) => !value); if (!testsOpen) loadSavedTests(); }}>View Tests</button>
          <button type="button" className="workflow-cancel-button" onClick={() => { setDebugPanelTab("setup"); setDebugOpen(true); }}>Debug</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId || saveBusy} title={workflowId ? "Create a new immutable version from the current Builder state" : "Save this flow first"} onClick={() => saveWorkflow("DRAFT", { keepOpen: true, forceNewVersion: true })}>{saveBusy ? "Saving…" : "Save As"}</button>
          <button type="button" className="workflow-cancel-button" disabled={saveBusy || (Boolean(workflowId) && !hasUnsavedChanges)} title={!hasUnsavedChanges && workflowId ? "No unsaved changes" : "Save draft"} onClick={() => saveWorkflow("DRAFT")}>{saveBusy ? "Saving…" : "Save"}</button>
          {workflow.runtimeActive ? <button type="button" className="workflow-cancel-button" disabled={saveBusy} title="Stop new runs from the currently live version" onClick={() => setDeactivateConfirmOpen(true)}>Deactivate</button> : null}
          <button type="button" className="workflow-save-button" disabled={saveBusy || Boolean(reviewIssue) || (workflow.runtimeActive && !hasUnsavedChanges && !workflow.draftVersion)} title={reviewIssue || (workflow.runtimeActive ? (hasUnsavedChanges || workflow.draftVersion ? "Activate the current draft as the new live version" : "This version is already live") : "Activate flow")} onClick={() => saveWorkflow("ACTIVE")}>{saveBusy ? "Saving…" : workflow.runtimeActive ? (hasUnsavedChanges || workflow.draftVersion ? "Activate Draft" : "Active") : "Activate"}</button>
          <details className="workflow-header-more">
            <summary aria-label="More Flow actions" title="More">⋮</summary>
            <div className="workflow-header-more-menu">
              <button type="button" disabled={!workflowId} onClick={() => { setVersionsOpen((value) => !value); if (!versionsOpen) loadWorkflowVersions(); }}>Edit History</button>
            </div>
          </details>
        </div>
      </div>

      {flowPropertiesOpen ? (
        <div className="workflow-flow-properties-panel" role="dialog" aria-label="Flow Properties">
          <div className="workflow-add-element-head">
            <div><strong>Flow Properties</strong><small>Version {workflow.version || 1}</small></div>
            <button type="button" aria-label="Close Flow Properties" onClick={cancelFlowProperties}>×</button>
          </div>
          <div className="workflow-path-action-body space-y-3">
            <label>Flow Label
              <input className={inputClass} value={workflow.name || ""} onChange={(event) => {
                const label = event.target.value;
                const previousApi = workflow.actionMetadata?.apiName || "";
                const generatedPrevious = flowApiName(workflow.name || "");
                setWorkflow((current) => ({
                  ...current,
                  name: label,
                  actionMetadata: {
                    ...(current.actionMetadata || {}),
                    apiName: !workflowId && (!previousApi || previousApi === generatedPrevious) ? flowApiName(label) : previousApi,
                  },
                }));
              }} placeholder="Flow Label" />
            </label>
            <label>Flow API Name
              <input className={inputClass} disabled={Boolean(workflowId)} value={workflow.actionMetadata?.apiName || flowApiName(workflow.name || "Flow")} onChange={(event) => setWorkflow((current) => ({ ...current, actionMetadata: { ...(current.actionMetadata || {}), apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") } }))} />
            </label>
            <label>Description
              <textarea className={inputClass} rows={4} value={workflow.actionMetadata?.description || ""} onChange={(event) => setWorkflow((current) => ({ ...current, actionMetadata: { ...(current.actionMetadata || {}), description: event.target.value } }))} placeholder="Describe what this flow does." />
            </label>

            <div className="workflow-path-action-buttons">
              <button type="button" className="workflow-cancel-button" onClick={cancelFlowProperties}>Cancel</button>
              <button type="button" className="workflow-save-button" onClick={finishFlowProperties}>Done</button>
            </div>
          </div>
        </div>
      ) : null}
      {testsOpen ? (
        <div className="workflow-sfdc-drawer workflow-tests-drawer">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">Saved Tests</div>
              <p className="mt-1 text-xs text-slate-500">Reusable rollback-safe tests. Assertions make regressions visible after future flow edits.</p>
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setTestsOpen(false)}>Close</button>
          </div>
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input className={inputClass} value={testDraft.name} onChange={(event) => setTestDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Test name, e.g. High value order takes VIP path" />
            <div className="grid gap-2 md:grid-cols-2">
              <select className={inputClass} value={testDraft.recordMode} onChange={(event) => setTestDraft((current) => ({ ...current, recordMode: event.target.value }))}>
                <option value="latest">Use latest record</option>
                <option value="specific">Use specific record</option>
              </select>
              {testDraft.recordMode === "specific" ? <WorkflowRecordPicker objectKey={workflow.object} value={testDraft.recordId} onChange={(recordId) => setTestDraft((current) => ({ ...current, recordId }))} ariaLabel="Search test record" /> : <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Uses the latest accessible record in the current store/company.</div>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Assertions</strong>
                <button type="button" className="text-xs text-blue-700" onClick={() => setTestDraft((current) => ({ ...current, assertions: [...(current.assertions || []), { type: "STEP_STATUS", stepId: "", expected: "COMPLETED" }] }))}>+ Assertion</button>
              </div>
              {(testDraft.assertions || []).map((assertion, assertionIndex) => {
                const decisionStep = workflow.steps.find((step) => String(step.id) === String(assertion.stepId || ""));
                const outcomes = Array.isArray(decisionStep?.config?.outcomes) ? decisionStep.config.outcomes : [];
                return (
                  <div key={assertionIndex} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <select className={inputClass} value={assertion.type || "RUN_STATUS"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { type: event.target.value, expected: event.target.value === "RUN_STATUS" ? "COMPLETED" : "", stepId: "", resource: "" } : item) }))}>
                        <option value="RUN_STATUS">Flow result</option>
                        <option value="STEP_STATUS">Element result</option>
                        <option value="DECISION_OUTCOME">Decision outcome</option>
                        <option value="RESOURCE_EQUALS">Resource equals</option>
                      </select>
                      {["STEP_STATUS","DECISION_OUTCOME"].includes(assertion.type) ? (
                        <select className={inputClass} value={assertion.stepId || ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, stepId: event.target.value, expected: "" } : item) }))}>
                          <option value="">Select element</option>
                          {workflow.steps.filter((step) => assertion.type !== "DECISION_OUTCOME" || step.type === "CONDITION").map((step) => <option key={step.id} value={step.id}>{step.label || getActionLabel(step.type)}</option>)}
                        </select>
                      ) : assertion.type === "RESOURCE_EQUALS" ? (
                        <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog)} label="" value={assertion.resource || ""} onChange={(resource) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, resource } : item) }))} />
                      ) : <div />}
                      {assertion.type === "RUN_STATUS" ? (
                        <select className={inputClass} value={assertion.expected || "COMPLETED"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="COMPLETED">Completes</option><option value="FAILED">Fails</option><option value="NOT_STARTED">Does not start</option>
                        </select>
                      ) : assertion.type === "STEP_STATUS" ? (
                        <select className={inputClass} value={assertion.expected || "COMPLETED"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="NOT_RUN">Not run</option>
                        </select>
                      ) : assertion.type === "DECISION_OUTCOME" ? (
                        <select className={inputClass} value={assertion.expected || ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="">Select outcome</option>
                          {outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.label || outcome.id}</option>)}
                          <option value="__DEFAULT__">Default Outcome</option>
                        </select>
                      ) : (
                        <input className={inputClass} value={assertion.expected ?? ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))} placeholder="Expected value" />
                      )}
                      <button type="button" className="text-xs text-red-600" onClick={() => setTestDraft((current) => ({ ...current, assertions: current.assertions.filter((_, index) => index !== assertionIndex) }))}>Remove</button>
                    </div>
                    <div className="text-[11px] text-slate-500">{assertionLabel(assertion)}</div>
                  </div>
                );
              })}
            </div>
            {savedTestDraftIssue ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{savedTestDraftIssue}</div> : null}
            <div className="flex justify-end gap-2">{editingTestId ? <button type="button" className="workflow-cancel-button" onClick={cancelTestEdit}>Cancel edit</button> : null}<button type="button" className="workflow-save-button" disabled={Boolean(testBusyId) || Boolean(savedTestDraftIssue)} onClick={saveTestCase}>{testBusyId ? "Saving…" : editingTestId ? "Update Test" : "Save Test"}</button></div>
          </div>
          <div className="mt-4 space-y-2">
            {savedTests.map((test) => (
              <div key={test.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <strong className="text-sm text-slate-800">{test.name}</strong>
                  <div className="mt-1 text-[11px] text-slate-500">{(test.config?.assertions || []).length} assertion(s){test.last_status ? ` · Last result: ${test.last_status}` : " · Not run yet"}{test.last_run_at ? ` · ${new Date(test.last_run_at).toLocaleString("en-GB")}` : ""}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="workflow-cancel-button" disabled={testBusyId === test.id} onClick={() => runSavedTest(test)}>{testBusyId === test.id ? "Running…" : test.last_status ? "Run again" : "Run"}</button>
                  <button type="button" className="workflow-cancel-button" disabled={Boolean(testBusyId)} onClick={() => editSavedTest(test)}>Edit</button>
                  {String(pendingDeleteTestId || "") === String(test.id) ? (
                    <>
                      <button type="button" className="workflow-cancel-button" disabled={Boolean(testBusyId)} onClick={() => setPendingDeleteTestId(null)}>Cancel</button>
                      <button type="button" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" disabled={Boolean(testBusyId)} onClick={() => deleteSavedTest(test.id)}>Confirm delete</button>
                    </>
                  ) : <button type="button" className="workflow-cancel-button" disabled={Boolean(testBusyId)} onClick={() => setPendingDeleteTestId(test.id)}>Delete</button>}
                </div>
              </div>
            ))}
            {!savedTests.length ? <div className="text-xs text-slate-500">No saved tests yet.</div> : null}
          </div>
        </div>
      ) : null}

      {versionsOpen ? (
        <div className="relative z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">Version History</div>
              <p className="mt-1 text-xs text-slate-500">Every meaningful save creates an immutable snapshot. Restoring creates a new Draft version; history is never overwritten.</p>
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setVersionsOpen(false)}>Close</button>
          </div>
          <div className="mt-4 space-y-2">
            {workflowVersions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div><strong className="text-sm text-slate-800">Version {item.version}</strong><div className="mt-1 text-[11px] text-slate-500">{item.lifecycle_status || "DRAFT"} · {item.created_at ? new Date(item.created_at).toLocaleString("en-GB") : ""}</div></div>
                  <div className="flex gap-2">
                    <button type="button" className="workflow-cancel-button" onClick={() => setCompareVersionId((current) => current === item.id ? null : item.id)}>{compareVersionId === item.id ? "Hide comparison" : "Compare"}</button>
                    <button type="button" className="workflow-cancel-button" disabled={versionsBusy || Number(item.version) === Number(workflow.version)} onClick={() => requestRestoreWorkflowVersion(item.version)}>Restore as new Draft</button>
                  </div>
                </div>
                {compareVersionId === item.id ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold text-slate-700">Compared with current Builder state</div>
                    <div className="mt-2 space-y-1">
                      {compareVersionSummary(item).map((change) => <div key={change} className="text-xs text-slate-600">• {change}</div>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {versionsBusy ? <div className="text-xs text-slate-500">Loading versions…</div> : !workflowVersions.length ? <div className="text-xs text-slate-500">No version snapshots yet.</div> : null}
          </div>
        </div>
      ) : null}

      <details className="workflow-subflow-interface relative z-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Subflow interface</summary>
        <p className="mt-2 text-xs text-slate-500">Optional. Declare typed inputs and outputs when this workflow should be reusable from Run Subflow. Normal trigger-based workflows can leave this empty.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-slate-700">Inputs</strong>
              <button type="button" className="text-xs text-blue-700" onClick={() => setWorkflow((current) => ({ ...current, inputContract: [...(current.inputContract || []), { name: `input_${(current.inputContract || []).length + 1}`, label: "Input", type: "text", required: false }] }))}>+ Input</button>
            </div>
            {(workflow.inputContract || []).map((input, inputIndex) => (
              <div key={`${input.name}-${inputIndex}`} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_.8fr_auto_auto]">
                <input className={inputClass} value={input.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, name: event.target.value.replace(/[^A-Za-z0-9_]/g, "") } : item) }))} placeholder="api_name" />
                <input className={inputClass} value={input.label || ""} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, label: event.target.value } : item) }))} placeholder="Label" />
                <select className={inputClass} value={input.type || "text"} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, type: event.target.value } : item) }))}>
                  {["text","number","boolean","date","datetime","record","collection","object"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={input.required === true} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, required: event.target.checked } : item) }))} /> Required</label>
                <button type="button" className="text-xs text-red-600" onClick={() => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).filter((_, index) => index !== inputIndex) }))}>Remove</button>
              </div>
            ))}
            {!(workflow.inputContract || []).length ? <div className="text-[11px] text-slate-500">No declared inputs.</div> : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-slate-700">Outputs</strong>
              <button type="button" className="text-xs text-blue-700" onClick={() => setWorkflow((current) => ({ ...current, outputContract: [...(current.outputContract || []), { name: `output_${(current.outputContract || []).length + 1}`, label: "Output", type: "text", source: "", required: false }] }))}>+ Output</button>
            </div>
            {(workflow.outputContract || []).map((output, outputIndex) => (
              <div key={`${output.name}-${outputIndex}`} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_.8fr_auto]">
                  <input className={inputClass} value={output.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, name: event.target.value.replace(/[^A-Za-z0-9_]/g, "") } : item) }))} placeholder="api_name" />
                  <input className={inputClass} value={output.label || ""} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, label: event.target.value } : item) }))} placeholder="Label" />
                  <select className={inputClass} value={output.type || "text"} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, type: event.target.value } : item) }))}>
                    {["text","number","boolean","date","datetime","record","collection","object"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button type="button" className="text-xs text-red-600" onClick={() => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).filter((_, index) => index !== outputIndex) }))}>Remove</button>
                </div>
                <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog)} label="Output Resource" value={output.source || ""} onChange={(source) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, source } : item) }))} />
              </div>
            ))}
            {!(workflow.outputContract || []).length ? <div className="text-[11px] text-slate-500">No declared outputs.</div> : null}
          </div>
        </div>
      </details>

      {debugOpen ? (
        <div className="workflow-sfdc-drawer workflow-debug-drawer">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-800">Debug</div>
              </div>
              <div className="workflow-debug-tabs mt-3">
                <button type="button" className={debugPanelTab === "setup" ? "is-active" : ""} onClick={() => setDebugPanelTab("setup")}>Setup</button>
                <button type="button" className={debugPanelTab === "details" ? "is-active" : ""} disabled={!debugResult} onClick={() => setDebugPanelTab("details")}>Details</button>
              </div>
              {debugPanelTab === "setup" ? <p className="mt-1 text-xs text-slate-500">Configure the triggering context for this debug interview. Your selections are kept while this Builder session remains open.</p> : <p className="mt-1 text-xs text-slate-500">Review the executed path, resources, outcomes, and any errors from the latest debug interview.</p>}
              {debugPanelTab === "setup" && flowType === "RECORD_TRIGGERED" ? <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Debug Options</div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-[11px] font-medium text-slate-600">Path for Debug Run
                    <select className={inputClass} value={debugPathId} onChange={(event) => setDebugPathId(event.target.value)}>
                      <option value="immediate">Run Immediately</option>
                      {scheduledPathSteps.map(({ step }) => <option key={step.id} value={step.id}>{step.config?.pathLabel || step.label || "Scheduled Path"}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-slate-600">Run the Flow As If the Record Is
                    <select className={inputClass} value={recordTriggerWhen(workflow.trigger) === "created" ? "created" : "updated"} onChange={(event) => {
                      const when = event.target.value === "created" ? "created" : "updated";
                      setWorkflow((current) => ({ ...current, trigger: recordTriggerKey(when, current.actionMetadata?.optimizeFor) }));
                    }}>
                      <option value="created">Created</option>
                      <option value="updated">Updated</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-start gap-2 text-[11px] text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={debugRecordMode === "specific"} onChange={(event) => { setDebugRecordMode(event.target.checked ? "specific" : "latest"); setDebugResult(null); }} />
                  <span><strong className="block">Use a specific triggering record</strong><span className="text-slate-500">Search for the record whose field values should be used for this debug interview.</span></span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={debugSkipStartConditions} onChange={(event) => setDebugSkipStartConditions(event.target.checked)} />
                  <span><strong className="block">Skip start condition requirements</strong><span className="text-slate-500">Run the selected path even if the triggering record does not meet Start entry criteria.</span></span>
                </label>
                <label className="flex items-start gap-2 text-[11px] text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={debugRollbackMode} onChange={(event) => setDebugRollbackMode(event.target.checked)} />
                  <span><strong className="block">Run automation in rollback mode</strong><span className="text-slate-500">Database changes are rolled back after the debug interview. External actions remain simulated.</span></span>
                </label>
              </div> : null}
              {workflow.entryTransition === "UPDATED_TO_MEET" ? <p className="mt-1 text-[11px] text-amber-700">For this test, the selected record is treated as the newly matching state. Production still verifies the real previous record did not meet the Start conditions.</p> : null}
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setDebugOpen(false)}>Close</button>
          </div>
          {debugPanelTab === "setup" && (workflow.inputContract || []).length ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-700">Debug inputs</div>
              <p className="mt-1 text-[11px] text-slate-500">These values are available to the flow as declared input resources for this run only.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(workflow.inputContract || []).map((input) => {
                  const value = debugInputs[input.name] ?? "";
                  const update = (nextValue) => setDebugInputs((current) => ({ ...current, [input.name]: nextValue }));
                  return (
                    <label key={input.name} className="text-xs font-medium text-slate-700">
                      {input.label || input.name}{input.required === true ? " *" : ""}
                      {input.type === "boolean" ? (
                        <select className={inputClass} value={String(value)} onChange={(event) => update(event.target.value === "true")}>
                          <option value="">Select…</option>
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      ) : (
                        <input className={inputClass} type={input.type === "number" ? "number" : "text"} value={value} onChange={(event) => update(input.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} placeholder={input.name || "Input value"} />
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          {debugPanelTab === "setup" && workflow.object ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              {debugRecordMode === "specific" ? <WorkflowRecordPicker objectKey={workflow.object} value={debugRecordId} onChange={setDebugRecordId} ariaLabel="Search debug record" /> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">The most recent accessible record will be used unless you choose a specific triggering record above.</div>}
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue) || Boolean(debugMissingInput) || (workflow.object && debugRecordMode === "specific" && !debugRecordId.trim())} onClick={runDebug}>{debugRunning ? "Running…" : "Run"}</button>
            </div>
          ) : debugPanelTab === "setup" ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">This flow has no trigger object, so Debug will run with user/company/store context only.</div>
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue) || Boolean(debugMissingInput) || (workflow.object && debugRecordMode === "specific" && !debugRecordId.trim())} onClick={runDebug}>{debugRunning ? "Running…" : "Run"}</button>
            </div>
          ) : null}
          {debugMissingInput ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Enter the required Debug input <strong>{debugMissingInput.label || debugMissingInput.name}</strong> before running this flow.
            </div>
          ) : null}
          {debugPanelTab === "details" && debugResult ? (
            <div className={`mt-4 rounded-xl border p-4 ${debugMode === "test" ? (debugResult.testPassed === true ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50") : debugResult.status === "FAILED" ? "border-red-200 bg-red-50" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <strong className={debugMode === "test" ? (debugResult.testPassed === true ? "text-emerald-800" : "text-red-800") : debugResult.status === "FAILED" ? "text-red-800" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "text-amber-800" : "text-emerald-800"}>{debugMode === "test" ? (debugResult.testPassed === true ? "Test passed" : "Test failed") : (debugResult.status === "FAILED" ? "Debug found a problem" : debugResult.status === "NOT_STARTED" ? "Debug did not enter the workflow" : debugResult.completedWithHandledError ? "Debug completed with handled error" : "Debug completed successfully")}</strong>
                <span className="text-xs text-slate-500">No database changes were kept.</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="rounded-full bg-white/70 px-2 py-1">Mode: {debugMode === "test" ? "Test" : "Debug"}</span>
                {activeSavedTest ? <span className="rounded-full bg-white/70 px-2 py-1">Saved test: {activeSavedTest.name}</span> : null}
                <span className="rounded-full bg-white/70 px-2 py-1">Record: {debugResult.record?.id || "No trigger record"}</span>
                <span className="rounded-full bg-white/70 px-2 py-1">Rollback: {debugResult.rolledBack ? "Yes" : "No"}</span>
                <span className="rounded-full bg-white/70 px-2 py-1">External actions: {debugResult.externalActionsSimulated ? "Simulated" : "Executed"}</span>
                {activeSavedTest ? <button type="button" className="workflow-cancel-button" disabled={testBusyId === activeSavedTest.id} onClick={() => runSavedTest(activeSavedTest)}>{testBusyId === activeSavedTest.id ? "Running again…" : "Run saved test again"}</button> : null}
              </div>
              {debugMode === "test" && debugResult.testPassed === true && debugResult.status !== "COMPLETED" ? (
                <div className="mt-3 text-sm text-emerald-800">
                  The observed workflow result was <strong>{debugResult.status}</strong>, exactly as this test expected.
                  {(debugResult.assertionResult?.checks || []).length ? (
                    <div className="mt-2 space-y-1">
                      {(debugResult.assertionResult.checks || []).map((check) => <div key={check.index} className="rounded-lg bg-white/70 p-2 text-xs">✓ {check.label || check.type}</div>)}
                    </div>
                  ) : null}
                </div>
              ) : debugResult.status === "FAILED" ? (
                <div className="mt-3 space-y-2 text-sm text-red-800">
                  <div><strong>{debugResult.friendlyError?.title || "An element failed"}</strong></div>
                  <div>{debugResult.friendlyError?.whatHappened || debugResult.run?.error_text || "The flow could not complete."}</div>
                  <div className="rounded-lg bg-white/70 p-3"><strong>How to fix it:</strong> {debugResult.friendlyError?.howToFix || "Click the red step on the canvas and check its Properties."}</div>
                  <button type="button" className="workflow-cancel-button" onClick={focusDebugFailure}>Open failed element</button>
                </div>
              ) : debugResult.completedWithHandledError ? (
                <div className="mt-3 space-y-2 text-sm text-amber-800">
                  <div>The flow continued through a Fault path. The failed element remains red so you can see what was handled.</div>
                  {(debugResult.handledFaults || []).map((fault, index) => (
                    <div key={`${fault.stepId}-${index}`} className="rounded-lg bg-white/80 p-3 text-xs">
                      <strong>{fault.error?.title || "Handled element failure"}</strong>
                      {fault.error?.whatHappened ? <div className="mt-1">{fault.error.whatHappened}</div> : null}
                    </div>
                  ))}
                </div>
              ) : debugResult.status === "NOT_STARTED" ? (
                <div className="mt-2 text-sm text-amber-800">
                  <div>{debugResult.friendlyError?.whatHappened || "The selected record did not meet the flow Start conditions."}</div>
                  <div className="mt-2 rounded-lg bg-white/70 p-3 text-xs"><strong>What to do:</strong> {debugResult.friendlyError?.howToFix || "Choose another record or review the Start conditions."}</div>
                </div>
              ) : debugMode === "test" && debugResult.testPassed === false ? (
                <div className="mt-3 space-y-2 text-sm text-red-800">
                  <strong>One or more assertions did not match.</strong>
                  {(debugResult.assertionResult?.checks || []).map((check) => (
                    <div key={check.index} className={`rounded-lg p-2 text-xs ${check.passed ? "bg-emerald-50 text-emerald-800" : "bg-white text-red-800"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>{check.passed ? "✓" : "✕"} {check.label || check.type} · expected {String(check.expected === "__DEFAULT__" ? "Default Outcome" : check.expected ?? "—")} · actual {String(check.actual === "__DEFAULT__" ? "Default Outcome" : check.actual ?? "—")}</span>
                        {!check.passed && check.stepId ? <button type="button" className="text-[11px] font-semibold text-blue-700" onClick={() => focusStepById(check.stepId)}>Open element</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-emerald-800">{debugMode === "test" ? "The flow passed this test record. Green steps ran successfully; dashed green steps were safely simulated." : "Green steps ran successfully. Dashed green steps were simulated because they would contact an external service or perform an irreversible action."}</p>
              )}
              {Array.isArray(debugResult.steps) && debugResult.steps.length ? (
                <div className="workflow-debug-timeline">
                  <div className="workflow-debug-timeline-title">Execution Details</div>
                  {debugResult.steps.map((stepRun, index) => {
                    const stepId = String(stepRun.step_identifier || "").split("@")[0];
                    const step = workflow.steps.find((item) => String(item.id) === stepId);
                    const status = String(stepRun.metadata?.result?.faultHandled === true ? "FAULT_HANDLED" : stepRun.status || "UNKNOWN").toUpperCase();
                    const result = stepRun.metadata?.result || {};
                    return (
                      <button key={`${stepId || "step"}-${index}`} type="button" className={`workflow-debug-timeline-row is-${status.toLowerCase()}`} onClick={() => stepId && focusStepById(stepId)}>
                        <span className="workflow-debug-status-dot" aria-hidden="true" />
                        <span className="workflow-debug-step-copy">
                          <strong>{step?.label || stepRun.action_type || stepRun.step_identifier || `Step ${index + 1}`}</strong>
                          <small>{status.replaceAll("_", " ")}{result?.simulated === true ? " · Simulated" : ""}{result?.outcomeLabel ? ` · ${result.outcomeLabel}` : result?.outcome ? ` · ${result.outcome}` : ""}</small>
                        </span>
                        <span className="workflow-debug-step-index">{index + 1}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {Array.isArray(debugResult.resourceHistory) && debugResult.resourceHistory.length ? (
                <details className="mt-3 rounded-lg border border-slate-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Resource history · {debugResult.resourceHistory.length} step{debugResult.resourceHistory.length === 1 ? "" : "s"}</summary>
                  <div className="mt-3 space-y-2">
                    {debugResult.resourceHistory.map((entry, index) => (
                      <details key={`${entry.stepId || index}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2">
                        <summary className="cursor-pointer text-xs text-slate-700">
                          <strong>{workflow.steps.find((step) => String(step.id) === String(entry.stepId))?.label || entry.actionType || entry.stepId || `Step ${index + 1}`}</strong>
                          <span className="ml-2 text-slate-400">{entry.status || ""}</span>
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[10px] text-slate-600">{JSON.stringify(entry.snapshot?.variables || {}, null, 2)}</pre>
                      </details>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isKioskExperience ? (
        <div id="workflow-canvas-section" className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">OneKiosk Experience</div>
                <p className="mt-1 max-w-3xl text-xs text-slate-600">This ordered screen flow is the customer journey used by kiosks assigned to this workflow. Reorder, add or remove screens here; no application code is required.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["CATALOGUE","PRODUCT_DETAIL","RECOMMENDATIONS","FULFILMENT","BASKET","LOYALTY","FORM","PAYMENT","CONFIRMATION"].map((type) => (
                  <button key={type} type="button" className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-blue-700" onClick={() => addKioskScreen(type)}>+ {type.replaceAll("_"," ")}</button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-700">Collection display</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <label className="text-xs font-medium text-slate-700">Display title
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.title === "string" ? kioskUi.orderDisplay.title : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),title:e.target.value}})} placeholder="Order collection"/>
                </label>
                <label className="text-xs font-medium text-slate-700">In progress label
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.activeLabel === "string" ? kioskUi.orderDisplay.activeLabel : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),activeLabel:e.target.value}})} placeholder="Preparing / Processing"/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready label
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.readyLabel === "string" ? kioskUi.orderDisplay.readyLabel : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyLabel:e.target.value}})} placeholder="Ready to collect"/>
                </label>
                <label className="text-xs font-medium text-slate-700">In progress statuses
                  <input className={inputClass} value={(kioskUi.orderDisplay?.activeStatuses||["PREPARING","ACCEPTED"]).join(", ")} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),activeStatuses:e.target.value.split(",").map(v=>v.trim().toUpperCase()).filter(Boolean)}})}/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready statuses
                  <input className={inputClass} value={(kioskUi.orderDisplay?.readyStatuses||["READY","READY_FOR_PICKUP"]).join(", ")} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyStatuses:e.target.value.split(",").map(v=>v.trim().toUpperCase()).filter(Boolean)}})}/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready empty text
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.readyEmpty === "string" ? kioskUi.orderDisplay.readyEmpty : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyEmpty:e.target.value}})} placeholder="No orders ready"/>
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-700">Start screen
                <select className={inputClass} value={kioskUi.startScreen || ""} onChange={(event) => updateKioskUi({ startScreen: event.target.value })}>
                  {(kioskUi.screens || []).map((screen) => <option key={screen.key} value={screen.key}>{screen.title || screen.key} · {screen.type}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">Idle timeout (seconds)
                <input className={inputClass} type="number" min="30" value={kioskUi.idleTimeoutSeconds || 75} onChange={(event) => updateKioskUi({ idleTimeoutSeconds: Math.max(30, Number(event.target.value) || 75) })} />
              </label>
              <label className="text-xs font-medium text-slate-700">Attract screen title
                <input className={inputClass} value={typeof kioskUi.attractTitle === "string" ? kioskUi.attractTitle : ""} onChange={(event) => updateKioskUi({ attractTitle: event.target.value })} placeholder="Touch to start" />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-700">Experience languages</div>
              <div className="mt-2 space-y-2">
                {(kioskUi.languages || [{key:"en",label:"English"}]).map((item,languageIndex)=>(
                  <div key={`${item.key}-${languageIndex}`} className="grid gap-2 md:grid-cols-[120px_1fr_auto]">
                    <input className={inputClass} value={item.key || ""} placeholder="en" onChange={(e)=>{
                      const languages=[...(kioskUi.languages||[])]; languages[languageIndex]={...item,key:e.target.value.trim().toLowerCase()}; updateKioskUi({languages});
                    }}/>
                    <input className={inputClass} value={item.label || ""} placeholder="Language label" onChange={(e)=>{
                      const languages=[...(kioskUi.languages||[])]; languages[languageIndex]={...item,label:e.target.value}; updateKioskUi({languages});
                    }}/>
                    <button type="button" disabled={item.key==="en"} className="text-xs text-red-700 disabled:opacity-40" onClick={()=>{
                      const languages=(kioskUi.languages||[]).filter((_,i)=>i!==languageIndex);
                      const translations={...(kioskUi.translations||{})}; delete translations[item.key];
                      updateKioskUi({languages,translations});
                    }}>Remove</button>
                    {item.key && item.key !== "en" ? (
                      <label className="md:col-span-3 text-xs font-medium text-slate-700">
                        {item.label || item.key} translations · one per line as key = translated text
                        <textarea className={inputClass} rows={7} value={Object.entries(kioskUi.translations?.[item.key] || {}).map(([key,value])=>`${key} = ${value}`).join("\n")} onChange={(e)=>{
                          const dictionary={};
                          for(const line of e.target.value.split(/\r?\n/)){
                            const divider=line.indexOf("=");
                            if(divider<1)continue;
                            const key=line.slice(0,divider).trim();
                            const value=line.slice(divider+1).trim();
                            if(key&&value)dictionary[key]=value;
                          }
                          updateKioskUi({translations:{...(kioskUi.translations||{}),[item.key]:dictionary}});
                        }} placeholder={"screen.catalogue.title = Find your product\nfulfilment.COLLECT = Collect here\nconfirmation.doneLabel = Start another order"}/>
                      </label>
                    ) : null}
                  </div>
                ))}
                <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-medium" onClick={()=>{
                  const languages=[...(kioskUi.languages||[{key:"en",label:"English"}]),{key:`lang${(kioskUi.languages||[]).length+1}`,label:"New language"}];
                  updateKioskUi({languages});
                }}>+ Language</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["accessibility","Accessibility"],
                ["language","Language"],
                ["audio","Read aloud"],
                ["ageVerification","Age verification"],
                ["assistance","Need Help"],
                ["idleReset","Idle privacy reset"],
                ["loyalty","Loyalty"],
                ["promotions","Promotions"],
                ["upsell","Upsell / accessories"],
                ["compare","Product compare"],
                ["stockPromise","Stock promise"],
              ].map(([key,label]) => (
                <label key={key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <input type="checkbox" checked={kioskUi.features?.[key] === true} onChange={(event) => updateKioskFeature(key, event.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {(kioskUi.screens || []).map((screen, index) => (
              <div key={screen.key || index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</div>
                    <div>
                      <strong className="block text-sm text-slate-800">{screen.title || screen.key || "Kiosk screen"}</strong>
                      <span className="text-xs text-slate-500">{screen.type}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={index === 0} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40" onClick={() => moveKioskScreen(index,-1)}>↑</button>
                    <button type="button" disabled={index === (kioskUi.screens || []).length - 1} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40" onClick={() => moveKioskScreen(index,1)}>↓</button>
                    <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-700" onClick={() => removeKioskScreen(index)}>Remove</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="text-xs font-medium text-slate-700">Type
                    <select className={inputClass} value={screen.type || "CATALOGUE"} onChange={(event) => updateKioskScreen(index,{ type:event.target.value })}>
                      {["CATALOGUE","PRODUCT_DETAIL","RECOMMENDATIONS","FULFILMENT","BASKET","LOYALTY","FORM","PAYMENT","CONFIRMATION"].map((type) => <option key={type} value={type}>{type.replaceAll("_"," ")}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-700">Key
                    <input className={inputClass} value={screen.key || ""} onChange={(event) => updateKioskScreen(index,{ key:event.target.value.trim().replace(/[^a-zA-Z0-9_-]/g,"_") })} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Title
                    <input className={inputClass} value={typeof screen.title === "string" ? screen.title : ""} onChange={(event) => updateKioskScreen(index,{ title:event.target.value })} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Next
                    <select className={inputClass} value={screen.next || ""} onChange={(event) => updateKioskScreen(index,{ next:event.target.value || null })}>
                      <option value="">Next screen in order</option>
                      {(kioskUi.screens || []).filter((candidate) => candidate.key !== screen.key).map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.title || candidate.key}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold text-slate-600">Conditional display / branching</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <input className={inputClass} value={screen.showWhen?.path || ""} onChange={(e)=>updateKioskScreen(index,{showWhen:e.target.value?{...(screen.showWhen||{}),path:e.target.value}:null})} placeholder="Show when path, e.g. fulfilmentType"/>
                    <select className={inputClass} value={screen.showWhen?.operator || "equals"} onChange={(e)=>updateKioskScreen(index,{showWhen:{...(screen.showWhen||{}),operator:e.target.value}})} disabled={!screen.showWhen?.path}>
                      <option value="equals">equals</option><option value="not_equals">not equals</option><option value="in">in list</option><option value="not_in">not in list</option><option value="truthy">is set / true</option><option value="falsy">is empty / false</option><option value="greater_than">greater than</option><option value="less_than">less than</option>
                    </select>
                    <input className={inputClass} value={screen.showWhen?.value ?? ""} onChange={(e)=>updateKioskScreen(index,{showWhen:{...(screen.showWhen||{}),value:e.target.value}})} placeholder="Value" disabled={!screen.showWhen?.path || ["truthy","falsy"].includes(screen.showWhen?.operator)}/>
                    <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" onClick={()=>updateKioskScreen(index,{showWhen:null})}>Clear condition</button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(screen.nextRules || []).map((rule,ruleIndex)=>(
                      <div key={`${screen.key}-branch-${ruleIndex}`} className="grid gap-2 md:grid-cols-[1fr_150px_1fr_1fr_auto]">
                        <input className={inputClass} value={rule.when?.path || ""} placeholder="Branch path" onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),path:e.target.value}};updateKioskScreen(index,{nextRules})}}/>
                        <select className={inputClass} value={rule.when?.operator || "equals"} onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),operator:e.target.value}};updateKioskScreen(index,{nextRules})}}>
                          <option value="equals">equals</option><option value="not_equals">not equals</option><option value="in">in</option><option value="truthy">truthy</option><option value="falsy">falsy</option>
                        </select>
                        <input className={inputClass} value={rule.when?.value ?? ""} placeholder="Value" onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),value:e.target.value}};updateKioskScreen(index,{nextRules})}}/>
                        <select className={inputClass} value={rule.next || ""} onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,next:e.target.value};updateKioskScreen(index,{nextRules})}}>
                          <option value="">Next screen…</option>{(kioskUi.screens||[]).filter((candidate)=>candidate.key!==screen.key).map((candidate)=><option key={candidate.key} value={candidate.key}>{candidate.title||candidate.key}</option>)}
                        </select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{nextRules:(screen.nextRules||[]).filter((_,i)=>i!==ruleIndex)})}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700" onClick={()=>updateKioskScreen(index,{nextRules:[...(screen.nextRules||[]),{when:{path:"",operator:"equals",value:""},next:""}]})}>+ Conditional branch</button>
                  </div>
                </div>

                {screen.type === "CATALOGUE" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.search !== false} onChange={(e)=>updateKioskScreen(index,{search:e.target.checked})}/> Search</label>
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.categories !== false} onChange={(e)=>updateKioskScreen(index,{categories:e.target.checked})}/> Categories</label>
                    <select className={inputClass} style={{maxWidth:220}} value={screen.productAction || "OPEN_DETAIL"} onChange={(e)=>updateKioskScreen(index,{productAction:e.target.value})}>
                      <option value="OPEN_DETAIL">Open product detail</option>
                      <option value="ADD">Add directly</option>
                    </select>
                  </div>
                ) : null}

                {screen.type === "PRODUCT_DETAIL" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["description","Description"],["variants","Variants"],["modifiers","Modifiers"],["specifications","Specifications"],
                      ["stockPromise","Stock"],["compare","Compare"],["nutrition","Nutrition"],["allergens","Allergens"],["warranty","Warranty"],
                    ].map(([key,label]) => <label key={key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"><input type="checkbox" checked={screen[key] === true} onChange={(e)=>updateKioskScreen(index,{[key]:e.target.checked})}/>{label}</label>)}
                  </div>
                ) : null}

                {screen.type === "RECOMMENDATIONS" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-700">Relationship source
                      <select className={inputClass} value={screen.source || "CROSS_SELL"} onChange={(e)=>updateKioskScreen(index,{source:e.target.value})}>
                        <option value="CROSS_SELL">Cross-sell</option><option value="UPSELL">Upsell</option><option value="ACCESSORY">Accessory</option>
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={screen.optional !== false} onChange={(e)=>updateKioskScreen(index,{optional:e.target.checked})}/> Customer may skip this screen</label>
                  </div>
                ) : null}

                {screen.type === "FULFILMENT" ? (
                  <div className="mt-3 space-y-2">
                    {(screen.options || []).map((option, optionIndex) => (
                      <div key={`${screen.key}-option-${optionIndex}`} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <input className={inputClass} value={option.key || ""} placeholder="Key" onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,key:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")}; updateKioskScreen(index,{options});
                        }}/>
                        <input className={inputClass} value={typeof option.label==="string"?option.label:""} placeholder="Customer label" onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,label:e.target.value}; updateKioskScreen(index,{options});
                        }}/>
                        <select className={inputClass} value={option.canonicalType || "SELF_PICKUP"} onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,canonicalType:e.target.value}; updateKioskScreen(index,{options});
                        }}><option value="SELF_PICKUP">Pickup / collection</option><option value="DELIVERY">Delivery</option></select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{options:(screen.options||[]).filter((_,i)=>i!==optionIndex)})}>Remove</button>
                        <div className="md:col-span-4 flex gap-3 px-1 text-xs">
                          {["STORE","ADDRESS","CONTACT"].map((requirement)=><label key={requirement} className="inline-flex items-center gap-1"><input type="checkbox" checked={(option.requires||[]).includes(requirement)} onChange={(e)=>{
                            const requirements=new Set(option.requires||[]); if(e.target.checked) requirements.add(requirement); else requirements.delete(requirement);
                            const options=[...(screen.options||[])]; options[optionIndex]={...option,requires:[...requirements]}; updateKioskScreen(index,{options});
                          }}/>{requirement.toLowerCase()}</label>)}
                        </div>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-medium" onClick={()=>updateKioskScreen(index,{options:[...(screen.options||[]),{key:`OPTION_${(screen.options||[]).length+1}`,label:"New option",canonicalType:"SELF_PICKUP",requires:[]}]})}>+ Fulfilment option</button>
                  </div>
                ) : null}

                {screen.type === "FORM" ? (
                  <div className="mt-3 space-y-2">
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.optional !== false} onChange={(e)=>updateKioskScreen(index,{optional:e.target.checked})}/> Customer may skip this form</label>
                    {(screen.fields || []).map((field,fieldIndex)=>(
                      <div key={`${screen.key}-field-${fieldIndex}`} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-[1fr_1fr_140px_auto]">
                        <input className={inputClass} value={field.key || ""} placeholder="Field key" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,key:e.target.value.replace(/[^a-zA-Z0-9_]/g,"")};updateKioskScreen(index,{fields})}}/>
                        <input className={inputClass} value={typeof field.label==="string"?field.label:""} placeholder="Customer label" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,label:e.target.value};updateKioskScreen(index,{fields})}}/>
                        <select className={inputClass} value={field.type || "text"} onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,type:e.target.value};updateKioskScreen(index,{fields})}}>
                          {["text","textarea","select","checkbox","email","tel","number","date","time"].map((type)=><option key={type} value={type}>{type}</option>)}
                        </select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{fields:(screen.fields||[]).filter((_,i)=>i!==fieldIndex)})}>Remove</button>
                        <input className={inputClass} value={typeof field.placeholder==="string"?field.placeholder:""} placeholder="Placeholder" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,placeholder:e.target.value};updateKioskScreen(index,{fields})}}/>
                        {field.type==="select" ? <input className={inputClass} value={Array.isArray(field.options)?field.options.map((option)=>typeof option==="string"?option:option.label||option.value).join(", "):""} placeholder="Options, comma separated" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,options:e.target.value.split(",").map(value=>value.trim()).filter(Boolean)};updateKioskScreen(index,{fields})}}/> : <span />}
                        <label className="inline-flex items-center gap-2 px-1 text-xs"><input type="checkbox" checked={field.required===true} onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,required:e.target.checked};updateKioskScreen(index,{fields})}}/> Required</label>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-medium" onClick={()=>updateKioskScreen(index,{fields:[...(screen.fields||[]),{key:`field_${(screen.fields||[]).length+1}`,label:"New field",type:"text",required:false}]})}>+ Form field</button>
                  </div>
                ) : null}

                {screen.type === "PAYMENT" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-700">Button label<input className={inputClass} value={screen.actionLabel || ""} onChange={(e)=>updateKioskScreen(index,{actionLabel:e.target.value})}/></label>
                    <div className="self-end pb-2 text-xs text-slate-500">OneKiosk currently executes card payment through the device's assigned One Connect instance.</div>
                  </div>
                ) : null}

                {screen.type === "CONFIRMATION" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-medium text-slate-700">Collection label<input className={inputClass} value={screen.collectionLabel || ""} onChange={(e)=>updateKioskScreen(index,{collectionLabel:e.target.value})}/></label>
                    <label className="text-xs font-medium text-slate-700">Auto reset seconds<input type="number" min="5" className={inputClass} value={screen.resetAfterSeconds || 30} onChange={(e)=>updateKioskScreen(index,{resetAfterSeconds:Math.max(5,Number(e.target.value)||30)})}/></label>
                    <div className="flex items-end gap-3 pb-2 text-xs">
                      {["PRINT","QR","EMAIL"].map((method)=><label key={method} className="inline-flex items-center gap-1"><input type="checkbox" checked={(screen.receipt||[]).includes(method)} onChange={(e)=>{
                        const methods=new Set(screen.receipt||[]); if(e.target.checked) methods.add(method); else methods.delete(method); updateKioskScreen(index,{receipt:[...methods]});
                      }}/>{method}</label>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div id="workflow-canvas-section">
          <WorkflowCanvas workflow={workflow} workflowId={workflowId} setWorkflow={setWorkflow} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={deleteStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={savedWorkflows} messageTemplates={messageTemplates} scopeKey={scopeKey} onGuideStepChange={setGuideStep} debugTrace={debugTrace} objectFieldCatalog={objectFieldCatalog} triggerOptions={triggerOptions} flowIssues={flowValidationIssues} onOpenFlowProperties={openFlowProperties} />
        </div>
      )}
      <div id="workflow-review-section" className="workflow-review-compact" aria-live="polite">
        {reviewIssue || "Trigger, conditions and actions are valid."}
      </div>
    </div>
  );
}
