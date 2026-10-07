export function normalizePlatformTheme(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : String(fallback || "");
}
export function applyPlatformTheme(theme, { root = typeof document !== "undefined" ? document.documentElement : null, fallback = "" } = {}) {
  if (!root) return normalizePlatformTheme(theme, fallback);
  const normalized = normalizePlatformTheme(theme, fallback);
  if (normalized) root.dataset.platformTheme = normalized;
  else delete root.dataset.platformTheme;
  root.style.setProperty("--platform-theme", normalized);
  root.style.setProperty("color-scheme", "light");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("platformthemechange", { detail: normalized }));
  return normalized;
}
export function subscribePlatformTheme(onThemeChange, { root = typeof document !== "undefined" ? document.documentElement : null, fallback = "" } = {}) {
  if (typeof window === "undefined" || !root || typeof onThemeChange !== "function") return () => {};
  const emit = (value) => onThemeChange(normalizePlatformTheme(value ?? root.dataset?.platformTheme, fallback));
  const onEvent = (event) => emit(event?.detail ?? root.dataset?.platformTheme);
  emit(root.dataset?.platformTheme);
  window.addEventListener("platformthemechange", onEvent);
  let observer = null;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => emit(root.dataset?.platformTheme));
    observer.observe(root, { attributes: true, attributeFilter: ["data-platform-theme"] });
  }
  return () => { window.removeEventListener("platformthemechange", onEvent); observer?.disconnect(); };
}
export function clearPlatformTheme({ root = typeof document !== "undefined" ? document.documentElement : null } = {}) {
  if (!root) return;
  delete root.dataset.platformTheme;
  root.style.removeProperty("--platform-theme");
}
export default { normalizePlatformTheme, applyPlatformTheme, subscribePlatformTheme, clearPlatformTheme };
