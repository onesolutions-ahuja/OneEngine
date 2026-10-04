CREATE TABLE IF NOT EXISTS platform_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label VARCHAR(200) NOT NULL,
  api_name VARCHAR(100) NOT NULL,
  description TEXT,
  user_access VARCHAR(200),
  instructions TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, api_name)
);

CREATE INDEX IF NOT EXISTS idx_platform_agents_active
  ON platform_agents(company_id, active, label);
