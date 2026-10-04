import { GitBranch, Database, Plus, Zap } from 'lucide-react'

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
    if (node.groupId && groups.find(group => group.id === node.groupId)?.collapsed) return null
    if (expanded.has(id) || ancestors.includes(id)) return <button key={id} className="b2-path-reference" onClick={() => onSelect(node)}>Go to {node.label}</button>
    expanded.add(id)
    const paths = decisionPaths(node)
    return <div key={id} className="b2-step-wrap">
      <button data-node-id={id} className={`b2-node ${selected === id || selectedMany.includes(id) ? 'is-selected' : ''}`} onClick={() => onSelect(node)}>
        <span className="b2-node-icon">{paths.length ? <GitBranch size={16}/> : node.type === 'ACTION' ? <Zap size={16}/> : <Database size={16}/>}</span>
        <span title={node.type.replaceAll('_',' ')+' · '+node.apiName}><b>{node.label}</b><span className="b2-node-meta">ⓘ</span></span>
      </button>
      <div className="b2-path-controls"><button type="button" aria-label={`Copy ${node.label}`} onClick={() => onCopy(id)}>Copy</button><button type="button" aria-label={`Delete ${node.label}`} onClick={() => onDelete(id)}>Delete</button>{paths.length ? <button type="button" onClick={() => onToggle(id)}>{collapsed[id] ? 'Expand Paths' : 'Collapse Paths'}</button> : null}</div>
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
