import { useEffect, useState } from "react";
export default function KanbanV1({ node, data = {}, builderMode = false, onRecordClick, onInteraction }) {
  const config = node?.config || {}, field = config.groupField || "status";
  const [rows, setRows] = useState(data.records || []), [error, setError] = useState("");
  useEffect(() => setRows(data.records || []), [data.records]);
  const groups = new Map();
  for (const record of rows) { const group = String(record[field] || "Unassigned"); groups.set(group, [...(groups.get(group) || []), record]); }
  if (!groups.size) ["Backlog", "In progress", "Done"].forEach((group) => groups.set(group, []));
  const order = config.columnOrder?.length ? [...config.columnOrder.filter((group) => groups.has(group)), ...[...groups.keys()].filter((group) => !config.columnOrder.includes(group))] : [...groups.keys()];
  const move = async (recordId, destination) => {
    if (builderMode || config.allowDragDrop === false) return;
    const record = rows.find((item) => String(item.id) === String(recordId));
    const interaction = config.moveInteraction || node.interaction;
    if (!record || !interaction || interaction.type === "none") { setError("Configure a metadata action or Flow for card movement."); return; }
    try { await onInteraction?.(interaction, { record, recordId: record.id, destination, field, value: destination }); setRows((current) => current.map((item) => item.id === record.id ? { ...item, [field]: destination } : item)); setError(""); }
    catch (err) { setError(err?.message || "Unable to move record."); }
  };
  return <div className="space-y-2">{error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}<div className="flex gap-3 overflow-x-auto">{order.map((group) => <section key={group} onDragOver={(event) => { if (!builderMode && config.allowDragDrop !== false) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); move(event.dataTransfer.getData("text/plain"), group); }} className="w-64 shrink-0 rounded-lg border p-2"><h4 className="mb-2 flex justify-between text-xs font-semibold"><span>{group}</span><span>{groups.get(group).length}</span></h4>{groups.get(group).map((record, index) => <button type="button" key={record.id || index} draggable={!builderMode && config.allowDragDrop !== false} onDragStart={(event) => event.dataTransfer.setData("text/plain", String(record.id))} onClick={() => !builderMode && onRecordClick?.({ record, node })} className="mb-2 block w-full rounded-md border bg-white p-2 text-left text-sm"><span className="block font-medium">{record[config.titleField || "name"] || "Untitled"}</span></button>)}</section>)}</div></div>;
}