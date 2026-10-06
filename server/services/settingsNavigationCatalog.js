import { readFileSync } from "node:fs";

const metadata = JSON.parse(readFileSync(new URL("../metadata/settings-navigation.json", import.meta.url), "utf8"));
export const SETTINGS_GROUPS = Object.freeze(Array.isArray(metadata.groups) ? metadata.groups : []);
export const SETTINGS_SECTIONS = Object.freeze(Array.isArray(metadata.sections) ? metadata.sections : []);

export function settingsSectionAllowed(section, { permissions = [] } = {}) {
  const required = Array.isArray(section?.requiredAnyPermissions) ? section.requiredAnyPermissions : [];
  if (!required.length) return true;
  const codes = new Set(Array.isArray(permissions) ? permissions : []);
  return required.some((code) => codes.has(code));
}

export function buildSettingsCatalog(access = {}) {
  const sections = SETTINGS_SECTIONS.filter((section) => settingsSectionAllowed(section, access));
  const activeGroups = new Set(sections.map((section) => section.groupKey));
  return { groups: SETTINGS_GROUPS.filter((group) => activeGroups.has(group.key)), sections };
}
