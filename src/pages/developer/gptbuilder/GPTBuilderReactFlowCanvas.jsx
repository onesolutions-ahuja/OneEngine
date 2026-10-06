import { useEffect, useMemo, useState } from 'react'
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
import { Plus, Minus, Sparkles, WandSparkles, Zap } from 'lucide-react'
import { elementByKey } from './GPTBuilderElements'
import '../ReactFlowCanvasUXTest.css'

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

function BuilderNode({ id, data, selected }) {
  const definition = data.kind === 'start' ? null : elementByKey(data.element?.key)
  const Icon = data.kind === 'start' ? Zap : (definition?.icon || Sparkles)
  const removable = data.kind !== 'start' && data.kind !== 'end'

  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''}`}>
      {data.kind !== 'start' ? <Handle type="target" position={Position.Top} className="rfux-handle" /> : null}
      <div className={`rfux-node-icon ${data.element?.key === 'decision' ? 'rfux-node-icon--decision' : ''}`}><Icon size={16}/></div>
      <div className="rfux-node-copy" onDoubleClick={() => data.onOpen?.(data.element)}>
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>
      {removable ? <button type="button" className="rfux-node-remove nodrag" aria-label={`Remove ${data.title}`} title="Remove" onClick={(event) => { event.stopPropagation(); data.onRemove?.(id) }}><Minus size={14}/></button> : null}
      {data.kind !== 'end' ? <button type="button" className="rfux-node-add nodrag" aria-label={`Add after ${data.title}`} title="Add element" onClick={(event) => { event.stopPropagation(); data.onAdd?.() }}><Plus size={14}/></button> : null}
      {data.kind !== 'end' ? <Handle type="source" position={Position.Bottom} className="rfux-handle" /> : null}
    </div>
  )
}

const nodeTypes = { workflow: BuilderNode }

function buildGraph(elements, startLabel, onOpen, onRemove, onAddAt, onAddDecisionBranch) {
  const auto = elements.filter((element) => element.source === 'auto')
  const nested = new Set([
    ...auto.filter((item) => item.key === 'group').flatMap((item) => item.config?.memberIds || []),
    ...auto.filter((item) => item.key === 'decision').flatMap((item) => [
      ...(item.config?.outcomes || []).flatMap((outcome) => outcome.branch || []),
      ...(item.config?.defaultBranch || []),
    ]),
  ])
  const top = auto.filter((item) => !nested.has(item.id))
  const byId = new Map(auto.map((item) => [String(item.id), item]))
  const nodes = [{
    id: '__start__',
    type: 'workflow',
    position: { x: 420, y: 50 },
    data: { kind: 'start', title: 'Start', subtitle: startLabel || 'Trigger', tone: 'blue', onAdd: () => onAddAt(0) },
  }]
  const edges = []
  const MAIN_X = 420
  const ROW = 155
  const BRANCH_X = 300
  let y = 205
  let previous = '__start__'

  const edge = (id, source, target, label = '') => ({
    id, source, target, type: 'smoothstep', label,
    markerEnd: { type: MarkerType.ArrowClosed },
  })

  top.forEach((element, index) => {
    const nodeId = String(element.id)
    nodes.push({
      id: nodeId,
      type: 'workflow',
      position: { x: MAIN_X, y },
      data: {
        element,
        title: element.label || element.apiName || elementByKey(element.key)?.label || 'Flow element',
        subtitle: element.configured ? (elementByKey(element.key)?.label || element.key) : `${elementByKey(element.key)?.label || element.key} · Not fully configured`,
        tone: toneFor(element),
        onOpen,
        onRemove,
        onAdd: () => onAddAt(index + 1),
      },
    })
    edges.push(edge(`main:${previous}:${nodeId}`, previous, nodeId))

    if (element.key === 'decision') {
      const outcomes = [
        ...(element.config?.outcomes || []).map((outcome, outcomeIndex) => ({
          id: outcome.id || `outcome-${outcomeIndex + 1}`,
          label: outcome.label || `Outcome ${outcomeIndex + 1}`,
          ids: outcome.branch || [],
        })),
        { id: '__DEFAULT__', label: element.config?.defaultLabel || 'Default Outcome', ids: element.config?.defaultBranch || [] },
      ]
      const branchStartY = y + ROW
      let maxDepth = 0
      outcomes.forEach((outcome, pathIndex) => {
        const members = outcome.ids.map((id) => byId.get(String(id))).filter(Boolean)
        maxDepth = Math.max(maxDepth, members.length)
        const x = MAIN_X + (pathIndex - (outcomes.length - 1) / 2) * BRANCH_X
        if (!members.length) return
        let branchPrevious = nodeId
        members.forEach((member, memberIndex) => {
          const memberNodeId = `branch:${nodeId}:${outcome.id}:${member.id}`
          nodes.push({
            id: memberNodeId,
            type: 'workflow',
            position: { x, y: branchStartY + memberIndex * ROW },
            data: {
              element: member,
              title: member.label || member.apiName || elementByKey(member.key)?.label || 'Flow element',
              subtitle: member.configured ? (elementByKey(member.key)?.label || member.key) : `${elementByKey(member.key)?.label || member.key} · Not fully configured`,
              tone: toneFor(member),
              onOpen,
              onRemove: () => onRemove(member.id),
              onAdd: () => onAddDecisionBranch?.(element.id, outcome.id),
            },
          })
          edges.push(edge(`branch:${nodeId}:${outcome.id}:${member.id}`, branchPrevious, memberNodeId, memberIndex === 0 ? outcome.label : ''))
          branchPrevious = memberNodeId
        })
      })
      y = branchStartY + Math.max(1, maxDepth) * ROW
    } else {
      y += ROW
    }
    previous = nodeId
  })

  const endId = '__end__'
  nodes.push({
    id: endId,
    type: 'workflow',
    position: { x: MAIN_X, y },
    data: { kind: 'end', title: 'End', subtitle: 'Flow complete', tone: 'gray' },
  })
  edges.push(edge(`main:${previous}:${endId}`, previous, endId))
  return { nodes, edges }
}

function computeLayout(nodes, edges) {
  const depth = new Map()
  const resolveDepth = (id, trail = new Set()) => {
    if (depth.has(id)) return depth.get(id)
    if (trail.has(id)) return 0
    const parents = edges.filter((edge) => edge.target === id).map((edge) => edge.source)
    if (!parents.length) { depth.set(id, 0); return 0 }
    const nextTrail = new Set(trail); nextTrail.add(id)
    const value = Math.max(...parents.map((parentId) => resolveDepth(parentId, nextTrail))) + 1
    depth.set(id, value); return value
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

export default function GPTBuilderReactFlowCanvas({
  elements,
  selectedId,
  startLabel,
  onOpen,
  onRemove,
  onAddAt,
  onAddDecisionBranch,
  onOpenStart,
}) {
  const graph = useMemo(() => buildGraph(elements, startLabel, onOpen, onRemove, onAddAt, onAddDecisionBranch), [elements, startLabel, onOpen, onRemove, onAddAt, onAddDecisionBranch])
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)
  const [instance, setInstance] = useState(null)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const displayNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedId || node.data?.element?.id === selectedId,
  })), [nodes, selectedId])

  const displayEdges = useMemo(() => {
    const colors = seededColorOrder(selectedId || 'none')
    let index = 0
    return edges.map((edge) => {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      const sourceElementId = sourceNode?.data?.element?.id || edge.source
      if (String(sourceElementId) !== String(selectedId)) return { ...edge, className: '', style: undefined, markerEnd: { type: MarkerType.ArrowClosed } }
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
