import { useMemo, useState } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Copy,
  Eye, LayoutPanelLeft, MoreHorizontal, Play, Plus, Redo2, Save, Search,
  Settings2, Sparkles, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut,
} from 'lucide-react'
import './GPTBuilderPage.css'

const FLOW_CATEGORIES = [
  { key: 'frequent', label: 'Frequently Used' },
  { key: 'triggered', label: 'Triggered' },
  { key: 'screens', label: 'Screens' },
  { key: 'autolaunched', label: 'Autolaunched Automations' },
]

const FLOW_TYPES = [
  { key: 'record', category: 'triggered', featured: true, label: 'Record-Triggered Flow', description: 'Launches when a record is created, updated, or deleted.', icon: Zap, tone: 'purple', startNeedsConfiguration: true },
  { key: 'screen', category: 'screens', featured: true, label: 'Screen Flow', description: 'Guides users through screens that collect or display information.', icon: LayoutPanelLeft, tone: 'blue', startNeedsConfiguration: false },
  { key: 'autolaunched', category: 'autolaunched', featured: true, label: 'Autolaunched Flow (No Trigger)', description: 'Runs in the background when another process invokes it.', icon: Workflow, tone: 'green', startNeedsConfiguration: false },
  { key: 'schedule', category: 'triggered', featured: false, label: 'Schedule-Triggered Flow', description: 'Runs in the background at a specified time and frequency.', icon: Play, tone: 'orange', startNeedsConfiguration: true },
  { key: 'platform_event', category: 'triggered', featured: false, label: 'Platform Event-Triggered Flow', description: 'Runs when a platform event message is received.', icon: Sparkles, tone: 'cyan', startNeedsConfiguration: true },
]

function NewAutomation({ onCreate, onClose }) {
  const [step, setStep] = useState('source')
  const [source, setSource] = useState('scratch')
  const [category, setCategory] = useState('frequent')
  const [selected, setSelected] = useState('record')
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return FLOW_TYPES.filter((flow) => {
      const inCategory = category === 'frequent' ? flow.featured : flow.category === category
      return inCategory && (!needle || `${flow.label} ${flow.description}`.toLowerCase().includes(needle))
    })
  }, [category, search])

  if (step === 'source') return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation" role="dialog" aria-modal="true" aria-labelledby="gptb-new-title">
      <header className="gptb-new-head"><div><h2 id="gptb-new-title">New Automation</h2><p>How do you want to start?</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-source-grid">
        <button className={`gptb-source-card ${source === 'scratch' ? 'is-selected' : ''}`} onClick={() => setSource('scratch')}><span className="gptb-source-icon"><Plus size={21}/></span><strong>Start From Scratch</strong><span>Build a new automation from an empty canvas.</span><i>{source === 'scratch' ? '✓' : ''}</i></button>
        <button className={`gptb-source-card ${source === 'template' ? 'is-selected' : ''}`} onClick={() => setSource('template')}><span className="gptb-source-icon"><Copy size={20}/></span><strong>Use a Template</strong><span>Start from a reusable automation template.</span><i>{source === 'template' ? '✓' : ''}</i></button>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" onClick={() => setStep(source === 'scratch' ? 'type' : 'template')}>Next</button></footer>
    </section>
  </div>

  if (step === 'template') return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-template-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-template-title">
      <header className="gptb-new-head"><div><h2 id="gptb-template-title">New Automation</h2><p>Use a Template</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-template-body"><label className="gptb-modal-search"><Search size={15}/><input aria-label="Search templates" placeholder="Search templates"/></label><div className="gptb-empty-template"><Copy size={30}/><strong>No templates available</strong><span>GPT Builder does not have any published templates yet.</span></div></div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button></footer>
    </section>
  </div>

  return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-type-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-type-title">
      <header className="gptb-new-head"><div><h2 id="gptb-type-title">New Automation</h2><p>Start From Scratch</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-type-layout">
        <aside className="gptb-type-categories">{FLOW_CATEGORIES.map((item) => <button key={item.key} className={category === item.key ? 'is-active' : ''} onClick={() => { setCategory(item.key); setSearch('') }}><span>{item.label}</span><ChevronRight size={14}/></button>)}</aside>
        <div className="gptb-type-content">
          <label className="gptb-modal-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search automation types" placeholder="Search automation types"/></label>
          <div className="gptb-type-grid">{rows.length ? rows.map((flow) => { const Icon = flow.icon; return <button key={flow.key} className={`gptb-type-card ${selected === flow.key ? 'is-selected' : ''}`} onClick={() => setSelected(flow.key)}><span className={`gptb-type-icon is-${flow.tone}`}><Icon size={21}/></span><span><strong>{flow.label}</strong><small>{flow.description}</small></span><i>{selected === flow.key ? '✓' : ''}</i></button> }) : <div className="gptb-no-results">No automation types match your search.</div>}</div>
        </div>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" onClick={() => onCreate(FLOW_TYPES.find((flow) => flow.key === selected))}>Create</button></footer>
    </section>
  </div>
}

function Toolbox({ layout, onClose }) {
  const [tab, setTab] = useState(layout === 'free' ? 'elements' : 'manager')
  const effectiveTab = layout === 'auto' ? 'manager' : tab
  return <aside className="gptb-toolbox" aria-label="Toolbox">
    <div className="gptb-toolbox-tabs">{layout === 'free' ? <button className={effectiveTab === 'elements' ? 'is-active' : ''} onClick={() => setTab('elements')}>Elements</button> : null}<button className={effectiveTab === 'manager' ? 'is-active' : ''} onClick={() => setTab('manager')}>Manager</button><button className="gptb-toolbox-close" aria-label="Close toolbox" onClick={onClose}><X size={15}/></button></div>
    <div className="gptb-toolbox-placeholder">{effectiveTab === 'elements' ? <><Search size={18}/><strong>Elements</strong><span>Element discovery is built in the next parity phase.</span></> : <><Workflow size={18}/><strong>Manager</strong><span>Resources and flow contents are built in the Manager phase.</span></>}</div>
  </aside>
}

function FlowShell({ flow, onNew }) {
  const [layout, setLayout] = useState('auto')
  const [toolboxOpen, setToolboxOpen] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [layoutOpen, setLayoutOpen] = useState(false)
  return <section className="gptb-builder" aria-label="GPT Builder workspace">
    <header className="gptb-buttonbar">
      <div className="gptb-brand"><span className="gptb-brand-icon"><Workflow size={19}/></span><span><strong>Flow Builder</strong><small>{flow.label}</small></span></div>
      <div className="gptb-status"><span className="gptb-status-dot"/>Inactive <i>·</i> Never saved</div>
      <div className="gptb-toolbar" role="toolbar" aria-label="Flow Builder controls">
        <button className={toolboxOpen ? 'is-on' : ''} aria-label={toolboxOpen ? 'Hide Toolbox' : 'Show Toolbox'} onClick={() => setToolboxOpen((value) => !value)}><LayoutPanelLeft size={16}/></button>
        <button className={selecting ? 'is-on' : ''} aria-label="Select Elements" onClick={() => setSelecting((value) => !value)}><Copy size={16}/></button>
        <span className="gptb-toolbar-separator"/>
        <button aria-label="Undo" disabled><Undo2 size={16}/></button><button aria-label="Redo" disabled><Redo2 size={16}/></button><button aria-label="Errors and Warnings" disabled><AlertTriangle size={16}/></button><button aria-label="View Properties" disabled><Settings2 size={16}/></button>
        <div className="gptb-layout-picker"><button className="gptb-layout-button" aria-haspopup="menu" aria-expanded={layoutOpen} onClick={() => setLayoutOpen((value) => !value)}>{layout === 'auto' ? 'Auto-Layout' : 'Free-Form'} <ChevronDown size={13}/></button>{layoutOpen ? <div className="gptb-layout-menu" role="menu"><button role="menuitemradio" aria-checked={layout === 'auto'} onClick={() => { setLayout('auto'); setLayoutOpen(false) }}><span>{layout === 'auto' ? '✓' : ''}</span>Auto-Layout</button><button role="menuitemradio" aria-checked={layout === 'free'} onClick={() => { setLayout('free'); setLayoutOpen(false); setToolboxOpen(true) }}><span>{layout === 'free' ? '✓' : ''}</span>Free-Form</button></div> : null}</div>
        <span className="gptb-toolbar-separator"/>
        <button className="gptb-text-tool" disabled><Play size={14}/> Run</button><button className="gptb-text-tool" disabled><Eye size={14}/> Debug</button><button className="gptb-text-tool" disabled><Save size={14}/> Save</button><button className="gptb-text-tool is-brand" disabled>Activate</button><button aria-label="More actions"><MoreHorizontal size={16}/></button>
      </div>
    </header>
    <div className={`gptb-workspace ${toolboxOpen ? 'has-toolbox' : ''}`}>
      {toolboxOpen ? <Toolbox key={layout} layout={layout} onClose={() => setToolboxOpen(false)}/> : null}
      <main className="gptb-canvas" aria-label="Flow canvas">
        <div className="gptb-canvas-stage" style={{ transform: `scale(${zoom / 100})` }}>{layout === 'auto' ? <>
          <button className={`gptb-start-card ${flow.startNeedsConfiguration ? 'needs-config' : ''}`} aria-label="Start"><span className="gptb-start-dot"/><span><strong>Start</strong><small>{flow.startNeedsConfiguration ? 'Configure Start' : flow.label}</small></span><ChevronRight size={14}/></button><div className="gptb-connector"/><button className="gptb-add-node" aria-label="Add element"><Plus size={15}/></button><div className="gptb-connector"/><div className="gptb-end-node"><span>■</span><strong>End</strong></div>
        </> : <><button className="gptb-free-start"><span className="gptb-start-dot"/><strong>Start</strong></button><div className="gptb-free-hint">Drag elements from the Elements tab and connect them on the canvas.</div></>}</div>
        <div className="gptb-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(50, value - 10))} disabled={zoom <= 50}><ZoomOut size={15}/></button><button className="gptb-zoom-value" aria-label="Reset zoom" onClick={() => setZoom(100)}>{zoom}%</button><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150}><ZoomIn size={15}/></button></div>
        <div className="gptb-canvas-help"><CircleHelp size={14}/><span>{layout === 'auto' ? 'Auto-Layout keeps the flow arranged and connected automatically.' : 'Free-Form lets you position and connect elements manually.'}</span></div>
      </main>
    </div>
    <button className="gptb-new-flow-link" onClick={onNew}>New Automation</button>
  </section>
}

export default function GPTBuilderPage() {
  const [newOpen, setNewOpen] = useState(true)
  const [flow, setFlow] = useState(null)
  return <section className="gptb-root" aria-label="GPT Builder">{flow ? <FlowShell flow={flow} onNew={() => setNewOpen(true)}/> : <main className="gptb-empty-home"><span className="gptb-empty-logo"><Workflow size={28}/></span><h1>GPT Builder</h1><p>Create a Salesforce-style automation in the isolated GPT Builder workspace.</p><button className="gptb-button is-brand" onClick={() => setNewOpen(true)}><Plus size={15}/> New Automation</button></main>}{newOpen ? <NewAutomation onCreate={(definition) => { setFlow(definition); setNewOpen(false) }} onClose={() => setNewOpen(false)}/> : null}</section>
}
