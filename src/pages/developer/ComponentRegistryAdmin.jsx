import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
const blank={key:"",label:"",category:"custom",kind:"custom",componentPath:"",cssPath:"",active:true,supportedBuilders:["PAGE"],supportedContexts:["page"],configurable:[]};
export default function ComponentRegistryAdmin(){
 const [rows,setRows]=useState([]),[form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=async()=>{try{const r=await apiRequest("/api/platform/component-registrations");setRows(Array.isArray(r?.data)?r.data:[])}catch(e){setError(e?.message||"Unable to load components")}};
 useEffect(()=>{load()},[]);
 const save=async(e)=>{e.preventDefault();setBusy(true);setError("");try{await apiRequest("/api/platform/component-registrations",{method:"POST",body:JSON.stringify(form)});setForm(blank);await load()}catch(x){setError(x?.message||"Unable to save component")}finally{setBusy(false)}};
 return <div className="settings-content"><div className="settings-page-header"><div><h2>Components</h2><p>Register components from <code>src/components/custom</code>. JSX and CSS are separate files.</p></div></div>
 {error?<div className="settings-state-card settings-state-card--error">{error}</div>:null}
 <form onSubmit={save} className="settings-card" style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
 <label>Name<input required value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/></label><label>Key<input required placeholder="advanced_calendar" value={form.key} onChange={e=>setForm({...form,key:e.target.value})}/></label>
 <label>JSX path<input required placeholder="AdvancedCalendar/AdvancedCalendar.jsx" value={form.componentPath} onChange={e=>setForm({...form,componentPath:e.target.value})}/></label><label>CSS path<input placeholder="AdvancedCalendar/AdvancedCalendar.css" value={form.cssPath} onChange={e=>setForm({...form,cssPath:e.target.value})}/></label>
 <label>Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>Active</label>
 <div style={{gridColumn:"1/-1"}}><button className="onepos-btn onepos-btn-primary" disabled={busy}>{busy?"Saving…":"Register component"}</button></div></form>
 <div className="settings-card" style={{marginTop:16,overflowX:"auto"}}><table className="onepos-table"><thead><tr><th>Name</th><th>Key</th><th>JSX</th><th>CSS</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id||r.key}><td>{r.label}</td><td><code>{r.key}</code></td><td><code>{r.componentPath}</code></td><td><code>{r.cssPath||"—"}</code></td><td>{r.active?"Active":"Inactive"}</td></tr>)}</tbody></table></div></div>;
}