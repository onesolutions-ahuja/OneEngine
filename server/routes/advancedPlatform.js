import express from "express";
import { CHANNELS } from "../services/messageTemplates.js";

const SENSITIVE_KEYS = new Set(["password", "passwd", "pass", "secret", "token", "api_key", "apiKey", "client_secret", "clientSecret", "access_token", "accessToken"]);

export function sanitizeTraceForDisplay(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeTraceForDisplay(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitizeTraceForDisplay(nested),
    ]));
  }
  return value;
}

export default function createAdvancedPlatformRouter({ authenticate, authorize, db }) {
  const router = express.Router();
  const manage = [authenticate, authorize("settings.manage")];

  // Message-template CRUD is provided by the generic metadata object runtime.

  router.get("/platform/communication-deliveries", ...manage, async (req, res) => {
    const result = await db("SELECT id,company_id,store_id,channel,template_id,object_id,record_id,recipient,provider_name,status,attempts,failure_reason,provider_message_id,triggered_by_rule,attempted_at,sent_at,created_at FROM platform_communication_deliveries WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200", [req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/action-jobs", ...manage, async (req, res) => {
    const result = await db("SELECT id,company_id,kind,status,attempts,last_error,next_attempt_at,completed_at,created_at,updated_at FROM platform_action_jobs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 200", [req.user.companyId]);
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/workflow-runs", ...manage, async (req, res) => {
    const limit = Number.parseInt(req.query.limit || "50", 10);
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
    const result = await db(
      `SELECT id, company_id, workflow_id, workflow_name, workflow_version, object_id, record_id, trigger_key, parent_run_id, status, started_at, completed_at, created_at, updated_at, metadata
       FROM platform_workflow_runs
       WHERE company_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.companyId, safeLimit]
    );
    res.json({ success: true, data: (result.rows || []).map((row) => ({ ...row, metadata: sanitizeTraceForDisplay(row.metadata || {}) })) });
  });

  router.get("/platform/workflow-runs/:runId", ...manage, async (req, res) => {
    const runResult = await db(
      `SELECT id, company_id, workflow_id, workflow_name, workflow_version, object_id, record_id, trigger_key, parent_run_id, status, started_at, completed_at, created_at, updated_at, metadata, error_text
       FROM platform_workflow_runs
       WHERE id=$1 AND company_id=$2`,
      [req.params.runId, req.user.companyId]
    );
    if (!runResult.rows.length) return res.status(404).json({ success: false, message: "Workflow run not found" });

    const stepResult = await db(
      `SELECT s.id, s.run_id, s.step_identifier, s.step_order, s.action_type, s.status, s.started_at, s.completed_at, s.error_text, s.metadata, s.durable_job_id, s.child_run_id,
              j.kind AS job_kind, j.status AS job_status, j.attempts AS job_attempts, j.last_error AS job_last_error, j.next_attempt_at AS job_next_attempt_at
       FROM platform_workflow_step_runs s
       LEFT JOIN platform_action_jobs j ON j.id = s.durable_job_id
       WHERE s.run_id=$1
       ORDER BY s.step_order ASC, s.created_at ASC`,
      [runResult.rows[0].id]
    );

    const steps = (stepResult.rows || []).map((step) => ({
      ...step,
      metadata: sanitizeTraceForDisplay(step.metadata || {}),
      job: step.job_kind || step.job_status || step.job_attempts != null ? {
        kind: step.job_kind || null,
        status: step.job_status || null,
        attempts: step.job_attempts ?? 0,
        last_error: step.job_last_error || null,
        next_attempt_at: step.job_next_attempt_at || null,
      } : null,
    }));

    const run = {
      ...runResult.rows[0],
      metadata: sanitizeTraceForDisplay(runResult.rows[0].metadata || {}),
      error_text: runResult.rows[0].error_text || null,
    };

    const childResult = await db(
      `SELECT id,workflow_id,workflow_name,trigger_key,status,started_at,completed_at,error_text,metadata
         FROM platform_workflow_runs
        WHERE parent_run_id=$1 AND company_id=$2
        ORDER BY created_at ASC`,
      [run.id, req.user.companyId]
    );
    const children = (childResult.rows || []).map((child) => ({
      ...child,
      metadata: sanitizeTraceForDisplay(child.metadata || {}),
    }));

    res.json({ success: true, data: { run, steps, children } });
  });

  return router;
}

export { CHANNELS };
