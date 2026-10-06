/*
 * Integration mapping source catalogue.
 *
 * The catalogue is derived from Platform Object metadata at runtime. No sales,
 * purchase, customer, return, supplier or other business field is declared in
 * frontend code.
 */
function objectRows(payload) {
  const data = payload?.data;
  if (Array.isArray(data?.objects)) return data.objects;
  if (Array.isArray(data)) return data;
  if (Array.isArray(payload?.objects)) return payload.objects;
  return [];
}

function normalizePath(object, path) {
  const objectKey = String(object?.object_key || object?.objectKey || object?.api_name || "").trim();
  const raw = String(path?.path || path?.apiPath || path?.api_path || path?.key || "").trim();
  if (!objectKey || !raw) return null;
  const sourcePath = raw.startsWith(objectKey + ".") ? raw : `${objectKey}.${raw}`;
  const label = path?.label || path?.displayLabel || path?.display_label || sourcePath;
  const type = String(path?.field_type || path?.fieldType || path?.type || "string").toLowerCase();
  const array = path?.isCollection === true || path?.is_collection === true || sourcePath.includes("[]");
  return { path: sourcePath, label: String(label), type, selectable: path?.readable !== false, array };
}

export async function loadIntegrationFieldCatalogue(apiRequest, { depth = 4 } = {}) {
  const response = await apiRequest("/api/platform/objects");
  const objects = objectRows(response).filter((object) => object?.active !== false && object?.permissions?.can_view !== false);
  const groups = await Promise.all(objects.map(async (object) => {
    const id = object?.id || object?.object_id;
    if (!id) return [];
    try {
      const paths = await apiRequest(`/api/platform/objects/${encodeURIComponent(id)}/record-paths?depth=${Math.max(1, Math.min(6, Number(depth) || 4))}`);
      return (Array.isArray(paths?.data) ? paths.data : [])
        .map((path) => normalizePath(object, path))
        .filter((entry) => entry?.selectable !== false);
    } catch {
      try {
        const fields = await apiRequest(`/api/platform/objects/${encodeURIComponent(id)}/fields`);
        return (Array.isArray(fields?.data) ? fields.data : [])
          .filter((field) => field?.active !== false && field?.readable !== false)
          .map((field) => normalizePath(object, {
            path: field.api_name || field.key,
            label: field.label,
            field_type: field.field_type || field.type,
            is_collection: field.is_collection,
          }))
          .filter(Boolean);
      } catch {
        return [];
      }
    }
  }));
  return groups.flat().sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
}

export default { loadIntegrationFieldCatalogue };
