import { useEffect, useMemo } from 'react'

export const GROUP_DEFAULTS = Object.freeze({ memberIds: [] })

export function normalizeGroupConfig(config = {}) {
  return { ...GROUP_DEFAULTS, ...config, memberIds: Array.isArray(config.memberIds) ? config.memberIds : [] }
}

export function groupConfigErrors(config = {}, elements = [], selfId = '') {
  const c = normalizeGroupConfig(config)
  const errors = []
  const allowed = new Set(elements.filter((element)=>element.id!==selfId && element.source==='auto' && element.key!=='group').map((element)=>element.id))
  if (c.memberIds.some((id)=>!allowed.has(id))) errors.push('One or more grouped elements are no longer available.')
  return errors
}

export default function GPTBuilderGroup({ draft, updateConfig, elements = [], onConfiguredChange }) {
  const config = normalizeGroupConfig(draft.config)
  const groupedElsewhere = new Set(elements.filter((element)=>element.key==='group' && element.id!==draft.id).flatMap((element)=>Array.isArray(element.config?.memberIds)?element.config.memberIds:[]))
  const candidates = elements.filter((element)=>element.id!==draft.id && element.source==='auto' && element.key!=='group' && (!groupedElsewhere.has(element.id) || config.memberIds.includes(element.id)))
  const errors = useMemo(()=>groupConfigErrors(config,elements,draft.id),[JSON.stringify(config),JSON.stringify(elements.map((element)=>[element.id,element.source,element.key]))])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const toggle=(id)=>patch({memberIds:config.memberIds.includes(id)?config.memberIds.filter((value)=>value!==id):[...config.memberIds,id]})

  return <div className="gptb-gr gptb-group-editor">
    <section><h3>Group Elements</h3>
      <p className="gptb-help-text">Groups organize auto-layout elements visually and don't change runtime behavior.</p>
      <div className="gptb-group-member-list">{candidates.map((element)=><label className="gptb-properties-check" key={element.id}><input type="checkbox" checked={config.memberIds.includes(element.id)} onChange={()=>toggle(element.id)}/><span><b>{element.label}</b><small>{elementByType(element.key)}</small></span></label>)}</div>
      {!candidates.length?<small>No eligible auto-layout elements are available yet.</small>:null}
    </section>
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Group element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}

function elementByType(key){
  return String(key||'element').replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase())
}
