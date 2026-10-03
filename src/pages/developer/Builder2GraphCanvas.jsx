import { useCallback, useEffect, useMemo } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, addEdge, useEdgesState, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function FlowNode({data}) {
  return <div className={`b2-rf-node ${data.selected?'is-selected':''}`} onDoubleClick={data.onOpen}>
    <Handle type="target" position={Position.Top}/>
    <div className="b2-rf-title"><b>{data.label}</b><small>{String(data.type||'').replaceAll('_',' ')}</small></div>
    {data.type==='DECISION'?<>
      <Handle id="outcome" type="source" position={Position.Bottom} style={{left:'35%'}}/>
      <Handle id="default" type="source" position={Position.Bottom} style={{left:'65%'}}/>
    </>:<Handle id="default" type="source" position={Position.Bottom}/>}
    {data.canFault?<Handle id="fault" type="source" position={Position.Right}/>:null}
  </div>
}

const nodeTypes={flowNode:FlowNode}

export default function Builder2GraphCanvas({nodes,edges,onNodesChangeExternal,onEdgesChangeExternal,onSelect,onOpen}) {
  const initialNodes=useMemo(()=>nodes.map((n,i)=>({
    id:n.id,
    type:'flowNode',
    position:n.position||{x:280+(i%3)*220,y:80+Math.floor(i/3)*140},
    data:{label:n.label,type:n.type,selected:false,onOpen:()=>onOpen?.(n.id),canFault:['GET_RECORDS','CREATE_RECORDS','UPDATE_RECORDS','DELETE_RECORDS','ACTION','SUBFLOW'].includes(n.type)}
  })),[nodes,onOpen])
  const [rfNodes,setRfNodes,onNodesChange]=useNodesState(initialNodes)
  const [rfEdges,setRfEdges,onEdgesChange]=useEdgesState(edges.map(e=>({...e,type:'smoothstep',label:e.label||'',animated:e.kind==='fault'})))
  useEffect(()=>{setRfNodes(initialNodes)},[initialNodes,setRfNodes])
  useEffect(()=>{setRfEdges(edges.map(e=>({...e,type:'smoothstep',label:e.label||'',animated:e.kind==='fault'})))},[edges,setRfEdges])
  const connect=useCallback(params=>{
    const kind=params.sourceHandle==='fault'?'fault':params.sourceHandle==='outcome'?'outcome':'normal'
    const edge={...params,id:`${params.source}:${params.sourceHandle||'default'}:${params.target}:${Date.now()}`,kind,label:kind==='fault'?'Fault':kind==='outcome'?'Outcome':''}
    setRfEdges(es=>{const next=addEdge({...edge,type:'smoothstep'},es);onEdgesChangeExternal?.(next.map(({id,source,target,sourceHandle,targetHandle,kind,label})=>({id,source,target,sourceHandle,targetHandle,kind,label})));return next})
  },[setRfEdges,onEdgesChangeExternal])
  const nodeChange=useCallback(changes=>{
    onNodesChange(changes)
    queueMicrotask(()=>{
      const positions=Object.fromEntries(rfNodes.map(n=>[n.id,n.position]))
      onNodesChangeExternal?.(positions)
    })
  },[onNodesChange,rfNodes,onNodesChangeExternal])
  return <div className="b2-rf-canvas">
    <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} onNodesChange={nodeChange} onEdgesChange={changes=>{onEdgesChange(changes);queueMicrotask(()=>setRfEdges(current=>{onEdgesChangeExternal?.(current.map(({id,source,target,sourceHandle,targetHandle,data})=>({id,source,target,sourceHandle,targetHandle,...(data?.kind?{kind:data.kind}:{})})));return current}))}} onConnect={connect} onNodeClick={(_,n)=>onSelect?.(n.id)} fitView deleteKeyCode={['Backspace','Delete']} multiSelectionKeyCode="Shift">
      <Background/>
      <Controls showInteractive/>
    </ReactFlow>
  </div>
}
