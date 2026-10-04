import React from 'react'
import {
  ArrowUpDown, Boxes, CircleHelp, Clock3, Copy, Database, Filter, GitBranch,
  LayoutPanelLeft, ListChecks, Pencil, Plus, Repeat2, Search, Shuffle,
  Trash2, TriangleAlert, Workflow, X, Zap,
} from 'lucide-react'

export const ELEMENT_CATEGORIES = [
  { key: 'interaction', label: 'Interaction' },
  { key: 'logic', label: 'Logic' },
  { key: 'data', label: 'Data' },
]

export const ELEMENTS = [
  { key: 'action', label: 'Action', category: 'interaction', icon: Zap, description: 'Run an available action, such as a communication, approval, or external integration.' },
  { key: 'screen', label: 'Screen', category: 'interaction', icon: LayoutPanelLeft, description: 'Display information to users or collect information from them.' },
  { key: 'subflow', label: 'Subflow', category: 'interaction', icon: Workflow, description: 'Run another active flow and pass values between the parent flow and subflow.' },

  { key: 'assignment', label: 'Assignment', category: 'logic', icon: ListChecks, description: 'Set or change values in variables and other flow resources.' },
  { key: 'decision', label: 'Decision', category: 'logic', icon: GitBranch, description: 'Evaluate conditions and route the flow through different outcome paths.' },
  { key: 'loop', label: 'Loop', category: 'logic', icon: Repeat2, description: 'Iterate over the items in a collection and run a path for each item.' },
  { key: 'collection_filter', label: 'Collection Filter', category: 'logic', icon: Filter, description: 'Create a new collection containing only items that meet the filter criteria.' },
  { key: 'collection_sort', label: 'Collection Sort', category: 'logic', icon: ArrowUpDown, description: 'Reorder a collection and optionally limit the items that remain.' },
  { key: 'transform', label: 'Transform', category: 'logic', icon: Shuffle, description: 'Map and transform source flow data into a new target data structure.' },
  { key: 'wait_duration', label: 'Wait for Amount of Time', category: 'logic', icon: Clock3, description: 'Resume a flow interview after a specific amount of time.' },
  { key: 'wait_conditions', label: 'Wait for Conditions', category: 'logic', icon: Clock3, description: 'Resume a flow interview after specific conditions are met.' },
  { key: 'wait_until_date', label: 'Wait Until Date', category: 'logic', icon: Clock3, description: 'Resume a flow interview at a specific date and time.' },
  { key: 'custom_error', label: 'Custom Error', category: 'logic', icon: TriangleAlert, description: 'Stop a record-triggered transaction and show a targeted error message.' },
  { key: 'group', label: 'Group', category: 'logic', icon: Boxes, description: 'Organize related auto-layout elements inside a named collapsible group.' },

  { key: 'get_records', label: 'Get Records', category: 'data', icon: Search, description: 'Find records that meet criteria and store their values for later use.' },
  { key: 'create_records', label: 'Create Records', category: 'data', icon: Plus, description: 'Create one or more records from values or record resources.' },
  { key: 'update_records', label: 'Update Records', category: 'data', icon: Pencil, description: 'Find records to update and set their field values.' },
  { key: 'delete_records', label: 'Delete Records', category: 'data', icon: Trash2, description: 'Find and permanently delete records.' },
]

export function elementByKey(key) {
  return ELEMENTS.find((element) => element.key === key) || null
}

export function getAvailableElements({ flowType, startConfig = {}, layout = 'auto' }) {
  const fastRecord = flowType === 'record' && startConfig.optimize === 'fast'
  return ELEMENTS.filter((element) => {
    if (element.key === 'screen') return flowType === 'screen'
    if (element.key === 'custom_error') return flowType === 'record'
    if (element.key === 'group') return layout === 'auto'
    if (element.key === 'transform') return ['record', 'screen', 'autolaunched'].includes(flowType)
    if (['wait_duration', 'wait_conditions', 'wait_until_date'].includes(element.key)) {
      return ['autolaunched', 'schedule', 'platform_event'].includes(flowType)
    }

    if (fastRecord) {
      // Current Salesforce before-save guidance and examples expose the
      // in-transaction logic/data operations that don't launch external work.
      return ['assignment', 'decision', 'get_records', 'loop'].includes(element.key)
    }

    return true
  })
}

function ElementInfo({ element }) {
  return <span className="gptb-element-info" tabIndex={0} aria-label={`About ${element.label}`}>
    <CircleHelp size={13}/>
    <span className="gptb-element-tooltip" role="tooltip">{element.description}</span>
  </span>
}

function ElementRow({ element, draggable = false, onSelect }) {
  const Icon = element.icon
  return <div
    className={`gptb-element-row ${draggable ? 'is-draggable' : ''}`}
    draggable={draggable}
    onDragStart={draggable ? (event) => {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData('application/x-gptbuilder-element', element.key)
      event.dataTransfer.setData('text/plain', element.label)
    } : undefined}
  >
    <button type="button" className="gptb-element-main" onClick={draggable ? undefined : () => onSelect?.(element)}>
      <span className={`gptb-element-icon is-${element.category}`}><Icon size={16}/></span>
      <span><strong>{element.label}</strong></span>
    </button>
    <ElementInfo element={element}/>
  </div>
}

function ElementSections({ elements, query, draggable, onSelect }) {
  const needle = query.trim().toLowerCase()
  const filtered = elements.filter((element) => !needle || `${element.label} ${element.description}`.toLowerCase().includes(needle))
  if (!filtered.length) return <div className="gptb-elements-empty"><Search size={20}/><strong>No matching elements</strong><span>Try a different search term.</span></div>

  return <div className="gptb-element-sections">
    {ELEMENT_CATEGORIES.map((category) => {
      const rows = filtered.filter((element) => element.category === category.key)
      if (!rows.length) return null
      return <section key={category.key} className="gptb-element-section">
        <h4>{category.label}</h4>
        <div>{rows.map((element) => <ElementRow key={element.key} element={element} draggable={draggable} onSelect={onSelect}/>)}</div>
      </section>
    })}
  </div>
}

export function ElementPicker({ flowType, startConfig, onSelect, onClose, hasExistingElements = false, copiedCount = 0, onPaste, onConnect }) {
  const [query, setQuery] = React.useState('')
  const elements = getAvailableElements({ flowType, startConfig, layout: 'auto' })
  return <section className="gptb-element-picker" role="dialog" aria-label="Add Element">
    <header><strong>Add Element</strong><button type="button" aria-label="Close Add Element" onClick={onClose}><X size={15}/></button></header>
    <label className="gptb-element-search"><Search size={14}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search elements..."/></label>
    {copiedCount ? <button type="button" className="gptb-paste-elements" onClick={onPaste}><Copy size={13}/> Paste {copiedCount} Element{copiedCount === 1 ? '' : 's'}</button> : null}
    <div className="gptb-element-picker-body"><ElementSections elements={elements} query={query} draggable={false} onSelect={onSelect}/></div>
    <footer>
      <button type="button" disabled={!hasExistingElements} title={hasExistingElements ? 'Connect this path to an existing element' : 'No existing elements are available to connect'} onClick={onConnect}><GitBranch size={13}/> Connect to element</button>
      <button type="button" onClick={() => onSelect?.({ key: 'end', label: 'End', category: 'logic', icon: Workflow, description: 'End this flow path.' })}><span className="gptb-end-symbol">■</span> End</button>
    </footer>
  </section>
}

export function FreeFormElements({ flowType, startConfig }) {
  const [query, setQuery] = React.useState('')
  const elements = getAvailableElements({ flowType, startConfig, layout: 'free' })
  return <div className="gptb-free-elements" aria-label="Elements">
    <label className="gptb-element-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search elements..."/></label>
    <p>Drag an element onto the canvas.</p>
    <ElementSections elements={elements} query={query} draggable/>
  </div>
}

export function PendingElementCard({ elementKey, instance = null, free = false, position = null, onOpen, selecting = false, selected = false, onSelectToggle, connecting = false, onConnectTarget, onFreeSelect, onFreeMoveStart, onConnectorStart, onConnectorEnd }) {
  const key = instance?.key || elementKey
  const element = elementByKey(key)
  if (!element) return null
  const Icon = element.icon
  const style = free && (position || instance?.position) ? { left: (position || instance.position).x, top: (position || instance.position).y } : undefined
  const label = instance?.label || element.label
  return <button
    type="button"
    className={`gptb-pending-element-card ${free ? 'is-free' : ''} ${selected ? 'is-selected' : ''} ${connecting ? 'is-connect-target' : ''}`}
    style={style}
    aria-label={`${label} element`}
    aria-pressed={selecting ? selected : undefined}
    draggable={free}
    onDragStart={free ? (event) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-gptbuilder-existing', instance?.id || '')
      onFreeMoveStart?.(event)
    } : undefined}
    onClick={!free ? () => {
      if (connecting) { onConnectTarget?.(); return }
      if (selecting) { onSelectToggle?.(); return }
      onOpen?.()
    } : (event) => onFreeSelect?.(event)}
    onDoubleClick={free ? (event) => { event.preventDefault(); onOpen?.() } : undefined}
  >
    {free ? <span className="gptb-free-connector is-input" aria-hidden="true" onPointerUp={(event) => { event.stopPropagation(); onConnectorEnd?.(event) }}/>: null}
    {free ? <span className="gptb-free-connector is-output" aria-hidden="true" onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); onConnectorStart?.(event) }}/>: null}
    {selecting ? <span className="gptb-select-element-node" aria-hidden="true">{selected ? '✓' : '+'}</span> : null}
    <span className={`gptb-element-icon is-${element.category}`}><Icon size={16}/></span>
    <span><strong>{label}</strong><small>{instance?.configured ? element.label : `${element.label} · Not fully configured`}</small></span>
    {instance ? <span className="gptb-card-info" tabIndex={0} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <CircleHelp size={12}/>
      <span role="tooltip"><b>{element.label}</b><small>API Name: {instance.apiName}</small>{instance.description ? <small>{instance.description}</small> : null}</span>
    </span> : null}
  </button>
}

export function PendingElementEditor({ elementKey, onCancel }) {
  const element = elementByKey(elementKey)
  if (!element) return null
  const Icon = element.icon
  if (element.key === 'screen') {
    return <div className="gptb-element-editor-modal-backdrop">
      <section className="gptb-screen-editor-shell" role="dialog" aria-modal="true" aria-label="New Screen">
        <header><div><span className="gptb-element-icon is-interaction"><Icon size={16}/></span><span><strong>New Screen</strong><small>Screen</small></span></div><button className="gptb-icon-button" aria-label="Close New Screen" onClick={onCancel}><X size={16}/></button></header>
        <div className="gptb-element-editor-notice">Screen configuration opens in this separate window. Its complete components and properties are implemented in the Screen phase.</div>
        <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled>Done</button></footer>
      </section>
    </div>
  }
  return <aside className="gptb-element-editor-shell" aria-label={`New ${element.label}`}>
    <header><div><span className={`gptb-element-icon is-${element.category}`}><Icon size={16}/></span><span><strong>{`New ${element.label}`}</strong><small>{element.category === 'data' ? 'Data' : element.category === 'logic' ? 'Logic' : 'Interaction'}</small></span></div><button className="gptb-icon-button" aria-label={`Close New ${element.label}`} onClick={onCancel}><X size={16}/></button></header>
    <div className="gptb-element-editor-notice">Element selection is complete. The full Salesforce property editor for this element is implemented in the next properties phase.</div>
    <footer><button className="gptb-button" onClick={onCancel}>Cancel</button><button className="gptb-button is-brand" disabled>Done</button></footer>
  </aside>
}
