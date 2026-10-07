CREATE TABLE IF NOT EXISTS platform_component_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  component_key VARCHAR(120) NOT NULL,
  label VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'custom',
  kind VARCHAR(80) NOT NULL DEFAULT 'custom',
  component_path VARCHAR(300) NOT NULL,
  css_path VARCHAR(300),
  configurable JSONB NOT NULL DEFAULT '[]'::jsonb,
  supported_builders JSONB NOT NULL DEFAULT '["PAGE"]'::jsonb,
  supported_contexts JSONB NOT NULL DEFAULT '["page"]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, component_key)
);
CREATE INDEX IF NOT EXISTS idx_platform_component_registrations_company_active
  ON platform_component_registrations(company_id, active);
