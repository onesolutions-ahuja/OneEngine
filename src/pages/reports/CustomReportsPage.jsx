import { useEffect, useState } from "react";
import CustomReportsAdmin from "./CustomReportsAdmin.jsx";
import { getCustomReport } from "../../services/customReports.js";

function readReportDrill() {
  try {
    const raw = sessionStorage.getItem("oneengine.reportDrill");
    sessionStorage.removeItem("oneengine.reportDrill");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.reportId) return null;
    if (parsed.createdAt && Date.now() - Number(parsed.createdAt) > 5 * 60 * 1000) return null;
    return {
      reportId: String(parsed.reportId),
      filters: Array.isArray(parsed.filters) ? parsed.filters : [],
    };
  } catch {
    return null;
  }
}

export default function CustomReportsPage({ onBack }) {
  const [drill] = useState(() => readReportDrill());
  const [initialReport, setInitialReport] = useState(null);
  const [loadingDrill, setLoadingDrill] = useState(Boolean(drill?.reportId));
  const [drillError, setDrillError] = useState("");

  useEffect(() => {
    let live = true;
    if (!drill?.reportId) return () => { live = false; };
    getCustomReport(drill.reportId)
      .then((response) => {
        if (!live) return;
        if (!response?.success) throw new Error(response?.message || "Unable to open target report");
        setInitialReport(response.data);
      })
      .catch((error) => {
        if (live) setDrillError(error?.message || "Unable to open target report");
      })
      .finally(() => {
        if (live) setLoadingDrill(false);
      });
    return () => { live = false; };
  }, [drill?.reportId]);

  return <div className="space-y-4">
    {onBack ? <button type="button" className="onepos-btn onepos-btn-secondary" onClick={onBack}>Back</button> : null}
    {drillError ? <div className="onepos-alert onepos-alert-error">{drillError}</div> : null}
    {loadingDrill
      ? <div className="onepos-empty">Opening report…</div>
      : <CustomReportsAdmin initialReport={initialReport} initialRuntimeFilters={drill?.filters || []} />}
  </div>;
}
