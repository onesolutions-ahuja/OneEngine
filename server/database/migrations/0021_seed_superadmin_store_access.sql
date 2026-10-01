-- Tenant Superadmin is an ordinary tenant user governed by RBAC.
INSERT INTO user_stores (user_id, store_id, active)
SELECT u.id, s.id, TRUE
FROM users u
JOIN roles r ON r.id = u.role_id AND r.company_id = u.company_id
JOIN stores s ON s.company_id = u.company_id AND s.active = TRUE
WHERE u.company_id IS NOT NULL AND u.active = TRUE
  AND r.api_key = 'platform_superadmin'
ON CONFLICT (user_id, store_id) DO UPDATE SET active = TRUE;

UPDATE users u
SET store_id = chosen.store_id, updated_at = NOW()
FROM LATERAL (
  SELECT us.store_id
  FROM user_stores us JOIN stores s ON s.id = us.store_id
  WHERE us.user_id = u.id AND us.active = TRUE AND s.active = TRUE
    AND s.company_id = u.company_id
  ORDER BY s.created_at ASC, s.id ASC LIMIT 1
) chosen
JOIN roles r ON r.id = u.role_id AND r.company_id = u.company_id
WHERE u.company_id IS NOT NULL AND u.active = TRUE
  AND r.api_key = 'platform_superadmin'
  AND (u.store_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_stores current_assignment
    WHERE current_assignment.user_id = u.id
      AND current_assignment.store_id = u.store_id
      AND current_assignment.active = TRUE
  ));
