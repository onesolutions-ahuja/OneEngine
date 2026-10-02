import React from 'react'

function fieldKey(field) {
  return field?.api_name || field?.apiName || field?.field_key || field?.fieldKey || ''
}

function optionRows(field, configuredStages) {
  if (Array.isArray(configuredStages) && configuredStages.length) {
    return configuredStages.map((stage) => typeof stage === 'object'
      ? { value: String(stage.value ?? stage.key ?? stage.label ?? ''), label: String(stage.label ?? stage.name ?? stage.value ?? '') }
      : { value: String(stage), label: String(stage) }).filter((stage) => stage.value)
  }
  return (Array.isArray(field?.options) ? field.options : [])
    .filter((option) => option?.active !== false)
    .map((option) => typeof option === 'object'
      ? { value: String(option.value ?? option.key ?? option.label ?? ''), label: String(option.label ?? option.name ?? option.value ?? '') }
      : { value: String(option), label: String(option) })
    .filter((stage) => stage.value)
}

export default function ProcessPath({ component, fields = [], record = {}, canEdit = false, onStageChange }) {
  const key = component?.fieldKey || component?.field_key || component?.config?.fieldKey || component?.config?.field_key || ''
  const field = fields.find((candidate) => fieldKey(candidate) === key)
  if (!field || !['picklist', 'select'].includes(field?.field_type || field?.fieldType)) {
    return <div className="process-path-empty">Choose a picklist/status field for Process Path.</div>
  }
  const stages = optionRows(field, component?.stages || component?.config?.stages)
  const current = String(record?.[key] ?? '')
  const currentIndex = stages.findIndex((stage) => stage.value === current)
  const guidance = component?.guidance || component?.config?.guidance || {}
  const keyFieldConfig = component?.keyFields || component?.key_fields || component?.config?.keyFields || {}
  const currentKeyFields = Array.isArray(keyFieldConfig)
    ? keyFieldConfig
    : Array.isArray(keyFieldConfig?.[current]) ? keyFieldConfig[current] : []
  const byKey = new Map(fields.map((candidate) => [fieldKey(candidate), candidate]))

  return (
    <div className="process-path">
      <div className="process-path-stages" role="list" aria-label={component?.label || 'Process Path'}>
        {stages.map((stage, index) => {
          const state = stage.value === current ? 'is-current' : currentIndex >= 0 && index < currentIndex ? 'is-complete' : ''
          return (
            <button
              type="button"
              role="listitem"
              key={stage.value}
              className={`process-path-stage ${state}`}
              disabled={!canEdit || !onStageChange}
              onClick={() => onStageChange?.(key, stage.value)}
              aria-current={stage.value === current ? 'step' : undefined}
            >
              <span className="process-path-dot">{index + 1}</span>
              <span>{stage.label}</span>
            </button>
          )
        })}
      </div>
      {(guidance?.[current] || currentKeyFields.length) ? (
        <div className="process-path-details">
          {guidance?.[current] ? <p>{guidance[current]}</p> : null}
          {currentKeyFields.length ? (
            <dl>
              {currentKeyFields.map((keyField) => {
                const meta = byKey.get(String(keyField))
                return <div key={String(keyField)}><dt>{meta?.label || keyField}</dt><dd>{String(record?.[keyField] ?? '—')}</dd></div>
              })}
            </dl>
          ) : null}
        </div>
      ) : null}
      <style>{`
        .process-path { display:grid; gap:10px; min-width:0; }
        .process-path-stages { display:flex; overflow-x:auto; gap:0; padding-bottom:2px; }
        .process-path-stage { position:relative; display:flex; min-width:130px; flex:1; align-items:center; gap:7px; border:0; border-top:3px solid var(--border-color,#cbd5e1); background:transparent; padding:8px 10px 6px; color:var(--text-secondary,#64748b); text-align:left; font-size:10px; }
        .process-path-stage:not(:disabled) { cursor:pointer; }
        .process-path-stage.is-current { border-top-color:#2563eb; color:var(--text-primary,#0f172a); font-weight:700; }
        .process-path-stage.is-complete { border-top-color:#16a34a; color:var(--text-primary,#0f172a); }
        .process-path-dot { display:grid; place-items:center; width:19px; height:19px; flex:0 0 auto; border-radius:999px; background:var(--muted-background,#f1f5f9); font-size:9px; }
        .process-path-stage.is-current .process-path-dot { background:#dbeafe; }
        .process-path-stage.is-complete .process-path-dot { background:#dcfce7; }
        .process-path-details { border:1px solid var(--border-color,#e2e8f0); border-radius:8px; background:var(--muted-background,#f8fafc); padding:9px 10px; }
        .process-path-details p { margin:0 0 8px; font-size:10px; line-height:1.45; }
        .process-path-details dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:7px; margin:0; }
        .process-path-details dl div { min-width:0; }
        .process-path-details dt { color:var(--text-secondary,#64748b); font-size:9px; }
        .process-path-details dd { margin:2px 0 0; font-size:10px; font-weight:650; }
        .process-path-empty { color:var(--text-secondary,#64748b); font-size:10px; padding:8px; }
      `}</style>
    </div>
  )
}
