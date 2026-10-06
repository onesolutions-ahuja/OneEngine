import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Search } from 'lucide-react'
import { apiRequest } from '../../../services/api'

const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)

const FUNCTIONS = [
  { name: 'AND', category: 'Logical', insert: 'AND(, )' },
  { name: 'OR', category: 'Logical', insert: 'OR(, )' },
  { name: 'NOT', category: 'Logical', insert: 'NOT()' },
  { name: 'ISNEW', category: 'Logical', insert: 'ISNEW()' },
  { name: 'ISCHANGED', category: 'Logical', insert: 'ISCHANGED()' },
  { name: 'PRIORVALUE', category: 'Logical', insert: 'PRIORVALUE()' },
  { name: 'ISBLANK', category: 'Logical', insert: 'ISBLANK()' },
  { name: 'ISPICKVAL', category: 'Text', insert: 'ISPICKVAL(, "")' },
  { name: 'TEXT', category: 'Text', insert: 'TEXT()' },
  { name: 'BEGINS', category: 'Text', insert: 'BEGINS(, "")' },
  { name: 'CONTAINS', category: 'Text', insert: 'CONTAINS(, "")' },
]
const OPERATORS = ['+', '-', '*', '/', '=', '<>', '<', '>', '<=', '>=', '&']

export function basicFormulaCheck(value) {
  const text = String(value || '').trim()
  if (!text) return 'Enter a formula.'
  let paren = 0
  let quote = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && text[i - 1] !== '\\') quote = !quote
    if (quote) continue
    if (char === '(') paren += 1
    if (char === ')') paren -= 1
    if (paren < 0) return 'Check the formula for an unmatched closing parenthesis.'
  }
  if (quote) return 'Check the formula for an unmatched quotation mark.'
  if (paren !== 0) return 'Check the formula for unmatched parentheses.'
  const resources = [...text.matchAll(/\{!\$Record\.([A-Za-z_][A-Za-z0-9_]*)\}/g)]
  if (text.includes('{!') && !resources.length && !/\{!\$Record__Prior\./.test(text)) return 'Check the resource references in the formula.'
  return ''
}

export default function GPTBuilderNewFormulaBuilder({ object, value, onChange }) {
  const [fields, setFields] = useState([])
  const [resourceSearch, setResourceSearch] = useState('')
  const [functionSearch, setFunctionSearch] = useState('')
  const [functionCategory, setFunctionCategory] = useState('All Functions')
  const [status, setStatus] = useState(null)
  const editorRef = useRef(null)

  useEffect(() => {
    let live = true
    if (!object?.id) { setFields([]); return () => { live = false } }
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response) => { if (live) setFields((Array.isArray(response?.data) ? response.data : []).filter((field) => field?.active !== false && field?.readable !== false)) })
      .catch(() => { if (live) setFields([]) })
    return () => { live = false }
  }, [object?.id])

  const insert = (text) => {
    const area = editorRef.current
    const current = String(value || '')
    if (!area) { onChange(current + text); return }
    const start = area.selectionStart ?? current.length
    const end = area.selectionEnd ?? start
    const next = current.slice(0, start) + text + current.slice(end)
    onChange(next)
    setStatus(null)
    requestAnimationFrame(() => {
      area.focus()
      const caret = start + text.length
      area.setSelectionRange(caret, caret)
    })
  }

  const resources = useMemo(() => fields.filter((field) => {
    const needle = resourceSearch.trim().toLowerCase()
    return !needle || `${fieldLabel(field)} ${fieldKey(field)}`.toLowerCase().includes(needle)
  }), [fields, resourceSearch])

  const functions = useMemo(() => FUNCTIONS.filter((item) => {
    const inCategory = functionCategory === 'All Functions' || item.category === functionCategory
    const needle = functionSearch.trim().toLowerCase()
    return inCategory && (!needle || item.name.toLowerCase().includes(needle))
  }), [functionCategory, functionSearch])

  return <div className="gptb-formula-builder">
    <div className="gptb-formula-tools">
      <details>
        <summary>Insert a Resource <ChevronDown size={12}/></summary>
        <div className="gptb-formula-menu">
          <label><Search size={12}/><input value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder="Search resources"/></label>
          <button type="button" onClick={() => insert('{!$Record.Id}')}>Current Record &gt; Record ID</button>
          {resources.map((field) => <button type="button" key={fieldKey(field)} onClick={() => insert(`{!$Record.${fieldKey(field)}}`)}>{fieldLabel(field)} <small>{fieldKey(field)}</small></button>)}
        </div>
      </details>
      <details>
        <summary>Insert a Function <ChevronDown size={12}/></summary>
        <div className="gptb-formula-menu is-functions">
          <select value={functionCategory} onChange={(event) => setFunctionCategory(event.target.value)}><option>All Functions</option><option>Logical</option><option>Text</option></select>
          <label><Search size={12}/><input value={functionSearch} onChange={(event) => setFunctionSearch(event.target.value)} placeholder="Search functions"/></label>
          {functions.map((item) => <button type="button" key={item.name} onClick={() => insert(item.insert)}>{item.name}</button>)}
        </div>
      </details>
      <label className="gptb-formula-operator">Operator<select value="" onChange={(event) => { if (event.target.value) insert(` ${event.target.value} `) }}><option value="">Select</option>{OPERATORS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}</select></label>
    </div>
    <textarea ref={editorRef} rows={6} value={value || ''} onChange={(event) => { onChange(event.target.value); setStatus(null) }} aria-label="Formula"/>
    <div className="gptb-formula-footer"><button type="button" className="gptb-button" onClick={() => { const error = basicFormulaCheck(value); setStatus(error ? { error } : { success: 'Formula syntax is valid.' }) }}>Check Syntax</button>{status?.error ? <span className="is-error">{status.error}</span> : status?.success ? <span className="is-success"><CheckCircle2 size={12}/>{status.success}</span> : null}</div>
  </div>
}
