export async function assertDashboardSubscriptionCompatible(db, dashboard) {
  if (String(dashboard?.run_as_mode || "VIEWER").toUpperCase() !== "FIXED_USER") {
    throw new Error("Dynamic dashboards cannot be subscribed. Configure a fixed run-as user first.");
  }
  for (const component of dashboard?.components || []) {
    let definition = component?.config?.report || null;
    const reportId = String(component?.config?.reportId || "");
    if (!definition && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reportId)) {
      const result = await db(
        "SELECT definition FROM custom_reports WHERE id=$1 AND company_id=$2 AND archived_at IS NULL",
        [reportId,dashboard.company_id]
      );
      definition = result.rows[0]?.definition || null;
    }
    if (!definition) continue;
    if ((definition.summaries || []).some((summary) => String(summary?.aggregate || "").toUpperCase() === "COUNT_DISTINCT")) {
      throw new Error("Dashboard subscriptions do not support source reports with unique counts");
    }
    if ((definition.filters || []).some((filter) => String(filter?.operator || "").endsWith("_field"))) {
      throw new Error("Dashboard subscriptions do not support source reports with field-to-field filters");
    }
  }
  return true;
}
