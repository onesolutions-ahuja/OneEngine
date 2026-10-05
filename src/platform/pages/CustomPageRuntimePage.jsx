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
export default function CustomPageRuntimePage({ pageKey }) {
  const [page,setPage]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [formAction,setFormAction]=useState(null);
  const [navigationContext,setNavigationContext]=useState(null);
  useEffect(()=>{
    let live=true;setError("");
    Promise.all([apiRequest(`/api/platform/runtime/pages/${encodeURIComponent(pageKey||"")}`),loadSessionPermissions().catch(()=>null),apiRequest("/api/platform/runtime/navigation-targets").catch(()=>null)])
      .then(([pageResponse,permissionState,targetResponse])=>{if(!live)return;if(!pageResponse?.success)throw new Error(pageResponse?.message||"Page not found");setPage(pageResponse.data);setNavigationContext(buildNavigationContext({permissionState,objectPages:targetResponse?.success?targetResponse.data?.objectPages||[]:[],customPages:targetResponse?.success?targetResponse.data?.customPages||[]:[]}));})
      .catch((err)=>{if(live)setError(err?.message||"Unable to load page");});
    return()=>{live=false;};
  },[pageKey]);
  const execute=async({node,record=null})=>{
    const interaction=node?.interaction||{};
    if(interaction.type==="none"||interaction.type==="component")return;
    if(interaction.type==="navigate"){
      const resolved=interaction.navigationTarget?resolveNavigationTarget(interaction.navigationTarget,{...(navigationContext||{}),currentRecordId:record?.id||record?.record_id||null}):null;
      const route=resolved?.ok?resolved.route:(interaction.navigateTo?.startsWith("/")?interaction.navigateTo:null);
      if(route){window.history.pushState(null,"",route);window.dispatchEvent(new PopStateEvent("popstate"));return;}
      setError(resolved?.message||"This navigation target is no longer available.");return;
    }
    if(interaction.type==="form_layout"){if(!interaction.formLayoutId){setError("This form layout is no longer available.");return;}setFormAction({layoutId:interaction.formLayoutId,presentation:interaction.formPresentation||"screen_modal",record});return;}
    if(!["workflow","action"].includes(interaction.type))return;
    try{
      setBusy(true);setError("");
      const objectKey=node?.collection?.objectKey||null;
      const response=await apiRequest("/api/platform/runtime/page-interactions/execute",{method:"POST",body:JSON.stringify({...interaction,objectKey,recordId:record?.id||null})});
      if(!response?.success)throw new Error(response?.message||"Unable to execute page action");
    }catch(err){setError(err?.message||"Unable to execute page action");}
    finally{setBusy(false);}
  };
  if(error&&!page)return <div className="onepos-empty">{error}</div>;
  if(!page)return <div className="onepos-empty">Loading page…</div>;
  const definition=normalizeCustomPageTree(page.definition||{});
  return <section className="onepos-page space-y-4">
    <div className="onepos-page-header"><div><h1 className="onepos-page-title">{page.label||page.page_key}</h1>{page.description?<p className="onepos-page-subtitle">{page.description}</p>:null}</div></div>
    {error?<div className="onepos-alert onepos-alert-error">{error}</div>:null}
    {busy?<div className="text-xs opacity-70">Running action…</div>:null}
    <CustomPageRenderer definition={definition} device="desktop" onRecordClick={({record,node})=>execute({record,node})} onButtonClick={(node)=>execute({node})}/>
    {formAction?<FormLayoutModal action={formAction} onClose={()=>setFormAction(null)} onSaved={()=>{}}/>:null}
  </section>;
}
