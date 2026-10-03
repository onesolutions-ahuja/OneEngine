import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Database, GitBranch, ListFilter, Plus, Search, Settings2, Trash2, Workflow, X, Zap } from 'lucide-react'
import { apiRequest } from '../../services/api'
import './Builder2Page.css'

const CORE = [
  ['GET_RECORDS','Get Records','Data','Find OneEngine records and store field values.'],
  ['CREATE_RECORDS','Create Records','Data','Create one or more OneEngine records.'],
  ['UPDATE_RECORDS','Update Records','Data','Update OneEngine records.'],
  ['DELETE_RECORDS','Delete Records','Data','Delete OneEngine records.'],
  ['ASSIGNMENT','Assignment','Logic','Set variables and record values.'],
  ['DECISION','Decision','Logic','Route the flow based on conditions.'],
  ['LOOP','Loop','Logic','Iterate through a collection.'],
  ['COLLECTION_FILTER','Collection Filter','Logic','Filter a collection using conditions.'],
  ['COLLECTION_SORT','Collection Sort','Logic','Sort a collection and optionally limit results.'],
  ['WAIT','Wait','Logic','Pause until conditions or time requirements are met.'],
  ['TRANSFORM','Transform','Logic','Map source data to a target structure.'],
  ['CUSTOM_ERROR','Custom Error','Logic','Surface a flow error to the user.'],
  ['SUBFLOW','Subflow','Interaction','Run another flow and use its outputs.'],
]
const TYPES = ['Variable','Constant','Formula','Text Template','Choice','Record Choice Set','Collection Choice Set','Picklist Choice Set']
const keyOf=o=>String(o?.object_key||o?.objectKey||o?.api_name||o?.apiName||o?.id||'')
const labelOf=o=>o?.label||o?.name||keyOf(o)
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36)

function ResourcePicker({objects, objectKey, value, onChange, resources, onNew}) {
  const [open,setOpen]=useState(false), [search,setSearch]=useState(''), [trail,setTrail]=useState([])
  const object=objects.find(o=>keyOf(o)===objectKey)
  const automatic=[
    {value:'$record',label:'Current Record',type:'Record',children:true},
    {value:'$previous',label:'Previous Record',type:'Record',children:true},
    {value:'$user.id',label:'Current User',type:'Global Variable'},
    {value:'$now',label:'Current Date/Time',type:'Global Variable'},
    {value:'$Flow.CurrentStage',label:'Current Stage',type:'Global Variable'},
  ]
  const rows=[...automatic,...resources].filter(r=>!search||String(r.label||r.value).toLowerCase().includes(search.toLowerCase()))
  const selected=[...automatic,...resources].find(r=>r.value===value)
  return <div className="b2-resource">
    <button type="button" className="b2-combobox" onClick={()=>setOpen(v=>!v)}><span>{selected?.label||value||'Select a resource…'}</span><ChevronDown size={14}/></button>
    {open?<div className="b2-resource-menu">
      <div className="b2-resource-head">{trail.length?<button onClick={()=>setTrail(t=>t.slice(0,-1))}><ChevronLeft size={14}/></button>:null}<span>{trail.length?trail.join(' › '):'Select a Resource'}</span><button onClick={()=>setOpen(false)}><X size={14}/></button></div>
      <label className="b2-resource-search"><Search size={14}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resources…"/></label>
      <div className="b2-resource-list">
        {!rows.length?<div className="b2-empty-small">No matching resources</div>:rows.map(r=><button key={r.value} className={r.value===value?'is-selected':''} onClick={()=>{onChange(r.value);setOpen(false)}}><span className="b2-resource-icon"><Database size={14}/></span><span><b>{r.label}</b><small>{r.type||'Resource'}{r.value==='$record'&&object? ` · ${labelOf(object)}`:''}</small></span>{r.value===value?<span>✓</span>:r.children?<ChevronRight size={14}/>:null}</button>)}
      </div>
      <button className="b2-new-resource" onClick={()=>{setOpen(false);onNew()}}><Plus size={14}/> New Resource</button>
    </div>:null}
  </div>
}

function ResourceDialog({onClose,onCreate}) {
  const [type,setType]=useState('Variable'),[name,setName]=useState(''),[dataType,setDataType]=useState('Text'),[value,setValue]=useState('')
  return <div className="b2-modal-backdrop"><div className="b2-modal"><header><div><h3>New Resource</h3><p>Create a resource for this flow.</p></div><button onClick={onClose}><X size={18}/></button></header>
    <div className="b2-form">
      <label>Resource Type<select value={type} onChange={e=>setType(e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      <label>API Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Resource_API_Name"/></label>
      {!['Text Template'].includes(type)?<label>Data Type<select value={dataType} onChange={e=>setDataType(e.target.value)}><option>Text</option><option>Number</option><option>Currency</option><option>Boolean</option><option>Date</option><option>Date/Time</option><option>Record</option></select></label>:null}
      {type==='Formula'?<label>Formula<textarea value={value} onChange={e=>setValue(e.target.value)} rows={6} placeholder="Enter formula…"/></label>:type==='Text Template'?<label>Body<textarea value={value} onChange={e=>setValue(e.target.value)} rows={8} placeholder="Enter text and resources…"/></label>:<label>Default Value<input value={value} onChange={e=>setValue(e.target.value)}/></label>}
    </div><footer><button onClick={onClose}>Cancel</button><button className="is-primary" disabled={!name.trim()} onClick={()=>onCreate({value:`$${name.trim()}`,label:name.trim(),type,dataType,defaultValue:value})}>Done</button></footer>
  </div></div>
}

function Conditions({value=[],onChange,resources,objects,objectKey,onNew}) {
  const rows=value.length?value:[{id:uid(),resource:'',operator:'Equals',value:''}]
  const patch=(id,p)=>onChange(rows.map(r=>r.id===id?{...r,...p}:r))
  return <div className="b2-condition-block">{rows.map((r,i)=><div className="b2-condition" key={r.id}><span>{i+1}</span><ResourcePicker {...{resources,objects,objectKey,onNew}} value={r.resource} onChange={v=>patch(r.id,{resource:v})}/><select value={r.operator} onChange={e=>patch(r.id,{operator:e.target.value})}><option>Equals</option><option>Does Not Equal</option><option>Is Null</option><option>Changed</option><option>Greater Than</option><option>Less Than</option><option>Contains</option></select><input value={r.value} onChange={e=>patch(r.id,{value:e.target.value})} placeholder="Value"/><button onClick={()=>onChange(rows.filter(x=>x.id!==r.id))}><Trash2 size={13}/></button></div>)}<button className="b2-text-action" onClick={()=>onChange([...rows,{id:uid(),resource:'',operator:'Equals',value:''}])}><Plus size={13}/> Add Condition</button></div>
}

function Properties({node,onPatch,objects,resources,onNew,actions}) {
  if(!node)return <div className="b2-properties-empty"><Settings2 size={26}/><b>Select an element</b><span>Its properties appear here.</span></div>
  const p=node.config||{}, patch=x=>onPatch({...node,config:{...p,...x}})
  const objectKey=p.objectKey||''
  const common=<><label>Label<input value={node.label||''} onChange={e=>onPatch({...node,label:e.target.value})}/></label><label>API Name<input value={node.apiName||''} onChange={e=>onPatch({...node,apiName:e.target.value})}/></label></>
  const object=<label>Object<select value={objectKey} onChange={e=>patch({objectKey:e.target.value})}><option value="">Select an object…</option>{objects.map(o=><option key={keyOf(o)} value={keyOf(o)}>{labelOf(o)}</option>)}</select></label>
  const cond=<><label>Condition Requirements<select value={p.conditionLogic||'all'} onChange={e=>patch({conditionLogic:e.target.value})}><option value="all">All Conditions Are Met (AND)</option><option value="any">Any Condition Is Met (OR)</option><option value="custom">Custom Condition Logic Is Met</option><option value="formula">Formula Evaluates to True</option></select></label><Conditions value={p.conditions} onChange={v=>patch({conditions:v})} {...{resources,objects,objectKey,onNew}}/></>
  return <div className="b2-form">{common}
    {['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS'].includes(node.type)?object:null}
    {['GET_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','DECISION','COLLECTION_FILTER','WAIT'].includes(node.type)?cond:null}
    {node.type==='GET_RECORDS'?<><label>How Many Records to Store<select value={p.limit||'first'} onChange={e=>patch({limit:e.target.value})}><option value="first">Only the first record</option><option value="all">All records</option></select></label><label>How to Store Record Data<select value={p.store||'auto'} onChange={e=>patch({store:e.target.value})}><option value="auto">Automatically store all fields</option><option value="choose">Choose fields and assign variables</option></select></label></>:null}
    {node.type==='ASSIGNMENT'?<><label>Variable<ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.resource||''} onChange={v=>patch({resource:v})}/></label><label>Operator<select value={p.operator||'Equals'} onChange={e=>patch({operator:e.target.value})}><option>Equals</option><option>Add</option><option>Subtract</option><option>Add Item</option><option>Remove Item</option></select></label><label>Value<input value={p.value||''} onChange={e=>patch({value:e.target.value})}/></label></>:null}
    {node.type==='LOOP'?<><label>Collection Variable<ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Direction<select value={p.direction||'first'} onChange={e=>patch({direction:e.target.value})}><option value="first">First item to last item</option><option value="last">Last item to first item</option></select></label></>:null}
    {node.type==='COLLECTION_SORT'?<><label>Collection<ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.collection||''} onChange={v=>patch({collection:v})}/></label><label>Sort Order<select value={p.order||'asc'} onChange={e=>patch({order:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label><label>Maximum Items<input type="number" min="0" value={p.max||''} onChange={e=>patch({max:e.target.value})}/></label></>:null}
    {node.type==='TRANSFORM'?<div className="b2-transform"><div><b>Source Data</b><ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.source||''} onChange={v=>patch({source:v})}/></div><div><b>Target Data</b><ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.target||''} onChange={v=>patch({target:v})}/></div><p>Select compatible source and target resources to define mappings.</p></div>:null}
    {node.type==='CUSTOM_ERROR'?<><label>Where to Show the Error<select value={p.location||'record'} onChange={e=>patch({location:e.target.value})}><option value="record">In a window on the record page</option><option value="field">Inline on a field</option></select></label>{p.location==='field'?<label>Field<ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.field||''} onChange={v=>patch({field:v})}/></label>:null}<label>Error Message<textarea rows={4} value={p.message||''} onChange={e=>patch({message:e.target.value})}/></label></>:null}
    {node.type==='ACTION'?<><label>Action<select value={p.actionKey||''} onChange={e=>patch({actionKey:e.target.value})}><option value="">Select action…</option>{actions.map(a=><option key={a.key} value={a.key}>{a.displayName||a.label||a.key}</option>)}</select></label><p className="b2-help">Actions come from OneEngine's metadata action registry; Builder2 does not hardcode provider actions.</p></>:null}
    {node.type==='SUBFLOW'?<label>Flow<ResourcePicker {...{resources,objects,objectKey,onNew}} value={p.flow||''} onChange={v=>patch({flow:v})}/></label>:null}
  </div>
}

export default function Builder2Page(){
  const [objects,setObjects]=useState([]),[actions,setActions]=useState([]),[nodes,setNodes]=useState([]),[selected,setSelected]=useState(''),[selector,setSelector]=useState(false),[search,setSearch]=useState(''),[resources,setResources]=useState([]),[resourceDialog,setResourceDialog]=useState(false),[tab,setTab]=useState('elements'),[error,setError]=useState('')
  useEffect(()=>{Promise.all([apiRequest('/api/platform/objects'),apiRequest('/api/platform/action-registry')]).then(([o,a])=>{setObjects(o?.data?.objects||o?.data||[]);setActions(Array.isArray(a?.data)?a.data:[])}).catch(e=>setError(e?.message||'Unable to load Builder2 metadata'))},[])
  const actionElements=useMemo(()=>actions.map(a=>({key:`ACTION:${a.key}`,type:'ACTION',label:a.displayName||a.label||a.key,category:'Actions',description:a.description||'OneEngine registered action',actionKey:a.key})),[actions])
  const elements=useMemo(()=>[...CORE.map(([key,label,category,description])=>({key,type:key,label,category,description})),...actionElements],[actionElements])
  const filtered=elements.filter(e=>!search||[e.label,e.category,e.description].join(' ').toLowerCase().includes(search.toLowerCase()))
  const groups=[...new Set(filtered.map(e=>e.category))]
  const add=e=>{const n={id:uid(),type:e.type,label:e.label,apiName:`${e.type}_${nodes.length+1}`,config:e.actionKey?{actionKey:e.actionKey}:{}};setNodes(x=>[...x,n]);setSelected(n.id);setSelector(false);setSearch('')}
  const current=nodes.find(n=>n.id===selected)
  const patch=n=>setNodes(x=>x.map(v=>v.id===n.id?n:v))
  return <div className="b2-shell">
    <header className="b2-top"><div className="b2-title"><Workflow size={20}/><span><b>Builder2</b><small>Salesforce parity workspace · Phase 2</small></span></div><div className="b2-top-actions"><button>Run</button><button>View Tests</button><button className="is-primary">Save</button><button>Activate</button></div></header>
    {error?<div className="b2-error">{error}</div>:null}
    <div className="b2-workspace">
      <aside className="b2-toolbox"><div className="b2-tabs"><button className={tab==='elements'?'is-active':''} onClick={()=>setTab('elements')}>Elements</button><button className={tab==='manager'?'is-active':''} onClick={()=>setTab('manager')}>Manager</button></div>
        {tab==='elements'?<><label className="b2-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label>{groups.map(g=><section className="b2-palette-group" key={g}><h4>{g}</h4>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span className="b2-palette-icon">{g==='Logic'?<GitBranch size={15}/>:g==='Actions'?<Zap size={15}/>:<Database size={15}/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</section>)}</>:<div className="b2-manager"><button onClick={()=>setResourceDialog(true)}><Plus size={14}/> New Resource</button>{resources.map(r=><div key={r.value}><Database size={13}/><span><b>{r.label}</b><small>{r.type} · {r.dataType||''}</small></span></div>)}</div>}
      </aside>
      <main className="b2-canvas"><div className="b2-flow"><button className="b2-start"><span>Start</span><small>Configure trigger in Phase 4</small></button><div className="b2-line"/>
        {nodes.map((n,i)=><div key={n.id} className="b2-step-wrap"><button className="b2-add" onClick={()=>setSelector(true)}><Plus size={14}/></button><div className="b2-line"/><button className={`b2-node ${selected===n.id?'is-selected':''}`} onClick={()=>setSelected(n.id)}><span className="b2-node-icon">{n.type==='DECISION'?<GitBranch size={16}/>:n.type==='COLLECTION_FILTER'?<ListFilter size={16}/>:n.type==='ACTION'?<Zap size={16}/>:<Database size={16}/>}</span><span><b>{n.label}</b><small>{n.type.replaceAll('_',' ')}</small></span><span className="b2-node-menu">⋮</span></button><div className="b2-line"/></div>)}
        <button className="b2-add" onClick={()=>setSelector(true)}><Plus size={14}/></button><div className="b2-line"/><div className="b2-end">■ <span>End</span></div>
      </div></main>
      <aside className="b2-properties"><header><div><b>{current?.label||'Properties'}</b><small>{current?current.type.replaceAll('_',' '):'Select an element'}</small></div>{current?<button onClick={()=>setSelected('')}><X size={16}/></button>:null}</header><Properties node={current} onPatch={patch} {...{objects,resources,actions}} onNew={()=>setResourceDialog(true)}/></aside>
    </div>
    {selector?<div className="b2-selector"><header><div><h3>Add Element</h3><p>Select what the flow should do next.</p></div><button onClick={()=>setSelector(false)}><X size={18}/></button></header><label className="b2-selector-search"><Search size={15}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search elements…"/></label><div className="b2-selector-body">{groups.map(g=><section key={g}><h4>{g}</h4><div>{filtered.filter(e=>e.category===g).map(e=><button key={e.key} onClick={()=>add(e)}><span>{g==='Logic'?<GitBranch/>:g==='Actions'?<Zap/>:<Database/>}</span><span><b>{e.label}</b><small>{e.description}</small></span></button>)}</div></section>)}</div></div>:null}
    {resourceDialog?<ResourceDialog onClose={()=>setResourceDialog(false)} onCreate={r=>{setResources(x=>[...x,r]);setResourceDialog(false)}}/>:null}
  </div>
}
