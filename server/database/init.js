import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { runMigrations } from "./migrations.js";
import { ensureReleaseTablesSql } from "../services/appReleaseManager.js";
import { backfillLegacyRuleFieldReferences } from "../services/platformRuleReferences.js";
import { packageDefinitions } from "../services/packageRegistry.js";
import { platformSchema } from "../services/platformSchema.js";
import { encryptCredentials } from "../services/integrationCredentials.js";
import { decryptSecret } from "../services/secretCrypto.js";

export async function initializeDatabase(pool, { bootstrapSuperadmin = true, env = process.env } = {}) {
  if (!pool) throw new Error("A PostgreSQL connection is required to initialize onePOS");
  console.log("onePOS: checking database...");
  const platformFoundation = readFileSync(new URL("./baseFoundation.sql", import.meta.url), "utf8");
  const dataEmailSecuritySchema = readFileSync(new URL("./migrations/0037_data_email_delegated_admin.sql", import.meta.url), "utf8");

  // Legacy business/domain tables are migration-owned. Generic startup must not
  // replay the monolithic POS schema or treat application tables as platform core.
  // Existing tenant data remains untouched; package/domain migrations own future changes.

  const securityHealth = await pool.query(`
    SELECT
      to_regclass('public.data_export_settings') AS data_export_settings,
      to_regclass('public.data_retention_policies') AS data_retention_policies,
      to_regclass('public.email_deliverability_settings') AS email_deliverability_settings,
      to_regclass('public.email_sending_domains') AS email_sending_domains,
      to_regclass('public.organization_email_addresses') AS organization_email_addresses,
      to_regclass('public.organization_email_role_access') AS organization_email_role_access,
      to_regclass('public.delegated_admin_groups') AS delegated_admin_groups
  `);
  const missingSecuritySchema = Object.entries(securityHealth.rows[0] || {})
    .filter(([, value]) => !value)
    .map(([table]) => table);

  if (missingSecuritySchema.length) {
    console.warn(`onePOS: security/email schema drift detected; repairing: ${missingSecuritySchema.join(", ")}`);
    const repairClient = await pool.connect();
    try {
      await repairClient.query("BEGIN");
      await repairClient.query("SELECT pg_advisory_xact_lock(1936683890, 2)");
      await repairClient.query(dataEmailSecuritySchema);
      await repairClient.query("COMMIT");
      console.log("onePOS: security/email schema drift repair complete");
    } catch (error) {
      await repairClient.query("ROLLBACK").catch(() => {});
      console.error("onePOS: security/email schema drift repair failed", error);
      throw error;
    } finally {
      repairClient.release();
    }
  }

  await runMigrations(pool, [
    {
      key: "0002_platform_foundation",
      version: "2",
      name: "Platform and package foundation",
      up: client => client.query(platformFoundation),
    },
    {
      key: "0003_legacy_compatibility",
      version: "3",
      name: "Core compatibility migrations and system seeds",
      up: client => initializeLegacyDatabase(client),
    },
    {
      key: "0004_app_release_manager",
      version: "4",
      name: "App release rollout state",
      up: client => client.query(ensureReleaseTablesSql),
    },
    {
      key: "0005_remove_superadmin_identity_flag",
      version: "5",
      name: "Remove deprecated Superadmin identity flag",
      up: client => client.query("ALTER TABLE users DROP COLUMN IF EXISTS is_superadmin"),
    },
    {
      key: "0006_backfill_rule_field_ids",
      version: "6",
      name: "Backfill stable field IDs in Platform rules and flows",
      up: async client => {
        const result = await backfillLegacyRuleFieldReferences((sql, params) => client.query(sql, params));
        console.log(`onePOS: rule field reference backfill updated ${result.updated} rule(s); ${result.unresolved} unresolved reference(s) left unchanged`);
      },
    },
    {
      key: "0007_platform_managed_roles",
      version: "7",
      name: "Protect platform-managed tenant support roles",
      up: async client => {
        await client.query("ALTER TABLE roles ADD COLUMN IF NOT EXISTS managed_by_platform BOOLEAN NOT NULL DEFAULT FALSE");
      },
    },
    {
      key: "0008_company_scope_permission",
      version: "8",
      name: "Replace role-name company scope with RBAC permission",
      up: async client => {
        await client.query(
          `INSERT INTO permissions (code,name,description)
           VALUES ('company.scope.all','Company-wide data scope','View company-wide data across stores when the feature permission also allows access')
           ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`
        );
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT DISTINCT r.id,p_scope.id
             FROM roles r
             JOIN permissions p_scope ON p_scope.code='company.scope.all'
            WHERE r.company_id IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
                WHERE rp.role_id=r.id AND p.code='settings.manage'
              )
              AND EXISTS (
                SELECT 1 FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
                WHERE rp.role_id=r.id AND p.code='role.manage'
              )
              AND EXISTS (
                SELECT 1 FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
                WHERE rp.role_id=r.id AND p.code='user.manage'
              )
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
      },
    },
    {
      key: "0009_secure_invoice_expiry_required",
      version: "9",
      name: "Require expiry on secure invoice links",
      up: async client => {
        await client.query(
          `UPDATE secure_invoice_links
              SET expires_at = COALESCE(expires_at, created_at + INTERVAL '30 days')
            WHERE expires_at IS NULL`
        );
        await client.query("ALTER TABLE secure_invoice_links ALTER COLUMN expires_at SET NOT NULL");
      },
    },
    {
      key: "0010_workflow_run_version",
      version: "10",
      name: "Add workflow version to workflow runs",
      up: async client => {
        await client.query(
          "ALTER TABLE platform_workflow_runs ADD COLUMN IF NOT EXISTS workflow_version INTEGER NOT NULL DEFAULT 1"
        );
      },
    },
    {
      key: "0011_rbac_permission_catalog_sync",
      version: "11",
      name: "Synchronize runtime RBAC permission catalogue",
      up: async client => {
        const permissionRows = [
          ["attendance.use", "Use Attendance", "Clock in/out and execute attendance actions"],
          ["appointments.view", "View Appointments", "View appointment and availability data used by workflow actions"],
          ["appointments.manage", "Manage Appointments", "Create, hold, release and manage appointments through workflow actions"],
          ["appointments.payment", "Manage Appointment Payments", "Create and complete appointment payment requests through workflow actions"],
          ["communications.send", "Send Communications", "Send messages through Communication Core"],
          ["connector.manage", "Manage Connectors", "Enable, disable and configure connector runtime"],
          ["connector.test", "Test Connectors", "Run connector test and diagnostic actions"],
          ["connector.view", "View Connectors", "View connector status and health"],
          ["functions.execute", "Execute Functions", "Execute registered platform functions"],
          ["integrations.execute", "Execute Integrations", "Execute registered integration actions"],
          ["message.send", "Send Messages", "Send messages through configured providers"],
          ["notifications.write", "Write Notifications", "Create in-app notifications"],
          ["package.manage", "Manage Packages", "Install and manage onePOS packages"],
          ["product.manage", "Manage Products", "Execute product management actions"],
          ["records.create", "Create Records", "Create generic platform records"],
          ["records.view", "View Records", "Read generic platform records in workflows"],
          ["records.delete", "Delete Records", "Delete generic platform records"],
          ["records.update", "Update Records", "Update generic platform records"],
          ["records.validate", "Validate Records", "Validate generic platform records"],
          ["workflow.execute", "Execute Workflows", "Execute platform workflows"],
        ];

        for (const [code, name, description] of permissionRows) {
          await client.query(
            `INSERT INTO permissions (code,name,description)
             VALUES ($1,$2,$3)
             ON CONFLICT (code) DO UPDATE
               SET name=EXCLUDED.name,
                   description=COALESCE(NULLIF(permissions.description,''),EXCLUDED.description)`,
            [code, name, description]
          );
        }

        /*
         * Superadmin remains ordinary RBAC: it has no identity bypass.
         * Its OneEngine-managed role is simply seeded with every permission.
         * Synchronize here before the HTTP listener opens so an existing
         * Superadmin cannot log in during heavy metadata bootstrap with a
         * partially populated permission matrix.
         */
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT r.id,p.id
             FROM roles r
             CROSS JOIN permissions p
            WHERE r.api_key='platform_superadmin'
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
      },
    },
      {
      key: "0014_package_entitlement_source_types",
      version: "14",
      name: "Expand package entitlement source types",
      up: async client => {
        await client.query(
          `ALTER TABLE company_package_entitlement_sources
             DROP CONSTRAINT IF EXISTS company_package_entitlement_sources_source_type_check`
        );
        await client.query(
          `ALTER TABLE company_package_entitlement_sources
             ADD CONSTRAINT company_package_entitlement_sources_source_type_check
             CHECK (source_type IN (
               'DIRECT_LICENCE','DIRECT_INSTALL','BUNDLE','TIER','REQUIRED_DEPENDENCY',
               'OPTIONAL_DEPENDENCY','PLATFORM_DEFAULT','ONEENGINE_DEFAULT','SUPERADMIN_ASSIGNMENT'
             ))`
        );
      },
    },
    {
      key: "0014a_platform_schema_prerequisites",
      version: "14a",
      name: "Create platform metadata schema before dependent migrations",
      up: async client => {
        // Fresh databases do not have the metadata tables yet because the full
        // metadata bootstrap runs after core migrations. Several historical
        // migrations update those tables, so establish the idempotent schema
        // first. Existing databases are unaffected by CREATE IF NOT EXISTS.
        await client.query(platformSchema);
      },
    },
    {
      key: "0015_oneengine_manager_permission",
      version: "15",
      name: "Migrate Platform Manager permission to OneEngine Manager",
      up: async client => {
        await client.query(
          `INSERT INTO permissions (code,name,description)
           VALUES ('oneengine.manage','Manage OneEngine','Manage OneEngine-wide settings, tenants, licences and releases')
           ON CONFLICT (code) DO UPDATE
             SET name=EXCLUDED.name,
                 description=EXCLUDED.description`
        );
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT rp.role_id,p_new.id
             FROM role_permissions rp
             JOIN permissions p_old ON p_old.id=rp.permission_id AND p_old.code='platform.manage'
             JOIN permissions p_new ON p_new.code='oneengine.manage'
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
        await client.query(
          `UPDATE roles
              SET name='OneEngine Manager',
                  api_key=CASE WHEN company_id IS NULL THEN 'oneengine_manager' ELSE api_key END,
                  description=CASE WHEN company_id IS NULL
                    THEN 'Manage OneEngine across explicitly authorised tenants through RBAC'
                    ELSE description END
            WHERE company_id IS NULL
              AND (api_key='platform_developer' OR name='Platform Developer')`
        );
        await client.query(
          `UPDATE platform_permission_sets
              SET system_permissions = (
                SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
                  FROM jsonb_array_elements_text(
                    COALESCE(system_permissions,'[]'::jsonb) || '["oneengine.manage"]'::jsonb
                  ) AS item(value)
                 WHERE value <> 'platform.manage'
              )
            WHERE COALESCE(system_permissions,'[]'::jsonb) ? 'platform.manage'`
        );
      },
    },
    {
      key: "0016_audit_schema_hardening",
      version: "16",
      name: "Audit schema hardening for terminals and sales",
      up: async client => {
        await client.query("ALTER TABLE terminals ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE");
        await client.query(
          `UPDATE terminals t
              SET company_id=s.company_id
             FROM stores s
            WHERE t.store_id=s.id
              AND t.company_id IS NULL`
        );
        await client.query("ALTER TABLE terminals ALTER COLUMN company_id SET NOT NULL");
        await client.query("CREATE INDEX IF NOT EXISTS idx_terminals_company_store ON terminals(company_id,store_id)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_sales_company_store_status_date ON sale_ledger(company_id,store_id,status,created_at DESC)");
      },
    },
    {
      key: "0017_audit_data_hygiene",
      version: "17",
      name: "Audit data hygiene and dashboard uniqueness",
      up: async client => {
        await client.query(
          `WITH ranked AS (
             SELECT id,name,
                    ROW_NUMBER() OVER (
                      PARTITION BY company_id,LOWER(name)
                      ORDER BY updated_at DESC,created_at DESC,id
                    ) AS duplicate_ordinal
               FROM dashboards
              WHERE archived_at IS NULL
           )
           UPDATE dashboards d
              SET name=LEFT(d.name || ' (Duplicate ' || ranked.duplicate_ordinal || ')',150),
                  updated_at=NOW()
             FROM ranked
            WHERE d.id=ranked.id
              AND ranked.duplicate_ordinal>1`
        );
        await client.query(
          "CREATE UNIQUE INDEX IF NOT EXISTS ux_dashboards_company_active_name ON dashboards(company_id,LOWER(name)) WHERE archived_at IS NULL"
        );
        await client.query(
          `UPDATE users u
              SET active=false,updated_at=NOW()
             FROM companies c
            WHERE u.company_id=c.id
              AND LOWER(c.name)=LOWER('onePOS Demo')
              AND LOWER(u.username) IN ('probe_lifecycle','testuser_noperm')`
        );
      },
    },
    {
      key: "0018_legacy_demo_superadmin_email",
      version: "18",
      name: "Migrate legacy demo Superadmin email",
      up: async client => {
        await client.query(
          `UPDATE users u
              SET username='superadmin@onepos.com',
                  email='superadmin@onepos.com',
                  updated_at=NOW()
             FROM companies c
            WHERE u.company_id=c.id
              AND LOWER(c.name)=LOWER('onePOS Demo')
              AND u.active=true
              AND (
                LOWER(COALESCE(u.email,''))='superadmin@onepos.local'
                OR LOWER(COALESCE(u.username,''))='superadmin'
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM users existing
                 WHERE existing.id<>u.id
                   AND (
                     LOWER(COALESCE(existing.email,''))='superadmin@onepos.com'
                     OR LOWER(COALESCE(existing.username,''))='superadmin@onepos.com'
                   )
              )`
        );
      },
    },
    {
      key: "0019_dual_superadmin_seed",
      version: "19",
      name: "Canonical company-bound Superadmin RBAC",
      up: async client => {
        await client.query(`INSERT INTO permissions (code,name,description) VALUES ('oneengine.manage','Manage OneEngine','Manage metadata across organisations inside OneDeveloper') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`);
        await client.query(`INSERT INTO role_permissions (role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.company_id IS NOT NULL AND r.api_key='platform_superadmin' ON CONFLICT (role_id,permission_id) DO NOTHING`);
      },
    },
    {
      key: "0020_engine_manager_all_permissions",
      version: "20",
      name: "Remove legacy global OneEngine identities",
      up: async client => {
        await client.query(`UPDATE users SET active=false,updated_at=NOW() WHERE company_id IS NULL AND role_id IN (SELECT id FROM roles WHERE company_id IS NULL AND api_key IN ('engine_manager','oneengine_manager'))`);
      },
    },
    {
      key: "0023_remove_legacy_authority_identity",
      version: "23",
      name: "Remove legacy identity and platform permission authority",
      up: async client => {
        await client.query(
          `INSERT INTO permissions (code,name,description)
           VALUES ('oneengine.manage','Manage OneEngine','Manage OneEngine-wide settings, tenants, licences and releases')
           ON CONFLICT (code) DO NOTHING`
        );
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT rp.role_id,p_new.id
             FROM role_permissions rp
             JOIN permissions p_old ON p_old.id=rp.permission_id AND p_old.code='platform.manage'
             JOIN permissions p_new ON p_new.code='oneengine.manage'
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
        await client.query(
          `UPDATE platform_permission_sets
              SET system_permissions = (
                SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
                  FROM jsonb_array_elements_text(
                    COALESCE(system_permissions,'[]'::jsonb) || '["oneengine.manage"]'::jsonb
                  ) AS item(value)
                 WHERE value <> 'platform.manage'
              )
            WHERE COALESCE(system_permissions,'[]'::jsonb) ? 'platform.manage'`
        );
        await client.query(
          `DELETE FROM role_permissions
            WHERE permission_id IN (SELECT id FROM permissions WHERE code='platform.manage')`
        );
        await client.query(`DELETE FROM permissions WHERE code='platform.manage'`);
        await client.query(`DROP TABLE IF EXISTS platform_developer_company_access`);
        await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_platform_developer`);
      },
    },

    {
      key: "0024_sync_internal_package_catalog",
      version: "24",
      name: "Synchronise internal package catalog with package registry",
      up: async client => {
        const definitions = packageDefinitions();
        for (const pkg of definitions) {
          const packageType = pkg.manifest?.packageType || "APPLICATION";
          const publisher = pkg.manifest?.publisher || "OneSolutions";
          const category = pkg.manifest?.category || "Business";
          const lifecycle = pkg.manifest?.lifecycleState === "RETIRED" ? "RETIRED" : "PUBLISHED";
          const visible = String(pkg.manifest?.visibility || "PUBLIC").toUpperCase() !== "HIDDEN";
          const installable = pkg.manifest?.installable !== false;
          const billable = pkg.manifest?.billable !== false;
          const systemOnly = pkg.manifest?.systemOnly === true;
          const displayOrder = Number(pkg.manifest?.displayOrder || 0);
          const licenceMode = pkg.manifest?.licenceMode || (packageType === "FOUNDATION" ? "TECHNICAL" : "COMMERCIAL");

          await client.query(
            `INSERT INTO package_registry
               (package_key,name,version,description,manifest,active,package_type,publisher,category,
                publication_state,visible,installable,billable,system_only,display_order,licence_mode,updated_at)
             VALUES ($1,$2,$3,$4,$5::jsonb,TRUE,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
             ON CONFLICT (package_key) DO UPDATE SET
               name=EXCLUDED.name,
               version=EXCLUDED.version,
               description=EXCLUDED.description,
               manifest=EXCLUDED.manifest,
               active=TRUE,
               package_type=EXCLUDED.package_type,
               publisher=EXCLUDED.publisher,
               category=EXCLUDED.category,
               publication_state=EXCLUDED.publication_state,
               visible=EXCLUDED.visible,
               installable=EXCLUDED.installable,
               billable=EXCLUDED.billable,
               system_only=EXCLUDED.system_only,
               display_order=EXCLUDED.display_order,
               licence_mode=EXCLUDED.licence_mode,
               updated_at=NOW()`,
            [
              pkg.packageKey,
              pkg.name,
              pkg.version,
              pkg.description || null,
              JSON.stringify(pkg.manifest || {}),
              packageType,
              publisher,
              category,
              lifecycle,
              visible,
              installable,
              billable,
              systemOnly,
              displayOrder,
              licenceMode,
            ]
          );
        }

        for (const pkg of definitions) {
          const packageRow = await client.query("SELECT id FROM package_registry WHERE package_key=$1", [pkg.packageKey]);
          const packageId = packageRow.rows[0]?.id;
          if (!packageId) continue;
          for (const dependency of pkg.dependencies || []) {
            const dependencyKey = typeof dependency === "string" ? dependency : dependency.packageKey || dependency.package_key;
            if (!dependencyKey) continue;
            const dependencyRow = await client.query("SELECT id FROM package_registry WHERE package_key=$1", [dependencyKey]);
            const dependencyId = dependencyRow.rows[0]?.id;
            if (!dependencyId) continue;
            await client.query(
              `INSERT INTO package_dependencies
                 (package_id,dependency_id,version_range,min_version,max_version,optional)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (package_id,dependency_id) DO UPDATE SET
                 version_range=EXCLUDED.version_range,
                 min_version=EXCLUDED.min_version,
                 max_version=EXCLUDED.max_version,
                 optional=EXCLUDED.optional`,
              [
                packageId,
                dependencyId,
                typeof dependency === "object" ? dependency.versionRange || dependency.version_range || null : null,
                typeof dependency === "object" ? dependency.minVersion || dependency.min_version || null : null,
                typeof dependency === "object" ? dependency.maxVersion || dependency.max_version || null : null,
                typeof dependency === "object" && dependency.optional === true,
              ]
            );
          }
        }

        const verified = await client.query(
          `SELECT package_key FROM package_registry
            WHERE package_key IN ('communication_core','sms_connector','smsgate_connector','one_assistant')
            ORDER BY package_key`
        );
        console.log(`onePOS: internal package catalog synchronized (${verified.rows.map(row => row.package_key).join(", ")})`);
      },
    },

    {
      key: "0025_communication_core_runtime_tables",
      version: "25",
      name: "Ensure Communication Core runtime tables exist",
      up: async client => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS platform_communication_deliveries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
            channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP','IN_APP')),
            template_id UUID REFERENCES platform_message_templates(id) ON DELETE SET NULL,
            object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL,
            record_id UUID,
            recipient TEXT NOT NULL,
            provider_name VARCHAR(100),
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            attempts INTEGER NOT NULL DEFAULT 0,
            failure_reason TEXT,
            provider_message_id VARCHAR(255),
            triggered_by_rule UUID REFERENCES platform_rules(id) ON DELETE SET NULL,
            attempted_at TIMESTAMPTZ,
            sent_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_platform_communication_deliveries_company
            ON platform_communication_deliveries(company_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS platform_communication_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP','IN_APP')),
            event_type VARCHAR(100) NOT NULL,
            direction VARCHAR(20),
            provider VARCHAR(100),
            provider_message_id VARCHAR(255),
            recipient TEXT,
            sender TEXT,
            template_id UUID REFERENCES platform_message_templates(id) ON DELETE SET NULL,
            object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL,
            record_id UUID,
            communication_id UUID,
            body TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_platform_communication_events_company
            ON platform_communication_events(company_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_platform_communication_events_trigger
            ON platform_communication_events(company_id, channel, event_type, created_at DESC);
        `);
        console.log("onePOS: Communication Core runtime tables ready");
      },
    },

    {
      key: "0028_workflow_records_view_permission",
      version: "28",
      name: "Add workflow record read permission",
      up: async client => {
        await client.query(
          `INSERT INTO permissions (code,name,description)
           VALUES ('records.view','View Records','Read generic platform records in workflows')
           ON CONFLICT (code) DO UPDATE
             SET name=EXCLUDED.name,
                 description=COALESCE(NULLIF(permissions.description,''),EXCLUDED.description)`
        );
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT r.id,p.id
             FROM roles r
             JOIN permissions p ON p.code='records.view'
            WHERE r.api_key='platform_superadmin'
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
      },
    },
    {
      key: "0029_workflow_version_baseline",
      version: "29",
      name: "Backfill immutable workflow version baseline",
      up: async client => {
        // This table was added to the legacy compatibility bootstrap after some
        // databases had already recorded migration 0003 as applied. Create it
        // here as part of the first migration that depends on it so upgrades
        // from those databases are deterministic.
        await client.query(`
          CREATE TABLE IF NOT EXISTS platform_workflow_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            workflow_id UUID NOT NULL REFERENCES platform_rules(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            definition JSONB NOT NULL,
            lifecycle_status VARCHAR(20),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, workflow_id, version)
          );
          CREATE INDEX IF NOT EXISTS idx_platform_workflow_versions_lookup
            ON platform_workflow_versions(company_id, workflow_id, version DESC);
        `);
        await client.query(
          `INSERT INTO platform_workflow_versions
             (company_id,workflow_id,version,definition,lifecycle_status,created_by,created_at)
           SELECT r.company_id,
                  r.id,
                  GREATEST(COALESCE(r.version,1),1),
                  jsonb_build_object(
                    'object_id',r.object_id,
                    'name',r.name,
                    'trigger_key',r.trigger_key,
                    'conditions',COALESCE(r.conditions,'[]'::jsonb),
                    'action',COALESCE(r.action,'{}'::jsonb),
                    'active',r.active,
                    'lifecycle_status',COALESCE(r.lifecycle_status,CASE WHEN r.active THEN 'ACTIVE' ELSE 'DRAFT' END),
                    'version',GREATEST(COALESCE(r.version,1),1)
                  ),
                  COALESCE(r.lifecycle_status,CASE WHEN r.active THEN 'ACTIVE' ELSE 'DRAFT' END),
                  r.created_by,
                  COALESCE(r.created_at,NOW())
             FROM platform_rules r
            WHERE r.company_id IS NOT NULL
              AND r.action->>'type'='workflow'
           ON CONFLICT (company_id,workflow_id,version) DO NOTHING`
        );
      },
    },
    {
      key: "0030_workflow_active_draft_pointer",
      version: "30",
      name: "Separate workflow runtime version from editable draft",
      up: async client => {
        await client.query(`
          ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS active_version INTEGER;
          ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS draft_version INTEGER;
          ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS draft_definition JSONB;
          UPDATE platform_rules
             SET active_version=COALESCE(active_version,version)
           WHERE action->>'type'='workflow' AND active=TRUE;
          UPDATE platform_rules
             SET draft_version=COALESCE(draft_version,version)
           WHERE action->>'type'='workflow' AND active=FALSE AND lifecycle_status='DRAFT';
          CREATE INDEX IF NOT EXISTS idx_platform_rules_workflow_versions
            ON platform_rules(company_id,active_version,draft_version)
            WHERE action->>'type'='workflow';
        `);
      },
    },
    {
      key: "0031_workflow_saved_tests",
      version: "31",
      name: "Create persisted workflow test cases",
      up: async client => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS platform_workflow_tests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            workflow_id UUID NOT NULL REFERENCES platform_rules(id) ON DELETE CASCADE,
            name VARCHAR(200) NOT NULL,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            last_status VARCHAR(20),
            last_run_id UUID REFERENCES platform_workflow_runs(id) ON DELETE SET NULL,
            last_result JSONB,
            last_run_at TIMESTAMPTZ,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_platform_workflow_tests_lookup
            ON platform_workflow_tests(company_id, workflow_id, active, created_at DESC);
        `);
      },
    },
    {
      key: "0032_approval_work_items",
      version: "32",
      name: "Complete approval submission and work item lifecycle",
      up: async client => {
        await client.query(`
          ALTER TABLE platform_approval_requests ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
          CREATE TABLE IF NOT EXISTS platform_approval_work_items (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id UUID NOT NULL REFERENCES platform_approval_requests(id) ON DELETE CASCADE,
            step_id UUID REFERENCES platform_approval_steps(id) ON DELETE SET NULL,
            step_order INTEGER NOT NULL,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
            assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('waiting','pending','approved','rejected','cancelled')),
            decision VARCHAR(20),
            comment TEXT,
            due_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            reassigned_from UUID REFERENCES users(id) ON DELETE SET NULL,
            reassigned_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(request_id,step_order)
          );
          CREATE INDEX IF NOT EXISTS idx_platform_approval_work_items_assignee ON platform_approval_work_items(company_id,assigned_to,status,created_at DESC);
          CREATE TABLE IF NOT EXISTS platform_approval_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            request_id UUID NOT NULL REFERENCES platform_approval_requests(id) ON DELETE CASCADE,
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            event_type VARCHAR(40) NOT NULL,
            actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_platform_approval_events_request ON platform_approval_events(request_id,created_at);
          UPDATE platform_approval_requests r
             SET locked=COALESCE((p.config->>'lockRecord')::boolean,TRUE)
            FROM platform_approval_processes p
           WHERE p.id=r.process_id AND r.status='pending';
          INSERT INTO platform_approval_work_items(request_id,step_id,step_order,company_id,role_id,assigned_to,status,created_at)
          SELECT r.id,s.id,s.step_order,r.company_id,s.role_id,
                 (SELECT u.id FROM users u WHERE u.company_id=r.company_id AND u.role_id=s.role_id AND u.active=TRUE ORDER BY u.created_at,u.id LIMIT 1),
                 'pending',r.submitted_at
            FROM platform_approval_requests r
            JOIN platform_approval_steps s ON s.process_id=r.process_id AND s.step_order=r.current_step
           WHERE r.status='pending'
          ON CONFLICT(request_id,step_order) DO NOTHING;
        `);
      },
    },
    {
      key: "0033_approval_enterprise_assignment",
      version: "33",
      name: "Add approval assignment, delegation and immutable definitions",
      up: async client => {
        await client.query(`
          ALTER TABLE platform_approval_requests ADD COLUMN IF NOT EXISTS definition_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;
          ALTER TABLE platform_approval_requests ADD COLUMN IF NOT EXISTS submission_comment TEXT;
          ALTER TABLE platform_approval_steps ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(30) NOT NULL DEFAULT 'role';
          ALTER TABLE platform_approval_steps ADD COLUMN IF NOT EXISTS assignment_config JSONB NOT NULL DEFAULT '{}'::jsonb;
          ALTER TABLE platform_approval_work_items DROP CONSTRAINT IF EXISTS platform_approval_work_items_request_id_step_order_key;
          CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_approval_work_item_assignee
            ON platform_approval_work_items(request_id,step_order,COALESCE(assigned_to,'00000000-0000-0000-0000-000000000000'::uuid));
          CREATE TABLE IF NOT EXISTS platform_approval_groups (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name VARCHAR(160) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id,name)
          );
          CREATE TABLE IF NOT EXISTS platform_approval_group_members (
            group_id UUID NOT NULL REFERENCES platform_approval_groups(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY(group_id,user_id)
          );
          CREATE TABLE IF NOT EXISTS platform_approval_delegations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            delegate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            starts_at TIMESTAMPTZ,
            ends_at TIMESTAMPTZ,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_platform_approval_delegations_active
            ON platform_approval_delegations(company_id,user_id,active,starts_at,ends_at);
        `);
      },
    },
    {
      key: "0034_approval_version_manager_escalation",
      version: "34",
      name: "Pin approval definitions and add manager hierarchy and escalation state",
      up: async client => {
        await client.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_users_manager ON users(company_id,manager_id) WHERE manager_id IS NOT NULL;
          ALTER TABLE platform_approval_processes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE platform_approval_requests ADD COLUMN IF NOT EXISTS process_version INTEGER NOT NULL DEFAULT 1;
          ALTER TABLE platform_approval_work_items ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
          ALTER TABLE platform_approval_work_items ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;
          ALTER TABLE platform_approval_work_items ADD COLUMN IF NOT EXISTS escalation_count INTEGER NOT NULL DEFAULT 0;
          UPDATE platform_approval_requests r SET process_version=p.version
            FROM platform_approval_processes p WHERE p.id=r.process_id AND r.process_version=1;
        `);
      },
    },
    {
      key: "0035_user_store_assignment_permission",
      version: "35",
      name: "Add explicit user store assignment authority",
      up: async client => {
        await client.query(
          `INSERT INTO permissions (code,name,description)
           VALUES ('user.store_assignment.manage','Manage User Store Assignments','Assign active company stores to users, including the caller when explicitly authorised')
           ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`
        );
        await client.query(
          `INSERT INTO role_permissions (role_id,permission_id)
           SELECT DISTINCT r.id,p.id
             FROM roles r
             JOIN permissions p ON p.code='user.store_assignment.manage'
            WHERE EXISTS (
                    SELECT 1 FROM role_permissions rp
                    JOIN permissions existing ON existing.id=rp.permission_id
                    WHERE rp.role_id=r.id AND existing.code='user.manage'
                  )
              AND EXISTS (
                    SELECT 1 FROM role_permissions rp
                    JOIN permissions existing ON existing.id=rp.permission_id
                    WHERE rp.role_id=r.id AND existing.code='store.edit'
                  )
           ON CONFLICT (role_id,permission_id) DO NOTHING`
        );
      },
    },
    {
      key: "0036_onekiosk_runtime_schema",
      version: "36",
      name: "Ensure OneKiosk runtime device schema exists on upgraded databases",
      up: async client => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS kiosk_devices (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
            device_key VARCHAR(120) NOT NULL,
            name VARCHAR(150) NOT NULL,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            workflow_id UUID,
            payment_terminal_id UUID REFERENCES payment_terminals(id) ON DELETE SET NULL,
            payment_connector_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
            printer_connector_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
            printer_hardware_id UUID REFERENCES hardware_devices(id) ON DELETE SET NULL,
            printer_name VARCHAR(150),
            printer_connection_type VARCHAR(50),
            printer_connection_address VARCHAR(500),
            printer_paper_width VARCHAR(20) NOT NULL DEFAULT '80mm',
            printer_required BOOLEAN NOT NULL DEFAULT FALSE,
            payment_required BOOLEAN NOT NULL DEFAULT TRUE,
            internet_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
            server_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
            payment_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
            printer_status VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
            last_heartbeat_at TIMESTAMPTZ,
            last_health_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            assistance_requested_at TIMESTAMPTZ,
            assistance_note VARCHAR(300),
            age_approval_requested_at TIMESTAMPTZ,
            age_approved_until TIMESTAMPTZ,
            age_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, device_key)
          );
          CREATE INDEX IF NOT EXISTS idx_kiosk_devices_store ON kiosk_devices(company_id,store_id,active);
        `);
      },
    },
    {
      key: "0037_workstation_hardware_assignments",
      version: "37",
      name: "Scope configured hardware and payment terminals to a workstation device key",
      up: async client => {
        await client.query(`
          ALTER TABLE hardware_devices
            ADD COLUMN IF NOT EXISTS device_key VARCHAR(120) NOT NULL DEFAULT 'legacy-unassigned';
          ALTER TABLE payment_terminals
            ADD COLUMN IF NOT EXISTS device_key VARCHAR(120) NOT NULL DEFAULT 'legacy-unassigned';
          ALTER TABLE hardware_devices
            DROP CONSTRAINT IF EXISTS hardware_devices_company_id_store_id_device_type_key;
          DROP INDEX IF EXISTS hardware_devices_company_id_store_id_device_type_key;
          CREATE UNIQUE INDEX IF NOT EXISTS uq_hardware_devices_device
            ON hardware_devices(company_id, store_id, device_key, device_type);
          CREATE INDEX IF NOT EXISTS idx_payment_terminals_device
            ON payment_terminals(company_id, store_id, device_key, active);
        `);
      },
    },
    {
      key: "0101_backfill_whatsapp_communication_events",
      version: "101",
      name: "Backfill WhatsApp messages into Communication Events",
      up: async client => {
        await client.query(`
          INSERT INTO platform_communication_events
            (company_id,channel,event_type,direction,provider,provider_message_id,sender,communication_id,metadata,created_at)
          SELECT
            wm.company_id,
            'WHATSAPP',
            'communication.message_received',
            'INBOUND',
            'whatsapp',
            wm.provider_message_id,
            wc.customer_phone,
            wm.id,
            jsonb_build_object(
              'conversationId', wm.conversation_id,
              'customerId', wc.customer_id,
              'messageType', wm.message_type,
              'backfilled', true
            ),
            COALESCE(wm.occurred_at, wm.created_at, NOW())
          FROM whatsapp_messages wm
          LEFT JOIN whatsapp_conversations wc
            ON wc.id=wm.conversation_id AND wc.company_id=wm.company_id
          WHERE UPPER(COALESCE(wm.direction,''))='INBOUND'
            AND NOT EXISTS (
              SELECT 1
              FROM platform_communication_events ce
              WHERE ce.company_id=wm.company_id
                AND ce.channel='WHATSAPP'
                AND ce.event_type='communication.message_received'
                AND (
                  ce.communication_id=wm.id
                  OR (
                    wm.provider_message_id IS NOT NULL
                    AND ce.provider_message_id=wm.provider_message_id
                  )
                )
            )
        `);
        console.log("onePOS: existing WhatsApp inbound messages backfilled into Communication Events");
      },
    },

    {
      key: "0102_add_communication_event_body",
      version: "102",
      name: "Add first-class Communication Event message body",
      up: async client => {
        await client.query(`
          ALTER TABLE platform_communication_events
            ADD COLUMN IF NOT EXISTS body TEXT;

          UPDATE platform_communication_events ce
             SET body=COALESCE(
               NULLIF(ce.body,''),
               NULLIF(ce.metadata->>'body',''),
               NULLIF(ce.metadata->>'text','')
             )
           WHERE ce.body IS NULL OR ce.body='';

          UPDATE platform_communication_events ce
             SET body=wm.body
            FROM whatsapp_messages wm
           WHERE (ce.body IS NULL OR ce.body='')
             AND ce.company_id=wm.company_id
             AND ce.channel='WHATSAPP'
             AND (
               ce.communication_id=wm.id
               OR (
                 ce.provider_message_id IS NOT NULL
                 AND ce.provider_message_id=wm.provider_message_id
               )
             )
             AND wm.body IS NOT NULL;

          INSERT INTO platform_fields
            (object_id,company_id,api_name,label,field_type,source_column,required,readable,writable,
             options,config,display_order,active,source_package_id,source_package_version,managed,package_required)
          SELECT
            o.id,NULL,'body','Message','text','body',FALSE,TRUE,FALSE,
            '[]'::jsonb,
            jsonb_build_object('packageContract','default','packageOwned',TRUE,'packageId',p.id),
            45,TRUE,p.id,p.version,TRUE,FALSE
          FROM platform_objects o
          JOIN package_registry p ON p.package_key='communication_core'
          WHERE o.object_key='communication_event'
            AND o.company_id IS NULL
          ON CONFLICT (object_id,api_name) WHERE company_id IS NULL
          DO UPDATE SET
            label='Message',
            field_type='text',
            source_column='body',
            readable=TRUE,
            writable=FALSE,
            display_order=45,
            active=TRUE,
            source_package_id=EXCLUDED.source_package_id,
            source_package_version=EXCLUDED.source_package_version,
            managed=TRUE;

          UPDATE platform_list_views v
             SET columns='["channel","event_type","direction","provider","body","recipient","created_at"]'::jsonb,
                 updated_at=NOW()
            FROM platform_objects o
           WHERE v.object_id=o.id
             AND o.object_key='communication_event'
             AND v.view_key='recent_communication_events'
             AND COALESCE(v.user_modified,FALSE)=FALSE;
        `);
        console.log("onePOS: Communication Event message body field ready");
      },
    },

    {
      key: "0038_report_analytics_foundation",
      version: "38",
      name: "Advanced report and dashboard analytics foundation",
      up: async client => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS custom_report_types (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type_key VARCHAR(100) NOT NULL,
            label VARCHAR(150) NOT NULL,
            description VARCHAR(500),
            primary_object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE RESTRICT,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, type_key)
          );
          CREATE INDEX IF NOT EXISTS idx_custom_report_types_company_active
            ON custom_report_types(company_id, active, lower(label));
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conrelid='custom_report_types'::regclass
                AND conname='custom_report_types_primary_object_fk'
            ) THEN
              ALTER TABLE custom_report_types
                ADD CONSTRAINT custom_report_types_primary_object_fk
                FOREIGN KEY (primary_object_id) REFERENCES platform_objects(id) ON DELETE RESTRICT;
            END IF;
          END $$;

          ALTER TABLE custom_reports
            ADD COLUMN IF NOT EXISTS report_type_id UUID REFERENCES custom_report_types(id) ON DELETE SET NULL;

          CREATE TABLE IF NOT EXISTS report_folders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(150) NOT NULL,
            description VARCHAR(500),
            visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE','SHARED')),
            access JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(company_id, name)
          );
          CREATE INDEX IF NOT EXISTS idx_report_folders_company ON report_folders(company_id, lower(name));
          ALTER TABLE custom_reports
            ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES report_folders(id) ON DELETE SET NULL;

          CREATE TABLE IF NOT EXISTS report_user_preferences (
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
            favourite BOOLEAN NOT NULL DEFAULT FALSE,
            last_viewed_at TIMESTAMPTZ,
            view_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, report_id)
          );
          CREATE INDEX IF NOT EXISTS idx_report_user_preferences_recent
            ON report_user_preferences(user_id, last_viewed_at DESC);
          CREATE INDEX IF NOT EXISTS idx_report_user_preferences_favourite
            ON report_user_preferences(user_id, favourite, last_viewed_at DESC);

          CREATE TABLE IF NOT EXISTS report_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            last_run_at TIMESTAMPTZ,
            last_delivery_at TIMESTAMPTZ,
            last_status VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_report_subscriptions_due
            ON report_subscriptions(company_id, active, updated_at);

          CREATE TABLE IF NOT EXISTS report_subscription_deliveries (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
              subscription_id UUID NOT NULL REFERENCES report_subscriptions(id) ON DELETE CASCADE,
              occurrence_key VARCHAR(80) NOT NULL,
              recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP','EMAIL')),
              status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
              last_error VARCHAR(1000),
              delivered_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              UNIQUE(subscription_id, occurrence_key, recipient_user_id, channel)
          );
          CREATE INDEX IF NOT EXISTS idx_report_subscription_deliveries_status
          ON report_subscription_deliveries(company_id, status, updated_at);
          
                    CREATE TABLE IF NOT EXISTS dashboard_subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            last_run_at TIMESTAMPTZ,
            last_delivery_at TIMESTAMPTZ,
            last_status VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_dashboard_subscriptions_due
            ON dashboard_subscriptions(company_id,active,updated_at);

          CREATE TABLE IF NOT EXISTS dashboard_subscription_deliveries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            subscription_id UUID NOT NULL REFERENCES dashboard_subscriptions(id) ON DELETE CASCADE,
            occurrence_key VARCHAR(80) NOT NULL,
            recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            last_error VARCHAR(1000),
            delivered_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(subscription_id,occurrence_key,recipient_user_id)
          );
          CREATE INDEX IF NOT EXISTS idx_dashboard_subscription_deliveries_status
            ON dashboard_subscription_deliveries(company_id,status,updated_at);

          CREATE TABLE IF NOT EXISTS report_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
            captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            period_key VARCHAR(80),
            summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            row_count INTEGER NOT NULL DEFAULT 0
          );
          CREATE INDEX IF NOT EXISTS idx_report_snapshots_report_time
            ON report_snapshots(report_id, captured_at DESC);

          ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS global_filters JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS responsive_layouts JSONB NOT NULL DEFAULT '{"desktop":[],"tablet":[],"mobile":[]}'::jsonb;
          ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS run_as_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

          CREATE TABLE IF NOT EXISTS dashboard_user_state (
            dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            filter_values JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (dashboard_id, user_id)
          );
        `);
      },
    },
    {
      key: "0040_product_availability_context",
      version: "40",
      name: "Product availability related records and contextual price lists",
      up: async client => {
        await client.query(`
          CREATE TABLE IF NOT EXISTS product_availability (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            scope_object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
            scope_record_id UUID,
            store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
            channel VARCHAR(50) NOT NULL DEFAULT 'till',
            price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_product_availability_product
            ON product_availability(company_id, product_id, active);

          CREATE INDEX IF NOT EXISTS idx_product_availability_scope
            ON product_availability(company_id, scope_object_id, scope_record_id, store_id, channel, active);

          CREATE UNIQUE INDEX IF NOT EXISTS uq_product_availability_division_channel
            ON product_availability(
              company_id,
              product_id,
              COALESCE(scope_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
              COALESCE(scope_record_id, '00000000-0000-0000-0000-000000000000'::uuid),
              channel
            )
            WHERE store_id IS NULL;

          CREATE UNIQUE INDEX IF NOT EXISTS uq_product_availability_store_channel
            ON product_availability(
              company_id,
              product_id,
              COALESCE(scope_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
              COALESCE(scope_record_id, '00000000-0000-0000-0000-000000000000'::uuid),
              store_id,
              channel
            )
            WHERE store_id IS NOT NULL;
        `);
      },
    }
,
    {
      key: "0044_replace_persisted_hidden_appointment_flows",
      version: "44",
      name: "Replace persisted hidden appointment conversation workflows in place",
      up: async client => {
        const oneAssistant = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
        const router = oneAssistant?.manifest?.workflows?.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
        if (!router?.action?.actions?.length) throw new Error("OneAssistant booking router definition is unavailable");

        const hiddenRows = await client.query(
          `SELECT id,company_id,name,action
             FROM platform_rules
            WHERE company_id IS NOT NULL
              AND (
                action::text LIKE '%PROCESS_APPOINTMENT_CONVERSATION%'
                OR action::text LIKE '%PROCESS_APPOINTMENT_DATE_RESPONSE%'
                OR action::text LIKE '%PROCESS_APPOINTMENT_SLOT_RESPONSE%'
                OR action::text LIKE '%SEND_APPOINTMENT_CONVERSATION_REPLY%'
              )`
        );

        for (const row of hiddenRows.rows) {
          const objectResult = await client.query(
            `SELECT id FROM platform_objects
              WHERE object_key='communication_event' AND active=TRUE
                AND (company_id=$1 OR company_id IS NULL)
              ORDER BY CASE WHEN company_id=$1 THEN 0 ELSE 1 END,id LIMIT 1`,
            [row.company_id]
          );
          const objectId = objectResult.rows[0]?.id || null;
          await client.query(
            `UPDATE platform_rules
                SET object_id=COALESCE($2,object_id),
                    trigger_key=$3,conditions=$4::jsonb,action=$5::jsonb,
                    active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
              WHERE id=$1 AND company_id=$6`,
            [row.id,objectId,router.triggerKey,JSON.stringify(router.conditions || []),
             JSON.stringify(router.action),row.company_id]
          );
        }

        const remaining = await client.query(
          `SELECT COUNT(*)::int AS count FROM platform_rules
            WHERE company_id IS NOT NULL
              AND (
                action::text LIKE '%PROCESS_APPOINTMENT_CONVERSATION%'
                OR action::text LIKE '%PROCESS_APPOINTMENT_DATE_RESPONSE%'
                OR action::text LIKE '%PROCESS_APPOINTMENT_SLOT_RESPONSE%'
                OR action::text LIKE '%SEND_APPOINTMENT_CONVERSATION_REPLY%'
              )`
        );
        if ((remaining.rows[0]?.count || 0) !== 0) {
          throw new Error("Persisted hidden appointment workflow migration did not fully converge");
        }
        console.log(`onePOS: replaced ${hiddenRows.rowCount || 0} persisted hidden appointment workflows in place`);
      },
    }
,
    {
      key: "0045_remove_unused_appointment_action_wrappers",
      version: "45",
      name: "Remove unused appointment action wrappers",
      up: async client => {
        const obsolete = ["APPOINTMENT_SESSION_CONTEXT", "PROCESS_APPOINTMENT_DATE_RESPONSE", "PROCESS_APPOINTMENT_SLOT_RESPONSE", "PROCESS_APPOINTMENT_CONVERSATION", "SEND_APPOINTMENT_CONVERSATION_REPLY", "HOLD_APPOINTMENT_SLOT", "RELEASE_APPOINTMENT_SLOT", "LIST_APPOINTMENT_PAYMENT_PROVIDERS", "CREATE_APPOINTMENT_PAYMENT_REQUEST", "CALCULATE_APPOINTMENT_PAYMENT", "CONFIRM_APPOINTMENT"];
        const systemKeys = obsolete.map((key) => "action:" + key);
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[])",
          [systemKeys]
        );
        const remaining = await client.query(
          "SELECT id,name FROM platform_rules WHERE active=TRUE AND action->>'type'='workflow' AND EXISTS (" +
          "SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]))",
          [obsolete]
        );
        if (remaining.rows.length) {
          throw new Error("Active workflow still references removed appointment wrapper: " + remaining.rows.map((row) => row.name).join(", "));
        }
        console.log("onePOS: unused appointment action wrappers removed");
      },
    },
    {
      key: "0046_refresh_persisted_visible_appointment_graph",
      version: "46",
      name: "Refresh persisted appointment graph with rejoined channel branches",
      up: async client => {
        const oneAssistant = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
        const router = oneAssistant?.manifest?.workflows?.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
        if (!router?.action?.actions?.length) throw new Error("OneAssistant booking router definition is unavailable");
        const rows = await client.query(
          `SELECT id,company_id FROM platform_rules
            WHERE company_id IS NOT NULL
              AND (
                name='OneAssistant - Booking Channel Router'
                OR action::text LIKE '%assistant.booking.router%'
                OR action::text LIKE '%OneAssistant_Booking_Channel_Router%'
              )`
        );
        for (const row of rows.rows) {
          await client.query(
            `UPDATE platform_rules
                SET trigger_key=$2,conditions=$3::jsonb,action=$4::jsonb,
                    active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
              WHERE id=$1 AND company_id=$5`,
            [row.id,router.triggerKey,JSON.stringify(router.conditions || []),JSON.stringify(router.action),row.company_id]
          );
        }
        console.log(`onePOS: refreshed ${rows.rowCount || 0} persisted visible appointment workflow graphs`);
      },
    }
,
    {
      key: "0047_replace_hidden_slot_search_with_generic_flow",
      version: "47",
      name: "Replace hidden appointment slot search with generic Flow primitives",
      up: async client => {
        const oneAssistant = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
        const router = oneAssistant?.manifest?.workflows?.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
        if (!router?.action?.actions?.length) throw new Error("OneAssistant booking router definition is unavailable");
        const keys = router.action.actions.map((action) => action.key);
        if (keys.includes("FIND_APPOINTMENT_SLOTS")) throw new Error("Booking router still contains hidden slot-search action");
        for (const required of ["TIME_WINDOW_EXPAND","COLLECTION_EXCLUDE_OVERLAPS","COLLECTION_FORMAT_TEXT","GET_RECORDS","ASSIGNMENT","COLLECTION_SORT"]) {
          if (!keys.includes(required)) throw new Error("Booking router is missing generic slot primitive " + required);
        }
        const rows = await client.query(
          "SELECT id,company_id FROM platform_rules WHERE company_id IS NOT NULL AND (name='OneAssistant - Booking Channel Router' OR action::text LIKE '%assistant.booking.router%' OR action::text LIKE '%OneAssistant_Booking_Channel_Router%')"
        );
        for (const row of rows.rows) {
          await client.query(
            "UPDATE platform_rules SET trigger_key=$2,conditions=$3::jsonb,action=$4::jsonb,active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW() WHERE id=$1 AND company_id=$5",
            [row.id,router.triggerKey,JSON.stringify(router.conditions || []),JSON.stringify(router.action),row.company_id]
          );
        }
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'='action:FIND_APPOINTMENT_SLOTS' AND COALESCE(user_modified,FALSE)=FALSE"
        );
        console.log("onePOS: refreshed " + (rows.rowCount || 0) + " booking routers with generic slot Flow");
      },
    },
    {
      key: "0051_unify_send_communication",
      version: "51",
      name: "Unify workflow communication actions and add in-app channel",
      up: async client => {
        await client.query(
          "ALTER TABLE platform_communication_events DROP CONSTRAINT IF EXISTS platform_communication_events_channel_check"
        );
        await client.query(
          "ALTER TABLE platform_communication_events ADD CONSTRAINT platform_communication_events_channel_check CHECK (channel IN ('EMAIL','SMS','WHATSAPP','IN_APP'))"
        );

        await client.query(
          "UPDATE platform_rules SET action=replace(action::text,'\"SEND_APPOINTMENT_MESSAGE\"','\"SEND_COMMUNICATION\"')::jsonb,updated_at=NOW() WHERE action::text LIKE '%SEND_APPOINTMENT_MESSAGE%'"
        );

        const oneAssistant = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
        const router = oneAssistant?.manifest?.workflows?.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
        if (!router?.action?.actions?.length) throw new Error("OneAssistant booking router definition is unavailable");
        if (router.action.actions.some((action) => action.key === "SEND_APPOINTMENT_MESSAGE")) {
          throw new Error("OneAssistant booking router still contains SEND_APPOINTMENT_MESSAGE");
        }
        if (!router.action.actions.some((action) => action.key === "SEND_COMMUNICATION")) {
          throw new Error("OneAssistant booking router is missing SEND_COMMUNICATION");
        }

        const rows = await client.query(
          "SELECT id,company_id FROM platform_rules WHERE company_id IS NOT NULL AND (name='OneAssistant - Booking Channel Router' OR action::text LIKE '%assistant.booking.router%' OR action::text LIKE '%OneAssistant_Booking_Channel_Router%')"
        );
        for (const row of rows.rows) {
          await client.query(
            "UPDATE platform_rules SET trigger_key=$2,conditions=$3::jsonb,action=$4::jsonb,active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW() WHERE id=$1 AND company_id=$5",
            [row.id,router.triggerKey,JSON.stringify(router.conditions || []),JSON.stringify(router.action),row.company_id]
          );
        }

        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'='action:SEND_APPOINTMENT_MESSAGE' AND COALESCE(user_modified,FALSE)=FALSE"
        );

        const remaining = await client.query(
          "SELECT COUNT(*)::int AS count FROM platform_rules WHERE action::text LIKE '%SEND_APPOINTMENT_MESSAGE%'"
        );
        if ((remaining.rows[0]?.count || 0) !== 0) {
          throw new Error("Persisted SEND_APPOINTMENT_MESSAGE references remain after migration");
        }
        console.log("onePOS: unified appointment communication under SEND_COMMUNICATION");
      },
    }
,
    {
      key: "0052_migrate_legacy_communication_steps",
      version: "52",
      name: "Migrate legacy communication steps to Send Communication",
      up: async client => {
        await client.query(
          "ALTER TABLE platform_message_templates DROP CONSTRAINT IF EXISTS platform_message_templates_channel_check"
        );
        await client.query(
          "ALTER TABLE platform_message_templates ADD CONSTRAINT platform_message_templates_channel_check CHECK (channel IN ('EMAIL','SMS','WHATSAPP','IN_APP'))"
        );

        const legacyChannels = {
          SEND_EMAIL: "EMAIL",
          SEND_SMS: "SMS",
          SEND_WHATSAPP: "WHATSAPP",
          IN_APP_NOTIFICATION: "IN_APP",
          SEND_IN_APP_NOTIFICATION: "IN_APP",
        };
        const migrateNode = (value) => {
          if (Array.isArray(value)) return value.map(migrateNode);
          if (!value || typeof value !== "object") return value;
          const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, migrateNode(item)]));
          const raw = String(next.key || next.type || "").toUpperCase();
          const channel = legacyChannels[raw];
          if (channel) {
            if (String(next.key || "").toUpperCase() === raw) next.key = "SEND_COMMUNICATION";
            if (String(next.type || "").toUpperCase() === raw) next.type = "SEND_COMMUNICATION";
            if (!next.channel) next.channel = channel;
          }
          return next;
        };

        const rows = await client.query(
          "SELECT id,action FROM platform_rules WHERE action::text ~ 'SEND_EMAIL|SEND_SMS|SEND_WHATSAPP|IN_APP_NOTIFICATION|SEND_IN_APP_NOTIFICATION'"
        );
        for (const row of rows.rows) {
          const migrated = migrateNode(row.action);
          await client.query(
            "UPDATE platform_rules SET action=$1::jsonb,updated_at=NOW() WHERE id=$2",
            [JSON.stringify(migrated), row.id]
          );
        }

        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[]) AND COALESCE(user_modified,FALSE)=FALSE",
          [[
            "action:SEND_EMAIL",
            "action:SEND_SMS",
            "action:SEND_WHATSAPP",
            "action:IN_APP_NOTIFICATION",
            "action:SEND_IN_APP_NOTIFICATION"
          ]]
        );
        console.log("onePOS: legacy communication workflow steps migrated to SEND_COMMUNICATION");
      },
    },
    {
      key: "0053_remove_unused_appointment_confirmation_wrapper",
      version: "53",
      name: "Remove unused appointment confirmation wrapper",
      up: async client => {
        const custom = await client.query(
          "SELECT id,name FROM platform_rules WHERE COALESCE(action->>'systemGenerated','false')<>'true' AND action::text LIKE '%SEND_APPOINTMENT_CONFIRMATION%'"
        );
        if (custom.rows.length) {
          throw new Error("Custom workflow still references SEND_APPOINTMENT_CONFIRMATION: " + custom.rows.map((row) => row.name || row.id).join(", "));
        }
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'='action:SEND_APPOINTMENT_CONFIRMATION' AND COALESCE(user_modified,FALSE)=FALSE"
        );
        console.log("onePOS: unused SEND_APPOINTMENT_CONFIRMATION wrapper removed");
      },
    },
    {
      key: "0054_remove_inactive_booking_link_wrappers",
      version: "54",
      name: "Remove inactive appointment booking case and link wrappers",
      up: async client => {
        const legacy = ["CREATE_APPOINTMENT_BOOKING_CASE","ISSUE_APPOINTMENT_BOOKING_LINK"];
        const active = await client.query(
          "SELECT id,name FROM platform_rules WHERE active=TRUE AND COALESCE(action->>'systemGenerated','false')<>'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        if (active.rows.length) {
          throw new Error("Active workflow still references removed booking wrappers: " + active.rows.map((row) => row.name || row.id).join(", "));
        }
        await client.query(
          "DELETE FROM platform_rules WHERE active=FALSE AND COALESCE(action->>'systemGenerated','false')<>'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[]) AND COALESCE(user_modified,FALSE)=FALSE",
          [["action:CREATE_APPOINTMENT_BOOKING_CASE","action:ISSUE_APPOINTMENT_BOOKING_LINK"]]
        );
        console.log("onePOS: inactive legacy booking case/link flows and wrappers removed");
      },
    },
    {
      key: "0055_remove_final_appointment_wrappers",
      version: "55",
      name: "Remove final appointment-specific workflow wrappers",
      up: async client => {
        const legacy = ["RUN_ASSISTANT_SUBFLOW","COMPLETE_APPOINTMENT_PAYMENT"];
        const active = await client.query(
          "SELECT id,name FROM platform_rules WHERE active=TRUE AND COALESCE(action->>'systemGenerated','false')<>'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        if (active.rows.length) {
          throw new Error("Active workflow still references removed appointment wrappers: " + active.rows.map((row) => row.name || row.id).join(", "));
        }
        await client.query(
          "DELETE FROM platform_rules WHERE active=FALSE AND COALESCE(action->>'systemGenerated','false')<>'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[]) AND COALESCE(user_modified,FALSE)=FALSE",
          [["action:RUN_ASSISTANT_SUBFLOW","action:COMPLETE_APPOINTMENT_PAYMENT"]]
        );
        const remaining = await client.query(
          "SELECT id,name,active FROM platform_rules WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        if (remaining.rows.length) {
          throw new Error("Appointment wrapper references remain after cleanup: " + remaining.rows.map((row) => row.name || row.id).join(", "));
        }
        console.log("onePOS: final appointment-specific workflow wrappers removed");
      },
    },
    {
      key: "0056_remove_unused_domain_wrappers",
      version: "56",
      name: "Remove unused domain-specific workflow wrappers",
      up: async client => {
        const legacy = [
          "PAYMENT_REFUND","INVENTORY_ACTION","RECONCILE_INVENTORY","REBUILD_INVENTORY",
          "POST_CREDIT_PAYMENT","FREEZE_CREDIT_ACCOUNT","UNFREEZE_CREDIT_ACCOUNT","SEND_CREDIT_STATEMENT",
          "PUBLISH_TO_WEB_SHOP","UNPUBLISH_FROM_WEB_SHOP","UPDATE_WEB_LISTING","SET_WEB_FEATURED"
        ];
        const custom = await client.query(
          "SELECT id,name,active FROM platform_rules WHERE COALESCE(action->>'systemGenerated','false')<>'true' AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(action->'actions','[]'::jsonb)) step WHERE step->>'key'=ANY($1::text[]) OR step->>'type'=ANY($1::text[]))",
          [legacy]
        );
        if (custom.rows.length) {
          throw new Error("Custom workflow references removed domain wrappers: " + custom.rows.map((row) => row.name || row.id).join(", "));
        }
        await client.query(
          "DELETE FROM platform_rules WHERE action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[]) AND COALESCE(user_modified,FALSE)=FALSE",
          [legacy.map((key) => "action:" + key)]
        );
        console.log("onePOS: unused domain-specific workflow wrappers removed");
      },
    },
    {
      key: "0062_oneassistant_single_event_router",
      version: "62",
      name: "Keep exactly one OneAssistant communication event router per tenant",
      up: async client => {
        const oneAssistant = packageDefinitions().find((definition) => definition.packageKey === "one_assistant");
        const router = oneAssistant?.manifest?.workflows?.find((workflow) => workflow.name === "OneAssistant - Booking Channel Router");
        if (!router?.action?.actions?.length) throw new Error("OneAssistant booking router definition is unavailable");

        const candidates = await client.query(
          `SELECT id,company_id,name,action,created_at,updated_at
             FROM platform_rules
            WHERE company_id IS NOT NULL
              AND trigger_key='communication_message_received'
              AND action->>'type'='workflow'
              AND (
                action->>'apiName'='OneAssistant_Booking_Channel_Router'
                OR name IN (
                  'OneAssistant - Booking Channel Router',
                  'OneAssistant - SMS Booking',
                  'OneAssistant - WhatsApp Booking',
                  'System · Action · Appointments - Process Conversation',
                  'System · Action · Appointments - Send Conversation Reply',
                  'System · Action · Appointments - Process Date Response',
                  'System · Action · Appointments - Process Slot Response'
                )
              )
            ORDER BY company_id,
                     CASE WHEN name='OneAssistant - Booking Channel Router' THEN 0 ELSE 1 END,
                     updated_at DESC,created_at DESC,id`
        );

        const byCompany = new Map();
        for (const row of candidates.rows) {
          if (!byCompany.has(row.company_id)) byCompany.set(row.company_id, []);
          byCompany.get(row.company_id).push(row);
        }

        let deactivated = 0;
        let canonicalCount = 0;
        for (const [companyId, rows] of byCompany.entries()) {
          const canonical = rows.find((row) => row.name === "OneAssistant - Booking Channel Router") || rows[0];
          if (!canonical) continue;

          const disabled = await client.query(
            `UPDATE platform_rules
                SET active=FALSE,lifecycle_status='INACTIVE',updated_at=NOW()
              WHERE company_id=$1
                AND id<>$2
                AND trigger_key='communication_message_received'
                AND action->>'type'='workflow'
                AND (
                  action->>'apiName'='OneAssistant_Booking_Channel_Router'
                  OR name IN (
                    'OneAssistant - SMS Booking',
                    'OneAssistant - WhatsApp Booking',
                    'System · Action · Appointments - Process Conversation',
                    'System · Action · Appointments - Send Conversation Reply',
                    'System · Action · Appointments - Process Date Response',
                    'System · Action · Appointments - Process Slot Response'
                  )
                )`,
            [companyId, canonical.id]
          );
          deactivated += disabled.rowCount || 0;

          await client.query(
            `UPDATE platform_rules
                SET name='OneAssistant - Booking Channel Router',
                    trigger_key=$1,
                    conditions=$2::jsonb,
                    action=$3::jsonb,
                    active=TRUE,
                    lifecycle_status='ACTIVE',
                    updated_at=NOW()
              WHERE id=$4 AND company_id=$5`,
            [router.triggerKey, JSON.stringify(router.conditions || []), JSON.stringify(router.action), canonical.id, companyId]
          );
          canonicalCount += 1;
        }

        const expired = await client.query(
          `UPDATE appointment_booking_cases
              SET status='EXPIRED',
                  state=COALESCE(state,'{}'::jsonb)||'{"step":"EXPIRED","waitToken":null}'::jsonb,
                  updated_at=NOW()
            WHERE status NOT IN ('CONFIRMED','CANCELLED','EXPIRED')
            RETURNING id`
        );

        const duplicates = await client.query(
          `SELECT company_id,COUNT(*)::int count
             FROM platform_rules
            WHERE active=TRUE
              AND COALESCE(lifecycle_status,'ACTIVE')='ACTIVE'
              AND trigger_key='communication_message_received'
              AND action->>'type'='workflow'
              AND action->>'apiName'='OneAssistant_Booking_Channel_Router'
            GROUP BY company_id
           HAVING COUNT(*)<>1`
        );
        if (duplicates.rows.length) throw new Error("OneAssistant event router dedupe verification failed");

        console.log("onePOS: OneAssistant single event router enforced", {
          tenants: canonicalCount,
          deactivatedRouters: deactivated,
          expiredOpenBookingSessions: expired.rowCount,
        });
      },
    },
    {
      key: "0063_workflow_step_identifier_text",
      version: "63",
      name: "Allow deeply nested workflow execution paths",
      up: async client => {
        await client.query("ALTER TABLE platform_workflow_step_runs ALTER COLUMN step_identifier TYPE TEXT");
        await client.query("ALTER TABLE platform_workflow_screen_sessions ALTER COLUMN step_identifier TYPE TEXT");
        console.log("onePOS: workflow step identifiers widened for nested Flow execution");
      },
    },
    {
      key: "0064_oneassistant_event_trigger_registration",
      version: "64",
      name: "Register provider-neutral inbound communication event trigger",
      up: async client => {
        await client.query(`
          INSERT INTO platform_event_types(event_type,description,active)
          VALUES ('communication_message_received','Provider-neutral inbound communication received',TRUE)
          ON CONFLICT(event_type) DO UPDATE SET active=TRUE,description=EXCLUDED.description
        `);
        console.log("onePOS: OneAssistant communication event trigger registered");
      },
    },
    {
      key: "0065_remove_legacy_duplicate_workflow_wrappers",
      version: "65",
      name: "Remove six stale generated workflow duplicates",
      up: async client => {
        const staleSystemKeys = [
          "function:purchase.create",
          "function:purchase.receive",
          "function:supplier.return.execute",
          "function:supplier.invoice.create",
          "function:supplier.payment.execute",
          "action:ONLINE_ORDER_TRANSITION",
        ];

        const removed = await client.query(
          `DELETE FROM platform_rules
            WHERE action->>'systemGenerated'='true'
              AND (
                (action->>'systemKey') = ANY($1::text[])
                OR (
                  action->>'capabilityType'='function'
                  AND (action->>'capabilityKey') = ANY($2::text[])
                )
                OR (
                  action->>'capabilityType'='action'
                  AND action->>'capabilityKey'='ONLINE_ORDER_TRANSITION'
                )
              )
            RETURNING id,name,company_id,action->>'systemKey' AS system_key`,
          [
            staleSystemKeys,
            [
              "purchase.create",
              "purchase.receive",
              "supplier.return.execute",
              "supplier.invoice.create",
              "supplier.payment.execute",
            ],
          ]
        );

        const remaining = await client.query(
          `SELECT id,name,company_id,action->>'systemKey' AS system_key
             FROM platform_rules
            WHERE action->>'systemGenerated'='true'
              AND (
                (action->>'systemKey') = ANY($1::text[])
                OR (
                  action->>'capabilityType'='function'
                  AND (action->>'capabilityKey') = ANY($2::text[])
                )
                OR (
                  action->>'capabilityType'='action'
                  AND action->>'capabilityKey'='ONLINE_ORDER_TRANSITION'
                )
              )`,
          [
            staleSystemKeys,
            [
              "purchase.create",
              "purchase.receive",
              "supplier.return.execute",
              "supplier.invoice.create",
              "supplier.payment.execute",
            ],
          ]
        );
        if (remaining.rows.length) throw new Error("Legacy duplicate workflow wrapper cleanup verification failed");

        console.log("onePOS: removed stale generated workflow duplicates", {
          removed: removed.rowCount,
          expectedSets: 6,
        });
      },
    },
    {
      key: "0066_remove_system_action_job_workflow_wrappers",
      version: "66",
      name: "Remove generated action and job pseudo-workflows",
      up: async client => {
        const removed = await client.query(
          `DELETE FROM platform_rules
            WHERE action->>'systemGenerated'='true'
              AND (
                action->>'systemKey' LIKE 'action:%'
                OR action->>'systemKey' LIKE 'job:%'
                OR action->>'capabilityType' IN ('action','job')
              )
            RETURNING id,name,company_id,action->>'systemKey' AS system_key`
        );
        const remaining = await client.query(
          `SELECT id,name,company_id,action->>'systemKey' AS system_key
             FROM platform_rules
            WHERE action->>'systemGenerated'='true'
              AND (
                action->>'systemKey' LIKE 'action:%'
                OR action->>'systemKey' LIKE 'job:%'
                OR action->>'capabilityType' IN ('action','job')
              )`
        );
        if (remaining.rows.length) throw new Error("Generated action/job pseudo-workflow cleanup verification failed");
        console.log("onePOS: removed generated action/job pseudo-workflows", { removed: removed.rowCount });
      },
    },
    {
      key: "0067_remove_residual_duplicate_runtime_workflows",
      version: "67",
      name: "Remove residual duplicate runtime workflows",
      up: async client => {
        const retiredSystemKeys = [
          "flow:online_order.transition",
          "flow:supplier.invoice.create",
          "flow:supplier.payment.create",
          "flow:purchase.create",
          "flow:purchase.receive",
          "flow:supplier.return.execute",
        ];
        const removedGenerated = await client.query(
          `DELETE FROM platform_rules
            WHERE COALESCE(user_modified,FALSE)=FALSE
              AND action->>'systemGenerated'='true'
              AND action->>'systemKey'=ANY($1::text[])
            RETURNING id,name,company_id,action->>'systemKey' AS system_key`,
          [retiredSystemKeys]
        );
        const removedLegacyLicence = await client.query(
          `DELETE FROM platform_rules
            WHERE COALESCE(user_modified,FALSE)=FALSE
              AND name='Licence Request Created'
              AND trigger_key='licence_request_created'
            RETURNING id,name,company_id`
        );
        const remaining = await client.query(
          `SELECT id,name,company_id,action->>'systemKey' AS system_key
             FROM platform_rules
            WHERE COALESCE(user_modified,FALSE)=FALSE
              AND (
                (action->>'systemGenerated'='true' AND action->>'systemKey'=ANY($1::text[]))
                OR (name='Licence Request Created' AND trigger_key='licence_request_created')
              )`,
          [retiredSystemKeys]
        );
        if (remaining.rows.length) throw new Error("Residual duplicate runtime workflow cleanup verification failed");
        console.log("onePOS: removed residual duplicate runtime workflows", {
          generated: removedGenerated.rowCount,
          legacyLicence: removedLegacyLicence.rowCount,
        });
      },
    },
    {
      key: "0068_generalize_record_image_component_key",
      version: "68",
      name: "Generalize legacy record image component metadata",
      up: async client => {
        await client.query(`
          UPDATE platform_pages
             SET definition = replace(definition::text, '"product_image_card"', '"image_record_card"')::jsonb,
                 draft_definition = CASE
                   WHEN draft_definition IS NULL THEN NULL
                   ELSE replace(draft_definition::text, '"product_image_card"', '"image_record_card"')::jsonb
                 END,
                 updated_at = NOW()
           WHERE definition::text LIKE '%"product_image_card"%'
              OR draft_definition::text LIKE '%"product_image_card"%'
        `);
      },
    },
    ]);

  if (bootstrapSuperadmin) await bootstrapInitialSuperadmin(pool, env);
  console.log("onePOS: database ready");
}

export { ONEENGINE_MANAGE_PERMISSION } from "./rbacBootstrap.js";
import { bootstrapInitialSuperadmin as canonicalBootstrapInitialSuperadmin } from "./rbacBootstrap.js";

/** @deprecated Global identities are forbidden; retained only for source compatibility. */
export async function ensureGlobalSystemProfile(pool) {
  const result = await pool.query(`SELECT id FROM roles WHERE company_id IS NOT NULL AND api_key='platform_superadmin' ORDER BY created_at,id LIMIT 1`);
  if (!result.rows[0]?.id) throw new Error("Company-bound Superadmin role is not initialized");
  return result.rows[0].id;
}

export async function bootstrapInitialSuperadmin(pool, env = process.env) {
  return canonicalBootstrapInitialSuperadmin(pool, env);
}
