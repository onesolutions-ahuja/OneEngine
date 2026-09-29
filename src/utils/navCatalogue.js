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
  ["Dashboard", Home],
  ["Sales", FileText],
  ["Returns", RefreshCw, (s)=>has(s,"returns.view")||has(s,"returns.create")],
  ["Supplier Returns", RefreshCw, (s)=>has(s,"returns.create")],
  ["Products", Package],
  ["Global Products", Database],
  ["Categories", Tag],
  ["Purchases", Receipt],
  ["Suppliers", Users],
  ["Inventory", Grid3X3],
  ["Replenishment", Grid3X3, (s)=>has(s,"inventory.replenishment.view")||has(s,"inventory.view")||has(s,"reports.low_stock.view")],
  ["Customers", Users],
  ["Gift Cards", CreditCard],
  ["Employees", Users],
  ["Stores", Store],
  ["Reports", BarChart3],
  ["My Reports", BarChart3, (s)=>has(s,"reports.custom.view")],
  ["Integrations", Plug, (s)=>has(s,"integration.manage")],
  ["Accounting", Receipt, (s)=>has(s,"integration.manage")],
  ["Online Orders", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Order Prep", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Own Delivery", ShoppingBag, (s)=>has(s,"online_orders.view")],
  ["Audit Log", FileText, (s)=>has(s,"audit.view")],
  ["Settings", Settings],
  ["App Releases", Package, (s)=>has(s,"platform.manage")],
  ["Licensing", KeyRound, (s)=>has(s,"platform.manage")],
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
