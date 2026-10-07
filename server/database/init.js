import { readFileSync } from "node:fs";
import { runMigrations } from "./migrations.js";
import { platformSchema } from "../services/platformSchema.js";
import { bootstrapInitialSuperadmin as canonicalBootstrapInitialSuperadmin, ONEENGINE_MANAGE_PERMISSION } from "./rbacBootstrap.js";

export { ONEENGINE_MANAGE_PERMISSION };

export async function initializeDatabase(pool, { bootstrapSuperadmin = true, env = process.env } = {}) {
  if (!pool) throw new Error("A PostgreSQL connection is required to initialize OneEngine");
  console.log("OneEngine: checking database...");

  const foundationSql = readFileSync(new URL("./baseFoundation.sql", import.meta.url), "utf8");
  const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(foundationSql);
    await client.query(schemaSql);
    await client.query(platformSchema);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Startup only executes the generic migration registry. Business behaviour,
  // defaults, permissions and workflows belong to declarative metadata/packages.
  await runMigrations(pool, []);

  if (bootstrapSuperadmin) await canonicalBootstrapInitialSuperadmin(pool, env);
  console.log("OneEngine: database ready");
}

export async function bootstrapInitialSuperadmin(pool, env = process.env) {
  return canonicalBootstrapInitialSuperadmin(pool, env);
}

export async function ensureGlobalSystemProfile(pool) {
  const result = await pool.query(
    "SELECT id FROM roles WHERE company_id IS NOT NULL AND api_key='platform_superadmin' ORDER BY created_at,id LIMIT 1"
  );
  if (!result.rows[0]?.id) throw new Error("Company-bound Superadmin role is not initialized");
  return result.rows[0].id;
}
