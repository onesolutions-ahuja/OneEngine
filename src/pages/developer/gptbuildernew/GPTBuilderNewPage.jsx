import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, ChevronLeft, Copy, MousePointer2, Play, Plus, Redo2, Search, Trash2, Undo2, Workflow, X, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { apiRequest } from '../../../services/api'
import './GPTBuilderNewPage.css'

export const FLOW_TYPES = [
  ['screen','Screen Flow','screen','Guides users through screens that collect or display information.'],
  ['record','Record-Triggered Flow','triggered','Launches when a record is created, updated, or deleted.'],
  ['schedule','Schedule-Triggered Flow','scheduled','Runs at a specified time and frequency.'],
  ['platform_event','Platform Event—Triggered Flow','triggered','Launches when a platform event message is received.'],
  ['autolaunched','Autolaunched Flow (No Trigger)','autolaunched','Runs in the background when invoked.'],
  ['automation_event','Automation Event-Triggered Flow','triggered','Launches from a supported automation event.'],
  ['user_provisioning','User Provisioning Flow','triggered','Automates user provisioning processes.'],
  ['contact_request','Contact Request Flow','triggered','Automates contact request processes.'],
  ['cart_async','Cart Async Flow','autolaunched','Runs asynchronous cart automation.'],
  ['recommendation_strategy','Recommendation Strategy','autolaunched','Builds recommendation strategy automation.'],
  ['autolaunched_orchestration','Autolaunched Orchestration (No Trigger)','autolaunched','Runs an orchestration when invoked.'],
  ['record_orchestration','Record-Triggered Orchestration','triggered','Launches an orchestration from a record change.'],
  ['evaluation','Evaluation Flow','autolaunched','Evaluates configured business criteria.'],
  ['cms_orchestration','Flow Orchestration for CMS','autolaunched','Coordinates supported CMS automation.'],
  ['individual_linking','Individual-Object Linking Flow','autolaunched','Links individual-related records.'],
  ['autolaunched_approval','Autolaunched Flow Approval Process (No Trigger)','autolaunched','Runs an approval process when invoked.'],
  ['record_approval','Record-Triggered Flow Approval Process','triggered','Launches an approval process from a record change.'],
  ['identity_registration','Identity User Registration Flow','screen','Guides supported identity user registration.'],
].map(([key,label,category,description]) => ({ key,label,category,description }))

const CATEGORIES = [['triggered','Triggered'],['scheduled','Scheduled'],['screen','Screen'],['autolaunched','Autolaunched']]
const FREQUENT = ['screen','record','schedule','autolaunched']

const objectKey = (row) => String(row?.object_key || row?.api_name || row?.apiName || row?.key || row?.id || '')
const objectLabel = (row) => row?.label || row?.name || objectKey(row)
const fieldKey = (row) => String(row?.api_name || row?.apiName || row?.field_key || row?.key || row?.id || '')
const fieldLabel = (row) => row?.label || row?.name || fieldKey(row)
const fieldType = (row) => String(row?.field_type || row?.data_type || row?.type || 'text').toLowerCase()
const operatorsForField = (field) => { const type=fieldType(field); const base=[['equals','Equals'],['not_equals','Does Not Equal'],['is_null','Is Null']]; if(['number','decimal','currency','date','datetime','time'].includes(type)) return [...base,['greater_than','Greater Than'],['greater_than_or_equal','Greater Than or Equal'],['less_than','Less Than'],['less_than_or_equal','Less Than or Equal']]; if(['text','email','phone','select','multiselect'].includes(type)) return [...base,['starts_with','Starts With'],['ends_with','Ends With'],['contains','Contains']]; return base }

function apiName(label) {
  let value=String(label||'').trim().replace(/[^A-Za-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'')
  if (!value) value='New_Flow'
  if (!/^[A-Za-z]/.test(value)) value=`Flow_${value}`
  return value.slice(0,80).replace(/_+$/g,'')
}

function initialStart(type) {
  if (['record','record_orchestration','record_approval'].includes(type)) return { objectKey:'', trigger:'created_or_updated', conditionMode:'none', optimize:'actions' }
  if (type==='schedule') return { startDate:'', startTime:'', frequency:'Daily', objectKey:'' }
  if (type==='platform_event') return { eventKey:'' }
  return {}
}

function triggerKey(type,start) {
  if (type==='schedule') return 'scheduled'
  if (type==='platform_event') return start.eventKey || 'manual'
  if (['record','record_orchestration','record_approval'].includes(type)) {
    if (start.trigger==='created') return start.optimize==='fast'?'before_create':'after_create'
    if (start.trigger==='updated') return start.optimize==='fast'?'before_update':'after_update'
    if (start.trigger==='deleted') return 'before_delete'
    return start.optimize==='fast'?'before_save':'after_save'
  }
  return 'manual'
}

function NewAutomation({onPick,onClose}) {
  const [category,setCategory]=useState('')
  const [query,setQuery]=useState('')
  const needle=query.trim().toLowerCase()
  const rows=useMemo(()=>FLOW_TYPES.filter((flow)=>(!category||flow.category===category)&&(!needle||(`${flow.label} ${flow.description}`).toLowerCase().includes(needle))),[category,needle])
  const frequent=FREQUENT.map((key)=>FLOW_TYPES.find((flow)=>flow.key===key)).filter(Boolean)
  return <div className="gptbn-backdrop"><section className="gptbn-dialog" role="dialog" aria-modal="true" aria-labelledby="gptbn-new-title">
    <header><h2 id="gptbn-new-title">New Automation</h2><button aria-label="Close" onClick={onClose}><X size={18}/></button></header>
    <label className="gptbn-search"><Search size={16}/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search automations..." aria-label="Search automations"/></label>
    <div className="gptbn-categories">{CATEGORIES.map(([key,label])=><button key={key} className={category===key?'is-selected':''} onClick={()=>setCategory(category===key?'':key)}>{label}</button>)}</div>
    {!category&&!needle?<><div className="gptbn-section-title">Frequently Used</div><div className="gptbn-grid">{frequent.map((flow)=><TypeCard key={flow.key} flow={flow} onPick={onPick}/>)}</div><div className="gptbn-section-title">All Automations <span>{FLOW_TYPES.length}</span></div></>:<div className="gptbn-section-title">{category?CATEGORIES.find(([key])=>key===category)?.[1]:'Search Results'} <span>{rows.length}</span></div>}
    <div className="gptbn-grid">{(category||needle?rows:FLOW_TYPES).map((flow)=><TypeCard key={flow.key} flow={flow} onPick={onPick}/>)}</div>
    {!rows.length?<p className="gptbn-empty">No automations match your search.</p>:null}
    <footer><button onClick={onClose}>Cancel</button></footer>
  </section></div>
}

function TypeCard({flow,onPick}) {
  const Icon=flow.key==='schedule'?CalendarClock:flow.category==='triggered'?Zap:flow.key==='screen'?Play:Workflow
  return <button className="gptbn-type" onClick={()=>onPick(flow)}><span><Icon size={20}/></span><div><strong>{flow.label}</strong><small>{flow.description}</small></div></button>
}

function StartEditor({flow,start,setStart,objects,events,onDone,onCancel}) {
  const recordBased=['record','record_orchestration','record_approval'].includes(flow.key)
  return <aside className="gptbn-panel">
    <header><h3>Configure Start</h3><button aria-label="Close Start" onClick={onCancel}><X size={17}/></button></header>
    <div className="gptbn-panel-body">
      {recordBased?<>
        <label><span>Object <b>*</b></span><select value={start.objectKey||''} onChange={(e)=>setStart({...start,objectKey:e.target.value})}><option value="">Select an object</option>{objects.map((row)=><option key={objectKey(row)} value={objectKey(row)}>{objectLabel(row)}</option>)}</select></label>
        <fieldset><legend>Trigger the Flow When</legend>{[['created','A record is created'],['updated','A record is updated'],['created_or_updated','A record is created or updated'],['deleted','A record is deleted']].map(([value,label])=><label className="gptbn-radio" key={value}><input type="radio" name="trigger" checked={start.trigger===value} onChange={()=>setStart({...start,trigger:value})}/>{label}</label>)}</fieldset>
        <fieldset><legend>Optimize the Flow for</legend><label className="gptbn-radio"><input type="radio" name="optimize" checked={start.optimize==='fast'} onChange={()=>setStart({...start,optimize:'fast'})}/>Fast Field Updates</label><label className="gptbn-radio"><input type="radio" name="optimize" checked={start.optimize!=='fast'} onChange={()=>setStart({...start,optimize:'actions'})}/>Actions and Related Records</label></fieldset>
      </>:flow.key==='schedule'?<>
        <label><span>Start Date <b>*</b></span><input type="date" value={start.startDate||''} onChange={(e)=>setStart({...start,startDate:e.target.value})}/></label>
        <label><span>Start Time <b>*</b></span><input type="time" value={start.startTime||''} onChange={(e)=>setStart({...start,startTime:e.target.value})}/></label>
        <label><span>Frequency</span><select value={start.frequency||'Daily'} onChange={(e)=>setStart({...start,frequency:e.target.value})}><option>Once</option><option>Daily</option><option>Weekly</option></select></label>
        <label><span>Object</span><select value={start.objectKey||''} onChange={(e)=>setStart({...start,objectKey:e.target.value})}><option value="">None</option>{objects.map((row)=><option key={objectKey(row)} value={objectKey(row)}>{objectLabel(row)}</option>)}</select></label>
      </>:flow.key==='platform_event'?<label><span>Platform Event <b>*</b></span><select value={start.eventKey||''} onChange={(e)=>setStart({...start,eventKey:e.target.value})}><option value="">Select a platform event</option>{events.map((row)=><option key={row.key||row.id||row.name} value={row.key||row.id||row.name}>{row.label||row.name||row.key}</option>)}</select></label>
      :<p className="gptbn-info">This automation starts when it is invoked by its supported OneEngine runtime context.</p>}
    </div>
    <footer><button onClick={onCancel}>Cancel</button><button className="is-brand" onClick={onDone}>Done</button></footer>
  </aside>
}


const CANVAS_ELEMENTS = [
  ['screen','Screen'],['action','Action'],['subflow','Subflow'],['assignment','Assignment'],['decision','Decision'],['loop','Loop'],
  ['transform','Transform'],['collection_sort','Collection Sort'],['collection_filter','Collection Filter'],['wait_conditions','Wait for Conditions'],
  ['wait_amount','Wait for Amount of Time'],['wait_date','Wait Until Date'],['create_records','Create Records'],['update_records','Update Records'],
  ['get_records','Get Records'],['delete_records','Delete Records'],['rollback','Roll Back Records'],
].map(([key,label])=>({key,label}))

const uid=()=>`gptbn_${Date.now()}_${Math.random().toString(36).slice(2,8)}`
const clone=(value)=>JSON.parse(JSON.stringify(value))
const apiFromElement=(label)=>apiName(label||'Element')
const snapshot=(nodes,edges)=>({nodes:clone(nodes),edges:clone(edges)})

function CanvasPicker({onPick,onClose}) {
  const [query,setQuery]=useState('')
  const needle=query.trim().toLowerCase()
  const rows=CANVAS_ELEMENTS.filter((row)=>!needle||row.label.toLowerCase().includes(needle))
  return <aside className="gptbn-element-picker" aria-label="Add Element">
    <header><strong>Add Element</strong><button aria-label="Close element picker" onClick={onClose}><X size={16}/></button></header>
    <label><Search size={14}/><input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search elements..."/></label>
    <div>{rows.map((row)=><button key={row.key} onClick={()=>onPick(row)}><span>▣</span><strong>{row.label}</strong></button>)}</div>
  </aside>
}






function ExecutionPanel({mode,workflowId,flowType,resources,nodes,onClose}) {
 const [running,setRunning]=useState(false),[result,setResult]=useState(null),[error,setError]=useState(''),[rollback,setRollback]=useState(mode!=='run'),[scenarioName,setScenarioName]=useState(''),[assertions,setAssertions]=useState([]),[savedTests,setSavedTests]=useState([])
 useEffect(()=>{if(mode==='test')apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`).then((r)=>setSavedTests(Array.isArray(r?.data)?r.data:[])).catch(()=>setSavedTests([]))},[mode,workflowId])
 const run=async()=>{setRunning(true);setError('');try{const endpoint=mode==='run'?`/api/platform/rules/${encodeURIComponent(workflowId)}/run`:`/api/platform/rules/${encodeURIComponent(workflowId)}/debug`;const response=await apiRequest(endpoint,{method:'POST',body:JSON.stringify({mode,rollback:mode==='run'?false:rollback,assertions:mode==='test'?assertions:[]})});setResult(response?.data||{})}catch(e){setError(e?.message||'Unable to execute flow.')}finally{setRunning(false)}}
 const saveTest=async()=>{if(!scenarioName.trim())return;try{await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`,{method:'POST',body:JSON.stringify({name:scenarioName.trim(),config:{rollback:true,assertions}})});const r=await apiRequest(`/api/platform/rules/${encodeURIComponent(workflowId)}/tests`);setSavedTests(Array.isArray(r?.data)?r.data:[]);setScenarioName('')}catch(e){setError(e?.message||'Unable to save test scenario.')}}
 return <aside className="gptbn-panel gptbn-execution-panel"><header><div><h3>{mode==='test'?'View Tests':mode==='debug'?'Debug':'Run'}</h3><small>Uses the most recent saved version.</small></div><button onClick={onClose}><X size={16}/></button></header><div className="gptbn-panel-body">
 {mode==='test'?<><label><span>Scenario Name</span><input value={scenarioName} onChange={(e)=>setScenarioName(e.target.value)}/></label><button onClick={saveTest}>Save Scenario</button>{savedTests.map((t)=><div key={t.id}>{t.name}{t.last_status?' · '+t.last_status:''}</div>)}<section><h4>Expected Results</h4>{assertions.map((a,i)=><div className="gptbn-assertion" key={a.id}><select value={a.resource} onChange={(e)=>setAssertions((rows)=>rows.map((x,n)=>n===i?{...x,resource:e.target.value}:x))}><option value="">Select resource</option>{resources.filter((r)=>!r.isCollection).map((r)=><option key={r.id} value={'variables.'+r.apiName}>{r.label||r.apiName}</option>)}</select><select value={a.operator} onChange={(e)=>setAssertions((rows)=>rows.map((x,n)=>n===i?{...x,operator:e.target.value}:x))}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="is_empty">Is Empty</option></select><input value={a.value} onChange={(e)=>setAssertions((rows)=>rows.map((x,n)=>n===i?{...x,value:e.target.value}:x))}/></div>)}<button onClick={()=>setAssertions((rows)=>[...rows,{id:uid(),resource:'',operator:'equals',value:''}])}><Plus size={12}/> Add Assertion</button></section></>:null}
 {mode!=='run'?<label className="gptbn-radio"><input type="checkbox" checked={rollback} onChange={(e)=>setRollback(e.target.checked)}/>Run automation in rollback mode</label>:null}
 {error?<p className="gptbn-error">{error}</p>:null}{result?<><h4>Details</h4><pre className="gptbn-debug-output">{JSON.stringify(result,null,2)}</pre></>:null}
 </div><footer><button onClick={onClose}>Close</button><button className="is-brand" disabled={running} onClick={run}>{running?'Running…':mode==='test'?'Run Scenario':'Run'}</button></footer></aside>
}

const SCREEN_COMPONENTS=[
['ACTION_BUTTON','Action Button','input'],['ADDRESS','Address','input'],['ADVANCED_CSV','Advanced CSV Import','input'],['CALL_SCRIPT','Call Script','input'],['CHECKBOX','Checkbox','input'],['CHECKBOX_GROUP','Checkbox Group','input'],['CHOICE_LOOKUP','Choice Lookup','input'],['CONTENT_TYPE_SELECTOR','CntntTypeSelector','input'],['CONTENT_SEARCH_CONTAINER','Content Search Container','input'],['CURRENCY','Currency','input'],['DATA_TABLE','Data Table','input'],['DATE','Date','input'],['DATETIME','Date & Time','input'],['DEPENDENT_PICKLISTS','Dependent Picklists','input'],['DISPLAY_IMAGE','Display Image','input'],['EMAIL','Email','input'],['FILE_PREVIEW','File Preview','input'],['FILE_UPLOAD','File Upload','input'],['HEALTHCARE_CENSUS','Healthcare Census Members Mgmt Wrapper','input'],['KANBAN','Kanban Board','input'],['LONG_TEXT','Long Text Area','input'],['LOOKUP','Lookup','input'],['LWC_SERVICE_AVAILABILITY','LWC Service Resource Availability','input'],['MULTI_SELECT','Multi-Select Picklist','input'],['NAME','Name','input'],['NUMBER','Number','input'],['PASSWORD','Password','input'],['PHONE','Phone','input'],['PICKLIST','Picklist','input'],['RADIO_GROUP','Radio Button Group','input'],['RADIO','Radio Buttons','input'],['CSV_DATA_IMPORT','runtime_industries_csv_dataimport:impBeg','input'],['SERVICE_APPOINTMENT_TYPE','Select Service Appointment Type','input'],['SLACK_CHANNEL','Slack Channel Selector','input'],['SLACK_CHANNEL_DEPRECATED','Slack Channel Selector (Deprecated)','input'],['SLACK_WORKSPACE','Slack Workspace Selector','input'],['SLIDER','Slider','input'],['TEXT','Text','input'],['TOGGLE','Toggle','input'],['URL','URL','input'],['VISUAL_PICKER','Visual Picker','input'],['DISPLAY_TEXT','Display Text','display'],['MESSAGE','Message','display'],['REPEATER','Repeater','display'],['SECTION','Section','display']]
const screenInput=(type)=>!['DISPLAY_TEXT','MESSAGE','REPEATER','SECTION'].includes(type)
const screenDataType=(type)=>({NUMBER:'number',CURRENCY:'currency',CHECKBOX:'boolean',TOGGLE:'boolean',DATE:'date',DATETIME:'datetime',ADDRESS:'object',NAME:'object',DEPENDENT_PICKLISTS:'object'}[type]||'text')
const newScreenComponent=(type,label)=>({id:uid(),type,name:apiFromElement(label),label,required:false,readOnly:false,disabled:false,defaultValue:'',helpText:'',visibilityMode:'always',visibilityConditions:[],visibilityLogic:'',validateFormula:'',validationMessage:'',options:['Option 1','Option 2']})

function ScreenElementEditor({element,resources,onResourcesChange,onSave,onCancel}) {
 const [draft,setDraft]=useState(()=>clone(element));const [selected,setSelected]=useState('screen');const [tab,setTab]=useState('details');const cfg={showHeader:true,showFooter:true,allowBack:true,allowNext:true,allowFinish:true,allowPause:false,nextLabel:'Next',finishLabel:'Finish',previousLabel:'Previous',pauseLabel:'Pause',previewStyle:'Lightning Lite',previewSize:'Large',components:[],...(draft.config||{})};const components=cfg.components||[];const current=components.find((x)=>x.id===selected)
 const patchCfg=(changes)=>setDraft((d)=>({...d,config:{...cfg,...changes}}));const patchComponent=(changes)=>patchCfg({components:components.map((x)=>x.id===selected?{...x,...changes}:x)})
 const add=(type,label)=>{const base=newScreenComponent(type,label),used=new Set(components.map((x)=>x.name));let name=base.name,n=2;while(used.has(name))name=base.name+'_'+n++;const next={...base,name};patchCfg({components:[...components,next]});setSelected(next.id)}
 const remove=()=>{patchCfg({components:components.filter((x)=>x.id!==selected)});setSelected('screen')}
 const done=()=>{const generated=components.filter((c)=>screenInput(c.type)&&c.name).map((c)=>({id:'screen-'+draft.id+'-'+c.id,apiName:c.name,label:c.label||c.name,dataType:screenDataType(c.type),isCollection:false,generatedByElementId:draft.id,generatedByElementKey:'screen',writable:true}));onResourcesChange?.([...resources.filter((r)=>r.generatedByElementId!==draft.id),...generated]);onSave({...draft,configured:true,runtimeAction:{id:draft.id,key:'SCREEN',label:draft.label,apiName:draft.apiName,screen:{label:draft.label,apiName:draft.apiName,showHeader:cfg.showHeader,components},showFooter:cfg.showFooter,allowBack:cfg.allowBack,allowNext:cfg.allowNext,allowFinish:cfg.allowFinish,allowPause:cfg.allowPause,nextLabel:cfg.nextLabel,finishLabel:cfg.finishLabel,previousLabel:cfg.previousLabel,pauseLabel:cfg.pauseLabel}})}
 return <div className="gptbn-screen-builder"><aside className="gptbn-screen-palette"><header><strong>Components</strong></header><div className="gptbn-screen-palette-scroll">{['input','display'].map((group)=><section key={group}><h4>{group==='input'?'Input':'Display'}</h4>{SCREEN_COMPONENTS.filter((x)=>x[2]===group).map(([type,label])=><button key={type} onClick={()=>add(type,label)}><Plus size={12}/>{label}</button>)}</section>)}</div></aside>
 <main className="gptbn-screen-preview"><div className="gptbn-screen-preview-controls"><span>Preview Style</span><select value={cfg.previewStyle} onChange={(e)=>patchCfg({previewStyle:e.target.value})}><option>Lightning Lite</option></select><span>Size</span><select value={cfg.previewSize} onChange={(e)=>patchCfg({previewSize:e.target.value})}><option>Large</option><option>Medium</option><option>Small</option></select></div><button className={selected==='screen'?'is-selected':''} onClick={()=>setSelected('screen')}>{cfg.showHeader?draft.label:'Header hidden'}</button><div className="gptbn-screen-frame">{components.length?components.map((c)=><button key={c.id} className={selected===c.id?'is-selected':''} onClick={()=>setSelected(c.id)}><strong>{['DISPLAY_TEXT','MESSAGE'].includes(c.type)?(c.text||c.label):(c.label||c.name)}</strong>{screenInput(c.type)?<span>{c.type==='CHECKBOX'?'☐':'Input'}</span>:null}</button>):<div className="gptbn-screen-empty"><strong>[Flow Label]</strong></div>}</div>{cfg.showFooter?<footer>{cfg.allowPause?<button disabled>{cfg.pauseLabel}</button>:null}{cfg.allowBack?<button disabled>{cfg.previousLabel}</button>:null}<button disabled>{cfg.allowNext?cfg.nextLabel:cfg.finishLabel}</button></footer>:null}</main>
 <aside className="gptbn-screen-props"><div className="gptbn-screen-tabs"><button className={tab==='details'?'is-active':''} onClick={()=>setTab('details')}>Details</button><button className={tab==='style'?'is-active':''} onClick={()=>setTab('style')}>Style</button></div>{selected==='screen'?<><h3>Screen Properties</h3>{tab==='details'?<><label><span>Label</span><input value={draft.label} onChange={(e)=>setDraft((d)=>({...d,label:e.target.value}))}/></label><label><span>API Name</span><input value={draft.apiName} onChange={(e)=>setDraft((d)=>({...d,apiName:e.target.value}))}/></label><label><span>Description</span><textarea value={draft.description||''} onChange={(e)=>setDraft((d)=>({...d,description:e.target.value}))}/></label><label><span>Stage</span><input value={cfg.stageResource||''} onChange={(e)=>patchCfg({stageResource:e.target.value})}/></label><label className="gptbn-radio"><input type="checkbox" checked={cfg.showHeader} onChange={(e)=>patchCfg({showHeader:e.target.checked})}/>Configure Header</label><label className="gptbn-radio"><input type="checkbox" checked={cfg.showFooter} onChange={(e)=>patchCfg({showFooter:e.target.checked})}/>Show Footer</label><fieldset><legend>Navigation</legend>{[['allowPause','Pause'],['allowBack','Previous'],['allowNext','Next'],['allowFinish','Finish']].map(([k,l])=><label className="gptbn-radio" key={k}><input type="checkbox" checked={cfg[k]} onChange={(e)=>patchCfg({[k]:e.target.checked})}/>{l}</label>)}</fieldset></>:<p className="gptbn-info">Screen and component styling is stored in the Screen metadata.</p>}</>:current?<><div className="gptbn-screen-prop-head"><h3>{current.label}</h3><button onClick={remove}><Trash2 size={14}/></button></div>{tab==='details'?<><label><span>Label <b>*</b></span><input value={current.label||''} onChange={(e)=>patchComponent({label:e.target.value})}/></label><label><span>API Name <b>*</b></span><input value={current.name||''} onChange={(e)=>patchComponent({name:e.target.value})}/></label>{['DISPLAY_TEXT','MESSAGE'].includes(current.type)?<label><span>Text</span><textarea value={current.text||''} onChange={(e)=>patchComponent({text:e.target.value})}/></label>:null}{screenInput(current.type)?<><label className="gptbn-radio"><input type="checkbox" checked={current.required} onChange={(e)=>patchComponent({required:e.target.checked})}/>Require</label><label className="gptbn-radio"><input type="checkbox" checked={current.readOnly} onChange={(e)=>patchComponent({readOnly:e.target.checked})}/>Read Only</label><label className="gptbn-radio"><input type="checkbox" checked={current.disabled} onChange={(e)=>patchComponent({disabled:e.target.checked})}/>Disabled</label><label><span>Default Value</span><input value={current.defaultValue??''} onChange={(e)=>patchComponent({defaultValue:e.target.value})}/></label></>:null}<label><span>When to Display Component</span><select value={current.visibilityMode||'always'} onChange={(e)=>patchComponent({visibilityMode:e.target.value})}><option value="always">Always</option><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label>{current.visibilityMode!=='always'?<><label><span>Visibility Resource</span><select value={current.visibilityConditions?.[0]?.resource||''} onChange={(e)=>patchComponent({visibilityConditions:[{id:uid(),resource:e.target.value,operator:'equals',value:''}]})}><option value="">Select a resource</option>{resources.map((r)=><option key={r.id} value={'variables.'+r.apiName}>{r.label||r.apiName}</option>)}</select></label>{current.visibilityMode==='custom'?<label><span>Condition Logic</span><input value={current.visibilityLogic||''} onChange={(e)=>patchComponent({visibilityLogic:e.target.value})}/></label>:null}</>:null}<fieldset><legend>Validate Input</legend><label><span>Error Message</span><input value={current.validationMessage||''} onChange={(e)=>patchComponent({validationMessage:e.target.value})}/></label><label><span>Formula / Resource</span><input value={current.validateFormula||''} onChange={(e)=>patchComponent({validateFormula:e.target.value})}/></label></fieldset><label><span>Provide Help</span><input value={current.helpText||''} onChange={(e)=>patchComponent({helpText:e.target.value})}/></label></>:<><label><span>Width</span><select value={current.width||12} onChange={(e)=>patchComponent({width:Number(e.target.value)})}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} of 12</option>)}</select></label><label><span>Vertical Alignment</span><select value={current.verticalAlignment||'top'} onChange={(e)=>patchComponent({verticalAlignment:e.target.value})}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label></>}</>:null}</aside>
 <div className="gptbn-screen-actions"><button onClick={onCancel}>Cancel</button><button className="is-brand" onClick={done}>Done</button></div></div>
}

const RESOURCE_TYPES=[['Variable','variable'],['Constant','constant'],['Formula','formula'],['Text Template','text_template'],['Choice','choice'],['Collection Choice Set','collection_choice_set'],['Record Choice Set','record_choice_set'],['Picklist Choice Set','picklist_choice_set'],['Stage','stage']]
const DATA_TYPES=[['Text','text'],['Record','record'],['Number','number'],['Currency','currency'],['Boolean','boolean'],['Date','date'],['Date/Time','datetime'],['Time','time'],['Picklist','picklist'],['Multi-Select Picklist','multiselect'],['Apex-Defined','apex_defined']]
const formulaCheck=(value)=>{const text=String(value||'').trim();if(!text)return 'Enter a formula.';let depth=0;for(const ch of text){if(ch==='(')depth++;if(ch===')')depth--;if(depth<0)return 'Formula has unmatched parentheses.'}return depth===0?'':'Formula has unmatched parentheses.'}

function ResourceManager({resources,nodes,onNew,onClose}) {
 const [q,setQ]=useState('');const needle=q.trim().toLowerCase();const rows=resources.filter((r)=>!needle||`${r.apiName} ${r.resourceType}`.toLowerCase().includes(needle))
 return <aside className="gptbn-manager"><header><strong>Manager</strong><button onClick={onClose}><X size={15}/></button></header><label className="gptbn-manager-search"><Search size={14}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search this flow"/></label><button className="gptbn-primary gptbn-new-resource" onClick={onNew}><Plus size={13}/> New Resource</button><section><h4>Elements <span>{nodes.length}</span></h4>{nodes.map((n)=><div key={n.id}><strong>{n.label}</strong><small>{n.apiName}</small></div>)}</section><section><h4>Resources <span>{rows.length}</span></h4>{rows.map((r)=><div key={r.id}><strong>{r.apiName}</strong><small>{RESOURCE_TYPES.find((x)=>x[1]===r.resourceType)?.[0]||r.resourceType}{r.isCollection?' · Collection':''}</small></div>)}</section></aside>
}
function ResourceEditor({resources,objects,onCreate,onCancel}) {
 const [type,setType]=useState('variable'),[name,setName]=useState(''),[description,setDescription]=useState(''),[dataType,setDataType]=useState('text'),[value,setValue]=useState(''),[formula,setFormula]=useState(''),[collection,setCollection]=useState(false),[input,setInput]=useState(false),[output,setOutput]=useState(false),[choiceLabel,setChoiceLabel]=useState(''),[choiceValue,setChoiceValue]=useState(''),[sourceObject,setSourceObject]=useState(''),[sourceField,setSourceField]=useState(''),[stageOrder,setStageOrder]=useState(0)
 const duplicate=resources.some((r)=>String(r.apiName).toLowerCase()===name.trim().toLowerCase());const valid=/^[A-Za-z][A-Za-z0-9_]*$/.test(name)&&!name.endsWith('_')&&!name.includes('__')&&!duplicate;const formulaError=type==='formula'?formulaCheck(formula):''
 const create=()=>{if(!valid||formulaError)return;onCreate({id:uid(),resourceType:type,apiName:name.trim(),label:name.trim(),description,dataType:['variable','constant','formula'].includes(type)?dataType:type==='text_template'?'text':'choice',value:type==='constant'?value:undefined,formula:type==='formula'?formula:undefined,text:type==='text_template'?value:undefined,choiceLabel:type==='choice'?(choiceLabel||name.trim()):undefined,choiceValue:type==='choice'?choiceValue:undefined,sourceObject:['record_choice_set','picklist_choice_set'].includes(type)?sourceObject:undefined,sourceField:['collection_choice_set','record_choice_set','picklist_choice_set'].includes(type)?sourceField:undefined,stageOrder:type==='stage'?Number(stageOrder):undefined,isCollection:type==='variable'?collection:false,availableForInput:type==='variable'?input:false,availableForOutput:type==='variable'?output:false,source:'manager'})}
 return <div className="gptbn-backdrop"><section className="gptbn-dialog gptbn-resource-dialog"><header><h2>New Resource</h2><button onClick={onCancel}><X size={16}/></button></header><div className="gptbn-resource-body"><label><span>Resource Type</span><select value={type} onChange={(e)=>setType(e.target.value)}>{RESOURCE_TYPES.map(([l,k])=><option key={k} value={k}>{l}</option>)}</select></label><label><span>API Name <b>*</b></span><input autoFocus value={name} onChange={(e)=>setName(e.target.value)}/>{duplicate?<small>API Name must be unique in the flow.</small>:null}</label><label><span>Description</span><textarea rows="3" value={description} onChange={(e)=>setDescription(e.target.value)}/></label>
 {['variable','constant','formula'].includes(type)?<label><span>Data Type</span><select value={dataType} onChange={(e)=>setDataType(e.target.value)}>{DATA_TYPES.map(([l,k])=><option key={k} value={k}>{l}</option>)}</select></label>:null}
 {dataType==='record'&&['variable','constant','formula'].includes(type)?<label><span>Object</span><select value={sourceObject} onChange={(e)=>setSourceObject(e.target.value)}><option value="">Select an object</option>{objects.map((o)=><option key={o.id||objectKey(o)} value={objectKey(o)}>{objectLabel(o)}</option>)}</select></label>:null}
 {type==='constant'?<label><span>Value</span><input value={value} onChange={(e)=>setValue(e.target.value)}/></label>:null}
 {type==='formula'?<><label><span>Formula <b>*</b></span><textarea rows="6" value={formula} onChange={(e)=>setFormula(e.target.value)} placeholder="Enter formula or resource reference"/>{formulaError?<small>{formulaError}</small>:null}</label><p className="gptbn-info">Resources can be referenced by API name in formulas and element values.</p></>:null}
 {type==='text_template'?<label><span>Body</span><textarea rows="7" value={value} onChange={(e)=>setValue(e.target.value)}/></label>:null}
 {type==='choice'?<><label><span>Choice Label</span><input value={choiceLabel} onChange={(e)=>setChoiceLabel(e.target.value)}/></label><label><span>Choice Value</span><input value={choiceValue} onChange={(e)=>setChoiceValue(e.target.value)}/></label></>:null}
 {type==='collection_choice_set'?<label><span>Source Collection / Field</span><input value={sourceField} onChange={(e)=>setSourceField(e.target.value)}/></label>:null}
 {['record_choice_set','picklist_choice_set'].includes(type)?<><label><span>Object</span><select value={sourceObject} onChange={(e)=>setSourceObject(e.target.value)}><option value="">Select an object</option>{objects.map((o)=><option key={o.id||objectKey(o)} value={objectKey(o)}>{objectLabel(o)}</option>)}</select></label><label><span>{type==='picklist_choice_set'?'Picklist Field':'Label / Value Field'}</span><input value={sourceField} onChange={(e)=>setSourceField(e.target.value)}/></label></>:null}
 {type==='stage'?<label><span>Stage Order</span><input type="number" min="0" value={stageOrder} onChange={(e)=>setStageOrder(e.target.value)}/></label>:null}
 {type==='variable'?<><label className="gptbn-radio"><input type="checkbox" checked={collection} onChange={(e)=>setCollection(e.target.checked)}/>Allow multiple values (collection)</label><label className="gptbn-radio"><input type="checkbox" checked={input} onChange={(e)=>setInput(e.target.checked)}/>Available for input</label><label className="gptbn-radio"><input type="checkbox" checked={output} onChange={(e)=>setOutput(e.target.checked)}/>Available for output</label></>:null}
 </div><footer><button onClick={onCancel}>Cancel</button><button className="is-brand" disabled={!valid||Boolean(formulaError)} onClick={create}>Done</button></footer></section></div>
}
function ActionSubflowEditor({element,onSave,onCancel}) {
  const [draft,setDraft]=useState(()=>clone(element||{}))
  const [actions,setActions]=useState([]),[flows,setFlows]=useState([]),[loading,setLoading]=useState(true)
  const cfg=draft.config||{}
  const patch=(changes)=>setDraft((row)=>({...row,...changes}))
  const patchCfg=(changes)=>patch({config:{...cfg,...changes}})
  useEffect(()=>{let live=true;setLoading(true);Promise.all([
    apiRequest('/api/platform/workflow-actions').catch(()=>({data:[]})),
    apiRequest('/api/platform/rules').catch(()=>({data:[]}))
  ]).then(([a,b])=>{if(!live)return;setActions((Array.isArray(a?.data)?a.data:[]).filter((x)=>x?.builderVisible!==false&&!['RUN_AGENT','SCREEN','RUN_SUBFLOW'].includes(x.key)));setFlows((Array.isArray(b?.data)?b.data:[]).filter((x)=>x?.action?.type==='workflow'&&x?.action?.isTemplate!==true))}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[])
  const selectedAction=actions.find((x)=>x.key===cfg.actionKey)
  const selectedFlow=flows.find((x)=>String(x.id)===String(cfg.workflowId))
  const required=new Set(selectedAction?.schema?.required||[])
  const inputs=Object.entries(selectedAction?.schema?.properties||{})
  const valid=element.key==='action'?Boolean(selectedAction):Boolean(selectedFlow)
  const runtime=element.key==='action'
    ? {id:draft.id,key:cfg.actionKey,label:draft.label,apiName:draft.apiName,description:draft.description||'',...(cfg.inputs||{}),automaticOutputVariable:(cfg.outputMode||'automatic')==='automatic'?draft.apiName+'_Outputs':undefined,manualOutputMappings:cfg.outputMode==='manual'?(cfg.manualOutputs||[]):undefined}
    : {id:draft.id,key:'RUN_SUBFLOW',label:draft.label,apiName:draft.apiName,description:draft.description||'',workflowId:cfg.workflowId,subflowApiName:cfg.workflowApiName,workflowInputs:cfg.inputMappings||{},outputMappings:cfg.outputMappings||{}}
  return <aside className="gptbn-panel gptbn-element-editor">
    <header><h3>{element.label}</h3><button aria-label="Close element" onClick={onCancel}><X size={17}/></button></header>
    <div className="gptbn-panel-body">
      <label><span>Label <b>*</b></span><input value={draft.label||''} onChange={(e)=>patch({label:e.target.value,apiName:apiFromElement(e.target.value)})}/></label>
      <label><span>API Name <b>*</b></span><input value={draft.apiName||''} onChange={(e)=>patch({apiName:e.target.value})}/></label>
      <label><span>Description</span><textarea rows="3" value={draft.description||''} onChange={(e)=>patch({description:e.target.value})}/></label>
      {element.key==='action'?<><label><span>Action <b>*</b></span><select disabled={loading} value={cfg.actionKey||''} onChange={(e)=>patchCfg({actionKey:e.target.value,inputs:{},inputModes:{},outputMode:'automatic',manualOutputs:[]})}><option value="">{loading?'Loading actions...':'Select an action'}</option>{actions.map((a)=><option key={a.key} value={a.key}>{a.displayName||a.label||a.key}</option>)}</select></label>
        {selectedAction?.key==='HTTP_CALLOUT'||/HTTP.*CALLOUT/i.test(selectedAction?.displayName||'')?<p className="gptbn-info">HTTP Callout uses the selected OneEngine workflow action contract, including its configured authentication and request schema.</p>:null}
        {inputs.length?<div className="gptbn-action-inputs"><strong>Set Input Values</strong>{inputs.map(([name,schema])=><label key={name}><span>{schema?.title||name}{required.has(name)?' *':''}</span><input value={cfg.inputs?.[name]??''} onChange={(e)=>patchCfg({inputs:{...(cfg.inputs||{}),[name]:e.target.value}})} placeholder={schema?.description||name}/></label>)}</div>:null}
        {selectedAction?<fieldset><legend>Store Output Values</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.outputMode||'automatic')==='automatic'} onChange={()=>patchCfg({outputMode:'automatic'})}/>Automatically store all fields</label><label className="gptbn-radio"><input type="radio" checked={cfg.outputMode==='manual'} onChange={()=>patchCfg({outputMode:'manual'})}/>Manually assign variables</label></fieldset>:null}
      </>:<><label><span>Referenced Flow <b>*</b></span><select disabled={loading} value={cfg.workflowId||''} onChange={(e)=>{const x=flows.find((r)=>String(r.id)===e.target.value);patchCfg({workflowId:e.target.value,workflowApiName:x?.action?.apiName||'',flowLabel:x?.name||'',inputMappings:{},outputMappings:{}})}}><option value="">{loading?'Loading flows...':'Select a flow'}</option>{flows.map((x)=><option key={x.id} value={x.id}>{x.name} · {x.action?.apiName||'Workflow'}</option>)}</select>{selectedFlow?<small>{selectedFlow.active||selectedFlow.runtime_active?'Active version':'Latest version'}</small>:null}</label>
        {selectedFlow?.action?.inputContract?.length?<div className="gptbn-action-inputs"><strong>Select Input Values</strong>{selectedFlow.action.inputContract.map((input)=><label key={input.name}><span>{input.label||input.name}{input.required?' *':''}</span><input value={cfg.inputMappings?.[input.name]??''} onChange={(e)=>patchCfg({inputMappings:{...(cfg.inputMappings||{}),[input.name]:e.target.value}})}/></label>)}</div>:null}
        {selectedFlow?.action?.outputContract?.length?<div className="gptbn-action-inputs"><strong>Store Output Values</strong>{selectedFlow.action.outputContract.map((output)=><label key={output.name}><span>{output.label||output.name}</span><input value={cfg.outputMappings?.[output.name]??''} onChange={(e)=>patchCfg({outputMappings:{...(cfg.outputMappings||{}),[output.name]:e.target.value}})} placeholder="variables.target"/></label>)}</div>:null}
      </>}
    </div>
    <footer><button onClick={onCancel}>Cancel</button><button className="is-brand" disabled={!valid||!String(draft.label||'').trim()||!String(draft.apiName||'').trim()} onClick={()=>onSave({...draft,configured:true,runtimeAction:runtime})}>Done</button></footer>
  </aside>
}

function DataElementEditor({element,objects,onSave,onCancel}) {
  const [draft,setDraft]=useState(()=>clone(element||{}))
  const [fields,setFields]=useState([])
  const cfg=draft.config||{}
  const selectedObject=objects.find((row)=>objectKey(row)===cfg.objectKey)
  const writable=['create_records','update_records'].includes(element.key)
  useEffect(()=>{let live=true;if(!selectedObject?.id){setFields([]);return()=>{live=false}};apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`).then((r)=>{if(live)setFields((Array.isArray(r?.data)?r.data:[]).filter((field)=>field?.active!==false&&(writable?field?.writable!==false:field?.readable!==false))}).catch(()=>{if(live)setFields([])});return()=>{live=false}},[selectedObject?.id,writable])
  const patch=(changes)=>setDraft((row)=>({...row,...changes}))
  const patchCfg=(changes)=>patch({config:{...cfg,...changes}})
  const rows=Array.isArray(cfg.conditions)?cfg.conditions:[]
  const values=Array.isArray(cfg.fieldValues)?cfg.fieldValues:[]
  const patchRow=(name,id,changes)=>patchCfg({[name]:(name==='conditions'?rows:values).map((row)=>row.id===id?{...row,...changes}:row)})
  const setObject=(value)=>patchCfg({objectKey:value,objectLabel:objectLabel(objects.find((row)=>objectKey(row)===value)),conditions:[],fieldValues:[],sortBy:''})
  const valid=element.key==='rollback'||Boolean(cfg.objectKey)
  const save=()=>onSave({...draft,configured:valid,config:{...cfg,conditions:rows,fieldValues:values}})
  return <aside className="gptbn-panel gptbn-element-editor">
    <header><h3>{element.label}</h3><button aria-label="Close element" onClick={onCancel}><X size={17}/></button></header>
    <div className="gptbn-panel-body">
      <label><span>Label <b>*</b></span><input value={draft.label||''} onChange={(e)=>patch({label:e.target.value,apiName:apiFromElement(e.target.value)})}/></label>
      <label><span>API Name <b>*</b></span><input value={draft.apiName||''} onChange={(e)=>patch({apiName:e.target.value})}/></label>
      <label><span>Description</span><textarea rows="3" value={draft.description||''} onChange={(e)=>patch({description:e.target.value})}/></label>
      {element.key==='rollback'?<p className="gptbn-info">Rolls back record changes made in the current flow transaction.</p>:<>
        <label><span>Object <b>*</b></span><select value={cfg.objectKey||''} onChange={(e)=>setObject(e.target.value)}><option value="">Select an object</option>{objects.map((row)=><option key={row.id||objectKey(row)} value={objectKey(row)}>{objectLabel(row)}</option>)}</select></label>
        {element.key==='get_records'?<><label><span>Condition Requirements</span><select value={cfg.conditionLogic||'all'} onChange={(e)=>patchCfg({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="none">None—Get All Records</option></select></label><DataConditions rows={rows} fields={fields} patchRow={patchRow} patchCfg={patchCfg}/><label><span>Sort Order</span><select value={cfg.sortOrder||'none'} onChange={(e)=>patchCfg({sortOrder:e.target.value})}><option value="none">Not Sorted</option><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>{cfg.sortOrder&&cfg.sortOrder!=='none'?<label><span>Sort By</span><select value={cfg.sortBy||''} onChange={(e)=>patchCfg({sortBy:e.target.value})}><option value="">Select a field</option>{fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select></label>:null}<label><span>How Many Records to Store</span><select value={cfg.recordLimit||'first'} onChange={(e)=>patchCfg({recordLimit:e.target.value})}><option value="first">Only the first record</option><option value="all">All records</option></select></label><label><span>How to Store Record Data</span><select value={cfg.storeMode||'auto'} onChange={(e)=>patchCfg({storeMode:e.target.value})}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and let the platform store values</option><option value="advanced">Choose fields and assign variables</option></select></label></>:null}
        {element.key==='create_records'?<><fieldset><legend>How to Set Record Field Values</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.valueMode||'manual')==='manual'} onChange={()=>patchCfg({valueMode:'manual',howMany:'one'})}/>Manually</label><label className="gptbn-radio"><input type="radio" checked={cfg.valueMode==='record_variable'} onChange={()=>patchCfg({valueMode:'record_variable'})}/>From a Record Variable</label></fieldset><fieldset><legend>How Many Records to Create</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.howMany||'one')==='one'} onChange={()=>patchCfg({howMany:'one'})}/>One</label><label className="gptbn-radio"><input type="radio" disabled={(cfg.valueMode||'manual')==='manual'} checked={cfg.howMany==='multiple'} onChange={()=>patchCfg({howMany:'multiple'})}/>Multiple</label></fieldset>{(cfg.valueMode||'manual')==='manual'?<DataValues rows={values} fields={fields} patchRow={patchRow} patchCfg={patchCfg}/>:<label><span>{cfg.howMany==='multiple'?'Record Collection':'Record'} <b>*</b></span><input value={cfg.howMany==='multiple'?(cfg.recordCollectionResource||''):(cfg.recordResource||'')} onChange={(e)=>patchCfg(cfg.howMany==='multiple'?{recordCollectionResource:e.target.value}:{recordResource:e.target.value})} placeholder="variables.resourceName"/></label>}</>:null}
        {element.key==='update_records'?<><fieldset><legend>How to Find Records to Update</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.findMode||'conditions')==='conditions'} onChange={()=>patchCfg({findMode:'conditions'})}/>Specify conditions</label><label className="gptbn-radio"><input type="radio" checked={cfg.findMode==='resource'} onChange={()=>patchCfg({findMode:'resource'})}/>Use record variable IDs and values</label></fieldset>{cfg.findMode==='resource'?<label><span>Record Resource <b>*</b></span><input value={cfg.recordResource||''} onChange={(e)=>patchCfg({recordResource:e.target.value})} placeholder="$record or variables.resourceName"/></label>:<><DataConditions rows={rows} fields={fields} patchRow={patchRow} patchCfg={patchCfg}/><DataValues rows={values} fields={fields} patchRow={patchRow} patchCfg={patchCfg}/></>}</>:null}
        {element.key==='delete_records'?<><fieldset><legend>How to Find Records to Delete</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.findMode||'conditions')==='conditions'} onChange={()=>patchCfg({findMode:'conditions'})}/>Specify conditions</label><label className="gptbn-radio"><input type="radio" checked={cfg.findMode==='resource'} onChange={()=>patchCfg({findMode:'resource'})}/>Use IDs stored in a record variable</label></fieldset>{cfg.findMode==='resource'?<label><span>Record Resource <b>*</b></span><input value={cfg.recordResource||''} onChange={(e)=>patchCfg({recordResource:e.target.value})} placeholder="$record or variables.resourceName"/></label>:<DataConditions rows={rows} fields={fields} patchRow={patchRow} patchCfg={patchCfg}/>}</>:null}
      </>}
    </div>
    <footer><button onClick={onCancel}>Cancel</button><button className="is-brand" disabled={!valid||!String(draft.label||'').trim()||!String(draft.apiName||'').trim()} onClick={save}>Done</button></footer>
  </aside>
}

function DataConditions({rows,fields,patchRow,patchCfg}) {
  return <div className="gptbn-data-rows"><strong>Filter Records</strong>{rows.map((row,index)=>{const meta=fields.find((field)=>fieldKey(field)===row.field);return <div key={row.id}><span>{index+1}</span><select value={row.field||''} onChange={(e)=>patchRow('conditions',row.id,{field:e.target.value,operator:'equals',value:''})}><option value="">Field</option>{fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><select value={row.operator||'equals'} onChange={(e)=>patchRow('conditions',row.id,{operator:e.target.value,value:e.target.value==='is_null'?true:''})}>{operatorsForField(meta).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{row.operator==='is_null'?<select value={String(row.value??true)} onChange={(e)=>patchRow('conditions',row.id,{value:e.target.value==='true'})}><option value="true">True</option><option value="false">False</option></select>:<input value={row.value??''} onChange={(e)=>patchRow('conditions',row.id,{value:e.target.value})} placeholder="Value or resource"/>}</div>})}<button type="button" onClick={()=>patchCfg({conditions:[...rows,{id:uid(),field:'',operator:'equals',value:''}]})}><Plus size={13}/> Add Condition</button></div>
}
function DataValues({rows,fields,patchRow,patchCfg}) {
  return <div className="gptbn-data-rows"><strong>Set Field Values</strong>{rows.map((row,index)=><div key={row.id}><span>{index+1}</span><select value={row.field||''} onChange={(e)=>patchRow('fieldValues',row.id,{field:e.target.value})}><option value="">Field</option>{fields.map((field)=><option key={fieldKey(field)} value={fieldKey(field)}>{fieldLabel(field)}</option>)}</select><input value={row.value??''} onChange={(e)=>patchRow('fieldValues',row.id,{value:e.target.value})} placeholder="Value or resource"/></div>)}<button type="button" onClick={()=>patchCfg({fieldValues:[...rows,{id:uid(),field:'',value:''}]})}><Plus size={13}/> Add Field</button></div>
}

function dataRuntimeAction(element) {
  const c=element.config||{}
  const configured=(row)=>typeof row?.value==='string'&&row.value.startsWith('variables.')?{path:row.value}:row?.value
  if(element.key==='get_records') return {id:element.id,key:'GET_RECORDS',label:element.label,apiName:element.apiName,objectKey:c.objectKey,filters:(c.conditionLogic==='none'?[]:(c.conditions||[])).map((row)=>({field:row.field,operator:row.operator||'equals',value:configured(row)})),match:c.conditionLogic==='any'?'any':'all',sortField:c.sortOrder==='none'?undefined:c.sortBy,sortDirection:c.sortOrder==='none'?undefined:c.sortOrder,limit:(c.recordLimit||'first')==='first'?1:20000,store:(c.recordLimit||'first')==='first'?'first':'all',fieldSelection:c.storeMode||'auto'}
  if(element.key==='create_records') return {id:element.id,key:'CREATE_RECORD',label:element.label,apiName:element.apiName,objectKey:c.objectKey,createMode:c.valueMode||'manual',howMany:c.howMany||'one',fieldValues:Object.fromEntries((c.fieldValues||[]).filter((row)=>row.field).map((row)=>[row.field,configured(row)])),recordResource:c.recordResource?{path:c.recordResource}:undefined,recordCollectionResource:c.recordCollectionResource?{path:c.recordCollectionResource}:undefined}
  if(element.key==='update_records') return {id:element.id,key:'UPDATE_RECORD',label:element.label,apiName:element.apiName,objectKey:c.objectKey,updateMode:c.findMode||'conditions',recordResource:c.recordResource?{path:c.recordResource}:undefined,conditions:(c.conditions||[]).map((row)=>({field:row.field,operator:row.operator||'equals',value:configured(row)})),fieldValues:Object.fromEntries((c.fieldValues||[]).filter((row)=>row.field).map((row)=>[row.field,configured(row)]))}
  if(element.key==='delete_records') return {id:element.id,key:'DELETE_RECORD',label:element.label,apiName:element.apiName,objectKey:c.objectKey,deleteMode:c.findMode||'conditions',recordResource:c.recordResource?{path:c.recordResource}:undefined,conditions:(c.conditions||[]).map((row)=>({field:row.field,operator:row.operator||'equals',value:configured(row)}))}
  if(element.key==='rollback') return {id:element.id,key:'ROLLBACK_RECORDS',label:element.label,apiName:element.apiName}
  return null
}

function ElementEditor({element,nodes,objects,resources=[],onResourcesChange,onSave,onCancel}) {
  if(element?.key==='screen') return <ScreenElementEditor element={element} resources={resources} onResourcesChange={onResourcesChange} onSave={onSave} onCancel={onCancel}/>
  if(element && ['action','subflow'].includes(element.key)) return <ActionSubflowEditor element={element} onSave={onSave} onCancel={onCancel}/>
  if(element && ['get_records','create_records','update_records','delete_records','rollback'].includes(element.key)) return <DataElementEditor element={element} objects={objects} onSave={onSave} onCancel={onCancel}/>
  const [draft,setDraft]=useState(()=>clone(element||{}))
  if(!element)return null
  const cfg=draft.config||{}
  const patch=(changes)=>setDraft((row)=>({...row,...changes}))
  const patchCfg=(changes)=>patch({config:{...cfg,...changes}})
  const refs=nodes.filter((row)=>row.id!==element.id)
  const logic=['assignment','decision','loop','transform','collection_sort','collection_filter','wait_conditions','wait_amount','wait_date'].includes(element.key)
  return <aside className="gptbn-panel gptbn-element-editor">
    <header><h3>{element.label}</h3><button aria-label="Close element" onClick={onCancel}><X size={17}/></button></header>
    <div className="gptbn-panel-body">
      <label><span>Label <b>*</b></span><input value={draft.label||''} onChange={(e)=>patch({label:e.target.value,apiName:apiFromElement(e.target.value)})}/></label>
      <label><span>API Name <b>*</b></span><input value={draft.apiName||''} onChange={(e)=>patch({apiName:e.target.value})}/></label>
      <label><span>Description</span><textarea rows="3" value={draft.description||''} onChange={(e)=>patch({description:e.target.value})}/></label>
      {element.key==='assignment'?<><label><span>Variable</span><input value={cfg.variable||''} onChange={(e)=>patchCfg({variable:e.target.value})} placeholder="Resource API name"/></label><label><span>Operator</span><select value={cfg.operator||'assign'} onChange={(e)=>patchCfg({operator:e.target.value})}><option value="assign">Equals</option><option value="add">Add</option><option value="subtract">Subtract</option><option value="add_item">Add Item</option><option value="remove_item">Remove Item</option></select></label><label><span>Value</span><input value={cfg.value||''} onChange={(e)=>patchCfg({value:e.target.value})}/></label></>:null}
      {element.key==='decision'?<><label><span>Outcome Label</span><input value={cfg.outcomeLabel||''} onChange={(e)=>patchCfg({outcomeLabel:e.target.value})}/></label><label><span>Condition Requirements</span><select value={cfg.match||'all'} onChange={(e)=>patchCfg({match:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label><label><span>Resource</span><input value={cfg.resource||''} onChange={(e)=>patchCfg({resource:e.target.value})}/></label><label><span>Operator</span><select value={cfg.operator||'equals'} onChange={(e)=>patchCfg({operator:e.target.value})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="contains">Contains</option><option value="is_null">Is Null</option></select></label><label><span>Value</span><input value={cfg.value||''} onChange={(e)=>patchCfg({value:e.target.value})}/></label><p className="gptbn-info">Default Outcome is used when no configured outcome matches.</p></>:null}
      {element.key==='loop'?<><label><span>Collection Variable</span><input value={cfg.collection||''} onChange={(e)=>patchCfg({collection:e.target.value})}/></label><fieldset><legend>Direction</legend><label className="gptbn-radio"><input type="radio" checked={(cfg.direction||'first')==='first'} onChange={()=>patchCfg({direction:'first'})}/>First item to last item</label><label className="gptbn-radio"><input type="radio" checked={cfg.direction==='last'} onChange={()=>patchCfg({direction:'last'})}/>Last item to first item</label></fieldset></>:null}
      {element.key==='transform'?<><label><span>Source Data</span><input value={cfg.source||''} onChange={(e)=>patchCfg({source:e.target.value})}/></label><label><span>Target Data Type</span><select value={cfg.targetType||'text'} onChange={(e)=>patchCfg({targetType:e.target.value})}><option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="record">Record</option></select></label><label><span>Mapping</span><textarea rows="4" value={cfg.mapping||''} onChange={(e)=>patchCfg({mapping:e.target.value})} placeholder="Target field = source value"/></label></>:null}
      {element.key==='collection_filter'?<><label><span>Collection</span><input value={cfg.collection||''} onChange={(e)=>patchCfg({collection:e.target.value})}/></label><label><span>Condition Requirements</span><select value={cfg.match||'all'} onChange={(e)=>patchCfg({match:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option></select></label><label><span>Field / Resource</span><input value={cfg.resource||''} onChange={(e)=>patchCfg({resource:e.target.value})}/></label><label><span>Operator</span><select value={cfg.operator||'equals'} onChange={(e)=>patchCfg({operator:e.target.value})}><option value="equals">Equals</option><option value="not_equals">Does Not Equal</option><option value="contains">Contains</option><option value="is_null">Is Null</option></select></label><label><span>Value</span><input value={cfg.value||''} onChange={(e)=>patchCfg({value:e.target.value})}/></label></>:null}
      {element.key==='collection_sort'?<><label><span>Collection Variable</span><input value={cfg.collection||''} onChange={(e)=>patchCfg({collection:e.target.value})}/></label><label><span>Sort Order</span><select value={cfg.order||'asc'} onChange={(e)=>patchCfg({order:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label><span>Sort By</span><input value={cfg.field||''} onChange={(e)=>patchCfg({field:e.target.value})}/></label><label><span>Maximum Number of Items</span><input type="number" min="0" value={cfg.limit??''} onChange={(e)=>patchCfg({limit:e.target.value===''?null:Number(e.target.value)})}/></label></>:null}
      {element.key==='wait_conditions'?<><label><span>Resume When</span><select value={cfg.match||'all'} onChange={(e)=>patchCfg({match:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option></select></label><label><span>Resource</span><input value={cfg.resource||''} onChange={(e)=>patchCfg({resource:e.target.value})}/></label><label><span>Value</span><input value={cfg.value||''} onChange={(e)=>patchCfg({value:e.target.value})}/></label></>:null}
      {element.key==='wait_amount'?<><label><span>Amount</span><input type="number" min="0" value={cfg.amount??''} onChange={(e)=>patchCfg({amount:Number(e.target.value)})}/></label><label><span>Unit</span><select value={cfg.unit||'hours'} onChange={(e)=>patchCfg({unit:e.target.value})}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label></>:null}
      {element.key==='wait_date'?<label><span>Date / Time Resource</span><input value={cfg.dateTime||''} onChange={(e)=>patchCfg({dateTime:e.target.value})}/></label>:null}
      {logic?<label><span>Next Element</span><select value={cfg.nextId||''} onChange={(e)=>patchCfg({nextId:e.target.value})}><option value="">Use canvas connector</option>{refs.map((row)=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>:null}
    </div>
    <footer><button onClick={onCancel}>Cancel</button><button className="is-brand" disabled={!String(draft.label||'').trim()||!String(draft.apiName||'').trim()} onClick={()=>onSave(draft)}>Done</button></footer>
  </aside>
}

function Builder({flow,onBack}) {
  const [objects,setObjects]=useState([])
  const [events,setEvents]=useState([])
  const [start,setStart]=useState(()=>initialStart(flow.key))
  const [draft,setDraft]=useState(()=>initialStart(flow.key))
  const [startOpen,setStartOpen]=useState(['record','record_orchestration','record_approval','schedule','platform_event'].includes(flow.key))
  const [label,setLabel]=useState('New Flow')
  const [savedId,setSavedId]=useState('')
  const [saving,setSaving]=useState(false)
  const [message,setMessage]=useState('')
  const [layout,setLayout]=useState('auto')
  const [nodes,setNodes]=useState([])
  const [edges,setEdges]=useState([])
  const [resources,setResources]=useState([])
  const [managerOpen,setManagerOpen]=useState(true)
  const [resourceOpen,setResourceOpen]=useState(false)
  const [active,setActive]=useState(false)
  const [version,setVersion]=useState(1)
  const [executionMode,setExecutionMode]=useState(null)
  const [selected,setSelected]=useState([])
  const [picker,setPicker]=useState(false)
  const [zoom,setZoom]=useState(100)
  const [history,setHistory]=useState([])
  const [future,setFuture]=useState([])
  const [clipboard,setClipboard]=useState([])
  const [connectFrom,setConnectFrom]=useState('')
  const [editing,setEditing]=useState(null)
  const [dragging,setDragging]=useState(null)
  const canvasRef=useRef(null)
  const dragOriginRef=useRef(null)

  useEffect(()=>{let live=true;Promise.all([
    apiRequest('/api/platform/objects').catch(()=>({data:[]})),
    apiRequest('/api/platform/event-types').catch(()=>({data:[]})),
  ]).then(([a,b])=>{if(!live)return;const ar=a?.data?.objects||a?.data||[];setObjects(Array.isArray(ar)?ar:[]);setEvents(Array.isArray(b?.data)?b.data:[])});return()=>{live=false}},[])

  const checkpoint=()=>{setHistory((rows)=>[...rows.slice(-49),snapshot(nodes,edges)]);setFuture([])}
  const mutate=(fn)=>{checkpoint();fn()}
  const undo=()=>{if(!history.length)return;const prev=history.at(-1);setFuture((rows)=>[snapshot(nodes,edges),...rows].slice(0,50));setHistory((rows)=>rows.slice(0,-1));setNodes(prev.nodes);setEdges(prev.edges);setSelected([])}
  const redo=()=>{if(!future.length)return;const next=future[0];setHistory((rows)=>[...rows,snapshot(nodes,edges)].slice(-50));setFuture((rows)=>rows.slice(1));setNodes(next.nodes);setEdges(next.edges);setSelected([])}

  const addNode=(definition,position=null)=>{
    mutate(()=>{
      const id=uid()
      const index=nodes.length
      const node={id,key:definition.key,label:definition.label,apiName:apiFromElement(definition.label),position:position||{x:360+(index%3)*220,y:150+Math.floor(index/3)*120}}
      setNodes((rows)=>[...rows,node])
      if(layout==='auto'){
        const previous=nodes.at(-1)?.id||'start'
        setEdges((rows)=>[...rows.filter((edge)=>edge.source!==previous),{id:uid(),source:previous,target:id}])
      }
      setSelected([id]);setPicker(false);setEditing({id,isNew:true})
    })
  }
  const saveElement=(draftElement)=>{mutate(()=>setNodes((rows)=>rows.map((node)=>node.id===draftElement.id?{...node,...draftElement,configured:true}:node)));setEditing(null)}
  const deleteSelected=()=>{
    if(!selected.length)return
    mutate(()=>{const removed=new Set(selected);setNodes((rows)=>rows.filter((node)=>!removed.has(node.id)));setEdges((rows)=>rows.filter((edge)=>!removed.has(edge.source)&&!removed.has(edge.target)));setSelected([])})
  }
  const copySelected=()=>setClipboard(clone(nodes.filter((node)=>selected.includes(node.id))))
  const paste=()=>{
    if(!clipboard.length)return
    mutate(()=>{
      const created=clipboard.map((node,index)=>({...clone(node),id:uid(),label:`${node.label} Copy`,apiName:apiFromElement(`${node.label}_Copy_${index+1}`),position:{x:(node.position?.x||300)+28,y:(node.position?.y||160)+28}}))
      setNodes((rows)=>[...rows,...created]);setSelected(created.map((node)=>node.id))
    })
  }
  const toggleSelect=(id,event)=>setSelected((rows)=>event?.shiftKey?(rows.includes(id)?rows.filter((value)=>value!==id):[...rows,id]):[id])
  const beginConnect=(id,event)=>{event.stopPropagation();setConnectFrom(id)}
  const finishConnect=(id,event)=>{
    event.stopPropagation()
    if(connectFrom&&connectFrom!==id) mutate(()=>setEdges((rows)=>[...rows.filter((edge)=>!(edge.source===connectFrom&&edge.target===id)),{id:uid(),source:connectFrom,target:id}]))
    setConnectFrom('')
  }
  const startDrag=(node,event)=>{
    if(layout!=='free')return
    event.preventDefault();event.stopPropagation()
    const rect=canvasRef.current?.getBoundingClientRect()
    const origin={id:node.id,originX:event.clientX,originY:event.clientY,startX:node.position?.x||0,startY:node.position?.y||0,rect}
    dragOriginRef.current=origin
    setDragging(origin)
    if(!selected.includes(node.id))setSelected([node.id])
  }
  const moveDrag=(event)=>{
    if(!dragging||layout!=='free')return
    const scale=zoom/100
    const dx=(event.clientX-dragging.originX)/scale,dy=(event.clientY-dragging.originY)/scale
    setNodes((rows)=>rows.map((node)=>node.id===dragging.id?{...node,position:{x:Math.max(20,dragging.startX+dx),y:Math.max(20,dragging.startY+dy)}}:node))
  }
  const endDrag=()=>{const origin=dragOriginRef.current;if(origin){setHistory((rows)=>[...rows.slice(-49),snapshot(nodes.map((node)=>node.id===origin.id?{...node,position:{x:origin.startX,y:origin.startY}}:node),edges)]);setFuture([])}dragOriginRef.current=null;setDragging(null)}

  useEffect(()=>{
    const key=(event)=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||event.target?.isContentEditable)return
      const primary=event.ctrlKey||event.metaKey
      if(primary&&event.key.toLowerCase()==='z'&&!event.shiftKey){event.preventDefault();undo()}
      else if((primary&&event.key.toLowerCase()==='y')||(primary&&event.shiftKey&&event.key.toLowerCase()==='z')){event.preventDefault();redo()}
      else if(primary&&event.key.toLowerCase()==='c'){event.preventDefault();copySelected()}
      else if(primary&&event.key.toLowerCase()==='v'){event.preventDefault();paste()}
      else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelected()}
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[history,future,nodes,edges,selected,clipboard,layout])

  const needsStart=['record','record_orchestration','record_approval','schedule','platform_event'].includes(flow.key)
  const startValid=!needsStart||(flow.key==='schedule'?Boolean(start.startDate&&start.startTime):flow.key==='platform_event'?Boolean(start.eventKey):Boolean(start.objectKey))
  const save=async()=>{
    if(!startValid){setMessage('Configure Start before saving.');return}
    setSaving(true);setMessage('')
    const payload={name:label||'New Flow',objectKey:start.objectKey||null,triggerKey:triggerKey(flow.key,start),conditions:[],active:active,lifecycleStatus:active?'ACTIVE':'DRAFT',version:version,action:{type:'workflow',gptBuilder:true,gptBuilderNew:true,apiName:apiName(label),description:'',apiVersion:'68.0',flowType:flow.key,start,layout:{mode:layout==='free'?'FREE_FORM':'AUTO'},gptBuilderElements:nodes.map((node)=>({...node,source:layout})),resources:resources,goToConnections:edges.map((edge)=>({sourceId:edge.source,targetId:edge.target})),actions:nodes.filter((node)=>node.configured).map((node)=>node.runtimeAction||dataRuntimeAction(node)).filter(Boolean)}}
    try{const response=await apiRequest(savedId?`/api/platform/rules/${encodeURIComponent(savedId)}`:'/api/platform/rules',{method:savedId?'PUT':'POST',body:JSON.stringify(payload)});if(response?.data?.id)setSavedId(String(response.data.id));setMessage('Flow saved.')}
    catch(error){setMessage(error?.message||'Unable to save flow.')}
    finally{setSaving(false)}
  }

  const autoNodes=nodes.map((node,index)=>({...node,position:{x:360,y:145+index*112}}))
  const rendered=layout==='auto'?autoNodes:nodes
  const nodeMap=new Map(rendered.map((node)=>[node.id,node]))
  const point=(id,out=false)=>{
    if(id==='start')return{x:503,y:104}
    const node=nodeMap.get(id);if(!node)return{x:0,y:0}
    return{x:(node.position?.x||0)+143,y:(node.position?.y||0)+(out?59:0)}
  }

  return <section className="gptbn-builder">
    <header className="gptbn-toolbar"><button onClick={onBack} aria-label="Back to automations"><ChevronLeft size={18}/></button><div className="gptbn-brand"><Workflow size={19}/><span><strong>Flow Builder</strong><small>{flow.label}</small></span></div><span className="gptbn-status">{active?'Active':'Inactive'} · v{version} · {savedId?'Saved':'Never saved'}</span><div className="gptbn-canvas-tools">
      <button title="Select Elements" className={selected.length?'is-on':''}><MousePointer2 size={15}/></button><button title="Copy" disabled={!selected.length} onClick={copySelected}><Copy size={15}/></button><button title="Delete" disabled={!selected.length} onClick={deleteSelected}><Trash2 size={15}/></button>
      <button title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={15}/></button><button title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></button>
    </div><button className="gptbn-manager-toggle" onClick={()=>setManagerOpen((v)=>!v)}>Manager</button><div className="gptbn-actions"><button disabled={!savedId||saving} onClick={()=>setExecutionMode('run')}>Run</button><button disabled={!savedId||saving} onClick={()=>setExecutionMode('debug')}>Debug</button><button disabled={!savedId||saving} onClick={()=>setExecutionMode('test')}>View Tests</button><button disabled={!savedId||saving} onClick={()=>{setVersion((v)=>v+1);setSavedId('');setActive(false);setMessage('New version ready to save.')}}>Save As New Version</button><button className="is-brand" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button><button disabled={!savedId||saving} onClick={async()=>{const next=!active;setSaving(true);try{await apiRequest(`/api/platform/rules/${encodeURIComponent(savedId)}`,{method:'PUT',body:JSON.stringify({active:next,lifecycleStatus:next?'ACTIVE':'DRAFT'})});setActive(next);setMessage(next?'Flow activated.':'Flow deactivated.')}catch(error){setMessage(error?.message||'Unable to change activation.')}finally{setSaving(false)}}}>{active?'Deactivate':'Activate'}</button></div></header>
    {message?<div className="gptbn-message" role="status">{message}</div>:null}
    <div className="gptbn-layout-switch"><button className={layout==='auto'?'is-selected':''} onClick={()=>setLayout('auto')}>Auto-Layout</button><button className={layout==='free'?'is-selected':''} onClick={()=>setLayout('free')}>Freeform</button></div>
    <div className="gptbn-zoom"><button aria-label="Zoom out" onClick={()=>setZoom((v)=>Math.max(25,v-10))}><ZoomOut size={15}/></button><span>{zoom}%</span><button aria-label="Zoom in" onClick={()=>setZoom((v)=>Math.min(150,v+10))}><ZoomIn size={15}/></button><button onClick={()=>setZoom(100)}>Reset</button></div>
    {managerOpen?<ResourceManager resources={resources} nodes={nodes} onNew={()=>setResourceOpen(true)} onClose={()=>setManagerOpen(false)}/>:null}
    <div ref={(el)=>{canvasRef.current=el}} className="gptbn-canvas phase2" onMouseMove={moveDrag} onMouseUp={endDrag} onMouseLeave={endDrag} onClick={()=>setSelected([])}>
      <div className="gptbn-stage" style={{transform:`scale(${zoom/100})`,transformOrigin:'top left'}}>
        <svg className="gptbn-edges" width="1200" height="900" aria-hidden="true">{edges.map((edge)=>{const a=point(edge.source,true),b=point(edge.target,false);return <path key={edge.id} d={`M ${a.x} ${a.y} C ${a.x} ${a.y+45}, ${b.x} ${b.y-45}, ${b.x} ${b.y}`}/>})}</svg>
        <button className="gptbn-node start phase2-start" onClick={(e)=>{e.stopPropagation();setDraft({...start});setStartOpen(true)}}><span>▶</span><strong>Start</strong><small>{startValid?(start.objectKey||start.eventKey||start.startDate||'Ready'):'Configure Start'}</small></button>
        {rendered.map((node)=><button key={node.id} className={`gptbn-node canvas-node ${selected.includes(node.id)?'is-selected':''}`} style={{left:node.position?.x,top:node.position?.y}} onMouseDown={(e)=>startDrag(node,e)} onClick={(e)=>{e.stopPropagation();toggleSelect(node.id,e)}} onDoubleClick={(e)=>{e.stopPropagation();setEditing({id:node.id,isNew:false})}} onMouseUp={(e)=>finishConnect(node.id,e)}><span>▣</span><strong>{node.label}</strong><small>{node.apiName}</small><i className="gptbn-port in" onMouseUp={(e)=>finishConnect(node.id,e)}/><i className="gptbn-port out" onMouseDown={(e)=>beginConnect(node.id,e)}/></button>)}
        <div className="gptbn-node end phase2-end"><span>■</span><strong>End</strong></div>
        {layout==='auto'?<button className="gptbn-add phase2-add" aria-label="Add element" onClick={(e)=>{e.stopPropagation();setPicker(true)}}><Plus size={17}/></button>:null}
      </div>
      {layout==='free'?<button className="gptbn-free-add" onClick={(e)=>{e.stopPropagation();setPicker(true)}}><Plus size={16}/> Add Element</button>:null}
    </div>
    <div className="gptbn-flow-name"><label>Flow Label<input value={label} onChange={(e)=>setLabel(e.target.value)}/></label><label>API Name<input value={apiName(label)} readOnly/></label></div>
    {picker?<CanvasPicker onPick={(definition)=>addNode(definition)} onClose={()=>setPicker(false)}/>:null}
    {resourceOpen?<ResourceEditor resources={resources} objects={objects} onCancel={()=>setResourceOpen(false)} onCreate={(resource)=>{setResources((rows)=>[...rows,resource]);setResourceOpen(false)}}/>:null}
    {executionMode?<ExecutionPanel mode={executionMode} workflowId={savedId} flowType={flow.key} resources={resources} nodes={nodes} onClose={()=>setExecutionMode(null)}/>:null}
    {editing?<ElementEditor element={nodes.find((node)=>node.id===editing.id)} nodes={nodes} objects={objects} resources={resources} onResourcesChange={setResources} onSave={saveElement} onCancel={()=>{if(editing.isNew){const id=editing.id;setNodes((rows)=>rows.filter((node)=>node.id!==id));setEdges((rows)=>rows.filter((edge)=>edge.source!==id&&edge.target!==id))}setEditing(null)}}/>:null}
    {startOpen?<StartEditor flow={flow} start={draft} setStart={setDraft} objects={objects} events={events} onCancel={()=>setStartOpen(false)} onDone={()=>{setStart({...draft});setStartOpen(false)}}/>:null}
  </section>
}

export default function GPTBuilderNewPage() {
  const [flow,setFlow]=useState(null)
  const [newOpen,setNewOpen]=useState(true)
  if(flow) return <Builder flow={flow} onBack={()=>{setFlow(null);setNewOpen(true)}}/>
  return <main className="gptbuildernew" data-testid="gptbuildernew"><header className="gptbuildernew__header"><div><span className="gptbuildernew__eyebrow">Salesforce parity workspace</span><h1>GPT Builder New</h1><p>Isolated Salesforce-parity implementation. The current GPT Builder is unchanged.</p></div><button className="gptbn-primary" onClick={()=>setNewOpen(true)}>New Automation</button></header><section className="gptbuildernew__stage"><h2>Phase 1 · Foundation + Flow Types</h2><p>18 audited Salesforce automation types, Salesforce-style Start/End shell, and OneEngine metadata/runtime wiring.</p></section>{newOpen?<NewAutomation onPick={(picked)=>{setFlow(picked);setNewOpen(false)}} onClose={()=>setNewOpen(false)}/>:null}</main>
}
