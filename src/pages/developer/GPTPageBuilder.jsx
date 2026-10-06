import PageBuilder from "../settings/Platform/PageBuilder.jsx";

/*
 * GPT Page Builder intentionally uses the same metadata editor as the platform
 * Page Builder. Page composition is spatial/layout metadata, not a workflow
 * graph, so React Flow nodes/edges must never become a second page-definition
 * format.
 */
export default function GPTPageBuilder(props) {
  return <PageBuilder {...props} />;
}
