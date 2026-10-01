import { readFileSync } from "node:fs";

export const CORE_DATABASE_MIGRATION_KEYS = Object.freeze([
  "0001_core_schema",
  "0002_platform_foundation",
  "0003_legacy_compatibility",
  "0004_app_release_manager",
  "0005_remove_superadmin_identity_flag",
  "0006_backfill_rule_field_ids",
  "0007_platform_managed_roles",
  "0008_company_scope_permission",
  "0009_secure_invoice_expiry_required",
  "0010_workflow_run_version",
  "0020_tenant_engine_manager_identity",
]);

const BUILT_IN_DATABASE_MIGRATIONS = Object.freeze([
  {
    key: "0020_tenant_engine_manager_identity",
    version: "20",
    name: "Correct tenant OneEngine manager identity and RBAC authority",
    up: client => client.query(
      readFileSync(new URL("./migrations/0020_tenant_engine_manager_identity.sql", import.meta.url), "utf8")
    ),
  },
]);

export async function runMigrations(database, migrations) {
  const client = typeof database.connect === "function"
    ? await database.connect()
    : database;
  const ownsClient = client !== database;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_key TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const requestedKeys = new Set(migrations.map(migration => migration.key));
    const migrationPlan = [
      ...migrations,
      ...BUILT_IN_DATABASE_MIGRATIONS.filter(migration => !requestedKeys.has(migration.key)),
    ];

    for (const migration of migrationPlan) {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(1936683890, 1)");
        const applied = await client.query(
          "SELECT migration_key FROM schema_migrations WHERE migration_key=$1",
          [migration.key]
        );
        if (applied.rows[0]) {
          await client.query("COMMIT");
          continue;
        }

        await migration.up(client);
        await client.query(
          `INSERT INTO schema_migrations (migration_key, version, name)
           VALUES ($1, $2, $3)`,
          [migration.key, migration.version, migration.name]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`onePOS: migration ${migration.key} (${migration.name}) failed`, error);
        throw error;
      }
    }
  } finally {
    if (ownsClient) client.release();
  }
}