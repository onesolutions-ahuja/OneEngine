export function configuredValue(value) {
  if (typeof value !== 'string') return value
  if (/^(steps|variables)\./.test(value)) return { path: value }
  if (value.startsWith('$record.')) return { path: value.slice(8) }
  if (/^[\[{]/.test(value.trim())) {
    try { return JSON.parse(value) } catch { throw new Error('Invalid structured field value') }
  }
  return value
}

const operators = { Equals: 'equals', 'Does Not Equal': 'not_equals', 'Is Null': 'is_empty', 'Is Changed': 'changed', 'Greater Than': 'greater_than', 'Greater Than or Equal': 'greater_than_or_equal', 'Less Than': 'less_than', 'Less Than or Equal': 'less_than_or_equal' }
export function runtimeCondition(row) {
  const operator = row.operator === 'Is Null' && String(row.value) === 'false' ? 'is_not_empty' : operators[row.operator] || row.operator || 'equals'
  return { field: row.resource || row.field || '', operator, value: configuredValue(row.value) }
}

function parseObjectText(value, label) {
  const text = String(value || '').trim()
  if (!text) return {}
  let parsed
  try { parsed = JSON.parse(text) } catch { throw new Error(`${label} must be valid JSON`) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`)
  return parsed
}

function configuredObject(map) {
  return Object.fromEntries(Object.entries(map || {}).map(([key, value]) => [key, configuredValue(value)]))
}

export function nativeRuntimeAction(node, resources = []) {
  const p = node.config || {}
  const base = { id: node.id, label: node.label, apiName: node.apiName, description: node.description || '', config: p }
  if (node.type === 'GET_RECORDS') return { ...base, key: 'GET_RECORDS', objectKey: p.objectKey,
    filters: p.conditionLogic === 'none' ? [] : (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition),
    match: p.conditionLogic === 'any' ? 'any' : 'all', sortField: p.sortBy || undefined,
    sortDirection: p.sortOrder === 'none' ? undefined : p.sortOrder,
    limit: p.limit === 'all' ? 200 : p.limit === 'limited' ? Number(p.maxRecords) : 1,
    store: !p.limit || p.limit === 'first' ? 'first' : 'all' }
  if (node.type === 'CREATE_RECORDS') {
    const valueMode = p.valueMode || 'manual'
    if (valueMode === 'record') {
      if (!p.sourceRecord) throw new Error(`${node.label}: choose the record resource to create`)
      return { ...base, key: 'CREATE_RECORD', objectKey: p.objectKey, sourceRecord: configuredValue(p.sourceRecord) }
    }
    if (valueMode === 'collection') {
      if (!p.sourceRecord) throw new Error(`${node.label}: choose the record collection to create`)
      return { ...base, key: 'CREATE_RECORD', objectKey: p.objectKey, sourceRecords: configuredValue(p.sourceRecord) }
    }
    return { ...base, key: 'CREATE_RECORD', objectKey: p.objectKey,
      fieldValues: Object.fromEntries((p.fieldValues || []).filter(row => row.field).map(row => [row.field, configuredValue(row.value)])) }
  }
  if (node.type === 'UPDATE_RECORDS') {
    const fieldValues = Object.fromEntries((p.fieldValues || []).filter(row => row.field).map(row => [row.field, configuredValue(row.value)]))
    if (p.recordId) return { ...base, key: 'UPDATE_RECORD', objectKey: p.objectKey, recordId: configuredValue(p.recordId), fieldValues }
    if ((p.updateMode || 'conditions') === 'record') {
      if (!p.sourceRecord) throw new Error(`${node.label}: choose a record or record collection to update`)
      return { ...base, key: 'BULK_UPDATE_RECORDS', objectKey: p.objectKey, records: configuredValue(p.sourceRecord) }
    }
    return { ...base, key: 'BULK_UPDATE_RECORDS', objectKey: p.objectKey,
      filters: p.conditionLogic === 'none' ? [] : (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition),
      match: p.conditionLogic === 'any' ? 'any' : 'all', fieldValues }
  }
  if (node.type === 'DELETE_RECORDS') {
    if (p.recordId) return { ...base, key: 'DELETE_RECORD', objectKey: p.objectKey, recordId: configuredValue(p.recordId) }
    if ((p.deleteMode || 'conditions') === 'record') {
      if (!p.sourceRecord) throw new Error(`${node.label}: choose a record or record collection to delete`)
      return { ...base, key: 'DELETE_RECORD', objectKey: p.objectKey, records: configuredValue(p.sourceRecord) }
    }
    return { ...base, key: 'DELETE_RECORD', objectKey: p.objectKey,
      filters: p.conditionLogic === 'none' ? [] : (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition),
      match: p.conditionLogic === 'any' ? 'any' : 'all' }
  }
  if (node.type === 'ASSIGNMENT') return { ...base, key: 'ASSIGNMENT', variableName: String(p.resource || '').replace(/^variables\./, ''),
    variableType: String(resources.find(r => r.value === p.resource)?.dataType || 'text').toLowerCase(),
    operator: { Equals: 'set', Add: 'add', Subtract: 'subtract', 'Add Item': 'append', 'Remove Item': 'remove' }[p.operator] || 'set', value: configuredValue(p.value) }
  if (node.type === 'COLLECTION_FILTER') {
    if (p.filterMode === 'formula') return { ...base, key: 'COLLECTION_FILTER', collection: configuredValue(p.collection), formula: p.filterFormula || '' }
    return { ...base, key: 'COLLECTION_FILTER', collection: configuredValue(p.collection),
      filters: (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition),
      match: p.conditionLogic === 'any' ? 'any' : 'all' }
  }
  if (node.type === 'COLLECTION_SORT') return { ...base, key: 'COLLECTION_SORT', collection: configuredValue(p.collection),
    sortField: p.sortField || p.field || '', sortDirection: p.order === 'desc' ? 'desc' : 'asc',
    limit: Number(p.max || 0) || 0 }
  if (node.type === 'TRANSFORM') return { ...base, key: 'TRANSFORM', collection: configuredValue(p.source),
    targetResource: p.target || '', transformMappings: configuredObject(parseObjectText(p.mappingsText, `${node.label}: field mappings`)) }
  if (node.type === 'CUSTOM_ERROR') return { ...base, key: 'CUSTOM_ERROR', errorMessage: p.message || '',
    ...(p.location === 'field' && p.field ? { errorField: p.field } : {}) }
  if (node.type === 'WAIT') {
    const waitType = p.waitType || 'duration'
    if (waitType === 'date') return { ...base, key: 'WAIT_UNTIL_DATE', resumeAt: configuredValue(p.dateResource) }
    if (waitType === 'conditions') return { ...base, key: 'WAIT_FOR_CONDITIONS',
      waitCondition: { match: p.conditionLogic === 'any' ? 'any' : 'all', conditions: (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition) } }
    if (waitType === 'event') throw new Error(`${node.label}: event waits are not supported by the runtime yet`)
    const multiplier = p.unit === 'days' ? 86400 : p.unit === 'hours' ? 3600 : 60
    return { ...base, key: 'WAIT', durationSeconds: Math.max(0, Number(p.amount || 0) * multiplier) }
  }
  if (node.type === 'SUBFLOW') return { ...base, key: 'RUN_SUBFLOW', workflowId: p.flow || '',
    workflowInputs: configuredObject(parseObjectText(p.inputsText, `${node.label}: input values`)),
    outputMappings: parseObjectText(p.outputsText, `${node.label}: output values`) }
  if (node.type === 'SCREEN') {
    const components = (p.components || []).map(component => ({
      ...component,
      name: component.name || component.apiName,
      options: Array.isArray(component.options) ? component.options : (component.choices || []).map(choice => typeof choice === 'object' ? choice : { label: String(choice), value: choice }),
    }))
    return { ...base, key: 'SCREEN', screen: { label: node.label, apiName: node.apiName, ...p, components },
      showFooter: p.showFooter !== false, allowBack: (p.navigation || 'both') === 'both',
      allowNext: (p.navigation || 'both') !== 'finish', allowFinish: p.navigation === 'finish' }
  }
  if (node.type === 'LOOP') return { ...base, key: 'LOOP', collection: configuredValue(p.collection),
    itemVariable: p.itemVariable || '', iterationOrder: p.direction === 'last' ? 'LAST_TO_FIRST' : 'FIRST_TO_LAST',
    bodyBranch: Array.isArray(p.bodyBranch) ? p.bodyBranch : [] }
  return null
}
