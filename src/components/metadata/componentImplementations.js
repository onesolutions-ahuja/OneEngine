import TableV1 from "./table/TableV1.jsx";
import ButtonV1 from "./button/ButtonV1.jsx";
import ContainerV1 from "./container/ContainerV1.jsx";

/**
 * Code implementation registry only. Page metadata references these stable APIs.
 * New behaviour is registered as a new API (table.v2), never copied into pages.
 */
export const COMPONENT_IMPLEMENTATIONS = Object.freeze({
  "table.v1": TableV1,
  "button.v1": ButtonV1,
  "container.v1": ContainerV1,
});

export const LEGACY_COMPONENT_API_ALIASES = Object.freeze({
  table: "table.v1",
  button: "button.v1",
  container: "container.v1",
});

export function canonicalComponentApi(value) {
  const key = String(value || "").trim();
  return LEGACY_COMPONENT_API_ALIASES[key] || key;
}

export function componentImplementation(value) {
  return COMPONENT_IMPLEMENTATIONS[canonicalComponentApi(value)] || null;
}
