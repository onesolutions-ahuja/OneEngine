import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { runMigrations } from "./migrations.js";
import { ensureReleaseTablesSql } from "../services/appReleaseManager.js";
import { backfillLegacyRuleFieldReferences } from "../services/platformRuleReferences.js";
import { oneAssistantSchema } from "../services/oneAssistant.js";
import { packageDefinitions } from "../services/packageRegistry.js";

export async function initializeDatabase(pool, { bootstrapSuperadmin = true, env = process.env } = {}) {
  if (!pool) throw new Error("A PostgreSQL connection is required to initialize onePOS");
  console.log("onePOS: checking database...");
  const coreSchema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  const platformFoundation = readFileSync(new URL("./baseFoundation.sql", import.meta.url), "utf8");

  await runMigrations(pool, [
    {
      key: "0001_core_schema",
      version: "1",
      name: "Core database schema",
      up: client => client.query(coreSchema),
    },
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
      key: "0012_oneassistant_foundation",
      version: "12",
      name: "OneAssistant appointment and conversation foundation",
      up: async client => {
        await client.query(oneAssistantSchema);
      },
    },
    {
      key: "0013_oneassistant_channel_subflows",
      version: "13",
      name: "OneAssistant channel subflows and public booking links",
      up: async client => {
        await client.query(oneAssistantSchema);
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
        await client.query("CREATE INDEX IF NOT EXISTS idx_sales_company_store_status_date ON sales(company_id,store_id,status,created_at DESC)");
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
      key: "0021_oneassistant_confirmation_workflow",
      version: "21",
      name: "Seed editable OneAssistant appointment confirmation workflow",
      up: async client => {
        await client.query(`
          INSERT INTO platform_rules
            (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,company_id,created_by)
          SELECT
            NULL,
            'OneAssistant · Appointment Confirmed',
            'appointment.confirmed',
            '[]'::jsonb,
            jsonb_build_object(
              'type','workflow',
              'scope','oneassistant',
              'actions',jsonb_build_array(
                jsonb_build_object(
                  'id','send-confirmation',
                  'type','SEND_APPOINTMENT_CONFIRMATION'
                )
              )
            ),
            TRUE,
            'ACTIVE',
            1,
            c.id,
            NULL
          FROM companies c
          WHERE c.active=TRUE
            AND NOT EXISTS (
              SELECT 1 FROM platform_rules r
               WHERE r.company_id=c.id
                 AND r.trigger_key='appointment.confirmed'
                 AND r.action::text LIKE '%SEND_APPOINTMENT_CONFIRMATION%'
            )
        `);
      },
    },
    {
      key: "0022_verify_oneassistant_confirmation_workflow",
      version: "22",
      name: "Verify editable OneAssistant appointment confirmation workflow",
      up: async client => {
        await client.query(`
          INSERT INTO platform_rules
            (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,company_id,created_by)
          SELECT NULL,'OneAssistant · Appointment Confirmed','appointment.confirmed','[]'::jsonb,
            '{"type":"workflow","scope":"oneassistant","actions":[{"id":"send-confirmation","type":"SEND_APPOINTMENT_CONFIRMATION"}]}'::jsonb,
            TRUE,'ACTIVE',1,c.id,NULL
          FROM companies c
          WHERE c.active=TRUE
            AND NOT EXISTS (
              SELECT 1 FROM platform_rules r
               WHERE r.company_id=c.id
                 AND r.trigger_key='appointment.confirmed'
                 AND r.action::text LIKE '%SEND_APPOINTMENT_CONFIRMATION%'
            )
        `);
        const verified = await client.query(`
          SELECT COUNT(*)::int AS count
          FROM platform_rules
          WHERE trigger_key='appointment.confirmed'
            AND active=TRUE
            AND action::text LIKE '%SEND_APPOINTMENT_CONFIRMATION%'
        `);
        console.log(`onePOS: OneAssistant editable confirmation workflows ready: ${verified.rows[0]?.count || 0}`);
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
            channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP')),
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
            channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP')),
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
      key: "0026_seed_oneassistant_first_booking_defaults",
      version: "26",
      name: "Seed first-booking defaults for configured SMSGate tenants",
      up: async client => {
        const companies = await client.query(`
          SELECT DISTINCT ic.company_id
            FROM integration_connections ic
           WHERE ic.connector_package_key='smsgate_connector'
             AND ic.enabled=TRUE
             AND NOT EXISTS (
               SELECT 1
                 FROM appointment_services s
                WHERE s.company_id=ic.company_id
                  AND s.active=TRUE
             )
        `);

        for (const row of companies.rows) {
          const service = await client.query(
            `INSERT INTO appointment_services
               (company_id,name,description,duration_minutes,price,currency,payment_policy,deposit_value,active,metadata)
             VALUES
               ($1,'General Appointment','Default appointment service created during OneAssistant first-time setup',30,0,'GBP','NO_ADVANCE',0,TRUE,
                '{"autoProvisioned":true,"source":"oneassistant_first_booking"}'::jsonb)
             RETURNING id`,
            [row.company_id]
          );

          const resource = await client.query(
            `INSERT INTO appointment_resources
               (company_id,name,resource_type,timezone,active,metadata)
             VALUES
               ($1,'Default Resource','STAFF','Europe/London',TRUE,
                '{"autoProvisioned":true,"source":"oneassistant_first_booking"}'::jsonb)
             RETURNING id`,
            [row.company_id]
          );

          await client.query(
            `INSERT INTO appointment_resource_services
               (company_id,resource_id,service_id,duration_minutes,active)
             VALUES($1,$2,$3,NULL,TRUE)
             ON CONFLICT(resource_id,service_id) DO UPDATE SET active=TRUE`,
            [row.company_id, resource.rows[0].id, service.rows[0].id]
          );

          for (const weekday of [1,2,3,4,5,6]) {
            await client.query(
              `INSERT INTO appointment_availability_rules
                 (company_id,resource_id,weekday,start_time,end_time,slot_interval_minutes,active)
               VALUES($1,$2,$3,'09:00','17:00',30,TRUE)`,
              [row.company_id, resource.rows[0].id, weekday]
            );
          }
        }

        console.log(`onePOS: OneAssistant first-booking defaults ready for ${companies.rows.length} configured tenant(s)`);
      },
    },

    {
      key: "0027_oneassistant_visible_confirmation_message",
      version: "27",
      name: "Make OneAssistant confirmation text visible and editable",
      up: async client => {
        await client.query(`
          UPDATE platform_rules r
             SET action=jsonb_set(
               r.action,
               '{actions}',
               COALESCE((
                 SELECT jsonb_agg(
                   CASE
                     WHEN item->>'type'='SEND_APPOINTMENT_CONFIRMATION'
                      AND COALESCE(item->>'message','')=''
                     THEN item || jsonb_build_object(
                       'message',
                       'Your {{serviceName}} appointment is booked for {{startsAt}}.'
                     )
                     ELSE item
                   END
                   ORDER BY ord
                 )
                   FROM jsonb_array_elements(COALESCE(r.action->'actions','[]'::jsonb))
                        WITH ORDINALITY AS a(item,ord)
               ), '[]'::jsonb),
               TRUE
             ),
             updated_at=NOW()
           WHERE r.trigger_key='appointment.confirmed'
             AND r.action->>'type'='workflow'
             AND EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(COALESCE(r.action->'actions','[]'::jsonb)) item
                WHERE item->>'type'='SEND_APPOINTMENT_CONFIRMATION'
                  AND COALESCE(item->>'message','')=''
             )
        `);
        const verified = await client.query(`
          SELECT COUNT(*)::int AS count
            FROM platform_rules r
           WHERE r.trigger_key='appointment.confirmed'
             AND EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(COALESCE(r.action->'actions','[]'::jsonb)) item
                WHERE item->>'type'='SEND_APPOINTMENT_CONFIRMATION'
                  AND COALESCE(item->>'message','')<>''
             )
        `);
        console.log(`onePOS: visible OneAssistant confirmation messages ready: ${verified.rows[0]?.count || 0}`);
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
            printer_hardware_id UUID REFERENCES hardware_configurations(id) ON DELETE SET NULL,
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
    }
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

async function initializeLegacyDatabase(pool) {
  console.log("onePOS: applying core compatibility migrations...");

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      legal_name VARCHAR(255),
      email VARCHAR(255),
      phone VARCHAR(50),
      currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
      timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/London',
      logo_url TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS licences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) UNIQUE NOT NULL,
      description TEXT,
      monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
      billing_period VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' CHECK (billing_period IN ('MONTHLY','YEARLY','ONE_TIME')),
      seat_limit INTEGER CHECK (seat_limit IS NULL OR seat_limit >= 0),
      user_limit INTEGER CHECK (user_limit IS NULL OR user_limit >= 0),
      duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
      is_trial BOOLEAN NOT NULL DEFAULT FALSE,
      trial_duration_days INTEGER CHECK (trial_duration_days IS NULL OR trial_duration_days > 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at >= starts_at)
    );
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0);
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20) NOT NULL DEFAULT 'MONTHLY';
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS seat_limit INTEGER;
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS user_limit INTEGER;
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS duration_days INTEGER;
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE licences ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER;
    CREATE TABLE IF NOT EXISTS licence_entitlements (
      licence_id UUID NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
      entitlement_key VARCHAR(100) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      PRIMARY KEY (licence_id, entitlement_key)
    );
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS licence_id UUID REFERENCES licences(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_companies_licence ON companies(licence_id);

    ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
    CREATE TABLE IF NOT EXISTS tenant_database_configs (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      database_mode VARCHAR(30) NOT NULL DEFAULT 'ONEPOS_MANAGED'
        CHECK (database_mode IN ('ONEPOS_MANAGED', 'CUSTOMER_MANAGED')),
      host VARCHAR(255),
      port INTEGER,
      database_name VARCHAR(255),
      username VARCHAR(255),
      password_ciphertext TEXT,
      ssl_mode VARCHAR(30) NOT NULL DEFAULT 'require',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      schema_state VARCHAR(40) NOT NULL DEFAULT 'UNINITIALIZED',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by UUID
    );
    /* Till Misc Item: line type on sale items (existing rows read as PRODUCT). */
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'PRODUCT';
    /* Per-line discount support: type, value, original prices, and actor. */
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20);
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(12,2);
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS original_tax NUMERIC(12,2);
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS original_total NUMERIC(12,2);
    ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discounted_by UUID REFERENCES users(id) ON DELETE SET NULL;
    /* Order-level discount audit trail for any discount applied to a sale. */
    CREATE TABLE IF NOT EXISTS sale_discounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
      item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(20) NOT NULL,
      value NUMERIC(12,2) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sale_discounts_sale ON sale_discounts(sale_id);
    /* Manual price override audit trail (sale.price_change permission). */
    CREATE TABLE IF NOT EXISTS sale_price_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      user_id UUID NOT NULL REFERENCES users(id),
      original_unit_price NUMERIC(12,2) NOT NULL,
      overridden_unit_price NUMERIC(12,2) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sale_price_overrides_sale ON sale_price_overrides(sale_id);
    /* One invisible MISC placeholder product per company (Till Misc Item). */
    CREATE UNIQUE INDEX IF NOT EXISTS uq_products_misc_per_company
      ON products(company_id) WHERE sku = 'MISC' AND active = false;

    CREATE TABLE IF NOT EXISTS stores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      code VARCHAR(50),
      address_line1 VARCHAR(255),
      address_line2 VARCHAR(255),
      city VARCHAR(100),
      postcode VARCHAR(30),
      phone VARCHAR(50),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS terminals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      terminal_number VARCHAR(50),
      device_identifier VARCHAR(255),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      date_format VARCHAR(40) NOT NULL DEFAULT 'DD/MM/YYYY',
      vat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20,
      loyalty_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      loyalty_earning_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0100,
      scan_go_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      product_view VARCHAR(20) NOT NULL DEFAULT 'image',
      dock_quick_access JSONB NOT NULL DEFAULT '["Dashboard", "Sales", "Products", "Inventory", "Customers", "Reports"]'::jsonb,
      customer_display_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      online_ordering_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      online_payment_methods JSONB NOT NULL DEFAULT '["card", "cash", "cod"]'::jsonb,
      client_web_shop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      client_web_shop_slug VARCHAR(100),
      client_web_shop_name VARCHAR(200),
      client_web_shop_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      client_web_shop_price_list_id UUID,
      client_web_shop_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      client_web_shop_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      client_web_shop_own_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      client_web_shop_minimum_order NUMERIC(12,2) NOT NULL DEFAULT 0,
      client_web_shop_delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      client_web_shop_guest_checkout BOOLEAN NOT NULL DEFAULT TRUE,
      client_web_shop_sandbox_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      /* Configurable sale invoice/receipt prefixes per sale source. */
      till_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'TO',
      delivery_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'DEL',
      self_checkout_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'SC',
      receipt_qr_show_after_payment VARCHAR(20) NOT NULL DEFAULT 'OFF',
      receipt_qr_expiry_minutes INTEGER NOT NULL DEFAULT 5,
      receipt_qr_allow_manual BOOLEAN NOT NULL DEFAULT TRUE,
      receipt_qr_allow_regenerate BOOLEAN NOT NULL DEFAULT TRUE,
      receipt_qr_auto_close_on_new_sale BOOLEAN NOT NULL DEFAULT TRUE,
      receipt_qr_show_countdown BOOLEAN NOT NULL DEFAULT TRUE,
      receipt_qr_download_filename_format VARCHAR(200) NOT NULL DEFAULT 'receipt-{receipt_number}.pdf',
      platform_theme VARCHAR(20) NOT NULL DEFAULT 'theme2' CHECK (platform_theme IN ('theme2', 'theme3', 'theme4')),
      updated_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS batch_inventory_mode VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS platform_theme VARCHAR(20) NOT NULL DEFAULT 'theme2';
    UPDATE company_settings SET platform_theme = 'theme2' WHERE platform_theme IS NULL OR platform_theme NOT IN ('theme2', 'theme3', 'theme4');
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS batch_default_mfg_rule VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS batch_default_expiry_rule VARCHAR(20) NOT NULL DEFAULT 'none';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS batch_default_expiry_days INTEGER NOT NULL DEFAULT 365;

    CREATE TABLE IF NOT EXISTS kiosk_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_key VARCHAR(120) NOT NULL,
      name VARCHAR(150) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      payment_terminal_id UUID,
      printer_hardware_id UUID,
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, device_key)
    );
    CREATE INDEX IF NOT EXISTS idx_kiosk_devices_store
      ON kiosk_devices(company_id, store_id, active);
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS workflow_id UUID;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS payment_connector_id UUID;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS printer_connector_id UUID;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS printer_name VARCHAR(150);
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS printer_connection_type VARCHAR(50);
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS printer_connection_address VARCHAR(500);
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS printer_paper_width VARCHAR(20) NOT NULL DEFAULT '80mm';
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS assistance_requested_at TIMESTAMPTZ;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS assistance_note VARCHAR(300);
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS age_approval_requested_at TIMESTAMPTZ;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS age_approved_until TIMESTAMPTZ;
    ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS age_approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS payment_terminals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL,
      name VARCHAR(100) NOT NULL,
      terminal_identifier VARCHAR(255),
      connection_url VARCHAR(500),
      api_credentials TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_test_result VARCHAR(100),
      last_tested_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payment_terminals_company
    ON payment_terminals(company_id, store_id);

    CREATE TABLE IF NOT EXISTS hardware_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      device_type VARCHAR(30) NOT NULL CHECK (
        device_type IN ('BARCODE_SCANNER', 'CASH_DRAWER', 'RECEIPT_PRINTER')
      ),
      device_name VARCHAR(150),
      connection_type VARCHAR(50),
      connection_address VARCHAR(500),
      paper_width VARCHAR(20),
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_test_result VARCHAR(150),
      last_tested_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, store_id, device_type)
    );

    CREATE INDEX IF NOT EXISTS idx_hardware_configurations_store
    ON hardware_configurations(company_id, store_id);
    ALTER TABLE kiosk_devices
      DROP CONSTRAINT IF EXISTS kiosk_devices_payment_terminal_id_fkey;
    ALTER TABLE kiosk_devices
      ADD CONSTRAINT kiosk_devices_payment_terminal_id_fkey
      FOREIGN KEY (payment_terminal_id) REFERENCES payment_terminals(id) ON DELETE SET NULL;
    ALTER TABLE kiosk_devices
      DROP CONSTRAINT IF EXISTS kiosk_devices_printer_hardware_id_fkey;
    ALTER TABLE kiosk_devices
      ADD CONSTRAINT kiosk_devices_printer_hardware_id_fkey
      FOREIGN KEY (printer_hardware_id) REFERENCES hardware_configurations(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS server_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      device_key VARCHAR(120) NOT NULL,
      device_name VARCHAR(150),
      server_url VARCHAR(500),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, device_key)
    );
    CREATE INDEX IF NOT EXISTS idx_server_settings_company ON server_settings(company_id, active);

    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS api_key VARCHAR(100);
    WITH role_keys AS (
      SELECT id,company_id,
        COALESCE(NULLIF(TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(name),'[^a-z0-9]+','_','g')),''),'role') AS base_key,
        ROW_NUMBER() OVER (PARTITION BY company_id,COALESCE(NULLIF(TRIM(BOTH '_' FROM REGEXP_REPLACE(LOWER(name),'[^a-z0-9]+','_','g')),''),'role') ORDER BY id) AS ordinal
      FROM roles WHERE api_key IS NULL
    )
    UPDATE roles r SET api_key=CASE WHEN k.ordinal=1 THEN LEFT(k.base_key,100)
      ELSE LEFT(k.base_key,80)||'_'||LEFT(REPLACE(r.id::text,'-',''),12) END
    FROM role_keys k WHERE r.id=k.id;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_company_api_key ON roles(company_id,api_key) WHERE company_id IS NOT NULL;
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_roles_company_parent ON roles(company_id,parent_role_id);
    ALTER TABLE roles ALTER COLUMN company_id DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );
    ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS id UUID;
    UPDATE role_permissions SET id=gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE role_permissions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE role_permissions ALTER COLUMN id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_role_permissions_id ON role_permissions(id);
    ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
    UPDATE role_permissions rp SET company_id=r.company_id FROM roles r WHERE rp.role_id=r.id AND rp.company_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_role_permissions_company ON role_permissions(company_id);

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(200) NOT NULL,
      email VARCHAR(255),
      pin_hash TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS user_stores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (user_id, store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_stores_store
    ON user_stores(store_id, active);

    CREATE INDEX IF NOT EXISTS idx_user_stores_user
    ON user_stores(user_id, active);

    CREATE TABLE IF NOT EXISTS custom_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      description VARCHAR(500),
      data_source VARCHAR(30) NOT NULL DEFAULT 'sales' CHECK (data_source IN ('sales', 'platform_object')),
      definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_custom_reports_company_active
      ON custom_reports(company_id, archived_at, updated_at DESC);
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='custom_reports'::regclass AND conname='custom_reports_data_source_check') THEN
        ALTER TABLE custom_reports DROP CONSTRAINT custom_reports_data_source_check;
      END IF;
      ALTER TABLE custom_reports ADD CONSTRAINT custom_reports_data_source_check CHECK (data_source IN ('sales','platform_object'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE TABLE IF NOT EXISTS custom_report_users (
      report_id UUID NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (report_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS dashboards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      api_key VARCHAR(100) NOT NULL DEFAULT 'dashboard',
      description VARCHAR(500),
      components JSONB NOT NULL DEFAULT '[]'::jsonb,
      filters JSONB NOT NULL DEFAULT '[]'::jsonb,
      run_as_mode VARCHAR(20) NOT NULL DEFAULT 'VIEWER' CHECK (run_as_mode IN ('VIEWER','FIXED_USER')),
      access JSONB NOT NULL DEFAULT '[]'::jsonb,
      default_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, api_key)
    );
    ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS api_key VARCHAR(100) NOT NULL DEFAULT 'dashboard';
    ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS run_as_mode VARCHAR(20) NOT NULL DEFAULT 'VIEWER';
    ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS access JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS default_assignments JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_dashboards_company_api_key ON dashboards(company_id,api_key);
    CREATE INDEX IF NOT EXISTS idx_dashboards_company_active ON dashboards(company_id, archived_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dashboards_company_name ON dashboards(company_id, lower(name)) WHERE archived_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_dashboards_company_active_name ON dashboards(company_id, lower(name)) WHERE archived_at IS NULL;
    CREATE TABLE IF NOT EXISTS dashboard_users (
      dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (dashboard_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_custom_report_users_user
      ON custom_report_users(user_id, report_id);

    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Global reference data only; customer products and pricing remain separate.
    CREATE TABLE IF NOT EXISTS ean_product_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ean VARCHAR(14) NOT NULL CHECK (ean ~ '^([0-9]{8}|[0-9]{12,14})$'),
      product_name VARCHAR(255) NOT NULL,
      brand VARCHAR(200),
      category VARCHAR(200),
      subcategory VARCHAR(200),
      unit_description VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_ean_product_master_ean
    ON ean_product_master(ean);

    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS dock_quick_access JSONB NOT NULL DEFAULT '["Dashboard", "Sales", "Products", "Inventory", "Customers", "Reports"]'::jsonb;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_display_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    /* T10R loyalty programme: redemption economics + minimum qualifying
     * sale. earning_rate converts currency spent to points; redeem_value
     * converts points to currency; min points gate redemption. */
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS loyalty_min_sale_total NUMERIC(12,2) NULL;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS loyalty_redeem_value_per_point NUMERIC(12,4) NULL;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS loyalty_min_points_redeem INTEGER NULL;
    /* JARVES licence control: company-level allowance (0 = JARVES disabled for
     * the whole company until an admin configures it) + per-user opt-in.
     * Existing rows/companies default to 0/false, so nothing changes until an
     * admin enables JARVES. See services/jarvis/licensing.js. */
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS jarves_licence_users INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS jarves_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    DO $$
    DECLARE duplicate_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO duplicate_count
        FROM (
          SELECT lower(btrim(email))
            FROM users
           WHERE email IS NOT NULL AND btrim(email) <> ''
           GROUP BY lower(btrim(email))
          HAVING COUNT(*) > 1
        ) duplicates;
      IF duplicate_count = 0 THEN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_users_global_email_normalized
          ON users (lower(btrim(email)))
          WHERE email IS NOT NULL AND btrim(email) <> '';
      ELSE
        RAISE WARNING 'Skipping global user email uniqueness index: % normalized duplicate email group(s) require migration', duplicate_count;
      END IF;
    END $$;

    /*
     * USER PREFERENCES (onePOS Admin presentation).
     *
     * Per-user UI preferences (layout preset / appearance / accent) — NOT a
     * company setting, so each user chooses their own presentation without
     * changing anybody else's interface. Pure presentation: one JSONB value
     * per user, no business semantics, no permissions of its own beyond the
     * session (a user can only ever read/write their own row).
     */
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS self_checkout_key_hash VARCHAR(100);
    ALTER TABLE ean_product_master ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

    /* Product image (data URL or remote URL). Additive; NULL = no image. */
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
    ALTER TABLE ean_product_master ADD COLUMN IF NOT EXISTS source TEXT NULL;

    -- EAN lookup audit only; no limits, pricing or customer product changes.
    CREATE TABLE IF NOT EXISTS ean_lookup_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      ean VARCHAR(14) NOT NULL,
      lookup_result VARCHAR(9) NOT NULL CHECK (lookup_result IN ('FOUND', 'NOT_FOUND')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ean_lookup_usage_company_created
    ON ean_lookup_usage(company_id, created_at);

    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100),
      barcode VARCHAR(100),
      description TEXT,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20,
      stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      low_stock_level NUMERIC(12,3) NOT NULL DEFAULT 0,
      track_stock BOOLEAN NOT NULL DEFAULT TRUE,
      web_shop_published BOOLEAN NOT NULL DEFAULT FALSE,
      web_shop_publish_start TIMESTAMPTZ,
      web_shop_publish_end TIMESTAMPTZ,
      web_shop_featured BOOLEAN NOT NULL DEFAULT FALSE,
      web_shop_category_override UUID,
      web_shop_sort_order INTEGER NOT NULL DEFAULT 0,
      web_shop_title_override VARCHAR(255),
      web_shop_description_override TEXT,
      web_shop_image_override TEXT,
      web_shop_delivery_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      web_shop_pickup_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      web_shop_price_override NUMERIC(12,2),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS kiosk_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS available_on_uber BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS available_on_deliveroo BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS uber_item_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS deliveroo_item_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS web_shop_published BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS web_shop_publish_start TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS web_shop_publish_end TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS web_shop_featured BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS web_shop_category_override UUID,
      ADD COLUMN IF NOT EXISTS web_shop_sort_order INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS web_shop_title_override VARCHAR(255),
      ADD COLUMN IF NOT EXISTS web_shop_description_override TEXT,
      ADD COLUMN IF NOT EXISTS web_shop_image_override TEXT,
      ADD COLUMN IF NOT EXISTS web_shop_delivery_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS web_shop_pickup_eligible BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS web_shop_price_override NUMERIC(12,2);

    /* Per-product VAT applicability: existing products keep their current
     * behaviour (column defaults to TRUE, so every pre-existing row is
     * standard-applicable and nothing changes until a user edits it). */
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS vat_applicable BOOLEAN NOT NULL DEFAULT TRUE;

    /* T10C age verification: existing products default to NOT age restricted,
     * so pre-existing rows behave exactly as before. */
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN NOT NULL DEFAULT FALSE;

    /* Batch / expiry tracking — per-PRODUCT configuration switch. Actual
     * batches are STORE-level records (inventory_batches below); the global
     * product never carries an expiry date or a batch number. */
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS batch_tracking BOOLEAN NOT NULL DEFAULT FALSE;

    /* T10U negative-inventory billing safety: OFF by default so existing
     * behaviour (insufficient stock rejected) is unchanged until an
     * Administrator explicitly enables it. */
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS allow_negative_inventory_billing BOOLEAN NOT NULL DEFAULT FALSE;
    /* Scan & Go feature flag consumed by routes/settings.js (additive; safe
       against databases created before the column existed). */
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS scan_go_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    /* Product exchange mode: which till exchange workflows are allowed
       ('receipt' | 'normal' | 'both', default 'both'). Additive; safe on
       databases created before the column existed. */
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS exchange_mode VARCHAR(20) NOT NULL DEFAULT 'both';
    /* Till product browser presentation ('image' | 'compact'). */
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS product_view VARCHAR(20) NOT NULL DEFAULT 'image';
    /* Online-ordering feature flags consumed by routes/settings.js. */
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS online_ordering_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS online_payment_methods JSONB NOT NULL DEFAULT '["card", "cash", "cod"]'::jsonb;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS id UUID;
    UPDATE company_settings SET id=gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE company_settings ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE company_settings ALTER COLUMN id SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_company_settings_id ON company_settings(id);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_slug VARCHAR(100);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_name VARCHAR(200);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_price_list_id UUID;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_own_delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_minimum_order NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_guest_checkout BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS client_web_shop_sandbox_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_company_settings_client_web_shop_slug
      ON company_settings(LOWER(client_web_shop_slug)) WHERE client_web_shop_slug IS NOT NULL;
    /* Configurable sale invoice/receipt prefixes per sale source. */
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS till_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'TO';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS delivery_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'DEL';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS self_checkout_invoice_prefix VARCHAR(10) NOT NULL DEFAULT 'SC';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_show_after_payment VARCHAR(20) NOT NULL DEFAULT 'OFF';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_expiry_minutes INTEGER NOT NULL DEFAULT 5;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_allow_manual BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_allow_regenerate BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_auto_close_on_new_sale BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_show_countdown BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_qr_download_filename_format VARCHAR(200) NOT NULL DEFAULT 'receipt-{receipt_number}.pdf';
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_landing_page VARCHAR(40) NOT NULL DEFAULT 'dashboard';
    ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_landing_page VARCHAR(40);
    ALTER TABLE terminals ADD COLUMN IF NOT EXISTS app_profile VARCHAR(30) NOT NULL DEFAULT 'admin';
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings
      ADD COLUMN IF NOT EXISTS loyalty_earning_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0100;

    /* T10P Scan & Go: customer scan sessions. A session is scoped to exactly
     * one company+store, holds its basket in a child table, and links to the
     * onePOS sale created at checkout (sales.client_request_id = session id
     * provides the database-level duplicate-checkout guard). Additive; no
     * changes to existing sales/inventory semantics. */
    CREATE TABLE IF NOT EXISTS scan_and_go_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id),
      status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'checking_out', 'completed', 'abandoned', 'expired')
      ),
      started_by UUID REFERENCES users(id) ON DELETE SET NULL,
      sale_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
    );

    CREATE INDEX IF NOT EXISTS idx_scan_go_sessions_company_store
      ON scan_and_go_sessions(company_id, store_id, created_at);

    CREATE TABLE IF NOT EXISTS scan_and_go_session_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES scan_and_go_sessions(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT scan_and_go_session_items_unique UNIQUE (session_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scan_go_session_items_session
      ON scan_and_go_session_items(session_id);

    CREATE TABLE IF NOT EXISTS mobile_scanner_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      connection_mode VARCHAR(20) NOT NULL DEFAULT 'WIFI_QR' CHECK (connection_mode IN ('WIFI_QR', 'BLUETOOTH')),
      wifi_mode VARCHAR(20) NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (wifi_mode IN ('LOCAL_ONLY', 'SERVER_RELAY')),
      bluetooth_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, store_id)
    );

    CREATE TABLE IF NOT EXISTS mobile_scanner_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      pairing_token_hash CHAR(64) UNIQUE,
      pairing_expires_at TIMESTAMPTZ,
      pairing_consumed_at TIMESTAMPTZ,
      session_token_hash CHAR(64) UNIQUE,
      session_expires_at TIMESTAMPTZ,
      wifi_mode VARCHAR(20) NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (wifi_mode IN ('LOCAL_ONLY', 'SERVER_RELAY')),
      device_name VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_mobile_scanner_sessions_scope
      ON mobile_scanner_sessions(company_id, store_id, terminal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS mobile_scanner_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scanner_session_id UUID NOT NULL REFERENCES mobile_scanner_sessions(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
      barcode VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_mobile_scanner_events_pending
      ON mobile_scanner_events(company_id, store_id, terminal_id, created_at)
      WHERE delivered_at IS NULL;

    /* T10P: sale rows created from a Scan & Go checkout carry the session id
     * in client_request_id (existing unique index enforces one sale per
     * session); receipt_number is prefixed SCANANDGO-<session> so reporting
     * can identify the channel without a schema change. */

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      movement_type VARCHAR(30) NOT NULL CHECK (
        movement_type IN (
          'OPENING',
          'PURCHASE',
          'SALE',
          'CUSTOMER_RETURN',
          'SUPPLIER_RETURN',
          'ADJUSTMENT_IN',
          'ADJUSTMENT_OUT',
          'RETURN_IN',
          'RETURN_OUT',
          'ONLINE_RESERVE',
          'ONLINE_RELEASE',
          'TRANSFER_OUT',
          'TRANSFER_IN'
        )
      ),
      quantity_change NUMERIC(12,3) NOT NULL,
      balance_after NUMERIC(12,3) NOT NULL,
      reference_type VARCHAR(50),
      reference_id UUID,
      batch_id UUID,
      transaction_id UUID,
      reason TEXT,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE inventory_movements
      DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;

    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_movement_type_check CHECK (
        movement_type IN (
          'OPENING', 'PURCHASE', 'SALE', 'CUSTOMER_RETURN',
          'SUPPLIER_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
          'RETURN_IN', 'RETURN_OUT',
          'ONLINE_RESERVE', 'ONLINE_RELEASE',
          'TRANSFER_OUT', 'TRANSFER_IN'
        )
      );

    /* Legacy installations may have been created before batch/transaction
       tracking was introduced; add columns before creating their indexes. */
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_id UUID;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS transaction_id UUID;

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_product
    ON inventory_movements(product_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_company
    ON inventory_movements(company_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_type
    ON inventory_movements(movement_type, created_at);

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch
    ON inventory_movements(batch_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_transaction
    ON inventory_movements(transaction_id, created_at);

    /*
     * STOCK BY STORE — store/location-level stock positions.
     *
     * Products remain company-level; the quantity that physically lives at
     * each store is tracked here. One row per (company, store, product) —
     * the unique constraint prevents duplicate stock records for the same
     * product at the same store. product_store_stock is updated only via
     * services/inventory.js createInventoryMovement, which keeps it in step
     * with the inventory_movements ledger and the products.stock_quantity
     * company aggregate in the same transaction.
     */
    CREATE TABLE IF NOT EXISTS product_store_stock (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, store_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_product_store_stock_store
    ON product_store_stock(company_id, store_id);

    CREATE INDEX IF NOT EXISTS idx_product_store_stock_product
    ON product_store_stock(company_id, product_id);

    CREATE TABLE IF NOT EXISTS inventory_balance_rollups (
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ledger_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      movement_count BIGINT NOT NULL DEFAULT 0,
      last_movement_at TIMESTAMPTZ,
      discrepancy NUMERIC(12,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, store_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_balance_rollups_store
      ON inventory_balance_rollups(company_id, store_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_balance_rollups_product
      ON inventory_balance_rollups(company_id, product_id);

    /*
     * INVENTORY BATCHES — store-level batch/expiry tracking.
     *
     * Company → Product → StoreProduct(stock) → InventoryBatch. The same
     * product can carry different batches with different expiry dates per
     * store; batch numbers may repeat ACROSS stores (manufacturer boxes are
     * per-delivery, not per-world) but never twice in the same store for the
     * same product. Quantities are held on the batch row itself and are only
     * mutated through the batch-aware inventory movement helpers in
     * services/inventory.js, so the ledger, store stock and batch quantities
     * stay consistent in the same transaction.
     *
     * Expired batches are NEVER deleted automatically — they stay visible
     * for identification, reporting and wastage.
     */
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_number VARCHAR(100),
      expiry_date DATE,
      quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      /* One batch per number within a store+product: the same manufacturer
         batch number is legitimate in different stores (and for different
         products), never duplicated inside one store's product. */
      UNIQUE (company_id, store_id, product_id, batch_number)
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_store
    ON inventory_batches(company_id, store_id);

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_product
    ON inventory_batches(company_id, product_id);

    CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry
    ON inventory_batches(company_id, store_id, expiry_date);

    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_id UUID;
    ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS transaction_id UUID;
    ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS manufacturing_date DATE;
    ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS manufacturing_date_source VARCHAR(10);
    ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS expiry_date_source VARCHAR(10);

    /*
     * STOCK TRANSFERS — moving stock between a company's own stores.
     * Execution is atomic: the TRANSFER_OUT (source) and TRANSFER_IN
     * (destination) inventory movements for every line are written in one
     * transaction with the transfer as their reference, so a failure on
     * either side rolls back both. Multi-product capable by design via
     * stock_transfer_items.
     */
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      transfer_number VARCHAR(30) UNIQUE,
      from_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      to_store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_stock_transfers_company
    ON stock_transfers(company_id, created_at);

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
    ON stock_transfer_items(transfer_id);

    /*
     * ONLINE ORDERS FOUNDATION
     *
     * Online orders received from delivery platforms (Uber Eats / Deliveroo).
     * Kept fully separate from POS sales; inventory is reserved from the
     * same products.stock_quantity pool the POS uses, via ONLINE_RESERVE /
     * ONLINE_RELEASE inventory movements.
     */
    CREATE TABLE IF NOT EXISTS online_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      platform VARCHAR(20) NOT NULL CHECK (platform ~ '^[a-z][a-z0-9_]{0,19}$'),
      external_order_id VARCHAR(255) NOT NULL,
      external_reference VARCHAR(255),
      status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED' CHECK (
        status IN ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'DRIVER_ACCEPTED', 'COLLECTED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'FAILED_DELIVERY', 'RETURNED', 'REJECTED', 'CANCELLED')
      ),
      customer_name VARCHAR(255),
      customer_phone VARCHAR(50),
      customer_email VARCHAR(255),
      delivery_address TEXT,
      customer_data JSONB,
      fulfilment_type VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
      otp_code VARCHAR(20),
      otp_verified_at TIMESTAMPTZ,
      currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      payment_method VARCHAR(50),
      payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      public_tracking_token_hash VARCHAR(64),
      public_tracking_token_ciphertext TEXT,
      public_tracking_token_expires_at TIMESTAMPTZ,
      delivery_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
      delivery_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      delivery_assigned_at TIMESTAMPTZ,
      delivery_route_order INTEGER,
      delivery_status_note TEXT,
      out_for_delivery_at TIMESTAMPTZ,
      failed_delivery_at TIMESTAMPTZ,
      returned_at TIMESTAMPTZ,
      cancel_reason TEXT,
      platform_data JSONB,
      accepted_at TIMESTAMPTZ,
      preparing_at TIMESTAMPTZ,
      ready_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT online_orders_platform_external_unique UNIQUE (company_id, platform, external_order_id)
    );
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS delivery_driver_id UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS delivery_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS delivery_assigned_at TIMESTAMPTZ;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS delivery_route_order INTEGER;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS delivery_status_note TEXT;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS failed_delivery_at TIMESTAMPTZ;
    ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
    ALTER TABLE online_orders DROP CONSTRAINT IF EXISTS online_orders_status_check;
    ALTER TABLE online_orders ADD CONSTRAINT online_orders_status_check CHECK (
      status IN ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'DRIVER_ACCEPTED', 'COLLECTED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'FAILED_DELIVERY', 'RETURNED', 'REJECTED', 'CANCELLED')
    );

    CREATE INDEX IF NOT EXISTS idx_online_orders_company
    ON online_orders(company_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_online_orders_status
    ON online_orders(company_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_online_orders_delivery_driver
    ON online_orders(company_id, store_id, delivery_driver_id, status, delivery_route_order);

    CREATE TABLE IF NOT EXISTS online_order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id),
      external_item_id VARCHAR(255),
      product_name VARCHAR(255) NOT NULL,
      quantity NUMERIC(12,3) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL,
      mapping_status VARCHAR(20) NOT NULL DEFAULT 'MAPPED',
      platform_data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_online_order_items_order
    ON online_order_items(order_id);

    CREATE INDEX IF NOT EXISTS idx_online_order_items_external
    ON online_order_items(external_item_id);

    /*
     * Incoming platform items may arrive WITHOUT a onePOS product mapping;
     * those are stored (never dropped) with product_id NULL and
     * mapping_status 'UNMAPPED' so the mapping UI can be built later.
     */
    ALTER TABLE online_order_items
      ALTER COLUMN product_id DROP NOT NULL;

    ALTER TABLE online_order_items
      ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(20) NOT NULL DEFAULT 'MAPPED';
    ALTER TABLE online_orders
      ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
    ALTER TABLE online_orders
      ADD COLUMN IF NOT EXISTS customer_data JSONB;
    CREATE INDEX IF NOT EXISTS idx_online_orders_customer
      ON online_orders(company_id, customer_id);

    CREATE TABLE IF NOT EXISTS online_order_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      from_status VARCHAR(30),
      to_status VARCHAR(30),
      message TEXT,
      platform_response JSONB,
      actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_online_order_events_order
    ON online_order_events(order_id, created_at);

    /*
     * DELIVEROO ITEM -> onePOS PRODUCT MAPPING
     *
     * Links a Deliveroo menu item (by its stable pos_item_id / PLU) to a
     * onePOS product so future Deliveroo orders resolve automatically.
     * A mapping never creates a onePOS product, and matching never happens by
     * name alone.
     */
    CREATE TABLE IF NOT EXISTS deliveroo_item_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      external_item_id VARCHAR(255) NOT NULL,
      deliveroo_item_name VARCHAR(255),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT deliveroo_item_mappings_company_item_unique UNIQUE (company_id, external_item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_deliveroo_item_mappings_company
    ON deliveroo_item_mappings(company_id, external_item_id);

    ALTER TABLE online_orders
      ADD COLUMN IF NOT EXISTS inventory_reserved BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS inventory_released BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS public_tracking_token_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS public_tracking_token_ciphertext TEXT,
      ADD COLUMN IF NOT EXISTS public_tracking_token_expires_at TIMESTAMPTZ;

    /*
     * PLATFORM API AUDIT LOG (Uber / Deliveroo)
     *
     * Every outbound platform API request and its response is recorded here
     * for debugging/auditing. Request payloads and headers are stored
     * REDACTED - client secrets, access tokens, API keys and Authorization
     * headers are replaced before insert (see
     * services/onlineOrders/platformLogger.js).
     */
    CREATE TABLE IF NOT EXISTS platform_api_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      platform VARCHAR(20) NOT NULL CHECK (platform IN ('uber', 'deliveroo')),
      environment VARCHAR(20),
      action VARCHAR(100) NOT NULL,
      endpoint VARCHAR(500),
      http_method VARCHAR(10),
      request_payload JSONB,
      request_headers JSONB,
      response_status INTEGER,
      response_body JSONB,
      success BOOLEAN,
      error_message TEXT,
      duration_ms INTEGER,
      order_id UUID REFERENCES online_orders(id) ON DELETE SET NULL,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_platform_api_logs_company
    ON platform_api_logs(company_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_platform_api_logs_platform
    ON platform_api_logs(company_id, platform, created_at);

    CREATE INDEX IF NOT EXISTS idx_platform_api_logs_order
    ON platform_api_logs(order_id);

    INSERT INTO inventory_movements (
      company_id, product_id, store_id, movement_type,
      quantity_change, balance_after, reference_type, reason
    )
    SELECT
      p.company_id, p.id, store.id, 'OPENING',
      p.stock_quantity, p.stock_quantity, 'MIGRATION',
      'Opening balance migrated from products.stock_quantity'
    FROM products p
    LEFT JOIN LATERAL (
      SELECT id
      FROM stores
      WHERE company_id = p.company_id
        AND active = true
      ORDER BY created_at, id
      LIMIT 1
    ) store ON true
    WHERE NOT EXISTS (
      SELECT 1
      FROM inventory_movements existing
      WHERE existing.product_id = p.id
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(50),
      email VARCHAR(255),
      address TEXT,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE suppliers
      ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE INDEX IF NOT EXISTS idx_suppliers_company
    ON suppliers(company_id);

    CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id),
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name VARCHAR(200),
      reference_number VARCHAR(100),
      purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')
      ),
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      received_by UUID REFERENCES users(id) ON DELETE SET NULL,
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, reference_number)
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= quantity),
      unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
      line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      /* Batch/expiry captured at PO line level (nullable: non-batch goods). */
      batch_number VARCHAR(100),
      expiry_date DATE
    );
    ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS manufacturing_date DATE;

    CREATE INDEX IF NOT EXISTS idx_purchases_company_date
    ON purchases(company_id, purchase_date DESC);

    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
    ON purchase_items(purchase_id);

    /* Batch/expiry on PO lines (additive migration for existing installs). */
    ALTER TABLE purchase_items
      ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100);
    ALTER TABLE purchase_items
      ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE purchase_items
      ADD COLUMN IF NOT EXISTS received_quantity NUMERIC(12,3) NOT NULL DEFAULT 0;
    ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
    ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
      CHECK (status IN ('DRAFT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'));

    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id),
      received_by UUID REFERENCES users(id) ON DELETE SET NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reference_number VARCHAR(100),
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS purchase_receipt_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
      purchase_item_id UUID NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
      batch_number VARCHAR(100),
      expiry_date DATE
    );
    /* Manufacturing date on receipt lines. Additive/idempotent; must run
       AFTER purchase_receipt_items exists (PO line-level manufacturing_date
       is handled separately above, before purchase_receipts is created). */
    ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS manufacturing_date DATE;
    CREATE INDEX IF NOT EXISTS idx_purchase_receipts_purchase ON purchase_receipts(purchase_id, received_at);

    CREATE TABLE IF NOT EXISTS supplier_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      supplier_sku VARCHAR(100),
      supplier_description TEXT,
      cost_price NUMERIC(12,2) NOT NULL CHECK (cost_price >= 0),
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      effective_to DATE,
      preferred BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (effective_to IS NULL OR effective_to >= effective_from),
      UNIQUE (company_id, supplier_id, product_id, effective_from)
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier ON supplier_products(company_id, supplier_id, active);
    CREATE INDEX IF NOT EXISTS idx_supplier_products_product ON supplier_products(company_id, product_id, active);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_products_one_preferred
      ON supplier_products(company_id, product_id)
      WHERE preferred = TRUE AND active = TRUE;

    CREATE TABLE IF NOT EXISTS stock_returns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id),
      return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('CUSTOMER', 'SUPPLIER')),
      /* T9M-SMALL: short human-readable return reference, e.g. RET-0001 */
      return_number VARCHAR(30) UNIQUE,
      sale_id UUID,
      purchase_id UUID,
      supplier_id UUID,
      request_key VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
      refund_amount NUMERIC(12,2),
      refund_method VARCHAR(50),
      reason TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_returns_request
    ON stock_returns(company_id, request_key)
    WHERE request_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS stock_return_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      return_id UUID NOT NULL REFERENCES stock_returns(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      sale_item_id UUID,
      purchase_item_id UUID,
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
      invoice_number VARCHAR(100) NOT NULL,
      invoice_date DATE NOT NULL DEFAULT CURRENT_DATE, due_date DATE,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
      tax NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIALLY_PAID','PAID','VOID')),
      notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, supplier_id, invoice_number)
    );
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE, payment_method VARCHAR(50), reference VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','CANCELLED')),
      notes TEXT, idempotency_key VARCHAR(100), created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (company_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), UNIQUE (payment_id, invoice_id)
    );
    CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('INVOICE','PAYMENT','RETURN_CREDIT','OPENING')),
      reference_type VARCHAR(40), reference_id UUID, reference VARCHAR(100), amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      debit BOOLEAN NOT NULL, description TEXT, idempotency_key VARCHAR(100), created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_supplier_ledger_account ON supplier_ledger_entries(company_id, supplier_id, created_at, id);
    ALTER TABLE supplier_ledger_entries ADD COLUMN IF NOT EXISTS reference VARCHAR(100);
    ALTER TABLE supplier_ledger_entries ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_ledger_idempotency
      ON supplier_ledger_entries(company_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_stock_returns_company
    ON stock_returns(company_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_stock_return_items_return
    ON stock_return_items(return_id);

    /* Product exchanges: link columns on the existing return leg so one
       exchange is traceable (return -> original sale / replacement sale)
       without a second returns/inventory/payment system. */
    ALTER TABLE stock_returns
      ADD COLUMN IF NOT EXISTS exchange_mode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS replacement_sale_id UUID,
      ADD COLUMN IF NOT EXISTS replacement_total NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS exchange_difference NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS canonical_transaction_id UUID;

    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      address TEXT,
      postcode VARCHAR(30),
      loyalty_number VARCHAR(100),
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    /* T10Y — customer credit account (credit OFF by default; balance is
       derived from customer_credit_ledger, never stored here). */
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS credit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) NULL;

    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS postcode VARCHAR(30),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_customers_company
    ON customers(company_id);

    CREATE TABLE IF NOT EXISTS customer_stores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_purchase_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (customer_id, store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_customer_stores_store
    ON customer_stores(store_id, active);

    CREATE INDEX IF NOT EXISTS idx_customer_stores_customer
    ON customer_stores(customer_id, active);

    /* T10Y — immutable customer credit ledger; balance is derived via
       SUM(amount * sign) over transaction_type (see services/customerCredit.js). */
    CREATE TABLE IF NOT EXISTS customer_credit_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NULL REFERENCES stores(id) ON DELETE SET NULL,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN
        ('credit_sale', 'payment', 'credit_note', 'debit_note', 'opening')),
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      balance_after NUMERIC(12,2) NULL,
      reference_type VARCHAR(40) NULL,
      reference_id UUID NULL,
      description TEXT NULL,
      vat_amount NUMERIC(12,2) NULL,
      net_amount NUMERIC(12,2) NULL,
      gross_amount NUMERIC(12,2) NULL,
      vat_rate NUMERIC(6,3) NULL,
      payment_method VARCHAR(40) NULL,
      idempotency_key VARCHAR(120) NULL,
      created_by UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_credit_ledger_customer
    ON customer_credit_ledger(company_id, customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_credit_ledger_reference
    ON customer_credit_ledger(reference_type, reference_id);
    CREATE TABLE IF NOT EXISTS customer_loyalty_balances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      balance NUMERIC(12,4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, customer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_balances_customer
    ON customer_loyalty_balances(customer_id);

    CREATE TABLE IF NOT EXISTS customer_loyalty_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      transaction_type VARCHAR(50) NOT NULL,
      amount NUMERIC(12,4) NOT NULL,
      balance_after NUMERIC(12,4) NOT NULL,
      reference_type VARCHAR(50),
      reference_id UUID,
      description TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer
    ON customer_loyalty_transactions(customer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_reference
    ON customer_loyalty_transactions(reference_type, reference_id);

    /* T10R: idempotent earning. At most one EARN per sale, enforced by the
     * database so a retried/lost-acknowledgement sale can never award
     * points twice. Balance upserts must be reversed when this fires. */
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loyalty_earn_per_sale
    ON customer_loyalty_transactions (company_id, reference_id)
    WHERE transaction_type = 'EARN' AND reference_type = 'sale';

    /* T10R: manual/admin point adjustments - permission-controlled,
     * auditable, referenceable to a sale/invoice. */
    CREATE TABLE IF NOT EXISTS customer_loyalty_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      points NUMERIC(12,4) NOT NULL,
      reason TEXT,
      reference_id UUID NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_adjustments_customer
    ON customer_loyalty_adjustments(customer_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS gift_cards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code VARCHAR(100) NOT NULL,
      reference_number VARCHAR(100),
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      initial_value NUMERIC(12,2) NOT NULL,
      expires_at TIMESTAMPTZ,
      issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code)
    );
    CREATE TABLE IF NOT EXISTS gift_card_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
      transaction_type VARCHAR(20) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      balance_after NUMERIC(12,2) NOT NULL,
      reference_type VARCHAR(30),
      reference_id UUID,
      description TEXT,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gift_card_transactions_card ON gift_card_transactions(company_id, gift_card_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gift_card_redeem_sale ON gift_card_transactions(company_id, gift_card_id, reference_id)
    WHERE transaction_type = 'redeem' AND reference_type = 'sale';

    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id),
      store_id UUID NOT NULL REFERENCES stores(id),
      terminal_id UUID REFERENCES terminals(id),
      user_id UUID NOT NULL REFERENCES users(id),
      customer_id UUID REFERENCES customers(id),
      receipt_number VARCHAR(100),
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      offline_created BOOLEAN NOT NULL DEFAULT FALSE,
      sync_status VARCHAR(50) NOT NULL DEFAULT 'synced',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      /*
       * ONLINE ORDER -> POS SALE: set when an Uber Eats / Deliveroo order is
       * completed (online_orders exists further up in this script). The
       * UNIQUE index below makes duplicate sales on retry impossible.
       */
      online_order_id UUID
    );
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(20) NOT NULL DEFAULT 'SALE';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES sales(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2);
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS hospitality_service_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS hospitality_service_charge_tax NUMERIC(12,2) NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_sales_transaction_type ON sales(company_id, transaction_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_original_transaction ON sales(original_transaction_id);

    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS client_request_id UUID;
    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS client_request_fingerprint TEXT;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_client_request
    ON sales(company_id, client_request_id);

    /*
     * Receipt numbers are authoritative and sequential per terminal per
     * business day (T8E). Partial on terminal_id so Online Order receipts
     * (terminal_id IS NULL) are exempt from the pattern entirely.
     */
    CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_terminal_receipt
    ON sales(terminal_id, receipt_number)
    WHERE terminal_id IS NOT NULL
      AND receipt_number LIKE '%-%-%';

    ALTER TABLE sales
      ADD COLUMN IF NOT EXISTS online_order_id UUID;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_online_order
    ON sales(online_order_id);

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sales_online_order') THEN
        ALTER TABLE sales
          ADD CONSTRAINT fk_sales_online_order
          FOREIGN KEY (online_order_id) REFERENCES online_orders(id);
      END IF;
    END $$;

    INSERT INTO customer_stores (customer_id, store_id, last_purchase_at)
    SELECT
      s.customer_id,
      s.store_id,
      MAX(COALESCE(s.completed_at, s.created_at))
    FROM sales s
    INNER JOIN customers c ON c.id = s.customer_id
    WHERE s.customer_id IS NOT NULL
      AND s.store_id IS NOT NULL
    GROUP BY s.customer_id, s.store_id
    ON CONFLICT (customer_id, store_id) DO UPDATE SET
      last_purchase_at = CASE
        WHEN customer_stores.last_purchase_at IS NULL THEN EXCLUDED.last_purchase_at
        WHEN EXCLUDED.last_purchase_at > customer_stores.last_purchase_at THEN EXCLUDED.last_purchase_at
        ELSE customer_stores.last_purchase_at
      END;

    CREATE TABLE IF NOT EXISTS sale_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      product_name VARCHAR(255) NOT NULL,
      quantity NUMERIC(12,3) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL,
      item_type VARCHAR(20) NOT NULL DEFAULT 'PRODUCT'
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code VARCHAR(60) NOT NULL, label VARCHAR(120) NOT NULL, kind VARCHAR(40) NOT NULL DEFAULT 'CUSTOM',
      active BOOLEAN NOT NULL DEFAULT TRUE, allow_offline BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 100, config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_payment_methods_company ON payment_methods(company_id, active, sort_order);
    INSERT INTO payment_methods (company_id,code,label,kind,active,allow_offline,sort_order)
    SELECT c.id, v.code, v.label, v.kind, TRUE, v.allow_offline, v.sort_order
    FROM companies c CROSS JOIN (VALUES
      ('cash','Cash','CASH',TRUE,10),('card','Card','CARD',FALSE,20),
      ('customer_credit','Customer Credit','CREDIT',FALSE,30),('gift_card','Gift Card','GIFT_CARD',FALSE,40),
      ('voucher','Voucher','VOUCHER',FALSE,50),('cheque','Cheque','CHEQUE',FALSE,60),
      ('bank_transfer','Bank Transfer','BANK_TRANSFER',FALSE,70),('online','Online','ONLINE',FALSE,80)
    ) AS v(code,label,kind,allow_offline,sort_order)
    ON CONFLICT (company_id,code) DO NOTHING;

    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      transaction_id UUID REFERENCES sales(id) ON DELETE SET NULL,
      direction VARCHAR(20) NOT NULL DEFAULT 'IN',
      reference VARCHAR(100),
      payment_method VARCHAR(50) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      provider VARCHAR(100),
      terminal_id VARCHAR(100),
      provider_transaction_id VARCHAR(255),
      online_order_id UUID REFERENCES online_orders(id) ON DELETE SET NULL,
      idempotency_key VARCHAR(200),
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
    ALTER TABLE payments ALTER COLUMN sale_id DROP NOT NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES sales(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'IN';
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference VARCHAR(100);
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS online_order_id UUID REFERENCES online_orders(id) ON DELETE SET NULL;
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);
    CREATE TABLE IF NOT EXISTS payment_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      till_id UUID NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
      sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
      session_reference VARCHAR(200), connector_instance_id UUID,
      connector_package_key VARCHAR(100) NOT NULL,
      environment VARCHAR(10) NOT NULL CHECK (environment IN ('DEMO','SANDBOX','LIVE')),
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), currency VARCHAR(3) NOT NULL,
      provider_reference VARCHAR(255), idempotency_key VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','APPROVED','DECLINED','CANCELLED','EXPIRED','FAILED')),
      qr_url TEXT, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_payment_attempts_scope ON payment_attempts(company_id, store_id, till_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempt_provider_reference ON payment_attempts(company_id, provider_reference) WHERE provider_reference IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_idempotency
      ON payments(company_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payments_online_order ON payments(company_id,online_order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);

    CREATE TABLE IF NOT EXISTS financial_ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      transaction_id UUID REFERENCES sales(id) ON DELETE SET NULL,
      payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_invoice_id UUID,
      transaction_type VARCHAR(30) NOT NULL,
      debit NUMERIC(12,2) NOT NULL DEFAULT 0,
      credit NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      reference VARCHAR(100),
      status VARCHAR(30) NOT NULL DEFAULT 'POSTED',
      description TEXT,
      idempotency_key VARCHAR(160),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_financial_ledger_transaction ON financial_ledger_entries(transaction_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_financial_ledger_customer ON financial_ledger_entries(company_id, customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_financial_ledger_supplier ON financial_ledger_entries(company_id, supplier_id, created_at);

    CREATE TABLE IF NOT EXISTS layaways (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
      paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
      due_date DATE, notes TEXT,
      completed_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
      completed_at TIMESTAMPTZ,
      completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_layaways_store_status
      ON layaways(company_id, store_id, status, created_at DESC);
    CREATE TABLE IF NOT EXISTS layaway_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      layaway_id UUID NOT NULL REFERENCES layaways(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      product_name VARCHAR(255) NOT NULL,
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL CHECK (total >= 0)
      ,track_stock BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE INDEX IF NOT EXISTS idx_layaway_items_layaway ON layaway_items(layaway_id);
    CREATE TABLE IF NOT EXISTS layaway_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      layaway_id UUID NOT NULL REFERENCES layaways(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id),
      payment_method VARCHAR(50) NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      provider VARCHAR(100), provider_transaction_id VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_layaway_payments_layaway ON layaway_payments(layaway_id);
    ALTER TABLE layaways ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE layaways ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE layaway_items ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT TRUE;
    /* Older early layaway builds briefly exposed PAID. Keep those rows open
       so completion remains the only terminal transition. */
    UPDATE layaways SET status = 'OPEN' WHERE status = 'PAID';
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'layaways'::regclass AND conname = 'layaways_status_check'
      ) THEN
        ALTER TABLE layaways DROP CONSTRAINT layaways_status_check;
      END IF;
      ALTER TABLE layaways ADD CONSTRAINT layaways_status_check
        CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS held_sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
      items JSONB NOT NULL,
      discount_type VARCHAR(20),
      discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_held_sales_store
    ON held_sales(company_id, store_id, created_at);

    CREATE TABLE IF NOT EXISTS refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID NOT NULL REFERENCES sales(id),
      user_id UUID NOT NULL REFERENCES users(id),
      amount NUMERIC(12,2) NOT NULL,
      reason TEXT,
      payment_method VARCHAR(50),
      /* T9M-SMALL: links the refund to its stock_returns record. */
      return_id UUID REFERENCES stock_returns(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS till_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      terminal_id UUID NOT NULL REFERENCES terminals(id),
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      user_id UUID NOT NULL REFERENCES users(id),
      opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      closing_cash NUMERIC(12,2),
      expected_cash NUMERIC(12,2),
      cash_difference NUMERIC(12,2),
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      closed_by UUID REFERENCES users(id) ON DELETE SET NULL
    );

    ALTER TABLE till_sessions
      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id) ON DELETE SET NULL;

    /* Till workflow (T-TILL): a till must not have two simultaneously open
     * sessions. The partial unique index makes "at most one open session per
     * terminal" atomic — the API's SELECT-then-INSERT guard alone is racy
     * under concurrent opens. */
    CREATE UNIQUE INDEX IF NOT EXISTS uq_till_sessions_open_per_terminal
    ON till_sessions(terminal_id)
    WHERE status = 'open';

     CREATE TABLE IF NOT EXISTS cash_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      till_session_id UUID NOT NULL REFERENCES till_sessions(id),
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(50) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    /* T-TILL: who/where recorded a cash movement (session row already
     * carries till+store via terminal; these denormalise for audit). */
    ALTER TABLE cash_movements
      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100),
      entity_id UUID,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
      session_id UUID,
      ip_address INET,
      actor_username VARCHAR(255),
      details JSONB,
      result VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure','denied')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_company_action ON audit_logs(company_id, action);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id) WHERE entity_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_audit_company_entity_created
      ON audit_logs(company_id, entity_type, entity_id, created_at DESC);
    /* Backfill new columns on pre-existing audit_logs tables (idempotent). */
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS store_id UUID;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS terminal_id UUID;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id UUID;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_username VARCHAR(255);
    ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS result VARCHAR(20) NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure','denied'));


    /*
     * Staff attendance (clock in/out). One attendance session per staff
     * member per company: an OPEN row (clock_out NULL) is the user's active
     * clock-in. uq_attendance_open_per_user makes "at most one open session
     * per user" atomic - the API's SELECT-then-INSERT guard alone is racy.
     * worked_minutes is computed SERVER-SIDE from clock_in/clock_out at
     * clock-out time; the client never supplies it.
     */
    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out TIMESTAMPTZ,
      worked_minutes INTEGER,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT attendance_clock_out_after_in CHECK (
        clock_out IS NULL OR clock_out >= clock_in
      )
    );

    CREATE INDEX IF NOT EXISTS idx_attendance_records_company_created
    ON attendance_records(company_id, clock_in DESC);

    CREATE INDEX IF NOT EXISTS idx_attendance_records_store_created
    ON attendance_records(company_id, store_id, clock_in DESC);

    CREATE INDEX IF NOT EXISTS idx_attendance_records_user_created
    ON attendance_records(user_id, clock_in DESC);

    /* At most one OPEN attendance session per user (company-wide).
     * A user clocking in again while an open row exists hits this index,
     * which the API surfaces as 409. */
    CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_open_per_user
    ON attendance_records(user_id)
    WHERE status = 'open';

    CREATE TABLE IF NOT EXISTS integrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      configuration JSONB,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    /*
     * Online platform (Uber / Deliveroo) settings are stored here, one row
     * per company + provider. Secrets inside the "configuration" JSONB are
     * encrypted by the application (AES-256-GCM, see
     * services/onlineOrders/platformConfig.js).
     */
    ALTER TABLE integrations
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    DELETE FROM integrations a
    USING integrations b
    WHERE a.company_id = b.company_id
      AND a.provider = b.provider
      AND (a.created_at, a.id) < (b.created_at, b.id);

    CREATE UNIQUE INDEX IF NOT EXISTS ux_integrations_company_provider
    ON integrations(company_id, provider);

    /*
     * T9M-SMALL - Sales Returns hardening: human-readable return references,
     * lifecycle status and refund linkage. Idempotent for existing installs.
     */
    ALTER TABLE stock_returns
      ADD COLUMN IF NOT EXISTS return_number VARCHAR(30) UNIQUE,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
      ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS refund_method VARCHAR(50);

    ALTER TABLE refunds
      ADD COLUMN IF NOT EXISTS return_id UUID REFERENCES stock_returns(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS product_kind VARCHAR(20) NOT NULL DEFAULT 'standard',
      ADD COLUMN IF NOT EXISTS variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id);
    DO $$
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_products_sku_per_company
        ON products(company_id, LOWER(sku)) WHERE sku IS NOT NULL AND active = true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END $$;
    DO $$
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode_per_company
        ON products(company_id, barcode) WHERE barcode IS NOT NULL AND active = true;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_products_variant_attributes
      ON products(company_id, parent_product_id, variant_attributes)
      WHERE parent_product_id IS NOT NULL AND active = true;
    CREATE TABLE IF NOT EXISTS product_modifier_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections > 0),
      display_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS product_modifier_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES product_modifier_groups(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      track_stock BOOLEAN NOT NULL DEFAULT FALSE,
      inventory_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS product_bundle_components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bundle_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      UNIQUE (bundle_product_id, component_product_id),
      CHECK (bundle_product_id <> component_product_id)
    );
    ALTER TABLE sale_items
      ADD COLUMN IF NOT EXISTS modifier_data JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS bundle_components JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE TABLE IF NOT EXISTS sale_item_modifiers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
      modifier_option_id UUID NOT NULL REFERENCES product_modifier_options(id),
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      total NUMERIC(12,2) NOT NULL CHECK (total >= 0)
    );
  `);

  await pool.query(`
    -- Business Division is no longer a built-in concept. Existing installations
    -- migrate away from the legacy special-case schema; customers can model it
    -- as an ordinary Platform Object + relationships when required.
    DROP TABLE IF EXISTS user_business_divisions;
    ALTER TABLE stores DROP COLUMN IF EXISTS business_division_id;
    ALTER TABLE audit_logs DROP COLUMN IF EXISTS business_division_id;
    DROP TABLE IF EXISTS business_divisions;
  `);

  const permissions = [
    ["sale.view", "View Sales"],
    ["sale.create", "Create Sale"],
    ["sale.edit", "Edit Sale"],
    ["sale.delete", "Delete / Void Sale"],
    ["sale.invoice.view", "View Invoices"],
    ["sale.invoice.reprint", "Reprint Invoice"],
    ["sale.discount", "Apply Discount"],
    ["sale.void_item", "Void Item"],
    ["sale.void", "Void Sale"],
    ["sale.refund", "Refund Sale"],
    ["sale.refund_without_receipt", "Refund Without Receipt"],
    ["sale.price_change", "Change Price"],
    ["sale.hold", "Hold Sale"],
    ["layaway.view", "View Layaways"],
    ["layaway.create", "Create Layaway"],
    ["layaway.payment", "Take Layaway Payment"],
    ["layaway.complete", "Complete Layaway"],
    ["layaway.cancel", "Cancel Layaway"],
    ["cash.open_drawer", "Open Cash Drawer"],
    ["cash.payout", "Cash Payout"],
    ["cash.adjustment", "Cash Adjustment"],
    ["till.open", "Open Till"],
    ["till.close", "Close Till"],
    ["product.view", "View Products"],
    ["product.create", "Create Product"],
    ["product.edit", "Edit Product"],
    ["product.delete", "Delete Product"],
    ["global_product.view", "View Global Products"],
    ["global_product.create", "Create Global Product"],
    ["global_product.edit", "Edit Global Product"],
    ["global_product.delete", "Delete Global Product"],
    ["category.view", "View Categories"],
    ["category.create", "Create Category"],
    ["category.edit", "Edit Category"],
    ["category.delete", "Delete Category"],
    ["customer.view", "View Customers"],
    ["customer.create", "Create Customer"],
    ["customer.edit", "Edit Customer"],
    ["customer.delete", "Delete Customer"],
    ["customer.credit.view", "View Customer Credit"],
    ["customer.credit.manage", "Manage Customer Credit"],
    ["customer.credit.payment", "Post Customer Credit Payments"],
    ["customer.credit.freeze", "Freeze or Unfreeze Customer Credit"],
    ["customer.credit.statement", "Send Customer Credit Statements"],
    ["loyalty.adjust", "Adjust Customer Loyalty Points"],
    ["loyalty.use", "Use Customer Loyalty Points"],
    ["purchase.view", "View Purchases"],
    ["purchase.create", "Create Purchase"],
    ["purchase.edit", "Edit Purchase"],
    ["purchase.delete", "Delete / Cancel Purchase"],
    ["store.view", "View Stores"],
    ["store.create", "Create Store"],
    ["store.edit", "Edit Store"],
    ["store.delete", "Delete Store"],
    ["user.view", "View Users"],
    ["user.create", "Create User"],
    ["user.edit", "Edit User"],
    ["user.store_assignment.manage", "Manage User Store Assignments"],
    ["user.delete", "Delete User"],
    ["inventory.view", "View Inventory"],
    ["inventory.movements.view", "View Stock Movements"],
    ["inventory.adjust", "Adjust Inventory"],
    ["inventory.replenishment.view", "View Replenishment Suggestions"],
    ["returns.view", "View Returns"],
    ["returns.create", "Create Returns"],
    ["returns.approve", "Approve / Process Returns"],
    ["reports.sales.view", "Sales Report"],
    ["reports.products.view", "Product Sales Report"],
    ["reports.customers.view", "Customer Report"],
    ["reports.inventory.view", "Inventory Overview"],
    ["reports.inventory_movements.view", "Stock Movement Ledger"],
    ["reports.low_stock.view", "Low Stock Report"],
    ["reports.payments.view", "Payments Report"],
    ["reports.purchases.view", "Purchase Report"],
    ["reports.returns.view", "Sales Returns Report"],
    ["reports.till.view", "Till Report"],
    ["reports.vat.view", "Tax / VAT Report"],
    ["reports.summary.view", "Reports Summary"],
    ["reports.custom.view", "View Custom Reports"],
    ["reports.custom.create", "Create Custom Reports"],
    ["reports.custom.edit", "Edit Custom Reports"],
    ["reports.custom.delete", "Archive Custom Reports"],
    ["reports.custom.share", "Share Custom Reports"],
    ["dashboard.view", "View Dashboards"],
    ["dashboard.create", "Create Dashboards"],
    ["dashboard.edit", "Edit Dashboards"],
    ["dashboard.manage", "Manage Dashboards"],
    ["dashboard.share", "Share Dashboards"],
    ["dashboard.assign_default", "Assign Default Dashboards"],
    ["report.export", "Export Reports"],
    ["user.manage", "Manage Users"],
    ["role.manage", "Manage Roles"],
    ["payment.manage", "Manage Payments"],
    ["integration.manage", "Manage Integrations"],
    ["settings.manage", "Manage Settings"],
    /* T10V - accounting integration export (push sales through the T9A connections). */
    ["accounting.export", "Export to Accounting"],
    ["online_orders.view", "View Online Orders"],
    ["online_orders.manage", "Manage Online Orders"],
    ["online_orders.status_update", "Update Online Order Status"],
    ["online_orders.cancel", "Cancel Online Orders"],
    ["online_orders.configure", "Configure Online Platforms"],
    ["delivery.driver", "Own Delivery Driver"],
    /* Staff attendance (clock in/out). attendance.view gates the management
     * records list; clock in/out itself is available to every active user. */
    ["attendance.view", "View Staff Attendance"],
    /* T10-AUDIT: central audit log access (Staff & Security -> Audit Log). */
    ["audit.view", "View Audit Log"],
    /* T10Z - Combos / Meal Deals. Granular, matching the existing naming style. */
    ["combo.view", "View Combo / Meal Deals"],
    ["combo.create", "Create Combo / Meal Deals"],
    ["combo.edit", "Edit Combo / Meal Deals"],
    ["combo.delete", "Delete Combo / Meal Deals"],
    ["combo.activate", "Activate / Deactivate Combo / Meal Deals"]
    ,["hospitality.tables.view", "View Hospitality Tables"]
    ,["hospitality.tables.manage", "Manage Hospitality Floors and Tables"]
    ,["hospitality.floor.manage", "Manage Hospitality Floor Plans"]
    ,["hospitality.reservations.view", "View Hospitality Reservations"]
    ,["hospitality.reservations.manage", "Manage Hospitality Reservations"]
    ,["hospitality.kds.view", "View Kitchen Display"]
    ,["hospitality.kds.manage", "Manage Kitchen Display Status"]
    ,["hospitality.kitchen.reprint", "Reprint Kitchen Tickets"]
    ,["hospitality.bill.split", "Split Hospitality Bills"]
    ,["hospitality.bill.pay", "Take Hospitality Bill Payments"]
    ,["hospitality.table.transfer", "Transfer Hospitality Tables"]
    ,["hospitality.service_charge.override", "Override Hospitality Service Charges"]
    ,["hospitality.qr.manage", "Manage Hospitality QR Ordering"]
  ];

  for (const [code, name] of permissions) {
    await pool.query(
      `
      INSERT INTO permissions (code, name)
      VALUES ($1, $2)
      ON CONFLICT (code) DO NOTHING
      `,
      [code, name]
    );
  }

  /*
   * T9A - generic integration foundation. The table name
   * "integrations" is already used by the Online Orders platform
   * configuration, so the generic module uses "integration_connections".
   */
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS integration_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      provider_name VARCHAR(100),
      integration_type VARCHAR(50) NOT NULL DEFAULT 'generic',
      base_url TEXT,
      provider_account_id VARCHAR(255),
      connector_package_key VARCHAR(100),
      till_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
      connector_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      connector_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      fallback_order INTEGER NOT NULL DEFAULT 0,
      last_test_at TIMESTAMPTZ,
      last_test_result JSONB NOT NULL DEFAULT '{}'::jsonb,
      auth_type VARCHAR(30) NOT NULL DEFAULT 'none' CHECK (
        auth_type IN ('none', 'api_key', 'bearer', 'basic')
      ),
      credentials_encrypted TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      connection_status VARCHAR(20) NOT NULL DEFAULT 'NOT_CONNECTED',
      last_connected_at TIMESTAMPTZ,
      last_error TEXT,
      oauth_state_hash VARCHAR(64),
      oauth_state_expires_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE integration_connections
      ADD COLUMN IF NOT EXISTS provider_account_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS connector_package_key VARCHAR(100),
      ADD COLUMN IF NOT EXISTS till_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS connector_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS connector_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS fallback_order INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_test_result JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) NOT NULL DEFAULT 'NOT_CONNECTED',
      ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_error TEXT,
      ADD COLUMN IF NOT EXISTS oauth_state_hash VARCHAR(64),
      ADD COLUMN IF NOT EXISTS oauth_state_expires_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_integration_connections_company
    ON integration_connections(company_id);

    CREATE INDEX IF NOT EXISTS idx_integration_connections_store
    ON integration_connections(store_id);

    CREATE INDEX IF NOT EXISTS idx_integration_connectors_till
    ON integration_connections(company_id, store_id, till_id, enabled, fallback_order)
    WHERE connector_package_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS integration_endpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'POST' CHECK (
        method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
      ),
      path TEXT NOT NULL,
      entity_type VARCHAR(50) NOT NULL DEFAULT 'sale',
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_integration_endpoints_integration
    ON integration_endpoints(integration_id);

    CREATE TABLE IF NOT EXISTS integration_field_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
      partner_field_path TEXT NOT NULL,
      onepos_source_path TEXT,
      mapping_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (
        mapping_type IN ('direct', 'constant', 'template')
      ),
      static_value TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      /* direct mappings must carry a source path; constant/template use static_value. */
      CONSTRAINT integration_mappings_direct_requires_source CHECK (
        mapping_type <> 'direct' OR onepos_source_path IS NOT NULL
      ),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_integration_field_mappings_endpoint
    ON integration_field_mappings(endpoint_id);

    CREATE TABLE IF NOT EXISTS integration_entity_mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      entity_type VARCHAR(40) NOT NULL,
      local_entity_id UUID NOT NULL,
      external_id VARCHAR(255) NOT NULL,
      external_parent_id VARCHAR(255),
      mapping_status VARCHAR(20) NOT NULL DEFAULT 'LINKED',
      safe_error TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT integration_entity_mapping_type_check CHECK (entity_type ~ '^[a-z][a-z0-9_]{0,39}$'),
      CONSTRAINT integration_entity_mapping_external_nonempty CHECK (length(trim(external_id)) > 0),
      UNIQUE(integration_id, entity_type, local_entity_id, external_parent_id),
      UNIQUE(integration_id, entity_type, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_integration_entity_mappings_company
      ON integration_entity_mappings(company_id, integration_id, entity_type, mapping_status);

    CREATE TABLE IF NOT EXISTS integration_api_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
      endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      entity_type VARCHAR(50),
      entity_id UUID,
      correlation_id VARCHAR(100),
      method VARCHAR(10) NOT NULL,
      url TEXT NOT NULL,
      request_headers TEXT,
      request_body TEXT,
      response_status INTEGER,
      response_headers TEXT,
      response_body TEXT,
      duration_ms INTEGER,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_integration_api_logs_company_created
    ON integration_api_logs(company_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_integration_api_logs_integration
    ON integration_api_logs(integration_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_integration_api_logs_entity
    ON integration_api_logs(entity_type, entity_id);
    `
  );

  /* T9P - secure invoice link foundation (hash-only token storage).
   * Applied idempotently; mirrors database/secure_invoice_links.sql. */
  await pool.query(`
CREATE TABLE IF NOT EXISTS secure_invoice_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    token_hash VARCHAR(64) NOT NULL UNIQUE,

    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,

    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_secure_invoice_links_sale
ON secure_invoice_links(sale_id);

CREATE INDEX IF NOT EXISTS idx_secure_invoice_links_company_created
ON secure_invoice_links(company_id, created_at DESC);
    `);

  /*
   * T10Z — Combos / Meal Deals. Additive: existing sales, products, pricing
   * and inventory are untouched. A deal references EXISTING product ids and
   * category ids (no product data is copied into a second product table), and
   * its price is applied by the single shared engine in
   * services/comboPricing.js. Nothing here creates fake "meal deal" products.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS combo_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      deal_type VARCHAR(30) NOT NULL DEFAULT 'meal_deal' CHECK (
        deal_type IN ('meal_deal', 'bundle')
      ),
      deal_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deal_price >= 0),
      store_scope VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (
        store_scope IN ('all', 'selected')
      ),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT combo_deals_date_range CHECK (
        starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at
      )
    );

    CREATE INDEX IF NOT EXISTS idx_combo_deals_company
    ON combo_deals(company_id, active);

    CREATE TABLE IF NOT EXISTS combo_deal_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES combo_deals(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      required_quantity INTEGER NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_combo_deal_groups_deal
    ON combo_deal_groups(deal_id, display_order);

    CREATE TABLE IF NOT EXISTS combo_deal_group_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES combo_deal_groups(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT combo_deal_group_products_unique UNIQUE (group_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_combo_group_products_group
    ON combo_deal_group_products(group_id);

    CREATE INDEX IF NOT EXISTS idx_combo_group_products_product
    ON combo_deal_group_products(product_id);

    CREATE TABLE IF NOT EXISTS combo_deal_group_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES combo_deal_groups(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      CONSTRAINT combo_deal_group_categories_unique UNIQUE (group_id, category_id)
    );

    /* Server-authoritative price lists, customer groups, scheduled prices and promotions. */
    CREATE TABLE IF NOT EXISTS customer_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (company_id, name)
    );
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_group_id UUID REFERENCES customer_groups(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS price_lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL, channel VARCHAR(50) NOT NULL DEFAULT 'retail', active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (company_id, name)
    );
    CREATE TABLE IF NOT EXISTS price_list_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      UNIQUE (price_list_id, product_id)
    );
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL;
    CREATE TABLE IF NOT EXISTS scheduled_product_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT TRUE,
      CHECK (ends_at IS NULL OR ends_at > starts_at)
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL, discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent','fixed')),
      discount_value NUMERIC(12,2) NOT NULL CHECK (discount_value >= 0), starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT TRUE, product_id UUID REFERENCES products(id) ON DELETE CASCADE,
      category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
      buy_quantity INTEGER CHECK (buy_quantity IS NULL OR buy_quantity > 0), get_quantity INTEGER CHECK (get_quantity IS NULL OR get_quantity >= 0),
      offer_type VARCHAR(20) CHECK (offer_type IS NULL OR offer_type IN ('fixed_set','percent')),
      set_price NUMERIC(12,2) CHECK (set_price IS NULL OR set_price >= 0),
      discount_percent NUMERIC(5,2) CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
      CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
    );

    CREATE INDEX IF NOT EXISTS idx_combo_group_categories_group
    ON combo_deal_group_categories(group_id);

    CREATE TABLE IF NOT EXISTS combo_deal_stores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      deal_id UUID NOT NULL REFERENCES combo_deals(id) ON DELETE CASCADE,
      store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      CONSTRAINT combo_deal_stores_unique UNIQUE (deal_id, store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_combo_deal_stores_deal
    ON combo_deal_stores(deal_id);

    /*
     * Per-sale audit of the meal deals that were applied. This is the ONLY
     * record of a deal on a sale: the sale and its lines keep their ordinary
     * shape, and no synthetic product row is ever inserted.
     */
    CREATE TABLE IF NOT EXISTS sale_combo_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
      deal_id UUID REFERENCES combo_deals(id) ON DELETE SET NULL,
      deal_name VARCHAR(200) NOT NULL,
      deal_type VARCHAR(30) NOT NULL DEFAULT 'meal_deal',
      deal_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      original_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      deal_value NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      lines JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sale_combo_applications_sale
    ON sale_combo_applications(sale_id);

    CREATE INDEX IF NOT EXISTS idx_sale_combo_applications_company
    ON sale_combo_applications(company_id, created_at DESC);
  `);

    /* Preserve provider keys while allowing future normalized connector names. */
    await pool.query(`
      ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_layouts_default_scope
        ON platform_layouts(object_id, page_type, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
        WHERE is_default=true AND role_id IS NULL AND active=true;
      ALTER TABLE online_orders
        DROP CONSTRAINT IF EXISTS online_orders_platform_check;
      ALTER TABLE online_orders
        DROP CONSTRAINT IF EXISTS online_orders_platform_format_check;
      ALTER TABLE online_orders
        ADD CONSTRAINT online_orders_platform_format_check
        CHECK (platform ~ '^[a-z][a-z0-9_]{0,19}$');
      UPDATE online_orders AS o
         SET customer_id = c.id
        FROM customers AS c
       WHERE o.customer_id IS NULL
         AND c.id::text = o.customer_data->>'id'
         AND c.company_id = o.company_id;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitality_floors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, name VARCHAR(100) NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, store_id, name)
      );
      CREATE TABLE IF NOT EXISTS hospitality_tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, floor_id UUID NOT NULL REFERENCES hospitality_floors(id) ON DELETE CASCADE,
        table_number VARCHAR(30) NOT NULL, name VARCHAR(100), capacity INTEGER NOT NULL DEFAULT 2 CHECK (capacity > 0),
        shape VARCHAR(20) NOT NULL DEFAULT 'square', position_x NUMERIC(8,2) NOT NULL DEFAULT 0, position_y NUMERIC(8,2) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE, status VARCHAR(20) NOT NULL DEFAULT 'EMPTY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (company_id, store_id, floor_id, table_number)
      );
      CREATE TABLE IF NOT EXISTS hospitality_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, table_id UUID REFERENCES hospitality_tables(id) ON DELETE SET NULL,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, customer_name VARCHAR(200) NOT NULL,
        reservation_date DATE NOT NULL, reservation_time TIME NOT NULL, guests INTEGER NOT NULL CHECK (guests > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'RESERVED', notes TEXT, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hospitality_table_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE RESTRICT,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, guests INTEGER NOT NULL DEFAULT 1 CHECK (guests > 0),
        status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED','COMPLETED','CANCELLED','MERGED')),
        merged_into_session_id UUID REFERENCES hospitality_table_sessions(id) ON DELETE SET NULL,
        started_by UUID REFERENCES users(id) ON DELETE SET NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitality_active_session_per_table
        ON hospitality_table_sessions(company_id,store_id,table_id)
        WHERE status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED');
      CREATE TABLE IF NOT EXISTS hospitality_table_merges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        target_session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), unmerged_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS hospitality_table_merge_members (
        merge_id UUID NOT NULL REFERENCES hospitality_table_merges(id) ON DELETE CASCADE,
        session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE RESTRICT,
        original_status VARCHAR(30) NOT NULL, is_target BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (merge_id,session_id)
      );
      CREATE TABLE IF NOT EXISTS hospitality_kds_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, sale_id UUID, table_id UUID REFERENCES hospitality_tables(id) ON DELETE SET NULL,
        session_id UUID REFERENCES hospitality_table_sessions(id) ON DELETE SET NULL,
        order_number VARCHAR(50), items JSONB NOT NULL DEFAULT '[]'::jsonb, notes TEXT, station VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'NEW', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE hospitality_kds_tickets ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES hospitality_table_sessions(id) ON DELETE SET NULL;
      CREATE TABLE IF NOT EXISTS platform_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, report_key VARCHAR(100) NOT NULL,
        label VARCHAR(200) NOT NULL, description TEXT, config JSONB NOT NULL DEFAULT '{}'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, report_key)
      );
      CREATE TABLE IF NOT EXISTS platform_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        app_key VARCHAR(100) NOT NULL, label VARCHAR(200) NOT NULL, description TEXT, config JSONB NOT NULL DEFAULT '{}'::jsonb,
        active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, app_key)
      );
      CREATE TABLE IF NOT EXISTS platform_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, page_key VARCHAR(100) NOT NULL,
        label VARCHAR(200) NOT NULL, route_path VARCHAR(200) NOT NULL DEFAULT '/', page_type VARCHAR(30) NOT NULL DEFAULT 'object',
        definition JSONB NOT NULL DEFAULT '{}'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(app_id, page_key)
      );
      CREATE TABLE IF NOT EXISTS platform_automation_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rule_id UUID REFERENCES platform_rules(id) ON DELETE SET NULL,
        object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL, record_id UUID,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, trigger VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS platform_message_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        api_key VARCHAR(100) NOT NULL,
        description TEXT,
        channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP')),
        object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL,
        subject TEXT,
        body TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, api_key)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_message_templates_company
        ON platform_message_templates(company_id, active);
      CREATE TABLE IF NOT EXISTS platform_action_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        idempotency_key VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_platform_action_jobs_due
        ON platform_action_jobs(status, next_attempt_at);
      CREATE TABLE IF NOT EXISTS platform_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(200),
        message TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
        delivery_status VARCHAR(20) NOT NULL DEFAULT 'DELIVERED',
        event_id UUID,
        subscription_id UUID,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE platform_notifications ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) NOT NULL DEFAULT 'DELIVERED';
      ALTER TABLE platform_notifications ADD COLUMN IF NOT EXISTS event_id UUID;
      ALTER TABLE platform_notifications ADD COLUMN IF NOT EXISTS subscription_id UUID;
      CREATE INDEX IF NOT EXISTS idx_platform_notifications_company
        ON platform_notifications(company_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_notifications_subscription_event_user
        ON platform_notifications(subscription_id,event_id,user_id)
        WHERE subscription_id IS NOT NULL AND event_id IS NOT NULL AND user_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS platform_licence_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        package_key VARCHAR(100) NOT NULL,
        package_name VARCHAR(200) NOT NULL,
        requesting_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        requesting_user_name VARCHAR(200),
        licence_status JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_licence_requests_pending
        ON platform_licence_requests(company_id,package_key) WHERE status='PENDING';
      CREATE TABLE IF NOT EXISTS platform_notification_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
        event_type VARCHAR(200) NOT NULL,
        recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('ACTOR','USER','FIELD')),
        recipient_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        title_template VARCHAR(200),
        message_template TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_platform_notification_subscriptions_match
        ON platform_notification_subscriptions(company_id,event_type,object_id,active);
      CREATE TABLE IF NOT EXISTS platform_workflow_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        workflow_id UUID REFERENCES platform_rules(id) ON DELETE SET NULL,
        workflow_name VARCHAR(200),
        workflow_version INTEGER NOT NULL DEFAULT 1,
        object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL,
        record_id UUID,
        trigger_key VARCHAR(100),
        parent_run_id UUID REFERENCES platform_workflow_runs(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error_text TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_runs_company
        ON platform_workflow_runs(company_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS platform_workflow_step_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES platform_workflow_runs(id) ON DELETE CASCADE,
        step_identifier VARCHAR(200),
        step_order INTEGER NOT NULL DEFAULT 0,
        action_type VARCHAR(60),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error_text TEXT,
        durable_job_id UUID REFERENCES platform_action_jobs(id) ON DELETE SET NULL,
        child_run_id UUID REFERENCES platform_workflow_runs(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_step_runs_run_order
        ON platform_workflow_step_runs(run_id, step_order);
      CREATE TABLE IF NOT EXISTS platform_workflow_screen_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        workflow_id UUID REFERENCES platform_rules(id) ON DELETE SET NULL,
        run_id UUID NOT NULL REFERENCES platform_workflow_runs(id) ON DELETE CASCADE,
        step_run_id UUID REFERENCES platform_workflow_step_runs(id) ON DELETE CASCADE,
        step_identifier VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        screen JSONB NOT NULL DEFAULT '{}'::jsonb,
        values JSONB NOT NULL DEFAULT '{}'::jsonb,
        workflow_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
        history JSONB NOT NULL DEFAULT '[]'::jsonb,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_screen_sessions_run
        ON platform_workflow_screen_sessions(run_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_platform_workflow_screen_sessions_company_status
        ON platform_workflow_screen_sessions(company_id, status, created_at DESC);
      CREATE TABLE IF NOT EXISTS platform_workflow_compensation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES platform_workflow_runs(id) ON DELETE CASCADE,
        step_run_id UUID REFERENCES platform_workflow_step_runs(id) ON DELETE SET NULL,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        action_type VARCHAR(60),
        status VARCHAR(20) NOT NULL,
        error_text TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_workflow_compensation_once
        ON platform_workflow_compensation_runs(run_id, step_run_id);

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
      CREATE TABLE IF NOT EXISTS platform_communication_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
        channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP')),
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
        channel VARCHAR(20) NOT NULL CHECK (channel IN ('EMAIL','SMS','WHATSAPP')),
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
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_platform_communication_events_company
        ON platform_communication_events(company_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_platform_communication_events_trigger
        ON platform_communication_events(company_id, channel, event_type, created_at DESC);

      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        phone_number_id VARCHAR(40) NOT NULL,
        wa_contact_id VARCHAR(80) NOT NULL,
        customer_phone VARCHAR(50),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN','HUMAN','CLOSED','OPTED_OUT')),
        assistant_mode VARCHAR(20) NOT NULL DEFAULT 'RULES',
        last_message_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, phone_number_id, wa_contact_id)
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_company_status
        ON whatsapp_conversations(company_id, status, last_message_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_customer
        ON whatsapp_conversations(company_id, customer_id);

      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
        provider_message_id VARCHAR(255),
        message_type VARCHAR(40) NOT NULL DEFAULT 'text',
        body TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(company_id, provider_message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
        ON whatsapp_messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company
        ON whatsapp_messages(company_id, created_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospitality_qr_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT TRUE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hospitality_qr_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE CASCADE,
        session_id UUID REFERENCES hospitality_table_sessions(id) ON DELETE SET NULL, sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        order_number VARCHAR(50) NOT NULL, items JSONB NOT NULL, subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax NUMERIC(12,2) NOT NULL DEFAULT 0, discount NUMERIC(12,2) NOT NULL DEFAULT 0, total NUMERIC(12,2) NOT NULL DEFAULT 0,
        payment_mode VARCHAR(20) NOT NULL DEFAULT 'PAY_AT_TILL', payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID',
        status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES hospitality_table_sessions(id) ON DELETE SET NULL;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(120);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_hospitality_order_client_request ON hospitality_qr_orders(company_id,store_id,client_request_id) WHERE client_request_id IS NOT NULL;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE hospitality_qr_orders ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS hospitality_bills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PAID','CANCELLED')),
        service_charge_type VARCHAR(20), service_charge_value NUMERIC(12,2) NOT NULL DEFAULT 0,
        service_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0, service_charge_taxable BOOLEAN NOT NULL DEFAULT FALSE,
        service_charge_tax NUMERIC(12,2) NOT NULL DEFAULT 0, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE hospitality_bills DROP CONSTRAINT IF EXISTS hospitality_bills_company_id_store_id_session_id_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hospitality_open_bill_per_session
        ON hospitality_bills(company_id,store_id,session_id) WHERE status='OPEN';
      CREATE TABLE IF NOT EXISTS hospitality_bill_sales (
        bill_id UUID NOT NULL REFERENCES hospitality_bills(id) ON DELETE CASCADE,
        sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
        source_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL, split_mode VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (bill_id,sale_id)
      );
      CREATE TABLE IF NOT EXISTS hospitality_bill_splits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bill_id UUID NOT NULL REFERENCES hospitality_bills(id) ON DELETE CASCADE,
        mode VARCHAR(20) NOT NULL CHECK (mode IN ('ITEMS','QUANTITY','EQUAL')), shares INTEGER NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS hospitality_bill_split_items (
        split_id UUID NOT NULL REFERENCES hospitality_bill_splits(id) ON DELETE CASCADE,
        source_sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
        split_sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
        quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0), PRIMARY KEY (split_id,split_sale_item_id)
      );
      CREATE TABLE IF NOT EXISTS hospitality_tips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE, bill_id UUID NOT NULL REFERENCES hospitality_bills(id) ON DELETE RESTRICT,
        session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT, amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hospitality_bill_sales_sale ON hospitality_bill_sales(sale_id);
      CREATE INDEX IF NOT EXISTS idx_hospitality_tips_session ON hospitality_tips(company_id,store_id,session_id,created_at);
      CREATE TABLE IF NOT EXISTS hospitality_table_merge_orders (
        merge_id UUID NOT NULL REFERENCES hospitality_table_merges(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES hospitality_qr_orders(id) ON DELETE CASCADE,
        original_session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        original_table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE RESTRICT,
        PRIMARY KEY (merge_id,order_id)
      );
      CREATE TABLE IF NOT EXISTS hospitality_table_merge_tickets (
        merge_id UUID NOT NULL REFERENCES hospitality_table_merges(id) ON DELETE CASCADE,
        ticket_id UUID NOT NULL REFERENCES hospitality_kds_tickets(id) ON DELETE CASCADE,
        original_session_id UUID NOT NULL REFERENCES hospitality_table_sessions(id) ON DELETE RESTRICT,
        original_table_id UUID NOT NULL REFERENCES hospitality_tables(id) ON DELETE RESTRICT,
        PRIMARY KEY (merge_id,ticket_id)
      );
      INSERT INTO hospitality_table_sessions (company_id,store_id,table_id,status,started_at)
      SELECT t.company_id,t.store_id,t.id,
             CASE WHEN COUNT(q.id)>0 THEN 'ORDERING' ELSE 'OPEN' END,
             COALESCE(MIN(q.created_at),NOW())
        FROM hospitality_tables t
        LEFT JOIN hospitality_qr_orders q ON q.company_id=t.company_id AND q.store_id=t.store_id
          AND q.table_id=t.id AND q.payment_status='UNPAID' AND q.status<>'CANCELLED'
       WHERE t.status IN ('OCCUPIED','MERGED') OR q.id IS NOT NULL
       GROUP BY t.company_id,t.store_id,t.id
      ON CONFLICT (company_id,store_id,table_id) WHERE status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') DO NOTHING;
      UPDATE hospitality_qr_orders q SET session_id=s.id
        FROM hospitality_table_sessions s
       WHERE q.session_id IS NULL AND q.company_id=s.company_id AND q.store_id=s.store_id AND q.table_id=s.table_id
         AND q.payment_status='UNPAID' AND q.status<>'CANCELLED'
         AND s.status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED');
      UPDATE hospitality_kds_tickets k SET session_id=s.id
        FROM hospitality_table_sessions s
       WHERE k.session_id IS NULL AND k.company_id=s.company_id AND k.store_id=s.store_id AND k.table_id=s.table_id
         AND s.status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED');
    `);


    await pool.query(`
      CREATE OR REPLACE VIEW hospitality_report_sessions AS
      SELECT s.id AS session_id, s.company_id, s.store_id, s.started_at::date AS report_date,
        f.name AS floor_name, t.table_number, COALESCE(u.full_name, u.username, 'Unknown') AS operator_name,
        s.status, s.guests,
        CASE WHEN EXISTS (SELECT 1 FROM hospitality_reservations r WHERE r.company_id=s.company_id AND r.store_id=s.store_id AND r.table_id=s.table_id AND r.reservation_date=s.started_at::date AND r.status <> 'CANCELLED') THEN 'RESERVATION' ELSE 'WALK_IN' END AS source,
        COALESCE(bill_totals.gross,0) AS gross, COALESCE(bill_totals.discount,0) AS discount, COALESCE(bill_totals.net,0) AS net,
        COALESCE(bill_totals.vat,0) AS vat, COALESCE(bill_totals.service_charge,0) AS service_charge, COALESCE(bill_totals.tips,0) AS tips,
        COALESCE(bill_totals.paid,0) AS paid, GREATEST(COALESCE(bill_totals.gross,0)-COALESCE(bill_totals.paid,0),0) AS remaining,
        bill_totals.payment_method, COALESCE(bill_totals.payment_count,0)::int AS payment_count,
        s.started_at AS opened_at, s.ended_at AS closed_at, EXTRACT(EPOCH FROM (COALESCE(s.ended_at,NOW())-s.started_at))/60 AS duration_minutes,
        CASE WHEN s.guests > 0 THEN COALESCE(bill_totals.gross,0)/s.guests ELSE 0 END AS average_spend_per_cover,
        kds.ticket_created, kds.ticket_completed,
        CASE WHEN kds.ticket_created IS NULL OR kds.ticket_completed IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (kds.ticket_completed-kds.ticket_created))/60 END AS preparation_duration,
        COALESCE(kds.delayed,false) AS delayed
      FROM hospitality_table_sessions s JOIN hospitality_tables t ON t.id=s.table_id JOIN hospitality_floors f ON f.id=t.floor_id
      LEFT JOIN users u ON u.id=s.started_by
      LEFT JOIN LATERAL (
        SELECT SUM(sa.total)::numeric AS gross, SUM(sa.discount)::numeric AS discount, SUM(sa.total-sa.discount)::numeric AS net,
          SUM(sa.tax)::numeric AS vat, SUM(sa.hospitality_service_charge_amount)::numeric AS service_charge,
          (SELECT SUM(ht.amount)::numeric FROM hospitality_tips ht WHERE ht.session_id=s.id) AS tips,
          (SELECT SUM(p.amount)::numeric FROM payments p WHERE p.sale_id IN (SELECT bs2.sale_id FROM hospitality_bill_sales bs2 JOIN hospitality_bills b2 ON b2.id=bs2.bill_id WHERE b2.session_id=s.id) AND p.status='completed' AND p.direction='IN') AS paid,
          (SELECT string_agg(DISTINCT p.payment_method, ', ' ORDER BY p.payment_method) FROM payments p WHERE p.sale_id IN (SELECT bs2.sale_id FROM hospitality_bill_sales bs2 JOIN hospitality_bills b2 ON b2.id=bs2.bill_id WHERE b2.session_id=s.id) AND p.status='completed' AND p.direction='IN') AS payment_method,
          (SELECT COUNT(*)::int FROM payments p WHERE p.sale_id IN (SELECT bs2.sale_id FROM hospitality_bill_sales bs2 JOIN hospitality_bills b2 ON b2.id=bs2.bill_id WHERE b2.session_id=s.id) AND p.status='completed' AND p.direction='IN') AS payment_count
        FROM hospitality_bills b JOIN hospitality_bill_sales bs ON bs.bill_id=b.id JOIN sales sa ON sa.id=bs.sale_id
        WHERE b.session_id=s.id AND b.company_id=s.company_id AND b.store_id=s.store_id
      ) bill_totals ON TRUE
      LEFT JOIN LATERAL (
        SELECT MIN(k.created_at) AS ticket_created, MAX(CASE WHEN k.status='COMPLETED' THEN k.updated_at END) AS ticket_completed,
          BOOL_OR(k.status <> 'COMPLETED' AND k.created_at < NOW()-INTERVAL '20 minutes') AS delayed
        FROM hospitality_kds_tickets k WHERE k.session_id=s.id AND k.company_id=s.company_id AND k.store_id=s.store_id
      ) kds ON TRUE;
    `);

    await pool.query(`
      ALTER TABLE online_orders
        DROP CONSTRAINT IF EXISTS online_orders_status_check;
      ALTER TABLE online_orders
        ADD CONSTRAINT online_orders_status_check
        CHECK (status IN ('RECEIVED', 'ACCEPTED', 'PREPARING', 'READY', 'READY_FOR_PICKUP', 'READY_FOR_DELIVERY', 'DRIVER_ACCEPTED', 'COLLECTED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'FAILED_DELIVERY', 'RETURNED', 'REJECTED', 'CANCELLED'));
    `);
    await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS user_email_domain VARCHAR(255);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS domain_users_only BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_registration_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS password_reset_email_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS registration_link_expiry_minutes INTEGER NOT NULL DEFAULT 1440;
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS password_reset_expiry_minutes INTEGER NOT NULL DEFAULT 60;

    CREATE TABLE IF NOT EXISTS platform_policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      api_key VARCHAR(120) NOT NULL, name VARCHAR(200) NOT NULL, policy_type VARCHAR(40) NOT NULL DEFAULT 'COMPANY_POLICY',
      version INTEGER NOT NULL DEFAULT 1, title VARCHAR(255) NOT NULL, body TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','INACTIVE')),
      require_acceptance BOOLEAN NOT NULL DEFAULT TRUE, applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
      display_order INTEGER NOT NULL DEFAULT 0, published_at TIMESTAMPTZ, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(company_id,api_key,version)
    );
    CREATE TABLE IF NOT EXISTS platform_policy_acceptances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      policy_id UUID NOT NULL REFERENCES platform_policies(id) ON DELETE RESTRICT, policy_version INTEGER NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(policy_id,policy_version,user_id)
    );
    CREATE TABLE IF NOT EXISTS account_action_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('REGISTRATION','PASSWORD_RESET')),
      token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS company_licence_allocations (
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, licence_id UUID NOT NULL REFERENCES licences(id) ON DELETE CASCADE,
      seats INTEGER NOT NULL DEFAULT 0 CHECK(seats>=0), assigned_by UUID REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(company_id,licence_id)
    );
    ALTER TABLE company_licence_allocations ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE company_licence_allocations ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
    ALTER TABLE company_licence_allocations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS user_licence_assignments (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      licence_id UUID NOT NULL REFERENCES licences(id) ON DELETE RESTRICT, assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE, starts_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
      CHECK(expires_at IS NULL OR starts_at IS NULL OR expires_at >= starts_at)
    );

    CREATE TABLE IF NOT EXISTS company_package_trials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      package_id UUID NOT NULL REFERENCES package_registry(id) ON DELETE CASCADE,
      activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      UNIQUE(company_id, package_id)
    );
    CREATE INDEX IF NOT EXISTS idx_company_package_trials_company
      ON company_package_trials(company_id, expires_at);
    CREATE TABLE IF NOT EXISTS onepos_runtime_state (
      state_key VARCHAR(120) PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE user_licence_assignments ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE user_licence_assignments ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
    ALTER TABLE user_licence_assignments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

    ALTER TABLE licence_bundles ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE licence_bundles ADD COLUMN IF NOT EXISTS installable BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE licence_bundles ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE licence_bundles ADD COLUMN IF NOT EXISTS allowed_companies UUID[] NOT NULL DEFAULT '{}';
    ALTER TABLE licence_bundles ADD COLUMN IF NOT EXISTS available_tiers TEXT[] NOT NULL DEFAULT '{}';

    ALTER TABLE licence_tiers ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE licence_tiers ADD COLUMN IF NOT EXISTS installable BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE licence_tiers ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE licence_tiers ADD COLUMN IF NOT EXISTS allowed_companies UUID[] NOT NULL DEFAULT '{}';
  `);

}
