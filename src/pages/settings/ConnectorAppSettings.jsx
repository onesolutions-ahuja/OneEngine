import { ArrowLeft } from "lucide-react";
import ConnectorInstancesPanel from "../integrations/ConnectorInstancesPanel.jsx";

export default function ConnectorAppSettings({ packageKey, packageLabel = "", onBack }) {
  const title = packageLabel || String(packageKey || "Connector").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <div className="integration-theme connector-settings-screen">
      <div className="connector-settings-page-head">
        <button type="button" onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50">
          <ArrowLeft size={15} /> oneStore
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">App settings and connection testing.</p>
        </div>
      </div>
      <ConnectorInstancesPanel packageKey={packageKey} settingsMode />
    </div>
  );
}
