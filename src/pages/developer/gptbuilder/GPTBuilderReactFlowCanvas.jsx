import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Controls,
  Handle,
  MarkerType,
  Position,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, ChevronRight, Minus, Plus, Sparkles, WandSparkles, Zap } from 'lucide-react'
import { elementByKey } from './GPTBuilderElements'
import './GPTBuilderReactFlowCanvas.css'

const CHILD_COLORS = [
  { key: 'red', hex: '#dc2626' },
  { key: 'green', hex: '#16a34a' },
  { key: 'orange', hex: '#f97316' },
  { key: 'blue', hex: '#2563eb' },
  { key: 'yellow', hex: '#ca8a04' },
  { key: 'cyan', hex: '#0891b2' },
  { key: 'magenta', hex: '#c026d3' },
]

function seededColorOrder(seed) {
  const values = [...CHILD_COLORS]
  let hash = 0
  for (let i = 0; i < String(seed).length; i += 1) hash = ((hash << 5) - hash + String(seed).charCodeAt(i)) | 0
  for (let i = values.length - 1; i > 0; i -= 1) {
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    const j = Math.abs(hash) % (i + 1)
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values
}

function toneFor(element) {
  const category = elementByKey(element?.key)?.category
  if (element?.key === 'decision') return 'amber'
  if (category === 'data') return 'blue'
  if (category === 'logic') return 'purple'
  if (category === 'interaction') return 'green'
  return 'gray'
}

function labelFor(element) {
  return element?.label || element?.apiName || elementByKey(element?.key)?.label || 'Flow element'
}

function subtitleFor(element) {
  const label = elementByKey(element?.key)?.label || element?.key || 'Element'
  return element?.configured ? label : `${label} · Not fully configured`
}

function BuilderNode({ id, data, selected }) {
  const definition = data.kind === 'start' ? null : elementByKey(data.element?.key)
  const Icon = data.kind === 'start' ? Zap : (definition?.icon || Sparkles)
  const removable = data.kind !== 'start' && data.kind !== 'end'
  const elementId = data.kind === 'start' ? 'start' : data.element?.id

  return (
    <div
      className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''} ${data.kind === 'group' ? 'gptb-rf-group-node' : ''}`}
      data-gptb-auto-focus="true"
      data-gptb-element-id={elementId}
      data-gptb-description={data.description || data.subtitle || ''}
      tabIndex={-1}
    >
      {data.kind !== 'start' ? <Handle type="target" position={Position.Top} className="rfux-handle" /> : null}
      <div className={`rfux-node-icon ${data.element?.key === 'decision' ? 'rfux-node-icon--decision' : ''}`}><Icon size={16}/></div>
      <div className="rfux-node-copy" onDoubleClick={() => data.onOpen?.(data.element)}>
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>
      {data.kind === 'group' ? <button
        type="button"
        className="gptb-rf-group-toggle nodrag"
        aria-label={data.groupCollapsed ? `Expand ${data.title}` : `Collapse ${data.title}`}
        title={data.groupCollapsed ? 'Expand group' : 'Collapse group'}
        onClick={(event) => { event.stopPropagation(); data.onToggleGroup?.() }}
      >{data.groupCollapsed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button> : null}
      {removable ? <button type="button" className="rfux-node-remove nodrag" aria-label={`Remove ${data.title}`} title="Remove" onClick={(event) => { event.stopPropagation(); data.onRemove?.(data.element?.id || id) }}><Minus size={14}/></button> : null}
      {data.kind !== 'end' ? <button type="button" className="rfux-node-add nodrag" aria-label={`Add after ${data.title}`} title="Add element" onClick={(event) => { event.stopPropagation(); data.onAdd?.() }}><Plus size={14}/></button> : null}
      {data.kind !== 'end' ? <Handle type="source" position={Position.Bottom} className="rfux-handle" /> : null}
    </div>
  )
}

const nodeTypes = { workflow: BuilderNode }

function buildGraph({
  elements,
  startLabel,
  collapsedGroups,
  onOpen,
  onRemove,
  onAddAt,
  onAddDecisionBranch,
  onAddGroupMember,
  onToggleGroup,
}) {
  const auto = elements.filter((element) => element.source === 'auto')
  const groupMemberIds = auto.filter((element) => element.key === 'group').flatMap((group) => Array.isArray(group.config?.memberIds) ? group.config.memberIds : [])
  const decisionMemberIds = auto.filter((element) => element.key === 'decision').flatMap((decision) => [
    ...(decision.config?.outcomes || []).flatMap((outcome) => Array.isArray(outcome.branch) ? outcome.branch : []),
    ...(Array.isArray(decision.config?.defaultBranch) ? decision.config.defaultBranch : []),
  ])
  const nested = new Set([...groupMemberIds, ...decisionMemberIds].map(String))
  const top = auto.filter((element) => !nested.has(String(element.id)))
  const byId = new Map(auto.map((item) => [String(item.id), item]))
  const nodes = [{
    id: '__start__',
    type: 'workflow',
    position: { x: 420, y: 50 },
    data: {
      kind: 'start',
      title: 'Start',
      subtitle: startLabel || 'Trigger',
      description: 'The Start element defines when and how the flow begins.',
      tone: 'blue',
      onAdd: () => onAddAt(0),
    },
  }]
  const edges = []
  const MAIN_X = 420
  const ROW = 165
  const BRANCH_X = 300
  let y = 215
  let terminals = [{ id: '__start__', key: 'start', label: '' }]

  const edge = (id, source, target, label = '') => ({
    id,
    source,
    target,
    type: 'smoothstep',
    label,
    markerEnd: { type: MarkerType.ArrowClosed },
  })

  const connectTerminals = (targetId) => {
    terminals.forEach((terminal, terminalIndex) => {
      edges.push(edge(
        `join:${terminal.key || terminal.id}:${targetId}:${terminalIndex}`,
        terminal.id,
        targetId,
        terminal.label || '',
      ))
    })
  }

  top.forEach((element, topIndex) => {
    const nodeId = String(element.id)
    const groupMembers = element.key === 'group'
      ? (element.config?.memberIds || []).map((id) => byId.get(String(id))).filter(Boolean)
      : []
    const groupCollapsed = element.key === 'group' && collapsedGroups[nodeId] === true

    nodes.push({
      id: nodeId,
      type: 'workflow',
      position: { x: MAIN_X, y },
      data: {
        kind: element.key === 'group' ? 'group' : 'element',
        element,
        title: labelFor(element),
        subtitle: element.key === 'group'
          ? `Group · ${groupMembers.length} element${groupMembers.length === 1 ? '' : 's'}`
          : subtitleFor(element),
        description: element.description || subtitleFor(element),
        tone: toneFor(element),
        groupCollapsed,
        onToggleGroup: element.key === 'group' ? () => onToggleGroup(nodeId) : undefined,
        onOpen,
        onRemove,
        onAdd: element.key === 'group'
          ? () => onAddGroupMember?.(element.id)
          : () => onAddAt(topIndex + 1),
      },
    })
    connectTerminals(nodeId)

    if (element.key === 'decision') {
      const outcomes = [
        ...(element.config?.outcomes || []).map((outcome, outcomeIndex) => ({
          id: outcome.id || `outcome-${outcomeIndex + 1}`,
          label: outcome.label || `Outcome ${outcomeIndex + 1}`,
          ids: Array.isArray(outcome.branch) ? outcome.branch : [],
        })),
        {
          id: '__DEFAULT__',
          label: element.config?.defaultLabel || 'Default Outcome',
          ids: Array.isArray(element.config?.defaultBranch) ? element.config.defaultBranch : [],
        },
      ]
      const branchStartY = y + ROW
      let maxDepth = 0
      const nextTerminals = []
      outcomes.forEach((outcome, pathIndex) => {
        const members = outcome.ids.map((id) => byId.get(String(id))).filter(Boolean)
        maxDepth = Math.max(maxDepth, members.length)
        const x = MAIN_X + (pathIndex - (outcomes.length - 1) / 2) * BRANCH_X
        if (!members.length) {
          nextTerminals.push({ id: nodeId, key: `${nodeId}:${outcome.id}:empty`, label: outcome.label })
          return
        }
        let previousId = nodeId
        members.forEach((member, memberIndex) => {
          const memberNodeId = `branch:${nodeId}:${outcome.id}:${member.id}`
          nodes.push({
            id: memberNodeId,
            type: 'workflow',
            position: { x, y: branchStartY + memberIndex * ROW },
            data: {
              kind: 'element',
              element: member,
              title: labelFor(member),
              subtitle: subtitleFor(member),
              description: member.description || subtitleFor(member),
              tone: toneFor(member),
              onOpen,
              onRemove,
              onAdd: () => onAddDecisionBranch?.(element.id, outcome.id),
            },
          })
          edges.push(edge(
            `branch:${nodeId}:${outcome.id}:${member.id}`,
            previousId,
            memberNodeId,
            memberIndex === 0 ? outcome.label : '',
          ))
          previousId = memberNodeId
        })
        nextTerminals.push({ id: previousId, key: `${nodeId}:${outcome.id}:${previousId}`, label: '' })
      })
      terminals = nextTerminals.length ? nextTerminals : [{ id: nodeId, key: nodeId, label: '' }]
      y = branchStartY + Math.max(1, maxDepth) * ROW + 20
      return
    }

    if (element.key === 'group' && groupMembers.length && !groupCollapsed) {
      let previousId = nodeId
      groupMembers.forEach((member, memberIndex) => {
        const memberNodeId = `group:${nodeId}:${member.id}`
        nodes.push({
          id: memberNodeId,
          type: 'workflow',
          position: { x: MAIN_X, y: y + (memberIndex + 1) * ROW },
          data: {
            kind: 'element',
            element: member,
            title: labelFor(member),
            subtitle: subtitleFor(member),
            description: member.description || subtitleFor(member),
            tone: toneFor(member),
            onOpen,
            onRemove,
            onAdd: () => onAddGroupMember?.(element.id),
          },
        })
        edges.push(edge(`group:${nodeId}:${member.id}`, previousId, memberNodeId))
        previousId = memberNodeId
      })
      terminals = [{ id: previousId, key: `${nodeId}:group-terminal`, label: '' }]
      y += (groupMembers.length + 1) * ROW
      return
    }

    terminals = [{ id: nodeId, key: nodeId, label: '' }]
    y += ROW
  })

  const endId = '__end__'
  nodes.push({
    id: endId,
    type: 'workflow',
    position: { x: MAIN_X, y },
    data: { kind: 'end', title: 'End', subtitle: 'Flow complete', description: 'End of flow', tone: 'gray' },
  })
  connectTerminals(endId)
  return { nodes, edges }
}

function computeLayout(nodes, edges) {
  const depth = new Map()
  const resolveDepth = (id, trail = new Set()) => {
    if (depth.has(id)) return depth.get(id)
    if (trail.has(id)) return 0
    const parents = edges.filter((edge) => edge.target === id).map((edge) => edge.source)
    if (!parents.length) { depth.set(id, 0); return 0 }
    const nextTrail = new Set(trail)
    nextTrail.add(id)
    const value = Math.max(...parents.map((parentId) => resolveDepth(parentId, nextTrail))) + 1
    depth.set(id, value)
    return value
  }
  nodes.forEach((node) => resolveDepth(node.id))
  const grouped = new Map()
  nodes.forEach((node) => {
    const level = depth.get(node.id) || 0
    if (!grouped.has(level)) grouped.set(level, [])
    grouped.get(level).push(node.id)
  })
  return nodes.map((node) => {
    const level = depth.get(node.id) || 0
    const row = grouped.get(level) || []
    const index = row.indexOf(node.id)
    const width = (row.length - 1) * 300
    return { ...node, position: { x: 480 - width / 2 + index * 300, y: 50 + level * 165 } }
  })
}

function initialCollapsedGroups(elements) {
  const state = {}
  for (const group of elements.filter((element) => element.source === 'auto' && element.key === 'group')) {
    try { state[String(group.id)] = localStorage.getItem(`gptbuilder.group.${group.id}.collapsed`) === 'true' } catch { state[String(group.id)] = false }
  }
  return state
}

export default function GPTBuilderReactFlowCanvas({
  elements,
  selectedId,
  startLabel,
  onOpen,
  onRemove,
  onAddAt,
  onAddDecisionBranch,
  onAddGroupMember,
  onOpenStart,
}) {
  const [collapsedGroups, setCollapsedGroups] = useState(() => initialCollapsedGroups(elements))

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = { ...current }
      for (const group of elements.filter((element) => element.source === 'auto' && element.key === 'group')) {
        if (Object.prototype.hasOwnProperty.call(next, String(group.id))) continue
        try { next[String(group.id)] = localStorage.getItem(`gptbuilder.group.${group.id}.collapsed`) === 'true' } catch { next[String(group.id)] = false }
      }
      return next
    })
  }, [elements])

  const toggleGroup = useCallback((groupId) => {
    setCollapsedGroups((current) => {
      const nextValue = current[groupId] !== true
      try { localStorage.setItem(`gptbuilder.group.${groupId}.collapsed`, String(nextValue)) } catch {}
      return { ...current, [groupId]: nextValue }
    })
  }, [])

  const graph = useMemo(() => buildGraph({
    elements,
    startLabel,
    collapsedGroups,
    onOpen,
    onRemove,
    onAddAt,
    onAddDecisionBranch,
    onAddGroupMember,
    onToggleGroup: toggleGroup,
  }), [elements, startLabel, collapsedGroups, onOpen, onRemove, onAddAt, onAddDecisionBranch, onAddGroupMember, toggleGroup])

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)
  const [instance, setInstance] = useState(null)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: String(node.data?.element?.id || node.id) === String(selectedId),
  })), [nodes, selectedId])

  const displayEdges = useMemo(() => {
    const colors = seededColorOrder(selectedId || 'none')
    let index = 0
    return edges.map((edge) => {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      const sourceElementId = sourceNode?.data?.element?.id || edge.source
      if (String(sourceElementId) !== String(selectedId)) {
        return { ...edge, className: '', style: undefined, markerEnd: { type: MarkerType.ArrowClosed } }
      }
      const color = colors[index++ % colors.length]
      return {
        ...edge,
        className: `rfux-child-running-edge rfux-child-${color.key}`,
        style: { '--rfux-edge-color': color.hex, stroke: color.hex },
        markerEnd: { type: MarkerType.ArrowClosed, color: color.hex },
      }
    })
  }, [edges, nodes, selectedId])

  const canvasSize = useMemo(() => ({
    width: Math.ceil(nodes.reduce((value, node) => Math.max(value, Number(node.position?.x || 0) + 320), 980)),
    height: Math.ceil(nodes.reduce((value, node) => Math.max(value, Number(node.position?.y || 0) + 150), 720)),
  }), [nodes])

  return <div className="rfux-page gptb-reactflow-page">
    <div className="rfux-canvas-shell">
      <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
        <button type="button" title="Auto layout" aria-label="Auto layout" onClick={() => {
          setNodes((current) => computeLayout(current, edges))
          requestAnimationFrame(() => requestAnimationFrame(() => instance?.fitView({ padding: 0.18, duration: 250 })))
        }}><WandSparkles size={15}/></button>
      </div>
      <div className="rfux-scroll-surface">
        <div className="rfux-canvas-stage" style={{ width: canvasSize.width, height: canvasSize.height }}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onInit={setInstance}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              if (node.id === '__start__') { onOpenStart?.(); return }
              if (node.data?.element) onOpen?.(node.data.element)
            }}
            defaultViewport={{ x: 140, y: 24, zoom: 0.8 }}
            minZoom={0.25}
            maxZoom={2}
            nodesDeletable={false}
            edgesDeletable={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          ><Controls position="bottom-left" showInteractive={false}/></ReactFlow>
        </div>
      </div>
    </div>
  </div>
}
