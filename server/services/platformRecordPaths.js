/** Canonical metadata-driven dotted record paths used by flows, actions and UI bindings. */
export function normalizeRecordPath(path) {
  return String(path || "").trim().split(".").map((part) => part.trim()).filter(Boolean).join(".");
}

function inverseKey(relationship, fieldsById) {
  const linkField = fieldsById.get(relationship.child_field_id);
  if (linkField?.api_name) return String(linkField.api_name).replace(/_id$/i, "");
  return relationship.parent_object_key;
}

export function buildRecordPathCatalog({ objects = [], fields = [], relationships = [] }, rootObjectKey, maxDepth = 4) {
  const root = objects.find((item) => item.object_key === rootObjectKey && item.active !== false);
  if (!root) throw new Error(`Unknown Platform object: ${rootObjectKey}`);
  const objectsById = new Map(objects.filter((item) => item.active !== false).map((item) => [item.id, item]));
  const fieldsById = new Map(fields.filter((item) => item.active !== false).map((item) => [item.id, item]));
  const fieldsByObject = new Map();
  for (const field of fieldsById.values()) {
    if (!fieldsByObject.has(field.object_id)) fieldsByObject.set(field.object_id, []);
    fieldsByObject.get(field.object_id).push(field);
  }
  const activeRelationships = relationships.filter((item) => item.active !== false);
  const results = [];
  const walk = (object, prefix, depth, visitedEdges) => {
    for (const field of fieldsByObject.get(object.id) || []) {
      results.push({ path: `${prefix}.${field.api_name}`, kind: "field", objectKey: object.object_key, fieldId: field.id, fieldType: ["formula","rollup"].includes(field.field_type) ? (field.config?.resultType || field.config?.result_type || "number") : field.field_type, label: field.label });
    }
    if (depth >= maxDepth) return;
    for (const relationship of activeRelationships) {
      let target = null;
      let key = null;
      let direction = null;
      if (relationship.parent_object_id === object.id) {
        target = objectsById.get(relationship.child_object_id);
        key = relationship.relationship_key;
        direction = "forward";
      } else if (relationship.child_object_id === object.id) {
        target = objectsById.get(relationship.parent_object_id);
        key = inverseKey(relationship, fieldsById);
        direction = "inverse";
      }
      if (!target || !key) continue;
      const edge = `${relationship.id}:${direction}`;
      if (visitedEdges.has(edge)) continue;
      const relationshipPath = `${prefix}.${key}`;
      results.push({ path: relationshipPath, kind: "relationship", objectKey: target.object_key, relationshipId: relationship.id, relationshipType: relationship.relationship_type, direction });
      walk(target, relationshipPath, depth + 1, new Set([...visitedEdges, edge]));
    }
  };
  walk(root, root.object_key, 0, new Set());
  return results;
}

export function resolveRecordPathValue(record, path, rootObjectKey = null) {
  const normalized = normalizeRecordPath(path);
  if (!normalized) return undefined;
  const parts = normalized.split(".");
  if (rootObjectKey && parts[0] === rootObjectKey) parts.shift();
  let value = record;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function resolveContextPathValue(path, { record, previousRecord, user, rootObjectKey, variables, now = new Date() } = {}) {
  const raw = String(path || "").trim();
  if (!raw) return undefined;
  if (raw === "$now") return now instanceof Date ? now.toISOString() : now;
  if (["$flow.currentStage","$Flow.CurrentStage"].includes(raw)) return variables?.variables?.__flowCurrentStage || null;
  if (["$flow.activeStages","$Flow.ActiveStages"].includes(raw)) return (variables?.variables?.__flowStages || []).filter((stage) => stage?.active !== false);
  if (raw === "$record") return record || null;
  if (raw.startsWith("$record.")) return resolveRecordPathValue(record, raw.slice("$record.".length), null);
  if (raw === "$previous") return previousRecord || null;
  if (raw.startsWith("$previous.")) return resolveRecordPathValue(previousRecord, raw.slice("$previous.".length), null);
  if (raw === "$user") return user || null;
  if (raw.startsWith("$user.")) return resolveRecordPathValue(user, raw.slice("$user.".length), null);

  const normalized = normalizeRecordPath(raw);
  if (!normalized) return undefined;
  if (normalized === "steps" || normalized.startsWith("steps.")) {
    return resolveRecordPathValue(variables || {}, normalized, null);
  }
  if (normalized === "variables" || normalized.startsWith("variables.")) {
    const namespace = variables?.variables && typeof variables.variables === "object" ? variables.variables : (variables || {});
    const inner = normalized === "variables" ? "" : normalized.slice("variables.".length);
    return inner ? resolveRecordPathValue(namespace, inner, null) : namespace;
  }
  return resolveRecordPathValue(record, normalized, rootObjectKey);
}

export function resolveBindingValue(binding, context = {}) {
  if (typeof binding === "string" && binding.startsWith("$")) {
    return resolveContextPathValue(binding, context);
  }
  if (!binding || typeof binding !== "object" || Array.isArray(binding) || !binding.path) return binding;
  return resolveContextPathValue(binding.path, context);
}

export function resolveWorkflowResource(path, context = {}) {
  return resolveContextPathValue(path, context);
}

export function resolveBindingTree(value, context = {}) {
  if (Array.isArray(value)) return value.map((item) => resolveBindingTree(item, context));
  if (!value || typeof value !== "object") return value;
  if (typeof value.path === "string" && Object.keys(value).every((key) => ["path", "fallback"].includes(key))) {
    const resolved = resolveContextPathValue(value.path, context);
    return resolved === undefined ? value.fallback : resolved;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveBindingTree(item, context)]));
}
