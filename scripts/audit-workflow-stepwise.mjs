import { readFile } from "node:fs/promises";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const atomicAllowlist = new Set([
  "Open Drawer",
  "OneTill - Validate Stock",
  "OneTill - Age Verification",
  "Staff - Set Active Status",
  "OneTill - Open Drawer",
  "OneTill - Receipt QR",
  "OneTill - Receipt QR Policy",
  "OneTill - Revoke Receipt QR",
]);

const rows = [];
const add = ({ source, packageKey = null, name, apiName = null, action = {}, runtime = true }) => {
  const actions = Array.isArray(action?.actions) ? action.actions : [];
  const nodes = Array.isArray(action?.gptBuilderElements) ? action.gptBuilderElements : [];
  rows.push({
    source,
    packageKey,
    name: name || apiName || "(unnamed)",
    apiName,
    runtime,
    steps: actions.length,
    builderNodes: nodes.length,
    builderRoundTrip: !runtime || actions.length === 0 || nodes.length === actions.length,
    atomicAllowed: atomicAllowlist.has(name || apiName || ""),
  });
};

for (const pkg of packageDefinitions()) {
  const manifest = pkg?.manifest || pkg || {};
  const packageKey = pkg?.packageKey || pkg?.package_key || pkg?.key || manifest?.packageKey || manifest?.key || null;
  for (const workflow of manifest.workflows || []) {
    const action = workflow?.action || workflow || {};
    add({
      source: "package",
      packageKey,
      name: workflow?.name || workflow?.label || workflow?.key,
      apiName: workflow?.apiName || action?.apiName || null,
      action,
      runtime: String(action?.flowType || "").toUpperCase() !== "KIOSK_EXPERIENCE",
    });
  }
}

for (const workflow of systemWorkflowDefinitions()) {
  add({
    source: "system",
    name: workflow?.name,
    apiName: workflow?.action?.apiName || workflow?.systemKey || null,
    action: workflow?.action || {},
    runtime: true,
  });
}

function extractArrayObjects(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) return [];
  const arrayAt = source.indexOf("[", markerAt);
  if (arrayAt < 0) return [];
  let depth = 0, inString = null, escaped = false, objectStart = -1;
  const objects = [];
  for (let i = arrayAt + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { inString = ch; continue; }
    if (ch === "{") { if (depth === 0) objectStart = i; depth += 1; continue; }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        objects.push(source.slice(objectStart, i + 1));
        objectStart = -1;
      }
      continue;
    }
    if (ch === "]" && depth === 0) break;
  }
  return objects;
}

function countTopLevelActions(objectSource) {
  const markerAt = objectSource.indexOf("actions:");
  if (markerAt < 0) return 0;
  const arrayAt = objectSource.indexOf("[", markerAt);
  if (arrayAt < 0) return 0;
  let objectDepth = 0, bracketDepth = 1, inString = null, escaped = false, count = 0;
  for (let i = arrayAt + 1; i < objectSource.length; i += 1) {
    const ch = objectSource[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { inString = ch; continue; }
    if (ch === "[") bracketDepth += 1;
    else if (ch === "]") {
      bracketDepth -= 1;
      if (bracketDepth === 0) break;
    } else if (ch === "{") {
      if (objectDepth === 0 && bracketDepth === 1) count += 1;
      objectDepth += 1;
    } else if (ch === "}") objectDepth -= 1;
  }
  return count;
}

const platformSource = await readFile(new URL("../server/services/platformMetadata.js", import.meta.url), "utf8");
for (const [marker, sourceName] of [
  ["const lifecycleFlows = [", "platform-onestore"],
  ["const tillWorkflowDefinitions = [", "platform-onetill"],
]) {
  for (const objectSource of extractArrayObjects(platformSource, marker)) {
    const name = objectSource.match(/\bname:\s*"([^"]+)"/)?.[1] || "(unnamed)";
    const apiName = objectSource.match(/\bapiName:\s*"([^"]+)"/)?.[1] || null;
    const steps = countTopLevelActions(objectSource);
    const builderPersisted = sourceName === "platform-onestore"
      ? platformSource.includes("gptBuilderElements: flow.actions.map")
      : platformSource.includes("gptBuilderElements: (flow.actions || []).map");
    rows.push({
      source: sourceName,
      packageKey: null,
      name,
      apiName,
      runtime: true,
      steps,
      builderNodes: builderPersisted ? steps : 0,
      builderRoundTrip: builderPersisted,
      atomicAllowed: atomicAllowlist.has(name),
    });
  }
}

const runtimeRows = rows.filter((row) => row.runtime);
const short = runtimeRows.filter((row) => row.steps <= 2);
const invalidShort = short.filter((row) => !row.atomicAllowed);
const nonBuilder = runtimeRows.filter((row) => row.steps > 0 && !row.builderRoundTrip);
const zeroStep = runtimeRows.filter((row) => row.steps === 0);

const report = {
  totalDefinitions: rows.length,
  runtimeWorkflows: runtimeRows.length,
  shortRuntimeWorkflows: short.length,
  invalidShortRuntimeWorkflows: invalidShort.length,
  zeroStepRuntimeWorkflows: zeroStep.length,
  nonBuilderRoundTripRuntimeWorkflows: nonBuilder.length,
  short,
  invalidShort,
  zeroStep,
  nonBuilder,
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--enforce")) {
  if (invalidShort.length || zeroStep.length || nonBuilder.length) process.exit(1);
}
