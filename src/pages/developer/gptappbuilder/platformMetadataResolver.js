/**
 * Generic GPTAppBuilder metadata resolver.
 * Converts platform API payloads into the portable compiler contract.
 * No app/object/provider names belong here.
 */
import { apiRequest } from "../../../services/api.js";

const unwrapRows = (response) => {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.objects)) return data.objects;
  return [];
};
const keyOf = (item) => item?.objectKey || item?.object_key || item?.apiName || item?.api_name || item?.relationshipKey || item?.relationship_key || item?.actionKey || item?.action_key || item?.buttonKey || item?.button_key || item?.connectorKey || item?.connector_key || item?.key || item?.name || "";

async function findIn(path, key) {
  const response = await apiRequest(path);
  return unwrapRows(response).find((item) => String(keyOf(item)) === String(key)) || null;
}

export function createPlatformMetadataResolver() {
  const cache = new Map();
  const resolve = async ({ type, key }) => {
    const token = `${type}:${key}`;
    if (cache.has(token)) return cache.get(token);
    let value = null;
    if (type === "object") {
      value = await findIn("/api/platform/objects", key);
    } else if (type === "field") {
      const [objectKey, fieldKey] = String(key).split(".", 2);
      const object = await findIn("/api/platform/objects", objectKey);
      if (object?.id) value = await findIn(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`, fieldKey);
    } else if (type === "relationship") {
      value = await findIn("/api/platform/relationships", key);
    } else if (type === "workflow") {
      const rows = unwrapRows(await apiRequest("/api/platform/rules"));
      value = rows.find((item) => String(item.id) === String(key) || String(item.ruleKey || item.rule_key || item.name) === String(key)) || null;
    } else if (type === "action") {
      value = await findIn("/api/platform/action-registry", key);
    } else if (type === "connector") {
      value = await findIn("/api/connectors", key);
    } else if (type === "layout") {
      value = await findIn("/api/platform/layouts", key);
    } else if (type === "listView") {
      value = await findIn("/api/platform/list-views", key);
    } else if (type === "recordType") {
      value = await findIn("/api/platform/record-types", key);
    } else if (type === "template") {
      value = await findIn("/api/platform/templates", key);
    } else if (type === "report") {
      value = await findIn("/api/reports", key);
    } else if (type === "dashboard") {
      value = await findIn("/api/dashboards", key);
    } else if (type === "package") {
      value = await findIn("/api/packages", key);
    }
    cache.set(token, value);
    return value;
  };
  resolve.clear = () => cache.clear();
  return resolve;
}
