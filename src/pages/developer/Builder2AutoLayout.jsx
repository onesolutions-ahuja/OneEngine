import { ChevronDown, ChevronRight, Copy, Database, GitBranch, Plus, Trash2, Zap } from 'lucide-react'

export function decisionPaths(node) {
  const config=node.config||{}
  if(node.type==='DECISION')return [...(config.outcomes||[]).map(outcome=>({id:outcome.id,label:outcome.label,steps:outcome.branch||[]})),{id:'default',label:config.defaultOutcomeLabel||'Default Outcome',steps:config.defaultBranch||[]}]
  if(node.type==='LOOP')return [{id:'body',label:'Loop Body',steps:config.bodyBranch||[]}]
  if(node.type==='ACTION'&&config.faultBranch?.length)return [{id:'fault',label:'Fault Recovery',steps:config.faultBranch}]
  return []
}

export default function Builder2AutoLayout({ nodes, selected, selectedMany = [], groups = [], collapsed = {}, onToggle, onCopy, onDelete, zoom, startConfig, onStart, onSelect, onAdd }) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const referenced = new Set(nodes.flatMap(node => decisionPaths(node).flatMap(path => path.steps)))
  const expanded = new Set()
  const renderNode = (id, ancestors = []) => {
    const node = byId.get(id)
    if (!node) return <div key={id} className="b2-path-missing">Missing element: {id}</div>
    const group=node.groupId?groups.find(item=>item.id===node.groupId):null
    const isFirstInGroup=group?nodes.find(item=>item.groupId===group.id)?.id===id:false
    const groupHeader=group&&isFirstInGroup?<div className="b2-group-header"><button type="button" onClick={()=>onToggle(group.id)}><span>{group.collapsed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</span><span><b>{group.name}</b><small>{group.description||'Element group'}</small></span><small>{nodes.filter(item=>item.groupId===group.id).length}</small></button></div>:null
    if (group?.collapsed) return groupHeader
    if (expanded.has(id) || ancestors.includes(id)) return <button key={id} className="b2-path-reference" onClick={() => onSelect(node)}>Go to {node.label}</button>
    expanded.add(id)
    const paths = decisionPaths(node)
    return <div key={id} className="b2-step-wrap">{groupHeader}
      <button data-node-id={id} className={`b2-node ${selected === id || selectedMany.includes(id) ? 'is-selected' : ''}`} onClick={() => onSelect(node)}>
        <span className="b2-node-icon">{paths.length ? <GitBranch size={16}/> : node.type === 'ACTION' ? <Zap size={16}/> : <Database size={16}/>}</span>
        <span title={node.type.replaceAll('_',' ')+' · '+node.apiName}><b>{node.label}</b><span className="b2-node-meta">ⓘ</span></span>
      </button>
      <div className="b2-path-controls"><button type="button" title="Copy" aria-label={`Copy ${node.label}`} onClick={() => onCopy(id)}><Copy size={12}/></button><button type="button" title="Delete" aria-label={`Delete ${node.label}`} onClick={() => onDelete(id)}><Trash2 size={12}/></button>{paths.length ? <button type="button" title={collapsed[id]?'Expand Paths':'Collapse Paths'} aria-label={collapsed[id]?'Expand Paths':'Collapse Paths'} onClick={() => onToggle(id)}>{collapsed[id]?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button> : null}</div>
      <div className="b2-line"/>
      {paths.length && !collapsed[id] ? <div className="b2-decision-paths">{paths.map(path => <section key={path.id} className="b2-decision-path">
        <strong>{path.label}</strong><div className="b2-line"/>
        {path.steps.map(step => renderNode(step, [...ancestors, id]))}
        {path.id!=='fault'?<button className="b2-add" aria-label={`Add element to ${node.label}: ${path.label}`} onClick={() => onAdd({ nodeId: id, outcomeId: path.id })}><Plus size={14}/></button>:null}
        <small>{path.steps.length ? 'Path complete' : 'End'}</small>
      </section>)}</div> : null}
    </div>
  }
  return <div className="b2-flow" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
    <button className="b2-start" onClick={onStart}><span>Start</span><small>{startConfig.objectKey ? `${startConfig.objectKey} · ${String(startConfig.trigger).replaceAll('_', ' ')}` : 'Configure Trigger'}</small></button>
    <div className="b2-line"/>
    {nodes.filter(node => !referenced.has(node.id)).map(node => renderNode(node.id))}
    <button className="b2-add" aria-label="Add element to main path" onClick={() => onAdd(null)}><Plus size={14}/></button><div className="b2-line"/><div className="b2-end" title="End"><span aria-hidden="true">■</span><b className="sr-only">End</b></div>
  </div>
}
