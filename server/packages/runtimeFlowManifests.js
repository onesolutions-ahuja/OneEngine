import { readFileSync } from "node:fs";
const definitions = JSON.parse(readFileSync(new URL("../metadata/system-workflows.json", import.meta.url), "utf8"));
export const PACKAGE_RUNTIME_FLOWS = Object.freeze(
  (Array.isArray(definitions) ? definitions : []).filter((item) => String(item?.action?.scope || "") === "package")
);
