export const DECISION_DEFAULTS = Object.freeze({
  logicMode: 'manual',
  splitResource: '',
  outcomes: [],
  defaultLabel: 'Default Outcome',
  defaultBranch: [],
})

export const decisionResourcePath = (resource) => resource?.path || (resource?.apiName ? 'variables.' + resource.apiName : '')

export function normalizeDecisionConfig(config = {}) {
  return {
    ...DECISION_DEFAULTS,
    ...config,
    outcomes: Array.isArray(config.outcomes) ? config.outcomes : [],
  }
}

export function decisionResourceType(resource) {
  if (resource?.isCollection) return 'collection'
  if (!resource?.dataType) return 'unknown'
  const type = String(resource.dataType).toLowerCase()
  if (['integer','decimal','currency','percent'].includes(type)) return 'number'
  if (['string','textarea','email','phone','url'].includes(type)) return 'text'
  return type
}

export function decisionOperators(type) {
  const base = [['equals','Equals'],['not_equals','Does Not Equal'],['is_null','Is Null']]
  if (['number','currency','date','datetime','time'].includes(type)) return [...base,['greater_than','Greater Than'],['greater_than_or_equal','Greater Than or Equal'],['less_than','Less Than'],['less_than_or_equal','Less Than or Equal']]
  if (['text','picklist','multiselect'].includes(type)) return [...base,['contains','Contains'],['starts_with','Starts With'],['ends_with','Ends With']]
  if (type === 'collection') return [...base,['contains','Contains']]
  return base
}

export function compatibleDecisionResources(resources, source) {
  const type = decisionResourceType(source)
  if (!type || type === 'unknown') return []
  return (Array.isArray(resources) ? resources : []).filter((item) => decisionResourceType(item) === type)
}

export function decisionConfigErrors(config = {}, flowType = '', resources = []) {
  const c = normalizeDecisionConfig(config)
  const errors = []
  if (!['manual','date','field_value'].includes(c.logicMode)) errors.push('Select a Decision mode.')
  if (c.logicMode !== 'manual' && !c.splitResource) errors.push('Select the resource to split on.')
  const resourceByPath = new Map((Array.isArray(resources) ? resources : []).map((resource) => [decisionResourcePath(resource), resource]))
  if (c.logicMode !== 'manual' && c.splitResource) {
    const split = resourceByPath.get(c.splitResource)
    if (!split) errors.push('The selected split resource is no longer available.')
    else if (c.logicMode === 'date' && !['date','datetime'].includes(decisionResourceType(split))) errors.push('Select a Date or Date-Time resource.')
  }
  if (!c.outcomes.length) errors.push('Add at least one outcome.')
  const apiNames = new Set()
  c.outcomes.forEach((outcome,index) => {
    if (!String(outcome.label || '').trim()) errors.push(`Outcome ${index + 1}: enter a label.`)
    const apiName = String(outcome.apiName || '')
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName) || apiName.endsWith('_') || apiName.includes('__')) errors.push(`Outcome ${index + 1}: enter a valid API Name.`)
    if (apiNames.has(apiName.toLowerCase())) errors.push(`Outcome ${index + 1}: API Name must be unique.`)
    apiNames.add(apiName.toLowerCase())
    if (c.logicMode !== 'manual') {
      if (outcome.splitValue === '' || outcome.splitValue == null) errors.push(`Outcome ${index + 1}: enter a split value.`)
    } else {
      if (!outcome.conditions?.length) errors.push(`Outcome ${index + 1}: add at least one condition.`)
      if (outcome.conditionLogic === 'custom' && !String(outcome.customConditionLogic || '').trim()) errors.push(`Outcome ${index + 1}: enter custom condition logic.`)
      ;(outcome.conditions || []).forEach((row,rowIndex) => {
        if (!row.resource) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: select a resource.`)
        const source = row.resource ? resourceByPath.get(row.resource) : null
        if (row.resource && !source) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: selected resource is no longer available.`)
        if (!row.operator) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: select an operator.`)
        if (row.value === '' || row.value == null) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: enter or select a value.`)
        if (row.valueMode === 'resource' && row.value) {
          const comparison = resourceByPath.get(row.value)
          if (!comparison) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: comparison resource is no longer available.`)
          else if (source && decisionResourceType(source) !== decisionResourceType(comparison)) errors.push(`Outcome ${index + 1}, condition ${rowIndex + 1}: comparison resource type does not match.`)
        }
      })
    }
  })
  return errors
}
