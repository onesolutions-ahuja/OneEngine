export function settingSectionAccess({ permissions = [], sections = [] } = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : []);
  return Object.fromEntries((Array.isArray(sections) ? sections : []).filter(Boolean).map((section) => {
    const key = section.key || section.label;
    const required = Array.isArray(section.permissions) ? section.permissions : [];
    return [key, required.length === 0 || required.some((code) => codes.has(code))];
  }));
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false;
}
