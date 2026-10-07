import { internalAppCatalogSchema } from "./internalAppCatalog.js";
import { packageRegistrySchema } from "./packageRegistry.js";
import { deploymentSchema } from "./platformMetadataDeployment.js";
import { PLATFORM_FIELD_TYPE_SQL } from "./platformFieldTypes.js";

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
