import { ArrowLeft } from "lucide-react";
import ConnectorInstancesPanel from "../integrations/ConnectorInstancesPanel.jsx";

function metadataTitle(item, packageKey) {
  const manifest = item?.manifest || item?.company_installation?.manifest || {};
  return item?.name || manifest.name || manifest.label || String(packageKey || "Connector").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ConnectorAppSettings({ packageKey, packageMetadata, onBack }) {
  const title = metadataTitle(packageMetadata, packageKey);
  return (
    <div className="integration-theme connector-settings-screen">
      <div className="connector-settings-page-head">
        <button type="button" onClick={onBack} className="h-9 px-3 bg-white border border-slate-200 rounded-lg text-sm flex items-center gap-2 hover:bg-slate-50">
          <ArrowLeft size={15} /> oneStore
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{packageMetadata?.description || "App settings and connection testing."}</p>
        </div>
      </div>
      <ConnectorInstancesPanel packageKey={packageKey} settingsMode />
    </div>
  );
}
