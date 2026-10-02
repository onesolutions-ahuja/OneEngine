import { normalizeDashboardSubscription, subscriptionIsDue } from "./analyticsManagement.js";
import { enqueuePlatformJob } from "./platformJobs.js";

function localMinuteKey(subscription, now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: subscription.timezone || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export async function claimDueDashboardSubscriptions({ db, now = new Date(), companyId = null } = {}) {
  const result = await db(
    `SELECT ds.id,ds.company_id,ds.dashboard_id,ds.user_id,ds.definition,ds.active,d.archived_at,d.run_as_mode
       FROM dashboard_subscriptions ds
       JOIN dashboards d ON d.id=ds.dashboard_id AND d.company_id=ds.company_id
      WHERE ds.active=TRUE AND d.archived_at IS NULL
        AND ($1::uuid IS NULL OR ds.company_id=$1)
      ORDER BY ds.updated_at,ds.id`,
    [companyId]
  );
  const jobs = [];
  for (const row of result.rows || []) {
    if (String(row.run_as_mode || "VIEWER").toUpperCase() !== "FIXED_USER") continue;
    const subscription = normalizeDashboardSubscription(row.definition || {});
    if (!subscriptionIsDue(subscription, now)) continue;
    const occurrence = localMinuteKey(subscription, now);
    const job = await enqueuePlatformJob({
      db,
      companyId: row.company_id,
      kind: "DASHBOARD_SUBSCRIPTION_DELIVERY",
      payload: {
        subscriptionId: row.id,
        dashboardId: row.dashboard_id,
        ownerUserId: row.user_id,
        occurrence,
      },
      idempotencyKey: `dashboard-subscription:${row.id}:${occurrence}`,
    });
    if (job) {
      await db(
        "UPDATE dashboard_subscriptions SET last_status='QUEUED',updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [row.id,row.company_id]
      );
      jobs.push(job);
    }
  }
  return jobs;
}
