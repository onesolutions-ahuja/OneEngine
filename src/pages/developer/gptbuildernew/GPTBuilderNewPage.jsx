import { useEffect, useMemo, useState } from 'react'
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
  const [selected,setSelected]=useState([])
  const [picker,setPicker]=useState(false)
  const [zoom,setZoom]=useState(100)
  const [history,setHistory]=useState([])
  const [future,setFuture]=useState([])
  const [clipboard,setClipboard]=useState([])
  const [connectFrom,setConnectFrom]=useState('')
  const [dragging,setDragging]=useState(null)
  const canvasRef=useState(()=>({current:null}))[0]

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
      setSelected([id]);setPicker(false)
    })
  }
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
    setDragging({id:node.id,originX:event.clientX,originY:event.clientY,startX:node.position?.x||0,startY:node.position?.y||0,rect})
    if(!selected.includes(node.id))setSelected([node.id])
  }
  const moveDrag=(event)=>{
    if(!dragging||layout!=='free')return
    const scale=zoom/100
    const dx=(event.clientX-dragging.originX)/scale,dy=(event.clientY-dragging.originY)/scale
    setNodes((rows)=>rows.map((node)=>node.id===dragging.id?{...node,position:{x:Math.max(20,dragging.startX+dx),y:Math.max(20,dragging.startY+dy)}}:node))
  }
  const endDrag=()=>{if(dragging){setHistory((rows)=>[...rows.slice(-49),snapshot(nodes.map((node)=>node.id===dragging.id?{...node,position:{x:dragging.startX,y:dragging.startY}}:node),edges)]);setFuture([])}setDragging(null)}

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
    const payload={name:label||'New Flow',objectKey:start.objectKey||null,triggerKey:triggerKey(flow.key,start),conditions:[],active:false,lifecycleStatus:'DRAFT',version:1,action:{type:'workflow',gptBuilder:true,gptBuilderNew:true,apiName:apiName(label),description:'',apiVersion:'68.0',flowType:flow.key,start,layout:{mode:layout==='free'?'FREE_FORM':'AUTO'},gptBuilderElements:nodes.map((node)=>({...node,source:layout})),resources:[],goToConnections:edges.map((edge)=>({sourceId:edge.source,targetId:edge.target})),actions:[]}}
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
    <header className="gptbn-toolbar"><button onClick={onBack} aria-label="Back to automations"><ChevronLeft size={18}/></button><div className="gptbn-brand"><Workflow size={19}/><span><strong>Flow Builder</strong><small>{flow.label}</small></span></div><span className="gptbn-status">Inactive · {savedId?'Saved':'Never saved'}</span><div className="gptbn-canvas-tools">
      <button title="Select Elements" className={selected.length?'is-on':''}><MousePointer2 size={15}/></button><button title="Copy" disabled={!selected.length} onClick={copySelected}><Copy size={15}/></button><button title="Delete" disabled={!selected.length} onClick={deleteSelected}><Trash2 size={15}/></button>
      <button title="Undo" disabled={!history.length} onClick={undo}><Undo2 size={15}/></button><button title="Redo" disabled={!future.length} onClick={redo}><Redo2 size={15}/></button>
    </div><div className="gptbn-actions"><button disabled>Run</button><button disabled>Debug</button><button disabled>View Tests</button><button disabled>Save As New Version</button><button className="is-brand" disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</button><button disabled>Activate</button></div></header>
    {message?<div className="gptbn-message" role="status">{message}</div>:null}
    <div className="gptbn-layout-switch"><button className={layout==='auto'?'is-selected':''} onClick={()=>setLayout('auto')}>Auto-Layout</button><button className={layout==='free'?'is-selected':''} onClick={()=>setLayout('free')}>Freeform</button></div>
    <div className="gptbn-zoom"><button aria-label="Zoom out" onClick={()=>setZoom((v)=>Math.max(25,v-10))}><ZoomOut size={15}/></button><span>{zoom}%</span><button aria-label="Zoom in" onClick={()=>setZoom((v)=>Math.min(150,v+10))}><ZoomIn size={15}/></button><button onClick={()=>setZoom(100)}>Reset</button></div>
    <div ref={(el)=>{canvasRef.current=el}} className="gptbn-canvas phase2" onMouseMove={moveDrag} onMouseUp={endDrag} onMouseLeave={endDrag} onClick={()=>setSelected([])}>
      <div className="gptbn-stage" style={{transform:`scale(${zoom/100})`,transformOrigin:'top left'}}>
        <svg className="gptbn-edges" width="1200" height="900" aria-hidden="true">{edges.map((edge)=>{const a=point(edge.source,true),b=point(edge.target,false);return <path key={edge.id} d={`M ${a.x} ${a.y} C ${a.x} ${a.y+45}, ${b.x} ${b.y-45}, ${b.x} ${b.y}`}/>})}</svg>
        <button className="gptbn-node start phase2-start" onClick={(e)=>{e.stopPropagation();setDraft({...start});setStartOpen(true)}}><span>▶</span><strong>Start</strong><small>{startValid?(start.objectKey||start.eventKey||start.startDate||'Ready'):'Configure Start'}</small></button>
        {rendered.map((node)=><button key={node.id} className={`gptbn-node canvas-node ${selected.includes(node.id)?'is-selected':''}`} style={{left:node.position?.x,top:node.position?.y}} onMouseDown={(e)=>startDrag(node,e)} onClick={(e)=>{e.stopPropagation();toggleSelect(node.id,e)}} onDoubleClick={(e)=>beginConnect(node.id,e)} onMouseUp={(e)=>finishConnect(node.id,e)}><span>▣</span><strong>{node.label}</strong><small>{node.apiName}</small><i className="gptbn-port in" onMouseUp={(e)=>finishConnect(node.id,e)}/><i className="gptbn-port out" onMouseDown={(e)=>beginConnect(node.id,e)}/></button>)}
        <div className="gptbn-node end phase2-end"><span>■</span><strong>End</strong></div>
        {layout==='auto'?<button className="gptbn-add phase2-add" aria-label="Add element" onClick={(e)=>{e.stopPropagation();setPicker(true)}}><Plus size={17}/></button>:null}
      </div>
      {layout==='free'?<button className="gptbn-free-add" onClick={(e)=>{e.stopPropagation();setPicker(true)}}><Plus size={16}/> Add Element</button>:null}
    </div>
    <div className="gptbn-flow-name"><label>Flow Label<input value={label} onChange={(e)=>setLabel(e.target.value)}/></label><label>API Name<input value={apiName(label)} readOnly/></label></div>
    {picker?<CanvasPicker onPick={(definition)=>addNode(definition)} onClose={()=>setPicker(false)}/>:null}
    {startOpen?<StartEditor flow={flow} start={draft} setStart={setDraft} objects={objects} events={events} onCancel={()=>setStartOpen(false)} onDone={()=>{setStart({...draft});setStartOpen(false)}}/>:null}
  </section>
}

export default function GPTBuilderNewPage() {
  const [flow,setFlow]=useState(null)
  const [newOpen,setNewOpen]=useState(true)
  if(flow) return <Builder flow={flow} onBack={()=>{setFlow(null);setNewOpen(true)}}/>
  return <main className="gptbuildernew" data-testid="gptbuildernew"><header className="gptbuildernew__header"><div><span className="gptbuildernew__eyebrow">Salesforce parity workspace</span><h1>GPT Builder New</h1><p>Isolated Salesforce-parity implementation. The current GPT Builder is unchanged.</p></div><button className="gptbn-primary" onClick={()=>setNewOpen(true)}>New Automation</button></header><section className="gptbuildernew__stage"><h2>Phase 1 · Foundation + Flow Types</h2><p>18 audited Salesforce automation types, Salesforce-style Start/End shell, and OneEngine metadata/runtime wiring.</p></section>{newOpen?<NewAutomation onPick={(picked)=>{setFlow(picked);setNewOpen(false)}} onClose={()=>setNewOpen(false)}/>:null}</main>
}
