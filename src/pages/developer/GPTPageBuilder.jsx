import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow, Controls, Handle, Position, addEdge, useEdgesState, useNodesState,
  MarkerType, ConnectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Minus, Plus, Search, Sparkles, WandSparkles } from 'lucide-react'
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

  return <div className="gptpb-canvas-copy">
    <div className="rfux-page"><div className="rfux-canvas-shell">
      <div className="rfux-floating-toolbar" aria-label="Page canvas toolbar">
        <button type="button" title="Auto layout" onClick={()=>{setNodes(current=>computeLayout(current,edges));requestAnimationFrame(()=>requestAnimationFrame(()=>flowInstance?.setViewport({x:140,y:24,zoom:.8},{duration:250})) )}}><WandSparkles size={15}/></button>
        {!nodes.length?<button type="button" title="Add component" aria-label="Add component" onClick={()=>openPicker(null,{x:420,y:80})}><Plus size={15}/></button>:null}
      </div>
      <div className="rfux-scroll-surface"><div className="rfux-canvas-stage" style={{width:canvasSize.width,height:canvasSize.height}}>
        <ReactFlow nodes={nodesWithActions} edges={edgesWithState} onInit={setFlowInstance} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_,n)=>setSelectedId(n.id)} onPaneClick={()=>setSelectedId('')} defaultViewport={{x:140,y:24,zoom:.8}} minZoom={.25} maxZoom={2} connectionMode={ConnectionMode.Loose} nodesDeletable={false} edgesDeletable={false} deleteKeyCode={null} preventScrolling={false} defaultEdgeOptions={{type:'smoothstep'}} proOptions={{hideAttribution:true}}>
          <Controls position="bottom-left" showInteractive={false}/>
        </ReactFlow>
      </div></div>
    </div></div>
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
