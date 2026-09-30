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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

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
  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return runs.filter((currentRun) => {
      const status = String(currentRun.status || "").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!query) return true;
      const source = currentRun.trigger_key === "business_command"
        ? `${currentRun.metadata?.method || ""} ${currentRun.metadata?.path || ""}`
        : `${currentRun.trigger_key || ""} ${currentRun.record_id || ""} ${currentRun.object_id || ""}`;
      return [
        currentRun.workflow_name,
        currentRun.id,
        status,
        source,
        currentRun.metadata?.actorUserId,
        currentRun.metadata?.storeId,
      ].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [runs, search, statusFilter]);

  return (
    <div className="workflow-runs-shell">
      <aside className="workflow-runs-list">
        <div className="workflow-runs-list-header">
          <div className="workflow-runs-title-row">
            <div>
              <strong>Workflow Runs</strong>
              <span>{loading ? "Loading…" : `${filteredRuns.length} of ${runs.length} runs`}</span>
            </div>
            <button type="button" onClick={loadRuns} disabled={loading}>Refresh</button>
          </div>

          <div className="workflow-runs-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search workflow runs"
              aria-label="Search workflow runs"
            />
          </div>

          <div className="workflow-runs-filters" role="group" aria-label="Workflow run status">
            {["ALL", "RUNNING", "FAILED", "COMPLETED"].map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? "is-active" : ""}
                onClick={() => setStatusFilter(status)}
              >
                {status === "ALL" ? "All" : status[0] + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="workflow-runs-column-head">
            <span>Run</span>
            <span>Status</span>
          </div>
        </div>

        <div className="workflow-runs-scroll">
          {loading ? (
            <div className="workflow-runs-empty">Loading runs…</div>
          ) : runs.length === 0 ? (
            <div className="workflow-runs-empty"><strong>No workflow runs yet</strong><span>Runs will appear here after workflows execute.</span></div>
          ) : filteredRuns.length === 0 ? (
            <div className="workflow-runs-empty"><strong>No matching runs</strong><span>Try a different search or status filter.</span></div>
          ) : filteredRuns.map((currentRun) => (
            <button
              key={currentRun.id}
              type="button"
              onClick={() => setSelectedRunId(currentRun.id)}
              className={`workflow-run-row ${selectedRunId === currentRun.id ? "is-selected" : ""}`}
            >
              <div className="workflow-run-row-main">
                <strong>{currentRun.workflow_name || "Workflow"}</strong>
                <span>
                  {currentRun.trigger_key === "business_command"
                    ? `${currentRun.metadata?.method || "MUTATION"} · ${currentRun.metadata?.path || "API"}`
                    : `${currentRun.trigger_key || "trigger"} · ${currentRun.record_id ? "record" : "object"}`}
                </span>
                <small>{formatDate(currentRun.started_at)} · #{currentRun.id?.slice(0, 8) || ""}</small>
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

            <div className="workflow-run-record">
              <div className="workflow-run-record-section">
                <div className="workflow-run-record-section-title">Run details</div>
                <div className="workflow-run-record-grid">
                  <div><span>Run ID</span><strong>{run.id || "—"}</strong></div>
                  <div><span>Workflow</span><strong>{run.workflow_name || "—"}</strong></div>
                  <div><span>Status</span><strong>{String(run.status || "—")}</strong></div>
                  <div><span>Version</span><strong>{run.workflow_version ?? 1}</strong></div>
                  <div><span>Trigger</span><strong>{run.trigger_key || "—"}</strong></div>
                  <div><span>System key</span><strong>{run.metadata?.systemKey || "—"}</strong></div>
                  <div><span>Capability</span><strong>{run.metadata?.capabilityKey || run.metadata?.source?.capability || "—"}</strong></div>
                  <div><span>Capability type</span><strong>{run.metadata?.capabilityType || "—"}</strong></div>
                  <div><span>Retry count</span><strong>{run.metadata?.retryCount ?? run.retry_count ?? 0}</strong></div>
                </div>
              </div>

              <div className="workflow-run-record-section">
                <div className="workflow-run-record-section-title">App / origin</div>
                <div className="workflow-run-record-grid">
                  <div><span>App</span><strong>{run.metadata?.source?.appName || run.metadata?.source?.packageKey || "—"}</strong></div>
                  <div><span>Package</span><strong>{run.metadata?.source?.packageKey || "—"}</strong></div>
                  <div className="wide"><span>Instance</span><strong>{run.metadata?.source?.connectorInstanceId || "—"}</strong></div>
                  <div className="wide"><span>Correlation ID</span><strong>{run.metadata?.correlationId || "—"}</strong></div>
                </div>
              </div>

              <div className="workflow-run-record-section">
                <div className="workflow-run-record-section-title">Timing & source</div>
                <div className="workflow-run-record-grid">
                  <div><span>Started</span><strong>{formatDate(run.started_at)}</strong></div>
                  <div><span>Completed</span><strong>{formatDate(run.completed_at)}</strong></div>
                  <div><span>Duration</span><strong>{run.metadata?.durationMs != null ? `${run.metadata.durationMs} ms` : "—"}</strong></div>
                  <div className="wide"><span>Source</span><strong>{run.metadata?.method ? `${run.metadata.method} ${run.metadata.path || ""}` : run.metadata?.source?.method ? `${run.metadata.source.method} ${run.metadata.source.path || ""}` : run.metadata?.source?.type || run.metadata?.source || "—"}</strong></div>
                </div>
              </div>

              <div className="workflow-run-record-section">
                <div className="workflow-run-record-section-title">Context</div>
                <div className="workflow-run-record-grid">
                  <div><span>Record</span><strong>{run.record_id || "—"}</strong></div>
                  <div><span>Object</span><strong>{run.object_id || "—"}</strong></div>
                  <div><span>Actor</span><strong>{run.metadata?.actorUserId || "—"}</strong></div>
                  <div><span>Store</span><strong>{run.metadata?.storeId || "—"}</strong></div>
                  <div><span>Till</span><strong>{run.metadata?.tillId || "—"}</strong></div>
                  <div><span>Parent run</span><strong>{run.parent_run_id || run.parentRunId || "—"}</strong></div>
                </div>
              </div>
            </div>

            {run.error_text || run.metadata?.last_error || run.metadata?.error || run.metadata?.rootError?.message ? (
              <div className="workflow-run-error"><strong>Failure summary</strong><span>{run.error_text || run.metadata?.last_error || run.metadata?.rootError?.message || run.metadata?.error || "Execution failed"}</span></div>
            ) : null}

            {run.metadata ? (
              <details className="workflow-run-trace">
                <summary>Trace summary</summary>
                <pre>{JSON.stringify(redact(run.metadata), null, 2)}</pre>
              </details>
            ) : null}

            {(details?.children || []).length > 0 ? (
              <div className="workflow-run-steps">
                <div className="workflow-run-section-title">Triggered workflows</div>
                {(details.children || []).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="workflow-run-step"
                    onClick={() => setSelectedRunId(child.id)}
                  >
                    <div className="workflow-run-step-head">
                      <strong>{child.workflow_name || child.metadata?.capabilityKey || "Workflow"}</strong>
                      <span className={statusBadge(child.status)}>{String(child.status || "pending")}</span>
                    </div>
                    <div className="workflow-run-step-meta">
                      <span>{child.metadata?.capabilityType || child.trigger_key || "workflow"}</span>
                      <span>{formatDate(child.started_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
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
