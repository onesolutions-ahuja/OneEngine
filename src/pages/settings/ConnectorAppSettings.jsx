import { ArrowLeft } from "lucide-react";
import ConnectorInstancesPanel from "../integrations/ConnectorInstancesPanel.jsx";

function connectorTitle(packageKey) {
  if (packageKey === "one_connect_square") return "One Connect - Square";
  if (packageKey === "one_connect_dojo") return "One Connect - Dojo";
  if (packageKey === "one_connect_sumup") return "One Connect - SumUp";
  return String(packageKey || "Connector").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ConnectorAppSettings({ packageKey, onBack }) {
  const title = connectorTitle(packageKey);
  return (
    <div className="integration-theme">
      <div className="flex items-center gap-3 mb-4">
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
