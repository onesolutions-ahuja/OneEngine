import { useEffect, useMemo } from 'react'

export const LOOP_DEFAULTS = Object.freeze({
  collection: '',
  direction: 'first',
  itemVariable: '',
  itemType: '',
  itemObjectKey: '',
})

export function normalizeLoopConfig(config = {}) {
  return { ...LOOP_DEFAULTS, ...config }
}

function resourcePath(resource) {
  return resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')
}

export function loopConfigErrors(config = {}, resources = []) {
  const c = normalizeLoopConfig(config)
  const errors = []
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  if (!c.collection) errors.push('Select a collection variable.')
  else if (!selected || !selected.isCollection) errors.push('Selected resource must be a collection variable.')
  if (!['first','last'].includes(c.direction)) errors.push('Select a valid loop direction.')
  return errors
}

export function loopRuntimeAction(instance, resources = []) {
  const c = normalizeLoopConfig(instance?.config)
  const selected = resources.find((resource) => resourcePath(resource) === c.collection)
  const api = String(instance?.apiName || 'Loop').replace(/[^A-Za-z0-9_]/g,'_')
  const itemVariable = c.itemVariable || `CurrentItem_${api}`
  return {
    id: instance.id,
    key: 'LOOP',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    collection: c.collection,
    itemVariable,
    itemType: selected?.dataType || c.itemType || 'text',
    itemObjectKey: selected?.objectKey || c.itemObjectKey || '',
    iterationOrder: c.direction === 'last' ? 'LAST_TO_FIRST' : 'FIRST_TO_LAST',
    bodyBranch: Array.isArray(c.bodyBranch) ? c.bodyBranch : [],
  }
}

export default function GPTBuilderLoop({ draft, updateConfig, resources, onConfiguredChange }) {
  const config = normalizeLoopConfig(draft.config)
  const errors = useMemo(() => loopConfigErrors(config, resources), [JSON.stringify(config), JSON.stringify(resources)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])

  const patch = (changes) => updateConfig({ ...config, ...changes })
  const selected = resources.find((resource) => resourcePath(resource) === config.collection)
  const autoItemLabel = draft?.label ? `Current Item from Loop ${draft.label}` : 'Current Item from Loop'

  return <div className="gptb-gr gptb-loop">
    <section><h3>Loop Details</h3>
      <label><span>Collection Variable <b>*</b></span>
        <select value={config.collection} onChange={(event) => {
          const collection = event.target.value
          const resource = resources.find((item) => resourcePath(item) === collection)
          patch({
            collection,
            itemVariable: collection ? `CurrentItem_${String(draft.apiName || 'Loop').replace(/[^A-Za-z0-9_]/g,'_')}` : '',
            itemType: resource?.dataType || '',
            itemObjectKey: resource?.objectKey || '',
          })
        }}>
          <option value="">Select a collection variable</option>
          {resources.filter((resource) => resource.isCollection).map((resource) => <option key={resource.id || resource.apiName} value={resourcePath(resource)}>{resource.label || resource.apiName}</option>)}
        </select>
        {selected ? <small>{selected.objectKey ? `Record Collection · ${selected.objectKey}` : `${selected.dataType || 'Text'} Collection`}</small> : null}
      </label>

      <label><span>Direction</span><select value={config.direction} onChange={(event) => patch({direction:event.target.value})}><option value="first">First Item to Last Item</option><option value="last">Last Item to First Item</option></select></label>

      <label><span>Loop Variable</span><input value={autoItemLabel} disabled/><small>In resource menus, Salesforce exposes this as Current Item from Loop. Its data type matches the selected collection.</small></label>
    </section>

    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Loop element</b>{errors.map((error) => <span key={error}>{error}</span>)}</div> : null}
  </div>
}
