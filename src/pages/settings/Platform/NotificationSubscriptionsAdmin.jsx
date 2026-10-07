import { useEffect, useState } from "react";
import { Bell, Plus, RefreshCw } from "lucide-react";
import { apiRequest } from "../../../services/api.js";

const emptyForm = {
  eventType: "platform.object.record.created",
  objectId: "",
  recipientType: "ACTOR",
  recipientValue: "",
  titleTemplate: "Record created",
  messageTemplate: "{{record.name}} was created",
};

export default function NotificationSubscriptionsAdmin({ onMessage, onError }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [objects, setObjects] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [subscriptionResponse, objectResponse] = await Promise.all([
        apiRequest("/api/platform/notification-subscriptions"),
        apiRequest("/api/platform/objects"),
      ]);
      setSubscriptions(Array.isArray(subscriptionResponse?.data) ? subscriptionResponse.data : []);
      const availableObjects = objectResponse?.data?.objects || objectResponse?.data || [];
      setObjects(Array.isArray(availableObjects) ? availableObjects : []);
    } catch (error) {
      onError(error.message || "Unable to load notification subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      const recipientConfig = form.recipientType === "USER"
        ? { userId: form.recipientValue.trim() }
        : form.recipientType === "FIELD"
          ? { fieldApiName: form.recipientValue.trim() }
          : {};
      await apiRequest("/api/platform/notification-subscriptions", {
        method: "POST",
        body: JSON.stringify({
          eventType: form.eventType.trim(),
          objectId: form.objectId || null,
          recipientType: form.recipientType,
          recipientConfig,
          titleTemplate: form.titleTemplate.trim() || null,
          messageTemplate: form.messageTemplate.trim(),
        }),
      });
      setForm(emptyForm);
      onMessage("Notification subscription created.");
      await load();
    } catch (error) {
      onError(error.message || "Unable to create notification subscription");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (subscription, active) => {
    try {
      await apiRequest(`/api/platform/notification-subscriptions/${subscription.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      });
      setSubscriptions((current) => current.map((item) => item.id === subscription.id ? { ...item, active } : item));
    } catch (error) {
      onError(error.message || "Unable to update notification subscription");
    }
  };

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Notification Subscriptions</h2>
          <p className="mt-1 text-sm text-slate-500">Object event subscriptions and in-app delivery.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh subscriptions" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
          <RefreshCw size={15} aria-hidden="true" /> Refresh
        </button>
      </header>

      <form onSubmit={save} className="grid gap-4 border-y border-slate-200 py-5 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Event type
          <input className={inputClass} value={form.eventType} onChange={(event) => update("eventType", event.target.value)} required maxLength={200} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Object
          <select className={inputClass} value={form.objectId} onChange={(event) => update("objectId", event.target.value)}>
            <option value="">Any Object</option>
            {objects.map((object) => <option key={object.id} value={object.id}>{object.label || object.object_key}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Recipient
          <select className={inputClass} value={form.recipientType} onChange={(event) => update("recipientType", event.target.value)}>
            <option value="ACTOR">Event actor</option>
            <option value="USER">Company user ID</option>
            <option value="FIELD">User-reference field</option>
          </select>
        </label>
        {form.recipientType !== "ACTOR" && (
          <label className="space-y-1 text-sm font-medium text-slate-700">
            {form.recipientType === "USER" ? "Recipient user ID" : "Recipient field API name"}
            <input className={inputClass} value={form.recipientValue} onChange={(event) => update("recipientValue", event.target.value)} required />
          </label>
        )}
        <label className="space-y-1 text-sm font-medium text-slate-700">
          Title template
          <input className={inputClass} value={form.titleTemplate} onChange={(event) => update("titleTemplate", event.target.value)} maxLength={200} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
          Message template
          <textarea className={inputClass} rows={3} value={form.messageTemplate} onChange={(event) => update("messageTemplate", event.target.value)} required />
        </label>
        <div className="md:col-span-2">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            <Plus size={15} aria-hidden="true" /> Create subscription
          </button>
        </div>
      </form>

      <section aria-label="Configured notification subscriptions">
        {loading ? <p className="py-5 text-sm text-slate-500">Loading subscriptions…</p> : subscriptions.length === 0 ? (
          <div className="flex items-start gap-3 py-6 text-sm text-slate-500"><Bell size={18} aria-hidden="true" /><span><strong className="block text-slate-700">No notification subscriptions configured.</strong>Create one above to persist an event rule for this company; when a matching event occurs, the configured recipient receives the in-app notification.</span></div>
        ) : (
          <div className="divide-y divide-slate-200">
            {subscriptions.map((subscription) => (
              <article key={subscription.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-800">{subscription.title_template || subscription.event_type}</div>
                  <div className="mt-1 text-xs text-slate-500">{subscription.event_type} · {subscription.recipient_type} · {subscription.message_template}</div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={subscription.active === true} onChange={(event) => setActive(subscription, event.target.checked)} />
                  Enabled
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
