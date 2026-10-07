-- Migrate legacy Jarvis-specific seat/user flags into the canonical licence model.
-- Existing user licence assignments are never overwritten.
WITH eligible AS (
  SELECT c.id AS company_id,
         COALESCE(
           (
             SELECT a.licence_id
               FROM company_licence_allocations a
               JOIN licence_entitlements e ON e.licence_id=a.licence_id
              WHERE a.company_id=c.id
                AND a.active=true
                AND a.seats>0
                AND e.entitlement_key='jarvis'
                AND e.enabled=true
                AND (a.starts_at IS NULL OR a.starts_at<=NOW())
                AND (a.expires_at IS NULL OR a.expires_at>NOW())
              ORDER BY (a.licence_id=c.licence_id) DESC, a.updated_at DESC
              LIMIT 1
           ),
           NULL
         ) AS licence_id
    FROM companies c
),
legacy_users AS (
  SELECT u.id AS user_id,u.company_id,e.licence_id
    FROM users u
    JOIN eligible e ON e.company_id=u.company_id AND e.licence_id IS NOT NULL
   WHERE u.jarves_enabled=true
)
INSERT INTO user_licence_assignments(user_id,company_id,licence_id,assigned_at,active)
SELECT l.user_id,l.company_id,l.licence_id,NOW(),true
  FROM legacy_users l
 WHERE NOT EXISTS (SELECT 1 FROM user_licence_assignments x WHERE x.user_id=l.user_id)
ON CONFLICT(user_id) DO NOTHING;

ALTER TABLE users DROP COLUMN IF EXISTS jarves_enabled;
ALTER TABLE company_settings DROP COLUMN IF EXISTS jarves_licence_users;
