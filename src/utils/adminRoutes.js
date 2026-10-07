const BASE = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");

function withBase(path = "") {
  const clean = String(path || "").replace(/^\/+/, "");
  return clean ? `${BASE}/${clean}` : `${BASE}/`;
}

export function buildAppPath(page) {
  const source = page && typeof page === "object" ? page : {};
  const route = source.route || source.path || source.slug || "";
  return withBase(route);
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
