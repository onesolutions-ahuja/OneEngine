import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, CircleAlert, PackageCheck, Search, ShoppingBag, Store, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import {
  filterStorePackages,
  installedPackageVersionState,
  packageDependencies,
  storefrontStatus,
} from './oneStoreModel'
import { appIconUrl, applyDefaultAppIcon, readMarketplaceCache, resolveAppOpenRoute, writeMarketplaceCache } from '../../utils/appMarketplace'

const STATUS_LABELS={
  AVAILABLE:'Available',INSTALLED:'Installed',INACTIVE:'Inactive',UPDATE_AVAILABLE:'Update available',
  LICENCE_REQUIRED:'Requires licence',NOT_INSTALLABLE:'Not installable',NOT_AVAILABLE:'Not available',
}

export default function OneStorePopover({onClose,onOpenRoute,initialPackages=[],initialSelectedPackageKey='',onPackagesChange,canManagePackages=false}){
  const [packages,setPackages]=useState(()=>Array.isArray(initialPackages)&&initialPackages.length?initialPackages:readMarketplaceCache())
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [query,setQuery]=useState('')
  const [view,setView]=useState('All')
  const [category,setCategory]=useState('All')
  const [selectedKey,setSelectedKey]=useState(()=>String(initialSelectedPackageKey||''))
  const [workingKey,setWorkingKey]=useState('')
  const [recordActions,setRecordActions]=useState([])
  const [actionsLoading,setActionsLoading]=useState(false)
  const canManage=canManagePackages

  const load=async({refreshCatalogue=false}={})=>{
    try{
      setLoading(true);setError('')
      const catalogue=await (refreshCatalogue||!packages.length?apiRequest('/api/packages/marketplace'):Promise.resolve({success:true,data:packages}))
      if(!catalogue?.success)throw new Error(catalogue?.message||'Unable to load oneStore')
      const nextPackages=Array.isArray(catalogue.data)?catalogue.data:[]
      setPackages(nextPackages)
      writeMarketplaceCache(nextPackages)
      onPackagesChange?.(nextPackages)
      return nextPackages
    }catch(err){
      const cached=refreshCatalogue?[]:readMarketplaceCache()
      if(cached.length){
        setPackages(cached)
        onPackagesChange?.(cached)
      }else{
        setPackages([])
        onPackagesChange?.([])
      }
      setError(err?.message||'Unable to load the live oneStore catalogue')
      return cached
    }finally{setLoading(false)}
  }
  useEffect(()=>{void load({refreshCatalogue:true})},[])
  useEffect(()=>{if(Array.isArray(initialPackages)&&initialPackages.length){setPackages(initialPackages);writeMarketplaceCache(initialPackages)}},[initialPackages])
  useEffect(()=>{setSelectedKey(String(initialSelectedPackageKey||''))},[initialSelectedPackageKey])
  const hasPending=packages.some(item=>['QUEUED','UPDATING'].includes(String(item.company_installation?.update_status||'').toUpperCase()))
  useEffect(()=>{
    if(!hasPending)return undefined
    const timer=setInterval(()=>{if(!document.hidden)void load()},15000)
    return()=>clearInterval(timer)
  },[hasPending])

  const categories=useMemo(()=>['All',...new Set(packages.filter(i=>i.visible===true&&i.system_only!==true).map(i=>i.category||'Uncategorised').sort())],[packages])
  const shown=useMemo(()=>filterStorePackages(packages,{search:query,category,view}),[packages,query,category,view])
  useEffect(()=>{
    if(!shown.length){if(selectedKey)setSelectedKey('');return}
    if(!shown.some(item=>item.package_key===selectedKey))setSelectedKey(shown[0].package_key)
  },[shown,selectedKey])
  const selected=shown.find(i=>i.package_key===selectedKey)||packages.find(i=>i.package_key===selectedKey)||shown[0]||null
  const dependencies=selected?packageDependencies(selected):[]
  const installedKeys=new Set(packages.filter(i=>['INSTALLED','ACTIVE','INACTIVE'].includes(String(i?.tenant_app_status||'').toUpperCase())).map(i=>i.package_key))

  useEffect(()=>{
    let live=true
    const recordId=selected?.tenant_app_record_id
    if(!recordId){setRecordActions([]);setActionsLoading(false);return()=>{live=false}}
    setActionsLoading(true)
    apiRequest(`/api/platform/objects/tenant_app/records/${encodeURIComponent(recordId)}/buttons?placement=onestore_action`)
      .then(response=>{if(live)setRecordActions(Array.isArray(response?.data)?response.data:[])})
      .catch(err=>{if(live){setRecordActions([]);setError(err?.message||'Unable to load app actions')}})
      .finally(()=>{if(live)setActionsLoading(false)})
    return()=>{live=false}
  },[selected?.tenant_app_record_id,selected?.tenant_app_status,selected?.tenant_app_licence_status,selected?.tenant_app_update_status])

  const run=async(item,button)=>{
    if(!item?.tenant_app_record_id||!button?.button_key||!canManage)return
    try{
      setWorkingKey(item.package_key);setError('');setNotice('')
      const r=await apiRequest(
        `/api/platform/objects/tenant_app/records/${encodeURIComponent(item.tenant_app_record_id)}/buttons/${encodeURIComponent(button.button_key)}/execute`,
        {method:'POST',timeoutMs:60000,body:JSON.stringify({})}
      )
      if(r?.success===false)throw new Error(r?.message||'Unable to run app action')
      setNotice(`${button.label} completed for ${item.name}.`)
      await load({refreshCatalogue:true})
    }catch(err){setError(err?.message||'App action failed')}
    finally{setWorkingKey('')}
  }

  const hasTenantInstall=['INSTALLED','ACTIVE','INACTIVE'].includes(String(selected?.tenant_app_status||'').toUpperCase())
  const version=hasTenantInstall?installedPackageVersionState(selected):null
  const openInstalled=()=>{
    if(String(selected?.tenant_app_status||'').toUpperCase()!=='ACTIVE')return
    const route=resolveAppOpenRoute(selected)
    onOpenRoute?.(route)
    onClose?.()
  }

  return <div className="mac-popover onestore-popover">
    <header className="onestore-popover-header">
      <div><strong>oneStore</strong><span>Discover and manage company apps</span></div>
      <button type="button" aria-label="Close oneStore" onClick={onClose}><X size={15}/></button>
    </header>
    <label className="onestore-search"><Search size={13}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps"/></label>
    {error?<div className="onestore-message is-error"><CircleAlert size={13}/><span>{error}</span><button type="button" onClick={()=>load({refreshCatalogue:true})}>Retry</button></div>:null}
    {notice?<div className="onestore-message is-success"><Check size={13}/>{notice}</div>:null}

    <div className="onestore-filters">
      {['All','Installed','Available'].map(v=><button key={v} className={view===v?'is-active':''} onClick={()=>setView(v)}>{v}</button>)}
      <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(v=><option key={v}>{v}</option>)}</select>
    </div>

    <div className="onestore-layout">
      <section className="onestore-list">
        {loading?<div className="module-state compact">Loading apps…</div>:!shown.length?<div className="module-state compact">No apps match.</div>:shown.map(item=>{
          const icon=appIconUrl(item),status=storefrontStatus(item)
          return <button key={item.package_key} className={selected?.package_key===item.package_key?'is-selected':''} onClick={()=>setSelectedKey(item.package_key)}>
            <span className="onestore-app-icon">{icon?<img src={icon} alt="" onError={applyDefaultAppIcon}/>:<ShoppingBag size={17}/>}</span>
            <span><strong>{item.name}</strong><small>{item.category||'App'} · {STATUS_LABELS[status]}</small></span>
            <ChevronRight size={13}/>
          </button>
        })}
      </section>

      <aside className="onestore-detail">
        {!selected?<div className="module-state compact">Select an app.</div>:<>
          <div className="onestore-detail-title">
            <span className="onestore-app-icon large">{appIconUrl(selected)?<img src={appIconUrl(selected)} alt="" onError={applyDefaultAppIcon}/>:<Store size={20}/>}</span>
            <div><strong>{selected.name}</strong><span>{selected.publisher||'onePOS'}</span></div>
          </div>
          <p>{selected.description||'No description available.'}</p>
          <div className="onestore-badges"><span>{STATUS_LABELS[storefrontStatus(selected)]}</span><span>{selected.category||'Uncategorised'}</span></div>
          <dl><div><dt>Version</dt><dd>{selected.version||'—'}</dd></div><div><dt>Package</dt><dd>{selected.package_type||'APPLICATION'}</dd></div><div><dt>Licence</dt><dd>{selected.licence_mode==='TECHNICAL'||selected.licensed?'Included':'Required'}</dd></div><div><dt>Availability</dt><dd>{selected.billable===false?'Included':selected.licensed?'Available':'Requires licence'}</dd></div></dl>
          {version?<div className="onestore-version"><span>Installed v{version.installedVersion}</span><span>Latest v{version.latestVersion}</span><strong>{version.label}</strong></div>:null}
          {dependencies.length?<div className="onestore-deps"><b>Dependencies</b>{dependencies.map(dep=><div key={dep.key}><span>{packages.find(p=>p.package_key===dep.key)?.name||dep.key}</span><small>{installedKeys.has(dep.key)?'Included':'Installed automatically'}{dep.optional?' · Optional':''}</small></div>)}</div>:null}
          {workingKey===selected.package_key?<progress className="onestore-action-progress" aria-label="App action in progress"/>:null}
          <div className="onestore-actions">
            {String(selected?.tenant_app_status||'').toUpperCase()==='ACTIVE'?<button onClick={openInstalled}>Open</button>:null}
            {actionsLoading?<button disabled>Loading actions…</button>:recordActions.map((button,index)=><button
              key={button.id||button.button_key}
              className={index===recordActions.length-1?'module-primary-button':''}
              disabled={!canManage||workingKey===selected.package_key}
              onClick={()=>run(selected,button)}
            >{workingKey===selected.package_key?'Working…':button.label}</button>)}
          </div>
          {!canManage&&recordActions.length?<small className="onestore-no-permission">Package management permission is required.</small>:null}
        </>}
      </aside>
    </div>
  </div>
}
