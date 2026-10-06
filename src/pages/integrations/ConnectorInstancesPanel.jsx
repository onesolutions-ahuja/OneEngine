import { useEffect, useState } from "react";
import { Check, PlugZap, RefreshCw } from "lucide-react";
import { ConnectorFieldHelp, ConnectorSettingsCompact, ConnectorSettingsFooter, ConnectorSettingsModeActions, ConnectorSettingsSplit } from "./ConnectorSettingsTemplates.jsx";
import { apiRequest } from "../../services/api.js";

const inputClass = "h-9 w-full border border-slate-300 rounded px-2 text-sm";

export default function ConnectorInstancesPanel({ packageKey: requestedPackageKey = "", settingsMode = false }) {
  const [apps, setApps] = useState([]);
  const [instances, setInstances] = useState([]);
  const [stores, setStores] = useState([]);
  const [packageKey, setPackageKey] = useState(() => requestedPackageKey);
  const [storeId, setStoreId] = useState("");
  const [tillId, setTillId] = useState("");
  const [fallbackOrder, setFallbackOrder] = useState("0");
  const [configuration, setConfiguration] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testActionValues, setTestActionValues] = useState({});
  const [runningTestAction, setRunningTestAction] = useState("");
  const [testActionResults, setTestActionResults] = useState({});
  const [settingsEditMode, setSettingsEditMode] = useState("view");
  const existingInstance = instances.find((instance) => instance.packageKey === packageKey) || null;

  const selectedApp = apps.find((app) => app.package_key === packageKey);
  const schema = selectedApp?.manifest?.connectorApp?.configurationSchema || [];
  const testActions = selectedApp?.manifest?.connectorApp?.testActions || [];
  const dedicatedName = selectedApp?.name || requestedPackageKey.replaceAll("_", " ");
  const selectedStore = stores.find((store) => store.id === storeId);
  const tills = Array.isArray(selectedStore?.tills) ? selectedStore.tills : [];
  const companyScoped = selectedApp?.manifest?.connectorApp?.scope === "company";
  const SettingsTemplate = settingsMode
    ? ConnectorSettingsCompact
    : selectedApp?.manifest?.connectorApp?.settingsUiVariant === "split"
      ? ConnectorSettingsSplit
      : ConnectorSettingsCompact;
  const visibleSchema = schema.filter((field) => !["action","readonly","store lookup","till lookup"].includes(field.type));
  const credentialFirstSchema = [...visibleSchema].sort((a, b) => {
    const credential = (field) => field.type === "secret" || /api|token|secret|password|credential|key/i.test(String(field.key || "") + " " + String(field.label || ""));
    return Number(credential(b)) - Number(credential(a));
  });

  const load = async ({ preserveFeedback = false } = {}) => {
    setLoading(true);
    if (!preserveFeedback) {
      setError("");
      setMessage("");
    }
    try {
      const [connectorAppsResult, marketplaceResult, installed, storeResult] = await Promise.all([
        apiRequest("/api/connector-apps").catch(() => ({ success: false, data: [] })),
        apiRequest("/api/packages/marketplace"),
        apiRequest("/api/connector-instances"),
        apiRequest("/api/admin/stores"),
      ]);
      const connectorApps = Array.isArray(connectorAppsResult?.data) ? connectorAppsResult.data : [];
      const marketplaceApps = Array.isArray(marketplaceResult?.data) ? marketplaceResult.data : [];
      const candidates = requestedPackageKey
        ? [...connectorApps, ...marketplaceApps].filter((app, index, all) =>
            app?.package_key === requestedPackageKey
            && all.findIndex((candidate) => candidate?.package_key === app?.package_key) === index
          )
        : connectorApps;
      const installedApps = candidates.filter((app) =>
        app.company_installation?.status === "active"
          && app.manifest?.connectorApp
          && (!requestedPackageKey || app.package_key === requestedPackageKey)
      );
      setApps(installedApps);
      setInstances((Array.isArray(installed?.data) ? installed.data : []).filter((instance) => !requestedPackageKey || instance.packageKey === requestedPackageKey));
      setStores(Array.isArray(storeResult?.data) ? storeResult.data : []);
      if (!installedApps.some((app) => app.package_key === packageKey)) {
        setPackageKey(installedApps[0]?.package_key || "");
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load connector configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const defaults = Object.fromEntries(schema
      .filter((field) => Object.hasOwn(field, "default"))
      .map((field) => [field.key, field.default]));
    const persisted = existingInstance?.configuration || {};
    setConfiguration({ ...defaults, ...persisted });
    if (existingInstance) {
      setFallbackOrder(String(existingInstance.fallbackOrder ?? 0));
      setStoreId(existingInstance.storeId || "");
      setTillId(existingInstance.tillId || "");
      if (settingsMode) setSettingsEditMode("view");
    } else if (settingsMode && packageKey) {
      setSettingsEditMode("add");
    }
  }, [packageKey, existingInstance?.id, settingsMode]);

  const createInstance = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const endpoint = existingInstance
        ? `/api/connector-instances/${existingInstance.id}`
        : "/api/connector-instances";
      await apiRequest(endpoint, {
        method: existingInstance ? "PUT" : "POST",
        body: JSON.stringify({
          ...(existingInstance ? {} : { packageKey }),
          storeId: companyScoped ? null : storeId,
          tillId: companyScoped ? null : tillId,
          fallbackOrder: Number(fallbackOrder),
          configuration,
        }),
      });
      setMessage(existingInstance
        ? "Connection settings saved. Re-test the connection before enabling if credentials changed."
        : "Connector instance assigned. Test it before enabling.");
      await load();
      if (settingsMode) setSettingsEditMode("view");
    } catch (saveError) {
      setError(saveError.message || "Unable to assign connector");
    } finally {
      setSaving(false);
    }
  };

  const testInstance = async (instance) => {
    setWorkingId(instance.id);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest(`/api/connector-instances/${instance.id}/test`, { method: "POST" });
      const test = result?.data || {};
      if (test.success) {
        setMessage(
          test.message
            || (test.testMode ? "TEST connector passed its configuration check." : "Connector connection verified. You can enable it now.")
        );
      } else {
        setError(test.message || test.code || "Connector test failed");
      }
      await load({ preserveFeedback: true });
    } catch (testError) {
      setError(testError.message || "Unable to test connector");
    } finally {
      setWorkingId("");
    }
  };

  const runPackageTestAction = async (instance, action) => {
    const defaults = Object.fromEntries(
      (action.fields || []).filter((field) => field.default !== undefined).map((field) => [field.key, field.default])
    );
    const values = { ...defaults, ...(testActionValues[action.key] || {}) };
    setRunningTestAction(action.key);
    setTestActionResults((current) => ({ ...current, [action.key]: null }));
    setError("");
    setMessage("");
    try {
      const endpoint = String(action.endpoint || "").replace("{instanceId}", instance.id);
      const result = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(values),
      });
      const providerId = result?.data?.providerMessageId;
      const successText = providerId
        ? `Sent successfully. Provider message ID: ${providerId}`
        : (result?.data?.message || "Sent successfully.");
      setTestActionResults((current) => ({ ...current, [action.key]: { success: true, message: successText } }));
      setMessage(successText);
    } catch (actionError) {
      const failureText = actionError.message || `Unable to run ${action.label || "test action"}`;
      setTestActionResults((current) => ({ ...current, [action.key]: { success: false, message: failureText } }));
      setError(failureText);
    } finally {
      setRunningTestAction("");
    }
  };

  const toggleInstance = async (instance) => {
    setWorkingId(instance.id);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/connector-instances/${instance.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !instance.enabled }),
      });
      setMessage(`Connector ${instance.enabled ? "disabled" : "enabled"}.`);
      await load();
    } catch (toggleError) {
      setError(toggleError.message || "Unable to update connector");
    } finally {
      setWorkingId("");
    }
  };

  const resetSettingsForm = () => {
    const defaults = Object.fromEntries(schema
      .filter((field) => Object.hasOwn(field, "default"))
      .map((field) => [field.key, field.default]));
    setConfiguration({ ...defaults, ...(existingInstance?.configuration || {}) });
    setFallbackOrder(String(existingInstance?.fallbackOrder ?? 0));
    setStoreId(existingInstance?.storeId || "");
    setTillId(existingInstance?.tillId || "");
    setSettingsEditMode(existingInstance ? "view" : "add");
    setError("");
    setMessage("");
  };

  const renderSettingsField = (field, disabled) => {
    const value = configuration[field.key] ?? field.default ?? "";
    const defaultHelp = field.type === "secret"
      ? `Enter the secure ${String(field.label || field.key).toLowerCase()} supplied by the provider.`
      : `Enter the ${String(field.label || field.key).toLowerCase()} used by this connector.`;
    const help = <ConnectorFieldHelp description={field.description || defaultHelp} helpUrl={field.helpUrl} helpLabel={field.helpLabel} />;
    return (
      <label key={field.key} className="connector-settings-field">
        <span className="connector-settings-field-label">{field.label || field.key}{field.required ? " *" : ""}</span>
        {field.enum ? (
          <select disabled={disabled} value={value} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: event.target.value }))}>
            {field.enum.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : field.type === "boolean" ? (
          <span className="connector-settings-checkbox-row">
            <input disabled={disabled} type="checkbox" checked={Boolean(value)} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: event.target.checked }))} />
            <span>{Boolean(value) ? "Enabled" : "Disabled"}</span>
          </span>
        ) : (
          <input
            disabled={disabled}
            type={field.type === "number" ? "number" : field.type === "secret" ? "password" : "text"}
            autoComplete={field.type === "secret" ? "new-password" : undefined}
            placeholder={field.type === "secret" && existingInstance?.credentialFields?.includes(field.key) ? "Saved securely — enter only to replace" : ""}
            value={value}
            onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))}
          />
        )}
        {field.type === "secret" && existingInstance?.credentialFields?.includes(field.key) ? <small className="connector-field-secure">Saved securely</small> : null}
        {help}
      </label>
    );
  };

  if (settingsMode) {
    const mode = existingInstance ? settingsEditMode : "add";
    const disabled = mode === "view";
    const statusLabel = existingInstance?.enabled
      ? "Connected"
      : existingInstance?.health?.success === true
        ? "Test passed"
        : existingInstance
          ? "Configured"
          : "Not configured";
    const statusTone = existingInstance?.enabled ? "is-success" : existingInstance?.health?.success === true ? "is-success" : "is-neutral";

    if (loading) return <p className="connector-settings-loading">Loading connector settings…</p>;

    if (!apps.length) {
      return <div className="module-state">{dedicatedName} is not currently available as an active installed app for this company.</div>;
    }

    return (
      <div className="connector-settings-standard-wrap">
        {error ? <p role="alert" className="connector-settings-feedback is-error">{error}</p> : null}
        {message ? <p role="status" className="connector-settings-feedback is-success">{message}</p> : null}
        <SettingsTemplate
          title={`${dedicatedName} Settings`}
          description="Configure credentials, assignment and connection behaviour."
          status={{ label: statusLabel, tone: statusTone }}
          actions={(
            <>
              {existingInstance ? (
                <button type="button" className="connector-settings-icon-button" onClick={() => testInstance(existingInstance)} disabled={workingId === existingInstance.id} title="Test connection">
                  <PlugZap size={14} /> Test
                </button>
              ) : null}
              <ConnectorSettingsModeActions
                mode={mode}
                saving={saving}
                onEdit={() => setSettingsEditMode("edit")}
                onCancel={resetSettingsForm}
              />
            </>
          )}
        >
          <form onSubmit={createInstance} className="connector-settings-template-form">
            <div className="connector-settings-fields-grid">
              {credentialFirstSchema.map((field) => renderSettingsField(field, disabled))}
              {!companyScoped ? (
                <>
                  <label className="connector-settings-field">
                    <span className="connector-settings-field-label">Store *</span>
                    <select disabled={disabled} required value={storeId} onChange={(event) => { setStoreId(event.target.value); setTillId(""); }}>
                      <option value="">Select store</option>
                      {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                    </select>
                    <ConnectorFieldHelp description="Choose the store this connector is assigned to." />
                  </label>
                  <label className="connector-settings-field">
                    <span className="connector-settings-field-label">Till / terminal *</span>
                    <select disabled={disabled} required value={tillId} onChange={(event) => setTillId(event.target.value)}>
                      <option value="">Select till</option>
                      {tills.map((till) => <option key={till.id} value={till.id}>{till.name || till.terminalNumber}</option>)}
                    </select>
                    <ConnectorFieldHelp description="Choose the till or terminal that will use this connector." />
                  </label>
                </>
              ) : null}
              <label className="connector-settings-field">
                <span className="connector-settings-field-label">Fallback order</span>
                <select disabled={disabled} value={fallbackOrder} onChange={(event) => setFallbackOrder(event.target.value)}>
                  <option value="0">Primary</option>
                  <option value="1">Backup 1</option>
                  <option value="2">Backup 2</option>
                </select>
                <ConnectorFieldHelp description="Controls provider priority when multiple connectors can perform the same action." />
              </label>
            </div>
            <ConnectorSettingsFooter
              mode={mode}
              saving={saving}
              onCancel={resetSettingsForm}
              submitLabel={existingInstance ? "Save changes" : companyScoped ? "Add connection" : "Assign connector"}
            />
          </form>
        </SettingsTemplate>

        {existingInstance && testActions.length ? (
          <div className="connector-settings-test-area w-full">
            {testActions
              .filter((action) => !action.requiresEnabled || existingInstance.enabled)
              .map((action) => {
                const values = testActionValues[action.key] || Object.fromEntries(
                  (action.fields || []).filter((field) => field.default !== undefined).map((field) => [field.key, field.default])
                );
                const missingRequired = (action.fields || []).some((field) => field.required && !String(values[field.key] ?? "").trim());
                return (
                  <div key={action.key} className="connector-sms-test-card connector-settings-test-card">
                    <div className="connector-settings-test-card-head">
                      <div>
                        <h3>{action.label || "Test action"}</h3>
                        <p>{action.description || "Run an end-to-end connector test."}</p>
                      </div>
                    </div>
                    <div className="connector-settings-test-grid">
                      {(action.fields || []).map((field) => (
                        <label key={field.key} className="connector-settings-test-field">
                          <span>{field.label || field.key}</span>
                          <input
                            type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text"}
                            maxLength={field.maxLength}
                            placeholder={field.placeholder || ""}
                            value={values[field.key] ?? ""}
                            onChange={(event) => setTestActionValues((current) => ({
                              ...current,
                              [action.key]: { ...values, [field.key]: event.target.value },
                            }))}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="connector-settings-test-actions">
                      {testActionResults[action.key] ? (
                        <p role={testActionResults[action.key].success ? "status" : "alert"} className={testActionResults[action.key].success ? "is-success" : "is-error"}>
                          {testActionResults[action.key].success ? "✓ " : "✕ "}{testActionResults[action.key].message}
                        </p>
                      ) : <span />}
                      <button type="button" onClick={() => runPackageTestAction(existingInstance, action)} disabled={runningTestAction === action.key || missingRequired}>
                        {runningTestAction === action.key ? "Running…" : action.label || "Run test"}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className={`mb-6 border border-slate-200 rounded-lg bg-white${settingsMode ? " connector-settings-panel" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{settingsMode ? `${dedicatedName} Settings` : "Hardware & Payment Connectors"}</h2>
          <p className="text-xs text-slate-500">{settingsMode ? "Configure this app, assign it to a store/till, and test its connection." : "Installed connector apps and till assignments"}</p>
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh connectors" className="h-9 w-9 grid place-items-center border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p role="alert" className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mx-4 mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      {loading ? <p className="px-4 py-5 text-sm text-slate-500">Loading connector apps…</p> : (
        <>
          {instances.length > 0 && (
            <div className="overflow-x-auto border-b border-slate-200">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2">Connector</th><th className="px-4 py-2">Store / till</th><th className="px-4 py-2">Order</th><th className="px-4 py-2">Health</th><th className="px-4 py-2 text-right">Actions</th>
                </tr></thead>
                <tbody>{instances.map((instance) => (
                  <tr key={instance.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{instance.name}</div>
                      <div className="text-xs text-slate-500">{instance.packageKey}{instance.health?.testMode ? " · TEST ONLY" : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{companyScoped ? "Company" : `${instance.storeName || "No store"} / ${instance.tillName || "No till"}`}</td>
                    <td className="px-4 py-2.5">{instance.fallbackOrder === 0 ? "Primary" : `Backup ${instance.fallbackOrder}`}</td>
                    <td className="px-4 py-2.5">
                      <span className={instance.health?.success === true ? "text-emerald-700" : "text-amber-700"}>
                        {instance.enabled
                          ? instance.status
                          : instance.health?.success === true
                            ? "TEST PASSED"
                            : instance.health?.code && instance.health?.code !== "NOT_TESTED"
                              ? "TEST FAILED"
                              : "NOT TESTED"}
                      </span>
                      {instance.health?.message && <div className="max-w-64 text-xs text-slate-500">{instance.health.message}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => testInstance(instance)} disabled={workingId === instance.id} title="Test connection" className="h-8 w-8 grid place-items-center border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"><PlugZap size={14} /></button>
                        <button
                          type="button"
                          onClick={() => toggleInstance(instance)}
                          disabled={workingId === instance.id || (!instance.enabled && instance.canEnable !== true)}
                          title={!instance.enabled && instance.canEnable !== true ? "Run a successful connection test before enabling" : undefined}
                          className="h-8 px-2 border border-slate-300 rounded text-xs hover:bg-slate-50 disabled:opacity-50"
                        >
                          {instance.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {existingInstance && testActions.length ? (
            <div className="connector-test-actions">
              {testActions
                .filter((action) => !action.requiresEnabled || existingInstance.enabled)
                .map((action) => {
                  const values = testActionValues[action.key] || Object.fromEntries(
                    (action.fields || []).filter((field) => field.default !== undefined).map((field) => [field.key, field.default])
                  );
                  const missingRequired = (action.fields || []).some((field) => field.required && !String(values[field.key] ?? "").trim());
                  return (
                    <div key={action.key} className="connector-sms-test-card rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-slate-900">{action.label || "Test action"}</h3>
                        <p className="text-xs text-slate-500">{action.description || "Run an end-to-end connector test."}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {(action.fields || []).map((field) => (
                          <label key={field.key} className="text-xs font-medium text-slate-600">
                            {field.label || field.key}
                            <input
                              type={field.type === "tel" ? "tel" : field.type === "email" ? "email" : "text"}
                              maxLength={field.maxLength}
                              placeholder={field.placeholder || ""}
                              value={values[field.key] ?? ""}
                              onChange={(event) => setTestActionValues((current) => ({
                                ...current,
                                [action.key]: { ...values, [field.key]: event.target.value },
                              }))}
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => runPackageTestAction(existingInstance, action)}
                          disabled={runningTestAction === action.key || missingRequired}
                          className="h-9 px-4 rounded bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
                        >
                          {runningTestAction === action.key ? "Running…" : action.label || "Run test"}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : null}

          {apps.length ? (
            <form onSubmit={createInstance} className={`grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-5${settingsMode ? " connector-settings-form" : ""}`}>
              {!requestedPackageKey ? <label className="text-xs font-medium text-slate-600">Installed app
                <select required value={packageKey} onChange={(event) => setPackageKey(event.target.value)} className={`${inputClass} mt-1`}>
                  {apps.map((app) => <option key={app.package_key} value={app.package_key}>{app.name}</option>)}
                </select>
              </label> : null}
              {!companyScoped ? <>
                <label className="text-xs font-medium text-slate-600">Store
                  <select required value={storeId} onChange={(event) => { setStoreId(event.target.value); setTillId(""); }} className={`${inputClass} mt-1`}>
                    <option value="">Select store</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">Till / terminal
                  <select required value={tillId} onChange={(event) => setTillId(event.target.value)} className={`${inputClass} mt-1`}>
                    <option value="">Select till</option>
                    {tills.map((till) => <option key={till.id} value={till.id}>{till.name || till.terminalNumber}</option>)}
                  </select>
                </label>
              </> : null}
              <label className="text-xs font-medium text-slate-600">Fallback order
                <select value={fallbackOrder} onChange={(event) => setFallbackOrder(event.target.value)} className={`${inputClass} mt-1`}>
                  <option value="0">Primary</option><option value="1">Backup 1</option><option value="2">Backup 2</option>
                </select>
              </label>
              <div className="flex items-end"><button type="submit" disabled={saving || !packageKey || (!companyScoped && (!storeId || !tillId))} className="h-9 px-3 inline-flex items-center gap-2 rounded bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"><Check size={15} />{saving ? "Saving…" : existingInstance ? "Update connection" : companyScoped ? "Save connection" : "Assign connector"}</button></div>
              {schema.filter((field) => !["action","readonly","store lookup","till lookup"].includes(field.type)).map((field) => (
                <label key={field.key} className="text-xs font-medium text-slate-600">{field.label || field.key}
                  {field.enum ? (
                    <select value={configuration[field.key] ?? field.default ?? ""} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: event.target.value }))} className={`${inputClass} mt-1`}>
                      {field.enum.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  ) : field.type === "boolean" ? (
                    <input type="checkbox" checked={Boolean(configuration[field.key] ?? field.default ?? false)} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: event.target.checked }))} className="mt-3 h-4 w-4" />
                  ) : (
                    <div>
                      <input
                        type={field.type === "number" ? "number" : field.type === "secret" ? "password" : "text"}
                        autoComplete={field.type === "secret" ? "new-password" : undefined}
                        placeholder={field.type === "secret" && existingInstance?.credentialFields?.includes(field.key) ? "Saved securely — enter only to replace" : ""}
                        value={configuration[field.key] ?? field.default ?? ""}
                        onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))}
                        className={`${inputClass} mt-1`}
                      />
                      {field.type === "secret" && existingInstance?.credentialFields?.includes(field.key) ? (
                        <span className="mt-1 block text-[10px] text-emerald-700">Saved securely</span>
                      ) : null}
                    </div>
                  )}
                </label>
              ))}
            </form>
          ) : (
            <div className="px-4 py-5 text-sm text-slate-600">
              {settingsMode
                ? `${dedicatedName} is not currently available as an active installed app for this company.`
                : <>No connector apps are installed. <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("onepos:open-store"))}>Open oneStore</button> to install an app.</>}
            </div>
          )}
        </>
      )}
    </section>
  );
}