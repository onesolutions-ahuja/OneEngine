import bcrypt from "bcryptjs";

export const ONEENGINE_MANAGE_PERMISSION = "oneengine.manage";

export async function bootstrapInitialSuperadmin(pool, env = process.env) {
  const configuredCompanyId = String(env.BOOTSTRAP_SUPERADMIN_COMPANY_ID || "").trim();
  const companyResult = configuredCompanyId
    ? await pool.query("SELECT id,name,user_email_domain FROM companies WHERE id=$1 AND active=true LIMIT 1", [configuredCompanyId])
    : await pool.query("SELECT id,name,user_email_domain FROM companies WHERE LOWER(name)=LOWER('onePOS Demo') AND active=true ORDER BY created_at,id LIMIT 1");
  const company = companyResult.rows[0] || null;
  if (!company) {
    console.warn("onePOS: Superadmin bootstrap skipped; no configured active company was found");
    return { superadminReady: false, reason: "company_not_configured" };
  }

  await pool.query(`INSERT INTO permissions (code,name,description) VALUES ('oneengine.manage','Manage OneEngine','Manage metadata across organisations inside OneDeveloper') ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`);

  let role = await pool.query("SELECT id FROM roles WHERE company_id=$1 AND api_key='platform_superadmin' ORDER BY created_at,id LIMIT 1", [company.id]);
  let roleId = role.rows[0]?.id || null;
  if (!roleId) {
    const inserted = await pool.query(`INSERT INTO roles (company_id,name,description,is_system_role,api_key) VALUES ($1,'Superadmin','Company-bound Superadmin. Authority is entirely RBAC-driven.',TRUE,'platform_superadmin') RETURNING id`, [company.id]);
    roleId = inserted.rows[0].id;
  } else {
    await pool.query(`UPDATE roles SET name='Superadmin',description='Company-bound Superadmin. Authority is entirely RBAC-driven.',is_system_role=TRUE WHERE id=$1`, [roleId]);
  }

  await pool.query(`INSERT INTO role_permissions (role_id,permission_id) SELECT $1,p.id FROM permissions p ON CONFLICT (role_id,permission_id) DO NOTHING`, [roleId]);

  // Superadmin is not a runtime bypass. Seed explicit Object RBAC grants so
  // its authority is represented in the same permission tables as every role.
  const objectPermissionColumns = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema=current_schema()
        AND table_name='platform_object_permissions'
        AND column_name IN ('can_import','can_export')`
  );
  const extendedObjectPermissions = new Set(objectPermissionColumns.rows.map((row) => row.column_name));
  const extraColumns = [
    extendedObjectPermissions.has('can_import') ? 'can_import' : null,
    extendedObjectPermissions.has('can_export') ? 'can_export' : null,
  ].filter(Boolean);
  const insertColumns = ['object_id','role_id','company_id','can_view','can_create','can_edit','can_delete', ...extraColumns];
  const selectValues = ['o.id','$1','$2','TRUE','TRUE','TRUE','TRUE', ...extraColumns.map(() => 'TRUE')];
  const updateValues = ['can_view=TRUE','can_create=TRUE','can_edit=TRUE','can_delete=TRUE', ...extraColumns.map((column) => `${column}=TRUE`)];
  await pool.query(
    `INSERT INTO platform_object_permissions (${insertColumns.join(',')})
     SELECT ${selectValues.join(',')}
       FROM platform_objects o
      WHERE o.active=true AND (o.company_id IS NULL OR o.company_id=$2)
     ON CONFLICT (object_id,role_id,company_id)
     DO UPDATE SET ${updateValues.join(',')}`,
    [roleId, company.id]
  );

  const configuredEmail = String(env.BOOTSTRAP_TENANT_SUPERADMIN_EMAIL || env.BOOTSTRAP_SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const domain = String(company.user_email_domain || "").trim().toLowerCase().replace(/^@/, "");
  const isDemoCompany = String(company.name || "").trim().toLowerCase() === "onepos demo";
  const legacyDemoEmails = new Set(["superadmin", "superadmin@local", "superadmin@onepos.local"]);
  const effectiveConfiguredEmail =
    isDemoCompany && legacyDemoEmails.has(configuredEmail)
      ? ""
      : configuredEmail;
  const email = effectiveConfiguredEmail || (isDemoCompany ? "superadmin@onepos.com" : (domain ? `superadmin@${domain}` : "superadmin@local"));
  const password = String(env.BOOTSTRAP_TENANT_SUPERADMIN_PASSWORD || env.BOOTSTRAP_SUPERADMIN_PASSWORD || "");
  const name = String(env.BOOTSTRAP_TENANT_SUPERADMIN_NAME || env.BOOTSTRAP_SUPERADMIN_NAME || `${company.name} Superadmin`).trim();

  let user = await pool.query(`SELECT id,password_hash,company_id FROM users WHERE company_id=$1 AND (LOWER(username)=LOWER($2) OR LOWER(email)=LOWER($2)) ORDER BY created_at,id LIMIT 1`, [company.id,email]);
  if (!user.rows[0]) {
    user = await pool.query(`SELECT id,password_hash,company_id FROM users WHERE company_id IS NULL AND (LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1)) ORDER BY created_at,id LIMIT 1`, [email]);
  }
  if (!user.rows[0]) {
    user = await pool.query(`SELECT u.id,u.password_hash,u.company_id FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE (r.api_key IN ('engine_manager','oneengine_manager') OR LOWER(COALESCE(u.username,''))='superadmin') ORDER BY u.created_at,u.id LIMIT 1`);
  }

  if (user.rows[0]) {
    const hash = password ? await bcrypt.hash(password,12) : user.rows[0].password_hash;
    await pool.query(`UPDATE users SET company_id=$1,role_id=$2,username=$3,email=$3,full_name=$4,password_hash=$5,active=TRUE,updated_at=NOW() WHERE id=$6`, [company.id,roleId,email,name,hash,user.rows[0].id]);
  } else {
    if (!password) throw new Error("BOOTSTRAP_SUPERADMIN_PASSWORD is required to create the company Superadmin");
    const hash = await bcrypt.hash(password,12);
    user = await pool.query(`INSERT INTO users (company_id,role_id,username,email,password_hash,full_name,active,must_change_password) VALUES ($1,$2,$3,$3,$4,$5,TRUE,TRUE) RETURNING id,password_hash,company_id`, [company.id,roleId,email,hash,name]);
  }

  await pool.query(`UPDATE users u SET company_id=$1, active=FALSE, username='legacy_engine_'||REPLACE(u.id::text,'-',''), email=NULL, updated_at=NOW() FROM roles r WHERE u.role_id=r.id AND u.id<>$2 AND u.company_id IS NULL AND r.api_key IN ('engine_manager','oneengine_manager')`, [company.id,user.rows[0].id]);

  console.log("onePOS: company-bound Superadmin synchronized through RBAC", { companyId: company.id, email });
  return { superadminReady: true, superadminEmail: email, companyId: company.id, roleId };
}
