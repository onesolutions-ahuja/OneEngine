INSERT INTO permissions(code,name,description)
VALUES ('platform.runtime.read','Platform Runtime Read','Read shared metadata objects used by the OneEngine shell and generic runtime.')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.code='platform.runtime.read'
ON CONFLICT (role_id,permission_id) DO NOTHING;

-- Core metadata data sources for the zero-custom-function architecture.

CREATE TABLE IF NOT EXISTS sys_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  setting_key VARCHAR(160) NOT NULL,
  setting_value TEXT,
  value_type VARCHAR(30) NOT NULL DEFAULT 'text',
  section VARCHAR(120) NOT NULL DEFAULT 'General',
  label VARCHAR(200) NOT NULL,
  description TEXT,
  scope VARCHAR(20) NOT NULL DEFAULT 'COMPANY' CHECK (scope IN ('COMPANY','STORE','USER','DEVICE')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_settings_scope_key
  ON sys_settings(company_id, setting_key, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_sys_settings_company_section ON sys_settings(company_id, section, active);

CREATE TABLE IF NOT EXISTS device_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_key VARCHAR(160) NOT NULL,
  device_name VARCHAR(200),
  device_type VARCHAR(40),
  app_version VARCHAR(40),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, device_key)
);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_company_seen ON device_heartbeats(company_id, last_seen_at DESC);

CREATE OR REPLACE VIEW available_stores AS
SELECT
  us.id,
  s.company_id,
  us.user_id,
  s.id AS store_id,
  s.name,
  s.code,
  s.city,
  s.postcode,
  s.active,
  us.is_primary,
  us.created_at,
  GREATEST(us.created_at, s.updated_at) AS updated_at
FROM user_stores us
JOIN stores s ON s.id=us.store_id
WHERE us.active=TRUE AND s.active=TRUE;

CREATE OR REPLACE VIEW device_health AS
SELECT
  id, company_id, store_id, user_id, device_key, device_name, device_type, app_version,
  CASE
    WHEN last_seen_at >= NOW() - INTERVAL '2 minutes' THEN 'ONLINE'
    WHEN last_seen_at >= NOW() - INTERVAL '10 minutes' THEN 'STALE'
    ELSE 'OFFLINE'
  END::text AS status,
  last_seen_at, metadata, created_at, updated_at
FROM device_heartbeats;

CREATE OR REPLACE VIEW one_store_apps AS
SELECT
  p.id,
  p.package_key,
  p.name AS app_name,
  COALESCE(p.manifest->>'iconUrl', p.manifest->>'icon', p.manifest->>'iconAssetKey') AS logo,
  p.version,
  CASE
    WHEN p.active IS NOT TRUE THEN 'INACTIVE'
    ELSE p.publication_state
  END::text AS status,
  p.category,
  p.description,
  p.visible,
  p.installable,
  p.updated_at,
  r.version AS last_release_version,
  r.published_at AS last_release_at
FROM package_registry p
LEFT JOIN LATERAL (
  SELECT pr.version, pr.published_at
  FROM package_releases pr
  WHERE pr.package_key=p.package_key AND pr.status='PUBLISHED'
  ORDER BY pr.published_at DESC NULLS LAST, pr.updated_at DESC
  LIMIT 1
) r ON TRUE;

-- Seed the generic settings store from existing core company/company_settings data.
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.name',name::text,'text','Company','Company Name','COMPANY' FROM companies
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.legal_name',legal_name::text,'text','Company','Legal Name','COMPANY' FROM companies WHERE legal_name IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.email',email::text,'email','Company','Email','COMPANY' FROM companies WHERE email IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.phone',phone::text,'phone','Company','Phone','COMPANY' FROM companies WHERE phone IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.currency',currency::text,'text','General','Currency','COMPANY' FROM companies
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT id,'company.timezone',timezone::text,'text','General','Timezone','COMPANY' FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT company_id,'general.date_format',date_format::text,'text','General','Date Format','COMPANY' FROM company_settings
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT company_id,'tax.vat_enabled',vat_enabled::text,'boolean','Tax / VAT','VAT Enabled','COMPANY' FROM company_settings
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT company_id,'tax.default_vat_rate',default_vat_rate::text,'number','Tax / VAT','Default VAT Rate','COMPANY' FROM company_settings
ON CONFLICT DO NOTHING;
INSERT INTO sys_settings(company_id,setting_key,setting_value,value_type,section,label,scope)
SELECT company_id,'ui.default_landing_page',default_landing_page::text,'text','General','Default Landing Page','COMPANY' FROM company_settings
ON CONFLICT DO NOTHING;
