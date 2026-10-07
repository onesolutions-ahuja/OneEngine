function normalizeRuntimeDriver(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const modulePath = String(value.module || "").trim();
  const factory = String(value.factory || "").trim();
  if (!/^\.\/[A-Za-z0-9_./-]+\.js$/.test(modulePath) || modulePath.includes("..")) {
    throw new Error("Connector runtime driver module path is invalid");
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(factory)) {
    throw new Error("Connector runtime driver factory is invalid");
  }
  return { modulePath, factory };
}

export async function loadConnectorDriversFromMetadata({ db, registry }) {
  if (!db || typeof db !== "function") throw new Error("Connector driver loading requires database context");
  if (!registry || typeof registry.register !== "function") throw new Error("Connector driver registry is required");

  const result = await db(
    `SELECT package_key,manifest->'runtimeDriver' AS runtime_driver
       FROM package_registry
      WHERE active=TRUE
        AND manifest->'runtimeDriver' IS NOT NULL
      ORDER BY package_key`
  );

  const loaded = [];
  for (const row of result.rows || []) {
    const definition = normalizeRuntimeDriver(row.runtime_driver);
    if (!definition) continue;
    const moduleUrl = new URL(definition.modulePath, import.meta.url);
    const imported = await import(moduleUrl.href);
    const createDriver = imported[definition.factory];
    if (typeof createDriver !== "function") {
      throw new Error(`Connector runtime driver factory is unavailable for package ${row.package_key}`);
    }
    const driver = await createDriver();
    registry.register(driver);
    loaded.push(row.package_key);
  }
  return loaded;
}
