const BASE = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const PAGE_SLUGS = Object.freeze({
  Dashboard: "",
  Sales: "sales",
  Returns: "returns",
  "Supplier Returns": "supplier-returns",
  Products: "products",
  "Global Products": "global-products",
  Categories: "categories",
  Purchases: "purchases",
  Suppliers: "suppliers",
  Inventory: "inventory",
  Replenishment: "replenishment",
  Customers: "customers",
  "Gift Cards": "gift-cards",
  Employees: "employees",
  Stores: "stores",
  Reports: "reports",
  "My Reports": "custom-reports",
  Integrations: "integrations",
  Accounting: "accounting",
  "Online Orders": "online-orders",
  "Order Prep": "order-prep",
  "Own Delivery": "own-delivery",
  "Audit Log": "audit-log",
  Licensing: "licensing",
  "App Releases": "app-releases",
  Settings: "settings",
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
