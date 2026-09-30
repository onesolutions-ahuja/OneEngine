import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FlaskConical, Save, ShieldCheck } from "lucide-react";
import { apiRequest, startGoogleLogin } from "../../services/api.js";

const EMPTY = {
  licensed: false,
  installed: false,
  configured: false,
  enabled: false,
  clientId: "",
  hasClientSecret: false,
  redirectUri: "",
  allowedDomain: "",
  allowPasswordLogin: true,
};

export default function GoogleConnectSettings() {
  const [form, setForm] = useState(EMPTY);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest("/api/google-connect/config");
      setForm({ ...EMPTY, ...(response?.data || {}) });
    } catch (err) {
      setError(err?.message || "Unable to load Google Connect settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy("save");
    setMessage("");
    setError("");
    try {
      const response = await apiRequest("/api/google-connect/config", {
        method: "PUT",
        body: JSON.stringify({
          enabled: form.enabled,
          clientId: form.clientId,
          ...(clientSecret ? { clientSecret } : {}),
          redirectUri: form.redirectUri,
          allowedDomain: form.allowedDomain,
          allowPasswordLogin: form.allowPasswordLogin,
        }),
      });
      setForm({ ...EMPTY, ...(response?.data || {}) });
      setClientSecret("");
      setMessage("Google Connect settings saved.");
    } catch (err) {
      setError(err?.message || "Unable to save Google Connect settings");
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setMessage("");
    setError("");
    try {
      const response = await apiRequest("/api/google-connect/test", { method: "POST" });
      setMessage(response?.data?.message || "Google Connect configuration is reachable.");
    } catch (err) {
      setError(err?.message || "Google Connect test failed");
    } finally {
      setBusy("");
    }
  };

  const testLogin = async () => {
    const email = window.prompt("Enter the onePOS user email to test Google SSO:");
    if (!email) return;
    try {
      await startGoogleLogin(email);
    } catch (err) {
      setError(err?.message || "Google SSO is not available");
    }
  };

  if (loading) return <div className="module-state">Loading Google Connect…</div>;

  return (
    <section className="settings-detail-page">
      <header className="settings-detail-header">
        <div>
          <h1>Google Connect</h1>
          <p>Licensed Google SSO for your onePOS company.</p>
        </div>
        <img src="/icons/apps/one-connect-google.svg" alt="" width="64" height="64" />
      </header>

      {!form.licensed || !form.installed ? (
        <div className="module-state">
          Google Connect licence is not available for this company. Install and license Google Connect from OneStore first.
        </div>
      ) : (
        <div className="settings-form-card">
          <div className="settings-status-row">
            <ShieldCheck size={18} />
            <strong>Licence active</strong>
            {form.configured ? <span>OAuth configured</span> : <span>OAuth setup required</span>}
          </div>

          {message ? <div className="login-success"><CheckCircle2 size={16} /> {message}</div> : null}
          {error ? <div className="login-error">{error}</div> : null}

          <label className="settings-field-row">
            <span>Enable Google SSO</span>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((v) => ({ ...v, enabled: e.target.checked }))} />
          </label>

          <label className="settings-field">
            <span>OAuth Client ID</span>
            <input value={form.clientId} onChange={(e) => setForm((v) => ({ ...v, clientId: e.target.value }))} placeholder="Google OAuth Client ID" />
          </label>

          <label className="settings-field">
            <span>OAuth Client Secret</span>
            <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" placeholder={form.hasClientSecret ? "Saved — enter only to replace" : "Google OAuth Client Secret"} />
          </label>

          <label className="settings-field">
            <span>Redirect URI</span>
            <input value={form.redirectUri} onChange={(e) => setForm((v) => ({ ...v, redirectUri: e.target.value }))} placeholder="https://your-host/api/auth/google/callback" />
          </label>

          <label className="settings-field">
            <span>Allowed Google domain (optional)</span>
            <input value={form.allowedDomain} onChange={(e) => setForm((v) => ({ ...v, allowedDomain: e.target.value }))} placeholder="company.com" />
          </label>

          <label className="settings-field-row">
            <span>Allow email/password login as fallback</span>
            <input type="checkbox" checked={form.allowPasswordLogin} onChange={(e) => setForm((v) => ({ ...v, allowPasswordLogin: e.target.checked }))} />
          </label>

          <div className="settings-actions">
            <button type="button" className="login-submit" onClick={save} disabled={Boolean(busy)}>
              <Save size={16} /> {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button type="button" className="lock-signout" onClick={test} disabled={Boolean(busy)}>
              <FlaskConical size={16} /> {busy === "test" ? "Testing…" : "Test Connection"}
            </button>
            <button type="button" className="lock-signout" onClick={testLogin} disabled={Boolean(busy) || !form.enabled}>
              <ExternalLink size={16} /> Test Google Login
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
