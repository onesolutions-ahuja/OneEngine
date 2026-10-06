import { useEffect, useMemo, useState } from 'react'
import { Copy, Search, X } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const CATEGORY_DEFINITIONS = [
  { key: 'triggered', label: 'Triggered', description: 'Start when a record, platform event, or another supported event occurs.' },
  { key: 'scheduled', label: 'Scheduled', description: 'Run automatically at a specified time and frequency.' },
  { key: 'screen', label: 'Screen', description: 'Guide users through an interactive business process.' },
  { key: 'autolaunched', label: 'Autolaunched', description: 'Run in the background when another process invokes the automation.' },
]

const FREQUENT_ORDER = ['screen', 'record', 'schedule', 'autolaunched']

function matchesCategory(flow, category) {
  if (!category) return true
  if (category === 'scheduled') return flow?.category === 'scheduled'
  if (category === 'screen') return flow?.category === 'screens'
  if (category === 'autolaunched') return flow?.category === 'autolaunched'
  if (category === 'triggered') return flow?.category === 'triggered' && flow?.key !== 'schedule'
  return false
}

export default function GPTBuilderNewAutomation({ flowTypes, onCreate, onClose }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [templates, setTemplates] = useState([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateLoadError, setTemplateLoadError] = useState('')

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    let live = true
    setTemplateLoading(true)
    setTemplateLoadError('')
    apiRequest('/api/platform/rules')
      .then((response) => {
        if (!live) return
        setTemplates((Array.isArray(response?.data) ? response.data : []).filter((item) => item?.action?.type === 'workflow' && item?.action?.isTemplate === true))
      })
      .catch(() => { if (live) { setTemplates([]); setTemplateLoadError('Templates are unavailable right now.') } })
      .finally(() => { if (live) setTemplateLoading(false) })
    return () => { live = false }
  }, [])

  const needle = search.trim().toLowerCase()

  const searchedTypes = useMemo(() => flowTypes.filter((flow) => {
    if (!matchesCategory(flow, category)) return false
    return !needle || `${flow.label} ${flow.description}`.toLowerCase().includes(needle)
  }), [flowTypes, category, needle])

  const frequentTypes = useMemo(() => FREQUENT_ORDER
    .map((key) => flowTypes.find((flow) => flow.key === key))
    .filter(Boolean)
    .filter((flow) => !needle || `${flow.label} ${flow.description}`.toLowerCase().includes(needle)), [flowTypes, needle])

  const templateRows = useMemo(() => templates.filter((template) => {
    const definition = flowTypes.find((flow) => flow.key === template.action?.flowType)
    if (category && (!definition || !matchesCategory(definition, category))) return false
    if (!needle) return true
    return `${template.name || ''} ${template.action?.description || ''} ${template.action?.apiName || ''}`.toLowerCase().includes(needle)
  }), [templates, flowTypes, category, needle])

  const createFromTemplate = (template) => {
    const definition = flowTypes.find((item) => item.key === template.action?.flowType)
      || flowTypes.find((item) => item.key === 'autolaunched')
      || flowTypes[0]
    if (definition) onCreate({ ...definition, templateRule: template })
  }

  const visibleTypes = showAll || category || needle ? searchedTypes : []

  return <div className="gptb-modal-backdrop">
    <section className="gptb-new-automation gptb-type-dialog" role="dialog" aria-modal="true" aria-labelledby="gptb-new-title">
      <header className="gptb-new-head">
        <div><h2 id="gptb-new-title">New Automation</h2></div>
        <button className="gptb-icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button>
      </header>

      <div className="gptb-type-browser">
        <label className="gptb-modal-search">
          <Search size={15}/>
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setShowAll(true) }}
            aria-label="Search automations"
            placeholder="Search automations..."
            autoFocus
          />
        </label>

        <section className="gptb-automation-categories" aria-labelledby="gptb-category-title">
          <header><h3 id="gptb-category-title">Categories</h3>{category ? <button type="button" onClick={() => { setCategory(''); setShowAll(true) }}>View All Automations</button> : null}</header>
          <div className="gptb-source-grid">
            {CATEGORY_DEFINITIONS.map((item) => <button
              type="button"
              key={item.key}
              className={`gptb-source-card ${category === item.key ? 'is-selected' : ''}`}
              aria-pressed={category === item.key}
              onClick={() => { setCategory(item.key); setShowAll(true); setSearch('') }}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>)}
          </div>
        </section>

        {!category && !showAll && !needle ? <section className="gptb-type-sections">
          <section>
            <header><h3>Frequently Used</h3><button type="button" onClick={() => setShowAll(true)}>View All</button></header>
            <div className="gptb-type-grid">
              {frequentTypes.map((flow) => {
                const Icon = flow.icon
                return <button key={flow.key} className="gptb-type-card" onClick={() => onCreate(flow)}>
                  <span className={`gptb-type-icon is-${flow.tone}`}><Icon size={21}/></span>
                  <span><strong>{flow.label}</strong><small>{flow.description}</small></span>
                </button>
              })}
            </div>
          </section>
        </section> : null}

        {visibleTypes.length ? <div className="gptb-type-sections">
          <section>
            <header><h3>{category ? CATEGORY_DEFINITIONS.find((item) => item.key === category)?.label : 'View All Automations'}</h3></header>
            <div className="gptb-type-grid">
              {visibleTypes.map((flow) => {
                const Icon = flow.icon
                return <button key={flow.key} className="gptb-type-card" onClick={() => onCreate(flow)}>
                  <span className={`gptb-type-icon is-${flow.tone}`}><Icon size={21}/></span>
                  <span><strong>{flow.label}</strong><small>{flow.description}</small></span>
                </button>
              })}
            </div>
          </section>
        </div> : null}

        {templateLoading && !frequentTypes.length && !visibleTypes.length ? <div className="gptb-empty-template"><Copy size={24}/><strong>Loading templates…</strong></div>
          : templateRows.length ? <section className="gptb-type-sections">
            <section>
              <header><h3>Templates</h3></header>
              <div className="gptb-template-grid" role="list" aria-label="Flow templates">
                {templateRows.map((template) => <button
                  type="button"
                  role="listitem"
                  key={template.id}
                  onClick={() => createFromTemplate(template)}
                >
                  <span className="gptb-source-icon"><Copy size={18}/></span>
                  <span><strong>{template.name}</strong><small>{template.action?.description || 'Flow Template'}</small></span>
                </button>)}
              </div>
            </section>
          </section> : templateLoadError && !frequentTypes.length && !visibleTypes.length ? <div className="gptb-no-results">{templateLoadError}</div> : null}

        {(showAll || category || needle) && !visibleTypes.length && !templateLoading && !templateRows.length
          ? <div className="gptb-no-results">No automations match your search.</div>
          : null}
      </div>

      <footer className="gptb-new-footer"><span className="gptb-footer-spacer"/><button className="gptb-button" onClick={onClose}>Cancel</button></footer>
    </section>
  </div>
}
