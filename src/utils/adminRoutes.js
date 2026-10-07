const BASE = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const PAGE_SLUGS = Object.freeze({
  Dashboard: "",
  Settings: "settings",
  OneDeveloper: "developer",
});

function withBase(path="") {
  const clean=String(path||"").replace(/^\/+/, "");
  return clean ? `${BASE}/${clean}` : `${BASE}/`;
}

export function buildAppPath(page) {
  const slug=PAGE_SLUGS[page];
  return slug === undefined ? withBase("") : withBase(slug);
}

export function buildCustomPagePath(pageKey) {
  return withBase(`workspace/pages/${encodeURIComponent(pageKey)}`);
}

export function buildObjectPath(objectKey) {
  return withBase(`workspace/${encodeURIComponent(objectKey)}`);
}

export function buildObjectRecordPath(objectKey, recordId) {
  return withBase(`workspace/${encodeURIComponent(objectKey)}/records/${encodeURIComponent(recordId)}`);
}
