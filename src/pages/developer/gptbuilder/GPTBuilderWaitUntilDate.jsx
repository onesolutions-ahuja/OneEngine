import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')
const resourceLabel = (resource) => resource?.label || resource?.apiName || ''

export const WAIT_UNTIL_DATE_DEFAULTS = Object.freeze({
  mode: 'enter_date',
  resumeDate: '',
  resumeTime: '',
  timeZone: '',
  attribute: '',
  attributeType: '',
  relativeEnabled: false,
  relativeNumber: '',
  relativeUnit: 'days',
  relativeWhen: 'before',
  specificTimeEnabled: false,
  attributeResumeTime: '',
  attributeTimeZone: '',
})

export function normalizeWaitUntilDateConfig(config = {}) {
  if (config.resumeAt && !config.mode) {
    return { ...WAIT_UNTIL_DATE_DEFAULTS, mode: 'get_attribute', attribute: config.resumeAt, attributeType: 'datetime' }
  }
  return { ...WAIT_UNTIL_DATE_DEFAULTS, ...config }
}

export function waitUntilDateConfigErrors(config = {}, resources = []) {
  const c = normalizeWaitUntilDateConfig(config)
  const errors = []
  if (!['enter_date','get_attribute'].includes(c.mode)) errors.push('Select Enter Date or Get from Attribute.')
  if (c.mode === 'enter_date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.resumeDate || ''))) errors.push('Enter a valid Resume Date.')
    if (c.resumeTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.resumeTime))) errors.push('Enter a valid Resume Time.')
  }
  if (c.mode === 'get_attribute') {
    const selected = resources.find((resource) => resourcePath(resource) === c.attribute)
    if (!selected) errors.push('Select a Date or Date/Time attribute.')
    else if (!['date','datetime'].includes(String(selected.dataType || '').toLowerCase())) errors.push('Attribute must be Date or Date/Time.')
    if (c.relativeEnabled) {
      const number = Number(c.relativeNumber)
      if (!Number.isInteger(number) || number < 0) errors.push('Relative Number must be a whole number of 0 or greater.')
      if (!['hours','days'].includes(c.relativeUnit)) errors.push('Relative Unit must be Hours or Days.')
      if (!['before','after'].includes(c.relativeWhen)) errors.push('Select Before or After.')
    }
    if (c.specificTimeEnabled) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.attributeResumeTime || ''))) errors.push('Enter a valid Resume Time.')
    }
  }
  return errors
}

export function waitUntilDateRuntimeAction(instance, resources = []) {
  const c = normalizeWaitUntilDateConfig(instance?.config)
  const selected = resources.find((resource)=>resourcePath(resource)===c.attribute)
  return {
    id: instance.id,
    key: 'WAIT_UNTIL_DATE',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    mode: c.mode,
    resumeDate: c.mode === 'enter_date' ? c.resumeDate : undefined,
    resumeTime: c.mode === 'enter_date' ? c.resumeTime || undefined : undefined,
    timeZone: c.mode === 'enter_date' ? c.timeZone || undefined : undefined,
    attribute: c.mode === 'get_attribute' ? c.attribute : undefined,
    attributeType: c.mode === 'get_attribute' ? String(selected?.dataType || c.attributeType || '').toLowerCase() : undefined,
    relativeEnabled: c.mode === 'get_attribute' && c.relativeEnabled === true,
    relativeNumber: c.mode === 'get_attribute' && c.relativeEnabled ? Number(c.relativeNumber || 0) : undefined,
    relativeUnit: c.mode === 'get_attribute' && c.relativeEnabled ? c.relativeUnit : undefined,
    relativeWhen: c.mode === 'get_attribute' && c.relativeEnabled ? c.relativeWhen : undefined,
    specificTimeEnabled: c.mode === 'get_attribute' && c.specificTimeEnabled === true,
    attributeResumeTime: c.mode === 'get_attribute' && c.specificTimeEnabled ? c.attributeResumeTime : undefined,
    attributeTimeZone: c.mode === 'get_attribute' && c.specificTimeEnabled ? c.attributeTimeZone || undefined : undefined,
  }
}

function timeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone')
  } catch {}
  return ['UTC','Europe/London','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Australia/Sydney']
}

function loadOpenState() {
  try {
    const value = JSON.parse(localStorage.getItem('gptbuilder.waitUntilDate.openSections') || 'null')
    if (value && typeof value === 'object') return value
  } catch {}
  return { timing: true }
}

export default function GPTBuilderWaitUntilDate({ draft, updateConfig, resources = [], onConfiguredChange }) {
  const config = normalizeWaitUntilDateConfig(draft.config)
  const errors = useMemo(()=>waitUntilDateConfigErrors(config,resources),[JSON.stringify(config),JSON.stringify(resources)])
  useEffect(()=>{ onConfiguredChange?.(errors.length===0,errors) },[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const dateResources=resources.filter((resource)=>resource?.isCollection!==true && ['date','datetime'].includes(String(resource?.dataType||'').toLowerCase()))
  const zones=useMemo(()=>timeZones(),[])
  const [open,setOpen]=useState(loadOpenState)
  const toggle=(key)=>setOpen((current)=>{
    const next={...current,[key]:current[key]===false}
    try { localStorage.setItem('gptbuilder.waitUntilDate.openSections',JSON.stringify(next)) } catch {}
    return next
  })

  return <div className="gptb-gr gptb-wait-until-date">
    <section className="gptb-collapsible-section">
      <button type="button" className="gptb-section-toggle" aria-expanded={open.timing!==false} onClick={()=>toggle('timing')}>{open.timing!==false?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>Resume Flow</span></button>
      {open.timing!==false?<>
        <fieldset className="gptb-gr-radio-group"><legend>How to Determine the Resume Date</legend>
          <label><input type="radio" name={`wait-until-mode-${draft.id}`} checked={config.mode==='enter_date'} onChange={()=>patch({mode:'enter_date'})}/><span>Enter Date</span></label>
          <label><input type="radio" name={`wait-until-mode-${draft.id}`} checked={config.mode==='get_attribute'} onChange={()=>patch({mode:'get_attribute'})}/><span>Get from Attribute</span></label>
        </fieldset>

        {config.mode==='enter_date'?<section className="gptb-wait-date-mode">
          <label><span>Resume Date <b>*</b></span><input type="date" value={config.resumeDate} onChange={(event)=>patch({resumeDate:event.target.value})}/></label>
          <label><span>Resume Time</span><input type="time" value={config.resumeTime} onChange={(event)=>patch({resumeTime:event.target.value})}/></label>
          <label><span>Time Zone</span><select value={config.timeZone} onChange={(event)=>patch({timeZone:event.target.value})}><option value="">Use org time zone</option>{zones.map((zone)=><option key={zone} value={zone}>{zone}</option>)}</select></label>
          <small>If Resume Time is blank, the flow resumes at 12:00 AM. If Time Zone is blank, the org time zone is used.</small>
        </section>:<section className="gptb-wait-date-mode">
          <label><span>Attribute <b>*</b></span><select value={config.attribute} onChange={(event)=>{
            const selected=dateResources.find((resource)=>resourcePath(resource)===event.target.value)
            patch({attribute:event.target.value,attributeType:String(selected?.dataType||'').toLowerCase()})
          }}><option value="">Select a Date or Date/Time resource</option>{dateResources.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resourceLabel(resource)} · {String(resource.dataType).toLowerCase()==='datetime'?'Date/Time':'Date'}</option>)}</select></label>

          <label className="gptb-properties-check"><input type="checkbox" checked={config.relativeEnabled===true} onChange={(event)=>patch({relativeEnabled:event.target.checked})}/><span>Resume on a date and time relative to the field's date or datetime value</span></label>
          {config.relativeEnabled?<div className="gptb-wait-relative-grid">
            <label><span>Number <b>*</b></span><input type="number" min="0" step="1" value={config.relativeNumber} onChange={(event)=>patch({relativeNumber:event.target.value})}/></label>
            <label><span>Unit <b>*</b></span><select value={config.relativeUnit} onChange={(event)=>patch({relativeUnit:event.target.value})}><option value="hours">Hours</option><option value="days">Days</option></select></label>
            <label><span>When <b>*</b></span><select value={config.relativeWhen} onChange={(event)=>patch({relativeWhen:event.target.value})}><option value="before">Before</option><option value="after">After</option></select></label>
          </div>:null}

          <label className="gptb-properties-check"><input type="checkbox" checked={config.specificTimeEnabled===true} onChange={(event)=>patch({specificTimeEnabled:event.target.checked})}/><span>Resume at a specific time of day</span></label>
          {config.specificTimeEnabled?<>
            <label><span>Resume Time <b>*</b></span><input type="time" value={config.attributeResumeTime} onChange={(event)=>patch({attributeResumeTime:event.target.value})}/></label>
            <label><span>Time Zone</span><select value={config.attributeTimeZone} onChange={(event)=>patch({attributeTimeZone:event.target.value})}><option value="">Use org time zone</option>{zones.map((zone)=><option key={zone} value={zone}>{zone}</option>)}</select></label>
          </>:null}
          <small>If the selected attribute is blank or resolves to a past date/time, the interview pauses and resumes immediately unless a specific time of day moves the resume to the next occurrence of that time.</small>
        </section>}
      </>:null}
    </section>
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Wait Until Date element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
