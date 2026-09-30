import { ArrowLeft } from "lucide-react";
import ConnectorInstancesPanel from "../integrations/ConnectorInstancesPanel.jsx";

export default function ConnectorAppSettings({ packageKey, onBack }) {
  return (
    <div className="integration-theme">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50">
          <ArrowLeft size={15} /> oneStore
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Connector Settings</h1>
          <p className="text-sm text-slate-500">Package-owned setup and connection testing.</p>
        </div>
      </div>
      <ConnectorInstancesPanel packageKey={packageKey} settingsMode />
    </div>
  );
}
