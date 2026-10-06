export function executionInputValue(resource, raw) {
  const type = String(resource?.dataType || resource?.type || 'Text').toLowerCase()
  if (raw === '' || raw === undefined || raw === null) return raw
  if (['number', 'currency'].includes(type)) {
    const value = Number(raw)
    return Number.isFinite(value) ? value : raw
  }
  if (type === 'boolean') return raw === true || String(raw).toLowerCase() === 'true'
  if (resource?.isCollection) {
    if (Array.isArray(raw)) return raw
    try {
      const value = JSON.parse(raw)
      return Array.isArray(value) ? value : raw
    } catch {
      return String(raw).split(',').map((value) => value.trim()).filter(Boolean)
    }
  }
  if (['record', 'apex-defined'].includes(type)) {
    if (typeof raw === 'object') return raw
    try { return JSON.parse(raw) } catch { return raw }
  }
  return raw
}
