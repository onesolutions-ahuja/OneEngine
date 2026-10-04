import { GitBranch, Database, Plus, Zap } from 'lucide-react'

const BRANCH_MIN_WIDTH = 244
const BRANCH_GAP = 28

export function decisionPaths(node) {
  if (node.type === 'ACTION') {
    try {
      const inputs = node.config?.inputsText ? JSON.parse(node.config.inputsText) : node.config?.inputs || {}
      return inputs.faultBranch?.length ? [{ id: 'fault', label: 'Fault Recovery', steps: inputs.faultBranch }] : []
    } catch { return [] }
  }
  if (node.type !== 'DECISION') return []
  const config = node.config || {}
  return [...(config.outcomes || []).map(outcome => ({ id: outcome.id, label: outcome.label, steps: outcome.branch || [] })),
    { id: 'default', label: config.defaultOutcomeLabel || 'Default Outcome', steps: config.defaultBranch || [] }]
}

export default function Builder2AutoLayout({ nodes, selected, selectedMany = [], groups = [], collapsed = {}, onToggle, onCopy, onDelete, zoom, startConfig, onStart, onSelect, onAdd }) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const referenced = new Set(nodes.flatMap(node => decisionPaths(node).flatMap(path => path.steps)))
  const expanded = new Set()

  function nodeTreeWidth(id, ancestors = []) {
    const node = byId.get(id)
    if (!node || ancestors.includes(id)) return BRANCH_MIN_WIDTH
    if (node.groupId && groups.find(group => group.id === node.groupId)?.collapsed) return BRANCH_MIN_WIDTH
    const paths = decisionPaths(node)
    if (!paths.length || collapsed[id]) return BRANCH_MIN_WIDTH
    const widths = paths.map(path => pathTreeWidth(path, [...ancestors, id]))
    return Math.max(BRANCH_MIN_WIDTH, widths.reduce((sum, width) => sum + width, 0) + BRANCH_GAP * Math.max(0, widths.length - 1))
  }

  function pathTreeWidth(path, ancestors = []) {
    const widths = (path.steps || []).map(step => nodeTreeWidth(step, ancestors))
    return Math.max(BRANCH_MIN_WIDTH, ...widths)
  }

  const renderNode = (id, ancestors = []) => {
    const node = byId.get(id)
    if (!node) return <div key={id} className="b2-path-missing">Missing element: {id}</div>
    if (node.groupId && groups.find(group => group.id === node.groupId)?.collapsed) return null
    if (expanded.has(id) || ancestors.includes(id)) return <button key={id} className="b2-path-reference" onClick={() => onSelect(node)}>Go to {node.label}</button>
    expanded.add(id)
    const paths = decisionPaths(node)
    const pathWidths = paths.map(path => pathTreeWidth(path, [...ancestors, id]))
    const totalBranchWidth = Math.max(
      BRANCH_MIN_WIDTH,
      pathWidths.reduce((sum, width) => sum + width, 0) + BRANCH_GAP * Math.max(0, pathWidths.length - 1),
    )
    const branchStyle = paths.length ? {
      width: `${totalBranchWidth}px`,
      '--b2-first-half': `${(pathWidths[0] || BRANCH_MIN_WIDTH) / 2}px`,
      '--b2-last-half': `${(pathWidths[pathWidths.length - 1] || BRANCH_MIN_WIDTH) / 2}px`,
    } : undefined

    return <div key={id} className="b2-step-wrap">
      <button data-node-id={id} className={`b2-node ${node.type === 'DECISION' ? 'is-decision' : ''} ${selected === id || selectedMany.includes(id) ? 'is-selected' : ''}`} onClick={() => onSelect(node)}>
        <span className="b2-node-icon">{paths.length ? <GitBranch size={16}/> : node.type === 'ACTION' ? <Zap size={16}/> : <Database size={16}/>}</span>
        <span><b>{node.label}</b><small>{node.type.replaceAll('_', ' ')}</small></span>
      </button>
      <div className="b2-path-controls"><button type="button" aria-label={`Copy ${node.label}`} onClick={() => onCopy(id)}>Copy</button><button type="button" aria-label={`Delete ${node.label}`} onClick={() => onDelete(id)}>Delete</button>{paths.length ? <button type="button" onClick={() => onToggle(id)}>{collapsed[id] ? 'Expand Paths' : 'Collapse Paths'}</button> : null}</div>
      <div className={`b2-line ${paths.length ? 'b2-line-to-branches' : ''}`}/>
      {paths.length ? (collapsed[id] ? <div className="b2-collapsed-paths" role="group" aria-label={`${node.label} collapsed paths`}>
        {paths.map(path => <div key={path.id} className={`b2-collapsed-path ${path.id === 'default' ? 'is-default' : ''} ${path.id === 'fault' ? 'is-fault' : ''}`}>
          <strong>{path.label}</strong>
          <small>{path.steps.length ? `${path.steps.length} ${path.steps.length === 1 ? 'step' : 'steps'}` : 'End'}</small>
        </div>)}
      </div> : <div className="b2-decision-paths" style={branchStyle}>{paths.map((path, index) => <section key={path.id} className={`b2-decision-path ${path.id === 'default' ? 'is-default' : ''} ${path.id === 'fault' ? 'is-fault' : ''}`} style={{ width: `${pathWidths[index] || BRANCH_MIN_WIDTH}px` }}>
        <strong>{path.label}</strong><div className="b2-line"/>
        {path.steps.map(step => renderNode(step, [...ancestors, id]))}
        {path.id !== 'fault' ? <button className="b2-add" aria-label={`Add element to ${node.label}: ${path.label}`} onClick={() => onAdd({ nodeId: id, outcomeId: path.id })}><Plus size={14}/></button> : null}
        <small>{path.steps.length ? 'Path complete' : 'End'}</small>
      </section>)}</div>) : null}
    </div>
  }
  return <div className="b2-flow" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
    <button className="b2-start" onClick={onStart}><span>Start</span><small>{startConfig.objectKey ? `${startConfig.objectKey} · ${String(startConfig.trigger).replaceAll('_', ' ')}` : 'Configure Trigger'}</small></button>
    <div className="b2-line"/>
    {nodes.filter(node => !referenced.has(node.id)).map(node => renderNode(node.id))}
    <button className="b2-add" aria-label="Add element to main path" onClick={() => onAdd(null)}><Plus size={14}/></button><div className="b2-line"/><div className="b2-end">■ <span>End</span></div>
  </div>
}
