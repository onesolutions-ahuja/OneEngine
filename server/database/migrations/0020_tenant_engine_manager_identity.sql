-- Correct the OneEngine operator model after the temporary dual/global identity migration.
-- There is no central superadmin identity. Each tenant owns its own
-- superadmin@onepos.com user and OneEngine authority is ordinary RBAC.

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
-- OneEngine-manager identity model. This intentionally does not touch tenant
-- users with the same email address.
DELETE FROM user_roles ur
USING users u
WHERE ur.user_id = u.id
  AND u.company_id IS NULL
  AND LOWER(COALESCE(u.username, u.email, '')) = 'superadmin@onepos.com';

DELETE FROM users
WHERE company_id IS NULL
  AND LOWER(COALESCE(username, email, '')) = 'superadmin@onepos.com';

-- Normalize the tenant bootstrap identity. Only update a tenant when doing so
-- cannot collide with an existing tenant-local superadmin@onepos.com record.
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
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id
      AND r.company_id = u.company_id
      AND r.api_key = 'platform_superadmin'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM users existing
    WHERE existing.company_id = u.company_id
      AND existing.id <> u.id
      AND (
        LOWER(COALESCE(existing.username, '')) = 'superadmin@onepos.com'
        OR LOWER(COALESCE(existing.email, '')) = 'superadmin@onepos.com'
      )
  );
