export default function TimelineV1({ node, data = {}, builderMode = false, onRecordClick }) {
  const config = node?.config || {};
  const rows = [...(data.records || [])].sort((a, b) => new Date(a[config.dateField || "created_at"] || 0) - new Date(b[config.dateField || "created_at"] || 0));
  if (config.sort === "desc") rows.reverse();
  const shown = data.placeholder ? [{ name: "Timeline entry", created_at: "Date" }] : rows;
  return <div className="space-y-2">{shown.map((record, index) => <button type="button" key={record.id || index} disabled={builderMode} onClick={() => !builderMode && onRecordClick?.({ record, node })} className="flex w-full gap-3 rounded-lg border bg-white p-3 text-left"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-400"/><span><span className="block text-xs">{String(record[config.dateField || "created_at"] ?? "")}</span><span className="block text-sm font-medium">{record[config.titleField || "name"] || "Untitled"}</span></span></button>)}</div>;
}