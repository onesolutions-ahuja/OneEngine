import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Plus, Search, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'

export default function GPTBuilderNewAutomation({ flowTypes, onCreate, onClose }) {
  const [step, setStep] = useState('source')
  const [source, setSource] = useState('scratch')
  const [selected, setSelected] = useState(flowTypes.find((flow) => flow.featured)?.key || flowTypes[0]?.key || '')
  const [search, setSearch] = useState('')
  const [viewAll, setViewAll] = useState('')
  const [templates, setTemplates] = useState([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateLoading, setTemplateLoading] = useState(false)

  useEffect(() => {
    if (step !== 'template') return
    let live = true
    setTemplateLoading(true)
    apiRequest('/api/platform/rules')
      .then((response) => {
        if (!live) return
        setTemplates((Array.isArray(response?.data) ? response.data : []).filter((item) => item?.action?.type === 'workflow' && item?.action?.isTemplate === true))
      })
      .catch(() => { if (live) setTemplates([]) })
      .finally(() => { if (live) setTemplateLoading(false) })
    return () => { live = false }
  }, [step])

  const searchedTypes = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return flowTypes.filter((flow) => !needle || `${flow.label} ${flow.description}`.toLowerCase().includes(needle))
  }, [flowTypes, search])

  const sections = useMemo(() => [
    { key: 'frequent', label: 'Frequently Used', rows: searchedTypes.filter((flow) => flow.featured) },
    { key: 'triggered', label: 'Triggered', rows: searchedTypes.filter((flow) => flow.category === 'triggered') },
    { key: 'screens', label: 'Screens', rows: searchedTypes.filter((flow) => flow.category === 'screens') },
    { key: 'autolaunched', label: 'Autolaunched Automations', rows: searchedTypes.filter((flow) => flow.category === 'autolaunched') },
  ].filter((section) => section.rows.length), [searchedTypes])

  const templateRows = useMemo(() => {
    const needle = templateSearch.trim().toLowerCase()
    return templates.filter((template) => !needle || `${template.name || ''} ${template.action?.description || ''} ${template.action?.apiName || ''}`.toLowerCase().includes(needle))
  }, [templates, templateSearch])

  const createFromTemplate = () => {
    const template = templates.find((item) => String(item.id) === String(selectedTemplate))
    if (!template) return
    const definition = flowTypes.find((item) => item.key === template.action?.flowType)
      || flowTypes.find((item) => item.key === 'autolaunched')
      || flowTypes[0]
    if (definition) onCreate({ ...definition, template })
  }

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
      <div className="gptb-template-body">
        <label className="gptb-modal-search"><Search size={15}/><input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} aria-label="Search templates" placeholder="Search templates"/></label>
        {templateLoading ? <div className="gptb-empty-template"><Copy size={30}/><strong>Loading templates…</strong></div>
          : templateRows.length ? <div className="gptb-template-grid">{templateRows.map((template) => <button type="button" key={template.id} className={selectedTemplate === String(template.id) ? 'is-selected' : ''} onClick={() => setSelectedTemplate(String(template.id))}><span className="gptb-source-icon"><Copy size={18}/></span><span><strong>{template.name}</strong><small>{template.action?.description || 'Flow Template'}</small></span><i>{selectedTemplate === String(template.id) ? '✓' : ''}</i></button>)}</div>
          : <div className="gptb-empty-template"><Copy size={30}/><strong>No templates found</strong><span>{templateSearch ? 'Try a different search term.' : 'No flow templates are available.'}</span></div>}
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" disabled={!selectedTemplate} onClick={createFromTemplate}>Create</button></footer>
    </section>
  </div>

  const visibleSections = viewAll ? sections.filter((section) => section.key === viewAll) : sections
  return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-type-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-type-title">
      <header className="gptb-new-head"><div><h2 id="gptb-type-title">New Automation</h2><p>Start From Scratch</p></div><button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button></header>
      <div className="gptb-type-browser">
        {viewAll ? <button type="button" className="gptb-type-back" onClick={() => setViewAll('')}><ChevronLeft size={14}/> All Automation Types</button> : null}
        <label className="gptb-modal-search"><Search size={15}/><input value={search} onChange={(event) => { setSearch(event.target.value); setViewAll('') }} aria-label="Search automation types" placeholder="Search automation types"/></label>
        <div className="gptb-type-sections">{visibleSections.map((section) => {
          const rows = viewAll || search ? section.rows : section.rows.slice(0, section.key === 'frequent' ? 3 : 2)
          return <section key={section.key}><header><h3>{section.label}</h3>{!search && !viewAll && section.rows.length > rows.length ? <button type="button" onClick={() => setViewAll(section.key)}>View All <ChevronRight size={13}/></button> : null}</header><div className="gptb-type-grid">{rows.map((flow) => { const Icon = flow.icon; return <button key={flow.key} className={`gptb-type-card ${selected === flow.key ? 'is-selected' : ''}`} onClick={() => setSelected(flow.key)}><span className={`gptb-type-icon is-${flow.tone}`}><Icon size={21}/></span><span><strong>{flow.label}</strong><small>{flow.description}</small></span><i>{selected === flow.key ? '✓' : ''}</i></button> })}</div></section>
        })}{!visibleSections.length ? <div className="gptb-no-results">No automation types match your search.</div> : null}</div>
      </div>
      <footer className="gptb-new-footer"><button className="gptb-button" onClick={() => setStep('source')}><ChevronLeft size={14}/> Back</button><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button><button className="gptb-button is-brand" onClick={() => onCreate(flowTypes.find((flow) => flow.key === selected))}>Create</button></footer>
    </section>
  </div>
}
