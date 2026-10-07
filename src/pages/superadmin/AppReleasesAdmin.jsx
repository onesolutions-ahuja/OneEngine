import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Package, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import { apiRequest } from "../../services/api.js";

function statusTone(status) {
  const map = {
    DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
    VALIDATED: "bg-emerald-50 text-emerald-800 border-emerald-200",
    PUBLISHED: "bg-sky-50 text-sky-800 border-sky-200",
    PAUSED: "bg-amber-50 text-amber-800 border-amber-200",
    ARCHIVED: "bg-rose-50 text-rose-800 border-rose-200",
  };
  return map[status] || "bg-slate-100 text-slate-700 border-slate-200";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatChangeEntry(change, index) {
  const type = String(change?.type || change?.changeType || change?.kind || "UPDATE").toUpperCase();
  const label = change?.label || change?.name || change?.field || change?.key || change?.metadataKey || "Configuration change";
  return {
    key: `${type}-${label}-${index}`,
    label,
    type,
    destructive: Boolean(change?.destructive === true || /DROP|REMOVE|DELETE|REPLACE/i.test(type)),
  };
}

export default function AppReleasesAdmin() {
  const [packages, setPackages] = useState([]);
  const [releases, setReleases] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [rolloutStatus, setRolloutStatus] = useState(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [rolloutStage, setRolloutStage] = useState("10%");
  const [submitState, setSubmitState] = useState({ busy: false, error: "", success: "" });
  const [form, setForm] = useState({
    version: "1.0.0",
    previousVersion: "",
    releaseNotes: "",
    minimumPlatformVersion: "",
    updatePolicy: "OPTIONAL",
    changeSet: "[\n  {\n    \"type\": \"ADD_FIELD\",\n    \"label\": \"New release object field\",\n    \"destructive\": false\n  }\n]",
  });

  async function loadData() {
    setLoading(true);
    setSubmitState((current) => ({ ...current, error: "", success: "" }));
    try {
      const [packagesResult, releasesResult] = await Promise.all([
        apiRequest("/api/superadmin/packages"),
        apiRequest("/api/superadmin/packages/releases"),
      ]);
      if (!packagesResult.success) throw new Error(packagesResult.message || "Unable to load packages");
      if (!releasesResult.success) throw new Error(releasesResult.message || "Unable to load releases");
      const packageList = Array.isArray(packagesResult.data) ? packagesResult.data : [];
      setPackages(packageList);
      setSelectedPackage((previous) => previous || packageList[0]?.package_key || "");
      setReleases(Array.isArray(releasesResult.data) ? releasesResult.data : []);
    } catch (error) {
      setSubmitState((current) => ({ ...current, error: error.message || "Unable to load release data" }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function loadRolloutStatus(releaseId = selectedReleaseId) {
    if (!releaseId) {
      setRolloutStatus(null);
      return;
    }
    try {
      const result = await apiRequest(`/api/superadmin/packages/releases/${encodeURIComponent(releaseId)}/status`);
      if (!result.success) throw new Error(result.message || "Unable to load rollout status");
      setRolloutStatus(result.data || null);
    } catch (error) {
      setRolloutStatus(null);
      setSubmitState((current) => ({ ...current, error: error.message || "Unable to load rollout status" }));
    }
  }

  useEffect(() => { loadRolloutStatus(); }, [selectedReleaseId]);

  const filteredReleases = useMemo(() => {
    if (!selectedPackage) return releases;
    return releases.filter((release) => release.package_key === selectedPackage || release.packageKey === selectedPackage);
  }, [releases, selectedPackage]);

  const selectedRelease = useMemo(() => {
    const next = filteredReleases.find((release) => release.id === selectedReleaseId) || filteredReleases[0] || null;
    if (next && !selectedReleaseId) setSelectedReleaseId(next.id);
    return next;
  }, [filteredReleases, selectedReleaseId]);

  const rolloutCompanies = rolloutStatus?.companies || [];
  const rolloutSummary = rolloutStatus?.summary || {};
  const releaseStats = [
    { label: "Installed companies", value: rolloutSummary.total || 0 },
    { label: "Versions in use", value: new Set(rolloutCompanies.map((company) => company.installed_version).filter(Boolean)).size },
    { label: "Rollout progress", value: `${rolloutSummary.progress || 0}%` },
    { label: "Failed upgrades", value: rolloutSummary.failed || 0 },
    { label: "Last published", value: selectedRelease ? formatDate(selectedRelease.published_at || selectedRelease.publishedAt) : "—" },
  ];

  const changeEntries = Array.isArray(selectedRelease?.change_set) ? selectedRelease.change_set.map(formatChangeEntry) : [];

  async function createRelease(event) {
    event.preventDefault();
    if (!selectedPackage) {
      setSubmitState({ busy: false, error: "Select a package before creating a release.", success: "" });
      return;
    }

    let parsedChangeSet = [];
    try {
      parsedChangeSet = JSON.parse(form.changeSet);
    } catch {
      setSubmitState({ busy: false, error: "Release changes must contain valid JSON.", success: "" });
      return;
    }

    if (!Array.isArray(parsedChangeSet)) {
      setSubmitState({ busy: false, error: "Release changes must be a JSON array.", success: "" });
      return;
    }

    setSubmitState({ busy: true, error: "", success: "" });
    try {
      const result = await apiRequest("/api/superadmin/packages/releases", {
        method: "POST",
        body: JSON.stringify({
          packageKey: selectedPackage,
          version: form.version,
          previousVersion: form.previousVersion || null,
          releaseNotes: form.releaseNotes,
          minimumPlatformVersion: form.minimumPlatformVersion || null,
          updatePolicy: form.updatePolicy,
          changeSet: parsedChangeSet,
        }),
      });
      if (!result.success) throw new Error(result.message || "Unable to create the release");
      setSubmitState({ busy: false, error: "", success: `Release ${result.data?.version || form.version} created.` });
      await loadData();
      setForm((current) => ({ ...current, version: "1.0.0", previousVersion: "", releaseNotes: "", minimumPlatformVersion: "", updatePolicy: "OPTIONAL", changeSet: "[]" }));
    } catch (error) {
      setSubmitState({ busy: false, error: error.message || "Unable to create the release.", success: "" });
    }
  }

  async function triggerAction(action, releaseId, extraBody) {
    if (!releaseId) return;
    setSubmitState({ busy: true, error: "", success: "" });
    try {
      const path = `/api/superadmin/packages/releases/${encodeURIComponent(releaseId)}/${action}`;
      const payload = extraBody ? { method: "POST", body: JSON.stringify(extraBody) } : { method: "POST" };
      const result = await apiRequest(path, payload);
      if (!result.success) throw new Error(result.message || `Unable to ${action} this release`);
      setSubmitState({ busy: false, error: "", success: `Release ${action.replace(/-/g, " ")} completed successfully.` });
      await loadData();
      await loadRolloutStatus(releaseId);
      if (action === "start-rollout") setSelectedCompanyIds([]);
    } catch (error) {
      setSubmitState({ busy: false, error: error.message || "Unable to update the release.", success: "" });
    }
  }

  const selectedPackageDetails = packages.find((item) => item.package_key === selectedPackage) || null;
  const conflictReports = [
    ...(rolloutStatus?.conflicts || []).map((conflict) => typeof conflict === "string" ? conflict : conflict.message || JSON.stringify(conflict)),
    ...rolloutCompanies.filter((company) => company.conflict).map((company) => `${company.company_name}: ${company.conflict}`),
  ];
  const rolloutStartedAt = rolloutCompanies.map((company) => company.last_attempt).filter(Boolean).sort()[0] || null;

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Platform maintenance</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">App Releases</h1>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          Release-safe rollout controls
        </div>
      </header>

      {submitState.error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{submitState.error}</div> : null}
      {submitState.success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{submitState.success}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={createRelease} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-700" />
            <h2 className="text-lg font-semibold text-slate-900">Create release</h2>
          </div>

          <label className="mb-4 block text-sm font-medium text-slate-700">
            Package
            <select className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none ring-0 focus:border-emerald-600" value={selectedPackage} onChange={(event) => setSelectedPackage(event.target.value)}>
              <option value="">Select package</option>
              {packages.map((item) => <option key={item.package_key} value={item.package_key}>{item.name || item.package_key}</option>)}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Version
              <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Previous version
              <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.previousVersion} onChange={(event) => setForm((current) => ({ ...current, previousVersion: event.target.value }))} placeholder="1.0.0" />
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Minimum platform
              <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.minimumPlatformVersion} onChange={(event) => setForm((current) => ({ ...current, minimumPlatformVersion: event.target.value }))} placeholder="1.0.0" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Update policy
              <select className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={form.updatePolicy} onChange={(event) => setForm((current) => ({ ...current, updatePolicy: event.target.value }))}>
                <option value="OPTIONAL">Optional</option>
                <option value="FORCED">Forced</option>
                <option value="STAGED">Staged</option>
              </select>
            </label>
            <div className="flex items-end">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {selectedPackageDetails ? `${selectedPackageDetails.name || selectedPackageDetails.package_key} · ${selectedPackageDetails.version || "unversioned"}` : "No package selected"}
              </div>
            </div>
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Release notes
            <textarea className="mt-1 min-h-[90px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={form.releaseNotes} onChange={(event) => setForm((current) => ({ ...current, releaseNotes: event.target.value }))} placeholder="Describe the user-visible update" />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Change set JSON
            <textarea className="mt-1 min-h-[150px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs" value={form.changeSet} onChange={(event) => setForm((current) => ({ ...current, changeSet: event.target.value }))} />
          </label>

          <button type="submit" disabled={submitState.busy || !selectedPackage} className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {submitState.busy ? "Creating…" : "Create release"}
          </button>
        </form>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-sky-700" />
              <h2 className="text-lg font-semibold text-slate-900">Release queue</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">{filteredReleases.length} releases</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-slate-500">Loading releases…</div>
          ) : filteredReleases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No releases found for this package yet.</div>
          ) : (
            <div className="space-y-3">
              {filteredReleases.map((release) => (
                <article key={release.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">{release.package_name || release.packageKey || release.package_key || "Release"}</h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(release.status)}`}>{release.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{release.version || "—"} {release.previousVersion ? `from ${release.previousVersion}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setSelectedReleaseId(release.id)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">Open Release</button>
                      {release.status !== "VALIDATED" ? <button type="button" onClick={() => triggerAction("validate", release.id)} className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">Validate</button> : null}
                      {release.status !== "PUBLISHED" ? <button type="button" onClick={() => triggerAction("publish", release.id)} className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100">Publish</button> : null}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <div><span className="text-slate-500">Update policy:</span> {release.updatePolicy || release.update_policy || "OPTIONAL"}</div>
                    <div><span className="text-slate-500">Published:</span> {formatDate(release.published_at || release.publishedAt)}</div>
                    <div className="sm:col-span-2"><span className="text-slate-500">Release notes:</span> {release.release_notes || release.releaseNotes || "No notes provided."}</div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {release.change_set?.length || release.delta?.length || 0} change entries
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    {release.minimum_platform_version || release.minimumPlatformVersion || "No platform floor"}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {selectedRelease ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {releaseStats.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <p className="mt-3 text-xl font-semibold text-slate-900">{item.value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Release detail</p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">{selectedRelease.package_name || selectedRelease.packageKey || selectedRelease.package_key || "Release"}</h2>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(selectedRelease.status)}`}>{selectedRelease.status}</span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">App</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{selectedRelease.package_name || selectedRelease.packageKey || selectedRelease.package_key || "Package"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current version → target version</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{rolloutStatus?.release?.current_version || selectedRelease.previousVersion || "—"} → {selectedRelease.version}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => triggerAction("validate", selectedRelease.id)} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100">Validate</button>
                <button type="button" onClick={() => triggerAction("publish", selectedRelease.id)} className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100">Publish</button>
                <button type="button" onClick={() => triggerAction("start-rollout", selectedRelease.id, { stage: rolloutStage, companyIds: rolloutStage === "internal" ? selectedCompanyIds : [] })} disabled={submitState.busy || (rolloutStage === "internal" && selectedCompanyIds.length === 0)} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">Start Rollout</button>
                {selectedRelease.status === "PAUSED" ? <button type="button" onClick={() => triggerAction("resume", selectedRelease.id)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Resume</button> : <button type="button" onClick={() => triggerAction("pause", selectedRelease.id)} disabled={selectedRelease.status !== "PUBLISHED"} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Pause</button>}
                <button type="button" onClick={() => triggerAction("retry", selectedRelease.id)} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100">Retry Failed</button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Changes</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {changeEntries.length ? changeEntries.map((entry) => (
                      <li key={entry.key} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="font-semibold">{entry.type}</span>
                        <span className="ml-2">{entry.label}</span>
                        {entry.destructive ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">destructive</span> : null}
                      </li>
                    )) : <li className="text-slate-500">No changelog entries were supplied.</li>}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Release summary</h3>
                    <dl className="mt-3 space-y-2 text-sm text-slate-700">
                      <div className="flex items-center justify-between gap-3"><dt>Release policy</dt><dd className="font-semibold">{selectedRelease.updatePolicy || selectedRelease.update_policy || "OPTIONAL"}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt>Conflicts</dt><dd className="font-semibold">{(rolloutStatus?.conflicts || []).length + (rolloutCompanies.filter((company) => company.conflict).length)}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt>Warnings</dt><dd className="font-semibold">{(rolloutStatus?.warnings || []).length}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt>Minimum platform</dt><dd className="font-semibold">{selectedRelease.minimumPlatformVersion || selectedRelease.minimum_platform_version || "—"}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt>Last published</dt><dd className="font-semibold">{formatDate(selectedRelease.published_at || selectedRelease.publishedAt)}</dd></div>
                      <div className="flex items-center justify-between gap-3"><dt>Migration state</dt><dd className="font-semibold">{rolloutCompanies.reduce((sum, company) => sum + (Number(company.migration_count) || 0), 0)} migration records</dd></div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Validation findings</h3>
                    {rolloutStatus?.warnings?.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">{rolloutStatus.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{typeof warning === "string" ? warning : warning.message || JSON.stringify(warning)}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">No warnings recorded by validation.</p>}
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Rollout status</h3>
                <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Completed companies</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{rolloutSummary.completed || 0} / {rolloutSummary.total || 0}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">{rolloutSummary.progress || 0}% complete</span>
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between"><span>Queued</span><strong>{rolloutSummary.queued || 0}</strong></div>
                  <div className="flex items-center justify-between"><span>Updating</span><strong>{rolloutSummary.updating || 0}</strong></div>
                  <div className="flex items-center justify-between"><span>Completed</span><strong>{rolloutSummary.completed || 0}</strong></div>
                  <div className="flex items-center justify-between"><span>Failed</span><strong>{rolloutSummary.failed || 0}</strong></div>
                  <div className="flex items-center justify-between"><span>Conflicts</span><strong>{rolloutSummary.conflicts || 0}</strong></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Staged rollout</h3>
                <label className="mt-4 block text-sm font-medium text-slate-700">Stage
                  <select value={rolloutStage} onChange={(event) => setRolloutStage(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3">
                    <option value="internal">Internal / selected companies</option>
                    <option value="10%">10%</option>
                    <option value="50%">50%</option>
                    <option value="100%">100%</option>
                  </select>
                </label>
                <p className="mt-3 text-sm text-slate-600">{rolloutSummary.total || 0} installed companies are in scope. Internal rollout uses checked companies; percentage stages use the backend's company cohort.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => triggerAction("start-rollout", selectedRelease.id, { stage: rolloutStage, companyIds: rolloutStage === "internal" ? selectedCompanyIds : [] })} disabled={submitState.busy || (rolloutStage === "internal" && selectedCompanyIds.length === 0)} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">Start Stage</button>
                  {selectedRelease.status === "PAUSED" ? <button type="button" onClick={() => triggerAction("resume", selectedRelease.id)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Resume</button> : <button type="button" onClick={() => triggerAction("pause", selectedRelease.id)} disabled={selectedRelease.status !== "PUBLISHED"} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">Pause</button>}
                </div>
              </div>
            </aside>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Tenant rollout</h3>
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Select</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Installed</th>
                      <th className="px-3 py-2 font-medium">Target</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Conflict</th>
                      <th className="px-3 py-2 font-medium">Error</th>
                      <th className="px-3 py-2 font-medium">Retry</th>
                      <th className="px-3 py-2 font-medium">Last attempt</th>
                      <th className="px-3 py-2 font-medium">Completed</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rolloutCompanies.map((entry) => (
                      <tr key={entry.company_id} className="align-top">
                        <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${entry.company_name} for internal rollout`} checked={selectedCompanyIds.includes(entry.company_id)} disabled={["QUEUED", "UPDATING", "FAILED"].includes(entry.status) || entry.installed_version === selectedRelease.version} onChange={(event) => setSelectedCompanyIds((current) => event.target.checked ? [...new Set([...current, entry.company_id])] : current.filter((id) => id !== entry.company_id))} /></td>
                        <td className="px-3 py-2 font-medium text-slate-700">{entry.company_name}</td>
                        <td className="px-3 py-2 text-slate-600">v{entry.installed_version || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">v{entry.target_version || selectedRelease.version}</td>
                        <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${entry.status === "FAILED" ? "border-rose-200 bg-rose-50 text-rose-800" : entry.status === "UPDATING" ? "border-amber-200 bg-amber-50 text-amber-800" : entry.status === "CURRENT" && entry.installed_version === selectedRelease.version ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{entry.status}</span></td>
                        <td className="px-3 py-2 text-slate-600">{entry.conflict || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{entry.error || "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{entry.retry_count}</td>
                        <td className="px-3 py-2 text-slate-600">{formatDate(entry.last_attempt)}</td>
                        <td className="px-3 py-2 text-slate-600">{formatDate(entry.completed_at)}</td>
                        <td className="px-3 py-2">{entry.installed_version === selectedRelease.version ? <button type="button" onClick={() => triggerAction("rollback", selectedRelease.id, { companyId: entry.company_id })} className="text-xs font-medium text-rose-700 hover:underline">Rollback</button> : "—"}</td>
                      </tr>
                    ))}
                    {!rolloutCompanies.length ? <tr><td colSpan="11" className="px-3 py-6 text-center text-slate-500">{rolloutStatus ? "No company installations are in this rollout." : "Loading rollout data…"}</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Client override conflicts</h3>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>Package metadata provisioning preserves user-modified fields. Backend-reported upgrade failures remain visible in the tenant table.</p>
                {conflictReports.length ? <ul className="mt-3 list-disc space-y-2 pl-5 text-amber-900">{conflictReports.map((conflict, index) => <li key={`${conflict}-${index}`}>{conflict}</li>)}</ul> : <p className="mt-3 text-slate-500">No conflict details are available from the backend for this release.</p>}
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <h4 className="font-semibold text-slate-900">Audit / history</h4>
                <ul className="mt-3 space-y-2">
                  <li>Created: {formatDate(selectedRelease.createdAt || selectedRelease.created_at)}</li>
                  <li>Release status: {selectedRelease.status}</li>
                  <li>Published: {formatDate(selectedRelease.published_at || selectedRelease.publishedAt)}</li>
                  <li>Rollout started: {formatDate(rolloutStartedAt)}</li>
                  <li>Companies completed: {rolloutSummary.completed || 0}</li>
                  <li>Failed companies: {rolloutSummary.failed || 0}</li>
                  <li>Recorded retries: {rolloutCompanies.reduce((sum, company) => sum + (Number(company.retry_count) || 0), 0)}</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
