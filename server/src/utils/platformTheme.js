export const PLATFORM_THEME_OPTIONS = Object.freeze([
  { key: "theme2", label: "Theme 2", description: "Current live onePOS presentation and default baseline." },
  { key: "theme3", label: "Theme 3", description: "Light shell with a right-side vertical dock and floating Jarvis." },
  { key: "theme4", label: "Theme 4", description: "Light shell with a top navigation dock and floating Jarvis." },
]);
export const PLATFORM_THEME_KEYS = new Set(PLATFORM_THEME_OPTIONS.map((option) => option.key));
export function normalizePlatformTheme(value) {
  if (typeof value !== "string") return "theme2";
  const key = value.trim();
  return PLATFORM_THEME_KEYS.has(key) ? key : "theme2";
}
export function applyPlatformTheme(theme, { root = typeof document !== "undefined" ? document.documentElement : null } = {}) {
  if (!root) return "theme2";
  const normalized = normalizePlatformTheme(theme);
  root.dataset.platformTheme = normalized;
  root.style.setProperty("--platform-theme", normalized);
  root.style.setProperty("color-scheme", "light");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("platformthemechange", { detail: normalized }));
  return normalized;
}
export function subscribePlatformTheme(onThemeChange, { root = typeof document !== "undefined" ? document.documentElement : null } = {}) {
  if (typeof window === "undefined" || !root || typeof onThemeChange !== "function") return () => {};
  const emit = (value) => onThemeChange(normalizePlatformTheme(value ?? root.dataset?.platformTheme ?? "theme2"));
  const onEvent = (event) => emit(event?.detail ?? root.dataset?.platformTheme ?? "theme2");
  emit(root.dataset?.platformTheme ?? "theme2");
  window.addEventListener("platformthemechange", onEvent);
  let observer = null;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-platform-theme") { emit(root.dataset?.platformTheme ?? "theme2"); break; }
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-platform-theme"] });
  }
  return () => { window.removeEventListener("platformthemechange", onEvent); observer?.disconnect(); };
}
export function clearPlatformTheme({ root = typeof document !== "undefined" ? document.documentElement : null } = {}) {
  if (!root) return;
  delete root.dataset.platformTheme;
  root.style.removeProperty("--platform-theme");
}
export default { PLATFORM_THEME_OPTIONS, PLATFORM_THEME_KEYS, normalizePlatformTheme, applyPlatformTheme, subscribePlatformTheme, clearPlatformTheme };
