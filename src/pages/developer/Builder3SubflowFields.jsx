import {useEffect,useState} from 'react'
import {apiRequest} from '../../services/api'
import SchemaFields from './Builder3SchemaFields'
export default function SubflowFields({config,onChange,ResourceControl}) {
  const [flows,setFlows]=useState([]),[search,setSearch]=useState(''),[error,setError]=useState('')
  useEffect(()=>{let live=true;apiRequest('/api/platform/rules').then(r=>{if(live)setFlows((r.data||[]).filter(f=>(f.runtime_active||f.active)&&f.action?.flowType==='autolaunched'))}).catch(e=>setError(e.message));return()=>{live=false}},[])
  const flow=flows.find(f=>f.id===config.flow)
  const inputs=(flow?.action?.inputContract||flow?.action?.resources?.filter(r=>r.availableInput).map(r=>({name:r.apiName,label:r.label,type:r.dataType,required:false}))||[])
  const outputs=(flow?.action?.outputContract||flow?.action?.resources?.filter(r=>r.availableOutput).map(r=>({name:r.apiName,label:r.label,type:r.dataType}))||[])
  const schema=contract=>({type:'object',properties:Object.fromEntries(contract.map(r=>[r.name,{type:['Number','number'].includes(r.type)?'number':['Boolean','boolean'].includes(r.type)?'boolean':'string',title:r.label||r.name}])),required:contract.filter(r=>r.required).map(r=>r.name)})
  return <><label>Search Flows<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search active autolaunched flows…"/></label><label>Referenced Flow<select value={config.flow||''} onChange={e=>onChange({flow:e.target.value,inputs:{},outputs:{}})}><option value="">Select a flow…</option>{flows.filter(f=>!search||`${f.name} ${f.action.apiName}`.toLowerCase().includes(search.toLowerCase())).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>{error?<p role="alert" className="b3-error">{error}</p>:null}{flow?<><h3>Set Input Values</h3>{inputs.length?<SchemaFields schema={schema(inputs)} value={config.inputs||{}} onChange={inputs=>onChange({inputs})} ResourceControl={ResourceControl}/>:<p className="b3-help">This flow declares no input variables.</p>}<h3>Store Output Values</h3>{outputs.length?outputs.map(r=><label key={r.name}>{r.label||r.name}<ResourceControl value={config.outputs?.[r.name]||''} onChange={v=>onChange({outputs:{...config.outputs,[r.name]:v}})}/></label>):<p className="b3-help">This flow declares no output variables.</p>}</>:null}</>
}
