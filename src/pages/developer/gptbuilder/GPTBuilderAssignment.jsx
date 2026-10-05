import { useEffect, useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'

const uid = () => globalThis.crypto?.randomUUID?.() || `as-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const ASSIGNMENT_DEFAULTS = Object.freeze({ assignments: [] })

export function normalizeAssignmentConfig(config = {}) {
  return { ...ASSIGNMENT_DEFAULTS, ...config, assignments: Array.isArray(config.assignments) ? config.assignments : [] }
}

const resourcePath = (resource) => resource?.path || (resource?.apiName ? 'variables.' + resource.apiName : '')
const isWritable = (resource) => resource?.writable !== false && resource?.providerResource !== true

function resourceType(resource) {
  if (resource?.isCollection) return 'collection'
  return String(resource?.dataType || 'text').toLowerCase()
}

export function assignmentOperators(type) {
  if (type === 'collection') return [
    ['set','Equals'],
    ['append','Add'],
    ['prepend','Add At Start'],
    ['remove_first','Remove First'],
    ['remove_all','Remove All'],
    ['remove_before_first','Remove Before First'],
    ['remove_after_first','Remove After First'],
    ['remove_position','Remove Position'],
    ['remove_uncommon','Remove Uncommon'],
  ]
  if (['number','currency'].includes(type)) return [['set','Equals'],['add','Add'],['subtract','Subtract'],['count','Equals Count']]
  if (type === 'date') return [['set','Equals'],['add','Add'],['subtract','Subtract']]
  if (['text','picklist','multiselect'].includes(type)) return [['set','Equals'],['add','Add'],...(type === 'multiselect' ? [['append','Add Item']] : [])]
  return [['set','Equals']]
}

export function assignmentConfigErrors(config = {}, resources = []) {
  const c = normalizeAssignmentConfig(config)
  const errors = []
  if (!c.assignments.length) errors.push('Add at least one assignment.')
  c.assignments.forEach((row,index) => {
    const resource = resources.find((item) => resourcePath(item) === row.variable)
    if (!row.variable) errors.push(`Assignment ${index + 1}: select a variable.`)
    if (row.variable && !resource) errors.push(`Assignment ${index + 1}: selected variable is unavailable.`)
    const type = resourceType(resource)
    if (row.operator && !assignmentOperators(type).some(([key]) => key === row.operator)) errors.push(`Assignment ${index + 1}: operator isn't valid for this variable type.`)
    if (row.value === '' || row.value == null) errors.push(`Assignment ${index + 1}: enter or select a value.`)
  })
  return errors
}

const configuredValue = (row) => row.valueMode === 'resource' ? { path: row.value } : row.value

export function assignmentRuntimeAction(instance, resources = []) {
  const c = normalizeAssignmentConfig(instance?.config)
  return {
    id: instance.id,
    key: 'ASSIGNMENT',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    assignments: c.assignments.map((row) => {
      const resource = resources.find((item) => resourcePath(item) === row.variable)
      return {
        variable: row.variable,
        variableType: resourceType(resource),
        operator: row.operator || 'set',
        value: configuredValue(row),
      }
    }),
  }
}

export default function GPTBuilderAssignment({ draft, updateConfig, resources, onConfiguredChange }) {
  const config = normalizeAssignmentConfig(draft.config)
  const errors = useMemo(() => assignmentConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])

  const patch = (changes) => updateConfig({ ...config, ...changes })
  const patchRow = (id, changes) => patch({ assignments: config.assignments.map((row) => row.id === id ? { ...row, ...changes } : row) })

  return <div className="gptb-gr gptb-assignment">
    <section><h3>Set Variable Values</h3>
      <p className="gptb-help-text">Assignments run in the order shown.</p>
      <div className="gptb-gr-field-assignments">
        {config.assignments.map((row,index) => {
          const resource = resources.find((item) => resourcePath(item) === row.variable)
          const type = resourceType(resource)
          return <div key={row.id}>
            <span>{index + 1}</span>
            <select value={row.variable || ''} onChange={(event) => {
              const variable = event.target.value
              const selected = resources.find((item) => resourcePath(item) === variable)
              const operators = assignmentOperators(resourceType(selected))
              patchRow(row.id,{variable,operator:operators[0]?.[0] || 'set',value:'',valueMode:'literal'})
            }}>
              <option value="">Select a variable</option>
              {resources.filter(isWritable).map((item) => <option key={item.id || item.apiName} value={resourcePath(item)}>{item.label || item.apiName}{item.isCollection ? ' — Collection' : ''}</option>)}
            </select>
            <select value={row.operator || 'set'} onChange={(event) => patchRow(row.id,{operator:event.target.value,value:''})}>
              {assignmentOperators(type).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <div className="gptb-gr-value">
              <button type="button" onClick={() => patchRow(row.id,{valueMode:row.valueMode === 'resource' ? 'literal' : 'resource',value:''})}>{row.valueMode === 'resource' ? 'Resource' : 'Value'}</button>
              {row.valueMode === 'resource'
                ? <select value={row.value || ''} onChange={(event) => patchRow(row.id,{value:event.target.value})}><option value="">Select a resource</option>{resources.map((item) => <option key={item.id || item.apiName} value={resourcePath(item)}>{item.label || item.apiName}</option>)}</select>
                : <input value={row.value ?? ''} placeholder={row.operator === 'remove_position' ? 'Position' : 'Enter value'} onChange={(event) => patchRow(row.id,{value:event.target.value})}/>}
            </div>
            <button type="button" aria-label={`Remove assignment ${index + 1}`} onClick={() => patch({ assignments: config.assignments.filter((item) => item.id !== row.id) })}><Trash2 size={13}/></button>
          </div>
        })}
      </div>
      <button type="button" className="gptb-inline-action" onClick={() => patch({ assignments: [...config.assignments,{id:uid(),variable:'',operator:'set',valueMode:'literal',value:''}] })}><Plus size={13}/> Add Assignment</button>
    </section>
    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Assignment element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
