import CustomReportsAdmin from "./CustomReportsAdmin.jsx";

export default function CustomReportsPage({ onBack }) {
  return <div className="space-y-4">
    {onBack ? <button type="button" className="onepos-btn onepos-btn-secondary" onClick={onBack}>Back</button> : null}
    <CustomReportsAdmin />
  </div>;
}
