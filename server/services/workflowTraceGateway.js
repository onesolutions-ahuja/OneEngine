import { randomUUID } from "node:crypto";
import { createWorkflowRun } from "./platformWorkflow.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function cleanPath(req) {
  const raw = String(req?.originalUrl || req?.url || req?.path || "").split("?")[0];
  return raw.slice(0, 500);
}

export function createWorkflowTraceGateway({ db }) {
  if (!db || typeof db !== "function") throw new Error("Workflow trace gateway requires db");

  return function workflowTraceGateway(req, res, next) {
    if (!MUTATION_METHODS.has(String(req.method || "").toUpperCase())) return next();

    const correlationId = String(
      req.headers?.["x-request-id"]
        || req.headers?.["x-correlation-id"]
        || randomUUID()
    );
    req.workflowTraceCorrelationId = correlationId;
    req.workflowTraceRunId = null;
    let creating = null;
    const startedAt = Date.now();

    req.ensureWorkflowTraceRun = async ({ companyId = null, userId = null, storeId = null } = {}) => {
      if (req.workflowTraceRunId) return req.workflowTraceRunId;
      if (creating) return creating;
      const tenantId = companyId || req.user?.companyId || null;
      if (!tenantId) return null;

      creating = createWorkflowRun({
        db,
        companyId: tenantId,
        workflowId: null,
        workflowName: "System · Workflow Trace",
        triggerKey: "workflow_trace",
        status: "RUNNING",
        metadata: {
          systemGenerated: true,
          commandEnvelope: true,
          correlationId,
          method: String(req.method || "").toUpperCase(),
          path: cleanPath(req),
          actorUserId: userId || req.user?.id || null,
          storeId: storeId || req.user?.storeId || null,
          source: "api",
        },
      }).then((run) => {
        req.workflowTraceRunId = run?.id || null;
        return req.workflowTraceRunId;
      }).finally(() => {
        creating = null;
      });
      return creating;
    };

    res.setHeader("X-OnePOS-Correlation-Id", correlationId);

    let finalized = false;
    const finalize = ({ aborted = false } = {}) => {
      if (finalized) return;
      finalized = true;
      Promise.resolve()
        .then(async () => {
          if (!req.workflowTraceRunId && req.user?.companyId) {
            await req.ensureWorkflowTraceRun({
              companyId: req.user.companyId,
              userId: req.user.id || null,
              storeId: req.user.storeId || null,
            });
          }
          if (!req.workflowTraceRunId) return;

          const statusCode = Number(res.statusCode || 500);
          const status = !aborted && statusCode < 400 ? "COMPLETED" : "FAILED";
          await db(
            `UPDATE platform_workflow_runs
                SET status=$1::varchar,
                    completed_at=NOW(),
                    error_text=CASE WHEN $1::varchar='FAILED' THEN COALESCE(error_text,$2::text) ELSE error_text END,
                    metadata=COALESCE(metadata,'{}'::jsonb)||$3::jsonb,
                    updated_at=NOW()
              WHERE id=$4`,
            [
              status,
              status === "FAILED" ? (aborted ? "HTTP connection closed before response completed" : `HTTP ${statusCode}`) : null,
              JSON.stringify({
                httpStatus: statusCode,
                durationMs: Date.now() - startedAt,
                actorUserId: req.user?.id || null,
                storeId: req.user?.storeId || null,
                connectionAborted: aborted === true,
              }),
              req.workflowTraceRunId,
            ]
          );
        })
        .catch((error) => console.error("Workflow trace finalize error:", error?.message || error));
    };

    res.once("finish", () => finalize({ aborted: false }));
    res.once("close", () => {
      if (!res.writableFinished) finalize({ aborted: true });
    });

    next();
  };
}

export async function purgeOldWorkflowTraceRuns({ db, retentionDays = 90, batchSize = 5000 }) {
  const days = Math.max(7, Math.min(3650, Number(retentionDays) || 90));
  const limit = Math.max(100, Math.min(20000, Number(batchSize) || 5000));
  return db(
    `WITH doomed AS (
       SELECT id
       FROM platform_workflow_runs
       WHERE trigger_key='workflow_trace'
         AND created_at < NOW() - ($1::text || ' days')::interval
       ORDER BY created_at
       LIMIT $2
     )
     DELETE FROM platform_workflow_runs p
     USING doomed d
     WHERE p.id=d.id
     RETURNING p.id`,
    [String(days), limit]
  ).then((result) => result.rowCount || 0);
}
