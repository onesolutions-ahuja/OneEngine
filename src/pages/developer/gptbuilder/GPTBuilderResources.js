const fieldKey = (field) => String(field?.api_name || field?.apiName || field?.field_key || field?.key || field?.id || '')
const fieldLabel = (field) => field?.label || field?.name || fieldKey(field)
const fieldType = (field) => String(field?.data_type || field?.field_type || field?.type || 'text').toLowerCase()
const uniqueByPath = (rows) => [...new Map(rows.map((row) => [row.path, row])).values()]

export function platformEventRecordResources(eventTypes = [], eventKey = '') {
  if (!eventKey) return []
  const eventType = (Array.isArray(eventTypes) ? eventTypes : []).find((item) => String(item?.event_type || '') === String(eventKey))
  const fields = Array.isArray(eventType?.field_schema) ? eventType.field_schema : []
  return uniqueByPath(fields
    .filter((field) => field?.active !== false && field?.readable !== false && fieldKey(field))
    .map((field) => {
      const key = fieldKey(field)
      return {
        id: `auto-event-record-field-${key}`,
        apiName: `$Record.${key}`,
        path: `$Record.${key}`,
        label: `Platform Event Record › ${fieldLabel(field)}`,
        dataType: fieldType(field),
        resourceType: 'record_field',
        parentPath: '$Record',
        writable: false,
        automatic: true,
      }
    }))
}

function relativeRecordPath(path, objectKey = '') {
  const value = String(path || '').trim()
  if (!value) return ''
  if (value.startsWith('$Record.')) return value.slice('$Record.'.length)
  if (value.startsWith('$record.')) return value.slice('$record.'.length)
  if (objectKey && value.startsWith(objectKey + '.')) return value.slice(objectKey.length + 1)
  const parts = value.split('.').filter(Boolean)
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0] || ''
}

export function recordPathResources(paths = [], objectKey = '', { includePrior = true } = {}) {
  const fields = (Array.isArray(paths) ? paths : []).filter((item) => item?.kind === 'field' && item?.active !== false && item?.readable !== false)
  const current = []
  const prior = []
  for (const field of fields) {
    const relative = relativeRecordPath(field.path, objectKey)
    if (!relative) continue
    const label = field.label || relative.split('.').at(-1)
    const type = String(field.fieldType || field.data_type || field.field_type || field.type || 'text').toLowerCase()
    current.push({
      id: `auto-record-field-${relative}`,
      apiName: `$Record.${relative}`,
      path: `$Record.${relative}`,
      label: `Triggering Record › ${label}`,
      dataType: type,
      resourceType: 'record_field',
      objectKey,
      parentPath: '$Record',
      writable: field.writable !== false,
      automatic: true,
    })
    if (includePrior) prior.push({
      id: `auto-prior-record-field-${relative}`,
      apiName: `$Record__Prior.${relative}`,
      path: `$Record__Prior.${relative}`,
      label: `Prior Triggering Record › ${label}`,
      dataType: type,
      resourceType: 'record_field',
      objectKey,
      parentPath: '$Record__Prior',
      writable: false,
      automatic: true,
    })
  }
  return uniqueByPath(includePrior ? [...current, ...prior] : current)
}
