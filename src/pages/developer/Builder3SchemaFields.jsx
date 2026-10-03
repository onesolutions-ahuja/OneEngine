import { useId, useState } from 'react'
import RichText from './Builder3RichText'
import { Plus, Trash2 } from 'lucide-react'

const title = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())

// Every control follows the registry schema. Provider names never enter this renderer.
export function SchemaField({ name, schema = {}, value, onChange, required = false, ResourceControl, LookupControl }) {
  const fieldId=useId()
  const [binding, setBinding] = useState(typeof value === 'string' && /^(\$|variables\.|steps\.)/.test(value))
  const label = schema.title || title(name)
  if(schema['x-lookup']&&LookupControl)return <div className="b3-schema-field"><label>{label}{required?' *':''}<LookupControl kind={schema['x-lookup']} value={value||''} onChange={onChange}/></label></div>
  const composite=schema.type==='object'||schema.properties||schema.type==='array'
  if(composite&&binding&&ResourceControl)return <div className="b3-schema-field"><div className="b3-field-heading"><label>{label}{required?' *':''}</label><button type="button" className="b3-text-action" onClick={()=>{setBinding(false);onChange(schema.type==='array'?[]:{})}}>Use values</button></div><ResourceControl value={value||''} onChange={onChange}/></div>
  const resourceButton=ResourceControl?<button type="button" className="b3-text-action" onClick={()=>{setBinding(true);onChange('')}}>Insert a Resource</button>:null

  if (schema.type === 'object' || schema.properties) {
    const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    const properties = schema.properties || {}
    return <fieldset className="b3-schema-object"><legend>{label}{required ? ' *' : ''} {resourceButton}</legend>
      {Object.keys(properties).length ? <SchemaFields schema={schema} value={object} onChange={onChange} ResourceControl={ResourceControl} LookupControl={LookupControl}/> : <>
        {Object.entries(object).map(([key, item]) => <div className="b3-map-row" key={key}><span>{key}</span><SchemaField name="Value" schema={{type:'string'}} value={item} onChange={next => onChange({...object,[key]:next})} ResourceControl={ResourceControl} LookupControl={LookupControl}/><button type="button" aria-label={`Remove ${key}`} onClick={() => onChange(Object.fromEntries(Object.entries(object).filter(([k]) => k !== key)))}><Trash2 size={14}/></button></div>)}
        <AddMapping onAdd={key => onChange({...object,[key]:''})} existing={Object.keys(object)}/>
      </>}
      {schema.description ? <p className="b3-help">{schema.description}</p> : null}
    </fieldset>
  }
  if (schema.type === 'array') {
    const items = Array.isArray(value) ? value : []
    return <fieldset className="b3-schema-array"><legend>{label}{required ? ' *' : ''} {resourceButton}</legend>{items.map((item, i) => <div className="b3-array-item" key={i}><SchemaField name={`Item ${i+1}`} schema={schema.items || {type:'string'}} value={item} onChange={next => onChange(items.map((x,j) => j===i ? next : x))} ResourceControl={ResourceControl} LookupControl={LookupControl}/><button type="button" aria-label={`Remove ${label} ${i+1}`} onClick={() => onChange(items.filter((_,j) => j!==i))}><Trash2 size={14}/></button></div>)}<button type="button" className="b3-text-action" onClick={() => onChange([...items, schema.items?.type === 'object' ? {} : ''])}><Plus size={14}/> Add {label}</button></fieldset>
  }
  return <div className="b3-schema-field"><div className="b3-field-heading"><label htmlFor={fieldId}>{label}{required ? <span className="b3-required"> *</span> : null}</label>{ResourceControl && !schema.enum ? <button type="button" className="b3-text-action" onClick={() => {setBinding(!binding);onChange('')}}>{binding ? 'Use a value' : 'Insert a Resource'}</button> : null}</div>
    {binding && ResourceControl ? <ResourceControl value={value || ''} onChange={onChange}/> : schema.enum ? <select id={fieldId} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required}><option value="">Select…</option>{schema.enum.map((option, i) => <option key={String(option)} value={option}>{schema.enumNames?.[i] || option}</option>)}</select> : schema.type === 'boolean' ? <select id={fieldId} value={value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">Not set</option><option value="true">True</option><option value="false">False</option></select> : schema.format === 'html' ? <RichText label={label} value={value??''} onChange={onChange}/> : schema.format === 'multiline' ? <textarea id={fieldId} rows={6} value={value ?? ''} onChange={e => onChange(e.target.value)} required={required}/> : <input id={fieldId} type={schema.type === 'number' || schema.type === 'integer' ? 'number' : schema.format === 'date' ? 'date' : schema.format === 'date-time' ? 'datetime-local' : 'text'} min={schema.minimum} max={schema.maximum} step={schema.type==='integer' ? 1 : 'any'} value={value ?? ''} required={required} onChange={e => onChange(e.target.value === '' ? '' : ['number','integer'].includes(schema.type) ? Number(e.target.value) : e.target.value)}/>}
    {schema.description ? <p className="b3-help">{schema.description}</p> : null}
  </div>
}
function AddMapping({ onAdd, existing }) {
  const [key,setKey]=useState('')
  return <div className="b3-add-mapping"><input aria-label="New mapping name" placeholder="Field or parameter name" value={key} onChange={e=>setKey(e.target.value)}/><button type="button" className="b3-text-action" disabled={!key.trim()||existing.includes(key.trim())} onClick={()=>{onAdd(key.trim());setKey('')}}><Plus size={14}/> Add</button></div>
}
export default function SchemaFields({schema={},value={},onChange,ResourceControl,LookupControl}) {
  return <div className="b3-schema-fields">{Object.entries(schema.properties||{}).map(([name,field])=><SchemaField key={name} name={name} schema={field} value={value?.[name]} required={schema.required?.includes(name)} onChange={next=>onChange({...value,[name]:next})} ResourceControl={ResourceControl} LookupControl={LookupControl}/>)}</div>
}
