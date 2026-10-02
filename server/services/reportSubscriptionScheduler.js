import { normalizeSubscription, subscriptionIsDue } from "./analyticsManagement.js";
import { enqueuePlatformJob } from "./platformJobs.js";

function localMinuteKey(subscription, now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: subscription.timezone || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export async function claimDueReportSubscriptions({ db, now = new Date(), companyId = null } = {}) {
  const result = await db(
    `SELECT rs.id,rs.company_id,rs.report_id,rs.user_id,rs.definition,rs.active,rs.last_run_at,
            cr.archived_at,cr.definition AS report_definition
       FROM report_subscriptions rs
       JOIN custom_reports cr ON cr.id=rs.report_id AND cr.company_id=rs.company_id
      WHERE rs.active=TRUE AND cr.archived_at IS NULL
        AND ($1::uuid IS NULL OR rs.company_id=$1)
      ORDER BY rs.updated_at,rs.id`,
    [companyId]
  );
  const jobs = [];
  for (const row of result.rows || []) {
    const subscription = normalizeSubscription(row.definition || {});
    if (!subscriptionIsDue(subscription, now)) continue;
    const occurrence = localMinuteKey(subscription, now);
    const job = await enqueuePlatformJob({
      db,
      companyId: row.company_id,
      kind: "REPORT_SUBSCRIPTION_DELIVERY",
      payload: {
        subscriptionId: row.id,
        reportId: row.report_id,
        ownerUserId: row.user_id,
        occurrence,
      },
      idempotencyKey: `report-subscription:${row.id}:${occurrence}`,
    });
    if (job) {
      await db(
        "UPDATE report_subscriptions SET last_status='QUEUED',updated_at=NOW() WHERE id=$1 AND company_id=$2",
        [row.id, row.company_id]
      );
      jobs.push(job);
    }
  }
  return jobs;
}
