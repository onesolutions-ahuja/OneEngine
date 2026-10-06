export default function HierarchyViewerV1({ node, data = {}, builderMode = false, onRecordClick }) {
  const config=node?.config||{}, rows=data.records||[], parentField=config.parentField||"parent_id", byParent=new Map();
  for(const record of rows){const parent=record[parentField]==null?"__root__":String(record[parentField]);byParent.set(parent,[...(byParent.get(parent)||[]),record]);}
  const render=(record,depth=0)=><div key={record.id} style={{marginLeft:depth*16}}><button type="button" disabled={builderMode} onClick={()=>!builderMode&&onRecordClick?.({record,node})} className="w-full rounded-md border bg-white px-3 py-2 text-left text-sm">{record[config.titleField||"name"]||"Untitled"}</button>{depth<(config.maxDepth||3)?(byParent.get(String(record.id))||[]).map((child)=>render(child,depth+1)):null}</div>;
  const roots=rows.filter((record)=>record[parentField]==null||!rows.some((candidate)=>String(candidate.id)===String(record[parentField])));
  return <div className="space-y-1">{roots.map((record)=>render(record))}</div>;
}