const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
import { internalAppCatalogSchema, seedInternalAppCatalog } from "./internalAppCatalog.js";
import { packageRegistrySchema, provisionPackageMetadata, seedPackageRegistry } from "./packageRegistry.js";
import { deploymentSchema } from "./platformMetadataDeployment.js";
import { PLATFORM_FIELD_TYPE_SQL } from "./platformFieldTypes.js";

export function toSafeApiName(label, fallback = "field") {
  const normalized = String(label || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
    .slice(0, 100)
    .replace(/_+$/g, "");
  return normalized || fallback;
}

export const RELATIONSHIP_LINK_OWNERS = Object.freeze({ CHILD: "child", PARENT: "parent" });

/**
 * Resolve the foreign-key field that stores a Platform relationship link.
 *
 * The relationship seed declares a link column, not the side that owns it: an
 * `one_to_many`/`many_to_many` child stores the reference to its parent, while a
 * `lookup` keeps the FK on the parent pointing at the single related record.
 * Resolution therefore follows the column through the object metadata instead of
 * assuming the child owns it, and returns `mapped: false` rather than inventing
 * metadata for a column that neither object maps.
 *
 * `platform_relationships.child_field_id` is consumed by the related-records
 * reader, the rollup evaluator and the Relationship Editor as a field of the
 * CHILD object, so only a child-owned link column can be stored there. A
 * parent-owned lookup is reported with `owner: "parent"` and a null
 * `childFieldId` so callers can still register (or act on) the relationship
 * without generating SQL against a column the child table does not have.
 */
export async function resolveRelationshipLink({ query, relationshipType, column, parent, child }) {
  if (!column) return { owner: null, field: null, childFieldId: null, column: null, mapped: true, objectKey: null };
  const childOwned = relationshipType !== "lookup";
  const candidates = childOwned
    ? [[child, RELATIONSHIP_LINK_OWNERS.CHILD], [parent, RELATIONSHIP_LINK_OWNERS.PARENT]]
    : [[parent, RELATIONSHIP_LINK_OWNERS.PARENT], [child, RELATIONSHIP_LINK_OWNERS.CHILD]];
  for (const [object, owner] of candidates) {
    if (!object?.id) continue;
    const result = await query(
      `SELECT id, api_name, source_column FROM platform_fields
        WHERE object_id=$1 AND (api_name=$2 OR source_column=$2) AND company_id IS NULL
        ORDER BY (api_name=$2) DESC
        LIMIT 1`,
      [object.id, column]
    );
    const field = result.rows[0];
    if (!field) continue;
    return {
      owner,
      field,
      childFieldId: owner === RELATIONSHIP_LINK_OWNERS.CHILD ? field.id : null,
      column,
      mapped: true,
      objectKey: object.object_key || null,
    };
  }
  return { owner: null, field: null, childFieldId: null, column, mapped: false, objectKey: null };
}

/** True when the authoritative source table really has the declared link column. */
export async function sourceColumnExists({ query, table, column }) {
  if (!isSafeIdentifier(table) || !isSafeIdentifier(column)) return false;
  const result = await query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1",
    [table, column]
  );
  return result.rows.length > 0;
}

export const platformSchema = `
  CREATE TABLE IF NOT EXISTS platform_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    installed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ${internalAppCatalogSchema}
  ${packageRegistrySchema}
  ${deploymentSchema}
  CREATE TABLE IF NOT EXISTS onestore_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_key VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    svg TEXT,
    landing_route TEXT,
    category VARCHAR(100),
    publisher VARCHAR(200),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    installable BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS tenant_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    onestore_app_id UUID NOT NULL REFERENCES onestore_apps(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
      CHECK (status IN ('AVAILABLE','INSTALLED','ACTIVE','INACTIVE')),
    installed_version VARCHAR(40),
    available_version VARCHAR(40),
    licence_required BOOLEAN NOT NULL DEFAULT FALSE,
    trial_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    licence_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
    trial_started_at TIMESTAMPTZ,
    trial_expires_at TIMESTAMPTZ,
    update_status VARCHAR(20) NOT NULL DEFAULT 'CURRENT',
    installed_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id,onestore_app_id)
  );
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS available_version VARCHAR(40);
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS licence_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS trial_eligible BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS licence_status VARCHAR(20) NOT NULL DEFAULT 'NONE';
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS update_status VARCHAR(20) NOT NULL DEFAULT 'CURRENT';
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS is_installed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS launchable BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE tenant_apps ADD COLUMN IF NOT EXISTS storefront_state VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE';
  CREATE INDEX IF NOT EXISTS idx_tenant_apps_company_status ON tenant_apps(company_id,status);
  ALTER TABLE roles ADD COLUMN IF NOT EXISTS parent_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_roles_company_parent ON roles(company_id,parent_role_id);
  CREATE TABLE IF NOT EXISTS platform_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID REFERENCES platform_modules(id) ON DELETE SET NULL,
    package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    object_key VARCHAR(100) NOT NULL UNIQUE,
    api_name VARCHAR(100),
    label VARCHAR(200) NOT NULL,
    plural_label VARCHAR(200),
    description TEXT,
    source_table VARCHAR(100),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    company_scoped BOOLEAN NOT NULL DEFAULT TRUE,
    store_scoped BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source_table IS NULL OR source_table ~ '^[a-z_][a-z0-9_]*$')
  );
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS api_name VARCHAR(100);
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_connector_definitions ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE IF EXISTS platform_connector_definitions ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE IF EXISTS platform_connector_definitions ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_connector_definitions ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_connector_definitions ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_message_templates ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE IF EXISTS platform_message_templates ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE IF EXISTS platform_message_templates ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_message_templates ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE IF EXISTS platform_message_templates ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  UPDATE platform_objects SET api_name=object_key WHERE api_name IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_objects_company_api_name ON platform_objects(company_id, api_name) WHERE company_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS platform_object_settings (
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (company_id, object_id)
  );
    CREATE TABLE IF NOT EXISTS platform_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    api_name VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    field_type VARCHAR(30) NOT NULL CHECK (field_type IN (${PLATFORM_FIELD_TYPE_SQL})),
    source_column VARCHAR(100),
    required BOOLEAN NOT NULL DEFAULT FALSE,
    readable BOOLEAN NOT NULL DEFAULT TRUE,
    writable BOOLEAN NOT NULL DEFAULT FALSE,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, api_name)
  );
  CREATE TABLE IF NOT EXISTS platform_auto_number_counters (
    field_id UUID PRIMARY KEY REFERENCES platform_fields(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    next_value BIGINT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS platform_matching_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    rule_key VARCHAR(120) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    match_mode VARCHAR(10) NOT NULL DEFAULT 'ALL' CHECK (match_mode IN ('ANY','ALL')),
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, object_id, rule_key)
  );
  CREATE TABLE IF NOT EXISTS platform_duplicate_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    matching_rule_id UUID NOT NULL REFERENCES platform_matching_rules(id) ON DELETE CASCADE,
    rule_key VARCHAR(120) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    action VARCHAR(10) NOT NULL DEFAULT 'BLOCK' CHECK (action IN ('ALLOW','WARN','BLOCK')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, object_id, rule_key)
  );
  CREATE INDEX IF NOT EXISTS idx_platform_matching_rules_object
    ON platform_matching_rules(company_id, object_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_duplicate_rules_object
    ON platform_duplicate_rules(company_id, object_id, active);
  CREATE TABLE IF NOT EXISTS platform_field_security (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    field_id UUID NOT NULL REFERENCES platform_fields(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    readable BOOLEAN NOT NULL DEFAULT TRUE,
    writable BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (field_id, role_id, company_id)
  );
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_field_security_id ON platform_field_security(id);
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_field_security ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS platform_registered_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
    action_key VARCHAR(140) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    handler_key VARCHAR(140) NOT NULL,
    required_permission VARCHAR(140),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE platform_registered_actions ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_registered_actions ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_registered_actions ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_registered_actions ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_registered_actions ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_registered_actions_global ON platform_registered_actions(action_key) WHERE company_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_registered_actions_company ON platform_registered_actions(company_id, action_key) WHERE company_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS platform_buttons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
    button_key VARCHAR(140) NOT NULL,
    label VARCHAR(200) NOT NULL,
    icon VARCHAR(100),
    action_key VARCHAR(140) NOT NULL,
    placement VARCHAR(80) NOT NULL DEFAULT 'record',
    visibility_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_buttons ALTER COLUMN action_key DROP NOT NULL;
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS target_type VARCHAR(20) NOT NULL DEFAULT 'action';
  ALTER TABLE platform_buttons DROP CONSTRAINT IF EXISTS platform_buttons_target_type_check;
  ALTER TABLE platform_buttons ADD CONSTRAINT platform_buttons_target_type_check
    CHECK (target_type IN ('action','workflow','modal','crud','navigation','command'));
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS target_key VARCHAR(140);
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS variant VARCHAR(30) NOT NULL DEFAULT 'primary';
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS required_permission VARCHAR(140);
  ALTER TABLE platform_buttons ADD COLUMN IF NOT EXISTS input_mappings JSONB NOT NULL DEFAULT '{}'::jsonb;
  UPDATE platform_buttons SET target_key=action_key WHERE target_key IS NULL AND action_key IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_buttons_global ON platform_buttons(button_key) WHERE company_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_buttons_company ON platform_buttons(company_id, button_key) WHERE company_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS platform_action_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
    event_key VARCHAR(140) NOT NULL,
    action_key VARCHAR(140) NOT NULL,
    condition_rule_id UUID,
    validation_rule_id UUID,
    execution_order INTEGER NOT NULL DEFAULT 100,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_platform_action_bindings_event ON platform_action_bindings(company_id, object_id, event_key, active, execution_order);
  CREATE TABLE IF NOT EXISTS platform_object_permissions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_create BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (object_id, role_id, company_id)
  );
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS can_import BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS can_export BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_object_permissions_id ON platform_object_permissions(id);
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_object_permissions ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS platform_permission_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) NOT NULL,
    description TEXT,
    system_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    object_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, api_key)
  );
  CREATE TABLE IF NOT EXISTS platform_permission_set_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_set_id UUID NOT NULL REFERENCES platform_permission_sets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
    UNIQUE(permission_set_id, user_id, company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_permission_set_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, api_key)
  );
  CREATE TABLE IF NOT EXISTS platform_permission_set_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES platform_permission_set_groups(id) ON DELETE CASCADE,
    permission_set_id UUID NOT NULL REFERENCES platform_permission_sets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, permission_set_id, company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_permission_set_group_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES platform_permission_set_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
    UNIQUE(group_id, user_id, company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_public_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, api_key)
  );
  CREATE TABLE IF NOT EXISTS platform_public_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES platform_public_groups(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    member_type VARCHAR(12) NOT NULL CHECK (member_type IN ('USER','ROLE','GROUP')),
    member_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id,member_type,member_id,company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    api_key VARCHAR(100) NOT NULL,
    description TEXT,
    supported_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
    claim_behavior VARCHAR(20) NOT NULL DEFAULT 'ANY_MEMBER' CHECK (claim_behavior IN ('ANY_MEMBER','ORDERED')),
    allow_record_ownership BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, api_key)
  );
  CREATE TABLE IF NOT EXISTS platform_queue_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES platform_queues(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    member_type VARCHAR(12) NOT NULL CHECK (member_type IN ('USER','ROLE','GROUP')),
    member_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(queue_id,member_type,member_id,company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_queue_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID NOT NULL REFERENCES platform_queues(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(company_id,object_id,record_id)
  );
  CREATE TABLE IF NOT EXISTS platform_object_sharing_settings (
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    default_access VARCHAR(20) NOT NULL DEFAULT 'read_write' CHECK (default_access IN ('private','read_only','read_write')),
    owner_field_api_name VARCHAR(100),
    owner_type_field_api_name VARCHAR(100),
    hierarchy_grants_access BOOLEAN NOT NULL DEFAULT FALSE,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(object_id,company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_sharing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    rule_key VARCHAR(100) NOT NULL,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('owner','criteria')),
    source_owner_type VARCHAR(12) NOT NULL DEFAULT 'ANY' CHECK (source_owner_type IN ('ANY','USER','ROLE','GROUP','QUEUE')),
    source_owner_id UUID,
    source_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_type VARCHAR(12) NOT NULL CHECK (target_type IN ('USER','ROLE','GROUP','QUEUE')),
    target_id UUID NOT NULL,
    access_level VARCHAR(12) NOT NULL CHECK (access_level IN ('READ','READ_WRITE')),
    active BOOLEAN NOT NULL DEFAULT FALSE,
    execution_order INTEGER NOT NULL DEFAULT 100,
    source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    source_package_version VARCHAR(40),
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    package_required BOOLEAN NOT NULL DEFAULT FALSE,
    user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(object_id,company_id,rule_key)
  );
  CREATE INDEX IF NOT EXISTS idx_platform_permission_set_assignment_user ON platform_permission_set_assignments(company_id,user_id,active);
  CREATE INDEX IF NOT EXISTS idx_platform_permission_set_group_assignment_user ON platform_permission_set_group_assignments(company_id,user_id,active);
  CREATE INDEX IF NOT EXISTS idx_platform_permission_set_group_members_set ON platform_permission_set_group_members(company_id,permission_set_id);
  CREATE INDEX IF NOT EXISTS idx_platform_public_group_members ON platform_public_group_members(company_id,group_id,member_type);
  CREATE INDEX IF NOT EXISTS idx_platform_queue_members ON platform_queue_members(company_id,queue_id,member_type);
  CREATE INDEX IF NOT EXISTS idx_platform_queue_records_queue ON platform_queue_records(company_id,queue_id,active,assigned_at);
  CREATE INDEX IF NOT EXISTS idx_platform_sharing_rules_object ON platform_sharing_rules(company_id,object_id,active,execution_order);
  CREATE TABLE IF NOT EXISTS platform_record_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    object_key VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    field_api_name VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    action VARCHAR(20) NOT NULL CHECK (action IN ('create','update','delete')),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS platform_approval_processes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, company_id, name)
  );
  CREATE TABLE IF NOT EXISTS platform_approval_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES platform_approval_processes(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL CHECK (step_order > 0),
    label VARCHAR(200) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    UNIQUE (process_id, step_order)
  );
  CREATE TABLE IF NOT EXISTS platform_approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id UUID NOT NULL REFERENCES platform_approval_processes(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    current_step INTEGER NOT NULL DEFAULT 1,
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS platform_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    rule_key VARCHAR(100) NOT NULL,
    target_type VARCHAR(12) NOT NULL CHECK (target_type IN ('USER','ROLE','QUEUE')),
    target_id UUID NOT NULL,
    assignment_field VARCHAR(100) NOT NULL DEFAULT 'assigned_to',
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, company_id, rule_key)
  );
  CREATE INDEX IF NOT EXISTS idx_platform_assignment_rules_object ON platform_assignment_rules(company_id, object_id, active, priority DESC);
  CREATE TABLE IF NOT EXISTS platform_approval_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES platform_approval_requests(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('approve','reject')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS platform_value_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value_set_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, value_set_key)
  );
  CREATE TABLE IF NOT EXISTS platform_value_set_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    value_set_id UUID NOT NULL REFERENCES platform_value_sets(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (value_set_id, value)
  );
  CREATE TABLE IF NOT EXISTS platform_record_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    record_type_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    default_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, company_id, record_type_key)
  );
  CREATE TABLE IF NOT EXISTS platform_record_type_picklist_values (
    record_type_id UUID NOT NULL REFERENCES platform_record_types(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES platform_fields(id) ON DELETE CASCADE,
    value VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (record_type_id, field_id, value)
  );
  CREATE TABLE IF NOT EXISTS platform_record_associations (
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    record_type_id UUID REFERENCES platform_record_types(id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (object_id, record_id)
  );
  CREATE TABLE IF NOT EXISTS platform_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    child_object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    relationship_key VARCHAR(100) NOT NULL,
    label VARCHAR(200),
    description TEXT,
    relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN ('lookup','one_to_many','many_to_many')),
    child_field_id UUID REFERENCES platform_fields(id) ON DELETE RESTRICT,
    on_delete VARCHAR(20) NOT NULL DEFAULT 'restrict' CHECK (on_delete IN ('restrict','cascade','set_null')),
    on_update VARCHAR(20) NOT NULL DEFAULT 'restrict' CHECK (on_update IN ('restrict','cascade','set_null')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (parent_object_id, relationship_key)
  );
  ALTER TABLE platform_relationships ADD COLUMN IF NOT EXISTS label VARCHAR(200);
  ALTER TABLE platform_relationships ADD COLUMN IF NOT EXISTS description TEXT;
  /* Self-referencing relationships are valid Platform metadata (for example
     sale -> original_transactions, where a return references the sale it came
     from). An earlier revision of this schema forbade a relationship whose
     parent and child are the same object, so that constraint is dropped from
     databases that were created with it. */
  DO $$ BEGIN
    IF to_regclass('platform_relationships') IS NOT NULL THEN
      ALTER TABLE platform_relationships DROP CONSTRAINT IF EXISTS platform_relationships_check;
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS platform_list_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    view_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort JSONB NOT NULL DEFAULT '{"field":null,"direction":"asc"}'::jsonb,
    page_size INTEGER NOT NULL DEFAULT 50,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, company_id, view_key)
  );
  ALTER TABLE platform_list_views
    ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40),
    ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS shared_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS filter_model JSONB NOT NULL DEFAULT '{}'::jsonb;
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname='platform_list_views_visibility_scope_check'
    ) THEN
      ALTER TABLE platform_list_views
        ADD CONSTRAINT platform_list_views_visibility_scope_check
        CHECK (visibility_scope IN ('private','company','roles'));
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS platform_list_view_preferences (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    list_view_id UUID REFERENCES platform_list_views(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id,user_id,object_id)
  );
  CREATE TABLE IF NOT EXISTS platform_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    report_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{"groupBy":null,"metrics":[{"type":"count"}]}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, company_id, report_key)
  );
  CREATE TABLE IF NOT EXISTS platform_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID NOT NULL REFERENCES platform_objects(id) ON DELETE CASCADE,
    page_type VARCHAR(30) NOT NULL CHECK (page_type IN ('list','detail','view','create','edit','quick_create')),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    layout_key VARCHAR(100) NOT NULL DEFAULT '',
    definition JSONB NOT NULL DEFAULT '{"components":[]}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (object_id, page_type, role_id, company_id)
  );
  CREATE TABLE IF NOT EXISTS platform_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    app_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{"defaultPage":null,"theme":{"primary":"#0f172a"}}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, app_key)
  );
  ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_apps ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS platform_layout_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id UUID NOT NULL REFERENCES platform_layouts(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    app_id UUID REFERENCES platform_apps(id) ON DELETE CASCADE,
    record_type_id UUID REFERENCES platform_record_types(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    device_profile VARCHAR(20) NOT NULL DEFAULT 'any',
    required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname='platform_layout_assignments_device_check'
    ) THEN
      ALTER TABLE platform_layout_assignments
        ADD CONSTRAINT platform_layout_assignments_device_check
        CHECK (device_profile IN ('any','desktop','tablet','mobile'));
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS idx_platform_layout_assignments_layout
    ON platform_layout_assignments(layout_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_layout_assignments_scope
    ON platform_layout_assignments(company_id, app_id, record_type_id, role_id, device_profile, active);
  CREATE TABLE IF NOT EXISTS platform_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES platform_apps(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    page_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    route_path VARCHAR(200) NOT NULL DEFAULT '/',
    page_type VARCHAR(30) NOT NULL DEFAULT 'page' CHECK (page_type IN ('page','dashboard','modal')),
    definition JSONB NOT NULL DEFAULT '{"components":[]}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (app_id, company_id, page_key)
  );
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS source_package_version VARCHAR(40);
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS package_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS user_modified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS active_version INTEGER;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS draft_version INTEGER;
  ALTER TABLE platform_pages ADD COLUMN IF NOT EXISTS draft_definition JSONB;
  ALTER TABLE platform_pages DROP CONSTRAINT IF EXISTS platform_pages_page_type_check;
  ALTER TABLE platform_pages ADD CONSTRAINT platform_pages_page_type_check
    CHECK (page_type IN ('page','dashboard','modal','object','list_view','report'));
  UPDATE platform_pages
     SET lifecycle_status=CASE WHEN active=true THEN 'ACTIVE' ELSE 'INACTIVE' END
   WHERE lifecycle_status IS NULL OR lifecycle_status NOT IN ('DRAFT','ACTIVE','INACTIVE');
  UPDATE platform_pages SET active_version=version WHERE active=true AND active_version IS NULL;
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname='platform_pages_lifecycle_status_check'
    ) THEN
      ALTER TABLE platform_pages
        ADD CONSTRAINT platform_pages_lifecycle_status_check
        CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE'));
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS platform_page_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES platform_pages(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    definition JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
      CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id,version)
  );
  CREATE INDEX IF NOT EXISTS idx_platform_page_versions_page ON platform_page_versions(page_id,version DESC);
  CREATE TABLE IF NOT EXISTS platform_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_id UUID REFERENCES platform_objects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    trigger_key VARCHAR(100) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    action JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS landing_flow JSONB NOT NULL DEFAULT '{"rules":[],"defaultDestination":"/app/dashboard"}'::jsonb;
  ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS jarves_behaviour_media JSONB NOT NULL DEFAULT '{"behaviour_1":"/jarves.mp4","behaviour_2":"/jarves.mp4","behaviour_3":"/jarves.mp4"}'::jsonb;
  ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE'));
  UPDATE platform_rules SET lifecycle_status=CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END WHERE lifecycle_status='DRAFT' AND created_at < NOW();
  ALTER TABLE platform_approval_processes ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE'));
  ALTER TABLE platform_approval_processes ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE platform_approval_steps ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
  UPDATE platform_approval_processes SET lifecycle_status=CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END WHERE lifecycle_status='DRAFT' AND created_at < NOW();
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES package_registry(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_platform_objects_package ON platform_objects(package_id);
  CREATE TABLE IF NOT EXISTS platform_automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES platform_rules(id) ON DELETE SET NULL,
    object_id UUID REFERENCES platform_objects(id) ON DELETE SET NULL,
    record_id UUID,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    trigger VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_platform_fields_object ON platform_fields(object_id, display_order);
  CREATE INDEX IF NOT EXISTS idx_platform_field_security_role ON platform_field_security(role_id, company_id);
  CREATE INDEX IF NOT EXISTS idx_platform_record_history_record ON platform_record_history(object_id, record_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_platform_approval_requests_company ON platform_approval_requests(company_id, status, submitted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_platform_value_sets_company ON platform_value_sets(company_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_value_set_values_set ON platform_value_set_values(value_set_id, display_order);
  CREATE INDEX IF NOT EXISTS idx_platform_layouts_object ON platform_layouts(object_id, page_type);
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  ALTER TABLE platform_objects ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE platform_fields ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE platform_fields ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  ALTER TABLE platform_fields DROP CONSTRAINT IF EXISTS platform_fields_object_id_api_name_key;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_fields_global_name ON platform_fields(object_id, api_name) WHERE company_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_fields_tenant_name ON platform_fields(object_id, company_id, api_name) WHERE company_id IS NOT NULL;
  ALTER TABLE platform_record_associations ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
  DO $$ BEGIN
    IF to_regclass('platform_fields') IS NOT NULL THEN
      ALTER TABLE platform_fields DROP CONSTRAINT IF EXISTS platform_fields_field_type_check;
      UPDATE platform_fields SET field_type = CASE lower(trim(field_type))
        WHEN 'string' THEN 'text'
        WHEN 'integer' THEN 'number'
        WHEN 'float' THEN 'decimal'
        WHEN 'timestamp' THEN 'datetime'
        ELSE lower(trim(field_type)) END;
      ALTER TABLE platform_fields ADD CONSTRAINT platform_fields_field_type_check
        CHECK (field_type IN (${PLATFORM_FIELD_TYPE_SQL}));
    END IF;
  END $$;
  ALTER TABLE platform_relationships ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE platform_rules ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS layout_key VARCHAR(100) NOT NULL DEFAULT '';
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS record_type_id UUID REFERENCES platform_record_types(id) ON DELETE CASCADE;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS active_version INTEGER;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS draft_version INTEGER;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS draft_definition JSONB;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS draft_metadata JSONB;
  ALTER TABLE platform_layouts ADD COLUMN IF NOT EXISTS draft_assignments JSONB;
  UPDATE platform_layouts
     SET lifecycle_status=CASE WHEN active=true THEN 'ACTIVE' ELSE 'INACTIVE' END
   WHERE lifecycle_status IS NULL OR lifecycle_status NOT IN ('DRAFT','ACTIVE','INACTIVE');
  UPDATE platform_layouts SET active_version=version WHERE active=true AND active_version IS NULL;
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname='platform_layouts_lifecycle_status_check'
    ) THEN
      ALTER TABLE platform_layouts
        ADD CONSTRAINT platform_layouts_lifecycle_status_check
        CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE'));
    END IF;
  END $$;
  CREATE TABLE IF NOT EXISTS platform_layout_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_id UUID NOT NULL REFERENCES platform_layouts(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    definition JSONB NOT NULL,
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
      CHECK (lifecycle_status IN ('DRAFT','ACTIVE','INACTIVE')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(layout_id,version)
  );
  ALTER TABLE platform_layout_versions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  ALTER TABLE platform_layout_versions ADD COLUMN IF NOT EXISTS assignments JSONB NOT NULL DEFAULT '[]'::jsonb;
  CREATE INDEX IF NOT EXISTS idx_platform_layout_versions_layout ON platform_layout_versions(layout_id,version DESC);
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='platform_layouts'::regclass AND conname='platform_layouts_page_type_check') THEN
      ALTER TABLE platform_layouts DROP CONSTRAINT platform_layouts_page_type_check;
    END IF;
    ALTER TABLE platform_layouts ADD CONSTRAINT platform_layouts_page_type_check
      CHECK (page_type IN ('list','detail','view','create','edit','quick_create'));
  END $$;
  ALTER TABLE platform_record_types ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
  /* platform_record_types.company_id is nullable and PostgreSQL treats NULLs as
     distinct in UNIQUE(object_id, company_id, record_type_key), so every
     bootstrap inserted another copy of each global record type. Collapse the
     duplicates onto one canonical row (preferring the default/active copy),
     repoint every reference, then enforce uniqueness with partial indexes for
     the global (company_id IS NULL) and tenant (company_id IS NOT NULL) cases. */
  WITH duplicate_record_types AS (
    SELECT id,
           FIRST_VALUE(id) OVER (
             PARTITION BY object_id, record_type_key
             ORDER BY is_default DESC, active DESC, created_at, id
           ) AS canonical_id
      FROM platform_record_types
     WHERE company_id IS NULL
  )
  UPDATE platform_layouts l SET record_type_id = d.canonical_id
    FROM duplicate_record_types d
   WHERE l.record_type_id = d.id AND d.id <> d.canonical_id;
  WITH duplicate_record_types AS (
    SELECT id,
           FIRST_VALUE(id) OVER (
             PARTITION BY object_id, record_type_key
             ORDER BY is_default DESC, active DESC, created_at, id
           ) AS canonical_id
      FROM platform_record_types
     WHERE company_id IS NULL
  )
  UPDATE platform_record_associations a SET record_type_id = d.canonical_id
    FROM duplicate_record_types d
   WHERE a.record_type_id = d.id AND d.id <> d.canonical_id;
  WITH duplicate_record_types AS (
    SELECT id,
           FIRST_VALUE(id) OVER (
             PARTITION BY object_id, record_type_key
             ORDER BY is_default DESC, active DESC, created_at, id
           ) AS canonical_id
      FROM platform_record_types
     WHERE company_id IS NULL
  )
  DELETE FROM platform_record_type_picklist_values v
   USING duplicate_record_types d
   WHERE v.record_type_id = d.id AND d.id <> d.canonical_id
     AND EXISTS (
       SELECT 1 FROM platform_record_type_picklist_values keep
        WHERE keep.record_type_id = d.canonical_id AND keep.field_id = v.field_id AND keep.value = v.value
     );
  WITH duplicate_record_types AS (
    SELECT id,
           FIRST_VALUE(id) OVER (
             PARTITION BY object_id, record_type_key
             ORDER BY is_default DESC, active DESC, created_at, id
           ) AS canonical_id
      FROM platform_record_types
     WHERE company_id IS NULL
  )
  UPDATE platform_record_type_picklist_values v SET record_type_id = d.canonical_id
    FROM duplicate_record_types d
   WHERE v.record_type_id = d.id AND d.id <> d.canonical_id;
  WITH duplicate_record_types AS (
    SELECT id,
           FIRST_VALUE(id) OVER (
             PARTITION BY object_id, record_type_key
             ORDER BY is_default DESC, active DESC, created_at, id
           ) AS canonical_id
      FROM platform_record_types
     WHERE company_id IS NULL
  )
  DELETE FROM platform_record_types t
   USING duplicate_record_types d
   WHERE t.id = d.id AND d.id <> d.canonical_id;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_record_types_global
    ON platform_record_types(object_id, record_type_key) WHERE company_id IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_record_types_tenant
    ON platform_record_types(object_id, company_id, record_type_key) WHERE company_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_layouts_object_page_key
    ON platform_layouts(object_id, page_type, layout_key) WHERE layout_key <> '';
  CREATE INDEX IF NOT EXISTS idx_platform_objects_company ON platform_objects(company_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_rules_company ON platform_rules(company_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_record_types_object ON platform_record_types(object_id, company_id, active);
  CREATE INDEX IF NOT EXISTS idx_platform_record_associations_type ON platform_record_associations(object_id, record_type_id);
`;

const retailObjects = [];

const operationalObjects = [];

export async function initializePlatformMetadata(pool, { includeOperationalObjects = false } = {}) {
  const bootstrapQuery = async (label, sql, params = []) => {
    const startedAt = Date.now();
    console.log(`onePOS: platform bootstrap step start: ${label}`);
    try {
      const result = await pool.query({
        text: sql,
        values: params,
        query_timeout: 30000,
      });
      console.log(`onePOS: platform bootstrap step ready: ${label} (${Date.now() - startedAt}ms)`);
      return result;
    } catch (error) {
      console.error(`onePOS: platform bootstrap step failed: ${label}`, error);
      throw error;
    }
  };
  await bootstrapQuery("schema", platformSchema);
  console.log("onePOS: platform bootstrap step start: internal app catalog");
  await seedInternalAppCatalog(pool);
  console.log("onePOS: platform bootstrap step ready: internal app catalog");
  console.log("onePOS: platform bootstrap step start: package registry");
  await seedPackageRegistry(pool);
  console.log("onePOS: platform bootstrap step ready: package registry");

  /*
   * Retail transaction storage is exposed through canonical metadata Objects:
   * Sale, Sale Item, Payment, Refund, Till Session and Cash Movement.
   * Remove only the obsolete legacy sale_line alias before package metadata is
   * provisioned; the canonical sale_item object owns sale_items metadata.
   */
  const obsoleteSaleLine = await pool.query(
    "SELECT id FROM platform_objects WHERE object_key='sale_line' AND source_table='sale_items' AND company_id IS NULL LIMIT 1"
  );
  if (obsoleteSaleLine.rows[0]?.id) {
    const obsoleteObjectId = obsoleteSaleLine.rows[0].id;
    const obsoleteMetadataIds = await pool.query(
      `SELECT id FROM platform_fields WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_relationships WHERE parent_object_id=$1 OR child_object_id=$1
       UNION ALL
       SELECT id FROM platform_layouts WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_rules WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_reports WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_list_views WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_object_permissions WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_registered_actions WHERE object_id=$1
       UNION ALL
       SELECT id FROM platform_buttons WHERE object_id=$1`,
      [obsoleteObjectId]
    );
    const ownedIds = [obsoleteObjectId, ...obsoleteMetadataIds.rows.map((row) => row.id)];
    await pool.query("DELETE FROM package_metadata_ownership WHERE metadata_id=ANY($1::uuid[])", [ownedIds]);
    await pool.query("DELETE FROM platform_relationships WHERE parent_object_id=$1 OR child_object_id=$1", [obsoleteObjectId]);
    await pool.query("DELETE FROM platform_objects WHERE id=$1", [obsoleteObjectId]);
  }
  // Settings/RBAC are core runtime metadata even when the visual OneBuilder app
  // is not licensed or opened. Provision the global Platform package metadata
  // at startup so Settings never depends on a tenant installing the Builder.
  const platformFoundation = await pool.query(
    "SELECT id,module_id,version,manifest FROM package_registry WHERE package_key='platform' LIMIT 1"
  );
  if (platformFoundation.rows[0]?.id && platformFoundation.rows[0]?.module_id) {
    await provisionPackageMetadata(pool.query.bind(pool), {
      packageId: platformFoundation.rows[0].id,
      moduleId: platformFoundation.rows[0].module_id,
      companyId: null,
      manifest: platformFoundation.rows[0].manifest || {},
      packageVersion: platformFoundation.rows[0].version || "1.0.0",
    });
  }
  await pool.query(
    `UPDATE platform_objects employee
        SET module_id=staff.module_id,package_id=staff.id,source_package_version=staff.version,managed=true
       FROM package_registry staff,platform_modules legacy_module
      WHERE staff.package_key='staff' AND legacy_module.module_key='retail_pos'
        AND employee.object_key='employee' AND employee.source_table='users' AND employee.company_id IS NULL
        AND employee.module_id=legacy_module.id
        AND (employee.package_id IS NULL OR employee.package_id=(SELECT id FROM package_registry WHERE package_key='retail_pos'))`
  );
  await pool.query(
    `DELETE FROM package_metadata_ownership ownership
      WHERE ownership.package_id=(SELECT id FROM package_registry WHERE package_key='retail_pos')
        AND ownership.metadata_id IN (
          SELECT employee.id FROM platform_objects employee
           WHERE employee.object_key='employee' AND employee.source_table='users' AND employee.company_id IS NULL
          UNION ALL
          SELECT field.id FROM platform_fields field
            JOIN platform_objects employee ON employee.id=field.object_id
           WHERE employee.object_key='employee' AND employee.source_table='users'
             AND employee.company_id IS NULL AND field.company_id IS NULL
        )`
  );
  await pool.query(
    `UPDATE platform_fields field
        SET source_package_id=staff.id,source_package_version=staff.version,managed=true
       FROM platform_objects employee,package_registry staff
      WHERE employee.object_key='employee' AND employee.source_table='users'
        AND employee.company_id IS NULL AND employee.package_id=staff.id
        AND staff.package_key='staff' AND field.object_id=employee.id AND field.company_id IS NULL
        AND (field.source_package_id IS NULL OR field.source_package_id=(SELECT id FROM package_registry WHERE package_key='retail_pos'))`
  );
  await pool.query(
    `UPDATE platform_objects AS supplier
        SET module_id=core_module.id, package_id=core_package.id
       FROM platform_modules AS core_module
       JOIN package_registry AS core_package ON core_package.package_key='supplier_core'
       JOIN platform_modules AS retail_module ON retail_module.module_key='retail_pos'
       LEFT JOIN package_registry AS retail_package ON retail_package.package_key='retail_pos'
      WHERE supplier.object_key='supplier'
        AND supplier.company_id IS NULL
        AND supplier.source_table='suppliers'
        AND supplier.module_id=retail_module.id
        AND (supplier.package_id IS NULL OR supplier.package_id=retail_package.id)
        AND core_module.module_key='supplier_core'`
  );
  const moduleResult = await pool.query(
    `INSERT INTO platform_modules (module_key, name, version, description, installed)
     VALUES ('retail_pos', 'Retail POS', '1.0.0', 'Core onePOS retail application', TRUE)
     ON CONFLICT (module_key) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version
     RETURNING id`
  );
  const moduleId = moduleResult.rows[0].id;
  for (const object of [...retailObjects, ...(includeOperationalObjects ? operationalObjects : [])]) {
    const objectModuleResult = object.moduleKey
      ? await pool.query("SELECT id FROM platform_modules WHERE module_key=$1 LIMIT 1", [object.moduleKey])
      : null;
    const objectModuleId = objectModuleResult?.rows[0]?.id || moduleId;
    const objectResult = await pool.query(
      `INSERT INTO platform_objects (module_id, package_id, object_key, label, plural_label, source_table, store_scoped, config)
       VALUES ($1,(SELECT id FROM package_registry WHERE module_id=$1),$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (object_key) DO UPDATE SET label=EXCLUDED.label, plural_label=EXCLUDED.plural_label, source_table=EXCLUDED.source_table, store_scoped=EXCLUDED.store_scoped, config=COALESCE(platform_objects.config,'{}'::jsonb) || EXCLUDED.config, active=TRUE
       WHERE platform_objects.company_id IS NULL AND platform_objects.module_id=EXCLUDED.module_id
       RETURNING id`,
      [objectModuleId, object.key, object.label, object.plural, object.table, object.storeScoped === true, JSON.stringify(object.config || {})]
    );
    // Core Retail POS mappings must remain available after startup. The conflict
    // guard prevents a reserved key owned by a tenant/another module from being
    // reactivated, repurposed, or having its fields overwritten by this seed.
    if (!objectResult.rows.length) continue;
    const objectId = objectResult.rows[0].id;
    for (let index = 0; index < object.fields.length; index += 1) {
      const [apiName, label, fieldType, sourceColumn, required] = object.fields[index];
      await pool.query(
        `INSERT INTO platform_fields (object_id, api_name, label, field_type, source_column, required, writable, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$8,$7)
         ON CONFLICT (object_id, api_name) WHERE company_id IS NULL DO UPDATE SET label=EXCLUDED.label, field_type=EXCLUDED.field_type, source_column=EXCLUDED.source_column, required=EXCLUDED.required, writable=EXCLUDED.writable, display_order=EXCLUDED.display_order`,
        [objectId, apiName, label, fieldType, sourceColumn, required, index, Boolean(sourceColumn)]
      );
    }
  }
  await pool.query(
    `UPDATE platform_fields field
        SET source_package_id=supplier_core.id,source_package_version=supplier_core.version,managed=true
       FROM platform_objects supplier_object,package_registry supplier_core
      WHERE supplier_core.package_key='supplier_core'
        AND supplier_object.object_key IN ('supplier','supplier_product')
        AND supplier_object.package_id=supplier_core.id
        AND field.object_id=supplier_object.id AND field.company_id IS NULL
        AND field.api_name=ANY($1::text[])
        AND (field.source_package_id IS NULL OR field.source_package_id=(SELECT id FROM package_registry WHERE package_key='retail_pos'))`,
    [[
      "company_id", "name", "contact_name", "phone", "email", "address", "notes", "active",
      "supplier_id", "product_id", "supplier_sku", "supplier_description", "cost_price",
      "effective_from", "effective_to", "preferred", "created_at", "updated_at",
    ]]
  );
  const bootstrapFoundations = await pool.query(
    `SELECT id,module_id,version,manifest
       FROM package_registry
      WHERE active=true
        AND COALESCE((manifest->>'bootstrapFoundation')::boolean,false)=true`
  );
  const foundationByKey = new Map((bootstrapFoundations.rows || []).map((foundation) => [foundation.manifest?.packageKey, foundation]));
  const orderedFoundations = [];
  const visitingFoundations = new Set();
  const visitedFoundations = new Set();
  const visitFoundation = (foundation) => {
    const key = foundation?.manifest?.packageKey;
    if (!key || visitedFoundations.has(key)) return;
    if (visitingFoundations.has(key)) throw new Error(`Bootstrap foundation dependency cycle at ${key}`);
    visitingFoundations.add(key);
    for (const dependency of foundation.manifest?.dependencies || []) {
      const dependencyKey = typeof dependency === "string" ? dependency : dependency?.packageKey || dependency?.package_key;
      if (foundationByKey.has(dependencyKey)) visitFoundation(foundationByKey.get(dependencyKey));
    }
    visitingFoundations.delete(key);
    visitedFoundations.add(key);
    orderedFoundations.push(foundation);
  };
  for (const foundation of bootstrapFoundations.rows || []) visitFoundation(foundation);
  for (const foundation of orderedFoundations) {
    if (!foundation.id || !foundation.module_id) continue;
    await provisionPackageMetadata(pool.query.bind(pool), {
      packageId: foundation.id,
      moduleId: foundation.module_id,
      companyId: null,
      manifest: foundation.manifest || {},
      packageVersion: foundation.version || "1.0.0",
    });
  }

}


  const STANDARD_RELATIONSHIPS = [];

  const additionalStandardObjects = [
    {
      key: "licence_request",
      label: "Licence Request",
      plural: "Licence Requests",
      table: "platform_licence_requests",
      fields: [
        ["package_key", "Package Key", "text", "package_key", true],
        ["package_name", "Package Name", "text", "package_name", true],
        ["requesting_user_id", "Requesting User", "lookup", "requesting_user_id", false],
        ["requesting_user_name", "Requesting User Name", "text", "requesting_user_name", false],
        ["status", "Status", "picklist", "status", false],
        ["created_at", "Created At", "datetime", "created_at", false],
        ["updated_at", "Updated At", "datetime", "updated_at", false],
      ],
    },
  ];

  function standardDefinition(fields) {
    return {
      sections: [{ id: "section-details", label: "Details", order: 0, columns: 2, visible: true }],
      components: fields
        .filter((field) => field.active !== false && field.source_column)
        .map((field, index) => ({
          id: `field-${field.api_name}`,
          type: "field",
          field_key: field.api_name,
          section_id: "section-details",
          order: index,
          width: "1/2",
          visible: true,
          required: field.required === true,
          readOnly: field.writable !== true,
        })),
    };
  }

  export async function initializeStandardObjectEcosystem(pool) {
    await pool.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_received NUMERIC(12,2);
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS line_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
      ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;
      UPDATE cash_movements cm
         SET company_id=ts.company_id,
             store_id=ts.store_id
        FROM till_sessions ts
       WHERE ts.id=cm.till_session_id
         AND (cm.company_id IS NULL OR cm.store_id IS NULL);
    `);

    const moduleResult = await pool.query("SELECT id FROM platform_modules WHERE module_key='retail_pos' LIMIT 1");
    const moduleId = moduleResult.rows[0]?.id;
    if (!moduleId) return;

    await pool.query(`
      INSERT INTO onestore_apps
        (app_key,name,version,description,svg,landing_route,category,publisher,active,visible,installable,display_order,updated_at)
      SELECT
        p.package_key,
        p.name,
        p.version,
        p.description,
        COALESCE(
          NULLIF(p.manifest->>'svg',''),
          NULLIF(p.manifest->>'iconUrl',''),
          'https://raw.githubusercontent.com/onesolutions-ahuja/OneEngine/main/public/icons/apps/' || replace(p.package_key,'_','-') || '.svg'
        ),
        COALESCE(NULLIF(p.manifest->>'landingRoute',''),NULLIF(p.manifest->>'route',''),'/workspace'),
        p.category,
        p.publisher,
        p.active,
        p.visible,
        p.installable,
        p.display_order,
        NOW()
      FROM package_registry p
      ON CONFLICT (app_key) DO UPDATE SET
        name=EXCLUDED.name,
        version=EXCLUDED.version,
        description=EXCLUDED.description,
        svg=EXCLUDED.svg,
        landing_route=EXCLUDED.landing_route,
        category=EXCLUDED.category,
        publisher=EXCLUDED.publisher,
        active=EXCLUDED.active,
        visible=EXCLUDED.visible,
        installable=EXCLUDED.installable,
        display_order=EXCLUDED.display_order,
        updated_at=NOW()
    `);

    await pool.query(`
      INSERT INTO tenant_apps
        (company_id,onestore_app_id,status,installed_version,available_version,licence_required,trial_eligible,licence_status,update_status,is_installed,launchable,storefront_state,installed_at,activated_at,updated_at)
      SELECT
        c.id,
        a.id,
        CASE
          WHEN i.id IS NULL THEN 'AVAILABLE'
          WHEN i.status='inactive' THEN 'INACTIVE'
          WHEN i.deactivated_by_user=TRUE OR i.suspended_by_entitlement=TRUE THEN 'INSTALLED'
          ELSE 'ACTIVE'
        END,
        COALESCE(i.installed_version,i.version),
        a.version,
        CASE WHEN p.licence_mode='TECHNICAL' OR p.billable=FALSE THEN FALSE ELSE TRUE END,
        CASE WHEN p.licence_mode<>'TECHNICAL' AND p.billable<>FALSE AND p.installable=TRUE THEN TRUE ELSE FALSE END,
        CASE
          WHEN p.licence_mode='TECHNICAL' OR p.billable=FALSE THEN 'LICENSED'
          WHEN i.id IS NULL THEN 'NONE'
          ELSE 'LICENSED'
        END,
        CASE
          WHEN COALESCE(i.installed_version,i.version) IS NOT NULL
           AND COALESCE(i.installed_version,i.version) <> a.version THEN 'UPDATE_AVAILABLE'
          ELSE 'CURRENT'
        END,
        i.id IS NOT NULL,
        CASE WHEN i.status='active' AND i.deactivated_by_user=FALSE AND i.suspended_by_entitlement=FALSE THEN TRUE ELSE FALSE END,
        CASE
          WHEN i.id IS NULL THEN 'AVAILABLE'
          WHEN i.status='inactive' THEN 'INACTIVE'
          ELSE 'INSTALLED'
        END,
        i.installed_at,
        CASE WHEN i.status='active' AND i.deactivated_by_user=FALSE AND i.suspended_by_entitlement=FALSE THEN COALESCE(i.updated_at,i.installed_at) ELSE NULL END,
        NOW()
      FROM companies c
      CROSS JOIN onestore_apps a
      LEFT JOIN package_registry p ON p.package_key=a.app_key
      LEFT JOIN company_package_installations i ON i.company_id=c.id AND i.package_id=p.id
      ON CONFLICT (company_id,onestore_app_id) DO UPDATE SET
        available_version=EXCLUDED.available_version,
        licence_required=EXCLUDED.licence_required,
        trial_eligible=EXCLUDED.trial_eligible,
        licence_status=CASE
          WHEN EXCLUDED.licence_required=FALSE THEN 'LICENSED'
          ELSE tenant_apps.licence_status
        END,
        update_status=CASE
          WHEN tenant_apps.installed_version IS NOT NULL
           AND tenant_apps.installed_version <> EXCLUDED.available_version THEN 'UPDATE_AVAILABLE'
          ELSE tenant_apps.update_status
        END,
        installed_at=COALESCE(tenant_apps.installed_at,EXCLUDED.installed_at),
        updated_at=NOW()
    `);

    for (const object of [...additionalStandardObjects, ...operationalObjects]) {
      const result = await pool.query(
        `INSERT INTO platform_objects (module_id,object_key,label,plural_label,source_table)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (object_key) DO UPDATE SET label=EXCLUDED.label,plural_label=EXCLUDED.plural_label,source_table=EXCLUDED.source_table,active=true
         WHERE platform_objects.company_id IS NULL AND platform_objects.module_id=EXCLUDED.module_id
         RETURNING id`,
        [moduleId, object.key, object.label, object.plural, object.table]
      );
      if (!result.rows.length) continue;
      if (object.key === "onestore_app") {
        await pool.query("UPDATE platform_objects SET company_scoped=false,store_scoped=false WHERE id=$1", [result.rows[0].id]);
      }
      if (object.key === "till_session" || object.key === "cash_movement" || object.key === "held_sale" || object.key === "product_modifier_group" || object.key === "payment_method") {
        await pool.query("UPDATE platform_objects SET company_scoped=true,store_scoped=true WHERE id=$1", [result.rows[0].id]);
      }
      for (let index = 0; index < object.fields.length; index += 1) {
        const [apiName, label, fieldType, sourceColumn, required] = object.fields[index];
        await pool.query(
          `INSERT INTO platform_fields (object_id,api_name,label,field_type,source_column,required,writable,display_order)
           VALUES ($1,$2,$3,$4,$5,$6,$8,$7)
           ON CONFLICT (object_id,api_name) WHERE company_id IS NULL DO UPDATE
             SET label=EXCLUDED.label,field_type=EXCLUDED.field_type,source_column=EXCLUDED.source_column,
                 required=EXCLUDED.required,writable=EXCLUDED.writable,display_order=EXCLUDED.display_order`,
          [result.rows[0].id, apiName, label, fieldType, sourceColumn, required, index, Boolean(sourceColumn)]
        );
      }
      if (object.key === "licence_request") {
        await pool.query(
          `UPDATE platform_fields
              SET options='["PENDING","APPROVED","REJECTED","CANCELLED"]'::jsonb
            WHERE object_id=$1 AND api_name='status'`,
          [result.rows[0].id]
        );
      }
      if (object.key === "tenant_app") {
        await pool.query(
          `UPDATE platform_fields
              SET options='["AVAILABLE","INSTALLED","ACTIVE","INACTIVE"]'::jsonb
            WHERE object_id=$1 AND api_name='status'`,
          [result.rows[0].id]
        );
        await pool.query(
          `UPDATE platform_fields
              SET options='["NONE","REQUESTED","LICENSED","TRIAL"]'::jsonb
            WHERE object_id=$1 AND api_name='licence_status'`,
          [result.rows[0].id]
        );
        await pool.query(
          `UPDATE platform_fields
              SET options='["CURRENT","UPDATE_AVAILABLE","QUEUED","UPDATING","FAILED"]'::jsonb
            WHERE object_id=$1 AND api_name='update_status'`,
          [result.rows[0].id]
        );
        await pool.query(
          `UPDATE platform_fields
              SET options='["AVAILABLE","INSTALLED","INACTIVE","LICENCE_REQUIRED","NOT_INSTALLABLE","NOT_AVAILABLE"]'::jsonb
            WHERE object_id=$1 AND api_name='storefront_state'`,
          [result.rows[0].id]
        );
        await pool.query(
          `UPDATE platform_fields
              SET config=COALESCE(config,'{}'::jsonb) || '{"relatedObjectKey":"onestore_app","relationshipKey":"tenant_apps"}'::jsonb
            WHERE object_id=$1 AND api_name='onestore_app_id'`,
          [result.rows[0].id]
        );
      }
    }

    const saleObjectForFormula = await pool.query(
      "SELECT id FROM platform_objects WHERE object_key='sale' AND company_id IS NULL AND active=true LIMIT 1"
    );
    if (saleObjectForFormula.rows[0]?.id) {
      await pool.query(
        `INSERT INTO platform_fields
           (object_id,api_name,label,field_type,source_column,required,writable,display_order,config,active)
         VALUES
           ($1,'line_count','Line Count','formula',NULL,FALSE,FALSE,5,'{"expression":"0","resultType":"number"}'::jsonb,TRUE),
           ($1,'till_session_id','Till Session','formula',NULL,FALSE,FALSE,6,'{"expression":"NULL","resultType":"text"}'::jsonb,TRUE)
         ON CONFLICT (object_id,api_name) WHERE company_id IS NULL DO UPDATE SET
           field_type=EXCLUDED.field_type,source_column=NULL,writable=FALSE,active=TRUE`,
        [saleObjectForFormula.rows[0].id]
      ).catch(() => {});
      await pool.query(
        `INSERT INTO platform_rules
           (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,managed,package_required,user_modified)
         SELECT $1,'Open till session required','before_create',
                '[{"field":"till_session_id","operator":"is_empty"}]'::jsonb,
                '{"type":"validation","match":"all","message":"Open a till session before completing a sale"}'::jsonb,
                TRUE,'ACTIVE',1,1,NULL,TRUE,FALSE,FALSE
          WHERE NOT EXISTS (
            SELECT 1 FROM platform_rules WHERE object_id=$1 AND company_id IS NULL AND name='Open till session required'
          )`,
        [saleObjectForFormula.rows[0].id]
      ).catch(() => {});
      await pool.query(
        `INSERT INTO platform_rules
           (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,managed,package_required,user_modified)
         VALUES
           ($1,'Sale must contain at least one line','before_create',
            '[{"field":"line_count","operator":"less_than","value":1}]'::jsonb,
            '{"type":"validation","match":"all","message":"Sale contains no items"}'::jsonb,
            TRUE,'ACTIVE',1,1,NULL,TRUE,FALSE,FALSE)
         ON CONFLICT DO NOTHING`,
        [saleObjectForFormula.rows[0].id]
      ).catch(() => {});
      await pool.query(
        `UPDATE platform_fields
            SET field_type='formula',
                source_column=NULL,
                writable=FALSE,
                required=FALSE,
                config=COALESCE(config,'{}'::jsonb) || '{"expression":"ROUND(COALESCE(total,0)-COALESCE(tax,0),2)","resultType":"currency"}'::jsonb
          WHERE object_id=$1 AND api_name='subtotal' AND company_id IS NULL`,
        [saleObjectForFormula.rows[0].id]
      );
      await pool.query(
        `INSERT INTO platform_fields
           (object_id,api_name,label,field_type,source_column,required,writable,display_order,config,active)
         VALUES
           ($1,'change_due','Change','formula',NULL,FALSE,FALSE,95,'{"expression":"MAX(0,ROUND(COALESCE(cash_received,0)-COALESCE(total,0),2))","resultType":"currency"}'::jsonb,TRUE)
         ON CONFLICT (object_id,api_name) WHERE company_id IS NULL
         DO UPDATE SET
           label=EXCLUDED.label,
           field_type='formula',
           source_column=NULL,
           writable=FALSE,
           config=EXCLUDED.config,
           active=TRUE`,
        [saleObjectForFormula.rows[0].id]
      );
    }

    const cashLedgerValidationObject = await pool.query(
      "SELECT id FROM platform_objects WHERE object_key='cash_movement' AND company_id IS NULL AND active=true LIMIT 1"
    );
    if (cashLedgerValidationObject.rows[0]?.id) {
      await pool.query(
        `INSERT INTO platform_rules
           (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,managed,package_required,user_modified)
         SELECT $1,'Cash amount must be greater than zero','before_save',
                '[{"field":"amount","operator":"less_than","value":0.01}]'::jsonb,
                '{"type":"validation","match":"all","message":"Cash amount must be greater than zero"}'::jsonb,
                TRUE,'ACTIVE',1,1,NULL,TRUE,FALSE,FALSE
          WHERE NOT EXISTS (
            SELECT 1 FROM platform_rules
             WHERE object_id=$1 AND company_id IS NULL
               AND name='Cash amount must be greater than zero'
          )`,
        [cashLedgerValidationObject.rows[0].id]
      );
    }

    const tillSessionObjectForOptions = await pool.query(
      "SELECT id FROM platform_objects WHERE object_key='till_session' AND company_id IS NULL AND active=true LIMIT 1"
    );
    if (tillSessionObjectForOptions.rows[0]?.id) {
      await pool.query(
        `UPDATE platform_fields SET options='["open","closed"]'::jsonb
          WHERE object_id=$1 AND api_name='status' AND company_id IS NULL`,
        [tillSessionObjectForOptions.rows[0].id]
      );
    }
    const cashLedgerObjectForOptions = await pool.query(
      "SELECT id FROM platform_objects WHERE object_key='cash_movement' AND company_id IS NULL AND active=true LIMIT 1"
    );
    if (cashLedgerObjectForOptions.rows[0]?.id) {
      await pool.query(
        `UPDATE platform_fields SET options='["cash_in","cash_out"]'::jsonb
          WHERE object_id=$1 AND api_name='type' AND company_id IS NULL`,
        [cashLedgerObjectForOptions.rows[0].id]
      );
    }

    const objects = await pool.query(
      `SELECT id, object_key, source_table FROM platform_objects
        WHERE company_id IS NULL AND active=true AND object_key = ANY($1::text[])`,
      [      [...retailObjects, ...additionalStandardObjects, ...operationalObjects].map((object) => object.key)]
    );
    const byKey = new Map(objects.rows.map((row) => [row.object_key, row]));

    const grantObjectPermissionFromCodes = async (objectKey, permissionCodes, grants) => {
      const target = byKey.get(objectKey);
      if (!target?.id) return;
      await pool.query(
        `INSERT INTO platform_object_permissions
           (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete)
         SELECT $1,r.id,r.company_id,$3,$4,$5,$6
           FROM roles r
          WHERE r.company_id IS NOT NULL
            AND EXISTS (
              SELECT 1
                FROM role_permissions rp
                JOIN permissions p ON p.id=rp.permission_id
               WHERE rp.role_id=r.id AND p.code=ANY($2::text[])
            )
         ON CONFLICT (object_id,role_id,company_id) DO UPDATE SET
           can_view=platform_object_permissions.can_view OR EXCLUDED.can_view,
           can_create=platform_object_permissions.can_create OR EXCLUDED.can_create,
           can_edit=platform_object_permissions.can_edit OR EXCLUDED.can_edit,
           can_delete=platform_object_permissions.can_delete OR EXCLUDED.can_delete`,
        [target.id, permissionCodes, grants.view === true, grants.create === true, grants.edit === true, grants.delete === true]
      ).catch(() => {});
    };

    await grantObjectPermissionFromCodes("held_sale", ["sale.hold"], { view: true, create: true, delete: true });
    await grantObjectPermissionFromCodes("till_session", ["till.open","till.close"], { view: true, create: true, edit: true });
    await grantObjectPermissionFromCodes("cash_movement", ["cash.adjustment","cash.payout"], { view: true, create: true });
    await grantObjectPermissionFromCodes("product_modifier_group", ["sale.create"], { view: true });
    await grantObjectPermissionFromCodes("product_modifier_option", ["sale.create"], { view: true });
    await grantObjectPermissionFromCodes("payment_method", ["sale.create"], { view: true });
    await grantObjectPermissionFromCodes("licence_request", ["package.manage","settings.manage"], { view: true, create: true });

    await pool.query(
      `INSERT INTO role_permissions (role_id,permission_id)
       SELECT DISTINCT r.id,wf.id
         FROM roles r
         JOIN role_permissions rp ON rp.role_id=r.id
         JOIN permissions p ON p.id=rp.permission_id
         JOIN permissions wf ON wf.code='workflow.execute'
        WHERE r.company_id IS NOT NULL
          AND p.code=ANY($1::text[])
       ON CONFLICT DO NOTHING`,
      [["sale.create","sale.hold","sale.price_change","cash.payout","cash.adjustment","sale.view"]]
    ).catch(() => {});

    const oneStoreObject = byKey.get("onestore_app");
    const tenantAppObject = byKey.get("tenant_app");
    if (oneStoreObject?.id && tenantAppObject?.id) {
      const tenantAppField = await pool.query(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name='onestore_app_id' AND company_id IS NULL LIMIT 1",
        [tenantAppObject.id]
      );
      if (tenantAppField.rows[0]?.id) {
        await pool.query(
          `INSERT INTO platform_relationships
             (parent_object_id,child_object_id,relationship_key,relationship_type,child_field_id,on_delete,on_update,active)
           VALUES ($1,$2,'tenant_apps','one_to_many',$3,'cascade','restrict',true)
           ON CONFLICT (parent_object_id,relationship_key) DO UPDATE SET
             child_object_id=EXCLUDED.child_object_id,
             relationship_type=EXCLUDED.relationship_type,
             child_field_id=EXCLUDED.child_field_id,
             active=true`,
          [oneStoreObject.id, tenantAppObject.id, tenantAppField.rows[0].id]
        );
      }
    }


    if (tenantAppObject?.id) {
      await pool.query(
        `INSERT INTO platform_object_permissions
           (object_id,role_id,company_id,can_view,can_create,can_edit,can_delete)
         SELECT $1,r.id,r.company_id,TRUE,FALSE,TRUE,FALSE
           FROM roles r
           JOIN role_permissions rp ON rp.role_id=r.id
           JOIN permissions p ON p.id=rp.permission_id AND p.code=ANY(ARRAY['package.install','package.manage','settings.manage'])
          WHERE r.company_id IS NOT NULL
         ON CONFLICT (object_id,role_id,company_id) DO UPDATE SET
           can_view=TRUE,can_edit=TRUE`,
        [tenantAppObject.id]
      ).catch(() => {});

      const lifecycleFlows = [
        {
          name: "OneStore - Install App",
          buttonKey: "onestore_install",
          label: "Install",
          visibility: {
            match: "all",
            groups: [
              { match: "all", conditions: [{ field: "status", operator: "equals", value: "AVAILABLE" }] },
              { match: "any", conditions: [
                { field: "licence_required", operator: "equals", value: false },
                { field: "licence_status", operator: "equals", value: "LICENSED" },
                { field: "licence_status", operator: "equals", value: "TRIAL" },
              ] },
            ],
          },
          actions: [
            { id: "deploy_package", label: "1. Install Package Runtime", apiName: "deploy_package", key: "PACKAGE_LIFECYCLE", operation: "INSTALL" },
            { id: "install_app", label: "2. Update Tenant App Status", apiName: "install_app", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { status: "INSTALLED", installed_version: { path: "record.available_version" }, update_status: "CURRENT", is_installed: true, launchable: false, storefront_state: "INSTALLED" } },
          ],
        },
        {
          name: "OneStore - Activate App",
          buttonKey: "onestore_activate",
          label: "Activate",
          visibility: { match: "any", conditions: [{ field: "status", operator: "equals", value: "INSTALLED" }, { field: "status", operator: "equals", value: "INACTIVE" }] },
          actions: [
            { id: "activate_package", label: "1. Activate Package Runtime", apiName: "activate_package", key: "PACKAGE_LIFECYCLE", operation: "ACTIVATE" },
            { id: "activate_app", label: "2. Update Tenant App Status", apiName: "activate_app", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { status: "ACTIVE", is_installed: true, launchable: true, storefront_state: "INSTALLED" } },
          ],
        },
        {
          name: "OneStore - Deactivate App",
          buttonKey: "onestore_deactivate",
          label: "Deactivate",
          visibility: { match: "all", conditions: [{ field: "status", operator: "equals", value: "ACTIVE" }] },
          actions: [
            { id: "deactivate_package", label: "1. Deactivate Package Runtime", apiName: "deactivate_package", key: "PACKAGE_LIFECYCLE", operation: "DEACTIVATE" },
            { id: "deactivate_app", label: "2. Update Tenant App Status", apiName: "deactivate_app", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { status: "INACTIVE", is_installed: true, launchable: false, storefront_state: "INACTIVE" } },
          ],
        },
        {
          name: "OneStore - Uninstall App",
          buttonKey: "onestore_uninstall",
          label: "Uninstall",
          visibility: { match: "any", conditions: [{ field: "status", operator: "equals", value: "INSTALLED" }, { field: "status", operator: "equals", value: "ACTIVE" }, { field: "status", operator: "equals", value: "INACTIVE" }] },
          actions: [
            { id: "uninstall_package", label: "1. Uninstall Package Runtime", apiName: "uninstall_package", key: "PACKAGE_LIFECYCLE", operation: "UNINSTALL" },
            { id: "uninstall_app", label: "2. Update Tenant App Status", apiName: "uninstall_app", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { status: "AVAILABLE", installed_version: null, activated_at: null, update_status: "CURRENT", is_installed: false, launchable: false, storefront_state: "AVAILABLE" } },
          ],
        },
        {
          name: "OneStore - Start Trial",
          buttonKey: "onestore_trial",
          label: "Start 7-day Trial",
          visibility: { match: "all", conditions: [
            { field: "licence_status", operator: "equals", value: "NONE" },
            { field: "licence_required", operator: "equals", value: true },
            { field: "trial_eligible", operator: "equals", value: true }
          ] },
          actions: [
            { id: "activate_trial_runtime", label: "1. Create Tenant Trial Entitlement", apiName: "activate_trial_runtime", key: "PACKAGE_LIFECYCLE", operation: "TRIAL" },
            { id: "trial_started_at", label: "2. Set Trial Start", apiName: "trial_started_at", key: "FORMULA", resourceName: "trialStartedAt", resultType: "datetime", expression: "NOW()", inputs: {} },
            { id: "trial_expires_at", label: "3. Set Trial Expiry", apiName: "trial_expires_at", key: "FORMULA", resourceName: "trialExpiresAt", resultType: "datetime", expression: "ADDDAYS(NOW(),7)", inputs: {} },
            { id: "grant_trial", label: "4. Update Tenant App Licence", apiName: "grant_trial", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { licence_status: "TRIAL", trial_started_at: { path: "variables.trialStartedAt" }, trial_expires_at: { path: "variables.trialExpiresAt" } } },
          ],
        },
        {
          name: "OneStore - Request Licence",
          buttonKey: "onestore_request_licence",
          label: "Request Licence",
          visibility: { match: "all", conditions: [
            { field: "licence_status", operator: "equals", value: "NONE" },
            { field: "licence_required", operator: "equals", value: true }
          ] },
          actions: [
            {
              id: "load_requested_package",
              label: "1. Load Requested Package",
              apiName: "load_requested_package",
              key: "GET_RECORDS",
              objectKey: "onestore_app",
              filters: [{ field: "id", operator: "equals", value: { path: "record.onestore_app_id" } }],
              limit: 1,
              store: "first",
              advancedAssignment: {
                mode: "fields",
                mappings: [
                  { field: "app_key", resourceName: "requestedPackageKey" },
                  { field: "name", resourceName: "requestedPackageName" },
                ],
              },
            },
            {
              id: "create_licence_request",
              label: "2. Create Licence Request",
              apiName: "create_licence_request",
              key: "CREATE_RECORD",
              objectKey: "licence_request",
              fieldValues: {
                package_key: { path: "variables.requestedPackageKey" },
                package_name: { path: "variables.requestedPackageName" },
              },
              checkMatchingRecords: true,
              matchConditions: [
                { field: "package_key", value: { path: "variables.requestedPackageKey" } },
                { field: "status", value: "PENDING" },
              ],
              match: "all",
              matchAction: "skip",
            },
            {
              id: "notify_licence_request",
              label: "3. Notify Platform Administrators",
              apiName: "notify_licence_request",
              key: "SEND_COMMUNICATION",
              channel: "IN_APP",
              recipient: "platform_superadmins",
              title: "Licence request received",
              message: "A package licence request is ready for review.",
            },
            { id: "request_licence", label: "4. Update Tenant App Licence Status", apiName: "request_licence", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { licence_status: "REQUESTED" } },
          ],
        },
        {
          name: "OneStore - Upgrade App",
          buttonKey: "onestore_upgrade",
          label: "Upgrade",
          visibility: { match: "all", conditions: [{ field: "update_status", operator: "equals", value: "UPDATE_AVAILABLE" }] },
          actions: [
            { id: "upgrade_package", label: "1. Upgrade Package Runtime", apiName: "upgrade_package", key: "PACKAGE_LIFECYCLE", operation: "UPGRADE" },
            { id: "upgrade_app", label: "2. Update Tenant App Version", apiName: "upgrade_app", key: "UPDATE_RECORD", objectKey: "tenant_app", recordId: { path: "record.id" }, fieldValues: { installed_version: { path: "record.available_version" }, update_status: "CURRENT" } },
          ],
        },
      ];

      for (const flow of lifecycleFlows) {
        const action = {
          type: "workflow",
          apiName: flow.buttonKey.toUpperCase(),
          flowType: "AUTOLAUNCHED",
          description: flow.label,
          actions: flow.actions,
        };
        const existingFlow = await pool.query(
          "SELECT id,user_modified FROM platform_rules WHERE object_id=$1 AND company_id IS NULL AND name=$2 LIMIT 1",
          [tenantAppObject.id, flow.name]
        );
        let workflowId = existingFlow.rows[0]?.id || null;
        if (!workflowId) {
          const createdFlow = await pool.query(
            `INSERT INTO platform_rules
               (object_id,name,trigger_key,conditions,action,active,lifecycle_status,version,active_version,company_id,managed,package_required,user_modified)
             VALUES ($1,$2,'manual','[]'::jsonb,$3::jsonb,TRUE,'ACTIVE',1,1,NULL,TRUE,FALSE,FALSE)
             RETURNING id`,
            [tenantAppObject.id, flow.name, JSON.stringify(action)]
          );
          workflowId = createdFlow.rows[0]?.id || null;
        } else if (existingFlow.rows[0]?.user_modified !== true) {
          await pool.query(
            `UPDATE platform_rules
                SET action=$1::jsonb,active=TRUE,lifecycle_status='ACTIVE',updated_at=NOW()
              WHERE id=$2 AND company_id IS NULL AND COALESCE(user_modified,FALSE)=FALSE`,
            [JSON.stringify(action), workflowId]
          );
        }
        if (!workflowId) continue;

        await pool.query(
          `INSERT INTO platform_buttons
             (company_id,object_id,button_key,label,action_key,target_type,target_key,variant,placement,required_permission,visibility_rule,input_mappings,config,active,managed,user_modified)
           VALUES (NULL,$1,$2,$3,NULL,'workflow',$4,'primary','onestore_action','package.install',$5::jsonb,'{}'::jsonb,$6::jsonb,TRUE,TRUE,FALSE)
           ON CONFLICT (button_key) WHERE company_id IS NULL
           DO UPDATE SET
             object_id=EXCLUDED.object_id,
             label=CASE WHEN platform_buttons.user_modified THEN platform_buttons.label ELSE EXCLUDED.label END,
             target_type=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_type ELSE EXCLUDED.target_type END,
             target_key=CASE WHEN platform_buttons.user_modified THEN platform_buttons.target_key ELSE EXCLUDED.target_key END,
             placement=CASE WHEN platform_buttons.user_modified THEN platform_buttons.placement ELSE EXCLUDED.placement END,
             required_permission=CASE WHEN platform_buttons.user_modified THEN platform_buttons.required_permission ELSE EXCLUDED.required_permission END,
             visibility_rule=CASE WHEN platform_buttons.user_modified THEN platform_buttons.visibility_rule ELSE EXCLUDED.visibility_rule END,
             config=CASE WHEN platform_buttons.user_modified THEN platform_buttons.config ELSE EXCLUDED.config END,
             active=TRUE,
             managed=TRUE,
             updated_at=NOW()`,
          [tenantAppObject.id, flow.buttonKey, flow.label, String(workflowId), JSON.stringify(flow.visibility), JSON.stringify({ order: lifecycleFlows.indexOf(flow) + 1 })]
        );
      }
    }

    /* Retail Till chrome is metadata, not JSX policy. The browser maps each
       uiAction to the existing native POS implementation; labels, placement,
       visibility and permissions come from these Platform metadata rows. */
    const saleObjectResult = await pool.query(
      "SELECT id FROM platform_objects WHERE object_key='sale' AND company_id IS NULL AND active=TRUE LIMIT 1"
    );
    const saleObjectId = saleObjectResult.rows[0]?.id || null;
    // Retail/POS Objects, Flows, actions and buttons are installed exclusively from metadata manifests.

  

    // Staff lifecycle actions and buttons are package-owned metadata in Staff Core.

    const valueSets = [
      ["transaction_type", "Transaction Type", [["SALE", "Sale"], ["RETURN", "Return"], ["EXCHANGE", "Exchange"]]],
      ["payment_direction", "Payment Direction", [["IN", "Incoming"], ["OUT", "Outgoing"]]],
      ["inventory_movement_type", "Inventory Movement Type", [
        ["OPENING", "Opening Stock"], ["PURCHASE", "Purchase Receipt"], ["SALE", "Sale"],
        ["CUSTOMER_RETURN", "Customer Return"], ["SUPPLIER_RETURN", "Supplier Return"],
        ["ADJUSTMENT_IN", "Adjustment In"], ["ADJUSTMENT_OUT", "Adjustment Out"],
        ["RETURN_IN", "Return In"], ["RETURN_OUT", "Return Out"],
        ["ONLINE_RESERVE", "Online Reserve"], ["ONLINE_RELEASE", "Online Release"],
        ["TRANSFER_IN", "Transfer In"], ["TRANSFER_OUT", "Transfer Out"],
        ["WASTAGE", "Wastage"], ["SHRINKAGE", "Shrinkage"],
      ]],
      ["inventory_record_type", "Inventory Record Type", [
        ["SALE", "Sale"], ["RETURN", "Return"], ["RECEIPT", "Receipt"],
        ["ADJUSTMENT_IN", "Adjustment In"], ["ADJUSTMENT_OUT", "Adjustment Out"],
        ["TRANSFER_IN", "Transfer In"], ["TRANSFER_OUT", "Transfer Out"],
        ["WASTAGE", "Wastage"], ["OPENING", "Opening Stock"],
      ]],
      ["batch_allocation_policy", "Batch Allocation Policy", [["FEFO", "First Expired, First Out"]]],
    ];
    for (const [key, label, values] of valueSets) {
      const existingSet = await pool.query(
        "SELECT id FROM platform_value_sets WHERE value_set_key=$1 AND company_id IS NULL LIMIT 1",
        [key]
      );
      const set = existingSet.rows[0]?.id
        ? await pool.query(
          "UPDATE platform_value_sets SET label=$1,description=$2,active=true,updated_at=NOW() WHERE id=$3 RETURNING id",
          [label, `Standard ${label} values`, existingSet.rows[0].id]
        )
        : await pool.query(
          `INSERT INTO platform_value_sets (value_set_key,label,description,company_id,active)
           VALUES ($1,$2,$3,NULL,true) RETURNING id`,
          [key, label, `Standard ${label} values`]
        );
      const valueSetId = set.rows[0]?.id;
      if (!valueSetId) continue;
      for (let index = 0; index < values.length; index += 1) {
        await pool.query(
          `INSERT INTO platform_value_set_values (value_set_id,value,label,display_order,active)
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (value_set_id,value) DO UPDATE SET label=EXCLUDED.label,display_order=EXCLUDED.display_order,active=true`,
          [valueSetId, values[index][0], values[index][1], index]
        );
      }

      const inventoryMovement = byKey.get("inventory_movement");
      if (inventoryMovement?.id) {
        const movementTypeField = await pool.query(
          "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name='movement_type' AND company_id IS NULL LIMIT 1",
          [inventoryMovement?.id]
        );
        const movementTypeSet = await pool.query(
          "SELECT id FROM platform_value_sets WHERE value_set_key='inventory_movement_type' AND company_id IS NULL LIMIT 1"
        );
        if (movementTypeField.rows[0]?.id && movementTypeSet.rows[0]?.id) {
          await pool.query(
            `UPDATE platform_fields SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{"value_set_key"}',$2::jsonb,true), options=$3::jsonb WHERE id=$1`,
            [movementTypeField.rows[0].id, JSON.stringify("inventory_movement_type"), JSON.stringify([
              "OPENING", "PURCHASE", "SALE", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "ADJUSTMENT_IN",
              "ADJUSTMENT_OUT", "RETURN_IN", "RETURN_OUT", "ONLINE_RESERVE", "ONLINE_RELEASE",
              "TRANSFER_IN", "TRANSFER_OUT", "WASTAGE", "SHRINKAGE",
            ])]
          );
        }
        for (const [recordTypeKey, label] of [
          ["SALE", "Sale"], ["RETURN", "Return"], ["RECEIPT", "Receipt"],
          ["ADJUSTMENT_IN", "Adjustment In"], ["ADJUSTMENT_OUT", "Adjustment Out"],
          ["TRANSFER_IN", "Transfer In"], ["TRANSFER_OUT", "Transfer Out"],
          ["WASTAGE", "Wastage"], ["OPENING", "Opening Stock"],
        ]) {
          await pool.query(
            `INSERT INTO platform_record_types
              (object_id,record_type_key,label,description,company_id,default_values,is_default,active)
             VALUES ($1,$2,$3,$4,NULL,$5::jsonb,$6,true)
             ON CONFLICT (object_id,record_type_key) WHERE company_id IS NULL DO UPDATE
               SET label=EXCLUDED.label,default_values=EXCLUDED.default_values,active=true`,
            [inventoryMovement?.id, recordTypeKey.toLowerCase(), label, `${label} inventory movement`, JSON.stringify({ movement_type: recordTypeKey }), recordTypeKey === "ADJUSTMENT_IN"]
          );
        }
        }
      const expiryStatusField = await pool.query(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name='expiry_status' AND company_id IS NULL LIMIT 1",
        [byKey.get("inventory_batch")?.id]
      );
      if (expiryStatusField.rows[0]?.id) {
        await pool.query(
          `UPDATE platform_fields
              SET config=COALESCE(config,'{}'::jsonb) || $2::jsonb
            WHERE id=$1`,
          [expiryStatusField.rows[0].id, JSON.stringify({
            statusFormula: 'IF(ISBLANK(expiryDate),"none",IF(expiryDate < TODAY(),"expired",IF(expiryDate <= ADDDAYS(TODAY(),warningDays),"expiring","valid")))',
            warningDays: 7,
            allocationSort: [{ field: "expiry_date", direction: "ASC", nulls: "LAST" }],
          })]
        );
      }
    }

    for (const [parentKey, childKey, relationshipKey, type, column] of STANDARD_RELATIONSHIPS) {
      const parent = byKey.get(parentKey);
      const child = byKey.get(childKey);
      const declaration = `${parentKey} -> ${childKey} (key "${relationshipKey}", ${type}${column ? `, column "${column}"` : ""})`;
      if (!parent || !child) {
        console.warn(`onePOS: platform relationship ${declaration} was not seeded - the declared objects are not available as global metadata`);
        continue;
      }
      try {
        const link = await resolveRelationshipLink({
          query: (sql, params) => pool.query(sql, params),
          relationshipType: type,
          column,
          parent,
          child,
        });
        if (column && !link.mapped) {
          const parentOwns = await sourceColumnExists({ query: (sql, params) => pool.query(sql, params), table: parent.source_table, column });
          const childOwns = parentOwns ? false : await sourceColumnExists({ query: (sql, params) => pool.query(sql, params), table: child.source_table, column });
          const location = parentOwns
            ? `it exists on "${parent.source_table}" but is not exposed as a Platform field of "${parentKey}"`
            : childOwns
              ? `it exists on "${child.source_table}" but is not exposed as a Platform field of "${childKey}"`
              : "it does not exist on either source table";
          console.warn(`onePOS: platform relationship ${declaration} was seeded without a link field - ${location}`);
        } else if (column && link.owner === RELATIONSHIP_LINK_OWNERS.PARENT && type !== "lookup") {
          console.warn(`onePOS: platform relationship ${declaration} is a ${type} but its link column belongs to the parent object; it was seeded without a child field`);
        }
        await pool.query(
          `INSERT INTO platform_relationships
            (parent_object_id,child_object_id,relationship_key,relationship_type,child_field_id,on_delete,on_update,active)
           VALUES ($1,$2,$3,$4,$5,'set_null','restrict',true)
           ON CONFLICT (parent_object_id,relationship_key) DO UPDATE
             SET child_object_id=EXCLUDED.child_object_id, relationship_type=EXCLUDED.relationship_type,
                 child_field_id=EXCLUDED.child_field_id, active=true`,
          [parent.id, child.id, relationshipKey, type, link.childFieldId]
        );
      } catch (error) {
        /* One malformed relationship must not abort unrelated provisioning
           (remaining relationships, record types, layouts, list views). The
           failure is reported with its exact metadata item so it stays visible. */
        console.error(`onePOS: platform relationship ${declaration} failed to seed:`, error.message);
      }
    }

    await pool.query(
      `UPDATE platform_relationships r
          SET active=false
         FROM platform_objects p, platform_objects c
        WHERE r.parent_object_id=p.id AND r.child_object_id=c.id
          AND p.object_key='product' AND c.object_key='category'
          AND r.relationship_key='category' AND p.company_id IS NULL AND c.company_id IS NULL`
    );

    const sale = byKey.get("sale");
    if (sale) {
      const transactionTypeField = await pool.query(
        "SELECT id FROM platform_fields WHERE object_id=$1 AND api_name='transaction_type' AND company_id IS NULL LIMIT 1",
        [sale.id]
      );
      const valueSet = await pool.query(
        "SELECT id FROM platform_value_sets WHERE value_set_key='transaction_type' AND company_id IS NULL LIMIT 1"
      );
      if (transactionTypeField.rows[0]?.id && valueSet.rows[0]?.id) {
        await pool.query(
          `UPDATE platform_fields
              SET config=jsonb_set(COALESCE(config,'{}'::jsonb),'{"value_set_key"}',$2::jsonb,true),
                  options=$3::jsonb
            WHERE id=$1`,
          [
            transactionTypeField.rows[0].id,
            JSON.stringify("transaction_type"),
            JSON.stringify(["SALE", "RETURN", "EXCHANGE"]),
          ]
        );
      }
      for (const [recordTypeKey, label, value] of [
        ["sale", "Sale", "SALE"],
        ["return", "Return", "RETURN"],
        ["exchange", "Exchange", "EXCHANGE"],
      ]) {
        const recordType = await pool.query(
          `INSERT INTO platform_record_types
            (object_id,record_type_key,label,description,company_id,default_values,is_default,active)
           VALUES ($1,$2,$3,$4,NULL,$5::jsonb,$6,true)
           ON CONFLICT (object_id,record_type_key) WHERE company_id IS NULL DO UPDATE
             SET label=EXCLUDED.label,default_values=EXCLUDED.default_values,active=true
           RETURNING id`,
          [sale.id, recordTypeKey, label, `${label} transaction record type`, JSON.stringify({ transaction_type: value }), recordTypeKey === "sale"]
        );
        if (recordType.rows[0]?.id && transactionTypeField.rows[0]?.id) {
          await pool.query(
            `INSERT INTO platform_record_type_picklist_values
              (record_type_id,field_id,value,active)
             VALUES ($1,$2,$3,true)
             ON CONFLICT (record_type_id,field_id,value) DO UPDATE SET active=true`,
            [recordType.rows[0].id, transactionTypeField.rows[0].id, value]
          );
        }
      }
    }

    for (const object of objects.rows) {
      const fields = await pool.query(
        "SELECT id,api_name,source_column,required,writable,active FROM platform_fields WHERE object_id=$1 AND company_id IS NULL ORDER BY display_order,api_name",
        [object.id]
      );
      const definition = standardDefinition(fields.rows);
      const modes = [
        ["create", "Standard Create", "standard_create"],
        ["edit", "Standard Edit", "standard_edit"],
        ["detail", "Standard Details", "standard_detail"],
        ["quick_create", "Quick Create", "quick_create"],
      ];
      for (const [pageType, name, layoutKey] of modes) {
        const existing = await pool.query(
          `SELECT id FROM platform_layouts
            WHERE object_id=$1 AND page_type=$2 AND company_id IS NULL AND role_id IS NULL
              AND active=true LIMIT 1`,
          [object.id, pageType]
        );
        if (existing.rows.length) continue;
        await pool.query(
          `INSERT INTO platform_layouts
            (object_id,page_type,role_id,company_id,name,layout_key,definition,active,is_default)
           VALUES ($1,$2,NULL,NULL,$3,$4,$5::jsonb,true,true)
           ON CONFLICT (object_id,page_type,layout_key) WHERE layout_key <> '' DO NOTHING`,
          [object.id, pageType, name, layoutKey, JSON.stringify(definition)]
        );
      }
    }
  }
export function isSafeIdentifier(value) {
  return typeof value === "string" && IDENTIFIER.test(value);
}
