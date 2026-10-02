import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { apiRequest } from '../services/api'

function fieldKey(field){
  return field?.api_name||field?.apiName||field?.field_key||field?.fieldKey||''
}
function sourceKey(field){
  return field?.source_column||field?.sourceColumn||fieldKey(field)
}
function fieldType(field){
  const raw=String(field?.field_type||field?.fieldType||field?.type||'text').toLowerCase()
  if(raw==='formula')return String(field?.config?.resultType||'text').toLowerCase()
  return raw
}
function isAuditField(field){
  const key=String(fieldKey(field)||'').toLowerCase()
  const source=String(sourceKey(field)||'').toLowerCase()
  return ['created_at','updated_at','createdat','updatedat','created','updated'].includes(key)
    || ['created_at','updated_at','createdat','updatedat','created','updated'].includes(source)
}
function isFieldDisabled(field){
  return field?.writable===false
    || String(field?.field_type||'').toLowerCase()==='formula'
    || isAuditField(field)
}
function configOf(field){
  if(field?.config&&typeof field.config==='object')return field.config
  try{return JSON.parse(field?.config||'{}')}catch{return {}}
}
function initialValue(record,field){
  const key=fieldKey(field),source=sourceKey(field)
  const value=record?.[key]??record?.[source]
  return value==null?(fieldType(field)==='boolean'?false:''):value
}
function optionsOf(field){
  const source=field?.options||field?.field_options||field?.choices||[]
  return Array.isArray(source)?source:[]
}
function optionValue(option){
  return typeof option==='object'?(option?.value??option?.key??option?.id??''):option
}
function optionLabel(option){
  return typeof option==='object'?(option?.label??option?.name??optionValue(option)):option
}

function MetadataField({field,value,onChange}){
  const rawType=fieldType(field)
  const key=fieldKey(field)
  const label=field?.label||field?.name||key
  const disabled=isFieldDisabled(field)
  const config=configOf(field)
  const related=config.relatedObjectKey||config.related_object_key
  const type=related&&rawType!=='formula'?'lookup':rawType
  const [lookups,setLookups]=useState([])
  const [lookupError,setLookupError]=useState('')

  useEffect(()=>{
    if(type!=='lookup'||!related||disabled)return
    let live=true
    apiRequest(`/api/platform/objects/${encodeURIComponent(related)}/records?limit=100`)
      .then(r=>{
        if(!live)return
        const rows=r?.records||r?.data?.records||r?.data||[]
        setLookups(Array.isArray(rows)?rows:[])
      })
      .catch(err=>live&&setLookupError(err?.message||'Unable to load lookup values'))
    return()=>{live=false}
  },[type,config.relatedObjectKey,config.related_object_key,disabled])

  let control=null
  if(type==='boolean'){
    control=<button type="button" className={`mac-switch ${value===true?'is-on':''}`} disabled={disabled} onClick={()=>onChange(value!==true)}><span/></button>
  }else if(['text_area','long_text','rich_text'].includes(type)){
    control=<textarea rows={type==='rich_text'?6:3} maxLength={Number(config.maxLength??config.max_length)||(type==='text_area'?255:32768)} value={value??''} disabled={disabled} required={field?.required===true} onChange={e=>onChange(e.target.value)}/>
  }else if(type==='picklist'||type==='select'){
    control=<select value={value??''} disabled={disabled} required={field?.required===true} onChange={e=>onChange(e.target.value)}><option value="">Select {label}</option>{optionsOf(field).map(o=><option key={String(optionValue(o))} value={String(optionValue(o))}>{String(optionLabel(o))}</option>)}</select>
  }else if(type==='multiselect'){
    const selected=Array.isArray(value)?value.map(String):[]
    control=<select multiple value={selected} disabled={disabled} required={field?.required===true} onChange={e=>onChange(Array.from(e.target.selectedOptions,o=>o.value))}>{optionsOf(field).map(o=><option key={String(optionValue(o))} value={String(optionValue(o))}>{String(optionLabel(o))}</option>)}</select>
  }else if(type==='lookup'&&lookups.length){
    control=<select value={typeof value==='object'?(value?.id||''):(value??'')} disabled={disabled} required={field?.required===true} onChange={e=>onChange(e.target.value)}><option value="">Select {label}</option>{lookups.map(row=>{const id=row?.id??row?.record_id;const text=row?.label??row?.name??row?.full_name??row?.username??row?.display_name??row?.title??id;return <option key={String(id)} value={String(id)}>{String(text)}</option>})}</select>
  }else{
    const htmlType=['email','date','datetime-local','url','tel'].includes(type)?type:type==='datetime'?'datetime-local':type==='phone'?'tel':['number','decimal','currency'].includes(type)?'number':'text'
    control=<input type={htmlType} step={['decimal','currency'].includes(type)?'any':undefined} value={typeof value==='object'?'':(value??'')} disabled={disabled} required={field?.required===true} onChange={e=>onChange(['number','decimal','currency'].includes(type)&&e.target.value!==''?Number(e.target.value):e.target.value)}/>
  }

  return <label className={`metadata-form-field ${type==='boolean'?'is-toggle':''}`}>
    <span>{label}{field?.required?<b>*</b>:null}</span>
    {control}
    {field?.description?<small>{field.description}</small>:null}
    {lookupError?<small className="is-error">{lookupError}</small>:null}
  </label>
}

export default function MetadataRecordFormModal({objectKey,record=null,mode='edit',title,onClose,onSaved}){
  const [fields,setFields]=useState([])
  const [values,setValues]=useState({})
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const recordId=record?.id||record?.record_id||''

  useEffect(()=>{
    let live=true
    setLoading(true);setError('')
    const pageType=mode==='create'?'create':'edit'
    apiRequest(`/api/platform/runtime-forms/${encodeURIComponent(objectKey)}?pageType=${pageType}`)
      .then(r=>{
        if(!live)return
        const rows=(Array.isArray(r?.data?.fields)?r.data.fields:[])
          .filter(f=>f?.active!==false)
          .filter(f=>f?.writable!==false||mode==='edit')
          .sort((a,b)=>Number(a.display_order||a.displayOrder||0)-Number(b.display_order||b.displayOrder||0))
        if(!r?.data?.object?.id)throw new Error(`Platform metadata for ${objectKey} is unavailable`)
        setFields(rows)
        setValues(Object.fromEntries(rows.map(f=>[fieldKey(f),initialValue(record,f)])))
      })
      .catch(err=>live&&setError(err?.message||'Unable to load metadata form'))
      .finally(()=>live&&setLoading(false))
    return()=>{live=false}
  },[objectKey,mode,recordId])

  const editable=useMemo(()=>fields.filter(f=>!isFieldDisabled(f)),[fields])
  const submit=async e=>{
    e.preventDefault()
    for(const field of editable){
      const key=fieldKey(field),value=values[key]
      if(field?.required&&(value==null||value===''||(Array.isArray(value)&&!value.length))){
        setError(`${field.label||key} is required.`);return
      }
    }
    try{
      setSaving(true);setError('')
      const editing=mode==='edit'&&recordId
      const payload=Object.fromEntries(editable.map(f=>[fieldKey(f),values[fieldKey(f)]]))
      const r=await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records${editing?`/${encodeURIComponent(recordId)}`:''}`,{
        method:editing?'PUT':'POST',
        body:JSON.stringify({data:payload}),
      })
      if(r?.success===false)throw new Error(r?.message||'Unable to save record')
      await onSaved?.(r?.data,r)
    }catch(err){setError(err?.message||'Unable to save record')}
    finally{setSaving(false)}
  }

  return <div className="module-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!saving&&onClose()}>
    <form className="module-modal metadata-record-form-modal" onSubmit={submit}>
      <header><div><strong>{title||`${mode==='create'?'New':'Edit'} ${objectKey}`}</strong><span>Rendered from live Platform object metadata.</span></div><button type="button" onClick={onClose}><X size={16}/></button></header>
      <div className="module-modal-body metadata-record-form-body">
        {error?<div className="module-inline-error metadata-form-full">{error}</div>:null}
        {loading?<div className="module-state metadata-form-full">Loading metadata form…</div>:fields.length?fields.map(field=><MetadataField key={field.id||fieldKey(field)} field={field} value={values[fieldKey(field)]} onChange={value=>setValues(v=>({...v,[fieldKey(field)]:value}))}/>):<div className="module-state metadata-form-full">No active fields are configured for this object.</div>}
      </div>
      <footer className="module-modal-footer"><button type="button" onClick={onClose}>Cancel</button><button className="module-primary-button" disabled={saving||loading||!editable.length}>{saving?'Saving…':'Save'}</button></footer>
    </form>
  </div>
}
