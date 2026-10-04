import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const START_ID='__flow_start__'
const END_ID='__flow_end__'

function FlowStart() {
  return <div className="b2-rf-start"><b>Start</b><Handle id="default" type="source" position={Position.Bottom}/></div>
}

function FlowEnd() {
  return <div className="b2-rf-end" title="End"><Handle type="target" position={Position.Top}/><span aria-hidden="true">■</span><b className="sr-only">End</b></div>
}

function FlowNode({data}) {
  const outcomes=Array.isArray(data.outcomes)?data.outcomes:[]
  const branchHandles=data.type==='DECISION'
    ? [...outcomes.map((outcome,index)=>({id:`outcome:${outcome.id||index}`,label:outcome.label||`Outcome ${index+1}`})),{id:'default',label:data.defaultOutcomeLabel||'Default Outcome'}]
    : data.type==='LOOP'
      ? [{id:'body',label:'For Each'},{id:'default',label:'After Last'}]
      : []
  return <div className={`b2-rf-node ${data.selected?'is-selected':''}`} onDoubleClick={data.onOpen}>
    <Handle type="target" position={Position.Top}/>
    <div className="b2-rf-title" title={(String(data.type||'').replaceAll('_',' ')+' · '+String(data.apiName||''))}><b>{data.label}</b><span className="b2-rf-info">ⓘ</span></div>
    {branchHandles.length?branchHandles.map((handle,index)=><Handle key={handle.id} id={handle.id} type="source" position={Position.Bottom} title={handle.label} style={{left:`${((index+1)/(branchHandles.length+1))*100}%`}}/>):<Handle id="default" type="source" position={Position.Bottom}/>}
    {data.canFault?<Handle id="fault" type="source" position={Position.Right}/>:null}
  </div>
}

const nodeTypes={flowNode:FlowNode,flowStart:FlowStart,flowEnd:FlowEnd}

function persistentEdgesOnly(edges=[]) {
  return edges.filter(edge=>edge.source!==START_ID&&edge.target!==END_ID&&edge.target!==START_ID&&edge.source!==END_ID)
}

export default function Builder2GraphCanvas({nodes,edges,onNodesChangeExternal,onEdgesChangeExternal,onSelect,onOpen,onDropElement}) {
  const [instance,setInstance]=useState(null)
  const initialNodes=useMemo(()=>{
    const body=nodes.map((n,i)=>({
      id:n.id,
      type:'flowNode',
      position:n.position||{x:280+(i%3)*220,y:120+Math.floor(i/3)*150},
      data:{label:n.label,type:n.type,apiName:n.apiName,selected:false,onOpen:()=>onOpen?.(n.id),outcomes:n.config?.outcomes||[],defaultOutcomeLabel:n.config?.defaultOutcomeLabel||'Default Outcome',canFault:['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','ACTION','SUBFLOW'].includes(n.type)}
    }))
    const first=body[0]?.position||{x:280,y:120}
    const last=body[body.length-1]?.position||first
    return [
      {id:START_ID,type:'flowStart',position:{x:first.x+35,y:20},draggable:false,selectable:false,data:{}},
      ...body,
      {id:END_ID,type:'flowEnd',position:{x:last.x+50,y:last.y+140},draggable:false,selectable:false,data:{}},
    ]
  },[nodes,onOpen])

  const displayEdges=useMemo(()=>{
    const saved=Array.isArray(edges)?edges:[]
    const scaffold=[]
    if(nodes.length){
      scaffold.push({id:'__start_edge__',source:START_ID,target:nodes[0].id,type:'smoothstep',deletable:false,selectable:false})
      scaffold.push({id:'__end_edge__',source:nodes[nodes.length-1].id,target:END_ID,type:'smoothstep',deletable:false,selectable:false})
    }else{
      scaffold.push({id:'__empty_edge__',source:START_ID,target:END_ID,type:'smoothstep',deletable:false,selectable:false})
    }
    return [...scaffold,...saved.map(e=>({...e,type:'smoothstep',label:e.label||'',animated:e.kind==='fault'}))]
  },[edges,nodes])

  const [rfNodes,setRfNodes,onNodesChange]=useNodesState(initialNodes)
  const [rfEdges,setRfEdges,onEdgesChange]=useEdgesState(displayEdges)

  useEffect(()=>{setRfNodes(initialNodes)},[initialNodes,setRfNodes])
  useEffect(()=>{setRfEdges(displayEdges)},[displayEdges,setRfEdges])

  const connect=useCallback(params=>{
    if([START_ID,END_ID].includes(params.target)||[START_ID,END_ID].includes(params.source))return
    const kind=params.sourceHandle==='fault'?'fault':String(params.sourceHandle||'').startsWith('outcome:')?'outcome':params.sourceHandle==='body'?'loop':'normal'
    const edge={...params,id:`${params.source}:${params.sourceHandle||'default'}:${params.target}:${Date.now()}`,kind,label:kind==='fault'?'Fault':kind==='outcome'?'Outcome':kind==='loop'?'For Each':''}
    setRfEdges(es=>{
      const next=addEdge({...edge,type:'smoothstep'},es)
      onEdgesChangeExternal?.(persistentEdgesOnly(next).map(({id,source,target,sourceHandle,targetHandle,kind,label})=>({id,source,target,sourceHandle,targetHandle,kind,label})))
      return next
    })
  },[setRfEdges,onEdgesChangeExternal])

  const nodeChange=useCallback(changes=>{
    const filtered=changes.filter(change=>![START_ID,END_ID].includes(change.id))
    onNodesChange(filtered)
    queueMicrotask(()=>{
      const positions=Object.fromEntries(rfNodes.filter(n=>![START_ID,END_ID].includes(n.id)).map(n=>[n.id,n.position]))
      onNodesChangeExternal?.(positions)
    })
  },[onNodesChange,rfNodes,onNodesChangeExternal])

  const edgeChange=useCallback(changes=>{
    onEdgesChange(changes)
    queueMicrotask(()=>setRfEdges(current=>{
      onEdgesChangeExternal?.(persistentEdgesOnly(current).map(({id,source,target,sourceHandle,targetHandle,kind,label})=>({id,source,target,sourceHandle,targetHandle,kind,label})))
      return current
    }))
  },[onEdgesChange,setRfEdges,onEdgesChangeExternal])

  const onDragOver=useCallback(event=>{event.preventDefault();event.dataTransfer.dropEffect='move'},[])
  const onDrop=useCallback(event=>{event.preventDefault();const raw=event.dataTransfer.getData('application/oneengine-flow-element');if(!raw||!instance)return;try{const definition=JSON.parse(raw);const position=instance.screenToFlowPosition({x:event.clientX,y:event.clientY});onDropElement?.(definition,position)}catch{}},[instance,onDropElement])
  return <div className="b2-rf-canvas" onDragOver={onDragOver} onDrop={onDrop}>
    <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onInit={setInstance} onNodesChange={nodeChange} onEdgesChange={edgeChange} onConnect={connect} onNodeClick={(_,n)=>{if(![START_ID,END_ID].includes(n.id))onSelect?.(n.id)}} fitView deleteKeyCode={['Backspace','Delete']} multiSelectionKeyCode="Shift">
      <Background/>
      <Controls showInteractive/>
    </ReactFlow>
  </div>
}
