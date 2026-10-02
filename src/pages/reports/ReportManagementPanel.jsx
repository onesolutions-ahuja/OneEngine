import { useEffect, useMemo, useState } from "react";
import {
  createReportFolder,
  createReportSubscription,
  deleteReportSubscription,
  getReportFolders,
  getReportHistory,
  getReportNavigation,
  getReportSubscriptions,
  moveReportToFolder,
  setReportFavourite,
} from "../../services/customReports.js";

const muted = { color: "var(--onepos-text-muted)" };

export default function ReportManagementPanel({
  reports = [],
  currentReportId = null,
  canManage = false,
  onOpenReport,
  onRunReport,
  onDuplicateReport,
  onArchiveReport,
  onRefresh,
}) {
  const [folders, setFolders] = useState([]);
  const [navigation, setNavigation] = useState({ favourites: [], recent: [] });
  const [subscriptions, setSubscriptions] = useState([]);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadManagement = async () => {
    try {
      const [folderResult, navResult] = await Promise.all([getReportFolders(), getReportNavigation()]);
      setFolders(folderResult?.success ? folderResult.data || [] : []);
      setNavigation(navResult?.success ? navResult.data || { favourites: [], recent: [] } : { favourites: [], recent: [] });
    } catch (err) {
      setError(err?.message || "Unable to load report management");
    }
  };

  useEffect(() => { void loadManagement(); }, []);

  useEffect(() => {
    let live = true;
    if (!currentReportId) {
      setSubscriptions([]);
      setHistory([]);
      return () => { live = false; };
    }
    Promise.all([
      getReportSubscriptions(currentReportId).catch(() => null),
      getReportHistory(currentReportId).catch(() => null),
    ]).then(([subscriptionResult, historyResult]) => {
      if (!live) return;
      setSubscriptions(subscriptionResult?.success ? subscriptionResult.data || [] : []);
      setHistory(historyResult?.success ? historyResult.data || [] : []);
    });
    return () => { live = false; };
  }, [currentReportId]);

  const favouriteIds = useMemo(() => new Set((navigation.favourites || []).map((item) => String(item.id))), [navigation.favourites]);
  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (folderFilter === "__none__" && report.folder_id) return false;
      if (folderFilter && folderFilter !== "__none__" && String(report.folder_id || "") !== String(folderFilter)) return false;
      if (!q) return true;
      return [report.name, report.description, report.created_by_name].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [reports, query, folderFilter]);

  const toggleFavourite = async (report) => {
    try {
      setBusy(`fav:${report.id}`);
      await setReportFavourite(report.id, !favouriteIds.has(String(report.id)));
      await loadManagement();
    } catch (err) {
      setError(err?.message || "Unable to update favourite");
    } finally {
      setBusy("");
    }
  };

  const move = async (reportId, folderId) => {
    try {
      setBusy(`move:${reportId}`);
      await moveReportToFolder(reportId, folderId || null);
      await Promise.all([loadManagement(), onRefresh?.()]);
    } catch (err) {
      setError(err?.message || "Unable to move report");
    } finally {
      setBusy("");
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      setBusy("new-folder");
      await createReportFolder({ name, visibility: "PRIVATE", access: [] });
      setNewFolderName("");
      await loadManagement();
    } catch (err) {
      setError(err?.message || "Unable to create folder");
    } finally {
      setBusy("");
    }
  };

  const subscribe = async () => {
    if (!currentReportId) return;
    try {
      setBusy("subscribe");
      await createReportSubscription(currentReportId, {
        active: true,
        cadence: "DAILY",
        hour: 8,
        minute: 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
        delivery: ["IN_APP"],
        recipients: [],
        condition: { type: "ALWAYS" },
      });
      const response = await getReportSubscriptions(currentReportId);
      setSubscriptions(response?.success ? response.data || [] : []);
    } catch (err) {
      setError(err?.message || "Unable to create subscription");
    } finally {
      setBusy("");
    }
  };

  const removeSubscription = async (subscriptionId) => {
    try {
      setBusy(`subscription:${subscriptionId}`);
      await deleteReportSubscription(currentReportId, subscriptionId);
      const response = await getReportSubscriptions(currentReportId);
      setSubscriptions(response?.success ? response.data || [] : []);
    } catch (err) {
      setError(err?.message || "Unable to delete subscription");
    } finally {
      setBusy("");
    }
  };

  return <div className="space-y-4">
    {error ? <div className="onepos-alert onepos-alert-error">{error}</div> : null}

    <section className="onepos-card onepos-card-body space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="onepos-label flex-1 min-w-[220px]">Search reports
          <input className="onepos-input mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, description or owner" />
        </label>
        <label className="onepos-label min-w-[200px]">Folder
          <select className="onepos-input mt-1" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
            <option value="">All folders</option>
            <option value="__none__">Unfiled</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label>
        {canManage ? <div className="flex gap-2 items-end">
          <label className="onepos-label">New folder
            <input className="onepos-input mt-1" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" />
          </label>
          <button type="button" className="onepos-btn onepos-btn-secondary" disabled={busy === "new-folder"} onClick={createFolder}>Create</button>
        </div> : null}
      </div>

      {(navigation.favourites || []).length || (navigation.recent || []).length ? <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase mb-2" style={muted}>Favourites</div>
          <div className="flex flex-wrap gap-2">{(navigation.favourites || []).slice(0,8).map((report) => <button key={report.id} type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>{report.name}</button>)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase mb-2" style={muted}>Recent</div>
          <div className="flex flex-wrap gap-2">{(navigation.recent || []).slice(0,8).map((report) => <button key={report.id} type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>{report.name}</button>)}</div>
        </div>
      </div> : null}
    </section>

    <section className="onepos-card overflow-hidden">
      <div className="onepos-card-header"><span className="onepos-card-title">Available reports</span></div>
      {filteredReports.length ? filteredReports.map((report) => {
        const fav = favouriteIds.has(String(report.id));
        const folderValue = report.folder_id || "";
        return <div key={report.id} className="p-4 border-b last:border-b-0 flex flex-wrap items-center gap-3">
          <button type="button" className="text-lg leading-none" aria-label={fav ? "Remove favourite" : "Add favourite"} disabled={busy === `fav:${report.id}`} onClick={() => toggleFavourite(report)}>{fav ? "★" : "☆"}</button>
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{report.name}</div>
            <div className="text-xs" style={muted}>{report.description || "Report"}{report.created_by_name ? ` · Created by ${report.created_by_name}` : ""}</div>
          </div>
          <select className="onepos-input w-auto min-w-[150px]" value={folderValue} disabled={busy === `move:${report.id}`} onChange={(e) => move(report.id, e.target.value)}>
            <option value="">Unfiled</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-primary" onClick={() => onRunReport?.(report.id)}>Run</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>Edit</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onDuplicateReport?.(report)}>Duplicate</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onArchiveReport?.(report)}>Archive</button>
        </div>;
      }) : <div className="onepos-empty">No matching reports.</div>}
    </section>

    {currentReportId ? <section className="onepos-card onepos-card-body space-y-4">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Subscriptions</h3><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={busy === "subscribe"} onClick={subscribe}>Subscribe daily</button></div>
          {subscriptions.length ? subscriptions.map((item) => <div key={item.id} className="rounded-lg border p-2 flex items-center gap-2" style={{borderColor:"var(--onepos-border)"}}>
            <div className="flex-1 text-sm"><strong>{item.definition?.cadence || "DAILY"}</strong><span className="block text-xs" style={muted}>{item.definition?.timezone || ""} · {item.last_status || "Not run yet"}</span></div>
            <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={busy === `subscription:${item.id}`} onClick={() => removeSubscription(item.id)}>Remove</button>
          </div>) : <div className="text-sm" style={muted}>No subscriptions yet.</div>}
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Snapshot history</h3>
          {history.length ? history.slice(0,8).map((item) => <div key={item.id} className="rounded-lg border p-2 text-sm" style={{borderColor:"var(--onepos-border)"}}><strong>{item.period_key || new Date(item.captured_at).toLocaleDateString()}</strong><span className="block text-xs" style={muted}>{item.row_count} rows · {new Date(item.captured_at).toLocaleString()}</span></div>) : <div className="text-sm" style={muted}>No snapshots captured yet.</div>}
        </div>
      </div>
    </section> : null}
  </div>;
}
