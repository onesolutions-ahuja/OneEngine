/**
 * GPTAppBuilder metadata contract.
 *
 * IMPORTANT: this module contains no business/app/provider/object vocabulary.
 * It only validates and compiles portable platform metadata references.
 */

const SAFE_KEY = /^[a-z_][a-z0-9_]{0,99}$/;
const SECRET_KEY = /password|oauth|access.?token|refresh.?token|api.?key|secret|credential|private.?key/i;

export const GPT_APP_BUILDER_SCHEMA_VERSION = 1;

export const GPT_APP_BUILDER_METADATA_TYPES = Object.freeze([
  "app", "page", "object", "field", "relationship", "recordType", "layout",
  "listView", "validation", "workflow", "action", "button", "permission",
  "fieldPermission", "connector", "template", "report", "dashboard", "package",
]);

function safeKey(value, label) {
  const key = String(value || "").trim();
  if (!SAFE_KEY.test(key)) throw new Error(`${label} must be a safe metadata key`);
  return key;
}

function scanSecrets(value, path = "metadata") {
  if (value == null) return;
  if (Array.isArray(value)) return value.forEach((item, index) => scanSecrets(item, `${path}[${index}]`));
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && typeof item === "string" && item.trim()) {
      throw new Error(`GPTAppBuilder definitions cannot contain credential values: ${path}.${key}`);
    }
    scanSecrets(item, `${path}.${key}`);
  }
}

function reference(type, key, dependsOn = []) {
  return { type, key, dependsOn: [...new Set(dependsOn.filter(Boolean))] };
}

export function createBlankAppDefinition({ appKey, label, description = "", version = "0.1.0" } = {}) {
  const key = safeKey(appKey, "App key");
  if (!String(label || "").trim()) throw new Error("App label is required");
  return {
    schemaVersion: GPT_APP_BUILDER_SCHEMA_VERSION,
    app: {
      appKey: key,
      label: String(label).trim(),
      description: String(description || "").trim(),
      version: String(version || "0.1.0"),
    },
    pages: [
      { appKey: key, pageKey: "desktop", label: "Desktop", pageType: "page", device: "desktop", definition: { schemaVersion: 1, children: [] } },
      { appKey: key, pageKey: "mobile", label: "Mobile", pageType: "page", device: "mobile", definition: { schemaVersion: 1, children: [] } },
    ],
    navigation: { tabs: [] },
    dependencies: [],
  };
}

function collectTypedReferences(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectTypedReferences(item, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;

  const type = String(value.metadataType || value.resourceType || "").trim();
  const key = String(value.metadataKey || value.resourceKey || "").trim();
  if (type && key) output.push({ type, key });

  if (value.objectKey && value.fieldKey) output.push({ type: "field", key: `${value.objectKey}.${value.fieldKey}` });
  else if (value.objectKey) output.push({ type: "object", key: String(value.objectKey) });

  if (value.flowKey) output.push({ type: "workflow", key: String(value.flowKey) });
  if (value.actionKey) output.push({ type: "action", key: String(value.actionKey) });
  if (value.connectorKey || value.providerKey) output.push({ type: "connector", key: String(value.connectorKey || value.providerKey) });
  if (value.permissionKey) output.push({ type: "permission", key: String(value.permissionKey) });
  if (value.packageKey) output.push({ type: "package", key: String(value.packageKey) });

  Object.values(value).forEach((item) => collectTypedReferences(item, output));
  return output;
}

export function compileAppDependencyGraph(definition = {}) {
  scanSecrets(definition);
  const app = definition.app || {};
  const appKey = safeKey(app.appKey || app.app_key, "App key");
  const nodes = new Map();
  const add = (node) => {
    const id = `${node.type}:${node.key}`;
    if (!nodes.has(id)) nodes.set(id, { ...node, id });
    else nodes.get(id).dependsOn = [...new Set([...(nodes.get(id).dependsOn || []), ...(node.dependsOn || [])])];
  };

  add(reference("app", appKey));
  for (const page of Array.isArray(definition.pages) ? definition.pages : []) {
    const pageKey = safeKey(page.pageKey || page.page_key, "Page key");
    add(reference("page", `${appKey}:${pageKey}`, [`app:${appKey}`]));
    for (const item of collectTypedReferences(page.definition || {})) {
      add(reference(item.type, item.key));
      nodes.get(`page:${appKey}:${pageKey}`).dependsOn.push(`${item.type}:${item.key}`);
    }
  }
  for (const item of collectTypedReferences(definition.navigation || {})) add(reference(item.type, item.key));
  for (const item of collectTypedReferences(definition.dependencies || [])) add(reference(item.type, item.key));

  return {
    schemaVersion: GPT_APP_BUILDER_SCHEMA_VERSION,
    appKey,
    nodes: [...nodes.values()].map((node) => ({ ...node, dependsOn: [...new Set(node.dependsOn || [])] })),
  };
}

export function validateAppDefinition(definition = {}) {
  const graph = compileAppDependencyGraph(definition);
  const pages = Array.isArray(definition.pages) ? definition.pages : [];
  if (!pages.length) throw new Error("GPTAppBuilder app must contain at least one page");
  const pageKeys = new Set();
  for (const page of pages) {
    const key = safeKey(page.pageKey || page.page_key, "Page key");
    if (pageKeys.has(key)) throw new Error(`Duplicate page key: ${key}`);
    pageKeys.add(key);
  }
  return { valid: true, graph };
}


const TYPE_TO_MANIFEST_COLLECTION = Object.freeze({
  object: "objects",
  relationship: "relationships",
  recordType: "recordTypes",
  layout: "layouts",
  listView: "listViews",
  validation: "rules",
  workflow: "rules",
  action: "actions",
  button: "buttons",
  permission: "permissions",
  fieldPermission: "fieldPermissions",
  connector: "connectors",
  template: "templates",
  report: "reports",
  dashboard: "dashboards",
  package: "packages",
});

function emptyPortableManifest(definition) {
  return {
    schemaVersion: GPT_APP_BUILDER_SCHEMA_VERSION,
    packageKey: definition.app.appKey,
    version: definition.app.version,
    apps: [{ ...definition.app, config: { navigation: definition.navigation || { tabs: [] } } }],
    pages: (definition.pages || []).map(({ device, ...page }) => ({
      ...page,
      definition: { ...(page.definition || {}), device: device || page.definition?.device || null },
    })),
    objects: [], relationships: [], recordTypes: [], layouts: [], listViews: [],
    rules: [], actions: [], buttons: [], permissions: [], fieldPermissions: [],
    connectors: [], templates: [], reports: [], dashboards: [], packages: [],
  };
}

/**
 * Resolve graph nodes through a generic metadata resolver.
 * resolver({ type, key }) must return portable metadata or null.
 * No table names, app names or business rules are embedded here.
 */
export async function compilePortableAppManifest(definition = {}, resolver) {
  const { graph } = validateAppDefinition(definition);
  if (typeof resolver !== "function") throw new Error("A generic metadata resolver is required");
  const manifest = emptyPortableManifest(definition);
  const unresolved = [];
  const resolvedIds = new Set();

  const queue = graph.nodes.filter((node) => !["app", "page"].includes(node.type));
  while (queue.length) {
    const node = queue.shift();
    const id = `${node.type}:${node.key}`;
    if (resolvedIds.has(id)) continue;
    if (!GPT_APP_BUILDER_METADATA_TYPES.includes(node.type)) {
      throw new Error(`Unsupported GPTAppBuilder metadata type: ${node.type}`);
    }
    const metadata = await resolver({ type: node.type, key: node.key });
    if (!metadata) {
      unresolved.push({ type: node.type, key: node.key });
      continue;
    }
    scanSecrets(metadata, id);
    resolvedIds.add(id);

    // Fields are packaged under their owning object to match the portable platform manifest.
    if (node.type === "field") {
      const [ownerKey, fieldKey] = String(node.key).split(".", 2);
      const owner = manifest.objects.find((item) => (item.objectKey || item.object_key) === ownerKey);
      if (!owner) {
        const objectMetadata = await resolver({ type: "object", key: ownerKey });
        if (!objectMetadata) {
          unresolved.push({ type: "object", key: ownerKey });
          continue;
        }
        scanSecrets(objectMetadata, `object:${ownerKey}`);
        manifest.objects.push({ ...objectMetadata, fields: [] });
      }
      const target = manifest.objects.find((item) => (item.objectKey || item.object_key) === ownerKey);
      const field = metadata.apiName || metadata.api_name ? metadata : { ...metadata, apiName: fieldKey };
      if (!(target.fields || []).some((item) => (item.apiName || item.api_name) === (field.apiName || field.api_name))) {
        target.fields = [...(target.fields || []), field];
      }
    } else {
      const collection = TYPE_TO_MANIFEST_COLLECTION[node.type];
      if (!collection) throw new Error(`No portable collection for metadata type: ${node.type}`);
      manifest[collection].push(metadata);
    }

    for (const dependency of collectTypedReferences(metadata)) {
      const dependencyId = `${dependency.type}:${dependency.key}`;
      if (!resolvedIds.has(dependencyId)) queue.push(reference(dependency.type, dependency.key));
    }
  }

  const unique = (items) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  for (const key of Object.values(TYPE_TO_MANIFEST_COLLECTION)) manifest[key] = unique(manifest[key]);
  manifest.objects = unique(manifest.objects);

  return {
    valid: unresolved.length === 0,
    unresolved: unique(unresolved),
    graph: { ...graph, nodes: unique([...graph.nodes, ...[...resolvedIds].map((id) => {
      const split = id.indexOf(":");
      return { id, type: id.slice(0, split), key: id.slice(split + 1), dependsOn: [] };
    })]) },
    manifest,
  };
}
