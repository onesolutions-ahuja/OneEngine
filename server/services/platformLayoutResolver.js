function id(value) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

function device(value) {
  const normalized = String(value || "desktop").toLowerCase();
  return ["desktop", "tablet", "mobile"].includes(normalized) ? normalized : "desktop";
}

function assignmentMatches(assignment, context = {}) {
  if (!assignment || assignment.active === false) return false;
  if (assignment.app_id && id(assignment.app_id) !== id(context.appId)) return false;
  if (assignment.record_type_id && id(assignment.record_type_id) !== id(context.recordTypeId)) return false;
  if (assignment.role_id && id(assignment.role_id) !== id(context.roleId)) return false;
  const targetDevice = device(context.deviceProfile);
  const assignedDevice = String(assignment.device_profile || "any").toLowerCase();
  if (assignedDevice !== "any" && assignedDevice !== targetDevice) return false;
  return true;
}

function specificity(assignment = {}, layout = {}, context = {}) {
  let score = Number(assignment.priority || 0) * 1000;
  if (assignment.app_id) score += 64;
  if (assignment.record_type_id) score += 32;
  if (assignment.role_id) score += 16;
  if (assignment.device_profile && assignment.device_profile !== "any") score += 8;
  const required = Array.isArray(assignment.required_permissions) ? assignment.required_permissions.length : 0;
  score += Math.min(required, 7);
  if (layout.company_id && id(layout.company_id) === id(context.companyId)) score += 4;
  if (layout.is_default === true) score += 2;
  return score;
}

export function resolvePageLayout(rows = []) {
  return rows
    .filter((layout) => layout && layout.active !== false)
    .sort((left, right) => {
      const score = (layout) => (
        layout.role_id ? 0
          : layout.is_default ? 1
            : layout.company_id ? 2
              : 3
      );
      return score(left) - score(right)
        || new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
        || String(left.id).localeCompare(String(right.id));
    })[0] || null;
}

export function resolveAssignedPageLayout(rows = [], assignments = [], context = {}) {
  const activeLayouts = rows.filter((layout) => layout && layout.active !== false);
  const byLayout = new Map();
  for (const assignment of assignments || []) {
    if (!assignment?.layout_id || assignment.active === false) continue;
    if (!byLayout.has(String(assignment.layout_id))) byLayout.set(String(assignment.layout_id), []);
    byLayout.get(String(assignment.layout_id)).push(assignment);
  }

  const candidates = [];
  for (const layout of activeLayouts) {
    const assigned = byLayout.get(String(layout.id)) || [];
    if (assigned.length) {
      for (const assignment of assigned) {
        if (!assignmentMatches(assignment, context)) continue;
        candidates.push({ layout, assignment, score: specificity(assignment, layout, context) });
      }
      continue;
    }

    // Backward-compatible legacy layout assignment. Once a layout has explicit
    // assignment rows, those rows become authoritative and the legacy columns
    // stop widening the layout's audience.
    const legacy = {
      layout_id: layout.id,
      app_id: null,
      record_type_id: layout.record_type_id || null,
      role_id: layout.role_id || null,
      device_profile: "any",
      required_permissions: [],
      priority: 0,
      active: true,
      legacy: true,
    };
    if (assignmentMatches(legacy, context)) {
      candidates.push({ layout, assignment: legacy, score: specificity(legacy, layout, context) });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((left, right) =>
    right.score - left.score
      || new Date(right.layout.updated_at || 0).getTime() - new Date(left.layout.updated_at || 0).getTime()
      || String(left.layout.id).localeCompare(String(right.layout.id))
  );
  return {
    ...candidates[0].layout,
    effective_assignment: candidates[0].assignment,
  };
}
