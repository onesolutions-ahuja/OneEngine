import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function FlowNode({data}) {
  const start=data.kind==='start', end=data.kind==='end'
  return <div className={`b2-rf-node ${data.selected?'is-selected':''} ${start?'is-start':''} ${end?'is-end':''}`} onDoubleClick={start||end?undefined:data.onOpen} title={data.type||data.label}>
    {!start?<Handle type="target" position={Position.Top}/>:null}
    <div className="b2-rf-title"><b>{data.label}</b>{!start&&!end?<small>{String(data.type||'').replaceAll('_',' ')}</small>:null}</div>
    {!end?(data.type==='DECISION'?<>
      <Handle id="outcome" type="source" position={Position.Bottom} style={{left:'35%'}}/>
      <Handle id="default" type="source" position={Position.Bottom} style={{left:'65%'}}/>
    </>:<Handle id="default" type="source" position={Position.Bottom}/>):null}
    {data.canFault?<Handle id="fault" type="source" position={Position.Right}/>:null}
  </div>
}

const nodeTypes={flowNode:FlowNode}

export default function Builder2GraphCanvas({nodes,edges,onNodesChangeExternal,onEdgesChangeExternal,onSelect,onOpen,onDropElement}) {
  const canvasRef=useRef(null)
  const initialNodes=useMemo(()=>{
    const real=nodes.map((n,i)=>({
      id:n.id,
      type:'flowNode',
      position:n.position||{x:280+(i%3)*220,y:180+Math.floor(i/3)*140},
      data:{label:n.label,type:n.type,selected:false,onOpen:()=>onOpen?.(n.id),canFault:['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','ACTION','SUBFLOW'].includes(n.type)}
    }))
    const maxY=real.length?Math.max(...real.map(n=>n.position.y)):180
    return [
      {id:'__start__',type:'flowNode',position:{x:280,y:30},draggable:false,data:{kind:'start',label:'Start',type:'START',selected:false,canFault:false}},
      ...real,
      {id:'__end__',type:'flowNode',position:{x:280,y:maxY+180},draggable:false,data:{kind:'end',label:'End',type:'END',selected:false,canFault:false}},
    ]
  },[nodes,onOpen])
  const normalizedEdges=useMemo(()=>edges.map(e=>({...e,type:'smoothstep',label:e.label||'',animated:e.kind==='fault'})),[edges])
  const [rfNodes,setRfNodes,onNodesChange]=useNodesState(initialNodes)
  const [rfEdges,setRfEdges,onEdgesChange]=useEdgesState(normalizedEdges)
  useEffect(()=>{setRfNodes(initialNodes)},[initialNodes,setRfNodes])
  useEffect(()=>{setRfEdges(normalizedEdges)},[normalizedEdges,setRfEdges])
  const emitEdges=useCallback(next=>onEdgesChangeExternal?.(next.map(({id,source,target,sourceHandle,targetHandle,kind,label,data})=>({id,source,target,sourceHandle,targetHandle,kind:kind||data?.kind||'normal',label:label||''}))),[onEdgesChangeExternal])
  const connect=useCallback(params=>{
    const kind=params.sourceHandle==='fault'?'fault':params.sourceHandle==='outcome'?'outcome':'normal'
    const edge={...params,id:`${params.source}:${params.sourceHandle||'default'}:${params.target}:${Date.now()}`,kind,label:kind==='fault'?'Fault':kind==='outcome'?'Outcome':''}
    setRfEdges(es=>{const next=addEdge({...edge,type:'smoothstep'},es);emitEdges(next);return next})
  },[setRfEdges,emitEdges])
  const nodeChange=useCallback(changes=>{
    onNodesChange(changes)
    queueMicrotask(()=>{
      setRfNodes(current=>{
        const positions=Object.fromEntries(current.filter(n=>!n.id.startsWith('__')).map(n=>[n.id,n.position]))
        onNodesChangeExternal?.(positions)
        return current
      })
    })
  },[onNodesChange,setRfNodes,onNodesChangeExternal])
  const onDrop=event=>{
    event.preventDefault()
    const raw=event.dataTransfer.getData('application/x-oneengine-builder2-element')
    if(!raw||!onDropElement)return
    try{
      const definition=JSON.parse(raw)
      const rect=canvasRef.current?.getBoundingClientRect()
      const position={x:Math.max(20,event.clientX-(rect?.left||0)-100),y:Math.max(20,event.clientY-(rect?.top||0)-30)}
      onDropElement(definition,position)
    }catch{}
  }
  return <div ref={canvasRef} className="b2-rf-canvas" onDrop={onDrop} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy'}}>
    <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onNodesChange={nodeChange} onEdgesChange={changes=>{onEdgesChange(changes);queueMicrotask(()=>setRfEdges(current=>{emitEdges(current);return current}))}} onConnect={connect} onNodeClick={(_,n)=>{if(!n.id.startsWith('__'))onSelect?.(n.id)}} fitView deleteKeyCode={['Backspace','Delete']} multiSelectionKeyCode="Shift" minZoom={0.35} maxZoom={1.5}>
      <Background/>
      <Controls showInteractive/>
    </ReactFlow>
  </div>
}
