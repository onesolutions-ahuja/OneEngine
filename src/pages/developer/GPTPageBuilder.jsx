import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow, Controls, Handle, Position, addEdge, useEdgesState, useNodesState,
  MarkerType, ConnectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Minus, Plus, Search, Sparkles, Trash2, WandSparkles, X } from 'lucide-react'
import {
  componentCategories, componentCategoryLabel, componentIcon,
  createRegisteredComponent, normalizeComponent, registryForBuilder, useComponentRegistry,
} from '../settings/Platform/componentRegistry.js'
import './ReactFlowCanvasUXTest.css'
import './GPTPageBuilder.css'

const CHILD_COLORS=[
  {key:'red',hex:'#dc2626'},{key:'green',hex:'#16a34a'},{key:'orange',hex:'#f97316'},
  {key:'blue',hex:'#2563eb'},{key:'yellow',hex:'#ca8a04'},{key:'cyan',hex:'#0891b2'},{key:'magenta',hex:'#c026d3'},
]
function seededColorOrder(seed){const values=[...CHILD_COLORS];let hash=0;for(let i=0;i<String(seed).length;i+=1)hash=((hash<<5)-hash+String(seed).charCodeAt(i))|0;for(let i=values.length-1;i>0;i-=1){hash=Math.imul(hash^(hash>>>16),0x45d9f3b);const j=Math.abs(hash)%(i+1);[values[i],values[j]]=[values[j],values[i]]}return values}

function configurableFields(meta,instance){
  const declared=Array.isArray(meta?.configurable)?meta.configurable:[]
  const normalized=declared.map((entry,index)=>{
    if(typeof entry==='string') return {key:entry,label:entry.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()),type:'text'}
    if(!entry||typeof entry!=='object') return null
    const key=String(entry.key||entry.name||entry.path||'').trim()
    if(!key)return null
    return {
      ...entry,
      key,
      label:String(entry.label||entry.title||key.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase())),
      type:String(entry.type||entry.inputType||'text').toLowerCase(),
      options:Array.isArray(entry.options)?entry.options:[],
    }
  }).filter(Boolean)
  const declaredKeys=new Set(normalized.map(field=>field.key))
  const configKeys=Object.keys(instance?.config||{}).filter(key=>!declaredKeys.has(key))
  return [...normalized,...configKeys.map(key=>({key,label:key.replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()),type:typeof instance?.config?.[key]==='boolean'?'boolean':typeof instance?.config?.[key]==='number'?'number':'text',inferred:true}))]
}

function coercePropertyValue(value,type){
  if(type==='boolean')return Boolean(value)
  if(type==='number'||type==='integer'||type==='decimal')return value===''?'':Number(value)
  return value
}

function ComponentProperties({node,onChange,onClose}){
  if(!node)return null
  const meta=normalizeComponent(node.data?.meta)
  const instance=node.data?.instance||{}
  const fields=configurableFields(meta,instance)
  const [newKey,setNewKey]=useState('')
  const [newValue,setNewValue]=useState('')
  const patch=(next)=>onChange?.({...instance,...next})
  const patchConfig=(key,value)=>patch({config:{...(instance.config||{}),[key]:value}})
  const removeConfig=(key)=>{
    const next={...(instance.config||{})}
    delete next[key]
    patch({config:next})
  }
  const addProperty=()=>{
    const key=newKey.trim()
    if(!key)return
    patchConfig(key,newValue)
    setNewKey('')
    setNewValue('')
  }
  return <aside className="gptpb-properties" aria-label="Component properties">
    <header><div><strong>Component Properties</strong><span>{meta.label||instance.label||'Component'}</span></div><button type="button" aria-label="Close properties" onClick={onClose}><X size={16}/></button></header>
    <div className="gptpb-properties-body">
      <section>
        <h3>General</h3>
        <label><span>Title</span><input value={instance.title||''} onChange={e=>patch({title:e.target.value})}/></label>
        <label><span>Label</span><input value={instance.label||''} onChange={e=>patch({label:e.target.value})}/></label>
        <label><span>Component</span><input value={meta.label||meta.key||''} disabled/></label>
        <label><span>Renderer</span><input value={instance.rendererKey||meta.rendererKey||meta.key||''} disabled/></label>
      </section>
      <section>
        <h3>Properties</h3>
        {fields.length?fields.map(field=>{
          const value=instance.config?.[field.key]??field.defaultValue??''
          return <div className="gptpb-property-row" key={field.key}>
            <label><span>{field.label}</span>
              {field.type==='boolean'?<input type="checkbox" checked={Boolean(value)} onChange={e=>patchConfig(field.key,e.target.checked)}/>
              :field.options.length?<select value={String(value??'')} onChange={e=>patchConfig(field.key,coercePropertyValue(e.target.value,field.type))}><option value="">Select…</option>{field.options.map(option=>{const optionValue=typeof option==='object'?(option.value??option.key??option.label):option;const optionLabel=typeof option==='object'?(option.label??option.value??option.key):option;return <option key={String(optionValue)} value={String(optionValue)}>{String(optionLabel)}</option>})}</select>
              :field.type==='textarea'||field.type==='long_text'?<textarea value={String(value??'')} onChange={e=>patchConfig(field.key,e.target.value)}/>
              :<input type={field.type==='number'||field.type==='integer'||field.type==='decimal'?'number':'text'} value={String(value??'')} onChange={e=>patchConfig(field.key,coercePropertyValue(e.target.value,field.type))}/>}
            </label>
            {field.inferred?<button type="button" aria-label={`Remove property ${field.label}`} onClick={()=>removeConfig(field.key)}><Trash2 size={13}/></button>:null}
          </div>
        }):<p className="gptpb-properties-empty">No predefined properties. Add a metadata property below.</p>}
        <div className="gptpb-add-property">
          <input value={newKey} onChange={e=>setNewKey(e.target.value)} placeholder="Property key"/>
          <input value={newValue} onChange={e=>setNewValue(e.target.value)} placeholder="Value"/>
          <button type="button" disabled={!newKey.trim()} onClick={addProperty}><Plus size={13}/> Add</button>
        </div>
      </section>
      <section>
        <h3>Layout</h3>
        {Object.keys(instance.layout||{}).length?Object.entries(instance.layout||{}).map(([key,value])=><label key={key}><span>{key.replace(/_/g,' ')}</span><input value={String(value??'')} onChange={e=>patch({layout:{...(instance.layout||{}),[key]:e.target.value}})}/></label>):<p className="gptpb-properties-empty">This component has no layout properties yet.</p>}
      </section>
    </div>
  </aside>
}

function PageNode({id,data,selected}){
  const Icon=componentIcon(data.meta)
  const removable=!data.hasChildren&&!data.isRoot
  return <div className={`rfux-node rfux-node--blue ${selected?'is-selected':''}`}>
    <Handle type="target" position={Position.Top} className="rfux-handle"/>
    <div className="rfux-node-icon"><Icon size={16}/></div>
    <div className="rfux-node-copy"><strong>{data.instance?.title||data.instance?.label||data.meta?.label||'Page component'}</strong><span>{componentCategoryLabel(data.meta?.category)} · {data.meta?.api||''}</span></div>
    {removable?<button type="button" className="rfux-node-remove nodrag" aria-label="Remove node" onClick={(e)=>{e.stopPropagation();data.onRemoveNode?.(id)}}><Minus size={14}/></button>:null}
    <button type="button" className="rfux-node-add nodrag" aria-label="Add component" title="Add component" onClick={(e)=>{e.stopPropagation();data.onQuickAdd?.(id)}}><Plus size={14}/></button>
    <Handle type="source" position={Position.Bottom} className="rfux-handle"/>
  </div>
}

function computeLayout(nodes,edges){
  const depth=new Map()
  const resolveDepth=(id,trail=new Set())=>{if(depth.has(id))return depth.get(id);if(trail.has(id))return 0;const parents=edges.filter(e=>e.target===id).map(e=>e.source);if(!parents.length){depth.set(id,0);return 0}const next=new Set(trail);next.add(id);const value=Math.max(...parents.map(p=>resolveDepth(p,next)))+1;depth.set(id,value);return value}
  nodes.forEach(n=>resolveDepth(n.id));const grouped=new Map();nodes.forEach(n=>{const level=depth.get(n.id)||0;if(!grouped.has(level))grouped.set(level,[]);grouped.get(level).push(n.id)})
  return nodes.map(n=>{const level=depth.get(n.id)||0,row=grouped.get(level)||[],index=row.indexOf(n.id),width=(row.length-1)*300;return {...n,position:{x:480-width/2+index*300,y:60+level*165}}})
}

export default function GPTPageBuilder(){
  const registry=useComponentRegistry()
  const palette=useMemo(()=>registryForBuilder(registry,'PAGE'),[registry])
  const categories=useMemo(()=>componentCategories(palette),[palette])
  const [nodes,setNodes,onNodesChange]=useNodesState([])
  const [edges,setEdges,onEdgesChange]=useEdgesState([])
  const [selectedId,setSelectedId]=useState('')
  const [flowInstance,setFlowInstance]=useState(null)
  const [picker,setPicker]=useState(null)
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState('all')
  const nodeTypes=useMemo(()=>({pageComponent:PageNode}),[])
  const selectedNode=useMemo(()=>nodes.find(node=>node.id===selectedId)||null,[nodes,selectedId])
  const updateSelectedComponent=useCallback((nextInstance)=>{
    if(!selectedId)return
    setNodes(current=>current.map(node=>node.id===selectedId?{...node,data:{...node.data,instance:nextInstance}}:node))
  },[selectedId,setNodes])

  const visible=useMemo(()=>palette.filter(raw=>{const item=normalizeComponent(raw),q=query.trim().toLowerCase();return(category==='all'||item.category===category)&&(!q||item.label.toLowerCase().includes(q)||item.key.toLowerCase().includes(q))}),[palette,query,category])

  const openPicker=useCallback((sourceId=null,position=null)=>{setPicker({sourceId,position});setQuery('');setCategory('all')},[])
  const addComponent=useCallback((raw)=>{
    const meta=normalizeComponent(raw),created=createRegisteredComponent(meta,'PAGE'),source=picker?.sourceId?nodes.find(n=>n.id===picker.sourceId):null
    const siblingCount=source?edges.filter(e=>e.source===source.id).length:0
    const position=picker?.position||(source?{x:source.position.x+(siblingCount%2===0?300:-300),y:source.position.y+165}:{x:420,y:80})
    const node={id:created.id,type:'pageComponent',position,data:{meta,instance:created}}
    setNodes(current=>[...current,node])
    if(source)setEdges(current=>addEdge({id:`e${source.id}-${created.id}`,source:source.id,target:created.id,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed}},current))
    setSelectedId(created.id);setPicker(null)
  },[picker,nodes,edges,setNodes,setEdges])

  const removeNode=useCallback((nodeId)=>{
    const hasChildren=edges.some(e=>e.source===nodeId),isRoot=!edges.some(e=>e.target===nodeId)
    if(hasChildren||isRoot)return
    setNodes(current=>current.filter(n=>n.id!==nodeId));setEdges(current=>current.filter(e=>e.source!==nodeId&&e.target!==nodeId));if(selectedId===nodeId)setSelectedId('')
  },[edges,selectedId,setNodes,setEdges])

  const nodesWithActions=useMemo(()=>nodes.map(n=>({...n,data:{...n.data,onQuickAdd:(id)=>openPicker(id),onRemoveNode:removeNode,hasChildren:edges.some(e=>e.source===n.id),isRoot:!edges.some(e=>e.target===n.id)},selected:n.id===selectedId})),[nodes,edges,openPicker,removeNode,selectedId])
  const edgesWithState=useMemo(()=>{const colors=seededColorOrder(selectedId||'none');let i=0;return edges.map(edge=>{if(edge.source!==selectedId)return{...edge,animated:false,className:'',style:undefined,markerEnd:{type:MarkerType.ArrowClosed}};const color=colors[i++%colors.length];return{...edge,animated:false,className:`rfux-child-running-edge rfux-child-${color.key}`,style:{'--rfux-edge-color':color.hex,stroke:color.hex},markerEnd:{type:MarkerType.ArrowClosed,color:color.hex}}})},[edges,selectedId])

  const onConnect=useCallback(connection=>{if(!connection.source||!connection.target||connection.source===connection.target)return;if(edges.some(e=>e.source===connection.source&&e.target===connection.target))return;setEdges(current=>addEdge({...connection,id:`e${connection.source}-${connection.target}-${Date.now()}`,type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed}},current))},[edges,setEdges])
  const canvasSize=useMemo(()=>({width:Math.ceil(nodes.reduce((v,n)=>Math.max(v,Number(n.position?.x||0)+300),1000)),height:Math.ceil(nodes.reduce((v,n)=>Math.max(v,Number(n.position?.y||0)+150),700))}),[nodes])

  return <div className={`gptpb-canvas-copy ${selectedNode?'has-properties':''}`}>
    <div className="gptpb-canvas-main"><div className="rfux-page"><div className="rfux-canvas-shell">
      <div className="rfux-floating-toolbar gptpb-toolbar" aria-label="Page canvas toolbar">
        <button type="button" title="Auto layout" aria-label="Auto layout" onClick={()=>{setNodes(current=>computeLayout(current,edges));requestAnimationFrame(()=>requestAnimationFrame(()=>flowInstance?.fitView?.({padding:.18,duration:250})))}}><WandSparkles size={15}/></button>
        <button type="button" className="gptpb-add-component" title="Add component" aria-label="Add component" onClick={()=>openPicker(null,{x:420,y:80})}><Plus size={15}/><span>Add Component</span></button>
      </div>
      <div className="rfux-scroll-surface"><div className="rfux-canvas-stage" style={{width:canvasSize.width,height:canvasSize.height}}>
        <ReactFlow nodes={nodesWithActions} edges={edgesWithState} onInit={setFlowInstance} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_,n)=>setSelectedId(n.id)} onPaneClick={()=>setSelectedId('')} defaultViewport={{x:140,y:24,zoom:.8}} minZoom={.25} maxZoom={2} connectionMode={ConnectionMode.Loose} nodesDeletable={false} edgesDeletable={false} deleteKeyCode={null} preventScrolling={false} defaultEdgeOptions={{type:'smoothstep'}} proOptions={{hideAttribution:true}}>
          <Controls position="bottom-left" showInteractive={false}/>
        </ReactFlow>
      </div></div>
    </div></div></div>
    {selectedNode?<ComponentProperties node={selectedNode} onChange={updateSelectedComponent} onClose={()=>setSelectedId('')}/>:null}
    {picker?<div className="gptpb-picker-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setPicker(null)}}>
      <section className="gptpb-picker" role="dialog" aria-modal="true" aria-label="Select component">
        <header><div><strong>Select component</strong><span>{palette.length} registered components</span></div><button type="button" onClick={()=>setPicker(null)}>×</button></header>
        <label className="gptpb-picker-search"><Search size={15}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search components"/></label>
        <div className="gptpb-picker-categories">{categories.map(key=><button type="button" key={key} className={category===key?'is-active':''} onClick={()=>setCategory(key)}>{key==='all'?'All':componentCategoryLabel(key)}</button>)}</div>
        <div className="gptpb-picker-list">{visible.map(raw=>{const item=normalizeComponent(raw),Icon=componentIcon(item);return <button type="button" key={item.api||item.key} onClick={()=>addComponent(item)}><span><Icon size={17}/></span><span><strong>{item.label}</strong><small>{componentCategoryLabel(item.category)} · {item.api}</small></span></button>})}</div>
      </section>
    </div>:null}
  </div>
}
