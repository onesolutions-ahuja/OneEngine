from pathlib import Path

p = Path('server/database/init.js')
s = p.read_text()

# Superadmin is an ordinary company-bound role and receives the complete catalogue.
s = s.replace("            WHERE r.api_key='platform_superadmin'\n              AND p.code NOT IN ('oneengine.manage','platform.manage')", "            WHERE r.api_key='platform_superadmin'")

# Replace the final legacy 0019/0020 migration pair. 0020 is the last migration,
# so the stable boundary is the migration-array terminator rather than another key.
key19 = s.index('key: \"0019_dual_superadmin_seed\"')
start = s.rfind('    {', 0, key19)
end = s.index('\n  ]);', key19)
replacement = '''    {
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
    },'''
s = s[:start] + replacement + s[end:]

# Remove old global Platform Developer role seed when present.
legacy_start = s.find('    /* Global Platform Developer role:')
if legacy_start >= 0:
    legacy_end = s.index('    await pool.query(`\n    ALTER TABLE companies', legacy_start)
    s = s[:legacy_start] + s[legacy_end:]

# Delegate all active bootstrap behaviour to the small canonical module.
block_start = s.index('export const ONEENGINE_MANAGE_PERMISSION')
block_end = s.index('\nasync function initializeLegacyDatabase', block_start)
replacement = '''export { ONEENGINE_MANAGE_PERMISSION, PLATFORM_MANAGE_PERMISSION } from "./rbacBootstrap.js";
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
'''
s = s[:block_start] + replacement + s[block_end:]
p.write_text(s)

p = Path('server/server.js')
s = p.read_text()
s = s.replace('import { bootstrapInitialSuperadmin, ensureGlobalSystemProfile, initializeDatabase } from "./database/init.js";', 'import { initializeDatabase } from "./database/init.js";\nimport { bootstrapInitialSuperadmin } from "./database/rbacBootstrap.js";')
start = s.find('    const developerRoleId = await ensureGlobalSystemProfile(pool, {')
if start >= 0:
    end_marker = '    console.log("onePOS: platform bootstrap ready");'
    end = s.index(end_marker, start)
    s = s[:start] + s[end:]
p.write_text(s)
