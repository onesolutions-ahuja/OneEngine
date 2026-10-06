import WorkspacePage from "../workspace/WorkspacePage.jsx";
import CustomPageRuntimePage from "./CustomPageRuntimePage.jsx";

/*
 * ONE metadata Page Runtime boundary.
 *
 * App/routing code never chooses a business page implementation. It supplies
 * only stable metadata identity (objectKey or pageKey); this boundary resolves
 * the appropriate generic metadata renderer. Object pages keep the mature
 * record/list runtime while custom composition pages use the shared Component
 * Registry renderer. Both consume platform metadata and neither contains
 * domain-specific identifiers.
 *
 * Phase 7 intentionally centralises the runtime boundary before the internal
 * object-record surface is decomposed into registry components. That migration
 * can now happen behind this file without changing routes or creating another
 * page runtime.
 */
export default function MetadataPageRuntime({
  pageKey = "",
  objectKey = "",
  recordId = "",
  appKey = "",
  onNavigate = null,
  onRouteChange = null,
}) {
  if (pageKey) return <CustomPageRuntimePage pageKey={pageKey} />;
  if (objectKey) {
    return (
      <WorkspacePage
        initialObjectKey={objectKey}
        initialRecordId={recordId}
        appKey={appKey}
        onNavigate={onNavigate}
        onRouteChange={onRouteChange}
      />
    );
  }
  return <div className="onepos-empty">Page metadata is unavailable.</div>;
}
