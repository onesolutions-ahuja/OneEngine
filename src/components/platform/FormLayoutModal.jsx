import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api.js";
import FormRenderer from "../../pages/settings/Platform/FormRenderer.jsx";

export default function FormLayoutModal({ action, onClose, onSaved }) {
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState("");
  const record = action?.record || null;
  const recordId = record?.id || record?.record_id || null;

  useEffect(() => {
    let live = true;
    apiRequest(`/api/platform/runtime/layouts/${encodeURIComponent(action.layoutId)}`)
      .then((response) => {
        if (!live) return;
        if (!response?.success) throw new Error(response?.message || "Unable to load form layout");
        setRuntime(response.data);
      })
      .catch((err) => {
        if (live) setError(err?.message || "Unable to load form layout");
      });
    return () => { live = false; };
  }, [action.layoutId]);

  const save = async (values) => {
    const objectKey = runtime?.object?.objectKey;
    if (!objectKey) throw new Error("Form object is unavailable");
    const editing = Boolean(recordId);
    const response = await apiRequest(
      `/api/platform/objects/${encodeURIComponent(objectKey)}/records${editing ? `/${encodeURIComponent(recordId)}` : ""}`,
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ data: values }),
      },
    );
    if (response?.success === false) {
      throw Object.assign(new Error(response?.message || "Unable to save record"), { payload: response });
    }
    onSaved?.(response?.data || response?.record || null);
    onClose?.();
  };

  const presentation = action?.presentation || "screen_modal";
  const shell = presentation === "full_screen"
    ? "fixed inset-0 z-[80] bg-white overflow-auto p-6"
    : presentation === "compact_popup"
      ? "fixed right-6 bottom-6 z-[80] w-[min(520px,calc(100vw-48px))] max-h-[75vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
      : "fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4";
  const panel = presentation === "screen_modal"
    ? "w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
    : "";

  return (
    <div className={shell} role="dialog" aria-modal="true">
      <div className={panel}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{runtime?.layout?.name || "Form"}</h2>
          <button type="button" className="onepos-btn onepos-btn-secondary" onClick={onClose}>Close</button>
        </div>
        {error ? <div className="onepos-alert onepos-alert-error">{error}</div> : null}
        {!runtime && !error ? <div className="onepos-empty">Loading form…</div> : null}
        {runtime ? (
          <FormRenderer
            definition={runtime.layout?.definition || {}}
            fields={runtime.fields || []}
            initialValues={record || {}}
            mode={recordId ? "edit" : "create"}
            onSubmit={save}
            embedded
          />
        ) : null}
      </div>
    </div>
  );
}
