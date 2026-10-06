/*
 * Shared constants + helpers for the Online Orders UI (Uber Eats / Deliveroo).
 *
 * Used by the Online Orders views for provider-facing status presentation.
 * Lifecycle actions themselves come from Platform button metadata.
 */

export const ACTIVE_STATUSES = ["RECEIVED", "ACCEPTED", "PREPARING", "READY"];

export const TERMINAL_STATUSES = ["COMPLETED", "REJECTED", "CANCELLED"];

export const STATUS_BADGES = {
  RECEIVED: "bg-blue-50 text-blue-700",
  ACCEPTED: "bg-indigo-50 text-indigo-700",
  PREPARING: "bg-amber-50 text-amber-700",
  READY: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-slate-100 text-slate-500",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-red-50 text-red-700",
};

/* Lifecycle action visibility/labels are intentionally NOT defined here.
 * Smart Theme reads package-owned Platform button metadata instead. Provider
 * names/status presentation remain protocol-facing display helpers only. */

export function platformLabel(platform) {
  return platform === "uber" ? "Uber Eats" : platform === "deliveroo" ? "Deliveroo" : platform || "-";
}

export function platformBadgeClass(platform) {
  return platform === "uber"
    ? "bg-emerald-600 text-white"
    : platform === "deliveroo"
      ? "bg-cyan-600 text-white"
      : "bg-slate-300 text-slate-700";
}

/*
 * Compact "time received" for order cards: today -> HH:MM, otherwise a short
 * date + time. Cards also show a relative age ("4m ago") next to it.
 */
export function formatOrderTime(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hhmm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? hhmm : `${date.toLocaleDateString([], { day: "2-digit", month: "short" })} ${hhmm}`;
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
