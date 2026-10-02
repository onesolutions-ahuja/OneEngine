import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import PlatformFieldPicker from "./PlatformFieldPicker.jsx";
import MetadataResourcePicker from "./MetadataResourcePicker.jsx";

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
    grid-template-columns: auto minmax(210px, .8fr) minmax(0, 1.2fr);
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
    margin-top: 2px;
    color: #706e6b;
    font-size: 9px;
    font-weight: 600;
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
  }
  .workflow-canvas-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    margin: -5px -7px 14px;
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
    width: min(860px, calc(100vw - 590px));
    max-width: calc(100vw - 80px);
    margin: 10px 50% 0;
    transform: translateX(-50%);
    gap: 12px;
    overflow-x: auto;
    padding: 18px 8px 4px;
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
  .workflow-branch-label { display: block; overflow: hidden; margin-bottom: 8px; color: #3e3e3c; font-size: 9px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
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
  .workflow-branch-node-card small { display: block; color: #706e6b; font-size: 7px; font-weight: 700; text-transform: uppercase; }
  .workflow-branch-node-card strong { display: block; overflow: hidden; margin-top: 1px; color: #181818; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .workflow-node-menu.branch-menu { top: 4px; right: 3px; }
  .workflow-node-menu.branch-menu > summary { width: 22px; height: 22px; font-size: 15px; }
  .workflow-branch-add { width: 24px; height: 24px; border: 1px solid #8fa6bf; border-radius: 999px; background: #fff; color: #0176d3; font-size: 16px; line-height: 20px; cursor: pointer; }
  .workflow-branch-add:hover { border-color: #0176d3; background: #f3f9ff; }
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
  .workflow-action-picker { overflow: hidden; border: 1px solid #d8dde6; border-radius: 6px; background: #fff; }
  .workflow-action-picker-search { position: relative; padding: 8px; border-bottom: 1px solid #eef1f6; }
  .workflow-action-picker-search span { position: absolute; left: 17px; top: 17px; color: #706e6b; font-size: 11px; }
  .workflow-action-picker-search input { width: 100%; min-height: 34px; box-sizing: border-box; border: 1px solid #c9c7c5; border-radius: 4px; padding: 6px 8px 6px 26px; font-size: 11px; }
  .workflow-action-picker-scroll { max-height: 290px; overflow: auto; padding: 5px 7px 8px; }
  .workflow-action-choice { display: flex; width: 100%; align-items: center; gap: 8px; border: 0; border-radius: 4px; background: #fff; padding: 7px; text-align: left; cursor: pointer; }
  .workflow-action-choice:hover { background: #f3f9ff; }
  .workflow-action-choice strong { display: block; color: #181818; font-size: 10px; }
  .workflow-action-choice small { display: block; margin-top: 2px; color: #706e6b; font-size: 8px; line-height: 1.25; }

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
    font-size: 10px !important;
    font-weight: 650 !important;
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
    font-size: 11px;
  }
  .workflow-properties-panel button {
    font-size: 10px;
  }
  .workflow-properties-panel .text-sm {
    font-size: 11px !important;
  }
  .workflow-properties-panel .text-xs {
    font-size: 9px !important;
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
      grid-template-columns: 210px minmax(360px, 1fr) 300px;
    }
    .workflow-visual-shell.palette-collapsed { grid-template-columns: minmax(360px, 1fr) 300px; }
    .workflow-visual-shell.properties-collapsed { grid-template-columns: 210px minmax(360px, 1fr); }
    .workflow-builder-header {
      grid-template-columns: auto minmax(190px, .8fr) minmax(0, 1.2fr);
    }
  }
  @media (max-width: 1050px) {
    .workflow-builder-header {
      grid-template-columns: 1fr 1fr;
    }
    .workflow-builder-heading {
      grid-column: 1 / -1;
    }
    .workflow-visual-shell {
      grid-template-columns: 200px minmax(0, 1fr);
    }
    .workflow-properties-panel {
      grid-column: 1 / -1;
      max-height: none;
    }
  }
  @media (max-width: 760px) {
    .workflow-builder-header,
    .workflow-visual-shell {
      grid-template-columns: 1fr;
    }
    .workflow-builder-actions {
      justify-content: stretch;
    }
    .workflow-save-button { flex: 1; }
    .workflow-node-palette,
    .workflow-properties-panel {
      max-height: 360px;
    }
    .workflow-canvas-surface {
      min-height: 560px;
    }
  }
`;

const actionOptions = [
  { value: "CONSTANT", label: "Constant" },
  { value: "FORMULA", label: "Formula" },
  { value: "ASSIGNMENT", label: "Assignment" },
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
  { value: "SEND_EMAIL", label: "Send Email" },
  { value: "SEND_SMS", label: "Send SMS" },
  { value: "SEND_WHATSAPP", label: "Send WhatsApp" },
  { value: "SEND_APPOINTMENT_CONFIRMATION", label: "Appointments - Send Booking Confirmation" },
  { value: "CALL_FUNCTION", label: "Call Function" },
  { value: "RUN_SUBFLOW", label: "Subflow" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "CONDITION", label: "Decision" },
  { value: "WAIT", label: "Pause" },
  { value: "STOP", label: "End" },
];

const SALESFORCE_CORE_ELEMENT_TYPES = new Set([
  "ASSIGNMENT","LOOP","GET_RECORDS","CREATE_RECORD","UPDATE_RECORD","DELETE_RECORD",
  "CONDITION","WAIT","RUN_SUBFLOW",
]);

const FLOW_ELEMENT_VISUALS = {
  ASSIGNMENT: { icon: "=", color: "#fe9339", family: "Logic" },
  LOOP: { icon: "↻", color: "#fe9339", family: "Logic" },
  CONDITION: { icon: "◇", color: "#fe9339", family: "Logic" },
  WAIT: { icon: "◷", color: "#fe9339", family: "Logic" },
  STOP: { icon: "■", color: "#706e6b", family: "Logic" },
  GET_RECORDS: { icon: "⌕", color: "#e83e8c", family: "Data" },
  CREATE_RECORD: { icon: "+", color: "#e83e8c", family: "Data" },
  UPDATE_RECORD: { icon: "✎", color: "#e83e8c", family: "Data" },
  DELETE_RECORD: { icon: "−", color: "#e83e8c", family: "Data" },
  RUN_SUBFLOW: { icon: "⇢", color: "#0b5cab", family: "Interaction" },
  __ACTION__: { icon: "⚡", color: "#0b5cab", family: "Interaction" },
};

function flowElementVisual(type = "") {
  return FLOW_ELEMENT_VISUALS[String(type || "").toUpperCase()] || { icon: "⚡", color: "#0b5cab", family: "Action" };
}

function flowElementSupportsFaultPath(type = "") {
  return !["CONDITION","LOOP","WAIT","ASSIGNMENT","STOP","CONSTANT","FORMULA","SCHEDULE_PATH"].includes(String(type || "").toUpperCase());
}

function flowApiName(label = "") {
  const cleaned = String(label || "").trim().replace(/[^A-Za-z0-9_ ]+/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  const prefixed = /^[A-Za-z]/.test(cleaned) ? cleaned : cleaned ? `Flow_${cleaned}` : "Element";
  return prefixed.slice(0, 80);
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
      collection: "",
      itemVariable: "currentItem",
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
      recipient: "customer.email",
      providerStatus: "not-configured",
      functionKey: "",
      inputs: { value: "hello" },
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
  if (["CONSTANT","FORMULA"].includes(key)) return "Resources";
  if (["CONDITION","WAIT","STOP","ASSIGNMENT","LOOP","SCHEDULE_PATH"].includes(key)) return "Logic";
  if (key === "RUN_SUBFLOW") return "Interaction";
  if (["GET_RECORDS","BULK_UPDATE_RECORDS","CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(key)) return "Data";
  if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION","SEND_APPOINTMENT_CONFIRMATION","CALL_FUNCTION","WEBHOOK","HTTP_REQUEST"].includes(key) || key.startsWith("CONNECTOR_") || key.startsWith("PAYMENT_") || key.startsWith("PRINT_") || key.includes("SCANNER") || key.includes("CASH_DRAWER") || key.startsWith("QUICKBOOKS_") || key.startsWith("SHOPIFY_") || key.startsWith("UBER_") || key.includes("APPOINTMENT")) return "Actions";
  return "Actions";
}

/* Trigger values arrive as machine keys ("after_update"); the canvas Start
   pill and the workflow list present them in words. */
const TRIGGER_LABELS = {
  after_create: "When a record is created",
  after_update: "When a record is updated",
  after_save: "When a record is created or updated",
  manual: "Manual trigger",
  system_function: "System function",
  system_action: "System action",
  system_job: "System job trigger",
};
const getTriggerLabel = (value) => TRIGGER_LABELS[value] || value || "Manual trigger";

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
    if (!config.formulaInputs || !Object.keys(config.formulaInputs).length) return "Add at least one formula input.";
    if (Object.keys(config.formulaInputs).some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(name)))) return "Formula input names can only use letters, numbers and underscores.";
  }
  if (step.type === "LOOP") {
    if (!config.collection) return "Choose the collection to loop through.";
    if (!config.itemVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.itemVariable))) return "Enter a valid Current Item variable name.";
    if (!Array.isArray(config.bodyBranch) || !config.bodyBranch.length) return "Choose at least one step for the Loop body.";
  }
  if (step.type === "BULK_UPDATE_RECORDS") {
    if (!config.object) return "Choose the target object.";
    if (!config.recordIds) return "Choose the record collection.";
    if (!config.fieldMappings || !Object.keys(config.fieldMappings).length) return "Map at least one field to update.";
  }
  if (step.type === "__ACTION__") return "Choose an action.";
  if (!["CONSTANT","FORMULA"].includes(step.type) && config.resourceOnly !== true) {
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
  if ((RECORD_ACTION_TYPES.has(step.type) || step.type === "GET_RECORDS") && !config.object) return "Choose the target object.";
  if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP"].includes(step.type)) {
    if (!config.templateId && !config.template) return "Choose a message template.";
    if (!config.recipient) return "Choose a recipient.";
  }
  if (step.type === "IN_APP_NOTIFICATION" && (!config.title || !config.message || !config.recipient)) {
    return "Add title, message and recipient.";
  }
  if (step.type === "CALL_FUNCTION" && !config.functionKey) return "Choose a registered function.";
  if (step.type === "RUN_SUBFLOW" && !config.workflowId) return "Choose a subflow.";
  if (["WEBHOOK","CALL_WEBHOOK","HTTP_REQUEST"].includes(step.type) && !config.url && !config.endpoint) return "Enter the request URL.";
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
        <select className={inputClass} value={config.type || "all"} onChange={(event) => update({ type: event.target.value })}>
          <option value="all">IF ALL</option>
          <option value="any">IF ANY</option>
        </select>
      </div>
      {(config.rules || []).map((rule, index) => (
        <div className="grid gap-2 md:grid-cols-[1.2fr_0.9fr_1fr_auto]" key={rule.id || index}>
          <PlatformFieldPicker selectedObjectKey={objectKey} value={rule.field || ""} label="Field" onChange={(field) => {
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
      <button type="button" className="text-sm text-blue-700" onClick={() => update({ rules: [...(config.rules || []), blankCondition()] })}>+ Add condition</button>
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
      resources.push({ value: `${prefix}.value`, label: `${label} → Value`, type: step.config.resourceType || "step output" });
    } else if (step.type === "FORMULA" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Formula · ${step.config.resultType || "number"}`,
          type: step.config.resultType || "formula",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Result`, type: step.config.resultType || "step output" });
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
        type: "step output",
      });
    } else if (step.type === "LOOP" && step.config?.itemVariable) {
      resources.push(
        {
          value: `variables.${step.config.itemVariable}`,
          label: `${step.config.itemVariable} · Current Loop Item`,
          type: "record",
        },
        {
          value: `variables.${step.config.itemVariable}.id`,
          label: `${step.config.itemVariable} → Record ID`,
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
      resources.push({ value: `${prefix}.created.id`, label: `${label} → Created Record ID`, type: "step output" });
    } else if (step.type === "UPDATE_RECORD") {
      resources.push({ value: `${prefix}.updated.id`, label: `${label} → Updated Record ID`, type: "step output" });
    } else if (step.type === "RUN_SUBFLOW") {
      resources.push({ value: `${prefix}.runId`, label: `${label} → Child Run ID`, type: "step output" });
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

function BranchStepPicker({ label, value = [], onChange, steps = [], currentIndex, candidateFilter = null }) {
  const candidates = steps
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => index > currentIndex && (!candidateFilter || candidateFilter(candidate, index)));
  const selected = new Set(value || []);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-700">{label}</div>
      {!candidates.length ? <p className="text-xs text-slate-500">Add a later action, then assign it to this path.</p> : null}
      <div className="space-y-1">
        {candidates.map(({ candidate, index }) => (
          <label key={candidate.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-white">
            <input
              type="checkbox"
              checked={selected.has(candidate.id)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id);
                onChange([...next]);
              }}
            />
            <span>{index + 1}. {candidate.label || getActionLabel(candidate.type)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StepEditor({ step, index, allSteps = [], updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], rootObjectKey, scopeKey = null, debugInfo = null, objectFieldCatalog = {}, onDone, onCancel }) {
  const updateConfig = (patch) => updateStep(index, { config: { ...(step.config || {}), ...patch } });
  const isVariableResource = step.type === "ASSIGNMENT" && step.config?.resourceOnly === true;
  const isResource = ["CONSTANT","FORMULA"].includes(step.type) || isVariableResource;
  const [actionSearch, setActionSearch] = useState("");
  const actionPickerOptions = registryOptions.filter((option) => !SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["CONSTANT","FORMULA","SCHEDULE_PATH","WHEN","STOP"].includes(option.value));
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
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Constant name</label>
              <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. vatRate" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
              <select className={inputClass} value={step.config?.resourceType || "text"} onChange={(event) => updateConfig({ resourceType: event.target.value, value: "" })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="datetime">Date / Time</option>
              </select>
            </div>
            <ResourceOrLiteralInput label="Fixed value" value={step.config?.value ?? ""} onChange={(value) => updateConfig({ value })} rootObjectKey={rootObjectKey} extraResources={[]} type={step.config?.resourceType || "text"} required allowResource={false} />
            <p className="text-[11px] text-slate-500">Constants are fixed for this workflow run and are exposed to later steps as Resources.</p>
          </div>
        );
      case "FORMULA":
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula name</label>
                <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. totalWithTax" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Result type</label>
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
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Named inputs</label>
              <MappingEditor value={step.config?.formulaInputs || {}} onChange={(formulaInputs) => updateConfig({ formulaInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Formula name" valueLabel="Map from resource" />
              <p className="mt-1 text-[11px] text-slate-500">Use simple names such as amount, tax or customerCount. Those names are what you use in the formula below.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula</label>
              <textarea className={inputClass} rows={4} value={step.config?.expression || ""} onChange={(event) => updateConfig({ expression: event.target.value })} placeholder="amount + tax" />
              <p className="mt-1 text-[11px] text-slate-500">Supported: + - * / %, comparisons, && / ||, IF, COALESCE, CONCAT, ROUND, ABS, MIN and MAX. JavaScript is never executed.</p>
            </div>
          </div>
        );
      case "LOOP":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker
              objectKey={rootObjectKey}
              extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").startsWith("variables."))}
              label="Collection"
              value={step.config?.collection || ""}
              onChange={(collection) => updateConfig({ collection })}
            />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Current Item variable</label>
              <input className={inputClass} value={step.config?.itemVariable || "currentItem"} onChange={(event) => updateConfig({ itemVariable: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
              <p className="mt-1 text-[11px] text-slate-500">Steps inside the Loop can use this Resource to access the item being processed.</p>
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
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, fieldMappings: {} })} />
            </div>
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record collection" value={step.config?.recordIds || ""} onChange={(recordIds) => updateConfig({ recordIds })} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field updates</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
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
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, filters: [], sortField: "" })} />
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
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={filter.field || ""} label="Field" onChange={(field) => updateFilter(filterIndex, { field })} />
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
                <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={step.config?.sortField || ""} label="Optional sort field" onChange={(sortField) => updateConfig({ sortField })} />
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
      case "UPDATE_RELATED_RECORD":
      case "CREATE_RELATED_RECORD":
      case "DELETE_RECORD":
      case "ASSIGN_RECORD":
      case "ADD_RELATIONSHIP":
      case "REMOVE_RELATIONSHIP": {
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
                <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Record source</label>
                <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record / related record" value={step.config?.recordId || ""} onChange={(recordId) => updateConfig({ recordId })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
                      const next = { ...(step.config?.fieldMappings || {}) };
                      const currentValue = next[key];
                      delete next[key];
                      next[field] = currentValue;
                      updateConfig({ fieldMappings: next });
                    }} />
                    <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Source value" value={value} onChange={(source) => updateFieldMapping(key, source)} />
                  </div>
                ))}
                <button type="button" className="text-sm text-blue-700" onClick={() => updateConfig({ fieldMappings: { ...(step.config?.fieldMappings || {}), [`field_${Object.keys(step.config?.fieldMappings || {}).length + 1}`]: "" } })}>+ Add mapping</button>
              </div>
            </div>
          </div>
        );
      }
      case "SEND_EMAIL":
      case "SEND_SMS":
      case "SEND_WHATSAPP": {
        const available = providerAvailable[step.type === "SEND_EMAIL" ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP"];
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{step.type}</span>
              <ProviderStatusPill available={available} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Template</label>
              <select className={inputClass} value={step.config?.templateId || step.config?.template || ""} onChange={(event) => updateConfig({ templateId: event.target.value, template: "" })}>
                <option value="">Select message template</option>
                {messageTemplates
                  .filter((template) => String(template.channel || "").toUpperCase() === (step.type === "SEND_EMAIL" ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP"))
                  .map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient mapping</label>
              <input className={inputClass} value={step.config?.recipient || ""} onChange={(event) => updateConfig({ recipient: event.target.value })} placeholder="customer.email / order.contact / team" />
              <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value="" label="Insert recipient field" onInsert={(token) => updateConfig({ recipient: token })} />
            </div>
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
              <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value="" label="Insert message field" onInsert={(token) => updateConfig({ message: `${step.config?.message || ""}${token}` })} />
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
        const setOutcomes = (nextOutcomes) => updateConfig({ outcomes: nextOutcomes, defaultBranch, defaultLabel, condition: null, ifBranch: [], elseBranch: [] });
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Outcomes are evaluated in the order shown. The first matching outcome runs. If none match, the Default Outcome runs.
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outcome Order</div>
            {outcomes.map((outcome, outcomeIndex) => (
              <div key={outcome.id || outcomeIndex} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 md:grid-cols-2">
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
                  <div className="flex gap-1 pt-4">
                    <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-slate-600" disabled={outcomeIndex === 0} title="Move outcome up" onClick={() => {
                      if (outcomeIndex === 0) return;
                      const next = [...outcomes];
                      [next[outcomeIndex - 1], next[outcomeIndex]] = [next[outcomeIndex], next[outcomeIndex - 1]];
                      setOutcomes(next);
                    }}>↑</button>
                    <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-slate-600" disabled={outcomeIndex === outcomes.length - 1} title="Move outcome down" onClick={() => {
                      if (outcomeIndex >= outcomes.length - 1) return;
                      const next = [...outcomes];
                      [next[outcomeIndex], next[outcomeIndex + 1]] = [next[outcomeIndex + 1], next[outcomeIndex]];
                      setOutcomes(next);
                    }}>↓</button>
                    <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-red-600" disabled={outcomes.length <= 1} onClick={() => {
                      if (outcomes.length <= 1) return;
                      setOutcomes(outcomes.filter((_, itemIndex) => itemIndex !== outcomeIndex));
                    }}>Remove</button>
                  </div>
                </div>
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
            ))}
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
              <p className="mt-2 text-[11px] text-slate-500">This path runs only when no configured outcome matches. Add its elements from the canvas.</p>
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
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Duration (seconds)</label>
              <input className={inputClass} type="number" min="0" value={step.config?.durationSeconds || 0} onChange={(event) => updateConfig({ durationSeconds: Number(event.target.value || 0) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Resume at</label>
              <input className={inputClass} type="datetime-local" value={step.config?.resumeAt || ""} onChange={(event) => updateConfig({ resumeAt: event.target.value })} />
            </div>
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
              <input className={inputClass} value={step.config?.url || ""} onChange={(event) => updateConfig({ url: event.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Method</label>
              <select className={inputClass} value={step.config?.method || "POST"} onChange={(event) => updateConfig({ method: event.target.value })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
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
              updateStep(index, { label: nextLabel, config: { ...(step.config || {}), apiName: nextApiName } });
            }} placeholder="Element label" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">API Name</label>
            <input className={inputClass} value={step.config?.apiName || ""} onChange={(event) => updateConfig({ apiName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="Element_API_Name" />
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
          <div className="mt-1 font-semibold">{debugInfo.error.title || "This step could not complete"}</div>
          <div className="mt-2 text-xs leading-5">{debugInfo.error.whatHappened || "The step failed during Debug."}</div>
          <div className="mt-3 rounded-lg border border-red-100 bg-white/80 p-3 text-xs leading-5"><strong>How to fix it:</strong> {debugInfo.error.howToFix || "Check this step's required values and Resources, then run Debug again."}</div>
        </div>
      ) : debugInfo?.status === "COMPLETED" ? (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${debugInfo.simulated ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {debugInfo.simulated ? "This step was simulated in Debug mode. No external or irreversible action was performed." : "This step completed successfully in the last Debug run."}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="space-y-3 pt-1">
          {renderConfig()}
          {!isResource ? <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">On Error</summary>
              <div className="mt-3 space-y-3">
                <label className="block space-y-1 text-xs text-slate-600">
                  <span>When this step fails</span>
                  <select className={inputClass} value={step.config?.faultMode || "FAIL"} onChange={(event) => updateConfig({ faultMode: event.target.value })}>
                    <option value="FAIL">Fail the flow</option>
                    <option value="CONTINUE">Continue to the next step</option>
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
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className="workflow-cancel-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="workflow-save-button" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}


function WorkflowCanvas({ workflow, workflowId, setWorkflow, updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], scopeKey = null, onGuideStepChange, debugTrace = null, objectFieldCatalog = {}, triggerOptions = [] }) {
  const [selectedId, setSelectedId] = useState("__start__");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteTab, setPaletteTab] = useState("elements");
  const [insertAt, setInsertAt] = useState(null);
  const [branchTarget, setBranchTarget] = useState(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [resourceMenuOpen, setResourceMenuOpen] = useState(false);
  const [inspectorSnapshot, setInspectorSnapshot] = useState(null);
  const [inspectorNewId, setInspectorNewId] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [collapsedBranches, setCollapsedBranches] = useState({});
  const [managerDetailId, setManagerDetailId] = useState(null);
  const [startSnapshot, setStartSnapshot] = useState(null);
  const selectedIndex = workflow.steps.findIndex((step) => step.id === selectedId);
  const selectedStep = selectedIndex >= 0 ? workflow.steps[selectedIndex] : null;

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
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(`oneengine:flow-builder:collapsed:${workflowId || "new"}`);
      setCollapsedBranches(stored ? JSON.parse(stored) : {});
    } catch {
      setCollapsedBranches({});
    }
  }, [workflowId]);

  const toggleBranchCollapse = (stepId, collapsed) => {
    setCollapsedBranches((current) => {
      const next = { ...current, [stepId]: collapsed };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(`oneengine:flow-builder:collapsed:${workflowId || "new"}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const inspectStart = () => {
    setStartSnapshot(JSON.parse(JSON.stringify(workflow)));
    setInspectorSnapshot(null);
    setInspectorNewId(null);
    setSelectedId("__start__");
    setPropertiesOpen(true);
  };
  const inspectStep = (stepId) => {
    const current = workflow.steps.find((step) => step.id === stepId);
    setStartSnapshot(null);
    setInspectorSnapshot(current ? JSON.parse(JSON.stringify(current)) : null);
    setInspectorNewId(null);
    setSelectedId(stepId);
    setPropertiesOpen(true);
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
  const insertPreparedStep = (step, index = workflow.steps.length) => {
    setWorkflow((current) => {
      if (!branchTarget) {
        return { ...current, steps: [...current.steps.slice(0, index), step, ...current.steps.slice(index)] };
      }
      if (branchTarget.kind && branchTarget.ownerId) {
        const ownerIndex = current.steps.findIndex((candidate) => String(candidate.id) === String(branchTarget.ownerId));
        if (ownerIndex < 0) return { ...current, steps: [...current.steps, step] };
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
        const nextBranch = [...targetIds.slice(0, branchPosition), step.id, ...targetIds.slice(branchPosition)];
        const nextSteps = [...current.steps];
        nextSteps[ownerIndex] = {
          ...owner,
          config: {
            ...(owner.config || {}),
            [key]: nextBranch,
            ...(branchTarget.kind === "fault" ? { faultMode: ["ROUTE","RETRY"].includes(String(owner.config?.faultMode || "").toUpperCase()) ? owner.config.faultMode : "ROUTE" } : {}),
          },
        };
        nextSteps.splice(branchInsertAt, 0, step);
        return { ...current, steps: nextSteps };
      }
      const decisionIndex = current.steps.findIndex((candidate) => candidate.id === branchTarget.decisionId);
      if (decisionIndex < 0) return { ...current, steps: [...current.steps, step] };
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
      const nextBranchIds = [...targetIds.slice(0, branchPosition), step.id, ...targetIds.slice(branchPosition)];
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
      nextSteps.splice(branchInsertAt, 0, step);
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
    const step = makeStep(type);
    const definition = registryOptions.find((option) => option.value === type);
    if (definition?.label) {
      step.label = definition.label;
      step.config.apiName = flowApiName(definition.label);
    }
    insertPreparedStep(step, index);
  };
  const copyStep = (step) => setClipboard({ mode: "copy", step: JSON.parse(JSON.stringify(step)) });
  const cutStep = (step) => {
    setClipboard({ mode: "cut", step: JSON.parse(JSON.stringify(step)) });
    removeStepById(step.id);
    if (selectedId === step.id) {
      setSelectedId("__start__");
      setPropertiesOpen(false);
    }
  };
  const pasteClipboard = (index = workflow.steps.length) => {
    if (!clipboard?.step) return;
    const step = prepareCopiedStep(clipboard.step, clipboard.mode === "cut");
    insertPreparedStep(step, index);
    if (clipboard.mode === "cut") setClipboard(null);
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
  const dropAt = (event, index) => {
    event.preventDefault();
    const paletteType = event.dataTransfer.getData("application/x-onepos-flow-element");
    if (paletteType) return addFromPalette(paletteType, index);
    const sourceId = event.dataTransfer.getData("application/x-onepos-flow-node");
    const from = workflow.steps.findIndex((step) => step.id === sourceId);
    if (from < 0 || from === index) return;
    setWorkflow((current) => {
      const next = [...current.steps];
      const [moved] = next.splice(from, 1);
      const target = Math.max(0, index > from ? index - 1 : index);
      next.splice(target, 0, moved);
      return { ...current, steps: next };
    });
  };
  const registeredActionOptions = registryOptions
    .filter((option) => !SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["WHEN","CONSTANT","FORMULA","SCHEDULE_PATH","STOP"].includes(option.value));
  const palette = [
    ...registryOptions
      .filter((option) => SALESFORCE_CORE_ELEMENT_TYPES.has(option.value) && !["CONSTANT","FORMULA","SCHEDULE_PATH"].includes(option.value))
      .map((option) => ({ ...option, category: option.value === "RUN_SUBFLOW" ? "Interaction" : workflowActionCategory(option.value) })),
    ...(registeredActionOptions.length ? [{ value: "__ACTION__", label: "Action", description: "Run a registered OneEngine action", category: "Interaction" }] : []),
  ].filter((option) => !paletteSearch.trim() || `${option.label || option.value} ${option.description || ""} ${option.category || ""}`.toLowerCase().includes(paletteSearch.trim().toLowerCase()));
  const paletteGroups = palette.reduce((groups, option) => {
    const category = option.category || "App Actions";
    if (!groups[category]) groups[category] = [];
    groups[category].push(option);
    return groups;
  }, {});
  const globalResources = [
    { label: "$Record", detail: "The record that triggered the flow", type: "Global Variable" },
    { label: "$Record__Prior", detail: "The record values before the triggering update", type: "Global Variable" },
    { label: "$User", detail: "The user running the flow", type: "Global Variable" },
    { label: "$Flow.CurrentDateTime", detail: "The date and time when this flow runs", type: "Global Variable" },
  ];
  const stepResources = workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog);
  const resourceSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => ["CONSTANT","FORMULA"].includes(step.type) || (step.type === "ASSIGNMENT" && step.config?.resourceOnly === true));
  const managerElementSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => !["CONSTANT","FORMULA","SCHEDULE_PATH"].includes(step.type) && step.config?.resourceOnly !== true);
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
    const insertAt = workflow.steps.findIndex((step) => !["CONSTANT","FORMULA","SCHEDULE_PATH"].includes(step.type));
    const target = insertAt < 0 ? workflow.steps.length : insertAt;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, target), path, ...current.steps.slice(target)] }));
    setSelectedId("__start__");
  };
  const updateScheduledPath = (index, patch) => updateStep(index, { config: { ...(workflow.steps[index]?.config || {}), ...patch } });
  const removeScheduledPath = (index) => deleteStep(index);
  const addResource = (type) => {
    const resource = type === "VARIABLE" ? makeStep("ASSIGNMENT") : makeStep(type);
    if (type === "VARIABLE") {
      resource.label = "Variable";
      resource.config = { ...resource.config, resourceOnly: true, variableName: "", variableType: "text", operator: "set", value: "", availableForInput: false, availableForOutput: false };
    } else {
      resource.label = type === "CONSTANT" ? "Constant" : "Formula";
      resource.config = { ...resource.config, resourceOnly: true };
    }
    const firstActionIndex = workflow.steps.findIndex((step) => !["CONSTANT","FORMULA"].includes(step.type) && step.config?.resourceOnly !== true);
    const insertAt = firstActionIndex < 0 ? workflow.steps.length : firstActionIndex;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, insertAt), resource, ...current.steps.slice(insertAt)] }));
    setSelectedId(resource.id);
    setInspectorSnapshot(null);
    setInspectorNewId(resource.id);
    setPropertiesOpen(true);
    setResourceMenuOpen(false);
  };
  const resourceQuery = paletteSearch.trim().toLowerCase();
  const visibleGlobalResources = globalResources.filter((item) => !resourceQuery || `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(resourceQuery));
  const visibleStepResources = stepResources.filter((item) => !resourceQuery || `${item.label} ${item.type}`.toLowerCase().includes(resourceQuery));

  function openPath(target) {
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

  function renderOwnedPath({ ownerId, kind, ids = [], label, outcomeId = null, tone = "", depth = 0, ancestry = [] }) {
    const children = ids.map((id) => branchStepById.get(String(id))).filter(Boolean);
    return (
      <div key={`${ownerId}-${kind}-${outcomeId || label}`} className={`workflow-branch-path ${tone ? `is-${tone}` : ""}`}>
        <span className="workflow-branch-line" />
        <span className="workflow-branch-label">{label}</span>
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
                  <button type="button" className={`workflow-branch-node-card ${selectedId === child.id ? "is-selected" : ""}`} onClick={() => inspectStep(child.id)}>
                    <span className="workflow-branch-node-icon" style={{ background: childVisual.color }}>{childVisual.icon}</span>
                    <span><small>{SALESFORCE_CORE_ELEMENT_TYPES.has(child.type) ? getActionLabel(child.type) : "Action"}</small><strong>{child.label || getActionLabel(child.type)}</strong></span>
                  </button>
                  {childCanCollapse ? <button type="button" className="workflow-branch-collapse" aria-label={childCollapsed ? "Expand paths" : "Collapse paths"} onClick={() => toggleBranchCollapse(child.id, !childCollapsed)}>{childCollapsed ? "▸" : "▾"}</button> : null}
                  <details className="workflow-node-menu branch-menu">
                    <summary aria-label={`Open actions for ${child.label || getActionLabel(child.type)}`}>⋮</summary>
                    <div className="workflow-node-menu-popover">
                      <button type="button" onClick={() => inspectStep(child.id)}>Edit Element</button>
                      <button type="button" onClick={() => copyStep(child)}>Copy Element</button>
                      <button type="button" onClick={() => cutStep(child)}>Cut Element</button>
                      {flowElementSupportsFaultPath(child.type) ? <button type="button" onClick={() => addFaultPath(child)}>Add Fault Path</button> : null}
                      <button type="button" className="is-danger" onClick={() => removeStep(childIndexInFlow)}>Delete Element</button>
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
    if (owner.type === "CONDITION" && !collapsed) {
      const outcomes = Array.isArray(owner.config?.outcomes) && owner.config.outcomes.length
        ? owner.config.outcomes
        : [{ id: "outcome-1", label: "Outcome 1", branch: owner.config?.ifBranch || [] }];
      const paths = outcomes.map((outcome, i) => ({ id: outcome.id || `outcome-${i + 1}`, label: outcome.label || `Outcome ${i + 1}`, ids: outcome.branch || [] }));
      paths.push({ id: "__default__", label: owner.config?.defaultLabel || "Default Outcome", ids: owner.config?.defaultBranch || owner.config?.elseBranch || [] });
      blocks.push(<div key="decision" className="workflow-branch-map workflow-nested-map">{paths.map((p) => renderOwnedPath({ ownerId: owner.id, kind: "decision", outcomeId: p.id, ids: p.ids, label: p.label, depth, ancestry: next }))}</div>);
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
      {paletteOpen ? <aside className="workflow-node-palette">
        <div className="workflow-palette-head">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "elements" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("elements")}>Elements</button>
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "resources" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("resources")}>Manager</button>
          </div>
        </div>
        <div className="workflow-palette-search">
          <span>⌕</span>
          <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={paletteTab === "elements" ? "Search elements..." : "Search manager..."} aria-label={paletteTab === "elements" ? "Search workflow elements" : "Search workflow manager"} />
        </div>
        {paletteTab === "elements" ? (
          <>
            <p className="workflow-palette-help">{branchTarget ? "Choose an element for this outcome path." : insertAt == null ? "Use a + insertion point on the canvas, then choose an element." : "Choose an element to insert at the selected point."}</p>
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
                      onClick={() => addFromPalette(option.value, insertAt == null ? workflow.steps.length : insertAt)}
                      className="workflow-palette-item"
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
              <button type="button" className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-semibold text-blue-700" onClick={() => setResourceMenuOpen((value) => !value)}>New Resource</button>
              {resourceMenuOpen ? (
                <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("VARIABLE")}><strong>Variable</strong><small>Store a value that can change while the flow runs.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("CONSTANT")}><strong>Constant</strong><small>Store a fixed value for this flow.</small></button>
                  <button type="button" className="workflow-resource-choice" onClick={() => addResource("FORMULA")}><strong>Formula</strong><small>Calculate a value when the resource is used.</small></button>
                </div>
              ) : null}
            </div>
            <div className="workflow-palette-scroll">
              {managerElementSteps.length ? <div className="workflow-palette-group-title">Elements</div> : null}
              {managerElementSteps.map(({ step, index }) => (
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
                      {step.config?.description ? <p>{step.config.description}</p> : null}
                    </div>
                  ) : null}
                </div>
              ))}
              {resourceSteps.length ? <div className="workflow-palette-group-title">Resources</div> : null}
              {resourceSteps.map(({ step }) => {
                const resourceLabel = step.type === "ASSIGNMENT" ? (step.config?.variableName || "New Variable") : (step.config?.resourceName || (step.type === "CONSTANT" ? "New Constant" : "New Formula"));
                const resourceType = step.type === "ASSIGNMENT" ? `Variable · ${step.config?.variableType || "text"}` : step.type === "CONSTANT" ? `Constant · ${step.config?.resourceType || "text"}` : `Formula · ${step.config?.resultType || "number"}`;
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
                      <div><span>Data Type</span><strong>{step.type === "ASSIGNMENT" ? (step.config?.variableType || "text") : step.type === "CONSTANT" ? (step.config?.resourceType || "text") : (step.config?.resultType || "number")}</strong></div>
                      <div><span>Used by</span><strong>{resourceUsageCount(step)} element{resourceUsageCount(step) === 1 ? "" : "s"}</strong></div>
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
      <main className="workflow-canvas-surface">
        <div className="workflow-canvas-toolbar">
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => setCanvasZoom((value) => Math.max(.7, Number((value - .1).toFixed(1))))}>−</button>
          <button type="button" aria-label="Reset zoom" title="Reset zoom" onClick={() => setCanvasZoom(1)}>{Math.round(canvasZoom * 100)}%</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => setCanvasZoom((value) => Math.min(1.3, Number((value + .1).toFixed(1))))}>+</button>
          <button type="button" title="Toggle Toolbox" onClick={() => setPaletteOpen((value) => !value)}>{paletteOpen ? "Hide Toolbox" : "Show Toolbox"}</button>
          <button type="button" title="Toggle Properties" onClick={() => setPropertiesOpen((value) => !value)}>{propertiesOpen ? "Hide Properties" : "Show Properties"}</button>
        </div>
        {(insertAt != null || branchTarget) ? (
          <div className="workflow-add-element-popover" role="dialog" aria-label="Add Element">
            <div className="workflow-add-element-head">
              <div>
                <strong>Add Element</strong>
                <small>{branchTarget ? "Choose an element for this decision path" : "Choose an element to insert here"}</small>
              </div>
              <button type="button" aria-label="Close Add Element" onClick={() => { setInsertAt(null); setBranchTarget(null); }}>×</button>
            </div>
            <div className="workflow-add-element-search">
              <span>⌕</span>
              <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="Search elements..." autoFocus />
            </div>
            <div className="workflow-add-element-groups">
              {clipboard?.step ? (
                <div className="workflow-add-element-group">
                  <div className="workflow-palette-group-title">Clipboard</div>
                  <div className="workflow-add-element-grid">
                    <button type="button" onClick={() => pasteClipboard(insertAt == null ? workflow.steps.length : insertAt)}>
                      <span className="workflow-add-element-icon" style={{ background: flowElementVisual(clipboard.step.type).color }}>⧉</span>
                      <span><strong>Paste 1 Element</strong><small>{clipboard.step.label || getActionLabel(clipboard.step.type)} · {clipboard.mode === "cut" ? "Cut" : "Copied"}</small></span>
                    </button>
                  </div>
                </div>
              ) : null}
              {Object.entries(paletteGroups).map(([category, options]) => (
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
              {!palette.length ? <div className="workflow-palette-empty">No matching elements</div> : null}
            </div>
          </div>
        ) : null}
        <div className="workflow-canvas-lane" style={{ transform: `scale(${canvasZoom})`, transformOrigin: "top center" }}>
          <button type="button" className="workflow-start-node" onClick={inspectStart} title="Configure when this flow starts">
            <span className="workflow-start-icon">▶</span>
            <span className="workflow-start-title">Start</span>
            <span className="workflow-start-note">{getTriggerLabel(workflow.trigger)}{workflow.conditions?.length ? ` · ${workflow.conditions.length} condition${workflow.conditions.length === 1 ? "" : "s"}` : ""}{scheduledPathSteps.length ? ` · ${scheduledPathSteps.length} scheduled path${scheduledPathSteps.length === 1 ? "" : "s"}` : ""}</span>
          </button>
          <div className="workflow-node-connector"><button type="button" className="workflow-insert-button" aria-label="Add element after Start" onClick={() => { setBranchTarget(null); setInsertAt(0); setPaletteTab("elements"); setPaletteOpen(true); }}>+</button></div>
          {visibleCanvasSteps.map(({ step, index }) => {
            const visual = flowElementVisual(step.type);
            const elementKind = SALESFORCE_CORE_ELEMENT_TYPES.has(step.type) ? getActionLabel(step.type) : "Action";
            const decisionOutcomes = step.type === "CONDITION"
              ? (Array.isArray(step.config?.outcomes) && step.config.outcomes.length
                  ? step.config.outcomes
                  : [{ id: "outcome-1", label: "Outcome 1", branch: step.config?.ifBranch || [] }])
              : [];
            const decisionPaths = step.type === "CONDITION"
              ? [...decisionOutcomes, { id: "__default__", label: step.config?.defaultLabel || "Default Outcome", branch: step.config?.defaultBranch || step.config?.elseBranch || [] }]
              : [];
            const branchesCollapsed = collapsedBranches[step.id] === true;
            return <div key={step.id} className={`workflow-node-wrap ${step.type === "CONDITION" ? "has-decision" : ""}`}>
              <div className="workflow-node-row">
                <button type="button" onClick={() => { inspectStep(step.id); onGuideStepChange?.(step.type === "CONDITION" ? "conditions" : "actions"); }} data-node-type={step.type} className={`workflow-node-card ${selectedId === step.id ? "is-selected" : ""} ${step.enabled === false ? "is-disabled" : ""} ${["ROUTE","RETRY"].includes(String(step.config?.faultMode || "FAIL").toUpperCase()) ? "is-fault-source" : ""} ${faultTargetIds.has(String(step.id)) ? "is-fault-target" : ""} ${["FAILED","FAULT_HANDLED"].includes(debugTrace?.[step.id]?.status) ? "is-debug-failed" : debugTrace?.[step.id]?.status === "COMPLETED" ? "is-debug-completed" : ""} ${debugTrace?.[step.id]?.simulated ? "is-debug-simulated" : ""}`}>
                  <span className="workflow-node-icon" style={{ background: visual.color }}>{visual.icon}</span>
                  <span className="workflow-node-kind">{debugTrace?.[step.id]?.status === "FAILED" ? "Debug failed" : debugTrace?.[step.id]?.status === "FAULT_HANDLED" ? "Debug fault handled" : debugTrace?.[step.id]?.simulated ? "Debug simulated" : debugTrace?.[step.id]?.status === "COMPLETED" ? "Debug passed" : elementKind}</span>
                  <span className="workflow-node-title">{step.label || getActionLabel(step.type)}</span>
                  {step.config?.description ? <span className="workflow-node-description" title={step.config.description}>ⓘ</span> : null}
                  {step.type === "LOOP" ? <span className="workflow-node-note">For Each Item</span> : null}
                  {step.config?.faultMode && step.config.faultMode !== "FAIL" ? <span className="workflow-fault-badge">Fault path</span> : null}
                </button>
                {step.type === "CONDITION" ? <button type="button" className="workflow-decision-toggle" title={branchesCollapsed ? "Expand paths" : "Collapse paths"} aria-label={branchesCollapsed ? "Expand decision paths" : "Collapse decision paths"} onClick={() => toggleBranchCollapse(step.id, !branchesCollapsed)}>{branchesCollapsed ? "▸" : "▾"}</button> : null}
                <details className="workflow-node-menu">
                  <summary aria-label={`Open actions for ${step.label || getActionLabel(step.type)}`} title="Element actions">⋮</summary>
                  <div className="workflow-node-menu-popover">
                    <button type="button" onClick={() => inspectStep(step.id)}>Edit Element</button>
                    <button type="button" onClick={() => copyStep(step)}>Copy Element</button>
                    <button type="button" onClick={() => cutStep(step)}>Cut Element</button>
                    {flowElementSupportsFaultPath(step.type) ? <button type="button" onClick={() => addFaultPath(step)}>Add Fault Path</button> : null}
                    <button type="button" className="is-danger" onClick={() => removeStep(index)}>Delete Element</button>
                  </div>
                </details>
              </div>
              {step.type === "CONDITION" && !branchesCollapsed ? (
                <div className="workflow-branch-map" aria-label="Decision paths">
                  {decisionPaths.map((outcome, outcomeIndex) => {
                    const isDefault = outcome.id === "__default__";
                    const branchIds = outcome.branch || [];
                    const branchSteps = branchIds.map((id) => branchStepById.get(String(id))).filter(Boolean);
                    return <div key={outcome.id || outcomeIndex} className="workflow-branch-path">
                      <span className="workflow-branch-line" />
                      <span className="workflow-branch-label">{outcome.label || (isDefault ? "Default Outcome" : `Outcome ${outcomeIndex + 1}`)}</span>
                      <div className="workflow-branch-stack">
                        <button type="button" className="workflow-branch-add" aria-label={`Add first element to ${outcome.label || (isDefault ? "Default Outcome" : `Outcome ${outcomeIndex + 1}`)}`} onClick={() => { setBranchTarget({ decisionId: step.id, outcomeId: isDefault ? "__default__" : outcome.id, position: 0 }); setInsertAt(null); setPaletteTab("elements"); setPaletteOpen(true); }}>+</button>
                        {branchSteps.map((branchStep, branchStepIndex) => {
                          const branchVisual = flowElementVisual(branchStep.type);
                          const branchIndex = workflow.steps.findIndex((candidate) => candidate.id === branchStep.id);
                          return <div key={branchStep.id} className="contents">
                            <div className="workflow-branch-node-row">
                              <button type="button" className={`workflow-branch-node-card ${selectedId === branchStep.id ? "is-selected" : ""}`} onClick={() => inspectStep(branchStep.id)}>
                                <span className="workflow-branch-node-icon" style={{ background: branchVisual.color }}>{branchVisual.icon}</span>
                                <span><small>{SALESFORCE_CORE_ELEMENT_TYPES.has(branchStep.type) ? getActionLabel(branchStep.type) : "Action"}</small><strong>{branchStep.label || getActionLabel(branchStep.type)}</strong></span>
                              </button>
                              <details className="workflow-node-menu branch-menu">
                                <summary aria-label={`Open actions for ${branchStep.label || getActionLabel(branchStep.type)}`}>⋮</summary>
                                <div className="workflow-node-menu-popover">
                                  <button type="button" onClick={() => inspectStep(branchStep.id)}>Edit Element</button>
                                  <button type="button" onClick={() => copyStep(branchStep)}>Copy Element</button>
                                  <button type="button" onClick={() => cutStep(branchStep)}>Cut Element</button>
                                  {flowElementSupportsFaultPath(branchStep.type) ? <button type="button" onClick={() => addFaultPath(branchStep)}>Add Fault Path</button> : null}
                                  <button type="button" className="is-danger" onClick={() => removeStep(branchIndex)}>Delete Element</button>
                                </div>
                              </details>
                            </div>
                            <button type="button" className="workflow-branch-add" aria-label={`Add element after ${branchStep.label || getActionLabel(branchStep.type)}`} onClick={() => { setBranchTarget({ decisionId: step.id, outcomeId: isDefault ? "__default__" : outcome.id, position: branchStepIndex + 1 }); setInsertAt(null); setPaletteTab("elements"); setPaletteOpen(true); }}>+</button>
                          </div>;
                        })}
                      </div>
                    </div>;
                  })}
                </div>
              ) : null}
              <div className="workflow-node-connector"><button type="button" className="workflow-insert-button" aria-label={`Add element after ${step.label || getActionLabel(step.type)}`} onClick={() => { setBranchTarget(null); setInsertAt(index + 1); setPaletteTab("elements"); setPaletteOpen(true); }}>+</button></div>
            </div>;
          })}
          {!visibleCanvasSteps.length ? <button type="button" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-5 text-sm text-blue-700" onClick={() => { setInsertAt(0); setBranchTarget(null); setPaletteTab("elements"); setPaletteOpen(true); }}>+ Add Element</button> : null}
          <div className="workflow-end-node"><span>■</span><strong>End</strong></div>
        </div>
      </main>
      {propertiesOpen ? <aside className="workflow-properties-panel">
        <div className="workflow-properties-tabs">
          <span className="workflow-properties-tab is-active">Properties</span>
        </div>
        {selectedId === "__start__" ? (
          <div className="space-y-4 rounded-xl bg-white p-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">Start</div>
              <p className="mt-1 text-xs text-slate-500">Define when the flow starts. Entry conditions are evaluated before any element runs.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trigger</label>
              <select aria-label="Flow trigger" className={inputClass} value={workflow.trigger || "manual"} onChange={(event) => setWorkflow((current) => ({ ...current, trigger: event.target.value }))}>
                {!triggerOptions.some((option) => option.key === workflow.trigger) && workflow.trigger ? <option value={workflow.trigger}>{getTriggerLabel(workflow.trigger)}</option> : null}
                {triggerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Object</label>
              <PlatformFieldPicker
                scopeKey={scopeKey}
                includeObjectSelector
                objectOnly
                selectedObjectKey={workflow.object || ""}
                onObjectChange={(object) => setWorkflow((current) => ({ ...current, object }))}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                {!scheduledPathSteps.length ? <div className="text-[11px] text-slate-500">No scheduled paths. Immediate workflow steps run normally.</div> : null}
              </div>
            </div>

            <div className="space-y-3">
              {["after_update","after_save","before_update","before_save","field_changed"].includes(workflow.trigger) ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">When conditions become true</label>
                  <select className={inputClass} value={workflow.entryTransition || "EVERY_TIME"} onChange={(event) => setWorkflow((current) => ({ ...current, entryTransition: event.target.value }))}>
                    <option value="EVERY_TIME">Every time the record meets the conditions</option>
                    <option value="UPDATED_TO_MEET">Only when the record is updated to meet the conditions</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">“Only when updated to meet” runs when the full entry criteria changes from false to true. Later edits are ignored while the record remains matched.</p>
                </div>
              ) : null}
              {workflow.object ? (
                <div>
                  <div className="mb-2 text-xs font-semibold text-slate-700">Entry conditions</div>
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
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className="workflow-cancel-button" onClick={cancelInspector}>Cancel</button>
              <button type="button" className="workflow-save-button" onClick={finishInspector}>Done</button>
            </div>
          </div>
        ) : selectedStep ? <StepEditor step={selectedStep} index={selectedIndex} allSteps={workflow.steps} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={removeStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={availableWorkflows.filter((item) => (item.runtimeActive === true || item.active !== false) && String(item.id) !== String(workflowId || ""))} messageTemplates={messageTemplates} rootObjectKey={workflow.object || ""} scopeKey={scopeKey} debugInfo={debugTrace?.[selectedStep.id] || null} objectFieldCatalog={objectFieldCatalog} onDone={finishInspector} onCancel={cancelInspector} /> : <p className="text-sm text-slate-500">Select Start or a flow element to configure it.</p>}
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
      flowType: initialWorkflow.action?.flowType || null,
      templateKey: initialWorkflow.action?.templateKey || null,
      defaultForNewDevices: initialWorkflow.action?.defaultForNewDevices === true,
      ui: initialWorkflow.action?.ui || null,
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
  const [workflow, setWorkflow] = useState(() => {
    if (normalizedInitialWorkflow) return normalizedInitialWorkflow;
    return {
      name: scopeKey === "whatsapp_assistant" ? "WhatsApp Assistant Workflow" : "",
      object: "",
      trigger: scopeKey === "whatsapp_assistant" ? "whatsapp_message_received" : "manual",
      version: 1,
      lifecycleStatus: "DRAFT",
      active: false,
      entryTransition: "EVERY_TIME",
      inputContract: [],
      outputContract: [],
      steps: scopeKey === "whatsapp_assistant"
        ? [
            { ...makeStep("WHEN"), type: "CONDITION", label: "Decision" },
            { ...makeStep("SEND_WHATSAPP"), config: { ...makeStep("SEND_WHATSAPP").config, template: "", recipient: "customer.phone" } },
          ]
        : [],
    };
  });

  const [guideStep, setGuideStep] = useState("trigger");
  const [showBuilder, setShowBuilder] = useState(embedded);
  const [savedWorkflows, setSavedWorkflows] = useState(() => embedded && normalizedInitialWorkflow ? [normalizedInitialWorkflow] : []);
  const [providerAvailable, setProviderAvailable] = useState({ EMAIL: false, SMS: false, WHATSAPP: false });
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
  const [debugResult, setDebugResult] = useState(null);
  const [testsOpen, setTestsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [savedTests, setSavedTests] = useState([]);
  const [workflowVersions, setWorkflowVersions] = useState([]);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [testDraft, setTestDraft] = useState({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }] });
  const [testBusyId, setTestBusyId] = useState(null);
  const [editingTestId, setEditingTestId] = useState(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [objectFieldCatalog, setObjectFieldCatalog] = useState({});
  const [flowHistory, setFlowHistory] = useState({ past: [], future: [], last: null, applying: false });

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
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load workflow triggers."])]));
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
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load workflow actions."])]));
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
            templateKey: rule.action?.templateKey || null,
            defaultForNewDevices: rule.action?.defaultForNewDevices === true,
            ui: rule.action?.ui || null,
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
      .catch((error) => onError?.(error.message || "Unable to load workflows"));
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
    apiRequest("/api/integrations")
      .then((response) => {
        const integrations = Array.isArray(response?.data) ? response.data : [];
        const nextState = { EMAIL: false, SMS: false, WHATSAPP: false };
        for (const item of integrations) {
          const provider = String(item.provider || "").toUpperCase();
          if (provider === "EMAIL" || provider === "SMS" || provider === "WHATSAPP") {
            nextState[provider] = Boolean(item.active !== false && item.configuration && Object.keys(item.configuration || {}).length > 0);
          }
        }
        setProviderAvailable(nextState);
      })
      .catch(() => {
        setProviderAvailable({ EMAIL: false, SMS: false, WHATSAPP: false });
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
      : ["CONSTANT","FORMULA"].includes(step.type)
        ? step.config?.resourceName
        : null;
    if (!name) continue;
    const kind = step.type === "ASSIGNMENT" ? "VARIABLE" : step.type;
    const type = step.type === "ASSIGNMENT" ? step.config?.variableType : step.type === "CONSTANT" ? step.config?.resourceType : step.config?.resultType;
    const previous = resourceDeclarations.get(name);
    if (!previous) {
      resourceDeclarations.set(name, { kind, type });
      continue;
    }
    if (kind === "VARIABLE" && previous.kind === "VARIABLE" && previous.type === type) continue;
    resourceConflict = previous.kind === "VARIABLE" && kind === "VARIABLE"
      ? `Variable "${name}" is assigned with conflicting types (${previous.type || "unknown"} and ${type || "unknown"}).`
      : `Resource name "${name}" conflicts with another declared resource.`;
    break;
  }
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
    : resourceConflict
      ? resourceConflict
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
        ...(workflow.actionMetadata?.templateKey ? { templateKey: workflow.actionMetadata.templateKey } : {}),
        ...(workflow.actionMetadata?.defaultForNewDevices ? { defaultForNewDevices: true } : {}),
        ...(workflow.actionMetadata?.ui ? { ui: workflow.actionMetadata.ui } : {}),
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
    const nextLifecycle = String(lifecycleOverride || workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase();
    if (nextLifecycle === "ACTIVE" && reviewIssue) {
      onError?.(`Cannot activate workflow: ${reviewIssue}`);
      return null;
    }
    const payload = { ...buildWorkflowPayload(nextLifecycle), ...(forceNewVersion ? { forceNewVersion: true } : {}) };
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
      setSavedWorkflows((current) => [savedWorkflow, ...current.filter((item) => item.id !== nextId)]);
      if (embedded) onSaved?.({ ...workflow, ...saved, id: nextId });
      else if (!keepOpen) setShowBuilder(false);
      if (!silent) onMessage?.(forceNewVersion ? `Workflow saved as version ${saved.version || savedWorkflow.version}.` : nextLifecycle === "ACTIVE" ? "Workflow activated." : "Workflow draft saved.");
      return { id: nextId, workflow: savedWorkflow };
    } catch (error) {
      onError?.(error.message || "Unable to save workflow.");
      return null;
    }
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
        error: stepRun.metadata?.friendlyError || result?.friendlyError || (stepRun.error_text ? { title: "This step could not complete", whatHappened: stepRun.error_text, howToFix: "Open the step Properties and check its required values and Resources." } : null),
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
      onError?.(error.message || "Unable to load workflow tests.");
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
      onError?.(error.message || "Unable to load workflow versions.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const assertionLabel = (assertion) => {
    if (assertion.type === "RUN_STATUS") return `Workflow status is ${assertion.expected || "COMPLETED"}`;
    const step = workflow.steps.find((item) => String(item.id) === String(assertion.stepId || ""));
    if (assertion.type === "STEP_STATUS") return `${step?.label || "Step"} status is ${assertion.expected || "COMPLETED"}`;
    if (assertion.type === "DECISION_OUTCOME") return `${step?.label || "Decision"} outcome is ${assertion.expected || "selected outcome"}`;
    if (assertion.type === "RESOURCE_EQUALS") return `${assertion.resource || "Resource"} equals expected value`;
    return assertion.label || "Assertion";
  };

  const saveTestCase = async () => {
    let id = workflowId || null;
    if (!id) {
      const saved = await saveWorkflow("DRAFT", { keepOpen: true, silent: true });
      if (!saved?.id) return;
      id = saved.id;
    }
    if (!testDraft.name.trim()) { onError?.("Enter a test name."); return; }
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
      setTestDraft({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }] });
      await loadSavedTests(id);
      onMessage?.(editingTestId ? "Workflow test updated." : "Workflow test saved.");
    } catch (error) {
      onError?.(error.message || "Unable to save workflow test.");
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
        : [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }],
    });
  };

  const cancelTestEdit = () => {
    setEditingTestId(null);
    setTestDraft({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }] });
  };

  const runSavedTest = async (test) => {
    if (!workflowId) return;
    try {
      setTestBusyId(test.id);
      setDebugMode("test");
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
      onError?.(error.message || "Unable to run saved workflow test.");
    } finally {
      setTestBusyId(null);
    }
  };

  const deleteSavedTest = async (testId) => {
    if (!workflowId) return;
    try {
      await apiRequest(`/api/platform/rules/${workflowId}/tests/${testId}`, { method: "DELETE" });
      if (String(editingTestId || "") === String(testId)) cancelTestEdit();
      await loadSavedTests();
    } catch (error) {
      onError?.(error.message || "Unable to remove workflow test.");
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
    if (String(oldDefinition.name || "") !== String(currentDefinition.name || "")) changes.push("Workflow name changed");
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

  const restoreWorkflowVersion = async (version) => {
    if (!workflowId) return;
    try {
      setVersionsBusy(true);
      await apiRequest(`/api/platform/rules/${workflowId}/versions/${version}/restore`, { method: "POST" });
      const response = await apiRequest("/api/platform/rules");
      const rule = (Array.isArray(response?.data) ? response.data : []).find((item) => String(item.id) === String(workflowId));
      if (!rule) throw new Error("Restored workflow could not be reloaded");
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
      setSavedWorkflows((current) => [restored, ...current.filter((item) => String(item.id) !== String(workflowId))]);
      await loadWorkflowVersions();
      onMessage?.(`Version ${version} restored as new draft version ${restored.version}.`);
    } catch (error) {
      onError?.(error.message || "Unable to restore workflow version.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const runDebug = async () => {
    if (reviewIssue) {
      onError?.(`Fix the workflow before Debug: ${reviewIssue}`);
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
          ...(debugRecordMode === "specific" && debugRecordId.trim() ? { recordId: debugRecordId.trim() } : {}),
        }),
      });
      setDebugResult(response?.data || null);
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => setShowBuilder(true)}>+ New Workflow</button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Version
              <input className={inputClass} value={workflow.version || 1} onChange={(event) => setWorkflow((current) => ({ ...current, version: Number(event.target.value || 1) }))} />
            </label>
            <label className="text-sm font-medium text-slate-700">Lifecycle
              <select className={inputClass} value={workflow.lifecycleStatus || "DRAFT"} onChange={(event) => setWorkflow((current) => ({ ...current, lifecycleStatus: event.target.value, active: event.target.value === "ACTIVE" }))}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setWorkflow((current) => ({ ...current, lifecycleStatus: "ACTIVE", active: true }))}>Activate</button>
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setWorkflow((current) => ({ ...current, lifecycleStatus: "INACTIVE", active: false }))}>Deactivate</button>
            </div>
          </div>
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
                <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setShowBuilder(true); }}>Edit</button>
                <button type="button" className="text-sm text-indigo-700" onClick={() => {
                  setWorkflowId(null);
                  setWorkflow({
                    ...item,
                    id: null,
                    name: `${item.name || "Workflow"} Copy`,
                    lifecycleStatus: "DRAFT",
                    active: false,
                    version: 1,
                    actionMetadata: item.actionMetadata ? JSON.parse(JSON.stringify(item.actionMetadata)) : null,
                    steps: (item.steps || []).map((step) => ({ ...step, id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}` })),
                  });
                  setShowBuilder(true);
                }}>Clone</button>
                {item.id && (item.runtimeActive === true || item.active !== false) ? <button type="button" className="text-sm text-slate-600" onClick={() => {
                  apiRequest(`/api/platform/rules/${item.id}`, { method: "PUT", body: JSON.stringify({
                    name: item.name,
                    triggerKey: item.trigger,
                    conditions: item.conditions || [],
                    active: false,
                    lifecycleStatus: "INACTIVE",
                    version: Number(item.version || 1),
                    action: {
                      type: "workflow",
                      ...(scopeKey ? { scope: scopeKey } : item.scope ? { scope: item.scope } : {}),
                      ...(item.systemGenerated ? {
                        systemGenerated: true,
                        systemKey: item.systemKey || null,
                        capabilityType: item.capabilityType || null,
                        capabilityKey: item.capabilityKey || null,
                        scope: item.scope || "system",
                      } : {}),
                      ...(item.actionMetadata?.flowType ? { flowType: item.actionMetadata.flowType } : {}),
                      ...(item.actionMetadata?.templateKey ? { templateKey: item.actionMetadata.templateKey } : {}),
                      ...(item.actionMetadata?.defaultForNewDevices ? { defaultForNewDevices: true } : {}),
                      ...(item.actionMetadata?.ui ? { ui: item.actionMetadata.ui } : {}),
                      match: item.match || "all",
                      actions: (item.steps || []).filter((step) => step.enabled !== false).map((step) => ({
                        id: step.id,
                        label: step.label || getActionLabel(step.type),
                        type: step.type,
                        ...(step.config || {}),
                        fieldValues: step.config?.fieldValues || step.config?.fieldMappings,
                      }))
                    },
                  }) }).then(() => setSavedWorkflows((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: false, runtimeActive: false, lifecycleStatus: "INACTIVE", activeVersion: null } : entry))).catch((error) => onError?.(error.message));
                }}>Deactivate</button> : item.id ? <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setShowBuilder(true); }}>Open to activate</button> : null}
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
      {builderLoadIssues.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Some flow resources could not be loaded.</strong>
          <div className="mt-1 text-xs">{builderLoadIssues.join(" · ")}</div>
          <div className="mt-1 text-xs">Do not assume an empty dropdown means there are no records. Refresh after the connection/API issue is resolved.</div>
        </div>
      ) : null}
      <div id="workflow-trigger-section" className="workflow-builder-header">
        <div className="workflow-builder-heading">
          <button type="button" className="workflow-builder-back" aria-label="Back to Flows" title="Back to Flows" onClick={() => embedded ? onClose?.() : setShowBuilder(false)}>←</button>
          <span className={`workflow-ready-dot ${reviewIssue ? "has-issue" : ""}`} title={reviewIssue || "Flow ready"} />
          <div className="workflow-builder-title-copy">
            <h2>Flow Builder</h2>
            <small>{workflow.name || "New Flow"} <span className="workflow-builder-status">{workflow.lifecycleStatus || "DRAFT"} · Version {workflow.version || 1}</span></small>
          </div>
        </div>
        <div className="workflow-builder-field">
          <label>Flow Label</label>
          <input className={inputClass} value={workflow.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, name: event.target.value }))} placeholder="Flow label" />
        </div>
        <div className="workflow-builder-actions">
          <button type="button" className="workflow-cancel-button workflow-icon-button" disabled={!flowHistory.past.length} onClick={undoFlowChange} title="Undo" aria-label="Undo">↶</button>
          <button type="button" className="workflow-cancel-button workflow-icon-button" disabled={!flowHistory.future.length} onClick={redoFlowChange} title="Redo" aria-label="Redo">↷</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} onClick={() => { setTestsOpen((value) => !value); if (!testsOpen) loadSavedTests(); }}>View Tests</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} onClick={() => { setVersionsOpen((value) => !value); if (!versionsOpen) loadWorkflowVersions(); }}>Version History</button>
          <button type="button" className="workflow-cancel-button" onClick={() => setDebugOpen(true)}>Debug</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} title={workflowId ? "Save this flow as a new version" : "Save this flow first"} onClick={() => saveWorkflow("DRAFT", { keepOpen: true, forceNewVersion: true })}>Save As</button>
          <button type="button" className="workflow-cancel-button" onClick={() => saveWorkflow("DRAFT")}>Save</button>
          <button type="button" className="workflow-save-button" disabled={Boolean(reviewIssue)} title={reviewIssue || "Activate flow"} onClick={() => saveWorkflow("ACTIVE")}>Activate</button>
        </div>
      </div>

      {testsOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
              {testDraft.recordMode === "specific" ? <input className={inputClass} value={testDraft.recordId} onChange={(event) => setTestDraft((current) => ({ ...current, recordId: event.target.value }))} placeholder="Record ID" /> : <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Uses the latest accessible record in the current store/company.</div>}
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
                        <option value="RUN_STATUS">Workflow result</option>
                        <option value="STEP_STATUS">Step result</option>
                        <option value="DECISION_OUTCOME">Decision outcome</option>
                        <option value="RESOURCE_EQUALS">Resource equals</option>
                      </select>
                      {["STEP_STATUS","DECISION_OUTCOME"].includes(assertion.type) ? (
                        <select className={inputClass} value={assertion.stepId || ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, stepId: event.target.value, expected: "" } : item) }))}>
                          <option value="">Select step</option>
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
                          <option value="Default">Default</option>
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
            <div className="flex justify-end gap-2">{editingTestId ? <button type="button" className="workflow-cancel-button" onClick={cancelTestEdit}>Cancel edit</button> : null}<button type="button" className="workflow-save-button" disabled={Boolean(testBusyId)} onClick={saveTestCase}>{testBusyId ? "Saving…" : editingTestId ? "Update Test" : "Save Test"}</button></div>
          </div>
          <div className="mt-4 space-y-2">
            {savedTests.map((test) => (
              <div key={test.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <strong className="text-sm text-slate-800">{test.name}</strong>
                  <div className="mt-1 text-[11px] text-slate-500">{(test.config?.assertions || []).length} assertion(s){test.last_status ? ` · Last result: ${test.last_status}` : " · Not run yet"}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="workflow-cancel-button" disabled={testBusyId === test.id} onClick={() => runSavedTest(test)}>{testBusyId === test.id ? "Running…" : "Run"}</button>
                  <button type="button" className="workflow-cancel-button" disabled={Boolean(testBusyId)} onClick={() => editSavedTest(test)}>Edit</button>
                  <button type="button" className="workflow-cancel-button" disabled={Boolean(testBusyId)} onClick={() => deleteSavedTest(test.id)}>Delete</button>
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
                    <button type="button" className="workflow-cancel-button" disabled={versionsBusy || Number(item.version) === Number(workflow.version)} onClick={() => restoreWorkflowVersion(item.version)}>Restore as new Draft</button>
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

      <details className="relative z-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-800">Debug / Test Flow</div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${debugMode === "debug" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDebugMode("debug")}>Debug</button>
                  <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${debugMode === "test" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDebugMode("test")}>Test</button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">{debugMode === "debug" ? "Debug shows the path taken and highlights failed steps." : "Test gives a simple pass/fail result using the same safe execution trace."} Database changes are rolled back and external actions such as messages, payments, webhooks and printing are simulated.</p>
              {workflow.entryTransition === "UPDATED_TO_MEET" ? <p className="mt-1 text-[11px] text-amber-700">For this test, the selected record is treated as the newly matching state. Production still verifies the real previous record did not meet the Start conditions.</p> : null}
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setDebugOpen(false)}>Close</button>
          </div>
          {workflow.object ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
              <select className={inputClass} value={debugRecordMode} onChange={(event) => setDebugRecordMode(event.target.value)}>
                <option value="latest">Use latest record</option>
                <option value="specific">Use specific record</option>
              </select>
              {debugRecordMode === "specific" ? <input className={inputClass} value={debugRecordId} onChange={(event) => setDebugRecordId(event.target.value)} placeholder="Record ID" /> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">The most recent record in the current company/store will be used.</div>}
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue)} onClick={runDebug}>{debugRunning ? "Running…" : debugMode === "test" ? "Run Test" : "Run Debug"}</button>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">This flow has no trigger object, so Debug will run with user/company/store context only.</div>
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue)} onClick={runDebug}>{debugRunning ? "Running…" : debugMode === "test" ? "Run Test" : "Run Debug"}</button>
            </div>
          )}
          {debugResult ? (
            <div className={`mt-4 rounded-xl border p-4 ${debugMode === "test" ? (debugResult.testPassed === true ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50") : debugResult.status === "FAILED" ? "border-red-200 bg-red-50" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <strong className={debugMode === "test" ? (debugResult.testPassed === true ? "text-emerald-800" : "text-red-800") : debugResult.status === "FAILED" ? "text-red-800" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "text-amber-800" : "text-emerald-800"}>{debugMode === "test" ? (debugResult.testPassed === true ? "Test passed" : "Test failed") : (debugResult.status === "FAILED" ? "Debug found a problem" : debugResult.status === "NOT_STARTED" ? "Debug did not enter the workflow" : debugResult.completedWithHandledError ? "Debug completed with handled error" : "Debug completed successfully")}</strong>
                <span className="text-xs text-slate-500">No database changes were kept.</span>
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
                  <div><strong>{debugResult.friendlyError?.title || "A step failed"}</strong></div>
                  <div>{debugResult.friendlyError?.whatHappened || debugResult.run?.error_text || "The workflow could not complete."}</div>
                  <div className="rounded-lg bg-white/70 p-3"><strong>How to fix it:</strong> {debugResult.friendlyError?.howToFix || "Click the red step on the canvas and check its Properties."}</div>
                </div>
              ) : debugResult.completedWithHandledError ? (
                <div className="mt-3 space-y-2 text-sm text-amber-800">
                  <div>The workflow continued through an On Error path. The failed step remains red so you can see what was handled.</div>
                  {(debugResult.handledFaults || []).map((fault, index) => (
                    <div key={`${fault.stepId}-${index}`} className="rounded-lg bg-white/80 p-3 text-xs">
                      <strong>{fault.error?.title || "Handled step failure"}</strong>
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
                      {check.passed ? "✓" : "✕"} {check.label || check.type} · expected {String(check.expected ?? "—")} · actual {String(check.actual ?? "—")}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-emerald-800">{debugMode === "test" ? "The flow passed this test record. Green steps ran successfully; dashed green steps were safely simulated." : "Green steps ran successfully. Dashed green steps were simulated because they would contact an external service or perform an irreversible action."}</p>
              )}
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
          <WorkflowCanvas workflow={workflow} workflowId={workflowId} setWorkflow={setWorkflow} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={deleteStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={savedWorkflows} messageTemplates={messageTemplates} scopeKey={scopeKey} onGuideStepChange={setGuideStep} debugTrace={debugTrace} objectFieldCatalog={objectFieldCatalog} triggerOptions={triggerOptions} />
        </div>
      )}
      <div id="workflow-review-section" className="workflow-review-compact" aria-live="polite">
        {reviewIssue || "Trigger, conditions and actions are valid."}
      </div>
    </div>
  );
}
