import { assertTrustedJobKind } from "./trustedRuntime.js";

const MAX_ATTEMPTS = 5;

export async function enqueuePlatformJob({ db, companyId, kind, payload, runAt = new Date(), idempotencyKey }) {
  assertTrustedJobKind(kind);
  if (!companyId || !kind || !idempotencyKey) throw new Error("A company, job kind and idempotency key are required");
  const result = await db(
    `INSERT INTO platform_action_jobs (company_id,kind,payload,status,attempts,next_attempt_at,idempotency_key)
     VALUES ($1,$2,$3::jsonb,'PENDING',0,$4,$5)
     ON CONFLICT (company_id,idempotency_key) DO NOTHING
     RETURNING *`,
    [companyId, kind, JSON.stringify(payload || {}), runAt, idempotencyKey]
  );
  return result.rows[0] || null;
}

export async function claimDuePlatformJobs({ db, limit = 20, leaseSeconds = 300 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 100);
  const safeLease = Math.min(Math.max(Number(leaseSeconds) || 300, 30), 3600);
  const result = await db(
    `WITH due AS (
      SELECT id FROM platform_action_jobs
      WHERE (
        (status='PENDING' AND next_attempt_at <= NOW())
        OR (status='RUNNING' AND locked_until IS NOT NULL AND locked_until <= NOW())
      )
      ORDER BY COALESCE(next_attempt_at, created_at), created_at
      FOR UPDATE SKIP LOCKED LIMIT $1
    )
    UPDATE platform_action_jobs j
       SET status='RUNNING',
           claimed_at=NOW(),
           locked_until=NOW() + ($2 * INTERVAL '1 second'),
           updated_at=NOW()
      FROM due
     WHERE j.id=due.id
     RETURNING j.*`,
    [safeLimit, safeLease]
  );
  return result.rows;
}

export async function completePlatformJob({ db, id }) {
  await db("UPDATE platform_action_jobs SET status='COMPLETED',completed_at=NOW(),locked_until=NULL,updated_at=NOW() WHERE id=$1 AND status='RUNNING'", [id]);
}

export async function failPlatformJob({ db, id, error, retryable = true }) {
  const result = await db("UPDATE platform_action_jobs SET attempts=attempts+1,last_error=$2,status=CASE WHEN $3=false OR attempts+1 >= $4 THEN 'FAILED' ELSE 'PENDING' END,next_attempt_at=CASE WHEN $3=false OR attempts+1 >= $4 THEN NULL ELSE NOW() + ((POWER(2, attempts + 1) || ' minutes')::interval) END,locked_until=NULL,updated_at=NOW() WHERE id=$1 RETURNING *", [id, String(error?.message || error || "Job failed").slice(0, 2000), retryable, MAX_ATTEMPTS]);
  return result.rows[0] || null;
}

export async function drainDuePlatformJobs({ db, handler, limit = 20, onFailed = null }) {
  if (typeof handler !== "function") throw new Error("A platform job handler is required");
  const jobs = await claimDuePlatformJobs({ db, limit });
  const results = [];
  for (const job of jobs) {
    try {
      const outcome = await handler(job);
      if (outcome?.deferred === true) {
        results.push({ id: job.id, status: "PENDING", outcome });
        continue;
      }
      await completePlatformJob({ db, id: job.id });
      results.push({ id: job.id, status: outcome?.status || "COMPLETED", outcome });
    } catch (error) {
      const failed = await failPlatformJob({ db, id: job.id, error, retryable: error?.retryable !== false });
      if (typeof onFailed === "function") await onFailed(job, failed);
      results.push({ id: job.id, status: failed?.status || "FAILED", error });
    }
  }
  return results;
}

export { MAX_ATTEMPTS };
