import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  MarkerType,
  ConnectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Bot,
  Copy,
  Database,
  GitBranch,
  MessageSquare,
  Minus,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  WandSparkles,
  Zap,
} from 'lucide-react'
import './ReactFlowCanvasUXTest.css'

const edgeDefaults = {
  type: 'smoothstep',
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed },
  className: 'rfux-running-edge',
}

const initialNodes = [
  { id: '1', type: 'workflow', position: { x: 420, y: 40 }, data: { title: 'When a new lead arrives', subtitle: 'Trigger', tone: 'purple', icon: 'zap' } },
  { id: '2', type: 'workflow', position: { x: 420, y: 200 }, data: { title: 'Enrich lead details', subtitle: 'Action', tone: 'blue', icon: 'sparkles' } },
  { id: '3', type: 'workflow', position: { x: 420, y: 360 }, data: { title: 'Is the lead qualified?', subtitle: 'Condition', tone: 'amber', icon: 'branch' } },
  { id: '4', type: 'workflow', position: { x: 160, y: 535 }, data: { title: 'Send welcome message', subtitle: 'Action', tone: 'green', icon: 'message' } },
  { id: '5', type: 'workflow', position: { x: 680, y: 535 }, data: { title: 'Save for review', subtitle: 'Action', tone: 'gray', icon: 'database' } },
  { id: '6', type: 'workflow', position: { x: 420, y: 710 }, data: { title: 'Update CRM record', subtitle: 'Merge step · 2 parents', tone: 'blue', icon: 'database' } },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', ...edgeDefaults },
  { id: 'e2-3', source: '2', target: '3', ...edgeDefaults },
  { id: 'e3-4', source: '3', target: '4', label: 'Yes', ...edgeDefaults },
  { id: 'e3-5', source: '3', target: '5', label: 'No', ...edgeDefaults },
  { id: 'e4-6', source: '4', target: '6', ...edgeDefaults },
  { id: 'e5-6', source: '5', target: '6', ...edgeDefaults },
]

const icons = {
  zap: Zap,
  sparkles: Sparkles,
  branch: GitBranch,
  message: MessageSquare,
  database: Database,
  bot: Bot,
}

const palette = [
  { title: 'Action', subtitle: 'Workflow action', tone: 'blue', icon: 'sparkles' },
  { title: 'Condition', subtitle: 'Branch logic', tone: 'amber', icon: 'branch' },
  { title: 'Message', subtitle: 'Send message', tone: 'green', icon: 'message' },
  { title: 'Data', subtitle: 'Read or write data', tone: 'gray', icon: 'database' },
]

function WorkflowNode({ id, data, selected }) {
  const Icon = icons[data.icon] || Sparkles
  return (
    <div className={`rfux-node rfux-node--${data.tone || 'blue'} ${selected ? 'is-selected' : ''} ${data.running ? 'is-running' : ''}`}>
      <Handle type="target" position={Position.Top} className="rfux-handle rfux-handle--target" />
      <div className="rfux-node-icon"><Icon size={16} /></div>
      <div className="rfux-node-copy">
        <strong>{data.title}</strong>
        <span>{data.subtitle}</span>
      </div>
      <button
        type="button"
        className="rfux-more nodrag"
        aria-label="Duplicate node"
        title="Duplicate node"
        onClick={(event) => {
          event.stopPropagation()
          data.onDuplicate?.(id)
        }}
      >
        <MoreHorizontal size={16} />
      </button>

      {!data.hasChildren ? (
        <button
          type="button"
          className="rfux-node-link-action rfux-node-link-action--add nodrag"
          aria-label="Add next step"
          title="Add next step"
          onClick={(event) => {
            event.stopPropagation()
            data.onQuickAdd?.(id)
          }}
        >
          <Plus size={15} />
        </button>
      ) : (
        <button
          type="button"
          className="rfux-node-link-action rfux-node-link-action--remove nodrag"
          aria-label="Disconnect child nodes"
          title="Disconnect child nodes"
          onClick={(event) => {
            event.stopPropagation()
            data.onDisconnectChildren?.(id)
          }}
        >
          <Minus size={15} />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className="rfux-handle rfux-handle--source" />
    </div>
  )
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  }
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
  for (const node of nodes) if (!ordered.includes(node.id)) ordered.push(node.id)
  return ordered
}

function autoLayoutNodes(nodes, edges) {
  const parents = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of edges) if (parents.has(edge.target)) parents.get(edge.target).push(edge.source)

  const levels = new Map()
  const resolveLevel = (id, trail = new Set()) => {
    if (levels.has(id)) return levels.get(id)
    if (trail.has(id)) return 0
    const nextTrail = new Set(trail)
    nextTrail.add(id)
    const nodeParents = parents.get(id) || []
    const level = nodeParents.length ? Math.max(...nodeParents.map((parentId) => resolveLevel(parentId, nextTrail))) + 1 : 0
    levels.set(id, level)
    return level
  }
  nodes.forEach((node) => resolveLevel(node.id))

  const grouped = new Map()
  nodes.forEach((node) => {
    const level = levels.get(node.id) || 0
    if (!grouped.has(level)) grouped.set(level, [])
    grouped.get(level).push(node)
  })

  const spacingX = 310
  const spacingY = 175
  return nodes.map((node) => {
    const level = levels.get(node.id) || 0
    const row = grouped.get(level) || []
    const index = row.findIndex((item) => item.id === node.id)
    const width = Math.max(0, (row.length - 1) * spacingX)
    return {
      ...node,
      position: {
        x: 480 - width / 2 + index * spacingX,
        y: 50 + level * spacingY,
      },
    }
  })
}

let nextId = 20

export default function ReactFlowCanvasUXTest() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState('3')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [message, setMessage] = useState('Drag nodes, reconnect wires, add steps, or join several parents into one node.')
  const [flowInstance, setFlowInstance] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [running, setRunning] = useState(false)
  const [runnerIndex, setRunnerIndex] = useState(0)
  const historyRef = useRef([])
  const futureRef = useRef([])
  const [historyVersion, setHistoryVersion] = useState(0)

  const remember = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-29), {
      nodes: nodes.map((node) => ({ ...node, data: { ...node.data } })),
      edges: edges.map((edge) => ({ ...edge })),
    }]
    futureRef.current = []
    setHistoryVersion((value) => value + 1)
  }, [nodes, edges])

  const undo = useCallback(() => {
    const snapshot = historyRef.current.pop()
    if (!snapshot) return
    futureRef.current.push({ nodes, edges })
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setSelectedId('')
    setSelectedEdgeId('')
    setHistoryVersion((value) => value + 1)
    setMessage('Undo applied.')
  }, [nodes, edges, setNodes, setEdges])

  const redo = useCallback(() => {
    const snapshot = futureRef.current.pop()
    if (!snapshot) return
    historyRef.current.push({ nodes, edges })
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setSelectedId('')
    setSelectedEdgeId('')
    setHistoryVersion((value) => value + 1)
    setMessage('Redo applied.')
  }, [nodes, edges, setNodes, setEdges])

  const addNode = useCallback((sourceId = null, position = null, template = null) => {
    remember()
    const id = String(nextId++)
    const source = sourceId ? nodes.find((node) => node.id === sourceId) : null
    const nextPosition = position || {
      x: source ? source.position.x + 20 : 470,
      y: source ? source.position.y + 175 : 260,
    }
    const nodeTemplate = template || palette[0]
    const newNode = {
      id,
      type: 'workflow',
      position: nextPosition,
      data: {
        title: sourceId ? `New ${nodeTemplate.title.toLowerCase()} step` : nodeTemplate.title,
        subtitle: nodeTemplate.subtitle,
        tone: nodeTemplate.tone,
        icon: nodeTemplate.icon,
      },
    }
    setNodes((currentNodes) => [...currentNodes, newNode])
    if (sourceId) {
      setEdges((currentEdges) => addEdge({
        id: `e${sourceId}-${id}-${Date.now()}`,
        source: sourceId,
        target: id,
        ...edgeDefaults,
      }, currentEdges))
    }
    setSelectedId(id)
    setSelectedEdgeId('')
    setMessage('New step added. Move it anywhere; the animated connector follows live.')
    return id
  }, [nodes, remember, setNodes, setEdges])

  const duplicateNode = useCallback((id) => {
    const source = nodes.find((node) => node.id === id)
    if (!source) return
    remember()
    const newId = String(nextId++)
    setNodes((currentNodes) => [...currentNodes, {
      ...source,
      id: newId,
      position: { x: source.position.x + 36, y: source.position.y + 100 },
      selected: false,
      data: { ...source.data, title: `${source.data.title} copy` },
    }])
    setSelectedId(newId)
    setSelectedEdgeId('')
    setMessage('Node duplicated.')
  }, [nodes, remember, setNodes])

  const disconnectChildren = useCallback((sourceId) => {
    const outgoing = edges.filter((edge) => edge.source === sourceId)
    if (!outgoing.length) return
    remember()
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== sourceId))
    setMessage(`Disconnected ${outgoing.length} child connection${outgoing.length === 1 ? '' : 's'}. Nodes were kept.`)
  }, [edges, remember, setEdges])

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), [])

  const runOrder = useMemo(() => topologicalOrder(nodes, edges), [nodes, edges])
  const activeRunnerNode = running ? runOrder[runnerIndex] || '' : ''

  useEffect(() => {
    if (!running) return undefined
    if (!runOrder.length) {
      setRunning(false)
      return undefined
    }
    if (runnerIndex >= runOrder.length) {
      setRunning(false)
      setRunnerIndex(0)
      setMessage('Workflow runner finished.')
      return undefined
    }
    const timer = setTimeout(() => setRunnerIndex((index) => index + 1), 650)
    return () => clearTimeout(timer)
  }, [running, runnerIndex, runOrder])

  const nodesWithActions = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onQuickAdd: addNode,
        onDisconnectChildren: disconnectChildren,
        onDuplicate: duplicateNode,
        hasChildren: edges.some((edge) => edge.source === node.id),
        running: node.id === activeRunnerNode,
      },
      selected: node.id === selectedId,
    })),
    [nodes, edges, addNode, disconnectChildren, duplicateNode, activeRunnerNode, selectedId],
  )

  const edgesWithState = useMemo(
    () => edges.map((edge) => ({
      ...edge,
      animated: true,
      className: `rfux-running-edge ${edge.id === selectedEdgeId ? 'is-selected' : ''}`,
    })),
    [edges, selectedEdgeId],
  )

  const validConnection = useCallback((connection) => {
    if (!connection.source || !connection.target) return false
    if (connection.source === connection.target) return false
    return !edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
  }, [edges])

  const onConnect = useCallback((connection) => {
    if (!validConnection(connection)) return
    remember()
    setEdges((currentEdges) => addEdge({
      ...connection,
      id: `e${connection.source}-${connection.target}-${Date.now()}`,
      ...edgeDefaults,
    }, currentEdges))
    setMessage('Connected. A node may have two, three, or more parent connections.')
  }, [remember, setEdges, validConnection])

  const onReconnect = useCallback((oldEdge, newConnection) => {
    if (!validConnection({ ...newConnection, source: newConnection.source, target: newConnection.target })) return
    remember()
    setEdges((currentEdges) => reconnectEdge(oldEdge, newConnection, currentEdges))
    setMessage('Connection endpoint moved.')
  }, [remember, setEdges, validConnection])

  const deleteSelected = useCallback(() => {
    if (!selectedId && !selectedEdgeId) return
    remember()
    if (selectedEdgeId) {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdgeId))
      setSelectedEdgeId('')
      setMessage('Connection removed.')
      return
    }
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedId))
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== selectedId && edge.target !== selectedId))
    setSelectedId('')
    setMessage('Selected node removed.')
  }, [selectedId, selectedEdgeId, remember, setNodes, setEdges])

  const applyAutoLayout = useCallback(() => {
    remember()
    setNodes((currentNodes) => autoLayoutNodes(currentNodes, edges))
    setTimeout(() => flowInstance?.fitView({ padding: 0.2, duration: 350 }), 20)
    setMessage('Automatic layered layout applied.')
  }, [remember, setNodes, edges, flowInstance])

  const startRunner = useCallback(() => {
    setRunnerIndex(0)
    setRunning(true)
    setMessage('Runner started. Nodes are highlighted in execution order.')
  }, [])

  const stopRunner = useCallback(() => {
    setRunning(false)
    setRunnerIndex(0)
    setMessage('Runner stopped.')
  }, [])

  const onPaletteDragStart = (event, item) => {
    event.dataTransfer.setData('application/reactflow-template', JSON.stringify(item))
    event.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = useCallback((event) => {
    event.preventDefault()
    if (!flowInstance) return
    const raw = event.dataTransfer.getData('application/reactflow-template')
    if (!raw) return
    try {
      const template = JSON.parse(raw)
      const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNode(null, position, template)
      setPaletteOpen(false)
    } catch {
      setMessage('Could not add that palette item.')
    }
  }, [flowInstance, addNode])

  return (
    <div className={`rfux-page ${dark ? 'rfux-page--dark' : ''}`} data-history-version={historyVersion}>
      <div className="rfux-header">
        <div>
          <span className="rfux-kicker">Canvas UX prototype</span>
          <h2>React Flow workflow editor test</h2>
          <p>Isolated canvas only — no OneEngine workflow data or runtime actions.</p>
        </div>
        <div className="rfux-header-actions">
          <button type="button" onClick={() => setPaletteOpen((open) => !open)}><Plus size={16}/> Add node</button>
          <button type="button" onClick={deleteSelected} disabled={!selectedId && !selectedEdgeId}><Trash2 size={16}/> Delete</button>
        </div>
      </div>

      <div className="rfux-canvas-shell">
        <div className="rfux-floating-toolbar" aria-label="Workflow canvas toolbar">
          <button type="button" className={running ? 'is-running' : 'is-active'} title={running ? 'Stop runner' : 'Run workflow'} onClick={running ? stopRunner : startRunner}>
            <Play size={15}/>
          </button>
          <span />
          <button type="button" onClick={undo} title="Undo" disabled={!historyRef.current.length}><Undo2 size={15}/></button>
          <button type="button" onClick={redo} title="Redo" disabled={!futureRef.current.length}><Redo2 size={15}/></button>
          <span />
          <button type="button" onClick={() => setPaletteOpen((open) => !open)} title="Add node"><Plus size={15}/></button>
          <button type="button" title="Auto layout" onClick={applyAutoLayout}><WandSparkles size={15}/></button>
          <button type="button" title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark((value) => !value)}>
            {dark ? <Sun size={15}/> : <Moon size={15}/>}
          </button>
        </div>

        {paletteOpen && (
          <div className="rfux-palette" aria-label="Node palette">
            <div className="rfux-palette-heading">
              <strong>Drag to canvas</strong>
              <span>or click to add</span>
            </div>
            {palette.map((item) => {
              const Icon = icons[item.icon] || Sparkles
              return (
                <button
                  key={item.title}
                  type="button"
                  draggable
                  onDragStart={(event) => onPaletteDragStart(event, item)}
                  onClick={() => addNode(null, null, item)}
                >
                  <span className={`rfux-palette-icon rfux-palette-icon--${item.tone}`}><Icon size={14}/></span>
                  <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
                </button>
              )
            })}
          </div>
        )}

        <ReactFlow
          nodes={nodesWithActions}
          edges={edgesWithState}
          nodeTypes={nodeTypes}
          onInit={setFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onNodeDragStart={remember}
          onNodeClick={(_, node) => {
            setSelectedId(node.id)
            setSelectedEdgeId('')
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id)
            setSelectedId('')
          }}
          onPaneClick={() => {
            setSelectedId('')
            setSelectedEdgeId('')
          }}
          onConnectEnd={(event, connectionState) => {
            if (connectionState?.isValid || !connectionState?.fromNode?.id || !flowInstance) return
            const point = 'changedTouches' in event && event.changedTouches?.length ? event.changedTouches[0] : event
            if (!Number.isFinite(point?.clientX) || !Number.isFinite(point?.clientY)) return
            const position = flowInstance.screenToFlowPosition({ x: point.clientX, y: point.clientY })
            addNode(connectionState.fromNode.id, position)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={onDrop}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2.5}
          connectionMode={ConnectionMode.Loose}
          isValidConnection={validConnection}
          edgesReconnectable
          nodesConnectable
          nodesDraggable
          elementsSelectable
          selectionOnDrag
          panOnScroll
          zoomOnScroll
          zoomOnPinch
          defaultEdgeOptions={edgeDefaults}
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

        <div className="rfux-capability-badges" aria-label="Prototype capabilities">
          <span>Animated edges</span>
          <span>Multi-parent</span>
          <span>Reconnect</span>
          <span>Drop-to-create</span>
        </div>
      </div>
    </div>
  )
}
