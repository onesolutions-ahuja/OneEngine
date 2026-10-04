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

function runtimeFieldValues(rows = []) {
  return Object.fromEntries(rows.filter(row => row?.field).map(row => [row.field, configuredValue(row.value)]))
}

function runtimeFilters(config = {}, label = 'Data element') {
  const logic = config.conditionLogic || 'all'
  if (logic === 'formula') throw new Error(`${label}: formula-based record filtering is not executable yet`)
  if (logic === 'custom') throw new Error(`${label}: custom condition logic is not executable yet`)
  return {
    filters: logic === 'none' ? [] : (config.conditions || []).filter(c => c?.resource || c?.field).map(runtimeCondition),
    match: logic === 'any' ? 'any' : 'all',
  }
}

export function nativeRuntimeAction(node, resources = []) {
  const p = node.config || {}
  const base = { id: node.id, label: node.label, apiName: node.apiName, description: node.description || '', config: p }

  if (node.type === 'GET_RECORDS') {
    const filter = runtimeFilters(p, node.label)
    return { ...base, key: 'GET_RECORDS', objectKey: p.objectKey, ...filter,
      sortField: p.sortBy || undefined,
      sortDirection: p.sortOrder === 'none' ? undefined : p.sortOrder,
      limit: p.limit === 'all' ? 20000 : p.limit === 'limited' ? Number(p.maxRecords) : 1,
      store: !p.limit || p.limit === 'first' ? 'first' : 'all',
      selectedFields: p.store === 'choose' ? (p.selectedFields || []).filter(Boolean) : undefined,
      fieldAssignments: p.store === 'advanced' ? (p.fieldAssignments || []).filter(row => row?.field && row?.resource) : undefined }
  }

  if (node.type === 'CREATE_RECORDS') {
    const mode = p.valueMode || 'manual'
    if (mode === 'manual') {
      return { ...base, key: 'CREATE_RECORD', objectKey: p.objectKey, fieldValues: runtimeFieldValues(p.fieldValues) }
    }
    if (!p.sourceRecord) throw new Error(`${node.label}: select a record resource`)
    return { ...base, key: mode === 'collection' ? 'CREATE_RECORDS' : 'CREATE_RECORD', objectKey: p.objectKey,
      sourceRecord: configuredValue(p.sourceRecord) }
  }

  if (node.type === 'UPDATE_RECORDS') {
    const mode = p.updateMode || 'conditions'
    if (mode === 'record') {
      if (!p.sourceRecord) throw new Error(`${node.label}: select a record or record collection`)
      return { ...base, key: 'UPDATE_RECORD', objectKey: p.objectKey, sourceRecord: configuredValue(p.sourceRecord) }
    }
    const fieldValues = runtimeFieldValues(p.fieldValues)
    // Preserve older seeded flows that explicitly identify one record while
    // new Builder configurations use Salesforce-style record conditions.
    if (p.recordId && !(p.conditions || []).some(row => row?.resource || row?.field)) {
      return { ...base, key: 'UPDATE_RECORD', objectKey: p.objectKey, recordId: configuredValue(p.recordId), fieldValues }
    }
    return { ...base, key: 'BULK_UPDATE_RECORDS', objectKey: p.objectKey, ...runtimeFilters(p, node.label), fieldValues }
  }

  if (node.type === 'DELETE_RECORDS') {
    const mode = p.deleteMode || 'conditions'
    if (mode === 'record') {
      if (!p.sourceRecord) throw new Error(`${node.label}: select a record or record collection`)
      return { ...base, key: 'DELETE_RECORD', objectKey: p.objectKey, sourceRecord: configuredValue(p.sourceRecord) }
    }
    return { ...base, key: 'DELETE_RECORD', objectKey: p.objectKey, ...runtimeFilters(p, node.label) }
  }

  if (node.type === 'ASSIGNMENT') return { ...base, key: 'ASSIGNMENT', variableName: String(p.resource || '').replace(/^variables\./, ''),
    variableType: String(resources.find(r => r.value === p.resource)?.dataType || 'text').toLowerCase(),
    operator: { Equals: 'set', Add: 'add', Subtract: 'subtract', 'Add Item': 'append', 'Remove Item': 'remove' }[p.operator] || 'set', value: configuredValue(p.value) }
  return null
}
