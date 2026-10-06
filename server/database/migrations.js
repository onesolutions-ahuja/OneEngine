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
  "0022_identity_access_security",
  "0023_identity_security_alignment",
  "0024_identity_security_phase1_final",
  "0025_identity_lockout_forever",
  "0026_identity_assurance",
  "0027_identity_assurance_overrides",
  "0028_identity_provider_state",
  "0029_identity_device_activation",
  "0030_identity_verification_methods",
  "0031_identity_passkey_kinds",
  "0032_identity_multiple_passkeys",
  "0033_identity_verification_history",
  "0034_oneengine_debug_system",
  "0035_security_governance",
  "0036_connected_app_user_assignments",
  "0037_data_email_delegated_admin",
  "0038_passkey_passwordless_login",
  "0039_diagnostic_code_v2",
  "0040_diagnostic_catalogue_expansion",
  "0041_diagnostic_runtime_columns",
  "0042_exact_root_cause_diagnostics",
  "0043_platform_agents",
  "0047_sale_ledger",
  "0048_canonical_object_consolidation",
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
  {
    key: "0022_identity_access_security",
    version: "22",
    name: "Identity access perimeter and session security",
    up: client => client.query(
      readFileSync(new URL("./migrations/0022_identity_access_security.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0023_identity_security_alignment",
    version: "23",
    name: "Align identity password policy and preserve existing users",
    up: client => client.query(
      readFileSync(new URL("./migrations/0023_identity_security_alignment.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0024_identity_security_phase1_final",
    version: "24",
    name: "Complete phase-one identity session and login history controls",
    up: client => client.query(
      readFileSync(new URL("./migrations/0024_identity_security_phase1_final.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0025_identity_lockout_forever",
    version: "25",
    name: "Support indefinite account lockout",
    up: client => client.query(
      readFileSync(new URL("./migrations/0025_identity_lockout_forever.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0026_identity_assurance",
    version: "26",
    name: "Identity assurance MFA trusted devices and authentication providers",
    up: client => client.query(
      readFileSync(new URL("./migrations/0026_identity_assurance.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0027_identity_assurance_overrides",
    version: "27",
    name: "Layered MFA and assurance policy overrides",
    up: client => client.query(
      readFileSync(new URL("./migrations/0027_identity_assurance_overrides.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0028_identity_provider_state",
    version: "28",
    name: "Authentication provider transaction state",
    up: client => client.query(
      readFileSync(new URL("./migrations/0028_identity_provider_state.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0029_identity_device_activation",
    version: "29",
    name: "Trusted-device activation policy",
    up: client => client.query(
      readFileSync(new URL("./migrations/0029_identity_device_activation.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0030_identity_verification_methods",
    version: "30",
    name: "MFA verification method policy and temporary codes",
    up: client => client.query(
      readFileSync(new URL("./migrations/0030_identity_verification_methods.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0031_identity_passkey_kinds",
    version: "31",
    name: "Distinguish built-in passkeys and security keys",
    up: client => client.query(
      readFileSync(new URL("./migrations/0031_identity_passkey_kinds.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0032_identity_multiple_passkeys",
    version: "32",
    name: "Support multiple passkeys per user",
    up: client => client.query(
      readFileSync(new URL("./migrations/0032_identity_multiple_passkeys.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0033_identity_verification_history",
    version: "33",
    name: "Identity verification history and delegated MFA permissions",
    up: client => client.query(
      readFileSync(new URL("./migrations/0033_identity_verification_history.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0034_oneengine_debug_system",
    version: "34",
    name: "OneEngine global debug codes and diagnostic events",
    up: client => client.query(
      readFileSync(new URL("./migrations/0034_oneengine_debug_system.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0035_security_governance",
    version: "35",
    name: "Security governance, connected apps and trusted origins",
    up: client => client.query(
      readFileSync(new URL("./migrations/0035_security_governance.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0036_connected_app_user_assignments",
    version: "36",
    name: "Connected-app approved user assignments",
    up: client => client.query(
      readFileSync(new URL("./migrations/0036_connected_app_user_assignments.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0037_data_email_delegated_admin",
    version: "37",
    name: "Data protection, email security and delegated administration",
    up: client => client.query(
      readFileSync(new URL("./migrations/0037_data_email_delegated_admin.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0038_passkey_passwordless_login",
    version: "38",
    name: "Tenant-controlled passwordless passkey sign-in",
    up: client => client.query(
      readFileSync(new URL("./migrations/0038_passkey_passwordless_login.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0039_diagnostic_code_v2",
    version: "39",
    name: "Expand OneEngine debug codes to subsystem and cause taxonomy",
    up: client => client.query(
      readFileSync(new URL("./migrations/0039_diagnostic_code_v2.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0040_diagnostic_catalogue_expansion",
    version: "40",
    name: "Expand OneEngine diagnostic catalogue across platform failures",
    up: client => client.query(
      readFileSync(new URL("./migrations/0040_diagnostic_catalogue_expansion.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0041_diagnostic_runtime_columns",
    version: "41",
    name: "Persist OE diagnostic codes in workflow and job traces",
    up: client => client.query(`
      ALTER TABLE platform_action_jobs ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(6);
      ALTER TABLE platform_workflow_runs ADD COLUMN IF NOT EXISTS error_code VARCHAR(6);
      ALTER TABLE platform_workflow_step_runs ADD COLUMN IF NOT EXISTS error_code VARCHAR(6);
      ALTER TABLE platform_workflow_compensation_runs ADD COLUMN IF NOT EXISTS error_code VARCHAR(6);
      CREATE INDEX IF NOT EXISTS idx_platform_action_jobs_error_code ON platform_action_jobs(last_error_code);
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_runs_error_code ON platform_workflow_runs(error_code);
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_step_runs_error_code ON platform_workflow_step_runs(error_code);
    `),
  },
  {
    key: "0042_exact_root_cause_diagnostics",
    version: "42",
    name: "Exact OneEngine root-cause diagnostic codes",
    up: client => client.query(
      readFileSync(new URL("./migrations/0042_exact_root_cause_diagnostics.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0043_platform_agents",
    version: "43",
    name: "Tenant agent metadata registry",
    up: client => client.query(
      readFileSync(new URL("./migrations/0043_platform_agents.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0047_sale_ledger",
    version: "47",
    name: "Create and backfill canonical sale ledger",
    up: client => client.query(
      readFileSync(new URL("./migrations/0047_sale_ledger.sql", import.meta.url), "utf8")
    ),
  },
  {
    key: "0048_canonical_object_consolidation",
    version: "48",
    name: "Consolidate canonical object model",
    up: client => client.query(
      readFileSync(new URL("./migrations/0048_canonical_object_consolidation.sql", import.meta.url), "utf8")
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

    if (!Array.isArray(migrations) || migrations.some(migration => !migration || !migration.key || typeof migration.up !== "function")) {
      throw new Error("Invalid database migration registry: every migration must define key and up");
    }
    const requestedKeys = new Set(migrations.map(migration => migration.key));
    const migrationPlan = [
      ...migrations,
      ...BUILT_IN_DATABASE_MIGRATIONS.filter(migration => !requestedKeys.has(migration.key)),
    ];

    // Read applied migration keys once. The previous implementation performed
    // BEGIN + advisory lock + SELECT + COMMIT for every already-applied
    // migration on every process start. With a remote PostgreSQL service that
    // turns a warm schema check into dozens of network round trips and can add
    // tens of seconds to every Render cold start.
    const appliedRows = await client.query("SELECT migration_key FROM schema_migrations");
    const appliedKeys = new Set(appliedRows.rows.map((row) => String(row.migration_key)));

    for (const migration of migrationPlan) {
      if (appliedKeys.has(migration.key)) continue;

      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(1936683890, 1)");

        // Another instance may have completed this migration while this process
        // was waiting for the lock. Re-check only pending migrations inside the
        // locked transaction; already-applied migrations never pay this cost.
        const applied = await client.query(
          "SELECT migration_key FROM schema_migrations WHERE migration_key=$1",
          [migration.key]
        );
        if (applied.rows[0]) {
          appliedKeys.add(migration.key);
          await client.query("COMMIT");
          continue;
        }

        await migration.up(client);
        await client.query(
          `INSERT INTO schema_migrations (migration_key, version, name)
           VALUES ($1, $2, $3)`,
          [migration.key, migration.version, migration.name]
        );
        appliedKeys.add(migration.key);
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