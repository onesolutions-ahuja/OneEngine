import { useEffect, useState } from "react";
import { apiRequest, loadSessionPermissions } from "../../services/api.js";
import CustomPageRenderer from "../../components/platform/CustomPageRenderer.jsx";
import { normalizeCustomPageTree } from "../../pages/settings/Platform/customPageTree.js";
import FormRenderer from "../../pages/settings/Platform/FormRenderer.jsx";
import { buildNavigationContext, resolveNavigationTarget } from "../../utils/navigationTargets.js";

function FormLayoutModal({ action, onClose, onSaved }) {
  const [runtime,setRuntime]=useState(null);
  const [error,setError]=useState("");
  const record=action?.record||null;
  const recordId=record?.id||record?.record_id||null;
  useEffect(()=>{let live=true;apiRequest(`/api/platform/runtime/layouts/${encodeURIComponent(action.layoutId)}`).then((response)=>{if(!live)return;if(!response?.success)throw new Error(response?.message||"Unable to load form layout");setRuntime(response.data);}).catch((err)=>{if(live)setError(err?.message||"Unable to load form layout");});return()=>{live=false;};},[action.layoutId]);
  const save=async(values)=>{const objectKey=runtime?.object?.objectKey;if(!objectKey)throw new Error("Form object is unavailable");const editing=Boolean(recordId);const response=await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/records${editing?`/${encodeURIComponent(recordId)}`:""}`,{method:editing?"PUT":"POST",body:JSON.stringify({data:values})});if(response?.success===false)throw Object.assign(new Error(response?.message||"Unable to save record"),{payload:response});onSaved?.(response?.data||response?.record||null);onClose?.();};
  const presentation=action?.presentation||"screen_modal";
  const shell=presentation==="full_screen"?"fixed inset-0 z-[80] bg-white overflow-auto p-6":presentation==="compact_popup"?"fixed right-6 bottom-6 z-[80] w-[min(520px,calc(100vw-48px))] max-h-[75vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl":"fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4";
  const panel=presentation==="screen_modal"?"w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-5 shadow-2xl":"";
  return <div className={shell} role="dialog" aria-modal="true"><div className={panel}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">{runtime?.layout?.name||"Form"}</h2><button type="button" className="onepos-btn onepos-btn-secondary" onClick={onClose}>Close</button></div>{error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}{!runtime&&!error?<div className="onepos-empty">Loading form…</div>:null}{runtime?<FormRenderer definition={runtime.layout?.definition||{}} fields={runtime.fields||[]} initialValues={record||{}} mode={recordId?"edit":"create"} onSubmit={save} embedded />:null}</div></div>;
}
function findScreenWait(value) {
  if (!value) return null;
  if (Array.isArray(value)) { for (const item of value) { const found=findScreenWait(item); if(found)return found; } return null; }
  if (typeof value !== "object") return null;
  if (value.screenSessionId && value.screen) return value;
  for (const nested of Object.values(value)) { const found=findScreenWait(nested); if(found)return found; }
  return null;
}
function ScreenFlowModal({ action, onClose, onComplete }) {
  const [session,setSession]=useState(action?.session||null),[values,setValues]=useState(action?.session?.values||{}),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const screen=session?.screen||{};
  useEffect(()=>setValues(session?.values||{}),[session?.screenSessionId]);
  const submit=async(navigation)=>{
    if(!session?.screenSessionId)return;
    try{setBusy(true);setError("");const response=await apiRequest(`/api/platform/flow-sessions/${encodeURIComponent(session.screenSessionId)}/submit`,{method:"POST",body:JSON.stringify({navigation,values})});if(!response?.success)throw new Error(response?.message||"Unable to continue Screen Flow");const next=response.data||{};if(next.status==="WAITING"&&next.screenSessionId){setSession(next);return;}if(next.status==="PAUSED"){onClose?.();return;}onComplete?.(next);onClose?.();}catch(err){setError(err?.message||"Unable to continue Screen Flow");}finally{setBusy(false);}
  };
  const components=Array.isArray(screen.components)?screen.components:[];
  const field=(component)=>{
    const name=component.name;if(!name)return null;const type=String(component.type||"TEXT").toUpperCase();const common={id:name,value:values[name]??component.defaultValue??"",disabled:busy||component.disabled===true,onChange:(e)=>setValues(v=>({...v,[name]:e.target.type==="checkbox"?e.target.checked:e.target.value}))};
    if(["DISPLAY_TEXT","TEXT_BLOCK","RICH_TEXT"].includes(type))return <div key={name} className="text-sm text-slate-700">{component.text||component.label||""}</div>;
    if(["CHECKBOX","TOGGLE"].includes(type))return <label key={name} className="flex items-center gap-2 text-sm"><input {...common} type="checkbox" checked={Boolean(values[name]??component.defaultValue??false)}/>{component.label||name}</label>;
    if(["SELECT","PICKLIST","RADIO"].includes(type)){const options=Array.isArray(component.options)?component.options:[];return <label key={name} className="block space-y-1 text-sm"><span>{component.label||name}{component.required?" *":""}</span><select {...common} className="w-full rounded-lg border border-slate-200 px-3 py-2"><option value="">Select…</option>{options.map((o,i)=><option key={i} value={o.value??o.label}>{o.label??o.value}</option>)}</select></label>;}
    const htmlType=type==="EMAIL"?"email":type==="NUMBER"||type==="CURRENCY"?"number":type==="DATE"?"date":type==="DATETIME"?"datetime-local":"text";
    return <label key={name} className="block space-y-1 text-sm"><span>{component.label||name}{component.required?" *":""}</span><input {...common} type={htmlType} required={component.required===true} className="w-full rounded-lg border border-slate-200 px-3 py-2"/></label>;
  };
  const full=action?.presentation==="full_screen",embedded=action?.presentation==="embedded";
  return <div className={embedded?"my-4 rounded-2xl border border-slate-200 bg-white p-4":full?"fixed inset-0 z-[90] overflow-auto bg-white p-6":"fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4"} role={embedded?"region":"dialog"} aria-modal={embedded?undefined:"true"}><div className={embedded?"":full?"mx-auto max-w-4xl":"w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-5 shadow-2xl"}><header className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">{screen.label||"Screen Flow"}</h2>{screen.description?<p className="text-xs text-slate-500">{screen.description}</p>:null}</div><button type="button" className="onepos-btn onepos-btn-secondary" onClick={onClose}>Close</button></header>{error?<div className="onepos-alert onepos-alert-error mb-3">{error}</div>:null}<div className="grid grid-cols-12 gap-3">{components.map(c=><div key={c.name||c.label} className="col-span-12" style={{gridColumn:`span ${Math.min(12,Math.max(1,Number(c.width)||12))} / span ${Math.min(12,Math.max(1,Number(c.width)||12))}`}}>{field(c)}</div>)}</div>{screen.showFooter!==false?<footer className="mt-5 flex justify-end gap-2">{screen.allowBack?<button disabled={busy} className="onepos-btn onepos-btn-secondary" onClick={()=>submit("BACK")}>{screen.previousLabel||"Previous"}</button>:null}{screen.allowPause?<button disabled={busy} className="onepos-btn onepos-btn-secondary" onClick={()=>submit("PAUSE")}>{screen.pauseLabel||"Pause"}</button>:null}{screen.allowNext!==false?<button disabled={busy} className="onepos-btn onepos-btn-primary" onClick={()=>submit("NEXT")}>{busy?"Working…":screen.nextLabel||"Next"}</button>:null}{screen.allowFinish?<button disabled={busy} className="onepos-btn onepos-btn-primary" onClick={()=>submit("FINISH")}>{busy?"Working…":screen.finishLabel||"Finish"}</button>:null}</footer>:null}</div></div>;
}
export default function CustomPageRuntimePage({ pageKey }) {
  const [page,setPage]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [formAction,setFormAction]=useState(null);
  const [screenFlowAction,setScreenFlowAction]=useState(null);
  const [navigationContext,setNavigationContext]=useState(null);
  useEffect(()=>{
    let live=true;setError("");
    Promise.all([apiRequest(`/api/platform/runtime/pages/${encodeURIComponent(pageKey||"")}`),loadSessionPermissions().catch(()=>null),apiRequest("/api/platform/runtime/navigation-targets").catch(()=>null)])
      .then(([pageResponse,permissionState,targetResponse])=>{if(!live)return;if(!pageResponse?.success)throw new Error(pageResponse?.message||"Page not found");setPage(pageResponse.data);setNavigationContext(buildNavigationContext({permissionState,objectPages:targetResponse?.success?targetResponse.data?.objectPages||[]:[],customPages:targetResponse?.success?targetResponse.data?.customPages||[]:[]}));})
      .catch((err)=>{if(live)setError(err?.message||"Unable to load page");});
    return()=>{live=false;};
  },[pageKey]);
  const execute=async({node,record=null,eventName="click",value=undefined})=>{
    const interaction=node?.interactions?.[eventName] || (eventName==="click" ? node?.interaction : null) || {};
    if(interaction.type==="none"||interaction.type==="component")return;
    if(interaction.type==="navigate"){
      const resolved=interaction.navigationTarget?resolveNavigationTarget(interaction.navigationTarget,{...(navigationContext||{}),currentRecordId:record?.id||record?.record_id||null}):null;
      const route=resolved?.ok?resolved.route:(interaction.navigateTo?.startsWith("/")?interaction.navigateTo:null);
      if(route){window.history.pushState(null,"",route);window.dispatchEvent(new PopStateEvent("popstate"));return;}
      setError(resolved?.message||"This navigation target is no longer available.");return;
    }
    if(interaction.type==="form_layout"){if(!interaction.formLayoutId){setError("This form layout is no longer available.");return;}setFormAction({layoutId:interaction.formLayoutId,presentation:interaction.formPresentation||"screen_modal",record});return;}
    if(interaction.type==="screen_flow"){
      if(!interaction.workflowUuid){setError("This Screen Flow is no longer available.");return;}
      try{setBusy(true);setError("");const response=await apiRequest(`/api/platform/rules/${encodeURIComponent(interaction.workflowUuid)}/run`,{method:"POST",body:JSON.stringify({recordId:record?.id||null,inputs:interaction.inputs||{}})});if(!response?.success)throw new Error(response?.message||"Unable to start Screen Flow");const wait=findScreenWait(response.data);if(wait?.screenSessionId){setScreenFlowAction({session:wait,presentation:interaction.screenPresentation||"screen_modal",nodeId:node?.id});return;}window.dispatchEvent(new CustomEvent("oneengine:page-interaction-complete",{detail:{nodeId:node?.id||null,interactionType:"screen_flow",runId:response.data?.runId||null,status:response.data?.status||"COMPLETED",output:response.data?.variables||response.data,outputTarget:interaction.outputTarget||null}}));}catch(err){setError(err?.message||"Unable to start Screen Flow");}finally{setBusy(false);}return;
    }
    if(!["workflow","action"].includes(interaction.type))return;
    try{
      setBusy(true);setError("");
      const objectKey=node?.collection?.objectKey||null;
      const response=await apiRequest("/api/platform/runtime/page-interactions/execute",{method:"POST",body:JSON.stringify({...interaction,objectKey,recordId:record?.id||null,eventName,eventValue:value,pageContext:{params:Object.fromEntries(new URLSearchParams(window.location.search).entries()),variables:Object.fromEntries((normalizeCustomPageTree(page?.definition||{}).resources?.variables||[]).map((variable)=>[variable.key,variable.defaultValue??null])),components:{[node?.id]:{value,selectedRecord:record||null}},flows:{}}})});
      if(!response?.success)throw new Error(response?.message||"Unable to execute page action");
      const result=response?.data||{};
      const output=result?.result??result?.results??result;
      window.dispatchEvent(new CustomEvent("oneengine:page-interaction-complete",{detail:{nodeId:node?.id||null,interactionType:interaction.type,runId:result?.runId||response?.workflowRunId||null,status:result?.status||"COMPLETED",output,outputTarget:interaction.outputTarget||null}}));
      if(eventName!=="success" && node?.interactions?.success?.type && node.interactions.success.type!=="none") await execute({node,record,eventName:"success",value:output});
    }catch(err){setError(err?.message||"Unable to execute page action");if(eventName!=="error" && node?.interactions?.error?.type && node.interactions.error.type!=="none") await execute({node,record,eventName:"error",value:{message:err?.message||"Action failed"}});}
    finally{setBusy(false);}
  };
  if(error&&!page)return <div className="onepos-empty">{error}</div>;
  if(!page)return <div className="onepos-empty">Loading page…</div>;
  const definition=normalizeCustomPageTree(page.definition||{});
  const pageContext={
    params:Object.fromEntries(new URLSearchParams(window.location.search).entries()),
    variables:Object.fromEntries((definition.resources?.variables||[]).map((variable)=>[variable.key,variable.defaultValue??null])),
    components:{},
    flows:{},
  };
  return <section className="onepos-page space-y-4">
    <div className="onepos-page-header"><div><h1 className="onepos-page-title">{page.label||page.page_key}</h1>{page.description?<p className="onepos-page-subtitle">{page.description}</p>:null}</div></div>
    {error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}
    {busy?<div className="text-xs opacity-70">Running action…</div>:null}
    <CustomPageRenderer definition={definition} device="desktop" pageContext={pageContext} onRecordClick={({record,node})=>execute({record,node,eventName:"row_click"})} onButtonClick={(node)=>execute({node,eventName:"click"})} onEvent={({eventName,node,value,record})=>execute({node,record,eventName,value})}/>
    {formAction?<FormLayoutModal action={formAction} onClose={()=>setFormAction(null)} onSaved={()=>{}}/>:null}
    {screenFlowAction?<ScreenFlowModal action={screenFlowAction} onClose={()=>setScreenFlowAction(null)} onComplete={(result)=>window.dispatchEvent(new CustomEvent("oneengine:page-interaction-complete",{detail:{nodeId:screenFlowAction.nodeId,interactionType:"screen_flow",runId:result?.runId||null,status:result?.status||"COMPLETED",output:result?.variables||result}}))}/>:null}
  </section>;
}
