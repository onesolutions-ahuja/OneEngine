// Runtime application discovery is metadata-owned.
// Package manifests are installed into platform_modules by package lifecycle tooling;
// generic runtime code must not carry a business application catalogue.
export const internalAppCatalog = Object.freeze([]);

export const internalAppCatalogSchema = `
  ALTER TABLE platform_modules ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  CREATE TABLE IF NOT EXISTS platform_module_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES platform_modules(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_module_access_scope
    ON platform_module_access(module_id, company_id, COALESCE(store_id, '00000000-0000-0000-0000-000000000000'::uuid));
  CREATE INDEX IF NOT EXISTS idx_platform_module_access_company
    ON platform_module_access(company_id, store_id, enabled);
`;

export function catalogEntry() { return null; }
export function hasCatalogPermission(entry, permissions = []) {
  const required = Array.isArray(entry?.permissions) ? entry.permissions : [];
  return required.some((permission) => permissions.includes(permission));
}
export async function seedInternalAppCatalog() {
  // Intentionally empty: application/package metadata is installed declaratively.
}
