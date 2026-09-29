import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api.js";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusBadge(status) {
  const normalized = String(status || "PENDING").toUpperCase();
  return `workflow-run-status workflow-run-status--${normalized.toLowerCase()}`;
}

function redact(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, /password|passwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?token/i.test(key) ? "[REDACTED]" : nested && typeof nested === "object" ? redact(nested) : nested]));
}

export default function WorkflowRunsAdmin({ onMessage, onError }) {
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadRuns = async () => {
    try {
      setLoading(true);
      const response = await apiRequest("/api/platform/workflow-runs?limit=50");
      const nextRuns = Array.isArray(response?.data) ? response.data : [];
      setRuns(nextRuns);
      if (!selectedRunId && nextRuns[0]?.id) {
        setSelectedRunId(nextRuns[0].id);
      }
    } catch (error) {
      onError(error.message || "Unable to load workflow runs");
    } finally {
      setLoading(false);
    }
  };

  const loadRun = async (runId) => {
    if (!runId) return;
    try {
      setLoadingDetail(true);
      const response = await apiRequest(`/api/platform/workflow-runs/${runId}`);
      setDetails(response?.data || null);
      setSelectedRunId(runId);
    } catch (error) {
      onError(error.message || "Unable to load workflow run details");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  useEffect(() => {
    if (selectedRunId) {
      loadRun(selectedRunId);
    }
  }, [selectedRunId]);

  const run = useMemo(() => details?.run || null, [details]);

  return (
    <div className="workflow-runs-shell">
      <aside className="workflow-runs-list">
        <div className="workflow-runs-toolbar">
          <div><strong>Workflow Runs</strong><span>{loading ? "Loading…" : `${runs.length} recent run${runs.length === 1 ? "" : "s"}`}</span></div>
          <button type="button" onClick={loadRuns} disabled={loading}>Refresh</button>
        </div>
        <div className="workflow-runs-scroll">
          {loading ? (
            <div className="workflow-runs-empty">Loading runs…</div>
          ) : runs.length === 0 ? (
            <div className="workflow-runs-empty"><strong>No workflow runs yet</strong><span>Runs will appear here after workflows execute.</span></div>
          ) : runs.map((currentRun) => (
            <button
              key={currentRun.id}
              type="button"
              onClick={() => setSelectedRunId(currentRun.id)}
              className={`workflow-run-row ${selectedRunId === currentRun.id ? "is-selected" : ""}`}
            >
              <div className="workflow-run-row-main">
                <strong>{currentRun.workflow_name || "Workflow"}</strong>
                <span>{currentRun.trigger_key || "trigger"} · {currentRun.record_id ? "record" : "object"}</span>
                <small>{formatDate(currentRun.started_at)}</small>
              </div>
              <span className={statusBadge(currentRun.status)}>{String(currentRun.status || "pending")}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workflow-run-detail">
        {loadingDetail ? (
          <div className="workflow-runs-empty">Loading run details…</div>
        ) : !run ? (
          <div className="workflow-runs-empty"><strong>No run selected</strong><span>Select a workflow run to inspect its execution.</span></div>
        ) : (
          <>
            <div className="workflow-run-detail-header">
              <div><span>Workflow</span><strong>{run.workflow_name || "Workflow"}</strong><small>Run #{run.id?.slice(0, 8) || ""}</small></div>
              <span className={statusBadge(run.status)}>{String(run.status || "pending")}</span>
            </div>

            <div className="workflow-run-metrics">
              <div><span>Version</span><strong>{run.workflow_version ?? 1}</strong></div>
              <div><span>Started</span><strong>{formatDate(run.started_at)}</strong></div>
              <div><span>Completed</span><strong>{formatDate(run.completed_at)}</strong></div>
              <div><span>Trigger</span><strong>{run.trigger_key || "—"}</strong></div>
              <div><span>Retry count</span><strong>{run.metadata?.retryCount ?? run.retry_count ?? 0}</strong></div>
              <div><span>Record</span><strong>{run.record_id || run.object_id || "—"}</strong></div>
            </div>

            {run.error_text || run.metadata?.last_error ? (
              <div className="workflow-run-error"><strong>Failure summary</strong><span>{run.error_text || run.metadata?.last_error || "Execution failed"}</span></div>
            ) : null}

            {run.metadata ? (
              <details className="workflow-run-trace">
                <summary>Trace summary</summary>
                <pre>{JSON.stringify(redact(run.metadata), null, 2)}</pre>
              </details>
            ) : null}

            <div className="workflow-run-steps">
              <div className="workflow-run-section-title">Step history</div>
              {(details?.steps || []).length === 0 ? (
                <div className="workflow-runs-empty compact">No step history recorded.</div>
              ) : (details.steps || []).map((step) => (
                <div key={step.id} className="workflow-run-step">
                  <div className="workflow-run-step-head">
                    <strong>{step.step_order}. {step.action_type || "Step"}</strong>
                    <span className={statusBadge(step.status)}>{String(step.status || "pending")}</span>
                  </div>
                  <div className="workflow-run-step-meta">
                    <span>Started: {formatDate(step.started_at)}</span>
                    <span>Completed: {formatDate(step.completed_at)}</span>
                    {step.durable_job_id ? <span>Durable job: {step.durable_job_id}</span> : null}
                    {step.child_run_id ? <span>Child run: {step.child_run_id}</span> : null}
                    {step.job?.status ? <span>Job: {step.job.status} · attempts {step.job.attempts || 0}</span> : null}
                  </div>
                  {step.error_text ? <div className="workflow-run-error compact">{step.error_text}</div> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
