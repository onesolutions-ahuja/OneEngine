import { useEffect,useMemo,useState } from 'react'
import { apiRequest } from '../../../services/api'

export default function GPTBuilderAnalyticsPanel({workflowId,elements,onClose}){
 const [runs,setRuns]=useState([]),[loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;if(!workflowId){setLoading(false);return()=>{live=false}}apiRequest('/api/platform/workflow-runs?limit=200').then(r=>{if(!live)return;setRuns((Array.isArray(r?.data)?r.data:[]).filter(x=>String(x.workflow_id||x.workflowId)===String(workflowId)))}).catch(()=>{if(live)setRuns([])}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[workflowId])
 const analytics=useMemo(()=>elements.map(element=>{const steps=runs.flatMap(run=>Array.isArray(run.steps)?run.steps:[]).filter(step=>String(step.step_id||step.action_id||step.element_id)===String(element.id));const durations=steps.map(s=>Number(s.duration_ms||0)).filter(Number.isFinite);return {id:element.id,label:element.label||element.apiName,totalRuns:steps.length,averageDuration:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length):0,completed:steps.filter(s=>String(s.status).toUpperCase()==='COMPLETED').length,failed:steps.filter(s=>String(s.status).toUpperCase()==='FAILED').length}}),[elements,runs])
 return <aside className="gptb-edit-history gptb-analytics-panel"><header><div><strong>Analytics</strong><small>Performance by Flow element</small></div><button className="gptb-icon-button" onClick={onClose}>×</button></header><div className="gptb-edit-history-body">{loading?<p>Loading analytics…</p>:analytics.map(item=><section key={item.id}><b>{item.label}</b><dl><div><dt>Average Duration</dt><dd>{item.averageDuration} ms</dd></div><div><dt>Total Runs</dt><dd>{item.totalRuns}</dd></div><div><dt>Completed</dt><dd>{item.completed}</dd></div><div><dt>Failed</dt><dd>{item.failed}</dd></div></dl></section>)}</div></aside>
}
export function analyticsForElement(analytics,id){return analytics?.[id]||null}
