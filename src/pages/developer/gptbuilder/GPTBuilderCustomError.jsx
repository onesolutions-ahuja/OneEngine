import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../../../services/api'

const objectKey = (value) => String(value?.object_key || value?.api_name || value?.apiName || value?.key || value?.id || '')
const fieldKey = (value) => String(value?.api_name || value?.apiName || value?.field_key || value?.key || value?.id || '')
const fieldLabel = (value) => value?.label || value?.name || fieldKey(value)
const resourcePath = (resource) => resource?.path || (resource?.apiName ? `variables.${resource.apiName}` : '')

export const CUSTOM_ERROR_DEFAULTS = Object.freeze({
  location: 'record',
  field: '',
  messageMode: 'text',
  message: '',
  messageResource: '',
})

export function normalizeCustomErrorConfig(config = {}) {
  return { ...CUSTOM_ERROR_DEFAULTS, ...config }
}

export function customErrorConfigErrors(config = {}, resources = []) {
  const c = normalizeCustomErrorConfig(config)
  const errors = []
  if (!['record','field'].includes(c.location)) errors.push('Select where to show the error message.')
  if (c.location === 'field' && !c.field) errors.push('Select a field for the inline error.')
  if (!['text','resource'].includes(c.messageMode)) errors.push('Select an error message source.')
  if (c.messageMode === 'text') {
    if (!String(c.message || '').trim()) errors.push('Enter an Error Message.')
    if (String(c.message || '').length > 255) errors.push('Error Message must be 255 characters or fewer.')
  } else if (!resources.some((resource)=>resourcePath(resource)===c.messageResource && resource.isCollection !== true)) {
    errors.push('Select a text resource for the Error Message.')
  }
  return errors
}

export function customErrorRuntimeAction(instance) {
  const c = normalizeCustomErrorConfig(instance?.config)
  return {
    id: instance.id,
    key: 'CUSTOM_ERROR',
    label: instance.label,
    apiName: instance.apiName,
    description: instance.description || '',
    errorLocation: c.location,
    errorField: c.location === 'field' ? c.field : undefined,
    errorMessage: c.messageMode === 'resource' ? { path: c.messageResource } : c.message,
  }
}

export default function GPTBuilderCustomError({ draft, updateConfig, objects = [], startConfig = {}, resources = [], onConfiguredChange }) {
  const config = normalizeCustomErrorConfig(draft.config)
  const object = objects.find((item)=>objectKey(item)===startConfig.objectKey)
  const [fields,setFields]=useState([])
  useEffect(()=>{
    let live=true
    if(!object?.id){setFields([]);return()=>{live=false}}
    apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/fields`)
      .then((response)=>{if(live)setFields((Array.isArray(response?.data)?response.data:[]).filter((field)=>field?.active!==false && field?.readable!==false && String(field?.field_type||field?.data_type||'').toLowerCase()!=='compound'))})
      .catch(()=>{if(live)setFields([])})
    return()=>{live=false}
  },[object?.id])
  const errors=useMemo(()=>customErrorConfigErrors(config,resources),[JSON.stringify(config),JSON.stringify(resources)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const textResources=resources.filter((resource)=>resource?.isCollection!==true && ['text','string'].includes(String(resource?.dataType||'text').toLowerCase()))

  return <div className="gptb-gr gptb-custom-error">
    <section><h3>Where to Show the Error Message</h3>
      <fieldset className="gptb-gr-radio-group">
        <label><input type="radio" name={`custom-error-location-${draft.id}`} checked={config.location==='record'} onChange={()=>patch({location:'record',field:''})}/><span>In a window on a record page</span></label>
        <label><input type="radio" name={`custom-error-location-${draft.id}`} checked={config.location==='field'} onChange={()=>patch({location:'field'})}/><span>As an inline error on a field</span></label>
      </fieldset>
      {config.location==='field'?<label><span>Field <b>*</b></span><select value={config.field} onChange={(event)=>patch({field:event.target.value})}><option value="">{fields.length?'Select a field':'No supported fields available'}</option>{fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select></label>:null}
    </section>
    <section><h3>Error Message</h3>
      <fieldset className="gptb-gr-radio-group"><legend>Message Source</legend>
        <label><input type="radio" name={`custom-error-message-${draft.id}`} checked={config.messageMode==='text'} onChange={()=>patch({messageMode:'text',messageResource:''})}/><span>Enter text</span></label>
        <label><input type="radio" name={`custom-error-message-${draft.id}`} checked={config.messageMode==='resource'} onChange={()=>patch({messageMode:'resource',message:''})}/><span>Select a resource</span></label>
      </fieldset>
      {config.messageMode==='text'?<label><span>Error Message <b>*</b></span><textarea rows={4} maxLength={255} value={config.message} onChange={(event)=>patch({message:event.target.value})}/><small>{String(config.message||'').length}/255</small></label>:<label><span>Error Message Resource <b>*</b></span><select value={config.messageResource} onChange={(event)=>patch({messageResource:event.target.value})}><option value="">Select a text resource</option>{textResources.map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select></label>}
    </section>
    {errors.length?<div className="gptb-gr-errors"><b>Complete this Custom Error element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
