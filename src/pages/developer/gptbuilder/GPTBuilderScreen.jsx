import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Eye, GripVertical, Plus, Trash2 } from 'lucide-react'

const uid=(prefix='cmp')=>globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath=(resource)=>resource?`variables.${resource.apiName}`:''
const COMPONENTS=[
  ['DISPLAY_TEXT','Display Text','display'],['TEXT','Text','input'],['LONG_TEXT','Long Text Area','input'],['NUMBER','Number','input'],['CURRENCY','Currency','input'],
  ['CHECKBOX','Checkbox','input'],['PICKLIST','Picklist','input'],['RADIO','Radio Buttons','input'],['DATE','Date','input'],['DATETIME','Date/Time','input'],
  ['EMAIL','Email','input'],['PHONE','Phone','input'],['URL','URL','input'],['PASSWORD','Password','input'],['SECTION','Section','layout'],
  ['DATA_TABLE','Data Table','display'],['IMAGE','Image','display'],['LINK','Link','display'],['FILE_UPLOAD','File Upload','input'],['PROGRESS','Progress Indicator','display'],
]
const inputType=(type)=>['TEXT','LONG_TEXT','NUMBER','CURRENCY','CHECKBOX','PICKLIST','RADIO','DATE','DATETIME','EMAIL','PHONE','URL','PASSWORD','FILE_UPLOAD'].includes(type)
const dataTypeFor=(type)=>({NUMBER:'number',CURRENCY:'currency',CHECKBOX:'boolean',DATE:'date',DATETIME:'datetime',FILE_UPLOAD:'text'}[type]||'text')
const apiName=(label='Component')=>{
  let value=String(label).trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
  if(!value)value='Component'
  if(!/^[A-Za-z]/.test(value))value=`Component_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}
export const SCREEN_DEFAULTS=Object.freeze({
  showHeader:true,showFooter:true,allowBack:true,allowNext:true,allowFinish:true,allowPause:false,
  nextLabel:'Next',finishLabel:'Finish',previousLabel:'Previous',pauseLabel:'Pause',stageResource:'',
  components:[],
})
export function normalizeScreenConfig(config={}){return{...SCREEN_DEFAULTS,...config,components:Array.isArray(config.components)?config.components:[]}}
export function screenConfigErrors(config={}){
  const c=normalizeScreenConfig(config),errors=[],names=new Set()
  c.components.forEach((component,index)=>{
    if(!String(component.name||'').trim())errors.push(`Component ${index+1}: API Name is required.`)
    else if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(component.name)||component.name.endsWith('_')||component.name.includes('__'))errors.push(`Component ${index+1}: API Name is invalid.`)
    else if(names.has(component.name.toLowerCase()))errors.push(`Component ${index+1}: API Name must be unique.`)
    names.add(String(component.name||'').toLowerCase())
    if(inputType(component.type)&&!String(component.label||'').trim())errors.push(`Component ${index+1}: Label is required.`)
    if(component.type==='DISPLAY_TEXT'&&!String(component.text||'').trim())errors.push(`Component ${index+1}: enter display text.`)
    if(component.type==='SECTION'&&(!Number.isInteger(Number(component.columns))||Number(component.columns)<1||Number(component.columns)>4))errors.push(`Component ${index+1}: Section must have 1 to 4 columns.`)
    if(component.visibilityMode&&component.visibilityMode!=='always'){
      if(!component.visibilityResource)errors.push(`Component ${index+1}: select a visibility resource.`)
      if(['equals','not_equals','contains','not_contains','greater_than','greater_or_equal','less_than','less_or_equal'].includes(component.visibilityOperator)&&String(component.visibilityValue??'')==='')errors.push(`Component ${index+1}: enter a visibility comparison value.`)
    }
  })
  return errors
}
export function screenRuntimeAction(instance){
  const c=normalizeScreenConfig(instance?.config)
  return{
    id:instance.id,key:'SCREEN',label:instance.label,apiName:instance.apiName,description:instance.description||'',
    screen:{label:instance.label,apiName:instance.apiName,showHeader:c.showHeader,components:c.components,currentStageResource:c.stageResource||undefined},
    showFooter:c.showFooter,allowBack:c.allowBack,allowNext:c.allowNext,allowFinish:c.allowFinish,allowPause:c.allowPause,
    nextLabel:c.nextLabel,finishLabel:c.finishLabel,previousLabel:c.previousLabel,pauseLabel:c.pauseLabel,
  }
}
function defaultComponent(type,label){
  const name=apiName(label)
  return{id:uid(),type,name,label,input:inputType(type),required:false,readOnly:false,helpText:'',defaultValue:'',visibilityMode:'always',visibilityResource:'',visibilityOperator:'truthy',visibilityValue:'',columns:type==='SECTION'?2:undefined,text:type==='DISPLAY_TEXT'?'Display text':undefined,options:['Option 1','Option 2']}
}
function ComponentPreview({component,selected,onSelect}){
  return <button type="button" className={`gptb-screen-preview-component${selected?' is-selected':''}`} onClick={onSelect}>
    <span className="gptb-screen-drag"><GripVertical size={13}/></span>
    <span className="gptb-screen-preview-body">
      {component.visibilityMode&&component.visibilityMode!=='always'?<Eye size={11}/>:null}
      <b>{component.type==='DISPLAY_TEXT'?(component.text||'Display text'):(component.label||component.name)}</b>
      {inputType(component.type)?<span className="gptb-screen-mock-input">{component.type==='CHECKBOX'?'☐':'Input'}</span>:null}
      {component.type==='SECTION'?<span>{component.columns||2} columns</span>:null}
    </span>
  </button>
}
export default function GPTBuilderScreen({draft,updateConfig,resources=[],onResourcesChange,onConfiguredChange}){
  const config=normalizeScreenConfig(draft.config)
  const [selectedId,setSelectedId]=useState(config.components[0]?.id||'screen')
  const selected=config.components.find((component)=>component.id===selectedId)
  const errors=useMemo(()=>screenConfigErrors(config),[JSON.stringify(config)])
  useEffect(()=>{onConfiguredChange?.(errors.length===0,errors)},[JSON.stringify(errors)])
  const patch=(changes)=>updateConfig({...config,...changes})
  const patchComponent=(id,changes)=>patch({components:config.components.map((component)=>component.id===id?{...component,...changes}:component)})
  const addComponent=(type,label)=>{
    const base=defaultComponent(type,label)
    const used=new Set(config.components.map((component)=>component.name.toLowerCase()))
    let name=base.name,n=2;while(used.has(name.toLowerCase()))name=`${base.name}_${n++}`
    const next={...base,name}
    patch({components:[...config.components,next]});setSelectedId(next.id)
  }
  const removeComponent=(id)=>{patch({components:config.components.filter((component)=>component.id!==id)});setSelectedId('screen')}
  useEffect(()=>{
    if(!draft.id||!onResourcesChange)return
    const generated=config.components.filter((component)=>inputType(component.type)&&component.name).map((component)=>({
      id:`screen-${draft.id}-${component.id}`,apiName:component.name,label:component.label||component.name,dataType:dataTypeFor(component.type),isCollection:false,
      generatedByElementId:draft.id,generatedByElementKey:'screen',writable:true,
    }))
    const other=resources.filter((resource)=>resource.generatedByElementId!==draft.id)
    const next=[...other,...generated]
    if(JSON.stringify(next)!==JSON.stringify(resources))onResourcesChange(next)
  },[draft.id,JSON.stringify(config.components)])

  return <div className="gptb-screen-builder">
    <aside className="gptb-screen-palette"><h3>Components</h3>{['input','display','layout'].map((category)=><div key={category}><h4>{category}</h4>{COMPONENTS.filter(([, ,kind])=>kind===category).map(([type,label])=><button type="button" key={type} onClick={()=>addComponent(type,label)}><Plus size={12}/>{label}</button>)}</div>)}</aside>
    <main className="gptb-screen-preview"><button type="button" className={`gptb-screen-frame-header${selectedId==='screen'?' is-selected':''}`} onClick={()=>setSelectedId('screen')}>{config.showHeader?draft.label:'Header hidden'}</button>
      <div className="gptb-screen-preview-content">{config.components.length?config.components.map((component)=><ComponentPreview key={component.id} component={component} selected={selectedId===component.id} onSelect={()=>setSelectedId(component.id)}/>):<span className="gptb-screen-empty">Add components from the palette.</span>}</div>
      {config.showFooter?<footer><button type="button" disabled>{config.allowBack?config.previousLabel:'Previous hidden'}</button><button type="button" disabled>{config.allowNext?config.nextLabel:config.finishLabel}</button></footer>:null}
    </main>
    <aside className="gptb-screen-properties">
      {selectedId==='screen'?<><h3>Screen Properties</h3><section><h4>Configure Frame</h4><label className="gptb-properties-check"><input type="checkbox" checked={config.showHeader} onChange={(event)=>patch({showHeader:event.target.checked})}/><span>Show Header</span></label><label className="gptb-properties-check"><input type="checkbox" checked={config.showFooter} onChange={(event)=>patch({showFooter:event.target.checked})}/><span>Show Footer</span></label></section>
      <section><h4>Control Navigation</h4>{[['allowBack','Previous'],['allowNext','Next'],['allowFinish','Finish'],['allowPause','Pause']].map(([key,label])=><label className="gptb-properties-check" key={key}><input type="checkbox" checked={config[key]===true} onChange={(event)=>patch({[key]:event.target.checked})}/><span>{label}</span></label>)}</section>
      <section><h4>Button Labels</h4><label><span>Next</span><input value={config.nextLabel} onChange={(event)=>patch({nextLabel:event.target.value})}/></label><label><span>Finish</span><input value={config.finishLabel} onChange={(event)=>patch({finishLabel:event.target.value})}/></label><label><span>Previous</span><input value={config.previousLabel} onChange={(event)=>patch({previousLabel:event.target.value})}/></label></section>
      </>:selected?<><div className="gptb-screen-property-head"><h3>{selected.label||selected.type}</h3><button type="button" aria-label="Delete component" onClick={()=>removeComponent(selected.id)}><Trash2 size={13}/></button></div>
        <label><span>API Name <b>*</b></span><input value={selected.name||''} onChange={(event)=>patchComponent(selected.id,{name:event.target.value})}/></label>
        {selected.type==='DISPLAY_TEXT'?<label><span>Text <b>*</b></span><textarea rows={4} value={selected.text||''} onChange={(event)=>patchComponent(selected.id,{text:event.target.value})}/></label>:null}
        {inputType(selected.type)?<><label><span>Label <b>*</b></span><input value={selected.label||''} onChange={(event)=>patchComponent(selected.id,{label:event.target.value})}/></label><label><span>Help Text</span><input value={selected.helpText||''} onChange={(event)=>patchComponent(selected.id,{helpText:event.target.value})}/></label><label className="gptb-properties-check"><input type="checkbox" checked={selected.required===true} onChange={(event)=>patchComponent(selected.id,{required:event.target.checked})}/><span>Require</span></label><label className="gptb-properties-check"><input type="checkbox" checked={selected.readOnly===true} onChange={(event)=>patchComponent(selected.id,{readOnly:event.target.checked})}/><span>Read Only</span></label><label><span>Default Value</span><input value={selected.defaultValue??''} onChange={(event)=>patchComponent(selected.id,{defaultValue:event.target.value})}/></label></>:null}
        {selected.type==='SECTION'?<label><span>Columns</span><select value={selected.columns||2} onChange={(event)=>patchComponent(selected.id,{columns:Number(event.target.value)})}>{[1,2,3,4].map((n)=><option key={n} value={n}>{n}</option>)}</select></label>:null}
        <section><h4>Set Component Visibility</h4><label><span>When to Display Component</span><select value={selected.visibilityMode||'always'} onChange={(event)=>patchComponent(selected.id,{visibilityMode:event.target.value})}><option value="always">Always</option><option value="condition">When conditions are met</option></select></label>{selected.visibilityMode==='condition'?<><label><span>Resource</span><select value={selected.visibilityResource||''} onChange={(event)=>patchComponent(selected.id,{visibilityResource:event.target.value})}><option value="">Select a resource</option>{resources.filter((resource)=>resource.generatedByElementId!==draft.id||resource.apiName!==selected.name).map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select></label><label><span>Operator</span><select value={selected.visibilityOperator||'truthy'} onChange={(event)=>patchComponent(selected.id,{visibilityOperator:event.target.value})}>{[['truthy','Is True'],['falsy','Is False'],['is_empty','Is Empty'],['is_not_empty','Is Not Empty'],['equals','Equals'],['not_equals','Does Not Equal'],['contains','Contains'],['greater_than','Greater Than'],['less_than','Less Than']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{!['truthy','falsy','is_empty','is_not_empty'].includes(selected.visibilityOperator)?<label><span>Value</span><input value={selected.visibilityValue??''} onChange={(event)=>patchComponent(selected.id,{visibilityValue:event.target.value})}/></label>:null}</>:null}</section>
      </>:null}
    </aside>
    {errors.length?<div className="gptb-screen-errors"><b>Complete this Screen element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
