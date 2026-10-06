export function systemWorkflowDefinitions() {
  return [];
}

export async function ensureSystemWorkflowCatalog({ db, companyId }) {
  if (!db || typeof db !== "function" || !companyId) {
    return { created: 0, removed: 0, existing: 0, total: 0 };
  }

  const stale = await db(
    `DELETE FROM platform_rules
      WHERE company_id=$1
        AND action->>'systemGenerated'='true'
        AND action->>'systemKey' IS NOT NULL
        AND COALESCE(user_modified,FALSE)=FALSE
      RETURNING id`,
    [companyId]
  );

  return {
    created: 0,
    removed: stale.rows?.length || 0,
    existing: 0,
    total: 0,
  };
}
