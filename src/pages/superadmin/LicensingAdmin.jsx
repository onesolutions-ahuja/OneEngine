import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api.js";
import { databaseConfigurationPayload } from "../../services/tenantDatabaseForm.js";

export default function LicensingAdmin({ companyId = '', lockCompany = false }) {
  const [licences, setLicences] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [marketplacePackages, setMarketplacePackages] = useState([]);
  const [marketplaceBundles, setMarketplaceBundles] = useState([]);
  const [marketplaceTiers, setMarketplaceTiers] = useState([]);
  const [editingLicenceId, setEditingLicenceId] = useState("");
  const [licenceForm, setLicenceForm] = useState({
    name: "", description: "", monthlyPrice: "0", billingPeriod: "MONTHLY",
    seatLimit: "", userLimit: "", durationDays: "", isTrial: false,
    trialDurationDays: "", startsAt: "", expiresAt: "", active: true,
  });
  const name = licenceForm.name;
  const [licencePackages, setLicencePackages] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(companyId || "");
  const [selectedLicence, setSelectedLicence] = useState("");
  const [companyEntitlements, setCompanyEntitlements] = useState(null);
  const [companyLicenceForm, setCompanyLicenceForm] = useState({ startsAt: "", expiresAt: "", active: true });
  const [companyBundles, setCompanyBundles] = useState([]);
  const [companyTiers, setCompanyTiers] = useState([]);
  const [jarvesLicence, setJarvesLicence] = useState({ allowance: 0, enabledUsers: 0, seatsRemaining: 0 });
  const [jarvesAllowanceDraft, setJarvesAllowanceDraft] = useState("0");
  const [entitlements, setEntitlements] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [databaseCompany, setDatabaseCompany] = useState(companyId || "");
  const [databaseConfig, setDatabaseConfig] = useState(null);
  const [databaseForm, setDatabaseForm] = useState({
    databaseMode: "ONEPOS_MANAGED",
    host: "",
    port: "5432",
    database: "",
    username: "",
    password: "",
    sslMode: "require",
  });
  const [databaseBusy, setDatabaseBusy] = useState(false);
  const [clientAdminEmail, setClientAdminEmail] = useState("");

  const load = async () => {
    try {
      const [licenceData, companyData, packageData, bundleData, tierData] = await Promise.all([
        apiRequest("/api/superadmin/licences"),
        apiRequest("/api/superadmin/companies"),
        apiRequest("/api/superadmin/packages"),
        apiRequest("/api/superadmin/bundles"),
        apiRequest("/api/superadmin/tiers"),
      ]);
      if (!licenceData.success || !companyData.success || !packageData.success || !bundleData.success || !tierData.success) {
        throw new Error("Unable to load licensing and marketplace data");
      }
      setLicences(licenceData.data || []);
      setCompanies(companyData.data || []);
      setMarketplacePackages(packageData.data || []);
      setMarketplaceBundles(bundleData.data || []);
      setMarketplaceTiers(tierData.data || []);
    } catch (err) {
      setError(err.message || "Unable to load licensing data");
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (companyId) { void selectCompany(companyId); void loadDatabaseConfig(companyId); } }, [companyId, companies.length]);

  const updateMarketplaceItem = (setter, id, field, value) => {
    setter((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const csvList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

  const saveMarketplaceSettings = async (path, payload, successMessage) => {
    setError(""); setMessage("");
    try {
      const result = await apiRequest(path, { method: "PUT", body: JSON.stringify(payload) });
      if (!result.success) throw new Error(result.message || "Unable to save marketplace settings");
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err.message || "Unable to save marketplace settings");
    }
  };

  const savePackageSettings = (item) => saveMarketplaceSettings(
    `/api/superadmin/packages/${item.id}/marketplace`,
    {
      active: item.active,
      visible: item.visible,
      installable: item.installable,
      billable: item.billable,
      system_only: item.system_only,
      category: item.category || "",
      display_order: Number(item.display_order) || 0,
      licence_mode: item.licence_mode,
      allowed_bundles: item.allowed_bundles || [],
      allowed_companies: item.allowed_companies || [],
      available_tiers: item.available_tiers || [],
      featured: item.featured === true,
    },
    `${item.name} marketplace settings saved.`
  );

  const saveBundleSettings = (item) => saveMarketplaceSettings(
    `/api/superadmin/bundles/${item.id}/marketplace`,
    {
      active: item.active,
      visible: item.visible,
      installable: item.installable,
      display_order: Number(item.display_order) || 0,
      allowed_companies: item.allowed_companies || [],
      available_tiers: item.available_tiers || [],
    },
    `${item.name} marketplace settings saved.`
  );

  const saveTierSettings = (item) => saveMarketplaceSettings(
    `/api/superadmin/tiers/${item.id}/marketplace`,
    {
      active: item.active,
      visible: item.visible,
      installable: item.installable,
      display_order: Number(item.display_order) || 0,
      allowed_companies: item.allowed_companies || [],
    },
    `${item.name} marketplace settings saved.`
  );

  const editLicence = (licence) => {
    setEditingLicenceId(licence.id);
    setLicenceForm({
      name: licence.name || "",
      description: licence.description || "",
      monthlyPrice: String(licence.monthly_price ?? 0),
      billingPeriod: licence.billing_period || "MONTHLY",
      seatLimit: licence.seat_limit == null ? "" : String(licence.seat_limit),
      userLimit: licence.user_limit == null ? "" : String(licence.user_limit),
      durationDays: licence.duration_days == null ? "" : String(licence.duration_days),
      isTrial: licence.is_trial === true,
      trialDurationDays: licence.trial_duration_days == null ? "" : String(licence.trial_duration_days),
      startsAt: licence.starts_at ? new Date(licence.starts_at).toISOString().slice(0, 16) : "",
      expiresAt: licence.expires_at ? new Date(licence.expires_at).toISOString().slice(0, 16) : "",
      active: licence.active === true,
    });
    const declaredKeys = marketplacePackages
      .map((item) => item.entitlement_key || item.entitlementKey || item.manifest?.entitlementKey || item.manifest?.entitlement_key)
      .filter(Boolean);
    setEntitlements({ ...Object.fromEntries(declaredKeys.map((key) => [key, false])), ...(licence.entitlements || {}) });
    setLicencePackages((licence.packages || []).map((item) => ({ ...item })));
  };

  const updateLicencePackage = (packageId, field, value) => {
    setLicencePackages((current) => current.map((item) => item.package_id === packageId ? { ...item, [field]: value } : item));
  };

  const toggleLicencePackage = (item, checked) => {
    setLicencePackages((current) => checked
      ? [...current, {
        package_id: item.id,
        entitlement_type: item.package_type === "FOUNDATION" || item.licence_mode === "TECHNICAL" ? "REQUIRED_DEPENDENCY" : "COMMERCIAL",
        version_range: "",
      }]
      : current.filter((entry) => entry.package_id !== item.id));
  };

  const saveLicence = async () => {
    setError(""); setMessage("");
    try {
      const optionalInteger = (value) => value === "" ? null : Number(value);
      const payload = {
        ...licenceForm,
        monthlyPrice: Number(licenceForm.monthlyPrice) || 0,
        seatLimit: optionalInteger(licenceForm.seatLimit),
        userLimit: optionalInteger(licenceForm.userLimit),
        durationDays: optionalInteger(licenceForm.durationDays),
        trialDurationDays: optionalInteger(licenceForm.trialDurationDays),
        startsAt: licenceForm.startsAt ? new Date(licenceForm.startsAt).toISOString() : null,
        expiresAt: licenceForm.expiresAt ? new Date(licenceForm.expiresAt).toISOString() : null,
        entitlements,
      };
      const result = await apiRequest(editingLicenceId
        ? `/api/superadmin/licences/${editingLicenceId}`
        : "/api/superadmin/licences", {
        method: editingLicenceId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (!result.success) throw new Error(result.message || "Unable to save licence");
      const licenceId = editingLicenceId || result.data?.id;
      const composition = await apiRequest(`/api/superadmin/licences/${licenceId}/packages`, {
        method: "PUT",
        body: JSON.stringify({ packages: licencePackages }),
      });
      if (!composition.success) throw new Error(composition.message || "Unable to save licence packages");
      setEditingLicenceId("");
      setLicenceForm({ name: "", description: "", monthlyPrice: "0", billingPeriod: "MONTHLY", seatLimit: "", userLimit: "", durationDays: "", isTrial: false, trialDurationDays: "", startsAt: "", expiresAt: "", active: true });
      setLicencePackages([]);
      setMessage("Licence catalogue entry saved."); await load();
    } catch (err) { setError(err.message || "Unable to save licence"); }
  };

  const createLicence = async () => {
    await saveLicence();
  };

  const saveComposition = async (path, item, successMessage) => {
    setError(""); setMessage("");
    try {
      const result = await apiRequest(path, {
        method: "PUT",
        body: JSON.stringify({ packages: item.packages || [], entitlements: item.entitlements || {} }),
      });
      if (!result.success) throw new Error(result.message || "Unable to save package composition");
      setMessage(successMessage);
      await load();
    } catch (err) {
      setError(err.message || "Unable to save package composition");
    }
  };

  const selectCompany = async (companyId) => {
    setSelectedCompany(companyId);
    const company = companies.find((item) => item.id === companyId);
    setSelectedLicence(company?.licence_id || "");
    setCompanyEntitlements(null);
    setCompanyBundles([]);
    setCompanyTiers([]);
    setCompanyLicenceForm({ startsAt: "", expiresAt: "", active: true });
    if (!companyId) return;
    try {
      const [result, jarvesResult] = await Promise.all([
        apiRequest(`/api/superadmin/companies/${companyId}/entitlements`),
        apiRequest(`/api/superadmin/companies/${companyId}/jarves-licence`),
      ]);
      if (!result.success) throw new Error(result.message || "Unable to load company entitlements");
      setCompanyEntitlements(result.data);
      if (jarvesResult?.success) {
        const nextJarves = jarvesResult.data || { allowance: 0, enabledUsers: 0, seatsRemaining: 0 };
        setJarvesLicence(nextJarves);
        setJarvesAllowanceDraft(String(nextJarves.allowance ?? 0));
      }
      setCompanyLicenceForm({
        startsAt: result.data.starts_at ? new Date(result.data.starts_at).toISOString().slice(0, 16) : "",
        expiresAt: result.data.expires_at ? new Date(result.data.expires_at).toISOString().slice(0, 16) : "",
        active: result.data.allocation_active !== false,
      });
      setCompanyBundles((result.data.bundles || []).map((item) => ({
        id: item.id, startsAt: item.starts_at, expiresAt: item.expires_at,
      })));
      setCompanyTiers((result.data.tiers || []).map((item) => ({
        id: item.id, startsAt: item.starts_at, expiresAt: item.expires_at,
      })));
    } catch (err) {
      setError(err.message || "Unable to load company entitlements");
    }
  };

  const toggleCompanyAssignment = (setter, id, checked) => {
    setter((current) => checked
      ? current.some((item) => item.id === id) ? current : [...current, { id, startsAt: null, expiresAt: null }]
      : current.filter((item) => item.id !== id));
  };

  const saveCompanyAssignments = async (kind) => {
    const isBundle = kind === "bundles";
    const assignments = (isBundle ? companyBundles : companyTiers).map((item) => ({
      [isBundle ? "bundleId" : "tierId"]: item.id,
      startsAt: item.startsAt || null,
      expiresAt: item.expiresAt || null,
    }));
    setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${selectedCompany}/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ assignments }),
      });
      if (!result.success) throw new Error(result.message || `Unable to save company ${kind}`);
      setMessage(`Company ${kind} updated.`);
      await selectCompany(selectedCompany);
    } catch (err) {
      setError(err.message || `Unable to save company ${kind}`);
    }
  };

  const updateCompositionPackage = (setter, id, item, checked) => {
    setter((items) => items.map((entry) => {
      if (entry.id !== id) return entry;
      const packages = entry.packages || [];
      const existing = packages.find((candidate) => candidate.package_id === item.id);
      return {
        ...entry,
        packages: checked
          ? existing ? packages : [...packages, {
            package_id: item.id,
            package_key: item.package_key,
            entitlement_type: item.package_type === "FOUNDATION" || item.licence_mode === "TECHNICAL" ? "REQUIRED_DEPENDENCY" : "COMMERCIAL",
            version_range: "",
          }]
          : packages.filter((candidate) => candidate.package_id !== item.id),
      };
    }));
  };

  const updateCompositionType = (setter, id, packageId, entitlementType) => {
    setter((items) => items.map((entry) => entry.id === id
      ? { ...entry, packages: (entry.packages || []).map((item) => item.package_id === packageId ? { ...item, entitlement_type: entitlementType } : item) }
      : entry));
  };

  const saveJarvesLicence = async () => {
    if (!selectedCompany) return;
    setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${selectedCompany}/jarves-licence`, {
        method: "PUT",
        body: JSON.stringify({ allowance: Math.max(0, Math.trunc(Number(jarvesAllowanceDraft) || 0)) }),
      });
      if (!result.success) throw new Error(result.message || "Unable to update JARVES licence seats");
      setJarvesLicence(result.data);
      setJarvesAllowanceDraft(String(result.data?.allowance ?? 0));
      setMessage("JARVES licence seats updated.");
    } catch (err) {
      setError(err.message || "Unable to update JARVES licence seats");
    }
  };

  const assignLicence = async () => {
    setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${selectedCompany}/licence`, {
        method: "PUT",
        body: JSON.stringify({ licenceId: selectedLicence || null, startsAt: companyLicenceForm.startsAt ? new Date(companyLicenceForm.startsAt).toISOString() : null, expiresAt: companyLicenceForm.expiresAt ? new Date(companyLicenceForm.expiresAt).toISOString() : null, active: companyLicenceForm.active }),
      });
      if (!result.success) throw new Error(result.message);
      setMessage("Company licence updated."); await load(); await selectCompany(selectedCompany);
    } catch (err) { setError(err.message || "Unable to assign licence"); }
  };

  const updateCompanyLicence = async (changes, successMessage) => {
    setError(""); setMessage("");
    try {
      const form = { ...companyLicenceForm, ...changes };
      const result = await apiRequest(`/api/superadmin/companies/${selectedCompany}/licence`, {
        method: "PUT",
        body: JSON.stringify({ licenceId: selectedLicence || null, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, active: form.active }),
      });
      if (!result.success) throw new Error(result.message || "Unable to update company licence");
      setMessage(successMessage); await load(); await selectCompany(selectedCompany);
    } catch (err) { setError(err.message || "Unable to update company licence"); }
  };

  const extendCompanyLicence = () => {
    const base = companyLicenceForm.expiresAt ? new Date(companyLicenceForm.expiresAt) : new Date();
    base.setDate(base.getDate() + 30);
    updateCompanyLicence({ expiresAt: base.toISOString().slice(0, 16) }, "Company licence extended by 30 days.");
  };

  const loadDatabaseConfig = async (companyId) => {
    setDatabaseCompany(companyId);
    setDatabaseConfig(null);
    setDatabaseForm((current) => ({ ...current, password: "" }));
    if (!companyId) return;
    try {
      const result = await apiRequest(`/api/superadmin/companies/${companyId}/database`);
      if (!result.success) throw new Error(result.message || "Unable to load database configuration");
      const data = result.data || {};
      setDatabaseConfig(data);
      setDatabaseForm({
        databaseMode: data.databaseMode || "ONEPOS_MANAGED",
        host: data.host || "",
        port: String(data.port || 5432),
        database: data.database || "",
        username: data.username || "",
        password: "",
        sslMode: data.sslMode || "require",
      });
      setClientAdminEmail(data.initialAdminEmail || "");
    } catch (err) {
      setError(err.message || "Unable to load database configuration");
    }
  };

  const provisionClientAdmin = async () => {
    if (!databaseCompany || !clientAdminEmail.trim()) {
      setError("Select a company and enter the client admin email.");
      return;
    }
    setDatabaseBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${databaseCompany}/provision-admin`, {
        method: "POST",
        body: JSON.stringify({ email: clientAdminEmail }),
        signal: AbortSignal.timeout(30000),
      });
      if (!result.success) throw new Error(result.message || "Unable to provision Company Admin");
      const normalizedEmail = clientAdminEmail.trim().toLowerCase();
      setClientAdminEmail(normalizedEmail);
      setDatabaseConfig((current) => ({ ...current, initialAdminEmail: normalizedEmail }));
      setMessage("Initial Company Admin saved. Initial password is marvel. You can change it from the account menu.");
    } catch (err) { setError(err.message || "Unable to provision Company Admin"); }
    finally { setDatabaseBusy(false); }
  };

  const saveDatabaseConfig = async () => {
    setDatabaseBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${databaseCompany}/database`, {
        method: "PUT",
        body: JSON.stringify(databaseConfigurationPayload(databaseForm)),
        signal: AbortSignal.timeout(30000),
      });
      if (!result.success) throw new Error(result.message || "Unable to save database configuration");
      setDatabaseConfig((current) => ({ ...current, ...result.data }));
      setDatabaseForm((current) => ({ ...current, password: "" }));
      setMessage("Database configuration saved. Test and validate it before activation.");
    } catch (err) { setError(err.message || "Unable to save database configuration"); }
    finally { setDatabaseBusy(false); }
  };

  const runDatabaseAction = async (action, successMessage) => {
    if (!databaseCompany) {
      setError("Select a company before running this database action.");
      return;
    }
    setDatabaseBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/api/superadmin/companies/${databaseCompany}/database/${action}`, {
        method: "POST",
        signal: AbortSignal.timeout(30000),
      });
      if (!result.success) throw new Error(result.message || `Unable to ${action.replace("-", " ")}`);
      setDatabaseConfig((current) => ({ ...current, ...(result.data || {}), schemaState: result.data?.schemaState || current?.schemaState }));
      setMessage(successMessage(result.data) || `${action.replace("-", " ")} completed successfully.`);
    } catch (err) {
      setError(err.message || `Unable to ${action.replace("-", " ")}`);
    }
    finally { setDatabaseBusy(false); }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="onepos-page-header"><div><h1 className="onepos-page-title">OneEngine licensing</h1><p className="onepos-page-subtitle">Manage company entitlements without changing user permissions.</p></div></div>
      {message && <div className="onepos-alert onepos-alert-success" role="status">{message}</div>}
      {error && <div className="onepos-alert onepos-alert-error" role="alert">{error}</div>}
      <section className="onepos-card onepos-card-body space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="onepos-card-title">Licence Catalogue</h2>
          {editingLicenceId && <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => { setEditingLicenceId(""); setLicencePackages([]); }}>New licence</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Licence name<input className="onepos-input mt-1 w-full" value={licenceForm.name} onChange={(event) => setLicenceForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="text-sm">Monthly price<input type="number" min="0" step="0.01" className="onepos-input mt-1 w-full" value={licenceForm.monthlyPrice} onChange={(event) => setLicenceForm((current) => ({ ...current, monthlyPrice: event.target.value }))} /></label>
          <label className="text-sm">Billing period<select className="onepos-input mt-1 w-full" value={licenceForm.billingPeriod} onChange={(event) => setLicenceForm((current) => ({ ...current, billingPeriod: event.target.value }))}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option><option value="ONE_TIME">One time</option></select></label>
          <label className="text-sm">Seat limit<input type="number" min="0" step="1" className="onepos-input mt-1 w-full" value={licenceForm.seatLimit} onChange={(event) => setLicenceForm((current) => ({ ...current, seatLimit: event.target.value }))} placeholder="Unlimited" /></label>
          <label className="text-sm">User limit<input type="number" min="0" step="1" className="onepos-input mt-1 w-full" value={licenceForm.userLimit} onChange={(event) => setLicenceForm((current) => ({ ...current, userLimit: event.target.value }))} placeholder="Unlimited" /></label>
          <label className="text-sm">Duration (days)<input type="number" min="1" step="1" className="onepos-input mt-1 w-full" value={licenceForm.durationDays} onChange={(event) => setLicenceForm((current) => ({ ...current, durationDays: event.target.value }))} placeholder="No fixed duration" /></label>
          <label className="text-sm">Trial duration (days)<input type="number" min="1" step="1" className="onepos-input mt-1 w-full" value={licenceForm.trialDurationDays} onChange={(event) => setLicenceForm((current) => ({ ...current, trialDurationDays: event.target.value }))} placeholder="Optional" /></label>
          <label className="text-sm">Starts at<input type="datetime-local" className="onepos-input mt-1 w-full" value={licenceForm.startsAt} onChange={(event) => setLicenceForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
          <label className="text-sm">Expires at<input type="datetime-local" className="onepos-input mt-1 w-full" value={licenceForm.expiresAt} onChange={(event) => setLicenceForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
          <label className="text-sm">Description<input className="onepos-input mt-1 w-full" value={licenceForm.description} onChange={(event) => setLicenceForm((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={licenceForm.isTrial} onChange={(event) => setLicenceForm((current) => ({ ...current, isTrial: event.target.checked }))} />Trial licence</label>
          <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={licenceForm.active} onChange={(event) => setLicenceForm((current) => ({ ...current, active: event.target.checked }))} />Active</label>
        </div>
        <div className="flex flex-wrap gap-4">
          {DEFAULT_KEYS.map((key) => <label key={key} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={entitlements[key] === true} onChange={(event) => setEntitlements((current) => ({ ...current, [key]: event.target.checked }))} />{key}</label>)}
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Included packages and dependencies</h3>
          {marketplacePackages.map((item) => {
            const selected = licencePackages.find((entry) => entry.package_id === item.id);
            return <div className="flex flex-wrap items-center gap-3 border-t pt-2" key={item.id}>
              <label className="flex min-w-56 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleLicencePackage(item, event.target.checked)} />{item.name} <span className="text-slate-500">{item.package_key}</span></label>
              {selected && <select className="onepos-input" value={selected.entitlement_type || "COMMERCIAL"} onChange={(event) => updateLicencePackage(item.id, "entitlement_type", event.target.value)}><option value="COMMERCIAL">Commercial entitlement</option><option value="REQUIRED_DEPENDENCY">Included dependency</option><option value="OPTIONAL">Optional dependency</option></select>}
            </div>;
          })}
        </div>
        <button className="onepos-btn onepos-btn-primary" onClick={createLicence} disabled={!name.trim()}>{editingLicenceId ? "Save licence" : "Create licence"}</button>
      </section>
      <section className="onepos-card onepos-card-body space-y-4">
        <h2 className="onepos-card-title">Assign company licence</h2>
        <div className="flex flex-wrap gap-3">
          {lockCompany
            ? <div className="onepos-input flex-1" aria-label="Selected company">{companies.find((company) => company.id === selectedCompany)?.name || "Selected client"}</div>
            : <select className="onepos-input flex-1" value={selectedCompany} onChange={(event) => selectCompany(event.target.value)}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name} ({company.licence_name || "unlicensed"})</option>)}</select>}
          <select className="onepos-input flex-1" value={selectedLicence} onChange={(event) => setSelectedLicence(event.target.value)}><option value="">No licence</option>{licences.filter((licence) => licence.active === true).map((licence) => <option key={licence.id} value={licence.id}>{licence.name}</option>)}</select>
          <button className="onepos-btn onepos-btn-primary" onClick={assignLicence} disabled={!selectedCompany}>Assign</button>
        </div>
        {companyEntitlements && <div className="border-t pt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5 text-sm">
            <div><span className="text-slate-500">Licence</span><strong className="block">{companyEntitlements.licence_name || "None"}</strong></div>
            <div><span className="text-slate-500">Status</span><strong className="block">{companyEntitlements.status}</strong></div>
            <div><span className="text-slate-500">Starts</span><strong className="block">{companyEntitlements.starts_at ? new Date(companyEntitlements.starts_at).toLocaleDateString() : "Immediate"}</strong></div>
            <div><span className="text-slate-500">Expires</span><strong className="block">{companyEntitlements.expires_at ? new Date(companyEntitlements.expires_at).toLocaleDateString() : "No expiry"}</strong></div>
            <div><span className="text-slate-500">Days remaining</span><strong className="block">{companyEntitlements.expires_at ? Math.max(0, Math.ceil((new Date(companyEntitlements.expires_at).getTime() - Date.now()) / 86400000)) : "-"}</strong></div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm">Starts at<input type="datetime-local" className="onepos-input mt-1 block" value={companyLicenceForm.startsAt} onChange={(event) => setCompanyLicenceForm((current) => ({ ...current, startsAt: event.target.value }))} /></label>
            <label className="text-sm">Expires at<input type="datetime-local" className="onepos-input mt-1 block" value={companyLicenceForm.expiresAt} onChange={(event) => setCompanyLicenceForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
            <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => updateCompanyLicence({}, "Company licence dates saved.")}>Save dates</button>
            <button type="button" className="onepos-btn onepos-btn-secondary" onClick={extendCompanyLicence}>Extend 30 days</button>
            {companyLicenceForm.active
              ? <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => updateCompanyLicence({ active: false }, "Company licence deactivated.")}>Deactivate</button>
              : <button type="button" className="onepos-btn onepos-btn-primary" onClick={() => updateCompanyLicence({ active: true }, "Company licence reactivated.")}>Reactivate</button>}
          </div>
          <p className="mt-2 text-sm font-medium">Feature entitlements</p>
          <div className="flex flex-wrap gap-3">{Object.entries(companyEntitlements.entitlements || {}).filter(([, enabled]) => enabled).map(([key]) => <span className="onepos-badge onepos-badge-success" key={key}>{key}</span>)}</div>
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-medium">JARVES licence seats</h3>
                <p className="text-sm text-slate-500">JARVES capacity is managed here with the company licence, not in Settings.</p>
                <p className="mt-1 text-xs text-slate-500">{jarvesLicence.enabledUsers} enabled · {jarvesLicence.seatsRemaining} remaining</p>
              </div>
              <div className="flex items-end gap-2">
                <label className="text-sm">Seats<input type="number" min="0" step="1" className="onepos-input mt-1 block w-28" value={jarvesAllowanceDraft} onChange={(event) => setJarvesAllowanceDraft(event.target.value)} /></label>
                <button type="button" className="onepos-btn onepos-btn-secondary" onClick={saveJarvesLicence}>Save JARVES seats</button>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Company bundles</h3><button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveCompanyAssignments("bundles")}>Save bundles</button></div>
              {marketplaceBundles.map((item) => <label className="flex items-center gap-2 text-sm" key={item.id}><input type="checkbox" checked={companyBundles.some((assignment) => assignment.id === item.id)} onChange={(event) => toggleCompanyAssignment(setCompanyBundles, item.id, event.target.checked)} />{item.name}</label>)}
            </div>
            <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Company tiers</h3><button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveCompanyAssignments("tiers")}>Save tiers</button></div>
              {marketplaceTiers.map((item) => <label className="flex items-center gap-2 text-sm" key={item.id}><input type="checkbox" checked={companyTiers.some((assignment) => assignment.id === item.id)} onChange={(event) => toggleCompanyAssignment(setCompanyTiers, item.id, event.target.checked)} />{item.name}</label>)}
            </div>
          </div>
        </div>}
      </section>
      <section className="onepos-card overflow-hidden"><table className="onepos-table"><thead><tr><th>Licence</th><th>Price</th><th>Terms</th><th>Status</th><th>Companies</th><th></th></tr></thead><tbody>{licences.map((licence) => <tr key={licence.id}><td className="font-medium">{licence.name}</td><td>{licence.monthly_price} / {String(licence.billing_period || "MONTHLY").toLowerCase()}</td><td>{licence.seat_limit ?? "Unlimited"} seats · {licence.user_limit ?? "Unlimited"} users{licence.is_trial ? " · trial" : ""}</td><td>{licence.active ? <span className="onepos-badge onepos-badge-success">Active</span> : <span className="onepos-badge onepos-badge-neutral">Inactive</span>}</td><td>{licence.company_count}</td><td><button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => editLicence(licence)}>Edit</button></td></tr>)}</tbody></table></section>
      <section className="onepos-card onepos-card-body space-y-4">
        <div>
          <h2 className="onepos-card-title">OneApps marketplace packages</h2>
          <p className="text-sm text-slate-600 mt-1">Control package availability and commercial treatment independently from installation state.</p>
        </div>
        {marketplacePackages.map((item) => (
          <div className="border-t border-slate-200 pt-4 space-y-3" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><strong>{item.name}</strong><span className="ml-2 text-sm text-slate-500">{item.package_key}</span></div>
              <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => savePackageSettings(item)}>Save package policy</button>
            </div>
            <div className="flex flex-wrap gap-4">
              {[
                ["active", "Active"], ["visible", "Visible"], ["installable", "Installable"],
                ["billable", "Billable"], ["featured", "Featured"], ["system_only", "Internal/system-only"],
              ].map(([field, label]) => (
                <label className="text-sm flex gap-2 items-center" key={field}>
                  <input type="checkbox" checked={item[field] === true} onChange={(event) => updateMarketplaceItem(setMarketplacePackages, item.id, field, event.target.checked)} />{label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">Category<input className="onepos-input mt-1 w-full" value={item.category || ""} onChange={(event) => updateMarketplaceItem(setMarketplacePackages, item.id, "category", event.target.value)} /></label>
              <label className="text-sm">Display order<input type="number" className="onepos-input mt-1 w-full" value={item.display_order ?? 0} onChange={(event) => updateMarketplaceItem(setMarketplacePackages, item.id, "display_order", event.target.value)} /></label>
              <label className="text-sm">Licence mode<select className="onepos-input mt-1 w-full" value={item.licence_mode || "COMMERCIAL"} onChange={(event) => updateMarketplaceItem(setMarketplacePackages, item.id, "licence_mode", event.target.value)}><option value="COMMERCIAL">Commercial</option><option value="TECHNICAL">Technical</option></select></label>
              {[
                ["allowed_bundles", "Allowed bundle keys"],
                ["available_tiers", "Allowed tier keys"],
                ["allowed_companies", "Allowed company IDs"],
              ].map(([field, label]) => (
                <label className="text-sm" key={field}>{label}
                  <input className="onepos-input mt-1 w-full" value={(item[field] || []).join(", ")} onChange={(event) => updateMarketplaceItem(setMarketplacePackages, item.id, field, csvList(event.target.value))} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="onepos-card onepos-card-body space-y-4">
        <div><h2 className="onepos-card-title">Bundle marketplace visibility</h2><p className="text-sm text-slate-600 mt-1">Bundle assignment and entitlement calculation continue through the shared reconciliation service.</p></div>
        {marketplaceBundles.map((item) => (
          <div className="border-t border-slate-200 pt-4 space-y-3" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong>{item.name} <span className="text-sm text-slate-500">{item.bundle_key}</span></strong>
              <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveBundleSettings(item)}>Save bundle policy</button>
            </div>
            <div className="flex flex-wrap gap-4">
              {["active", "visible", "installable"].map((field) => <label className="text-sm flex gap-2 items-center" key={field}><input type="checkbox" checked={item[field] === true} onChange={(event) => updateMarketplaceItem(setMarketplaceBundles, item.id, field, event.target.checked)} />{field}</label>)}
              <label className="text-sm">Display order<input type="number" className="onepos-input ml-2 w-24" value={item.display_order ?? 0} onChange={(event) => updateMarketplaceItem(setMarketplaceBundles, item.id, "display_order", event.target.value)} /></label>
            </div>
            <label className="text-sm block">Allowed company IDs<input className="onepos-input mt-1 w-full" value={(item.allowed_companies || []).join(", ")} onChange={(event) => updateMarketplaceItem(setMarketplaceBundles, item.id, "allowed_companies", csvList(event.target.value))} /></label>
            <label className="text-sm block">Allowed tier keys<input className="onepos-input mt-1 w-full" value={(item.available_tiers || []).join(", ")} onChange={(event) => updateMarketplaceItem(setMarketplaceBundles, item.id, "available_tiers", csvList(event.target.value))} /></label>
            <div className="space-y-2"><h3 className="font-medium">Bundle package composition</h3>{marketplacePackages.map((packageItem) => {
              const composed = (item.packages || []).find((entry) => entry.package_id === packageItem.id);
              return <div className="flex flex-wrap items-center gap-3 border-t pt-2" key={packageItem.id}>
                <label className="flex min-w-56 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(composed)} onChange={(event) => updateCompositionPackage(setMarketplaceBundles, item.id, packageItem, event.target.checked)} />{packageItem.name}</label>
                {composed && <select className="onepos-input" value={composed.entitlement_type || "COMMERCIAL"} onChange={(event) => updateCompositionType(setMarketplaceBundles, item.id, packageItem.id, event.target.value)}><option value="COMMERCIAL">Commercial</option><option value="REQUIRED_DEPENDENCY">Included dependency</option><option value="OPTIONAL">Optional</option></select>}
              </div>;
            })}</div>
            <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveComposition(`/api/superadmin/bundles/${item.id}/composition`, item, `${item.name} composition saved.`)}>Save bundle composition</button>
          </div>
        ))}
      </section>
      <section className="onepos-card onepos-card-body space-y-4">
        <div><h2 className="onepos-card-title">Tier marketplace visibility</h2><p className="text-sm text-slate-600 mt-1">Tier assignments reconcile package and feature entitlements using the same source-aware service.</p></div>
        {marketplaceTiers.map((item) => (
          <div className="border-t border-slate-200 pt-4 space-y-3" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <strong>{item.name} <span className="text-sm text-slate-500">{item.tier_key}</span></strong>
              <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveTierSettings(item)}>Save tier policy</button>
            </div>
            <div className="flex flex-wrap gap-4">
              {["active", "visible", "installable"].map((field) => <label className="text-sm flex gap-2 items-center" key={field}><input type="checkbox" checked={item[field] === true} onChange={(event) => updateMarketplaceItem(setMarketplaceTiers, item.id, field, event.target.checked)} />{field}</label>)}
              <label className="text-sm">Display order<input type="number" className="onepos-input ml-2 w-24" value={item.display_order ?? 0} onChange={(event) => updateMarketplaceItem(setMarketplaceTiers, item.id, "display_order", event.target.value)} /></label>
            </div>
            <label className="text-sm block">Allowed company IDs<input className="onepos-input mt-1 w-full" value={(item.allowed_companies || []).join(", ")} onChange={(event) => updateMarketplaceItem(setMarketplaceTiers, item.id, "allowed_companies", csvList(event.target.value))} /></label>
            <div className="space-y-2"><h3 className="font-medium">Tier package composition</h3>{marketplacePackages.map((packageItem) => {
              const composed = (item.packages || []).find((entry) => entry.package_id === packageItem.id);
              return <div className="flex flex-wrap items-center gap-3 border-t pt-2" key={packageItem.id}>
                <label className="flex min-w-56 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(composed)} onChange={(event) => updateCompositionPackage(setMarketplaceTiers, item.id, packageItem, event.target.checked)} />{packageItem.name}</label>
                {composed && <select className="onepos-input" value={composed.entitlement_type || "COMMERCIAL"} onChange={(event) => updateCompositionType(setMarketplaceTiers, item.id, packageItem.id, event.target.value)}><option value="COMMERCIAL">Commercial</option><option value="REQUIRED_DEPENDENCY">Included dependency</option><option value="OPTIONAL">Optional</option></select>}
              </div>;
            })}</div>
            <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => saveComposition(`/api/superadmin/tiers/${item.id}/composition`, item, `${item.name} composition saved.`)}>Save tier composition</button>
          </div>
        ))}
      </section>
      <section className="onepos-card onepos-card-body space-y-4">
        <div>
          <h2 className="onepos-card-title">Company database routing</h2>
          <p className="text-sm text-slate-600 mt-1">Platform Developer Superadmin only. Passwords are write-only and are never displayed after saving.</p>
        </div>
        {lockCompany
          ? <div className="onepos-input w-full">{companies.find((company) => company.id === databaseCompany)?.name || "Selected client"}</div>
          : <select className="onepos-input w-full" value={databaseCompany} onChange={(event) => loadDatabaseConfig(event.target.value)}>
              <option value="">Select company</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>}
        {databaseCompany && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {["ONEPOS_MANAGED", "CUSTOMER_MANAGED"].map((mode) => (
                <label key={mode} className="text-sm flex gap-2 items-center">
                  <input type="radio" name="databaseMode" checked={databaseForm.databaseMode === mode} onChange={() => setDatabaseForm((current) => ({ ...current, databaseMode: mode }))} />
                  {mode === "ONEPOS_MANAGED" ? "onePOS Managed" : "Customer Managed"}
                </label>
              ))}
            </div>
            {databaseForm.databaseMode === "CUSTOMER_MANAGED" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["host", "Host"], ["port", "Port"], ["database", "Database"], ["username", "Username"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm text-slate-700">{label}
                    <input className="onepos-input mt-1 w-full" value={databaseForm[key]} onChange={(event) => setDatabaseForm((current) => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
                <label className="text-sm text-slate-700">Password
                  <input type="password" autoComplete="new-password" className="onepos-input mt-1 w-full" value={databaseForm.password} onChange={(event) => setDatabaseForm((current) => ({ ...current, password: event.target.value }))} placeholder={databaseConfig?.credentialsConfigured ? "Configured — leave blank to keep" : ""} />
                </label>
                <label className="text-sm text-slate-700">SSL
                  <select className="onepos-input mt-1 w-full" value={databaseForm.sslMode} onChange={(event) => setDatabaseForm((current) => ({ ...current, sslMode: event.target.value }))}>
                    <option value="require">Require</option><option value="verify-full">Verify full</option><option value="disable">Disable</option>
                  </select>
                </label>
              </div>
            )}
            {databaseConfig && (
              <div className="text-sm text-slate-600">
                <span>Credentials: {databaseConfig.credentialsConfigured ? "Configured" : "Not configured"}</span>
                <span className="ml-4">Schema: {databaseConfig.schemaState || "Unknown"}</span>
                <span className="ml-4">Active: {databaseConfig.active ? "Yes" : "No"}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-4" data-testid="client-admin-provisioning">
              {databaseConfig?.initialAdminEmail ? (
                <div className="space-y-2">
                  <p role="status">Company Admin saved: <strong>{databaseConfig.initialAdminEmail}</strong></p>
                  <a className="onepos-btn onepos-btn-secondary" href={`/app/settings/users?companyId=${encodeURIComponent(databaseCompany)}`}>View in Users</a>
                </div>
              ) : <>
              <label className="text-sm text-slate-700" htmlFor="client-admin-email">Client Admin Email
                <input id="client-admin-email" type="email" autoComplete="email" className="onepos-input mt-1 w-full" value={clientAdminEmail} onChange={(event) => setClientAdminEmail(event.target.value)} placeholder="client-admin@example.com" />
              </label>
              <p className="text-xs text-slate-500 mt-1">Creates one Company Admin in the central identity database. Platform Superadmin access is never granted.</p>
              <button id="provision-client-admin" type="button" className="onepos-btn onepos-btn-secondary mt-3" onClick={provisionClientAdmin} disabled={databaseBusy || !clientAdminEmail.trim() || Boolean(databaseConfig?.initialAdminEmail)}>
                {databaseConfig?.initialAdminEmail ? "Initial Company Admin configured" : "Provision initial Company Admin"}
              </button>
              </>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="onepos-btn onepos-btn-primary" onClick={saveDatabaseConfig} disabled={databaseBusy}>{databaseBusy ? "Saving..." : "Save configuration"}</button>
              {databaseForm.databaseMode === "CUSTOMER_MANAGED" && <>
                <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => runDatabaseAction("test", () => "Connection successful.")} disabled={databaseBusy}>Test Connection</button>
                <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => runDatabaseAction("validate-schema", (data) => `Schema: ${data?.schemaState || "unknown"}.`)} disabled={databaseBusy}>Validate Schema</button>
                <button type="button" className="onepos-btn onepos-btn-secondary" onClick={() => runDatabaseAction("initialize", (data) => `Initialization result: ${data?.schemaState || "unknown"}.`)} disabled={databaseBusy}>Initialize Database</button>
                <button type="button" className="onepos-btn onepos-btn-primary" onClick={() => runDatabaseAction("activate", () => "Customer database activated.")} disabled={databaseBusy || databaseConfig?.schemaState !== "COMPATIBLE"}>Activate</button>
              </>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
