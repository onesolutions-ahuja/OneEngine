import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Eye, GripVertical, Plus, Trash2 } from 'lucide-react'

const uid=(prefix='cmp')=>globalThis.crypto?.randomUUID?.()||`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
const resourcePath=(resource)=>resource?`variables.${resource.apiName}`:''
const COMPONENTS=[
  ['DISPLAY_TEXT','Display Text','display'],['TEXT','Text','input'],['LONG_TEXT','Long Text Area','input'],['NUMBER','Number','input'],['CURRENCY','Currency','input'],
  ['CHECKBOX','Checkbox','input'],['CHECKBOX_GROUP','Checkbox Group','input'],['PICKLIST','Picklist','input'],['MULTI_SELECT','Multi-Select Picklist','input'],['RADIO','Radio Buttons','input'],['DATE','Date','input'],['DATETIME','Date/Time','input'],
  ['EMAIL','Email','input'],['PHONE','Phone','input'],['URL','URL','input'],['PASSWORD','Password','input'],['SLIDER','Slider','input'],['TOGGLE','Toggle','input'],['LOOKUP','Lookup','input'],['ADDRESS','Address','input'],['NAME','Name','input'],['SECTION','Section','layout'],
  ['DATA_TABLE','Data Table','display'],['IMAGE','Image','display'],['LINK','Link','display'],['FILE_UPLOAD','File Upload','input'],['PROGRESS','Progress Indicator','display'],
]
const inputType=(type)=>['TEXT','LONG_TEXT','NUMBER','CURRENCY','CHECKBOX','CHECKBOX_GROUP','PICKLIST','MULTI_SELECT','RADIO','DATE','DATETIME','EMAIL','PHONE','URL','PASSWORD','SLIDER','TOGGLE','LOOKUP','ADDRESS','NAME','FILE_UPLOAD'].includes(type)
const dataTypeFor=(type)=>({NUMBER:'number',CURRENCY:'currency',SLIDER:'number',CHECKBOX:'boolean',TOGGLE:'boolean',CHECKBOX_GROUP:'text',MULTI_SELECT:'text',DATE:'date',DATETIME:'datetime',ADDRESS:'object',NAME:'object',FILE_UPLOAD:'text'}[type]||'text')
const apiName=(label='Component')=>{
  let value=String(label).trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
  if(!value)value='Component'
  if(!/^[A-Za-z]/.test(value))value=`Component_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}
export const SCREEN_DEFAULTS=Object.freeze({
  showHeader:true,showFooter:true,allowBack:true,allowNext:true,allowFinish:true,allowPause:false,
  nextLabel:'Next',finishLabel:'Finish',previousLabel:'Previous',pauseLabel:'Pause',stageResource:'',
  style:{container:{backgroundColor:'',borderColor:'',borderWidth:'',borderRadius:''},header:{backgroundColor:'',textColor:''},footer:{backgroundColor:'',buttonStyle:''}},
  components:[],
})
export function normalizeScreenConfig(config={}){return{...SCREEN_DEFAULTS,...config,style:{...SCREEN_DEFAULTS.style,...(config.style||{}),container:{...SCREEN_DEFAULTS.style.container,...(config.style?.container||{})},header:{...SCREEN_DEFAULTS.style.header,...(config.style?.header||{})},footer:{...SCREEN_DEFAULTS.style.footer,...(config.style?.footer||{})}},components:Array.isArray(config.components)?config.components:[]}}
export function screenConfigErrors(config={}){
  const c=normalizeScreenConfig(config),errors=[],names=new Set()
  c.components.forEach((component,index)=>{
    if(!String(component.name||'').trim())errors.push(`Component ${index+1}: API Name is required.`)
    else if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(component.name)||component.name.endsWith('_')||component.name.includes('__'))errors.push(`Component ${index+1}: API Name is invalid.`)
    else if(names.has(component.name.toLowerCase()))errors.push(`Component ${index+1}: API Name must be unique.`)
    names.add(String(component.name||'').toLowerCase())
    if(inputType(component.type)&&!String(component.label||'').trim())errors.push(`Component ${index+1}: Label is required.`)
    if(component.type==='DISPLAY_TEXT'&&!String(component.text||'').trim())errors.push(`Component ${index+1}: enter display text.`)
    if(component.type==='SECTION'){
      if(!Number.isInteger(Number(component.columns))||Number(component.columns)<1||Number(component.columns)>4)errors.push(`Component ${index+1}: Section must have 1 to 4 columns.`)
      const widths=Array.isArray(component.columnWidths)?component.columnWidths:[]
      if(widths.length!==Number(component.columns)||widths.some((width)=>!Number.isInteger(Number(width))||Number(width)<1||Number(width)>12)||widths.reduce((sum,width)=>sum+Number(width),0)!==12)errors.push(`Component ${index+1}: Section column widths must total 12.`)
      if(component.includeHeader===true&&!String(component.heading||'').trim())errors.push(`Component ${index+1}: enter a section header.`)
    }
    if(!Number.isInteger(Number(component.width||12))||Number(component.width||12)<1||Number(component.width||12)>12)errors.push(`Component ${index+1}: width must be 1 to 12 columns.`)
    if(!['top','center','bottom'].includes(String(component.verticalAlignment||'top')))errors.push(`Component ${index+1}: select a vertical alignment.`)
    if(component.visibilityMode&&component.visibilityMode!=='always'){
      const conditions=Array.isArray(component.visibilityConditions)?component.visibilityConditions:[]
      if(!conditions.length)errors.push(`Component ${index+1}: add at least one visibility condition.`)
      conditions.forEach((condition,conditionIndex)=>{
        if(!condition.resource)errors.push(`Component ${index+1}, visibility condition ${conditionIndex+1}: select a resource.`)
        if(!condition.operator)errors.push(`Component ${index+1}, visibility condition ${conditionIndex+1}: select an operator.`)
        if(!['truthy','falsy','is_empty','is_not_empty'].includes(condition.operator)&&String(condition.value??'')==='')errors.push(`Component ${index+1}, visibility condition ${conditionIndex+1}: enter a comparison value.`)
      })
      if(component.visibilityMode==='custom'&&!String(component.visibilityLogic||'').trim())errors.push(`Component ${index+1}: enter custom visibility logic.`)
    }
  })
  return errors
}
export function screenRuntimeAction(instance){
  const c=normalizeScreenConfig(instance?.config)
  return{
    id:instance.id,key:'SCREEN',label:instance.label,apiName:instance.apiName,description:instance.description||'',
    screen:{label:instance.label,apiName:instance.apiName,showHeader:c.showHeader,style:c.style,components:c.components,currentStageResource:c.stageResource||undefined},
    showFooter:c.showFooter,allowBack:c.allowBack,allowNext:c.allowNext,allowFinish:c.allowFinish,allowPause:c.allowPause,
    nextLabel:c.nextLabel,finishLabel:c.finishLabel,previousLabel:c.previousLabel,pauseLabel:c.pauseLabel,
  }
}
function defaultComponent(type,label){
  const name=apiName(label)
  return{id:uid(),type,name,label,input:inputType(type),required:false,readOnly:false,helpText:'',defaultValue:'',width:12,verticalAlignment:'top',visibilityMode:'always',visibilityConditions:[],visibilityLogic:'',columns:type==='SECTION'?2:undefined,includeHeader:type==='SECTION'?false:undefined,heading:type==='SECTION'?label:undefined,collapsible:type==='SECTION'?false:undefined,columnWidths:type==='SECTION'?[6,6]:undefined,text:type==='DISPLAY_TEXT'?'Display text':undefined,options:['Option 1','Option 2']}
}
function ComponentPreview({component,selected,onSelect,onDragStart,onDragOver,onDrop}){
  return <button type="button" draggable className={`gptb-screen-preview-component${selected?' is-selected':''}`} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onClick={onSelect}>
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
  const [propertyTab,setPropertyTab]=useState('details')
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
  const moveComponent=(sourceId,targetId)=>{
    if(!sourceId||!targetId||sourceId===targetId)return
    const next=[...config.components],from=next.findIndex((component)=>component.id===sourceId),to=next.findIndex((component)=>component.id===targetId)
    if(from<0||to<0)return
    const [item]=next.splice(from,1);next.splice(to,0,item);patch({components:next})
  }
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
    <aside className="gptb-screen-palette"><h3>Components</h3>{['input','display','layout'].map((category)=><div key={category}><h4>{category}</h4>{COMPONENTS.filter(([, ,kind])=>kind===category).map(([type,label])=><button type="button" draggable key={type} onDragStart={(event)=>{event.dataTransfer.setData('application/x-gptbuilder-screen-component',JSON.stringify({type,label}))}} onClick={()=>addComponent(type,label)}><Plus size={12}/>{label}</button>)}</div>)}</aside>
    <main className="gptb-screen-preview"><button type="button" className={`gptb-screen-frame-header${selectedId==='screen'?' is-selected':''}`} onClick={()=>{setSelectedId('screen');setPropertyTab('details')}}>{config.showHeader?draft.label:'Header hidden'}</button>
      <div className="gptb-screen-preview-content" onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{const raw=event.dataTransfer.getData('application/x-gptbuilder-screen-component');if(raw){event.preventDefault();try{const item=JSON.parse(raw);addComponent(item.type,item.label)}catch{}}}}>{config.components.length?config.components.map((component)=><ComponentPreview key={component.id} component={component} selected={selectedId===component.id} onSelect={()=>{setSelectedId(component.id);setPropertyTab('details')}} onDragStart={(event)=>event.dataTransfer.setData('application/x-gptbuilder-screen-existing',component.id)} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{const source=event.dataTransfer.getData('application/x-gptbuilder-screen-existing');if(source){event.preventDefault();moveComponent(source,component.id)}}}/>):<span className="gptb-screen-empty">Drag components here or add them from the palette.</span>}</div>
      {config.showFooter?<footer><button type="button" disabled>{config.allowBack?config.previousLabel:'Previous hidden'}</button><button type="button" disabled>{config.allowNext?config.nextLabel:config.finishLabel}</button></footer>:null}
    </main>
    <aside className="gptb-screen-properties">
      <div className="gptb-screen-property-tabs"><button type="button" className={propertyTab==='details'?'is-active':''} onClick={()=>setPropertyTab('details')}>Details</button><button type="button" className={propertyTab==='style'?'is-active':''} onClick={()=>setPropertyTab('style')}>Style</button></div>
      {selectedId==='screen'?(propertyTab==='details'?<><h3>Screen Properties</h3><section><h4>Configure Frame</h4><label className="gptb-properties-check"><input type="checkbox" checked={config.showHeader} onChange={(event)=>patch({showHeader:event.target.checked})}/><span>Show Header</span></label><label className="gptb-properties-check"><input type="checkbox" checked={config.showFooter} onChange={(event)=>patch({showFooter:event.target.checked})}/><span>Show Footer</span></label></section>
      <section><h4>Control Navigation</h4>{[['allowBack','Previous'],['allowNext','Next'],['allowFinish','Finish'],['allowPause','Pause']].map(([key,label])=><label className="gptb-properties-check" key={key}><input type="checkbox" checked={config[key]===true} onChange={(event)=>patch({[key]:event.target.checked})}/><span>{label}</span></label>)}</section>
      <section><h4>Button Labels</h4><label><span>Next</span><input value={config.nextLabel} onChange={(event)=>patch({nextLabel:event.target.value})}/></label><label><span>Finish</span><input value={config.finishLabel} onChange={(event)=>patch({finishLabel:event.target.value})}/></label><label><span>Previous</span><input value={config.previousLabel} onChange={(event)=>patch({previousLabel:event.target.value})}/></label></section>
      </>:<><h3>Screen Style</h3><section><h4>Set Container Style</h4><label><span>Background Color</span><input value={config.style.container.backgroundColor} onChange={(event)=>patch({style:{...config.style,container:{...config.style.container,backgroundColor:event.target.value}}})} placeholder="#ffffff or theme value"/></label><label><span>Border Color</span><input value={config.style.container.borderColor} onChange={(event)=>patch({style:{...config.style,container:{...config.style.container,borderColor:event.target.value}}})}/></label><label><span>Border Width</span><input value={config.style.container.borderWidth} onChange={(event)=>patch({style:{...config.style,container:{...config.style.container,borderWidth:event.target.value}}})} placeholder="1px"/></label><label><span>Border Radius</span><input value={config.style.container.borderRadius} onChange={(event)=>patch({style:{...config.style,container:{...config.style.container,borderRadius:event.target.value}}})} placeholder="4px"/></label></section><section><h4>Set Header Style</h4><label><span>Background Color</span><input value={config.style.header.backgroundColor} onChange={(event)=>patch({style:{...config.style,header:{...config.style.header,backgroundColor:event.target.value}}})}/></label><label><span>Text Color</span><input value={config.style.header.textColor} onChange={(event)=>patch({style:{...config.style,header:{...config.style.header,textColor:event.target.value}}})}/></label></section><section><h4>Set Footer Style</h4><label><span>Background Color</span><input value={config.style.footer.backgroundColor} onChange={(event)=>patch({style:{...config.style,footer:{...config.style.footer,backgroundColor:event.target.value}}})}/></label><label><span>Button Style</span><input value={config.style.footer.buttonStyle} onChange={(event)=>patch({style:{...config.style,footer:{...config.style.footer,buttonStyle:event.target.value}}})}/></label></section></>):selected?(propertyTab==='details'?<><div className="gptb-screen-property-head"><h3>{selected.label||selected.type}</h3><button type="button" aria-label="Delete component" onClick={()=>removeComponent(selected.id)}><Trash2 size={13}/></button></div>
        <label><span>API Name <b>*</b></span><input value={selected.name||''} onChange={(event)=>patchComponent(selected.id,{name:event.target.value})}/></label>
        {selected.type==='DISPLAY_TEXT'?<label><span>Text <b>*</b></span><textarea rows={4} value={selected.text||''} onChange={(event)=>patchComponent(selected.id,{text:event.target.value})}/></label>:null}
        {inputType(selected.type)?<><label><span>Label <b>*</b></span><input value={selected.label||''} onChange={(event)=>patchComponent(selected.id,{label:event.target.value})}/></label><label><span>Help Text</span><input value={selected.helpText||''} onChange={(event)=>patchComponent(selected.id,{helpText:event.target.value})}/></label><label className="gptb-properties-check"><input type="checkbox" checked={selected.required===true} onChange={(event)=>patchComponent(selected.id,{required:event.target.checked})}/><span>Require</span></label><label className="gptb-properties-check"><input type="checkbox" checked={selected.readOnly===true} onChange={(event)=>patchComponent(selected.id,{readOnly:event.target.checked})}/><span>Read Only</span></label><label><span>Default Value</span><input value={selected.defaultValue??''} onChange={(event)=>patchComponent(selected.id,{defaultValue:event.target.value})}/></label></>:null}
        {selected.type==='SECTION'?<section className="gptb-screen-section-config"><h4>Configure Section</h4><label className="gptb-properties-check"><input type="checkbox" checked={selected.includeHeader===true} onChange={(event)=>patchComponent(selected.id,{includeHeader:event.target.checked,collapsible:event.target.checked?selected.collapsible:false})}/><span>Include Header</span></label>{selected.includeHeader?<><label><span>Header Label <b>*</b></span><input value={selected.heading||''} onChange={(event)=>patchComponent(selected.id,{heading:event.target.value})}/></label><label className="gptb-properties-check"><input type="checkbox" checked={selected.collapsible===true} onChange={(event)=>patchComponent(selected.id,{collapsible:event.target.checked})}/><span>Collapsible</span></label></>:null}<label><span>Columns</span><select value={selected.columns||2} onChange={(event)=>{const count=Number(event.target.value);const base=Math.floor(12/count),remainder=12-(base*count);const widths=Array.from({length:count},(_,index)=>base+(index<remainder?1:0));patchComponent(selected.id,{columns:count,columnWidths:widths})}}>{[1,2,3,4].map((n)=><option key={n} value={n}>{n}</option>)}</select></label><div className="gptb-screen-section-columns">{Array.from({length:selected.columns||2},(_,index)=><label key={index}><span>Column {index+1} Width</span><select value={selected.columnWidths?.[index]||Math.floor(12/(selected.columns||2))} onChange={(event)=>{const widths=[...(selected.columnWidths||[])];widths[index]=Number(event.target.value);patchComponent(selected.id,{columnWidths:widths})}}>{Array.from({length:12},(_,i)=>i+1).map((width)=><option key={width} value={width}>{width} of 12</option>)}</select></label>)}</div><small>Column widths must total 12. On small screens, section columns stack vertically.</small></section>:null}
        {['PICKLIST','RADIO','CHECKBOX_GROUP','MULTI_SELECT'].includes(selected.type)?<label><span>Choices</span><textarea rows={4} value={(selected.options||[]).map((option)=>typeof option==='object'?(option.label??option.value??''):option).join('\n')} onChange={(event)=>patchComponent(selected.id,{options:event.target.value.split('\n').filter(Boolean).map((value)=>({label:value,value}))})} placeholder="One option per line"/></label>:null}
        {selected.type==='SLIDER'?<><label><span>Minimum</span><input type="number" value={selected.min??0} onChange={(event)=>patchComponent(selected.id,{min:Number(event.target.value)})}/></label><label><span>Maximum</span><input type="number" value={selected.max??100} onChange={(event)=>patchComponent(selected.id,{max:Number(event.target.value)})}/></label><label><span>Step</span><input type="number" value={selected.step??1} onChange={(event)=>patchComponent(selected.id,{step:Number(event.target.value)})}/></label></>:null}
        {selected.type==='LOOKUP'?<><label><span>Object API Name</span><input value={selected.lookupObject||''} onChange={(event)=>patchComponent(selected.id,{lookupObject:event.target.value})}/></label><label><span>Display Field</span><input value={selected.lookupField||''} onChange={(event)=>patchComponent(selected.id,{lookupField:event.target.value})}/></label></>:null}
        <section><h4>Set Component Visibility</h4><label><span>When to Display Component</span><select value={selected.visibilityMode||'always'} onChange={(event)=>patchComponent(selected.id,{visibilityMode:event.target.value})}><option value="always">Always</option><option value="all">When all conditions are met (AND)</option><option value="any">When any condition is met (OR)</option><option value="custom">When custom conditional logic is met</option></select></label>{selected.visibilityMode!=='always'?<><div className="gptb-screen-visibility-list">{(selected.visibilityConditions||[]).map((condition,index)=><div key={condition.id}><span>{index+1}</span><select value={condition.resource||''} onChange={(event)=>patchComponent(selected.id,{visibilityConditions:(selected.visibilityConditions||[]).map((item)=>item.id===condition.id?{...item,resource:event.target.value}:item)})}><option value="">Select a resource</option>{resources.filter((resource)=>resource.generatedByElementId!==draft.id||resource.apiName!==selected.name).map((resource)=><option key={resource.id||resource.apiName} value={resourcePath(resource)}>{resource.label||resource.apiName}</option>)}</select><select value={condition.operator||'truthy'} onChange={(event)=>patchComponent(selected.id,{visibilityConditions:(selected.visibilityConditions||[]).map((item)=>item.id===condition.id?{...item,operator:event.target.value}:item)})}>{[['truthy','Is True'],['falsy','Is False'],['is_empty','Is Empty'],['is_not_empty','Is Not Empty'],['equals','Equals'],['not_equals','Does Not Equal'],['contains','Contains'],['greater_than','Greater Than'],['less_than','Less Than']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{!['truthy','falsy','is_empty','is_not_empty'].includes(condition.operator)?<input value={condition.value??''} onChange={(event)=>patchComponent(selected.id,{visibilityConditions:(selected.visibilityConditions||[]).map((item)=>item.id===condition.id?{...item,value:event.target.value}:item)})}/>:<span/>}<button type="button" aria-label={`Remove visibility condition ${index+1}`} onClick={()=>patchComponent(selected.id,{visibilityConditions:(selected.visibilityConditions||[]).filter((item)=>item.id!==condition.id)})}><Trash2 size={12}/></button></div>)}</div><button type="button" className="gptb-inline-action" onClick={()=>patchComponent(selected.id,{visibilityConditions:[...(selected.visibilityConditions||[]),{id:uid('vis'),resource:'',operator:'truthy',value:''}]})}><Plus size={12}/> Add Condition</button>{selected.visibilityMode==='custom'?<label><span>Condition Logic <b>*</b></span><input maxLength={1000} value={selected.visibilityLogic||''} onChange={(event)=>patchComponent(selected.id,{visibilityLogic:event.target.value})} placeholder="Example: 1 AND NOT(2 OR 3)"/></label>:null}</>:null}</section>
      </>:<><h3>Component Style</h3><section><h4>Set Layout</h4><label><span>Width</span><select value={selected.width||12} onChange={(event)=>patchComponent(selected.id,{width:Number(event.target.value)})}>{Array.from({length:12},(_,i)=>i+1).map((width)=><option key={width} value={width}>{width} of 12</option>)}</select></label><label><span>Vertical Alignment</span><select value={selected.verticalAlignment||'top'} onChange={(event)=>patchComponent(selected.id,{verticalAlignment:event.target.value})}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label></section><section><h4>Set Styles</h4><label><span>Text Color</span><input value={selected.style?.textColor||''} onChange={(event)=>patchComponent(selected.id,{style:{...(selected.style||{}),textColor:event.target.value}})}/></label><label><span>Background Color</span><input value={selected.style?.backgroundColor||''} onChange={(event)=>patchComponent(selected.id,{style:{...(selected.style||{}),backgroundColor:event.target.value}})}/></label><label><span>Border Color</span><input value={selected.style?.borderColor||''} onChange={(event)=>patchComponent(selected.id,{style:{...(selected.style||{}),borderColor:event.target.value}})}/></label></section></>):null}
    </aside>
    {errors.length?<div className="gptb-screen-errors"><b>Complete this Screen element</b>{errors.map((error)=><span key={error}>{error}</span>)}</div>:null}
  </div>
}
