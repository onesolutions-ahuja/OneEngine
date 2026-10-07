import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../services/api'

function optionsFor(field) {
  const rows = Array.isArray(field?.options) ? field.options : Array.isArray(field?.config?.options) ? field.config.options : []
  return rows.map((item) => typeof item === 'object' && item !== null
    ? { value: item.value ?? item.key ?? item.id ?? '', label: item.label ?? item.name ?? String(item.value ?? item.key ?? item.id ?? '') }
    : { value: item, label: String(item) })
}

function sectionOf(field) {
  return String(field?.config?.settingsSection || field?.config?.settings_section || '').trim()
}

function fieldControl(field, value, disabled, onChange, lookupOptions = []) {
  const type=String(field?.field_type||'text').toLowerCase()
  const options=optionsFor(field)
  if(type==='boolean') return <button type="button" className={`mac-switch ${value?'is-on':''}`} disabled={disabled} onClick={()=>onChange(!value)}><span/></button>
  if(type==='lookup'&&lookupOptions.length) return <select value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value||null)}><option value="">Select…</option>{lookupOptions.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>
  if(type==='multiselect') {
    const selected=Array.isArray(value)?value:[]
    return <select multiple value={selected} disabled={disabled} onChange={e=>onChange([...e.target.selectedOptions].map(o=>o.value))}>{options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>
  }
  if(['select','picklist'].includes(type)||options.length) return <select value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>
  if(['number','decimal','currency'].includes(type)) return <input type="number" step={type==='number'?'1':'0.01'} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}/>
  return <input type={type==='email'?'email':type==='phone'?'tel':'text'} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)}/>
}

export default function MetadataSettingsSection({ section }) {
  const [host,setHost]=useState(null)
  const [fields,setFields]=useState([])
  const [record,setRecord]=useState(null)
  const [permissions,setPermissions]=useState(null)
  const [lookupOptions,setLookupOptions]=useState({})
  const [draft,setDraft]=useState({})
  const [saving,setSaving]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=async()=>{
    setLoading(true);setError('')
    try{
      const catalog=await apiRequest('/api/platform/runtime/settings-hosts')
      const objects=Array.isArray(catalog?.data)?catalog.data:[]
      const candidate=objects.find(object=>{
        const config=object?.config||{}
        return (config.settingsSectionSource==='field-config'||config.settings_section_source==='field-config')
      })
      if(!candidate) throw new Error('System Settings metadata is unavailable')
      const key=String(candidate.object_key||candidate.objectKey||'system_settings')
      const [fieldRes,recordRes,permissionRes]=await Promise.all([
        apiRequest(`/api/platform/objects/${encodeURIComponent(candidate.id)}/fields`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(key)}/records?page=1&pageSize=10`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(candidate.id)}/effective-permissions`),
      ])
      const allFields=Array.isArray(fieldRes?.data)?fieldRes.data:[]
      const rows=Array.isArray(recordRes?.records)?recordRes.records:Array.isArray(recordRes?.data)?recordRes.data:[]
      const sectionFields=allFields.filter(field=>field.active!==false&&sectionOf(field)===String(section||''))
      const lookupPairs=await Promise.all(sectionFields.filter(field=>String(field.field_type||'').toLowerCase()==='lookup').map(async field=>{
        const relatedKey=field?.config?.relatedObjectKey||field?.config?.related_object_key
        if(!relatedKey)return [field.api_name,[]]
        try{
          const response=await apiRequest(`/api/platform/objects/${encodeURIComponent(relatedKey)}/records?page=1&pageSize=500`)
          const related=Array.isArray(response?.records)?response.records:Array.isArray(response?.data)?response.data:[]
          return [field.api_name,related.map(row=>({value:row.id,label:String(Object.entries(row).find(([key,value])=>key!=='id'&&value!=null&&['string','number'].includes(typeof value)&&String(value).trim())?.[1]||row.id)}))]
        }catch{return [field.api_name,[]]}
      }))
      setHost({...candidate,key})
      setFields(sectionFields)
      setRecord(rows[0]||null)
      setDraft(rows[0]||{})
      setPermissions(permissionRes?.data||null)
      setLookupOptions(Object.fromEntries(lookupPairs))
    }catch(err){setError(err?.message||'Unable to load settings metadata')}
    finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[section])

  const visibleFields=useMemo(()=>fields.filter(field=>field.readable!==false&&field?.config?.settingsHidden!==true&&field?.config?.settings_hidden!==true),[fields])
  const canEdit=permissions?.can_edit===true

  const save=async(field,value)=>{
    if(!host||!record?.id||!field?.api_name||!canEdit)return
    setDraft(current=>({...current,[field.api_name]:value}))
    setSaving(field.api_name);setError('')
    try{
      const response=await apiRequest(`/api/platform/objects/${encodeURIComponent(host.key)}/records/${encodeURIComponent(record.id)}`,{
        method:'PUT',
        body:JSON.stringify({data:{[field.api_name]:value}}),
      })
      if(response?.success===false)throw new Error(response?.message||'Unable to save setting')
      setRecord(current=>({...current,[field.api_name]:value}))
    }catch(err){
      setDraft(current=>({...current,[field.api_name]:record?.[field.api_name]}))
      setError(err?.message||'Unable to save setting')
    }finally{setSaving('')}
  }

  if(loading)return <div className="module-state">Loading settings metadata…</div>
  if(error&&!visibleFields.length)return <div className="module-inline-error">{error}<button type="button" onClick={()=>void load()}>Retry</button></div>
  if(!visibleFields.length)return <div className="module-state compact">No metadata fields are configured for this section.</div>

  return <div className="metadata-settings-section">
    {error?<div className="module-inline-error">{error}</div>:null}
    {visibleFields.map(field=>{
      const writable=canEdit&&field.writable===true&&!['formula','rollup'].includes(String(field.field_type||'').toLowerCase())
      return <div className="settings-row" key={field.id||field.api_name}>
        <div><strong>{field.label||field.api_name}</strong>{field.description?<p>{field.description}</p>:null}</div>
        {fieldControl(field,draft?.[field.api_name],!writable||saving===field.api_name,value=>void save(field,value),lookupOptions[field.api_name]||[])}
      </div>
    })}
  </div>
}
