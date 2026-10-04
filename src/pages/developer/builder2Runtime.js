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

export function nativeRuntimeAction(node, resources = []) {
  const p = node.config || {}
  const base = { id: node.id, label: node.label, apiName: node.apiName, description: node.description || '', config: p }
  if (node.type === 'GET_RECORDS') return { ...base, key: 'GET_RECORDS', objectKey: p.objectKey,
    filters: p.conditionLogic === 'none' ? [] : (p.conditions || []).filter(c => c.resource || c.field).map(runtimeCondition),
    match: p.conditionLogic === 'any' ? 'any' : 'all', sortField: p.sortBy || undefined,
    sortDirection: p.sortOrder === 'none' ? undefined : p.sortOrder,
    limit: p.limit === 'all' ? 200 : p.limit === 'limited' ? Number(p.maxRecords) : 1,
    store: !p.limit || p.limit === 'first' ? 'first' : 'all' }
  if (['CREATE_RECORDS', 'UPDATE_RECORDS'].includes(node.type)) {
    if (node.type === 'CREATE_RECORDS' && ['record', 'collection'].includes(p.valueMode)) {
      if (!p.sourceRecord) throw new Error(`${node.label}: choose a record resource`)
      const resourcePath = /^(variables|steps)\./.test(p.sourceRecord) || p.sourceRecord.startsWith('$') ? p.sourceRecord : `variables.${p.sourceRecord}`
      return { ...base, key: 'CREATE_RECORD', objectKey: p.objectKey, [p.valueMode === 'collection' ? 'recordCollectionResource' : 'recordResource']: { path: resourcePath } }
    }
    if (p.valueMode && p.valueMode !== 'manual') throw new Error(`${node.label}: unsupported record value mode`)
    if (node.type === 'UPDATE_RECORDS' && !p.recordId) throw new Error(`${node.label}: choose the record ID to update`)
    return { ...base, key: node.type === 'CREATE_RECORDS' ? 'CREATE_RECORD' : 'UPDATE_RECORD', objectKey: p.objectKey,
      ...(p.recordId ? { recordId: configuredValue(p.recordId) } : {}),
      fieldValues: Object.fromEntries((p.fieldValues || []).filter(row => row.field).map(row => [row.field, configuredValue(row.value)])) }
  }
  if (node.type === 'ASSIGNMENT') return { ...base, key: 'ASSIGNMENT', variableName: String(p.resource || '').replace(/^variables\./, ''),
    variableType: String(resources.find(r => r.value === p.resource)?.dataType || 'text').toLowerCase(),
    operator: { Equals: 'set', Add: 'add', Subtract: 'subtract', 'Add Item': 'append', 'Remove Item': 'remove' }[p.operator] || 'set', value: configuredValue(p.value) }
  return null
}
