import { seedInternalAppCatalog } from "./internalAppCatalog.js";
import { provisionPackageMetadata, seedPackageRegistry } from "./packageRegistry.js";
import { platformSchema } from "./platformSchema.js";

export async function initializePlatformMetadata(pool) {
  const bootstrapQuery = async (label, sql, params = []) => {
    const startedAt = Date.now();
    console.log(`onePOS: platform bootstrap step start: ${label}`);
    const result = await pool.query({ text: sql, values: params, query_timeout: 30000 });
    console.log(`onePOS: platform bootstrap step ready: ${label} (${Date.now() - startedAt}ms)`);
    return result;
  };
  await bootstrapQuery("schema", platformSchema);
  await seedInternalAppCatalog(pool);
  await seedPackageRegistry(pool);
  const result = await pool.query(`SELECT id,module_id,version,manifest FROM package_registry WHERE active=true AND COALESCE((manifest->>'bootstrapFoundation')::boolean,false)=true`);
  const byKey = new Map((result.rows || []).map((entry) => [entry.manifest?.packageKey, entry]));
  const ordered = [], visiting = new Set(), visited = new Set();
  const visit = (entry) => {
    const key = entry?.manifest?.packageKey;
    if (!key || visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Bootstrap foundation dependency cycle at ${key}`);
    visiting.add(key);
    for (const dependency of entry.manifest?.dependencies || []) {
      const dependencyKey = typeof dependency === "string" ? dependency : dependency?.packageKey || dependency?.package_key;
      if (byKey.has(dependencyKey)) visit(byKey.get(dependencyKey));
    }
    visiting.delete(key); visited.add(key); ordered.push(entry);
  };
  for (const entry of result.rows || []) visit(entry);
  for (const entry of ordered) if (entry.id && entry.module_id) await provisionPackageMetadata(pool.query.bind(pool), { packageId: entry.id, moduleId: entry.module_id, companyId: null, manifest: entry.manifest || {}, packageVersion: entry.version || "1.0.0" });
}

export async function initializeStandardObjectEcosystem() { return undefined; }
