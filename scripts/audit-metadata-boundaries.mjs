import { readFileSync } from "node:fs";

const convertedSurfaces = [
  "src/pages/platform/CustomPageRuntimePage.jsx",
  "src/pages/workspace/WorkspacePage.jsx",
  "src/pages/settings/MetadataSettingsPage.jsx",
  "src/pages/settings/Platform/ObjectPage.jsx",
  "src/pages/till/TillPage.jsx",
];

const forbidden = [
  {
    name: "direct registered-button execution URL",
    pattern: /\/buttons\/\$\{?[^\n]*\/execute|\/buttons\/[^"'\s]+\/execute/,
  },
  {
    name: "direct runtime object-button execution URL",
    pattern: /\/api\/platform\/runtime\/objects\/[^"'\s]*\/buttons\/[^"'\s]*\/execute/,
  },
];

const failures = [];

for (const file of convertedSurfaces) {
  const source = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) failures.push(`${file}: ${rule.name}`);
  }
}

const actionRuntime = readFileSync("src/actions/metadata/executeObjectButton.js", "utf8");
for (const expected of ["executeObjectButton", "executeRuntimeObjectButton"]) {
  if (!actionRuntime.includes(`function ${expected}`)) {
    failures.push(`src/actions/metadata/executeObjectButton.js: missing ${expected}`);
  }
}

const pageRuntime = readFileSync("src/pages/platform/CustomPageRuntimePage.jsx", "utf8");
if (!pageRuntime.includes("executePageInteraction")) {
  failures.push("src/pages/platform/CustomPageRuntimePage.jsx: page interactions must use the shared metadata executor");
}

if (failures.length) {
  console.error("Metadata-boundary audit failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Metadata-boundary audit passed for ${convertedSurfaces.length} converted surfaces.`);
