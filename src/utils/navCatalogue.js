import {
  BarChart3, CreditCard, Database, FileText, Grid3X3, Home, KeyRound,
  Package, Plug, Receipt, RefreshCw, Settings, ShoppingBag, Store, Tag, Users
} from "lucide-react";

export const EMPTY_PERMISSION_STATE = Object.freeze({ permissions: [] });

export function normalizePermissionState(state) {
  const source=state&&typeof state==="object"?state:{};
  return {
    permissions:Array.isArray(source.permissions)
      ? source.permissions.filter((code)=>typeof code==="string")
      : [],
  };
}

const has=(state, code)=>state.permissions.includes(code);

const NAV_CATALOGUE = [
  ["Dashboard", Home, (s)=>has(s,"dashboard.view")],
  ["Sales", FileText, (s)=>has(s,"sale.view")||has(s,"sale.create")||has(s,"sale.refund")],
  ["Returns", RefreshCw, (s)=>has(s,"returns.view")||has(s,"returns.create")],
  ["Supplier Returns", RefreshCw, (s)=>has(s,"returns.create")],
  ["Products", Package, (s)=>has(s,"product.view")||has(s,"product.create")||has(s,"product.edit")],
  ["Global Products", Database],
  ["Categories", Tag, (s)=>has(s,"category.view")||has(s,"category.create")||has(s,"category.edit")],
  ["Purchases", Receipt, (s)=>has(s,"purchase.view")||has(s,"reports.purchases.view")||has(s,"inventory.view")],
  ["Suppliers", Users, (s)=>has(s,"inventory.view")],
  ["Inventory", Grid3X3, (s)=>has(s,"inventory.view")],
  ["Replenishment", Grid3X3, (s)=>has(s,"inventory.replenishment.view")||has(s,"inventory.view")||has(s,"reports.low_stock.view")],
  ["Customers", Users, (s)=>has(s,"customer.view")||has(s,"customer.create")||has(s,"customer.edit")],
  ["Gift Cards", CreditCard],
  ["Employees", Users],
  ["Stores", Store, (s)=>has(s,"store.view")||has(s,"store.edit")||has(s,"store.create")],
  ["Reports", BarChart3, (s)=>s.permissions.some((code)=>code.startsWith("reports."))],
  ["My Reports", BarChart3, (s)=>has(s,"reports.custom.view")],
  ["Integrations", Plug, (s)=>has(s,"integration.manage")],
  ["Accounting", Receipt, (s)=>has(s,"integration.manage")],
  ["Online Orders", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Order Prep", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Own Delivery", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Audit Log", FileText, (s)=>has(s,"audit.view")],
  ["Settings", Settings, (s)=>has(s,"settings.manage")||has(s,"oneengine.manage")],
  ["App Releases", Package, (s)=>has(s,"oneengine.manage")],
  ["Licensing", KeyRound, (s)=>has(s,"oneengine.manage")],
];

export function permittedNavItems(state) {
  const normalized=normalizePermissionState(state);
  return NAV_CATALOGUE
    .filter(([, , gate])=>!gate||gate(normalized))
    .map(([page,Icon])=>[page,Icon]);
}

export function permittedNavNames(state) {
  return new Set(permittedNavItems(state).map(([page])=>page));
}
