import { useEffect, useState } from "react";
import { apiRequest, loadSessionPermissions } from "../../services/api.js";
import CustomPageRenderer from "../../components/platform/CustomPageRenderer.jsx";
import FormLayoutModal from "../../components/platform/FormLayoutModal.jsx";
import { executePageInteraction } from "../../actions/metadata/executePageInteraction.js";
import { normalizeCustomPageTree } from "../settings/Platform/customPageTree.js";
import { buildNavigationContext, resolveNavigationTarget } from "../../utils/navigationTargets.js";

function navigateToRoute(route) {
  window.history.pushState(null, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function CustomPageRuntimePage({ pageKey }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formAction, setFormAction] = useState(null);
  const [navigationContext, setNavigationContext] = useState(null);

  useEffect(() => {
    let live = true;
    setError("");
    Promise.all([
      apiRequest(`/api/platform/runtime/pages/${encodeURIComponent(pageKey || "")}`),
      loadSessionPermissions().catch(() => null),
      apiRequest("/api/platform/runtime/navigation-targets").catch(() => null),
    ])
      .then(([pageResponse, permissionState, targetResponse]) => {
        if (!live) return;
        if (!pageResponse?.success) throw new Error(pageResponse?.message || "Page not found");
        setPage(pageResponse.data);
        setNavigationContext(buildNavigationContext({
          permissionState,
          objectPages: targetResponse?.success ? targetResponse.data?.objectPages || [] : [],
          customPages: targetResponse?.success ? targetResponse.data?.customPages || [] : [],
        }));
      })
      .catch((err) => {
        if (live) setError(err?.message || "Unable to load page");
      });
    return () => { live = false; };
  }, [pageKey]);

  const execute = ({ node, record = null }) => executePageInteraction({
    node,
    record,
    navigationContext,
    resolveNavigationTarget,
    navigate: navigateToRoute,
    openForm: setFormAction,
    request: apiRequest,
    onError: setError,
    onBusyChange: setBusy,
  });

  if (error && !page) return <div className="onepos-empty">{error}</div>;
  if (!page) return <div className="onepos-empty">Loading page…</div>;

  const definition = normalizeCustomPageTree(page.definition || {});

  return (
    <section className="onepos-page space-y-4">
      <div className="onepos-page-header">
        <div>
          <h1 className="onepos-page-title">{page.label || page.page_key}</h1>
          {page.description ? <p className="onepos-page-subtitle">{page.description}</p> : null}
        </div>
      </div>
      {error ? <div className="onepos-alert onepos-alert-error">{error}</div> : null}
      {busy ? <div className="text-xs opacity-70">Running action…</div> : null}
      <CustomPageRenderer
        definition={definition}
        device="desktop"
        onRecordClick={({ record, node }) => execute({ record, node })}
        onButtonClick={(node) => execute({ node })}
      />
      {formAction ? (
        <FormLayoutModal
          action={formAction}
          onClose={() => setFormAction(null)}
          onSaved={() => {}}
        />
      ) : null}
    </section>
  );
}
