import { useCallback, useMemo, useState } from 'react'
import { Background, Controls, ReactFlow, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Search, Trash2 } from 'lucide-react'
import {
  componentCategories,
  componentCategoryLabel,
  componentIcon,
  createRegisteredComponent,
  normalizeComponent,
  registryForBuilder,
  useComponentRegistry,
} from '../settings/Platform/componentRegistry.js'
import './GPTPageBuilder.css'

function PageComponentNode({ data, selected }) {
  const Icon = componentIcon(data.meta)
  return (
    <div className={`gptpb-node ${selected ? 'is-selected' : ''}`}>
      <div className="gptpb-node-head">
        <span className="gptpb-node-icon"><Icon size={16} /></span>
        <strong>{data.instance.title || data.instance.label || data.meta.label}</strong>
      </div>
      <span className="gptpb-node-kind">{componentCategoryLabel(data.meta.category)} · {data.meta.api}</span>
      <div className="gptpb-node-preview">{data.meta.description || 'Registered component preview'}</div>
    </div>
  )
}

const nodeTypes = { registeredComponent: PageComponentNode }

function propertyEntries(meta) {
  const declared = Array.isArray(meta?.configurable) ? meta.configurable : []
  return declared.map((item) => {
    if (typeof item === 'string') return { key: item, label: item.replaceAll('_', ' '), type: 'text' }
    return {
      key: item.key || item.name || item.path,
      label: item.label || item.title || item.key || item.name || item.path,
      type: item.type || 'text',
      options: item.options || item.values || [],
    }
  }).filter((item) => item.key)
}

export default function GPTPageBuilder() {
  const registry = useComponentRegistry()
  const palette = useMemo(() => registryForBuilder(registry, 'PAGE'), [registry])
  const categories = useMemo(() => componentCategories(palette), [palette])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [selectedId, setSelectedId] = useState('')
  const [instance, setInstance] = useState(null)

  const visible = useMemo(() => palette.filter((raw) => {
    const item = normalizeComponent(raw)
    const q = query.trim().toLowerCase()
    return (category === 'all' || item.category === category)
      && (!q || item.label.toLowerCase().includes(q) || item.key.toLowerCase().includes(q))
  }), [palette, query, category])

  const selected = nodes.find((node) => node.id === selectedId)
  const meta = selected?.data?.meta
  const properties = propertyEntries(meta)

  const addComponent = useCallback((raw, position = { x: 80, y: 80 }) => {
    const metaValue = normalizeComponent(raw)
    const created = createRegisteredComponent(metaValue, 'PAGE')
    const id = created.id
    setNodes((current) => [...current, {
      id,
      type: 'registeredComponent',
      position,
      style: { width: 220, height: 110 },
      data: { meta: metaValue, instance: created },
    }])
    setSelectedId(id)
  }, [setNodes])

  const onDrop = useCallback((event) => {
    event.preventDefault()
    const key = event.dataTransfer.getData('application/oneengine-component')
    const raw = palette.find((item) => normalizeComponent(item).key === key)
    if (!raw || !instance) return
    addComponent(raw, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }, [palette, instance, addComponent])

  const patchInstance = (key, value) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedId) return node
      const nextInstance = { ...node.data.instance }
      if (key === 'label' || key === 'title') nextInstance[key] = value
      else nextInstance.config = { ...(nextInstance.config || {}), [key]: value }
      return { ...node, data: { ...node.data, instance: nextInstance } }
    }))
  }

  const removeSelected = () => {
    setNodes((current) => current.filter((node) => node.id !== selectedId))
    setSelectedId('')
  }

  return (
    <div className="gptpb">
      <header className="gptpb-toolbar">
        <div><strong>GPT Page Builder</strong><span>Canvas UX test · Component Registry driven</span></div>
        <div className="gptpb-count">{palette.length} registered components</div>
      </header>

      <div className="gptpb-workspace">
        <aside className="gptpb-palette">
          <div className="gptpb-pane-title">Components</div>
          <label className="gptpb-search"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components" /></label>
          <div className="gptpb-categories">
            {categories.map((key) => <button type="button" key={key} className={category === key ? 'is-active' : ''} onClick={() => setCategory(key)}>{key === 'all' ? 'All' : componentCategoryLabel(key)}</button>)}
          </div>
          <div className="gptpb-component-list">
            {visible.map((raw) => {
              const item = normalizeComponent(raw)
              const Icon = componentIcon(item)
              return <button
                type="button"
                draggable
                key={item.api}
                className="gptpb-component"
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/oneengine-component', item.key) }}
                onClick={() => addComponent(item, { x: 80 + nodes.length * 18, y: 80 + nodes.length * 18 })}
              >
                <span><Icon size={16}/></span><span><strong>{item.label}</strong><small>{item.api}</small></span>
              </button>
            })}
          </div>
        </aside>

        <main className="gptpb-canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onInit={setInstance}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId('')}
            fitView
            minZoom={0.25}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
          {!nodes.length ? <div className="gptpb-empty"><strong>Drag a registered component here</strong><span>or click a component in the palette</span></div> : null}
        </main>

        <aside className="gptpb-properties">
          <div className="gptpb-pane-title">Properties</div>
          {!selected ? <div className="gptpb-properties-empty">Select a component on the canvas.</div> : <>
            <div className="gptpb-selected-meta"><strong>{meta.label}</strong><span>{meta.api}</span></div>
            <label>Label<input value={selected.data.instance.label || ''} onChange={(e) => patchInstance('label', e.target.value)} /></label>
            <label>Title<input value={selected.data.instance.title || ''} onChange={(e) => patchInstance('title', e.target.value)} /></label>
            {properties.map((property) => <label key={property.key}>{property.label}
              {property.type === 'boolean'
                ? <input type="checkbox" checked={Boolean(selected.data.instance.config?.[property.key])} onChange={(e) => patchInstance(property.key, e.target.checked)} />
                : property.options.length
                  ? <select value={selected.data.instance.config?.[property.key] ?? ''} onChange={(e) => patchInstance(property.key, e.target.value)}><option value="">Default</option>{property.options.map((option) => <option key={String(option.value ?? option)} value={option.value ?? option}>{option.label ?? option}</option>)}</select>
                  : <input value={selected.data.instance.config?.[property.key] ?? ''} onChange={(e) => patchInstance(property.key, e.target.value)} />}
            </label>)}
            {!properties.length ? <p className="gptpb-schema-note">This component has no additional configurable properties registered yet.</p> : null}
            <div className="gptpb-layout-readout">
              <span>X {Math.round(selected.position.x)}</span><span>Y {Math.round(selected.position.y)}</span>
              <span>W {Math.round(Number(selected.measured?.width || selected.style?.width || 0))}</span>
              <span>H {Math.round(Number(selected.measured?.height || selected.style?.height || 0))}</span>
            </div>
            <button type="button" className="gptpb-delete" onClick={removeSelected}><Trash2 size={15}/> Delete component</button>
          </>}
        </aside>
      </div>
    </div>
  )
}
