const FIELD_REFERENCE_SPECS = [
  ["field", "fieldId", "fieldObjectId", "fieldPath"],
  ["sourceField", "sourceFieldId", "sourceFieldObjectId", "sourceFieldPath"],
  ["targetField", "targetFieldId", "targetFieldObjectId", "targetFieldPath"],
  ["lookupField", "lookupFieldId", "lookupFieldObjectId", "lookupFieldPath"],
];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function objectApiName(object) {
  return String(object?.api_name || object?.object_key || object?.label || "").trim();
}

function normalizeFieldToken(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("$")) return null;
  const parts = raw.split(".").filter(Boolean);
  return {
    raw,
    prefix: parts.length > 1 ? parts.slice(0, -1).join(".") : "",
    field: parts.at(-1) || raw,
  };
}

function buildFieldLookup(fields = []) {
  const byAlias = new Map();
  const byId = new Map();
  const add = (alias, field) => {
    const key = String(alias || "").trim().toLowerCase();
    if (!key) return;
    const list = byAlias.get(key) || [];
    list.push(field);
    byAlias.set(key, list);
  };
  for (const field of fields) {
    byId.set(String(field.id), field);
    add(field.api_name, field);
    add(field.source_column, field);
  }
  return { byAlias, byId };
}

function uniqueField(lookup, token) {
  const matches = lookup.byAlias.get(String(token || "").toLowerCase()) || [];
  const ids = [...new Set(matches.map((field) => String(field.id)))];
  return ids.length === 1 ? matches[0] : null;
}

function enrichNode(value, context, report) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => enrichNode(item, context, report));

  const next = { ...value };
  for (const [fieldKey, idKey, objectIdKey, pathKey] of FIELD_REFERENCE_SPECS) {
    const token = normalizeFieldToken(next[fieldKey]);
    if (!token) continue;

    let field = next[idKey] ? context.lookup.byId.get(String(next[idKey])) : null;

    if (!field) {
      const prefix = token.prefix.toLowerCase();
      const acceptedPrefixes = new Set([
        "",
        context.objectApi.toLowerCase(),
        context.objectKey.toLowerCase(),
      ]);
      if (!acceptedPrefixes.has(prefix)) {
        report.unresolved.push({ reason: "cross_object_or_unknown_path", value: token.raw });
        continue;
      }
      field = uniqueField(context.lookup, token.field);
    }

    if (!field) {
      report.unresolved.push({ reason: "ambiguous_or_missing", value: token.raw });
      continue;
    }

    const qualifiedPath = `${context.objectApi}.${field.api_name}`;
    if (next[idKey] !== field.id) {
      next[idKey] = field.id;
      report.changed = true;
    }
    if (next[objectIdKey] !== context.objectId) {
      next[objectIdKey] = context.objectId;
      report.changed = true;
    }
    if (next[pathKey] !== qualifiedPath) {
      next[pathKey] = qualifiedPath;
      report.changed = true;
    }
  }

  for (const [key, nested] of Object.entries(next)) {
    if (nested && typeof nested === "object") next[key] = enrichNode(nested, context, report);
  }
  return next;
}

export async function enrichRuleFieldReferences({ db, objectId, conditions, action }) {
  if (!db || !objectId) return { conditions, action, changed: false, unresolved: [] };

  const [objectResult, fieldResult] = await Promise.all([
    db("SELECT id,object_key,api_name,label FROM platform_objects WHERE id=$1 LIMIT 1", [objectId]),
    db("SELECT id,object_id,api_name,source_column FROM platform_fields WHERE object_id=$1 AND active=true", [objectId]),
  ]);
  const object = objectResult.rows?.[0];
  if (!object) return { conditions, action, changed: false, unresolved: [] };

  const context = {
    objectId: String(object.id),
    objectKey: String(object.object_key || ""),
    objectApi: objectApiName(object),
    lookup: buildFieldLookup(fieldResult.rows || []),
  };
  const report = { changed: false, unresolved: [] };
  const enrichedConditions = enrichNode(clone(conditions), context, report);
  const enrichedAction = enrichNode(clone(action), context, report);

  return {
    conditions: enrichedConditions,
    action: enrichedAction,
    changed: report.changed,
    unresolved: report.unresolved,
  };
}

export async function backfillLegacyRuleFieldReferences(db) {
  const rules = await db(
    "SELECT id,object_id,conditions,action FROM platform_rules WHERE object_id IS NOT NULL ORDER BY id"
  );
  let updated = 0;
  let unresolved = 0;

  for (const rule of rules.rows || []) {
    const enriched = await enrichRuleFieldReferences({
      db,
      objectId: rule.object_id,
      conditions: rule.conditions,
      action: rule.action,
    });
    unresolved += enriched.unresolved.length;
    if (!enriched.changed) continue;

    await db(
      "UPDATE platform_rules SET conditions=$1::jsonb,action=$2::jsonb,updated_at=NOW() WHERE id=$3",
      [JSON.stringify(enriched.conditions), JSON.stringify(enriched.action), rule.id]
    );
    updated += 1;
  }

  return { updated, unresolved };
}
