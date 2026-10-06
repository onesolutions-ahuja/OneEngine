import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/developer/gptbuilder/GPTBuilderPage.jsx", import.meta.url), "utf8");
const saveHistory = await readFile(new URL("../src/pages/developer/gptbuilder/GPTBuilderSaveHistory.jsx", import.meta.url), "utf8");
const newAutomation = await readFile(new URL("../src/pages/developer/gptbuilder/GPTBuilderNewAutomation.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/pages/developer/gptbuilder/GPTBuilderPage.css", import.meta.url), "utf8");

test("GPT Builder dropdowns close when focus leaves", () => {
  assert.match(page, /gptb-layout-picker" onBlur=/);
  assert.match(saveHistory, /gptb-save-as" onBlur=/);
});

test("GPT Builder overlays support Escape dismissal", () => {
  assert.match(page, /event\.key === 'Escape'/);
  for (const setter of [
    "setLayoutOpen(false)",
    "setSaveAsOpen(false)",
    "setShortcutHelpOpen(false)",
    "setPropertiesOpen(false)",
    "setDiagnosticsOpen(false)",
    "setStartOpen(false)",
    "setElementPickerOpen(false)",
    "setExecutionMode(null)",
  ]) assert.ok(page.includes(setter), setter);
  assert.match(newAutomation, /event\.key !== 'Escape'/);
});

test("GPT Builder growing panes remain scroll-safe", () => {
  assert.match(css, /\.gptb-flow-table\{width:100%;min-width:720px;/);
  assert.match(css, /\.gptb-flow-table-wrap,[\s\S]*\.gptb-element-properties-body,[\s\S]*\.gptb-screen-palette,[\s\S]*scrollbar-gutter:stable;/);
  assert.match(css, /\.gptb-flow-table-wrap\{[^}]*overflow:auto/);
  assert.match(css, /\.gptb-config-body\{[^}]*overflow:auto/);
  assert.match(css, /\.gptb-element-properties-body\{[^}]*overflow:auto/);
  assert.match(css, /\.gptb-screen-palette,\.gptb-screen-properties\{[^}]*overflow:auto/);
});
