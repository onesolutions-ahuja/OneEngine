import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Controls,
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
}

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
  for (let i = 0; i < String(seed).length; i += 1) {
    hash = ((hash << 5) - hash + String(seed).charCodeAt(i)) | 0
  }
  for (let i = values.length - 1; i > 0; i -= 1) {
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    const j = Math.abs(hash) % (i + 1)
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values
}

function WorkflowNode({ id, data, selected }) {
  const Icon = icons[data.icon] || Sparkles
  const removable = !data.hasChildren && !data.isRoot

  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle" />

      <div className={`rfux-node-icon ${data.icon === 'branch' ? 'rfux-node-icon--decision' : ''}`}><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>

      {removable ? (
        <button
          type="button"
          className="rfux-node-remove nodrag"
          aria-label="Remove node"
          title="Remove node"
          onClick={(event) => {
            event.stopPropagation()
            data.onRemoveNode?.(id)
          }}
        >
          <Minus size={14} />
        </button>
      ) : null}

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

function computeLayout(nodes, edges) {
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

    return {
      ...node,
      position: {
        x: 480 - width / 2 + index * 300,
        y: 60 + level * 165,
      },
    }
  })
}

let nextId = 10

export default function ReactFlowCanvasUXTest() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('3')
  const [flowInstance, setFlowInstance] = useState(null)

  const addChild = useCallback((sourceId) => {
    const source = nodes.find((node) => node.id === sourceId)
    if (!source) return

    const id = String(nextId++)
    const siblingCount = edges.filter((edge) => edge.source === sourceId).length
    const newNode = {
      id,
      type: 'workflow',
      position: {
        x: source.position.x + (siblingCount % 2 === 0 ? 140 : -140),
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
  }, [nodes, edges, setNodes, setEdges])

  const removeNode = useCallback((nodeId) => {
    const hasChildren = edges.some((edge) => edge.source === nodeId)
    const isRoot = !edges.some((edge) => edge.target === nodeId)

    if (hasChildren || isRoot) {
      return
    }

    setNodes((current) => current.filter((node) => node.id !== nodeId))
    setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (selectedId === nodeId) setSelectedId('')
  }, [edges, selectedId, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const canvasSize = useMemo(() => {
    const maxX = nodes.reduce((value, node) => Math.max(value, Number(node.position?.x || 0) + 420), 0)
    const maxY = nodes.reduce((value, node) => Math.max(value, Number(node.position?.y || 0) + 260), 0)
    return {
      width: Math.max(1500, Math.ceil(maxX)),
      height: Math.max(1100, Math.ceil(maxY)),
    }
  }, [nodes])

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
    const colorOrder = seededColorOrder(selectedId || 'none')
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

      const color = colorOrder[childIndex % colorOrder.length]
      childIndex += 1

      return {
        ...edge,
        animated: false,
        className: `rfux-child-running-edge rfux-child-${color.key}`,
        style: {
          '--rfux-edge-color': color.hex,
          stroke: color.hex,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: color.hex },
      }
    })
  }, [edges, selectedId])

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return

    const duplicate = edges.some(
      (edge) => edge.source === connection.source && edge.target === connection.target
    )
    if (duplicate) return

    setEdges((current) => addEdge({
      ...connection,
      id: `e${connection.source}-${connection.target}-${Date.now()}`,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, current))

  }, [edges, setEdges])

  return (
    <div className="rfux-page">
      <div className="rfux-canvas-shell">
        <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
          <button
            type="button"
            title="Auto layout"
            onClick={() => {
              setNodes((current) => computeLayout(current, edges))
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  flowInstance?.fitView({ padding: 0.24, duration: 350, minZoom: 0.25, maxZoom: 1.5 })
                })
              })
            }}
          >
            <WandSparkles size={15} />
          </button>
        </div>

        <div className="rfux-scroll-surface">
          <div
            className="rfux-canvas-stage"
            style={{ width: canvasSize.width, height: canvasSize.height }}
          >
            <ReactFlow
              nodes={nodesWithActions}
              edges={edgesWithState}
              onInit={setFlowInstance}
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
              preventScrolling={false}
              defaultEdgeOptions={{ type: 'smoothstep' }}
              proOptions={{ hideAttribution: true }}
            >
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </div>
        </div>

      </div>
    </div>
  )
}
