-- Correct the OneEngine operator model after the temporary dual/global identity migration.
-- There is no central superadmin identity. OneEngine authority is ordinary RBAC.

-- Every tenant Superadmin role receives all permissions, including
-- oneengine.manage. The email itself grants no authority.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id IS NOT NULL
  AND r.api_key = 'platform_superadmin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Remove any obsolete company-less user created for the abandoned global
-- OneEngine-manager identity model. Role membership is stored directly on
-- users.role_id; there is no user_roles join table in the OneEngine schema.
DELETE FROM users
WHERE company_id IS NULL
  AND LOWER(COALESCE(username, email, '')) = 'superadmin@onepos.com';

-- Normalize the tenant bootstrap identity only where the current schema's
-- direct users.role_id assignment proves this is a tenant Superadmin.
-- NOTE: username is globally UNIQUE in the current schema, so this update is
-- intentionally guarded against any existing superadmin@onepos.com identity.
UPDATE users u
SET username = 'superadmin@onepos.com',
    email = 'superadmin@onepos.com',
    updated_at = NOW()
WHERE u.company_id IS NOT NULL
  AND u.active = TRUE
  AND (
    LOWER(COALESCE(u.username, '')) IN ('superadmin@local', 'superadmin')
    OR LOWER(COALESCE(u.email, '')) IN ('superadmin@local', 'superadmin@onepos.local')
  )
  AND EXISTS (
    SELECT 1
    FROM roles r
    WHERE r.id = u.role_id
      AND r.company_id = u.company_id
      AND r.api_key = 'platform_superadmin'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM users existing
    WHERE existing.id <> u.id
      AND LOWER(COALESCE(existing.username, '')) = 'superadmin@onepos.com'
  );
