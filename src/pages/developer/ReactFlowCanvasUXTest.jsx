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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Bot,
  Database,
  GitBranch,
  MessageSquare,
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
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
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

function WorkflowNode({ id, data, selected }) {
  const Icon = icons[data.icon] || Sparkles
  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle" />
      <div className="rfux-node-icon"><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>
      <button type="button" className="rfux-more nodrag" aria-label="Node menu"><MoreHorizontal size={16} /></button>
      <button
        type="button"
        className="rfux-node-plus nodrag"
        aria-label="Add next step"
        onClick={() => data.onQuickAdd?.(id)}
      >
        <Plus size={15} />
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
  const [message, setMessage] = useState('Drag nodes, connect handles, pan and zoom. This page is UI-only.')

  const addNode = useCallback((sourceId = null, position = null) => {
    const id = String(nextId++)
    const source = sourceId ? nodes.find((node) => node.id === sourceId) : null
    const nextPosition = position || {
      x: source ? source.position.x + 40 : 430,
      y: source ? source.position.y + 165 : 270,
    }
    const newNode = {
      id,
      type: 'workflow',
      position: nextPosition,
      data: {
        title: 'New workflow step',
        subtitle: 'Action',
        tone: 'blue',
        icon: 'sparkles',
      },
    }
    setNodes((current) => [...current, newNode])
    if (sourceId) {
      setEdges((current) => addEdge({
        id: `e${sourceId}-${id}`,
        source: sourceId,
        target: id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      }, current))
    }
    setSelectedId(id)
    setMessage('New step added. Drag it anywhere; its connector follows automatically.')
  }, [nodes, setNodes, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: { ...node.data, onQuickAdd: addNode },
      selected: node.id === selectedId,
    })),
    [nodes, addNode, selectedId],
  )

  const onConnect = useCallback((connection) => {
    setEdges((current) => addEdge({
      ...connection,
      type: 'smoothstep',
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    }, current))
    setMessage('Connected. Move either node and the wire updates live.')
  }, [setEdges])

  const deleteSelected = () => {
    if (!selectedId) return
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setEdges((current) => current.filter((edge) => edge.source !== selectedId && edge.target !== selectedId))
    setSelectedId('')
    setMessage('Selected node removed.')
  }

  return (
    <div className="rfux-page">
      <div className="rfux-header">
        <div>
          <span className="rfux-kicker">Canvas UX prototype</span>
          <h2>React Flow workflow editor test</h2>
          <p>Isolated visual prototype only — no OneEngine workflow data or runtime actions.</p>
        </div>
        <div className="rfux-header-actions">
          <button type="button" onClick={() => addNode()}><Plus size={16}/> Add node</button>
          <button type="button" onClick={deleteSelected} disabled={!selectedId}><Trash2 size={16}/> Delete</button>
        </div>
      </div>

      <div className="rfux-canvas-shell">
        <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
          <button type="button" className="is-active" title="Select"><Play size={15}/></button>
          <span />
          <button type="button" onClick={() => addNode()} title="Add node"><Plus size={15}/></button>
          <button type="button" title="Auto layout" onClick={() => {
            setNodes((current) => current.map((node, index) => ({
              ...node,
              position: {
                x: index < 3 ? 420 : index % 2 === 1 ? 190 : 650,
                y: index < 3 ? 60 + index * 155 : 545 + Math.floor((index - 3) / 2) * 155,
              },
            })))
            setMessage('Auto layout applied.')
          }}><WandSparkles size={15}/></button>
        </div>

        <ReactFlow
          nodes={nodesWithActions}
          edges={edges}
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
