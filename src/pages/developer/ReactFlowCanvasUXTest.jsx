import { useCallback, useMemo, useState } from 'react'
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
    Plus,
  Sparkles,
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

const CHILD_COLORS = [
  { key: 'green', hex: '#16a34a' },
  { key: 'orange', hex: '#ea580c' },
  { key: 'blue', hex: '#2563eb' },
  { key: 'pink', hex: '#db2777' },
  { key: 'cyan', hex: '#0891b2' },
  { key: 'violet', hex: '#7c3aed' },
]

function WorkflowNode({ id, data, selected }) {
  const Icon = icons[data.icon] || Sparkles
  const removable = !data.hasChildren && !data.isRoot
  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle" />
      <div className="rfux-node-icon"><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>

      <button
        type="button"
        className="rfux-node-remove nodrag"
        aria-label={removable ? 'Remove node' : 'Node cannot be removed while it has children'}
        title={data.isRoot ? 'Start node cannot be removed' : removable ? 'Remove node' : 'Remove child nodes first'}
        disabled={!removable}
        onClick={(event) => {
          event.stopPropagation()
          data.onRemoveNode?.(id)
        }}
      >
        <Minus size={14} />
      </button>

      <button
        type="button"
        className="rfux-node-add nodrag"
        aria-label="Add child"
        title="Add child"
        onClick={(event) => {
          event.stopPropagation()
          data.onQuickAdd?.(id)
        }}
      >
        <Plus size={14} />
      </button>

      <Handle type="source" position={Position.Bottom} className="rfux-handle" />
    </div>
  )
}

let nextId = 10

export default function ReactFlowCanvasUXTest() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('3')
  const [message, setMessage] = useState('Select a node: only its outgoing child connectors animate, each in a different colour.')

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
    setSelectedId(sourceId)
    setMessage('Child added. Select its parent to see each child path flow in a different colour.')
  }, [nodes, edges, setNodes, setEdges])

  const removeNode = useCallback((nodeId) => {
    const hasChildren = edges.some((edge) => edge.source === nodeId)
    const isRoot = !edges.some((edge) => edge.target === nodeId)
    if (hasChildren || isRoot) {
      setMessage(isRoot ? 'The start/root node cannot be removed.' : 'This node has children. Remove its children first.')
      return
    }
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedId === nodeId) setSelectedId('')
    setMessage('Leaf node removed. No free-floating node was left behind.')
  }, [edges, selectedId, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onQuickAdd: addChild,
        onRemoveNode: removeNode,
        hasChildren: edges.some((edge) => edge.source === node.id),
        isRoot: !edges.some((edge) => edge.target === node.id),
      },
      selected: node.id === selectedId,
    })),
    [nodes, edges, addChild, removeNode, selectedId],
  )

  const edgesWithState = useMemo(() => {
    let childIndex = 0
    return edges.map((edge) => {
      if (edge.source !== selectedId) {
        return {
          ...edge,
          animated: false,
          className: '',
          style: undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        }
      }
      const color = CHILD_COLORS[childIndex % CHILD_COLORS.length]
      childIndex += 1
      return {
        ...edge,
        animated: true,
        className: `rfux-child-running-edge rfux-child-${color.key}`,
        style: { stroke: color.hex },
        markerEnd: { type: MarkerType.ArrowClosed, color: color.hex },
      }
    })
  }, [edges, selectedId])

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

  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle" />
      <div className="rfux-node-icon"><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>

      <button
        type="button"
        className="rfux-node-remove nodrag"
        aria-label={removable ? 'Remove node' : 'Node cannot be removed while it has children'}
        title={data.isRoot ? 'Start node cannot be removed' : removable ? 'Remove node' : 'Remove child nodes first'}
        disabled={!removable}
        onClick={(event) => {
          event.stopPropagation()
          data.onRemoveNode?.(id)
        }}
      >
        <Minus size={14} />
      </button>

      <button
        type="button"
        className="rfux-node-add nodrag"
        aria-label="Add child"
        title="Add child"
        onClick={(event) => {
          event.stopPropagation()
          data.onQuickAdd?.(id)
        }}
      >
        <Plus size={14} />
      </button>

      <Handle type="source" position={Position.Bottom} className="rfux-handle" />
    </div>
  )
}

let nextId = 10

export default function ReactFlowCanvasUXTest() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('3')
  const [message, setMessage] = useState('Select a node: only its outgoing child connectors animate, each in a different colour.')

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
    setSelectedId(sourceId)
    setMessage('Child added. Select its parent to see each child path flow in a different colour.')
  }, [nodes, edges, setNodes, setEdges])

  const removeNode = useCallback((nodeId) => {
    const hasChildren = edges.some((edge) => edge.source === nodeId)
    const isRoot = !edges.some((edge) => edge.target === nodeId)
    if (hasChildren || isRoot) {
      setMessage(isRoot ? 'The start/root node cannot be removed.' : 'This node has children. Remove its children first.')
      return
    }
    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedId === nodeId) setSelectedId('')
    setMessage('Leaf node removed. No free-floating node was left behind.')
  }, [edges, selectedId, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onQuickAdd: addChild,
        onRemoveNode: removeNode,
        hasChildren: edges.some((edge) => edge.source === node.id),
        isRoot: !edges.some((edge) => edge.target === node.id),
      },
      selected: node.id === selectedId,
    })),
    [nodes, edges, addChild, removeNode, selectedId],
  )

  const edgesWithState = useMemo(() => {
    let childIndex = 0
    return edges.map((edge) => {
      if (edge.source !== selectedId) {
        return {
          ...edge,
          animated: false,
          className: '',
          style: undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        }
      }
      const color = CHILD_COLORS[childIndex % CHILD_COLORS.length]
      childIndex += 1
      return {
        ...edge,
        animated: true,
        className: `rfux-child-running-edge rfux-child-${color.key}`,
        style: { stroke: color.hex },
        markerEnd: { type: MarkerType.ArrowClosed, color: color.hex },
      }
    })
  }, [edges, selectedId])

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
      </div>

      <div className="rfux-canvas-shell">
        <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
          <button type="button" title="Auto layout" onClick={() => {
            setNodes((current) => {
              const depth = new Map()
              const resolveDepth = (id, trail = new Set()) => {
                if (depth.has(id)) return depth.get(id)
                if (trail.has(id)) return 0
                const parents = edges.filter((edge) => edge.target === id).map((edge) => edge.source)
                if (!parents.length) {
                  depth.set(id, 0)
                  return 0
                }
                const nextTrail = new Set(trail)
                nextTrail.add(id)
                const value = Math.max(...parents.map((parentId) => resolveDepth(parentId, nextTrail))) + 1
                depth.set(id, value)
                return value
              }
              current.forEach((node) => resolveDepth(node.id))
              const grouped = new Map()
              current.forEach((node) => {
                const level = depth.get(node.id) || 0
                if (!grouped.has(level)) grouped.set(level, [])
                grouped.get(level).push(node.id)
              })
              return current.map((node) => {
                const level = depth.get(node.id) || 0
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
          nodesDeletable={false}
          edgesDeletable={false}
          deleteKeyCode={null}
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
