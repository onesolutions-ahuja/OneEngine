import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  MarkerType,
  ConnectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Bot,
  Database,
  GitBranch,
  MessageSquare,
  Minus,
  MoreHorizontal,
  Play,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react'
import './ReactFlowCanvasUXTest.css'

const initialNodes = [
  { id: '1', type: 'workflow', position: { x: 420, y: 60 }, data: { title: 'When a new lead arrives', subtitle: 'Trigger', tone: 'purple', icon: 'zap' } },
  { id: '2', type: 'workflow', position: { x: 420, y: 215 }, data: { title: 'Enrich lead details', subtitle: 'Action', tone: 'blue', icon: 'sparkles' } },
  { id: '3', type: 'workflow', position: { x: 420, y: 370 }, data: { title: 'Is the lead qualified?', subtitle: 'Condition', tone: 'amber', icon: 'branch' } },
  { id: '4', type: 'workflow', position: { x: 190, y: 545 }, data: { title: 'Send welcome message', subtitle: 'Action', tone: 'green', icon: 'message' } },
  { id: '5', type: 'workflow', position: { x: 650, y: 545 }, data: { title: 'Save for review', subtitle: 'Action', tone: 'gray', icon: 'database' } },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-4', source: '3', target: '4', type: 'smoothstep', label: 'Yes', markerEnd: { type: MarkerType.ArrowClosed } },
  { id: 'e3-5', source: '3', target: '5', type: 'smoothstep', label: 'No', markerEnd: { type: MarkerType.ArrowClosed } },
]

const icons = {
  zap: Zap,
  sparkles: Sparkles,
  branch: GitBranch,
  message: MessageSquare,
  database: Database,
  bot: Bot,
}

const RUN_COLORS = ['violet', 'blue', 'green', 'amber', 'pink', 'cyan']

function WorkflowNode({ id, data, selected }) {
  const Icon = icons[data.icon] || Sparkles
  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''} ${data.runColor ? `is-running rfux-run-${data.runColor}` : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle" />
      <div className="rfux-node-icon"><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>
      <button type="button" className="rfux-more nodrag" aria-label="Node menu"><MoreHorizontal size={16} /></button>

      <div className="rfux-node-actions nodrag">
        <button
          type="button"
          className="rfux-node-action rfux-node-action--remove"
          aria-label="Remove child"
          title="Remove child"
          disabled={!data.hasChildren}
          onClick={(event) => {
            event.stopPropagation()
            data.onRemoveChild?.(id)
          }}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className="rfux-node-action rfux-node-action--add"
          aria-label="Add child"
          title="Add child"
          onClick={(event) => {
            event.stopPropagation()
            data.onQuickAdd?.(id)
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} className="rfux-handle" />
    </div>
  )
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))
  edges.forEach((edge) => {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) return
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })
  const queue = nodes.filter((node) => (indegree.get(node.id) || 0) === 0).map((node) => node.id)
  const ordered = []
  while (queue.length) {
    const id = queue.shift()
    ordered.push(id)
    for (const child of outgoing.get(id) || []) {
      indegree.set(child, (indegree.get(child) || 0) - 1)
      if ((indegree.get(child) || 0) === 0) queue.push(child)
    }
  }
  nodes.forEach((node) => {
    if (!ordered.includes(node.id)) ordered.push(node.id)
  })
  return ordered
}

function branchCleanup(nodes, edges, removedEdge) {
  const nextEdges = edges.filter((edge) => edge.id !== removedEdge.id)
  const queue = [removedEdge.target]
  const removeIds = new Set()

  while (queue.length) {
    const candidate = queue.shift()
    const remainingParents = nextEdges.filter((edge) => edge.target === candidate && !removeIds.has(edge.source))
    if (remainingParents.length) continue
    removeIds.add(candidate)
    nextEdges
      .filter((edge) => edge.source === candidate)
      .forEach((edge) => queue.push(edge.target))
  }

  return {
    nodes: nodes.filter((node) => !removeIds.has(node.id)),
    edges: nextEdges.filter((edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target)),
    removedCount: removeIds.size,
  }
}

let nextId = 10

export default function ReactFlowCanvasUXTest() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('3')
  const [message, setMessage] = useState('Select a node to animate only its child connectors. Add nodes only as children.')
  const [running, setRunning] = useState(false)
  const [runnerIndex, setRunnerIndex] = useState(0)

  const addChild = useCallback((sourceId) => {
    const source = nodes.find((node) => node.id === sourceId)
    if (!source) return
    const id = String(nextId++)
    const siblingCount = edges.filter((edge) => edge.source === sourceId).length
    const newNode = {
      id,
      type: 'workflow',
      position: {
        x: source.position.x + (siblingCount % 2 === 0 ? 120 : -120),
        y: source.position.y + 165,
      },
      data: {
        title: 'New workflow step',
        subtitle: 'Action',
        tone: 'blue',
        icon: 'sparkles',
      },
    }
    setNodes((current) => [...current, newNode])
    setEdges((current) => addEdge({
      id: `e${sourceId}-${id}`,
      source: sourceId,
      target: id,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, current))
    setSelectedId(id)
    setMessage('Child added. It can be moved freely, but it stays connected to its parent.')
  }, [nodes, edges, setNodes, setEdges])

  const removeChild = useCallback((sourceId) => {
    const outgoing = edges.filter((edge) => edge.source === sourceId)
    if (!outgoing.length) return
    const edgeToRemove = outgoing[outgoing.length - 1]
    const cleaned = branchCleanup(nodes, edges, edgeToRemove)
    setNodes(cleaned.nodes)
    setEdges(cleaned.edges)
    if (selectedId && !cleaned.nodes.some((node) => node.id === selectedId)) setSelectedId(sourceId)
    setMessage(cleaned.removedCount
      ? `Removed child branch (${cleaned.removedCount} node${cleaned.removedCount === 1 ? '' : 's'}). No orphan nodes left on canvas.`
      : 'Removed one parent connection; the child remains because it has another parent.')
  }, [nodes, edges, selectedId, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const runOrder = useMemo(() => topologicalOrder(nodes, edges), [nodes, edges])

  useEffect(() => {
    if (!running) return undefined
    if (runnerIndex >= runOrder.length) {
      setRunning(false)
      setRunnerIndex(0)
      setMessage('Workflow run complete.')
      return undefined
    }
    const timer = setTimeout(() => setRunnerIndex((value) => value + 1), 650)
    return () => clearTimeout(timer)
  }, [running, runnerIndex, runOrder])

  const runColorByNode = useMemo(() => {
    const map = new Map()
    runOrder.forEach((id, index) => map.set(id, RUN_COLORS[index % RUN_COLORS.length]))
    return map
  }, [runOrder])

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onQuickAdd: addChild,
        onRemoveChild: removeChild,
        hasChildren: edges.some((edge) => edge.source === node.id),
        runColor: running ? runColorByNode.get(node.id) : '',
      },
      selected: node.id === selectedId,
    })),
    [nodes, edges, addChild, removeChild, running, runColorByNode, selectedId],
  )

  const edgesWithState = useMemo(
    () => edges.map((edge, index) => {
      const selectedChildConnector = !running && edge.source === selectedId
      const runColor = running ? runColorByNode.get(edge.source) || RUN_COLORS[index % RUN_COLORS.length] : ''
      return {
        ...edge,
        animated: selectedChildConnector || running,
        className: [
          selectedChildConnector ? 'rfux-child-running-edge' : '',
          runColor ? `rfux-workflow-running-edge rfux-run-${runColor}` : '',
        ].filter(Boolean).join(' '),
      }
    }),
    [edges, selectedId, running, runColorByNode],
  )

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const duplicate = edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
    if (duplicate) return
    setEdges((current) => addEdge({
      ...connection,
      id: `e${connection.source}-${connection.target}-${Date.now()}`,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, current))
    setMessage('Additional parent connected. A child can have two, three, or more parents.')
  }, [edges, setEdges])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    const incoming = edges.filter((edge) => edge.target === selectedId)
    if (!incoming.length) {
      setMessage('The root node cannot be removed because free-floating workflows are not allowed.')
      return
    }

    const remainingEdges = edges.filter((edge) => edge.target !== selectedId && edge.source !== selectedId)
    const childEdges = edges.filter((edge) => edge.source === selectedId)
    let nextNodes = nodes.filter((node) => node.id !== selectedId)
    let nextEdges = remainingEdges

    childEdges.forEach((edge) => {
      const cleaned = branchCleanup(nextNodes, nextEdges, { ...edge, id: '__already_removed__' })
      const stillHasParent = nextEdges.some((candidate) => candidate.target === edge.target)
      if (!stillHasParent) {
        nextNodes = cleaned.nodes
        nextEdges = cleaned.edges
      }
    })

    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedId('')
    setMessage('Selected node removed without leaving orphan nodes.')
  }, [selectedId, nodes, edges, setNodes, setEdges])

  const startRunner = useCallback(() => {
    setRunnerIndex(0)
    setRunning(true)
    setMessage('Running: nodes and connectors use different colours to make each path easy to follow.')
  }, [])

  return (
    <div className="rfux-page">
      <div className="rfux-header">
        <div>
          <span className="rfux-kicker">Canvas UX prototype</span>
          <h2>React Flow workflow editor test</h2>
          <p>Isolated visual prototype only — no OneEngine workflow data or runtime actions.</p>
        </div>
        <div className="rfux-header-actions">
          <button type="button" onClick={deleteSelected} disabled={!selectedId}><Trash2 size={16}/> Delete</button>
        </div>
      </div>

      <div className="rfux-canvas-shell">
        <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
          <button
            type="button"
            className={running ? 'is-running' : 'is-active'}
            title={running ? 'Stop run' : 'Run workflow'}
            onClick={() => {
              if (running) {
                setRunning(false)
                setRunnerIndex(0)
                setMessage('Workflow run stopped.')
              } else {
                startRunner()
              }
            }}
          >
            <Play size={15}/>
          </button>
          <span />
          <button type="button" title="Auto layout" onClick={() => {
            setNodes((current) => {
              const ordered = topologicalOrder(current, edges)
              const levels = new Map()
              ordered.forEach((id) => {
                const parents = edges.filter((edge) => edge.target === id).map((edge) => edge.source)
                levels.set(id, parents.length ? Math.max(...parents.map((parentId) => levels.get(parentId) || 0)) + 1 : 0)
              })
              const grouped = new Map()
              current.forEach((node) => {
                const level = levels.get(node.id) || 0
                if (!grouped.has(level)) grouped.set(level, [])
                grouped.get(level).push(node.id)
              })
              return current.map((node) => {
                const level = levels.get(node.id) || 0
                const row = grouped.get(level) || []
                const index = row.indexOf(node.id)
                const width = (row.length - 1) * 300
                return {
                  ...node,
                  position: { x: 480 - width / 2 + index * 300, y: 60 + level * 165 },
                }
              })
            })
            setMessage('Auto layout applied.')
          }}><WandSparkles size={15}/></button>
        </div>

        <ReactFlow
          nodes={nodesWithActions}
          edges={edgesWithState}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId('')}
          fitView
          fitViewOptions={{ padding: 0.24 }}
          minZoom={0.25}
          maxZoom={2}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1} />
          <MiniMap pannable zoomable className="rfux-minimap" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>

        <div className="rfux-status">
          <Bot size={15} />
          <span>{message}</span>
        </div>
      </div>
    </div>
  )
}
