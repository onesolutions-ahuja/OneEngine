import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export const WAIT_DURATION_DEFAULTS = Object.freeze({
  amount: '',
  unit: 'minutes',
  resumeAtSpecificTime: false,
  resumeTime: '',
  timeZone: '',
})

export function normalizeWaitDurationConfig(config = {}) {
  return { ...WAIT_DURATION_DEFAULTS, ...config }
}

export function waitDurationConfigErrors(config = {}) {
  const c = normalizeWaitDurationConfig(config)
  const errors = []
  const amount = Number(c.amount)
  if (!Number.isFinite(amount) || amount <= 0) errors.push('Enter an amount of time greater than 0.')
  if (!['minutes','hours','days','months'].includes(c.unit)) errors.push('Select Minutes, Hours, Days, or Months.')
  if (c.resumeAtSpecificTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.resumeTime || ''))) errors.push('Enter a valid resume time.')
    if (!String(c.timeZone || '').trim()) errors.push('Select a time zone.')
  }
  return errors
}

export function waitDurationRuntimeAction(instance) {
  const c = normalizeWaitDurationConfig(instance?.config)
  return {
    id: instance.id,
    key: 'WAIT_DURATION',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    amount: Number(c.amount),
    unit: c.unit,
    resumeAtSpecificTime: c.resumeAtSpecificTime === true,
    resumeTime: c.resumeAtSpecificTime ? c.resumeTime : undefined,
    timeZone: c.resumeAtSpecificTime ? c.timeZone : undefined,
  }
}

function timeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone')
  } catch {}
  return ['UTC','Europe/London','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Asia/Dubai','Asia/Kolkata','Asia/Singapore','Australia/Sydney']
}

function loadOpenSections() {
  try {
    const value = JSON.parse(localStorage.getItem('gptbuilder.waitDuration.openSections') || 'null')
    if (value && typeof value === 'object') return value
  } catch {}
  return { duration: true, resume: true }
}

export default function GPTBuilderWaitDuration({ draft, updateConfig, onConfiguredChange }) {
  const config = normalizeWaitDurationConfig(draft.config)
  const errors = useMemo(() => waitDurationConfigErrors(config), [JSON.stringify(config)])
  useEffect(() => { onConfiguredChange?.(errors.length === 0, errors) }, [JSON.stringify(errors)])
  const patch = (changes) => updateConfig({ ...config, ...changes })
  const zones = useMemo(() => timeZones(), [])
  const [openSections, setOpenSections] = useState(loadOpenSections)
  const toggleSection = (key) => setOpenSections((current) => {
    const next = { ...current, [key]: current[key] === false }
    try { localStorage.setItem('gptbuilder.waitDuration.openSections', JSON.stringify(next)) } catch {}
    return next
  })

  return <div className="gptb-gr gptb-wait-duration">
    <section className="gptb-collapsible-section"><button type="button" className="gptb-section-toggle" aria-expanded={openSections.duration !== false} onClick={()=>toggleSection('duration')}>{openSections.duration !== false ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>Set Wait Duration</span></button>
      {openSections.duration !== false ? <label><span>Amount of Time <b>*</b></span><span className="gptb-wait-amount"><input type="number" min="0.000001" step="any" value={config.amount} onChange={(event)=>patch({amount:event.target.value})}/><select value={config.unit} onChange={(event)=>patch({unit:event.target.value})}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option><option value="months">Months</option></select></span></label> : null}
    </section>
    <section className="gptb-collapsible-section"><button type="button" className="gptb-section-toggle" aria-expanded={openSections.resume !== false} onClick={()=>toggleSection('resume')}>{openSections.resume !== false ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>Resume Options</span></button>
      {openSections.resume !== false ? <>
      <label className="gptb-properties-check"><input type="checkbox" checked={config.resumeAtSpecificTime} onChange={(event)=>patch({resumeAtSpecificTime:event.target.checked,resumeTime:event.target.checked?config.resumeTime:'',timeZone:event.target.checked?config.timeZone:''})}/><span>Resume at a specific time of day</span></label>
      {config.resumeAtSpecificTime ? <>
        <label><span>Resume Time <b>*</b></span><input type="time" value={config.resumeTime} onChange={(event)=>patch({resumeTime:event.target.value})}/></label>
        <label><span>Time Zone <b>*</b></span><select value={config.timeZone} onChange={(event)=>patch({timeZone:event.target.value})}><option value="">Select a time zone</option>{zones.map((zone)=><option key={zone} value={zone}>{zone}</option>)}</select></label>
        <small>If the amount of time expires after the selected resume time, the flow resumes at that time on the following day.</small>
      </> : null}
      </> : null}
    </section>
    {errors.length ? <div className="gptb-gr-errors"><b>Complete this Wait for Amount of Time element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div> : null}
  </div>
}
