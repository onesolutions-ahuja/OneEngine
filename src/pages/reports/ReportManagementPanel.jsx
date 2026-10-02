import { useEffect, useMemo, useState } from "react";
import { getStoredUser } from "../../services/api.js";
import {
  createReportFolder,
  createReportSubscription,
  deleteReportSubscription,
  getReportFolders,
  getReportHistory,
  getReportNavigation,
  getReportSubscriptions,
  moveReportToFolder,
  setReportFavourite,
  updateReportFolder,
} from "../../services/customReports.js";

const muted = { color: "var(--onepos-text-muted)" };

export default function ReportManagementPanel({
  reports = [],
  currentReportId = null,
  canManage = false,
  users = [],
  roles = [],
  publicGroups = [],
  currentDefinition = null,
  onOpenReport,
  onRunReport,
  onDuplicateReport,
  onArchiveReport,
  onRefresh,
}) {
  const [folders, setFolders] = useState([]);
  const [navigation, setNavigation] = useState({ favourites: [], recent: [] });
  const [subscriptions, setSubscriptions] = useState([]);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderShared, setNewFolderShared] = useState(false);
  const [folderEditorId, setFolderEditorId] = useState("");
  const [folderAccess, setFolderAccess] = useState([]);
  const [subscriptionDraft, setSubscriptionDraft] = useState({ cadence:"DAILY",hour:8,minute:0,weekday:1,monthday:1,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC",delivery:["IN_APP"],runAsUserId:"",recipientPrincipals:[],conditions:[{type:"ALWAYS",field:null,value:null}],attachment:{enabled:false,view:"FORMATTED",format:"XLSX"} });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadManagement = async () => {
    try {
      const [folderResult, navResult] = await Promise.all([getReportFolders(), getReportNavigation()]);
      setFolders(folderResult?.success ? folderResult.data || [] : []);
      setNavigation(navResult?.success ? navResult.data || { favourites: [], recent: [] } : { favourites: [], recent: [] });
    } catch (err) {
      setError(err?.message || "Unable to load report management");
    }
  };

  useEffect(() => { void loadManagement(); }, []);

  useEffect(() => {
    let live = true;
    if (!currentReportId) {
      setSubscriptions([]);
      setHistory([]);
      return () => { live = false; };
    }
    Promise.all([
      getReportSubscriptions(currentReportId).catch(() => null),
      getReportHistory(currentReportId).catch(() => null),
    ]).then(([subscriptionResult, historyResult]) => {
      if (!live) return;
      setSubscriptions(subscriptionResult?.success ? subscriptionResult.data || [] : []);
      setHistory(historyResult?.success ? historyResult.data || [] : []);
    });
    return () => { live = false; };
  }, [currentReportId]);

  const subscriptionUnsupported = currentDefinition?.format === "joined" || currentDefinition?.historicalTrend?.enabled === true;
  const favouriteIds = useMemo(() => new Set((navigation.favourites || []).map((item) => String(item.id))), [navigation.favourites]);
  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (folderFilter === "__none__" && report.folder_id) return false;
      if (folderFilter && folderFilter !== "__none__" && String(report.folder_id || "") !== String(folderFilter)) return false;
      if (!q) return true;
      return [report.name, report.description, report.created_by_name].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [reports, query, folderFilter]);

  const toggleFavourite = async (report) => {
    try {
      setBusy(`fav:${report.id}`);
      await setReportFavourite(report.id, !favouriteIds.has(String(report.id)));
      await loadManagement();
    } catch (err) {
      setError(err?.message || "Unable to update favourite");
    } finally {
      setBusy("");
    }
  };

  const move = async (reportId, folderId) => {
    try {
      setBusy(`move:${reportId}`);
      await moveReportToFolder(reportId, folderId || null);
      await Promise.all([loadManagement(), onRefresh?.()]);
    } catch (err) {
      setError(err?.message || "Unable to move report");
    } finally {
      setBusy("");
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      setBusy("new-folder");
      const sessionUser = getStoredUser();
      const companyId = sessionUser?.companyId || sessionUser?.company_id || "";
      if (newFolderShared && !companyId) throw new Error("Company context is unavailable");
      await createReportFolder({
        name,
        visibility: newFolderShared ? "SHARED" : "PRIVATE",
        access: newFolderShared ? [{ principalType: "COMPANY", principalId: String(companyId), accessLevel: "VIEW" }] : [],
      });
      setNewFolderName("");
      setNewFolderShared(false);
      await loadManagement();
    } catch (err) {
      setError(err?.message || "Unable to create folder");
    } finally {
      setBusy("");
    }
  };

  const subscribe = async () => {
    if (!currentReportId) return;
    try {
      setBusy("subscribe");
      const response = await createReportSubscription(currentReportId, { active:true, ...subscriptionDraft });
      if (!response?.success) throw new Error(response?.message || "Unable to create subscription");
      const list = await getReportSubscriptions(currentReportId);
      setSubscriptions(list?.success ? list.data || [] : []);
    } catch (err) {
      setError(err?.message || "Unable to create subscription");
    } finally {
      setBusy("");
    }
  };

  const principalOptions = [
    ...users.map((item)=>({type:"USER",id:String(item.id),label:item.full_name||item.username||"User"})),
    ...roles.map((item)=>({type:"ROLE",id:String(item.id),label:item.name||"Role"})),
    ...publicGroups.map((item)=>({type:"PUBLIC_GROUP",id:String(item.id),label:item.name||"Public Group"})),
  ];
  const selectedFolder = folders.find((folder)=>String(folder.id)===String(folderEditorId)) || null;
  const openFolderEditor = (folderId) => {
    const folder = folders.find((item)=>String(item.id)===String(folderId));
    setFolderEditorId(folderId||"");
    setFolderAccess(Array.isArray(folder?.access)?folder.access:[]);
  };
  const saveFolderAccess = async () => {
    if (!selectedFolder) return;
    try {
      setBusy("folder-sharing");
      const response = await updateReportFolder(selectedFolder.id,{
        name:selectedFolder.name,
        description:selectedFolder.description||"",
        visibility:folderAccess.length?"SHARED":"PRIVATE",
        access:folderAccess,
      });
      if(!response?.success) throw new Error(response?.message||"Unable to update folder sharing");
      await loadManagement();
      openFolderEditor(selectedFolder.id);
    } catch(err){setError(err?.message||"Unable to update folder sharing");}
    finally{setBusy("");}
  };

  const removeSubscription = async (subscriptionId) => {
    try {
      setBusy(`subscription:${subscriptionId}`);
      await deleteReportSubscription(currentReportId, subscriptionId);
      const response = await getReportSubscriptions(currentReportId);
      setSubscriptions(response?.success ? response.data || [] : []);
    } catch (err) {
      setError(err?.message || "Unable to delete subscription");
    } finally {
      setBusy("");
    }
  };

  return <div className="space-y-4">
    {error ? <div className="onepos-alert onepos-alert-error">{error}</div> : null}

    <section className="onepos-card onepos-card-body space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="onepos-label flex-1 min-w-[220px]">Search reports
          <input className="onepos-input mt-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, description or owner" />
        </label>
        <label className="onepos-label min-w-[200px]">Folder
          <select className="onepos-input mt-1" value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)}>
            <option value="">All folders</option>
            <option value="__none__">Unfiled</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label>
        {canManage ? <div className="flex gap-2 items-end">
          <div>
            <label className="onepos-label">New folder
              <input className="onepos-input mt-1" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" />
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={newFolderShared} onChange={(e) => setNewFolderShared(e.target.checked)} />Share with company (view)</label>
          </div>
          <button type="button" className="onepos-btn onepos-btn-secondary" disabled={busy === "new-folder"} onClick={createFolder}>Create</button>
        </div> : null}
      </div>

      {canManage&&folders.length?<div className="rounded-xl border p-3 space-y-3" style={{borderColor:"var(--onepos-border)"}}>
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] items-end">
          <label className="onepos-label">Folder sharing<select className="onepos-input mt-1" value={folderEditorId} onChange={(e)=>openFolderEditor(e.target.value)}><option value="">Select folder</option>{folders.map((folder)=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          {selectedFolder?<div className="text-xs" style={muted}>Assign users, roles or public groups. VIEW can run reports, EDIT can move/edit content, MANAGE can change folder access.</div>:<div/>}
          {selectedFolder?<button type="button" className="onepos-btn onepos-btn-secondary" disabled={busy==="folder-sharing"} onClick={saveFolderAccess}>Save sharing</button>:null}
        </div>
        {selectedFolder?<div className="space-y-2">
          {folderAccess.map((entry,index)=>{const key=`${entry.principalType}:${entry.principalId}`;return <div key={key||index} className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
            <select className="onepos-input" value={key} onChange={(e)=>{const [principalType,principalId]=e.target.value.split(":");setFolderAccess((current)=>current.map((item,i)=>i===index?{...item,principalType,principalId}:item));}}><option value="">Select principal</option>{principalOptions.map((option)=><option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.type.replace("_"," ")} · {option.label}</option>)}</select>
            <select className="onepos-input" value={entry.accessLevel||"VIEW"} onChange={(e)=>setFolderAccess((current)=>current.map((item,i)=>i===index?{...item,accessLevel:e.target.value}:item))}><option value="VIEW">View</option><option value="EDIT">Edit</option><option value="MANAGE">Manage</option></select>
            <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>setFolderAccess((current)=>current.filter((_,i)=>i!==index))}>Remove</button>
          </div>})}
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={!principalOptions.length} onClick={()=>{const first=principalOptions[0];if(first)setFolderAccess((current)=>[...current,{principalType:first.type,principalId:first.id,accessLevel:"VIEW"}]);}}>Add access</button>
        </div>:null}
      </div>:null}

      {(navigation.favourites || []).length || (navigation.recent || []).length ? <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase mb-2" style={muted}>Favourites</div>
          <div className="flex flex-wrap gap-2">{(navigation.favourites || []).slice(0,8).map((report) => <button key={report.id} type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>{report.name}</button>)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase mb-2" style={muted}>Recent</div>
          <div className="flex flex-wrap gap-2">{(navigation.recent || []).slice(0,8).map((report) => <button key={report.id} type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>{report.name}</button>)}</div>
        </div>
      </div> : null}
    </section>

    <section className="onepos-card overflow-hidden">
      <div className="onepos-card-header"><span className="onepos-card-title">Available reports</span></div>
      {filteredReports.length ? filteredReports.map((report) => {
        const fav = favouriteIds.has(String(report.id));
        const folderValue = report.folder_id || "";
        return <div key={report.id} className="p-4 border-b last:border-b-0 flex flex-wrap items-center gap-3">
          <button type="button" className="text-lg leading-none" aria-label={fav ? "Remove favourite" : "Add favourite"} disabled={busy === `fav:${report.id}`} onClick={() => toggleFavourite(report)}>{fav ? "★" : "☆"}</button>
          <div className="min-w-[220px] flex-1">
            <div className="font-medium">{report.name}</div>
            <div className="text-xs" style={muted}>{report.description || "Report"}{report.created_by_name ? ` · Created by ${report.created_by_name}` : ""}</div>
          </div>
          <select className="onepos-input w-auto min-w-[150px]" value={folderValue} disabled={busy === `move:${report.id}`} onChange={(e) => move(report.id, e.target.value)}>
            <option value="">Unfiled</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-primary" onClick={() => onRunReport?.(report.id)}>Run</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onOpenReport?.(report)}>Edit</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onDuplicateReport?.(report)}>Duplicate</button>
          <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={() => onArchiveReport?.(report)}>Archive</button>
        </div>;
      }) : <div className="onepos-empty">No matching reports.</div>}
    </section>

    {currentReportId ? <section className="onepos-card onepos-card-body space-y-4">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Subscriptions</h3><button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={busy === "subscribe" || subscriptionUnsupported} onClick={subscribe}>Add subscription</button></div>{subscriptionUnsupported?<div className="text-xs" style={muted}>{currentDefinition?.format==="joined"?"Subscriptions are unavailable for joined reports.":"Subscriptions are unavailable while historical trending is enabled."}</div>:null}
          <div className="rounded-lg border p-3 space-y-2" style={{borderColor:"var(--onepos-border)"}}>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="onepos-label">Cadence<select className="onepos-input mt-1" value={subscriptionDraft.cadence} onChange={(e)=>setSubscriptionDraft((d)=>({...d,cadence:e.target.value}))}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
              <label className="onepos-label">Hour<input className="onepos-input mt-1" type="number" min="0" max="23" value={subscriptionDraft.hour} onChange={(e)=>setSubscriptionDraft((d)=>({...d,hour:Number(e.target.value)}))}/></label>
              <label className="onepos-label">Minute<input className="onepos-input mt-1" type="number" min="0" max="59" value={subscriptionDraft.minute} onChange={(e)=>setSubscriptionDraft((d)=>({...d,minute:Number(e.target.value)}))}/></label>
              {subscriptionDraft.cadence==="WEEKLY"?<label className="onepos-label">Weekday<select className="onepos-input mt-1" value={subscriptionDraft.weekday} onChange={(e)=>setSubscriptionDraft((d)=>({...d,weekday:Number(e.target.value)}))}>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((label,index)=><option key={label} value={index}>{label}</option>)}</select></label>:null}
              {subscriptionDraft.cadence==="MONTHLY"?<label className="onepos-label">Day of month<input className="onepos-input mt-1" type="number" min="1" max="28" value={subscriptionDraft.monthday} onChange={(e)=>setSubscriptionDraft((d)=>({...d,monthday:Number(e.target.value)}))}/></label>:null}
              <label className="onepos-label">Timezone<input className="onepos-input mt-1" value={subscriptionDraft.timezone} onChange={(e)=>setSubscriptionDraft((d)=>({...d,timezone:e.target.value}))}/></label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={subscriptionDraft.delivery.includes("IN_APP")} onChange={(e)=>setSubscriptionDraft((d)=>({...d,delivery:e.target.checked?[...new Set([...d.delivery,"IN_APP"])]:d.delivery.filter((x)=>x!=="IN_APP")}))}/>In-app</label><label className="flex items-center gap-2"><input type="checkbox" checked={subscriptionDraft.delivery.includes("EMAIL")} onChange={(e)=>setSubscriptionDraft((d)=>({...d,delivery:e.target.checked?[...new Set([...d.delivery,"EMAIL"])]:d.delivery.filter((x)=>x!=="EMAIL")}))}/>Email</label></div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="onepos-label">Running user<select className="onepos-input mt-1" value={subscriptionDraft.runAsUserId||""} onChange={(e)=>setSubscriptionDraft((d)=>({...d,runAsUserId:e.target.value}))}><option value="">Subscription owner</option>{users.map((user)=><option key={user.id} value={user.id}>{user.full_name||user.username||user.email||"User"}</option>)}</select></label>
              <label className="onepos-label">Recipients<select multiple className="onepos-input mt-1 min-h-[90px]" value={(subscriptionDraft.recipientPrincipals||[]).map((item)=>`${item.principalType}:${item.principalId}`)} onChange={(e)=>{const values=Array.from(e.target.selectedOptions).map((option)=>option.value);setSubscriptionDraft((d)=>({...d,recipientPrincipals:values.map((value)=>{const [principalType,principalId]=value.split(":");return {principalType,principalId};})}));}}>{principalOptions.map((option)=><option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>{option.type.replace("_"," ")} · {option.label}</option>)}</select></label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="onepos-label">Conditions (all must match, max 5)</span>{(subscriptionDraft.conditions||[]).length<5?<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>setSubscriptionDraft((d)=>({...d,conditions:[...(d.conditions||[]).filter((item)=>item.type!=="ALWAYS"),{type:"ROW_COUNT_GT",field:null,value:0}]}))}>Add condition</button>:null}</div>
              {(subscriptionDraft.conditions||[]).map((condition,index)=><div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                <select className="onepos-input" value={condition.type||"ALWAYS"} onChange={(e)=>setSubscriptionDraft((d)=>({...d,conditions:(d.conditions||[]).map((item,i)=>i===index?{...item,type:e.target.value}:item)}))}><option value="ALWAYS">Always</option><option value="ROW_COUNT_GT">Row count greater than</option><option value="ROW_COUNT_EQ">Row count equals</option><option value="VALUE_GT">Value greater than</option><option value="VALUE_GTE">Value greater/equal</option><option value="VALUE_LT">Value less than</option><option value="VALUE_LTE">Value less/equal</option></select>
                {String(condition.type||"").startsWith("VALUE_")?<select className="onepos-input" value={condition.field||""} onChange={(e)=>setSubscriptionDraft((d)=>({...d,conditions:(d.conditions||[]).map((item,i)=>i===index?{...item,field:e.target.value}:item)}))}><option value="">Select field</option>{(currentDefinition?.fields||[]).map((field)=><option key={field} value={field}>{field}</option>)}</select>:<span/>}
                {condition.type!=="ALWAYS"?<input className="onepos-input" type="number" value={condition.value??0} onChange={(e)=>setSubscriptionDraft((d)=>({...d,conditions:(d.conditions||[]).map((item,i)=>i===index?{...item,value:Number(e.target.value)}:item)}))}/>:<span/>}
                {(subscriptionDraft.conditions||[]).length>1?<button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" onClick={()=>setSubscriptionDraft((d)=>({...d,conditions:d.conditions.filter((_,i)=>i!==index)}))}>Remove</button>:<span/>}
              </div>)}
            </div>
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={subscriptionDraft.attachment?.enabled===true} onChange={(e)=>setSubscriptionDraft((d)=>({...d,attachment:{...(d.attachment||{}),enabled:e.target.checked}}))}/>Attach report</label>
              {subscriptionDraft.attachment?.enabled?<select className="onepos-input w-auto" value={subscriptionDraft.attachment?.view||"FORMATTED"} onChange={(e)=>setSubscriptionDraft((d)=>({...d,attachment:{enabled:true,view:e.target.value,format:e.target.value==="DETAILS"?"CSV":"XLSX"}}))}><option value="FORMATTED">Formatted XLSX</option><option value="DETAILS">Details CSV</option></select>:null}
            </div>
          </div>
          {subscriptions.length ? subscriptions.map((item) => <div key={item.id} className="rounded-lg border p-2 flex items-center gap-2" style={{borderColor:"var(--onepos-border)"}}>
            <div className="flex-1 text-sm"><strong>{item.definition?.cadence || "DAILY"}</strong><span className="block text-xs" style={muted}>{item.definition?.timezone || ""} · {item.last_status || "Not run yet"}</span></div>
            <button type="button" className="onepos-btn onepos-btn-sm onepos-btn-secondary" disabled={busy === `subscription:${item.id}`} onClick={() => removeSubscription(item.id)}>Remove</button>
          </div>) : <div className="text-sm" style={muted}>No subscriptions yet.</div>}
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Snapshot history</h3>
          {history.length ? history.slice(0,8).map((item) => <div key={item.id} className="rounded-lg border p-2 text-sm" style={{borderColor:"var(--onepos-border)"}}><strong>{item.period_key || new Date(item.captured_at).toLocaleDateString()}</strong><span className="block text-xs" style={muted}>{item.row_count} rows · {new Date(item.captured_at).toLocaleString()}</span></div>) : <div className="text-sm" style={muted}>No snapshots captured yet.</div>}
        </div>
      </div>
    </section> : null}
  </div>;
}
